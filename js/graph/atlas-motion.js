// How the atlas moves: one ease for every programmatic camera move, pan inertia, wheel
// zoom eased about the cursor, the zoom buttons' press and hold, the camera a selection
// glides to, and when a press becomes a drag. Pure (no DOM);
// AtlasView drives it from its frame loop. Every number is in atlas-config.js.
import { ATLAS } from './atlas-config.js';
import { zoomAt, lerpCamera } from './atlas-geometry.js';

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const FRAME = 1000 / 60;

/** The shared ease: in-out, of power `easePower`. */
export function easeInOut(t, p = ATLAS.easePower) {
    t = clamp01(t);
    return t < 0.5 ? Math.pow(2, p - 1) * Math.pow(t, p) : 1 - Math.pow(2 - 2 * t, p) / 2;
}

/** The ease's slope at t (progress per unit of t). */
export function easeSlope(t, p = ATLAS.easePower) {
    t = clamp01(t);
    return t < 0.5 ? p * Math.pow(2, p - 1) * Math.pow(t, p - 1) : p * Math.pow(2 - 2 * t, p - 1);
}

/** Has the pointer moved far enough from where it went down to be a drag, not a click? */
export function pastThreshold(down, p, px = ATLAS.dragThreshold) {
    return Boolean(down && p) && Math.hypot(p.x - down.x, p.y - down.y) > px;
}

/** A pan's release velocity in px/ms from its recent samples ({ x, y, t }); none when the pointer had stopped. */
export function releaseVelocity(samples, now, cfg = ATLAS) {
    const recent = (samples || []).filter((s) => now - s.t <= cfg.inertiaSampleMs);
    if (recent.length < 2 || now - recent[recent.length - 1].t > cfg.inertiaIdleMs) return null;
    const a = recent[0], b = recent[recent.length - 1], dt = b.t - a.t;
    if (dt <= 0) return null;
    const v = { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
    return Math.hypot(v.x, v.y) < cfg.inertiaMinSpeed ? null : v;
}

/** One inertia step: the distance travelled over `dt` ms and the decayed velocity (null once it has stopped). */
export function inertiaStep(v, dt, cfg = ATLAS) {
    const decay = Math.exp(-dt / cfg.inertiaMs), share = cfg.inertiaMs * (1 - decay);
    const next = { x: v.x * decay, y: v.y * decay };
    return { dx: v.x * share, dy: v.y * share, v: Math.hypot(next.x, next.y) < cfg.inertiaStop ? null : next };
}

/**
 * The camera a selection glides to, and follows on + and −: the box round the selection and
 * every shown ring node (`points`, { x, y, r } in map units, r its reach) fitted inside
 * `followMarginX` px at each side and `followMarginY` px at the top and bottom, so their names
 * have room; between the whole map (`fitK`) and `followZoomMax` × it. Null with no points.
 */
export function ringCamera(points, { W, H, fitK, cfg = ATLAS }) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of points || []) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        const r = Math.max(0, p.r || 0);
        x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r); y0 = Math.min(y0, p.y - r); y1 = Math.max(y1, p.y + r);
    }
    if (!Number.isFinite(x0)) return null;
    // A narrow window keeps at least 40% of each side for the box.
    const w = Math.max(W * 0.4, W - 2 * cfg.followMarginX), h = Math.max(H * 0.4, H - 2 * cfg.followMarginY);
    const want = Math.min(w / Math.max(1e-9, x1 - x0), h / Math.max(1e-9, y1 - y0));
    const k = Math.max(fitK, Math.min(fitK * cfg.followZoomMax, want));
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, k };
}

/**
 * The camera's motion: an ease (`easeTo`), a fling's inertia, eased wheel zoom about the
 * cursor, and a zoom button held down. Starting one stops the others; `stop` leaves the
 * camera where the last step put it, so any input takes over without a jump. Under
 * reduced motion every move lands at once and nothing coasts.
 */
export class CameraMotion {
    constructor({ cfg = ATLAS, reduced = false } = {}) {
        this.cfg = cfg; this.reduced = reduced;
        this.anim = null; this.fling = null; this.wheelTo = null; this.hold = null; this.jump = null;
    }

    get active() { return Boolean(this.anim || this.fling || this.wheelTo || this.hold || this.jump); }

    stop() { this.anim = null; this.fling = null; this.wheelTo = null; this.hold = null; this.jump = null; }

    /** Glide from `from` to `to` over `easeMs`. */
    easeTo(from, to, now) {
        this.stop();
        if (this.reduced || !from) { this.jump = to; return; }
        this.anim = { from: { ...from }, to, start: now };
    }

    /** A camera ease under way lands somewhere else (the graph resized). */
    retarget(to) { if (this.anim) this.anim.to = to; else if (this.jump) this.jump = to; }

    /** The whole-map fit changed (a resize): absolute zoom targets keep their share of it. */
    rescale(oldMapK, newMapK) {
        if (!(oldMapK > 0) || !(newMapK > 0)) return;
        const r = newMapK / oldMapK;
        if (this.wheelTo) this.wheelTo = { ...this.wheelTo, k: this.wheelTo.k * r };
        if (this.jump) this.jump = { ...this.jump, k: this.jump.k * r };
    }

    /** A pan released at `v` px/ms keeps going and slows to a stop. */
    flingAt(v, now) {
        this.stop();
        if (!this.reduced && v) { this.fling = { v, at: now }; this._last = now; }
    }

    /** The wheel or a trackpad pinch: zoom by `factor` about the screen point, eased. */
    wheel(cam, factor, sx, sy, { mapK, W, H, now }) {
        const k0 = this.wheelTo?.k ?? cam.k;
        const k = Math.min(mapK * this.cfg.zoomMax, Math.max(mapK * this.cfg.zoomMin, k0 * factor));
        this.anim = null; this.fling = null; this.hold = null;
        if (this.reduced) { this.jump = zoomAt(this.jump || cam, mapK, factor, sx, sy, W, H, this.cfg); return; }
        if (!this.wheelTo) this._last = now;
        this.wheelTo = { k, sx, sy };
    }

    /** A zoom button or key goes down: an eased `zoomStep` about the centre; held, it keeps zooming. */
    press(dir, cam, now, { mapK, W, H }) {
        const from = this.anim?.to && this.hold ? this.anim.to : cam;
        this.stop();
        const to = zoomAt(from, mapK, Math.pow(this.cfg.zoomStep, dir), W / 2, H / 2, W, H, this.cfg);
        if (this.reduced) { this.jump = to; return; }
        this.anim = { from: { ...cam }, to, start: now };
        this.hold = { dir, at: now, v: 0, held: true, coasting: false };
        this._last = now;
    }

    /** The button or key comes up: a short press finishes its step; a held one eases to a stop. */
    release() {
        if (!this.hold) return;
        this.hold.held = false;
        if (!this.hold.coasting) this.hold = null;
    }

    /** Advance to `now`: the new camera (the same one when nothing moves). */
    step(now, cam, { mapK, W, H }) {
        const cfg = this.cfg;
        if (this.jump) { const to = this.jump; this.jump = null; return to; }
        const dt = Math.min(64, Math.max(0, now - (this._last ?? now)));
        this._last = now;
        const hold = this.hold;
        // Held past `zoomHoldMs`: hand the ease's speed over to a steady zoom, eased toward `zoomHoldRate`.
        if (hold?.held && !hold.coasting && this.anim && now - hold.at >= cfg.zoomHoldMs) {
            const t = (now - this.anim.start) / cfg.easeMs;
            hold.v = hold.dir * Math.log(cfg.zoomStep) * easeSlope(t) / cfg.easeMs;
            hold.coasting = true;
            cam = lerpCamera(this.anim.from, this.anim.to, easeInOut(t));
            this.anim = null;
        }
        if (hold?.coasting) {
            const target = hold.held ? hold.dir * cfg.zoomHoldRate / 1000 : 0;
            hold.v += (target - hold.v) * (1 - Math.exp(-dt / cfg.zoomHoldEaseMs));
            const next = zoomAt(cam, mapK, Math.exp(hold.v * dt), W / 2, H / 2, W, H, cfg);
            if (!hold.held && (Math.abs(hold.v) < 1e-5 || next.k === cam.k)) this.hold = null;
            return next;
        }
        if (this.anim) {
            const t = (now - this.anim.start) / cfg.easeMs;
            const next = lerpCamera(this.anim.from, this.anim.to, easeInOut(t));
            if (t >= 1) { this.anim = null; if (this.hold && !this.hold.held) this.hold = null; return { ...next }; }
            return next;
        }
        if (this.fling) {
            const s = inertiaStep(this.fling.v, dt, cfg);
            this.fling = s.v ? { v: s.v, at: now } : null;
            return { ...cam, cx: cam.cx - s.dx / cam.k, cy: cam.cy - s.dy / cam.k };
        }
        if (this.wheelTo) {
            const w = this.wheelTo, share = 1 - Math.exp(-dt / cfg.wheelEaseMs);
            // A target outside the zoom range (it moved since) eases to the range's edge and stops there.
            const to = Math.min(mapK * cfg.zoomMax, Math.max(mapK * cfg.zoomMin, w.k));
            const done = Math.abs(Math.log(to / cam.k)) < 1e-3;
            const k = done ? to : cam.k * Math.pow(to / cam.k, share);
            if (done) this.wheelTo = null;
            return zoomAt(cam, mapK, k / cam.k, w.sx, w.sy, W, H, cfg);
        }
        this._last = undefined;
        return cam;
    }
}
