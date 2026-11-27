/**
 * Render <option> rows for a facet dropdown, marking values that are already
 * active in the filter state. The active ones stay in the list (the select
 * toggles them off) but carry a "✓ " prefix plus an `is-active` class so
 * it's obvious what's already applied before you add more.
 */
export function facetOptionsHtml({ values = [], active = [], counts = null, escapeHtml }) {
    const activeSet = new Set(active);
    return values.map((v) => {
        const c = counts ? counts.get(v) : null;
        const isActive = activeSet.has(v);
        const label = `${isActive ? '✓ ' : ''}${v}${c ? ` (${c})` : ''}`;
        const cls = isActive ? ' class="is-active"' : '';
        return `<option value="${escapeHtml(v)}"${cls}>${escapeHtml(label)}</option>`;
    }).join('');
}
