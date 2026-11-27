// Hover hints: one small, quiet word under an icon-only button (a glyph or an icon, no
// words) after a short rest of the pointer or on keyboard focus. Its text is the button's
// `data-hint`, else its `title`, else its `aria-label`; the native title tooltip is held
// back while the hint shows and put back after. `data-hint="off"` opts a button out; a
// `data-hint` on a button with words opts it in. Not on a phone: touch has no hover.

const TARGETS = 'button, a[href], [role="button"]';
const DELAY_MS = 450;   // the pointer rests this long before a hint shows
const WARM_MS = 400;    // another icon within this long of a hint hiding shows at once
const GAP = 6;          // px between the button and its hint
const EDGE = 4;         // px the hint keeps from the window's edge

/** The text a button's hint says, or '' for none. */
export function hintText(el) {
    if (!el?.getAttribute) return '';
    const own = el.getAttribute('data-hint');
    if (own === 'off') return '';
    return (own || el.getAttribute('title') || el.getAttribute('data-hint-title') || el.getAttribute('aria-label') || '').trim();
}

/** Does a button take a hint: an icon or a glyph and no words, or its own `data-hint`? */
export function takesHint(el) {
    if (!el?.getAttribute) return false;
    const own = el.getAttribute('data-hint');
    if (own === 'off') return false;
    if (own) return true;
    // Words: two or more letters or digits in a row ("+12" and "⋯" are glyphs, "Filter" is not).
    const text = (el.textContent || '').replace(/\s+/g, '');
    if (/[\p{L}\p{N}]{2,}/u.test(text) || text.length > 3) return false;
    return Boolean(hintText(el));
}

/**
 * Where the hint goes: centred under the button, above it with no room below, kept inside
 * the window. `rect` is the button's client rect, `size` the hint's { width, height }.
 */
export function placeHint(rect, size, view) {
    const w = size.width, h = size.height;
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(EDGE, Math.min(view.width - EDGE - w, left));
    let top = rect.bottom + GAP;
    if (top + h > view.height - EDGE) top = Math.max(EDGE, rect.top - GAP - h);
    return { left: Math.round(left), top: Math.round(top) };
}

/** Install the hints on a document (once). Returns a function that removes them. */
export function installHoverHints(doc = globalThis.document) {
    if (!doc?.body || doc.__hoverHints) return doc?.__hoverHints || (() => {});
    if (doc.documentElement.classList.contains('is-phone')) return () => {};
    const win = doc.defaultView || globalThis;
    const tip = doc.createElement('div');
    tip.className = 'hover-hint';
    // It repeats the button's own label, so screen readers already have it.
    tip.setAttribute('aria-hidden', 'true');
    tip.hidden = true;
    let target = null, timer = 0, hiddenAt = 0;

    const release = (el) => {
        // Give back the title held while the hint showed, unless the page set a new one.
        if (el?.hasAttribute('data-hint-title')) {
            if (!el.hasAttribute('title')) el.setAttribute('title', el.getAttribute('data-hint-title'));
            el.removeAttribute('data-hint-title');
        }
    };
    const hide = () => {
        win.clearTimeout(timer); timer = 0;
        if (!tip.hidden) hiddenAt = Date.now();
        tip.hidden = true; tip.classList.remove('is-on');
        release(target);
        target = null;
    };
    const show = (el) => {
        if (target !== el || !el.isConnected) return;
        const text = hintText(el);
        if (!text) return;
        // Hold the native title back so only one hint shows.
        if (el.hasAttribute('title')) { el.setAttribute('data-hint-title', el.getAttribute('title')); el.removeAttribute('title'); }
        tip.textContent = text;
        // A full-screen element is the only thing drawn; elsewhere the body holds the hint.
        const host = doc.fullscreenElement || doc.body;
        if (tip.parentNode !== host) host.appendChild(tip);
        // Take the ink and ground of where the button sits (the graph's Night sky has its own).
        const cs = win.getComputedStyle?.(el);
        tip.style.setProperty('--hint-ink', cs?.getPropertyValue('--text-dim')?.trim() || '');
        tip.style.setProperty('--hint-bg', cs?.getPropertyValue('--bg')?.trim() || '');
        tip.hidden = false;
        const pos = placeHint(el.getBoundingClientRect(), { width: tip.offsetWidth, height: tip.offsetHeight },
            { width: win.innerWidth || doc.documentElement.clientWidth, height: win.innerHeight || doc.documentElement.clientHeight });
        tip.style.left = `${pos.left}px`; tip.style.top = `${pos.top}px`;
        // Shown, then faded in on the next frame.
        const fade = () => { if (target === el) tip.classList.add('is-on'); };
        if (win.requestAnimationFrame) win.requestAnimationFrame(fade); else fade();
    };
    const arm = (el) => {
        if (el === target) return;
        hide();
        target = el;
        const warm = Date.now() - hiddenAt < WARM_MS;
        timer = win.setTimeout(() => show(el), warm ? 0 : DELAY_MS);
    };
    const candidate = (node) => {
        const el = node?.closest?.(TARGETS);
        return el && takesHint(el) ? el : null;
    };

    const onOver = (e) => {
        if (e.pointerType === 'touch') return;
        const el = candidate(e.target);
        if (el) arm(el); else if (target && !target.contains(e.target)) hide();
    };
    const onOut = (e) => {
        if (target && !target.contains(e.relatedTarget)) hide();
    };
    const onFocus = (e) => {
        const el = candidate(e.target);
        // Keyboard focus only: a click's focus already had its hover.
        if (el && el.matches?.(':focus-visible')) arm(el);
    };
    const onBlur = (e) => { if (target && e.target === target) hide(); };
    const onKey = (e) => { if (e.key === 'Escape' && target) hide(); };
    const onPress = () => { if (target) hide(); };
    const listeners = [
        ['pointerover', onOver], ['pointerout', onOut], ['focusin', onFocus], ['focusout', onBlur],
        ['keydown', onKey], ['pointerdown', onPress], ['wheel', onPress], ['scroll', onPress],
    ];
    for (const [type, fn] of listeners) doc.addEventListener(type, fn, { capture: true, passive: true });
    const remove = () => {
        hide();
        for (const [type, fn] of listeners) doc.removeEventListener(type, fn, { capture: true, passive: true });
        tip.remove();
        delete doc.__hoverHints;
    };
    doc.__hoverHints = remove;
    return remove;
}
