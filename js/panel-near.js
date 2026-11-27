// Near: the entity's neighbours as one line per kind (names, covers, track rows), with a switch per kind.

import { KIND_ORDER, itemColour } from './kind-glyph.js';
import { nameHtml, coverHtml, trackRowHtml, rowsHtml } from './info-items.js';
import { graphRouteFor, GRAPH_ICON } from './graph-tabs.js';
import { buildRoute } from './router.js';
import { escapeHtml as esc } from './html.js';
import { reasonWords } from './graph/reason-words.js';
import { visitorHides } from './viewer-profile.js';

export const NEAR_MAX = { artist: 6, label: 6, tag: 6, album: 4, track: 4 };
export const NEAR_LABELS = { artist: 'Artists', label: 'Labels', tag: 'Tags', album: 'Albums', track: 'Tracks' };

/**
 * Neighbours grouped by kind in KIND_ORDER. Within a kind, owned items first, then outside ones,
 * cut to NEAR_MAX. Each item gets `owned` and its index `i` in the flat list. Empty kinds are dropped.
 */
export function nearGroups(owned, outside = []) {
    let i = 0;
    return KIND_ORDER.map((type) => {
        const mine = (owned || []).filter((n) => n.type === type).map((n) => ({ ...n, owned: true }));
        const other = (outside || []).filter((n) => n.type === type).map((n) => ({ ...n, owned: false }));
        return { type, label: NEAR_LABELS[type], items: [...mine, ...other].slice(0, NEAR_MAX[type]).map((n) => ({ ...n, i: i++ })) };
    }).filter((g) => g.items.length);
}

/** Today's two links, Graph › and Discover ›, for `entity`; '' when `ports` is false. */
function portsHtml(entity, ports) {
    if (!ports) return '';
    const id = entity.id || `${entity.type}:${entity.name}`;
    return `<span class="near-ports"><a data-port="graph" href="${esc(buildRoute(graphRouteFor(id, entity.type)))}">Graph ›</a>${visitorHides('discover') ? '' : `<a data-port="discover" href="${esc(buildRoute({ view: 'discover', focus: id }))}">Discover ›</a>`}</span>`;
}

/** Near's map under its heading: the map box (holding the ports) and its why-line. '' without a map. */
export function nearMapHtml(map, { entity, ports = true } = {}) {
    if (!map) return '';
    return `<div class="near-top" data-near-top><div class="near-map">${map}${portsHtml(entity, ports)}</div><div class="near-why" data-near-why></div></div>`;
}

/**
 * Near's lines, one per kind. `map` is the map's SVG when it is open (it sits under the heading,
 * holding the ports); `mapSwitch` is null for no Map switch, else whether the map is open.
 */
export function nearHtml(groups, { entity, ports = true, off = new Set(), colourOf = () => null, coverOf = () => '', trackOf = () => null, map = '', mapSwitch = null } = {}) {
    if (!groups?.length) return '';
    const kinds = groups.length > 1
        ? groups.map((g) => `<button type="button" data-near-kind="${g.type}" class="${off.has(g.type) ? 'off' : 'on'}">${g.label}</button>`).join('')
        : '';
    const mapButton = mapSwitch == null ? '' : `<button type="button" class="near-map-switch" data-near-map-switch aria-pressed="${mapSwitch ? 'true' : 'false'}" aria-label="Map" title="${mapSwitch ? 'Hide the map' : 'Show the map'}">${GRAPH_ICON}</button>`;
    const switches = kinds || mapButton ? `<span class="near-kinds">${kinds}${mapButton}</span>` : '';
    const attrsOf = (n) => (n.owned
        ? `data-sim-entity="${esc(n.id)}" data-type="${esc(n.type)}" data-name="${esc(n.name)}" data-near-i="${n.i}"`
        : `data-near-outside="${esc(n.id)}" data-type="${esc(n.type)}" data-name="${esc(n.name)}" data-near-i="${n.i}"`);
    const body = (g) => {
        if (g.type === 'track') {
            const rows = g.items.map((n) => {
                const row = trackOf(n);
                return row ? trackRowHtml({ ...row, colour: colourOf(n), owned: n.owned, attrs: `data-near-i="${n.i}"` }) : '';
            }).filter(Boolean);
            return rows.length ? rowsHtml(rows) : '';
        }
        if (g.type === 'album') {
            return `<span class="near-covers">${g.items.map((n) => coverHtml({ id: n.id, name: n.name, src: coverOf(n), colour: colourOf(n), owned: n.owned, attrs: attrsOf(n) })).join('')}</span>`;
        }
        return `<span class="near-names">${g.items.map((n) => nameHtml({ id: n.id, type: n.type, name: n.name, colour: colourOf(n), owned: n.owned, attrs: attrsOf(n) })).join('')}</span>`;
    };
    const lines = groups.map((g) => `<div class="near-line" data-near-line="${g.type}"${off.has(g.type) ? ' hidden' : ''}><span class="k">${g.label}</span>${body(g)}</div>`).join('');
    return `<section class="dp-section near" data-near><h4>Near${switches}</h4>${nearMapHtml(map, { entity, ports })}${lines}${map ? '' : portsHtml(entity, ports)}</section>`;
}

/** The owned atlas node nearest an outside node: the first of its `near` that isn't a tag, else the closest by position. */
function nearestOwned(atlas, n, x, y) {
    for (const id of n.near || []) { const o = atlas.byId.get(id); if (o && o.type !== 'tag') return o; }
    let best = null, bestD = Infinity;
    for (const o of atlas.nodes || []) {
        if (o.type === 'tag') continue;
        const d = (o.x - x) ** 2 + (o.y - y) ** 2;
        if (d < bestD) { best = o; bestD = d; }
    }
    return best;
}

/**
 * Discover's music you don't own, for Near: the live layer's ring nodes, closest first, where the
 * layer settled them, in the colour of the owned node nearest each (as the graph's outlines).
 * Only when Info shows the Discover graph's own focus; otherwise []. Releases join Albums.
 */
export function outsideForNear(view, entityId) {
    const layer = view?.layer, atlas = view?.atlas;
    if (!view?.discover || !layer || !atlas?.byId || !entityId || view.focus?.id !== entityId) return [];
    return [...(layer.nodes || [])]
        .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
        .map((n) => {
            const x = Number.isFinite(n.px) ? n.px : n.x, y = Number.isFinite(n.py) ? n.py : n.y;
            const near = nearestOwned(atlas, n, x, y);
            return {
                id: n.id, type: n.type === 'release' ? 'album' : n.type, name: n.name, owned: false, x, y,
                score: n.score, reasons: n.reasons || [], colour: near ? itemColour(atlas, near.id) : null,
            };
        })
        .filter((n) => n.name && NEAR_MAX[n.type]);
}

/** The why-line for one item: its name, then its two strongest reasons in plain words. */
export function whyLine(item) {
    if (!item) return '';
    const words = [...(item.reasons || [])].sort((a, b) => (b?.s ?? 0) - (a?.s ?? 0)).map(reasonWords).filter(Boolean).slice(0, 2);
    return [`<b>${esc(item.name)}</b>`, ...words.map(esc)].join(' · ');
}

/**
 * The twin hover between Near's list and its map. Hovering or focusing an item (in either) marks
 * both twins `.hot`, fades the rest of the map and fills the why-line; a click on a mark clicks
 * its list twin. `section` holds both (Near's section: the map under its heading, then the list).
 * `items` is the flat list, by `i`. Returns `setOff`, which fades an off kind's marks.
 */
export function wireNear(section, { items = [], off = null } = {}) {
    const map = section?.querySelector('.near-map');
    const why = section?.querySelector('[data-near-why]');
    const byI = new Map(items.map((it) => [String(it.i), it]));
    const twins = (i) => section.querySelectorAll(`[data-near-i="${i}"]`);
    const listTwin = (i) => [...twins(i)].find((el) => !map?.contains(el));
    let hot = null;
    const show = (i) => {
        if (hot === i) return;
        if (hot != null) twins(hot).forEach((el) => el.classList.remove('hot'));
        hot = i;
        if (i != null) twins(i).forEach((el) => el.classList.add('hot'));
        map?.classList.toggle('has-hot', i != null);
        if (why) why.innerHTML = i == null ? '' : whyLine(byI.get(i));
    };
    const ui = {
        setOff(set) {
            map?.querySelectorAll('[data-type]').forEach((el) => el.classList.toggle('off', Boolean(set?.has(el.dataset.type))));
        },
    };
    if (!section) return ui;
    for (const el of section.querySelectorAll('[data-near-i]:not(.near-arc)')) {
        const i = el.dataset.nearI;
        el.addEventListener('pointerenter', () => show(i));
        el.addEventListener('focusin', () => show(i));
        el.addEventListener('pointerleave', () => { if (hot === i) show(null); });
        el.addEventListener('focusout', () => { if (hot === i) show(null); });
        el.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') show(i); });
    }
    map?.addEventListener('click', (e) => {
        const mark = e.target.closest?.('.near-mark[data-near-i]');
        if (mark) listTwin(mark.dataset.nearI)?.click();
    });
    if (off) ui.setOff(off);
    return ui;
}
