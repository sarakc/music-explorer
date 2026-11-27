// The + and − step layouts: the first 300, 800, 2,000 and 4,000 nodes in step order,
// and all of them, each placed near its map spot with nothing touching. Worked out once
// per map layout (atlas-steps-worker.js) and served with GET /api/atlas.
// Pure: the same nodes and edges always give the same steps.
import { forceCollide } from '../vendor/d3-force/index.js';
import { ATLAS } from '../graph/atlas-config.js';
import { roomPx, refScale, LABEL_REACH } from '../graph/atlas-look.js';
import { ATLAS_DEFAULTS } from './atlas-config.js';
import { lcg } from './atlas-layout.js';

/**
 * Node indices in step order: strength (the sum of the scores of the layout's links that
 * touch a node) high to low, then owned tracks, then name, then id.
 */
export function stepOrder(nodes, edges) {
  const strength = new Float64Array(nodes.length);
  for (const [a, b, score] of edges) {
    strength[a] += score;
    strength[b] += score;
  }
  const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  return nodes.map((_, i) => i).sort((i, j) => strength[j] - strength[i]
    || (nodes[j].weight || 0) - (nodes[i].weight || 0)
    || cmp(nodes[i].name ?? '', nodes[j].name ?? '')
    || cmp(nodes[i].id, nodes[j].id));
}

function extentOf(nodes) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  }
  return { minX, maxX, minY, maxY };
}

/**
 * What the step layouts are worked out from. Stored with them: steps stored under another
 * version are worked out again (in the background, the old ones served meanwhile).
 */
export const STEPS_VERSION = (() => {
  const inputs = [2, ATLAS.steps.join('/'), ATLAS.refW, ATLAS.refH, ATLAS.refFit, ATLAS.stepPad, LABEL_REACH.toFixed(4), ATLAS.stepTicks,
    ATLAS.stepPull, ATLAS.stepCollide, ATLAS.stepCollideIterations, ATLAS.stepKeep, ATLAS.stepHardPasses, ATLAS.stepHardIterations].join('|');
  let h = 5381;
  for (let k = 0; k < inputs.length; k++) h = ((h * 33) ^ inputs.charCodeAt(k)) >>> 0;
  return h.toString(36);
})();

/** Stored steps that hold for this map layout: its run, worked out by this version. */
export function stepsCurrent(steps, meta) {
  return Boolean(steps && meta) && steps.layoutRun === meta.layoutRun && steps.version === STEPS_VERSION;
}

/** A node's kind from its id (`label:~…`), when the caller did not pass it. */
const typeOf = (d) => d.type ?? String(d.id).split(':')[0];

const HARD_PASSES_MAX = 400;
const STILL = 0.001;
const round1 = (v) => Math.round(v * 10) / 10;
const ROUND_ROOM = 0.05 * Math.SQRT2;

/** The five step layouts: { version, refK, counts, ids (step order), xy[k] = flat [x, y, …] of the first counts[k] }. */
export function computeSteps({ nodes, edges, seed = ATLAS_DEFAULTS.seed }) {
  const n = nodes.length;
  if (!n) return { version: STEPS_VERSION, refK: 1, counts: [], ids: [], xy: [] };
  const refK = refScale(extentOf(nodes));
  const order = stepOrder(nodes, edges);
  const counts = [...ATLAS.steps.filter((c) => c < n), n];
  // Each radius also leaves room for the rounding to 0.1 (at most half of 0.1 per axis), so
  // the served spots never touch either.
  const r = nodes.map((d) => roomPx(d.weight, typeOf(d)) / refK + ROUND_ROOM);
  const rMin = Math.min(...r);
  const x = Float64Array.from(nodes, (d) => d.x), y = Float64Array.from(nodes, (d) => d.y);
  const xy = [];
  for (const count of counts) {
    const ids = order.slice(0, count);
    const sim = ids.map((i, index) => ({ i, index, x: x[i], y: y[i], vx: 0, vy: 0 }));
    const radius = (d) => r[d.i];
    const collide = forceCollide().strength(ATLAS.stepCollide).iterations(ATLAS.stepCollideIterations).radius(radius);
    collide.initialize(sim, lcg(seed));
    for (let it = 0; it < ATLAS.stepTicks; it++) {
      for (const d of sim) {
        d.vx += (nodes[d.i].x - d.x) * ATLAS.stepPull;
        d.vy += (nodes[d.i].y - d.y) * ATLAS.stepPull;
      }
      collide(1);
      let moved = 0;
      for (const d of sim) {
        d.vx *= ATLAS.stepKeep; d.vy *= ATLAS.stepKeep;
        d.x += d.vx; d.y += d.vy;
        moved = Math.max(moved, Math.abs(d.vx) + Math.abs(d.vy));
      }
      if (it > 40 && moved < 1e-4 * r[ids[0]]) break;
    }
    const hard = forceCollide().strength(1).iterations(ATLAS.stepHardIterations).radius(radius);
    hard.initialize(sim, lcg(seed));
    // At least the set passes, then on until what is left to push apart is under 0.1% of the
    // smallest radius (collision only pushes overlapping pairs, by their overlap).
    for (let it = 0; it < HARD_PASSES_MAX; it++) {
      for (const d of sim) d.vx = d.vy = 0;
      hard(1);
      let moved = 0;
      for (const d of sim) {
        moved = Math.max(moved, Math.abs(d.vx) + Math.abs(d.vy));
        d.x += d.vx; d.y += d.vy;
      }
      if (it >= ATLAS.stepHardPasses - 1 && moved < STILL * rMin) break;
    }
    const flat = new Array(2 * count);
    sim.forEach((d, j) => {
      x[d.i] = d.x; y[d.i] = d.y;
      flat[2 * j] = round1(d.x); flat[2 * j + 1] = round1(d.y);
    });
    xy.push(flat);
  }
  return { version: STEPS_VERSION, refK, counts, ids: order.map((i) => nodes[i].id), xy };
}

/**
 * The stored steps as GET /api/atlas serves them: `order` the served node indices in step
 * order, `xy[k]` the positions of the first `counts[k]`. An id the payload has dropped
 * (`at` maps id → served index) is left out, and each count shrinks to match.
 */
export function stepsPayload(steps, at) {
  const keep = steps.ids.map((id) => at.get(id));
  const order = keep.filter((i) => i !== undefined);
  const counts = [], xy = [];
  steps.counts.forEach((count, k) => {
    const flat = [];
    for (let j = 0; j < count; j++) {
      if (keep[j] === undefined) continue;
      flat.push(steps.xy[k][2 * j], steps.xy[k][2 * j + 1]);
    }
    counts.push(flat.length / 2);
    xy.push(flat);
  });
  return { refK: steps.refK, counts, order, xy };
}
