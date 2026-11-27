// Collection › Artists, Albums, Labels and Tags: a grid of artwork tiles with a
// sort. Tiles are plain links to the entity pages, drawn in chunks as the grid
// scrolls so first paint stays fast at library scale. The Collection filter (and
// ★, from the tabs row) narrow the grid through the tracks: an entity shows while
// it has a matching track, counting those. Text typed in the search field is part
// of that filter, so an item shows when its name or one of its tracks matches;
// name matches come first.

import { buildRoute, serializeFilter } from './router.js';
import { coverMosaicHtml } from './cover-art.js';
import { buildEntityIndex, favoriteKeys, itemRoute, missingBandcamp, queryIndex, withinTracks, INDEX_CHUNK } from './entity-index.js';
import { escapeHtml as esc } from './html.js';
import { collectionTracks } from './stash.js';

const SORTS = [['name', 'Name'], ['tracks', 'Tracks'], ['recent', 'Recently added']];
const tracksWord = (n) => `${n.toLocaleString()} track${n === 1 ? '' : 's'}`;

/** One tile: artwork or mosaic, name and track count (albums also show their artist). */
export function entityTileHtml(item) {
    let sub = item.type === 'album' && item.artist ? `${esc(item.artist)} · ${tracksWord(item.count)}` : tracksWord(item.count);
    if (item.suggested) sub += ' · <span class="entity-tile-flag">Suggested</span>';
    return `<a class="entity-tile" href="${esc(buildRoute(itemRoute(item)))}" title="${esc(item.name)}">`
        + `<span class="entity-tile-art${item.type === 'tag' ? ' is-tag' : ''}">${coverMosaicHtml(item.covers, { max: item.type === 'album' ? 1 : 4 })}</span>`
        + `<span class="entity-tile-name">${esc(item.name)}</span><span class="entity-tile-sub">${sub}</span></a>`;
}

function defaultObserve(sentinel, onVisible) {
    if (typeof IntersectionObserver !== 'function') return () => {};
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) onVisible(); }, { rootMargin: '800px' });
    io.observe(sentinel);
    return () => io.disconnect();
}

export default class IndexView {
    constructor({ app, observe = defaultObserve, storage = globalThis.localStorage } = {}) {
        this.app = app; this.observe = observe; this.storage = storage;
        this._generation = 0; this._cache = null; this._disconnect = null;
    }

    _sortFor(view) {
        try { const s = this.storage?.getItem(`umm.indexSort.${view}`); if (SORTS.some(([id]) => id === s)) return s; } catch (_) { /* ephemeral */ }
        return view === 'tags' ? 'tracks' : 'name';
    }

    async render(route) {
        const app = this.app, view = route.view;
        const generation = ++this._generation;
        this.teardown(false);
        const title = document.getElementById('viewTitle');
        const area = document.getElementById('contentArea');
        // The title is the section; the tabs say which tab.
        if (title) title.textContent = 'Collection';
        const [all, favs, linkRows] = await Promise.all([
            app._allTracks(),
            route.fav ? Promise.resolve(app.integrationManager?.database?.listMarks?.(route.fav)).catch(() => []) : null,
            route.links ? Promise.resolve(app.integrationManager?.database?.getAllEntityLinks?.()).catch(() => null) : null,
        ]);
        if (generation !== this._generation) return;
        // Stashed tracks are out of Collection, but under the pinned Stashed filter.
        const stashedOnly = !!app._stashedOnly?.();
        if (this._base?.all !== all || this._base.stashedOnly !== stashedOnly) {
            this._base = { all, stashedOnly, tracks: collectionTracks(all, { includeExploreme: true, includeStashed: stashedOnly }) };
        }
        const tracks = this._base.tracks;
        // The Collection filter: only matching tracks build the index. A
        // `saved:` link resolves its rules first, as on Tracks.
        await app._prepareRulesPass?.();
        if (generation !== this._generation) return;
        const engine = app.filterEngine;
        const filtering = !!engine?.hasActiveFilters?.();
        const s = engine?.state || {};
        const filterKey = filtering ? JSON.stringify([serializeFilter(s), s.ids || null, s.rules || null]) : '';
        const cacheKey = `${view}|${route.within?.type || ''}|${route.within?.name || ''}|${filterKey}`;
        if (this._cache?.tracks !== tracks || this._cache.key !== cacheKey) {
            const matching = filtering ? engine.applyFilters(tracks) : tracks;
            this._cache = { tracks, key: cacheKey, matching, items: buildEntityIndex(withinTracks(matching, route.within), view) };
        }
        const matching = this._cache.matching;
        this.route = route;
        this.view = view;
        // links=missing: without a linked Bandcamp page, most tracks first. Unreadable links are an error, never "none missing".
        this.linksError = Boolean(route.links && !Array.isArray(linkRows));
        this.items = route.links ? (this.linksError ? [] : missingBandcamp(this._cache.items, linkRows)) : this._cache.items;
        this.favKeys = route.fav ? favoriteKeys(favs, view) : null;
        this.query = s.search || '';
        this.filtering = filtering;
        this.sort = route.links ? 'tracks' : this._sortFor(view);
        const scopeChip = (route.within
            ? `<a class="link-chip index-scope" href="${esc(buildRoute({ view, fav: route.fav, links: route.links, filter: engine?.state }))}" title="Show all">${esc(route.within.name)} <span aria-hidden="true">✕</span></a>`
            : '') + (route.links
            ? `<a class="link-chip index-scope" href="${esc(buildRoute({ view, within: route.within, fav: route.fav, filter: engine?.state }))}" title="Show all">No Bandcamp link <span aria-hidden="true">✕</span></a>`
            : '');
        area.innerHTML = `<div class="index-view">
            <div class="index-toolbar">
                <select class="index-sort" aria-label="Sort">${SORTS.map(([id, label]) => `<option value="${id}"${id === this.sort ? ' selected' : ''}>${label}</option>`).join('')}</select>
                ${scopeChip}
            </div>
            <div class="index-grid" role="list"></div>
            <p class="index-empty" hidden></p>
            <div class="index-sentinel" aria-hidden="true"></div>
        </div>`;
        this.root = area.querySelector('.index-view');
        const scroller = area.closest?.('.main-scroll');
        this.grid = this.root.querySelector('.index-grid');
        this._wire();
        this._paint();
        // A return to the same grid (from the graph, Back) keeps its place; a new filter, sort or search starts at the top.
        const place = `${cacheKey}|${JSON.stringify(route.fav || null)}|${this.sort}|${this.query}`;
        const top = this._place?.key === place ? this._place.top : 0;
        this._place = { key: place, top };
        if (scroller) {
            while (top && this.drawn < this.shown.length && scroller.scrollHeight - scroller.clientHeight < top) this._more();
            scroller.scrollTop = top;
            const onScroll = () => { if (this._place && !scroller.hidden && !scroller.style.position && this.root?.isConnected) this._place.top = scroller.scrollTop; };
            scroller.addEventListener('scroll', onScroll, { passive: true });
            this._unscroll = () => scroller.removeEventListener('scroll', onScroll);
        }
        // The header (subtitle, tab controls, band, line) is the same on all six views.
        app._renderCollectionHeader?.(view, { allTracks: tracks, filtered: matching, options: engine?.getNarrowedOptions?.(tracks) || {}, unit: 'tracks' });
    }

    /** Re-run filter and sort, then draw the first chunk. */
    _paint() {
        this.shown = queryIndex(this.items, { first: this.query, sort: this.sort, favKeys: this.favKeys });
        this.drawn = 0;
        this.grid.innerHTML = '';
        const empty = this.root.querySelector('.index-empty');
        const msg = this.linksError ? 'Links could not be read.'
            : this.favKeys && !this.favKeys.size ? 'No favorites yet.'
            : !this.shown.length ? (this.items.length || this.filtering ? 'No matches.' : this.route.links ? 'Every one has a Bandcamp link.' : 'Nothing here yet.') : '';
        empty.textContent = msg;
        empty.hidden = !msg;
        this._more();
        this._disconnect?.();
        this._disconnect = this.observe(this.root.querySelector('.index-sentinel'), () => this._more());
    }

    /** Draw the next chunk of tiles. */
    _more() {
        if (!this.shown || this.drawn >= this.shown.length) return;
        const next = this.shown.slice(this.drawn, this.drawn + INDEX_CHUNK);
        this.drawn += next.length;
        this.grid.insertAdjacentHTML('beforeend', next.map(entityTileHtml).join(''));
    }

    _wire() {
        this.root.querySelector('.index-sort').addEventListener('change', (e) => {
            this.sort = e.target.value;
            try { this.storage?.setItem(`umm.indexSort.${this.view}`, this.sort); } catch (_) { /* ephemeral */ }
            this._place = null; // a new sort starts at the top
            this._paint();
        });
    }

    teardown(bump = true) {
        if (bump) this._generation++;
        this._disconnect?.();
        this._disconnect = null;
        this._unscroll?.();
        this._unscroll = null;
    }
}
