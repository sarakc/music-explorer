// Atlas colour: one hue per subgenre, worked out at each full run from the
// library's own track-to-track scores. Pure. The arithmetic ports the spike
// scripts docs/mockups/assets/2026-11-17-graph-colour-affinity.py and
// -plane.py; the rules are in docs/specs/2026-10-31-similarity-engine-design.md (Atlas).
// Tags are never rewritten: canonical subgenres exist for colour only.
import { jacobiEigen, byName, commonest } from './math.js';

const NO_GENRE = new Set(['', 'unknown', 'music', 'entertainment', 'people & blogs']);

/** A track's `genre` as a canonical subgenre (`Family: Subgenre`), or null for no genre. Letter case aside. */
export function canonicalGenre(raw) {
  const g = typeof raw === 'string' ? raw.trim() : '';
  if (NO_GENRE.has(g.toLowerCase()) || g.includes(',')) return null;
  return g.replace(/hip-hop/gi, 'Hip Hop').replace(/neo soul/gi, 'Neo-Soul')
    .replace(/electronic: footwork/gi, 'Electronic: Juke/Footwork');
}

// The family is the text before `: `, letter case aside.
const family = (name) => { const at = name.indexOf(': '); return (at < 0 ? name : name.slice(0, at)).toLowerCase(); };

/**
 * Each subgenre's merged name: itself with at least `min` tracks, else its
 * family's largest subgenre (which can be itself). The family is the text
 * before `: `, letter case aside. Ties go to the name that sorts first (`byName`).
 * @param counts Map subgenre -> tracks
 */
export function mergeSmall(counts, min = 10) {
  const largest = new Map();
  for (const [name, n] of [...counts].sort((x, y) => byName(x[0], y[0]))) {
    const f = family(name), best = largest.get(f);
    if (!best || n > best.n) largest.set(f, { name, n });
  }
  const out = new Map();
  for (const [name, n] of counts) out.set(name, n >= min ? name : largest.get(family(name)).name);
  return out;
}

/**
 * Each track's merged subgenre and every merged subgenre's track count.
 * Spellings that differ only in letter case are one subgenre, named by its
 * commonest spelling (ties alphabetical), so neither track order nor letter
 * case changes a name; then a subgenre with fewer than `min` tracks takes its
 * family's largest (`mergeSmall`).
 * @param genres iterable of [trackId, raw genre]
 * @returns { genreOf: Map trackId -> name, counts: Map name -> tracks }
 */
export function trackSubgenres(genres, min = 10) {
  const raw = new Map(), spellings = new Map();
  for (const [id, value] of genres) {
    const g = canonicalGenre(value);
    if (!g) continue;
    const key = g.toLowerCase();
    raw.set(id, key);
    const seen = spellings.get(key) || spellings.set(key, new Map()).get(key);
    seen.set(g, (seen.get(g) || 0) + 1);
  }
  const nameOf = new Map(), counts = new Map();
  for (const [key, seen] of spellings) {
    const name = commonest(seen);
    nameOf.set(key, name);
    counts.set(name, [...seen.values()].reduce((a, b) => a + b, 0));
  }
  const merge = mergeSmall(counts, min), genreOf = new Map(), merged = new Map();
  for (const [id, key] of raw) { const m = merge.get(nameOf.get(key)); genreOf.set(id, m); merged.set(m, (merged.get(m) || 0) + 1); }
  return { genreOf, counts: merged };
}

/**
 * A node's main subgenre: the most common among its tracks (ties to the name
 * that sorts first, `byName`), with `share` over the tracks that have one. Null when none does.
 * @param genreOf Map trackId -> merged subgenre
 */
export function nodeSubgenre(trackIds, genreOf) {
  const counts = new Map();
  let total = 0;
  for (const id of trackIds) {
    const g = genreOf.get(id);
    if (g == null) continue;
    total++;
    counts.set(g, (counts.get(g) || 0) + 1);
  }
  if (!total) return null;
  let best = null;
  for (const [g, n] of counts) if (!best || n > best[1] || (n === best[1] && byName(g, best[0]) < 0)) best = [g, n];
  return { subgenre: best[0], share: best[1] / total };
}

/**
 * Subgenre affinity: the sum of track-to-track scores between tracks of two
 * different subgenres, both directions, normalised by sqrt(n_a·n_b).
 */
export class Affinity {
  constructor(names) {
    this.names = [...names];
    this.index = new Map(this.names.map((name, i) => [name, i]));
    this.W = this.names.map(() => new Array(this.names.length).fill(0));
  }

  add(a, b, score) {
    const i = this.index.get(a), j = this.index.get(b);
    if (i === undefined || j === undefined || i === j) return;
    this.W[i][j] += score;
    this.W[j][i] += score;
  }

  /** Adds another affinity's sums over the same names. */
  absorb(other) {
    other.W.forEach((row, i) => row.forEach((v, j) => { this.W[i][j] += v; }));
    return this;
  }

  /** @param counts Map name -> tracks */
  matrix(counts) {
    const n = this.names.map((name) => counts.get(name) || 0);
    return this.W.map((row, i) => row.map((v, j) => (n[i] && n[j] ? v / Math.sqrt(n[i] * n[j]) : 0)));
  }
}

/**
 * Subgenres on a 2D plane (Isomap): normalised affinity M = D^-½ W D^-½,
 * distance −log(M + 1e-6) kept on each subgenre's `k` nearest (made
 * symmetric), all-pairs shortest paths (an unreachable pair counts 1.2× the
 * largest finite one), classical MDS on the top two eigenvectors, centred on
 * the mean and divided by the 95th-percentile radius. Fewer than three names
 * get fixed points.
 * @param W size-normalised affinity (`Affinity.matrix`), in `names` order
 * @returns Map name -> { x, y }
 */
export function subgenrePlane(names, W, { k = 5 } = {}) {
  const N = names.length;
  if (N < 3) return new Map(names.map((name, i) => [name, { x: i ? -1 : 1, y: 0 }]));
  const d = W.map((row) => row.reduce((s, v) => s + v, 0) || 1e-9);
  const D = names.map((_, i) => names.map((__, j) => (i === j ? 0 : -Math.log(W[i][j] / Math.sqrt(d[i] * d[j]) + 1e-6))));
  const G = names.map(() => new Array(N).fill(Infinity));
  const order = [...Array(N).keys()];
  for (let i = 0; i < N; i++) {
    G[i][i] = 0;
    for (const j of [...order].sort((a, b) => D[i][a] - D[i][b]).slice(1, k + 1)) G[i][j] = G[j][i] = Math.min(G[i][j], D[i][j]);
  }
  for (let m = 0; m < N; m++) {
    const Gm = G[m];
    for (let i = 0; i < N; i++) {
      const gim = G[i][m];
      if (gim === Infinity) continue;
      const Gi = G[i];
      for (let j = 0; j < N; j++) { const v = gim + Gm[j]; if (v < Gi[j]) Gi[j] = v; }
    }
  }
  let fin = 0;
  for (const row of G) for (const v of row) if (v < Infinity && v > fin) fin = v;
  const S = G.map((row) => row.map((v) => (v < Infinity ? v : fin * 1.2) ** 2));
  const rm = S.map((row) => row.reduce((s, v) => s + v, 0) / N), tm = rm.reduce((s, v) => s + v, 0) / N;
  const B = S.map((row, i) => row.map((v, j) => -0.5 * (v - rm[i] - rm[j] + tm)));
  const { values, vectors } = jacobiEigen(B);
  const o = [...order].sort((a, b) => values[b] - values[a]);
  const sx = Math.sqrt(Math.max(values[o[0]], 0)), sy = Math.sqrt(Math.max(values[o[1]], 0));
  const xy = order.map((i) => [vectors[i][o[0]] * sx, vectors[i][o[1]] * sy]);
  const cx = xy.reduce((s, p) => s + p[0], 0) / N, cy = xy.reduce((s, p) => s + p[1], 0) / N;
  const pts = xy.map(([x, y]) => [x - cx, y - cy]);
  const rmax = pts.map(([x, y]) => Math.hypot(x, y)).sort((a, b) => a - b)[Math.floor(N * 0.95)] || 1;
  return new Map(names.map((name, i) => [name, { x: pts[i][0] / rmax, y: pts[i][1] / rmax }]));
}

/**
 * `next` fitted onto `prev` by rotation, reflection and uniform scale
 * (Procrustes) over the names both hold, so hues stay put between runs. The
 * best orthogonal map of a 2×2 cross-covariance is taken in closed form: the
 * better of the best rotation and the best reflection, which is what its SVD
 * gives. Fewer than three shared names return `next` unchanged.
 */
export function alignPlane(next, prev) {
  const shared = prev ? [...next.keys()].filter((name) => prev.has(name)).sort() : [];
  if (shared.length < 3) return next;
  const mean = (plane) => ({ x: shared.reduce((s, n) => s + plane.get(n).x, 0) / shared.length, y: shared.reduce((s, n) => s + plane.get(n).y, 0) / shared.length });
  const ma = mean(next), mb = mean(prev);
  // C = Σ b aᵀ over centred points; `norm` = Σ |a|².
  let c00 = 0, c01 = 0, c10 = 0, c11 = 0, norm = 0;
  for (const name of shared) {
    const ax = next.get(name).x - ma.x, ay = next.get(name).y - ma.y, bx = prev.get(name).x - mb.x, by = prev.get(name).y - mb.y;
    c00 += bx * ax; c01 += bx * ay; c10 += by * ax; c11 += by * ay; norm += ax * ax + ay * ay;
  }
  if (!norm) return next;
  const turn = Math.hypot(c00 + c11, c10 - c01), flip = Math.hypot(c00 - c11, c01 + c10);
  let r00, r01, r10, r11, best;
  if (turn >= flip) { const t = Math.atan2(c10 - c01, c00 + c11); [r00, r01, r10, r11] = [Math.cos(t), -Math.sin(t), Math.sin(t), Math.cos(t)]; best = turn; }
  else { const t = Math.atan2(c01 + c10, c00 - c11); [r00, r01, r10, r11] = [Math.cos(t), Math.sin(t), Math.sin(t), -Math.cos(t)]; best = flip; }
  const scale = best / norm;
  const out = new Map();
  for (const [name, p] of next) {
    const ax = p.x - ma.x, ay = p.y - ma.y;
    out.set(name, { x: scale * (r00 * ax + r01 * ay) + mb.x, y: scale * (r10 * ax + r11 * ay) + mb.y });
  }
  return out;
}

const TAU = Math.PI * 2;
const angleOf = (p) => (Math.atan2(p.y, p.x) + TAU) % TAU;

/** The hue seam: the angle (radians) in the middle of the widest gap between points. */
export function hueSeam(plane) {
  const angles = [...plane.values()].map(angleOf).sort((a, b) => a - b);
  if (!angles.length) return 0;
  let seam = 0, widest = -1;
  angles.forEach((a, i) => {
    const b = i + 1 < angles.length ? angles[i + 1] : angles[0] + TAU;
    if (b - a > widest) { widest = b - a; seam = (a + (b - a) / 2) % TAU; }
  });
  return seam;
}

/**
 * Hue per subgenre: points in angle order from the seam, each taking a share
 * of the circle by sqrt(track count): hue_i = 360·(C_{i−1} + s_i/2)/C_total.
 * Vividness `r` is the distance from the centre, at most 1.
 * @returns Map name -> { hue (degrees), r }
 */
export function subgenreHues(plane, counts, seam) {
  const points = [...plane].map(([name, p]) => ({ name, at: (angleOf(p) - seam + 2 * TAU) % TAU, s: Math.sqrt(Math.max(1, counts.get(name) || 0)), r: Math.min(1, Math.hypot(p.x, p.y)) }))
    .sort((a, b) => a.at - b.at || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const total = points.reduce((sum, p) => sum + p.s, 0);
  const out = new Map();
  let run = 0;
  for (const p of points) { out.set(p.name, { hue: (360 * (run + p.s / 2)) / total, r: p.r }); run += p.s; }
  return out;
}

const arc = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/** The circular mean of hues (degrees), or null when they cancel out. */
export function meanHue(hues) {
  const x = hues.reduce((s, h) => s + Math.cos((h * Math.PI) / 180), 0), y = hues.reduce((s, h) => s + Math.sin((h * Math.PI) / 180), 0);
  if (Math.hypot(x, y) < 1e-9) return null;
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Hues held from one run to the next. A subgenre with a held hue keeps it. A new
 * one takes the free hue nearest the circular mean of its `k` nearest subgenres
 * on this run's plane that already have a hue; free means at least half the even
 * spacing (360 / 2n, n this run's subgenres) from every hue given this run, and
 * with none free it takes the middle of the widest gap. New subgenres go largest
 * first (ties by name), each counting as given once placed. Without held hues the
 * run's own hues stand.
 * @param subgenres [{ name, hue, tracks, x, y }] (this run's)
 * @param held      Map name -> hue (degrees)
 * @returns the same list with held and new hues
 */
export function holdHues(subgenres, held, { k = 5, step = 0.5 } = {}) {
  if (!held?.size) return subgenres;
  const given = new Map(subgenres.filter((g) => held.has(g.name)).map((g) => [g.name, held.get(g.name)]));
  if (!given.size) return subgenres;
  const sep = 360 / (2 * subgenres.length);
  const fresh = subgenres.filter((g) => !given.has(g.name)).sort((a, b) => b.tracks - a.tracks || byName(a.name, b.name));
  const at = new Map(subgenres.map((g) => [g.name, g]));
  for (const g of fresh) {
    const near = [...given.keys()].map((name) => [name, Math.hypot(at.get(name).x - g.x, at.get(name).y - g.y)])
      .sort((a, b) => a[1] - b[1] || byName(a[0], b[0])).slice(0, k);
    const target = meanHue(near.map(([name]) => given.get(name))) ?? given.get(near[0][0]);
    const taken = [...given.values()];
    let best = null, widest = null;
    for (let h = 0; h < 360; h += step) {
      const clear = Math.min(...taken.map((t) => arc(h, t)));
      if (!widest || clear > widest.clear) widest = { h, clear };
      if (clear >= sep && (!best || arc(h, target) < best.d)) best = { h, d: arc(h, target) };
    }
    given.set(g.name, (best || widest).h);
  }
  return subgenres.map((g) => ({ ...g, hue: given.get(g.name) }));
}

/**
 * One full run's colour: the plane from this run's affinity, aligned to the
 * previous run's plane, then hues. The first run (no previous plane) puts the
 * seam in the widest gap; later runs keep the previous seam. `held` hues
 * (Map name -> hue) stay put and new subgenres join them (`holdHues`).
 * @param counts   Map merged subgenre -> tracks (counted from `genreOf` when absent)
 * @param previous { plane: Map name -> { x, y }, seam } or null
 * @returns { subgenres: [{ name, hue, r, tracks, x, y }], seam }
 */
export function buildColour({ genreOf = new Map(), counts = null, affinity, previous = null, held = null, k = 5 }) {
  if (!counts) { counts = new Map(); for (const g of genreOf.values()) if (g != null) counts.set(g, (counts.get(g) || 0) + 1); }
  const names = affinity.names;
  const plane = alignPlane(subgenrePlane(names, affinity.matrix(counts), { k }), previous?.plane?.size ? previous.plane : null);
  const seam = Number.isFinite(previous?.seam) ? previous.seam : hueSeam(plane);
  const hues = subgenreHues(plane, counts, seam);
  const subgenres = names.map((name) => ({ name, hue: hues.get(name).hue, r: hues.get(name).r, tracks: counts.get(name) || 0, x: plane.get(name).x, y: plane.get(name).y }));
  return { subgenres: holdHues(subgenres, held, { k }), seam };
}
