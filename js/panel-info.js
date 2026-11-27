// The Info tab: the `track` and `entity` panel views. One panel with a history
// (detail-panel.js): the selected track is the root, a name pushes that entity,
// ‹ pops back. Both show the card, Near (its map folded) and their rows in the library;
// a track adds the tag editor.
//
// The editor writes nothing by itself: Save stages the changed frames and runs
// the review drawer's write sequence (`writeStaged`: Rekordbox check, write,
// notification with Undo). Nothing is written on a keystroke.
import { openEntity, isFilterYear } from './entity-links.js';
import { siteLinks, siteRowHtml, setSiteLink } from './site-links.js';
import {
    registerPanelView, ENTITY_TYPES, LIBRARY_ROWS, entityTracks, libraryRows, externalLinks, reasonText, selectedLine,
} from './detail-panel.js';
import { coverArtUrl, hasCoverArt } from './cover-art.js';
import { refKey } from './entity-relations.js';
import { entityId, albumArtistId, leadArtistId } from './credits-graph.js';
import { itemColour } from './kind-glyph.js';
import { nearGroups, nearHtml, outsideForNear, wireNear } from './panel-near.js';
import { nearMapLayout, nearMapSvg } from './near-map.js';
import { isPhone } from './phone.js';
import { splitGenreField } from './filter-rules.js';
import { parseCommentTags } from './sound-quality-tags.js';
import { trackPath } from './track-review.js';
import { isLocalPlayable, stashIconHtml } from './player.js';
import { isStashedTrack } from './stash.js';
import { setStashed } from './stash-action.js';
import { queueTracks } from './panel-queue.js';
import { trackActions } from './track-actions.js';
import { escapeHtml as esc } from './html.js';
import { mountInfoFacts, openFact } from './facts-view.js';
import { VIEWER, visitorHides } from './viewer-profile.js';
import { trackRowHtml, rowsHtml } from './info-items.js';
import { BUILT_IN, markPairHtml, paintMark, favoritesGroupHtml, wireFavoritesGroup } from './favorite-marks.js';

export { selectedLine };

const trim = (v) => String(v ?? '').trim();
const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

const KIND = { artist: 'Artist', label: 'Label', tag: 'Tag', album: 'Album' };
export const NEAR_TYPES = ['artist', 'label', 'tag', 'album', 'track'];
export const SIMILAR_FETCH = 30;

// ---- editor (pure) ----

/** The five controls over four frames: Genre and Subgenre share `genre`; Tags is `comments`. */
export function editorModel(track) {
    const { genres, subgenres } = splitGenreField(track?.genre);
    return {
        genre: genres[0] || '',
        subgenre: subgenres[0] || '',
        label: trim(track?.label),
        year: trim(track?.year),
        tags: parseCommentTags(track?.comments),
    };
}

/** The tags plus text typed in the + field and not yet committed (`tagDraft`): it counts and saves as a tag. */
export function withDraft(m) {
    const tags = (m.tags || []).map(trim).filter(Boolean);
    const draft = trim(m.tagDraft);
    return draft && !tags.some((t) => t.toLowerCase() === draft.toLowerCase()) ? [...tags, draft] : tags;
}
const joinTags = (m) => withDraft(m).join(', ');
const composeGenre = (genre, subgenre) => (subgenre ? `${genre}: ${subgenre}` : genre);

/** The controls that differ from the model (outlined in accent). */
export function dirtyFields(model, edited) {
    const out = new Set();
    for (const key of ['genre', 'subgenre', 'label', 'year']) if (trim(edited[key]) !== trim(model[key])) out.add(key);
    if (joinTags(edited) !== joinTags(model)) out.add('tags');
    return out;
}

/** Only the frames that changed: `{ genre?, label?, year?, comments? }`. */
export function editorDiff(model, edited) {
    const dirty = dirtyFields(model, edited);
    const out = {};
    if (dirty.has('genre') || dirty.has('subgenre')) out.genre = composeGenre(trim(edited.genre), trim(edited.subgenre));
    if (dirty.has('label')) out.label = trim(edited.label);
    if (dirty.has('year')) out.year = trim(edited.year);
    if (dirty.has('tags')) out.comments = joinTags(edited);
    return out;
}

/**
 * Save: stage each changed frame with source `info`, then the drawer's write
 * sequence for those fields only. On anything but a write, what Info staged is
 * taken back (a proposal staged earlier for the same field is restored).
 */
export async function saveInfoEdits({ review, track, model, edited, confirm, onUndone }) {
    const frames = editorDiff(model, edited);
    const fields = Object.keys(frames);
    if (!review || !fields.length || !trackPath(track)) return { ok: false };
    const c = review.controller;
    await c.open(track);
    const before = new Map((c.diffs || []).map((d) => [d.field, d]));
    for (const field of fields) await c.stage({ field, proposedValue: frames[field], source: 'info' });
    const result = await review.writeStaged(track, { confirm, fields, onUndone });
    if (result?.ok) return { ...result, ok: true, track: c.track || track };
    for (const field of fields) {
        const prior = before.get(field);
        if (prior) await c.stage({ field, proposedValue: prior.proposedValue, source: prior.source });
        else await c.discard?.(field);
    }
    return { ...(result || {}), ok: false };
}

// ---- markup (pure) ----

// The card's links a graph follows by moving its selection (wireCommon).
const GRAPH_LINK_TYPES = new Set(['artist', 'label', 'tag']);
const link = (type, name, e = esc) => `<button type="button" class="lnk" data-info-entity="${type}" data-name="${e(name)}">${e(name)}</button>`;
const trackTags = (t) => (Array.isArray(t.tags) && t.tags.length ? t.tags : parseCommentTags(t.comments));
/** A track's BPM as the tag has it, to one decimal place at most ("124", "123.5"); '' without one. */
export const bpmLabel = (t) => (Number(t?.bpm) > 0 ? String(Math.round(Number(t.bpm) * 10) / 10) : '');
const keyOf = (t) => trim(t?.key || t?.tonality);
/** A track row's hover: "124 BPM · 8A", either part alone, or ''. */
export const rowHint = (t) => [bpmLabel(t) && `${bpmLabel(t)} BPM`, keyOf(t)].filter(Boolean).join(' · ');
/** Near's track row for a track: an artist's own Info leaves out "· artist" on that artist's tracks. */
export const nearTrackRow = (t, target) => ({
    id: t.id, title: t.title, by: target?.type === 'artist' && trim(t.artist) && entityId('artist', trim(t.artist)) === (target.id || entityId('artist', trim(target.name))) ? '' : t.artist, hint: rowHint(t), playable: isLocalPlayable(t),
});
const menuButton = VIEWER ? '' : '<button type="button" class="card-menu" data-info-menu aria-label="More" aria-haspopup="true" aria-expanded="false">⋯</button>';

/** The gig playlists holding a track (not the derived BPM ones), each with its gig to link to. */
export function gigMembershipLinks(gigs, id) {
    return (gigs || []).flatMap((gig) => (gig.playlists || [])
        .filter((lane) => !lane.isBpmRoll && (lane.trackIds || []).some((trackId) => String(trackId) === String(id)))
        .map((lane) => ({ gigId: gig.id, text: `${gig.name} › ${lane.name}` })));
}

/** Stash beside the title: `stashed` is null where it can't be written (the viewer, no file). */
export function stashButtonHtml(stashed) {
    const word = stashed ? 'Unstash' : 'Stash';
    return `<button type="button" class="info-stash${stashed ? ' is-on' : ''}" data-info-stash aria-pressed="${stashed}" aria-label="${word}" title="${word}">${stashIconHtml(stashed)}</button>`;
}

/** ☆ and ♡ for Info's item (`marks`: { on, collections }); none in the viewer. */
const cardMarksHtml = (marks, cls, attrs = 'data-info-mark') => (marks ? markPairHtml(marks.on, { collections: marks.collections || BUILT_IN, cls, attrs }) : '');

/** Title (opens the track page), ☆ ♡ and Stash; artist · album; Label · year · BPM · key; In gig playlists; tags. */
export function trackCardHtml(track, { memberships = [], stashed = null, marks = null, escapeHtml = esc } = {}) {
    const e = escapeHtml;
    const who = [track.artist && link('artist', track.artist, e), track.album && link('album', track.album, e)].filter(Boolean).join(' · ');
    // Year, BPM and key filter Collection (entity-links.js); a key the Key filter does not read (`key` alone) stays text.
    const filterBtn = (kind, name, text) => `<button type="button" class="lnk" data-info-filter="${kind}" data-name="${e(name)}">${e(text)}</button>`;
    const facts = [
        trim(track.year) && (isFilterYear(trim(track.year)) ? filterBtn('year', trim(track.year), trim(track.year)) : e(trim(track.year))),
        bpmLabel(track) && filterBtn('bpm', String(track.bpm), `${bpmLabel(track)} BPM`),
        trim(track.tonality) ? filterBtn('key', trim(track.tonality), trim(track.tonality)) : e(trim(track.key)),
    ].filter(Boolean);
    const labelLine = track.label ? [`<span class="k">Label</span>${link('label', track.label, e)}`, ...facts].join(' · ') : facts.join(' · ');
    const inLine = memberships.length
        ? `<div class="ln"><span class="k">In</span>${memberships.map((m) => `<button type="button" class="lnk" data-open-gig="${e(m.gigId)}">${e(m.text)}</button>`).join(', ')}</div>` : '';
    const tags = trackTags(track);
    return `<div class="card" data-info-card>
        <img class="art" src="${e(coverArtUrl(track))}" alt="" width="64" height="64">
        <div class="card-main">
            <h4><button type="button" class="lnk" data-open-track="${e(track.id)}">${e(track.title || 'Untitled')}</button>${cardMarksHtml(marks, 'info-mark')}${stashed === null ? '' : stashButtonHtml(stashed)}</h4>
            ${who ? `<div class="ln">${who}</div>` : ''}
            ${labelLine ? `<div class="ln">${labelLine}</div>` : ''}
            ${inLine}
        </div>
        ${menuButton}
        ${tags.length ? `<div class="tagrow">${tags.map((t) => `<button type="button" class="chip" data-info-entity="tag" data-name="${e(t)}">${e(t)}</button>`).join('')}</div>` : ''}
    </div>`;
}

const topNames = (tracks, key, max = 3) => {
    const counts = new Map();
    for (const t of tracks) {
        const name = trim(t[key]);
        if (!name) continue;
        const k = name.toLowerCase();
        const hit = counts.get(k) || { name, n: 0, at: counts.size };
        hit.n += 1;
        counts.set(k, hit);
    }
    return [...counts.values()].sort((a, b) => b.n - a.n || a.at - b.at).slice(0, max).map((c) => c.name);
};

/** "Artist · 7 tracks · 2 albums", and the Labels (for an artist) or Artists (the rest) to link. */
export function entityCardMeta(entity, tracks) {
    const parts = [KIND[entity.type] || '', plural(tracks.length, 'track')];
    if (entity.type !== 'album') {
        const albums = new Set(tracks.map((t) => trim(t.album).toLowerCase()).filter(Boolean)).size;
        if (albums) parts.push(plural(albums, 'album'));
    }
    const related = entity.type === 'artist'
        ? { label: 'Labels', type: 'label', names: topNames(tracks, 'label') }
        : { label: 'Artists', type: 'artist', names: topNames(tracks, 'artist') };
    return { line: parts.filter(Boolean).join(' · '), related };
}

/** An artist's or label's stored Discogs image (the small one first) and its Discogs page, or null. */
export function discogsImage(row) {
    const src = trim(row?.imageThumb) || trim(row?.image);
    if (!/^https:\/\//i.test(src)) return null;
    const href = trim(row.discogsUrl) || trim(row.sourceUrl);
    return { src, href: /^https:\/\/(www\.)?discogs\.com\//i.test(href) ? href : '', credit: 'Discogs' };
}

/** An album's cover from its first track with art, or null. */
export function albumImage(tracks) {
    const track = (tracks || []).find(hasCoverArt);
    return track ? { src: coverArtUrl(track) } : null;
}

/** A tag's cover: its four most-filled albums' covers as a 2×2, else its biggest album's alone; [] with no art. */
export function tagCovers(tracks, max = 4) {
    const albums = new Map();
    for (const t of tracks || []) {
        if (!hasCoverArt(t)) continue;
        const key = entityId('album', `${trim(t.artist)}|${trim(t.album)}`);
        const a = albums.get(key) || { n: 0, track: t };
        a.n += 1;
        albums.set(key, a);
    }
    const srcs = [...albums.values()].sort((a, b) => b.n - a.n).map((a) => coverArtUrl(a.track));
    return srcs.length >= max ? srcs.slice(0, max) : srcs.slice(0, 1);
}

/** The covers over a tag's initial, drawn in grey for the tag's map colour (`--c` on the art) to tint. */
function tagArtHtml(covers, e = esc) {
    if (!covers?.length) return '';
    return `<span class="art-mosaic${covers.length > 1 ? ' is-four' : ''}" data-art-img>${covers.map((src) => `<img src="${e(src)}" alt="" loading="lazy" decoding="async">`).join('')}</span>`;
}

/** The image over the initial, which stays underneath for a missing or broken one; a Discogs image links to its page. */
export function artImageHtml(image, e = esc) {
    if (!image?.src) return '';
    const img = `<img src="${e(image.src)}" alt="" loading="lazy" decoding="async"${image.title ? ` title="${e(image.title)}"` : ''}>`;
    const credited = image.credit && image.href ? ' data-art-credit' : '';
    return image.href
        ? `<a class="art-img" data-art-img${credited} href="${e(image.href)}" target="_blank" rel="noopener" tabindex="-1">${img}</a>`
        : `<span class="art-img" data-art-img>${img}</span>`;
}

/** The faint caption under the art naming its source, linked; shown (CSS) only while its image is the top layer. */
export const artCreditHtml = (image, e = esc) => (image?.src && image.credit && image.href
    ? `<a class="art-credit" href="${e(image.href)}" target="_blank" rel="noopener">${e(image.credit)}</a>` : '');

/** A broken image leaves the initial. */
export const wireArtImage = (root) => root?.querySelectorAll('[data-art-img] img').forEach((img) => img.addEventListener('error', () => img.closest('[data-art-img]')?.remove(), { once: true }));

/** Initial or artwork, the name (opens the page), the facts line, related links, ▶ Play · Shuffle · ☆ ♡. */
export function entityCardHtml(entity, meta, { favorite = false, marks = null, canPlay = true, image = null, covers = [], escapeHtml = esc } = {}) {
    const e = escapeHtml;
    const initial = (trim(entity.name)[0] || '?').toUpperCase();
    const related = meta.related?.names?.length
        ? `<div class="ln"><span class="k">${meta.related.label}</span>${meta.related.names.map((n) => link(meta.related.type, n, e)).join(', ')}</div>` : '';
    const off = canPlay ? '' : ' disabled';
    return `<div class="card" data-info-card>
        <div class="art-col"><div class="art art-initial${entity.type === 'artist' ? ' is-round' : ''}${entity.type === 'tag' ? ' is-tag' : ''}" aria-hidden="true"${entity.type === 'tag' ? ' data-tag-art' : ''}>${e(initial)}${entity.type === 'tag' ? tagArtHtml(covers, e) : artImageHtml(image, e)}</div>${entity.type === 'tag' ? '' : artCreditHtml(image, e)}</div>
        <div class="card-main">
            <h4><button type="button" class="lnk" data-open-page>${e(entity.name)}</button></h4>
            <div class="ln">${e(meta.line)}</div>
            ${related}
            ${VIEWER ? '' : `<div class="ln acts"><button type="button" class="act-btn" data-play${off}>▶ Play</button> · <button type="button" class="act-btn" data-shuffle${off}>Shuffle</button> · <span class="info-marks">${cardMarksHtml(marks || { on: new Set(favorite ? ['star'] : []) }, 'act-btn fav', 'data-info-mark data-fav')}</span></div>`}
        </div>
        ${menuButton}
    </div>`;
}

/**
 * Near leaves out what the entity's own tracks already name: its
 * albums and tracks, and the labels and artists on them (the card's header
 * lists those). Tags stay: they describe the sound.
 */
export function withoutOwn(neighbours, entity, tracks) {
    const own = new Set();
    for (const t of tracks || []) {
        own.add(`track:${t.id}`);
        const artist = trim(t.artist);
        for (const id of [entityId('artist', artist), entityId('label', t.label), artist && trim(t.album) ? entityId('album', `${artist}|${trim(t.album)}`) : null]) if (id) own.add(id);
    }
    own.delete(entity?.id);
    return (neighbours || []).filter((n) => !own.has(n.id));
}

/** On a graph (a Collection tab's Graph, Discover › Graph) the card's Graph and Discover only repeat the switch beside it. */
export const onGraphRoute = (route) => Boolean(route?.graph || (route?.view === 'discover' && !route.tab));

const FIELDS = [['genre', 'Genre'], ['subgenre', 'Subgenre'], ['label', 'Label'], ['year', 'Year']];

const saveLabel = (n) => `Save ${plural(n, 'change')}`;

/** The footer: Save N changes and Revert, only with something changed. */
export const editorActHtml = (dirty, readOnly = false) => (dirty.size && !readOnly
    ? `<button type="button" class="save" data-info-save>${saveLabel(dirty.size)}</button><button type="button" class="rev" data-info-revert>Revert</button>` : '');

const tagChipHtml = (t, i, readOnly = false, e = esc) => `<span class="tagchip" data-ed-tag="${e(t)}">${e(t)}${readOnly ? '' : `<button type="button" data-ed-remove="${i}" aria-label="Remove ${e(t)}">×</button>`}</span>`;

/** Genre, Subgenre, Label, Year, Tags. Read-only (no local file): **No local file to write**. */
export function editorHtml(model, { readOnly = false, dirty = new Set(), escapeHtml = esc } = {}) {
    const e = escapeHtml;
    const off = readOnly ? ' disabled' : '';
    const inputs = FIELDS.map(([key, label]) => `<label for="info-ed-${key}">${label}</label><input id="info-ed-${key}" class="in${dirty.has(key) ? ' chg' : ''}" data-ed="${key}" value="${e(model[key])}" autocomplete="off" spellcheck="false"${key === 'year' ? ' inputmode="numeric"' : ''}${off}>`).join('');
    const chips = (model.tags || []).map((t, i) => tagChipHtml(t, i, readOnly, e)).join('');
    const act = editorActHtml(dirty, readOnly);
    return `<div class="ed" data-info-editor>
        ${inputs}
        <span class="ed-k">Tags</span><div class="in tags${dirty.has('tags') ? ' chg' : ''}" data-ed="tags">${chips}${readOnly ? '' : `<input class="tag-add" data-ed-add aria-label="Add tag" placeholder="+" autocomplete="off" spellcheck="false" value="${e(model.tagDraft || '')}">`}</div>
        ${readOnly ? '<p class="ed-note">No local file to write</p>' : ''}
        <div class="act" data-info-act${act ? '' : ' hidden'}>${act}</div>
    </div>`;
}

/** Focus here: on a graph, Info shows a peeked node (atlas-peek.js); this makes it the selection. */
export const focusHereHtml = '<button type="button" class="info-focus" data-info-focus>Focus here</button>';

/** ‹ and the previous entry's name. */
export function backHtml(prev) {
    const name = prev?.kind === 'track' ? prev.track?.title || 'Untitled' : prev?.entity?.name || '';
    return `<button type="button" class="back" data-info-back>‹ ${esc(name)}</button>`;
}

// Bandcamp, Discogs and YouTube have their own row at the end of Info; the menu keeps the rest.
const ROW_SITES = /^https:\/\/([a-z0-9-]+\.)*(bandcamp\.com|discogs\.com|youtube\.com)\//i;
// `favs` is Favorites ›, every collection as a checked list (favorite-marks.js).
const menuHtml = ({ links: all = [], entity = null, canQueue = false, favs = [] }) => { if (VIEWER) return ''; const links = all.filter((l) => !ROW_SITES.test(l.href)); return `<div class="info-menu" data-info-menu-panel hidden>
    ${links.length ? `<nav class="dp-links" aria-label="Links">${links.map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}</nav>` : ''}
    ${favs.length ? `<div class="info-favs" data-info-favs>${favoritesGroupHtml(favs, { cls: 'info-fav-item' })}</div>` : ''}
    ${entity ? `<button type="button" data-queue="next"${canQueue ? '' : ' disabled'}>Play next</button><button type="button" data-queue="add"${canQueue ? '' : ' disabled'}>Add to queue</button><button type="button" data-show-collection>Show in Collection</button>` : ''}
    ${entity && (entity.type === 'artist' || entity.type === 'label') ? '<button type="button" data-info-discogs>Discogs identity</button>' : ''}
</div>`; };

const whyHtml = (why, name) => (why?.length ? `<section class="dp-section dp-why"><h4>Why near ${esc(name)}</h4><ul>${why.map((r) => `<li>${reasonText(r)}</li>`).join('')}</ul></section>` : '');

export const libraryHtml = (rows, more) => (rows.length ? `<section class="dp-section"><h4>In your library</h4>${rowsHtml(rows.map(({ track, linked, colour = null, current = false }) => trackRowHtml({
    id: track.id, title: track.title, hint: rowHint(track), colour, linked, playable: isLocalPlayable(track), attrs: current ? 'aria-current="true"' : '',
})))}${more ? `<button type="button" class="dp-more" data-show-collection>+ ${more} more</button>` : ''}</section>` : '');

const albumKey = (t) => (trim(t?.artist) && trim(t?.album) ? entityId('album', `${trim(t.artist)}|${trim(t.album)}`) : null);

/**
 * A track's In your library: the tracks on its album (its artist's), else its artist's
 * tracks, with the entity they make for ▶ and + N more. Null when only the track itself.
 */
export function trackLibrary(all, track) {
    const album = albumKey(track), artist = trim(track?.artist);
    if (album) {
        const tracks = entityTracks(all || [], 'album', trim(track.album)).filter((t) => albumKey(t) === album);
        if (tracks.length > 1) return { target: { type: 'album', name: trim(track.album), id: album, artist }, tracks };
    }
    const tracks = artist ? entityTracks(all || [], 'artist', artist) : [];
    return tracks.length > 1 ? { target: { type: 'artist', name: artist, id: entityId('artist', artist) }, tracks } : null;
}

/** The first rows in library order, the track itself among them (filled and `current`): past the limit it takes the last row. */
export function trackLibraryRows(tracks, track, limit = LIBRARY_ROWS) {
    const at = tracks.findIndex((t) => String(t.id) === String(track?.id));
    const shown = tracks.slice(0, limit);
    if (at >= limit) shown[limit - 1] = tracks[at];
    const mark = (t) => at >= 0 && t === tracks[at];
    return { rows: shown.map((t) => ({ track: t, linked: mark(t), current: mark(t) })), more: Math.max(0, tracks.length - limit) };
}

// ---- the views ----

/** Info's marks for an item: its ☆ and ♡ state, and Favorites › with every collection. Null in the viewer. */
function infoMarks(app, type, name, repaint) {
    const marks = app?.marks;
    if (VIEWER || !marks) return { card: null, favs: [] };
    const on = marks.of(type, name);
    const favs = marks.collections.map((c) => ({
        id: c.id, glyph: c.glyph, label: c.name, checked: on.has(c.id), on: () => marks.has(c.id, type, name),
        run: async () => {
            try { await marks.toggle(c.id, type, name); repaint(); return true; }
            catch (err) { app.showNotification?.(`Favorite not saved: ${err?.message || err}`, 'error'); return null; }
        },
    }));
    return { card: { on, collections: marks.collections }, favs };
}

/** Wire the card's ☆ and ♡ and Favorites ›, and let a mark given elsewhere repaint them (`panel._paintMarks`). */
function wireMarks(root, { panel, app, type, name, favs }) {
    const paint = () => {
        const marks = app?.marks;
        if (!marks || !root.isConnected) return;
        root.querySelectorAll('[data-info-mark]').forEach((btn) => paintMark(btn, marks.collection(btn.dataset.mark), marks.has(btn.dataset.mark, type, name)));
        // Favorites › keeps its checks with the card.
        root.querySelectorAll('[data-info-favs] [data-fav-sub-item]').forEach((btn) => {
            const it = favs[Number(btn.dataset.favSubItem)];
            if (!it) return;
            it.checked = marks.has(it.id, type, name);
            btn.setAttribute('aria-checked', String(it.checked));
            const check = btn.querySelector('.column-menu-check');
            if (check) check.textContent = it.checked ? '✓' : '';
        });
    };
    // On the root, so a card drawn again (its gig playlists arriving) keeps working.
    root.addEventListener('click', async (e) => {
        const btn = e.target.closest?.('[data-info-mark]');
        if (!btn || !root.contains(btn) || !app?.marks) return;
        try { await app.marks.toggle(btn.dataset.mark, type, name); } catch (err) { app.showNotification?.(`Favorite not saved: ${err?.message || err}`, 'error'); }
        paint();
    });
    wireFavoritesGroup(root.querySelector('[data-info-favs]'), favs);
    panel._paintMarks = paint;
    return paint;
}

const sameEntry = (a, b) => a && b && a.kind === b.kind && (a.kind === 'track'
    ? String(a.track?.id) === String(b.track?.id)
    : a.entity?.type === b.entity?.type && trim(a.entity?.name).toLowerCase() === trim(b.entity?.name).toLowerCase());

/** The view was shown without `open`/`push` (or out of step): the payload becomes the root. */
function topFor(panel, entry) {
    const top = panel.history[panel.history.length - 1];
    if (sameEntry(top, entry)) return top;
    panel.history = [entry];
    return entry;
}

/** Paint the top of the history, with ‹ name above it when there is somewhere to go back to. */
export function renderInfo(host, ctx) {
    const { panel } = ctx;
    const top = panel.history[panel.history.length - 1];
    const prev = panel.history.length > 1 ? panel.history[panel.history.length - 2] : null;
    return top.kind === 'track' ? renderTrack(host, top, prev, ctx) : renderEntity(host, top, prev, ctx);
}

/** Clicks shared by both views; one listener on the view root. */
function wireCommon(root, { panel, app, onFocusEntity = null, onFocusHere = null }) {
    const menu = root.querySelector('[data-info-menu-panel]');
    const menuBtn = root.querySelector('[data-info-menu]');
    const setMenu = (open) => { if (!menu) return; menu.hidden = !open; menuBtn?.setAttribute('aria-expanded', String(open)); };
    root.addEventListener('click', (event) => {
        const t = event.target.closest?.('button, a');
        if (!t || !root.contains(t)) { setMenu(false); return; }
        const d = t.dataset;
        if (t === menuBtn) { setMenu(menu?.hidden); return; }
        setMenu(false);
        if (Object.hasOwn(d, 'infoBack')) panel.pop();
        else if (Object.hasOwn(d, 'infoFocus')) onFocusHere?.();
        else if (d.infoEntity) {
            // On a graph, the card's artist, label and tag links move the selection too (an album's link carries no artist).
            const id = onFocusEntity && GRAPH_LINK_TYPES.has(d.infoEntity) ? entityId(d.infoEntity, d.name) : null;
            if (id) onFocusEntity({ id, type: d.infoEntity, name: d.name }); else panel.push({ type: d.infoEntity, name: d.name });
        }
        else if (d.infoFilter) openEntity(app, { type: d.infoFilter, name: d.name });
        else if (d.simEntity) {
            const e = { id: d.simEntity, type: d.type, name: d.name };
            if (onFocusEntity) onFocusEntity(e); else panel.push(e);
        } else if (d.factEntity || d.factOutside) openFact(d, { app, panel, onFocusEntity });
        else if (d.openTrack) app.navigate?.({ view: 'track', id: d.openTrack });
        else if (d.openGig) app.navigate?.({ view: 'gigs', id: d.openGig });
    });
}

/**
 * A track: Near's map, the card, the sites, Why near, Near, Connections, In your
 * library (its album, else its artist), then the editor (the app only). Only the
 * editor repaints while editing, so the rest stays put.
 */
async function renderTrack(host, entry, prev, ctx) {
    const { panel, app, live, opts = {} } = ctx;
    const track = entry.track;
    const target = { type: 'track', id: `track:${track.id}`, name: track.title };
    panel.current = target;
    panel.onFocusEntity = opts.onFocusEntity || null;
    const readOnly = !trackPath(track);
    // The app's row now (a stash elsewhere writes Comments there), or the entry's.
    const liveTrack = () => app?._trackById?.(track.id) || track;
    const stashState = () => (VIEWER || readOnly ? null : isStashedTrack(liveTrack()));
    const model = editorModel(track);
    const context = panel.history.length === 1 ? opts.context : null;
    // Asked at once: the neighbours and the atlas load while the card paints.
    const nearLoad = Promise.all([panel._closest(target, { limit: SIMILAR_FETCH, types: NEAR_TYPES }), panel.atlasForNear()]);
    const editorNow = () => {
        const edited = (!readOnly && panel.editsFor(track.id)) || model;
        return editorHtml(edited, { readOnly, dirty: readOnly ? new Set() : dirtyFields(model, edited) });
    };

    let paintMarks = () => {};
    const marks = infoMarks(app, 'track', String(track.id), () => paintMarks());
    host.innerHTML = `<div class="info">
        ${prev ? backHtml(prev) : opts.onFocusHere ? focusHereHtml : ''}
        ${trackCardHtml(track, { stashed: stashState(), marks: marks.card })}
        ${menuHtml({ links: trackLinks(app, track), favs: marks.favs })}
        ${siteRowHtml(siteLinks({ type: 'track', name: track.title, artist: track.artist }))}
        <p class="info-sel" data-info-selected>${esc(selectedLine(app?._selectedTrackIds?.size || 0))}</p>
        <div data-info-why></div>
        <div data-info-near></div>
        <div data-info-connections></div>
        <div data-info-library></div>
        ${VIEWER ? '' : editorNow()}
    </div>`;
    const root = host.firstElementChild;
    hideBrokenArt(root);
    dropBrokenCovers(root);
    wireCommon(root, { ...ctx, onFocusEntity: opts.onFocusEntity || null, onFocusHere: opts.onFocusHere || null });
    paintMarks = wireMarks(root, { panel, app, type: 'track', name: String(track.id), favs: marks.favs });
    const paintEditor = () => {
        const editor = root.querySelector('[data-info-editor]');
        if (!editor) return;
        editor.outerHTML = editorNow();
        wireEditor(root, { entry, model, readOnly, repaint: paintEditor, ctx });
    };
    wireEditor(root, { entry, model, readOnly, repaint: paintEditor, ctx });
    root.addEventListener('click', async (event) => {
        if (!event.target.closest?.('[data-info-stash]')) return;
        const { done } = await setStashed(app, [String(track.id)], !stashState());
        // Written: the Info view is drawn again from the new row, editor included.
        if (!done.length) return;
        const row = liveTrack();
        for (const e of panel.history) if (e.kind === 'track' && String(e.track.id) === String(track.id)) e.track = row;
        if (live()) panel._showTop();
    });
    mountInfoFacts(root, { type: 'track', id: track.id, live });
    if (opts.focus) host.querySelector('button')?.focus();

    const [gigs, reasons, all] = await Promise.all([
        VIEWER ? null : panel.loadGigs(app?.integrationManager?.database).catch(() => null),
        context ? panel._why(context, target) : null,
        Promise.resolve(app?._allTracks ? app._allTracks() : []).catch(() => []),
    ]);
    if (!live()) return;
    const memberships = gigMembershipLinks(gigs, track.id);
    const card = root.querySelector('[data-info-card]');
    if (card && memberships.length) { card.outerHTML = trackCardHtml(track, { memberships, stashed: stashState(), marks: marks.card && { ...marks.card, on: app.marks.of('track', String(track.id)) } }); hideBrokenArt(root); }
    const whyMount = root.querySelector('[data-info-why]');
    if (whyMount && reasons?.length) whyMount.innerHTML = whyHtml(reasons, context.name);
    const library = trackLibrary(all, track);
    const { rows, more } = library ? trackLibraryRows(library.tracks, track) : { rows: [], more: 0 };
    const lib = root.querySelector('[data-info-library]');
    paintLibrary(lib, { panel, target: library?.target, tracks: library?.tracks, rows, more });

    const [near, atlas] = await nearLoad;
    if (!live()) return;
    const colours = atlasColours(atlas, all);
    // Near leaves out what the card and In your library already list.
    const listed = new Set((library?.tracks || []).map((t) => `track:${t.id}`));
    const artistId = leadArtistId(track.artist, colours.isOnAtlas);
    mountNear(root, {
        panel, app, target, all, atlas, colours,
        near: withoutOwn(near, target, [track]).filter((n) => !listed.has(n.id)),
        centreAnchorId: artistId, centreColour: colours.colourFor(artistId),
    });
    if (atlas) paintLibrary(lib, { panel, target: library?.target, tracks: library?.tracks, rows, more, colours });
}

/** Artwork that fails to load falls back to the placeholder. */
const hideBrokenArt = (root) => root.querySelector('img.art')?.addEventListener('error', (event) => { event.target.src = coverArtUrl(null); }, { once: true });

/**
 * The stored Discogs image of a confirmed artist or label, put over the initial
 * once read. Local reads only; nothing asks Discogs. It goes under a Commons
 * photo already there, which stays on top and shows it if the photo breaks.
 */
export async function mountDiscogsImage(root, target, { panel, live }) {
    try {
        const service = panel._service?.();
        const db = panel.app?.integrationManager?.database;
        if (!service || !db?.getEntityRelations) return;
        const identity = await service.identity(target);
        const ref = identity?.resolution === 'confirmed' ? identity.refs?.[0] : null;
        const image = ref ? discogsImage(await db.getEntityRelations(refKey(ref))) : null;
        const slot = image && live() ? root.querySelector('.card .art-initial') : null;
        if (!slot) return;
        slot.insertAdjacentHTML('afterbegin', artImageHtml(image));
        slot.parentElement?.querySelector(':scope > .art-credit')?.remove();
        slot.insertAdjacentHTML('afterend', artCreditHtml(image));
        wireArtImage(slot);
    } catch (_) { /* the initial stays */ }
}

/** An owned artist's or label's linked Bandcamp page and Discogs identity replace the searches. */
async function linkedSites(root, id, live) {
    try {
        const res = await fetch(`/api/links/${encodeURIComponent(id)}`);
        if (!res.ok || !live()) return;
        const { links = {} } = await res.json();
        if (links.bandcamp?.state === 'linked' && links.bandcamp.url) setSiteLink(root, 'bandcamp', links.bandcamp.url);
        if (links.discogs?.state === 'linked' && links.discogs.url) setSiteLink(root, 'discogs', links.discogs.url);
    } catch (_) { /* the searches stay */ }
}

function trackLinks(app, track) {
    const targets = app?._digTargets?.(track);
    if (targets?.length) return targets.map((t) => ({ label: t.title, href: t.href }));
    return externalLinks({ type: 'track', name: track.title, artist: track.artist });
}

function wireEditor(root, { entry, model, readOnly, repaint, ctx }) {
    if (readOnly || VIEWER) return;
    const { panel } = ctx;
    const id = entry.track.id;
    const editor = root.querySelector('[data-info-editor]');
    const current = () => panel.editsFor(id) || { ...model, tags: [...model.tags] };
    // Kept only while something differs, by track id, so a history reset does not lose it.
    const setEdited = (edited) => panel.setEdits(id, edited && dirtyFields(model, edited).size ? edited : null);
    const refresh = () => {
        const dirty = dirtyFields(model, current());
        for (const el of editor.querySelectorAll('[data-ed]')) el.classList.toggle('chg', dirty.has(el.dataset.ed));
        const act = editor.querySelector('[data-info-act]');
        const save = act.querySelector('[data-info-save]');
        // In place when the buttons are already there, so a click on Save is never lost to a redraw.
        if (dirty.size && save) save.textContent = saveLabel(dirty.size);
        else act.innerHTML = editorActHtml(dirty);
        act.hidden = !dirty.size;
    };
    const setTags = (tags) => {
        setEdited({ ...current(), tags, tagDraft: '' });
        repaint();
        panel.host?.querySelector('[data-ed-add]')?.focus();
    };
    editor.addEventListener('input', (event) => {
        if (event.target.matches?.('[data-ed-add]')) { setEdited({ ...current(), tagDraft: event.target.value }); refresh(); return; }
        const key = event.target.dataset?.ed;
        if (!key || key === 'tags') return;
        setEdited({ ...current(), [key]: event.target.value });
        refresh();
    });
    editor.addEventListener('keydown', (event) => {
        if (!event.target.matches?.('[data-ed-add]')) return;
        if (event.key !== 'Enter' && event.key !== ',') return;
        event.preventDefault();
        const cur = current();
        if (trim(event.target.value)) setTags(withDraft({ ...cur, tagDraft: event.target.value }));
    });
    // Leaving the + field commits what was typed as a chip, without redrawing the footer.
    editor.addEventListener('focusout', (event) => {
        const input = event.target;
        if (!input.matches?.('[data-ed-add]') || !trim(input.value)) return;
        const cur = current();
        const tags = withDraft({ ...cur, tagDraft: input.value });
        if (tags.length > cur.tags.length) input.insertAdjacentHTML('beforebegin', tagChipHtml(tags[tags.length - 1], tags.length - 1));
        input.value = '';
        setEdited({ ...cur, tags, tagDraft: '' });
        refresh();
    });
    editor.addEventListener('click', async (event) => {
        const t = event.target.closest?.('button');
        if (!t) return;
        if (t.dataset.edRemove != null) {
            setTags(current().tags.filter((_, i) => i !== Number(t.dataset.edRemove)));
        } else if (Object.hasOwn(t.dataset, 'infoRevert')) {
            panel.setEdits(id, null);
            repaint();
        } else if (Object.hasOwn(t.dataset, 'infoSave')) {
            t.disabled = true;
            await saveFromInfo(entry, model, ctx);
            if (t.isConnected) t.disabled = false;
        }
    });
}

async function saveFromInfo(entry, model, { panel, app }) {
    const review = app?.trackReview;
    // The controller's own question ("… Write anyway?" / "… Undo anyway?") and its words on the button.
    const confirm = (message) => app._openGigConfirmModal({ title: message, confirmLabel: /Undo anyway/.test(message) ? 'Undo anyway' : 'Write anyway' });
    const showing = (id) => {
        const top = panel.history[panel.history.length - 1];
        return panel.kind === 'track' && String(top?.track?.id) === String(id) ? top : null;
    };
    const written = (track) => {
        app?._trackWritten?.(track);
        for (const e of panel.history) if (e.kind === 'track' && String(e.track.id) === String(track.id)) e.track = track;
        if (showing(track.id)) panel._showTop();
    };
    const id = entry.track.id;
    const out = await saveInfoEdits({
        review, track: entry.track, model, edited: panel.editsFor(id) || model, confirm,
        onUndone: (track) => track && written(track),
    });
    if (!out.ok) return;
    panel.setEdits(id, null);
    written(out.track);
}

async function renderEntity(host, entry, prev, ctx) {
    const { panel, app, generation, live, opts = {} } = ctx;
    const entity = entry.entity;
    const target = { type: entity.type, name: entity.name, id: entity.id || entityId(entity.type, entity.name) };
    panel.current = target; panel.onFocusEntity = opts.onFocusEntity || null;
    const context = panel.history.length === 1 ? opts.context : null;
    const all = app?._allTracks ? await app._allTracks() : [];
    if (!live()) return;
    let paintMarks = () => {};
    const marks = infoMarks(app, target.type, target.name, () => paintMarks());
    const tracks = entityTracks(all || [], target.type, target.name);
    panel.tracks = tracks;
    const { rows, more } = libraryRows(tracks, context);
    const canPlay = tracks.some(isLocalPlayable);
    host.innerHTML = `<div class="info ent">
        ${prev ? backHtml(prev) : opts.onFocusHere ? focusHereHtml : ''}
        ${entityCardHtml(target, entityCardMeta(target, tracks), { marks: marks.card, canPlay, image: target.type === 'album' ? albumImage(tracks) : null, covers: target.type === 'tag' ? tagCovers(tracks) : [] })}
        ${menuHtml({ links: externalLinks(target), entity: target, canQueue: queueTracks(app, tracks).length > 0, favs: marks.favs })}
        ${siteRowHtml(siteLinks({ type: target.type, name: target.name, artist: entity.artist || '' }))}
        <div data-discogs hidden></div>
        <div data-info-why></div>
        <div data-info-near></div>
        <div data-info-connections></div>
        <div data-info-library>${libraryHtml(rows, more)}</div>
        ${target.type === 'artist' || target.type === 'label' ? '<div data-info-missing></div>' : ''}
    </div>`;
    const root = host.firstElementChild;
    wireArtImage(root);
    dropBrokenCovers(root);
    // A visitor's entities have no links or Discogs identity: the name searches stay.
    if ((target.type === 'artist' || target.type === 'label') && !visitorHides('links')) { linkedSites(root, target.id, live); mountDiscogsImage(root, target, { panel, live }); }
    wireCommon(root, { panel, app, onFocusEntity: opts.onFocusEntity || null, onFocusHere: opts.onFocusHere || null });
    paintMarks = wireMarks(root, { panel, app, type: target.type, name: target.name, favs: marks.favs });
    wireEntity(root, { panel, app, target, tracks, entry, generation });
    panel._markPlaying?.();
    if (target.type !== 'tag') mountInfoFacts(root, { type: target.type, name: target.name, id: entity.id, artist: entity.artist || trim(tracks[0]?.artist), live });
    panel._loadMissing(target, generation);
    if (opts.focus) host.querySelector('button')?.focus();

    const [why, near, atlas] = await Promise.all([
        context ? panel._why(context, target) : null,
        panel._closest(target, { limit: SIMILAR_FETCH, types: NEAR_TYPES }),
        panel.atlasForNear(),
    ]);
    if (!live()) return;
    entry.closest = near;
    const whyMount = root.querySelector('[data-info-why]');
    if (whyMount && why?.length) whyMount.innerHTML = whyHtml(why, context.name);
    const colours = atlasColours(atlas, all);
    if (target.type === 'tag') {
        const fill = colours.colourFor(target.id)?.fill;
        const art = root.querySelector('[data-tag-art]');
        if (fill && art) { art.style.setProperty('--c', fill); art.classList.add('has-c'); }
    }
    const album = target.type === 'album';
    mountNear(root, {
        panel, app, target, all, atlas, colours, near: withoutOwn(near, target, tracks), ownAlbums: album ? [] : ownAlbums(tracks),
        centreColour: colours.colourFor(album ? albumArtistId(target.id, colours.isOnAtlas) : target.id),
    });
    if (atlas) paintLibrary(root.querySelector('[data-info-library]'), { panel, target, tracks, rows, more, colours });
}

/** A cover that fails to load leaves the empty frame. `error` doesn't bubble, so listen while it travels down. */
const dropBrokenCovers = (root) => root.addEventListener('error', (e) => { if (e.target?.tagName === 'IMG' && e.target.closest?.('.ik-cover')) e.target.remove(); }, true);

/** The atlas's colours for Info's items: an album or track takes its artist's, and sits beside it. Without the atlas every item stays neutral. */
function atlasColours(atlas, all) {
    const byId = new Map((all || []).map((t) => [`track:${t.id}`, t]));
    const colourFor = (id) => (atlas && id ? itemColour(atlas, id) : null);
    const isOnAtlas = (x) => Boolean(atlas?.byId?.has(x));
    const artistColour = (track) => colourFor(leadArtistId(track?.artist, isOnAtlas));
    const anchorOf = (item) => {
        if (item.type === 'album') return albumArtistId(item.id, isOnAtlas);
        if (item.type === 'track') return leadArtistId(byId.get(item.id)?.artist, isOnAtlas);
        return undefined;
    };
    const colourOf = (item) => {
        if (item.type === 'album') return colourFor(anchorOf(item));
        if (item.type === 'track') return artistColour(byId.get(item.id));
        return colourFor(item.id);
    };
    return { byId, colourFor, isOnAtlas, artistColour, anchorOf, colourOf };
}

/**
 * Near, from neighbours already without the target's own, below the card. Its map is folded by
 * default (the Map switch, kept on the panel for the session) and never shown on a graph route,
 * where the graph itself is the map. On Discover › Graph it adds the layer's outside music;
 * `panel.refreshNear` paints it again when that layer lands.
 */
function mountNear(root, { panel, app, target, all, atlas, colours, near, ownAlbums: albums = [], centreColour = null, centreAnchorId = null }) {
    const nearMount = root.querySelector('[data-info-near]');
    if (!nearMount) return;
    const { byId, anchorOf } = colours;
    const colourOf = (item) => (item.owned === false ? item.colour || null : colours.colourOf(item));
    const onGraph = onGraphRoute(app?._route), ports = !onGraph;
    const ui = { map: null };
    const render = () => {
        const groups = nearGroups(near, outsideForNear(app?._atlasView, target.id));
        const items = groups.flatMap((g) => g.items).map((item) => ({ ...item, colour: colourOf(item), anchorId: item.owned === false ? null : anchorOf(item) }));
        const layout = atlas && groups.length && !onGraph ? nearMapLayout({
            atlas, centreId: target.id, centreAnchorId, items, ownAlbums: albums, centreColour,
            width: nearMount.clientWidth || 316, height: isPhone() ? 120 : 132,
        }) : null;
        const open = Boolean(layout && panel.nearMapOpen);
        nearMount.innerHTML = nearHtml(groups, {
            entity: target, ports, off: panel.nearOff, colourOf, map: open ? nearMapSvg(layout) : '', mapSwitch: layout ? open : null,
            // By id (artist|album): two artists' albums can share a title.
            coverOf: (item) => (item.owned === false ? '' : albumImage(entityTracks(all || [], 'album', item.name).filter((t) => albumKey(t) === item.id))?.src || ''),
            trackOf: (item) => {
                const t = byId.get(item.id);
                return t ? nearTrackRow(t, target) : null;
            },
        });
        ui.map = nearMount.querySelector('[data-near]') ? wireNear(nearMount, { items, off: panel.nearOff }) : null;
    };
    render();
    wireNearList(nearMount, { panel, app, byId, ui, render });
    panel._near = { id: target.id, mount: nearMount, render };
}

/** In your library, painted (again, in the atlas's colours once they are in), keeping the focused row. */
function paintLibrary(mount, { panel, target, tracks, rows, more, colours = null }) {
    if (!mount || !rows.length) return;
    const active = globalThis.document?.activeElement;
    const focused = active && mount.contains(active) ? active.closest?.('[data-track-id]')?.dataset.trackId : null;
    mount.innerHTML = libraryHtml(colours ? rows.map((r) => ({ ...r, colour: colours.artistColour(r.track) })) : rows, more);
    wireLibrary(mount, { panel, target, tracks });
    panel._markPlaying?.();
    if (focused != null) [...mount.querySelectorAll('[data-track-id]')].find((r) => r.dataset.trackId === focused)?.focus();
}

/** One track row: ▶ plays (or toggles the current one); the row, or Enter on it, opens the track in Info. */
function wireTrackRows(scope, { panel, app, lookup, play }) {
    // The track already shown (its own row in In your library) stays put.
    const open = (track) => {
        const top = panel.history[panel.history.length - 1];
        if (track && !(top?.kind === 'track' && String(top.track?.id) === String(track.id))) panel.push({ kind: 'track', track });
    };
    scope.addEventListener('click', (e) => {
        const row = e.target.closest?.('.ik-row[data-track-id]');
        if (!row || !scope.contains(row)) return;
        const track = lookup(row.dataset.trackId);
        if (e.target.closest('[data-row-play]')) {
            if (!track) return;
            const player = app?.audioPlayer;
            if (player?.isCurrent?.(track.id)) player.toggle(); else play(track);
            return;
        }
        open(track);
    });
    scope.addEventListener('keydown', (e) => {
        const row = e.target.closest?.('.ik-row[data-track-id]');
        if (e.key === 'Enter' && row && !e.target.closest('[data-row-play]')) open(lookup(row.dataset.trackId));
    });
}

/** In your library: its rows and "+ N more". Safe to call again on a repainted mount: the listeners sit on it. */
function wireLibrary(mount, { panel, target, tracks }) {
    if (!mount) return;
    if (!mount._wired) {
        mount._wired = true;
        wireTrackRows(mount, { panel, app: panel.app, lookup: (id) => mount._tracks.find((t) => String(t.id) === id), play: (track) => panel._play(target, mount._tracks, track) });
        mount.addEventListener('click', (e) => { if (e.target.closest?.('[data-show-collection]')) panel._showInCollection(target); });
    }
    mount._tracks = tracks;
}

/** The entity's own albums for the map's sunflower, in first-seen order: every one is in the library. */
function ownAlbums(tracks) {
    const by = new Map();
    for (const t of tracks || []) {
        const name = trim(t.album);
        if (name) by.set(name, (by.get(name) || 0) + 1);
    }
    return [...by].map(([name, count]) => ({ name, count, owned: true }));
}

/** Near: the kind switches (kept on the panel, no re-render), the Map switch, outside items and its track rows. */
function wireNearList(mount, { panel, app, byId, ui, render }) {
    wireTrackRows(mount, {
        panel, app, lookup: (id) => byId.get(`track:${id}`),
        play: (track) => app.playLocalTrack?.(track, [track], { key: `track:${track.id}`, kind: 'track', label: track.title || 'Track', route: { view: 'track', id: String(track.id) } }),
    });
    mount.addEventListener('click', (e) => {
        if (e.target.closest?.('[data-near-map-switch]')) {
            panel.nearMapOpen = !panel.nearMapOpen;
            render();
            mount.querySelector('[data-near-map-switch]')?.focus();
            return;
        }
        // Music you don't own opens as the graph opens it: a walk for an artist or label, else Info.
        const out = e.target.closest?.('[data-near-outside]');
        if (out) {
            const layer = app?._atlasView?.layer, node = layer?.find(out.dataset.nearOutside);
            if (node) layer.walkTo(node);
            return;
        }
        const sw = e.target.closest?.('[data-near-kind]');
        if (!sw) return;
        const type = sw.dataset.nearKind;
        const off = !panel.nearOff.has(type);
        if (off) panel.nearOff.add(type); else panel.nearOff.delete(type);
        sw.classList.toggle('off', off); sw.classList.toggle('on', !off);
        mount.querySelector(`[data-near-line="${type}"]`)?.toggleAttribute('hidden', off);
        ui.map?.setOff(panel.nearOff);
    });
}

function wireEntity(root, { panel, app, target, tracks, entry, generation }) {
    root.querySelector('[data-open-page]')?.addEventListener('click', () => panel._openPage(target, tracks));
    root.querySelector('[data-play]')?.addEventListener('click', () => panel._play(target, tracks, null));
    root.querySelector('[data-shuffle]')?.addEventListener('click', () => panel._play(target, tracks, null, { shuffle: true }));
    root.querySelectorAll('[data-queue="next"],[data-queue="add"]').forEach((btn) => btn.addEventListener('click', () => {
        const ids = queueTracks(app, tracks).map((t) => String(t.id));
        trackActions(app, ids).find((a) => a.id === (btn.dataset.queue === 'next' ? 'play-next' : 'queue'))?.run();
    }));
    root.querySelector('[data-info-discogs]')?.addEventListener('click', () => {
        const mount = root.querySelector('[data-discogs]');
        if (!mount || !mount.hidden) return;
        mount.hidden = false;
        panel._startDiscogs(target, entry.closest || [], generation);
    });
    wireLibrary(root.querySelector('[data-info-library]'), { panel, target, tracks });
}

registerPanelView('track', {
    render(host, { track }, ctx) {
        topFor(ctx.panel, { kind: 'track', track });
        return renderInfo(host, ctx);
    },
});

/** An artist, label, tag or album: `context` drives Why near; `onFocusEntity` re-focuses the map from a Near name. */
registerPanelView('entity', {
    render(host, { entity }, ctx) {
        if (!ENTITY_TYPES.includes(entity?.type)) return undefined;
        topFor(ctx.panel, { kind: 'entity', entity });
        return renderInfo(host, ctx);
    },
});
