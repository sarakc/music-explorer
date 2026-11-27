// The gig panel: the Gigs tab of the right-hand slot, on every Collection tab
// and object page. A picker chooses the gig (upcoming, undated, past, then
// standalone playlists); its playlists list in order with one **target**.
// Each playlist row follows the selection: **+ add**, or the focused track's
// title when it is already there (a click removes it). Rows dragged from any
// Collection table, `G` and Add to gig add to the target. A line under the
// playlists adds the filtered tracks. While it shows, Collection rows in this
// gig get a tint and a chip. State `umm.gigPanel = { gigId, targetLaneId, follow }`.
// On an artist, label, tag or album page the picker's first entry is that
// entity: on it the panel follows the page and lists where the entity's tracks
// are used (gig-follow.js), read-only. Choosing a gig turns `follow` off.
import { listGigs, onGigsChanged, createGig, seedDefaultGigLanes } from './gigs.js';
import { readGigTarget, writeGigTarget, copyFilterResultsToGig } from './track-actions.js';
import { carriesTracks, readTrackDrop, TRACKS_MIME } from './track-drag.js';
import { laneDrop } from './gig-membership.js';
import { followModel } from './gig-follow.js';
import { undoToast } from './undo-toast.js';
import { isLocalPlayable } from './player.js';
import { workspaceDialog } from './playlists-workspace.js';
import {
    choosePlaylistTarget, editPlaylistSelection, playlistBulkActionsHtml,
    transferPlaylistSelection, wirePlaylistBulkActions,
} from './playlist-bulk.js';
import {
    pickerGroups, pickerDefault, findLane, firstTargetLane, laneTrackIds, rowMark, isStandalone,
    addToLane, removeFromLane, reorderLane, dropBetweenLanes, localDay, playlistTargets,
} from './unified-playlists.js';
import { escapeHtml as esc } from './html.js';

const STORAGE_KEY = 'umm.gigPanel';
const clock = (secs) => { const s = Math.round(Number(secs) || 0); return s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : ''; };
const minutes = (secs) => { const m = Math.round(secs / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };

export function readPanelState(storage = globalThis.localStorage) {
    try {
        const s = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
        // `follow` starts on when nothing is stored; a stored state without it (a gig already chosen) is off.
        if (!s || typeof s !== 'object') return { gigId: null, targetLaneId: null, follow: true };
        return { gigId: s.gigId || null, targetLaneId: s.targetLaneId || null, follow: s.follow === true };
    } catch (_) { return { gigId: null, targetLaneId: null, follow: true }; }
}

/** Which gig the panel shows and which playlist is the target. The derived BPM playlist is never the target. */
export function panelModel(records, state, stored, today = localDay()) {
    let gig = state?.gigId ? (records || []).find((r) => String(r.id) === String(state.gigId)) : null;
    let laneId = state?.targetLaneId || null;
    if (!gig) {
        const first = pickerDefault(records, stored, today);
        gig = first ? records.find((r) => String(r.id) === String(first.gigId)) : null;
        laneId = first?.laneId || null;
    }
    if (!gig) return { gig: null, targetLaneId: null };
    const lane = findLane(gig, laneId);
    return { gig, targetLaneId: lane && !lane.isBpmRoll ? String(lane.id) : String(firstTargetLane(gig)?.id ?? '') || null };
}

/**
 * The picker's options, grouped, the chosen gig selected. On an entity page
 * (`page`) the entity is the first entry, above the groups, and is the selected
 * one while the panel follows the page.
 */
export function pickerOptionsHtml(records, gigId, today = localDay(), { page = null, following = false } = {}) {
    const first = page ? `<option value="" data-gp-page${following ? ' selected' : ''}>${esc(page.name)}</option>` : '';
    if (page && following) gigId = null;
    return first + pickerGroups(records, today).map((g) => `<optgroup label="${esc(g.label)}">${g.items.map((r) => `<option value="${esc(r.id)}"${String(r.id) === String(gigId) ? ' selected' : ''}>${esc(r.name)}${r.gigDate ? ` · ${esc(r.gigDate)}` : ''}</option>`).join('')}</optgroup>`).join('');
}

export default class GigPanel {
    constructor({ app, slot, storage = globalThis.localStorage }) {
        this.app = app; this.slot = slot; this.storage = storage;
        this.state = readPanelState(storage);
        this.records = [];
        this.expanded = new Set();
        this.byId = new Map();
        this.selection = { ids: [], focusedId: null };
        this.page = null;
        this.playlistSelections = new Map();
        onGigsChanged(() => { if (this.pane) this._reloadSoon(); });
        this.slot.onChange(() => { this._paintMarks(); });
    }

    get db() { return this.app.integrationManager?.database; }
    /** Open = the Gigs tab is what the expanded slot shows (only in Collection). */
    isOpen() { return this.slot.shows('gig'); }

    /** The page entry is showing: the panel lists where the page's entity is used and takes no edits. */
    get following() { return Boolean(this.state.follow && this.page); }

    /** The app says which entity the current page is about (null on any other page). */
    setPage(entity) {
        const key = (e) => (e ? `${e.type}\n${e.name}\n${e.artist || ''}` : '');
        if (key(entity) === key(this.page)) return;
        const was = this.following;
        this.page = entity || null;
        if (!this.pane || !this._loaded) return;
        // On a gig only the picker's first entry changes; the building panel is left as it is.
        if (!was && !this.following) {
            const picker = this.pane.querySelector('.gp-picker');
            if (picker) picker.innerHTML = pickerOptionsHtml(this.records, this.gig?.id, undefined, { page: this.page });
            return;
        }
        this.render();
        this._paintMarks();
    }

    _save() { try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch (_) { /* a preference only */ } }

    _pane() {
        if (this.pane) return this.pane;
        this.pane = this.slot.paneFor('gig', { className: 'gig-panel' });
        this.pane.setAttribute('aria-label', 'Gigs');
        this._wire(this.pane);
        return this.pane;
    }

    /** The Gig button: show the panel, or collapse it when it is what shows. Only in Collection. */
    toggle({ trigger = null } = {}) {
        if (this.slot.section !== 'collection') return false;
        if (this.slot.shows('gig')) { this.slot.collapse(); return true; }
        this.open({ trigger });
        return true;
    }

    async open({ trigger = null } = {}) {
        this._pane();
        this.slot.open('gig', { trigger });
        await this.load();
        this.pane.querySelector('.gp-picker')?.focus({ preventScroll: true });
    }

    /** The Go list: Show gig panel, from anywhere (it opens on Collection). */
    async show() {
        if (this.slot.section !== 'collection') await this.app.navigate({ view: 'collection' });
        return this.open();
    }

    commands() { return [{ label: 'Show gig panel', source: 'Gig', run: () => this.show() }]; }

    _reloadSoon() { clearTimeout(this._reload); this._reload = setTimeout(() => this.load(), 120); }

    async load() {
        this._pane();
        const [records, all] = await Promise.all([listGigs(this.db).catch(() => []), this.app._unfilteredTracksById?.().catch(() => null)]);
        this.records = records;
        this.byId = new Map([...(all || new Map())].map(([id, t]) => [String(id), t]));
        for (const t of this.app._tracksCache || []) if (!this.byId.has(String(t.id))) this.byId.set(String(t.id), t);
        const model = panelModel(records, this.state, readGigTarget(this.storage));
        this.gig = model.gig;
        if (model.gig && (String(model.gig.id) !== String(this.state.gigId) || model.targetLaneId !== this.state.targetLaneId)) {
            this.state = { ...this.state, gigId: String(model.gig.id), targetLaneId: model.targetLaneId };
            this._save();
        }
        if (model.targetLaneId && !this._expandedFor) { this.expanded.add(model.targetLaneId); this._expandedFor = model.gig?.id; }
        this._loaded = true;
        this.render();
        this._paintMarks();
    }

    _track(id) { return this.byId.get(String(id)) || { id: String(id), title: 'Missing track', artist: '' }; }

    _playlistSelection(playlist, trackIds = []) {
        const key = `${this.gig.id}:${playlist.id}`;
        const state = this.playlistSelections.get(key) || { ids: new Set(), last: null };
        const valid = new Set(trackIds.map(String));
        state.ids = new Set([...state.ids].filter((id) => valid.has(String(id))).map(String));
        if (state.last != null && (state.last < 0 || state.last >= trackIds.length)) state.last = null;
        this.playlistSelections.set(key, state);
        return state;
    }

    render() {
        const pane = this._pane();
        const following = this.following;
        const gig = following ? null : this.gig;
        const head = `<div class="gp-head"><select class="gp-picker" aria-label="Gig">${pickerOptionsHtml(this.records, gig?.id, undefined, { page: this.page, following })}</select></div>
            <div class="gp-sub"><button type="button" class="link-chip chip-sm" data-gp-new>New gig…</button>${gig && !isStandalone(gig) ? `<a class="gp-open" href="#/gigs/${encodeURIComponent(gig.id)}">Open in Gigs</a>` : gig ? `<a class="gp-open" href="#/playlists/u/${encodeURIComponent(gig.id)}">Open playlist</a>` : ''}${gig?.gigDate ? `<span class="gp-date">${esc(gig.gigDate)}</span>` : ''}</div>`;
        if (following) { pane.innerHTML = `${head}${this._followHtml()}<div class="gp-foot" hidden></div>`; this.refreshFoot(); return; }
        if (!gig) { pane.innerHTML = `${head}<p class="gp-empty">No gigs yet.</p><div class="gp-foot" hidden></div>`; this.refreshFoot(); return; }
        const lanes = (gig.playlists || []).map((lane) => {
            const id = String(lane.id);
            const ids = laneTrackIds(gig, lane);
            const tracks = ids.map((t) => this._track(t));
            const secs = tracks.reduce((s, t) => s + (Number(t.duration) || 0), 0);
            const derived = Boolean(lane.isBpmRoll);
            const target = id === this.state.targetLaneId;
            const open = this.expanded.has(id);
            const ordered = derived ? [...tracks].sort((a, b) => (Number(a.bpm) || Infinity) - (Number(b.bpm) || Infinity)) : tracks;
            const selected = derived ? null : this._playlistSelection(lane, ids);
            const rows = open ? `<ol class="gp-tracks">${ordered.map((t, index) => `<li class="gp-track${selected?.ids.has(String(t.id)) ? ' row-selected' : ''}" data-track-id="${esc(t.id)}" data-track-idx="${index}"${derived ? '' : ` draggable="true" tabindex="0" aria-selected="${selected?.ids.has(String(t.id)) ? 'true' : 'false'}"`}>
                ${derived ? '' : `<input type="checkbox" class="gp-track-select" data-gp-track-select aria-label="Select ${esc(t.title || 'track')}"${selected?.ids.has(String(t.id)) ? ' checked' : ''}>`}
                <span class="gp-t-title">${esc(t.title || 'Untitled')}</span><span class="gp-t-artist">${esc(t.artist || '')}</span><span class="gp-t-num">${t.bpm ? Math.round(Number(t.bpm)) : ''}</span><span class="gp-t-num">${esc(t.tonality || t.key || '')}</span><span class="gp-t-num">${clock(t.duration)}</span>${derived ? '' : `<button type="button" class="gp-x" data-gp-remove="${esc(t.id)}" aria-label="Remove ${esc(t.title || 'track')}">×</button>`}<button type="button" class="row-menu-btn" data-row-menu aria-label="More">⋯</button></li>`).join('') || '<li class="gp-none">Empty</li>'}</ol>` : '';
            const selectedCount = selected?.ids.size || 0;
            const bulk = open && !derived ? `<div class="selection-bar gp-playlist-selection" data-gp-playlist-selection${selectedCount ? '' : ' hidden'}><span class="selection-count" data-gp-selection-count role="status">${selectedCount} selected</span><div class="selection-bar-actions">${playlistBulkActionsHtml({ allowTransfer: playlistTargets(this.records).some((item) => String(item.gigId) !== String(this.gig.id) || String(item.laneId) !== id) })}<button type="button" class="selection-clear-btn" data-gp-selection-clear>Clear</button></div></div>` : '';
            return `<section class="gp-lane${target ? ' is-target' : ''}${derived ? ' is-derived' : ''}" data-lane="${esc(id)}"${derived ? '' : ' data-gp-drop'}>
                <div class="gp-lane-head"><button type="button" class="gp-caret" data-gp-expand="${esc(id)}" aria-expanded="${open}" aria-label="${open ? 'Hide' : 'Show'} tracks">›</button><button type="button" class="gp-lane-name" ${derived ? 'disabled' : `data-gp-target="${esc(id)}" aria-pressed="${target}"`} title="${derived ? 'Derived from the other playlists' : target ? 'Target' : 'Make this the target'}">${esc(lane.name)}</button>${derived ? '<span class="pl-derived">derived</span>' : ''}<span class="gp-lane-act">${this._laneAct(lane)}</span></div>
                ${bulk}
                ${rows}
            </section>`;
        }).join('');
        pane.innerHTML = `${head}<div class="gp-lanes">${lanes || '<p class="gp-empty">No playlists in this gig yet.</p>'}</div><div class="gp-foot" hidden></div>`;
        this._wireBulkSections();
        this.refreshFoot();
    }

    /** Following the page: the gigs and playlists that hold the entity's tracks. A name opens that gig with that playlist as target. */
    _followHtml() {
        const model = followModel(this.records, [...this.byId.values()], this.page);
        if (!model.length) return '<p class="gp-empty">Not in any gig</p>';
        const go = (g, p) => `data-gp-go="${esc(g.gigId)}" data-gp-go-playlist="${esc(p.laneId)}"`;
        const rows = (p) => `<ol class="gp-tracks">${p.tracks.map((t) => `<li class="gp-track" data-track-id="${esc(t.id)}"><span class="gp-t-title">${esc(t.title || 'Untitled')}</span><span class="gp-t-artist">${esc(t.artist || '')}</span><span class="gp-t-num">${t.bpm ? Math.round(Number(t.bpm)) : ''}</span><span class="gp-t-num">${esc(t.tonality || t.key || '')}</span><span class="gp-t-num">${clock(t.duration)}</span></li>`).join('')}</ol>`;
        return `<div class="gp-lanes gp-follow">${model.map((g) => `<section class="gp-follow-gig">
                <button type="button" class="gp-follow-name" ${go(g, g.playlists[0])}>${esc(g.name)}</button>
                ${g.standalone ? rows(g.playlists[0]) : g.playlists.map((p) => `<section class="gp-lane"><div class="gp-lane-head"><button type="button" class="gp-lane-name" ${go(g, p)}>${esc(p.name)}</button></div>${rows(p)}</section>`).join('')}
            </section>`).join('')}</div>`;
    }

    /** Choosing a gig, from the picker or a name in the follow view: the building panel on it, and `follow` off. */
    _chooseGig(gigId, targetLaneId = null) {
        this.state = { ...this.state, gigId: String(gigId), targetLaneId: targetLaneId ? String(targetLaneId) : null, follow: false };
        this.expanded.clear(); this._expandedFor = null;
        this._save();
        return this.load();
    }

    _wireBulkSections() {
        for (const section of this.pane.querySelectorAll('.gp-lane:not(.is-derived)[data-lane]')) {
            const playlist = findLane(this.gig, section.dataset.lane);
            const rows = [...section.querySelectorAll('.gp-track[data-track-id]')];
            const state = this._playlistSelection(playlist, rows.map((row) => row.dataset.trackId));
            const bar = section.querySelector('[data-gp-playlist-selection]');
            const sync = () => {
                for (const row of rows) {
                    const on = state.ids.has(String(row.dataset.trackId));
                    row.classList.toggle('row-selected', on); row.setAttribute('aria-selected', String(on));
                    const input = row.querySelector('[data-gp-track-select]'); if (input) input.checked = on;
                }
                const count = bar?.querySelector('[data-gp-selection-count]'); if (count) count.textContent = `${state.ids.size} selected`;
                if (state.ids.size) bar?.removeAttribute('hidden'); else bar?.setAttribute('hidden', '');
            };
            const select = (row, { shift = false, toggle = false } = {}) => {
                const index = rows.indexOf(row); if (index < 0) return;
                const id = String(row.dataset.trackId);
                if (shift && state.last != null) {
                    const [lo, hi] = index < state.last ? [index, state.last] : [state.last, index];
                    const add = !state.ids.has(id);
                    for (let i = lo; i <= hi; i += 1) { const at = String(rows[i].dataset.trackId); if (add) state.ids.add(at); else state.ids.delete(at); }
                } else if (toggle) {
                    if (state.ids.has(id)) state.ids.delete(id); else state.ids.add(id);
                    state.last = index;
                } else { state.ids = new Set([id]); state.last = index; }
                sync();
            };
            section.querySelector('[data-gp-selection-clear]')?.addEventListener('click', () => { state.ids.clear(); state.last = null; sync(); });
            section.querySelector('.gp-tracks')?.addEventListener('click', (event) => {
                const row = event.target.closest('.gp-track[data-track-id]'); if (!row) return;
                if (event.target.closest('[data-gp-track-select]')) { event.stopPropagation(); select(row, { shift: event.shiftKey, toggle: true }); return; }
                if (event.target.closest('button,a,input')) return;
                select(row, { shift: event.shiftKey, toggle: event.metaKey || event.ctrlKey });
            });
            section.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && state.ids.size) { event.preventDefault(); event.stopPropagation(); state.ids.clear(); state.last = null; sync(); return; }
                const row = event.target.closest('.gp-track[data-track-id]'); if (!row || event.target !== row) return;
                const index = rows.indexOf(row);
                if (event.key === ' ') { event.preventDefault(); select(row, { shift: event.shiftKey, toggle: true }); }
                else if (event.shiftKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
                    event.preventDefault(); const next = Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
                    select(rows[next], { shift: true }); rows[next]?.focus();
                }
            });
            wirePlaylistBulkActions(bar, {
                ids: () => [...state.ids],
                run: (action, ids) => this._bulkAction(playlist, action, ids),
                transfer: (move, ids) => this._bulkTransfer(playlist, move, ids),
            });
        }
    }

    _bulkSource(playlist) { return { gigId: String(this.gig.id), laneId: String(playlist.id), revision: Number(this.gig.revision || 0) }; }

    async _bulkAction(playlist, action, ids) {
        const key = `${this.gig.id}:${playlist.id}`;
        try {
            const out = await editPlaylistSelection(this.db, this._bulkSource(playlist), action, ids);
            if (out?.changed) undoToast(out.message, out.undo, { onUndone: () => this.load() });
        } catch (error) {
            if (error.code === 'ESTALE') this.playlistSelections.delete(key);
            this.app.showNotification?.(`Edit playlist failed: ${error.message}`, 'error');
        }
        await this.load();
    }

    async _bulkTransfer(playlist, move, ids) {
        const source = this._bulkSource(playlist);
        const target = await choosePlaylistTarget(this.records, source, { move, dialog: workspaceDialog });
        if (!target) return;
        const targetRecord = this.records.find((record) => String(record.id) === String(target.gigId));
        const key = `${this.gig.id}:${playlist.id}`;
        try {
            const out = await transferPlaylistSelection(this.db, source, { ...target, revision: Number(targetRecord?.revision || 0) }, ids, { move });
            if (out?.partial) this.app.showNotification?.(out.message, 'error');
            else if (out) undoToast(out.message, out.undo || null, { onUndone: () => this.load() });
        } catch (error) {
            if (error.code === 'ESTALE') this.playlistSelections.delete(key);
            this.app.showNotification?.(`${move ? 'Move' : 'Copy'} failed: ${error.message}`, 'error');
        }
        await this.load();
    }

    /**
     * The end of a playlist row: its count, then **+ add** for the selection
     * (**N tracks** beside it when several rows are selected), or the focused
     * track's title in accent when one track is selected and already there.
     */
    _laneAct(lane) {
        const ids = laneTrackIds(this.gig, lane);
        const secs = ids.reduce((sum, id) => sum + (Number(this._track(id).duration) || 0), 0);
        const meta = `${ids.length}${secs ? ` · ${minutes(secs)}` : ''}`;
        const { ids: selected, focusedId } = this.selection;
        if (lane.isBpmRoll || !selected.length) return `<span class="gp-lane-meta">${meta}</span>`;
        if (selected.length === 1 && ids.map(String).includes(String(focusedId))) {
            const t = this._track(focusedId);
            return `<button type="button" class="gp-lane-meta in" data-gp-remove-track="${esc(focusedId)}" title="Remove from ${esc(lane.name)}">${esc(t.title || 'Untitled')}</button>`;
        }
        const n = selected.length > 1 ? `<span class="gp-add-n">${selected.length} tracks</span>` : '';
        return `<span class="gp-lane-meta">${meta}</span><button type="button" class="gp-add" data-gp-add="${esc(lane.id)}">+ add</button>${n}`;
    }

    /** Every selection change: the ids selected and the focused one (the last clicked or arrowed-to). */
    setSelection(ids = [], focusedId = null) {
        const list = [...ids].map(String);
        this.selection = { ids: list, focusedId: focusedId != null && list.includes(String(focusedId)) ? String(focusedId) : list[list.length - 1] || null };
        if (!this.pane || !this.gig) return;
        for (const section of this.pane.querySelectorAll('.gp-lane[data-lane]')) {
            const lane = findLane(this.gig, section.dataset.lane);
            const el = section.querySelector('.gp-lane-act');
            if (lane && el) el.innerHTML = this._laneAct(lane);
        }
    }

    /** + add: the whole selection goes to that playlist. */
    addSelection(laneId) { return this.selection.ids.length ? this.add(laneId, this.selection.ids) : null; }

    /** The focused track's title on a playlist row: one click takes it out, with Undo. */
    removeTrack(laneId, trackId) {
        const lane = findLane(this.gig, laneId);
        return this._edit(() => removeFromLane(this.db, this.gig.id, laneId, [trackId]), `Removed from ${lane?.name || 'playlist'}`);
    }

    /** The line under the playlists, shown while a filter is active. The app says which tracks match. */
    refreshFoot() {
        const foot = this.pane?.querySelector('.gp-foot');
        if (!foot) return;
        const tracks = this.app._filterResultTracks?.() || null;
        foot.hidden = !tracks?.length;
        foot.innerHTML = foot.hidden ? '' : `<button type="button" data-gp-filter-results>Add the ${tracks.length.toLocaleString()} filtered tracks…</button><button type="button" data-gp-filter-playlist>… to playlist…</button>`;
    }

    /** Copy the filtered tracks once, to a gig playlist or to a playlist. */
    async addFiltered(kind) {
        const matching = this.app._filterResultTracks?.() || [];
        if (!matching.length) return null;
        const tracks = this.app._sortLikeTable ? this.app._sortLikeTable(matching) : matching;
        try {
            if (kind === 'gig') return await copyFilterResultsToGig(this.app, tracks);
            const ids = tracks.map((t) => t.id);
            return await this.app._addToPlaylist?.(ids, { title: 'Add filter results to playlist', name: 'Filter results', note: `Copies all ${ids.length.toLocaleString()} matches once. Later filter changes won’t change the playlist.` });
        } catch (error) {
            this.app.showNotification?.(`Could not add the filtered tracks: ${error.message}`, 'error');
            return null;
        }
    }

    _wire(pane) {
        pane.addEventListener('change', (e) => {
            if (!e.target.matches('.gp-picker')) return;
            if (e.target.value) { this._chooseGig(e.target.value); return; }
            // The page entry: follow the page. The gig and its target are kept for when a gig is chosen again.
            this.state = { ...this.state, follow: true };
            this._save();
            this.load();
        });
        pane.addEventListener('click', async (e) => {
            const t = e.target.closest('[data-gp-go],[data-gp-new],[data-gp-expand],[data-gp-target],[data-gp-remove],[data-gp-add],[data-gp-remove-track],[data-gp-filter-results],[data-gp-filter-playlist]');
            if (!t) return;
            if (t.dataset.gpGo) return this._chooseGig(t.dataset.gpGo, t.dataset.gpGoPlaylist);
            if (t.hasAttribute('data-gp-new')) return this._newGig();
            if (t.dataset.gpAdd) return this.addSelection(t.dataset.gpAdd);
            if (t.dataset.gpRemoveTrack) return this.removeTrack(t.closest('[data-lane]').dataset.lane, t.dataset.gpRemoveTrack);
            if (t.hasAttribute('data-gp-filter-results')) return this.addFiltered('gig');
            if (t.hasAttribute('data-gp-filter-playlist')) return this.addFiltered('playlist');
            if (t.dataset.gpExpand) { const id = t.dataset.gpExpand; if (this.expanded.has(id)) this.expanded.delete(id); else this.expanded.add(id); return this.render(); }
            if (t.dataset.gpTarget) { this.state = { ...this.state, targetLaneId: t.dataset.gpTarget }; this.expanded.add(t.dataset.gpTarget); this._save(); return this.render(); }
            if (t.dataset.gpRemove) {
                const laneId = t.closest('[data-lane]').dataset.lane;
                const lane = findLane(this.gig, laneId);
                return this._edit(() => removeFromLane(this.db, this.gig.id, laneId, [t.dataset.gpRemove]), `Removed from ${lane?.name || 'playlist'}`);
            }
        });
        // A row's right-click (and ⋯ on a phone): the track actions, and Remove from playlist off a derived one.
        pane.addEventListener('contextmenu', (e) => {
            const row = e.target.closest('.gp-track[data-track-id]');
            if (!row) return;
            e.preventDefault();
            // The follow view is read-only, and a derived (BPM) playlist is rebuilt, not edited.
            const laneId = row.closest('[data-lane]')?.dataset.lane;
            const editable = !this.following && laneId && !row.closest('.gp-lane')?.classList.contains('is-derived');
            const extra = editable ? [{ label: 'Remove from playlist', run: () => this.removeTrack(laneId, row.dataset.trackId) }] : [];
            this.app._openRowContextMenu?.({ trackIds: [row.dataset.trackId], x: e.clientX, y: e.clientY, source: this.gig?.name || 'Gigs', extra });
        });
        pane.addEventListener('dblclick', (e) => {
            const row = e.target.closest('.gp-track');
            if (!row || this.following || e.target.closest('button,input')) return;
            const lane = findLane(this.gig, row.closest('[data-lane]').dataset.lane);
            const tracks = [...row.parentElement.querySelectorAll('.gp-track')].map((li) => this._track(li.dataset.trackId));
            const playable = tracks.filter(isLocalPlayable);
            const track = this._track(row.dataset.trackId);
            this.app.playLocalTrack?.(isLocalPlayable(track) ? track : playable[0], playable, { key: `playlist:u:${this.gig.id}:${lane?.id}`, kind: 'playlist', label: lane?.name || this.gig.name, route: { view: 'playlists', kind: 'u', id: String(this.gig.id), lane: String(lane?.id) } });
        });
        // A track dragged from one of this gig's playlists: kept here because a
        // drag's data can't be read until the drop, and the indicator needs it.
        this._drag = null;
        const clearDrop = () => pane.querySelectorAll('.is-drop').forEach((x) => { x.classList.remove('is-drop'); x.querySelector('[data-drop-hint]')?.removeAttribute('data-drop-hint'); });
        pane.addEventListener('dragstart', (e) => {
            const row = e.target.closest('.gp-track[draggable="true"]');
            if (!row || !e.dataTransfer) return;
            const source = { gigId: String(this.gig.id), laneId: row.closest('[data-lane]').dataset.lane, panel: true };
            this._drag = { ...source, trackId: row.dataset.trackId };
            e.dataTransfer.setData(TRACKS_MIME, JSON.stringify({ ids: [row.dataset.trackId], source }));
            e.dataTransfer.effectAllowed = 'copyMove';
        });
        pane.addEventListener('dragend', () => { this._drag = null; clearDrop(); });
        const laneAt = (e) => e.target.closest?.('[data-gp-drop]');
        pane.addEventListener('dragover', (e) => {
            const lane = laneAt(e);
            if (!lane || !carriesTracks(e)) return;
            const own = this._drag && this.gig && String(this._drag.gigId) === String(this.gig.id)
                ? laneDrop(this.gig, { trackIds: [this._drag.trackId], fromLaneId: this._drag.laneId, toLaneId: lane.dataset.lane, move: e.shiftKey })
                : null;
            if (own?.action === 'reject') return;
            e.preventDefault();
            e.dataTransfer.dropEffect = own?.action === 'move' || own?.action === 'reorder' ? 'move' : 'copy';
            pane.querySelectorAll('.is-drop').forEach((x) => x !== lane && x.classList.remove('is-drop'));
            lane.classList.add('is-drop');
            const head = lane.querySelector('.gp-lane-head');
            if (own?.hint) head?.setAttribute('data-drop-hint', own.hint); else head?.removeAttribute('data-drop-hint');
        });
        pane.addEventListener('dragleave', (e) => { if (!pane.contains(e.relatedTarget)) clearDrop(); });
        pane.addEventListener('drop', (e) => {
            const lane = laneAt(e);
            clearDrop();
            const drop = readTrackDrop(e);
            if (!lane || !drop || !this.gig) return;
            e.preventDefault();
            this.onDrop(lane.dataset.lane, drop, { shift: e.shiftKey, beforeId: e.target.closest?.('.gp-track')?.dataset.trackId || null });
        });
    }

    /**
     * A drop on a playlist: rows from Collection add; a track from this gig
     * follows `laneDrop`, the gig page's rule: another playlist copies (⇧
     * moves), its own playlist reorders, and the BPM playlist refuses.
     */
    onDrop(laneId, { ids, source }, { shift = false, beforeId = null } = {}) {
        const gig = this.gig;
        if (!gig) return null;
        const fromThisGig = Boolean(source?.panel) && String(source.gigId) === String(gig.id);
        const drop = laneDrop(gig, { trackIds: ids, fromLaneId: fromThisGig ? source.laneId : null, toLaneId: laneId, move: shift });
        if (drop.action === 'reject') return null;
        if (drop.action === 'reorder') {
            return beforeId && !ids.includes(beforeId) ? this._edit(() => reorderLane(this.db, gig.id, laneId, ids, beforeId), 'Moved') : null;
        }
        if (fromThisGig) return this._edit(() => dropBetweenLanes(this.db, gig.id, { trackIds: ids, fromLaneId: source.laneId, toLaneId: laneId, move: shift }));
        return this.add(laneId, ids);
    }

    /** `G` and Add to gig while the panel is open. */
    addToTarget(ids) {
        if (!this.state.targetLaneId || !this.gig) { this.app.showNotification?.('Choose a playlist in the gig panel first.', 'info'); return null; }
        return this.add(this.state.targetLaneId, ids);
    }

    add(laneId, ids) {
        const lane = findLane(this.gig, laneId);
        writeGigTarget(this.storage, { gigId: this.gig.id, laneIds: [String(laneId)] });
        return this._edit(async () => {
            const out = await addToLane(this.db, this.gig.id, laneId, ids);
            // While the panel follows the page the gig is not on screen, so the message names it.
            const where = `${this.following && this.gig?.name ? `${this.gig.name} › ` : ''}${lane?.name || 'playlist'}`;
            const head = out.added.length ? `Added ${out.added.length} to ${where}` : `Already in ${where}`;
            return { ...out, message: out.skipped && out.added.length ? `${head} · ${out.skipped} already there` : head };
        });
    }

    async _edit(run, message = '') {
        try {
            const out = await run();
            undoToast(out?.message || message, out?.undo || null);
            return out;
        } catch (error) {
            this.app.showNotification?.(`Not saved: ${error.message}`, 'error');
            await this.load();
            return null;
        }
    }

    async _newGig() {
        const values = await this.app._gigView?._openCreateGigModal?.();
        if (!values) return;
        try {
            const gig = await createGig(this.db, values);
            await seedDefaultGigLanes(this.db, gig.id);
            await this._chooseGig(gig.id);
        } catch (error) { this.app.showNotification?.(`Could not make the gig: ${error.message}`, 'error'); }
    }

    // ── tints and chips on Collection rows ──

    /** Mark the drawn rows of one table body (the table calls this after each draw). */
    decorateRows(tbody) {
        if (!tbody) return;
        const gig = this.isOpen() && !this.following ? this.gig : null;
        for (const row of tbody.querySelectorAll('tr[data-track-id]')) {
            row.querySelector('.gp-chip')?.remove();
            const mark = gig ? rowMark(gig, row.dataset.trackId) : null;
            row.classList.toggle('gp-in', Boolean(mark));
            if (!mark) continue;
            const cell = row.querySelector('td[data-col="title"]') || row.querySelector('td[data-col]:not([data-col^="__"])');
            cell?.insertAdjacentHTML('beforeend', ` <span class="gp-chip" title="In ${esc(gig.name)}">${esc(mark.label)}</span>`);
        }
    }

    _paintMarks() {
        if (typeof document === 'undefined') return;
        document.querySelectorAll('.library-table tbody').forEach((tbody) => this.decorateRows(tbody));
    }
}
