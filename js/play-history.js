// Play history: decides when a track start becomes a `play` or a `skip`, and
// appends that event through POST /api/playback/events (server/routes/playback.js).
// Spec: docs/specs/2026-10-29-play-history-design.md, Play history and added dates.
//
// Event record: { id, trackId, kind: 'play' | 'skip', at, durationSec, positionSec, source }
//   at          epoch milliseconds when the event was decided
//   durationSec the track's length from the audio element, or null when unknown
//   positionSec the playhead when the event was decided
//   source      the list the track was played from ("Collection", a gig playlist, "Up next")
//
// Rules (decisions D4 and D7; keep them in the constants below):
//   - A candidate starts when a track starts playing; resuming after a pause keeps it.
//   - 30 seconds of actual playback writes one `play`. Seeks do not count as playback,
//     and only one `play` is written per start however often the user seeks back.
//   - Leaving the track before that (next, previous, another track, stop) writes a
//     `skip` if at least 1 second played. A track that ends on its own before 30
//     seconds is neither.
//
// Never touches track tags, `play_count`, audio files or Rekordbox data. Playback is
// never blocked: a failed write is retried once on the next event, then dropped with
// one console warning.

import { sessionHeaders } from './collection-session.js';

export const PLAY_THRESHOLD_SEC = 30;
export const SKIP_MIN_SEC = 1;
// D7: rows stay until the user presses Clear play history. This is the only policy
// built; a time window would need its own pruning job, which does not exist.
export const PLAY_HISTORY_RETENTION = 'until-cleared';
export const SOURCE_MAX_CHARS = 120;
export const PLAY_EVENT_KINDS = Object.freeze(['play', 'skip']);
// timeupdate fires every 0.25 s or so; a larger jump between samples is a seek.
export const MAX_TICK_SEC = 2;
const TRACK_ID_MAX_CHARS = 512;
const EVENT_ID_MAX_CHARS = 128;

const capSource = (source) => Array.from(String(source ?? '')).slice(0, SOURCE_MAX_CHARS).join('');
const finiteOrNull = (value) => (Number.isFinite(value) && value >= 0 ? value : null);
const round = (value) => Math.round(value * 1000) / 1000;

export function startCandidate({ trackId, source = '', positionSec = null } = {}) {
    return {
        trackId: String(trackId),
        source: capSource(source),
        playedSec: 0,
        lastPositionSec: finiteOrNull(positionSec),
        durationSec: null,
        recorded: false,
    };
}

function eventFrom(candidate, kind, at) {
    return {
        trackId: candidate.trackId,
        kind,
        at,
        durationSec: candidate.durationSec === null ? null : round(candidate.durationSec),
        positionSec: round(candidate.lastPositionSec ?? 0),
        source: candidate.source,
    };
}

/** One progress sample. Returns the next candidate and the `play` event, if this sample crossed the threshold. */
export function advanceCandidate(candidate, { positionSec, durationSec, playing, at = Date.now() } = {}) {
    if (!candidate) return { candidate: null, event: null };
    const position = finiteOrNull(positionSec);
    const next = { ...candidate, durationSec: finiteOrNull(durationSec) ?? candidate.durationSec };
    if (position === null) return { candidate: next, event: null };
    const delta = candidate.lastPositionSec === null ? 0 : position - candidate.lastPositionSec;
    if (playing && delta > 0 && delta <= MAX_TICK_SEC) next.playedSec = candidate.playedSec + delta;
    next.lastPositionSec = position;
    if (!next.recorded && next.playedSec >= PLAY_THRESHOLD_SEC) {
        next.recorded = true;
        return { candidate: next, event: eventFrom(next, 'play', at) };
    }
    return { candidate: next, event: null };
}

/** The playhead moved without playing through: the next sample measures from here. */
export function seekCandidate(candidate, positionSec) {
    return candidate ? { ...candidate, lastPositionSec: finiteOrNull(positionSec) } : null;
}

/** The track is being left. Returns a `skip` event or null. `ended`: it finished on its own. */
export function leaveCandidate(candidate, { at = Date.now(), ended = false } = {}) {
    if (!candidate || candidate.recorded || ended || candidate.playedSec < SKIP_MIN_SEC) return null;
    return eventFrom(candidate, 'skip', at);
}

const isNonNegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Shared with the server route. Returns an error string, or null when the body is a valid event. */
export function validatePlayEvent(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return 'event must be an object';
    if (body.id !== undefined && (typeof body.id !== 'string' || !body.id || body.id.length > EVENT_ID_MAX_CHARS)) {
        return `id must be a non-empty string of at most ${EVENT_ID_MAX_CHARS} characters`;
    }
    if (typeof body.trackId !== 'string' || !body.trackId || body.trackId.length > TRACK_ID_MAX_CHARS) {
        return 'trackId is required';
    }
    if (!PLAY_EVENT_KINDS.includes(body.kind)) return `kind must be one of ${PLAY_EVENT_KINDS.join(', ')}`;
    if (!Number.isSafeInteger(body.at) || body.at <= 0) return 'at must be epoch milliseconds';
    if (!isNonNegative(body.positionSec)) return 'positionSec must be a finite number ≥ 0';
    if (body.durationSec !== undefined && body.durationSec !== null && !isNonNegative(body.durationSec)) {
        return 'durationSec must be null or a finite number ≥ 0';
    }
    if (body.source !== undefined && typeof body.source !== 'string') return 'source must be a string';
    if (Array.from(body.source ?? '').length > SOURCE_MAX_CHARS) return `source is longer than ${SOURCE_MAX_CHARS} characters`;
    return null;
}

const defaultId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** The stored record: known fields only, defaults filled. Call after validatePlayEvent. */
export function normalizePlayEvent(body, { newId = defaultId } = {}) {
    return {
        id: body.id || newId(),
        trackId: body.trackId,
        kind: body.kind,
        at: body.at,
        durationSec: body.durationSec ?? null,
        positionSec: body.positionSec,
        source: body.source ?? '',
    };
}

/** Append one event. Rejects on a network failure or a non-2xx answer. */
export async function recordEvent(event, { fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
    const res = await fetchImpl('/api/playback/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
        body: JSON.stringify(event),
    });
    if (!res?.ok) throw new Error(`Play event not saved (${res?.status ?? 'no response'})`);
}

/** Settings › Playback › Clear play history. Resolves to the number of rows deleted. */
export async function clearPlayHistory({ fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
    const res = await fetchImpl('/api/playback/events', { method: 'DELETE', headers: sessionHeaders() });
    let body = null;
    try { body = await res.json(); } catch (_) { /* no body */ }
    if (!res.ok) throw new Error(body?.error || `Clear failed (${res.status})`);
    return Number(body?.deleted) || 0;
}

/**
 * The stateful side the player drives: begin on `play`, progress on `timeupdate`,
 * seek on `seeking`, leave when the track changes, stops or ends.
 */
export class PlayHistory {
    constructor({ fetchImpl, newId = defaultId, now = () => Date.now(), warn = (...args) => console.warn(...args) } = {}) {
        this._fetch = fetchImpl;
        this._newId = newId;
        this._now = now;
        this._warn = warn;
        this.candidate = null;
        this._pending = null; // one failed event awaiting its single retry
        this._chain = Promise.resolve();
    }

    begin({ trackId, source = '' } = {}) {
        if (this.candidate || !trackId) return;
        this.candidate = startCandidate({ trackId, source });
    }

    progress({ positionSec, durationSec, playing } = {}) {
        if (!this.candidate) return;
        const { candidate, event } = advanceCandidate(this.candidate, { positionSec, durationSec, playing, at: this._now() });
        this.candidate = candidate;
        if (event) this._record(event);
    }

    seek(positionSec) {
        this.candidate = seekCandidate(this.candidate, positionSec);
    }

    leave({ ended = false } = {}) {
        const event = leaveCandidate(this.candidate, { at: this._now(), ended });
        this.candidate = null;
        if (event) this._record(event);
    }

    /** Resolves once queued writes have settled (tests). */
    idle() {
        return this._chain;
    }

    _record(event) {
        const full = { id: this._newId(), ...event };
        this._chain = this._chain.then(() => this._write(full));
    }

    async _write(event) {
        const post = (e) => Promise.resolve().then(() => recordEvent(e, this._fetch ? { fetchImpl: this._fetch } : undefined));
        const retry = this._pending;
        this._pending = null;
        if (retry) {
            try { await post(retry); } catch (err) {
                this._warn('[play history] event dropped after one retry:', err?.message || err);
            }
        }
        try { await post(event); } catch (_) { this._pending = event; }
    }
}
