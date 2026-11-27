// ChartRenderer: skin-aware charts. Colors come from CSS custom properties
// at render time so skin changes propagate to live charts via `skin-changed`.

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Convert a #rrggbb (or short #rgb) to `rgba(r,g,b,a)`. Chart.js fills need an
// alpha channel; CSS vars give us opaque hex, so we blend in JS.
function withAlpha(hex, alpha) {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
}

// Pull all per-render colors from CSS vars each call. Cheap — these are just
// getComputedStyle reads — and keeps charts honest about the current skin.
function theme() {
    const palette = [
        cssVar('--chart-palette-0'),
        cssVar('--chart-palette-1'),
        cssVar('--chart-palette-2'),
        cssVar('--chart-palette-3'),
        cssVar('--chart-palette-4'),
        cssVar('--chart-palette-5'),
    ].filter(Boolean);
    const text = cssVar('--text-dim') || cssVar('--text');
    const border = cssVar('--border');
    const accent = cssVar('--accent') || cssVar('--accent-warm');
    const accentCool = cssVar('--accent-cool') || accent;
    return {
        palette,
        color: text,
        borderColor: withAlpha(border || text, 0.35),
        accent,
        accentCool,
        font: { family: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif' },
    };
}

// Expand the 6-slot palette by cycling when a chart needs more colors
// (doughnut/bar with many categories). Cycling beats generating ad-hoc
// tints — stays on-skin, no low-contrast accidents.
function paletteFor(count) {
    const { palette } = theme();
    if (!palette.length) return [];
    const out = [];
    for (let i = 0; i < count; i++) out.push(palette[i % palette.length]);
    return out;
}

// Build parallel arrays of border colors/widths for per-element selection
// highlight. Non-selected items get 0-width; selected get a 2px accent stroke.
// `labels` = labels Chart.js will plot, `selectedSet` = Set of label strings.
function selectionBorders(labels, selectedSet, accent) {
    const isSel = (lbl) => selectedSet && selectedSet.has(String(lbl));
    const borderColors = labels.map((l) => (isSel(l) ? accent : 'transparent'));
    const borderWidths = labels.map((l) => (isSel(l) ? 2 : 0));
    return { borderColors, borderWidths };
}

// Build tooltip.callbacks from a per-element provider returning { primary, related: string[] }.
// Falls back to the default formatter when no provider returns a payload.
function buildTooltipCallbacks(tooltipFor, labels, data) {
    if (typeof tooltipFor !== 'function') return undefined;
    return {
        label(ctx) {
            const value = ctx.parsed?.y ?? ctx.parsed?.x ?? ctx.parsed;
            const info = tooltipFor(labels[ctx.dataIndex], value, ctx.dataIndex) || {};
            return info.primary || `${ctx.label}: ${value}`;
        },
        afterBody(items) {
            if (!items?.length) return [];
            const item = items[0];
            const value = item.parsed?.y ?? item.parsed?.x ?? item.parsed;
            const info = tooltipFor(labels[item.dataIndex], value, item.dataIndex) || {};
            return Array.isArray(info.related) ? info.related : [];
        },
    };
}

// Find the first hit element under a mouse event — used by right-click handler.
function pickElement(chart, event) {
    const els = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    return els && els.length ? els[0] : null;
}

function attachContextMenu(canvasId, chart, labels, onContextMenu) {
    if (typeof onContextMenu !== 'function') return;
    const el = document.getElementById(canvasId);
    if (!el) return;
    const handler = (ev) => {
        const hit = pickElement(chart, ev);
        if (!hit) return;
        ev.preventDefault();
        const value = chart.data.datasets[hit.datasetIndex].data[hit.index];
        onContextMenu({
            label: labels[hit.index],
            value,
            index: hit.index,
            clientX: ev.clientX,
            clientY: ev.clientY,
        });
    };
    el.addEventListener('contextmenu', handler);
    chart.$ctxHandler = handler;
    chart.$ctxEl = el;
}

// Module-level registry of live charts so we can re-theme on skin-changed.
// Every render adds to this; destroy() removes. We also stash a $rethemer
// closure on each chart that re-reads CSS vars and writes them into the
// chart's existing options/datasets, then calls update('none').
const _liveCharts = new Set();

function rethemeAll() {
    for (const chart of _liveCharts) {
        try {
            if (typeof chart.$rethemer === 'function') chart.$rethemer();
            chart.update('none');
        } catch (_) { /* chart may be mid-destroy */ }
    }
}

globalThis.document?.addEventListener('skin-changed', rethemeAll);

class ChartRenderer {
    constructor() {
        this._instances = {};
    }

    destroy(canvasId) {
        const inst = this._instances[canvasId];
        if (inst) {
            if (inst.$ctxEl && inst.$ctxHandler) {
                inst.$ctxEl.removeEventListener('contextmenu', inst.$ctxHandler);
            }
            _liveCharts.delete(inst);
            inst.destroy();
            delete this._instances[canvasId];
        }
    }

    _getCtx(canvasId) {
        this.destroy(canvasId);
        const el = document.getElementById(canvasId);
        if (!el) return null;
        return el.getContext('2d');
    }

    _register(canvasId, chart, rethemer) {
        chart.$rethemer = rethemer;
        this._instances[canvasId] = chart;
        _liveCharts.add(chart);
    }

    renderDoughnut(canvasId, labels, data, onClick, opts = {}) {
        const ctx = this._getCtx(canvasId);
        if (!ctx) return;

        const t = theme();
        const selectedSet = opts.selected instanceof Set ? opts.selected : null;
        const sel = selectionBorders(labels, selectedSet, t.accent);
        const tooltipCallbacks = buildTooltipCallbacks(opts.tooltipFor, labels, data);
        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: paletteFor(labels.length),
                    borderColor: sel.borderColors,
                    borderWidth: sel.borderWidths,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: t.color, font: { size: 12 }, padding: 12 },
                    },
                    tooltip: tooltipCallbacks ? { callbacks: tooltipCallbacks } : undefined,
                },
                onClick: onClick ? (e, elements) => {
                    if (elements.length) onClick(labels[elements[0].index], data[elements[0].index], elements[0].index, e.native);
                } : undefined,
            },
        });
        this._register(canvasId, chart, () => {
            const th = theme();
            const s = selectionBorders(labels, selectedSet, th.accent);
            chart.data.datasets[0].backgroundColor = paletteFor(labels.length);
            chart.data.datasets[0].borderColor = s.borderColors;
            chart.data.datasets[0].borderWidth = s.borderWidths;
            if (chart.options.plugins?.legend?.labels) {
                chart.options.plugins.legend.labels.color = th.color;
            }
        });
        attachContextMenu(canvasId, chart, labels, opts.onContextMenu);
        return chart;
    }

    renderHorizontalBar(canvasId, labels, data, { maxItems = 15, onClick, onLabelClick, tooltipFor, onContextMenu, selected } = {}) {
        const ctx = this._getCtx(canvasId);
        if (!ctx) return;

        const trimmed = labels.slice(0, maxItems);
        const trimmedData = data.slice(0, maxItems);
        const tooltipCallbacks = buildTooltipCallbacks(tooltipFor, trimmed, trimmedData);
        const t = theme();
        const selectedSet = selected instanceof Set ? selected : null;
        const sel = selectionBorders(trimmed, selectedSet, t.accent);

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: trimmed,
                datasets: [{
                    data: trimmedData,
                    backgroundColor: paletteFor(trimmed.length),
                    borderColor: sel.borderColors,
                    borderWidth: sel.borderWidths,
                    borderRadius: 4,
                    borderSkipped: false,
                }],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: tooltipCallbacks ? { callbacks: tooltipCallbacks } : undefined,
                },
                scales: {
                    x: {
                        ticks: { color: t.color },
                        grid: { color: t.borderColor },
                    },
                    y: {
                        ticks: { color: t.color, font: { size: 11 }, autoSkip: false },
                        grid: { display: false },
                    },
                },
                onClick: (onClick || onLabelClick) ? (e, elements, chartRef) => {
                    if (elements.length) { onClick?.(trimmed[elements[0].index], trimmedData[elements[0].index], elements[0].index, e.native); return; }
                    const i = onLabelClick ? nameIndexAt(e, chartRef, trimmed.length) : null;
                    if (i != null) onLabelClick(trimmed[i], i, e.native);
                } : undefined,
                onHover: onLabelClick ? (e, elements, chartRef) => {
                    const canvas = chartRef?.canvas;
                    if (canvas) canvas.style.cursor = elements.length || nameIndexAt(e, chartRef, trimmed.length) != null ? 'pointer' : '';
                } : undefined,
            },
        });
        this._register(canvasId, chart, () => {
            const th = theme();
            const s = selectionBorders(trimmed, selectedSet, th.accent);
            chart.data.datasets[0].backgroundColor = paletteFor(trimmed.length);
            chart.data.datasets[0].borderColor = s.borderColors;
            chart.data.datasets[0].borderWidth = s.borderWidths;
            chart.options.scales.x.ticks.color = th.color;
            chart.options.scales.x.grid.color = th.borderColor;
            chart.options.scales.y.ticks.color = th.color;
        });
        attachContextMenu(canvasId, chart, trimmed, onContextMenu);
        return chart;
    }

    renderVerticalBar(canvasId, labels, data, { onClick, tooltipFor, onContextMenu, selected, selectionKeys } = {}) {
        const ctx = this._getCtx(canvasId);
        if (!ctx) return;

        const tooltipCallbacks = buildTooltipCallbacks(tooltipFor, labels, data);
        const t = theme();
        // `selected` is a Set of raw keys. `selectionKeys` (optional) is a
        // parallel array to `labels` holding the raw key for each bar — used
        // when display labels differ from selection values (e.g. acquisition
        // bars show formatted months but select on raw YYYY-MM).
        const selectedSet = selected instanceof Set ? selected : null;
        const keyList = Array.isArray(selectionKeys) ? selectionKeys : labels;
        const sel = selectionBorders(keyList, selectedSet, t.accent);
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: t.palette[1] || t.color,
                    hoverBackgroundColor: t.accent,
                    borderColor: sel.borderColors,
                    borderWidth: sel.borderWidths,
                    borderRadius: 2,
                    borderSkipped: false,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: tooltipCallbacks ? { callbacks: tooltipCallbacks } : undefined,
                },
                scales: {
                    x: {
                        ticks: { color: t.color, font: { size: 10 }, maxRotation: 60, minRotation: 45, autoSkip: true, autoSkipPadding: 6 },
                        grid: { display: false },
                    },
                    y: {
                        ticks: { color: t.color, precision: 0 },
                        grid: { color: t.borderColor },
                        beginAtZero: true,
                    },
                },
                onClick: onClick ? (e, elements) => {
                    if (elements.length) onClick(labels[elements[0].index], data[elements[0].index], elements[0].index, e.native);
                } : undefined,
            },
        });
        this._register(canvasId, chart, () => {
            const th = theme();
            const s = selectionBorders(keyList, selectedSet, th.accent);
            const ds = chart.data.datasets[0];
            ds.backgroundColor = th.palette[1] || th.color;
            ds.hoverBackgroundColor = th.accent;
            ds.borderColor = s.borderColors;
            ds.borderWidth = s.borderWidths;
            chart.options.scales.x.ticks.color = th.color;
            chart.options.scales.y.ticks.color = th.color;
            chart.options.scales.y.grid.color = th.borderColor;
        });
        attachContextMenu(canvasId, chart, labels, onContextMenu);
        return chart;
    }

    renderTimeline(canvasId, labels, data, onClick, opts = {}) {
        const ctx = this._getCtx(canvasId);
        if (!ctx) return;

        const tooltipCallbacks = buildTooltipCallbacks(opts.tooltipFor, labels, data);
        const t = theme();
        const selectedSet = opts.selected instanceof Set ? opts.selected : null;
        const lineColor = t.palette[1] || t.color;
        const pointBg = labels.map((l) => (selectedSet && selectedSet.has(String(l)) ? t.accent : lineColor));
        const pointRadii = labels.map((l) => (selectedSet && selectedSet.has(String(l)) ? 6 : 3));
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    data,
                    borderColor: lineColor,
                    backgroundColor: withAlpha(lineColor, 0.10),
                    fill: true,
                    tension: 0.3,
                    pointRadius: pointRadii,
                    pointBackgroundColor: pointBg,
                    pointBorderColor: pointBg,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: tooltipCallbacks ? { callbacks: tooltipCallbacks } : undefined,
                },
                scales: {
                    x: {
                        ticks: { color: t.color, maxRotation: 45 },
                        grid: { color: t.borderColor },
                    },
                    y: {
                        ticks: { color: t.color },
                        grid: { color: t.borderColor },
                        beginAtZero: true,
                    },
                },
                onClick: onClick ? (e, elements) => {
                    if (elements.length) onClick(labels[elements[0].index], data[elements[0].index], elements[0].index, e.native);
                } : undefined,
            },
        });
        this._register(canvasId, chart, () => {
            const th = theme();
            const nextLine = th.palette[1] || th.color;
            const nextPoints = labels.map((l) => (selectedSet && selectedSet.has(String(l)) ? th.accent : nextLine));
            const ds = chart.data.datasets[0];
            ds.borderColor = nextLine;
            ds.backgroundColor = withAlpha(nextLine, 0.10);
            ds.pointBackgroundColor = nextPoints;
            ds.pointBorderColor = nextPoints;
            chart.options.scales.x.ticks.color = th.color;
            chart.options.scales.x.grid.color = th.borderColor;
            chart.options.scales.y.ticks.color = th.color;
            chart.options.scales.y.grid.color = th.borderColor;
        });
        attachContextMenu(canvasId, chart, labels, opts.onContextMenu);
        return chart;
    }
}

/** The bar name (y-axis label) under a point left of the plot area, or null. */
export function labelIndexAt({ x, y }, { left, top, bottom }, valueForPixel, count) {
    if (!(count > 0) || !(x < left) || y < top || y > bottom) return null;
    const i = Math.round(valueForPixel(y));
    return Number.isFinite(i) ? Math.max(0, Math.min(count - 1, i)) : null;
}

function nameIndexAt(e, chart, count) {
    const scale = chart?.scales?.y, area = chart?.chartArea;
    if (!scale || !area || e?.x == null) return null;
    return labelIndexAt({ x: e.x, y: e.y }, { left: area.left, top: scale.top, bottom: scale.bottom }, (py) => scale.getValueForPixel(py), count);
}

export default ChartRenderer;
