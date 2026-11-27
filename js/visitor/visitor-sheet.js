// The sheet a visitor opens their library in: Ready (drop a file or choose one),
// Working (one line of progress and Cancel), the error states, and Done (the map
// is stored and the page opens it at `?src=yours`). The file is read, scored and
// laid out by visitor-worker.js; nothing leaves the browser.
import { saveMap } from './visitor-store.js';
import { goTo, visitorUrl } from '../visitor-entry.js';

export const SHEET_COPY = Object.freeze({
  title: 'Open your library',
  drop: 'Drop a file or choose one',
  formats: 'Rekordbox XML, Music.app Library.xml or CSV · up to 30,000 tracks',
  privacy: 'Stays in this browser',
  more: 'More info',
  steps: Object.freeze({ reading: 'Reading…', scoring: 'Scoring…', layout: 'Laying out…' }),
  errors: Object.freeze({
    'not-a-library': "This doesn't look like a Rekordbox, Music.app or CSV library.",
    'no-tracks': 'No tracks with a title and an artist were found.',
    'too-large': 'This library is too large to map in a browser.',
    failed: 'Something went wrong reading this file.',
  }),
  storage: 'Browser storage is unavailable.',
});

/**
 * estimateSeconds(tracks, parts) => a build's rough time in Chrome, from the
 * measured runs (an 8-core laptop: 15,000 tracks in 105 s over 3 shards, 190 s in
 * one worker; 30,000 in 277 s over 3 shards).
 */
export function estimateSeconds(tracks, parts = 1) {
  const slower = parts >= 3 ? 1 : parts === 2 ? 1.3 : 1.8;
  return 105 * (Math.max(0, tracks) / 15_000) ** 1.4 * slower;
}

/** sizeLine(tracks, parts) => '15,240 tracks · about 2 min', without the time under 50 s. */
export function sizeLine(tracks, parts = 1) {
  const count = `${tracks.toLocaleString('en-US')} ${tracks === 1 ? 'track' : 'tracks'}`;
  const s = estimateSeconds(tracks, parts);
  return s < 50 ? count : `${count} · about ${Math.max(1, Math.round(s / 60))} min`;
}

const spawnWorker = () => new Worker(new URL('./visitor-worker.js', import.meta.url), { type: 'module' });

function sheetHtml() {
  return `<div class="visitor-sheet" role="dialog" aria-label="${SHEET_COPY.title}">
    <div class="visitor-sheet-head">
      <h2 class="visitor-sheet-title">${SHEET_COPY.title}</h2>
      <button type="button" class="visitor-sheet-x" data-visitor-close aria-label="Close" title="Close">✕</button>
      <button type="button" class="visitor-sheet-cancel" data-visitor-cancel hidden>Cancel</button>
    </div>
    <p class="visitor-error" data-visitor-error role="alert" hidden></p>
    <p class="visitor-error-detail" data-visitor-detail hidden></p>
    <label class="visitor-drop" data-visitor-drop><span>${SHEET_COPY.drop}</span><input type="file" data-visitor-file hidden></label>
    <div class="visitor-progress" data-visitor-progress hidden>
      <p class="visitor-progress-line"><span data-visitor-step></span><span class="visitor-size" data-visitor-size hidden></span></p>
      <div class="visitor-bar"><span data-visitor-bar></span></div>
    </div>
    <p class="visitor-formats">${SHEET_COPY.formats}</p>
    <p class="visitor-privacy">${SHEET_COPY.privacy} · <a href="assets/visitor-about.html" target="_blank" rel="noopener">${SHEET_COPY.more}</a></p>
  </div>`;
}

/**
 * openVisitorSheet({ win, onDone }) => { close() }. `createWorker`, `save` and
 * `navigate` stand in for the real ones in tests.
 */
export function openVisitorSheet({ win = globalThis.window, onDone = () => {}, onClose = () => {}, createWorker = spawnWorker, save = saveMap,
  navigate = (url) => goTo(win, url) } = {}) {
  const doc = win.document;
  const host = doc.createElement('div');
  host.className = 'visitor-sheet-host';
  host.innerHTML = sheetHtml();
  doc.body.appendChild(host);
  const $ = (sel) => host.querySelector(sel);
  let job = null; // { worker } of the build under way
  let closed = false;

  const show = (sel, on) => { const el = $(sel); if (el) el.hidden = !on; };
  function ready({ error = '', detail = '' } = {}) {
    show('[data-visitor-drop]', true); show('[data-visitor-progress]', false);
    show('[data-visitor-close]', true); show('[data-visitor-cancel]', false);
    $('[data-visitor-error]').textContent = error; show('[data-visitor-error]', Boolean(error));
    $('[data-visitor-detail]').textContent = detail; show('[data-visitor-detail]', Boolean(detail));
    $('[data-visitor-size]').hidden = true;
    const input = $('[data-visitor-file]');
    if (input) input.value = '';
  }
  function working(step, done = 0, total = 0) {
    show('[data-visitor-drop]', false); show('[data-visitor-progress]', true);
    show('[data-visitor-close]', false); show('[data-visitor-cancel]', true);
    show('[data-visitor-error]', false); show('[data-visitor-detail]', false);
    $('[data-visitor-step]').textContent = SHEET_COPY.steps[step] || SHEET_COPY.steps.reading;
    const share = total > 0 ? Math.min(1, done / total) : step === 'layout' ? 1 : 0;
    $('[data-visitor-bar]').style.width = `${Math.round(share * 100)}%`;
  }
  const stop = () => { if (!job) return; try { job.worker.terminate(); } catch { /* gone */ } job = null; };
  const failed = (code, message) => ready({ error: SHEET_COPY.errors[code] || SHEET_COPY.errors.failed, detail: code === 'failed' || !SHEET_COPY.errors[code] ? message || '' : '' });

  function start(file) {
    if (!file || closed) return;
    stop();
    let worker;
    try { worker = createWorker(); } catch (err) { failed('failed', err?.message || String(err)); return; }
    const mine = { worker };
    job = mine;
    working('reading');
    worker.onmessage = async (e) => {
      if (job !== mine) return; // a cancelled build's late message
      const msg = e.data || {};
      if (msg.type === 'progress') working(msg.step, msg.done, msg.total);
      else if (msg.type === 'tracks') { const el = $('[data-visitor-size]'); el.textContent = sizeLine(msg.count, msg.parts); el.hidden = false; }
      else if (msg.type === 'error') { stop(); failed(msg.code, msg.message); }
      else if (msg.type === 'built') {
        stop();
        job = mine; // still this build's, until it is stored
        const saved = await save(msg.map);
        if (job !== mine) return;
        job = null;
        if (!saved) { ready({ error: SHEET_COPY.errors.failed, detail: SHEET_COPY.storage }); return; }
        onDone(msg.map);
        navigate(visitorUrl(win));
      }
    };
    worker.onerror = (e) => {
      if (job !== mine) return;
      e?.preventDefault?.();
      stop();
      failed('failed', e?.message || 'The worker stopped.');
    };
    worker.postMessage({ type: 'build', file });
  }

  const onPick = (e) => start(e.target.files?.[0]);
  const onDragOver = (e) => { if (e.dataTransfer?.types?.includes?.('Files') ?? true) e.preventDefault(); };
  const onDrop = (e) => { const file = e.dataTransfer?.files?.[0]; if (!file) return; e.preventDefault(); start(file); };
  $('[data-visitor-file]').addEventListener('change', onPick);
  $('[data-visitor-cancel]').addEventListener('click', () => { stop(); ready(); });
  $('[data-visitor-close]').addEventListener('click', () => close());
  doc.addEventListener('dragover', onDragOver);
  doc.addEventListener('drop', onDrop);
  ready();

  function close() {
    if (closed) return;
    closed = true;
    stop();
    doc.removeEventListener('dragover', onDragOver);
    doc.removeEventListener('drop', onDrop);
    host.remove();
    onClose();
  }
  return { close, start, root: host, get working() { return Boolean(job); } };
}
