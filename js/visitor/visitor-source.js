// The viewer's second source: the request gate's `/api` answers from a visitor's
// map, in this browser, with the same bodies the server builds (bodies.js over the
// in-memory store). Satellites and why come from the serving worker (`ask`).
// Same contract as createSnapshotSource: { label, ready(), get(path, search) }
// resolving to { status, body }. It makes no request.
import { atlasBody, focusCollectionBody, neighboursBody } from '../similarity/bodies.js';
import { SHARED_DEFAULTS, mergeConfigOver } from '../similarity/config.js';
import { storeOfMap } from './map-format.js';
import { limited, unavailable } from '../viewer-snapshot.js';

const ok = (body) => ({ status: 200, body });
const NEIGHBOUR_CAP = 50;
// The stores a visitor's map holds rows of; every other served store is empty for them.
const ROW_KEY = { tracks: 'id' };

const clampLimit = (v) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n > 0 ? Math.min(n, NEIGHBOUR_CAP) : NEIGHBOUR_CAP; };

/** createVisitorSource({ map: VisitorMap, ask: (what, args) => Promise }) => { label, ready, get } */
export function createVisitorSource({ map, ask }) {
  const { minScore } = mergeConfigOver(SHARED_DEFAULTS, {});
  const store = storeOfMap(map, (id) => ask('satellites', { id }));
  const tracks = map.stores?.tracks || [];
  let atlas = null;
  const rowsOf = (name) => (name === 'tracks' ? tracks : []);

  return {
    get label() { return map.file?.name || ''; },
    ready: async () => map,
    async get(path, search = new URLSearchParams()) {
      if (path === '/api/atlas') return ok(atlas ??= atlasBody(store, { minScore, steps: map.steps }));
      if (path === '/api/atlas/focus') {
        const body = await focusCollectionBody(store, search.get('id') || '', { minScore });
        return body ? ok(body) : limited();
      }
      if (path.startsWith('/api/similarity/neighbours/')) {
        const id = decodeURIComponent(path.slice('/api/similarity/neighbours/'.length));
        const types = (search.get('types') || '').split(',').map((t) => t.trim()).filter(Boolean);
        const n = Number(search.get('minScore'));
        return ok(neighboursBody(store, id, { types: types.length ? types : null, limit: clampLimit(search.get('limit')), minScore: Number.isFinite(n) && search.has('minScore') ? n : 0 }));
      }
      if (path === '/api/similarity/why') {
        const a = search.get('a') || '', b = search.get('b') || '';
        if (!a || !b) return { status: 400, body: { error: 'a and b are required' } };
        const body = await ask('why', { a, b });
        return body ? ok(body) : { status: 404, body: { error: 'unknown entity' } };
      }
      if (path.startsWith('/api/db/')) {
        const [name, ...rest] = path.slice('/api/db/'.length).split('/');
        if (!rest.length) return ok({ rows: rowsOf(name) });
        const id = decodeURIComponent(rest.join('/')), key = ROW_KEY[name] || 'id';
        return ok({ row: rowsOf(name).find((r) => String(r[key]) === id) || null });
      }
      return unavailable();
    },
  };
}
