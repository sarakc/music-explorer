// Sidebar drawer — the left nav can be pushed shut so the table gets the full
// width. State lives in localStorage so it survives reloads, same pattern as
// DensityManager and SkinManager. The container gets `.sidebar-collapsed`;
// main.css collapses the grid column and hides the aside behind it.

export const SIDEBAR_KEY = 'umm.sidebar';
const COLLAPSED_CLASS = 'sidebar-collapsed';

export class SidebarDrawer {
    constructor({ storage = globalThis.localStorage, container } = {}) {
        this.storage = storage;
        this.container = container;
        this.open = true;
        this._button = null;
    }

    load() {
        let stored = null;
        try { stored = this.storage?.getItem(SIDEBAR_KEY); } catch { /* private mode etc. */ }
        this.set(stored !== 'closed', { persist: false });
    }

    set(open, { persist = true } = {}) {
        this.open = !!open;
        this.container?.classList.toggle(COLLAPSED_CLASS, !this.open);
        if (persist) {
            try { this.storage?.setItem(SIDEBAR_KEY, this.open ? 'open' : 'closed'); } catch { /* ignore */ }
        }
        this._syncButton();
    }

    toggle() {
        this.set(!this.open);
    }

    // Small chevron at the far left of the top bar. Rotates to point the way
    // the drawer will move, so it doubles as the state indicator.
    mountToggle(parent) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sidebar-toggle';
        btn.title = 'Toggle sidebar (⌘\\)';
        btn.innerHTML = '<span class="sidebar-toggle-glyph" aria-hidden="true"></span>';
        btn.addEventListener('click', () => this.toggle());
        parent.prepend(btn);
        this._button = btn;
        this._syncButton();
        return btn;
    }

    _syncButton() {
        if (!this._button) return;
        this._button.setAttribute('aria-label', this.open ? 'Hide sidebar' : 'Show sidebar');
        this._button.setAttribute('aria-expanded', String(this.open));
    }
}

export default SidebarDrawer;
