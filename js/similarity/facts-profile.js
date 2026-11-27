// Facts on the profiles (graph signals spec › Signals). Pure.
//
// `allEntityFacts()` gives one facts object per owned artist, label, album and
// track (server/lib/facts.js). This puts on each profile what the fact signals
// read, and the counts their rarity needs:
//   place       { city, region, country, code, names }  artist and label (a label's
//               headquarters is its place), album through its studio
//   era         { begin, end, open }                     an artist's active years (no
//               end: still active, runs to the current year), a label's founding
//               year (start only)
//   sampleLinks Map other id → { samples, sampledBy, covers, coveredBy }  owned
//               artists, albums and tracks a sample or cover joins
//   memberOf, memberList  Sets of owned artists, from MusicBrainz, Wikidata and the
//               infobox; Discogs membership is its own signal
//   wikiOut, wikiIn  owned entities whose article this one's links to, or that link here
//   cocite      Map qid → 1, every article this one's links to
//   categories  Map category → 1, the classifier's kept categories only
//   wiki        true with an English article
// Every link is made symmetric, so both ends of a pair cover the signal.
// Credits gap-fill: an album with no Discogs credits takes Wikidata's producers,
// a label Wikidata's founders, as its credited people.
import { entityKey } from '../credits-graph.js';
import { normaliseName } from './wiki-categories.js';

const SAMPLE_DIRS = ['samples', 'sampledBy', 'covers', 'coveredBy'];
const MIRROR = { samples: 'sampledBy', sampledBy: 'samples', covers: 'coveredBy', coveredBy: 'covers' };
const yearOf = (v) => { const m = /\b(\d{4})\b/.exec(String(v ?? '')); return m ? Number(m[1]) : null; };
const values = (list) => (Array.isArray(list) ? list : []).map((l) => l?.value).filter(Boolean);
const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);

/**
 * A facts place → the profile's { city, region, country, code, names }, or null.
 * `countries` maps names to ISO codes and back, from every place that has both.
 */
export function placeOf(v, countries = { codeByName: new Map(), nameByCode: new Map() }) {
  const { codeByName, nameByCode } = countries;
  if (!v?.name) return null;
  const type = v.type || null, name = String(v.name);
  const countryName = type === 'country' ? name : v.country || null;
  const code = String(v.countryCode || codeByName.get(normaliseName(countryName)) || '').toUpperCase() || null;
  const country = code ? `cc:${code}` : countryName ? `cn:${normaliseName(countryName)}` : null;
  const regionName = type === 'region' ? name : v.region || null;
  const cityName = type === 'country' || type === 'region' ? null : name;
  return {
    city: cityName ? normaliseName(cityName) || null : null,
    region: regionName ? normaliseName(regionName) || null : null,
    country, code,
    names: { city: cityName, region: regionName, country: countryName || nameByCode.get(code) || code },
  };
}

/** An artist's active years or a label's founding year → { begin, end, open }, or null. */
export function eraOf(type, facts, currentYear) {
  if (type === 'artist' && facts.active?.value) {
    const begin = yearOf(facts.active.value.begin), end = yearOf(facts.active.value.end);
    if (begin == null) return null;
    return end != null ? { begin, end: Math.max(begin, end), open: false } : { begin, end: Math.max(begin, currentYear), open: true };
  }
  if (type === 'label' && facts.founded?.value) {
    const begin = yearOf(facts.founded.value);
    return begin == null ? null : { begin, end: null, open: false };
  }
  return null;
}

/**
 * Put the facts (Map entity id → facts) on the index's profiles. Adds to the
 * index: `factDf` { city, region, country, cocite, categories } (entities per
 * value), `factN` (entities per feature), names for cocited articles and
 * categories, and the gap-filled people in `people` and `personNames`.
 */
export function applyFacts(index, facts, { currentYear = new Date().getUTCFullYear() } = {}) {
  const { entities } = index;
  const dfOf = () => new Map();
  const df = { city: dfOf(), region: dfOf(), country: dfOf(), cocite: dfOf(), categories: dfOf() };
  const n = { place: 0, cocite: 0, categories: 0 };
  index.factDf = df; index.factN = n;
  index.names.cocite = new Map(); index.names.categories = new Map();
  index.currentYear = currentYear;
  if (!(facts instanceof Map) || !facts.size) return index;

  // Country names ↔ ISO codes, from every place that has both.
  const codeByName = new Map(), nameByCode = new Map();
  for (const f of facts.values()) for (const v of [f.place?.value, f.studio?.value?.place]) {
    const name = v?.type === 'country' ? v.name : v?.country;
    if (!name || !v.countryCode) continue;
    const code = String(v.countryCode).toUpperCase();
    codeByName.set(normaliseName(name), code);
    if (!nameByCode.has(code)) nameByCode.set(code, name);
  }
  const countries = { codeByName, nameByCode };
  const owned = (id) => id && entities.has(id) ? id : null;
  const set = (p, key) => (p[key] ||= new Set());

  for (const [id, f] of facts) {
    const p = entities.get(id);
    if (!p || !f) continue;
    const place = p.type === 'album' ? placeOf(f.studio?.value?.place, countries)
      : p.type === 'artist' || p.type === 'label' ? placeOf(f.place?.value, countries) : null;
    if (place) p.place = place;
    const era = eraOf(p.type, f, currentYear);
    if (era) p.era = era;
    if (f.ids?.wikipedia) p.wiki = true;

    // Samples and covers: each related item meets its track, the track's album and its artist.
    for (const dir of SAMPLE_DIRS) for (const item of values(f[dir])) {
      const track = owned(item.entityId), album = track ? owned(entities.get(track)?.albumId) : null;
      for (const target of new Set([track, album, owned(item.artistId)])) {
        if (!target || target === id) continue;
        const links = (p.sampleLinks ||= new Map());
        const counts = links.get(target) || links.set(target, { samples: 0, sampledBy: 0, covers: 0, coveredBy: 0 }).get(target);
        counts[dir]++;
      }
    }

    if (p.type === 'artist') {
      // Discogs-sourced members are discogs-membership's; only joined (owned) ones count.
      for (const [key, field] of [['members', 'memberList'], ['memberOf', 'memberOf']]) {
        for (const leaf of f[key] || []) {
          if (leaf?.source === 'discogs') continue;
          const other = owned(leaf?.value?.entityId);
          if (other && other !== id && entities.get(other).type === 'artist') set(p, field).add(other);
        }
      }
    }

    if (p.type !== 'track') {
      for (const v of values(f.wikiLinks)) {
        if (v.qid) {
          (p.cocite ||= new Map()).set(v.qid, 1);
          if (v.name && !index.names.cocite.has(v.qid)) index.names.cocite.set(v.qid, v.name);
        }
        const other = owned(v.entityId);
        if (other && other !== id) set(p, 'wikiOut').add(other);
      }
      for (const name of values(f.categories)) {
        const k = normaliseName(name);
        if (!k) continue;
        (p.categories ||= new Map()).set(k, 1);
        if (!index.names.categories.has(k)) index.names.categories.set(k, String(name));
      }
    }

    // Credits gap-fill: Wikidata's producers (album) or founders (label), only with no Discogs credits.
    const people = p.type === 'album' ? f.producers : p.type === 'label' ? f.founder : null;
    if (people?.length && !p.people.size) {
      const keys = [];
      for (const leaf of people) {
        if (leaf?.source !== 'wikidata') continue;
        const name = String(leaf.value?.name || '').trim(), k = entityKey(name);
        if (!k || keys.includes(k)) continue;
        keys.push(k); p.people.add(k);
        if (!index.personNames.has(k)) index.personNames.set(k, name);
      }
      for (const a of keys) { if (!index.people.has(a)) index.people.set(a, new Set()); for (const b of keys) if (a !== b) index.people.get(a).add(b); }
    }
  }

  // Symmetric links: both ends cover each signal.
  for (const p of entities.values()) {
    for (const [target, counts] of p.sampleLinks || []) {
      const q = entities.get(target), back = (q.sampleLinks ||= new Map());
      if (back.has(p.id)) continue;
      const mirrored = { samples: 0, sampledBy: 0, covers: 0, coveredBy: 0 };
      for (const dir of SAMPLE_DIRS) mirrored[MIRROR[dir]] = counts[dir];
      back.set(p.id, mirrored);
    }
    for (const g of p.memberOf || []) set(entities.get(g), 'memberList').add(p.id);
    for (const m of p.memberList || []) set(entities.get(m), 'memberOf').add(p.id);
    for (const t of p.wikiOut || []) set(entities.get(t), 'wikiIn').add(p.id);
  }

  // Rarity counts: entities per value at each place level, per cocited article, per category.
  for (const p of entities.values()) {
    if (p.place) {
      n.place++;
      for (const level of ['city', 'region', 'country']) if (p.place[level]) bump(df[level], p.place[level]);
    }
    if (p.cocite) { n.cocite++; for (const k of p.cocite.keys()) bump(df.cocite, k); }
    if (p.categories) { n.categories++; for (const k of p.categories.keys()) bump(df.categories, k); }
    const linked = new Set([...(p.sampleLinks?.keys() || []), ...(p.memberOf || []), ...(p.memberList || []), ...(p.wikiOut || []), ...(p.wikiIn || [])]);
    if (linked.size) p.factLinks = linked;
  }
  return index;
}
