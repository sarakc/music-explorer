// Which views carry a filter, and what each one's header shows. Pure, no
// imports: the router, the header builders and the app's wiring all read this
// one table, so giving a view the Filter band is one entry here plus a call to
// `app._renderCollectionHeader(view, …)` from the view.
//
//   scope        the filter state the view uses; views with the same scope share it
//   header       draws the tab controls, the Filter band and the filter line
//   narrow       typed text in the search field narrows the view (the field shows on every view;
//                elsewhere it offers the Go list only)
//   listen       shows ♪ Listen in the search field
//   star         shows ☆ in the tab controls
//   menu         shows the ⋯ menu
//   pinned       the band's Saved row offers the built-in Exploreme filter
//   routeFilter  the route carries the filter (`f`)
//   routeFav     the route carries ☆ (`fav`)
//   onlyTab      a view with `?tab=`: the header, `f` and `fav` belong to this tab alone (its first, so no `tab` too)

const COLLECTION = { scope: 'collection', header: true, narrow: true, listen: true, star: true, menu: true, pinned: true, routeFilter: true, routeFav: true };
const GRAPH = { scope: 'graph', header: true, narrow: true, listen: false, star: true, menu: false, pinned: false, routeFilter: true, routeFav: true };

export const HEADER_PROFILES = {
    collection: COLLECTION, artists: COLLECTION, albums: COLLECTION, labels: COLLECTION, tags: COLLECTION,
    playlists: { ...COLLECTION, routeFav: false },
    // Exploreme has no route of its own: its filter and ☆ live for the session.
    exploreme: { ...COLLECTION, scope: 'exploreme', routeFilter: false, routeFav: false },
    // Discover › Graph: ☆ and the Filter band light nodes. A Collection tab's Graph view uses the tab's own filter.
    discover: { ...GRAPH, onlyTab: 'graph' },
    charts: { scope: 'charts', header: false, narrow: false, listen: false, star: false, menu: false, pinned: false, routeFilter: true, routeFav: false },
};

// The viewer's band: no Listen, no saved filters or rules (both need state it does not
// serve), and no Source, which the snapshot's tracks do not carry. Typed text still narrows its graph.
const VIEWER_BAND = { listen: false, star: false, menu: false, pinned: false, saved: false, rules: false, hiddenControls: ['sources'] };

/** A view's profile, or null when it has no filter. Viewer mode keeps the graph header but removes acting chrome. */
export const headerProfile = (view, { viewer = false } = {}) => {
    const profile = Object.hasOwn(HEADER_PROFILES, view) ? HEADER_PROFILES[view] : null;
    return profile && viewer ? { ...profile, ...VIEWER_BAND } : profile;
};
/** The filter scope a view uses; a view without a profile is its own scope. */
export const scopeFor = (view) => headerProfile(view)?.scope || view;
export const hasHeader = (view) => !!headerProfile(view)?.header;
/** Does typed text narrow this route's view? A view with `onlyTab` narrows on that tab alone. */
export function narrows(route) {
    const profile = headerProfile(route?.view);
    return !!profile?.narrow && (!profile.onlyTab || !route.tab || route.tab === profile.onlyTab);
}
/** Views with `flag` set, in declared order. */
export const viewsWith = (flag) => Object.keys(HEADER_PROFILES).filter((view) => HEADER_PROFILES[view][flag]);
/** Does this route carry `flag` (`routeFilter` or `routeFav`)? A view with `onlyTab` carries it on that tab alone. */
export function routeCarries(route, flag) {
    const profile = headerProfile(route?.view);
    return !!profile?.[flag] && (!profile.onlyTab || !route.tab || route.tab === profile.onlyTab);
}
