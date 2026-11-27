// Gig ↔ Rekordbox round-trip planner.
//
// Pure functions, no IDB, no DOM. Given a gig's current lanes and the
// playlists parsed from a Rekordbox XML (already mapped to UMM track ids),
// compute the lanes the gig should have afterwards plus a per-lane summary
// the confirm step can show before anything is written.
//
// Modes:
//   replace — a lane Rekordbox also has takes Rekordbox's tracks and order.
//   merge   — a lane Rekordbox also has keeps UMM's tracks and order, then
//             appends whatever Rekordbox added.
// Both modes:
//   - Lanes match Rekordbox playlists by name, case-insensitive, trimmed.
//     Two Rekordbox playlists with one name are combined (deduped, in order)
//     so no tracks vanish; of two UMM lanes with one name only the first
//     takes the playlist, the second is kept as-is.
//   - Rekordbox playlists with no matching lane become new lanes, inserted
//     before the auto-derived BPM roll lane (or appended when there is none).
//   - Lanes Rekordbox no longer has are kept untouched. Nothing is deleted.
//   - The BPM roll lane is computed, never imported; a Rekordbox playlist that
//     matches it is skipped.

const MODES = new Set(['merge', 'replace']);

const laneKey = (name) => String(name || '').trim().toLowerCase();

function diffCounts(before, after) {
    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    let added = 0;
    for (const id of afterSet) if (!beforeSet.has(id)) added += 1;
    let removed = 0;
    for (const id of beforeSet) if (!afterSet.has(id)) removed += 1;
    return { added, removed };
}

/**
 * @param {object} args
 * @param {Array<{name:string, trackIds:string[], isBpmRoll?:boolean}>} args.lanes   current gig playlists
 * @param {Array<{name:string, trackIds:string[]}>} args.incoming                    Rekordbox playlists (UMM ids)
 * @param {'merge'|'replace'} args.mode
 * @returns {{ lanes: Array, summary: Array<{name, status:'matched'|'new'|'kept'|'skipped', added:number, removed:number}> }}
 */
export function planGigSync({ lanes = [], incoming = [], mode } = {}) {
    if (!MODES.has(mode)) throw new Error(`Unknown sync mode: ${mode}`);

    // Group incoming playlists by name; same-named ones concatenate.
    const incomingByKey = new Map();
    for (const pl of incoming) {
        const key = laneKey(pl?.name);
        if (!key) continue;
        const ids = Array.isArray(pl.trackIds) ? pl.trackIds : [];
        const entry = incomingByKey.get(key);
        if (!entry) {
            incomingByKey.set(key, { name: pl.name, trackIds: [...new Set(ids)] });
        } else {
            const seen = new Set(entry.trackIds);
            for (const id of ids) if (!seen.has(id)) { seen.add(id); entry.trackIds.push(id); }
        }
    }

    const outLanes = [];
    const summary = [];
    const consumed = new Set();

    for (const lane of lanes) {
        const key = laneKey(lane?.name);
        // A playlist feeds at most one lane; a second same-named lane is kept.
        const match = consumed.has(key) ? null : incomingByKey.get(key);
        if (match) consumed.add(key);

        if (!match) {
            outLanes.push(lane);
            summary.push({ name: lane.name, status: 'kept', added: 0, removed: 0 });
            continue;
        }
        if (lane.isBpmRoll) {
            outLanes.push(lane);
            summary.push({ name: lane.name, status: 'skipped', added: 0, removed: 0 });
            continue;
        }

        const before = Array.isArray(lane.trackIds) ? lane.trackIds : [];
        const rb = match.trackIds;
        let after;
        if (mode === 'replace') {
            after = [...rb];
        } else {
            const seen = new Set(before);
            after = [...before];
            for (const id of rb) {
                if (seen.has(id)) continue;
                seen.add(id);
                after.push(id);
            }
        }
        outLanes.push({ ...lane, trackIds: after });
        summary.push({ name: lane.name, status: 'matched', ...diffCounts(before, after) });
    }

    const fresh = [];
    for (const [key, pl] of incomingByKey) {
        if (consumed.has(key)) continue;
        consumed.add(key);
        fresh.push({ name: pl.name, trackIds: [...pl.trackIds] });
        summary.push({ name: pl.name, status: 'new', added: pl.trackIds.length, removed: 0 });
    }

    const bpmIdx = outLanes.findIndex((l) => l.isBpmRoll);
    if (bpmIdx < 0) outLanes.push(...fresh);
    else outLanes.splice(bpmIdx, 0, ...fresh);

    return { lanes: outLanes, summary };
}

/** Case-insensitive gig lookup by name. Used to preselect the import target
 *  when a Rekordbox folder came from a UMM export. */
export function matchGigByName(gigs, name) {
    const key = laneKey(name);
    if (!key) return null;
    return (gigs || []).find((g) => laneKey(g?.name) === key) || null;
}
