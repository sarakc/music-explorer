// Bandcamp Follow Diff — surface labels/artists the user follows on Bandcamp but owns nothing from.
// Pure read over IndexedDB data; no network, no writes.
import { escapeHtml } from './html.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const stripDiacritics = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normalizeBase = (s) => stripDiacritics(String(s || '').toLowerCase())
    .replace(/[\u2018\u2019\u201a\u201b\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9'" ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeArtist = (s) => normalizeBase(s);

// Labels: drop corporate suffixes so "Dekmantel" matches "Dekmantel Records".
const LABEL_SUFFIXES = /\b(records?|recordings?|music|musik|label|ltd|limited|inc|llc|gmbh)\b/g;
const normalizeLabel = (s) => normalizeBase(s).replace(LABEL_SUFFIXES, '').replace(/\s+/g, ' ').trim();

const parseDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
};

const daysSince = (date, now = Date.now()) => {
    if (!date) return null;
    return Math.floor((now - date.getTime()) / DAY_MS);
};

export function humanAgo(date, now = Date.now()) {
    if (!date) return 'unknown';
    const days = daysSince(date, now);
    if (days == null) return 'unknown';
    if (days < 1) return 'today';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    const years = (days / 365).toFixed(1).replace(/\.0$/, '');
    return `${years}y ago`;
}

/** A followed artist or label lives on its own host (`name.bandcamp.com` or a custom
 *  domain). Pages on bandcamp.com itself — fan collections, sign-up, cart — are not. */
export function isFollowedPage(acc) {
    const url = acc?.url;
    if (!url) return true;
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host !== 'bandcamp.com' && host !== 'www.bandcamp.com';
    } catch (_) { return false; }
}

function ownedSets(tracks) {
    const artists = new Set();
    const labels = new Set();
    for (const t of tracks) {
        const a = normalizeArtist(t.artist);
        if (a) artists.add(a);
        const l = normalizeLabel(t.label);
        if (l) labels.add(l);
    }
    return { artists, labels };
}

function toGap(acc) {
    const followedAt = parseDate(acc.followedAt || acc.followed_at || acc.importedAt || acc.imported_at);
    return {
        name: acc.displayName || acc.display_name || acc.username || acc.url || 'Unknown',
        url: acc.url || null,
        followedAt,
        ownedCount: 0,
    };
}

function gapsFor(accounts, ownedSet, normalizeFn) {
    const out = [];
    for (const acc of accounts) {
        const name = acc.displayName || acc.display_name || acc.username || acc.url || '';
        const norm = normalizeFn(name);
        if (!norm) continue;
        if (ownedSet.has(norm)) continue;
        out.push(toGap(acc));
    }
    out.sort((a, b) => {
        const at = a.followedAt ? a.followedAt.getTime() : 0;
        const bt = b.followedAt ? b.followedAt.getTime() : 0;
        return bt - at;
    });
    return out;
}

export const BandcampDiff = {
    normalizeArtist,
    normalizeLabel,
    humanAgo,

    computeLabelGaps(tracks, followedLabels) {
        const { labels } = ownedSets(tracks || []);
        return gapsFor(followedLabels || [], labels, normalizeLabel);
    },

    computeArtistGaps(tracks, followedArtists) {
        const { artists } = ownedSets(tracks || []);
        return gapsFor(followedArtists || [], artists, normalizeArtist);
    },

    summarize(gaps) {
        const now = Date.now();
        const cutoff = now - 90 * DAY_MS;
        let recent = 0;
        let oldest = null;
        for (const g of gaps) {
            if (g.followedAt && g.followedAt.getTime() >= cutoff) recent += 1;
            if (g.followedAt && (!oldest || g.followedAt.getTime() < oldest.followedAt.getTime())) oldest = g;
        }
        return { count: gaps.length, recentlyFollowed: recent, oldestNeverExplored: oldest };
    },

    filterByWindow(gaps, windowKey) {
        if (!windowKey || windowKey === 'all') return gaps.slice();
        const months = { '3mo': 3, '6mo': 6, '12mo': 12 }[windowKey];
        if (!months) return gaps.slice();
        const cutoff = Date.now() - months * 30 * DAY_MS;
        return gaps.filter((g) => g.followedAt && g.followedAt.getTime() >= cutoff);
    },

    sortGaps(gaps, mode) {
        const arr = gaps.slice();
        if (mode === 'alpha') {
            arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        } else if (mode === 'random') {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
        } else {
            arr.sort((a, b) => {
                const at = a.followedAt ? a.followedAt.getTime() : 0;
                const bt = b.followedAt ? b.followedAt.getTime() : 0;
                return bt - at;
            });
        }
        return arr;
    },
};

const PREVIEW_LIMIT = 5;

function renderRows(gaps, limit) {
    if (gaps.length === 0) {
        return `<li class="bc-diff-empty muted">No matches in this window.</li>`;
    }
    const shown = limit ? gaps.slice(0, limit) : gaps;
    return shown.map((g) => `
        <li class="bc-diff-row" tabindex="0" data-url="${escapeHtml(g.url || '')}">
            <span class="bc-diff-name">${escapeHtml(g.name)}</span>
            <span class="bc-diff-meta">${g.followedAt ? `imported ${escapeHtml(humanAgo(g.followedAt))}` : '<span class="muted">import date unknown</span>'}</span>
            ${g.url ? `<a class="bc-diff-link" href="${escapeHtml(g.url)}" target="_blank" rel="noopener" aria-label="Open on Bandcamp">\u2197</a>` : ''}
        </li>
    `).join('');
}

function renderCard(id, title, gaps, state) {
    const summary = BandcampDiff.summarize(gaps);
    const filtered = BandcampDiff.filterByWindow(gaps, state.window);
    const sorted = BandcampDiff.sortGaps(filtered, state.sort);
    const expanded = !!state.expanded;
    const listLimit = expanded ? null : PREVIEW_LIMIT;
    const moreCount = expanded ? 0 : Math.max(0, sorted.length - PREVIEW_LIMIT);

    const windowChip = (key, label) => `
        <button class="bc-diff-chip ${state.window === key ? 'active' : ''}" data-window="${key}">${label}</button>
    `;
    const sortChip = (key, label) => `
        <button class="bc-diff-sort ${state.sort === key ? 'active' : ''}" data-sort="${key}">${label}</button>
    `;

    return `
        <div class="discover-section bc-diff-card" data-card-id="${id}">
            <h3>${escapeHtml(title)}</h3>
            <p class="muted bc-diff-subtitle">${summary.count} ${summary.count === 1 ? 'entry' : 'entries'} \u00b7 ${summary.recentlyFollowed} imported in last 90 days</p>
            <div class="bc-diff-controls">
                <!-- importedAt, not a true follow date — Bandcamp API doesn't expose it. -->
                <div class="bc-diff-chips" role="group" aria-label="Filter by import recency">
                    <span class="bc-diff-chips-label muted">Imported in last</span>
                    ${windowChip('all', 'All')}
                    ${windowChip('3mo', '3 mo')}
                    ${windowChip('6mo', '6 mo')}
                    ${windowChip('12mo', '12 mo')}
                </div>
                <div class="bc-diff-sorts" role="group" aria-label="Sort order">
                    ${sortChip('recent', 'Recent')}
                    ${sortChip('alpha', 'A\u2013Z')}
                    <button class="bc-diff-sort bc-diff-shuffle ${state.sort === 'random' ? 'active' : ''}" data-sort="random" title="Randomize the visible list as a digging prompt">\u{1F3B2} Shuffle</button>
                </div>
            </div>
            <ul class="discover-list bc-diff-list">
                ${renderRows(sorted, listLimit)}
            </ul>
            ${moreCount > 0 ? `<button class="btn-link bc-diff-expand" data-action="expand">View all (${sorted.length})</button>` : ''}
            ${expanded && sorted.length > PREVIEW_LIMIT ? `<button class="btn-link bc-diff-expand" data-action="collapse">Collapse</button>` : ''}
        </div>
    `;
}

function wireCard(root, id, gaps, state, rerender) {
    const card = root.querySelector(`.bc-diff-card[data-card-id="${id}"]`);
    if (!card) return;

    card.querySelectorAll('[data-window]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.window = btn.dataset.window;
            rerender();
        });
    });
    card.querySelectorAll('[data-sort]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.sort = btn.dataset.sort;
            rerender();
        });
    });
    card.querySelector('[data-action="expand"]')?.addEventListener('click', () => {
        state.expanded = true;
        rerender();
    });
    card.querySelector('[data-action="collapse"]')?.addEventListener('click', () => {
        state.expanded = false;
        rerender();
    });
    card.querySelectorAll('.bc-diff-row').forEach((row) => {
        const url = row.dataset.url;
        if (!url) return;
        const open = () => window.open(url, '_blank', 'noopener');
        row.addEventListener('click', (e) => {
            if (e.target.closest('.bc-diff-link')) return; // link handles itself
            open();
        });
        row.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
            }
        });
    });
}

// Renders both Bandcamp Follow Diff cards into `container` (appends innerHTML).
// accounts: array from bandcamp_accounts; tracks: full track set (unfiltered).
export function renderBandcampFollowDiff(container, tracks, accounts) {
    if (!container) return;
    const followed = (Array.isArray(accounts) ? accounts : []).filter(isFollowedPage);
    const followedLabels = followed.filter((a) => (a.accountType || a.account_type) === 'label');
    const followedArtists = followed.filter((a) => (a.accountType || a.account_type) === 'artist');

    const labelGaps = BandcampDiff.computeLabelGaps(tracks, followedLabels);
    const artistGaps = BandcampDiff.computeArtistGaps(tracks, followedArtists);

    const hasAny = followedLabels.length + followedArtists.length > 0;
    if (!hasAny) {
        const placeholder = document.createElement('div');
        placeholder.className = 'discover-section bc-diff-card bc-diff-placeholder';
        placeholder.innerHTML = `
            <h3>Bandcamp Follow Diff</h3>
            <p class="muted">Import your Bandcamp profile (Settings \u203a Other imports) to surface labels and artists you follow but own nothing from.</p>
        `;
        container.appendChild(placeholder);
        return;
    }

    const labelState = { window: 'all', sort: 'recent', expanded: false };
    const artistState = { window: 'all', sort: 'recent', expanded: false };

    const wrap = document.createElement('div');
    wrap.className = 'bc-diff-wrap';
    container.appendChild(wrap);

    const renderLabels = () => {
        const emptyHtml = `
            <div class="discover-section bc-diff-card" data-card-id="bc-diff-labels">
                <h3>Labels you follow but own nothing from</h3>
                <p class="muted">Every label you follow on Bandcamp has at least one track in your collection. Nothing to dig here.</p>
            </div>`;
        const labelsSlot = wrap.querySelector('[data-slot="labels"]') || (() => {
            const s = document.createElement('div');
            s.dataset.slot = 'labels';
            wrap.appendChild(s);
            return s;
        })();
        labelsSlot.innerHTML = labelGaps.length === 0
            ? emptyHtml
            : renderCard('bc-diff-labels', 'Labels you follow but own nothing from', labelGaps, labelState);
        if (labelGaps.length > 0) wireCard(labelsSlot, 'bc-diff-labels', labelGaps, labelState, renderLabels);
    };

    const renderArtists = () => {
        const emptyHtml = `
            <div class="discover-section bc-diff-card" data-card-id="bc-diff-artists">
                <h3>Artists you follow but own nothing from</h3>
                <p class="muted">Every artist you follow on Bandcamp has at least one track in your collection. Nothing to dig here.</p>
            </div>`;
        const slot = wrap.querySelector('[data-slot="artists"]') || (() => {
            const s = document.createElement('div');
            s.dataset.slot = 'artists';
            wrap.appendChild(s);
            return s;
        })();
        slot.innerHTML = artistGaps.length === 0
            ? emptyHtml
            : renderCard('bc-diff-artists', 'Artists you follow but own nothing from', artistGaps, artistState);
        if (artistGaps.length > 0) wireCard(slot, 'bc-diff-artists', artistGaps, artistState, renderArtists);
    };

    // A card for a kind you follow nothing of would claim a finding it doesn't have.
    if (followedLabels.length) renderLabels();
    if (followedArtists.length) renderArtists();
}

export default BandcampDiff;
