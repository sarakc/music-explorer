// Favorite records are keyed `type:name` (lower-cased, see MusicDatabase.favoriteId);
// the similarity engine, the atlas and Discogs key entities by `entityId`. This maps a
// favorite record to that entity id. Pure, so the server can import it too.
import { entityId } from './credits-graph.js';

const NAMED = new Set(['artist', 'label', 'tag']);

/** The entity id for a favorite record, or null when it has none (an album saved without its artist). */
export function favoriteEntityId(record) {
    const type = record?.type;
    let name = String(record?.name ?? '').trim();
    if (!name && typeof record?.id === 'string' && record.id.startsWith(`${type}:`)) name = record.id.slice(type.length + 1).trim();
    if (!name) return null;
    if (NAMED.has(type)) return entityId(type, name);
    if (type === 'album') {
        // Album favorites store `<artist>::<album>`; the engine keys albums `<artist>|<album>`.
        const at = name.indexOf('::');
        const artist = at < 0 ? '' : name.slice(0, at).trim();
        const album = at < 0 ? '' : name.slice(at + 2).trim();
        return artist && album ? entityId('album', `${artist}|${album}`) : null;
    }
    if (type === 'track') return `track:${name}`;
    return null;
}
