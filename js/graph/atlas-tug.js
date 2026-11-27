// Dragging a node: it follows the pointer, its strongest shown links follow, nearby nodes
// make room live (no faster than ATLAS.maxStepPx a frame), and letting go eases everything
// back to its settled spot. Only what is awake (the held node, its links, whatever moves or
// is off its spot) and its neighbours are worked out each frame, so a drag costs the same on
// the whole map as on a corner of it. Positions are never saved. Pure: no DOM; positions are
// in map units, `wpp` is map units per screen px.
import { ATLAS } from './atlas-config.js';

/**
 * Where each linked node is pulled to, as an offset from its settled spot: the first
 * `tugN` links (strongest first, [j, score]) follow by tug × (0.5 + 0.5 × score / top).
 */
export function tugTargets(links, dx, dy) {
    const list = (links || []).slice(0, ATLAS.tugN), top = list.length ? list[0][1] || 1 : 1, out = new Map();
    for (const [j, s] of list) {
        const f = ATLAS.tug * (0.5 + 0.5 * s / top);
        out.set(j, [dx * f, dy * f]);
    }
    return out;
}

export class Tug {
    constructor(settle, radius, { slack = 0 } = {}) {
        this.slack = slack; // as pushApart: two rooms may share this much (the step layouts leave such hairs)
        this.settle = settle;
        this.radius = radius;
        this.vx = new Float64Array(settle.n);
        this.vy = new Float64Array(settle.n);
        this.targets = new Map();
        this.moved = new Set();
        this.awake = new Set();
        this.i = null; this.fx = 0; this.fy = 0;
        this.pulled = { i: null, links: [], at: 0, on: false };
    }

    /** Every shown node by where it settles, and its room, read once a drag: what the awake ones look among. */
    _index() {
        const s = this.settle, r = new Float64Array(s.n);
        let maxR = 0;
        for (let j = 0; j < s.n; j++) if (s.live[j]) { r[j] = this.radius(j); maxR = Math.max(maxR, r[j]); }
        const cell = 2 * maxR || 1, OFF = 50000, grid = new Map();
        const key = (x, y) => (Math.floor(x / cell) + OFF) * 100000 + Math.floor(y / cell) + OFF;
        for (let j = 0; j < s.n; j++) if (s.live[j]) { const k = key(s.x[j], s.y[j]); const b = grid.get(k); if (b) b.push(j); else grid.set(k, [j]); }
        this.index = { r, cell, grid, key, OFF };
    }

    /** Take hold of node `i`; `links` are its shown links, strongest first ([j, score]). */
    start(i, links, now = 0) {
        const s = this.settle;
        this.i = i;
        [this.fx, this.fy] = [s.x[i], s.y[i]];
        this.links = (links || []).slice(0, ATLAS.tugN);
        this.targets = new Map();
        s.movers.delete(i);
        for (const [j] of this.links) s.movers.delete(j);
        this._index();
        this.awake = new Set([i, ...this.links.map(([j]) => j), ...this.moved]);
        if (this.pulled.i !== i || !this.pulled.on) this.pulled = { i, links: this.links, at: now, on: true };
    }

    /** The pointer is at (fx, fy). */
    move(fx, fy) {
        if (this.i == null) return;
        this.fx = fx; this.fy = fy;
        const [lx, ly] = this.settle.settled(this.i);
        this.targets = tugTargets(this.links, fx - lx, fy - ly);
    }

    /** One frame: true while anything is still moving. */
    step(wpp) {
        const s = this.settle, cap = ATLAS.maxStepPx * wpp;
        if (!this.index) this._index();
        // The awake and every node near one: nothing further can touch them this frame.
        const { grid, cell, OFF } = this.index, seen = new Set();
        for (const j of this.awake) {
            if (!s.live[j]) continue;
            seen.add(j);
            const gx = Math.floor(s.x[j] / cell), gy = Math.floor(s.y[j] / cell);
            for (let u = -1; u <= 1; u++) for (let w = -1; w <= 1; w++) for (const m of grid.get((gx + u + OFF) * 100000 + gy + w + OFF) || []) if (s.live[m]) seen.add(m);
        }
        const ids = [...seen];
        // Damp, then pull each node toward its settled spot (plus its tug), then push apart at
        // full strength on the predicted spots, so the pull home never holds an overlap open.
        for (const j of ids) {
            const t = this.targets.get(j);
            this.vx[j] = this.vx[j] * ATLAS.tugKeep + (s.lx[j] + (t ? t[0] : 0) - s.x[j]) * ATLAS.tugPull;
            this.vy[j] = this.vy[j] * ATLAS.tugKeep + (s.ly[j] + (t ? t[1] : 0) - s.y[j]) * ATLAS.tugPull;
        }
        if (this.i != null) { this.vx[this.i] = this.fx - s.x[this.i]; this.vy[this.i] = this.fy - s.y[this.i]; }
        // The step layouts' own radii (padded at the reference view), so a still map has nothing to push.
        const R = this.index.r, r = (j) => R[j] * Math.max(0, Math.min(1, s.scale[j]));
        for (let it = 0; it < ATLAS.tugIterations; it++) this.collide(ids, r);
        let moving = 0;
        for (const j of ids) {
            if (j === this.i) {
                s.x[j] = this.fx; s.y[j] = this.fy; this.vx[j] = this.vy[j] = 0;
                this.moved.add(j);
                continue;
            }
            const sp = Math.hypot(this.vx[j], this.vy[j]);
            if (sp > cap) { this.vx[j] *= cap / sp; this.vy[j] *= cap / sp; }
            if (sp > 1e-12) { s.x[j] += this.vx[j]; s.y[j] += this.vy[j]; this.moved.add(j); this.awake.add(j); }
            moving = Math.max(moving, Math.abs(this.vx[j]) + Math.abs(this.vy[j]));
        }
        // Asleep again: still, home, and neither held nor tugged.
        for (const j of this.awake) {
            if (j === this.i || this.targets.has(j)) continue;
            if (Math.abs(this.vx[j]) + Math.abs(this.vy[j]) < 1e-4 * wpp && Math.hypot(s.x[j] - s.lx[j], s.y[j] - s.ly[j]) < 1e-3 * wpp) this.awake.delete(j);
        }
        return this.i != null || moving / wpp > 0.02;
    }

    // Overlapping pairs, found on a grid, are pushed apart through their velocities by their
    // whole overlap (as d3's forceCollide does, the smaller moving more). The held node
    // never moves, so whatever it touches takes the whole push.
    collide(ids, r) {
        const s = this.settle;
        let maxR = 0;
        for (const j of ids) maxR = Math.max(maxR, r(j));
        const cell = 2 * maxR || 1, OFF = 50000, key = (gx, gy) => (gx + OFF) * 100000 + gy + OFF, grid = new Map();
        const px = (j) => s.x[j] + this.vx[j], py = (j) => s.y[j] + this.vy[j];
        for (const j of ids) {
            const k = key(Math.floor(px(j) / cell), Math.floor(py(j) / cell));
            (grid.get(k) || grid.set(k, []).get(k)).push(j);
        }
        for (const a of ids) {
            const ax = px(a), ay = py(a), ra = r(a), gx = Math.floor(ax / cell), gy = Math.floor(ay / cell);
            for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) for (const b of grid.get(key(gx + u, gy + v)) || []) {
                if (b <= a) continue;
                const rb = r(b), R = ra + rb - this.slack;
                let dx = px(b) - ax, dy = py(b) - ay, d = Math.hypot(dx, dy);
                if (d >= R) continue;
                if (d < 1e-9) { dx = Math.cos(a + b); dy = Math.sin(a + b); d = 1e-9; }
                const push = (R - d) / d;
                let wa = rb * rb / (ra * ra + rb * rb), wb = 1 - wa;
                if (a === this.i) { wa = 0; wb = 1; } else if (b === this.i) { wa = 1; wb = 0; }
                this.vx[a] -= dx * push * wa; this.vy[a] -= dy * push * wa;
                this.vx[b] += dx * push * wb; this.vy[b] += dy * push * wb;
            }
        }
    }

    /** Let go: every node the drag moved eases back to its settled spot over ATLAS.moveMs. */
    release(now) {
        if (this.i == null && !this.moved.size) return;
        this.pulled = { ...this.pulled, at: now, on: false };
        this.i = null;
        this.targets = new Map();
        this.vx.fill(0); this.vy.fill(0);
        this.settle.easeHome(this.moved, now);
        this.moved = new Set();
        this.awake = new Set(); this.index = null;
    }
}
