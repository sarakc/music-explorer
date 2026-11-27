// Pluggable metadata enrichment. Runs adapters against a set of tracks,
// stages suggestions for user review, commits to IndexedDB on accept.
// Hard rule: never proposes a value for a non-empty field. No file writes —
// every value stays in IndexedDB with a `{field}_source` stamp until the
// Phase 3 tag editor wires up the file-write path.
//
// Adapter interface (duck-typed):
//   { name: string, async suggest(track) -> Array<{ field, value }> }
// Orchestrator filters suggestions against the live track and keeps
// first-writer-wins when multiple adapters propose the same field.
import { escapeHtml } from './html.js';

function isFieldNonEmpty(v) {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return true;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

export class EnrichmentOrchestrator {
    constructor({ database }) {
        this.database = database;
        this.adapters = [];
        this.state = null;
        this._listeners = new Set();
    }

    registerAdapter(adapter) {
        this.adapters.push(adapter);
    }

    onProgress(cb) {
        this._listeners.add(cb);
        return () => this._listeners.delete(cb);
    }

    isRunning() {
        return this.state?.running === true;
    }

    async run(tracks) {
        if (this.isRunning()) return null;
        if (!tracks?.length || !this.adapters.length) return null;

        this.state = {
            running: true,
            cancelled: false,
            total: tracks.length * this.adapters.length,
            processed: 0,
            suggestions: new Map(),
        };
        this._emit();

        for (const track of tracks) {
            if (this.state.cancelled) break;
            const fresh = (await this.database.getTrack(track.id)) || track;
            const claimed = new Set();

            for (const adapter of this.adapters) {
                if (this.state.cancelled) break;
                try {
                    const raw = await adapter.suggest(fresh);
                    for (const s of raw || []) {
                        if (!s?.field || s.value == null || s.value === '') continue;
                        if (claimed.has(s.field)) continue;
                        if (isFieldNonEmpty(fresh[s.field])) continue;
                        const list = this.state.suggestions.get(fresh.id) || [];
                        list.push({ field: s.field, value: s.value, source: adapter.name });
                        this.state.suggestions.set(fresh.id, list);
                        claimed.add(s.field);
                    }
                } catch (err) {
                    console.warn(`[enrichment] ${adapter.name} failed on ${fresh.id}:`, err?.message || err);
                }
                this.state.processed++;
                this._emit();
            }
        }

        this.state.running = false;
        this._emit();
        return this.state;
    }

    stop() {
        if (!this.state) return;
        this.state.cancelled = true;
        this.state.running = false;
        this._emit();
    }

    // Apply accepted suggestions to IDB. `accepted` is Map<trackId, Set<field>>.
    // Re-reads each track to avoid racing with manual edits; re-checks the
    // empty-field invariant before writing.
    async commit(accepted) {
        let committedTracks = 0;
        let committedFields = 0;
        for (const [trackId, fields] of accepted) {
            const suggestions = this.state?.suggestions?.get(trackId);
            if (!suggestions?.length || !fields?.size) continue;
            const fresh = await this.database.getTrack(trackId);
            if (!fresh) continue;

            let dirty = false;
            for (const s of suggestions) {
                if (!fields.has(s.field)) continue;
                if (isFieldNonEmpty(fresh[s.field])) continue;
                fresh[s.field] = s.value;
                fresh[`${s.field}_source`] = s.source;
                dirty = true;
                committedFields++;
            }
            if (dirty) {
                await this.database.updateTrack(fresh);
                committedTracks++;
            }
        }
        return { committedTracks, committedFields };
    }

    _emit() {
        for (const cb of this._listeners) {
            try { cb(this.state); } catch { /* listener errors are not our problem */ }
        }
    }
}

// Discogs release adapter — uses the existing /api/discogs/release/resolve
// and /api/discogs/release/:id endpoints. Both are cached server-side, so
// subsequent runs are fast. Fills year / country / catno / genre / style /
// discogs_id. Sleeps between HTTP calls to respect Discogs 60/min limit.
export class DiscogsReleaseAdapter {
    constructor({ rateLimit = 1100 } = {}) {
        this.name = 'discogs-release';
        this._rateLimit = rateLimit;
    }

    async suggest(track) {
        const releaseId = await this._resolveId(track);
        if (!releaseId) return [];
        await sleep(this._rateLimit);
        const release = await this._fetchRelease(releaseId);
        if (!release) return [];

        const out = [];
        if (release.year) out.push({ field: 'year', value: release.year });
        if (release.country) out.push({ field: 'country', value: release.country });
        const catno = (release.labels || []).find((l) => l?.catno)?.catno;
        if (catno) out.push({ field: 'catno', value: catno });
        if (release.genres?.length) out.push({ field: 'genre', value: release.genres.join(', ') });
        if (release.styles?.length) out.push({ field: 'style', value: release.styles.join(', ') });
        if (!track.discogs_id) out.push({ field: 'discogs_id', value: String(releaseId) });
        if (!track.discogs_url && releaseId) {
            out.push({ field: 'discogs_url', value: `https://www.discogs.com/release/${releaseId}` });
        }
        return out;
    }

    async _resolveId(track) {
        if (track.discogs_id) return track.discogs_id;
        const artist = (track.artist || '').trim();
        const album = (track.album || '').trim();
        const title = (track.title || '').trim();
        if (!artist || (!album && !title)) return null;

        const params = new URLSearchParams({ artist });
        if (album) params.set('album', album);
        if (title) params.set('title', title);
        const res = await fetch(`/api/discogs/release/resolve?${params}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.match?.release_id || null;
    }

    async _fetchRelease(id) {
        const res = await fetch(`/api/discogs/release/${encodeURIComponent(id)}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.release || null;
    }
}

// MusicBrainz adapter — free public metadata API, no auth, 1 req/sec. Fills
// ISRCs, canonical release date, country, catalog_number, and MusicBrainz IDs
// (useful for later AcousticBrainz / ListenBrainz joins). Server proxy paces
// the calls globally so multiple concurrent runs don't blow the rate limit.
export class MusicBrainzAdapter {
    constructor() {
        this.name = 'musicbrainz';
    }

    async suggest(track) {
        const artist = (track.artist || '').trim();
        const title = (track.title || '').trim();
        const album = (track.album || '').trim();
        if (!artist) return [];

        const out = [];

        if (title) {
            const rec = await this._lookupRecording({ artist, title, album });
            if (rec) {
                if (rec.mbid) out.push({ field: 'musicbrainz_recording_id', value: rec.mbid });
                if (rec.isrcs?.length) out.push({ field: 'isrc', value: rec.isrcs[0] });
                if (rec.release) {
                    if (rec.release.mbid) out.push({ field: 'musicbrainz_release_id', value: rec.release.mbid });
                    if (rec.release.date) out.push({ field: 'release_date', value: rec.release.date });
                    if (rec.release.country) out.push({ field: 'country', value: rec.release.country });
                    const catno = rec.release.catalog_numbers?.[0];
                    if (catno) out.push({ field: 'catno', value: catno });
                }
                return out;
            }
        }

        // Fallback: if we only have album, try release lookup.
        if (album) {
            const rel = await this._lookupRelease({ artist, album });
            if (rel) {
                if (rel.mbid) out.push({ field: 'musicbrainz_release_id', value: rel.mbid });
                if (rel.date) out.push({ field: 'release_date', value: rel.date });
                if (rel.country) out.push({ field: 'country', value: rel.country });
                const catno = rel.catalog_numbers?.[0];
                if (catno) out.push({ field: 'catno', value: catno });
            }
        }

        return out;
    }

    async _lookupRecording({ artist, title, album }) {
        const params = new URLSearchParams({ artist, title });
        if (album) params.set('album', album);
        const res = await fetch(`/api/musicbrainz/recording?${params}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.match || null;
    }

    async _lookupRelease({ artist, album }) {
        const params = new URLSearchParams({ artist, album });
        const res = await fetch(`/api/musicbrainz/release?${params}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.match || null;
    }
}

// FLAC sidecar adapter — when a track has a paired FLAC (via P2.5.1 sidecar),
// reads its Vorbis comments server-side and treats them as authoritative. This
// is the highest-confidence source for tracks the user ripped themselves, since FLAC
// tags are set at import time. Skips tracks without `local_path` or where the
// pair API returns no matched FLAC.
export class FlacSidecarAdapter {
    constructor() {
        this.name = 'flac-sidecar';
    }

    async suggest(track) {
        const mp3Path = track.local_path || track.file || '';
        if (!mp3Path) return [];

        const tags = await this._fetchFlacTags(mp3Path);
        if (!tags) return [];

        const out = [];
        const pick = (field, val) => {
            if (val == null) return;
            const v = String(val).trim();
            if (v) out.push({ field, value: v });
        };
        pick('bpm', tags.bpm);
        pick('year', tags.year);
        pick('country', tags.country);
        pick('catno', tags.catalognumber || tags.catalog || tags.catno);
        pick('label', tags.label || tags.publisher);
        pick('genre', tags.genre);
        pick('isrc', tags.isrc);
        pick('release_date', tags.date || tags.originaldate);
        return out;
    }

    async _fetchFlacTags(mp3Path) {
        const params = new URLSearchParams({ path: mp3Path });
        const res = await fetch(`/api/library/flac-tags?${params}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.tags || null;
    }
}

// ─── Review modal ──────────────────────────────────────────────────────
// Opens a lightweight dialog that drives the orchestrator through the
// run → review → commit lifecycle. Returns a promise that resolves when
// the modal closes (with whatever the user committed, if anything).

const FIELD_LABELS = {
    year: 'Year',
    country: 'Country',
    catno: 'Cat #',
    genre: 'Genre',
    style: 'Style',
    discogs_id: 'Discogs ID',
    discogs_url: 'Discogs URL',
    bpm: 'BPM',
    energy: 'Energy',
    danceability: 'Danceability',
    isrc: 'ISRC',
    label: 'Label',
    coverArt: 'Cover art',
    release_date: 'Release date',
    musicbrainz_recording_id: 'MB recording',
    musicbrainz_release_id: 'MB release',
};

const SOURCE_LABELS = {
    'discogs-release': 'Discogs',
    'discogs-auto': 'Discogs',
    'musicbrainz': 'MusicBrainz',
    'flac-sidecar': 'FLAC tag',
    'spotify-audio-features': 'Spotify',
    'beatport-scrape': 'Beatport',
    'tunebat-scrape': 'Tunebat',
};

function fieldLabel(field) {
    return FIELD_LABELS[field] || field;
}

function sourceLabel(source) {
    return SOURCE_LABELS[source] || source;
}

function renderValuePreview(value) {
    if (typeof value === 'string' && value.startsWith('http')) {
        return `<a href="${escapeHtml(value)}" target="_blank" rel="noopener">${escapeHtml(value.slice(0, 60))}${value.length > 60 ? '…' : ''}</a>`;
    }
    return escapeHtml(value);
}

// Opens the modal and runs the full enrichment flow. Returns { committedTracks, committedFields }
// or null if cancelled. Caller is responsible for creating the orchestrator + registering adapters.
export async function openEnrichmentModal({ orchestrator, tracks, onCommitted }) {
    if (!tracks?.length) return null;

    const backdrop = document.createElement('div');
    backdrop.className = 'enrich-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'enrich-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Enrich metadata');
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    let unsub = null;
    let resolveClose;
    const closed = new Promise((r) => { resolveClose = r; });

    function close(result) {
        if (unsub) { unsub(); unsub = null; }
        backdrop.remove();
        resolveClose(result);
    }

    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop && !orchestrator.isRunning()) close(null);
    });
    const escHandler = (e) => {
        if (e.key === 'Escape' && !orchestrator.isRunning()) {
            document.removeEventListener('keydown', escHandler);
            close(null);
        }
    };
    document.addEventListener('keydown', escHandler);

    function paintProgress(state) {
        const pct = state?.total ? Math.round((state.processed / state.total) * 100) : 0;
        dialog.innerHTML = `
            <header class="enrich-head">
                <h2>Enriching metadata</h2>
                <p class="muted">${state?.processed || 0} / ${state?.total || 0} checks · ${tracks.length} tracks</p>
            </header>
            <div class="enrich-progress"><div class="enrich-progress-bar" style="width:${pct}%"></div></div>
            <footer class="enrich-foot">
                <span class="muted">Empty fields only · no file writes</span>
                <button type="button" class="btn btn-sm btn-secondary" data-stop>Stop</button>
            </footer>
        `;
        dialog.querySelector('[data-stop]')?.addEventListener('click', () => orchestrator.stop());
    }

    function paintReview(state) {
        const tracksById = new Map(tracks.map((t) => [t.id, t]));
        const entries = [];
        for (const [trackId, list] of state.suggestions) {
            const t = tracksById.get(trackId);
            if (!t || !list?.length) continue;
            entries.push({ track: t, suggestions: list });
        }

        if (!entries.length) {
            dialog.innerHTML = `
                <header class="enrich-head">
                    <h2>Nothing to enrich</h2>
                    <p class="muted">No empty fields could be filled from the current sources.</p>
                </header>
                <footer class="enrich-foot">
                    <span></span>
                    <button type="button" class="btn btn-sm" data-close>Close</button>
                </footer>
            `;
            dialog.querySelector('[data-close]')?.addEventListener('click', () => close({ committedTracks: 0, committedFields: 0 }));
            return;
        }

        const totalSuggestions = entries.reduce((n, e) => n + e.suggestions.length, 0);
        const rowsHtml = entries.map(({ track, suggestions }) => {
            const trackLabel = `${track.artist || 'Unknown'} — ${track.title || track.album || '(untitled)'}`;
            const fieldRows = suggestions.map((s) => `
                <label class="enrich-row">
                    <input type="checkbox" data-track-id="${escapeHtml(track.id)}" data-field="${escapeHtml(s.field)}" checked>
                    <span class="enrich-field">${escapeHtml(fieldLabel(s.field))}</span>
                    <span class="enrich-value">${renderValuePreview(s.value)}</span>
                    <span class="enrich-source" data-source="${escapeHtml(s.source)}">${escapeHtml(sourceLabel(s.source))}</span>
                </label>
            `).join('');
            return `
                <section class="enrich-track">
                    <h3>${escapeHtml(trackLabel)}</h3>
                    ${fieldRows}
                </section>
            `;
        }).join('');

        dialog.innerHTML = `
            <header class="enrich-head">
                <h2>Review proposed changes</h2>
                <p class="muted">${totalSuggestions} suggestion${totalSuggestions === 1 ? '' : 's'} across ${entries.length} track${entries.length === 1 ? '' : 's'}. Uncheck anything you want to skip.</p>
            </header>
            <div class="enrich-body">${rowsHtml}</div>
            <footer class="enrich-foot">
                <div class="enrich-foot-left">
                    <button type="button" class="btn btn-sm btn-secondary" data-check-all>Check all</button>
                    <button type="button" class="btn btn-sm btn-secondary" data-uncheck-all>Uncheck all</button>
                </div>
                <div class="enrich-foot-right">
                    <button type="button" class="btn btn-sm btn-secondary" data-cancel>Cancel</button>
                    <button type="button" class="btn btn-sm" data-commit>Apply</button>
                </div>
            </footer>
        `;

        const boxes = () => dialog.querySelectorAll('input[type="checkbox"][data-track-id]');
        dialog.querySelector('[data-check-all]')?.addEventListener('click', () => boxes().forEach((b) => { b.checked = true; }));
        dialog.querySelector('[data-uncheck-all]')?.addEventListener('click', () => boxes().forEach((b) => { b.checked = false; }));
        dialog.querySelector('[data-cancel]')?.addEventListener('click', () => close({ committedTracks: 0, committedFields: 0 }));
        dialog.querySelector('[data-commit]')?.addEventListener('click', async () => {
            const accepted = new Map();
            for (const box of boxes()) {
                if (!box.checked) continue;
                const id = box.dataset.trackId;
                const field = box.dataset.field;
                if (!accepted.has(id)) accepted.set(id, new Set());
                accepted.get(id).add(field);
            }
            const result = await orchestrator.commit(accepted);
            if (typeof onCommitted === 'function') onCommitted(result);
            close(result);
        });
    }

    paintProgress(null);
    unsub = orchestrator.onProgress((state) => {
        if (!state) return;
        if (state.running) paintProgress(state);
        else paintReview(state);
    });

    orchestrator.run(tracks).catch((err) => {
        console.error('[enrichment] run failed:', err);
    });

    return closed;
}
