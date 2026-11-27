// Unified playlists: every playlist made in the app is a gig-store record. A
// playlist without a gig is a record with `standalone: true` and exactly one
// playlist named like the record; a gig is a folder of playlists. The helpers below
// move playlists between the two, keep `formerOrigins` so publications follow a
// playlist, and hand back an `undo` for every edit. Pure helpers come first;
// the async ones write through gigs.js (one record per request).
import { getGig, deleteGig, saveGig, setLaneMembership, gigsChanged } from './gigs.js';
import { laneDrop } from './gig-membership.js';

const str = (v) => String(v);
const uuid = () => crypto.randomUUID();
export const GIG_GONE = 'This gig no longer exists';

export const isStandalone = (rec) => Boolean(rec?.standalone);
export const recordOrigin = (rec) => `${isStandalone(rec) ? 'standalone' : 'gig'}:${rec.id}`;
/** Every publication origin that belongs to this record: its own, then the ones it absorbed. */
export const recordOrigins = (rec) => (rec ? [recordOrigin(rec), ...(Array.isArray(rec.formerOrigins) ? rec.formerOrigins : [])] : []);
const lanesOf = (rec) => (Array.isArray(rec?.playlists) ? rec.playlists : []);
export const findLane = (rec, laneId) => lanesOf(rec).find((lane) => str(lane?.id) === str(laneId)) || null;
/** The playlist a new add goes to by default: the first one that isn't derived. */
export const firstTargetLane = (rec) => lanesOf(rec).find((lane) => lane && !lane.isBpmRoll) || null;

export function standaloneRecord({ name, trackIds = [], now = Date.now() } = {}) {
    const clean = String(name || '').trim() || 'Untitled playlist';
    return { id: uuid(), name: clean, gigDate: null, standalone: true, createdAt: now, updatedAt: now, playlists: [{ id: uuid(), name: clean, trackIds: [...new Set(trackIds.map(str))] }] };
}

/** `name`, or `name 2`, `name 3`… when the gig already has a playlist called that (the publisher needs unique names in a folder). */
export function uniqueLaneName(gig, name) {
    const taken = new Set(lanesOf(gig).map((lane) => String(lane?.name ?? '').trim().toLowerCase()));
    const base = String(name || '').trim() || 'Untitled playlist';
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; ; n += 1) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/** `playlists` with `lane` placed before the derived BPM playlist, or last when there is none. */
export function insertBeforeBpm(playlists, lane) {
    const list = [...(playlists || [])];
    const at = list.findIndex((l) => l?.isBpmRoll);
    list.splice(at < 0 ? list.length : at, 0, lane);
    return list;
}

/** Move `moved` ids so they sit before `beforeId` (or at the end when it is null), keeping their order. */
export function reorderIds(ids, moved, beforeId = null) {
    const take = new Set((moved || []).map(str));
    const rest = (ids || []).map(str).filter((id) => !take.has(id));
    const block = (ids || []).map(str).filter((id) => take.has(id));
    const at = beforeId == null ? rest.length : rest.indexOf(str(beforeId));
    rest.splice(at < 0 ? rest.length : at, 0, ...block);
    return rest;
}

// ── dates and ordering ──────────────────────────────────────────────────

export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const recent = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);

/** Gigs (never standalones) as the picker and lists show them: upcoming soonest first, then undated most recently edited, then past newest first. */
export function orderGigs(records, today = localDay()) {
    const gigs = (records || []).filter((r) => r && !isStandalone(r));
    const upcoming = gigs.filter((g) => g.gigDate && g.gigDate >= today).sort((a, b) => a.gigDate.localeCompare(b.gigDate) || recent(a, b));
    const undated = gigs.filter((g) => !g.gigDate).sort(recent);
    const past = gigs.filter((g) => g.gigDate && g.gigDate < today).sort((a, b) => b.gigDate.localeCompare(a.gigDate) || recent(a, b));
    return { upcoming, undated, past, all: [...upcoming, ...undated, ...past] };
}

export const orderStandalones = (records) => (records || []).filter(isStandalone).sort(recent);

/** The gig panel's picker: the three gig groups, then standalone playlists in a last group. */
export function pickerGroups(records, today = localDay()) {
    const { upcoming, undated, past } = orderGigs(records, today);
    return [
        { key: 'upcoming', label: 'Upcoming', items: upcoming },
        { key: 'undated', label: 'No date', items: undated },
        { key: 'past', label: 'Past', items: past },
        { key: 'playlists', label: 'Playlists', items: orderStandalones(records) },
    ].filter((group) => group.items.length);
}

/**
 * The gig panel's first choice: the remembered Add to gig target (its first
 * remembered playlist that still exists and isn't derived, else the gig's first
 * non-derived playlist), otherwise the first gig in picker order.
 */
export function pickerDefault(records, stored, today = localDay()) {
    const list = records || [];
    const remembered = stored ? list.find((r) => str(r.id) === str(stored.gigId)) : null;
    if (remembered) {
        const lane = (stored.laneIds || []).map((id) => findLane(remembered, id)).find((l) => l && !l.isBpmRoll) || firstTargetLane(remembered);
        return { gigId: remembered.id, laneId: lane ? str(lane.id) : null };
    }
    const first = pickerGroups(list, today)[0]?.items[0];
    if (!first) return null;
    const lane = firstTargetLane(first);
    return { gigId: first.id, laneId: lane ? str(lane.id) : null };
}

/** Add to playlist…: standalone playlists, then every non-derived gig playlist, as `{ gigId, laneId, label, group }`. */
export function playlistTargets(records, today = localDay()) {
    const out = orderStandalones(records).map((rec) => ({ gigId: rec.id, laneId: str(firstTargetLane(rec)?.id ?? ''), label: rec.name, group: 'Playlists' }));
    for (const gig of orderGigs(records, today).all) {
        for (const lane of lanesOf(gig)) if (lane && !lane.isBpmRoll) out.push({ gigId: gig.id, laneId: str(lane.id), label: lane.name, group: gig.name });
    }
    return out.filter((t) => t.laneId);
}

/** Tracks a playlist holds; the derived BPM playlist holds the union of the others. */
export function laneTrackIds(rec, lane) {
    if (!lane?.isBpmRoll) return (lane?.trackIds || []).map(str);
    return [...new Set(lanesOf(rec).filter((l) => l && !l.isBpmRoll).flatMap((l) => (l.trackIds || []).map(str)))];
}

/** Tint and chip for a Collection row while the gig panel shows `gig`: the playlist's name, or "2 playlists". */
export function rowMark(gig, trackId) {
    const id = str(trackId);
    const lanes = lanesOf(gig).filter((lane) => lane && !lane.isBpmRoll && (lane.trackIds || []).some((t) => str(t) === id));
    if (!lanes.length) return null;
    return { count: lanes.length, label: lanes.length === 1 ? lanes[0].name : `${lanes.length} playlists` };
}

// ── publications ────────────────────────────────────────────────────────

const committed = (p) => p && p.type !== 'publication-history' && p.state === 'committed';

/** The latest committed publication of this record (its origin or a former one). */
export function latestPublication(publications, rec) {
    const origins = new Set(recordOrigins(rec));
    return (publications || []).filter((p) => committed(p) && origins.has(p.origin)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).at(-1) || null;
}

/** Is the record's latest publication still in the handoff XML? */
export function inHandoff(publications, rec) {
    const p = latestPublication(publications, rec);
    return Boolean(p && !p.withdrawn && p.delivery !== 'Withdrawn from XML');
}

const shortDate = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** The one source line under a Unified playlist's name. A playlist in a gig passes its gig. */
export function sourceLine(rec, publications) {
    const p = latestPublication(publications, rec);
    if (!p || p.withdrawn || p.delivery === 'Withdrawn from XML') return 'Unified · not in Rekordbox';
    const base = {
        'Available in XML': `Sent to Rekordbox ${shortDate(p.createdAt)} · import it there`,
        'User reports imported': 'In Rekordbox',
        'Confirmed by later XML': 'In Rekordbox',
        'Differs from later XML': 'In Rekordbox · differs from what was sent',
    }[p.delivery] || 'Unified · not in Rekordbox';
    return (rec.updatedAt || 0) > (p.createdAt || 0) ? `${base} · changed since sent` : base;
}

export const rekordboxSourceLine = (importedAt) => (importedAt ? `From Rekordbox · imported ${shortDate(importedAt)}` : 'From Rekordbox');

/**
 * Rekordbox nodes to hide so a playlist sent from Unified doesn't show twice
 * after a re-import: a name matching the copy name of a Unified record's latest
 * publication, or (gigs sent by the earlier export flow) the exact gig name.
 * Descendants of a hidden folder are hidden with it.
 */
export function roundTripHiddenIds(nodes, records, publications, legacyGigNames = []) {
    const names = new Set(legacyGigNames.map(str));
    for (const rec of records || []) {
        const p = latestPublication(publications, rec);
        if (p?.tree?.name && !p.withdrawn) names.add(p.tree.name);
    }
    const hidden = new Set();
    const list = (nodes || []).filter((n) => n?.baseline);
    for (const n of list) if (names.has(n.baseline.name)) hidden.add(str(n.id));
    let grew = true;
    while (grew) {
        grew = false;
        for (const n of list) if (!hidden.has(str(n.id)) && n.baseline.parent && hidden.has(str(n.baseline.parent))) { hidden.add(str(n.id)); grew = true; }
    }
    return hidden;
}

// ── the Collection › Playlists list ─────────────────────────────────────

const matches = (name, q) => !q || String(name || '').toLowerCase().includes(q);

/** The imported tree in Rekordbox's own order: baseline names, parents and positions; no missing, migrated or hidden nodes. */
export function rekordboxTree(nodes, hidden = new Set()) {
    const live = (nodes || []).filter((n) => n?.baseline && !n.missing && !n.migratedTo && !hidden.has(str(n.id)));
    const ids = new Set(live.map((n) => str(n.id)));
    const build = (parent, depth = 0) => (depth > 64 ? [] : live
        .filter((n) => (n.baseline.parent && ids.has(str(n.baseline.parent)) ? str(n.baseline.parent) : null) === parent)
        .sort((a, b) => (a.baseline.position ?? 0) - (b.baseline.position ?? 0))
        .map((n) => {
            const folder = n.baseline.kind === 'folder';
            const children = folder ? build(str(n.id), depth + 1) : [];
            const count = folder ? children.reduce((sum, c) => sum + c.count, 0) : n.baseline.memberCount || 0;
            return { kind: 'rb', id: str(n.id), name: n.baseline.name, folder, count, children };
        }));
    return build(null);
}

function pruneTree(items, q) {
    return items.flatMap((item) => {
        if (matches(item.name, q)) return [item];
        const children = pruneTree(item.children || [], q);
        return children.length ? [{ ...item, children }] : [];
    });
}

const gigItem = (gig) => {
    const lanes = lanesOf(gig).filter(Boolean).map((lane) => ({ kind: 'u', id: str(gig.id), laneId: str(lane.id), name: lane.name, derived: Boolean(lane.isBpmRoll), count: laneTrackIds(gig, lane).length }));
    const count = new Set(lanesOf(gig).filter((l) => l && !l.isBpmRoll).flatMap((l) => (l.trackIds || []).map(str))).size;
    return { kind: 'u', id: str(gig.id), name: gig.name, folder: true, gigDate: gig.gigDate || null, count, children: lanes };
};

/**
 * Both groups of Collection › Playlists. `chip` is all, unified or rekordbox;
 * `query` matches names (a folder stays when it or a child matches).
 */
export function playlistList({ records = [], nodes = [], publications = [], legacyGigNames = [], today = localDay(), chip = 'all', query = '' } = {}) {
    const q = String(query || '').trim().toLowerCase();
    const standalones = orderStandalones(records).map((rec) => ({ kind: 'u', id: str(rec.id), laneId: str(firstTargetLane(rec)?.id ?? ''), name: rec.name, count: (firstTargetLane(rec)?.trackIds || []).length }));
    const gigs = orderGigs(records, today).all.map(gigItem);
    const unified = chip === 'rekordbox' ? null : [...standalones.filter((s) => matches(s.name, q)), ...pruneTree(gigs, q)];
    const hidden = roundTripHiddenIds(nodes, records, publications, legacyGigNames);
    const rekordbox = chip === 'unified' ? null : pruneTree(rekordboxTree(nodes, hidden), q);
    return { unified, rekordbox, hidden };
}

// ── writes (each returns an undo) ───────────────────────────────────────

const laneCopy = (lane, gig) => ({ id: uuid(), name: uniqueLaneName(gig, lane.name), trackIds: [...(lane.trackIds || [])].map(str) });
const touch = (rec, patch) => ({ ...rec, ...patch, updatedAt: Date.now() });
async function mustGet(database, id, what = 'Playlist') {
    const rec = await getGig(database, id);
    if (!rec) throw new Error(`${what} not found`);
    return rec;
}
async function dropLane(database, gigId, laneId) {
    const now = await getGig(database, gigId);
    if (now) await saveGig(database, touch(now, { playlists: lanesOf(now).filter((l) => str(l.id) !== str(laneId)) }));
}

export async function createStandalone(database, { name, trackIds = [] } = {}) {
    const rec = await saveGig(database, standaloneRecord({ name, trackIds }));
    return { record: rec, undo: () => deleteGig(database, rec.id) };
}

/** Rename a gig, or a standalone playlist together with its one playlist. */
export async function renameRecord(database, id, name) {
    const rec = await mustGet(database, id);
    const next = String(name || '').trim();
    if (!next || next === rec.name) return { record: rec, undo: null };
    const prior = rec.name;
    const patch = isStandalone(rec) ? { name: next, playlists: lanesOf(rec).map((l, i) => (i === 0 ? { ...l, name: next } : l)) } : { name: next };
    const saved = await saveGig(database, touch(rec, patch));
    return { record: saved, undo: () => renameRecord(database, id, prior) };
}

export async function renameLane(database, gigId, laneId, name) {
    const gig = await mustGet(database, gigId);
    if (isStandalone(gig)) return renameRecord(database, gigId, name);
    const lane = findLane(gig, laneId);
    const next = String(name || '').trim();
    if (!lane || !next || next === lane.name) return { record: gig, undo: null };
    const prior = lane.name;
    const saved = await saveGig(database, touch(gig, { playlists: lanesOf(gig).map((l) => (l === lane ? { ...l, name: next } : l)) }));
    return { record: saved, undo: () => renameLane(database, gigId, laneId, prior) };
}

/** Delete a standalone playlist or a whole gig. Undo writes the record back. */
export async function deleteRecord(database, id) {
    const rec = await mustGet(database, id);
    await deleteGig(database, id);
    return { record: rec, undo: () => saveGig(database, { ...rec, revision: 0 }) };
}

/** Remove one playlist from a gig; Undo puts it back where it was. */
export async function deleteLane(database, gigId, laneId) {
    const gig = await mustGet(database, gigId, 'Gig');
    const at = lanesOf(gig).findIndex((l) => str(l.id) === str(laneId));
    if (at < 0) throw new Error('Playlist not found');
    const lane = gig.playlists[at];
    const saved = await saveGig(database, touch(gig, { playlists: lanesOf(gig).filter((_, i) => i !== at) }));
    return {
        record: saved,
        undo: async () => {
            const now = await mustGet(database, gigId, 'Gig');
            const list = [...lanesOf(now)];
            list.splice(Math.min(at, list.length), 0, lane);
            await saveGig(database, touch(now, { playlists: list }));
        },
    };
}

/**
 * Move to gig…: the standalone's playlist goes into the gig before its BPM playlist,
 * then the standalone is deleted. Gig first, so a failure in between leaves a
 * copy, never a loss. The gig takes over the standalone's publication origins.
 */
export async function moveToGig(database, standaloneId, gigId) {
    const source = await mustGet(database, standaloneId);
    if (!isStandalone(source)) throw new Error('Only a playlist without a gig can move into one');
    const target = await mustGet(database, gigId, 'Gig');
    if (isStandalone(target)) throw new Error('Choose a gig');
    const lane = laneCopy(firstTargetLane(source) || { name: source.name, trackIds: [] }, target);
    const before = new Set(target.formerOrigins || []);
    const added = recordOrigins(source).filter((o) => !before.has(o));
    const gig = await saveGig(database, touch(target, { playlists: insertBeforeBpm(target.playlists, lane), formerOrigins: [...before, ...added] }));
    await deleteGig(database, source.id);
    return {
        record: gig, laneId: lane.id,
        undo: async () => {
            await saveGig(database, { ...source, revision: 0 });
            const now = await getGig(database, gigId);
            if (now) await saveGig(database, touch(now, { playlists: lanesOf(now).filter((l) => str(l.id) !== str(lane.id)), formerOrigins: (now.formerOrigins || []).filter((o) => !added.includes(o)) }));
        },
    };
}

/** Copy to gig…: a copy of one playlist (a standalone's, or a gig playlist) goes into the gig; the original stays. */
export async function copyToGig(database, { gigId: sourceId, laneId = null }, gigId) {
    const source = await mustGet(database, sourceId);
    const from = laneId ? findLane(source, laneId) : firstTargetLane(source);
    if (!from || from.isBpmRoll) throw new Error('Playlist not found');
    const target = await mustGet(database, gigId, 'Gig');
    if (isStandalone(target)) throw new Error('Choose a gig');
    const lane = laneCopy(from, target);
    const gig = await saveGig(database, touch(target, { playlists: insertBeforeBpm(target.playlists, lane) }));
    return { record: gig, laneId: lane.id, undo: () => dropLane(database, gigId, lane.id) };
}

/** Move a playlist from one gig into another: copy in, then take it out of the source. */
export async function moveLaneToGig(database, { gigId: sourceId, laneId }, gigId) {
    if (str(sourceId) === str(gigId)) throw new Error('Already in that gig');
    const copied = await copyToGig(database, { gigId: sourceId, laneId }, gigId);
    const removed = await deleteLane(database, sourceId, laneId);
    return { record: copied.record, laneId: copied.laneId, undo: async () => { await removed.undo(); await copied.undo(); } };
}

/** Make standalone: a standalone copy of a gig playlist. With `move`, the gig then drops the playlist. */
export async function makeStandalone(database, gigId, laneId, { move = false } = {}) {
    const gig = await mustGet(database, gigId, 'Gig');
    const lane = findLane(gig, laneId);
    if (!lane || lane.isBpmRoll) throw new Error('Playlist not found');
    const created = await createStandalone(database, { name: lane.name, trackIds: lane.trackIds || [] });
    const removed = move ? await deleteLane(database, gigId, laneId) : null;
    return { record: created.record, undo: async () => { if (removed) await removed.undo(); await created.undo(); } };
}

/** Add tracks to one playlist; ones already in it are skipped and counted. */
export async function addToLane(database, gigId, laneId, trackIds) {
    const gig = await mustGet(database, gigId);
    const lane = findLane(gig, laneId);
    if (!lane) throw new Error('Playlist not found');
    if (lane.isBpmRoll) throw new Error('BPM playlists are derived; add tracks to another playlist');
    const ids = [...new Set((trackIds || []).filter((id) => id != null && id !== '').map(str))];
    const have = new Set((lane.trackIds || []).map(str));
    const added = ids.filter((id) => !have.has(id));
    const skipped = ids.length - added.length;
    if (!added.length) return { record: gig, lane, added, skipped, undo: null };
    const saved = await setLaneMembership(database, gigId, { trackIds: added, addLaneIds: [str(laneId)] });
    if (!saved) throw new Error('Playlist not found');
    return { record: saved, lane: findLane(saved, laneId), added, skipped, undo: () => setLaneMembership(database, gigId, { trackIds: added, removeLaneIds: [str(laneId)] }) };
}

/** Replace one playlist's tracks (remove, reorder). Undo restores the previous order. */
export async function setLaneTracks(database, gigId, laneId, trackIds) {
    const gig = await mustGet(database, gigId);
    const lane = findLane(gig, laneId);
    if (!lane || lane.isBpmRoll) throw new Error('Playlist not found');
    const prior = [...(lane.trackIds || [])].map(str);
    const saved = await saveGig(database, touch(gig, { playlists: lanesOf(gig).map((l) => (l === lane ? { ...l, trackIds: [...trackIds].map(str) } : l)) }));
    return { record: saved, undo: () => setLaneTracks(database, gigId, laneId, prior) };
}

export async function removeFromLane(database, gigId, laneId, trackIds) {
    const gig = await mustGet(database, gigId);
    const drop = new Set((trackIds || []).map(str));
    return setLaneTracks(database, gigId, laneId, (findLane(gig, laneId)?.trackIds || []).map(str).filter((id) => !drop.has(id)));
}

export async function reorderLane(database, gigId, laneId, moved, beforeId = null) {
    const gig = await mustGet(database, gigId);
    return setLaneTracks(database, gigId, laneId, reorderIds(findLane(gig, laneId)?.trackIds || [], moved, beforeId));
}

/**
 * Drag between playlists of one gig, on the gig page and in the gig panel:
 * the rule is `laneDrop` (gig-membership.js), decided against the gig as the
 * server has it now. A copy or a ⇧ move is one membership write; a drop that
 * changes nothing writes nothing. Returns the decision with `record` and an
 * `undo` that puts both playlists back exactly as they were.
 */
export async function dropBetweenLanes(database, gigId, { trackIds, fromLaneId = null, toLaneId, move = false }) {
    const gig = await getGig(database, gigId);
    if (!gig) { gigsChanged(); throw new Error(GIG_GONE); }
    const drop = laneDrop(gig, { trackIds, fromLaneId, toLaneId, move });
    if (drop.action === 'reject') throw new Error(drop.message);
    if (!drop.write) return { ...drop, record: gig, undo: null };
    const touched = [...new Set([...drop.write.addLaneIds, ...drop.write.removeLaneIds])];
    const prior = new Map(touched.map((id) => [id, [...(findLane(gig, id)?.trackIds || [])].map(str)]));
    const saved = await setLaneMembership(database, gigId, drop.write);
    if (!saved) throw new Error(GIG_GONE);
    return {
        ...drop,
        record: saved,
        undo: async () => {
            const now = await mustGet(database, gigId, 'Gig');
            await saveGig(database, touch(now, { playlists: lanesOf(now).map((l) => (prior.has(str(l.id)) ? { ...l, trackIds: prior.get(str(l.id)) } : l)) }));
        },
    };
}
