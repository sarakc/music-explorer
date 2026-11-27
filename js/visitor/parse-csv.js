// A CSV library (UTF-8, comma-separated, quoted per RFC 4180) into the engine's
// stores. Header names are matched without case; `title` and `artist` are required.
// Tracks are `csv-<row>`, the row's number in the file (the header is row 1).
// `tags` and `playlists` are separated by `;`; each playlist name is one top-level playlist.
import { emptyStores, finishStores, playlistNode, trackRow } from './stores.js';
import { uniqueTags } from './visitor-tags.js';
import { VisitorError } from './visitor-error.js';

const COLUMNS = ['title', 'artist', 'album', 'label', 'genre', 'year', 'bpm', 'key', 'tags', 'plays', 'playlists'];

/** RFC 4180 records: quoted fields may hold commas, line breaks and doubled quotes; CRLF or LF ends a record. */
export function csvRecords(text) {
  const records = [];
  let record = [], field = '', quoted = false, started = false;
  const endField = () => { record.push(field); field = ''; started = true; };
  const endRecord = () => { endField(); records.push(record); record = []; started = false; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') endField();
    else if (c === '\n') endRecord();
    else if (c === '\r') { if (text[i + 1] === '\n') i++; endRecord(); } else field += c;
  }
  if (field || started || quoted) endRecord();
  return records;
}

const list = (v) => uniqueTags(String(v ?? '').split(';'));

/** parseCsv(text: string) => { stores, skipped }; throws VisitorError('not-a-library') without a title and an artist column. */
export function parseCsv(text) {
  const records = csvRecords(String(text ?? '').replace(/^﻿/, ''));
  const header = (records[0] || []).map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(COLUMNS.map((c) => [c, header.indexOf(c)]));
  if (col.title === -1 || col.artist === -1) throw new VisitorError('not-a-library', 'The header row has no title and artist columns.');
  const stores = emptyStores(), lists = new Map();
  let skipped = 0;
  records.slice(1).forEach((r, i) => {
    if (r.every((f) => !f.trim())) return;
    const get = (c) => (col[c] === -1 ? undefined : r[col[c]]);
    const id = `csv-${i + 2}`;
    const row = trackRow(id, {
      title: get('title'), artist: get('artist'), album: get('album'), label: get('label'), genre: get('genre'),
      year: get('year'), bpm: get('bpm'), tonality: get('key'), tags: list(get('tags')), plays: get('plays'),
    });
    if (!row) { skipped++; return; }
    stores.tracks.push(row);
    for (const name of list(get('playlists'))) {
      const key = name.toLowerCase();
      if (!lists.has(key)) { lists.set(key, playlistNode(`csv-pl-${lists.size + 1}`, name, 'playlist')); stores.rbNodes.push(lists.get(key)); }
      lists.get(key).members.push({ trackId: id });
    }
  });
  return { stores: finishStores(stores), skipped };
}
