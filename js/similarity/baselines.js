// Chance baselines for the blend (graph signals spec › Blend). Pure.
//
// For each signal and each unordered pair of entity types, the mean score over
// a seeded random sample of pairs that both carry the signal: what two
// unrelated entities score by chance. Worked out once per full run and stored
// with its neighbours; the same library always gives the same baselines.
// Relation signals (`relation: true`) count only when the relation exists, so
// their baseline is 0 and they are not sampled.
import { SIGNALS } from './signals/index.js';

export const TYPES = Object.freeze(['artist', 'label', 'tag', 'album', 'track']);
// A Discover release (not owned) compares as an album.
const TYPE_INDEX = new Map([...TYPES.map((t, i) => [t, i]), ['release', TYPES.indexOf('album')]]);
const N = TYPES.length;
export const BASELINE_PAIRS = 50_000;
export const BASELINE_SEED = 0x5eed;

/** The position of an entity type in a compiled table, or -1 for a type outside TYPES. */
export const typeIndex = (type) => TYPE_INDEX.get(type) ?? -1;

// mulberry32: small, fast and the same on every platform.
export function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// A seed per (signal, type pair), so adding a signal or a type never shifts the others' samples.
function cellSeed(seed, signal, ta, tb) {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  for (const ch of `${signal}|${ta}|${tb}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

const simOf = (sig, a, b, ctx) => {
  if (sig.sim) return sig.sim(a, b, ctx);
  const r = sig.score(a, b, ctx);
  return r === null ? null : r.score;
};

/**
 * [{ signal, a, b, baseline, pairs }] for every non-relation signal and every
 * unordered type pair (a ≤ b in TYPES order) where both sides have covered
 * entities. `pairs` is how many sampled pairs scored (s ≠ null). Each cell
 * (signal × type pair) has its own seed, so `part` of `parts` (the cells
 * numbered part, part + parts, …) can run on separate threads and
 * mergeBaselines of the parts equals the whole.
 */
export function computeBaselines(index, cfg, signals = SIGNALS, { pairs = BASELINE_PAIRS, seed = BASELINE_SEED, part = 0, parts = 1 } = {}) {
  const ctx = { index, cfg, baselines: null };
  // Entities by type in id order, so the sample never depends on load order.
  const byType = TYPES.map(() => []);
  for (const id of [...index.entities.keys()].sort()) {
    const p = index.entities.get(id), t = typeIndex(p.type);
    if (t >= 0) byType[t].push(p);
  }
  const rows = [];
  let cellNo = -1;
  for (const sig of signals) {
    if (sig.relation) continue;
    let covered = null;
    for (let ta = 0; ta < N; ta++) for (let tb = ta; tb < N; tb++) {
      if (++cellNo % parts !== part) continue;
      covered ||= byType.map((list) => list.filter((p) => sig.covers(p)));
      const A = covered[ta], B = covered[tb];
      if (!A.length || !B.length || (ta === tb && A.length < 2)) continue;
      const rnd = seededRandom(cellSeed(seed, sig.id, ta, tb));
      let n = 0, sum = 0;
      // A signal that never applies to this type pair (null) gives up after `pairs` tries.
      for (let tries = 0; n < pairs && tries < 2 * pairs; tries++) {
        const a = A[Math.floor(rnd() * A.length)], b = B[Math.floor(rnd() * B.length)];
        if (a === b) continue;
        const s = simOf(sig, a, b, ctx);
        if (s === null) { if (n === 0 && tries >= pairs) break; continue; }
        sum += s; n++;
      }
      if (n) rows.push({ signal: sig.id, a: TYPES[ta], b: TYPES[tb], baseline: sum / n, pairs: n });
    }
  }
  return rows;
}

/** The parts' rows as one list, in the order a single computeBaselines returns them. */
export function mergeBaselines(parts, signals = SIGNALS) {
  const order = new Map(signals.map((s, i) => [s.id, i]));
  const key = (r) => [order.get(r.signal) ?? signals.length, typeIndex(r.a), typeIndex(r.b)];
  return parts.flat().sort((x, y) => {
    const kx = key(x), ky = key(y);
    return kx[0] - ky[0] || kx[1] - ky[1] || kx[2] - ky[2];
  });
}

/**
 * Rows → the blend's lookup: per signal id a Float64Array(N·N), symmetric, 0
 * where nothing was sampled. Null for no rows (before any baselines exist).
 */
export function compileBaselines(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const byId = new Map();
  for (const r of rows) {
    const ta = typeIndex(r.a), tb = typeIndex(r.b);
    if (ta < 0 || tb < 0 || !Number.isFinite(r.baseline)) continue;
    if (!byId.has(r.signal)) byId.set(r.signal, new Float64Array(N * N));
    const table = byId.get(r.signal);
    table[ta * N + tb] = r.baseline;
    table[tb * N + ta] = r.baseline;
  }
  return { byId, aligned: new WeakMap() };
}

/**
 * The compiled tables lined up with a signal list (null for a relation signal
 * or one never sampled), cached per list: the hot path then indexes an array
 * instead of looking each signal up by id.
 */
export function alignedTables(compiled, signals) {
  let list = compiled.aligned.get(signals);
  if (!list) {
    list = signals.map((sig) => (sig.relation ? null : compiled.byId.get(sig.id) ?? null));
    compiled.aligned.set(signals, list);
  }
  return list;
}
