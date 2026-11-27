// Gigs (P5.1) — named folders of ordered playlists, one per gig. A gig is:
//   { id, name, gigDate, createdAt, updatedAt, playlists: [{ name, trackIds[] }] }
//
// Access helpers take the shared MusicDatabase instance for call-site
// compatibility; durable reads/writes go through the db client.
//
// Playlist-level helpers (add-track, remove-track, reorder-lanes) land with
// P5.3 alongside the scoped gig view.

import { dbGetAll, dbGet, dbDelete, dbFetch } from './db-client.js';

const STORE = 'gigs';

// Every durable gig write notifies these; the app drops its membership index
// on any of them and rebuilds on the next read.
const listeners = new Set();
export function onGigsChanged(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { for (const fn of listeners) { try { fn(); } catch (_) { /* listener errors never break a write */ } } }
/** Tell listeners the gigs they hold are stale (a gig was found gone) without writing. */
export const gigsChanged = () => notify();

async function put(database, rec) {
    // Preserve stable lane identities as older index-only gigs are edited.
    for (const lane of rec.playlists || []) lane.id ||= crypto.randomUUID();
    return dbFetch(`/gigs/${encodeURIComponent(rec.id)}/mutate`, {
        method: 'POST',
        body: {
            gig: rec,
            expectedRevision: Number(rec.revision || 0),
            idempotencyKey: crypto.randomUUID(),
        },
    }).then((result) => { notify(); return result.gig; });
}

/** Write a whole record through `/mutate` (one record per request). Used by
 *  the Unified playlist helpers, which need the same revision contract. */
export const saveGig = (database, rec) => put(database, rec);

function getAll(database) {
    return dbGetAll(STORE);
}

export async function createGig(database, { name, gigDate = null } = {}) {
    const now = Date.now();
    const rec = {
        id: crypto.randomUUID(),
        name: String(name || '').trim() || 'Untitled gig',
        gigDate: gigDate || null,
        createdAt: now,
        updatedAt: now,
        playlists: [],
    };
    return put(database, rec);
}

export async function listGigs(database, { sort = 'updatedAt' } = {}) {
    const rows = await getAll(database);
    if (sort === 'gigDate') {
        // Unscheduled (null) last; ascending by date otherwise.
        rows.sort((a, b) => {
            const ax = a.gigDate || null;
            const bx = b.gigDate || null;
            if (ax === bx) return (b.updatedAt || 0) - (a.updatedAt || 0);
            if (ax == null) return 1;
            if (bx == null) return -1;
            return ax.localeCompare(bx);
        });
    } else {
        rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }
    return rows;
}

export async function getGig(database, id) {
    if (!id) return null;
    return dbGet(STORE, id);
}

export async function renameGig(database, id, name) {
    const existing = await getGig(database, id);
    if (!existing) return null;
    const next = String(name || '').trim();
    if (!next) return existing;
    existing.name = next;
    existing.updatedAt = Date.now();
    return put(database, existing);
}

export async function setGigDate(database, id, gigDate) {
    const existing = await getGig(database, id);
    if (!existing) return null;
    existing.gigDate = gigDate || null;
    existing.updatedAt = Date.now();
    return put(database, existing);
}

export async function deleteGig(database, id) {
    await dbDelete(STORE, id);
    notify();
}

// Lazy migration: lanes created before stable ids get one on first edit.
export async function ensureLaneIds(database, gig) {
    if (!gig || !Array.isArray(gig.playlists)) return gig;
    if (gig.playlists.every((lane) => lane && lane.id)) return gig;
    return put(database, gig);
}

// One transactional write for an N-lane edit. Returns null for a gig that no
// longer exists, and tells listeners, so what they hold (the membership
// index) is read again; a stale revision (409) or refused lane (400) rejects
// with the server's message so the editor can toast it and reload.
export async function setLaneMembership(database, gigId, { trackIds, addLaneIds = [], removeLaneIds = [] } = {}) {
    const gone = () => { notify(); return null; };
    const current = await getGig(database, gigId);
    if (!current) return gone();
    try {
        const result = await dbFetch(`/gigs/${encodeURIComponent(gigId)}/membership`, {
            method: 'PATCH',
            body: { expectedRevision: Number(current.revision || 0), idempotencyKey: crypto.randomUUID(), trackIds: [...(trackIds || [])].map(String), addLaneIds, removeLaneIds },
        });
        notify();
        return result.gig;
    } catch (err) {
        if (/failed: 404/.test(err?.message || '')) return gone();
        throw err;
    }
}

export async function gigCountByGigMonth(database) {
    const rows = await getAll(database);
    const out = new Map();
    for (const g of rows) {
        if (!g.gigDate || typeof g.gigDate !== 'string' || g.gigDate.length < 7) continue;
        const ym = g.gigDate.slice(0, 7);
        out.set(ym, (out.get(ym) || 0) + 1);
    }
    return out;
}

export async function gigCount(database) {
    return (await dbGetAll(STORE)).length;
}

export async function addPlaylistToGig(database, id, { name, trackIds = [] } = {}) {
    const existing = await getGig(database, id);
    if (!existing) return null;
    const lane = {
        name: String(name || '').trim() || 'Untitled playlist',
        trackIds: Array.isArray(trackIds) ? [...trackIds] : [],
    };
    existing.playlists = Array.isArray(existing.playlists) ? [...existing.playlists, lane] : [lane];
    existing.updatedAt = Date.now();
    return put(database, existing);
}

// ── Playlist-lane helpers (P5.3) ────────────────────────────────────────

export async function renameGigPlaylist(database, id, laneIdx, name) {
    const g = await getGig(database, id);
    if (!g || !Array.isArray(g.playlists) || !g.playlists[laneIdx]) return null;
    const next = String(name || '').trim();
    if (!next) return g;
    g.playlists[laneIdx].name = next;
    g.updatedAt = Date.now();
    return put(database, g);
}

export async function removeGigPlaylist(database, id, laneIdx) {
    const g = await getGig(database, id);
    if (!g || !Array.isArray(g.playlists) || !g.playlists[laneIdx]) return null;
    g.playlists.splice(laneIdx, 1);
    g.updatedAt = Date.now();
    return put(database, g);
}

export async function moveGigPlaylist(database, id, fromIdx, toIdx) {
    const g = await getGig(database, id);
    if (!g || !Array.isArray(g.playlists)) return null;
    const len = g.playlists.length;
    if (fromIdx < 0 || fromIdx >= len || toIdx < 0 || toIdx >= len || fromIdx === toIdx) return g;
    const [moved] = g.playlists.splice(fromIdx, 1);
    g.playlists.splice(toIdx, 0, moved);
    g.updatedAt = Date.now();
    return put(database, g);
}

export async function addTracksToGigPlaylist(database, id, laneIdx, trackIds) {
    const g = await getGig(database, id);
    if (!g || !Array.isArray(g.playlists) || !g.playlists[laneIdx]) return null;
    const lane = g.playlists[laneIdx];
    const existing = new Set(lane.trackIds || []);
    for (const tid of trackIds || []) {
        if (tid == null) continue;
        if (existing.has(tid)) continue;
        lane.trackIds.push(tid);
        existing.add(tid);
    }
    g.updatedAt = Date.now();
    return put(database, g);
}

export async function removeTrackFromGigPlaylist(database, id, laneIdx, trackId) {
    const g = await getGig(database, id);
    if (!g || !Array.isArray(g.playlists) || !g.playlists[laneIdx]) return null;
    const lane = g.playlists[laneIdx];
    lane.trackIds = (lane.trackIds || []).filter((x) => x !== trackId);
    g.updatedAt = Date.now();
    return put(database, g);
}

export async function reorderTrackInGigPlaylist(database, id, laneIdx, fromIdx, toIdx) {
    const g = await getGig(database, id);
    if (!g || !Array.isArray(g.playlists) || !g.playlists[laneIdx]) return null;
    const lane = g.playlists[laneIdx];
    const ids = lane.trackIds || [];
    const len = ids.length;
    if (fromIdx < 0 || fromIdx >= len || toIdx < 0 || toIdx >= len || fromIdx === toIdx) return g;
    const [moved] = ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, moved);
    lane.trackIds = ids;
    g.updatedAt = Date.now();
    return put(database, g);
}

/** Replace the entire `playlists` array in one shot. Used by "prune broken
 *  tracks" which rewrites several lanes at once. Caller is responsible for
 *  preserving lane shape ({ name, trackIds, isBpmRoll? }). */
export async function setGigPlaylists(database, id, playlists) {
    const g = await getGig(database, id);
    if (!g) return null;
    g.playlists = Array.isArray(playlists) ? playlists : [];
    g.updatedAt = Date.now();
    return put(database, g);
}

/** Toggle whether this gig should appear in ~/Music/umm.xml. Default
 *  (false/undefined) → included; true → skipped by the unified-XML writer
 *  and by `_buildAllGigsPayload`. The gig itself stays in IDB regardless. */
export async function setGigHideFromRekordbox(database, id, hide) {
    const g = await getGig(database, id);
    if (!g) return null;
    g.hideFromRekordbox = !!hide;
    g.updatedAt = Date.now();
    return put(database, g);
}

/** Bulk variant: set `hideFromRekordbox` on every gig in one pass. Used by
 *  "Wipe sidebar" to clear the Rekordbox-facing umm.xml without touching
 *  any actual gig data. Returns the count of gigs updated. */
export async function setHideFromRekordboxAll(database, hide) {
    const rows = await getAll(database);
    let touched = 0;
    for (const g of rows) {
        const want = !!hide;
        if (!!g.hideFromRekordbox === want) continue;
        g.hideFromRekordbox = want;
        g.updatedAt = Date.now();
        await put(database, g);
        touched += 1;
    }
    return touched;
}

// Every new gig starts with the same empty workspace. These lanes are only a
// skeleton: tagged tracks are never copied into them automatically. BPM stays
// auto-derived from the other lanes once the user has added tracks there.
const GIG_SKELETON_LANES = [
    { name: '++', trackIds: [] },
    { name: 'intro/transo', trackIds: [] },
    { name: 'BPM', trackIds: [], isBpmRoll: true },
];

export async function seedDefaultGigLanes(database, id) {
    const g = await getGig(database, id);
    if (!g) return null;
    if (Array.isArray(g.playlists) && g.playlists.length) return g;
    g.playlists = GIG_SKELETON_LANES.map((lane) => ({ ...lane, trackIds: [] }));
    g.updatedAt = Date.now();
    return put(database, g);
}

// ── Auto-derived "BPM" lane ─────────────────────────────────────────────

const parseBpm = (v) => {
    if (v == null || v === '') return NaN;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : NaN;
};

/** Compute the trackIds for an auto-derived BPM lane: deduped union of every
 *  OTHER lane in the gig, sorted by BPM ascending. Tracks with no/invalid BPM
 *  sort to the bottom (in their original union order). `byId` is a Map of
 *  trackId → unified track record; missing tracks are kept (sorted to the
 *  bottom, same as missing BPM) so the render path can still flag them. */
export function computeBpmRollTrackIds(gig, laneIdx, byId) {
    const playlists = Array.isArray(gig?.playlists) ? gig.playlists : [];
    const seen = new Set();
    const ordered = []; // preserve first-seen order for stable NaN-bucket sort
    for (let i = 0; i < playlists.length; i += 1) {
        if (i === laneIdx) continue;
        const p = playlists[i];
        if (p?.isBpmRoll) continue; // never recurse into another BPM lane
        for (const tid of (p?.trackIds || [])) {
            if (tid == null || seen.has(tid)) continue;
            seen.add(tid);
            ordered.push(tid);
        }
    }
    // Stable sort: numeric BPM asc; NaN/missing → bottom in original order.
    return ordered
        .map((tid, idx) => {
            const t = byId?.get?.(tid);
            return { tid, bpm: parseBpm(t?.bpm), idx };
        })
        .sort((a, b) => {
            const aN = Number.isNaN(a.bpm);
            const bN = Number.isNaN(b.bpm);
            if (aN && bN) return a.idx - b.idx;
            if (aN) return 1;
            if (bN) return -1;
            if (a.bpm !== b.bpm) return a.bpm - b.bpm;
            return a.idx - b.idx;
        })
        .map((x) => x.tid);
}

/** Lazy migration: tag any lane named "BPM" (case-insensitive trim) that has
 *  empty `trackIds` as `isBpmRoll: true`. Lanes named "BPM" with manually
 *  curated tracks are LEFT ALONE — flipping them would discard the user's
 *  work. Returns a possibly-mutated copy of the gig (and persists if changed).
 *  Safe to call repeatedly; idempotent once the flag is set. */
export async function ensureBpmRollFlag(database, gig) {
    if (!gig || !Array.isArray(gig.playlists) || !gig.playlists.length) return gig;
    let mutated = false;
    for (const lane of gig.playlists) {
        if (!lane || lane.isBpmRoll) continue;
        const name = String(lane.name || '').trim().toLowerCase();
        if (name !== 'bpm') continue;
        const ids = Array.isArray(lane.trackIds) ? lane.trackIds : [];
        if (ids.length) continue; // user has curated this lane manually — don't touch
        lane.isBpmRoll = true;
        lane.trackIds = [];
        mutated = true;
    }
    if (!mutated) return gig;
    gig.updatedAt = Date.now();
    return put(database, gig);
}
