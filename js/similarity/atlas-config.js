// Atlas layout tuning. Kept out of the hashed similarity config on purpose:
// changing these never forces a neighbour rebuild. A change takes effect at the
// next full run.
export const ATLAS_DEFAULTS = Object.freeze({
  types: Object.freeze(['artist', 'label', 'tag']),
  neighbours: 8,        // top neighbours per atlas node that pull on it
  ticks: 300,           // fixed tick count: the same input always gives the same map
  warmAlpha: 0.25,      // starting heat when the previous run's positions seed the layout
  seed: 0x5eed,         // the simulation's random source (jiggle on coincident nodes)
  scoreQuantile: 0.9,   // the score scale: this quantile of the layout edges' scores reads as 1 (`scoreScale`); display only, stored scores never change
  linkDistance: 24,
  charge: -24,
  chargeDistanceMax: Infinity, // any cutoff piles nodes up at that distance from dense areas, in rings
  theta: 0.9,           // Barnes–Hut accuracy
  gravity: 0.015,       // a weak pull to the origin keeps separate components on the map
  aspect: 2.5,          // wider than tall, like the screen: x pulls by gravity / aspect, y by gravity × aspect
  baseRadius: 2,        // collision radius: baseRadius + radiusPerLog * log2(1 + tracks)
  radiusPerLog: 1.2,
  collideIterations: 1,
  velocityDecay: 0.4,
  weakDegree: 2,        // a node with 1 to this many layout links is placed beside its strongest neighbour after the ticks
  settleTicks: 20,      // collision-only ticks after that placement
  settleAlpha: 0.1,
  layoutVersion: 3,     // stored with each layout: a different one lays a full run out cold, once, when the relayout gate opens (layout-gate.js)
  timeoutMs: 90_000,    // budget in CPU time (sleep never counts; about 25 s at 7,300 nodes): past this the layout fails and the previous positions stay
  links: 8,             // per node in GET /api/atlas, deduplicated: the map's own links (rings, tugs, Random)
  crossLinks: 24,       // per node, the rest of its links up to this rank, in GET /api/atlas's crossLinks: the lines among a selection's shown nodes
  colourMinTracks: 10,  // a subgenre with fewer tracks takes its family's largest subgenre's colour
  colourK: 5,           // nearest subgenres kept in the colour plane's graph
  relayoutUnplaced: 25, // after an incremental run, this many artists, labels and tags with no position queue a full run (and layout)
});

// Discover › Graph: how much the main thread gathers per focus or anchor
// (server/lib/discover-candidates.js). How many show is the client's
// web/js/graph/atlas-config.js.
export const DISCOVER_DEFAULTS = Object.freeze({
  relationsPerSource: 24,   // aliases, members and groups, or sublabels and parent, per owned artist or label
  releasesPerSource: 24,    // not-owned releases per owned artist or label, newest first
  creditReleases: 40,       // owned releases read for credited artists
  creditedPerFocus: 24,     // credited artists with no tracks here
  stylesLookup: 30,         // fetched releases read for an outside artist's or label's styles
  candidatesMax: 120,       // per focus or anchor
  anchors: 8,               // no focus: the most recently starred artists, labels and tags
  perAnchorMax: 24,         // the most a client may ask for per anchor
});
