import { installViewerApi } from './viewer-api.js';
import { setVisitorProfile } from './viewer-profile.js';
import { mountVisitorEntry } from './visitor-entry.js';

export const UNAVAILABLE = 'Snapshot unavailable';

/**
 * viewer.html's boot: the source's manifest, the request gate, then the app.
 * A manifest or an app module that does not load leaves one line in place of
 * the app, not a blank page. `visitor`: the source is a visitor's own map (the
 * visitor profile is set before app.js loads). `openSheet`: open the visitor
 * sheet once booted. `entry` is passed to mountVisitorEntry (tests).
 * → the gate's `{ refused }`, or null when the viewer is unavailable.
 */
export async function startViewer({ win = globalThis.window, source, loadApp = () => import('./app.js'), visitor = false, openSheet = false, entry = {} }) {
    const doc = win.document;
    const unavailable = (error) => {
        console.warn('Viewer unavailable:', error);
        const container = doc.querySelector('.app-container');
        if (container) container.innerHTML = `<main class="main-content"><p class="view-subtitle" role="alert">${UNAVAILABLE}</p></main>`;
        return null;
    };
    try {
        await source.ready();
    } catch (error) {
        return unavailable(error);
    }
    if (visitor) doc.documentElement.setAttribute('data-visitor', '');
    setVisitorProfile(visitor);
    const gate = installViewerApi({ win, source });
    const line = doc.getElementById('sourceLine');
    if (line) line.textContent = source.label;
    try {
        await loadApp();
    } catch (error) {
        return unavailable(error);
    }
    gate.entry = mountVisitorEntry({ win, visitor, label: source.label, openSheet: openSheet && !visitor, ...entry });
    return gate;
}
