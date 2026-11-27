// IDF-weighted cosine over one profile feature, with a readable detail.
import { idf } from '../math.js';
import { defineSignal } from './_define.js';

const ENTITY_PREFIX = { tags: 'tag', labels: 'label', artists: 'artist' };

// Library features count over the tracks; a facts feature (cocite, categories)
// over the entities that carry it (`factDf`, `factN`).
export function weightOf(feature, index) {
  const cache = (index._idf ||= {});
  if (!cache[feature]) {
    const df = index.df[feature] ?? index.factDf?.[feature] ?? new Map(), n = index.df[feature] ? index.n : index.factN?.[feature] ?? 0, memo = new Map();
    cache[feature] = (k) => { let w = memo.get(k); if (w === undefined) { w = idf(df.get(k) || 0, n); memo.set(k, w); } return w; };
  }
  return cache[feature];
}

export function nameOf(feature, key, index) {
  const prefix = ENTITY_PREFIX[feature];
  if (prefix) return index.entities.get(`${prefix}:~${key}`)?.name ?? key;
  return index.names?.[feature]?.get(key) ?? key;
}

// Each profile's feature as an idf-weighted vector plus its norm, built once per run.
function vector(p, feature, index) {
  const key = `_vec_${feature}`;
  let v = p[key];
  if (!v) {
    const w = weightOf(feature, index), map = new Map();
    let sq = 0;
    for (const [k, c] of p[feature]) { const x = c * w(k); map.set(k, x); sq += x * x; }
    v = p[key] = { map, norm: Math.sqrt(sq) };
  }
  return v;
}

export function cosine(a, b, feature, index) {
  const va = vector(a, feature, index), vb = vector(b, feature, index);
  if (!va.norm || !vb.norm) return 0;
  const [small, large] = va.map.size <= vb.map.size ? [va.map, vb.map] : [vb.map, va.map];
  let dot = 0;
  for (const [k, x] of small) { const y = large.get(k); if (y !== undefined) dot += x * y; }
  return dot ? Math.min(1, dot / (va.norm * vb.norm)) : 0;
}

/** Shared keys, strongest contribution first, as at most 3 names plus counts. */
export function sharedDetail(a, b, feature, index) {
  const va = vector(a, feature, index).map, vb = vector(b, feature, index).map, shared = [];
  for (const k of va.keys()) if (vb.has(k)) shared.push(k);
  shared.sort((x, y) => va.get(y) * vb.get(y) - va.get(x) * vb.get(x) || x.localeCompare(y));
  const of = new Set([...va.keys(), ...vb.keys()]).size;
  return { shared: shared.slice(0, 3).map((k) => nameOf(feature, k, index)), sharedCount: shared.length, of };
}

export function vectorSignal({ id, source, defaultWeight, feature, skip = null, group = null }) {
  return defineSignal({
    id, source, defaultWeight, group,
    covers: (p) => p[feature] != null && p[feature].size > 0,
    sim: (a, b, { index }) => (skip?.(a, b) ? null : cosine(a, b, feature, index)),
    explain: (a, b, { index }) => sharedDetail(a, b, feature, index),
  });
}
