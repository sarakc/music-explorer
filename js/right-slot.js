// The right-hand slot: one column at the right of Collection and Discover with two fixed tabs, Gigs and Info. There is no ×: the slot
// collapses to a thin strip naming both tabs. Content stays with its owners:
// the detail panel renders into the Info pane (detail-panel.js), the gig panel
// into the Gigs pane (gig-panel.js). Pure rules first; the class is the DOM.
//
// Keys: Esc collapses, `]` toggles collapsed/expanded (⌘] stays browser
// forward). State `umm.rightSlot = { collapsed, tab, auto }`.
import { escapeHtml as esc } from './html.js';
import { VIEWER } from './viewer-profile.js';

export const SLOT_SECTIONS = ['collection', 'discover'];
// Sections whose slot has the Gigs tab as well as Info.
const GIG_SECTIONS = ['collection'];
export const TAB_LABELS = { gig: 'Gigs', discover: 'Discover', details: 'Info' };
const STORAGE_KEY = 'umm.rightSlot';

export const slotAllowed = (section) => SLOT_SECTIONS.includes(section);

/** What the slot shows in a section: Gigs and Info in Collection, Discover and Info in Discover, nothing elsewhere. */
export function slotView(state, section) {
    const tabs = !slotAllowed(section) ? [] : VIEWER ? ['details'] : GIG_SECTIONS.includes(section) ? ['gig', 'details'] : ['discover', 'details'];
    const tab = tabs.includes(state.tab) ? state.tab : tabs[0] || null;
    return { tabs, tab, hidden: !tabs.length, collapsed: !tabs.length || Boolean(state.collapsed) };
}

// `auto` marks a collapse the slot made itself because Info was empty. Anything
// the user does to the slot clears it, so a slot the user closed stays closed.
export const toggleCollapsed = (state) => ({ ...state, collapsed: !state.collapsed, auto: false });
export const collapseSlot = (state) => ({ ...state, collapsed: true, auto: false });
export const expandSlot = (state, tab = state.tab) => ({ ...state, tab, collapsed: false, auto: false });

/** Info has nothing to show: collapse to the strip, only when Info is the open tab. */
export function autoCollapse(state, section) {
    const v = slotView(state, section);
    return v.hidden || v.collapsed || v.tab !== 'details' ? state : { ...state, collapsed: true, auto: true };
}

/** Collapsed only because Info was empty, and Info is still the tab here: content opens it again. */
export function awaitsInfo(state, section) {
    const v = slotView(state, section);
    return Boolean(state.auto) && !v.hidden && v.collapsed && v.tab === 'details';
}

/** The first visit starts collapsed to the strip, on Gigs. */
export function readSlotState(storage = globalThis.localStorage) {
    const first = { tab: VIEWER ? 'details' : 'gig', collapsed: true, auto: false };
    try {
        const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
        if (!saved) return first;
        const collapsed = Boolean(saved.collapsed);
        return { tab: VIEWER ? 'details' : TAB_LABELS[saved.tab] ? saved.tab : 'gig', collapsed, auto: collapsed && Boolean(saved.auto) };
    } catch (_) { return first; }
}

export default class RightSlot {
    constructor({ app, storage = globalThis.localStorage } = {}) {
        this.app = app;
        this.storage = storage;
        this.state = readSlotState(storage);
        this.section = 'collection';
        this.panes = new Map();
        this.listeners = new Set();
    }

    /** Called with every change of what shows (tab, collapse, section). */
    onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

    get view() { return slotView(this.state, this.section); }
    /** Does the slot hold this tab in the current section? */
    has(tab) { return this.view.tabs.includes(tab); }
    /** Is this tab what the expanded slot shows right now? */
    shows(tab) { const v = this.view; return !v.collapsed && v.tab === tab; }

    _ensure() {
        if (this.el || typeof document === 'undefined') return;
        const el = document.createElement('aside');
        el.className = 'right-slot';
        el.hidden = true;
        el.innerHTML = '<button type="button" class="rs-handle" data-rs-collapse aria-label="Collapse side panel" title="Collapse (])">›</button><div class="rs-tabs" role="tablist" aria-label="Side panel"></div><div class="rs-strip"></div><div class="rs-panes"></div>';
        document.querySelector('.app-container')?.appendChild(el);
        el.addEventListener('click', (event) => {
            const t = event.target.closest('[data-rs-tab],[data-rs-expand],[data-rs-collapse]');
            if (!t) return;
            if (t.dataset.rsTab) this.select(t.dataset.rsTab);
            else if (t.dataset.rsExpand) this.expand(t.dataset.rsExpand);
            else this.collapse();
        });
        this.el = el;
    }

    /** The element a tab's owner renders into. Created on first use, kept for the session. */
    paneFor(tab, { tag = 'div', className = '' } = {}) {
        this._ensure();
        if (!this.panes.has(tab)) {
            const pane = document.createElement(tag);
            pane.className = `rs-pane ${className}`.trim();
            pane.dataset.rsPane = tab;
            pane.hidden = true;
            this.el.querySelector('.rs-panes').appendChild(pane);
            this.panes.set(tab, pane);
            this.render();
        }
        return this.panes.get(tab);
    }

    _store(state) {
        this.state = state;
        try { this.storage?.setItem(STORAGE_KEY, JSON.stringify({ collapsed: state.collapsed, tab: state.tab, auto: Boolean(state.auto) })); } catch (_) { /* a preference only */ }
    }

    /** `user` tells listeners whether the user moved the slot (a tab, the strip, `]`, Esc) or it moved by itself. */
    _set(next, { focus = null, user = true } = {}) {
        this.state = next;
        try { this.storage?.setItem(STORAGE_KEY, JSON.stringify({ collapsed: next.collapsed, tab: next.tab, auto: Boolean(next.auto) })); } catch (_) { /* a preference only */ }
        this.render();
        if (focus) focus();
        for (const fn of this.listeners) { try { fn(this.view, { user }); } catch (_) { /* never break the slot */ } }
    }

    /** Bring a tab forward and expand. `trigger` is where focus returns on collapse. Content calls this, so it is not the user's move. */
    open(tab, { trigger = null } = {}) {
        if (this.state.collapsed || !this.shows(tab)) this.trigger = trigger || (typeof document !== 'undefined' ? document.activeElement : null);
        this._set(expandSlot(this.state, tab), { user: false });
    }

    select(tab) { if (this.has(tab)) this._set(expandSlot(this.state, tab)); }

    expand(tab = null) { this._set(expandSlot(this.state, tab && this.has(tab) ? tab : this.state.tab)); }

    collapse({ restoreFocus = true } = {}) {
        if (this.view.collapsed) return false;
        this._set(collapseSlot(this.state), { focus: restoreFocus ? () => this._restoreFocus() : null });
        return true;
    }

    /** Info is empty: collapse to the strip when Info is the open tab, remembering it was automatic. True when it did. */
    autoCollapse({ restoreFocus = false } = {}) {
        const next = autoCollapse(this.state, this.section);
        if (next === this.state) return false;
        this._set(next, { focus: restoreFocus ? () => this._restoreFocus() : null, user: false });
        return true;
    }

    /** Discover's list has nothing to show (New Releases, Shortlist): collapse onto Info, as an automatic collapse. */
    park() {
        if (!this.shows('discover')) return;
        this._set({ ...this.state, tab: 'details', collapsed: true, auto: true }, { user: false });
    }

    /** Discover's list has content again: reopen it, unless the user closed the slot. */
    unpark() {
        if (this.section !== 'discover' || this.shows('discover') || (this.view.collapsed && !this.state.auto)) return;
        this._set({ ...this.state, tab: 'discover', collapsed: false, auto: false }, { user: false });
    }

    /** Collapsed only because Info was empty: content sent to Info opens it again. */
    get awaitsInfo() { return awaitsInfo(this.state, this.section); }

    _restoreFocus() { if (this.trigger?.isConnected && !this.el?.contains(this.trigger)) this.trigger.focus({ preventScroll: true }); }

    /** Esc: collapse an expanded slot. True when it did, so nothing else handles the key. */
    escape() { return this.collapse(); }

    /** `]`: collapse or expand. True when the slot has something to show. */
    toggle() {
        if (this.view.hidden) return false;
        if (this.view.collapsed) { this.trigger = typeof document !== 'undefined' ? document.activeElement : null; this._set(toggleCollapsed(this.state)); }
        else this.collapse();
        return true;
    }

    /** Route changes: outside Collection Gigs hides; outside the three sections the slot hides. Owners hear of it. */
    syncSection(section) {
        const changed = section !== this.section;
        this.section = section;
        // Discover opens on its own tab, closed: the map comes first, and the list opens when asked for.
        // Collection's tab and collapse come back when you return.
        if (changed && section === 'discover') {
            this._collectionState = this.state;
            this._store({ ...this.state, tab: 'discover', collapsed: true, auto: false });
        } else if (changed && section === 'collection' && this._collectionState) {
            this._store(this._collectionState);
            this._collectionState = null;
        }
        this.render();
        if (changed) for (const fn of this.listeners) { try { fn(this.view, { user: false }); } catch (_) { /* never break the slot */ } }
    }

    render() {
        if (typeof document === 'undefined') return;
        const container = document.querySelector('.app-container');
        const v = this.view;
        container?.classList.toggle('has-panel', !v.hidden && !v.collapsed);
        container?.classList.toggle('has-slot-strip', !v.hidden && v.collapsed);
        if (!this.el) return;
        this.el.hidden = v.hidden;
        this.el.classList.toggle('is-collapsed', v.collapsed);
        const tabs = this.el.querySelector('.rs-tabs');
        tabs.hidden = v.collapsed;
        tabs.innerHTML = v.collapsed ? '' : v.tabs.map((t) => `<span class="rs-tab${t === v.tab ? ' is-active' : ''}"><button type="button" role="tab" aria-selected="${t === v.tab}" data-rs-tab="${t}">${esc(TAB_LABELS[t])}</button></span>`).join('');
        const strip = this.el.querySelector('.rs-strip');
        strip.hidden = !v.collapsed;
        strip.innerHTML = v.collapsed ? v.tabs.map((t) => `<button type="button" class="rs-strip-tab" data-rs-expand="${t}" aria-label="Show ${esc(TAB_LABELS[t])}">${esc(TAB_LABELS[t])}</button>`).join('') : '';
        this.el.querySelector('.rs-handle').hidden = v.collapsed;
        for (const [tab, pane] of this.panes) pane.hidden = v.collapsed || v.tab !== tab;
    }
}
