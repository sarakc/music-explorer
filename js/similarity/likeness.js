// The likeness table, kept for a later tuner: for each map node (artists, labels
// and tags) its strongest candidates among map nodes, and every signal's likeness
// `s` for each pair, so re-weighting re-ranks without rescoring. Built only when a
// run asks for it (the browser does, the server doesn't).
//   LikenessTable = { signals: string[], nodes: string[], offsets: Uint32Array,
//     cand: Uint32Array, s: Uint8Array }
// Node `i`'s candidates are `offsets[i]..offsets[i+1]`, strongest first by the
// run's score; `cand` indexes `nodes`. `s` holds `signals.length` bytes per
// candidate: `s` quantised to 0–254, or 255 where the signal doesn't cover the pair.
// `signals` are only the ones that cover some map node.
import { SIGNALS } from './signals/index.js';
import { blendScore, coversOf, signalLikeness } from './blend.js';
import { candidatesFor } from './candidates.js';
import { contains } from './profiles.js';
import { typeIndex, TYPES, alignedTables } from './baselines.js';
import { ATLAS_DEFAULTS } from './atlas-config.js';

/**
 * Candidates kept per node: the fewest for which the current weights still re-rank to
 * every stored neighbour on 15,000 synthetic tracks (30 missed 7 of 76,462; 40 to 200 none).
 */
export const LIKENESS_KEEP = 40;
const NONE = 255, STEPS = 254;

/**
 * buildLikeness(state, cfg, baselines, { keep, part, parts }) => LikenessTable. With
 * `parts`, only nodes `part`, `part + parts`, … get candidates (the others none), so
 * shards can build it in parts that mergeLikeness puts back together.
 */
export function buildLikeness(state, cfg, baselines, { keep = LIKENESS_KEEP, part = 0, parts = 1 } = {}) {
  const { index, postings } = state, types = new Set(state.atlas?.types ?? ATLAS_DEFAULTS.types);
  const nodes = [];
  for (const p of index.entities.values()) if (types.has(p.type)) nodes.push(p.id);
  const at = new Map(nodes.map((id, i) => [id, i]));
  const signals = SIGNALS.filter((sig) => nodes.some((id) => sig.covers(index.entities.get(id))));
  const ctx = { index, cfg, baselines }, S = signals.length, s = new Float64Array(S);
  const offsets = new Uint32Array(nodes.length + 1);
  let cand = new Uint32Array(1024), bytes = new Uint8Array(1024 * S), n = 0;
  nodes.forEach((id, i) => {
    if (i % parts !== part) { offsets[i + 1] = n; return; }
    const a = index.entities.get(id), aCovers = coversOf(a, signals), aAll = coversOf(a);
    const scored = [];
    for (const otherId of candidatesFor(id, index, postings, cfg.candidateCap)) {
      const j = at.get(otherId);
      if (j === undefined) continue;
      const b = index.entities.get(otherId);
      if (contains(a, b)) continue;
      scored.push({ j, b, score: blendScore(a, b, ctx, SIGNALS, aAll) });
    }
    scored.sort((x, y) => y.score - x.score || x.j - y.j);
    for (const { j, b } of scored.slice(0, keep)) {
      if (n === cand.length) {
        const c = new Uint32Array(n * 2); c.set(cand); cand = c;
        const by = new Uint8Array(n * 2 * S); by.set(bytes); bytes = by;
      }
      signalLikeness(a, b, ctx, signals, s, aCovers);
      cand[n] = j;
      for (let k = 0; k < S; k++) bytes[n * S + k] = s[k] < 0 ? NONE : Math.round(Math.min(1, Math.max(0, s[k])) * STEPS);
      n++;
    }
    offsets[i + 1] = n;
  });
  return { signals: signals.map((sig) => sig.id), nodes, offsets, cand: cand.slice(0, n), s: bytes.slice(0, n * S) };
}

/** The tables buildLikeness built in `parts` (each its own `part`), as one table. */
export function mergeLikeness(tables) {
  const parts = tables.length, { signals, nodes } = tables[0], S = signals.length;
  const offsets = new Uint32Array(nodes.length + 1);
  for (let i = 0; i < nodes.length; i++) { const t = tables[i % parts]; offsets[i + 1] = offsets[i] + t.offsets[i + 1] - t.offsets[i]; }
  const cand = new Uint32Array(offsets[nodes.length]), s = new Uint8Array(cand.length * S);
  for (let i = 0; i < nodes.length; i++) {
    const t = tables[i % parts], from = t.offsets[i], to = t.offsets[i + 1];
    cand.set(t.cand.subarray(from, to), offsets[i]);
    s.set(t.s.subarray(from * S, to * S), offsets[i] * S);
  }
  return { signals, nodes, offsets, cand, s };
}

const liftOf = (s, base) => {
  if (!(base < 1)) return 0;
  const lift = (s - base) / (1 - base);
  return lift < -1 ? -1 : lift;
};
const typeOf = (id) => id.slice(0, id.indexOf(':'));

/**
 * reblend(table, baselines, cfg) => Map<nodeId, { id, score }[]>: each node's top
 * `cfg.k` among map nodes under `cfg`'s weights, from the table alone (at or above
 * `cfg.minScore`, at most `cfg.perTypeK` of a type), the way blend.js scores a pair.
 */
export function reblend(table, baselines, cfg) {
  const signals = table.signals.map((id) => SIGNALS.find((sig) => sig.id === id));
  const S = signals.length, tables = baselines ? alignedTables(baselines, signals) : null;
  const groups = [...new Set(signals.map((sig) => sig?.group).filter(Boolean))];
  const groupOf = signals.map((sig) => (sig?.group ? groups.indexOf(sig.group) : -1));
  const weightOf = signals.map((sig) => cfg.weights[sig?.id] ?? sig?.defaultWeight ?? 0);
  const gw = new Float64Array(groups.length), gwl = new Float64Array(groups.length);
  const nodeType = table.nodes.map((id) => typeIndex(typeOf(id)));
  const out = new Map();
  for (let i = 0; i < table.nodes.length; i++) {
    const scored = [];
    for (let c = table.offsets[i]; c < table.offsets[i + 1]; c++) {
      const j = table.cand[c], ta = nodeType[i], tb = nodeType[j];
      const cell = tables && ta >= 0 && tb >= 0 ? ta * TYPES.length + tb : -1;
      gw.fill(0); gwl.fill(0);
      let sumW = 0, sumWL = 0;
      for (let k = 0; k < S; k++) {
        const q = table.s[c * S + k];
        if (q === NONE) continue;
        const base = cell < 0 || tables[k] === null ? 0 : tables[k][cell];
        const w = weightOf[k], wl = w * liftOf(q / STEPS, base), g = groupOf[k];
        if (g >= 0) { gw[g] += w; gwl[g] += wl; } else { sumW += w; sumWL += wl; }
      }
      for (let g = 0; g < groups.length; g++) {
        const cap = cfg.groupCaps?.[groups[g]], f = cap != null && gw[g] > cap ? cap / gw[g] : 1;
        sumW += f * gw[g]; sumWL += f * gwl[g];
      }
      const den = sumW + cfg.priorWeight, score = den > 0 ? Math.min(1, Math.max(0, sumWL / den)) : 0;
      if (score >= cfg.minScore) scored.push({ id: table.nodes[j], score });
    }
    scored.sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : 1));
    const perType = new Map(), top = [];
    for (const r of scored) {
      if (top.length >= cfg.k) break;
      const t = typeOf(r.id), n = perType.get(t) || 0;
      if (n >= cfg.perTypeK) continue;
      perType.set(t, n + 1);
      top.push(r);
    }
    out.set(table.nodes[i], top);
  }
  return out;
}
