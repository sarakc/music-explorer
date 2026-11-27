// The shared Tools list (Tagging, Cleanup › Formatting and Missing fields):
// one header row and the rows. Each row is ▶ · track · its fixes: one line in
// Tagging and Missing fields, one named line per field in Formatting, with
// proposal chips and typed boxes. Approve stages the selected rows' changes; nothing writes
// files here. Server contract: /api/tools/* (server/routes/tools.js).
import { PendingTagDiffs } from './pending-tag-diffs.js';
import { planStage, applyStagePlan } from './tool-staging.js';
import { parseGenre, validBpm, validYear } from './tool-rules.js';
import { escapeHtml as esc } from './html.js';

const PAGE = 200;
const ACCEPT_ALL = 0.8;
const FIELD_LABELS = { tags: 'Tags', label: 'Label', title: 'Title', artist: 'Artist', album: 'Album', genre: 'Genre', subgenre: 'Subgenre', bpm: 'BPM', year: 'Year', comments: 'Comments' };
const FIELD_ORDER = ['label', 'title', 'artist', 'genre', 'subgenre', 'bpm', 'year'];
const RULE_LABELS = { 'genre-grammar': 'Genre grammar', 'empty-separator': 'Empty separator', 'junk-scrub': 'Whitespace' };
const TOOL_LABELS = { tagging: 'Tagging', fields: 'Missing fields', formatting: 'Formatting' };

const n = (x) => Number(x || 0).toLocaleString();
const pct = (c) => `${Math.round(c * 100)}%`;
// Spaces show as ␣; a long run shows its length instead (`␣×24`).
const shownSpaces = (s) => esc(s).replace(/ {4,}/g, (m) => `␣×${m.length}`).replace(/ /g, '␣');

/** A Formatting chip: the value once, with what the fix removes struck and what it adds marked. */
export function inlineDiffHtml(before, after) {
    const a = String(before ?? ''), b = String(after ?? '');
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    let j = 0;
    while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
    const removed = a.slice(i, a.length - j), added = b.slice(i, b.length - j);
    return `${esc(a.slice(0, i))}${removed ? `<del>${shownSpaces(removed)}</del>` : ''}${added ? `<ins>${shownSpaces(added)}</ins>` : ''}${esc(a.slice(a.length - j))}`;
}

// The box names its field, since Missing fields' line carries no field names.
const boxPlaceholder = (field, row, hasChips) => {
    if (field === 'subgenre') return `${parseGenre(row.values?.genre).primary || 'Genre'}: …`;
    const name = FIELD_LABELS[field] || field;
    return hasChips ? `Other ${field === 'bpm' ? name : name.toLowerCase()}…` : `${name}…`;
};

export class ToolListView {
    constructor({ app, fetchImpl = (...a) => fetch(...a) }) {
        this.app = app;
        this.fetch = fetchImpl;
        this.state = new Map();      // id → { choices, selected, auto, conflict }
        this.declined = new Set();   // `${id}\u0000${kind}\u0000${value}` declined this session
        this.undeclined = new Set();
        this.removed = new Set();    // approved this session
        this.rendered = 0;
        this.lastClicked = null;
        this.resort = false;
    }

    get tool() { return this.route?.view; }

    async render(root, route) {
        this.root = root;
        this.route = route;
        this.state.clear();
        this.declined.clear();
        this.undeclined.clear();
        this.removed.clear();
        this.resort = false;
        root.innerHTML = '<div class="tool-list" data-tool-list><div class="tool-state">Loading…</div></div>';
        this.el = root.querySelector('[data-tool-list]');
        await this.load();
    }

    _query() {
        const r = this.route || {};
        const q = new URLSearchParams();
        for (const k of ['field', 'tag', 'rule', 'track']) if (r[k]) q.set(k, r[k]);
        if (r.declined) q.set('declined', '1');
        const s = q.toString();
        return s ? `?${s}` : '';
    }

    async load() {
        let data;
        try {
            const res = await this.fetch(`/api/tools/${this.tool}${this._query()}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            data = await res.json();
        } catch (err) {
            this.data = null;
            this.el.innerHTML = '<div class="tool-state">Couldn’t load this list. <button type="button" class="tool-link" data-retry>Retry</button></div>';
            this.el.querySelector('[data-retry]').addEventListener('click', () => this.render(this.root, this.route));
            return;
        }
        this.data = data;
        this.rows = data.tracks || [];
        this.byId = new Map(this.rows.map((r) => [r.id, r]));
        this.rendered = 0;
        await this._prepareAutocomplete();
        this._paint();
    }

    // ── Header ──────────────────────────────────────────────────────────

    _filterOptions() {
        const d = this.data, c = d.filterCounts || {};
        const opts = [{ value: '', label: `All · ${n(d.allTotal ?? d.total)}` }];
        if (this.tool === 'tagging') {
            const tags = Object.entries(c).filter(([k]) => k.startsWith('tag:')).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
            for (const [k, v] of tags) opts.push({ value: k, label: `${k.slice(4)} · ${n(v)}` });
        } else if (this.tool === 'fields') {
            for (const f of FIELD_ORDER) if (c[f]) opts.push({ value: `field:${f}`, label: `${FIELD_LABELS[f]} · ${n(c[f])}` });
        } else {
            for (const [rule, label] of Object.entries(RULE_LABELS)) if (c[rule]) opts.push({ value: `rule:${rule}`, label: `${label} · ${n(c[rule])}` });
        }
        if (c.declined || this.route.declined) opts.push({ value: 'declined', label: `Declined · ${n(c.declined)}` });
        return opts;
    }

    _filterValue() {
        const r = this.route;
        if (r.declined) return 'declined';
        if (r.tag) return `tag:${r.tag}`;
        if (r.field) return `field:${r.field}`;
        if (r.rule) return `rule:${r.rule}`;
        return '';
    }

    _selectedRows() { return this.rows.filter((r) => !this.removed.has(r.id) && this.state.get(r.id)?.selected); }

    _approveLabel() { return `Approve ${n(this._selectedRows().length)}`; }

    _headerHtml() {
        const value = this._filterValue();
        const options = this._filterOptions().map((o) => `<option value="${esc(o.value)}"${o.value === value ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
        const accept = this.rows.some((r) => r.problems.some((p) => p.proposals.length));
        return `<div class="tool-bar">
            <select class="tool-filter" data-filter aria-label="Filter">${options}</select>
            ${this.route.track ? '<button type="button" class="tool-link" data-show-all>Show all</button>' : ''}
            <span class="tool-sp"></span>
            <button type="button" class="tool-link" data-resort${this.resort ? '' : ' hidden'}>Re-sort</button>
            ${accept ? `<button type="button" class="tool-link" data-accept-all title="Accept every proposal at ${pct(ACCEPT_ALL)} or more">Accept all</button>` : ''}
            <button type="button" class="btn btn-sm tool-approve" data-approve${this._selectedRows().length ? '' : ' disabled'}>${this._approveLabel()}</button>
            <details class="tool-more"><summary aria-label="More">⋯</summary><div class="tool-menu"><button type="button" data-open-collection>Open in Collection</button></div></details>
        </div>`;
    }

    // ── Rows ────────────────────────────────────────────────────────────

    _st(id) {
        if (!this.state.has(id)) this.state.set(id, { choices: {}, selected: false, auto: false, conflict: false });
        return this.state.get(id);
    }

    _isDeclined(id, pr) {
        const key = `${id}\u0000${pr.decline.kind}\u0000${pr.decline.value}`;
        if (this.undeclined.has(key)) return false;
        return this.declined.has(key) || !!pr.declined;
    }

    _chipHtml(row, p, pr) {
        const st = this._st(row.id);
        const declined = this._isDeclined(row.id, pr);
        const field = p.kind === 'tags' ? 'tags' : p.field;
        const on = field === 'tags' ? !!st.choices.tags?.add?.includes(pr.value) : st.choices[field]?.via === 'chip' && st.choices[field].value === pr.value;
        const named = this.tool === 'fields' ? FIELD_LABELS[field] || field : '';
        const tip = [named, pr.confidence != null ? pct(pr.confidence) : '', ...(pr.reasons || [])].filter(Boolean).join(' · ');
        const body = this.tool === 'formatting' ? inlineDiffHtml(pr.before, pr.value) : esc(pr.value);
        return `<button type="button" class="tool-chip${on ? ' is-on' : ''}${declined ? ' is-declined' : ''}" data-chip data-field="${esc(field)}" data-value="${esc(pr.value)}" data-dkind="${esc(pr.decline.kind)}" data-dvalue="${esc(pr.decline.value)}" title="${esc(tip)}">${body}<span class="tool-x" data-decline aria-label="Decline" title="Decline">×</span></button>`;
    }

    /** One problem's chips and box. Formatting wraps each in a named line; the others share one line. */
    _partHtml(row, p) {
        const st = this._st(row.id);
        const field = p.kind === 'tags' ? 'tags' : p.field;
        const chips = p.proposals.map((pr) => this._chipHtml(row, p, pr)).join('');
        let tail = '';
        if (field === 'tags') {
            const typed = (st.choices.tags?.add || []).filter((t) => !p.proposals.some((pr) => pr.value === t));
            tail = typed.map((t) => `<button type="button" class="tool-typed" data-untype="tags" data-value="${esc(t)}" title="Remove">${esc(t)}</button>`).join('')
                + `<input class="tool-box" data-box="tags" placeholder="Add tag…" list="tool-dl-tags" aria-label="Add tag">`;
        } else if (this.tool === 'fields') {
            const c = st.choices[field];
            const name = FIELD_LABELS[field] || field;
            tail = c?.via === 'typed'
                ? `<button type="button" class="tool-typed" data-untype="${esc(field)}" title="${esc(name)} · click to clear">${esc(c.value)}</button>`
                : `<input class="tool-box" data-box="${esc(field)}" placeholder="${esc(boxPlaceholder(field, row, p.proposals.length))}" ${this._listAttr(field, row)} aria-label="${esc(name)}"${field === 'bpm' || field === 'year' ? ' inputmode="numeric"' : ''}>`;
        }
        const current = p.current?.length ? `<span class="tool-have">${p.current.map(esc).join(' · ')}</span>` : '';
        return `<span class="tool-part" data-line="${esc(field)}">${current}${chips}${tail}</span>`;
    }

    _fixesHtml(row) {
        if (this.tool === 'formatting') {
            return `<div class="tool-fixes is-named">${row.problems.map((p) => `<span class="tool-k">${esc(FIELD_LABELS[p.field] || p.field)}</span><span class="tool-line">${this._partHtml(row, p)}</span>`).join('')}</div>`;
        }
        return `<div class="tool-fixes"><span class="tool-line">${row.problems.map((p) => this._partHtml(row, p)).join('')}</span></div>`;
    }

    _listAttr(field, row) {
        if (field === 'label') return 'list="tool-dl-label"';
        if (field === 'genre') return 'list="tool-dl-genre"';
        if (field === 'subgenre') {
            const primary = parseGenre(row.values?.genre).primary.toLowerCase();
            return this.subgenreLists?.has(primary) ? `list="tool-dl-sub-${esc(this.subgenreLists.get(primary))}"` : '';
        }
        return '';
    }

    _rowHtml(row) {
        const st = this._st(row.id);
        const bpm = Number(row.bpm) ? ` · ${Math.round(Number(row.bpm))}` : '';
        const playing = this.app?.audioPlayer?.isCurrent?.(row.id);
        const title = row.title || '(untitled)';
        const full = [title, row.artist].filter(Boolean).join(' — ') + bpm;
        return `<div class="tool-row${st.selected ? ' is-selected' : ''}${playing ? ' is-playing' : ''}" data-row="${esc(row.id)}">
            <button type="button" class="tool-play" data-play aria-label="Play">▶</button>
            <div class="tool-track" data-select title="${esc(full)}"><span class="tool-title">${esc(title)}</span> <span class="tool-sub">${esc(row.artist)}${bpm}</span>${st.conflict ? ' <span class="tool-conflict">Changed, reload</span>' : ''}</div>
            ${this._fixesHtml(row)}
        </div>`;
    }

    _visibleRows() { return this.rows.filter((r) => !this.removed.has(r.id)); }

    _paint() {
        const rows = this._visibleRows();
        if (!rows.length) {
            const bare = !this.data.allTotal && !this.removed.size && !this.route.track;
            const message = this.route.track && !this.removed.size ? '<div class="tool-state" data-elsewhere>Nothing to fix here</div>' : '<div class="tool-state">Nothing to fix</div>';
            this.el.innerHTML = bare ? message : `${this._headerHtml()}${message}`;
            this._wireHeader();
            if (this.route.track) this._linkElsewhere();
            return;
        }
        const note = this.tool === 'tagging' && this.data.sources?.similarity === 'unavailable' ? '<div class="tool-note">Similar tracks not included</div>' : '';
        this.el.innerHTML = `${this._headerHtml()}${note}<div class="tool-list" data-list></div><div class="tool-more-rows" data-sentinel></div>`;
        this.list = this.el.querySelector('[data-list]');
        this.rendered = 0;
        this._renderMore();
        this._wireHeader();
        this._wireList();
        this._watchScroll();
        this._watchPlayer();
        this._watchKeys();
    }

    /** `T` focuses Add tag… on the playing row (Tagging). */
    _watchKeys() {
        if (this._onKey) document.removeEventListener('keydown', this._onKey);
        this._onKey = (e) => {
            if (this.tool !== 'tagging' || e.metaKey || e.ctrlKey || e.altKey || (e.key !== 't' && e.key !== 'T')) return;
            if (!this.el?.isConnected) return document.removeEventListener('keydown', this._onKey);
            if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
            const box = this.el.querySelector('.tool-row.is-playing [data-box="tags"]');
            if (!box) return;
            e.preventDefault();
            box.focus();
        };
        document.addEventListener('keydown', this._onKey);
    }

    _renderMore() {
        const rows = this._visibleRows().slice(this.rendered, this.rendered + PAGE);
        this.list.insertAdjacentHTML('beforeend', rows.map((r) => this._rowHtml(r)).join(''));
        this.rendered += rows.length;
        const sentinel = this.el.querySelector('[data-sentinel]');
        const left = this._visibleRows().length - this.rendered;
        if (sentinel) sentinel.innerHTML = left > 0 ? `<button type="button" class="tool-link" data-show-more>Show more</button>` : '';
    }

    _watchScroll() {
        this._io?.disconnect();
        const sentinel = this.el.querySelector('[data-sentinel]');
        sentinel?.addEventListener('click', (e) => { if (e.target.closest('[data-show-more]')) this._renderMore(); });
        if (typeof IntersectionObserver === 'undefined' || !sentinel) return;
        this._io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting) && this.rendered < this._visibleRows().length) this._renderMore(); }, { rootMargin: '600px' });
        this._io.observe(sentinel);
    }

    _watchPlayer() {
        this._unsubPlayer?.();
        const player = this.app?.audioPlayer;
        if (!player?.subscribe) return;
        this._unsubPlayer = player.subscribe(() => {
            if (!this.el?.isConnected) { this._unsubPlayer?.(); return; }
            this.el.querySelectorAll('[data-row]').forEach((r) => r.classList.toggle('is-playing', !!player.isCurrent?.(r.dataset.row)));
        });
    }

    destroy() { this._io?.disconnect(); this._unsubPlayer?.(); if (this._onKey) document.removeEventListener('keydown', this._onKey); }

    _rowEl(id) {
        return [...(this.list?.querySelectorAll('[data-row]') || [])].find((el) => el.dataset.row === String(id)) || null;
    }

    _repaintRow(id) {
        const row = this.byId.get(id);
        const el = this._rowEl(id);
        if (!row || !el) return;
        el.outerHTML = this._rowHtml(row);
    }

    _refreshApprove() {
        const btn = this.el.querySelector('[data-approve]');
        if (btn) { btn.textContent = this._approveLabel(); btn.disabled = !this._selectedRows().length; }
        const resort = this.el.querySelector('[data-resort]');
        if (resort) resort.hidden = !this.resort;
    }

    _hasChoices(st) { return Object.values(st.choices).some((c) => c && (c.value || c.add?.length)); }

    /** Touching a row selects it; undoing everything on a row selected that way deselects it. */
    _touched(id) {
        const st = this._st(id);
        if (this._hasChoices(st)) { if (!st.selected) { st.selected = true; st.auto = true; } }
        else if (st.auto) { st.selected = false; st.auto = false; }
    }

    // ── Wiring ──────────────────────────────────────────────────────────

    _navigate(patch) {
        const route = { view: this.tool };
        if (this.route.track && !('track' in patch)) route.track = this.route.track;
        Object.assign(route, patch);
        for (const k of Object.keys(route)) if (route[k] == null || route[k] === false) delete route[k];
        this.app.navigate(route);
    }

    _wireHeader() {
        const el = this.el;
        el.querySelector('[data-filter]')?.addEventListener('change', (e) => {
            const v = e.target.value;
            const patch = { field: null, tag: null, rule: null, declined: null };
            if (v === 'declined') patch.declined = true;
            else if (v.startsWith('field:')) patch.field = v.slice(6);
            else if (v.startsWith('tag:')) patch.tag = v.slice(4);
            else if (v.startsWith('rule:')) patch.rule = v.slice(5);
            this._navigate(patch);
        });
        el.querySelector('[data-show-all]')?.addEventListener('click', () => this._navigate({ track: null }));
        el.querySelector('[data-resort]')?.addEventListener('click', () => this.render(this.root, this.route));
        el.querySelector('[data-accept-all]')?.addEventListener('click', () => this.acceptAll());
        el.querySelector('[data-approve]')?.addEventListener('click', () => this.approve());
        el.querySelector('[data-open-collection]')?.addEventListener('click', () => {
            const ids = this._visibleRows().map((r) => r.id);
            this.app.filterEngine?.setIds(ids, TOOL_LABELS[this.tool] || 'Tools');
            this.app.navigate({ view: 'collection' });
        });
    }

    _wireList() {
        const list = this.list;
        list.addEventListener('click', (e) => this._onClick(e));
        list.addEventListener('keydown', (e) => {
            const box = e.target.closest('[data-box]');
            if (box && e.key === 'Enter') { e.preventDefault(); this._commitBox(box); }
            if (box && e.key === 'Escape') { box.value = ''; box.blur(); }
        });
        list.addEventListener('input', (e) => { const box = e.target.closest('[data-box]'); if (box) { box.classList.remove('is-invalid'); box.setCustomValidity?.(''); } });
        list.addEventListener('change', (e) => { const box = e.target.closest('[data-box]'); if (box && box.value.trim()) this._commitBox(box); });
    }

    _onClick(e) {
        const rowEl = e.target.closest('[data-row]');
        if (!rowEl) return;
        const id = rowEl.dataset.row;
        if (e.target.closest('[data-play]')) return this._play(id);
        const chip = e.target.closest('[data-chip]');
        if (chip) return e.target.closest('[data-decline]') ? this._decline(id, chip) : this._toggleChip(id, chip);
        const typed = e.target.closest('[data-untype]');
        if (typed) {
            const st = this._st(id);
            const field = typed.dataset.untype;
            if (field === 'tags') st.choices.tags.add = st.choices.tags.add.filter((t) => t !== typed.dataset.value);
            else delete st.choices[field];
            this._touched(id);
            this._repaintRow(id);
            this._refreshApprove();
            return;
        }
        if (e.target.closest('[data-select]')) this._select(id, e.shiftKey);
    }

    _select(id, range) {
        const visible = this._visibleRows().slice(0, this.rendered).map((r) => r.id);
        const ids = range && this.lastClicked && visible.includes(this.lastClicked)
            ? visible.slice(Math.min(visible.indexOf(this.lastClicked), visible.indexOf(id)), Math.max(visible.indexOf(this.lastClicked), visible.indexOf(id)) + 1)
            : [id];
        const on = !this._st(id).selected;
        for (const x of ids) { const st = this._st(x); st.selected = range ? true : on; st.auto = false; this._repaintRow(x); }
        this.lastClicked = id;
        this._refreshApprove();
    }

    _toggleChip(id, chip) {
        const st = this._st(id);
        const field = chip.dataset.field, value = chip.dataset.value;
        const key = `${id}\u0000${chip.dataset.dkind}\u0000${chip.dataset.dvalue}`;
        if (chip.classList.contains('is-declined')) return this._undecline(id, chip, key);
        if (field === 'tags') {
            st.choices.tags ||= { add: [] };
            const add = st.choices.tags.add;
            st.choices.tags.add = add.includes(value) ? add.filter((t) => t !== value) : [...add, value];
        } else if (st.choices[field]?.via === 'chip' && st.choices[field].value === value) delete st.choices[field];
        else st.choices[field] = { value, via: 'chip' };
        this._touched(id);
        this._repaintRow(id);
        this._refreshApprove();
    }

    async _decline(id, chip) {
        const body = { trackId: id, kind: chip.dataset.dkind, value: chip.dataset.dvalue };
        const key = `${id}\u0000${body.kind}\u0000${body.value}`;
        try {
            const res = await this.fetch('/api/tools/decline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (err) { this.app?.showNotification?.(`Couldn’t decline: ${err.message}`, 'error'); return; }
        this.declined.add(key);
        this.undeclined.delete(key);
        const st = this._st(id);
        const field = chip.dataset.field;
        if (field === 'tags' && st.choices.tags) st.choices.tags.add = st.choices.tags.add.filter((t) => t !== chip.dataset.value);
        else if (st.choices[field]?.via === 'chip' && st.choices[field].value === chip.dataset.value) delete st.choices[field];
        this._touched(id);
        this.resort = true;
        this._repaintRow(id);
        this._refreshApprove();
    }

    async _undecline(id, chip, key) {
        const body = { trackId: id, kind: chip.dataset.dkind, value: chip.dataset.dvalue };
        try {
            const res = await this.fetch('/api/tools/decline', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (err) { this.app?.showNotification?.(`Couldn’t undo: ${err.message}`, 'error'); return; }
        this.declined.delete(key);
        this.undeclined.add(key);
        this._repaintRow(id);
    }

    _commitBox(box) {
        const rowEl = box.closest('[data-row]');
        const id = rowEl.dataset.row;
        const field = box.dataset.box;
        const raw = box.value.trim().normalize('NFC');
        if (!raw) return;
        const value = field === 'tags' ? raw.replace(/[,\r\n\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim() : raw;
        if (field === 'bpm' && !validBpm(value)) { box.setCustomValidity?.('40–250'); box.reportValidity?.(); box.classList.add('is-invalid'); return; }
        if (field === 'year' && !validYear(value)) { box.setCustomValidity?.('1900 to next year'); box.reportValidity?.(); box.classList.add('is-invalid'); return; }
        const st = this._st(id);
        if (field === 'tags') {
            const row = this.byId.get(id);
            const have = (row.problems.find((p) => p.kind === 'tags')?.current || []).map((t) => t.toLowerCase());
            st.choices.tags ||= { add: [] };
            if (value && !have.includes(value.toLowerCase()) && !st.choices.tags.add.some((t) => t.toLowerCase() === value.toLowerCase())) st.choices.tags.add.push(value);
        } else st.choices[field] = { value, via: 'typed' };
        this._touched(id);
        this._repaintRow(id);
        this._refreshApprove();
        if (field === 'tags') this._rowEl(id)?.querySelector('[data-box="tags"]')?.focus();
    }

    acceptAll() {
        for (const row of this._visibleRows()) {
            const st = this._st(row.id);
            for (const p of row.problems) {
                const live = p.proposals.filter((pr) => !this._isDeclined(row.id, pr) && pr.confidence >= ACCEPT_ALL);
                if (!live.length) continue;
                if (p.kind === 'tags') {
                    st.choices.tags ||= { add: [] };
                    for (const pr of live) if (!st.choices.tags.add.includes(pr.value)) st.choices.tags.add.push(pr.value);
                } else if (!st.choices[p.field]) {
                    const top = [...live].sort((a, b) => b.confidence - a.confidence)[0];
                    st.choices[p.field] = { value: top.value, via: 'chip' };
                }
            }
            this._touched(row.id);
        }
        const target = Math.max(PAGE, this.rendered);
        this.list.innerHTML = '';
        this.rendered = 0;
        while (this.rendered < Math.min(target, this._visibleRows().length)) this._renderMore();
        this._refreshApprove();
    }

    async _play(id) {
        const all = await this.app._allTracks?.();
        const byId = new Map((all || []).map((t) => [String(t.id), t]));
        const queue = this._visibleRows().map((r) => byId.get(r.id)).filter(Boolean);
        const track = byId.get(id);
        if (!track) return;
        await this.app.playLocalTrack?.(track, queue, { key: `tools:${this.tool}`, kind: 'tools', label: TOOL_LABELS[this.tool], route: { view: this.tool } });
    }

    async approve() {
        const rows = this._selectedRows();
        if (!rows.length) return;
        const db = this.app.integrationManager?.database;
        if (!db) return;
        const btn = this.el.querySelector('[data-approve]');
        if (btn) btn.disabled = true;
        try {
            const diffs = await db.listPendingTagDiffs();
            const fresh = new Map();
            for (const r of rows) fresh.set(r.id, await db.getTrack(r.id));
            const plan = planStage(this.tool, rows.map((row) => ({ row, choices: this._st(row.id).choices })), { fresh, diffs, batchCap: this.data.batchCap || 2000 });
            const { approve, failed } = await applyStagePlan(plan, { pendingDiffs: new PendingTagDiffs(db) });
            if (approve.length) {
                const res = await this.fetch('/api/tools/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: this.tool, items: approve }) });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
            }
            for (const a of approve) { this.removed.add(a.trackId); this._rowEl(a.trackId)?.remove(); }
            for (const id of [...plan.conflicts, ...failed]) { this._st(id).conflict = true; this._repaintRow(id); }
            if (plan.overCap.length) this.app?.showNotification?.(`Apply first: the batch limit is ${n(this.data.batchCap || 2000)} tracks`, 'info');
            this.resort = true;
            await this.app?._refreshStaged?.();
        } catch (err) {
            this.app?.showNotification?.(`Couldn’t approve: ${err.message}`, 'error');
        } finally {
            if (btn) btn.disabled = !this._selectedRows().length;
            if (!this._visibleRows().length) this._paint();
            else this._refreshApprove();
        }
    }

    async _linkElsewhere() {
        const slot = this.el.querySelector('[data-elsewhere]');
        try {
            const res = await this.fetch(`/api/tools/track/${encodeURIComponent(this.route.track)}`);
            const { tools = [] } = await res.json();
            const links = tools.filter((t) => t.tool !== this.tool).map((t) => `<a href="#/${esc(t.tool)}?track=${encodeURIComponent(this.route.track)}">${esc(TOOL_LABELS[t.tool] || t.tool)}</a>`);
            if (slot && links.length) slot.insertAdjacentHTML('beforeend', ` · ${links.join(' · ')}`);
        } catch { /* the plain message stands */ }
    }

    // ── Autocomplete ────────────────────────────────────────────────────

    async _prepareAutocomplete() {
        if (this.tool === 'formatting') return;
        let tracks = [];
        try { tracks = (await this.app?._allTracks?.()) || []; } catch { tracks = []; }
        const labels = new Map(), genres = new Map(), subs = new Map();
        const bump = (m, k) => { if (k) m.set(k, (m.get(k) || 0) + 1); };
        for (const t of tracks) {
            if (t.availability !== 'local') continue;
            bump(labels, String(t.label || '').trim());
            const g = parseGenre(t.genre);
            bump(genres, g.primary);
            if (g.primary) {
                const key = g.primary.toLowerCase();
                if (!subs.has(key)) subs.set(key, new Map());
                for (const s of g.subs) bump(subs.get(key), s);
            }
        }
        const opts = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => `<option value="${esc(v)}">`).join('');
        this.subgenreLists = new Map([...subs.keys()].map((k, i) => [k, String(i)]));
        const vocab = this.data?.vocabulary || [];
        const html = `<datalist id="tool-dl-label">${opts(labels)}</datalist><datalist id="tool-dl-genre">${opts(genres)}</datalist>`
            + [...subs.entries()].map(([k, m]) => `<datalist id="tool-dl-sub-${this.subgenreLists.get(k)}">${opts(m)}</datalist>`).join('')
            + `<datalist id="tool-dl-tags">${vocab.map((v) => `<option value="${esc(v.tag)}">`).join('')}</datalist>`;
        let holder = document.getElementById('toolDatalists');
        if (!holder) { holder = document.createElement('div'); holder.id = 'toolDatalists'; holder.hidden = true; document.body.appendChild(holder); }
        holder.innerHTML = html;
    }
}
