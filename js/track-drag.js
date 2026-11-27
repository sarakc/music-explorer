// Dragging Collection rows onto a playlist (Collection › Playlists, the gig
// panel). Rows carry their track id; a drag takes the whole selection when the
// row is selected, else the one row. `source` names the playlist a drag
// started in ({ gigId, laneId }), so a drop back onto it reorders.

export const TRACKS_MIME = 'application/x-umm-tracks';

export function wireTrackDrag(root, { idsFor, source = null }) {
    root.addEventListener('dragstart', (event) => {
        const row = event.target.closest?.('tr[data-track-id]');
        if (!row || !event.dataTransfer) return;
        const ids = idsFor(row.dataset.trackId).map(String);
        if (!ids.length) { event.preventDefault(); return; }
        event.dataTransfer.setData(TRACKS_MIME, JSON.stringify({ ids, source }));
        event.dataTransfer.setData('text/plain', ids.join('\n'));
        event.dataTransfer.effectAllowed = 'copyMove';
    });
}

export const carriesTracks = (event) => [...(event.dataTransfer?.types || [])].includes(TRACKS_MIME);

export function readTrackDrop(event) {
    try {
        const out = JSON.parse(event.dataTransfer?.getData(TRACKS_MIME) || 'null');
        return Array.isArray(out?.ids) ? { ids: out.ids.map(String), source: out.source || null } : null;
    } catch (_) { return null; }
}
