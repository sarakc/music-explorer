// FilterEngine: multi-faceted filtering with AND across categories, OR within

import { expandCamelotCompatible } from './key-compat.js';
import { compileGroups, isEmptyRules, splitGenreField } from './filter-rules.js';

class FilterEngine {
    constructor() {
        this.state = {
            artists: [],
            labels: [],
            albums: [],
            genres: [],
            subgenres: [],
            tags: [],
            years: [],
            sources: [],
            keys: [],
            bpmRange: null, // {min, max} when active, null otherwise
            yearRange: null, // {min, max} whole years, both set, inclusive
            camelotCompatible: false,
            search: '',
            ids: null, // Session-only evidence or gig track list.
            scope: null, // { id, depth, name, ids }: a selection and its rings (graph/scope.js), in the route as around:.
            dateAddedRange: null, // { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } inclusive
            matchMode: 'all', // 'all' = AND across facets, 'any' = OR across facets
            rules: null, // Two-level rule groups (filter-rules.js); null = flat mode above.
            invalidFilter: false, // A rules segment that could not be read; rules are ignored, batch actions blocked.
        };
        this._onChangeCallbacks = [];
        this._context = {};
        this.lastSkipped = [];
    }

    // Rules mode. Empty rules mean flat mode; setting rules clears the invalid flag.
    setRules(rules) {
        this.state.rules = rules && !isEmptyRules(rules) ? rules : null;
        this.state.invalidFilter = false;
        this._notify();
    }

    // Data rules need beyond the track row: membershipIndex, soundStatusIndex,
    // credits, identities, relations. Resolved by the app before a pass.
    setContext(ctx) { this._context = ctx || {}; }
    getContext() { return this._context; }

    setMatchMode(mode) {
        this.state.matchMode = mode === 'any' ? 'any' : 'all';
        this._notify();
    }

    onChange(cb) {
        this._onChangeCallbacks.push(cb);
    }

    _notify() {
        for (const cb of this._onChangeCallbacks) cb(this.state);
    }

    setFilter(category, values) {
        this.state[category] = Array.isArray(values) ? values : [values];
        this._notify();
    }

    /** One end may be open: `{ from }`, `{ to }` or both ('YYYY-MM-DD'). Neither clears. */
    setDateAddedRange(range) {
        const from = range?.from || '', to = range?.to || '';
        this.state.dateAddedRange = from || to ? { from, to } : null;
        this._notify();
    }

    /** Whole years, both required; reversed bounds swap. A range replaces discrete `years`. */
    setYearRange(min, max) {
        const lo = min == null || min === '' ? NaN : Math.trunc(Number(min));
        const hi = max == null || max === '' ? NaN : Math.trunc(Number(max));
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) this.state.yearRange = null;
        else {
            this.state.yearRange = { min: Math.min(lo, hi), max: Math.max(lo, hi) };
            this.state.years = [];
        }
        this._notify();
    }

    toggleFilter(category, value) {
        // Backfill missing array facets — older persisted state (crates,
        // IDB-restored filter scopes) can predate newer keys like `albums`.
        if (!Array.isArray(this.state[category])) this.state[category] = [];
        const arr = this.state[category];
        const idx = arr.indexOf(value);
        if (idx >= 0) arr.splice(idx, 1);
        else arr.push(value);
        this._notify();
    }

    setBpmRange(min, max) {
        if (min == null && max == null) this.state.bpmRange = null;
        else this.state.bpmRange = { min: min == null ? null : Number(min), max: max == null ? null : Number(max) };
        this._notify();
    }

    setCamelotCompatible(on) {
        this.state.camelotCompatible = !!on;
        this._notify();
    }

    setSearch(query) {
        this.state.search = query;
        this._notify();
    }

    setIds(ids, label = '') {
        const list = Array.isArray(ids) ? [...new Set(ids.map(String))] : [];
        this.state.ids = Array.isArray(ids) ? { ids: list, label: String(label || '') } : null;
        this._notify();
    }

    /** The scope ({ id, depth, name, ids }), or null to clear it. A search and the filter narrow within it. */
    setScope(scope) {
        this.state.scope = scope?.id ? { id: scope.id, depth: scope.depth, name: scope.name || '', ids: scope.ids ? [...scope.ids].map(String) : null } : null;
        this._notify();
    }

    clearAll() {
        const matchMode = this.state.matchMode || 'all';
        this.state = {
            artists: [], labels: [], albums: [], genres: [], subgenres: [], tags: [], years: [], sources: [],
            keys: [], bpmRange: null, yearRange: null, camelotCompatible: false,
            dateAddedRange: null, search: '', ids: null, scope: null,
            matchMode, rules: null, invalidFilter: false,
        };
        this._notify();
    }

    clearCategory(category) {
        if (category === 'bpmRange') this.state.bpmRange = null;
        else if (category === 'yearRange') this.state.yearRange = null;
        else if (category === 'camelotCompatible') this.state.camelotCompatible = false;
        else if (category === 'dateAddedRange') this.state.dateAddedRange = null;
        else if (category === 'ids') this.state.ids = null;
        else if (category === 'scope') this.state.scope = null;
        else if (category === 'rules') { this.state.rules = null; this.state.invalidFilter = false; }
        else this.state[category] = [];
        this._notify();
    }

    hasActiveFilters() {
        return !!(this.state.search || this.state.ids || this.state.scope?.id || this.state.invalidFilter ||
            (this.state.rules && !isEmptyRules(this.state.rules)) ||
            this.state.artists.length || this.state.labels.length ||
            (this.state.albums && this.state.albums.length) ||
            this.state.genres.length || (this.state.subgenres && this.state.subgenres.length) ||
            this.state.tags.length ||
            this.state.years.length || this.state.sources.length ||
            this.state.keys.length || this.state.bpmRange || this.state.yearRange ||
            this.state.dateAddedRange);
    }

    /** Is any filter but `category` on? (Playlists read the search field's text as a name filter.) */
    hasActiveFiltersExcept(category) {
        const saved = this.state[category];
        this.state[category] = Array.isArray(saved) ? [] : category === 'search' ? '' : null;
        try { return this.hasActiveFilters(); }
        finally { this.state[category] = saved; }
    }

    // Filter-bar options for the current state. With nothing active this is
    // getFilterOptions; otherwise each facet, the key list and the BPM range
    // come from the tracks matching every *other* filter, so a control never
    // disappears or narrows itself away once it is used.
    getNarrowedOptions(tracks) {
        if (!this.hasActiveFilters()) return this.getFilterOptions(tracks);
        const options = { counts: {} };
        for (const cat of ['sources', 'genres', 'subgenres', 'artists', 'labels', 'albums', 'tags', 'years', 'keys']) {
            const counts = new Map();
            options[cat] = this.getFilterOption(this.applyFiltersExcept(tracks, cat), cat, counts);
            options.counts[cat] = counts;
        }
        options.bpm = this.getFilterOptions(this.applyFiltersExcept(tracks, 'bpmRange')).bpm;
        options.yearSpan = this.getFilterOptions(this.applyFiltersExcept(tracks, 'yearRange')).yearSpan;
        return options;
    }

    // Extract all unique filter options from a track set.
    // Genre strings use "Genre: Subgenre" convention; split on first colon,
    // then split each half on comma/slash for multi-value.
    // Each facet is returned sorted alphabetically; .counts maps each value → frequency.
    getFilterOptions(tracks) {
        const bump = (map, key) => { if (key) map.set(key, (map.get(key) || 0) + 1); };
        const artists = new Map();
        const labels = new Map();
        const albums = new Map();
        const genres = new Map();
        const subgenres = new Map();
        const tags = new Map();
        const years = new Map();
        const sources = new Map();
        const keys = new Map();
        const yearValues = [];
        let bpmMin = Infinity;
        let bpmMax = -Infinity;
        const bpmValues = [];

        for (const t of tracks) {
            bump(artists, t.artist);
            bump(labels, t.label);
            bump(albums, t.album);
            const { genres: gToks, subgenres: sgToks } = splitGenreField(t.genre);
            for (const g of gToks) bump(genres, g);
            for (const sg of sgToks) bump(subgenres, sg);
            if (t.tags && Array.isArray(t.tags)) {
                for (const tag of t.tags) bump(tags, tag);
            } else if (t.comments) {
                for (const tag of t.comments.split(',').map(s => s.trim()).filter(Boolean)) bump(tags, tag);
            }
            if (t.year) bump(years, String(t.year));
            const y = Math.trunc(Number(t.year));
            // Four-digit years only: a typo (7, 410) would stretch the sparkline and make an unlinkable range.
            if (t.year !== '' && t.year != null && y >= 1000 && y <= 9999) yearValues.push(y);
            bump(sources, t.source || t.platform);
            if (t.tonality) bump(keys, String(t.tonality).trim());
            const bpm = Number(t.bpm);
            if (Number.isFinite(bpm) && bpm > 0) {
                if (bpm < bpmMin) bpmMin = bpm;
                if (bpm > bpmMax) bpmMax = bpm;
                bpmValues.push(bpm);
            }
        }

        const sortedAlpha = (map) => [...map.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        const sortedNumDesc = (map) => [...map.keys()].sort((a, b) => Number(b) - Number(a));

        return {
            artists: sortedAlpha(artists),
            labels: sortedAlpha(labels),
            albums: sortedAlpha(albums),
            genres: sortedAlpha(genres),
            subgenres: sortedAlpha(subgenres),
            tags: sortedAlpha(tags),
            years: sortedNumDesc(years),
            sources: sortedAlpha(sources),
            keys: sortedAlpha(keys),
            bpm: bpmMin === Infinity ? null : { min: Math.floor(bpmMin), max: Math.ceil(bpmMax), values: bpmValues },
            yearSpan: yearValues.length ? { min: yearValues.reduce((a, b) => (b < a ? b : a)), max: yearValues.reduce((a, b) => (b > a ? b : a)), values: yearValues } : null,
            counts: { artists, labels, albums, genres, subgenres, tags, years, sources, keys },
        };
    }

    // Build a single facet (sorted array of unique values) from a track set.
    // Cheaper than getFilterOptions when the caller only needs one category —
    // avoids building the other 8 maps and the bpmValues array.
    getFilterOption(tracks, category, map = new Map()) {
        const bump = (m, key) => { if (key) m.set(key, (m.get(key) || 0) + 1); };
        switch (category) {
            case 'artists':
                for (const t of tracks) bump(map, t.artist);
                break;
            case 'labels':
                for (const t of tracks) bump(map, t.label);
                break;
            case 'albums':
                for (const t of tracks) bump(map, t.album);
                break;
            case 'genres':
                for (const t of tracks) {
                    const { genres: gToks } = splitGenreField(t.genre);
                    for (const g of gToks) bump(map, g);
                }
                break;
            case 'subgenres':
                for (const t of tracks) {
                    const { subgenres: sgToks } = splitGenreField(t.genre);
                    for (const sg of sgToks) bump(map, sg);
                }
                break;
            case 'tags':
                for (const t of tracks) {
                    if (t.tags && Array.isArray(t.tags)) {
                        for (const tag of t.tags) bump(map, tag);
                    } else if (t.comments) {
                        for (const tag of t.comments.split(',').map(s => s.trim()).filter(Boolean)) bump(map, tag);
                    }
                }
                break;
            case 'years':
                for (const t of tracks) { if (t.year) bump(map, String(t.year)); }
                return [...map.keys()].sort((a, b) => Number(b) - Number(a));
            case 'sources':
                for (const t of tracks) bump(map, t.source || t.platform);
                break;
            case 'keys':
                for (const t of tracks) { if (t.tonality) bump(map, String(t.tonality).trim()); }
                break;
            default:
                return [];
        }
        return [...map.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }

    // Apply current filters EXCEPT the named category. Used to compute
    // dropdown options that narrow as other filters are applied while still
    // letting the user add another value within the same category.
    applyFiltersExcept(tracks, exceptCategory) {
        if (exceptCategory === 'bpmRange') {
            const saved = this.state.bpmRange;
            this.state.bpmRange = null;
            try { return this.applyFilters(tracks); }
            finally { this.state.bpmRange = saved; }
        }
        if (exceptCategory === 'yearRange') {
            const saved = this.state.yearRange;
            this.state.yearRange = null;
            try { return this.applyFilters(tracks); }
            finally { this.state.yearRange = saved; }
        }
        if (exceptCategory === 'dateAddedRange') {
            const saved = this.state.dateAddedRange;
            this.state.dateAddedRange = null;
            try { return this.applyFilters(tracks); }
            finally { this.state.dateAddedRange = saved; }
        }
        const saved = this.state[exceptCategory];
        this.state[exceptCategory] = Array.isArray(saved) ? [] : '';
        try { return this.applyFilters(tracks); }
        finally { this.state[exceptCategory] = saved; }
    }

    // Apply current filters to a track set. AND across categories, OR within.
    // When state.matchMode === 'any', facet matches are OR'd; search remains AND.
    applyFilters(tracks) {
        const s = this.state;
        let result = tracks;
        if (s.ids) {
            const ids = new Set(s.ids.ids.map(String));
            result = result.filter(t => ids.has(String(t.id)));
        }
        // A scope whose tracks are not worked out yet lists nothing rather than everything.
        if (s.scope?.id) {
            const ids = new Set(s.scope.ids || []);
            result = result.filter(t => ids.has(String(t.id)));
        }

        if (s.search) {
            const q = s.search.toLowerCase();
            result = result.filter(t => {
                if ((t.title || '').toLowerCase().includes(q)) return true;
                if ((t.artist || '').toLowerCase().includes(q)) return true;
                if ((t.album || '').toLowerCase().includes(q)) return true;
                if ((t.label || '').toLowerCase().includes(q)) return true;
                if ((t.genre || '').toLowerCase().includes(q)) return true;
                if ((t.comments || '').toLowerCase().includes(q)) return true;
                if (Array.isArray(t.tags) && t.tags.some(tag => (tag || '').toLowerCase().includes(q))) return true;
                return false;
            });
        }

        if (s.rules && !s.invalidFilter && !isEmptyRules(s.rules)) {
            const compiled = compileGroups(s.rules, { ...this._context, tracks });
            this.lastSkipped = compiled.skipped;
            return result.filter(compiled.test);
        }
        this.lastSkipped = [];

        const predicates = [];
        if (s.artists.length) {
            const set = new Set(s.artists.map(a => a.toLowerCase()));
            predicates.push(t => set.has((t.artist || '').toLowerCase()));
        }
        if (s.labels.length) {
            const set = new Set(s.labels.map(l => l.toLowerCase()));
            predicates.push(t => set.has((t.label || '').toLowerCase()));
        }
        if (s.albums && s.albums.length) {
            const set = new Set(s.albums.map(a => a.toLowerCase()));
            predicates.push(t => set.has((t.album || '').toLowerCase()));
        }
        if (s.genres.length) {
            const set = new Set(s.genres.map(g => g.toLowerCase()));
            predicates.push(t => {
                const { genres } = splitGenreField(t.genre);
                return genres.some(g => set.has(g.toLowerCase()));
            });
        }
        if (s.subgenres && s.subgenres.length) {
            const set = new Set(s.subgenres.map(g => g.toLowerCase()));
            predicates.push(t => {
                const { subgenres } = splitGenreField(t.genre);
                return subgenres.some(sg => set.has(sg.toLowerCase()));
            });
        }
        if (s.tags.length) {
            const set = new Set(s.tags.map(tg => tg.toLowerCase()));
            predicates.push(t => {
                const trackTags = (t.tags && t.tags.length)
                    ? t.tags.map(tg => tg.toLowerCase())
                    : (t.comments || '').split(',').map(tg => tg.trim().toLowerCase()).filter(Boolean);
                return trackTags.some(tg => set.has(tg));
            });
        }
        if (s.years.length) {
            const set = new Set(s.years);
            predicates.push(t => set.has(String(t.year)));
        }
        if (s.yearRange) {
            const { min, max } = s.yearRange;
            predicates.push(t => {
                if (t.year === '' || t.year == null) return false;
                const y = Number(t.year);
                return Number.isFinite(y) && y >= min && y <= max;
            });
        }
        if (s.sources.length) {
            const set = new Set(s.sources);
            predicates.push(t => set.has(t.source) || set.has(t.platform));
        }
        if (s.keys.length) {
            const allowed = s.camelotCompatible ? expandCamelotCompatible(s.keys) : new Set(s.keys);
            predicates.push(t => !!t.tonality && allowed.has(String(t.tonality).trim()));
        }
        if (s.bpmRange) {
            const lo = s.bpmRange.min;
            const hi = s.bpmRange.max;
            predicates.push(t => {
                const bpm = Number(t.bpm);
                if (!Number.isFinite(bpm) || bpm <= 0) return false;
                if (lo != null && bpm < lo) return false;
                if (hi != null && bpm > hi) return false;
                return true;
            });
        }
        if (s.dateAddedRange && (s.dateAddedRange.from || s.dateAddedRange.to)) {
            const { from, to } = s.dateAddedRange;
            predicates.push(t => {
                const d = (t.date_added || '').slice(0, 10);
                return !!d && (!from || d >= from) && (!to || d <= to);
            });
        }

        if (predicates.length === 0) return result;

        if (s.matchMode === 'any') {
            return result.filter(t => predicates.some(p => p(t)));
        }
        return result.filter(t => predicates.every(p => p(t)));
    }
}

export default FilterEngine;
