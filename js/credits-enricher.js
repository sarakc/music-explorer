// Credits enricher — fetches Discogs release credits (producer/remixer/engineer/
// mixer/main-artist) for the tracks currently in scope, caches them in
// IndexedDB (`credits_cache` store), and hands the in-memory map to
// buildCreditsGraph so Discover can light up with production-credit edges.
//
// Keeps the Discogs API polite: a rolling-window of concurrent fetches (default
// 3), skips anything already cached in-memory or IDB, and de-dupes release ids
// drawn from the track list.
//
// Output shape (matches credits_cache rows and what credits-graph.js expects):
//   Map<releaseId:string, {
//     producers:   [{ name, norm }],
//     remixers:    [{ name, norm }],
//     engineers:   [{ name, norm }],
//     mixers:      [{ name, norm }],
//     main_artists:[{ name, norm }],
//     styles:      string[],        // Discogs release styles (Phase 1a)
//     release_year: number | null,
//   }>

const ROLE_PATTERNS = [
    { bucket: 'producers', re: /\bproducer\b|\bproduced by\b/i },
    { bucket: 'remixers',  re: /\bremix\b|\bremixer\b|\brmx\b/i },
    { bucket: 'engineers', re: /\bengineer\b|\bmastered by\b|\bmastering\b|\brecorded by\b/i },
    { bucket: 'mixers',    re: /\bmixed by\b|\bmix(?:er)?\b/i },
];

function normName(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Pushes { name, norm } into `bucket[arr]` if not already present (by norm).
function pushDedup(bucketObj, key, name) {
    const norm = normName(name);
    if (!norm) return;
    let arr = bucketObj[key];
    if (!arr) { arr = []; bucketObj[key] = arr; }
    for (const entry of arr) if (entry.norm === norm) return;
    arr.push({ name: String(name).trim(), norm });
}

// Turn the server's flat credits[] into our role-bucketed shape.
// Credit shape from /api/discogs/release/:id/credits:
//   { id, name, role, type: 'person' | 'label' | 'artist' }
// A contributor with multiple roles appears as multiple credits (server splits
// comma-separated roles). Main artists carry role === 'Main Artist'.
// `release` is the envelope's `{ id, year, styles, genres }` (may be null).
function bucketize(creditsArr, release = null) {
    const out = {
        producers: [],
        remixers: [],
        engineers: [],
        mixers: [],
        main_artists: [],
        styles: Array.isArray(release?.styles) ? release.styles : [],
        release_year: release?.year ?? null,
    };
    if (!Array.isArray(creditsArr)) return out;
    for (const c of creditsArr) {
        if (!c || !c.name) continue;
        if (c.type === 'label') continue; // labels live elsewhere
        if (c.role === 'Main Artist' || c.type === 'artist') {
            pushDedup(out, 'main_artists', c.name);
            continue;
        }
        const role = String(c.role || '');
        for (const { bucket, re } of ROLE_PATTERNS) {
            if (re.test(role)) pushDedup(out, bucket, c.name);
        }
    }
    return out;
}

// A credits_cache row → the in-memory shape. `styles` is left undefined on
// legacy rows (written before Phase 1a) so enrichForTracks can refetch them.
function fromRow(row) {
    return {
        producers:   row.producers   || [],
        remixers:    row.remixers    || [],
        engineers:   row.engineers   || [],
        mixers:      row.mixers      || [],
        main_artists: row.main_artists || [],
        styles: row.styles,
        release_year: row.release_year ?? null,
    };
}

// A cached record is complete once it carries `styles`; rows written before
// Phase 1a lack the key and are refreshed once. Kept as the single predicate so
// every "already fetched" check agrees.
const isComplete = (rec) => rec != null && rec.styles !== undefined;

export class CreditsEnricher {
    constructor({ database, connector } = {}) {
        if (!database) throw new Error('CreditsEnricher: database is required');
        if (!connector) throw new Error('CreditsEnricher: connector is required');
        this.database = database;
        this.connector = connector;
        // releaseId (string) -> bucketed credits object (or null if known-missing).
        this.cache = new Map();
        // releaseId -> promise, so parallel callers dedupe mid-flight.
        this._inflight = new Map();
        this._booted = false;
    }

    // Lazy one-time hydrate from IDB on first call. Cheap: getAllCredits is a
    // single range read.
    async _hydrate() {
        if (this._booted) return;
        this._booted = true;
        try {
            const rows = await this.database.getAllCredits();
            for (const row of rows || []) {
                if (!row || !row.id) continue;
                this.cache.set(String(row.id), fromRow(row));
            }
        } catch (err) {
            console.warn('[CreditsEnricher] hydrate failed:', err && err.message);
        }
    }

    isCached(releaseId) {
        if (releaseId == null) return false;
        return this.cache.has(String(releaseId));
    }

    // Returns the current in-memory map (Map<id, bucketedCredits>).
    getCredits() {
        return this.cache;
    }

    // Main entry. `tracks` is the current slice; we distill release ids,
    // prioritise by frequency, and fetch up to `limit` uncached releases with
    // `concurrency` workers. `onProgress(done, total)` fires after every
    // fetch attempt (success or failure).
    async enrichForTracks(tracks, { limit = 200, concurrency = 3, onProgress } = {}) {
        await this._hydrate();

        // 1. Collect release ids + per-release track counts.
        const counts = new Map();
        for (const t of tracks || []) {
            const raw = t && t.discogs_id;
            if (raw == null || raw === '') continue;
            const id = String(raw);
            counts.set(id, (counts.get(id) || 0) + 1);
        }
        if (counts.size === 0) {
            if (typeof onProgress === 'function') onProgress(0, 0);
            return this.cache;
        }

        // 2. Sort by track-count desc (most-owned releases first), then take
        //    uncached ones up to `limit`.
        const sorted = [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([id]) => id);
        //    Legacy rows (cached before styles existed) count as uncached so
        //    they are refreshed once.
        const queue = [];
        for (const id of sorted) {
            if (isComplete(this.cache.get(id))) continue;
            queue.push(id);
            if (queue.length >= limit) break;
        }

        const total = queue.length;
        let done = 0;
        if (typeof onProgress === 'function') onProgress(done, total);
        if (total === 0) return this.cache;

        // 3. Rolling-window fetcher.
        const worker = async () => {
            while (queue.length > 0) {
                const id = queue.shift();
                if (id == null) break;
                try {
                    await this._fetchOne(id);
                } catch (err) {
                    console.warn('[CreditsEnricher] fetch', id, 'failed:', err && err.message);
                }
                done++;
                if (typeof onProgress === 'function') {
                    try { onProgress(done, total); } catch (_) { /* ignore */ }
                }
            }
        };

        const width = Math.max(1, Math.min(concurrency | 0, 6));
        const workers = [];
        for (let i = 0; i < width; i++) workers.push(worker());
        await Promise.all(workers);
        return this.cache;
    }

    // Single-release fetch with in-flight dedup + IDB persistence.
    async _fetchOne(releaseId) {
        const id = String(releaseId);
        const cached = this.cache.get(id);
        if (isComplete(cached)) return cached;
        const pending = this._inflight.get(id);
        if (pending) return pending;

        const task = (async () => {
            // IDB check — may have landed from another session.
            let row = null;
            try { row = await this.database.getCredits(id); } catch (_) { /* ignore */ }
            if (isComplete(row)) {
                const bucketed = fromRow(row);
                this.cache.set(id, bucketed);
                return bucketed;
            }
            // Network. Older servers return a bare credits array instead of
            // the `{ credits, release }` envelope.
            const env = await this.connector.fetchReleaseCredits(id);
            // A failed fetch (null) is not a result: keep whatever was cached so a
            // later pass retries, instead of persisting an empty row as complete.
            if (env == null) return cached ?? null;
            const { credits, release } = Array.isArray(env) ? { credits: env, release: null } : env;
            const bucketed = bucketize(credits, release);
            this.cache.set(id, bucketed);
            try { await this.database.setCredits(id, bucketed); } catch (err) {
                console.warn('[CreditsEnricher] setCredits failed for', id, ':', err && err.message);
            }
            return bucketed;
        })().finally(() => {
            this._inflight.delete(id);
        });

        this._inflight.set(id, task);
        return task;
    }
}

export default CreditsEnricher;
