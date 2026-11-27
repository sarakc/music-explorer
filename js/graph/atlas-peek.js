// Peek: reading about a node in Info without moving the map. The selection, its rings and
// the camera stay; the peeked node gets a thin ring while Info shows it. Two ways to ask,
// one setting (`graph.peek`, stored as umm.graphPeek), so Sara can live with each and choose:
// - follow: Info open means looking. With Info open a click on a node peeks, a second click
//   on it steps; with Info closed a click steps.
// - ask: a click always steps. Alt-click peeks; on touch a tap shows the node's tip, whose ⓘ
//   peeks (a tap on the node again steps).
// Focus here in Info, or Enter, steps to the peeked node; closing Info (Esc) ends the peek.
// Pure: no DOM. AtlasView keeps the state and wires it.

export const PEEK_KEY = 'umm.graphPeek';
export const PEEK_MODES = Object.freeze([['follow', 'Follow'], ['ask', 'Ask']]);
// Follow first: it is the one the plan's check describes, needs no hidden gesture and works on touch.
export const PEEK_DEFAULT = 'follow';
const known = (mode) => PEEK_MODES.some(([key]) => key === mode);
const local = (storage) => (storage === undefined ? globalThis.localStorage : storage);

/** The stored way to peek, else the default. */
export function readPeekMode(storage) {
    let value = null;
    try { value = local(storage)?.getItem(PEEK_KEY); } catch (_) { value = null; }
    return known(value) ? value : PEEK_DEFAULT;
}

export function writePeekMode(mode, storage) {
    const out = known(mode) ? mode : PEEK_DEFAULT;
    try { local(storage)?.setItem(PEEK_KEY, out); } catch (_) { /* a preference only */ }
    return out;
}

/**
 * What a click on the map does, peek included: 'select' (a step), 'peek', 'info' (the selection
 * again: Info on it), 'tip' (ask, touch: show the node's tip with its ⓘ), 'clear' or 'none'.
 * `hitId` is the node under the click (null on empty ground), `peekId` the node peeked at,
 * `tipId` the node whose tip a tap showed; `alt` an Alt-click, `touch` a tap.
 */
export function peekClick({ hitId, selectedId, peekId = null, tipId = null, infoShowing = false, mode = PEEK_DEFAULT, alt = false, touch = false }) {
    // As clickIntent (atlas-view.js): empty ground clears, the selection again opens Info.
    if (!hitId) return selectedId ? 'clear' : 'none';
    if (hitId === selectedId) return 'info';
    if (mode === 'ask') {
        if (alt) return 'peek';
        if (touch && tipId !== hitId) return 'tip';
        return 'select';
    }
    if (!infoShowing) return 'select';
    return hitId === peekId ? 'select' : 'peek';
}
