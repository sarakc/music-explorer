// Single-track tag review — the only path in the app from a staged change to a
// byte on disk (P3.2c/P3.2d).
//
// Two layers, deliberately separated:
//   * TrackReviewController — no DOM. Owns the review buffer, the one call to
//     /api/tags/write, and the retained writeId that makes undo possible. This
//     is the layer the tests drive, because this is the layer that can lose a
//     user's work.
//   * TrackReviewDrawer — renders the controller and nothing more.
//
// Nothing here auto-saves. `write()` runs only from an explicit user action,
// and an enrichment proposal reaches it through the same review buffer as a
// hand-typed one, so it is reviewable by construction rather than by policy.

import { PendingTagDiffs } from './pending-tag-diffs.js';
import { MP3_ONLY, mp3OnlyReason } from './mp3-only.js';
import { escapeHtml } from './html.js';

/** Fields `normalizeEdit` on the server will accept, in display order. */
export const EDITABLE_FIELDS = [
    { field: 'title', label: 'Title' },
    { field: 'artist', label: 'Artist' },
    { field: 'album', label: 'Album' },
    { field: 'albumArtist', label: 'Album artist' },
    { field: 'genre', label: 'Genre' },
    { field: 'label', label: 'Label' },
    { field: 'year', label: 'Year' },
    { field: 'comments', label: 'Comments' },
    { field: 'bpm', label: 'BPM', override: true },
    { field: 'key', label: 'Key', override: true },
];

const FIELD_LABEL = new Map(EDITABLE_FIELDS.map((f) => [f.field, f.label]));
const OVERRIDE_FIELDS = new Set(EDITABLE_FIELDS.filter((f) => f.override).map((f) => f.field));

/**
 * Safety 7: what the drawer asks before a single-track write or undo while
 * Rekordbox runs. A warning, not a refusal, as for batches: the
 * external-change guard already protects the file.
 */
const REKORDBOX_QUESTION = {
    write: 'Rekordbox is running. Close it before writing tags. Write anyway?',
    undo: 'Rekordbox is running. Close it before undoing this write. Undo anyway?',
};

/** The drawer's footer note for a Rekordbox check result. */
export function rekordboxNote(state) {
    if (state === 'running') return 'Rekordbox is running — close it before writing.';
    if (state === 'unknown') return "Couldn't check whether Rekordbox is running.";
    return '';
}

/** UMM field → the property it lives under on a track row. */
const TRACK_PROPERTY = { albumArtist: 'album_artist' };

export function trackPath(track) {
    return track?.local_path || track?.path || '';
}

export function trackFieldValue(track, field) {
    if (!track) return '';
    const value = track[TRACK_PROPERTY[field] || field];
    return value == null ? '' : value;
}

/**
 * Review buffer → the patch body for /api/tags/write. A discarded field is
 * simply absent; a field the user cleared is present as '' so the write
 * actually removes the frame rather than silently skipping it.
 */
export function buildPatch(diffs) {
    const patch = {};
    for (const diff of diffs || []) {
        patch[diff.field] = String(diff.proposedValue ?? '');
    }
    return patch;
}

// Engine refusals the user can act on, phrased as what happened to their file
// rather than as an error code. Anything unmapped still reports its errors, so
// a new failure mode is visible instead of being flattened to "write failed".
const REFUSALS = {
    EDISABLED: { tone: 'blocked', title: 'Tag writes are switched off', detail: 'UMM_TAG_WRITES=off — your file was not touched.' },
    EPERM: { tone: 'blocked', title: 'That path is outside the writable roots', detail: 'Only LIBRARY_DIR, LOSSLESS_DIR and REKORDBOX_LIBRARY_DIR can be written.' },
    ENOSPC: { tone: 'error', title: 'Not enough free space to back the file up', detail: 'Nothing was written — the backup must exist before the original is touched.' },
    ECHECKSUM: { tone: 'error', title: 'The backup did not match its recorded checksum', detail: 'Nothing was written.' },
    ECOPYVERIFY: { tone: 'error', title: 'Source and backup checksums differ', detail: 'Nothing was written — the copy could not be trusted.' },
    EEXTERNALCHANGE: { tone: 'error', title: 'The file changed outside UMM', detail: 'Refusing to overwrite another app’s changes.' },
    EALREADYUNDONE: { tone: 'error', title: 'That write was already undone', detail: 'Nothing further to revert.' },
    // The server's sentence says what it found instead (lib/pathHeal.js).
    ENOENT: { tone: 'error', title: 'The file is not where UMM expects it', detail: '' },
    EINVAL: { tone: 'error', title: 'That edit is not writable', detail: 'One of the fields is not an editable tag.' },
    EFRAME: { tone: 'error', title: 'That value cannot be stored in an ID3 frame', detail: '' },
    ETAG: { tone: 'error', title: 'The tag writer failed', detail: '' },
    ENODIFF: { tone: 'blocked', title: 'Nothing staged to write', detail: 'Stage a change first.' },
    ENOPATH: { tone: 'blocked', title: 'This track has no local file', detail: 'Only local MP3s can be written.' },
    ENETWORK: { tone: 'error', title: 'Could not reach the server', detail: 'Your staged changes are still here — start the server and try again.' },
};

/**
 * One place that decides what a write result means, so the drawer, a
 * notification and a test all read the same verdict.
 */
export function describeWriteResult(result) {
    if (result?.ok) {
        // `paired: false` means the MP3 was written and no FLAC was; why goes on hover.
        const mp3Only = result.paired === false;
        return {
            tone: 'success',
            title: mp3Only ? `Written to disk · ${MP3_ONLY}` : 'Written to disk',
            hover: mp3Only ? mp3OnlyReason(result.pairReason) : '',
            detail: result.overrides?.length
                ? `${result.overrides.join(', ')} will be discarded if Rekordbox re-analyses this track.`
                : 'Verified against the file after writing.',
            canUndo: true,
        };
    }

    const errors = (result?.errors || []).join(' ');

    if (result?.code === 'EVERIFY') {
        return result.rolledBack
            ? {
                tone: 'error',
                title: 'Write did not land — the file was restored from its backup',
                detail: errors,
                canUndo: false,
            }
            : {
                tone: 'critical',
                title: 'Write did not land AND the restore failed',
                detail: `${errors} The file is left as written; its backup is still on disk.`,
                canUndo: false,
            };
    }

    const known = REFUSALS[result?.code];
    return {
        tone: known?.tone || 'error',
        title: known?.title || 'Write failed',
        detail: [known?.detail, errors].filter(Boolean).join(' ') || 'No further detail was reported.',
        canUndo: false,
    };
}

export class TrackReviewController {
    constructor({ database, pendingDiffs, fetchImpl, onChanged, onWritten } = {}) {
        if (!database) throw new TypeError('TrackReviewController requires a database');
        this.database = database;
        this.pendingDiffs = pendingDiffs || new PendingTagDiffs(database);
        this.fetchImpl = fetchImpl || ((...args) => fetch(...args));
        this.onChanged = onChanged || (() => {});
        this.onWritten = onWritten || (() => {});

        this.track = null;
        this.diffs = [];
        this.status = 'idle';   // idle | staged | writing | written | error
        this.writeId = null;
        this.lastResult = null;
        this._writtenDiffs = [];
        this._writeRequestId = null;
        this.rekordbox = null;  // null until checked | running | closed | unknown
    }

    get canWrite() {
        return !!trackPath(this.track);
    }

    async open(track) {
        this.track = track || null;
        this.rekordbox = null;
        this.writeId = null;
        this.lastResult = null;
        this._writtenDiffs = [];
        this._writeRequestId = null;
        await this.refresh();
        return this.diffs;
    }

    /** Re-read the buffer from IndexedDB — this is what survives a reload. */
    async refresh() {
        this.diffs = this.track ? await this.pendingDiffs.list(this.track.id) : [];
        this.status = this.diffs.length ? 'staged' : 'idle';
        this._notify();
        return this.diffs;
    }

    async stage({ field, proposedValue, source = 'manual' }) {
        if (!this.track) throw new Error('no track open');
        await this.pendingDiffs.stage({
            trackId: this.track.id,
            path: trackPath(this.track) || `umm:track/${this.track.id}`,
            field,
            oldValue: trackFieldValue(this.track, field),
            proposedValue,
            source,
        });
        return this.refresh();
    }

    async discard(field) {
        if (!this.track) return this.diffs;
        await this.pendingDiffs.discard(this.track.id, field);
        return this.refresh();
    }

    async discardAll() {
        if (!this.track) return this.diffs;
        await this.pendingDiffs.discardAll(this.track.id);
        return this.refresh();
    }

    /**
     * Write the staged changes, or only `fields` of them (Info's Save): the
     * rest stay staged, so a proposal from elsewhere is never written by it.
     */
    async write({ fields = null } = {}) {
        if (!this.track) return this._fail('ENOPATH');
        const chosen = fields ? this.diffs.filter((d) => fields.includes(d.field)) : this.diffs;
        if (!chosen.length) return this._fail('ENODIFF');
        const path = trackPath(this.track);
        if (!path) return this._fail('ENOPATH');

        const staged = chosen.map((d) => ({ ...d }));
        this.status = 'writing';
        this._notify();

        let result;
        try {
            this._writeRequestId ||= crypto.randomUUID();
            result = await this._post('/api/tags/write', {
                trackId: this.track.id,
                expectedRevision: Number(this.track.revision || 0),
                idempotencyKey: this._writeRequestId,
                path,
                patch: buildPatch(staged),
            });
        } catch (err) {
            // The buffer is untouched, so the user's work survives the outage.
            return this._fail('ENETWORK', [err?.message || 'request failed']);
        }

        if (!result?.ok) {
            this.status = 'error';
            this.lastResult = result;
            this._notify();
            return result;
        }

        // The server returns the SQLite row with every committed write; the
        // fallback covers a result without one (a fake server in tests).
        if (result.track) {
            this.track = result.track;
            await this.database.updateTrack(result.track);
        } else {
            await this._applyToTrack(staged, (d) => d.proposedValue);
        }
        if (fields) for (const d of staged) await this.pendingDiffs.discard(this.track.id, d.field);
        else await this.pendingDiffs.discardAll(this.track.id);

        this._writtenDiffs = staged;
        this.writeId = result.writeId || null;
        this.lastResult = result;
        this.diffs = fields ? await this.pendingDiffs.list(this.track.id) : [];
        this.status = 'written';
        this._writeRequestId = null;
        this._notify();
        try { this.onWritten(result); } catch (err) { console.error('onWritten threw', err); }
        return result;
    }

    async undo() {
        if (!this.writeId) return this._fail('ENOWRITE', ['nothing to undo']);

        let result;
        try {
            result = await this._post('/api/tags/undo', { writeId: this.writeId });
        } catch (err) {
            return this._fail('ENETWORK', [err?.message || 'request failed']);
        }

        if (!result?.ok) {
            // The write still stands on disk, so keep it undoable.
            this.lastResult = result;
            this._notify();
            return result;
        }

        if (result.track) {
            this.track = result.track;
            await this.database.updateTrack(result.track);
        } else {
            await this._applyToTrack(this._writtenDiffs, (d) => d.oldValue);
        }
        this._writtenDiffs = [];
        this.writeId = null;
        this.lastResult = result;
        this.status = 'idle';
        this._notify();
        return result;
    }

    /**
     * Check Rekordbox before a write or undo (`action`). Resolves true to go
     * ahead: always when Rekordbox is closed or the check can't tell, and
     * when running only if `confirm` agrees.
     */
    async confirmRekordbox(confirm, action = 'write') {
        try {
            const res = await this.fetchImpl('/api/tags/rekordbox');
            const body = await res.json();
            this.rekordbox = body?.rekordboxRunning === true ? 'running'
                : body?.rekordboxRunning === false ? 'closed' : 'unknown';
        } catch {
            this.rekordbox = 'unknown';
        }
        this._notify();
        if (this.rekordbox !== 'running') return true;
        return Boolean(await confirm(REKORDBOX_QUESTION[action] || REKORDBOX_QUESTION.write));
    }

    async _post(url, body) {
        const res = await this.fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        // The route returns its verdict as JSON on failure too, so the body is
        // read either way; only an unparseable response is a transport error.
        return res.json();
    }

    async _applyToTrack(diffs, pick) {
        if (!this.track || !diffs?.length) return;
        const next = { ...this.track };
        for (const diff of diffs) {
            next[TRACK_PROPERTY[diff.field] || diff.field] = pick(diff);
        }
        await this.database.updateTrack(next);
        this.track = next;
    }

    _fail(code, errors = []) {
        const result = { ok: false, code, errors };
        this.lastResult = result;
        if (this.status === 'writing') this.status = 'error';
        this._notify();
        return result;
    }

    _notify() {
        try { this.onChanged(this); } catch (err) { console.error('onChanged threw', err); }
    }
}

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------

/**
 * Renders one controller. Every file-touching action is a button press here;
 * there is no autosave, no debounce, and no keystroke that reaches disk except
 * the explicit ⌘↵ accelerator for the Write button.
 */
export class TrackReviewDrawer {
    constructor({ controller, onClosed, notify, confirm } = {}) {
        this.controller = controller;
        this.onClosed = onClosed || (() => {});
        this.notify = notify || (() => {});
        // Injectable so the app can supply its in-app confirm modal; the
        // native dialog is a fallback only (it is suppressed inside embedded
        // webviews and by some browser settings, which reads as a dead click).
        this.confirm = confirm || (async (message) => (typeof window !== 'undefined' && window.confirm ? window.confirm(message) : false));
        this.rootEl = null;
        this._open = false;
        // Re-render, and still tell whoever built the controller (the app's Tools count).
        const outer = this.controller.onChanged;
        this.controller.onChanged = (c) => {
            this.render();
            if (typeof outer === 'function') outer(c);
        };
    }

    mount(hostEl = document.body) {
        if (this.rootEl) return;
        const root = document.createElement('div');
        root.className = 'tr-root';
        root.innerHTML = `
            <div class="tr-backdrop" data-tr-close></div>
            <aside class="tr-drawer" role="dialog" aria-label="Review tag changes">
                <header class="tr-header">
                    <div class="tr-title-wrap">
                        <div class="tr-title" data-tr-track>Track</div>
                        <code class="tr-path" data-tr-path></code>
                    </div>
                    <button type="button" class="tr-close" data-tr-close aria-label="Close">&times;</button>
                </header>
                <div class="tr-body" data-tr-body></div>
                <footer class="tr-footer">
                    <div class="tr-status" data-tr-status></div>
                    <div class="tr-rekordbox" data-tr-rekordbox role="status" hidden></div>
                    <div class="tr-actions">
                        <button type="button" class="tr-btn tr-btn-ghost" data-tr-discard-all>Discard all</button>
                        <button type="button" class="tr-btn tr-btn-primary" data-tr-write>Write changes <kbd>⌘↵</kbd></button>
                        <button type="button" class="tr-btn tr-btn-undo" data-tr-undo hidden>Undo write</button>
                    </div>
                </footer>
            </aside>
        `;
        hostEl.appendChild(root);
        this.rootEl = root;

        root.querySelectorAll('[data-tr-close]').forEach((el) => el.addEventListener('click', () => this.close()));
        root.querySelector('[data-tr-discard-all]').addEventListener('click', () => this._discardAll());
        root.querySelector('[data-tr-write]').addEventListener('click', () => this._write());
        root.querySelector('[data-tr-undo]').addEventListener('click', () => this._undo());

        // Field-level edit + discard, delegated so re-renders keep working.
        root.querySelector('[data-tr-body]').addEventListener('click', (e) => {
            const discard = e.target.closest('[data-tr-discard]');
            if (discard) return void this.controller.discard(discard.dataset.trDiscard);
        });
        root.querySelector('[data-tr-body]').addEventListener('change', (e) => {
            const input = e.target.closest('[data-tr-field]');
            if (!input) return;
            const field = input.dataset.trField;
            const value = input.value;
            const current = this.controller.diffs.find((d) => d.field === field);
            if (current) {
                if (String(current.proposedValue ?? '') === value) return;
                // Typing the original value back means "never mind", not "stage
                // a write that changes nothing".
                if (String(current.oldValue ?? '') === value) return void this.controller.discard(field);
            } else if (String(trackFieldValue(this.controller.track, field)) === value) {
                return;
            }
            this.controller.stage({ field, proposedValue: value, source: 'manual' });
        });

        this._onKeydown = (e) => {
            if (!this._open) return;
            if (e.key === 'Escape') { this.close(); return; }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this._write(); }
        };
        document.addEventListener('keydown', this._onKeydown);
    }

    async open(track) {
        if (!this.rootEl) this.mount();
        await this.controller.open(track);
        this.rootEl.classList.add('tr-open');
        this._open = true;
        this.render();
    }

    close() {
        if (!this.rootEl) return;
        this.rootEl.classList.remove('tr-open');
        this._open = false;
        try { this.onClosed(); } catch (err) { console.error('onClosed threw', err); }
    }

    isOpen() { return this._open; }

    async _write() {
        return this.writeStaged(this.controller.track);
    }

    /**
     * The one write sequence, shared by the drawer's Write and Info's Save:
     * the Rekordbox check, the write, then a notification with Undo.
     * `fields` writes only those staged changes; `onUndone(track)` follows an Undo.
     */
    async writeStaged(track, { confirm = this.confirm, fields = null, onUndone = null } = {}) {
        const c = this.controller;
        if (track && String(c.track?.id) !== String(track.id)) await c.open(track);
        const pending = fields ? c.diffs.filter((d) => fields.includes(d.field)) : c.diffs;
        // Only ask when there is something to write; with nothing staged,
        // write() reports that itself.
        if (pending.length && !(await c.confirmRekordbox(confirm, 'write'))) return null;
        const result = await c.write({ fields });
        const view = describeWriteResult(result);
        const writeId = c.writeId;
        const undo = view.canUndo && writeId
            ? { action: { label: 'Undo', run: () => (c.writeId === writeId ? this._undo({ confirm, onUndone }) : null) } }
            : undefined;
        const opts = view.hover ? { ...undo, title: view.hover } : undo;
        this.notify(view.title, view.tone === 'success' ? 'success' : view.tone === 'blocked' ? 'info' : 'error', opts);
        return result;
    }

    async _undo({ confirm = this.confirm, onUndone = null } = {}) {
        const c = this.controller;
        if (c.writeId && !(await c.confirmRekordbox(confirm, 'undo'))) return null;
        const result = await c.undo();
        if (result?.ok) {
            this.notify('Write undone', 'success');
            try { onUndone?.(c.track); } catch (err) { console.error('onUndone threw', err); }
        } else this.notify(describeWriteResult(result).title, 'error');
        return result;
    }

    async _discardAll() {
        if (!this.controller.diffs.length) return;
        const n = this.controller.diffs.length;
        const ok = await this.confirm(`Discard ${n} staged change${n === 1 ? '' : 's'}? Nothing has been written to disk.`);
        if (!ok) return;
        await this.controller.discardAll();
    }

    render() {
        if (!this.rootEl) return;
        const c = this.controller;
        const track = c.track;
        const path = trackPath(track);

        this.rootEl.querySelector('[data-tr-track]').textContent =
            track ? `${track.artist || 'Unknown'} — ${track.title || 'Untitled'}` : 'Track';
        const pathEl = this.rootEl.querySelector('[data-tr-path]');
        pathEl.textContent = path || 'no local file';
        pathEl.classList.toggle('tr-path--none', !path);

        const byField = new Map(c.diffs.map((d) => [d.field, d]));
        this.rootEl.querySelector('[data-tr-body]').innerHTML = EDITABLE_FIELDS.map(({ field, label }) => {
            const diff = byField.get(field);
            const oldValue = diff ? diff.oldValue : trackFieldValue(track, field);
            const value = diff ? diff.proposedValue : trackFieldValue(track, field);
            return `
                <div class="tr-field${diff ? ' is-staged' : ''}">
                    <div class="tr-field-head">
                        <span class="tr-field-label">${escapeHtml(label)}</span>
                        ${OVERRIDE_FIELDS.has(field) ? '<span class="tr-badge tr-badge--override" title="Rekordbox may discard this on re-analysis">override</span>' : ''}
                        ${diff ? `<span class="tr-badge tr-badge--source">${escapeHtml(diff.source)}</span>` : ''}
                        ${diff ? `<button type="button" class="tr-field-discard" data-tr-discard="${escapeHtml(field)}" aria-label="Discard ${escapeHtml(label)}">discard</button>` : ''}
                    </div>
                    ${diff ? `<div class="tr-field-old"><span class="tr-old">${escapeHtml(oldValue) || '<em>empty</em>'}</span><span class="tr-arrow">→</span></div>` : ''}
                    <input type="text" class="tr-field-input" data-tr-field="${escapeHtml(field)}" value="${escapeHtml(value)}" ${path ? '' : 'disabled'}>
                </div>
            `;
        }).join('');

        const statusEl = this.rootEl.querySelector('[data-tr-status]');
        const writeBtn = this.rootEl.querySelector('[data-tr-write]');
        const undoBtn = this.rootEl.querySelector('[data-tr-undo]');
        const discardBtn = this.rootEl.querySelector('[data-tr-discard-all]');

        const view = c.lastResult ? describeWriteResult(c.lastResult) : null;
        statusEl.className = `tr-status${view ? ` tr-status--${view.tone}` : ''}`;
        statusEl.title = view?.hover || '';
        statusEl.innerHTML = c.status === 'writing'
            ? 'Writing…'
            : view
                ? `<strong>${escapeHtml(view.title)}</strong>${view.detail ? ` ${escapeHtml(view.detail)}` : ''}`
                : c.diffs.length
                    ? `${c.diffs.length} change${c.diffs.length === 1 ? '' : 's'} staged — nothing is written until you say so.`
                    : 'No pending changes.';

        const rekordboxEl = this.rootEl.querySelector('[data-tr-rekordbox]');
        const note = rekordboxNote(c.rekordbox);
        rekordboxEl.textContent = note;
        rekordboxEl.hidden = !note;

        writeBtn.disabled = c.status === 'writing' || !c.diffs.length || !c.canWrite;
        discardBtn.disabled = c.status === 'writing' || !c.diffs.length;
        undoBtn.hidden = !(c.status === 'written' && c.writeId);
        undoBtn.disabled = c.status === 'writing';
    }
}
