// Add to playlist…: one picker for every Unified playlist (standalones, then
// gig lanes), with New playlist… at the top. It shares the remembered target
// with Add to gig (`umm.lastGigTarget`). Copy filter results uses it too.
import { listGigs } from './gigs.js';
import { workspaceDialog } from './playlists-workspace.js';
import { readGigTarget, writeGigTarget } from './track-actions.js';
import { undoToast } from './undo-toast.js';
import { playlistTargets, createStandalone, addToLane } from './unified-playlists.js';
import { escapeHtml as esc } from './html.js';

const value = (t) => `${t.gigId}|${t.laneId}`;

/** The picker's options: New playlist… first, then one group per gig. The remembered target is selected. */
export function playlistPickerHtml(targets, stored = null) {
    const wanted = stored ? new Set((stored.laneIds || []).map((id) => `${stored.gigId}|${id}`)) : new Set();
    const chosen = targets.find((t) => wanted.has(value(t)));
    const groups = [];
    for (const t of targets) {
        const last = groups.at(-1);
        if (last?.label === t.group) last.items.push(t); else groups.push({ label: t.group, items: [t] });
    }
    const option = (t) => `<option value="${esc(value(t))}"${chosen === t ? ' selected' : ''}>${esc(t.label)}</option>`;
    return `<option value="new"${chosen ? '' : ' selected'}>New playlist…</option>${groups.map((g) => `<optgroup label="${esc(g.label)}">${g.items.map(option).join('')}</optgroup>`).join('')}`;
}

export async function addToPlaylist(app, trackIds, { title = 'Add to playlist', note = '', name = '' } = {}) {
    const ids = [...new Set((trackIds || []).filter((id) => id != null && id !== '').map(String))];
    if (!ids.length) { app.showNotification?.('No tracks selected.', 'info'); return null; }
    const db = app.integrationManager?.database;
    const targets = playlistTargets(await listGigs(db));
    const input = await workspaceDialog(title, `${note ? `<p>${esc(note)}</p>` : ''}<label>Playlist<select name="target">${playlistPickerHtml(targets, readGigTarget(globalThis.localStorage))}</select></label><label>New playlist name<input name="name" value="${esc(name)}" placeholder="Only for a new playlist"></label>`, 'Add');
    if (!input) return null;
    try {
        const target = input.get('target');
        if (target === 'new') {
            const made = await createStandalone(db, { name: input.get('name'), trackIds: ids });
            writeGigTarget(globalThis.localStorage, { gigId: made.record.id, laneIds: [made.record.playlists[0].id] });
            undoToast(`Made ${made.record.name} with ${ids.length} track${ids.length === 1 ? '' : 's'}`, made.undo);
            return made;
        }
        const [gigId, laneId] = target.split('|');
        const out = await addToLane(db, gigId, laneId, ids);
        writeGigTarget(globalThis.localStorage, { gigId, laneIds: [laneId] });
        const name = out.lane?.name || 'playlist';
        const head = out.added.length ? `Added ${out.added.length} to ${name}` : `Already in ${name}`;
        undoToast(out.skipped && out.added.length ? `${head} · ${out.skipped} already there` : head, out.undo);
        return out;
    } catch (error) {
        app.showNotification?.(`Add to playlist failed: ${error.message}`, 'error');
        return null;
    }
}
