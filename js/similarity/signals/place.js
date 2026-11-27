import { rarity } from '../math.js';
import { defineSignal } from './_define.js';
// Same city 1, region 0.6, country 0.3, each times the shared value's rarity
// (idf over the entities with a place): two Leeds artists say more than two
// British ones. Countries compare by ISO code. A city shared across two
// different country codes is not the same city.
const LEVELS = [['city', 1], ['region', 0.6], ['country', 0.3]];

function best(a, b, index) {
  const pa = a.place, pb = b.place, n = index.factN?.place ?? 0;
  if (!pa || !pb) return null;
  let top = null;
  for (const [level, w] of LEVELS) {
    const k = pa[level];
    if (!k || k !== pb[level]) continue;
    if (level === 'city' && pa.code && pb.code && pa.code !== pb.code) continue;
    const s = w * rarity(index.factDf?.[level]?.get(k) ?? 2, n);
    if (!top || s > top.s) top = { s, level };
  }
  return top;
}

export default defineSignal({
  id: 'place', source: 'facts', defaultWeight: 1,
  covers: (p) => p.place != null,
  sim: (a, b, { index }) => (a.place && b.place ? best(a, b, index)?.s ?? 0 : null),
  explain(a, b, { index }) {
    const top = best(a, b, index);
    return top ? { level: top.level, name: a.place.names[top.level] || b.place.names[top.level] } : null;
  },
});
