// The selection bar, bottom left of the map: where you've been (the trail and Shuffle this
// walk), what you're on (its shape, name and Info), then ways to listen (▶ and the sites).
// Spec: docs/specs/2026-11-22-graph-explore-design.md. The pure helpers come first.
import { siteLinks } from '../site-links.js';
import { escapeHtml as esc } from '../html.js';
import { VIEWER, visitorHides } from '../viewer-profile.js';
import { markSvg } from '../kind-glyph.js';
import { PLAYER_ICONS, isLocalPlayable } from '../player.js';
import { nodeTracks } from './node-play.js';

export const TRAIL_MAX = 4;
const SITES = ['bandcamp', 'youtube', 'discogs'];
const STEP_MS = 8000; // a click's step still counts when its selection lands this late
const ICON = {
    play: '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" fill="currentColor"/></svg>',
    info: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v4M8 4.8v.1" stroke-linecap="round" stroke-width="1.6"/></svg>',
    bandcamp: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 12.5 5.6 3.5H15l-4.6 9z" fill="currentColor"/></svg>',
    youtube: '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="3.5" width="14" height="9" rx="2.5" fill="currentColor"/><path d="M6.6 6v4L10 8z" fill="var(--bg-raised)"/></svg>',
    discogs: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><circle cx="8" cy="8" r="3.4"/><circle cx="8" cy="8" r=".9" fill="currentColor"/></svg>',
    scope: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M3 4.5h10M3 8h10M3 11.5h10"/></svg>',
};

/** How close a step was: 1 for the nearest of the neighbours it left, 0 for the loosest; null when it left the first ring. */
export function closeness(from, toId) {
    const ranked = [...(from?.hood?.values?.() || [])].filter((n) => n?.score != null).sort((a, b) => b.score - a.score);
    const at = ranked.findIndex((n) => n.id === toId);
    if (at < 0) return null;
    return ranked.length < 2 ? 1 : 1 - at / (ranked.length - 1);
}

/** A join's length in px: short for a close step, long for a loose one, longest for a leap. */
export function joinPx(c) { return c == null ? 26 : Math.round(5 + (1 - c) * 17); }

/**
 * The trail after a new selection. Back to a step on it cuts it there; a step taken on the
 * map keeps the selection it left (at most TRAIL_MAX); a jump (Random, search, Shuffle, an
 * address) starts over. `previous` carries its `colour`.
 */
export function stepTrail(trail, { previous = null, focus = null, step = false } = {}) {
    if (!focus?.id) return trail;
    const at = trail.findIndex((t) => t.id === focus.id);
    if (at >= 0) return trail.slice(0, at);
    if (previous?.id === focus.id) return trail;
    if (!step || !previous?.id) return [];
    const crumb = { id: previous.id, name: previous.name || '', type: previous.type || 'artist', colour: previous.colour || null, toNext: closeness(previous, focus.id) };
    return [...trail, crumb].slice(-TRAIL_MAX);
}

/** Shuffle this walk: the tracks of every step and the selection, once each, playable only. */
export function walkPool({ nodes = [], lit = [], tracks = [], playable = () => true } = {}) {
    const seen = new Set(), pool = [];
    for (const n of nodes) {
        if (!n?.id || n.outside) continue;
        for (const t of nodeTracks({ node: { id: n.id, type: n.type, name: n.name }, lit, tracks })) {
            const id = String(t.id);
            if (seen.has(id) || !playable(t)) continue;
            seen.add(id); pool.push(t);
        }
    }
    return pool;
}

const glyph = (type, colour, owned = true) => {
    const c = String(colour || '').startsWith('#') ? colour : null;
    return `<svg class="ab-glyph" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">${markSvg(type || 'artist', 6, 6, type === 'label' ? 3.6 : 4, { fill: c, soft: c, owned })}</svg>`;
};

export class SelectionBar {
    constructor(view) {
        this.v = view; this.trail = []; this.pending = null; this.walkHover = null; this.el = null;
        this._links = new Map(); // id → { bandcamp, discogs } found for an owned artist or label
    }

    /** The bar's element, after each render of the map. */
    mount(el) {
        this.el = el;
        if (!el) return;
        el.addEventListener('click', (e) => this._click(e));
        el.addEventListener('pointerover', (e) => { const b = e.target.closest?.('[data-step]'); if (b) this._hoverWalk(Number(b.dataset.step)); else if (e.target.closest?.('.ab-trail')) this._hoverWalk(-1); });
        el.addEventListener('pointerleave', () => this._hoverWalk(null));
        // The map's pointer handlers must not see presses on the bar.
        for (const t of ['pointerdown', 'mousedown', 'dblclick', 'wheel', 'contextmenu']) el.addEventListener(t, (e) => e.stopPropagation());
        this.render();
    }

    /** A click on the map is about to select another node: the step starts from here. */
    markStep(fromId) { this.pending = { from: fromId || null, at: Date.now() }; }

    onFocus(previous) {
        const f = this.v.focus, p = this.pending;
        this.pending = null;
        const step = Boolean(p && previous && p.from === previous.id && Date.now() - p.at < STEP_MS);
        const left = previous ? { ...previous, colour: this._colour(previous) } : null;
        this.trail = stepTrail(this.trail, { previous: left, focus: f, step });
        this.render();
    }

    onClear() { this.trail = []; this.pending = null; this.render(); }

    _colour(node) {
        const a = this.v.atlas, fills = this.v.fills;
        if (!a || !fills || !node) return null;
        const host = typeof node.host === 'string' ? node.host : node.host?.id;
        const own = a.byId.get(node.id) || (host && a.byId.get(host));
        return own ? fills[own.i] || null : null;
    }

    _infoOpen() { return Boolean(this.v.app?.rightSlot?.shows?.('details') && this.v.app?.panel?.isOpen); }

    _pool() {
        if (VIEWER) return [];
        const v = this.v;
        return walkPool({ nodes: [...this.trail, v.focus], lit: v._litTracks || [], tracks: v._tracks || [], playable: isLocalPlayable });
    }

    render() {
        const el = this.el, f = this.v.focus;
        if (!el) return;
        if (!f?.id) { el.hidden = true; el.innerHTML = ''; return; }
        const here = this._colour(f);
        const outside = Boolean(f.outside);
        const known = this._links.get(f.id) || {};
        const links = siteLinks({ type: outside ? (f.type === 'release' ? 'release' : f.type) : f.type, name: f.name || '', artist: f.artist || '', bandcamp: known.bandcamp, discogs: known.discogs })
            .filter((l) => SITES.includes(l.site))
            .sort((a, b) => SITES.indexOf(a.site) - SITES.indexOf(b.site));
        const trail = this.trail.map((t, i) => {
            const next = this.trail[i + 1]?.colour || here;
            return `<button type="button" class="ab-step" data-step="${i}" aria-label="Back to ${esc(t.name)}" data-name="${esc(t.name)}">${glyph(t.type, t.colour)}</button>`
                + `<i class="ab-join${t.toNext == null ? ' is-far' : ''}" style="--a:${t.colour || 'var(--text-faint)'};--b:${next || 'var(--text-faint)'};width:${joinPx(t.toNext)}px"></i>`;
        }).join('');
        const walk = this.trail.length && this._pool().length
            ? `<button type="button" class="ab-btn ab-walk" data-act="walk" title="Shuffle this walk" aria-label="Shuffle this walk">${PLAYER_ICONS.shuffle.replace('<svg ', '<svg width="13" height="13" ')}</button>` : '';
        const play = !VIEWER && !outside ? `<button type="button" class="ab-btn ab-play" data-act="play" title="Play (Enter)" aria-label="Play">${ICON.play}</button>` : '';
        // Scope: the selection and the rings it shows become what the table lists and the graph lights (scope.js). Collection only.
        const scoped = Boolean(this.v.scoped?.());
        const around = !VIEWER && !outside && !this.v.discover
            ? `<button type="button" class="ab-btn ab-scope" data-act="scope" title="Scope (s)" aria-label="Scope" aria-pressed="${scoped}">${ICON.scope}</button>`
            : '';
        const list = this.v.discover ? '<button type="button" class="ab-btn" data-act="list" title="Discover list" aria-label="Discover list">☰</button>' : '';
        el.innerHTML = (walk || trail ? `<span class="ab-trail">${walk}${trail}</span>` : '')
            + `<button type="button" class="ab-now" data-act="centre" style="--c:${here || 'var(--text-faint)'}" title="Centre">${glyph(f.type, here, !outside)}<span class="ab-name">${esc(f.name || '')}</span></button>`
            + `<button type="button" class="ab-btn ab-info" data-act="info" title="Info (i)" aria-label="Info" aria-pressed="${this._infoOpen()}">${ICON.info}</button>`
            + '<span class="ab-sep"></span>'
            + play + around
            + `<span class="site-links ab-sites">${links.map((l) => `<a class="ab-btn${l.searched ? ' is-search' : ''}" href="${esc(l.href)}" target="umm-${l.site}" rel="noopener" data-site="${l.site}" data-key="${l.key}" title="${esc(l.searched ? `Search ${l.label}` : l.label)} (${l.key})" aria-label="${esc(l.label)}">${ICON[l.site]}</a>`).join('')}</span>`
            + list;
        el.hidden = false;
        this._linked(f);
    }

    /** An owned artist's or label's linked Bandcamp page and Discogs identity replace the searches, as in Info. */
    async _linked(f) {
        if (f.outside || !['artist', 'label'].includes(f.type) || this._links.has(f.id) || visitorHides('links')) return;
        this._links.set(f.id, {});
        try {
            const res = await fetch(`/api/links/${encodeURIComponent(f.id)}`);
            if (!res.ok) return;
            const { links = {} } = await res.json();
            const found = {
                bandcamp: links.bandcamp?.state === 'linked' ? links.bandcamp.url || undefined : undefined,
                discogs: links.discogs?.state === 'linked' && links.discogs.url ? { type: f.type, id: String(links.discogs.url).split('/').pop() } : undefined,
            };
            this._links.set(f.id, found);
            if (this.v.focus?.id === f.id && (found.bandcamp || found.discogs)) this.render();
        } catch (_) { /* the searches stay */ }
    }

    _click(e) {
        const step = e.target.closest?.('[data-step]');
        if (step) { const t = this.trail[Number(step.dataset.step)]; if (t) this.v.focusOn(t.id); return; }
        const act = e.target.closest?.('[data-act]')?.dataset.act;
        const v = this.v, f = v.focus;
        if (!act || !f) return;
        if (act === 'play') v.playNode(v._lastView?.byId.get(f.id) || f);
        else if (act === 'info') this.toggleInfo();
        else if (act === 'centre') v.recenter?.();
        else if (act === 'list') v.app?.rightSlot?.open?.('discover');
        else if (act === 'scope') v.scopeHere?.();
        else if (act === 'walk') {
            const pool = this._pool();
            if (pool.length) v.app.playLocalTrack(null, pool, { key: `graph:walk:${f.id}`, kind: 'collection', label: `Walk to ${f.name}`, route: { view: 'collection', graph: true, focus: f.id } }, { shuffle: true });
        }
    }

    /** ⓘ and `i`: Info on the selection, or closed again. */
    toggleInfo() {
        const slot = this.v.app?.rightSlot;
        if (this._infoOpen()) slot?.collapse?.({ restoreFocus: false });
        else this.v.showInfo();
        this.el?.querySelector('[data-act="info"]')?.setAttribute('aria-pressed', String(this._infoOpen()));
    }

    /** The bar's keys: Backspace steps back along the trail, `i` is Info, `s` Scope. True when it took the key. */
    key(e) {
        if (!this.v.focus || e.metaKey || e.ctrlKey || e.altKey) return false;
        if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return false;
        if (e.key === 'Backspace' && this.trail.length) { this.v.focusOn(this.trail[this.trail.length - 1].id); return true; }
        if (e.key === 'i' && !e.shiftKey) { this.toggleInfo(); return true; }
        if (e.key === 's' && !e.shiftKey && !VIEWER && !this.v.discover && !this.v.focus.outside) { this.v.scopeHere?.(); return true; }
        return false;
    }

    // ---- the walk on the map ----

    _hoverWalk(index) {
        const was = this.walkHover?.index ?? null;
        this.walkHover = index == null ? null : { index };
        if (was !== index) this.v._dirty?.();
    }

    /** While the trail is hovered: the route through its steps, dotted, and a ring on the hovered step. Nothing at rest. */
    drawWalk(ctx, view) {
        const v = this.v;
        if (!this.walkHover || !view || !ctx || !this.trail.length) return;
        const spot = (id) => {
            const it = view.byId.get(id);
            if (it) return { x: it.sx, y: it.sy, r: it.r };
            const fs = view.focusScreen;
            return id === v.focus?.id && fs ? { x: fs.x, y: fs.y, r: fs.r } : null;
        };
        const pts = [...this.trail, { ...v.focus, colour: this._colour(v.focus) }].map((n) => ({ n, p: spot(n.id) })).filter((x) => x.p);
        if (pts.length < 2) return;
        const ink = (v.canvas && globalThis.getComputedStyle?.(v.canvas).getPropertyValue('--text-dim').trim()) || '#5e5b54';
        ctx.save();
        ctx.lineWidth = 1.4; ctx.setLineDash([1.5, 4]); ctx.lineCap = 'round'; ctx.strokeStyle = ink;
        ctx.beginPath();
        pts.forEach(({ p }, i) => {
            if (!i) { ctx.moveTo(p.x, p.y); return; }
            const q = pts[i - 1].p, dx = p.x - q.x, dy = p.y - q.y, bend = 0.18 * (i % 2 ? 1 : -1); // a gentle swoop, alternating sides
            ctx.quadraticCurveTo((q.x + p.x) / 2 - dy * bend, (q.y + p.y) / 2 + dx * bend, p.x, p.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        const on = this.trail[this.walkHover.index]?.id;
        for (const { n, p } of pts) {
            const hit = n.id === on;
            ctx.beginPath(); ctx.arc(p.x, p.y, (p.r || 4) + (hit ? 6 : 3.5), 0, Math.PI * 2);
            ctx.strokeStyle = hit ? n.colour || ink : ink; ctx.lineWidth = hit ? 2 : 1; ctx.globalAlpha = hit ? 1 : 0.5;
            ctx.stroke(); ctx.globalAlpha = 1;
        }
        ctx.restore();
    }
}
