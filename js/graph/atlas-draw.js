// The atlas's canvas, in the calm look (docs/specs/2026-11-20-graph-look-design.md): crisp
// circles for artists and tags and triangles for labels, sized by owned tracks and coloured
// by main subgenre; thin arcs, each with its own curl, from a selection to its rings; names under their
// nodes; soft album and track dots round a selected artist or label; the edge of the map dissolving.
// A selection lifts: it and its ring nodes come forward, larger and deeper, each on a hairline
// of the ground, its lines cased in the ground's colour, while the rest fades a little.
// Nothing blurs, glows or casts a shadow. AtlasView extends AtlasCanvas and owns state,
// routing, the DOM layer and events; Discover's outlines are drawn by discover-layer.js.
// Every number is in atlas-config.js.
import { ATLAS } from './atlas-config.js';
import { localRect } from '../phone.js';
import { toScreen, parseColour, rgba, labelText } from './atlas-geometry.js';
import { ringCamera } from './atlas-motion.js';
import { isCollaboration } from './atlas-layers.js';
import { nodeHexes, nodeOklch, oklchRgb, rimAlpha, screenRadius, nameBudget, arcSpan, subCurve, cubicAt, linkHashes, sizePx, zoomGrow, roomPx, liftedRoom } from './atlas-look.js';
import { easeOut } from './atlas-settle.js';

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const lerp = (a, b, t) => a + (b - a) * t;
// A name's font by its tier (ATLAS.nameSizes): the selection, its first ring and the like, the rest.
const NAME_FONTS = ATLAS.nameSizes.map((px, t) => `${ATLAS.nameWeights[t]} ${px}px -apple-system, BlinkMacSystemFont, Inter, system-ui, sans-serif`);
/** A candidate's tier: given, else 1 for the always-named and 2 for the rest. */
const tierOf = (c) => c.tier ?? (c.strong ? 1 : 2);

/**
 * A selected artist's or label's albums and tracks as a close sunflower round its node at
 * (x, y): the k-th at angle k × 2.39996 + 0.4 and distance baseR + 7√k, each sized by its
 * owned tracks, at most `albumsMax`; a dot that would come within `albumGap` px of an
 * earlier one moves out along its angle until it doesn't. Each spot keeps its item (`album`).
 */
export function albumSpots(albums, x, y, baseR) {
    const out = [];
    for (const [k, album] of (albums || []).slice(0, ATLAS.albumsMax).entries()) {
        const a = k * 2.39996 + 0.4, r = 1.6 + 0.5 * Math.sqrt(Math.max(0, album.count || 0));
        let rr = baseR + 7 * Math.sqrt(k);
        const at = () => [x + Math.cos(a) * rr, y + Math.sin(a) * rr];
        for (let guard = 0; guard < 200 && out.some((o) => { const [px, py] = at(); return Math.hypot(px - o.x, py - o.y) < r + o.r + ATLAS.albumGap; }); guard++) rr += 0.5;
        const [px, py] = at();
        out.push({ album, x: px, y: py, r });
    }
    return out;
}

/** Does the box { x0, x1, y0, y1 } touch a drawn shape ({ x, y, r, label, ring }, as inShape)? */
export function boxHitsShape(b, sh) {
    const round = sh.ring ? sh.r + sh.ring : sh.label ? 0 : sh.r;
    if (round > 0) {
        const cx = Math.max(b.x0, Math.min(sh.x, b.x1)), cy = Math.max(b.y0, Math.min(sh.y, b.y1));
        if (Math.hypot(sh.x - cx, sh.y - cy) < round) return true;
    }
    if (!sh.label) return false;
    const s = sh.r * 0.9;
    if (b.x1 <= sh.x - s || b.x0 >= sh.x + s || b.y1 <= sh.y - s || b.y0 >= sh.y + s) return false;
    // The lower-left triangle lies where (px − x) − (py − y) < 0: clear when every corner of the box is past it.
    return b.x0 - b.y1 < sh.x - sh.y;
}

/** A coarse grid of boxes, for asking what is near a box. */
class BoxGrid {
    constructor(cell = 32) { this.cell = cell; this.cells = new Map(); this.stamp = 0; }
    add(item, x0, y0, x1, y1) {
        const c = this.cell, entry = { item, seen: 0 };
        for (let gx = Math.floor(x0 / c), gx1 = Math.floor(x1 / c); gx <= gx1; gx++) {
            for (let gy = Math.floor(y0 / c), gy1 = Math.floor(y1 / c); gy <= gy1; gy++) {
                const k = gx * 65536 + gy, cell = this.cells.get(k);
                if (cell) cell.push(entry); else this.cells.set(k, [entry]);
            }
        }
    }
    /** The sum of `value` over the items filed near the box (each item asked once). */
    sum(x0, y0, x1, y1, value) {
        let total = 0;
        this.some(x0, y0, x1, y1, (item) => { total += value(item); return false; });
        return total;
    }
    /** True when `test` holds for any item filed near the box (each item asked once). */
    some(x0, y0, x1, y1, test) {
        const c = this.cell, stamp = ++this.stamp;
        for (let gx = Math.floor(x0 / c), gx1 = Math.floor(x1 / c); gx <= gx1; gx++) {
            for (let gy = Math.floor(y0 / c), gy1 = Math.floor(y1 / c); gy <= gy1; gy++) {
                const cell = this.cells.get(gx * 65536 + gy);
                if (!cell) continue;
                for (const e of cell) {
                    if (e.seen === stamp) continue;
                    e.seen = stamp;
                    if (test(e.item)) return true;
                }
            }
        }
        return false;
    }
}

const overlapping = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** Does the segment (x0, y0) → (x1, y1) cross the box { x0, x1, y0, y1 }? (Liang–Barsky, no allocation) */
export function segHitsBox(x0, y0, x1, y1, b) {
    if (Math.max(x0, x1) < b.x0 || Math.min(x0, x1) > b.x1 || Math.max(y0, y1) < b.y0 || Math.min(y0, y1) > b.y1) return false;
    let a0 = 0, a1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    const clip = (p, q) => {
        if (p === 0) return q >= 0;
        const r = q / p;
        if (p < 0) { if (r > a1) return false; if (r > a0) a0 = r; } else { if (r < a0) return false; if (r < a1) a1 = r; }
        return true;
    };
    return clip(-dx, x0 - b.x0) && clip(dx, b.x1 - x0) && clip(-dy, y0 - b.y0) && clip(dy, b.y1 - y0);
}

/** Segments a drawn curve is checked as: enough that a name box off the curve is off its segments. */
const CURVE_SEGMENTS = 10;

// Where a name may sit round its node, nearest first: under it, right, left, above; the
// always-named also try the four corners. Each gives the ink box's top-left for width w and
// reach R (how far the node's shape, or its ring, reaches), `gap` px clear of it.
const SPOTS = [
    (x, y, R, w, h, g) => [x - w / 2, y + R + g],
    (x, y, R, w, h, g) => [x + R + g + 1, y - h / 2],
    (x, y, R, w, h, g) => [x - R - g - 1 - w, y - h / 2],
    (x, y, R, w, h, g) => [x - w / 2, y - R - g - h],
];
const CORNERS = [
    (x, y, R, w, h, g) => [x + (R + g) * Math.SQRT1_2, y + (R + g) * Math.SQRT1_2],
    (x, y, R, w, h, g) => [x - (R + g) * Math.SQRT1_2 - w, y + (R + g) * Math.SQRT1_2],
    (x, y, R, w, h, g) => [x + (R + g) * Math.SQRT1_2, y - (R + g) * Math.SQRT1_2 - h],
    (x, y, R, w, h, g) => [x - (R + g) * Math.SQRT1_2 - w, y - (R + g) * Math.SQRT1_2 - h],
];

/**
 * Names round their nodes, the always-named (`strong`) first, then in order. Names never
 * overlap one another: each box, `namePad` px round the text, stays in view and clear of
 * the names already placed and of the controls (`chrome`). A name may sit over nodes, dots
 * and rings (`obstacles`, as inShape), never over a `hard` one (a ringed node), and keeps off
 * the drawn lines (`lines`, [x0, y0, x1, y1] segments) where it can. Of its spots (under its
 * node, else right, left or above; a strong one also the corners) it takes the first clear of
 * lines that covers nothing. Only a strong one may cover a node: it takes the spot clear of
 * lines that covers least (area, r²), else, with every free spot on a line, the lined one
 * that covers least; any other name with no spot clear of nodes and lines is left out, as is
 * one with no spot clear of the other names. A non-strong candidate is also left out at the
 * dissolving edge (rim > 0.5) below `rimNames` zoom, as a collaboration, or past `budget`.
 * Those that `claim` (a selection, its first ring and its shared nodes) place first, by tier,
 * then the rest by tier (0 first). Each box is its tier's `nameSizes` px tall. Candidates:
 * { i, id, x, y, r, name, strong, tier?, claim?, rim?, collab? } with r the node's reach (its ring's,
 * if it has one); `measure(name, tier)`. Returns { i, id, x, y, strong, tier, box, name,
 * covers, onLine }, (x, y) the text's middle on a whole pixel, `covers` true when it sits
 * over a shape and `onLine` when over a line.
 */
export function placeNames(candidates, { W, H, measure, chrome = [], obstacles = [], lines = [], zoom = 1, budget = Infinity }) {
    const pad = ATLAS.namePad, gap = ATLAS.nameGap;
    const shapes = new BoxGrid(), names = new BoxGrid(), segs = new BoxGrid(48), out = [];
    for (const g of lines) {
        const x0 = Math.min(g[0], g[2]), x1 = Math.max(g[0], g[2]), y0 = Math.min(g[1], g[3]), y1 = Math.max(g[1], g[3]);
        if (x1 < 0 || y1 < 0 || x0 > W || y0 > H) continue;
        segs.add(g, x0, y0, x1, y1);
    }
    const onLine = (b) => segs.some(b.x0, b.y0, b.x1, b.y1, (g) => segHitsBox(g[0], g[1], g[2], g[3], b));
    for (const sh of obstacles) {
        const reach = sh.r * (sh.label ? 0.9 : 1) + (sh.ring || 0);
        if (sh.x + reach < 0 || sh.y + reach < 0 || sh.x - reach > W || sh.y - reach > H) continue;
        shapes.add(sh, sh.x - reach, sh.y - reach, sh.x + reach, sh.y + reach);
    }
    for (const c of chrome) names.add({ box: c }, c.x0, c.y0, c.x1, c.y1);
    const ordered = [true, false].flatMap((claim) => [0, 1, 2].flatMap((t) => candidates.filter((c) => Boolean(c.claim) === claim && Math.min(2, tierOf(c)) === t)));
    let weak = 0;
    for (const c of ordered) {
        if (!c.strong) {
            if (weak >= budget) continue;
            if (c.collab || ((c.rim ?? 0) > 0.5 && zoom < ATLAS.rimNames)) continue;
        }
        if (c.x < -200 || c.y < -40 || c.x > W + 200 || c.y > H + 40) continue;
        const tier = tierOf(c), h = ATLAS.nameSizes[Math.min(2, tier)], w = measure(c.name, tier);
        // The best spot off the lines; a strong name keeps its lined spots in case none is.
        let box = null, least = Infinity;
        const lined = [];
        const coverOf = (b) => shapes.sum(b.x0, b.y0, b.x1, b.y1, (sh) => (boxHitsShape(b, sh) ? Math.max(1, sh.r * sh.r) : 0));
        for (const spot of c.strong ? [...SPOTS, ...CORNERS] : SPOTS) {
            const [x0, y0] = spot(c.x, c.y, c.r, w, h, gap);
            const b = { x0: x0 - pad, x1: x0 + w + pad, y0: y0 - pad, y1: y0 + h + pad };
            if (b.x0 < 0 || b.y0 < 0 || b.x1 > W || b.y1 > H) continue;
            if (names.some(b.x0, b.y0, b.x1, b.y1, (it) => overlapping(b, it.box))) continue;
            if (shapes.some(b.x0, b.y0, b.x1, b.y1, (sh) => sh.hard && boxHitsShape(b, sh))) continue;
            if (onLine(b)) { if (c.strong) lined.push(b); continue; }
            const cover = coverOf(b);
            if (cover && !c.strong) continue;
            if (cover < least) { box = b; least = cover; }
            if (!cover) break;
        }
        const over = !box && lined.length > 0;
        if (over) for (const b of lined) { const cover = coverOf(b); if (cover < least) { box = b; least = cover; } }
        if (!box) continue;
        names.add({ box }, box.x0, box.y0, box.x1, box.y1);
        if (!c.strong) weak++;
        out.push({ i: c.i, id: c.id, x: Math.round((box.x0 + box.x1) / 2), y: Math.round((box.y0 + box.y1) / 2), strong: Boolean(c.strong), tier, box, name: c.name, covers: least > 0, onLine: Boolean(over) });
    }
    return out;
}

/**
 * What a selected artist's or label's sunflower holds, at most `albumsMax`: its owned albums
 * by owned track count, then its not-owned releases (albums too), then its tracks as the
 * payload orders them (most played first), each the size of one track. `show` is Show's
 * choice: Albums off leaves out albums and releases, Tracks off the tracks.
 */
export function sunflowerAlbums(satellites, outlines = [], show = {}) {
    const albums = show?.album !== false, tracks = show?.track !== false;
    const owned = albums ? (satellites || []).filter((s) => s.type === 'album')
        .sort((a, b) => (b.count || 0) - (a.count || 0) || String(a.name).localeCompare(String(b.name))) : [];
    const outside = albums ? (outlines || []).map((s) => ({ ...s, outside: true, count: 1 })) : [];
    const own = tracks ? (satellites || []).filter((s) => s.type === 'track').map((s) => ({ ...s, count: 1 })) : [];
    return [...owned, ...outside, ...own].slice(0, ATLAS.albumsMax);
}

/**
 * How far a selection's sunflower has grown in: a zoom part (from `albumZoom` × 0.8) times a
 * time part (600 ms from the selection). Only the time part asks for more frames; the zoom
 * part follows the camera, which asks for its own.
 */
export function albumGrow({ zoom, now, startedAt, reduced }) {
    const from = ATLAS.albumZoom * 0.8;
    const byZoom = clamp01((zoom - from) / (ATLAS.albumZoom * 0.4));
    const byTime = reduced ? 1 : clamp01((now - startedAt) / 600);
    return { g: byZoom * byTime, growing: byTime < 1 };
}

export class AtlasCanvas {
    // ---- colour ----

    _readColours() {
        const probe = document.createElement('span');
        probe.style.display = 'none';
        this.el('atlas').appendChild(probe);
        const read = (v) => { probe.style.color = `var(${v})`; return parseColour(getComputedStyle(probe).color) || [128, 128, 128]; };
        this.ink = { text: read('--text'), dim: read('--text-dim'), faint: read('--text-faint'), bg: read('--bg-raised'), ground: read('--bg') };
        probe.remove();
        if (this.atlas) this._colourNodes();
        this.layer.recolour();
        this._dirty();
    }

    /** Each node's fill, soft and deep colour (CSS hex, nodeHexes), and its fill as rgb for what mixes colours. */
    _colourNodes() {
        const night = Boolean(this.night), subs = this.atlas.subgenres;
        const look = (n) => ({ hue: n.subgenre && subs?.has(n.subgenre) ? subs.get(n.subgenre).hue : null, share: n.share ?? 1 });
        this.fills = []; this.softs = []; this.deeps = []; this.colours = [];
        for (const n of this.atlas.nodes) {
            const c = look(n), css = nodeHexes(c, night);
            this.fills.push(css.fill); this.softs.push(css.soft); this.deeps.push(css.deep);
            this.colours.push(oklchRgb(nodeOklch(c, night)));
        }
    }

    /** The colour of the owned node nearest a map point (Discover's outlines), or of the first owned node it is `near`. */
    colourNear({ x, y, near = [] } = {}) {
        const atlas = this.atlas, fallback = this.ink?.dim || [128, 128, 128];
        if (!atlas || !this.colours) return fallback;
        for (const id of near || []) { const n = atlas.byId.get(id); if (n && n.type !== 'tag') return this.colours[n.i]; }
        if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback;
        let best = null, bestD = Infinity;
        for (const n of atlas.nodes) {
            if (n.type === 'tag') continue;
            const d = (n.x - x) ** 2 + (n.y - y) ** 2;
            if (d < bestD) { best = n; bestD = d; }
        }
        return best ? this.colours[best.i] : fallback;
    }

    // ---- frame ----

    _frame(now) {
        if (!this.atlas || !this.cam || !this.settle) { this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height); return; }
        // The visualizer draws its own frames, through the passes below (atlas-visualizer.js).
        if (this.viz?.on) return this.viz.frame(now);
        // Only the playing ring pulses: redraw the last full frame from its copy, then the ring.
        if (!this._full && this._still && this._lastView) {
            const ctx = this.ctx;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.drawImage(this._still, 0, 0);
            ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            if (this._drawPlaying(ctx, this._lastView, now) && !this.reduced) this._pulse();
            return;
        }
        this._full = false;
        let animating = this._stepMotion(now);
        if (this.settle.frame(now)) animating = true;
        if (this._stepDim(now)) animating = true;
        const f = this.focus;
        if (f && !this.reduced && now - f.startedAt < Math.max(ATLAS.selectMs, 600)) animating = true;
        const pulled = this.tug?.pulled;
        if (pulled?.i != null && !pulled.on && now - pulled.at < ATLAS.tugOutMs) animating = true;
        if (this._liftOut) animating = true;
        const ctx = this.ctx, { W, H } = this;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        this._ringId = this._ring?.()?.id ?? null;
        this._anchorIds = this._anchorsDrawn() ? new Set((this.homeGraph.anchors || []).map((a) => a.id)) : null;
        let view = this._lastView = this._visible(now); // also the hit-test source between frames
        this._lineSegs = []; // every line drawn this frame, as segments (names keep off them)
        this._curlCentre = this._ringCentre(view);
        // Past the zoom where the album sunflower shows, the nodes round it make room; back out, they return.
        const albumRoom = view.zoom >= ATLAS.albumZoom * 0.8;
        if (albumRoom !== Boolean(this._albumRoom)) {
            this._albumRoom = albumRoom;
            if (this.focus) { this._makeRoom(); animating = true; view = this._lastView = this._visible(now); this._curlCentre = this._ringCentre(view); }
        }
        // Lifted (a selection): the rest of the map, then its lines, then it and its rings on top.
        this._drawNodes(ctx, view, false);
        this._drawRings(ctx, view, now);
        this._drawPulled(ctx, view, now);
        this._drawNodes(ctx, view, true);
        this._drawHome(ctx, view);
        this._drawSelection(ctx, view, now);
        if (this.discover) this.layer.draw(ctx, view);
        this._drawNames(ctx, view);
        this.bar?.drawWalk(ctx, view);
        this._keepStill();
        const ringing = this._drawPlaying(ctx, view, now);
        // The keyboard layer is read from a still frame: mid-fade, new ring nodes may not be in it yet.
        if (this._domPending && !animating && !this._busy()) { this._domPending = false; this._buildDom(view); }
        if (animating) this._dirty();
        else if (ringing && !this.reduced) this._pulse();
    }

    /** While the ring pulses, a copy of the frame under it, so a pulse redraws the ring alone. */
    _keepStill() {
        if (this.reduced || !this._ring()) { this._still = null; return; }
        const { width, height } = this.canvas;
        if (!this._still || this._still.width !== width || this._still.height !== height) {
            this._still = document.createElement('canvas');
            this._still.width = width; this._still.height = height;
        }
        const s = this._still.getContext('2d');
        s.setTransform(1, 0, 0, 1, 0, 0);
        s.clearRect(0, 0, width, height);
        s.drawImage(this.canvas, 0, 0);
    }

    /** The playing artist's quiet ring: 1 px in its colour, pulsing (still under reduced motion). True when drawn. */
    _drawPlaying(ctx, view, now) {
        const ring = this._ring(), it = ring && view.byId.get(ring.id);
        if (!it) return false;
        const C = ATLAS, t = ((now % C.playingPulseMs) / C.playingPulseMs) * Math.PI * 2;
        const alpha = this.reduced ? C.playingAlphaStill : C.playingAlphaMin + (C.playingAlphaMax - C.playingAlphaMin) * (0.5 - 0.5 * Math.cos(t));
        ctx.globalAlpha = 1;
        ctx.strokeStyle = rgba(this.colours[it.i], alpha); ctx.lineWidth = C.playingRingWidth;
        ctx.beginPath(); ctx.arc(it.sx, it.sy, it.r + C.playingRingGap, 0, Math.PI * 2); ctx.stroke();
        return true;
    }

    /** The dim eases in over `selectMs` when a selection or lit set picks nodes out, and back out when it clears. True while easing. */
    _stepDim(now) {
        const target = this._keep ? 1 : 0, level = this._dimLevel || 0;
        // A selection fades the rest a little (liftFade); ☆, the filter, search and the home dim it (dim).
        if (this._keep) { this._dimKeep = this._keep; this._dimTo = this.focus ? ATLAS.liftFade : ATLAS.dim; }
        if (level === target) { this._dimAt = null; if (!level) this._dimKeep = null; return false; }
        const dt = this._dimAt == null ? 16 : Math.max(0, now - this._dimAt);
        this._dimAt = now;
        const step = this.reduced ? 1 : dt / ATLAS.selectMs;
        this._dimLevel = target > level ? Math.min(target, level + step) : Math.max(target, level - step);
        if (!this._dimLevel) this._dimKeep = null;
        return this._dimLevel !== target;
    }

    /**
     * How far the lift has come: the selection's rings (`set`) over `selectMs` from the
     * selection, and what a cleared or replaced selection lifted (`out`) easing back down.
     */
    _lift(now) {
        const f = this.focus, set = f && this.ring ? this.ring.set : null;
        const t = set ? easeOut(this._selT(now)) : 0, o = this._liftOut;
        let outT = 0;
        if (o) {
            outT = this.reduced ? 0 : o.from * (1 - easeOut(clamp01((now - o.at) / ATLAS.selectMs)));
            if (outT <= 0) this._liftOut = null;
        }
        return { set, shared: set ? this.ring.shared : null, t, out: outT > 0 ? o.set : null, outShared: outT > 0 ? o.shared : null, outT };
    }

    /** A selection is cleared or replaced: what it lifted eases back down. */
    _lowerLift(now = performance.now()) {
        if (!this.focus || !this.ring) return;
        const from = Math.max(easeOut(this._selT(now)), this._liftOut?.set === this.ring.set ? this._liftOut.from : 0);
        this._liftOut = from > 0 ? { set: this.ring.set, shared: this.ring.shared, from, at: now } : null;
    }

    /** A node's room while it makes room (map units): lifted in a selection's rings (a shared node one step larger), else its step room. */
    _roomR(i) {
        if (this.focus && this.ring?.set.has(i)) { const n = this.atlas.nodes[i]; return liftedRoom(n.weight, n.type, this.atlas.steps?.refK || this.mapK) * (this.ring.shared?.has(i) ? ATLAS.sharedScale : 1); }
        return this._mapR(i);
    }

    /** A node's on-screen radius at this zoom, before its grow-in scale. */
    _radiusOf(i, zoom = this.cam.k / this.mapK) {
        return screenRadius(this.atlas.nodes[i].weight, { fitK: this.mapK, refK: this.atlas.steps?.refK || this.mapK, zoom });
    }

    /**
     * Every shown node in view with its screen position, radius and alpha (grow-in, the fade
     * of what a selection or the dim of what a lit set leaves out, the dissolving edge, and
     * Discover's dim), and how lifted it is (`lift`, 0 to 1: larger, full strength, deeper; a
     * shared node one step larger again).
     */
    _visible(now = performance.now()) {
        const { cam, W, H, atlas, settle } = this;
        const zoom = cam.k / this.mapK, nodes = atlas.nodes;
        const at = (n) => toScreen(cam, W, H, settle.live[n.i] ? settle.x[n.i] : n.x, settle.live[n.i] ? settle.y[n.i] : n.y);
        const keep = this._dimKeep, dimBy = keep ? lerp(1, this._dimTo ?? ATLAS.dim, easeOut(this._dimLevel || 0)) : 1;
        const lift = this._lift(now), grow = ATLAS.liftScale - 1;
        const list = [], byId = new Map(), byIndex = new Map();
        for (const i of this._drawOrder) {
            if (!settle.live[i]) continue;
            const scale = settle.scale[i];
            if (scale <= 0.01) continue;
            const n = nodes[i];
            if (!this.shows(n.type, n.id)) continue;
            const L = Math.max(lift.set?.has(i) ? lift.t : 0, lift.out?.has(i) ? lift.outT : 0);
            const Ls = Math.max(lift.shared?.has(i) ? lift.t : 0, lift.outShared?.has(i) ? lift.outT : 0);
            const s = toScreen(cam, W, H, settle.x[i], settle.y[i]), r = this._radiusOf(i, zoom) * scale * (1 + grow * L) * (1 + (ATLAS.sharedScale - 1) * Ls);
            if (s.x < -r - 40 || s.y < -r - 40 || s.x > W + r + 40 || s.y > H + r + 40) continue;
            let alpha = ATLAS.markAlpha * Math.min(1, scale * 1.3) * rimAlpha(atlas.rim[i], zoom);
            if (this.discover) alpha *= this.layer.alphaFor(n.id);
            else if (keep && !keep.has(i)) alpha *= dimBy;
            // Lifted: full strength, the dissolving edge and any dim gone.
            if (L > 0) alpha = lerp(alpha, Math.min(1, scale * 1.3), L);
            const item = { n, i, id: n.id, type: n.type, name: n.name, weight: n.weight, sx: s.x, sy: s.y, r, alpha, scale, lift: L, shared: Ls > 0, faded: Boolean(keep && !keep.has(i)) };
            list.push(item); byId.set(n.id, item); byIndex.set(i, item);
        }
        const focusScreen = this._focusScreen(byId, at, zoom, lift.t);
        return { list, byId, byIndex, zoom, at, focusScreen, parentScreen: focusScreen, dimBy, lift };
    }

    /**
     * Where the selection is drawn: its node; an album or track as a soft dot beside the
     * artist it hangs off (wherever that artist is, in view or not, and whatever Show hides);
     * anything else not on the atlas at its placed spot.
     */
    _focusScreen(byId, at, zoom, lift = 0) {
        const f = this.focus;
        if (!f?.pos) return null;
        const own = byId.get(f.id);
        if (own) return { x: own.sx, y: own.sy, r: own.r, item: own };
        const spot = this._softSpot('now');
        if (spot) {
            // Up and right of the artist, a map distance away (_softDistance), so the room made for it holds at any zoom; lifted like its rings.
            const r = (sizePx(1) * this.mapK / (this.atlas.steps?.refK || this.mapK)) * zoomGrow(zoom) * (1 + (ATLAS.liftScale - 1) * lift);
            const p = at({ i: -1, x: spot.x, y: spot.y });
            return { x: p.x, y: p.y, r, soft: true, host: { i: spot.host }, lift };
        }
        const p = at({ i: -1, x: f.pos.x, y: f.pos.y });
        return { x: p.x, y: p.y, r: 4, soft: !f.outside };
    }

    /**
     * The middle of the shown subgraph on screen (the selection and its shown ring nodes, in view
     * or not), which every arc bends away from; null with no selection.
     */
    _ringCentre(view) {
        const f = this.focus, s = this.settle, fs = view.focusScreen;
        if (!f || !this.ring || !s) return null;
        let x = 0, y = 0, k = 0;
        for (const i of this.ring.set) {
            if (!s.live[i]) continue;
            const p = view.at(this.atlas.nodes[i]);
            x += p.x; y += p.y; k++;
        }
        if (fs && !fs.item) { x += fs.x; y += fs.y; k++; }
        return k ? [x / k, y / k] : null;
    }

    /**
     * Where an arc meets a node: its id, screen spot and drawn shape ({ id, x, y, r, label, ring },
     * inShape), the selection with its ring; not drawn, where it would be, with no shape.
     * Index -1 is an off-atlas selection.
     */
    _endOf(view, i) {
        const f = this.focus, ring = ATLAS.selectRing + 0.5;
        if (i === -1) {
            const fs = view.focusScreen;
            if (!fs) return null;
            // An outside focus in Discover is drawn by the layer, as a larger outline with its ring.
            const outline = f?.outside && this.discover ? this.layer.screen.find((s) => s.focus) : null;
            if (outline) return { id: f.id, x: fs.x, y: fs.y, r: outline.r + 0.5, ring: ATLAS.selectRing };
            return { id: f?.id, x: fs.x, y: fs.y, r: fs.r, ring };
        }
        const it = view.byIndex.get(i), n = this.atlas.nodes[i];
        if (!it) return { id: n.id, ...view.at(n), r: 0 };
        return { id: it.id, x: it.sx, y: it.sy, r: it.r, label: it.type === 'label', ring: this._ringOf(it) };
    }

    /**
     * How far past a drawn node's edge a ring round it reaches, px (its outer edge), or 0:
     * the selection's, the peeked node's, the playing artist's, a Favorites home anchor's.
     */
    _ringOf(it) {
        if (this.focus && it.id === this.focus.id) return ATLAS.selectRing + 0.5;
        if (this.peek && it.id === this.peek.id) return ATLAS.selectRing + ATLAS.peekRingWidth / 2;
        if (it.id === this._ringId) return ATLAS.playingRingGap + ATLAS.playingRingWidth / 2;
        if (this._anchorIds?.has(it.id)) return ATLAS.anchorRing + 0.5;
        return 0;
    }

    /**
     * A link's cubic arc, with its own curl (curveOf: its ends' ids, bending away from the
     * subgraph's middle), from edge to edge (arcSpan), drawn out from `a` to `t` of its length
     * (eased; `even`: as given). Returns where the drawn piece ends, [x, y], or null when none is drawn.
     * Without `trace` names may sit over it.
     */
    _curl(ctx, a, b, t, { width, alpha, css, dashed = false, cased = false, even = false, trace = true }) {
        if (t <= 0.01 || !a || !b) return null;
        const span = arcSpan(a, b, { curve: { centre: this._curlCentre, ...linkHashes(a.id, b.id) } });
        if (!span) return null;
        const Q = subCurve(a, span, b, span.t0, span.t0 + (span.t1 - span.t0) * (even ? Math.min(1, t) : easeOut(Math.min(1, t))));
        const fade = Math.min(1, t * 1.5);
        ctx.setLineDash(dashed ? [3, 4] : []);
        ctx.beginPath(); ctx.moveTo(Q[0], Q[1]);
        ctx.bezierCurveTo(Q[2], Q[3], Q[4], Q[5], Q[6], Q[7]);
        // A casing in the ground's colour first, so the line reads over the nodes it crosses.
        if (cased) {
            ctx.globalAlpha = ATLAS.lineCasingAlpha * fade;
            ctx.strokeStyle = rgba(this.ink.ground, 1); ctx.lineWidth = width + ATLAS.lineCasing;
            ctx.stroke();
        }
        ctx.globalAlpha = alpha * fade;
        ctx.strokeStyle = css; ctx.lineWidth = width;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        // The drawn piece, as short segments, so names can keep off it (`trace`).
        if (this._lineSegs && trace) {
            let px = Q[0], py = Q[1];
            for (let k = 1; k <= CURVE_SEGMENTS; k++) {
                const s = k / CURVE_SEGMENTS, x = cubicAt(Q[0], Q[2], Q[4], Q[6], s), y = cubicAt(Q[1], Q[3], Q[5], Q[7], s);
                this._lineSegs.push([px, py, x, y]); px = x; py = y;
            }
        }
        return [Q[6], Q[7]];
    }

    /** An arc between two screen points in rgb colours (Discover's outlines draw theirs with it). */
    _arc(ctx, a, b, _key, { t = 1, width = 1, alpha = 0.5, cb, dashed = false } = {}) {
        this._curl(ctx, a, b, t, { width, alpha, css: rgba(cb || this.ink.dim, 1), dashed });
    }

    /** How far the selection's arcs and dim have come, 0 to 1. */
    _selT(now) {
        const f = this.focus;
        return !f ? 0 : this.reduced ? 1 : clamp01((now - f.startedAt) / ATLAS.selectMs);
    }

    /**
     * The selection's lines, over the rest of the map and under its lifted nodes: first the
     * other links among its shown nodes (ring.cross), faint and uncased; then from each node to
     * the ones it brings in, in the far node's deep colour, each on a ground-coloured casing;
     * then the hovered node's links to the shown nodes, brought forward. Names keep off the
     * ring's own lines only. The visualizer draws its ring lines alone.
     */
    _drawRings(ctx, view, now) {
        const ring = this.ring;
        if (!this.focus || !ring) return;
        const t = this._selT(now), [w0, w1] = ATLAS.ringLineWidth, [a0, a1] = ATLAS.ringLineAlpha;
        const on = (i) => i === -1 || (this.settle.live[i] && this.shows(this.atlas.nodes[i].type, this.atlas.nodes[i].id));
        const grown = (i) => (i === -1 ? 1 : Math.min(1, this.settle.scale[i] * 1.5));
        ctx.lineCap = 'round';
        if (!this.viz?.on) for (const [from, to] of ring.cross || []) {
            if (!on(from) || !on(to)) continue;
            this._curl(ctx, this._endOf(view, from), this._endOf(view, to), t * Math.min(grown(from), grown(to)),
                { width: ATLAS.crossLineWidth, alpha: ATLAS.crossLineAlpha, css: this.deeps[to], trace: false });
        }
        for (const [from, to, d] of ring.edges) {
            const n = this.atlas.nodes[to];
            if (!this.shows(n.type, n.id) || !this.settle.live[to]) continue;
            // In the visualizer a line fades back off the branch in view, and light runs along the ones on it.
            const look = this.viz?.on ? this.viz.lineLook(from, to) : null;
            const a = this._endOf(view, from), b = this._endOf(view, to), width = d === 0 ? w0 : w1;
            this._curl(ctx, a, b, t * Math.min(1, this.settle.scale[to] * 1.5),
                { width, alpha: (d === 0 ? a0 : a1) * (look ? look.fade : 1), css: this.deeps[to], cased: true });
            if (look && look.glow > 0) this.viz.drawGlow(ctx, look, a, b, { width, css: this.fills[to] });
        }
        const h = this.hover?.kind === 'node' ? this.hover.n?.i : null;
        if (h == null || this.viz?.on || !on(h)) return;
        const own = this.atlas.byId.get(this.focus.id)?.i;
        for (const [j] of this.atlas.linksAll?.get(h) || []) {
            if (j === h || !(ring.set.has(j) || j === own) || !on(j)) continue;
            this._curl(ctx, this._endOf(view, h), this._endOf(view, j), grown(j),
                { width: ATLAS.hoverLineWidth, alpha: ATLAS.hoverLineAlpha, css: this.deeps[j], cased: true, even: true, trace: false });
        }
    }

    /** Pulling a node: faint arcs to the links it tugs, fading in, then out after letting go (cased and deep over a lifted map). */
    _drawPulled(ctx, view, now) {
        const p = this.tug?.pulled;
        if (p?.i == null || (this.focus && this.atlas.byId.get(this.focus.id)?.i === p.i)) return;
        const g = p.on ? clamp01((now - p.at) / ATLAS.tugInMs) : 1 - clamp01((now - p.at) / ATLAS.tugOutMs);
        if (g <= 0) return;
        const lifted = Boolean(this.focus);
        ctx.lineCap = 'round';
        for (const [j] of p.links) this._curl(ctx, this._endOf(view, p.i), this._endOf(view, j), 1, { width: 1, alpha: 0.6 * g, css: lifted ? this.deeps[j] : this.fills[j], cased: lifted });
    }

    /** Artists and tags are circles, labels lower-left right triangles: the path alone. */
    _path(ctx, type, x, y, r) {
        ctx.beginPath();
        if (type === 'label') { const s = r * 0.9; ctx.moveTo(x - s, y - s); ctx.lineTo(x - s, y + s); ctx.lineTo(x + s, y + s); ctx.closePath(); }
        else ctx.arc(x, y, r, 0, Math.PI * 2);
    }

    _shape(ctx, type, x, y, r) { this._path(ctx, type, x, y, r); ctx.fill(); }

    /**
     * The nodes, the lifted ones (`lifted`) or the rest. A lifted node sits on a hairline of the
     * ground (a stroke of its shape in the ground's colour, `liftHairline` px outside it), its
     * colour easing to the deep one.
     */
    _drawNodes(ctx, view, lifted = false) {
        const ground = rgba(this.ink.ground, 1);
        ctx.lineJoin = 'round';
        for (const it of view.list) {
            if ((it.lift > 0) !== lifted) continue;
            ctx.globalAlpha = it.alpha;
            this._path(ctx, it.type, it.sx, it.sy, it.r);
            if (lifted) { ctx.strokeStyle = ground; ctx.lineWidth = 2 * ATLAS.liftHairline * it.lift; ctx.stroke(); }
            ctx.fillStyle = this.fills[it.i];
            ctx.fill();
            if (lifted) { ctx.globalAlpha = it.alpha * it.lift; ctx.fillStyle = this.deeps[it.i]; ctx.fill(); }
        }
        ctx.globalAlpha = 1;
    }

    /** The Favorites home: a quiet ring round each anchor. */
    _anchorsDrawn() { return Boolean(!this.focus && this.homeGraph && !(this.lit && !this._litIsDefault && !this.discover)); }

    _drawHome(ctx, view) {
        const home = this.homeGraph;
        if (!this._anchorsDrawn()) return;
        ctx.strokeStyle = rgba(this.ink.dim, 0.9); ctx.lineWidth = 1;
        for (const anchor of home.anchors || []) {
            const it = view.byId.get(anchor.id);
            if (!it) continue;
            ctx.beginPath(); ctx.arc(it.sx, it.sy, it.r + ATLAS.anchorRing, 0, Math.PI * 2); ctx.stroke();
        }
    }

    /** The dots a selected artist or label shows (sunflowerAlbums): its albums, (in Discover) its not-owned releases, its tracks. */
    _albumList() {
        const f = this.focus;
        if (!f || (f.type !== 'artist' && f.type !== 'label') || !this.atlas.byId.has(f.id)) return [];
        const outlines = this.discover ? this.layer.outlineSatellites : [];
        if (this._albumsFor === f && this._albumsShow === this.show && this._albumsOutlines === outlines) return this._albums;
        this._albumsFor = f; this._albumsShow = this.show; this._albumsOutlines = outlines;
        return (this._albums = sunflowerAlbums(f.payload.satellites, outlines, this.show));
    }

    /** The selection's ring, its albums from `albumZoom` × 0.8, and an off-atlas selection's soft dot. */
    /** The soft dot's room in map units: an owned node with one track, lifted with the selection it is. */
    _softR() { return liftedRoom(1, 'album', this.atlas.steps.refK); }

    /** From an album or track's artist to its soft dot, in map units: touching, with 6 px between. */
    _softDistance(hostIndex) { return this._roomR(hostIndex) + this._softR() + 6 / this.atlas.steps.refK; }

    /**
     * An album or track selection's soft dot in map units ({ x, y, host }), up and right of the
     * artist it hangs off: where that artist is now (`now`), where it settles (`settled`) or its
     * step spot before making room (`step`). Null for any other selection, or while its artist
     * is not on the map.
     */
    _softSpot(at = 'settled') {
        const f = this.focus, s = this.settle, atlas = this.atlas;
        if (!f?.host || !s || !atlas?.steps || atlas.byId.has(f.id)) return null;
        const host = atlas.byId.get(f.host)?.i;
        if (host == null || !s.live[host]) return null;
        const [xs, ys] = at === 'now' ? [s.x, s.y] : at === 'step' ? [s.bx, s.by] : [s.lx, s.ly];
        const d = this._softDistance(host);
        return { x: xs[host] + d * Math.SQRT1_2, y: ys[host] - d * Math.SQRT1_2, host };
    }

    /**
     * The album sunflower's reach round its node, in map units, at the zoom it starts to show
     * (ATLAS.albumZoom × 0.8). Past it the sunflower only gets smaller in map units, so the room holds.
     */
    _sunflowerReach(i) {
        const from = ATLAS.albumZoom * 0.8, base = this._radiusOf(i, from) + 14;
        let px = 0;
        for (const s of albumSpots(this._albumList(), 0, 0, base)) px = Math.max(px, Math.hypot(s.x, s.y) + s.r);
        return (px + ATLAS.stepPad) / (this.mapK * from);
    }

    /**
     * What a selection makes room round (Settle.makeRoom's `clearing`), at its view scale: the
     * scale of the camera that follows it, worked out from its rings' step spots, so `roomClearPx`
     * and `roomMaxPx` are px there. Its lines are the ring's edges as drawn (each link's curl);
     * each ring node's name box sits under it, as names place first.
     */
    _clearing() {
        const f = this.focus, atlas = this.atlas, s = this.settle, refK = atlas.steps.refK;
        const nodes = atlas.nodes, own = atlas.byId.get(f.id)?.i ?? null;
        const pts = [];
        for (const i of this.ring.set) if (s.live[i] && s.want[i]) pts.push({ x: s.bx[i], y: s.by[i], r: ATLAS.followReach * sizePx(nodes[i].weight) / refK });
        // Where an off-atlas focus is drawn: its soft dot beside its artist, else its placed spot.
        const at = own == null && f.pos ? this._softSpot('step') || f.pos : null;
        if (at) pts.push({ x: at.x, y: at.y, r: ATLAS.followReach * sizePx(1) / refK });
        const k = ringCamera(pts, { W: this.W, H: this.H, fitK: this.mapK })?.k;
        if (!k) return null;
        const zoom = k / this.mapK, widths = this._nameWidths;
        const focusAt = at ? { x: at.x, y: at.y, r: this._softR() } : null;
        // The names that place first, the selection's, its first ring's and its shared nodes', under
        // their nodes (deeper names fit where the budget lets them): each box round its node.
        const boxes = new Map();
        for (const i of [own, ...this.ring.edges.filter(([, , d]) => d === 0).map(([, to]) => to), ...(this.ring.shared || [])]) {
            if (i == null || boxes.has(i)) continue;
            const name = labelText(nodes[i].name), tier = i === own ? 0 : 1, h = ATLAS.nameSizes[tier];
            const w = (widths?.get(`${tier}\u0001${name}`) ?? name.length * h * 0.56) + 2 * ATLAS.namePad;
            const R = this._radiusOf(i, zoom) * ATLAS.liftScale * (this.ring.shared?.has(i) ? ATLAS.sharedScale : 1) + (i === own ? ATLAS.selectRing + 0.5 : 0);
            boxes.set(i, { x0: -w / 2 / k, x1: w / 2 / k, y0: (R + ATLAS.nameGap - ATLAS.namePad) / k, y1: (R + ATLAS.nameGap + h + ATLAS.namePad) / k });
        }
        const ids = (i) => (i === -1 ? f.id : nodes[i].id);
        return {
            edges: this.ring.edges.map(([a, b]) => [a, b]), curves: this.ring.edges.map(([a, b]) => linkHashes(ids(a), ids(b))), focusAt, boxes,
            clear: ATLAS.roomClearPx / k, cap: ATLAS.roomMaxPx / k, passes: ATLAS.roomPasses,
        };
    }

    /** The worker that makes room off the main thread (atlas-room-worker.js), where there are workers. */
    _roomWorker() {
        if (this._roomWorkerFailed || typeof globalThis.Worker !== 'function') return null;
        if (!this._worker) {
            try {
                this._worker = new globalThis.Worker(new URL('./atlas-room-worker.js', import.meta.url), { type: 'module' });
                this._worker.onmessage = (e) => this._roomBack(e.data);
                this._worker.onerror = () => { this._roomWorkerFailed = true; this._worker = null; this._makeRoom(); };
            } catch (_) { this._roomWorkerFailed = true; return null; }
        }
        return this._worker;
    }

    _roomOff(job, settle, work) {
        this._roomWork = { job, settle, work };
        this._worker.postMessage({ job, work });
    }

    /** The worker's room: eased into unless a newer room (or another map) has been asked for since. */
    _roomBack({ job, xy }) {
        const w = this._roomWork;
        if (!w || w.job !== job || w.settle !== this.settle || !this._active) return;
        this._roomWork = null;
        this.settle.applyRoom(w.work, xy, performance.now(), { animate: !this.reduced });
        this._labels = null; this._domPending = true;
        this._dirty();
    }

    /** Map units of padding a pair may share and still count as clear: half the step layouts' pad (ATLAS.stepPad). */
    _slack() { return 0.5 * ATLAS.stepPad / (this.atlas?.steps?.refK || this.mapK || 1); }

    /** What never moves to make room: the focus, its artist and Discover's anchors (atlas indices). */
    _pinned() {
        const atlas = this.atlas, out = new Set();
        for (const id of [this.focus?.id, this.focus?.host, ...(this.discover ? this.layer.anchors.map((a) => a.id) : [])]) {
            const n = id && atlas.byId.get(id);
            if (n) out.add(n.i);
        }
        return out;
    }

    /**
     * What the selection draws beside the shown nodes, as circles in map units at their settled
     * spots: an album or track's soft dot, a focus with no node of its own, and (zoomed past
     * where it shows) the album sunflower.
     */
    _obstacles() {
        const f = this.focus, atlas = this.atlas, s = this.settle;
        if (!f?.pos || !atlas?.steps || !s) return [];
        const own = atlas.byId.get(f.id), host = f.host ? atlas.byId.get(f.host) : null;
        if (own) {
            const room = this._albumRoom && this._albumList().length && s.live[own.i];
            return room ? [{ x: s.lx[own.i], y: s.ly[own.i], r: this._sunflowerReach(own.i) }] : [];
        }
        if (host && s.live[host.i] && s.want[host.i]) {
            const d = this._softDistance(host.i);
            return [{ x: s.lx[host.i] + d * Math.SQRT1_2, y: s.ly[host.i] - d * Math.SQRT1_2, r: this._softR() }];
        }
        // Drawn 4 px across at its placed spot (an outside focus as an outline its size).
        return [{ x: f.pos.x, y: f.pos.y, r: Math.max(4 / this.mapK, this._softR()) + ATLAS.stepPad / atlas.steps.refK }];
    }

    /**
     * The shown nodes make room round the selection's extras and Discover's outlines (Settle.makeRoom);
     * an outline and an owned node push each other, so a ring of outlines never traps what it circles.
     */
    _makeRoom(animate = !this.reduced) {
        if (!this.settle || !this.atlas?.steps || !this.mapK) return;
        const pinned = this._pinned(), obstacles = this._obstacles();
        const outlines = this.discover ? this.layer.settleAmong(pinned, obstacles) : [];
        // A selection's rings are lifted: they take their lifted room, only the obstacles and the
        // pinned move them, and the rest make room round their lines, nodes and names.
        const ring = this.focus ? this.ring?.set || null : null;
        // Animated, the room is worked out in a worker and eased into when it is back, so a
        // selection never waits on it; snapped (reduced motion, tests), it is worked out at once.
        this._roomJobs = (this._roomJobs || 0) + 1;
        const job = this._roomJobs, settle = this.settle;
        this._roomWork = null;
        const later = animate && ring ? this._roomWorker() && ((work) => this._roomOff(job, settle, work)) : null;
        settle.makeRoom(obstacles, (i) => this._roomR(i), performance.now(), { animate, pinned, movable: outlines, ring, clearing: ring ? this._clearing() : null, later: later || null, slack: this._slack() });
        for (const o of outlines) { o.node.px = o.x; o.node.py = o.y; }
        this._dirty();
    }

    _drawSelection(ctx, view, now) {
        this._albumSpots = []; this._drawnSpots = [];
        this._drawPeek(ctx, view);
        const f = this.focus, fs = view.focusScreen;
        if (!f || !fs) return;
        const t = this._selT(now);
        if (fs.soft) {
            // Lifted like a selected node: full strength, on a hairline of the ground, its colour easing to its artist's deep one.
            const host = fs.host ? fs.host.i : null, L = fs.lift || 0;
            ctx.globalAlpha = lerp(0.9, 1, L);
            ctx.beginPath(); ctx.arc(fs.x, fs.y, fs.r, 0, Math.PI * 2);
            if (L) { ctx.strokeStyle = rgba(this.ink.ground, 1); ctx.lineWidth = 2 * ATLAS.liftHairline * L; ctx.stroke(); }
            ctx.fillStyle = host != null ? this.softs[host] : rgba(this.ink.dim, 1);
            ctx.fill();
            if (L && host != null) { ctx.globalAlpha = L; ctx.fillStyle = this.deeps[host]; ctx.fill(); }
        }
        if (!(f.outside && this.discover)) {
            ctx.globalAlpha = t; ctx.strokeStyle = rgba(this.ink.dim, 1); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(fs.x, fs.y, fs.r + ATLAS.selectRing, 0, Math.PI * 2); ctx.stroke();
        }
        const list = this._albumList(), from = ATLAS.albumZoom * 0.8;
        if (!list.length || view.zoom < from || !fs.item) { ctx.globalAlpha = 1; return; }
        const { g, growing } = albumGrow({ zoom: view.zoom, now, startedAt: f.startedAt, reduced: this.reduced });
        if (growing) this._dirty();
        const spots = albumSpots(list, fs.x, fs.y, fs.r + 14), i = fs.item.i;
        for (const s of spots) {
            if (s.album.outside) {
                ctx.globalAlpha = 0.85 * g; ctx.strokeStyle = this.fills[i]; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.5, s.r), 0, Math.PI * 2); ctx.stroke();
            } else {
                ctx.globalAlpha = 0.85 * g; ctx.fillStyle = this.softs[i];
                ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.5, s.r), 0, Math.PI * 2); ctx.fill();
            }
        }
        if (g > 0.3) this._albumSpots = spots;
        if (g > 0) this._drawnSpots = spots;
        ctx.globalAlpha = 1;
    }

    /** The peeked node (atlas-peek.js): a thin ring in its own colour, `selectRing` out, while Info shows it. */
    _drawPeek(ctx, view) {
        const it = this.peek && view.byId.get(this.peek.id);
        if (!it) return;
        ctx.globalAlpha = 1; ctx.strokeStyle = this.fills[it.i]; ctx.lineWidth = ATLAS.peekRingWidth;
        ctx.beginPath(); ctx.arc(it.sx, it.sy, it.r + ATLAS.selectRing, 0, Math.PI * 2); ctx.stroke();
    }

    /**
     * The always-named, by node index, with their tier: the selection 0; its host artist, its
     * first ring, its shared nodes, the hovered node, a pulled node and what it pulls, and the
     * home's anchors 1. `claims` (the selection, its first ring and its shared nodes) place first.
     */
    _strongIndices() {
        const strong = new Map(), f = this.focus, nodes = this.atlas.byId;
        const claims = this._claims = new Set();
        const put = (i, t) => { if (i != null && !(strong.get(i) <= t)) strong.set(i, t); };
        if (f) {
            const own = nodes.get(f.id)?.i;
            put(own, 0); if (own != null) claims.add(own);
            if (f.host) put(nodes.get(f.host)?.i, 1);
            for (const [, to, d] of this.ring?.edges || []) if (d === 0) { put(to, 1); claims.add(to); }
            for (const i of this.ring?.shared || []) { put(i, 1); claims.add(i); }
        } else for (const a of this.homeGraph?.anchors || []) put(nodes.get(a.id)?.i, 1);
        if (this.hover?.kind === 'node' && this.hover.n) put(this.hover.n.i, 1);
        const p = this.tug?.pulled;
        if (p?.on && p.i != null) { put(p.i, 1); for (const [j] of p.links) put(j, 1); }
        // The visualizer names the branch in view, and nothing of the rest of the map.
        if (this.viz?.on) return this.viz.named();
        return strong;
    }

    _drawNames(ctx, view) {
        const strong = this._strongIndices(), f = this.focus;
        const drawnArtists = new Set(view.list.filter((it) => it.type === 'artist').map((it) => it.id));
        const candidates = [], seen = new Set(), hovered = this.hover?.id;
        // The hovered node's name shows whole.
        const nameOf = (id, name) => labelText(name, id === hovered ? Infinity : undefined);
        const add = (it, tier) => {
            if (!it || seen.has(it.id) || it.scale < 0.6) return;
            seen.add(it.id);
            const collab = it.type === 'artist' && isCollaboration(it.name, it.id, (id) => drawnArtists.has(id));
            candidates.push({ i: it.i, id: it.id, x: it.sx, y: it.sy, r: it.r + this._ringOf(it), name: nameOf(it.id, it.name), strong: tier < 2, tier, claim: Boolean(this._claims?.has(it.i)), rim: this.atlas.rim[it.i], collab });
        };
        // An off-atlas selection still shows its name.
        if (f && view.focusScreen && !view.focusScreen.item && !(f.outside && this.discover)) {
            candidates.push({ i: -1, id: f.id, x: view.focusScreen.x, y: view.focusScreen.y, r: view.focusScreen.r + ATLAS.selectRing + 0.5, name: nameOf(f.id, f.name), strong: true, tier: 0, claim: true });
            seen.add(f.id);
        }
        for (const [i, tier] of strong) add(view.byIndex.get(i), tier);
        if (this.discover) for (const c of this.layer.labelCandidates(this.hover?.id)) {
            if (seen.has(c.id)) continue;
            seen.add(c.id);
            const ringed = c.pinned >= 5 || c.id === this.layer.selected;
            const tier = c.pinned >= 5 || c.id === this.layer.selected ? 0 : c.pinned >= 3 ? 1 : 2;
            candidates.push({ i: -1, id: c.id, x: c.sx, y: c.sy, r: c.r + 0.5 + (ringed ? ATLAS.selectRing : 0), name: nameOf(c.id, c.name), strong: tier < 2, tier, outside: true });
        }
        const budget = this.viz?.on ? 0 : nameBudget(view.zoom);
        let k = 0;
        for (const i of this._byWeight) {
            if (k >= budget * 4) break;
            const it = view.byIndex.get(i);
            if (!it || !this.settle.want[i]) continue;
            add(it, 2); k++;
        }
        // Widths are kept, in the tier each is drawn at: measuring text is most of what placing names costs.
        const widths = this._nameWidths || (this._nameWidths = new Map());
        const measure = (name, tier) => {
            const key = `${tier}\u0001${name}`;
            let w = widths.get(key);
            if (w === undefined) { ctx.font = NAME_FONTS[tier]; w = ctx.measureText(name).width; widths.set(key, w); }
            return w;
        };
        const placed = placeNames(candidates, { W: this.W, H: this.H, measure, chrome: this._chrome(), obstacles: this._nameObstacles(view), lines: this._lineSegs || [], zoom: view.zoom, budget });
        this._placedNames = placed;
        this._labels = new Map();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const textCss = rgba(this.ink.text, 1), dimCss = rgba(this.ink.dim, 1);
        const scaleOf = (p) => { const it = p.i >= 0 ? view.byIndex.get(p.i) : null; return it ? it.scale : 1; };
        for (const p of placed) this._labels.set(p.id, p.box);
        // A thin outline in the ground's colour first, so a name reads over nodes and arcs; on bare ground it is invisible.
        ctx.lineJoin = 'round'; ctx.lineWidth = ATLAS.nameHalo; ctx.strokeStyle = rgba(this.ink.ground, 1);
        for (const p of placed) {
            ctx.font = NAME_FONTS[p.tier];
            ctx.globalAlpha = scaleOf(p);
            ctx.strokeText(p.name, p.x, p.y);
        }
        // The always-named and a selection's ring nodes in --text; what a selection or lit set leaves out fades with its node.
        for (const p of placed) {
            const it = p.i >= 0 ? view.byIndex.get(p.i) : null, lifted = (it?.lift || 0) >= 0.5;
            const fade = p.strong || lifted ? 1 : it ? (it.faded ? view.dimBy : 1) : f ? view.dimBy : 1;
            ctx.font = NAME_FONTS[p.tier];
            ctx.globalAlpha = scaleOf(p) * ATLAS.nameAlpha * fade;
            ctx.fillStyle = p.strong || lifted ? textCss : dimCss;
            ctx.fillText(p.name, p.x, p.y);
        }
        ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }

    /**
     * Everything drawn that names rather keep clear of, as shapes (inShape): nodes and their
     * rings, the selection's dot, album dots, Discover's outlines. A ringed one (the
     * selection, the playing artist, a home anchor) is `hard`: no name covers it.
     */
    _nameObstacles(view) {
        const out = view.list.map((it) => { const ring = this._ringOf(it); return { x: it.sx, y: it.sy, r: it.r, label: it.type === 'label', ring, hard: ring > 0 }; });
        const fs = view.focusScreen;
        if (fs && !fs.item) out.push({ x: fs.x, y: fs.y, r: fs.r, ring: ATLAS.selectRing + 0.5, hard: true });
        for (const s of this._drawnSpots || []) out.push({ x: s.x, y: s.y, r: s.r + (s.album.outside ? 0.5 : 0) });
        if (this.discover) for (const o of this.layer.screen) out.push({ x: o.sx, y: o.sy, r: o.r + 0.5, ring: o.focus || o.id === this.layer.selected ? ATLAS.selectRing : 0, hard: Boolean(o.focus || o.id === this.layer.selected) });
        return out;
    }

    /** The controls over the canvas, so names keep out of them; read again once per settle. */
    _chrome() {
        if (this._chromeBoxes) return this._chromeBoxes;
        const base = this.el('atlas')?.getBoundingClientRect();
        if (!base) return [];
        return (this._chromeBoxes = [...this.el('atlas').querySelectorAll('.atlas-top > :not([hidden]), .atlas-corner, .atlas-note:not([hidden]), .atlas-status:not([hidden])')].map((e) => {
            const b = localRect(e.getBoundingClientRect(), base); // through the sideways turn on a phone
            return { x0: b.x0 - 6, x1: b.x1 + 6, y0: b.y0 - 6, y1: b.y1 + 6 };
        }));
    }
}
