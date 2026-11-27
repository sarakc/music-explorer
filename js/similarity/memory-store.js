// The atlas store (bodies.js) over a run held in memory: the browser's side of
// what the server reads from similarity.db.
//   NeighbourTable = { ids: string[], offsets: Uint32Array, to: Uint32Array,
//     score: Float64Array, linked: Uint8Array, reasons: string[] }
// Entity `i`'s rows are `offsets[i]..offsets[i+1]`, strongest first (ties by
// neighbour id, as SQLite orders them); `to` indexes `ids`; reasons stay encoded.
// Scores are kept as doubles, so bodies read the same as the server's.
import { decodeReasons } from './reasons.js';

const byId = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

/** A run's rows ({ entityId, id, score, linked, reasons (encoded) }) packed into a NeighbourTable. */
export function packNeighbours(rows) {
  const set = new Set();
  for (const r of rows) { set.add(r.entityId); set.add(r.id); }
  const ids = [...set].sort(byId), at = new Map(ids.map((id, i) => [id, i]));
  const sorted = [...rows].sort((x, y) => at.get(x.entityId) - at.get(y.entityId) || y.score - x.score || byId(x.id, y.id));
  const n = sorted.length;
  const offsets = new Uint32Array(ids.length + 1), to = new Uint32Array(n), score = new Float64Array(n), linked = new Uint8Array(n), reasons = new Array(n);
  sorted.forEach((r, k) => {
    offsets[at.get(r.entityId) + 1]++;
    to[k] = at.get(r.id); score[k] = r.score; linked[k] = r.linked ? 1 : 0; reasons[k] = r.reasons;
  });
  for (let i = 0; i < ids.length; i++) offsets[i + 1] += offsets[i];
  return { ids, offsets, to, score, linked, reasons };
}

/**
 * A run's atlas (run.js buildAtlas) as the store reads it: `meta` ({ layoutRun,
 * createdAt, layoutVersion, colourRun, scale }, null when the layout failed),
 * `positions` [{ id, x, y, weight, subgenre, share }] by id, `subgenres`
 * [{ name, hue, r, tracks }] by name.
 */
export function atlasOfRun(atlas, { layoutRun = 1, createdAt = 0 } = {}) {
  if (!Array.isArray(atlas?.positions)) return { meta: null, positions: [], subgenres: [] };
  return {
    meta: { layoutRun, createdAt, layoutVersion: atlas.layoutVersion ?? null, colourRun: layoutRun, scale: atlas.scale ?? 1 },
    positions: atlas.positions.map(([id, x, y, weight, subgenre = null, share = null]) => ({ id, x, y, weight, subgenre, share })).sort((a, b) => byId(a.id, b.id)),
    subgenres: (atlas.subgenres || []).map((g) => ({ name: g.name, hue: g.hue, r: g.r, tracks: g.tracks })).sort((a, b) => byId(a.name, b.name)),
  };
}

const typeOf = (names, id) => names.get(id)?.type ?? String(id).split(':')[0];

/** An AtlasStore over `names` (Map id -> { name, type }), a NeighbourTable, an atlas (atlasOfRun) and a satellites lookup. */
export function createMemoryStore({ names, neighbours, atlas, satellites }) {
  const index = new Map(neighbours.ids.map((id, i) => [id, i]));
  // Entity `id`'s rows that pass `types` and `minScore`, strongest first, at most `limit`.
  function* rowsOf(id, { limit, types, minScore }) {
    const i = index.get(id);
    if (i === undefined) return;
    const only = Array.isArray(types) && types.length ? new Set(types) : null;
    let n = 0;
    for (let k = neighbours.offsets[i]; k < neighbours.offsets[i + 1] && n < limit; k++) {
      if (neighbours.score[k] < minScore) break;
      const to = neighbours.ids[neighbours.to[k]], type = typeOf(names, to);
      if (only && !only.has(type)) continue;
      n++;
      yield { k, id: to, type };
    }
  }
  return {
    names,
    atlasMeta: () => atlas.meta ?? null,
    atlasPositions: () => atlas.positions.map((p) => ({ ...p })),
    atlasSubgenres: () => atlas.subgenres.map((g) => ({ ...g })),
    topNeighbours(ids, { limit = 2, types = [], minScore = 0 } = {}) {
      const out = [];
      for (const a of ids) for (const r of rowsOf(a, { limit, types, minScore })) out.push({ a, b: r.id, score: neighbours.score[r.k] });
      return out;
    },
    readNeighbours(id, { limit = 50, types = null, minScore = 0 } = {}) {
      return [...rowsOf(id, { limit, types, minScore })].map((r) => ({ id: r.id, type: r.type, score: neighbours.score[r.k], linked: neighbours.linked[r.k], reasons: decodeReasons(neighbours.reasons[r.k]) }));
    },
    satellites: (id) => Promise.resolve(satellites(id)),
  };
}
