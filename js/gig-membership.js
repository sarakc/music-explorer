// Gig membership rules (gig membership design, 2026-09-18). Pure: no DOM,
// no I/O. A lane is { id, name, trackIds[], isBpmRoll? }; membership is the
// state of a lane against a set of selected tracks, and every write is a diff
// against that state.

const str = (v) => String(v);

export function laneMembership(gig, trackIds) {
    const ids = [...new Set((trackIds || []).map(str))];
    return (Array.isArray(gig?.playlists) ? gig.playlists : []).map((lane) => {
        const have = new Set((lane?.trackIds || []).map(str));
        const inCount = ids.filter((id) => have.has(id)).length;
        const state = ids.length && inCount === ids.length ? 'all' : inCount > 0 ? 'some' : 'none';
        return { laneId: lane?.id != null ? str(lane.id) : null, name: String(lane?.name ?? ''), isBpmRoll: Boolean(lane?.isBpmRoll), state, inCount };
    });
}

export function nextLaneState(state) {
    return state === 'all' ? 'none' : 'all';
}

// A lane left in `some` is not touched: partial selections change only when
// the user explicitly checks (add all) or unchecks (remove all).
export function membershipDiff(before, after) {
    const prior = new Map((before || []).map((l) => [l.laneId, l.state]));
    const add = [], remove = [];
    for (const lane of after || []) {
        if (!lane.laneId || lane.isBpmRoll) continue;
        const was = prior.get(lane.laneId);
        if (lane.state === was || lane.state === 'some') continue;
        if (lane.state === 'all') add.push(lane.laneId);
        else if (lane.state === 'none') remove.push(lane.laneId);
    }
    return { add, remove };
}

export function buildMembershipIndex(gigs) {
    const index = new Map();
    for (const gig of Array.isArray(gigs) ? gigs : []) {
        for (const lane of Array.isArray(gig?.playlists) ? gig.playlists : []) {
            if (!lane || lane.isBpmRoll) continue;
            const entry = { gigId: gig.id, gigName: String(gig.name ?? ''), laneId: lane.id != null ? str(lane.id) : null, laneName: String(lane.name ?? ''), ...(gig.standalone ? { standalone: true } : {}) };
            for (const trackId of new Set((lane.trackIds || []).map(str))) {
                if (!index.has(trackId)) index.set(trackId, []);
                index.get(trackId).push(entry);
            }
        }
    }
    return index;
}

export function describeMembership(entries) {
    return (entries || []).map((e) => (e.standalone ? e.laneName : `${e.gigName} › ${e.laneName}`)).join(' · ');
}

// A drag from one playlist of a gig onto another (gig membership spec, Drag between playlists),
// shared by the gig page and the gig panel. A drop copies; with ⇧ it moves.
// Either way it is one membership write, so a move is never half-done. The
// drop appends; a playlist that already has the track gains nothing, and a
// move onto it only removes the track from where it came from. The BPM
// playlist takes no drops; a drop back on the source playlist is a reorder,
// which the caller handles.
//   → { action: 'reject' | 'reorder' | 'none' | 'copy' | 'move',
//       write: { trackIds, addLaneIds, removeLaneIds } | null,
//       hint: what the drop indicator says, message: what the toast says }
export function laneDrop(gig, { trackIds, fromLaneId = null, toLaneId, move = false } = {}) {
    const lanes = Array.isArray(gig?.playlists) ? gig.playlists : [];
    const find = (id) => (id == null ? null : lanes.find((l) => l?.id != null && str(l.id) === str(id)) || null);
    const to = find(toLaneId);
    const from = find(fromLaneId);
    const reject = (message) => ({ action: 'reject', write: null, hint: '', message });
    if (!to) return reject('Playlist not found');
    if (to.isBpmRoll) return reject('The BPM playlist is built from the others');
    if (fromLaneId != null && !from) return reject('Playlist not found');
    if (from === to) return { action: 'reorder', write: null, hint: '', message: '' };
    const ids = [...new Set((trackIds || []).filter((id) => id != null && id !== '').map(str))];
    if (!ids.length) return reject('Nothing to drop');
    const have = new Set((to.trackIds || []).map(str));
    const fresh = ids.filter((id) => !have.has(id));
    const name = (lane) => String(lane.name ?? '');
    if (move && from && !from.isBpmRoll) {
        return {
            action: 'move',
            write: { trackIds: ids, addLaneIds: fresh.length ? [str(to.id)] : [], removeLaneIds: [str(from.id)] },
            hint: 'Move',
            message: fresh.length ? `Moved to ${name(to)} from ${name(from)}` : `Removed from ${name(from)} · already in ${name(to)}`,
        };
    }
    if (!fresh.length) return { action: 'none', write: null, hint: 'Already here', message: `Already in ${name(to)}` };
    return { action: 'copy', write: { trackIds: fresh, addLaneIds: [str(to.id)], removeLaneIds: [] }, hint: 'Copy', message: `Copied to ${name(to)}` };
}
