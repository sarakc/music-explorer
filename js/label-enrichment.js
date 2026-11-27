// Background label enricher — silently fills empty `label` fields in the
// collection layer using Discogs's top suggestion. Does not touch files.
// Each write stamps `label_source: 'discogs-auto'` so a future "write tags
// to files" UI can distinguish auto-enriched values from manual edits.

const RATE_LIMIT_MS = 1100; // Discogs: 60 req/min with auth

export default class LabelEnrichment {
    constructor({ database }) {
        this.database = database;
        this.state = null;
        this._listeners = new Set();
    }

    onProgress(cb) {
        this._listeners.add(cb);
        return () => this._listeners.delete(cb);
    }

    isRunning() {
        return this.state?.running === true;
    }

    async start(tracks) {
        if (this.isRunning()) return;
        const missing = tracks.filter((t) => !t.label);
        if (!missing.length) return;

        this.state = {
            running: true,
            total: missing.length,
            processed: 0,
            accepted: 0,
            noMatch: 0,
            errored: 0,
            cancelled: false,
        };
        this._emit();
        this._runLoop(missing);
    }

    stop() {
        if (!this.state) return;
        this.state.cancelled = true;
        this.state.running = false;
        this._emit();
    }

    async _runLoop(tracks) {
        for (const track of tracks) {
            if (this.state.cancelled) break;

            try {
                const suggestions = await this._lookupLabel(track);
                if (suggestions.length) {
                    // Re-fetch in case the user edited this track mid-run
                    const fresh = (await this.database.getTrack(track.id)) || track;
                    const top = suggestions[0];
                    let dirty = false;
                    if (!fresh.label) {
                        fresh.label = top.label;
                        fresh.label_source = 'discogs-auto';
                        dirty = true;
                    }
                    // Piggy-back coverArt backfill when the track has none. The
                    // suggestion already gives us a thumb/cover_image without a
                    // second Discogs call, so it's effectively free enrichment.
                    if (!fresh.coverArt && (top.cover_image || top.thumb)) {
                        fresh.coverArt = top.cover_image || top.thumb;
                        fresh.coverArt_source = 'discogs-auto';
                        dirty = true;
                    }
                    if (dirty) {
                        await this.database.updateTrack(fresh);
                        this.state.accepted++;
                    } else {
                        this.state.noMatch++; // filled in elsewhere; treat as skip
                    }
                } else {
                    this.state.noMatch++;
                }
            } catch {
                this.state.errored++;
            }

            this.state.processed++;
            this._emit();

            if (!this.state.cancelled) await this._sleep(RATE_LIMIT_MS);
        }

        this.state.running = false;
        this._emit();
    }

    async _lookupLabel(track) {
        const params = new URLSearchParams({ artist: track.artist || '' });
        if (track.title) params.set('title', track.title);
        if (track.album) params.set('album', track.album);
        const res = await fetch(`/api/discogs/lookup-label?${params}`);
        if (!res.ok) throw new Error(`Lookup failed: ${res.status}`);
        const data = await res.json();
        return data.suggestions || [];
    }

    _emit() {
        for (const cb of this._listeners) {
            try { cb(this.state); } catch { /* listener errors are not our problem */ }
        }
    }

    _sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }
}
