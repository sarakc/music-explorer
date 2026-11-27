// The visualizer: the graph to watch while listening, opened from the player (its wave) or the map's corner. While it is on, the camera
// travels the selection's network by itself (atlas-trip.js) at the playing track's pace, the
// rest of the map goes to the effects layer behind (atlas-fx.js), and the network is drawn
// clean on top by the graph's own passes. AtlasCanvas._frame hands each frame here.
// Spec: docs/specs/2026-11-22-graph-visualizer-design.md.
import { ATLAS } from './atlas-config.js';
import { Trip, tripNetwork, tripBpm } from './atlas-trip.js';
import AtlasFx from './atlas-fx.js';
import { ringCamera } from './atlas-motion.js';
import { toWorld, rgba } from './atlas-geometry.js';
import { sizePx } from './atlas-look.js';
import { readViz, writeViz, VIZ_FX, VIZ_JOURNEYS } from './atlas-options.js';

const lerp = (a, b, t) => a + (b - a) * t;

/** An rgb colour's hue, 0 to 1 (0 for a grey). */
export function hueOf([r, g, b] = [0, 0, 0]) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!d) return 0;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return ((h / 6) % 1 + 1) % 1;
}

export default class AtlasVisualizer {
    constructor(view) {
        this.view = view; this.on = false;
        this.prefs = readViz();
    }

    toggle() { return this.on ? this.stop() : this.start(); }

    /** On: the graph goes full screen on Night sky's ground, the selection is the playing track when one plays, and the journey begins. */
    start() {
        const v = this.view;
        if (this.on || !v._active || !v.atlas || !v.cam || v.reduced) return;
        this.on = true;
        this.prefs = readViz();
        this._wasFull = Boolean(v.full); this._wasNight = Boolean(v.night);
        this._listeners = [];
        const root = v.el('atlas');
        root.classList.add('is-viz');
        document.body.classList.add('atlas-viz');
        this.fxCanvas = document.createElement('canvas');
        this.fxCanvas.className = 'atlas-fx';
        this.fxCanvas.setAttribute('aria-hidden', 'true');
        root.insertBefore(this.fxCanvas, v.canvas);
        this.rest = document.createElement('canvas');
        this.fx = new AtlasFx(this.fxCanvas);
        this._buildBar(root);
        if (!v.night) { v._applySky('night'); v._readColours(); }
        v._setFull(true);
        // The playing track is the selection; with nothing playing and nothing selected, a pick as Random makes.
        const player = v.app.audioPlayer, playing = player?.isPlaying ? v._playingId() : null;
        if (playing && v.focus?.id !== playing) v._go({ focus: playing });
        else if (!v.focus) { const before = v.wantPanel; v.randomFocus(); v.wantPanel = before; }
        this.trip = null; this._ringFor = null; this._last = null; this.clock = 0;
        this.levels = new Map(); this.hue = null; this._headWorld = null;
        this._sync();
        v.motion.stop();
        v._dirty();
    }

    /** Off: full screen and the sky go back as they were, and the camera glides to the selection's rings. `quiet`: the graph is being torn down. */
    stop({ quiet = false } = {}) {
        const v = this.view;
        if (!this.on) return;
        this.on = false;
        for (const [target, type, fn, opts] of this._listeners || []) target.removeEventListener(type, fn, opts);
        this._listeners = [];
        clearTimeout(this._idleTimer);
        this.fx?.destroy(); this.fx = null;
        this.fxCanvas?.remove(); this.fxCanvas = null; this.rest = null;
        this.bar?.remove(); this.bar = null;
        this.trip = null; this.state = null;
        const root = v.el?.('atlas');
        root?.classList.remove('is-viz', 'is-viz-idle');
        document.body.classList.remove('atlas-viz');
        if (!this._wasNight) { v._applySky('light'); if (!quiet) v._readColours(); }
        if (!this._wasFull) v._setFull(false);
        this._sync();
        if (quiet) { this.onExit = null; return; }
        v._chromeBoxes = null;
        v._settled();
        if (v.focus) v._follow();
        v._dirty();
        // Back to where the player opened it from (app.openVisualizer).
        const exit = this.onExit; this.onExit = null;
        exit?.();
    }

    /** The player's wave and the map's own button show whether the mode is on. */
    _sync() {
        for (const btn of globalThis.document?.querySelectorAll?.('[data-player-action="visualize"], #atlasViz') || []) btn.setAttribute('aria-pressed', String(this.on));
    }

    _on(target, type, fn, opts) { target.addEventListener(type, fn, opts); this._listeners.push([target, type, fn, opts]); }

    /** The mode's bar: the journey, the four effects, their intensity and Exit. It fades while the pointer rests. */
    _buildBar(root) {
        const p = this.prefs;
        const bar = this.bar = document.createElement('div');
        bar.className = 'atlas-viz-bar';
        bar.innerHTML = `<div class="atlas-switch" role="group" aria-label="Journey">${VIZ_JOURNEYS.map(([key, label]) => `<button type="button" data-journey="${key}" aria-pressed="${p.journey === key}">${label}</button>`).join('')}</div>
            ${VIZ_FX.map(([key, label]) => `<button type="button" class="atlas-chip" data-fx="${key}" aria-pressed="${Boolean(p[key])}">${label}</button>`).join('')}
            <label class="atlas-viz-amount">Intensity <input type="range" min="0" max="100" step="1" value="${Math.round(p.amount * 100)}" aria-label="Intensity"></label>
            <button type="button" class="atlas-chip" data-exit>Exit</button>`;
        root.appendChild(bar);
        this._on(bar, 'click', (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.exit != null) return this.stop();
            if (b.dataset.fx) this.prefs = writeViz({ ...this.prefs, [b.dataset.fx]: !this.prefs[b.dataset.fx] });
            if (b.dataset.journey && b.dataset.journey !== this.prefs.journey) { this.prefs = writeViz({ ...this.prefs, journey: b.dataset.journey }); this.trip = null; }
            for (const x of bar.querySelectorAll('[data-fx]')) x.setAttribute('aria-pressed', String(Boolean(this.prefs[x.dataset.fx])));
            for (const x of bar.querySelectorAll('[data-journey]')) x.setAttribute('aria-pressed', String(this.prefs.journey === x.dataset.journey));
        });
        this._on(bar, 'input', (e) => { if (e.target.type === 'range') this.prefs = writeViz({ ...this.prefs, amount: Number(e.target.value) / 100 }); });
        // A press on the map leaves the mode; it neither selects nor clears.
        this._on(root, 'pointerdown', (e) => {
            if (e.target.closest?.('.atlas-viz-bar')) return;
            e.stopPropagation(); e.preventDefault();
            this.stop();
        }, { capture: true });
        const wake = () => {
            root.classList.remove('is-viz-idle');
            clearTimeout(this._idleTimer);
            this._idleTimer = setTimeout(() => { if (this.on && !this._overBar && !bar.contains(document.activeElement)) root.classList.add('is-viz-idle'); }, ATLAS.vizIdleMs);
        };
        this._overBar = false;
        this._on(bar, 'pointerenter', () => { this._overBar = true; });
        this._on(bar, 'pointerleave', () => { this._overBar = false; });
        this._on(root, 'pointermove', wake);
        this._on(bar, 'focusin', wake);
        wake();
        // Esc in the browser's own full screen never reaches the page: leaving full screen leaves the mode.
        this._on(document, 'fullscreenchange', () => {
            if (document.fullscreenElement) this._inFullscreen = true;
            else if (this._inFullscreen) { this._inFullscreen = false; this.stop(); }
        });
    }

    // ---- the network, for the trip ----

    /** A ring node's settled spot and reach in map units (-1: a selection off the atlas, at its placed spot). */
    _point(i) {
        const v = this.view, atlas = v.atlas, s = v.settle, refK = atlas.steps?.refK || v.mapK;
        if (i === -1 || i == null) { const p = v.focus?.pos; return p ? { x: p.x, y: p.y, r: ATLAS.followReach * sizePx(1) / refK } : null; }
        const n = atlas.nodes[i];
        if (!n) return null;
        const live = s.live[i];
        return { x: live ? s.lx[i] : n.x, y: live ? s.ly[i] : n.y, r: ATLAS.followReach * sizePx(n.weight) / refK };
    }

    _newTrip() {
        const v = this.view, network = tripNetwork(v.ring.edges);
        const wide = () => v._ringsCamera() || v.cam;
        const idOf = (i) => (i === -1 ? v.focus?.id : v.atlas.nodes[i]?.id);
        return new Trip({
            network, journey: this.prefs.journey,
            cameras: {
                spot: (i) => this._point(i),
                wide,
                fit: (list) => { const cam = ringCamera(list.map((i) => this._point(i)), { W: v.W, H: v.H, fitK: v.mapK }); return cam ? v._clampCam(cam) : wide(); },
                close: (i) => v._closeCamera(idOf(i), Math.max(v.mapK * ATLAS.closeZoom, wide().k * ATLAS.vizCloseOver)) || wide(),
            },
        });
    }

    /** How on its branch a ring node is, 0 to 1, eased (1 with no branch in view). */
    _levelOf(i) { return i === -1 ? 1 : this.levels.get(i) ?? 1; }

    _stepLevels(dt) {
        const set = this.view.ring?.set, branch = this.state?.branch;
        if (!set) { this.levels.clear(); return; }
        const share = 1 - Math.exp(-dt / ATLAS.vizBackMs);
        for (const i of set) {
            const to = !branch || branch.has(i) ? 1 : 0, from = this.levels.get(i) ?? 1;
            this.levels.set(i, Math.abs(to - from) < 0.005 ? to : from + (to - from) * share);
        }
    }

    // ---- what AtlasCanvas asks while the mode is on ----

    /** A ring line's look: how much it fades back, how far it is lit (-1: not), and whether it is lit from its far end. */
    lineLook(from, to) {
        const s = this.state;
        const glow = s ? s.glow(from, to) : -1;
        return { fade: lerp(ATLAS.vizBackAlpha, 1, this._levelOf(to)), glow, flip: Boolean(s?.head && s.head.from === to), head: Boolean(s?.head) && glow >= 0 };
    }

    /** The lit part of a line, over it; Wander's dot rides its head. */
    drawGlow(ctx, look, a, b, { width, css }) {
        const v = this.view;
        const end = v._curl(ctx, look.flip ? b : a, look.flip ? a : b, look.glow, { width: width + ATLAS.vizGlowWidth * (1 + 0.5 * this.pulse), alpha: 1, css, even: true });
        if (!look.head || !end) return;
        ctx.globalAlpha = 1; ctx.fillStyle = rgba(v.ink.text, 1);
        ctx.beginPath(); ctx.arc(end[0], end[1], ATLAS.vizHeadR + 1.5 * this.pulse, 0, Math.PI * 2); ctx.fill();
        this._headWorld = toWorld(v.cam, v.W, v.H, end[0], end[1]);
    }

    /**
     * The always-named, by node index, with their tier (as AtlasCanvas._strongIndices): the
     * selection 0; what holds it and the branch in view 1 (the first ring with none; in Wander,
     * where the camera is and where it heads).
     */
    named() {
        const v = this.view, f = v.focus, nodes = v.atlas.byId, s = this.state, out = new Map();
        if (!f) return out;
        const put = (i, t) => { if (i != null && i >= 0 && !(out.get(i) <= t)) out.set(i, t); };
        put(nodes.get(f.id)?.i, 0);
        if (f.host) put(nodes.get(f.host)?.i, 1);
        if (s?.branch) for (const i of s.branch) put(i, 1);
        else for (const [, to, d] of v.ring?.edges || []) if (d === 0) put(to, 1);
        if (s?.head) for (const i of [s.head.from, s.head.to]) put(i, 1);
        if (s) put(s.heading, 1);
        return out;
    }

    // ---- frame ----

    frame(now) {
        const v = this.view, ctx = v.ctx;
        if (!v.atlas || !v.cam || !v.settle) return;
        const dt = this._last == null ? 16 : Math.min(64, Math.max(0, now - this._last));
        this._last = now; this.clock += dt / 1000;
        // The journey holds the camera: a glide the graph starts (a new selection) hands over to it.
        v.motion.stop();
        v.settle.frame(now);
        v._stepDim(now);
        // A new selection, or + and −: the journey starts over on the new network.
        if (this._ringFor !== v.ring || (!this.trip && v.ring)) {
            this._ringFor = v.ring; this._headWorld = null;
            this.trip = v.ring && v.focus ? this._newTrip() : null;
        }
        const player = v.app.audioPlayer, playing = Boolean(player?.isPlaying);
        this.state = this.trip ? this.trip.step((dt / 60000) * tripBpm(playing ? player.currentTrack?.bpm : null), v.cam) : null;
        const s = this.state;
        if (s) {
            let cam = s.cam;
            // Wander rides the line itself: mid-way the camera is on the dot, which follows the line's curl.
            const h = s.head && this._headWorld;
            if (h) { const m = Math.sin(Math.PI * s.head.t); cam = { ...cam, cx: lerp(cam.cx, h.x, m), cy: lerp(cam.cy, h.y, m) }; }
            else if (!s.head) this._headWorld = null;
            v.cam = v._clampCam(cam);
        }
        this.pulse = playing && s ? Math.exp(-ATLAS.vizPulseDecay * s.phase) : 0;
        this._stepLevels(dt);

        const { W, H } = v;
        v._ringId = null; v._anchorIds = null;
        const view = v._lastView = v._visible(now);
        v._lineSegs = [];
        v._curlCentre = v._ringCentre(view);
        // The branches the camera is not leaning to fade back with their lines.
        for (const it of view.list) if (it.lift > 0) it.alpha *= lerp(ATLAS.vizBackAlpha, 1, this._levelOf(it.i));

        // The rest of the map, to the effects layer.
        const scale = Math.min(v.dpr, ATLAS.vizScaleMax), rw = Math.round(W * scale), rh = Math.round(H * scale);
        const ground = v.ink.ground;
        this.fx.resize(rw, rh, ground);
        if (this.rest.width !== rw || this.rest.height !== rh) { this.rest.width = rw; this.rest.height = rh; }
        const rctx = this.rest.getContext('2d');
        rctx.setTransform(scale, 0, 0, scale, 0, 0);
        rctx.clearRect(0, 0, W, H);
        v._drawNodes(rctx, view, false);
        this._stepHue(s, dt);
        this.fx.draw({ rest: this.rest, time: this.clock, pulse: this.pulse, amount: this.prefs.amount, hue: this.hue ?? 0, wash: this.prefs.wash, warp: this.prefs.warp, trails: this.prefs.trails, mirror: this.prefs.mirror, ground });

        // The network, clean, on the graph's own canvas.
        ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        if (!this.fx.ok) ctx.drawImage(this.rest, 0, 0, W, H);
        v._drawRings(ctx, view, now);
        v._drawNodes(ctx, view, true);
        v._drawSelection(ctx, view, now);
        this._drawBeat(ctx, view, s, playing);
        v._chromeBoxes = []; // the graph's controls are away: names may use their room
        v._drawNames(ctx, view);
        v._dirty();
    }

    /** Wash's tint eases round to the colour of the node the camera heads for. */
    _stepHue(s, dt) {
        const v = this.view;
        let i = s ? s.heading : -1;
        if (i == null || i < 0) i = v.focus?.host ? v.atlas.byId.get(v.focus.host)?.i ?? -1 : -1;
        const colour = i >= 0 ? v.colours?.[i] : null;
        if (!colour) return;
        const to = hueOf(colour);
        if (this.hue == null) { this.hue = to; return; }
        let d = to - this.hue;
        d -= Math.round(d);
        this.hue = ((this.hue + d * (1 - Math.exp(-dt / ATLAS.vizHueEaseMs))) % 1 + 1) % 1;
    }

    /** The selection's ring, stronger on each beat, and a ripple out of it over the beat. */
    _drawBeat(ctx, view, s, playing) {
        const v = this.view, fs = view.focusScreen;
        if (!fs) return;
        const r = fs.r + ATLAS.selectRing + ATLAS.vizHomeRing;
        ctx.strokeStyle = rgba(v.ink.text, 1);
        ctx.globalAlpha = 0.45 + 0.5 * this.pulse; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(fs.x, fs.y, r, 0, Math.PI * 2); ctx.stroke();
        if (playing && s) {
            ctx.globalAlpha = (1 - s.phase) * 0.6; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(fs.x, fs.y, r + 2.5 + s.phase * ATLAS.vizRipple, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
}
