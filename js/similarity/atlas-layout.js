// The atlas: one fixed position for every artist, label and tag, worked out once
// per full similarity run with a force layout over each node's top neighbours.
// Pure: the same nodes, edges and previous positions always give the same map
// (seeded random source, fixed tick count, stable order). The clock, which only
// bounds the time spent, is injected (`now`); the server passes its CPU clock.
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from '../vendor/d3-force/index.js';
import { ATLAS_DEFAULTS } from './atlas-config.js';

/** A seedable linear congruential generator in [0, 1), the one d3-force uses. */
export function lcg(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (1664525 * s + 1013904223) % 4294967296) / 4294967296;
}

/** FNV-1a folded to [0, 1): small deterministic offsets per id. */
export function hash01(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h / 4294967296;
}

export const collisionRadius = (weight, cfg = ATLAS_DEFAULTS) => cfg.baseRadius + cfg.radiusPerLog * Math.log2(1 + Math.max(0, weight || 0));

/**
 * The run's score scale: the `q` quantile of `scores` (the layout's edge scores),
 * in (0, 1]. Layout and drawing read a score as `min(1, score / scale)`, so the map
 * keeps its looseness whatever range the blend gives; stored scores never change.
 * 1 when there are no scores.
 */
export function scoreScale(scores, q = ATLAS_DEFAULTS.scoreQuantile) {
  const list = [...scores].filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return 1;
  const v = list[Math.min(list.length - 1, Math.floor(list.length * q))];
  return Math.min(1, Math.max(0.01, v));
}

/** A score as layout and drawing read it: its share of the run's `scale`, at most 1. */
export const shownScore = (score, scale = 1) => Math.min(1, Math.max(0, Number(score) || 0) / (scale > 0 ? scale : 1));

const pairKey = (a, b) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/**
 * The layout's edges: each atlas node's top `limit` atlas neighbours, as one
 * undirected edge per pair (the higher score wins). `rows` are neighbour rows
 * ({ entityId, id, type, score }) in any order.
 */
export function atlasEdges(rows, atlasIds, limit = ATLAS_DEFAULTS.neighbours) {
  const lists = new Map();
  for (const r of rows) {
    if (!atlasIds.has(r.entityId) || !atlasIds.has(r.id) || r.entityId === r.id) continue;
    (lists.get(r.entityId) || lists.set(r.entityId, []).get(r.entityId)).push(r);
  }
  const best = new Map();
  for (const list of lists.values()) {
    list.sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    // A shard rescored after running out of memory sends its rows twice: each neighbour counts once.
    const seen = new Set(), top = [];
    for (const r of list) { if (top.length >= limit) break; if (!seen.has(r.id)) { seen.add(r.id); top.push(r); } }
    for (const r of top) {
      const k = pairKey(r.entityId, r.id);
      if ((best.get(k)?.score ?? -1) < r.score) best.set(k, { a: r.entityId < r.id ? r.entityId : r.id, b: r.entityId < r.id ? r.id : r.entityId, score: r.score });
    }
  }
  return [...best.values()].sort((x, y) => (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : x.b > y.b ? 1 : 0));
}

/**
 * Where each node starts: its previous position, else the score-weighted mean
 * of its placed neighbours (nudged by a hash of its id so two newcomers never
 * coincide), else undefined (d3 places it on its phyllotaxis spiral).
 */
export function seedPositions(nodes, edges, previous) {
  const out = new Map();
  for (const n of nodes) { const p = previous.get(n.id); if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) out.set(n.id, { x: p.x, y: p.y }); }
  const sums = new Map();
  for (const e of edges) for (const [self, other] of [[e.a, e.b], [e.b, e.a]]) {
    if (out.has(self) || !out.has(other)) continue;
    const s = sums.get(self) || sums.set(self, { x: 0, y: 0, w: 0 }).get(self), p = out.get(other), w = Math.max(e.score, 1e-6);
    s.x += p.x * w; s.y += p.y * w; s.w += w;
  }
  for (const [id, s] of sums) {
    const t = hash01(id) * Math.PI * 2;
    out.set(id, { x: s.x / s.w + Math.cos(t) * 2, y: s.y / s.w + Math.sin(t) * 2 });
  }
  return out;
}

/**
 * @param nodes    [{ id, weight }] (sorted here by id, so input order never matters)
 * @param edges    [{ a, b, score }] between node ids
 * @param previous Map id -> { x, y } from the last layout (empty on the first run)
 * @param groupOf  optional Map id -> main subgenre, which places nodes with no links
 * @param hold     true: keep every previous position and place only nodes without one
 *                 (beside their placed neighbours, then collisions alone), so the map does not move
 * @returns { positions: [{ id, x, y, weight }], ticks, warm, held, scale, ms }
 * Throws when the layout spends more than `cfg.timeoutMs` by `now` (ms; the server passes CPU time).
 */
export function layoutAtlas({ nodes, edges, previous = new Map(), cfg = ATLAS_DEFAULTS, now = () => globalThis.performance.now(), groupOf = null, hold = false }) {
  const started = now();
  const sorted = [...nodes].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const known = new Set(sorted.map((n) => n.id));
  const links = edges.filter((e) => known.has(e.a) && known.has(e.b) && e.a !== e.b)
    .map((e) => (e.a < e.b ? e : { a: e.b, b: e.a, score: e.score }))
    .sort((x, y) => (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : x.b > y.b ? 1 : y.score - x.score));
  const seeds = seedPositions(sorted, links, previous);
  const warm = sorted.some((n) => previous.has(n.id));
  const scale = scoreScale(links.map((l) => l.score), cfg.scoreQuantile);
  if (hold && warm) return holdLayout({ sorted, links, seeds, previous, cfg, groupOf, scale, started, now });
  const sim = sorted.map((n) => ({ id: n.id, weight: n.weight || 0, ...(seeds.get(n.id) || {}) }));
  const degree = new Map();
  for (const l of links) for (const id of [l.a, l.b]) degree.set(id, (degree.get(id) || 0) + 1);

  const simulation = forceSimulation(sim)
    .randomSource(lcg(cfg.seed))
    .velocityDecay(cfg.velocityDecay)
    .alpha(warm ? cfg.warmAlpha : 1)
    .alphaDecay(1 - Math.pow(0.001, 1 / cfg.ticks))
    .force('link', forceLink(links.map((l) => ({ source: l.a, target: l.b, score: l.score })))
      .id((d) => d.id)
      .distance(cfg.linkDistance)
      .strength((l) => shownScore(l.score, scale) / Math.min(degree.get(l.source.id) || 1, degree.get(l.target.id) || 1)))
    .force('charge', forceManyBody().strength(cfg.charge).theta(cfg.theta).distanceMax(cfg.chargeDistanceMax))
    .force('collide', forceCollide((d) => collisionRadius(d.weight, cfg)).iterations(cfg.collideIterations))
    .force('x', forceX(0).strength(cfg.gravity / (cfg.aspect || 1)))
    .force('y', forceY(0).strength(cfg.gravity * (cfg.aspect || 1)))
    .stop();
  for (let done = 0; done < cfg.ticks; done += 10) {
    if (now() - started > cfg.timeoutMs) throw new Error(`atlas layout timed out after ${Math.round(now() - started)} ms of CPU time`);
    simulation.tick(Math.min(10, cfg.ticks - done));
  }
  // Weakly linked nodes drift to the rim: put them beside their strongest
  // neighbour (or their subgenre), then let collisions alone settle the overlaps.
  const placed = placeWeak(new Map(sim.map((d) => [d.id, { x: d.x, y: d.y }])), links, { groupOf, cfg });
  for (const d of sim) { const p = placed.get(d.id); d.x = p.x; d.y = p.y; d.vx = 0; d.vy = 0; }
  simulation.force('link', null).force('charge', null).force('x', null).force('y', null).alpha(cfg.settleAlpha);
  if (now() - started > cfg.timeoutMs) throw new Error(`atlas layout timed out after ${Math.round(now() - started)} ms of CPU time`);
  simulation.tick(cfg.settleTicks);
  const round = (v) => Math.round(v * 100) / 100;
  const positions = sim.map((d) => ({ id: d.id, x: round(d.x), y: round(d.y), weight: d.weight }));
  if (positions.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('atlas layout produced a non-finite position');
  return { positions, ticks: cfg.ticks, warm, held: false, scale, ms: Math.round(now() - started) };
}

// The held layout: every node with a previous position keeps it exactly. A new
// one starts beside its placed neighbours (repeated, so chains of new nodes
// follow), else `linkDistance` from a hash-chosen node of its main subgenre,
// else from a hash-chosen placed node; then collisions alone move the new ones.
function holdLayout({ sorted, links, seeds, previous, cfg, groupOf, scale, started, now }) {
  const fixed = new Set(sorted.filter((n) => previous.has(n.id)).map((n) => n.id));
  let placed = seeds;
  for (let size = -1; placed.size > size && placed.size < sorted.length;) { size = placed.size; placed = seedPositions(sorted, links, placed); }
  const byGroup = new Map(), all = [...placed.keys()].sort();
  for (const id of all) { const g = groupOf?.get(id); if (g != null) (byGroup.get(g) || byGroup.set(g, []).get(g)).push(id); }
  for (const n of sorted) {
    if (placed.has(n.id)) continue;
    const list = byGroup.get(groupOf?.get(n.id)) || all, p = placed.get(list[Math.floor(hash01(n.id) * list.length)]);
    const t = hash01(`${n.id}\u0000angle`) * Math.PI * 2;
    placed.set(n.id, { x: p.x + Math.cos(t) * cfg.linkDistance, y: p.y + Math.sin(t) * cfg.linkDistance });
  }
  const sim = sorted.map((n) => {
    const p = placed.get(n.id);
    return { id: n.id, weight: n.weight || 0, x: p.x, y: p.y, ...(fixed.has(n.id) ? { fx: p.x, fy: p.y } : {}) };
  });
  if (sim.length > fixed.size) {
    const simulation = forceSimulation(sim).randomSource(lcg(cfg.seed)).velocityDecay(cfg.velocityDecay).alpha(cfg.settleAlpha)
      .force('collide', forceCollide((d) => collisionRadius(d.weight, cfg)).iterations(cfg.collideIterations)).stop();
    if (now() - started > cfg.timeoutMs) throw new Error(`atlas layout timed out after ${Math.round(now() - started)} ms of CPU time`);
    simulation.tick(cfg.settleTicks);
  }
  const round = (v) => Math.round(v * 100) / 100;
  const positions = sim.map((d) => ({ id: d.id, x: fixed.has(d.id) ? d.fx : round(d.x), y: fixed.has(d.id) ? d.fy : round(d.y), weight: d.weight }));
  if (positions.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('atlas layout produced a non-finite position');
  return { positions, ticks: 0, warm: true, held: true, scale, ms: Math.round(now() - started) };
}

/**
 * Where weakly linked nodes go once the ticks are done. Pure: returns a new Map.
 * - A node with 1 to `cfg.weakDegree` links sits `linkDistance` from its
 *   strongest neighbour, at an angle hashed from its id.
 * - A node outside the largest connected part (no links, or a small group
 *   linked only among itself) has nothing pulling it in, so charge leaves it on
 *   the rim. With a group (its main subgenre), its part moves as a whole: its
 *   centre lands `linkDistance` from a hash-chosen member of the part's most
 *   common group in the largest part. Without a group it lands beside a
 *   hash-chosen node of the largest part, so nothing is left on a rim.
 * @param positions Map id -> { x, y }
 * @param links     [{ a, b, score }]
 * @param groupOf   optional Map id -> group name
 */
export function placeWeak(positions, links, { groupOf = null, cfg = ATLAS_DEFAULTS } = {}) {
  const out = new Map([...positions].map(([id, p]) => [id, { x: p.x, y: p.y }]));
  const adjacent = new Map(), strongest = new Map();
  for (const l of links) {
    if (!out.has(l.a) || !out.has(l.b) || l.a === l.b) continue;
    for (const [self, other] of [[l.a, l.b], [l.b, l.a]]) {
      (adjacent.get(self) || adjacent.set(self, []).get(self)).push(other);
      const best = strongest.get(self);
      if (!best || l.score > best.score || (l.score === best.score && other < best.id)) strongest.set(self, { id: other, score: l.score });
    }
  }
  const degree = (id) => adjacent.get(id)?.length || 0;
  const offset = (key, p) => { const t = hash01(key) * Math.PI * 2; return { x: p.x + Math.cos(t) * cfg.linkDistance, y: p.y + Math.sin(t) * cfg.linkDistance }; };
  const ids = [...out.keys()].sort();
  const weak = new Set(ids.filter((id) => degree(id) >= 1 && degree(id) <= cfg.weakDegree));
  // An anchor that is weak itself is placed first, so chains end together; a
  // cycle of weak nodes starts from its smallest id.
  const done = new Set();
  for (const id of ids) {
    const chain = [];
    for (let at = id; weak.has(at) && !done.has(at); at = strongest.get(at).id) { done.add(at); chain.push(at); }
    for (const at of chain.reverse()) out.set(at, offset(at, out.get(strongest.get(at).id)));
  }
  // Connected parts, each listed from its smallest id; the largest is the map.
  const partOf = new Map(), parts = [];
  for (const id of ids) {
    if (partOf.has(id)) continue;
    const part = [id];
    partOf.set(id, parts.length);
    for (let i = 0; i < part.length; i++) for (const next of adjacent.get(part[i]) || []) if (!partOf.has(next)) { partOf.set(next, parts.length); part.push(next); }
    parts.push(part);
  }
  if (!parts.length) return out; // nothing to place (an empty library)
  const main = parts.reduce((best, part, i) => (part.length > parts[best].length ? i : best), 0);
  const members = new Map(), mainIds = [...parts[main]].sort();
  for (const id of parts[main]) { const g = groupOf?.get(id); if (g != null) (members.get(g) || members.set(g, []).get(g)).push(id); }
  for (const id of members.keys()) members.get(id).sort();
  parts.forEach((part, i) => {
    if (i === main) return;
    const counts = new Map();
    for (const id of part) { const g = groupOf?.get(id); if (g != null && members.has(g)) counts.set(g, (counts.get(g) || 0) + 1); }
    const group = [...counts].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0]?.[0];
    const list = group == null ? mainIds : members.get(group), key = [...part].sort()[0];
    const target = offset(key, out.get(list[Math.floor(hash01(key) * list.length)]));
    const cx = part.reduce((s, id) => s + out.get(id).x, 0) / part.length, cy = part.reduce((s, id) => s + out.get(id).y, 0) / part.length;
    for (const id of part) { const p = out.get(id); out.set(id, { x: p.x - cx + target.x, y: p.y - cy + target.y }); }
  });
  return out;
}

/** Median distance moved by ids present in both layouts, as a share of `b`'s extent. */
export function medianMovement(a, b) {
  const prev = new Map(a.map((p) => [p.id, p]));
  const xs = b.map((p) => p.x), ys = b.map((p) => p.y);
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const moves = b.filter((p) => prev.has(p.id)).map((p) => Math.hypot(p.x - prev.get(p.id).x, p.y - prev.get(p.id).y)).sort((x, y) => x - y);
  if (!moves.length) return 0;
  return moves[Math.floor(moves.length / 2)] / extent;
}
