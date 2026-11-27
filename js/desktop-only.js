// Tools and importing are desktop only (app spec, Deliverable A). On a phone the
// view still renders, so nothing breaks; one short line says so: in the header
// for Tools, and on Settings' Inbox and Other imports cards (the rest of
// Settings works on a phone). main.css shows it only on narrow or touch-only screens.

import { sectionOf } from './sections.js';

/** The line on Settings' Inbox and Other imports cards. */
export const INBOX_DESKTOP_ONLY = 'Importing is desktop only.';

/** The line for a view, or '' when the view works on a phone. */
export function desktopOnlyText(view) {
    if (sectionOf(view) === 'tools') return 'Tools is desktop only.';
    return '';
}

/** Fill and show the header line for `view`, or empty and hide it. */
export function renderDesktopOnlyNotice(el, view) {
    if (!el) return;
    const text = desktopOnlyText(view);
    el.textContent = text;
    el.hidden = !text;
}
