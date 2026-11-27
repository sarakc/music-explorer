// What a graph node does in place of a Tracks table row: the tracks it owns, what it
// queues, where an arrow key lands and what a row key does on it. Pure: the view
// passes the lit tracks (atlas-view.js keeps them with Shuffle's), all tracks, the
// playable test and the table's order.
import { entityId } from '../credits-graph.js';
import { trackNodeIds } from './atlas-lit.js';

/** Does a track belong to the node: itself, its album, or an artist, label or tag it carries? */
export function nodeOwns(node, track) {
    if (!node?.id || !track) return false;
    if (node.type === 'track') return node.id === `track:${track.id}`;
    if (node.type === 'album') return Boolean(track.album) && node.id === entityId('album', `${track.artist}|${track.album}`);
    return trackNodeIds(track).includes(node.id);
}

/** The lit tracks the node owns; when none of them is lit, all of its own. A track node is its track. */
export function nodeTracks({ node, lit = [], tracks = [] }) {
    if (node?.type === 'track') return tracks.filter((t) => nodeOwns(node, t)).slice(0, 1);
    const own = (lit || []).filter((t) => nodeOwns(node, t));
    return own.length ? own : (tracks || []).filter((t) => nodeOwns(node, t));
}

/**
 * What a node plays, as a table row would: a track from itself through the lit tracks
 * (itself among them), anything else its tracks from the first; in table order, playable only.
 */
export function nodeQueue({ node, lit = [], tracks = [], playable = () => true, order = (list) => list }) {
    if (node?.type === 'track') {
        const track = nodeTracks({ node, tracks })[0];
        if (!track || !playable(track)) return { start: null, queue: [] };
        // The same track, by id: lit tracks and the full list need not be the same objects.
        const own = (lit || []).find((t) => String(t.id) === String(track.id));
        const pool = own ? lit : [...(lit || []), track];
        return { start: own || track, queue: order(pool).filter(playable) };
    }
    const queue = order(nodeTracks({ node, lit, tracks })).filter(playable);
    return { start: queue[0] || null, queue };
}

/** A double-click: a node, ring or owned album dot plays; Discover's outside ones open as a click does; else zoom. */
export function dblIntent(hit, { viewer = false } = {}) {
    if (viewer || !hit) return 'zoom';
    if (hit.kind === 'outside' || (hit.kind === 'album' && hit.album?.outside)) return 'open';
    return ['node', 'ring', 'album'].includes(hit.kind) ? 'play' : 'zoom';
}

/** What a double-click acts on: its first click's target (a selection can move the map under the second), else the second's. */
export function dblTarget(first, second) {
    return first || second || null;
}

const ARROWS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };

/** The id an arrow key moves to: ahead of `from` within about 63° of the key's way, the nearest (off-axis counting double). */
export function arrowTarget(from, items, key) {
    const dir = ARROWS[key];
    if (!dir || !from) return null;
    let best = null, bestScore = Infinity;
    for (const it of items || []) {
        const dx = it.x - from.x, dy = it.y - from.y;
        const along = dx * dir[0] + dy * dir[1], perp = Math.abs(dx * dir[1] - dy * dir[0]);
        if (along <= 0 || perp > 2 * along) continue;
        const score = along + 2 * perp;
        if (score < bestScore) { bestScore = score; best = it.id; }
    }
    return best;
}

/** A row key on a node: on a track as on a row; elsewhere `f` stars the node itself, and `e`, `n` (one track's edits) do nothing. */
export function nodeKeyIntent(key, node) {
    if (node?.type === 'track') return 'tracks';
    if (key === 'f') return 'star';
    if (key === 'e' || key === 'n') return 'none';
    return 'tracks';
}

/** What the row keys act on with the graph showing: a hovered row beside it (Info, a gig, the queue) as on a table, else the graph's target. */
export function graphKeyTarget(rowId, graphTarget) {
    if (rowId) return { node: null, ids: [String(rowId)] };
    return graphTarget || null;
}
