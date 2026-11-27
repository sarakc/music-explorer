// Discover › Graph: music you don't own on the atlas. Pure: where outside nodes
// sit, which of a focus's not-owned releases become outline satellites, which
// owned nodes stay bright, and the Discogs line. No DOM.
import { ATLAS } from './atlas-config.js';
import { hash01, shownScore, scoreScale } from './atlas-geometry.js';
import { VIEWER, visitorHides } from '../viewer-profile.js';
import { pushApart } from './atlas-settle.js';

/**
 * Each outside node on a ring around the mean of its `near` positions (the
 * focus or anchor when none is on the atlas; `centre` for every node around an
 * outside focus), closer for higher scores (read against the list's own score scale,
 * `scoreScale` and `shownScore`, as `close`; an owned score reads against the atlas's), at an angle from a hash of its id so outlines fan out
 * instead of stacking.
 * Radii are shares of the atlas extent's longer side. Nodes with nowhere to
 * go are left out. → [{ ...node, x, y, cx, cy, angle, r }] (world units)
 */
export function placeOutside(nodes, atlas, { fallback = null, centre: fixed = null, centres = new Map(), cfg = ATLAS, scale = null } = {}) {
    // Outside scores read against their own list's scale (`scoreScale`), not the owned atlas's.
    scale ??= scoreScale((nodes || []).map((n) => Math.min(1, Math.max(0, Number(n.score) || 0))));
    const span = Math.max(atlas.extent.w, atlas.extent.h);
    const out = [];
    for (const n of nodes || []) {
        const placed = fixed ? [] : (n.near || []).map((id) => atlas.byId.get(id)).filter(Boolean);
        const centre = fixed || (placed.length
            ? { x: placed.reduce((s, p) => s + p.x, 0) / placed.length, y: placed.reduce((s, p) => s + p.y, 0) / placed.length }
            : centres.get(n.anchor) || fallback);
        if (!centre) continue;
        const score = Math.min(1, Math.max(0, Number(n.score) || 0)), close = shownScore(score, scale);
        const r = span * (cfg.outsideRingMin + (1 - close) * (cfg.outsideRingMax - cfg.outsideRingMin));
        const a = hash01(n.id) * Math.PI * 2;
        out.push({ ...n, x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r, cx: centre.x, cy: centre.y, angle: a, r, score, close });
    }
    return out;
}

/**
 * Outside nodes (radius `r`) placed among owned ones ({ x, y, r }, never moved) so none
 * overlaps either: pushed apart from where they want to sit, and any left touching then
 * takes the nearest free spot on a spiral round it. → [{ x, y }], in the input's order.
 */
export function placeAmong(outside, owned, r) {
    const items = (outside || []).map((p, i) => ({ i, x: p.x, y: p.y, r }));
    const walls = (owned || []).map((o, i) => ({ i: -1 - i, x: o.x, y: o.y, r: o.r }));
    const local = walls.filter((w) => items.some((p) => Math.abs(w.x - p.x) < w.r + 60 * r && Math.abs(w.y - p.y) < w.r + 60 * r));
    pushApart([...local, ...items], new Set(items), { iterations: 120, fixed: new Set(local) });
    const clear = (p, x, y) => local.every((w) => Math.hypot(w.x - x, w.y - y) >= w.r + r - 1e-9)
        && items.every((q) => q === p || q.i > p.i || Math.hypot(q.x - x, q.y - y) >= 2 * r - 1e-9);
    for (const p of items) {
        if (clear(p, p.x, p.y)) continue;
        for (let k = 1; k < 4000; k++) {
            const a = k * 2.39996, d = r * 0.5 * Math.sqrt(k), x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
            if (clear(p, x, y)) { p.x = x; p.y = y; break; }
        }
    }
    return items.map((p) => ({ x: p.x, y: p.y }));
}

/**
 * A focus's outside list split: its own not-owned releases (an artist's or
 * label's) become outline satellites, the rest go on rings. With a focus, the
 * best `max`; with anchors, each anchor's list is already capped by the server.
 */
export function splitOutside(outside, focus, { max = ATLAS.outsideMax, satellites = ATLAS.outsideSatellites } = {}) {
    const own = focus && (focus.type === 'artist' || focus.type === 'label');
    const sats = [], ring = [];
    for (const n of outside || []) {
        if (own && n.type === 'release' && n.source === focus.id) { if (sats.length < satellites) sats.push(n); }
        else if (ring.length < max) ring.push(n);
    }
    return { satellites: sats, ring };
}

/**
 * The owned atlas nodes that stay bright in Discover: the focus or anchors,
 * `lit` (what an outside focus shares a Discogs fact with), and what outside
 * nodes sit near.
 */
export function brightIds({ focusId = null, hostId = null, anchors = [], outside = [], lit = [] } = {}) {
    const ids = new Set([focusId, hostId, ...anchors.map((a) => a.id), ...lit].filter(Boolean));
    const near = new Set();
    for (const n of outside) for (const id of n.near || []) if (!ids.has(id)) near.add(id);
    return { lit: ids, near };
}

/**
 * The bottom-left line: { text, href? } or null.
 *   disconnected  "Connect Discogs to see what you're missing", to Settings
 *   paused        "Discogs: paused"
 *   loading       "Discogs: loading…" while cached data is still missing, or while a
 *                 discography is fetched again after a Dig (then the focus refetches)
 */
export function discogsLine(discogs) {
    if (!discogs || visitorHides('discover')) return null;
    if (VIEWER && ['disconnected', 'paused'].includes(discogs.state)) return { text: 'Discogs: snapshot' };
    if (VIEWER && ((discogs.missing || []).length || (discogs.refreshing || []).length)) return { text: 'Discogs: snapshot' };
    if (discogs.state === 'disconnected') return { text: 'Connect Discogs to see what you’re missing', href: '#/settings' };
    if (discogs.state === 'paused') return { text: 'Discogs: paused' };
    if ((discogs.missing || []).length) return { text: 'Discogs: loading…' };
    if ((discogs.refreshing || []).length) return { text: 'Discogs: loading…', loading: true };
    return null;
}

/**
 * Where an artist or label you don't own sits as the focus: where its outline
 * was when clicked, else the mean of the owned nodes it is near, else where the
 * previous focus was. Null with none of them.
 */
export function outsideFocusPosition(atlas, { clicked = null, neighbours = [], previous = null } = {}) {
    if (clicked && Number.isFinite(clicked.x) && Number.isFinite(clicked.y)) return { x: clicked.x, y: clicked.y, unplaced: false };
    const placed = (neighbours || []).map((n) => atlas.byId.get(n.id)).filter(Boolean);
    if (placed.length) return { x: placed.reduce((s, n) => s + n.x, 0) / placed.length, y: placed.reduce((s, n) => s + n.y, 0) / placed.length, unplaced: false };
    if (previous && Number.isFinite(previous.x)) return { x: previous.x, y: previous.y, unplaced: false };
    return null;
}

const SOURCE_NAMES = { bandcamp: 'Bandcamp', musicbrainz: 'MusicBrainz' };

export const NOTHING_NEAR = 'Nothing outside your library near this yet.';

/**
 * The bottom-left line as parts, one per source working on the focus:
 * [{ text, href?, retry? }] (joined with " · "), or null.
 *   Discogs      as discogsLine
 *   loading      "Bandcamp: loading…"
 *   paused       "Bandcamp: checking later"
 *   failed       "Bandcamp couldn't be checked — retry" (`retry`: the source)
 * Nothing found and every source done: "Nothing outside your library near this yet."
 */
export function sourcesLine({ discogs = null, sources = {}, outside = [] } = {}) {
    if (visitorHides('discover')) return null;
    const parts = [];
    const d = discogsLine(discogs);
    if (d) parts.push(d);
    for (const [key, name] of Object.entries(SOURCE_NAMES)) {
        const state = sources?.[key]?.state;
        if (VIEWER && ['loading', 'paused', 'failed'].includes(state)) { parts.push({ text: `${name}: snapshot` }); continue; }
        if (state === 'loading') parts.push({ text: `${name}: loading…`, loading: true });
        else if (state === 'paused') parts.push({ text: `${name}: checking later` });
        else if (state === 'failed') parts.push({ text: `${name} couldn’t be checked — retry`, retry: key });
    }
    if (!parts.length && discogs && !(outside || []).length) parts.push({ text: NOTHING_NEAR });
    return parts.length ? parts : null;
}

/** Is any source still fetching for the focus (the graph refetches while one is)? */
export const sourcesLoading = (parts) => (parts || []).some((p) => p.loading);

/** No favorites to gather around: no halo, no outside nodes, and this line. */
export const anchorsNote = (anchors) => ((anchors || []).length ? null : VIEWER ? 'No favorite anchors in the snapshot.' : 'Star an artist or label to start.');

/** A release node as the release panel (panel-release.js) takes it. */
export function releaseFromNode(n) {
    return {
        key: n.id, title: n.title || n.name, artist: n.artist || '', label: n.label || '', year: n.year || null,
        ...(n.format ? { format: n.format } : {}), ...(n.cover ? { cover: n.cover } : {}),
        ...(n.discogsReleaseId ? { discogsReleaseId: n.discogsReleaseId } : {}), sources: n.sources || [],
    };
}
