// Camelot wheel mapping for Rekordbox key notation. Hardcoded 24-entry map +
// neighbor lookup; "compatible" = same number / different letter, or ±1 same letter.

const KEY_TO_CAMELOT = {
    // Minor keys → A
    'Abm': '1A', 'G#m': '1A',
    'Ebm': '2A', 'D#m': '2A',
    'Bbm': '3A', 'A#m': '3A',
    'Fm':  '4A',
    'Cm':  '5A',
    'Gm':  '6A',
    'Dm':  '7A',
    'Am':  '8A',
    'Em':  '9A',
    'Bm':  '10A',
    'F#m': '11A', 'Gbm': '11A',
    'Dbm': '12A', 'C#m': '12A',
    // Major keys → B
    'B':   '1B', 'Cb':  '1B',
    'F#':  '2B', 'Gb':  '2B',
    'Db':  '3B', 'C#':  '3B',
    'Ab':  '4B', 'G#':  '4B',
    'Eb':  '5B', 'D#':  '5B',
    'Bb':  '6B', 'A#':  '6B',
    'F':   '7B',
    'C':   '8B',
    'G':   '9B',
    'D':   '10B',
    'A':   '11B',
    'E':   '12B',
};

export function keyToCamelot(key) {
    if (!key) return null;
    const k = String(key).trim();
    return KEY_TO_CAMELOT[k] || null;
}

export function camelotNeighbors(camelot) {
    if (!camelot) return new Set();
    const m = /^(\d{1,2})([AB])$/.exec(camelot);
    if (!m) return new Set();
    const num = parseInt(m[1], 10);
    const letter = m[2];
    const other = letter === 'A' ? 'B' : 'A';
    const wrap = (n) => ((n - 1 + 12) % 12) + 1;
    return new Set([
        `${num}${letter}`,
        `${num}${other}`,
        `${wrap(num - 1)}${letter}`,
        `${wrap(num + 1)}${letter}`,
    ]);
}

// Given a list of selected Rekordbox keys, return the set of Rekordbox keys
// that should match under Camelot-compatible mode.
export function expandCamelotCompatible(selectedKeys) {
    const allowed = new Set();
    for (const sel of selectedKeys) {
        const cam = keyToCamelot(sel);
        if (!cam) { allowed.add(sel); continue; }
        const neighbors = camelotNeighbors(cam);
        for (const [k, c] of Object.entries(KEY_TO_CAMELOT)) {
            if (neighbors.has(c)) allowed.add(k);
        }
    }
    return allowed;
}
