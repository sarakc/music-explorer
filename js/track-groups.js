// Group in Tracks' ⋯ menu: None, Genre, Subgenre, Tag, Label. Grouped rows sort
// by the group's value first (A–Z, no value last), and a leading column names
// the group on the first row of each run, so rows keep one height and the table
// stays windowed. A track with several values groups under the first, A–Z.
import { splitGenreField } from './filter-rules.js';
import { tagsOf } from './entity-index.js';

export const GROUPINGS = [['none', 'None'], ['genre', 'Genre'], ['subgenre', 'Subgenre'], ['tag', 'Tag'], ['label', 'Label']];
const KEY = 'umm.tracksGroup';
const READ = {
    genre: (t) => splitGenreField(t.genre).genres,
    subgenre: (t) => splitGenreField(t.genre).subgenres,
    tag: (t) => tagsOf(t),
    label: (t) => [t.label],
};
const alpha = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });

export const isGrouping = (g) => GROUPINGS.some(([id]) => id === g);

export function readGroup(storage = globalThis.localStorage) {
    try { const g = storage?.getItem(KEY); return isGrouping(g) ? g : 'none'; } catch (_) { return 'none'; }
}

export function writeGroup(group, storage = globalThis.localStorage) {
    try { storage?.setItem(KEY, isGrouping(group) ? group : 'none'); } catch (_) { /* a preference only */ }
}

/** The value a track groups under: its first, A–Z, or '' with none. */
export function groupValue(track, group) {
    const read = READ[group];
    if (!read || !track) return '';
    const values = (read(track) || []).map((v) => String(v ?? '').trim()).filter(Boolean).sort(alpha);
    return values[0] || '';
}

/** Rows sorted by group value (no value last), keeping the given order within a group. */
export function groupTracks(tracks, group) {
    if (!READ[group]) return tracks;
    const keyed = tracks.map((t, i) => ({ t, i, v: groupValue(t, group) }));
    keyed.sort((a, b) => (!a.v - !b.v) || alpha(a.v, b.v) || a.i - b.i);
    return keyed.map((k) => k.t);
}

/** The group label for row `idx` of `ordered`: the value on the first row of a run, '' elsewhere. */
export function groupLabelAt(ordered, idx, group) {
    const v = groupValue(ordered[idx], group);
    if (idx > 0 && groupValue(ordered[idx - 1], group) === v) return '';
    return v || 'No value';
}
