// The filter band's facet picker (filter band spec): a popover under a facet's button with a
// search field and a checkbox list of values with counts. Picked values list first; Only keeps
// one; Clear empties the facet. It mounts on the body, so the band can repaint under it: the
// app calls refresh() after each repaint and the picker re-anchors to the new button.
import { escapeHtml as esc } from './html.js';
import { ADDED_PRESETS, addedPreset, addedPresetKey, todayIso } from './added-window.js';

/** Lower case, accents off: the picker's search compares these. */
export const foldText = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The rows to draw: picked values first (pick order), then `values` in their order, narrowed by `query`. */
export function pickerRows({ values = [], active = [], counts = null, query = '', cap = 200 } = {}) {
    const q = foldText(query).trim();
    const on = new Set(active.map(String));
    const count = (v) => (counts && typeof counts.get === 'function' ? counts.get(v) || 0 : 0);
    const picked = active.map(String).map((value) => ({ value, count: count(value), on: true }));
    const rest = [];
    for (const v of values) {
        const value = String(v);
        if (!on.has(value)) rest.push({ value, count: count(value), on: false });
    }
    let all = [...picked, ...rest];
    if (q) {
        const scored = [];
        for (const row of all) {
            const at = foldText(row.value).indexOf(q);
            if (at < 0) continue;
            scored.push({ row, rank: at === 0 ? 0 : 1 });
        }
        all = scored.sort((a, b) => a.rank - b.rank || (b.row.on - a.row.on)).map((s) => s.row);
    }
    return { rows: all.slice(0, cap), more: Math.max(0, all.length - cap) };
}

/** The list and foot inside the popover (the field is drawn once, so typing never rebuilds it). */
export function pickerHtml({ label = '', rows = [], more = 0, active = [], query = '', swatches = null, escapeHtml = esc } = {}) {
    const e = escapeHtml;
    const list = rows.length
        ? rows.map((r) => {
            const swatch = swatches?.get?.(r.value.toLowerCase());
            const dot = swatch ? `<span class="pill-swatch" style="background:${e(swatch)}"></span>` : '';
            return `<div class="facet-row" role="option" aria-selected="${r.on}" tabindex="-1" data-picker-value="${e(r.value)}">`
                + `<span class="facet-box" aria-hidden="true"></span>${dot}<span class="facet-name">${e(r.value)}</span>`
                + `<span class="facet-n">${r.count || ''}</span>`
                + `<button type="button" class="facet-only" tabindex="-1" data-picker-only="${e(r.value)}">Only</button></div>`;
        }).join('')
        : `<p class="facet-empty">${query.trim() ? 'No matches' : 'Nothing to pick'}</p>`;
    const moreLine = more > 0 ? `<p class="facet-more">${more.toLocaleString('en-US')} more</p>` : '';
    const foot = active.length ? '<div class="facet-foot"><button type="button" data-picker-clear>Clear</button></div>' : '';
    return `<div class="facet-list" role="listbox" aria-multiselectable="true" aria-label="${e(label)}">${list}${moreLine}</div>${foot}`;
}

/** A facet's face in the band: its label, then its first value and +N. */
export function facetButtonHtml({ cat, label, active = [], escapeHtml = esc } = {}) {
    const e = escapeHtml;
    const face = active.length ? `${e(label)} <b>${e(active[0])}</b>${active.length > 1 ? ` +${active.length - 1}` : ''}` : e(label);
    return `<button type="button" class="filter-select facet-btn${active.length ? ' set' : ''}" data-filter-cat="${e(cat)}" aria-haspopup="listbox" aria-expanded="false">${face}</button>`;
}

/** The band's popover shell: on the body, under its button, closed by Esc (focus back on the
 *  button), a pointerdown elsewhere or a repaint that loses the button. Subclasses draw `.facet-body`. */
class BandPopover {
    constructor({ doc = document, onClose = () => {} } = {}) {
        this.doc = doc;
        this.onClose = onClose;
        this.pop = null;
        this.button = null;
        this.data = null;
        this._outside = (ev) => {
            if (!this.pop) return;
            const t = ev.target;
            if (this.pop.contains(t) || this.button?.contains(t)) return;
            this.close();
        };
        this._reposition = () => this._place();
    }

    get isOpen() { return !!this.pop; }

    /** The selector that finds this popover's button again after a repaint. */
    _selector() { return ''; }

    _mount(button, data, { label, head = '' }) {
        if (this.pop) this.close({ silent: true });
        this.button = button;
        this.data = data;
        const pop = this.pop = this.doc.createElement('div');
        pop.className = 'facet-pop';
        pop.setAttribute('role', 'dialog');
        pop.setAttribute('aria-label', label || '');
        pop.innerHTML = `${head}<div class="facet-body"></div>`;
        this.doc.body.appendChild(pop);
        pop.addEventListener('click', (ev) => this._onClick(ev));
        pop.addEventListener('input', (ev) => this._onInput(ev));
        pop.addEventListener('change', (ev) => this._onChange(ev));
        pop.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); this.close({ restoreFocus: true }); return; }
            // Tab leaves it closed: focus returns to the button, then Tab moves on from there.
            if (ev.key === 'Tab') { this.close({ restoreFocus: true }); return; }
            this._onKey(ev);
        });
        this.doc.addEventListener('pointerdown', this._outside, true);
        this.doc.defaultView?.addEventListener?.('resize', this._reposition);
        button?.setAttribute('aria-expanded', 'true');
        this._render();
        this._place();
    }

    /** After the band repaints: anchor to the new button and redraw with fresh `data`. */
    refresh(root, data) {
        if (!this.pop) return;
        const button = root?.querySelector?.(this._selector());
        if (!button) { this.close(); return; }
        const focused = this.doc.activeElement;
        const key = this.pop.contains(focused) ? this._focusKey(focused) : null;
        this.button = button;
        this.data = { ...this.data, ...data };
        button.setAttribute('aria-expanded', 'true');
        this._render();
        this._place();
        if (key) this.pop.querySelector(key)?.focus();
    }

    close({ restoreFocus = false, silent = false } = {}) {
        if (!this.pop) return false;
        this.pop.remove();
        this.pop = null;
        this.doc.removeEventListener('pointerdown', this._outside, true);
        this.doc.defaultView?.removeEventListener?.('resize', this._reposition);
        const button = this.button;
        button?.setAttribute('aria-expanded', 'false');
        if (restoreFocus) button?.focus();
        this.button = null;
        if (!silent) this.onClose();
        return true;
    }

    _place() {
        const pop = this.pop, button = this.button;
        if (!pop || !button?.getBoundingClientRect || !pop.getBoundingClientRect) return;
        const win = this.doc.defaultView;
        const r = button.getBoundingClientRect();
        const w = pop.getBoundingClientRect().width || 260;
        const maxX = (win?.innerWidth || 0) - w - 8;
        pop.style.left = `${Math.max(8, Math.min(r.left, maxX > 8 ? maxX : r.left))}px`;
        pop.style.top = `${r.bottom + 4}px`;
    }

    _focusKey() { return null; }
    _render() {}
    _onClick() {}
    _onInput() {}
    _onChange() {}
    _onKey() {}
}

export class FacetPicker extends BandPopover {
    /** `onToggle(cat, value)`, `onOnly(cat, value)`, `onClear(cat)`, `onClose()`. */
    constructor({ doc = document, onToggle = () => {}, onOnly = () => {}, onClear = () => {}, onClose = () => {}, cap = 200 } = {}) {
        super({ doc, onClose });
        this.handlers = { onToggle, onOnly, onClear };
        this.cap = cap;
    }

    get cat() { return this.data?.cat || null; }

    /** `data`: { cat, label, values, counts, active, swatches }. */
    open(button, data) {
        const label = esc(data.label || '');
        this._mount(button, data, { label: data.label, head: `<input type="search" class="facet-q" data-picker-q placeholder="${label}" aria-label="${label}" autocomplete="off" spellcheck="false">` });
        this.pop.querySelector('[data-picker-q]').focus();
    }

    _selector() { return `[data-filter-cat="${this.data.cat}"]`; }

    _focusKey(el) {
        const v = el.getAttribute?.('data-picker-value');
        return v == null ? null : `[data-picker-value="${String(v).replace(/["\\]/g, '\\$&')}"]`;
    }

    refresh(root, data) { super.refresh(root, data ? { ...data, cat: this.data?.cat } : data); }

    _query() { return this.pop?.querySelector('[data-picker-q]')?.value || ''; }

    _render() {
        const { values, counts, active = [], label, swatches } = this.data;
        const query = this._query();
        const { rows, more } = pickerRows({ values, active, counts, query, cap: this.cap });
        this.pop.querySelector('.facet-body').innerHTML = pickerHtml({ label, rows, more, active, query, swatches });
    }

    _onInput(ev) { if (ev.target.matches?.('[data-picker-q]')) this._render(); }

    _onClick(ev) {
        const t = ev.target;
        const cat = this.data.cat;
        const only = t.closest?.('[data-picker-only]');
        if (only) { ev.stopPropagation(); this.handlers.onOnly(cat, only.getAttribute('data-picker-only')); return; }
        if (t.closest?.('[data-picker-clear]')) { this.handlers.onClear(cat); return; }
        const row = t.closest?.('[data-picker-value]');
        if (row) this.handlers.onToggle(cat, row.getAttribute('data-picker-value'));
    }

    _onKey(ev) {
        const t = ev.target;
        const rows = [...this.pop.querySelectorAll('[data-picker-value]')];
        const field = this.pop.querySelector('[data-picker-q]');
        const at = rows.indexOf(t);
        const go = (el) => { if (el) { ev.preventDefault(); el.focus(); } };
        switch (ev.key) {
            case 'ArrowDown': return go(t === field ? rows[0] : rows[at + 1]);
            case 'ArrowUp': return go(at <= 0 ? field : rows[at - 1]);
            case 'Home': if (at >= 0) go(rows[0]); return;
            case 'End': if (at >= 0) go(rows.at(-1)); return;
            case ' ': case 'Enter':
                if (at >= 0) { ev.preventDefault(); this.handlers.onToggle(this.data.cat, t.getAttribute('data-picker-value')); }
                else if (t === field && ev.key === 'Enter' && rows.length === 1) { ev.preventDefault(); this.handlers.onToggle(this.data.cat, rows[0].getAttribute('data-picker-value')); }
                return;
            default:
        }
    }
}

/** Added's popover: 30 days, 90 days, This year, then From and To; `onRange({ from, to } | null)`. */
export class AddedPicker extends BandPopover {
    constructor({ doc = document, today = todayIso, onRange = () => {}, onClose = () => {} } = {}) {
        super({ doc, onClose });
        this.today = today;
        this.onRange = onRange;
    }

    /** `data`: { range }. */
    open(button, data) {
        this._mount(button, data, { label: 'Added' });
        this.pop.querySelector('[data-added-preset]')?.focus();
    }

    _selector() { return '[data-added-btn]'; }

    _focusKey(el) {
        for (const attr of ['data-added-preset', 'data-added-from', 'data-added-to']) {
            if (el.hasAttribute?.(attr)) return el.getAttribute(attr) ? `[${attr}="${el.getAttribute(attr)}"]` : `[${attr}]`;
        }
        return null;
    }

    _render() {
        const range = this.data.range || null;
        const current = addedPresetKey(range, this.today());
        const body = this.pop.querySelector('.facet-body');
        // The date fields are drawn once: a field being typed in must survive each live repaint.
        if (!body.querySelector('.facet-dates')) {
            body.innerHTML = '<div class="facet-list"></div>'
                + '<div class="facet-dates"><label>From <input type="date" data-added-from></label><label>To <input type="date" data-added-to></label></div>'
                + '<div data-added-foot></div>';
        }
        body.querySelector('.facet-list').innerHTML = ADDED_PRESETS.map(([key, label]) => `<button type="button" class="facet-row facet-preset" data-added-preset="${key}" aria-pressed="${current === key}">${label}</button>`).join('');
        for (const [sel, value] of [['[data-added-from]', range?.from], ['[data-added-to]', range?.to]]) {
            const input = body.querySelector(sel);
            if (input !== this.doc.activeElement) input.value = value || '';
        }
        body.querySelector('[data-added-foot]').innerHTML = range ? '<div class="facet-foot"><button type="button" data-picker-clear>Clear</button></div>' : '';
    }

    _onClick(ev) {
        const t = ev.target;
        const preset = t.closest?.('[data-added-preset]');
        if (preset) { this.onRange(addedPreset(preset.getAttribute('data-added-preset'), this.today())); return; }
        if (t.closest?.('[data-picker-clear]')) this.onRange(null);
    }

    _onChange(ev) {
        if (!ev.target.matches?.('[data-added-from], [data-added-to]')) return;
        // Chrome sends change at each digit of the year (0002, 0020, 0202): wait for a real one.
        if (/^0\d{3}-/.test(ev.target.value)) return;
        let from = this.pop.querySelector('[data-added-from]')?.value || '';
        let to = this.pop.querySelector('[data-added-to]')?.value || '';
        if (from && to && to < from) [from, to] = [to, from];
        this.onRange(from || to ? { from, to } : null);
    }
}
