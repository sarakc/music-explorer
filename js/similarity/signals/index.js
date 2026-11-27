// Signal registry, in blend order. Each signal is a plug-in:
// { id, source, defaultWeight, covers(profile), score(a, b, ctx) → { score, detail } | null }.
// `null` means "not applicable to this pair" and counts as not covered.
import tags from './tags.js';
import genre from './genre.js';
import artist from './artist.js';
import label from './label.js';
import bpm from './bpm.js';
import key from './key.js';
import year from './year.js';
import curation from './curation.js';
import plays from './plays.js';
import discogsIdentity from './discogs-identity.js';
import discogsMembership from './discogs-membership.js';
import labelFamily from './label-family.js';
import credits from './credits.js';
import place from './place.js';
import era from './era.js';
import samples from './samples.js';
import members from './members.js';
import wikiLinks from './wiki-links.js';
import wikiCocite from './wiki-cocite.js';
import wikiCategories from './wiki-categories.js';

export const SIGNALS = Object.freeze([tags, genre, artist, label, bpm, key, year, curation, plays, discogsIdentity, discogsMembership, labelFamily, credits,
  place, era, samples, members, wikiLinks, wikiCocite, wikiCategories]);
