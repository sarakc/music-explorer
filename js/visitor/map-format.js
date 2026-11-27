// A visitor's map as it is posted from the worker and kept in the browser:
//   VisitorMap = { format, engine, file: { name, size }, createdAt, stores, names,
//     neighbours: NeighbourTable, atlas: { meta, positions, subgenres }, steps,
//     likeness: LikenessTable | null, baselineRows }
// `format` is this shape's version, `engine` the engine's: a map from another of
// either is dropped and the file opened again.
import { ENGINE_VERSION } from '../similarity/config.js';
import { ATLAS_DEFAULTS } from '../similarity/atlas-config.js';
import { packNeighbours, atlasOfRun, createMemoryStore } from '../similarity/memory-store.js';

export const MAP_FORMAT = 1;

/**
 * The step layouts' input, the way the server feeds them (lib/similarity/index.js
 * ensureSteps): every placed node and each one's top links among map nodes.
 */
export function stepsInput(store) {
  const positions = store.atlasPositions();
  const at = new Map(positions.map((p, i) => [p.id, i]));
  const nodes = positions.map((p) => ({ id: p.id, name: store.names.get(p.id)?.name ?? '', x: p.x, y: p.y, weight: p.weight }));
  const edges = [], seen = new Set();
  for (const l of store.topNeighbours(nodes.map((n) => n.id), { limit: ATLAS_DEFAULTS.neighbours, types: ATLAS_DEFAULTS.types, minScore: 0 })) {
    const a = at.get(l.a), b = at.get(l.b);
    if (a === undefined || b === undefined || a === b) continue;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push([a, b, l.score]);
  }
  return { nodes, edges };
}

/** The memory store over a map (`satellites`: id => value or Promise). */
export const storeOfMap = (map, satellites = () => null) =>
  createMemoryStore({ names: new Map(map.names), neighbours: map.neighbours, atlas: map.atlas, satellites });

/**
 * packMap(run, stores, file, steps) => VisitorMap, from fullRun's result. `steps`
 * is a function of the map's store (computeSteps over stepsInput), or the steps.
 */
export function packMap(run, stores, file, steps = null, { createdAt = Date.now() } = {}) {
  const map = {
    format: MAP_FORMAT, engine: ENGINE_VERSION, file: { name: String(file?.name ?? ''), size: Number(file?.size) || 0 }, createdAt,
    stores, names: run.names, neighbours: packNeighbours(run.rows), atlas: atlasOfRun(run.atlas, { layoutRun: 1, createdAt }),
    steps: null, likeness: run.likeness ?? null, baselineRows: run.baselineRows,
  };
  const out = typeof steps === 'function' ? (map.atlas.meta ? steps(storeOfMap(map)) : null) : steps;
  map.steps = out ? { layoutRun: map.atlas.meta?.layoutRun ?? 1, ...out } : null;
  return map;
}

/** The typed arrays' buffers, to transfer a map instead of copying it. */
export function transferables(map) {
  const out = new Set();
  for (const part of [map.neighbours, map.likeness]) {
    if (!part) continue;
    for (const v of Object.values(part)) if (ArrayBuffer.isView(v)) out.add(v.buffer);
  }
  return [...out];
}
