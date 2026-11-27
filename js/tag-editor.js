// Batch tag editor drawer. A row with a local file is staged as pending tag
// diffs (source `manual-batch`) for the batch apply, which writes the MP3 and
// its paired FLAC; a row without one (Bandcamp, Discogs) is saved in Unified only.
// Public API: new BatchTagEditor({ database, pendingDiffs, getSelectedTrackIds, getAllTracks, onCommitted })
//   .init() .mount(hostEl?) .open() .close() .isOpen() .unstage(staged)
import { escapeHtml } from './html.js';
import { isLocalTrack } from './tool-rules.js';

const SOURCE = 'manual-batch';
const localFileOf = (track) => (isLocalTrack(track) ? String(track.local_path || track.path || '') : '');

const SEED_GENRES = [
    'Electronic', 'Hip Hop', 'Pop', 'R&B', 'Latin', 'Rock', 'Reggae', 'Jazz', 'World', 'Misc'
];

const SEED_SUBGENRES = [
    'House', 'Techno', 'Electro', 'Bass', 'Club', 'Juke/Footwork', 'Jungle',
    'Drum & Bass', 'Dancehall (Modern)', 'Dancehall (Classic)', 'Jersey/Bmore',
    'Afrobeats', 'UK', 'French', 'Brazilian', 'Ambient', 'Garage', 'Grime', 'Breaks'
];

const SEED_TAGS = [
    'Acidic', 'Ambient', 'Bouncy', 'Chill', 'Club', 'Dark', 'Disco', 'Feelgood',
    'Funky', 'Groovy', 'Heady', 'Hype', 'Jazzy', 'Mellow', 'Melodic', 'Minimal',
    'Moody', 'NRG', 'Ravey', 'Shiny', 'Soulful', 'Vocals', 'Wacky', 'Booty',
    'Bass', 'Battle', 'Complex', 'Dembow', 'Drums', 'Electro', 'House', 'Techno',
    'Latin', 'Pop', 'R&B', 'Hip Hop', 'Dancehall', 'Acapella', 'Instrumental',
    'DJ Intro', 'DJ Outro', 'Remix', 'Tool', 'Dub', 'Piano', 'Reggae',
    '160+', '++', 'stash', 'EXPLORE ME'
];

function splitGenre(raw) {
    if (!raw || typeof raw !== 'string') return { genre: '', subgenre: '' };
    const s = raw.trim();
    if (!s) return { genre: '', subgenre: '' };
    const colonIdx = s.indexOf(':');
    if (colonIdx < 0) return { genre: s, subgenre: '' };
    return { genre: s.slice(0, colonIdx).trim(), subgenre: s.slice(colonIdx + 1).trim() };
}

function composeGenre(genre, subgenre) {
    const g = (genre || '').trim();
    const s = (subgenre || '').trim();
    if (!g && !s) return '';
    if (g && s) return `${g}: ${s}`;
    if (g) return g;
    // subgenre but no genre — unusual; keep just the subgenre
    return s;
}

function normalizeTags(v) {
    if (Array.isArray(v)) return v.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim());
    return [];
}

function dedupeCI(arr) {
    const seen = new Set();
    const out = [];
    for (const t of arr) {
        const k = t.toLowerCase();
        if (!seen.has(k)) {
            seen.add(k);
            out.push(t);
        }
    }
    return out;
}

function ciEquals(a, b) {
    return (a || '').toLowerCase() === (b || '').toLowerCase();
}

export class BatchTagEditor {
    constructor({ database, pendingDiffs = null, getSelectedTrackIds, getAllTracks, onCommitted, onPreviewChanged } = {}) {
        this.database = database;
        this.pendingDiffs = pendingDiffs;
        this.getSelectedTrackIds = getSelectedTrackIds || (() => new Set());
        this.getAllTracks = getAllTracks || (() => []);
        this.onCommitted = onCommitted || (() => {});
        this.onPreviewChanged = onPreviewChanged || (() => {});

        this.hostEl = null;
        this.rootEl = null;
        this.backdropEl = null;
        this.drawerEl = null;
        this._open = false;

        // Pending selection state:
        //   genreChoice: null (untouched) | '' (cleared) | 'SomeGenre'
        //   subgenreChoice: null | '' | 'SomeSubgenre'
        //   tagActions: Map<lowerTag, { action: 'add'|'remove', label: string }>
        //   clearTagsAll: bool (if true, wipe all tags before applying adds/removes)
        this.genreChoice = null;
        this.subgenreChoice = null;
        this.tagActions = new Map();
        this.clearTagsAll = false;

        // Search filters (substring match, case-insensitive)
        this._subgenreQuery = '';
        this._tagQuery = '';

        // Histograms: Map<label, count>
        this.genreHist = new Map();
        this.subgenreHist = new Map();
        this.tagHist = new Map();

        this._diffExpanded = false;
    }

    async init() {
        this._computeHistograms();
    }

    _computeHistograms() {
        const tracks = this.getAllTracks() || [];
        const g = new Map();
        const sg = new Map();
        const tg = new Map();
        for (const t of tracks) {
            const { genre, subgenre } = splitGenre(t.genre || '');
            if (genre) g.set(genre, (g.get(genre) || 0) + 1);
            if (subgenre) sg.set(subgenre, (sg.get(subgenre) || 0) + 1);
            const tags = normalizeTags(t.tags);
            for (const tag of tags) {
                tg.set(tag, (tg.get(tag) || 0) + 1);
            }
        }
        this.genreHist = g;
        this.subgenreHist = sg;
        this.tagHist = tg;
    }

    mount(hostEl) {
        if (this.rootEl) return;
        this.hostEl = hostEl || document.body;

        const root = document.createElement('div');
        root.className = 'bte-root';
        root.innerHTML = `
            <div class="bte-backdrop" data-bte-close></div>
            <aside class="bte-drawer" role="dialog" aria-label="Batch tag editor">
                <header class="bte-header">
                    <div class="bte-title-wrap">
                        <div class="bte-title">Batch tag</div>
                        <div class="bte-count" data-bte-count>0 tracks selected</div>
                    </div>
                    <button type="button" class="bte-close" data-bte-close aria-label="Close">&times;</button>
                </header>
                <div class="bte-tabs" role="tablist">
                    <button type="button" class="bte-tab is-active" data-bte-tab="genre" role="tab" aria-selected="true">Genre + Subgenre</button>
                    <button type="button" class="bte-tab" data-bte-tab="tags" role="tab" aria-selected="false">Tags</button>
                </div>
                <div class="bte-body">
                    <div class="bte-panel" data-bte-panel="genre">
                        <section class="bte-section">
                            <div class="bte-section-title">Genre</div>
                            <div class="bte-pills" data-bte-genre></div>
                        </section>
                        <section class="bte-section">
                            <div class="bte-section-title">Subgenre</div>
                            <input type="text" class="bte-search" data-bte-subgenre-search placeholder="Filter subgenres…" autocomplete="off">
                            <div class="bte-pills" data-bte-subgenre></div>
                        </section>
                    </div>
                    <div class="bte-panel" data-bte-panel="tags" hidden>
                        <section class="bte-section">
                            <div class="bte-section-title">Tags</div>
                            <div class="bte-hint">Click once to add, twice to remove, thrice to clear.</div>
                            <input type="text" class="bte-search" data-bte-tag-search placeholder="Filter tags…" autocomplete="off">
                            <div class="bte-pills" data-bte-tags></div>
                        </section>
                    </div>
                </div>
                <footer class="bte-footer">
                    <div class="bte-diff-summary" data-bte-diff-summary></div>
                    <div class="bte-diff-sample" data-bte-diff-sample hidden></div>
                    <div class="bte-actions">
                        <button type="button" class="bte-btn bte-btn-secondary" data-bte-cancel>Cancel</button>
                        <button type="button" class="bte-btn bte-btn-primary" data-bte-apply>Apply</button>
                    </div>
                </footer>
            </aside>
        `;
        this.hostEl.appendChild(root);

        this.rootEl = root;
        this.backdropEl = root.querySelector('.bte-backdrop');
        this.drawerEl = root.querySelector('.bte-drawer');

        // Close handlers
        root.querySelectorAll('[data-bte-close]').forEach(el => {
            el.addEventListener('click', () => this.close());
        });
        root.querySelector('[data-bte-cancel]').addEventListener('click', () => {
            this._resetPending();
            this.close();
        });
        root.querySelector('[data-bte-apply]').addEventListener('click', () => this._apply());

        // Search inputs: type-to-filter the pill grid in Subgenre/Tags sections.
        const subSearch = root.querySelector('[data-bte-subgenre-search]');
        subSearch.addEventListener('input', (e) => {
            this._subgenreQuery = e.target.value || '';
            this._renderSubgenre();
        });
        const tagSearch = root.querySelector('[data-bte-tag-search]');
        tagSearch.addEventListener('input', (e) => {
            this._tagQuery = e.target.value || '';
            this._renderTags();
        });

        // Tab switching — Genre+Subgenre / Tags.
        root.querySelectorAll('[data-bte-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const next = btn.dataset.bteTab;
                root.querySelectorAll('[data-bte-tab]').forEach((t) => {
                    const active = t.dataset.bteTab === next;
                    t.classList.toggle('is-active', active);
                    t.setAttribute('aria-selected', active ? 'true' : 'false');
                });
                root.querySelectorAll('[data-bte-panel]').forEach((p) => {
                    p.hidden = p.dataset.btePanel !== next;
                });
            });
        });

        // Esc to close
        this._onKeydown = (e) => {
            if (!this._open) return;
            if (e.key === 'Escape') this.close();
        };
        document.addEventListener('keydown', this._onKeydown);
    }

    open() {
        if (!this.rootEl) this.mount();
        this._resetPending();
        this._computeHistograms();
        this._render();
        this.rootEl.classList.add('bte-open');
        this._open = true;
        this._notifyPreviewChanged();
    }

    close() {
        if (!this.rootEl) return;
        this.rootEl.classList.remove('bte-open');
        this._open = false;
        this._notifyPreviewChanged();
    }

    isOpen() {
        return this._open;
    }

    _resetPending() {
        this.genreChoice = null;
        this.subgenreChoice = null;
        this.tagActions = new Map();
        this.clearTagsAll = false;
        this._diffExpanded = false;
        this._subgenreQuery = '';
        this._tagQuery = '';
    }

    _notifyPreviewChanged() {
        try { this.onPreviewChanged(); } catch (err) { console.error('onPreviewChanged threw', err); }
    }

    // Public: returns { newGenre, newTags, newComments, genreChanged, tagsChanged } or null if no pending change.
    // Comments are re-derived from the new tags (source-of-truth convention: tags === comma-separated comments).
    getPreviewForTrack(track) {
        if (!this._open) return null;
        const change = this._computeChange(track);
        if (!change) return null;
        const newComments = change.tagsChanged ? change.newTags.join(', ') : (track.comments || '');
        return {
            newGenre: change.newGenre,
            newTags: change.newTags,
            newComments,
            genreChanged: change.genreChanged,
            tagsChanged: change.tagsChanged,
        };
    }

    _render() {
        if (!this.rootEl) return;

        const selectedCount = this._selectedCount();
        this.rootEl.querySelector('[data-bte-count]').textContent =
            `${selectedCount} track${selectedCount === 1 ? '' : 's'} selected`;

        this._renderGenre();
        this._renderSubgenre();
        this._renderTags();
        this._renderDiff();
        this._notifyPreviewChanged();
    }

    _selectedCount() {
        const ids = this.getSelectedTrackIds();
        return ids && typeof ids.size === 'number' ? ids.size : 0;
    }

    _getSelectedTracks() {
        const ids = this.getSelectedTrackIds();
        if (!ids || !ids.size) return [];
        const all = this.getAllTracks() || [];
        return all.filter(t => ids.has(t.id));
    }

    _sortedHist(hist) {
        return [...hist.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }

    _renderGenre() {
        const container = this.rootEl.querySelector('[data-bte-genre]');
        container.innerHTML = '';

        // Clear pill
        const clearBtn = this._makePill({
            label: 'Clear genre',
            kind: 'clear',
            active: this.genreChoice === '',
            onClick: () => {
                this.genreChoice = this.genreChoice === '' ? null : '';
                this._render();
            }
        });
        container.appendChild(clearBtn);

        const entries = this._sortedHist(this.genreHist);
        const knownSet = new Set(entries.map(([k]) => k.toLowerCase()));

        for (const [label, count] of entries) {
            container.appendChild(this._makePill({
                label,
                count,
                active: ciEquals(this.genreChoice, label),
                onClick: () => {
                    this.genreChoice = ciEquals(this.genreChoice, label) ? null : label;
                    this._render();
                }
            }));
        }

        // Seed vocab not already shown
        const extraSeeds = SEED_GENRES.filter(s => !knownSet.has(s.toLowerCase()));
        if (extraSeeds.length) {
            container.appendChild(this._makeSeparator());
            for (const label of extraSeeds) {
                container.appendChild(this._makePill({
                    label,
                    seed: true,
                    active: ciEquals(this.genreChoice, label),
                    onClick: () => {
                        this.genreChoice = ciEquals(this.genreChoice, label) ? null : label;
                        this._render();
                    }
                }));
            }
        }
    }

    _renderSubgenre() {
        const container = this.rootEl.querySelector('[data-bte-subgenre]');
        container.innerHTML = '';

        const clearBtn = this._makePill({
            label: 'Clear subgenre',
            kind: 'clear',
            active: this.subgenreChoice === '',
            onClick: () => {
                this.subgenreChoice = this.subgenreChoice === '' ? null : '';
                this._render();
            }
        });
        container.appendChild(clearBtn);

        const q = this._subgenreQuery.trim().toLowerCase();
        const matches = (label) => !q || label.toLowerCase().includes(q);

        const entries = this._sortedHist(this.subgenreHist).filter(([label]) => matches(label));
        const knownSet = new Set(this._sortedHist(this.subgenreHist).map(([k]) => k.toLowerCase()));

        for (const [label, count] of entries) {
            container.appendChild(this._makePill({
                label,
                count,
                active: ciEquals(this.subgenreChoice, label),
                onClick: () => {
                    this.subgenreChoice = ciEquals(this.subgenreChoice, label) ? null : label;
                    this._render();
                }
            }));
        }

        const extraSeeds = SEED_SUBGENRES.filter(s => !knownSet.has(s.toLowerCase()) && matches(s));
        if (extraSeeds.length) {
            container.appendChild(this._makeSeparator());
            for (const label of extraSeeds) {
                container.appendChild(this._makePill({
                    label,
                    seed: true,
                    active: ciEquals(this.subgenreChoice, label),
                    onClick: () => {
                        this.subgenreChoice = ciEquals(this.subgenreChoice, label) ? null : label;
                        this._render();
                    }
                }));
            }
        }

        if (q && !entries.length && !extraSeeds.length) {
            const empty = document.createElement('div');
            empty.className = 'bte-empty';
            empty.textContent = `No subgenres match "${this._subgenreQuery}"`;
            container.appendChild(empty);
        }
    }

    _renderTags() {
        const container = this.rootEl.querySelector('[data-bte-tags]');
        container.innerHTML = '';

        // Clear tags pill (wipes all tags on apply)
        container.appendChild(this._makePill({
            label: 'Clear tags',
            kind: 'clear',
            active: this.clearTagsAll,
            onClick: () => {
                this.clearTagsAll = !this.clearTagsAll;
                this._render();
            }
        }));

        const q = this._tagQuery.trim().toLowerCase();
        const matches = (label) => !q || label.toLowerCase().includes(q);

        const allSorted = this._sortedHist(this.tagHist);
        const knownSet = new Set(allSorted.map(([k]) => k.toLowerCase()));
        const entries = allSorted.filter(([label]) => matches(label));

        for (const [label, count] of entries) {
            const state = this._tagState(label);
            container.appendChild(this._makeTagPill({ label, count, state }));
        }

        const extraSeeds = SEED_TAGS.filter(s => !knownSet.has(s.toLowerCase()) && matches(s));
        if (extraSeeds.length) {
            container.appendChild(this._makeSeparator());
            for (const label of extraSeeds) {
                const state = this._tagState(label);
                container.appendChild(this._makeTagPill({ label, state, seed: true }));
            }
        }

        if (q && !entries.length && !extraSeeds.length) {
            const empty = document.createElement('div');
            empty.className = 'bte-empty';
            empty.textContent = `No tags match "${this._tagQuery}". Press Enter in the search box to add it as new.`;
            container.appendChild(empty);
        }
    }

    _tagState(label) {
        const entry = this.tagActions.get(label.toLowerCase());
        return entry ? entry.action : 'none';
    }

    _cycleTag(label) {
        const key = label.toLowerCase();
        const cur = this.tagActions.get(key);
        if (!cur) {
            this.tagActions.set(key, { action: 'add', label });
        } else if (cur.action === 'add') {
            this.tagActions.set(key, { action: 'remove', label });
        } else {
            this.tagActions.delete(key);
        }
        this._render();
    }

    _makePill({ label, count, active, seed, kind, onClick }) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const classes = ['bte-pill'];
        if (kind === 'clear') classes.push('bte-pill-clear');
        if (seed) classes.push('bte-pill-seed');
        if (active) classes.push('bte-pill-active');
        btn.className = classes.join(' ');
        btn.innerHTML = `<span class="bte-pill-label">${escapeHtml(label)}</span>` +
            (typeof count === 'number' ? `<span class="bte-pill-count">${count}</span>` : '');
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            onClick && onClick();
        });
        return btn;
    }

    _makeTagPill({ label, count, state, seed }) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const classes = ['bte-pill', 'bte-pill-tag'];
        if (seed) classes.push('bte-pill-seed');
        if (state === 'add') classes.push('bte-pill-add');
        else if (state === 'remove') classes.push('bte-pill-remove');
        btn.className = classes.join(' ');
        const marker = state === 'add' ? '+ ' : state === 'remove' ? '- ' : '';
        btn.innerHTML = `<span class="bte-pill-label">${escapeHtml(marker + label)}</span>` +
            (typeof count === 'number' ? `<span class="bte-pill-count">${count}</span>` : '');
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            this._cycleTag(label);
        });
        return btn;
    }

    _makeSeparator() {
        const el = document.createElement('div');
        el.className = 'bte-pills-separator';
        return el;
    }

    // Compute the pending change for a single track (or null if no change).
    _computeChange(track) {
        const { genre: curGenre, subgenre: curSubgenre } = splitGenre(track.genre || '');
        let newGenre = curGenre;
        let newSubgenre = curSubgenre;
        let genreTouched = false;

        if (this.genreChoice !== null) {
            if (this.genreChoice === '') {
                // Clear whole genre field (both parts)
                newGenre = '';
                newSubgenre = '';
                genreTouched = true;
            } else if (!ciEquals(this.genreChoice, curGenre)) {
                newGenre = this.genreChoice;
                genreTouched = true;
            } else if (this.genreChoice !== curGenre) {
                // Casing change only — still counts as a change
                newGenre = this.genreChoice;
                genreTouched = true;
            }
        }

        if (this.subgenreChoice !== null) {
            if (this.subgenreChoice === '') {
                if (newSubgenre) {
                    newSubgenre = '';
                    genreTouched = true;
                }
            } else {
                // Only apply subgenre if we have a genre to attach it to (existing or pending)
                if (newGenre) {
                    if (!ciEquals(this.subgenreChoice, newSubgenre) || this.subgenreChoice !== newSubgenre) {
                        if (newSubgenre !== this.subgenreChoice) {
                            newSubgenre = this.subgenreChoice;
                            genreTouched = true;
                        }
                    }
                }
                // If no genre on track and no genre pending, do not compose — skip subgenre.
            }
        }

        const composedGenre = composeGenre(newGenre, newSubgenre);
        const genreChanged = genreTouched && composedGenre !== (track.genre || '');

        // Tags
        const curTags = normalizeTags(track.tags);
        let workingTags = this.clearTagsAll ? [] : curTags.slice();

        const adds = [];
        const removes = [];
        for (const { action, label } of this.tagActions.values()) {
            if (action === 'add') adds.push(label);
            else if (action === 'remove') removes.push(label);
        }

        // Apply adds (union, case-insensitive dedupe, preserve original casing when already there)
        if (adds.length) {
            const existingLower = new Set(workingTags.map(t => t.toLowerCase()));
            for (const a of adds) {
                if (!existingLower.has(a.toLowerCase())) {
                    workingTags.push(a);
                    existingLower.add(a.toLowerCase());
                }
            }
        }
        // Apply removes
        if (removes.length) {
            const removeSet = new Set(removes.map(r => r.toLowerCase()));
            workingTags = workingTags.filter(t => !removeSet.has(t.toLowerCase()));
        }

        workingTags = dedupeCI(workingTags);

        const tagsChanged = this.clearTagsAll || adds.length || removes.length
            ? !this._tagsEqual(curTags, workingTags)
            : false;

        if (!genreChanged && !tagsChanged) return null;

        return {
            genreChanged,
            tagsChanged,
            oldGenre: track.genre || '',
            newGenre: composedGenre,
            oldTags: curTags,
            newTags: workingTags
        };
    }

    _tagsEqual(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
    }

    _renderDiff() {
        const summaryEl = this.rootEl.querySelector('[data-bte-diff-summary]');
        const sampleEl = this.rootEl.querySelector('[data-bte-diff-sample]');
        const applyBtn = this.rootEl.querySelector('[data-bte-apply]');

        const selected = this._getSelectedTracks();
        const anyPending =
            this.genreChoice !== null ||
            this.subgenreChoice !== null ||
            this.tagActions.size > 0 ||
            this.clearTagsAll;

        if (!anyPending || selected.length === 0) {
            summaryEl.innerHTML = anyPending
                ? `<span class="bte-diff-none">No tracks selected.</span>`
                : `<span class="bte-diff-none">No changes staged.</span>`;
            sampleEl.hidden = true;
            sampleEl.innerHTML = '';
            applyBtn.disabled = true;
            applyBtn.classList.add('bte-btn-disabled');
            return;
        }

        const changes = [];
        for (const t of selected) {
            const c = this._computeChange(t);
            if (c) changes.push({ track: t, change: c });
        }

        if (!changes.length) {
            summaryEl.innerHTML = `<span class="bte-diff-none">No effective changes (selected tracks already match).</span>`;
            sampleEl.hidden = true;
            sampleEl.innerHTML = '';
            applyBtn.disabled = true;
            applyBtn.classList.add('bte-btn-disabled');
            return;
        }

        applyBtn.disabled = false;
        applyBtn.classList.remove('bte-btn-disabled');

        summaryEl.innerHTML = `
            <span class="bte-diff-count">Will update ${changes.length} track${changes.length === 1 ? '' : 's'}</span>
            <button type="button" class="bte-diff-toggle" data-bte-diff-toggle>
                ${this._diffExpanded ? 'Hide diff' : 'Show diff'}
            </button>
        `;
        summaryEl.querySelector('[data-bte-diff-toggle]').addEventListener('click', () => {
            this._diffExpanded = !this._diffExpanded;
            this._renderDiff();
        });

        if (this._diffExpanded) {
            const sample = changes.slice(0, 5);
            const lines = sample.map(({ track, change }) => {
                const pieces = [];
                if (change.genreChanged) {
                    pieces.push(`genre '${escapeHtml(change.oldGenre || '(empty)')}' → '${escapeHtml(change.newGenre || '(empty)')}'`);
                }
                if (change.tagsChanged) {
                    const oldSet = new Set(change.oldTags.map(t => t.toLowerCase()));
                    const newSet = new Set(change.newTags.map(t => t.toLowerCase()));
                    const added = change.newTags.filter(t => !oldSet.has(t.toLowerCase()));
                    const removed = change.oldTags.filter(t => !newSet.has(t.toLowerCase()));
                    if (added.length) pieces.push(`+tag ${added.map(t => `'${escapeHtml(t)}'`).join(', ')}`);
                    if (removed.length) pieces.push(`−tag ${removed.map(t => `'${escapeHtml(t)}'`).join(', ')}`);
                }
                const title = track.title || track.name || track.file || track.id || '(untitled)';
                return `<div class="bte-diff-row"><span class="bte-diff-track">${escapeHtml(title)}</span>: ${pieces.join('; ')}</div>`;
            });
            if (changes.length > sample.length) {
                lines.push(`<div class="bte-diff-more">…and ${changes.length - sample.length} more</div>`);
            }
            sampleEl.innerHTML = lines.join('');
            sampleEl.hidden = false;
        } else {
            sampleEl.hidden = true;
            sampleEl.innerHTML = '';
        }
    }

    async _apply() {
        const selected = this._getSelectedTracks();
        if (!selected.length) {
            this.close();
            return;
        }
        const applyBtn = this.rootEl.querySelector('[data-bte-apply]');
        const prevLabel = applyBtn.textContent;
        applyBtn.disabled = true;
        applyBtn.textContent = 'Applying…';

        let updated = 0;
        let failed = 0;
        const staged = [];
        for (const track of selected) {
            const change = this._computeChange(track);
            if (!change) continue;
            const path = this.pendingDiffs ? localFileOf(track) : '';
            if (path) {
                try { staged.push(...await this._stage(track, change, path)); }
                catch (err) { failed++; console.error('BatchTagEditor: stage failed', err, track.id); }
                continue;
            }
            // Only the changed fields: the cached row may be stale, and a whole
            // row would revert what the server changed since (paths, tag writes).
            const fields = {};
            if (change.genreChanged) {
                fields.genre = change.newGenre;
                fields.genre_source = 'manual-batch';
            }
            if (change.tagsChanged) {
                fields.tags = change.newTags;
                // Keep the Comments field in sync — tags ARE the comma-separated comments.
                fields.comments = change.newTags.join(', ');
                fields.tags_source = 'manual-batch';
            }
            try {
                await this.database.patchTrack(track.id, fields);
                updated++;
            } catch (err) {
                failed++;
                console.error('BatchTagEditor: patchTrack failed', err, track.id);
            }
        }

        applyBtn.textContent = prevLabel;
        try {
            this.onCommitted({ updated, failed, staged });
        } catch (err) {
            console.error('BatchTagEditor: onCommitted threw', err);
        }
        this._resetPending();
        this.close();
    }

    /** Stage a local row's file fields; returns what to take back if nothing is written. */
    async _stage(track, change, path) {
        const fields = [];
        if (change.genreChanged) fields.push(['genre', track.genre ?? '', change.newGenre]);
        if (change.tagsChanged) fields.push(['comments', track.comments ?? '', change.newTags.join(', ')]);
        const staged = [];
        try {
            for (const [field, oldValue, proposedValue] of fields) {
                const previous = await this.pendingDiffs.get(track.id, field);
                await this.pendingDiffs.stage({ trackId: track.id, path, field, oldValue, proposedValue, source: SOURCE });
                staged.push({ trackId: String(track.id), field, proposedValue, previous });
            }
        } catch (err) {
            // Half a track staged is none of it: take back the fields already staged.
            await this.unstage(staged).catch(() => {});
            throw err;
        }
        return staged;
    }

    /** Take back what `_apply` staged, where it is still staged unchanged; an earlier diff returns. */
    async unstage(staged = []) {
        for (const { trackId, field, proposedValue, previous } of staged) {
            const current = await this.pendingDiffs.get(trackId, field);
            if (current?.source !== SOURCE || String(current.proposedValue ?? '') !== String(proposedValue ?? '')) continue;
            if (previous) await this.pendingDiffs.stage(previous);
            else await this.pendingDiffs.discard(trackId, field);
        }
    }
}
