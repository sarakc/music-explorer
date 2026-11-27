const BUCKETS = [
    ['unresolved', 'Unresolved'],
    ['onlyA', 'Only A'],
    ['onlyB', 'Only B'],
    ['tagsDiffer', 'Tags differ'],
    ['moved', 'Moved'],
    ['identical', 'Identical'],
    ['sameFile', 'Same file'],
];

// The zone value for a whole manifest; an empty value means nothing is chosen.
export const ALL_FILES = '*';

/** A keeps its choice or takes lossless, and is never "All files" unasked; B falls back to it. */
export function defaultZone(side, zones, previous) {
    if (previous === ALL_FILES || zones.includes(previous)) return previous;
    const preferred = side === 'a' ? 'lossless' : 'library';
    if (zones.includes(preferred)) return preferred;
    return side === 'a' ? '' : ALL_FILES;
}

export function escapeStorageHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function formatStorageBytes(value) {
    const bytes = Number(value) || 0;
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const power = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const amount = bytes / (1024 ** power);
    return `${amount >= 100 || power === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[power]}`;
}

export function manifestAge(value, now = Date.now()) {
    const then = Date.parse(value || '');
    if (!Number.isFinite(then)) return 'never';
    const seconds = Math.max(0, Math.floor((now - then) / 1000));
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

export function unresolvedDescriptor(item) {
    const row = item?.row || {};
    return { side: item?.side || '', path: row.path || '', sha256: row.sha256 || '' };
}

function unresolvedKey(item) {
    const descriptor = unresolvedDescriptor(item);
    return JSON.stringify([descriptor.side, descriptor.path, descriptor.sha256]);
}

function number(value) {
    return (Number(value) || 0).toLocaleString();
}

function statusBadge(label, tone = 'neutral') {
    return `<span class="storage-badge storage-badge--${tone}">${escapeStorageHtml(label)}</span>`;
}

function referenceFreshness(meta) {
    const requiredTypes = new Set(['rekordbox-xml', 'musicapp-xml', 'umm-config']);
    const required = (meta.referenceSets || []).filter((item) => requiredTypes.has(item.type));
    const ready = required.filter((item) => item.status === 'ready');
    const failed = required.filter((item) => item.status !== 'ready');
    if (failed.length) return statusBadge(`${failed.length} ref error${failed.length === 1 ? '' : 's'}`, 'warn');
    const missing = [...requiredTypes].filter((type) => !ready.some((item) => item.type === type));
    if (missing.length) return statusBadge(`${missing.length} ref type${missing.length === 1 ? '' : 's'} missing`, 'warn');
    const oldest = Math.max(...ready.map((item) => Date.now() - Date.parse(item.exportedAt || 0)));
    return oldest > 7 * 86400000 ? statusBadge('Refs stale', 'warn') : statusBadge('Refs fresh', 'cool');
}

async function requestJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
}

export default class StorageView {
    constructor({ notify } = {}) {
        this.notify = notify || (() => {});
        this.container = null;
        this.manifests = [];
        this.refsets = { suggestions: [], errors: [] };
        this.comparison = null;
        this.mergeEvidence = null;
        this.acknowledgedUnresolved = new Set();
        this.dropSide = 'a';
        this.activeBucket = 'unresolved';
        this.visibleRows = 12;
        this.source = null;
    }

    destroy() {
        this.source?.close();
        this.source = null;
        this.container = null;
    }

    async render(container) {
        this.destroy();
        this.container = container;
        document.getElementById('viewTitle').textContent = 'Storage';
        document.getElementById('viewSubtitle').textContent = 'Read-only library evidence';
        container.innerHTML = this._shell();
        this._wireScan();
        this._wireCompare();
        this._openProgress();
        await this.refresh();
    }

    _shell() {
        return `
            <div class="storage-view">
                <section class="storage-card storage-scan" aria-labelledby="storageScanTitle">
                    <div class="storage-section-head">
                        <div><h2 id="storageScanTitle">New manifest scan</h2><p>Reads audio identity and references. No files are changed.</p></div>
                        <span class="storage-badge storage-badge--muted" id="storageJobStatus">Idle</span>
                    </div>
                    <form id="storageScanForm">
                        <div class="storage-scan-grid">
                            <div class="storage-field-stack">
                                <label class="storage-field">Root path<input id="storageRoot" type="text" required></label>
                                <label class="storage-field">Manifest name<input id="storageName" type="text" required></label>
                            </div>
                            <fieldset class="storage-refsets"><legend>Reference sets</legend><div id="storageRefsetList" class="storage-refset-list"><span class="muted">Loading…</span></div></fieldset>
                            <div class="storage-scan-actions">
                                <label class="storage-check"><input id="storageRehash" type="checkbox" checked> Rehash all files</label>
                                <button class="btn" id="storageScanBtn" type="submit">Start scan</button>
                            </div>
                        </div>
                    </form>
                    <div class="storage-progress" id="storageProgress" hidden>
                        <div class="storage-progress-copy"><code id="storageProgressPath"></code><span id="storageProgressCount"></span></div>
                        <progress id="storageProgressBar" max="1" value="0"></progress>
                    </div>
                    <div class="storage-inline-error" id="storageScanError" hidden></div>
                </section>

                <section aria-labelledby="storageManifestsTitle">
                    <div class="storage-list-head"><h2 id="storageManifestsTitle">Saved manifests</h2><span id="storageManifestTotal"></span></div>
                    <div class="storage-manifest-grid" id="storageManifestList"><div class="loading">Loading…</div></div>
                </section>

                <section class="storage-card storage-compare" aria-labelledby="storageCompareTitle">
                    <div class="storage-section-head">
                        <div><h2 id="storageCompareTitle">Compare manifests</h2><p>Recording identity is independent of path and tags.</p></div>
                        <button class="btn" id="storageCompareBtn" type="button">Compare</button>
                    </div>
                    <div class="storage-compare-selectors">
                        ${this._selector('a', 'A')}
                        ${this._selector('b', 'B')}
                    </div>
                    <div id="storageCompareError" class="storage-inline-error" hidden></div>
                    <div id="storageCompareResults"></div>
                </section>
            </div>`;
    }

    _selector(side, label) {
        return `<div class="storage-selector"><strong>${label}</strong><label class="storage-field">Manifest<select id="storageManifest${side.toUpperCase()}"></select></label><label class="storage-field">Zone<select id="storageZone${side.toUpperCase()}"></select></label></div>`;
    }

    async refresh() {
        const [manifestData, refsets] = await Promise.all([
            requestJson('/api/manifest'),
            requestJson('/api/manifest/refsets'),
        ]);
        if (!this.container) return;
        this.manifests = manifestData.manifests || [];
        this.refsets = refsets;
        this._renderRefsets();
        this._renderManifests();
        this._renderSelectors();
        if (manifestData.job) this._renderProgress(manifestData.job);
    }

    _renderRefsets() {
        const list = this.container?.querySelector('#storageRefsetList');
        if (!list) return;
        const suggestions = this.refsets.suggestions || [];
        list.innerHTML = suggestions.length ? suggestions.map((item) => `
            <label class="storage-refset ${item.exists ? '' : 'is-missing'}">
                <input type="checkbox" data-refset-id="${escapeStorageHtml(item.id)}" ${item.exists ? 'checked' : 'disabled'}>
                <span><strong>${escapeStorageHtml(item.type)}</strong><code title="${escapeStorageHtml(item.path)}">${escapeStorageHtml(item.path)}</code></span>
                ${statusBadge(item.exists ? manifestAge(item.exportedAt) : 'Missing', item.exists ? 'cool' : 'warn')}
            </label>`).join('') : '<span class="muted">No suggested reference sets.</span>';
        const root = this.container.querySelector('#storageRoot');
        if (root && !root.value) root.value = this.refsets.defaultRoot || '';
        const name = this.container.querySelector('#storageName');
        if (name && !name.value) name.value = `music-full-${new Date().toISOString().slice(0, 10)}`;
    }

    _renderManifests() {
        const list = this.container?.querySelector('#storageManifestList');
        const total = this.container?.querySelector('#storageManifestTotal');
        if (!list || !total) return;
        const bytes = this.manifests.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
        total.textContent = `${number(this.manifests.length)} manifest${this.manifests.length === 1 ? '' : 's'} · ${formatStorageBytes(bytes)}`;
        if (!this.manifests.length) {
            list.innerHTML = '<div class="empty-state"><h3>No manifests yet</h3><p>Run a scan to create the first one.</p></div>';
            return;
        }
        list.innerHTML = this.manifests.map((meta) => {
            const unresolved = meta.identityErrors?.length || 0;
            return `<article class="storage-manifest">
                <div class="storage-manifest-title"><div><h3>${escapeStorageHtml(meta.name)}</h3><p>${manifestAge(meta.completedAt || meta.startedAt)} · ${number(meta.files)} files · ${formatStorageBytes(meta.bytes)}</p></div>${statusBadge(meta.complete ? 'Complete' : 'Partial', meta.complete ? 'neutral' : 'warn')}</div>
                <code title="${escapeStorageHtml(meta.root)}">${escapeStorageHtml(meta.root)}</code>
                <div class="storage-badges">${statusBadge(`Full rehash · ${manifestAge(meta.lastFullRehashAt)}`, meta.lastFullRehashAt ? 'cool' : 'warn')}${referenceFreshness(meta)}${statusBadge(`${number(unresolved)} unresolved`, unresolved ? 'warn' : 'muted')}</div>
            </article>`;
        }).join('');
    }

    _renderSelectors() {
        const a = this.container?.querySelector('#storageManifestA');
        const b = this.container?.querySelector('#storageManifestB');
        if (!a || !b) return;
        const previousA = a.value;
        const previousB = b.value;
        const options = this.manifests.map((meta) => `<option value="${escapeStorageHtml(meta.name)}">${escapeStorageHtml(meta.name)}</option>`).join('');
        a.innerHTML = options;
        b.innerHTML = options;
        if (this.manifests.some((meta) => meta.name === previousA)) a.value = previousA;
        if (this.manifests.some((meta) => meta.name === previousB)) b.value = previousB;
        this._renderZoneSelector('a');
        this._renderZoneSelector('b');
    }

    _renderZoneSelector(side) {
        const suffix = side.toUpperCase();
        const manifestName = this.container?.querySelector(`#storageManifest${suffix}`)?.value;
        const select = this.container?.querySelector(`#storageZone${suffix}`);
        if (!select) return;
        const previous = select.value;
        const meta = this.manifests.find((item) => item.name === manifestName);
        const zones = Object.keys(meta?.zones || {}).sort();
        select.innerHTML = (side === 'a' ? '<option value="" disabled>Choose</option>' : '')
            + `<option value="${ALL_FILES}">All files</option>`
            + zones.map((zone) => `<option value="${escapeStorageHtml(zone)}">${escapeStorageHtml(zone)} · ${number(meta.zones[zone])}</option>`).join('');
        select.value = defaultZone(side, zones, previous);
    }

    _wireScan() {
        this.container.querySelector('#storageScanForm')?.addEventListener('submit', (event) => this._startScan(event));
    }

    async _startScan(event) {
        event.preventDefault();
        const button = this.container.querySelector('#storageScanBtn');
        const error = this.container.querySelector('#storageScanError');
        error.hidden = true;
        button.disabled = true;
        const selected = new Set([...this.container.querySelectorAll('[data-refset-id]:checked')].map((input) => input.dataset.refsetId));
        const referenceSets = (this.refsets.suggestions || [])
            .filter((item) => selected.has(item.id))
            .map(({ id, type, path, exportedAt }) => ({ id, type, path, exportedAt }));
        try {
            await requestJson('/api/manifest/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: this.container.querySelector('#storageName').value.trim(),
                    root: this.container.querySelector('#storageRoot').value.trim(),
                    rehashAll: this.container.querySelector('#storageRehash').checked,
                    referenceSets,
                }),
            });
            this.notify('Manifest scan started', 'success');
        } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
            button.disabled = false;
        }
    }

    _openProgress() {
        if (typeof EventSource === 'undefined') return;
        this.source = new EventSource('/api/manifest/progress');
        this.source.onmessage = (event) => {
            let progress;
            try { progress = JSON.parse(event.data); } catch { return; }
            this._renderProgress(progress);
            if (progress.type === 'scan:complete') this.refresh().catch((error) => this.notify(error.message, 'error'));
        };
    }

    _renderProgress(progress) {
        if (!this.container || !progress) return;
        const wrapper = this.container.querySelector('#storageProgress');
        const status = this.container.querySelector('#storageJobStatus');
        const button = this.container.querySelector('#storageScanBtn');
        const running = Boolean(progress.running);
        status.textContent = running ? 'Scanning' : (progress.type === 'scan:error' ? 'Error' : 'Idle');
        status.className = `storage-badge storage-badge--${progress.type === 'scan:error' ? 'warn' : (running ? 'cool' : 'muted')}`;
        button.disabled = running;
        wrapper.hidden = !running;
        if (!running) return;
        const total = Number(progress.total) || 0;
        const completed = Number(progress.completed) || 0;
        const bar = this.container.querySelector('#storageProgressBar');
        bar.max = Math.max(1, total);
        bar.value = completed;
        this.container.querySelector('#storageProgressPath').textContent = progress.path || 'Preparing scan…';
        this.container.querySelector('#storageProgressCount').textContent = `${number(completed)} / ${number(total)} · ${formatStorageBytes(progress.bytes)}`;
    }

    _wireCompare() {
        for (const side of ['A', 'B']) {
            this.container.querySelector(`#storageManifest${side}`)?.addEventListener('change', () => this._renderZoneSelector(side.toLowerCase()));
        }
        this.container.querySelector('#storageCompareBtn')?.addEventListener('click', () => this._compare());
        this.container.querySelector('#storageCompareResults')?.addEventListener('click', (event) => this._resultClick(event));
        this.container.querySelector('#storageCompareResults')?.addEventListener('change', (event) => {
            if (event.target.id !== 'storageDropSide') return;
            this.dropSide = event.target.value;
            this.mergeEvidence = null;
        });
    }

    _selection(side) {
        const suffix = side.toUpperCase();
        const manifest = this.container.querySelector(`#storageManifest${suffix}`).value;
        const zone = this.container.querySelector(`#storageZone${suffix}`).value;
        if (!zone) return null;
        return zone === ALL_FILES ? { manifest } : { manifest, zone };
    }

    async _compare() {
        const error = this.container.querySelector('#storageCompareError');
        const button = this.container.querySelector('#storageCompareBtn');
        error.hidden = true;
        if (!this._selection('a')) {
            error.textContent = 'Choose a zone for A';
            error.hidden = false;
            return;
        }
        button.disabled = true;
        try {
            this.comparison = await requestJson('/api/manifest/compare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ a: this._selection('a'), b: this._selection('b') }),
            });
            this.activeBucket = 'unresolved';
            this.visibleRows = 12;
            this.mergeEvidence = null;
            this.acknowledgedUnresolved.clear();
            this._renderComparison();
        } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
        } finally {
            button.disabled = false;
        }
    }

    _renderComparison() {
        const mount = this.container?.querySelector('#storageCompareResults');
        if (!mount || !this.comparison) return;
        const summary = this.comparison.summary || {};
        const checksumPairs = this._checksumPairRows();
        const pairRowsAcknowledged = checksumPairs.filter((item) => this.acknowledgedUnresolved.has(unresolvedKey(item))).length;
        const unresolvedTools = this.activeBucket === 'unresolved' && checksumPairs.length
            ? `<div class="storage-unresolved-tools"><p>${number(checksumPairs.length / 2)} exact SHA-256 pair${checksumPairs.length === 2 ? '' : 's'} still have no audio identity. They remain excluded from drop candidates.</p><button class="btn btn-secondary btn-sm" type="button" data-storage-ack-sha-pairs>${pairRowsAcknowledged === checksumPairs.length ? 'Clear checksum-pair acknowledgements' : `Acknowledge ${number(checksumPairs.length)} paired files`}</button></div>`
            : '';
        mount.innerHTML = `
            ${this.comparison.partial ? '<div class="storage-inline-error">At least one manifest is partial. Treat these counts as incomplete.</div>' : ''}
            <div class="storage-bucket-tabs" role="tablist">${BUCKETS.map(([key, label]) => `<button type="button" class="storage-bucket ${this.activeBucket === key ? 'is-active' : ''}" data-storage-bucket="${key}"><strong>${number(key === 'unresolved' ? summary.unresolvedRows : summary[key])}</strong><span>${label}</span></button>`).join('')}</div>
            ${unresolvedTools}
            <div class="storage-evidence-list">${this._bucketRows()}</div>
            ${this._mergePanel()}`;
    }

    _checksumPairRows() {
        const unresolved = this.comparison?.unresolved || [];
        const sidesBySha = new Map();
        for (const item of unresolved) {
            const sha = item.row?.sha256;
            if (!sha) continue;
            if (!sidesBySha.has(sha)) sidesBySha.set(sha, new Set());
            sidesBySha.get(sha).add(item.side);
        }
        return unresolved.filter((item) => sidesBySha.get(item.row?.sha256)?.size > 1);
    }

    _bucketRows() {
        const rows = this.comparison[this.activeBucket] || [];
        if (!rows.length) return '<div class="storage-empty-row">No recordings in this bucket.</div>';
        const visible = rows.slice(0, this.visibleRows);
        const rendered = visible.map((item, index) => this.activeBucket === 'unresolved'
            ? this._unresolvedRow(item, index)
            : this._clusterRow(item)).join('');
        const remaining = rows.length - visible.length;
        return rendered + (remaining > 0 ? `<button class="btn btn-secondary btn-sm storage-more" type="button" data-storage-more>+${number(remaining)} more</button>` : '');
    }

    _unresolvedRow(item, index) {
        const row = item.row || {};
        const checked = this.acknowledgedUnresolved.has(unresolvedKey(item));
        return `<details class="storage-evidence-row"><summary><span>${statusBadge(item.side?.toUpperCase() || '?', 'warn')}</span><code>${escapeStorageHtml(row.path)}</code><span>${escapeStorageHtml(row.audioKeyError || 'Audio identity unavailable')}</span></summary><div class="storage-row-detail"><label class="storage-ack"><input type="checkbox" data-storage-ack="${index}" ${checked ? 'checked' : ''}>Acknowledge this exact path and checksum for the current evidence export</label><div><b>SHA-256</b><code>${escapeStorageHtml(row.sha256 || 'unavailable')}</code></div><div><b>References</b><span>${escapeStorageHtml((row.referencedBy || []).join(', ') || 'None')}</span></div></div></details>`;
    }

    _clusterRow(cluster) {
        const a = cluster.a || [];
        const b = cluster.b || [];
        const allRefs = [...new Set([...a, ...b].flatMap((row) => row.referencedBy || []))];
        return `<details class="storage-evidence-row"><summary><code>${escapeStorageHtml(cluster.audioKey?.slice(0, 16))}…</code><span>${number(a.length)} in A · ${number(b.length)} in B</span><span>${allRefs.length ? `${number(allRefs.length)} ref${allRefs.length === 1 ? '' : 's'}` : 'No refs'}</span></summary><div class="storage-row-detail"><div><b>A paths</b>${a.map((row) => `<code>${escapeStorageHtml(row.path)}</code>`).join('') || '<span>Not present</span>'}</div><div><b>B paths</b>${b.map((row) => `<code>${escapeStorageHtml(row.path)}</code>`).join('') || '<span>Not present</span>'}</div><div><b>References</b><span>${escapeStorageHtml(allRefs.join(', ') || 'None')}</span></div></div></details>`;
    }

    _mergePanel() {
        const evidence = this.mergeEvidence;
        const warningList = evidence?.warnings?.length
            ? evidence.warnings.map((warning) => `<li><b>Fail</b> ${escapeStorageHtml(warning.message)}</li>`).join('')
            : '<li><b>Ready</b> Build evidence to check freshness and identity gates.</li>';
        const rules = evidence?.referenceRules?.filter((rule) => rule.status === 'ready') || [];
        return `<section class="storage-merge">
            <div><h3>Merge evidence</h3><p>Produces JSON only. It does not move or delete files.</p></div>
            <label class="storage-field">Proposed drop side<select id="storageDropSide"><option value="a" ${this.dropSide === 'a' ? 'selected' : ''}>A</option><option value="b" ${this.dropSide === 'b' ? 'selected' : ''}>B</option></select></label>
            <button class="btn btn-secondary" type="button" data-storage-build-merge>Build evidence</button>
            <div class="storage-qualification ${evidence?.qualified ? 'is-qualified' : ''}"><strong>${evidence ? (evidence.qualified ? 'Qualified' : 'Not qualified') : 'Not checked'}</strong><ul>${warningList}</ul>${evidence ? `<p>${number(evidence.summary?.acknowledgedUnresolved)} acknowledged unresolved; ${number(evidence.summary?.unacknowledgedUnresolved)} unacknowledged.</p>` : ''}${rules.map((rule) => `<p>${escapeStorageHtml(rule.rule)}: ${number(rule.matchedPaths)} / ${number(rule.subsetPaths)} matched; ${number(rule.violations?.length)} violations.</p>`).join('')}${evidence?.qualified ? '<button class="btn" type="button" data-storage-download-merge>Download merge evidence</button>' : ''}</div>
        </section>`;
    }

    async _resultClick(event) {
        const bucket = event.target.closest('[data-storage-bucket]');
        if (bucket) {
            this.activeBucket = bucket.dataset.storageBucket;
            this.visibleRows = 12;
            this._renderComparison();
            return;
        }
        if (event.target.closest('[data-storage-more]')) {
            this.visibleRows += 50;
            this._renderComparison();
            return;
        }
        const acknowledgement = event.target.closest('[data-storage-ack]');
        if (acknowledgement) {
            const item = (this.comparison?.unresolved || [])[Number(acknowledgement.dataset.storageAck)];
            if (item) {
                const key = unresolvedKey(item);
                if (acknowledgement.checked) this.acknowledgedUnresolved.add(key);
                else this.acknowledgedUnresolved.delete(key);
                this.mergeEvidence = null;
            }
            return;
        }
        if (event.target.closest('[data-storage-ack-sha-pairs]')) {
            const pairs = this._checksumPairRows();
            const allAcknowledged = pairs.every((item) => this.acknowledgedUnresolved.has(unresolvedKey(item)));
            for (const item of pairs) {
                const key = unresolvedKey(item);
                if (allAcknowledged) this.acknowledgedUnresolved.delete(key);
                else this.acknowledgedUnresolved.add(key);
            }
            this.mergeEvidence = null;
            this._renderComparison();
            return;
        }
        if (event.target.closest('[data-storage-build-merge]')) await this._buildMergeEvidence();
        if (event.target.closest('[data-storage-download-merge]')) this._downloadMergeEvidence();
    }

    async _buildMergeEvidence() {
        const button = this.container.querySelector('[data-storage-build-merge]');
        button.disabled = true;
        try {
            this.mergeEvidence = await requestJson('/api/manifest/merge-export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    a: this._selection('a'),
                    b: this._selection('b'),
                    dropSide: this.dropSide,
                    acknowledgedUnresolved: (this.comparison.unresolved || [])
                        .filter((item) => this.acknowledgedUnresolved.has(unresolvedKey(item)))
                        .map(unresolvedDescriptor),
                }),
            });
            this._renderComparison();
        } catch (error) {
            this.notify(error.message, 'error');
            button.disabled = false;
        }
    }

    _downloadMergeEvidence() {
        if (!this.mergeEvidence?.qualified) return;
        const blob = new Blob([`${JSON.stringify(this.mergeEvidence, null, 2)}\n`], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `umm-merge-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
