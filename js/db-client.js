// Transport for the server-owned database. Every durable read and write in the
// app goes through here. Same-origin, so no auth and no CORS concerns — the
// server's requestGuard already rejects foreign Host/Origin.
const BASE = '/api/db';

export async function dbFetch(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { /* non-JSON error body */ }
    throw new Error(`db ${method} ${path} failed: ${res.status}${detail ? ` — ${detail}` : ''}`);
  }
  return res.json();
}

export const dbGetAll = (store) => dbFetch(`/${store}`).then((r) => r.rows);
export const dbGet = (store, id) => dbFetch(`/${store}/${encodeURIComponent(id)}`).then((r) => r.row);
export const dbPut = (store, id, row) => dbFetch(`/${store}/${encodeURIComponent(id)}`, { method: 'PUT', body: { row } }).then((r) => r.row);
export const dbPatchTrack = (id, fields) => dbFetch(`/tracks/${encodeURIComponent(id)}`, { method: 'PATCH', body: { fields } }).then((r) => r.row);
export const dbBatch = (store, rows) => dbFetch(`/${store}/batch`, { method: 'POST', body: { rows } }).then((r) => r.written);
export const dbDelete = (store, id) => dbFetch(`/${store}/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => r.removed);
export const dbClear = (store) => dbFetch(`/${store}`, { method: 'DELETE' }).then((r) => r.cleared);
// `complete`: the rows come from a scrape that read every page (the server refuses an empty list without it).
export const dbReplaceBandcampAccounts = (rows, { complete = false } = {}) => dbFetch('/bandcamp_accounts/replace', { method: 'POST', body: { rows, complete } }).then((r) => r.written);
export const dbSnapshot = () => dbFetch('/snapshot').then((r) => r.stores);

export const dbImportDiscogsTracks = (tracks) => dbFetch('/tracks/discogs-import', { method: 'POST', body: { tracks } });
