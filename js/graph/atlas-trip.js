// The visualizer's journeys through a selection's network, counted in beats. Pure: the
// view passes the ring's edges, each node's spot and the cameras that frame them; a Trip
// returns the camera for each step, the branch in view and how far light has run along
// each line. Spec: docs/specs/2026-11-22-graph-visualizer-design.md.
import { ATLAS } from './atlas-config.js';
import { easeInOut } from './atlas-motion.js';
import { lerpCamera } from './atlas-geometry.js';

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

/** The pace: the track's BPM brought into vizBpmMin–vizBpmMax by doubling or halving, else vizBpm. */
export function tripBpm(bpm, cfg = ATLAS) {
    let b = Number(bpm);
    if (!Number.isFinite(b) || b <= 0) return cfg.vizBpm;
    while (b < cfg.vizBpmMin) b *= 2;
    while (b > cfg.vizBpmMax) b /= 2;
    return b < cfg.vizBpmMin ? cfg.vizBpm : b;
}

/**
 * A ring's edges ([from, to, depth], ringOf) as a network: `home` (the selection's index, -1
 * off the atlas), a branch per first-ring node (`node` and everything it brings in, `kids`),
 * and every node's links both ways.
 */
export function tripNetwork(edges = []) {
    const first = [], kids = new Map(), links = new Map();
    const link = (a, b) => { if (!links.has(a)) links.set(a, []); links.get(a).push(b); };
    let home = -1;
    for (const [from, to, d] of edges) {
        if (d === 0) { home = from; first.push(to); }
        else { if (!kids.has(from)) kids.set(from, []); kids.get(from).push(to); }
        link(from, to); link(to, from);
    }
    const under = (i, out = []) => { for (const j of kids.get(i) || []) { out.push(j); under(j, out); } return out; };
    return { home, branches: first.map((node) => ({ node, kids: under(node) })), links };
}

/**
 * One journey. `cameras`: `wide()` the whole network, `close(i)` a node up close, `fit(list)`
 * the nodes of `list`, `spot(i)` a node's map spot ({ x, y }); each camera is { cx, cy, k }.
 * `step(beats, cam)` moves on by that many beats from the camera the view has.
 */
export class Trip {
    constructor({ network, journey = 'home', cameras, rand = Math.random, cfg = ATLAS }) {
        this.net = network; this.journey = journey === 'wander' ? 'wander' : 'home';
        this.cameras = cameras; this.rand = rand; this.cfg = cfg;
        this.beats = 0; this.queue = []; this.move = null; this.moveAt = 0; this.count = 0;
        this.branch = null; this.head = null;
        this.at = network.home; this.cur = network.home; this.prev = null;
        // Home swings round the selection: the branches by angle, taken a few apart so each swing is a real move.
        const c = cameras.spot(network.home) || { x: 0, y: 0 };
        const angle = (b) => { const p = cameras.spot(b.node) || c; return Math.atan2(p.y - c.y, p.x - c.x); };
        this.order = [...network.branches].sort((a, b) => angle(a) - angle(b));
        const n = this.order.length;
        this.stride = [3, 2, 5, 1].find((s) => gcd(s, n || 1) === 1);
        this.turn = 0;
    }

    _glide(to, beats, { start, at } = {}) {
        let from = null;
        return { beats, start: (cam) => { from = { ...cam }; start?.(); }, at: (t) => { at?.(t); return lerpCamera(from, to() || from, easeInOut(t)); } };
    }

    /** A held view: it drifts in by `grow` and sways `sway` px, there and back. */
    _hold(beats, grow, sway) {
        let from = null;
        return {
            beats, start: (cam) => { from = { ...cam }; },
            at: (t) => ({ cx: from.cx + Math.sin(t * Math.PI) * sway / from.k, cy: from.cy + Math.sin(t * Math.PI * 2) * sway * 0.4 / from.k, k: from.k * (1 + grow * t) }),
        };
    }

    /** Out to the whole network, held, then in close on `node`, held. */
    _overview(node) {
        const C = this.cfg, cams = this.cameras;
        this.queue.push(
            this._glide(() => cams.wide(), C.vizGlideBeats, { start: () => { this.branch = null; } }), this._hold(C.vizWideBeats, C.vizWideGrow, C.vizSway),
            this._glide(() => cams.close(node), C.vizGlideBeats), this._hold(C.vizRestBeats, C.vizRestGrow, 0),
        );
    }

    _plan() {
        if (this.journey === 'wander') return this._planWander();
        const C = this.cfg, cams = this.cameras, home = this.net.home, n = this.order.length;
        if (!n || this.count % C.vizHomeEvery === 0) this._overview(home);
        this.count++;
        if (!n) return;
        const b = this.order[this.turn % n];
        this.turn += this.stride;
        const set = new Set([home, b.node, ...b.kids]);
        this.queue.push(
            this._glide(() => cams.fit([...set]), C.vizLeanBeats, { start: () => { this.branch = { node: b.node, set, g: 0 }; this.at = b.node; }, at: (t) => { this.branch.g = t * 2; } }),
            this._hold(C.vizBranchBeats, C.vizBranchGrow, C.vizSway / 2),
        );
    }

    _planWander() {
        const C = this.cfg, cams = this.cameras, from = this.cur;
        const links = this.net.links.get(from) || [];
        if (!links.length || this.count % C.vizWanderEvery === 0) this._overview(from);
        this.count++;
        if (!links.length) return;
        // Onward, not straight back, unless this node is a dead end.
        const onward = links.filter((j) => j !== this.prev), pool = onward.length ? onward : links;
        const to = pool[Math.min(pool.length - 1, Math.floor(this.rand() * pool.length))];
        let began = null;
        this.queue.push({
            beats: C.vizTravelBeats,
            start: (cam) => { began = { ...cam }; this.head = { from, to, t: 0 }; },
            at: (t) => {
                const u = easeInOut(t), c = lerpCamera(began, cams.close(to) || began, u);
                this.head.t = u;
                return { ...c, k: c.k * (1 - C.vizTravelDip * Math.sin(Math.PI * t)) };
            },
            end: () => { this.head = null; this.at = to; },
        }, this._hold(C.vizRestBeats, C.vizRestGrow, 0));
        this.prev = from; this.cur = to;
    }

    /** How far light has run along the line between two nodes (0 to 1), or -1 when it is not lit. */
    _glow(a, b) {
        const h = this.head, br = this.branch, home = this.net.home;
        if (h) return (a === h.from && b === h.to) || (a === h.to && b === h.from) ? h.t : -1;
        if (!br) return -1;
        if ((a === home && b === br.node) || (b === home && a === br.node)) return easeInOut(clamp01(br.g));
        if (a !== home && b !== home && br.set.has(a) && br.set.has(b)) return easeInOut(clamp01(br.g - 1));
        return -1;
    }

    /**
     * On by `dBeats`: { cam, phase (0 to 1 through the beat), branch (the Set of nodes the
     * camera leans to, or null), head (Wander's line under way, { from, to, t }, or null),
     * heading (the node the camera makes for), glow(a, b) }.
     */
    step(dBeats, cam) {
        this.beats += Math.max(0, Number(dBeats) || 0);
        let out = cam;
        for (let guard = 0; guard < 32; guard++) {
            if (!this.move) {
                if (!this.queue.length) this._plan();
                this.move = this.queue.shift();
                this.move.start(out);
            }
            const t = (this.beats - this.moveAt) / this.move.beats;
            if (t < 1) { out = this.move.at(t); break; }
            out = this.move.at(1);
            this.move.end?.();
            this.moveAt += this.move.beats;
            this.move = null;
        }
        return {
            cam: out, phase: this.beats % 1, branch: this.branch?.set || null, head: this.head,
            heading: this.head ? this.head.to : this.at, glow: (a, b) => this._glow(a, b),
        };
    }
}
