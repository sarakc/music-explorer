// The blend: score against chance (graph signals spec › Blend). Pure.
//   covered  = signals that cover both entities and return a score
//   lift     = (s − baseline) / (1 − baseline), at least −1
//              (1 identical, 0 chance, < 0 less alike than chance)
//   score    = clamp(Σ w·lift / (Σ w + priorWeight), 0, 1) over covered
// The signals of one group (`group: 'wikipedia'`, `'time'`) together count at
// most `cfg.groupCaps[group]` weight in one pair: past it, each one's weight is
// scaled down in proportion. A group with no cap counts in full.
// `ctx.baselines` is the compiled table from baselines.js (null: every
// baseline 0); relation signals always have baseline 0. A pair with few inputs
// shrinks toward 0 (unknown); a missing input adds nothing and takes nothing.
// Reasons (top three covered signals by w·lift, lift > 0) are explained on
// first read, so the many candidates that are never stored never build them.
import { SIGNALS } from './signals/index.js';
import { typeIndex, TYPES, alignedTables } from './baselines.js';

const N = TYPES.length;
const round = (x) => Math.round(x * 1000) / 1000;
const simOf = (sig, a, b, ctx) => {
  if (sig.sim) return sig.sim(a, b, ctx);
  const r = sig.score(a, b, ctx);
  return r === null ? null : r.score;
};
const explainOf = (sig, a, b, ctx) => (sig.explain ? sig.explain(a, b, ctx) : sig.score(a, b, ctx)?.detail ?? null);
// The baseline cell for two entity types in a compiled table, or -1 when none applies.
const cellOf = (baselines, a, b) => {
  if (!baselines) return -1;
  const ta = typeIndex(a.type), tb = typeIndex(b.type);
  return ta < 0 || tb < 0 ? -1 : ta * N + tb;
};
// Signal i's baseline: 0 for a relation signal, an unsampled one or no table.
const baseOf = (tables, cell, i) => {
  if (cell < 0) return 0;
  const table = tables[i];
  return table === null ? 0 : table[cell];
};
const liftOf = (s, base) => {
  if (!(base < 1)) return 0;
  const lift = (s - base) / (1 - base);
  return lift < -1 ? -1 : lift;
};
// A group's weights, scaled to its cap: the factor its weights take in this pair.
const capFactor = (groupW, cap) => (cap != null && groupW > cap ? cap / groupW : 1);
// Each signal's group as a small index (-1 for none), worked out once per signals array,
// with module scratch sums so blendScore allocates nothing per pair.
const GROUPS = new WeakMap();
const groupsOf = (signals) => {
  let g = GROUPS.get(signals);
  if (!g) {
    const names = [...new Set(signals.map((s) => s.group).filter(Boolean))];
    g = { names, idx: Int8Array.from(signals, (s) => (s.group ? names.indexOf(s.group) : -1)) };
    GROUPS.set(signals, g);
  }
  return g;
};
let scratchW = new Float64Array(4), scratchWL = new Float64Array(4);
const finish = (sumW, sumWL, prior) => {
  const den = sumW + prior;
  if (!(den > 0)) return 0;
  const score = sumWL / den;
  return score < 0 ? 0 : score > 1 ? 1 : score;
};

/**
 * The blended score alone, allocation-free: the hot path for every candidate.
 * `aCovers` (optional) is `coversOf(a, signals)`, worked out once for an entity
 * scored against many: most signals then skip without asking either side.
 */
export function blendScore(a, b, ctx, signals = SIGNALS, aCovers = null) {
  const { weights, priorWeight, groupCaps } = ctx.cfg, baselines = ctx.baselines ?? null, cell = cellOf(baselines, a, b);
  const tables = baselines === null ? null : alignedTables(baselines, signals);
  const { names, idx } = groupsOf(signals), G = names.length;
  if (scratchW.length < G) { scratchW = new Float64Array(G); scratchWL = new Float64Array(G); }
  for (let g = 0; g < G; g++) { scratchW[g] = 0; scratchWL[g] = 0; }
  let sumW = 0, sumWL = 0;
  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i];
    if (aCovers === null ? !sig.covers(a) : !aCovers[i]) continue;
    if (!sig.covers(b)) continue;
    const s = simOf(sig, a, b, ctx);
    if (s === null) continue;
    const w = weights[sig.id] ?? sig.defaultWeight, wl = w * liftOf(s, baseOf(tables, cell, i)), g = idx[i];
    if (g >= 0) { scratchW[g] += w; scratchWL[g] += wl; } else { sumW += w; sumWL += wl; }
  }
  for (let g = 0; g < G; g++) {
    const f = capFactor(scratchW[g], groupCaps?.[names[g]]);
    sumW += f * scratchW[g]; sumWL += f * scratchWL[g];
  }
  return finish(sumW, sumWL, priorWeight);
}

/**
 * Each signal's likeness `s` for the pair, by position, into `out`: -1 where a
 * signal doesn't cover both or returns no score. `aCovers` as in blendScore.
 */
export function signalLikeness(a, b, ctx, signals, out, aCovers = null) {
  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i];
    const s = (aCovers === null ? sig.covers(a) : aCovers[i]) && sig.covers(b) ? simOf(sig, a, b, ctx) : null;
    out[i] = s === null ? -1 : s;
  }
  return out;
}

/** Which of `signals` cover `p`, by position: blendScore's `aCovers`. */
export const coversOf = (p, signals = SIGNALS) => signals.map((sig) => sig.covers(p));

export function blend(a, b, ctx, signals = SIGNALS, { explain = true } = {}) {
  const { weights, priorWeight, groupCaps } = ctx.cfg, baselines = ctx.baselines ?? null, cell = cellOf(baselines, a, b);
  const tables = baselines === null ? null : alignedTables(baselines, signals);
  const { names, idx } = groupsOf(signals), G = names.length;
  const hits = [], groupW = new Float64Array(G), groupWL = new Float64Array(G);
  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i];
    if (!sig.covers(a) || !sig.covers(b)) continue;
    const s = simOf(sig, a, b, ctx);
    if (s === null) continue;
    const w = weights[sig.id] ?? sig.defaultWeight, baseline = baseOf(tables, cell, i), lift = liftOf(s, baseline);
    hits.push({ sig, w, s, baseline, lift, g: idx[i] });
  }
  // Summed in the order blendScore sums them, so both give the same score to the last bit;
  // each hit then keeps its weight as it counts here, a capped group's scaled to the cap.
  let sumW = 0, sumWL = 0;
  for (const h of hits) {
    const wl = h.w * h.lift;
    if (h.g >= 0) { groupW[h.g] += h.w; groupWL[h.g] += wl; } else { sumW += h.w; sumWL += wl; }
  }
  const factors = Array.from(groupW, (w, g) => capFactor(w, groupCaps?.[names[g]]));
  for (let g = 0; g < G; g++) { sumW += factors[g] * groupW[g]; sumWL += factors[g] * groupWL[g]; }
  const score = finish(sumW, sumWL, priorWeight);
  for (const h of hits) if (h.g >= 0 && factors[h.g] !== 1) h.w *= factors[h.g];
  for (const h of hits) delete h.g;
  const makeReasons = () => hits.filter((h) => h.lift > 0 && h.w > 0).sort((x, y) => y.w * y.lift - x.w * x.lift).slice(0, 3)
    .map(({ sig, s }) => ({ signal: sig.id, s: round(s), detail: explainOf(sig, a, b, ctx) }));
  if (!explain) {
    let reasons;
    return { score, get reasons() { return (reasons ??= makeReasons()); } };
  }
  const byId = new Map(hits.map((h) => [h.sig.id, h]));
  const breakdown = signals.map((sig) => {
    const h = byId.get(sig.id), w = h ? h.w : weights[sig.id] ?? sig.defaultWeight;
    return h ? { signal: sig.id, w, covered: true, s: h.s, baseline: round(h.baseline), lift: round(h.lift), detail: explainOf(sig, a, b, ctx) }
      : { signal: sig.id, w, covered: false, s: null, baseline: null, lift: null, detail: null };
  });
  return { score, reasons: makeReasons(), covered: hits.map((h) => h.sig.id), breakdown };
}
