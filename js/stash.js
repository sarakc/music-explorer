// Stash: "do not play". A whole `stash` token in a track's comma-separated
// Comments takes it out of Collection and out of play. Pure, shared by the
// browser and the server (server/lib/ummXml.js).

export const STASH_TOKEN = 'stash';

const tokens = (comments) => String(comments ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

export function isStashedTrack(track) {
    if (!track || typeof track.comments !== 'string') return false;
    return tokens(track.comments).some((t) => same(t, STASH_TOKEN));
}

// Whole-token "exploreme" marker in the Rekordbox comments field.
const EXPLOREME_RE = /\bexploreme\b/i;
export const isExploremeTrack = (t) => !!(t && typeof t.comments === 'string' && EXPLOREME_RE.test(t.comments));

export const withoutStashed = (tracks) => (tracks || []).filter((t) => !isStashedTrack(t));

/**
 * Collection's rows. `includeStashed` (the pinned Stashed filter) keeps only the
 * stashed rows; otherwise stashed rows go, and exploreme rows go unless
 * `includeExploreme`.
 */
export function collectionTracks(rawTracks, { includeExploreme = false, includeStashed = false } = {}) {
    const all = rawTracks || [];
    if (includeStashed) return all.filter(isStashedTrack);
    return all.filter((t) => !isStashedTrack(t) && (includeExploreme || !isExploremeTrack(t)));
}

/** The Exploreme view's rows: exploreme and not stashed. */
export const exploremeTracks = (rawTracks) => (rawTracks || []).filter((t) => isExploremeTrack(t) && !isStashedTrack(t));

/**
 * Comments with `token` added (`on`) or every whole copy of it removed. The
 * other tokens keep their order and spelling; empty items are dropped. Adding a
 * token already there returns the input unchanged.
 */
export function withCommentToken(comments, token, on) {
    const list = tokens(comments);
    const has = list.some((t) => same(t, token));
    if (on) return has ? String(comments) : [...list, token].join(', ');
    return list.filter((t) => !same(t, token)).join(', ');
}
