// Discover › New Releases: recent releases from the artists and labels you own,
// favorites first, from every release source the server knows
// (GET /api/discover/new-releases), then the Bandcamp accounts you follow but
// own nothing from. Opening the tab asks the server to re-check stale favorites.
import { renderBandcampFollowDiff } from './bandcamp-diff.js';
import { panelView } from './detail-panel.js';
import { shortlistItemFromRelease, addShortlistItem, RELEASES_CHANGED } from './shortlist.js';
import { buildRoute } from './router.js';
import { mountUnlinkedLine } from './entity-links-row.js';
import { escapeHtml as esc } from './html.js';
import { VIEWER } from './viewer-profile.js';

export const GROUP_TITLES = { week: 'This week', month: 'This month', earlier: 'Earlier', year: 'This year' };
export const SOURCE_NAMES = { discogs: 'Discogs', bandcamp: 'Bandcamp', spotify: 'Spotify' };
const RELOAD_KINDS = new Set(['artist-releases', 'label-releases', 'release']);
const RELOAD_MS = 1500;

/** "30 Oct", "30 Oct 2025", "Oct 2026" or "2026", in UTC so a date never shifts a day. */
export function formatReleaseDate(row, now = Date.now()) {
    if (!row?.date) return row?.year ? String(row.year) : '';
    const [y, m, d] = row.date.split('-').map(Number);
    const at = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    const month = at.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
    if (row.datePrecision === 'month' || !d) return `${month} ${y}`;
    return y === new Date(now).getUTCFullYear() ? `${d} ${month}` : `${d} ${month} ${y}`;
}

/** Where "Open" goes: Discogs when there is a Discogs source, else its own page (Bandcamp). */
export function openTarget(row) {
    const sources = row?.sources || [];
    const discogs = sources.find((s) => s.source === 'discogs' && s.url);
    if (discogs) return { label: 'Open on Discogs', href: discogs.url };
    const other = sources.find((s) => s.url);
    return other ? { label: `Open on ${SOURCE_NAMES[other.source] || other.source}`, href: other.url } : null;
}

/**
 * The lines above the list, from each provider's status and the failed checks.
 * Never claims "nothing new" while a source is unchecked, checking or failing.
 * → { lines: [{ text, href?, retry? }], nothingNew, unchecked }
 */
export function statusLines({ status = {}, failures = [], groups = [] } = {}) {
    const lines = [];
    const push = (line) => { if (!lines.some((l) => l.text === line.text)) lines.push(line); };
    let checking = 0, of = 0, settled = true;
    for (const [id, st] of Object.entries(status)) {
        const name = SOURCE_NAMES[id] || id;
        if (st.state === 'disconnected') {
            settled = false;
            push(id === 'discogs' ? { text: 'Connect Discogs in Settings to check releases.', href: '#/settings' } : { text: `Connect ${name} in Settings to check releases.`, href: '#/settings' });
        } else if (st.state === 'rate-limited') { settled = false; push({ text: 'Checking later' }); }
        else if (st.state === 'paused') { settled = false; push({ text: `${name}: paused` }); }
        else if (st.state === 'off') { if (id === 'discogs') { settled = false; push({ text: 'Discogs: off' }); } }
        else { checking += Number(st.checking) || 0; of += Number(st.of) || 0; }
    }
    if (checking > 0) { settled = false; push({ text: `Checking ${checking} of ${of}` }); }
    if (failures.length) push({ text: `${failures.length} could not be checked`, retry: true });
    const empty = !groups.some((g) => g.releases?.length);
    const unchecked = settled && !failures.length && of === 0 && Object.keys(status).length > 0;
    return { lines, nothingNew: empty && settled && !failures.length && !unchecked, unchecked: empty && unchecked };
}

const sourceMarks = (row) => (row.sources || []).map((s) => `<span class="nr-src nr-src--${esc(s.source)}" title="${esc(SOURCE_NAMES[s.source] || s.source)}">${esc((SOURCE_NAMES[s.source] || s.source).charAt(0))}</span>`).join('');

/** One row. `onShortlist` is the set of shortlist ids already held. */
export function releaseRowHtml(row, { now = Date.now(), onShortlist = new Set(), shortlistId = '' } = {}) {
    const cover = row.cover
        ? `<img class="nr-cover" src="${esc(row.cover)}" alt="" loading="lazy" decoding="async">`
        : '<span class="nr-cover nr-cover--empty" aria-hidden="true"></span>';
    const open = openTarget(row);
    const listed = onShortlist.has(shortlistId);
    const meta = [row.artist, row.label].filter(Boolean).map(esc).join(' · ');
    return `<li class="nr-row${row.favorite ? ' is-favorite' : ''}" data-nr-key="${esc(row.key)}" tabindex="0" role="button" aria-label="${esc(`${row.artist || ''} ${row.title}`.trim())}">
        ${cover}
        <span class="nr-main"><span class="nr-title">${esc(row.title)}</span><span class="nr-meta">${meta}</span></span>
        <span class="nr-date">${esc(formatReleaseDate(row, now))}</span>
        <span class="nr-owned${row.owned ? ' is-owned' : ''}">${row.owned ? 'In library' : 'Not owned'}</span>
        <span class="nr-srcs">${sourceMarks(row)}</span>
        <span class="nr-actions">
            ${VIEWER ? '' : `<button type="button" class="nr-act" data-nr-shortlist${listed ? ' disabled' : ''}>${listed ? 'On Shortlist' : 'Shortlist'}</button>`}
            ${open ? `<a class="nr-act" href="${esc(open.href)}" target="_blank" rel="noopener">${esc(open.label)}</a>` : ''}
            ${VIEWER ? '' : '<button type="button" class="nr-act" data-nr-dismiss>Dismiss</button>'}
            ${row.discogsReleaseId ? `<a class="nr-act" href="${esc(buildRoute({ view: 'discover', focus: `release:discogs:${row.discogsReleaseId}` }))}" data-nr-show>Show in Discover</a>` : ''}
        </span>
    </li>`;
}

export function newReleasesHtml(data, { now = Date.now(), onShortlist = new Set(), idOf = () => '' } = {}) {
    const { lines, nothingNew, unchecked } = statusLines(data);
    const line = (l) => (VIEWER ? esc(l.text) : l.href ? `<a href="${esc(l.href)}">${esc(l.text)}</a>`
        : l.retry ? `${esc(l.text)} — <button type="button" class="btn-link" data-nr-retry>retry</button>` : esc(l.text));
    const status = lines.length ? `<p class="nr-status" role="status">${lines.map(line).join(' · ')}</p>` : '';
    const groups = (data.groups || []).map((g) => `<section class="nr-group" data-nr-group="${esc(g.key)}">
        <h2 class="nr-group-title">${esc(GROUP_TITLES[g.key] || g.key)}</h2>
        <ul class="nr-list">${g.releases.map((r) => releaseRowHtml(r, { now, onShortlist, shortlistId: idOf(r) })).join('')}</ul>
    </section>`).join('');
    const empty = nothingNew ? '<p class="nr-empty">Nothing new from your artists and labels.</p>'
        : unchecked ? '<p class="nr-empty">No artists or labels checked yet.</p>' : '';
    return `<div class="nr-view">${status}${VIEWER ? '' : '<div data-nr-unlinked></div>'}${groups}${empty}${VIEWER ? '' : '<section class="nr-bandcamp" data-nr-bandcamp></section>'}</div>`;
}

const defaultFetch = (...a) => globalThis.fetch(...a);

export default class DiscoverNewView {
    constructor({ app, fetchImpl = defaultFetch }) {
        this.app = app;
        this.fetchImpl = fetchImpl;
        this.generation = 0;
        this.unsubscribe = null;
        this.timer = null;
        this.rows = new Map();
    }

    teardown() {
        this.generation++;
        this.unsubscribe?.();
        this.unsubscribe = null;
        clearTimeout(this.timer);
        this.timer = null;
    }

    async _json(url, init) {
        const res = await this.fetchImpl(url, init);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    _refresh(body = {}) {
        return this._json('/api/discover/new-releases/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    }

    async render(contentArea) {
        this.teardown();
        const generation = this.generation;
        const live = () => generation === this.generation && contentArea.isConnected;
        document.getElementById('viewTitle').textContent = 'Discover';
        document.getElementById('viewSubtitle').textContent = '';
        if (!VIEWER) await this._refresh();
        if (!live()) return;
        await this._paint(contentArea, live);
        if (!live()) return;
        const offQueue = this.app.discogsQueue?.onJobDone?.((job) => {
            if (!RELOAD_KINDS.has(job?.kind) || this.timer) return;
            this.timer = setTimeout(() => { this.timer = null; if (live()) this._paint(contentArea, live); }, RELOAD_MS);
        });
        // The release panel shortlists and dismisses too.
        const onChanged = () => { if (live()) this._paint(contentArea, live); };
        window.addEventListener(RELEASES_CHANGED, onChanged);
        this.unsubscribe = () => { offQueue?.(); window.removeEventListener(RELEASES_CHANGED, onChanged); };
    }

    async _paint(contentArea, live) {
        let data;
        try { data = await this._json('/api/discover/new-releases'); } catch (err) {
            if (!live()) return;
            contentArea.innerHTML = `<div class="nr-view"><p class="nr-status" role="status">New releases could not be loaded${VIEWER ? '' : ' — <button type="button" class="btn-link" data-nr-reload>retry</button>'}</p></div>`;
            contentArea.querySelector('[data-nr-reload]')?.addEventListener('click', () => this._paint(contentArea, live));
            return;
        }
        const db = this.app.integrationManager?.database;
        const listed = VIEWER ? [] : await db?.listShortlist?.().catch(() => []) || [];
        if (!live()) return;
        const onShortlist = new Set(listed.map((i) => String(i.id)));
        const idOf = (r) => shortlistItemFromRelease(r, '')?.id || '';
        this.rows = new Map((data.groups || []).flatMap((g) => g.releases).map((r) => [r.key, r]));
        const scroller = contentArea.closest?.('.main-scroll');
        const top = scroller?.scrollTop || 0;
        contentArea.innerHTML = newReleasesHtml(data, { onShortlist, idOf });
        if (scroller) scroller.scrollTop = top;
        this._wire(contentArea, live);
        if (!VIEWER) {
            this._mountBandcamp(contentArea.querySelector('[data-nr-bandcamp]'), live);
            mountUnlinkedLine(contentArea.querySelector('[data-nr-unlinked]'), { fetchJson: (url) => this._json(url) });
        }
    }

    async _mountBandcamp(mount, live) {
        if (!mount) return;
        try {
            const [tracks, accounts] = await Promise.all([this.app._allTracks(), this.app.integrationManager?.database?.getBandcampAccounts?.() || []]);
            if (!live() || !mount.isConnected) return;
            mount.innerHTML = '<h2 class="nr-group-title">Followed on Bandcamp</h2>';
            renderBandcampFollowDiff(mount, tracks, accounts);
        } catch (_) { mount.innerHTML = ''; }
    }

    _wire(root, live) {
        const app = this.app;
        root.querySelector('[data-nr-retry]')?.addEventListener('click', async (e) => {
            e.currentTarget.disabled = true;
            await this._refresh({ retry: true });
            if (live()) this._paint(root, live);
        });
        root.querySelectorAll('.nr-row').forEach((el) => {
            const row = this.rows.get(el.dataset.nrKey);
            if (!row) return;
            const openPanel = () => { if (panelView('release')) app.panel?.show('release', { release: row }, { trigger: el }); };
            el.addEventListener('click', (e) => { if (!e.target.closest('a, button')) openPanel(); });
            el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el) openPanel(); });
            el.querySelector('[data-nr-shortlist]')?.addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                try {
                    await addShortlistItem(app, shortlistItemFromRelease(row, 'new-releases'));
                    btn.textContent = 'On Shortlist';
                } catch (err) {
                    btn.disabled = false;
                    app.showNotification?.(`Shortlist not saved: ${err?.message || err}`, 'error');
                }
            });
            el.querySelector('[data-nr-dismiss]')?.addEventListener('click', async () => {
                try {
                    await app.integrationManager.database.dismissReleases(row.dismissKeys);
                    el.remove();
                    root.querySelectorAll('.nr-group').forEach((g) => { if (!g.querySelector('.nr-row')) g.remove(); });
                } catch (err) { app.showNotification?.(`Not dismissed: ${err?.message || err}`, 'error'); }
            });
        });
    }
}
