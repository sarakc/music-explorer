// Atlas data: GET /api/atlas (cached by layout run for the session), the focus
// payload per id, the Favorites home, the building state, and placing a focus
// that is not on the atlas yet. No DOM.
import { extentOf } from './atlas-geometry.js';
import { ATLAS } from './atlas-config.js';
import { rimOf } from './atlas-look.js';
import { albumArtistId } from '../credits-graph.js';

const defaultFetch = async (url, init) => {
    const res = await fetch(url, init);
    if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.status = res.status; err.body = await res.json().catch(() => null); throw err; }
    return res.json();
};

/**
 * Columns → node objects (with their main subgenre and its share),
 * links as index triples (up to 8 per node) and `adjacency` over them, an id lookup, and
 * the subgenres' hues. `linksAll` is every link known by node, crossLinks too (up to 24 per
 * node): the lines among a selection's shown nodes and the hovered node's. An atlas from
 * before colour has no subgenre columns: every node is grey. `scale` is the run's score
 * scale (`shownScore`), 1 on an atlas from before it.
 */
export function decodeAtlas(payload) {
    const c = payload?.nodes || {};
    const nodes = (c.id || []).map((id, i) => ({
        i, id, type: c.type[i], name: c.name[i], x: c.x[i], y: c.y[i], weight: c.weight[i],
        subgenre: c.subgenre?.[i] ?? null, share: c.share?.[i] ?? null,
    }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = (payload?.links || []).filter(([a, b]) => nodes[a] && nodes[b]);
    const adjacency = new Map();
    const both = (map, list) => { for (const [a, b, s] of list) for (const [x, y] of [[a, b], [b, a]]) (map.get(x) || map.set(x, []).get(x)).push([y, s]); };
    both(adjacency, links);
    const linksAll = new Map([...adjacency].map(([i, list]) => [i, [...list]]));
    both(linksAll, (payload?.crossLinks || []).filter(([a, b]) => nodes[a] && nodes[b]));
    const subgenres = new Map((payload?.subgenres || []).filter((s) => s?.name).map((s) => [s.name, { hue: s.hue, r: s.r, tracks: s.tracks }]));
    const scale = Number(payload?.scale) > 0 ? Math.min(1, Number(payload.scale)) : 1;
    const extent = extentOf(nodes);
    return { layoutRun: payload?.layoutRun ?? null, scale, nodes, links, byId, adjacency, linksAll, subgenres, extent,
        steps: decodeSteps(payload?.steps, nodes.length), rim: rimOf(nodes, extent) };
}

/**
 * The + and − step layouts: `rank[i]` a node's place in step order (N for none), and
 * `layouts[k]` every node's spot at step k as [x, y] pairs by node index, NaN outside the step.
 * Null when the payload has none.
 */
function decodeSteps(steps, n) {
    if (!steps || !Array.isArray(steps.order) || !Array.isArray(steps.counts) || !Array.isArray(steps.xy)) return null;
    const rank = new Int32Array(n).fill(n);
    steps.order.forEach((i, k) => { if (i >= 0 && i < n) rank[i] = k; });
    const layouts = steps.counts.map((count, k) => {
        const out = new Float32Array(2 * n).fill(NaN), flat = steps.xy[k] || [];
        for (let j = 0; j < count; j++) {
            const i = steps.order[j];
            if (!(i >= 0 && i < n)) continue;
            out[2 * i] = flat[2 * j]; out[2 * i + 1] = flat[2 * j + 1];
        }
        return out;
    });
    return { refK: Number(steps.refK) || 1, counts: [...steps.counts], rank, layouts };
}

/**
 * Where a focus sits: its atlas position; for a track or album, its artist's;
 * else (added since the last full run) the mean of its neighbours' positions,
 * marked `unplaced`. Null when none of them is on the atlas either.
 */
export function focusPosition(atlas, focus, { neighbours = [], parent = null } = {}) {
    const own = atlas.byId.get(focus?.id);
    if (own) return { x: own.x, y: own.y, unplaced: false, node: own };
    const host = parent && atlas.byId.get(parent);
    if (host) return { x: host.x, y: host.y, unplaced: false, host };
    const placed = neighbours.map((n) => atlas.byId.get(n.id)).filter(Boolean);
    if (!placed.length) return null;
    return { x: placed.reduce((s, n) => s + n.x, 0) / placed.length, y: placed.reduce((s, n) => s + n.y, 0) / placed.length, unplaced: focus?.type !== 'track' && focus?.type !== 'album' };
}

/** An album or track focus hangs off its artist (the server's `parent`, else read from the album id). */
export function hostFor(focus, payload, atlas = null) {
    if (payload?.parent) return payload.parent;
    if (focus?.type === 'album') return albumArtistId(focus.id, (id) => Boolean(atlas?.byId?.has(id)));
    return null;
}

export const buildingText = (pct) => (Number.isFinite(pct) ? `Building the map — ${pct}%` : 'Building the map');
const pctOf = (progress) => (progress?.total ? Math.min(99, Math.round((progress.done / progress.total) * 100)) : null);

let sessionAtlas = null; // { layoutRun, atlas } shared by every visit this session

export class AtlasData {
    constructor({ fetchJson = defaultFetch, wait = (ms) => new Promise((r) => setTimeout(r, ms)), pollMs = ATLAS.pollMs } = {}) {
        Object.assign(this, { fetchJson, wait, pollMs, generation: 0, focusCache: new Map() });
    }

    get atlas() { return sessionAtlas?.atlas || null; }

    /**
     * The atlas, polling every 2 s while the engine builds (`onBuilding(pct)`).
     * Resolves { atlas } or { failed, error }; null when cancelled.
     */
    async load({ onBuilding = () => {}, isAlive = () => true } = {}) {
        const generation = ++this.generation;
        const alive = () => generation === this.generation && isAlive();
        for (;;) {
            const payload = await this.fetchJson('/api/atlas');
            if (!alive()) return null;
            if (payload.building) {
                onBuilding(pctOf(payload.progress));
                await this.wait(this.pollMs);
                if (!alive()) return null;
                continue;
            }
            if (payload.failed || payload.layoutRun == null) return { failed: true, error: payload.error || '' };
            if (sessionAtlas?.layoutRun !== payload.layoutRun) {
                sessionAtlas = { layoutRun: payload.layoutRun, atlas: decodeAtlas(payload) };
                this.focusCache.clear();
            }
            return { atlas: sessionAtlas.atlas };
        }
    }

    /**
     * The focus payload ({ focus, neighbours, satellites, linkedIds, parent }), cached per id.
     * In Discover mode it also has `outside`, `discogs` and `sources`, and is never cached:
     * it changes as Discogs data arrives.
     */
    async focus(id, { isAlive = () => true, mode = 'collection', ref = null, name = null } = {}) {
        const discover = mode === 'discover';
        if (!discover && this.focusCache.has(id)) return this.focusCache.get(id);
        // An artist or label you don't own: its Discogs ref, and its name for the first visit.
        const extra = discover ? `${ref ? `&ref=${encodeURIComponent(ref)}` : ''}${name ? `&name=${encodeURIComponent(name)}` : ''}` : '';
        for (;;) {
            const payload = await this.fetchJson(`/api/atlas/focus?id=${encodeURIComponent(id)}&mode=${discover ? 'discover' : 'collection'}${extra}`);
            if (!isAlive()) return null;
            if (payload.building) { await this.wait(this.pollMs); if (!isAlive()) return null; continue; }
            if (discover) return payload;
            this.focusCache.set(id, payload);
            if (this.focusCache.size > 40) this.focusCache.delete(this.focusCache.keys().next().value);
            return payload;
        }
    }

    /** Discover with no focus: favorite anchors/groups plus outside results. Never cached. */
    async discover({ per = ATLAS.discoverPerAnchor, isAlive = () => true } = {}) {
        for (;;) {
            const payload = await this.fetchJson(`/api/atlas/discover?per=${encodeURIComponent(per)}`);
            if (!isAlive()) return null;
            if (payload.building) { await this.wait(this.pollMs); if (!isAlive()) return null; continue; }
            return payload;
        }
    }

    /** Promote and refresh the provider work reachable from one owned focus. */
    dig(id) {
        return this.fetchJson('/api/atlas/dig', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
        });
    }

    cancel() { this.generation++; }
}

export const _resetSessionAtlas = () => { sessionAtlas = null; }; // tests
