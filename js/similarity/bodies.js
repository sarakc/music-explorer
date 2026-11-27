// The collection bodies of the atlas and similarity routes, over a store
// interface, so the server (SQLite, server/lib/similarity/atlas-store.js) and the
// browser (memory-store.js) answer alike:
//   AtlasStore = { names: Map id -> { name, type }, atlasMeta(), atlasPositions(),
//     atlasSubgenres(), topNeighbours(ids, { limit, types, minScore }),
//     readNeighbours(id, { limit, types, minScore }), satellites(id) => Promise }
import { ATLAS_DEFAULTS } from './atlas-config.js';
import { stepsPayload } from './atlas-steps.js';

export const FOCUS_NEIGHBOURS = 24;
const round = (v, places = 3) => Math.round(v * 10 ** places) / 10 ** places;

/**
 * GET /api/atlas: every placed node that still exists, in columns, each node's top
 * `links` (the map's links) and its next ones up to `crossLinks` (the lines among a
 * selection's shown nodes), every subgenre's hue, and the step layouts (`steps`, or
 * null). Links at or above `minScore`. Null when nothing was laid out.
 */
export function atlasBody(store, { minScore, steps = null }) {
  const meta = store.atlasMeta();
  if (!meta) return null;
  const positions = store.atlasPositions().filter((p) => store.names.has(p.id));
  const nodes = { id: [], type: [], name: [], x: [], y: [], weight: [], subgenre: [], share: [] };
  const at = new Map();
  positions.forEach((p, i) => {
    const head = store.names.get(p.id);
    at.set(p.id, i);
    nodes.id.push(p.id); nodes.type.push(head.type); nodes.name.push(head.name);
    nodes.x.push(round(p.x, 1)); nodes.y.push(round(p.y, 1)); nodes.weight.push(p.weight);
    nodes.subgenre.push(p.subgenre ?? null); nodes.share.push(p.share == null ? null : round(p.share, 2));
  });
  const subgenres = store.atlasSubgenres().map((g) => ({ name: g.name, hue: round(g.hue, 2), r: round(g.r), tracks: g.tracks }));
  // Rows come strongest first per node.
  const links = [], crossLinks = [], seen = new Set();
  const rows = store.topNeighbours(nodes.id, { limit: ATLAS_DEFAULTS.crossLinks, types: ATLAS_DEFAULTS.types, minScore });
  for (const pass of [links, crossLinks]) {
    let from = null, rank = 0;
    for (const l of rows) {
      if (l.a !== from) { from = l.a; rank = 0; }
      if ((rank++ < ATLAS_DEFAULTS.links) !== (pass === links)) continue;
      const a = at.get(l.a), b = at.get(l.b);
      if (a === undefined || b === undefined) continue;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pass.push([a, b, round(l.score)]);
    }
  }
  return { layoutRun: meta.layoutRun, scale: round(meta.scale ?? 1, 3), nodes, links, crossLinks, subgenres, steps: steps ? stepsPayload(steps, at) : null };
}

/**
 * GET /api/atlas/focus in Collection mode: the focus, its neighbours on the atlas
 * at or above `minScore`, and what springs out around it. Null for an unknown id.
 */
export async function focusCollectionBody(store, id, { minScore }) {
  const head = store.names.get(id);
  if (!head) return null;
  const neighbours = store.readNeighbours(id, { limit: FOCUS_NEIGHBOURS, types: ATLAS_DEFAULTS.types, minScore })
    .map((r) => ({ id: r.id, type: r.type, name: store.names.get(r.id)?.name ?? r.id, score: round(r.score), linked: r.linked ? 1 : 0, reasons: r.reasons }));
  const around = await store.satellites(id) || { satellites: [], linkedIds: [], parent: null };
  return { focus: { id, type: head.type, name: head.name }, neighbours, ...around };
}

/** GET /api/similarity/neighbours/:id: the entity (or null) and its stored neighbours. */
export function neighboursBody(store, id, { types = null, limit = 50, minScore = 0 } = {}) {
  const rows = store.readNeighbours(id, { limit, types, minScore });
  const head = store.names.get(id);
  return {
    entity: head ? { id, type: head.type, name: head.name } : null,
    neighbours: rows.map((r) => ({ id: r.id, type: r.type, name: store.names.get(r.id)?.name ?? r.id, score: r.score, linked: r.linked, reasons: r.reasons })),
  };
}
