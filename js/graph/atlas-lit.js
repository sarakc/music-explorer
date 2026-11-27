// Which atlas nodes are lit on Explore › Graph and Discover › Graph: ☆ and the
// Filter band (with search) pick out the nodes the bright layer draws (atlas-layers.js);
// everything else joins the backdrop. Pure: the view passes the tracks, the ids of the tracks that pass the
// filter, and the favorite records.
import { entityId, artistNodeIds } from '../credits-graph.js';
import { favoriteEntityId } from '../favorite-ids.js';
import { tagsOf } from '../entity-index.js';

export { artistNodeIds };

/** The artist, label and tag nodes a track belongs to. */
export function trackNodeIds(track) {
    return [...artistNodeIds(track?.artist), entityId('label', track?.label), ...tagsOf(track).map((tag) => entityId('tag', tag))].filter(Boolean);
}

/**
 * The lit node ids, or null when neither ☆ nor a filter is on.
 *   passing    ids of the tracks that pass the filter (a Set), or null with no filter:
 *              a node is lit when at least one of its tracks passes
 *   favorites  the favorite records, or null with ☆ off: a node is lit when it is a
 *              favorite artist, label or tag, or the artist of a favorite album or track
 * With both, a node must be lit by both.
 */
export function litSet({ tracks = [], passing = null, favorites = null } = {}) {
    if (!passing && !favorites) return null;
    let byFilter = null, byStar = null;
    if (passing) {
        byFilter = new Set();
        for (const t of tracks || []) if (t && passing.has(String(t.id))) for (const id of trackNodeIds(t)) byFilter.add(id);
    }
    if (favorites) {
        byStar = new Set();
        const trackById = new Map((tracks || []).filter(Boolean).map((t) => [String(t.id), t]));
        for (const r of favorites) {
            if (r?.type === 'artist' || r?.type === 'label' || r?.type === 'tag') { const id = favoriteEntityId(r); if (id) byStar.add(id); }
            else if (r?.type === 'album') {
                // Album favorites store `<artist>::<album>`.
                const name = String(r.name ?? ''), at = name.indexOf('::');
                if (at > 0) for (const id of artistNodeIds(name.slice(0, at))) byStar.add(id);
            } else if (r?.type === 'track') {
                const id = favoriteEntityId(r);
                const t = id && trackById.get(id.slice('track:'.length));
                if (t) for (const a of artistNodeIds(t.artist)) byStar.add(a);
            }
        }
    }
    if (!byFilter) return byStar;
    if (!byStar) return byFilter;
    return new Set([...byFilter].filter((id) => byStar.has(id)));
}

/** A lit set that lights nothing on this atlas: "Nothing matches". */
export function nothingLit(lit, atlas) {
    if (!lit || !atlas) return false;
    for (const id of lit) if (atlas.byId.has(id)) return false;
    return true;
}
