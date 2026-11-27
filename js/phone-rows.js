// Track rows on a phone (docs/specs/2026-11-21-phone-layout-design.md, part 3). Touch becomes
// the desktop's own events, so the existing handlers do the work: a tap on a Collection row
// clicks its ▶ (or ⌘-clicks it while a selection is open), a long-press ⌘-clicks it to start
// a selection, and ⋯ (`[data-row-menu]`) opens the row's right-click menu. Installed once at
// boot on a phone (app.js).

export const LONG_PRESS_MS = 500;
export const MOVE_PX = 8;
const ROW = 'tr.library-table-row';
// Rows this layer drives: Collection's, which carry ▶. Rekordbox's workspace and the viewer's
// lists share the row class without one and keep their own clicks.
const trackRow = (el) => {
    const row = el?.closest?.(ROW);
    return row?.querySelector('[data-row-play]') ? row : null;
};
// What in a row keeps its own tap: links, buttons, fields, tokens, the cover.
const INTERACTIVE = 'a, button, input, select, textarea, label, .cell-token, .cell-label-link, .cell-artist-link, .files-dot, img[data-art-open]';

/** What a tap does: play the row, toggle it in the selection, or pass to whatever was tapped.
 *  A ⌘, Ctrl or ⇧ click keeps its desktop meaning: a narrow desktop window lays out as a phone. */
export function tapAction({ inRow, interactive, selecting, synthetic = false, modified = false }) {
    if (synthetic || modified || !inRow || interactive) return 'pass';
    return selecting ? 'toggle' : 'play';
}

/** A press held without moving more than MOVE_PX. */
export function pressTracker() {
    let at = null, moved = false;
    return {
        down(x, y) { at = { x, y }; moved = false; },
        move(x, y) { if (at && Math.hypot(x - at.x, y - at.y) > MOVE_PX) moved = true; },
        up() { at = null; },
        still() { return Boolean(at) && !moved; },
    };
}

/** Where ⋯ opens its menu: its own centre. */
export const menuPoint = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

export function installPhoneRows({ doc = globalThis.document, win = globalThis } = {}) {
    const root = doc?.documentElement;
    if (!root || root.dataset.phoneRows) return;
    root.dataset.phoneRows = '1';
    const fire = (el, type, init = {}) => {
        const E = win.MouseEvent || win.Event;
        const ev = new E(type, { bubbles: true, cancelable: true, ...init });
        ev.phoneRows = true;
        el.dispatchEvent(ev);
    };
    // A selection is open while its bar shows (selected rows may be scrolled out of the DOM).
    const selecting = (row) => {
        const bar = row?.closest('.library-table-wrapper')?.querySelector('[data-selection-bar]');
        return Boolean(bar && !bar.hidden);
    };

    let swallow = false;
    // Capture phase: the row's own click-to-select never sees a tap we turn into play.
    doc.addEventListener('click', (e) => {
        if (e.phoneRows) return;
        if (swallow) { swallow = false; e.preventDefault(); e.stopPropagation(); return; }
        const menu = e.target.closest?.('[data-row-menu]');
        if (menu) {
            e.preventDefault(); e.stopPropagation();
            const row = menu.closest('[data-track-id]');
            const p = menuPoint(menu.getBoundingClientRect());
            if (row) fire(row, 'contextmenu', { clientX: p.x, clientY: p.y, button: 2 });
            return;
        }
        const row = trackRow(e.target);
        const act = tapAction({
            inRow: Boolean(row), interactive: Boolean(e.target.closest?.(INTERACTIVE)), selecting: selecting(row),
            modified: e.metaKey || e.ctrlKey || e.shiftKey,
        });
        if (act === 'pass') return;
        e.preventDefault(); e.stopPropagation();
        if (act === 'play') row.querySelector('[data-row-play]')?.click();
        else fire(e.target, 'click', { metaKey: true });
    }, true);

    // A long-press starts (or adds to) a selection. A press that moves is a scroll.
    const press = pressTracker();
    let timer = null, touch = false;
    doc.addEventListener('pointerdown', (e) => {
        swallow = false;
        touch = e.pointerType !== 'mouse';
        if (!touch) return;
        if (!trackRow(e.target) || e.target.closest(INTERACTIVE)) return;
        press.down(e.clientX, e.clientY);
        const target = e.target;
        win.clearTimeout(timer);
        timer = win.setTimeout(() => {
            if (!press.still()) return;
            press.up();
            swallow = true; // the click that ends this press is not a tap
            fire(target, 'click', { metaKey: true });
        }, LONG_PRESS_MS);
    });
    doc.addEventListener('pointermove', (e) => press.move(e.clientX, e.clientY), { passive: true });
    const end = () => { win.clearTimeout(timer); press.up(); };
    doc.addEventListener('pointerup', end);
    doc.addEventListener('pointercancel', end);
    // Android opens a native menu on a long-press: on a row, the long-press is ours.
    doc.addEventListener('contextmenu', (e) => {
        if (!e.phoneRows && touch && trackRow(e.target)) { e.preventDefault(); e.stopPropagation(); }
    }, true);
}
