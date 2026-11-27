// A Rekordbox XML export (`<DJ_PLAYLISTS>`) into the engine's stores: COLLECTION's
// TRACKs become track rows (`rb-<TrackID>`), PLAYLISTS' NODEs the playlist tree
// (Type="0" folders, Type="1" playlists; members by TrackID or, KeyType="1", by Location).
import { emptyStores, finishStores, playlistNode, trackRow } from './stores.js';
import { rekordboxTags } from './visitor-tags.js';

/** parseRekordbox(events: AsyncIterable<xml event>) => Promise<{ stores, skipped }> */
export async function parseRekordbox(events) {
  const stores = emptyStores();
  const byLocation = new Map();
  let skipped = 0, section = '', nodeCount = 0;
  const stack = []; // open NODEs: a node, or null for ROOT
  for await (const e of events) {
    if (e.type === 'text') continue;
    if (e.type === 'close') {
      if (e.name === 'COLLECTION' || e.name === 'PLAYLISTS') section = '';
      else if (e.name === 'NODE') stack.pop();
      continue;
    }
    const a = e.attrs;
    if (e.name === 'COLLECTION' || e.name === 'PLAYLISTS') { section = e.selfClosing ? '' : e.name; continue; }
    if (section === 'COLLECTION' && e.name === 'TRACK') {
      const id = `rb-${a.TrackID}`;
      const row = a.TrackID != null ? trackRow(id, {
        title: a.Name, artist: a.Artist, album: a.Album, label: a.Label, genre: a.Genre, year: a.Year,
        bpm: a.AverageBpm, tonality: a.Tonality, tags: rekordboxTags(a.Comments), plays: a.PlayCount,
      }) : null;
      if (!row) { skipped++; continue; }
      stores.tracks.push(row);
      if (a.Location) byLocation.set(a.Location, id);
      continue;
    }
    if (section !== 'PLAYLISTS') continue;
    if (e.name === 'NODE') {
      let node = null;
      if (stack.length) {
        const parent = stack.findLast((n) => n) ?? null;
        node = playlistNode(`rb-node-${++nodeCount}`, a.Name, a.Type === '1' ? 'playlist' : 'folder', parent?.id ?? null);
        node.byLocation = a.KeyType === '1';
        stores.rbNodes.push(node);
      }
      if (!e.selfClosing) stack.push(node);
    } else if (e.name === 'TRACK') {
      const node = stack.at(-1);
      if (node?.kind !== 'playlist' || a.Key == null) continue;
      const trackId = node.byLocation ? byLocation.get(a.Key) : `rb-${a.Key}`;
      if (trackId) node.members.push({ trackId });
    }
  }
  for (const n of stores.rbNodes) delete n.byLocation;
  return { stores: finishStores(stores), skipped };
}
