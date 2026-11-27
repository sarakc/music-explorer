// LabelGap — diffs the user's owned catalogue against Discogs label listings
// to surface releases they're missing on labels they already collect.

import { entityId } from './credits-graph.js';
import { readIdentity, readReleases, summarise } from './discogs-catalogue.js';

// Permissive title normaliser: drops format suffixes, non-remix parentheticals,
// "the ", and non-alphanumerics so "Some Title EP" == "some title".
// Remix/mix parentheticals are preserved as differentiators — a remix is a
// different release than the original (ported from tracklist-mirror.js).
const FORMAT_SUFFIX = /\s*\b(ep|lp|mlp|12"?|10"?|7"?|single|album|remixes?|rmx|vinyl|cd|digital)\b\s*$/i;
const REMIX_MARKER = /\b(?:remix|edit|mix|rework|bootleg|vip|dub|version)\b/i;

function normaliseTitle(s) {
    if (!s) return '';
    let out = s.toString().toLowerCase();
    out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Strip only non-remix parentheticals; keep remix/mix tags so a remix is
    // not collapsed onto the original release.
    out = out.replace(/\s*[\(\[]([^)\]]*)[\)\]]/g, (match, inner) => (
        REMIX_MARKER.test(inner) ? match : ' '
    ));
    for (let i = 0; i < 2; i++) out = out.replace(FORMAT_SUFFIX, '');
    out = out.replace(/^the\s+/, '');
    out = out.replace(/[^a-z0-9]+/g, ' ').trim();
    return out;
}

export default class LabelGap {
    // Reads what the server's Discogs queue has stored (`queue.focus` asks for
    // what is missing); nothing here calls Discogs.
    constructor({ database, queue }) {
        this.database = database;
        this.queue = queue;
        this._catalogueCache = new Map(); // labelName -> { owned, missing, totalCatalog, ownedCount, canonicalName, labelId }
    }

    topLabels(tracks, minOwned = 3) {
        const buckets = new Map();
        for (const t of tracks) {
            const label = (t.label || '').trim();
            if (!label) continue;
            const key = label.toLowerCase();
            let entry = buckets.get(key);
            if (!entry) {
                entry = { label, ownedCount: 0, ownedTitles: new Set(), ownedNormalised: new Set() };
                buckets.set(key, entry);
            }
            entry.ownedCount++;
            const album = (t.album || '').trim();
            if (album) entry.ownedTitles.add(album);
            const norm = normaliseTitle(album || t.title);
            if (norm) entry.ownedNormalised.add(norm);
        }
        return [...buckets.values()]
            .filter((b) => b.ownedCount >= minOwned)
            .sort((a, b) => b.ownedCount - a.ownedCount);
    }

    // → { labelName, discogsId, canonicalName, resolvedAt }; discogsId is null until the identity is confirmed.
    async resolveLabel(labelName) {
        if (!labelName) return null;
        const row = await readIdentity({ database: this.database, queue: this.queue, type: 'label', name: labelName });
        return { labelName, ...summarise(row, labelName) };
    }

    async getGap(labelName, owned, { refresh = false } = {}) {
        if (!refresh && this._catalogueCache.has(labelName)) {
            return this._catalogueCache.get(labelName);
        }
        const resolved = await this.resolveLabel(labelName);
        if (!resolved || !resolved.discogsId) {
            throw Object.assign(new Error(`No Discogs match for "${labelName}"`), { code: 'no-match' });
        }
        const identity = await this.database.getEntityIdentity(entityId('label', labelName));
        const catalogue = await readReleases({ database: this.database, queue: this.queue, type: 'label', name: labelName, row: identity, refresh });

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
                artist: r.artist,
                thumb: r.thumb,
                catno: r.catno,
                url: `https://www.discogs.com/release/${r.id}`,
            });
        }
        missing.sort((a, b) => (b.year || 0) - (a.year || 0));

        const gap = {
            owned: ownedTitles,
            missing,
            totalCatalog: catalogue.length,
            ownedCount: owned?.ownedCount || 0,
            canonicalName: resolved.canonicalName || labelName,
            labelId: resolved.discogsId,
        };
        this._catalogueCache.set(labelName, gap);
        return gap;
    }

    clearCacheFor(labelName) {
        this._catalogueCache.delete(labelName);
    }
}

export { normaliseTitle };
