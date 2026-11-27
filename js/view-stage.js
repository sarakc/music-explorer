// Which view fills the content region: the page (`.main-scroll` and its #contentArea: the
// table, the grids, every other view) or the map's own host (#atlasHost, the graph, kept
// alive behind the page while suspended). A switch crossfades in FADE_MS: the view leaving
// stays where it was, over the one arriving, while each fades. Under reduced motion it swaps.

export const FADE_MS = 150;

/** The map's host beside the page, made once (a page without one gets it after `.main-scroll`). */
export function atlasHost(doc = globalThis.document) {
    let host = doc?.getElementById('atlasHost');
    if (host || !doc) return host || null;
    const page = doc.getElementById('contentArea')?.closest('.main-scroll');
    if (!page) return null;
    host = doc.createElement('div');
    host.id = 'atlasHost'; host.className = 'atlas-host'; host.hidden = true;
    page.after(host);
    return host;
}

const reducedMotion = (win) => Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** What a switch does: nothing when `show` is already the only one on screen, a swap without motion, else a crossfade. */
export function stageMove({ showHidden, hideHidden, reduced = false, laidOut = true }) {
    if (!showHidden && hideHidden) return 'none';
    return reduced || hideHidden || !laidOut ? 'swap' : 'fade';
}

/** Put the map (`graph`) or the page on screen. */
export function showStage(graph, { doc = globalThis.document, win = globalThis } = {}) {
    const host = atlasHost(doc), page = doc?.getElementById('contentArea')?.closest('.main-scroll');
    if (!host || !page) return 'none';
    const [show, hide] = graph ? [host, page] : [page, host];
    clearTimeout(hide._stageTimer); clearTimeout(show._stageTimer);
    unpin(show);
    const move = stageMove({ showHidden: show.hidden, hideHidden: hide.hidden, reduced: reducedMotion(win), laidOut: hide.offsetHeight > 0 && typeof hide.animate === 'function' });
    if (move === 'none') return move;
    if (move === 'swap') { unpin(hide); hide.hidden = true; show.hidden = false; return move; }
    // The leaving view keeps its box (and its scroll) out of the flow, over the arriving one.
    const box = { top: hide.offsetTop, left: hide.offsetLeft, width: hide.offsetWidth, height: hide.offsetHeight };
    Object.assign(hide.style, { position: 'absolute', top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px`, height: `${box.height}px`, zIndex: '2', pointerEvents: 'none' });
    show.hidden = false;
    const ease = { duration: FADE_MS, easing: 'ease-out' };
    hide.animate([{ opacity: 1 }, { opacity: 0 }], { ...ease, fill: 'forwards' });
    show.animate?.([{ opacity: 0 }, { opacity: 1 }], ease);
    hide._stageTimer = setTimeout(() => { hide.hidden = true; unpin(hide); }, FADE_MS);
    return move;
}

function unpin(el) {
    if (!el.style.position) return;
    for (const k of ['position', 'top', 'left', 'width', 'height', 'zIndex', 'pointerEvents']) el.style[k] = '';
    for (const a of el.getAnimations?.() || []) a.cancel();
}
