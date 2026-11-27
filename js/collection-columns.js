// Collection › Tracks column layout: which data columns show and in what order.
// The play cell, favourite star and artwork lead every row and are not part
// of the layout. Persisted as the `collection_columns` setting. Also the
// table's two-level sort (`collection_table_sort`) and the selection bar's
// share of the track actions.

import { entityLinkHtml } from './entity-links.js';
import { buildRoute } from './router.js';
import { describeMembership } from './gig-membership.js';
import { escapeHtml } from './html.js';
import { stashIconHtml } from './player.js';
import { isStashedTrack } from './stash.js';


export const DEFAULT_COLUMN_ORDER = Object.freeze([
    'bpm', 'title', 'artist', 'genre', 'comments', 'album', 'label', 'year',
    'status', 'date_added', 'gigs', 'source', 'key', 'dig',
]);
export const DEFAULT_HIDDEN_COLUMNS = Object.freeze(['date_added', 'gigs', 'source', 'key', 'dig']);
export const REQUIRED_COLUMNS = Object.freeze(['title', 'artist']);

/** Render the Collection title cell as the canonical route to a track page. */
/** A stashed track's mark after its title, in playlist and gig tables. */
export const stashMarkHtml = (track) => (isStashedTrack(track) ? `<span class="stash-mark" title="Stashed">${stashIconHtml(true)}</span>` : '');

export function collectionTrackTitleCell(track, app = null) {
    const title = String(track?.title || '');
    if (!title) return '<td></td>';
    return `<td title="${escapeHtml(title)}">${entityLinkHtml({
        type: 'track',
        name: track?.id,
        text: title,
        extraClass: 'cell-track-link',
    })}${app?._tablePlaylist ? stashMarkHtml(track) : ''}</td>`;
}

/** Merge a saved `{ order, hidden }` layout with the known column keys. Keys the
 *  saved layout has never seen join at the end with their default visibility. */
export function resolveColumnLayout(saved, knownKeys = DEFAULT_COLUMN_ORDER) {
    const known = new Set(knownKeys);
    const savedOrder = [...new Set(Array.isArray(saved?.order) ? saved.order : [])].filter((key) => known.has(key));
    const seen = new Set(savedOrder);
    const unseen = knownKeys.filter((key) => !seen.has(key));
    const hidden = new Set((Array.isArray(saved?.hidden) ? saved.hidden : []).filter((key) => known.has(key)));
    for (const key of unseen) if (DEFAULT_HIDDEN_COLUMNS.includes(key)) hidden.add(key);
    for (const key of REQUIRED_COLUMNS) hidden.delete(key);
    return { order: [...savedOrder, ...unseen], hidden };
}

/** Move `dragged` to the slot `target` holds. Returns a new order, or null when
 *  either key is missing. */
export function moveColumn(order, dragged, target) {
    if (!dragged || !target || dragged === target) return null;
    const keys = [...order];
    const from = keys.indexOf(dragged);
    const to = keys.indexOf(target);
    if (from < 0 || to < 0) return null;
    keys.splice(from, 1);
    keys.splice(to < from ? to : to - 1, 0, dragged);
    return keys;
}

/** Reveal `key` and place it immediately after the heading that opened the
 *  column menu. Fixed leading headings fall back to the first data-column slot;
 *  a playlist's trailing × heading falls back to the end. */
export function showColumnAfter(layout, key, afterKey) {
    const order = [...(layout?.order || [])];
    const hidden = new Set(layout?.hidden || []);
    hidden.delete(key);

    const from = order.indexOf(key);
    if (from < 0) return { ...layout, order, hidden };
    order.splice(from, 1);

    let at;
    if (afterKey === '__remove') at = order.length;
    else if (['__play', '__fav', 'art', '__pos'].includes(afterKey)) at = 0;
    else {
        const anchor = order.indexOf(afterKey);
        at = anchor >= 0 ? anchor + 1 : Math.min(from, order.length);
    }
    order.splice(at, 0, key);
    return { ...layout, order, hidden };
}

const sortEntry = (entry) => (entry && typeof entry === 'object' && typeof entry.key === 'string' && entry.key
    ? { key: entry.key, dir: entry.dir === 'asc' ? 'asc' : 'desc' } : null);

/** The saved `collection_table_sort` as `[{ key, dir }, { key, dir }?]`. The
 *  old setting was one `{ key, dir }`; it reads as a one-element array. With
 *  `knownKeys`, keys outside it (a column that no longer sorts) are dropped. */
export function normalizeSort(saved, knownKeys = null) {
    const known = knownKeys ? new Set(knownKeys) : null;
    const entries = (Array.isArray(saved) ? saved : [saved]).map(sortEntry).filter((entry) => entry && (!known || known.has(entry.key)));
    const sorts = [];
    for (const entry of entries) {
        if (sorts.length === 2) break;
        if (!sorts.some((s) => s.key === entry.key)) sorts.push(entry);
    }
    return sorts;
}

const flip = (entry) => ({ key: entry.key, dir: entry.dir === 'asc' ? 'desc' : 'asc' });

/** The sort after a heading click. A click sorts by `key` alone, or flips it
 *  when it is already the primary. Shift-click flips the primary or the second
 *  when it is one of them, else makes `key` the second sort, descending. */
export function nextSort(current, key, { shift = false } = {}) {
    const [first, second] = normalizeSort(current);
    if (first?.key === key) return [flip(first), ...(second ? [second] : [])];
    if (!shift || !first) return [{ key, dir: 'asc' }];
    if (second?.key === key) return [first, flip(second)];
    return [first, { key, dir: 'desc' }];
}

/** The route a Playlists cell link opens: that playlist, keeping the Collection filter. */
export function playlistLinkRoute(gigId, laneId, filter = null) {
    return { view: 'playlists', kind: 'u', id: String(gigId), lane: String(laneId), ...(filter ? { filter } : {}) };
}

/** One comparator for the whole sort: each entry's column `compare`, in its
 *  direction, breaking the ties of the one before. Unknown keys are skipped. */
export function sortComparator(sorts, byKey) {
    const steps = normalizeSort(sorts)
        .map(({ key, dir }) => ({ compare: byKey?.get(key)?.compare, sign: dir === 'desc' ? -1 : 1 }))
        .filter((step) => typeof step.compare === 'function');
    return (a, b) => {
        for (const { compare, sign } of steps) {
            const r = compare(a, b);
            if (r) return sign * r;
        }
        return 0;
    };
}

/** The Playlists cell: every playlist holding the track, each linked to its
 *  page; blank when none. `entries` come from the gig membership index. */
export function playlistsCellHtml(trackId, entries) {
    const list = Array.isArray(entries) ? entries : [];
    const open = `<td class="col-playlists" data-membership-id="${escapeHtml(trackId)}"`;
    if (!list.length) return `${open}></td>`;
    const links = list.map((e) => {
        const href = buildRoute(playlistLinkRoute(e.gigId, e.laneId));
        return `<a href="${escapeHtml(href)}" class="cell-playlist-link" data-playlist-gig="${escapeHtml(e.gigId)}" data-playlist-lane="${escapeHtml(e.laneId)}">${escapeHtml(describeMembership([e]))}</a>`;
    });
    return `${open} title="${escapeHtml(describeMembership(list))}">${links.join(', ')}</td>`;
}

/** The selection bar's track actions, in its order. The shared list keeps its
 *  other entries for the row menu and keyboard shortcuts. */
export const SELECTION_BAR_ACTIONS = Object.freeze(['play-next', 'queue', 'playlist']);
export function selectionBarActions(items) {
    const byId = new Map((items || []).map((item) => [item.id, item]));
    return SELECTION_BAR_ACTIONS.map((id) => byId.get(id)).filter(Boolean);
}

const SOUND_ATTENTION = ['do-not-play', 'replace-first', 'listen-first'];
const FILES_ATTENTION = ['flaconly', 'drift'];

/** The one thing a row needs from its owner, or null. Sound problems outrank file
 *  problems. Unscanned, MP3-only and still-loading rows need nothing: a missing
 *  scan or a missing archive copy is not a problem with the track. */
export function attentionFor(soundKey, filesStatus) {
    if (SOUND_ATTENTION.includes(soundKey)) return { kind: 'sound', key: soundKey };
    if (FILES_ATTENTION.includes(filesStatus)) return { kind: 'files', key: filesStatus };
    return null;
}
