// The gig panel following the page: on an artist, label, tag or album page the
// picker's first entry is that entity, and the panel lists where its tracks are
// used. Pure: no DOM, no I/O.
import { buildMembershipIndex } from './gig-membership.js';
import { pickerGroups, localDay } from './unified-playlists.js';
import { entityTracks, ENTITY_TYPES } from './detail-panel.js';

/** The entity a route's page is about, or null when the page is not an artist, label, tag or album page. */
export function pageEntity(route) {
    if (!route || !ENTITY_TYPES.includes(route.view)) return null;
    const name = String(route.name ?? '');
    if (!name.trim()) return null;
    // An album is its name and its artist: two artists can share a title.
    return route.view === 'album' && route.artist ? { type: 'album', name, artist: String(route.artist) } : { type: route.view, name };
}

const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/** The entity's tracks; an album with an artist keeps only that artist's, as the album page does. */
function tracksOf(tracks, entity) {
    const found = entityTracks(tracks || [], entity.type, entity.name);
    return entity.type === 'album' && entity.artist ? found.filter((t) => same(t.artist, entity.artist)) : found;
}

/**
 * Where an entity's tracks are used: gigs, then standalone playlists, in the
 * picker's group order; each with the playlists that hold any of the tracks, and
 * under each playlist those tracks as the playlist lists them. The derived BPM
 * playlist is never listed.
 *   → [{ gigId, name, gigDate, standalone, playlists: [{ laneId, name, tracks }] }]
 */
export function followModel(records, tracks, entity, { today = localDay(), index = buildMembershipIndex(records) } = {}) {
    if (!entity) return [];
    const mine = new Map(tracksOf(tracks, entity).map((t) => [String(t.id), t]));
    const held = new Set();
    for (const id of mine.keys()) for (const e of index.get(id) || []) held.add(`${e.gigId}\n${e.laneId}`);
    if (!held.size) return [];
    const out = [];
    for (const group of pickerGroups(records, today)) {
        for (const rec of group.items) {
            const playlists = (rec.playlists || [])
                .filter((lane) => lane && !lane.isBpmRoll && lane.id != null && held.has(`${rec.id}\n${lane.id}`))
                .map((lane) => ({ laneId: String(lane.id), name: String(lane.name ?? ''), tracks: [...new Set((lane.trackIds || []).map(String))].filter((id) => mine.has(id)).map((id) => mine.get(id)) }));
            if (playlists.length) out.push({ gigId: String(rec.id), name: String(rec.name ?? ''), gigDate: rec.gigDate || null, standalone: Boolean(rec.standalone), playlists });
        }
    }
    return out;
}
