// Queue actions in the detail panel, for every node type: Play · Play next ·
// Add to queue. Play next and Add to queue reuse the shared track actions
// (track-actions.js); an entity's tracks go in the order its page uses (the
// Tracks table's sort).
import { trackActions } from './track-actions.js';
import { isLocalPlayable } from './player.js';

/** The tracks to queue, in page order, with a local file. */
export function queueTracks(app, tracks) {
    const ordered = app?._sortLikeTable ? app._sortLikeTable(tracks || []) : [...(tracks || [])];
    return ordered.filter(isLocalPlayable);
}

export const queueButtonsHtml = ({ disabled = false, buttonClass = 'dp-btn' } = {}) => ['next', 'add'].map((k) =>
    `<button type="button" class="${buttonClass}" data-queue="${k}"${disabled ? ' disabled' : ''}>${k === 'next' ? 'Play next' : 'Add to queue'}</button>`).join('');

/**
 * Put Play next and Add to queue right after the panel's Play button (`[data-play]`).
 * A panel without one (a track's) gets Play too, at the start of `actionsSelector`,
 * running `play`.
 */
export function mountQueueActions(host, { app, tracks, actionsSelector = '.dp-actions', play = null, buttonClass = 'dp-btn' }) {
    const playable = queueTracks(app, tracks);
    const anchor = host.querySelector('[data-play]');
    const html = queueButtonsHtml({ disabled: !playable.length, buttonClass });
    if (anchor) anchor.insertAdjacentHTML('afterend', html);
    else {
        host.querySelector(actionsSelector)?.insertAdjacentHTML('afterbegin', `<button type="button" class="${buttonClass}" data-queue="play"${playable.length ? '' : ' disabled'}>Play</button>${html}`);
        host.querySelector('[data-queue="play"]')?.addEventListener('click', () => play?.());
    }
    host.querySelectorAll('[data-queue="next"],[data-queue="add"]').forEach((btn) => btn.addEventListener('click', () => {
        const ids = playable.map((t) => String(t.id));
        const item = trackActions(app, ids).find((a) => a.id === (btn.dataset.queue === 'next' ? 'play-next' : 'queue'));
        item?.run();
    }));
}
