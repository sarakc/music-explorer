// Gig views: the gig list, the scoped gig detail with its lanes, the
// add-tracks track picker, the add-to-gig lane picker, the create-gig modal
// and the gig menus. Moved out of app.js on 2026-09-28 (gig membership
// Phase 0) without behaviour change. `this.app` is the App instance for
// everything that stayed there: database access, notifications, navigation,
// the Rekordbox export/import path, the generic field/confirm modals and the
// overflow menu.
import FilterEngine from './filter-engine.js';
import { createStaleGuard } from './stale-guard.js';
import { entityLinkHtml, wireEntityLinks } from './entity-links.js';
import { facetOptionsHtml } from './facet-options.js';
import { soundStatusMarkerHtml } from './sound-check-status.js';
import { writeGigTarget } from './track-actions.js';
import { isLocalPlayable } from './player.js';
import { moveStandaloneIntoGig } from './playlists-view.js';
import { workspaceDialog } from './playlists-workspace.js';
import { laneMembership, nextLaneState, membershipDiff, laneDrop } from './gig-membership.js';
import { dropBetweenLanes } from './unified-playlists.js';
import { TRACKS_MIME, readTrackDrop } from './track-drag.js';
import { undoToast } from './undo-toast.js';
import {
    choosePlaylistTarget, editPlaylistSelection, playlistBulkActionsHtml,
    transferPlaylistSelection, wirePlaylistBulkActions,
} from './playlist-bulk.js';
import {
    createGig, listGigs, getGig, renameGig, setGigDate, deleteGig as deleteGigRec,
    addPlaylistToGig, renameGigPlaylist, removeGigPlaylist, moveGigPlaylist,
    addTracksToGigPlaylist, removeTrackFromGigPlaylist, reorderTrackInGigPlaylist,
    seedDefaultGigLanes, ensureBpmRollFlag, computeBpmRollTrackIds, setGigPlaylists,
    setGigHideFromRekordbox, setHideFromRekordboxAll, ensureLaneIds, setLaneMembership,
} from './gigs.js';
import { escapeHtml } from './html.js';
import { stashMarkHtml } from './collection-columns.js';


// Escape should only dismiss the topmost in-app dialog. Every modal backdrop
// registers its own document keydown listener, so without this guard one key
// press collapses the whole stack.
const isTopmostBackdrop = (backdrop) => {
    const all = document.querySelectorAll('.enrich-backdrop');
    return all.length > 0 && all[all.length - 1] === backdrop;
};

// Lane rows of the membership editor. A row is a laneMembership() entry;
// `some` renders indeterminate (the caller sets the DOM property after
// injecting), BPM lanes render disabled with `auto`.
export function renderLaneRows(rows) {
    if (!rows?.length) {
        return '<div class="gig-lane-picker-empty muted">This gig folder has no playlists yet. <button type="button" class="link-chip chip-sm" data-add-lane>Add one</button></div>';
    }
    return rows.map((row) => {
        if (row.isBpmRoll) {
            return `<label class="gig-lane-picker-lane is-auto"><input type="checkbox" disabled> <span class="gig-lane-picker-name">${escapeHtml(row.name || 'BPM')}</span> <span class="muted">auto</span></label>`;
        }
        const checked = row.state === 'all' ? ' checked' : '';
        const some = row.state === 'some' ? ' data-indeterminate="true"' : '';
        const count = row.state === 'some' ? `${row.inCount} of the selection` : row.state === 'all' ? 'all selected' : '';
        return `<label class="gig-lane-picker-lane${row.state === 'all' ? ' is-active' : ''}"><input type="checkbox" data-lane-id="${escapeHtml(row.laneId ?? '')}"${checked}${some}> <span class="gig-lane-picker-name">${escapeHtml(row.name || 'Untitled')}</span>${count ? ` <span class="muted">${count}</span>` : ''}</label>`;
    }).join('');
}

export function describeDiff({ add = [], remove = [] } = {}) {
    const parts = [];
    if (add.length) parts.push(`Add to ${add.length}`);
    if (remove.length) parts.push(`${parts.length ? 'remove' : 'Remove'} from ${remove.length}`);
    return parts.length ? parts.join(' · ') : 'Save';
}

export default class GigView {
    constructor({ app }) {
        this.app = app;
        this._playlistSelections = new Map();
    }

    _playlistSelection(gig, playlist, trackIds = []) {
        const key = `${gig.id}:${playlist.id}`;
        const state = this._playlistSelections.get(key) || { ids: new Set(), last: null };
        const valid = new Set((trackIds || []).map(String));
        state.ids = new Set([...state.ids].filter((id) => valid.has(String(id))).map(String));
        if (state.last != null && (state.last < 0 || state.last >= valid.size)) state.last = null;
        this._playlistSelections.set(key, state);
        return state;
    }

    _playlistSource(gig, playlist) {
        return { gigId: String(gig.id), laneId: String(playlist.id), revision: Number(gig.revision || 0) };
    }

    /** Gigs view (P5.1 list + P5.3 scoped detail). When `_currentGigId` is set,
     *  renders the scoped detail view (per-playlist lanes); otherwise renders
     *  the list-of-gigs table. */
    async render() {
        const routeIsStale = this.app._routeIsStale || (() => false);
        this._loadGigsViewGuard ||= createStaleGuard();
        const loadIsStale = this._loadGigsViewGuard.begin();
        const isStale = () => routeIsStale() || loadIsStale();
        const viewTitle = document.getElementById('viewTitle');
        const viewSubtitle = document.getElementById('viewSubtitle');
        const contentArea = document.getElementById('contentArea');
        if (!contentArea) return;

        const db = this.app.integrationManager?.database;
        if (!db) {
            viewTitle.textContent = 'Gigs';
            contentArea.innerHTML = '<div class="empty-state"><p>Database unavailable.</p></div>';
            return;
        }

        // Detail mode — scoped per-gig view (P5.3).
        if (this.app._currentGigId) {
            let gig = await getGig(db, this.app._currentGigId);
            if (isStale()) return;
            if (!gig) {
                return this.app.navigate({ view: 'gigs' }, { replace: true });
            }
            // Lazy migration: tag the existing empty "BPM" lane on legacy gigs
            // so it auto-derives from the other lanes from now on. No-op if
            // already tagged or if the user has manually populated "BPM".
            try {
                gig = await ensureBpmRollFlag(db, gig) || gig;
                if (isStale()) return;
                // Dragging between playlists names them by id.
                gig = await ensureLaneIds(db, gig) || gig;
                if (isStale()) return;
            } catch (err) {
            if (isStale()) return;
                console.warn('[gigs] BPM-roll migration failed:', err?.message || err);
            }
            this.app._currentGigName = gig.name;
            await this._renderGigDetail(gig, contentArea);
            if (isStale()) return;
            return;
        }

        // List mode. Playlists without a gig sit in their own short group at the top.
        viewTitle.textContent = 'Gigs';
        const records = await listGigs(db, { sort: 'updatedAt' });
        if (isStale()) return;
        const gigs = records.filter((g) => !g.standalone);
        const loose = records.filter((g) => g.standalone);
        const looseHtml = loose.length ? `
            <section class="gigs-loose" aria-label="Playlists without a gig">
                <h3 class="gigs-loose-head">Playlists without a gig</h3>
                <ul class="gigs-loose-list">${loose.map((p) => {
                    const n = (p.playlists?.[0]?.trackIds || []).length;
                    return `<li><a href="#/playlists/u/${encodeURIComponent(p.id)}">${escapeHtml(p.name)}</a> <span class="muted">${n} ${n === 1 ? 'track' : 'tracks'}</span> <button type="button" class="link-chip chip-sm" data-loose-move="${escapeHtml(p.id)}">Move to gig…</button></li>`;
                }).join('')}</ul>
            </section>` : '';
        const wireLoose = (root) => root.querySelectorAll('[data-loose-move]').forEach((btn) => btn.addEventListener('click', () => moveStandaloneIntoGig(this.app, btn.dataset.looseMove, { onDone: () => this.render() })));
        if (isStale()) return;
        viewSubtitle.textContent = gigs.length
            ? `${gigs.length} ${gigs.length === 1 ? 'gig' : 'gigs'}`
            : '';

        const head = `
            <header class="gigs-head">
                <button type="button" class="btn btn-sm btn-secondary" data-gig-import>Import XML into a gig…</button>
                <button type="button" class="btn btn-sm" data-gig-new>New gig folder</button>
            </header>`;

        // Sync-status strip (#4): Pending count · hidden gig count · clear / wipe.
        // Counts are best-effort — a failing /api/ingest/rekordbox/pending leaves
        // the count as "—" but doesn't block render.
        const hiddenCount = gigs.filter((g) => g.hideFromRekordbox).length;
        const syncStrip = `
            <div class="gigs-sync-strip" role="status">
                <div class="gigs-sync-stats">
                    <span class="gigs-sync-stat" data-sync-pending>Pending: <strong id="gigsSyncPendingCount">—</strong> tracks</span>
                    <span class="gigs-sync-sep" aria-hidden="true">·</span>
                    <span class="gigs-sync-stat">Gig edits stay unpublished until you publish a copy</span>
                </div>
                <div class="gigs-sync-actions">
                    <button type="button" class="link-chip chip-sm" data-sync-clear-pending>Clear Pending</button>

                </div>
            </div>`;

        if (!gigs.length) {
            contentArea.innerHTML = `
                <div class="gigs-view">
                    ${head}
                    ${syncStrip}
                    ${looseHtml}
                    <div class="empty-state">
                        <h3>No gig folders yet.</h3>
                        <p class="muted">A gig folder groups the ordered playlists for an upcoming show.</p>
                    </div>
                </div>`;
            contentArea.querySelector('[data-gig-new]')?.addEventListener('click', () => this.createGigFromPrompt());
            contentArea.querySelector('[data-gig-import]')?.addEventListener('click', () => this.app._onImportRekordboxXml());
            this._wireGigsSyncStrip(contentArea);
            wireLoose(contentArea);
            return;
        }

        const rows = gigs.map((g) => {
            const playlistN = Array.isArray(g.playlists) ? g.playlists.length : 0;
            const trackN = Array.isArray(g.playlists)
                ? g.playlists.reduce((acc, p) => acc + (Array.isArray(p.trackIds) ? p.trackIds.length : 0), 0)
                : 0;
            const gigCell = g.gigDate ? escapeHtml(g.gigDate) : '<span class="muted">—</span>';
            const hiddenChip = g.hideFromRekordbox
                ? ' <span class="gig-row-hidden-chip" title="Excluded from Rekordbox sidebar">hidden</span>'
                : '';
            return `
                <tr class="gig-row${g.hideFromRekordbox ? ' gig-row-hidden' : ''}" data-gig-id="${escapeHtml(g.id)}">
                    <td class="gig-col-name"><button type="button" class="gig-name-link" data-gig-open="${escapeHtml(g.id)}">${escapeHtml(g.name || '')}</button>${hiddenChip}</td>
                    <td class="gig-col-gig">${gigCell}</td>
                    <td class="gig-col-playlists">${playlistN}</td>
                    <td class="gig-col-tracks">${trackN}</td>
                    <td class="gig-col-menu">
                        <div class="gig-row-actions">
                            <button type="button" class="link-chip chip-sm" data-gig-export="${escapeHtml(g.id)}">Update Rekordbox XML</button>
                            <button type="button" class="link-chip chip-sm" data-gig-menu="${escapeHtml(g.id)}" aria-haspopup="true">More</button>
                        </div>
                    </td>
                </tr>`;
        }).join('');

        contentArea.innerHTML = `
            <div class="gigs-view">
                ${head}
                ${syncStrip}
                ${looseHtml}
                <table class="gigs-table">
                    <thead>
                        <tr>
                            <th class="gig-col-name">Name</th>
                            <th class="gig-col-gig">Gig date</th>
                            <th class="gig-col-playlists">Playlists</th>
                            <th class="gig-col-tracks">Tracks</th>
                            <th class="gig-col-menu"></th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;

        contentArea.querySelector('[data-gig-new]')?.addEventListener('click', () => this.createGigFromPrompt());
        contentArea.querySelector('[data-gig-import]')?.addEventListener('click', () => this.app._onImportRekordboxXml());
        contentArea.querySelectorAll('[data-gig-open]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.app.navigate({ view: 'gigs', id: btn.dataset.gigOpen });
            });
        });
        contentArea.querySelectorAll('[data-gig-menu]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._openGigMenu(btn.dataset.gigMenu, btn);
            });
        });
        contentArea.querySelectorAll('[data-gig-export]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.app._exportGigToRekordbox(btn.dataset.gigExport);
            });
        });
        this._wireGigsSyncStrip(contentArea);
        wireLoose(contentArea);
    }

    // ── Sync-status strip wiring (#4) ──────────────────────────────────
    // - Pending count refreshes async via /api/ingest/rekordbox/pending.
    // - "Clear Pending" mirrors the Import-view button.
    // - "Wipe sidebar" empties Pending + flips every gig to
    //   hideFromRekordbox=true, then re-syncs umm.xml. Reversible per-gig
    //   via the detail-view "Show in Rekordbox" toggle.
    _wireGigsSyncStrip(contentArea) {
        // Pending count — best-effort fetch.
        (async () => {
            try {
                const r = await fetch('/api/ingest/rekordbox/pending');
                if (!r.ok) return;
                const data = await r.json();
                const el = contentArea.querySelector('#gigsSyncPendingCount');
                if (el) el.textContent = String(data?.count ?? data?.entries?.length ?? 0);
            } catch (_) { /* leave as "—" */ }
        })();

        contentArea.querySelector('[data-sync-clear-pending]')?.addEventListener('click', async () => {
            const btn = contentArea.querySelector('[data-sync-clear-pending]');
            if (btn) btn.disabled = true;
            try {
                const res = await fetch('/api/ingest/rekordbox/clear', { method: 'POST' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                this.app.showNotification?.('Pending cleared.', 'success');
                this.render();
            } catch (err) {
                this.app.showNotification?.(`Clear pending failed: ${err.message}`, 'error');
            } finally {
                if (btn) btn.disabled = false;
            }
        });

        contentArea.querySelector('[data-sync-wipe]')?.addEventListener('click', async () => {
            const ok = await this.app._openGigConfirmModal({
                title: 'Empty the Rekordbox sidebar?',
                message: 'This clears Pending and hides every gig from Rekordbox. Your gigs and pending tracks stay in UMM; reverse per-gig from the detail view.',
                confirmLabel: 'Wipe sidebar',
            });
            if (!ok) return;
            const btn = contentArea.querySelector('[data-sync-wipe]');
            if (btn) btn.disabled = true;
            try {
                const db = this.app.integrationManager?.database;
                if (!db) throw new Error('Database unavailable');
                // 1. Clear pending (server side).
                const clr = await fetch('/api/ingest/rekordbox/clear', { method: 'POST' });
                if (!clr.ok) throw new Error(`Clear pending failed: HTTP ${clr.status}`);
                // 2. Flip every gig's hideFromRekordbox=true.
                await setHideFromRekordboxAll(db, true);
                // 3. Push fresh roster + regen umm.xml (now empty Pending + empty Gigs).
                await this.app._syncRekordboxSidebar();
                this.app.showNotification?.('Rekordbox sidebar wiped. Gigs preserved in UMM.', 'success');
                this.render();
            } catch (err) {
                this.app.showNotification?.(`Wipe sidebar failed: ${err.message}`, 'error');
            } finally {
                if (btn) btn.disabled = false;
            }
        });
    }

    // ── Scoped Gig detail view (P5.3) ───────────────────────────────────

    async _renderGigDetail(gig, contentArea) {
        const routeIsStale = this.app._routeIsStale || (() => false);
        this.__renderGigDetailGuard ||= createStaleGuard();
        const loadIsStale = this.__renderGigDetailGuard.begin();
        const isStale = () => routeIsStale() || loadIsStale();
        const viewTitle = document.getElementById('viewTitle');
        const viewSubtitle = document.getElementById('viewSubtitle');

        viewTitle.textContent = gig.name || 'Gig';
        const playlists = Array.isArray(gig.playlists) ? gig.playlists : [];

        // Resolve track records once (so each lane can render rich rows).
        const [all] = await Promise.all([
            this.app._allTracks(),
            this.app._ensureSoundCheckData(),
        ]);
        if (isStale()) return;
        const byId = new Map();
        for (const t of all || []) byId.set(t.id, t);

        const gigTrackIds = new Set(playlists
            .filter((playlist) => !playlist?.isBpmRoll)
            .flatMap((playlist) => Array.isArray(playlist.trackIds) ? playlist.trackIds : [])
            .map(String));
        const soundIssueCount = [...gigTrackIds].reduce((count, trackId) => {
            const track = byId.get(trackId) || { id: trackId };
            return count + (this.app._trackHasSoundIssue(track) ? 1 : 0);
        }, 0);

        // Header track total counts auto-derived BPM lanes too (computed
        // dynamically; stored `trackIds` on those lanes is empty/ignored).
        const trackTotal = playlists.reduce((acc, p, idx) => {
            if (p?.isBpmRoll) return acc + computeBpmRollTrackIds(gig, idx, byId).length;
            return acc + (Array.isArray(p.trackIds) ? p.trackIds.length : 0);
        }, 0);
        viewSubtitle.textContent = [
            gig.gigDate ? gig.gigDate : null,
            `${playlists.length} ${playlists.length === 1 ? 'playlist' : 'playlists'}`,
            `${trackTotal} ${trackTotal === 1 ? 'track' : 'tracks'}`,
        ].filter(Boolean).join(' · ');

        const lanesHtml = playlists.map((p, idx) => this._renderGigLane(p, idx, byId, gig)).join('') || '';
        const emptyState = playlists.length ? '' : `
            <div class="empty-state gig-detail-empty">
                <h3>No playlists yet.</h3>
                <p class="muted">Add a playlist to start curating tracks for this gig.</p>
            </div>`;

        const isHidden = !!gig.hideFromRekordbox;
        const hiddenBadge = isHidden
            ? '<span class="gig-detail-hidden-badge" title="Excluded from Rekordbox sidebar (~/Music/umm.xml)">hidden from Rekordbox</span>'
            : '';
        const hideToggleLabel = isHidden ? 'Show in Rekordbox' : 'Hide from Rekordbox';

        // Header layout: keep frequent actions visible (Add playlist · Rename ·
        // Set date · Export), tuck the rest into a "More" overflow menu so the
        // bar doesn't sprout 7 buttons. The overflow menu shares positioning
        // code with the list-view "More" pill so neither gets clipped.
        contentArea.innerHTML = `
            <div class="gigs-view gig-detail">
                <header class="gig-detail-head">
                    <div class="gig-detail-head-left">
                        <button type="button" class="link-chip chip-sm" data-gig-back>← Gig folders</button>
                        <h2 class="gig-detail-title">${escapeHtml(gig.name || 'Gig')}</h2>
                        ${gig.gigDate ? `<span class="gig-detail-date">${escapeHtml(gig.gigDate)}</span>` : '<span class="gig-detail-date muted">no date</span>'}
                        ${soundIssueCount ? `<span class="gig-sound-summary" title="Tracks needing Sound Check attention">${soundIssueCount} sound ${soundIssueCount === 1 ? 'issue' : 'issues'}</span>` : ''}
                    </div>
                    <div class="gig-detail-head-right">
                        <button type="button" class="btn btn-sm btn-secondary" data-gig-open-collection>Open in Collection</button>
                        <button type="button" class="btn btn-sm btn-secondary" data-gig-add-playlist>Add playlist</button>
                        <button type="button" class="btn btn-sm btn-secondary" data-gig-rename>Rename</button>
                        <button type="button" class="btn btn-sm btn-secondary" data-gig-set-date>Set date</button>
                        <button type="button" class="btn btn-sm" data-gig-export ${trackTotal === 0 ? 'disabled' : ''}>Publish to Rekordbox…</button>
                        <button type="button" class="link-chip chip-sm" data-gig-detail-more aria-haspopup="true">More</button>
                    </div>
                </header>
                ${emptyState}
                <div class="gig-lanes">
                    ${lanesHtml}
                </div>
            </div>`;

        contentArea.querySelector('[data-gig-back]')?.addEventListener('click', () => {
            this.app.navigate({ view: 'gigs' });
        });
        contentArea.querySelector('[data-gig-open-collection]')?.addEventListener('click', () => {
            this.app.filterEngine.setIds([...new Set(playlists.flatMap((p) => p.trackIds || []))], gig.name);
            this.app.navigate({ view: 'collection' });
        });
        contentArea.querySelector('[data-gig-add-playlist]')?.addEventListener('click', () => this._addGigPlaylistPrompt(gig.id));
        contentArea.querySelector('[data-gig-rename]')?.addEventListener('click', () => this._renameGigPrompt(gig.id));
        contentArea.querySelector('[data-gig-set-date]')?.addEventListener('click', () => this._setGigDatePrompt(gig.id));
        contentArea.querySelector('[data-gig-export]')?.addEventListener('click', () => this.app._exportGigToRekordbox(gig.id));
        contentArea.querySelector('[data-gig-detail-more]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._openGigDetailMoreMenu(gig.id, e.currentTarget, { isHidden, hideToggleLabel });
        });

        // Track title / artist / BPM in every lane are entity links.
        wireEntityLinks(contentArea.querySelector('.gig-lanes'), this.app);

        // Wire each lane's controls.
        contentArea.querySelectorAll('.gig-lane').forEach((laneEl) => {
            const idx = Number(laneEl.dataset.laneIdx);
            const lane = gig.playlists?.[idx];
            if (lane) {
                const laneIds = lane.isBpmRoll ? computeBpmRollTrackIds(gig, idx, byId) : (lane.trackIds || []);
                const laneTracks = laneIds.map((id) => byId.get(id)).filter(Boolean);
                const context = {
                    key: `gig-lane:${gig.id}:${lane.id || idx}`, kind: 'gig-lane',
                    label: `${gig.name || 'Gig'} › ${lane.name || 'Untitled playlist'}`, route: { view: 'gigs', id: gig.id },
                };
                this.app.mountListPlay(laneEl.querySelector('.gig-lane-head-right'), laneTracks, context, { position: 'afterbegin', chip: true });
                this._wireLanePlay(laneEl.querySelector('.gig-track-list'), laneTracks, context);
                if (!lane.isBpmRoll) this._wirePlaylistBulk(laneEl, gig, lane, laneIds);
            }
            laneEl.querySelector('[data-lane-rename]')?.addEventListener('click', () => this._renameLanePrompt(gig.id, idx));
            laneEl.querySelector('[data-lane-add-tracks]')?.addEventListener('click', () => this._openTrackPicker(gig.id, idx));
            laneEl.querySelector('[data-lane-delete]')?.addEventListener('click', () => this._confirmDeleteLane(gig.id, idx));
            laneEl.querySelector('[data-lane-up]')?.addEventListener('click', () => this._moveLane(gig.id, idx, idx - 1));
            laneEl.querySelector('[data-lane-down]')?.addEventListener('click', () => this._moveLane(gig.id, idx, idx + 1));
            laneEl.querySelector('[data-lane-refresh]')?.addEventListener('click', () => this._refreshBpmLane(gig.id, idx));

            laneEl.querySelectorAll('[data-track-remove]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    await removeTrackFromGigPlaylist(this.app.integrationManager.database, gig.id, idx, btn.dataset.trackRemove);
                    if (isStale()) return;
                    this.render();
                });
            });
            laneEl.querySelectorAll('[data-track-id]').forEach((row) => row.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                const trackId = row.dataset.trackId;
                const extra = playlists[idx]?.isBpmRoll ? [] : [{
                    label: 'Remove from playlist',
                    run: async () => { await removeTrackFromGigPlaylist(this.app.integrationManager.database, gig.id, idx, trackId); if (this.app._route?.id === gig.id) await this.render(); },
                }];
                this.app._openRowContextMenu({ trackIds: [trackId], x: event.clientX, y: event.clientY, source: gig.name, extra });
            }));
        });
        this._wireLaneDrag(contentArea.querySelector('.gig-lanes'), gig);
    }

    // ── BPM-lane refresh (#1) ──────────────────────────────────────────
    // The lane is already auto-derived at render time; this just gives the user
    // explicit feedback they can trigger and shows the new derived count.
    async _refreshBpmLane(gigId, laneIdx) {
        const db = this.app.integrationManager?.database;
        if (!db) return;
        const gig = await getGig(db, gigId);
        const lane = gig?.playlists?.[laneIdx];
        if (!gig || !lane?.isBpmRoll) return;
        const all = await this.app._allTracks();
        const byId = new Map();
        for (const t of (all || [])) byId.set(t.id, t);
        const ids = computeBpmRollTrackIds(gig, laneIdx, byId);
        // Re-render to surface the (possibly new) ordering.
        this.render();
        this.app.showNotification?.(
            `BPM playlist refreshed — ${ids.length} ${ids.length === 1 ? 'track' : 'tracks'}`,
            'success',
        );
    }

    // ── Prune broken tracks (#2) ───────────────────────────────────────
    // Walks every non-BPM-roll lane and drops trackIds that don't resolve to
    // a usable record (no library entry, no local path, etc.). Surfaces the
    // dropped set in a confirm modal before persisting. BPM-roll lanes have
    // empty `trackIds` by design, so they're skipped.
    async _pruneBrokenGigTracks(gigId) {
        const db = this.app.integrationManager?.database;
        if (!db) return;
        const gig = await getGig(db, gigId);
        if (!gig) return;
        const byId = await this.app._unfilteredTracksById();
        const { dropped } = this.app._resolveGigTracks(gig, byId);
        if (!dropped.length) {
            this.app.showNotification?.('No broken tracks in this gig.', 'info');
            return;
        }
        const proceed = await this._showPruneModal({ dropped, gig });
        if (!proceed) return;

        // Build a `dropped` lookup so the rewrite is O(N).
        const droppedSet = new Set();
        for (const d of dropped) droppedSet.add(`${d.laneName}::${d.trackId}`);

        const playlists = Array.isArray(gig.playlists) ? gig.playlists : [];
        const nextPlaylists = playlists.map((p) => {
            // BPM-roll lanes carry empty trackIds by design — leave them alone.
            if (p?.isBpmRoll) return { ...p, trackIds: [] };
            const laneName = p.name || 'Untitled';
            const filtered = (p.trackIds || []).filter(
                (tid) => !droppedSet.has(`${laneName}::${tid}`),
            );
            return { ...p, trackIds: filtered };
        });

        await setGigPlaylists(db, gigId, nextPlaylists);
        this.app.showNotification?.(
            `Pruned ${dropped.length} ${dropped.length === 1 ? 'track' : 'tracks'} from ${gig.name || 'gig'}.`,
            'success',
        );
        this.render();
    }

    _showPruneModal({ dropped, gig }) {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'enrich-backdrop';
            const dialog = document.createElement('div');
            dialog.className = 'enrich-dialog';
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-label', 'Prune broken tracks');
            backdrop.appendChild(dialog);
            document.body.appendChild(backdrop);

            const close = (val) => {
                backdrop.remove();
                document.removeEventListener('keydown', escHandler);
                resolve(val);
            };
            const escHandler = (e) => { if (e.key === 'Escape' && isTopmostBackdrop(backdrop)) close(false); };
            document.addEventListener('keydown', escHandler);
            backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });

            const reasonLabel = {
                'not-in-library': 'Missing from library',
                'no-local-path': 'No local file (Bandcamp / Discogs / streaming row)',
                'path-outside-roots': 'Path outside LIBRARY_DIR / LOSSLESS_DIR',
            };
            const byReason = new Map();
            for (const d of dropped) {
                if (!byReason.has(d.reason)) byReason.set(d.reason, []);
                byReason.get(d.reason).push(d);
            }
            const groupsHtml = Array.from(byReason.entries()).map(([reason, items]) => {
                const rowsHtml = items.slice(0, 100).map((d) => {
                    const t = d.track;
                    const label = t
                        ? `${escapeHtml(t.artist || 'Unknown')} – ${escapeHtml(t.title || d.trackId)}`
                        : `<code>${escapeHtml(d.trackId)}</code>`;
                    return `<li><span class="muted">[${escapeHtml(d.laneName)}]</span> ${label}</li>`;
                }).join('');
                const overflow = items.length > 100
                    ? `<li class="muted">…and ${items.length - 100} more</li>`
                    : '';
                return `<section class="export-drop-group">
                    <h3>${escapeHtml(reasonLabel[reason] || reason)} <span class="muted">· ${items.length}</span></h3>
                    <ul class="export-drop-list">${rowsHtml}${overflow}</ul>
                </section>`;
            }).join('');

            dialog.innerHTML = `
                <header class="enrich-head">
                    <h2>Prune broken tracks from "${escapeHtml(gig.name || 'Gig')}"</h2>
                    <p><strong>${dropped.length} ${dropped.length === 1 ? 'track will be removed' : 'tracks will be removed'}</strong> from this gig. Files on disk are not touched.</p>
                </header>
                <div class="enrich-body export-drop-body">${groupsHtml}</div>
                <footer class="enrich-foot">
                    <div class="enrich-foot-left"></div>
                    <div class="enrich-foot-right">
                        <button type="button" class="btn btn-sm btn-secondary" data-cancel>Cancel</button>
                        <button type="button" class="btn btn-sm" data-confirm>Remove ${dropped.length} broken ${dropped.length === 1 ? 'track' : 'tracks'}</button>
                    </div>
                </footer>
            `;
            dialog.querySelector('[data-cancel]')?.addEventListener('click', () => close(false));
            dialog.querySelector('[data-confirm]')?.addEventListener('click', () => close(true));
        });
    }

    // ── Hide-from-Rekordbox toggle (#3) ────────────────────────────────
    // Per-gig opt-out of the Rekordbox-facing umm.xml. Gig stays in IDB.
    async _toggleGigHideFromRekordbox(gigId) {
        const db = this.app.integrationManager?.database;
        if (!db) return;
        const gig = await getGig(db, gigId);
        if (!gig) return;
        const next = !gig.hideFromRekordbox;
        await setGigHideFromRekordbox(db, gigId, next);
        // Push the new roster + regen umm.xml so Rekordbox sees the change immediately.
        const result = await this.app._syncRekordboxSidebar();
        if (result) {
            this.app.showNotification?.(
                next
                    ? `${gig.name || 'Gig'} hidden from Rekordbox sidebar.`
                    : `${gig.name || 'Gig'} restored to Rekordbox sidebar.`,
                'success',
            );
        }
        this.render();
    }

    _renderGigLane(playlist, laneIdx, byId, gig) {
        const isBpmRoll = !!playlist.isBpmRoll;
        // Auto-derived lanes recompute their trackIds at render time from the
        // union of every other lane (sorted by BPM asc). The stored `trackIds`
        // on the lane is ignored.
        const trackIds = isBpmRoll
            ? computeBpmRollTrackIds(gig, laneIdx, byId)
            : (Array.isArray(playlist.trackIds) ? playlist.trackIds : []);
        const selection = isBpmRoll ? null : this._playlistSelection(gig, playlist, trackIds);

        const emptyMsg = isBpmRoll
            ? 'No tracks yet. Add some to other playlists and they will appear here.'
            : 'No tracks. Add some →';

        const tracksHtml = trackIds.map((tid, tIdx) => {
            const t = byId.get(tid);
            const title = t?.title || '(missing track)';
            const artist = t?.artist || '';
            const bpm = t?.bpm ? Math.round(Number(t.bpm)) : '';
            const missing = !t;
            const soundMarker = soundStatusMarkerHtml(this.app._soundStatusFor(t || { id: tid }));
            // BPM-roll rows are read-only: no drag handle, no remove button.
            const handle = isBpmRoll ? '' : '<span class="gig-track-handle" aria-label="Drag to reorder, or onto another playlist to copy">⋮⋮</span>';
            const removeBtn = isBpmRoll ? '' : `<button type="button" class="gig-track-remove" data-track-remove="${escapeHtml(tid)}" title="Remove from playlist" aria-label="Remove from playlist">×</button>`;
            const selected = selection?.ids.has(String(tid));
            const checkbox = isBpmRoll ? '' : `<span class="gig-track-select"><input type="checkbox" data-gig-track-select aria-label="Select ${escapeHtml(title)}"${selected ? ' checked' : ''}></span>`;
            const rowAttrs = isBpmRoll ? '' : ` draggable="true" tabindex="0" aria-selected="${selected ? 'true' : 'false'}"`;
            return `
                <li class="gig-track-row${missing ? ' gig-track-missing' : ''}${isBpmRoll ? ' gig-track-readonly' : ''}${selected ? ' row-selected' : ''}"${rowAttrs} data-track-id="${escapeHtml(tid)}" data-track-idx="${tIdx}">
                    ${checkbox}
                    ${handle}
                    <span class="gig-track-sound">${soundMarker}</span>
                    <span class="gig-track-title">${missing ? escapeHtml(title) : entityLinkHtml({ type: 'track', name: tid, text: title })}${stashMarkHtml(t)}</span>
                    <span class="gig-track-artist">${entityLinkHtml({ type: 'artist', name: artist })}</span>
                    <span class="gig-track-bpm">${entityLinkHtml({ type: 'bpm', name: t?.bpm, text: bpm ? String(bpm) : '' })}</span>
                    ${removeBtn}
                    <button type="button" class="row-menu-btn" data-row-menu aria-label="More">⋯</button>
                </li>`;
        }).join('') || `<li class="gig-track-empty muted">${escapeHtml(emptyMsg)}</li>`;

        const addBtn = isBpmRoll
            ? ''
            : '<button type="button" class="btn btn-sm btn-secondary" data-lane-add-tracks>Add tracks</button>';
        const autoBadge = isBpmRoll
            ? '<span class="gig-lane-auto-badge" title="Auto-built from other playlists, sorted by BPM">auto</span>'
            : '';
        // Explicit refresh affordance on auto-derived lanes. Derivation already
        // happens at render time, so this is mostly visual confirmation — click
        // re-renders the gig and toasts the new derived count.
        const refreshBtn = isBpmRoll
            ? '<button type="button" class="link-chip chip-sm gig-lane-refresh" data-lane-refresh title="Re-derive from other playlists" aria-label="Re-derive from other playlists">↻</button>'
            : '';
        const autoHint = isBpmRoll
            ? '<p class="gig-lane-auto-hint muted">Auto-built from other playlists, sorted by BPM.</p>'
            : '';
        const selectedCount = selection?.ids.size || 0;
        const bulkBar = isBpmRoll ? '' : `<div class="selection-bar gig-playlist-selection" data-gig-playlist-selection${selectedCount ? '' : ' hidden'}>
            <span class="selection-count" data-gig-selection-count role="status">${selectedCount} selected</span>
            <div class="selection-bar-actions">${playlistBulkActionsHtml()}<button type="button" class="selection-clear-btn" data-gig-selection-clear>Clear</button></div>
        </div>`;

        return `
            <section class="gig-lane${isBpmRoll ? ' gig-lane-bpm-roll' : ''}" data-lane-idx="${laneIdx}"${isBpmRoll ? ' data-bpm-roll="1"' : ''}>
                <header class="gig-lane-head">
                    <div class="gig-lane-head-left">
                        <h3 class="gig-lane-name">${escapeHtml(playlist.name || 'Untitled playlist')}</h3>
                        ${autoBadge}
                        ${refreshBtn}
                        <span class="gig-lane-count">${trackIds.length} ${trackIds.length === 1 ? 'track' : 'tracks'}</span>
                    </div>
                    <div class="gig-lane-head-right">
                        <button type="button" class="link-chip chip-sm" data-lane-up title="Move up" aria-label="Move up">↑</button>
                        <button type="button" class="link-chip chip-sm" data-lane-down title="Move down" aria-label="Move down">↓</button>
                        ${addBtn}
                        <button type="button" class="link-chip chip-sm" data-lane-rename>Rename</button>
                        <button type="button" class="link-chip chip-sm" data-lane-delete>Delete</button>
                    </div>
                </header>
                ${autoHint}
                ${bulkBar}
                <ol class="gig-track-list">${tracksHtml}</ol>
            </section>`;
    }

    _wirePlaylistBulk(root, gig, playlist, trackIds) {
        const state = this._playlistSelection(gig, playlist, trackIds);
        const rows = [...root.querySelectorAll('.gig-track-row[data-track-id]')];
        const bar = root.querySelector('[data-gig-playlist-selection]');
        const sync = () => {
            for (const row of rows) {
                const on = state.ids.has(String(row.dataset.trackId));
                row.classList.toggle('row-selected', on);
                row.setAttribute('aria-selected', String(on));
                const input = row.querySelector('[data-gig-track-select]');
                if (input) input.checked = on;
            }
            const count = bar?.querySelector('[data-gig-selection-count]');
            if (count) count.textContent = `${state.ids.size} selected`;
            if (state.ids.size) bar?.removeAttribute('hidden'); else bar?.setAttribute('hidden', '');
        };
        const apply = (index, { shift = false, toggle = false } = {}) => {
            const row = rows[index];
            if (!row) return;
            const id = String(row.dataset.trackId);
            if (shift && state.last != null) {
                const [lo, hi] = index < state.last ? [index, state.last] : [state.last, index];
                const add = !state.ids.has(id);
                for (let i = lo; i <= hi; i += 1) {
                    const at = rows[i]?.dataset.trackId;
                    if (at == null) continue;
                    if (add) state.ids.add(String(at)); else state.ids.delete(String(at));
                }
            } else if (toggle) {
                if (state.ids.has(id)) state.ids.delete(id); else state.ids.add(id);
                state.last = index;
            } else {
                state.ids = new Set([id]);
                state.last = index;
            }
            sync();
        };
        root.querySelector('[data-gig-selection-clear]')?.addEventListener('click', () => {
            state.ids.clear(); state.last = null; sync();
        });
        root.querySelector('.gig-track-list')?.addEventListener('click', (event) => {
            const row = event.target.closest('.gig-track-row[data-track-id]');
            if (!row) return;
            const index = rows.indexOf(row);
            if (event.target.closest('[data-gig-track-select]')) {
                event.stopPropagation();
                apply(index, { shift: event.shiftKey, toggle: true });
                return;
            }
            if (event.target.closest('a, button, input, .gig-track-handle')) return;
            apply(index, { shift: event.shiftKey, toggle: event.metaKey || event.ctrlKey });
        });
        root.querySelector('.gig-track-list')?.addEventListener('keydown', (event) => {
            const row = event.target.closest('.gig-track-row[data-track-id]');
            if (!row || event.target !== row) return;
            const index = rows.indexOf(row);
            if (event.key === ' ') {
                event.preventDefault(); apply(index, { shift: event.shiftKey, toggle: true });
            } else if (event.shiftKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
                event.preventDefault();
                const next = Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
                apply(next, { shift: true }); rows[next]?.focus();
            }
        });
        root.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || !state.ids.size) return;
            event.preventDefault();
            event.stopPropagation();
            state.ids.clear(); state.last = null; sync();
        });
        wirePlaylistBulkActions(bar, {
            ids: () => [...state.ids],
            run: (action, ids) => this._runPlaylistBulk(gig, playlist, action, ids),
            transfer: (move, ids) => this._transferPlaylistBulk(gig, playlist, move, ids),
        });
    }

    async _runPlaylistBulk(gig, playlist, action, ids) {
        const key = `${gig.id}:${playlist.id}`;
        try {
            const out = await editPlaylistSelection(this.app.integrationManager.database, this._playlistSource(gig, playlist), action, ids);
            if (!out?.changed) return;
            undoToast(out.message, out.undo, { onUndone: () => this.render() });
        } catch (error) {
            this._playlistSelections.delete(key);
            this.app.showNotification?.(`Edit failed: ${error.message}`, 'error');
        }
        await this.render();
    }

    async _transferPlaylistBulk(gig, playlist, move, ids) {
        const records = await listGigs(this.app.integrationManager.database);
        const target = await choosePlaylistTarget(records, this._playlistSource(gig, playlist), { move, dialog: workspaceDialog });
        if (!target) return;
        const targetRecord = records.find((record) => String(record.id) === String(target.gigId));
        const key = `${gig.id}:${playlist.id}`;
        try {
            const out = await transferPlaylistSelection(
                this.app.integrationManager.database,
                this._playlistSource(gig, playlist),
                { ...target, revision: Number(targetRecord?.revision || 0) },
                ids,
                { move },
            );
            if (!out) return;
            if (out.partial) this.app.showNotification?.(out.message, 'error');
            else undoToast(out.message, out.undo, { onUndone: () => this.render() });
        } catch (error) {
            this._playlistSelections.delete(key);
            this.app.showNotification?.(`${move ? 'Move' : 'Copy'} failed: ${error.message}`, 'error');
        }
        await this.render();
    }

    // Double-click a row to play it, queued with the playlist's playable tracks
    // under the same context as the playlist's Play button.
    _wireLanePlay(listEl, tracks, context) {
        if (!listEl) return;
        const byId = new Map(tracks.map((track) => [String(track.id), track]));
        listEl.addEventListener('dblclick', (event) => {
            if (event.target.closest('a, button, input')) return;
            const track = byId.get(event.target.closest('.gig-track-row[data-track-id]')?.dataset.trackId);
            if (!track) return;
            event.preventDefault();
            this.app.playLocalTrack(track, tracks.filter(isLocalPlayable), context);
        });
    }

    // Drag a track within its playlist to reorder it, or onto another playlist
    // of the gig to copy it there (⇧ moves it). The rule is `laneDrop`
    // (gig-membership.js), shared with the gig panel; the BPM playlist takes
    // no drops. The drag carries { gigId, laneId, trackIdx, trackId }, and the
    // view keeps it too, because a drag's data can't be read before the drop.
    _wireLaneDrag(lanesEl, gig) {
        if (!lanesEl) return;
        let drag = null;
        const laneOf = (el) => el?.closest?.('.gig-lane');
        const laneIdOf = (laneEl) => gig.playlists?.[Number(laneEl.dataset.laneIdx)]?.id;
        const clear = () => {
            lanesEl.querySelectorAll('.gig-track-row.drop-target').forEach((r) => r.classList.remove('drop-target'));
            lanesEl.querySelectorAll('.gig-lane.is-drop').forEach((l) => l.classList.remove('is-drop'));
            lanesEl.querySelectorAll('[data-drop-hint]').forEach((h) => h.removeAttribute('data-drop-hint'));
        };
        const decide = (from, laneEl, move) => laneDrop(gig, { trackIds: [from.trackId], fromLaneId: from.laneId, toLaneId: laneIdOf(laneEl), move });

        lanesEl.addEventListener('dragstart', (e) => {
            const row = e.target.closest?.('.gig-track-row[draggable="true"]');
            const laneEl = laneOf(row);
            if (!row || !laneEl || !e.dataTransfer) return;
            drag = { gigId: String(gig.id), laneId: String(laneIdOf(laneEl) ?? ''), trackIdx: Number(row.dataset.trackIdx), trackId: String(row.dataset.trackId) };
            e.dataTransfer.setData(TRACKS_MIME, JSON.stringify({ ids: [drag.trackId], source: drag }));
            e.dataTransfer.setData('text/plain', drag.trackId);
            e.dataTransfer.effectAllowed = 'copyMove';
            row.classList.add('is-dragging');
        });
        lanesEl.addEventListener('dragend', (e) => {
            e.target.closest?.('.gig-track-row')?.classList.remove('is-dragging');
            drag = null;
            clear();
        });
        lanesEl.addEventListener('dragover', (e) => {
            const laneEl = laneOf(e.target);
            if (!drag || !laneEl) return;
            const decision = decide(drag, laneEl, e.shiftKey);
            if (decision.action === 'reorder') {
                // Within the playlist: drop on a row to put the track there.
                const row = e.target.closest('.gig-track-row');
                clear();
                if (!row) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                row.classList.add('drop-target');
                return;
            }
            if (decision.action === 'reject') { clear(); return; }
            e.preventDefault();
            e.dataTransfer.dropEffect = decision.action === 'move' ? 'move' : 'copy';
            if (!laneEl.classList.contains('is-drop')) { clear(); laneEl.classList.add('is-drop'); }
            laneEl.querySelector('.gig-lane-head-left')?.setAttribute('data-drop-hint', decision.hint);
        });
        lanesEl.addEventListener('dragleave', (e) => { if (!lanesEl.contains(e.relatedTarget)) clear(); });
        lanesEl.addEventListener('drop', async (e) => {
            const laneEl = laneOf(e.target);
            const carried = readTrackDrop(e)?.source;
            const from = carried && String(carried.gigId) === String(gig.id) && carried.trackId ? carried : drag;
            clear();
            if (!from || !laneEl) return;
            e.preventDefault();
            const decision = decide(from, laneEl, e.shiftKey);
            const db = this.app.integrationManager.database;
            if (decision.action === 'reorder') {
                const to = Number(e.target.closest('.gig-track-row')?.dataset.trackIdx);
                if (!Number.isFinite(to) || from.trackIdx === to) return;
                await reorderTrackInGigPlaylist(db, gig.id, Number(laneEl.dataset.laneIdx), from.trackIdx, to);
                return this.render();
            }
            if (decision.action === 'reject') return;
            await this._dropBetweenLanes(gig, { trackId: from.trackId, fromLaneId: from.laneId, toLaneId: laneIdOf(laneEl), move: e.shiftKey });
        });
    }

    // One membership write, decided again against the gig as the server has
    // it. A failed write toasts and the view re-reads; nothing is optimistic.
    async _dropBetweenLanes(gig, { trackId, fromLaneId, toLaneId, move }) {
        const db = this.app.integrationManager.database;
        const here = () => String(this.app._currentGigId) === String(gig.id);
        try {
            const out = await dropBetweenLanes(db, gig.id, { trackIds: [trackId], fromLaneId, toLaneId, move });
            undoToast(out.message, out.undo, { type: out.write ? 'success' : 'info', onUndone: () => { if (here()) this.render(); } });
        } catch (error) {
            this.app.showNotification?.(`Not saved: ${error.message}`, 'error');
        }
        if (here()) await this.render();
    }

    async _renameLanePrompt(gigId, laneIdx) {
        const db = this.app.integrationManager?.database;
        if (!db) return;
        const g = await getGig(db, gigId);
        const cur = g?.playlists?.[laneIdx]?.name || '';
        const next = await this.app._openGigFieldModal({
            title: 'Rename playlist',
            label: 'Playlist name',
            value: cur,
            submitLabel: 'Save playlist',
        });
        if (next == null) return;
        if (next === cur) return;
        await renameGigPlaylist(db, gigId, laneIdx, next);
        this.render();
    }

    async _confirmDeleteLane(gigId, laneIdx) {
        const db = this.app.integrationManager?.database;
        if (!db) return;
        const g = await getGig(db, gigId);
        const lane = g?.playlists?.[laneIdx];
        if (!lane) return;
        const confirmed = await this.app._openGigConfirmModal({
            title: 'Delete playlist?',
            message: `Delete "${lane.name}" from this gig folder? Its tracks stay in your library.`,
            confirmLabel: 'Delete playlist',
        });
        if (!confirmed) return;
        await removeGigPlaylist(db, gigId, laneIdx);
        this.render();
    }

    async _moveLane(gigId, fromIdx, toIdx) {
        const db = this.app.integrationManager?.database;
        if (!db) return;
        await moveGigPlaylist(db, gigId, fromIdx, toIdx);
        this.render();
    }

    async _openTrackPicker(gigId, laneIdx) {
        const db = this.app.integrationManager?.database;
        if (!db) return;
        const all = await this.app._allTracks();
        // Picker only shows tracks with both `availability === 'local'` AND a
        // resolvable file path. Without a local_path the gig export has nothing
        // to point Rekordbox at, so it's better to hide the row up-front than
        // to silently drop it later (P5.4 export bug).
        const locals = (all || []).filter((t) => t.availability === 'local' && (t.local_path || t.path));
        const g = await getGig(db, gigId);
        const lane = g?.playlists?.[laneIdx];
        if (!lane) return;
        if (lane.isBpmRoll) {
            // Defensive: the Add-tracks button is hidden on auto-derived lanes,
            // so we shouldn't get here in normal flow.
            this.app.showNotification?.('BPM playlist is auto-built from other playlists; add tracks there.', 'info');
            return;
        }

        // Map of trackId -> [laneName, …] across this gig so we can show
        // "In <lane>" hints and disable rows already in the current lane.
        const inLanes = new Map();
        for (const p of (g.playlists || [])) {
            for (const tid of p.trackIds || []) {
                if (!inLanes.has(tid)) inLanes.set(tid, []);
                inLanes.get(tid).push(p.name || 'Untitled');
            }
        }
        const inThisLane = new Set(lane.trackIds || []);

        // Favorites snapshot (artists / labels / track-level stars).
        const favs = await db.listFavorites().catch(() => []);
        const favArtists = new Set();
        const favLabels = new Set();
        const favTrackIds = new Set();
        for (const f of favs) {
            if (!f) continue;
            const name = String(f.name || '').trim().toLowerCase();
            if (f.type === 'artist' && name) favArtists.add(name);
            else if (f.type === 'label' && name) favLabels.add(name);
            else if (f.type === 'track' && f.name) favTrackIds.add(String(f.name));
        }

        // Per-picker FilterEngine — independent of Collection's live scope.
        const pickerEngine = new FilterEngine();
        let favoritesOnly = false;

        const backdrop = document.createElement('div');
        backdrop.className = 'enrich-backdrop gig-picker-backdrop';
        const dialog = document.createElement('div');
        dialog.className = 'enrich-dialog gig-picker-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-label', 'Add tracks to playlist');
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        const close = () => {
            backdrop.remove();
            document.removeEventListener('keydown', escHandler);
        };
        const escHandler = (e) => { if (e.key === 'Escape' && isTopmostBackdrop(backdrop)) close(); };
        document.addEventListener('keydown', escHandler);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

        const matchesFavorites = (t) => {
            if (favTrackIds.has(String(t.id))) return true;
            if (t.artist && favArtists.has(String(t.artist).trim().toLowerCase())) return true;
            if (t.label && favLabels.has(String(t.label).trim().toLowerCase())) return true;
            return false;
        };

        const renderRows = (list) => {
            const ROW_CAP = 500;
            const rows = list.slice(0, ROW_CAP).map((t) => {
                const dupHint = inLanes.get(t.id);
                const isInThis = inThisLane.has(t.id);
                const dupBadge = dupHint && dupHint.length
                    ? `<span class="gig-picker-inlane" title="Already in: ${escapeHtml(dupHint.join(', '))}">In ${escapeHtml(dupHint[0])}${dupHint.length > 1 ? ` +${dupHint.length - 1}` : ''}</span>`
                    : '';
                return `
                    <label class="gig-picker-row${isInThis ? ' is-in-lane' : ''}${dupHint ? ' is-dup' : ''}">
                        <input type="checkbox" data-pick="${escapeHtml(t.id)}"${isInThis ? ' disabled' : ''}>
                        <span class="gig-picker-title">${escapeHtml(t.title || '(untitled)')}${dupBadge}</span>
                        <span class="gig-picker-artist">${escapeHtml(t.artist || '')}</span>
                        <span class="gig-picker-bpm">${t.bpm ? Math.round(Number(t.bpm)) : ''}</span>
                        <span class="gig-picker-genre">${escapeHtml(t.genre || '')}</span>
                    </label>
                `;
            }).join('');
            const overflow = list.length > ROW_CAP
                ? `<div class="gig-picker-overflow muted">Showing ${ROW_CAP} of ${list.length} matches. Add facets to narrow.</div>`
                : '';
            return rows + overflow;
        };

        dialog.innerHTML = `
            <header class="enrich-head">
                <h2>Add tracks to "${escapeHtml(lane.name)}"</h2>
                <p class="muted" data-picker-summary></p>
            </header>
            <div class="gig-picker-facets" data-picker-facets></div>
            <div class="gig-picker-search-row">
                <input type="search" class="gig-picker-search" placeholder="Filter by title / artist / genre…" autofocus />
                <label class="gig-picker-fav-toggle">
                    <input type="checkbox" data-picker-fav>
                    <span>Favorites only</span>
                </label>
                <span class="gig-picker-selected" data-picker-selected>0 selected</span>
            </div>
            <div class="enrich-body gig-picker-body"></div>
            <footer class="enrich-foot">
                <div class="enrich-foot-left">
                    <button type="button" class="btn btn-sm btn-secondary" data-pick-clear>Clear selected</button>
                    <button type="button" class="btn btn-sm btn-secondary" data-pick-reset-filters>Reset filters</button>
                </div>
                <div class="enrich-foot-right">
                    <button type="button" class="btn btn-sm btn-secondary" data-pick-cancel>Cancel</button>
                    <button type="button" class="btn btn-sm" data-pick-apply>Add selected</button>
                </div>
            </footer>
        `;

        const body = dialog.querySelector('.gig-picker-body');
        const facetsEl = dialog.querySelector('[data-picker-facets]');
        const summaryEl = dialog.querySelector('[data-picker-summary]');
        const searchEl = dialog.querySelector('.gig-picker-search');
        const favEl = dialog.querySelector('[data-picker-fav]');
        const selectedLabel = dialog.querySelector('[data-picker-selected]');

        const selectedIds = new Set(); // preserved across re-renders

        const updateSelectedLabel = () => {
            selectedLabel.textContent = `${selectedIds.size} selected`;
        };

        const computeCandidates = () => {
            let list = locals;
            if (favoritesOnly) list = list.filter(matchesFavorites);
            list = pickerEngine.applyFilters(list);
            return list;
        };

        const renderFacets = (sourceTracks) => {
            const opts = pickerEngine.getFilterOptions(sourceTracks);
            const state = pickerEngine.state;
            const select = (cat, label, values) => {
                if (!values || !values.length) return '';
                const active = state[cat] || [];
                const optsHtml = facetOptionsHtml({ values: values.slice(0, 400), active, escapeHtml });
                return `<select class="filter-select gig-picker-select" data-picker-cat="${cat}">
                    <option value="">+ ${escapeHtml(label)}${active.length ? ` (${active.length})` : ''}</option>
                    ${optsHtml}
                </select>`;
            };
            const bpm = opts.bpm;
            const range = state.bpmRange || {};
            const bpmHtml = bpm
                ? `<span class="gig-picker-bpm-range">
                    <span class="muted">BPM</span>
                    <input type="number" class="gig-picker-bpm-input" data-picker-bpm="min" placeholder="${bpm.min}" value="${range.min != null ? range.min : ''}" min="0" />
                    <span class="muted">–</span>
                    <input type="number" class="gig-picker-bpm-input" data-picker-bpm="max" placeholder="${bpm.max}" value="${range.max != null ? range.max : ''}" min="0" />
                </span>`
                : '';
            const cats = [
                { key: 'genres', label: 'Genre' },
                { key: 'subgenres', label: 'Subgenre' },
                { key: 'labels', label: 'Label' },
                { key: 'tags', label: 'Tag' },
            ];
            const activePills = [];
            for (const c of cats) {
                for (const v of (state[c.key] || [])) {
                    activePills.push(`<span class="filter-pill gig-picker-pill" data-picker-pill data-picker-cat="${c.key}" data-picker-val="${escapeHtml(v)}">${c.label}: ${escapeHtml(v)} <span class="x">&times;</span></span>`);
                }
            }
            if (state.bpmRange) {
                const lo = state.bpmRange.min != null ? state.bpmRange.min : (bpm ? bpm.min : '');
                const hi = state.bpmRange.max != null ? state.bpmRange.max : (bpm ? bpm.max : '');
                activePills.push(`<span class="filter-pill gig-picker-pill" data-picker-pill data-picker-cat="bpmRange">BPM: ${lo}–${hi} <span class="x">&times;</span></span>`);
            }
            facetsEl.innerHTML = `
                <div class="gig-picker-facet-row">
                    ${select('genres', 'Genre', opts.genres)}
                    ${select('subgenres', 'Subgenre', opts.subgenres)}
                    ${select('labels', 'Label', opts.labels)}
                    ${select('tags', 'Tag', opts.tags)}
                    ${bpmHtml}
                </div>
                ${activePills.length ? `<div class="gig-picker-pills">${activePills.join('')}</div>` : ''}
            `;
        };

        const refreshBody = () => {
            const candidates = computeCandidates();
            body.innerHTML = renderRows(candidates);
            for (const cb of body.querySelectorAll('input[data-pick]')) {
                if (selectedIds.has(cb.dataset.pick)) cb.checked = true;
            }
            const newish = candidates.filter((t) => !inThisLane.has(t.id)).length;
            summaryEl.textContent = `${newish} candidate${newish === 1 ? '' : 's'} (playlist: ${lane.trackIds.length} ${lane.trackIds.length === 1 ? 'track' : 'tracks'} already)`;
        };

        const wireFacets = () => {
            facetsEl.querySelectorAll('.gig-picker-select').forEach((sel) => {
                sel.addEventListener('change', () => {
                    if (!sel.value) return;
                    pickerEngine.toggleFilter(sel.dataset.pickerCat, sel.value);
                    sel.value = '';
                    fullRefresh();
                });
            });
            facetsEl.querySelectorAll('[data-picker-pill]').forEach((pill) => {
                pill.addEventListener('click', () => {
                    const cat = pill.dataset.pickerCat;
                    if (cat === 'bpmRange') pickerEngine.setBpmRange(null, null);
                    else pickerEngine.toggleFilter(cat, pill.dataset.pickerVal);
                    fullRefresh();
                });
            });
            const commitBpm = () => {
                const minEl = facetsEl.querySelector('[data-picker-bpm="min"]');
                const maxEl = facetsEl.querySelector('[data-picker-bpm="max"]');
                const minV = minEl && minEl.value !== '' ? Number(minEl.value) : null;
                const maxV = maxEl && maxEl.value !== '' ? Number(maxEl.value) : null;
                pickerEngine.setBpmRange(minV, maxV);
                fullRefresh();
            };
            facetsEl.querySelectorAll('.gig-picker-bpm-input').forEach((inp) => {
                inp.addEventListener('change', commitBpm);
                inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitBpm(); } });
            });
        };

        const fullRefresh = () => {
            const facetSource = favoritesOnly ? locals.filter(matchesFavorites) : locals;
            renderFacets(facetSource);
            wireFacets();
            refreshBody();
        };

        // Lightweight debounce on the search box.
        let searchTimer = null;
        searchEl.addEventListener('input', () => {
            if (searchTimer) clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                pickerEngine.setSearch(searchEl.value || '');
                refreshBody();
            }, 90);
        });

        favEl.addEventListener('change', () => {
            favoritesOnly = !!favEl.checked;
            fullRefresh();
        });

        // Track checkbox toggles into our cross-render selection set.
        body.addEventListener('change', (e) => {
            const cb = e.target.closest?.('input[data-pick]');
            if (!cb) return;
            const id = cb.dataset.pick;
            if (cb.checked) selectedIds.add(id);
            else selectedIds.delete(id);
            updateSelectedLabel();
        });

        dialog.querySelector('[data-pick-clear]')?.addEventListener('click', () => {
            selectedIds.clear();
            body.querySelectorAll('input[data-pick]:checked').forEach((b) => { b.checked = false; });
            updateSelectedLabel();
        });
        dialog.querySelector('[data-pick-reset-filters]')?.addEventListener('click', () => {
            pickerEngine.clearAll();
            favoritesOnly = false;
            favEl.checked = false;
            searchEl.value = '';
            fullRefresh();
        });
        dialog.querySelector('[data-pick-cancel]')?.addEventListener('click', () => close());
        dialog.querySelector('[data-pick-apply]')?.addEventListener('click', async () => {
            const ids = Array.from(selectedIds).filter((id) => !inThisLane.has(id));
            if (ids.length) {
                await addTracksToGigPlaylist(db, gigId, laneIdx, ids);
                this.app.showNotification?.(`Added ${ids.length} track${ids.length === 1 ? '' : 's'} to ${lane.name}`, 'success');
            }
            close();
            this.render();
        });

        fullRefresh();
        updateSelectedLabel();
        requestAnimationFrame(() => searchEl?.focus());
    }

    // Shared "pick a gig + lane, add these tracks" modal — used by Collection
    // right-click and the bulk-action bar. Confirms via toast and silently
    // skips ids that are already in the chosen lane.
    // The membership editor (gig membership Phase 1). One gig at a time; every
    // lane is a checkbox against the selection: checked = every selected track
    // is in it, indeterminate = some are. Save writes one transactional diff.
    async openLanePicker(trackIds, { source = '', snapshot = false } = {}) {
        const db = this.app.integrationManager?.database;
        if (!db) return;
        const ids = Array.from(new Set((trackIds || []).filter(Boolean).map(String)));
        if (!ids.length) {
            this.app.showNotification?.('No tracks selected.', 'info');
            return;
        }

        let gigs = await listGigs(db, { sort: 'updatedAt' });

        // No gigs yet → create a blank gig, then let the user add the playlist
        // that should receive the selected tracks.
        if (!gigs.length) {
            const values = await this._openCreateGigModal();
            if (!values) return;
            const gig = await createGig(db, values);
            await seedDefaultGigLanes(db, gig.id);
            gigs = await listGigs(db, { sort: 'updatedAt' });
        }

        const backdrop = document.createElement('div');
        backdrop.className = 'enrich-backdrop gig-picker-backdrop gig-lane-picker-backdrop';
        const dialog = document.createElement('div');
        dialog.className = 'enrich-dialog gig-lane-picker-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-label', 'Add to gig');
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        const close = () => {
            backdrop.remove();
            document.removeEventListener('keydown', escHandler);
        };
        const escHandler = (e) => { if (e.key === 'Escape' && isTopmostBackdrop(backdrop)) close(); };
        document.addEventListener('keydown', escHandler);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

        // Per gig: the lane states the dialog opened with (`before`) and the
        // states the user has toggled to (`after`). Lanes still without ids
        // are migrated the moment that gig is selected, before any edit.
        const state = new Map();
        const laneStates = async (gigId) => {
            if (state.has(gigId)) return state.get(gigId);
            let gig = gigs.find((g) => g.id === gigId);
            if (gig && gig.playlists?.some((lane) => !lane.id)) {
                gig = await ensureLaneIds(db, gig);
                gigs = gigs.map((g) => (g.id === gigId ? gig : g));
            }
            const before = laneMembership(gig, ids);
            const entry = { before, after: before.map((row) => ({ ...row })) };
            state.set(gigId, entry);
            return entry;
        };
        let selectedGigId = (gigs.find((g) => !g.standalone) || gigs[0])?.id || '';
        const currentDiff = () => { const s = state.get(selectedGigId); return s ? membershipDiff(s.before, s.after) : { add: [], remove: [] }; };
        const renderLanes = () => renderLaneRows(state.get(selectedGigId)?.after || []);

        // Gigs first, then playlists without a gig in their own group.
        const renderGigList = () => {
            const row = (g) => {
                const trackN = Array.isArray(g.playlists)
                    ? g.playlists.reduce((acc, p) => acc + (Array.isArray(p.trackIds) ? p.trackIds.length : 0), 0)
                    : 0;
                return `
                    <label class="gig-lane-picker-gig${g.id === selectedGigId ? ' is-active' : ''}">
                        <input type="radio" name="gig-pick" value="${escapeHtml(g.id)}"${g.id === selectedGigId ? ' checked' : ''}>
                        <span class="gig-lane-picker-gig-name">${escapeHtml(g.name || 'Untitled')}</span>
                        <span class="muted">${g.gigDate ? escapeHtml(g.gigDate) + ' · ' : ''}${trackN} ${trackN === 1 ? 'track' : 'tracks'}</span>
                    </label>
                `;
            };
            const loose = gigs.filter((g) => g.standalone);
            return gigs.filter((g) => !g.standalone).map(row).join('')
                + (loose.length ? `<div class="gig-lane-picker-group muted">Playlists</div>${loose.map(row).join('')}` : '');
        };

        const sourceLabel = source ? ` from ${escapeHtml(source)}` : '';
        dialog.innerHTML = `
            <header class="enrich-head">
                <h2>Add ${ids.length} track${ids.length === 1 ? '' : 's'} to a gig folder${sourceLabel}</h2>
                <p class="muted">Pick a gig folder, then the playlists these tracks belong in.</p>
                ${snapshot ? '<p class="muted">One-time copy of all current matches, including tracks beyond the displayed rows. Existing playlist tracks are skipped. Later filter changes will not update this playlist.</p>' : ''}
            </header>
            <div class="gig-lane-picker-body">
                <div class="gig-lane-picker-col">
                    <h3 class="gig-lane-picker-h">Gig folder</h3>
                    <div class="gig-lane-picker-list" data-gig-list>${renderGigList()}</div>
                    <button type="button" class="btn btn-sm btn-secondary gig-lane-picker-new" data-new-gig>+ New gig folder</button>
                </div>
                <div class="gig-lane-picker-col">
                    <h3 class="gig-lane-picker-h">Playlists</h3>
                    <div class="gig-lane-picker-list" data-lane-list></div>
                </div>
            </div>
            <footer class="enrich-foot">
                <div class="enrich-foot-left"></div>
                <div class="enrich-foot-right">
                    <button type="button" class="btn btn-sm btn-secondary" data-glp-cancel>Cancel</button>
                    <button type="button" class="btn btn-sm" data-glp-apply>Save</button>
                </div>
            </footer>
        `;

        const gigListEl = dialog.querySelector('[data-gig-list]');
        const laneListEl = dialog.querySelector('[data-lane-list]');
        const applyBtn = () => dialog.querySelector('[data-glp-apply]');

        const refreshLanes = async () => {
            await laneStates(selectedGigId);
            if (!laneListEl.isConnected) return;
            laneListEl.innerHTML = renderLanes();
            laneListEl.querySelectorAll('input[data-indeterminate="true"]').forEach((input) => { input.indeterminate = true; });
            wireLanes();
            const btn = applyBtn(); if (btn) btn.textContent = describeDiff(currentDiff());
        };
        const refreshGigs = () => {
            gigListEl.innerHTML = renderGigList();
            wireGigs();
        };

        const wireGigs = () => {
            gigListEl.querySelectorAll('input[name="gig-pick"]').forEach((r) => {
                r.addEventListener('change', () => {
                    selectedGigId = r.value;
                    refreshGigs();
                    refreshLanes();
                });
            });
        };
        const wireLanes = () => {
            laneListEl.querySelectorAll('input[data-lane-id]').forEach((input) => {
                input.addEventListener('change', () => {
                    const entry = state.get(selectedGigId);
                    const row = entry?.after.find((r) => r.laneId === input.dataset.laneId);
                    if (!row) return;
                    row.state = nextLaneState(row.state);
                    refreshLanes();
                });
            });
            laneListEl.querySelector('[data-add-lane]')?.addEventListener('click', async () => {
                const name = await this.app._openGigFieldModal({
                    title: 'Add playlist',
                    label: 'Playlist name',
                    submitLabel: 'Add playlist',
                });
                if (name == null) return;
                await addPlaylistToGig(db, selectedGigId, { name });
                gigs = await listGigs(db, { sort: 'updatedAt' });
                state.delete(selectedGigId);
                await refreshLanes();
            });
        };

        wireGigs();
        await refreshLanes();

        dialog.querySelector('[data-new-gig]')?.addEventListener('click', async () => {
            const values = await this._openCreateGigModal();
            if (!values) return;
            const gig = await createGig(db, values);
            await seedDefaultGigLanes(db, gig.id);
            gigs = await listGigs(db, { sort: 'updatedAt' });
            selectedGigId = gig.id;
            refreshGigs();
            await refreshLanes();
        });

        dialog.querySelector('[data-glp-cancel]')?.addEventListener('click', () => close());
        dialog.querySelector('[data-glp-apply]')?.addEventListener('click', async (event) => {
            const applyButton = event.currentTarget;
            if (applyButton.disabled) return;
            const entry = state.get(selectedGigId);
            const diff = entry ? membershipDiff(entry.before, entry.after) : { add: [], remove: [] };
            if (!diff.add.length && !diff.remove.length) { close(); return; }
            applyButton.disabled = true;
            try {
                const gig = await setLaneMembership(db, selectedGigId, { trackIds: ids, addLaneIds: diff.add, removeLaneIds: diff.remove });
                if (!gig) throw new Error('that gig no longer exists');
                if (diff.add.length) writeGigTarget(localStorage, { gigId: gig.id, laneIds: diff.add });
                const names = (laneIds) => laneIds.map((id) => gig.playlists.find((l) => String(l.id) === id)?.name || '?').join(', ');
                const parts = [];
                if (diff.add.length) parts.push(`added ${ids.length} to ${names(diff.add)}`);
                if (diff.remove.length) parts.push(`removed from ${names(diff.remove)}`);
                this.app.showNotification?.(`${gig.name}: ${parts.join(' · ')}`, 'success');
                close();
                if (this.app._route?.view === 'gigs') await this.render();
            } catch (error) {
                this.app.showNotification?.(`Could not save: ${error.message}`, 'error');
                state.delete(selectedGigId);
                gigs = await listGigs(db, { sort: 'updatedAt' });
                refreshGigs(); await refreshLanes();
            } finally {
                applyButton.disabled = false;
            }
        });
    }
    async createGigFromPrompt() {
        const db = this.app.integrationManager?.database;
        if (!db) return;
        const values = await this._openCreateGigModal();
        if (!values) return;
        try {
            const created = await createGig(db, values);
            await seedDefaultGigLanes(db, created.id);
            // Open the new gig directly so the user lands inside the workspace.
            this.app.navigate({ view: 'gigs', id: created.id });
        } catch (err) {
            console.error('[gigs] create failed:', err);
            this.app.showNotification?.(`Could not create gig: ${err?.message || 'unknown error'}`, 'error');
        }
    }

    // Native prompts can be suppressed or appear behind an app-hosted browser,
    // which made the New gig action look like a no-op. Keep this in-app so the
    // creation step is visible, keyboard-friendly, and can show validation.
    _openCreateGigModal() {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'enrich-backdrop';
            const dialog = document.createElement('form');
            dialog.className = 'enrich-dialog gig-create-dialog';
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.setAttribute('aria-label', 'Create a new gig');
            dialog.innerHTML = `
                <header class="enrich-head">
                    <h2>New gig folder</h2>
                    <p class="muted">Create a folder of playlists for a show.</p>
                </header>
                <div class="enrich-body gig-create-fields">
                    <label class="gig-create-label" for="newGigName">Gig folder name</label>
                    <input class="gig-create-input" id="newGigName" name="name" type="text" autocomplete="off" autofocus placeholder="e.g. Friday at Elsewhere">
                    <label class="gig-create-label" for="newGigDate">Gig date <span class="muted">(optional)</span></label>
                    <input class="gig-create-input" id="newGigDate" name="gigDate" type="date">
                    <p class="error" data-create-gig-error hidden></p>
                </div>
                <footer class="enrich-foot">
                    <div class="enrich-foot-left"></div>
                    <div class="enrich-foot-right">
                        <button type="button" class="btn btn-sm btn-secondary" data-cancel>Cancel</button>
                        <button type="submit" class="btn btn-sm">Create gig folder</button>
                    </div>
                </footer>`;
            backdrop.appendChild(dialog);
            document.body.appendChild(backdrop);

            const nameInput = dialog.elements.name;
            const dateInput = dialog.elements.gigDate;
            const errorEl = dialog.querySelector('[data-create-gig-error]');
            const finish = (result) => {
                backdrop.remove();
                document.removeEventListener('keydown', onKeyDown);
                resolve(result);
            };
            const onKeyDown = (event) => {
                if (event.key === 'Escape' && isTopmostBackdrop(backdrop)) finish(null);
            };
            document.addEventListener('keydown', onKeyDown);
            backdrop.addEventListener('click', (event) => {
                if (event.target === backdrop) finish(null);
            });
            dialog.querySelector('[data-cancel]')?.addEventListener('click', () => finish(null));
            dialog.addEventListener('submit', (event) => {
                event.preventDefault();
                const name = String(nameInput?.value || '').trim();
                if (!name) {
                    errorEl.textContent = 'Give this gig a name.';
                    errorEl.hidden = false;
                    nameInput?.focus();
                    return;
                }
                finish({ name, gigDate: String(dateInput?.value || '').trim() || null });
            });
            requestAnimationFrame(() => nameInput?.focus());
        });
    }

    // List-view "More" menu — opens off the row's More pill. Same items as
    // before plus Duplicate; routed through the shared overflow mount so it
    // doesn't clip at the gigs-table boundary.
    _openGigMenu(id, anchorBtn) {
        const items = [
            { act: 'rename', label: 'Rename' },
            { act: 'gigdate', label: 'Set gig date' },
            { act: 'add-playlist', label: 'Add playlist' },
            { act: 'duplicate', label: 'Duplicate' },
            { act: 'delete', label: 'Delete', danger: true },
        ];
        this.app._mountGigOverflowMenu({
            anchorBtn,
            items,
            onPick: async (act) => {
                if (act === 'rename') await this._renameGigPrompt(id);
                else if (act === 'gigdate') await this._setGigDatePrompt(id);
                else if (act === 'add-playlist') await this._addGigPlaylistPrompt(id);
                else if (act === 'duplicate') await this._duplicateGig(id);
                else if (act === 'delete') await this._confirmDeleteGig(id);
            },
        });
    }

    // Detail-header "More" menu — overflow for the per-gig actions that
    // weren't promoted to the primary button row.
    _openGigDetailMoreMenu(id, anchorBtn, { isHidden, hideToggleLabel } = {}) {
        const items = [
            { act: 'import-rb', label: 'Update from Rekordbox' },
            { act: 'duplicate', label: 'Duplicate' },

            { act: 'prune', label: 'Prune broken tracks' },
            { act: 'delete', label: 'Delete', danger: true },
        ];
        this.app._mountGigOverflowMenu({
            anchorBtn,
            items,
            onPick: async (act) => {
                if (act === 'import-rb') await this.app._onImportRekordboxXml(id);
                else if (act === 'duplicate') await this._duplicateGig(id);
                else if (act === 'hide-toggle') await this._toggleGigHideFromRekordbox(id);
                else if (act === 'prune') await this._pruneBrokenGigTracks(id);
                else if (act === 'delete') await this._confirmDeleteGigFromDetail(id);
            },
        });
    }

    // Duplicate a gig: copy lanes (preserve `isBpmRoll`), name "<orig> (copy)",
    // gigDate cleared, hideFromRekordbox reset to false. Lands the user on the
    // new gig's detail view so they can immediately tweak it.
    async _duplicateGig(id) {
        const db = this.app.integrationManager?.database;
        if (!db) return;
        const src = await getGig(db, id);
        if (!src) return;
        const newName = `${src.name || 'Untitled gig'} (copy)`;
        const created = await createGig(db, { name: newName, gigDate: null });
        const lanes = Array.isArray(src.playlists) ? src.playlists.map((p) => {
            const lane = {
                name: p.name || 'Untitled playlist',
                trackIds: Array.isArray(p.trackIds) ? [...p.trackIds] : [],
            };
            if (p.isBpmRoll) lane.isBpmRoll = true;
            return lane;
        }) : [];
        await setGigPlaylists(db, created.id, lanes);
        // hideFromRekordbox defaults to false on a freshly-created gig — no
        // explicit clear needed (createGig doesn't set the flag).
        this.app.showNotification?.(`Duplicated to "${newName}".`, 'success');
        // Drop into the new gig's detail view so further edits feel direct.
        this.app.navigate({ view: 'gigs', id: created.id });
    }

    // Delete from the detail view: confirm, drop record, navigate back to the
    // gigs list. Different from `_confirmDeleteGig` only in the post-delete
    // navigation (list view rebuilds itself; detail view doesn't have a row to
    // disappear from).
    async _confirmDeleteGigFromDetail(id) {
        const db = this.app.integrationManager?.database;
        if (!db) return;
        const g = await getGig(db, id);
        if (!g) return;
        const confirmed = await this.app._openGigConfirmModal({
            title: 'Delete gig folder?',
            message: `Delete "${g.name}"? This cannot be undone.`,
            confirmLabel: 'Delete gig folder',
        });
        if (!confirmed) return;
        await deleteGigRec(db, id);
        this.app.showNotification?.(`Deleted gig folder "${g.name}".`, 'success');
        this.app.navigate({ view: 'gigs' });
    }

    async _renameGigPrompt(id) {
        const db = this.app.integrationManager?.database;
        if (!db) return;
        const g = await getGig(db, id);
        if (!g) return;
        const name = await this.app._openGigFieldModal({
            title: 'Rename gig folder',
            label: 'Gig folder name',
            value: g.name || '',
            submitLabel: 'Save gig folder',
        });
        if (name == null) return;
        if (name === g.name) return;
        await renameGig(db, id, name);
        this.render();
    }

    async _setGigDatePrompt(id) {
        const db = this.app.integrationManager?.database;
        if (!db) return;
        const g = await getGig(db, id);
        if (!g) return;
        const raw = await this.app._openGigFieldModal({
            title: 'Set gig date',
            description: 'Leave blank to clear the date.',
            label: 'Gig date',
            value: g.gigDate || '',
            type: 'date',
            submitLabel: 'Save date',
            allowBlank: true,
        });
        if (raw == null) return;
        if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            this.app.showNotification?.('Use YYYY-MM-DD format', 'error');
            return;
        }
        await setGigDate(db, id, raw || null);
        this.render();
    }

    async _addGigPlaylistPrompt(id) {
        const db = this.app.integrationManager?.database;
        if (!db) return;
        const name = await this.app._openGigFieldModal({
            title: 'Add playlist',
            label: 'Playlist name',
            submitLabel: 'Add playlist',
        });
        if (name == null) return;
        await addPlaylistToGig(db, id, { name });
        this.render();
    }

    async _confirmDeleteGig(id) {
        const db = this.app.integrationManager?.database;
        if (!db) return;
        const g = await getGig(db, id);
        if (!g) return;
        const confirmed = await this.app._openGigConfirmModal({
            title: 'Delete gig folder?',
            message: `Delete "${g.name}"? This cannot be undone.`,
            confirmLabel: 'Delete gig folder',
        });
        if (!confirmed) return;
        await deleteGigRec(db, id);
        this.render();
    }
}
