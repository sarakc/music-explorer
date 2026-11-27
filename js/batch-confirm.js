// Batch apply: preview → typed confirmation → run → result, over /api/tags/batch.
//
// The controller is pure so it can be tested without a DOM. openBatchConfirm
// (below) renders it. Nothing here writes audio without a plan token the
// server issued for exactly the rows shown.

import { MP3_ONLY, mp3OnlyReasonsTitle } from './mp3-only.js';
import { escapeHtml } from './html.js';

const TERMINAL = new Set(['committed', 'halted', 'undone', 'released']);

/** The Apply toast: `Batch written`, or `Batch written · 3 MP3 only`. */
export function batchWrittenText(status) {
    const n = Number(status?.mp3Only) || 0;
    return n ? `Batch written · ${n.toLocaleString()} ${MP3_ONLY}` : 'Batch written';
}

/** The quiet notice after a batch tag edit: `Tags written`, or `Tags written · 3 MP3 only`. */
export function tagsWrittenText(status) {
    const n = Number(status?.mp3Only) || 0;
    return n ? `Tags written · ${n.toLocaleString()} ${MP3_ONLY}` : 'Tags written';
}

/** The newest batch whose recovery controls still need to be reachable. */
export function latestRecoverableBatch(batches = []) {
    return batches.find((batch) => batch?.status === 'running' || batch?.undoable || batch?.releasable) || null;
}

/** Decimal units, matching what Finder shows for the same disk. */
export function formatBytes(value) {
    const n = Number(value) || 0;
    if (n < 1000) return `${n} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let v = n / 1000;
    let i = 0;
    while (v >= 1000 && i < units.length - 1) { v /= 1000; i += 1; }
    return `${v.toFixed(1)} ${units[i]}`;
}

const RESULTS = {
    EPLANREQUIRED: { title: 'Preview required', detail: 'Request a preview before applying.' },
    EPLANEXPIRED: { title: 'Preview expired', detail: 'Request a fresh preview and read it again.' },
    EPLANSTALE: { title: 'Rows changed since the preview', detail: 'Some tracks were edited after the preview. Request a fresh preview.' },
    ESTAGED: { title: 'Staged edits changed', detail: '' },
    ECONFIRM: { title: 'Count did not match', detail: 'Type the exact number of tracks shown in the preview.' },
    ECAP: { title: 'Batch too large', detail: 'Reduce the selection or raise UMM_BATCH_MAX_ROWS.' },
    ENOSPC: { title: 'Not enough free space for backups', detail: 'Release old batch backups or free disk space.' },
    EBUSY: { title: 'Another batch is running', detail: 'Wait for it to finish.' },
    ERELEASED: { title: 'Backups released', detail: 'This batch can no longer be undone.' },
    EALREADYUNDONE: { title: 'Already undone', detail: 'Nothing further to revert.' },
    EINTERRUPTED: { title: 'Server stopped mid-batch', detail: 'Completed members are intact and can be undone.' },
};

export function describeBatchResult(result) {
    if (!result) return { title: 'Unknown result', detail: '' };
    const known = RESULTS[result.code];
    if (known) return { ...known, detail: [known.detail, ...(result.errors || [])].filter(Boolean).join(' ') };
    return { title: result.code || 'Batch failed', detail: (result.errors || []).join('; ') };
}

export class BatchConfirmController {
    constructor({ fetchImpl = globalThis.fetch?.bind(globalThis), onChanged = () => {}, pollIntervalMs = 1000 } = {}) {
        this.fetchImpl = fetchImpl;
        this.onChanged = onChanged;
        this.pollIntervalMs = pollIntervalMs;
        this.state = 'idle';
        this.plan = null;
        this.batchId = null;
        this.status = null;
        this.lastResult = null;
        this.scope = null;
    }

    _set(state) {
        this.state = state;
        try { this.onChanged(state, this); } catch (err) { console.error('batch onChanged threw', err); }
    }

    async _json(method, url, body) {
        const init = { method, headers: { 'Content-Type': 'application/json' } };
        if (body !== undefined) init.body = JSON.stringify(body);
        const res = await this.fetchImpl(url, init);
        let json = null;
        try { json = await res.json(); } catch { json = { ok: false, code: 'EBADRESPONSE', errors: [`HTTP ${res.status}`] }; }
        return json;
    }

    /** A request without a scope (a fresh preview) reuses the last one. */
    async requestPlan(scope = this.scope || {}) {
        const { trackIds, sources } = scope;
        this.scope = scope;
        this._set('planning');
        const body = { source: 'pending-diffs' };
        if (trackIds) body.trackIds = trackIds;
        if (sources) body.sources = sources;
        let result;
        try { result = await this._json('POST', '/api/tags/batch/plan', body); }
        catch (err) { result = { ok: false, code: 'ENETWORK', errors: [err?.message || 'request failed'] }; }
        if (!result?.ok) { this.lastResult = result; this._set('error'); return result; }
        this.plan = result;
        this._set('planned');
        return result;
    }

    needsTypedCount() {
        return Boolean(this.plan) && this.plan.totals.members > this.plan.limits.confirmThreshold;
    }

    canApply(typed) {
        if (!this.plan?.executable || this.state !== 'planned') return false;
        return !this.needsTypedCount() || Number(String(typed).trim()) === this.plan.totals.members;
    }

    async apply(typed) {
        if (!this.canApply(typed)) return { ok: false, code: 'ECONFIRM', errors: ['count does not match'] };
        this._set('starting');
        const body = { planId: this.plan.planId };
        if (this.needsTypedCount()) body.confirmCount = Number(String(typed).trim());
        let result;
        try { result = await this._json('POST', '/api/tags/batch', body); }
        catch (err) { result = { ok: false, code: 'ENETWORK', errors: [err?.message || 'request failed'] }; }
        this.lastResult = result;
        if (!result?.ok) { this._set('error'); return result; }
        this.batchId = result.batchId;
        this._set('running');
        return result;
    }

    async poll() {
        if (!this.batchId) return null;
        const result = await this._json('GET', `/api/tags/batch/${this.batchId}`);
        if (!result?.ok) { this.lastResult = result; this._set('error'); return result; }
        this.status = result;
        this._set(result.status);
        return result;
    }

    /** Poll until the batch reaches a terminal state. */
    async watch() {
        while (this.batchId && !TERMINAL.has(this.state) && this.state !== 'error') {
            await this.poll();
            if (TERMINAL.has(this.state) || this.state === 'error') break;
            await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
        }
        return this.status;
    }

    async resume(batchId) {
        this.batchId = batchId;
        return this.poll();
    }

    async undo() {
        if (!this.batchId) return null;
        const result = await this._json('POST', `/api/tags/batch/${this.batchId}/undo`, {});
        this.lastResult = result;
        await this.poll();
        return result;
    }

    async release(typed) {
        if (!this.batchId) return null;
        const body = {};
        const total = this.status?.total ?? 0;
        if (typed !== undefined && typed !== '') body.confirmCount = Number(String(typed).trim());
        else if (total) body.confirmCount = total;
        const result = await this._json('POST', `/api/tags/batch/${this.batchId}/release`, body);
        this.lastResult = result;
        await this.poll();
        return result;
    }
}

/**
 * A batch tag edit: write it straight away when the plan is executable, small
 * enough to need no typed count, and Rekordbox is not running (a single-track
 * write asks first then). Otherwise, or when the run does not commit,
 * `openPreview(controller)` shows the preview or result as it stands.
 * `started` says whether a batch ran, so the caller knows to keep the edit.
 */
export async function writeOrPreview(controller, scope, { openPreview }) {
    const c = controller;
    const done = async (outcome) => {
        if (outcome !== 'written') await openPreview(c);
        return { outcome, state: c.state, started: Boolean(c.batchId) };
    };
    await c.requestPlan(scope);
    if (c.state !== 'planned' || !c.canApply('') || c.plan.checks?.rekordboxRunning === true) return done('preview');
    await c.apply('');
    if (c.state === 'running') await c.watch();
    return done(c.state === 'committed' ? 'written' : 'result');
}

/** Undo from the notice; throws the reason when the server refuses. */
export async function undoWritten(controller) {
    const result = await controller.undo();
    if (!result?.ok) throw new Error(describeBatchResult(result).title);
    return result;
}

// ------------------------------------------------------------------ DOM

const dateLabel = (iso) => (iso ? new Date(iso).toLocaleString() : 'unknown');

function previewRows(plan) {
    // A member the planner could not resolve (file missing, outside the roots)
    // carries an error and no fields; it still gets a row so the list is
    // complete, and those rows come first. A stale stored path's error is a
    // sentence (it carries `candidates`) and reads without its code.
    // A member found at a new path (`heal`) shows the old one on hover.
    const members = [...plan.members].sort((a, b) => Number(Boolean(b.error)) - Number(Boolean(a.error)));
    return members.map((member) => (member.error ? `
        <div class="bc-row">
            <span class="bc-path" title="${escapeHtml(member.path)}">${escapeHtml(member.path || member.trackId)}</span>
            <span class="bc-note">${member.error.candidates ? '' : `<code>${escapeHtml(member.error.code)}</code> `}${escapeHtml(member.error.detail)}</span>
        </div>` : member.fields.map((field) => `
        <div class="bc-row">
            <span class="bc-path" title="${escapeHtml(member.heal ? `${member.path}\nwas ${member.heal.from}` : member.path)}">${escapeHtml(member.path)}${member.flacPath ? ' <em>+FLAC</em>' : ''}</span>
            <span class="bc-field">${escapeHtml(field.field)}</span>
            <span class="bc-before">${escapeHtml(field.oldValue) || '<em>empty</em>'}</span>
            <span class="bc-after">${escapeHtml(field.proposedValue) || '<em>empty</em>'}</span>
        </div>`).join(''))).join('');
}

export function previewHtml(c) {
    const { plan } = c;
    const t = plan.totals;
    const spaceOk = t.backupBytes + plan.limits.reserveBytes <= t.freeBytes;
    const rekordbox = plan.checks.rekordboxRunning === null ? 'unknown'
        : plan.checks.rekordboxRunning ? 'running — close it before applying' : 'not running';
    // A member's own refusal is read in its row.
    const refusals = plan.refusals.filter((r) => !r.trackId).map((r) => `<li><code>${escapeHtml(r.code)}</code> ${escapeHtml(r.detail)}</li>`).join('');
    return `
        <div class="bc-facts">
            <div><span>Tracks</span><strong>${t.members.toLocaleString()}</strong></div>
            <div><span>Files</span><strong>${t.mp3Files.toLocaleString()} MP3 · ${t.flacFiles.toLocaleString()} FLAC</strong></div>
            <div><span>Backup needs</span><strong>${formatBytes(t.backupBytes)} · free ${formatBytes(t.freeBytes)} ${spaceOk ? '✓' : '✗'}</strong></div>
            <div><span>Backup store now</span><strong>${formatBytes(t.backupStoreBytes)}</strong></div>
            <div><span>Rekordbox</span><strong>${rekordbox}</strong></div>
            <div><span>Time Machine last backup</span><strong>${dateLabel(plan.checks.timeMachineLatest)}</strong></div>
            <div><span>Preview valid until</span><strong>${dateLabel(plan.expiresAt)}</strong></div>
        </div>
        ${refusals ? `<ul class="bc-refusals">${refusals}</ul>` : ''}
        <div class="bc-list">${previewRows(plan)}</div>`;
}

function runningHtml(c) {
    const s = c.status || { committed: 0, total: c.plan?.totals.members ?? 0, current: null };
    return `
        <div class="bc-facts">
            <div><span>Written</span><strong>${s.committed.toLocaleString()} / ${s.total.toLocaleString()}</strong></div>
            <div><span>Current</span><strong>${escapeHtml(s.current || '')}</strong></div>
        </div>`;
}

/** ` · 3 MP3 only` after the written count, with the reasons on hover; empty when every FLAC was written. */
export function mp3OnlyHtml(status) {
    const n = Number(status?.mp3Only) || 0;
    if (!n) return '';
    return ` · <span title="${escapeHtml(mp3OnlyReasonsTitle(status.mp3OnlyReasons))}">${n.toLocaleString()} ${MP3_ONLY}</span>`;
}

function resultHtml(c) {
    const s = c.status;
    if (!s) return '';
    const failed = s.failed ? `
        <div class="bc-failed">
            <strong>Stopped at</strong> ${escapeHtml(s.failed.path || s.failed.trackId || '')}
            <code>${escapeHtml(s.failed.code)}</code> ${escapeHtml((s.failed.errors || []).join('; '))}
        </div>` : '';
    const last = c.lastResult && !c.lastResult.ok ? describeBatchResult(c.lastResult) : null;
    return `
        <div class="bc-facts">
            <div><span>Status</span><strong>${escapeHtml(s.status)}${s.recovered ? ' (recovered)' : ''}</strong></div>
            <div><span>Written</span><strong>${s.committed.toLocaleString()} / ${s.total.toLocaleString()}${mp3OnlyHtml(s)}</strong></div>
            <div><span>Still staged</span><strong>${s.remaining.toLocaleString()}</strong></div>
        </div>
        ${failed}
        ${last ? `<div class="bc-failed"><strong>${escapeHtml(last.title)}</strong> ${escapeHtml(last.detail)}</div>` : ''}`;
}

/**
 * Preview → typed count → run → result. Resolves when closed.
 * `onFinished` fires once after any terminal state so the caller can reload rows.
 */
export async function openBatchConfirm({ controller, onFinished = () => {} } = {}) {
    if (!controller) throw new TypeError('openBatchConfirm requires a controller');
    const c = controller;

    const backdrop = document.createElement('div');
    backdrop.className = 'enrich-backdrop bc-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'enrich-dialog bc-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Apply staged tags');
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    let resolveClose;
    const closed = new Promise((resolve) => { resolveClose = resolve; });
    let finished = false;
    const busy = () => c.state === 'running' || c.state === 'starting';
    const close = () => {
        backdrop.remove();
        document.removeEventListener('keydown', onKeydown);
        resolveClose(c.state);
    };
    const onKeydown = (event) => {
        if (event.key !== 'Escape' || busy()) return;
        event.stopPropagation();
        close();
    };
    document.addEventListener('keydown', onKeydown);
    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop && !busy()) close();
    });

    let typed = '';
    const render = () => {
        const state = c.state;
        const total = c.plan?.totals.members ?? c.status?.total ?? 0;
        const needsCount = state === 'planned' ? c.needsTypedCount()
            : (c.status?.total ?? 0) > (c.plan?.limits.confirmThreshold ?? 50);
        let body = '';
        let foot = '';
        if (state === 'planning') body = '<p class="muted">Checking every staged track…</p>';
        else if (state === 'planned') {
            body = previewHtml(c);
            foot = `
                ${needsCount ? `<label class="bc-count">Type ${total.toLocaleString()} to confirm <input type="text" inputmode="numeric" data-bc-count value="${escapeHtml(typed)}" autocomplete="off"></label>` : ''}
                <button type="button" class="btn btn-sm btn-secondary" data-bc-close>Cancel</button>
                <button type="button" class="btn btn-sm" data-bc-apply ${c.canApply(typed) ? '' : 'disabled'}>Apply batch</button>`;
        } else if (busy()) {
            body = runningHtml(c);
            foot = '<span class="muted">Writing. Other tag edits are blocked until this finishes.</span>';
        } else if (state === 'error' && !c.status) {
            const d = describeBatchResult(c.lastResult);
            body = `<div class="bc-failed"><strong>${escapeHtml(d.title)}</strong> ${escapeHtml(d.detail)}</div>`;
            foot = `<button type="button" class="btn btn-sm btn-secondary" data-bc-close>Close</button>
                    <button type="button" class="btn btn-sm" data-bc-replan>Preview again</button>`;
        } else {
            body = resultHtml(c);
            const s = c.status || {};
            const releaseReady = s.releasable && (!needsCount || Number(typed) === total);
            foot = `
                ${needsCount && s.releasable ? `<label class="bc-count">Type ${total.toLocaleString()} to release <input type="text" inputmode="numeric" data-bc-count value="${escapeHtml(typed)}" autocomplete="off"></label>` : ''}
                <button type="button" class="btn btn-sm btn-secondary" data-bc-close>Close</button>
                <button type="button" class="btn btn-sm btn-secondary" data-bc-undo ${s.undoable ? '' : 'disabled'}>Undo batch</button>
                <button type="button" class="btn btn-sm" data-bc-release ${releaseReady ? '' : 'disabled'}>Release backups</button>`;
        }
        dialog.innerHTML = `
            <header class="enrich-head bc-head">
                <div>
                    <h2>Apply staged tags</h2>
                    <p class="muted">${escapeHtml(state)}${c.batchId ? ` · ${escapeHtml(c.batchId.slice(0, 8))}` : ''}</p>
                </div>
                <button type="button" class="sqtr-close" data-bc-close aria-label="Close" ${busy() ? 'disabled' : ''}>&times;</button>
            </header>
            <div class="enrich-body bc-body">${body}</div>
            <footer class="enrich-foot bc-foot">${foot}</footer>`;

        dialog.querySelectorAll('[data-bc-close]').forEach((el) => el.addEventListener('click', close));
        dialog.querySelector('[data-bc-count]')?.addEventListener('input', (event) => {
            typed = event.target.value;
            const apply = dialog.querySelector('[data-bc-apply]');
            if (apply) apply.disabled = !c.canApply(typed);
            const release = dialog.querySelector('[data-bc-release]');
            if (release) release.disabled = !(c.status?.releasable && Number(typed) === total);
        });
        dialog.querySelector('[data-bc-apply]')?.addEventListener('click', async () => {
            await c.apply(typed);
            if (c.state === 'running') await c.watch();
        });
        dialog.querySelector('[data-bc-replan]')?.addEventListener('click', () => c.requestPlan());
        dialog.querySelector('[data-bc-undo]')?.addEventListener('click', async (event) => {
            event.currentTarget.disabled = true;
            await c.undo();
        });
        dialog.querySelector('[data-bc-release]')?.addEventListener('click', async (event) => {
            event.currentTarget.disabled = true;
            await c.release(typed);
        });
        dialog.querySelector('[data-bc-count]')?.focus();
    };

    c.onChanged = (state) => {
        typed = state === 'planned' ? typed : (TERMINAL.has(state) && !finished ? '' : typed);
        render();
        if (TERMINAL.has(state) && !finished) {
            finished = true;
            try { onFinished(c); } catch (err) { console.error('onFinished threw', err); }
        }
    };
    render();
    return closed;
}
