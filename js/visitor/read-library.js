// A visitor's library file into the engine's stores. The format comes from the
// file's content, never its name: a `<DJ_PLAYLISTS` element in the first 4 KB is
// Rekordbox, a `<plist` with a `Tracks` key is Music.app, anything else is tried
// as CSV. The file is streamed and decoded as UTF-8 on the way in.
import { xmlEvents } from './xml-events.js';
import { parseRekordbox } from './parse-rekordbox.js';
import { parseMusicApp } from './parse-music-app.js';
import { parseCsv } from './parse-csv.js';
import { VisitorError } from './visitor-error.js';

/**
 * More tracks than this is too large to map in a browser. Measured in Chrome on
 * synthetic libraries (server/scripts/visitor-synthetic.js, 8 cores, 3 shards): 30,000
 * tracks peak at 2.4 GB in the building worker (4.9 GB for the whole tab); 60,000 ran the
 * tab out of memory while scoring.
 */
export const MAX_TRACKS = 30_000;
const HEAD = 4096;

/** 'rekordbox', 'music-app' or 'csv' from the start of the text. */
export function detectFormat(head) {
  const start = head.slice(0, HEAD);
  if (/<DJ_PLAYLISTS[\s>]/.test(start)) return 'rekordbox';
  if (/<plist[\s>]/.test(start) && /<key>\s*Tracks\s*<\/key>/.test(start)) return 'music-app';
  return 'csv';
}

// Decoded text chunks of `file`, counting the bytes read.
async function* textChunks(file, onProgress) {
  let done = 0;
  const total = file.size;
  const counted = file.stream().pipeThrough(new TransformStream({
    transform(chunk, out) { done += chunk.byteLength; onProgress(done, total); out.enqueue(chunk); },
  }));
  const reader = counted.pipeThrough(new TextDecoderStream()).getReader();
  try {
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) return;
      if (value) yield value;
    }
  } finally { reader.releaseLock(); }
}

/**
 * readLibrary(file: Blob, { onProgress(bytesRead, size) }) =>
 *   Promise<{ format: 'rekordbox' | 'music-app' | 'csv', stores, skipped }>
 * Throws VisitorError 'not-a-library', 'no-tracks' or 'too-large'.
 */
export async function readLibrary(file, { onProgress = () => {} } = {}) {
  const chunks = textChunks(file, onProgress);
  // Read up to the first 4 KB to tell the format, then hand the parser the whole stream.
  const head = [];
  let headText = '', finished = false;
  while (headText.length < HEAD) {
    const next = await chunks.next();
    if (next.done) { finished = true; break; }
    head.push(next.value); headText += next.value;
  }
  async function* all() { yield* head; if (!finished) yield* chunks; }
  const format = detectFormat(headText.replace(/^﻿/, ''));
  let out;
  if (format === 'rekordbox') out = await parseRekordbox(xmlEvents(all()));
  else if (format === 'music-app') out = await parseMusicApp(xmlEvents(all()));
  else {
    let text = '';
    for await (const c of all()) text += c;
    // A binary file decodes to NULs and replacement characters, never a header row.
    if (/[\u0000�]/.test(text.slice(0, HEAD))) throw new VisitorError('not-a-library', 'The file is not text.');
    out = parseCsv(text);
  }
  const n = out.stores.tracks.length;
  if (n === 0) throw new VisitorError('no-tracks', 'No tracks with a title and an artist.');
  if (n > MAX_TRACKS) throw new VisitorError('too-large', `${n} tracks; the most is ${MAX_TRACKS}.`);
  return { format, stores: out.stores, skipped: out.skipped };
}
