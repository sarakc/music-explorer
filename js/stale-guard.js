// Re-entrancy guard for async view loaders. A loader that clears its container,
// awaits (IndexedDB, fetch), then appends must not finish if a newer call
// started in the meantime — otherwise the older call appends stale sections
// under the fresh ones. `begin()` marks a new generation and hands back an
// `isStale()` probe the loader checks after every await.
export function createStaleGuard() {
    let generation = 0;
    return {
        begin() {
            const mine = ++generation;
            return () => mine !== generation;
        },
    };
}
