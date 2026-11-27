// Queue panel — the non-modal list that opens above the dock from its queue
// button.
//
// The panel owns no queue state. It renders whatever the player publishes
// through `subscribe()` and sends every edit back through the player's public
// methods, so persistence, the 409 rebase and other tabs all stay in one place.
// `queuePanelSections()` and `queuePanelHtml()` are pure so tests can cover
// them without a DOM.

import { coverArtUrl, hasCoverArt } from './cover-art.js';
import { formatPlayerTime } from './player.js';
import * as Q from './play-queue.js';
import { escapeHtml as esc } from './html.js';
import { localRect, viewRect, viewSize } from './phone.js';

export const CONTEXT_PAGE = 50;
export const UNDO_MS = 6000;


const HANDLE = '<svg viewBox="0 0 10 16" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="3" cy="3" r="1.3"/><circle cx="7" cy="3" r="1.3"/><circle cx="3" cy="8" r="1.3"/><circle cx="7" cy="8" r="1.3"/><circle cx="3" cy="13" r="1.3"/><circle cx="7" cy="13" r="1.3"/></svg>';

/**
 * What the panel shows, in order. Rows carry a stable `key` so focus survives
 * a repaint. History is newest first.
 */
export function queuePanelSections(queue, { trackFor = () => null, contextLimit = CONTEXT_PAGE } = {}) {
    const row = (section, key, trackId, extra = {}) => ({ section, key, trackId, track: trackFor(trackId), ...extra });
    const current = queue.current;
    const upNext = queue.upNext.map((e, index) => row('up', `up:${e.entryId}`, e.trackId, { entryId: e.entryId, index }));
    const context = queue.context;
    const contextRows = Q.upcoming(queue, contextLimit).map((e) => row('ctx', `ctx:${e.position}`, e.trackId, { position: e.position }));
    const history = [...queue.history].reverse().map((e, i) => row('hist', `hist:${e.entryId}:${i}`, e.trackId));
    return {
        empty: !current && !upNext.length && !contextRows.length,
        now: current ? row('now', `now:${current.entryId}`, current.trackId) : null,
        upNext,
        context: context ? {
            label: context.label || 'list',
            route: context.route || null,
            rows: contextRows,
            remaining: Math.max(0, Q.upcomingCount(queue) - contextRows.length),
            repeats: queue.repeat === 'all',
        } : null,
        history,
        ended: Boolean(current) && !Q.hasNext(queue),
    };
}

/**
 * Selection after a click or key on an Up next row. `order` is the Up next
 * entry ids; `mode` is 'one' (click), 'toggle' (Cmd/Ctrl-click, Space) or
 * 'range' (Shift-click, Shift+arrow, from the anchor).
 */
export function selectRows({ order, selected, anchor, id, mode }) {
    if (mode === 'toggle') {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        return { selected: next, anchor: id };
    }
    const from = order.indexOf(anchor);
    const to = order.indexOf(id);
    if (mode !== 'range' || from < 0) return { selected: new Set([id]), anchor: id };
    return { selected: new Set(order.slice(Math.min(from, to), Math.max(from, to) + 1)), anchor };
}

/**
 * Where a dragged block lands, as `moveEntries`' toIndex. `selected` is the
 * block's Up next indices, ascending; `over` is the row under the pointer and
 * `after` whether the pointer is on its lower half. -1 means a drop inside
 * the block, which does nothing.
 */
export function blockDropIndex(selected, over, after) {
    if (selected.includes(over)) return -1;
    const slot = over + (after ? 1 : 0);
    return slot - selected.filter((i) => i < slot).length;
}

function rowHtml(r, { focusKey, selected }) {
    const t = r.track || {};
    // Queue rows use their whole content as the selection target. Navigation
    // stays in the row menu so title/artist text cannot swallow Shift-click.
    const title = `<span class="queue-title">${esc(t.title || 'Unknown track')}</span>`;
    const artist = t.artist
        ? `<span class="queue-artist">${esc(t.artist)}</span>`
        : '<span class="queue-artist"></span>';
    const art = hasCoverArt(t)
        ? `<span class="queue-art" aria-hidden="true"><img src="${esc(coverArtUrl(t))}" alt="" loading="lazy"></span>`
        : '<span class="queue-art" aria-hidden="true"></span>';
    const handle = r.section === 'up' ? `<span class="queue-handle" data-queue-handle aria-hidden="true" title="Drag to reorder">${HANDLE}</span>` : '<span></span>';
    const isNow = r.section === 'now';
    const isSelected = Boolean(r.entryId && selected.has(r.entryId));
    const attrs = [
        'class="queue-row' + (isNow ? ' is-current' : '') + (isSelected ? ' is-selected' : '') + '"',
        `data-key="${esc(r.key)}"`,
        `data-section="${r.section}"`,
        `data-track-id="${esc(r.trackId)}"`,
        r.entryId ? `data-entry-id="${esc(r.entryId)}"` : '',
        r.index != null ? `data-index="${r.index}"` : '',
        r.position != null ? `data-position="${r.position}"` : '',
        `tabindex="${r.key === focusKey ? 0 : -1}"`,
        isNow ? 'aria-current="true"' : '',
    ].filter(Boolean).join(' ');
    const duration = Number(t.duration) > 0 ? formatPlayerTime(t.duration) : '';
    return `<li ${attrs}>${handle}${art}<span class="queue-copy">${isSelected ? '<span class="queue-sr">Selected, </span>' : ''}${title}${artist}</span>`
        + `<span class="queue-duration">${duration}</span>`
        + `<button type="button" class="queue-menu-btn" data-queue-menu aria-label="More for ${esc(t.title || 'track')}" aria-haspopup="menu" aria-expanded="false" tabindex="-1">⋯</button></li>`;
}

function bulkBarHtml(upNext, selected, focusKey) {
    const count = upNext.filter((r) => selected.has(r.entryId)).length;
    if (!count) return '';
    const focused = upNext.find((r) => r.key === focusKey);
    const canMove = Boolean(focused && !selected.has(focused.entryId));
    return `<div class="queue-bulk" role="toolbar" aria-label="Selected tracks">
        <button type="button" class="queue-text-btn" data-queue-action="bulk-top">Move to top</button>
        <button type="button" class="queue-text-btn" data-queue-action="bulk-move" title="Move before the focused track"${canMove ? '' : ' disabled'}>Move…</button>
        <button type="button" class="queue-text-btn" data-queue-action="bulk-remove">Remove (${count})</button>
        <button type="button" class="queue-text-btn" data-queue-action="bulk-clear">Clear selection</button>
    </div>`;
}

/**
 * Panel body markup. `focusKey` is the row that keeps tabindex 0; `selected`
 * holds the selected Up next entry ids.
 */
export function queuePanelHtml(sections, { historyOpen = false, focusKey = '', selected = new Set() } = {}) {
    if (sections.empty && !sections.history.length) return '<div class="queue-empty">Queue is empty</div>';
    const rows = (list) => list.map((r) => rowHtml(r, { focusKey, selected })).join('');
    const parts = [];
    if (sections.now) {
        parts.push(`<section class="queue-section" aria-labelledby="queueNowHead">
            <div class="queue-section-head"><span id="queueNowHead">Now playing</span></div>
            <ul class="queue-list">${rows([sections.now])}</ul>
            ${sections.ended ? '<div class="queue-end">End of queue</div>' : ''}
        </section>`);
    }
    if (sections.upNext.length) {
        parts.push(`<section class="queue-section" aria-labelledby="queueUpHead">
            <div class="queue-section-head"><span id="queueUpHead">Up next</span><button type="button" class="queue-text-btn" data-queue-action="clear">Clear</button></div>
            ${bulkBarHtml(sections.upNext, selected, focusKey)}
            <ul class="queue-list" data-queue-list="up" aria-describedby="queueReorderHelp">${rows(sections.upNext)}</ul>
            <span id="queueReorderHelp" class="queue-sr">Space or Shift selects. Alt+Up and Alt+Down move.</span>
        </section>`);
    }
    const ctx = sections.context;
    if (ctx && ctx.rows.length) {
        const label = ctx.route
            ? `<a href="#" data-queue-action="open-context">${esc(ctx.label)}</a>`
            : esc(ctx.label);
        parts.push(`<section class="queue-section" aria-labelledby="queueCtxHead">
            <div class="queue-section-head"><span id="queueCtxHead">Next from ${label}</span></div>
            <ul class="queue-list">${rows(ctx.rows)}</ul>
            ${ctx.remaining ? `<div class="queue-more"><button type="button" class="queue-text-btn" data-queue-action="more">Show more</button></div>` : ''}
        </section>`);
    }
    if (sections.history.length) {
        parts.push(`<section class="queue-section">
            <button type="button" class="queue-disclosure" data-queue-action="history" aria-expanded="${historyOpen}">Recently played</button>
            ${historyOpen ? `<ul class="queue-list">${rows(sections.history)}</ul>` : ''}
        </section>`);
    }
    return parts.join('');
}

/** Menu items for a row, as [action, label]. */
export function rowMenuItems(section) {
    return [
        ['play-next', 'Play next'],
        ...(section === 'up' ? [['remove', 'Remove']] : []),
        ['open-track', 'Open track'],
        ['open-artist', 'Open artist'],
    ].filter(([action]) => !(section === 'now' && action === 'play-next'));
}

/** `q` toggles the panel everywhere; Shift+Q adds the current targets. */
export function queueKeyAction({ shiftKey = false, targets = 0, hasCurrent = false }) {
    if (shiftKey) return targets > 0 ? 'queue' : 'none';
    return hasCurrent ? 'toggle' : 'none';
}

export default class QueuePanel {
    /**
     * @param {Object} o
     * @param {HTMLElement} o.host   The dock host; the panel is appended to it.
     * @param {Object} o.player      LocalAudioPlayer.
     * @param {Object} o.app         For navigate() and _openGigLanePicker().
     */
    constructor({ host, player, app }) {
        this.host = host;
        this.player = player;
        this.app = app;
        this.open = false;
        this.contextLimit = CONTEXT_PAGE;
        this.historyOpen = false;
        this.focusKey = '';
        this._contextId = null;
        this._drag = null;
        this.selected = new Set();
        this._anchor = null;

        this.el = document.createElement('aside');
        this.el.className = 'queue-panel';
        this.el.id = 'queuePanel';
        this.el.setAttribute('role', 'region');
        this.el.setAttribute('aria-label', 'Queue');
        this.el.hidden = true;
        this.el.innerHTML = `
            <header class="queue-panel-head">
                <h2>Queue</h2>
                <button type="button" class="queue-icon-btn" data-queue-action="options" aria-label="Queue options" aria-haspopup="menu" aria-expanded="false" title="Queue options">⋯</button>
                <button type="button" class="queue-icon-btn" data-queue-action="close" aria-label="Close queue" title="Close">×</button>
            </header>
            <div class="queue-panel-body"></div>
            <div class="queue-sr" aria-live="polite" data-queue-live></div>`;
        this.body = this.el.querySelector('.queue-panel-body');
        this.live = this.el.querySelector('[data-queue-live]');
        this.host.appendChild(this.el);
        this.button = this.host.querySelector('[data-player-action="queue"]');
        this.button?.setAttribute('aria-controls', 'queuePanel');

        player.onQueueButton = () => this.toggle();
        this._unsubscribe = player.subscribe(() => {
            if (!this.open) return;
            if (this.host.hidden) this.close({ restoreFocus: false });
            else this.render();
        });
        this._wire();
    }

    toggle() { return this.open ? this.close() : this.show(); }

    show() {
        this.open = true;
        this.el.hidden = false;
        this.button?.setAttribute('aria-expanded', 'true');
        this.button?.setAttribute('aria-pressed', 'true');
        this.render();
        const target = this.body.querySelector('.queue-row[tabindex="0"]') || this.body.querySelector('.queue-row');
        (target || this.el.querySelector('[data-queue-action="close"]'))?.focus();
    }

    close({ restoreFocus = true } = {}) {
        this._closeMenu();
        this.open = false;
        this.el.hidden = true;
        this.button?.setAttribute('aria-expanded', 'false');
        this.button?.setAttribute('aria-pressed', 'false');
        if (restoreFocus) this.button?.focus();
    }

    render() {
        const queue = this.player.queue;
        // A new list resets paging; the same list keeps "Show more".
        const contextId = queue.context?.id || null;
        if (contextId !== this._contextId) { this._contextId = contextId; this.contextLimit = CONTEXT_PAGE; }
        const sections = queuePanelSections(queue, { trackFor: (id) => this.player.trackFor(id), contextLimit: this.contextLimit });
        this._sections = sections;
        const hadFocus = this.el.contains(document.activeElement) && document.activeElement?.classList?.contains('queue-row');
        const keys = [sections.now, ...sections.upNext, ...(sections.context?.rows || []), ...(this.historyOpen ? sections.history : [])]
            .filter(Boolean).map((r) => r.key);
        if (!keys.includes(this.focusKey)) this.focusKey = keys[0] || '';
        const live = new Set(queue.upNext.map((e) => e.entryId));
        for (const id of this.selected) if (!live.has(id)) this.selected.delete(id);
        this.body.innerHTML = queuePanelHtml(sections, { historyOpen: this.historyOpen, focusKey: this.focusKey, selected: this.selected });
        const options = this.el.querySelector('[data-queue-action="options"]');
        if (options) options.hidden = sections.empty;
        for (const img of this.body.querySelectorAll('.queue-art img')) img.addEventListener('error', () => img.remove(), { once: true });
        if (hadFocus) this._focusRow(this.focusKey);
    }

    _row(key) { return key ? this.body.querySelector(`.queue-row[data-key="${CSS.escape(key)}"]`) : null; }

    _focusRow(key) {
        const row = this._row(key);
        if (!row) return;
        for (const r of this.body.querySelectorAll('.queue-row[tabindex="0"]')) r.tabIndex = -1;
        row.tabIndex = 0;
        this.focusKey = key;
        row.focus();
    }

    _announce(message) {
        this.live.textContent = '';
        // A fresh text node after clearing makes screen readers repeat an identical message.
        setTimeout(() => { this.live.textContent = message; }, 30);
    }

    // ---- Selection (Up next only) --------------------------------------------------

    _upNextIds() { return this.player.queue.upNext.map((e) => e.entryId); }

    /** Selected entry ids in queue order. */
    _selectedIds() { return this._upNextIds().filter((id) => this.selected.has(id)); }

    _select(entryId, mode) {
        const out = selectRows({ order: this._upNextIds(), selected: this.selected, anchor: this._anchor, id: entryId, mode });
        this.selected = out.selected;
        this._anchor = out.anchor;
        this.render();
    }

    _clearSelection() {
        this.selected = new Set();
        this._anchor = null;
        this.render();
    }

    _movedMessage(count, to) {
        return count > 1 ? `Moved ${count} tracks to position ${to + 1}` : `Moved to position ${to + 1}`;
    }

    _moveBlock(ids, to) {
        if (!this.player.moveEntries(ids, to)) return;
        this._focusRow(this.focusKey);
        this._announce(this._movedMessage(ids.length, Math.max(0, Math.min(this.player.queue.upNext.length - ids.length, to))));
    }

    // Alt+Up/Down on a selected row moves the block one place.
    _moveSelection(delta) {
        const ids = this._selectedIds();
        const first = this.player.queue.upNext.findIndex((e) => this.selected.has(e.entryId));
        if (first < 0) return;
        this._moveBlock(ids, Math.max(0, first + delta));
    }

    _removeSelection() {
        const ids = this._selectedIds();
        if (!ids.length) return;
        const previous = this.player.queue.upNext;
        const rows = [...this.body.querySelectorAll('.queue-row')];
        const lastSelected = rows.findLastIndex((r) => this.selected.has(r.dataset.entryId));
        const neighbour = rows.slice(lastSelected + 1).find((r) => !this.selected.has(r.dataset.entryId))
            || rows.slice(0, lastSelected).reverse().find((r) => !this.selected.has(r.dataset.entryId));
        this.focusKey = neighbour?.dataset.key || '';
        this.selected = new Set();
        this._anchor = null;
        if (!this.player.removeEntries(ids)) return;
        this._focusRow(this.focusKey);
        const message = ids.length === 1 ? 'Removed from queue' : `Removed ${ids.length} tracks`;
        this._announce(message);
        this._offerUndo(message, previous);
    }

    _clearUpNext() {
        const previous = this.player.queue.upNext;
        this.selected = new Set();
        this._anchor = null;
        if (!this.player.clearUpNext()) return;
        this._announce('Up next cleared');
        this._offerUndo('Up next cleared', previous);
    }

    // Client-side only: Undo puts the removed rows back with one save and does
    // not survive a reload.
    _offerUndo(message, previousUpNext) {
        this._dismissUndo();
        const toast = document.createElement('div');
        toast.className = 'notification queue-undo';
        toast.setAttribute('role', 'status');
        toast.innerHTML = `<span>${esc(message)}</span><button type="button" class="queue-text-btn">Undo</button>`;
        toast.querySelector('button').addEventListener('click', () => {
            this._dismissUndo();
            if (this.player.restoreUpNext(previousUpNext)) this._announce('Restored');
        });
        document.body.appendChild(toast);
        this._undo = { toast, timer: setTimeout(() => this._dismissUndo(), UNDO_MS) };
    }

    _dismissUndo() {
        if (!this._undo) return;
        clearTimeout(this._undo.timer);
        this._undo.toast.remove();
        this._undo = null;
    }

    // ---- Row actions -------------------------------------------------------------

    _activate(row) {
        const { section, entryId, position } = row.dataset;
        if (section === 'up') this.player.jumpToUpNext(entryId);
        else if (section === 'ctx') this.player.jumpToContextPosition(Number(position));
        else if (section === 'now') this.player.toggle();
    }

    _move(row, delta) {
        if (row.dataset.section !== 'up') return;
        const from = Number(row.dataset.index);
        const to = Math.max(0, Math.min(this.player.queue.upNext.length - 1, from + delta));
        if (to === from) return;
        this.focusKey = row.dataset.key;
        this.player.moveEntry(from, to);
        this._focusRow(this.focusKey);
        this._announce(`Moved to position ${to + 1}`);
    }

    _runRowAction(action, row) {
        const { section, entryId, trackId } = row.dataset;
        const track = this.player.trackFor(trackId);
        switch (action) {
            case 'play-next':
                if (section === 'up') this.player.moveToFront(entryId);
                else if (track) this.player.playNext([track]);
                this._announce('Playing next');
                break;
            case 'remove': {
                const rows = [...this.body.querySelectorAll('.queue-row')];
                const neighbour = rows[rows.indexOf(row) + 1] || rows[rows.indexOf(row) - 1];
                this.focusKey = neighbour?.dataset.key || '';
                this.player.removeEntry(entryId);
                this._focusRow(this.focusKey);
                this._announce('Removed from queue');
                break;
            }
            case 'open-track':
                this.app?.navigate?.({ view: 'track', id: trackId });
                break;
            case 'open-artist':
                if (track?.artist) this.app?.navigate?.({ view: 'artist', name: track.artist });
                break;
            default:
        }
    }

    // ---- Menus -------------------------------------------------------------------

    _openMenu(anchor, items, onPick) {
        this._closeMenu();
        const menu = document.createElement('ul');
        menu.className = 'queue-menu';
        menu.setAttribute('role', 'menu');
        menu.innerHTML = items.map(([action, label]) =>
            `<li role="none"><button type="button" role="menuitem" data-menu-action="${action}" tabindex="-1">${esc(label)}</button></li>`).join('');
        this.el.appendChild(menu);
        // In the panel's own px, through a phone's sideways turn (phone.js).
        const box = localRect(anchor.getBoundingClientRect(), this.el.getBoundingClientRect());
        menu.style.right = `${Math.max(8, this.el.clientWidth - box.x1)}px`;
        menu.style.top = `${box.y1 + 4}px`;
        const bottom = viewRect(anchor.getBoundingClientRect()).y1;
        if (bottom + menu.offsetHeight + 8 > viewSize().h) menu.style.top = `${Math.max(8, box.y0 - menu.offsetHeight - 4)}px`;
        anchor.setAttribute('aria-expanded', 'true');
        this._menu = { el: menu, anchor, onPick };
        menu.querySelector('button')?.focus();
    }

    _closeMenu({ restoreFocus = false } = {}) {
        if (!this._menu) return;
        const { el, anchor } = this._menu;
        this._menu = null;
        el.remove();
        anchor.setAttribute('aria-expanded', 'false');
        if (restoreFocus) (anchor.closest('.queue-row') || anchor).focus();
    }

    _menuKey(event) {
        const buttons = [...this._menu.el.querySelectorAll('button')];
        const i = buttons.indexOf(document.activeElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            buttons[(i + step + buttons.length) % buttons.length]?.focus();
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            buttons[event.key === 'Home' ? 0 : buttons.length - 1]?.focus();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            this._closeMenu({ restoreFocus: true });
        } else if (event.key === 'Tab') {
            this._closeMenu();
        }
    }

    // ---- Wiring --------------------------------------------------------------------

    _wire() {
        this.el.addEventListener('click', (event) => {
            const menuItem = event.target.closest('[data-menu-action]');
            if (menuItem && this._menu) {
                const { onPick } = this._menu;
                this._closeMenu({ restoreFocus: true });
                onPick(menuItem.dataset.menuAction);
                return;
            }
            if (this._menu && !event.target.closest('.queue-menu')) this._closeMenu();
            const menuBtn = event.target.closest('[data-queue-menu]');
            if (menuBtn) {
                const row = menuBtn.closest('.queue-row');
                this._openMenu(menuBtn, rowMenuItems(row.dataset.section), (action) => this._runRowAction(action, row));
                return;
            }
            const action = event.target.closest('[data-queue-action]')?.dataset.queueAction;
            if (action) { event.preventDefault(); this._panelAction(action, event.target.closest('[data-queue-action]')); return; }
            const row = event.target.closest('.queue-row');
            if (!row) return;
            this._focusRow(row.dataset.key);
            if (row.dataset.section !== 'up' || event.target.closest('button, [data-queue-handle]')) return;
            this._select(row.dataset.entryId, event.shiftKey ? 'range' : (event.metaKey || event.ctrlKey) ? 'toggle' : 'one');
            this._focusRow(row.dataset.key);
        });
        this.el.addEventListener('dblclick', (event) => {
            const row = event.target.closest('.queue-row');
            if (row && !event.target.closest('a, button')) this._activate(row);
        });
        this.el.addEventListener('keydown', (event) => {
            if (this._menu) { this._menuKey(event); event.stopPropagation(); return; }
            const row = event.target.closest?.('.queue-row');
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                if (this.selected.size) { this._clearSelection(); this._focusRow(this.focusKey); } else this.close();
                return;
            }
            if (!row || event.target !== row) return;
            const isUp = row.dataset.section === 'up';
            const inSelection = isUp && this.selected.has(row.dataset.entryId);
            if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                event.preventDefault();
                event.stopPropagation();
                if (inSelection) this._moveSelection(event.key === 'ArrowUp' ? -1 : 1);
                else this._move(row, event.key === 'ArrowUp' ? -1 : 1);
                return;
            }
            if (event.shiftKey && isUp && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                event.preventDefault();
                event.stopPropagation();
                const rows = [...this.body.querySelectorAll('.queue-row[data-section="up"]')];
                const target = rows[rows.indexOf(row) + (event.key === 'ArrowDown' ? 1 : -1)];
                if (!target) return;
                if (!this._anchor || !this.selected.size) { this.selected = new Set([row.dataset.entryId]); this._anchor = row.dataset.entryId; }
                this.focusKey = target.dataset.key;
                this._select(target.dataset.entryId, 'range');
                this._focusRow(target.dataset.key);
                return;
            }
            if (event.key === ' ' && isUp) {
                event.preventDefault();
                event.stopPropagation();
                this._select(row.dataset.entryId, 'toggle');
                this._focusRow(row.dataset.key);
                return;
            }
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                event.stopPropagation();
                const rows = [...this.body.querySelectorAll('.queue-row')];
                const i = rows.indexOf(row);
                const target = event.key === 'Home' ? rows[0]
                    : event.key === 'End' ? rows[rows.length - 1]
                        : rows[i + (event.key === 'ArrowDown' ? 1 : -1)];
                if (target) this._focusRow(target.dataset.key);
                return;
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                this._activate(row);
            } else if (event.key === 'Delete' || event.key === 'Backspace') {
                if (!isUp) return;
                event.preventDefault();
                event.stopPropagation();
                if (inSelection) this._removeSelection();
                else this._runRowAction('remove', row);
            } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                event.preventDefault();
                event.stopPropagation();
                row.querySelector('[data-queue-menu]')?.click();
            }
        });
        this._wireDrag();
    }

    _panelAction(action, target) {
        switch (action) {
            case 'close': this.close(); break;
            case 'clear': this._clearUpNext(); break;
            case 'bulk-top': this._moveBlock(this._selectedIds(), 0); break;
            case 'bulk-move': {
                const upNext = this.player.queue.upNext;
                const over = upNext.findIndex((e) => `up:${e.entryId}` === this.focusKey);
                const indices = upNext.flatMap((e, i) => (this.selected.has(e.entryId) ? [i] : []));
                const to = over < 0 ? -1 : blockDropIndex(indices, over, false);
                if (to >= 0) this._moveBlock(this._selectedIds(), to);
                break;
            }
            case 'bulk-remove': this._removeSelection(); break;
            case 'bulk-clear': this._clearSelection(); this._focusRow(this.focusKey); break;
            case 'more': this.contextLimit += CONTEXT_PAGE; this.render(); break;
            case 'history': this.historyOpen = !this.historyOpen; this.render(); break;
            case 'open-context': {
                const route = this.player.queue.context?.route;
                if (route) this.app?.navigate?.(route);
                break;
            }
            case 'options':
                this._openMenu(target, [['add-to-gig', 'Add queue to gig']], (pick) => {
                    if (pick === 'add-to-gig') this.app?._openGigLanePicker?.(Q.queueTrackIds(this.player.queue), { source: 'Queue' });
                });
                break;
            default:
        }
    }

    // Drag by the handle, within Up next only. The row becomes draggable only
    // while the pointer is down on its handle, so text selection and link
    // clicks elsewhere in the row keep working.
    _wireDrag() {
        const clearMarks = () => {
            for (const r of this.body.querySelectorAll('.is-drop-before, .is-drop-after, .is-dragging')) {
                r.classList.remove('is-drop-before', 'is-drop-after', 'is-dragging');
            }
        };
        this.body.addEventListener('pointerdown', (event) => {
            const handle = event.target.closest('[data-queue-handle]');
            if (handle) handle.closest('.queue-row').draggable = true;
        });
        this.body.addEventListener('pointerup', (event) => {
            const row = event.target.closest('.queue-row');
            if (row) row.draggable = false;
        });
        this.body.addEventListener('dragstart', (event) => {
            const row = event.target.closest?.('.queue-row[data-section="up"]');
            if (!row?.draggable) { event.preventDefault(); return; }
            // A selected row carries the whole selection; an unselected one
            // moves alone and leaves the selection as it is.
            const upNext = this.player.queue.upNext;
            const ids = this.selected.has(row.dataset.entryId) ? this._selectedIds() : [row.dataset.entryId];
            const wanted = new Set(ids);
            this._drag = { ids, indices: upNext.flatMap((e, i) => (wanted.has(e.entryId) ? [i] : [])) };
            this.focusKey = row.dataset.key;
            for (const r of this.body.querySelectorAll('.queue-row[data-section="up"]')) {
                if (wanted.has(r.dataset.entryId)) r.classList.add('is-dragging');
            }
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', row.dataset.key);
        });
        const dropAt = (event) => {
            const row = event.target.closest('.queue-row[data-section="up"]');
            if (!row) return null;
            const box = row.getBoundingClientRect();
            const after = event.clientY > box.top + box.height / 2;
            return { row, after, to: blockDropIndex(this._drag.indices, Number(row.dataset.index), after) };
        };
        this.body.addEventListener('dragover', (event) => {
            if (!this._drag) return;
            const at = dropAt(event);
            if (!at) return;
            event.preventDefault();
            for (const r of this.body.querySelectorAll('.is-drop-before, .is-drop-after')) r.classList.remove('is-drop-before', 'is-drop-after');
            event.dataTransfer.dropEffect = at.to < 0 ? 'none' : 'move';
            if (at.to >= 0) at.row.classList.add(at.after ? 'is-drop-after' : 'is-drop-before');
        });
        this.body.addEventListener('drop', (event) => {
            if (!this._drag) return;
            const at = dropAt(event);
            if (!at) return;
            event.preventDefault();
            const { ids } = this._drag;
            this._drag = null;
            clearMarks();
            if (at.to >= 0) this._moveBlock(ids, at.to);
        });
        this.body.addEventListener('dragend', (event) => {
            this._drag = null;
            clearMarks();
            const row = event.target.closest?.('.queue-row');
            if (row) row.draggable = false;
        });
    }
}
