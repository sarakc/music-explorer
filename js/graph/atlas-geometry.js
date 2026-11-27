// Pure geometry for the atlas: the camera, colour parsing, hit-testing and how a name is
// written on the map. No DOM.
import { ATLAS } from './atlas-config.js';

/** FNV-1a folded to [0, 1). */
export function hash01(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h / 4294967296;
}

// ---- camera ----

/** The bounds of a node list: { minX, maxX, minY, maxY, w, h }. */
export function extentOf(nodes) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) { if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x; if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y; }
    if (!Number.isFinite(minX)) return { minX: -1, maxX: 1, minY: -1, maxY: 1, w: 2, h: 2 };
    return { minX, maxX, minY, maxY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

/** The camera that fits the extent, inside `inset` px kept clear at the top and bottom (the controls, the edge). */
export function fitCamera(extent, width, height, margin = ATLAS.fitMargin, inset = { top: ATLAS.fitInsetTop, bottom: ATLAS.fitInsetBottom }) {
    const top = inset?.top || 0, bottom = inset?.bottom || 0;
    const band = Math.max(1, height - top - bottom);
    let k = Math.min((width * (1 - margin * 2)) / extent.w, (band * (1 - margin * 2)) / extent.h);
    if (!(Number.isFinite(k) && k > 0)) k = 1;
    // Centre the extent in the band, not the canvas.
    return { cx: extent.minX + extent.w / 2, cy: extent.minY + extent.h / 2 - (top - bottom) / 2 / k, k };
}

/**
 * Never pan past the map. While the map fits the view it stays where fitCamera centres it;
 * zoomed in, the camera reaches each edge and up to `slack` of the half-view further, so an
 * edge node can come in from under the controls. The reach grows from nothing as the zoom passes the fit.
 */
export function clampCamera(cam, extent, width, height, { top = ATLAS.fitInsetTop, bottom = ATLAS.fitInsetBottom, right = 0, slack = 0.4 } = {}) {
    if (!cam || !extent) return cam;
    const reach = (half, view) => { const over = Math.max(0, half - view); return over + Math.min(over, view * slack); };
    // `right`: a side panel over the map's right edge; the map centres in the part left of it.
    const hw = Math.max(1, width - right) / 2 / cam.k, hb = Math.max(1, height - top - bottom) / 2 / cam.k;
    const mx = (extent.minX + extent.maxX) / 2 + right / 2 / cam.k, my = (extent.minY + extent.maxY) / 2 - (top - bottom) / 2 / cam.k;
    const ex = reach((extent.maxX - extent.minX) / 2, hw), ey = reach((extent.maxY - extent.minY) / 2, hb);
    const cx = Math.max(mx - ex, Math.min(mx + ex, cam.cx)), cy = Math.max(my - ey, Math.min(my + ey, cam.cy));
    return cx === cam.cx && cy === cam.cy ? cam : { ...cam, cx, cy };
}

/** A panel over the map (a phone's sheet below, a side panel on the right): move the camera's
 *  centre so what it framed sits in the part left clear. */
export function shiftForPanel(cam, { bottom = 0, right = 0 } = {}) {
    return { ...cam, cx: cam.cx + right / 2 / cam.k, cy: cam.cy + bottom / 2 / cam.k };
}

export const toScreen =(cam, width, height, x, y) => ({ x: (x - cam.cx) * cam.k + width / 2, y: (y - cam.cy) * cam.k + height / 2 });
export const toWorld = (cam, width, height, sx, sy) => ({ x: (sx - width / 2) / cam.k + cam.cx, y: (sy - height / 2) / cam.k + cam.cy });

/** Zoom about a screen point, clamped to [zoomMin, zoomMax] × the whole-map fit scale. */
export function zoomAt(cam, mapK, factor, sx, sy, width, height, cfg = ATLAS) {
    const k = Math.min(mapK * cfg.zoomMax, Math.max(mapK * cfg.zoomMin, cam.k * factor));
    const w = toWorld(cam, width, height, sx, sy);
    return { cx: w.x - (sx - width / 2) / k, cy: w.y - (sy - height / 2) / k, k };
}

/** The camera after a resize changes the whole-map fit: its zoom stays the same share of it. */
export function resizeCamera(cam, oldMapK, newMapK) {
    if (!cam || !(oldMapK > 0) || !(newMapK > 0)) return cam;
    return { ...cam, k: cam.k * (newMapK / oldMapK) };
}

export const lerpCamera = (a, b, t) => ({ cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, k: a.k * Math.pow(b.k / a.k, t) });

/** [r, g, b] (0–255) from a computed CSS colour: #rgb, #rrggbb, rgb()/rgba(), color(srgb …). */
export function parseColour(text) {
    const s = String(text || '').trim();
    let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
        const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
        return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    }
    m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    if (m) return [m[1], m[2], m[3]].map(Number);
    m = s.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
    if (m) return [m[1], m[2], m[3]].map((v) => Math.round(Number(v) * 255));
    return null;
}

export const rgba = (c, alpha = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;

/**
 * A score as drawing reads it: its share of the atlas run's score scale (`scale`,
 * the score the run's layout reads as 1), at most 1. Stored scores never change.
 */
export const shownScore = (score, scale = 1) => Math.min(1, Math.max(0, Number(score) || 0) / (scale > 0 ? scale : 1));

/**
 * A population's score scale: its `q` quantile, in (0, 1] (as the server's `scoreScale`
 * for the atlas). Outside nodes carry fewer signals than owned ones, so a list of them
 * reads against its own scale, never the owned atlas's. 1 when there are no scores.
 */
export function scoreScale(scores, q = 0.9) {
    const list = [...scores].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!list.length) return 1;
    return Math.min(1, Math.max(0.01, list[Math.min(list.length - 1, Math.floor(list.length * q))]));
}

// ---- hit-testing ----


/**
 * The node under a screen point among `candidates`: each counts within max(its radius,
 * `minPx`) + `pad` px. The nearest wins. A number in place of the options is `pad`.
 */
export function pickNearest(candidates, sx, sy, opts = {}) {
    const { pad = ATLAS.hitPad, minPx = ATLAS.hitMinPx, tier = () => 0 } = typeof opts === 'number' ? { pad: opts } : opts;
    let best = null, bestD = Infinity, bestT = Infinity;
    for (const c of candidates) {
        const d = Math.hypot(c.sx - sx, c.sy - sy);
        if (d > Math.max(c.r || 0, minPx) + pad) continue;
        const t = tier(c);
        if (t < bestT || (t === bestT && d < bestD)) { best = c; bestD = d; bestT = t; }
    }
    return best;
}

// ---- names (level of detail) ----

/** A name as the map writes it: spaces collapsed, cut to `labelMaxChars` with an ellipsis. */
export function labelText(name, max = ATLAS.labelMaxChars) {
    const chars = Array.from(String(name ?? '').replace(/\s+/g, ' ').trim());
    return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('');
}
