// Track page — one local track in the context of the collection.
//
// Header: the track's facts, every one a live entity link. Related: songs by the same artist, on the same label, and mixable by key
// and tempo — collection only.
//
// Future versions: pull related songs from other databases (Bandcamp
// wishlist, Discover candidates) and AI/API-based similarity tools. The
// `computeTrackPageState` contract is the seam for that.

import { keyToCamelot, camelotNeighbors } from './key-compat.js';
import { entityLinkHtml, wireEntityLinks, backLabelFor } from './entity-links.js';
import { coverArtUrl, hasCoverArt } from './cover-art.js';
import { trackActions } from './track-actions.js';
import { listGigs, setLaneMembership, onGigsChanged } from './gigs.js';
import { buildRoute } from './router.js';
import { renderObjectPage } from './object-page.js';
import { escapeHtml } from './html.js';
import { VIEWER } from './viewer-profile.js';


const MIXABLE_BPM_WINDOW = 3;
const RELATED_CAP = 15;

const norm = (s) => String(s || '').trim().toLowerCase();
const bpmOf = (t) => {
    const n = Number(t?.bpm);
    return Number.isFinite(n) && n > 0 ? n : null;
};
const byTitle = (a, b) => norm(a.title).localeCompare(norm(b.title));

// Header chips: one per lane the track is in, each linking to its gig with a
// remove button, then one add button that opens the membership editor.
export function renderLaneChips(entries, trackId) {
    const chips = (entries || []).map((e) => `<span class="tkp-lane-chip"><a href="${escapeHtml(buildRoute({ view: 'gigs', id: e.gigId }))}">${escapeHtml(e.gigName)} › ${escapeHtml(e.laneName)}</a><button type="button" data-lane-remove="${escapeHtml(`${e.gigId}|${e.laneId}`)}" aria-label="Remove from ${escapeHtml(e.gigName)} › ${escapeHtml(e.laneName)}">×</button></span>`).join('');
    return `<div class="lp-header-meta tkp-lanes">${chips ? `In gigs · ${chips}` : ''}<button type="button" class="tkp-lane-add" data-lane-add data-track-id="${escapeHtml(trackId)}" aria-label="Add to a gig">+</button></div>`;
}

export function gigsContaining(gigs, trackId) {
    const id = String(trackId);
    return (gigs || []).filter(gig => (gig.playlists || []).some(lane =>
        (lane.trackIds || []).some(track => String(track) === id)));
}

/**
 * Pure: derive everything the track page shows from the track + the full
 * collection. No DOM, no I/O.
 */
export function computeTrackPageState(track, allTracks) {
    const artist = norm(track.artist);
    const label = norm(track.label);
    const bpm = bpmOf(track);
    const camelot = keyToCamelot(track.tonality);
    const compatible = camelot ? camelotNeighbors(camelot) : null;

    const sameArtist = [];
    const sameLabel = [];
    const mixable = [];

    for (const t of allTracks || []) {
        const isSelf = t.id === track.id;
        const shareArtist = !!artist && norm(t.artist) === artist;
        const shareLabel = !!label && norm(t.label) === label;
        if (isSelf) continue;
        if (shareArtist) sameArtist.push(t);
        if (shareLabel) sameLabel.push(t);
        if (compatible && bpm != null) {
            const tb = bpmOf(t);
            const tc = keyToCamelot(t.tonality);
            if (tb != null && tc && compatible.has(tc) && Math.abs(tb - bpm) <= MIXABLE_BPM_WINDOW) {
                mixable.push(t);
            }
        }
    }

    sameArtist.sort(byTitle);
    sameLabel.sort(byTitle);
    mixable.sort((a, b) => (Math.abs(bpmOf(a) - bpm) - Math.abs(bpmOf(b) - bpm)) || byTitle(a, b));

    return {
        track,
        bpm: bpm == null ? null : Math.round(bpm),
        camelot,
        related: { sameArtist, sameLabel, mixable },
    };
}

export default class TrackPage {
    constructor({ app }) {
        this.app = app;
        this._state = null;
        this._offLinks = null;
        this._offGigs = null;
    }

    _backLabel() {
        return backLabelFor(this.app._prevRoute);
    }

    currentTrackId() { return this._state?.track?.id ?? null; }

    dispose() {
        if (this._offLinks) { this._offLinks(); this._offLinks = null; }
        if (this._offGigs) { this._offGigs(); this._offGigs = null; }
    }

    async render(trackId) {
        const app = this.app;
        const contentArea = document.getElementById('contentArea');
        const viewTitle = document.getElementById('viewTitle');
        const viewSubtitle = document.getElementById('viewSubtitle');
        if (!contentArea) return;
        this.dispose();

        viewTitle.textContent = 'Track';
        viewSubtitle.textContent = '';
        contentArea.innerHTML = '<div class="loading">Loading track…</div>';

        const route = app._route;
        const generation = (this._renderGeneration || 0) + 1;
        this._renderGeneration = generation;
        const isStale = () => app._route !== route || this._renderGeneration !== generation;
        const allTracks = await app._allTracks();
        if (isStale()) return;
        const track = allTracks.find((t) => String(t.id) === String(trackId));
        if (!track) {
            contentArea.innerHTML = `
                <div class="label-page track-page">
                    <a href="#" class="label-breadcrumb" data-tkp-back>&larr; ${escapeHtml(this._backLabel())}</a>
                    <div class="empty-state"><h3>Track not found</h3><p>It may have been removed from the collection.</p></div>
                </div>`;
            this._wireBack(contentArea);
            return;
        }

        const state = computeTrackPageState(track, allTracks);
        state.lanes = !VIEWER && typeof app._membershipIndex === 'function' ? (await app._membershipIndex()).get(String(track.id)) || [] : [];
        if (isStale()) return;
        this._state = state;
        viewTitle.textContent = 'Track';
        viewSubtitle.textContent = '';
        renderObjectPage(app, contentArea, {
            type: 'track', name: track.title || '(untitled)', id: track.id, tracks: [track], chips: [], pageClass: 'track-page',
            backHtml: `<a href="#" class="label-breadcrumb" data-tkp-back>&larr; ${escapeHtml(this._backLabel())}</a>`,
            ...this._renderShell(state),
        });
        this._wireBack(contentArea);
        this._offLinks = wireEntityLinks(contentArea.querySelector('.track-page'), app);
        contentArea.querySelectorAll('[data-tkp-action]').forEach(button => button.addEventListener('click', async (event) => {
            const item = trackActions(app, [track.id]).find(action => action.id === button.dataset.tkpAction);
            if (!item) return;
            await item.run({ picker: event.shiftKey });
            if (!isStale()) this.refreshActions();
        }));
        contentArea.querySelector('[data-local-play-id]')?.addEventListener('click', () => {
            app.playLocalTrack?.(track, [track], { key: `track:${track.id}`, kind: 'track', label: track.title || 'Track', route: { view: 'track', name: track.id } });
        });
        contentArea.querySelector('[data-lane-add]')?.addEventListener('click', () => app._openGigLanePicker?.([track.id], { source: 'Track page' }));
        contentArea.querySelectorAll('[data-lane-remove]').forEach((button) => button.addEventListener('click', async () => {
            const [gigId, laneId] = button.dataset.laneRemove.split('|');
            try {
                const gig = await setLaneMembership(app.integrationManager.database, gigId, { trackIds: [track.id], removeLaneIds: [laneId] });
                if (!gig) throw new Error('that gig no longer exists');
            } catch (err) { app.showNotification?.(`Could not remove: ${err.message}`, 'error'); }
        }));
        // Any gig write (the editor, a chip's ×, quick-add) redraws the chips.
        if (!VIEWER) this._offGigs = onGigsChanged(() => { if (!isStale()) this.render(track.id); });
    }

    _wireBack(contentArea) {
        contentArea.querySelectorAll('[data-tkp-back]').forEach((el) => {
            el.addEventListener('click', (e) => { e.preventDefault(); if (this.app._prevRoute) history.back(); else this.app.navigate({ view: 'collection' }); });
        });
    }

    refreshActions() {
        if (!this._state) return;
        const items = trackActions(this.app, [this._state.track.id]);
        document.querySelectorAll('[data-tkp-action]').forEach(button => {
            const item = items.find(action => action.id === button.dataset.tkpAction);
            if (item) button.innerHTML = `${escapeHtml(item.label)}${item.key ? ` <kbd>${item.key}</kbd>` : ''}`;
        });
    }

    _renderShell(state) {
        const { track: t, related } = state;
        const art = hasCoverArt(t)
            ? `<img src="${escapeHtml(coverArtUrl(t))}" alt="" loading="lazy" decoding="async" data-art-fallback="cover-ph">`
            : '<span class="cover-ph" aria-hidden="true"></span>';

        const meta = [
            entityLinkHtml({ type: 'artist', name: t.artist }),
            entityLinkHtml({ type: 'album', name: t.album, artist: t.artist }),
            entityLinkHtml({ type: 'label', name: t.label }),
        ].filter(Boolean).join('<span class="tkp-sep" aria-hidden="true">·</span>');

        const facts = [];
        if (state.bpm != null) facts.push(`<span class="tkp-fact"><span class="tkp-fact-k">BPM</span>${entityLinkHtml({ type: 'bpm', name: t.bpm })}</span>`);
        if (t.tonality) facts.push(`<span class="tkp-fact"><span class="tkp-fact-k">Key</span>${escapeHtml(t.tonality)}${state.camelot ? ` <span class="muted">${escapeHtml(state.camelot)}</span>` : ''}</span>`);
        if (t.year) facts.push(`<span class="tkp-fact"><span class="tkp-fact-k">Year</span>${escapeHtml(String(t.year))}</span>`);
        if (t.genre) facts.push(`<span class="tkp-fact"><span class="tkp-fact-k">Genre</span>${escapeHtml(t.genre)}</span>`);
        const tags = Array.isArray(t.tags) ? t.tags.filter(Boolean) : [];
        if (tags.length) {
            facts.push(`<span class="tkp-fact"><span class="tkp-fact-k">Tags</span>${tags.map((x) => entityLinkHtml({ type: 'tag', name: x, extraClass: 'tkp-tag' })).join('')}</span>`);
        }

        // ★ and Explore are the shared header's; the artist and label are links above.
        const actions = VIEWER ? [] : trackActions(this.app, [t.id]).filter((item) => ['gig', 'review'].includes(item.id));
        const playControl = this.app?.localPlayControlHtml?.(t, { page: true }) || '';
        const groups = [
            { key: 'mixable', title: 'Mixable', hint: 'Compatible key, within 3 BPM', rows: related.mixable },
            { key: 'sameArtist', title: `More by ${escapeHtml(t.artist || 'this artist')}`, hint: '', rows: related.sameArtist },
            { key: 'sameLabel', title: t.label ? `Also on ${escapeHtml(t.label)}` : 'Same label', hint: '', rows: related.sameLabel },
        ];

        return {
            artHtml: art,
            subHtml: `<div class="op-sub tkp-meta">${meta}</div>`,
            extraHtml: `<div class="tkp-facts">${facts.join('')}</div>${VIEWER ? '' : renderLaneChips(state.lanes, t.id)}`,
            actionsHtml: `${playControl}${actions.map((item) => `<button type="button" class="lp-action" data-tkp-action="${item.id}">${escapeHtml(item.label)}${item.key ? ` <kbd>${item.key}</kbd>` : ''}</button>`).join('')}`,
            keptHtml: `
                <section class="lp-section tkp-related">
                    <div class="lp-section-head">
                        <h2 class="lp-section-title">Related tracks</h2>
                    </div>
                    <p class="lp-section-hint">From your collection only.</p>
                    <div class="tkp-groups">
                        ${groups.map((g) => this._renderGroup(g)).join('')}
                    </div>
                </section>`,
        };
    }

    _renderGroup(g) {
        const rows = g.rows.slice(0, RELATED_CAP);
        const more = g.rows.length - rows.length;
        const body = rows.length
            ? `<ol class="tkp-list">${rows.map((t) => this._renderRow(t)).join('')}</ol>${more > 0 ? `<p class="muted tkp-more">+${more} more</p>` : ''}`
            : '<p class="muted tkp-empty">Nothing yet.</p>';
        return `
            <div class="tkp-group tkp-group--${g.key}">
                <h3 class="tkp-group-title">${g.title}${g.hint ? ` <span class="tkp-group-hint muted">${escapeHtml(g.hint)}</span>` : ''}</h3>
                ${body}
            </div>`;
    }

    _renderRow(t) {
        const cam = keyToCamelot(t.tonality);
        return `
            <li class="tkp-row">
                ${entityLinkHtml({ type: 'track', name: t.id, text: t.title || '(untitled)', extraClass: 'tkp-row-title' })}
                ${entityLinkHtml({ type: 'artist', name: t.artist, extraClass: 'tkp-row-artist' })}
                <span class="tkp-row-key">${escapeHtml(cam || t.tonality || '')}</span>
                <span class="tkp-row-bpm">${entityLinkHtml({ type: 'bpm', name: t.bpm })}</span>
            </li>`;
    }
}
