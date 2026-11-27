// What the snapshot viewer loads of visitor maps before anyone asks for one: the
// stored map's database name and whether a map is stored, read without opening
// the database where the browser lists its databases. Everything else of visitor
// maps (js/visitor/) loads only when the sheet opens or a stored map is shown.

export const VISITOR_DB = 'music-explorer-yours';
export const VISITOR_STORE = 'map';
export const VISITOR_KEY = 'latest';

const factory = () => { try { return globalThis.indexedDB ?? null; } catch { return null; } };

/** Whether a visitor map is stored in this browser. Never rejects. */
export async function hasStoredMap() {
  try {
    const idb = factory();
    if (!idb) return false;
    if (typeof idb.databases === 'function') return (await idb.databases()).some((d) => d?.name === VISITOR_DB);
    // No list of databases: open it without creating it (an upgrade means it isn't there).
    return await new Promise((resolve) => {
      const req = idb.open(VISITOR_DB);
      req.onupgradeneeded = () => { try { req.transaction.abort(); } catch { /* aborting fails the open */ } };
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
      req.onsuccess = () => {
        const db = req.result;
        try {
          if (!db.objectStoreNames.contains(VISITOR_STORE)) { db.close(); resolve(false); return; }
          const count = db.transaction(VISITOR_STORE).objectStore(VISITOR_STORE).count(VISITOR_KEY);
          count.onsuccess = () => { db.close(); resolve(count.result > 0); };
          count.onerror = () => { db.close(); resolve(false); };
        } catch { try { db.close(); } catch { /* closed */ } resolve(false); }
      };
    });
  } catch { return false; }
}

/** Load `url`: a page that only differs by its hash is reloaded, since the source is chosen once, at load. */
export function goTo(win, url) {
  const next = new URL(url, win.location.href);
  const same = next.pathname === win.location.pathname && next.search === win.location.search;
  win.location.assign(next.href);
  if (same) win.location.reload();
}

/** The visitor map's address: this page with `?src=yours`, on the Collection graph. */
export const visitorUrl = (win) => `${win.location.pathname}?src=yours#/collection?as=graph`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ENTRY_COPY = Object.freeze({
  open: 'Map your own collection',
  stored: 'Your collection',
  back: 'Back to the snapshot',
  forget: 'Forget this library? You can open the file again.',
});

/**
 * The header's visitor entry, before ← →. On the snapshot: one button, "Map your
 * own collection" (the sheet), or "Your collection" with a map stored (that map).
 * On a visitor's map: the file name with ✕ (forget it), and "Back to the snapshot"
 * in place of the line of facts. `openSheet` opens the sheet once mounted.
 * The loaders, `hasMap` and `navigate` stand in for the real ones in tests.
 */
export function mountVisitorEntry({ win = globalThis.window, visitor = false, label = '', openSheet = false,
  loadSheet = () => import('./visitor/visitor-sheet.js'), loadStore = () => import('./visitor/visitor-store.js'),
  hasMap = hasStoredMap, navigate = (url) => goTo(win, url) } = {}) {
  const doc = win.document;
  const bar = doc.querySelector('.top-bar');
  if (!bar) return null;
  const home = win.location.pathname;
  const entry = doc.createElement(visitor ? 'span' : 'button');
  entry.id = 'visitorEntry';
  const place = () => { const controls = bar.querySelector('.top-bar-controls'); if (controls) bar.insertBefore(entry, controls); else bar.appendChild(entry); };

  if (visitor) {
    entry.className = 'visitor-chip';
    entry.innerHTML = `<span class="visitor-chip-name">${esc(label)}</span><button type="button" class="visitor-chip-x" data-visitor-forget aria-label="Forget" title="Forget">✕</button>`;
    const facts = doc.querySelector('.viewer-source');
    if (facts) facts.innerHTML = `<a href="${esc(home)}" data-visitor-back>${ENTRY_COPY.back}</a>`;
    entry.querySelector('[data-visitor-forget]').addEventListener('click', async () => {
      if (!win.confirm?.(ENTRY_COPY.forget)) return;
      try { await (await loadStore()).forgetMap(); } catch { /* nothing stored */ }
      navigate(home);
    });
    place();
    return { el: entry };
  }

  let stored = false, sheet = null;
  entry.type = 'button';
  entry.className = 'visitor-entry';
  entry.innerHTML = `<span class="visitor-entry-ico" aria-hidden="true">⊕</span><span data-visitor-entry-label>${ENTRY_COPY.open}</span>`;
  const open = async () => {
    if (sheet) return sheet;
    const { openVisitorSheet } = await loadSheet();
    sheet ||= openVisitorSheet({ win, onClose: () => { sheet = null; } });
    return sheet;
  };
  entry.addEventListener('click', () => { if (stored) navigate(visitorUrl(win)); else open(); });
  place();
  const checked = Promise.resolve().then(hasMap).catch(() => false).then((has) => {
    stored = Boolean(has);
    if (stored) entry.querySelector('[data-visitor-entry-label]').textContent = ENTRY_COPY.stored;
  });
  const opened = openSheet ? open() : null;
  return { el: entry, checked, opened, open };
}
