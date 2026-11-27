/**
 * Pure builders for the Collection page header: the tab controls, the ⋯ menu
 * model, the filter band and the filter line. No `document` access.
 */
import { facetButtonHtml } from './facet-picker.js';
import { addedFace, todayIso } from './added-window.js';

export { addedPreset, addedFace } from './added-window.js';
import { serializeFilter } from './router.js';
import { subgraphLabel } from './graph/subgraph.js';
import { scopeFor } from './header-profiles.js';
import { GROUPINGS } from './track-groups.js';

export { scopeFor };

export const COLLECTION_VIEWS = ['collection', 'artists', 'albums', 'labels', 'tags', 'playlists'];

/** The band's controls in its order. `more` ones sit behind More unless they hold a value. */
export const FILTER_CONTROLS = [
    { key: 'genres', label: 'Genre' }, { key: 'subgenres', label: 'Subgenre' }, { key: 'tags', label: 'Tag' },
    { key: 'years', label: 'Year' }, { key: 'bpm', label: 'BPM' }, { key: 'dateAdded', label: 'Added' },
    { key: 'artists', label: 'Artist', more: true }, { key: 'albums', label: 'Album', more: true },
    { key: 'labels', label: 'Label', more: true }, { key: 'keys', label: 'Key', more: true },
    { key: 'camelot', label: 'Camelot', more: true }, { key: 'sources', label: 'Source', more: true },
];

const FACET_KEYS = ['genres', 'subgenres', 'artists', 'albums', 'labels', 'tags', 'sources', 'years', 'keys'];

/** The filter state a routed view opens with. Moving among the six Collection
 *  views with the same `f` keeps the live state object, so its session fields
 *  (the saved filter it came from) survive a tab switch. A `saved:<id>` link
 *  is the same filter when the live state holds that saved filter's rules.
 *  Any other filter, an unreadable link, or another scope opens the route's
 *  own, keeping the frozen id list. */
export function routeFilterState(route, { activeScope, state, empty }) {
    const scope = scopeFor(route.view);
    const asked = route.filter || null;
    const sameSaved = asked?.savedRules
        ? !!state?.rules && state.crateId === asked.savedRules && (asked.search || '') === (state.search || '')
        : serializeFilter(asked) === serializeFilter(state);
    const same = !!state && scope === activeScope && !asked?.invalidFilter && sameSaved;
    if (same) return { scope, state };
    const base = asked || empty();
    return { scope, state: { ...base, ids: state?.ids ?? null } };
}

export function readFilterRows(saved) {
    const known = new Set(FILTER_CONTROLS.map((c) => c.key));
    const hidden = Array.isArray(saved?.hidden) ? saved.hidden.filter((k) => known.has(k)) : [];
    return { hidden: new Set(hidden) };
}

function hasValue(key, state) {
    if (key === 'camelot') return !!state.camelotCompatible;
    if (key === 'bpm') return !!state.bpmRange;
    if (key === 'dateAdded') return !!state.dateAddedRange;
    if (key === 'years') return !!state.yearRange || !!state.years?.length;
    return !!state[key]?.length;
}

export function visibleControls(rows, state = {}) {
    return FILTER_CONTROLS.map((c) => c.key).filter((k) => !rows.hidden.has(k) || hasValue(k, state));
}

export function activeConditionCount(state = {}) {
    let n = 0;
    for (const k of FACET_KEYS) n += state[k]?.length || 0;
    if (state.bpmRange) n += 1;
    if (state.yearRange) n += 1;
    if (state.camelotCompatible) n += 1;
    if (state.dateAddedRange) n += 1;
    if (state.matchMode === 'any') n += 1;
    return n;
}

export function subtitleText({ total, filtered, scoped, unit = 'tracks' }) {
    const fmt = (n) => Number(n).toLocaleString('en-US');
    return scoped ? `${fmt(filtered)} of ${fmt(total)} ${unit}` : `${fmt(total)} ${unit}`;
}

/** The tab controls. `star` and `menu` follow the view's header profile;
 *  `before` and `after` are a view's own controls, either side of Filter.
 *  ☆ is one click while one favourites collection is in use; with more
 *  (`favMenu`) it opens a menu of them. `favLabel` is its face (☆, ★, ★♥…). */
export function controlsHtml({ favOnly, favLabel = favOnly ? '★' : '☆', favMenu = false, filterCount, bandOpen, star = true, menu = true, before = '', after = '', viewSwitch = '' }) {
    const on = bandOpen || filterCount ? ' on' : '';
    const badge = filterCount > 0 ? ` <span class="n">${filterCount}</span>` : '';
    const fav = favMenu
        ? `<button type="button" class="ctl${favOnly ? ' is-fav-on' : ''}" data-fav-only aria-haspopup="true" aria-label="Favorites" title="Favorites">${favLabel}</button>`
        : `<button type="button" class="ctl" data-fav-only aria-pressed="${favOnly ? 'true' : 'false'}" aria-label="Favorites only" title="Favorites only (*)">${favLabel}</button>`;
    return '<div class="tab-controls">'
        + viewSwitch
        + before
        + (star ? fav : '')
        + `<button type="button" class="ctl${on}" data-filter-toggle aria-expanded="${bandOpen ? 'true' : 'false'}">Filter${badge}</button>`
        + after
        + (menu ? '<button type="button" class="ctl" data-header-menu aria-label="More">⋯</button>' : '')
        + '</div>';
}

/** `insights` / `soundIssues` are the toggle's checked state, or undefined
 *  to leave the entry out; `tagReplacements` gates its entry. Adding the
 *  filter results to a playlist or gig lives on the Gigs tab's foot line.
 *  These stand in for the old toggles row until Charts and Tools take them.
 *  Columns, Artwork and Density belong to the Tracks table; on a graph
 *  (`graph`) they go, and Play all and Shuffle all take the lit tracks. */
export function menuItems({ view, graph = false, showArt, scoped, insights, soundIssues, tagReplacements, group, exploreme }) {
    const table = !graph && (view === 'collection' || view === 'exploreme');
    const items = [];
    if (table) items.push({ key: 'columns', label: 'Columns' });
    items.push({ key: 'filters', label: 'Filters' });
    // Tracks' Group: a radio list under its heading; `group` is the current one.
    if (group !== undefined) {
        items.push({ key: 'group', label: 'Group', heading: true });
        for (const [id, label] of GROUPINGS) items.push({ key: `group:${id}`, label, radio: true, checked: group === id });
    }
    if (table) items.push({ key: 'artwork', label: 'Artwork', checked: !!showArt }, { key: 'density', label: 'Density' });
    items.push({ key: 'play-all', label: 'Play all' }, { key: 'shuffle-all', label: 'Shuffle all' });
    if (scoped) items.push({ key: 'chart-slice', label: 'Chart this slice' });
    if (insights !== undefined) items.push({ key: 'insights', label: 'Insights', checked: !!insights });
    if (soundIssues !== undefined) items.push({ key: 'sound-issues', label: 'Sound issues', checked: !!soundIssues });
    // Tracks with `exploreme` in Comments: shown by default, in both views.
    if (exploreme !== undefined) items.push({ key: 'exploreme', label: 'Exploreme tracks', checked: !!exploreme });
    if (tagReplacements) items.push({ key: 'tag-replacements', label: 'Tag replacements' });
    return items;
}

export function savedChips(crates, { activeCrateId = null, modified = false } = {}) {
    return [...(crates || [])]
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.createdAt || 0) - (b.createdAt || 0))
        .map((c) => {
            const on = c.id === activeCrateId;
            return { id: c.id, name: c.name, on, modified: on && !!modified };
        });
}

/** A small histogram of `values`, 20 buckets (BPM and Year). It starts at the 1st percentile,
 *  so a few stray low values do not squeeze the rest into one bar. */
export function sparklineSvg(span) {
    if (!span || !span.values || span.values.length === 0) return '';
    const buckets = 20;
    const sorted = [...span.values].sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.01)];
    const width = Math.max(1, span.max - lo);
    const counts = new Array(buckets).fill(0);
    for (const v of sorted) if (v >= lo) counts[Math.min(buckets - 1, Math.floor(((v - lo) / width) * buckets))]++;
    let peak = 1;
    for (const c of counts) if (c > peak) peak = c;
    const w = 80, h = 18, bw = w / buckets;
    const bars = counts.map((c, i) => {
        const bh = (c / peak) * h;
        return `<rect x="${(i * bw).toFixed(2)}" y="${(h - bh).toFixed(2)}" width="${(bw - 0.5).toFixed(2)}" height="${bh.toFixed(2)}"/>`;
    }).join('');
    return `<svg class="filter-bpm-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${bars}</svg>`;
}

function controlHtml(key, { options, state, escapeHtml, today }) {
    const def = FILTER_CONTROLS.find((c) => c.key === key);
    const label = escapeHtml(def.label);
    if (key === 'bpm') {
        const r = state.bpmRange || {};
        const cls = state.bpmRange ? 'filter-bpm set' : 'filter-bpm';
        return `<span class="${cls}"><input type="number" data-bpm-min placeholder="BPM" value="${r.min ?? ''}" aria-label="BPM min"> – `
            + `<input type="number" data-bpm-max placeholder="BPM" value="${r.max ?? ''}" aria-label="BPM max">${sparklineSvg(options?.bpm)}</span>`;
    }
    if (key === 'years') {
        const r = state.yearRange || {};
        const cls = state.yearRange ? 'filter-bpm filter-year set' : 'filter-bpm filter-year';
        return `<span class="${cls}">${label} <input type="number" data-year-min placeholder="from" value="${r.min ?? ''}" aria-label="Year from" inputmode="numeric"> – `
            + `<input type="number" data-year-max placeholder="to" value="${r.max ?? ''}" aria-label="Year to" inputmode="numeric">${sparklineSvg(options?.yearSpan)}</span>`;
    }
    if (key === 'camelot') {
        const cls = state.camelotCompatible ? 'filter-select set' : 'filter-select';
        return `<label class="${cls}"><input type="checkbox" data-camelot${state.camelotCompatible ? ' checked' : ''}> ${label}</label>`;
    }
    if (key === 'dateAdded') {
        const face = addedFace(state.dateAddedRange, today);
        return `<button type="button" class="filter-select facet-btn${face ? ' set' : ''}" data-added-btn aria-haspopup="dialog" aria-expanded="false">${label}${face ? ` <b>${escapeHtml(face)}</b>` : ''}</button>`;
    }
    return facetButtonHtml({ cat: key, label: def.label, active: state[key] || [], escapeHtml });
}

/** The band's Year inputs as a range: both ends, or one end with the other taken from the
 *  years present (`span`), swapped if reversed; null when both are empty (clear); undefined
 *  when an end is not four digits or there is nothing to fill from (leave the filter alone). */
export function yearInputRange(minText, maxText, span) {
    const a = String(minText ?? '').trim(), b = String(maxText ?? '').trim();
    if (!a && !b) return null;
    const four = (t) => (/^\d{4}$/.test(t) ? Number(t) : NaN);
    let lo = a ? four(a) : span?.min, hi = b ? four(b) : span?.max;
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return undefined;
    if (lo > hi) [lo, hi] = [hi, lo];
    return { min: lo, max: hi };
}

/** The band's controls in order: the main row (a `more` control with a value included), then
 *  with `more` open the rest. Returns { main, rest }: `rest` is what More reveals. */
/** Focus moving from `target` to `next` in the band: 'year' or 'bpm' when it leaves that range's
 *  pair of inputs (From → To stays inside, so nothing commits and repaints under the click). */
export function rangeLeft(target, next) {
    const pair = target?.closest?.('.filter-bpm');
    if (!pair || !target.matches?.('input')) return null;
    if (next && pair.contains(next)) return null;
    return pair.classList.contains('filter-year') ? 'year' : 'bpm';
}

export function bandRows(controls, state = {}) {
    const main = [], rest = [];
    for (const key of controls) {
        const def = FILTER_CONTROLS.find((c) => c.key === key);
        if (!def) continue;
        (def.more && !hasValue(key, state) ? rest : main).push(key);
    }
    return { main, rest };
}

/** `saved` draws the Saved row and `rules` the Rules button (the viewer has neither); `more`
 *  opens the controls behind More; `count` (tracks matching) leads the foot. */
export function bandHtml({ chips = [], hasFilter, controls = [], options, state = {}, rulesMode, rulesSummary = '', saved = true, rules = true, more = false, count = null, unit = 'tracks', today = todayIso(), escapeHtml }) {
    const activeCrate = chips.some((c) => c.on);
    const chipHtml = chips.map((c) => {
        let h = `<button type="button" class="chip-s${c.on ? ' on' : ''}" data-crate-id="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button>`;
        if (c.on && c.modified) h += '<button type="button" class="chip-s" data-update-crate>Update</button>';
        return h;
    }).join('');
    const save = hasFilter && !activeCrate ? '<button type="button" class="chip-s" data-save-crate>+ Save current</button>' : '';
    const { main, rest } = bandRows(controls, state);
    const shown = more ? [...main, ...rest] : main;
    const moreBtn = rest.length ? `<button type="button" class="band-more" data-band-more aria-expanded="${more}">${more ? 'Less' : 'More'}</button>` : '';
    const filterRow = rulesMode
        ? `<div class="row filter-rules"><span>${escapeHtml(rulesSummary)}</span><button type="button" class="chip-s" data-clear-rules>Clear</button></div>`
        : `<div class="row">${shown.map((k) => controlHtml(k, { options, state, escapeHtml, today })).join('')}${moreBtn}</div>`;
    const countHtml = Number.isFinite(count) ? `<span class="band-count">${Number(count).toLocaleString('en-US')} ${escapeHtml(unit)}</span>` : '';
    return '<div class="filter-band">'
        + (saved ? '<span class="band-label">Saved</span>' + `<div class="row">${chipHtml}${save}</div>` : '')
        + '<span class="band-label">Filter</span>'
        + filterRow
        + `<div class="band-foot">${countHtml}${rules ? '<button type="button" data-edit-rules>Rules</button>' : ''}</div>`
        + '</div>';
}

/** `extra` appends conditions the filter state does not hold (rules, a
 *  frozen id list, the health and sound-issue narrowings) as `{ cat, value, label }`.
 *  `swatches` (on the graph) maps a lower-case subgenre value to its colour. The scope
 *  ("Around BOYLAN", graph/scope.js) comes first: everything else narrows within it. */
export function filterLineModel(state = {}, { crateName = '', modified = false, labels = {}, max = 6, extra = [], swatches = null } = {}) {
    const pills = [];
    if (state.scope?.id) pills.push({ cat: 'scope', value: 'scope', label: subgraphLabel({ name: state.scope.name || state.scope.id.replace(/^[a-z]+:~?/, '') }) });
    for (const { key } of FILTER_CONTROLS) {
        if (!FACET_KEYS.includes(key)) continue;
        for (const v of state[key] || []) {
            const pill = { cat: key, value: String(v), label: String(v) };
            const swatch = key === 'subgenres' ? swatches?.get(String(v).toLowerCase()) : null;
            if (swatch) pill.swatch = swatch;
            pills.push(pill);
        }
    }
    if (state.bpmRange) {
        const { min, max: hi } = state.bpmRange;
        const has = (n) => n !== undefined && n !== null && n !== '';
        const text = has(min) && has(hi) ? `${min}–${hi}` : has(min) ? `${min}+` : `to ${hi}`;
        pills.push({ cat: 'bpm', value: `${has(min) ? min : ''}-${has(hi) ? hi : ''}`, label: `BPM ${text}` });
    }
    if (state.yearRange) {
        const { min, max: hi } = state.yearRange;
        pills.push({ cat: 'yearRange', value: `${min}-${hi}`, label: min === hi ? `Year ${min}` : `Year ${min}–${hi}` });
    }
    if (state.camelotCompatible) pills.push({ cat: 'camelot', value: '1', label: 'Camelot' });
    if (state.dateAddedRange) {
        const { from, to } = state.dateAddedRange;
        const text = from && to ? `${from} – ${to}` : from ? `from ${from}` : `to ${to}`;
        pills.push({ cat: 'dateAdded', value: `${from || ''}..${to || ''}`, label: `Added ${text}` });
    }
    if (state.matchMode === 'any') pills.push({ cat: 'match', value: 'any', label: 'Match any' });
    for (const e of extra) pills.push({ cat: e.cat, value: String(e.value ?? ''), label: String(e.label) });
    const catLabels = { ...Object.fromEntries(FILTER_CONTROLS.map((c) => [c.key, c.label])), ...labels };
    let shown = pills.map((p) => ({ ...p, catLabel: catLabels[p.cat] }));
    let overflow = 0;
    if (shown.length > max) {
        overflow = shown.length - (max - 1);
        shown = shown.slice(0, max - 1);
    }
    return { saved: crateName || '', modified: !!modified && !!crateName, pills: shown, overflow };
}

export function filterLineHtml(model, { escapeHtml }) {
    if (!model.pills.length && !model.saved) return '';
    const saved = model.saved
        ? `<span class="saved">${escapeHtml(model.saved)}${model.modified ? ' · modified' : ''}</span>` : '';
    const pills = model.pills.map((p) => {
        const isFacet = FACET_KEYS.includes(p.cat);
        const swatch = p.swatch ? `<span class="pill-swatch" style="background:${escapeHtml(p.swatch)}"></span>` : '';
        const inner = isFacet
            ? `${swatch}<b>${escapeHtml(p.catLabel || p.cat)}</b> ${escapeHtml(p.label)}`
            : `<b>${escapeHtml(p.label)}</b>`;
        return `<button type="button" class="filter-pill" data-pill-cat="${p.cat}" data-pill-value="${escapeHtml(p.value)}">${inner} <span class="x">×</span></button>`;
    }).join('');
    const more = model.overflow ? `<button type="button" class="filter-pill" data-pill-more>+${model.overflow}</button>` : '';
    return `<div class="filter-line">${saved}${pills}${more}<button type="button" class="clear" data-clear-filters>Clear</button></div>`;
}

/** Whether two filter states select the same tracks: a saved filter against
 *  the live one. Missing facets read as empty, so a filter saved before a
 *  facet existed, or read back through the hash, is not "modified". Facet
 *  order does not matter; session fields (crateId, savedRules) are ignored. */
export function sameFilter(a, b) {
    if (!a || !b) return a === b;
    const list = (s, k) => (Array.isArray(s[k]) ? s[k].map(String).sort() : []);
    for (const k of FACET_KEYS) {
        const x = list(a, k);
        const y = list(b, k);
        if (x.length !== y.length || x.some((v, i) => v !== y[i])) return false;
    }
    const range = (r) => (r ? [r.min, r.max, r.from || null, r.to || null].map((v) => v ?? null).join('|') : '');
    if (range(a.bpmRange) !== range(b.bpmRange) || range(a.dateAddedRange) !== range(b.dateAddedRange)) return false;
    if (range(a.yearRange) !== range(b.yearRange)) return false;
    if (!!a.camelotCompatible !== !!b.camelotCompatible) return false;
    if ((a.search || '') !== (b.search || '')) return false;
    if ((a.matchMode === 'any') !== (b.matchMode === 'any')) return false;
    if (JSON.stringify(a.ids || null) !== JSON.stringify(b.ids || null)) return false;
    return JSON.stringify(a.rules || null) === JSON.stringify(b.rules || null);
}

/** What Esc closes first: the search field while it has focus (its text, then the field),
 *  then on a header view the Listen sheet, a saved filter's menu, a band picker, the filter band, the
 *  expanded slot, the selection, then the search. */
export function escapeTarget({ fieldFocused, sheetOpen, crateMenuOpen, pickerOpen, bandOpen, slotExpanded, hasSelection, hasSearch } = {}) {
    if (fieldFocused) return 'field';
    if (sheetOpen) return 'sheet';
    if (crateMenuOpen) return 'crate-menu';
    if (pickerOpen) return 'picker';
    if (bandOpen) return 'band';
    if (slotExpanded) return 'slot';
    if (hasSelection) return 'selection';
    if (hasSearch) return 'search';
    return null;
}

/** The table's empty state. `clearable` (a header view, where the filter is
 *  the page's) adds Clear; playlists and entity pages show the heading alone. */
export function emptyTableHtml({ clearable }) {
    return clearable
        ? '<div class="empty-state"><h3>No matching tracks</h3><button type="button" class="btn-link" data-clear-filters>Clear</button></div>'
        : '<div class="empty-state"><h3>No matching tracks</h3></div>';
}
