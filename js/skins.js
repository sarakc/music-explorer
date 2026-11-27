const STORAGE_KEY = 'umm.skin';
const DEFAULT_NAME = 'default';
export const DEFAULT_SKIN = 'corals-classic';
const PALETTE_VERSION_KEY = 'umm.paletteVersion';
const PALETTE_VERSION = '2';

const hexToRgb = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (r, g, b) =>
    '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

// Linear RGB mix of two hexes. t=0 returns a, t=1 returns b.
const mix = (a, b, t) => {
    const [ar, ag, ab] = hexToRgb(a);
    const [br, bg, bb] = hexToRgb(b);
    return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
};

// Perceived luminance (0–1). Used to decide contrast direction when mixing.
const luminance = (hex) => {
    const [r, g, b] = hexToRgb(hex).map(v => v / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// WCAG relative luminance (gamma-corrected). Used to choose on-accent contrast color.
function relativeLuminance(hex) {
    const m = hex.replace('#', '').match(/.{2}/g);
    const [r, g, b] = m.map(h => {
        const v = parseInt(h, 16) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Map a palette definition onto the app's full set of CSS variables.
 * Each palette provides 6–8 anchor roles (bg, text, accentWarm, etc.);
 * the remaining design variants (bg-hover, text-faint, *-soft) are derived
 * via RGB mixing so the visual rhythm stays consistent across themes.
 *
 * Accepts the legacy array format {"name": ["#...", ...]} by dropping back
 * to a luminance-sorted default mapping.
 */
export function buildVars(p) {
    if (Array.isArray(p)) return legacyBuildVars(p);

    const dark = !!p.dark;
    const bg = p.bg;
    const text = p.text;
    const white = '#ffffff';
    const black = '#000000';

    const bgRaised = p.bgRaised || mix(bg, dark ? white : white, dark ? 0.06 : 0.35);
    const bgHover = p.bgHover || mix(bg, text, dark ? 0.10 : 0.07);
    const textDim = p.textDim || mix(text, bg, 0.30);
    const textFaint = p.textFaint || mix(text, bg, 0.55);
    const border = p.border || mix(bg, text, dark ? 0.18 : 0.22);
    const accentWarm = p.accentWarm;
    const accentCool = p.accentCool || mix(accentWarm, bg, 0.4);

    // Soft backgrounds for pill/tag highlights. In dark mode, mix *toward text*
    // (lightness) so the pill reads above bg; in light mode, mix toward bg.
    const softMixTarget = dark ? text : bg;
    const softMixT = dark ? 0.78 : 0.72;

    const accentWarmSoft = p.accentWarmSoft || mix(accentWarm, softMixTarget, softMixT);
    const accentCoolSoft = p.accentCoolSoft || mix(accentCool, softMixTarget, softMixT);
    const accentDim = p.accentDim || mix(accentWarm, dark ? white : black, 0.22);

    // On-accent contrast: pick whichever of white, palette text, or bg has the
    // highest WCAG contrast ratio against the accent. Including bg handles
    // bright accents (e.g. L>0.7) where both white and near-white text fail
    // — dark text wins and the button reads like Linear/Spotify.
    const accentLum = relativeLuminance(accentWarm);
    const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const pickOn = (hex) => {
        const l = relativeLuminance(hex);
        return (p.source ? [white, text, bg, black] : [white, text, bg]).reduce((best, c) =>
            contrast(l, relativeLuminance(c)) > contrast(l, relativeLuminance(best)) ? c : best
        );
    };
    const onAccent = pickOn(accentWarm);

    // Chart palette: six slots derived from accent roles so Discover charts
    // follow the skin. Ordered for visual variety on stacked/sequential data.
    // On dark skins the *-soft roles are near-bg fills, so the tint slots mix
    // toward text instead — otherwise two bars vanish into the panel.
    const chartPalette = p.chartPalette?.length ? Array.from({ length: 6 }, (_, i) => p.chartPalette[i % p.chartPalette.length]) : [
        accentWarm,
        accentCool,
        accentDim,
        dark ? mix(accentWarm, text, 0.45) : accentWarmSoft,
        dark ? mix(accentCool, text, 0.45) : accentCoolSoft,
        mix(accentCool, dark ? white : black, 0.22),
    ];

    // Sorbet is the app-wide "selection" hue (row washes, active tabs, the
    // selection bar). Default skin keeps its fixed coral; skins lift their
    // warm accent toward white so selection reads as candy, not as a button.
    const sorbet = p.sorbet || mix(accentWarm, white, dark ? 0.12 : 0.28);
    // Text/icon color on a solid sorbet band (the selected table row).
    const onSorbet = pickOn(sorbet);

    const sourceRoles = p.source && p.entityColors ? {
        '--pistachio': p.entityColors.tag,
        '--butter': p.entityColors.artist,
        '--lilac': p.entityColors.label,
        '--blueshine': accentCool,
        '--accent-text': p.accentText || accentWarm,
    } : {};
    return {
        ...sourceRoles,
        '--bg': bg,
        '--bg-raised': bgRaised,
        '--bg-hover': bgHover,
        '--text': text,
        '--text-dim': textDim,
        '--text-faint': textFaint,
        '--border': border,
        '--accent': accentWarm,
        '--accent-dim': accentDim,
        '--accent-soft': accentWarmSoft,
        '--accent-warm': accentWarm,
        '--accent-warm-soft': accentWarmSoft,
        '--accent-cool': accentCool,
        '--accent-cool-soft': accentCoolSoft,
        '--success': accentCool,
        '--error': dark ? '#ff9b9b' : '#a5283b',
        '--on-accent': onAccent,
        '--sorbet': sorbet,
        '--on-sorbet': onSorbet,
        '--chart-palette-0': chartPalette[0],
        '--chart-palette-1': chartPalette[1],
        '--chart-palette-2': chartPalette[2],
        '--chart-palette-3': chartPalette[3],
        '--chart-palette-4': chartPalette[4],
        '--chart-palette-5': chartPalette[5],
    };
}

// Fallback for old array-shaped palettes: sort dark→light, most-saturated as accent.
function legacyBuildVars(palette) {
    const saturation = (hex) => {
        const [r, g, b] = hexToRgb(hex);
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        return max === 0 ? 0 : (max - min) / max;
    };
    const sorted = [...palette].sort((a, b) => luminance(a) - luminance(b));
    const accent = [...palette].sort((a, b) => saturation(b) - saturation(a))[0];
    return buildVars({
        dark: luminance(sorted[sorted.length - 1]) < 0.4,
        bg: sorted[sorted.length - 1],
        text: sorted[0],
        textDim: sorted[1],
        border: sorted[Math.floor(sorted.length / 2)],
        accentWarm: accent,
        accentCool: sorted[2],
    });
}

// Keys we own on documentElement.style — used to clear overrides when
// switching back to the default skin (main.css :root values then take effect).
const MANAGED_VARS = [
    '--pistachio', '--butter', '--lilac', '--blueshine', '--accent-text',
    '--bg', '--bg-raised', '--bg-hover',
    '--text', '--text-dim', '--text-faint',
    '--border',
    '--accent', '--accent-dim', '--accent-soft',
    '--accent-warm', '--accent-warm-soft',
    '--accent-cool', '--accent-cool-soft',
    '--success', '--error',
    '--on-accent',
    '--sorbet', '--on-sorbet',
    '--chart-palette-0', '--chart-palette-1', '--chart-palette-2',
    '--chart-palette-3', '--chart-palette-4', '--chart-palette-5',
];

// "corals-colors" → "Corals Colors" for the picker; keys stay as stored.
export function skinLabel(name) {
    return String(name).split('-').filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export class SkinManager {
    constructor() {
        this.palettes = {};
        const saved = localStorage.getItem(STORAGE_KEY);
        // Existing Corals Colors users retain the exact old appearance. A new
        // deliberate selection of the rebuilt palette persists with version 2.
        this.current = saved === 'corals-colors' && localStorage.getItem(PALETTE_VERSION_KEY) !== PALETTE_VERSION
            ? 'corals-classic' : saved || DEFAULT_SKIN;
    }

    async load() {
        const res = await fetch('assets/palettes.json');
        this.palettes = await res.json();
        this.apply(this.current);
    }

    names() {
        return [DEFAULT_NAME, ...Object.keys(this.palettes)];
    }

    apply(name) {
        const root = document.documentElement;
        // Clear source-only overrides when returning to Classic or a legacy skin.
        for (const k of MANAGED_VARS) root.style.removeProperty(k);
        if (name === DEFAULT_NAME || !this.palettes[name]) {
            for (const k of MANAGED_VARS) root.style.removeProperty(k);
            root.classList.remove('skin-dark');
            this.current = DEFAULT_NAME;
        } else {
            const palette = this.palettes[name];
            const vars = buildVars(palette);
            for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
            root.classList.toggle('skin-dark', !Array.isArray(palette) && !!palette.dark);
            this.current = name;
        }
        localStorage.setItem(STORAGE_KEY, this.current);
        localStorage.setItem(PALETTE_VERSION_KEY, PALETTE_VERSION);
        document.dispatchEvent(new CustomEvent('skin-changed', { detail: { skin: this.current } }));
    }

    // Returns a 4-color preview strip for the skin picker: bg, accentWarm, accentCool, text.
    preview(name) {
        if (name === DEFAULT_NAME) return ['#f5f3ee', '#c2562a', '#6b7a8a', '#1a1815'];
        const p = this.palettes[name];
        if (Array.isArray(p)) {
            const sorted = [...p].sort((a, b) => luminance(a) - luminance(b));
            return [sorted[sorted.length - 1], sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[1]];
        }
        return [p.bg, p.accentWarm, p.accentCool, p.text];
    }

    mountPicker(container) {
        const sel = document.createElement('select');
        sel.className = 'skin-picker';
        sel.setAttribute('aria-label', 'Color skin');
        for (const name of this.names()) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name === DEFAULT_NAME ? 'Terracotta' : name === DEFAULT_SKIN ? 'Corals Classic (default)' : `${skinLabel(name)}${this.palettes[name]?.legacy ? ' (legacy)' : ''}`;
            if (name === this.current) opt.selected = true;
            sel.appendChild(opt);
        }
        sel.addEventListener('change', (e) => this.apply(e.target.value));
        container.appendChild(sel);
    }
}
