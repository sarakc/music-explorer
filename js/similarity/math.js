// Shared numeric helpers for the similarity signals. Pure.
import { keyToCamelot } from '../key-compat.js';

export const idf = (df, n) => Math.log((n + 1) / (df + 1)) + 1;

/**
 * How rare a value two entities share is, 0..1: its idf over the `n` entities
 * that carry the feature, against the idf of a value only those two hold.
 */
export const rarity = (df, n) => (n > 0 && df > 0 ? Math.min(1, idf(df, n) / idf(2, n)) : 1);

/** Cosine of two count maps, each count scaled by `weightOf(key)`. */
export function idfCosine(a, b, weightOf) {
  if (!a?.size || !b?.size) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, v] of small) {
    const u = large.get(k);
    if (u) { const w = weightOf(k); dot += v * w * u * w; }
  }
  if (!dot) return 0;
  return Math.min(1, dot / (norm(a, weightOf) * norm(b, weightOf)));
}

export function norm(map, weightOf) {
  let s = 0;
  for (const [k, v] of map) { const x = v * weightOf(k); s += x * x; }
  return Math.sqrt(s);
}

/** A co-occurrence score shrunk by how few groups back it: s · n / (n + k). */
export const evidence = (s, n, k) => (n > 0 ? (s * n) / (n + k) : 0);

/** Normalised PMI of a co-occurrence, clipped to 0..1. */
export function npmi(nab, na, nb, total) {
  if (!nab || !na || !nb || !total) return 0;
  const pab = nab / total;
  if (pab >= 1) return 1;
  const v = Math.log(pab / ((na / total) * (nb / total))) / -Math.log(pab);
  return Math.max(0, Math.min(1, v));
}

export function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Alphabetical order, letter case aside; the exact spelling settles what is left. */
export function byName(x, y) {
  const a = x.toLowerCase(), b = y.toLowerCase();
  return a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0;
}

/** The commonest spelling in a Map spelling -> count; a tie goes to the one `byName` puts first. */
export function commonest(spellings) {
  let best = null;
  for (const [name, n] of spellings) if (!best || n > best[1] || (n === best[1] && byName(name, best[0]) < 0)) best = [name, n];
  return best ? best[0] : null;
}

export function toCamelot(raw) {
  const k = String(raw ?? '').trim();
  if (!k) return null;
  const m = /^(\d{1,2})([AB])$/i.exec(k);
  if (m) { const n = Number(m[1]); return n >= 1 && n <= 12 ? `${n}${m[2].toUpperCase()}` : null; }
  return keyToCamelot(k);
}

/** Camelot wheel likeness: same 1, ±1 or relative 0.7, ±2 0.3. */
export function camelotSim(a, b) {
  if (!a || !b) return 0;
  const na = parseInt(a, 10), nb = parseInt(b, 10), la = a.slice(-1), lb = b.slice(-1);
  const d = Math.min((na - nb + 12) % 12, (nb - na + 12) % 12);
  if (la === lb) return d === 0 ? 1 : d === 1 ? 0.7 : d === 2 ? 0.3 : 0;
  return d === 0 ? 0.7 : 0;
}

/**
 * Eigen-decomposition of a symmetric matrix by cyclic Jacobi rotations (the
 * atlas colour scripts' `jacobi`, ported as is). Column k of `vectors` is the
 * eigenvector for `values[k]`; the order is the matrix's own, not sorted.
 */
export function jacobiEigen(matrix, sweeps = 60) {
  const n = matrix.length, A = matrix.map((r) => [...r]);
  const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < sweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) off += A[i][j] ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-14) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
  }
  return { values: A.map((r, i) => r[i]), vectors: V };
}
