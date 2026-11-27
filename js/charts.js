// The six collection charts (Genres, Tags, Labels, Artists, Released, Added) as
// cards for the Charts view. Chart selection and drill state live in app.js.
import { escapeHtml } from './html.js';
export const CHART_ORDER = ['genres', 'tags', 'labels', 'artists', 'years', 'acquisition'];
export const CHART_TITLES = { genres: 'Genres', tags: 'Tags', labels: 'Labels', artists: 'Artists', years: 'Released', acquisition: 'Added' };
// Charts whose names are entities with a page.
const ENTITY_OF = { labels: 'label', artists: 'artist', tags: 'tag' };
const GENRE_DRILL_APPEND_KIND = ['genre', 'subgenre', 'tag', 'glabel', 'gartist'];

/** One card per chart, keyed by chart id (see CHART_ORDER). */
export function renderChartCards(app, chartAgg, chartTracks, dDrill) {
    let genresView = chartAgg.genresRanked.slice(0, 8);
    let genresHint = '';
    let genresTerminal = false;
    if (dDrill?.chartId === 'genres' && dDrill.levels?.length) {
        if (dDrill.levels.length >= 5) {
            genresView = [];
            genresTerminal = true;
            genresHint = '';
        } else {
            const narrowG = app._narrowTracksForDrill('genres', dDrill.levels, chartTracks);
            genresView = app._genreDrillRankedBuckets(dDrill.levels, narrowG).slice(0, 8);
            const nextKind = GENRE_DRILL_APPEND_KIND[dDrill.levels.length];
            const hintByKind = { subgenre: 'subgenres', tag: 'tags', glabel: 'labels', gartist: 'artists' };
            genresHint = hintByKind[nextKind] || '';
        }
    }
    const labelsCap = app._chartCapFor('labels');
    const yearsCap = app._chartCapFor('years');
    const acqCap = app._chartCapFor('acquisition');

    let labelsView = app._applyChartSort(chartAgg.labelsRanked, 'labels', (x) => x.label).slice(0, labelsCap);
    let labelsHint = '';
    if (dDrill?.chartId === 'labels' && dDrill.levels?.length) {
        if (dDrill.levels.length >= 2) {
            labelsView = [];
            labelsHint = '';
        } else {
            const narrowed = app._narrowTracksForDrill('labels', dDrill.levels, chartTracks);
            const artistRanked = app._labelDrillArtistsRanked(dDrill.levels[0].v, narrowed)
                .map(([label, count]) => ({ label, count }));
            labelsView = app._applyChartSort(artistRanked, 'labels', (x) => x.label).slice(0, labelsCap);
            labelsHint = `→ ${dDrill.levels[0].v}`;
        }
    } else if (dDrill?.chartId === 'years' && dDrill.levels?.length === 1) {
        // Drilled from Released into a specific year → show the labels that
        // released tracks in that year. Renders into the labels canvas so
        // the user sees the result under the correct tab.
        const ranked = app._yearDrillLabelsRanked(dDrill.levels[0].v, chartTracks)
            .map(([label, count]) => ({ label, count }));
        labelsView = app._applyChartSort(ranked, 'labels', (x) => x.label).slice(0, labelsCap);
        labelsHint = `released in ${dDrill.levels[0].v}`;
    } else if (dDrill?.chartId === 'acquisition' && dDrill.levels?.length === 1) {
        const ranked = app._monthDrillLabelsRanked(dDrill.levels[0].v, chartTracks)
            .map(([label, count]) => ({ label, count }));
        labelsView = app._applyChartSort(ranked, 'labels', (x) => x.label).slice(0, labelsCap);
        labelsHint = `added in ${app._formatMonth(dDrill.levels[0].v)}`;
    }

    const yearsByCount = chartAgg.yearKeys
        .map((y) => ({ year: y, count: chartAgg.yearCount[y] || 0 }))
        .sort((a, b) => b.count - a.count);
    const yearsTrimmed = yearsByCount.slice(0, yearsCap).map((x) => x.year).sort((a, b) => a - b);
    const hasYears = yearsTrimmed.length > 0 || (dDrill?.chartId === 'years');

    const acqAll = chartAgg.acquisition;
    const acqView = app._chartExpanded.acquisition ? acqAll : acqAll.slice(-acqCap);
    const hasAcq = acqView.length > 0 || (dDrill?.chartId === 'acquisition');

    const genreEmpty = genresTerminal ? 'Terminal drill slice.' : 'No genre data.';
    const genresHintHtml = genresHint ? ` <span class="tiny">${escapeHtml(genresHint)}</span>` : '';
    const labelsHintHtml = labelsHint ? ` <span class="tiny">${escapeHtml(labelsHint)}</span>` : '';
    const card = (id, body, hint = '') => `
        <div class="chart-card" data-chart-card="${id}">
            <div class="chart-title">${CHART_TITLES[id]}${hint}</div>
            <div class="chart-box">${body}</div>
        </div>`;
    const genresBody = genresView.length ? '<canvas id="discoverStripGenreChart"></canvas>' : `<div class="drawer-empty">${genreEmpty}</div>`;
    const labelsBody = (labelsView.length || dDrill?.chartId === 'labels')
        ? '<canvas id="discoverStripLabelChart"></canvas>'
        : '<div class="drawer-empty">No label data.</div>';
    const yearsBody = hasYears ? '<canvas id="discoverStripYearChart"></canvas>' : '<div class="drawer-empty">No year data.</div>';
    const acqBody = hasAcq ? '<canvas id="discoverStripAcqChart"></canvas>' : '<div class="drawer-empty">No added data.</div>';
    const artistsBody = (chartAgg.artistsRanked || []).length ? '<canvas id="discoverStripArtistChart"></canvas>' : '<div class="drawer-empty">No artist data.</div>';
    const tagsBody = (chartAgg.tagsRanked || []).length ? '<canvas id="discoverStripTagChart"></canvas>' : '<div class="drawer-empty">No tag data.</div>';
    return {
        genres: card('genres', genresBody, genresHintHtml),
        tags: card('tags', tagsBody),
        labels: card('labels', labelsBody, labelsHintHtml),
        artists: card('artists', artistsBody),
        years: card('years', yearsBody),
        acquisition: card('acquisition', acqBody),
    };
}

/** A name on a Labels, Artists or Tags chart opens that entity's page. */
const openEntity = (app, chart) => (name) => app.navigate({ view: ENTITY_OF[chart], name });

export function wireChartCards(app, contentArea, chartAgg, chartTracks, dDrill) {
    const openMenu = (chart, value, ev) => app._openDiscoverChartMenu(chart, value, ev);
    const selGenres = app._selectionSetFor('genres');
    const selLabels = app._selectionSetFor('labels');
    const selYears = app._selectionSetFor('years');
    const selAcq = app._selectionSetFor('acquisition');
    const labelsCap = app._chartCapFor('labels');
    const yearsCap = app._chartCapFor('years');
    const acqCap = app._chartCapFor('acquisition');

    let genresRankedSource = chartAgg.genresRanked;
    if (dDrill?.chartId === 'genres' && dDrill.levels?.length) {
        if (dDrill.levels.length >= 5) {
            genresRankedSource = [];
        } else {
            const narrowG = app._narrowTracksForDrill('genres', dDrill.levels, chartTracks);
            genresRankedSource = app._genreDrillRankedBuckets(dDrill.levels, narrowG);
        }
    }
    const genresSorted = app._applyChartSort(
        genresRankedSource.slice(0, 8).map(([label, count]) => ({ label, count })),
        'genres',
        (x) => x.label,
    );
    if (genresSorted.length && document.getElementById('discoverStripGenreChart')) {
        app.chartRenderer.renderDoughnut(
            'discoverStripGenreChart',
            genresSorted.map((x) => x.label),
            genresSorted.map((x) => x.count),
            (label) => {
                if (app._appendDiscoverDrillClick('genres', label)) return;
                app._addDiscoverChartSelection('genres', label);
            },
            {
                tooltipFor: (label, count) => app._tooltipForGenre(label, count, chartAgg),
                onContextMenu: (info) => openMenu('genres', info.label, info),
                selected: selGenres,
            },
        );
    }

    if (document.getElementById('discoverStripLabelChart')) {
        let labelsView = app._applyChartSort(chartAgg.labelsRanked, 'labels', (x) => x.label).slice(0, labelsCap);
        let isLeaf = false;
        let crossDrillKind = null; // 'years' | 'acquisition' when drilling from those charts
        if (dDrill?.chartId === 'labels' && dDrill.levels?.length) {
            if (dDrill.levels.length >= 2) {
                labelsView = [];
                isLeaf = true;
            } else {
                const narrowed = app._narrowTracksForDrill('labels', dDrill.levels, chartTracks);
                const artists = app._labelDrillArtistsRanked(dDrill.levels[0].v, narrowed)
                    .map(([label, count]) => ({ label, count }));
                labelsView = app._applyChartSort(artists, 'labels', (x) => x.label).slice(0, labelsCap);
            }
        } else if (dDrill?.chartId === 'years' && dDrill.levels?.length === 1) {
            crossDrillKind = 'years';
            const ranked = app._yearDrillLabelsRanked(dDrill.levels[0].v, chartTracks)
                .map(([label, count]) => ({ label, count }));
            labelsView = app._applyChartSort(ranked, 'labels', (x) => x.label).slice(0, labelsCap);
        } else if (dDrill?.chartId === 'acquisition' && dDrill.levels?.length === 1) {
            crossDrillKind = 'acquisition';
            const ranked = app._monthDrillLabelsRanked(dDrill.levels[0].v, chartTracks)
                .map(([label, count]) => ({ label, count }));
            labelsView = app._applyChartSort(ranked, 'labels', (x) => x.label).slice(0, labelsCap);
        }
        if (labelsView.length) {
            const selectedForView = (crossDrillKind) ? new Set() : selLabels;
            app.chartRenderer.renderHorizontalBar(
                'discoverStripLabelChart',
                labelsView.map((l) => l.label),
                labelsView.map((l) => l.count),
                {
                    maxItems: labelsView.length,
                    onClick: (label, _count, _i, native) => {
                        // Cross-chart drill: the click is on a label shown
                        // because we drilled into a year/month. Route
                        // clicks to the label page (modifier) or filter
                        // Collection by label + year/month context.
                        if (crossDrillKind === 'years') {
                            if (native && (native.shiftKey || native.metaKey || native.ctrlKey)) {
                                app.navigate({ view: 'label', name: label });
                                return;
                            }
                            app.filterEngine.setFilter('labels', [label]);
                            app.filterEngine.setFilter('years', [String(dDrill.levels[0].v)]);
                            app.navigate({ view: 'collection', filter: app.filterEngine.state });
                            return;
                        }
                        if (crossDrillKind === 'acquisition') {
                            if (native && (native.shiftKey || native.metaKey || native.ctrlKey)) {
                                app.navigate({ view: 'label', name: label });
                                return;
                            }
                            app.filterEngine.setFilter('labels', [label]);
                            app.filterEngine.setDateAddedRange(app._monthBounds(dDrill.levels[0].v));
                            app.navigate({ view: 'collection', filter: app.filterEngine.state });
                            return;
                        }
                        // Default: plain click opens the Label page (the
                        // natural "more about this label" gesture).
                        // Modifier click adds to chart selection for
                        // multi-label filtering. The old drill-to-artists
                        // was confusing — artist names appearing under a
                        // "Top labels" tab.
                        if (native && (native.shiftKey || native.metaKey || native.ctrlKey)) {
                            app._addDiscoverChartSelection('labels', label);
                            return;
                        }
                        app.navigate({ view: 'label', name: label });
                    },
                    tooltipFor: (label, count) => app._tooltipForLabel(label, count, chartAgg),
                    onLabelClick: dDrill?.chartId === 'labels' ? openEntity(app, 'artists') : openEntity(app, 'labels'),
                    onContextMenu: (info) => openMenu('labels', info.label, info),
                    selected: selectedForView,
                },
            );
        } else if (isLeaf) {
            const box = contentArea.querySelector('#discoverStripLabelChart')?.closest('.chart-box');
            if (box) box.innerHTML = '<div class="drawer-empty">Terminal drill slice.</div>';
        }
    }

    // Released (years) canvas — renders the drill-narrowed year chart.
    // When a years-drill is active, chartTracks is already scoped to that
    // year so this naturally collapses to a single bar. The labels-for-year
    // view is handled by the Labels canvas (see above), not here.
    const yearsChartEl = document.getElementById('discoverStripYearChart');
    if (yearsChartEl) {
        const yearsByCount = chartAgg.yearKeys
            .map((y) => ({ year: y, count: chartAgg.yearCount[y] || 0 }))
            .sort((a, b) => b.count - a.count);
        const yearsTrimmed = yearsByCount.slice(0, yearsCap).map((x) => x.year).sort((a, b) => a - b);
        if (yearsTrimmed.length) {
            app.chartRenderer.renderTimeline(
                'discoverStripYearChart',
                yearsTrimmed.map(String),
                yearsTrimmed.map((y) => chartAgg.yearCount[y] || 0),
                (year) => {
                    if (app._appendDiscoverDrillClick('years', String(year))) return;
                    app._addDiscoverChartSelection('years', String(year));
                },
                {
                    tooltipFor: (year, count) => app._tooltipForYear(year, count, chartAgg),
                    onContextMenu: (info) => openMenu('years', String(info.label), info),
                    selected: selYears,
                },
            );
        }
    }

    // Added (acquisition) canvas — same story. Drill-narrowed months,
    // no cross-chart labels rendering here.
    const acqChartEl = document.getElementById('discoverStripAcqChart');
    if (acqChartEl) {
        const acqAll = chartAgg.acquisition;
        const acq = app._chartExpanded.acquisition ? acqAll : acqAll.slice(-acqCap);
        if (acq.length) {
            app.chartRenderer.renderVerticalBar(
                'discoverStripAcqChart',
                acq.map((b) => app._formatMonth(b.month)),
                acq.map((b) => b.count),
                {
                    onClick: (_label, _count, index, native) => {
                        const bucket = acq[index];
                        if (!bucket) return;
                        if (native && (native.shiftKey || native.metaKey || native.ctrlKey)) {
                            app.filterEngine.setDateAddedRange(app._monthBounds(bucket.month));
                            app.navigate({ view: 'collection', filter: app.filterEngine.state });
                            return;
                        }
                        if (app._appendDiscoverDrillClick('acquisition', bucket.month)) return;
                        app._addDiscoverChartSelection('acquisition', bucket.month);
                    },
                    tooltipFor: (_lbl, count, index) => app._tooltipForAcquisition(acq[index], count, chartAgg),
                    onContextMenu: (info) => {
                        const bucket = acq[info.index];
                        if (bucket) openMenu('acquisition', bucket.month, info);
                    },
                    selected: selAcq,
                    selectionKeys: acq.map((b) => b.month),
                },
            );
        }
    }

    // Top artists canvas — horizontal bar of the tracks-owned-per-artist
    // leaderboard. Click = open Artist page; modifier = add to selection.
    const artistChartEl = document.getElementById('discoverStripArtistChart');
    if (artistChartEl) {
        const cap = app._chartCapFor('labels');
        const artistsView = (chartAgg.artistsRanked || []).slice(0, cap);
        if (artistsView.length) {
            app.chartRenderer.renderHorizontalBar(
                'discoverStripArtistChart',
                artistsView.map((a) => a.artist),
                artistsView.map((a) => a.count),
                {
                    maxItems: artistsView.length,
                    onClick: (artist, _count, _i, native) => {
                        if (native && (native.shiftKey || native.metaKey || native.ctrlKey)) {
                            app._addDiscoverChartSelection('artists', artist);
                            return;
                        }
                        app.navigate({ view: 'artist', name: artist });
                    },
                    tooltipFor: (artist, count) => `${artist} — ${count} track${count === 1 ? '' : 's'}`,
                    onLabelClick: openEntity(app, 'artists'),
                    selected: app._selectionSetFor('artists'),
                },
            );
        }
    }

    // Top tags canvas — click = open Tag page.
    const tagChartEl = document.getElementById('discoverStripTagChart');
    if (tagChartEl) {
        const cap = app._chartCapFor('labels');
        const tagsView = (chartAgg.tagsRanked || []).slice(0, cap);
        if (tagsView.length) {
            app.chartRenderer.renderHorizontalBar(
                'discoverStripTagChart',
                tagsView.map((t) => t.tag),
                tagsView.map((t) => t.count),
                {
                    maxItems: tagsView.length,
                    onClick: (tag) => app.navigate({ view: 'tag', name: tag }),
                    tooltipFor: (tag, count) => `${tag} — ${count} track${count === 1 ? '' : 's'}`,
                    onLabelClick: openEntity(app, 'tags'),
                    selected: new Set(),
                },
            );
        }
    }
}
