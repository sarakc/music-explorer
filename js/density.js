// UI density — mirrors SkinManager's pattern: a named token (compact / default / roomy)
// maps to a set of CSS custom properties on :root. Persisted to localStorage so it
// applies before first paint on reload. The picker mounts alongside .skin-picker
// in the top bar; both are global UI knobs, neither needs a settings panel.

const STORAGE_KEY = 'umm.density';
const DEFAULT_NAME = 'default';

const MODES = {
    compact: {
        label: 'Compact',
        '--density-row-padding-y': '6px',
        '--density-row-padding-x': '8px',
        '--density-table-font-size': '13px',
        '--density-header-padding-y': '5px',
        '--density-thumb-size': '20px',
        '--density-stat-card-padding': '6px 10px',
        '--density-stat-card-h3': '1.05rem',
        '--density-card-gap': '6px',
    },
    default: null, // Falls back to :root values in main.css.
    roomy: {
        label: 'Roomy',
        '--density-row-padding-y': '14px',
        '--density-row-padding-x': '18px',
        '--density-table-font-size': '14px',
        '--density-header-padding-y': '14px',
        '--density-thumb-size': '40px',
        '--density-stat-card-padding': '20px 24px',
        '--density-stat-card-h3': '1.8rem',
        '--density-card-gap': '16px',
    },
};

const MANAGED_VARS = [
    '--density-row-padding-y',
    '--density-row-padding-x',
    '--density-table-font-size',
    '--density-header-padding-y',
    '--density-thumb-size',
    '--density-stat-card-padding',
    '--density-stat-card-h3',
    '--density-card-gap',
];

export class DensityManager {
    constructor() {
        this.current = localStorage.getItem(STORAGE_KEY) || DEFAULT_NAME;
    }

    names() {
        return Object.keys(MODES);
    }

    apply(name) {
        const root = document.documentElement;
        const mode = MODES[name];
        for (const k of MANAGED_VARS) root.style.removeProperty(k);
        root.classList.remove('density-compact', 'density-roomy');
        if (mode) {
            for (const v of MANAGED_VARS) if (mode[v]) root.style.setProperty(v, mode[v]);
            if (name === 'compact') root.classList.add('density-compact');
            else if (name === 'roomy') root.classList.add('density-roomy');
        }
        this.current = MODES[name] ? name : DEFAULT_NAME;
        localStorage.setItem(STORAGE_KEY, this.current);
    }

    load() {
        this.apply(this.current);
    }

    mountPicker(container) {
        const sel = document.createElement('select');
        sel.className = 'density-picker';
        sel.setAttribute('aria-label', 'UI density');
        sel.title = 'UI density';
        for (const name of this.names()) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name === 'default' ? 'Default' : (MODES[name]?.label || name);
            if (name === this.current) opt.selected = true;
            sel.appendChild(opt);
        }
        sel.addEventListener('change', (e) => this.apply(e.target.value));
        container.appendChild(sel);
    }
}

export default DensityManager;
