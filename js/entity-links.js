// Entity links — one markup contract + one click router for every navigable
// object in the app: artist, album, label, tag, BPM, track.
//
// Any surface that shows one of these renders it with `entityLinkHtml` and
// wires its container once with `wireEntityLinks`. Clicking then lands on
// the same destination no matter where the name appeared (Collection table,
// gig playlist, review queue, entity pages, …).
//
//   artist / album / label / tag  → that entity's page
//   bpm                           → Collection filtered to the BPM bucket
//   year / key                    → Collection filtered to that year / key
//   track                         → the track page

import { VIEW_LABELS } from './router.js';
import { escapeHtml } from './html.js';
export { VIEW_LABELS } from './router.js';


export const ENTITY_TYPES = new Set(['artist', 'album', 'label', 'tag', 'bpm', 'year', 'key', 'track']);

/** A year a link can filter by: four digits, as `year:` in the hash holds (router.js). */
export const isFilterYear = (y) => /^\d{4}$/.test(String(y ?? '').trim()) && Number(y) >= 1000;

/** Whole-number BPM bucket: 124.6 → 124.00–124.99. Null when not a positive number. */
export function bpmBucket(bpm) {
    const n = Number(bpm);
    if (!Number.isFinite(n) || n <= 0) return null;
    const lo = Math.floor(n);
    return { min: lo, max: lo + 0.99 };
}

/**
 * Render a navigable entity as an anchor. Returns plain escaped `text` when
 * there is no name so callers never emit a dead link.
 *
 * @param {Object} o
 * @param {'artist'|'album'|'label'|'tag'|'bpm'|'track'} o.type
 * @param {string|number} o.name   Routing key: the name, or the id for tracks, or the numeric BPM.
 * @param {string} [o.artist]      Album links carry their artist for page resolution.
 * @param {string} [o.text]        Display text. Defaults to the name (rounded for BPM).
 * @param {string} [o.extraClass]
 * @param {string} [o.title]
 */
export function entityLinkHtml({ type, name, artist = '', text, extraClass = '', title } = {}) {
    const key = name == null ? '' : String(name).trim();
    const display = text != null ? String(text) : (type === 'bpm' ? String(Math.round(Number(key))) : key);
    if (!key || !ENTITY_TYPES.has(type) || (type === 'year' && !isFilterYear(key))) return escapeHtml(display);
    const cls = `entity-link entity-link--${type}${extraClass ? ` ${extraClass}` : ''}`;
    const artistAttr = type === 'album' && artist ? ` data-entity-artist="${escapeHtml(artist)}"` : '';
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<a href="#" class="${cls}" data-entity-type="${type}" data-entity-name="${escapeHtml(key)}"${artistAttr}${titleAttr}>${escapeHtml(display)}</a>`;
}

/** Resolve the entity link at or above `el`, or null. */
export function readEntityLink(el) {
    const link = el && typeof el.closest === 'function' ? el.closest('[data-entity-type]') : null;
    if (!link) return null;
    const { entityType: type, entityName: name = '', entityArtist: artist = '' } = link.dataset || {};
    return { type, name, artist };
}

/** Route a resolved link to the app. Returns true when something was opened. */
export function openEntity(app, link) {
    if (!app || !link || !link.name) return false;
    const { type, name, artist } = link;
    switch (type) {
        case 'artist': case 'label': case 'tag': app.navigate({ view: type, name }); return true;
        case 'album': app.navigate({ view: 'album', name, artist: artist || '' }); return true;
        case 'track': app.navigate({ view: 'track', id: name }); return true;
        case 'bpm': {
            const bpm = Number(name);
            if (!Number.isFinite(bpm) || bpm <= 0) return false;
            app.filterCollectionByBpm(bpm);
            return true;
        }
        case 'year': {
            if (!isFilterYear(name)) return false;
            app.filterCollectionByYear(Number(name));
            return true;
        }
        case 'key': app.filterCollectionByKey(String(name).trim()); return true;
        default: return false;
    }
}

/**
 * Install one delegated click handler on `root`. Clicks on entity links are
 * routed through `openEntity` and swallowed so row-level handlers (drag,
 * select, expand) don't also fire. Returns an unsubscribe function.
 */
export function wireEntityLinks(root, app) {
    if (!root || typeof root.addEventListener !== 'function') return () => {};
    const onClick = (e) => {
        const link = readEntityLink(e.target);
        if (!link) return;
        e.preventDefault();
        e.stopPropagation();
        openEntity(app, link);
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
}

/** Breadcrumb text for the view an entity page will return to on back. */
export function backLabelFor(route) {
    return route?.name || route?.label || VIEW_LABELS[route?.view] || 'Collection';
}
