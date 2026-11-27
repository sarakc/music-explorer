// Similarity engine defaults, shared by the server and the browser. A config is
// a full set of defaults with a partial override merged over it; `configHash`
// of the merged result decides whether stored neighbours are stale.
// `SHARED_DEFAULTS` are generic (no excluded tags or folders): the browser runs
// on them, and the server lays its own lists over them (server/lib/similarity/config.js).
import { sha256Hex } from './sha256.js';

export const SHARED_DEFAULTS = Object.freeze({
  weights: Object.freeze({
    tags: 3, genre: 3, artist: 2, label: 1.5, bpm: 1, key: 0.5, year: 0.75, curation: 2, plays: 1,
    'discogs-identity': 4, 'discogs-membership': 3, 'label-family': 2, credits: 2,
    place: 1, era: 0.75, samples: 2, members: 2, 'wiki-links': 1.5, 'wiki-cocite': 1, 'wiki-categories': 1,
  }),
  minScore: 0.05,
  // In one pair the signals of one group together count at most this much weight, scaled
  // down in proportion. wikipedia (wiki-links, wiki-cocite, wiki-categories): a famous
  // artist's coverage alone never outweighs what the library says. time (year, era): one
  // fact, the date, counted once. together (curation, plays): playing a list's tracks in
  // one session is mostly the list again; their lifts correlate on the 11-20 snapshot.
  groupCaps: Object.freeze({ wikipedia: 3, time: 1, together: 2 }),
  // Weight of the prior toward 0 (unknown): a pair with few covered inputs shrinks toward it.
  priorWeight: 8,
  k: 30,
  perTypeK: 12,
  candidateCap: 2000,
  bpmBinPct: 2,
  yearSigma: 5,
  playWindowMin: 30,
  excludedTags: Object.freeze([]),
  // Tag → genre word it names (`rnb` → `r&b`), applied when the word is in the library.
  genreAliases: Object.freeze({}),
  // Curation and plays: each pair's cosine times n / (n + cooccurK) over its n shared groups.
  cooccurK: 1,
  // A list someone else made counts at this share of an own list's weight.
  followedGroupWeight: 0.75,
  // Sessions (Unified and Rekordbox together) before plays covers anything.
  minSessions: 20,
  // Outside-playlist classifier (playlist-classifier.js).
  maxGroupTracks: 1000,
  excludedPlaylistFolders: Object.freeze([]),
  includedPlaylists: Object.freeze([]),
  excludedPlaylists: Object.freeze([]),
  // Artist names never split, wherever they sit in a credit (Tools › Similarity).
  neverSplitArtists: Object.freeze([]),
  debounceMs: 60_000,
  progressEvery: 500,
});

// Signals that no longer exist: a saved weight for one is dropped, not an error.
const RETIRED_SIGNALS = new Set(['discogs-styles']);
const NUMBER_KEYS = Object.keys(SHARED_DEFAULTS).filter((k) => typeof SHARED_DEFAULTS[k] === 'number' && k !== 'maxGroupTracks');
const LIST_KEYS = ['excludedPlaylistFolders', 'includedPlaylists', 'excludedPlaylists', 'neverSplitArtists'];
const isWeight = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/** Check a partial override. `value` keeps only the valid, known parts. */
export function validateOverrides(obj) {
  const errors = [], value = {};
  if (!isObject(obj)) return { ok: false, errors: ['config must be an object'], value };
  for (const [key, v] of Object.entries(obj)) {
    if (key === 'weights') {
      if (!isObject(v)) { errors.push('weights must be an object'); continue; }
      for (const [signal, w] of Object.entries(v)) {
        if (RETIRED_SIGNALS.has(signal)) continue;
        if (!(signal in SHARED_DEFAULTS.weights)) errors.push(`unknown signal: ${signal}`);
        else if (!isWeight(w)) errors.push(`weight for ${signal} must be a number ≥ 0`);
        else (value.weights ||= {})[signal] = w;
      }
    } else if (key === 'groupCaps') {
      if (!isObject(v)) { errors.push('groupCaps must be an object'); continue; }
      for (const [group, cap] of Object.entries(v)) {
        if (!isWeight(cap)) errors.push(`cap for ${group} must be a number ≥ 0`);
        else (value.groupCaps ||= {})[group] = cap;
      }
    } else if (key === 'wikiCap') {
      // Saved before group caps: the Wikipedia group's cap. An explicit groupCaps.wikipedia wins.
      if (!isWeight(v)) errors.push('wikiCap must be a number ≥ 0');
      else if (obj.groupCaps?.wikipedia === undefined) (value.groupCaps ||= {}).wikipedia = v;
    } else if (key === 'genreAliases') {
      if (!isObject(v) || !Object.values(v).every((t) => typeof t === 'string')) errors.push('genreAliases must map tags to genre words (strings)');
      else value.genreAliases = { ...v };
    } else if (key === 'excludedTags') {
      if (!Array.isArray(v) || !v.every((t) => typeof t === 'string')) errors.push('excludedTags must be a list of strings');
      else value.excludedTags = [...v];
    } else if (LIST_KEYS.includes(key)) {
      if (!Array.isArray(v) || !v.every((t) => typeof t === 'string')) errors.push(`${key} must be a list of strings`);
      else value[key] = [...v];
    } else if (key === 'maxGroupTracks') {
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) errors.push('maxGroupTracks must be a number > 0');
      else value.maxGroupTracks = v;
    } else if (NUMBER_KEYS.includes(key)) {
      if (!isWeight(v)) errors.push(`${key} must be a number ≥ 0`);
      else value[key] = v;
    } else errors.push(`unknown setting: ${key}`);
  }
  return { ok: errors.length === 0, errors, value };
}

/** `base` (a full set of defaults) with the valid parts of `overrides` applied; invalid parts fall back. */
export function mergeConfigOver(base, overrides) {
  const { value } = validateOverrides(isObject(overrides) ? overrides : {});
  return {
    ...base,
    ...value,
    weights: { ...base.weights, ...(value.weights || {}) },
    groupCaps: { ...base.groupCaps, ...(value.groupCaps || {}) },
    genreAliases: { ...(value.genreAliases || base.genreAliases) },
    excludedTags: [...(value.excludedTags || base.excludedTags)],
    ...Object.fromEntries(LIST_KEYS.map((k) => [k, [...(value[k] || base[k])]])),
  };
}


const stable = (v) => (Array.isArray(v) ? v.map(stable)
  : isObject(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v);

// Bump when profiles, signals or the blend change meaning, so stored
// neighbours from older code are rebuilt on the next boot.
export const ENGINE_VERSION = 6;

export function configHash(cfg, engine = ENGINE_VERSION) {
  return sha256Hex(JSON.stringify(stable({ cfg, engine }))).slice(0, 16);
}
