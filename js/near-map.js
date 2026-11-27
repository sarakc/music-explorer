// Near's map: a crop of the real atlas round the entity. Pure layout, then an SVG string.

import { curveOf, linkHashes } from './graph/atlas-look.js';
import { albumSpots } from './graph/atlas-draw.js';
import { albumArtistId } from './credits-graph.js';
import { markSvg } from './kind-glyph.js';
import { escapeHtml as esc } from './html.js';

const SIZE = { artist: 5, label: 3.8, tag: 4.4, album: 3.6, track: 4 };
const DIM = 'var(--text-dim)';
const FAINT = 'var(--text-faint)';
const n = (v) => +Number(v).toFixed(2);

/**
 * Where the centre, its neighbours, the background dots and the entity's own albums sit, in px of
 * a `width` × `height` box. Atlas positions are framed with one scale on both axes; albums and
 * tracks sit beside their `anchorId` node as the graph's sunflower places them. A centre off
 * the atlas sits at its `centreAnchorId` node (a track at its artist's), an album at its
 * artist's. Null with no centre node.
 */
export function nearMapLayout({ atlas, centreId, centreAnchorId = null, items, ownAlbums = [], centreColour = null, width, height, pad = 14, bgMax = 200 }) {
    if (!atlas?.byId) return null;
    const centreNode = atlas.byId.get(centreId)
        || (centreAnchorId ? atlas.byId.get(centreAnchorId) : null)
        || (String(centreId).startsWith('album:') ? atlas.byId.get(albumArtistId(centreId, (id) => atlas.byId.has(id))) : null);
    if (!centreNode) return null;

    // Atlas-unit positions: own node, outside x/y, or the anchor (offset after mapping).
    const placed = [];
    for (const it of items || []) {
        if (it.type === 'album' || it.type === 'track') {
            const anchor = it.anchorId ? atlas.byId.get(it.anchorId) : null;
            if (anchor) placed.push({ it, x: anchor.x, y: anchor.y, anchor: anchor.id });
            // An outside release has no artist of yours to sit by: it sits where Discover placed it.
            else if (Number.isFinite(it.x) && Number.isFinite(it.y)) placed.push({ it, x: it.x, y: it.y });
            continue;
        }
        const node = atlas.byId.get(it.id);
        if (node) placed.push({ it, x: node.x, y: node.y });
        else if (Number.isFinite(it.x) && Number.isFinite(it.y)) placed.push({ it, x: it.x, y: it.y });
    }
    const xs = [centreNode.x, ...placed.map((p) => p.x)], ys = [centreNode.y, ...placed.map((p) => p.y)];
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const bw = maxX - minX, bh = maxY - minY;
    const s = bw || bh ? Math.min((width - 2 * pad) / (bw || 0), (height - 2 * pad) / (bh || 0)) : Math.min(width - 2 * pad, height - 2 * pad);
    const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    const toX = (x) => width / 2 + (x - mx) * s, toY = (y) => height / 2 + (y - my) * s;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const cx = toX(centreNode.x), cy = toY(centreNode.y);
    const byAnchor = new Map();
    for (const p of placed) if (p.anchor) byAnchor.set(p.anchor, [...(byAnchor.get(p.anchor) || []), p]);
    const at = new Map();
    for (const group of byAnchor.values()) {
        for (const spot of albumSpots(group, toX(group[0].x), toY(group[0].y), 8)) at.set(spot.album, spot);
    }
    const marks = placed.map((p) => {
        const spot = at.get(p);
        if (p.anchor && !spot) return null; // past ATLAS.albumsMax
        const x = spot ? spot.x : toX(p.x), y = spot ? spot.y : toY(p.y);
        return { i: p.it.i, id: p.it.id, type: p.it.type, x: clamp(x, pad, width - pad), y: clamp(y, pad, height - pad), owned: p.it.owned !== false, colour: p.it.colour || null, name: p.it.name, score: p.it.score };
    }).filter(Boolean);
    // A hit circle reaches at most halfway to the next mark, so an album beside its artist doesn't cover it.
    for (const m of marks) {
        const nearest = Math.min(Infinity, ...marks.filter((o) => o !== m).map((o) => Math.hypot(o.x - m.x, o.y - m.y)));
        m.hit = n(Math.max(3, Math.min(12, nearest / 2)));
    }

    // The four closest by score (whatever their kind) get the thicker arc; without scores, list order.
    const score = (m) => (Number.isFinite(m.score) ? m.score : -Infinity);
    const close = new Set([...marks].sort((a, b) => score(b) - score(a) || a.i - b.i).slice(0, 4).map((m) => m.i));
    const ranked = [...marks].sort((a, b) => a.i - b.i);
    const mid = [width / 2, height / 2];
    const arcs = ranked.map((m) => {
        const [c1x, c1y, c2x, c2y] = curveOf(cx, cy, m.x, m.y, { centre: mid, ...linkHashes(centreNode.id, m.id) });
        return {
            i: m.i, type: m.type,
            d: `M${n(cx)} ${n(cy)} C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(m.x)} ${n(m.y)}`,
            colour: m.colour?.deep || null, width: close.has(m.i) ? 1.1 : 0.7, dashed: !m.owned,
        };
    });

    const skip = new Set([centreNode.id, ...marks.map((m) => m.id)]);
    const background = [];
    for (const node of atlas.nodes || []) {
        if (background.length >= bgMax) break;
        if (skip.has(node.id)) continue;
        const x = toX(node.x), y = toY(node.y);
        if (x >= 0 && x <= width && y >= 0 && y <= height) background.push({ x, y, r: 1 + ((node.i ?? background.length) % 3) * 0.5 });
    }
    const sunflower = albumSpots(ownAlbums, cx, cy, 13).map((spot) => ({ x: spot.x, y: spot.y, owned: spot.album.owned !== false }));
    return { width, height, centre: { x: cx, y: cy, colour: centreColour, type: String(centreId).split(':')[0] }, marks, arcs, background, sunflower };
}

/** The map's SVG: background, arcs, the sunflower, the marks (with a hit circle and a hidden name), then the centre. */
export function nearMapSvg(layout) {
    if (!layout) return '';
    const { width, height, centre, marks, arcs, background, sunflower } = layout;
    const c = centre.colour;
    const bg = `<g class="near-bg">${background.map((d) => `<circle cx="${n(d.x)}" cy="${n(d.y)}" r="${n(d.r)}"/>`).join('')}</g>`;
    const lines = arcs.map((a) => `<path class="near-arc" data-near-i="${a.i}" data-type="${esc(a.type)}" d="${a.d}" stroke="${a.colour || DIM}" stroke-width="${a.width}"${a.dashed ? ' stroke-dasharray="2 2.5"' : ''} fill="none"/>`).join('');
    const sun = `<g class="near-sun">${sunflower.map((p) => (p.owned
        ? `<rect x="${n(p.x - 2.2)}" y="${n(p.y - 2.2)}" width="4.4" height="4.4" rx="1" fill="${c?.soft || FAINT}"/>`
        : `<rect x="${n(p.x - 2.2)}" y="${n(p.y - 2.2)}" width="4.4" height="4.4" rx="1" fill="var(--bg)" stroke="${c?.fill || FAINT}" stroke-width="1"/>`)).join('')}</g>`;
    const dots = marks.map((m) => {
        const up = m.y > height / 2;
        return `<g class="near-mark" data-near-i="${m.i}" data-type="${esc(m.type)}"><circle cx="${n(m.x)}" cy="${n(m.y)}" r="${m.hit ?? 12}" fill="transparent"/>`
            + markSvg(m.type, m.x, m.y, SIZE[m.type] || 4, { fill: m.colour?.fill, soft: m.colour?.soft, owned: m.owned })
            + `<text x="${n(m.x)}" y="${n(up ? m.y - 8 : m.y + 15)}" text-anchor="middle">${esc(m.name)}<title>${esc(m.name)}</title></text></g>`;
    }).join('');
    const mid = `<g class="near-centre">${markSvg(SIZE[centre.type] ? centre.type : 'artist', centre.x, centre.y, 5.5, { fill: c?.fill, soft: c?.soft })}</g>`;
    return `<svg class="near-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-near-map>${bg}${lines}${sun}${dots}${mid}</svg>`;
}
