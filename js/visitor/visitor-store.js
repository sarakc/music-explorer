// The visitor's latest map in this browser's IndexedDB (`music-explorer-yours`,
// store `map`, key `latest`): a cache of their own file, worthless if lost. Every
// call resolves (false or null) and never rejects, storage blocked or not. A map
// of another format or engine version is dropped.
import { VISITOR_DB, VISITOR_STORE, VISITOR_KEY, hasStoredMap } from '../visitor-entry.js';
import { MAP_FORMAT } from './map-format.js';
import { ENGINE_VERSION } from '../similarity/config.js';

export { hasStoredMap };

const factory = () => { try { return globalThis.indexedDB ?? null; } catch { return null; } };

// The open database, or null.
function open() {
  return new Promise((resolve) => {
    try {
      const idb = factory();
      if (!idb) { resolve(null); return; }
      const req = idb.open(VISITOR_DB, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(VISITOR_STORE)) req.result.createObjectStore(VISITOR_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

// Runs `fn(store)` in one transaction; resolves its request's result (or true), or `fallback`.
async function withStore(mode, fn, fallback) {
  const db = await open();
  if (!db) return fallback;
  return new Promise((resolve) => {
    let result = fallback;
    const done = (v) => { try { db.close(); } catch { /* closed */ } resolve(v); };
    try {
      const tx = db.transaction(VISITOR_STORE, mode);
      const req = fn(tx.objectStore(VISITOR_STORE));
      req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => done(mode === 'readwrite' ? true : result);
      tx.onerror = () => done(fallback);
      tx.onabort = () => done(fallback);
    } catch { done(fallback); }
  });
}

/** saveMap(map) => Promise<boolean>: true once the map is stored. */
export async function saveMap(map) {
  return (await withStore('readwrite', (s) => s.put(map, VISITOR_KEY), false)) === true;
}

/** forgetMap() => Promise<void>: the stored map, and its database, gone. */
export async function forgetMap() {
  try {
    const idb = factory();
    if (!idb) return;
    await new Promise((resolve) => {
      const req = idb.deleteDatabase(VISITOR_DB);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  } catch { /* nothing stored */ }
}

/** loadMap() => Promise<VisitorMap | null>; a map of another format or engine is forgotten. */
export async function loadMap() {
  if (!(await hasStoredMap())) return null;
  const map = await withStore('readonly', (s) => s.get(VISITOR_KEY), null);
  if (!map) return null;
  if (map.format !== MAP_FORMAT || map.engine !== ENGINE_VERSION) { await forgetMap(); return null; }
  return map;
}
