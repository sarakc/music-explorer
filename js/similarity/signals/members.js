import { defineSignal } from './_define.js';
// Member of, or members in common, from MusicBrainz, Wikidata and the infobox
// (owned artists only). Discogs membership is its own signal: a pair Discogs
// already joins as member-of is not counted again here.
const has = (set, id) => set != null && set.has(id);
const meets = (x, y) => { if (!x || !y) return false; for (const id of x) if (y.has(id)) return true; return false; };
const discogsMember = (a, b) => (a.relations || []).some((r) => r.other === b.id && r.kind === 'member-of');

function kindOf(a, b) {
  if (has(a.memberOf, b.id)) return discogsMember(a, b) ? null : 'member-of';
  if (has(a.memberList, b.id)) return discogsMember(a, b) ? null : 'has-member';
  if (meets(a.memberList, b.memberList)) return 'shared-member';
  if (meets(a.memberOf, b.memberOf)) return 'shared-group';
  return null;
}

export default defineSignal({
  id: 'members', source: 'facts', defaultWeight: 2, relation: true,
  covers: (p) => (p.memberOf?.size || 0) + (p.memberList?.size || 0) > 0,
  sim: (a, b) => (a.type === 'artist' && b.type === 'artist' && kindOf(a, b) ? 1 : null),
  explain: (a, b) => ({ kind: kindOf(a, b), name: b.name }),
});
