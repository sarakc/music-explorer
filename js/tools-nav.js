// Tools' navigation bits that app.js wires: which tool the Tools entry and
// the Cleanup tab open, and Apply at the right of the Tools tab row.
import { isCleanupView } from './sections.js';

const TOOL_VIEWS = new Set(['tagging', 'formatting', 'fields', 'identities', 'sound-check', 'paths', 'duplicates', 'storage']);
/** Views drawn by the shared list (tool-list.js). */
const LIST_VIEWS = new Set(['tagging', 'fields', 'formatting']);
export const isToolListView = (view) => LIST_VIEWS.has(view);
/** The page title over a shared-list tool: its tab's name. */
export const toolListTitle = (view) => (view === 'tagging' ? 'Tagging' : 'Cleanup');
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* preference only */ } };

/** Remember the tool (and Cleanup sub-tool) last opened. */
export function rememberTool(view) {
    if (!TOOL_VIEWS.has(view)) return;
    write('umm.lastTool', view);
    if (isCleanupView(view)) write('umm.lastCleanup', view);
}

/** The view the Tools sidebar entry opens: the last tool used, else Tagging. */
export function toolsEntryView() {
    const v = read('umm.lastTool');
    return TOOL_VIEWS.has(v) ? v : 'tagging';
}

/** The view the Cleanup tab opens: the last sub-tool used, else Formatting. */
export function cleanupEntryView() {
    const v = read('umm.lastCleanup');
    return isCleanupView(v) ? v : 'formatting';
}

/** Distinct tracks with a staged diff. */
export const stagedTrackCount = (diffs) => new Set((diffs || []).map((d) => String(d.trackId))).size;

/** `12 staged · Apply`, or `Last batch · <status>` when nothing is staged but a batch can resume. */
export function applySlotHtml({ staged = 0, recoverable = null } = {}) {
    if (staged > 0) return `<span class="section-tab-apply">${staged.toLocaleString()} staged<button type="button" data-tools-apply>Apply</button></span>`;
    if (recoverable?.batchId) return `<span class="section-tab-apply">Last batch<button type="button" data-tools-apply data-batch-id="${String(recoverable.batchId).replace(/"/g, '&quot;')}">${String(recoverable.status || 'Open').replace(/[<>&"]/g, '')}</button></span>`;
    return '';
}

/** Draw Apply into the tab row on Tools; remove it elsewhere. */
export function mountToolsApply(tabsEl, section, state, onApply) {
    if (!tabsEl) return;
    tabsEl.querySelector('.section-tab-apply')?.remove();
    if (section !== 'tools') return;
    const html = applySlotHtml(state);
    if (!html) return;
    tabsEl.insertAdjacentHTML('beforeend', html);
    tabsEl.querySelector('[data-tools-apply]').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onApply(e.currentTarget.dataset.batchId || null);
    });
}
