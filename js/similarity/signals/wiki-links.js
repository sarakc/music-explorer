import { defineSignal } from './_define.js';
// Their English Wikipedia articles link to each other: one way 0.6, both 1.
// A fact signal, counted only when a link exists. One of the Wikipedia
// signals the blend caps together (`groupCaps.wikipedia`).
export default defineSignal({
  id: 'wiki-links', source: 'wikipedia', defaultWeight: 1.5, relation: true, group: 'wikipedia',
  covers: (p) => (p.wikiOut?.size || 0) + (p.wikiIn?.size || 0) > 0,
  sim(a, b) {
    const ab = a.wikiOut?.has(b.id) || false, ba = b.wikiOut?.has(a.id) || false;
    return ab && ba ? 1 : ab || ba ? 0.6 : null;
  },
  explain: (a, b) => ({ both: Boolean(a.wikiOut?.has(b.id) && b.wikiOut?.has(a.id)) }),
});
