// Curation backup: export the durable stores to one readable JSON file and
// restore them with merge or replace.
//
// Why: the collection is server-owned now, but this file remains the portable
// bridge across machines and the only durable copy of what UMM adds on top
// of Rekordbox (enrichment values, staged tag edits, gigs, favorites…).
//
// Envelope:
//   { format: 'umm-backup', version: 1, exportedAt: ISO, stores: { <store>: rows[] } }
//
// Rules:
//   - Stores are grouped into three families for the export checkboxes.
//   - Stores the file does not contain are never touched on import.
//   - Stores the app does not know are reported and skipped, never written.
//   - Merge upserts by key and keeps local rows the file lacks.
//   - Replace clears each store the file contains, then writes the file rows.
//   - Every row of every store is validated before a restore is opened,
//     and the restore runs as ONE server-side transaction across all stores:
//     a failure anywhere rolls back everywhere, so the database is either
//     fully restored or exactly as it was.
//   - Export reads every selected store via the db client so the file is a
//     consistent snapshot rather than a series of moments.
//   - Every write is user-initiated from the Settings panel.

import { STORE_KEY_PATHS } from '../music-database.js';
import { dbFetch, dbSnapshot } from './db-client.js';

export const BACKUP_FORMAT = 'umm-backup';
export const BACKUP_VERSION = 1;

export const FAMILIES = {
    library: {
        label: 'Library',
        help: 'Every track record, including enrichment values and edited tags. The bulk of the file.',
        stores: ['tracks'],
    },
    curation: {
        label: 'Curation',
        help: 'Gigs, favorites and their collections, shortlist, dismissed releases, saved filters, Bandcamp following, staged tag edits, Discogs identity links, Bandcamp and Spotify links, play history, settings.',
        stores: ['rb_workspace', 'playlists', 'gigs', 'favorites', 'favorite_collections', 'favorite_marks', 'shortlist', 'crates', 'bandcamp_accounts', 'pending_tag_diffs', 'entity_identity', 'entity_links', 'play_events', 'rekordbox_sessions', 'settings', 'dismissed_releases'],
    },
    enrichment: {
        label: 'Enrichment caches',
        help: 'Discogs and MusicBrainz lookups. Rebuildable, but slowly.',
        stores: ['release_credits', 'release_resolve_map', 'label_discogs_map', 'artist_discogs_map', 'credits_cache', 'entity_relations', 'discogs_releases'],
    },
};

// Stores that exist in the schema but are deliberately not backed up.
// The playback queue is player state, not curation; whole-database checkpoints cover it.
export const EXCLUDED_STORES = ['playback_queue'];

const KEY_PATHS = STORE_KEY_PATHS;

const familyOf = (store) => Object.keys(FAMILIES).find((f) => FAMILIES[f].stores.includes(store)) || null;
const MODES = new Set(['merge', 'replace']);

export function buildBackup({ stores = {}, now = Date.now() } = {}) {
    return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date(now).toISOString(),
        stores,
    };
}

// ── Row and key validation ──────────────────────────────────────────────
// IndexedDB accepts a key only if it is a number (not NaN), a string, a valid
// Date, a binary buffer, or an array of those. put() rejects anything else
// with a DataError, and inside a transaction that error aborts the whole
// restore, so every row is checked here first and the failure names the
// exact store, row and reason.

const KEY_KINDS = 'a number, string, Date, binary buffer, or an array of those';
const MAX_KEY_DEPTH = 32; // guards against self-referencing arrays

export function isValidKey(value, depth = 0) {
    if (typeof value === 'number') return !Number.isNaN(value);
    if (typeof value === 'string') return true;
    if (value instanceof Date) return !Number.isNaN(value.getTime());
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
    if (Array.isArray(value)) return depth < MAX_KEY_DEPTH && value.every((v) => isValidKey(v, depth + 1));
    return false;
}

function describeValue(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'an array containing an invalid key';
    if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
    if (value instanceof Date) return 'an invalid Date';
    return `a ${typeof value}`;
}

function previewValue(value) {
    let text;
    try { text = typeof value === 'symbol' ? value.toString() : JSON.stringify(value) ?? String(value); } catch { text = String(value); }
    return text.length > 40 ? `${text.slice(0, 37)}…` : text;
}

/** Throw a precise error if any row of `rows` cannot be written to `name`. */
export function validateStoreRows(name, rows) {
    const keyPath = KEY_PATHS[name];
    if (!keyPath) throw new Error(`Store "${name}" is not one this app knows.`);
    if (!Array.isArray(rows)) throw new Error(`Store "${name}" is not a list of rows.`);
    rows.forEach((row, i) => {
        const where = `Store "${name}", row ${i + 1}`;
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
            throw new Error(`${where}: expected an object, got ${describeValue(row)}.`);
        }
        const key = row[keyPath];
        if (key == null) throw new Error(`${where}: missing its "${keyPath}" key.`);
        if (!isValidKey(key)) {
            throw new Error(`${where}: "${keyPath}" is ${describeValue(key)} (${previewValue(key)}); row keys must be ${KEY_KINDS}.`);
        }
    });
}

/** Validate a parsed backup and describe it. Throws on anything unusable. */
export function inspectBackup(json) {
    if (!json || typeof json !== 'object' || json.format !== BACKUP_FORMAT || typeof json.stores !== 'object' || json.stores === null) {
        throw new Error('This is not a UMM backup file.');
    }
    if (!Number.isInteger(json.version) || json.version > BACKUP_VERSION) {
        throw new Error(`This backup (version ${json.version}) is newer than this app understands (version ${BACKUP_VERSION}).`);
    }
    const stores = [];
    const unknown = [];
    for (const [name, rows] of Object.entries(json.stores)) {
        if (!KEY_PATHS[name]) { unknown.push(name); continue; }
        validateStoreRows(name, rows);
        stores.push({ name, family: familyOf(name), count: rows.length });
    }
    return { version: json.version, exportedAt: json.exportedAt || null, stores, unknown };
}

/**
 * Decide what each store write looks like. `existing` maps store name to its
 * current rows or bare keys (only stores present in the file need to be
 * supplied; readExistingFor passes keys, which is all the diff needs).
 */
export function planRestore({ backup, existing = {}, mode } = {}) {
    if (!MODES.has(mode)) throw new Error(`Unknown restore mode: ${mode}`);
    const info = inspectBackup(backup);
    const stores = info.stores.map(({ name, family, count }) => {
        const keyPath = KEY_PATHS[name];
        const rows = backup.stores[name];
        const incomingKeys = new Set(rows.map((r) => r[keyPath]));
        const localKeys = new Set((existing[name] || []).map((r) => (r && typeof r === 'object') ? r[keyPath] : r));
        let updated = 0;
        for (const k of incomingKeys) if (localKeys.has(k)) updated += 1;
        const added = incomingKeys.size - updated;
        let removed = 0;
        if (mode === 'replace') for (const k of localKeys) if (!incomingKeys.has(k)) removed += 1;
        return { name, family, count, rows, clear: mode === 'replace', updated, added, removed };
    });
    return { mode, stores, unknown: info.unknown };
}

// ── db-client orchestration ─────────────────────────────────────────────

const errorText = (err, fallback) => {
    if (!err) return fallback;
    const msg = err.message || fallback;
    return err.name && err.name !== 'Error' ? `${err.name}: ${msg}` : msg;
};

const storeError = (name, err) =>
    new Error(`Restore failed on store "${name}": ${errorText(err, 'write failed')}. No stores were changed.`);

/** Read several stores. Uses one snapshot so the result is a single
 *  consistent view. Resolves to { [name]: rows | keys }. */
async function readStores(database, names, { keysOnly = false } = {}) {
    if (!names.length) return {};
    // One snapshot call keeps multi-store export consistent; picking by name
    // avoids N round-trips that could drift between stores.
    const snap = await dbSnapshot();
    const out = {};
    for (const name of names) {
        const rows = snap[name] || [];
        if (keysOnly) {
            const keyPath = KEY_PATHS[name];
            out[name] = rows.map((r) => r?.[keyPath]).filter((k) => k != null);
        } else {
            out[name] = rows;
        }
    }
    return out;
}

/**
 * Write several stores via the atomic POST /api/db/restore endpoint.
 * `stores` is a list of { name, rows, clear }. On failure the server rolls
 * back every store; the thrown error names the store and ends with
 * "No stores were changed." so the Settings panel can show it as-is.
 */
async function writeStores(database, stores) {
    if (!stores.length) return;
    try {
        await dbFetch('/restore', { method: 'POST', body: { stores } });
    } catch (err) {
        // dbFetch: `db POST /restore failed: 400 — <server detail>`
        const raw = String(err?.message || '');
        const detail = raw.includes(' — ') ? raw.slice(raw.indexOf(' — ') + 3) : raw;
        // Server repo errors look like `favorites: row is missing its key path "id"`.
        const storeMatch = detail.match(/^([a-z_]+):/i);
        const name = storeMatch?.[1] || stores[0]?.name || 'unknown';
        throw storeError(name, new Error(detail || 'write failed'));
    }
}

const presentStores = (database, names) =>
    names.filter((n) => Object.prototype.hasOwnProperty.call(STORE_KEY_PATHS, n));

/** Read the selected families out of the db into a backup envelope, as one
 *  consistent snapshot. */
export async function exportBackup(database, families = Object.keys(FAMILIES)) {
    const names = presentStores(database, families.flatMap((f) => FAMILIES[f]?.stores || []));
    const stores = await readStores(database, names);
    return buildBackup({ stores });
}

/** Read current keys for the stores a backup contains, so the preview can
 *  show exact added/updated/removed counts without deserialising rows. */
export async function readExistingFor(database, backup) {
    const info = inspectBackup(backup);
    const names = presentStores(database, info.stores.map((s) => s.name));
    return readStores(database, names, { keysOnly: true });
}

/**
 * Apply a plan from planRestore. Every row is validated first, then all
 * stores are written in one transaction, so the database is either fully
 * restored or untouched. `write` is injectable for tests and receives the
 * list of { name, rows, clear } for the stores this database has.
 */
export async function applyRestore(database, plan, { write = writeStores } = {}) {
    for (const s of plan.stores) validateStoreRows(s.name, s.rows);
    const stores = presentStores(database, plan.stores.map((s) => s.name))
        .map((name) => plan.stores.find((s) => s.name === name))
        .map(({ name, rows, clear }) => ({ name, rows, clear: Boolean(clear) }));
    await write(database, stores);
    return plan;
}

/** Plan and apply in one go. Returns the plan for reporting. */
export async function importBackup(database, backup, mode) {
    const existing = await readExistingFor(database, backup);
    return applyRestore(database, planRestore({ backup, existing, mode }));
}

export function backupFilename(now = Date.now()) {
    const d = new Date(now);
    const pad = (n) => String(n).padStart(2, '0');
    return `umm-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}
