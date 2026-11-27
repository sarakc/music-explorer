// The Links row on artist and label pages: one chip each for Discogs, Bandcamp
// and (artists) Spotify, showing linked, suggested or none. A chip opens a small
// editor: open the page, Confirm a suggestion, Change (paste a link; Discogs also
// lists its candidates), Remove. Reads and writes through /api/links.

import { entityId } from './credits-graph.js';
import { escapeHtml as esc } from './html.js';
import { VIEWER } from './viewer-profile.js';

export const LINK_KINDS_FOR = { artist: ['discogs', 'bandcamp', 'spotify'], label: ['discogs', 'bandcamp'] };
const KIND_WORD = { discogs: 'Discogs', bandcamp: 'Bandcamp', spotify: 'Spotify' };
const STATE_WORD = { linked: 'Linked', suggested: 'Suggested', none: 'Not linked' };
const PASTE = { discogs: 'Paste a Discogs link', bandcamp: 'Paste a Bandcamp page', spotify: 'Paste a Spotify artist link' };

/** The empty row the page header carries until the links load. */
export const linksRowHtml = (type) => (LINK_KINDS_FOR[type] ? '<div class="op-links" data-op-links hidden></div>' : '');

const stateLine = (view) => [STATE_WORD[view?.state] || STATE_WORD.none, view?.words].filter(Boolean).join(' · ');

export function chipHtml(kind, view) {
    const state = view?.state || 'none';
    return `<button type="button" class="op-link-chip is-${state}" data-link-kind="${kind}" aria-haspopup="dialog" aria-expanded="false" title="${esc(`${KIND_WORD[kind]}: ${stateLine(view).toLowerCase()}`)}">`
        + `<span class="op-link-dot" aria-hidden="true"></span>${KIND_WORD[kind]}</button>`;
}

export function rowHtml(data, { viewer = VIEWER } = {}) {
    return (LINK_KINDS_FOR[data?.type] || []).map((kind) => {
        const view = data.links?.[kind];
        if (!viewer) return chipHtml(kind, view);
        return view?.url
            ? `<a class="op-link-chip is-${esc(view.state || 'none')}" href="${esc(view.url)}" target="_blank" rel="noopener noreferrer"><span class="op-link-dot" aria-hidden="true"></span>${KIND_WORD[kind]}</a>`
            : `<span class="op-link-chip is-none"><span class="op-link-dot" aria-hidden="true"></span>${KIND_WORD[kind]}</span>`;
    }).join('');
}

const canConfirm = (kind, view) => view?.state === 'suggested' && (kind !== 'discogs' || view.candidates?.length === 1);

function candidatesHtml(type, view) {
    const list = view?.candidates || [];
    if (!list.length) return '';
    return `<ul class="op-link-candidates">${list.map((c) => `<li>
        <button type="button" class="btn btn-sm btn-secondary" data-link-pick="${esc(c.id)}" data-link-name="${esc(c.name)}"${view.state === 'linked' && view.id === c.id ? ' aria-current="true"' : ''}>${esc(c.name || c.id)}</button>
        <a href="https://www.discogs.com/${type}/${esc(c.id)}" target="_blank" rel="noopener noreferrer" class="op-link-open" aria-label="Open on Discogs">↗</a></li>`).join('')}</ul>`;
}

export function editorHtml(kind, view, type) {
    const state = view?.state || 'none';
    const open = state === 'none';
    const actions = [
        canConfirm(kind, view) ? '<button type="button" class="btn btn-sm" data-link-action="confirm">Confirm</button>' : '',
        state !== 'none' ? '<button type="button" class="btn btn-sm btn-secondary" data-link-action="change">Change</button>' : '',
        state !== 'none' ? '<button type="button" class="btn btn-sm btn-secondary" data-link-action="remove">Remove</button>' : '',
    ].join('');
    const label = view?.label || view?.name || (view?.url || '').replace(/^https?:\/\//, '');
    return `<div class="op-link-editor" role="dialog" aria-label="${KIND_WORD[kind]} link" data-link-editor="${kind}">
        <p class="op-link-head"><strong>${KIND_WORD[kind]}</strong> <span class="muted">${esc(stateLine(view))}</span></p>
        ${view?.url ? `<a class="op-link-url" href="${esc(view.url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : ''}
        ${actions ? `<div class="op-link-actions">${actions}</div>` : ''}
        <div class="op-link-change" data-link-change${open ? '' : ' hidden'}>
            ${kind === 'discogs' ? candidatesHtml(type, view) : ''}
            <form class="op-link-form" data-link-form>
                <input type="text" class="op-link-input" placeholder="${PASTE[kind]}" aria-label="${PASTE[kind]}" autocomplete="off" spellcheck="false">
                <button type="submit" class="btn btn-sm">Save</button>
            </form>
        </div>
        <p class="op-link-error" data-link-error hidden></p>
    </div>`;
}

async function defaultFetchJson(url, opts = {}) {
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
}

/**
 * Load and draw the row into `host` ([data-op-links]) and wire its editor.
 * Stays hidden when the links can't be read.
 */
export async function mountLinksRow(host, { type, name }, { fetchJson = defaultFetchJson, doc = globalThis.document } = {}) {
    const id = entityId(type, name);
    if (!host || !id || !LINK_KINDS_FOR[type]) return null;
    const base = `/api/links/${encodeURIComponent(id)}`;
    let data;
    try { data = await fetchJson(base); } catch (_) { return null; }
    if (!host.isConnected && host.isConnected !== undefined) return null;
    let openKind = null;

    const close = () => {
        host.querySelector('[data-link-editor]')?.remove();
        host.querySelectorAll('[data-link-kind]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
        openKind = null;
        doc?.removeEventListener?.('keydown', onKey);
        doc?.removeEventListener?.('click', onOutside, true);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation?.(); close(); } };
    const onOutside = (e) => { if (!host.contains(e.target)) close(); };

    const paint = () => {
        host.innerHTML = rowHtml(data);
        host.hidden = false;
    };

    if (VIEWER) {
        paint();
        return { get data() { return data; }, close() {} };
    }

    const write = async (kind, body) => {
        const err = host.querySelector('[data-link-error]');
        try {
            data = await fetchJson(`${base}/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
            close();
            paint();
        } catch (e) {
            if (err) { err.textContent = e.message || String(e); err.hidden = false; }
        }
    };

    function openEditor(kind) {
        close();
        openKind = kind;
        const chip = host.querySelector(`[data-link-kind="${kind}"]`);
        chip?.setAttribute('aria-expanded', 'true');
        host.insertAdjacentHTML('beforeend', editorHtml(kind, data.links[kind], type));
        const ed = host.querySelector('[data-link-editor]');
        ed.addEventListener('click', (e) => {
            const action = e.target.closest?.('[data-link-action]')?.dataset.linkAction;
            const pick = e.target.closest?.('[data-link-pick]');
            if (action === 'change') { const box = ed.querySelector('[data-link-change]'); box.hidden = !box.hidden; if (!box.hidden) ed.querySelector('input')?.focus?.(); }
            else if (action) write(kind, { action });
            else if (pick) write(kind, { action: 'set', id: pick.dataset.linkPick, name: pick.dataset.linkName });
        });
        ed.querySelector('[data-link-form]').addEventListener('submit', (e) => {
            e.preventDefault();
            const value = ed.querySelector('input').value.trim();
            if (value) write(kind, { action: 'set', value });
        });
        doc?.addEventListener?.('keydown', onKey);
        doc?.addEventListener?.('click', onOutside, true);
        if (data.links[kind]?.state === 'none') ed.querySelector('input')?.focus?.();
    }

    host.addEventListener('click', (e) => {
        const chip = e.target.closest?.('[data-link-kind]');
        if (!chip) return;
        const kind = chip.dataset.linkKind;
        if (openKind === kind) close(); else openEditor(kind);
    });
    paint();
    return { get data() { return data; }, close };
}

/** New Releases' Unlinked line: "18 artists and labels have no Bandcamp link · Review" (nothing when none). */
export function unlinkedLineHtml(summary) {
    const count = Number(summary?.missingBandcamp) || 0;
    if (count <= 0) return '';
    const who = count === 1 ? '1 artist or label has' : `${count.toLocaleString('en-US')} artists and labels have`;
    return `<p class="nr-unlinked muted">${who} no Bandcamp link · <a href="#/artists?links=missing">Review</a></p>`;
}

/** Fill `host` with the Unlinked line from GET /api/links/summary; stays empty when it can't be read. */
export async function mountUnlinkedLine(host, { fetchJson = defaultFetchJson } = {}) {
    if (!host) return;
    try { host.innerHTML = unlinkedLineHtml(await fetchJson('/api/links/summary')); } catch (_) { host.innerHTML = ''; }
}
