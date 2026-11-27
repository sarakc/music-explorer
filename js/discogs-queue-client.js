// Client for the server's Discogs background queue. The browser never starts
// Discogs work itself: it says what is in focus, and hears back when a job
// that touched something lands. Every failure (an older server without the
// route, offline) is silent; callers fall back to what is cached.
const BASE = '/api/discogs/queue';
const LISTS = ['focus', 'visible', 'near'];

export function createDiscogsQueueClient({
    fetchImpl = (...a) => globalThis.fetch(...a),
    EventSourceImpl = globalThis.EventSource,
    debounceMs = 300,
} = {}) {
    let pending = { focus: [], visible: [], near: [] };
    let timer = null;
    let source = null;
    const listeners = new Set();

    const send = async () => {
        timer = null;
        const body = pending;
        pending = { focus: [], visible: [], near: [] };
        if (!LISTS.some((k) => body[k].length)) return;
        try {
            await fetchImpl(`${BASE}/focus`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        } catch (_) { /* silent */ }
    };

    // Calls within the debounce window merge: most urgent list wins per id.
    function focus({ focus: f = [], visible = [], near = [] } = {}) {
        const incoming = { focus: f, visible, near };
        for (const key of LISTS) {
            for (const id of Array.isArray(incoming[key]) ? incoming[key] : []) {
                if (typeof id !== 'string' || !id) continue;
                const rank = LISTS.indexOf(key);
                if (LISTS.slice(0, rank + 1).some((k) => pending[k].includes(id))) continue;
                for (const worse of LISTS.slice(rank + 1)) pending[worse] = pending[worse].filter((x) => x !== id);
                pending[key].push(id);
            }
        }
        if (!timer && LISTS.some((k) => pending[k].length)) timer = setTimeout(send, debounceMs);
    }

    function open() {
        if (source || typeof EventSourceImpl !== 'function') return;
        try {
            source = new EventSourceImpl(`${BASE}/stream`);
            source.addEventListener('job-done', (ev) => {
                let data;
                try { data = JSON.parse(ev.data); } catch (_) { return; }
                for (const fn of [...listeners]) { try { fn(data); } catch (_) { /* a listener must not break the rest */ } }
            });
        } catch (_) { source = null; }
    }

    function onJobDone(fn) {
        listeners.add(fn);
        open();
        return () => listeners.delete(fn);
    }

    async function status() {
        try {
            const res = await fetchImpl(`${BASE}/status`);
            return res.ok ? await res.json() : null;
        } catch (_) { return null; }
    }

    function close() {
        clearTimeout(timer);
        timer = null;
        pending = { focus: [], visible: [], near: [] };
        listeners.clear();
        try { source?.close(); } catch (_) { /* ignore */ }
        source = null;
    }

    return { focus, onJobDone, status, close };
}

export default createDiscogsQueueClient;
