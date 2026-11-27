// The detail panel: one aside on the right for any artist, label, tag, album or
// track, opened from the Map or the Tracks table. In the slot it is the Info tab.
// What it shows comes from registered views (`registerPanelView`, at the bottom):
// `track` and `entity` live in panel-info.js; other kinds register from their own
// modules. The panel keeps a history: the root is the selected track (or the
// map's entity), following a name pushes, and ‹ pops back.
import { setSiteLink } from './site-links.js';
import { listGigs } from './gigs.js';
import { EntityRelations, refKey } from './entity-relations.js';
import { dbGet } from './db-client.js';
import { renderDiscogsSection, relationLocals, discogsStateFor, missingReleases, missingReleasesHtml, openGapSection } from './discogs-section.js';
import { isLocalPlayable } from './player.js';
import { reasonWords, SIGNAL_NAMES } from './graph/reason-words.js';
import { escapeHtml as escape } from './html.js';
import { AtlasData } from './graph/atlas-data.js';

export const ENTITY_TYPES = ['artist', 'label', 'tag', 'album'];
export const LIBRARY_ROWS = 7;
export const QUEUE_VISIBLE_MAX = 20;

// ---- entity data (pure) ----

// Exactly the filter engine's comparison (case-insensitive, not trimmed), so counts and Show in Collection agree.
const lower = (v) => String(v ?? '').toLowerCase();

/** The tracks Show in Collection filters to: the same case-insensitive facet match as the filter engine. */
export function entityTracks(tracks, type, name) {
    const want = lower(name);
    if (!want.trim()) return [];
    const has = {
        artist: (t) => lower(t.artist) === want,
        label: (t) => lower(t.label) === want,
        album: (t) => lower(t.album) === want,
        tag: (t) => Array.isArray(t.tags) && t.tags.some((x) => lower(x) === want),
    }[type];
    return has ? tracks.filter(has) : [];
}

/** Does a track belong with the context entity (a tag it carries, its artist, label or album)? */
export function matchesContext(track, context) {
    if (!context?.name) return false;
    return entityTracks([track], context.type, context.name).length > 0;
}

export function yearRange(tracks, now = new Date().getFullYear()) {
    let lo = Infinity, hi = 0;
    for (const t of tracks) {
        const y = Number(t.year);
        if (y > 1900 && y <= now) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
    }
    if (!hi) return '';
    return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

/** "16 tracks · 11 tagged House · 1994–2024" */
export function entityMeta(tracks, context = null) {
    const parts = [`${tracks.length.toLocaleString()} track${tracks.length === 1 ? '' : 's'}`];
    if (context?.type === 'tag' && tracks.length) {
        const n = tracks.filter((t) => matchesContext(t, context)).length;
        if (n) parts.push(`${n.toLocaleString()} tagged ${context.name}`);
    }
    const years = yearRange(tracks);
    if (years) parts.push(years);
    return parts.join(' · ');
}

/** The top rows for "In your library": ones that belong with the context first, then the rest, order kept. */
export function libraryRows(tracks, context = null, limit = LIBRARY_ROWS) {
    const rows = tracks.map((track, i) => ({ track, linked: matchesContext(track, context), i }));
    rows.sort((a, b) => Number(b.linked) - Number(a.linked) || a.i - b.i);
    return { rows: rows.slice(0, limit).map(({ track, linked }) => ({ track, linked })), more: Math.max(0, tracks.length - limit) };
}

const q = encodeURIComponent;
/** Plain external links built from the name; nothing is fetched. */
export function externalLinks(entity, { discogsRef = null } = {}) {
    const { type, name } = entity;
    if (!name || type === 'tag') return [];
    const text = type === 'track' && entity.artist ? `${entity.artist} ${name}` : name;
    const discogs = discogsRef
        ? { label: 'Discogs', href: `https://www.discogs.com/${discogsRef.type}/${q(discogsRef.id)}` }
        : { label: 'Discogs', href: `https://www.discogs.com/search/?q=${q(text)}&type=${type === 'artist' ? 'artist' : type === 'label' ? 'label' : 'release'}` };
    return [discogs,
        { label: 'Bandcamp', href: `https://bandcamp.com/search?q=${q(text)}` },
        { label: 'Beatport', href: `https://www.beatport.com/search?q=${q(text)}` },
        { label: 'YouTube', href: `https://www.youtube.com/results?search_query=${q(text)}` }];
}

export const reasonText = (r) => `<span class="dp-src">${escape(SIGNAL_NAMES[r.signal] || r.signal)}</span> ${escape(reasonWords(r))}`;

/** Info's line under the card while several rows are selected. */
export const selectedLine = (n) => (n > 1 ? `1 of ${n.toLocaleString()} selected` : '');

const EMPTY_HTML = '<p class="dp-empty">Select a track</p>';

const defaultJson = async (url) => { const res = await fetch(url); if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); };

export default class DetailPanel {
    constructor({ app, loadGigs = listGigs, fetchJson = defaultJson, readStore = dbGet }) {
        this.app = app; this.loadGigs = loadGigs; this.fetchJson = fetchJson; this.readStore = readStore;
        this.generation = 0; this.kind = null; this.current = null; this.unsubscribe = null;
        // Session-only: `[{ kind: 'track', track } | { kind: 'entity', entity }]`, root first.
        this.history = []; this.rootOpts = {};
        // Unsaved editor state by track id. It outlives history resets (the Map or Discover
        // replacing the root), so the track's edits come back when it is shown again.
        this.edits = new Map();
        this.followers = new Map();
        this.shownIn = null; // the section Info last showed in
        this.nearOff = new Set(); // the Near kinds switched off, for the session
        this.nearMapOpen = false; // Near's map, folded until opened, for the session
        this.keepEmpty = false; // the user opened an empty Info: it stays open, reading Select a track
        this.slot?.onChange?.((_view, change) => this._slotChanged(change));
    }

    /** How a section fills Info when it comes into view: Collection from the selection, the map from its focus. */
    follow(section, fn) { this.followers.set(section, fn); }

    _slotChanged({ user = false } = {}) {
        const slot = this.slot;
        if (slot.view.hidden) {
            // Outside the slot's sections: stop late work; the section fills Info again on return.
            if (this.kind) { ++this.generation; this._release(); this.kind = null; this.current = null; }
            this._shown = false;
            return;
        }
        const shown = slot.shows('details');
        const appeared = shown && !this._shown;
        this._shown = shown;
        if (!shown) { this.keepEmpty = false; return; }
        // Compared with where Info last showed, so a section change made while collapsed counts when it next appears.
        const sectionChanged = this.shownIn !== null && slot.section !== this.shownIn;
        this.shownIn = slot.section;
        // A view being opened sets `kind` before the slot expands; it fills Info itself.
        if ((!appeared && !sectionChanged) || (this.kind && !this.current)) return;
        // Opened by the user: if the section has nothing for it, it stays open and empty.
        const opened = appeared && user;
        if (opened) this.keepEmpty = true;
        this.followers.get(slot.section)?.({ sectionChanged });
        if (!this.kind) this.clear();
        else if (opened) this.keepEmpty = false;
    }
    /** Open = the Info tab is what the expanded slot shows. */
    get isOpen() { return this.slot ? this.slot.shows('details') : !!this.host && !this.host.hidden; }
    get slot() { return this.app?.rightSlot || null; }

    // The container: the Info pane of the right-hand slot (right-slot.js),
    // or a plain aside where there is no slot (tests).
    _ensureHost() {
        if (this.host) return;
        if (this.slot) {
            this.host = this.slot.paneFor('details', { className: 'detail-panel' });
        } else {
            this.host = document.createElement('aside');
            this.host.className = 'detail-panel';
            document.querySelector('.app-container').appendChild(this.host);
        }
        this.host.setAttribute('aria-label', 'Details');
        this.host.addEventListener('keydown', event => {
            // Esc collapses the slot to its strip; without a slot it closes.
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (this.slot) this.slot.escape(); else this.close(); }
        });
    }

    _show() {
        if (this.slot) { this.slot.open('details', { trigger: this.trigger }); return; }
        this.host.hidden = false;
        document.querySelector('.app-container').classList.add('has-panel');
    }

    // ---- views ----

    /**
     * Open the panel on a registered view. The view renders into the host; `ctx.live()`
     * turns false as soon as the panel shows something else or closes, so late async work
     * can drop itself. `opts.trigger` is the element focus returns to on close.
     */
    async show(kind, payload, opts = {}) {
        const view = VIEWS.get(kind);
        if (!view) throw new Error(`No panel view: ${kind}`);
        const generation = ++this.generation;
        this._release();
        this._ensureHost();
        this.kind = kind; this.current = null; this.keepEmpty = false;
        if (opts.trigger) this.trigger = opts.trigger;
        this._show();
        const rendered = view.render(this.host, payload, { panel: this, app: this.app, generation, opts, live: () => generation === this.generation });
        this._watchPlayer();
        this._markPlaying();
        // Rows paint after the view's awaited loads, so mark again once it has drawn.
        return Promise.resolve(rendered).finally(() => this._markPlaying());
    }

    /** The player is made after the panel, so the one subscription is taken on the first view. */
    _watchPlayer() {
        const player = this.app?.audioPlayer;
        if (this._unwatchPlayer || !player?.subscribe) return;
        this._unwatchPlayer = player.subscribe(() => this._markPlaying());
    }

    /** The row of the playing track keeps its line and its coloured ▶. */
    _markPlaying() {
        const player = this.app?.audioPlayer;
        if (!this.host || !player?.isCurrent) return;
        this.host.querySelectorAll('.ik-row[data-track-id]').forEach((row) => row.classList.toggle('is-playing', !!player.isCurrent(row.dataset.trackId)));
    }

    /**
     * Nothing selected: the Info pane reads Select a track, and an open Info collapses
     * to the strip until there is content again (an empty Info the user opened stays).
     */
    clear() {
        ++this.generation;
        this._release();
        this._ensureHost();
        this.kind = null; this.current = null; this.history = [];
        this.host.innerHTML = EMPTY_HTML;
        if (!this.keepEmpty) this.slot?.autoCollapse();
    }

    // ---- history ----

    /** A track becomes the root: selecting another row resets the history. */
    async open(track, trigger, { focus = true, context = null, onFocusEntity = null, onFocusHere = null } = {}) {
        if (!track) return;
        this.history = [{ kind: 'track', track }];
        this.rootOpts = { context, onFocusEntity, onFocusHere };
        return this.show('track', { track }, { trigger, focus, context, onFocusEntity, onFocusHere });
    }

    /** Follow a name: the entity (or `{ kind: 'track', track }`) goes on top; ‹ comes back. */
    async push(item) {
        const entry = item?.kind ? item : { kind: 'entity', entity: item };
        if (entry.kind === 'entity' && (!entry.entity?.name || !ENTITY_TYPES.includes(entry.entity.type))) return;
        if (entry.kind === 'track' && !entry.track) return;
        this.history.push(entry);
        return this._showTop();
    }

    async pop() {
        if (this.history.length < 2) return;
        this.history.pop();
        return this._showTop();
    }

    /** The root keeps the map's context (Why near), its re-focus and a peek's Focus here; pushed entries keep the re-focus only. */
    _showTop() {
        const top = this.history[this.history.length - 1];
        const { context = null, onFocusEntity = null, onFocusHere = null } = this.rootOpts;
        const root = this.history.length === 1;
        const opts = { focus: false, onFocusEntity, context: root ? context : null, onFocusHere: root ? onFocusHere : null };
        return top.kind === 'track' ? this.show('track', { track: top.track }, opts) : this.show('entity', { entity: top.entity }, opts);
    }

    /** Unsaved editor state for a track, or null. */
    editsFor(trackId) { return trackId == null ? null : this.edits.get(String(trackId)) || null; }
    setEdits(trackId, edited) { if (edited) this.edits.set(String(trackId), edited); else this.edits.delete(String(trackId)); }
    hasEdits(trackId) { return this.editsFor(trackId) !== null; }

    /** Before the focused row moves from `fromId` to `toId`: true to go ahead. Unsaved edits on `fromId` ask "Discard changes?" first. */
    async canLeave(fromId, toId = null) {
        if (!this.hasEdits(fromId) || (toId != null && String(fromId) === String(toId))) return true;
        const ask = this.app?._openGigConfirmModal;
        const ok = ask ? await ask.call(this.app, { title: 'Discard changes?', confirmLabel: 'Discard' }) : true;
        if (ok) this.setEdits(fromId, null);
        return Boolean(ok);
    }

    /** The selection grew or shrank under the same focused row: refresh **1 of N selected**. */
    syncSelection() {
        const el = this.host?.querySelector('[data-info-selected]');
        if (el) el.textContent = selectedLine(this.app?._selectedTrackIds?.size || 0);
    }

    // ---- entities ----

    async _why(context, entity) {
        if (!context?.id || !entity?.id || context.id === entity.id) return null;
        try {
            const out = await this.fetchJson(`/api/similarity/why?a=${q(context.id)}&b=${q(entity.id)}`);
            return (out?.reasons || []).filter((r) => reasonWords(r)).slice(0, 3);
        } catch (_) { return null; }
    }

    /** Discover's layer landed for `id`: Near paints again with its outside music, when Info is showing `id`. */
    refreshNear(id) {
        const near = this._near;
        if (near && id && near.id === id && near.mount?.isConnected) near.render();
    }

    /**
     * The decoded atlas for Near, or null. Reads the session cache; only when it is empty, fetches once,
     * and opens made while that fetch runs share it. Never polls and never waits on a build: the list
     * stands alone then.
     */
    atlasForNear() {
        const data = new AtlasData({ fetchJson: this.fetchJson, wait: () => Promise.resolve() }) /* no poll timer: a build ends the load at once */;
        if (data.atlas) return Promise.resolve(data.atlas);
        if (this._nearAtlas) return this._nearAtlas;
        let building = false, stop;
        const early = new Promise((resolve) => { stop = resolve; });
        const load = data.load({ onBuilding: () => { building = true; stop(null); }, isAlive: () => !building })
            .then((result) => result?.atlas || null, () => null);
        const pending = Promise.race([load, early]).finally(() => { if (this._nearAtlas === pending) this._nearAtlas = null; });
        this._nearAtlas = pending;
        return pending;
    }

    /** The engine's neighbours: one call, `limit` of them, optionally only `types`. */
    async _closest(entity, { limit = 6, types = null } = {}) {
        try {
            const out = await this.fetchJson(`/api/similarity/neighbours/${q(entity.id)}?limit=${limit}${types ? `&types=${q(types.join(','))}` : ''}`);
            return (out?.neighbours || []).slice(0, limit);
        } catch (_) { return []; }
    }

    /**
     * Open an artist, label, tag or album as the root (the table, the Map or Discover).
     * `context` is the entity it sits near on the map (drives Why near);
     * `onFocusEntity` re-focuses the map from a Near name; `onFocusHere`, on a peek, makes it the selection.
     */
    async openEntity(entity, { context = null, focus = true, onFocusEntity = null, onFocusHere = null } = {}) {
        if (!entity?.name || !ENTITY_TYPES.includes(entity.type)) return;
        this.history = [{ kind: 'entity', entity }];
        this.rootOpts = { context, onFocusEntity, onFocusHere };
        return this.show('entity', { entity }, { context, focus, onFocusEntity, onFocusHere });
    }

    _openPage(target, tracks) {
        const route = { view: target.type, name: target.name };
        if (target.type === 'album') route.artist = tracks[0]?.artist || '';
        this.app.navigate(route);
    }

    _showInCollection(target) {
        const app = this.app, facet = { artist: 'artists', label: 'labels', tag: 'tags', album: 'albums' }[target.type];
        app.filterEngine.setFilter(facet, [target.name]);
        app._healthFilter = null;
        app.navigate({ view: 'collection', filter: app.filterEngine.state });
    }

    /** Queue the entity's tracks in library order (the Tracks table's sort), starting at `track` (or the first), or shuffled. */
    _play(target, tracks, track, { shuffle = false } = {}) {
        const app = this.app;
        const ordered = app._sortLikeTable ? app._sortLikeTable(tracks) : tracks;
        const playable = ordered.filter(isLocalPlayable);
        const route = { view: target.type, name: target.name };
        const context = { key: `panel:${target.id}`, kind: 'collection', label: target.name, route };
        if (shuffle) return app.playLocalTrack(null, playable, context, { shuffle: true });
        return app.playLocalTrack(track && isLocalPlayable(track) ? track : playable[0], playable, context);
    }

    // ---- Discogs ----

    _release() {
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.onFocusEntity = null;
    }

    _service() {
        if (this.service !== undefined) return this.service;
        try { this.service = new EntityRelations({ database: this.app.integrationManager?.database, connector: this.app.integrationManager?.discogsConnector, queue: this.app.discogsQueue }); } catch (_) { this.service = null; }
        return this.service;
    }

    _startDiscogs(target, closest, generation) {
        if (target.type !== 'artist' && target.type !== 'label') return;
        const queue = this.app.discogsQueue;
        if (queue?.onJobDone) {
            this.unsubscribe = queue.onJobDone((job) => {
                if (generation === this.generation && (job?.entityIds || []).includes(target.id)) this._loadDiscogs(target, generation);
            });
        }
        queue?.focus?.({
            focus: [target.id],
            visible: (closest || []).filter((c) => c.type === 'artist' || c.type === 'label').map((c) => c.id).slice(0, QUEUE_VISIBLE_MAX),
            near: (this.app._atlasView?.neighbourIds || []).slice(0, 20),
        });
        this._loadDiscogs(target, generation);
    }

    /** Cached identity and relations only: this never asks Discogs for anything by itself. */
    async _loadDiscogs(target, generation, { override = null } = {}) {
        const slot = () => (generation === this.generation && this.host?.isConnected ? this.host.querySelector('[data-discogs]') : null);
        if (!slot()) return;
        const app = this.app, db = app.integrationManager?.database, service = this._service();
        const connected = Boolean(app.hasBackend && app.backendServices?.discogs);
        let state, identity = null, row = null, relations = [];
        try {
            if (override) ({ state, identity, row } = override);
            else if (!service) state = connected ? 'unavailable' : 'disconnected';
            else {
                identity = await service.identity(target);
                const ref = identity?.resolution === 'confirmed' ? identity.refs?.[0] : null;
                row = ref ? await db.getEntityRelations(refKey(ref)) : null;
                state = discogsStateFor({ connected, identity, row, queued: Boolean(app.discogsQueue) });
            }
            if (row && identity?.refs?.[0]) relations = await service.relations().catch(() => []);
        } catch (_) { state = 'unavailable'; }
        const el = slot();
        if (!el) return;
        if (!state) { el.innerHTML = ''; return; }
        el.innerHTML = renderDiscogsSection(state, row, { entityType: target.type, name: target.name, identity, locals: relationLocals(relations) });
        const ref = identity?.refs?.[0];
        if (ref && (state === 'ready' || state === 'stale' || state === 'empty')) {
            setSiteLink(this.host, 'discogs', externalLinks({ ...target }, { discogsRef: { type: ref.type, id: ref.id } })[0].href);
        }
        this._wireDiscogs(el, target, generation);
        // What the queue just stored may change what is missing.
        if (state !== 'unavailable') this._loadMissing(target, generation);
    }

    /**
     * "Not in your library" under the entity's rows, from the cached releases of a
     * confirmed identity. Local reads only: nothing is queued or asked of Discogs.
     * Nothing confirmed or cached, or everything owned: no section. A read that
     * fails shows the Discogs error state instead, never an absent section.
     */
    async _loadMissing(target, generation) {
        if (target.type !== 'artist' && target.type !== 'label') return;
        const mount = (name) => (generation === this.generation && this.host?.isConnected ? this.host.querySelector(`[data-${name}]`) : null);
        const service = this._service();
        if (!mount('info-missing') || !service) return;
        let store = null;
        try {
            const identity = await service.identity(target);
            const ref = identity?.resolution === 'confirmed' ? identity.refs?.[0] : null;
            if (ref) store = await this.readStore('discogs_releases', `discogs:${ref.type}:${ref.id}`);
        } catch (_) {
            const el = mount('discogs'), missing = mount('info-missing');
            if (missing) missing.innerHTML = '';
            if (!el) return;
            el.hidden = false;
            el.innerHTML = renderDiscogsSection('unavailable', null, { entityType: target.type, name: target.name });
            this._wireDiscogs(el, target, generation);
            return;
        }
        const el = mount('info-missing');
        if (!el) return;
        const owned = [...new Set((this.tracks || []).flatMap((t) => [t.album, t.title]))];
        const { rows, more } = missingReleases(store, owned, { type: target.type, name: target.name, limit: LIBRARY_ROWS });
        el.innerHTML = missingReleasesHtml({ rows, more }, { entityType: target.type });
        el.querySelector('[data-releases-all]')?.addEventListener('click', () => openGapSection(this.app, target));
        el.querySelectorAll('[data-missing-release]').forEach((li) => {
            const open = () => { const release = rows[Number(li.dataset.missingRelease)]; if (release && VIEWS.has('release')) this.show('release', { release }, { focus: false }); };
            li.addEventListener('click', open);
            li.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
        });
    }

    _wireDiscogs(el, target, generation) {
        el.querySelectorAll('[data-discogs-pick],[data-discogs-retry],[data-rel-local],[data-rel-url]').forEach((btn) => btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const d = btn.dataset, service = this._service();
            const failed = () => ({ state: 'unavailable', identity: null, row: null });
            if (d.discogsPick != null && service) {
                const out = await service.confirm(target, { id: d.discogsPick, name: d.discogsName }).catch(failed);
                this._loadDiscogs(target, generation, { override: out });
            } else if (Object.hasOwn(d, 'discogsRetry') && service) {
                const out = await service.load(target, { refresh: true }).catch(failed);
                this._loadDiscogs(target, generation, { override: out });
            } else if (d.relLocal) {
                // On a map, a local chip re-focuses it (as Closest does); elsewhere it opens the panel.
                const e = { id: d.relLocal, type: d.relLocal.split(':')[0], name: btn.textContent.replace(/ · parent$/, '').trim() };
                if (this.onFocusEntity) this.onFocusEntity(e); else this.push(e);
            } else if (d.relUrl) {
                try { window.open(d.relUrl, '_blank', 'noopener'); } catch (_) { /* popup blocked */ }
            }
        }));
    }

    /** Stop the panel's work and put it away: in the slot, the slot collapses to its strip. */
    close({ restoreFocus = true } = {}) {
        ++this.generation;
        this._release();
        if (!this.host) return;
        this.kind = null; this.current = null;
        if (this.slot) {
            this.host.innerHTML = EMPTY_HTML;
            this.slot.autoCollapse({ restoreFocus });
            return;
        }
        this.host.hidden = true;
        document.querySelector('.app-container').classList.remove('has-panel');
        if (restoreFocus && this.trigger?.isConnected) this.trigger.focus();
    }
}

// ---- the content registry ----
// Each kind of panel content registers once: `render(host, payload, ctx)` fills the host.
// The panel owns opening, closing and staleness; content modules (`panel-*.js`) own markup.

const VIEWS = new Map();

export function registerPanelView(kind, view) {
    if (!kind || typeof kind !== 'string' || typeof view?.render !== 'function') throw new TypeError('registerPanelView(kind, { render })');
    if (VIEWS.has(kind)) throw new Error(`Panel view already registered: ${kind}`);
    VIEWS.set(kind, view);
}

export const panelView = (kind) => VIEWS.get(kind) || null;
