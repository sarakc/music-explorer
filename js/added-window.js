// Added's windows (filter band spec): presets counted back from today, with no end, and
// the words the band's Added button shows for a window.

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Today as YYYY-MM-DD, local time (`date_added` is a local day). */
export const todayIso = () => isoDay(new Date());

export const ADDED_PRESETS = [['30', '30 days'], ['90', '90 days'], ['year', 'This year']];

/** A preset ('30', '90' or 'year') as a window from `today` with no end, or null. */
export function addedPreset(key, today = todayIso()) {
    const [y, m, d] = today.split('-').map(Number);
    if (key === 'year') return { from: `${y}-01-01`, to: '' };
    const days = { 30: 30, 90: 90 }[key];
    if (!days) return null;
    return { from: isoDay(new Date(y, m - 1, d - days)), to: '' };
}

/** The preset key `range` is as of `today`, or null. */
export function addedPresetKey(range, today = todayIso()) {
    if (!range?.from || range.to) return null;
    return ADDED_PRESETS.find(([key]) => addedPreset(key, today)?.from === range.from)?.[0] || null;
}

/** What the Added button says after its label: a preset's name, or the dates; '' when unset. */
export function addedFace(range, today = todayIso()) {
    if (!range || (!range.from && !range.to)) return '';
    const preset = addedPresetKey(range, today);
    if (preset) return ADDED_PRESETS.find(([key]) => key === preset)[1];
    if (!range.to) return `from ${range.from}`;
    if (!range.from) return `to ${range.to}`;
    return `${range.from} – ${range.to}`;
}
