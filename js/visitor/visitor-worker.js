// The visitor's map, worked out off the main thread. Two modes:
//   build: { type: 'build', file } → progress ({ type: 'progress', step: 'reading' |
//     'scoring' | 'layout', done, total }), { type: 'tracks', count, parts } once read, then
//     { type: 'built', map } (its typed arrays transferred) or { type: 'error', code,
//     message } (a VisitorError's code, else 'failed').
//   serve: { type: 'serve', stores, baselineRows } → { type: 'ready' }; then
//     { type: 'ask', reqId, what: 'satellites' | 'why', args } → { type: 'reply', reqId, value }.
//   shard: a build's scoring is spread over shard workers of this same module
//     (sharded-run.js), past SHARD_MIN tracks with more than one core to spare.
// Everything stays in this browser: the worker makes no request.
import { readLibrary } from './read-library.js';
import { packMap, transferables, stepsInput } from './map-format.js';
import { fullRun, prepare, why, satellites } from '../similarity/run.js';
import { computeBaselines, compileBaselines } from '../similarity/baselines.js';
import { SHARED_DEFAULTS, mergeConfigOver } from '../similarity/config.js';
import { computeSteps } from '../similarity/atlas-steps.js';
import { shardedRun, shardHandler } from './sharded-run.js';

/** A library this size or larger is scored across shard workers. */
export const SHARD_MIN = 3_000;

const visitorConfig = () => mergeConfigOver(SHARED_DEFAULTS, {});
const clock = () => globalThis.performance.now();
/** Shards for a build: a core is left for the page, and at most 3, like the server. */
export const shardCount = (cores = globalThis.navigator?.hardwareConcurrency) => Math.max(1, Math.min((Number(cores) || 1) - 1, 3));
const spawnShard = () => new Worker(new URL('./visitor-worker.js', import.meta.url), { type: 'module' });

/**
 * The worker's message handler, posting with `post(message, transfer)`. `run`
 * stands in for the run in tests; `parts` and `spawn` set the shards.
 */
export function createHandler(post, { run = null, parts = shardCount(), spawn = spawnShard } = {}) {
  let served = null;
  const shard = shardHandler(post, post);
  async function build(file) {
    const cfg = visitorConfig();
    try {
      const { stores, skipped } = await readLibrary(file, { onProgress: (done, total) => post({ type: 'progress', step: 'reading', done, total }) });
      if (skipped) console.info(`[visitor] ${skipped} rows skipped (no title or no artist).`);
      const count = stores.tracks.length;
      const sharded = !run && parts > 1 && count >= SHARD_MIN;
      post({ type: 'tracks', count, parts: sharded ? parts : 1 });
      post({ type: 'progress', step: 'scoring', done: 0, total: 0 });
      const options = {
        likeness: true, now: clock,
        onProgress: (done, total) => post({ type: 'progress', step: 'scoring', done, total }),
        onStep: () => post({ type: 'progress', step: 'layout', done: 0, total: 0 }),
      };
      const result = run ? run(stores, cfg, options)
        : sharded ? await shardedRun(stores, cfg, { ...options, parts, spawn })
          : fullRun(stores, cfg, options);
      if (result.atlas?.error) throw new Error(`layout failed: ${result.atlas.error}`);
      const map = packMap(result, stores, file, (store) => computeSteps(stepsInput(store)));
      post({ type: 'built', map }, transferables(map));
    } catch (err) {
      post({ type: 'error', code: err?.name === 'VisitorError' ? err.code : 'failed', message: err?.message || String(err) });
    }
  }
  function serve(stores, baselineRows) {
    const cfg = visitorConfig();
    const state = prepare(stores, cfg);
    const baselines = compileBaselines(baselineRows ?? computeBaselines(state.index, cfg));
    served = { state, cfg, baselines };
    post({ type: 'ready' });
  }
  function ask({ reqId, what, args = {} }) {
    let value = null;
    try {
      if (!served) throw new Error('not serving');
      if (what === 'satellites') value = satellites(served.state, args.id);
      else if (what === 'why') value = why(served.state, args.a, args.b, served.cfg, served.baselines);
      else throw new Error(`unknown question: ${what}`);
      post({ type: 'reply', reqId, value });
    } catch (err) { post({ type: 'reply', reqId, value: null, error: err?.message || String(err) }); }
  }
  return async (msg) => {
    if (msg?.type === 'build') return build(msg.file);
    if (msg?.type === 'serve') return serve(msg.stores, msg.baselineRows);
    if (msg?.type === 'ask') return ask(msg);
    if (msg?.type === 'shard' || msg?.type === 'shard-score' || msg?.type === 'shard-likeness') return shard(msg);
  };
}

// In a worker, `self` posts back to the page.
const scope = globalThis.self;
if (scope && typeof scope.postMessage === 'function' && typeof globalThis.document === 'undefined') {
  const handle = createHandler((m, transfer) => scope.postMessage(m, transfer || []));
  scope.onmessage = (e) => handle(e.data);
}
