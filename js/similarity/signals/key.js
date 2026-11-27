import { camelotSim } from '../math.js';
import { defineSignal } from './_define.js';
// Camelot likeness between key histograms, normalised so identical mixes score 1.
const E = (a, b) => { let s = 0; for (const [i, x] of a) for (const [j, y] of b) s += x * y * camelotSim(i, j); return s; };
const peak = (m) => [...m].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0];
const self = (p) => (p._keySelf ??= E(p.keys, p.keys));

export default defineSignal({
  id: 'key', source: 'library', defaultWeight: 0.5,
  covers: (p) => p.keys.size > 0,
  sim: (a, b) => Math.min(1, E(a.keys, b.keys) / Math.sqrt(self(a) * self(b))),
  explain: (a, b) => ({ a: peak(a.keys), b: peak(b.keys) }),
});
