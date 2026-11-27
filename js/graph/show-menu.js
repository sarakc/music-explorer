// The graph's Show chip (top right, beside Collection | Discover, in the app and the viewer):
// Show › Artists, Albums, Labels, Tags and Tracks in a small menu. The checkboxes carry `data-atlas-show`
// (SHOW in atlas-options.js): AtlasView hears their change and redraws, the focus always
// staying. Escape or a click elsewhere closes the menu.
import { SHOW } from './atlas-options.js';

export function showMenuHtml(show, open) {
    return `<button type="button" class="atlas-chip" data-show-toggle aria-expanded="${open}" aria-haspopup="true">Show</button>${open
        ? `<div class="atlas-pop show-pop" role="group" aria-label="Show">${SHOW.map(([key, label]) => `<label class="show-item"><input type="checkbox" data-atlas-show="${key}"${show?.[key] !== false ? ' checked' : ''}> ${label}</label>`).join('')}</div>`
        : ''}`;
}

export default class ShowMenu {
    /** Draw the chip into `host`; `show()` reads what the graph shows now. */
    constructor(host, { show = () => ({}) } = {}) {
        this.host = host; this.show = show; this.open = false;
        this._outside = (e) => { if (this.open && !this.host.contains(e.target)) this.close(); };
        host.addEventListener('click', (e) => { if (e.target.closest('[data-show-toggle]')) this.toggle(); });
        host.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || !this.open) return;
            e.preventDefault(); e.stopPropagation();
            this.close({ restoreFocus: true });
        });
        host.ownerDocument.addEventListener('pointerdown', this._outside, true);
        this.render();
    }

    destroy() { this.host.ownerDocument.removeEventListener('pointerdown', this._outside, true); }

    /** Back on screen after destroy() (the map suspended and resumed): it listens for clicks elsewhere again. */
    attach() { this.host.ownerDocument.addEventListener('pointerdown', this._outside, true); }

    toggle() { if (this.open) this.close({ restoreFocus: true }); else { this.open = true; this.render(); this.host.querySelector('[data-atlas-show]')?.focus(); } }

    close({ restoreFocus = false } = {}) {
        if (!this.open) return false;
        const hadFocus = this.host.contains(this.host.ownerDocument.activeElement);
        this.open = false;
        this.render();
        if (restoreFocus || hadFocus) this.host.querySelector('[data-show-toggle]')?.focus();
        return true;
    }

    render() { this.host.innerHTML = showMenuHtml(this.show(), this.open); }
}
