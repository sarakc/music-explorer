// The one layout every artist, label, tag, album and track page shares, top to
// bottom: header (art, type, name, fact chips, Play · Shuffle · Explore · ☆ ♡),
// a charts strip, rows of artwork tiles, the tracks table scoped to the page,
// then whatever sections the page keeps below.

import { buildRoute } from './router.js';
import { coverMosaicHtml } from './cover-art.js';
import { buildEntityIndex, queryIndex } from './entity-index.js';
import { entityTileHtml } from './index-view.js';
import { exploreRouteFor } from './track-actions.js';
import { linksRowHtml, mountLinksRow } from './entity-links-row.js';
import { escapeHtml as esc, TYPE_WORD } from './html.js';
import { mountPageFacts } from './facts-view.js';
import { VIEWER, visitorHides } from './viewer-profile.js';
import { GRAPH_ICON } from './graph-tabs.js';
import { markPairHtml, paintMark } from './favorite-marks.js';

const FACET = { artist: 'artists', label: 'labels', tag: 'tags', album: 'albums' };
const KIND_TYPE = { artists: 'artist', labels: 'label', tags: 'tag', albums: 'album' };
const CHART_TITLE = { years: 'Years', labels: 'Labels', artists: 'Artists', tags: 'Tags' };
export const PAGE_CHARTS = { artist: ['labels', 'tags'], label: ['artists', 'tags'], tag: ['artists', 'labels'], album: [] };
export const PAGE_TILES = { artist: ['albums'], label: ['artists', 'albums'], tag: ['artists', 'labels', 'albums'], album: [] };
const CHART_TOP = 10;
const TILE_TOP = 12;

/** The play context for a page: double-click and Play queue its tracks under this name. */
export function entityPlayContext({ type, name, artist }) {
    const route = type === 'album' ? { view: 'album', name, artist: artist || '' } : { view: type, name };
    return { key: type === 'album' ? `album:${artist || ''}::${name}` : `${type}:${name}`, kind: type, label: name, route };
}

const validYear = (y) => { const n = Number(y); return Number.isInteger(n) && n > 1900 && n <= new Date().getFullYear() + 1 ? n : null; };

/** Header chips: track count, year span, most common tag other than `ownTag` (each omitted when unknown). */
export function factChips(tracks, { ownTag = '' } = {}) {
    const chips = [`${tracks.length.toLocaleString()} track${tracks.length === 1 ? '' : 's'}`];
    const years = tracks.map((t) => validYear(t.year)).filter(Boolean);
    if (years.length) {
        const lo = Math.min(...years), hi = Math.max(...years);
        chips.push(lo === hi ? String(lo) : `${lo}–${hi}`);
    }
    const own = ownTag.trim().toLowerCase();
    const [topTag] = buildEntityIndex(tracks, 'tags').filter((t) => t.key !== own).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    if (topTag) chips.push(topTag.name);
    return chips;
}

/** Year → track count, ascending. */
export function yearCounts(tracks) {
    const m = new Map();
    for (const t of tracks) { const y = validYear(t.year); if (y) m.set(y, (m.get(y) || 0) + 1); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

// ── Gap sections link into Discover ──

/** "Open in Discover" for a gap section heading: Discover's graph around this entity. */
export const openInDiscoverHtml = (entityId) => (entityId
    ? `<a class="op-all" href="${esc(buildRoute({ view: 'discover', focus: entityId }))}" data-open-in-discover>Open in Discover</a>` : '');

/** The Discogs release id a gap row stands for: a master's main release, else its own id. */
export const gapReleaseId = (r) => (r?.type === 'master' ? r.mainRelease ?? null : r?.id ?? null);

/** "Show in Discover" for a gap row; nothing without a Discogs release id. */
export const showInDiscoverHtml = (releaseId) => (releaseId != null && releaseId !== ''
    ? `<a class="link-chip chip-sm" href="${esc(buildRoute({ view: 'discover', focus: `release:discogs:${releaseId}` }))}">Show in Discover</a>` : '');

/** The page's favorite record name: albums are `Artist::Album`, tracks their id. */
export const favoriteName = ({ type, name, artist, id }) => (type === 'album' ? `${artist || ''}::${name}` : type === 'track' ? String(id) : name);

export function objectHeaderHtml({ type, name, artHtml, chips = [], subHtml = '', extraHtml = '', actionsHtml = '' }) {
    return `<header class="op-header">
        <div class="op-art${type === 'album' || type === 'track' ? ' is-single' : ''}">${artHtml}</div>
        <div class="op-head-body">
            <div class="op-type">${TYPE_WORD[type] || ''}</div>
            <h1 class="op-name">${esc(name)}</h1>
            ${subHtml}
            ${chips.length ? `<div class="op-chips">${chips.map((c) => `<span class="op-chip">${esc(c)}</span>`).join('')}</div>` : ''}
            ${extraHtml}
            <div class="op-actions" data-op-actions>
                ${actionsHtml}
                <button type="button" class="lp-action lp-icon" data-op-explore title="Graph (v)" aria-label="Graph">${GRAPH_ICON}</button>
                ${VIEWER ? '' : markPairHtml(new Set(), { cls: 'lp-action op-fav', attrs: 'data-op-fav' })}
            </div>
        </div>
    </header>`;
}

function chartsHtml(type, tracks) {
    const cards = [];
    if (yearCounts(tracks).length >= 2) cards.push('years');
    for (const kind of PAGE_CHARTS[type] || []) if (buildEntityIndex(tracks, kind).length) cards.push(kind);
    if (!cards.length) return '';
    return `<section class="lp-section op-charts"><div class="discover-charts-strip op-charts-grid">${cards.map((id) => `
        <div class="chart-card" data-chart-card="${id}"><div class="chart-title">${CHART_TITLE[id]}</div><div class="chart-box"><canvas id="opChart-${id}"></canvas></div></div>`).join('')}</div></section>`;
}

function tilesHtml(type, name, tracks) {
    return (PAGE_TILES[type] || []).map((kind) => {
        const items = queryIndex(buildEntityIndex(tracks, kind), { sort: 'tracks' });
        if (!items.length) return '';
        const all = buildRoute({ view: kind, within: { type, name } });
        return `<section class="lp-section op-tiles" data-op-tiles="${kind}">
            <div class="lp-section-head"><h2 class="lp-section-title">${CHART_TITLE[kind] || 'Albums'}</h2><span class="lp-section-count">${items.length}</span><a class="op-all" href="${esc(all)}">All</a></div>
            <div class="op-tile-row" role="list">${items.slice(0, TILE_TOP).map(entityTileHtml).join('')}</div>
        </section>`;
    }).join('');
}

/**
 * Draw the shared layout into `contentArea` and wire it. `keptHtml` is the page's
 * own sections, placed below the tracks. Returns the page root element.
 */
export function renderObjectPage(app, contentArea, { type, name, artist = '', id, tracks, artHtml, subHtml = '', extraHtml = '', chips, keptHtml = '', backHtml = '', pageClass = '', playTracks, favName, actionsHtml = '' }) {
    const art = artHtml ?? coverMosaicHtml(tracks, { max: type === 'album' ? 1 : 4 });
    contentArea.innerHTML = `<div class="label-page object-page ${pageClass}">
        ${backHtml}
        ${objectHeaderHtml({ type, name, artHtml: art, chips: chips ?? factChips(tracks, { ownTag: type === 'tag' ? name : '' }), subHtml, extraHtml: `${visitorHides('links') ? '' : linksRowHtml(type)}${extraHtml}`, actionsHtml })}
        ${type === 'track' ? '' : chartsHtml(type, tracks)}
        ${type === 'track' ? '' : tilesHtml(type, name, tracks)}
        ${type === 'track' ? '' : `<section class="lp-section op-tracks"><div class="lp-section-head"><h2 class="lp-section-title">Tracks</h2><span class="lp-section-count">${tracks.length.toLocaleString()}</span></div><div class="op-tracks-host"></div></section>`}
        ${keptHtml}
    </div>`;
    const root = contentArea.querySelector('.object-page');
    const scroller = contentArea.closest?.('.main-scroll');
    if (scroller) scroller.scrollTop = 0;
    const context = type === 'track'
        ? { key: `track:${id}`, kind: 'track', label: name, route: { view: 'track', id: String(id) } }
        : entityPlayContext({ type, name, artist });
    const actions = root.querySelector('[data-op-actions]');
    if (!VIEWER && type !== 'track') app.mountListPlay?.(actions, playTracks || tracks, context, { position: 'afterbegin' });
    root.querySelector('[data-op-explore]')?.addEventListener('click', () => {
        const route = exploreRouteFor({ type, name, artist, id });
        if (route) app.navigate(route);
    });
    if (!VIEWER) wireFavorite(app, root, { type, name, artist, id }, favName);
    if (!visitorHides('links')) mountLinksRow(root.querySelector('[data-op-links]'), { type, name });
    if (type !== 'tag') mountPageFacts(app, root, { type, name, artist, id });
    if (type !== 'track') {
        renderPageCharts(app, root, type, name, tracks);
        const host = root.querySelector('.op-tracks-host');
        if (host && app._renderTable) {
            app._renderTable(tracks, host, { context });
            app._ensureFilesPairData?.().then(() => app._refreshFilesCells?.()).catch(() => {});
        }
    }
    return root;
}

/** The page's ☆ and ♡: painted from the session's marks, one click each. */
function wireFavorite(app, root, entity, storedName) {
    const marks = app.marks;
    const buttons = [...(root?.querySelectorAll('[data-op-fav]') || [])];
    if (!marks || !buttons.length) return;
    const favName = storedName ?? favoriteName(entity);
    const paint = () => buttons.forEach((btn) => {
        const on = marks.has(btn.dataset.mark, entity.type, favName);
        paintMark(btn, marks.collection(btn.dataset.mark), on);
        btn.classList.toggle('is-favorite', on);
    });
    paint();
    for (const btn of buttons) btn.addEventListener('click', async () => {
        try {
            await marks.toggle(btn.dataset.mark, entity.type, favName);
            paint();
            await app.renderCratesSidebar?.();
        } catch (err) { app.showNotification?.(`Favorite not saved: ${err?.message || err}`, 'error'); }
    });
}

function renderPageCharts(app, root, type, name, tracks) {
    const cr = app.chartRenderer;
    if (!cr) return;
    const openPage = (kind) => (entity) => app.navigate({ view: KIND_TYPE[kind], name: entity });
    if (root.querySelector('#opChart-years')) {
        const years = yearCounts(tracks);
        cr.renderTimeline('opChart-years', years.map(([y]) => String(y)), years.map(([, c]) => c), (y) => {
            app.filterEngine.clearAll();
            app.filterEngine.setFilter(FACET[type], [name]);
            app.filterEngine.setFilter('years', [String(y)]);
            app.navigate({ view: 'collection', filter: app.filterEngine.state });
        });
    }
    for (const kind of PAGE_CHARTS[type] || []) {
        if (!root.querySelector(`#opChart-${kind}`)) continue;
        const rows = queryIndex(buildEntityIndex(tracks, kind), { sort: 'tracks' }).slice(0, CHART_TOP);
        cr.renderHorizontalBar(`opChart-${kind}`, rows.map((r) => r.name), rows.map((r) => r.count), {
            maxItems: CHART_TOP,
            onClick: openPage(kind),
            onLabelClick: openPage(kind),
            tooltipFor: (n, c) => `${n} — ${c} track${c === 1 ? '' : 's'}`,
        });
    }
}

