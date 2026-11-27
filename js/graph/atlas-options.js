// What the graph shows: Show › Artists, Albums, Labels, Tags and Tracks (the Show chip),
// Night sky, and full screen. Per-browser UI preferences shared by every Collection Graph
// and Discover › Graph. Artists, labels and tags are nodes; albums and tracks are the dots
// round a selected artist or label, and a release you don't own counts as an album. The
// focus and what holds it always show, whatever kind is off. Tracks start off (Sara took
// track dots off the map on 11-20 and asked for them back as an option on 11-22); a kind
// missing from a stored preference reads as its default.

const STORAGE_KEY = 'umm.atlasShow';
const SKY_KEY = 'umm.atlasSky';
const SKIES = new Set(['night', 'light']);
export const SHOW = [['artist', 'Artists'], ['album', 'Albums'], ['label', 'Labels'], ['tag', 'Tags'], ['track', 'Tracks']];
const DEFAULTS = Object.freeze({ ...Object.fromEntries(SHOW.map(([key]) => [key, true])), track: false });
// An outside node's kind, as a toggle: a release you don't own is an album.
const KIND = { release: 'album' };
// Merely reading localStorage throws where storage is blocked (Safari), so it is
// resolved here, inside each caller's try, never in a default parameter.
const local = (storage) => (storage === undefined ? globalThis.localStorage : storage);

export function readShow(storage) {
    let saved = null;
    try { saved = JSON.parse(local(storage)?.getItem(STORAGE_KEY) || 'null'); } catch (_) { saved = null; }
    const out = { ...DEFAULTS };
    for (const [key] of SHOW) if (typeof saved?.[key] === 'boolean') out[key] = saved[key];
    return out;
}

export function writeShow(show, storage) {
    const out = Object.fromEntries(SHOW.map(([key]) => [key, typeof show?.[key] === 'boolean' ? show[key] : DEFAULTS[key]]));
    try { local(storage)?.setItem(STORAGE_KEY, JSON.stringify(out)); } catch (_) { /* a preference only */ }
    return out;
}

/** Does the graph draw a node of this type? `keep` ids (the focus, its host) always show. */
export function shows(show, type, id = null, keep = null) {
    if (id != null && keep?.has(id)) return true;
    const key = KIND[type] || type;
    return show?.[key] !== false;
}

/** Night sky or Light: the stored choice, else the skin's (a dark skin starts in Night sky). */
export function readSky(storage, skinDark = false) {
    let value = null;
    try { value = local(storage)?.getItem(SKY_KEY); } catch (_) { value = null; }
    return SKIES.has(value) ? value : skinDark ? 'night' : 'light';
}

export function writeSky(value, storage) {
    const sky = value === 'night' ? 'night' : 'light';
    try { local(storage)?.setItem(SKY_KEY, sky); } catch (_) { /* a preference only */ }
    return sky;
}

const VIZ_KEY = 'umm.atlasViz';
export const VIZ_FX = [['wash', 'Wash'], ['warp', 'Warp'], ['trails', 'Trails'], ['mirror', 'Mirror']];
export const VIZ_JOURNEYS = [['home', 'Home'], ['wander', 'Wander']];
const VIZ_DEFAULTS = Object.freeze({ wash: true, warp: false, trails: true, mirror: false, amount: 0.85, journey: 'home' });

const vizChoice = (saved) => {
    const out = { ...VIZ_DEFAULTS };
    for (const [key] of VIZ_FX) if (typeof saved?.[key] === 'boolean') out[key] = saved[key];
    if (Number.isFinite(saved?.amount)) out.amount = Math.min(1, Math.max(0, saved.amount));
    if (VIZ_JOURNEYS.some(([key]) => key === saved?.journey)) out.journey = saved.journey;
    return out;
};

/** The visualizer's stored choices: its four effects, their intensity (0 to 1) and the journey. */
export function readViz(storage) {
    let saved = null;
    try { saved = JSON.parse(local(storage)?.getItem(VIZ_KEY) || 'null'); } catch (_) { saved = null; }
    return vizChoice(saved);
}

export function writeViz(value, storage) {
    const out = vizChoice(value);
    try { local(storage)?.setItem(VIZ_KEY, JSON.stringify(out)); } catch (_) { /* a preference only */ }
    return out;
}
