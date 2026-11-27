// Signal plug-in helper. A signal gives a fast `sim(a, b, ctx)` (a number, or
// null when the pair is not applicable) and an `explain(a, b, ctx)` that builds
// the readable detail. `score()` — the plug-in contract — composes the two;
// the blend calls `sim` for every candidate and `explain` only for kept rows.
// `relation: true` marks a fact signal (it counts only when the relation
// exists), whose chance baseline is 0. `group` (e.g. 'wikipedia', 'time') marks
// signals the blend caps together at `cfg.groupCaps[group]` weight in one pair.
export function defineSignal({ id, source, defaultWeight, covers, sim, explain, relation = false, group = null }) {
  return {
    id, source, defaultWeight, covers, sim, explain, relation, group,
    score(a, b, ctx) {
      const s = sim(a, b, ctx);
      return s === null ? null : { score: s, detail: explain(a, b, ctx) };
    },
  };
}
