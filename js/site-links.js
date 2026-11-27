// Bandcamp · Discogs · YouTube · WhoSampled at the end of every Info view, on keys b, d, y and w.
// Each opens the linked page when it is known (a linked Bandcamp page, a Discogs
// id, a release's sources), else that site's search; a searched link is dimmer.
// WhoSampled is always a search, and only for tracks, albums, releases and artists
// (it has no label or tag pages).
// Wikipedia comes last, with no key, only when the facts know an English article (`subject.wikipedia`
// is its title, or `addWikipediaLink` adds it once the facts arrive).
// Links open in one named window per site (umm-bandcamp, umm-discogs,
// umm-youtube, umm-whosampled, umm-wikipedia), so each site reuses one tab; the opener is cut so the site cannot
// reach back into the app.
import { bandcampSource } from './preview.js';
import { escapeHtml as esc } from './html.js';

export const SITES = [['bandcamp', 'Bandcamp', 'b'], ['discogs', 'Discogs', 'd'], ['youtube', 'YouTube', 'y'], ['whosampled', 'WhoSampled', 'w']];
const WHOSAMPLED_TYPES = ['track', 'album', 'release', 'artist'];
const KEY_SITE = Object.fromEntries(SITES.map(([site, , key]) => [key, site]));
const q = encodeURIComponent;
const wikipediaHref = (title) => `https://en.wikipedia.org/wiki/${q(String(title).trim().replace(/ /g, '_')).replace(/%2F/gi, '/')}`;
const DISCOGS_SEARCH_TYPE = { artist: 'artist', label: 'label' };

/**
 * The links for what Info shows. `subject`: { type, name, artist?, discogs?: { type, id },
 * bandcamp?: url, sources?, discogsReleaseId? } (type: track, album, release, artist, label, tag).
 */
export function siteLinks(subject = {}) {
    const { type, name = '', artist = '' } = subject;
    if (!String(name).trim()) return [];
    const text = ['track', 'album', 'release'].includes(type) && artist ? `${artist} ${name}` : String(name);
    const bandcamp = subject.bandcamp || bandcampSource(subject);
    const discogs = subject.discogs?.id ? `https://www.discogs.com/${subject.discogs.type}/${q(subject.discogs.id)}`
        : subject.discogsReleaseId ? `https://www.discogs.com/release/${q(subject.discogsReleaseId)}` : null;
    const href = {
        bandcamp: bandcamp || `https://bandcamp.com/search?q=${q(text)}`,
        discogs: discogs || `https://www.discogs.com/search/?q=${q(text)}&type=${DISCOGS_SEARCH_TYPE[type] || (type === 'tag' ? 'all' : 'release')}`,
        youtube: `https://www.youtube.com/results?search_query=${q(text)}`,
        whosampled: `https://www.whosampled.com/search/?q=${q(text)}`,
    };
    const known = { bandcamp: Boolean(bandcamp), discogs: Boolean(discogs), youtube: false, whosampled: false };
    const links = SITES.filter(([site]) => site !== 'whosampled' || WHOSAMPLED_TYPES.includes(type)).map(([site, label, key]) => ({ site, label, key, href: href[site], searched: !known[site] }));
    if (String(subject.wikipedia ?? '').trim()) links.push({ site: 'wikipedia', label: 'Wikipedia', key: '', href: wikipediaHref(subject.wikipedia), searched: false });
    return links;
}

const linkHtml = (l) => `<a href="${esc(l.href)}" target="umm-${l.site}" data-site="${l.site}"${l.key ? ` data-key="${l.key}"` : ''}${l.searched ? ' class="is-search"' : ''} title="${esc(`${l.searched ? `Search ${l.label}` : l.label}${l.key ? ` (${l.key})` : ''}`)}">${esc(l.label)}</a>`;

export function siteRowHtml(links) {
    if (!links?.length) return '';
    return `<nav class="dp-links site-links" aria-label="Elsewhere">${links.map(linkHtml).join('')}</nav>`;
}

/** Point one link at a page found later (a linked Bandcamp page, a Discogs identity). */
export function setSiteLink(root, site, href) {
    const a = root?.querySelector?.(`.site-links a[data-site="${site}"]`);
    if (!a || !href) return;
    a.href = href;
    a.classList.remove('is-search');
    a.title = `${a.textContent} (${a.dataset.key})`;
}

/** Add Wikipedia at the end of a drawn site row, once. */
export function addWikipediaLink(root, title) {
    const nav = root?.querySelector?.('.site-links');
    const link = String(title ?? '').trim() && siteLinks({ type: 'artist', name: '-', wikipedia: title }).find((l) => l.site === 'wikipedia');
    if (nav && link && !nav.querySelector('[data-site="wikipedia"]')) nav.insertAdjacentHTML('beforeend', linkHtml(link));
}

/** Open in the site's own window, reused across clicks, with the opener cut. */
export function openSite(href, site, win = globalThis.window) {
    const w = win?.open?.(href, `umm-${site}`);
    if (w) { try { w.opener = null; } catch (_) { /* cross-origin already */ } try { w.focus?.(); } catch (_) { /* best effort */ } }
    return w;
}

/** One listener for every site row in the page. */
export function wireSiteLinks(doc = globalThis.document) {
    doc?.addEventListener('click', (e) => {
        const a = e.target.closest?.('.site-links a[data-site]');
        if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        openSite(a.href, a.dataset.site);
    });
}

/** `b`, `d`, `y`, `w`: open that site for what Info shows. True when there was a link. */
export function openSiteKey(key, root) {
    const site = KEY_SITE[key];
    const a = site && root?.querySelector?.(`.site-links a[data-site="${site}"]`);
    if (!a) return false;
    openSite(a.href, site);
    return true;
}
