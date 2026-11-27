// Tracklist Mirror — paste a DJ set tracklist, split into owned vs. missing.
// Parsing is forgiving: handles hyphens, em-dashes, numbered prefixes, leading
// timestamps, trailing label/year in brackets/parens, comment lines, blanks.

// Mirror of normalizeForMatch in app.js — kept local so the module is standalone.
const normalize = (s) => {
    if (!s) return '';
    return s
        .toString()
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s*[\(\[][^)\]]*[\)\]]/g, '')
        .replace(/\s+feat(?:uring|\.)?\s.*$/i, '')
        .replace(/^the\s+/, '')
        .replace(/\s+/g, ' ')
        .trim();
};

const LEADING_TIMESTAMP = /^\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*[-\.\)]?\s*/;
const LEADING_NUMBER = /^\s*\d{1,3}\s*[\.\)\-:]\s*/;
const LEADING_BULLET = /^\s*[\-\*•]\s+/;
const TRAILING_BRACKETED = /\s*[\[\(]([^\[\]\(\)]+)[\]\)]\s*$/;
const YEAR_ONLY = /^\s*(?:19|20)\d{2}\s*$/;
const DASH_SPLIT = /\s+[\u2013\u2014\-]\s+/;

const stripLeading = (line) => {
    let s = line;
    let changed = true;
    while (changed) {
        changed = false;
        const t1 = s.replace(LEADING_TIMESTAMP, '');
        if (t1 !== s) { s = t1; changed = true; }
        const t2 = s.replace(LEADING_NUMBER, '');
        if (t2 !== s) { s = t2; changed = true; }
        const t3 = s.replace(LEADING_BULLET, '');
        if (t3 !== s) { s = t3; changed = true; }
    }
    return s;
};

const extractTrailingLabel = (title) => {
    const m = title.match(TRAILING_BRACKETED);
    if (!m) return { title, label: undefined };
    const inner = m[1].trim();
    if (YEAR_ONLY.test(inner)) {
        return { title: title.replace(TRAILING_BRACKETED, '').trim(), label: undefined };
    }
    // Keep "Remix", "Edit", "Mix" parentheticals as part of title — they're meaningful.
    if (/\b(?:remix|edit|mix|rework|bootleg|vip|dub|version)\b/i.test(inner)) {
        return { title, label: undefined };
    }
    return { title: title.replace(TRAILING_BRACKETED, '').trim(), label: inner };
};

const parseLine = (rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return null;
    if (/^(?:#|\/\/)/.test(trimmed)) return null;

    const stripped = stripLeading(trimmed);
    if (!stripped) return { rawLine, artist: '', title: '', source: 'unparseable' };

    const parts = stripped.split(DASH_SPLIT);
    if (parts.length < 2) return { rawLine, artist: '', title: '', source: 'unparseable' };

    const artist = parts[0].trim();
    const rest = parts.slice(1).join(' - ').trim();
    if (!artist || !rest) return { rawLine, artist: '', title: '', source: 'unparseable' };

    const { title, label } = extractTrailingLabel(rest);
    if (!title) return { rawLine, artist: '', title: '', source: 'unparseable' };

    return { rawLine, artist, title, label, source: 'parsed' };
};

export const TracklistMirror = {
    parse(rawText) {
        if (!rawText) return [];
        return rawText.split(/\r?\n/).map(parseLine).filter(Boolean);
    },

    match(parsedEntries, tracks, { threshold = 0.85, possibleThreshold = 0.51 } = {}) {
        // Confidence buckets:
        //   exact match (1.0)           → owned
        //   substring match ≥ 0.7       → owned
        //   substring match ≥ 0.51 < 0.7 → possiblyOwned (surface distinctly; do NOT assume in collection)
        //   anything else               → missing
        const OWNED_MIN = 0.7;
        const owned = [];
        const possiblyOwned = [];
        const missing = [];
        const unparseable = [];

        // Exact lookup; flat array preserved for substring fallback (remix drift etc.).
        const exactIdx = new Map();
        const flat = [];
        for (const t of tracks) {
            const a = normalize(t.artist);
            const ti = normalize(t.title);
            if (!a || !ti) continue;
            const key = `${a}|${ti}`;
            if (!exactIdx.has(key)) exactIdx.set(key, t);
            flat.push({ a, ti, t });
        }

        for (const entry of parsedEntries) {
            if (entry.source === 'unparseable') {
                unparseable.push({ entry });
                continue;
            }
            const na = normalize(entry.artist);
            const nt = normalize(entry.title);
            if (!na || !nt) { missing.push({ entry }); continue; }

            const exact = exactIdx.get(`${na}|${nt}`);
            if (exact) { owned.push({ entry, track: exact, confidence: 1 }); continue; }

            let best = null;
            for (const { a, ti, t } of flat) {
                const artistHit = a === na || a.includes(na) || na.includes(a);
                if (!artistHit) continue;
                const titleHit = ti === nt || ti.includes(nt) || nt.includes(ti);
                if (!titleHit) continue;
                const shorter = Math.min(ti.length, nt.length);
                const longer = Math.max(ti.length, nt.length);
                const conf = longer ? shorter / longer : 0;
                if (!best || conf > best.confidence) best = { entry, track: t, confidence: conf };
            }
            if (best && best.confidence >= OWNED_MIN) {
                owned.push(best);
            } else if (best && best.confidence >= possibleThreshold) {
                possiblyOwned.push({ ...best, possible: true });
            } else {
                missing.push({ entry });
            }
        }

        return { owned, possiblyOwned, missing, unparseable };
    },
};

export default TracklistMirror;
