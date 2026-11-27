// Bulk playlist editing shared by Collection › Playlists, gig pages and the
// Rekordbox workspace. Pure ordering helpers come first; Unified writes keep
// the existing revisioned, undoable playlist helpers as their only write path.
import { getGig } from './gigs.js';
import {
    addToLane, dropBetweenLanes, findLane, playlistTargets, removeFromLane, setLaneTracks,
} from './unified-playlists.js';
import { escapeHtml as esc } from './html.js';

const str = (value) => String(value);

export const PLAYLIST_BULK_ACTIONS = Object.freeze([
    ['top', 'Top'],
    ['up', 'Up'],
    ['down', 'Down'],
    ['bottom', 'Bottom'],
    ['remove', 'Remove'],
]);

/** Apply one ordered-list edit. Selected values move together as one block. */
export function bulkOrder(values, selected, action) {
    const list = (values || []).map(str);
    const picked = new Set((selected || []).map(str));
    const block = list.filter((id) => picked.has(id));
    if (!block.length) return list;
    const rest = list.filter((id) => !picked.has(id));
    if (action === 'remove') return rest;
    const first = list.findIndex((id) => picked.has(id));
    const at = {
        top: 0,
        up: Math.max(0, first - 1),
        down: Math.min(rest.length, first + 1),
        bottom: rest.length,
    }[action];
    if (at == null) throw new Error(`Unknown playlist action: ${action}`);
    rest.splice(at, 0, ...block);
    return rest;
}

export function bulkActionChanges(values, selected, action) {
    const before = (values || []).map(str);
    const after = bulkOrder(before, selected, action);
    return before.length !== after.length || before.some((id, index) => id !== after[index]);
}

/** Compact action strip shared by playlist-specific selection bars. */
export function playlistBulkActionsHtml({ allowTransfer = true } = {}) {
    const order = PLAYLIST_BULK_ACTIONS.map(([id, label]) => `<button type="button" class="btn btn-sm btn-secondary" data-playlist-bulk="${id}">${label}</button>`).join('');
    const transfer = allowTransfer
        ? '<span class="playlist-bulk-separator" aria-hidden="true"></span><button type="button" class="btn btn-sm btn-secondary" data-playlist-transfer="copy">Copy to…</button><button type="button" class="btn btn-sm btn-secondary" data-playlist-transfer="move">Move to…</button>'
        : '';
    return `<span class="playlist-bulk-actions" data-playlist-bulk-actions>${order}${transfer}</span>`;
}

export function wirePlaylistBulkActions(root, {
    ids, run, transfer = null, onError = null,
} = {}) {
    root?.querySelectorAll('[data-playlist-bulk]').forEach((button) => button.addEventListener('click', async () => {
        const selected = ids?.() || [];
        if (!selected.length) return;
        button.disabled = true;
        try { await run?.(button.dataset.playlistBulk, selected); }
        catch (error) {
            if (!onError) throw error;
            await onError(error);
        }
        finally { if (button.isConnected) button.disabled = false; }
    }));
    root?.querySelectorAll('[data-playlist-transfer]').forEach((button) => button.addEventListener('click', async () => {
        const selected = ids?.() || [];
        if (!selected.length || !transfer) return;
        button.disabled = true;
        try { await transfer(button.dataset.playlistTransfer === 'move', selected); }
        catch (error) {
            if (!onError) throw error;
            await onError(error);
        }
        finally { if (button.isConnected) button.disabled = false; }
    }));
}

/** Choose any ordinary Unified playlist except the source. */
export async function choosePlaylistTarget(records, source, { move = false, dialog } = {}) {
    const targets = playlistTargets(records).filter((target) => (
        str(target.gigId) !== str(source.gigId) || str(target.laneId) !== str(source.laneId)
    ));
    if (!targets.length) return null;
    const groups = new Map();
    for (const target of targets) {
        if (!groups.has(target.group)) groups.set(target.group, []);
        groups.get(target.group).push(target);
    }
    const options = [...groups].map(([label, items]) => `<optgroup label="${esc(label)}">${items.map((target) => `<option value="${esc(`${target.gigId}|${target.laneId}`)}">${esc(target.label)}</option>`).join('')}</optgroup>`).join('');
    const title = move ? 'Move to playlist…' : 'Copy to playlist…';
    if (typeof dialog !== 'function') throw new Error('Playlist picker unavailable');
    const input = await dialog(title, `<label>Playlist<select name="target" required>${options}</select></label>`, move ? 'Move' : 'Copy');
    if (!input) return null;
    const [gigId, laneId] = str(input.get('target')).split('|');
    return targets.find((target) => str(target.gigId) === gigId && str(target.laneId) === laneId) || null;
}

function stale() {
    const error = new Error('Playlist changed. Refresh before editing.');
    error.code = 'ESTALE';
    return error;
}

async function currentSource(database, source) {
    const record = await getGig(database, source.gigId);
    if (!record || Number(record.revision || 0) !== Number(source.revision || 0)) throw stale();
    const playlist = findLane(record, source.laneId);
    if (!playlist || playlist.isBpmRoll) throw new Error('Playlist not found');
    return { record, playlist };
}

export async function editPlaylistSelection(database, source, action, selected) {
    const { record, playlist } = await currentSource(database, source);
    const before = (playlist.trackIds || []).map(str);
    const next = bulkOrder(before, selected, action);
    if (!bulkActionChanges(before, selected, action)) return { record, undo: null, changed: false };
    const out = await setLaneTracks(database, record.id, playlist.id, next);
    const count = new Set((selected || []).map(str)).size;
    return {
        ...out,
        changed: true,
        message: action === 'remove'
            ? `Removed ${count} ${count === 1 ? 'track' : 'tracks'} from ${playlist.name}`
            : `Moved ${count} ${count === 1 ? 'track' : 'tracks'}`,
    };
}

/** Copy or move a selection. Same-gig moves are one write; cross-gig moves
 *  add first so a second-write failure leaves a recoverable copy, never loss. */
export async function transferPlaylistSelection(database, source, target, selected, { move = false } = {}) {
    const { record, playlist } = await currentSource(database, source);
    const targetRecord = str(target.gigId) === str(record.id) ? record : await getGig(database, target.gigId);
    if (!targetRecord) throw new Error('Target playlist no longer exists');
    if (target.revision != null && Number(targetRecord.revision || 0) !== Number(target.revision || 0)) throw stale();
    const targetPlaylist = findLane(targetRecord, target.laneId);
    if (!targetPlaylist || targetPlaylist.isBpmRoll) throw new Error('Target playlist no longer exists');
    const ids = [...new Set((selected || []).map(str))];
    if (!ids.length) return null;

    if (str(record.id) === str(targetRecord.id)) {
        const out = await dropBetweenLanes(database, record.id, {
            trackIds: ids, fromLaneId: playlist.id, toLaneId: targetPlaylist.id, move,
        });
        const message = out.action === 'none'
            ? out.message
            : `${move ? 'Moved' : 'Copied'} ${ids.length} ${ids.length === 1 ? 'track' : 'tracks'} to ${targetPlaylist.name}`;
        return { ...out, message };
    }

    const added = await addToLane(database, targetRecord.id, targetPlaylist.id, ids);
    if (!move) {
        const count = added.added.length;
        return {
            ...added,
            message: count
                ? `Copied ${count} ${count === 1 ? 'track' : 'tracks'} to ${targetPlaylist.name}`
                : `Already in ${targetPlaylist.name}`,
        };
    }
    try {
        const removed = await removeFromLane(database, record.id, playlist.id, ids);
        return {
            ...removed,
            message: `Moved ${ids.length} ${ids.length === 1 ? 'track' : 'tracks'} to ${targetPlaylist.name}`,
            undo: async () => { await removed.undo?.(); await added.undo?.(); },
        };
    } catch (error) {
        return {
            ...added,
            partial: true,
            error,
            message: 'Moved, but could not remove from the original playlist — retry',
        };
    }
}
