// Label page: the shared object-page layout (object-page.js), then the Discogs
// "Also on" gap and related labels. Reached from any label link, ⌘K or
// Collection › Labels.

import { backLabelFor, entityLinkHtml, wireEntityLinks } from './entity-links.js';
import { shortlistItemFromGap, makeShortlistId, addShortlistItem } from './shortlist.js';
import { renderObjectPage, openInDiscoverHtml, showInDiscoverHtml } from './object-page.js';
import { entityId } from './credits-graph.js';
import { escapeHtml } from './html.js';
import { VIEWER, visitorHides } from './viewer-profile.js';
import { gapErrorLine } from './discogs-catalogue.js';
import { withoutStashed } from './stash.js';

export default class LabelPage {
    constructor({ app }) {
        this.app = app;
        this._state = null;
    }

    // Label of the breadcrumb link — derived from the top of the app's
    // back-stack so "Back" lands the user where they came from.
    _backLabel() {
        return backLabelFor(this.app._prevRoute);
    }

    // Public entry point — renders the full label page into #contentArea.
    async render(labelName) {
        const app = this.app;
        const contentArea = document.getElementById('contentArea');
        const viewTitle = document.getElementById('viewTitle');
        const viewSubtitle = document.getElementById('viewSubtitle');
        if (!contentArea) return;

        viewTitle.textContent = 'Label';
        viewSubtitle.textContent = '';
        contentArea.innerHTML = '<div class="loading">Loading label…</div>';

        const route = app._route;
        const generation = (this._renderGeneration || 0) + 1;
        this._renderGeneration = generation;
        const isStale = () => app._route !== route || this._renderGeneration !== generation;
        const allTracks = withoutStashed(await app._allTracks());
        if (isStale()) return;
        const owned = allTracks.filter((t) => (t.label || '').trim().toLowerCase() === labelName.toLowerCase());

        if (owned.length === 0) {
            contentArea.innerHTML = `
                <div class="label-page">
                    <a href="#" class="label-breadcrumb" data-back>&larr; ${escapeHtml(this._backLabel())}</a>
                    <div class="empty-state">
                        <h3>${escapeHtml(labelName)}</h3>
                        <p>No tracks from this label in your collection.</p>
                    </div>
                </div>`;
            this._wireBack(contentArea);
            return;
        }

        const state = this._computeState(labelName, owned, allTracks);
        this._state = state;

        viewTitle.textContent = 'Label';
        viewSubtitle.textContent = '';

        renderObjectPage(app, contentArea, {
            type: 'label', name: state.canonicalName, tracks: owned,
            backHtml: `<a href="#" class="label-breadcrumb" data-back>&larr; ${escapeHtml(this._backLabel())}</a>`,
            keptHtml: this._keptHtml(state),
        });
        this._wireBack(contentArea);
        this._wireRelatedLabels(contentArea);
        this._wireGapSection(contentArea, state);

        this._loadGap(state);
    }

    _computeState(labelName, owned, allTracks) {
        const canonicalName = owned.find((t) => t.label)?.label || labelName;

        const ownedArtistKeys = new Set(owned.map((t) => (t.artist || '').trim().toLowerCase()).filter(Boolean));
        const relatedCounts = new Map();
        for (const t of allTracks) {
            const otherLabel = (t.label || '').trim();
            if (!otherLabel) continue;
            if (otherLabel.toLowerCase() === labelName.toLowerCase()) continue;
            const a = (t.artist || '').toLowerCase();
            if (!a || !ownedArtistKeys.has(a)) continue;
            let entry = relatedCounts.get(otherLabel.toLowerCase());
            if (!entry) {
                entry = { label: otherLabel, shared: new Set(), count: 0 };
                relatedCounts.set(otherLabel.toLowerCase(), entry);
            }
            entry.shared.add(a);
            entry.count++;
        }
        const related = [...relatedCounts.values()]
            .map((r) => ({ label: r.label, sharedArtists: r.shared.size, count: r.count }))
            .sort((a, b) => b.sharedArtists - a.sharedArtists || b.count - a.count)
            .slice(0, 8);

        const ownedNormalised = new Set();
        const ownedTitles = new Set();
        for (const t of owned) {
            if (t.album) ownedTitles.add(t.album);
            const norm = this._normaliseTitle(t.album || t.title);
            if (norm) ownedNormalised.add(norm);
        }

        return {
            labelName,
            canonicalName,
            owned,
            related,
            gapOwned: { ownedCount: owned.length, ownedTitles, ownedNormalised },
            gap: null,
            gapStatus: 'idle',
            gapError: null,
            selectedMissingIds: new Set(),
        };
    }

    _normaliseTitle(s) {
        if (!s) return '';
        const FORMAT_SUFFIX = /\s*\b(ep|lp|mlp|12"?|10"?|7"?|single|album|remixes?|rmx|vinyl|cd|digital)\b\s*$/i;
        const REMIX_MARKER = /\b(?:remix|edit|mix|rework|bootleg|vip|dub|version)\b/i;
        let out = String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        out = out.replace(/\s*[\(\[]([^)\]]*)[\)\]]/g, (match, inner) => (
            REMIX_MARKER.test(inner) ? match : ' '
        ));
        for (let i = 0; i < 2; i++) out = out.replace(FORMAT_SUFFIX, '');
        out = out.replace(/^the\s+/, '');
        out = out.replace(/[^a-z0-9]+/g, ' ').trim();
        return out;
    }

    /** The sections this page keeps below the shared layout: the Discogs gap and related labels. */
    _keptHtml(state) {
        const relatedHtml = state.related.length ? `
            <section class="lp-section lp-related-section">
                <div class="lp-section-head">
                    <h2 class="lp-section-title">Related labels</h2>
                    <span class="lp-section-count">${state.related.length}</span>
                </div>
                <p class="lp-section-hint">Shared artists with ${escapeHtml(state.canonicalName)}.</p>
                <div class="lp-related-grid" role="list">
                    ${state.related.map((r) => `
                        <button type="button" role="listitem" class="lp-related-row" data-label="${escapeHtml(r.label)}" title="${escapeHtml(r.label)}">
                            <span class="lp-related-name">${escapeHtml(r.label)}</span>
                            <span class="lp-related-meta"><span class="lp-related-shared">${r.sharedArtists}</span><span class="lp-related-sep">/</span><span class="lp-related-count">${r.count}</span></span>
                        </button>`).join('')}
                </div>
            </section>` : '';

        if (visitorHides('gaps')) return relatedHtml;
        return `
                <section class="lp-section lp-gap" id="lpGapSection">
                    <div class="lp-section-head">
                        <h2 class="lp-section-title">Also on ${escapeHtml(state.canonicalName)}</h2>
                        ${openInDiscoverHtml(entityId('label', state.canonicalName))}
                    </div>
                    <p class="lp-section-hint" id="lpGapHint">Diffing against the full Discogs catalogue…</p>
                    <div class="lp-gap-body" id="lpGapBody"></div>
                </section>

                ${relatedHtml}`;
    }

    _wireRelatedLabels(contentArea) {
        contentArea.querySelectorAll('.lp-related-row').forEach((row) => {
            row.addEventListener('click', (e) => {
                e.preventDefault();
                const label = row.dataset.label;
                if (label) this.app.navigate({ view: 'label', name: label });
            });
        });
    }

    _wireBack(contentArea) {
        contentArea.querySelectorAll('[data-back]').forEach((a) => {
            a.addEventListener('click', async (e) => {
                e.preventDefault();
                // Browser history restores the previous place and its filters.
                if (this.app._prevRoute) history.back();
                else this.app.navigate({ view: 'collection' });
            });
        });
    }

    async _loadGap(state) {
        const section = document.getElementById('lpGapSection');
        if (!section) return;
        state.gapStatus = 'loading';
        this._paintGap(state);
        try {
            const cached = this.app.labelGap._catalogueCache.get(state.labelName);
            const gap = cached || await this.app.labelGap.getGap(state.labelName, state.gapOwned);
            state.gap = gap;
            state.gapStatus = 'ready';
            state.shortlistIds = VIEWER ? new Set() : await this._loadShortlistIds(gap?.missing || []);
        } catch (err) {
            state.gapStatus = 'error';
            ({ text: state.gapError, retry: state.gapRetry } = gapErrorLine(err, 'label'));
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
        const hint = document.getElementById('lpGapHint');
        const body = document.getElementById('lpGapBody');
        if (!hint || !body) return;

        if (state.gapStatus === 'loading') {
            hint.textContent = 'Diffing against the full Discogs catalogue…';
            body.innerHTML = '';
            return;
        }
        if (state.gapStatus === 'error') {
            hint.innerHTML = `<span class="lp-gap-error">${escapeHtml(state.gapError)}</span>${state.gapRetry ? ' · <a href="#" data-lp-gap-retry>Retry</a>' : ''}`;
            body.innerHTML = '';
            hint.querySelector('[data-lp-gap-retry]')?.addEventListener('click', (e) => {
                e.preventDefault();
                this._loadGap(state);
            });
            return;
        }

        const gap = state.gap;
        if (!gap) { hint.textContent = ''; body.innerHTML = ''; return; }

        const missing = gap.missing || [];
        const total = gap.totalCatalog ?? 0;
        hint.innerHTML = `${gap.ownedCount} of ${total} in catalogue owned · <strong>${missing.length}</strong> missing.${VIEWER ? '' : ' <a href="#" data-lp-gap-refresh>Refresh from Discogs</a>'}`;

        if (!missing.length) {
            body.innerHTML = '<p class="muted">You have the full catalogue.</p>';
            hint.querySelector('[data-lp-gap-refresh]')?.addEventListener('click', (e) => {
                e.preventDefault();
                this.app.labelGap.clearCacheFor(state.labelName);
                this._loadGap(state);
            });
            return;
        }

        const shortlistIds = state.shortlistIds || new Set();
        const rows = missing.map((r) => {
            const id = String(r.id);
            const checked = state.selectedMissingIds.has(id) ? ' checked' : '';
            const thumb = r.thumb
                ? `<img src="${escapeHtml(r.thumb)}" alt="" loading="lazy">`
                : '<span class="lp-thumb-ph"></span>';
            const slId = makeShortlistId({ discogsReleaseId: r.id, artist: r.artist, title: r.title });
            const onList = shortlistIds.has(slId);
            const slBtn = VIEWER ? '' : onList
                ? `<button type="button" class="link-chip chip-sm is-on-shortlist" disabled>On Shortlist</button>`
                : `<button type="button" class="link-chip chip-sm" data-lp-shortlist="${escapeHtml(id)}">Shortlist</button>`;
            return `
                <tr data-gap-id="${escapeHtml(id)}">
                    ${VIEWER ? '' : `<td class="lp-gap-select"><input type="checkbox" data-lp-gap-select="${escapeHtml(id)}"${checked}></td>`}
                    <td class="lp-gap-thumb">${thumb}</td>
                    <td class="lp-gap-year">${r.year || ''}</td>
                    <td class="lp-gap-artist">${entityLinkHtml({ type: 'artist', name: r.artist })}</td>
                    <td class="lp-gap-title">${escapeHtml(r.title || '')}</td>
                    <td class="lp-gap-link"><a href="${r.url}" target="_blank" rel="noopener">Discogs</a></td>
                    <td class="lp-gap-shortlist">${slBtn} ${showInDiscoverHtml(r.id)}</td>
                </tr>`;
        }).join('');

        const selectedCount = state.selectedMissingIds.size;
        body.innerHTML = `
            ${VIEWER ? '' : `<div class="lp-gap-actions">
                <label class="lp-gap-selectall"><input type="checkbox" data-lp-gap-all> Select all</label>
                <button type="button" class="btn btn-sm" data-lp-gap-bulk${selectedCount ? '' : ' disabled'}>Selected: ${selectedCount}</button>
                <span class="muted lp-gap-bulk-hint">Bulk Discogs add lands in P2.4.</span>
            </div>`}
            <table class="lp-gap-table">
                <thead><tr><th></th><th></th><th>Year</th><th>Artist</th><th>Title</th><th></th><th></th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;

        hint.querySelector('[data-lp-gap-refresh]')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.app.labelGap.clearCacheFor(state.labelName);
            state.selectedMissingIds.clear();
            this._loadGap(state);
        });

        body.querySelectorAll('[data-lp-gap-select]').forEach((cb) => {
            cb.addEventListener('change', () => {
                const id = cb.dataset.lpGapSelect;
                if (cb.checked) state.selectedMissingIds.add(id);
                else state.selectedMissingIds.delete(id);
                this._paintGap(state);
            });
        });

        const all = body.querySelector('[data-lp-gap-all]');
        if (all) {
            const allChecked = missing.length > 0 && missing.every((r) => state.selectedMissingIds.has(String(r.id)));
            all.checked = allChecked;
            all.addEventListener('change', () => {
                if (all.checked) {
                    for (const r of missing) state.selectedMissingIds.add(String(r.id));
                } else {
                    state.selectedMissingIds.clear();
                }
                this._paintGap(state);
            });
        }

        body.querySelectorAll('[data-lp-shortlist]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.lpShortlist;
                const row = missing.find((r) => String(r.id) === id);
                if (!row) return;
                const item = shortlistItemFromGap(
                    row,
                    `label-gap:${state.canonicalName}`,
                    { labelName: state.canonicalName },
                );
                if (!item) return;
                const db = this.app?.integrationManager?.database;
                if (!db) return;
                try {
                    await addShortlistItem(this.app, item);
                    state.shortlistIds = state.shortlistIds || new Set();
                    state.shortlistIds.add(item.id);
                    btn.outerHTML = `<button type="button" class="link-chip chip-sm is-on-shortlist" disabled>On Shortlist</button>`;
                    if (typeof this.app.showNotification === 'function') {
                        this.app.showNotification('Added to Shortlist', 'success');
                    }
                } catch (err) {
                    console.warn('Shortlist add failed:', err);
                    if (typeof this.app.showNotification === 'function') {
                        this.app.showNotification('Shortlist add failed', 'error');
                    }
                }
            });
        });
    }

    _wireGapSection(contentArea) {
        // Initial paint handled by _loadGap; the gap body element is stable
        // across repaints, so one delegated entity-link handler covers them.
        wireEntityLinks(contentArea.querySelector('#lpGapBody'), this.app);
    }
}

export function renderLabelPage(app, labelName) {
    if (!app._labelPage) app._labelPage = new LabelPage({ app });
    return app._labelPage.render(labelName);
}
