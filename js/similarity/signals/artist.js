import { vectorSignal } from './_vector.js';
// Two artists are compared through the relation signals, not this one.
export default vectorSignal({ id: 'artist', source: 'library', defaultWeight: 2, feature: 'artists', skip: (a, b) => a.type === 'artist' && b.type === 'artist' });
