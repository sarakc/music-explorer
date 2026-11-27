// Favourites collections. ☆ "DJ" is the music played out and stays the
// `favorites` store, read by every digging source on the server. ♡ "Downtime"
// and the custom collections live in favorite_collections and favorite_marks
// and feed nothing but browsing. Any artist, label, tag, album or track can be in
// any number of them. They are not tags: nothing is written to a file.
//
// Pure helpers (the collections, a mark's key, the route's `fav`) and the
// session's cache of every mark (`FavoriteMarks`), which rows, Info, the player
// bar and the header read without waiting. Every mark goes through the cache,
// which writes through MusicDatabase and then sends `favorites-changed`.

import { escapeHtml as esc } from './html.js';

export const STAR = 'star';
export const HEART = 'heart';
export const BUILT_IN = Object.freeze([
    Object.freeze({ id: STAR, name: 'DJ', glyph: '☆', order: 0, builtIn: true }),
    Object.freeze({ id: HEART, name: 'Downtime', glyph: '♡', order: 1, builtIn: true }),
]);
/** The marks a custom collection picks from: outline, none of them a kind shape or ✦. */
export const GLYPHS = Object.freeze(['◇', '☾', '♪', '⚐', '✿', '☼']);
const FILLED = { '☆': '★', '♡': '♥', '◇': '◆' };

/** A one-click mark's look when on: ★, ♥. */
export const filledGlyph = (glyph) => FILLED[glyph] || glyph;
/** An item's mark in a list: ☆'s filled, the others in outline. */
export const listGlyph = (c) => (c?.id === STAR ? filledGlyph(c.glyph) : c?.glyph || '');

const ID = /^[a-z0-9-]{1,40}$/;
export const validCollectionId = (id) => typeof id === 'string' && ID.test(id);
const trim = (v) => String(v ?? '').trim();

/** An item's key, as the `favorites` store keys it: `type:name`, lower-cased. */
export const itemKey = (type, name) => `${type}:${trim(name).toLowerCase()}`;
/** A favorite_marks row's id. */
export const markId = (collection, type, name) => `${collection}:${itemKey(type, name)}`;

/** A fresh id for a custom collection. */
export const newCollectionId = (now = Date.now(), rand = Math.random) => `c${now.toString(36)}${Math.floor(rand() * 1296).toString(36).padStart(2, '0')}`;

/** The built-ins (renamed where a stored row says so) first, then the custom collections in their order. */
export function mergeCollections(stored = []) {
    const byId = new Map(BUILT_IN.map((b) => [b.id, { ...b }]));
    for (const r of stored || []) {
        if (!validCollectionId(r?.id)) continue;
        const name = trim(r.name);
        const base = byId.get(r.id);
        if (base?.builtIn) { if (name) base.name = name; continue; }
        if (!name) continue;
        byId.set(r.id, { id: r.id, name, glyph: GLYPHS.includes(r.glyph) ? r.glyph : GLYPHS[0], order: Number.isFinite(r.order) ? r.order : Number.MAX_SAFE_INTEGER, builtIn: false });
    }
    return [...byId.values()].sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || a.order - b.order || a.name.localeCompare(b.name));
}

/** The first glyph no custom collection uses yet (they repeat once all are taken). */
export function nextGlyph(collections = []) {
    const used = new Set(collections.filter((c) => !c.builtIn).map((c) => c.glyph));
    return GLYPHS.find((g) => !used.has(g)) || GLYPHS[collections.filter((c) => !c.builtIn).length % GLYPHS.length];
}

// ---- the route's `fav` ----
//
// `true` is ☆ alone (`fav=1`, as before collections); any other choice is a list
// of collection ids in a fixed order (`fav=star,heart`), so a link is exact.

const rank = (id) => (id === STAR ? 0 : id === HEART ? 1 : 2);
const byRank = (a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);

/** `true` for ☆ alone, a sorted list of ids for anything else, undefined for none. */
export function normalizeFav(fav) {
    if (fav === true) return true;
    if (!Array.isArray(fav)) return undefined;
    const ids = [...new Set(fav.filter(validCollectionId))].sort(byRank);
    if (!ids.length) return undefined;
    return ids.length === 1 && ids[0] === STAR ? true : ids;
}
/** The collection ids a route's `fav` turns on ([] for none). */
export const favIds = (fav) => { const n = normalizeFav(fav); return n === true ? [STAR] : n || []; };
/** A `fav` query value: '1' for ☆ alone, else the ids, '' for none. */
export const favParam = (fav) => { const n = normalizeFav(fav); return n === true ? '1' : n ? n.join(',') : ''; };
/** The route's `fav` from its query value. */
export const parseFavParam = (value) => (value === '1' ? true : value ? normalizeFav(String(value).split(',')) : undefined);
/** The collection a mark key gives: `f` ☆, `⇧F` ♡. */
export const markForKey = (key) => (key === 'f' ? STAR : key === 'F' ? HEART : null);

/** `fav` with one collection turned on or off. */
export function toggleFav(fav, id) {
    const ids = new Set(favIds(fav));
    if (ids.has(id)) ids.delete(id); else ids.add(id);
    return normalizeFav([...ids]);
}

// ---- ☆ and ♡ as buttons ----

/** The two one-click marks: ☆ and ♡ (as named now). */
export const pairOf = (collections = BUILT_IN) => [STAR, HEART].map((id) => collections.find((c) => c.id === id) || BUILT_IN.find((b) => b.id === id));

/** ☆ and ♡ side by side for one item; `on` is the set of collections it is in. `attrs` go on both. */
export function markPairHtml(on, { collections = BUILT_IN, cls = 'mark-btn', attrs = '' } = {}) {
    return pairOf(collections).map((c) => {
        const lit = Boolean(on?.has?.(c.id));
        return `<button type="button" class="${cls}${lit ? ' is-on' : ''}" data-mark="${c.id}"${attrs ? ` ${attrs}` : ''} aria-pressed="${lit}" aria-label="${esc(c.name)}" title="${esc(c.name)}">${lit ? filledGlyph(c.glyph) : c.glyph}</button>`;
    }).join('');
}

/** Paint a mark button drawn by markPairHtml again, in place. */
export function paintMark(btn, collection, lit) {
    if (!btn || !collection) return;
    btn.classList.toggle('is-on', lit);
    btn.setAttribute('aria-pressed', String(lit));
    btn.setAttribute('aria-label', collection.name);
    btn.title = collection.name;
    btn.textContent = lit ? filledGlyph(collection.glyph) : collection.glyph;
}

// ---- Favorites ›: every collection as a checked list, in the row menu and Info's ⋯ ----

/** The group's row and its list, folded until the row is clicked. `list`: { glyph, label, key?, checked, run, on? }. */
export function favoritesGroupHtml(list, { cls = 'row-context-item' } = {}) {
    const items = list.map((it, i) => `<button type="button" class="${cls}" data-fav-sub-item="${i}" role="menuitemcheckbox" aria-checked="${Boolean(it.checked)}"><span class="column-menu-check" aria-hidden="true">${it.checked ? '✓' : ''}</span><span class="fav-glyph" aria-hidden="true">${esc(it.glyph)}</span><span class="fav-sub-name">${esc(it.label)}</span>${it.key ? `<kbd>${esc(it.key)}</kbd>` : ''}</button>`).join('');
    return `<button type="button" class="${cls} fav-sub-toggle" data-fav-sub aria-haspopup="true" aria-expanded="false"><span>Favorites</span><span aria-hidden="true">›</span></button>`
        + `<div class="fav-sub" role="group" aria-label="Favorites" hidden>${items}</div>`;
}

/** Open and close the group; a click on a collection runs it and flips its check, leaving the menu open. */
export function wireFavoritesGroup(root, list) {
    root?.addEventListener('click', async (e) => {
        const t = e.target.closest?.('[data-fav-sub], [data-fav-sub-item]');
        if (!t || !root.contains(t)) return;
        e.stopPropagation();
        if (t.hasAttribute('data-fav-sub')) {
            const sub = t.nextElementSibling;
            const open = Boolean(sub?.hidden);
            if (sub) sub.hidden = !open;
            t.setAttribute('aria-expanded', String(open));
            if (open) sub.querySelector('button')?.focus();
            return;
        }
        const it = list[Number(t.dataset.favSubItem)];
        if (!it) return;
        const ok = await it.run();
        if (ok === null) return;
        // `on()` reads the state back where the item can; else the check flips.
        it.checked = typeof it.on === 'function' ? Boolean(it.on()) : !it.checked;
        t.setAttribute('aria-checked', String(it.checked));
        const check = t.querySelector('.column-menu-check');
        if (check) check.textContent = it.checked ? '✓' : '';
    });
}

// ---- the session's marks ----

const changed = (detail) => globalThis.document?.dispatchEvent?.(new CustomEvent('favorites-changed', { detail }));

export class FavoriteMarks {
    /** `database()` is the MusicDatabase (asked for each call: the app's integration manager arrives later). */
    constructor({ database = () => null, notify = changed } = {}) {
        this._db = database;
        this._notify = notify;
        this.collections = mergeCollections();
        this.records = [];
        this._keys = new Map();
    }

    get db() { return this._db?.() || null; }

    /** Read the collections and every mark. A failed read keeps what was there. */
    async load() {
        const db = this.db;
        if (!db?.listMarks) return this;
        const [collections, records] = await Promise.all([db.listFavoriteCollections?.() ?? mergeCollections(), db.listMarks(null)]);
        this.collections = collections;
        this._setRecords(records || []);
        return this;
    }

    _setRecords(records) {
        const known = new Set(this.collections.map((c) => c.id));
        this.records = records.filter((r) => r && known.has(r.collection));
        this._keys = new Map();
        for (const r of this.records) {
            const key = itemKey(r.type, r.name);
            if (!this._keys.has(key)) this._keys.set(key, new Set());
            this._keys.get(key).add(r.collection);
        }
    }

    collection(id) { return this.collections.find((c) => c.id === id) || null; }
    /** The collections an item is in. */
    of(type, name) { return this._keys.get(itemKey(type, name)) || new Set(); }
    has(collection, type, name) { return this.of(type, name).has(collection); }
    /** The track ids marked in one collection. */
    trackIds(collection) { return new Set(this.records.filter((r) => r.collection === collection && r.type === 'track').map((r) => String(r.name))); }
    /** The collections with at least one mark, in order. */
    inUse() {
        const used = new Set(this.records.map((r) => r.collection));
        return this.collections.filter((c) => used.has(c.id));
    }
    /** The marks in these collections (a route's `fav`), as filter records. */
    recordsIn(fav) {
        const ids = new Set(favIds(fav));
        return this.records.filter((r) => ids.has(r.collection));
    }

    /** Mark or unmark one item: `on` undefined toggles. Returns whether it is now marked. */
    async set(collection, type, name, on) {
        const db = this.db;
        if (!db?.toggleMark) throw new Error('database unavailable');
        const now = this.has(collection, type, name);
        const want = on === undefined ? !now : Boolean(on);
        if (want !== now) {
            const result = await db.toggleMark(collection, type, name);
            const key = itemKey(type, name);
            const rest = this.records.filter((r) => !(r.collection === collection && itemKey(r.type, r.name) === key));
            this._setRecords(result ? [...rest, { collection, type, name: trim(name), markedAt: Date.now() }] : rest);
            this._notify({ collection, type, name, on: Boolean(result) });
            return Boolean(result);
        }
        return now;
    }
    toggle(collection, type, name) { return this.set(collection, type, name); }

    /** A new custom collection, last in the list. */
    async create(name, glyph = nextGlyph(this.collections)) {
        const clean = trim(name);
        if (!clean) return null;
        const order = Math.max(1, ...this.collections.map((c) => (c.order < Number.MAX_SAFE_INTEGER ? c.order : 0))) + 1;
        const rec = { id: newCollectionId(), name: clean, glyph: GLYPHS.includes(glyph) ? glyph : GLYPHS[0], order };
        await this.db.saveFavoriteCollection(rec);
        this.collections = mergeCollections([...this.collections, rec]);
        this._notify({ collection: rec.id });
        return this.collection(rec.id);
    }

    /** A new name; a custom collection may take a new glyph too. */
    async rename(id, name, glyph) {
        const c = this.collection(id), clean = trim(name);
        if (!c || !clean) return null;
        const rec = c.builtIn ? { id, name: clean } : { id, name: clean, glyph: GLYPHS.includes(glyph) ? glyph : c.glyph, order: c.order };
        await this.db.saveFavoriteCollection(rec);
        this.collections = this.collections.map((x) => (x.id === id ? { ...x, ...rec } : x));
        this._notify({ collection: id });
        return this.collection(id);
    }

    /** Delete a custom collection and its marks. Returns the Undo, which puts both back. */
    async remove(id) {
        const c = this.collection(id);
        if (!c || c.builtIn) return null;
        const removed = await this.db.deleteFavoriteCollection(id);
        this.collections = this.collections.filter((x) => x.id !== id);
        this._setRecords(this.records);
        this._notify({ collection: id });
        return async () => {
            await this.db.restoreFavoriteCollection({ collection: removed?.collection || { id, name: c.name, glyph: c.glyph, order: c.order }, marks: removed?.marks || [] });
            await this.load();
            this._notify({ collection: id });
        };
    }
}
