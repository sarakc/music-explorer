// The tracks the graph's Shuffle plays: the owned, locally playable tracks that
// pass the Filter band and ☆, by the same node test atlas-lit.js lights nodes with.
// Pure: the view passes the tracks, the ids that pass the filter, and the favorites.
import { entityId } from '../credits-graph.js';
import { favoriteEntityId } from '../favorite-ids.js';
import { VIEW_LABELS } from '../router.js';
import { trackNodeIds } from './atlas-lit.js';

/**
 * `tracks` the owned tracks (outside nodes are no tracks, so they add nothing),
 * `passing` a Set of track ids that pass the filter or null with no filter,
 * `favorites` the favorite records or null with ☆ off, `playable` the playable test.
 * A track is in a favorite artist, label or tag by the nodes it belongs to (as the
 * atlas lights them), in a favorite album by its artist and album, or is itself a favorite.
 */
export function shufflePool({ tracks = [], passing = null, favorites = null, playable = () => true } = {}) {
    let starNodes = null, starAlbums = null, starTracks = null;
    if (favorites) {
        starNodes = new Set(); starAlbums = new Set(); starTracks = new Set();
        for (const r of favorites) {
            const id = favoriteEntityId(r);
            if (!id) continue;
            if (r.type === 'album') starAlbums.add(id);
            else if (r.type === 'track') starTracks.add(id);
            else starNodes.add(id);
        }
    }
    const seen = new Set();
    const pool = [];
    for (const t of tracks || []) {
        if (!t || !playable(t)) continue;
        const id = String(t.id);
        if (seen.has(id)) continue;
        if (passing && !passing.has(id)) continue;
        if (favorites) {
            const star = starTracks.has(`track:${id}`)
                || trackNodeIds(t).some((n) => starNodes.has(n))
                || (t.album && starAlbums.has(entityId('album', `${t.artist}|${t.album}`)));
            if (!star) continue;
        }
        seen.add(id);
        pool.push(t);
    }
    return pool;
}

/**
 * A Collection graph's header count, counted as the table counts: ☆ narrows the
 * total, and `lit` (the tracks the graph lights, filter and ☆ applied) is what is left.
 * `counts` keeps only the tracks the tab's table lists (Tracks leaves out Exploreme
 * unless the setting includes it). `total` the tracks counted from, `count` the lit ones.
 */
export function graphCount({ tracks = [], favorites = null, lit = [], counts = null } = {}) {
    const base = counts ? tracks.filter(counts) : tracks;
    return { total: favorites ? shufflePool({ tracks: base, favorites }) : base, count: counts ? lit.filter(counts).length : lit.length };
}

/** The queue context for a graph's Shuffle: "Artists graph", "Discover graph". */
export function graphShuffleContext(view, route = null) {
    const label = `${VIEW_LABELS[view] || 'Collection'} graph`;
    return { key: `graph:${view}`, kind: 'collection', label, route: route ? JSON.parse(JSON.stringify(route)) : { view, graph: view !== 'discover' } };
}
