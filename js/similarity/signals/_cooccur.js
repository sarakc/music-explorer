import { npmi, evidence } from '../math.js';
// Co-occurrence of two entities across a set of groups, as NPMI clipped to 0..1.
export function shared(a, b, field) {
  const [small, large] = a[field].size <= b[field].size ? [a[field], b[field]] : [b[field], a[field]];
  const out = [];
  for (const x of small) if (large.has(x)) out.push(x);
  return out;
}
export function together(a, b, field) {
  const [small, large] = a[field].size <= b[field].size ? [a[field], b[field]] : [b[field], a[field]];
  let n = 0;
  for (const x of small) if (large.has(x)) n++;
  return n;
}
export const cooccurScore = (a, b, field, total) => npmi(together(a, b, field), a[field].size, b[field].size, total);

// The weighted cosine of two group maps (group → share), each group scaled by
// `weightOf(group)`, times the evidence factor over the groups both hold. Each shared
// group counts toward n by its weight over `maxWeight` (a 2-track group's), so a pair
// whose only shared group is a big list has less evidence than one sharing a small list
// (with one group each side the cosine is 1 whatever the weights).
// Norms are cached on the profile per field.
function normOf(p, field, weightOf) {
  const key = `_norm_${field}`;
  if (p[key] === undefined) {
    let sq = 0;
    for (const [g, v] of p[field]) { const x = v * weightOf(g); sq += x * x; }
    p[key] = Math.sqrt(sq);
  }
  return p[key];
}
export function groupScore(a, b, field, weightOf, k, maxWeight) {
  const ma = a[field], mb = b[field];
  if (!ma.size || !mb.size) return 0;
  const [small, large] = ma.size <= mb.size ? [ma, mb] : [mb, ma];
  let dot = 0, n = 0;
  for (const [g, v] of small) {
    const u = large.get(g);
    if (u === undefined) continue;
    const w = weightOf(g);
    dot += v * w * u * w; n += w >= maxWeight ? 1 : w / maxWeight;
  }
  if (!n || !dot) return 0;
  const den = normOf(a, field, weightOf) * normOf(b, field, weightOf);
  return den > 0 ? evidence(Math.min(1, dot / den), n, k) : 0;
}
export function sharedKeys(a, b, field) {
  const [small, large] = a[field].size <= b[field].size ? [a[field], b[field]] : [b[field], a[field]];
  const out = [];
  for (const x of small.keys()) if (large.has(x)) out.push(x);
  return out;
}
