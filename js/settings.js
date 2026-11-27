import { workspaceApi, workspaceDialog } from './playlists-workspace.js';
// Settings view + the preferences it owns.
//
// Preferences live in the IDB `settings` store like every other durable
// client preference (filter match mode, column order…). This module is the
// one place that knows their keys and allowed values, so the import modal
// and the Settings panel can't drift.

import { FAMILIES, exportBackup, inspectBackup, readExistingFor, planRestore, applyRestore, backupFilename } from './curation-backup.js';
import { releaseSourcesCardHtml, wireReleaseSourcesCard } from './release-sources-card.js';
import { clearPlayHistory } from './play-history.js';
import { escapeHtml } from './html.js';
import { readPeekMode, writePeekMode } from './graph/atlas-peek.js';

export const REKORDBOX_IMPORT_MODE_KEY = 'rekordbox_import_mode';
export const DISCOGS_DEVELOPER_URL = 'https://www.discogs.com/settings/developers';

/**
 * Which face the Discogs card shows.
 * @param {null|{connected:boolean,username:string|null,source:'env'|'settings'|null}} status
 */
export function discogsCardState(status, { hasBackend = true } = {}) {
    if (!hasBackend || !status) return { mode: 'offline', username: null };
    if (status.unavailable) return { mode: 'unavailable', username: null };
    if (!status.connected) return { mode: 'disconnected', username: null };
    return { mode: status.source === 'env' ? 'env' : 'connected', username: status.username || null };
}

export const DISCOGS_BACKGROUND_KEY = 'discogs_background';

/**
 * The queue status line, e.g. "Releases 1,920 of 6,087 · artists 0 of 4,597 · paused for rate limit".
 * @param {null|object} status GET /api/discogs/queue/status
 */
export function discogsQueueLine(status) {
    if (!status || !status.releases || !status.artists) return '';
    const n = (v) => Number(v || 0).toLocaleString('en-US');
    let line = `Releases ${n(status.releases.done)} of ${n(status.releases.total)} · artists ${n(status.artists.done)} of ${n(status.artists.total)}`;
    if (status.rateLimitedUntil) line += ' · paused for rate limit';
    else if (status.paused || status.enabled === false || status.started === false) line += ' · paused';
    else if (status.done) line += ' · done';
    return line;
}

const IMPORT_MODES = new Set(['ask', 'merge', 'replace']);

/** 'ask' | 'merge' | 'replace'. Unknown or missing → 'ask'. */
export async function readRekordboxImportMode(database) {
    let value = null;
    try { value = await database?.getSetting?.(REKORDBOX_IMPORT_MODE_KEY); } catch (_) { /* fall through */ }
    return IMPORT_MODES.has(value) ? value : 'ask';
}

export async function writeRekordboxImportMode(database, mode) {
    if (!IMPORT_MODES.has(mode)) throw new Error(`Unknown import mode: ${mode}`);
    await database.saveSetting(REKORDBOX_IMPORT_MODE_KEY, mode);
}

export const UP_NEXT_ON_NEW_LIST_KEY = 'playback_up_next_on_new_list';
const UP_NEXT_MODES = new Set(['ask', 'keep', 'clear']);

/** What starting a new list does to Up next: 'ask' | 'keep' | 'clear'. Unknown → 'ask'. */
export async function readUpNextOnNewList(database) {
    let value = null;
    try { value = await database?.getSetting?.(UP_NEXT_ON_NEW_LIST_KEY); } catch (_) { /* fall through */ }
    return UP_NEXT_MODES.has(value) ? value : 'ask';
}

export async function writeUpNextOnNewList(database, mode) {
    if (!UP_NEXT_MODES.has(mode)) throw new Error(`Unknown Up next mode: ${mode}`);
    await database.saveSetting(UP_NEXT_ON_NEW_LIST_KEY, mode);
}

/**
 * Render the Settings view into `container`.
 * @param {HTMLElement} container
 * @param {object} ctx
 * @param {object} ctx.database   MusicDatabase
 * @param {Function} [ctx.notify] (msg, kind) => void
 */
/** `leadingHtml` (the Inbox and Other imports cards, inbox-card.js) goes first. */
export async function renderSettingsView(container, { database, notify, skins, hasBackend = false, onDiscogsChanged, leadingHtml = '' } = {}) {
    document.getElementById('viewTitle').textContent = 'Settings';
    document.getElementById('viewSubtitle').textContent = 'Defaults you can change any time';

    const importMode = await readRekordboxImportMode(database);
    const upNextMode = await readUpNextOnNewList(database);
    const upNextOption = (value, label) => `
        <label class="settings-choice">
            <input type="radio" name="upNextOnNewList" value="${value}"${upNextMode === value ? ' checked' : ''}>
            <span class="settings-choice-body"><strong>${escapeHtml(label)}</strong></span>
        </label>`;
    // Graph › Peek (atlas-peek.js): a per-browser preference, read on every click on the map.
    const peekMode = readPeekMode();
    const peekOption = (value, label) => `
        <label class="settings-choice">
            <input type="radio" name="graphPeek" value="${value}"${peekMode === value ? ' checked' : ''}>
            <span class="settings-choice-body"><strong>${escapeHtml(label)}</strong></span>
        </label>`;
    const modeOption = (value, label, help) => `
        <label class="settings-choice">
            <input type="radio" name="rekordboxImportMode" value="${value}"${importMode === value ? ' checked' : ''}>
            <span class="settings-choice-body">
                <strong>${escapeHtml(label)}</strong>
                <span class="muted">${escapeHtml(help)}</span>
            </span>
        </label>`;

    container.innerHTML = `
        <div class="settings-view">
            ${leadingHtml}
            <section class="settings-card" aria-labelledby="appearanceTitle">
                <div class="settings-section-head"><h2 id="appearanceTitle">Appearance</h2>
                <p class="muted">Choose your palette. Table density is in Collection › ⋯ › Density.</p></div>
                <div data-appearance></div>
            </section>
            <section class="settings-card" aria-labelledby="settingsGraphTitle">
                <div class="settings-section-head">
                    <h2 id="settingsGraphTitle">Graph</h2>
                    <p class="muted">Peek at a node</p>
                </div>
                <div class="settings-choices" data-graph-peek role="radiogroup" aria-labelledby="settingsGraphTitle">
                    ${peekOption('follow', 'Click, with Info open')}
                    ${peekOption('ask', 'Alt-click')}
                </div>
            </section>
            <section class="settings-card" aria-labelledby="settingsDiscogsTitle">
                <div class="settings-section-head">
                    <h2 id="settingsDiscogsTitle">Discogs</h2>
                    <p class="muted">Needed for collection import, credits and gap analysis. Connecting verifies your token with Discogs.</p>
                </div>
                <div data-discogs-card class="muted">Checking…</div>
            </section>
            ${hasBackend ? releaseSourcesCardHtml() : ''}
            <section class="settings-card" aria-labelledby="settingsRekordboxTitle">
                <div class="settings-section-head">
                    <h2 id="settingsRekordboxTitle">Rekordbox import</h2>
                    <p class="muted">When an XML lands on a gig folder that already exists in UMM.</p>
                </div>
                <div class="settings-choices" data-import-mode>
                    ${modeOption('ask', 'Ask each time', 'Show the Merge / Replace step during import.')}
                    ${modeOption('replace', 'Always replace', 'Rekordbox wins. Matching playlists take Rekordbox’s tracks and order.')}
                    ${modeOption('merge', 'Always merge', 'Nothing lost. Keep UMM’s tracks and order, add what Rekordbox added.')}
                </div>
                <p class="muted settings-foot">Playlists only UMM has, including the auto-derived BPM playlist, are always kept.</p>
            </section>

            <section class="settings-card" aria-labelledby="settingsPlaybackTitle">
                <div class="settings-section-head">
                    <h2 id="settingsPlaybackTitle">Playback</h2>
                    <p class="muted">Up next when starting a new list</p>
                </div>
                <div class="settings-choices" data-up-next-mode role="radiogroup" aria-labelledby="settingsPlaybackTitle">
                    ${upNextOption('ask', 'Ask')}
                    ${upNextOption('keep', 'Keep')}
                    ${upNextOption('clear', 'Clear')}
                </div>
                <div class="settings-actions">
                    <button type="button" class="btn btn-sm btn-secondary" data-clear-play-history>Clear play history</button>
                </div>
            </section>

            <section class="settings-card" aria-labelledby="settingsBackupTitle">
                <div class="settings-section-head">
                    <h2 id="settingsBackupTitle">Backup</h2>
                    <p class="muted">Portable copies of your server-owned library, gigs, playlist snapshots and revisions. Audio files are not included.</p>
                </div>
                <div data-recovery-status class="muted">Loading recovery checkpoints…</div><div class="playlist-actions"><button class="btn btn-secondary" data-checkpoint-now>Back up now</button><button class="btn btn-secondary" data-checkpoint-restore>Restore checkpoint…</button><button class="btn btn-secondary" data-backup-destination>Second backup destination…</button></div><div class="settings-backup-grid">
                    <div class="settings-backup-col">
                        <h3 class="settings-subhead">Export</h3>
                        <div class="settings-checks" data-export-families>
                            ${Object.entries(FAMILIES).map(([key, f]) => `
                            <label class="settings-check">
                                <input type="checkbox" value="${key}" checked>
                                <span><strong>${escapeHtml(f.label)}</strong><span class="muted">${escapeHtml(f.help)}</span></span>
                            </label>`).join('')}
                        </div>
                        <div class="settings-actions">
                            <button type="button" class="btn btn-sm" data-export-btn>Export backup</button>
                            <span class="muted settings-status" data-export-status></span>
                        </div>
                    </div>
                    <div class="settings-backup-col">
                        <h3 class="settings-subhead">Import</h3>
                        <label class="settings-drop" for="settingsBackupFile">
                            <input type="file" id="settingsBackupFile" accept=".json,application/json" hidden>
                            <span><strong>Choose backup</strong> or drag a file here</span>
                        </label>
                        <div class="muted settings-status" data-import-status></div>
                    </div>
                </div>
                <div class="settings-import-preview" data-import-preview hidden></div>
            </section>
        </div>`;
    skins?.mountPicker(container.querySelector('[data-appearance]'));

    const group = container.querySelector('[data-import-mode]');
    group.addEventListener('change', async (e) => {
        const mode = e.target?.value;
        if (!IMPORT_MODES.has(mode)) return;
        try {
            await writeRekordboxImportMode(database, mode);
            notify?.(mode === 'ask' ? 'Import will ask each time.' : `Import will always ${mode}.`, 'success');
        } catch (err) {
            notify?.(`Could not save setting: ${err.message}`, 'error');
        }
    });

    container.querySelector('[data-graph-peek]')?.addEventListener('change', (e) => { if (e.target?.name === 'graphPeek') writePeekMode(e.target.value); });

    container.querySelector('[data-up-next-mode]')?.addEventListener('change', async (e) => {
        const mode = e.target?.value;
        if (!UP_NEXT_MODES.has(mode)) return;
        try {
            await writeUpNextOnNewList(database, mode);
        } catch (err) {
            notify?.(`Could not save setting: ${err.message}`, 'error');
        }
    });

    wireClearPlayHistory(container.querySelector('[data-clear-play-history]'), { notify });

    wireDiscogs(container, { hasBackend, notify, onDiscogsChanged, database });
    if (hasBackend) wireReleaseSourcesCard(container, { database });
    wireBackup(container, { database, notify });
}

// ── Clear play history (D7: kept until the user clears it) ───────────────

const confirmClearPlayHistory = () => workspaceDialog(
    'Clear play history?',
    '<p>Deletes every recorded play and skip. A recovery checkpoint is taken first.</p>',
    'Clear history',
).then(Boolean);

export function wireClearPlayHistory(button, { confirm = confirmClearPlayHistory, clear = clearPlayHistory, notify } = {}) {
    button?.addEventListener('click', async () => {
        if (button.disabled || !(await confirm())) return;
        button.disabled = true;
        try {
            await clear();
            notify?.('Play history cleared', 'success');
        } catch (err) {
            notify?.(`Could not clear play history: ${err.message}`, 'error');
        } finally {
            button.disabled = false;
        }
    });
}

// ── Backup section ───────────────────────────────────────────────────────

function wireBackup(container, { database, notify }) {
    const exportStatus = container.querySelector('[data-export-status]');
    const importStatus = container.querySelector('[data-import-status]');
    const preview = container.querySelector('[data-import-preview]');
    const fileInput = container.querySelector('#settingsBackupFile');
    const drop = container.querySelector('.settings-drop');

    const recoveryStatus = container.querySelector('[data-recovery-status]');
    workspaceApi('recovery').then(checkpoints => {
        const latest = checkpoints[0];
        recoveryStatus.textContent = latest ? `Last verified checkpoint: ${new Date(latest.createdAt).toLocaleString()} · ${latest.path} · ${latest.restoreTest}. Local backups do not protect against disk loss.` : 'No recovery checkpoints yet. Back up now to create one.';
    }).catch(e => { recoveryStatus.textContent = `Recovery unavailable: ${e.message}`; });
    container.querySelector('[data-checkpoint-now]').addEventListener('click', async () => {
        try { const result=await workspaceApi('backup',{}); recoveryStatus.textContent=`Verified checkpoint: ${result.path}`; } catch(e) { notify?.(e.message,'error'); }
    });
    container.querySelector('[data-backup-destination]').addEventListener('click', async () => {
        try {
            const choice=await workspaceDialog('Second backup destination','<p>Optional local or mounted-drive directory. Unified writes verified database copies here; no cloud upload is configured. Leave blank to disable.</p><label>Absolute directory<input name="path" placeholder="/Volumes/Backup/Unified"></label>','Save and test backup');
            if(!choice)return;
            const result=await workspaceApi('backup/destination',{path:choice.get('path')});
            recoveryStatus.textContent=result.secondary ? (result.secondary.copied ? `Secondary copy verified: ${result.secondary.destination}` : `Primary backup verified; secondary copy failed: ${result.secondary.error}`) : 'Secondary destination disabled. Local checkpoint verified.';
        } catch(e){notify?.(e.message,'error');}
    });
    container.querySelector('[data-checkpoint-restore]').addEventListener('click', async () => {
        try {
            const checkpoints=await workspaceApi('recovery');
            const choice=await workspaceDialog('Choose a recovery checkpoint',`<label>Checkpoint<select name="id">${checkpoints.map(c=>`<option value="${escapeHtml(c.id)}">${escapeHtml(c.createdAt)} · ${escapeHtml(c.reason)}</option>`).join('')}</select></label>`,'Preview restore');
            if(!choice) return;
            const preview=await workspaceApi('recovery/preview',{id:choice.get('id')});
            const accept=await workspaceDialog('Restore Unified data',`<p>${escapeHtml(preview.message)}</p><ul>${Object.entries(preview.counts).map(([s,n])=>`<li>${escapeHtml(s)}: ${n}</li>`).join('')}</ul><p>A verified checkpoint of the current database is taken first. Reload the app after restoring.</p>`,'Restore checkpoint');
            if(accept){await workspaceApi('recovery/commit',{id:preview.id,hash:preview.hash});notify?.('Restored Unified data. Reload the app. Handoff unchanged.','success');}
        } catch(e) {notify?.(e.message,'error');}
    });
    container.querySelector('[data-export-btn]')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const families = [...container.querySelectorAll('[data-export-families] input:checked')].map((i) => i.value);
        if (!families.length) { exportStatus.textContent = 'Pick at least one family.'; return; }
        btn.disabled = true;
        exportStatus.textContent = 'Reading…';
        try {
            const backup = await exportBackup(database, families);
            const text = JSON.stringify(backup, null, 1);
            const blob = new Blob([text], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = backupFilename();
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
            const rows = Object.values(backup.stores).reduce((n, r) => n + r.length, 0);
            exportStatus.textContent = `Saved ${a.download} · ${rows.toLocaleString()} rows · ${(blob.size / 1024 / 1024).toFixed(1)} MB`;
        } catch (err) {
            exportStatus.textContent = `Export failed: ${err.message}`;
            notify?.(`Export failed: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
        }
    });

    const handleFile = async (file) => {
        if (!file) return;
        preview.hidden = true;
        importStatus.textContent = `Reading ${file.name}…`;
        let backup;
        let info;
        try {
            backup = JSON.parse(await file.text());
            info = inspectBackup(backup);
        } catch (err) {
            importStatus.textContent = err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message;
            return;
        }
        try {
            await renderImportPreview({ backup, info, file });
            importStatus.textContent = '';
        } catch (err) {
            importStatus.textContent = `Could not read this browser's data: ${err.message}`;
            notify?.(`Could not prepare import: ${err.message}`, 'error');
        }
    };

    const renderImportPreview = async ({ backup, info, file }) => {
        const existing = await readExistingFor(database, backup);
        const draw = (mode) => {
            const plan = planRestore({ backup, existing, mode });
            const byFamily = {};
            for (const s of plan.stores) (byFamily[s.family] ||= []).push(s);
            const rows = Object.entries(byFamily).map(([fam, stores]) => {
                const t = stores.reduce((acc, s) => ({ added: acc.added + s.added, updated: acc.updated + s.updated, removed: acc.removed + s.removed }), { added: 0, updated: 0, removed: 0 });
                return `<li class="settings-plan-row">
                    <span class="settings-plan-name">${escapeHtml(FAMILIES[fam]?.label || fam)}<span class="muted"> · ${stores.map((s) => s.name).join(', ')}</span></span>
                    <span class="settings-plan-delta"><span class="settings-plan-add">+${t.added}</span> <span class="settings-plan-upd">~${t.updated}</span>${t.removed ? ` <span class="settings-plan-rm">−${t.removed}</span>` : ''}</span>
                </li>`;
            }).join('');
            return { plan, rows };
        };
        const when = info.exportedAt ? new Date(info.exportedAt).toLocaleString() : 'unknown date';
        preview.innerHTML = `
            <p class="settings-import-head"><strong>${escapeHtml(file.name)}</strong> <span class="muted">· exported ${escapeHtml(when)}${info.unknown.length ? ` · skipping unknown: ${escapeHtml(info.unknown.join(', '))}` : ''}</span></p>
            <div class="settings-choices settings-choices--row" data-restore-mode>
                <label class="settings-choice"><input type="radio" name="restoreMode" value="merge" checked><span class="settings-choice-body"><strong>Merge</strong><span class="muted">Update or add the file's rows. Keep local rows the file lacks.</span></span></label>
                <label class="settings-choice"><input type="radio" name="restoreMode" value="replace"><span class="settings-choice-body"><strong>Replace</strong><span class="muted">Each store in the file becomes exactly the file. Stores not in the file are untouched.</span></span></label>
            </div>
            <ul class="settings-plan" data-plan-rows></ul>
            <p class="muted settings-plan-legend">+ added · ~ updated · − removed</p>
            <div class="settings-actions">
                <button type="button" class="btn btn-sm" data-restore-btn>Merge into this browser</button>
                <button type="button" class="btn btn-sm btn-secondary" data-restore-cancel>Cancel</button>
            </div>`;
        preview.hidden = false;

        const planRows = preview.querySelector('[data-plan-rows]');
        const restoreBtn = preview.querySelector('[data-restore-btn]');
        const currentMode = () => preview.querySelector('input[name="restoreMode"]:checked')?.value || 'merge';
        const refresh = () => {
            const mode = currentMode();
            planRows.innerHTML = draw(mode).rows;
            restoreBtn.textContent = mode === 'merge' ? 'Merge into this browser' : 'Replace in this browser';
        };
        preview.querySelector('[data-restore-mode]').addEventListener('change', refresh);
        refresh();

        preview.querySelector('[data-restore-cancel]').addEventListener('click', () => { preview.hidden = true; fileInput.value = ''; });
        restoreBtn.addEventListener('click', async () => {
            const mode = currentMode();
            restoreBtn.disabled = true;
            restoreBtn.textContent = 'Writing…';
            try {
                const plan = await applyRestore(database, draw(mode).plan);
                const total = plan.stores.reduce((n, s) => n + s.added + s.updated, 0);
                importStatus.textContent = `${mode === 'merge' ? 'Merged' : 'Replaced'} ${total.toLocaleString()} rows. Reloading…`;
                notify?.(`Backup ${mode === 'merge' ? 'merged' : 'restored'}. Reloading.`, 'success');
                // Every in-memory cache (merged tracks, filter facets, badges)
                // keys off IDB; a reload is the honest way to rebuild them all.
                setTimeout(() => window.location.reload(), 600);
            } catch (err) {
                restoreBtn.disabled = false;
                refresh();
                importStatus.textContent = `Import failed: ${err.message}`;
                notify?.(`Import failed: ${err.message}`, 'error');
            }
        });
    };

    fileInput?.addEventListener('change', (e) => handleFile(e.target.files?.[0]));
    drop?.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
    drop?.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop?.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); handleFile(e.dataTransfer?.files?.[0]); });
}

// ── Discogs section ──────────────────────────────────────────────────────

async function fetchDiscogsStatus() {
    try {
        const res = await fetch('/api/discogs/auth', { signal: AbortSignal.timeout(3000) });
        if (res.status === 404) return { unavailable: true };
        return res.ok ? await res.json() : null;
    } catch (_) { return null; }
}

function wireDiscogs(container, { hasBackend, notify, onDiscogsChanged, database }) {
    const card = container.querySelector('[data-discogs-card]');
    if (!card) return;

    const render = (status) => {
        const { mode, username } = discogsCardState(status, { hasBackend });
        card.classList.remove('muted');
        if (mode === 'offline') {
            card.innerHTML = `<p class="muted">Cannot reach Discogs connection settings. Check that the server is running, then reload this page.</p>`;
            return;
        }
        if (mode === 'unavailable') {
            card.innerHTML = `<p class="muted">Restart the server to enable Discogs connection settings, then reload this page.</p>`;
            return;
        }
        if (mode === 'env') {
            card.innerHTML = `<p><strong>Connected</strong>${username ? ` as ${escapeHtml(username)}` : ''} <span class="muted">· set by DISCOGS_USER_TOKEN or DISCOGS_API_KEY in .env. Remove it there to manage the connection here.</span></p>`;
            wireDiscogsQueue(card, { database });
            return;
        }
        if (mode === 'connected') {
            card.innerHTML = `
                <p><strong>Connected</strong> as ${escapeHtml(username || 'unknown user')}</p>
                <div class="settings-actions">
                    <button type="button" class="btn btn-sm btn-secondary" data-discogs-disconnect>Disconnect</button>
                    <span class="muted settings-status" data-discogs-status></span>
                </div>`;
            wireDiscogsQueue(card, { database });
            card.querySelector('[data-discogs-disconnect]').addEventListener('click', async (e) => {
                const button = e.currentTarget;
                button.disabled = true;
                try {
                    const res = await fetch('/api/discogs/auth', { method: 'DELETE' });
                    const body = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(body.error || 'Could not disconnect');
                    notify?.('Discogs disconnected.', 'success');
                    onDiscogsChanged?.(body);
                    render(body);
                } catch (err) {
                    button.disabled = false;
                    notify?.(err.message, 'error');
                }
            });
            return;
        }
        // disconnected
        card.innerHTML = `
            <ol class="settings-steps">
                <li>Open <a href="${DISCOGS_DEVELOPER_URL}" target="_blank" rel="noopener">your Discogs developer settings</a> and press <strong>Generate new token</strong>.</li>
                <li>Copy the token and paste it here.</li>
            </ol>
            <form class="settings-actions" data-discogs-form>
                <input type="password" name="token" aria-label="Discogs personal access token" class="settings-input" placeholder="Paste personal access token" autocomplete="off" spellcheck="false" required>
                <button type="submit" class="btn btn-sm">Connect</button>
                <span class="muted settings-status" data-discogs-status></span>
            </form>`;
        const form = card.querySelector('[data-discogs-form]');
        const statusEl = card.querySelector('[data-discogs-status]');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const button = form.querySelector('button');
            const token = form.elements.token.value;
            button.disabled = true;
            statusEl.textContent = 'Checking with Discogs…';
            try {
                const res = await fetch('/api/discogs/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token }),
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(body.error || 'Could not connect');
                notify?.(`Connected to Discogs as ${body.username}.`, 'success');
                onDiscogsChanged?.(body);
                render(body);
            } catch (err) {
                button.disabled = false;
                statusEl.textContent = err.message;
            }
        });
    };

    if (hasBackend) fetchDiscogsStatus().then(render);
    else render(null);
}

// Background fetching: the switch, the status line and Pause / Resume for the
// server's Discogs queue. Polls while the card is on screen.
function wireDiscogsQueue(card, { database }) {
    const block = document.createElement('div');
    block.className = 'settings-queue';
    block.innerHTML = `
        <label class="settings-check"><input type="checkbox" data-queue-switch checked><span>Background fetching</span></label>
        <div class="settings-actions">
            <span class="muted settings-status" data-queue-line></span>
            <button type="button" class="btn btn-sm btn-secondary" data-queue-pause hidden>Pause</button>
        </div>
        <p class="settings-status" data-queue-blocked hidden>Discogs rejected the token</p>`;
    card.appendChild(block);
    const toggle = block.querySelector('[data-queue-switch]');
    const line = block.querySelector('[data-queue-line]');
    const pause = block.querySelector('[data-queue-pause]');
    const blocked = block.querySelector('[data-queue-blocked]');
    let status = null;

    const paint = (next) => {
        status = next;
        toggle.checked = next ? next.enabled !== false : true;
        line.textContent = discogsQueueLine(next);
        blocked.hidden = !next?.blocked;
        pause.hidden = !next || next.enabled === false;
        pause.textContent = next?.paused ? 'Resume' : 'Pause';
    };
    const refresh = async () => {
        if (!block.isConnected) { clearInterval(timer); return; }
        try {
            const res = await fetch('/api/discogs/queue/status', { signal: AbortSignal.timeout(3000) });
            paint(res.ok ? await res.json() : null);
        } catch (_) { paint(null); }
    };
    const timer = setInterval(refresh, 5000);

    toggle.addEventListener('change', async () => {
        try { await database?.saveSetting?.(DISCOGS_BACKGROUND_KEY, toggle.checked); } catch (_) { /* the next poll shows the real state */ }
        refresh();
    });
    pause.addEventListener('click', async () => {
        try { await fetch(`/api/discogs/queue/${status?.paused ? 'resume' : 'pause'}`, { method: 'POST' }); } catch (_) { /* silent */ }
        refresh();
    });
    refresh();
}
