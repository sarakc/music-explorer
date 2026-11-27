// Decides which outside playlists (Rekordbox, Apple Music, Spotify) count as curation
// groups. Pure: facts and groups in, a verdict per group out. Rule order: override,
// size, folder, month, restating, duplicate. Unified groups always count and win duplicates.

const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december'
  + '|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec';
// Name lowercased, everything but a-z0-9 removed; what is left must match:
//   ^(?:january|...|dec)+(?:\d{2}|\d{4})?$
// i.e. a run of month names (full, or 3-4 letter abbreviations) and an optional 2/4-digit year.
const MONTH_RE = new RegExp(`^(?:${MONTHS})+(?:\\d{2}|\\d{4})?$`);

export function isMonthName(name) {
  const s = String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return s !== '' && MONTH_RE.test(s);
}

const FALLBACK = {
  maxGroupTracks: 1000, minGroupTracks: 2, restateShare: 0.9, restateFolderShare: 0.8,
  bpmWindowPct: 3, duplicateJaccard: 0.9,
};
const NAME_EXCLUDED = ['- search -', '- import -'];
const FIELDS = ['tag', 'genre word', 'label', 'artist', 'month'];

const startsWith = (path, prefix) => prefix.length <= path.length && prefix.every((p, i) => path[i] === p);

// Count tracks per value for one field. Tag/genre word are sets; the rest single values.
function valuesOf(f, field) {
  if (field === 'tag') return f.tags;
  if (field === 'genre word') return f.genreWords;
  const v = field === 'label' ? f.label : field === 'artist' ? f.artist : f.month;
  return v == null || v === '' ? [] : [v];
}
function countValues(trackIds, facts, field) {
  const counts = new Map();
  for (const id of trackIds) {
    const f = facts.get(id);
    if (!f) continue;
    for (const v of valuesOf(f, field)) counts.set(v, (counts.get(v) || 0) + 1);
  }
  return counts;
}
const sortedBpms = (trackIds, facts) => {
  const out = [];
  for (const id of trackIds) { const b = facts.get(id)?.bpm; if (typeof b === 'number' && b > 0) out.push(b); }
  return out.sort((a, b) => a - b);
};
const lowerBound = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; };
const upperBound = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= x) lo = m + 1; else hi = m; } return hi; };
const inWindow = (arr, t, pct) => upperBound(arr, t * (1 + pct / 100)) - lowerBound(arr, t * (1 - pct / 100));

/** classifyGroups(groups, facts, cfg) -> Map<groupId, { state, detail }> */
export function classifyGroups(groups, facts, cfg = {}) {
  const c = { ...FALLBACK, ...Object.fromEntries(Object.entries(cfg || {}).filter(([, v]) => v !== undefined)) };
  const excludedFolders = new Set(c.excludedPlaylistFolders || []);
  const included = new Set(c.includedPlaylists || []);
  const excluded = new Set(c.excludedPlaylists || []);
  const out = new Map();

  // Folder tracks and their per-field counts, cached per folder path.
  const folderCache = new Map();
  const folderStats = (folder) => {
    const key = JSON.stringify(folder);
    let st = folderCache.get(key);
    if (st) return st;
    let tracks;
    if (folder.length === 0) tracks = facts.keys();
    else {
      const set = new Set();
      for (const g of groups) if (startsWith(g.folder || [], folder)) for (const id of g.trackIds) set.add(id);
      tracks = set;
    }
    st = { tracks, counts: new Map(), bpms: null };
    st.tracks = [...tracks];
    folderCache.set(key, st);
    return st;
  };
  const folderCounts = (st, field) => {
    if (!st.counts.has(field)) st.counts.set(field, countValues(st.tracks, facts, field));
    return st.counts.get(field);
  };

  // The field the list restates, or null.
  const restated = (g) => {
    const n = g.trackIds.size;
    if (n === 0) return null;
    // The nearest folder holding more than this list: a list alone in its folder is that
    // folder, so it is judged against the folder above (at the root, the library).
    let path = g.folder || [], st = folderStats(path);
    while (path.length && st.tracks.length <= n) { path = path.slice(0, -1); st = folderStats(path); }
    for (const field of FIELDS) {
      const own = countValues(g.trackIds, facts, field);
      const folder = folderCounts(st, field);
      for (const [value, k] of own) {
        if (k / n >= c.restateShare && k / (folder.get(value) || k) >= c.restateFolderShare) return { field, value };
      }
    }
    const own = sortedBpms(g.trackIds, facts);
    if (own.length) {
      st.bpms ||= sortedBpms(st.tracks, facts);
      for (const t of new Set(own)) {
        const k = inWindow(own, t, c.bpmWindowPct);
        if (k / n >= c.restateShare && k / Math.max(inWindow(st.bpms, t, c.bpmWindowPct), k) >= c.restateFolderShare) {
          return { field: 'bpm', value: t };
        }
      }
    }
    return null;
  };

  const survivors = [];
  for (const g of groups) {
    if (g.origin === 'unified') { out.set(g.id, { state: 'counted', detail: {} }); survivors.push(g); continue; }
    const folder = g.folder || [];
    if (included.has(g.locator)) { out.set(g.id, { state: 'counted', detail: { by: 'setting' } }); survivors.push(g); continue; }
    if (excluded.has(g.locator)) { out.set(g.id, { state: 'folder', detail: { by: 'setting' } }); continue; }
    const n = g.trackIds.size;
    if (n < c.minGroupTracks || n > c.maxGroupTracks) { out.set(g.id, { state: 'size', detail: { size: n } }); continue; }
    const bad = folder.find((p) => excludedFolders.has(p)) ?? (folder.length ? (NAME_EXCLUDED.includes(folder[0]) ? folder[0] : undefined)
      : (NAME_EXCLUDED.includes(g.name) ? g.name : undefined));
    if (bad !== undefined) { out.set(g.id, { state: 'folder', detail: { folder: bad } }); continue; }
    if (isMonthName(g.name)) { out.set(g.id, { state: 'month', detail: {} }); continue; }
    const r = restated(g);
    if (r) { out.set(g.id, { state: 'restates', detail: r }); continue; }
    survivors.push(g);
  }

  // Duplicates: unified and included groups are kept first, then the rest by locator.
  const rank = (g) => (g.origin === 'unified' ? 0 : included.has(g.locator) ? 1 : 2);
  const ordered = [...survivors].sort((a, b) => rank(a) - rank(b) || String(a.locator).localeCompare(String(b.locator)));
  const kept = [], byTrack = new Map();
  for (const g of ordered) {
    let dupOf = null;
    if (rank(g) === 2) {
      const seen = new Map();
      for (const id of g.trackIds) for (const k of byTrack.get(id) || []) seen.set(k, (seen.get(k) || 0) + 1);
      for (const [k, inter] of seen) {
        const union = g.trackIds.size + k.trackIds.size - inter;
        if (union > 0 && inter / union >= c.duplicateJaccard && (!dupOf || kept.indexOf(k) < kept.indexOf(dupOf))) dupOf = k;
      }
    }
    if (dupOf) { out.set(g.id, { state: 'duplicate', detail: { of: dupOf.id } }); continue; }
    kept.push(g);
    if (!out.has(g.id)) out.set(g.id, { state: 'counted', detail: {} });
    for (const id of g.trackIds) { if (!byTrack.has(id)) byTrack.set(id, []); byTrack.get(id).push(g); }
  }
  return out;
}
