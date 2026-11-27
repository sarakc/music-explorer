// The rule builder: a DOM-free controller over the two-level rule structure
// plus a thin dialog that binds inputs to it. Rows are labelled by source
// (gigs · this collection · Discogs · audio analysis) and show the reason a
// rule cannot run yet, so the builder never hides what the filter will skip.

import { FIELDS, OPS, emptyRules, compileGroups } from './filter-rules.js';
import { entityId } from './credits-graph.js';
import { escapeHtml } from './html.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

// Escape should only dismiss the topmost in-app dialog.
const isTopmostBackdrop = (backdrop) => {
    const all = document.querySelectorAll('.enrich-backdrop');
    return all.length > 0 && all[all.length - 1] === backdrop;
};

export function defaultValue(field, op) {
    const spec = FIELDS[field];
    if (!spec) return '';
    if (op === 'between' && spec.num) return { min: null, max: null };
    switch (spec.kind) {
        case 'range': return { min: null, max: null };
        case 'date': return op === 'between' ? { from: '', to: '' } : { days: 90 };
        case 'gig': return op === 'in-no-gig' ? null : op === 'in-lane' ? { gigId: '', laneName: '' } : { gigId: '' };
        case 'evidence': return 'analysis';
        case 'co-occurs': return { tag: '', min: 2 };
        case 'relation': return { entity: '', kinds: [], hops: 1 };
        case 'audio': return { trackId: '', max: 0.2 };
        default: return '';
    }
}

const FIELD_ORDER = ['tag', 'artist', 'label', 'album', 'genre', 'subgenre', 'year', 'source', 'key', 'key-compatible', 'bpm', 'added', 'title', 'artist-text', 'album-text', 'comments', 'any-text', 'gig', 'evidence-missing', 'co-occurs', 'relation', 'audio-neighbour'];

export class FilterBuilderController {
    constructor({ rules = null, options = {}, gigs = [], skipped = [] } = {}) {
        this.rules = rules && Array.isArray(rules.groups) ? clone(rules) : emptyRules();
        if (!this.rules.groups.length) this.addGroup('all');
        this.options = options || {};
        this.gigs = Array.isArray(gigs) ? gigs : [];
        this.skipped = skipped;
    }

    setJoin(join) { this.rules.join = join === 'any' ? 'any' : 'all'; }
    setGroupJoin(g, join) { const group = this.rules.groups[g]; if (group) group.join = join === 'any' ? 'any' : 'all'; }
    addGroup(join = 'all') {
        this.rules.groups.push({ join: join === 'any' ? 'any' : 'all', rules: [] });
        this.addRule(this.rules.groups.length - 1, 'tag');
    }
    removeGroup(g) { this.rules.groups.splice(g, 1); }
    addRule(g, field = 'tag') {
        const group = this.rules.groups[g];
        if (!group) return;
        const op = FIELDS[field]?.ops[0] || 'is';
        group.rules.push({ field, op, value: defaultValue(field, op) });
    }
    updateRule(g, r, patch = {}) {
        const rule = this.rules.groups[g]?.rules[r];
        if (!rule) return;
        if (patch.field && patch.field !== rule.field) {
            rule.field = patch.field;
            rule.op = FIELDS[patch.field]?.ops[0] || 'is';
            rule.value = defaultValue(rule.field, rule.op);
        }
        if (patch.op && patch.op !== rule.op) {
            rule.op = patch.op;
            const kind = FIELDS[rule.field]?.kind;
            const shapeChanges = FIELDS[rule.field]?.num && (patch.op === 'between') !== (typeof rule.value === 'object' && rule.value !== null);
            if (kind === 'date' || kind === 'gig' || shapeChanges) rule.value = defaultValue(rule.field, rule.op);
        }
        if ('value' in patch) rule.value = patch.value;
    }
    removeRule(g, r) { const group = this.rules.groups[g]; if (group) group.rules.splice(r, 1); }

    problems() {
        return compileGroups(this.rules).skipped.map((s) => ({ g: s.groupIndex, r: s.ruleIndex, reason: s.reason }));
    }

    _laneNames(gigId) {
        const lanes = gigId ? (this.gigs.find((g) => String(g.id) === String(gigId))?.playlists || []) : this.gigs.flatMap((g) => g.playlists || []);
        return [...new Set(lanes.filter((l) => l && !l.isBpmRoll).map((l) => String(l.name || '')).filter(Boolean))];
    }

    _valueHtml(g, r, rule, key) {
        const spec = FIELDS[rule.field] || {};
        const v = rule.value;
        const sel = (attr, items, current, { placeholder = '' } = {}) =>
            `<select data-fb-${attr}="${key}">${placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : ''}${items.map((it) => `<option value="${escapeHtml(it.value)}"${String(it.value) === String(current ?? '') ? ' selected' : ''}>${escapeHtml(it.label)}</option>`).join('')}</select>`;
        switch (spec.kind) {
            case 'facet': {
                if (rule.op === 'between' && spec.num) return `<input type="number" data-fb-min="${key}" value="${v?.min ?? ''}" placeholder="from" inputmode="numeric"> – <input type="number" data-fb-max="${key}" value="${v?.max ?? ''}" placeholder="to" inputmode="numeric">`;
                const list = spec.facet === 'keys' ? 'fb-keys' : `fb-${spec.facet}`;
                return `<input type="text" data-fb-value="${key}" list="${list}" value="${escapeHtml(v)}" placeholder="value">`;
            }
            case 'key-compatible':
                return `<input type="text" data-fb-value="${key}" list="fb-keys" value="${escapeHtml(v)}" placeholder="key">`;
            case 'text':
                return `<input type="text" data-fb-value="${key}" value="${escapeHtml(v)}" placeholder="text">`;
            case 'range':
                return `<input type="number" data-fb-min="${key}" value="${v?.min ?? ''}" placeholder="min" inputmode="decimal"> – <input type="number" data-fb-max="${key}" value="${v?.max ?? ''}" placeholder="max" inputmode="decimal">`;
            case 'date':
                return rule.op === 'between'
                    ? `<input type="date" data-fb-from="${key}" value="${escapeHtml(v?.from || '')}"> – <input type="date" data-fb-to="${key}" value="${escapeHtml(v?.to || '')}">`
                    : `<input type="number" data-fb-days="${key}" value="${v?.days ?? ''}" min="1" step="1"> days`;
            case 'gig': {
                if (rule.op === 'in-no-gig') return '';
                const gigSel = sel('gig', this.gigs.map((gg) => ({ value: gg.id, label: gg.name || 'Untitled' })), v?.gigId, { placeholder: rule.op === 'in-lane' ? 'any gig' : 'pick a gig' });
                if (rule.op === 'in-gig') return gigSel;
                return `${gigSel} ${sel('lane', this._laneNames(v?.gigId).map((n) => ({ value: n, label: n })), v?.laneName, { placeholder: 'playlist' })}`;
            }
            case 'evidence':
                return sel('value', [{ value: 'analysis', label: 'audio analysis' }, { value: 'credits', label: 'Discogs credits' }, { value: 'identity', label: 'Discogs identity' }], v);
            case 'co-occurs':
                return `<input type="text" data-fb-tag="${key}" list="fb-tags" value="${escapeHtml(v?.tag || '')}" placeholder="tag"> in at least <input type="number" data-fb-count="${key}" value="${v?.min ?? 2}" min="1" step="1"> tracks`;
            case 'relation':
                return `<input type="text" data-fb-entity="${key}" list="fb-entities" value="${escapeHtml(v?.entity || '')}" placeholder="artist:… or label:…"> within ${sel('hops', [{ value: 1, label: '1 hop' }, { value: 2, label: '2 hops' }], v?.hops ?? 1)}`;
            case 'audio':
                return `<input type="text" data-fb-track="${key}" value="${escapeHtml(v?.trackId || '')}" placeholder="track id" disabled>`;
            default:
                return '';
        }
    }

    toHtml() {
        const problems = new Map(this.problems().map((p) => [`${p.g}:${p.r}`, p.reason]));
        const joinToggle = (attr, key, current) => `<span class="fb-join" role="group"><button type="button" class="fb-join-btn${current === 'all' ? ' is-active' : ''}" data-fb-${attr}="${key}" data-join="all">all</button><button type="button" class="fb-join-btn${current === 'any' ? ' is-active' : ''}" data-fb-${attr}="${key}" data-join="any">any</button></span>`;
        const groups = this.rules.groups.map((group, g) => {
            const rows = group.rules.map((rule, r) => {
                const key = `${g}:${r}`;
                const spec = FIELDS[rule.field] || { ops: [], label: rule.field };
                const fieldSel = `<select data-fb-field="${key}">${FIELD_ORDER.filter((f) => FIELDS[f]).map((f) => `<option value="${f}"${f === rule.field ? ' selected' : ''}>${escapeHtml(FIELDS[f].label)}</option>`).join('')}</select>`;
                const opSel = `<select data-fb-op="${key}">${spec.ops.map((op) => `<option value="${op}"${op === rule.op ? ' selected' : ''}>${escapeHtml(OPS[op]?.label || op)}</option>`).join('')}</select>`;
                const source = spec.source ? `<span class="fb-source">${escapeHtml(spec.source)}</span>` : '';
                const reason = problems.has(key) ? `<span class="fb-reason">${escapeHtml(problems.get(key))}</span>` : '';
                return `<div class="fb-row" data-fb-row="${key}">${fieldSel}${opSel}<span class="fb-value">${this._valueHtml(g, r, rule, key)}</span>${source}${reason}<button type="button" class="fb-remove" data-fb-remove-rule="${key}" aria-label="Remove rule">×</button></div>`;
            }).join('');
            return `<section class="fb-group" data-fb-group="${g}"><header class="fb-group-head"><span>match ${joinToggle('group-join', g, group.join)} of</span><button type="button" class="fb-remove" data-fb-remove-group="${g}" aria-label="Remove group">×</button></header>${rows}<button type="button" class="link-chip chip-sm" data-fb-add-rule="${g}">+ rule</button></section>`;
        }).join('');
        const datalists = ['artists', 'labels', 'albums', 'genres', 'subgenres', 'tags', 'years', 'sources', 'keys'].map((facet) =>
            `<datalist id="fb-${facet}">${(this.options[facet] || []).map((v) => `<option value="${escapeHtml(v)}">`).join('')}</datalist>`).join('');
        const entities = [...(this.options.artists || []).map((n) => ({ id: entityId('artist', n), label: `Artist · ${n}` })), ...(this.options.labels || []).map((n) => ({ id: entityId('label', n), label: `Label · ${n}` }))];
        const entityList = `<datalist id="fb-entities">${entities.map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.label)}</option>`).join('')}</datalist>`;
        return `<div class="fb-top">groups match ${joinToggle('join', 'top', this.rules.join)}</div>${groups}<button type="button" class="link-chip chip-sm" data-fb-add-group>+ group</button>${datalists}${entityList}`;
    }
}

// Reads one input event into a controller patch. Returns true when the rule
// structure changed (field/op/join/add/remove), which re-renders the body.
function applyInput(controller, el) {
    const d = el.dataset;
    const at = (key) => key.split(':').map(Number);
    const num = (v) => (v === '' || v == null ? null : Number(v));
    const rule = (key) => { const [g, r] = at(key); return controller.rules.groups[g]?.rules[r]; };
    if (d.fbJoin !== undefined) { controller.setJoin(d.join); return true; }
    if (d.fbGroupJoin !== undefined) { controller.setGroupJoin(Number(d.fbGroupJoin), d.join); return true; }
    if (d.fbAddGroup !== undefined) { controller.addGroup('all'); return true; }
    if (d.fbAddRule !== undefined) { controller.addRule(Number(d.fbAddRule)); return true; }
    if (d.fbRemoveRule !== undefined) { const [g, r] = at(d.fbRemoveRule); controller.removeRule(g, r); return true; }
    if (d.fbRemoveGroup !== undefined) { controller.removeGroup(Number(d.fbRemoveGroup)); return true; }
    if (d.fbField !== undefined) { const [g, r] = at(d.fbField); controller.updateRule(g, r, { field: el.value }); return true; }
    if (d.fbOp !== undefined) { const [g, r] = at(d.fbOp); controller.updateRule(g, r, { op: el.value }); return true; }
    const key = d.fbValue ?? d.fbMin ?? d.fbMax ?? d.fbFrom ?? d.fbTo ?? d.fbDays ?? d.fbGig ?? d.fbLane ?? d.fbTag ?? d.fbCount ?? d.fbEntity ?? d.fbHops ?? d.fbTrack;
    if (key === undefined) return false;
    const [g, r] = at(key);
    const current = rule(key);
    if (!current) return false;
    const v = current.value && typeof current.value === 'object' ? { ...current.value } : current.value;
    let structural = false;
    if (d.fbValue !== undefined) controller.updateRule(g, r, { value: el.value });
    else if (d.fbMin !== undefined) controller.updateRule(g, r, { value: { ...v, min: num(el.value) } });
    else if (d.fbMax !== undefined) controller.updateRule(g, r, { value: { ...v, max: num(el.value) } });
    else if (d.fbFrom !== undefined) controller.updateRule(g, r, { value: { ...v, from: el.value } });
    else if (d.fbTo !== undefined) controller.updateRule(g, r, { value: { ...v, to: el.value } });
    else if (d.fbDays !== undefined) controller.updateRule(g, r, { value: { days: num(el.value) ?? 0 } });
    else if (d.fbGig !== undefined) { controller.updateRule(g, r, { value: { ...v, gigId: el.value, ...(current.op === 'in-lane' ? { laneName: '' } : {}) } }); structural = true; }
    else if (d.fbLane !== undefined) controller.updateRule(g, r, { value: { ...v, laneName: el.value } });
    else if (d.fbTag !== undefined) controller.updateRule(g, r, { value: { ...v, tag: el.value } });
    else if (d.fbCount !== undefined) controller.updateRule(g, r, { value: { ...v, min: num(el.value) ?? 1 } });
    else if (d.fbEntity !== undefined) controller.updateRule(g, r, { value: { ...v, entity: el.value } });
    else if (d.fbHops !== undefined) controller.updateRule(g, r, { value: { ...v, hops: num(el.value) ?? 1 } });
    else if (d.fbTrack !== undefined) controller.updateRule(g, r, { value: { ...v, trackId: el.value } });
    return structural;
}

export function openFilterBuilder({ app, rules, options = {}, gigs = [], onApply } = {}) {
    const controller = new FilterBuilderController({ rules, options, gigs });
    const backdrop = document.createElement('div');
    backdrop.className = 'enrich-backdrop fb-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'enrich-dialog fb-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Filter rules');
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape' && isTopmostBackdrop(backdrop)) close(); };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    dialog.innerHTML = `
        <header class="enrich-head fb-head"><h2>Filter rules</h2><p class="muted">Groups of rules. A rule that cannot run yet says why and is skipped.</p></header>
        <div class="enrich-body fb-body"></div>
        <footer class="enrich-foot fb-foot"><div class="enrich-foot-left"><span class="fb-summary muted"></span></div><div class="enrich-foot-right"><button type="button" class="btn btn-sm btn-secondary" data-fb-cancel>Cancel</button><button type="button" class="btn btn-sm" data-fb-apply>Apply</button></div></footer>`;
    const body = dialog.querySelector('.fb-body');
    const summary = dialog.querySelector('.fb-summary');
    const paint = (focusKey = null) => {
        body.innerHTML = controller.toHtml();
        const n = controller.problems().length;
        summary.textContent = n ? `${n} rule${n === 1 ? '' : 's'} will be skipped` : '';
        if (focusKey) body.querySelector(`[${focusKey.attr}="${focusKey.value}"]`)?.focus();
    };
    const refresh = (el) => {
        const attr = Object.keys(el.dataset).find((k) => k.startsWith('fb'));
        const key = attr ? { attr: `data-${attr.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, value: el.dataset[attr] } : null;
        paint(key);
    };
    body.addEventListener('click', (e) => {
        const el = e.target.closest('[data-fb-join],[data-fb-group-join],[data-fb-add-group],[data-fb-add-rule],[data-fb-remove-rule],[data-fb-remove-group]');
        if (!el || !body.contains(el)) return;
        if (applyInput(controller, el)) paint();
    });
    body.addEventListener('change', (e) => {
        const el = e.target;
        if (!el.matches('select, input')) return;
        applyInput(controller, el);
        refresh(el); // a value change can clear or raise a row's reason
    });
    body.addEventListener('input', (e) => {
        const el = e.target;
        if (!el.matches('input[type="text"], input[type="number"], input[type="date"]')) return;
        applyInput(controller, el);
    });
    dialog.querySelector('[data-fb-cancel]')?.addEventListener('click', () => close());
    dialog.querySelector('[data-fb-apply]')?.addEventListener('click', () => { close(); onApply?.(controller.rules); });
    paint();
    return { controller, close };
}
