// ArtistGap — diffs owned tracks against a Discogs artist's full release
// catalogue to surface releases the user is missing for an artist they collect.
//
// Mirrors the shape and flow of label-gap.js so the Artist-page "Also by"
// section and the Label-page "Also on" section read as siblings. Shares the
// title-normaliser with label-gap so two gap surfaces dedupe the same way.

import { normaliseTitle } from './label-gap.js';
import { entityId } from './credits-graph.js';
import { readIdentity, readReleases, summarise } from './discogs-catalogue.js';

// Reads the identity, profile and discography the server's Discogs queue has
// stored; missing pieces are requested from the queue (`queue.focus`) and
// awaited. Nothing here calls Discogs.
export default class ArtistGap {
    constructor({ database, queue }) {
        this.database = database;
        this.queue = queue;
        this._catalogueCache = new Map(); // artistName -> gap record
    }

    /** Collect owned-release titles for a given artist into a lookup. */
    ownedForArtist(tracks, artistName) {
        const needle = (artistName || '').trim().toLowerCase();
        const entry = { ownedCount: 0, ownedTitles: new Set(), ownedNormalised: new Set() };
        if (!needle) return entry;
        for (const t of tracks) {
            if ((t.artist || '').trim().toLowerCase() !== needle) continue;
            entry.ownedCount++;
            const album = (t.album || '').trim();
            if (album) entry.ownedTitles.add(album);
            const norm = normaliseTitle(album || t.title);
            if (norm) entry.ownedNormalised.add(norm);
        }
        return entry;
    }

    // → { artistName, discogsId, canonicalName, resolvedAt }; discogsId is null until the identity is confirmed.
    async resolveArtist(artistName) {
        if (!artistName) return null;
        const row = await readIdentity({ database: this.database, queue: this.queue, type: 'artist', name: artistName });
        return { artistName, ...summarise(row, artistName) };
    }

    async getGap(artistName, owned, { refresh = false } = {}) {
        if (!refresh && this._catalogueCache.has(artistName)) {
            return this._catalogueCache.get(artistName);
        }
        const resolved = await this.resolveArtist(artistName);
        if (!resolved || !resolved.discogsId) {
            throw Object.assign(new Error(`No Discogs match for "${artistName}"`), { code: 'no-match' });
        }
        const identity = await this.database.getEntityIdentity(entityId('artist', artistName));
        const catalogue = await readReleases({ database: this.database, queue: this.queue, type: 'artist', name: artistName, row: identity, refresh });

        const ownedNorm = owned?.ownedNormalised || new Set();
        const ownedTitles = owned?.ownedTitles ? [...owned.ownedTitles] : [];
        const missing = [];
        for (const r of catalogue) {
            const norm = normaliseTitle(r.title);
            if (norm && ownedNorm.has(norm)) continue;
            missing.push({
                id: r.id,
                title: r.title,
                year: r.year,
                // Discogs artist-releases returns `role`, `label`, `type`. Keep label so
                // users can scan for the labels the artist released on.
                role: r.role,
                label: Array.isArray(r.label) ? r.label.join(', ') : r.label,
                thumb: r.thumb,
                type: r.type,
                mainRelease: r.mainRelease,
                url: r.type === 'master'
                    ? `https://www.discogs.com/master/${r.id}`
                    : `https://www.discogs.com/release/${r.id}`,
            });
        }
        missing.sort((a, b) => (b.year || 0) - (a.year || 0));

        const gap = {
            owned: ownedTitles,
            missing,
            totalCatalog: catalogue.length,
            ownedCount: owned?.ownedCount || 0,
            canonicalName: resolved.canonicalName || artistName,
            artistId: resolved.discogsId,
        };
        this._catalogueCache.set(artistName, gap);
        return gap;
    }

    clearCacheFor(artistName) {
        this._catalogueCache.delete(artistName);
    }

}
