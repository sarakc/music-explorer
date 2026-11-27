// Filter rules (filter-rules design, 2026-09-18). Pure: no DOM, no I/O.
//
// A filter is a list of groups. Each group has a `join` of any/all and holds
// rules { field, op, value }; the groups combine under a top-level `join`.
// Two levels, no deeper. Evaluation is tri-state: a rule compiles to a
// predicate, or to `skip` with a reason when it is empty or the evidence it
// needs is not in `context`; a group drops skipped rules before applying its
// join, and a group with no evaluable rules is neutral. Nothing here can
// silently match everything or nothing.

import { expandCamelotCompatible } from './key-compat.js';
import { entityId } from './credits-graph.js';
import { soundStatusForTrack } from './sound-check-status.js';

// Split a raw genre string on the first colon. Left = single Genre,
// right = single Subgenre. Single-element arrays preserve the consumer shape.
export function splitGenreField(raw) {
    if (!raw || typeof raw !== 'string') return { genres: [], subgenres: [] };
    const s = raw.trim();
    if (!s) return { genres: [], subgenres: [] };
    const colonIdx = s.indexOf(':');
    if (colonIdx < 0) return { genres: [s], subgenres: [] };
    const g = s.slice(0, colonIdx).trim();
    const sg = s.slice(colonIdx + 1).trim();
    return { genres: g ? [g] : [], subgenres: sg ? [sg] : [] };
}

const lower = (v) => String(v ?? '').trim().toLowerCase();
const tagsOf = (t) => (Array.isArray(t?.tags) && t.tags.length ? t.tags : String(t?.comments || '').split(',')).map(lower).filter(Boolean);
const finiteBpm = (t) => { const n = Number(t?.bpm); return Number.isFinite(n) && n > 0 ? n : null; };
const finiteYear = (t) => { if (t?.year === '' || t?.year == null) return null; const n = Number(t.year); return Number.isFinite(n) ? n : null; };
const addedDay = (t) => String(t?.date_added || '').slice(0, 10);
const dayShift = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const RELATION_KINDS = ['alias-of', 'member-of', 'sublabel-of'];

export const OPS = Object.freeze({
    'is': { label: 'is' }, 'is-not': { label: 'is not' },
    'between': { label: 'between' }, 'not-between': { label: 'not between' },
    'within': { label: 'within' }, 'not-within': { label: 'not within' },
    'contains': { label: 'contains' }, 'not-contains': { label: 'does not contain' },
    'in-gig': { label: 'in gig' }, 'in-lane': { label: 'in playlist' }, 'in-no-gig': { label: 'in no gig' },
});

const facet = (facetName, label, get) => ({ ops: ['is', 'is-not'], kind: 'facet', facet: facetName, label, get });
const text = (label, get) => ({ ops: ['contains', 'not-contains'], kind: 'text', label, get });
export const FIELDS = Object.freeze({
    'artist':   facet('artists',   'artist',   (t) => [lower(t.artist)]),
    'label':    facet('labels',    'label',    (t) => [lower(t.label)]),
    'album':    facet('albums',    'album',    (t) => [lower(t.album)]),
    'genre':    facet('genres',    'genre',    (t) => splitGenreField(t.genre).genres.map(lower)),
    'subgenre': facet('subgenres', 'subgenre', (t) => splitGenreField(t.genre).subgenres.map(lower)),
    'tag':      facet('tags',      'tag',      tagsOf),
    'year':     { ...facet('years', 'year', (t) => [lower(t.year)]), ops: ['is', 'is-not', 'between'], num: finiteYear },
    'source':   facet('sources',   'source',   (t) => [lower(t.source), lower(t.platform)]),
    'key':      facet('keys',      'key',      (t) => [String(t.tonality ?? '').trim()]),
    'bpm':      { ops: ['between', 'not-between'], kind: 'range', label: 'BPM' },
    'added':    { ops: ['between', 'within', 'not-within'], kind: 'date', label: 'added' },
    'title':       text('title',    (t) => [t.title]),
    'artist-text': text('artist',   (t) => [t.artist]),
    'album-text':  text('album',    (t) => [t.album]),
    'comments':    text('comments', (t) => [t.comments]),
    'any-text':    text('any text', (t) => [t.title, t.artist, t.album, t.label, t.genre, t.comments, ...(Array.isArray(t.tags) ? t.tags : [])]),
    'gig':             { ops: ['in-gig', 'in-lane', 'in-no-gig'], kind: 'gig', label: 'gig', source: 'gigs' },
    'key-compatible':  { ops: ['is'], kind: 'key-compatible', label: 'key compatible with' },
    'evidence-missing': { ops: ['is'], kind: 'evidence', label: 'missing evidence', source: 'this collection' },
    'co-occurs':       { ops: ['is'], kind: 'co-occurs', label: 'tag co-occurs with', source: 'this collection' },
    'relation':        { ops: ['is'], kind: 'relation', label: 'related to', source: 'Discogs' },
    'audio-neighbour': { ops: ['is'], kind: 'audio', label: 'sounds like', source: 'audio analysis', disabled: 'needs Discover phase 2a' },
});

export function emptyRules() { return { join: 'all', groups: [] }; }

const hasValue = (rule) => {
    const v = rule?.value;
    if (v == null) return rule?.op === 'in-no-gig';
    if (typeof v === 'string') return v.trim() !== '';
    if (typeof v === 'number') return Number.isFinite(v);
    if (typeof v === 'object') {
        if ('min' in v || 'max' in v) return v.min != null || v.max != null;
        if ('days' in v) return Number(v.days) > 0;
        if ('from' in v || 'to' in v) return Boolean(v.from || v.to);
        if ('laneName' in v) return Boolean(String(v.laneName || '').trim());
        if ('gigId' in v) return Boolean(v.gigId);
        if ('tag' in v) return Boolean(String(v.tag || '').trim());
        if ('entity' in v) return Boolean(v.entity);
        if ('trackId' in v) return Boolean(v.trackId);
    }
    return false;
};

export function isEmptyRules(rules) {
    return !(Array.isArray(rules?.groups) && rules.groups.some((g) => Array.isArray(g?.rules) && g.rules.some(hasValue)));
}

const skip = (reason) => ({ skip: true, reason });
const test = (fn) => ({ test: fn });
const negate = (op) => op.startsWith('not-') || op.endsWith('-not');

export function buildCooccurrence(tracks) {
    const out = new Map();
    for (const t of Array.isArray(tracks) ? tracks : []) {
        const tags = [...new Set(tagsOf(t))];
        for (const a of tags) {
            if (!out.has(a)) out.set(a, new Map());
            const row = out.get(a);
            for (const b of tags) if (b !== a) row.set(b, (row.get(b) || 0) + 1);
        }
    }
    return out;
}

export function buildRelationAdjacency(relations) {
    const adj = new Map();
    const add = (from, to, kind) => { if (!adj.has(from)) adj.set(from, []); adj.get(from).push({ id: to, kind }); };
    for (const r of Array.isArray(relations) ? relations : []) {
        const a = r?.from?.local, b = r?.to?.local;
        if (!a || !b || a === b || !RELATION_KINDS.includes(r.kind)) continue;
        add(a, b, r.kind); add(b, a, r.kind);
    }
    return adj;
}

function reachable(adjacency, seed, kinds, hops) {
    const allowed = new Set(kinds?.length ? kinds : RELATION_KINDS);
    const seen = new Set([seed]);
    let frontier = [seed];
    for (let h = 0; h < Math.max(1, Math.min(2, hops | 0)) && frontier.length; h++) {
        const next = [];
        for (const id of frontier) for (const n of adjacency.get(id) || []) {
            if (!allowed.has(n.kind) || seen.has(n.id)) continue;
            seen.add(n.id); next.push(n.id);
        }
        frontier = next;
    }
    seen.delete(seed);
    return seen;
}

export function compileRule(rule, context = {}) {
    const spec = FIELDS[rule?.field];
    if (!spec || !spec.ops.includes(rule?.op)) return skip('unknown rule');
    if (spec.disabled) return skip(spec.disabled);
    if (!hasValue(rule)) return skip('empty rule');
    const { op, value } = rule;
    const neg = negate(op);
    switch (spec.kind) {
        case 'facet': {
            if (op === 'between' && spec.num) {
                const lo = value.min == null ? null : Number(value.min), hi = value.max == null ? null : Number(value.max);
                return test((t) => { const n = spec.num(t); return n != null && (lo == null || n >= lo) && (hi == null || n <= hi); });
            }
            const want = spec.facet === 'keys' ? String(value).trim() : lower(value);
            return test((t) => spec.get(t).includes(want) !== neg);
        }
        case 'text': {
            const q = lower(value);
            return test((t) => spec.get(t).some((s) => lower(s).includes(q)) !== neg);
        }
        case 'range': {
            const lo = value.min == null ? null : Number(value.min), hi = value.max == null ? null : Number(value.max);
            const inside = (t) => { const n = finiteBpm(t); return n != null && (lo == null || n >= lo) && (hi == null || n <= hi); };
            return test((t) => inside(t) !== neg);
        }
        case 'date': {
            if (op === 'between') {
                const from = value.from || '', to = value.to || '';
                return test((t) => { const d = addedDay(t); return Boolean(d) && (!from || d >= from) && (!to || d <= to); });
            }
            const since = dayShift(Number(value.days));
            return test((t) => { const d = addedDay(t); return (Boolean(d) && d >= since) !== neg; });
        }
        case 'key-compatible': {
            const allowed = expandCamelotCompatible([String(value).trim()]);
            return test((t) => Boolean(t.tonality) && allowed.has(String(t.tonality).trim()));
        }
        case 'gig': {
            const index = context.membershipIndex;
            if (!index || typeof index.get !== 'function') return skip('needs gig membership');
            const entries = (t) => index.get(String(t.id)) || [];
            if (op === 'in-no-gig') return test((t) => entries(t).length === 0);
            if (op === 'in-gig') return test((t) => entries(t).some((e) => String(e.gigId) === String(value.gigId)));
            const lane = lower(value.laneName);
            return test((t) => entries(t).some((e) => lower(e.laneName) === lane && (!value.gigId || String(e.gigId) === String(value.gigId))));
        }
        case 'evidence': {
            if (value === 'analysis') {
                if (!context.soundStatusIndex) return skip('needs sound check data');
                return test((t) => { const item = soundStatusForTrack(t, context.soundStatusIndex); return !item || item.scanStatus === 'unscanned'; });
            }
            if (value === 'credits') {
                if (!context.credits || typeof context.credits.has !== 'function') return skip('needs Discogs credits');
                return test((t) => { const rid = t.discogs_id; return rid == null || rid === '' || !context.credits.has(String(rid)); });
            }
            if (value === 'identity') {
                if (!Array.isArray(context.identities)) return skip('needs Discogs identities');
                const confirmed = new Set(context.identities.filter((r) => r?.resolution === 'confirmed').map((r) => r.entityId));
                return test((t) => !t.artist || !confirmed.has(entityId('artist', t.artist)));
            }
            return skip('unknown rule');
        }
        case 'co-occurs': {
            const co = context.cooccurrence || buildCooccurrence(context.tracks);
            const row = co.get(lower(value.tag)) || new Map();
            const min = Math.max(1, Number(value.min) || 1);
            const partners = new Set([...row].filter(([, n]) => n >= min).map(([tag]) => tag));
            return test((t) => tagsOf(t).some((tag) => partners.has(tag)));
        }
        case 'relation': {
            if (!Array.isArray(context.relations)) return skip('needs Discover relations');
            const adjacency = context.relationAdjacency || buildRelationAdjacency(context.relations);
            const near = reachable(adjacency, String(value.entity), value.kinds, value.hops ?? 1);
            return test((t) => (Boolean(t.artist) && near.has(entityId('artist', t.artist))) || (Boolean(t.label) && near.has(entityId('label', t.label))));
        }
        default:
            return skip('unknown rule');
    }
}

export function compileGroups(rules, context = {}) {
    const ctx = { ...context };
    if (!ctx.cooccurrence && Array.isArray(ctx.tracks)) ctx.cooccurrence = buildCooccurrence(ctx.tracks);
    if (!ctx.relationAdjacency && Array.isArray(ctx.relations)) ctx.relationAdjacency = buildRelationAdjacency(ctx.relations);
    const skipped = [];
    const groups = [];
    (Array.isArray(rules?.groups) ? rules.groups : []).forEach((group, groupIndex) => {
        const tests = [];
        (Array.isArray(group?.rules) ? group.rules : []).forEach((rule, ruleIndex) => {
            const compiled = compileRule(rule, ctx);
            if (compiled.skip) skipped.push({ groupIndex, ruleIndex, reason: compiled.reason });
            else tests.push(compiled.test);
        });
        if (!tests.length) return;
        groups.push(group?.join === 'any' ? (t) => tests.some((fn) => fn(t)) : (t) => tests.every((fn) => fn(t)));
    });
    const any = rules?.join === 'any';
    const fn = !groups.length ? () => true : any ? (t) => groups.some((g) => g(t)) : (t) => groups.every((g) => g(t));
    return { test: fn, skipped };
}

// The flat FilterEngine state expressed as rules. Today's engine ORs values
// within a facet and joins facets by matchMode, so: match-all lifts to one
// `any` group per facet (values OR'd) joined by `all`; match-any lifts every
// facet value into one `any` group. BPM and date ranges become a trailing
// `all` group either way. search and ids are not rules (they live outside
// the panel).
export function liftFlatState(state) {
    const s = state || {};
    const facets = [['artists', 'artist'], ['labels', 'label'], ['albums', 'album'], ['genres', 'genre'], ['subgenres', 'subgenre'], ['tags', 'tag'], ['years', 'year'], ['sources', 'source']];
    const perFacet = [];
    for (const [key, field] of facets) {
        const values = Array.isArray(s[key]) ? s[key] : [];
        if (values.length) perFacet.push(values.map((v) => ({ field, op: 'is', value: v })));
    }
    const keys = Array.isArray(s.keys) ? s.keys : [];
    if (keys.length) perFacet.push(keys.map((v) => ({ field: s.camelotCompatible ? 'key-compatible' : 'key', op: 'is', value: v })));
    const ranges = [];
    if (s.bpmRange && (s.bpmRange.min != null || s.bpmRange.max != null)) ranges.push({ field: 'bpm', op: 'between', value: { min: s.bpmRange.min ?? null, max: s.bpmRange.max ?? null } });
    if (s.yearRange) ranges.push({ field: 'year', op: 'between', value: { min: s.yearRange.min, max: s.yearRange.max } });
    if (s.dateAddedRange?.from || s.dateAddedRange?.to) ranges.push({ field: 'added', op: 'between', value: { from: s.dateAddedRange.from || '', to: s.dateAddedRange.to || '' } });
    const groups = s.matchMode === 'any'
        ? (perFacet.length ? [{ join: 'any', rules: perFacet.flat() }] : [])
        : perFacet.map((rules) => ({ join: 'any', rules }));
    if (ranges.length) groups.push({ join: 'all', rules: ranges });
    return { join: 'all', groups };
}

const describeValue = (rule) => {
    const v = rule.value;
    switch (rule.op) {
        case 'between': return v?.from !== undefined ? `${v.from || '…'}–${v.to || '…'}` : `${v?.min ?? '…'}–${v?.max ?? '…'}`;
        case 'not-between': return `not ${v?.min ?? '…'}–${v?.max ?? '…'}`;
        case 'within': return `within ${v?.days} days`;
        case 'not-within': return `not within ${v?.days} days`;
        case 'contains': return `contains "${v}"`;
        case 'not-contains': return `does not contain "${v}"`;
        case 'in-gig': return `in gig ${v?.gigName || v?.gigId}`;
        case 'in-lane': return `in playlist ${v?.laneName}${v?.gigName ? ` of ${v.gigName}` : ''}`;
        case 'in-no-gig': return 'in no gig';
        default: break;
    }
    switch (rule.field) {
        case 'evidence-missing': return `missing ${v}`;
        case 'co-occurs': return `co-occurs with ${v?.tag} ≥ ${v?.min}`;
        case 'relation': return `related to ${v?.entity} within ${v?.hops ?? 1} hop${(v?.hops ?? 1) === 1 ? '' : 's'}`;
        case 'audio-neighbour': return `sounds like ${v?.trackId} ≤ ${v?.max}`;
        default: return rule.op === 'is-not' ? `is not ${v}` : `is ${v}`;
    }
};

export function describeRules(rules) {
    if (isEmptyRules(rules)) return '';
    const groupText = (group) => {
        const rules = (group.rules || []).filter(hasValue);
        const parts = [];
        for (let i = 0; i < rules.length; i++) {
            const r = rules[i];
            // A facet's values join into one phrase; a range on one (year between) reads as a range.
            const simple = FIELDS[r.field]?.kind === 'facet' && r.op !== 'between';
            if (simple) {
                const run = [r];
                while (i + 1 < rules.length && rules[i + 1].field === r.field && rules[i + 1].op === r.op && FIELDS[rules[i + 1].field]?.kind === 'facet') run.push(rules[++i]);
                const values = run.map((x) => x.value).join(group.join === 'any' ? ' or ' : ', ');
                parts.push(`${FIELDS[r.field].label} ${r.op === 'is-not' ? 'is not' : 'is'} ${values}`);
            } else {
                const label = FIELDS[r.field]?.label || r.field;
                const desc = describeValue(r);
                parts.push(['bpm', 'added'].includes(r.field) ? `${label} ${desc}` : ['gig', 'evidence-missing', 'co-occurs', 'relation', 'audio-neighbour'].includes(r.field) ? desc : `${label} ${desc}`);
            }
        }
        return parts.join(group.join === 'any' ? ' or ' : ', ');
    };
    const texts = (rules.groups || []).map(groupText).filter(Boolean);
    return texts.join(rules.join === 'any' ? ' · or ' : ' · and ');
}

const MAX_SEGMENT = 4096;

export function encodeRules(rules) {
    const seg = 'v1:' + encodeURIComponent(JSON.stringify(rules));
    return seg.length > MAX_SEGMENT ? null : seg;
}

export function decodeRules(segment) {
    if (typeof segment !== 'string' || segment.length > MAX_SEGMENT || !segment.startsWith('v1:')) return null;
    let parsed;
    try { parsed = JSON.parse(decodeURIComponent(segment.slice(3))); } catch (_) { return null; }
    if (!parsed || typeof parsed !== 'object' || !['any', 'all'].includes(parsed.join) || !Array.isArray(parsed.groups)) return null;
    for (const g of parsed.groups) {
        if (!g || typeof g !== 'object' || !['any', 'all'].includes(g.join) || !Array.isArray(g.rules)) return null;
        for (const r of g.rules) {
            if (!r || typeof r !== 'object' || !FIELDS[r.field] || !FIELDS[r.field].ops.includes(r.op) || !('value' in r)) return null;
            if (r.value && typeof r.value === 'object' && ('groups' in r.value || 'rules' in r.value)) return null;
        }
    }
    return parsed;
}

// Discover bridge: a Discogs relation edge becomes a live rule anchored on
// its local endpoint (source first). Other kinds keep the frozen id list.
export function relationRuleForEdge(edge, nodesById) {
    if (!edge || !RELATION_KINDS.includes(edge.kind)) return null;
    const isLocal = (id) => { const n = nodesById?.get?.(id); return n ? !n.outside : typeof id === 'string' && !id.includes(':@discogs:'); };
    const entity = [edge.source, edge.target].find((id) => id && isLocal(id));
    if (!entity) return null;
    return { field: 'relation', op: 'is', value: { entity, kinds: [edge.kind], hops: 1 } };
}
