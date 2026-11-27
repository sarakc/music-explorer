import { normaliseTitle } from './label-gap.js';

// Recheck ownership against the current collection, not a stale gap snapshot.
export function unownedCachedReleases(releases, tracks = []) {
    const ids = new Set(tracks.map(t => String(t.discogs_id || t.discogsReleaseId || '')).filter(Boolean));
    const key = (artist, title) => `${normaliseTitle(artist)}|${normaliseTitle(title)}`;
    const owned = new Set(tracks.map(t => key(t.artist, t.album || t.title)));
    const seen = new Set();
    return releases.filter(r => {
        if (!r.id || !r.title || r.type === 'master') return false;
        const id = String(r.id);
        if (seen.has(id) || ids.has(id) || owned.has(key(r.artist, r.title))) return false;
        seen.add(id);
        return true;
    });
}

export function cachedGapReleases(app) {
    const releases = [];
    for (const [name, gap] of app.labelGap?._catalogueCache || []) {
        for (const row of gap.missing || []) releases.push({ ...row, label: gap.canonicalName || name });
    }
    for (const [name, gap] of app.artistGap?._catalogueCache || []) {
        for (const row of gap.missing || []) releases.push({ ...row, artist: row.artist || gap.canonicalName || name });
    }
    return releases;
}
