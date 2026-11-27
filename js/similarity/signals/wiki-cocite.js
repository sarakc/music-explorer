import { vectorSignal } from './_vector.js';
// Their articles link to the same articles about music (IDF cosine over the
// entities with links). One of the Wikipedia signals the blend caps together.
export default vectorSignal({ id: 'wiki-cocite', source: 'wikipedia', defaultWeight: 1, feature: 'cocite', group: 'wikipedia' });
