// Discover › Graph on top of the atlas: music you don't own as hollow 1 px circles, on
// rings around what they sit near and kept clear of every shown owned node; a focused
// artist's or label's not-owned releases join its album sunflower (atlas-draw.js); the
// sources line, the walk outward (the "Via" trail) and Dig. Outlines take the colour of
// the owned node nearest them.
// AtlasView owns the canvas, camera and events and calls in here when its mode is
// 'discover'. Placement rules are pure in outside.js; every number is in atlas-config.js.
import { ATLAS } from './atlas-config.js';
import { toScreen, toWorld, rgba } from './atlas-geometry.js';
import { sizePx, zoomGrow, roomPx } from './atlas-look.js';
import {
    placeOutside, placeAmong, splitOutside, brightIds, sourcesLine, releaseFromNode, sourcesLoading,
} from './outside.js';
import { escapeHtml } from '../html.js';

export const OUTSIDE_TYPE_WORD = { artist: 'Artist', label: 'Label', release: 'Release' };

/** The cap on outside results: overall around a focus, per favorite on the home graph. */
export function limitedOutside(nodes, cap = Infinity, { perAnchor = false } = {}) {
    if (!Number.isFinite(cap)) return [...(nodes || [])];
    if (!perAnchor) return (nodes || []).slice(0, Math.max(0, cap));
    const counts = new Map();
    return (nodes || []).filter((node) => {
        const key = node.anchor || '', n = counts.get(key) || 0;
        if (n >= cap) return false;
        counts.set(key, n + 1);
        return true;
    });
}

export default class DiscoverLayer {
    constructor(view) {
        this.view = view;
        // The walk outward: the outline clicked last ({ id, name, x, y }), and the step
        // each outside focus was reached from (id → name), for the panel's "Via" line.
        this.clicked = null; this.trail = new Map();
        this.reset();
    }

    reset() {
        this.nodes = []; this.byId = new Map(); this.anchors = []; this.discogs = null; this.sources = null; this.selected = null; this.focusNode = null;
        this.outlineSatellites = []; this.bright = { lit: new Set(), near: new Set() }; this.screen = []; this.context = null;
    }

    /** A Discover focus payload. Its own releases become outline satellites (`this.outlineSatellites`); the rest go on rings. */
    setFocus(payload, focus, step = ATLAS.hoodSteps[0]) {
        const { satellites, ring } = splitOutside(limitedOutside(payload.outside, step.outside), focus);
        this.anchors = [];
        this.context = { id: focus.id, type: focus.type, name: focus.name, ...(focus.outside ? { outside: true } : {}) };
        this.outlineSatellites = satellites.map((n) => ({ ...n, outside: true, trackIds: [] }));
        const at = focus.pos ? { x: focus.pos.x, y: focus.pos.y } : null;
        // An artist or label you don't own: drawn as an outline, its neighbourhood ringed round it.
        this.focusNode = focus.outside ? { id: focus.id, type: focus.type, name: focus.name, discogsId: focus.discogsId, reasons: [], score: 1 } : null;
        this._place(ring, focus.outside ? { centre: at } : { fallback: at });
        this.discogs = payload.discogs || null;
        this.sources = payload.sources || null;
        this.bright = brightIds({ focusId: focus.id, hostId: focus.host, outside: [...this.nodes, ...this.outlineSatellites], lit: focus.outside ? (payload.neighbours || []).map((n) => n.id) : [] });
    }

    /** No focus: outside nodes around each recent favorite. */
    setAnchors(payload, step = ATLAS.hoodSteps[0]) {
        const atlas = this.view.atlas;
        this.anchors = (payload.anchors || []).map((a) => ({ ...a, node: atlas.byId.get(a.id) })).filter((a) => a.node);
        this.context = null;
        this.outlineSatellites = [];
        this.focusNode = null;
        this._place(limitedOutside(payload.outside, step.outside, { perAnchor: true }), { centres: new Map(this.anchors.map((a) => [a.id, { x: a.node.x, y: a.node.y }])) });
        this.discogs = payload.discogs || null;
        this.sources = payload.sources || null;
        this.bright = brightIds({ anchors: this.anchors, outside: this.nodes });
    }

    _place(list, opts) {
        this.nodes = placeOutside(list, this.view.atlas, opts);
        this.byId = new Map(this.nodes.map((n) => [n.id, n]));
        if (this.view._makeRoom) this.view._makeRoom(); else this.settleAmong();
        this.recolour();
        if (this.selected && !this.find(this.selected)) this.selected = null;
    }

    /**
     * Where each outline sits (`px`, `py`): its ring spot, pushed clear of each other, of what
     * the selection draws (`obstacles`) and of the owned nodes that never move (`pinned`: the
     * focus, its artist, the anchors). The other shown owned nodes make room round them
     * (AtlasCanvas._makeRoom). → the outlines as { x, y, r, node }, in map units.
     */
    settleAmong(pinned = new Set(), obstacles = []) {
        const v = this.view, s = v.settle, atlas = v.atlas;
        if (!this.nodes.length) return [];
        if (!s || !atlas?.steps || !v._mapR) { for (const n of this.nodes) { n.px = n.x; n.py = n.y; } return []; }
        const walls = [...obstacles];
        for (const i of pinned) if (s.live[i] && s.want[i]) walls.push({ x: s.bx[i], y: s.by[i], r: v._roomR ? v._roomR(i) : v._mapR(i) });
        const r = roomPx(1) / atlas.steps.refK;
        return placeAmong(this.nodes, walls, r).map((p, k) => {
            this.nodes[k].px = p.x; this.nodes[k].py = p.y;
            return { x: p.x, y: p.y, r, node: this.nodes[k] };
        });
    }

    /** Outlines take the colour of the owned node nearest them; called again when the colours change. */
    recolour() {
        if (!this.view.colourNear) return;
        for (const n of this.nodes) n.colour = this.view.colourNear({ x: n.x, y: n.y });
    }

    find(id) { return this.byId.get(id) || this.outlineSatellites.find((n) => n.id === id) || (this.focusNode?.id === id ? this.focusNode : null); }

    /** Owned atlas nodes dim; the focus or anchors stay bright, and what outside nodes sit near sits between. */
    alphaFor(id) {
        if (this.bright.lit.has(id)) return 1;
        return this.bright.near.has(id) ? ATLAS.discoverNearAlpha : ATLAS.discoverDim;
    }

    /** Ids whose Discogs job landing should refetch: what was missing, the focus, the anchors, the releases shown. */
    watchIds() {
        return new Set([...(this.discogs?.missing || []), ...(this.discogs?.refreshing || []), this.context?.id, ...this.anchors.map((a) => a.id), ...this.visibleReleases()].filter(Boolean));
    }

    /** The outside releases on screen whose details the queue fetches at priority 1 (at most 20). */
    visibleReleases(max = 20) {
        return [...this.outlineSatellites, ...this.nodes].filter((n) => n.type === 'release' && /^release:discogs:\d+$/.test(n.id)).slice(0, max).map((n) => n.id);
    }

    /** The bottom-left line: one part per source working on the focus. */
    line() { return sourcesLine({ discogs: this.discogs, sources: this.sources || {}, outside: [...this.nodes, ...this.outlineSatellites] }); }

    /** "Why near" for an outside node: the focus, or the anchor it gathered around. */
    contextFor(node) {
        if (this.context) return this.context;
        const a = this.anchors.find((x) => x.id === node.anchor);
        return a ? { id: a.id, type: a.type, name: a.name } : null;
    }

    // ---- the walk, sources and Dig ----

    /** The step an outside focus was reached from, for its panel: "Via DDS". */
    via(id) { return this.trail.get(id) || null; }

    /**
     * An outline artist or label is selected where it was drawn,
     * by the Discogs id that put it there. A release opens its panel.
     */
    walkTo(it) {
        const v = this.view, node = it?.node || it;
        if (!node) return;
        if (node.id === v.focus?.id) return v.showInfo(); // the selection again opens it in Info
        if (!v.discover || (node.type !== 'artist' && node.type !== 'label') || !node.discogsId) return this.open(node);
        const at = Number.isFinite(it.sx) ? toWorld(v.cam, v.W, v.H, it.sx, it.sy) : { x: node.x, y: node.y };
        this.clicked = { id: node.id, name: node.name, x: at.x, y: at.y };
        if (v.focus) this.trail.set(node.id, v.focus.name);
        v.wantPanel = true;
        return v._go({ focus: node.id, ref: `discogs:${node.type}:${node.discogsId}` });
    }

    /** A focus payload: in Discover, outside nodes on rings, outline satellites, the sources line. */
    apply(payload) {
        const v = this.view;
        if (!v.discover) { this.reset(); return; }
        this.setFocus(payload, v.focus, v.step);
        this.status(this.line());
        v.app.discoverPanel?.update(v);
        v.app.panel?.refreshNear?.(v.focus?.id);
    }

    /** Provider data landed for something on the graph: refetch once, in place. */
    refresh() {
        clearTimeout(this._refreshTimer);
        this._refreshTimer = setTimeout(async () => {
            const v = this.view;
            if (!v._active || !v.discover || !v.atlas) return;
            const generation = v._generation, alive = () => v._active && generation === v._generation;
            try {
                if (v.focus) {
                    const asked = Date.now();
                    const payload = await v.data.focus(v.focus.id, { isAlive: alive, mode: 'discover' });
                    if (!payload || !alive() || payload.focus?.id !== v.focus?.id) return;
                    v.focus.payload = payload;
                    this.askedAt = asked; // a Dig is answered by a payload asked for after it
                    this.apply(payload);
                    v._albumsFor = null;
                    v._refreshRing();
                } else {
                    const payload = await v.data.discover({ per: ATLAS.hoodSteps[0].outside, isAlive: alive });
                    if (!payload || !alive() || v.focus) return;
                    v.homeGraph = payload;
                    this.setAnchors(payload);
                    v.app.discoverPanel?.update(v);
                    this.status(this.line());
                }
                v._labels = null; v._domPending = true;
                v._dirty();
            } catch (_) { /* the line keeps saying loading; the next event retries */ }
        }, ATLAS.discogsRefreshMs);
    }

    /**
     * The bottom-left line: parts ({ text, href?, retry? }, one per source)
     * joined with " · ", or null. While a source loads, the focus refetches.
     */
    status(line) {
        const el = this.view.el?.('atlasStatus');
        if (!el) return;
        const parts = Array.isArray(line) ? line : line ? [line] : [];
        el.hidden = !parts.length;
        el.innerHTML = parts.map((p) => (p.href ? `<a href="${escapeHtml(p.href)}">${escapeHtml(p.text)}</a>`
            : p.retry ? `<button type="button" class="atlas-retry" data-retry="${escapeHtml(p.retry)}">${escapeHtml(p.text)}</button>` : escapeHtml(p.text))).join(' · ');
        clearTimeout(this._pollTimer);
        if (sourcesLoading(parts) && this.view.discover) this._pollTimer = setTimeout(() => this.refresh(), ATLAS.sourcesPollMs);
    }

    /** A source's failed checks for this focus, asked for again. */
    async retry(source) {
        try {
            await fetch('/api/atlas/sources/retry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source, focus: this.view.focus?.id || null }) });
        } catch (_) { /* the line keeps saying retry */ }
        this.refresh();
    }

    /** Dig: the server requeues the provider work behind the focus (POST /api/atlas/dig); the graph refetches. */
    async dig() {
        const v = this.view;
        if (!v.discover || !v.focus) return null;
        const out = await v.data.dig(v.focus.id);
        this.refresh();
        return out;
    }

    /** The graph unmounted or remounted: no refetch is left waiting. */
    stop() { clearTimeout(this._refreshTimer); clearTimeout(this._pollTimer); }

    // ---- drawing ----

    /** Where an arc meets an owned node: its spot and drawn shape (AtlasCanvas._endOf). */
    _screenOf(view, id) {
        const n = this.view.atlas.byId.get(id);
        return n ? this.view._endOf(view, n.i) : null;
    }

    /** Over the nodes: each outside node's faint arc to what it sits near, then its hollow circle. */
    draw(ctx, view) {
        const v = this.view, { cam, W, H } = v, refK = v.atlas.steps?.refK || v.mapK;
        const r = sizePx(1) * (v.mapK / refK) * zoomGrow(view.zoom);
        const hover = v.hover?.id;
        this.screen = [];
        ctx.lineCap = 'round';
        for (const n of this.nodes) {
            if (!v.shows(n.type) && n.id !== this.selected) continue; // Show: a release is an album; the selected one always shows
            const s = toScreen(cam, W, H, n.px ?? n.x, n.py ?? n.y);
            if (s.x < -40 || s.y < -40 || s.x > W + 40 || s.y > H + 40) continue;
            this.screen.push({ node: n, id: n.id, type: n.type, name: n.name, sx: s.x, sy: s.y, r });
            const to = n.near?.length ? this._screenOf(view, n.near[0]) : null;
            // From the outline's edge (1 px stroke) to the owned node's.
            if (to) v._arc(ctx, { id: n.id, x: s.x, y: s.y, r: r + 0.5, ring: this.selected === n.id ? ATLAS.selectRing : 0 }, to, `${n.id}|${n.near[0]}`, { width: 0.6, alpha: ATLAS.outsideArcOpacity * (hover === n.id ? 2.4 : 1), cb: n.colour, dashed: true });
        }
        const fs = this.focusNode && view.focusScreen;
        if (fs) this.screen.push({ node: { ...this.focusNode, colour: this.focusColour() }, id: this.focusNode.id, type: this.focusNode.type, name: this.focusNode.name, sx: fs.x, sy: fs.y, r: r * 1.6, focus: true });
        // Not owned is always a hollow circle, whatever its kind.
        ctx.lineWidth = 1;
        for (const it of this.screen) {
            const n = it.node;
            ctx.globalAlpha = 0.92;
            ctx.strokeStyle = rgba(n.colour, 1);
            ctx.beginPath(); ctx.arc(it.sx, it.sy, it.r, 0, Math.PI * 2); ctx.stroke();
            if (it.focus || this.selected === n.id) {
                ctx.strokeStyle = rgba(v.ink.dim, 1);
                ctx.beginPath(); ctx.arc(it.sx, it.sy, it.r + ATLAS.selectRing, 0, Math.PI * 2); ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
    }

    /** An outside focus takes the colour of the owned node nearest where it is drawn. */
    focusColour() {
        const pos = this.view.focus?.pos;
        return pos && this.view.colourNear ? this.view.colourNear(pos) : this.view.ink.text;
    }

    hitAt(sx, sy) {
        for (const it of [...this.screen].reverse()) {
            if (Math.hypot(it.sx - sx, it.sy - sy) <= it.r + ATLAS.hitPad) return { kind: 'outside', ...it };
        }
        return null;
    }

    /** Name candidates: the best-ranked outside nodes (relative rank within their source, else score) compete for the label budget like the focus neighbourhood. */
    labelCandidates(hoverId) {
        return this.screen.map((it) => ({
            id: it.id, type: 'artist', name: it.name, sx: it.sx, sy: it.sy, r: it.r, weight: 0,
            pinned: it.focus ? 5 : hoverId === it.id ? 4 : this.selected === it.id ? 3.5 : 1.5 + (Number(it.node.rank ?? it.node.score) || 0),
        }));
    }

    // ---- the panel ----

    /** Open what an outside node is: the release panel, or the not-owned artist or label panel. */
    open(node) {
        const panel = this.view.app.panel;
        if (!panel || !node) return;
        this.selected = node.id;
        this.view._dirty();
        if (node.type === 'release') return panel.show('release', { release: releaseFromNode(node) }, { focus: false });
        // The outside focus itself: no "why near"; the step it was reached from.
        const isFocus = this.focusNode?.id === node.id;
        return panel.show('outside', { node, context: isFocus ? null : this.contextFor(node), via: isFocus ? this.via(node.id) : null }, {
            focus: false,
            onFocusEntity: (e) => this.view.focusOn(e.id),
            onRelease: (release) => {
                if (this.find(release.key)) { this.selected = release.key; this.view._dirty(); }
                panel.show('release', { release }, { focus: false });
            },
        });
    }
}
