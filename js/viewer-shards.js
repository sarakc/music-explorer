export const SHARD_COUNT = 256;

// Database stores the browser reads one row at a time, by this key: the snapshot
// shards them under db/<store>/ instead of writing one file.
export const SHARDED_STORES = Object.freeze({ discogs_releases: 'ref' });

export function shardOf(id) {
    let hash = 2166136261;
    for (const byte of new TextEncoder().encode(String(id))) {
        hash ^= byte;
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 24).toString(16).padStart(2, '0');
}

export function shardPath(kind, id) {
    const store = kind.startsWith('db/') && kind.slice(3);
    if (!['focus', 'outside', 'neighbours', 'discogs'].includes(kind) && !SHARDED_STORES[store]) throw new TypeError(`Unknown viewer shard: ${kind}`);
    return `${kind}/${shardOf(id)}.json`;
}
