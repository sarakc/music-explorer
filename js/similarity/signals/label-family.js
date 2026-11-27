import { labelFamily } from '../profiles.js';
import { defineSignal } from './_define.js';
// Sublabel of, or a shared parent label. Not covered without a relation, so
// its chance baseline is 0.
export default defineSignal({
  id: 'label-family', source: 'discogs', defaultWeight: 2, relation: true,
  covers: (p) => p.type === 'label' && (p.relations || []).some((r) => r.kind === 'sublabel-of'),
  sim: (a, b, { index }) => (a.type === 'label' && b.type === 'label' && labelFamily(a, b, index) ? 0.7 : null),
  explain: (a, b, { index }) => ({ kind: labelFamily(a, b, index) }),
});
