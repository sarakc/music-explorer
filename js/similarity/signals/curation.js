import { groupScore, sharedKeys } from './_cooccur.js';
import { defineSignal } from './_define.js';
import { idf } from '../math.js';
// Together in the same gig playlist, playlist, Rekordbox list, crate or Shortlist: an IDF
// cosine over the groups (a group's IDF by the tracks it holds, someone else's list at
// followedGroupWeight), times the evidence factor n / (n + cooccurK), where each shared
// group adds its weight over a 2-track group's to n.
const weightOf = (index) => (index._groupWeight ||= (g) => index.contexts.get(g)?.weight ?? 0);
export default defineSignal({
  id: 'curation', source: 'curation', defaultWeight: 2, group: 'together',
  covers: (p) => p.contexts.size > 0,
  sim: (a, b, { index, cfg }) => groupScore(a, b, 'contexts', weightOf(index), cfg.cooccurK ?? 1, idf(2, index.n)),
  explain(a, b, { index }) {
    const both = sharedKeys(a, b, 'contexts');
    return { together: both.length, contexts: both.slice(0, 3).map((c) => index.contexts.get(c)?.name ?? c) };
  },
});
