// Playback queue model: Now playing, Up next, a context snapshot and history.
// Pure — no DOM, audio or fetch. Every operation returns a new state and never
// mutates its input, so a 409 can re-apply the same operation to the server copy.

export const CONTEXT_CAP = 10000;
export const UP_NEXT_CAP = 1000;
export const HISTORY_CAP = 100;
export const RESTART_THRESHOLD_SEC = 3;
export const REPEAT_MODES = Object.freeze(['off', 'all', 'one']);
export const CONTEXT_KINDS = Object.freeze([
    'collection', 'favorites', 'shortlist', 'gig-lane', 'artist', 'label', 'tag', 'album', 'listen', 'track', 'selection',
]);
const SOURCES = ['context', 'upNext', 'history'];

const newId = () => globalThis.crypto.randomUUID();

export function emptyQueue() {
    return {
        id: 'default', revision: 0, updatedAt: 0,
        context: null, upNext: [], current: null, positionSec: 0,
        shuffle: false, repeat: 'off', closed: false, history: [],
    };
}

/** Fisher–Yates over a copy. `rng` returns [0, 1). */
export function shuffled(items, rng = Math.random) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

const identity = (n) => Array.from({ length: n }, (_, i) => i);
const trim = (list, cap) => (list.length > cap ? list.slice(list.length - cap) : list);

function contextEntry(context, cursor) {
    const contextIndex = context.order[cursor];
    return {
        entryId: newId(), trackId: context.trackIds[contextIndex],
        source: 'context', contextId: context.id, contextIndex,
    };
}

function withHistory(state, entry) {
    if (!entry) return state.history;
    const { entryId, trackId, source, contextId = null, contextIndex = null } = entry;
    return trim([...state.history, { entryId, trackId, source, contextId, contextIndex, playedAt: Date.now() }], HISTORY_CAP);
}

const isCurrentContextEntry = (state, entry) =>
    Boolean(entry && entry.source === 'context' && state.context && entry.contextId === state.context.id);

const orderPosition = (context, contextIndex) => context.order.indexOf(contextIndex);

/** Play order for a context, with `first` (an index into trackIds) leading when given. */
function buildOrder(length, { shuffle, first = null, rng }) {
    if (!shuffle) return identity(length);
    const rest = shuffled(identity(length).filter((i) => i !== first), rng);
    return first === null ? rest : [first, ...rest];
}

/**
 * Replace the context and make one of its tracks current.
 * `context`: { key, kind, label, route, trackIds }. `startTrackId` null with shuffle
 * starts at a random track. `keepContextId` keeps the id (a jump within the same list).
 */
export function startContext(state, { context, startTrackId = null, startIndex = null, shuffle = state.shuffle, clearUpNext = false, rng = Math.random, keepContextId = null } = {}) {
    let trackIds = [...(context?.trackIds || [])];
    let start = Number.isInteger(startIndex) && trackIds[startIndex] === startTrackId ? startIndex : trackIds.indexOf(startTrackId);
    if (trackIds.length > CONTEXT_CAP && shuffle) {
        // Shuffled: a random sample of the whole list (the picked track first), so no part of it is left out.
        const picked = start >= 0 ? trackIds[start] : null;
        const sample = shuffled(picked === null ? trackIds : trackIds.filter((_, i) => i !== start), rng).slice(0, CONTEXT_CAP - (picked === null ? 0 : 1));
        trackIds = picked === null ? sample : [picked, ...sample];
        start = picked === null ? -1 : 0;
    } else if (trackIds.length > CONTEXT_CAP) {
        const from = Math.max(0, start);
        trackIds = trackIds.slice(from, from + CONTEXT_CAP);
        if (start >= 0) start -= from;
    }
    if (!trackIds.length) return state;
    const order = buildOrder(trackIds.length, { shuffle, first: start >= 0 ? start : null, rng });
    const next = {
        id: keepContextId || newId(),
        key: String(context.key || context.kind || ''),
        kind: CONTEXT_KINDS.includes(context.kind) ? context.kind : 'selection',
        label: String(context.label || ''),
        route: context.route ?? null,
        trackIds, order, cursor: start >= 0 ? order.indexOf(start) : 0,
    };
    return {
        ...state,
        context: next,
        upNext: clearUpNext ? [] : state.upNext,
        current: contextEntry(next, next.cursor),
        history: withHistory(state, state.current),
        positionSec: 0, shuffle: Boolean(shuffle), closed: false,
    };
}

/** Same list, new click: take the list's current order, keep Up next and the context id. */
export function jumpInContext(state, { trackIds, trackId, startIndex = null, rng = Math.random } = {}) {
    if (!state.context) return state;
    const { key, kind, label, route } = state.context;
    return startContext(state, {
        context: { key, kind, label, route, trackIds: trackIds || state.context.trackIds },
        startTrackId: trackId, startIndex, rng, keepContextId: state.context.id,
    });
}

/** Jump to a position in the context's play order (a context row in the panel). */
export function jumpToContextPosition(state, cursor) {
    const context = state.context;
    if (!context || cursor < 0 || cursor >= context.order.length) return state;
    const nextContext = { ...context, cursor };
    return {
        ...state, context: nextContext, current: contextEntry(nextContext, cursor),
        history: withHistory(state, state.current), positionSec: 0, closed: false,
    };
}

function queueEntries(trackIds) {
    const addedAt = Date.now();
    return (trackIds || []).filter(Boolean).map((trackId) => ({ entryId: newId(), trackId: String(trackId), addedAt }));
}

function promoteIfIdle(state, upNext) {
    if (state.current || !upNext.length) return { ...state, upNext };
    const [first, ...rest] = upNext;
    return { ...state, upNext: rest, current: { ...first, source: 'upNext', contextId: null, contextIndex: null }, positionSec: 0, closed: false };
}

/** Put tracks, in the given order, at the front of Up next. */
export function playNext(state, trackIds) {
    const upNext = [...queueEntries(trackIds), ...state.upNext].slice(0, UP_NEXT_CAP);
    return promoteIfIdle(state, upNext);
}

export function addToQueue(state, trackIds) {
    const upNext = [...state.upNext, ...queueEntries(trackIds)].slice(0, UP_NEXT_CAP);
    return promoteIfIdle(state, upNext);
}

export function removeEntry(state, entryId) {
    return { ...state, upNext: state.upNext.filter((e) => e.entryId !== entryId) };
}

export function moveEntry(state, from, to) {
    const upNext = [...state.upNext];
    if (from < 0 || from >= upNext.length) return state;
    const target = Math.max(0, Math.min(upNext.length - 1, to));
    const [entry] = upNext.splice(from, 1);
    upNext.splice(target, 0, entry);
    return { ...state, upNext };
}

/** Move an Up next entry to the top. */
export function moveToFront(state, entryId) {
    const from = state.upNext.findIndex((e) => e.entryId === entryId);
    return from < 0 ? state : moveEntry(state, from, 0);
}

export function clearUpNext(state) {
    return { ...state, upNext: [] };
}

// Bulk edits take entry ids, so a 409 rebase re-applies them to the server
// copy. Ids that are not in Up next (the current track, history) are ignored.

export function removeEntries(state, entryIds) {
    const wanted = new Set(entryIds);
    const upNext = state.upNext.filter((e) => !wanted.has(e.entryId));
    return upNext.length === state.upNext.length ? state : { ...state, upNext };
}

/** Gather the selected entries, in queue order, so the block starts at `toIndex`. */
export function moveEntries(state, entryIds, toIndex) {
    const wanted = new Set(entryIds);
    const block = state.upNext.filter((e) => wanted.has(e.entryId));
    if (!block.length) return state;
    const rest = state.upNext.filter((e) => !wanted.has(e.entryId));
    const at = Math.max(0, Math.min(rest.length, toIndex));
    const upNext = [...rest.slice(0, at), ...block, ...rest.slice(at)];
    return upNext.every((e, i) => e === state.upNext[i]) ? state : { ...state, upNext };
}

export function moveEntriesToFront(state, entryIds) {
    return moveEntries(state, entryIds, 0);
}

/**
 * Undo for Remove and Clear: put entries from `previousUpNext` that are gone
 * back after the entry that preceded them. Entries that have since played
 * stay out, and later additions keep their place.
 */
export function restoreUpNext(state, previousUpNext) {
    const present = new Set([state.current?.entryId, ...state.history.map((e) => e.entryId)]);
    const upNext = [...state.upNext];
    let at = 0;
    let restored = 0;
    for (const entry of previousUpNext) {
        const i = upNext.findIndex((e) => e.entryId === entry.entryId);
        if (i >= 0) at = i + 1;
        else if (!present.has(entry.entryId)) { upNext.splice(at, 0, entry); at += 1; restored += 1; }
    }
    return restored ? { ...state, upNext: upNext.slice(0, UP_NEXT_CAP) } : state;
}

/** Play an Up next entry. The entries above it were skipped and do not go to history. */
export function jumpToUpNext(state, entryId) {
    const index = state.upNext.findIndex((e) => e.entryId === entryId);
    if (index < 0) return state;
    const entry = state.upNext[index];
    return {
        ...state, upNext: state.upNext.slice(index + 1),
        current: { entryId: entry.entryId, trackId: entry.trackId, source: 'upNext', contextId: null, contextIndex: null },
        history: withHistory(state, state.current), positionSec: 0, closed: false,
    };
}

/** Whether Next has something to play, taking repeat into account. */
export function hasNext(state) {
    if (state.upNext.length) return true;
    const context = state.context;
    if (!context || !context.order.length) return false;
    return context.cursor + 1 < context.order.length || state.repeat === 'all';
}

/**
 * Advance. `reason`: 'user' (Next button), 'ended' (track finished) or 'error'.
 * Repeat one restarts on 'ended' only. With nothing left, stays on the current
 * entry at 0:00 and sets `ended: true` on the returned state's `current`.
 * `skip(trackId)` passes over context entries (stashed tracks); Up next
 * entries were added by hand and always play. The repeat-all wrap looks
 * through the new order once.
 */
export function next(state, { reason = 'user', rng = Math.random, skip = null } = {}) {
    if (reason === 'ended' && state.repeat === 'one' && state.current) {
        return { ...state, positionSec: 0 };
    }
    const history = withHistory(state, state.current);
    if (state.upNext.length) {
        const [entry, ...rest] = state.upNext;
        return {
            ...state, upNext: rest, history, positionSec: 0,
            current: { entryId: entry.entryId, trackId: entry.trackId, source: 'upNext', contextId: null, contextIndex: null },
        };
    }
    const context = state.context;
    // The first position from `from` in `order` whose track is not skipped, or -1.
    const playable = (order, from) => {
        for (let at = from; at < order.length; at += 1) {
            if (!skip || !skip(context.trackIds[order[at]])) return at;
        }
        return -1;
    };
    const ahead = context ? playable(context.order, context.cursor + 1) : -1;
    if (ahead >= 0) {
        const nextContext = { ...context, cursor: ahead };
        return { ...state, context: nextContext, current: contextEntry(nextContext, nextContext.cursor), history, positionSec: 0 };
    }
    if (context && context.order.length && state.repeat === 'all') {
        let order = state.shuffle ? shuffled(identity(context.trackIds.length), rng) : identity(context.trackIds.length);
        const last = isCurrentContextEntry(state, state.current) ? state.current.contextIndex : null;
        if (state.shuffle && order.length > 1 && order[0] === last) {
            [order[0], order[order.length - 1]] = [order[order.length - 1], order[0]];
        }
        const first = playable(order, 0);
        if (first >= 0) {
            const nextContext = { ...context, order, cursor: first };
            return { ...state, context: nextContext, current: contextEntry(nextContext, first), history, positionSec: 0 };
        }
    }
    return { ...state, positionSec: 0 };
}

/**
 * Restart past 3 s; otherwise play the last history entry and put the current
 * entry back where it came from, so Next returns to it.
 */
export function previous(state, { positionSec = state.positionSec } = {}) {
    if (positionSec > RESTART_THRESHOLD_SEC || !state.history.length) return { ...state, positionSec: 0 };
    const last = state.history[state.history.length - 1];
    const history = state.history.slice(0, -1);
    const current = state.current;
    let upNext = state.upNext;
    let context = state.context;

    if (current && current.source === 'upNext') {
        upNext = [{ entryId: current.entryId, trackId: current.trackId, addedAt: Date.now() }, ...upNext];
    } else if (current && !isCurrentContextEntry(state, current)) {
        // From history or an old context: re-queue it so Next still returns to it.
        upNext = [{ entryId: newId(), trackId: current.trackId, addedAt: Date.now() }, ...upNext];
    } else if (current && context) {
        context = { ...context, cursor: Math.max(-1, orderPosition(context, current.contextIndex) - 1) };
    }

    let restored;
    if (last.source === 'context' && context && last.contextId === context.id && orderPosition(context, last.contextIndex) >= 0) {
        context = { ...context, cursor: orderPosition(context, last.contextIndex) };
        restored = { entryId: last.entryId, trackId: last.trackId, source: 'context', contextId: context.id, contextIndex: last.contextIndex };
    } else if (last.source === 'upNext') {
        restored = { entryId: last.entryId, trackId: last.trackId, source: 'upNext', contextId: null, contextIndex: null };
    } else {
        restored = { entryId: last.entryId, trackId: last.trackId, source: 'history', contextId: last.contextId ?? null, contextIndex: last.contextIndex ?? null };
    }
    return { ...state, upNext, context, history, current: restored, positionSec: 0 };
}

/** Shuffle reorders only the context; the current entry keeps its place at the head. */
export function setShuffle(state, on, rng = Math.random) {
    const context = state.context;
    if (!context) return { ...state, shuffle: Boolean(on) };
    const currentIndex = isCurrentContextEntry(state, state.current) ? state.current.contextIndex : null;
    if (on) {
        const order = buildOrder(context.trackIds.length, { shuffle: true, first: currentIndex, rng });
        return { ...state, shuffle: true, context: { ...context, order, cursor: currentIndex === null ? -1 : 0 } };
    }
    const anchor = currentIndex ?? (context.cursor >= 0 ? context.order[context.cursor] : -1);
    return { ...state, shuffle: false, context: { ...context, order: identity(context.trackIds.length), cursor: anchor } };
}

export function cycleRepeat(state) {
    const at = REPEAT_MODES.indexOf(state.repeat);
    return { ...state, repeat: REPEAT_MODES[(at + 1) % REPEAT_MODES.length] };
}

export function setPosition(state, positionSec) {
    return { ...state, positionSec: Number.isFinite(positionSec) && positionSec > 0 ? positionSec : 0 };
}

export function setClosed(state, closed) {
    return { ...state, closed: Boolean(closed) };
}

/**
 * Remove ids that are no longer in the library. Call only after a complete,
 * successful collection load. Returns { queue, removed }.
 */
export function pruneMissing(state, knownIds) {
    const known = knownIds instanceof Set ? knownIds : new Set(knownIds);
    let removed = 0;
    const keep = (id) => (known.has(id) ? true : (removed += 1, false));

    let context = state.context;
    let indexMap = null;
    if (context) {
        indexMap = new Map();
        const trackIds = [];
        context.trackIds.forEach((id, i) => {
            if (keep(id)) { indexMap.set(i, trackIds.length); trackIds.push(id); }
        });
        const before = context.order.slice(0, context.cursor + 1).filter((i) => indexMap.has(i)).length;
        const order = context.order.filter((i) => indexMap.has(i)).map((i) => indexMap.get(i));
        context = trackIds.length ? { ...context, trackIds, order, cursor: before - 1 } : null;
    }
    const remap = (entry) => {
        if (!entry || !state.context || entry.contextId !== state.context.id || entry.contextIndex === null) return entry;
        return indexMap.has(entry.contextIndex)
            ? { ...entry, contextIndex: indexMap.get(entry.contextIndex) }
            : { ...entry, contextId: null, contextIndex: null, source: entry.source === 'context' ? 'history' : entry.source };
    };
    const upNext = state.upNext.filter((e) => keep(e.trackId));
    const history = state.history.filter((e) => keep(e.trackId)).map(remap);
    let current = state.current;
    let positionSec = state.positionSec;
    if (current && !keep(current.trackId)) {
        current = null; positionSec = 0;
    } else {
        current = remap(current);
    }
    if (!context && current?.source === 'context') current = { ...current, source: 'history', contextId: null, contextIndex: null };
    if (!removed) return { queue: state, removed: 0 };
    return { queue: { ...state, context, upNext, history, current, positionSec }, removed };
}

/** The upcoming context entries in play order after the cursor. */
export function upcoming(state, limit = 50) {
    const context = state.context;
    if (!context) return [];
    const out = [];
    for (let pos = context.cursor + 1; pos < context.order.length && out.length < limit; pos += 1) {
        const contextIndex = context.order[pos];
        out.push({ position: pos, contextIndex, trackId: context.trackIds[contextIndex] });
    }
    return out;
}

export function upcomingCount(state) {
    const context = state.context;
    return context ? Math.max(0, context.order.length - context.cursor - 1) : 0;
}

/** Track ids of Now playing, Up next and the upcoming context, in play order. */
export function queueTrackIds(state) {
    return [
        ...(state.current ? [state.current.trackId] : []),
        ...state.upNext.map((e) => e.trackId),
        ...upcoming(state, Infinity).map((e) => e.trackId),
    ];
}

// ---- Validation -------------------------------------------------------------

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isIndex = (v) => Number.isInteger(v) && v >= 0;

function entryError(entry, label) {
    if (!entry || typeof entry !== 'object') return `${label} must be an object`;
    if (!isStr(entry.entryId) || !isStr(entry.trackId)) return `${label} needs entryId and trackId`;
    return null;
}

/** Returns an error string, or null when the queue is valid. Shared with the server. */
export function validateQueue(queue) {
    if (!queue || typeof queue !== 'object' || Array.isArray(queue)) return 'queue must be an object';
    if (!Array.isArray(queue.upNext) || !Array.isArray(queue.history)) return 'upNext and history must be arrays';
    if (queue.upNext.length > UP_NEXT_CAP) return `upNext is capped at ${UP_NEXT_CAP}`;
    if (queue.history.length > HISTORY_CAP) return `history is capped at ${HISTORY_CAP}`;
    if (!REPEAT_MODES.includes(queue.repeat)) return 'repeat must be off, all or one';
    if (typeof queue.shuffle !== 'boolean' || typeof queue.closed !== 'boolean') return 'shuffle and closed must be booleans';
    if (!Number.isFinite(queue.positionSec) || queue.positionSec < 0) return 'positionSec must be a finite number ≥ 0';
    for (const [i, e] of queue.upNext.entries()) { const err = entryError(e, `upNext[${i}]`); if (err) return err; }
    for (const [i, e] of queue.history.entries()) {
        const err = entryError(e, `history[${i}]`); if (err) return err;
        if (!SOURCES.includes(e.source)) return `history[${i}].source is invalid`;
    }
    const c = queue.context;
    if (c !== null && c !== undefined) {
        if (typeof c !== 'object' || !isStr(c.id)) return 'context needs an id';
        if (!CONTEXT_KINDS.includes(c.kind)) return 'context.kind is invalid';
        if (!Array.isArray(c.trackIds) || !c.trackIds.length || !c.trackIds.every(isStr)) return 'context.trackIds must be non-empty strings';
        if (c.trackIds.length > CONTEXT_CAP) return `context is capped at ${CONTEXT_CAP}`;
        if (!Array.isArray(c.order) || c.order.length !== c.trackIds.length) return 'context.order must cover trackIds';
        const seen = new Set(c.order);
        if (seen.size !== c.order.length || !c.order.every((i) => isIndex(i) && i < c.trackIds.length)) return 'context.order must be a permutation';
        if (!Number.isInteger(c.cursor) || c.cursor < -1 || c.cursor >= c.order.length) return 'context.cursor is out of range';
    }
    if (queue.current !== null && queue.current !== undefined) {
        const err = entryError(queue.current, 'current'); if (err) return err;
        if (!SOURCES.includes(queue.current.source)) return 'current.source is invalid';
        if (queue.current.source === 'context') {
            if (!c || queue.current.contextId !== c.id || !isIndex(queue.current.contextIndex) || queue.current.contextIndex >= c.trackIds.length) {
                return 'current context entry does not match the context';
            }
        }
    }
    return null;
}

/** Parse a saved queue. Never throws: an invalid queue becomes empty plus an error. */
export function parseQueue(raw) {
    let queue = raw;
    try {
        if (typeof raw === 'string') queue = JSON.parse(raw);
    } catch (err) {
        return { queue: emptyQueue(), error: `Saved queue is not JSON: ${err.message}` };
    }
    if (queue === null || queue === undefined) return { queue: emptyQueue(), error: null };
    const normalized = queue && typeof queue === 'object'
        ? { ...emptyQueue(), ...queue, context: queue.context ?? null, current: queue.current ?? null }
        : queue;
    const error = validateQueue(normalized);
    return error ? { queue: emptyQueue(), error } : { queue: normalized, error: null };
}
