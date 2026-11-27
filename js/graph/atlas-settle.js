// + and −: which nodes show, and the one short ease that takes them there. The step
// layouts come from the server (atlas.steps); a selection's rings and lit nodes beyond
// the step are placed by a quick push-apart from their map spots, and the rest of the map
// makes room round a selection's lines, lifted nodes and names (clearRoom). Then all is still.
// Pure: no DOM. Positions are in map units.
import { ATLAS } from './atlas-config.js';
import { curveOf, cubicAt } from './atlas-look.js';

export const easeOut = (t) => 1 - (1 - t) ** 3;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/**
 * Push overlapping items apart in place, starting from `extra` (items placed off their
 * step spot): each overlapping pair moves apart by half its overlap each, and whatever moved
 * is checked again next round, up to `iterations` rounds. A `fixed` item pushes but never
 * moves; of a pair with different `ranks` (item → number, 0 when missing) the lower-ranked
 * moves all of it, for the first `rankRounds` rounds (after that a jam splits it). Two nodes
 * may share up to `slack` of their rooms (part of their padding; an obstacle, i < 0, keeps
 * its whole room): a pair overlapping by no more than that counts as clear, and one
 * overlapping by more is pushed only to it, so a push fades within a few neighbours instead
 * of rippling across a tightly packed map. Items: { i, x, y, r }. The lookup grid follows the
 * items as they move, so a round costs what moved, not the whole list; the few obstacles far
 * bigger than the rest (a sunflower's room) stay out of it and are checked against everything.
 */
export function pushApart(list, extra, { iterations = 80, fixed = null, ranks = null, rankRounds = 20, slack = 0 } = {}) {
    if (!list.length) return;
    const rs = list.map((s) => s.r).sort((a, b) => a - b), cap = 4 * rs[Math.floor((rs.length - 1) / 2)];
    // Each push goes a hair past touching, so the next nudge nearby does not reopen it.
    const hair = 0.02 * rs[0];
    const big = list.filter((s) => s.i < 0 && s.r > cap), isBig = new Set(big);
    const maxR = list.reduce((m, s) => (isBig.has(s) ? m : Math.max(m, s.r)), 0), cell = 2 * maxR || 1, OFF = 50000;
    const key = (x, y) => (Math.floor(x / cell) + OFF) * 100000 + Math.floor(y / cell) + OFF;
    const grid = new Map(), cellOf = new Map();
    const put = (s) => { const k = key(s.x, s.y); cellOf.set(s, k); (grid.get(k) || grid.set(k, []).get(k)).push(s); };
    const moved = (s) => {
        if (isBig.has(s)) return;
        const k = key(s.x, s.y), old = cellOf.get(s);
        if (k === old) return;
        const bucket = grid.get(old);
        bucket.splice(bucket.indexOf(s), 1);
        put(s);
    };
    for (const s of list) if (!isBig.has(s)) put(s);
    const scratch = [];
    const near = (s) => {
        if (isBig.has(s)) return list;
        scratch.length = 0;
        for (const m of big) scratch.push(m);
        const gx = Math.floor(s.x / cell), gy = Math.floor(s.y / cell);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const bucket = grid.get((gx + a + OFF) * 100000 + gy + b + OFF); if (bucket) for (const m of bucket) scratch.push(m); }
        return scratch;
    };
    let active = new Set(extra);
    for (let it = 0; it < iterations && active.size; it++) {
        const next = new Set();
        for (const s of active) {
            for (const m of near(s)) {
                if (m === s) continue;
                let sFixed = Boolean(fixed?.has(s)), mFixed = Boolean(fixed?.has(m));
                if (sFixed && mFixed) continue;
                if (ranks && it < rankRounds && !sFixed && !mFixed) {
                    const rs = ranks.get(s) || 0, rm = ranks.get(m) || 0;
                    if (rs > rm) sFixed = true; else if (rm > rs) mFixed = true;
                }
                let dx = m.x - s.x, dy = m.y - s.y, d = Math.hypot(dx, dy);
                const o = s.r + m.r - d;
                const sl = s.i < 0 || m.i < 0 ? 0 : slack; // obstacles (i < 0) keep their whole room
                if (o <= sl) continue;
                if (d < 1e-9) { dx = Math.cos(s.i); dy = Math.sin(s.i); d = 1; }
                const ux = dx / d, uy = dy / d, ks = mFixed ? 1 : sFixed ? 0 : 0.5, push = o - sl + hair;
                s.x -= ux * push * ks; s.y -= uy * push * ks; m.x += ux * push * (1 - ks); m.y += uy * push * (1 - ks);
                if (!sFixed) { next.add(s); moved(s); }
                if (!mFixed) { next.add(m); moved(m); }
            }
        }
        active = next;
    }
}

/** Pieces each line is checked as while making room. */
const ROOM_SEGMENTS = 16;
/** Where a node that has to step aside looks for a free spot: shares of its step, then turns off it (radians). */
const ROOM_TRIES = [[1, 0], [0.66, 0], [0.33, 0], [1, 0.6], [1, -0.6], [1, 1.2], [1, -1.2], [0.5, 0.9], [0.5, -0.9]];
/** Rounds of push-apart for what still sits under a lifted ring node once no free spot is left. */
const ROOM_PUSH_ROUNDS = 40;

/**
 * Make room round a selection, in place, without rippling through the map. Ring nodes, at their
 * lifted room, first push apart among themselves only (the `fixed` stay). Then every item that is
 * not in the `ring` and sits on one of its lines, on a ring node or on a ring node's name box
 * (`boxes`: index → its box round the node, map units) steps aside to clear it by `clear`, never more than
 * `cap` from where it started, over `passes` passes: it takes the first free spot along its step
 * (all of it, two thirds, a third), else turned off it, where its room meets no other item's
 * (two nodes may share `slack`); with none free it stays. Nothing it moves into is pushed, so
 * the work is bounded by the items near the selection. Lines are the `edges` ([from, to] item
 * indices, -1 the off-atlas focus at `focusAt`), each the curve curveOf draws (`curve(from, to)`
 * its { h, h2, flip }), bending away from the middle of the ring. Obstacles and outlines (i < 0)
 * stay as they are. Lines, ring nodes, name boxes and items are filed in grids, so each item
 * checks only what is near. Returns the items that moved.
 */
export function clearRoom(list, { ring, edges = [], curves = [], focusAt = null, boxes = null, clear, cap, passes = 3, fixed = null, slack = 0 }) {
    const byI = new Map();
    for (const s of list) if (s.i >= 0) byI.set(s.i, s);
    const at = (i) => (i === -1 ? focusAt : byI.get(i)) || null;
    const ringItems = [...ring].map((i) => byI.get(i)).filter(Boolean);
    // Lifted, two ring nodes may have grown into each other: they part, and nothing else moves.
    if (ringItems.length > 1) pushApart(ringItems, ringItems, { fixed, slack });
    const centres = focusAt ? [...ringItems, focusAt] : ringItems;
    if (!centres.length) return [];
    let cx = 0, cy = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, maxR = 0;
    for (const p of centres) { cx += p.x; cy += p.y; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const centre = [cx / centres.length, cy / centres.length];
    // Only what may step aside sets how far a thing's cells reach.
    for (const s of list) if (s.i >= 0 && !ring.has(s.i)) maxR = Math.max(maxR, s.r);
    const OFF = 50000, key = (gx, gy) => (gx + OFF) * 100000 + gy + OFF;
    // What to clear, filed under every cell an item's centre could be in while touching it.
    const reach = maxR + clear, cell = Math.max(2 * reach, 1e-9), grid = new Map();
    const file = (thing, bx0, by0, bx1, by1) => {
        for (let gx = Math.floor((bx0 - reach) / cell), gx1 = Math.floor((bx1 + reach) / cell); gx <= gx1; gx++) {
            for (let gy = Math.floor((by0 - reach) / cell), gy1 = Math.floor((by1 + reach) / cell); gy <= gy1; gy++) {
                const k = key(gx, gy), bucket = grid.get(k);
                if (bucket) bucket.push(thing); else grid.set(k, [thing]);
            }
        }
    };
    for (const [n, [a, b]] of edges.entries()) {
        const p = at(a), q = at(b);
        if (!p || !q) continue;
        const [c1x, c1y, c2x, c2y] = curveOf(p.x, p.y, q.x, q.y, { centre, ...curves[n] });
        let px = p.x, py = p.y;
        for (let k = 1; k <= ROOM_SEGMENTS; k++) {
            const t = k / ROOM_SEGMENTS, x = cubicAt(p.x, c1x, c2x, q.x, t), y = cubicAt(p.y, c1y, c2y, q.y, t);
            file({ seg: [px, py, x, y] }, Math.min(px, x), Math.min(py, y), Math.max(px, x), Math.max(py, y));
            px = x; py = y;
        }
    }
    for (const p of centres) file({ node: p }, p.x - (p.r || 0), p.y - (p.r || 0), p.x + (p.r || 0), p.y + (p.r || 0));
    for (const s of ringItems) {
        const o = boxes?.get(s.i);
        if (!o) continue;
        const b = { x0: s.x + o.x0, x1: s.x + o.x1, y0: s.y + o.y0, y1: s.y + o.y1 };
        file({ box: b }, b.x0, b.y0, b.x1, b.y1);
    }
    // Every item by where it is, kept up to date as items move, to find free spots.
    let itemR = 0;
    for (const s of list) itemR = Math.max(itemR, s.r);
    const icell = Math.max(2 * itemR, 1e-9), items = new Map(), cellOf = new Map();
    const put = (s) => { const k = key(Math.floor(s.x / icell), Math.floor(s.y / icell)); cellOf.set(s, k); const b = items.get(k); if (b) b.push(s); else items.set(k, [s]); };
    for (const s of list) put(s);
    const free = (s, x, y) => {
        const gx = Math.floor(x / icell), gy = Math.floor(y / icell);
        for (let u = -1; u <= 1; u++) for (let w = -1; w <= 1; w++) {
            for (const m of items.get(key(gx + u, gy + w)) || []) {
                if (m === s) continue;
                const room = s.r + m.r - (m.i < 0 ? 0 : slack);
                if ((m.x - x) ** 2 + (m.y - y) ** 2 < room * room) return false;
            }
        }
        // A spot on what it steps off is no spot.
        return true;
    };
    const keep = new Set([...(fixed || []), ...ringItems]), pad = 2 * cap, home = new Map(), all = new Set();
    // The items near anything to clear; later passes look at them alone.
    let candidates = list.filter((s) => s.i >= 0 && !keep.has(s) && s.x >= x0 - pad && s.x <= x1 + pad && s.y >= y0 - pad && s.y <= y1 + pad
        && grid.has(key(Math.floor(s.x / cell), Math.floor(s.y / cell))));
    for (let pass = 0; pass < passes; pass++) {
        let moved = 0;
        for (const s of candidates) {
            const near = grid.get(key(Math.floor(s.x / cell), Math.floor(s.y / cell)));
            if (!near) continue;
            let fx = 0, fy = 0;
            for (const it of near) {
                if (it.seg) {
                    const [ax, ay, bx, by] = it.seg, ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey || 1e-12;
                    const u = Math.max(0, Math.min(1, ((s.x - ax) * ex + (s.y - ay) * ey) / L2));
                    const dx = s.x - ax - ex * u, dy = s.y - ay - ey * u, d = Math.hypot(dx, dy), need = s.r + clear - d;
                    if (need <= 0) continue;
                    const L = Math.sqrt(L2), ux = d > 1e-12 ? dx / d : -ey / L, uy = d > 1e-12 ? dy / d : ex / L;
                    fx += ux * need; fy += uy * need;
                } else if (it.node) {
                    const p = it.node, dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy), need = s.r + (p.r || 0) + clear - d;
                    if (need <= 0) continue;
                    const a = d > 1e-12 ? Math.atan2(dy, dx) : s.i;
                    fx += Math.cos(a) * need; fy += Math.sin(a) * need;
                } else {
                    // Off a ring node's name: out through the nearest side but the top, which faces its own node.
                    const b = it.box, r = s.r;
                    if (s.x + r <= b.x0 || s.x - r >= b.x1 || s.y + r <= b.y0 || s.y - r >= b.y1) continue;
                    const outs = [[b.x0 - r - clear / 2 - s.x, 0], [b.x1 + r + clear / 2 - s.x, 0], [0, b.y1 + r + clear / 2 - s.y]];
                    const [ox, oy] = outs.reduce((m, o) => (Math.hypot(...o) < Math.hypot(...m) ? o : m));
                    fx += ox; fy += oy;
                }
            }
            if (!fx && !fy) continue;
            if (!home.has(s)) home.set(s, [s.x, s.y]);
            const [hx, hy] = home.get(s);
            for (const [share, turn] of ROOM_TRIES) {
                const c = Math.cos(turn), sn = Math.sin(turn), gx = (fx * c - fy * sn) * share, gy = (fx * sn + fy * c) * share;
                let nx = s.x + gx, ny = s.y + gy;
                const off = Math.hypot(nx - hx, ny - hy);
                if (off > cap) { nx = hx + (nx - hx) * cap / off; ny = hy + (ny - hy) * cap / off; }
                if (Math.hypot(nx - s.x, ny - s.y) < 1e-9 || !free(s, nx, ny)) continue;
                const old = items.get(cellOf.get(s));
                old.splice(old.indexOf(s), 1);
                s.x = nx; s.y = ny; put(s); all.add(s); moved++;
                break;
            }
        }
        candidates = candidates.filter((s) => grid.has(key(Math.floor(s.x / cell), Math.floor(s.y / cell))));
        if (!moved) break;
    }
    // What still sits under a lifted ring node pushes its way out, a little and a few rounds at most:
    // each push fades by `slack`, and ring nodes and the fixed never move.
    const under = new Set();
    for (const p of ringItems) {
        const gx = Math.floor(p.x / icell), gy = Math.floor(p.y / icell);
        for (let u = -1; u <= 1; u++) for (let w = -1; w <= 1; w++) for (const m of items.get(key(gx + u, gy + w)) || []) {
            if (m.i >= 0 && !keep.has(m) && (m.x - p.x) ** 2 + (m.y - p.y) ** 2 < (m.r + p.r - slack) ** 2) under.add(m);
        }
    }
    if (under.size) pushApart(list, under, { fixed: keep, slack, iterations: ROOM_PUSH_ROUNDS });
    return [...all];
}

/**
 * clearRoom's work as plain data, to do elsewhere (a worker): the items ({ i, x, y, r }) and its
 * options, with the ring, the fixed (as item positions) and the boxes as arrays.
 */
export function roomJob(list, opts) {
    const index = new Map(list.map((s, k) => [s, k]));
    return {
        items: list.map(({ i, x, y, r }) => ({ i, x, y, r })),
        opts: { ...opts, ring: [...opts.ring], fixed: [...(opts.fixed || [])].map((s) => index.get(s)).filter((k) => k != null), boxes: opts.boxes ? [...opts.boxes] : null },
    };
}

/** Do a roomJob: clearRoom on its items, → [x, y] by item. */
export function runRoomJob({ items, opts }) {
    const list = items.map((s) => ({ ...s }));
    clearRoom(list, { ...opts, ring: new Set(opts.ring), fixed: new Set(opts.fixed.map((k) => list[k])), boxes: opts.boxes ? new Map(opts.boxes) : null });
    const xy = new Float64Array(2 * list.length);
    list.forEach((s, k) => { xy[2 * k] = s.x; xy[2 * k + 1] = s.y; });
    return xy;
}

/**
 * A selection's rings: the first is `first` (the focus payload's neighbours, as atlas
 * indices), each deeper one the previous ring's strongest links not yet in the set, up to
 * `depth[d]` each. Edges run [from, to, d] from each node to the ones it brings in; an
 * off-atlas focus (`focusIndex` null) is the pseudo-index -1, drawn at `at`.
 *
 * Beside them, never in `edges` (they feed making room and the visualizer): `cross`, every
 * other link among the set in `links` (every link known, by node, as `adjacency`), each
 * [shallower, deeper] once; and `shared`, the nodes two or more ring nodes would each bring
 * in (among their strongest `depth[d]` links past the shallower rings): the walk takes each
 * once, so the second one's line is a cross link.
 */
export function ringOf({ focusIndex, at, first, adjacency, depth, links = adjacency }) {
    const from = focusIndex ?? -1, set = new Set(), edges = [], depthOf = new Map();
    if (focusIndex != null) { set.add(focusIndex); depthOf.set(focusIndex, 0); }
    let frontier = [];
    for (const j of (first || []).slice(0, depth[0] ?? 0)) {
        if (set.has(j)) continue;
        edges.push([from, j, 0]);
        set.add(j); depthOf.set(j, 1); frontier.push(j);
    }
    for (let d = 1; d < depth.length; d++) {
        const next = [];
        for (const i of frontier) {
            const strongest = [...(adjacency.get(i) || [])].sort((a, b) => b[1] - a[1]);
            let taken = 0;
            for (const [j] of strongest) {
                if (taken >= depth[d]) break;
                if (set.has(j)) continue;
                edges.push([i, j, d]);
                set.add(j); depthOf.set(j, d + 1); next.push(j);
                taken++;
            }
        }
        frontier = next;
    }
    const pair = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
    const drawn = new Set(edges.map(([a, b]) => pair(a, b))), cross = [];
    for (const a of set) for (const [b] of links?.get(a) || []) {
        if (!set.has(b) || a === b || drawn.has(pair(a, b))) continue;
        drawn.add(pair(a, b));
        const [p, q] = depthOf.get(a) < depthOf.get(b) || (depthOf.get(a) === depthOf.get(b) && a < b) ? [a, b] : [b, a];
        cross.push([p, q]);
    }
    cross.sort((x, y) => depthOf.get(x[1]) - depthOf.get(y[1]) || x[0] - y[0] || x[1] - y[1]);
    const claims = new Map();
    for (const [i, d] of depthOf) {
        if (d < 1 || d >= depth.length) continue;
        const strongest = [...(adjacency.get(i) || [])].filter(([j]) => !(depthOf.get(j) <= d)).sort((a, b) => b[1] - a[1]).slice(0, depth[d]);
        for (const [j] of strongest) if (set.has(j)) claims.set(j, (claims.get(j) || 0) + 1);
    }
    const shared = new Set([...claims].filter(([, n]) => n >= 2).map(([j]) => j));
    return { set, edges, depth: depthOf, at, cross, shared };
}

/**
 * Which nodes show: those in the step (rank below `limit`), those in the ring, and the
 * `litMax` heaviest lit nodes beyond the step.
 */
export function wanted({ rank, limit, ring = null, lit = null, litMax = ATLAS.litMax, weight = () => 0 }) {
    let litTop = null;
    if (lit?.size) {
        const beyond = [...lit].filter((i) => !(rank[i] < limit));
        beyond.sort((a, b) => weight(b) - weight(a) || a - b);
        litTop = new Set(beyond.slice(0, litMax));
    }
    return (i) => rank[i] < limit || Boolean(ring?.has(i)) || Boolean(litTop?.has(i));
}

/** Every node's grow-in scale and position, and the one ease after + and −. */
export class Settle {
    constructor(n) {
        this.n = n;
        this.want = new Uint8Array(n);
        this.live = new Uint8Array(n);
        // lx, ly: the settled spot; bx, by: the step's own spot, before making room (makeRoom).
        for (const k of ['scale', 'from', 'to', 't0', 'x', 'y', 'lx', 'ly', 'bx', 'by', 'ax', 'ay', 'm0']) this[k] = new Float64Array(n);
        this.dur = new Float64Array(n).fill(1);
        this.movers = new Set();
    }

    scaleAt(i, now) {
        return this.from[i] + (this.to[i] - this.from[i]) * easeOut(clamp01((now - this.t0[i]) / this.dur[i]));
    }

    /** The spot a node settles at: dragging pulls around it, letting go returns here. */
    settled(i) { return [this.lx[i], this.ly[i]]; }

    /**
     * Show what `want` picks at `layout` (a step's [x, y] by node index, NaN outside it). New
     * nodes grow in where they belong, leaving ones fade, and any node whose spot changes takes
     * one ease from `now + delay(i)`. With `animate` false all of it snaps. `slack` as pushApart.
     */
    retarget({ want, layout, home, radius, now, delay = () => 0, animate = true, slack = 0 }) {
        for (let i = 0; i < this.n; i++) {
            const w = want(i) ? 1 : 0;
            if (w === this.want[i]) continue;
            this.want[i] = w;
            if (!animate) {
                this.from[i] = this.to[i] = this.scale[i] = w; this.live[i] = w; this.t0[i] = -Infinity; this.dur[i] = 1;
                continue;
            }
            this.from[i] = this.live[i] ? this.scaleAt(i, now) : 0;
            this.to[i] = w;
            this.t0[i] = now + (w ? delay(i) : 0);
            this.dur[i] = w ? ATLAS.inMs : ATLAS.outMs;
            if (w && !this.live[i]) {
                this.live[i] = 1; this.scale[i] = 0;
                [this.x[i], this.y[i]] = home(i);
            }
        }
        const list = [], extra = [];
        for (let i = 0; i < this.n; i++) {
            if (!this.live[i] || !this.want[i]) continue;
            const inStep = layout && !Number.isNaN(layout[2 * i]);
            const [hx, hy] = inStep ? [layout[2 * i], layout[2 * i + 1]] : home(i);
            const s = { i, x: hx, y: hy, r: radius(i) };
            list.push(s);
            if (!inStep) extra.push(s);
        }
        if (extra.length) pushApart(list, extra, { slack });
        this.movers.clear();
        for (const { i, x, y, r } of list) {
            this.lx[i] = this.bx[i] = x; this.ly[i] = this.by[i] = y;
            const fresh = this.scale[i] < 0.05 && this.to[i] === 1;
            if (!animate || fresh) { this.x[i] = x; this.y[i] = y; continue; }
            if (Math.hypot(x - this.x[i], y - this.y[i]) < 0.01 * r) { this.x[i] = x; this.y[i] = y; continue; }
            this.ax[i] = this.x[i]; this.ay[i] = this.y[i]; this.m0[i] = now + delay(i);
            this.movers.add(i);
        }
    }

    /**
     * Make room round what a selection draws beside the nodes (`obstacles`, { x, y, r } in map
     * units, which never move) and round `movable` circles (Discover's outlines), which push and
     * are pushed, and are updated in place: every shown node starts from its step spot, is pushed
     * clear of them and of each other, and those whose settled spot changes ease there. `pinned`
     * nodes (the focus) never move; `ring` nodes (a selection's) give way only to the obstacles
     * and the pinned, and with `clearing` (clearRoom's options but the ring and the fixed) the
     * rest then make room round the ring's lines, nodes and names: at once, or with `later`
     * handed the work (roomJob) to do elsewhere and pass back to applyRoom. With nothing to make
     * room for, everything goes back to its step spot. `slack` as pushApart.
     */
    makeRoom(obstacles, radius, now, { animate = true, pinned = null, movable = [], ring = null, clearing = null, later = null, iterations = 200, slack = 0 } = {}) {
        const walls = (obstacles || []).map((o, k) => ({ i: -1 - k, x: o.x, y: o.y, r: o.r }));
        const free = movable.map((o, k) => ({ i: -1 - walls.length - k, x: o.x, y: o.y, r: o.r, o }));
        const list = [...walls, ...free], fixed = new Set(walls), ranks = new Map();
        for (let i = 0; i < this.n; i++) {
            if (!this.live[i] || !this.want[i]) continue;
            const s = { i, x: this.bx[i], y: this.by[i], r: radius(i) };
            list.push(s);
            if (pinned?.has(i)) fixed.add(s);
            else if (ring?.has(i)) ranks.set(s, 1);
        }
        if (walls.length || free.length) pushApart(list, [...walls, ...free], { iterations, fixed, ranks, slack });
        for (const f of free) { f.o.x = f.x; f.o.y = f.y; }
        if (ring?.size && clearing) {
            // Outlines hold still while the owned nodes clear the selection.
            const hold = new Set([...fixed, ...free]);
            // Done elsewhere: nothing changes until applyRoom brings it back, so nothing eases twice.
            if (later) { later(roomJob(list, { ...clearing, ring, fixed: hold, slack })); return; }
            clearRoom(list, { ...clearing, ring, fixed: hold, slack });
        }
        for (const { i, x, y } of list) {
            if (i < 0 || (x === this.lx[i] && y === this.ly[i])) continue;
            this.lx[i] = x; this.ly[i] = y;
            if (!animate || (this.scale[i] < 0.05 && this.to[i] === 1)) { this.x[i] = x; this.y[i] = y; this.movers.delete(i); continue; }
            if (!this.movers.has(i)) { this.ax[i] = this.x[i]; this.ay[i] = this.y[i]; this.m0[i] = now; this.movers.add(i); }
        }
    }

    /**
     * Where clearRoom, worked out elsewhere (roomJob), put the shown nodes: `xy` [x, y] by job
     * item; those whose settled spot changes ease there from where they are.
     */
    applyRoom(job, xy, now, { animate = true } = {}) {
        job.items.forEach(({ i }, k) => {
            if (i < 0 || !this.live[i] || !this.want[i]) return;
            const x = xy[2 * k], y = xy[2 * k + 1];
            if (x === this.lx[i] && y === this.ly[i]) return;
            this.lx[i] = x; this.ly[i] = y;
            if (!animate || (this.scale[i] < 0.05 && this.to[i] === 1)) { this.x[i] = x; this.y[i] = y; this.movers.delete(i); return; }
            if (!this.movers.has(i)) { this.ax[i] = this.x[i]; this.ay[i] = this.y[i]; this.m0[i] = now; this.movers.add(i); }
        });
    }

    /** Advance to `now`; true while anything still grows, fades or moves. */
    frame(now) {
        let busy = false;
        for (let i = 0; i < this.n; i++) {
            if (!this.live[i]) continue;
            this.scale[i] = this.scaleAt(i, now);
            if (now < this.t0[i] + this.dur[i]) busy = true;
            else if (this.to[i] === 0) { this.live[i] = 0; this.scale[i] = 0; }
        }
        for (const i of this.movers) {
            const t = clamp01((now - this.m0[i]) / ATLAS.moveMs), e = easeOut(t);
            this.x[i] = this.ax[i] + (this.lx[i] - this.ax[i]) * e;
            this.y[i] = this.ay[i] + (this.ly[i] - this.ay[i]) * e;
            if (t >= 1) this.movers.delete(i);
            else busy = true;
        }
        return busy;
    }

    /** Ease the given nodes from where they are now back to their settled spots (after a drag). */
    easeHome(ids, now) {
        for (const i of ids) {
            if (!this.live[i]) continue;
            this.ax[i] = this.x[i]; this.ay[i] = this.y[i]; this.m0[i] = now;
            this.movers.add(i);
        }
    }
}
