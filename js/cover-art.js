// Cover-art URL resolver. Single source of truth for turning a unified track's
// `coverArt` field into something an <img src> can render.
//
// Track schema:
//   coverArt: string | null
//     - external URL (https://...)       -> returned as-is
//     - `local:<track_id>` sentinel      -> resolved to /api/library/art/:trackId
//                                           (server extracts APIC frame from the mp3)
//     - null / undefined                 -> placeholder data URI
//
// The placeholder is a 1x1 transparent PNG. It keeps img elements from
// firing 404s and lets CSS drive the empty-state look (background swatch,
// initials block, etc.) on top of the image.
import { VIEWER, visitorHides } from './viewer-profile.js';

const PLACEHOLDER =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/**
 * Resolve a track's cover-art URL to something renderable.
 * @param {object|null|undefined} track — a unified-track object
 * @param {object} [opts]
 * @param {string} [opts.placeholder] — override the default placeholder URI
 * @returns {string} a URL suitable for <img src>
 */
export function coverArtUrl(track, opts = {}) {
    const placeholder = opts.placeholder || PLACEHOLDER;
    if (!track) return placeholder;
    const raw = track.coverArt;

    if (visitorHides('cover-art') || (VIEWER && (!(typeof raw === 'string') || !/^https?:\/\//i.test(raw)))) return placeholder;

    // `local:<id>` sentinel → server endpoint. We also pass the file path as a
    // query arg so the stateless server can locate the mp3 without touching
    // the browser's IndexedDB. Encoded to survive spaces/quotes in paths.
    if (typeof raw === 'string' && raw.startsWith('local:')) {
        const id = raw.slice('local:'.length);
        const path = track.local_path || track.file || '';
        if (!path) return placeholder;
        return `/api/library/art/${encodeURIComponent(id)}?path=${encodeURIComponent(path)}`;
    }

    // External URLs (Discogs, Bandcamp) are passed through verbatim.
    if (typeof raw === 'string' && raw.length > 0) return raw;

    // No coverArt sentinel, but the track has a local file — speculatively try
    // the server's APIC extractor. Server returns 404 if no embedded art; the
    // caller is expected to handle img.onerror and swap to a placeholder.
    const localPath = track.local_path || track.file || '';
    const localId = track.id;
    if (localPath && localId) {
        return `/api/library/art/${encodeURIComponent(localId)}?path=${encodeURIComponent(localPath)}`;
    }

    return placeholder;
}

/**
 * True when a track is expected to have renderable art (external URL or
 * local sentinel with a known file path). Useful for deciding whether to
 * show a placeholder swatch vs. an <img>.
 */
export function hasCoverArt(track) {
    if (!track) return false;
    const raw = track.coverArt;
    if (visitorHides('cover-art') || (VIEWER && (!(typeof raw === 'string') || !/^https?:\/\//i.test(raw)))) return false;
    if (typeof raw === 'string' && raw.length > 0) {
        if (raw.startsWith('local:')) return !!(track.local_path || track.file);
        return true;
    }
    // Speculative: local tracks may have embedded APIC even without a
    // coverArt sentinel. Caller must handle img.onerror for the miss case.
    return !!((track.local_path || track.file) && track.id);
}

export { PLACEHOLDER as COVER_ART_PLACEHOLDER };
export default coverArtUrl;

const escAttr = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const albumKeyOf = (t) => `${String(t.artist || '').trim().toLowerCase()}|${String(t.album || '').trim().toLowerCase() || `#${t.id}`}`;

/** Up to `max` tracks with known art, one per distinct album, in input order. */
export function mosaicCovers(tracks, max = 4) {
    const out = [], seen = new Set();
    for (const t of tracks || []) {
        if (out.length >= max) break;
        if (!(typeof t?.coverArt === 'string' && t.coverArt && hasCoverArt(t))) continue;
        const key = albumKeyOf(t);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(t);
    }
    return out;
}

/** A 2×2 mosaic of owned covers (fewer when fewer exist), else a quiet placeholder. */
export function coverMosaicHtml(tracks, { max = 4 } = {}) {
    const covers = mosaicCovers(tracks, max);
    if (!covers.length) return '<span class="cover-mosaic n-0"><span class="cover-ph" aria-hidden="true"></span></span>';
    const imgs = covers.map((t) => `<img src="${escAttr(coverArtUrl(t))}" alt="" loading="lazy" decoding="async" data-art-fallback="cover-ph">`).join('');
    return `<span class="cover-mosaic n-${covers.length}">${imgs}</span>`;
}
