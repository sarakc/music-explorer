// How the facts from GET /api/facts show on artist, label, album and track pages and in Info
// (graph signals spec › Showing it): one facts chip, a Connections card, a Commons photo
// when there is no image, and Wikipedia in the site row.
//
// Nothing empty is drawn: a chip, a chip half, a row, the card, the photo or the link shows
// only when it has content, and a failed or unchecked lookup shows nothing at all. The
// builders below are pure; `loadFacts` fetches once per entity per session; `mountPageFacts`
// and `mountInfoFacts` put the pieces into a drawn page or Info view.
import { escapeHtml as esc } from './html.js';
import { entityId } from './credits-graph.js';
import { addWikipediaLink } from './site-links.js';
import { VIEWER, visitorHides } from './viewer-profile.js';

export const ROW_MAX = 8;
const SOURCE = { library: 'Library', discogs: 'Discogs', musicbrainz: 'MusicBrainz', wikidata: 'Wikidata', infobox: 'Wikipedia', category: 'Wikipedia', wikipedia: 'Wikipedia' };
export const sourceName = (source) => SOURCE[source] || '';

/** [key, label] in the card's order. */
export const CONNECTION_ROWS = [
    ['aliases', 'Aliases'], ['samples', 'Samples'], ['sampledBy', 'Sampled by'], ['covers', 'Covers'], ['coveredBy', 'Covered by'],
    ['members', 'Members'], ['memberOf', 'Member of'], ['founder', 'Founded by'], ['producers', 'Producers'], ['studio', 'Studio'],
];
const WORKS = new Set(['samples', 'sampledBy', 'covers', 'coveredBy']);

const list = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const text = (v) => String(v ?? '').trim();

// ---- the facts chip ----

/** The place shown: its city, else its region, else its country. */
export const placeShown = (p) => text(p?.name) || text(p?.region) || text(p?.country);

/** The whole place, small to large, without repeats: "Leeds, England, United Kingdom". */
export function placeFull(p) {
    const seen = new Set();
    return [p?.name, p?.region, p?.country].map(text).filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase())).join(', ');
}

/** 1994–2003, `since 2014` while active, one year when begin and end match; nothing without a start. */
export function yearsText(begin, end) {
    const b = text(begin), e = text(end);
    if (!b) return '';
    if (!e) return `since ${b}`;
    return e === b ? b : `${b}–${e}`;
}

/** { text, title } for an artist or label, or null when there is no place and no years. */
export function factsChip(type, facts) {
    if (!facts || (type !== 'artist' && type !== 'label')) return null;
    const place = facts.place?.value, shown = placeShown(place);
    let years = '', yearSources = [];
    if (type === 'artist') {
        years = yearsText(facts.active?.value?.begin, facts.active?.value?.end);
        if (years) yearSources = [facts.active.source];
    } else {
        years = yearsText(facts.founded?.value, facts.dissolved?.value);
        if (years) yearSources = [facts.founded.source, facts.dissolved?.value ? facts.dissolved.source : null];
    }
    const parts = [shown, years].filter(Boolean);
    if (!parts.length) return null;
    const placeSource = shown ? sourceName(facts.place.source) : '';
    const ySources = [...new Set(yearSources.filter(Boolean).map(sourceName).filter(Boolean))];
    const title = [];
    if (shown) title.push([placeFull(place), placeSource].filter(Boolean).join(' · '));
    if (years && (!shown || ySources.join() !== placeSource)) title.push([years, ySources.join(', ')].filter(Boolean).join(' · '));
    return { text: parts.join(' · '), title: title.join(' · ') };
}

export const chipHtml = (chip, cls = 'op-chip') => (chip ? `<span class="${cls}" data-facts-chip title="${esc(chip.title)}">${esc(chip.text)}</span>` : '');

// ---- Connections ----

const typeOfId = (id) => String(id ?? '').split(':')[0];
const nameOfId = (id) => String(id ?? '').slice(String(id ?? '').indexOf('~') + 1);

/** One row item: { text, title, kind: 'entity' | 'outside' | 'plain', entity?, outside? }. */
export function connectionItem(key, leaf) {
    const v = leaf?.value;
    if (!v || !text(v.name)) return null;
    const name = text(v.name), artist = text(v.artist);
    const label = key === 'covers' ? (artist ? `${name} (written by ${artist})` : name) : WORKS.has(key) && artist ? `${name} (${artist})` : name;
    const base = { text: label, title: sourceName(leaf.source) };
    const kind = (id) => ['track', 'artist', 'label'].includes(typeOfId(id));
    if (v.entityId && kind(v.entityId)) {
        return { ...base, kind: 'entity', entity: { id: v.entityId, type: typeOfId(v.entityId), name } };
    }
    if (WORKS.has(key) && v.artistId && typeOfId(v.artistId) === 'artist') {
        return { ...base, kind: 'entity', entity: { id: v.artistId, type: 'artist', name: artist || nameOfId(v.artistId) } };
    }
    if (v.discogsId) return { ...base, kind: 'outside', outside: { id: `${v.discogsType || 'artist'}:discogs:${v.discogsId}`, type: v.discogsType || 'artist', name, discogsId: String(v.discogsId) } };
    return { ...base, kind: 'plain' };
}

/** [{ key, label, items, more }] in the card's order; a row with nothing is left out, and `more` names what `+N` hides. */
export function connectionRows(facts) {
    const out = [];
    for (const [key, label] of CONNECTION_ROWS) {
        const items = list(facts?.[key]).map((leaf) => connectionItem(key, leaf)).filter(Boolean);
        if (!items.length) continue;
        out.push({ key, label, items: items.slice(0, ROW_MAX), more: items.slice(ROW_MAX).map((i) => i.text) });
    }
    return out;
}

function itemHtml(it) {
    const t = ` title="${esc(it.title)}"`;
    if (it.kind === 'entity') return `<button type="button" class="chip" data-fact-entity="${esc(it.entity.id)}" data-type="${esc(it.entity.type)}" data-name="${esc(it.entity.name)}"${t}>${esc(it.text)}</button>`;
    if (it.kind === 'outside') return `<button type="button" class="chip" data-fact-outside="${esc(it.outside.id)}" data-type="${esc(it.outside.type)}" data-name="${esc(it.outside.name)}" data-discogs-id="${esc(it.outside.discogsId)}"${t}>${esc(it.text)}</button>`;
    return `<span class="chip chip-plain"${t}>${esc(it.text)}</span>`;
}

/** The Connections card, or '' when every row is empty. Same markup as the Similar card. */
export function connectionsCardHtml(facts) {
    const rows = connectionRows(facts);
    if (!rows.length) return '';
    return `<div class="simcard conn" data-connections>
        <div class="simhead"><span>Connections</span></div>
        ${rows.map((r) => `<div class="simrow" data-conn-row="${r.key}"><span class="sim-k">${r.label}</span><div class="closest">${r.items.map(itemHtml).join('')}${r.more.length ? `<span class="chip chip-plain chip-more" title="${esc(r.more.join(', '))}">+${r.more.length}</span>` : ''}</div></div>`).join('')}
    </div>`;
}

// ---- photo ----

/** { src, title, href } for a Commons photo sized for a slot `size` px wide (fetched at 2x), or null; `href` is its Commons page. */
export function photoInfo(facts, size) {
    const p = facts?.photo?.value;
    if (!p) return null;
    const width = Math.round(size * 2);
    const src = p.file ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p.file)}?width=${width}` : p.url;
    if (!src) return null;
    const page = text(p.page);
    return {
        src,
        title: ['Photo', [text(p.credit), text(p.license)].filter(Boolean).join(' · ')].filter(Boolean).join(': '),
        href: /^https:\/\/commons\.wikimedia\.org\//i.test(page) ? page : '',
    };
}

export const photoHtml = (photo, cls = '') => (photo ? `<img${cls ? ` class="${esc(cls)}"` : ''} src="${esc(photo.src)}" alt="" title="${esc(photo.title)}" referrerpolicy="no-referrer" loading="lazy" data-facts-photo>` : '');

/** Put the photo in `slot`'s place; a broken image puts back what was there. */
function swapPhoto(slot, photo, cls) {
    if (!slot || !photo) return;
    const holder = slot.ownerDocument.createElement('div');
    holder.innerHTML = photoHtml(photo, cls);
    const img = holder.firstElementChild;
    img.addEventListener('error', () => { if (img.parentNode) img.replaceWith(slot); }, { once: true });
    slot.replaceWith(img);
}

/**
 * Put the photo over the Info card's initial, on top of a Discogs image already there, linked
 * to its Commons page; a broken one is removed and what is under it shows.
 */
function overlayPhoto(slot, photo) {
    if (!slot || !photo) return;
    const img = `<img src="${esc(photo.src)}" alt="" title="${esc(photo.title)}" referrerpolicy="no-referrer" loading="lazy" decoding="async">`;
    slot.insertAdjacentHTML('beforeend', photo.href
        ? `<a class="art-img" data-art-img data-facts-photo href="${esc(photo.href)}" target="_blank" rel="noopener" tabindex="-1">${img}</a>`
        : `<span class="art-img" data-art-img data-facts-photo>${img}</span>`);
    const holder = slot.lastElementChild;
    holder.querySelector('img').addEventListener('error', () => holder.remove(), { once: true });
}

/** The Wikipedia title the facts know, or ''. */
export const wikipediaTitle = (facts) => text(facts?.ids?.wikipedia?.value);

// ---- fetching: once per entity per session, failures draw nothing ----

const cache = new Map();

/** The facts for an entity id, or null (not in the library, failed, or no fetch). Never throws. The viewer keeps only the photo. */
export function loadFacts(id, { fetchImpl = globalThis.location ? globalThis.fetch?.bind(globalThis) : null, viewer = VIEWER } = {}) {
    if (!id || !fetchImpl || visitorHides('facts')) return Promise.resolve(null);
    if (!cache.has(id)) {
        cache.set(id, (async () => {
            try {
                const res = await fetchImpl(`/api/facts?id=${encodeURIComponent(id)}`);
                if (res.status === 404) return null;
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const facts = await res.json();
                return viewer ? (facts?.photo ? { photo: facts.photo } : null) : facts;
            } catch (err) {
                console.warn(`facts for ${id} unavailable: ${err?.message || err}`);
                return null;
            }
        })());
    }
    return cache.get(id);
}

export const clearFactsCache = () => cache.clear();

/** The entity id facts are read by: the one given, else an artist or label by name, an album by artist and name, a track by id. */
export function factsId({ type, name, artist = '', id = null }) {
    if (type !== 'track' && typeOfId(id) === type) return id;
    if (type === 'track') return id != null ? `track:${String(id).replace(/^track:/, '')}` : null;
    if (type === 'album') return artist ? entityId('album', `${artist}|${name}`) : null;
    return type === 'artist' || type === 'label' ? entityId(type, name) : null;
}

// ---- clicks ----

/**
 * What a click on a Connections item does. `onFocusEntity` (a graph) focuses an owned entity;
 * `panel` (Info) pushes an artist or label; otherwise the page navigates. An outside item opens
 * its outside panel.
 */
export function openFact(d, { app, panel = null, onFocusEntity = null }) {
    if (d.factOutside) {
        const node = { id: d.factOutside, type: d.type, name: d.name, discogsId: d.discogsId };
        (panel || app?.panel)?.show?.('outside', { node, context: null }, { focus: false });
        return true;
    }
    if (!d.factEntity) return false;
    const e = { id: d.factEntity, type: d.type, name: d.name };
    if (onFocusEntity) onFocusEntity(e);
    else if (panel && e.type !== 'track') panel.push({ type: e.type, name: e.name });
    else if (e.type === 'track') app?.navigate?.({ view: 'track', id: e.id.replace(/^track:/, '') });
    else app?.navigate?.({ view: e.type, name: e.name });
    return true;
}

/** One listener on a Connections host (a page's card); Info's own listener calls `openFact`. */
function wireCard(host, ctx) {
    host.addEventListener('click', (event) => {
        const b = event.target.closest?.('[data-fact-entity],[data-fact-outside]');
        if (b && host.contains(b)) openFact(b.dataset, ctx);
    });
}

// ---- mounting ----

/** On a drawn object page: the chip, the Connections card under the header, the photo when the artist has no cover. */
export async function mountPageFacts(app, root, { type, name, artist = '', id = null }) {
    const key = factsId({ type, name, artist, id });
    if (!key || !root) return;
    const facts = await loadFacts(key);
    if (!facts) return;
    const chip = chipHtml(factsChip(type, facts));
    if (chip) root.querySelector('.op-chips')?.insertAdjacentHTML('beforeend', chip);
    // The photo fills the art slot only when no cover is showing (none, or every one failed to load).
    const mosaic = root.querySelector('.op-art .cover-mosaic');
    if (type === 'artist' && mosaic && !mosaic.querySelector('img')) swapPhoto(mosaic, photoInfo(facts, 168), '');
    const card = connectionsCardHtml(facts);
    const header = root.querySelector('.op-header');
    if (card && header) {
        header.insertAdjacentHTML('afterend', `<section class="lp-section op-connections">${card}</section>`);
        wireCard(root.querySelector('.op-connections'), { app });
    }
}

/**
 * In an Info view: the chip under the card's facts line, the photo over the initial, the
 * Connections card in `[data-info-connections]` (its clicks go through wireCommon), and
 * Wikipedia at the end of the site row. Returns the facts, or null. `live()` says the view is still showing.
 */
export async function mountInfoFacts(root, { type, name, artist = '', id = null, live = () => true }) {
    const key = factsId({ type, name, artist, id });
    if (!key || !root) return null;
    const facts = await loadFacts(key);
    if (!facts || !live()) return null;
    const chip = chipHtml(factsChip(type, facts), 'ln facts-chip');
    if (chip) root.querySelector('.card-main .ln')?.insertAdjacentHTML('afterend', chip);
    if (type === 'artist') overlayPhoto(root.querySelector('.card .art-initial'), photoInfo(facts, 64));
    const mount = root.querySelector('[data-info-connections]');
    if (mount) mount.innerHTML = connectionsCardHtml(facts);
    const wiki = wikipediaTitle(facts);
    if (wiki) addWikipediaLink(root, wiki);
    return facts;
}
