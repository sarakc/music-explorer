// Client-side connector that fetches Discogs data from our backend and maps to unified schema

export function parseDiscogsDuration(value) {
    if (typeof value !== 'string' || !/^\d+:[0-5]\d(?::[0-5]\d)?$/.test(value.trim())) return 0;
    return value.trim().split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0);
}

class DiscogsConnector {
    constructor() {
        this.connected = false;
    }

    async fetchCollection({ onProgress } = {}) {
        const read = async (url) => {
            const res = await fetch(url);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Discogs fetch failed (${res.status})`);
            return data;
        };
        const data = await read('/api/discogs/collection');
        if (!Array.isArray(data.releases)) throw new Error('Discogs returned no collection list.');
        const releases = [...new Map(data.releases.map(r => [r.discogs_id, r])).values()];
        const tracks = [];
        // Sequential requests share the server's Discogs rate-limit queue.
        // Nothing is saved until every release has been fetched successfully.
        for (const [index, release] of releases.entries()) {
            onProgress?.({ completed: index, total: releases.length, title: release.title });
            const detail = await read(`/api/discogs/release/${encodeURIComponent(release.discogs_id)}`);
            const songs = this.toUnifiedTracks(release, detail.release?.tracklist);
            if (!songs.length) throw new Error(`No song tracklist found for “${release.title}”. Import left unchanged.`);
            tracks.push(...songs);
        }
        onProgress?.({ completed: releases.length, total: releases.length });
        return tracks;
    }

    toUnifiedTracks(release, tracklist) {
        const songs = [];
        const visit = (list, parent = {}, path = []) => {
            for (const [index, track] of (list || []).entries()) {
                const key = [...path, index + 1];
                const artists = track.artists || parent.artists || release.artist;
                if (track.sub_tracks?.length) {
                    visit(track.sub_tracks, { artists }, key);
                } else if ((track.type || track.type_ || 'track') === 'track' && track.title?.trim()) {
                    songs.push({ ...track, artists, key: key.join('.') });
                }
            }
        };
        visit(tracklist);
        const coverArt = release.cover_image || release.thumb || null;
        return songs.map((song, index) => ({
            // The tracklist path distinguishes repeated/blank positions and titles.
            id: `discogs_${release.discogs_id}_track_${song.key}`,
            title: song.title,
            artist: song.artists,
            album: release.album || release.title,
            genre: release.genre,
            style: release.style || '',
            year: release.year,
            duration: parseDiscogsDuration(song.duration),
            track_number: index + 1,
            discogs_position: song.position || '',
            platform: 'discogs',
            source: 'discogs',
            availability: 'owned',
            label: release.label,
            discogs_url: release.discogs_url,
            discogs_id: release.discogs_id,
            thumb: release.thumb,
            coverArt,
            coverArt_source: coverArt ? 'discogs' : null,
            format: release.format,
            date_added: release.date_added,
            tags: [],
            comments: '',
        }));
    }

    async searchArtist(name) {
        const res = await fetch(`/api/discogs/search?q=${encodeURIComponent(name)}&type=artist`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.results || [];
    }

    async searchLabel(name) {
        const res = await fetch(`/api/discogs/search?q=${encodeURIComponent(name)}&type=label`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.results || [];
    }

    async getArtistReleases(artistId, sort = 'year', sortOrder = 'desc') {
        const res = await fetch(`/api/discogs/artist/${artistId}/releases?sort=${sort}&sort_order=${sortOrder}`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.releases || [];
    }

    // Used by CreditsEnricher. Returns the whole envelope from
    // /api/discogs/release/:id/credits — `{ credits, release }` where
    // `release` is `{ id, year, styles, genres }` (or null on an older server)
    // — so the enricher can keep release styles alongside the credits.
    async fetchReleaseCredits(releaseId) {
        const res = await fetch(`/api/discogs/release/${releaseId}/credits`);
        if (!res.ok) return null;
        const data = await res.json();
        return {
            credits: Array.isArray(data.credits) ? data.credits : [],
            release: data.release || null,
        };
    }

    // Discogs artist/label profiles (aliases, members, groups, sublabels,
    // profile text). These THROW on a non-OK response so callers can tell a
    // failed fetch apart from a profile that simply lists nothing. `refresh`
    // busts the server's own profile cache as well as the caller's.
    getArtistProfile(artistId, { refresh = false } = {}) { return this._profile('artist', artistId, refresh); }
    getLabelProfile(labelId, { refresh = false } = {}) { return this._profile('label', labelId, refresh); }

    async _profile(kind, id, refresh) {
        const res = await fetch(`/api/discogs/${kind}/${id}/profile${refresh ? '?refresh=1' : ''}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Discogs ${kind} profile failed (${res.status})`);
        }
        const data = await res.json();
        return data.profile;
    }

    // Resolve artist+(album|title) → discogs release_id via search.
    // Returns { release_id, title, year, confidence } or null.
    async resolveRelease({ artist, album, title }) {
        const params = new URLSearchParams();
        if (artist) params.set('artist', artist);
        if (album) params.set('album', album);
        if (title) params.set('title', title);
        const res = await fetch(`/api/discogs/release/resolve?${params}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.match || null;
    }
}

export default DiscogsConnector;
