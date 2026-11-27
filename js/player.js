import { playbackSessionId, sessionCanPlay, sessionPlaybackProgress } from './collection-session.js';
import { coverArtUrl, hasCoverArt } from './cover-art.js';
import { entityLinkHtml, wireEntityLinks } from './entity-links.js';
import * as Q from './play-queue.js';
import { isIOS } from './platform.js';
import { isStashedTrack } from './stash.js';
import { STAR, HEART, pairOf, paintMark } from './favorite-marks.js';

const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'aiff', 'aif', 'alac']);

export function localAudioPath(track) {
    return String(track?.local_path || track?.path || track?.file || '').trim();
}

export function isLocalPlayable(track) {
    const path = localAudioPath(track);
    if (!path || track?.availability !== 'local') return false;
    const extension = path.split('.').pop()?.toLowerCase();
    return AUDIO_EXTENSIONS.has(extension || '');
}

export function buildLocalAudioUrl(track) {
    const path = localAudioPath(track);
    return path ? `/api/library/audio?path=${encodeURIComponent(path)}` : '';
}

export function formatPlayerTime(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function playableQueue(tracks) {
    const seen = new Set();
    return (tracks || []).filter((track) => {
        const id = String(track?.id || '');
        if (!id || seen.has(id) || !isLocalPlayable(track)) return false;
        seen.add(id);
        return true;
    });
}

/** Render the current track identity with the app-wide entity-link contract. */
export function playerIdentityHtml(track) {
    return {
        title: entityLinkHtml({
            type: 'track',
            name: track?.id,
            text: track?.title || 'Nothing playing',
            title: track ? 'Open track page' : '',
        }),
        artist: entityLinkHtml({
            type: 'artist',
            name: track?.artist,
            title: track?.artist ? 'Open artist page' : '',
        }),
        album: entityLinkHtml({
            type: 'album',
            name: track?.album,
            artist: track?.artist,
            title: track?.album ? 'Open album page' : '',
        }),
    };
}


// Transport glyphs as inline SVG so play/pause/skip share one visual weight
// across fonts and skins (the old text glyphs mixed a serif "Ⅱ" with a sans
// "▶"). `fill="currentColor"` lets each button colour them via CSS; line
// icons (shuffle, repeat, queue) stroke with currentColor instead.
const svg = (d, { stroke = false } = {}) => (stroke
    ? `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`
    : `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor"><path d="${d}"/></svg>`);
export const PLAYER_ICONS = Object.freeze({
    play: svg('M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z'),
    pause: svg('M7 5h3.5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm6.5 0H17a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-3.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'),
    previous: svg('M6 6h2.2v12H6zM18 6.9v10.2a.9.9 0 0 1-1.4.75L9.3 12.75a.9.9 0 0 1 0-1.5l7.3-5.1A.9.9 0 0 1 18 6.9z'),
    next: svg('M15.8 6H18v12h-2.2zM6 6.9v10.2a.9.9 0 0 0 1.4.75l7.3-5.1a.9.9 0 0 0 0-1.5L7.4 6.15A.9.9 0 0 0 6 6.9z'),
    shuffle: svg('M4 7h2.5c1.9 0 3.1.9 4.1 2.4l2.8 5.2c1 1.5 2.2 2.4 4.1 2.4H20M4 17h2.5c1.4 0 2.4-.5 3.2-1.4M14.3 8.4c.8-.9 1.8-1.4 3.2-1.4H20M17 4l3 3-3 3M17 14l3 3-3 3', { stroke: true }),
    repeat: svg('M17 2.5l3 3-3 3M4 11.5v-1a5 5 0 0 1 5-5h11M7 21.5l-3-3 3-3M20 12.5v1a5 5 0 0 1-5 5H4', { stroke: true }),
    queue: svg('M4 6h12M4 12h12M4 18h7M15 15v6l5-3z', { stroke: true }),
    // Stash: an eye with a slash (hidden from Collection), outline until stashed,
    // then a filled eye cut by the slash (even-odd: the slash is a gap inside the eye).
    stash: svg('M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-2.6 3.7M6.6 6.6C4.4 8 2.8 10.2 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2', { stroke: true }),
    stashed: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12zM3.85 2.15l18 18-1.7 1.7-18-18z"/></svg>',
    // The visualizer: a wave.
    wave: svg('M2 12c1.6-6.5 3.3-6.5 5 0s3.3 6.5 5 0 3.3-6.5 5 0 3.3 6.5 5 0', { stroke: true }),
});
export const stashIconHtml = (on) => (on ? PLAYER_ICONS.stashed : PLAYER_ICONS.stash);
export function playGlyphHtml(playing) {
    return playing ? PLAYER_ICONS.pause : PLAYER_ICONS.play;
}

const POSITION_SAVE_MS = 5000;
const PRELOAD_LEAD_SEC = 15;
const SKIP_DELAY_MS = 1500;
const FAILURE_STOP = 3;
const LOAD_FAILURES = Object.freeze({
    403: 'File is outside the library roots',
    404: 'File not found at its saved path — see Import › File paths',
    415: 'Unsupported audio format',
});
const REPEAT_LABELS = Object.freeze({ off: 'Repeat: off', all: 'Repeat: all', one: 'Repeat: one' });

const defaultChannel = () => {
    if (typeof BroadcastChannel !== 'function') return null;
    const channel = new BroadcastChannel('umm-playback');
    channel.unref?.(); // Node only: never hold a test process open
    return channel;
};
const defaultCreateAudio = () => (typeof Audio === 'function' ? new Audio() : null);

/**
 * A single, persistent HTMLAudioElement shared by every view in the SPA, driven
 * by the pure queue model in play-queue.js and persisted through `store`
 * (a PlayQueueClient; null keeps the queue in memory only).
 */
export default class LocalAudioPlayer {
    constructor({
        host, audio, app, fetchImpl, onStateChange, store = null, resolveTrack, notify,
        rng = Math.random, channel, mediaSession, createAudio, setTimeoutImpl, history = null,
        ios = isIOS(), skip = null, stash = null, visualize = null, marks = null,
    } = {}) {
        if (!host) throw new Error('LocalAudioPlayer requires a host element');
        this.host = host;
        this.audio = audio || new Audio();
        this.app = app;
        this.fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
        this.onStateChange = onStateChange || (() => {});
        this.store = store;
        this.history = history; // a PlayHistory (play-history.js); null records nothing
        this.resolveTrack = resolveTrack || (() => null);
        this.notify = notify || ((message) => this.app?.showNotification?.(message, 'info'));
        this.rng = rng;
        this.skip = skip; // (trackId) => true for context tracks Next passes over (stashed)
        this.stash = stash; // (trackIds, on) => Promise; null hides the Stash button (the viewer)
        this.marks = marks; // the app's FavoriteMarks: ☆ and ♡ for the playing track; null hides them (the viewer)
        this.visualize = visualize; // () => opens the visualizer; null hides its button (the viewer)
        this.channel = channel === undefined ? (playbackSessionId() ? null : defaultChannel()) : channel;
        this.mediaSession = mediaSession === undefined ? globalThis.navigator?.mediaSession || null : mediaSession;
        this.ios = Boolean(ios);
        this._createAudio = createAudio || (audio ? () => null : defaultCreateAudio);
        this._setTimeout = setTimeoutImpl || ((fn, ms) => setTimeout(fn, ms));
        this.tabId = Math.random().toString(36).slice(2);
        this._remoteTabId = null; // another tab that said it is playing

        this.queue = Q.emptyQueue();
        this._revision = 0;
        this._pendingOps = [];
        this._saving = false;
        this._knownTracks = new Map();
        this._loadedEntryId = null;
        this._loadedTrackId = null;
        this._wantPlay = false;
        this._failStreak = 0;
        this._spare = null;
        this._spareUrl = '';
        this._lastPositionSave = 0;
        this._listeners = new Set();
        this.error = '';
        this.saveError = '';

        this.audio.preload = 'metadata';
        this.audio.volume = this._savedVolume();
        this._mount();
        this._wireAudio(this.audio);
        this._wireChannel();
        this._wireMediaSession();
        this._render();
    }

    _savedVolume() {
        try {
            const stored = localStorage.getItem('umm.playerVolume');
            if (stored === null || stored === '') return 0.8; // never saved: Number(null) would be 0 (silent)
            const value = Number(stored);
            return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.8;
        } catch (_) {
            return 0.8;
        }
    }

    _mount() {
        this.host.className = 'local-player-host';
        this.host.hidden = true;
        this.host.innerHTML = `
            <section class="local-player" aria-label="Local audio player">
                <input class="local-player-seek" data-player-seek type="range" min="0" max="1000" step="1" value="0" aria-label="Seek through track">
                <div class="local-player-track">
                    <span class="local-player-art-wrap" aria-hidden="true">
                        <span class="local-player-art-placeholder"></span>
                        <img class="local-player-art" alt="">
                    </span>
                    <span class="local-player-copy">
                        <strong class="local-player-title">Nothing playing</strong>
                        <span class="local-player-artist"></span>
                        <span class="local-player-album" hidden></span>
                        <span class="local-player-status" aria-live="polite"></span>
                    </span>
                    <button type="button" class="local-player-icon local-player-mark" data-player-mark="${STAR}" aria-pressed="false" aria-label="DJ" title="DJ" hidden>☆</button>
                    <button type="button" class="local-player-icon local-player-mark" data-player-mark="${HEART}" aria-pressed="false" aria-label="Downtime" title="Downtime" hidden>♡</button>
                    <button type="button" class="local-player-icon local-player-stash" data-player-action="stash" aria-pressed="false" aria-label="Stash" title="Stash" hidden>${PLAYER_ICONS.stash}</button>
                    <button type="button" class="local-player-icon local-player-viz" data-player-action="visualize" aria-label="Visualizer" title="Visualizer" hidden>${PLAYER_ICONS.wave}</button>
                </div>
                <div class="local-player-transport">
                    <button type="button" class="local-player-icon local-player-mode" data-player-action="shuffle" aria-label="Shuffle" aria-pressed="false" title="Shuffle">${PLAYER_ICONS.shuffle}</button>
                    <button type="button" class="local-player-icon" data-player-action="previous" aria-label="Previous track" title="Previous track">${PLAYER_ICONS.previous}</button>
                    <button type="button" class="local-player-toggle" data-player-action="toggle" aria-label="Play" title="Play"><span class="local-player-toggle-glyph" aria-hidden="true">${PLAYER_ICONS.play}</span></button>
                    <button type="button" class="local-player-icon" data-player-action="next" aria-label="Next track" title="Next track">${PLAYER_ICONS.next}</button>
                    <button type="button" class="local-player-icon local-player-mode" data-player-action="repeat" aria-label="Repeat: off" aria-pressed="false" title="Repeat: off">${PLAYER_ICONS.repeat}<span class="local-player-badge" aria-hidden="true" hidden>1</span></button>
                    <button type="button" class="local-player-icon local-player-mode" data-player-action="queue" aria-label="Queue" aria-expanded="false" title="Queue">${PLAYER_ICONS.queue}</button>
                </div>
                <div class="local-player-secondary">
                    <span class="local-player-time"><span data-player-current>0:00</span> / <span data-player-duration>0:00</span></span>
                    <label class="local-player-volume" title="Volume">
                        <input data-player-volume type="range" min="0" max="1" step="0.01" aria-label="Volume">
                    </label>
                </div>
            </section>`;

        const on = (action, fn) => this.host.querySelector(`[data-player-action="${action}"]`)?.addEventListener('click', fn);
        on('toggle', () => this.toggle());
        on('previous', () => this.previous());
        on('next', () => this.next());
        on('shuffle', () => this.toggleShuffle());
        on('repeat', () => this.cycleRepeat());
        on('queue', () => this.onQueueButton?.());
        on('stash', () => this._toggleStash());
        if (this.marks) this.host.querySelectorAll('[data-player-mark]').forEach((btn) => btn.addEventListener('click', () => this._toggleMark(btn.dataset.playerMark)));
        on('visualize', () => this.visualize?.());
        this.host.querySelector('[data-player-seek]')?.addEventListener('input', (event) => {
            const duration = this.audio.duration;
            if (Number.isFinite(duration) && duration > 0) {
                this.audio.currentTime = (Number(event.currentTarget.value) / 1000) * duration;
            }
        });
        this.host.querySelector('[data-player-volume]')?.addEventListener('input', (event) => {
            this.audio.volume = Number(event.currentTarget.value);
            try { localStorage.setItem('umm.playerVolume', String(this.audio.volume)); } catch (_) {}
        });
        this.host.querySelector('.local-player-art')?.addEventListener('error', (event) => {
            event.currentTarget.hidden = true;
            this._failedArtUrl = event.currentTarget.getAttribute('src') || '';
        });
        this._offEntityLinks = this.app ? wireEntityLinks(this.host, this.app) : () => {};
    }

    // Both the active element and the preload spare are wired once; events from
    // whichever is not active right now are ignored.
    _wireAudio(el) {
        const active = (fn) => (event) => { if (el === this.audio) fn(event); };
        for (const eventName of ['play', 'playing', 'pause', 'loadedmetadata', 'durationchange', 'timeupdate', 'volumechange', 'ratechange', 'canplay', 'seeked']) {
            el.addEventListener(eventName, active(() => {
                if (eventName === 'canplay') { this.error = ''; this._failStreak = 0; }
                if (eventName === 'loadedmetadata' && this._pendingSeek) {
                    el.currentTime = this._pendingSeek;
                    this._pendingSeek = 0;
                }
                if (eventName === 'play') {
                    this._recordHistory((h) => h.begin({ trackId: this._loadedTrackId, source: this._historySource() }));
                    this._wantPlay = true;
                    this._remoteTabId = null;
                    this.channel?.postMessage({ type: 'playing', tabId: this.tabId });
                }
                if (eventName === 'pause') this.channel?.postMessage({ type: 'paused', tabId: this.tabId });
                if (eventName === 'pause' || eventName === 'seeked') this._savePosition();
                if (eventName === 'timeupdate') {
                    this._recordHistory((h) => h.progress({ positionSec: el.currentTime, durationSec: el.duration, playing: this.isPlaying }));
                    this._onProgress();
                }
                // 'playing' follows a stall after a seek; without it macOS Now Playing
                // keeps the frozen position from the seek and its bar stops moving.
                if (['play', 'playing', 'pause', 'loadedmetadata', 'seeked', 'ratechange'].includes(eventName)) this._syncMediaPosition();
                this._render();
            }));
        }
        el.addEventListener('waiting', active(() => {
            this.error = 'Loading audio…';
            this._render();
        }));
        el.addEventListener('error', active(() => {
            this.error = 'Playback unavailable';
            this._render();
            this._explainLoadFailure();
        }));
        el.addEventListener('seeking', active(() => this._recordHistory((h) => h.seek(el.currentTime))));
        el.addEventListener('ended', active(() => {
            this._recordHistory((h) => h.leave({ ended: true }));
            this._advance('ended');
        }));
    }

    _wireChannel() {
        if (!this.channel) return;
        this.channel.onmessage = ({ data } = {}) => {
            if (!data || data.tabId === this.tabId) return;
            if (data.type === 'playing') {
                this._remoteTabId = data.tabId;
                if (this.isPlaying) {
                    this._wantPlay = false;
                    this.audio.pause();
                }
                this._render();
            } else if (data.type === 'paused') {
                if (data.tabId !== this._remoteTabId) return;
                this._remoteTabId = null;
                this._render();
            } else if (data.type === 'queue' && data.revision > this._revision && !this._pendingOps.length && !this._saving) {
                this._reloadFromServer();
            }
        };
    }

    _wireMediaSession() {
        const session = this.mediaSession;
        if (!session?.setActionHandler) return;
        const handlers = {
            play: () => { if (!this.isPlaying) this.toggle(); },
            pause: () => this.audio.pause(),
            previoustrack: () => this.previous(),
            nexttrack: () => this.next(),
            seekto: (details) => {
                if (!Number.isFinite(details?.seekTime)) return;
                if (details.fastSeek && typeof this.audio.fastSeek === 'function') this.audio.fastSeek(details.seekTime);
                else this.audio.currentTime = details.seekTime;
                this._syncMediaPosition();
            },
            seekbackward: (details) => {
                this.audio.currentTime = Math.max(0, this.audio.currentTime - (details?.seekOffset || 10));
                this._syncMediaPosition();
            },
            seekforward: (details) => {
                const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : Infinity;
                this.audio.currentTime = Math.min(duration, this.audio.currentTime + (details?.seekOffset || 10));
                this._syncMediaPosition();
            },
        };
        // iOS shows either ±seek or next/previous on the lock screen, and seek
        // when both are registered; leaving the seek pair out shows next/previous.
        if (this.ios) {
            delete handlers.seekbackward;
            delete handlers.seekforward;
        }
        for (const [action, handler] of Object.entries(handlers)) {
            try { session.setActionHandler(action, handler); } catch (_) { /* unsupported action */ }
        }
    }

    _syncMediaPosition() {
        const session = this.mediaSession;
        if (!session) return;
        session.playbackState = this.queue.current ? (this.isPlaying ? 'playing' : 'paused') : 'none';
        const duration = this.audio.duration;
        if (!session.setPositionState || !Number.isFinite(duration) || duration <= 0) return;
        try {
            session.setPositionState({
                duration, playbackRate: this.audio.playbackRate || 1,
                position: Math.min(duration, Math.max(0, this.audio.currentTime || 0)),
            });
        } catch (_) { /* inconsistent state mid-load */ }
    }

    _syncMediaMetadata(track) {
        const session = this.mediaSession;
        if (!session || typeof globalThis.MediaMetadata !== 'function') return;
        session.metadata = track ? new globalThis.MediaMetadata({
            title: track.title || '', artist: track.artist || '', album: track.album || '',
            artwork: hasCoverArt(track) ? [{ src: coverArtUrl(track) }] : [],
        }) : null;
    }

    // ---- Queue state -----------------------------------------------------------

    /** Subscribe to queue changes (the queue panel). Returns an unsubscribe. */
    subscribe(fn) {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    remember(tracks) {
        for (const track of tracks || []) if (track?.id) this._knownTracks.set(String(track.id), track);
    }

    trackFor(trackId) {
        return this._knownTracks.get(String(trackId)) || this.resolveTrack(String(trackId)) || null;
    }

    get currentTrack() {
        return this.queue.current ? this.trackFor(this.queue.current.trackId) : null;
    }

    get contextKey() {
        return this.queue.context?.key || null;
    }

    _commit(op, { autoplay = false } = {}) {
        const next = op(this.queue);
        if (next === this.queue) return false;
        this.queue = next;
        this._pendingOps.push(op);
        this._sync({ autoplay });
        if (!this._saving) this._flushPromise = this._flush();
        return true;
    }

    // Bring the audio element in line with `queue.current`, then repaint.
    _sync({ autoplay = false, positionSec = 0 } = {}) {
        const current = this.queue.current;
        if ((current?.entryId || null) !== this._loadedEntryId) this._load(current, { autoplay, positionSec });
        else if (autoplay && current && !this.isPlaying) this._attemptPlay('Press play to start');
        this.host.hidden = !current || this.queue.closed;
        this._render();
        for (const fn of this._listeners) {
            try { fn(this.queue); } catch (err) { console.error('[player] queue listener', err); }
        }
    }

    _load(entry, { autoplay, positionSec = 0 }) {
        clearTimeout(this._skipTimer);
        this._recordHistory((h) => h.leave()); // next, previous, another track: a skip if under 30 s
        this._loadedEntryId = entry?.entryId || null;
        this._loadedTrackId = entry?.trackId || null;
        this._lastPositionSave = Date.now();
        this._wantPlay = Boolean(autoplay && entry);
        this.error = '';
        if (!entry) {
            this.audio.pause();
            this.audio.removeAttribute('src');
            this.audio.load();
            return;
        }
        const track = this.trackFor(entry.trackId);
        if (!isLocalPlayable(track)) {
            this.audio.pause();
            this.error = 'Track not in library';
            if (this._wantPlay) this._skipAfterFailure();
            return;
        }
        const url = buildLocalAudioUrl(track);
        if (autoplay && this._spare && this._spareUrl === url) {
            const previous = this.audio;
            this.audio = this._spare;
            this._spare = previous;
            this.audio.volume = previous.volume;
            previous.pause();
        } else {
            this.audio.pause();
            this.audio.src = url;
            this.audio.load();
        }
        this._spareUrl = '';
        this._pendingSeek = positionSec > 0 ? positionSec : 0;
        if (this._pendingSeek) this.audio.currentTime = this._pendingSeek;
        this._syncMediaMetadata(track);
        if (autoplay) this._attemptPlay('Press play to start');
    }

    // ---- Play history ------------------------------------------------------------

    // History must never get in the way of playback.
    _recordHistory(fn) {
        if (!this.history) return;
        try { fn(this.history); } catch (err) { console.warn('[player] play history', err?.message || err); }
    }

    _historySource() {
        if (this.queue.current?.source === 'upNext') return 'Up next';
        return String(this.queue.context?.label || '');
    }

    // ---- Persistence -----------------------------------------------------------

    _fromServer(raw) {
        const { queue, error } = Q.parseQueue(raw);
        if (error) console.warn('[player] saved queue ignored:', error);
        return { ...queue, revision: Number(raw?.revision) || 0 };
    }

    _livePosition() {
        const t = this.audio.currentTime;
        return this._loadedEntryId && Number.isFinite(t) && t > 0 ? t : 0;
    }

    // Saves are serialized. A 409 re-applies the unsaved operations to the
    // server copy and retries once; a second 409 adopts the server copy.
    async _flush() {
        if (!this.store || this._saving) return;
        this._saving = true;
        try {
            while (this._pendingOps.length) {
                const ops = this._pendingOps.splice(0);
                let result;
                try {
                    result = await this.store.save({ ...this.queue, positionSec: this._livePosition() }, this._revision);
                    if (result.status === 409) {
                        const rebaseOps = [...ops, ...this._pendingOps.splice(0)];
                        const server = this._fromServer(result.queue);
                        this._adopt(rebaseOps.reduce((state, op) => op(state), server), { keepPlaying: true });
                        result = await this.store.save({ ...this.queue, positionSec: this._livePosition() }, server.revision);
                        if (result.status === 409) {
                            this._adopt(this._fromServer(result.queue), { keepPlaying: true });
                            this.saveError = 'Queue changed elsewhere';
                            this._render();
                            continue;
                        }
                    }
                } catch (err) {
                    console.warn('[player] queue save failed:', err?.message || err);
                    this._pendingOps.unshift(...ops);
                    this.saveError = 'Queue not saved';
                    this._render();
                    return;
                }
                this._revision = result.queue.revision;
                this.queue = { ...this.queue, revision: this._revision, updatedAt: result.queue.updatedAt };
                this.saveError = '';
                this.channel?.postMessage({ type: 'queue', tabId: this.tabId, revision: this._revision });
                this._render();
            }
        } finally {
            this._saving = false;
        }
    }

    // keepPlaying: a rebase may mint new entry ids; if the same track is still
    // current, keep the loaded audio instead of reloading it.
    _adopt(queue, { keepPlaying = false } = {}) {
        this.queue = queue;
        this._revision = queue.revision || 0;
        const current = queue.current;
        if (keepPlaying && current && current.entryId !== this._loadedEntryId && current.trackId === this._loadedTrackId) {
            this._loadedEntryId = current.entryId;
        }
        this._sync({ autoplay: false, positionSec: queue.positionSec });
    }

    async _reloadFromServer() {
        try {
            const queue = this._fromServer(await this.store.load());
            if (!this._pendingOps.length && queue.revision > this._revision) this._adopt(queue, { keepPlaying: true });
        } catch (err) {
            console.warn('[player] queue reload failed:', err?.message || err);
        }
    }

    /**
     * Boot: load the saved queue and show the dock paused at the saved track and
     * position — never play. `knownIds` (from a complete, successful collection
     * load only) prunes tracks that left the library.
     */
    async restore({ knownIds = null, resume = false } = {}) {
        if (!this.store) return;
        let saved;
        try {
            saved = this._fromServer(await this.store.load());
        } catch (err) {
            console.warn('[player] queue load failed:', err?.message || err);
            return;
        }
        // Something was played before the saved queue arrived: the next save's
        // 409 rebases that onto the server copy instead.
        if (!this._pendingOps.length && !this.queue.current) this._adopt(saved);
        else if (!this._pendingOps.length) this._revision = saved.revision;
        if (knownIds) {
            const { removed } = Q.pruneMissing(this.queue, knownIds);
            if (removed) {
                this._commit((state) => Q.pruneMissing(state, knownIds).queue);
                this.notify(`${removed} queued ${removed === 1 ? 'track is' : 'tracks are'} no longer in the library`);
            }
        }
        if (resume && this.queue.current && !this.queue.closed) this._attemptPlay('Press play to continue');
    }

    _savePosition({ beacon = false } = {}) {
        const entryId = this.queue.current?.entryId;
        if (!this.store || !entryId || entryId !== this._loadedEntryId || this._pendingOps.length) return;
        const positionSec = this._livePosition();
        this._lastPositionSave = Date.now();
        if (beacon) { this.store.beaconPosition?.(entryId, positionSec); return; }
        this.store.savePosition(entryId, positionSec).catch((err) => console.warn('[player] position save failed:', err?.message || err));
    }

    handoffPosition() {
        const entryId = this.queue.current?.entryId;
        if (entryId && entryId === this._loadedEntryId) {
            return { entryId, positionSec: this._pendingSeek || this._livePosition() };
        }
        return {};
    }

    pauseForHandoff() {
        const snapshot = { ...this.handoffPosition(), playing: this.isPlaying };
        this._wantPlay = false;
        this.audio.pause();
        return snapshot;
    }

    async finishHandoff() {
        await this._flushPromise;
        if (this._pendingOps.length) await this._flush();
    }

    /** pagehide: send the playhead even though the page is unloading. */
    flushPosition() {
        this._savePosition({ beacon: true });
    }

    /** For pagehide: a closing tab stops playing without a pause event. */
    leave() {
        if (this.isPlaying) this.channel?.postMessage({ type: 'paused', tabId: this.tabId });
    }

    _onProgress() {
        if (!this.isPlaying || !sessionCanPlay()) return;
        sessionPlaybackProgress();
        if (Date.now() - this._lastPositionSave >= POSITION_SAVE_MS) this._savePosition();
        const remaining = this.audio.duration - this.audio.currentTime;
        if (Number.isFinite(remaining) && remaining <= PRELOAD_LEAD_SEC) this._preloadNext();
    }

    // Warm a hidden second element with the next entry so `ended` can swap to it.
    _preloadNext() {
        if (this._spareUrl || this.queue.repeat === 'one' || !Q.hasNext(this.queue)) return;
        const peek = Q.next(this.queue, { reason: 'user', rng: this.rng, skip: this.skip }).current;
        if (peek?.entryId === this.queue.current?.entryId) return;
        const track = peek && this.trackFor(peek.trackId);
        if (!isLocalPlayable(track)) return;
        if (!this._spare) {
            this._spare = this._createAudio();
            if (!this._spare) { this._spareUrl = 'unavailable'; return; }
            this._wireAudio(this._spare);
        }
        this._spareUrl = buildLocalAudioUrl(track);
        this._spare.preload = 'auto';
        this._spare.src = this._spareUrl;
        this._spare.load();
    }

    // ---- Transport ---------------------------------------------------------------

    /**
     * Start playing from a list. Same context key: jump within it and keep Up
     * next. Otherwise replace the context; `clearUpNext` comes from the prompt.
     */
    playFromList(track, { tracks = [], context = {}, clearUpNext = false, shuffle = null } = {}) {
        if (track && !isLocalPlayable(track)) return false;
        const list = playableQueue(tracks.length ? tracks : (track ? [track] : []));
        if (track && !list.some((t) => String(t.id) === String(track.id))) list.unshift(track);
        if (!list.length) return false;
        this.remember(list);
        const trackIds = list.map((t) => String(t.id));
        const startTrackId = track ? String(track.id) : null;
        const rng = this.rng;
        const key = String(context.key || context.kind || 'selection');
        const op = shuffle === null && this.queue.context?.key === key
            ? (state) => (state.context?.key === key
                ? Q.jumpInContext(state, { trackIds, trackId: startTrackId, rng })
                : Q.startContext(state, { context: { ...context, key, trackIds }, startTrackId, rng }))
            : (state) => {
                const shuffled = shuffle === null ? state.shuffle : shuffle;
                return Q.startContext(state, {
                    context: { ...context, key, trackIds }, startTrackId: shuffled && shuffle ? null : startTrackId,
                    shuffle: shuffled, clearUpNext, rng,
                });
            };
        this._failStreak = 0;
        return this._commit(op, { autoplay: true }) || true;
    }

    /** Compatibility path used by table play buttons: toggle the loaded track, else play from the list. */
    toggleTrack(track, { queue, context } = {}) {
        if (!isLocalPlayable(track)) return false;
        if (this.isCurrent(track.id)) return this.toggle();
        return this.playFromList(track, { tracks: queue || [track], context });
    }

    /** Play a single track as its own context. */
    playTrack(track) {
        if (!isLocalPlayable(track)) return false;
        return this.playFromList(track, {
            tracks: [track], context: { key: `track:${track.id}`, kind: 'track', label: track.title || 'Track' },
        });
    }

    _enqueue(tracks, opName) {
        const all = tracks || [];
        const playable = all.filter(isLocalPlayable);
        if (!playable.length) return { added: 0, skipped: all.length };
        this.remember(playable);
        const ids = playable.map((t) => String(t.id));
        const idle = !this.queue.current;
        this._commit((state) => Q[opName](state, ids), { autoplay: idle });
        return { added: playable.length, skipped: all.length - playable.length };
    }

    playNext(tracks) { return this._enqueue(tracks, 'playNext'); }
    addToQueue(tracks) { return this._enqueue(tracks, 'addToQueue'); }
    removeEntry(entryId) { return this._commit((s) => Q.removeEntry(s, entryId)); }
    moveEntry(from, to) { return this._commit((s) => Q.moveEntry(s, from, to)); }
    moveToFront(entryId) { return this._commit((s) => Q.moveToFront(s, entryId)); }
    clearUpNext() { return this._commit((s) => Q.clearUpNext(s)); }
    removeEntries(entryIds) { return this._commit((s) => Q.removeEntries(s, entryIds)); }
    moveEntries(entryIds, toIndex) { return this._commit((s) => Q.moveEntries(s, entryIds, toIndex)); }
    moveEntriesToFront(entryIds) { return this._commit((s) => Q.moveEntriesToFront(s, entryIds)); }
    restoreUpNext(previousUpNext) { return this._commit((s) => Q.restoreUpNext(s, previousUpNext)); }
    jumpToUpNext(entryId) { return this._commit((s) => Q.jumpToUpNext(s, entryId), { autoplay: true }); }
    jumpToContextPosition(position) { return this._commit((s) => Q.jumpToContextPosition(s, position), { autoplay: true }); }

    toggleShuffle() {
        const on = !this.queue.shuffle;
        const rng = this.rng;
        this._spareUrl = '';
        return this._commit((s) => Q.setShuffle(s, on, rng));
    }

    cycleRepeat() {
        this._spareUrl = '';
        return this._commit((s) => Q.cycleRepeat(s));
    }

    // play() rejects for two unrelated reasons: the browser blocked autoplay
    // (NotAllowedError — the user just needs to press play) or the source
    // failed to load (NotSupportedError — the `error` event already explained
    // it). Only the first deserves an invitation to press play.
    _attemptPlay(blockedMessage) {
        if (!sessionCanPlay()) return;
        this._wantPlay = true;
        const pending = this.audio.play();
        if (!pending?.catch) return;
        pending.catch((reason) => {
            if (reason?.name === 'NotAllowedError') this._wantPlay = false;
            this.error = reason?.name === 'NotAllowedError'
                ? blockedMessage
                : (this.error || 'Playback unavailable');
            this._render();
        });
    }

    // After a failed load the element reports `paused === false` but can never
    // play, so `toggle()` would silently call pause(). Probe the stream URL for
    // its status so the dock can say *why* the file did not play. Only a real
    // 403/404/415 is a finding about the file and skips to the next entry; an
    // unreachable server is a tool failure and never skips.
    async _explainLoadFailure() {
        const entryId = this._loadedEntryId;
        const url = this.audio.src;
        if (!entryId || !url) return;
        let status = 0;
        try {
            status = (await this.fetchImpl(url, { headers: { Range: 'bytes=0-0' } }))?.status || 0;
        } catch (_) {
            return;
        }
        if (this._loadedEntryId !== entryId || !this.audio.error) return;
        this.error = LOAD_FAILURES[status] || 'Playback unavailable';
        this._render();
        if (LOAD_FAILURES[status] && this._wantPlay) this._skipAfterFailure();
    }

    _skipAfterFailure() {
        this._failStreak += 1;
        if (this._failStreak >= FAILURE_STOP) {
            this._failStreak = 0;
            this._wantPlay = false;
            this.error = `Playback stopped — ${FAILURE_STOP} files unavailable`;
            this._render();
            return;
        }
        const entryId = this._loadedEntryId;
        clearTimeout(this._skipTimer);
        this._skipTimer = this._setTimeout(() => {
            if (this._loadedEntryId === entryId) this._advance('error');
        }, SKIP_DELAY_MS);
    }

    toggle() {
        const current = this.queue.current;
        if (!current) return false;
        if (this.queue.closed) this._commit((s) => Q.setClosed(s, false));
        if (this.audio.error || current.entryId !== this._loadedEntryId || !this.audio.src) {
            const positionSec = this._livePosition();
            this._loadedEntryId = null;
            this._sync({ autoplay: true, positionSec });
            return true;
        }
        if (this.audio.paused) {
            this._attemptPlay('Playback unavailable');
        } else {
            this._wantPlay = false;
            this.audio.pause();
        }
        return true;
    }

    // Whether Next would move to another entry, skipped tracks passed over.
    // The probe's order is thrown away, so a fixed rng keeps `this.rng` untouched.
    _canAdvance() {
        if (!Q.hasNext(this.queue)) return false;
        const probe = Q.next(this.queue, { reason: 'user', rng: () => 0, skip: this.skip });
        return probe.current?.entryId !== this.queue.current?.entryId;
    }

    // `reason`: 'user' (Next), 'ended' or 'error'. Returns whether it moved.
    // With nothing left, `stopAtEnd` pauses at 0:00 (Next itself leaves it playing).
    _advance(reason, { stopAtEnd = reason !== 'user' } = {}) {
        if (!this.queue.current) return false;
        if (reason === 'ended' && this.queue.repeat === 'one') {
            this.audio.currentTime = 0;
            this._attemptPlay('Press play to start');
            return true;
        }
        if (!this._canAdvance()) {
            if (stopAtEnd) {
                this._wantPlay = false;
                this.audio.pause();
                this.audio.currentTime = 0;
                this._render();
            }
            return false;
        }
        const { rng, skip } = this;
        return this._commit((s) => Q.next(s, { reason, rng, skip }), { autoplay: true });
    }

    previous() {
        if (!this.queue.current) return false;
        if (this.audio.currentTime > Q.RESTART_THRESHOLD_SEC || !this.queue.history.length) {
            this.audio.currentTime = 0;
            this._render();
            return true;
        }
        return this._commit((s) => Q.previous(s, { positionSec: 0 }), { autoplay: true });
    }

    /** Next. `stopAtEnd`: with nothing left, stop instead (the playing track was stashed). */
    next({ stopAtEnd = false } = {}) {
        return this._advance('user', { stopAtEnd });
    }

    /** Stop: pause and hide the dock. The queue is kept. */
    stop() {
        this._recordHistory((h) => h.leave());
        this._wantPlay = false;
        this.audio.pause();
        this._commit((s) => Q.setClosed(s, true));
        this.host.hidden = true;
        this._render();
    }

    /** ⌘K "Show player". */
    show() {
        if (!this.queue.current) return false;
        this._commit((s) => Q.setClosed(s, false));
        this.host.hidden = false;
        return true;
    }

    /** Kept for callers of the old API: × used to clear everything; now it stops. */
    close() {
        this.stop();
    }

    /** The current track's row as the app has it now (a write replaces Comments there). */
    _liveCurrent() {
        const track = this.currentTrack;
        return track ? this.resolveTrack(String(track.id)) || track : null;
    }

    async _toggleStash() {
        const track = this._liveCurrent();
        if (!track || !this.stash) return;
        try { await this.stash([String(track.id)], !isStashedTrack(track)); } finally { this._render(); }
    }

    /** ☆ or ♡ on the playing track. */
    async _toggleMark(collection) {
        const track = this._liveCurrent();
        if (!track || !this.marks) return;
        try { await this.marks.toggle(collection, 'track', String(track.id)); }
        catch (err) { this.app?.showNotification?.(`Favorite not saved: ${err?.message || err}`, 'error'); }
        finally { this.refreshMarks(); }
    }

    /** Paint ☆ and ♡ for the playing track (a mark given elsewhere calls this too). */
    refreshMarks(track = this.currentTrack) {
        if (!this.marks) return;
        const live = track && (this.resolveTrack(String(track.id)) || track);
        const pair = pairOf(this.marks.collections);
        this.host.querySelectorAll('[data-player-mark]').forEach((btn) => {
            btn.hidden = !live;
            if (btn.hidden) return;
            const c = pair.find((x) => x.id === btn.dataset.playerMark);
            paintMark(btn, c, this.marks.has(c.id, 'track', String(live.id)));
        });
    }

    _renderStash(track) {
        const btn = this.host.querySelector('[data-player-action="stash"]');
        if (!btn) return;
        const live = track && (this.resolveTrack(String(track.id)) || track);
        btn.hidden = !(this.stash && live && isLocalPlayable(live));
        const on = !btn.hidden && isStashedTrack(live);
        if (btn.dataset.on === String(on)) return;
        btn.dataset.on = String(on);
        btn.innerHTML = stashIconHtml(on);
        btn.setAttribute('aria-pressed', String(on));
        btn.setAttribute('aria-label', on ? 'Unstash' : 'Stash');
        btn.title = on ? 'Unstash' : 'Stash';
    }

    /** The visualizer's wave: shown while a local track is loaded, never under reduced motion (it is all motion). */
    _renderVisualize(track) {
        const btn = this.host.querySelector('[data-player-action="visualize"]');
        if (!btn) return;
        const reduced = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
        const live = track && (this.resolveTrack(String(track.id)) || track);
        btn.hidden = !(this.visualize && !reduced && live && isLocalPlayable(live));
    }

    isCurrent(trackId) {
        return !!this.queue.current && String(this.queue.current.trackId) === String(trackId);
    }

    get isPlaying() {
        return !!this.queue.current && !this.audio.paused && !this.audio.ended && !this.audio.error;
    }

    _render() {
        const track = this.currentTrack;
        const playing = this.isPlaying;
        const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
        const current = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0;

        this.host.dataset.state = playing ? 'playing' : 'paused';
        const title = this.host.querySelector('.local-player-title');
        const artist = this.host.querySelector('.local-player-artist');
        const album = this.host.querySelector('.local-player-album');
        const status = this.host.querySelector('.local-player-status');
        const identityKey = JSON.stringify([track?.id || '', track?.title || '', track?.artist || '', track?.album || '']);
        if (identityKey !== this._renderedIdentityKey) {
            const identity = playerIdentityHtml(track);
            if (title) title.innerHTML = identity.title;
            if (artist) artist.innerHTML = identity.artist;
            if (album) {
                album.innerHTML = identity.album;
                album.hidden = !identity.album;
            }
            this._renderedIdentityKey = identityKey;
            this._syncMediaMetadata(track);
        }
        const elsewhere = this._remoteTabId && !playing ? 'Playing in another tab' : '';
        if (status) status.textContent = elsewhere || this.error || this.saveError;

        const art = this.host.querySelector('.local-player-art');
        if (art) {
            const nextArt = track && hasCoverArt(track) ? coverArtUrl(track) : '';
            if (nextArt && nextArt !== this._failedArtUrl) {
                art.hidden = false;
                if (art.getAttribute('src') !== nextArt) art.src = nextArt;
            } else if (nextArt) {
                // Art already 404'd for this track — keep the placeholder.
                art.hidden = true;
            } else {
                art.hidden = true;
                art.removeAttribute('src');
            }
        }

        const toggle = this.host.querySelector('[data-player-action="toggle"]');
        if (toggle) {
            toggle.querySelector('span').innerHTML = playGlyphHtml(playing);
            toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
            toggle.setAttribute('aria-pressed', playing ? 'true' : 'false');
            toggle.title = playing ? 'Pause' : 'Play';
        }
        this.refreshMarks(track);
        this._renderStash(track);
        this._renderVisualize(track);
        const previous = this.host.querySelector('[data-player-action="previous"]');
        const next = this.host.querySelector('[data-player-action="next"]');
        if (previous) previous.disabled = !track;
        if (next) next.disabled = !Q.hasNext(this.queue);
        const shuffle = this.host.querySelector('[data-player-action="shuffle"]');
        if (shuffle) shuffle.setAttribute('aria-pressed', this.queue.shuffle ? 'true' : 'false');
        const repeat = this.host.querySelector('[data-player-action="repeat"]');
        if (repeat) {
            const label = REPEAT_LABELS[this.queue.repeat] || REPEAT_LABELS.off;
            repeat.setAttribute('aria-pressed', this.queue.repeat === 'off' ? 'false' : 'true');
            repeat.setAttribute('aria-label', label);
            repeat.title = label;
            const badge = repeat.querySelector('.local-player-badge');
            if (badge) badge.hidden = this.queue.repeat !== 'one';
        }

        const seek = this.host.querySelector('[data-player-seek]');
        if (seek) {
            seek.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : '0';
            seek.disabled = duration <= 0;
            seek.style.setProperty('--player-progress', `${duration > 0 ? (current / duration) * 100 : 0}%`);
        }
        const currentEl = this.host.querySelector('[data-player-current]');
        const durationEl = this.host.querySelector('[data-player-duration]');
        if (currentEl) currentEl.textContent = formatPlayerTime(current);
        if (durationEl) durationEl.textContent = formatPlayerTime(duration);
        const volume = this.host.querySelector('[data-player-volume]');
        if (volume) {
            if (document.activeElement !== volume) volume.value = String(this.audio.volume);
            volume.style.setProperty('--player-progress', `${this.audio.volume * 100}%`);
        }

        // Progress ticks (timeupdate) and buffering stalls reach here several
        // times a second, but subscribers repaint every table row's play
        // control on each call — notify only when track or playing changed.
        // A failed load flips `playing` via audio.error, so it is covered.
        const stateKey = `${track?.id ?? ''}|${playing ? 1 : 0}`;
        if (stateKey !== this._notifiedStateKey) {
            this._notifiedStateKey = stateKey;
            this.onStateChange({ track, playing, error: this.error });
        }
    }
}
