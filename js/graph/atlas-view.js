// A Collection tab's Graph view and Discover › Graph: the atlas, one map that is always
// whole and still at rest. + and − show more or less of it, most-linked first (the step
// layouts the server works out); clicking a node selects it (the `focus` in the address):
// the camera glides to it, arcs draw out to its rings and the rest dims. ☆, the filter,
// search and Discover's Favorites home dim the rest the same way. This module holds the state,
// routing, the DOM layer (name hit targets, keyboard focus, the hover card) and events; the
// canvas drawing is AtlasCanvas in atlas-draw.js, + and − in atlas-settle.js, dragging in
// atlas-tug.js, the camera's motion in atlas-motion.js. Data comes from atlas-data.js, and in
// Discover mode the outside nodes, sources and Dig from discover-layer.js; every number is
// in atlas-config.js. The URL holds the focus (`#/<tab>?as=graph&focus=` or
// `#/discover?focus=`) with the header's ☆ and filter (`fav`, `f`), which decide the lit
// nodes (atlas-lit.js); the detail panel is app.panel, the search field app.goList (the map's Search chip on a phone and in the viewer);
// what shows and full screen are in atlas-options.js.
import { ATLAS } from './atlas-config.js';
import { AtlasData, focusPosition, hostFor, buildingText } from './atlas-data.js';
import { extentOf, fitCamera, clampCamera, shiftForPanel, toScreen, toWorld, zoomAt, resizeCamera, pickNearest } from './atlas-geometry.js';
import { CameraMotion, ringCamera, pastThreshold, releaseVelocity } from './atlas-motion.js';
import { AtlasCanvas } from './atlas-draw.js';
import { Settle, wanted } from './atlas-settle.js';
import { peekClick, readPeekMode } from './atlas-peek.js';
import { Tug } from './atlas-tug.js';
import { roomPx, sizePx, subgenreSwatches } from './atlas-look.js';
import { reasonLine } from './reason-words.js';
import DiscoverLayer, { OUTSIDE_TYPE_WORD } from './discover-layer.js';
import { anchorsNote, releaseFromNode, outsideFocusPosition } from './outside.js';
import { scopeTracks, selectionRing, linkedIdsOf, rememberScope } from './scope.js';
import { readShow, writeShow, shows, readSky, writeSky } from './atlas-options.js';
import ShowMenu from './show-menu.js';
import AtlasVisualizer from './atlas-visualizer.js';
import { litSet, nothingLit, artistNodeIds } from './atlas-lit.js';
import { entityId } from '../credits-graph.js';
import { shufflePool, graphShuffleContext, graphCount } from './graph-shuffle.js';
import { collectionTracks, isExploremeTrack, isStashedTrack, withoutStashed } from '../stash.js';
import { nodeTracks, nodeQueue, dblIntent, dblTarget, arrowTarget } from './node-play.js';
import { SelectionBar } from './selection-bar.js';
import { PLAYER_ICONS, isLocalPlayable } from '../player.js';
import { playingRing, homeNodeIds } from './atlas-layers.js';
import { buildRoute } from '../router.js';
import { favParam } from '../favorite-marks.js';
import { litForTab, graphFocus } from '../graph-tabs.js';
import { escapeHtml, TYPE_WORD } from '../html.js';
import { VIEWER, VIEWER_PROFILE, visitorHides } from '../viewer-profile.js';
import { PHONE, canGoBack, localPoint, panelInset } from '../phone.js';
import { atlasHost, showStage } from '../view-stage.js';

const NO_PANEL = Object.freeze({ bottom: 0, right: 0 });

export { focusedNodeIds, homeNodeIds } from './atlas-layers.js';

const PANEL_TYPES = new Set(['artist', 'label', 'tag', 'album']);
const MOON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M13.2 10.2A5.6 5.6 0 0 1 5.8 2.8a5.6 5.6 0 1 0 7.4 7.4Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const SUN = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
// Random: a four-point sparkle. Re-centre: a map app's target.
const SPARKLE = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M8 1.6C8.5 5.4 10.6 7.5 14.4 8 10.6 8.5 8.5 10.6 8 14.4 7.5 10.6 5.4 8.5 1.6 8 5.4 7.5 7.5 5.4 8 1.6Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
// Zoom out and in: a magnifier with − or +, so they never read as − and + (detail).
const lens = (plus) => `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4 14 14M5 7h4${plus ? 'M7 5v4' : ''}"/></svg>`;
const LENS_OUT = lens(false), LENS_IN = lens(true);
const WHOLE_MAP = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="8" cy="8" r="4.6"/><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"/><path d="M8 1.4v2M8 12.6v2M1.4 8h2M12.6 8h2"/></svg>';
const skinIsDark = () => Boolean(globalThis.document?.documentElement.classList.contains('skin-dark'));
const raf = (fn) => (globalThis.requestAnimationFrame || ((f) => setTimeout(() => f(performance.now()), 16)))(fn);

/** The "why" line on the hover card: the strongest readable reason. */
export function whyLine(reasons) {
    for (const r of reasons || []) { const line = reasonLine(r); if (line) return line; }
    return '';
}

/** The play context for a focus: its tracks under its name. */
export function focusPlayContext(focus) {
    const kind = PANEL_TYPES.has(focus.type) ? focus.type : 'track';
    return { key: `graph:${focus.id}`, kind, label: focus.name, route: { view: 'collection', graph: true, focus: focus.id } };
}

// A handoff older than this is not a Collection | Discover toggle.
const HANDOFF_MS = 5000;

/** The step a graph or a new selection opens on, of `count`: the middle one (ATLAS.openAt along them). */
export function openStep(count) {
    return Math.max(0, Math.round((count - 1) * ATLAS.openAt));
}

/** What the Collection | Discover toggle carries into the other mode: the map step, and its focus's ring depth. Else the opening step. */
export function carriedSteps(handoff, now, count) {
    const fresh = handoff && now - handoff.at < HANDOFF_MS ? handoff : null;
    return { detail: Math.max(0, Math.min(fresh?.detail ?? openStep(count), count - 1)), depth: fresh?.focusId ? { id: fresh.focusId, at: fresh.selDepth } : null };
}

/** − and + at the ends: − at the first step (with a selection, its first ring), + at the last (its third). */
export function stepEnds({ focus = false, selDepth = 0, detail = 0, count = 1 } = {}) {
    const last = focus ? ATLAS.selectDepth.length - 1 : count - 1, at = focus ? selDepth : detail;
    return { less: at <= 0, more: at >= last };
}

/** What a key does on the map: + = and − step detail, [ and ] zoom, 0 re-centres, Home shows the whole map. */
export function keyAction(key) {
    if (key === '+' || key === '=') return { detail: 1 };
    if (key === '-' || key === '−') return { detail: -1 };
    if (key === '0') return { recenter: true };
    if (key === 'Home') return { whole: true };
    return null;
}

/**
 * What a wheel event does: a pinch (`ctrlKey`) or a mouse wheel zooms; a trackpad's
 * two-finger scroll pans. Events of one gesture (`last`, within wheelGestureMs) keep its
 * kind, so a scroll that drifts never flips to a zoom. A trackpad reports pixel deltas
 * with `wheelDeltaY` = −3 × `deltaY` (−2 to −4.5 × at a browser zoom of 67–150 %, which
 * scales `deltaY` only); a wheel reports lines, or notches of 120.
 */
export function wheelIntent(e, last = null, now = 0) {
    if (e.ctrlKey) return 'zoom';
    if (last && now - last.at < ATLAS.wheelGestureMs) return last.kind;
    if (e.deltaMode === 1) return 'zoom';
    if (e.deltaX) return 'pan';
    if (e.wheelDeltaY) {
        if (e.wheelDeltaY === -3 * e.deltaY) return 'pan';
        if (e.wheelDeltaY % 120 === 0) return 'zoom';
        const ratio = -e.wheelDeltaY / e.deltaY;
        return ratio >= 2 && ratio <= 4.5 ? 'pan' : 'zoom';
    }
    return Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50 ? 'zoom' : 'pan';
}

/**
 * How much one zooming wheel event zooms. A pinch reports small deltas (a few per event), so
 * it has its own, faster rate, capped per event so a ctrl-turned mouse wheel never leaps.
 */
export function wheelFactor(deltaY, pinch = false) {
    if (!pinch) return Math.pow(ATLAS.wheelStep, -deltaY);
    const f = Math.pow(ATLAS.pinchStep, -deltaY);
    return Math.min(ATLAS.pinchMaxStep, Math.max(1 / ATLAS.pinchMaxStep, f));
}

/** Two cameras are the same view: within a few px and a few percent of zoom. */
export function sameCamera(a, b) {
    if (!a || !b) return false;
    return Math.abs(a.k / b.k - 1) < 0.03 && Math.hypot(a.cx - b.cx, a.cy - b.cy) * a.k < 4;
}

/**
 * Re-centre's next stop. `stops` are the ones there are, in order ({ stage, cam }: the
 * selection's rings, the whole map, Info's node up close); from one of them the next one
 * comes, wrapping; from anywhere else the first.
 */
export function nextRecenter(stops, at) {
    if (!stops.length) return null;
    const i = stops.findIndex((s) => sameCamera(at, s.cam));
    return stops[(i + 1) % stops.length];
}

/** The atlas node Info's top entry is about (an entity, a track or its artist), or null. */
export function infoNodeId(entry, has) {
    if (!entry) return null;
    if (entry.kind === 'track') {
        const t = entry.track;
        if (t?.id != null && has(`track:${t.id}`)) return `track:${t.id}`;
        return artistNodeIds(t?.artist).find(has) || null;
    }
    const e = entry.entity;
    const id = e?.id && has(e.id) ? e.id : entityId(e?.type, e?.name);
    return id && has(id) ? id : null;
}

/** What a press past the drag threshold does: pull a node, or (under reduced motion, or off any node) pan. */
export function dragKind(hit, { reduced = false } = {}) {
    return hit?.kind === 'node' && hit.n && !reduced ? 'node' : 'pan';
}

/** One layout of every node at its map spot, for a payload from before the step layouts. */
function homeSteps(atlas) {
    const n = atlas.nodes.length, layout = new Float32Array(2 * n);
    atlas.nodes.forEach((node, i) => { layout[2 * i] = node.x; layout[2 * i + 1] = node.y; });
    const order = atlas.nodes.map((x) => x.i).sort((a, b) => (atlas.nodes[b].weight || 0) - (atlas.nodes[a].weight || 0) || a - b);
    const rank = new Int32Array(n);
    order.forEach((i, k) => { rank[i] = k; });
    return { refK: fitCamera(atlas.extent, ATLAS.refW, ATLAS.refH).k, counts: [n], rank, layouts: [layout] };
}

/** The node kinds Random draws from, each only while Show draws it. */
const RANDOM_KINDS = new Set(['artist', 'label', 'tag']);

/**
 * Random: any node of a kind Show draws (artists, labels and tags; only lit ones, with a lit
 * set), each as likely as the next whatever its kind or track count; never the current focus.
 * Only ones with links enough to fill a first ring, so it opens on a neighbourhood, unless
 * none has. With every node kind off in Show there is nothing to pick (null).
 */
export function coreFocus(atlas, random = Math.random, exclude = null, lit = null, show = null) {
    const all = (atlas?.nodes || []).filter((n) => RANDOM_KINDS.has(n.type) && shows(show, n.type) && (!lit?.size || lit.has(n.id)) && n.id !== exclude)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const minLinks = ATLAS.selectDepth[0][0];
    const linked = atlas?.adjacency ? all.filter((n) => (atlas.adjacency.get(n.i)?.length || 0) >= minLinks) : all;
    const pool = linked.length ? linked : all;
    if (!pool.length) return null;
    const i = Math.min(pool.length - 1, Math.max(0, Math.floor((Number(random()) || 0) * pool.length)));
    return pool[i].id;
}

/**
 * What a graph route opens on: its `focus`; else, on opening, the playing track, or
 * failing that `randomId` (a fresh Random pick; the URL is replaced with either); else
 * the home (Collection: the whole map; Discover: its Favorites home).
 */
export function openingFocus(route, { playingId = null, randomId = null, openedOnce = false } = {}) {
    if (route?.focus) return { focus: route.focus };
    if (!openedOnce && (playingId || randomId)) return { redirect: playingId || randomId };
    return { home: true };
}

/**
 * Does selecting open Info on the node? A click asks for it (`want`); Info that is open on
 * something the map follows, or collapsed only because it was empty, follows too. An
 * automatic opening pick (Random or the playing track) never opens it, and in Discover the
 * Discover tab keeps the panel.
 */
export function panelOnSelect({ auto = false, listing = false, want = false, infoShowing = true, panelOpen = false, panelKind = null } = {}) {
    if (auto || listing) return false;
    // Info is asked for: a selection only refills Info that is showing, and never reopens it.
    return Boolean(want || (infoShowing && panelOpen && ['entity', 'track', 'release', 'outside'].includes(panelKind)));
}

/** A Discover home with nothing outside: a viewer snapshot that dropped them to fit its budget. */
export const hasOutside = (home) => Array.isArray(home?.outside) && home.outside.length > 0;

/** A click on the map: a node selects it; the selected node again opens it in Info; empty ground clears the selection. */
export function clickIntent(hitId, selectedId) {
    if (!hitId) return selectedId ? 'clear' : 'none';
    return hitId === selectedId ? 'info' : 'select';
}

export default class AtlasView extends AtlasCanvas {
    constructor({ app, data = new AtlasData() } = {}) {
        super();
        this.app = app; this.data = data;
        this._active = false; this._generation = 0; this.route = null;
        this.focus = null; this.hover = null; this.kbIndex = -1; this.wantPanel = false;
        // Peek (atlas-peek.js): the node Info shows while the selection stays ({ id, type, name }), and
        // on touch in `ask` the node whose tip a tap showed, with its ⓘ.
        this.peek = null; this._tipNode = null;
        this.motion = new CameraMotion();
        this.mode = 'collection';
        this.layer = new DiscoverLayer(this);
        // Discover's walk outward: the outline clicked last ({ id, name, x, y }), and the
        // step each outside focus was reached from (id → name), for the panel's "Via" line.
        this.show = readShow();
        this.night = false; // Night sky
        // + and −: the map's step (ATLAS.steps), and a selection's ring depth (ATLAS.selectDepth, its middle on every new focus).
        this.detail = openStep(ATLAS.steps.length + 1); this.selDepth = 0; this.ring = null;
        this.homeGraph = null;
        // ☆ and the Filter band: the lit node ids, or null with neither on.
        this.lit = null; this._litKey = null;
        this.viz = new AtlasVisualizer(this);
        // Bottom left: the trail, the selection with Info, and ways to listen.
        this.bar = new SelectionBar(this);
    }

    /** Is a node of this type drawn? The focus and what holds it always are. */
    shows(type, id = null) {
        const f = this.focus;
        if (this._showsFor !== f) { this._showsFor = f; this._showsKeep = f ? new Set([f.id, f.host].filter(Boolean)) : null; }
        return shows(this.show, type, id, this._showsKeep);
    }

    get discover() { return this.mode === 'discover'; }
    /** Discover's outside counts at the selection's ring depth. */
    get step() { return ATLAS.hoodSteps[this.focus ? this.selDepth : 0] || ATLAS.hoodSteps[0]; }
    /** The route view this graph lives on: Discover, or the Collection tab it is the Graph view of. */
    _view() { return this.discover ? 'discover' : this.route?.view || 'collection'; }

    /** The focus neighbourhood's ids in score order (the detail panel's Discogs "near" list). */
    get neighbourIds() { return (this.focus?.payload?.neighbours || []).map((n) => n.id); }

    // ---- lifecycle ----

    async render(route) {
        this._cleanup();
        this._active = true; this._suspended = false;
        this._openedOnce = false; this._placed = false; this._autoPick = null;
        this.lit = null; this._litKey = null; this._baseKey = null; this._litFailed = false; this._preFit = null;
        this.homeGraph = null;
        this.mode = route?.view === 'discover' ? 'discover' : 'collection';
        this.route = route;
        this.layer.reset();
        // The viewer's map keeps one title; its Collection | Discover toggle names the mode.
        this._title();
        document.getElementById('viewSubtitle').textContent = '';
        // The map's own host beside the page (view-stage.js): the table and the grids never overwrite it.
        const host = this.host = atlasHost(document);
        host.classList.add('is-atlas');
        showStage(true);
        host.innerHTML = `<div class="atlas-shell"><div class="atlas" id="atlas">
            <canvas class="atlas-canvas" id="atlasCanvas" aria-hidden="true"></canvas>
            <div class="atlas-dom" id="atlasDom" role="group" aria-label="Map"></div>
            <div class="atlas-top">
                <div class="atlas-group">
                    ${PHONE ? '<button type="button" class="atlas-chip atlas-icon" id="atlasBack" aria-label="Back" title="Back" hidden>←</button>' : ''}
                    ${PHONE || VIEWER ? '<div class="atlas-pop-host" id="atlasSearch"></div>' : ''}
                    ${VIEWER ? '<button type="button" class="atlas-chip" id="atlasFilter" aria-expanded="false" aria-controls="filterBand">Filter</button>' : ''}
                    ${VIEWER ? '' : `<button type="button" class="atlas-chip atlas-icon" id="atlasShuffle" title="Shuffle" aria-label="Shuffle" disabled>${PLAYER_ICONS.shuffle.replace('<svg ', '<svg width="14" height="14" ')}</button>`}
                    <span class="atlas-lit-note" id="atlasLit" role="status" hidden>Nothing matches</span>
                </div>
                <div class="atlas-group">
                    <div class="atlas-pop-host" id="atlasShowMenu"></div>
                    <div class="atlas-switch" id="atlasSwitch" role="tablist" aria-label="Graph"${visitorHides('discover') ? ' hidden' : ''}><a href="#/collection?as=graph" data-mode="collection" role="tab">Collection</a><a href="#/discover" data-mode="discover" role="tab">Discover</a></div>
                    ${PHONE && !VIEWER && !this.discover ? '<button type="button" class="atlas-chip" id="atlasGrid">Grid</button>' : ''}
                    ${PHONE && this.discover ? '<a class="atlas-chip" id="atlasList" href="#/discover?tab=new">New Releases</a>' : ''}
                    <button type="button" class="atlas-chip atlas-icon" id="atlasRandom" title="Random" aria-label="Random">${SPARKLE}</button>
                    <button type="button" class="atlas-chip atlas-icon" id="atlasSky" aria-pressed="false" aria-label="Night sky" title="Night sky">${MOON}</button>
                </div>
            </div>
            <div class="atlas-corner">
                <div class="atlas-zoom" id="atlasLens"><button type="button" data-lens="-1" aria-label="Zoom out" title="Zoom out">${LENS_OUT}</button><button type="button" data-lens="1" aria-label="Zoom in" title="Zoom in">${LENS_IN}</button></div>
                <div class="atlas-zoom" id="atlasZoom"><button type="button" data-step="-1" aria-label="Less" title="Less (−)">−</button><button type="button" data-step="1" aria-label="More" title="More (+)">+</button></div>
                <button type="button" class="atlas-chip atlas-icon" id="atlasWhole" title="Re-centre (0)" aria-label="Re-centre">${WHOLE_MAP}</button>
                <button type="button" class="atlas-chip atlas-icon" id="atlasViz" aria-pressed="false" aria-label="Visualizer" title="Visualizer">${PLAYER_ICONS.wave.replace('<svg ', '<svg width="14" height="14" ')}</button>
                <button type="button" class="atlas-chip atlas-icon" id="atlasFull" aria-pressed="false" aria-label="Full screen" title="Full screen"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            </div>
            <div class="atlas-bar" id="atlasBar" role="group" aria-label="Selection" hidden></div>
            <div class="atlas-note" id="atlasNote" role="status" hidden></div>
            <div class="atlas-status" id="atlasStatus" role="status" hidden></div>
            <div class="atlas-tip" id="atlasTip" hidden></div>
        </div></div>`;
        this.el = (id) => document.getElementById(id);
        this.canvas = this.el('atlasCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.reduced = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
        this.motion = new CameraMotion({ reduced: this.reduced });
        this._applySky(readSky(undefined, skinIsDark()));
        this.bar.mount(this.el('atlasBar'));
        // The header is hidden over the phone's graph and the viewer's: the chip opens the search field over the map.
        this.app.goList?.mountChip(this.el('atlasSearch'));
        // Show › Artists, Albums, Labels, Tags and Tracks: a chip beside Collection | Discover, in the app and the viewer alike.
        this._showMenu = new ShowMenu(this.el('atlasShowMenu'), { show: () => this.show });
        this._resize();
        this._readColours();
        this._wire();
        this._syncSwitch(route);
        // The viewer hides Collection | Discover when its snapshot holds nothing outside: Discover would only dim Collection.
        if (VIEWER) {
            // A visitor's map has no Discover at all.
            this._outside ||= visitorHides('discover') ? Promise.resolve(false) : fetch('/api/atlas/discover').then((r) => (r.ok ? r.json() : null)).then((home) => (home ? hasOutside(home) : true)).catch(() => true);
            this._outside.then((has) => { const sw = this.el?.('atlasSwitch'); if (sw) sw.hidden = !has; });
        }
        if (this.full) { this.full = false; this._setFull(true, { fromBrowser: true }); }
        return this.applyRoute(route);
    }

    /** The header's title: the section (the viewer's map keeps one title; its Collection | Discover toggle names the mode). */
    _title() {
        const title = document.getElementById('viewTitle');
        if (title) title.textContent = VIEWER ? VIEWER_PROFILE.title : this.discover ? 'Discover' : 'Collection';
    }

    /** Can this map come back as it was for `route`: suspended, and in the same mode (one instance serves both)? */
    canResume(route) {
        return Boolean(this._suspended && this.host?.isConnected && (route?.view === 'discover' ? 'discover' : 'collection') === this.mode);
    }

    /**
     * The table (or any other view) takes the screen: the map stays built behind it. The loop
     * pauses (no frame is drawn while inactive), the document listeners, the resize observer and
     * the player subscription go, and `.is-atlas` comes off (the phone turns the page on it). The
     * atlas, the settle state, the camera, the selection and the trail stay.
     */
    suspend() {
        if (!this._active) return;
        this._active = false; this._suspended = true; this._generation++;
        this.data.cancel();
        // A glide under way ends where it was going.
        const to = this.motion.anim?.to;
        this.motion.stop();
        if (to) this.cam = { ...to };
        this._drag = null;
        if (this.full) this._setFull(false);
        this._showMenu?.close();
        this._showMenu?.destroy();
        this._cleanup({ keepMenu: true });
        this.app.goList?.unmountChip();
        this.host?.classList.remove('is-atlas');
    }

    /** Back on screen as it was left; relit from the current ☆, filter and scope, then the route's selection. */
    async resume(route) {
        if (!this._suspended) return this.render(route);
        this._active = true; this._suspended = false;
        this.route = route;
        this._title();
        this.host.classList.add('is-atlas');
        showStage(true);
        this.app.goList?.mountChip(this.el('atlasSearch'));
        this._showMenu?.attach();
        this._applySky(readSky(undefined, skinIsDark()));
        this._readColours();
        this._wire();
        this._resize();
        // Relight from what changed behind the table (a filter, a tag edit); the camera stays.
        this._litKey = null;
        this._dirty();
        return this.applyRoute(route);
    }

    _cleanup({ keepMenu = false } = {}) {
        this.viz?.stop({ quiet: true });
        if (!keepMenu) { this._showMenu?.destroy(); this._showMenu = null; }
        this.resizeObserver?.disconnect();
        for (const [target, type, fn, opts] of this._listeners || []) target.removeEventListener(type, fn, opts);
        this._listeners = [];
        this._unsubscribePlayer?.(); this._unsubscribePlayer = null;
        this._unsubscribeJobs?.(); this._unsubscribeJobs = null;
        this._unsubscribeSlot?.(); this._unsubscribeSlot = null;
        clearTimeout(this._clickTimer); clearTimeout(this._settleTimer);
        this.layer.stop();
        this.host?.classList.remove('is-atlas');
    }

    teardown() {
        this._active = false; this._suspended = false; this._generation++;
        this.data.cancel();
        this._cleanup();
        this.focus = null; this.hover = null; this.atlas = null; this.peek = null; this._tipNode = null;
        this.homeGraph = null;
        // A camera move, a drag or an ease under way: none of it outlives the graph.
        this.motion.stop(); this.settle = null; this.tug = null; this.ring = null; this._drag = null;
        this._keep = null; this._dimKeep = null; this._dimLevel = undefined; this._keptCam = false;
        this.layer.reset();
        this.app.discoverPanel?.clear();
        this.app.goList?.unmountChip();
        this._preFit = null;
        // Full screen stays through the Collection | Discover toggle (a teardown and a render); leaving the graph ends it.
        clearTimeout(this._fullTimer);
        this._fullTimer = setTimeout(() => { if (!this._active) this._setFull(false); }, 250);
    }

    /** Route changed in place (the selection): select or clear without remounting. */
    async applyRoute(route) {
        if (!this._active) return;
        this.route = route;
        // Each Collection tab's Graph comes back on the focus it had (graph-tabs.js).
        if (!this.discover) graphFocus.set(this._view(), route?.focus || null);
        this._syncSwitch(route);
        const generation = ++this._generation;
        this._keptCam = false;
        const alive = () => this._active && generation === this._generation;
        // ☆ or the filter changed under the same focus: relight, nothing else moves.
        const state = this.app.filterEngine?.state ?? null;
        const litKey = `${favParam(route?.fav)}|${JSON.stringify(state)}`;
        // Typed text alone changed: the camera stays where it is.
        const baseKey = `${this._view()}|${favParam(route?.fav)}|${JSON.stringify(state ? { ...state, search: '' } : null)}`;
        const typed = baseKey === this._baseKey;
        this._baseKey = baseKey;
        // Another graph tab lights another kind; Tracks' Sound issues and Exploreme tracks narrow what it lights.
        const key = `${this._view()}|${this._narrowKey()}|${litKey}`;
        const relight = key !== this._litKey;
        const inPlace = relight && this._litKey !== null && this.atlas && (route?.focus || null) === (this.focus?.id || null);
        this._litKey = key;
        try {
            if (relight) await this._syncLit(alive);
            if (relight && alive() && this.atlas) this._retarget();
            if (!alive()) return;
            // A lit set with no focus is what the graph is about: the camera fits it.
            if (inPlace) { if (!this.focus && !typed) this.home(); return; }
            this._preFit = null;
            if (!this.atlas) {
                const out = await this.data.load({ isAlive: alive, onBuilding: (pct) => this._note(buildingText(pct)) });
                if (!out || !alive()) return;
                if (out.failed) return this._failed();
                this._setAtlas(out.atlas);
            }
            const playing = this.app.audioPlayer?.isPlaying ? this._playingId() : null;
            // Collection opens somewhere new each time; Discover keeps its recommendations home.
            const randomId = !this._openedOnce && !this.discover ? coreFocus(this.atlas, Math.random, null, this.lit, this.show) : null;
            // Rows selected in the table light their artists: nothing is picked for them.
            const open = this.rowsLit && !route?.focus ? { home: true } : openingFocus(route, { playingId: playing, randomId, openedOnce: this._openedOnce });
            this._openedOnce = true;
            // Opening with no selection: the playing track while one plays, else a Random pick; Info stays as it is.
            if (open.redirect) { this._autoPick = open.redirect; return this._go({ focus: open.redirect }, { replace: true }); }
            const focusId = open.focus;
            if (!focusId) {
                this._clearFocus();
                if (open.home) await this._loadHome(alive);
                if (alive()) this._startPendingViz();
                return;
            }
            const clicked = this.layer.clicked?.id === focusId ? this.layer.clicked : null;
            const payload = await this.data.focus(focusId, { isAlive: alive, mode: this.mode, ref: this.discover ? route?.ref : null, name: clicked?.name || null });
            if (!payload || !alive()) return;
            this._setFocus(payload);
            // A release you don't own: the focus is what it hangs off; the release is selected.
            if (payload.select) this.layer.open(this.layer.find(payload.select));
            this._startPendingViz();
        } catch (err) {
            if (!alive()) return;
            if (err?.status === 404 && route?.focus) {
                this._clearFocus();
                this._placed = true;
                const release = this.discover ? err.body?.release : null;
                if (release) this.app.panel?.show('release', { release: releaseFromNode(release) }, { focus: false });
                if (err.body?.limit === 'snapshot') return this._note('Not in the snapshot');
                return this._note(release ? 'Nothing in your library near this yet.' : 'Not in your library.');
            }
            this._note('Map unavailable.', VIEWER ? null : () => this.applyRoute(this.route));
        }
    }

    /**
     * The visualizer, asked for from the player (app.openVisualizer): it starts once the Collection
     * graph has its selection, now if it has one already. `onExit` runs when it is left.
     */
    visualize({ onExit = null } = {}) {
        this._vizPending = { onExit, at: Date.now() };
        if (this._active && this.atlas && this.focus) this._startPendingViz();
    }

    _startPendingViz() {
        const pending = this._vizPending;
        if (!pending || !this._active || this.discover || this.viz.on) return;
        this._vizPending = null;
        // A request the graph never got to (a load that failed) is dropped, not started later.
        if (Date.now() - pending.at > 30000) return;
        this.viz.onExit = pending.onExit;
        this.viz.start();
    }

    handleEscape(e) {
        if (!this._active || e.key !== 'Escape' || e.defaultPrevented) return false;
        if (e.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return false;
        if ([...document.querySelectorAll('.enrich-backdrop,.bte-root.bte-open,.tr-root.tr-open,[aria-modal="true"]')].some((el) => el.getClientRects().length)) return false;
        if (this._showMenu?.close({ restoreFocus: true })) { e.preventDefault(); return true; }
        if (this.viz.on) { this.viz.stop(); e.preventDefault(); return true; }
        if (this.full) { this._setFull(false); e.preventDefault(); return true; }
        // With the right-hand slot, the first Esc already collapsed it (app.js), so this one clears the selection.
        if (!this.app.rightSlot && this.app.panel?.isOpen) { this.app.panel.close({ restoreFocus: false }); this.endPeek(); e.preventDefault(); return true; }
        if (this.route?.focus) { this._go({}); e.preventDefault(); return true; }
        if (this.rowsLit) { this.setRows(null); this._retarget(); e.preventDefault(); return true; }
        return false;
    }

    // ---- state ----

    _setAtlas(atlas) {
        this.atlas = atlas;
        this._syncRandom();
        if (!atlas.steps) atlas.steps = homeSteps(atlas);
        const refK = atlas.steps.refK;
        this._mapR = (i) => roomPx(atlas.nodes[i].weight, atlas.nodes[i].type) / refK;
        this.settle = new Settle(atlas.nodes.length);
        this.tug = new Tug(this.settle, (i) => this._roomR(i), { slack: this._slack() });
        // Drawn light to heavy, so the heaviest sit on top; named heaviest first.
        this._drawOrder = atlas.nodes.map((n) => n.i).sort((a, b) => (atlas.nodes[a].weight || 0) - (atlas.nodes[b].weight || 0) || a - b);
        this._byWeight = [...this._drawOrder].reverse();
        const carried = carriedSteps(this._handoff, performance.now(), atlas.steps.counts.length);
        this.detail = carried.detail; this._carriedDepth = carried.depth;
        this._kindLit();
        this._colourNodes();
        this._syncLitNote();
        this.home(false);
        this._retarget(false);
        this._note(atlas.nodes.length ? null : 'Nothing on the map yet.');
        this.app._repaintCollectionHeader?.(); // the subgenre swatches
    }

    _failed() {
        if (VIEWER) { this._note('Map layout failed.'); return; }
        this._note('Map layout failed.', async () => {
            try { await fetch('/api/similarity/rebuild', { method: 'POST' }); } catch (_) { /* the retry below reports it */ }
            this.atlas = null;
            this.applyRoute(this.route);
        });
    }

    /** The selection clears: its arcs draw back in, everything returns to full strength, the camera stays. */
    _clearFocus() {
        const had = Boolean(this.focus);
        this._lowerLift();
        this.focus = null; this.hover = null; this.kbIndex = -1; this.selDepth = 0; this.ring = null; this.peek = null;
        this.layer.reset();
        if (had) this._retarget();
        this._note(null);
        this.layer.status(null);
        this._buildDom();
        this.bar.onClear();
    }

    _setFocus(payload) {
        const atlas = this.atlas, f = payload.focus;
        this.homeGraph = null;
        const host = f.outside ? null : hostFor(f, payload, atlas);
        const clicked = this.layer.clicked?.id === f.id ? this.layer.clicked : null;
        const pos = f.outside ? outsideFocusPosition(atlas, { clicked, neighbours: payload.neighbours, previous: this.focus?.pos })
            : focusPosition(atlas, f, { neighbours: payload.neighbours, parent: host });
        const neighbours = payload.neighbours || [];
        const hood = new Map(neighbours.filter((n) => atlas.byId.has(n.id)).map((n) => [n.id, n]));
        const linkedIds = linkedIdsOf(payload);
        for (const id of payload.linkedIds || []) if (!hood.has(id) && atlas.byId.has(id)) hood.set(id, { id, score: null, linked: 1, reasons: [] });
        const previous = this.focus;
        this.rowsLit = null; this._rowsFit = false;
        if (previous && previous.id !== f.id) this._lowerLift();
        if (previous?.id !== f.id) this.selDepth = this._carriedDepth?.id === f.id ? this._carriedDepth.at : openStep(ATLAS.selectDepth.length);
        this._carriedDepth = null;
        const startedAt = previous?.id === f.id ? previous.startedAt : performance.now();
        // A new selection ends a peek: Info, if it shows, follows the selection.
        if (previous?.id !== f.id) this.peek = null;
        this.focus = { ...f, payload, pos, host, hood, linkedIds, startedAt };
        this.hover = null; this.kbIndex = -1;
        this.layer.apply(payload);
        this._refreshRing();
        const notes = [];
        if (!pos) notes.push('Not placed yet.');
        else if (pos.unplaced) notes.push('Not placed yet.');
        // An outside focus says what it found on the bottom-left line instead.
        if (!f.outside && !hood.size && !(this.discover && this.layer.nodes.length)) notes.push('Nothing close enough yet.');
        this._note(notes.join(' ') || null);
        this._syncLitNote();
        // The camera glides to a new selection; the camera handed over by the Collection | Discover toggle stays.
        if (this._keptCam) this._keptCam = false;
        else if (pos && previous?.id !== f.id) {
            const close = this._closeUpId === f.id && this._closeCamera(f.id, Math.max((this.motion.anim?.to || this.cam)?.k || 0, this.mapK * ATLAS.albumZoom));
            if (close) this._ease(close); else this._follow();
        }
        this._closeUpId = null;
        this._placed = true;
        this._afterFocus(previous);
    }

    _afterFocus(previous) {
        const f = this.focus, panel = this.app.panel;
        const auto = this._autoPick === f.id;
        this._autoPick = null;
        // In Discover, the Discover tab keeps the side panel: Info fills when it is asked for.
        const open = panelOnSelect({
            auto, listing: this.discover && this.app.rightSlot?.shows('discover'), want: this.wantPanel,
            infoShowing: this.app.rightSlot ? this.app.rightSlot.shows('details') : true, panelOpen: panel?.isOpen, panelKind: panel?.kind,
        });
        this.wantPanel = false;
        if (open) this._openPanel(f, previous);
        this.bar.onFocus(previous);
        if (!VIEWER) this.app.discogsQueue?.focus?.({ focus: [f.id, ...(this.discover ? this.layer.discogs?.missing || [] : [])], visible: this.discover ? this.layer.visibleReleases() : [], near: this.neighbourIds.slice(0, 20) });
        this._dirty();
    }

    /**
     * Info on `f`, Why near `previous`. A name followed in Info moves the selection, or while a
     * peek is open peeks at it; on a peek (`peek`) Info's Focus here makes it the selection.
     */
    _openPanel(f, previous = null, { peek = false } = {}) {
        const panel = this.app.panel;
        if (!panel) return;
        const context = previous && previous.id !== f.id ? { id: previous.id, type: previous.type, name: previous.name } : null;
        const onFocusEntity = (e) => (this.peek ? this.peekAt(e) : this.focusOn(e.id));
        const onFocusHere = peek ? () => this.stepToPeek() : null;
        if (f.outside) return this.layer.open(this.layer.focusNode);
        if (f.type === 'track') {
            const track = this._track(f.id.replace(/^track:/, ''));
            if (track) panel.open(track, null, { focus: false, context, onFocusEntity, onFocusHere });
            return;
        }
        if (PANEL_TYPES.has(f.type)) panel.openEntity({ id: f.id, type: f.type, name: f.name }, { context, focus: false, onFocusEntity, onFocusHere });
    }

    /** The selected node clicked again: Info opens on it (ending a peek), or returns to it from a name followed there. */
    showInfo() {
        const panel = this.app.panel;
        if (!this._active || !this.focus || !panel) return;
        if (this.peek) { this.peek = null; this._settled(); }
        this.app.rightSlot?.open?.('details');
        if (panel.isOpen && panel.current?.id === this.focus.id && (panel.history?.length || 1) === 1) return;
        this._openPanel(this.focus);
    }

    /** Info came into view: show the peeked node or the current focus there, unless it already does. */
    refreshPanel() {
        const panel = this.app.panel, shown = this.peek || this.focus;
        if (!this._active || !shown || !panel || panel.current?.id === shown.id) return;
        this._openPanel(shown, this.peek ? this.focus : null, { peek: Boolean(this.peek) });
    }

    /** Is Info showing (the slot's Info tab, or the panel where there is no slot)? */
    _infoShowing() {
        const slot = this.app.rightSlot;
        return Boolean(slot ? slot.shows?.('details') : this.app.panel?.isOpen);
    }

    /**
     * Peek at a node (atlas-peek.js): Info shows it, Why near the selection, and it gets a thin
     * ring; the selection, its rings and the camera stay. The selection itself is Info as ever.
     */
    peekAt(node) {
        if (!this._active || !node?.id || !this.app.panel) return;
        if (node.id === this.focus?.id) { this.showInfo(); return; }
        const n = this.atlas?.byId.get(node.id);
        const type = node.type || n?.type, name = node.name || n?.name;
        if (!type || !name) return;
        this.peek = { id: node.id, type, name };
        this._tipNode = null;
        this.app.rightSlot?.open?.('details');
        this._openPanel(this.peek, this.focus, { peek: true });
        this._showTip(this.hover);
        this._settled();
    }

    /** The peek ends (Info closed, Esc): its ring goes; nothing else moves. True when there was one. */
    endPeek() {
        if (!this.peek) return false;
        this.peek = null;
        this._settled();
        return true;
    }

    /** Focus here, or Enter: the peeked node becomes the selection, a step on the trail. */
    stepToPeek() {
        const p = this.peek;
        if (!this._active || !p) return false;
        if (p.id !== this.focus?.id) this.bar.markStep(this.focus?.id);
        this.peek = null;
        this.focusOn(p.id);
        return true;
    }

    /** Select a node: the URL updates; Info follows only if it is showing. */
    focusOn(id) {
        return this._go({ focus: id });
    }

    randomFocus() {
        const id = coreFocus(this.atlas, Math.random, this.focus?.id || null, this.lit, this.show);
        if (id) this.focusOn(id);
    }

    /** Random is greyed while Show leaves it nothing to pick. */
    _syncRandom() {
        const random = this.el?.('atlasRandom');
        if (random) random.disabled = !coreFocus(this.atlas, () => 0, null, null, this.show);
    }

    /**
     * + and −: with nothing selected, the map's next or previous step (the camera stays); with
     * a selection, its rings one deeper or shallower, and the camera follows them.
     */
    stepDetail(delta) {
        if (!this.atlas) return;
        if (this.focus) {
            const next = Math.max(0, Math.min(ATLAS.selectDepth.length - 1, this.selDepth + delta));
            if (next === this.selDepth) return;
            this.selDepth = next;
            if (this.discover) this.layer.apply(this.focus.payload);
            this._refreshRing();
            if (this.focus.pos) this._follow();
        } else {
            const next = Math.max(0, Math.min(this.atlas.steps.counts.length - 1, this.detail + delta));
            if (next === this.detail) return;
            this.detail = next;
            this._retarget();
        }
        this.hover = null;
    }

    /** − and +: which of them can still go (stepEnds). */
    _syncSteps() {
        const zoom = this.el?.('atlasZoom');
        if (!zoom || !this.atlas) return;
        const ends = stepEnds({ focus: Boolean(this.focus), selDepth: this.selDepth, detail: this.detail, count: this.atlas.steps.counts.length });
        const [less, more] = zoom.querySelectorAll('[data-step]') || [];
        // aria-disabled, not disabled: a disabled button would drop keyboard focus at the end.
        less?.setAttribute('aria-disabled', String(ends.less));
        more?.setAttribute('aria-disabled', String(ends.more));
    }

    /** What every graph route keeps: ☆ and the filter. */
    _kept() { return { fav: this.route?.fav || undefined, filter: this.app.filterEngine?.state }; }

    /** Navigate within this graph: `patch` is the focus (none clears it). */
    _go(patch, opts) { return this.app.navigate({ view: this._view(), ...(this.discover ? {} : { graph: true }), ...this._kept(), ...patch }, opts); }

    // ---- lit nodes ----

    /** Read ☆ and the filter into the lit set, and draw the header (☆, the Filter band). */
    async _syncLit(alive = () => this._active) {
        const app = this.app, engine = app.filterEngine;
        if (!engine || !app._allTracks) return;
        // Collection's rows: stashed tracks light nothing, but under the pinned Stashed filter.
        const all = await app._allTracks();
        const tracks = this.discover ? withoutStashed(all) : collectionTracks(all, { includeExploreme: true, includeStashed: !!app._stashedOnly?.() });
        await app._prepareRulesPass?.();
        let favorites = null, failed = false;
        if (app._favOnly?.()) {
            // A failed read is never "Nothing matches": ☆ lights nothing until it is read.
            try { favorites = (await app.integrationManager.database.listMarks(app._favRoute())) || []; } catch (_) { failed = true; }
        }
        if (!alive()) return;
        let passing = engine.hasActiveFilters() ? new Set(engine.applyFilters(tracks).map((t) => String(t.id))) : null;
        const narrow = this._narrow();
        if (narrow) passing = new Set(tracks.filter((t) => (!passing || passing.has(String(t.id))) && narrow(t)).map((t) => String(t.id)));
        // Artists, Labels and Tags light only their own kind (once the atlas is here); ☆ lights every favorite.
        this._litBase = litSet({ tracks, passing, favorites });
        this._litByKind = !this.discover && !favorites;
        this._kindLit();
        this._litFailed = failed;
        // The merged tracks (one per song, duplicates folded in), as the table shows them: what nodes play and act on.
        this._tracks = tracks;
        this._syncShuffle(tracks, passing, favorites, failed);
        app._renderCollectionHeader?.(this._view(), { ...this._counted(tracks, favorites, failed), options: engine.getNarrowedOptions(tracks) });
        this._syncLitNote();
        this._redraw();
        this.bar.render(); // Scope's pressed state
    }

    /** The viewer's Filter chip: open with the band, its count of conditions. */
    syncFilterChip({ count = 0, open = false } = {}) {
        const chip = this.el?.('atlasFilter');
        if (!chip) return;
        chip.innerHTML = count > 0 ? `Filter <span class="n">${count}</span>` : 'Filter';
        chip.setAttribute('aria-expanded', String(Boolean(open)));
        chip.classList.toggle('on', count > 0);
    }

    /**
     * The header's count, as the table's: ☆ narrows the total, the filter and search
     * narrow within it, and what is left is the tracks the graph lights. A count, not
     * rows: the Gigs foot line reads none from a graph, and ⋯ asks headerTracks for its own.
     * Discover and the viewer keep the subtitle blank: neither has a table to agree with; the
     * band's foot still counts the lit tracks (`bandCount`).
     */
    _counted(tracks, favorites, failed) {
        const { total, count } = graphCount({ tracks, favorites: failed ? null : favorites, lit: this._litTracks || [], counts: this._counts() });
        if (this.discover || VIEWER) return { allTracks: tracks, subtitle: '', bandCount: count };
        return { allTracks: total, count };
    }

    /** What the tab's table counts: the Tracks table leaves Exploreme out when ⋯ › Exploreme tracks is off (Stashed lists every stashed track); the grids keep it. */
    _counts() {
        const app = this.app;
        return this._view() === 'collection' && !app._includeExploreme && !app._stashedOnly?.() ? (t) => !isExploremeTrack(t) : null;
    }

    /** Tracks' ⋯ › Sound issues and ⋯ › Exploreme tracks (off): they narrow the Tracks graph as they narrow the table. Null when neither. */
    _narrow() {
        const app = this.app;
        if (this.discover || this._view() !== 'collection') return null;
        const sound = app._soundIssuesOnly, noExplore = this._counts();
        if (!sound && !noExplore) return null;
        return (t) => (!sound || app._trackHasSoundIssue(t)) && (!noExplore || noExplore(t));
    }

    /** What _narrow narrows by, for the relight key. */
    _narrowKey() {
        if (this.discover || this._view() !== 'collection') return '';
        return `${this.app._soundIssuesOnly ? 's' : ''}${this._counts() ? 'e' : ''}`;
    }

    /** ⋯ › Play all and Shuffle all on a graph: the lit tracks the header counts, in table order. */
    headerTracks() {
        const counts = this._counts(), lit = this._litTracks || [];
        const tracks = counts ? lit.filter(counts) : [...lit];
        return this.app._sortLikeTable ? this.app._sortLikeTable(tracks) : tracks;
    }

    /** Shuffle plays the owned tracks the graph lights; disabled when nothing matches. */
    _syncShuffle(tracks, passing, favorites, failed) {
        // What a node plays and acts on, and what the header counts: the lit tracks, playable or not, with or without Shuffle.
        this._litTracks = failed ? [] : shufflePool({ tracks, passing, favorites });
        const btn = this.el?.('atlasShuffle');
        if (!btn) return;
        this._shufflePool = failed ? [] : shufflePool({ tracks, passing, favorites, playable: (t) => isLocalPlayable(t) && !isStashedTrack(t) });
        btn.disabled = !this._shufflePool.length;
        btn.title = btn.disabled ? 'Nothing matches' : 'Shuffle';
    }

    /** Shuffle the lit tracks and select the one it starts on. */
    async _shuffle() {
        const pool = this._shufflePool;
        if (!pool?.length) return;
        const started = await this.app.playLocalTrack(null, pool, graphShuffleContext(this._view(), this.app._route), { shuffle: true });
        const id = started && this._active ? this._playingId() : null;
        if (id) this.focusOn(id);
    }

    /** A node plays as a table row does: its lit tracks, or a track through the lit ones, in table order. */
    async playNode(node) {
        if (VIEWER || !node?.id) return false;
        const app = this.app;
        const { start, queue } = nodeQueue({
            node, lit: this._litTracks || [], tracks: this._tracks || [], playable: isLocalPlayable,
            order: (list) => (app._sortLikeTable ? app._sortLikeTable(list) : list),
        });
        if (!start) return false;
        const name = node.name || (node.type === 'track' ? start.title : '') || 'Graph';
        return app.playLocalTrack(start, queue, focusPlayContext({ ...node, name }));
    }

    /**
     * Scope (≡, `s`): the selection with the rings it shows becomes the scope, in the filter
     * and the route (graph/scope.js). The view, the selection and the camera stay; the rest
     * dims as unlit nodes do, and the table lists the same tracks. Collection only.
     */
    async scopeHere() {
        const f = this.focus, app = this.app, engine = app.filterEngine;
        if (VIEWER || this.discover || !this._active || !f || f.outside || !engine || !this.atlas) return false;
        const { ids } = scopeTracks({ atlas: this.atlas, payload: f.payload, depth: this.selDepth, show: this.show, tracks: (await app._allTracks?.()) || this._tracks || [] });
        if (!ids.length) { app.showNotification?.('No tracks here', 'info'); return false; }
        const scope = { id: f.id, depth: this.selDepth, name: f.name || '', ids };
        rememberScope(scope);
        engine.setScope(scope);
        await this._go({ focus: f.id });
        return true;
    }

    // ---- the mirror (graph-mirror.js) ----

    /** A node's map colour, for its rows marked in the table; null off the map. */
    nodeColour(id) {
        const n = this.atlas?.byId.get(id) || (this.focus?.id === id && this.focus.host ? this.atlas?.byId.get(this.focus.host) : null);
        return (n && this.fills?.[n.i]) || null;
    }

    /** Rows selected in the table light these nodes (their artists) until the map's own selection moves. */
    setRows(ids) {
        this.rowsLit = ids?.size ? ids : null;
        this._rowsFit = Boolean(this.rowsLit);
    }

    /** Keyboard focus to a node's name on the map, else the selection bar's name, once it is drawn. */
    keyFocus(id, tries = 12) {
        if (!this._active || !id) return;
        const hit = [...(this.host?.querySelectorAll('.atlas-hit') || [])].find((b) => b.dataset.id === id)
            || (this.focus?.id === id ? this.host?.querySelector('.ab-now') : null);
        if (hit) { hit.focus({ preventScroll: true }); return; }
        if (tries > 0) setTimeout(() => this.keyFocus(id, tries - 1), 50);
    }

    /** Is the scope the selection at its depth (Scope pressed)? */
    scoped() {
        const s = this.app.filterEngine?.state?.scope;
        return Boolean(s?.id && this.focus && s.id === this.focus.id && s.depth === this.selDepth);
    }

    /** The node a hit plays: an album or track dot, the playing ring's track, or the node. */
    _hitNode(hit) {
        if (!hit) return null;
        if (hit.kind === 'album') return hit.album?.outside ? null : hit.album;
        if (hit.kind === 'ring') return hit.id ? { id: hit.id, type: 'track' } : null;
        return hit.kind === 'node' ? hit : null;
    }

    /** What the row keys and the row menu act on: the focused name, else the hovered node, else the selection. */
    actionTarget() {
        // The viewer acts on nothing.
        if (VIEWER || !this._active || !this.atlas) return null;
        const b = this._keyFocus();
        let node = null;
        if (b && !b.dataset.outside) node = this._lastView?.byId.get(b.dataset.id) || null;
        node ||= this._hitNode(this.hover) || (this.focus?.outside ? null : this.focus);
        if (!node?.id) return null;
        const ids = nodeTracks({ node, lit: this._litTracks || [], tracks: this._tracks || [] }).map((t) => String(t.id));
        return { node, ids };
    }

    _kindLit() {
        this.lit = this._litByKind && this.atlas ? litForTab(this._view(), this._litBase, this.atlas.nodes) : this._litBase;
        // With no ☆ and no filter, Artists, Labels and Tags light their whole kind: that lit set holds nothing back.
        this._litIsDefault = !this._litBase;
    }

    /** "Nothing matches" beside the graph's controls, when ☆ and the filter light no node. */
    _syncLitNote() {
        const el = this.el?.('atlasLit');
        if (!el) return;
        const none = nothingLit(this.lit, this.atlas);
        // A focus with no lit neighbour stays bright on its own.
        const alone = !none && Boolean(this.lit && this.focus?.hood.size) && ![...this.focus.hood.keys()].some((id) => this.lit.has(id));
        const off = this._litFailed || none || alone ? 0 : this._offScreen();
        el.textContent = this._litFailed ? 'Favorites unavailable' : alone ? 'Nothing matches near this.' : none ? 'Nothing matches' : `${off.toLocaleString()} more off screen`;
        el.hidden = !(this._litFailed || none || alone || off);
    }

    /** The focus, what holds it, and its neighbourhood: drawn as ever, lit or not. */
    _inFocus(id) {
        const f = this.focus;
        return Boolean(f) && (id === f.id || id === f.host || f.hood.has(id));
    }

    // ---- Discover ----

    /** The Collection | Discover toggle: active mode, and links that keep the focus. */
    _syncSwitch(route) {
        this.app.goList?.markActive(route?.focus || null);
        // The visualizer travels the Collection graph only.
        const viz = this.el?.('atlasViz');
        if (viz) viz.hidden = Boolean(this.reduced || this.discover);
        const sw = this.el?.('atlasSwitch');
        if (!sw) return;
        // The other graph opens on the same focus, ☆ and filter.
        for (const a of sw.querySelectorAll('a')) {
            const on = a.dataset.mode === this.mode;
            a.classList.toggle('is-active', on);
            a.setAttribute('aria-selected', String(on));
            const toDiscover = a.dataset.mode === 'discover';
            a.href = buildRoute(toDiscover ? { view: 'discover', focus: route?.focus, fav: route?.fav, filter: route?.filter }
                : { view: this.app._graphTabs?.last || 'collection', graph: true, focus: route?.focus, fav: route?.fav, filter: route?.filter });
        }
    }

    /**
     * No focus: Collection is the whole map, even, nothing picked out; Discover keeps its
     * recommendations home (recent favorites and the music round them you don't own).
     */
    async _loadHome(alive) {
        if (!this.discover) {
            this.homeGraph = null;
            this.layer.reset(); this._note(null); this.layer.status(null);
            this._retarget();
            if (this._keptCam) this._keptCam = false;
            else if (!this._placed) this.home(false);
            // Rows from the table: the camera fits their artists, once.
            if (this._rowsFit) { this._rowsFit = false; this.home(); }
            this._placed = true;
            return;
        }
        const payload = await this.data.discover({ per: ATLAS.hoodSteps[0].outside, isAlive: alive });
        if (!payload || !alive()) return;
        this.homeGraph = payload;
        this._retarget();
        this.layer.setAnchors(payload);
        this.app.discoverPanel?.update(this);
        const anchors = (payload.anchors || []).filter((a) => this.atlas.byId.has(a.id));
        const empty = anchorsNote(anchors);
        if (empty) { this._note(empty); this.layer.status(null); }
        else {
            this._note(null);
            this.layer.status(this.layer.line());
            const missing = payload.discogs?.missing || [];
            if (!VIEWER && missing.length) this.app.discogsQueue?.focus?.({ focus: missing });
        }
        // The opening fits the home; a cleared selection keeps the camera, as does the Collection | Discover toggle.
        if (this._keptCam) this._keptCam = false;
        else if (!this._placed) this.home(false);
        this._placed = true;
        this._labels = null; this._domPending = true;
        this._dirty();
    }

    /**
     * The next track plays: a selection on the one that just played moves to it, so a
     * shuffle walks the graph. Anything else selected stays. The move replaces the history
     * entry, and Info stays open or closed as it was.
     */
    _followPlaying(from, to) {
        if (!this._active || from === 'null' || to === 'null' || !from || !to) return;
        if ((this.route?.focus || this.focus?.id) !== from) return;
        this.wantPanel = Boolean(this.app.panel?.isOpen);
        this._go({ focus: to }, { replace: true });
    }

    _playingId() {
        const t = this.app.audioPlayer?.currentTrack;
        return t?.id != null ? `track:${t.id}` : null;
    }

    /** The pulsing ring's artist ({ id }), while a track plays whose artist is on the atlas. */
    _ring() {
        const player = this.app.audioPlayer;
        return playingRing({ isPlaying: Boolean(player?.isPlaying), track: player?.currentTrack, atlas: this.atlas });
    }

    /** The Filter's subgenre swatches for this atlas (lower-case facet value → colour). */
    swatches() {
        if (this._swatchesFor !== this.atlas) { this._swatchesFor = this.atlas; this._swatches = subgenreSwatches(this.atlas); }
        return this._swatches;
    }

    _track(id) { return (this.app._tracksCache || []).find((t) => String(t.id) === String(id)) || null; }

    /** The selection's rings at its depth: the focus payload's neighbours, then their strongest links. */
    _refreshRing() {
        const f = this.focus, atlas = this.atlas;
        if (!f || !atlas) { this.ring = null; return this._retarget(); }
        this.ring = selectionRing({ atlas, focus: f, payload: f.payload, linkedIds: f.linkedIds, depth: this.selDepth, at: f.pos });
        this._retarget();
        this.bar.render();
    }

    /**
     * What keeps full strength while the rest dims (atlas indices), or null when nothing is
     * picked out: a selection's rings, what holds it and what it links to (and Discover's
     * bright ids); else ☆, the filter and search; else the Favorites home.
     */
    _keepIds() {
        const atlas = this.atlas, f = this.focus, out = new Set();
        const add = (ids) => { for (const id of ids || []) { const n = atlas.byId.get(id); if (n) out.add(n.i); } };
        if (!f && this.rowsLit) { add(this.rowsLit); if (out.size) return out; }
        if (f) {
            for (const i of this.ring?.set || []) out.add(i);
            add([f.id, f.host, ...f.linkedIds, ...(this.layer.bright?.lit || []), ...(this.layer.bright?.near || [])]);
            return out;
        }
        if (this.lit && !this._litIsDefault && !this.discover) { add(this.lit); return out; }
        add(homeNodeIds(this.homeGraph, this.lit) || []);
        if (this.discover) add([...(this.layer.bright?.lit || []), ...(this.layer.bright?.near || [])]);
        return out.size ? out : null;
    }

    /**
     * Show what the step, the rings and the lit set pick, in one short ease: new nodes grow in
     * where they belong, leaving ones fade, and nodes that make room ease once, starting from the
     * middle of the view outward (a selection's rings in order). Reduced motion snaps.
     */
    _retarget(animate = !this.reduced) {
        const atlas = this.atlas;
        if (!atlas || !this.settle) return;
        this._keep = this._keepIds();
        const { rank, counts, layouts } = atlas.steps, k = Math.max(0, Math.min(counts.length - 1, this.detail));
        const want = wanted({ rank, limit: counts[k], ring: this.ring?.set, lit: this._keep, weight: (i) => atlas.nodes[i].weight || 0 });
        const cam = this.cam, reach = Math.hypot(this.W, this.H) / 2 || 1;
        const far = (i) => {
            if (this.ring?.depth.has(i)) return this.ring.depth.get(i) / 3;
            if (!cam) return 0;
            const p = toScreen(cam, this.W, this.H, atlas.nodes[i].x, atlas.nodes[i].y);
            return Math.min(1, Math.hypot(p.x - this.W / 2, p.y - this.H / 2) / reach);
        };
        this.settle.retarget({ want, layout: layouts[k], home: (i) => [atlas.nodes[i].x, atlas.nodes[i].y], radius: (i) => this._roomR(i),
            now: performance.now(), delay: (i) => ATLAS.waveMs * far(i), animate, slack: this._slack() });
        this._makeRoom(animate);
        this._syncSteps();
        this._labels = null; this._domPending = true;
        this._dirty();
    }

    // ---- camera ----

    _fitExtent() {
        const keep = this.focus ? null : this._keepIds();
        if (!keep?.size) return this.atlas.extent;
        return extentOf([...keep].map((i) => this.atlas.nodes[i]));
    }

    /** The whole-map fit scale: zoom (depth, every threshold) is measured against it. */
    _mapK() { return fitCamera(this.atlas.extent, this.W, this.H).k; }

    /** Home's camera: the shown set fitted, never closer than `fitZoomMax` × the whole map (one lit node would fill the screen). */
    _homeCamera(extent = this._fitExtent()) {
        const fit = fitCamera(extent, this.W, this.H);
        const k = Math.min(this.mapK * ATLAS.fitZoomMax, Math.max(this.mapK * ATLAS.zoomMin, fit.k));
        if (k === fit.k) return fit;
        const shift = (ATLAS.fitInsetTop - ATLAS.fitInsetBottom) / 2;
        return { cx: fit.cx, cy: fit.cy + shift / fit.k - shift / k, k };
    }

    home(ease = true) {
        if (!this.atlas) return;
        this.mapK = this._mapK();
        // Home frames its own set (the lit set, the Favorites home).
        const fit = this._homeCamera();
        // The Collection | Discover toggle keeps the camera: the other mode's view picks it up.
        const handoff = this._handoff;
        this._handoff = null;
        if (handoff && performance.now() - handoff.at < HANDOFF_MS) { this.cam = resizeCamera(handoff.cam, handoff.mapK, this.mapK); this._refit = handoff.refit; this._keptCam = true; this._settled(); return; }
        if (ease && this.cam) this._ease(fit); else { this.motion.stop(); this.cam = fit; this._settled(); }
        this._refit = 'home';
    }

    /** Enter in the search field with nothing picked: the camera fits the lit nodes. Esc's restoreCamera puts it back. */
    fitLit() {
        const atlas = this.atlas;
        if (!atlas || !this.lit || this._litIsDefault) return false;
        const nodes = [...this.lit].map((id) => atlas.byId.get(id)).filter(Boolean);
        if (!nodes.length) return false;
        this._preFit ||= this.cam ? { ...this.cam } : null;
        this.mapK = this._mapK();
        this._ease(this._homeCamera(extentOf(nodes)));
        return true;
    }

    /** The camera back to where it was before fitLit, if it moved. */
    restoreCamera() {
        const cam = this._preFit;
        this._preFit = null;
        if (cam && this.atlas) this._ease(cam);
    }

    /** Lit nodes the map draws outside the view, while typed text lights them (the camera does not follow typing). */
    _offScreen() {
        const atlas = this.atlas, s = this.settle, cam = this.cam;
        if (!atlas || !cam || !this.lit || this._litIsDefault || !this.app.filterEngine?.state?.search) return 0;
        let n = 0;
        for (const id of this.lit) {
            const node = atlas.byId.get(id);
            if (!node || (s && !s.want[node.i])) continue;
            const live = s?.live[node.i];
            const p = toScreen(cam, this.W, this.H, live ? s.lx[node.i] : node.x, live ? s.ly[node.i] : node.y);
            if (p.x < 0 || p.y < 0 || p.x > this.W || p.y > this.H) n++;
        }
        return n;
    }

    /**
     * The selection and its shown ring nodes where they settle, in map units, each with its
     * reach for the camera's box (ATLAS.followReach × its whole-map radius). An album or track
     * counts at its soft dot beside its artist, anything else off the atlas at its placed spot.
     */
    _ringPoints() {
        const f = this.focus, atlas = this.atlas, s = this.settle, out = [];
        if (!f || !atlas || !s) return out;
        const refK = atlas.steps?.refK || this.mapK;
        for (const i of this.ring?.set || []) {
            if (!s.live[i] || !s.want[i]) continue;
            out.push({ x: s.lx[i], y: s.ly[i], r: ATLAS.followReach * sizePx(atlas.nodes[i].weight) / refK });
        }
        if (f.pos && !atlas.byId.has(f.id)) { const at = this._softSpot() || f.pos; out.push({ x: at.x, y: at.y, r: ATLAS.followReach * sizePx(1) / refK }); }
        return out;
    }

    /** The camera follows the selection: it glides to fit it and every shown ring node (ringCamera). */
    _follow() {
        const cam = this._ringsCamera();
        if (!cam) return;
        this._refit = null;
        this._ease(cam);
    }

    /** The camera that fits the selection and its shown rings, or null. */
    _ringsCamera() {
        // On a phone, Info covers the bottom (a sheet) or the right (a side panel): frame the rings in the rest.
        const inset = this._panelInset();
        const cam = this.atlas && this.mapK ? ringCamera(this._ringPoints(), { W: this.W - inset.right, H: this.H - inset.bottom, fitK: this.mapK }) : null;
        return cam ? this._clampCam(shiftForPanel(cam, inset)) : null;
    }

    /** A node's spot on the map now (where it settled; an album or track selection at its soft dot, anything else off the atlas at its placed spot), or null. */
    _nodeSpot(id) {
        const i = this.atlas?.byId.get(id)?.i, s = this.settle;
        if (i != null && s?.live[i]) return { x: s.lx[i], y: s.ly[i] };
        if (i != null) return { x: this.atlas.nodes[i].x, y: this.atlas.nodes[i].y };
        if (this.focus?.id !== id || !this.focus.pos) return null;
        const at = this._softSpot() || this.focus.pos;
        return { x: at.x, y: at.y };
    }

    /** A close view centred on a node, at `k` (never past zoomMax), clear of Info on a phone. */
    _closeCamera(id, k) {
        const at = this._nodeSpot(id);
        if (!at || !this.mapK) return null;
        const inset = this._panelInset();
        return this._clampCam(shiftForPanel({ cx: at.x, cy: at.y, k: Math.min(this.mapK * ATLAS.zoomMax, k) }, inset));
    }

    /** Info's node up close: what Info shows last (its top entry), when it is on the map. */
    _infoCamera() {
        const history = this.app.panel?.kind ? this.app.panel.history : null;
        const id = infoNodeId(history?.[history.length - 1], (x) => this.atlas.byId.has(x) || x === this.focus?.id);
        return id ? this._closeCamera(id, this.mapK * ATLAS.closeZoom) : null;
    }

    /**
     * The re-centre button and 0: the selection and its rings, then the whole map, then
     * Info's node up close, and round again; from anywhere else the first of them there is.
     */
    recenter() {
        if (!this.atlas || !this.cam) return;
        const stops = [
            this.focus && { stage: 'rings', cam: this._ringsCamera() },
            { stage: 'whole', cam: fitCamera(this.atlas.extent, this.W, this.H) },
            { stage: 'info', cam: this._infoCamera() },
        ].filter((s) => s?.cam);
        const next = nextRecenter(stops, this.motion.anim?.to || this.cam);
        if (!next) return;
        this._ease(next.cam);
        this._refit = next.stage === 'whole' ? 'whole' : null;
    }

    /** A double-click: zoom in about the pointer (⇧ or ⌥: out); on a node, a close view centred on it. */
    _doubleClick(p, hit, out = false) {
        if (!this.cam || !this.atlas) return;
        this._refit = null;
        const from = this.motion.anim?.to || this.cam;
        if (!out && hit?.kind === 'node' && hit.id) {
            // A first click that selected it glides to its rings when the focus lands: this view wins.
            if (hit.id !== this.focus?.id) this._closeUpId = hit.id;
            const cam = this._closeCamera(hit.id, Math.max(from.k * ATLAS.dblZoom, this.mapK * ATLAS.albumZoom));
            if (cam) return this._ease(cam);
        }
        this._ease(this._clampCam(zoomAt(from, this.mapK, out ? 1 / ATLAS.dblZoom : ATLAS.dblZoom, p.x, p.y, this.W, this.H)));
    }

    /** Home: the camera glides out to fit the entire map; a selection, its rings and lines stay. */
    wholeMap() {
        if (!this.atlas || !this.cam) return;
        this._ease(fitCamera(this.atlas.extent, this.W, this.H));
        this._refit = 'whole';
    }

    /** Every programmatic camera move: one shared ease (instant under reduced motion). */
    _ease(target) {
        if (!target) return;
        if (!this.cam) { this.cam = target; this._settled(); return; }
        this.motion.easeTo(this.cam, target, performance.now());
        this._moving();
    }

    /** The wheel or a trackpad pinch: an eased zoom about the cursor. */
    _zoom(factor, sx = this.W / 2, sy = this.H / 2) {
        this._refit = null;
        this.motion.wheel(this.cam, factor, sx, sy, { mapK: this.mapK, W: this.W, H: this.H, now: performance.now() });
        this._moving();
    }

    /** A trackpad scroll: the map moves with the fingers, by screen px. */
    _panBy(dx, dy) {
        if (!this.cam) return;
        this.motion.stop();
        this._refit = null;
        this.cam = this._clampCam({ ...this.cam, cx: this.cam.cx + dx / this.cam.k, cy: this.cam.cy + dy / this.cam.k });
        this._moving();
    }

    /** [ and ]: a glide by `zoomStep` about the middle of the view. */
    _zoomBy(dir) {
        if (!this.cam || !this.atlas) return;
        this._refit = null;
        const from = this.motion.anim?.to || this.cam;
        this._ease(zoomAt(from, this.mapK, Math.pow(ATLAS.zoomStep, dir), this.W / 2, this.H / 2, this.W, this.H));
    }

    /** Never pan past the map (clampCamera): at the whole map it stays centred. */
    /** What Info covers of the map on a phone, read now (it changes off the graph too). */
    _panelInset() { return PHONE ? panelInset() : NO_PANEL; }

    _clampCam(cam) {
        const inset = this._panelInset();
        return this.atlas ? clampCamera(cam, this.atlas.extent, this.W, this.H, { bottom: ATLAS.fitInsetBottom + inset.bottom, right: inset.right }) : cam;
    }

    /** One frame of camera motion and a drag; true while either still moves. */
    _stepMotion(now) {
        let moving = false;
        if (this.motion.active) {
            this.cam = this.motion.step(now, this.cam, { mapK: this.mapK, W: this.W, H: this.H });
            if (!this.motion.active && !this._drag) this._settled();
            moving = this.motion.active;
        }
        if (this._drag?.started) {
            this.tug.step(1 / this.cam.k);
            moving = true;
        }
        this.cam = this._clampCam(this.cam);
        return moving;
    }

    /** Anything moving that the name targets should wait for. */
    _busy() { return this.motion.active || Boolean(this._drag) || Boolean(this.settle?.movers.size); }

    /** The camera moved: hide the DOM layer until it settles, then re-place names. */
    _moving() {
        this.el('atlasDom')?.classList.add('is-moving');
        this.el('atlasTip').hidden = true; this._tipNode = null;
        clearTimeout(this._settleTimer);
        this._settleTimer = setTimeout(() => { if (!this._busy()) this._settled(); }, 140);
        this._dirty();
    }

    _settled() {
        this._labels = null; this._chromeBoxes = null; // read again on the next frame
        this._dirty();
        this._domPending = true;
        this._syncLitNote();
    }

    _resize() {
        // Layout size, not the on-screen box: on a phone drawn sideways the box's width and height swap.
        const box = this.el('atlas');
        if (!box) return;
        // A size of zero is the host hidden (a crossfade, the table on screen), not a real size: keep the last.
        if (this.W && (!box.clientWidth || !box.clientHeight)) return;
        const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
        this.W = Math.max(1, box.clientWidth); this.H = Math.max(1, box.clientHeight); this.dpr = dpr;
        this.canvas.width = this.W * dpr; this.canvas.height = this.H * dpr;
        this.canvas.style.width = `${this.W}px`; this.canvas.style.height = `${this.H}px`;
        if (this.atlas) {
            // Zoom stays relative to the whole-map fit, including an ease under way.
            const oldMapK = this.mapK;
            this.mapK = this._mapK();
            // A fitted map refits (the player appearing, full screen); otherwise z holds.
            // A glide under way keeps going, to the resized target.
            const refit = this._refit === 'whole' ? fitCamera(this.atlas.extent, this.W, this.H) : this._refit === 'home' ? this._homeCamera() : null;
            const anim = this.motion.anim;
            if (anim) { anim.from = resizeCamera(anim.from, oldMapK, this.mapK); anim.to = refit || resizeCamera(anim.to, oldMapK, this.mapK); }
            this.motion.rescale(oldMapK, this.mapK);
            if (this.cam) this.cam = (!anim && refit) || resizeCamera(this.cam, oldMapK, this.mapK);
        }
        this._settled();
    }

    // ---- frame ----

    _dirty() {
        this._full = true;
        this._pulse();
    }

    /** A frame for the playing ring's pulse alone: the last full frame is redrawn from its copy. */
    _pulse() {
        if (this._queued || !this._active) return;
        this._queued = true;
        raf((now) => { this._queued = false; if (this._active) this._frame(now ?? performance.now()); });
    }

    // ---- DOM layer: name hit targets, keyboard focus ----

    _buildDom(view = null) {
        const dom = this.el('atlasDom');
        if (!dom) return;
        dom.classList.remove('is-moving');
        if (!this.atlas || !this.cam) { dom.innerHTML = ''; this._domTargets = []; return; }
        view ||= this._visible(performance.now());
        // A name the keys moved to keeps its focus through the rebuild.
        const kf = this._keyFocus(), kept = kf ? kf.dataset?.id || kf.dataset?.outside : null;
        const targets = [];
        const f = this.focus;
        // Tab walks the selection, then every ring in order.
        const rings = f && this.ring ? [...this.ring.depth].filter(([, d]) => d > 0).sort((a, b) => a[1] - b[1]).map(([i]) => this.atlas.nodes[i].id) : [];
        // Each target covers the node and, when it is drawn, its name.
        const button = (it, { tab = false, name } = {}) => {
            const r = Math.max(8, (it.r || 0) + 3), box = this._labels?.get(it.id);
            let x0 = it.sx - r, x1 = it.sx + r, y0 = it.sy - r, y1 = it.sy + r;
            if (box) { x0 = Math.min(x0, box.x0); x1 = Math.max(x1, box.x1); y0 = Math.min(y0, box.y0); y1 = Math.max(y1, box.y1); }
            const why = f ? whyLine(f.hood.get(it.id)?.reasons) : '';
            const label = `${name || it.name}, ${it.type}${why ? `, ${why}` : ''}`;
            const style = `left:${Math.round(x0)}px;top:${Math.round(y0)}px;width:${Math.round(x1 - x0)}px;height:${Math.round(y1 - y0)}px`;
            targets.push({ id: it.id, x: it.sx, y: it.sy });
            return `<button type="button" class="atlas-hit" data-hint="off" data-id="${escapeHtml(it.id)}" style="${style}" tabindex="${tab ? 0 : -1}" aria-label="${escapeHtml(label)}"></button>`;
        };
        const parts = [];
        if (f) {
            const own = view.byId.get(f.id) || (view.focusScreen && { id: f.id, type: f.type, name: f.name, sx: view.focusScreen.x, sy: view.focusScreen.y, r: view.focusScreen.r });
            if (own) parts.push(button(own, { tab: true }));
            for (const id of rings) { const it = view.byId.get(id); if (it) parts.push(button(it, { tab: true })); }
        }
        for (const a of this.homeGraph?.anchors || []) { const it = view.byId.get(a.id); if (it) parts.push(button(it, { tab: true })); }
        if (this.discover) {
            for (const o of [...this.layer.screen].sort((a, b) => (b.node.rank ?? b.node.score ?? 0) - (a.node.rank ?? a.node.score ?? 0))) {
                const label = `${o.name}, ${(OUTSIDE_TYPE_WORD[o.type] || '').toLowerCase()}, not in your library`;
                const r = Math.max(8, o.r + 3), box = this._labels?.get(o.id);
                let x0 = o.sx - r, x1 = o.sx + r, y0 = o.sy - r, y1 = o.sy + r;
                if (box) { x0 = Math.min(x0, box.x0); x1 = Math.max(x1, box.x1); y0 = Math.min(y0, box.y0); y1 = Math.max(y1, box.y1); }
                targets.push({ id: o.id, outside: true, x: o.sx, y: o.sy });
                parts.push(`<button type="button" class="atlas-hit" data-hint="off" data-outside="${escapeHtml(o.id)}" style="left:${Math.round(x0)}px;top:${Math.round(y0)}px;width:${Math.round(x1 - x0)}px;height:${Math.round(y1 - y0)}px" tabindex="0" aria-label="${escapeHtml(label)}"></button>`);
            }
        }
        for (const id of (this._labels || new Map()).keys()) {
            const it = view.byId.get(id);
            if (it && !rings.includes(id) && id !== f?.id && !(this.homeGraph?.anchors || []).some((a) => a.id === id)) parts.push(button(it));
        }
        dom.innerHTML = parts.join('');
        this._domTargets = targets;
        if (kept) [...dom.querySelectorAll('.atlas-hit')].find((b) => (b.dataset.id || b.dataset.outside) === kept)?.focus({ preventScroll: true });
    }

    /** The name the keys moved to; a name a click focused (Chrome focuses buttons on click) is not one. */
    _keyFocus() {
        const dom = this.el('atlasDom'), b = document.activeElement;
        if (!dom || !b || !dom.contains(b)) return null;
        return b.matches?.(':focus-visible') === false ? null : b;
    }

    /** An arrow key: focus the nearest name that way, from the focused name, the hovered node, the selection or the centre. */
    _arrow(key) {
        const dom = this.el('atlasDom'), targets = this._domTargets || [];
        if (!dom || !targets.length) return false;
        const b = this._keyFocus();
        const at = (id) => targets.find((t) => t.id === id);
        const from = (b && at(b.dataset.id || b.dataset.outside))
            || (this.hover && { id: this.hover.id, x: this.hover.sx, y: this.hover.sy })
            || (this.focus && at(this.focus.id))
            || { id: null, x: this.W / 2, y: this.H / 2 };
        const id = arrowTarget(from, targets.filter((t) => t.id !== from.id), key);
        const next = id && [...dom.querySelectorAll('.atlas-hit')].find((x) => (x.dataset.id || x.dataset.outside) === id);
        if (!next) return false;
        next.focus({ preventScroll: true });
        return true;
    }

    // ---- hover card ----

    /** The hover card; in `ask` on touch, the tapped node's (`_tipNode`) with its ⓘ, which peeks. */
    _showTip(target) {
        const tip = this.el('atlasTip');
        const peekable = !target && this._tipNode;
        if (peekable) target = this._tipNode;
        if (!target) { tip.hidden = true; return; }
        const f = this.focus;
        const outside = target.kind === 'outside' ? target.node : target.kind === 'album' && target.album.outside ? target.album : null;
        // Only the first ring has reasons: only it gets the why line.
        const why = outside ? whyLine(outside.reasons) : f && target.id !== f.id ? whyLine(f.hood.get(target.id)?.reasons) : '';
        const type = outside ? OUTSIDE_TYPE_WORD[outside.type] || '' : TYPE_WORD[target.type] || '';
        const ask = peekable || (this._tipNode && target.id === this._tipNode.id) ? '<button type="button" class="atlas-tip-peek" data-peek aria-label="Info">ⓘ</button>' : '';
        const html = `<div class="atlas-tip-name">${escapeHtml(target.name)}${type ? ` <span>${escapeHtml(type)}</span>` : ''}${ask}</div>${why ? `<div class="atlas-tip-why">${escapeHtml(why)}</div>` : ''}`;
        // Drawn again only when it changes: a tap on its ⓘ must find the button it pressed.
        if (tip.innerHTML !== html) tip.innerHTML = html;
        tip.classList.toggle('has-peek', Boolean(ask));
        tip.hidden = false;
        const left = Math.min(target.sx + 12, this.W - 270), top = Math.max(8, target.sy - 10);
        tip.style.left = `${Math.max(8, left)}px`; tip.style.top = `${top}px`;
    }

    // ---- hit-testing ----

    _hitAt(sx, sy) {
        if (!this.atlas || !this.cam) return null;
        for (const s of [...(this._albumSpots || [])].reverse()) {
            if (Math.hypot(s.x - sx, s.y - sy) <= s.r + 4) return { kind: 'album', album: s.album, id: s.album.id, type: s.album.type || 'album', name: s.album.name, sx: s.x, sy: s.y, r: s.r };
        }
        if (this.discover) { const o = this.layer.hitAt(sx, sy); if (o) return o; }
        const view = this._lastView || this._visible(performance.now());
        // Just outside the playing artist's mark, its ring: the playing track.
        const ring = this._ring(), ringed = ring && view.byId.get(ring.id);
        if (ringed) {
            const d = Math.hypot(ringed.sx - sx, ringed.sy - sy);
            if (d > ringed.r + ATLAS.ringHitInner && d <= ringed.r + ATLAS.ringHitOuter) return { kind: 'ring', id: this._playingId(), sx: ringed.sx, sy: ringed.sy };
        }
        // An off-atlas selection's soft dot counts as the selection.
        const fs = view.focusScreen, f = this.focus;
        const soft = f && fs && !fs.item ? { id: f.id, type: f.type, name: f.name, sx: fs.x, sy: fs.y, r: fs.r } : null;
        // Ranked, then nearest: the selection and its rings, then the named, then the rest.
        const named = new Set((this._placedNames || []).map((p) => p.id));
        const tier = (c) => (c === soft || (f && (c.id === f.id || c.id === f.host || this.ring?.set.has(c.i))) ? 0 : named.has(c.id) ? 1 : 2);
        const hit = pickNearest(soft ? [...view.list, soft] : view.list, sx, sy, { pad: ATLAS.hitPad, minPx: ATLAS.hitMinPx, tier });
        if (hit && tier(hit) === 0) return { kind: 'node', ...hit };
        // A shown name picks its node.
        for (const p of this._placedNames || []) {
            const b = p.box;
            if (sx < b.x0 || sx > b.x1 || sy < b.y0 || sy > b.y1) continue;
            const it = view.byId.get(p.id) || (soft && p.id === soft.id ? soft : null);
            if (it) return { kind: 'node', ...it };
        }
        return hit ? { kind: 'node', ...hit } : null;
    }

    /**
     * A selection's album or track dot clicked: it becomes the selection. The viewer holds no
     * track's own map (its snapshot leaves them out), so there a track opens in Info instead.
     */
    _satellite(item) {
        if (VIEWER && item.type === 'track') {
            const track = this._track(String(item.id).replace(/^track:/, ''));
            if (track) this.app.panel?.open(track, null, { focus: false });
            return undefined;
        }
        return this.focusOn(item.id);
    }

    _setHover(hit) {
        const before = this.hover?.id;
        this.hover = hit && (hit.kind === 'node' || hit.kind === 'outside' || hit.kind === 'album') ? hit : null;
        this.canvas.style.cursor = hit ? 'pointer' : '';
        this._showTip(this.hover);
        if (before !== this.hover?.id) { this._labels = null; this._dirty(); }
    }

    // ---- actions ----

    /** A click on what `hit` is; `how` is { alt, touch }: an Alt-click, a tap. A node may peek instead (peekClick). */
    _activate(hit, how = {}) {
        if (!hit) return;
        const tipped = this._tipNode;
        this._tipNode = null;
        if (hit.kind === 'node' && hit.id) {
            const act = peekClick({ hitId: hit.id, selectedId: this.focus?.id, peekId: this.peek?.id, tipId: tipped?.id, infoShowing: this._infoShowing(), mode: readPeekMode(), alt: how.alt, touch: how.touch });
            if (act === 'peek') return this.peekAt(hit);
            if (act === 'tip') { this._tipNode = hit; return this._showTip(hit); }
            // A step ends a peek at once; Info follows the selection when it lands.
            if (act === 'select' && this.peek) { this.peek = null; this._settled(); }
        }
        if (tipped) this._showTip(this.hover);
        // Any click to another node is a step on the map: the selection bar's trail keeps it.
        if (hit.id && hit.id !== this.focus?.id) this.bar.markStep(this.focus?.id);
        if (hit.kind === 'outside') return this.layer.walkTo(hit);
        if (hit.kind === 'ring') return hit.id ? this.focusOn(hit.id) : undefined;
        if (hit.kind === 'album') return hit.album.outside ? this.layer.open(hit.album) : this._satellite(hit.album);
        if (clickIntent(hit.id, this.focus?.id) === 'info') return this.showInfo();
        return this.focusOn(hit.id);
    }

    // ---- wiring ----

    _on(target, type, fn, opts) { target.addEventListener(type, fn, opts); this._listeners.push([target, type, fn, opts]); }

    _wire() {
        const root = this.el('atlas');
        this._wirePointer(root);
        this._wireDom();
        this._wireControls();
        this._wireUpdates();
        if (globalThis.ResizeObserver) { this.resizeObserver = new ResizeObserver(() => { this._resize(); this._dirty(); }); this.resizeObserver.observe(root); }
        if (PHONE) {
            // Info's sheet or side panel settled at a new size: frame the selection in what is left.
            // A peek keeps the camera where it is.
            this._on(document, 'phone-sheet', () => { if (this.focus && this.cam && !this.peek) this._follow(); });
            this._on(document, 'phone-back', () => this._syncBack());
            this._syncBack();
        }
    }

    /**
     * A pinch or a mouse wheel zooms, a trackpad scroll pans; drag empty ground to pan (a flick coasts), a node to pull it and
     * its links; hover; click to select or clear, double-click a node to play it (elsewhere, to zoom in); right-click a node for its menu; + = − for more or
     * less, [ ] to zoom, 0 to re-centre, Home for the whole map, and p for the playing track;
     * arrows move between names, Space on one does what a click does, Enter what a double-click does.
     */
    _wirePointer(root) {
        const local = (e) => localPoint(e, root); // through the sideways turn on a phone
        // Pointer events come from the canvas and the name targets above it; the controls keep their own.
        const onMap = (e) => !e.target.closest?.('.atlas-top, .atlas-corner, .atlas-note, .atlas-tip');
        const pointers = new Map();
        let lastWheel = null, gesture = null;
        this._on(root, 'wheel', (e) => {
            if (!this.cam || !onMap(e)) return;
            e.preventDefault();
            // Safari pinches through gesture events; a ctrl-wheel during one is the same pinch.
            if (gesture !== null && e.ctrlKey) return;
            const now = performance.now(), kind = wheelIntent(e, lastWheel, now), unit = e.deltaMode === 1 ? 16 : 1;
            lastWheel = { kind, at: now };
            if (kind === 'pan') return this._panBy(e.deltaX * unit, e.deltaY * unit);
            const p = local(e);
            this._zoom(wheelFactor(e.deltaY * unit, e.ctrlKey), p.x, p.y);
        }, { passive: false });
        // Safari's trackpad pinch (a touch pinch is the pointers' own, below).
        this._on(root, 'gesturestart', (e) => { e.preventDefault(); gesture = 1; });
        this._on(root, 'gesturechange', (e) => {
            e.preventDefault();
            if (!this.cam || gesture === null || pointers.size) return;
            const p = local(e);
            this._zoom(e.scale / gesture, p.x, p.y);
            gesture = e.scale;
        });
        this._on(root, 'gestureend', (e) => { e.preventDefault(); gesture = null; });
        let pinch = null, down = null;
        // A pulled node and what it tugged ease back to their spots on release.
        const endDrag = (drag) => {
            if (drag?.node && drag.started) { this.tug.release(performance.now()); this._settled(); }
        };
        // What is drawn under the pointer wins; a name target counts only off every shape.
        const hitFor = (e, p) => {
            const hit = this._hitAt(p.x, p.y);
            if (hit) return hit;
            const b = e.target.closest?.('.atlas-hit');
            const o = b?.dataset.outside && this.layer.screen.find((x) => x.id === b.dataset.outside);
            if (o) return { kind: 'outside', ...o };
            const it = b && this._lastView?.byId.get(b.dataset.id);
            return it ? { kind: 'node', ...it } : null;
        };
        this._on(root, 'pointerdown', (e) => {
            if (!this.cam || !onMap(e) || e.button > 0) return;
            root.setPointerCapture?.(e.pointerId);
            // Any input takes over from a glide or a coast where it is.
            this.motion.stop();
            pointers.set(e.pointerId, local(e));
            // A second finger makes it a pinch: it can no longer end in a click or a drag.
            if (pointers.size > 1) {
                const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y);
                endDrag(this._drag); this._drag = null; down = null;
                return;
            }
            const p = local(e), hit = hitFor(e, p);
            down = { x: p.x, y: p.y, hit, moved: false };
            this._drag = this._dragFor(hit, p);
        });
        this._on(root, 'pointermove', (e) => {
            const p = local(e);
            if (!pointers.size && !onMap(e)) return;
            if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
            if (pinch && pointers.size === 2) {
                const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
                this._refit = null;
                this.cam = zoomAt(this.cam, this.mapK, d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2, this.W, this.H);
                pinch = d; this._moving(); return;
            }
            const drag = this._drag;
            if (drag && down) {
                if (!down.moved && pastThreshold(down, p)) down.moved = true;
                if (!down.moved) return;
                if (drag.node) { this._dragNode(drag, p); return; }
                this._refit = null;
                this.cam = this._clampCam({ ...drag.cam, cx: drag.cam.cx - (p.x - drag.x) / this.cam.k, cy: drag.cam.cy - (p.y - drag.y) / this.cam.k });
                drag.samples.push({ x: p.x, y: p.y, t: performance.now() });
                if (drag.samples.length > 8) drag.samples.shift();
                this._moving();
                return;
            }
            if (!this._hoverQueued) {
                this._hoverQueued = true;
                raf(() => { this._hoverQueued = false; if (this._active) this._setHover(hitFor(e, p)); });
            }
        });
        const up = (e) => {
            pointers.delete(e.pointerId);
            if (pointers.size < 2) pinch = null;
            if (pointers.size) return;
            // The last finger of a pinch only ends it.
            if (!down) return;
            const drag = this._drag; this._drag = null;
            endDrag(drag);
            if (!down.moved) this._tap(down, e);
            else {
                // A flick keeps the map going, slowing to a stop.
                if (drag?.samples && e.type === 'pointerup') this.motion.flingAt(releaseVelocity(drag.samples, performance.now()), performance.now());
                this._moving();
            }
            down = null;
        };
        this._on(root, 'pointerup', up);
        this._on(root, 'pointercancel', up);
        // Right-click a node: the table row's menu, on its tracks.
        if (!VIEWER) this._on(root, 'contextmenu', (e) => {
            if (!this.cam || !onMap(e)) return;
            const node = this._hitNode(hitFor(e, local(e)));
            if (!node) return;
            const ids = nodeTracks({ node, lit: this._litTracks || [], tracks: this._tracks || [] }).map((t) => String(t.id));
            if (!ids.length) return;
            e.preventDefault();
            this.app._openRowContextMenu?.({ trackIds: ids, x: e.clientX, y: e.clientY, source: 'Graph' });
        });
        this._on(root, 'pointerleave', () => { if (!this._drag) this._setHover(null); });
        this._on(document, 'keydown', (e) => {
            if (!this._active || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
            // Typing, the detail panel and open dialogs keep their keys, as in app.js.
            if (e.target?.closest?.('input,textarea,select,[contenteditable="true"],.detail-panel')) return;
            if (document.querySelector('.bte-open, .tr-open, .enrich-backdrop')) return;
            if (this.bar.key(e)) { e.preventDefault(); return; }
            const act = keyAction(e.key);
            if (act?.whole) { this.wholeMap(); e.preventDefault(); }
            if (act?.recenter) { this.recenter(); e.preventDefault(); }
            if (act?.detail) { if (!e.repeat) this.stepDetail(act.detail); e.preventDefault(); }
            if (act?.zoom) { this._zoomBy(act.zoom); e.preventDefault(); }
            // Arrows and Enter are the map's only with focus on the page or the map, not in a list beside it.
            const here = !e.target || e.target === document.body || e.target === document.documentElement || Boolean(root.contains?.(e.target));
            if (here && e.key.startsWith('Arrow') && !e.shiftKey && this._arrow(e.key)) e.preventDefault();
            // Enter while peeking steps to the peeked node (a name a click focused counts as none).
            if (here && e.key === 'Enter' && this.peek && !e.shiftKey && !this._keyFocus() && !e.target?.closest?.('button:not(.atlas-hit), a, [role="button"]')) { e.preventDefault(); this.stepToPeek(); return; }
            // Enter with no name focused plays the selection.
            if (here && e.key === 'Enter' && !VIEWER && !e.shiftKey && this.focus && !this.focus.outside && !e.target?.closest?.('.atlas-hit, button, a, [role="button"]')) { e.preventDefault(); this.playNode(this.focus); }
            // p: the playing track, while its artist's ring shows.
            if (e.key === 'p' && this._ring()) { const id = this._playingId(); if (id) { this.focusOn(id); e.preventDefault(); } }
        });
    }

    /** What a press starts: pulling a node (not under reduced motion), else a pan. */
    _dragFor(hit, p) {
        if (dragKind(hit, { reduced: this.reduced }) === 'node') {
            const w = toWorld(this.cam, this.W, this.H, p.x, p.y), i = hit.n.i;
            return { node: hit.id, i, hit, gx: w.x - this.settle.x[i], gy: w.y - this.settle.y[i] };
        }
        return { cam: { ...this.cam }, x: p.x, y: p.y, samples: [{ x: p.x, y: p.y, t: performance.now() }] };
    }

    /** A pulled node follows the pointer; its strongest shown links follow a little, and nearby nodes make room. */
    _dragNode(drag, p) {
        if (!drag.started) {
            drag.started = true;
            this.tug.start(drag.i, this._tugLinks(drag.i), performance.now());
            this._setHover(drag.hit);
            this._moving();
        }
        const w = toWorld(this.cam, this.W, this.H, p.x, p.y);
        this.tug.move(w.x - drag.gx, w.y - drag.gy);
        this._dirty();
    }

    /** A node's shown links, strongest first ([j, score]). */
    _tugLinks(i) {
        const s = this.settle, nodes = this.atlas.nodes;
        return [...(this.atlas.adjacency.get(i) || [])].sort((a, b) => b[1] - a[1] || a[0] - b[0])
            .filter(([j]) => s.live[j] && s.want[j] && this.shows(nodes[j].type, nodes[j].id));
    }

    /** The DOM layer's name targets: Enter or Space activates, focus shows the hover card. */
    _wireDom() {
        const dom = this.el('atlasDom');
        this._on(dom, 'keydown', (e) => {
            const b = e.target.closest?.('.atlas-hit');
            if (e.key !== 'Enter' || !b || b.dataset.outside || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
            // A name a click focused, while peeking: Enter steps to the peeked node, as off the names.
            if (this.peek && !this._keyFocus()) { e.preventDefault(); this.stepToPeek(); return; }
            if (VIEWER) return;
            const it = this._lastView?.byId.get(b.dataset.id);
            if (!it) return;
            e.preventDefault();
            this.playNode(it);
        });
        this._on(dom, 'click', (e) => {
            const b = e.target.closest('.atlas-hit');
            if (!b || e.detail > 0) return; // a pointer click was handled on pointerup; this is Enter or Space
            e.preventDefault();
            if (b.dataset.outside) return this.layer.walkTo(this.layer.screen.find((x) => x.id === b.dataset.outside) || this.layer.find(b.dataset.outside));
            const it = this._lastView?.byId.get(b.dataset.id) || { id: b.dataset.id };
            this._activate({ kind: 'node', ...it });
        });
        this._on(dom, 'focusin', (e) => {
            const b = e.target.closest('.atlas-hit');
            if (!b) return;
            const o = b?.dataset.outside && this.layer.screen.find((x) => x.id === b.dataset.outside);
            if (o) return this._setHover({ kind: 'outside', ...o });
            const it = b && (this._lastView || this._visible(performance.now())).byId.get(b.dataset.id);
            if (it) this._setHover({ kind: 'node', ...it });
        });
        this._on(dom, 'focusout', () => this._setHover(null));
    }

    /** Random, re-centre, − and + (more or less), Night sky, Show (in the Filter band), full screen, the sources line's retries and the Collection | Discover toggle. */
    /** The phone's ← chip shows when there is an earlier in-app page. */
    _syncBack() { const b = this.el?.('atlasBack'); if (b) b.hidden = !canGoBack(); }

    _wireControls() {
        if (this.el('atlasBack')) this._on(this.el('atlasBack'), 'click', () => history.back());
        if (this.el('atlasGrid')) this._on(this.el('atlasGrid'), 'click', () => this.app._setGraphView?.(false));
        this._on(this.el('atlasRandom'), 'click', (e) => {
            const b = e.currentTarget;
            b.classList.remove('is-twinkle'); void b.offsetWidth; b.classList.add('is-twinkle');
            this.randomFocus();
        });
        if (!VIEWER) this._on(this.el('atlasShuffle'), 'click', () => this._shuffle());
        // The viewer has no tab strip, so its Filter chip sits on the map.
        if (this.el('atlasFilter')) this._on(this.el('atlasFilter'), 'click', () => this.app._toggleBand?.());
        // Show › Artists, Albums, Labels, Tags and Tracks: the Show chip's checkboxes.
        this._on(document, 'change', (e) => {
            const key = e.target?.dataset?.atlasShow;
            if (!key) return;
            this.show = writeShow({ ...this.show, [key]: e.target.checked });
            this._syncRandom();
            this._redraw();
            // Albums and Tracks change the selection's dots: the room made round them follows.
            if (this.focus && (key === 'album' || key === 'track')) this._makeRoom();
        });
        // Zoom out and in (also [ and ]): the camera, apart from − and +, which change detail.
        this._on(this.el('atlasLens'), 'click', (e) => { const dir = Number(e.target.closest?.('[data-lens]')?.dataset.lens) || 0; if (dir) this._zoomBy(dir); });
        this._on(this.el('atlasWhole'), 'click', () => this.recenter());
        // − and +: less or more of the map, or of the selection's rings.
        this._on(this.el('atlasZoom'), 'click', (e) => { const step = Number(e.target.closest?.('[data-step]')?.dataset.step) || 0; if (step) this.stepDetail(step); });
        this._on(this.el('atlasFull'), 'click', () => this._setFull(!this.full));
        // The visualizer, here as well as from the player's wave; with nothing playing it keeps its own pace.
        this._on(this.el('atlasViz'), 'click', () => this.viz.toggle());
        this._on(this.el('atlasSky'), 'click', () => { this._applySky(writeSky(this.night ? 'light' : 'night')); this._readColours(); });
        this._on(this.el('atlasStatus'), 'click', (e) => { const b = e.target.closest('[data-retry]'); if (b) this.layer.retry(b.dataset.retry); });
        // The tip's ⓘ (ask, on touch): peek at its node, on the lift of the tap as the map's own taps.
        this._on(this.el('atlasTip'), 'pointerup', (e) => { if (e.target.closest?.('[data-peek]') && this._tipNode) { e.preventDefault(); this.peekAt(this._tipNode); } });
        this._on(document, 'fullscreenchange', () => { if (!document.fullscreenElement && this.full) this._setFull(false, { fromBrowser: true }); });
        this._on(this.el('atlasSwitch'), 'click', (e) => {
            const a = e.target.closest('a[data-mode]');
            if (!a || a.dataset.mode === this.mode) { if (a) e.preventDefault(); return; }
            if (this.cam) this._handoff = { cam: { ...(this.motion.anim?.to || this.cam) }, mapK: this.mapK, refit: this._refit, at: performance.now(),
                detail: this.detail, focusId: this.focus?.id ?? null, selDepth: this.selDepth };
        });
    }

    /** What changes under the graph: provider jobs, the skin, favorites and the player. */
    _wireUpdates() {
        if (this.discover && this.app.discogsQueue?.onJobDone) {
            this._unsubscribeJobs = this.app.discogsQueue.onJobDone((job) => {
                const watch = this.layer.watchIds();
                if ((job?.entityIds || []).some((id) => watch.has(id))) this.layer.refresh();
            });
        }
        // A skin change re-reads the colours; Night sky follows the skin only until it is chosen.
        const reskin = () => { this._applySky(readSky(undefined, skinIsDark())); this._readColours(); };
        this._on(document, 'skin-changed', reskin);
        // A star given or taken in Info: ☆ follows.
        this._on(document, 'favorites-changed', () => {
            if (this.route?.fav) this._syncLit();
            if (!this.focus) this.applyRoute(this.route);
        });
        const dark = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
        if (dark?.addEventListener) this._on(dark, 'change', reskin);
        // Info closed (Esc, ⓘ, `i`, the strip) or turned to another tab: the peek ends.
        this._unsubscribeSlot = this.app.rightSlot?.onChange?.(() => { if (this.peek && !this._infoShowing()) this.endPeek(); }) || null;
        const player = this.app.audioPlayer;
        if (player?.subscribe) {
            const state = () => `${this._playingId()}|${Boolean(player.isPlaying)}`;
            let last = state();
            this._unsubscribePlayer = player.subscribe(() => {
                const now = state();
                if (now === last) return;
                const from = last.split('|')[0], to = now.split('|')[0];
                last = now;
                // Play, pause or a new track: the ring follows.
                if (from !== to) { this._labels = null; this._followPlaying(from, to); }
                this._dirty();
            });
        }
    }

    // ---- Night sky, full screen ----

    /** Night sky or Light: the graph's own ground and ink (`.is-night`), and the toggle's icon and title. */
    _applySky(sky) {
        this.night = sky === 'night';
        this.el?.('atlas')?.classList.toggle('is-night', this.night);
        const btn = this.el?.('atlasSky');
        if (!btn) return;
        const label = this.night ? 'Light' : 'Night sky';
        btn.setAttribute('aria-pressed', String(this.night));
        btn.setAttribute('aria-label', label); btn.title = label;
        btn.innerHTML = this.night ? SUN : MOON;
    }

    /** A toggle changed: what is drawn, its names and its hit targets follow (nothing moves). */
    _redraw() {
        this._albumsFor = null;
        this.hover = null;
        this._labels = null; this._domPending = true;
        this._dirty();
    }

    /** Full screen: the graph takes the window (the sidebar and header step aside), in the browser's full screen when it allows it. */
    _setFull(on, { fromBrowser = false } = {}) {
        on = Boolean(on);
        if (on === Boolean(this.full)) return;
        this.full = on;
        document.body.classList.toggle('atlas-full', on);
        const btn = this.el?.('atlasFull');
        if (btn) { btn.setAttribute('aria-pressed', String(on)); btn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen'); btn.title = on ? 'Exit full screen (Esc)' : 'Full screen'; }
        if (fromBrowser) return;
        const root = document.documentElement;
        if (on && !document.fullscreenElement) root.requestFullscreen?.().catch(() => { /* the window stays as it is; the layout still goes full */ });
        if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    }

    /** A click selects what it hits (or peeks, atlas-peek.js); one on empty ground clears the selection. */
    _click(hit, how = {}) {
        if (!hit) {
            if (this._tipNode) { this._tipNode = null; this._showTip(this.hover); }
            if (clickIntent(null, this.route?.focus) === 'clear') this._go({});
            return;
        }
        this._activate(hit, how);
    }

    /** Does this click wait out the double-click time: empty ground clearing, or the selected node again? */
    _waits(hit) {
        if (!hit) return clickIntent(null, this.route?.focus) === 'clear';
        return hit.kind === 'node' && clickIntent(hit.id, this.focus?.id) === 'info';
    }

    /**
     * A click or tap. A second one soon after, close by, is a double-click and zooms instead.
     * Selecting happens at once; clearing and opening Info wait out the double-click time, so a
     * double-click on empty ground never clears and one on the selected node only zooms.
     */
    _tap(down, e) {
        const now = performance.now(), last = this._lastTap;
        const double = Boolean(last && now - last.t < ATLAS.dblClickMs && Math.hypot(down.x - last.x, down.y - last.y) < ATLAS.dblClickPx);
        this._lastTap = double ? null : { t: now, x: down.x, y: down.y, hit: down.hit };
        clearTimeout(this._clickTimer); this._clickTimer = null;
        const out = Boolean(e?.shiftKey || e?.altKey);
        // A double-click on a node plays it, as on a table row; elsewhere (and in the viewer) it zooms.
        const target = double ? dblTarget(last.hit, down.hit) : null;
        if (double && !out && dblIntent(target, { viewer: VIEWER }) === 'play') return this.playNode(this._hitNode(target));
        if (double) return this._doubleClick(down, down.hit, out);
        const how = { alt: Boolean(e?.altKey), touch: e?.pointerType === 'touch' || e?.pointerType === 'pen' };
        if (!this._waits(down.hit)) return this._click(down.hit, how);
        const hit = down.hit;
        this._clickTimer = setTimeout(() => { this._clickTimer = null; if (this._active) this._click(hit, how); }, ATLAS.dblClickMs);
    }

    _note(text, retry = null) {
        if (VIEWER) retry = null;
        const note = this.el?.('atlasNote');
        if (!note) return;
        note.hidden = !text;
        note.innerHTML = text ? `${escapeHtml(text)}${retry ? ' <button type="button" class="atlas-link" data-retry>Retry</button>' : ''}` : '';
        if (retry) note.querySelector('[data-retry]').addEventListener('click', retry, { once: true });
    }
}
