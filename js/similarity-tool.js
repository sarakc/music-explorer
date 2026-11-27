// Tools › Similarity: the dev-only view that explains and tunes the
// similarity engine. Plain and functional by design; no main-interface
// control reads or writes the engine config.
import { escapeHtml as esc } from './html.js';
const pct = (x) => `${Math.round((x || 0) * 100)}%`;
const num = (x, d = 3) => (x == null ? '—' : Number(x).toFixed(d).replace(/\.?0+$/, '') || '0');
// The engine's number settings shown under Weights, when the server's config has them.
// A dotted key (`groupCaps.time`) is one entry of a nested setting.
const NUMBER_SETTINGS = ['minScore', 'priorWeight', 'groupCaps.wikipedia', 'groupCaps.time'];
const STEP = { minScore: 0.01, priorWeight: 0.5, 'groupCaps.wikipedia': 0.25, 'groupCaps.time': 0.25 };
const getPath = (obj, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const setPath = (obj, key, v) => { const ks = key.split('.'), last = ks.pop(); let o = obj; for (const k of ks) o = (o[k] ||= {}); o[last] = v; };
const sameList = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

/**
 * The partial override that turns `defaults` into `edited` (only what differs), on top of
 * the `saved` override's settings the form does not show (playlist lists, aliases…). A saved
 * weight for a signal that no longer exists is dropped.
 */
export function overridesFrom(defaults, edited, saved = {}) {
  const out = structuredClone(saved || {});
  delete out.wikiCap;
  out.weights = {};
  for (const [k, v] of Object.entries(edited.weights || {})) if (defaults.weights[k] !== v) out.weights[k] = v;
  for (const k of NUMBER_SETTINGS) {
    const v = getPath(edited, k);
    if (v === undefined) continue;
    if (v !== getPath(defaults, k)) setPath(out, k, v);
    else { const [head, leaf] = k.split('.'); if (leaf) { if (out[head]) delete out[head][leaf]; } else delete out[k]; }
  }
  if (!sameList(edited.excludedTags || [], defaults.excludedTags || [])) out.excludedTags = [...edited.excludedTags];
  else delete out.excludedTags;
  if (!sameList(edited.neverSplitArtists || [], defaults.neverSplitArtists || [])) out.neverSplitArtists = [...edited.neverSplitArtists];
  else delete out.neverSplitArtists;
  for (const k of Object.keys(out)) if (out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) && !Object.keys(out[k]).length) delete out[k];
  return out;
}

function detailText(detail) {
  if (!detail) return '';
  return Object.entries(detail).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ');
}

function statusText(status) {
  if (!status) return '';
  const r = status.lastRun;
  const last = !r ? 'No run yet' : r.error ? `Last run failed: ${r.error}`
    : `Last run ${new Date(r.finished_at).toLocaleString()} · ${r.entities} entities · ${r.pairs} pairs · ${Math.round((r.finished_at - r.started_at) / 1000)}s`;
  const progress = status.state === 'running' && status.progress?.total ? ` · ${status.progress.done} of ${status.progress.total}` : '';
  return `${status.state}${progress} · ${last}`;
}

// A curation group's classifier state in words (honest similarity spec 1.4).
export function groupStateText(g, nameOf = (id) => id) {
  const d = g.detail || {};
  switch (g.state) {
    case 'counted': return 'counted';
    case 'restates': return `restates ${d.field}: ${typeof d.value === 'number' ? `${Math.round(d.value)} BPM` : d.value}`;
    case 'month': return 'month name';
    case 'folder': return d.by === 'setting' ? 'excluded in settings' : 'folder excluded';
    case 'duplicate': return `duplicate of ${nameOf(d.of)}`;
    case 'size': return (d.size ?? g.size) < 2 ? 'too small' : 'too big';
    default: return g.state;
  }
}
const GROUP_STATES = ['counted', 'restates', 'month', 'folder', 'duplicate', 'size'];

// Where the playlist lists are set: the form doesn't edit them.
function listsLocator(at) {
  if (!at?.db || !at.key) return '';
  return `<p class="muted" data-lists-locator>Change <code>includedPlaylists</code>, <code>excludedPlaylists</code> in <code>${esc(at.table)} › ${esc(at.key)}</code>, <code>${esc(at.db)}</code></p>`;
}

function historyText(h) {
  if (!h) return '';
  const last = h.at ? `${new Date(h.at).toLocaleDateString()} · ${h.sessions} sessions · ${h.matched} matched` : 'Not imported yet';
  return [last, h.error ? `Last import failed: ${h.error}` : '', h.disabled ? `Cannot run: ${h.disabled}` : ''].filter(Boolean).join(' · ');
}

export async function renderSimilarityTool(container, { fetchJson, poll = true } = {}) {
  const get = (path) => fetchJson(`/api/similarity/${path}`);
  const send = (path, method, body) => fetchJson(`/api/similarity/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  let [cfg, status, stats, groupsOut, history, splits] = await Promise.all([get('config'), get('status'), get('stats').catch(() => ({ coverage: {}, topTags: [] })),
    get('groups').catch(() => ({ groups: [] })), fetchJson('/api/rekordbox-history/status').catch(() => null), get('splits').catch(() => null)]);
  const groups = groupsOut?.groups || [];
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const rbGroups = groups.filter((g) => g.origin === 'rekordbox');

  const signals = Object.keys(cfg.defaults.weights);
  container.innerHTML = `
    <div class="similarity-tool">
      <section><h3>Why</h3>
        <div class="similarity-why">
          <input type="search" list="similarityEntities" data-pick="a" placeholder="A" autocomplete="off">
          <input type="search" list="similarityEntities" data-pick="b" placeholder="B" autocomplete="off">
          <datalist id="similarityEntities"></datalist>
          <button type="button" class="btn btn-sm" data-action="why">Why</button>
        </div>
        <div data-why-result></div>
      </section>
      <section><h3>Weights</h3>
        <table class="similarity-table"><tbody>
          ${signals.map((s) => `<tr><td>${esc(s)}</td><td><input type="number" step="0.25" min="0" data-weight="${esc(s)}" value="${esc(cfg.config.weights[s])}"></td><td class="muted">${pct(stats.coverage?.[s])}</td></tr>`).join('')}
          ${NUMBER_SETTINGS.filter((k) => getPath(cfg.defaults, k) !== undefined).map((k) => `<tr><td>${k}</td><td><input type="number" step="${STEP[k]}" min="0" data-setting="${k}" value="${esc(getPath(cfg.config, k))}"></td><td></td></tr>`).join('')}
          <tr><td>excluded tags</td><td colspan="2"><input type="text" data-setting="excludedTags" value="${esc(cfg.config.excludedTags.join(', '))}"></td></tr>
        </tbody></table>
        <p class="muted">Third column: coverage, the share of entities each signal has data for.</p>
        <button type="button" class="btn btn-sm" data-action="save">Save</button> <span data-save-status role="status"></span>
      </section>
      <section><h3>Top tags</h3>
        <ul class="similarity-tags">${(stats.topTags || []).map((t) => `<li><label><input type="checkbox" data-exclude="${esc(t.name)}"${t.excluded ? ' checked' : ''}> ${esc(t.name)} <span class="muted">${t.tracks}</span></label></li>`).join('')}</ul>
      </section>
      <section data-groups><h3>Lists</h3>
        ${rbGroups.length ? `<select data-group-filter aria-label="State"><option value="">All states</option>${GROUP_STATES.map((st) => `<option value="${st}">${st}</option>`).join('')}</select>
        <table class="similarity-table"><tbody>
          ${rbGroups.map((g) => `<tr data-group="${esc(g.id)}" data-state="${esc(g.state)}"><td>${esc([...g.folder, g.name].join(' › '))}</td><td>${esc(groupStateText(g, (id) => groupName.get(id) ?? id))}</td><td class="muted">${g.size}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">No lists yet: they appear after a run reads Rekordbox.</p>'}
        ${listsLocator(cfg.overridesAt)}
        <p data-history><strong>Rekordbox DJ history</strong> · <span data-history-text>${esc(historyText(history))}</span>
          <button type="button" class="btn btn-sm" data-action="import-history">Import now</button></p>
      </section>
      <section data-artist-splits><h3>Artists</h3>
        <p><strong>Never split</strong></p>
        <textarea rows="4" data-setting="neverSplitArtists" aria-label="Never split">${esc((cfg.config.neverSplitArtists || []).join('\n'))}</textarea>
        <p><strong>Newly split</strong></p>
        <table class="similarity-table" data-newly-split><tbody>
          ${(splits?.newlySplit || []).map((x) => `<tr><td>${esc(x.credit)}</td> <td>→ ${esc(x.parts.join(' · '))}</td> <td class="muted">(${x.tracks})</td></tr>`).join('')}
        </tbody></table>
      </section>
      <section><h3>Status</h3>
        <p data-status>${esc(statusText(status))}</p>
        <button type="button" class="btn btn-sm" data-action="rebuild">Rebuild</button>
      </section>
    </div>`;
  const $ = (sel) => container.querySelector(sel);
  const picked = { a: null, b: null };
  const options = new Map();

  const edited = () => ({
    weights: Object.fromEntries([...container.querySelectorAll('[data-weight]')].map((el) => [el.dataset.weight, Number(el.value)])),
    ...NUMBER_SETTINGS.filter((k) => $(`[data-setting="${k}"]`)).reduce((o, k) => { setPath(o, k, Number($(`[data-setting="${k}"]`).value)); return o; }, {}),
    excludedTags: $('[data-setting="excludedTags"]').value.split(',').map((t) => t.trim()).filter(Boolean),
    neverSplitArtists: $('[data-setting="neverSplitArtists"]').value.split('\n').map((t) => t.trim()).filter(Boolean),
  });
  const refreshStatus = async () => { status = await get('status'); const el = $('[data-status]'); if (el) el.textContent = statusText(status); return status; };
  let timer = null;
  const watch = () => {
    if (!poll || timer) return;
    timer = setInterval(async () => {
      if (!container.isConnected) { clearInterval(timer); timer = null; return; }
      const s = await refreshStatus().catch(() => null);
      if (s && s.state === 'idle') { clearInterval(timer); timer = null; }
    }, 2000);
  };

  async function save() {
    const body = overridesFrom(cfg.defaults, edited(), cfg.overrides);
    const out = await send('config', 'PUT', body);
    const el = $('[data-save-status]');
    if (out?.error) { if (el) el.textContent = out.error; return out; }
    cfg = { ...cfg, config: out.config, overrides: body, configHash: out.configHash };
    if (el) el.textContent = 'Saved · rebuilding';
    await refreshStatus(); watch();
    return out;
  }

  async function lookup(input) {
    const q = input.value.trim();
    if (q.length < 2) return;
    const hits = await get(`entities?q=${encodeURIComponent(q)}&limit=20`);
    for (const h of hits) options.set(`${h.name} (${h.type})`, h.id);
    $('#similarityEntities').innerHTML = hits.map((h) => `<option value="${esc(`${h.name} (${h.type})`)}"></option>`).join('');
  }
  const resolvePick = (input) => options.get(input.value) || (input.value.includes(':') ? input.value.trim() : null);

  async function why() {
    picked.a = resolvePick($('[data-pick="a"]')); picked.b = resolvePick($('[data-pick="b"]'));
    const out = $('[data-why-result]');
    if (!picked.a || !picked.b) { out.textContent = 'Pick two entities.'; return; }
    const r = await get(`why?a=${encodeURIComponent(picked.a)}&b=${encodeURIComponent(picked.b)}`);
    if (!r?.breakdown) { out.textContent = r?.error || 'Not found.'; return; }
    out.innerHTML = `<p>${esc(r.a.name)} · ${esc(r.b.name)}: <strong>${num(r.score)}</strong></p>
      <table class="similarity-table"><thead><tr><th>Signal</th><th>Weight</th><th>Covered</th><th>Score</th><th>Baseline</th><th>Lift</th><th>Detail</th></tr></thead><tbody>
      ${r.breakdown.map((x) => `<tr${x.covered ? '' : ' class="muted"'}><td>${esc(x.signal)}</td><td>${num(x.w, 2)}</td><td>${x.covered ? 'yes' : 'no'}</td><td>${x.covered ? num(x.s) : '—'}</td><td>${x.covered ? num(x.baseline) : '—'}</td><td>${x.covered ? num(x.lift) : '—'}</td><td>${esc(detailText(x.detail))}</td></tr>`).join('')}
      </tbody></table>`;
  }

  function filterGroups(want = $('[data-group-filter]')?.value || '') {
    for (const tr of container.querySelectorAll('[data-group]')) tr.hidden = Boolean(want) && tr.dataset.state !== want;
  }
  async function importHistory() {
    const el = $('[data-history-text]');
    if (el) el.textContent = 'Importing…';
    const out = await fetchJson('/api/rekordbox-history/import', { method: 'POST' }).catch((err) => ({ error: err.message }));
    history = out?.error && !out.at ? { ...(out.status || history || {}), error: out.error } : out;
    if (el) el.textContent = historyText(history);
    return history;
  }

  container.addEventListener('click', (e) => {
    const action = e.target.closest?.('[data-action]')?.dataset.action;
    if (action === 'import-history') importHistory();
    else if (action === 'save') save();
    else if (action === 'why') why();
    else if (action === 'rebuild') send('rebuild', 'POST').then(() => { refreshStatus(); watch(); });
  });
  container.addEventListener('input', (e) => { if (e.target.dataset?.pick) lookup(e.target); });
  container.addEventListener('change', (e) => {
    if (e.target.dataset?.groupFilter !== undefined) { filterGroups(); return; }
    const tag = e.target.dataset?.exclude;
    if (tag == null) return;
    const field = $('[data-setting="excludedTags"]');
    const list = field.value.split(',').map((t) => t.trim()).filter(Boolean).filter((t) => t !== tag);
    if (e.target.checked) list.push(tag);
    field.value = list.join(', ');
    save();
  });
  if (status.state !== 'idle') watch();
  container.__similarity = { save, why, refreshStatus, filterGroups, importHistory };
}
