import { escapeHtml } from './html.js';
export const SOUND_STATUS_META = Object.freeze({
    'do-not-play': { label: 'Do not play', glyph: '×' },
    'replace-first': { label: 'Replace first', glyph: '!' },
    'listen-first': { label: 'Listen first', glyph: '•' },
    unscanned: { label: 'Unscanned', glyph: '?' },
    'no-detected-issue': { label: 'No detected issue', glyph: '' },
});

const checkedTime = (item) => {
    const value = Date.parse(item?.checkedAt || '');
    return Number.isFinite(value) ? value : 0;
};

const numeric = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

export function statusKey(item) {
    if (item?.scanStatus === 'unscanned') return 'unscanned';
    return Object.hasOwn(SOUND_STATUS_META, item?.classification) ? item.classification : null;
}

export function buildSoundStatusIndex(items = []) {
    const byTrackId = new Map();
    const byPath = new Map();
    const keepNewer = (map, key, item) => {
        if (!key) return;
        const current = map.get(key);
        if (!current || checkedTime(item) >= checkedTime(current)) map.set(key, item);
    };
    for (const item of Array.isArray(items) ? items : []) {
        if (!statusKey(item)) continue;
        if (item.trackId !== null && item.trackId !== undefined && item.trackId !== '') {
            keepNewer(byTrackId, String(item.trackId), item);
        }
        if (typeof item.path === 'string' && item.path) keepNewer(byPath, item.path, item);
    }
    return { byTrackId, byPath };
}

export function soundStatusForTrack(track, index) {
    if (!track || !index) return null;
    const byId = track.id === null || track.id === undefined
        ? null
        : index.byTrackId?.get(String(track.id));
    const path = track.local_path || track.path || '';
    const byPath = path ? index.byPath?.get(path) : null;
    if (!byId) return byPath || null;
    if (!byPath) return byId;
    return checkedTime(byPath) > checkedTime(byId) ? byPath : byId;
}

export function isSoundIssue(item) {
    const key = statusKey(item);
    return key === 'do-not-play' || key === 'replace-first' || key === 'listen-first' || key === 'unscanned';
}

export function soundStatusLabel(item) {
    const key = statusKey(item);
    const meta = key ? SOUND_STATUS_META[key] : null;
    if (!meta) return '';
    const detail = [];
    if (item.reason) detail.push(String(item.reason));
    const bitrate = numeric(item.averageBitrate);
    const loudness = numeric(item.integratedLufs);
    if (bitrate !== null) detail.push(`${Math.round(bitrate / 1000)} kb/s`);
    if (loudness !== null) detail.push(`${loudness.toFixed(1)} LUFS`);
    return [meta.label, ...detail].join(' · ');
}

export function soundStatusMarkerHtml(item) {
    const key = statusKey(item);
    const meta = key ? SOUND_STATUS_META[key] : null;
    if (!meta?.glyph) return '';
    const label = soundStatusLabel(item);
    return `<span class="sound-status-marker sound-status-marker--${key}" role="img" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><span aria-hidden="true">${meta.glyph}</span></span>`;
}
