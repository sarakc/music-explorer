import { rarity } from '../math.js';
import { defineSignal } from './_define.js';
// Overlap of BPM histograms (bins bpmBinPct wide, log scale), each shared
// bin's share weighted by its rarity (idf over the entities with a tempo in
// that bin): two entities at the house tempo everyone plays share less than two
// at a rare one. Half and double time fold onto the same bin at 0.8 credit,
// weighted by the two bins' mean rarity.
const normalise = (m) => { let t = 0; for (const v of m.values()) t += v; return new Map([...m].map(([k, v]) => [k, v / t])); };
const peak = (m) => [...m].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0][0];
const octaveOf = (cfg) => Math.round(Math.log(2) / Math.log(1 + cfg.bpmBinPct / 100));
// A bin's rarity, memoised per index; an index without bin counts weighs every bin 1.
function rarityOf(index) {
  if (index._bpmRarity) return index._bpmRarity;
  const df = index.bpmDf, n = index.bpmN, memo = new Map();
  return (index._bpmRarity = df ? (bin) => { let r = memo.get(bin); if (r === undefined) { r = rarity(df.get(bin) || 0, n); memo.set(bin, r); } return r; } : () => 1);
}
const overlap = (a, b, r, shift = 0) => {
  let s = 0;
  for (const [k, v] of a) { const u = b.get(k + shift); if (u) s += Math.min(v, u) * (shift ? (r(k) + r(k + shift)) / 2 : r(k)); }
  return s;
};
const parts = (a, b, cfg, index) => {
  const pa = (a._bpmN ||= normalise(a.bpm)), pb = (b._bpmN ||= normalise(b.bpm)), octave = octaveOf(cfg), r = rarityOf(index);
  return [overlap(pa, pb, r), 0.8 * Math.max(overlap(pa, pb, r, octave), overlap(pa, pb, r, -octave))];
};

export default defineSignal({
  id: 'bpm', source: 'library', defaultWeight: 1,
  covers: (p) => p.bpm.size > 0,
  sim(a, b, { cfg, index }) { const [same, folded] = parts(a, b, cfg, index); return Math.min(1, Math.max(same, folded)); },
  explain(a, b, { cfg, index }) {
    const [same, folded] = parts(a, b, cfg, index), bpmOf = (bin) => Math.round((1 + cfg.bpmBinPct / 100) ** bin);
    return { a: bpmOf(peak(a.bpm)), b: bpmOf(peak(b.bpm)), folded: folded > same };
  },
});
