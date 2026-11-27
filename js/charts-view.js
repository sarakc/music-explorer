// Collection › Charts: the six collection charts as a full-width grid of cards.
// Selection (`sel`), drill and the Charts filter scope (`f`) live in app.js, as
// they did for the Map's strip; this module only lays the cards out.

import { CHART_ORDER, renderChartCards, wireChartCards } from './charts.js';

const DRILL_LABELS = { genres: 'Genres', labels: 'Labels', years: 'Released', acquisition: 'Added' };

export default class ChartsView {
    constructor({ app }) {
        this.app = app;
        this._generation = 0;
    }

    async render(route) {
        const app = this.app;
        const generation = ++this._generation;
        document.getElementById('viewTitle').textContent = 'Collection';
        document.getElementById('viewSubtitle').textContent = '';
        const area = document.getElementById('contentArea');
        const raw = await app._allTracks();
        if (generation !== this._generation) return;
        const all = app._discoverBaseTracks(raw);
        const scoped = app.getDiscoverSelectedTracks(all);
        const drill = app._discoverChartDrill;
        const tracks = drill?.levels?.length ? app._narrowTracksForDrill(drill.chartId, drill.levels, scoped) : scoped;
        const agg = app._computeChartAggregations(tracks);
        const crumbs = drill?.levels?.length
            ? `<div class="discover-drill-strip">${app._chartDrillBreadcrumbHtml(drill.chartId, drill.levels, DRILL_LABELS[drill.chartId] || drill.chartId)}</div>`
            : '';
        const cards = renderChartCards(app, agg, tracks, drill);
        area.innerHTML = `<div class="charts-view">${app._renderChartSelectionsRow(tracks.length, all.length)}${crumbs}<div class="discover-charts-strip charts-grid-view">${CHART_ORDER.map((id) => cards[id]).join('')}</div></div>`;
        app._wireChartSelectionRow(area);
        app._wireChartDrillBreadcrumbs(area);
        wireChartCards(app, area, agg, tracks, drill);
        const open = route?.chart && area.querySelector(`[data-chart-card="${route.chart}"]`);
        if (open) {
            open.classList.add('is-open');
            open.scrollIntoView?.({ block: 'nearest' });
        }
    }

    teardown() { this._generation++; }
}
