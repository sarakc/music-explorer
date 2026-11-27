// Collection › Playlists: a place to listen. On the left, the playlist list
// (Unified playlists and gigs, then the imported Rekordbox tree); on the right,
// the selected playlist in the object-page layout with the Tracks table.
// Rekordbox playlists are read-only and show what Rekordbox has (baselines);
// Unified ones take light edits through unified-playlists.js, each with Undo.
// The Collection filter applies here too: the list keeps the playlists holding
// a matching track, and inside one the other tracks are dimmed and not played.
import { listGigs, createGig, seedDefaultGigLanes } from './gigs.js';
import { coverMosaicHtml } from './cover-art.js';
import { isLocalPlayable } from './player.js';
import { workspaceApi, workspaceDialog, publishWorkspace } from './playlists-workspace.js';
import { carriesTracks, readTrackDrop } from './track-drag.js';
import { undoToast } from './undo-toast.js';
import { serializeFilter } from './router.js';
import {
    choosePlaylistTarget, editPlaylistSelection, transferPlaylistSelection,
} from './playlist-bulk.js';
import {
    isStandalone, findLane, firstTargetLane, laneTrackIds, playlistList, sourceLine, rekordboxSourceLine,
    latestPublication, inHandoff, orderGigs, createStandalone, renameRecord, renameLane, deleteRecord, deleteLane,
    moveToGig, copyToGig, moveLaneToGig, makeStandalone, addToLane, removeFromLane, reorderLane,
} from './unified-playlists.js';
import { escapeHtml as esc } from './html.js';

const LAST_KEY = 'umm.playlistsLast';
const CHIPS = [['all', 'All'], ['unified', 'Unified'], ['rekordbox', 'Rekordbox']];

const DIM = 'Not in the filter';

const href = (item) => `#/playlists/${item.kind}/${encodeURIComponent(item.id)}${item.kind === 'u' && item.laneId && !item.folder ? `/${encodeURIComponent(item.laneId)}` : ''}`;
/** Is this list row the selected route? Standalones select by record; playlists by playlist id. */
export function isSelectedRow(item, route) {
    if (!route?.id || item.kind !== route.kind || String(item.id) !== String(route.id)) return false;
    if (item.folder) return !route.lane;
    return item.kind === 'rb' || !route.lane || String(item.laneId) === String(route.lane);
}

/** Track count and time: "12 tracks · 1 h 4 min". */
export function tracksMeta(tracks) {
    const secs = tracks.reduce((sum, t) => sum + (Number(t?.duration) > 0 ? Number(t.duration) : 0), 0);
    const n = `${tracks.length.toLocaleString()} track${tracks.length === 1 ? '' : 's'}`;
    if (!secs) return n;
    const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
    return `${n} · ${h ? `${h} h ${m} min` : `${m} min`}`;
}

function rowHtml(item, route, expanded, depth = 0, suffix = '') {
    const selected = isSelectedRow(item, route);
    const key = `${item.kind}:${item.id}`;
    const drop = item.kind === 'u' && !item.folder && !item.derived && item.laneId ? ` data-drop="${esc(item.id)}|${esc(item.laneId)}"` : '';
    const open = item.folder && expanded.has(key);
    const caret = item.folder ? `<button type="button" class="pl-caret" data-toggle="${esc(key)}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(item.name)}">›</button>` : '<span class="pl-caret-gap"></span>';
    const row = `<div class="pl-row${selected ? ' is-selected' : ''}${item.derived ? ' is-derived' : ''}" style="--depth:${depth}"${drop}>${caret}<a class="pl-name" href="${href(item)}${esc(suffix)}"${selected ? ' aria-current="page"' : ''}>${esc(item.name)}</a>${item.derived ? '<span class="pl-derived">derived</span>' : ''}<span class="pl-count">${item.kind === 'rb' && item.folder ? '' : item.count.toLocaleString()}</span></div>`;
    const children = open && item.children?.length ? `<ul>${item.children.map((c) => rowHtml(c, route, expanded, depth + 1, suffix)).join('')}</ul>` : '';
    return `<li>${row}${children}</li>`;
}

/** The left pane. `list` is playlistList(); groups collapse independently.
 *  `suffix` (`?f=…`) keeps the Collection filter on each playlist's link. */
export function listPaneHtml(list, { route, expanded = new Set(), chip = 'all', query = '', collapsed = {}, rekordboxError = '', filtered = false, suffix = '' } = {}) {
    const group = (id, label, items, actions = '') => {
        if (items == null) return '';
        const body = items.length ? `<ul class="pl-tree">${items.map((i) => rowHtml(i, route, expanded, 0, suffix)).join('')}</ul>` : `<p class="pl-empty">${query || filtered ? 'No matches' : id === 'unified' ? 'No playlists yet' : rekordboxError || 'Import a Rekordbox XML in Gigs › Rekordbox'}</p>`;
        return `<details class="pl-group" data-group="${id}"${collapsed[id] ? '' : ' open'}><summary>${label}</summary>${actions}${body}</details>`;
    };
    const chips = CHIPS.map(([id, label]) => `<button type="button" class="pl-chip${chip === id ? ' is-on' : ''}" data-chip="${id}" aria-pressed="${chip === id}">${label}</button>`).join('');
    return `<div class="pl-tools"><div class="pl-chips" role="group" aria-label="Show">${chips}</div></div>
        ${group('unified', 'Unified', list.unified, '<div class="pl-group-actions"><button type="button" class="link-chip chip-sm" data-new-playlist>New playlist</button><button type="button" class="link-chip chip-sm" data-new-gig>New gig</button></div>')}
        ${group('rekordbox', 'Rekordbox', list.rekordbox)}`;
}

/** The list while a filter is active: a playlist stays when `holds` says it
 *  has a matching track; a gig or folder stays while any of its playlists does. */
export function keepMatching(items, holds) {
    return (items || []).flatMap((item) => {
        if (!item.folder) return holds(item) ? [item] : [];
        const children = keepMatching(item.children, holds);
        return children.length ? [{ ...item, children }] : [];
    });
}

/** Rows for the open playlist: tracks outside the filter are dimmed copies
 *  (the cached track objects are never touched); Play takes the matching ones. */
export function filteredRows(tracks, matchIds) {
    if (!matchIds) return { rows: tracks, playable: tracks.filter(isLocalPlayable) };
    const hit = (t) => matchIds.has(String(t.id));
    return {
        rows: tracks.map((t) => (hit(t) ? t : { ...t, _dim: t._dim || DIM })),
        playable: tracks.filter((t) => hit(t) && isLocalPlayable(t)),
    };
}

/** Folder keys that hold the selected route: its gig, or its Rekordbox ancestors. */
export function selectionFolders(route, nodes = []) {
    if (!route?.id) return [];
    if (route.kind === 'u') return [`u:${route.id}`];
    const byId = new Map((nodes || []).filter((n) => n?.baseline).map((n) => [String(n.id), n]));
    const out = [];
    let at = byId.get(String(route.id));
    for (let depth = 0; at?.baseline?.parent && depth < 64; depth += 1) {
        out.push(`rb:${at.baseline.parent}`);
        at = byId.get(String(at.baseline.parent));
    }
    if (byId.get(String(route.id))?.baseline.kind === 'folder') out.push(`rb:${route.id}`);
    return out;
}

const allFolderKeys = (list) => {
    const out = [];
    const walk = (items) => { for (const i of items || []) if (i.folder) { out.push(`${i.kind}:${i.id}`); walk(i.children); } };
    walk(list.unified); walk(list.rekordbox);
    return out;
};

/** Choose a gig in a small dialog; Move offers to withdraw a copy still in the XML. */
export async function chooseGig(records, { title, excludeId = null, withdrawable = false, notify = null } = {}) {
    const gigs = orderGigs(records).all.filter((g) => String(g.id) !== String(excludeId));
    if (!gigs.length) { notify?.('Make a gig first.', 'info'); return null; }
    const options = gigs.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}${g.gigDate ? ` · ${esc(g.gigDate)}` : ''}</option>`).join('');
    const withdraw = withdrawable ? '<label><input type="checkbox" name="withdraw" checked> Also remove it from the Playlists folder</label>' : '';
    const input = await workspaceDialog(title, `<label>Gig<select name="gig">${options}</select></label>${withdraw}`, title.replace('…', ''));
    return input ? { gigId: input.get('gig'), gigName: gigs.find((g) => String(g.id) === input.get('gig'))?.name || 'gig', withdraw: input.has('withdraw') } : null;
}

async function withdrawLatest(publications, rec) {
    const pub = latestPublication(publications, rec);
    if (!pub) return;
    const preview = await workspaceApi('publish/preview', { historyId: pub.id, withdraw: true });
    await workspaceApi('publish/commit', { token: preview.token, allowOmissions: true });
}

/** Move a standalone playlist into a gig from anywhere (Gigs › Gigs uses this), with Undo. */
export async function moveStandaloneIntoGig(app, standaloneId, { onDone = null } = {}) {
    const db = app.integrationManager?.database;
    const [records, ws] = await Promise.all([listGigs(db), workspaceApi('workspace').catch(() => ({ publications: [] }))]);
    const rec = records.find((r) => String(r.id) === String(standaloneId));
    if (!rec) return null;
    const pick = await chooseGig(records, { title: 'Move to gig…', withdrawable: inHandoff(ws.publications, rec), notify: (m, t) => app.showNotification(m, t) });
    if (!pick) return null;
    try {
        if (pick.withdraw) await withdrawLatest(ws.publications, rec);
        const out = await moveToGig(db, rec.id, pick.gigId);
        undoToast(`Moved ${rec.name} to ${pick.gigName}`, out.undo, { onUndone: onDone });
        await onDone?.();
        return out;
    } catch (error) { app.showNotification(`Move to gig failed: ${error.message}`, 'error'); return null; }
}

const readLocal = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch (_) { return fallback; } };
const writeLocal = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* a preference only */ } };

export default class PlaylistsView {
    constructor({ app }) {
        this.app = app;
        this.expanded = new Set();
        this.closed = new Set();
        this.chip = 'all';
        this.collapsed = readLocal('umm.playlistsGroups', {});
        this.generation = 0;
    }

    get db() { return this.app.integrationManager?.database; }

    async render(contentArea, route = { view: 'playlists' }) {
        const app = this.app;
        if (!route.id) {
            const last = readLocal(LAST_KEY, null);
            if (last?.kind && last.id) return this._open(last, { replace: true });
        } else writeLocal(LAST_KEY, { kind: route.kind, id: route.id, ...(route.lane ? { lane: route.lane } : {}) });
        const generation = ++this.generation;
        const stale = () => generation !== this.generation || app.currentView !== 'playlists';
        document.getElementById('viewTitle').textContent = 'Collection';
        document.getElementById('viewSubtitle').textContent = '';
        // A `saved:` link resolves its rules first, as on Tracks.
        await app._prepareRulesPass?.();
        const engine = app.filterEngine;
        // The search field's text filters playlists by name; the rest of the filter keeps those holding a matching track.
        this.query = engine?.state?.search || '';
        const filtering = !!engine?.hasActiveFiltersExcept?.('search');
        const [records, ws, all, raw] = await Promise.all([
            listGigs(this.db).catch(() => []),
            workspaceApi('workspace').catch((error) => ({ error: error.message, nodes: [], publications: [], snapshots: [] })),
            app._allTracks().catch(() => []),
            app._unfilteredTracksById?.().catch(() => null),
            app._membershipIndex?.().catch(() => null),
        ]);
        if (stale()) return;
        this.records = records; this.ws = ws; this.route = route;
        // Merged duplicates keep one id; a playlist may hold another member of the pair.
        this.byId = new Map([...(raw || new Map())].map(([id, t]) => [String(id), t]));
        for (const t of all || []) this.byId.set(String(t.id), t);
        this.matchIds = filtering ? new Set(engine.applyFiltersExcept([...this.byId.values()], 'search').map((t) => String(t.id))) : null;
        let list = playlistList({ records, nodes: ws.nodes, publications: ws.publications, legacyGigNames: ws.legacyGigNames || [], chip: this.chip, query: this.query });
        if (this.matchIds) {
            const rbMembers = list.rekordbox ? await this._rekordboxMembers(ws) : new Map();
            if (stale()) return;
            const byRecord = new Map(records.map((r) => [String(r.id), r]));
            const hit = (ids) => (ids || []).some((id) => this.matchIds.has(String(id)));
            const holds = (item) => {
                if (item.kind === 'rb') return !rbMembers || hit(rbMembers.get(String(item.id)));
                const rec = byRecord.get(String(item.id));
                return Boolean(rec) && hit(laneTrackIds(rec, findLane(rec, item.laneId)));
            };
            list = { ...list, unified: list.unified && keepMatching(list.unified, holds), rekordbox: list.rekordbox && keepMatching(list.rekordbox, holds) };
        }
        const tracks = all || [];
        app._renderCollectionHeader?.('playlists', {
            allTracks: tracks,
            filtered: this.matchIds ? tracks.filter((t) => this.matchIds.has(String(t.id))) : tracks,
            options: engine?.getNarrowedOptions?.(tracks) || {},
            unit: 'tracks',
        });
        const f = serializeFilter(engine?.state);
        this.suffix = f ? `?f=${f}` : '';
        // The selection's folders open themselves unless they were closed by hand; a search opens every match.
        for (const key of selectionFolders(route, ws.nodes)) if (!this.closed.has(key)) this.expanded.add(key);
        const open = this.query ? new Set([...this.expanded, ...allFolderKeys(list)]) : this.expanded;
        const previousList = contentArea.querySelector('.pl-list');
        const listScroll = previousList?.scrollTop || 0;
        contentArea.innerHTML = `<div class="pl-view"><nav class="pl-list" aria-label="Playlists">${listPaneHtml(list, { route, expanded: open, chip: this.chip, query: this.query, collapsed: this.collapsed, rekordboxError: ws.error ? 'Rekordbox playlists unavailable' : '', filtered: !!this.matchIds, suffix: this.suffix })}</nav><section class="pl-detail" data-pl-detail></section></div>`;
        contentArea.querySelector('.pl-list').scrollTop = listScroll;
        this._wireList(contentArea);
        await this._renderDetail(contentArea.querySelector('[data-pl-detail]'), route, stale);
    }

    /** Open a playlist route, keeping the Collection filter in the hash. */
    _open(route, opts) {
        return this.app.navigate({ view: 'playlists', ...route, filter: this.app.filterEngine?.state }, opts);
    }

    /** Library track ids in each imported Rekordbox playlist, one read per import.
     *  Null when unreadable: the Rekordbox group then shows unfiltered, never empty. */
    async _rekordboxMembers(ws) {
        const key = (ws?.snapshots || []).map((snap) => snap.id).join('|');
        if (this._rbMembers?.key !== key) {
            const read = workspaceApi('members').then((d) => new Map(Object.entries(d?.members || {}))).catch(() => { this._rbMembers = null; return null; });
            this._rbMembers = { key, read };
        }
        return this._rbMembers.read;
    }

    refresh() {
        const area = document.getElementById('contentArea');
        if (area && this.app.currentView === 'playlists') return this.render(area, this.app._route || { view: 'playlists' });
    }

    _wireList(root) {
        const list = root.querySelector('.pl-list');
        list.querySelectorAll('[data-chip]').forEach((b) => b.addEventListener('click', () => { this.chip = b.dataset.chip; this.refresh(); }));
        list.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
            const key = b.dataset.toggle;
            if (b.getAttribute('aria-expanded') === 'true') { this.expanded.delete(key); this.closed.add(key); } else { this.expanded.add(key); this.closed.delete(key); }
            this.refresh();
        }));
        list.querySelectorAll('details.pl-group').forEach((d) => d.addEventListener('toggle', () => { this.collapsed[d.dataset.group] = !d.open; writeLocal('umm.playlistsGroups', this.collapsed); }));
        list.querySelector('[data-new-playlist]')?.addEventListener('click', () => this.newPlaylist());
        list.querySelector('[data-new-gig]')?.addEventListener('click', () => this.newGig());
        // Dropping Collection rows on a Unified playlist adds them to it.
        list.querySelectorAll('[data-drop]').forEach((row) => {
            row.addEventListener('dragover', (e) => { if (carriesTracks(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; row.classList.add('is-drop'); } });
            row.addEventListener('dragleave', () => row.classList.remove('is-drop'));
            row.addEventListener('drop', (e) => {
                row.classList.remove('is-drop');
                const drop = readTrackDrop(e);
                if (!drop) return;
                e.preventDefault();
                const [gigId, laneId] = row.dataset.drop.split('|');
                this.add(gigId, laneId, drop.ids);
            });
        });
    }

    // ── writes ──

    async _edit(label, run, { then = null } = {}) {
        try {
            const out = await run();
            if (!out) return null;
            undoToast(out.message || label, out.undo || null, { onUndone: () => this.refresh() });
            if (then) await then(out); else await this.refresh();
            return out;
        } catch (error) {
            this.app.showNotification(`${label} failed: ${error.message}`, 'error');
            await this.refresh();
            return null;
        }
    }

    add(gigId, laneId, ids) {
        return this._edit('Add to playlist', async () => {
            const out = await addToLane(this.db, gigId, laneId, ids);
            const name = out.lane?.name || 'playlist';
            const head = out.added.length ? `Added ${out.added.length} to ${name}` : `Already in ${name}`;
            return { ...out, message: out.skipped && out.added.length ? `${head} · ${out.skipped} already there` : head };
        });
    }

    async newPlaylist() {
        const input = await workspaceDialog('New playlist', '<label>Name<input name="name" required autofocus></label>', 'Create');
        if (!input) return;
        await this._edit('New playlist', async () => {
            const out = await createStandalone(this.db, { name: input.get('name') });
            return { ...out, message: `Made ${out.record.name}` };
        }, { then: (out) => this._open({ kind: 'u', id: out.record.id }) });
    }

    async newGig() {
        const values = await this.app._gigView?._openCreateGigModal?.();
        if (!values) return;
        try {
            const gig = await createGig(this.db, values);
            await seedDefaultGigLanes(this.db, gig.id);
            this._open({ kind: 'u', id: gig.id });
        } catch (error) { this.app.showNotification(`Could not make the gig: ${error.message}`, 'error'); }
    }

    _pickGig(title, opts = {}) { return chooseGig(this.records, { title, ...opts, notify: (m, t) => this.app.showNotification(m, t) }); }

    _withdraw(rec) { return withdrawLatest(this.ws?.publications, rec); }

    async _detailAction(action, sel) {
        const { rec, lane } = sel;
        const db = this.db;
        const standalone = isStandalone(rec);
        if (action === 'publish') { await publishWorkspace(this.app, standalone ? 'standalone' : 'gig', rec.id, rec); return this.refresh(); }
        if (action === 'open-gig') return this.app.navigate({ view: 'gigs', id: rec.id });
        if (action === 'rename') {
            const current = lane && !standalone ? lane.name : rec.name;
            const input = await workspaceDialog('Rename', `<label>Name<input name="name" required value="${esc(current)}"></label>`, 'Rename');
            if (!input) return;
            return this._edit('Rename', async () => ({ ...(lane && !standalone ? await renameLane(db, rec.id, lane.id, input.get('name')) : await renameRecord(db, rec.id, input.get('name'))), message: 'Renamed' }));
        }
        if (action === 'standalone') {
            return this._edit('Make standalone', async () => ({ ...(await makeStandalone(db, rec.id, lane.id)), message: `${lane.name} is now its own playlist` }));
        }
        if (action === 'move' || action === 'copy') {
            const move = action === 'move';
            const pick = await this._pickGig(move ? 'Move to gig…' : 'Copy to gig…', { excludeId: rec.id, withdrawable: move && standalone && inHandoff(this.ws?.publications, rec) });
            if (!pick) return;
            const gigName = pick.gigName;
            return this._edit(move ? 'Move to gig' : 'Copy to gig', async () => {
                if (move && pick.withdraw) await this._withdraw(rec);
                const out = !move ? await copyToGig(db, { gigId: rec.id, laneId: lane?.id }, pick.gigId)
                    : standalone ? await moveToGig(db, rec.id, pick.gigId) : await moveLaneToGig(db, { gigId: rec.id, laneId: lane.id }, pick.gigId);
                return { ...out, message: `${move ? 'Moved' : 'Copied'} to ${gigName}` };
            }, { then: (out) => this._open({ kind: 'u', id: pick.gigId, lane: out.laneId }) });
        }
        if (action === 'delete') {
            const whole = standalone || !lane;
            const sent = whole && inHandoff(this.ws?.publications, rec);
            const what = whole ? (standalone ? 'playlist' : 'gig') : 'playlist';
            const note = sent ? '<p>Its copy is still in the XML handoff, so this also withdraws it from there. Rekordbox’s own library isn’t touched.</p>' : '';
            const input = await workspaceDialog(`Delete ${what}`, `<p>Delete ${esc(whole ? rec.name : lane.name)}?</p>${note}`, 'Delete');
            if (!input) return;
            return this._edit('Delete', async () => {
                if (sent) await this._withdraw(rec);
                const out = whole ? await deleteRecord(db, rec.id) : await deleteLane(db, rec.id, lane.id);
                return { ...out, message: `Deleted ${whole ? rec.name : lane.name}` };
            }, { then: () => this._open(whole ? this._fallbackRoute(rec.id) : { kind: 'u', id: rec.id }, { replace: true }) });
        }
    }

    _fallbackRoute(goneId) {
        const next = this.records.find((r) => String(r.id) !== String(goneId));
        try { localStorage.removeItem(LAST_KEY); } catch (_) { /* preference only */ }
        return next ? { kind: 'u', id: next.id } : {};
    }

    _bulkSource(rec, lane) {
        return { gigId: String(rec.id), laneId: String(lane.id), revision: Number(rec.revision || 0) };
    }

    _clearBulkSelection() {
        this.app._selectedTrackIds = new Set();
        this.app._lastSelectedIdx = null;
    }

    async _bulkAction(rec, lane, action, ids) {
        try {
            const out = await editPlaylistSelection(this.db, this._bulkSource(rec, lane), action, ids);
            if (!out?.changed) return null;
            undoToast(out.message, out.undo || null, { onUndone: () => this.refresh() });
            await this.refresh();
            return out;
        } catch (error) {
            if (error.code === 'ESTALE') this._clearBulkSelection();
            this.app.showNotification(`Edit playlist failed: ${error.message}`, 'error');
            await this.refresh();
            return null;
        }
    }

    async _bulkTransfer(rec, lane, move, ids) {
        const target = await choosePlaylistTarget(this.records, this._bulkSource(rec, lane), { move, dialog: workspaceDialog });
        if (!target) return null;
        const targetRecord = this.records.find((record) => String(record.id) === String(target.gigId));
        try {
            const out = await transferPlaylistSelection(
                this.db,
                this._bulkSource(rec, lane),
                { ...target, revision: Number(targetRecord?.revision || 0) },
                ids,
                { move },
            );
            if (!out) return null;
            if (out.partial) {
                this.app.showNotification(out.message, 'error');
                await this.refresh();
                return out;
            }
            undoToast(out.message, out.undo || null, { onUndone: () => this.refresh() });
            await this.refresh();
            return out;
        } catch (error) {
            if (error.code === 'ESTALE') this._clearBulkSelection();
            this.app.showNotification(`${move ? 'Move' : 'Copy'} failed: ${error.message}`, 'error');
            await this.refresh();
            return null;
        }
    }

    // ── the right pane ──

    _track(id) {
        return this.byId.get(String(id)) || { id: String(id), title: 'Missing track', artist: '', _synthetic: true, _dim: 'Not in Collection' };
    }

    /** A Rekordbox member as a row: its Collection track when bound, else the XML's own title and artist. */
    _memberTrack(m, i, nodeId) {
        const bound = m?.libraryTrackId && this.byId.get(String(m.libraryTrackId));
        if (bound) return bound;
        const path = m?.localPath || '';
        return {
            id: `rb:${nodeId}:${i}`, title: m?.name || m?.title || 'Unresolved track', artist: m?.artist || '', album: m?.album || '', bpm: m?.bpm || null,
            local_path: path, availability: path ? 'local' : '', _synthetic: true,
            _dim: path ? '' : 'Not in Collection · no local file',
        };
    }

    async _renderDetail(host, route, stale) {
        const app = this.app;
        if (!route.id) { host.innerHTML = '<div class="empty-state pl-empty-detail"><p>Choose a playlist.</p></div>'; return; }
        if (route.kind === 'u') {
            const rec = this.records.find((r) => String(r.id) === String(route.id));
            if (!rec) { host.innerHTML = '<div class="empty-state"><p>This playlist is gone.</p></div>'; return; }
            const lane = route.lane ? findLane(rec, route.lane) : isStandalone(rec) ? firstTargetLane(rec) : null;
            if (route.lane && !lane) { host.innerHTML = '<div class="empty-state"><p>This playlist is gone.</p></div>'; return; }
            const ids = lane ? laneTrackIds(rec, lane) : [...new Set((rec.playlists || []).filter((l) => !l.isBpmRoll).flatMap((l) => (l.trackIds || []).map(String)))];
            let tracks = ids.map((id) => this._track(id));
            if (lane?.isBpmRoll) tracks = [...tracks].sort((a, b) => (Number(a.bpm) || Infinity) - (Number(b.bpm) || Infinity));
            const standalone = isStandalone(rec);
            const editable = Boolean(lane && !lane.isBpmRoll);
            const type = standalone ? 'Playlist' : lane ? rec.name : 'Gig';
            const name = lane && !standalone ? lane.name : rec.name;
            const more = [
                ['rename', 'Rename', !lane?.isBpmRoll],
                ['standalone', 'Make standalone', editable && !standalone],
                ['move', 'Move to gig…', editable || standalone],
                ['copy', 'Copy to gig…', editable],
                ['delete', 'Delete', !lane?.isBpmRoll],
            ].filter(([, , on]) => on);
            const actions = `${lane?.isBpmRoll ? '' : '<button type="button" class="lp-action" data-act="publish">Publish to Rekordbox…</button>'}${standalone ? '' : '<button type="button" class="lp-action" data-act="open-gig">Open gig</button>'}${more.length ? `<details class="pl-more"><summary class="lp-action" aria-label="More">⋯</summary><div class="pl-menu" role="menu">${more.map(([id, label]) => `<button type="button" role="menuitem" data-act="${id}">${label}</button>`).join('')}</div></details>` : ''}`;
            const lanes = !lane ? `<section class="lp-section"><div class="lp-section-head"><h2 class="lp-section-title">Playlists</h2><span class="lp-section-count">${(rec.playlists || []).length}</span></div><ul class="pl-lanes">${(rec.playlists || []).map((l) => `<li><a href="#/playlists/u/${encodeURIComponent(rec.id)}/${encodeURIComponent(l.id)}${esc(this.suffix || '')}">${esc(l.name)}</a>${l.isBpmRoll ? ' <span class="pl-derived">derived</span>' : ''}<span class="pl-count">${laneTrackIds(rec, l).length}</span></li>`).join('')}</ul></section>` : '';
            this._paintDetail(host, {
                type, name, tracks, actions, lanes,
                source: sourceLine(rec, this.ws?.publications),
                derived: lane?.isBpmRoll,
                context: { key: `playlist:u:${rec.id}${lane ? `:${lane.id}` : ''}`, kind: 'playlist', label: name, route: { ...route } },
                playlist: {
                    removable: editable,
                    source: editable ? { gigId: String(rec.id), laneId: String(lane.id) } : null,
                    bulk: editable ? {
                        run: (action, ids) => this._bulkAction(rec, lane, action, ids),
                        transfer: (move, ids) => this._bulkTransfer(rec, lane, move, ids),
                    } : null,
                },
            });
            host.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => { b.closest('details')?.removeAttribute('open'); this._detailAction(b.dataset.act, { rec, lane }); }));
            if (editable) this._wireEditing(host, rec, lane);
            return;
        }
        const node = (this.ws?.nodes || []).find((n) => String(n.id) === String(route.id) && n.baseline);
        if (!node) { host.innerHTML = '<div class="empty-state"><p>This Rekordbox playlist isn’t in the latest import.</p></div>'; return; }
        const snapshot = (this.ws.snapshots || []).find((s) => s.id === node.snapshotId);
        const folder = node.baseline.kind === 'folder';
        let tracks = [];
        if (!folder) {
            const detail = await workspaceApi(`node/${encodeURIComponent(node.id)}`).catch(() => null);
            if (stale()) return;
            tracks = (detail?.baselineTracks || []).map((m, i) => this._memberTrack(m, i, node.id));
        }
        const children = folder ? (this.ws.nodes || []).filter((n) => n.baseline && !n.missing && String(n.baseline.parent) === String(node.id)).sort((a, b) => (a.baseline.position ?? 0) - (b.baseline.position ?? 0)) : [];
        const lanes = folder ? `<section class="lp-section"><ul class="pl-lanes">${children.map((c) => `<li><a href="#/playlists/rb/${encodeURIComponent(c.id)}${esc(this.suffix || '')}">${esc(c.baseline.name)}</a><span class="pl-count">${c.baseline.kind === 'folder' ? '' : c.baseline.memberCount}</span></li>`).join('')}</ul></section>` : '';
        this._paintDetail(host, {
            type: folder ? 'Rekordbox folder' : 'Rekordbox playlist', name: node.baseline.name, tracks, lanes,
            source: rekordboxSourceLine(snapshot?.importedAt),
            actions: '<button type="button" class="lp-action" data-rb="copy">Copy to Unified</button><button type="button" class="lp-action" data-rb="open">Open in Gigs › Rekordbox</button>',
            context: { key: `playlist:rb:${node.id}`, kind: 'playlist', label: node.baseline.name, route: { ...route } },
            playlist: folder ? null : { removable: false, source: null },
            showTable: !folder,
        });
        host.querySelector('[data-rb="open"]')?.addEventListener('click', () => app.navigate({ view: 'rekordbox', node: node.id }));
        host.querySelector('[data-rb="copy"]')?.addEventListener('click', async (e) => {
            e.currentTarget.disabled = true;
            try {
                const out = await workspaceApi(`node/${encodeURIComponent(node.id)}/copy-to-unified`, { use: 'baseline' });
                const missed = out.unresolved ? ` · ${out.unresolved} not in Collection, left out` : '';
                undoToast(`Copied to Unified${missed}`, () => deleteRecord(this.db, out.record.id));
                this._open({ kind: 'u', id: out.record.id });
            } catch (error) { app.showNotification(`Copy to Unified failed: ${error.message}`, 'error'); }
        });
    }

    _paintDetail(host, { type, name, tracks, actions, lanes = '', source, derived = false, context, playlist, showTable = true }) {
        const app = this.app;
        host.innerHTML = `<div class="label-page object-page pl-page">
            <header class="op-header">
                <div class="op-art">${coverMosaicHtml(tracks.filter((t) => !t._synthetic), { max: 4 })}</div>
                <div class="op-head-body">
                    <div class="op-type">${esc(type)}</div>
                    <h1 class="op-name">${esc(name)}${derived ? ' <span class="pl-derived">derived</span>' : ''}</h1>
                    <p class="pl-source">${esc(source)}</p>
                    <div class="op-chips"><span class="op-chip">${esc(tracksMeta(tracks))}</span></div>
                    <div class="op-actions" data-op-actions>${actions}</div>
                </div>
            </header>
            ${lanes}
            ${showTable ? '<section class="lp-section op-tracks"><div class="op-tracks-host"></div></section>' : ''}
        </div>`;
        const { rows, playable } = filteredRows(tracks, this.matchIds);
        app.mountListPlay?.(host.querySelector('[data-op-actions]'), playable, context, { position: 'afterbegin' });
        const tableHost = host.querySelector('.op-tracks-host');
        if (tableHost && app._renderTable) app._renderTable(rows, tableHost, { context, playlist });
    }

    _wireEditing(host, rec, lane) {
        const db = this.db;
        host.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-pl-remove]');
            if (!btn) return;
            e.stopPropagation();
            const id = btn.dataset.plRemove;
            this._edit('Remove', async () => ({ ...(await removeFromLane(db, rec.id, lane.id, [id])), message: `Removed from ${lane.name}` }));
        }, true);
        const body = host.querySelector('.library-table tbody');
        if (!body) return;
        const rowAt = (e) => e.target.closest?.('tr[data-track-id]');
        body.addEventListener('dragover', (e) => {
            if (!carriesTracks(e)) return;
            e.preventDefault();
            body.querySelectorAll('.is-drop-before').forEach((r) => r.classList.remove('is-drop-before'));
            rowAt(e)?.classList.add('is-drop-before');
        });
        body.addEventListener('dragleave', (e) => { if (!body.contains(e.relatedTarget)) body.querySelectorAll('.is-drop-before').forEach((r) => r.classList.remove('is-drop-before')); });
        body.addEventListener('drop', (e) => {
            const drop = readTrackDrop(e);
            body.querySelectorAll('.is-drop-before').forEach((r) => r.classList.remove('is-drop-before'));
            if (!drop) return;
            e.preventDefault();
            const before = rowAt(e)?.dataset.trackId || null;
            const same = drop.source && String(drop.source.gigId) === String(rec.id) && String(drop.source.laneId) === String(lane.id);
            if (same) this._edit('Reorder', async () => ({ ...(await reorderLane(db, rec.id, lane.id, drop.ids, before)), message: 'Moved' }));
            else this.add(rec.id, lane.id, drop.ids);
        });
    }
}
