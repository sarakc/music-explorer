// Plain words for a similarity reason ({ signal, s, detail }). The engine sends
// structured detail; the atlas hover card and the panel's Why list read it here.

export const SIGNAL_NAMES = Object.freeze({
    tags: 'Tags', genre: 'Genre', artist: 'Artist', label: 'Label', bpm: 'BPM', key: 'Key', year: 'Year', curation: 'Together', plays: 'Plays',
    'discogs-styles': 'Discogs', 'discogs-identity': 'Discogs', 'discogs-membership': 'Discogs', 'label-family': 'Label family', credits: 'Credits',
    place: 'Place', era: 'Years', samples: 'Samples', members: 'Members',
    'wiki-links': 'Wikipedia', 'wiki-cocite': 'Wikipedia', 'wiki-categories': 'Wikipedia',
    bandcamp: 'Bandcamp', musicbrainz: 'MusicBrainz',
});

const MB_REL = { 'member of band': 'member of band', collaboration: 'collaboration', 'is person': 'same person', subgroup: 'subgroup', 'label ownership': 'label ownership', 'label reissue': 'reissues' };
const years = (d) => (d.begin || d.end ? `, ${String(d.begin || '').slice(0, 4)}–${String(d.end || '').slice(0, 4)}` : '');

const SAMPLE_DIR = { samples: 'samples', sampledBy: 'sampled by', covers: 'covers', coveredBy: 'covered by' };

const list = (names, count) => {
    const shown = (names || []).filter(Boolean);
    const extra = Math.max(0, (count ?? shown.length) - shown.length);
    return shown.join(', ') + (extra ? ` +${extra}` : '');
};

/** The reason in a short phrase, e.g. "House, Chill +3". Empty when nothing readable is there. */
export function reasonWords(reason) {
    const d = reason?.detail;
    if (typeof d === 'string') return d;
    if (!d || typeof d !== 'object') return '';
    switch (reason.signal) {
        case 'tags': case 'genre': case 'artist': case 'label': case 'discogs-styles':
            return list(d.shared, d.sharedCount);
        case 'bpm':
            return d.folded ? `${d.a} and ${d.b} (half-time)` : d.a === d.b ? `${d.a}` : `${d.a} and ${d.b}`;
        case 'key':
            return d.a && d.b ? (d.a === d.b ? `${d.a}` : `${d.a} and ${d.b}`) : '';
        case 'year':
            return d.gap === 0 ? `${d.a}` : d.a && d.b ? `${d.a} and ${d.b}` : '';
        case 'curation':
            return list(d.contexts, d.together);
        case 'plays':
            return d.together ? `played together ${d.together}×` : '';
        case 'credits':
            return d.shared?.length ? `credited with ${list(d.shared, d.sharedCount)}` : d.via ? `via ${d.via}` : '';
        case 'discogs-identity':
            return d.name ? `alias of ${d.name}` : 'alias';
        case 'discogs-membership':
            return d.name ? `member link with ${d.name}` : 'member link';
        case 'label-family':
            return d.kind === 'sublabel' ? 'sublabel' : 'same parent label';
        case 'place':
            return d.name || '';
        case 'era':
            if (d.from != null && d.to != null) return d.open ? `since ${d.from}` : d.from === d.to ? `${d.from}` : `${d.from}–${d.to}`;
            return d.a && d.b ? (d.a === d.b ? `${d.a}` : `${d.a} and ${d.b}`) : '';
        case 'samples':
            return SAMPLE_DIR[d.dir] && d.name ? `${SAMPLE_DIR[d.dir]} ${d.name}` : '';
        case 'members':
            return d.kind ? 'members' : '';
        case 'wiki-links':
            return 'linked on Wikipedia';
        case 'wiki-cocite':
            return list(d.shared, d.sharedCount);
        case 'wiki-categories':
            return list((d.shared || []).slice(0, 2), d.sharedCount);
        case 'bandcamp':
            return d.roster ? 'On the label’s Bandcamp roster' : d.held ? `Held by ${d.held} of ${d.of} supporters` : '';
        case 'musicbrainz':
            return d.rel ? `${MB_REL[d.rel] || d.rel}${d.name ? ` with ${d.name}` : ''}${years(d)}` : '';
        default:
            return '';
    }
}

/** "Tags · House, Chill +3": the source named, then the words. */
export function reasonLine(reason) {
    const words = reasonWords(reason);
    return words ? `${SIGNAL_NAMES[reason.signal] || reason.signal} · ${words}` : '';
}
