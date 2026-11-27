import { escapeHtml } from './html.js';

const route = (type, value, artist = '') => {
  const base = `#/${type}/${encodeURIComponent(String(value ?? ''))}`;
  return type === 'album' && artist ? `${base}?artist=${encodeURIComponent(artist)}` : base;
};

export function reasonLabel(reason) {
  if (!reason) return '';
  if (reason.field === 'bpm') return `${reason.value} BPM`;
  if (reason.field === 'year') return String(reason.value);
  return `${reason.field}: ${reason.value}`;
}

export function planChips(plan) {
  if (!plan) return [];
  const chips = [];
  for (const [field, values] of Object.entries(plan.include || {})) {
    for (const value of values || []) chips.push({ tone: 'include', label: field === 'terms' ? value : `${field.slice(0, -1)}: ${value}` });
  }
  const categorizedExclusions = new Set(Object.entries(plan.exclude || {})
    .filter(([field]) => field !== 'terms').flatMap(([, values]) => values || []).map((value) => String(value).toLocaleLowerCase()));
  for (const [field, values] of Object.entries(plan.exclude || {})) {
    for (const value of values || []) {
      if (field === 'terms' && categorizedExclusions.has(String(value).toLocaleLowerCase())) continue;
      chips.push({ tone: 'exclude', label: `not ${field === 'terms' ? value : `${field.slice(0, -1)}: ${value}`}` });
    }
  }
  const range = (label, value) => {
    if (value?.min == null && value?.max == null) return;
    chips.push({ tone: 'range', label: `${label} ${value.min ?? '…'}–${value.max ?? '…'}` });
  };
  range('BPM', plan.bpm); range('Year', plan.year);
  for (const value of plan.unparsed || []) chips.push({ tone: 'unparsed', label: `Couldn’t map: ${value}` });
  return chips;
}

async function api(path, body, { signal } = {}) {
  const response = await fetch(`/api/listen/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal,
  });
  let data = {};
  try { data = await response.json(); } catch { /* shaped below */ }
  if (!response.ok) {
    const error = new Error(data.error || `Listening assistant failed (${response.status}).`);
    error.code = data.code || 'EHTTP';
    throw error;
  }
  return data;
}

function reasonChips(reasons) {
  return (reasons || []).map((reason) => `<span class="listen-evidence">${escapeHtml(reasonLabel(reason))}</span>`).join('');
}

const FACETS = ['artists', 'labels', 'genres', 'tags'];
const bounded = (range) => range?.min != null || range?.max != null;

function yearsInRange(range, tracks) {
  if (!bounded(range)) return [];
  const min = range.min ?? null, max = range.max ?? null;
  const years = new Set();
  for (const track of tracks || []) {
    const year = Number(track?.year);
    if (Number.isInteger(year) && year > 0 && (min == null || year >= min) && (max == null || year <= max)) years.add(year);
  }
  // No library loaded yet: a closed range still names its own years.
  if (!tracks?.length && min != null && max != null) for (let year = min; year <= max; year += 1) years.add(year);
  return [...years].sort((a, b) => a - b).map(String);
}

/** The parts of a plan the table filter can hold: include facets, the BPM range
 *  and the year range (`year`, when a library year falls inside it). Exclusions, terms and
 *  unmapped text have no flat-filter form; they stay in the sheet as plan chips. */
export function planFilterParts(plan, tracks = []) {
  const facets = {};
  for (const field of FACETS) {
    const values = [...new Set((plan?.include?.[field] || []).map(String).filter(Boolean))];
    if (values.length) facets[field] = values;
  }
  const years = yearsInRange(plan?.year, tracks);
  // One range, its open ends closed on the library's years inside it; none when no year falls in it.
  const year = years.length ? { min: plan.year.min ?? Number(years[0]), max: plan.year.max ?? Number(years.at(-1)) } : null;
  const bpm = bounded(plan?.bpm) ? { min: plan.bpm.min ?? null, max: plan.bpm.max ?? null } : null;
  return { facets, bpm, year };
}

export function resultsHtml(data) {
  const chips = planChips(data.plan).map((chip) => `<span class="listen-plan-chip is-${chip.tone}">${escapeHtml(chip.label)}</span>`).join('');
  const trackRows = (data.tracks || []).map((track) => {
    const facts = [track.album, track.bpm ? `${track.bpm} BPM` : '', track.year || ''].filter(Boolean).join(' · ');
    return `<li class="listen-track" data-listen-track-id="${escapeHtml(track.id)}">
      <button type="button" class="listen-play local-play-trigger" data-local-play-id="${escapeHtml(track.id)}" aria-label="Play ${escapeHtml(track.title || 'track')}" title="Play">
        <span class="local-play-glyph" aria-hidden="true">▶</span>
      </button>
      <span class="listen-track-copy">
        <a class="listen-track-title" href="${route('track', track.id)}">${escapeHtml(track.title || 'Untitled')}</a>
        <span class="listen-track-artist"><a href="${route('artist', track.artist)}">${escapeHtml(track.artist || 'Unknown artist')}</a>${facts ? ` · ${escapeHtml(facts)}` : ''}</span>
        <span class="listen-track-evidence">${reasonChips(track.match?.reasons)}</span>
      </span>
    </li>`;
  }).join('');
  return `<section class="listen-results" aria-live="polite">
    ${data.plan?.summary ? `<h2 class="listen-summary">${escapeHtml(data.plan.summary)}</h2>` : ''}
    ${chips ? `<div class="listen-plan" aria-label="Interpreted request">${chips}</div>` : ''}
    <ol class="listen-track-list">${trackRows}</ol>
    <div class="listen-results-foot"><button type="button" class="btn btn-sm listen-show" data-listen-show>Show in table</button></div>
  </section>`;
}

/** Listen: a sheet under the search field. It is built once and only hides, so
 *  the last request and its results are still there when it opens again. */
export default class ListenView {
  constructor({ app }) {
    this.app = app;
    this.mode = 'simple';
    this.questions = [];
    this.status = null;
    this._controller = null;
    this.root = null;
    // The last completed run; Show in table reads its plan.
    this.last = null;
    this._onOutside = (event) => { if (!event.target?.closest?.('.search-container')) this.close(); };
  }

  get isOpen() { return !!this.root?.isConnected && !this.root.hidden; }

  async open() {
    const container = document.querySelector('.search-container');
    if (!container) return;
    // Off the Collection header views the search field is hidden: navigating opens
    // Collection, and its route opens the sheet once the field shows.
    if (container.style.display === 'none') { this.app.navigate({ view: 'collection', listen: true }); return; }
    if (!this.root?.isConnected) this._build(container);
    this.root.hidden = false;
    this._syncButton();
    document.addEventListener('pointerdown', this._onOutside, true);
    this.root.querySelector('#listenRequest')?.focus?.();
    if (this.status?.state !== 'ready') await this._loadStatus();
  }

  close() {
    if (!this.isOpen) return false;
    const hadFocus = this.root.contains(document.activeElement);
    this.root.hidden = true;
    if (hadFocus) document.querySelector('[data-listen]')?.focus?.();
    this._syncButton();
    document.removeEventListener('pointerdown', this._onOutside, true);
    return true;
  }

  toggle() { return this.isOpen ? this.close() : this.open(); }

  _syncButton() {
    document.querySelector('[data-listen]')?.setAttribute('aria-expanded', String(this.isOpen));
  }

  _build(container) {
    this.root = document.createElement('div');
    this.root.className = 'listen-sheet';
    this.root.id = 'listenSheet';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Listen');
    this.root.hidden = true;
    this.root.innerHTML = `<form class="listen-composer" data-listen-form>
        <textarea id="listenRequest" maxlength="1000" rows="2" aria-label="Listen"></textarea>
        <div class="listen-compose-foot">
          <div class="listen-mode" role="group" aria-label="Search detail">
            <button type="button" class="active" data-listen-mode="simple" aria-pressed="true">Simple</button>
            <button type="button" data-listen-mode="detailed" aria-pressed="false">Detailed</button>
          </div>
          <span class="listen-model-state" data-listen-status></span>
          <button class="btn btn-sm listen-submit" type="submit" disabled>Listen</button>
        </div>
      </form>
      <div data-listen-questions></div>
      <div data-listen-output></div>`;
    container.append(this.root);
    this._wire();
  }

  _wire() {
    this.root.querySelectorAll('[data-listen-mode]').forEach((button) => button.addEventListener('click', () => {
      this.mode = button.dataset.listenMode;
      this.questions = [];
      this.last = null;
      this.root.querySelectorAll('[data-listen-mode]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      this.root.querySelector('[data-listen-questions]').innerHTML = '';
      this.root.querySelector('[data-listen-output]').innerHTML = '';
    }));
    this.root.querySelector('[data-listen-form]').addEventListener('submit', (event) => {
      event.preventDefault();
      this._start();
    });
    this.root.querySelector('#listenRequest').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this._start();
      }
    });
    this.root.querySelector('#listenRequest').addEventListener('input', (event) => {
      if (this.questions.length && event.target.value.trim() !== this._questionRequest) {
        this.questions = [];
        this.last = null;
        this._questionRequest = '';
        this.root.querySelector('[data-listen-questions]').innerHTML = '';
        this.root.querySelector('[data-listen-output]').innerHTML = '';
      }
    });
  }

  async _loadStatus() {
    try {
      this.status = await api('status');
      const el = this.root?.querySelector('[data-listen-status]');
      const submit = this.root?.querySelector('.listen-submit');
      if (!el || !submit) return;
      if (this.status.state === 'ready') {
        el.innerHTML = `<span class="listen-status-dot is-ready" title="${escapeHtml(this.status.model)} · local"></span>`;
        submit.disabled = false;
      } else if (this.status.state === 'missing_model') {
        el.innerHTML = `Model not installed · <code>${escapeHtml(this.status.pull)}</code>`;
      } else if (this.status.state === 'disabled') {
        el.textContent = 'Local model disabled';
      } else {
        el.innerHTML = `Local model is not running <button type="button" class="listen-retry">Retry</button>`;
        el.querySelector('.listen-retry')?.addEventListener('click', () => this._loadStatus());
      }
    } catch (error) {
      const el = this.root?.querySelector('[data-listen-status]');
      if (el) el.textContent = error.message;
    }
  }

  async _start() {
    const input = this.root.querySelector('#listenRequest');
    const request = input.value.trim();
    if (!request) { input.focus?.(); return; }
    if (this.mode === 'detailed' && !this.questions.length) return this._askQuestions(request);
    return this._recommend(request);
  }

  _busy(on) {
    this.root.querySelector('.listen-submit').disabled = on || this.status?.state !== 'ready';
    this.root.setAttribute('aria-busy', String(on));
  }

  async _askQuestions(request) {
    this._controller?.abort(); this._controller = new AbortController();
    this._busy(true); this._message('', 'clear');
    try {
      const data = await api('questions', { request }, { signal: this._controller.signal });
      this.questions = data.questions || [];
      this._questionRequest = request;
      if (!this.questions.length) { await this._recommend(request); return; }
      this._renderQuestions();
    } catch (error) {
      if (error.name !== 'AbortError') this._message(error.message, 'error');
    } finally { this._busy(false); }
  }

  _renderQuestions() {
    const host = this.root.querySelector('[data-listen-questions]');
    host.innerHTML = `<form class="listen-questions" data-listen-answer-form>
      ${this.questions.map((question, index) => `<fieldset>
        <label for="listenAnswer${index}">${escapeHtml(question.prompt)}</label>
        ${(question.choices || []).length ? `<div class="listen-choices">${question.choices.map((choice) => `<button type="button" data-choice="${escapeHtml(choice)}" data-answer="listenAnswer${index}">${escapeHtml(choice)}</button>`).join('')}</div>` : ''}
        <input id="listenAnswer${index}" type="text" maxlength="240" autocomplete="off">
      </fieldset>`).join('')}
      <div class="listen-question-actions"><button type="button" class="btn btn-sm btn-secondary" data-listen-skip>Skip</button><button type="submit" class="btn btn-sm">Listen</button></div>
    </form>`;
    host.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', () => {
      const input = host.querySelector(`#${button.dataset.answer}`);
      if (input) { input.value = button.dataset.choice; input.focus?.(); }
    }));
    host.querySelector('[data-listen-skip]').addEventListener('click', () => this._recommend(this.root.querySelector('#listenRequest').value.trim()));
    host.querySelector('[data-listen-answer-form]').addEventListener('submit', (event) => {
      event.preventDefault(); this._recommend(this.root.querySelector('#listenRequest').value.trim());
    });
    host.querySelector('input')?.focus?.();
  }

  _answers() {
    return this.questions.map((question, index) => ({
      question: question.prompt,
      answer: this.root.querySelector(`#listenAnswer${index}`)?.value.trim() || '',
    })).filter((entry) => entry.answer);
  }

  async _recommend(request) {
    this._controller?.abort(); this._controller = new AbortController();
    this._busy(true); this._message('', 'clear');
    try {
      const answers = this._answers();
      const data = await api('recommend', { request, mode: this.mode, answers }, { signal: this._controller.signal });
      this.last = null;
      if (data.status === 'empty') {
        this._message(data.reason === 'no_mp3s' ? 'No existing local MP3s are indexed.' : 'Nothing matched.', 'empty');
        return;
      }
      this.root.querySelector('[data-listen-output]').innerHTML = resultsHtml(data);
      this.last = { request, mode: this.mode, questions: this.questions, answers, data };
      this._wireResults(data.tracks || []);
    } catch (error) {
      if (error.name !== 'AbortError') this._message(error.message, 'error');
    } finally { this._busy(false); }
  }

  _wireResults(tracks) {
    const byId = new Map(tracks.map((track) => [String(track.id), track]));
    this.root.querySelectorAll('[data-listen-track-id] .listen-play').forEach((button) => button.addEventListener('click', () => {
      const track = byId.get(button.closest('[data-listen-track-id]').dataset.listenTrackId);
      if (track) this.app.playLocalTrack(track, tracks, { key: 'listen', kind: 'listen', label: 'Listen', route: { view: 'collection', listen: true } });
    }));
    const show = this.root.querySelector('[data-listen-show]');
    if (!show) return;
    show.disabled = !this._tableParts();
    show.addEventListener('click', () => this._showInTable());
  }

  /** What the last plan can put in the table filter; null when nothing. */
  _tableParts() {
    const plan = this.last?.data?.plan;
    if (!plan) return null;
    const parts = planFilterParts(plan, this.app._tracksCache);
    return Object.keys(parts.facets).length || parts.bpm || parts.year ? parts : null;
  }

  /** Replace the table filter with what the plan can say, close, and show Collection. */
  _showInTable() {
    const parts = this._tableParts();
    const engine = this.app.filterEngine;
    if (!parts || !engine) return;
    engine.clearAll();
    // Every part of the plan must hold, whatever the table's match mode was.
    engine.setMatchMode('all');
    for (const [field, values] of Object.entries(parts.facets)) engine.setFilter(field, values);
    if (parts.bpm) engine.setBpmRange(parts.bpm.min, parts.bpm.max);
    if (parts.year) engine.setYearRange(parts.year.min, parts.year.max);
    this.close();
    return this.app.navigate({ view: 'collection', filter: { ...engine.state } });
  }

  _message(text, tone) {
    const output = this.root.querySelector('[data-listen-output]');
    if (tone === 'clear') { output.innerHTML = ''; return; }
    output.innerHTML = `<div class="listen-message is-${tone}" role="${tone === 'error' ? 'alert' : 'status'}">${escapeHtml(text)}</div>`;
  }
}

const sheetFor = (app) => (app._listenView ||= new ListenView({ app }));
export function openListenSheet(app) { return sheetFor(app).open(); }
export function closeListenSheet(app) { return app?._listenView?.close() || false; }
export function toggleListenSheet(app) { return sheetFor(app).toggle(); }
