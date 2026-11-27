// Artist page: the shared object-page layout (object-page.js), then the
// Discogs "Also by" gap. Reached from any artist link, ⌘K or Collection › Artists.

import { backLabelFor, entityLinkHtml, wireEntityLinks } from './entity-links.js';
import { shortlistItemFromGap, makeShortlistId, addShortlistItem } from './shortlist.js';
import ArtistGap from './artist-gap.js';
import { renderObjectPage, openInDiscoverHtml, showInDiscoverHtml, gapReleaseId } from './object-page.js';
import { entityId } from './credits-graph.js';
import { escapeHtml } from './html.js';
import { VIEWER, visitorHides } from './viewer-profile.js';
import { gapErrorLine } from './discogs-catalogue.js';
import { withoutStashed } from './stash.js';

export default class ArtistPage {
    constructor({ app }) {
        this.app = app;
        this._state = null;
        // Own the ArtistGap instance so caches stick across navigations within
        // a session; mirrors app.labelGap for the label side.
        if (!app.artistGap) {
            app.artistGap = new ArtistGap({ database: app.integrationManager?.database, queue: app.discogsQueue });
        }
        this.artistGap = app.artistGap;
    }

    _backLabel() {
        return backLabelFor(this.app._prevRoute);
    }

    async render(artistName) {
        const app = this.app;
        const contentArea = document.getElementById('contentArea');
        const viewTitle = document.getElementById('viewTitle');
        const viewSubtitle = document.getElementById('viewSubtitle');
        if (!contentArea) return;

        viewTitle.textContent = 'Artist';
        viewSubtitle.textContent = '';
        contentArea.innerHTML = '<div class="loading">Loading artist…</div>';

        const route = app._route;
        const generation = (this._renderGeneration || 0) + 1;
        this._renderGeneration = generation;
        const isStale = () => app._route !== route || this._renderGeneration !== generation;
        const allTracks = withoutStashed(await app._allTracks());
        if (isStale()) return;
        const needle = artistName.trim().toLowerCase();
        const owned = allTracks.filter((t) => (t.artist || '').trim().toLowerCase() === needle);

        if (owned.length === 0) {
            contentArea.innerHTML = `
                <div class="label-page">
                    <a href="#" class="label-breadcrumb" data-ap-back>&larr; ${escapeHtml(this._backLabel())}</a>
                    <div class="empty-state">
                        <h3>${escapeHtml(artistName)}</h3>
                        <p>No tracks by this artist in your collection.</p>
                    </div>
                </div>`;
            this._wireBack(contentArea);
            return;
        }

        const state = this._computeState(artistName, owned);
        this._state = state;

        viewTitle.textContent = 'Artist';
        viewSubtitle.textContent = '';

        renderObjectPage(app, contentArea, {
            type: 'artist', name: state.canonicalName, tracks: owned, pageClass: 'artist-page',
            backHtml: `<a href="#" class="label-breadcrumb" data-ap-back>&larr; ${escapeHtml(this._backLabel())}</a>`,
            keptHtml: this._keptHtml(state),
        });
        this._wireBack(contentArea);
        wireEntityLinks(contentArea.querySelector('#apGapBody'), app);

        // Kick off the Discogs diff asynchronously — the section renders its
        // own loading hint and repaints when data arrives.
        this._loadGap(state);
    }

    /** The section this page keeps below the shared layout: the Discogs gap. */
    _keptHtml(state) {
        if (visitorHides('gaps')) return '';
        return `
                <section class="lp-section lp-gap" id="apGapSection">
                    <div class="lp-section-head">
                        <h2 class="lp-section-title">Also by ${escapeHtml(state.canonicalName)}</h2>
                        ${openInDiscoverHtml(entityId('artist', state.canonicalName))}
                    </div>
                    <p class="lp-section-hint" id="apGapHint">Diffing against the full Discogs catalogue…</p>
                    <div class="lp-gap-body" id="apGapBody"></div>
                </section>`;
    }

    _computeState(seedName, owned) {
        const canonicalName = owned.find((t) => t.artist)?.artist || seedName;
        const labels = new Set(owned.map((t) => (t.label || '').trim().toLowerCase()).filter(Boolean));
        return {
            artistName: seedName,
            canonicalName,
            owned,
            ownedLabelKeys: labels,
            // Gap state — populated asynchronously by _loadGap.
            gap: null,
            gapOwned: null,
            gapStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
            gapError: '',
            shortlistIds: new Set(),
        };
    }

    _wireBack(contentArea) {
        contentArea.querySelectorAll('[data-ap-back]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.app._prevRoute) history.back(); else this.app.navigate({ view: 'collection' });
            });
        });
    }

    // ── "Also by" gap section ──

    async _loadGap(state) {
        const section = document.getElementById('apGapSection');
        if (!section) return;
        state.gapOwned = this.artistGap.ownedForArtist(state.owned, state.canonicalName);
        state.gapStatus = 'loading';
        this._paintGap(state);
        try {
            const cached = this.artistGap._catalogueCache.get(state.canonicalName);
            const gap = cached || await this.artistGap.getGap(state.canonicalName, state.gapOwned);
            state.gap = gap;
            state.gapStatus = 'ready';
            state.shortlistIds = VIEWER ? new Set() : await this._loadShortlistIds(gap?.missing || []);
        } catch (err) {
            state.gapStatus = 'error';
            ({ text: state.gapError, retry: state.gapRetry } = gapErrorLine(err, 'artist'));
        }
        if (this._state === state) this._paintGap(state);
    }

    async _loadShortlistIds(missing) {
        const db = this.app?.integrationManager?.database;
        if (!db) return new Set();
        try {
            const all = await db.listShortlist();
            return new Set(all.map((i) => i.id));
        } catch (_) {
            return new Set();
        }
    }

    _paintGap(state) {
        const hint = document.getElementById('apGapHint');
        const body = document.getElementById('apGapBody');
        if (!hint || !body) return;

        if (state.gapStatus === 'loading') {
            hint.textContent = 'Diffing against the full Discogs catalogue…';
            body.innerHTML = '';
            return;
        }
        if (state.gapStatus === 'error') {
            hint.innerHTML = `<span class="lp-gap-error">${escapeHtml(state.gapError)}</span>${state.gapRetry ? ' · <a href="#" data-ap-gap-retry>Retry</a>' : ''}`;
            body.innerHTML = '';
            hint.querySelector('[data-ap-gap-retry]')?.addEventListener('click', (e) => {
                e.preventDefault();
                this._loadGap(state);
            });
            return;
        }

        const gap = state.gap;
        if (!gap) { hint.textContent = ''; body.innerHTML = ''; return; }

        const missing = gap.missing || [];
        const total = gap.totalCatalog ?? 0;
        hint.innerHTML = `${gap.ownedCount} of ${total} in Discogs catalogue owned · <strong>${missing.length}</strong> not yet in your library.${VIEWER ? '' : ' <a href="#" data-ap-gap-refresh>Refresh from Discogs</a>'}`;

        if (!missing.length) {
            body.innerHTML = '<p class="muted">Full catalogue — nothing new on Discogs.</p>';
            hint.querySelector('[data-ap-gap-refresh]')?.addEventListener('click', (e) => {
                e.preventDefault();
                this.artistGap.clearCacheFor(state.canonicalName);
                this._loadGap(state);
            });
            return;
        }

        const shortlistIds = state.shortlistIds || new Set();
        const rows = missing.map((r) => {
            const id = String(r.id);
            const thumb = r.thumb
                ? `<img src="${escapeHtml(r.thumb)}" alt="" loading="lazy">`
                : '<span class="lp-thumb-ph"></span>';
            const releaseId = gapReleaseId(r);
            const slId = makeShortlistId({ discogsReleaseId: releaseId, artist: state.canonicalName, title: r.title });
            const onList = shortlistIds.has(slId);
            const slBtn = VIEWER ? '' : onList
                ? `<button type="button" class="link-chip chip-sm is-on-shortlist" disabled>On Shortlist</button>`
                : `<button type="button" class="link-chip chip-sm" data-ap-shortlist="${escapeHtml(id)}">Shortlist</button>`;
            const labelCell = entityLinkHtml({ type: 'label', name: r.label });
            // Reuse the Collection table's Listen icons (YT/BC/DC) by passing
            // a pseudo-track record. Discogs gets a direct link since we have
            // the release URL; YT + BC fall back to artist search — the same
            // behaviour the Listen column has elsewhere.
            const listenCell = this.app._digLinks({
                artist: state.canonicalName,
                title: r.title || '',
                album: r.title || '',
                discogs_url: r.url,
                discogs_id: r.id,
            });
            return `
                <tr data-gap-id="${escapeHtml(id)}">
                    <td class="lp-gap-thumb">${thumb}</td>
                    <td class="lp-gap-year">${r.year || ''}</td>
                    <td class="lp-gap-title">${escapeHtml(r.title || '')}</td>
                    <td class="lp-gap-artist">${labelCell}</td>
                    <td class="lp-gap-listen track-links">${listenCell}</td>
                    <td class="lp-gap-shortlist">${slBtn} ${showInDiscoverHtml(releaseId)}</td>
                </tr>`;
        }).join('');

        // "Other labels" — labels from the Discogs catalogue the artist has
        // released on that aren't already in your collection. Clickable chips
        // that open the Label page (existing or not yet resolved).
        const ownedLabelNames = state.ownedLabelKeys;
        const newLabels = new Map(); // lowercased → display
        for (const r of missing) {
            if (!r.label) continue;
            const parts = String(r.label).split(',').map((s) => s.trim()).filter(Boolean);
            for (const p of parts) {
                if (!ownedLabelNames.has(p.toLowerCase())) {
                    newLabels.set(p.toLowerCase(), p);
                }
            }
        }
        const newLabelList = [...newLabels.values()].sort((a, b) => a.localeCompare(b));
        const otherLabelsHtml = newLabelList.length ? `
            <div class="ap-other-labels">
                <span class="ap-other-labels-kicker">Other labels</span>
                <div class="ap-other-labels-row">
                    ${newLabelList.map((name) => `
                        <a href="#" class="ap-other-label-chip" data-ap-other-label="${escapeHtml(name)}" title="${escapeHtml(name)}">${escapeHtml(name)}</a>
                    `).join('')}
                </div>
            </div>` : '';

        body.innerHTML = `
            ${otherLabelsHtml}
            <table class="lp-gap-table">
                <thead><tr><th></th><th>Year</th><th>Title</th><th>Label</th><th>Listen</th><th></th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;

        body.querySelectorAll('[data-ap-other-label]').forEach((a) => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                this.app.navigate({ view: 'label', name: a.dataset.apOtherLabel });
            });
        });

        hint.querySelector('[data-ap-gap-refresh]')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.artistGap.clearCacheFor(state.canonicalName);
            this._loadGap(state);
        });

        body.querySelectorAll('[data-ap-shortlist]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.apShortlist;
                const release = missing.find((m) => String(m.id) === id);
                if (!release) return;
                // Adapter expects the gap-row shape (`id` = Discogs release id)
                // plus a provenance tag; passing `discogsReleaseId` produced a
                // synthetic id that never matched the page's "On Shortlist" check.
                const item = shortlistItemFromGap({
                    id: gapReleaseId(release),
                    artist: state.canonicalName,
                    title: release.title,
                    year: release.year,
                    label: release.label,
                    thumb: release.thumb,
                }, `artist-page:${state.canonicalName}`);
                try {
                    await addShortlistItem(this.app, item);
                    state.shortlistIds.add(item.id);
                    btn.outerHTML = `<button type="button" class="link-chip chip-sm is-on-shortlist" disabled>On Shortlist</button>`;
                } catch (err) {
                    console.error('shortlist add failed', err);
                }
            });
        });
    }
}
