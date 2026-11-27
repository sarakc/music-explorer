// Pure windowing maths for the virtualized Collection table. No DOM here:
// the caller measures scrollTop, viewport height and row height, and draws
// the rows between a top and a bottom spacer.

export const ROW_BUFFER = 20;
// A redraw is skipped until the ideal window has drifted this many rows.
export const REDRAW_THRESHOLD = 10;

const EMPTY = Object.freeze({ start: 0, end: 0, topSpacer: 0, bottomSpacer: 0 });

/** Rows [start, end) to render, plus the spacer heights for the rest. */
export function computeWindow({ scrollTop = 0, viewportHeight = 0, rowHeight, total, buffer = ROW_BUFFER }) {
    if (!(total > 0) || !(rowHeight > 0)) return { ...EMPTY };
    const top = Math.max(0, scrollTop);
    const firstVisible = Math.min(total - 1, Math.floor(top / rowHeight));
    const lastVisible = Math.min(total, Math.ceil((top + Math.max(0, viewportHeight)) / rowHeight));
    const start = Math.max(0, firstVisible - buffer);
    const end = Math.min(total, Math.max(lastVisible, firstVisible + 1) + buffer);
    return {
        start,
        end,
        topSpacer: start * rowHeight,
        bottomSpacer: (total - end) * rowHeight,
    };
}

/** True when the rendered window has drifted far enough from the ideal one. */
export function shouldRedraw(current, next, threshold = REDRAW_THRESHOLD) {
    if (!current) return true;
    return Math.abs(current.start - next.start) >= threshold
        || Math.abs(current.end - next.end) >= threshold;
}

/** scrollTop that brings row `index` fully into view; unchanged if it already is. */
export function scrollTopForRow({ index, rowHeight, scrollTop, viewportHeight, headerHeight = 0 }) {
    const rowTop = index * rowHeight;
    const rowBottom = rowTop + rowHeight;
    if (rowTop < scrollTop + headerHeight) return Math.max(0, rowTop - headerHeight);
    if (rowBottom > scrollTop + viewportHeight) return Math.max(0, rowBottom - viewportHeight);
    return scrollTop;
}
