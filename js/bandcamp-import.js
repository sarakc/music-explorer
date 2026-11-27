// Bandcamp JSON import (scripts/bandcamp_import.py output) into the tracks store.
//
// Identity: a collection item is its `bandcamp_url`. Its row id is
// `bandcamp_<hashKey(url)>`, a 32-bit hash, so two URLs can share one. A row
// already bound to the URL keeps its id; a new URL whose id belongs to a
// different URL gets `<id>_2` (then `_3`…), never the other row.
//
// Merge: an existing row keeps every field the JSON doesn't carry (`_source`
// enrichment, edits, later fields) and takes the ones it does, through the
// library-import merge (mergeImportedTrack), so a stamped enrichment stays and
// an empty value never blanks one. Defaults ('Unknown', 'unknown' genre) fill a
// new row only.
import { hashKey } from './csv-importer.js';
import { mergeImportedTrack } from '../music-database.js';

const NEW_ROW_DEFAULTS = {
    title: 'Unknown', artist: 'Unknown Artist', album: null, genre: 'unknown', year: null, duration: 0,
    date_added: '', coverArt: null, coverArt_source: null, item_type: null, bandcamp_url: null,
};

/** The fields one collection item carries, without defaults. */
export function bandcampTrackFromItem(item, idx) {
    const url = item.bandcamp_url || null;
    return {
        id: 'bandcamp_' + hashKey(url || ('item_' + idx)),
        title: item.title || null,
        artist: item.artist || null,
        album: item.album || (item.item_type === 'album' ? item.title : null) || null,
        genre: item.genre || null,
        year: item.year || null,
        duration: item.duration || 0,
        platform: 'bandcamp',
        availability: 'purchase',
        source: 'bandcamp',
        bandcamp_url: url,
        // Preserved for the dedup matcher: album purchases match on (artist, album),
        // track purchases match on (artist, title).
        item_type: item.item_type || null,
        date_added: item.date_added || '',
        // The scrape stores a full CDN URL in `image_url`; it maps to `coverArt`.
        coverArt: item.image_url || null,
        coverArt_source: item.image_url ? 'bandcamp' : null,
    };
}

/** The rows to write for `items`, merged into `existingTracks`, in input order. */
export function planBandcampUpsert(existingTracks, items) {
    const byId = new Map(existingTracks.map((t) => [t.id, t]));
    const byUrl = new Map();
    for (const t of existingTracks) if (t.source === 'bandcamp' && t.bandcamp_url) byUrl.set(t.bandcamp_url, t);
    return items.map((item, idx) => {
        const incoming = bandcampTrackFromItem(item, idx);
        const url = incoming.bandcamp_url;
        let existing = (url && byUrl.get(url)) || null;
        if (!existing) {
            const owner = byId.get(incoming.id);
            if (owner && url && owner.bandcamp_url !== url) {
                let n = 2;
                while (byId.has(`${incoming.id}_${n}`)) n++;
                incoming.id = `${incoming.id}_${n}`;
            } else existing = owner || null;
        }
        const row = existing
            ? mergeImportedTrack(existing, { ...incoming, id: existing.id })
            : mergeImportedTrack(null, { ...NEW_ROW_DEFAULTS, ...dropEmpty(incoming) });
        byId.set(row.id, row);
        if (url) byUrl.set(url, row);
        return row;
    });
}

const dropEmpty = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));

/** The Import view's line for an importBandcampData result. */
export const bandcampImportSummary = ({ tracksAdded, accountsAdded, accountsKept }) => (accountsKept
    ? `${tracksAdded} tracks. Accounts unchanged: incomplete scan.`
    : `${tracksAdded} tracks, ${accountsAdded} accounts.`);
