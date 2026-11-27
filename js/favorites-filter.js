// The ★ filter on Tracks: starred tracks, plus every track by a starred artist
// or label. Exact names, as favorites are stored. Pure.

export function favoriteTrackFilter(favs) {
    const tracks = new Set(), artists = new Set(), labels = new Set();
    for (const f of favs || []) {
        if (!f || f.name == null) continue;
        if (f.type === 'track') tracks.add(String(f.name));
        else if (f.type === 'artist') artists.add(f.name);
        else if (f.type === 'label') labels.add(f.name);
    }
    return (t) => !!t && (tracks.has(String(t.id)) || (!!t.artist && artists.has(t.artist)) || (!!t.label && labels.has(t.label)));
}
