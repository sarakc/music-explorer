// Album page: the shared object-page layout (object-page.js) with the album
// cover, then the Discogs tracklist diff and more albums by the same artist.
//
// An album is identified by (albumName, artistName): two artists can release
// albums with the same title. Favorites use the `${artist}::${album}` name.

import { backLabelFor } from './entity-links.js';
import { renderObjectPage } from './object-page.js';
import AlbumGap from './album-gap.js';
import { gapErrorLine } from './discogs-catalogue.js';
import { escapeHtml } from './html.js';
import { withoutStashed } from './stash.js';
import { visitorHides } from './viewer-profile.js';

export default class AlbumPage {
    constructor({ app }) {
        this.app = app;
        this._state = null;
        if (!app.albumGap) {
            app.albumGap = new AlbumGap({ database: app.integrationManager?.database });
        }
        this.albumGap = app.albumGap;
    }

    _backLabel() {
        return backLabelFor(this.app._prevRoute);
    }

    // Favorite name stored on the record is the display album name (so the
    // crates sidebar can render it readably), but the favoriteId it hashes to
    // uses (artist::album) lower-cased — encoded in the display name we pass
    // so two same-titled albums by different artists don't collide.
    _favName(state) {
        return `${state.artistName}::${state.albumName}`;
    }

    async render(albumName, artistName) {
        const app = this.app;
        const contentArea = document.getElementById('contentArea');
        const viewTitle = document.getElementById('viewTitle');
        const viewSubtitle = document.getElementById('viewSubtitle');
        if (!contentArea) return;

        viewTitle.textContent = 'Album';
        viewSubtitle.textContent = '';
        contentArea.innerHTML = '<div class="loading">Loading album…</div>';

        const route = app._route;
        const generation = (this._renderGeneration || 0) + 1;
        this._renderGeneration = generation;
        const isStale = () => app._route !== route || this._renderGeneration !== generation;
        const allTracks = withoutStashed(await app._allTracks());
        if (isStale()) return;
        const aNeedle = (albumName || '').trim().toLowerCase();
        const arNeedle = (artistName || '').trim().toLowerCase();
        const owned = allTracks.filter((t) =>
            (t.album || '').trim().toLowerCase() === aNeedle
            && (t.artist || '').trim().toLowerCase() === arNeedle,
        );

        if (owned.length === 0) {
            contentArea.innerHTML = `
                <div class="label-page album-page">
                    <a href="#" class="label-breadcrumb" data-apg-back>&larr; ${escapeHtml(this._backLabel())}</a>
                    <div class="empty-state">
                        <h3>${escapeHtml(albumName)}</h3>
                        <p>No tracks from this album in your collection.</p>
                    </div>
                </div>`;
            this._wireBack(contentArea);
            return;
        }

        const state = this._computeState(albumName, artistName, owned, allTracks);
        this._state = state;

        viewTitle.textContent = 'Album';
        viewSubtitle.textContent = '';

        const by = [
            state.canonicalArtist ? `<a href="#" class="apg-header-artist-link" data-apg-artist-link>${escapeHtml(state.canonicalArtist)}</a>` : '',
            state.label ? `<a href="#" class="apg-header-label-link" data-apg-label-link>${escapeHtml(state.label)}</a>` : '',
        ].filter(Boolean).join('<span class="lp-sep">·</span>');
        renderObjectPage(app, contentArea, {
            type: 'album', name: state.canonicalAlbum, artist: state.canonicalArtist, tracks: owned, pageClass: 'album-page',
            favName: this._favName(state),
            subHtml: by ? `<div class="op-sub">${by}</div>` : '',
            backHtml: `<a href="#" class="label-breadcrumb" data-apg-back>&larr; ${escapeHtml(this._backLabel())}</a>`,
            keptHtml: this._keptHtml(state),
        });
        this._wireBack(contentArea);
        this._wireArtistLink(contentArea, state);
        this._wireLabelLink(contentArea, state);
        this._wireRelatedAlbums(contentArea);

        // Kick off the Discogs tracklist diff asynchronously.
        this._loadGap(state);
    }

    _computeState(albumName, artistName, owned, allTracks) {
        const canonicalAlbum = owned.find((t) => t.album)?.album || albumName;
        const canonicalArtist = owned.find((t) => t.artist)?.artist || artistName;

        // Most-common label + year across owned tracks. "Most common" matters
        // in the corner case where a compilation pressing has differently
        // tagged copies.
        const labelCounts = new Map();
        const yearCounts = new Map();
        for (const t of owned) {
            const lb = (t.label || '').trim();
            if (lb) labelCounts.set(lb, (labelCounts.get(lb) || 0) + 1);
            const y = t.year && Number(t.year);
            if (y && y > 1900) yearCounts.set(y, (yearCounts.get(y) || 0) + 1);
        }
        const topLabel = [...labelCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        const topYear = [...yearCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

        // Related albums: other albums by the same artist, ranked by
        // year-proximity to this album's year. Small chip-row only.
        const arNeedle = canonicalArtist.trim().toLowerCase();
        const albumAgg = new Map(); // album -> { name, trackCount, year }
        for (const t of allTracks) {
            if ((t.artist || '').trim().toLowerCase() !== arNeedle) continue;
            const a = (t.album || '').trim();
            if (!a) continue;
            if (a.toLowerCase() === canonicalAlbum.toLowerCase()) continue;
            let entry = albumAgg.get(a.toLowerCase());
            if (!entry) {
                entry = { name: a, trackCount: 0, year: null };
                albumAgg.set(a.toLowerCase(), entry);
            }
            entry.trackCount++;
            const y = t.year && Number(t.year);
            if (y && (!entry.year || y < entry.year)) entry.year = y;
        }
        const related = [...albumAgg.values()]
            .sort((a, b) => {
                if (topYear && a.year && b.year) {
                    return Math.abs(a.year - topYear) - Math.abs(b.year - topYear);
                }
                if (a.year && !b.year) return -1;
                if (!a.year && b.year) return 1;
                return b.trackCount - a.trackCount;
            })
            .slice(0, 12);

        return {
            albumName,
            artistName,
            canonicalAlbum,
            canonicalArtist,
            label: topLabel,
            year: topYear,
            ownedCount: owned.length,
            owned,
            related,
            gap: null,
            gapStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
            gapError: '',
        };
    }

    /** The sections this page keeps below the shared layout: the Discogs tracklist and more from the artist. */
    _keptHtml(state) {
        const relatedHtml = state.related.length ? `
            <section class="lp-section apg-related-section">
                <div class="lp-section-head">
                    <h2 class="lp-section-title">More from ${escapeHtml(state.canonicalArtist)}</h2>
                    <span class="lp-section-count">${state.related.length}</span>
                </div>
                <div class="apg-related-row" role="list">
                    ${state.related.map((r) => `
                        <button type="button" role="listitem" class="apg-related-chip" data-apg-related-album="${escapeHtml(r.name)}" title="${escapeHtml(r.name)}${r.year ? ` (${r.year})` : ''}">
                            <span class="apg-related-name">${escapeHtml(r.name)}</span>
                            ${r.year ? `<span class="apg-related-year">${r.year}</span>` : ''}
                        </button>
                    `).join('')}
                </div>
            </section>` : '';

        if (visitorHides('gaps')) return relatedHtml;
        return `
                <section class="lp-section apg-gap" id="apgGapSection">
                    <div class="lp-section-head">
                        <h2 class="lp-section-title">Tracklist</h2>
                    </div>
                    <p class="lp-section-hint" id="apgGapHint">Looking up the Discogs tracklist…</p>
                    <div class="apg-gap-body" id="apgGapBody"></div>
                </section>

                ${relatedHtml}`;
    }

    _wireBack(contentArea) {
        contentArea.querySelectorAll('[data-apg-back]').forEach((el) => {
            el.addEventListener('click', async (e) => {
                e.preventDefault();
                if (this.app._prevRoute) history.back();
                else this.app.navigate({ view: 'collection' });
            });
        });
    }

    _wireArtistLink(contentArea, state) {
        const link = contentArea.querySelector('[data-apg-artist-link]');
        if (!link) return;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            this.app.navigate({ view: 'artist', name: state.canonicalArtist });
        });
    }

    _wireLabelLink(contentArea, state) {
        const link = contentArea.querySelector('[data-apg-label-link]');
        if (!link || !state.label) return;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            this.app.navigate({ view: 'label', name: state.label });
        });
    }

    _wireRelatedAlbums(contentArea) {
        contentArea.querySelectorAll('[data-apg-related-album]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const album = btn.dataset.apgRelatedAlbum;
                if (album) this.app.navigate({ view: 'album', name: album, artist: this._state.canonicalArtist });
            });
        });
    }

    // ── Discogs tracklist diff ──

    async _loadGap(state) {
        const section = document.getElementById('apgGapSection');
        if (!section) return;
        state.gapStatus = 'loading';
        this._paintGap(state);
        try {
            const gap = await this.albumGap.getGap(state.canonicalArtist, state.canonicalAlbum, state.owned);
            state.gap = gap;
            state.gapStatus = 'ready';
        } catch (err) {
            state.gapStatus = 'error';
            ({ text: state.gapError, retry: state.gapRetry } = gapErrorLine(err, 'album'));
        }
        if (this._state === state) this._paintGap(state);
    }

    _paintGap(state) {
        const hint = document.getElementById('apgGapHint');
        const body = document.getElementById('apgGapBody');
        if (!hint || !body) return;

        if (state.gapStatus === 'loading') {
            hint.textContent = 'Looking up the Discogs tracklist…';
            body.innerHTML = '';
            return;
        }
        if (state.gapStatus === 'error') {
            hint.innerHTML = `<span class="lp-gap-error">${escapeHtml(state.gapError)}</span>${state.gapRetry === false ? '' : ' · <a href="#" data-apg-gap-retry>Retry</a>'}`;
            body.innerHTML = '';
            hint.querySelector('[data-apg-gap-retry]')?.addEventListener('click', (e) => {
                e.preventDefault();
                this._loadGap(state);
            });
            return;
        }

        const gap = state.gap;
        if (!gap || !gap.tracklist?.length) {
            hint.textContent = 'Discogs has no tracklist for this release.';
            body.innerHTML = '';
            return;
        }

        const releaseUrl = gap.release?.uri || (gap.release?.id ? `https://www.discogs.com/release/${gap.release.id}` : '');
        const missingCount = gap.totalCount - gap.ownedCount;
        const hintBits = [
            `${gap.ownedCount} of ${gap.totalCount} owned`,
            missingCount > 0 ? `<strong>${missingCount}</strong> missing` : null,
            releaseUrl ? `<a href="${escapeHtml(releaseUrl)}" target="_blank" rel="noopener">View on Discogs</a>` : null,
            `<a href="#" data-apg-gap-refresh>Refresh</a>`,
        ].filter(Boolean);
        hint.innerHTML = hintBits.join(' · ');

        const rows = gap.tracklist.map((t) => {
            const isHeading = t.type && t.type !== 'track';
            if (isHeading) {
                return `
                    <tr class="apg-track-row apg-track-heading">
                        <td class="apg-track-pos"></td>
                        <td class="apg-track-status"></td>
                        <td class="apg-track-title" colspan="3">${escapeHtml(t.title || '')}</td>
                    </tr>`;
            }
            const statusBadge = t.owned
                ? '<span class="apg-badge apg-badge--owned" title="Owned">Owned</span>'
                : '<span class="apg-badge apg-badge--missing" title="Not in your collection">Missing</span>';
            const listenCell = this.app._digLinks({
                artist: t.artists || state.canonicalArtist,
                title: t.title || '',
                album: state.canonicalAlbum,
                discogs_id: gap.release?.id,
                discogs_url: releaseUrl,
            });
            return `
                <tr class="apg-track-row ${t.owned ? 'is-owned' : 'is-missing'}">
                    <td class="apg-track-pos">${escapeHtml(t.position || '')}</td>
                    <td class="apg-track-status">${statusBadge}</td>
                    <td class="apg-track-title">
                        <div class="apg-track-title-text">${escapeHtml(t.title || '')}</div>
                        ${t.artists ? `<div class="apg-track-artists">${escapeHtml(t.artists)}</div>` : ''}
                    </td>
                    <td class="apg-track-duration">${escapeHtml(t.duration || '')}</td>
                    <td class="apg-track-listen track-links">${listenCell}</td>
                </tr>`;
        }).join('');

        body.innerHTML = `
            <table class="apg-track-table">
                <thead>
                    <tr>
                        <th class="apg-track-pos">Pos</th>
                        <th class="apg-track-status"></th>
                        <th class="apg-track-title">Title</th>
                        <th class="apg-track-duration">Time</th>
                        <th class="apg-track-listen">Listen</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;

        hint.querySelector('[data-apg-gap-refresh]')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.albumGap.clearCacheFor(state.canonicalArtist, state.canonicalAlbum);
            this._loadGap(state);
        });
    }
}
