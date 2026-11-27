// The favourites list in the Go list (go-list.js), shown while the search field is empty:
// each collection (☆ DJ, ♡ Downtime, custom ones) as a headed group of its artists, labels,
// tags, albums and tracks, the latest first, then New collection. A group shows its first
// GROUP_CAP items and "N more" opens the rest. A heading renames its collection (a custom one
// also takes a new glyph, or is deleted, with Undo). The viewer lists the collections with
// items and edits nothing. The pure builders come first; FavoritesList holds the editing.
import { favoriteEntityId } from './favorite-ids.js';
import { escapeHtml as esc } from './html.js';
import { glyphSvg } from './kind-glyph.js';
import { GLYPHS, listGlyph, nextGlyph } from './favorite-marks.js';
import { undoToast } from './undo-toast.js';
import { VIEWER, visitorHides } from './viewer-profile.js';

export const GROUPS = [['artist', 'Artists'], ['label', 'Labels'], ['tag', 'Tags'], ['album', 'Albums'], ['track', 'Tracks']];

/** The most a collection lists before "N more". */
export const GROUP_CAP = 5;

const markedAt = (r) => Number(r?.markedAt ?? r?.starredAt) || 0;

/**
 * Favorite records as kind groups, most recently marked first. Each item: { id (entity
 * id), type, name, sub }. Albums saved without their artist, and tracks no longer in the
 * library, have nowhere to go and are left out.
 */
export function groupFavorites(records, { trackById = new Map() } = {}) {
    const groups = new Map(GROUPS.map(([type]) => [type, []]));
    const sorted = [...(records || [])].sort((a, b) => markedAt(b) - markedAt(a));
    const seen = new Set();
    for (const r of sorted) {
        if (!groups.has(r?.type)) continue;
        const id = favoriteEntityId(r);
        if (!id || seen.has(id)) continue;
        let name = String(r.name ?? '').trim(), sub = '';
        if (r.type === 'album') { const at = name.indexOf('::'); sub = name.slice(0, at).trim(); name = name.slice(at + 2).trim(); }
        if (r.type === 'track') {
            const t = trackById.get(id.slice('track:'.length));
            if (!t) continue;
            name = String(t.title || 'Untitled'); sub = String(t.artist || '');
        }
        seen.add(id);
        groups.get(r.type).push({ id, type: r.type, name, sub });
    }
    return GROUPS.map(([type, label]) => ({ type, label, items: groups.get(type) })).filter((g) => g.items.length);
}

/**
 * The favourites list: one group per collection, in the collections' order, each
 * holding its items (artists, labels, tags, albums, tracks; the latest first in each).
 */
export function collectionGroups(collections, records, { trackById = new Map() } = {}) {
    return (collections || []).map((collection) => ({
        collection,
        items: groupFavorites((records || []).filter((r) => r?.collection === collection.id), { trackById }).flatMap((g) => g.items),
    }));
}

/** The items a group shows: its first `cap`, or all of them once opened. */
export const shownItems = (group, { cap = GROUP_CAP, expanded = new Set() } = {}) => (expanded.has(group.collection.id) ? group.items : group.items.slice(0, cap));

/** The page an item opens (on a graph, routeForPick turns it into a focus). */
export function favoriteRoute(item) {
    if (item.type === 'track') return { view: 'track', id: item.id.slice('track:'.length) };
    if (item.type === 'album') return { view: 'album', name: item.name, artist: item.sub };
    return { view: item.type, name: item.name };
}

const itemHtml = (it, activeId, idx) => {
    const at = idx?.(it);
    return `<li><button type="button" class="fp-item${it.id === activeId ? ' is-active' : ''}" data-fp-id="${esc(it.id)}"${at != null ? ` data-go-idx="${at}" id="goRow${at}" role="option"` : ''}${it.id === activeId ? ' aria-current="true"' : ''}><span class="fp-name">${glyphSvg(it.type)}${esc(it.name)}</span>${it.sub ? `<span class="fp-sub">${esc(it.sub)}</span>` : ''}</button></li>`;
};

/**
 * `editing`: the id being renamed, or 'new' for New collection's form; `edit` false draws no
 * editing (the viewer). `idx(item)` numbers each listed item for the Go list's ↓ and ↑.
 */
export function collectionsListHtml(groups, { activeId = null, editing = null, draftGlyph = GLYPHS[0], edit = true, cap = GROUP_CAP, expanded = new Set(), idx = null } = {}) {
    const glyphPicker = (current) => `<span class="fp-glyphs" role="radiogroup" aria-label="Mark">${GLYPHS.map((g) => `<button type="button" class="fp-glyph-pick${g === current ? ' is-on' : ''}" data-fp-glyph="${esc(g)}" role="radio" aria-checked="${g === current}" aria-label="${esc(g)}">${esc(g)}</button>`).join('')}</span>`;
    const form = (c) => `<div class="fp-form" data-fp-form="${esc(c ? c.id : 'new')}">
        ${!c || !c.builtIn ? glyphPicker(c ? c.glyph : draftGlyph) : `<span class="fp-glyph" aria-hidden="true">${esc(c.glyph)}</span>`}
        <input type="text" class="fp-name-input" data-fp-name value="${esc(c ? c.name : '')}" placeholder="Name" aria-label="Name" maxlength="40" autocomplete="off" spellcheck="false">
        ${c && !c.builtIn ? `<button type="button" class="fp-delete" data-fp-delete="${esc(c.id)}">Delete</button>` : ''}
    </div>`;
    const head = (c) => (edit
        ? `<h4><button type="button" class="fp-head" data-fp-edit="${esc(c.id)}" title="Rename"><span class="fp-glyph" aria-hidden="true">${esc(listGlyph(c))}</span>${esc(c.name)}</button></h4>`
        : `<h4><span class="fp-glyph" aria-hidden="true">${esc(listGlyph(c))}</span>${esc(c.name)}</h4>`);
    const sections = groups.map((g) => {
        const c = g.collection, items = shownItems(g, { cap, expanded });
        const more = g.items.length - items.length;
        return `<section class="fp-group" data-fp-collection="${esc(c.id)}">${editing === c.id ? form(c) : head(c)}${items.length ? `<ul>${items.map((it) => itemHtml(it, activeId, idx)).join('')}</ul>` : ''}${more > 0 ? `<button type="button" class="fp-more" data-fp-more="${esc(c.id)}">${more.toLocaleString()} more</button>` : ''}</section>`;
    }).join('');
    const add = !edit ? '' : editing === 'new' ? `<section class="fp-group fp-new">${form(null)}</section>` : '<button type="button" class="fp-add" data-fp-new>New collection</button>';
    return sections + add;
}

/**
 * The list's state and editing: the records, which collection is being named, which
 * groups are open. `repaint()` draws the Go list again; `done()` hands focus back to it.
 */
export class FavoritesList {
    constructor({ app = null, repaint = () => {}, done = () => {} } = {}) {
        this.app = app; this.repaint = repaint; this.done = done;
        this.records = []; this.editing = null; this.draftGlyph = null; this.expanded = new Set();
        this.root = null;
    }

    get collections() { return this.app?.marks?.collections || []; }
    get edit() { return !VIEWER && !!this.app?.marks; }

    async load() {
        // A visitor's map has no favourites.
        if (visitorHides('favorites')) { this.records = []; this.repaint(); return; }
        const marks = this.app?.marks;
        try {
            if (marks) { await marks.load(); this.records = marks.records; }
            else this.records = (await this.app?.integrationManager?.database?.listFavorites?.()) || [];
        } catch (_) { this.records = marks?.records || []; }
        this.repaint();
    }

    /** The groups to draw: every collection while editing is possible, else those with items. */
    groups() {
        const trackById = new Map((this.app?._tracksCache || []).map((t) => [String(t.id), t]));
        const groups = collectionGroups(this.collections, this.records, { trackById });
        return this.edit ? groups : groups.filter((g) => g.items.length);
    }

    /** The listed items in order: the Go list's rows between Recent and Views. */
    shown(groups) { return groups.flatMap((g) => shownItems(g, { expanded: this.expanded })); }

    html(groups, { activeId = null, idx = null } = {}) {
        return collectionsListHtml(groups, { activeId, editing: this.editing, draftGlyph: this.draftGlyph, edit: this.edit, expanded: this.expanded, idx });
    }

    /** After a paint: a form being filled keeps the focus. */
    painted() { if (this.editing) this.root?.querySelector('[data-fp-name]')?.focus(); }

    reset() { this.editing = null; }

    _edit(id) {
        this.editing = id;
        this.draftGlyph = id === 'new' ? nextGlyph(this.collections) : this.collections.find((c) => c.id === id)?.glyph;
        this.repaint();
    }

    _stopEditing() {
        this.editing = null;
        this.repaint();
        this.done();
    }

    async _save(name) {
        const marks = this.app?.marks, id = this.editing;
        if (!marks || !id) return;
        try {
            if (!String(name || '').trim()) return this._stopEditing();
            if (id === 'new') await marks.create(name, this.draftGlyph);
            else await marks.rename(id, name, this.draftGlyph);
        } catch (err) { this.app?.showNotification?.(`Not saved: ${err?.message || err}`, 'error'); }
        this.records = marks.records;
        this._stopEditing();
    }

    async _delete(id) {
        const marks = this.app?.marks;
        const c = this.collections.find((x) => x.id === id);
        if (!marks || !c) return;
        try {
            const undo = await marks.remove(id);
            this.records = marks.records;
            this.editing = null;
            this.repaint();
            this.done();
            undoToast(`Deleted ${c.name}`, undo, { onUndone: () => { this.records = marks.records; this.repaint(); } });
        } catch (err) { this.app?.showNotification?.(`Not deleted: ${err?.message || err}`, 'error'); }
    }

    /** Naming a collection: Enter keeps it, Esc lets it go. True when the key was the form's. */
    keydown(e) {
        if (!e.target?.matches?.('[data-fp-name]')) return false;
        if (e.key === 'Enter') { e.preventDefault(); this._save(e.target.value); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this._stopEditing(); }
        return true;
    }

    /** A click on the list's own controls (a glyph, Delete, New collection, a heading, N more). Returns true, or the delete's promise, when it was one. */
    click(e) {
        const t = e.target;
        const glyph = t.closest?.('[data-fp-glyph]');
        if (glyph) {
            this.draftGlyph = glyph.dataset.fpGlyph;
            const name = this.root?.querySelector('[data-fp-name]')?.value;
            this.repaint();
            const input = this.root?.querySelector('[data-fp-name]');
            if (input && name != null) input.value = name;
            return true;
        }
        const del = t.closest?.('[data-fp-delete]');
        if (del) return this._delete(del.dataset.fpDelete).then(() => true);
        if (t.closest?.('[data-fp-new]')) { this._edit('new'); return true; }
        const head = t.closest?.('[data-fp-edit]');
        if (head) { this._edit(head.dataset.fpEdit); return true; }
        const more = t.closest?.('[data-fp-more]');
        if (more) { this.expanded.add(more.dataset.fpMore); this.repaint(); return true; }
        return false;
    }
}
