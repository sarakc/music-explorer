// Music Database Management — a facade over the server-owned database.
// Nothing here opens IndexedDB: every read and write goes out over /api/db.
import { hashKey } from './js/csv-importer.js';
import { dbFetch, dbImportDiscogsTracks, dbGetAll, dbGet, dbPut, dbPatchTrack, dbBatch, dbDelete, dbClear, dbReplaceBandcampAccounts } from './js/db-client.js';
import { STAR, favIds, itemKey, markId, mergeCollections } from './js/favorite-marks.js';
import { VIEWER } from './js/viewer-profile.js';

// Every store and its keyPath. server/db/stores.js mirrors this table (a
// mismatch silently splits rows across two identities), and curation-backup.js
// reads it, so adding a store here is the one step that keeps export/import in
// sync with the schema. Most stores are self-explanatory from their name; a
// few aren't:
//   favorites            — the ☆ collection ("DJ"): starred artists, labels, tags,
//     albums and tracks. Every server reader of favourites reads only this store.
//   favorite_collections — the other favourites collections (♡ "Downtime" and the
//     custom ones), and a built-in's new name; favorite-marks.js has the defaults.
//   favorite_marks       — membership of those collections, one row per
//     `collection:type:name`. Never published in the viewer snapshot.
//   release_credits      — flat Discogs extraartists/labels array per release.
//   release_resolve_map  — (artist|album) → discogs_id, for sources without
//     their own Discogs link.
//   artist_discogs_map   — mirrors label_discogs_map; backs the Artist page's
//     "Also by" section.
//   shortlist            — staging list of releases under consideration.
//   gigs                 — named folders of ordered playlists.
//   pending_tag_diffs    — review-only per-field proposals; never mutates a
//     track or writes a file (see the "Safe tag writes" house rule).
//   credits_cache        — role-bucketed Discogs credits, pre-shaped into
//     { producers, remixers, engineers, mixers, main_artists }. Distinct from
//     release_credits (a flat array) so Discover's graph code can consume it
//     without re-parsing roles.
//   entity_identity / entity_relations — library entity → Discogs identity +
//     resolution, and cached Discogs profile relations (keyed by
//     provider:type:id), for Discover's "related" mode.
//   dismissed_releases   — New Releases rows you dismissed, one per source key
//     (`discogs:<id>`, `bandcamp:<url>`, `spotify:<id>`).
//   play_events          — append-only play/skip log (js/play-history.js),
//     written through POST /api/playback/events or a backup restore.
//   rekordbox_sessions   — Rekordbox DJ history sessions, imported from a copy of
//     master.db by the server (server/lib/rekordbox-history.js).
export const STORE_KEY_PATHS = Object.freeze({
    rb_workspace: 'id',
    playback_queue: 'id',
    play_events: 'id',
    rekordbox_sessions: 'id',
    tracks: 'id',
    playlists: 'id',
    settings: 'key',
    bandcamp_accounts: 'id',
    crates: 'id',
    label_discogs_map: 'labelName',
    artist_discogs_map: 'artistName',
    favorites: 'id',
    favorite_collections: 'id',
    favorite_marks: 'id',
    release_credits: 'discogs_id',
    release_resolve_map: 'key',
    shortlist: 'id',
    gigs: 'id',
    pending_tag_diffs: 'id',
    credits_cache: 'id',
    entity_identity: 'entityId',
    entity_relations: 'ref',
    discogs_releases: 'ref',
    dismissed_releases: 'id',
    entity_links: 'entityId',
});

// ── Library import: identity + merge authority ──────────────────────────
//
// An import (Rekordbox CSV/XML, Shazam) re-describes files UMM already knows
// about. Two rules keep re-imports from destroying UMM's own work:
//
//   Identity — an incoming row is matched to an existing record by, in order:
//     1. the same source id (`rekordbox_xml_id`) or the same `local_path`
//        (exact, then case-insensitive) — so retags and relocations keep the
//        id that gigs, favorites and staged tag diffs point at;
//     2. the importer's metadata-hash id when nobody else owns it, or when
//        its owner has no path binding yet (legacy records);
//     3. otherwise the hash is owned by a *different file* with the same
//        tags: the row gets `<hash>_<pathHash>` and `alternateOf: <owner>`,
//        so an MP3 and its FLAC are linked, not collapsed into one row.
//
//   Merge — the source owns what it exports (tags, bpm, path, play counts…);
//   UMM owns everything else. A field is UMM-owned when the existing record
//   carries a `<field>_source` stamp the importer didn't write itself
//   (enrichment: discogs-release/discogs-auto/musicbrainz/…; cleanup;
//   manual-batch), or when the importer simply doesn't emit it
//   (discogs_*, musicbrainz_*, energy, alternateOf, …). Empty source values
//   never blank an existing value, so importing the same file twice is a no-op.

const isEmptyValue = (v) => v == null || v === '' || v === 0 || (Array.isArray(v) && v.length === 0);

// Fields that share provenance: a manual `tags` edit rewrites `comments` too
// (tag-editor.js), so protecting one must protect the other.
const PROVENANCE_COMPANIONS = { tags: ['comments'] };

function ummOwnedFields(existing, incoming) {
    const owned = new Set();
    for (const [key, stamp] of Object.entries(existing)) {
        if (!key.endsWith('_source') || !stamp || stamp === incoming[key]) continue;
        const field = key.slice(0, -'_source'.length);
        for (const f of [field, ...(PROVENANCE_COMPANIONS[field] || [])]) {
            owned.add(f);
            owned.add(`${f}_source`);
        }
    }
    return owned;
}

// Pure merge of one imported row into its existing record (or a fresh copy
// when there is none). Never changes `id`.
export function mergeImportedTrack(existing, incoming) {
    if (!existing) return { ...incoming };
    const merged = { ...existing };
    const owned = ummOwnedFields(existing, incoming);
    for (const [field, value] of Object.entries(incoming)) {
        if (field === 'id' || owned.has(field) || isEmptyValue(value)) continue;
        merged[field] = value;
    }
    return merged;
}

const trackPath = (t) => t?.local_path || t?.path || '';
// The same file named in another case or Unicode form (NFC/NFD).
const foldPath = (p) => p.normalize('NFC').toLowerCase();

// Lookup tables over the current library, kept current with `add()` so rows
// within one import batch see each other (two same-tagged files in one CSV).
export function buildImportIndex(tracks = []) {
    const byId = new Map();
    const byPath = new Map();
    const byPathLower = new Map();
    const bySourceId = new Map();
    const index = {
        byId, byPath, byPathLower, bySourceId,
        add(track) {
            byId.set(track.id, track);
            const p = trackPath(track);
            if (p) { byPath.set(p, track); byPathLower.set(foldPath(p), track); }
            if (track.rekordbox_xml_id) bySourceId.set(String(track.rekordbox_xml_id), track);
        },
    };
    for (const t of tracks) index.add(t);
    return index;
}

// → { id, existing, alternateOf } for one incoming row. See rules above.
export function resolveImportIdentity(incoming, index) {
    const path = trackPath(incoming);
    const bound = (incoming.rekordbox_xml_id && index.bySourceId.get(String(incoming.rekordbox_xml_id)))
        || (path && (index.byPath.get(path) || index.byPathLower.get(foldPath(path))))
        || null;
    if (bound) return { id: bound.id, existing: bound, alternateOf: bound.alternateOf ?? null };

    const owner = index.byId.get(incoming.id) || null;
    if (!owner || !path || !trackPath(owner)) {
        return { id: incoming.id, existing: owner, alternateOf: owner?.alternateOf ?? null };
    }

    const id = `${incoming.id}_${hashKey(path)}`;
    return { id, existing: index.byId.get(id) || null, alternateOf: owner.alternateOf || owner.id };
}

// Resolve + merge a whole import batch against the current library. Returns
// the records to write, in input order.
export function planImportUpsert(existingTracks, incomingTracks) {
    const index = buildImportIndex(existingTracks);
    return incomingTracks.map((track) => {
        const { id, existing, alternateOf } = resolveImportIdentity(track, index);
        const bound = { ...track, id, alternateOf };
        // The cover-art sentinel names the record it belongs to.
        if (track.coverArt === `local:${track.id}`) bound.coverArt = `local:${id}`;
        const merged = mergeImportedTrack(existing, bound);
        index.add(merged);
        return merged;
    });
}

class MusicDatabase {
    constructor() {
        // No connection to hold: the server owns the database. init() stays
        // async so existing callers that await it keep working unchanged.
        this.ready = true;
    }

    async init() {
        return true;
    }

    async importDiscogsTracks(tracks) {
        return dbImportDiscogsTracks(tracks);
    }

    async addTracks(tracks) {
        return dbBatch('tracks', tracks);
    }

    // Library import entry point: merge parsed rows into existing records
    // (see planImportUpsert) instead of replacing them. Returns what was written.
    async upsertImportedTracks(tracks) {
        const plan = planImportUpsert(await this.getTracks(), tracks);
        await this.addTracks(plan);
        return plan;
    }

    async getTracks(filters = {}) {
        let tracks = await dbGetAll('tracks');

        // Apply filters
        if (filters.platform) {
            tracks = tracks.filter(track => track.platform === filters.platform);
        }
        if (filters.availability) {
            tracks = tracks.filter(track => track.availability === filters.availability);
        }
        if (filters.source) {
            tracks = tracks.filter(track => track.source === filters.source);
        }
        if (filters.genre) {
            tracks = tracks.filter(track => track.genre === filters.genre);
        }
        if (filters.search) {
            const query = filters.search.toLowerCase();
            tracks = tracks.filter(track => 
                track.title.toLowerCase().includes(query) ||
                track.artist.toLowerCase().includes(query) ||
                track.album.toLowerCase().includes(query)
            );
        }

        return tracks;
    }

    async getTrack(trackId) {
        return dbGet('tracks', trackId);
    }

    // ── P3.2 pending tag diffs — review staging only, never track mutation.

    async getPendingTagDiff(id) {
        return (await dbGet('pending_tag_diffs', id)) || null;
    }

    async listPendingTagDiffs(trackId = null) {
        // Stood in for the `by_trackId` index: equality on trackId, then the
        // same staged-order sort the index read used to feed the drawer.
        const rows = (await dbGetAll('pending_tag_diffs')) || [];
        const scoped = trackId == null ? rows : rows.filter(r => r.trackId === trackId);
        return scoped.sort((a, b) => a.stagedAt - b.stagedAt);
    }

    async putPendingTagDiff(record) {
        await dbPut('pending_tag_diffs', record[STORE_KEY_PATHS.pending_tag_diffs], record);
        return record;
    }

    async deletePendingTagDiff(id) {
        return dbDelete('pending_tag_diffs', id);
    }

    async clearPendingTagDiffs(trackId = null) {
        if (trackId == null) {
            return dbClear('pending_tag_diffs');
        }

        const matches = await this.listPendingTagDiffs(trackId);
        for (const row of matches) {
            await dbDelete('pending_tag_diffs', row[STORE_KEY_PATHS.pending_tag_diffs]);
        }
    }

    async updateTrack(track) {
        return dbPut('tracks', track[STORE_KEY_PATHS.tracks], track);
    }

    // Merges only `fields` into the stored row, so a stale copy can't revert
    // anything else (PATCH /api/db/tracks/:id).
    async patchTrack(trackId, fields) {
        return dbPatchTrack(trackId, fields);
    }

    async deleteTrack(trackId) {
        return dbDelete('tracks', trackId);
    }

    async addPlaylist(playlist) {
        return dbPut('playlists', playlist[STORE_KEY_PATHS.playlists], playlist);
    }

    async getPlaylists() {
        return dbGetAll('playlists');
    }

    async saveSetting(key, value) {
        await dbPut('settings', key, { key, value });
    }

    async getSetting(key) {
        return (await dbGet('settings', key))?.value;
    }

    async getBandcampAccounts(accountType = null) {
        const rows = (await dbGetAll('bandcamp_accounts')) || [];
        return accountType ? rows.filter(acc => acc.accountType === accountType) : rows;
    }

    async setBandcampAccounts(accounts, { complete = false } = {}) {
        return dbReplaceBandcampAccounts(accounts, { complete });
    }

    async getLabelDiscogsMap(labelName) {
        return (await dbGet('label_discogs_map', labelName)) || null;
    }

    async setLabelDiscogsMap(record) {
        await dbPut('label_discogs_map', record[STORE_KEY_PATHS.label_discogs_map], record);
    }

    async getArtistDiscogsMap(artistName) {
        return (await dbGet('artist_discogs_map', artistName)) || null;
    }

    async setArtistDiscogsMap(record) {
        await dbPut('artist_discogs_map', record[STORE_KEY_PATHS.artist_discogs_map], record);
    }

    async getReleaseCredits(discogsId) {
        return (await dbGet('release_credits', String(discogsId))) || null;
    }

    async setReleaseCredits(discogsId, credits) {
        const record = { discogs_id: String(discogsId), credits, fetchedAt: Date.now() };
        await dbPut('release_credits', record.discogs_id, record);
        return record;
    }

    async getAllReleaseCredits() {
        return (await dbGetAll('release_credits')) || [];
    }

    async getResolveMap(key) {
        return (await dbGet('release_resolve_map', key)) || null;
    }

    async setResolveMap(record) {
        await dbPut('release_resolve_map', record[STORE_KEY_PATHS.release_resolve_map], record);
    }

    async getAllResolveMap() {
        return (await dbGetAll('release_resolve_map')) || [];
    }

    // ── credits_cache (v11) — bucketed Discogs credits for Discover graph.
    // Value shape: { id, fetched_at, producers, remixers, engineers, mixers, main_artists }
    // Each array element: { name, norm } (lowercased/trimmed for dedup).

    async getCredits(releaseId) {
        const key = String(releaseId);
        return (await dbGet('credits_cache', key)) || null;
    }

    async setCredits(releaseId, data) {
        const rec = {
            id: String(releaseId),
            fetched_at: Date.now(),
            producers: Array.isArray(data?.producers) ? data.producers : [],
            remixers: Array.isArray(data?.remixers) ? data.remixers : [],
            engineers: Array.isArray(data?.engineers) ? data.engineers : [],
            mixers: Array.isArray(data?.mixers) ? data.mixers : [],
            main_artists: Array.isArray(data?.main_artists) ? data.main_artists : [],
            styles: Array.isArray(data?.styles) ? data.styles : [],
            release_year: data?.release_year ?? null,
        };
        await dbPut('credits_cache', rec.id, rec);
        return rec;
    }

    async getAllCredits() {
        return (await dbGetAll('credits_cache')) || [];
    }

    // ── entity_identity / entity_relations (v16) — Discover relations.
    // Rows are stored as given; entity-relations.js owns their shape.

    async getEntityIdentity(entityId) {
        return (await dbGet('entity_identity', entityId)) || null;
    }

    async putEntityIdentity(row) {
        await dbPut('entity_identity', row[STORE_KEY_PATHS.entity_identity], row);
        return row;
    }

    async getAllEntityIdentity() {
        return (await dbGetAll('entity_identity')) || [];
    }

    async deleteEntityIdentity(entityId) {
        return dbDelete('entity_identity', entityId);
    }

    async getEntityRelations(ref) {
        return (await dbGet('entity_relations', ref)) || null;
    }

    async putEntityRelations(row) {
        await dbPut('entity_relations', row[STORE_KEY_PATHS.entity_relations], row);
        return row;
    }

    async getAllEntityRelations() {
        return (await dbGetAll('entity_relations')) || [];
    }

    // entity_links — Bandcamp and Spotify links. Read here; written through /api/links.
    async getEntityLinks(entityId) {
        return (await dbGet('entity_links', entityId)) || null;
    }

    async getAllEntityLinks() {
        return (await dbGetAll('entity_links')) || [];
    }

    // discogs_releases — a confirmed artist's or label's discography, filled by the server queue.
    async getDiscogsReleases(ref) {
        return (await dbGet('discogs_releases', ref)) || null;
    }

    async exportData() {
        const tracks = await this.getTracks();
        const playlists = await this.getPlaylists();
        
        return {
            export_date: new Date().toISOString(),
            tracks,
            playlists,
            total_tracks: tracks.length
        };
    }

    async importData(data) {
        if (data.tracks) {
            await this.addTracks(data.tracks);
        }
        if (data.playlists) {
            for (const playlist of data.playlists) {
                await this.addPlaylist(playlist);
            }
        }
    }

    static favoriteId(type, name) {
        return itemKey(type, name);
    }

    async listFavorites() {
        return (await dbGetAll('favorites')) || [];
    }

    async getFavorite(type, name) {
        const id = MusicDatabase.favoriteId(type, name);
        return (await dbGet('favorites', id)) || null;
    }

    async setFavorite(type, displayName) {
        const id = MusicDatabase.favoriteId(type, displayName);
        const rec = { id, type, name: String(displayName || '').trim(), starredAt: Date.now() };
        await dbPut('favorites', id, rec);
        return rec;
    }

    async removeFavorite(type, name) {
        const id = MusicDatabase.favoriteId(type, name);
        return dbDelete('favorites', id);
    }

    async toggleFavorite(type, displayName) {
        const existing = await this.getFavorite(type, displayName);
        if (existing) {
            await this.removeFavorite(type, displayName);
            return false;
        }
        await this.setFavorite(type, displayName);
        return true;
    }

    // ── Favourites collections (js/favorite-marks.js). ☆ is the `favorites` store
    // above, unchanged; ♡ and the custom collections are favorite_marks rows. The
    // viewer holds ☆ alone: it never asks for the other two stores.

    async listFavoriteCollections() {
        return mergeCollections(VIEWER ? [] : (await dbGetAll('favorite_collections')) || []);
    }

    /** A custom collection `{ id, name, glyph, order }`, or a built-in's new name `{ id, name }`. */
    async saveFavoriteCollection(rec) {
        await dbPut('favorite_collections', rec.id, rec);
        return rec;
    }

    /** A custom collection and its marks, in one server transaction. → `{ collection, marks }` removed. */
    async deleteFavoriteCollection(id) {
        return dbFetch(`/favorite_collections/${encodeURIComponent(id)}/delete`, { method: 'POST' });
    }

    /** Undo of a delete: the collection row and its marks back. */
    async restoreFavoriteCollection({ collection, marks = [] }) {
        if (collection) await dbPut('favorite_collections', collection.id, collection);
        if (marks.length) await dbBatch('favorite_marks', marks);
    }

    /** The marks in these collections (a route's `fav`; null: every collection), each with its `collection`. */
    async listMarks(collections = null) {
        const want = collections == null ? null : new Set(Array.isArray(collections) || collections === true ? favIds(collections) : [collections]);
        const star = !want || want.has(STAR);
        const others = !VIEWER && (!want || [...want].some((id) => id !== STAR));
        const [favs, marks] = await Promise.all([star ? this.listFavorites() : [], others ? dbGetAll('favorite_marks') : []]);
        return [
            ...(favs || []).map((r) => ({ ...r, collection: STAR })),
            ...(marks || []).filter((m) => m && m.collection !== STAR && (!want || want.has(m.collection))),
        ];
    }

    async getMark(collection, type, name) {
        if (collection === STAR) return this.getFavorite(type, name);
        return (await dbGet('favorite_marks', markId(collection, type, name))) || null;
    }

    /** Mark or unmark: true when the item is now in the collection. */
    async toggleMark(collection, type, displayName) {
        if (collection === STAR) return this.toggleFavorite(type, displayName);
        const id = markId(collection, type, displayName);
        if (await dbGet('favorite_marks', id)) {
            await dbDelete('favorite_marks', id);
            return false;
        }
        await dbPut('favorite_marks', id, { id, collection, type, name: String(displayName || '').trim(), markedAt: Date.now() });
        return true;
    }

    // ── Shortlist (P1.2) — local staging list, mirror shape of Favorites.

    async listShortlist() {
        return (await dbGetAll('shortlist')) || [];
    }

    async getShortlistItem(id) {
        return (await dbGet('shortlist', id)) || null;
    }

    async hasShortlistItem(id) {
        const item = await this.getShortlistItem(id);
        return !!item;
    }

    async addToShortlist(item) {
        if (!item || !item.id) throw new Error('addToShortlist: item.id is required');
        const rec = {
            type: 'release',
            ...item,
            addedAt: item.addedAt || Date.now(),
        };
        await dbPut('shortlist', rec[STORE_KEY_PATHS.shortlist], rec);
        return rec;
    }

    async removeFromShortlist(id) {
        return dbDelete('shortlist', id);
    }

    async shortlistCount() {
        return (await this.listShortlist()).length;
    }

    // ── Dismissed releases — one record per source key of a New Releases row.
    async dismissReleases(keys = []) {
        const createdAt = Date.now();
        const rows = [...new Set(keys)].filter(Boolean).map((id) => ({ id, source: String(id).split(':', 1)[0], createdAt }));
        if (rows.length) await dbBatch('dismissed_releases', rows);
        return rows;
    }

    async getStats() {
        const tracks = await this.getTracks();
        
        const stats = {
            total_tracks: tracks.length,
            local_tracks: tracks.filter(t => t.availability === 'local').length,
            streaming_tracks: tracks.filter(t => t.availability === 'streaming').length,
            purchase_tracks: tracks.filter(t => t.availability === 'purchase').length,
            platforms: {},
            genres: {}
        };
        
        tracks.forEach(track => {
            stats.platforms[track.platform] = (stats.platforms[track.platform] || 0) + 1;
            stats.genres[track.genre] = (stats.genres[track.genre] || 0) + 1;
        });
        
        return stats;
    }
}

export default MusicDatabase;
