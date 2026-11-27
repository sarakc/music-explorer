import { vectorSignal } from './_vector.js';
// The same Wikipedia categories (IDF cosine over the entities with
// categories), only those the classifier keeps: a category that restates a
// label, genre, place or year fills that field instead. One of the Wikipedia
// signals the blend caps together.
export default vectorSignal({ id: 'wiki-categories', source: 'wikipedia', defaultWeight: 1, feature: 'categories', group: 'wikipedia' });
