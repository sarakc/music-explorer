// The phone layout (docs/specs/2026-11-21-phone-layout-design.md): where it applies, the
// graph drawn sideways on an upright phone, coordinates through that turn, and how deep the
// route history is for Back. The layout itself is CSS behind `html.is-phone` (PHONE_QUERY as the
// page loads) and `html.is-sideways`.
// Imports nothing from the graph, so atlas-config.js can import it.

export const PHONE_QUERY = '(max-width: 768px), (max-height: 500px) and (pointer: coarse)';
export const LANDSCAPE_QUERY = '(max-height: 500px) and (pointer: coarse)';
const SIDEWAYS_MAX_W = 500;

const matches = (q, win = globalThis) => Boolean(win.matchMedia?.(q).matches);

/** A phone when the page loads: `html.is-phone`, set by the page's head script, and every phone
 *  rule in the stylesheets hangs off it, so a window resized across the query keeps one layout. */
export const PHONE = Boolean(globalThis.document?.documentElement?.classList.contains('is-phone')) || matches(PHONE_QUERY);

const MARK_SCALE = 1.3; // dots ×1.3 against the desktop's proportions; names by √1.3

/** The graph's numbers on a phone: bigger marks and names (half as many), a longer tap reach, and room for
 *  the larger controls. Off a phone, `cfg` itself. */
export function phoneAtlas(cfg, phone = PHONE) {
    if (!phone) return cfg;
    const sizes = cfg.nameSizes.map((px) => Math.round(px * Math.sqrt(MARK_SCALE) * 2) / 2);
    return {
        ...cfg, markScale: MARK_SCALE, nameSizes: sizes, namesAtFit: cfg.namesAtFit / 2, hitPad: 12, hitMinPx: 14,
        fitInsetTop: 48, fitInsetBottom: 52, followMarginX: 36, followMarginY: 60,
    };
}

/** Draw the view sideways: an upright touch phone (≤ 500px wide) on a graph route. */
export function sidewaysWanted({ coarse, width, height, graph }) {
    return Boolean(coarse && graph && height > width && width <= SIDEWAYS_MAX_W);
}

/** The page's layout classes: sideways (above), and landscape — a turned phone, or one drawn sideways. */
export function layoutWanted({ coarse, width, height, graph, landscape }) {
    const sideways = sidewaysWanted({ coarse, width, height, graph });
    return { sideways, landscape: sideways || Boolean(landscape) };
}

/** Is the view drawn sideways now? */
export const isSideways = (doc = globalThis.document) => Boolean(doc?.documentElement?.classList.contains('is-sideways'));
/** The phone layout, as decided when the page loaded (`html.is-phone`). */
export const isPhone = (doc = globalThis.document) => Boolean(doc?.documentElement?.classList.contains('is-phone'));

/** A client point in an element's own px, given its on-screen rect. Sideways, the element's
 *  x runs down the screen and its y runs right to left. */
export function toLocal(clientX, clientY, rect, sideways) {
    return sideways ? { x: clientY - rect.top, y: rect.right - clientX } : { x: clientX - rect.left, y: clientY - rect.top };
}

/** A pointer event's spot in `el`'s own px. */
export const localPoint = (e, el) => toLocal(e.clientX, e.clientY, el.getBoundingClientRect(), isSideways());

/** An on-screen rect in `base`'s own px, as { x0, x1, y0, y1 }. */
export function rectToLocal(r, base, sideways) {
    return sideways ? { x0: r.top - base.top, x1: r.bottom - base.top, y0: base.right - r.right, y1: base.right - r.left }
        : { x0: r.left - base.left, x1: r.right - base.left, y0: r.top - base.top, y1: r.bottom - base.top };
}

export const localRect = (r, base) => rectToLocal(r, base, isSideways());

/** A screen point in the page's own px: sideways, the body is turned 90° clockwise from its
 *  top-left corner, so overlays placed in it (position: fixed) need its coordinates. */
export function viewPoint(x, y, { doc = globalThis.document, win = globalThis } = {}) {
    return isSideways(doc) ? { x: y, y: (win.innerWidth || 0) - x } : { x, y };
}

/** A screen rect in the page's own px, as { x0, x1, y0, y1 }. */
export const viewRect = (r, { doc = globalThis.document, win = globalThis } = {}) =>
    rectToLocal(r, { left: 0, top: 0, right: win.innerWidth || 0 }, isSideways(doc));

/** The page's own width and height (sideways, the screen's height and width). */
export function viewSize({ doc = globalThis.document, win = globalThis } = {}) {
    const w = win.innerWidth || 0, h = win.innerHeight || 0;
    return isSideways(doc) ? { w: h, h: w } : { w, h };
}

/** History entry depth: an entry without a stamp is new (one deeper); a stamped one is a return. */
export function stampDepth(state, lastDepth) {
    if (Number.isInteger(state?.ummDepth)) return { state, depth: state.ummDepth };
    const depth = lastDepth + 1;
    return { state: { ...(state || {}), ummDepth: depth }, depth };
}

let depth = 0, stampNow = null;
/** Is there an earlier in-app entry to go back to? */
export const canGoBack = () => depth > 0;
/** Stamp the current entry after a `history.pushState` (which fires no event); a no-op off the phone. */
export const stampEntry = () => stampNow?.();

/** Wire the phone layout once: `html.is-phone`, `html.is-sideways`, and Back depth
 *  (a `phone-back` event on the document when canGoBack() changes). */
export function installPhone({ doc = globalThis.document, win = globalThis } = {}) {
    const root = doc?.documentElement;
    if (!root || root.dataset.phone) return;
    root.dataset.phone = '1';
    root.classList.add('is-phone');

    const side = () => {
        const want = layoutWanted({
            coarse: matches('(pointer: coarse)', win), width: win.innerWidth || 0, height: win.innerHeight || 0,
            graph: Boolean(doc.querySelector('.atlas-host.is-atlas')), landscape: matches(LANDSCAPE_QUERY, win),
        });
        if (want.sideways !== root.classList.contains('is-sideways')) root.classList.toggle('is-sideways', want.sideways);
        if (want.landscape !== root.classList.contains('is-landscape')) root.classList.toggle('is-landscape', want.landscape);
    };
    new win.MutationObserver(side).observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    win.addEventListener('resize', side);
    win.addEventListener('orientationchange', side);
    side();

    let last = -1;
    const stamp = () => {
        const before = canGoBack();
        const next = stampDepth(win.history.state, last);
        depth = last = next.depth;
        root.classList.toggle('can-back', canGoBack());
        if (next.state !== win.history.state) win.history.replaceState(next.state, '', win.location.href);
        if (before !== canGoBack()) doc.dispatchEvent(new win.CustomEvent('phone-back', { detail: { canGoBack: canGoBack() } }));
    };
    win.addEventListener('hashchange', stamp);
    win.addEventListener('popstate', stamp);
    stampNow = stamp;
    stamp();
    // On a phone the queue covers the whole screen: a route change (a link in it, Android's back)
    // closes it, or the page would change unseen behind it. A route that opens it does so later.
    win.addEventListener('hashchange', () => {
        const queue = doc.querySelector('.queue-panel:not([hidden])');
        if (queue && isPhone(doc)) queue.querySelector('[data-queue-action="close"]')?.click();
    });
}

/** The grab bar: a tap (under 8px) toggles half and tall; a drag up makes it tall, down makes a
 *  tall sheet half, and down from half closes it. */
export function sheetGesture({ dy, tall }) {
    if (Math.abs(dy) < 8) return tall ? 'half' : 'tall';
    if (dy < 0) return 'tall';
    return tall ? 'half' : 'close';
}

/** What the open slot covers, px: a sheet along the bottom upright, a side panel on the right
 *  sideways and in phone landscape; nothing when it is closed. */
export function panelInset({ doc = globalThis.document, win = globalThis } = {}) {
    const el = doc?.querySelector('.right-slot:not(.is-collapsed)');
    // Off the phone layout the slot is a column beside the map.
    if (!el || !(isSideways(doc) || isPhone(doc))) return { bottom: 0, right: 0 };
    return isSideways(doc) || matches(LANDSCAPE_QUERY, win) ? { bottom: 0, right: el.offsetWidth } : { bottom: el.offsetHeight, right: 0 };
}

/** Info on a phone: the right-hand slot gets a grab bar (CSS makes it a sheet or a side panel),
 *  and each settled change of its size reaches the graph as a `phone-sheet` event. */
export function installSheet({ doc = globalThis.document, win = globalThis } = {}) {
    const root = doc?.documentElement;
    if (!root || root.dataset.sheet) return;
    root.dataset.sheet = '1';
    // Drags read in the page's own px, so a sheet drawn sideways is pulled the way it looks.
    let down = null;
    doc.addEventListener('pointerdown', (e) => {
        const grab = e.target.closest?.('.rs-grab');
        if (!grab) return;
        down = { y: viewPoint(e.clientX, e.clientY, { doc, win }).y, sheet: grab.parentElement };
        grab.setPointerCapture?.(e.pointerId);
    });
    // An edge swipe or scroll the system takes over ends the press without a pointerup.
    doc.addEventListener('pointercancel', () => { down = null; });
    doc.addEventListener('pointerup', (e) => {
        if (!down) return;
        const { sheet } = down, dy = viewPoint(e.clientX, e.clientY, { doc, win }).y - down.y;
        down = null;
        if (sheet.classList.contains('queue-panel')) { // the queue is full height: only a drag down closes it
            if (dy >= 8) sheet.querySelector('[data-queue-action="close"]')?.click();
            return;
        }
        const act = sheetGesture({ dy, tall: sheet.classList.contains('is-tall') });
        if (act === 'close') sheet.querySelector('[data-rs-collapse]')?.click();
        else sheet.classList.toggle('is-tall', act === 'tall');
    });
    let last = '', timer = null, watched = null;
    const check = () => {
        const slot = doc.querySelector('.right-slot');
        if (slot?.classList.contains('is-collapsed')) slot.classList.remove('is-tall');
        const inset = panelInset({ doc, win }), key = `${Math.round(inset.bottom / 3)}:${Math.round(inset.right / 3)}`;
        if (key !== last) { last = key; doc.dispatchEvent(new win.CustomEvent('phone-sheet', { detail: inset })); }
    };
    const settle = () => { clearTimeout(timer); timer = setTimeout(check, 260); };
    const grabFor = (el) => {
        if (!el || el.querySelector(':scope > .rs-grab')) return;
        const grab = doc.createElement('div');
        grab.className = 'rs-grab';
        grab.setAttribute('aria-hidden', 'true');
        el.prepend(grab);
    };
    const find = () => {
        grabFor(doc.querySelector('.queue-panel'));
        const slot = doc.querySelector('.right-slot');
        if (!slot || slot === watched) return;
        watched = slot;
        grabFor(slot);
        if (win.ResizeObserver) new win.ResizeObserver(settle).observe(slot);
        new win.MutationObserver(settle).observe(slot, { attributes: true, attributeFilter: ['class'] });
    };
    new win.MutationObserver(find).observe(doc.body, { childList: true, subtree: true });
    win.addEventListener('resize', settle);
    find();
}
