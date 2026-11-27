// Every visual number of the atlas, in one place. Tuning is a one-line change.
// Server layout constants live in web/js/similarity/atlas-config.js.
import { phoneAtlas } from '../phone.js';

// On a phone the marks, names, tap reach and insets are larger (phoneAtlas).
export const ATLAS = Object.freeze(phoneAtlas({
    // + and −: the step layouts, worked out on the server (web/js/similarity/atlas-steps.js)
    steps: Object.freeze([300, 800, 2000, 4000]), // nodes shown per step, most-linked first; the last step is all of them
    openAt: 0.5,             // the graph and a new selection open this far along their steps: the middle one
    selectDepth: Object.freeze([Object.freeze([8]), Object.freeze([8, 4]), Object.freeze([8, 4, 3])]), // with a selection: neighbours per ring at each step
    refW: 1440,              // the reference window whose whole-map view sizes the step layouts…
    refH: 900,
    refFit: 0.92,            // …filled to this share
    stepPad: 1.25,           // px added to each node's reach at the reference view: 2.5 px between neighbours' edges
    stepTicks: 120,          // per step: ticks of a pull to the map spot…
    stepPull: 0.03,
    stepCollide: 0.6,        // …and collision…
    stepCollideIterations: 2,
    stepKeep: 0.55,          // …velocity kept per tick
    stepHardPasses: 12,      // then collision alone, so nothing touches
    stepHardIterations: 4,
    // colour
    chroma: 0.6,             // oklch chroma = 0.16 × this × (0.55 + 0.45 × share)
    markAlpha: 0.92,
    // motion
    inMs: 420,               // new nodes grow in…
    outMs: 300,              // …leaving ones fade…
    waveMs: 160,             // …staggered by up to this from the middle of the view outward
    moveMs: 520,             // a node whose spot changes takes one ease (ease-out cubic)
    selectMs: 500,           // the rest dims, and arcs draw out, over this long
    tug: 0.6,                // a dragged node's strongest links follow by this share of the pull…
    tugN: 10,                // …this many of them…
    tugPull: 0.06,           // …each node pulled home (plus its tug) by this share a frame…
    tugKeep: 0.74,           // …keeping this share of its speed…
    tugIterations: 2,        // …and pushed apart this many times a frame
    tugInMs: 250,            // their faint arcs fade in…
    tugOutMs: 400,           // …and out after letting go
    maxStepPx: 5,            // nodes making room for a drag move at most this far a frame
    // names
    namesAtFit: 30,          // names at the whole-map view, heaviest first (a phone, half)…
    namesZoomMax: 6,         // …× zoom, up to this
    markScale: 1,            // every mark's radius × this (1.3 on a phone)
    // By tier: the selection, then its first ring with the hovered and pulled nodes and the
    // home's anchors, then the rest (in --text-dim). A name's text box is its size tall…
    nameSizes: Object.freeze([12, 11, 10]),
    nameWeights: Object.freeze([500, 500, 400]),
    namePad: 3,              // …and keeps this many px from other names and the controls (and, where it can, from shapes)
    nameGap: 4,              // px between its own node (or ring) and its text
    nameHalo: 3,             // px: the outline in the ground's colour drawn behind each name's glyphs
    nameAlpha: 1,            // the rest's alpha (in --text-dim); while something is selected, the faded ones take liftFade
    // albums round a selected artist or label
    albumZoom: 3,
    albumsMax: 14,
    albumGap: 2,             // px between album dots
    // the edge of the map dissolves
    rim: Object.freeze([0.55, 1]), // smoothstep of a node's distance from the centre, against the half-extent
    rimFade: 0.75,           // alpha × (1 − this × rim) at the whole map…
    rimGone: 2.2,            // …easing to no fade by this zoom
    rimNames: 1.6,           // names of nodes with rim > 0.5 are left out below this zoom
    growMax: 3.5,            // above the whole map a node grows by √zoom, up to this
    // mixed curls (curveOf): every arc is a cubic bending away from the middle of the shown
    // subgraph, each link its own depth from a hash of its ends…
    curlMin: 0.08,           // …curlMin + curlSpan × h of its length…
    curlSpan: 0.34,
    sRate: 0.2,              // …and about this share a gentle S…
    sMin: 0.14,              // …offset ±(sMin + sSpan × h) × its length at 1/3 and 2/3
    sSpan: 0.1,
    curlProbe: 0.2,          // which way is outward: the side whose point this × the length out is farther from the middle
    arcEndGap: 1.5,          // px between an arc's end and the shape (or selection ring) it meets
    arcMinPx: 2,             // an arc shorter than this once trimmed is not drawn
    selectRing: 4,           // px from a selection's edge to its 1 px ring
    litMax: 300,             // lit nodes beyond the step: the heaviest this many
    // camera
    zoomMin: 1,              // zoom never goes below the whole map (× its fit scale)…
    zoomMax: 40,             // …nor above this
    fitZoomMax: 4,           // the closest a fit of the home or lit set comes, × the whole-map fit
    fitMargin: 0.04,         // share of the viewport left around the fitted atlas
    fitInsetTop: 44,         // px kept clear above the fitted atlas (the controls)…
    fitInsetBottom: 16,      // …and below it, so it never meets the player
    // motion (atlas-motion.js)
    easeMs: 700,             // every programmatic camera move (select, whole map, Random, − and +)…
    easePower: 3,            // …on one ease in-out of this power
    // the camera follows a selection (select, and + and − with one): it fits the selection and
    // every shown ring node, each grown by followReach × its whole-map radius…
    followReach: 3,
    followMarginX: 110,      // …with this many px kept at each side for names…
    followMarginY: 100,      // …and at the top and bottom…
    followZoomMax: 8,        // …between the whole map and this × it
    zoomStep: 1.6,           // − and + (and the - = + keys) glide by this about the view's centre…
    zoomHoldMs: 300,         // …held this long, they keep zooming…
    zoomHoldRate: 1.2,       // …at this many e-folds of zoom a second…
    zoomHoldEaseMs: 160,     // …easing into and out of that speed over about this long
    wheelStep: 1.0016,       // zoom per wheel delta unit…
    pinchStep: 1.01,         // …and per unit of a trackpad pinch (a ctrl-wheel, whose deltas are small)…
    pinchMaxStep: 1.25,      // …at most this much in or out per event
    wheelEaseMs: 90,         // …eased toward over about this long, about the cursor
    wheelGestureMs: 200,     // wheel events this close together are one gesture: a trackpad scroll keeps panning, a wheel keeps zooming
    inertiaMs: 325,          // a flung pan's speed decays by e over this long…
    inertiaSampleMs: 80,     // …measured over the last this many ms of the drag…
    inertiaIdleMs: 50,       // …none when the pointer rested this long before release…
    inertiaMinSpeed: 0.1,    // …or moved slower than this (px/ms)
    inertiaStop: 0.02,       // px/ms at which a coasting pan stops
    dragThreshold: 4,        // px a press moves before it is a drag, not a click
    dblClickMs: 300,         // a second click this soon…
    dblClickPx: 12,          // …and this close is a double-click: it zooms in (⇧ or ⌥ out)…
    dblZoom: 2,              // …by this about the pointer; on a node, centred on it, at least albumZoom
    closeZoom: 5,            // re-centre's last stop: Info's node at this × the whole-map fit
    // marks: colour, oklch(L, C, subgenre hue)
    markL: 0.6,              // lightness of a near mark on Light…
    markLNight: 0.72,        // …and on Night sky…
    chromaNight: 1.7,        // …where chroma is this × more (each colour fitted to sRGB, keeping its L and hue)
    // nodes
    dim: 0.55,               // what ☆, the filter, search or the home leaves out (alpha)
    // a selection lifts: it and its shown ring nodes come forward, over 500 ms (selectMs)…
    liftScale: 1.3,          // …drawn on top at this × their radius…
    liftDeepL: 0.08,         // …in a deeper colour: oklch L − this…
    liftDeepC: 1.4,          // …chroma × this, the same hue…
    liftHairline: 1.6,       // …each on a hairline of the ground this many px wide…
    liftFade: 0.75,          // …while everything else (nodes and names) takes this × its usual alpha
    ringLineWidth: Object.freeze([1.3, 0.85]), // a selection's lines, px: the first ring, deeper…
    ringLineAlpha: Object.freeze([0.9, 0.55]), // …at these alphas, in the far node's deep colour…
    lineCasing: 2.4,         // …each on a casing in the ground's colour this many px wider…
    lineCasingAlpha: 0.85,   // …at this alpha
    crossLineWidth: 0.85,    // the other links among the shown nodes (ring.cross), px: the deeper rings' width…
    crossLineAlpha: 0.3,     // …fainter than any ring line and uncased, so the first ring still reads as a ring
    hoverLineWidth: 1.3,     // the hovered node's links to the shown nodes, brought forward: the first ring's look
    hoverLineAlpha: 0.9,
    sharedScale: 1.25,       // a shared node (two ring nodes bring it in): × its lifted radius, one step larger
    peekRingWidth: 1,        // px: the peeked node's ring, in its own colour, selectRing out from its edge
    // make room: when a selection settles, what sits on its lines, lifted nodes or their names steps aside…
    roomClearPx: 9,          // …this many px clear, at the selection's view scale (its follow camera)…
    roomMaxPx: 34,           // …never more than this from its own spot…
    roomPasses: 3,           // …over this many passes, each followed by the push-apart
    // a selection's neighbourhood at each ring depth (+ and −): what the focus payload and Discover gather
    hoodSteps: Object.freeze([
        Object.freeze({ neighbours: 8, satellites: 8, outside: 4 }),
        Object.freeze({ neighbours: 16, satellites: 12, outside: 6 }),
        Object.freeze({ neighbours: 24, satellites: 24, outside: 8 }),
    ]),
    homeNeighbours: 8,       // the Favorites home: neighbours per anchor
    litBright: 48,           // a lit set with no focus: its heaviest this many
    anchorRing: 3,           // px between a favorite anchor and its 1 px ring
    // the playing artist's ring
    playingRingGap: 3,       // px between the mark and its ring
    playingRingWidth: 1,
    playingPulseMs: 2000,    // one pulse, faint to strong and back
    playingAlphaMin: 0.35,
    playingAlphaMax: 0.9,
    playingAlphaStill: 0.7,  // under prefers-reduced-motion
    ringHitInner: 2,         // a click from r + inner to r + outer px is the ring (the playing track)
    ringHitOuter: 8,
    // names (level of detail)
    labelMaxChars: 24,       // a longer name is cut with an ellipsis on the map (the hovered one and Info keep it whole)
    // hit-testing
    hitPad: 5,               // px around a node that still counts as on it
    hitMinPx: 6,             // a mark smaller than this counts as this big
    // Discover: music you don't own
    discoverDim: 0.35,       // owned atlas nodes in Discover mode
    discoverNearAlpha: 0.7,  // owned nodes an outside node sits near
    discoverPerAnchor: 6,    // no focus: outside nodes around each recent favorite
    outsideMax: 48,          // with a focus: outside nodes on rings
    outsideSatellites: 8,    // a focused artist's or label's not-owned releases as outline satellites
    outsideRingMin: 0.012,   // ring radius for a shown score (shownScore) of 1, share of the atlas extent's longer side…
    outsideRingMax: 0.05,    // …and for a score of 0
    outsideArcOpacity: 0.3,  // the arc from an outside node to what it sits near
    sourcesPollMs: 6000,     // while Bandcamp or MusicBrainz loads for the focus, refetch this often
    discogsRefreshMs: 600,   // job-done events within this window refetch once
    // the visualizer (atlas-visualizer.js): its journeys are counted in beats of the playing track
    vizBpm: 120,             // the pace with nothing playing or no BPM on the track…
    vizBpmMin: 70,           // …and a stored BPM outside this range is doubled or halved into it
    vizBpmMax: 180,
    vizGlideBeats: 4,        // a glide out to the whole network, or in close…
    vizWideBeats: 8,         // …the whole network held, drifting in by vizWideGrow…
    vizWideGrow: 0.07,
    vizRestBeats: 4,         // …a node up close held, drifting in by vizRestGrow
    vizRestGrow: 0.1,
    vizSway: 26,             // px a held view sways, there and back
    vizCloseOver: 2.6,       // up close is this × the whole network's zoom (at least closeZoom)
    vizHomeEvery: 3,         // Home: back to the whole network every this many branches…
    vizLeanBeats: 6,         // …leaning to a branch over this long, light running out along it…
    vizBranchBeats: 8,       // …then held, drifting in by vizBranchGrow
    vizBranchGrow: 0.08,
    vizBackAlpha: 0.4,       // the branches the camera is not leaning to, over vizBackMs
    vizBackMs: 400,
    vizWanderEvery: 4,       // Wander: back to the whole network every this many lines…
    vizTravelBeats: 8,       // …riding a line over this long…
    vizTravelDip: 0.45,      // …pulling back by this share of the zoom midway
    vizGlowWidth: 1.1,       // px a lit line gains…
    vizHeadR: 3.2,           // …and Wander's dot at its head, px
    vizPulseDecay: 3.5,      // the beat's pulse falls off by e^(−this × the beat's phase)
    vizHomeRing: 3.5,        // the selection's beat ring, px outside its own…
    vizRipple: 30,           // …and the ripple out of it over one beat, px
    vizScaleMax: 1,          // the effects layer's pixels per CSS px, at most
    vizHueEaseMs: 1200,      // Wash's tint eases to the node the camera heads for
    vizIdleMs: 2600,         // the bar fades after the pointer rests this long
    pollMs: 2000,
}));
