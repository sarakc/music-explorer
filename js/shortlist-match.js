// Shortlist ids and "do you own it yet?" matching. Pure, so the server's
// auto-clear (server/lib/shortlist-clear.js) and the Shortlist rows agree.
//
// Items: a release (`type: 'release'`) or a track (`type: 'track'`).
//   release id  the Discogs release id, else `release:<artist>|<title>` normalised
//   track id    `track:discogs:<releaseId>:<position>`, else `track:<artist>|<title>` normalised
//
// A wanted track matches a library track by Discogs release id and position
// when both sides have them (the library holds tracks of that release with
// positions), otherwise by artist and title after normalising.

/** Lower-case, no accents, runs of anything else one space. */
export function normaliseKey(s) {
    if (!s) return '';
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Stable id for a release: its Discogs id first, so two "Untitled" releases by one artist stay apart. */
export function makeShortlistId({ discogsReleaseId, artist, title }) {
    if (discogsReleaseId != null && discogsReleaseId !== '') return String(discogsReleaseId);
    return `release:${normaliseKey(artist)}|${normaliseKey(title)}`;
}

/** Stable id for a track item. */
export function makeTrackItemId({ discogsReleaseId, position, artist, title }) {
    if (discogsReleaseId != null && discogsReleaseId !== '' && position) return `track:discogs:${discogsReleaseId}:${String(position).trim()}`;
    return `track:${normaliseKey(artist)}|${normaliseKey(title)}`;
}

const pairKey = (artist, title) => `${normaliseKey(artist)}|${normaliseKey(title)}`;
const posKey = (releaseId, position) => `${String(releaseId)}|${normaliseKey(position)}`;

/** What the library holds, as the matcher needs it. Build once per check. */
export function libraryMatchIndex(tracks) {
    const pairs = new Set();
    const positions = new Set();
    const releases = new Set(); // Discogs release ids the library has positioned tracks of
    for (const t of tracks || []) {
        if (!t) continue;
        if (t.title) pairs.add(pairKey(t.artist, t.title));
        if (t.discogs_id && t.discogs_position) {
            positions.add(posKey(t.discogs_id, t.discogs_position));
            releases.add(String(t.discogs_id));
        }
    }
    return { pairs, positions, releases };
}

/** Does the library hold this wanted track ({ artist, title, discogsReleaseId?, position? })? */
export function ownsTrack(index, want) {
    const rid = want?.discogsReleaseId != null && want.discogsReleaseId !== '' ? String(want.discogsReleaseId) : null;
    if (rid && want.position && index.releases.has(rid)) return index.positions.has(posKey(rid, want.position));
    return Boolean(want?.title) && index.pairs.has(pairKey(want.artist, want.title));
}

/** A tracklist as `[{ position, title, artist? }]`; older stored rows hold titles only. */
export function tracklistOf(list) {
    if (!Array.isArray(list)) return null;
    const out = list.map((t) => (typeof t === 'string' ? { position: null, title: t } : t)).filter((t) => t?.title);
    return out.length ? out : null;
}

/**
 * How much of a release item the library holds: { loaded, total, owned }.
 * `stored` is the release's stored tracklist (release_credits) when the item has none.
 */
export function releaseProgress(item, index, stored = null) {
    const list = tracklistOf(item?.tracklist) || tracklistOf(stored);
    if (!list) return { loaded: false, total: 0, owned: 0 };
    const owned = list.filter((t) => ownsTrack(index, {
        artist: t.artist || item.artist, title: t.title, discogsReleaseId: item.discogsReleaseId, position: t.position,
    })).length;
    return { loaded: true, total: list.length, owned };
}

/** Is this item now in the library? A release needs every track; one with no tracklist never clears. */
export function itemOwned(item, index, stored = null) {
    if (item?.type === 'track') return ownsTrack(index, item);
    const p = releaseProgress(item, index, stored);
    return p.loaded && p.total > 0 && p.owned === p.total;
}
