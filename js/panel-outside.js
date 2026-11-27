// The detail panel for an artist or label you don't own, from a Discover graph
// node: type, name and "Not in your library"; why it is near the focus, with
// sources; its latest 12 releases newest first, each with Shortlist, a row
// opening that release; relations chips; links out to Discogs, Bandcamp,
// Beatport and YouTube. No ★ and no page: Open on Discogs is its page.
//
// Payload: { node, context, via } — an outside node from /api/atlas (id, type, name,
// discogsId, reasons), the focus or anchor it sits near, and for an outside
// focus the step it was reached from ("Via DDS"). Reads the Discogs
// cache only (discogs_releases, entity_relations); it never asks Discogs.
import { siteLinks, siteRowHtml } from './site-links.js';
import { registerPanelView, reasonText, externalLinks } from './detail-panel.js';
import { dbGet } from './db-client.js';
import { reasonWords } from './graph/reason-words.js';
import { shortlistItemFromRelease, addShortlistItem, RELEASES_CHANGED } from './shortlist.js';
import { entityId } from './credits-graph.js';
import { cachedRelease, discogsName } from './discogs-section.js';
import { escapeHtml as esc } from './html.js';

export const OUTSIDE_RELEASES = 12;
const EYEBROW = { artist: 'Artist', label: 'Label' };
const isMain = (role) => !role || /^main$/i.test(String(role));

/** Its latest releases, newest first, one per title: an artist's own (main role), a label's all. */
export function outsideReleases(row, { type = 'artist', name = '', limit = OUTSIDE_RELEASES } = {}) {
    const seen = new Set(), out = [];
    const list = (Array.isArray(row?.releases) ? row.releases : []).filter((e) => e?.title && (type !== 'artist' || isMain(e.role)));
    for (const e of [...list].sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0))) {
        const key = String(e.title).toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(cachedRelease(e, { type, name }));
        if (out.length >= limit) break;
    }
    return out;
}

/** Relations as chips: { name, kind, local } — `local` is the library entity id when it is in your library. */
export function outsideRelations(row, isOwned = () => false) {
    const rel = row?.relations || {}, type = row?.type === 'label' ? 'label' : 'artist';
    const lists = type === 'artist'
        ? [['alias', rel.aliases], ['member', rel.members], ['group', rel.groups]]
        : [['sublabel', rel.sublabels], ['parent', rel.parentLabel ? [rel.parentLabel] : []]];
    const out = [];
    for (const [kind, list] of lists) {
        for (const x of Array.isArray(list) ? list : []) {
            if (!x?.name) continue;
            const name = discogsName(x.name), id = entityId(type, name);
            out.push({ name, kind, local: id && isOwned(id) ? id : null });
        }
    }
    return out;
}

export function outsidePanelHtml({ node, context = null, via = null, releases = null, relations = [], listed = new Set() }) {
    const why = (node.reasons || []).filter((r) => reasonWords(r));
    const reasons = why.length && context ? `<section class="dp-section dp-why"><h4>Why near ${esc(context.name)}</h4><ul>${why.map((r) => `<li>${reasonText(r)}</li>`).join('')}</ul></section>` : '';
    const row = (r) => {
        const id = shortlistItemFromRelease(r, '')?.id, on = listed.has(String(id));
        const meta = [r.year, node.type === 'label' ? r.artist : r.label].filter(Boolean).map(esc).join(' · ');
        return `<li class="op-release" data-op-release="${esc(r.key)}" tabindex="0" role="button"><span class="op-title">${esc(r.title)}</span><span class="op-meta">${meta}</span>
            <button type="button" class="nr-act" data-op-shortlist="${esc(r.key)}"${on ? ' disabled' : ''}>${on ? 'On Shortlist' : 'Shortlist'}</button></li>`;
    };
    const list = releases === null ? '<div class="dp-note">Releases not loaded yet</div>'
        : releases.length ? `<ol class="op-releases">${releases.map(row).join('')}</ol>` : '<div class="dp-note">No releases</div>';
    const chips = relations.length ? `<section class="dp-section"><h4>Relations</h4><div class="dp-chips">${relations.map((c) => (c.local
        ? `<button type="button" class="dp-chip" data-op-local="${esc(c.local)}">${esc(c.name)} <span class="dp-chip-type">· ${esc(c.kind)}</span></button>`
        : `<span class="dp-chip is-static">${esc(c.name)} <span class="dp-chip-type">· ${esc(c.kind)}</span></span>`)).join('')}</div></section>` : '';
    const links = externalLinks({ type: node.type, name: node.name }, { discogsRef: node.discogsId ? { type: node.type, id: node.discogsId } : null });
    const [discogs] = links;
    return `<div class="dp-head"><div class="dp-eyebrow">${EYEBROW[node.type] || ''}</div></div>
        <div class="dp-body">
            <h3 class="dp-name">${esc(node.name)}</h3><div class="dp-meta">Not in your library${via ? ` · Via ${esc(via)}` : ''}</div>
            <div class="dp-actions"><a class="dp-btn is-primary" href="${esc(discogs.href)}" target="_blank" rel="noopener">Open on Discogs</a></div>
            ${reasons}
            <section class="dp-section"><h4>Latest releases</h4>${list}</section>
            ${chips}
            ${siteRowHtml(siteLinks({ type: node.type, name: node.name, discogs: node.discogsId ? { type: node.type, id: node.discogsId } : null }))}
        </div>`;
}

registerPanelView('outside', {
    async render(host, { node, context = null, via = null }, { panel, app, live, opts: { focus = true, onFocusEntity = null, onRelease = null } = {} }) {
        panel.current = { type: node.type, id: node.id, name: node.name };
        const db = app.integrationManager?.database;
        const ref = node.discogsId ? `discogs:${node.type}:${node.discogsId}` : null;
        const [discography, relationsRow, items] = await Promise.all([
            ref ? dbGet('discogs_releases', ref).catch(() => null) : null,
            ref ? dbGet('entity_relations', ref).catch(() => null) : null,
            db?.listShortlist?.().catch(() => []) ?? [],
        ]);
        if (!live()) return;
        const releases = discography ? outsideReleases(discography, { type: node.type, name: node.name }) : null;
        const owned = (id) => Boolean(app._atlasView?.atlas?.byId.has(id));
        host.innerHTML = outsidePanelHtml({ node, context, via, releases, relations: outsideRelations(relationsRow, owned), listed: new Set((items || []).map((i) => String(i.id))) });
        const byKey = new Map((releases || []).map((r) => [r.key, r]));
        const openRelease = (key) => { const r = byKey.get(key); if (!r) return; if (onRelease) onRelease(r); else panel.show('release', { release: r }, { focus: false }); };
        host.querySelectorAll('[data-op-release]').forEach((li) => {
            li.addEventListener('click', (e) => { if (!e.target.closest('[data-op-shortlist]')) openRelease(li.dataset.opRelease); });
            li.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.target.closest('[data-op-shortlist]')) openRelease(li.dataset.opRelease); });
        });
        host.querySelectorAll('[data-op-shortlist]').forEach((btn) => btn.addEventListener('click', async () => {
            const r = byKey.get(btn.dataset.opShortlist);
            if (!r) return;
            btn.disabled = true;
            try { await addShortlistItem(app, shortlistItemFromRelease(r, 'discover-graph')); btn.textContent = 'On Shortlist'; window.dispatchEvent(new CustomEvent(RELEASES_CHANGED)); }
            catch (err) { btn.disabled = false; app.showNotification?.(`Shortlist not saved: ${err?.message || err}`, 'error'); }
        }));
        host.querySelectorAll('[data-op-local]').forEach((btn) => btn.addEventListener('click', () => onFocusEntity?.({ id: btn.dataset.opLocal })));
        if (focus && live()) host.querySelector('button')?.focus();
    },
});
