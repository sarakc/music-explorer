import { defineSignal } from './_define.js';
// Sampled or covered each other (MusicBrainz, joined to owned tracks and
// artists). A fact signal: counted only when the link exists. Between two
// albums or tracks one link scores 1; where an artist is one side,
// min(1, n / 3) over the pair's sample and cover links. The reason says which
// way it goes.
const DIRS = ['samples', 'sampledBy', 'covers', 'coveredBy'];
const total = (c) => (c ? c.samples + c.sampledBy + c.covers + c.coveredBy : 0);

export default defineSignal({
  id: 'samples', source: 'musicbrainz', defaultWeight: 2, relation: true,
  covers: (p) => p.sampleLinks != null && p.sampleLinks.size > 0,
  sim(a, b) {
    const n = Math.max(total(a.sampleLinks?.get(b.id)), total(b.sampleLinks?.get(a.id)));
    if (!n) return null;
    return a.type === 'artist' || b.type === 'artist' ? Math.min(1, n / 3) : 1;
  },
  explain(a, b) {
    const c = a.sampleLinks?.get(b.id);
    return c ? { dir: DIRS.find((d) => c[d] > 0) ?? null, name: b.name, n: total(c) } : null;
  },
});
