// The mirror with no scope: the Tracks table and the map show the same place. The map's
// selection marks its rows in the table (in its colour; `v` scrolls to the first when none is
// in view); rows selected in the table light their artists on the map, and one selected row
// focuses its track's node; keyboard focus crosses with the switch. A selection never
// filters the table (the scope does, graph/scope.js). Pure.
import { subgraphTracks } from './graph/subgraph.js';
import { artistNodeIds } from './graph/atlas-lit.js';

/** A node id's kind: `artist:~x` is an artist. */
export const nodeType = (id) => String(id || '').split(':')[0] || null;

/** The track ids (strings) a graph selection marks in the table: the node's own tracks, as its row would list them. */
export function markedTrackIds(focusId, tracks = []) {
    const type = nodeType(focusId);
    if (!focusId || !type) return new Set();
    return new Set(subgraphTracks({ nodes: [{ id: focusId, type }], focusId, tracks }).map((t) => String(t.id)));
}

/** The index of the first marked row in table order, or -1. */
export function firstMarked(ordered = [], marked = new Set()) {
    if (!marked.size) return -1;
    return ordered.findIndex((t) => marked.has(String(t?.id)));
}

/**
 * What the map opens on from the table (`v`): several selected rows light their artists and
 * select nothing; one selected row, or the focused row, selects its track; else the tab's
 * graph comes back on the selection it had (`remembered`).
 */
export function graphFromTable({ selected = [], focusedId = null, remembered = null } = {}) {
    const ids = [...selected].map(String);
    if (ids.length > 1) return { focus: null, rows: ids };
    const one = ids[0] ?? (focusedId != null ? String(focusedId) : null);
    if (one != null) return { focus: `track:${one}`, rows: null };
    return { focus: remembered || null, rows: null };
}

/** The atlas node ids several rows light: their artists'. */
export function rowArtistIds(trackIds = [], tracks = []) {
    const want = new Set([...trackIds].map(String)), out = new Set();
    for (const t of tracks) if (want.has(String(t?.id))) for (const id of artistNodeIds(t.artist)) out.add(id);
    return out;
}
