// Stash and Unstash: add or remove the `stash` token in Comments, written
// straight to the file (and its paired FLAC) through the single-track tag
// write, so it is journalled and undoable like any tag write. The tap is the
// go-ahead; nothing is staged. A failed write changes nothing on screen.

import { STASH_TOKEN, isStashedTrack, withCommentToken } from './stash.js';
import { describeWriteResult, trackPath } from './track-review.js';

async function postJson(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    // The route answers with JSON on failure too.
    return res.json();
}

/** A refusal by its name (tag writes off, outside the roots…), else the server's words. */
function failureReason(result) {
    const verdict = describeWriteResult(result);
    const errors = (result?.errors || []).join(' ');
    return result?.code && verdict.title !== 'Write failed' ? verdict.title : errors || verdict.title;
}

function findTrack(app, id) {
    return app._trackById?.(id) || (app._tracksCache || []).find((t) => String(t.id) === id) || null;
}

/**
 * Stash (`on`) or unstash each track, one write at a time. Tracks already in
 * that state are left alone. Returns `{ done, failed: [{ id, reason }] }`.
 */
export async function setStashed(app, trackIds, on, { post = postJson } = {}) {
    const ids = [...new Set((trackIds || []).map(String))];
    const done = [];
    const failed = [];
    const written = new Map();
    let total = 0;
    for (const id of ids) {
        const track = findTrack(app, id);
        if (track && isStashedTrack(track) === Boolean(on)) continue;
        total += 1;
        const path = trackPath(track);
        if (!track || !path) { failed.push({ id, reason: failureReason({ code: 'ENOPATH' }) }); continue; }
        let result;
        try {
            result = await post('/api/tags/write', {
                trackId: track.id,
                expectedRevision: Number(track.revision || 0),
                idempotencyKey: crypto.randomUUID(),
                path,
                patch: { comments: withCommentToken(track.comments, STASH_TOKEN, on) },
            });
        } catch (_) {
            failed.push({ id, reason: failureReason({ code: 'ENETWORK' }) });
            continue;
        }
        if (!result?.ok) { failed.push({ id, reason: failureReason(result) }); continue; }
        const row = result.track || { ...track, comments: withCommentToken(track.comments, STASH_TOKEN, on) };
        try { await app.integrationManager?.database?.updateTrack?.(row); } catch (err) { console.warn('[stash] row not saved', err); }
        written.set(id, row);
        done.push(id);
    }

    const verb = on ? 'Stashed' : 'Unstashed';
    if (failed.length) {
        const reasons = [...new Set(failed.map((f) => f.reason))].join('; ');
        const message = total === 1 ? `${on ? 'Stash' : 'Unstash'} failed: ${reasons}` : `${verb} ${done.length} of ${total}: ${reasons}`;
        app.showNotification?.(message, 'error');
    } else if (done.length) {
        app.showNotification?.(verb, 'success');
    }
    if (!done.length) return { done, failed };

    // The written rows update the cached ones in place (so every holder of the row
    // sees the new Comments); the merge is rebuilt from them.
    for (const [id, row] of written) {
        const cached = (app._tracksCache || []).find((t) => String(t.id) === id);
        if (cached) Object.assign(cached, row);
        app._trackWritten?.(row);
    }
    app._mergedCache = null;
    const player = app.audioPlayer;
    if (on && player?.isPlaying && done.some((id) => player.isCurrent?.(id))) player.next({ stopAtEnd: true });
    if (app._route) await app._openRoute?.(app._route);
    return { done, failed };
}
