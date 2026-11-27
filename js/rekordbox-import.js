// Rekordbox XML → UMM gig import flow.
//
// the user already builds gig folders inside Rekordbox by hand. This module lets
// them drop the resulting XML into UMM, pick which folder/playlists to ingest,
// then materialize a gig that round-trips back through `/api/rekordbox/export`
// and shows up in Rekordbox's rekordbox-xml sidebar tree (file Locations
// dedupe against their existing Collection — no audio re-import).
//
// Steps in the flow:
//   1. File picker → POST to /api/rekordbox/import-parse → server returns
//      { folders, tracks, summary }.
//   2. Folder/playlist picker (tree with checkboxes).
//   3. Target: update an existing gig (preselected when the XML folder name
//      matches a gig, or pinned when opened from a gig's detail view) or
//      create a new one (name + optional date).
//   3b. Existing target only: Merge or Replace (see gig-sync.js), with a
//      "make this my default" checkbox. Skipped when a default is saved.
//   4. Confirm — match preview against the UMM library, plus a per-lane
//      added/removed preview when updating an existing gig.
//   5. On confirm: ensure each unique track exists in IDB (matched by absolute
//      local path; otherwise create a `source: 'rekordbox-xml'` record with a
//      stable id derived from the absolute path), then either create the gig
//      with one lane per selected playlist + an auto-derived BPM lane, or
//      rewrite the existing gig's lanes from the sync plan.
//
// House rules respected:
//   - No file writes. Only IDB mutations (library tracks + gigs store).
//   - Stable ids prevent dupe library records on re-import.
//   - Playwright-style ids (`rbxml_<32-bit-hash>`) so we don't collide with
//     existing `rb_*` records (which key off artist|title|album, not path).

import { createGig, getGig, setGigPlaylists, ensureBpmRollFlag } from './gigs.js';
import { planGigSync, matchGigByName } from './gig-sync.js';
import { escapeHtml } from './html.js';

// FNV-1a 32-bit hash → base36, stable across browsers + sessions.
function pathHash(s) {
    let h = 0x811c9dc5;
    const str = String(s);
    for (let i = 0; i < str.length; i += 1) {
        h ^= str.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return h.toString(36);
}

// Mac filesystems are usually case-insensitive but path strings are
// case-preserving, and a name can be spelled precomposed (NFC) or decomposed
// (NFD). Try exact first; fall back to NFC lowercase. Returns the matched
// UMM library record or null.
//
// A track whose stored path was rewritten (Tools › File paths) also answers to
// its `previous_paths`: Rekordbox keeps the old Location until it is relocated
// there, and an unmatched path would create a duplicate `rbxml_` row. Current
// paths are indexed first, so a live row always wins over a former one.
export function buildPathIndex(libraryTracks) {
    const exact = new Map();
    const lower = new Map();
    const add = (p, t) => {
        if (!p) return;
        if (!exact.has(p)) exact.set(p, t);
        const lp = p.normalize('NFC').toLowerCase();
        if (!lower.has(lp)) lower.set(lp, t);
    };
    const tracks = libraryTracks || [];
    for (const t of tracks) add(t.local_path || t.path || '', t);
    for (const t of tracks) {
        for (const p of Array.isArray(t.previous_paths) ? t.previous_paths : []) add(String(p || ''), t);
    }
    return {
        find(absPath) {
            if (!absPath) return { match: null };
            const direct = exact.get(absPath);
            if (direct) return { match: direct, fallback: false };
            const lc = lower.get(absPath.normalize('NFC').toLowerCase());
            if (lc) return { match: lc, fallback: true };
            return { match: null };
        },
    };
}

// Build a UMM track record from an RB XML track payload (the `tracks[id]`
// shape returned by /api/rekordbox/import-parse).
function makeRekordboxXmlTrack(rbTrack) {
    const path = rbTrack.decodedPath || '';
    const id = `rbxml_${pathHash(path || `${rbTrack.artist}|${rbTrack.name}|${rbTrack.album}`)}`;
    const comments = rbTrack.comments || '';
    const tags = comments
        ? comments.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    return {
        id,
        title: rbTrack.name || '',
        artist: rbTrack.artist || '',
        album: rbTrack.album || '',
        genre: rbTrack.genre || '',
        label: rbTrack.label || '',
        year: rbTrack.year || null,
        bpm: rbTrack.bpm || null,
        comments,
        tags,
        tonality: rbTrack.tonality || '',
        duration: rbTrack.totalTimeSec || 0,
        platform: 'local',
        source: 'rekordbox-xml',
        availability: path ? 'local' : 'unknown',
        local_path: path,
        date_added: rbTrack.dateAdded || '',
        play_count: rbTrack.playCount || 0,
        last_played: '',
        coverArt: path ? `local:${id}` : null,
        coverArt_source: path ? 'local' : null,
        rekordbox_xml_id: rbTrack.rbTrackId || null,
    };
}

// ── Modal shell ──────────────────────────────────────────────────────────

function modalShell(title) {
    const backdrop = document.createElement('div');
    backdrop.className = 'enrich-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'enrich-dialog rbximport-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', title);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    return { backdrop, dialog };
}

function closeShell(backdrop, escHandler) {
    backdrop.remove();
    if (escHandler) document.removeEventListener('keydown', escHandler);
}

/**
 * Open the Rekordbox-import modal flow. Returns when the user finishes the
 * flow OR cancels. Resolves to either:
 *   - { gigId, gigName, playlistsImported, totalTracks }
 *   - null on cancel
 *
 * @param {object} ctx
 * @param {object} ctx.database         the MusicDatabase instance
 * @param {Function} ctx.fetchAllTracks () => Promise<Track[]>  unfiltered IDB roster
 * @param {Function} [ctx.notify]       (msg, kind) => void
 * @param {Function} [ctx.listGigs]     () => Promise<Gig[]>  existing gigs for the target picker
 * @param {string}   [ctx.targetGigId]  pin the target to this gig (skips the picker)
 * @param {Function} [ctx.getDefaultMode] () => Promise<'ask'|'merge'|'replace'>
 * @param {Function} [ctx.setDefaultMode] (mode) => Promise<void>
 */
export async function openRekordboxImportModal({
    database, fetchAllTracks, notify, listGigs, targetGigId = null, getDefaultMode, setDefaultMode,
} = {}) {
    if (!database) throw new Error('database required');
    return new Promise((resolve) => {
        const { backdrop, dialog } = modalShell('Import from Rekordbox');
        const escHandler = (e) => { if (e.key === 'Escape') finalize(null); };
        document.addEventListener('keydown', escHandler);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finalize(null); });

        let parsed = null;             // server /api/rekordbox/import-parse response
        let selectedTids = null;       // Set<string> all RB-* trackIds across selected playlists
        let selectedFolderName = null; // first selected folder's name (used as gig-name seed)
        let selectedPlaylists = [];    // [{ name, folderName, trackIds }]
        let gigName = '';
        let gigDate = null;
        let targetGig = null;          // existing gig record when updating; null → create new
        let mode = null;               // 'merge' | 'replace' when targetGig is set
        let modeStepShown = false;     // so Back from confirm knows where to land
        let pendingDefault = null;     // mode to save as default, written only on a successful commit

        function finalize(result) {
            closeShell(backdrop, escHandler);
            resolve(result);
        }

        // ── Step 1 ──────────────────────────────────────────────────────
        function renderStep1() {
            dialog.innerHTML = `
                <div class="enrich-head">
                    <h2>Import from Rekordbox</h2>
                    <p class="muted">Drop a Rekordbox XML export to build a UMM gig folder.</p>
                </div>
                <div class="enrich-body rbximport-step1">
                    <label class="rbximport-drop" for="rbximportFile">
                        <input type="file" id="rbximportFile" accept=".xml" hidden>
                        <span class="rbximport-drop-prompt">
                            <strong>Choose XML</strong> or drag a file here
                        </span>
                        <span class="muted rbximport-drop-hint">From Rekordbox: File → Export → Export Collection in xml format</span>
                    </label>
                    <div class="rbximport-status muted" data-status></div>
                </div>
                <div class="enrich-foot">
                    <div class="enrich-foot-left"></div>
                    <div class="enrich-foot-right">
                        <button type="button" class="btn btn-secondary" data-cancel>Cancel</button>
                    </div>
                </div>`;

            const fileInput = dialog.querySelector('#rbximportFile');
            const statusEl = dialog.querySelector('[data-status]');
            const drop = dialog.querySelector('.rbximport-drop');
            dialog.querySelector('[data-cancel]').addEventListener('click', () => finalize(null));

            const handleFile = async (file) => {
                if (!file) return;
                statusEl.textContent = `Parsing ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)…`;
                try {
                    const fd = new FormData();
                    fd.append('file', file);
                    const res = await fetch('/api/rekordbox/import-parse', { method: 'POST', body: fd });
                    if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(err.error || `HTTP ${res.status}`);
                    }
                    parsed = await res.json();
                    renderStep2();
                } catch (err) {
                    statusEl.innerHTML = `<span class="error">Parse failed: ${escapeHtml(err.message)}</span>`;
                }
            };

            fileInput.addEventListener('change', (e) => handleFile(e.target.files?.[0]));
            drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
            drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
            drop.addEventListener('drop', (e) => {
                e.preventDefault();
                drop.classList.remove('is-over');
                handleFile(e.dataTransfer?.files?.[0]);
            });
        }

        // ── Step 2 ──────────────────────────────────────────────────────
        function renderStep2() {
            const folders = parsed?.folders || [];
            const summary = parsed?.summary || {};
            // Default selection: nothing checked.
            const folderHtml = folders.map((folder, fIdx) => {
                const playlistRows = folder.playlists.map((p, pIdx) => {
                    const inScope = p.trackIds.filter((tid) => parsed.tracks?.[tid]?.pathInScope).length;
                    return `
                        <li class="rbximport-playlist">
                            <label>
                                <input type="checkbox" data-folder-idx="${fIdx}" data-playlist-idx="${pIdx}">
                                <span class="rbximport-pl-name">${escapeHtml(p.name)}</span>
                                <span class="rbximport-pl-count">${p.trackCount}</span>
                                ${inScope < p.trackCount
                                    ? `<span class="rbximport-pl-scope muted">${inScope}/${p.trackCount} in library</span>`
                                    : ''}
                            </label>
                        </li>`;
                }).join('');
                return `
                    <li class="rbximport-folder" data-folder-idx="${fIdx}">
                        <div class="rbximport-folder-head">
                            <button type="button" class="rbximport-folder-toggle" aria-expanded="false" aria-label="Toggle folder">▸</button>
                            <label class="rbximport-folder-label">
                                <input type="checkbox" data-folder-toggle="${fIdx}">
                                <strong>${escapeHtml(folder.name)}</strong>
                                <span class="muted">${escapeHtml(folder.path)}</span>
                                <span class="rbximport-folder-count">${folder.playlists.length} playlist${folder.playlists.length === 1 ? '' : 's'}</span>
                            </label>
                        </div>
                        <ul class="rbximport-playlists" hidden>${playlistRows}</ul>
                    </li>`;
            }).join('');

            dialog.innerHTML = `
                <div class="enrich-head">
                    <h2>Pick playlists</h2>
                    <p class="muted">${summary.tracksTotal || 0} tracks · ${summary.folders || 0} folders · ${summary.pathInScope || 0} in scope · ${summary.pathOutOfScope || 0} outside library roots${summary.noPath ? ` · ${summary.noPath} no path` : ''}</p>
                </div>
                <div class="enrich-body rbximport-tree">
                    ${folders.length ? `<ul class="rbximport-folders">${folderHtml}</ul>` : '<p class="muted">No folders found in this XML.</p>'}
                </div>
                <div class="enrich-foot">
                    <div class="enrich-foot-left">
                        <span class="muted" data-selection-count>0 selected</span>
                    </div>
                    <div class="enrich-foot-right">
                        <button type="button" class="btn btn-secondary" data-back>Back</button>
                        <button type="button" class="btn" data-next disabled>Next</button>
                    </div>
                </div>`;

            const updateCount = () => {
                const checkboxes = dialog.querySelectorAll('input[data-playlist-idx]:checked');
                const selectionCountEl = dialog.querySelector('[data-selection-count]');
                const nextBtn = dialog.querySelector('[data-next]');
                selectionCountEl.textContent = `${checkboxes.length} selected`;
                nextBtn.disabled = checkboxes.length === 0;
            };

            // Folder expand/collapse.
            dialog.querySelectorAll('.rbximport-folder-toggle').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const li = btn.closest('.rbximport-folder');
                    const ul = li.querySelector('.rbximport-playlists');
                    const open = ul.hasAttribute('hidden');
                    if (open) { ul.removeAttribute('hidden'); btn.textContent = '▾'; btn.setAttribute('aria-expanded', 'true'); }
                    else { ul.setAttribute('hidden', ''); btn.textContent = '▸'; btn.setAttribute('aria-expanded', 'false'); }
                });
            });
            // Folder-level select toggles all child playlists.
            dialog.querySelectorAll('input[data-folder-toggle]').forEach((cb) => {
                cb.addEventListener('change', (e) => {
                    const idx = e.target.dataset.folderToggle;
                    const childCbs = dialog.querySelectorAll(`input[data-folder-idx="${idx}"][data-playlist-idx]`);
                    childCbs.forEach((c) => { c.checked = e.target.checked; });
                    // Expand the folder so the user sees the selection effect.
                    const li = e.target.closest('.rbximport-folder');
                    const ul = li.querySelector('.rbximport-playlists');
                    if (e.target.checked && ul.hasAttribute('hidden')) {
                        ul.removeAttribute('hidden');
                        const tBtn = li.querySelector('.rbximport-folder-toggle');
                        if (tBtn) { tBtn.textContent = '▾'; tBtn.setAttribute('aria-expanded', 'true'); }
                    }
                    updateCount();
                });
            });
            dialog.querySelectorAll('input[data-playlist-idx]').forEach((cb) => {
                cb.addEventListener('change', updateCount);
            });

            dialog.querySelector('[data-back]').addEventListener('click', () => renderStep1());
            dialog.querySelector('[data-next]').addEventListener('click', () => {
                // Capture selection.
                selectedTids = new Set();
                let selectedFolders = new Set();
                let firstFolderName = null;
                dialog.querySelectorAll('input[data-playlist-idx]:checked').forEach((cb) => {
                    const fIdx = Number(cb.dataset.folderIdx);
                    const pIdx = Number(cb.dataset.playlistIdx);
                    const folder = folders[fIdx];
                    const playlist = folder?.playlists?.[pIdx];
                    if (!playlist) return;
                    selectedFolders.add(fIdx);
                    if (firstFolderName == null) firstFolderName = folder.name;
                    for (const tid of playlist.trackIds) selectedTids.add(tid);
                });
                selectedFolderName = (selectedFolders.size === 1) ? firstFolderName : null;
                // Capture the selected playlists (in DOM order = display order).
                selectedPlaylists = [];
                dialog.querySelectorAll('input[data-playlist-idx]:checked').forEach((cb) => {
                    const fIdx = Number(cb.dataset.folderIdx);
                    const pIdx = Number(cb.dataset.playlistIdx);
                    const folder = folders[fIdx];
                    const playlist = folder?.playlists?.[pIdx];
                    if (!playlist) return;
                    selectedPlaylists.push({
                        name: playlist.name,
                        folderName: folder.name,
                        trackIds: [...playlist.trackIds],
                    });
                });
                renderStep3();
            });
        }

        // ── Step 3 ──────────────────────────────────────────────────────
        async function renderStep3() {
            // Pinned target (opened from a gig's detail view): no picker.
            if (targetGigId) {
                targetGig = await getGig(database, targetGigId);
                if (targetGig) {
                    gigName = targetGig.name;
                    return renderModeStep();
                }
            }

            const gigs = typeof listGigs === 'function' ? (await listGigs()) || [] : [];
            const seedName = selectedFolderName || 'Imported gig';
            const preselected = matchGigByName(gigs, selectedFolderName);
            const useExisting = !!preselected;
            const gigOptions = gigs.map((g) => `
                <option value="${escapeHtml(g.id)}"${preselected?.id === g.id ? ' selected' : ''}>${escapeHtml(g.name)}${g.gigDate ? ` · ${escapeHtml(g.gigDate)}` : ''}</option>`).join('');

            dialog.innerHTML = `
                <div class="enrich-head">
                    <h2>Where should this land?</h2>
                    <p class="muted">${selectedPlaylists.length} playlist${selectedPlaylists.length === 1 ? '' : 's'} · ${selectedTids.size} unique tracks</p>
                </div>
                <div class="enrich-body rbximport-name">
                    ${gigs.length ? `
                    <label class="rbximport-target">
                        <input type="radio" name="rbximportTarget" value="existing"${useExisting ? ' checked' : ''}>
                        <span class="rbximport-target-body">
                            <strong>Update an existing gig</strong>
                            <select class="rbximport-input" data-gig-select>${gigOptions}</select>
                            ${preselected ? '<span class="muted rbximport-help">Matched by folder name.</span>' : ''}
                        </span>
                    </label>` : ''}
                    <label class="rbximport-target">
                        <input type="radio" name="rbximportTarget" value="new"${useExisting ? '' : ' checked'}>
                        <span class="rbximport-target-body">
                            <strong>Create a new gig folder</strong>
                            <span class="rbximport-field">
                                <span class="rbximport-field-label">Gig folder name</span>
                                <input type="text" class="rbximport-input" data-gig-name value="${escapeHtml(seedName)}">
                            </span>
                            <span class="rbximport-field">
                                <span class="rbximport-field-label">Gig date <span class="muted">(optional)</span></span>
                                <input type="date" class="rbximport-input" data-gig-date value="">
                            </span>
                            <span class="muted rbximport-help">Each selected playlist becomes a playlist in the gig folder. A "BPM" playlist (auto-sorted by BPM) is appended.</span>
                        </span>
                    </label>
                </div>
                <div class="enrich-foot">
                    <div class="enrich-foot-left"></div>
                    <div class="enrich-foot-right">
                        <button type="button" class="btn btn-secondary" data-back>Back</button>
                        <button type="button" class="btn" data-next>Next</button>
                    </div>
                </div>`;

            const nameInput = dialog.querySelector('[data-gig-name]');
            const dateInput = dialog.querySelector('[data-gig-date]');
            const gigSelect = dialog.querySelector('[data-gig-select]');
            const nextBtn = dialog.querySelector('[data-next]');
            const radios = dialog.querySelectorAll('input[name="rbximportTarget"]');
            const currentChoice = () => dialog.querySelector('input[name="rbximportTarget"]:checked')?.value || 'new';
            // Card highlight is pure CSS (:has(input:checked)); JS only gates Next.
            const refresh = () => {
                nextBtn.disabled = currentChoice() === 'new' && !nameInput.value.trim();
            };
            radios.forEach((r) => r.addEventListener('change', refresh));
            nameInput.addEventListener('input', refresh);
            // Typing in a field selects its card.
            nameInput.addEventListener('focus', () => { dialog.querySelector('input[name="rbximportTarget"][value="new"]').checked = true; refresh(); });
            gigSelect?.addEventListener('focus', () => { dialog.querySelector('input[name="rbximportTarget"][value="existing"]').checked = true; refresh(); });
            refresh();

            dialog.querySelector('[data-back]').addEventListener('click', () => renderStep2());
            nextBtn.addEventListener('click', async () => {
                if (currentChoice() === 'existing' && gigSelect?.value) {
                    targetGig = await getGig(database, gigSelect.value);
                    if (!targetGig) return;
                    gigName = targetGig.name;
                    gigDate = targetGig.gigDate || null;
                    return renderModeStep();
                }
                const next = nameInput.value.trim();
                if (!next) return;
                targetGig = null;
                mode = null;
                gigName = next;
                gigDate = dateInput.value || null;
                await renderStep4();
            });
        }

        // ── Step 3b: merge or replace ───────────────────────────────────
        async function renderModeStep({ viaBack = false } = {}) {
            // A saved default skips this step on the way forward only; Back
            // must always land here so the mode stays changeable.
            const saved = (!viaBack && typeof getDefaultMode === 'function') ? await getDefaultMode() : 'ask';
            if (saved === 'merge' || saved === 'replace') {
                mode = saved;
                modeStepShown = false;
                return renderStep4();
            }
            modeStepShown = true;
            const current = mode || 'replace';
            dialog.innerHTML = `
                <div class="enrich-head">
                    <h2>Bring Rekordbox edits into "${escapeHtml(targetGig.name)}"</h2>
                    <p class="muted">Playlists match by name. Playlists only UMM has are always kept.</p>
                </div>
                <div class="enrich-body rbximport-name">
                    <label class="rbximport-target">
                        <input type="radio" name="rbximportMode" value="replace"${current === 'replace' ? ' checked' : ''}>
                        <span class="rbximport-target-body">
                            <strong>Replace</strong>
                            <span class="muted rbximport-help">Rekordbox wins. Each matching playlist takes Rekordbox's tracks and order.</span>
                        </span>
                    </label>
                    <label class="rbximport-target">
                        <input type="radio" name="rbximportMode" value="merge"${current === 'merge' ? ' checked' : ''}>
                        <span class="rbximport-target-body">
                            <strong>Merge</strong>
                            <span class="muted rbximport-help">Nothing lost. Keeps UMM's tracks and order, then adds what Rekordbox added.</span>
                        </span>
                    </label>
                    <label class="rbximport-default">
                        <input type="checkbox" data-make-default${pendingDefault ? ' checked' : ''}>
                        <span>Make this my default and skip this step <span class="muted">(change it later in Settings)</span></span>
                    </label>
                </div>
                <div class="enrich-foot">
                    <div class="enrich-foot-left"></div>
                    <div class="enrich-foot-right">
                        <button type="button" class="btn btn-secondary" data-back>Back</button>
                        <button type="button" class="btn" data-next>Next</button>
                    </div>
                </div>`;

            dialog.querySelector('[data-back]').addEventListener('click', () => (targetGigId ? renderStep2() : renderStep3()));
            dialog.querySelector('[data-next]').addEventListener('click', async () => {
                mode = dialog.querySelector('input[name="rbximportMode"]:checked')?.value || 'replace';
                pendingDefault = dialog.querySelector('[data-make-default]')?.checked ? mode : null;
                await renderStep4();
            });
        }

        // ── Step 4 ──────────────────────────────────────────────────────
        async function renderStep4() {
            // Compute the match preview.
            const all = await fetchAllTracks();
            const idx = buildPathIndex(all);
            const playlists = selectedPlaylists;

            let matched = 0;
            let toCreate = 0;
            let unmatched = 0; // path-in-scope but no library record
            let outOfScope = 0;
            let noPath = 0;

            const seen = new Set();
            for (const pl of playlists) {
                for (const tid of pl.trackIds) {
                    if (seen.has(tid)) continue;
                    seen.add(tid);
                    const rb = parsed.tracks?.[tid];
                    if (!rb) { unmatched += 1; continue; }
                    if (!rb.decodedPath) { noPath += 1; continue; }
                    const { match } = idx.find(rb.decodedPath);
                    if (match) matched += 1;
                    else if (rb.pathInScope) { toCreate += 1; }
                    else { outOfScope += 1; toCreate += 1; }
                }
            }

            // One tid→UMM-id mapping serves the preview and the commit, so the
            // numbers shown are the numbers written.
            const mapped = mapIncomingLanes({ parsed, idx, playlists });
            const plan = targetGig
                ? planGigSync({ lanes: targetGig.playlists || [], incoming: mapped.lanes, mode })
                : null;
            const laneRows = plan ? plan.summary.map((row) => {
                const note = row.status === 'new' ? 'new playlist'
                    : row.status === 'kept' ? 'only in UMM · kept'
                    : row.status === 'skipped' ? 'auto-derived · skipped'
                    : `${mode === 'merge' ? 'merged' : 'replaced'}`;
                const delta = row.status === 'kept' || row.status === 'skipped' ? ''
                    : `<span class="rbximport-delta"><span class="rbximport-delta-add">+${row.added}</span>${row.removed ? ` <span class="rbximport-delta-rm">−${row.removed}</span>` : ''}</span>`;
                return `<li class="rbximport-lane rbximport-lane--${row.status}"><span class="rbximport-lane-name">${escapeHtml(row.name)}</span><span class="muted rbximport-lane-note">${note}</span>${delta}</li>`;
            }).join('') : '';

            const totalUnique = seen.size;
            const verb = targetGig ? (mode === 'merge' ? 'Merge into gig' : 'Replace in gig') : 'Create gig folder';
            dialog.innerHTML = `
                <div class="enrich-head">
                    <h2>Confirm ${targetGig ? (mode === 'merge' ? 'merge' : 'replace') : 'import'}</h2>
                    <p class="muted">${escapeHtml(gigName)} · ${playlists.length} playlist${playlists.length === 1 ? '' : 's'} · ${totalUnique} unique tracks</p>
                </div>
                <div class="enrich-body rbximport-confirm">
                    ${plan ? `<ul class="rbximport-lanes">${laneRows}</ul>` : ''}
                    <ul class="rbximport-stats">
                        <li><strong>${matched}</strong> matched in your UMM library</li>
                        <li><strong>${toCreate}</strong> new (will be added as Rekordbox-only library records)</li>
                        ${outOfScope ? `<li class="muted">${outOfScope} of those have file paths outside LIBRARY_DIR / LOSSLESS_DIR — they'll skip on Rekordbox export</li>` : ''}
                        ${noPath ? `<li class="muted">${noPath} have no file path — informational records only</li>` : ''}
                    </ul>
                    <p class="muted">Library records use stable IDs derived from the file path, so re-importing the same XML won't duplicate.</p>
                </div>
                <div class="enrich-foot">
                    <div class="enrich-foot-left"></div>
                    <div class="enrich-foot-right">
                        <button type="button" class="btn btn-secondary" data-back>Back</button>
                        <button type="button" class="btn" data-confirm>${verb}</button>
                    </div>
                </div>`;

            dialog.querySelector('[data-back]').addEventListener('click', () => {
                if (targetGig && modeStepShown) return renderModeStep({ viaBack: true });
                if (targetGigId) return renderStep2();
                return renderStep3();
            });
            dialog.querySelector('[data-confirm]').addEventListener('click', async () => {
                const btn = dialog.querySelector('[data-confirm]');
                btn.disabled = true;
                btn.textContent = targetGig ? 'Updating…' : 'Importing…';
                try {
                    const result = targetGig
                        ? await commitSync({ database, mapped, gig: targetGig, mode })
                        : await commitImport({ database, mapped, gigName, gigDate });
                    if (pendingDefault && typeof setDefaultMode === 'function') {
                        try { await setDefaultMode(pendingDefault); } catch (err) { console.error('[rbximport] save default mode failed:', err); }
                    }
                    if (notify) {
                        notify(targetGig
                            ? `${mode === 'merge' ? 'Merged' : 'Replaced'} "${result.gigName}" from Rekordbox — ${result.playlistsImported} playlist${result.playlistsImported === 1 ? '' : 's'}, ${result.totalTracks} track${result.totalTracks === 1 ? '' : 's'}.`
                            : `Imported "${result.gigName}" — ${result.playlistsImported} playlist${result.playlistsImported === 1 ? '' : 's'}, ${result.totalTracks} track${result.totalTracks === 1 ? '' : 's'}.`, 'success');
                    }
                    finalize(result);
                } catch (err) {
                    btn.disabled = false;
                    btn.textContent = verb;
                    const status = document.createElement('div');
                    status.className = 'rbximport-status error';
                    status.textContent = `${targetGig ? 'Update' : 'Import'} failed: ${err.message}`;
                    dialog.querySelector('.rbximport-confirm').appendChild(status);
                }
            });
        }

        renderStep1();
    });
}

// ── Commit phase ─────────────────────────────────────────────────────────

// Map every selected Rekordbox playlist to UMM track ids. Tracks already in
// the library resolve by absolute path; the rest get a fresh
// `source: 'rekordbox-xml'` record (returned in `recordsToAdd`, not yet
// written). Shared by preview and both commit paths so they agree.
function mapIncomingLanes({ parsed, idx, playlists }) {
    const allUnique = new Set();
    for (const pl of playlists) for (const tid of pl.trackIds) allUnique.add(tid);

    const recordsToAdd = [];
    const tidToUmmId = new Map();
    for (const tid of allUnique) {
        const rb = parsed.tracks?.[tid];
        if (!rb) continue;
        const { match } = idx.find(rb.decodedPath || '');
        if (match) {
            tidToUmmId.set(tid, match.id);
        } else {
            const rec = makeRekordboxXmlTrack(rb);
            tidToUmmId.set(tid, rec.id);
            recordsToAdd.push(rec);
        }
    }

    const lanes = playlists.map((pl) => ({
        name: pl.name,
        trackIds: pl.trackIds
            .map((tid) => tidToUmmId.get(tid))
            .filter((id) => id != null),
    }));
    return { lanes, recordsToAdd };
}

async function commitImport({ database, mapped, gigName, gigDate }) {
    const { recordsToAdd } = mapped;
    const lanes = mapped.lanes.map((l) => ({ ...l, trackIds: [...l.trackIds] }));
    if (recordsToAdd.length) {
        await database.addTracks(recordsToAdd);
    }

    // Create the gig shell, then write the lanes in one shot — including the
    // auto-derived BPM lane (`isBpmRoll: true`, empty trackIds — gigs.js's
    // compute path fills it at render/export time).
    const created = await createGig(database, { name: gigName, gigDate });
    lanes.push({ name: 'BPM', trackIds: [], isBpmRoll: true });
    await setGigPlaylists(database, created.id, lanes);

    const totalTracks = lanes.reduce((acc, lane) => acc + (lane.trackIds?.length || 0), 0);
    return { gigId: created.id, gigName, playlistsImported: mapped.lanes.length, totalTracks };
}

// Update an existing gig from Rekordbox: same record materialization as a
// fresh import, then lanes come from planGigSync (merge or replace).
async function commitSync({ database, mapped, gig, mode }) {
    const { lanes: incoming, recordsToAdd } = mapped;
    if (recordsToAdd.length) {
        await database.addTracks(recordsToAdd);
    }
    // Re-read so we plan against the latest lanes, not the record captured
    // when the picker rendered. ensureBpmRollFlag tags a legacy empty "BPM"
    // lane as auto-derived so a Rekordbox "BPM" playlist can't overwrite it.
    const fresh = await ensureBpmRollFlag(database, (await getGig(database, gig.id)) || gig);
    const { lanes } = planGigSync({ lanes: fresh.playlists || [], incoming, mode });
    await setGigPlaylists(database, gig.id, lanes);

    const totalTracks = lanes.reduce((acc, lane) => acc + (lane.trackIds?.length || 0), 0);
    return { gigId: gig.id, gigName: fresh.name, playlistsImported: incoming.length, totalTracks };
}
