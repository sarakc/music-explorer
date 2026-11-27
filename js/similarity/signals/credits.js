import { defineSignal } from './_define.js';
// Shared credited people (producer, remixer, engineer, mixer, main artist),
// decaying over the co-credit graph: a shared person 1, two people credited
// together 0.5, one person between them 0.25.
const DECAY = [1, 0.5, 0.25];

// A person both sides already share as artist is counted by the artist signal; credits
// leaves them out, except between two artists (the artist signal skips those pairs).
function peopleOf(a, b) {
  if (a.type === 'artist' && b.type === 'artist') return [a.people, b.people];
  const [few, many] = a.artists.size <= b.artists.size ? [a.artists, b.artists] : [b.artists, a.artists];
  let both = null;
  for (const k of few.keys()) if (many.has(k) && (a.people.has(k) || b.people.has(k))) (both ||= new Set()).add(k);
  if (!both) return [a.people, b.people];
  const drop = (set) => new Set([...set].filter((k) => !both.has(k)));
  return [drop(a.people), drop(b.people)];
}

function walk(a, b, index) {
  const [pa, pb] = peopleOf(a, b);
  if (!pa.size || !pb.size) return { hop: null };
  const [small, large] = pa.size <= pb.size ? [pa, pb] : [pb, pa];
  const shared = [...small].filter((k) => large.has(k));
  if (shared.length) return { hop: 0, shared };
  let frontier = new Set(small);
  const seen = new Set(small);
  for (let hop = 1; hop < DECAY.length; hop++) {
    const next = new Set();
    for (const k of frontier) for (const n of index.people.get(k) || []) {
      if (large.has(n)) return { hop, via: n };
      if (!seen.has(n)) { seen.add(n); next.add(n); }
    }
    frontier = next;
  }
  return { hop: null };
}

export default defineSignal({
  id: 'credits', source: 'discogs', defaultWeight: 2,
  covers: (p) => p.people.size > 0,
  sim(a, b, { index }) { const { hop } = walk(a, b, index); return hop === null ? 0 : DECAY[hop]; },
  explain(a, b, { index }) {
    const r = walk(a, b, index), name = (k) => index.personNames.get(k) ?? k;
    if (r.hop === 0) return { shared: r.shared.slice(0, 3).map(name), sharedCount: r.shared.length, hops: 1 };
    return r.hop === null ? { hops: null } : { via: name(r.via), hops: r.hop + 1 };
  },
});
