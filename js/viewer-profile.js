export const VIEWER = globalThis.document?.documentElement?.hasAttribute('data-viewer') === true;

// A visitor's own map (`?src=yours` with a stored map): set by startViewer before
// app.js loads, and read through this live binding.
let visitor = false;
export { visitor as VISITOR };
export function setVisitorProfile(on) { visitor = Boolean(on); }

// What a visitor's map has no data for, on top of what the viewer already hides.
const VISITOR_HIDES = new Set(['discover', 'gaps', 'facts', 'cover-art', 'favorites', 'links']);
/** visitorHides('discover' | 'gaps' | 'facts' | 'cover-art' | 'favorites' | 'links') */
export const visitorHides = (feature) => visitor && VISITOR_HIDES.has(feature);

export const VIEWER_PROFILE = Object.freeze({
    home: '#/collection?as=graph',
    title: 'Unified',
});

const HIDDEN_VIEWS = new Set([
    'gigs', 'rekordbox', 'tagging', 'fields', 'formatting', 'identities', 'sound-check',
    'duplicates', 'storage', 'paths', 'similarity', 'settings',
]);
const COLLECTION_VIEWS = new Set(['collection', 'artists', 'albums', 'labels', 'tags', 'playlists', 'charts']);

export function isHiddenRoute(route = {}) {
    if (HIDDEN_VIEWS.has(route.view)) return true;
    if (route.view === 'discover') return visitorHides('discover') || route.tab === 'shortlist';
    if (COLLECTION_VIEWS.has(route.view)) return route.graph !== true;
    return false;
}
