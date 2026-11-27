const jsonResponse = (win, body, status = 200) => {
    const ResponseCtor = win.Response || globalThis.Response;
    return new ResponseCtor(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
};
const API_PREFIX = '/api';

// `favorites` is ☆ alone: ♡ and the custom collections stay private (refused below).
const DB_STORES = '(tracks|favorites|entity_links|entity_identity|entity_relations|release_credits|credits_cache|artist_discogs_map|label_discogs_map|release_resolve_map)';
// Read one row at a time only: the snapshot shards them (viewer-shards.js).
const DB_ROW_STORES = '(discogs_releases)';

export const API_CLASSES = Object.freeze([
    { pattern: new RegExp(`^/api/db/${DB_STORES}(?:/[^/]+)?$`), methods: ['GET'], served: true },
    { pattern: new RegExp(`^/api/db/${DB_ROW_STORES}/[^/]+$`), methods: ['GET'], served: true },
    { pattern: /^\/api\/db\/settings\/[^/]+$/, methods: ['GET'], served: false, unset: true },
    { pattern: /^\/api\/atlas(?:\/(?:discover|focus))?$/, methods: ['GET'], served: true },
    { pattern: /^\/api\/discover\/new-releases$/, methods: ['GET'], served: true },
    { pattern: /^\/api\/similarity\/(?:neighbours\/[^/]+|why)$/, methods: ['GET'], served: true },
    { pattern: /^\/api\/links(?:\/summary|\/[^/]+)$/, methods: ['GET'], served: true },
    { pattern: /^\/api\/discogs\/release\/(?!resolve$)[^/]+(?:\/(?:credits|videos))?$/, methods: ['GET'], served: true },
    // Artist and label profiles (`discogs-connector.js` builds the kind at run time).
    { pattern: /^\/api\/discogs\/[a-z]+\/[^/]+\/profile$/, methods: ['GET'], served: true },
    // Facts: the viewer shows only an artist's Commons photo (facts-view.js), all the snapshot holds.
    { pattern: /^\/api\/facts$/, methods: ['GET'], served: true },
    { pattern: /^\/api\/health$/, methods: ['GET', 'HEAD'], served: true },

    // Refused: everything that acts, plays, reads local files or private state.
    // A path with no row is refused too, but the contract test fails on it until
    // it has a row here.
    { pattern: /^\/api\/db(?:\/restore)?$/, methods: [], served: false },
    // ♡ and the custom favourites collections are not in the snapshot; the viewer never asks.
    { pattern: /^\/api\/db\/(?:favorite_collections|favorite_marks)(?:\/[^/]+(?:\/delete)?)?$/, methods: [], served: false },
    // A whole sharded store: too large for one file; the browser reads it by row.
    { pattern: new RegExp(`^/api/db/${DB_ROW_STORES}$`), methods: [], served: false },
    { pattern: /^\/api\/atlas\/(?:albums|dig|sources\/retry)$/, methods: [], served: false },
    { pattern: /^\/api\/discover\/new-releases\/refresh$/, methods: [], served: false },
    { pattern: /^\/api\/similarity(?:\/[^/]+)?$/, methods: [], served: false },
    { pattern: /^\/api\/links(?:\/[^/]+\/[^/]+)?$/, methods: [], served: false },
    { pattern: /^\/api\/discogs\/(?:auth|collection|lookup-label|search|queue(?:\/[^/]+)?)$/, methods: [], served: false },
    // Discogs reads the snapshot cannot hold: a search (resolve), the server's
    // in-memory caches (cached releases) and release lists, which the browser
    // reads from `discogs_releases` instead.
    { pattern: /^\/api\/discogs\/(?:cached-releases|release\/resolve|[a-z]+\/[^/]+\/releases)$/, methods: [], served: false },
    { pattern: /^\/api\/(?:library|tags|ingest|playback|rekordbox|rekordbox-history|preview|playlists|listen|musicbrainz|releases|sound-check)\/.+$/, methods: [], served: false },
    { pattern: /^\/api\/(?:manifest|tools)(?:\/.+)?$/, methods: [], served: false },
    { pattern: /^\/api\/(?:bandcamp\/import|release-sources\/status|token)$/, methods: [], served: false },
]);

export function classify(method, path) {
    const verb = String(method || 'GET').toUpperCase();
    if (!String(path || '').startsWith('/api')) return 'passthrough';
    const row = API_CLASSES.find((entry) => entry.pattern.test(path));
    if (!row || !row.methods.includes(verb)) return 'refused';
    if (row.unset) return 'unset';
    return row.served ? 'served' : 'refused';
}

function requestUrl(win, input) {
    const raw = typeof input === 'string' || input instanceof URL ? input : input?.url || String(input);
    return new URL(raw, win.location?.href || 'http://viewer.invalid/');
}

export function installViewerApi({ win = globalThis.window, source }) {
    if (!win || !source?.get) throw new TypeError('viewer API needs a window and source');
    const refused = [];
    const originalFetch = win.fetch?.bind(win) || globalThis.fetch;
    const record = (kind, method, path, error = '') => {
        const entry = { kind, method, path };
        if (error) entry.error = String(error?.message || error);
        refused.push(entry);
        return entry;
    };

    win.fetch = async (input, init = {}) => {
        const url = requestUrl(win, input);
        const method = String(init.method || input?.method || 'GET').toUpperCase();
        if (url.origin !== new URL(win.location?.href || 'http://viewer.invalid/').origin || !url.pathname.startsWith(API_PREFIX)) {
            return originalFetch(input, init);
        }
        const kind = classify(method, url.pathname);
        if (kind === 'unset') {
            record('fetch-unset', method, url.pathname);
            return jsonResponse(win, { row: null });
        }
        if (kind !== 'served') {
            record('fetch', method, url.pathname);
            return jsonResponse(win, { error: 'unavailable in viewer' }, 503);
        }
        try {
            const result = await source.get(url.pathname, url.searchParams);
            return jsonResponse(win, result?.body ?? null, result?.status ?? 200);
        } catch (error) {
            record('fetch-error', method, url.pathname, error);
            return jsonResponse(win, { error: 'unavailable in viewer' }, 503);
        }
    };

    const OriginalEventSource = win.EventSource;
    const EventTargetCtor = win.EventTarget || globalThis.EventTarget;
    const EventCtor = win.Event || globalThis.Event;
    win.EventSource = function ViewerEventSource(input, options) {
        const url = requestUrl(win, input);
        if (url.origin !== new URL(win.location?.href || 'http://viewer.invalid/').origin || classify('GET', url.pathname) === 'served') {
            return OriginalEventSource ? new OriginalEventSource(input, options) : null;
        }
        record('eventsource', 'GET', url.pathname);
        const target = new EventTargetCtor();
        Object.assign(target, { url: String(input), readyState: 2, close() {}, onerror: null, onmessage: null, onopen: null });
        queueMicrotask(() => {
            const event = new EventCtor('error');
            target.dispatchEvent(event);
            target.onerror?.(event);
        });
        return target;
    };
    Object.assign(win.EventSource, { CONNECTING: 0, OPEN: 1, CLOSED: 2 });

    if (win.navigator) {
        const originalBeacon = win.navigator.sendBeacon?.bind(win.navigator);
        win.navigator.sendBeacon = (input, data) => {
            const url = requestUrl(win, input);
            if (url.origin !== new URL(win.location?.href || 'http://viewer.invalid/').origin || !url.pathname.startsWith(API_PREFIX)) {
                return originalBeacon ? originalBeacon(input, data) : false;
            }
            record('beacon', 'POST', url.pathname);
            return false;
        };
    }

    return { refused };
}
