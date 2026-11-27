// Curation groups from outside lists (honest similarity spec 1.4). Pure.
// A Rekordbox list is an rb_workspace playlist node (not missing), its members
// resolved to Collection tracks the way the workspace resolves them, paths
// compared NFC on both sides. Folders are not groups; they give each list its path.
import { createIdResolver } from '../id-resolver.js';
import { idf } from './math.js';

const nfc = (p) => String(p).normalize('NFC');

/** A group's weight in the curation cosine: its IDF by tracks held, less for someone else's list. */
export function groupWeight(size, n, author, cfg) {
  return idf(size, n) * (author === 'other' ? cfg.followedGroupWeight ?? 0.75 : 1);
}

/** Track ids → resolver for Rekordbox members, matching paths NFC-normalised. */
export function memberResolver(tracks, rbSnapshotTracks = new Map()) {
  const ids = new Set(), byPath = new Map();
  for (const t of tracks) {
    if (t?.id == null) continue;
    const id = String(t.id);
    ids.add(id);
    const path = t.local_path || t.localPath;
    if (!path) continue;
    const k = nfc(path);
    if (!byPath.has(k)) byPath.set(k, []);
    byPath.get(k).push(id);
  }
  return createIdResolver({
    hasTrack: (id) => ids.has(id),
    idsAtPath: (p) => byPath.get(nfc(p)) || [],
    snapshotTrack: (snapshotId, key) => {
      const tracks = snapshotId != null ? rbSnapshotTracks.get(String(snapshotId)) : null;
      return tracks && Object.hasOwn(tracks, key) ? tracks[key] : null;
    },
  });
}

/** Rekordbox playlist nodes as classifier groups: { id: 'rb:<node>', origin, author, name, locator, folder, folderId, trackIds }. */
export function rekordboxGroups(rbNodes = [], resolve) {
  const byId = new Map(rbNodes.map((n) => [String(n.id), n]));
  const folderOf = (n) => {
    const path = [], seen = new Set();
    for (let p = n.parent != null ? byId.get(String(n.parent)) : null; p && !seen.has(p.id); p = p.parent != null ? byId.get(String(p.parent)) : null) {
      seen.add(p.id); path.unshift(String(p.name ?? ''));
    }
    return path;
  };
  const out = [];
  for (const n of rbNodes) {
    if (n.kind !== 'playlist' || n.missing) continue;
    const trackIds = new Set();
    for (const m of n.members || []) { const id = resolve(m); if (id) trackIds.add(id); }
    out.push({
      id: `rb:${n.id}`, origin: 'rekordbox', author: 'self', name: String(n.name ?? ''), locator: n.locator ?? String(n.id),
      folder: folderOf(n), folderId: n.parent != null ? String(n.parent) : null, trackIds,
    });
  }
  return out;
}
