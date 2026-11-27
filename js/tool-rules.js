// Pure track rules shared by Tools (Cleanup › Missing fields and Formatting) in the
// browser and on the server. No DOM, no app state.

/** Local tracks are the only ones Tools looks at. */
export const isLocalTrack = (t) => !!t && t.availability === 'local';

/** Split `Primary: Sub1, Sub2`. `multiPrimary` is a comma or slash before the colon. */
export function parseGenre(raw) {
    if (!raw || typeof raw !== 'string') return { primary: '', subs: [], multiPrimary: false };
    const s = raw.trim();
    if (!s) return { primary: '', subs: [], multiPrimary: false };
    const colon = s.indexOf(':');
    if (colon < 0) return { primary: s, subs: [], multiPrimary: false };
    const pre = s.slice(0, colon).trim();
    const post = s.slice(colon + 1).trim();
    const subs = post ? post.split(',').map((x) => x.trim()).filter(Boolean) : [];
    return { primary: pre, subs, multiPrimary: /[,/]/.test(pre) };
}

/** `Primary: Sub` with `sub` appended after the existing subgenres, in their order. */
export function genreWithSubgenre(genre, sub) {
    const g = parseGenre(genre);
    const add = String(sub ?? '').trim();
    if (!g.primary || !add) return String(genre ?? '');
    const subs = g.subs.some((s) => s.toLowerCase() === add.toLowerCase()) ? g.subs : [...g.subs, add];
    return `${g.primary}: ${subs.join(', ')}`;
}

/** The track as it will be once its pending diffs are written. */
export function effectiveTrack(track, diffs = []) {
    if (!track) return track;
    const out = { ...track };
    for (const d of diffs) {
        if (d && String(d.trackId) === String(track.id) && d.field) out[d.field] = d.proposedValue;
    }
    return out;
}

const blank = (v) => v == null || String(v).trim() === '';

export const MISSING_FIELDS = ['label', 'title', 'artist', 'genre', 'subgenre', 'bpm', 'year'];

/** The missing fields for one (effective) track, in the tool's order. */
export function missingFields(t) {
    const out = [];
    if (blank(t.label)) out.push('label');
    if (blank(t.title)) out.push('title');
    if (blank(t.artist)) out.push('artist');
    if (blank(t.genre)) out.push('genre');
    else if (!parseGenre(t.genre).subs.length) out.push('subgenre');
    if (!(Number(t.bpm) > 0)) out.push('bpm');
    if (blank(t.year)) out.push('year');
    return out;
}

export const validBpm = (v) => {
    const n = Number(String(v ?? '').trim());
    return String(v ?? '').trim() !== '' && Number.isFinite(n) && n >= 40 && n <= 250;
};

export const validYear = (v, now = new Date()) => {
    const s = String(v ?? '').trim();
    return /^\d{4}$/.test(s) && Number(s) >= 1900 && Number(s) <= now.getFullYear() + 1;
};

// ── Formatting rules ────────────────────────────────────────────────────
// Whitespace, separators, URLs and control characters only. No rule removes
// bracketed text, version names or years.

function scanGenreGrammar(t) {
    const raw = t.genre;
    if (!raw || typeof raw !== 'string') return [];
    const g = parseGenre(raw);
    if (!g.multiPrimary) return [];
    const pre = g.primary.split(/[,/]/).map((x) => x.trim()).filter(Boolean);
    if (pre.length < 2) return [];
    const [primary, ...rest] = pre;
    const subs = [...rest, ...g.subs];
    const after = subs.length ? `${primary}: ${subs.join(', ')}` : primary;
    return after === raw ? [] : [{ field: 'genre', before: raw, after }];
}

function scanEmptySeparator(t) {
    const raw = t.genre;
    if (!raw || typeof raw !== 'string' || raw.indexOf(':') < 0) return [];
    const s = raw.trim();
    const colon = s.indexOf(':');
    const pre = s.slice(0, colon).trim();
    const post = s.slice(colon + 1).trim();
    if (pre && post) return [];
    const after = pre || post;
    return after === raw ? [] : [{ field: 'genre', before: raw, after }];
}

const JUNK_FIELDS = ['title', 'artist', 'album', 'label', 'genre', 'comments'];
const URL_RE = /(?:https?:\/\/\S+|www\.\S+)/gi;
// Control characters except tab, line feed and carriage return.
const NON_PRINTABLE_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function scrubText(raw) {
    if (typeof raw !== 'string') return raw;
    return raw.replace(URL_RE, '').replace(NON_PRINTABLE_RE, '').replace(/\s+/g, ' ').trim();
}

function scanJunk(t) {
    const out = [];
    for (const field of JUNK_FIELDS) {
        const before = t[field];
        if (typeof before !== 'string' || !before) continue;
        let after = scrubText(before);
        // A URL removed from Comments must not leave a dangling separator.
        if (field === 'comments') after = after.replace(/^[,\s]+|[,\s]+$/g, '').replace(/,(?:\s*,)+/g, ',');
        if (after !== before) out.push({ field, before, after });
    }
    return out;
}

export const FORMATTING_RULES = [
    { id: 'genre-grammar', label: 'Genre grammar', scan: scanGenreGrammar },
    { id: 'empty-separator', label: 'Empty separator', scan: scanEmptySeparator },
    { id: 'junk-scrub', label: 'Whitespace', scan: scanJunk },
];

/** One fix per field; an earlier rule wins, and later rules see its result. */
export function formattingFixes(track) {
    const fixes = [];
    let t = track;
    for (const rule of FORMATTING_RULES) {
        for (const f of rule.scan(t)) {
            const prior = fixes.find((x) => x.field === f.field);
            if (prior) prior.after = f.after;
            else fixes.push({ rule: rule.id, ...f });
            t = { ...t, [f.field]: f.after };
        }
    }
    return fixes.filter((f) => f.after !== f.before);
}
