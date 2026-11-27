// The scope: what Sara is working with, set on purpose from a selection and its rings
// ("Around BOYLAN"), apart from the selection, which is only where she is looking. It is a
// filter condition, `around:<id>@<depth>` in the route's `f`, so Back, a reload and a link
// keep it; the table lists its tracks and the graph lights them. Its track ids are worked out
// from the atlas and the focus payload, the same way on the map and from a link. Pure but
// resolveScope, which reads through AtlasData.
import { ATLAS } from './atlas-config.js';
import { ringOf } from './atlas-settle.js';
import { hostFor } from './atlas-data.js';
import { shows } from './atlas-options.js';
import { subgraphNodes, subgraphTracks } from './subgraph.js';

/** The ids a focus links to: the server's, and the neighbours marked linked. */
export function linkedIdsOf(payload) {
    return new Set([...(payload?.linkedIds || []), ...(payload?.neighbours || []).filter((n) => n.linked).map((n) => n.id)]);
}

/**
 * A selection's rings at ring depth `depth` (an index into ATLAS.selectDepth): its neighbours
 * (an album's or track's links first), then their strongest links, as the map draws them.
 */
export function selectionRing({ atlas, focus, payload, linkedIds = linkedIdsOf(payload), depth, at = null }) {
    const own = atlas.byId.get(focus.id)?.i ?? null, idx = (id) => atlas.byId.get(id)?.i;
    const ids = [...((focus.type === 'album' || focus.type === 'track') ? linkedIds : []), ...(payload?.neighbours || []).map((n) => n.id)];
    const first = [...new Set(ids.map(idx).filter((i) => i != null && i !== own))];
    return ringOf({ focusIndex: own, at, first, adjacency: atlas.adjacency, links: atlas.linksAll, depth: ATLAS.selectDepth[depth] || ATLAS.selectDepth[0] });
}

/**
 * The scope's nodes and tracks: the selection and the rings it shows at `depth`, as Show
 * (`show`) draws them, and the tracks they hold (subgraph.js). `tracks` every merged track.
 * Returns { name, ids } (track ids as strings, in `tracks` order).
 */
export function scopeTracks({ atlas, payload, depth, show = null, tracks = [] }) {
    const f = payload?.focus;
    if (!atlas || !f?.id) return { name: '', ids: [] };
    const ring = selectionRing({ atlas, focus: f, payload, depth });
    const keep = new Set([f.id, hostFor(f, payload, atlas)].filter(Boolean));
    const nodes = subgraphNodes({ focus: f, ring: [...ring.set].map((i) => atlas.nodes[i]), shows: (type, id) => shows(show, type, id, keep) });
    return { name: f.name || '', ids: subgraphTracks({ nodes, focusId: f.id, tracks }).map((t) => String(t.id)) };
}

// Scopes worked out this session, by `<id>@<depth>`: a route back to one needs no atlas read.
const known = new Map();
const keyOf = (scope) => `${scope.id}@${scope.depth}`;

/** Keep a scope's name and tracks for the session. */
export function rememberScope(scope) {
    if (scope?.id && scope.ids) known.set(keyOf(scope), { name: scope.name || '', ids: [...scope.ids] });
}

/**
 * Fill in a scope from a route (`ids` null): from this session's, else from the atlas and the
 * focus payload (`data`, an AtlasData). A node that is not on the map scopes to nothing.
 * Not pure: it reads through `data`. Returns the scope, or null when `isAlive()` turned false.
 */
export async function resolveScope(scope, { data, tracks, show = null, isAlive = () => true }) {
    if (!scope?.id || scope.ids) return scope;
    const kept = known.get(keyOf(scope));
    if (kept) return Object.assign(scope, kept, { ids: [...kept.ids] });
    let out = { name: '', ids: [] };
    try {
        const loaded = await data.load({ isAlive });
        if (!isAlive()) return null;
        const payload = loaded?.atlas ? await data.focus(scope.id, { isAlive }) : null;
        if (!isAlive()) return null;
        if (payload) out = scopeTracks({ atlas: loaded.atlas, payload, depth: scope.depth, show, tracks: await tracks() });
    } catch (_) { /* not on the map: the scope holds nothing, and its chip still clears it */ }
    if (!isAlive()) return null;
    Object.assign(scope, out);
    rememberScope(scope);
    return scope;
}
