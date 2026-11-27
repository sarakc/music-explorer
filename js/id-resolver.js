// Rekordbox member → Collection track id. Pure: shared by the server's workspace
// and the similarity engine (server and browser).

const str = (v) => String(v);

/**
 * Resolve a member to a Collection track id, or null: its own trackId, the
 * reviewed binding of the snapshot track it points at, or a unique path match.
 */
export function createIdResolver({ hasTrack, idsAtPath, snapshotTrack }) {
  return (m) => {
    if (!m) return null;
    if (m.trackId) return hasTrack(str(m.trackId)) ? str(m.trackId) : null;
    const t = snapshotTrack(m.snapshotId, m.key);
    if (t?.libraryTrackId && hasTrack(str(t.libraryTrackId))) return str(t.libraryTrackId);
    const path = t?.localPath || m.path;
    const ids = path ? idsAtPath(path) : [];
    return ids.length === 1 ? str(ids[0]) : null;
  };
}
