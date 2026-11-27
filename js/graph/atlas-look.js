// The calm look: size, the reference fit, colour, the dissolving edge, names and arcs.
// Pure: no DOM. The server imports sizePx and refScale to work out the step layouts.
import { ATLAS } from './atlas-config.js';

/** A node's radius in px at the reference whole-map view, by owned track count. */
export function sizePx(tracks) {
    return 1.2 + 0.9 * Math.max(0, tracks || 0) ** 0.35;
}

/** A label's triangle (half-side 0.9 r) reaches this × r from its centre at its corners. */
export const LABEL_REACH = 0.9 * Math.SQRT2;

/**
 * A node's room in the step layouts and wherever nodes make room, px at the reference view:
 * how far its shape reaches (a label's corners) plus ATLAS.stepPad, so neighbours keep
 * 2 × stepPad between their edges.
 */
export function roomPx(tracks, type) {
    return sizePx(tracks) * (type === 'label' ? LABEL_REACH : 1) + ATLAS.stepPad;
}

/** px per map unit at the whole-map view of the reference window. */
export function refScale({ minX, maxX, minY, maxY }) {
    const width = Math.max(1e-9, maxX - minX), height = Math.max(1e-9, maxY - minY);
    return Math.min(ATLAS.refW / width, ATLAS.refH / height) * ATLAS.refFit;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const num = (v) => String(+v.toFixed(3));

/** A node's oklch lightness, chroma and hue: its main subgenre's hue, grey with none; Night sky is more vivid. */
export function nodeOklch({ hue, share }, night) {
    const l = night ? ATLAS.markLNight : ATLAS.markL;
    const c = hue == null ? 0 : 0.16 * ATLAS.chroma * (night ? ATLAS.chromaNight : 1) * (0.55 + 0.45 * (share ?? 0));
    return fitChroma({ l, c, h: hue ?? 0 });
}

/** oklch as linear sRGB ([r, g, b], unclamped). */
function oklchLinear({ l, c, h }) {
    const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180);
    const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
        4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
        -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
        -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
    ];
}

const inSrgb = (o) => oklchLinear(o).every((u) => u >= -1e-4 && u <= 1 + 1e-4);

/** The colour with its chroma lowered just enough to fit sRGB: L and hue stay, so no hue shifts. */
export function fitChroma({ l, c, h }) {
    if (inSrgb({ l, c, h })) return { l, c, h };
    let lo = 0, hi = c;
    for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (inSrgb({ l, c: m, h })) lo = m; else hi = m; }
    return { l, c: lo, h };
}

/** The lighter shade albums take and the deeper one a lifted selection takes, each fitted. */
const softOf = ({ l, c, h }) => fitChroma({ l: Math.min(0.9, l + 0.14), c: c * 0.8, h });
const deepOf = ({ l, c, h }) => fitChroma({ l: l - ATLAS.liftDeepL, c: c * ATLAS.liftDeepC, h });

/** A node's colour as CSS; `soft` is the lighter shade albums take, `deep` the deeper one a lifted selection takes. */
export function nodeColours(node, night) {
    const o = nodeOklch(node, night), css = ({ l, c, h }) => `oklch(${num(l)} ${c.toFixed(3)} ${h})`;
    return { fill: css(o), soft: css(softOf(o)), deep: css(deepOf(o)) };
}

const hex = ([r, g, b]) => `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;

/**
 * nodeColours as sRGB hex, for the canvas: a canvas parses an oklch() string on every
 * fillStyle, about 0.8 µs a node, while hex is nearly free (the same colours to a level).
 */
export function nodeHexes(node, night) {
    const o = nodeOklch(node, night);
    return { fill: hex(oklchRgb(o)), soft: hex(oklchRgb(softOf(o))), deep: hex(oklchRgb(deepOf(o))) };
}

/**
 * A lifted node's room in map units (as roomPx / refK): its shape at ATLAS.liftScale × its
 * radius, with its ground hairline, plus ATLAS.stepPad.
 */
export function liftedRoom(tracks, type, refK) {
    return (sizePx(tracks) * (type === 'label' ? LABEL_REACH : 1) * ATLAS.liftScale + ATLAS.liftHairline + ATLAS.stepPad) / refK;
}

/** An oklch colour as sRGB ([r, g, b], 0–255, clamped), for what mixes colours (Discover's outlines). */
export function oklchRgb({ l, c, h }) {
    return oklchLinear({ l, c, h }).map((u) => { const v = u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(Math.max(0, u), 1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, v)) * 255); });
}

/**
 * The Filter's subgenre swatches: lower-case facet value (the part after `: `) → CSS colour
 * of a node wholly in it. When two families share a part name, the larger subgenre wins.
 */
export function subgenreSwatches(atlas) {
    const out = new Map(), size = new Map();
    for (const [name, sub] of atlas?.subgenres || []) {
        const at = name.indexOf(': ');
        if (at < 0) continue;
        const key = name.slice(at + 2).trim().toLowerCase();
        if (!key || (size.get(key) ?? -1) >= (sub.tracks || 0)) continue;
        size.set(key, sub.tracks || 0);
        out.set(key, nodeColours({ hue: sub.hue, share: 1 }, false).fill);
    }
    return out;
}

/** How far out each node sits, 0 in the middle to 1 at the edge: a smoothstep over ATLAS.rim. */
export function rimOf(nodes, { minX, maxX, minY, maxY }) {
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const rx = Math.max(1e-9, (maxX - minX) / 2), ry = Math.max(1e-9, (maxY - minY) / 2);
    const [from, to] = ATLAS.rim;
    const out = new Float32Array(nodes.length);
    nodes.forEach((n, i) => {
        const t = clamp01((Math.hypot((n.x - cx) / rx, (n.y - cy) / ry) - from) / (to - from));
        out[i] = t * t * (3 - 2 * t);
    });
    return out;
}

/** The alpha the dissolving edge leaves a node: faded at the whole map, none by ATLAS.rimGone. */
export function rimAlpha(rim, zoom) {
    return 1 - ATLAS.rimFade * rim * clamp01((ATLAS.rimGone - zoom) / (ATLAS.rimGone - 1));
}

/** Below the whole map a node shrinks with zoom; above it, it grows by √zoom up to ATLAS.growMax. */
export function zoomGrow(zoom) {
    return zoom < 1 ? zoom : Math.min(ATLAS.growMax, Math.sqrt(zoom));
}

/** A node's radius on screen, px: the reference size × this window's fit against the reference. */
export function screenRadius(tracks, { fitK, refK, zoom, scale = 1 }) {
    return sizePx(tracks) * (fitK / refK) * scale * ATLAS.markScale * zoomGrow(zoom);
}

/** How many names show at this zoom (× the whole map). */
export function nameBudget(zoom) {
    return Math.round(ATLAS.namesAtFit * Math.max(1, Math.min(ATLAS.namesZoomMax, zoom)));
}

// FNV-1a with a final avalanche (murmur3's fmix32), folded to [0, 1).
function hashText(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/**
 * A link's curve keys from its ends' ids, the same on every load: { h, h2 } in [0, 1), the
 * same both ways round, and `flip` when a → b runs against the ids' order, so its curve is
 * drawn the same whichever end it starts from.
 */
export function linkHashes(idA, idB) {
    const a = String(idA ?? ''), b = String(idB ?? ''), [lo, hi] = a < b ? [a, b] : [b, a];
    return { h: hashText(`${lo}|${hi}`), h2: hashText(`${hi}#${lo}`), flip: a > b };
}

/**
 * A link's curve from (x1, y1) to (x2, y2): a cubic's two control points [c1x, c1y, c2x, c2y].
 * It bends away from `centre` (the middle of the shown subgraph), or with none always to the
 * same side; `h` sets its depth, curlMin + curlSpan × h of its length (the control points of
 * the quadratic with that curl, p + (q − p) × 2/3), and when `h2` < sRate it is a gentle S
 * instead: offsets ±(sMin + sSpan × h) × its length at 1/3 and 2/3. With `flip` the curve is
 * worked out from the other end, then run back. Similar under any move or zoom, so it is the
 * same curve in map units and on screen.
 */
export function curveOf(x1, y1, x2, y2, { centre = null, h = 0.5, h2 = 1, flip = false } = {}) {
    if (flip) { const [c2x, c2y, c1x, c1y] = curveOf(x2, y2, x1, y1, { centre, h, h2 }); return [c1x, c1y, c2x, c2y]; }
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1e-9, nx = -dy / L, ny = dx / L, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    let side = 1;
    if (centre) {
        const probe = ATLAS.curlProbe * L;
        if (Math.hypot(mx + nx * probe - centre[0], my + ny * probe - centre[1]) < Math.hypot(mx - nx * probe - centre[0], my - ny * probe - centre[1])) side = -1;
    }
    if (h2 < ATLAS.sRate) {
        const o = (ATLAS.sMin + ATLAS.sSpan * h) * side * L;
        return [x1 + dx / 3 + nx * o, y1 + dy / 3 + ny * o, x1 + 2 * dx / 3 - nx * o, y1 + 2 * dy / 3 - ny * o];
    }
    const k = (ATLAS.curlMin + ATLAS.curlSpan * h) * side * L, qx = mx + nx * k, qy = my + ny * k;
    return [x1 + (qx - x1) * 2 / 3, y1 + (qy - y1) * 2 / 3, x2 + (qx - x2) * 2 / 3, y2 + (qy - y2) * 2 / 3];
}

/** The point at s on the cubic p0 → p1 → p2 → p3, one coordinate. */
export const cubicAt = (p0, p1, p2, p3, s) => { const u = 1 - s; return u * u * u * p0 + 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s * p3; };

/** De Casteljau: the cubic [x0, y0, x1, y1, x2, y2, x3, y3] split at s into [left, right]. */
export function splitCubic(Q, s) {
    const l = (a, b) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
    const p0 = [Q[0], Q[1]], p1 = [Q[2], Q[3]], p2 = [Q[4], Q[5]], p3 = [Q[6], Q[7]];
    const a = l(p0, p1), b = l(p1, p2), c = l(p2, p3), d = l(a, b), e = l(b, c), f = l(d, e);
    return [[...p0, ...a, ...d, ...f], [...f, ...e, ...c, ...p3]];
}

/**
 * Is (px, py) inside a drawn shape grown by `pad` px? A shape is { x, y, r, label, ring }:
 * a circle of radius r, or for a label its lower-left right triangle (half-side 0.9 r); with
 * `ring` (a selection's ring, px from the centre past r) the ring's circle counts too.
 */
export function inShape(sh, px, py, pad = 0) {
    const dx = px - sh.x, dy = py - sh.y;
    if (sh.ring && Math.hypot(dx, dy) < sh.r + sh.ring + pad) return true;
    if (!sh.label) return Math.hypot(dx, dy) < sh.r + pad;
    const s = sh.r * 0.9;
    return Math.max(-s - dx, dy - s, (dx - dy) / Math.SQRT2) < pad;
}

const ARC_HALVINGS = 14;

/**
 * Where a link's curve (curveOf; `curve` is its { centre, h, h2, flip }) from shape `a` to shape `b`
 * leaves the first and enters the second, `gap` px clear of each: { c1x, c1y, c2x, c2y, t0, t1 },
 * found by halving. Null when what is left is under `minPx` long.
 */
export function arcSpan(a, b, { gap = ATLAS.arcEndGap, minPx = ATLAS.arcMinPx, curve = {} } = {}) {
    const [c1x, c1y, c2x, c2y] = curveOf(a.x, a.y, b.x, b.y, curve);
    const bx = (s) => cubicAt(a.x, c1x, c2x, b.x, s), by = (s) => cubicAt(a.y, c1y, c2y, b.y, s);
    let t0 = 0, t1 = 1;
    if (a.r > 0 || a.ring) {
        let lo = 0, hi = 0.5;
        for (let k = 0; k < ARC_HALVINGS; k++) { const m = (lo + hi) / 2; if (inShape(a, bx(m), by(m), gap)) lo = m; else hi = m; }
        t0 = hi;
    }
    if (b.r > 0 || b.ring) {
        let lo = 0.5, hi = 1;
        for (let k = 0; k < ARC_HALVINGS; k++) { const m = (lo + hi) / 2; if (inShape(b, bx(m), by(m), gap)) hi = m; else lo = m; }
        t1 = lo;
    }
    if (t1 <= t0 || Math.hypot(bx(t1) - bx(t0), by(t1) - by(t0)) < minPx) return null;
    return { c1x, c1y, c2x, c2y, t0, t1 };
}

/** The piece of the cubic a → (c1, c2) → b from u to v, as a cubic of its own: [x0, y0, c1x, c1y, c2x, c2y, x1, y1]. */
export function subCurve(a, { c1x, c1y, c2x, c2y }, b, u, v) {
    const right = splitCubic([a.x, a.y, c1x, c1y, c2x, c2y, b.x, b.y], u)[1];
    return splitCubic(right, u >= 1 ? 0 : (v - u) / (1 - u))[0];
}
