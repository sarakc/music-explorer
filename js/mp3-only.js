// "MP3 only": a tag write that reached the MP3 but no paired FLAC. Info's Save
// and Tools Apply say so in those words; the reason sits on hover. Reasons are
// the server's `pairReason` codes (server/library/pair.js › unpairedReason).

export const MP3_ONLY = 'MP3 only';

const REASONS = {
    'no-sidecar': 'The FLAC has no pair sidecar',
    'outside-lossless': 'No FLAC at its path in LOSSLESS_DIR',
};

/** Hover text for one write result's `pairReason`. */
export function mp3OnlyReason(code) {
    return REASONS[code] || 'No paired FLAC found';
}

/** Hover text for a batch's `mp3OnlyReasons` counts: one line per reason. */
export function mp3OnlyReasonsTitle(counts = {}) {
    return Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([code, n]) => `${mp3OnlyReason(code)}: ${n.toLocaleString()}`)
        .join('\n');
}
