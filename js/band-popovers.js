// The filter band's popovers (filter band spec): a facet picker per facet button and Added's
// presets, opened from the band and kept open across its repaints. The app hands in how to
// change the filter (`apply`, which repaints the band), the current options and state, and
// what More does; it calls refresh() after each band paint and handleClick() from its band
// click handler.
import { FacetPicker, AddedPicker } from './facet-picker.js';
import { FILTER_CONTROLS } from './collection-header.js';
import { todayIso } from './added-window.js';

const labelOf = (cat) => FILTER_CONTROLS.find((c) => c.key === cat)?.label || cat;

export function createBandPopovers({ doc = document, engine, apply, current, onMore = () => {}, swatches = () => null, today = todayIso }) {
    const facetData = (cat, { options = {}, state = {} } = {}) => ({
        cat,
        label: labelOf(cat),
        values: Array.isArray(options[cat]) ? options[cat] : [],
        counts: options.counts?.[cat] || null,
        active: Array.isArray(state[cat]) ? state[cat] : [],
        swatches: cat === 'subgenres' ? swatches() : null,
    });
    const picker = new FacetPicker({
        doc,
        onToggle: (cat, value) => apply(() => engine.toggleFilter(cat, value)),
        onOnly: (cat, value) => apply(() => engine.setFilter(cat, [value])),
        onClear: (cat) => apply(() => engine.clearCategory(cat)),
    });
    const added = new AddedPicker({
        doc, today,
        onRange: (range) => apply(() => engine.setDateAddedRange(range)),
    });
    const close = () => { picker.close(); added.close(); };

    return {
        get isOpen() { return picker.isOpen || added.isOpen; },
        close,
        /** True when the click was a band control this module owns. */
        handleClick(e) {
            const t = e.target;
            if (t?.closest?.('[data-band-more]')) { close(); onMore(); return true; }
            const addedBtn = t?.closest?.('[data-added-btn]');
            if (addedBtn) {
                if (added.isOpen) added.close();
                else { picker.close(); added.open(addedBtn, { range: current().state?.dateAddedRange || null }); }
                return true;
            }
            const facet = t?.closest?.('.facet-btn[data-filter-cat]');
            if (facet) {
                const cat = facet.getAttribute('data-filter-cat');
                const wasOpen = picker.isOpen && picker.cat === cat;
                added.close();
                if (wasOpen) picker.close();
                else picker.open(facet, facetData(cat, current()));
                return true;
            }
            return false;
        },
        /** After the band paints (or empties): re-anchor whichever popover is open. */
        refresh(band, now = current()) {
            if (picker.isOpen) picker.refresh(band, facetData(picker.cat, now));
            if (added.isOpen) added.refresh(band, { range: now.state?.dateAddedRange || null });
        },
    };
}
