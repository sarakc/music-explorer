// Candidate retrieval through inverted indexes, so no entity is scored
// against all others. Keys: shared tag, label, split artist, credited person,
// curation context, Discogs relation or fact link, city, cocited article,
// Wikipedia category, genre × BPM bin. Pure. Postings hold integer entity positions and the
// pre-score accumulates in a typed array: this runs once per entity.
import { idf } from './math.js';
import { blend, blendScore, coversOf } from './blend.js';
import { linked, contains } from './profiles.js';
import { SIGNALS } from './signals/index.js';

function keysOf(p) {
  if (p._keys) return p._keys;
  const keys = new Set();
  for (const k of p.tags.keys()) keys.add(`tag:${k}`);
  for (const k of p.labels.keys()) keys.add(`label:${k}`);
  for (const k of p.artists.keys()) keys.add(`artist:${k}`);
  for (const k of p.people) keys.add(`person:${k}`);
  for (const c of p.contexts.keys()) keys.add(`ctx:${c}`);
  // Relations and fact links (samples, members, Wikipedia links): each end posts both ids,
  // so linked pairs and pairs linked to the same entity meet.
  if (p.relations?.length || p.factLinks) {
    keys.add(`rel:${p.id}`);
    for (const r of p.relations || []) keys.add(`rel:${r.other}`);
    for (const id of p.factLinks || []) keys.add(`rel:${id}`);
  }
  if (p.place?.city) keys.add(`city:${p.place.city}`);
  for (const q of p.cocite?.keys() || []) keys.add(`wq:${q}`);
  for (const c of p.categories?.keys() || []) keys.add(`cat:${c}`);
  for (const g of p.genres.keys()) for (const bin of p.bpm.keys()) keys.add(`gb:${g}|${bin}`);
  return (p._keys = [...keys]);
}

export function buildPostings(index) {
  const order = [...index.entities.keys()], lists = new Map();
  order.forEach((id, i) => {
    for (const key of keysOf(index.entities.get(id))) {
      let list = lists.get(key);
      if (!list) lists.set(key, (list = []));
      list.push(i);
    }
  });
  const postings = new Map([...lists].map(([k, v]) => [k, Int32Array.from(v)]));
  postings.order = order;
  postings.position = new Map(order.map((id, i) => [id, i]));
  postings.acc = new Float64Array(order.length);
  return postings;
}

/** Entities sharing at least one key with `id`, strongest pre-score first, at most `cap`. */
export function candidatesFor(id, index, postings, cap) {
  const p = index.entities.get(id), self = postings.position.get(id);
  if (!p || self === undefined) return [];
  const { acc, order } = postings, total = order.length, touched = [];
  for (const key of keysOf(p)) {
    const list = postings.get(key);
    if (!list) continue;
    const w = idf(list.length, total);
    for (let i = 0; i < list.length; i++) {
      const j = list[i];
      if (j === self) continue;
      if (acc[j] === 0) touched.push(j);
      acc[j] += w;
    }
  }
  // Order only matters when the cap bites; under it every candidate is scored.
  if (touched.length <= cap) {
    const out = new Array(touched.length);
    for (let i = 0; i < touched.length; i++) { out[i] = order[touched[i]]; acc[touched[i]] = 0; }
    return out;
  }
  const scored = touched.map((j) => [j, acc[j]]);
  for (const j of touched) acc[j] = 0;
  scored.sort((x, y) => y[1] - x[1] || x[0] - y[0]);
  const out = new Array(cap);
  for (let i = 0; i < cap; i++) out[i] = order[scored[i][0]];
  return out;
}

/**
 * The stored neighbour rows for one entity: minScore, k, at most perTypeK per
 * type, none it holds or is held by. `baselines` is the run's compiled table
 * (baselines.js); null scores every signal against a baseline of 0.
 */
export function topNeighbours(id, index, postings, cfg, { signals = SIGNALS, baselines = null } = {}) {
  const a = index.entities.get(id);
  if (!a) return [];
  const ctx = { index, cfg, baselines }, scored = [], aCovers = coversOf(a, signals);
  for (const otherId of candidatesFor(id, index, postings, cfg.candidateCap)) {
    const b = index.entities.get(otherId);
    if (contains(a, b)) continue;
    const score = blendScore(a, b, ctx, signals, aCovers);
    if (score >= cfg.minScore) scored.push({ id: otherId, type: b.type, score, b });
  }
  scored.sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : 1));
  const perType = new Map(), out = [];
  for (const row of scored) {
    if (out.length >= cfg.k) break;
    const n = perType.get(row.type) || 0;
    if (n >= cfg.perTypeK) continue;
    perType.set(row.type, n + 1);
    // Only kept rows pay for their readable reasons.
    out.push({ id: row.id, type: row.type, score: row.score, linked: linked(a, row.b, index), reasons: blend(a, row.b, ctx, signals, { explain: false }).reasons });
  }
  return out;
}
