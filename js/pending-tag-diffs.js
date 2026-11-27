// Persistent, review-only tag changes. A record here is deliberately not a
// track update and never implies a filesystem write; P3.2c renders these
// records for explicit review and P3.2d is the only code allowed to submit one.

export const PENDING_TAG_DIFF_STORE = 'pending_tag_diffs';

const cloneValue = (value) => {
    if (value === undefined) return null;
    return structuredClone(value);
};

const requiredText = (value, name) => {
    const text = String(value ?? '').trim();
    if (!text) throw new TypeError(`pending tag diff ${name} is required`);
    return text;
};

export function pendingTagDiffId(trackId, field) {
    return JSON.stringify([requiredText(trackId, 'trackId'), requiredText(field, 'field')]);
}

export function createPendingTagDiff({
    trackId,
    path,
    field,
    oldValue,
    proposedValue,
    source = 'manual',
    stagedAt = Date.now(),
} = {}) {
    const normalizedTrackId = requiredText(trackId, 'trackId');
    const normalizedField = requiredText(field, 'field');
    const timestamp = Number(stagedAt);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        throw new TypeError('pending tag diff stagedAt must be a positive timestamp');
    }

    return {
        id: pendingTagDiffId(normalizedTrackId, normalizedField),
        trackId: normalizedTrackId,
        path: requiredText(path, 'path'),
        field: normalizedField,
        oldValue: cloneValue(oldValue),
        proposedValue: cloneValue(proposedValue),
        source: requiredText(source, 'source'),
        stagedAt: timestamp,
    };
}

/**
 * Keeps one reviewable proposed value per track + field. Re-staging a field
 * preserves its first oldValue, so the drawer always compares with the value
 * that was present when the user began reviewing changes.
 */
export class PendingTagDiffs {
    constructor(database) {
        if (!database) throw new TypeError('PendingTagDiffs requires a database');
        this.database = database;
    }

    async stage(input) {
        const next = createPendingTagDiff(input);
        const existing = await this.database.getPendingTagDiff(next.id);
        const record = existing
            ? createPendingTagDiff({ ...next, oldValue: existing.oldValue })
            : next;
        await this.database.putPendingTagDiff(record);
        return record;
    }

    async get(trackId, field) {
        return this.database.getPendingTagDiff(pendingTagDiffId(trackId, field));
    }

    async list(trackId) {
        return this.database.listPendingTagDiffs(trackId == null ? null : String(trackId));
    }

    async discard(trackId, field) {
        await this.database.deletePendingTagDiff(pendingTagDiffId(trackId, field));
    }

    async discardAll(trackId) {
        await this.database.clearPendingTagDiffs(trackId == null ? null : String(trackId));
    }
}
