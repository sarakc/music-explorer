// Tag page: the shared object-page layout (header, charts, Artists · Labels ·
// Albums tiles, the tag's tracks), then co-occurring tags and related genres.
// Tags have no Discogs representation, so there is no gap section.

import { backLabelFor } from './entity-links.js';
import { tagsOf } from './entity-index.js';
import { renderObjectPage } from './object-page.js';
import { escapeHtml } from './html.js';
import { withoutStashed } from './stash.js';

export default class TagPage {
    constructor({ app }) {
        this.app = app;
        this._state = null;
    }

    _backLabel() {
        return backLabelFor(this.app._prevRoute);
    }

    async render(tagName) {
        const app = this.app;
        const contentArea = document.getElementById('contentArea');
        const viewTitle = document.getElementById('viewTitle');
        const viewSubtitle = document.getElementById('viewSubtitle');
        if (!contentArea) return;

        viewTitle.textContent = 'Tag';
        viewSubtitle.textContent = '';
        contentArea.innerHTML = '<div class="loading">Loading tag…</div>';

        const route = app._route;
        const generation = (this._renderGeneration || 0) + 1;
        this._renderGeneration = generation;
        const isStale = () => app._route !== route || this._renderGeneration !== generation;
        const allTracks = withoutStashed(await app._allTracks());
        if (isStale()) return;
        const needle = String(tagName || '').trim().toLowerCase();
        if (!needle) {
            contentArea.innerHTML = `
                <div class="label-page tag-page">
                    <a href="#" class="label-breadcrumb" data-tp-back>&larr; ${escapeHtml(this._backLabel())}</a>
                    <div class="empty-state"><h3>No tag</h3><p>Missing tag name.</p></div>
                </div>`;
            this._wireBack(contentArea);
            return;
        }

        const owned = allTracks.filter((t) => tagsOf(t).some((tg) => tg.toLowerCase() === needle));

        if (owned.length === 0) {
            contentArea.innerHTML = `
                <div class="label-page tag-page">
                    <a href="#" class="label-breadcrumb" data-tp-back>&larr; ${escapeHtml(this._backLabel())}</a>
                    <div class="empty-state">
                        <h3>${escapeHtml(tagName)}</h3>
                        <p>No tracks with this tag in your collection.</p>
                    </div>
                </div>`;
            this._wireBack(contentArea);
            return;
        }

        const state = this._computeState(tagName, owned);
        this._state = state;

        viewTitle.textContent = 'Tag';
        viewSubtitle.textContent = '';

        renderObjectPage(app, contentArea, {
            type: 'tag', name: state.canonicalName, tracks: owned, pageClass: 'tag-page',
            backHtml: `<a href="#" class="label-breadcrumb" data-tp-back>&larr; ${escapeHtml(this._backLabel())}</a>`,
            keptHtml: this._keptHtml(state),
        });
        this._wireBack(contentArea);
        this._wireCoTags(contentArea);
        this._wireGenres(contentArea, state);
    }

    _computeState(seedName, owned) {
        // Canonical casing: prefer the first matching tag as stored on disk so
        // header casing reflects the user's actual tag text (not the lowercased key).
        const needle = seedName.trim().toLowerCase();
        let canonicalName = seedName;
        for (const t of owned) {
            const hit = tagsOf(t).find((tg) => tg.toLowerCase() === needle);
            if (hit) { canonicalName = hit; break; }
        }

        const coTagCounts = new Map();   // lowered → { name, count }
        const genreCounts = new Map();   // primary-genre token → count
        for (const t of owned) {
            // Co-occurring tags on this track.
            for (const tg of tagsOf(t)) {
                const key = tg.toLowerCase();
                if (key === needle) continue;
                const entry = coTagCounts.get(key);
                if (entry) entry.count++;
                else coTagCounts.set(key, { name: tg, count: 1 });
            }

            // Primary genre tokens only (pre-colon side). Matches artist-page
            // extraction so chip text lines up with what the Collection shows.
            const g = (t.genre || '').trim();
            if (g) {
                const pre = g.split(':')[0];
                for (const tok of pre.split(',').map((x) => x.trim()).filter(Boolean)) {
                    genreCounts.set(tok, (genreCounts.get(tok) || 0) + 1);
                }
            }
        }

        const coTags = [...coTagCounts.values()]
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
            .slice(0, 24);

        const genres = [...genreCounts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 10);

        return {
            seedName,
            canonicalName,
            needle,
            ownedCount: owned.length,
            owned,
            coTags,
            genres,
        };
    }

    /** The sections this page keeps below the shared layout: co-tags and related genres. */
    _keptHtml(state) {
        const coTagsHtml = state.coTags.length ? `
            <section class="lp-section tp-cotags-section">
                <div class="lp-section-head">
                    <h2 class="lp-section-title">Often paired with</h2>
                    <span class="lp-section-count">${state.coTags.length}</span>
                </div>
                <div class="tp-cotag-row">
                    ${state.coTags.map((c) => `
                        <button type="button" class="tp-cotag-chip" data-tp-cotag="${escapeHtml(c.name)}" title="${escapeHtml(c.name)} — ${c.count} shared track${c.count === 1 ? '' : 's'}">
                            <span class="tp-cotag-name">${escapeHtml(c.name)}</span>
                            <span class="tp-cotag-count">${c.count}</span>
                        </button>`).join('')}
                </div>
            </section>` : '';

        const genresHtml = state.genres.length ? `
            <section class="lp-section tp-genres-section">
                <div class="lp-section-head">
                    <h2 class="lp-section-title">Related genres</h2>
                    <span class="lp-section-count">${state.genres.length}</span>
                </div>
                <div class="tp-genre-row">
                    ${state.genres.map(([g, c]) => `
                        <button type="button" class="tp-genre-chip" data-tp-genre="${escapeHtml(g)}" title="${escapeHtml(g)} — ${c} track${c === 1 ? '' : 's'}">
                            <span class="tp-genre-name">${escapeHtml(g)}</span>
                            <span class="tp-genre-count">${c}</span>
                        </button>`).join('')}
                </div>
            </section>` : '';

        return `${coTagsHtml}${genresHtml}`;
    }

    _wireBack(contentArea) {
        contentArea.querySelectorAll('[data-tp-back]').forEach((el) => {
            el.addEventListener('click', async (e) => {
                e.preventDefault();
                if (this.app._prevRoute) history.back();
                else this.app.navigate({ view: 'collection' });
            });
        });
    }

    _wireCoTags(contentArea) {
        contentArea.querySelectorAll('[data-tp-cotag]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const name = btn.dataset.tpCotag;
                if (name) this.app.navigate({ view: 'tag', name: name });
            });
        });
    }

    // Genre pages don't exist yet (P-future). Falling back to filtered
    // Collection is the right affordance — it mirrors how "Filter collection →"
    // behaves on the rest of this page.
    _wireGenres(contentArea, state) {
        contentArea.querySelectorAll('[data-tp-genre]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const genre = btn.dataset.tpGenre;
                if (!genre) return;
                this.app.filterEngine.clearAll();
                this.app.filterEngine.setFilter('tags', [state.canonicalName]);
                this.app.filterEngine.setFilter('genres', [genre]);
                this.app.navigate({ view: 'collection', filter: this.app.filterEngine.state });
            });
        });
    }

}

export function renderTagPage(app, tagName) {
    if (!app._tagPage) app._tagPage = new TagPage({ app });
    return app._tagPage.render(tagName);
}
