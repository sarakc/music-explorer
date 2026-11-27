// Shared entity-card component used by Favorites, Discover's adjacency strip,
// and (eventually) the Go-further replacement. One card atom, three surfaces.
//
// The card is a small tile: a monogram tile (or image), entity name, a compact
// stat line, and an optional relationships row ("also on X, Y"). Actions are
// exposed as a wiring contract rather than hardcoded handlers so each surface
// can route clicks to whatever makes sense there.
import { escapeHtml } from './html.js';


// Deterministic monogram: first letter of each whitespace-separated word, up to 2.
// Falls back to '?' so empty input never renders an empty tile.
export function entityMonogram(name) {
    const s = String(name || '').trim();
    if (!s) return '?';
    const parts = s.split(/\s+/).filter(Boolean).slice(0, 2);
    return parts.map((p) => p[0].toUpperCase()).join('') || s[0].toUpperCase();
}

// Deterministic color from name so the monogram tile is stable across renders.
// Returns a hue (0..360); pair with --entity-monogram-* saturation/lightness.
export function entityHue(name) {
    const s = String(name || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 360;
}

/**
 * Render an entity card as an HTML string. Stateless — callers pass everything
 * they want on the card. `actions` is a bitmask of which buttons to include;
 * click routing is wired by `wireEntityCards` below using data-* attributes.
 *
 * @param {Object} opts
 * @param {'artist'|'label'|'album'|'tag'} opts.type
 * @param {string} opts.name
 * @param {string} [opts.subtitle]    Primary stat line, e.g. "42 tracks · 8 in Collection"
 * @param {string} [opts.imageUrl]    When set, replaces the monogram tile.
 * @param {{type:'artist'|'label', name:string}[]} [opts.related]
 * @param {string} [opts.relatedLabel]  Prefix for the relationships line. Default: "Also ".
 * @param {number} [opts.idx]         Stable index used by the wiring contract.
 * @param {Object} [opts.actions]     { dig:true, filter:true, unfav:true } etc.
 */
export function entityCardHtml(opts) {
    const {
        type, name, subtitle = '', imageUrl = '',
        related = [], relatedLabel = 'Also ', idx = 0,
        actions = { dig: true, filter: true, unfav: true },
        extraClass = '',
    } = opts;

    const mono = entityMonogram(name);
    const hue = entityHue(name);
    const tile = imageUrl
        ? `<span class="ec-tile ec-tile--image ec-tile--${type}" style="background-image:url('${escapeHtml(imageUrl)}')"></span>`
        : `<span class="ec-tile ec-tile--mono ec-tile--${type}" style="--ec-hue:${hue}">${escapeHtml(mono)}</span>`;

    const kindLabel = { label: 'Label', artist: 'Artist', album: 'Album', tag: 'Tag' }[type] || 'Artist';

    // Related entities render as mini-chips (tiny monogram + name, pill-shape)
    // rather than comma-separated flat links. Preserves the relationship signal
    // without feeling like body-text.
    const miniChip = (r) => {
        const rMono = entityMonogram(r.name);
        const rHue = entityHue(r.name);
        return `<a href="#" class="ec-rel-chip ec-rel-chip--${r.type}" data-ec-related-type="${r.type}" data-ec-related-name="${escapeHtml(r.name)}" title="${escapeHtml(r.name)}"><span class="ec-rel-tile ec-rel-tile--${r.type}" style="--ec-hue:${rHue}">${escapeHtml(rMono)}</span><span class="ec-rel-name">${escapeHtml(r.name)}</span></a>`;
    };
    const relatedHtml = related.length
        ? `<div class="ec-related"><span class="ec-related-kicker">${escapeHtml(relatedLabel)}</span><div class="ec-related-chips">${related.map(miniChip).join('')}</div></div>`
        : '';

    const btns = [];
    if (actions.dig) btns.push(`<button type="button" class="ec-action ec-action--dig" data-ec-action="dig" data-ec-idx="${idx}" title="Open in Discover">Discover</button>`);
    if (actions.filter) btns.push(`<button type="button" class="ec-action ec-action--filter" data-ec-action="filter" data-ec-idx="${idx}" title="Show in Collection">Collection</button>`);
    if (actions.unfav) btns.push(`<button type="button" class="ec-action ec-action--unfav" data-ec-action="unfav" data-ec-idx="${idx}" title="Remove from favorites" aria-label="Unfavorite">★</button>`);

    return `
        <article class="entity-card entity-card--${type} ${extraClass}" data-ec-idx="${idx}" data-ec-type="${type}" data-ec-name="${escapeHtml(name)}">
            <button type="button" class="ec-open" data-ec-action="open" data-ec-idx="${idx}" aria-label="Open ${kindLabel} page for ${escapeHtml(name)}">
                ${tile}
                <span class="ec-body">
                    <span class="ec-kind">${kindLabel}</span>
                    <span class="ec-name">${escapeHtml(name)}</span>
                    ${subtitle ? `<span class="ec-subtitle">${escapeHtml(subtitle)}</span>` : ''}
                </span>
            </button>
            ${relatedHtml}
            <div class="ec-actions">${btns.join('')}</div>
        </article>`;
}

/**
 * Wire click handlers on all entity cards inside `rootEl`. The handlers dispatch
 * to one of the callbacks passed in; the caller is responsible for routing
 * those callbacks to app-level navigation.
 *
 * @param {HTMLElement} rootEl
 * @param {Object} handlers
 * @param {(idx:number, el:HTMLElement)=>void} [handlers.onOpen]
 * @param {(idx:number, el:HTMLElement)=>void} [handlers.onDig]
 * @param {(idx:number, el:HTMLElement)=>void} [handlers.onFilter]
 * @param {(idx:number, el:HTMLElement)=>void} [handlers.onUnfav]
 * @param {(type:'artist'|'label', name:string)=>void} [handlers.onRelated]
 */
export function wireEntityCards(rootEl, handlers = {}) {
    if (!rootEl) return;
    rootEl.querySelectorAll('[data-ec-action]').forEach((el) => {
        el.addEventListener('click', (e) => {
            const action = el.dataset.ecAction;
            const idx = Number(el.dataset.ecIdx);
            const card = el.closest('.entity-card');
            if (action === 'open' && handlers.onOpen) { e.preventDefault(); handlers.onOpen(idx, card); }
            else if (action === 'dig' && handlers.onDig) { e.preventDefault(); e.stopPropagation(); handlers.onDig(idx, card); }
            else if (action === 'filter' && handlers.onFilter) { e.preventDefault(); e.stopPropagation(); handlers.onFilter(idx, card); }
            else if (action === 'unfav' && handlers.onUnfav) { e.preventDefault(); e.stopPropagation(); handlers.onUnfav(idx, card); }
        });
    });
    rootEl.querySelectorAll('[data-ec-related-name]').forEach((a) => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!handlers.onRelated) return;
            handlers.onRelated(a.dataset.ecRelatedType, a.dataset.ecRelatedName);
        });
    });
}
