import { defineSignal } from './_define.js';
// Gaussian on the gap between median years.
export default defineSignal({
  id: 'year', source: 'library', defaultWeight: 0.75, group: 'time',
  covers: (p) => p.year != null,
  sim(a, b, { cfg }) { const gap = Math.abs(a.year - b.year); return Math.exp(-(gap * gap) / (2 * cfg.yearSigma * cfg.yearSigma)); },
  explain: (a, b) => ({ a: a.year, b: b.year, gap: Math.abs(a.year - b.year) }),
});
