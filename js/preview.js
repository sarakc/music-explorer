// Previews of releases you don't own. One at a time, never preloaded: a
// Bandcamp release streams through one Audio element made on the first preview,
// shown in the player bar in place of the track; a release with only a Discogs id
// embeds its first Discogs video from YouTube in the host the caller gives. Starting
// a preview pauses the main player; playing anything there ends the preview; ×
// ends it, drops its source, and the paused track shows again.

import { PLAYER_ICONS, playGlyphHtml } from './player.js';
import { escapeHtml as esc } from './html.js';

const time = (sec) => { const s = Math.max(0, Math.floor(Number(sec) || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** The Bandcamp album or track page among a release's sources, or null. */
export function bandcampSource(release) {
    for (const s of release?.sources || []) {
        const url = s?.url || (s?.source === 'bandcamp' ? s.id : '');
        if (/^https:\/\/[a-z0-9-]+\.bandcamp\.com\/(album|track)\/[^/?#]+/i.test(String(url || ''))) return url;
    }
    if (/^https:\/\/[a-z0-9-]+\.bandcamp\.com\/(album|track)\//i.test(String(release?.url || ''))) return release.url;
    return null;
}

/** How a release previews: 'bandcamp', 'youtube' (a Discogs id, Discogs connected), or null. */
export function previewKind(release, { discogs = false } = {}) {
    if (bandcampSource(release)) return 'bandcamp';
    if (discogs && release?.discogsReleaseId) return 'youtube';
    return null;
}

/** A YouTube video id from a Discogs video's address, or null. */
export function youtubeId(uri) {
    const m = String(uri || '').match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
    return m ? m[1] : null;
}

export default class Preview {
    constructor({ app, fetchJson = async (url) => { const r = await fetch(url); const body = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(body.error || `HTTP ${r.status}`), { status: r.status, body }); return body; } } = {}) {
        this.app = app; this.fetchJson = fetchJson;
        this.state = null; // { key, kind, title, artist, source, tracks, index, release }
        this.audio = null; this.frame = null;
        this.listeners = new Set();
        this._gen = 0;
    }

    onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    _emit() { for (const fn of this.listeners) { try { fn(this.state); } catch (_) { /* never break the bar */ } } }

    get active() { return Boolean(this.state); }
    get playing() { return this.state?.kind === 'youtube' || Boolean(this.audio && !this.audio.paused); }
    isPlaying(key) { return this.state?.key === key; }

    /** Preview a release. `host` is where a YouTube video embeds. Resolves false when there is nothing to play. */
    async play(release, { key = release?.key, host = null } = {}) {
        const kind = previewKind(release, { discogs: Boolean(this.app?.backendServices?.discogs) });
        if (!kind) return false;
        if (this.state?.key === key) { this.toggle(); return true; }
        this.stop();
        const gen = ++this._gen;
        this._pauseMain();
        const base = { key, kind, release, title: release.title || '', artist: release.artist || '', index: 0, loading: true };
        this.state = { ...base, source: kind === 'bandcamp' ? 'Bandcamp' : 'YouTube', tracks: [] };
        this._render();
        try {
            if (kind === 'bandcamp') {
                const body = await this.fetchJson(`/api/preview/bandcamp?url=${encodeURIComponent(bandcampSource(release))}`);
                if (gen !== this._gen) return false;
                this.state = { ...this.state, loading: false, tracks: body.tracks || [], title: release.title || body.title, artist: release.artist || body.artist };
                this._playTrack(0);
            } else {
                const body = await this.fetchJson(`/api/discogs/release/${encodeURIComponent(release.discogsReleaseId)}/videos`);
                if (gen !== this._gen) return false;
                const video = (body.videos || []).map((v) => ({ ...v, id: youtubeId(v.uri) })).find((v) => v.id);
                if (!video) throw Object.assign(new Error('no-preview'), { status: 404 });
                this.state = { ...this.state, loading: false, tracks: [{ title: video.title || release.title }] };
                this._embed(video.id, host);
            }
        } catch (err) {
            if (gen !== this._gen) return false;
            this.stop();
            this.app?.showNotification?.(err?.status === 404 ? 'No preview for this release' : 'Preview unavailable', 'info');
            return false;
        }
        this._render();
        return true;
    }

    _pauseMain() {
        const player = this.app?.audioPlayer;
        if (player?.isPlaying) player.toggle();
        if (!this._unsubscribe && player?.subscribe) {
            // The main player starting again ends the preview.
            this._unsubscribe = player.subscribe(() => { if (this.state && player.isPlaying) this.stop(); });
        }
    }

    _ensureAudio() {
        if (this.audio) return this.audio;
        const a = new Audio();
        a.preload = 'none';
        a.volume = this.app?.audioPlayer?.audio?.volume ?? 1;
        for (const type of ['play', 'pause']) a.addEventListener(type, () => this._render());
        // Progress ticks touch the time alone, so buttons are never redrawn under the pointer.
        a.addEventListener('timeupdate', () => {
            const el = this._strip()?.strip.querySelector('.pv-time');
            const dur = Number.isFinite(a.duration) ? a.duration : this.state?.tracks?.[this.state.index]?.duration;
            if (el) el.textContent = `${time(a.currentTime)} / ${time(dur)}`;
        });
        a.addEventListener('ended', () => { if (this.state && this.state.index < this.state.tracks.length - 1) this._playTrack(this.state.index + 1); else this.stop(); });
        a.addEventListener('error', () => { if (this.state?.kind === 'bandcamp' && this.audio?.getAttribute('src')) { this.app?.showNotification?.('Preview unavailable', 'info'); this.stop(); } });
        this.audio = a;
        return a;
    }

    _playTrack(index) {
        const t = this.state?.tracks?.[index];
        if (!t?.stream) return this.stop();
        this.state = { ...this.state, index };
        const a = this._ensureAudio();
        a.src = t.stream;
        a.play().catch(() => this._render());
        this._render();
    }

    _embed(id, host) {
        const frame = document.createElement('iframe');
        frame.className = 'preview-frame';
        frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1`;
        frame.allow = 'autoplay; encrypted-media';
        frame.title = 'Preview';
        frame.setAttribute('loading', 'eager');
        (host || document.body).appendChild(frame);
        this.frame = frame;
    }

    toggle() {
        if (!this.audio || this.state?.kind !== 'bandcamp') return;
        if (this.audio.paused) this.audio.play().catch(() => {}); else this.audio.pause();
    }

    step(delta) {
        if (this.state?.kind !== 'bandcamp') return;
        const next = this.state.index + delta;
        if (next >= 0 && next < this.state.tracks.length) this._playTrack(next);
    }

    /** End the preview: drop its source and frame; the main track shows again, paused. */
    stop() {
        this._gen++;
        if (this.audio) { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); }
        this.frame?.remove(); this.frame = null;
        const was = this.state;
        this.state = null;
        this._render();
        if (was) this._emit();
    }

    // ---- the strip in the player bar ----

    _strip() {
        const host = this.app?.audioPlayer?.host || document.getElementById('localPlayerHost');
        if (!host) return null;
        let strip = host.querySelector('.preview-strip');
        if (!strip) {
            strip = document.createElement('section');
            strip.className = 'preview-strip';
            strip.setAttribute('aria-label', 'Preview');
            strip.hidden = true;
            host.appendChild(strip);
            strip.addEventListener('click', (e) => {
                const b = e.target.closest('[data-pv]');
                if (!b) return;
                const act = b.dataset.pv;
                if (act === 'stop') this.stop();
                else if (act === 'toggle') this.toggle();
                else if (act === 'prev') this.step(-1);
                else if (act === 'next') this.step(1);
                else if (act === 'shortlist') this._shortlist(b);
            });
        }
        return { host, strip };
    }

    async _shortlist(btn) {
        const release = this.state?.release;
        if (!release) return;
        btn.disabled = true;
        try {
            const { shortlistItemFromRelease, addShortlistItem, RELEASES_CHANGED } = await import('./shortlist.js');
            await addShortlistItem(this.app, shortlistItemFromRelease(release, 'preview'));
            btn.textContent = 'On Shortlist';
            window.dispatchEvent(new CustomEvent(RELEASES_CHANGED));
        } catch (err) { btn.disabled = false; this.app?.showNotification?.(`Shortlist not saved: ${err?.message || err}`, 'error'); }
    }

    _render() {
        const at = this._strip();
        if (!at) { this._emit(); return; }
        const { host, strip } = at;
        const s = this.state;
        host.classList.toggle('is-preview', Boolean(s));
        if (s && host.hidden) { this._hostWasHidden = true; host.hidden = false; }
        if (!s && this._hostWasHidden) { host.hidden = true; this._hostWasHidden = false; }
        strip.hidden = !s;
        if (!s) { strip.innerHTML = ''; this._emit(); return; }
        const bc = s.kind === 'bandcamp';
        const n = s.tracks.length;
        const track = s.tracks[s.index];
        const playing = bc && this.audio && !this.audio.paused;
        const where = s.loading ? 'Loading…' : bc ? `${s.index + 1} of ${n} · Bandcamp` : 'YouTube';
        const cur = bc && this.audio ? this.audio.currentTime : 0;
        const dur = bc ? (Number.isFinite(this.audio?.duration) ? this.audio.duration : track?.duration) : 0;
        strip.innerHTML = `<span class="pv-left"><span class="pv-pill">Preview</span>
            <span class="pv-copy"><strong>${esc(bc && track ? track.title : s.title)}</strong> <span class="pv-sub">${esc([bc ? s.title : '', s.artist].filter(Boolean).join(' · '))} · ${esc(where)}</span></span></span>
            ${bc ? `<span class="pv-transport">
                <button type="button" class="local-player-icon" data-pv="prev" aria-label="Previous track"${s.index > 0 ? '' : ' disabled'}>${PLAYER_ICONS.previous}</button>
                <button type="button" class="local-player-toggle" data-pv="toggle" aria-label="${playing ? 'Pause' : 'Play'}"><span class="local-player-toggle-glyph" aria-hidden="true">${playGlyphHtml(playing)}</span></button>
                <button type="button" class="local-player-icon" data-pv="next" aria-label="Next track"${s.index < n - 1 ? '' : ' disabled'}>${PLAYER_ICONS.next}</button>
            </span>` : '<span class="pv-transport"></span>'}
            <span class="pv-end">
                <button type="button" class="nr-act" data-pv="shortlist">Shortlist</button>
                ${bc ? `<span class="pv-time">${time(cur)} / ${time(dur)}</span>` : ''}
                <button type="button" class="pv-x" data-pv="stop" aria-label="Stop preview" title="Stop preview">×</button>
            </span>`;
        this._emit();
    }
}
