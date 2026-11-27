// Shared actions for any UI surface that operates on one or more tracks.

import { GRAPH_TAB, graphRouteFor } from './graph-tabs.js';
import { listGigs as _listGigs, setLaneMembership as _setLaneMembership } from './gigs.js';
import { isLocalPlayable } from './player.js';
import { entityId } from './credits-graph.js';
import { VIEWER } from './viewer-profile.js';
import { isStashedTrack } from './stash.js';
import { setStashed } from './stash-action.js';
import { trackPath } from './track-review.js';
import { STAR, HEART } from './favorite-marks.js';

export const LAST_GIG_KEY = 'umm.lastGigTarget';

// Visible Add to gig controls open the editor. Remembered quick-add is reserved
// for the keyboard action, where repeating the last target is intentional.
export function visibleActionRunOptions(item, event = {}) {
    return { picker: item?.id === 'gig' || !!event.shiftKey };
}

export function gigShortcutRunOptions(key) {
    return { picker: key === 'g', key };
}

// Snapshot the complete filtered scope before opening the asynchronous picker.
// The table's display cap and selection are deliberately not inputs here.
export function copyFilterResultsToGig(app, tracks, { compare, dir = 'asc' } = {}) {
    const ordered = [...tracks];
    if (compare) ordered.sort((a, b) => (dir === 'desc' ? -1 : 1) * compare(a, b));
    const ids = [...new Set(ordered.map(track => track.id).filter(id => id != null && id !== '').map(String))];
    if (!ids.length) return;
    return app._openGigLanePicker(ids, { source: 'filter results', snapshot: true });
}

export function resolveGigTarget(gigs, stored) {
    if (!stored || !Array.isArray(gigs)) return null;
    const gig = gigs.find((candidate) => String(candidate.id) === String(stored.gigId));
    if (!gig || !Array.isArray(gig.playlists)) return null;
    // Legacy memory held one display index; map it to the lane's id.
    const wanted = Array.isArray(stored.laneIds) ? stored.laneIds.map(String)
        : Number.isInteger(stored.laneIdx) && gig.playlists[stored.laneIdx]?.id ? [String(gig.playlists[stored.laneIdx].id)] : [];
    const lanes = wanted.map((id) => gig.playlists.find((lane) => String(lane?.id) === id)).filter((lane) => lane && !lane.isBpmRoll);
    if (!lanes.length) return null;
    return { gigId: gig.id, laneIds: lanes.map((lane) => String(lane.id)), gigName: gig.name, laneNames: lanes.map((lane) => lane.name) };
}

export function readGigTarget(storage) {
    try {
        const raw = storage?.getItem(LAST_GIG_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

export function writeGigTarget(storage, target) {
    try {
        if (target) storage?.setItem(LAST_GIG_KEY, JSON.stringify(target));
        else storage?.removeItem(LAST_GIG_KEY);
    } catch (_) { /* Storage is best-effort. */ }
}

/** Explore similar: Tracks › Graph focused on this track (the engine finds what is near it). */
export function exploreSimilarRoute(track) {
    return track?.id != null && track.id !== '' ? graphRouteFor(`track:${track.id}`, 'track') : null;
}

/** The Graph view of the entity's Collection tab, focused on an artist, label, tag, album (by `artist`) or track (by `id`). */
export function exploreRouteFor({ type, name, artist, id } = {}) {
    if (type === 'track') return exploreSimilarRoute({ id });
    const focus = type === 'album' ? entityId('album', `${artist || ''}|${name || ''}`) : entityId(type, name);
    return focus && GRAPH_TAB[type] ? graphRouteFor(focus, type) : null;
}

/**
 * The actions for one or more tracks. An action marked `write` changes the
 * collection (or opens an editor that does); the read-only viewer offers none.
 * `menu: false` keeps an action off the row menu (a key and a button reach it);
 * `submenu` is a checked list the row menu opens in place (Favorites ›).
 */
export function trackActions(app, trackIds, {
    storage = globalThis.localStorage,
    gigs = { listGigs: _listGigs, setLaneMembership: _setLaneMembership },
    viewer = VIEWER,
} = {}) {
    const ids = (Array.isArray(trackIds) ? trackIds : [trackIds])
        .filter((id) => id != null)
        .map(String);
    if (!ids.length) return [];

    const byId = new Map((app._tracksCache || []).map((track) => [String(track.id), track]));
    const tracks = ids.map((id) => byId.get(id)).filter(Boolean);
    const single = ids.length === 1 ? tracks[0] || null : null;
    const marks = app.marks;
    const database = () => app.integrationManager?.database;
    const notifyFailure = (label, error) => {
        const detail = error?.message ? `: ${error.message}` : '';
        app.showNotification?.(`${label} failed${detail}`, 'error');
    };
    const safeRun = (label, operation) => async (...args) => {
        try { return await operation(...args); }
        catch (error) { notifyFailure(label, error); return null; }
    };

    // Stash writes Comments to the file, so it needs one; no key.
    const everyStashed = tracks.length === ids.length && tracks.every(isStashedTrack);
    const stash = tracks.some(trackPath) ? [{
        id: 'stash',
        write: true,
        label: everyStashed ? 'Unstash' : 'Stash',
        run: safeRun('Stash', () => setStashed(app, ids, !everyStashed)),
    }] : [];

    // Favourites: every id into a collection, or out of it when all are in it already.
    const allIn = (collection) => ids.every((id) => marks?.has(collection, 'track', id));
    const mark = (collection) => safeRun('Favorite action', async () => {
        if (!marks) throw new Error('database unavailable');
        const on = !allIn(collection);
        for (const id of ids) await marks.set(collection, 'track', id, on);
        app._refreshRowFavoriteStars?.(ids);
    });
    const collections = marks?.collections || [];
    const keyOf = { [STAR]: 'f', [HEART]: '⇧F' };
    const items = [{
        id: 'favorite', key: 'f', write: true, menu: false,
        label: allIn(STAR) ? 'Unfavorite' : 'Favorite',
        run: mark(STAR),
    }, {
        id: 'heart', key: '⇧F', write: true, menu: false,
        label: `${allIn(HEART) ? 'Remove from' : 'Add to'} ${marks?.collection(HEART)?.name || 'Downtime'}`,
        run: mark(HEART),
    }, ...(collections.length ? [{
        id: 'favorites', write: true, label: 'Favorites',
        submenu: collections.map((c) => ({ id: `mark:${c.id}`, glyph: c.glyph, label: c.name, key: keyOf[c.id] || null, checked: allIn(c.id), on: () => allIn(c.id), run: mark(c.id) })),
        run: async () => {},
    }] : []), ...stash, {
        id: 'gig',
        key: 'g',
        write: true,
        label: 'Add to gig',
        run: safeRun('Add to gig', async ({ picker = false, key = null } = {}) => {
            // While the gig panel is open, everything but `g` adds straight to its target.
            if (key !== 'g' && app.gigPanel?.isOpen?.()) return app.gigPanel.addToTarget(ids);
            if (picker) return app._openGigLanePicker?.(ids, { source: 'Track actions' });
            const stored = readGigTarget(storage);
            if (!stored) return app._openGigLanePicker?.(ids, { source: 'Track actions' });
            const gigRows = await gigs.listGigs(database());
            const target = resolveGigTarget(gigRows, stored);
            if (!target) {
                writeGigTarget(storage, null);
                return app._openGigLanePicker?.(ids, { source: 'Track actions' });
            }
            const gig = gigRows.find((candidate) => String(candidate.id) === String(target.gigId));
            const wanted = new Set(target.laneIds.map(String));
            const lanes = (gig?.playlists || []).filter((lane) => wanted.has(String(lane?.id)));
            const alreadyInEveryTarget = lanes.length === wanted.size && lanes.every((lane) => {
                const members = new Set((lane.trackIds || []).map(String));
                return ids.every((id) => members.has(id));
            });
            if (alreadyInEveryTarget) {
                app.showNotification?.(`Already in ${target.gigName} › ${target.laneNames.join(', ')}`, 'info');
                return gig;
            }
            const result = await gigs.setLaneMembership(database(), target.gigId, { trackIds: ids, addLaneIds: target.laneIds });
            if (!result) throw new Error('gig or playlist no longer exists');
            app.showNotification?.(`Added ${ids.length} to ${target.gigName} › ${target.laneNames.join(', ')}`, 'success');
            if (app._route?.view === 'gigs') await app.loadGigsView?.();
            // Working edits are published only through an explicit reviewed action.
            return result;
        }),
    }];
    if (app._addToPlaylist) items.push({ id: 'playlist', write: true, label: 'Add to playlist…', run: safeRun('Add to playlist', async () => app._addToPlaylist(ids)) });

    const player = app.audioPlayer;
    if (player && tracks.some(isLocalPlayable)) {
        const queueToast = ({ added, skipped }, one) => {
            const head = added === 1 && !skipped ? one : `Queued ${added}`;
            app.showNotification?.(skipped ? `${head} · ${skipped} without local files` : head, 'success');
        };
        items.push({
            id: 'play-next', key: 'n', label: 'Play next',
            run: safeRun('Play next', async () => queueToast(player.playNext(tracks), 'Playing next')),
        }, {
            id: 'queue', key: '⇧Q', label: 'Add to queue',
            run: safeRun('Add to queue', async () => queueToast(player.addToQueue(tracks), 'Added to queue')),
        });
    }

    if (single) {
        const route = exploreSimilarRoute(single);
        if (route) items.push({ id: 'explore', key: 'e', label: 'Explore similar', run: safeRun('Explore similar', async () => app.navigate(route)) });
        if (single.artist) items.push({ id: 'artist', label: 'Open artist', run: safeRun('Open artist', async () => app.navigate({ view: 'artist', name: single.artist })) });
        if (single.label) items.push({ id: 'label', label: 'Open label', run: safeRun('Open label', async () => app.navigate({ view: 'label', name: single.label })) });
        if (single.local_path || single.path) items.push({ id: 'review', write: true, label: 'Review & write tags', run: safeRun('Open track review', async () => app._openTrackReview(single.id)) });
    }
    return viewer ? items.filter((item) => !item.write) : items;
}
