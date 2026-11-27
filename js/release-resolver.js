// Release resolver — match non-Discogs tracks (Rekordbox, Bandcamp) to a
// Discogs release_id via artist+album lookup. Caches in the
// `release_resolve_map` IndexedDB store; never retries a failed resolve
// automatically (tracks with no confident match get a null discogs_id
// recorded so we don't hammer Discogs each load).

const RATE_LIMIT_MS = 1100; // Discogs: 60/min authed

function normalize(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s*[\(\[][^)\]]*[\)\]]/g, ' ') // strip parenthetical
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

// Build a stable cache key per (artist, album) pair. Returns null if
// the track has no meaningful grouping (no artist or no album/title).
export function pairKeyFor(track) {
    if (!track) return null;
    const artist = normalize(track.artist);
    if (!artist) return null;
    const album = normalize(track.album);
    const title = normalize(track.title);
    const term = album || title;
    if (!term) return null;
    return `${artist}|${term}`;
}

// Reduce a track list to the unique pair keys that need resolution.
// Returns Map<pairKey, { artist, album, title }> — one representative
// track's fields per key (whichever we encountered first).
function collectPairs(tracks) {
    const pairs = new Map();
    for (const t of tracks) {
        if (!t) continue;
        // Skip rows that already carry a discogs_id — nothing to resolve.
        if (t.discogs_id) continue;
        const key = pairKeyFor(t);
        if (!key) continue;
        if (pairs.has(key)) continue;
        pairs.set(key, {
            artist: t.artist || '',
            album: t.album || '',
            title: t.title || '',
        });
    }
    return pairs;
}

// Load the full resolve map from IndexedDB into a plain Map<key, discogs_id|null>.
async function loadCache(database) {
    const rows = await database.getAllResolveMap();
    const m = new Map();
    for (const r of rows) m.set(r.key, r.discogs_id || null);
    return m;
}

// Run the resolve pass. Walks all unique pairs in `tracks` that have no
// discogs_id and no cached mapping, hits Discogs search for each, records
// the result (including null for no-match).
//
// onProgress({ done, total, resolved, failed, current }) called after each attempt.
// Returns { resolved, failed, skipped, total } on completion.
export async function resolveMissingPairs({
    tracks,
    database,
    connector,
    onProgress = () => {},
    shouldCancel = () => false,
}) {
    const allPairs = collectPairs(tracks);
    const cache = await loadCache(database);

    const todo = [];
    for (const [key, info] of allPairs.entries()) {
        if (cache.has(key)) continue; // already resolved (or marked null)
        todo.push([key, info]);
    }

    const total = todo.length;
    let done = 0;
    let resolved = 0;
    let failed = 0;

    for (const [key, info] of todo) {
        if (shouldCancel()) throw new Error('cancelled');
        let discogsId = null;
        try {
            const match = await connector.resolveRelease(info);
            if (match && match.release_id) {
                discogsId = String(match.release_id);
                resolved++;
            }
        } catch (e) {
            failed++;
        }
        await database.setResolveMap({
            key,
            discogs_id: discogsId,
            artist: info.artist,
            album: info.album || info.title,
            resolvedAt: Date.now(),
        });
        cache.set(key, discogsId);
        done++;
        onProgress({ done, total, resolved, failed, current: info });
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }

    return { resolved, failed, total, skipped: allPairs.size - total };
}

// Stamp a resolved discogs_id onto every eligible track (non-destructive —
// returns new objects). Uses the in-memory cache passed in; callers load it
// via loadCache before calling this.
export function stampDiscogsIds(tracks, cache) {
    return tracks.map((t) => {
        if (!t) return t;
        if (t.discogs_id) return t; // already has one
        const key = pairKeyFor(t);
        if (!key) return t;
        const mapped = cache.get(key);
        if (!mapped) return t;
        return { ...t, discogs_id: mapped };
    });
}

// Returns how many tracks in the current slice are eligible + how many are
// already covered (either have discogs_id or a cached mapping).
export async function coverageReport({ tracks, database }) {
    const cache = await loadCache(database);
    let total = 0;
    let covered = 0;
    let unresolvable = 0;
    const pairCounts = new Map(); // key -> { covered, total }
    for (const t of tracks) {
        if (!t) continue;
        total++;
        if (t.discogs_id) { covered++; continue; }
        const key = pairKeyFor(t);
        if (!key) { unresolvable++; continue; }
        if (cache.has(key)) {
            if (cache.get(key)) covered++;
            else unresolvable++;
        } else {
            // not yet attempted
        }
    }
    const needResolve = new Set();
    for (const t of tracks) {
        if (!t || t.discogs_id) continue;
        const key = pairKeyFor(t);
        if (!key) continue;
        if (cache.has(key)) continue;
        needResolve.add(key);
    }
    return { total, covered, unresolvable, pairsNeedingResolve: needResolve.size };
}

// Convenience: load cache + stamp in one shot.
export async function stampAll(tracks, database) {
    const cache = await loadCache(database);
    return stampDiscogsIds(tracks, cache);
}
