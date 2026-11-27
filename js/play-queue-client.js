// Transport for the server-owned playback queue (server/routes/playback.js).
// A rejected promise means a tool failure (network, 5xx, 400); a 409 is a
// normal answer carrying the server's current queue.

import { playbackSessionId, sessionHeaders } from './collection-session.js';

export default class PlayQueueClient {
    constructor({ fetchImpl, sendBeacon } = {}) {
        this.fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
        this.sendBeacon = sendBeacon || ((url, data) => globalThis.navigator?.sendBeacon?.(url, data));
    }

    async load() {
        const res = await this.fetchImpl('/api/playback/queue');
        if (!res.ok) throw new Error(`Queue load failed (${res.status})`);
        return (await res.json()).queue;
    }

    async save(queue, expectedRevision) {
        const res = await this.fetchImpl('/api/playback/queue', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
            body: JSON.stringify({ expectedRevision, queue }),
        });
        if (res.status !== 200 && res.status !== 409) throw new Error(`Queue save failed (${res.status})`);
        return { status: res.status, queue: (await res.json()).queue };
    }

    async savePosition(entryId, positionSec) {
        const res = await this.fetchImpl('/api/playback/position', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
            body: JSON.stringify({ entryId, positionSec }),
        });
        if (res.status !== 204) throw new Error(`Position save failed (${res.status})`);
    }

    /** For pagehide: fire-and-forget, survives the page unloading. */
    beaconPosition(entryId, positionSec) {
        const body = new Blob([JSON.stringify({ entryId, positionSec, session: playbackSessionId() })], { type: 'application/json' });
        return this.sendBeacon('/api/playback/position', body);
    }
}
