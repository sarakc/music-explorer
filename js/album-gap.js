// AlbumGap — resolves an (artist, album) pair to a Discogs release and
// diffs its tracklist against the tracks the user owns from that album. Mirrors
// artist-gap.js / label-gap.js so the Album-page tracklist section reads
// as a sibling of "Also by" and "Also on".
//
// Shares the title normaliser with label-gap so dedup collapses the same
// way across all three surfaces.

import { normaliseTitle } from './label-gap.js';
import { VIEWER } from './viewer-profile.js';

const MAP_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days — release IDs are stable.

// A key the IDB `release_resolve_map` store understands. Matches the
// normalisation used on the server resolve endpoint (normalise = lowercase +
// strip-accents + non-alphanum). Not the same as normaliseTitle above, which
// also strips "the " and format suffixes — that would over-collapse keys.
function resolveKey(artist, album) {
    const norm = (s) => String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    return `${norm(artist)}|${norm(album)}`;
}

export default class AlbumGap {
    constructor({ database }) {
        this.database = database;
        // (artist|album) -> resolved release summary + tracklist + diff.
        // Keyed separately from the IDB cache so in-session hits skip both the
        // server round-trip AND the IDB read.
        this._gapCache = new Map();
    }

    _cacheKey(artistName, albumName) {
        return `${(artistName || '').toLowerCase()}::${(albumName || '').toLowerCase()}`;
    }

    /** Resolve (artist, album) to a Discogs release_id.
     *
     *  Uses the existing `/api/discogs/release/resolve` endpoint. Caches the
     *  answer in the shared `release_resolve_map` IDB store (v9) so later
     *  sessions don't re-hit the network. Returns { releaseId, confidence,
     *  title, year, thumb } or null on no match. */
    async resolveAlbum(artistName, albumName) {
        if (!artistName || !albumName) return null;
        const key = resolveKey(artistName, albumName);
        if (this.database) {
            const cached = await this.database.getResolveMap(key);
            // A snapshot's answers never go stale: the viewer can't ask Discogs again.
            if (cached && (VIEWER || Date.now() - (cached.resolvedAt || 0) < MAP_TTL)) {
                if (!cached.releaseId) return null;
                return {
                    releaseId: cached.releaseId,
                    confidence: cached.confidence || 0,
                    title: cached.title || '',
                    year: cached.year || null,
                    thumb: cached.thumb || '',
                };
            }
        }

        // The viewer cannot search Discogs: an album the snapshot did not resolve is a limit of the snapshot.
        if (VIEWER) throw Object.assign(new Error('Not in the snapshot'), { code: 'snapshot' });

        const params = new URLSearchParams({ artist: artistName, album: albumName });
        const res = await fetch(`/api/discogs/release/resolve?${params.toString()}`);
        if (!res.ok) {
            const err = new Error(`album resolve failed (${res.status})`);
            err.code = res.status === 429 ? 'rate-limit' : 'fetch';
            throw err;
        }
        const data = await res.json();
        const match = data.match;
        if (this.database && !VIEWER) {
            await this.database.setResolveMap({
                key,
                artist: artistName,
                album: albumName,
                releaseId: match?.release_id || null,
                confidence: match?.confidence || 0,
                title: match?.title || '',
                year: match?.year || null,
                thumb: match?.thumb || '',
                resolvedAt: Date.now(),
            });
        }
        if (!match) return null;
        return {
            releaseId: match.release_id,
            confidence: match.confidence || 0,
            title: match.title || '',
            year: match.year || null,
            thumb: match.thumb || '',
        };
    }

    /** Diff the Discogs tracklist for (artist, album) against the tracks the user
     *  owns from that album.
     *
     *  `ownedTracks` should be the pre-filtered array of unified-track records
     *  for this album; AlbumPage does the filtering at state-compute time.
     *
     *  Returns { release, tracklist: [{position, title, type, artists, owned}…],
     *  totalCount, ownedCount } or throws a coded error ('no-match' | 'rate-limit' | 'fetch' | 'snapshot'). */
    async getGap(artistName, albumName, ownedTracks, { refresh = false } = {}) {
        const ck = this._cacheKey(artistName, albumName);
        if (!refresh && this._gapCache.has(ck)) return this._gapCache.get(ck);

        const resolved = await this.resolveAlbum(artistName, albumName);
        if (!resolved || !resolved.releaseId) {
            throw Object.assign(new Error(`No Discogs match for "${albumName}"`), { code: 'no-match' });
        }
        const res = await fetch(`/api/discogs/release/${resolved.releaseId}${refresh ? '?refresh=1' : ''}`);
        if (!res.ok) {
            const err = new Error(`fetch failed (${res.status})`);
            err.code = res.status === 429 ? 'rate-limit' : 'fetch';
            throw err;
        }
        const data = await res.json();
        const release = data.release || {};
        const rawTracklist = Array.isArray(release.tracklist) ? release.tracklist : [];

        // Build a normalised lookup from the owned tracks on this album. Keyed
        // on title (albums rarely collide by track title once artist+album
        // are already scoped).
        const ownedByNorm = new Map();
        for (const t of (ownedTracks || [])) {
            const norm = normaliseTitle(t.title);
            if (!norm) continue;
            if (!ownedByNorm.has(norm)) ownedByNorm.set(norm, t);
        }

        const tracklist = rawTracklist.map((t) => {
            const norm = normaliseTitle(t.title);
            const ownedMatch = norm ? ownedByNorm.get(norm) : null;
            return {
                position: t.position || '',
                type: t.type || 'track',
                title: t.title || '',
                duration: t.duration || '',
                artists: t.artists || '',
                owned: !!ownedMatch,
                ownedTrack: ownedMatch || null,
            };
        });

        const trackRows = tracklist.filter((t) => t.type === 'track' || !t.type);
        const ownedCount = trackRows.filter((t) => t.owned).length;
        const totalCount = trackRows.length;

        const gap = {
            release,
            tracklist,
            totalCount,
            ownedCount,
            resolved,
        };
        this._gapCache.set(ck, gap);
        return gap;
    }

    clearCacheFor(artistName, albumName) {
        this._gapCache.delete(this._cacheKey(artistName, albumName));
    }
}

export { resolveKey };
