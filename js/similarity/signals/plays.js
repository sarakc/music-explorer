import { groupScore, sharedKeys } from './_cooccur.js';
import { defineSignal } from './_define.js';
import { idf } from '../math.js';
// Played in the same session (Unified plays within playWindowMin, or one Rekordbox DJ
// history): an IDF cosine over sessions (a session's IDF by the tracks it holds), times
// the evidence factor. Profiles carry sessions only once there are minSessions of them.
const weightOf = (index) => (index._sessionWeight ||= (s) => index.sessions.get(s)?.weight ?? 0);
export default defineSignal({
  id: 'plays', source: 'history', defaultWeight: 1, group: 'together',
  covers: (p) => p.sessions.size > 0,
  sim: (a, b, { index, cfg }) => groupScore(a, b, 'sessions', weightOf(index), cfg.cooccurK ?? 1, idf(2, index.n)),
  explain: (a, b) => ({ together: sharedKeys(a, b, 'sessions').length }),
});
