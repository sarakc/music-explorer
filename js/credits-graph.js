// Graph model for Discover, Track networks, and the Collection strip. Pure: no DOM/fetch.
//
// One membership resolver (createMembership) owns entity identity and the
// entity → tracks inverted indexes. Graphs are induced on a bounded node set
// that is retrieved seed-first from those indexes, so a dense label never
// materialises every artist pair before the caps apply. Every graph carries
// its `membership` so drawers and Collection actions join tracks the same way.
// Discogs relations (aliases, members, sublabels) are sourced edges; an endpoint
// the library does not own becomes an *outside* node that is only admitted on
// request and never anchors the overview.
import { creditSpans } from './artist-credits.js';

export const LIMITS = Object.freeze({ artist: 80, label: 60, tag: 40, credit: 80, edges: 600, evidence: 50 });
const NODE_TYPES = ['artist', 'label', 'tag', 'credit'];

const MODES = [
    { id: 'released-on', label: 'released on' },
    { id: 'shares-label', label: 'share a label' },
    { id: 'shares-tags', label: 'share tags' },
    { id: 'worked-with', label: 'worked with' },
    { id: 'related', label: 'related' },
    { id: 'shares-style', label: 'share a style' },
];
export const RELATION_KINDS = ['alias-of', 'member-of', 'sublabel-of'];
const DIRECTED_KINDS = new Set(['member-of', 'sublabel-of']);
const LEGACY_MODE = { credits: 'released-on', 'shared-label': 'shares-label', 'shared-tags': 'shares-tags' };

export function normalizeMode(edgeType) {
    return MODES.some((m) => m.id === edgeType) ? edgeType : (LEGACY_MODE[edgeType] || 'released-on');
}

// Identity preserves Unicode. Normalisation (NFKC, lowercase, trimmed, collapsed
// whitespace) is only a lookup aid; if it yields nothing the raw trimmed name
// is the key, so distinct non-empty names never merge into one node.
export function entityKey(value) {
    const raw = String(value ?? '').trim();
    return raw && (raw.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim() || raw);
}
export function entityId(type, name) {
    const key = entityKey(name);
    return key ? `${type}:~${key}` : null;
}
/** The artist node ids a credit can belong to: each run of `creditSpans`, whole credit first. */
export function artistNodeIds(artist) {
    return [...new Set(creditSpans(artist).map((s) => entityId('artist', s)).filter(Boolean))];
}
/** The first of a credit's artist node ids that `isArtist` accepts, or null. */
export function leadArtistId(artist, isArtist = () => false) {
    return artistNodeIds(artist).find((id) => isArtist(id)) ?? null;
}
/**
 * The artist an album id hangs off. `album:~<artist>|<title>` is ambiguous when
 * either part has a `|`, so the shortest prefix that `isArtist` knows wins; then
 * the first credited artist of the shortest prefix that has one ("A & B" hangs
 * off A); with none, the text before the first `|`.
 */
export function albumArtistId(albumId, isArtist = () => false) {
    const body = String(albumId ?? '').startsWith('album:~') ? String(albumId).slice(7) : null;
    if (!body) return null;
    const prefixes = [];
    for (let i = body.indexOf('|'); i >= 0; i = body.indexOf('|', i + 1)) prefixes.push(body.slice(0, i));
    for (const p of prefixes) if (isArtist(`artist:~${p}`)) return `artist:~${p}`;
    for (const p of prefixes) { const lead = leadArtistId(p, isArtist); if (lead) return lead; }
    return prefixes.length ? `artist:~${prefixes[0]}` : null;
}
function edgeId(a, b) { return a < b ? `${a}__${b}` : `${b}__${a}`; }
const trackId = (t) => (t && t.id != null ? String(t.id) : null);
const byRank = (a, b) => b.weight - a.weight || a.id.localeCompare(b.id);

function rollupTime(tracks) {
    const years = [];
    let added = null;
    for (const t of tracks) {
        const year = Number(t?.year);
        if (Number.isFinite(year) && year > 0) years.push(year);
        const date = t?.date_added ? String(t.date_added).slice(0, 10) : null;
        if (date && (!added || date > added)) added = date;
    }
    years.sort((a, b) => a - b);
    const middle = Math.floor(years.length / 2);
    const year = !years.length ? null : years.length % 2
        ? years[middle]
        : (years[middle - 1] + years[middle]) / 2;
    return { year, added };
}

// Edges carry the full distinct support count plus a bounded preview sample of
// track ids; membership.edgeTrackIds(edge) enumerates the complete set.
function support(tracks) {
    const ids = new Set();
    for (const t of tracks) { const id = trackId(t); if (id != null) ids.add(id); }
    return { supportCount: ids.size, evidence: [...ids].slice(0, LIMITS.evidence) };
}

const creditName = (entry) => {
    const value = entry && (entry.name || entry);
    return value ? String(value).trim() : '';
};
const CREDIT_BUCKETS = [['producers', 'producer'], ['remixers', 'remixer'], ['engineers', 'engineer'], ['mixers', 'mixer']];
// Entity types reachable across a direct link, per mode. shares-label is derived
// (artist → label → artist). `credits` is the legacy overlay that draws
// contributors as artist nodes on top of released-on.
const PARTNER = {
    'released-on': { artist: ['label'], label: ['artist'] },
    'shares-tags': { artist: ['tag'], tag: ['artist'] },
    'worked-with': { artist: ['credit'], credit: ['artist'] },
    credits: { artist: ['label', 'artist'], label: ['artist'] },
};
const MODE_FOR_KIND = { 'released-on': 'released-on', 'shares-label': 'shares-label', 'shares-tags': 'shares-tags', 'worked-with': 'worked-with',
    credit: 'credits', 'shares-style': 'shares-style', 'alias-of': 'related', 'member-of': 'related', 'sublabel-of': 'related' };
const upsert = (map, key, make) => map.get(key) ?? map.set(key, make()).get(key);
const dedupeTracks = (list) => [...new Map(list.map((t) => [trackId(t) ?? t, t])).values()];

// `relations` are Discogs relation records: { kind, from, to, provenance } with
// endpoints { type, name, discogsId, local: entityId|null }. `local` names a
// library entity; a missing one becomes an outside node `${type}:@discogs:${id}`.
export function createMembership(tracks = [], credits = null, relations = []) {
    const entities = new Map(); // id → { id, type, name, names, tracks, weight, year, added, role?, subType?, outside?, discogsId? }
    const links = new Map();    // id → Map<otherId, { tracks, releases? }>, one shared record per pair
    const styles = new Map();   // artistId → Map<styleKey, tracks on owned releases carrying that style>
    const styleDf = new Map();  // styleKey → Set<artistId>
    const relAdj = new Map();   // id → neighbour[] for `related`, both endpoints of every relation edge
    const entity = (type, raw) => {
        const id = entityId(type, raw);
        if (!id) return null;
        if (!entities.has(id)) entities.set(id, { id, type, name: String(raw).trim(), names: new Set(), tracks: [] });
        const e = entities.get(id);
        e.names.add(String(raw));
        return e;
    };
    const link = (a, b) => {
        if (!links.has(a)) links.set(a, new Map());
        if (!links.has(b)) links.set(b, new Map());
        if (!links.get(a).has(b)) { const l = { tracks: [] }; links.get(a).set(b, l); links.get(b).set(a, l); }
        return links.get(a).get(b);
    };

    const releases = new Map();
    for (const t of tracks) {
        const artist = entity('artist', t?.artist), label = entity('label', t?.label);
        artist?.tracks.push(t); label?.tracks.push(t);
        if (artist && label) link(artist.id, label.id).tracks.push(t);
        const seen = new Set();
        for (const raw of Array.isArray(t?.tags) ? t.tags : []) {
            const tag = entity('tag', raw);
            if (!tag || seen.has(tag.id)) continue;
            seen.add(tag.id); tag.tracks.push(t);
            if (artist) link(artist.id, tag.id).tracks.push(t);
        }
        if (t?.discogs_id != null && t.discogs_id !== '') {
            const rid = String(t.discogs_id);
            if (!releases.has(rid)) releases.set(rid, []);
            releases.get(rid).push(t);
        }
    }

    // Credits: main artists ↔ contributors per owned release. Artists known only
    // from credits roll up the owned tracks of those releases; artists already
    // present keep their own tracks.
    const fromTracks = new Set(entities.keys());
    const creditArtist = (name, owned, contributor) => {
        const fresh = !entities.has(entityId('artist', name));
        const e = entity('artist', name);
        if (fresh && contributor) e.subType = 'contributor';
        if (!contributor) delete e.subType;
        if (!fromTracks.has(e.id)) e.tracks.push(...owned);
        return e;
    };
    if (credits && typeof credits.forEach === 'function') credits.forEach((rec, releaseId) => {
        const owned = releases.get(String(releaseId));
        if (!owned || !rec) return;
        const owners = owned.map((t) => [entityId('artist', t?.artist), t]).filter(([artistId]) => artistId);
        for (const raw of Array.isArray(rec.styles) ? rec.styles : []) {
            const style = entityKey(raw);
            for (const [artistId, t] of style ? owners : []) {
                upsert(upsert(styles, artistId, () => new Map()), style, () => []).push(t);
                upsert(styleDf, style, () => new Set()).add(artistId);
            }
        }
        const mains = [...new Map((rec.main_artists || []).map(creditName).filter(Boolean).map((n) => [entityKey(n), n])).values()];
        const contributors = new Map();
        for (const [bucket, role] of CREDIT_BUCKETS) for (const item of rec[bucket] || []) {
            const name = creditName(item);
            if (name && !contributors.has(entityKey(name))) contributors.set(entityKey(name), { name, role });
        }
        mains.forEach((name) => creditArtist(name, owned, false));
        for (const { name, role } of contributors.values()) {
            const credit = entity('credit', name);
            credit.role ||= role; (credit.releases ||= new Set()).add(String(releaseId)); credit.tracks.push(...owned);
            const asArtist = creditArtist(name, owned, true);
            for (const main of mains) {
                if (entityKey(main) === entityKey(name)) continue;
                const mainId = entityId('artist', main);
                for (const l of [link(mainId, credit.id), link(mainId, asArtist.id)]) {
                    (l.releases ||= new Set()).add(String(releaseId)); l.tracks.push(...owned);
                }
            }
        }
    });
    for (const e of entities.values()) {
        if (!fromTracks.has(e.id)) e.tracks = dedupeTracks(e.tracks);
        Object.assign(e, { weight: e.type === 'credit' ? e.releases.size : e.tracks.length, ...rollupTime(e.tracks) });
    }

    // Relations: one adjacency entry per endpoint. A `local` endpoint that this
    // membership does not contain is dropped rather than shown as outside, so
    // "not in library" stays true. Duplicate records (kind + endpoints) collapse.
    // An outside endpoint only joins `entities` once its relation is kept, so a
    // dropped record never leaves an orphan outside node behind.
    const endpoint = (p) => {
        if (!p) return null;
        if (p.local) return entities.get(p.local) || null;
        if (p.discogsId == null || !['artist', 'label'].includes(p.type)) return null;
        const id = `${p.type}:@discogs:${p.discogsId}`;
        return entities.get(id) || { id, type: p.type, name: String(p.name ?? '').trim() || String(p.discogsId), names: new Set([String(p.name ?? '')]),
            tracks: [], weight: 0, year: null, added: null, outside: true, discogsId: p.discogsId };
    };
    const relSeen = new Set();
    for (const r of Array.isArray(relations) ? relations : []) {
        if (!RELATION_KINDS.includes(r?.kind)) continue;
        const from = endpoint(r.from), to = endpoint(r.to);
        if (!from || !to || from.id === to.id) continue;
        const directed = DIRECTED_KINDS.has(r.kind);
        const key = `${r.kind}:${directed ? `${from.id}__${to.id}` : edgeId(from.id, to.id)}`;
        if (relSeen.has(key)) continue;
        relSeen.add(key);
        for (const e of [from, to]) upsert(entities, e.id, () => e);
        for (const [a, b] of [[from, to], [to, from]]) {
            upsert(relAdj, a.id, () => []).push({ id: b.id, type: b.type, kind: r.kind, directed, source: from.id, target: to.id,
                provenance: r.provenance || null, weight: 1, tracks: [] });
        }
    }

    function direct(e, mode) {
        const want = PARTNER[mode]?.[e.type];
        if (!want) return [];
        const out = [];
        for (const [otherId, l] of links.get(e.id) || []) {
            const o = entities.get(otherId);
            if (!want.includes(o.type)) continue;
            const kind = mode === 'credits' ? (o.type === 'artist' ? 'credit' : 'released-on') : mode;
            out.push({ id: o.id, type: o.type, kind, weight: l.releases ? l.releases.size : l.tracks.length, tracks: l.tracks });
        }
        return out;
    }
    function sharesLabel(e) {
        if (e.type !== 'artist') return [];
        const acc = new Map();
        for (const [labelId, mine] of links.get(e.id) || []) {
            if (entities.get(labelId).type !== 'label') continue;
            for (const [otherId, theirs] of links.get(labelId)) {
                if (otherId === e.id) continue;
                if (!acc.has(otherId)) acc.set(otherId, { id: otherId, type: 'artist', kind: 'shares-label', weight: 0, tracks: [] });
                const n = acc.get(otherId);
                n.weight++; n.tracks.push(...mine.tracks, ...theirs.tracks);
            }
        }
        return [...acc.values()];
    }
    // Weighted Jaccard over styles: idf(style) = ln((N + 1) / (df + 1)) + 1 with
    // N = artists carrying any style. Both are fixed once the credits are indexed,
    // so they are computed once; partners come from the style → artists index so
    // only artists that actually share a style are visited.
    const styleIdf = new Map([...styleDf].map(([style, artists]) => [style, Math.log((styles.size + 1) / (artists.size + 1)) + 1]));
    const idfSum = new Map([...styles].map(([artistId, mine]) => [artistId, [...mine.keys()].reduce((sum, style) => sum + styleIdf.get(style), 0)]));
    function sharesStyle(e) {
        const mine = styles.get(e.id);
        if (e.type !== 'artist' || !mine?.size) return [];
        const sharedWith = new Map(); // otherId → shared styles
        for (const style of mine.keys()) for (const otherId of styleDf.get(style)) {
            if (otherId !== e.id) upsert(sharedWith, otherId, () => []).push(style);
        }
        return [...sharedWith].map(([otherId, shared]) => {
            const numerator = shared.reduce((sum, style) => sum + styleIdf.get(style), 0);
            const denominator = idfSum.get(e.id) + idfSum.get(otherId) - numerator;
            let tracks = null; // built on demand: only kept edges need their support
            return { id: otherId, type: 'artist', kind: 'shares-style', shared: shared.length, weight: numerator / denominator,
                get tracks() { return tracks ??= dedupeTracks(shared.flatMap((style) => [...mine.get(style), ...styles.get(otherId).get(style)])); } };
        });
    }
    // Seed-first adjacency: neighbours of one entity, strongest first, with the
    // complete supporting tracks. Cost is bounded by that entity's own links.
    function neighbours(mode, id, { outside = false } = {}) {
        const e = entities.get(id);
        if (!e) return [];
        const found = mode === 'shares-label' ? sharesLabel(e)
            : mode === 'shares-style' ? sharesStyle(e)
                : mode === 'related' ? (relAdj.get(id) || []).filter((n) => outside || !entities.get(n.id)?.outside)
                    : direct(e, mode);
        return [...found].sort(byRank);
    }
    function connected(mode, id) {
        const e = entities.get(id);
        if (!e || e.outside) return false;
        if (mode === 'related') return (relAdj.get(id) || []).some((n) => !entities.get(n.id)?.outside);
        if (mode === 'shares-style') return [...(styles.get(id)?.keys() || [])].some((style) => styleDf.get(style).size > 1);
        if (mode !== 'shares-label') return direct(e, mode).length > 0;
        return e.type === 'artist' && [...(links.get(id) || [])].some(([o]) => entities.get(o).type === 'label' && links.get(o).size > 1);
    }
    const edgeTracks = (edge) => neighbours(MODE_FOR_KIND[edge?.kind], edge?.source, { outside: true }).find((n) => n.id === edge.target)?.tracks || [];
    const ids = (list) => list.map(trackId).filter((id) => id != null);

    return {
        id: entityId,
        has: (id) => entities.has(id),
        get: (id) => entities.get(id),
        entities: () => [...entities.values()].filter((e) => !e.outside),
        outsideEntities: () => [...entities.values()].filter((e) => e.outside),
        tracks: (id) => entities.get(id)?.tracks || [],
        trackIds: (id) => ids(entities.get(id)?.tracks || []),
        names: (id) => [...(entities.get(id)?.names || [])],
        neighbours,
        connected,
        edgeTracks,
        edgeTrackIds: (edge) => ids(edgeTracks(edge)),
    };
}

export function computeDegree(nodes, edges) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) n.degree = 0;
    for (const e of edges) {
        if (byId.has(e.source)) byId.get(e.source).degree++;
        if (byId.has(e.target)) byId.get(e.target).degree++;
    }
    return nodes;
}

function statsFor(nodes, edges) {
    const count = (type) => nodes.filter((n) => n.type === type).length;
    const creditCount = count('credit');
    return { nodeCount: nodes.length, edgeCount: edges.length, artistCount: count('artist'),
        labelCount: count('label'), tagCount: count('tag'), creditCount,
        contributorCount: creditCount + nodes.filter((n) => n.subType === 'contributor').length,
        outsideCount: nodes.filter((n) => n.outside).length };
}
// `meta` is the graph (or build options) whose resolver, mode and bounds carry over.
function finish(nodes, edges, meta = {}) {
    computeDegree(nodes, edges);
    const rings = new Map(nodes.map((n) => [n.id, meta.rings?.get(n.id) || (n.type === 'artist' ? 'inner' : 'outer')]));
    return { nodes, edges, rings, center: meta.center ?? null, stats: statsFor(nodes, edges), mode: normalizeMode(meta.mode),
        membership: meta.membership || null, threshold: meta.threshold ?? 1, more: meta.more || 0 };
}
function nodeOf(e) {
    return { id: e.id, type: e.type, name: e.name, weight: e.weight, degree: 0, year: e.year, added: e.added,
        ...(e.subType ? { subType: e.subType } : {}), ...(e.role ? { role: e.role } : {}),
        ...(e.outside ? { outside: true, discogsId: e.discogsId } : {}) };
}
function subgraph(graph, keepIds) {
    const nodes = (graph.nodes || []).filter((n) => keepIds.has(n.id)).map((n) => ({ ...n }));
    const edges = (graph.edges || []).filter((e) => keepIds.has(e.source) && keepIds.has(e.target)).map((e) => ({ ...e, evidence: [...(e.evidence || [])] }));
    return finish(nodes, edges, graph);
}
const connectedOnly = (graph) => subgraph(graph, new Set(graph.nodes.filter((n) => n.degree > 0).map((n) => n.id)));

// Materialise the graph induced on `ids`. Metadata modes walk artists; related
// also walks labels. Edge ids keep several relation kinds between one pair.
function induce(membership, mode, ids, threshold = 1) {
    const edges = new Map();
    for (const id of ids) {
        if (mode !== 'related' && membership.get(id)?.type !== 'artist') continue;
        for (const n of membership.neighbours(mode, id, { outside: true })) {
            if (!ids.has(n.id) || (n.shared ?? n.weight) < threshold) continue;
            const source = n.source || id, target = n.target || n.id;
            const pair = n.directed ? `${source}__${target}` : edgeId(source, target);
            const eid = RELATION_KINDS.includes(n.kind) ? `${n.kind}:${pair}` : edgeId(id, n.id);
            if (!edges.has(eid)) edges.set(eid, { id: eid, source, target, kind: n.kind, weight: n.weight,
                ...(n.shared != null ? { shared: n.shared } : {}), ...support(n.tracks),
                directed: n.directed === true, provenance: n.provenance || null, date: null });
        }
    }
    const nodes = [...ids].map((id) => membership.get(id)).filter(Boolean).map(nodeOf);
    return finish(nodes, [...edges.values()], { mode, membership, threshold });
}

// Overview: pick the strongest connected entities per type first, then induce.
function overview(membership, mode, threshold) {
    const picked = new Set();
    for (const type of NODE_TYPES) {
        membership.entities().filter((e) => e.type === type && membership.connected(mode, e.id))
            .sort(byRank).slice(0, LIMITS[type]).forEach((e) => picked.add(e.id));
    }
    return capGraph(induce(membership, mode, picked, threshold));
}

export function capGraph(graph) {
    if (!graph) return finish([], []);
    const allowed = new Set();
    for (const type of NODE_TYPES) graph.nodes.filter((n) => n.type === type && !n.outside).sort(byRank).slice(0, LIMITS[type]).forEach((n) => allowed.add(n.id));
    const edges = graph.edges.filter((e) => allowed.has(e.source) && allowed.has(e.target)).sort(byRank).slice(0, LIMITS.edges);
    return subgraph({ ...graph, edges }, new Set(edges.flatMap((e) => [e.source, e.target])));
}

export function buildLocalBipartite({ tracks = [], credits = null, threshold = 1 } = {}) {
    return buildCreditsGraph({ tracks, credits, threshold, edgeType: 'credits', cap: false });
}
// `cap: false` induces the graph on every entity; keep it for small slices and tests.
export function buildCreditsGraph({ tracks = [], edgeType = 'credits', threshold = 1, credits = null, relations = [], cap = true, membership = null } = {}) {
    const m = membership || createMembership(tracks, credits, relations);
    const mode = edgeType === 'credits' && credits ? 'credits' : normalizeMode(edgeType);
    if (cap) return overview(m, mode, threshold);
    return connectedOnly(induce(m, mode, new Set(m.entities().map((e) => e.id)), threshold));
}

export function filterByDegree(graph, minDegree, { keep = [] } = {}) {
    if (!graph) return finish([], []);
    if (!(minDegree > 1)) return subgraph(graph, new Set(graph.nodes.map((n) => n.id)));
    const nodes = graph.nodes.map((n) => ({ ...n })); computeDegree(nodes, graph.edges);
    const forced = new Set(keep), ids = new Set(nodes.filter((n) => forced.has(n.id) || n.outside || n.degree >= minDegree).map((n) => n.id));
    return subgraph(graph, ids);
}
