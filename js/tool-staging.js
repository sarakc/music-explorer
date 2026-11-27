// What Approve stages for the shared Tools list. `planStage` is pure: it turns
// the selected rows' choices into pending tag diffs, approvals, conflicts and
// rows held back by the batch cap. `applyStagePlan` writes the diffs.
import { effectiveTrack, genreWithSubgenre } from './tool-rules.js';
import { parseCommentTags, serializeCommentTags } from './sound-quality-tags.js';

const str = (v) => String(v ?? '');
const stagedPath = (t) => t.local_path || t.path || `umm:track/${t.id}`;

/**
 * The field values a row's choices produce, from the track's current values.
 * choices: { [field]: { value, via: 'chip'|'typed' } }, plus `subgenre`, and
 * `tags: { add: string[] }` for Comments.
 */
export function rowChanges(current, choices = {}) {
    const out = {};
    for (const [field, choice] of Object.entries(choices)) {
        if (!choice || field === 'subgenre' || field === 'tags') continue;
        out[field] = { value: choice.value, via: choice.via };
    }
    if (choices.subgenre?.value) {
        const base = out.genre ? out.genre.value : current.genre;
        out.genre = { value: genreWithSubgenre(base, choices.subgenre.value), via: out.genre?.via || 'typed' };
    }
    if (choices.tags?.add?.length) {
        const tags = [...parseCommentTags(current.comments), ...choices.tags.add];
        const next = serializeCommentTags(tags);
        if (next !== str(current.comments)) out.comments = { value: next, via: 'tags', tags: choices.tags.add };
    }
    return out;
}

function sourceFor(tool, field, via) {
    if (tool === 'formatting') return 'tools:formatting';
    if (via === 'tags') return 'tools:tags';
    if (field === 'label' && via === 'chip') return 'tools:label';
    return 'tools:fields';
}

/**
 * @param {string} tool
 * @param {Array<{ row, choices }>} items selected rows in list order
 * @param {{ fresh: Map<string, object>, diffs: object[], batchCap: number }} ctx
 *   fresh: re-read stored tracks; diffs: every pending diff now staged
 */
export function planStage(tool, items, { fresh, diffs = [], batchCap = 2000 }) {
    const staged = new Set(diffs.map((d) => str(d.trackId)));
    const plan = { stage: [], approve: [], conflicts: [], overCap: [] };
    let capHit = false;
    for (const { row, choices } of items) {
        const id = str(row.id);
        const stored = fresh.get(id);
        if (!stored) { plan.conflicts.push(id); continue; }
        const mine = diffs.filter((d) => str(d.trackId) === id);
        const current = effectiveTrack(stored, mine);
        const changes = rowChanges(current, choices);
        const fields = Object.keys(changes);
        // Anything the row changes must still read as it did when the list loaded.
        const touched = new Set(fields);
        if (choices.subgenre?.value) touched.add('genre');
        if ([...touched].some((f) => str(current[f]) !== str(row.values?.[f]))) { plan.conflicts.push(id); continue; }
        if (fields.length && !staged.has(id)) {
            if (capHit || staged.size + 1 > batchCap) { capHit = true; plan.overCap.push(id); continue; }
            staged.add(id);
        }
        const accepted = {};
        for (const field of fields) {
            const c = changes[field];
            const existing = mine.find((d) => d.field === field);
            plan.stage.push({
                trackId: id, path: stagedPath(stored), field, oldValue: stored[field] ?? '',
                proposedValue: c.value, source: existing?.source || sourceFor(tool, field, c.via),
            });
            accepted[field] = field === 'comments' ? c.tags : c.value;
        }
        plan.approve.push({ trackId: id, shown: row.keys || [], accepted });
    }
    return plan;
}

/** Stage every diff; a track whose diff failed is dropped from the approvals. */
export async function applyStagePlan(plan, { pendingDiffs }) {
    const failed = new Set();
    for (const input of plan.stage) {
        if (failed.has(input.trackId)) continue;
        try { await pendingDiffs.stage(input); } catch (err) { console.warn('stage failed', input.trackId, err); failed.add(input.trackId); }
    }
    return { approve: plan.approve.filter((a) => !failed.has(a.trackId)), failed: [...failed] };
}
