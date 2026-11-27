// The detail panel for a release you don't own (yet): from New Releases rows,
// Shortlist rows and, later, graph nodes. Title, artist, label, date or year,
// format; the tracklist once fetched, with Shortlist on each track; Shortlist
// for the whole release; Open on Discogs (or its own page without a Discogs
// id), a Bandcamp search, Dismiss. No ★ and no page: Discogs is its page.
//
// Payload: { release } — a New Releases row, a shortlist item, or any object
// with title and artist plus what it knows (discogsReleaseId, sources,
// tracklist, label/labelName, date/year, format, cover/thumb, dismissKeys).
import { siteLinks, siteRowHtml } from './site-links.js';
import { registerPanelView } from './detail-panel.js';
import { dbGet } from './db-client.js';
import { tracklistOf } from './shortlist-match.js';
import { shortlistItemFromRelease, shortlistItemFromTrack, addShortlistItem, RELEASES_CHANGED } from './shortlist.js';
import { formatReleaseDate, openTarget } from './discover-new.js';
import { escapeHtml as esc } from './html.js';

/** Fill in what a shortlist item or a bare release lacks: sources, label, keys. */
export function normaliseRelease(r = {}) {
    const discogsReleaseId = r.discogsReleaseId != null && r.discogsReleaseId !== '' ? String(r.discogsReleaseId) : null;
    let sources = Array.isArray(r.sources) ? r.sources : [];
    if (!sources.length) {
        if (discogsReleaseId) sources = [{ source: 'discogs', id: discogsReleaseId, url: `https://www.discogs.com/release/${discogsReleaseId}` }];
        else if (r.url) sources = [{ source: /bandcamp\.com/.test(r.url) ? 'bandcamp' : 'link', id: r.url, url: r.url }];
    }
    return {
        ...r, discogsReleaseId, sources,
        label: r.label || r.labelName || '', cover: r.cover || r.thumb || '',
        dismissKeys: Array.isArray(r.dismissKeys) && r.dismissKeys.length ? r.dismissKeys : sources.filter((s) => s.source !== 'link').map((s) => `${s.source}:${s.id}`),
    };
}

/** Where the tracklist stands: { state: 'ready'|'loading'|'none'|'disconnected', tracks }. */
export function tracklistState(release, stored, { connected = true } = {}) {
    const own = tracklistOf(release.tracklist);
    if (own) return { state: 'ready', tracks: own };
    const fromStore = tracklistOf(stored?.tracklist);
    const positioned = (stored?.tracklistVersion ?? 0) >= 2;
    if (fromStore && positioned) return { state: 'ready', tracks: fromStore };
    if (!release.discogsReleaseId) return { state: 'none', tracks: [] };
    if (!connected) return { state: fromStore ? 'ready' : 'disconnected', tracks: fromStore || [] };
    return { state: fromStore ? 'refreshing' : 'loading', tracks: fromStore || [] };
}


export function releasePanelHtml(release, { tracks = { state: 'loading', tracks: [] }, listed = new Set(), now = Date.now() } = {}) {
    const r = release;
    const whole = shortlistItemFromRelease(r, '')?.id;
    const open = openTarget(r);
    const date = formatReleaseDate(r, now);
    const meta = [r.label, date, r.format].filter(Boolean).map(esc).join(' · ');
    const trackRow = (t) => {
        const id = shortlistItemFromTrack(r, t, '')?.id;
        const on = listed.has(id);
        const artist = t.artist && t.artist !== r.artist ? `<span class="rp-track-artist">${esc(t.artist)}</span>` : '';
        return `<li class="rp-track"><span class="rp-pos">${esc(t.position || '')}</span><span class="rp-track-title">${esc(t.title)}${artist}</span>
            <button type="button" class="nr-act" data-rp-track="${esc(id)}"${on ? ' disabled' : ''}>${on ? 'On Shortlist' : 'Shortlist'}</button></li>`;
    };
    const list = tracks.tracks.length ? `<ol class="rp-tracks">${tracks.tracks.map(trackRow).join('')}</ol>` : '';
    const note = tracks.state === 'loading' ? '<div class="dp-skel" style="width:70%"></div><div class="dp-skel" style="width:52%"></div>'
        : tracks.state === 'disconnected' ? '<a class="dp-note dp-link" href="#/settings">Connect Discogs in Settings</a>'
            : tracks.state === 'none' && !list ? '<div class="dp-note">No tracklist</div>' : '';
    return `<div class="dp-head"><div class="dp-eyebrow">Release</div></div>
        <div class="dp-body rp-body">
            ${r.cover ? `<img class="rp-cover" src="${esc(r.cover)}" alt="" width="96" height="96">` : ''}
            <h3 class="dp-name">${esc(r.title)}</h3>
            <div class="dp-meta">${esc(r.artist || '')}</div>
            ${meta ? `<div class="dp-meta">${meta}</div>` : ''}
            <div class="dp-actions">
                <button type="button" class="dp-btn is-primary" data-rp-shortlist${listed.has(whole) ? ' disabled' : ''}>${listed.has(whole) ? 'On Shortlist' : 'Shortlist'}</button>
                <button type="button" class="dp-btn" data-rp-dismiss${r.dismissKeys.length ? '' : ' disabled'}>Dismiss</button>
            </div>
            <section class="dp-section" data-rp-tracklist><h4>Tracklist</h4>${list}${note}</section>
            ${open && !/discogs\.com|bandcamp\.com/.test(open.href) ? `<nav class="dp-links" aria-label="Links"><a href="${esc(open.href)}" target="_blank" rel="noopener">${esc(open.label)}</a></nav>` : ''}
            ${siteRowHtml(siteLinks({ type: 'release', name: r.title, artist: r.artist, sources: r.sources, discogsReleaseId: r.discogsReleaseId }))}
        </div>`;
}

registerPanelView('release', {
    async render(host, { release: raw }, { panel, app, live, opts: { focus = true } = {} }) {
        const release = normaliseRelease(raw);
        const id = release.discogsReleaseId;
        panel.current = { type: 'release', id: release.key || (id ? `release:discogs:${id}` : null), name: release.title };
        const db = app.integrationManager?.database;
        const connected = Boolean(app.hasBackend && app.backendServices?.discogs);
        let asked = false;

        const paint = async () => {
            const [stored, items] = await Promise.all([
                id ? dbGet('release_credits', id).catch(() => null) : null,
                db?.listShortlist?.().catch(() => []) ?? [],
            ]);
            if (!live()) return;
            const tracks = tracklistState(release, stored, { connected });
            host.innerHTML = releasePanelHtml(release, { tracks, listed: new Set((items || []).map((i) => String(i.id))) });
            wire(tracks);
            if ((tracks.state === 'loading' || tracks.state === 'refreshing') && !asked) {
                asked = true;
                app.discogsQueue?.focus?.({ focus: [`release:discogs:${id}`] });
            }
        };

        const wire = (tracks) => {
                host.querySelector('[data-rp-shortlist]')?.addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                const item = shortlistItemFromRelease({ ...release, tracklist: tracks.state === 'ready' ? tracks.tracks : release.tracklist }, 'release-panel');
                try { await addShortlistItem(app, item); btn.textContent = 'On Shortlist'; window.dispatchEvent(new CustomEvent(RELEASES_CHANGED)); }
                catch (err) { btn.disabled = false; app.showNotification?.(`Shortlist not saved: ${err?.message || err}`, 'error'); }
            });
            host.querySelectorAll('[data-rp-track]').forEach((btn) => btn.addEventListener('click', async () => {
                const track = tracks.tracks.find((t) => shortlistItemFromTrack(release, t, '')?.id === btn.dataset.rpTrack);
                if (!track) return;
                btn.disabled = true;
                try { await addShortlistItem(app, shortlistItemFromTrack(release, track, 'release-panel')); btn.textContent = 'On Shortlist'; window.dispatchEvent(new CustomEvent(RELEASES_CHANGED)); }
                catch (err) { btn.disabled = false; app.showNotification?.(`Shortlist not saved: ${err?.message || err}`, 'error'); }
            }));
            host.querySelector('[data-rp-dismiss]')?.addEventListener('click', async () => {
                try {
                    await db.dismissReleases(release.dismissKeys);
                    panel.close();
                    window.dispatchEvent(new CustomEvent(RELEASES_CHANGED, { detail: { dismissed: release.dismissKeys } }));
                } catch (err) { app.showNotification?.(`Not dismissed: ${err?.message || err}`, 'error'); }
            });
            host.querySelector('.rp-cover')?.addEventListener('error', (e) => { e.target.hidden = true; }, { once: true });
        };

        if (id && app.discogsQueue?.onJobDone) {
            panel.unsubscribe = app.discogsQueue.onJobDone((job) => {
                if (live() && (job?.entityIds || []).includes(`release:discogs:${id}`)) paint();
            });
        }
        await paint();
        if (focus && live()) host.querySelector('button')?.focus();
    },
});
