// Bandcamp and Spotify links for owned artists and labels: the entity_links
// store's record shape and the rules for writing it. Pure, shared by the server
// (which writes every link) and the client (which shows them).
//
// Record: { entityId, bandcamp?: { url, state, source, confirmed? },
//           spotify?: { id, name?, state, source, confirmed? },
//           rejected?: { bandcamp?: [url], spotify?: [id] }, updatedAt }
// state: 'linked' | 'suggested'. source: 'manual' (typed by hand), 'discogs'
// (a URL in the Discogs profile), 'wikidata' (a Bandcamp profile ID on the artist's or
// label's Wikidata item), 'bandcamp-follow' (a followed account with the same name),
// 'auto' (the Spotify match rule).
//
// Precedence: a hand-made entry (manual, or a confirmed suggestion) is never
// replaced automatically; a linked entry is never downgraded to a suggestion;
// Discogs, Wikidata and the Spotify rule outrank a followed-account name match. Remove
// keeps the removed value in `rejected` so no automatic source brings it back.

export const LINK_KINDS = ['bandcamp', 'spotify'];
export const LINK_STATES = ['linked', 'suggested'];
const AUTO_RANK = { 'bandcamp-follow': 1, discogs: 2, wikidata: 2, auto: 2 };

const valueOf = (kind, entry) => (kind === 'spotify' ? entry?.id : entry?.url) || null;
const userOwned = (entry) => entry?.source === 'manual' || entry?.confirmed === true;

/** 'linked' | 'suggested' | 'none'. */
export function linkState(entry) {
    return LINK_STATES.includes(entry?.state) ? entry.state : 'none';
}

export const hasLinkedBandcamp = (row) => linkState(row?.bandcamp) === 'linked';

// Hosts on bandcamp.com that are not an artist or label page.
const NOT_ACCOUNTS = new Set(['bandcamp.com', 'www.bandcamp.com', 'daily.bandcamp.com', 'blog.bandcamp.com', 'get.bandcamp.help']);

function parseUrl(input) {
    const raw = String(input ?? '').trim();
    if (!raw) return null;
    try {
        const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
        return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
    } catch (_) { return null; }
}

/**
 * The account page an artist or label URL points at, as `https://host`. A
 * `*.bandcamp.com` host always qualifies; another host (a custom domain) only
 * with `customDomain` (a URL typed by hand). Fan pages (bandcamp.com/<user>) never do.
 */
export function bandcampOrigin(input, { customDomain = false } = {}) {
    const u = parseUrl(input);
    if (!u) return null;
    const host = u.hostname.toLowerCase();
    if (NOT_ACCOUNTS.has(host)) return null;
    if (!host.endsWith('.bandcamp.com') && !(customDomain && host.includes('.'))) return null;
    return `https://${host}`;
}

const SPOTIFY_ID = /^[0-9A-Za-z]{22}$/;

/** A Spotify artist id from an open.spotify.com artist URL, a `spotify:artist:` URI or a bare id. */
export function spotifyArtistId(input) {
    const raw = String(input ?? '').trim();
    if (SPOTIFY_ID.test(raw)) return raw;
    const uri = raw.match(/^spotify:artist:([0-9A-Za-z]{22})$/);
    if (uri) return uri[1];
    const u = parseUrl(raw);
    if (!u || !/(^|\.)spotify\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/artist\/([0-9A-Za-z]{22})(?:\/|$)/);
    return m ? m[1] : null;
}

/** A Discogs artist or label id from a discogs.com URL of that type, or a bare number. */
export function discogsId(input, type) {
    const raw = String(input ?? '').trim();
    if (/^\d+$/.test(raw)) return raw;
    const u = parseUrl(raw);
    if (!u || !/(^|\.)discogs\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(new RegExp(`/${type}/(\\d+)(?:[-/]|$)`));
    return m ? m[1] : null;
}

export const bandcampLink = (url, state, source) => ({ url, state, source });
export const spotifyLink = (id, state, source, name) => ({ id, state, source, ...(name ? { name } : {}) });

function withEntry(row, entityId, kind, entry, now) {
    const out = { ...(row || {}), entityId, updatedAt: now };
    if (entry) out[kind] = entry; else delete out[kind];
    return out;
}

/** The row after an automatic source proposes `entry`, or null when nothing changes. */
export function applyAutoLink(row, entityId, kind, entry, now = Date.now()) {
    const value = valueOf(kind, entry);
    if (!value || !LINK_STATES.includes(entry.state) || !AUTO_RANK[entry.source]) return null;
    if ((row?.rejected?.[kind] || []).includes(value)) return null;
    const current = row?.[kind];
    if (current) {
        if (userOwned(current)) return null;
        if (valueOf(kind, current) === value && current.state === entry.state && current.source === entry.source) return null;
        if (current.state === 'linked' && entry.state === 'suggested') return null;
        if ((AUTO_RANK[current.source] || 0) > AUTO_RANK[entry.source]) return null;
    }
    return withEntry(row, entityId, kind, entry, now);
}

/** A value typed by hand: linked, and no longer rejected. */
export function applyManualLink(row, entityId, kind, entry, now = Date.now()) {
    const value = valueOf(kind, entry);
    if (!value) return null;
    const out = withEntry(row, entityId, kind, { ...entry, state: 'linked', source: 'manual' }, now);
    const rejected = (out.rejected?.[kind] || []).filter((v) => v !== value);
    if (out.rejected) out.rejected = { ...out.rejected, [kind]: rejected };
    return out;
}

/** Confirm a suggestion (or keep a linked entry): linked, and the user's from now on. */
export function applyConfirm(row, entityId, kind, now = Date.now()) {
    const current = row?.[kind];
    if (!current || !valueOf(kind, current)) return null;
    return withEntry(row, entityId, kind, { ...current, state: 'linked', confirmed: true }, now);
}

/** Remove a link; automatic sources never propose that value again. */
export function applyRemove(row, entityId, kind, now = Date.now()) {
    const value = valueOf(kind, row?.[kind]);
    if (!value) return null;
    const out = withEntry(row, entityId, kind, null, now);
    const list = new Set(out.rejected?.[kind] || []);
    list.add(value);
    out.rejected = { ...(out.rejected || {}), [kind]: [...list] };
    return out;
}

const LABEL_WORDS = { discogs: 'from Discogs', wikidata: 'from Wikidata', 'bandcamp-follow': 'followed on Bandcamp', auto: 'matched on Spotify', manual: 'added by you' };
/** Where a link came from, in a few words. */
export const sourceWords = (entry) => (entry?.confirmed && entry.source !== 'manual' ? 'confirmed by you' : LABEL_WORDS[entry?.source] || '');

// Names compare like this for the followed-account suggestion and the Spotify
// rule: case, accents, punctuation and a leading "the" don't count.
export function normaliseName(s) {
    return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/&/g, ' and ').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
