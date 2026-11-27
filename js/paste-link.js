// A Bandcamp or Discogs link pasted into the header search field: one row under
// the field instead of a search. Bandcamp: ▶ preview and Shortlist. Discogs
// release: Shortlist and Open. Discogs artist or label: Discover, which opens
// Discover › Graph on it. "In your library" when the link matches what you own.
import { entityId } from './credits-graph.js';
import { shortlistItemFromRelease, addShortlistItem, RELEASES_CHANGED } from './shortlist.js';
import { openSite } from './site-links.js';
import { escapeHtml as esc } from './html.js';


const norm = (s) => String(s ?? '').trim().toLowerCase();
const KIND_WORD = { release: 'Release', master: 'Release', artist: 'Artist', label: 'Label' };
const slugName = (slug) => { try { return decodeURIComponent(String(slug || '')).replace(/-/g, ' ').trim(); } catch (_) { return ''; } };

/**
 * A pasted link: { kind: 'bandcamp', url } for an album or track page, or
 * { kind: 'discogs', type, id, url, name? } for a release, master, artist or
 * label (the name from the address's slug); null for anything else.
 */
export function parseLink(text) {
    const raw = String(text ?? '').trim();
    if (!/^https?:\/\/\S+$/i.test(raw)) return null;
    let u;
    try { u = new URL(raw); } catch (_) { return null; }
    if (/^[a-z0-9-]+\.bandcamp\.com$/i.test(u.hostname) && /^\/(album|track)\/[^/]+\/?$/.test(u.pathname)) {
        const url = `https://${u.hostname.toLowerCase()}${u.pathname.replace(/\/$/, '')}`;
        return { kind: 'bandcamp', url, key: `bandcamp:${url}` };
    }
    const m = /(^|\.)discogs\.com$/i.test(u.hostname) && u.pathname.match(/^\/(?:[a-z]{2}\/)?(?:sell\/)?(release|master|artist|label)\/(\d+)(?:-([^/]*))?/i);
    if (m) {
        const type = m[1].toLowerCase(), id = m[2];
        const name = type === 'artist' || type === 'label' ? slugName(m[3]) : '';
        return { kind: 'discogs', type, id, url: `https://www.discogs.com/${type}/${id}`, key: `discogs:${type}:${id}`, ...(name ? { name } : {}) };
    }
    return null;
}

/** Do you own this? Artist and label by name; a release by artist and album title. */
export function ownedMatch(link, tracks = []) {
    const name = norm(link.name), artist = norm(link.artist);
    if (!name) return false;
    if (link.type === 'artist') return tracks.some((t) => norm(t.artist) === name);
    if (link.type === 'label') return tracks.some((t) => norm(t.label) === name);
    return tracks.some((t) => norm(t.album) === name && (!artist || norm(t.artist) === artist));
}

export function pasteRowHtml(link, { owned = false, loading = false } = {}) {
    const where = link.kind === 'bandcamp' ? 'Bandcamp' : `Discogs ${KIND_WORD[link.type] || ''}`.trim();
    const title = link.name || (loading ? 'Loading…' : link.kind === 'bandcamp' ? link.url.replace(/^https:\/\//, '') : `${KIND_WORD[link.type]} ${link.id}`);
    const sub = [link.artist, link.year].filter(Boolean).map(esc).join(' · ');
    const isRelease = link.kind === 'bandcamp' || link.type === 'release' || link.type === 'master';
    const acts = isRelease
        ? `<button type="button" class="nr-act" data-paste="shortlist"${link.name ? '' : ' disabled'}>Shortlist</button>${link.kind === 'discogs' ? '<button type="button" class="nr-act" data-paste="open">Open</button>' : ''}`
        : '<button type="button" class="nr-act" data-paste="discover">Discover</button>';
    return `<div class="paste" role="dialog" aria-label="Pasted link">
        <div class="paste-src">${esc(where)} · ${owned ? 'In your library' : 'Not in your library'}</div>
        <div class="dx-row">
            <span class="dx-art">${link.cover ? `<img src="${esc(link.cover)}" alt="">` : ''}${link.kind === 'bandcamp' && link.playable ? '<button type="button" class="dx-play" data-paste="play" aria-label="Preview on Bandcamp">▶</button>' : ''}</span>
            <span class="dx-main"><span class="dx-t">${esc(title)}</span><span class="dx-s">${sub}</span></span>
            <span class="dx-acts is-on">${acts}</span>
        </div>
    </div>`;
}

export default class PasteLink {
    constructor({ app, input, fetchJson = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); } }) {
        this.app = app; this.input = input; this.fetchJson = fetchJson;
        this.link = null; this._gen = 0;
        this.host = input?.closest('.search-container') || null;
        input?.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.link) { e.stopPropagation(); this.close(); } });
        document.addEventListener('pointerdown', (e) => { if (this.link && !this.host?.contains(e.target)) this.close(); }, true);
    }

    /** The field changed: a link shows its row and is not a search. True when it was a link. */
    handle(text) {
        const link = parseLink(text);
        if (!link) { this.close(); return false; }
        if (this.link?.key === link.key) return true;
        this.link = link;
        this._fill(link);
        return true;
    }

    async _fill(link) {
        const gen = ++this._gen;
        this._paint({ loading: true });
        try {
            if (link.kind === 'bandcamp') {
                const body = await this.fetchJson(`/api/preview/bandcamp?url=${encodeURIComponent(link.url)}`).catch(() => null);
                if (body) Object.assign(link, { name: body.title, artist: body.artist, playable: (body.tracks || []).length > 0 });
            } else if ((link.type === 'release') && this.app.backendServices?.discogs) {
                const { release } = await this.fetchJson(`/api/discogs/release/${link.id}`);
                Object.assign(link, { name: release?.title, artist: (release?.artists || []).map((a) => a.name).join(', '), year: release?.year || null, cover: release?.thumb || '' });
            }
        } catch (_) { /* the row keeps what the link says */ }
        if (gen === this._gen && this.link === link) this._paint();
    }

    _paint({ loading = false } = {}) {
        if (!this.host || !this.link) return;
        this.host.querySelector('.paste')?.remove();
        const owned = ownedMatch(this.link, this.app._tracksCache || []);
        this.host.insertAdjacentHTML('beforeend', pasteRowHtml(this.link, { owned, loading }));
        this.host.querySelector('.paste').addEventListener('click', (e) => this._act(e));
    }

    _release() {
        const l = this.link;
        return { key: l.key, title: l.name, artist: l.artist || '', year: l.year || null, cover: l.cover || '', discogsReleaseId: l.kind === 'discogs' && l.type === 'release' ? l.id : null, sources: l.kind === 'bandcamp' ? [{ source: 'bandcamp', id: l.url, url: l.url }] : [] };
    }

    async _act(e) {
        const b = e.target.closest('[data-paste]');
        const l = this.link;
        if (!b || !l) return;
        const act = b.dataset.paste;
        if (act === 'play') return this.app.preview?.play(this._release(), { key: l.key });
        if (act === 'open') return openSite(l.url, 'discogs');
        if (act === 'discover') {
            const focus = entityId(l.type, l.name || String(l.id));
            this.close();
            this.input.value = '';
            return this.app.navigate({ view: 'discover', focus, ref: `discogs:${l.type}:${l.id}` });
        }
        if (act === 'shortlist') {
            b.disabled = true;
            try { await addShortlistItem(this.app, shortlistItemFromRelease(this._release(), 'paste')); b.textContent = 'On Shortlist'; window.dispatchEvent(new CustomEvent(RELEASES_CHANGED)); }
            catch (err) { b.disabled = false; this.app.showNotification?.(`Shortlist not saved: ${err?.message || err}`, 'error'); }
        }
    }

    close() {
        this._gen++;
        this.link = null;
        this.host?.querySelector('.paste')?.remove();
    }
}
