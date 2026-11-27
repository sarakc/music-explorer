import { SHARDED_STORES, SHARD_COUNT, shardPath } from './viewer-shards.js';

const ok = (body) => ({ status: 200, body });
// The most neighbour rows `/api/similarity/neighbours` returns.
const NEIGHBOUR_CAP = 50;
/** Data the snapshot does not hold (the app shows its limit). */
export const limited = () => ({ status: 404, body: { limit: 'snapshot' } });
/** A path no viewer source answers. */
export const unavailable = () => ({ status: 503, body: { error: 'unavailable in viewer' } });
const DB_KEYS = Object.freeze({
    tracks: 'id', favorites: 'id', entity_links: 'entityId', entity_identity: 'entityId',
    entity_relations: 'ref', discogs_releases: 'ref', release_credits: 'discogs_id',
    credits_cache: 'id', artist_discogs_map: 'artistName', label_discogs_map: 'labelName',
    release_resolve_map: 'key',
});

function cleanBase(baseUrl) {
    return String(baseUrl || 'snapshot/').replace(/\/*$/, '/');
}

export function createSnapshotSource(baseUrl = 'snapshot/', fetchImpl = globalThis.fetch) {
    const base = cleanBase(baseUrl);
    const files = new Map();
    let manifest = null;

    const read = async (path, optional = false) => {
        if (!files.has(path)) files.set(path, Promise.resolve(fetchImpl(`${base}${path}`)).then(async (res) => {
            if (!res?.ok) {
                if (optional && res?.status === 404) return null;
                throw new Error(`Snapshot ${path}: ${res?.status || 'unavailable'}`);
            }
            return res.json();
        }));
        return files.get(path);
    };
    const ready = async () => {
        manifest ||= await read('manifest.json');
        if (manifest.shardCount !== SHARD_COUNT) throw new Error(`Unsupported snapshot shard count: ${manifest.shardCount}`);
        return manifest;
    };
    const held = async (kind, id) => (await read(shardPath(kind, id), true))?.[id] ?? null;
    // Focus neighbour rows the neighbour shard also holds are stored as
    // { id, score, linked }; the rest of each row comes from that shard.
    const withNeighbours = async (id, body) => {
        if (!body?.neighbours?.some((row) => !('reasons' in row))) return body;
        const rows = new Map(((await held('neighbours', id))?.neighbours || []).map((row) => [row.id, row]));
        return { ...body, neighbours: body.neighbours.map((row) => ('reasons' in row ? row : { ...rows.get(row.id), ...row })) };
    };
    const neighbourRow = async (from, to) => (await held('neighbours', from))?.neighbours?.find((row) => row.id === to) || null;

    const source = {
        get label() { return manifest?.date ? `Snapshot · ${manifest.date}` : 'Snapshot'; },
        ready,
        async get(path, search = new URLSearchParams()) {
            await ready();
            if (path === '/api/health') return unavailable();
            if (path === '/api/atlas') return ok(await read('atlas.json'));
            if (path === '/api/atlas/discover') return ok(await read('discover.json'));
            if (path === '/api/discover/new-releases') return ok(await read('new-releases.json'));
            if (path === '/api/links/summary') return ok(await read('links-summary.json'));
            if (path === '/api/facts') {
                // An artist's Commons photo; an older snapshot has no facts file.
                const held = await read('facts.json', true), id = search.get('id') || '';
                return held && Object.hasOwn(held, id) ? ok(held[id]) : limited();
            }
            if (path.startsWith('/api/links/')) {
                const id = decodeURIComponent(path.slice('/api/links/'.length));
                const body = (await read('links.json'))?.[id];
                return body == null ? limited() : ok(body);
            }
            if (path.startsWith('/api/db/')) {
                const tail = path.slice('/api/db/'.length).split('/');
                if (SHARDED_STORES[tail[0]]) {
                    if (tail.length === 1) return unavailable();
                    return ok({ row: await held(`db/${tail[0]}`, decodeURIComponent(tail.slice(1).join('/'))) });
                }
                const rows = await read(`db/${tail[0]}.json`, true);
                if (rows == null) return unavailable();
                // Same shape as the server's `GET /api/db/:store`.
                if (tail.length === 1) return ok({ rows });
                const id = decodeURIComponent(tail.slice(1).join('/'));
                const key = DB_KEYS[tail[0]] || 'id';
                return ok({ row: rows.find((row) => String(row[key]) === id) || null });
            }
            if (path === '/api/atlas/focus') {
                const id = search.get('id') || '';
                let body = await held('focus', id);
                if (body) body = await withNeighbours(id, body);
                else body = await held('outside', id);
                if (!body) return limited();
                // A release with nothing owned near it was a 404 on the server: the graph opens its panel.
                if (body.error && body.release && !body.focus) return { status: 404, body };
                if (search.get('mode') === 'collection') {
                    const { outside, discogs, sources, ...collection } = body;
                    return ok(collection);
                }
                return ok(body);
            }
            if (path.startsWith('/api/similarity/neighbours/')) {
                const id = decodeURIComponent(path.slice('/api/similarity/neighbours/'.length));
                const body = await held('neighbours', id);
                if (body == null) return limited();
                // The server's filters: `types` first, then `limit` (at most 50).
                const types = (search.get('types') || '').split(',').map((type) => type.trim()).filter(Boolean);
                const limit = Number.parseInt(search.get('limit'), 10);
                let rows = body.neighbours || [];
                if (types.length) rows = rows.filter((row) => types.includes(row.type));
                rows = rows.slice(0, limit > 0 ? Math.min(limit, NEIGHBOUR_CAP) : NEIGHBOUR_CAP);
                return ok({ ...body, neighbours: rows });
            }
            if (path === '/api/similarity/why') {
                const a = search.get('a') || '', b = search.get('b') || '';
                // The reasons on the pair's neighbour row, from either side.
                const row = (await neighbourRow(a, b)) || (await neighbourRow(b, a));
                return row ? ok({ reasons: row.reasons || [] }) : unavailable();
            }
            if (path.startsWith('/api/discogs/')) {
                const key = `${path}${search.toString() ? `?${search}` : ''}`;
                let body = await held('discogs', key);
                if (body == null && search.toString()) body = await held('discogs', path);
                return body == null ? unavailable() : ok(body);
            }
            return unavailable();
        },
    };
    return source;
}
