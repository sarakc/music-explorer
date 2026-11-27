// The stores a visitor's library becomes: the shape the similarity engine reads
// from collection.db (`loadSources`), with only tracks and playlist nodes filled.

/** Every store `loadSources` returns, empty. */
export function emptyStores() {
  return {
    tracks: [], favorites: [], gigs: [], crates: [], playlists: [], shortlist: [], playEvents: [], creditsCache: [],
    resolveMap: [], identities: [], relationRows: [], artistDiscogsMap: [], rekordboxSessions: [], rbNodes: [],
    rbSnapshotTracks: new Map(), facts: null,
  };
}

/** A trimmed string, `''` when absent. */
export const text = (v) => (v == null ? '' : String(v).trim());

/** A finite number, or null when absent; `zeroIsNull` for fields where 0 means "not set" (year, BPM). */
export function number(v, { zeroIsNull = false } = {}) {
  if (v == null || (typeof v === 'string' && !v.trim())) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || (zeroIsNull && n === 0)) return null;
  return n;
}

/** One track row, or null when it has no title or no artist (counted as skipped). */
export function trackRow(id, { title, artist, album, label, genre, year, bpm, tonality, tags, plays }) {
  const row = {
    id, title: text(title), artist: text(artist), album: text(album), label: text(label), genre: text(genre),
    year: number(year, { zeroIsNull: true }), bpm: number(bpm, { zeroIsNull: true }), tonality: text(tonality),
    tags: Array.isArray(tags) ? tags : [], play_count: number(plays), source: 'visitor',
  };
  return row.title && row.artist ? row : null;
}

/** A playlist or folder node in the shape `rekordboxGroups` reads. */
export const playlistNode = (id, name, kind, parent = null) => ({ id, name: text(name), kind, parent, locator: null, missing: false, members: [] });

/** Keeps only members that are kept tracks (each once), and parents that are nodes. */
export function finishStores(stores) {
  const ids = new Set(stores.tracks.map((t) => t.id));
  const nodeIds = new Set(stores.rbNodes.map((n) => n.id));
  for (const n of stores.rbNodes) {
    if (n.parent != null && !nodeIds.has(n.parent)) n.parent = null;
    const seen = new Set();
    n.members = n.members.filter((m) => ids.has(m.trackId) && !seen.has(m.trackId) && seen.add(m.trackId));
  }
  return stores;
}
