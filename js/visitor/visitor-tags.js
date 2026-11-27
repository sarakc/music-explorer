// Tags from a visitor's library. Most people's Comments hold free text (store
// boilerplate, links, notes), and every tag becomes a map node, so Comments are
// read carefully: Rekordbox's only through its My Tags block, Music.app's only
// when the whole field reads as a short tag list. Exclusions are the engine's.

/** Trimmed, non-empty, de-duplicated without case (first spelling kept). */
export function uniqueTags(parts) {
  const seen = new Set(), out = [];
  for (const raw of parts) {
    const tag = String(raw).trim(), key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key); out.push(tag);
  }
  return out;
}

/** Rekordbox writes My Tags into Comments as `/* A / B *\/`; the rest of Comments is ignored. */
export function rekordboxTags(comments) {
  const block = String(comments ?? '').match(/\/\*([\s\S]*?)\*\//);
  return block ? uniqueTags(block[1].split('/')) : [];
}

const split = (s) => String(s ?? '').split(/[,;]/).map((p) => p.trim()).filter(Boolean);
const LOOKS_LIKE_TAG = (p) => p.length <= 30 && p.split(/\s+/).length <= 3 && !/:\/\/|www\.|@|purchased/i.test(p);

/** Grouping split on `,` and `;`, then Comments only when every part is a short tag (≤ 3 words, ≤ 30 characters, no URL, `@` or "purchased"). */
export function musicAppTags(grouping, comments) {
  const fromComments = split(comments);
  return uniqueTags([...split(grouping), ...(fromComments.every(LOOKS_LIKE_TAG) ? fromComments : [])]);
}
