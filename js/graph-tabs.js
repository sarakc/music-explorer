// Collection's Grid | Graph switch: which tabs have it, the one mode the whole section is in
// (a UI preference) and each tab's graph focus (this session), the routes into Collection that
// open in that mode with ☆ kept, and what a tab's graph lights. Pure apart from the storage it is handed.

/** Tabs with a Graph view (`?as=graph`). Playlists and Charts have none. */
export const GRAPH_TABS = ['collection', 'artists', 'albums', 'labels', 'tags'];
export const hasGraph = (view) => GRAPH_TABS.includes(view);
/** The node kind a tab's graph lights; Tracks and Albums light every kind. */
export const LIT_KIND = { artists: 'artist', labels: 'label', tags: 'tag' };

const KEY = 'umm.graphTabs';

/** The Collection tab whose Graph view a focus of each kind opens on. */
export const GRAPH_TAB = { artist: 'artists', label: 'labels', tag: 'tags', album: 'albums', track: 'collection' };
/** The Graph route focused on a node id of `type`. */
export const graphRouteFor = (focus, type) => ({ view: GRAPH_TAB[type] || 'collection', graph: true, focus });

/**
 * `{ graph, last }`: Collection's one mode (true: every tab with a Graph opens as a graph; it
 * is the graph unless the table was last on screen), and the last graph tab (Collection |
 * Discover returns there). The old per-tab list (`graph: [tab…]`) reads as graph mode.
 */
export function readGraphTabs(storage = globalThis.localStorage) {
    try {
        const v = JSON.parse(storage?.getItem(KEY) || 'null') || {};
        return { graph: v.graph !== false, last: hasGraph(v.last) ? v.last : 'collection' };
    } catch (_) { return { graph: true, last: 'collection' }; }
}

/**
 * A tab with a Graph was shown as a graph or a table: that is the mode. Playlists and Charts
 * leave it as it was. Returns the new state; unchanged when nothing moved.
 */
export function rememberMode(state, view, graph) {
    if (!hasGraph(view)) return state;
    const g = Boolean(graph), last = g ? view : state.last;
    if (state.graph === g && last === state.last) return state;
    return { graph: g, last };
}

export function writeGraphTabs(state, storage = globalThis.localStorage) {
    try { storage?.setItem(KEY, JSON.stringify(state)); } catch (_) { /* a preference only */ }
}

/** Each Collection tab's last graph focus (tab → id or null), for this session only. */
export const graphFocus = new Map();

/**
 * The next track plays (`from` → `to`, as `track:<id>`): a tab whose graph was left on the
 * track that just played was following the music, so it comes back on the one playing now.
 * Any other remembered selection stays. The graph on screen moves itself (_followPlaying).
 */
export function followGraphFocus(from, to, focus = graphFocus) {
    if (!from || !to || from === to) return;
    for (const [view, id] of focus) if (id === from) focus.set(view, to);
}

/**
 * A route into a Collection tab, in the current mode. One that leaves `graph` unset opens as a
 * graph in graph mode, on the focus that tab's graph had this session, or on `current` (the
 * graph's focus on screen) for a tab whose graph has not been seen. `graph: false` asks for the
 * table and `graph: true` is kept as given; Playlists, Charts and every other view pass through.
 */
export function withMode(route, { graphTabs, focus = graphFocus, current = null } = {}) {
    if (!route || !hasGraph(route.view) || route.graph !== undefined || !graphTabs?.graph) return route;
    const id = route.focus || (focus.has(route.view) ? focus.get(route.view) : current);
    return id ? { ...route, graph: true, focus: id } : { ...route, graph: true };
}

/** The route a Collection tab link opens: the tab in the current mode, with the favourites filter carried (`fav`, as the route holds it). */
export function tabRoute(view, { graphTabs, fav, focus = graphFocus, current = null } = {}) {
    const r = withMode({ view }, { graphTabs, focus, current });
    if (fav && view !== 'charts') r.fav = fav;
    return r;
}

/**
 * The lit set for a tab's graph: only nodes of the tab's kind. `lit` is the ☆
 * and filter set (null with neither on); `nodes` the atlas nodes.
 */
export function litForTab(view, lit, nodes = []) {
    const kind = LIT_KIND[view];
    if (!kind) return lit;
    const out = new Set();
    for (const n of nodes) if (n?.type === kind && (!lit || lit.has(n.id))) out.add(n.id);
    return out;
}

const GRID_ICON = '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5"/></svg>';
export const GRAPH_ICON = '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12.5" cy="11" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="4" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 10.5 7 5.8M9 5.8l2.5 3.6M5.5 12h5" stroke="currentColor" stroke-width="1.2"/></svg>';

/**
 * The Grid | Graph switch for the tab controls, pressed on the mode. `dimmed` on a tab with
 * no Graph (Playlists, Charts): shown in its place, showing the mode, and inert.
 */
export function viewSwitchHtml(graph, { viewer = false, dimmed = false } = {}) {
    if (viewer) return '';
    const off = dimmed ? ' disabled' : '';
    const b = (id, label, icon, on) => `<button type="button" data-view-switch="${id}" class="${on ? 'is-active' : ''}" aria-pressed="${on}" aria-label="${label}" title="${label} (v)"${off}>${icon}</button>`;
    return `<span class="view-switch${dimmed ? ' is-dimmed' : ''}" role="group" aria-label="View"${dimmed ? ' aria-disabled="true"' : ''}>${b('grid', 'Grid', GRID_ICON, !graph)}${b('graph', 'Graph', GRAPH_ICON, graph)}</span>`;
}

/** Tab controls with `dimmed` in the switch's place: replacing a switch they hold, first in them otherwise, or alone. */
export function withDimmedSwitch(controls, dimmed) {
    if (!controls) return `<div class="tab-controls">${dimmed}</div>`;
    if (controls.includes('class="view-switch')) return controls.replace(/<span class="view-switch[^]*?<\/span>/, dimmed);
    return controls.replace('<div class="tab-controls">', `<div class="tab-controls">${dimmed}`);
}
