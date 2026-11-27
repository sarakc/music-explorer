// Index data for Collection › Artists, Albums, Labels and Tags. Pure: tracks
// in, tiles out. Matching follows the entity pages: trimmed, case-insensitive.

import { mosaicCovers } from './cover-art.js';
import { entityId } from './credits-graph.js';
import { linkState } from './link-rules.js';

export const INDEX_CHUNK = 120;
const KIND_TYPE = { artists: 'artist', albums: 'album', labels: 'label', tags: 'tag' };
const norm = (s) => String(s ?? '').trim().toLowerCase();
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.key.localeCompare(b.key);

/** A track's tags: the `tags` array, else comma-separated comments (as filter-engine.js reads them). */
export function tagsOf(t) {
    if (t?.tags && Array.isArray(t.tags) && t.tags.length) return t.tags;
    if (!t?.comments) return [];
    return t.comments.split(',').map((x) => x.trim()).filter(Boolean);
}

/** Tracks belonging to `within` ({ type: 'artist'|'label'|'tag', name }); all tracks without one. */
export function withinTracks(tracks, within) {
    if (!within?.type || !norm(within.name)) return tracks || [];
    const needle = norm(within.name);
    if (within.type === 'tag') return (tracks || []).filter((t) => tagsOf(t).some((tg) => norm(tg) === needle));
    return (tracks || []).filter((t) => norm(t?.[within.type]) === needle);
}

function keysOf(t, kind) {
    if (kind === 'tags') return tagsOf(t).map((tg) => [norm(tg), String(tg).trim()]).filter(([k]) => k);
    if (kind === 'albums') {
        const album = String(t.album ?? '').trim(), artist = String(t.artist ?? '').trim();
        return album ? [[`${norm(artist)}|${norm(album)}`, album, artist]] : [];
    }
    const name = String(t[KIND_TYPE[kind]] ?? '').trim();
    return name ? [[norm(name), name]] : [];
}

/** One item per distinct artist, album (by artist), label or tag, with its count, last added date and covers. */
export function buildEntityIndex(tracks, kind) {
    const type = KIND_TYPE[kind];
    if (!type) return [];
    const map = new Map();
    for (const t of tracks || []) {
        if (!t) continue;
        const seen = new Set();
        for (const [key, name, artist] of keysOf(t, kind)) {
            if (seen.has(key)) continue;
            seen.add(key);
            let item = map.get(key);
            if (!item) {
                item = { type, key, name, count: 0, addedAt: '', tracks: [] };
                if (kind === 'albums') item.artist = artist;
                map.set(key, item);
            }
            item.count++;
            if ((t.date_added || '') > item.addedAt) item.addedAt = t.date_added;
            item.tracks.push(t);
        }
    }
    const out = [];
    for (const { tracks: own, ...item } of map.values()) {
        const recent = [...own].sort((a, b) => String(b.date_added || '').localeCompare(String(a.date_added || '')));
        out.push({ ...item, covers: mosaicCovers(recent, kind === 'albums' ? 1 : 4) });
    }
    return out;
}

/** Keys of favorited items of this kind (album favorites are stored `Artist::Album`). */
export function favoriteKeys(favs, kind) {
    const type = KIND_TYPE[kind];
    const out = new Set();
    for (const f of favs || []) {
        if (f?.type !== type || f.name == null) continue;
        if (type === 'album') {
            const i = String(f.name).indexOf('::');
            if (i >= 0) out.add(`${norm(f.name.slice(0, i))}|${norm(f.name.slice(i + 2))}`);
        } else out.add(norm(f.name));
    }
    return out;
}

/**
 * Keep favorites only when `favKeys` is set, then sort. `first` (the search field's text, which
 * the filter has already applied to the tracks) puts the items whose own name matches it first.
 */
export function queryIndex(items, { first = '', sort = 'name', favKeys = null } = {}) {
    const q = norm(first);
    const out = (items || []).filter((it) => !favKeys || favKeys.has(it.key));
    const cmp = sort === 'tracks' ? (a, b) => b.count - a.count || byName(a, b)
        : sort === 'recent' ? (a, b) => String(b.addedAt).localeCompare(String(a.addedAt)) || byName(a, b)
            : byName;
    const named = (it) => (q && norm(it.name).includes(q) ? 0 : 1);
    return [...out].sort((a, b) => named(a) - named(b) || cmp(a, b));
}

/** The page an item opens. */
export function itemRoute(item) {
    return item.type === 'album' ? { view: 'album', name: item.name, artist: item.artist || '' } : { view: item.type, name: item.name };
}

/** Artists or labels with no linked Bandcamp page (entity_links rows), suggested ones marked. */
export function missingBandcamp(items, linkRows) {
    const byId = new Map((linkRows || []).map((r) => [r?.entityId, r]));
    const out = [];
    for (const it of items || []) {
        const state = linkState(byId.get(entityId(it.type, it.name))?.bandcamp);
        if (state !== 'linked') out.push(state === 'suggested' ? { ...it, suggested: true } : it);
    }
    return out;
}
