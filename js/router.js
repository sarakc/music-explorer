// Hash routes. Pure: no DOM, no history access. The app owns location.hash;
// this module only translates between hashes, route objects, and filter state.
//
// Separators (; | :) stay raw in the hash; values are encodeURIComponent-encoded
// so they can never contain one. The WHATWG fragment percent-encode set leaves
// these characters alone, so location.hash returns what we set.

// `import` stays routable until Settings gets its Inbox card (nav spec step 4).
const OUTSIDE_REF = /^discogs:(artist|label):\d+$/;
export const VIEWS = ['collection', 'charts', 'artists', 'albums', 'labels', 'tags', 'playlists', 'discover', 'gigs', 'rekordbox', 'tagging', 'fields', 'formatting', 'identities', 'sound-check', 'duplicates', 'storage', 'paths', 'similarity', 'settings'];
export const VIEW_LABELS = {
    collection: 'Collection', charts: 'Charts', artists: 'Artists', albums: 'Albums', labels: 'Labels', tags: 'Tags',
    playlists: 'Playlists', discover: 'Discover',
    gigs: 'Gigs', rekordbox: 'Rekordbox', tagging: 'Tagging', fields: 'Missing fields', formatting: 'Formatting', identities: 'Discogs', 'sound-check': 'Sound Check',
    duplicates: 'Duplicates', storage: 'Storage', paths: 'File paths', similarity: 'Similarity', settings: 'Settings',
};
/** Views whose `?tab=` strip is drawn in their section header (one view, several tabs).
 *  The first tab is the default and carries no `tab` in the URL. */
export const VIEW_TABS = { discover: ['graph', 'new', 'shortlist'] };
/** Index views and the entity types each can be scoped to (`#/albums?artist=…`). */
export const INDEX_WITHIN = { artists: ['label', 'tag'], albums: ['artist', 'label', 'tag'], labels: ['tag'], tags: [] };
const SETTINGS_SECTIONS = ['appearance', 'rekordbox', 'playback', 'inbox', 'backup'];
const ENTITY_VIEWS = new Set(['artist', 'label', 'tag', 'album', 'track']);
const FACETS = ['artists', 'labels', 'albums', 'genres', 'subgenres', 'tags', 'years', 'sources', 'keys'];
const CHARTS = new Set(['genres', 'tags', 'labels', 'artists', 'years', 'acquisition']);
const TABS = { ...VIEW_TABS };
/** Each Tools list's query: its filter value, Declined, and one track. */
export const TOOL_PARAMS = { tagging: ['tag'], fields: ['field'], formatting: ['rule'], identities: ['type'], 'sound-check': ['class'] };
// Discover's old tabs: `#/discover?tab=gaps` and `tab=seeds` open Discover, focused on their `seed`.
const LEGACY_DISCOVER_TABS = new Set(['gaps', 'seeds']);
// Old chart tabs: `#/discover?tab=labels` and the like open Charts with that chart.
const LEGACY_CHART_TABS = new Set(['labels', 'artists', 'tags', 'years', 'acquisition']);
// Which routes carry the filter (`f`) and ☆ (`fav`) is declared in header-profiles.js (`routeCarries`).
// `fav` names favourites collections: `fav=1` is ☆ alone (`fav: true`), `fav=star,heart` any other
// choice (`fav: ['star', 'heart']`), in favorite-marks.js's order.
// `?links=missing`: owned artists or labels without a linked Bandcamp page.
const LINK_VIEWS = new Set(['artists', 'labels']);
// Params that made an old `#/discover` hash the chart-and-graph view, now Explore.
const EXPLORE_PARAMS = ['sel', 'mode', 'seed', 'hops', 'beyond'];
// What a current graph link may carry; anything else on `#/explore` marks an old link.
const GRAPH_PARAMS = new Set(['focus', 'f', 'fav']);
// A chart selection that names one entity becomes that entity's focus.
const SEL_ENTITY = { labels: 'label', artists: 'artist', tags: 'tag' };

import { encodeRules, decodeRules, isEmptyRules } from './filter-rules.js';
import { entityId } from './credits-graph.js';
import { routeCarries } from './header-profiles.js';
import { hasGraph } from './graph-tabs.js';
import { favParam, parseFavParam } from './favorite-marks.js';

const enc = (v) => encodeURIComponent(String(v));
const dec = (v) => { try { return decodeURIComponent(v); } catch (_) { return ''; } };

export function emptyFilter() {
    return {
        artists: [], labels: [], albums: [], genres: [], subgenres: [], tags: [], years: [], sources: [], keys: [],
        bpmRange: null, yearRange: null, camelotCompatible: false, dateAddedRange: null, search: '', matchMode: 'all', ids: null,
        rules: null, invalidFilter: false, savedRules: null, crateId: null, scope: null,
    };
}

/** The scope's form in the filter (`around:<id>@<depth>`, graph/scope.js): the node id encoded, its ring depth. */
export const scopeToken = (scope) => (scope?.id ? `${enc(scope.id)}@${Number(scope.depth) || 0}` : '');

/** An `around:` value as { id, depth, name: '', ids: null } (its tracks unresolved), or null when it cannot be read. */
export function parseScopeToken(value) {
    const v = String(value || ''), at = v.lastIndexOf('@');
    if (at < 1) return null;
    const id = dec(v.slice(0, at)), depth = Number(v.slice(at + 1));
    if (!id || !Number.isInteger(depth) || depth < 0 || depth > 9) return null;
    return { id, depth, name: '', ids: null };
}

export function serializeFilter(state) {
    if (!state) return '';
    const parts = [];
    // Rules mode: one versioned segment replaces every flat segment. Too big
    // for a link → the crate id when the filter is a saved crate, else nothing.
    if (state.rules && !isEmptyRules(state.rules)) {
        const seg = encodeRules(state.rules);
        if (seg) parts.push(`rules:${seg}`);
        else if (state.crateId) parts.push(`saved:${enc(state.crateId)}`);
        if (state.search) parts.push(`q:${enc(state.search)}`);
        if (state.scope?.id) parts.push(`around:${scopeToken(state.scope)}`);
        return parts.join(';');
    }
    for (const k of FACETS) {
        const v = state[k];
        if (Array.isArray(v) && v.length) parts.push(`${k}:${v.map(enc).join('|')}`);
    }
    const r = state.bpmRange;
    if (r && (r.min != null || r.max != null)) parts.push(`bpm:${r.min ?? ''}-${r.max ?? ''}`);
    const y = state.yearRange;
    if (y && Number.isInteger(y.min) && Number.isInteger(y.max)) parts.push(`year:${y.min}-${y.max}`);
    if (state.camelotCompatible) parts.push('camelot:1');
    const d = state.dateAddedRange;
    if (d && (d.from || d.to)) parts.push(`added:${d.from || ''}..${d.to || ''}`);
    if (state.matchMode === 'any') parts.push('match:any');
    if (state.search) parts.push(`q:${enc(state.search)}`);
    if (state.scope?.id) parts.push(`around:${scopeToken(state.scope)}`);
    return parts.join(';');
}

export function parseFilter(str) {
    const out = emptyFilter();
    if (!str) return out;
    for (const part of String(str).split(';')) {
        const i = part.indexOf(':');
        if (i < 0) continue;
        const k = part.slice(0, i), v = part.slice(i + 1);
        if (FACETS.includes(k)) out[k] = v.split('|').filter(Boolean).map(dec).filter(Boolean);
        else if (k === 'bpm') {
            if (!/^(?:\d+(?:\.\d+)?)?-(?:\d+(?:\.\d+)?)?$/.test(v)) continue;
            const [lo, hi] = v.split('-');
            const min = lo === '' ? null : Number(lo), max = hi === '' ? null : Number(hi);
            const ok = (x) => x === null || Number.isFinite(x);
            if (ok(min) && ok(max) && (min !== null || max !== null)) out.bpmRange = { min, max };
        } else if (k === 'year') {
            const m = /^(\d{4})-(\d{4})$/.exec(v);
            if (m && Number(m[1]) <= Number(m[2])) out.yearRange = { min: Number(m[1]), max: Number(m[2]) };
        } else if (k === 'camelot') out.camelotCompatible = v === '1';
        else if (k === 'added') {
            const [from = '', to = ''] = v.split('..');
            const valid = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
            const okEnd = (d) => d === '' || valid(d);
            if (okEnd(from) && okEnd(to) && (from || to) && (!from || !to || from <= to)) out.dateAddedRange = { from, to };
        }
        else if (k === 'match') out.matchMode = v === 'any' ? 'any' : 'all';
        else if (k === 'q') out.search = dec(v);
        else if (k === 'around') out.scope = parseScopeToken(v);
        else if (k === 'rules') {
            // A segment that cannot be read is an explicit invalid state, never
            // an empty whole-library filter.
            const rules = decodeRules(v);
            if (rules) out.rules = rules; else out.invalidFilter = true;
        }
        else if (k === 'saved') { const id = dec(v); if (id) out.savedRules = id; else out.invalidFilter = true; }
    }
    return out;
}

export function serializeSel(list) {
    const groups = [];
    for (const s of Array.isArray(list) ? list : []) {
        if (!s || !CHARTS.has(s.chart) || !s.value) continue;
        const last = groups.at(-1);
        if (last?.chart === s.chart) last.values.push(enc(s.value));
        else groups.push({ chart: s.chart, values: [enc(s.value)] });
    }
    return groups.map(({ chart, values }) => `${chart}:${values.join('|')}`).join(';');
}

export function parseSel(str) {
    const out = [];
    if (!str) return out;
    for (const part of String(str).split(';')) {
        const i = part.indexOf(':');
        if (i < 0) continue;
        const chart = part.slice(0, i);
        if (!CHARTS.has(chart)) continue;
        for (const v of part.slice(i + 1).split('|')) { const value = dec(v); if (value) out.push({ chart, value }); }
    }
    return out;
}

// Charts' drill: `drill=<chart>:<kind>=<value>|<kind>=<value>`, e.g. `genres:genre=Electronic|subgenre=Techno`.
const DRILL_CHARTS = new Set(['genres', 'labels', 'years', 'acquisition']);
const DRILL_KINDS = new Set(['genre', 'subgenre', 'tag', 'glabel', 'gartist', 'label', 'lartist', 'year', 'month']);

export function serializeDrill(drill) {
    if (!drill || !DRILL_CHARTS.has(drill.chartId)) return '';
    const levels = (drill.levels || []).filter((l) => DRILL_KINDS.has(l?.k) && l.v);
    return levels.length ? `${drill.chartId}:${levels.map((l) => `${l.k}=${enc(l.v)}`).join('|')}` : '';
}

export function parseDrill(str) {
    if (!str) return null;
    const i = String(str).indexOf(':');
    const chartId = i > 0 ? str.slice(0, i) : '';
    if (!DRILL_CHARTS.has(chartId)) return null;
    const levels = [];
    for (const part of str.slice(i + 1).split('|')) {
        const j = part.indexOf('=');
        const k = j > 0 ? part.slice(0, j) : '', v = j > 0 ? dec(part.slice(j + 1)) : '';
        if (DRILL_KINDS.has(k) && v) levels.push({ k, v });
    }
    return levels.length ? { chartId, levels } : null;
}

function parseQuery(q) {
    const params = Object.create(null);
    for (const pair of q ? q.split('&') : []) {
        const i = pair.indexOf('=');
        if (i <= 0) continue;
        params[pair.slice(0, i)] = pair.slice(i + 1);
    }
    return params;
}

const FALLBACK = () => ({ view: 'collection' });

export function parseRoute(hash) {
    try { decodeURIComponent(String(hash || '')); } catch (_) { return FALLBACK(); }
    const raw = String(hash || '').replace(/^#/, '');
    if (!raw.startsWith('/')) return FALLBACK();
    const qi = raw.indexOf('?');
    const path = qi < 0 ? raw : raw.slice(0, qi);
    const params = parseQuery(qi < 0 ? '' : raw.slice(qi + 1));
    const segs = path.split('/').slice(1);
    const head = segs[0] || '';
    if (ENTITY_VIEWS.has(head)) {
        if (segs.length !== 2) return FALLBACK();
        const name = dec(segs[1] || '');
        if (!name) return FALLBACK();
        if (head === 'track') return { view: 'track', id: name };
        const r = { view: head, name };
        if (head === 'album') r.artist = params.artist ? dec(params.artist) : '';
        return r;
    }
    if (head === 'gigs') {
        if (segs.length > 2) return FALLBACK();
        if (segs.length > 1 && !segs[1]) return FALLBACK();
        return segs[1] ? { view: 'gigs', id: dec(segs[1]) } : { view: 'gigs' };
    }
    if (head === 'playlists' && segs.length > 1) {
        const r = playlistRoute(segs.slice(1));
        if (params.f) r.filter = parseFilter(params.f);
        return r;
    }
    if (segs.length !== 1) return FALLBACK();
    const legacy = legacyRoute(head, params);
    if (legacy) return legacy;
    if (!VIEWS.includes(head)) return FALLBACK();
    const view = head;
    const r = { view };
    // A Collection tab's Graph view: `?as=graph`, with the graph's focus.
    if (hasGraph(view) && params.as === 'graph') {
        r.graph = true;
        if (params.focus && dec(params.focus)) r.focus = dec(params.focus);
    }
    if (view === 'charts') {
        if (CHARTS.has(params.chart)) r.chart = params.chart;
        if (params.sel !== undefined) r.sel = parseSel(params.sel);
        const drill = parseDrill(params.drill);
        if (drill) r.drill = drill;
    } else if (params.tab && (TABS[view] || []).includes(params.tab) && params.tab !== VIEW_TABS[view]?.[0]) r.tab = params.tab;
    if (view === 'discover' && !r.tab && params.focus && dec(params.focus)) {
        r.focus = dec(params.focus);
        // An artist or label you don't own carries the Discogs id it was reached by.
        if (params.ref && OUTSIDE_REF.test(dec(params.ref))) r.ref = dec(params.ref);
    }
    if (INDEX_WITHIN[view]) {
        const type = INDEX_WITHIN[view].find((t) => params[t] !== undefined && dec(params[t]));
        if (type) r.within = { type, name: dec(params[type]) };
    }
    if (routeCarries(r, 'routeFav')) { const fav = parseFavParam(params.fav ? dec(params.fav) : ''); if (fav) r.fav = fav; }
    if (LINK_VIEWS.has(view) && params.links === 'missing') r.links = 'missing';
    if (view === 'settings' && SETTINGS_SECTIONS.includes(params.section)) r.section = params.section;
    if (view === 'similarity' && params.dev === '1') r.dev = true;
    if (view === 'rekordbox' && params.node && dec(params.node)) r.node = dec(params.node);
    if (TOOL_PARAMS[view]) {
        for (const k of TOOL_PARAMS[view]) if (params[k] && dec(params[k])) r[k] = dec(params[k]);
        if (params.declined === '1') r.declined = true;
        if (params.track && dec(params.track)) r.track = dec(params.track);
    }
    if (params.f && routeCarries(r, 'routeFilter')) r.filter = parseFilter(params.f);
    // An older grid link's own name search (`?q=`) is now the search field's text.
    if (INDEX_WITHIN[view] && params.q && dec(params.q) && !r.filter?.search) r.filter = { ...(r.filter || parseFilter('')), search: dec(params.q) };
    return r;
}

/** `#/playlists/rb/<nodeId>` or `#/playlists/u/<recordId>[/<laneId>]`; anything else opens the list. */
function playlistRoute(segs) {
    const [kind, rawId, rawLane, ...rest] = segs;
    const id = dec(rawId || ''), lane = dec(rawLane || '');
    if (rest.length || !id || !['rb', 'u'].includes(kind) || (kind === 'rb' && rawLane !== undefined) || (rawLane !== undefined && !lane)) return { view: 'playlists' };
    return lane ? { view: 'playlists', kind, id, lane } : { view: 'playlists', kind, id };
}

/** Old addresses (`#/map`, the old Explore and Discover graph links, chart tabs,
 *  History) → where they live now, marked `redirect` so the app
 *  rewrites the address bar. Null when the hash is not a legacy form. */
function enrichRoute(params) {
    const field = params.field ? dec(params.field) : '';
    const r = field && field !== 'tags' ? { view: 'fields', field } : { view: 'tagging' };
    if (r.view === 'tagging' && params.tag && dec(params.tag)) r.tag = dec(params.tag);
    if (params.declined === '1') r.declined = true;
    if (params.track && dec(params.track)) r.track = dec(params.track);
    return { ...r, redirect: true };
}

function legacyRoute(head, params) {
    // Review, Health and Sound quality became Tools; Enrich split into Tagging and Cleanup › Missing fields.
    if (head === 'review' && params.tab === 'cleanup') return { view: 'formatting', redirect: true };
    if (head === 'review' && params.tab === 'exploreme') return { view: 'collection', exploreme: true, redirect: true };
    if (head === 'review' && params.tab === 'missing') return { view: 'fields', redirect: true };
    if (head === 'review' || head === 'health') return { view: 'tagging', redirect: true };
    if (head === 'enrich') return enrichRoute(params);
    if (head === 'sound-quality') return { view: 'sound-check', redirect: true };
    // Import became Settings' Inbox card.
    if (head === 'import') return { view: 'settings', section: 'inbox', redirect: true };
    if (head === 'history') return { view: 'collection', openQueue: true, redirect: true };
    // Crates were saved filters; they live on the Tracks filter bar as Saved filters.
    if (head === 'crates') return { view: 'collection', savedFilters: true, redirect: true };
    if (head === 'shortlist') return { view: 'discover', tab: 'shortlist', redirect: true };
    // Favorites became ☆ on Collection's tabs.
    if (head === 'favorites') return { view: 'collection', fav: true, redirect: true };
    // Listen is a sheet under the search field, not a view.
    if (head === 'listen') return { view: 'collection', listen: true, redirect: true };
    // `seed` with an old Discover tab is that tab's focus link, not a legacy graph link.
    const oldDiscoverTab = head === 'discover' && LEGACY_DISCOVER_TABS.has(params.tab);
    const legacyKeys = oldDiscoverTab ? EXPLORE_PARAMS.filter((k) => k !== 'seed') : EXPLORE_PARAMS;
    const graphLink = head === 'map' || (head === 'explore' && Object.keys(params).some((k) => !GRAPH_PARAMS.has(k)))
        || (head === 'discover' && (legacyKeys.some((k) => params[k] !== undefined) || LEGACY_CHART_TABS.has(params.tab)));
    if (!graphLink && oldDiscoverTab) {
        const seed = params.seed ? dec(params.seed) : '';
        return seed ? { view: 'discover', focus: seed, redirect: true } : { view: 'discover', redirect: true };
    }
    // Explore › Graph became Collection's Graph view, with its focus, ☆ and filter.
    if (!graphLink && head === 'explore') {
        const r = { view: 'collection', graph: true };
        if (params.focus && dec(params.focus)) r.focus = dec(params.focus);
        const fav = parseFavParam(params.fav ? dec(params.fav) : '');
        if (fav) r.fav = fav;
        if (params.f) r.filter = parseFilter(params.f);
        return { ...r, redirect: true };
    }
    if (!graphLink) return null;
    const focus = params.focus ?? params.seed;
    const chart = params.chart ?? params.tab;
    const sel = params.sel !== undefined ? parseSel(params.sel) : [];
    if (!focus && CHARTS.has(chart)) {
        const r = { view: 'charts', chart };
        if (sel.length) r.sel = sel;
        if (params.f) r.filter = parseFilter(params.f);
        r.redirect = true;
        return r;
    }
    const r = { view: 'collection', graph: true };
    if (focus && dec(focus)) r.focus = dec(focus);
    else if (sel.length === 1 && SEL_ENTITY[sel[0].chart]) r.focus = entityId(SEL_ENTITY[sel[0].chart], sel[0].value);
    r.redirect = true;
    return r;
}

export function buildRoute(route) {
    const r = route || FALLBACK();
    if (ENTITY_VIEWS.has(r.view)) {
        if (!(r.view === 'track' ? r.id : r.name)) return '#/collection';
        if (r.view === 'track') return `#/track/${enc(r.id)}`;
        const base = `#/${r.view}/${enc(r.name ?? '')}`;
        return r.view === 'album' && r.artist ? `${base}?artist=${enc(r.artist)}` : base;
    }
    if (r.view === 'gigs') return r.id ? `#/gigs/${enc(r.id)}` : '#/gigs';
    if (r.view === 'playlists' && ['rb', 'u'].includes(r.kind) && r.id) {
        const f = serializeFilter(r.filter);
        return `#/playlists/${r.kind}/${enc(r.id)}${r.kind === 'u' && r.lane ? `/${enc(r.lane)}` : ''}${f ? `?f=${f}` : ''}`;
    }
    const view = VIEWS.includes(r.view) ? r.view : 'collection';
    const q = [];
    const tab = (TABS[view] || []).slice(1).includes(r.tab) ? r.tab : undefined;
    if (tab) q.push(`tab=${tab}`);
    if (view === 'discover' && !(TABS[view] || []).slice(1).includes(r.tab) && r.focus) {
        q.push(`focus=${enc(r.focus)}`);
        if (r.ref && OUTSIDE_REF.test(r.ref)) q.push(`ref=${enc(r.ref)}`);
    }
    if (view === 'settings' && SETTINGS_SECTIONS.includes(r.section)) q.push(`section=${r.section}`);
    if (hasGraph(view) && r.graph) {
        q.push('as=graph');
        if (r.focus) q.push(`focus=${enc(r.focus)}`);
    }
    if (view === 'charts') {
        if (CHARTS.has(r.chart)) q.push(`chart=${r.chart}`);
        if (Array.isArray(r.sel) && r.sel.length) q.push(`sel=${serializeSel(r.sel)}`);
        const drill = serializeDrill(r.drill);
        if (drill) q.push(`drill=${drill}`);
    }
    if (INDEX_WITHIN[view]?.includes(r.within?.type) && r.within.name) q.push(`${r.within.type}=${enc(r.within.name)}`);
    const fav = routeCarries({ view, tab }, 'routeFav') ? favParam(r.fav) : '';
    if (fav) q.push(`fav=${fav}`);
    if (LINK_VIEWS.has(view) && r.links === 'missing') q.push('links=missing');
    if (view === 'rekordbox' && r.node) q.push(`node=${enc(r.node)}`);
    if (TOOL_PARAMS[view]) {
        for (const k of TOOL_PARAMS[view]) if (r[k]) q.push(`${k}=${enc(r[k])}`);
        if (r.declined) q.push('declined=1');
        if (r.track) q.push(`track=${enc(r.track)}`);
    }
    const f = routeCarries({ view, tab }, 'routeFilter') ? serializeFilter(r.filter) : '';
    if (f) q.push(`f=${f}`);
    return `#/${view}${q.length ? `?${q.join('&')}` : ''}`;
}

export function routeEquals(a, b) { return buildRoute(a) === buildRoute(b); }
