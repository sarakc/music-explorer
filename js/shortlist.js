// Discover › Shortlist: releases and tracks you mean to buy. Added from the
// release panel, New Releases rows and the gap rows on artist and label pages;
// cleared by the server as the music arrives (server/lib/shortlist-clear.js)
// or by Remove. Not a Discogs write path.
//
// This module owns the item adapters and the view; ids and ownership matching
// are in shortlist-match.js. Storage is the server's `shortlist` store.

import { makeShortlistId, makeTrackItemId, libraryMatchIndex, releaseProgress, tracklistOf } from './shortlist-match.js';
import { dbGet } from './db-client.js';
import { buildRoute } from './router.js';
import { panelView } from './detail-panel.js';
import { escapeHtml } from './html.js';

// Fired on window when a shortlist add or a dismiss happens outside the list showing it.
export const RELEASES_CHANGED = 'umm:releases-changed';

// Ids and ownership matching live in shortlist-match.js, shared with the server's auto-clear.
export { makeShortlistId, makeTrackItemId, normaliseKey } from './shortlist-match.js';

/** Adapt a Label/Artist-page gap row (shape from web/js/label-gap.js) into a
 *  shortlist item. `sourceTag` is the full provenance string, e.g.
 *  `label-gap:Warp` or `artist-page:Autechre`. */
export function shortlistItemFromGap(row, sourceTag, extras = {}) {
    if (!row) return null;
    const discogsReleaseId = row.id != null ? Number(row.id) : undefined;
    const artist = row.artist || '';
    const title = row.title || '';
    const id = makeShortlistId({ discogsReleaseId, artist, title });
    return {
        id,
        type: 'release',
        artist,
        title,
        year: row.year || undefined,
        catno: row.catno || undefined,
        labelName: extras.labelName || row.label || undefined,
        discogsReleaseId,
        thumb: row.thumb || undefined,
        source: sourceTag,
        addedAt: Date.now(),
    };
}

/** A release row (New Releases, the release panel) as a shortlist item; keeps its tracklist when the source gave one. */
export function shortlistItemFromRelease(release, sourceTag) {
    if (!release?.title) return null;
    const discogsReleaseId = release.discogsReleaseId != null && release.discogsReleaseId !== '' ? Number(release.discogsReleaseId) : undefined;
    const artist = release.artist || '';
    const title = release.title || '';
    const item = {
        id: makeShortlistId({ discogsReleaseId, artist, title }),
        type: 'release', artist, title,
        year: release.year || undefined,
        labelName: release.label || release.labelName || undefined,
        discogsReleaseId,
        thumb: release.cover || release.thumb || undefined,
        source: sourceTag,
        addedAt: Date.now(),
    };
    const url = (release.sources || []).find((s) => s.source !== 'discogs' && s.url)?.url;
    if (url) item.url = url;
    if (Array.isArray(release.tracklist) && release.tracklist.length) item.tracklist = release.tracklist.map(({ position = null, title: t, artist: a }) => ({ position, title: t, ...(a ? { artist: a } : {}) }));
    return item;
}

/** One track from a release's tracklist as a shortlist item. */
export function shortlistItemFromTrack(release, track, sourceTag) {
    if (!track?.title) return null;
    const discogsReleaseId = release?.discogsReleaseId != null && release.discogsReleaseId !== '' ? Number(release.discogsReleaseId) : undefined;
    const artist = track.artist || release?.artist || '';
    const position = track.position || undefined;
    return {
        id: makeTrackItemId({ discogsReleaseId, position, artist, title: track.title }),
        type: 'track', artist, title: track.title, position,
        discogsReleaseId,
        releaseTitle: release?.title || undefined,
        labelName: release?.label || release?.labelName || undefined,
        thumb: release?.cover || release?.thumb || undefined,
        source: sourceTag,
        addedAt: Date.now(),
    };
}

/**
 * Write an item; a release with no tracklist asks the Discogs queue for it at
 * priority 1 (until then it can't clear itself). Returns the stored record.
 */
export async function addShortlistItem(app, item) {
    const db = app?.integrationManager?.database;
    if (!db || !item) throw new Error('Shortlist unavailable');
    const rec = await db.addToShortlist(item);
    if (item.type === 'release' && !item.tracklist && item.discogsReleaseId) app.discogsQueue?.focus?.({ visible: [`release:discogs:${item.discogsReleaseId}`] });
    return rec;
}

// ── Discover › Shortlist ──────────────────────────────────────────────────

/** "3 of 8 owned", "Tracklist not loaded", or "Track" for a track item. */
export function progressText(item, progress) {
    if (item?.type === 'track') return item.position ? `Track ${item.position}` : 'Track';
    if (!progress?.loaded) return 'Tracklist not loaded';
    return `${progress.owned} of ${progress.total} owned`;
}

/** Where Open goes for an item: Discogs, else the page it came from. */
export function itemLink(item) {
    if (item?.discogsReleaseId) return { label: 'Open on Discogs', href: `https://www.discogs.com/release/${Number(item.discogsReleaseId)}` };
    if (item?.url) return { label: /bandcamp\.com/.test(item.url) ? 'Open on Bandcamp' : 'Open', href: item.url };
    return null;
}

/** The release panel payload for a row, or null when it names no release. */
export function panelReleaseFor(item) {
    if (!item) return null;
    if (item.type !== 'track') return item;
    if (!item.discogsReleaseId && !item.releaseTitle) return null;
    return { title: item.releaseTitle || item.title, artist: item.artist, discogsReleaseId: item.discogsReleaseId, labelName: item.labelName, thumb: item.thumb, url: item.url };
}

export function shortlistRowHtml(item, progress) {
    const cover = item.thumb
        ? `<img class="nr-cover" src="${escapeHtml(item.thumb)}" alt="" loading="lazy" decoding="async">`
        : '<span class="nr-cover nr-cover--empty" aria-hidden="true"></span>';
    const meta = [item.artist, item.type === 'track' ? item.releaseTitle : null, item.labelName].filter(Boolean).map(escapeHtml).join(' · ');
    const link = itemLink(item);
    const show = item.discogsReleaseId ? buildRoute({ view: 'discover', focus: `release:discogs:${Number(item.discogsReleaseId)}` }) : null;
    return `<li class="nr-row sl-row" data-sl-id="${escapeHtml(item.id)}" tabindex="0" role="button" aria-label="${escapeHtml(`${item.artist || ''} ${item.title || ''}`.trim())}">
        ${cover}
        <span class="nr-main"><span class="nr-title">${escapeHtml(item.title || 'Untitled')}</span><span class="nr-meta">${meta}</span></span>
        <span class="sl-progress${progress?.loaded && progress.owned ? ' is-partial' : ''}">${escapeHtml(progressText(item, progress))}</span>
        <span class="nr-actions">
            ${link ? `<a class="nr-act" href="${escapeHtml(link.href)}" target="_blank" rel="noopener">${escapeHtml(link.label)}</a>` : ''}
            ${show ? `<a class="nr-act" href="${escapeHtml(show)}">Show in Discover</a>` : ''}
            <button type="button" class="nr-act" data-sl-remove>Remove</button>
        </span>
    </li>`;
}

const RELOAD_MS = 1500;

export default class ShortlistView {
    constructor({ app }) {
        this.app = app;
        this.generation = 0;
        this.unsubscribe = null;
        this.timer = null;
    }

    teardown() {
        this.generation++;
        this.unsubscribe?.();
        this.unsubscribe = null;
        clearTimeout(this.timer);
        this.timer = null;
    }

    async render() {
        this.teardown();
        const generation = this.generation;
        const contentArea = document.getElementById('contentArea');
        if (!contentArea) return;
        const live = () => generation === this.generation && contentArea.isConnected;
        document.getElementById('viewTitle').textContent = 'Discover';
        document.getElementById('viewSubtitle').textContent = '';
        await this._paint(contentArea, live);
        if (!live()) return;
        const repaint = () => {
            if (this.timer || !live()) return;
            this.timer = setTimeout(() => { this.timer = null; if (live()) this._paint(contentArea, live); }, RELOAD_MS);
        };
        const offQueue = this.app.discogsQueue?.onJobDone?.((job) => { if (job?.kind === 'release') repaint(); });
        window.addEventListener(RELEASES_CHANGED, repaint);
        this.unsubscribe = () => { offQueue?.(); window.removeEventListener(RELEASES_CHANGED, repaint); };
    }

    async _paint(contentArea, live) {
        const app = this.app;
        const db = app.integrationManager?.database;
        if (!db) { contentArea.innerHTML = '<div class="empty-state"><p>Database unavailable.</p></div>'; return; }
        const [items, tracks] = await Promise.all([db.listShortlist(), app._allTracks?.() ?? []]);
        if (!live()) return;
        if (!items.length) {
            contentArea.innerHTML = '<div class="nr-view"><p class="nr-empty">Nothing on the shortlist yet.</p></div>';
            return;
        }
        items.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
        const index = libraryMatchIndex(tracks);
        const stored = new Map(await Promise.all(items
            .filter((i) => i.type !== 'track' && !tracklistOf(i.tracklist) && i.discogsReleaseId)
            .map(async (i) => [i.id, await dbGet('release_credits', String(i.discogsReleaseId)).catch(() => null)])));
        if (!live()) return;
        const progress = new Map(items.map((i) => [i.id, i.type === 'track' ? null : releaseProgress(i, index, stored.get(i.id)?.tracklist)]));
        // Releases still without a tracklist ask the queue for one (they can't clear until then).
        const missing = items.filter((i) => i.type !== 'track' && i.discogsReleaseId && !progress.get(i.id)?.loaded);
        if (missing.length) app.discogsQueue?.focus?.({ visible: missing.map((i) => `release:discogs:${Number(i.discogsReleaseId)}`) });
        const scroller = contentArea.closest?.('.main-scroll');
        const top = scroller?.scrollTop || 0;
        contentArea.innerHTML = `<div class="nr-view shortlist-view">
            <div class="sl-head"><span class="nr-status">${items.length} ${items.length === 1 ? 'item' : 'items'}</span><button type="button" class="nr-act" data-sl-export>Export CSV</button></div>
            <ul class="nr-list">${items.map((i) => shortlistRowHtml(i, progress.get(i.id))).join('')}</ul>
        </div>`;
        if (scroller) scroller.scrollTop = top;
        this._wire(contentArea, items, live);
    }

    _wire(root, items, live) {
        const app = this.app;
        const byId = new Map(items.map((i) => [i.id, i]));
        root.querySelector('[data-sl-export]')?.addEventListener('click', () => this._exportCsv(items));
        root.querySelectorAll('.sl-row').forEach((el) => {
            const item = byId.get(el.dataset.slId);
            if (!item) return;
            const openPanel = () => {
                const release = panelReleaseFor(item);
                if (release && panelView('release')) app.panel?.show('release', { release }, { trigger: el });
            };
            el.addEventListener('click', (e) => { if (!e.target.closest('a, button')) openPanel(); });
            el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el) openPanel(); });
            el.querySelector('[data-sl-remove]')?.addEventListener('click', async () => {
                try {
                    await app.integrationManager.database.removeFromShortlist(item.id);
                    if (live()) this._paint(root, live);
                } catch (err) { app.showNotification?.(`Not removed: ${err?.message || err}`, 'error'); }
            });
        });
    }

    _exportCsv(items) {
        const cols = ['type', 'artist', 'title', 'releaseTitle', 'position', 'year', 'catno', 'labelName', 'discogsReleaseId', 'source', 'addedAt'];
        const esc = (v) => {
            if (v == null) return '';
            const s = String(v).replace(/"/g, '""');
            return /[",\n]/.test(s) ? `"${s}"` : s;
        };
        const lines = [cols.join(',')];
        for (const it of items) {
            lines.push(cols.map((c) => (c === 'addedAt' ? esc(new Date(it.addedAt || 0).toISOString()) : esc(it[c]))).join(','));
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `shortlist-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
}
