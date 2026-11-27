// Wikipedia category classifier. Pure. Each non-hidden category is one of:
//   restates   it says what a field already says (a birth or death year, "Living people",
//              a known label's "… artists", "… from <place>", a group's founding or
//              disbanding year, a known genre's "… musicians"): it may fill that field
//              when the field is empty, and never counts as a category of its own
//   dropped    popularity (awards, prizes, halls of fame, charts, certifications)
//   kept       everything else, for the wiki-categories signal
// `known` names what the facts already hold: { labels, genres, groups, artists }, lists of names.

// Chart positions also come as "number-one singles".
export const POPULARITY = /award|prize|hall of fame|winners|nominees|chart|certified|number-one/i;
const PEOPLE_ROLES = ['record producers', 'musicians', 'DJs', 'bands', 'singers', 'rappers', 'music groups', 'musical groups', 'groups', 'duos', 'trios'];
const WORK_KINDS = ['albums', 'EPs', 'singles', 'songs'];
const LABEL_SUFFIX = /\s+(records|recordings|music|label|records ltd|entertainment)$/;

/** Names compare without case, accents, punctuation or a leading "the". */
export function normaliseName(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[-‐–]/g, ' ').replace(/^the\s+/, '').replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
}
const labelKey = (s) => normaliseName(s).replace(LABEL_SUFFIX, '').trim();

const strip = (c) => String(c ?? '').replace(/^Category:/, '').trim();

function knownSets(known = {}) {
  const set = (list, key = normaliseName) => new Set((list || []).map(key).filter(Boolean));
  return { labels: set(known.labels, labelKey), genres: set(known.genres), groups: set(known.groups), artists: set(known.artists) };
}

/** The longest trailing run of `words` that is a known genre: "English house" → "house". */
function genreSuffix(prefix, genres) {
  const words = prefix.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const tail = words.slice(i).join(' ');
    if (genres.has(normaliseName(tail))) return tail;
  }
  return null;
}

const endsWithWord = (name, words) => words.find((w) => name.endsWith(` ${w}`));

/** One category → { kind: 'kept'|'restates'|'dropped', field?, value? }. */
export function classifyCategory(category, sets) {
  const name = strip(category);
  if (POPULARITY.test(name)) return { kind: 'dropped' };
  let m;
  if ((m = /^(\d{3,4}) births$/.exec(name))) return { kind: 'restates', field: 'born', value: m[1] };
  if ((m = /^(\d{3,4}) deaths$/.exec(name))) return { kind: 'restates', field: 'died', value: m[1] };
  if (name === 'Living people') return { kind: 'restates', field: 'living', value: true };
  if ((m = /^(?:musical groups|music groups|musical duos|musical trios|record labels) (established|disestablished) in (\d{4})$/i.exec(name))) {
    return { kind: 'restates', field: m[1].toLowerCase() === 'established' ? 'begin' : 'end', value: m[2] };
  }
  if ((m = /^(\d{4}) (establishments|disestablishments) in .+$/.exec(name))) return { kind: 'restates', field: m[2] === 'establishments' ? 'begin' : 'end', value: m[1] };
  if ((m = /^(\d{4}) (albums|EPs|singles|songs)$/.exec(name))) return { kind: 'restates', field: 'released', value: m[1] };
  if ((m = /^.+? from (.+)$/.exec(name))) return { kind: 'restates', field: 'place', value: m[1].replace(/^the\s+/, '') };
  if ((m = /^(.+) members$/.exec(name)) && sets.groups.has(normaliseName(m[1]))) return { kind: 'restates', field: 'memberOf', value: m[1] };
  if ((m = /^(.+) artists$/.exec(name)) && sets.labels.has(labelKey(m[1]))) return { kind: 'restates', field: 'labels', value: m[1] };
  const work = endsWithWord(name, WORK_KINDS);
  if (work) {
    const prefix = name.slice(0, -work.length - 1);
    if (sets.labels.has(labelKey(prefix))) return { kind: 'restates', field: 'labels', value: prefix };
    if (sets.artists.has(normaliseName(prefix))) return { kind: 'restates', field: 'artist', value: prefix };
    const genre = genreSuffix(prefix, sets.genres);
    if (genre) return { kind: 'restates', field: 'genres', value: genre };
  }
  const role = endsWithWord(name, PEOPLE_ROLES);
  if (role) {
    const genre = genreSuffix(name.slice(0, -role.length - 1), sets.genres);
    if (genre) return { kind: 'restates', field: 'genres', value: genre };
  }
  return { kind: 'kept' };
}

/**
 * Categories (with or without the "Category:" prefix) →
 * { kept: [name], restates: [{ category, field, value }], dropped: [name] }.
 */
export function classifyCategories(categories, known = {}) {
  const sets = knownSets(known);
  const out = { kept: [], restates: [], dropped: [] };
  for (const raw of categories || []) {
    const category = strip(raw);
    if (!category) continue;
    const c = classifyCategory(category, sets);
    if (c.kind === 'restates') out.restates.push({ category, field: c.field, value: c.value });
    else out[c.kind].push(category);
  }
  return out;
}

/** Every category name in a classified set, in no particular order. */
export const allCategories = (c) => [...(c?.kept || []), ...(c?.restates || []).map((r) => r.category), ...(c?.dropped || [])];
