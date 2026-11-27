// Entity profiles for the similarity engine. Pure.
//
// Every entity is a bag of tracks plus outside facts: an artist, label, tag or
// album profile is the sum of its tracks' features, and a track's profile is
// the track itself, so any two entity types compare without special cases.
// Artist splitting decides membership only; it is never written back.
import { entityId, entityKey } from '../credits-graph.js';
import { splitArtist, hasSeparator } from '../artist-credits.js';
import { deriveRelations } from '../entity-relations.js';
import { resolveKey } from '../album-gap.js';
import { median, toCamelot, commonest, idf } from './math.js';
import { applyFacts } from './facts-profile.js';
import { classifyGroups } from './playlist-classifier.js';
import { groupWeight, memberResolver, rekordboxGroups } from './groups.js';

const CREDIT_BUCKETS = ['producers', 'remixers', 'engineers', 'mixers', 'main_artists'];
// `genreWords`: a track's subgenre, Discogs styles and the tags that name a genre, each once
// (honest similarity spec 1.2). `genres` stays for colour and candidate keys.
const FEATURES = ['tags', 'genres', 'genreWords', 'parents', 'artists', 'labels', 'styles'];
// A tag that names a tempo (`160+`): the BPM signal covers tempo.
const TEMPO_TAG = /^\d+\+?$/;
// Placeholder genre values that mean "no genre", not a shared genre.
const MISSING_GENRES = new Set(['unknown']);

export { splitArtist };

/** Names known as one artist: Discogs-known ones, and every track artist field with no separator. */
export function knownArtistKeys(tracks, { discogsKnown = new Set() } = {}) {
  const known = new Set(discogsKnown);
  for (const t of tracks || []) { const a = String(t?.artist ?? '').trim(); if (a && !hasSeparator(a)) known.add(entityKey(a)); }
  return known;
}

const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by);
const emptyProfile = (id, type, name) => ({
  id, type, name, key: entityKey(name), trackIds: new Set(),
  tags: new Map(), genres: new Map(), genreWords: new Map(), parents: new Map(), artists: new Map(), labels: new Map(), styles: new Map(),
  bpm: new Map(), keys: new Map(), years: [], year: null, people: new Set(), contexts: new Map(), sessions: new Map(),
  // Facts (facts-profile.js), set where an entity has them; every profile has the fields so all share one shape.
  place: null, era: null, wiki: false, sampleLinks: null, memberOf: null, memberList: null, wikiOut: null, wikiIn: null,
  cocite: null, categories: null, factLinks: null,
});

export function buildIndex(sources, cfg) {
  const tracks = Array.isArray(sources?.tracks) ? sources.tracks : [];
  const excluded = new Set((cfg.excludedTags || []).map(entityKey));
  const binWidth = Math.log(1 + cfg.bpmBinPct / 100);

  const discogsKnown = new Set();
  for (const r of sources.artistDiscogsMap || []) for (const n of [r.artistName, r.canonicalName]) if (n) discogsKnown.add(entityKey(n));
  for (const r of sources.identities || []) if (r?.type === 'artist' && r.resolution === 'confirmed' && r.name) discogsKnown.add(entityKey(r.name));
  for (const r of sources.creditsCache || []) for (const a of r?.main_artists || []) if (a?.name) discogsKnown.add(entityKey(a.name));
  const knownArtists = knownArtistKeys(tracks, { discogsKnown });
  const neverSplit = cfg.neverSplitArtists || [];
  const splits = new Map(); // credit → { credit, parts, tracks }

  // Releases: credits_cache rows joined by discogs_id, else by the resolve map.
  const credits = new Map((sources.creditsCache || []).filter((r) => r?.id != null).map((r) => [String(r.id), r]));
  const resolved = new Map((sources.resolveMap || []).filter((r) => r?.key && r.discogs_id).map((r) => [r.key, String(r.discogs_id)]));
  const people = new Map(), personNames = new Map();
  for (const rec of credits.values()) {
    const keys = [];
    for (const bucket of CREDIT_BUCKETS) for (const item of rec[bucket] || []) {
      const name = String(item?.name || item || '').trim(), key = entityKey(name);
      if (!key || keys.includes(key)) continue;
      keys.push(key); if (!personNames.has(key)) personNames.set(key, name);
    }
    for (const a of keys) { if (!people.has(a)) people.set(a, new Set()); for (const b of keys) if (a !== b) people.get(a).add(b); }
  }
  const releaseOf = (t) => {
    const rid = t.discogs_id != null && t.discogs_id !== '' ? String(t.discogs_id) : resolved.get(resolveKey(t.artist, t.album));
    return rid ? credits.get(rid) || null : null;
  };

  // Genre words: every subgenre (after `:`, or the whole value), parent and Discogs style
  // in the library. A tag whose key is one (after genreAliases) is a genre word, not a tag.
  const genreOf = (t) => { const raw = String(t?.genre ?? '').trim(); return MISSING_GENRES.has(entityKey(raw)) ? '' : raw; };
  const subgenreOf = (genre) => (genre.includes(':') ? genre.slice(genre.indexOf(':') + 1).trim() : genre);
  const genreWordSet = new Set();
  for (const t of tracks) {
    if (t?.id == null) continue;
    const genre = genreOf(t);
    if (genre) {
      genreWordSet.add(entityKey(subgenreOf(genre)));
      if (genre.includes(':')) genreWordSet.add(entityKey(genre.split(':')[0].trim()));
    }
    for (const st of releaseOf(t)?.styles || []) genreWordSet.add(entityKey(st));
  }
  genreWordSet.delete('');
  for (const m of MISSING_GENRES) genreWordSet.delete(m);
  const aliases = new Map(Object.entries(cfg.genreAliases || {}).map(([k, v]) => [entityKey(k), entityKey(v)]));
  const wordOfTag = (k) => { const w = aliases.get(k) ?? k; return genreWordSet.has(w) ? w : null; };

  // Curation groups (honest similarity spec 1.4). Track groups hold tracks: gig playlists,
  // playlists, Rekordbox lists. Naming groups name entities: crates, the Shortlist.
  const trackIdSet = new Set(tracks.filter((t) => t?.id != null).map((t) => String(t.id)));
  const known = (ids) => new Set((ids || []).map(String).filter((id) => trackIdSet.has(id)));
  const trackGroups = [], namingGroups = [];
  const unified = (id, name, kind, ids) => trackGroups.push({ id, name, kind, origin: 'unified', author: 'self', locator: id, folder: [], folderId: null, trackIds: known(ids) });
  for (const g of sources.gigs || []) (g?.playlists || []).forEach((list, i) => {
    if (list?.isBpmRoll || !list?.trackIds?.length) return;
    unified(`gig:${g.id}:${i}`, `${g.name} › ${list.name}`, 'gig', list.trackIds);
    trackGroups.at(-1).listName = list.name;
  });
  for (const p of sources.playlists || []) {
    const ids = Array.isArray(p?.trackIds) ? p.trackIds : (p?.tracks || []).map((t) => t?.id).filter((x) => x != null);
    if (!ids.length) continue;
    unified(`playlist:${p.id}`, p.name || `playlist:${p.id}`, 'playlist', ids);
  }
  const resolveMember = memberResolver(tracks, sources.rbSnapshotTracks);
  for (const g of rekordboxGroups(sources.rbNodes || [], resolveMember)) trackGroups.push({ ...g, kind: 'rekordbox' });
  for (const c of sources.crates || []) {
    const f = c?.filterState || {};
    const named = [...(f.artists || []).map((n) => entityId('artist', n)), ...(f.labels || []).map((n) => entityId('label', n)), ...(f.tags || []).map((n) => entityId('tag', n))].filter(Boolean);
    if (named.length) namingGroups.push({ id: `crate:${c.id}`, name: c.name || `crate:${c.id}`, kind: 'crate', named });
  }
  if ((sources.shortlist || []).length) {
    namingGroups.push({ id: 'shortlist', name: 'Shortlist', kind: 'shortlist',
      named: sources.shortlist.flatMap((s) => [entityId('artist', s?.artist), entityId('label', s?.labelName)]).filter(Boolean) });
  }
  // Per track: the entities it belongs to, and the facts the classifier reads.
  const trackMembers = new Map(), trackFacts = new Map();

  const entities = new Map(), df = Object.fromEntries([...FEATURES, 'people'].map((f) => [f, new Map()]));
  // Display names for genres, parents and styles: each key's commonest spelling
  // (ties alphabetical), so neither track order nor letter case picks the name.
  const names = { genres: new Map(), genreWords: new Map(), parents: new Map(), styles: new Map() };
  const spellings = { genres: new Map(), genreWords: new Map(), parents: new Map(), styles: new Map() };
  const tagCounts = new Map(); // every tag, excluded ones included, for the dev tool
  const remember = (feature, raw) => {
    const k = entityKey(raw);
    if (!k) return;
    const seen = spellings[feature].get(k) || spellings[feature].set(k, new Map()).get(k);
    bump(seen, String(raw).trim());
  };
  const entity = (id, type, name) => {
    if (!entities.has(id)) entities.set(id, emptyProfile(id, type, name));
    return entities.get(id);
  };

  for (const t of tracks) {
    if (t?.id == null) continue;
    const tid = `track:${t.id}`;
    const artist = String(t.artist ?? '').trim();
    const parts = splitArtist(artist, (s) => knownArtists.has(entityKey(s)), neverSplit);
    if (parts.length > 1) (splits.get(artist) || splits.set(artist, { credit: artist, parts, tracks: 0 }).get(artist)).tracks++;
    const tagNames = new Map(), seenTags = new Set();
    for (const raw of Array.isArray(t.tags) ? t.tags : []) {
      const k = entityKey(raw);
      if (!k || seenTags.has(k)) continue;
      seenTags.add(k);
      const c = tagCounts.get(k) || tagCounts.set(k, { name: String(raw).trim(), tracks: 0 }).get(k); c.tracks++;
      if (!excluded.has(k)) tagNames.set(k, String(raw).trim());
    }
    const genre = genreOf(t), parent = genre.includes(':') ? genre.split(':')[0].trim() : '';
    const label = String(t.label ?? '').trim(), album = String(t.album ?? '').trim();
    const rel = releaseOf(t);
    const bpm = Number(t.bpm), year = Number(t.year), camelot = toCamelot(t.tonality ?? t.key);

    const words = new Set(), plainTags = [];
    if (genre) { const sub = subgenreOf(genre); if (entityKey(sub)) { words.add(entityKey(sub)); remember('genreWords', sub); } }
    for (const st of rel?.styles || []) { const k = entityKey(st); if (k) { words.add(k); remember('genreWords', st); } }
    for (const [k, name] of tagNames) {
      const w = wordOfTag(k);
      if (w) { words.add(w); if (w === k) remember('genreWords', name); } else if (!TEMPO_TAG.test(k)) plainTags.push(k);
    }
    const f = {
      tags: plainTags, genres: genre ? [entityKey(genre)] : [], genreWords: [...words], parents: parent ? [entityKey(parent)] : [],
      artists: [...new Set(parts.map(entityKey).filter(Boolean))], labels: label ? [entityKey(label)] : [],
      styles: [...new Set((rel?.styles || []).map(entityKey).filter(Boolean))],
    };
    if (genre) remember('genres', genre);
    if (parent) remember('parents', parent);
    for (const st of rel?.styles || []) remember('styles', st);
    const trackPeople = new Set();
    for (const bucket of rel ? CREDIT_BUCKETS : []) for (const item of rel[bucket] || []) { const k = entityKey(item?.name || item); if (k) trackPeople.add(k); }
    for (const key of FEATURES) for (const k of f[key]) bump(df[key], k);
    for (const k of trackPeople) bump(df.people, k);

    const members = [entity(tid, 'track', String(t.title ?? '').trim() || tid)];
    members[0].albumId = album && artist ? entityId('album', `${artist}|${album}`) : null;
    for (const p of parts) members.push(entity(entityId('artist', p), 'artist', p));
    if (label) members.push(entity(entityId('label', label), 'label', label));
    if (members[0].albumId) members.push(entity(members[0].albumId, 'album', album));
    for (const [k, name] of tagNames) members.push(entity(`tag:~${k}`, 'tag', name));

    trackMembers.set(String(t.id), members);
    const added = String(t.date_added ?? t.dateAdded ?? '');
    trackFacts.set(String(t.id), {
      tags: new Set(tagNames.keys()), genreWords: words, label: f.labels[0] ?? null, artist: entityKey(artist) || null,
      month: /^\d{4}-\d{2}/.test(added) ? added.slice(0, 7) : null, bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null,
    });
    for (const p of members) {
      p.trackIds.add(tid);
      for (const key of FEATURES) for (const k of f[key]) bump(p[key], k);
      if (Number.isFinite(bpm) && bpm > 0) bump(p.bpm, Math.round(Math.log(bpm) / binWidth));
      if (camelot) bump(p.keys, camelot);
      if (Number.isFinite(year) && year > 0) p.years.push(year);
      for (const k of trackPeople) p.people.add(k);
    }
  }
  for (const feature of Object.keys(names)) for (const [k, seen] of spellings[feature]) names[feature].set(k, commonest(seen));
  // Classify, then give each entity its share of tracks in every counted track group,
  // and 1 for a naming group that names it. Every group stays in `contexts` for Tools.
  const verdicts = classifyGroups(trackGroups, trackFacts, cfg);
  const contexts = new Map(), groupsReport = [];
  const describe = (g, size, state, detail) => {
    contexts.set(g.id, { name: g.name, kind: g.kind, origin: g.origin ?? 'unified', author: g.author ?? 'self', size, weight: groupWeight(size, tracks.length, g.author, cfg), state, detail });
    groupsReport.push({ id: g.id, name: g.name, folder: g.folder || [], origin: g.origin ?? 'unified', state, detail, size });
  };
  for (const g of trackGroups) {
    const v = verdicts.get(g.id) || { state: 'counted', detail: {} };
    describe(g, g.trackIds.size, v.state, v.detail);
    if (v.state !== 'counted') continue;
    for (const id of g.trackIds) for (const p of trackMembers.get(id) || []) bump(p.contexts, g.id);
  }
  for (const p of entities.values()) if (p.contexts.size) for (const [g, k] of p.contexts) p.contexts.set(g, k / p.trackIds.size);
  // Play sessions (spec 1.4): Unified plays split where a gap passes playWindowMin, and
  // Rekordbox DJ history. A session holds each track once and needs 2 tracks. In a Unified
  // session, plays whose source names a counted group enter once per source: curation
  // already counts that list. Until there are minSessions sessions, plays covers nothing.
  const listNames = new Set();
  for (const g of trackGroups) if (verdicts.get(g.id)?.state === 'counted') { listNames.add(g.name); if (g.listName) listNames.add(g.listName); }
  const sessionTracks = new Map();
  let cur = null, last = -Infinity, listSources = null;
  for (const e of (sources.playEvents || []).filter((e) => e?.kind === 'play' && e.trackId != null && Number.isFinite(e.at)).sort((a, b) => a.at - b.at)) {
    if (e.at - last > cfg.playWindowMin * 60_000) { cur = new Set(); sessionTracks.set(`u${sessionTracks.size + 1}`, { origin: 'unified', tracks: cur }); listSources = new Set(); }
    last = e.at;
    const id = String(e.trackId);
    if (!trackIdSet.has(id)) continue;
    if (e.source && listNames.has(e.source)) { if (listSources.has(e.source)) continue; listSources.add(e.source); }
    cur.add(id);
  }
  for (const r of sources.rekordboxSessions || []) {
    const set = new Set();
    for (const m of r?.tracks || []) { const id = resolveMember(m); if (id) set.add(id); }
    sessionTracks.set(`rb:${r.id}`, { origin: 'rekordbox', tracks: set });
  }
  const sessions = new Map();
  for (const [id, x] of sessionTracks) if (x.tracks.size >= 2) sessions.set(id, { size: x.tracks.size, origin: x.origin, weight: idf(x.tracks.size, tracks.length) });
  const sessionsOn = sessions.size >= (cfg.minSessions ?? 20);
  if (sessionsOn) {
    for (const [sid] of sessions) for (const id of sessionTracks.get(sid).tracks) for (const p of trackMembers.get(id) || []) bump(p.sessions, sid);
    for (const p of entities.values()) if (p.sessions.size) for (const [sid, k] of p.sessions) p.sessions.set(sid, k / p.trackIds.size);
  }

  for (const g of namingGroups) {
    const held = new Set();
    for (const id of g.named) { const p = entities.get(id); if (!p) continue; p.contexts.set(g.id, 1); for (const t of p.trackIds) held.add(t); }
    describe(g, held.size, 'counted', {});
  }
  for (const p of entities.values()) { p.year = median(p.years); delete p.years; }
  // BPM rarity: entities per bin, over the entities with a tempo.
  const bpmDf = new Map();
  let bpmN = 0;
  for (const p of entities.values()) { if (p.bpm.size) bpmN++; for (const bin of p.bpm.keys()) bump(bpmDf, bin); }

  // Discogs relations from confirmed identities. The far endpoint may be
  // outside the library (e.g. a parent label); it is kept as a Discogs ref so
  // a shared parent still joins two owned labels.
  const relations = new Map();
  const endpointId = (e) => e.local || `discogs:${e.type}:${e.discogsId}`;
  for (const r of deriveRelations(sources.identities || [], sources.relationRows || [])) {
    const a = endpointId(r.from), b = endpointId(r.to);
    for (const [self, other, dir] of [[a, b, 'out'], [b, a, 'in']]) {
      if (!entities.has(self)) continue;
      if (!relations.has(self)) relations.set(self, []);
      relations.get(self).push({ other, kind: r.kind, dir });
      (entities.get(self).relations ||= []).push({ other, kind: r.kind, dir });
    }
  }

  const index = { entities, df, n: tracks.length, names, genreWordSet, groupsReport, sessionsOn, tagCounts, relations, people, personNames, contexts, sessions, bpmDf, bpmN,
    splitCredits: [...splits.values()].sort((a, b) => (a.credit < b.credit ? -1 : a.credit > b.credit ? 1 : 0)) };
  // Facts from MusicBrainz, Wikidata and Wikipedia (server/lib/facts.js), when the sources carry them.
  return applyFacts(index, sources.facts);
}

function shareTrack(a, b) {
  const [small, large] = a.trackIds.size <= b.trackIds.size ? [a.trackIds, b.trackIds] : [b.trackIds, a.trackIds];
  for (const id of small) if (large.has(id)) return true;
  return false;
}

/**
 * One holds the other: a track or album whose tracks all belong to the other
 * entity (an artist's own albums and tracks, a label's releases, a track's
 * album, a tag every track of the album carries). Such pairs are facts, not
 * similarity, and are never stored as neighbours.
 */
export function contains(a, b) {
  return holds(b, a) || holds(a, b);
}

function holds(whole, part) {
  if ((part.type !== 'track' && part.type !== 'album') || part.type === whole.type || !part.trackIds.size) return false;
  if (part.trackIds.size > whole.trackIds.size) return false;
  for (const id of part.trackIds) if (!whole.trackIds.has(id)) return false;
  return true;
}

/** Shared parent label (both sublabels of the same label) or a direct sublabel link. */
export function labelFamily(a, b, index) {
  const ra = index.relations.get(a.id) || [], rb = index.relations.get(b.id) || [];
  if (ra.some((r) => r.kind === 'sublabel-of' && r.other === b.id)) return 'sublabel';
  const parents = new Set(ra.filter((r) => r.kind === 'sublabel-of' && r.dir === 'out').map((r) => r.other));
  return rb.some((r) => r.kind === 'sublabel-of' && r.dir === 'out' && parents.has(r.other)) ? 'shared-parent' : null;
}

/** 1 when a fact joins the two entities (spec: Linked table), else 0. */
export function linked(a, b, index) {
  if (!a || !b || a.id === b.id) return 0;
  const types = [a.type, b.type].sort().join('|');
  if (types === 'tag|tag') return 0;
  if (types === 'track|track') return a.albumId && a.albumId === b.albumId ? 1 : 0;
  if (types === 'label|label') return labelFamily(a, b, index) ? 1 : 0;
  if (types === 'artist|artist') {
    if (shareTrack(a, b)) return 1;
    if ((index.relations.get(a.id) || []).some((r) => r.other === b.id && (r.kind === 'alias-of' || r.kind === 'member-of'))) return 1;
    return index.people.get(a.key)?.has(b.key) ? 1 : 0;
  }
  if (a.type === 'tag' || b.type === 'tag') {
    const [tag, other] = a.type === 'tag' ? [a, b] : [b, a];
    if (other.type === 'track') return other.trackIds.size && tag.trackIds.has(other.id) ? 1 : 0;
    // Tracks of `other` carrying the tag, from the track sets: a tag that names a genre is
    // not in the tags feature (it is a genre word), and the link is the same fact.
    let n = 0;
    const [few, many] = tag.trackIds.size <= other.trackIds.size ? [tag.trackIds, other.trackIds] : [other.trackIds, tag.trackIds];
    for (const id of few) if (many.has(id)) n++;
    return n >= 5 || (other.trackIds.size && n / other.trackIds.size >= 0.25) ? 1 : 0;
  }
  return shareTrack(a, b) ? 1 : 0;
}
