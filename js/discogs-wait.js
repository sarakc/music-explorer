// Shared plumbing for the services that read Discogs data the server queue
// fetches (EntityRelations, ArtistGap, LabelGap). They never call Discogs:
// they read the stores, ask the queue to focus what is missing, and hear back
// over its `job-done` stream.

const STATUS_TTL_MS = 5000;

// Why a missing piece of data will not arrive on its own, or null when the
// queue is working on it. `queue` may be absent (older server, tests).
export async function queueBlocker(queue) {
    if (!queue || typeof queue.status !== 'function') return 'unavailable';
    const status = await queue.status().catch(() => null);
    if (!status) return 'unavailable';
    if (status.connected === false) return 'disconnected';
    if (status.reason === 'off' || status.reason === 'blocked') return 'unavailable';
    return null;
}

// A status lookup cached for a few seconds, so a list of entities asks once.
export function cachedBlocker(queue, ttl = STATUS_TTL_MS) {
    let at = 0;
    let pending = null;
    return () => {
        if (pending && Date.now() - at < ttl) return pending;
        at = Date.now();
        pending = queueBlocker(queue);
        return pending;
    };
}

// Resolves with `check()`'s value once it returns one. `check` is re-run when a
// job touching one of `ids` finishes, and every `pollMs` as a fallback for a
// stream that is not connected. Rejects with code 'loading' after `timeoutMs`.
export function whenReady({ queue, ids, check, timeoutMs = 120_000, pollMs = 15_000 }) {
    return new Promise((resolve, reject) => {
        let off = () => {};
        let timer = null;
        let poll = null;
        let settled = false;
        let running = false;
        const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            clearInterval(poll);
            off();
            fn(value);
        };
        const run = async () => {
            if (settled || running) return;
            running = true;
            try {
                const out = await check();
                if (out !== undefined) finish(resolve, out);
            } catch (err) { finish(reject, err); } finally { running = false; }
        };
        const wanted = new Set(ids);
        off = typeof queue?.onJobDone === 'function'
            ? queue.onJobDone((evt) => { if ((evt?.entityIds || []).some((id) => wanted.has(id))) run(); })
            : () => {};
        timer = setTimeout(() => finish(reject, Object.assign(new Error('Still loading from Discogs'), { code: 'loading' })), timeoutMs);
        poll = setInterval(run, pollMs);
        timer.unref?.();
        poll.unref?.();
        run();
    });
}

export const codeError = (code, message) => Object.assign(new Error(message), { code });
export const DISCONNECTED = 'Connect Discogs in Settings';
