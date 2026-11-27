// A `?src=yours` page's source: the stored map, answered in this browser, with a
// worker serving what needs the engine's index (satellites, why). Null when no
// map is stored (the page then boots the snapshot and opens the sheet).
import { loadMap } from './visitor-store.js';
import { createVisitorSource } from './visitor-source.js';

const spawnWorker = () => new Worker(new URL('./visitor-worker.js', import.meta.url), { type: 'module' });

/** `ask(what, args)` over a worker in serve mode; replies are matched by reqId. */
export function serveAsk(worker, map) {
  let next = 0;
  const waiting = new Map();
  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg?.type !== 'reply' || !waiting.has(msg.reqId)) return;
    waiting.get(msg.reqId)(msg.value ?? null);
    waiting.delete(msg.reqId);
  };
  worker.onerror = (e) => {
    console.error('[visitor] the map worker failed:', e?.message || e);
    for (const done of waiting.values()) done(null);
    waiting.clear();
  };
  worker.postMessage({ type: 'serve', stores: map.stores, baselineRows: map.baselineRows });
  return (what, args) => new Promise((resolve) => {
    const reqId = next++;
    waiting.set(reqId, resolve);
    worker.postMessage({ type: 'ask', reqId, what, args });
  });
}

/** openVisitorSource() => Promise<source | null> */
export async function openVisitorSource({ load = loadMap, spawn = spawnWorker } = {}) {
  const map = await load();
  if (!map) return null;
  return createVisitorSource({ map, ask: serveAsk(spawn(), map) });
}
