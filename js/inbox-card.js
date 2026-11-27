// Settings' Inbox and Other imports cards (spec 2026-11-21-inbox-card-design).
// Pure markup: the blocks the Import view had, with the same ids, so
// App._setupIngestUI, _setupCSVListeners and _setupOtherImports wire them as before.
import { escapeHtml as esc } from './html.js';
import { INBOX_DESKTOP_ONLY } from './desktop-only.js';

const desktopNote = `<p class="desktop-only-notice" role="note">${esc(INBOX_DESKTOP_ONLY)}</p>`;

/** The Inbox card: folders line (filled after render), inbox contents, drop zone, Scan inbox, progress, Pending Rekordbox import. */
export function inboxCardHtml() {
    return `
        <section class="settings-card" id="settingsInbox" aria-labelledby="settingsInboxTitle" tabindex="-1">
            <div class="settings-section-head"><h2 id="settingsInboxTitle">Inbox</h2></div>
            <p class="settings-folders muted" id="ingestFolders" hidden></p>
            ${desktopNote}
            <div class="ingest-inbox-list" id="ingestInboxList">
                <div class="ingest-inbox-header">
                    <strong>Inbox contents</strong>
                    <span class="muted" id="ingestInboxCount">loading…</span>
                </div>
                <div class="ingest-watcher-warning" id="ingestWatcherWarning" hidden></div>
                <ul class="ingest-inbox-files" id="ingestInboxFiles"></ul>
            </div>
            <div class="ingest-dropzone" id="ingestDropzone">
                <input type="file" id="ingestFileInput" accept=".flac,.wav,.aiff,.aif,.alac,.mp3,.m4a" multiple style="display:none">
                <div class="ingest-dropzone-label">
                    <strong>Drop FLAC / WAV / AIFF here</strong> or <button type="button" class="btn btn-link" id="ingestBrowseBtn">browse</button>
                </div>
            </div>
            <div class="import-actions">
                <button class="btn btn-secondary btn-sm" id="runIngestBtn">Scan inbox</button>
                <span class="import-status" id="ingestStatus"></span>
            </div>
            <div class="ingest-totals muted" id="ingestTotals"></div>
            <ul class="ingest-progress" id="ingestActive"></ul>
            <ul class="ingest-errors" id="ingestErrors"></ul>
            <div class="ingest-rekordbox" id="ingestRekordbox">
                <div class="ingest-rekordbox-header">
                    <strong>Pending Rekordbox import</strong>
                    <span class="muted" id="rekordboxPendingCount">—</span>
                </div>
                <p class="muted" id="rekordboxPendingHint">In Rekordbox, open the <strong>Pending Import</strong> playlist of <code>~/Music/umm.xml</code>.</p>
                <div class="import-actions">
                    <button type="button" class="btn btn-sm" id="rekordboxOpenFolderBtn">Show Paths</button>
                    <button type="button" class="btn btn-secondary btn-sm" id="rekordboxClearBtn">Mark Imported</button>
                    <span class="import-status" id="rekordboxStatus"></span>
                </div>
            </div>
        </section>`;
}

/** Rekordbox CSV and Playlist XML…, Shazam CSV, Bandcamp and Discogs, as on the Import view. */
export function otherImportsCardHtml({ hasBackend = false, bandcampAccounts = [], discogsAvailable = false, lastDiscogsImport = null, discogsTrackCount = 0 } = {}) {
    const n = bandcampAccounts.length;
    return `
        <section class="settings-card" id="settingsOtherImports" aria-labelledby="settingsOtherImportsTitle" tabindex="-1">
            <div class="settings-section-head"><h2 id="settingsOtherImportsTitle">Other imports</h2></div>
            ${desktopNote}
            <div class="import-row">
                <div class="import-section">
                    <h3>Rekordbox</h3>
                    <div class="import-actions">
                        <input type="file" id="rekordboxCSVInput" accept=".csv" style="display:none">
                        <button class="btn btn-sm" id="rekordboxCSVPickBtn">Track metadata CSV</button><button class="btn btn-sm" id="rekordboxPlaylistsBtn">Playlist XML…</button>
                        <input type="file" id="shazamCSVInput" accept=".csv" style="display:none">
                        <button class="btn btn-secondary btn-sm" id="shazamCSVPickBtn">Shazam CSV</button>
                    </div>
                    <span class="import-status" id="csvImportStatus"></span>
                </div>

                <div class="import-section">
                    <h3>Bandcamp ${n > 0 ? `<span class="muted">· ${n}</span>` : ''}</h3>
                    <div class="import-actions">
                        ${hasBackend ? `<input type="text" id="bandcampUsernameInput" placeholder="username" class="search-input" style="width:130px"><button class="btn btn-sm" id="bandcampScanBtn">Scan</button>` : ''}
                        <input type="file" id="bandcampFileInput" accept=".json" style="display:none">
                        <button class="btn btn-secondary btn-sm" id="bandcampJSONPickBtn">JSON</button>
                    </div>
                    <span class="import-status" id="bandcampImportStatus"></span>
                </div>

                <div class="import-section" id="otherImportsDiscogs">${discogsBlockHtml({ hasBackend, discogsAvailable, lastDiscogsImport, discogsTrackCount })}</div>
            </div>
        </section>`;
}

/** The Discogs block's contents; redrawn alone when the Discogs card connects or disconnects. */
export function discogsBlockHtml({ hasBackend = false, discogsAvailable = false, lastDiscogsImport = null, discogsTrackCount = 0 } = {}) {
    return `
                    <h3>Discogs ${discogsTrackCount > 0 ? `<span class="muted">· ${discogsTrackCount}</span>` : ''}</h3>
                    ${discogsAvailable ? `
                        <div class="import-actions">
                            <button class="btn btn-sm" id="discogsImportBtn">Import Collection</button>
                        </div>
                        <span class="import-status" id="discogsImportStatus">${lastDiscogsImport ? `Last: ${esc(new Date(lastDiscogsImport).toLocaleDateString())}` : ''}</span>
                    ` : `<p class="muted">${!hasBackend ? 'Start the server.' : 'Connect Discogs in the Discogs card below.'}</p>`}`;
}

/** The Other imports card's counts. Each source fails on its own, leaving its default. */
export async function otherImportsCounts({ getBandcampAccounts, getSetting, getTracks }) {
    const settle = async (fn, fallback) => { try { return (await fn()) ?? fallback; } catch (err) { console.warn('Other imports:', err); return fallback; } };
    const [bandcampAccounts, lastDiscogsImport, tracks] = await Promise.all([
        settle(getBandcampAccounts, []), settle(() => getSetting('discogs_last_import'), null), settle(getTracks, []),
    ]);
    return { bandcampAccounts, lastDiscogsImport, discogsTrackCount: tracks.filter((t) => t.source === 'discogs').length };
}

const FOLDERS = [['inbox', 'Inbox'], ['library', 'Library'], ['lossless', 'Lossless']];
const WATCH = {
    active: ['Watching', 'INGEST_WATCH is on.'],
    stopped: ['Watcher stopped', 'INGEST_WATCH is on, but the watcher stopped.'],
    disabled: ['Not watching', 'INGEST_WATCH is off.'],
};

/** `Inbox · Library · Lossless · Watching ⓘ`, each folder's full path on hover; '' with no folders. */
export function foldersLineHtml(paths, watcher) {
    const parts = FOLDERS.filter(([key]) => paths?.[key]).map(([key, label]) => `<span title="${esc(paths[key])}">${label}</span>`);
    if (!parts.length) return '';
    const [state, hint] = WATCH[watcher] || WATCH.disabled;
    parts.push(`<span title="${esc(hint)}">${state}</span>`);
    return `${parts.join(' · ')} <span class="settings-folders-info" title="Set in .env; restart with npm run app:restart.">ⓘ</span>`;
}
