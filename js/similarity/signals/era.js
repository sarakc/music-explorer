import { defineSignal } from './_define.js';
// Active years: the overlap of two spans over their union (a span without an
// end runs to the current year). A label's founding year is a start alone:
// then the start years compare on a Gaussian, σ yearSigma.
const isSpan = (e) => e.end != null;

function overlap(a, b) {
  const from = Math.max(a.begin, b.begin), to = Math.min(a.end, b.end);
  const union = Math.max(a.end, b.end) - Math.min(a.begin, b.begin) + 1;
  return { from, to, s: to >= from ? (to - from + 1) / union : 0 };
}

export default defineSignal({
  id: 'era', source: 'facts', defaultWeight: 0.75, group: 'time',
  covers: (p) => p.era != null,
  sim(a, b, { cfg }) {
    if (!a.era || !b.era) return null;
    if (isSpan(a.era) && isSpan(b.era)) return overlap(a.era, b.era).s;
    const gap = a.era.begin - b.era.begin;
    return Math.exp(-(gap * gap) / (2 * cfg.yearSigma * cfg.yearSigma));
  },
  explain(a, b) {
    if (!a.era || !b.era) return null;
    if (isSpan(a.era) && isSpan(b.era)) {
      const { from, to, s } = overlap(a.era, b.era);
      if (s > 0) return { from, to, open: a.era.open && b.era.open };
    }
    return { a: a.era.begin, b: b.era.begin };
  },
});
