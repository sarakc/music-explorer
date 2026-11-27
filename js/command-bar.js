// What the Go list (go-list.js) finds: any view, gig, playlist, saved filter, cached release,
// command or entity, ranked. Pure index and ranking, and the read of its sources; no DOM.

import { buildRoute, VIEW_TABS } from './router.js';
import { SECTIONS, tabsFor, CLEANUP_VIEWS } from './sections.js';
import { cachedGapReleases, unownedCachedReleases } from './cached-releases.js';
import { exploreRouteFor } from './track-actions.js';
import { VIEWER, isHiddenRoute } from './viewer-profile.js';

// Each section, then every tab as "Section › Tab", the Graph view and Favorites (☆ on Tracks). Inbox opens
// Settings at its Inbox card; Listen is the sheet under the search field.
export const VIEW_ITEMS = [
    ...Object.entries(SECTIONS).flatMap(([id, { label, views }]) => {
        const tabs = tabsFor(id, { viewTabs: VIEW_TABS[views[0][0]] });
        return [{ label, route: { view: views[0][0] } }, ...tabs.map((t) => ({ label: `${label} › ${t.label}`, route: t.tab ? { view: t.view, tab: t.tab } : { view: t.view } }))];
    }),
    { label: 'Collection › Graph', route: { view: 'collection', graph: true } },
    { label: 'Favorites', route: { view: 'collection', fav: true } },
    // Cleanup's sub-tools are links under its tab: Formatting, File paths, Duplicates, Storage.
    ...CLEANUP_VIEWS.map(([view, label]) => ({ label: `Tools › Cleanup › ${label}`, route: { view } })),
    { label: 'Inbox', route: { view: 'settings', section: 'inbox' } },
    { label: 'Listen', route: { view: 'collection', listen: true } },
];
// The viewer reaches only the views it serves: no Listen, gigs, saved filters,
// Shortlist or player commands, and no cached-release hits (picking one adds it to the Shortlist).
export const VIEWER_VIEW_ITEMS = VIEW_ITEMS.filter((item) => !item.route.listen && !isHiddenRoute(item.route));

export function buildIndex(tracks) {
    const artists = new Map(), labels = new Map(), tags = new Map(), albums = new Map();
    const bump = (map, key) => { if (key) map.set(key, (map.get(key) || 0) + 1); };
    for (const t of tracks || []) {
        if (!t) continue;
        const artist = (t.artist || '').trim(), album = (t.album || '').trim(), label = (t.label || '').trim();
        bump(artists, artist); bump(labels, label);
        if (artist && album) {
            const key = `${artist}␞${album}`;
            const prev = albums.get(key);
            if (prev) prev.count += 1; else albums.set(key, { artist, album, count: 1 });
        }
        if (Array.isArray(t.tags) && t.tags.length) for (const tag of t.tags) bump(tags, tag);
        else if (t.comments) for (const tag of t.comments.split(',').map((s) => s.trim()).filter(Boolean)) bump(tags, tag);
    }
    return { artists, labels, tags, albums };
}

export function rankScore(name, needle) {
    needle = String(needle || '').toLowerCase();
    const n = String(name || '').toLowerCase();
    if (n === needle) return 0;
    if (n.startsWith(needle)) return 1;
    if (n.includes(needle)) return 2;
    return 3;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function search(index, query, { views = VIEW_ITEMS, gigs = [], crates = [], recents = [], releases = [], shortlistIds = new Set(), commands = [] } = {}) {
    recents = Array.isArray(recents) ? recents.filter((r) => r?.route && r.label) : [];
    const q = String(query || '').trim().toLowerCase();
    if (!q) {
        const seen = new Set(), out = [];
        for (const r of recents) {
            const key = buildRoute(r.route);
            if (seen.has(key) || out.length >= 8) continue;
            seen.add(key); out.push({ label: r.label, sub: '', source: 'Recent', route: r.route });
        }
        for (const v of views) out.push({ label: v.label, sub: '', source: 'Views', route: v.route });
        return out;
    }
    const out = [];
    for (const c of commands) if (rankScore(c.label, q) < 3) out.push({ label: c.label, sub: '', source: c.source || 'Player', run: c.run });
    for (const v of views) if (rankScore(v.label, q) < 3) out.push({ label: v.label, sub: '', source: 'Views', route: v.route });
    for (const g of gigs) if (rankScore(g.name, q) < 3) out.push(g.standalone ? { label: g.name, sub: '', source: 'Playlists', route: { view: 'playlists', kind: 'u', id: g.id } } : { label: g.name, sub: g.gigDate || '', source: 'Gigs', route: { view: 'gigs', id: g.id } });
    for (const c of crates) if (rankScore(c.name, q) < 3) out.push({ label: c.name, sub: '', source: 'Saved filters', route: { view: 'collection', filter: c.filterState } });
    const ents = [];
    const push = (source, label, count, route, sub) => { const s = rankScore(label, q); if (s < 3) ents.push({ label, sub: sub ?? plural(count, 'track'), source, route, _s: s, _c: count }); };
    for (const [name, count] of index?.artists || []) push('Artists', name, count, { view: 'artist', name });
    for (const [name, count] of index?.labels || []) push('Labels', name, count, { view: 'label', name });
    for (const [name, count] of index?.tags || []) push('Tags', name, count, { view: 'tag', name });
    for (const { artist, album, count } of (index?.albums || new Map()).values()) push('Albums', album, count, { view: 'album', name: album, artist }, artist);
    ents.sort((a, b) => a._s - b._s || b._c - a._c);
    for (const e of ents.slice(0, 8)) { delete e._s; delete e._c; out.push(e); }
    const cached = releases.filter(r => q.split(/\s+/).every(term =>
        `${r.title} ${r.artist || ''} ${r.label || ''} ${r.catno || ''}`.toLowerCase().includes(term),
    )).sort((a, b) => rankScore(a.title, q) - rankScore(b.title, q));
    const hits = cached.slice(0, 8).map(release => ({
        label: release.title,
        sub: [release.artist, release.label, release.catno, release.year,
            shortlistIds.has(String(release.id)) ? 'On Shortlist' : 'Add to Shortlist'].filter(Boolean).join(' · '),
        source: 'Cached releases · not in collection', release,
    }));
    return [...out.slice(0, 20 - hits.length), ...hits];
}

const ENTITY_TYPES = new Set(['artist', 'label', 'tag', 'album', 'track']);
/**
 * While a graph is open (a Collection tab's Graph, Discover › Graph), picking an entity
 * focuses it there, keeping the graph's ☆ and filter; anywhere else it opens
 * its page. `current` is the route you are on.
 */
export function routeForPick(entry, current) {
    const r = entry?.route;
    const graph = Boolean(current?.graph) || (current?.view === 'discover' && !current.tab);
    if (!graph || !ENTITY_TYPES.has(r?.view)) return r;
    const focus = exploreRouteFor({ type: r.view, name: r.name, artist: r.artist, id: r.id })?.focus;
    if (!focus) return r;
    const route = { view: current.view, focus };
    if (current.graph) route.graph = true;
    if (current.fav) route.fav = current.fav;
    if (current.filter) route.filter = current.filter;
    return route;
}

export function pushRecent(list, entry, max = 8) {
    const key = buildRoute(entry.route);
    const seen = new Set([key]);
    const rest = (Array.isArray(list) ? list : []).filter((e) => {
        if (!e?.route || !e.label) return false;
        const hash = buildRoute(e.route);
        if (seen.has(hash)) return false;
        seen.add(hash); return true;
    });
    return [entry, ...rest].slice(0, max);
}

/**
 * What the Go list searches, read once each time it opens: gigs and playlists, saved filters,
 * releases the server has cached (and this session's), the Shortlist, the player's and the gig
 * panel's commands, the index of the collection and the recent places. A source that fails
 * reads as empty; the views always answer.
 */
let cacheNoted = false;
export function readSources(app) {
    if (VIEWER) {
        return Promise.resolve({
            views: VIEWER_VIEW_ITEMS, gigs: [], crates: [], releases: [], shortlistIds: new Set(), commands: [],
            index: buildIndex(app._tracksCache || []), recents: app._readRecentPlaces?.() || [],
        });
    }
    return Promise.all([
        Promise.resolve().then(() => app.listGigsForGoList?.() ?? []).catch(() => []),
        Promise.resolve().then(() => app.crateManager?.list?.() ?? []).catch(() => []),
        app.hasBackend ? fetch('/api/discogs/cached-releases').then((r) => {
            if (!r.ok) throw new Error('Cached release search unavailable');
            return r.json();
        }).then((data) => data.releases || []).catch(() => {
            // Once a session: the list opens each time the field takes focus.
            if (!cacheNoted) app.showNotification?.('Could not load server cache; searching releases from this session.', 'info');
            cacheNoted = true;
            return [];
        }) : Promise.resolve([]),
        Promise.resolve().then(() => app.integrationManager?.database?.listShortlist() ?? []).catch(() => []),
    ]).then(([gigs, crates, releases, shortlist]) => ({
        gigs, crates, index: buildIndex(app._tracksCache || []),
        recents: app._readRecentPlaces?.() || [],
        releases: unownedCachedReleases([...releases, ...cachedGapReleases(app)], app._tracksCache || []),
        shortlistIds: new Set(shortlist.map((item) => String(item.id))),
        commands: [...(app.playerCommands?.() || []), ...(app.gigPanel?.commands?.() || [])],
    }));
}
