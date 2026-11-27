import { cosine, sharedDetail } from './_vector.js';
import { defineSignal } from './_define.js';
// Genre words (subgenres, Discogs styles, tags that name a genre): the same mix scores 1;
// sharing only the parent genre earns 0.3.
export default defineSignal({
  id: 'genre', source: 'library', defaultWeight: 3,
  covers: (p) => p.genreWords.size > 0,
  sim: (a, b, { index }) => Math.max(cosine(a, b, 'genreWords', index), 0.3 * cosine(a, b, 'parents', index)),
  explain(a, b, { index }) {
    if (cosine(a, b, 'genreWords', index) >= 0.3 * cosine(a, b, 'parents', index)) return sharedDetail(a, b, 'genreWords', index);
    return { parent: sharedDetail(a, b, 'parents', index).shared };
  },
});
