// The selection's subgraph: the selected node and the rings it shows, as Show draws them,
// and the tracks they hold, for the selection bar's Scope (scope.js). Pure: the view
// passes the nodes, the tracks and the lit set.
//
// Its artists, labels, albums and tracks bring their own tracks, as their rows would. Tags
// describe a neighbourhood rather than hold it: a neighbouring tag like Vocals or Club would
// bring a fifth of the library, so a tag brings its tracks only when it is the selection, or
// when the subgraph holds nothing but tags (Show › Tags alone). A kind Show leaves off adds
// nothing.
import { entityId } from '../credits-graph.js';
import { trackNodeIds } from './atlas-lit.js';

/**
 * The subgraph's nodes: `focus` first (unless it is outside the library), then the `ring`
 * nodes `shows(type, id)` draws, once each. Outside nodes hold no tracks and are left out.
 */
export function subgraphNodes({ focus = null, ring = [], shows = () => true } = {}) {
    const out = [], seen = new Set();
    const add = (n) => {
        if (!n?.id || n.outside || seen.has(n.id)) return;
        seen.add(n.id);
        out.push({ id: n.id, type: n.type, name: n.name || '' });
    };
    if (focus) add(focus);
    for (const n of ring || []) if (n && shows(n.type, n.id)) add(n);
    return out;
}

/** The nodes that bring tracks: all but the tags around the selection, unless tags are all there is. */
export function trackHolders(nodes = [], focusId = null) {
    const list = (nodes || []).filter((n) => n?.id);
    if (list.every((n) => n.type === 'tag')) return list;
    return list.filter((n) => n.type !== 'tag' || n.id === focusId);
}

/**
 * The tracks the subgraph holds, in `tracks` order, once each: a track belongs when it is a
 * track node, on an album node, or by an artist, label or tag node that brings tracks
 * (`trackHolders`; `focusId` is the selection). `within` (a Set of track ids, the lit
 * tracks) narrows it; `playable` keeps only what can play.
 */
export function subgraphTracks({ nodes = [], focusId = null, tracks = [], within = null, playable = () => true } = {}) {
    const ids = new Set(trackHolders(nodes, focusId).map((n) => n.id));
    if (!ids.size) return [];
    const seen = new Set(), out = [];
    for (const t of tracks || []) {
        if (t?.id == null) continue;
        const id = String(t.id);
        if (seen.has(id) || (within && !within.has(id))) continue;
        const holds = ids.has(`track:${id}`)
            || (t.album && ids.has(entityId('album', `${t.artist}|${t.album}`)))
            || trackNodeIds(t).some((n) => ids.has(n));
        if (!holds || !playable(t)) continue;
        seen.add(id);
        out.push(t);
    }
    return out;
}

/** The words for the subgraph: the filter line's pill and the queue's source. */
export const subgraphLabel = (focus) => `Around ${focus?.name || 'the selection'}`;
