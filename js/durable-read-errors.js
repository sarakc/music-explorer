// Pure: no DOM. Turns an uncaught rejection from a durable read (any call
// that now goes over the network to the server-owned SQLite database) into
// an actionable, user-visible notification instead of a silently dead click.
//
// Before the SQLite migration, `getAllTracks()` and friends resolved from
// IndexedDB and essentially could not fail this way. Now a server restart, a
// SQLITE_BUSY past the client timeout, or a 413 throws — and because routing
// (`hashchange`, `navigate()`) never awaits or catches `_openRoute()`, that
// throw used to vanish. Wiring `window.addEventListener('unhandledrejection', ...)`
// to `createUnhandledRejectionHandler` in app.js's `setupEventListeners()`
// catches exactly that class of failure, app-wide, without swallowing the
// error from the console (the browser still logs the rejection itself —
// this handler never calls `event.preventDefault()`).

export function durableReadErrorMessage(reason) {
    const detail = reason instanceof Error ? reason.message : (reason != null ? String(reason) : 'unknown error');
    return `Lost connection to the database — the server may be unreachable. (${detail})`;
}

export function createUnhandledRejectionHandler(notify) {
    return (event) => notify(durableReadErrorMessage(event?.reason), 'error');
}
