// The one search (#searchInput, "Search"). It does two things, kept apart:
//   Narrow: typed text narrows what the view shows (the filter's `q:`, 200 ms after the last
//     key) on the views whose header profile says `narrow` (header-profiles.js).
//   Go: a list under the field while it has focus. With the field empty it is Recent, the
//     favourites by collection (favorites-list.js) and Views; with text, the matches from
//     command-bar.js's index. ↓ ↑ move, Enter goes, the mouse works. A pick first puts the
//     filter back to what it was before typing, then goes: on a graph it focuses the node,
//     anywhere else it opens the page; a view or command runs. Enter with nothing picked fits a
//     graph's camera to the lit nodes; Esc clears the text (and puts the camera back), then
//     leaves the field.
// The list shares the space under the field with the paste-link row and the Listen sheet;
// one shows at a time. The phone's graph and the viewer hide the header: there the map's
// Search chip (mountChip) moves the same field and list over the map.
import { search, routeForPick, readSources } from './command-bar.js';
import { FavoritesList, favoriteRoute } from './favorites-list.js';
import { headerProfile, narrows } from './header-profiles.js';
import { escapeHtml as esc } from './html.js';
import { glyphSvg } from './kind-glyph.js';
import { closeListenSheet } from './listen.js';
import { shortlistItemFromGap } from './shortlist.js';
import { VIEWER } from './viewer-profile.js';

const KINDS = new Set(['artist', 'label', 'tag', 'album', 'track']);
export const NARROW_MS = 200;

/** A hit's kind shape: an owned item's own, a cached release as an album not owned, else none. */
export function hitGlyph(hit) {
    if (hit?.release) return glyphSvg('album', { owned: false });
    return KINDS.has(hit?.route?.view) ? glyphSvg(hit.route.view) : '';
}

/** The list's rows in order: with text, the hits; empty, Recent, then the favourites, then Views. */
export function goRows(hits, favItems, { query = '' } = {}) {
    if (String(query).trim()) return (hits || []).map((hit) => ({ hit }));
    const recent = (hits || []).filter((h) => h.source === 'Recent'), rest = (hits || []).filter((h) => h.source !== 'Recent');
    return [...recent.map((hit) => ({ hit })), ...(favItems || []).map((item) => ({ item })), ...rest.map((hit) => ({ hit }))];
}

const rowHtml = (h, i) => `<div class="go-row" id="goRow${i}" data-go-idx="${i}" role="option" aria-selected="false">${hitGlyph(h)}<span class="go-name">${esc(h.label)}</span>${h.sub ? `<span class="go-sub">${esc(h.sub)}</span>` : ''}</div>`;

/** Hits under a heading each time their source changes. `from` numbers the first. */
export function hitsHtml(hits, from = 0) {
    let last = null;
    return hits.map((h, k) => {
        const head = h.source !== last ? `<div class="go-source">${esc(h.source)}</div>` : '';
        last = h.source;
        return head + rowHtml(h, from + k);
    }).join('');
}

export default class GoList {
    constructor({ app, input, pasteLink = null }) {
        this.app = app; this.input = input; this.pasteLink = pasteLink;
        this.container = input?.closest('.search-container') || input?.parentNode || null;
        this.isOpen = false; this.hits = []; this.rows = []; this.idx = -1; this._gen = 0; this._cache = null;
        this._before = ''; this._timer = null; this._overlay = false; this.chipHost = null;
        this.favs = new FavoritesList({ app, repaint: () => this._paint(), done: () => this.input?.focus() });
        if (!input || !this.container || typeof document === 'undefined') return;
        input.placeholder = 'Search';
        input.setAttribute('aria-label', 'Search');
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-controls', 'goList');
        input.setAttribute('aria-expanded', 'false');
        input.autocomplete = 'off';
        input.spellcheck = false;
        const list = document.createElement('div');
        list.className = 'go-list';
        list.id = 'goList';
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-label', 'Go');
        list.hidden = true;
        this.container.appendChild(list);
        this.list = list;
        this.favs.root = list;
        input.addEventListener('focus', () => this.open());
        // ♪ opens the Listen sheet in the same place: the list steps aside.
        this.container.querySelector('[data-listen]')?.addEventListener('click', () => this.close());
        input.addEventListener('input', () => this._onInput());
        input.addEventListener('keydown', (e) => this._key(e));
        // A press in the list keeps the focus in the field (a name being typed keeps its own).
        list.addEventListener('mousedown', (e) => { if (!e.target.closest('input')) e.preventDefault(); });
        list.addEventListener('keydown', (e) => this.favs.keydown(e));
        list.addEventListener('click', (e) => {
            if (this.favs.click(e)) return;
            const row = e.target.closest('[data-go-idx]');
            if (row) this._pick(Number(row.dataset.goIdx));
        });
        this.container.addEventListener('focusout', () => setTimeout(() => {
            if (this.isOpen && !this.container.contains(document.activeElement)) this.close();
        }, 0));
        document.addEventListener('pointerdown', (e) => {
            if ((this.isOpen || this._overlay) && !this.container.contains(e.target) && !this.chipHost?.contains(e.target)) this.close();
        }, true);
    }

    /** The route the field is on: the current view (Exploreme included) and its tab. */
    _here() { return { ...(this.app?._route || {}), view: this.app?.currentView || this.app?._route?.view }; }

    /** A view loaded: the field shows (the viewer's only over its map), holding the filter's text where it narrows. */
    syncView(route) {
        if (!this.container) return;
        if (!this._overlay) this.container.style.display = VIEWER ? 'none' : '';
        const listen = this.container.querySelector('[data-listen]');
        // ♪ Listen shows beside the field on the views whose profile has it.
        if (listen) listen.hidden = VIEWER || !headerProfile(route?.view)?.listen;
        clearTimeout(this._timer); this._timer = null;
        this.pasteLink?.close();
        this.input.value = narrows(route) ? this.app?.filterEngine?.state?.search || '' : '';
        if (this.isOpen) this._query();
    }

    hasFocus() { return Boolean(this.container?.contains(globalThis.document?.activeElement)); }

    /** ⌘K and `/`: into the field, or the map's chip where the header is hidden. False when there is neither. */
    focus() {
        if (!this.input) return false;
        const shown = this._overlay || (this.input.offsetParent !== null && this.container.style.display !== 'none');
        if (!shown) return this.openOverlay();
        this.input.focus();
        this.input.select?.();
        this.open();
        return true;
    }

    open() {
        if (this.isOpen || !this.list) return;
        this.isOpen = true; this._cache = null; this.idx = -1;
        this._before = narrows(this._here()) ? this.app?.filterEngine?.state?.search || '' : '';
        closeListenSheet(this.app);
        this.favs.load();
        this._query();
    }

    close() {
        this._gen++;
        this.isOpen = false; this.idx = -1;
        this.favs.reset();
        if (this.list) this.list.hidden = true;
        this.input?.setAttribute('aria-expanded', 'false');
        this.input?.removeAttribute('aria-activedescendant');
        this._endOverlay();
    }

    /** Leave the field: blur it and close the list. */
    _leave() {
        if (this.hasFocus()) globalThis.document.activeElement.blur?.();
        this.close();
    }

    /** Esc in the field: the text first (the camera goes back), then the field. */
    escape() {
        if (this.input.value) {
            this.input.value = '';
            this._onInput();
            this.flush();
            this.app?._atlasView?.restoreCamera?.();
            return;
        }
        this._leave();
    }

    _onInput() {
        clearTimeout(this._timer); this._timer = null;
        // A pasted Bandcamp or Discogs link shows its row instead of searching.
        if (this.pasteLink?.handle(this.input.value)) { if (this.list) this.list.hidden = true; return; }
        if (!this.isOpen && this.hasFocus()) this.open();
        else this._query();
        if (narrows(this._here())) this._timer = setTimeout(() => this._narrow(), NARROW_MS);
    }

    /** The typed text into the filter, and the view narrowed in place. */
    _narrow() {
        this._timer = null;
        const app = this.app;
        if (!app?.filterEngine || !narrows(this._here())) return Promise.resolve();
        app._healthFilter = null;
        app.filterEngine.setSearch(this.input.value);
        app._syncRoute?.({}, { replace: true });
        const done = app._reloadHeaderView?.();
        app.renderCratesSidebar?.();
        return Promise.resolve(done);
    }

    /** Narrow now if a keystroke is still waiting. */
    flush() { return this._timer ? (clearTimeout(this._timer), this._narrow()) : Promise.resolve(); }

    _key(e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!this.isOpen) return this.open();
            this._move(e.key === 'ArrowDown' ? 1 : -1);
        } else if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            this._enter();
        }
    }

    async _enter() {
        if (this.idx >= 0) return this._pick(this.idx);
        const here = this._here();
        if (narrows(here)) {
            await this.flush();
            // A graph fits the camera to what the text lit; a table or grid has nothing more to do.
            if (this.app?._atlasView?._active) this.app._atlasView.fitLit?.();
            return undefined;
        }
        // A view with nothing to narrow: Enter goes to the first match.
        if (this.input.value.trim() && this.rows.length) return this._pick(0);
        return undefined;
    }

    _sources() { return (this._cache ||= readSources(this.app)); }

    async _query() {
        if (!this.isOpen) return;
        const gen = ++this._gen;
        const sources = await this._sources();
        if (!this.isOpen || gen !== this._gen) return;
        this.hits = search(sources.index, this.input.value, sources);
        this.idx = -1;
        this._paint();
    }

    _paint() {
        if (!this.isOpen || !this.list) return;
        if (this.pasteLink?.link) { this.list.hidden = true; return; }
        const query = this.input.value.trim();
        const groups = query ? [] : this.favs.groups();
        const favItems = query ? [] : this.favs.shown(groups);
        this.rows = goRows(this.hits, favItems, { query });
        if (query) {
            this.list.innerHTML = this.hits.length ? hitsHtml(this.hits) : '<p class="go-empty">No matches</p>';
        } else {
            const recent = this.hits.filter((h) => h.source === 'Recent'), views = this.hits.filter((h) => h.source !== 'Recent');
            let at = recent.length;
            const favs = groups.length || this.favs.edit ? `<div class="go-source">Favorites</div><div class="go-favs">${this.favs.html(groups, { activeId: this.app?._route?.focus || null, idx: () => at++ })}</div>` : '';
            this.list.innerHTML = hitsHtml(recent) + favs + hitsHtml(views, recent.length + favItems.length);
        }
        this.list.hidden = false;
        this.input.setAttribute('aria-expanded', 'true');
        this._cursor();
        this.favs.painted();
    }

    _move(d) {
        const n = this.rows.length;
        if (!n) return;
        this.idx = this.idx < 0 ? (d > 0 ? 0 : n - 1) : (this.idx + d + n) % n;
        this._cursor();
    }

    _cursor() {
        for (const el of this.list.querySelectorAll('[data-go-idx]')) {
            const on = Number(el.dataset.goIdx) === this.idx;
            el.classList.toggle('is-cursor', on);
            el.setAttribute('aria-selected', String(on));
            if (on) el.scrollIntoView?.({ block: 'nearest' });
        }
        if (this.idx >= 0) this.input.setAttribute('aria-activedescendant', `goRow${this.idx}`);
        else this.input.removeAttribute('aria-activedescendant');
    }

    /** The graph's focus changed: the favourites list marks it. */
    markActive(id) {
        this.list?.querySelectorAll('[data-fp-id]').forEach((b) => {
            const on = b.dataset.fpId === id;
            b.classList.toggle('is-active', on);
            if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
        });
    }

    /** The filter back to what it was before typing. True when the view must narrow again. */
    _restore() {
        clearTimeout(this._timer); this._timer = null;
        const app = this.app;
        if (!narrows(this._here()) || !app?.filterEngine) { this.input.value = ''; return false; }
        this.input.value = this._before;
        if ((app.filterEngine.state.search || '') === this._before) return false;
        app.filterEngine.setSearch(this._before);
        app._syncRoute?.({}, { replace: true });
        return true;
    }

    async _pick(i) {
        const row = this.rows[i];
        if (!row || this._adding) return;
        const hit = row.item ? { route: favoriteRoute(row.item) } : row.hit;
        if (hit.release) return this._shortlist(hit.release);
        const app = this.app;
        const restored = this._restore();
        this._leave();
        if (hit.run) { if (restored) app._reloadHeaderView?.(); hit.run(); return; }
        const r = app._route;
        app.navigate(routeForPick(hit, { view: app.currentView, tab: r?.tab, graph: r?.graph, fav: r?.fav, filter: app.filterEngine?.state }));
    }

    /** A cached release you don't own: onto the Shortlist, never to a page. A failed write keeps the list open. */
    async _shortlist(release) {
        const app = this.app, db = app?.integrationManager?.database;
        if (!db) { app?.showNotification?.('Database unavailable.', 'error'); return; }
        this._adding = true;
        try {
            const item = shortlistItemFromGap(release, 'cached-search');
            if (!await db.getShortlistItem(item.id)) await db.addToShortlist(item);
            this._restore();
            this._leave();
            app.showNotification?.('Added to Shortlist', 'success');
            if (app._route?.view === 'discover' && app._route.tab === 'shortlist') await app.loadShortlistView?.();
        } catch (_) {
            app.showNotification?.('Could not add to Shortlist. Try again.', 'error');
        } finally { this._adding = false; }
    }

    // ---- the map's Search chip (the phone's graph and the viewer) ----

    mountChip(host) {
        if (!host || typeof document === 'undefined') return;
        this.unmountChip();
        this.chipHost = host;
        host.innerHTML = '<button type="button" class="atlas-chip" data-go-chip aria-haspopup="listbox" aria-expanded="false" aria-controls="goList" title="Search">Search</button>';
        const chip = host.querySelector('[data-go-chip]');
        chip.addEventListener('mousedown', (e) => { if (this._overlay) e.preventDefault(); });
        chip.addEventListener('click', () => { if (this._overlay) this._leave(); else this.openOverlay(); });
    }

    unmountChip() {
        this._endOverlay();
        if (this.chipHost) this.chipHost.innerHTML = '';
        this.chipHost = null;
    }

    /** The field and its list over the map, under the chip. */
    openOverlay() {
        if (!this.chipHost?.isConnected || !this.container) return false;
        if (!this._overlay) {
            this._home = { parent: this.container.parentNode, next: this.container.nextSibling, display: this.container.style.display };
            this.chipHost.appendChild(this.container);
            this.container.style.display = '';
            this.container.classList.add('go-overlay');
            this.chipHost.classList.add('is-open');
            this.chipHost.querySelector('[data-go-chip]')?.setAttribute('aria-expanded', 'true');
            this._overlay = true;
        }
        this.input.focus();
        this.open();
        return true;
    }

    _endOverlay() {
        if (!this._overlay) return;
        this._overlay = false;
        const { parent, next, display } = this._home || {};
        if (parent) parent.insertBefore(this.container, next?.parentNode === parent ? next : null);
        this.container.style.display = display ?? '';
        this.container.classList.remove('go-overlay');
        this.chipHost?.classList.remove('is-open');
        this.chipHost?.querySelector('[data-go-chip]')?.setAttribute('aria-expanded', 'false');
    }
}
