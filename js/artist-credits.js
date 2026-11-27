// Which artists a track's artist field credits. Pure, imports nothing: the similarity
// engine, Discover's candidates and the browser all read credits through it.
// Rules: docs/SIMILARITY.md §1 and docs/specs/2026-11-26-artist-credits-design.md.

// Always split: the part before is the main artist, each part after a featured one.
const STRONG = /\s+(?:feat\.?|ft\.?|featuring|with)\s+/gi;
// Split only beside a known artist.
const WEAK = /\s*,\s*|\s+&\s+|\s+(?:and|x|vs\.?|y)\s+/gi;
const LEAD = /^(?:[&,+;/]|feat\.|ft\.)\s*/i;
const TRAIL = /\s*(?:[&,+;/]|feat\.|ft\.)$/i;
const NOT_WORD = /[^\p{L}\p{N}\s]+/gu;
const PLACEHOLDERS = new Set(['various', 'various artists', 'va', 'unknown', 'unknown artist', 'various unknown artists']);

const fold = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

export function isPlaceholderArtist(name) {
    const k = String(name ?? '').toLowerCase().replace(NOT_WORD, '').replace(/\s+/g, ' ').trim();
    return PLACEHOLDERS.has(k);
}

/** Positions inside brackets: separators there belong to the name ("KEARL (K15 & Earl Jeffers)"). */
function bracketMask(raw) {
    const mask = new Array(raw.length).fill(false);
    for (let i = 0, d = 0; i < raw.length; i++) {
        if ('([{'.includes(raw[i])) d++;
        mask[i] = d > 0;
        if (')]}'.includes(raw[i])) d = Math.max(0, d - 1);
    }
    return mask;
}

/** Every separator match in raw[from, to) that touches no masked position, as [start, end]. */
function cutsIn(raw, re, mask, from = 0, to = raw.length) {
    const cuts = [];
    const text = raw.slice(from, to);
    for (const m of text.matchAll(new RegExp(re.source, re.flags))) {
        const start = from + m.index, end = start + m[0].length;
        let masked = false;
        for (let i = start; i < end && !masked; i++) masked = mask[i];
        if (!masked) cuts.push([start, end]);
    }
    return cuts;
}

/** The pieces between cuts, as [start, end] ranges in raw. */
function piecesOf(cuts, from, to) {
    const starts = [from, ...cuts.map((c) => c[1])], ends = [...cuts.map((c) => c[0]), to];
    return starts.map((s, i) => [s, ends[i]]);
}

function trimEdges(part) {
    let s = part.trim(), prev;
    do { prev = s; s = s.replace(LEAD, '').replace(TRAIL, '').trim(); } while (s !== prev);
    return s;
}

function keep(parts) {
    const out = [], seen = new Set();
    for (const p of parts) {
        const s = trimEdges(p);
        if (!s || isPlaceholderArtist(s)) continue;
        const k = fold(s);
        if (seen.has(k)) continue;
        seen.add(k); out.push(s);
    }
    return out;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The artists a credit names, in credit order. `isKnown(part)` says whether a part is an
 * artist on its own; `neverSplit` names are never cut, wherever they sit in the credit.
 * Placeholders ("Various Artists") are dropped, so a placeholder-only credit is [].
 */
export function splitArtist(name, isKnown = () => false, neverSplit = []) {
    const raw = String(name ?? '').trim();
    if (!raw) return [];
    const listedKeys = new Set((neverSplit || []).map(fold).filter(Boolean));
    const known = (s) => { const t = s.trim(); return !!t && (isKnown(t) || listedKeys.has(fold(t))); };
    if (known(raw)) return keep([raw]);

    const mask = bracketMask(raw);
    for (const entry of neverSplit || []) {
        const words = String(entry ?? '').trim();
        if (!words) continue;
        const re = new RegExp(escape(words).replace(/\s+/g, '\\s+'), 'giu');
        for (const m of raw.matchAll(re)) for (let i = m.index; i < m.index + m[0].length; i++) mask[i] = true;
    }

    const parts = [];
    for (const [from, to] of piecesOf(cutsIn(raw, STRONG, mask), 0, raw.length)) {
        const segment = raw.slice(from, to);
        if (known(segment)) { parts.push(segment); continue; }
        const pieces = piecesOf(cutsIn(raw, WEAK, mask, from, to), from, to);
        let stretch = null; // [start, end] of neighbouring unknown pieces
        for (let i = 0; i < pieces.length;) {
            let j = pieces.length - 1;
            while (j >= i && !known(raw.slice(pieces[i][0], pieces[j][1]))) j--;
            if (j < i) { stretch = stretch ? [stretch[0], pieces[i][1]] : [...pieces[i]]; i++; continue; }
            if (stretch) { parts.push(raw.slice(...stretch)); stretch = null; }
            parts.push(raw.slice(pieces[i][0], pieces[j][1]));
            i = j + 1;
        }
        if (stretch) parts.push(raw.slice(...stretch));
    }
    return keep(parts);
}

/** True when a strong or weak separator sits outside brackets. */
export function hasSeparator(name) {
    const raw = String(name ?? '').trim();
    const mask = bracketMask(raw);
    return cutsIn(raw, STRONG, mask).length > 0 || cutsIn(raw, WEAK, mask).length > 0;
}

/**
 * Every run of neighbouring pieces between separators (outside brackets), trimmed:
 * by start piece left to right, and for each start the longest run first, so the whole
 * credit comes first. The names a credit's artist node can have.
 */
export function creditSpans(name) {
    const raw = String(name ?? '').trim();
    if (!raw) return [];
    const mask = bracketMask(raw);
    const cuts = [...cutsIn(raw, STRONG, mask), ...cutsIn(raw, WEAK, mask)].sort((a, b) => a[0] - b[0]);
    const pieces = piecesOf(cuts, 0, raw.length);
    const out = [];
    for (let i = 0; i < pieces.length; i++) {
        for (let j = pieces.length - 1; j >= i; j--) {
            const s = trimEdges(raw.slice(pieces[i][0], pieces[j][1]));
            if (s && !out.includes(s)) out.push(s);
        }
    }
    return out;
}
