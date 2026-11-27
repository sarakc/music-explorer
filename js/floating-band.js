// The viewer's filter band over the map (filter band spec › Viewer): while it is open on a
// graph it floats under the map's Filter chip (`--band-x`, `--band-y`, kept inside the
// window), and a pointerdown anywhere but the band, the chip or a band picker closes it.
// The app calls sync() after each header paint; with no chip (the app, the phone) it does nothing.

export function createFloatingBand({ doc = document, onClose = () => {} } = {}) {
    let state = null; // { band, chip } while floating
    const outside = (e) => {
        if (!state) return;
        const t = e.target;
        if (state.band.contains(t) || state.chip.contains(t) || t?.closest?.('.facet-pop')) return;
        onClose();
    };
    const place = () => {
        if (!state) return;
        const { band, chip } = state;
        const r = chip.getBoundingClientRect?.();
        if (!r) return;
        const width = band.getBoundingClientRect?.().width || 0;
        const maxX = (doc.defaultView?.innerWidth || 0) - width - 8;
        band.style.setProperty('--band-x', `${Math.round(Math.max(8, Math.min(r.left, maxX)))}px`);
        band.style.setProperty('--band-y', `${Math.round(r.bottom + 6)}px`);
    };
    const stop = () => {
        if (!state) return;
        state.band.classList.remove('is-floating');
        doc.removeEventListener('pointerdown', outside, true);
        doc.defaultView?.removeEventListener?.('resize', place);
        state = null;
    };
    return {
        sync({ band, chip, open }) {
            if (!band || !chip || !open) { stop(); return; }
            if (!state) {
                doc.addEventListener('pointerdown', outside, true);
                doc.defaultView?.addEventListener?.('resize', place);
            }
            state = { band, chip };
            band.classList.add('is-floating');
            place();
        },
        stop,
    };
}
