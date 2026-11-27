// What ArtistGap and LabelGap read: an artist's or label's Discogs identity and
// discography as the server queue stored them. Missing data is requested from
// the queue and awaited (the callers show their own loading state); nothing
// here calls Discogs. The viewer has no queue: what the snapshot lacks is a
// limit of the snapshot (code 'snapshot').
import { entityId } from './credits-graph.js';
import { queueBlocker, whenReady, codeError, DISCONNECTED } from './discogs-wait.js';
import { VIEWER } from './viewer-profile.js';

export const CATALOGUE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const refKey = (ref) => `discogs:${ref.type}:${ref.id}`;
const stripDisambiguator = (s) => String(s ?? '').replace(/\s*\(\d+\)\s*$/, '');

function blockedError(reason) {
    return reason === 'disconnected' ? codeError('disconnected', DISCONNECTED) : codeError('fetch', 'Discogs is unavailable');
}

const notInSnapshot = () => codeError('snapshot', 'Not in the snapshot');

// The stored identity row, asking the queue (and waiting) when there is none.
export async function readIdentity({ database, queue, type, name, viewer = VIEWER }) {
    const id = entityId(type, name);
    if (!id) return null;
    const read = () => database.getEntityIdentity(id);
    const row = await read();
    if (row) return row;
    if (viewer) throw notInSnapshot();
    const blocked = await queueBlocker(queue);
    if (blocked) throw blockedError(blocked);
    queue.focus({ focus: [id] });
    return whenReady({ queue, ids: [id], check: async () => (await read()) || undefined });
}

// → { discogsId, canonicalName, resolvedAt } for a confirmed identity, else nulls.
export function summarise(row, fallbackName) {
    const ref = row?.resolution === 'confirmed' ? row.refs?.[0] : null;
    if (!ref) return { discogsId: null, canonicalName: null, resolvedAt: row?.updatedAt || Date.now() };
    const named = (row.candidates || []).find((c) => String(c.id) === String(ref.id))?.name;
    return { discogsId: ref.id, canonicalName: stripDisambiguator(named || row.name || fallbackName), resolvedAt: row.updatedAt || Date.now() };
}

// The stored discography of a confirmed identity. A stale copy is returned at
// once while the queue refreshes it; a missing one is awaited.
export async function readReleases({ database, queue, type, name, row, refresh = false, viewer = VIEWER }) {
    const ref = row.refs[0];
    const id = entityId(type, name);
    const read = () => database.getDiscogsReleases(refKey(ref));
    const have = await read();
    const fresh = have && Date.now() - (have.fetchedAt || 0) < CATALOGUE_TTL_MS;
    if (have && fresh && !refresh) return have.releases || [];
    if (viewer) { if (have) return have.releases || []; throw notInSnapshot(); }
    const blocked = await queueBlocker(queue);
    if (blocked) {
        if (have) return have.releases || [];
        throw blockedError(blocked);
    }
    queue.focus({ focus: [id] });
    if (have) return have.releases || [];
    const got = await whenReady({ queue, ids: [id], check: async () => (await read()) || undefined });
    return got.releases || [];
}

/**
 * A gap section's error line for an artist, label or album: its words, and
 * whether Retry can help. In the viewer nothing new arrives, so it never can.
 */
export function gapErrorLine(err, noun, { viewer = VIEWER } = {}) {
    const code = err?.code;
    const text = code === 'no-match' ? `No Discogs match for this ${noun}`
        : code === 'disconnected' ? DISCONNECTED
        : code === 'rate-limit' ? 'Discogs rate-limited — try again shortly'
        : code === 'snapshot' ? 'Not in the snapshot'
        : 'Lookup failed';
    return { text, retry: !viewer && code !== 'snapshot' };
}
