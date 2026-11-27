// A Music.app (or iTunes) Library.xml plist into the engine's stores. Each entry of
// the Tracks dict becomes a track row (`am-<Track ID>`) as soon as it is read, so the
// whole plist never sits in memory. Playlists skip the library itself (`Master`) and
// distinguished kinds (Music, Podcasts, …); folders keep their place in the tree but
// not their own items; smart playlists stay. Album Artist is not read.
import { emptyStores, finishStores, playlistNode, trackRow } from './stores.js';
import { musicAppTags } from './visitor-tags.js';

const SCALARS = new Set(['key', 'string', 'integer', 'real', 'date', 'data']);

function scalar(name, raw) {
  if (name === 'integer' || name === 'real') return Number(raw.trim());
  if (name === 'data') return raw.replace(/\s+/g, '');
  return raw;
}

/** parseMusicApp(events: AsyncIterable<xml event>) => Promise<{ stores, skipped }> */
export async function parseMusicApp(events) {
  const stores = emptyStores();
  let skipped = 0;
  const onTrack = (t, key) => {
    const row = trackRow(`am-${t['Track ID'] ?? key}`, {
      title: t.Name, artist: t.Artist, album: t.Album, genre: t.Genre, year: t.Year, bpm: t.BPM,
      tags: musicAppTags(t.Grouping, t.Comments), plays: t['Play Count'],
    });
    if (row) stores.tracks.push(row); else skipped++;
  };
  const playlistId = (p) => `am-pl-${p}`;
  const onPlaylist = (p) => {
    if (p.Master || p['Distinguished Kind'] != null) return;
    const node = playlistNode(playlistId(p['Playlist Persistent ID'] ?? p['Playlist ID']), p.Name, p.Folder ? 'folder' : 'playlist',
      p['Parent Persistent ID'] != null ? playlistId(p['Parent Persistent ID']) : null);
    if (!p.Folder) for (const item of p['Playlist Items'] || []) if (item?.['Track ID'] != null) node.members.push({ trackId: `am-${item['Track ID']}` });
    stores.rbNodes.push(node);
  };

  // A stack of open containers: { kind: 'dict', value, key, role } or { kind: 'array', value, role }.
  // The role marks the top-level Tracks dict and Playlists array, whose entries are handed
  // to onTrack and onPlaylist instead of being kept.
  const stack = [];
  let scalarName = '', buf = '';
  const place = (value) => {
    const parent = stack.at(-1);
    if (!parent) return;
    if (parent.role === 'tracks') { if (value && typeof value === 'object') onTrack(value, parent.key); parent.key = null; return; }
    if (parent.role === 'playlists') { if (value && typeof value === 'object') onPlaylist(value); return; }
    if (parent.kind === 'array') parent.value.push(value);
    else if (parent.key != null) { parent.value[parent.key] = value; parent.key = null; }
  };
  const roleFor = () => {
    const parent = stack.at(-1);
    if (stack.length !== 1 || parent.kind !== 'dict') return '';
    return parent.key === 'Tracks' ? 'tracks' : parent.key === 'Playlists' ? 'playlists' : '';
  };
  for await (const e of events) {
    if (e.type === 'text') { if (scalarName) buf += e.text; continue; }
    const { name } = e;
    if (e.type === 'open') {
      if (name === 'dict' || name === 'array') {
        const frame = { kind: name, value: name === 'dict' ? {} : [], key: null, role: roleFor() };
        if (e.selfClosing) place(frame.value); else stack.push(frame);
      } else if (name === 'true' || name === 'false') place(name === 'true');
      else if (SCALARS.has(name)) {
        if (e.selfClosing) { if (name === 'key') { if (stack.at(-1)) stack.at(-1).key = ''; } else place(scalar(name, '')); } else { scalarName = name; buf = ''; }
      }
      continue;
    }
    if (name === 'dict' || name === 'array') {
      const frame = stack.pop();
      if (frame) place(frame.value);
    } else if (name === scalarName) {
      if (name === 'key') { if (stack.at(-1)) stack.at(-1).key = buf; } else place(scalar(name, buf));
      scalarName = ''; buf = '';
    }
  }
  return { stores: finishStores(stores), skipped };
}
