// A full run with its scoring spread over shard workers, the way the server's
// resident worker shards a full build: each shard works out its part of the chance
// baselines (mergeBaselines of the parts equals the whole), then scores every
// `parts`-th entity against the merged baselines and sends its rows back. The rows
// are gathered in entity order, so the result is the one fullRun gives.
//   Shard protocol: { type: 'shard', stores, cfg, part, parts } → { type: 'shard-baselines', rows };
//   { type: 'shard-score', baselineRows } → { type: 'shard-progress', done }…, { type: 'shard-rows', rows }…,
//   { type: 'shard-done' }; { type: 'shard-likeness' } → { type: 'shard-table', table } (its part of the
//   likeness table); any failure → { type: 'shard-error', message }.
import { prepare, scoreIds, collectRows, buildAtlas, entityNames } from '../similarity/run.js';
import { computeBaselines, compileBaselines, mergeBaselines } from '../similarity/baselines.js';
import { SIGNALS } from '../similarity/signals/index.js';
import { buildLikeness, mergeLikeness } from '../similarity/likeness.js';

/** One shard's side: a handler for the shard messages, posting with `post`. */
export function shardHandler(post, postTransfer = post) {
  let shard = null;
  return (msg) => {
    try {
      if (msg.type === 'shard') {
        const state = prepare(msg.stores, msg.cfg, { colour: false });
        shard = { state, cfg: msg.cfg, part: msg.part, parts: msg.parts };
        post({ type: 'shard-baselines', rows: computeBaselines(state.index, msg.cfg, SIGNALS, { part: msg.part, parts: msg.parts }) });
      } else if (msg.type === 'shard-score') {
        const { state, cfg, part, parts } = shard;
        const ids = [...state.index.entities.keys()].filter((_, i) => i % parts === part);
        shard.baselines = compileBaselines(msg.baselineRows);
        scoreIds(state, ids, cfg, {
          baselines: shard.baselines,
          onProgress: (done) => post({ type: 'shard-progress', done }),
          onRows: (rows) => post({ type: 'shard-rows', rows }),
        });
        post({ type: 'shard-done' });
      } else if (msg.type === 'shard-likeness') {
        const { state, cfg, baselines, part, parts } = shard;
        shard = null;
        const table = buildLikeness(state, cfg, baselines, { part, parts });
        postTransfer({ type: 'shard-table', table }, [table.offsets.buffer, table.cand.buffer, table.s.buffer]);
      }
    } catch (err) { post({ type: 'shard-error', message: err?.message || String(err) }); }
  };
}

// Sends `msg` to a shard worker and resolves on `until`; rejects on its error.
function ask(worker, msg, until, onMessage = () => {}) {
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'shard-error') reject(new Error(m.message));
      else if (m.type === until) resolve(m);
      else onMessage(m);
    };
    worker.onerror = (e) => { e?.preventDefault?.(); reject(new Error(e?.message || 'a shard worker failed')); };
    worker.postMessage(msg);
  });
}

/**
 * shardedRun(stores, cfg, { parts, spawn, onProgress, onStep, likeness, now }) =>
 * Promise<the fullRun result>. `spawn()` makes a shard worker.
 */
export async function shardedRun(stores, cfg, { parts, spawn, onProgress = () => {}, onStep = () => {}, likeness = false, now } = {}) {
  const state = prepare(stores, cfg);
  const ids = [...state.index.entities.keys()];
  const workers = [];
  try {
    for (let part = 0; part < parts; part++) workers.push(spawn());
    const baselineRows = mergeBaselines((await Promise.all(workers.map((w, part) => ask(w, { type: 'shard', stores, cfg, part, parts }, 'shard-baselines')))).map((m) => m.rows));
    const baselines = compileBaselines(baselineRows);
    const byEntity = new Map(), done = new Array(parts).fill(0);
    await Promise.all(workers.map((w, part) => ask(w, { type: 'shard-score', baselineRows }, 'shard-done', (m) => {
      if (m.type === 'shard-rows') for (const r of m.rows) (byEntity.get(r.entityId) || byEntity.set(r.entityId, []).get(r.entityId)).push(r);
      else if (m.type === 'shard-progress') { done[part] = m.done; onProgress(done.reduce((a, b) => a + b, 0), ids.length); }
    })));
    // The likeness table in parts on the shards, while this thread gathers the rows.
    const tables = likeness ? Promise.all(workers.map((w) => ask(w, { type: 'shard-likeness' }, 'shard-table'))) : null;
    tables?.catch(() => {});
    // In entity order, as a single thread scores them.
    const collected = collectRows(state), rows = [];
    for (const id of ids) {
      const list = byEntity.get(id);
      if (!list) continue;
      collected.add(list);
      for (const r of list) rows.push(r);
    }
    byEntity.clear();
    const table = tables ? mergeLikeness((await tables).map((m) => m.table)) : null;
    for (const w of workers.splice(0)) w.terminate();
    onStep('layout');
    const atlas = buildAtlas(state, collected.atlasRows, collected.affinity, { now });
    return { rows, atlas, baselineRows, baselines, names: entityNames(state), state, likeness: table };
  } finally { for (const w of workers) { try { w.terminate(); } catch { /* gone */ } } }
}
