// Sidebar sections and the tab strip under each one. Pure: no DOM access
// beyond the renderer, no app state. The sidebar has one entry per section;
// a section with more than one view shows those views as tabs in the main
// header, so every sub-navigation looks the same.
import { escapeHtml as esc } from './html.js';

export const SECTIONS = {
    // Each tab but Playlists and Charts has a Grid | Graph switch (`?as=graph`); Favorites is ☆ on every tab.
    collection: { label: 'Collection', views: [['collection', 'Tracks'], ['artists', 'Artists'], ['albums', 'Albums'], ['labels', 'Labels'], ['tags', 'Tags'], ['playlists', 'Playlists'], ['charts', 'Charts']] },
    discover: { label: 'Discover', views: [['discover', 'Discover']] }, // Graph / New Releases / Shortlist are ?tab= values
    gigs: { label: 'Gigs', views: [['gigs', 'Gigs'], ['rekordbox', 'Rekordbox']] },
    // The Tools count is the number of tracks with staged changes. Cleanup's tab
    // stands for its sub-tools (CLEANUP_VIEWS), shown as links under the tabs.
    tools: { label: 'Tools', countKey: 'staged', views: [['tagging', 'Tagging'], ['formatting', 'Cleanup'], ['sound-check', 'Sound Check'], ['similarity', 'Similarity']] },
    settings: { label: 'Settings', views: [['settings', 'Settings']] },
};

// Views that live inside Collection without being tabs of it: entity pages
// and the Exploreme pseudo-view.
const COLLECTION_CHILDREN = new Set(['artist', 'label', 'tag', 'album', 'track', 'exploreme']);

/** Cleanup's sub-tools, in order. The Cleanup tab is active on any of them. */
export const CLEANUP_VIEWS = [['formatting', 'Formatting'], ['fields', 'Missing fields'], ['identities', 'Discogs'], ['paths', 'File paths'], ['duplicates', 'Duplicates'], ['storage', 'Storage']];
const CLEANUP_SET = new Set(CLEANUP_VIEWS.map(([v]) => v));
/** The tab a view lights up: Cleanup's sub-tools all light the Cleanup tab. */
export const tabViewOf = (view) => (CLEANUP_SET.has(view) ? 'formatting' : view);
export const isCleanupView = (view) => CLEANUP_SET.has(view);

const VIEW_SECTION = new Map();
for (const [section, def] of Object.entries(SECTIONS)) {
    for (const [view] of def.views) VIEW_SECTION.set(view, section);
}
for (const [view] of CLEANUP_VIEWS) VIEW_SECTION.set(view, 'tools');

/** Which sidebar entry owns a view. Unknown views fall back to Collection. */
export function sectionOf(view) {
    if (COLLECTION_CHILDREN.has(view)) return 'collection';
    return VIEW_SECTION.get(view) || 'collection';
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Labels for `?tab=` ids that are not just the id capitalised.
const TAB_LABELS = { new: 'New Releases' };

/** Tabs to show for a section: [] when the section has a single view and no
 *  `viewTabs`. `viewTabs` are `?tab=` ids of that single view (Discover). */
export function tabsFor(section, { counts = {}, viewTabs, hiddenViews = [] } = {}) {
    const def = SECTIONS[section];
    if (!def) return [];
    if (def.views.length < 2) {
        if (!viewTabs?.length) return [];
        return viewTabs.map((tab) => ({ view: def.views[0][0], tab, label: TAB_LABELS[tab] || cap(tab), count: 0 }));
    }
    return def.views.filter(([view]) => !hiddenViews.includes(view)).map(([view, label, countKey]) => ({
        view, label, count: countKey && counts[countKey] > 0 ? counts[countKey] : 0,
    }));
}

/** HTML for the tab strip. Empty string hides the strip. */
/** `hrefFor(view)` gives a tab's address when it is more than `#/<view>` (Collection: ☆ and each tab's Grid | Graph). */
export function sectionTabsHtml(section, view, { counts = {}, viewTabs, tab, hiddenViews = [], hrefFor = null } = {}) {
    const tabs = tabsFor(section, { counts, viewTabs, hiddenViews });
    if (!tabs.length) return '';
    return tabs.map((t) => {
        const active = t.tab ? t.tab === (tab || viewTabs[0]) : t.view === tabViewOf(view);
        const count = `<span class="section-tab-count" data-tab-count="${esc(t.view)}"${t.count ? '' : ' hidden'}>${t.count || ''}</span>`;
        // The first tab is the view's default: no `tab` in its URL.
        const query = t.tab && t.tab !== viewTabs[0] ? `?tab=${esc(t.tab)}` : '';
        const href = !t.tab && hrefFor ? hrefFor(t.view) : `#/${t.view}${query}`;
        return `<a class="section-tab${active ? ' is-active' : ''}" href="${esc(href)}" data-view="${esc(t.view)}"${t.tab ? ` data-tab="${esc(t.tab)}"` : ''} role="tab" aria-selected="${active}">${esc(t.label)}${count}</a>`;
    }).join('');
}

/** Cleanup's sub-tool links, or '' outside Cleanup. */
export function subtabsHtml(view) {
    if (!CLEANUP_SET.has(view)) return '';
    return CLEANUP_VIEWS.map(([v, label]) => `<a class="section-subtab${v === view ? ' is-active' : ''}" href="#/${esc(v)}" data-view="${esc(v)}"${v === view ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('');
}

/** Render into the strip element; hides it when there is nothing to show.
 *  `controlsHtml` (a header view's tab controls) goes last, after the tabs,
 *  and shows alone in a section with a single view. */
export function renderSectionTabs(el, section, view, opts = {}) {
    if (!el) return;
    const html = sectionTabsHtml(section, view, opts);
    const controls = opts.controlsHtml || '';
    patchHtml(el, html + controls);
    el.hidden = !html && !controls;
}

// What a switch between the two views changes in the header: the Grid | Graph switch's pressed
// state, and the links that carry the mode (a tab opens in the current mode).
const SWITCH_STATE = /(data-view-switch="\w+") class="(?:is-active)?" aria-pressed="(?:true|false)"/g;
const HREF = /\shref="[^"]*"/g;

/**
 * Draw `html` into `el` only when it changed; when only the switch's pressed state and the
 * links changed (a switch between the two views), they are set where they are, so the header
 * stays as it is. True when redrawn.
 */
export function patchHtml(el, html) {
    const key = html.replace(SWITCH_STATE, '$1').replace(HREF, '');
    // Anything else that wrote into `el` since (a cleared header, a count) means a redraw.
    if (el._drawn === key && el.innerHTML === el._drawnDom) {
        if (el._drawnHtml !== html) {
            const next = el.ownerDocument.createElement('template');
            next.innerHTML = html;
            const now = [...el.querySelectorAll('[href], [data-view-switch]')], want = [...next.content.querySelectorAll('[href], [data-view-switch]')];
            now.forEach((node, i) => {
                for (const name of ['href', 'class', 'aria-pressed']) {
                    const v = want[i]?.getAttribute(name);
                    if (v != null && node.getAttribute(name) !== v) node.setAttribute(name, v);
                }
            });
            el._drawnHtml = html; el._drawnDom = el.innerHTML;
        }
        return false;
    }
    el.innerHTML = html;
    el._drawn = key; el._drawnHtml = html; el._drawnDom = el.innerHTML;
    return true;
}

/** HTML for the sidebar: one entry per section, linking to its first view.
 *  `order` lists section ids; unlisted sections follow in declared order.
 *  `hidden` lists section ids to omit; `alwaysShow` names exceptions. */
export function sidebarHtml(sections, { order = [], hidden = [], counts = {}, alwaysShow = ['settings'] } = {}) {
    const ids = Object.keys(sections);
    const ordered = [...order.filter((id, i) => ids.includes(id) && order.indexOf(id) === i), ...ids.filter((id) => !order.includes(id))];
    return ordered.filter((id) => alwaysShow.includes(id) || !hidden.includes(id)).map((id) => {
        const { label, views } = sections[id];
        const first = views[0][0];
        const href = id === 'collection' ? '#/collection?as=graph' : `#/${esc(first)}`;
        // A section-wide count (Tools: staged tracks) or its first view's.
        const countKey = sections[id].countKey || views.map((v) => v[2]).find(Boolean);
        const n = countKey && counts[countKey] > 0 ? counts[countKey] : 0;
        const count = countKey ? `<span class="nav-count" data-nav-count="${esc(countKey)}"${n ? '' : ' hidden'}>${n || ''}</span>` : '';
        return `<a class="nav-item${id === 'settings' ? ' nav-item-last' : ''}" href="${href}" data-view="${esc(first)}" data-section="${esc(id)}"><span class="nav-label">${esc(label)}</span>${count}</a>`;
    }).join('');
}

export function renderSidebar(nav, sections, opts) {
    if (nav) nav.innerHTML = sidebarHtml(sections, opts);
}
