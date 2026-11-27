// One set of kind shapes (artist, label, tag, album, track) as SVG, for the map and the lists.

import { nodeHexes } from './graph/atlas-look.js';

export const KIND_ORDER = ['artist', 'label', 'tag', 'album', 'track'];

const NEUTRAL = 'var(--text-faint)';
const n = (v) => +Number(v).toFixed(2);

/** One shape centred on (x, y), about r in radius. No colour: neutral. Not owned: an outline. */
export function markSvg(type, x, y, r, { fill = null, soft = null, owned = true } = {}) {
    const c = fill || NEUTRAL;
    const paint = owned ? `fill="${c}"` : `fill="var(--bg)" stroke="${c}" stroke-width="${type === 'track' ? 1 : 1.4}"`;
    if (type === 'label') {
        const k = r * 1.25;
        return `<path d="M${n(x - k)} ${n(y + k)} L${n(x - k)} ${n(y - k)} L${n(x + k)} ${n(y + k)} Z" ${paint}/>`;
    }
    if (type === 'tag') {
        return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${owned ? (soft || 'var(--bg)') : 'var(--bg)'}" stroke="${c}" stroke-width="1.2"/>`
            + `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.38)}" fill="${c}"/>`;
    }
    if (type === 'album') {
        const paintAlbum = owned ? `fill="${soft || c}"` : paint;
        return `<rect x="${n(x - r)}" y="${n(y - r)}" width="${n(2 * r)}" height="${n(2 * r)}" rx="1.5" ${paintAlbum}/>`;
    }
    if (type === 'track') {
        return `<rect x="${n(x - 1.2 * r)}" y="${n(y - 1.4)}" width="${n(2.4 * r)}" height="2.8" rx="1.4" ${paint}/>`;
    }
    return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" ${paint}/>`;
}

/** The 12px list glyph for a kind. */
export function glyphSvg(type, { fill = null, soft = null, owned = true } = {}) {
    return `<svg class="kg" viewBox="0 0 12 12" aria-hidden="true">${markSvg(type, 6, 6, type === 'label' ? 3.6 : 4, { fill, soft, owned })}</svg>`;
}

/** The item's atlas colour ({ fill, soft, deep } as hex, by day), or null with no node or no hue. */
export function itemColour(atlas, id) {
    const node = atlas?.byId?.get(id);
    if (!node) return null;
    const hue = atlas.subgenres?.get(node.subgenre)?.hue;
    if (hue == null) return null;
    return nodeHexes({ hue, share: node.share ?? 1 }, false);
}
