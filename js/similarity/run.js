// One similarity run, as plain data in and out: the steps the server's resident
// worker drives (with its SQLite reads, shards and streaming around them) and the
// browser runs whole (`fullRun`). Pure: no database, no threads, no clock but the
// one passed in.
import { buildIndex, linked } from './profiles.js';
import { buildPostings, topNeighbours } from './candidates.js';
import { blend } from './blend.js';
import { albumArtistId } from '../credits-graph.js';
import { ATLAS_DEFAULTS } from './atlas-config.js';
import { encodeReasons } from './reasons.js';
import { computeBaselines, compileBaselines } from './baselines.js';
import { layoutAtlas, atlasEdges } from './atlas-layout.js';
import { trackSubgenres, nodeSubgenre, Affinity, buildColour } from './atlas-colour.js';
import { buildLikeness } from './likeness.js';

const NO_COLOUR = () => ({ genreOf: new Map(), counts: new Map() });

/**
 * The run's state from the engine's stores (`sources`): the entity index, its
 * candidate postings, every play count (to order a focus's tracks, never a
 * signal) and, unless `colour` is false, each track's merged subgenre and every
 * subgenre's track count for the atlas colour. `atlas` overrides ATLAS_DEFAULTS.
 * `keepFacts` keeps the sources' facts on the state (`facts`).
 * @returns {{ index, postings, plays: Map<string, number>, colour: { genreOf, counts }, atlas, facts }}
 */
export function prepare(sources, cfg, { keepFacts = false, atlas = {}, colour = true } = {}) {
  const index = buildIndex(sources, cfg);
  const postings = buildPostings(index);
  const atlasCfg = { ...ATLAS_DEFAULTS, ...atlas };
  // Unified plays, Rekordbox's play_count, Music.app's played count once imported.
  const plays = new Map();
  const addPlays = (id, k) => { if (k > 0) plays.set(`track:${id}`, (plays.get(`track:${id}`) || 0) + k); };
  for (const e of sources.playEvents || []) if (e?.kind === 'play' && e.trackId != null) addPlays(e.trackId, 1);
  for (const t of sources.tracks || []) if (t?.id != null) addPlays(t.id, (Number(t.play_count) || 0) + (Number(t.apple_music_play_count) || 0));
  return {
    index, postings, plays, atlas: atlasCfg,
    colour: colour ? trackSubgenres(trackGenres(index), atlasCfg.colourMinTracks) : NO_COLOUR(),
    facts: keepFacts ? sources.facts ?? null : null,
  };
}

/** Each track's genre as its display name, for the colour's canonical subgenres (tags are never rewritten). */
export function* trackGenres(index) {
  for (const p of index.entities.values()) {
    if (p.type !== 'track') continue;
    const key = p.genres.keys().next().value;
    if (key != null) yield [p.id, index.names.genres.get(key)];
  }
}

/** Every entity's name and type: [id, { name, type }][]. */
export const entityNames = (state) => [...state.index.entities.values()].map((p) => [p.id, { name: p.name, type: p.type }]);

/**
 * Scored rows for `ids` ({ entityId, ...neighbour, reasons: encoded }), against the
 * compiled `baselines`. With `onRows`, handed over every `batchRows` rows instead of
 * kept (and [] is returned). `onProgress(done)` every `cfg.progressEvery` ids.
 */
export function scoreIds(state, ids, cfg, { baselines = null, onProgress = () => {}, onRows = null, batchRows = 20000 } = {}) {
  let rows = [];
  ids.forEach((id, i) => {
    for (const n of topNeighbours(id, state.index, state.postings, cfg, { baselines })) rows.push({ entityId: id, ...n, reasons: encodeReasons(n.reasons) });
    if (onRows && rows.length >= batchRows) { onRows(rows); rows = []; }
    if ((i + 1) % cfg.progressEvery === 0) onProgress(i + 1);
  });
  if (onRows) { if (rows.length) onRows(rows); return []; }
  return rows;
}

/**
 * What a full run keeps of its rows besides writing them: the rows between atlas
 * types (all the layout reads) and the track-to-track scores summed per pair of
 * subgenres (the colour's affinity). `add(rows)` per batch.
 */
export function collectRows(state) {
  const types = new Set(state.atlas.types), atlasRows = [], affinity = new Affinity([...state.colour.counts.keys()].sort());
  const { index, colour } = state;
  return {
    atlasRows, affinity,
    add(batch) {
      for (const r of batch) {
        if (types.has(r.type) && types.has(index.entities.get(r.entityId)?.type)) atlasRows.push(r);
        else if (r.type === 'track' && r.entityId.startsWith('track:')) affinity.add(colour.genreOf.get(r.entityId), colour.genreOf.get(r.id), r.score);
      }
    },
  };
}

// This run's colour: one hue per subgenre from its `affinity`, aligned to the
// previous run's plane, with the `held` hues kept (Map name -> hue), and each
// atlas node's main subgenre and share (`nodes`: [[id, subgenre, share]]).
// Null, logged, when it fails.
function atlasColour(state, main, affinity, held, previousPlane) {
  try {
    const { subgenres, seam } = buildColour({ genreOf: state.colour.genreOf, counts: state.colour.counts, affinity, previous: previousPlane, held, k: state.atlas.colourK });
    if (!Number.isFinite(seam) || subgenres.some((g) => ![g.hue, g.r, g.x, g.y].every(Number.isFinite))) throw new Error('non-finite hue');
    return { subgenres, seam, nodes: [...main].map(([id, m]) => [id, m.subgenre, m.share]) };
  } catch (err) {
    console.error('[similarity] atlas colour failed:', err?.message || String(err));
    return null;
  }
}

/**
 * The atlas for a full run: every artist, label and tag, laid out over its top
 * neighbours from this run's `rows` (only the rows between atlas types are
 * needed), each with its main subgenre, and one hue per subgenre from this
 * run's `affinity`. The colour is worked out before the layout and never
 * depends on it. A layout failure never fails the run: it comes back as `error`
 * (with `colour`, which the server colours the previous positions with). A colour
 * failure never fails the layout: it is logged and every node is grey.
 * `previous` is the last layout ({ positions: Map id -> { x, y }, version }); one
 * from this layout version warm-starts the layout, one from another is laid out
 * cold, unless `hold`: then its positions stay where they are (only new nodes are
 * placed) and its version is kept. `previousPlane` aligns the colour plane;
 * `hues` are the held hues ([[name, hue]]). `now` is the layout's clock.
 */
export function buildAtlas(state, rows, affinity, { previous = { positions: new Map(), version: null }, previousPlane = null, hold = false, hues = [], now } = {}) {
  let coloured = null;
  try {
    const ATLAS = state.atlas, types = new Set(ATLAS.types), main = new Map(), nodes = [];
    for (const p of state.index.entities.values()) {
      if (!types.has(p.type)) continue;
      nodes.push({ id: p.id, weight: p.trackIds.size });
      const m = nodeSubgenre(p.trackIds, state.colour.genreOf);
      if (m) main.set(p.id, m);
    }
    coloured = atlasColour(state, main, affinity, new Map(hues), previousPlane);
    const edges = atlasEdges(rows, new Set(nodes.map((n) => n.id)), ATLAS.neighbours);
    const groupOf = new Map([...main].map(([id, m]) => [id, m.subgenre]));
    const current = previous.version === ATLAS.layoutVersion;
    const held = hold && !current && previous.positions.size > 0;
    const out = layoutAtlas({ nodes, edges, previous: current || held ? previous.positions : new Map(), cfg: ATLAS, groupOf, hold: held, now });
    const of = coloured ? main : new Map();
    const positions = out.positions.map((p) => [p.id, p.x, p.y, p.weight, of.get(p.id)?.subgenre ?? null, of.get(p.id)?.share ?? null]);
    return { positions, subgenres: coloured?.subgenres ?? [], seam: coloured?.seam ?? null, layoutVersion: held ? previous.version : ATLAS.layoutVersion,
      scale: out.scale, held, ms: out.ms, warm: out.warm, error: null };
  } catch (err) { return { positions: null, colour: coloured, error: err?.message || String(err) }; }
}

/** Why `a` and `b` score as they do, against the compiled `baselines`; null when either is unknown. */
export function why(state, a, b, cfg, baselines) {
  const { index } = state;
  const pa = index.entities.get(a), pb = index.entities.get(b);
  if (!pa || !pb) return null;
  const r = blend(pa, pb, { index, cfg, baselines });
  const head = (p) => ({ id: p.id, type: p.type, name: p.name });
  return { a: head(pa), b: head(pb), score: r.score, reasons: r.reasons, breakdown: r.breakdown };
}

const SATELLITE_LIST_MAX = 200;
const head = (e) => ({ id: e.id, type: e.type, name: e.name });
const plain = (tid) => tid.replace(/^track:/, '');
// An entity's albums, most owned tracks first: { id, type, name, trackIds, count, subgenre },
// where trackIds are the ones the album shares with the entity.
function albumsOf(state, p) {
  const { index, colour } = state;
  const albums = new Map();
  for (const tid of p.trackIds) {
    const albumId = index.entities.get(tid)?.albumId;
    if (albumId) (albums.get(albumId) || albums.set(albumId, []).get(albumId)).push(tid);
  }
  return [...albums].map(([aid, tids]) => ({ ...head(index.entities.get(aid) || { id: aid, type: 'album', name: aid }), trackIds: tids.map(plain).sort(),
    count: tids.length, subgenre: nodeSubgenre(tids, colour.genreOf)?.subgenre ?? null }))
    .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
}

/**
 * What springs out around a focus on the atlas. Albums: the focus's albums by
 * owned track count (an album's trackIds are the ones it shares with the
 * focus). Tracks: by play count. A tag shows albums only; a track is a
 * satellite of its artist, with its artist, label and tags as `linkedIds`.
 * Each carries its merged subgenre (or null) for its colour. Null for an unknown id.
 */
export function satellites(state, id) {
  const { index, plays, colour } = state;
  const p = index.entities.get(id);
  if (!p) return null;
  const trackItem = (t) => ({ ...head(t), trackIds: [plain(t.id)], plays: plays.get(t.id) || 0, subgenre: colour.genreOf.get(t.id) ?? null });
  if (p.type === 'track') {
    const linkedIds = [];
    for (const e of index.entities.values()) if (e.type !== 'track' && e.type !== 'album' && e.trackIds.has(p.id)) linkedIds.push(e.id);
    linkedIds.sort();
    return { satellites: [trackItem(p)], linkedIds, parent: linkedIds.find((x) => x.startsWith('artist:')) || null };
  }
  const tracks = [];
  for (const tid of p.trackIds) { const t = index.entities.get(tid); if (t) tracks.push(t); }
  const albumItems = p.type === 'album' ? [] : albumsOf(state, p).slice(0, SATELLITE_LIST_MAX);
  const trackItems = p.type === 'tag' ? [] : tracks.map(trackItem)
    .sort((x, y) => y.plays - x.plays || x.name.localeCompare(y.name) || (x.id < y.id ? -1 : 1)).slice(0, SATELLITE_LIST_MAX);
  if (p.type === 'album') {
    // An album sits at its artist; what it is on (label) and carries (tags) light up with it.
    const near = new Set();
    for (const e of index.entities.values()) {
      if (e.type === 'track' || e.type === 'album') continue;
      for (const tid of p.trackIds) if (e.trackIds.has(tid)) { near.add(e); break; }
    }
    const linkedIds = [...near].filter((e) => linked(p, e, index)).map((e) => e.id).sort();
    return { satellites: trackItems, linkedIds, parent: albumArtistId(p.id, (x) => index.entities.get(x)?.type === 'artist') };
  }
  return { satellites: [...albumItems, ...trackItems], linkedIds: [], parent: null };
}

/**
 * A whole full run in one thread: prepare, the chance baselines from their fixed
 * seed, every entity scored, then the atlas with no previous layout.
 * `onProgress(done, total)` while scoring; `onStep('layout')` before the layout.
 * With `likeness`, also the tuner's likeness table (likeness.js); else null.
 * @returns {{ rows, atlas, baselineRows, baselines, names, state, likeness }}
 */
export function fullRun(sources, cfg, { onProgress = () => {}, onStep = () => {}, likeness = false, now, atlas = {} } = {}) {
  const state = prepare(sources, cfg, { atlas });
  const baselineRows = computeBaselines(state.index, cfg);
  const baselines = compileBaselines(baselineRows);
  const ids = [...state.index.entities.keys()];
  const collected = collectRows(state), rows = [];
  scoreIds(state, ids, cfg, {
    baselines,
    onProgress: (done) => onProgress(done, ids.length),
    onRows: (batch) => { collected.add(batch); for (const r of batch) rows.push(r); },
  });
  const table = likeness ? buildLikeness(state, cfg, baselines) : null;
  onStep('layout');
  const result = buildAtlas(state, collected.atlasRows, collected.affinity, { now });
  return { rows, atlas: result, baselineRows, baselines, names: entityNames(state), state, likeness: table };
}
