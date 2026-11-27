// The detail panel's Discogs parts: what Discogs knows around an artist or label
// (identity, relations, profile), and the releases of its cached discography
// that are not owned. Pure rendering and state helpers; the panel does the loading.
//
// States: loading | ambiguous | unresolved | unavailable | empty | ready | stale | disconnected
import { discogsPlainText, isFresh } from './entity-relations.js';
import { normaliseTitle } from './label-gap.js';
import { escapeHtml } from './html.js';
import { releaseRowHtml, rowsHtml } from './info-items.js';

export const DISCOGS_STATES = ['loading', 'ambiguous', 'unresolved', 'unavailable', 'empty', 'ready', 'stale', 'disconnected'];
export const MISSING_ROWS = 7;

const fetchedDate = (value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
};
const discogsEntityUrl = (type, id) => `https://www.discogs.com/${type}/${encodeURIComponent(id)}`;

// `${type}:${discogsId}` -> library entity id, for every relation endpoint that
// resolved to something the user owns. Lets a chip focus a local entity
// instead of leaving for Discogs.
export function relationLocals(relations) {
    const out = {};
    for (const r of Array.isArray(relations) ? relations : []) {
        for (const p of [r?.from, r?.to]) {
            if (p?.local && p.discogsId != null) out[`${p.type}:${p.discogsId}`] = p.local;
        }
    }
    return out;
}

/**
 * Where a cached lookup stands. `identity` is the stored entity_identity row (or
 * null), `row` the stored relations row. Nothing cached and nothing asked is
 * not a finding: it reads as `loading` only when a queue will fill it in,
 * otherwise as null (the panel then shows nothing).
 */
export function discogsStateFor({ connected, identity = null, row = null, queued = false, failed = false, now = Date.now() } = {}) {
    if (failed) return 'unavailable';
    if (identity?.resolution === 'ambiguous') return 'ambiguous';
    if (identity?.resolution === 'unresolved') return 'unresolved';
    if (identity?.resolution === 'confirmed' && row) {
        const lists = Object.entries(row.relations || {}).filter(([k]) => k !== 'namevariations').map(([, v]) => v);
        const nothing = lists.every((v) => v == null || (Array.isArray(v) && v.length === 0)) && !(row.profile || '').trim();
        if (nothing) return 'empty';
        return isFresh(row, now) ? 'ready' : 'stale';
    }
    if (!connected && !row) return 'disconnected';
    return queued ? 'loading' : null;
}

export const discogsName = (name) => String(name ?? '').replace(/\s+\(\d+\)$/, '').replace(/\*$/, '').trim();

/** One entry of a cached `discogs_releases` record, as the release panel takes it. */
export function cachedRelease(e, { type = 'artist', name = '' } = {}) {
    const master = e.type === 'master';
    const discogsReleaseId = master ? (e.mainRelease ? String(e.mainRelease) : null) : String(e.id);
    const sourceId = master ? `master:${e.id}` : String(e.id);
    return {
        key: `release:discogs:${discogsReleaseId || sourceId}`, title: String(e.title),
        artist: discogsName(e.artist) || (type === 'artist' ? name : ''),
        label: type === 'label' ? name : String(e.label || '').split(',')[0].trim(),
        year: Number(e.year) || null, ...(e.format ? { format: e.format } : {}), ...(e.thumb ? { cover: e.thumb } : {}),
        ...(discogsReleaseId ? { discogsReleaseId } : {}),
        sources: [{ source: 'discogs', id: sourceId, url: `https://www.discogs.com/${master ? 'master' : 'release'}/${e.id}` }],
    };
}

/**
 * The releases not owned (newest first, one per normalised title): `rows` for
 * the panel, `more` counting the rest. Owned means the title matches an owned
 * album or track title.
 */
export function missingReleases(releasesRow, ownedTitles = [], { type = 'artist', name = '', limit = MISSING_ROWS } = {}) {
    const owned = new Set(ownedTitles.map(normaliseTitle).filter(Boolean));
    const seen = new Set(), all = [];
    const list = Array.isArray(releasesRow?.releases) ? releasesRow.releases : [];
    for (const r of [...list].sort((a, b) => (Number(b?.year) || 0) - (Number(a?.year) || 0))) {
        const key = normaliseTitle(r?.title);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (!owned.has(key)) all.push(cachedRelease(r, { type, name }));
    }
    return { rows: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}

/** "Not in your library": a row opens the release; + N more opens the page's gap section. Nothing missing: no section. */
export function missingReleasesHtml({ rows = [], more = 0 } = {}, { entityType = 'artist' } = {}) {
    if (!rows.length) return '';
    const row = (r, i) => releaseRowHtml({ index: i, title: r.title, artist: entityType === 'label' ? r.artist : '', year: r.year });
    return `<section class="dp-section dp-missing"><h4>Not in your library</h4>${rowsHtml(rows.map(row))}${more ? `<button type="button" class="dp-more" data-releases-all>+ ${more} more</button>` : ''}</section>`;
}

function chipsFor(entityType, row, locals) {
    const rel = row.relations || {};
    const chip = (item, suffix = '') => {
        const local = locals[`${entityType}:${item.id}`];
        const target = local ? `data-rel-local="${escapeHtml(local)}"` : `data-rel-url="${escapeHtml(discogsEntityUrl(entityType, item.id))}"`;
        return `<button type="button" class="dp-chip${local ? '' : ' is-outside'}" ${target}>${escapeHtml(item.name)}${escapeHtml(suffix)}</button>`;
    };
    const group = (label, items) => (Array.isArray(items) && items.length
        ? `<div class="dp-group"><div class="dp-label">${label}</div><div class="dp-chips">${items.map((item) => chip(item)).join('')}</div></div>` : '');
    if (entityType === 'artist') return group('Aliases', rel.aliases) + group('Members', rel.members) + group('Groups', rel.groups);
    const family = [...(Array.isArray(rel.sublabels) ? rel.sublabels : [])];
    if (rel.parentLabel) family.push({ ...rel.parentLabel, parent: true });
    return family.length ? `<div class="dp-group"><div class="dp-label">Label family</div><div class="dp-chips">${family.map((item) => chip(item, item.parent ? ' · parent' : '')).join('')}</div></div>` : '';
}

/** + N more: the artist's or label's page, scrolled to its gap section once it has drawn. */
export function openGapSection(app, target, { tries = 40, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    app.navigate({ view: target.type, name: target.name });
    return (async () => {
        for (let i = 0; i < tries; i++) {
            await wait(100);
            const section = globalThis.document?.querySelector('#lpGapSection, #apGapSection');
            if (section) { section.scrollIntoView({ block: 'start' }); return true; }
        }
        return false;
    })();
}

export function renderDiscogsSection(state, row, { entityType = 'artist', name = '', identity = null, locals = {} } = {}) {
    const title = row?.fetchedAt ? ` title="Discogs · fetched ${fetchedDate(row.fetchedAt)}${state === 'stale' ? ' · stale' : ''}"` : '';
    let body = '';
    if (state === 'loading') body = '<div class="dp-skel" style="width:70%"></div><div class="dp-skel" style="width:52%"></div>';
    else if (state === 'disconnected') body = '<a class="dp-note dp-link" href="#/settings" data-discogs-connect>Connect Discogs in Settings</a>';
    else if (state === 'ambiguous') body = `<div class="dp-note">Which one?</div><div class="dp-chips">${
        (identity?.candidates || []).map((item) => `<button type="button" class="dp-chip" data-discogs-pick="${escapeHtml(item.id)}" data-discogs-name="${escapeHtml(item.name)}">${escapeHtml(item.name)}</button>`).join('')
    }</div>`;
    else if (state === 'unresolved') body = `<div class="dp-note">No Discogs match for “${escapeHtml(name)}”.</div><button type="button" class="dp-chip" data-discogs-retry>Search again</button>`;
    else if (state === 'unavailable') body = '<div class="dp-note">Discogs unavailable.</div><button type="button" class="dp-chip" data-discogs-retry>Retry</button>';
    else if (state === 'empty') body = '<div class="dp-note">Nothing listed.</div>';
    else if (row) {
        body = chipsFor(entityType, row, locals);
        const profile = discogsPlainText(row.profile);
        if (profile) body += `<details class="dp-profile"><summary>Profile</summary><blockquote>${escapeHtml(profile)}</blockquote></details>`;
        if (!body) body = '<div class="dp-note">Nothing listed.</div>';
    }
    return `<section class="dp-section dp-discogs" data-discogs-state="${escapeHtml(state)}"${title}><h4>On Discogs</h4>${body}</section>`;
}
