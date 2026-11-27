// The phone's bottom tab bar (docs/specs/2026-11-21-phone-layout-design.md, part 2): sections,
// not views — Collection, Discover, Gigs and More, which holds Tools, Settings and Reload.
// phone.css shows it only on a phone; the viewer has none.
import { sectionOf } from './sections.js';
import { escapeHtml as esc } from './html.js';

const TABS = [['collection', 'Collection', '#/collection?as=graph'], ['discover', 'Discover', '#/discover'], ['gigs', 'Gigs', '#/gigs']];
const MORE = [['tools', 'Tools', '#/tagging'], ['settings', 'Settings', '#/settings']];

/** The tab a view lights: its section, with Tools and Settings under More. */
export function tabOf(view) {
    const section = sectionOf(view);
    return TABS.some(([id]) => id === section) ? section : 'more';
}

export function tabBarHtml(view) {
    const current = tabOf(view);
    const links = TABS.map(([id, label, href]) => `<a class="tab-bar-item${id === current ? ' is-active' : ''}" href="${esc(href)}" data-tab="${id}"${id === current ? ' aria-current="page"' : ''}>${label}</a>`);
    const more = `<button type="button" class="tab-bar-item${current === 'more' ? ' is-active' : ''}" data-tab-more aria-haspopup="menu" aria-expanded="false">More</button>`;
    return `<nav class="tab-bar" aria-label="Sections">${links.join('')}${more}</nav>`;
}

export function moreSheetHtml() {
    const rows = MORE.map(([id, label, href]) => `<a class="more-sheet-item" href="${esc(href)}" data-tab="${id}" role="menuitem">${label}</a>`);
    return `<div class="more-sheet" role="menu" aria-label="More" hidden>${rows.join('')}<button type="button" class="more-sheet-item" role="menuitem" data-reload>Reload</button></div>`;
}

export class TabBar {
    constructor({ doc = globalThis.document, win = globalThis } = {}) {
        this.doc = doc; this.win = win; this.view = 'collection'; this.el = null;
    }

    mount(parent) {
        this.el = this.doc.createElement('div');
        this.el.className = 'tab-bar-host';
        parent.appendChild(this.el);
        this._draw();
        this.el.addEventListener('click', (e) => {
            if (e.target.closest('[data-tab-more]')) return this.toggleMore();
            if (e.target.closest('[data-reload]')) return this.win.location.reload();
            // A tab goes where its sidebar entry goes, through the sidebar's own handler (which keeps
            // the filter and opens the last tool); the plain link is the fallback.
            const link = e.target.closest('a[data-tab]');
            const entry = link && this.doc.querySelector(`.nav-item[data-section="${link.dataset.tab}"]`);
            if (entry) { e.preventDefault(); entry.click(); }
            if (link) this.toggleMore(false);
            return undefined;
        });
        this.doc.addEventListener('pointerdown', (e) => { if (this._open() && !this.el.contains(e.target)) this.toggleMore(false); });
        this.doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this._open()) this.toggleMore(false); });
        this.win.addEventListener?.('hashchange', () => this.toggleMore(false));
        return this;
    }

    /** Mark the tab that owns `view`; any route change closes More. */
    sync(view) {
        this.view = view;
        if (this.el) this._draw();
    }

    toggleMore(open = !this._open()) {
        const sheet = this.el?.querySelector('.more-sheet');
        if (!sheet) return;
        sheet.hidden = !open;
        this.el.querySelector('[data-tab-more]')?.setAttribute('aria-expanded', String(open));
    }

    _open() { return this.el?.querySelector('.more-sheet')?.hidden === false; }

    _draw() { this.el.innerHTML = moreSheetHtml() + tabBarHtml(this.view); }
}

export default TabBar;
