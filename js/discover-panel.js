// The side panel's Discover tab on Discover › Graph: what the graph shows
// around the focus (or around the anchors with no focus), as cards you can
// play. A focused artist's or label's own releases you don't own come first
// ("By <artist>", "On <label>"), then what is near it: releases, then artists
// and labels, up to 12 each by rank (the server's relative rank within each
// source, else score). ▶ previews (preview.js); a release opens
// in Info; an artist or label walks the graph to it; Shortlist and × (Dismiss)
// on hover. Dig asks the sources again and stays on "Digging…" until the
// answer is drawn, then says what it found. The graph owns the data and calls
// `update(view)`; this module only draws and wires the list.
import { whyLine } from './graph/atlas-view.js';
import { releaseFromNode, sourcesLoading, NOTHING_NEAR } from './graph/outside.js';
import { normaliseRelease } from './panel-release.js';
import { shortlistItemFromRelease, addShortlistItem, RELEASES_CHANGED } from './shortlist.js';
import { previewKind } from './preview.js';
import { escapeHtml as esc } from './html.js';
import { VIEWER, visitorHides } from './viewer-profile.js';

export const LIST_MAX = 12;
// Sources score on their own scales, so the server ranks each node within its own source.
export const standing = (n) => Number(n?.rank ?? n?.score) || 0;
const byScore = (a, b) => standing(b) - standing(a);
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const CREDITS = /\s*(?:,|&|\+|\/|\bvs\b\.?|\bfeat\b\.?|\bft\.)\s*/i;

/** A release credited to the focused artist, or on the focused label. */
export function isOwnRelease(node, context) {
    if (node?.type !== 'release' || !context?.name) return false;
    const field = context.type === 'artist' ? node.artist : context.type === 'label' ? node.label : null;
    const want = norm(context.name);
    return Boolean(field && want) && String(field).split(CREDITS).some((part) => norm(part) === want);
}

/**
 * The list's model from the Discover layer: { cards: [{ key, head, releases, entities }], note, canDig }.
 * `satellites` are the focus's own releases as the graph drew them; a ringed
 * release credited to the focus joins them.
 */
export function discoverModel({ nodes = [], satellites = [], context = null, anchors = [], line = null } = {}) {
    const seen = new Set();
    const unique = (list) => list.filter((n) => n && !seen.has(n.id) && seen.add(n.id));
    const ownKind = context?.type === 'artist' || context?.type === 'label';
    const own = ownKind ? unique([...satellites, ...nodes.filter((n) => isOwnRelease(n, context))]).sort(byScore).slice(0, LIST_MAX) : [];
    const rest = unique([...(ownKind ? [] : satellites), ...nodes]);
    const releases = rest.filter((n) => n.type === 'release').sort(byScore).slice(0, LIST_MAX);
    const entities = rest.filter((n) => n.type === 'artist' || n.type === 'label').sort(byScore).slice(0, LIST_MAX);
    const nearHead = context?.name ? `Near ${context.name}` : anchors.length ? 'Near your favorites' : '';
    const cards = [];
    if (own.length) cards.push({ key: 'own', head: `${context.type === 'label' ? 'On' : 'By'} ${context.name}`, releases: own, entities: [] });
    if (nearHead && (releases.length || entities.length || !own.length)) cards.push({ key: 'near', head: nearHead, releases, entities });
    // The graph's own line says why the list is short (loading, not connected, failed); never "nothing" on a failure.
    const empty = !own.length && !releases.length && !entities.length;
    const note = (line || []).map((p) => p.text).filter(Boolean).join(' · ') || (empty ? (anchors.length || context ? NOTHING_NEAR : 'Star an artist or label to start.') : '');
    return { cards, note, canDig: Boolean(context?.id && !context.outside) };
}

/** Every row the model lists, by id. */
export const modelRows = (model) => new Map((model?.cards || []).flatMap((c) => [...c.releases, ...c.entities]).map((n) => [n.id, n]));

/**
 * Where a Dig stands once a payload asked for after it is drawn: still
 * digging while a source loads; `{ found }` when every source finished
 * cleanly; null when a source is paused, failed or not connected (the note
 * says which, and nothing is claimed).
 */
export function digOutcome(dig, { askedAt = 0, line = null, ids = [] } = {}) {
    if (!dig || dig.found != null || !(askedAt > dig.at) || sourcesLoading(line)) return dig;
    if ((line || []).some((p) => p.text !== NOTHING_NEAR)) return null;
    return { ...dig, found: [...ids].filter((id) => !dig.before.has(id)).length };
}

function releaseRow(n, { discogs, playingKey }) {
    const r = releaseFromNode(n);
    const kind = VIEWER ? null : previewKind(r, { discogs });
    const sub = [r.artist, r.label, r.year].filter(Boolean).map(esc).join(' · ');
    const why = whyLine(n.reasons);
    const playing = playingKey === n.id;
    const art = r.cover ? `<img src="${esc(r.cover)}" alt="" loading="lazy">` : '';
    return `<li class="dx-row${playing ? ' is-playing' : ''}" data-dx="${esc(n.id)}" title="${esc(why)}">
        <span class="dx-art">${art}${kind ? `<button type="button" class="dx-play" data-dx-play aria-label="${playing ? 'Stop preview' : `Preview on ${kind === 'bandcamp' ? 'Bandcamp' : 'YouTube'}`}">${playing ? '❚❚' : '▶'}</button>` : ''}</span>
        <button type="button" class="dx-main" data-dx-open><span class="dx-t">${esc(r.title)}</span><span class="dx-s">${sub}</span></button>
        ${VIEWER ? '' : '<span class="dx-acts"><button type="button" class="nr-act" data-dx-shortlist>Shortlist</button><button type="button" class="nr-act" data-dx-dismiss aria-label="Dismiss" title="Dismiss">×</button></span>'}
        <div class="dx-video" data-dx-video></div>
    </li>`;
}

function entityRow(n) {
    const why = whyLine(n.reasons);
    return `<li class="dx-row" data-dx="${esc(n.id)}" title="${esc(why)}">
        <span class="dx-art${n.type === 'artist' ? ' round' : ''}"></span>
        <button type="button" class="dx-main" data-dx-open><span class="dx-t">${esc(n.name)}</span><span class="dx-s">${n.type === 'label' ? 'Label' : 'Artist'}${why ? ` · ${esc(why)}` : ''}</span></button>
        <span class="dx-acts"></span>
    </li>`;
}

function digHtml(dig) {
    if (VIEWER || visitorHides('discover')) return '';
    if (dig && dig.found == null) return '<button type="button" class="nr-act dx-dig" data-dx-dig disabled>Digging…</button>';
    const found = dig ? `<span class="dx-dug" role="status">${dig.found ? `${dig.found} new` : 'Nothing new'}</span>` : '';
    return `${found}<button type="button" class="nr-act dx-dig" data-dx-dig>Dig</button>`;
}

function cardHtml(card, i, model, opts) {
    const dig = i === 0 && model.canDig ? digHtml(opts.dig) : '';
    const releases = card.releases.length ? `<ul class="dx-list">${card.releases.map((n) => releaseRow(n, opts)).join('')}</ul>` : '';
    const entities = card.entities.length ? `${releases ? '<div class="dx-sep">Artists and labels</div>' : ''}<ul class="dx-list">${card.entities.map(entityRow).join('')}</ul>` : '';
    const note = i === model.cards.length - 1 && model.note ? `<p class="dx-note" role="status">${esc(model.note)}</p>` : '';
    return `<section class="dx-card" data-dx-card="${card.key}"><div class="dx-head"><b>${esc(card.head)}</b>${dig}</div>${releases}${entities}${note}</section>`;
}

/** `dig`: null, `{ found: null }` while digging, `{ found: n }` once answered. */
export function discoverListHtml(model, { discogs = false, playingKey = null, dig = null } = {}) {
    const opts = { discogs, playingKey, dig };
    const cards = model.cards.map((c, i) => cardHtml(c, i, model, opts)).join('');
    const note = !model.cards.length && model.note ? `<p class="dx-note" role="status">${esc(model.note)}</p>` : '';
    return `<div class="dx">${cards}${note}</div>`;
}

export default class DiscoverPanel {
    constructor({ app }) {
        this.app = app;
        this.view = null; this.byId = new Map();
        app.preview?.onChange(() => this._paint());
    }

    get pane() {
        if (!this._pane) {
            this._pane = this.app.rightSlot.paneFor('discover', { className: 'discover-pane' });
            this._pane.addEventListener('click', (e) => this._click(e));
        }
        return this._pane;
    }

    /** The graph's Discover layer changed: redraw the list. */
    update(view) {
        this.view = view;
        const layer = view?.layer;
        if (!layer) return this.clear();
        const line = layer.line();
        this.model = discoverModel({ nodes: layer.nodes, satellites: layer.outlineSatellites, context: layer.context, anchors: layer.anchors, line });
        this.byId = modelRows(this.model);
        if (this.dig && this.dig.id !== layer.context?.id) this.dig = null;
        this.dig = digOutcome(this.dig, { askedAt: view.layer?.askedAt, line, ids: this.byId.keys() });
        this.app.rightSlot?.unpark();
        this._paint();
    }

    clear() {
        this.view = null; this.model = null; this.byId = new Map(); this.dig = null;
        if (this._pane) this._pane.innerHTML = '';
        this.app.preview?.frame && this.app.preview.stop();
        this.app.rightSlot?.park();
    }

    _paint() {
        if (!this.model) return;
        // A playing YouTube embed lives in its row: keep the row while it plays.
        if (this.app.preview?.frame && this.pane.contains(this.app.preview.frame)) { this._mark(); return; }
        this.pane.innerHTML = discoverListHtml(this.model, { discogs: Boolean(this.app.backendServices?.discogs), playingKey: this.app.preview?.state?.key || null, dig: this.dig });
        this.pane.querySelectorAll('.dx-art img').forEach((img) => img.addEventListener('error', () => img.remove(), { once: true }));
    }

    _mark() {
        const key = this.app.preview?.state?.key || null;
        for (const row of this.pane.querySelectorAll('.dx-row')) row.classList.toggle('is-playing', row.dataset.dx === key);
    }

    /** Dig: "Digging…" until a payload asked for after the request is drawn (see digOutcome). */
    async _dig() {
        const view = this.view, id = view?.focus?.id;
        if (!id || !view.layer?.dig || (this.dig && this.dig.found == null)) return;
        this.dig = { id, before: new Set(this.byId.keys()), at: Infinity, found: null };
        this._paint();
        try {
            await view.layer.dig();
            if (this.dig?.id === id) this.dig.at = Date.now();
        } catch (err) {
            if (this.dig?.id === id) this.dig = null;
            this.app.showNotification?.(`Dig failed: ${err?.message || err}`, 'error');
            this._paint();
        }
    }

    async _click(e) {
        if (e.target.closest('[data-dx-dig]')) return this._dig();
        const row = e.target.closest('[data-dx]');
        const node = row && this.byId.get(row.dataset.dx);
        if (!node) return;
        const release = node.type === 'release' ? normaliseRelease(releaseFromNode(node)) : null;
        if (e.target.closest('[data-dx-play]')) {
            const preview = this.app.preview;
            if (preview?.isPlaying(node.id) && preview.state.kind === 'youtube') return preview.stop();
            return preview?.play(release, { key: node.id, host: row.querySelector('[data-dx-video]') });
        }
        if (e.target.closest('[data-dx-shortlist]')) {
            const btn = e.target.closest('button');
            btn.disabled = true;
            try { await addShortlistItem(this.app, shortlistItemFromRelease(release, 'discover-panel')); btn.textContent = 'On Shortlist'; window.dispatchEvent(new CustomEvent(RELEASES_CHANGED)); }
            catch (err) { btn.disabled = false; this.app.showNotification?.(`Shortlist not saved: ${err?.message || err}`, 'error'); }
            return;
        }
        if (e.target.closest('[data-dx-dismiss]')) {
            if (!release?.dismissKeys.length) return;
            try {
                await this.app.integrationManager.database.dismissReleases(release.dismissKeys);
                row.remove();
                window.dispatchEvent(new CustomEvent(RELEASES_CHANGED, { detail: { dismissed: release.dismissKeys } }));
            } catch (err) { this.app.showNotification?.(`Not dismissed: ${err?.message || err}`, 'error'); }
            return;
        }
        if (e.target.closest('[data-dx-open]')) {
            if (node.type === 'release') return this.view?.layer.open(node);
            return this.view?.layer?.walkTo(node);
        }
    }
}
