// Cleanup › Discogs: ambiguous artists and labels, heaviest first, each with its
// Discogs candidates as chips. One click on a chip picks it (the Links editor's
// write, POST /api/links/:id/discogs, source 'manual'); "None of these" marks the
// row as having no match; clicking the picked chip again puts it back. Rows stay
// where they are until the list is reloaded. Drawn with the shared list's classes
// (tool-list.css). Server: GET /api/tools/identities (server/routes/tools.js).
import { escapeHtml as esc } from './html.js';
import { openSite } from './site-links.js';

const PAGE = 200;
const n = (x) => Number(x || 0).toLocaleString();
const TYPE_LABELS = { artist: 'Artists', label: 'Labels' };

export const discogsUrl = (type, id) => `https://www.discogs.com/${type}/${encodeURIComponent(id)}`;

export class IdentityListView {
    constructor({ app, fetchImpl = (...a) => fetch(...a) }) {
        this.app = app;
        this.fetch = fetchImpl;
        this.picked = new Map(); // entity id → candidate id, or 'none'
        this.failed = new Set();
    }

    async render(root, route = {}) {
        this.root = root;
        this.route = route;
        this.picked.clear();
        this.failed.clear();
        root.innerHTML = '<div class="tool-list is-entities" data-identity-list><div class="tool-state">Loading…</div></div>';
        this.el = root.querySelector('[data-identity-list]');
        await this.load();
    }

    async load() {
        try {
            const q = this.route.type ? `?type=${encodeURIComponent(this.route.type)}` : '';
            const res = await this.fetch(`/api/tools/identities${q}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.data = await res.json();
        } catch (_) {
            this.data = null;
            this.el.innerHTML = '<div class="tool-state">Couldn’t load this list. <button type="button" class="tool-link" data-retry>Retry</button></div>';
            this.el.querySelector('[data-retry]').addEventListener('click', () => this.render(this.root, this.route));
            return;
        }
        this.rows = this.data.rows || [];
        this.byId = new Map(this.rows.map((r) => [r.id, r]));
        this._paint();
    }

    _headerHtml() {
        const c = this.data.filterCounts || {};
        const opts = [['', `All · ${n(this.data.allTotal)}`], ...Object.entries(TYPE_LABELS).filter(([t]) => c[t]).map(([t, label]) => [t, `${label} · ${n(c[t])}`])];
        const value = this.route.type || '';
        return `<div class="tool-bar"><select class="tool-filter" data-filter aria-label="Filter">${opts.map(([v, label]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select><span class="tool-sp"></span></div>`;
    }

    _chipHtml(row, c) {
        const pick = this.picked.get(row.id);
        const cls = pick === c.id ? ' is-on' : pick ? ' is-declined' : c.plain ? ' is-suggested' : '';
        return `<button type="button" class="tool-chip${cls}" data-pick="${esc(c.id)}" data-name="${esc(c.name)}" title="${esc(`Discogs ${row.type} ${c.id}`)}">${esc(c.name)}<span class="tool-x" data-open aria-label="Open on Discogs" title="Open on Discogs">↗</span></button>`;
    }

    _rowHtml(row) {
        const pick = this.picked.get(row.id);
        const tip = `${row.name} · ${row.tracks === 1 ? '1 track' : `${n(row.tracks)} tracks`}`;
        return `<div class="tool-row" data-row="${esc(row.id)}">
            <div class="tool-track" title="${esc(tip)}"><span class="tool-title">${esc(row.name)}</span> <span class="tool-sub">${esc(row.type)}</span>${this.failed.has(row.id) ? ' <span class="tool-conflict">Couldn’t save</span>' : ''}</div>
            <div class="tool-fixes"><span class="tool-line">${row.candidates.map((c) => this._chipHtml(row, c)).join('')}<button type="button" class="tool-chip is-none${pick === 'none' ? ' is-on' : pick ? ' is-declined' : ''}" data-none>None of these</button></span></div>
        </div>`;
    }

    _paint() {
        if (!this.rows.length) {
            this.el.innerHTML = `${this.data.allTotal ? this._headerHtml() : ''}<div class="tool-state">Nothing to fix</div>`;
            this._wireHeader();
            return;
        }
        this.el.innerHTML = `${this._headerHtml()}<div class="tool-list" data-list></div><div class="tool-more-rows" data-sentinel></div>`;
        this.list = this.el.querySelector('[data-list]');
        this.rendered = 0;
        this._renderMore();
        this._wireHeader();
        this.list.addEventListener('click', (e) => this._onClick(e));
        this.el.querySelector('[data-sentinel]')?.addEventListener('click', (e) => { if (e.target.closest('[data-show-more]')) this._renderMore(); });
    }

    _renderMore() {
        const rows = this.rows.slice(this.rendered, this.rendered + PAGE);
        this.list.insertAdjacentHTML('beforeend', rows.map((r) => this._rowHtml(r)).join(''));
        this.rendered += rows.length;
        const sentinel = this.el.querySelector('[data-sentinel]');
        if (sentinel) sentinel.innerHTML = this.rendered < this.rows.length ? '<button type="button" class="tool-link" data-show-more>Show more</button>' : '';
    }

    _wireHeader() {
        this.el.querySelector('[data-filter]')?.addEventListener('change', (e) => {
            const route = { view: 'identities' };
            if (e.target.value) route.type = e.target.value;
            this.app?.navigate?.(route);
        });
    }

    _repaint(id) {
        const el = [...this.list.querySelectorAll('[data-row]')].find((r) => r.dataset.row === id);
        const row = this.byId.get(id);
        if (el && row) el.outerHTML = this._rowHtml(row);
    }

    async _onClick(e) {
        const rowEl = e.target.closest('[data-row]');
        const row = rowEl && this.byId.get(rowEl.dataset.row);
        if (!row) return;
        const chip = e.target.closest('[data-pick]');
        if (chip && e.target.closest('[data-open]')) {
            e.stopPropagation();
            openSite(discogsUrl(row.type, chip.dataset.pick), 'discogs');
            return;
        }
        const was = this.picked.get(row.id);
        let body, next;
        if (chip) {
            next = was === chip.dataset.pick ? null : chip.dataset.pick;
            body = next ? { action: 'set', id: next, name: chip.dataset.name } : { action: 'reopen' };
        } else if (e.target.closest('[data-none]')) {
            next = was === 'none' ? null : 'none';
            body = next ? { action: 'remove' } : { action: 'reopen' };
        } else return;
        // Shown at once; put back if the write fails.
        if (next) this.picked.set(row.id, next); else this.picked.delete(row.id);
        this.failed.delete(row.id);
        this._repaint(row.id);
        try {
            const res = await this.fetch(`/api/links/${encodeURIComponent(row.id)}/discogs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (_) {
            if (was) this.picked.set(row.id, was); else this.picked.delete(row.id);
            this.failed.add(row.id);
            this._repaint(row.id);
        }
    }
}
