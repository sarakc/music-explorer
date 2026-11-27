import { PendingTagDiffs } from './pending-tag-diffs.js';
import { soundStatusForTrack, statusKey } from './sound-check-status.js';

export const REPLACEMENT_COMMENT_TAG = 'REPLACE ME';
export const SOUND_QUALITY_TAG_SOURCE = 'sound-check-quality';

const REPLACEMENT_ALIAS = /^replace\s*me$/i;
const REPLACEMENT_STATUSES = new Set(['do-not-play', 'replace-first']);

const text = (value) => String(value ?? '').trim();

export function isReplacementCommentTag(value) {
    return REPLACEMENT_ALIAS.test(text(value));
}

export function parseCommentTags(value) {
    const seen = new Set();
    const tags = [];
    for (const raw of String(value ?? '').split(',')) {
        const tag = raw.trim();
        if (!tag) continue;
        const key = tag.toLocaleLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        tags.push(tag);
    }
    return tags;
}

export function sortCommentTags(tags) {
    return [...tags]
        .map((tag, index) => ({ tag, index }))
        .sort((a, b) => (
            a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base' })
            || a.tag.localeCompare(b.tag)
            || a.index - b.index
        ))
        .map(({ tag }) => tag);
}

export function serializeCommentTags(tags) {
    return sortCommentTags(parseCommentTags((tags || []).join(','))).join(', ');
}

export function buildSoundQualityTagProposal(track, soundItem) {
    if (!track?.id) return null;
    const status = statusKey(soundItem);
    const before = String(track.comments ?? '');
    let tags = parseCommentTags(before);

    if (REPLACEMENT_STATUSES.has(status)) {
        tags = tags.filter((tag) => !isReplacementCommentTag(tag));
        tags.push(REPLACEMENT_COMMENT_TAG);
    } else if (status === 'no-detected-issue') {
        if (!tags.some(isReplacementCommentTag)) return null;
        tags = tags.filter((tag) => !isReplacementCommentTag(tag));
    } else {
        return null;
    }

    const after = serializeCommentTags(tags);
    if (after === before) return null;
    return {
        track,
        kind: REPLACEMENT_STATUSES.has(status) ? 'add' : 'remove-stale',
        status,
        before,
        after,
    };
}

export function collectSoundQualityTagProposals(tracks, soundIndex) {
    const proposals = [];
    for (const track of Array.isArray(tracks) ? tracks : []) {
        const proposal = buildSoundQualityTagProposal(track, soundStatusForTrack(track, soundIndex));
        if (proposal) proposals.push(proposal);
    }
    return proposals;
}

const stagedPath = (track) => track.local_path || track.path || `umm:track/${track.id}`;

/**
 * Stages exact Comments previews without touching a track row or audio file.
 * A row is a conflict when work already exists or the track changed after preview.
 */
export async function stageSoundQualityTagProposals({
    proposals,
    database,
    pendingDiffs = new PendingTagDiffs(database),
} = {}) {
    if (!database) throw new TypeError('sound quality tag staging requires a database');
    const result = { staged: [], conflicts: [], failed: [] };

    for (const proposal of Array.isArray(proposals) ? proposals : []) {
        const trackId = String(proposal?.track?.id ?? '');
        if (!trackId) {
            result.failed.push({ proposal, error: new Error('track id is required') });
            continue;
        }
        try {
            const [fresh, existing] = await Promise.all([
                database.getTrack(trackId),
                pendingDiffs.get(trackId, 'comments'),
            ]);
            if (existing) {
                result.conflicts.push({ proposal, reason: 'already-staged' });
                continue;
            }
            if (!fresh || String(fresh.comments ?? '') !== proposal.before) {
                result.conflicts.push({ proposal, reason: 'track-changed' });
                continue;
            }

            const refreshed = buildSoundQualityTagProposal(fresh, {
                scanStatus: 'analyzed',
                classification: proposal.status,
            });
            if (!refreshed || refreshed.after !== proposal.after || refreshed.kind !== proposal.kind) {
                result.conflicts.push({ proposal, reason: 'proposal-changed' });
                continue;
            }

            const record = await pendingDiffs.stage({
                trackId,
                path: stagedPath(fresh),
                field: 'comments',
                oldValue: proposal.before,
                proposedValue: proposal.after,
                source: SOUND_QUALITY_TAG_SOURCE,
            });
            result.staged.push(record);
        } catch (error) {
            result.failed.push({ proposal, error });
        }
    }

    return result;
}
