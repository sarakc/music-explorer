import { defineSignal } from './_define.js';
// Fact signals: they join the blend only when the relation exists (Sara,
// 2026-11-01); with no relation the pair is not covered, never scored 0.
// Their chance baseline is 0.
export function relationSignal({ id, defaultWeight, kinds, value }) {
  const hit = (a, b) => (a.relations || []).find((r) => r.other === b.id && kinds.includes(r.kind));
  return defineSignal({
    id, source: 'discogs', defaultWeight, relation: true,
    covers: (p) => (p.relations || []).some((r) => kinds.includes(r.kind)),
    sim: (a, b) => (hit(a, b) ? value : null),
    explain: (a, b) => ({ kind: hit(a, b)?.kind, name: b.name }),
  });
}
