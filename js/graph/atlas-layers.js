// What the graph is about: the Favorites home's nodes, a focus and its neighbourhood, the
// heaviest of what ☆, the filter and search pick out; the playing artist's ring; and which
// collaboration names step back. Pure.
import { artistNodeIds } from './atlas-lit.js';
import { ATLAS } from './atlas-config.js';

const lightsAll = (lit, id) => !lit || lit.has(id);

/** Owned atlas ids kept around a focus: the focus, its host, its first `step.neighbours` neighbours, its linked ids and Discover's bright ids. */
export function focusedNodeIds(focus, bright = {}, step = ATLAS.hoodSteps[0], lit = null) {
    if (!focus) return null;
    const lighted = (ids) => [...(ids || [])].filter((id) => id === focus.id || id === focus.host || lightsAll(lit, id));
    return new Set([
        focus.id, focus.host, ...lighted(focus.hood.keys()).slice(0, step.neighbours),
        ...lighted(focus.linkedIds), ...lighted(bright.lit), ...lighted(bright.near),
    ].filter(Boolean));
}

/** Favorite anchors and their `per` strongest neighbours (lit ones only, with a lit set). */
export function homeNodeIds(home, lit = null, per = ATLAS.homeNeighbours) {
    if (!home) return null;
    const ids = new Set((home.anchors || []).map((a) => a.id));
    for (const group of home.groups || []) {
        for (const id of (group.neighbours || []).filter((n) => lightsAll(lit, n)).slice(0, per)) ids.add(id);
    }
    return ids;
}

/**
 * The lit nodes worth drawing with no focus: artists and labels with the most tracks,
 * up to `cap`, and the heaviest lit tags, up to an eighth of it.
 */
export function topLit(lit, atlas, cap = Infinity) {
    if (!lit || !atlas) return new Set();
    const nodes = [], tags = [];
    for (const id of lit) {
        const n = atlas.byId.get(id);
        if (n) (n.type === 'tag' ? tags : nodes).push(n);
    }
    const heaviest = (list, k) => (Number.isFinite(k) ? list.sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0) || a.id.localeCompare(b.id)).slice(0, k) : list);
    return new Set([...heaviest(nodes, cap), ...heaviest(tags, Number.isFinite(cap) ? Math.ceil(cap / 8) : cap)].map((n) => n.id));
}

/**
 * The bright layer: the owned ids that draw at v = 1. Everything else follows the depth curve.
 *   focus     the focus ({ id, host, hood, linkedIds }) or null
 *   home      the Favorites home ({ anchors, groups }) or null
 *   lit       the ☆, filter and search set, or null
 *   discover  Discover keeps its home anchors under a lit set; Collection's lit set replaces the home
 *   bright    Discover's bright ids ({ lit, near })
 *   step      the focus's Show more step (ATLAS.hoodSteps)
 */
export function brightIds({ focus = null, home = null, lit = null, atlas = null, discover = false, bright = {}, step = ATLAS.hoodSteps[0] } = {}) {
    if (focus) return focusedNodeIds(focus, bright, step, lit);
    if (lit && !discover) return topLit(lit, atlas, ATLAS.litBright);
    return homeNodeIds(home, lit) || new Set();
}

/** The playing track's artist on the atlas: the first credited artist that is a node, else null. */
export function playingArtistId(track, atlas) {
    if (!track || !atlas?.byId) return null;
    return artistNodeIds(track.artist).find((id) => atlas.byId.has(id)) || null;
}

/** The pulsing ring: only while a track plays whose artist is on the atlas. */
export function playingRing({ isPlaying = false, track = null, atlas = null } = {}) {
    if (!isPlaying) return null;
    const id = playingArtistId(track, atlas);
    return id ? { id } : null;
}

/**
 * A collaboration node ("Ben Hauke, Jadasea") whose pieces include another drawn
 * artist: its name steps back. `has(id)` says whether an artist id is drawn.
 */
export function isCollaboration(name, ownId, has) {
    return artistNodeIds(name).some((id) => id !== ownId && has(id));
}
