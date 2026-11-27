// Tools › File paths — the stale stored paths report and its reviewed rewrite.
//
// POST /api/library/paths/check walks the library roots and gives every stored
// path that no longer points at a file one state (server/lib/pathResolve.js).
// This module renders that report with a checkbox per actionable row (only
// `resolved` preselected; Shift-click ranges; All), and sends the picks to
// POST /api/library/paths/rewrite, which changes database rows only — never a
// file (server/lib/pathRewrite.js). Undo goes to …/rewrite/:id/undo.
import { escapeHtml } from './html.js';

export const STATE_LABELS = {
    ok: 'in place',
    resolved: 'found',
    suggested: 'suggested',
    ambiguous: 'ambiguous',
    taken: 'taken',
    'outside-roots': 'outside library',
    missing: 'missing',
    error: 'not checked',
};

const HEADINGS = {
    resolved: 'Found',
    suggested: 'Suggested',
    ambiguous: 'Ambiguous',
    taken: 'Taken by another track',
    'outside-roots': 'Outside library',
    missing: 'Missing',
    error: 'Not checked',
};

export const RULE_LABELS = {
    1: 'Outside library',
    2: 'Old library root',
    3: 'Same path',
    4: 'Same album',
    5: 'Title and artist',
};

const ACTIONABLE = ['resolved', 'suggested', 'ambiguous'];
/** Above this many picks the rewrite asks for the typed count, as batch writes do. */
export const CONFIRM_THRESHOLD = 50;
const COUNTED = ['taken', 'outside-roots', 'missing', 'error'];
const ORDER = ['ok', ...ACTIONABLE, ...COUNTED];

async function postJson(url, body, fetchImpl, label) {
    const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (res.ok && data?.ok) return data;
    const err = new Error(data?.errors?.[0] || `${label} failed (${res.status})`);
    err.code = data?.code || null;
    err.rows = data?.rows || [];
    throw err;
}

/** Run the server's dry-run. Throws with `code` (EINCOMPLETE when the walk failed). */
export function fetchPathReport({ fetchImpl = fetch } = {}) {
    return postJson('/api/library/paths/check', {}, fetchImpl, 'Check');
}

/** Rewrite the picked rows. Throws with `code` and, for EPLANSTALE, the `rows` that changed. */
export function postPathRewrite({ planId, picks, confirm }, { fetchImpl = fetch } = {}) {
    return postJson('/api/library/paths/rewrite', { planId, picks, ...(confirm != null ? { confirm } : {}) }, fetchImpl, 'Rewrite');
}

export function postPathRewriteUndo(rewriteId, { fetchImpl = fetch } = {}) {
    return postJson(`/api/library/paths/rewrite/${encodeURIComponent(rewriteId)}/undo`, {}, fetchImpl, 'Undo');
}

const plural = (n, one, many = `${one}s`) => `${Number(n).toLocaleString()} ${n === 1 ? one : many}`;

export function rewriteSummary(result) {
    const parts = [`Rewrote ${plural(result.rewritten, 'path')}`];
    if (result.already) parts.push(`${Number(result.already).toLocaleString()} already done`);
    return `${parts.join(' · ')}. Files unchanged.`;
}

export function undoSummary(result) {
    const parts = [`Restored ${plural(result.restored, 'path')}`];
    if (result.already) parts.push(`${Number(result.already).toLocaleString()} already restored`);
    if (result.changed?.length) parts.push(`${Number(result.changed.length).toLocaleString()} changed since, left as is`);
    return parts.join(' · ');
}

/** A refusal in plain words; the server's own message when nothing better fits. */
export function rewriteErrorLine(err) {
    if (err.code === 'EPLANEXPIRED' || err.code === 'EPLANREQUIRED') return 'The check has expired. Check paths again.';
    if (err.code === 'EPLANSTALE') return `${plural(err.rows?.length || 0, 'track')} changed since the check. Nothing was rewritten. Check paths again.`;
    if (err.code === 'EBUSY') return `A tag batch is running. Nothing was rewritten.`;
    return `Rewrite failed: ${err.message}. Nothing was rewritten.`;
}

export function totalsLine(totals = {}) {
    const parts = ORDER.filter((s) => totals[s]).map((s) => `${Number(totals[s]).toLocaleString()} ${STATE_LABELS[s]}`);
    return parts.length ? parts.join(' · ') : 'No local tracks';
}

export function shortPath(path, roots = []) {
    const p = String(path || '');
    const root = roots.find((r) => p.startsWith(`${r}/`));
    return root ? p.slice(root.length + 1) : p;
}

const delta = (c) => (c?.durationDelta == null ? '' : `Δ ${c.durationDelta} s`);

const usable = (c) => c.inside && !c.owner;

function renderRow(row, roots, { note: noteOverride } = {}) {
    const pathSpan = (cls, p) => `<span class="${cls}" title="${escapeHtml(p)}">${escapeHtml(shortPath(p, roots))}</span>`;
    const first = row.candidates?.[0];
    const pickable = ACTIONABLE.includes(row.state);
    let target = '';
    let note = row.rule ? RULE_LABELS[row.rule] || '' : '';
    if (row.state === 'ambiguous') {
        // One radio per candidate a rewrite could use; the rest stay listed as evidence.
        target = `<span class="paths-cands">${row.candidates.map((c) => (usable(c)
            ? `<label class="paths-cand"><input type="radio" name="paths-choice-${escapeHtml(row.trackId)}" data-paths-choice="${escapeHtml(row.trackId)}" value="${escapeHtml(c.path)}">${pathSpan('paths-to', c.path)}<span class="paths-delta">${delta(c)}</span></label>`
            : `<span class="paths-cand is-blocked">${pathSpan('paths-to', c.path)}<span class="paths-delta">${c.owner ? 'Another track' : 'Outside library'}</span></span>`)).join('')}</span>`;
    } else if (row.to || first) {
        target = pathSpan('paths-to', row.to || first.path);
    }
    if (row.state === 'taken') note = 'Another track';
    if (row.state === 'error') note = row.detail || '';
    const copies = row.duplicates?.length;
    if (copies) note += ` · ${copies} identical cop${copies === 1 ? 'y' : 'ies'}`;
    if (noteOverride != null) note = noteOverride;
    const shownDelta = row.state === 'ambiguous' ? '' : delta(row.to ? row.candidates.find((c) => c.path === row.to) : first);
    const box = !pickable ? ''
        : `<input type="checkbox" class="paths-pick" aria-label="Rewrite ${escapeHtml(row.title || 'this track')}" data-paths-pick="${escapeHtml(row.trackId)}"${row.to ? ` data-to="${escapeHtml(row.to)}"` : ''}${row.state === 'resolved' ? ' checked' : ''}${row.state === 'ambiguous' ? ' disabled' : ''}>`;
    return `
        <div class="paths-row${pickable ? ' has-pick' : ''}" data-track-id="${escapeHtml(row.trackId)}">
            ${box}<span class="paths-track"><strong>${escapeHtml(row.title) || '<em>Untitled</em>'}</strong><span>${escapeHtml(row.artist)}</span></span>
            <span class="paths-move">${pathSpan('paths-from', row.from)}${target ? `<span class="paths-arrow" aria-hidden="true">→</span>${target}` : ''}</span>
            <span class="paths-note">${escapeHtml(note)}</span>
            <span class="paths-delta">${shownDelta}</span>
        </div>`;
}

/**
 * The report below the Check button: actionable groups open with a checkbox
 * per row, the rest folded. Paths show relative to a library root; anything
 * else, search roots included, shows in full so it reads as outside the library.
 */
export function renderPathReport(report) {
    const roots = report.roots || [];
    const byState = new Map();
    for (const row of report.rows || []) {
        if (!byState.has(row.state)) byState.set(row.state, []);
        byState.get(row.state).push(row);
    }
    if (!byState.size) return '<p class="muted">Every stored path points at a file.</p>';
    const heading = (state, n) => `${HEADINGS[state]} <span>${n.toLocaleString()}</span>`;
    const list = (rows) => `<div class="paths-list">${rows.map((r) => renderRow(r, roots)).join('')}</div>`;
    const parts = [];
    const preselected = (byState.get('resolved') || []).length;
    if (ACTIONABLE.some((state) => byState.has(state))) {
        parts.push(`
        <div class="paths-tools">
            <label><input type="checkbox" data-paths-all> All <span data-paths-selected>${preselected.toLocaleString()}</span></label>
            <label class="paths-confirm" data-paths-confirm hidden>Type <span data-paths-confirm-n></span> to confirm <input type="text" inputmode="numeric" autocomplete="off" data-paths-count></label>
            <button type="button" class="btn btn-sm" data-paths-rewrite${preselected ? '' : ' disabled'}>${rewriteLabel(preselected)}</button>
        </div>`);
    }
    for (const state of ACTIONABLE) {
        const rows = byState.get(state);
        if (rows) parts.push(`<section class="paths-section" data-paths-state="${state}"><h3>${heading(state, rows.length)}</h3>${list(rows)}</section>`);
    }
    for (const state of COUNTED) {
        const rows = byState.get(state);
        if (rows) parts.push(`<details class="paths-section" data-paths-state="${state}"><summary><h3>${heading(state, rows.length)}</h3></summary>${list(rows)}</details>`);
    }
    const searched = [...roots, ...(report.searchRoots || [])].map((r) => `<span title="${escapeHtml(r)}">${escapeHtml(r)}</span>`).join(', ');
    parts.push(`<p class="paths-searched muted">Searched ${searched}</p>`);
    return parts.join('');
}

const rewriteLabel = (n) => (n ? `Rewrite ${plural(n, 'path')}` : 'Rewrite');

/** The checked rows as `{ trackId, to }`; an ambiguous row uses its chosen candidate. */
export function selectedPicks(container) {
    const choices = [...container.querySelectorAll('[data-paths-choice]')];
    return [...container.querySelectorAll('[data-paths-pick]')]
        .filter((box) => box.checked && !box.disabled)
        .map((box) => {
            const trackId = box.dataset.pathsPick;
            const to = box.dataset.to || choices.find((r) => r.dataset.pathsChoice === trackId && r.checked)?.value;
            return to ? { trackId, to } : null;
        })
        .filter(Boolean);
}

/**
 * Wire the report's controls: All, Shift-click ranges, a candidate choice that
 * enables (and checks) its ambiguous row, the typed count above the threshold,
 * and the Rewrite button, which calls `onRewrite(picks, confirmCount)`.
 */
export function wirePathSelection(container, { threshold = CONFIRM_THRESHOLD, onRewrite } = {}) {
    const all = container.querySelector('[data-paths-all]');
    const button = container.querySelector('[data-paths-rewrite]');
    if (!all || !button) return null;
    const selected = container.querySelector('[data-paths-selected]');
    const confirm = container.querySelector('[data-paths-confirm]');
    const confirmN = container.querySelector('[data-paths-confirm-n]');
    const count = container.querySelector('[data-paths-count]');
    const boxes = () => [...container.querySelectorAll('[data-paths-pick]:not(:disabled)')];
    let anchor = null;
    let shiftHeld = false;
    let busy = false;

    const update = () => {
        const list = boxes();
        const n = selectedPicks(container).length;
        const checked = list.filter((b) => b.checked).length;
        selected.textContent = n.toLocaleString();
        all.checked = list.length > 0 && checked === list.length;
        all.indeterminate = checked > 0 && checked < list.length;
        all.disabled = list.length === 0;
        const typed = n > threshold;
        confirm.hidden = !typed;
        confirmN.textContent = n.toLocaleString();
        button.textContent = rewriteLabel(n);
        button.disabled = busy || n === 0 || (typed && Number(String(count.value).trim()) !== n);
    };

    container.addEventListener('mousedown', (event) => {
        shiftHeld = event.shiftKey;
        if (event.shiftKey && event.target.closest?.('.paths-row')) event.preventDefault();
    });
    container.addEventListener('keydown', (event) => { shiftHeld = event.shiftKey; });
    container.addEventListener('change', (event) => {
        const el = event.target;
        if (el === all) {
            boxes().forEach((b) => { b.checked = all.checked; });
        } else if (el.matches?.('[data-paths-choice]')) {
            const box = [...container.querySelectorAll('[data-paths-pick]')].find((b) => b.dataset.pathsPick === el.dataset.pathsChoice);
            if (box) { box.disabled = false; box.checked = true; }
        } else if (el.matches?.('[data-paths-pick]')) {
            const list = boxes();
            const at = list.indexOf(el);
            if (shiftHeld && anchor !== null && list[anchor]) {
                const [lo, hi] = at < anchor ? [at, anchor] : [anchor, at];
                list.slice(lo, hi + 1).forEach((b) => { b.checked = el.checked; });
            }
            anchor = at;
            shiftHeld = false;
        }
        update();
    });
    count.addEventListener('input', update);
    button.addEventListener('click', async () => {
        const picks = selectedPicks(container);
        if (!picks.length || busy) return;
        busy = true;
        update();
        button.textContent = 'Rewriting…';
        try {
            await onRewrite?.(picks, picks.length > threshold ? Number(String(count.value).trim()) : undefined);
        } finally {
            busy = false;
            update();
        }
    });
    update();
    return { update, picks: () => selectedPicks(container) };
}

/** What a rewrite changed, with Undo. `report` supplies titles. */
export function renderRewriteResult(result, report = {}) {
    const roots = report.roots || [];
    const byId = new Map((report.rows || []).map((r) => [r.trackId, r]));
    const rows = (result.rows || []).map((r) => {
        const known = byId.get(r.trackId) || {};
        return renderRow({ ...known, trackId: r.trackId, from: r.from, to: r.to, state: 'done', rule: null, candidates: [] }, roots,
            { note: r.result === 'already' ? 'Already done' : 'Rewritten' });
    });
    return `
        <div class="paths-result" data-rewrite-id="${escapeHtml(result.rewriteId)}">
            <div class="paths-tools">
                <span>${escapeHtml(rewriteSummary(result))}</span>
                ${result.rewritten ? '<button type="button" class="btn btn-sm btn-secondary" data-paths-undo>Undo</button>' : ''}
            </div>
            <div class="paths-list">${rows.join('')}</div>
        </div>`;
}

/** After undo: the rows left alone because they changed since the rewrite. */
export function renderUndoResult(result, report = {}) {
    const roots = report.roots || [];
    const byId = new Map((report.rows || []).map((r) => [r.trackId, r]));
    const changed = (result.changed || []).map((r) => renderRow({ ...(byId.get(r.trackId) || {}), trackId: r.trackId, from: r.path || r.to, to: null, state: 'done', rule: null, candidates: [] }, roots,
        { note: 'Changed since' }));
    return `
        <div class="paths-result">
            <div class="paths-tools"><span>${escapeHtml(undoSummary(result))}</span></div>
            ${changed.length ? `<div class="paths-list">${changed.join('')}</div>` : ''}
        </div>`;
}
