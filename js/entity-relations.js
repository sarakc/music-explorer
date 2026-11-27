// Entity relations — reads a library artist/label's Discogs identity and the
// profile's relationship lists (aliases, members, groups, sublabels, parent)
// that the server's Discogs queue stores, and derives sourced relation records
// for the graph. Fetching is the server's job (server/lib/discogsWorker.js).
//
// Identity rule (applied by the server through resolveCandidates): a Discogs
// search result confirms an entity only when exactly one result's title (minus
// a trailing " (n)" disambiguator) has the same entityKey as the library name.
// Anything else is ambiguous or unresolved and waits for the user, unless the
// entity's own releases credit exactly one candidate (the server's
// discogsOwnedEvidence.js); only a confirmed identity gets a profile. No DOM.
import { entityId, entityKey } from './credits-graph.js';
import { cachedBlocker } from './discogs-wait.js';

export const RELATIONS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UNRESOLVED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PROVIDER = 'discogs';
const ENTITY_TYPES = new Set(['artist', 'label']);

export const refKey = ({ provider, type, id }) => `${provider}:${type}:${id}`;
export function isFresh(row, now = Date.now()) {
    return Boolean(row?.fetchedAt) && now - row.fetchedAt < RELATIONS_TTL_MS;
}
const stripDisambiguator = (title) => String(title ?? '').replace(/\s*\(\d+\)\s*$/, '');
const candidate = (r) => ({ id: String(r.id), name: String(r.title ?? r.name ?? '') });

// The edges a cleaned search name drops: space, invisible characters, emoji and
// marks (®, ℗, ♪) and separators. `!`, `.`, `$`, `+` and brackets can belong to a name.
const EDGE = /^[\s\p{Extended_Pictographic}\p{Cf}®™©℗♪♫♬★☆\-–—_*~|/\\,:;•·"'“”‘’]+|[\s\p{Extended_Pictographic}\p{Cf}®™©℗♪♫♬★☆\-–—_*~|/\\,:;•·"'“”‘’]+$/gu;
const NOISE = [/^[℗©]\s*(?:19|20)\d\d\s+/, /\s*[([]\s*official\s*[)\]]$/i, /\s+official$/i, /\s*-\s*topic$/i, /\s*VEVO$/, /\s+vevo$/i, /\s*\(\d{1,3}\)$/];

/**
 * A library name with its removable noise gone, for a second Discogs search:
 * a trailing `(Official)` or `Official`, ` - Topic`, `VEVO`, a ` (n)`, and
 * symbols or separators at either end. Collaborations (`feat.`, `x`, `&`) stay
 * whole. '' when nothing changes or nothing would be left.
 */
export function cleanSearchName(name) {
    const raw = String(name ?? '').trim();
    let s = raw;
    for (let i = 0; i < 4; i++) {
        const before = s;
        for (const re of NOISE) s = s.replace(re, '');
        s = s.replace(EDGE, '');
        if (s === before) break;
    }
    return s !== raw && /[\p{L}\p{N}]/u.test(s) ? s : '';
}

export function resolveCandidates(name, results, type = 'artist') {
    const key = entityKey(name);
    const list = (Array.isArray(results) ? results : []).filter((r) => r && r.id != null);
    // A name that carries its Discogs " (n)" names its entry: that title alone confirms.
    const own = /\(\d+\)\s*$/.test(String(name ?? '')) ? list.filter((r) => entityKey(r.title) === key) : [];
    if (own.length === 1) return { resolution: 'confirmed', ref: { provider: PROVIDER, type, id: String(own[0].id) }, candidates: own.map(candidate) };
    const exact = list.filter((r) => entityKey(stripDisambiguator(r.title)) === key);
    if (exact.length === 1) {
        return { resolution: 'confirmed', ref: { provider: PROVIDER, type, id: String(exact[0].id) }, candidates: exact.map(candidate) };
    }
    if (exact.length > 1) return { resolution: 'ambiguous', ref: null, candidates: exact.map(candidate) };
    if (list.length > 0) return { resolution: 'ambiguous', ref: null, candidates: list.slice(0, 5).map(candidate) };
    return { resolution: 'unresolved', ref: null, candidates: [] };
}

export function discogsPlainText(text) {
    return String(text ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, '$1')
        .replace(/\[[almr]=([^\]]*)\]/gi, '$1')
        .replace(/\[[almr]\d+\]/gi, '')
        .replace(/\[\/?[biu]\]/gi, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Relation lists on a stored row: null (Discogs omitted) and [] (empty) both count as nothing.
const listsOf = (row) => Object.entries(row?.relations || {}).filter(([k]) => k !== 'namevariations').map(([, v]) => v);
const hasNothing = (row) => listsOf(row).every((v) => v == null || (Array.isArray(v) && v.length === 0))
    && !(row?.profile || '').trim();

export function deriveRelations(identityRows, relationRows) {
    const byRef = new Map();
    for (const row of identityRows || []) {
        if (row?.resolution !== 'confirmed') continue;
        for (const ref of row.refs || []) byRef.set(refKey(ref), row);
    }
    const out = new Map();
    for (const row of relationRows || []) {
        const self = byRef.get(row?.ref);
        if (!self) continue;
        const type = row.type;
        const me = { type, name: self.name, discogsId: String(row.id), local: self.entityId || entityId(type, self.name) };
        const other = (x) => {
            const id = String(x.id), hit = byRef.get(refKey({ provider: PROVIDER, type, id }));
            return { type, name: String(x.name ?? ''), discogsId: id, local: hit ? hit.entityId || entityId(type, hit.name) : null };
        };
        const add = (kind, directed, from, to) => {
            const pair = directed ? [from.discogsId, to.discogsId] : [from.discogsId, to.discogsId].sort();
            const key = `${kind}|${pair[0]}|${pair[1]}`;
            if (out.has(key)) return;
            out.set(key, { kind, directed, from, to, provenance: { provider: PROVIDER, url: row.sourceUrl, fetchedAt: row.fetchedAt } });
        };
        const rel = row.relations || {};
        const each = (list, fn) => { for (const x of Array.isArray(list) ? list : []) if (x && x.id != null) fn(x); };
        if (type === 'artist') {
            each(rel.aliases, (x) => add('alias-of', false, me, other(x)));
            each(rel.members, (x) => add('member-of', true, other(x), me));
            each(rel.groups, (x) => add('member-of', true, me, other(x)));
        } else if (type === 'label') {
            each(rel.sublabels, (x) => add('sublabel-of', true, other(x), me));
            if (rel.parentLabel?.id != null) add('sublabel-of', true, me, other(rel.parentLabel));
        }
    }
    return [...out.values()];
}

const isEntity = (e) => Boolean(e && e.id && ENTITY_TYPES.has(e.type) && entityKey(e.name));
const quiet = async (fn, fallback = null) => { try { return await fn(); } catch (_) { return fallback; } };

// Reads what the server's Discogs queue has stored; never calls Discogs. When
// data is missing or stale it asks the queue (`queue.focus`) and answers
// 'loading'; the panel re-reads when the queue reports the job done.
// `connector` is accepted for compatibility and unused.
export class EntityRelations {
    constructor({ database, connector, queue } = {}) {
        if (!database) throw new Error('EntityRelations: database is required');
        this.database = database;
        this.connector = connector;
        this.queue = queue;
        this._blocker = cachedBlocker(queue);
    }

    // A failing store propagates: callers treat it as unavailable rather than
    // as a missing identity.
    async identity(entity) {
        if (!isEntity(entity)) return null;
        return this.database.getEntityIdentity(entity.id);
    }

    // The stored identity. The server does the searching; a refresh only asks it to look again.
    async resolve(entity, { refresh = false } = {}) {
        if (!isEntity(entity)) return null;
        const existing = await this.identity(entity);
        if (!existing && !refresh) return null;
        return existing;
    }

    // A pick in the panel: confirm the identity here (a store write, marked
    // `source: 'manual'` so nothing re-resolves it), then ask the queue for the
    // profile and releases.
    async confirm(entity, { id, name }) {
        const current = (await this.identity(entity)) || {};
        const row = { ...current, entityId: entity.id, type: entity.type, name: entity.name, resolution: 'confirmed', source: 'manual',
            refs: [{ provider: PROVIDER, type: entity.type, id: String(id) }],
            candidates: current.candidates || [{ id: String(id), name: String(name ?? '') }],
            legacyIds: current.legacyIds || [], updatedAt: Date.now() };
        await quiet(() => this.database.putEntityIdentity(row));
        this.queue?.focus?.({ focus: [entity.id] });
        return this.load(entity);
    }

    // Asks the queue for `entity` unless it cannot work: 'loading' when it can,
    // else 'disconnected' / 'unavailable'.
    async _request(entity, as = 'focus') {
        const blocked = await this._blocker();
        if (blocked) return blocked;
        this.queue.focus({ [as]: [entity.id] });
        return 'loading';
    }

    async load(entity, { refresh = false, as = 'focus' } = {}) {
        let identity;
        try {
            identity = await this.resolve(entity, { refresh });
        } catch (_) {
            return { state: 'unavailable', identity: null, row: null };
        }
        if (!identity) {
            if (!isEntity(entity)) return { state: 'unresolved', identity: null, row: null };
            return { state: await this._request(entity, as), identity: null, row: null };
        }
        if (identity.resolution !== 'confirmed' || !identity.refs?.[0]) {
            if (identity.resolution === 'ambiguous') return { state: 'ambiguous', identity, row: null };
            const due = refresh || Date.now() - (identity.updatedAt || 0) >= UNRESOLVED_TTL_MS;
            if (due && (await this._request(entity, as)) === 'loading') return { state: 'loading', identity, row: null };
            return { state: 'unresolved', identity, row: null };
        }
        const ref = identity.refs[0];
        const row = await quiet(() => this.database.getEntityRelations(refKey(ref)));
        const done = (r) => ({ state: hasNothing(r) ? 'empty' : 'ready', identity, row: r });
        if (row && isFresh(row) && !refresh) return done(row);
        const asked = await this._request(entity, as);
        if (row) return { state: 'stale', identity, row };
        return { state: asked, identity, row: null };
    }

    async relations() {
        const [identities, rows] = await Promise.all([
            quiet(() => this.database.getAllEntityIdentity(), []),
            quiet(() => this.database.getAllEntityRelations(), []),
        ]);
        return deriveRelations(identities, rows);
    }
}

export default EntityRelations;
