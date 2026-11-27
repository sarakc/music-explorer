import { renderPlaylistsWorkspace, publishWorkspace } from './playlists-workspace.js';
// Unified — Collection intelligence and discovery
import PasteLink from './paste-link.js';
import { wireSiteLinks, openSiteKey } from './site-links.js';
import IntegrationManager from '../integration-manager.js';
import FilterEngine from './filter-engine.js';
import ChartRenderer from './chart-renderer.js';
import ReleaseChecker from './release-checker.js';
import { SkinManager } from './skins.js';
import DensityManager from './density.js';
import DetailPanel from './detail-panel.js';
import './panel-release.js';
import './panel-outside.js';
import './panel-info.js';
import { undoToast } from './undo-toast.js';
import AtlasView from './graph/atlas-view.js';
import ChartsView from './charts-view.js';
import IndexView from './index-view.js';
import { favoriteTrackFilter } from './favorites-filter.js';
import { FavoriteMarks, STAR, HEART, favIds, normalizeFav, toggleFav, filledGlyph, markPairHtml, paintMark, favoritesGroupHtml, wireFavoritesGroup, markForKey } from './favorite-marks.js';
import SidebarDrawer from './sidebar-drawer.js';
import { EnrichmentOrchestrator, DiscogsReleaseAdapter, MusicBrainzAdapter, FlacSidecarAdapter } from './enrichment.js';
import CrateManager from './crates.js';
import LabelGap from './label-gap.js';
import LabelPage from './label-page.js';
import ArtistPage from './artist-page.js';
import TagPage from './tag-page.js';
import AlbumPage from './album-page.js';
import TrackPage from './track-page.js';
import ShortlistView from './shortlist.js';
import { ToolListView } from './tool-list.js';
import { IdentityListView } from './identity-tool.js';
import { rememberTool, toolsEntryView, cleanupEntryView, stagedTrackCount, mountToolsApply, isToolListView, toolListTitle } from './tools-nav.js';
import {
    listGigs,
    getGig,
    onGigsChanged,
} from './gigs.js';
import { buildMembershipIndex } from './gig-membership.js';
import { openFilterBuilder } from './filter-builder.js';
import { describeRules, liftFlatState, encodeRules } from './filter-rules.js';
import { EntityRelations } from './entity-relations.js';
import { openRekordboxImportModal } from './rekordbox-import.js';
import { renderSettingsView, readRekordboxImportMode, writeRekordboxImportMode, readUpNextOnNewList, writeUpNextOnNewList } from './settings.js';
import { createDiscogsQueueClient } from './discogs-queue-client.js';
import DiscoverNewView from './discover-new.js';
import GigView from './gig-view.js';
import { BatchTagEditor } from './tag-editor.js';
import { TrackReviewController, TrackReviewDrawer } from './track-review.js';
import { PendingTagDiffs } from './pending-tag-diffs.js';
import { coverArtUrl, hasCoverArt } from './cover-art.js';
import { entityCardHtml, wireEntityCards } from './entity-card.js';
import { entityLinkHtml, readEntityLink, openEntity, bpmBucket } from './entity-links.js';
import { createUnhandledRejectionHandler } from './durable-read-errors.js';
import { computeWindow, shouldRedraw, scrollTopForRow } from './virtual-rows.js';
import {
    fetchPathReport, totalsLine, renderPathReport, wirePathSelection, postPathRewrite, postPathRewriteUndo,
    rewriteSummary, undoSummary, rewriteErrorLine, renderRewriteResult, renderUndoResult, CONFIRM_THRESHOLD,
} from './path-repair.js';
import ArtistGap from './artist-gap.js';
import StorageView from './storage.js';
import { playbackSessionId, takePlaybackResume } from './collection-session.js';
import LocalAudioPlayer, { isLocalPlayable, playGlyphHtml, PLAYER_ICONS } from './player.js';
import PlayQueueClient from './play-queue-client.js';
import { STASH_TOKEN, isStashedTrack, isExploremeTrack, collectionTracks, exploremeTracks } from './stash.js';
import { setStashed } from './stash-action.js';
import { PlayHistory } from './play-history.js';
import QueuePanel, { queueKeyAction } from './queue-panel.js';
import { createStaleGuard } from './stale-guard.js';
import { parseRoute, buildRoute, serializeFilter, VIEW_LABELS, VIEW_TABS } from './router.js';
import { pushRecent } from './command-bar.js';
import GoList from './go-list.js';
import { trackActions, gigShortcutRunOptions, visibleActionRunOptions, exploreRouteFor } from './track-actions.js';
import { playlistBulkActionsHtml, wirePlaylistBulkActions } from './playlist-bulk.js';
import { wireTrackDrag } from './track-drag.js';
import PlaylistsView from './playlists-view.js';
import { addToPlaylist } from './add-to-playlist.js';
import RightSlot from './right-slot.js';
import GigPanel from './gig-panel.js';
import { pageEntity } from './gig-follow.js';
import {
    buildSoundStatusIndex,
    isSoundIssue,
    soundStatusForTrack,
    soundStatusMarkerHtml,
    statusKey,
} from './sound-check-status.js';
import { attentionFor, collectionTrackTitleCell, moveColumn, nextSort, normalizeSort, playlistLinkRoute, playlistsCellHtml, resolveColumnLayout, selectionBarActions, showColumnAfter, sortComparator, REQUIRED_COLUMNS } from './collection-columns.js';
import { keyToCamelot } from './key-compat.js';
import { collectSoundQualityTagProposals } from './sound-quality-tags.js';
import { openSoundQualityTagReview } from './sound-quality-tag-review.js';
import { BatchConfirmController, batchWrittenText, latestRecoverableBatch, openBatchConfirm, tagsWrittenText, undoWritten, writeOrPreview } from './batch-confirm.js';
import { mp3OnlyReasonsTitle } from './mp3-only.js';
import { openListenSheet, closeListenSheet, toggleListenSheet } from './listen.js';
import { SECTIONS, sectionOf, renderSectionTabs, renderSidebar, subtabsHtml, patchHtml } from './sections.js';
import { renderSimilarityTool } from './similarity-tool.js';
import { renderDesktopOnlyNotice } from './desktop-only.js';
import { inboxCardHtml, otherImportsCardHtml, foldersLineHtml, discogsBlockHtml, otherImportsCounts } from './inbox-card.js';
import {
    FILTER_CONTROLS, readFilterRows, visibleControls, activeConditionCount, subtitleText, controlsHtml,
    menuItems, savedChips, bandHtml, filterLineModel, filterLineHtml, sameFilter, emptyTableHtml, escapeTarget,
    COLLECTION_VIEWS, scopeFor, routeFilterState, yearInputRange, rangeLeft,
} from './collection-header.js';
import { createBandPopovers } from './band-popovers.js';
import { createFloatingBand } from './floating-band.js';
import { headerProfile, hasHeader, viewsWith, routeCarries } from './header-profiles.js';
import Preview from './preview.js';
import DiscoverPanel from './discover-panel.js';
import { readGroup, writeGroup, groupTracks, groupLabelAt } from './track-groups.js';
import { hasGraph, readGraphTabs, rememberMode, writeGraphTabs, withMode, tabRoute, viewSwitchHtml, withDimmedSwitch, graphFocus, followGraphFocus } from './graph-tabs.js';
import { escapeHtml } from './html.js';
import { VIEWER, VIEWER_PROFILE, isHiddenRoute } from './viewer-profile.js';
import { PHONE, installPhone, installSheet, stampEntry, viewPoint, viewRect, viewSize } from './phone.js';
import { TabBar } from './tab-bar.js';
import { installPhoneRows } from './phone-rows.js';
import { installHoverHints } from './hover-hint.js';
import { bandcampImportSummary } from './bandcamp-import.js';
import { nodeKeyIntent, graphKeyTarget } from './graph/node-play.js';
import { AtlasData } from './graph/atlas-data.js';
import { readShow } from './graph/atlas-options.js';
import { resolveScope } from './graph/scope.js';
import { showStage } from './view-stage.js';
import { markedTrackIds, firstMarked, graphFromTable, rowArtistIds } from './graph-mirror.js';

/** Collection table columns. Each column owns how to render its cell and how to compare
 *  two rows when sorting, so the table renderer stays mechanical. */
// Escapes for both text and attribute contexts. The textContent/innerHTML
// trick leaves quotes alone, which breaks every data-*="…" attribute built
// from a label or artist name containing a double quote.

// Escape should only dismiss the topmost in-app dialog. Every modal backdrop
// registers its own document keydown listener, so without this guard one key
// press collapses the whole stack.
const isTopmostBackdrop = (backdrop) => {
    const all = document.querySelectorAll('.enrich-backdrop');
    return all.length > 0 && all[all.length - 1] === backdrop;
};

const textCell = (key) => (t) => {
    const v = (t[key] || '').toString();
    return v ? `<td title="${escapeHtml(v)}">${escapeHtml(v)}</td>` : `<td></td>`;
};
const textCompare = (key) => (a, b) =>
    (a[key] || '').toString().toLowerCase().localeCompare((b[key] || '').toString().toLowerCase());
const numCompare = (key) => (a, b) => (Number(a[key]) || 0) - (Number(b[key]) || 0);

// Art-cell renderer: lazy-loaded thumb when the track has known art, muted
// placeholder tile otherwise. Clicking a thumb opens the art in an overlay.
const artCell = (t) => {
    if (hasCoverArt(t)) {
        const src = coverArtUrl(t);
        return `<td class="col-art"><img class="art-thumb" src="${escapeHtml(src)}" loading="lazy" decoding="async" alt="" data-art-fallback data-art-open></td>`;
    }
    return `<td class="col-art"><span class="art-thumb art-placeholder" aria-hidden="true"></span></td>`;
};

// Attention cell: blank unless the row needs something. A Sound Check verdict
// outranks a file problem; the file glyph opens the pair popover. File status
// arrives async from /api/library/{scan,drift}, so the cell carries its path
// and is re-rendered by `_refreshFilesCells` when the data lands.
const statusCell = (t, app) => {
    const sound = app?._soundStatusFor ? app._soundStatusFor(t) : null;
    const path = (t && t.availability === 'local') ? (t.local_path || '') : '';
    const files = path && app?._filesStatusFor ? app._filesStatusFor(path) : null;
    const need = attentionFor(statusKey(sound), files);
    const attrs = `class="col-status"${path ? ` data-files-path="${escapeHtml(path)}"` : ''} data-attention="${need?.key || ''}"`;
    if (!need) return `<td ${attrs}></td>`;
    if (need.kind === 'sound') return `<td ${attrs}>${soundStatusMarkerHtml(sound)}</td>`;
    const meta = FILES_STATUS_META[need.key];
    return `<td ${attrs}><button type="button" class="files-dot files-dot--${need.key}" data-files-path="${escapeHtml(path)}" data-files-status="${need.key}" title="${escapeHtml(meta.title)}" aria-label="${escapeHtml(meta.title)}"><span class="files-dot-glyph" aria-hidden="true">${meta.glyph}</span></button></td>`;
};

const camelotRank = (t) => {
    const raw = String(t.tonality || '').trim();
    const camelot = keyToCamelot(raw) || (/^\d{1,2}[AB]$/i.test(raw) ? raw.toUpperCase() : null);
    if (!camelot) return Infinity;
    return parseInt(camelot, 10) * 2 + (camelot.endsWith('B') ? 1 : 0);
};

const FILES_STATUS_META = {
    paired:   { glyph: '●', title: 'Paired (MP3 + FLAC in sync)' },
    mp3only:  { glyph: '○', title: 'MP3 only — no archived FLAC' },
    flaconly: { glyph: '◑', title: 'FLAC only — MP3 missing on disk' },
    drift:    { glyph: '◐', title: 'Drift — MP3 or FLAC changed since last sync' },
    loading:  { glyph: '·', title: 'Loading file status…' },
    unknown:  { glyph: '·', title: 'Path not found in library scan' },
};

const LIBRARY_TABLE_COLUMNS = [
    {
        key: 'art', label: '', width: 32, sortable: false,
        cell: artCell,
        compare: () => 0,
    },
    {
        key: 'status', label: '', menuLabel: 'Attention', width: 36, sortable: false,
        headerTitle: 'Needs attention: × do not play · ! replace first · • listen first · ◑ MP3 missing · ◐ drift',
        cell: statusCell,
        compare: () => 0,
    },
    {
        key: 'dig', label: 'Links', width: 146,
        headerTitle: 'Local file · YouTube · Bandcamp · Beatport · Discogs · Tunebat',
        cell: (t, app) => `<td class="track-links">${app._digLinks(t)}</td>`,
        compare: (a, b) => {
            const key = (t) => [t.bandcamp_url, t.discogs_url, t.beatport_url, t.tunebat_url].filter(Boolean).join(' ').toLowerCase();
            return key(a).localeCompare(key(b));
        },
    },
    { key: 'bpm',      label: 'BPM',      width: 90,  cell: (t) => `<td>${entityLinkHtml({ type: 'bpm', name: t.bpm, text: t.bpm ? String(t.bpm) : '' })}</td>`, compare: numCompare('bpm') },
    { key: 'title',    label: 'Title',    width: 230, cell: collectionTrackTitleCell, compare: textCompare('title') },
    {
        key: 'artist', label: 'Artist', width: 190,
        cell: (t) => t.artist
            ? `<td title="${escapeHtml(t.artist)}">${entityLinkHtml({ type: 'artist', name: t.artist, extraClass: 'cell-artist-link' })}</td>`
            : `<td></td>`,
        compare: textCompare('artist'),
    },
    {
        key: 'genre', label: 'Genre', width: 150,
        cell: (t) => {
            const primary = primaryGenreTokensTrack(t);
            const sub = subgenreTokensTrack(t);
            if (!primary.length && !sub.length) return `<td></td>`;
            // Common case: one primary genre + zero-or-more subgenres. Render
            // the whole "Genre: Sub1, Sub2" string as ONE clickable token that
            // sets both facets at once — the user was clear that it's a single
            // navigable item, not two separate links.
            if (primary.length === 1) {
                const g = primary[0];
                const subAttr = sub.length ? ` data-subgenres="${escapeHtml(sub.join('|'))}"` : '';
                const text = sub.length
                    ? `${escapeHtml(g)}: ${sub.map(escapeHtml).join(', ')}`
                    : escapeHtml(g);
                return `<td><a href="#" class="cell-token cell-token--genre" data-genre="${escapeHtml(g)}"${subAttr}>${text}</a></td>`;
            }
            // Rare case: multiple primary genres. Fall back to per-primary
            // links; subgenres tail the row as their own tokens.
            const primaryHtml = primary.map((g) =>
                `<a href="#" class="cell-token cell-token--genre" data-genre="${escapeHtml(g)}">${escapeHtml(g)}</a>`
            ).join(', ');
            const subHtml = sub.length
                ? ': ' + sub.map((s) =>
                    `<a href="#" class="cell-token cell-token--subgenre" data-subgenre="${escapeHtml(s)}">${escapeHtml(s)}</a>`
                  ).join(', ')
                : '';
            return `<td>${primaryHtml}${subHtml}</td>`;
        },
        compare: textCompare('genre'),
    },
    {
        key: 'comments', label: 'Comments', width: 340,
        cell: (t) => {
            const raw = (t.comments || '').trim();
            if (!raw) return `<td class="col-comments"></td>`;
            const tokens = raw.split(',').map((s) => s.trim()).filter(Boolean);
            if (!tokens.length) return `<td class="col-comments">${escapeHtml(raw)}</td>`;
            const html = tokens.map((tag) =>
                `<span class="cell-token cell-token--tag"><span class="token-shape token-shape--tag" aria-hidden="true"></span>${entityLinkHtml({ type: 'tag', name: tag })}</span>`
            ).join(', ');
            return `<td class="col-comments">${html}</td>`;
        },
        compare: textCompare('comments'),
    },
    {
        key: 'label', label: 'Label', width: 170,
        cell: (t) => t.label
            ? `<td title="${escapeHtml(t.label)}">${entityLinkHtml({ type: 'label', name: t.label, extraClass: 'cell-label-link' })}</td>`
            : `<td></td>`,
        compare: textCompare('label'),
    },
    { key: 'year',     label: 'Year',     width: 90,  cell: (t) => `<td>${t.year ? entityLinkHtml({ type: 'year', name: t.year }) : ''}</td>`, compare: numCompare('year') },
    {
        key: 'album', label: 'Album', width: 200,
        cell: (t) => t.album
            ? `<td title="${escapeHtml(t.album)}">${entityLinkHtml({ type: 'album', name: t.album, artist: t.artist || '', extraClass: 'cell-token cell-token--album' })}</td>`
            : `<td></td>`,
        compare: textCompare('album'),
    },
    {
        key: 'source', label: 'Source', width: 110,
        cell: (t) => `<td><span class="source-badge source-${t.source || t.platform}">${t.source || t.platform || ''}</span></td>`,
        compare: (a, b) => ((a.source || a.platform || '').toLowerCase()).localeCompare((b.source || b.platform || '').toLowerCase()),
    },
    {
        key: 'date_added', label: 'Added', width: 110,
        cell: (t) => `<td>${escapeHtml((t.date_added || '').slice(0, 10))}</td>`,
        compare: (a, b) => (a.date_added || '').localeCompare(b.date_added || ''),
    },
    {
        key: 'key', label: 'Key', width: 70,
        cell: (t) => `<td>${t.tonality ? entityLinkHtml({ type: 'key', name: t.tonality }) : ''}</td>`,
        compare: (a, b) => camelotRank(a) - camelotRank(b) || textCompare('tonality')(a, b),
    },
    {
        key: 'gigs', label: 'Playlists', width: 160, sortable: false,
        cell: (t, app) => playlistsCellHtml(t.id, app.__membershipIndex?.get(String(t.id))),
        compare: () => 0,
    },
];
const COLUMN_BY_KEY = new Map(LIBRARY_TABLE_COLUMNS.map((c) => [c.key, c]));
// Playlist pages (Collection › Playlists): position in playlist order, and × for an editable playlist.
const playlistColumns = () => [{ key: '__pos', label: '#', width: 44, sortable: false, cell: (t, app, idx) => `<td class="col-pos">${idx + 1}</td>` }];
const playlistSelectColumn = {
    key: '__select', label: '', width: 34, sortable: false,
    cell: (t, app) => `<td class="col-select"><input type="checkbox" class="playlist-row-select" data-playlist-row-select aria-label="Select track"${app._selectedTrackIds.has(t.id) ? ' checked' : ''}></td>`,
};
const playlistRemoveColumn = { key: '__remove', label: '', width: 34, sortable: false, cell: (t) => `<td><button type="button" class="row-remove-btn" data-pl-remove="${escapeHtml(t.id)}" aria-label="Remove from playlist">×</button></td>` };

// Whole-token "exploreme" marker in the Rekordbox comments field (stash.js).
export { isExploremeTrack };
// The band's built-in filters, after the saved ones' pinned slot.
const PINNED_FILTERS = Object.freeze([
    { id: 'pinned:exploreme', name: 'Exploreme', pinned: true },
    { id: 'pinned:stashed', name: 'Stashed', pinned: true },
]);

// Discover chart drill-down (P1.5) — single active drill, sessionStorage-backed.
const DISCOVER_DRILL_STORAGE_KEY = 'discover_chart_drill';

/** Primary genre = everything left of the first colon, as one value.
 *  Returns a single-element array (or empty) so existing for-of / .includes
 *  consumers don't have to change shape. */
const _genreTokenCache = new WeakMap();
export const primaryGenreTokensTrack = (t) => {
    if (!t || typeof t !== 'object') return [];
    const cached = _genreTokenCache.get(t);
    if (cached) return cached;
    const genre = (t.genre || '').trim();
    const colonIdx = genre.indexOf(':');
    const primary = colonIdx < 0 ? genre : genre.slice(0, colonIdx).trim();
    const tokens = primary ? [primary] : [];
    _genreTokenCache.set(t, tokens);
    return tokens;
};

/** Subgenre = everything right of the first colon, as one value. */
export const subgenreTokensTrack = (t) => {
    const genre = (t.genre || '').trim();
    const colonIdx = genre.indexOf(':');
    if (colonIdx < 0) return [];
    const sub = genre.slice(colonIdx + 1).trim();
    return sub ? [sub] : [];
};

const GENRE_DRILL_APPEND_KIND = ['genre', 'subgenre', 'tag', 'glabel', 'gartist'];

// Collection-Health predicates. Always RB-only — Bandcamp shells aren't gaps to fix in Yate.
// Matches "Genre: Subgenre" — colon-separated with at least one non-empty side on each.
const GENRE_COMPOSITE_RE = /^[^:]+:\s*[^:]+$/;

const HEALTH_FILTERS = {
    missing_bpm:     { label: 'Missing BPM',      predicate: (t) => !t.bpm },
    missing_key:     { label: 'Missing key',      predicate: (t) => !t.tonality },
    missing_genre:   { label: 'Missing genre',    predicate: (t) => !(t.genre && t.genre.trim()) },
    malformed_genre: { label: 'Genre not "X: Y"', predicate: (t) => !!(t.genre && t.genre.trim()) && !GENRE_COMPOSITE_RE.test(t.genre.trim()) },
    untagged:        { label: 'Untagged',         predicate: (t) => (!Array.isArray(t.tags) || t.tags.length === 0) && !(t.comments && t.comments.trim()) },
    orphan_artist:   { label: 'Orphan artists',   predicate: (t, ctx) => !(t.label && t.label.trim()) && ctx.artistCounts.get((t.artist || '').toLowerCase()) === 1 },
    label_of_one:    { label: 'Label-of-one',     predicate: (t, ctx) => !!(t.label && t.label.trim()) && ctx.labelCounts.get(t.label.toLowerCase()) === 1 },
    missing_year:    { label: 'Missing year',     predicate: (t) => !t.year },
};

const buildHealthContext = (rbTracks) => {
    const artistCounts = new Map();
    const labelCounts = new Map();
    for (const t of rbTracks) {
        const a = (t.artist || '').toLowerCase();
        if (a) artistCounts.set(a, (artistCounts.get(a) || 0) + 1);
        const l = (t.label || '').toLowerCase();
        if (l) labelCounts.set(l, (labelCounts.get(l) || 0) + 1);
    }
    return { artistCounts, labelCounts };
};

// Reusable dig-signal computation. Given a tracks subset (already excluding exploreme
// from `tracks`, with the exploreme rows passed separately), return ordered rows for
// the four signals the "Go further" panel exposes. Pure / standalone so future work
// (P2.2 context strip) can scope these to a chart slice.
export const computeDigSignals = (tracks, exploremeTracks = []) => {
    const labelArtists = {};
    const artistLabels = {};
    const labelTracks = {};
    const labelMaxYear = {};
    const artistTracks = {};
    const currentYear = new Date().getFullYear();
    for (const t of tracks) {
        const artist = (t.artist || '').trim();
        const label = (t.label || '').trim();
        const year = t.year && Number(t.year);
        const validYear = year && year > 1900 && year <= currentYear;
        if (label && artist) {
            (labelArtists[label] ??= new Set()).add(artist);
            (artistLabels[artist] ??= new Set()).add(label);
        }
        if (label) {
            labelTracks[label] = (labelTracks[label] || 0) + 1;
            if (validYear) labelMaxYear[label] = Math.max(labelMaxYear[label] || 0, year);
        }
        if (artist) artistTracks[artist] = (artistTracks[artist] || 0) + 1;
    }

    const stale = Object.entries(labelTracks)
        .filter(([label, count]) => count >= 3 && labelMaxYear[label] && (currentYear - labelMaxYear[label]) >= 2)
        .map(([label, count]) => ({ label, count, lastYear: labelMaxYear[label], gap: currentYear - labelMaxYear[label] }))
        .sort((a, b) => (b.count * b.gap) - (a.count * a.gap))
        .slice(0, 24);

    const shallow = Object.entries(labelArtists)
        .map(([label, artistSet]) => {
            const artistCount = artistSet.size;
            const trackCount = labelTracks[label] || 0;
            return { label, artistCount, trackCount, depth: trackCount / artistCount };
        })
        .filter((l) => l.artistCount >= 4 && l.depth < 1.5)
        .sort((a, b) => b.artistCount - a.artistCount)
        .slice(0, 24);

    const oneTrack = Object.entries(artistTracks)
        .filter(([, count]) => count === 1)
        .map(([artist]) => {
            const labels = artistLabels[artist] || new Set();
            const connectedness = [...labels].reduce((sum, l) => sum + (labelTracks[l] >= 2 ? 1 : 0), 0);
            return { artist, connectedness };
        })
        .filter((a) => a.connectedness > 0)
        .sort((a, b) => b.connectedness - a.connectedness)
        .slice(0, 24);

    const exploremeLabelCounts = {};
    for (const t of exploremeTracks) {
        const label = (t.label || '').trim();
        if (label) exploremeLabelCounts[label] = (exploremeLabelCounts[label] || 0) + 1;
    }
    const explore = Object.entries(exploremeLabelCounts)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 24);

    return { stale, shallow, explore, oneTrack };
};

// Conservative normaliser for the dedup matcher. Strips diacritics, leading "the ",
// parentheticals, and "feat." so "The Blessed Madonna (feat. Fred)" ~= "Blessed Madonna".
export const normalizeForMatch = (s) => {
    if (!s) return '';
    return s
        .toString()
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s*[\(\[][^)\]]*[\)\]]/g, '')
        .replace(/\s+feat(?:uring|\.)?\s.*$/i, '')
        .replace(/^the\s+/, '')
        .replace(/\s+/g, ' ')
        .trim();
};

// null return = unmatcheable (missing required field). Callers must not cluster on null.
const buildBandcampKey = (t) => {
    const artist = normalizeForMatch(t.artist);
    if (!artist) return null;
    // Album-purchase heuristic: explicit item_type, or album exists and matches title.
    const titleNorm = normalizeForMatch(t.title);
    const albumNorm = normalizeForMatch(t.album);
    const isAlbum = t.item_type === 'album' || (albumNorm && albumNorm === titleNorm);
    if (isAlbum) {
        if (!albumNorm) return null;
        return { mode: 'album', key: `bc-alb|${artist}|${albumNorm}` };
    }
    if (!titleNorm) return null;
    return { mode: 'track', key: `bc-trk|${artist}|${titleNorm}` };
};

const buildRbAlbumKey = (t) => {
    const artist = normalizeForMatch(t.artist);
    const album = normalizeForMatch(t.album);
    if (!artist || !album) return null;
    return `bc-alb|${artist}|${album}`;
};

const buildRbTrackKey = (t) => {
    const artist = normalizeForMatch(t.artist);
    const title = normalizeForMatch(t.title);
    if (!artist || !title) return null;
    return `bc-trk|${artist}|${title}`;
};

// RB↔RB tier. Duration is unreliable (CSV imports set it to 0) so we stay with
// (artist, title) only — still conservative because both must be non-empty.
const buildRbRbKey = (t) => {
    const artist = normalizeForMatch(t.artist);
    const title = normalizeForMatch(t.title);
    if (!artist || !title) return null;
    return `rb-rb|${artist}|${title}`;
};

const DISCOVER_VIEWS = ['charts', 'discover'];
// Which views carry a filter and draw the header is declared in header-profiles.js.
// Routes that carry a filter (`routeCarries`): the six Collection views share one
// scope (`scopeFor`), the two graphs another; Favorites and Charts keep their own.
// Discover carries it on its Graph tab only.
// Views whose ☆ is the route's `fav` (Playlists has none).
const FAV_ROUTE_VIEWS = viewsWith('routeFav');
// The band control a filter-line pill focuses; facets use `[data-filter-cat]`.
const PILL_FOCUS = { bpm: '[data-bpm-min]', yearRange: '[data-year-min]', camelot: '[data-camelot]', dateAdded: '[data-added-btn]', rules: '[data-edit-rules]' };

class UnifiedMusicApp {
    constructor() {
        this.integrationManager = null;
        this.currentView = 'collection';
        this.hasBackend = false;
        this.backendServices = {};
        this.storageView = null;
        this.filterEngine = new FilterEngine();
        // Per-view saved filter state so filters in Collection don't leak into Explore.
        // `discover` is also tracked so the "Open in Discover" jump can carry
        // non-chart-mappable filters (search, BPM, tags, etc.) into Discover's
        // subset without polluting Collection's scope.
        this._filterScopes = { collection: null, exploreme: null, charts: null, graph: null };
        // Views built once this session: "Loading..." shows only the first time.
        this._builtViews = new Set();
        this._activeFilterScope = 'collection';
        // Collection header: the filter band is open for this session only;
        // which band controls show persists as `collection_filter_rows`.
        this._bandOpen = false;
        // More in the band (the controls behind it), for the session.
        this._bandMore = false;
        this._filterRows = readFilterRows(null);
        // Saved filters, refreshed by renderCratesSidebar for the band's chips.
        this._crates = [];
        this._includeExploreme = true;
        this._includeStashed = false;
        this.chartRenderer = new ChartRenderer();
        this.releaseChecker = null;
        this._tracksCache = null;
        this._mergedCache = null;
        this._dedupClusters = null;
        /** @type {{ key: string, dir: 'asc'|'desc' }[]} the primary sort, then the tie-break */
        this._tableSort = [];
        /** @type {Record<string, number>} column key → width in px */
        this._colWidths = {};
        /** Data-column order and hidden set; see collection-columns.js. */
        this._colLayout = resolveColumnLayout(null);
        // Leftmost album-art column visibility (P1.4). Default ON; persisted
        // to the IDB settings store as `collection_show_art_col`.
        this._showArtCol = true;
        // Ad-hoc Collection-Health predicate key. Cleared by any user filter touch.
        this._healthFilter = null;
        // Collection row selection for batch tagging.
        this._selectedTrackIds = new Set();
        this._lastSelectedIdx = null;
        this.batchTagEditor = null;
        // Discover-local chart cross-filter (P1.2). Each entry: { chart, value }.
        // Not synced to the global filter bar — explicitly deferred.
        // Restored from sessionStorage so it survives view switches within a session.
        this._discoverChartSelection = this._loadDiscoverChartSelection();
        // In-place chart drill (P1.5). One active drill at a time; not in IDB.
        this._discoverChartDrill = this._loadDiscoverChartDrill();
        // Per-chart sort mode ('count-desc' | 'alpha-asc' | 'count-asc') and
        // expanded state (false = cap at default top-N, true = cap at 30).
        // Restored from IDB settings in init() before first Discover render.
        this._chartSort = { genres: 'count-desc', labels: 'count-desc', years: 'count-desc', acquisition: 'count-desc' };
        this._chartExpanded = { genres: false, labels: false, years: false, acquisition: false };

        // Insights: the distribution strip above the table, aggregating the
        // filtered subset across 4 facets. Opened from ⋯ › Insights, session only.
        this._distributionCollapsed = true;
        this._distributionExpanded = { genres: false, labels: false, bpm: false, years: false };

        // Universal Go-further panel collapse on Collection. Persisted (`collection_go_further_collapsed`).
        this._collectionGoFurtherCollapsed = false;

        // Browser history owns navigation; entry state remembers implicit defaults.
        this._route = null;
        this._prevRoute = null;
        this._routeGuard = createStaleGuard();
        this.rightSlot = new RightSlot({ app: this });
        this.gigPanel = new GigPanel({ app: this, slot: this.rightSlot });
        this.panel = new DetailPanel({ app: this });
        this.preview = new Preview({ app: this });
        this.discoverPanel = new DiscoverPanel({ app: this });
        wireSiteLinks(document);
        installHoverHints(document);
        // Info refills when it comes into view or the section changes: Collection from
        // the focused row (a new section forgets the last one), the map from its focus.
        this.panel.follow('collection', ({ sectionChanged }) => {
            if (this._route?.graph) return this._atlasView?.refreshPanel();
            if (sectionChanged) this._infoFocusedId = undefined;
            this._selectionToSlot();
        });
        this.panel.follow('discover', () => this._atlasView?.refreshPanel());
        this._graphTabs = readGraphTabs();
        // Every favourites mark, for rows, Info, the player bar and the header (favorite-marks.js).
        this.marks = new FavoriteMarks({ database: () => this.integrationManager?.database });

        // Files column (P2.1). Map<absMp3Path, 'paired'|'mp3only'|'flaconly'|'drift'>
        // populated by /api/library/scan + /api/library/drift on first Collection
        // mount. `null` until the bulk data resolves; rows render a loading dot
        // until then. Per-row "Rescan" patches a single entry without refetching.
        this._filesPairMap = null;
        this._filesPairLoadedAt = 0;
        this._filesPairInflight = null;
        this._filesPopover = null;

        // Sound Check evidence is operational state read through the server,
        // not curation stored in SQLite. Clean tracks render no marker; this
        // session-only toggle narrows Collection to attention states.
        this._soundStatusIndex = buildSoundStatusIndex();
        this._soundStatusAvailable = false;
        this._soundStatusLoadedAt = 0;
        this._soundStatusInflight = null;
        this._soundIssuesOnly = false;

        // One audio element lives outside #contentArea so playback survives
        // Collection sorts, filters, and navigation to detail/Prepare views.
        // The queue itself lives in SQLite (playback_queue) and survives reloads.
        this.audioPlayer = new LocalAudioPlayer({
            host: document.getElementById('localPlayerHost'),
            app: this,
            store: new PlayQueueClient(),
            history: new PlayHistory(),
            resolveTrack: (id) => this._trackById(id),
            // Next passes over stashed tracks; a direct click still plays one.
            skip: (id) => isStashedTrack(this._trackById(id)),
            stash: VIEWER ? null : (ids, on) => setStashed(this, ids, on),
            marks: VIEWER ? null : this.marks,
            visualize: VIEWER ? null : () => this.openVisualizer(),
            onStateChange: () => this._syncLocalPlayControls(),
        });
        this.queuePanel = new QueuePanel({ host: this.audioPlayer.host, player: this.audioPlayer, app: this });
        // A graph left following the music keeps following it while you're elsewhere.
        let playingFocus = null;
        this.audioPlayer.subscribe?.(() => {
            const id = this.audioPlayer.currentTrack?.id;
            if (id == null) return;
            followGraphFocus(playingFocus, `track:${id}`);
            playingFocus = `track:${id}`;
        });
        if (!VIEWER && !playbackSessionId()) window.addEventListener('pagehide', () => {
            this.audioPlayer.flushPosition();
            this.audioPlayer.leave();
        });

        this.init();
    }

    async init() {
        try {
            await this.detectBackend();
            this.integrationManager = new IntegrationManager();
            await this.integrationManager.initialize();
            this.releaseChecker = new ReleaseChecker(this.integrationManager.database);
            this.enrichmentOrchestrator = new EnrichmentOrchestrator({
                database: this.integrationManager.database,
            });
            // Adapter priority (first-writer-wins): FLAC sidecar beats external
            // sources because the user's own rip tags are the authoritative truth;
            // Discogs covers year/country/catno/genre/style broadly; MusicBrainz
            // fills in the canonical release date / ISRC / MBIDs that Discogs
            // doesn't carry as cleanly.
            this.enrichmentOrchestrator.registerAdapter(new FlacSidecarAdapter());
            this.enrichmentOrchestrator.registerAdapter(new DiscogsReleaseAdapter());
            this.enrichmentOrchestrator.registerAdapter(new MusicBrainzAdapter());
            this.crateManager = new CrateManager(this.integrationManager.database);
            this._activeCrateId = null;
            // Set when a filter change drops an active crate. Shown as a pill so the
            // user can restore the crate's saved filters with one click.
            this._modifiedCrate = null;
            // The server's Discogs queue fetches in the background; this client only
            // says what is in focus and hears when a job lands. Failures are silent.
            this.discogsQueue = VIEWER ? null : createDiscogsQueueClient();
            this.labelGap = new LabelGap({ database: this.integrationManager.database, queue: this.discogsQueue });
            this._labelGapState = null;
            if (!VIEWER) this.batchTagEditor = new BatchTagEditor({
                database: this.integrationManager.database,
                pendingDiffs: new PendingTagDiffs(this.integrationManager.database),
                getSelectedTrackIds: () => this._selectedTrackIds,
                getAllTracks: () => this._tracksCache || [],
                onPreviewChanged: () => this._updateTablePreviews(),
                onCommitted: async ({ staged = [] } = {}) => {
                    this._tracksCache = null;
                    this._mergedCache = null;
                    this._selectedTrackIds = new Set();
                    this._lastSelectedIdx = null;
                    if (this.currentView === 'collection') await this.loadCollectionView();
                    else if (this.currentView === 'exploreme') await this.loadExploremeView();
                    if (staged.length) await this._writeBatchEdit(staged);
                },
            });
            if (!VIEWER) {
                await this.batchTagEditor.init();
                this.batchTagEditor.mount();
            }

            // Single-track tag review (P3.2c/d). Staged changes reach disk here
            // or through the batch apply (batch-confirm.js), never directly.
            if (!VIEWER) this.trackReview = new TrackReviewDrawer({
                confirm: (message) => this._openGigConfirmModal({
                    title: 'Discard staged changes',
                    message,
                    confirmLabel: 'Discard',
                }),
                controller: new TrackReviewController({
                    database: this.integrationManager.database,
                    pendingDiffs: new PendingTagDiffs(this.integrationManager.database),
                    // Tools' sidebar count and tab-row Apply follow a stage, discard or write here.
                    onChanged: () => this._refreshStaged(),
                    onWritten: async () => {
                        this._tracksCache = null;
                        this._mergedCache = null;
                    },
                }),
                // A write's notification carries Undo (`writeStaged`); the rest are plain.
                notify: (message, tone, opts) => (opts?.action ? undoToast(message, opts.action.run, { type: tone, title: opts.title }) : this.showNotification?.(message, tone, opts)),
                onClosed: async () => {
                    // The written value is already in IndexedDB; re-render so the
                    // table stops disagreeing with the file on disk.
                    if (this._tracksCache === null) {
                        if (this.currentView === 'collection') await this.loadCollectionView();
                        else if (this.currentView === 'exploreme') await this.loadExploremeView();
                    }
                },
            });
            this.trackReview?.mount();
            // Exploreme tracks are part of Collection unless ⋯ › Exploreme tracks is turned off.
            this._includeExploreme = (await this.integrationManager.database.getSetting('include_exploreme')) !== false;
            this._includeStashed = (await this.integrationManager.database.getSetting('include_stashed')) === true;
            this._devTools ||= (await this.integrationManager.database.getSetting('dev_tools')) === true;
            const collMode = await this.integrationManager.database.getSetting('filter_match_mode_collection');
            const exploreMode = await this.integrationManager.database.getSetting('filter_match_mode_exploreme');
            // Restore Collection table sort + column order from persistent settings.
            // A stored key whose column is gone or no longer sorts is dropped.
            const sortableKeys = LIBRARY_TABLE_COLUMNS.filter((c) => c.sortable !== false).map((c) => c.key);
            this._tableSort = normalizeSort(await this.integrationManager.database.getSetting('collection_table_sort'), sortableKeys);
            // `collection_columns` supersedes the order-only `collection_col_order`,
            // which is deliberately not migrated: the 2026-10-29 default replaces it.
            const savedColumns = await this.integrationManager.database.getSetting('collection_columns');
            this._colLayout = resolveColumnLayout(savedColumns);
            const savedShowArt = await this.integrationManager.database.getSetting('collection_show_art_col');
            if (savedShowArt === false) this._showArtCol = false;
            // Discover chart per-card sort + expanded state.
            const ALLOWED_SORTS = new Set(['count-desc', 'alpha-asc', 'count-asc']);
            for (const id of ['genres', 'labels', 'years', 'acquisition']) {
                try {
                    const s = await this.integrationManager.database.getSetting(`discover_chart_sort_${id}`);
                    if (typeof s === 'string' && ALLOWED_SORTS.has(s)) this._chartSort[id] = s;
                    const e = await this.integrationManager.database.getSetting(`discover_chart_expanded_${id}`);
                    if (e === true) this._chartExpanded[id] = true;
                } catch (_) { /* ignore — keep defaults */ }
            }
            this._filterRows = readFilterRows(await this.integrationManager.database.getSetting('collection_filter_rows'));
            try {
                const gfCollapsed = await this.integrationManager.database.getSetting('collection_go_further_collapsed');
                if (gfCollapsed === true) this._collectionGoFurtherCollapsed = true;
            } catch (_) { /* keep defaults */ }
            this._filterScopes.collection = this._emptyFilterState(collMode === 'any' ? 'any' : 'all');
            this._filterScopes.exploreme = this._emptyFilterState(exploreMode === 'any' ? 'any' : 'all');
            this.filterEngine.state = this._cloneFilterState(this._filterScopes.collection);
            this.skins = new SkinManager();
            await this.skins.load();
            this.density = new DensityManager();
            this.density.load();
            // The web viewer has no sidebar: no drawer, toggle or ⌘\.
            if (!VIEWER) {
                this.sidebar = new SidebarDrawer({ container: document.querySelector('.app-container') });
                this.sidebar.load();
                if (window.matchMedia('(max-width: 900px)').matches) this.sidebar.set(false, { persist: false });
                document.getElementById('sidebarClose')?.addEventListener('click', () => {
                    this.sidebar.set(false);
                    this.sidebar._button?.focus();
                });
            }
            const topBar = document.querySelector('.top-bar');
            if (topBar) {
                this.sidebar?.mountToggle(topBar);
                this._mountTopBarControls(topBar);
            }
            try { await this.marks.load(); } catch (err) { console.warn('favorites unavailable', err); }
            document.addEventListener('favorites-changed', () => this._marksChanged());
            this.setupEventListeners();
            // The phone's bottom tab bar (phone.css shows it only on a phone); the viewer has none.
            if (!VIEWER) this.tabBar = new TabBar().mount(document.body);
            onGigsChanged(() => { this._dropMembershipIndex(); this._dropFilterContext(); });
            await this._refreshStaged();
            this.renderCratesSidebar();
            if (!location.hash || location.hash === '#') history.replaceState(null, '', VIEWER ? VIEWER_PROFILE.home : '#/collection?as=graph');
            if (PHONE) { installPhone(); installSheet(); installPhoneRows(); }
            await this._openHash();
            if (!VIEWER) this.gigPanel.load();
            if (!this.panel.kind) this.panel.clear();
            if (!VIEWER) this._restorePlayback();
            // B1: Ask the browser to persist this origin's storage so the OS
            // can't evict cached data under storage pressure.
            // Safe to call on every load — Chrome/Firefox only prompt once,
            // and a granted permission is a one-liner the user never sees again.
            if (navigator.storage?.persist) {
                navigator.storage.persist().catch(() => { /* non-fatal */ });
            }
        } catch (error) {
            console.error('Failed to initialize:', error);
            this.showNotification('Failed to initialize app', 'error');
        }
    }

    async _rawTracks() {
        if (!this._tracksCache) {
            this._tracksCache = await this.integrationManager.getAllTracks();
        }
        return this._tracksCache;
    }

    // View-facing track list with Bandcamp/Rekordbox duplicates merged to a single primary.
    // Collection, Explore, and Discover all funnel through here.
    async _allTracks() {
        if (this._mergedCache) return this._mergedCache;
        const { merged, clusters } = this._computeMerge(await this._rawTracks());
        this._mergedCache = merged;
        this._dedupClusters = clusters;
        return merged;
    }

    _computeMerge(rawTracks) {
        const rbTracks = rawTracks.filter((t) => t.source === 'rekordbox');
        const bcTracks = rawTracks.filter((t) => t.source === 'bandcamp');
        const others = rawTracks.filter((t) => t.source !== 'rekordbox' && t.source !== 'bandcamp');

        // Index RB tracks by (artist, album) and (artist, title) for BC matching.
        const rbByAlbum = new Map();
        const rbByTitle = new Map();
        for (const t of rbTracks) {
            const ak = buildRbAlbumKey(t);
            if (ak) {
                if (!rbByAlbum.has(ak)) rbByAlbum.set(ak, []);
                rbByAlbum.get(ak).push(t);
            }
            const tk = buildRbTrackKey(t);
            if (tk) {
                if (!rbByTitle.has(tk)) rbByTitle.set(tk, []);
                rbByTitle.get(tk).push(t);
            }
        }

        // Clusters keyed by a stable id. Each cluster has { primary, siblings, kind }.
        const clusters = new Map();
        const rbClusterId = new Map(); // rb track id → cluster id
        const hiddenIds = new Set();

        // Tier 1: RB ↔ RB. Collapse same-(artist,title) RB rows into one primary.
        const rbRbGroups = new Map();
        for (const t of rbTracks) {
            const k = buildRbRbKey(t);
            if (!k) continue;
            if (!rbRbGroups.has(k)) rbRbGroups.set(k, []);
            rbRbGroups.get(k).push(t);
        }
        for (const [k, group] of rbRbGroups) {
            if (group.length < 2) {
                rbClusterId.set(group[0].id, null);
                continue;
            }
            const primary = group[0];
            const siblings = group.slice(1);
            const cid = `rbrb|${k}`;
            clusters.set(cid, { id: cid, kind: 'rb-rb', primary, siblings });
            for (const s of siblings) hiddenIds.add(s.id);
            for (const t of group) rbClusterId.set(t.id, cid);
        }

        // Tier 2 + 3: Bandcamp attaches to RB. Album keys match all RB rows for that album;
        // track keys match at most one RB row.
        for (const bc of bcTracks) {
            const info = buildBandcampKey(bc);
            if (!info) continue;
            const matches = info.mode === 'album'
                ? (rbByAlbum.get(info.key) || [])
                : (rbByTitle.get(info.key) || []);
            if (matches.length === 0) continue;

            // Prefer attaching to an existing cluster (e.g. the rb-rb primary). Otherwise
            // create a fresh rb-bc cluster on the first RB match.
            const primaryRb = matches[0];
            let cid = rbClusterId.get(primaryRb.id);
            if (!cid) {
                cid = `rbbc|${primaryRb.id}`;
                clusters.set(cid, { id: cid, kind: 'rb-bc', primary: primaryRb, siblings: [] });
                rbClusterId.set(primaryRb.id, cid);
            } else {
                const c = clusters.get(cid);
                if (c && c.kind === 'rb-rb') c.kind = 'rb-bc+rb';
            }
            clusters.get(cid).siblings.push(bc);
            hiddenIds.add(bc.id);
        }

        // Stamp merge metadata on primaries, build the output list.
        const merged = [];
        for (const t of others) merged.push(t);
        for (const t of bcTracks) if (!hiddenIds.has(t.id)) merged.push(t);
        for (const t of rbTracks) {
            if (hiddenIds.has(t.id)) continue;
            const cid = rbClusterId.get(t.id);
            const cluster = cid ? clusters.get(cid) : null;
            if (cluster && cluster.siblings.some((s) => s.source === 'bandcamp')) {
                const bcSibling = cluster.siblings.find((s) => s.source === 'bandcamp' && s.bandcamp_url);
                const stamped = {
                    ...t,
                    _alsoOn: ['bandcamp'],
                    _bandcampUrl: bcSibling?.bandcamp_url || null,
                    _duplicateIds: cluster.siblings.map((s) => s.id),
                };
                merged.push(stamped);
            } else if (cluster && cluster.siblings.length) {
                merged.push({ ...t, _duplicateIds: cluster.siblings.map((s) => s.id) });
            } else {
                merged.push(t);
            }
        }

        return { merged, clusters };
    }

    _invalidateTracks() {
        this._tracksCache = null;
        this._mergedCache = null;
        this._dedupClusters = null;
        this._refreshStaged();
    }


    async detectBackend() {
        try {
            const res = await fetch('/api/health', { signal: AbortSignal.timeout(2000) });
            if (res.ok) {
                const data = await res.json();
                this.hasBackend = true;
                this.backendServices = data.services || {};
            }
        } catch {
            this.hasBackend = false;
        }
    }

    setupEventListeners() {
        window.addEventListener('hashchange', () => this._openHash());
        // Durable reads (`getAllTracks()` and friends) now go over the network
        // to the server-owned SQLite database and can throw mid-session — a
        // dead route (`hashchange`), a server restart, SQLITE_BUSY past the
        // client timeout, a 413. Neither `hashchange` nor `navigate()`'s
        // callers await or catch `_openRoute()`, so without this the failure
        // surfaced as nothing: the previous view stayed on screen, unchanged,
        // with no indication anything went wrong. This does not call
        // `event.preventDefault()`, so the browser still logs the rejection.
        window.addEventListener('unhandledrejection', createUnhandledRejectionHandler((message, tone) => this.showNotification?.(message, tone)));
        const nav = document.querySelector('.nav');
        renderSidebar(nav, SECTIONS, { counts: this._navCounts });
        nav?.addEventListener('click', (e) => {
            const item = e.target.closest('.nav-item');
            if (!item) return;
            e.preventDefault();
            if (window.matchMedia('(max-width: 900px)').matches) this.sidebar?.set(false, { persist: false });
            // Tracks, in the current mode, with the favourites filter Collection had on.
            if (item.dataset.section === 'collection') this.navigate({ view: 'collection', fav: this._collectionFav(), filter: this._scopeFilter({ view: 'collection' }) });
            else this._goToView(item.dataset.section === 'tools' ? toolsEntryView() : item.dataset.view);
        });
        document.getElementById('sectionTabs')?.addEventListener('click', (e) => {
            if (this._onTabControlsClick(e)) return;
            const tab = e.target.closest('a[data-view]');
            if (!tab) return;
            e.preventDefault();
            // The Cleanup tab opens the sub-tool last used.
            this._goToView(tab.dataset.view === 'formatting' ? cleanupEntryView() : tab.dataset.view, tab.dataset.tab);
        });
        const band = document.getElementById('filterBand');
        band?.addEventListener('click', (e) => this._onBandClick(e));
        band?.addEventListener('change', (e) => this._onBandChange(e));
        // BPM and Year commit when focus leaves their pair (or on Enter): From → To repaints nothing.
        // A field removed by a repaint (Chrome sends it focusout) is not a commit.
        band?.addEventListener('focusout', (e) => {
            if (!e.target.isConnected || !band.contains(e.target)) return;
            const range = rangeLeft(e.target, e.relatedTarget);
            if (range === 'year') this._commitBandYear(band);
            else if (range === 'bpm') this._commitBandBpm(band);
        });
        band?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.matches('[data-bpm-min], [data-bpm-max]')) { e.preventDefault(); this._commitBandBpm(band); }
            if (e.key === 'Enter' && e.target.matches('[data-year-min], [data-year-max]')) { e.preventDefault(); this._commitBandYear(band); }
        });
        // Right-click a saved-filter chip: rename, duplicate, update, delete.
        band?.addEventListener('contextmenu', (e) => {
            const chip = e.target.closest('[data-crate-id]');
            if (!chip || chip.dataset.crateId.startsWith('pinned:')) return;
            e.preventDefault();
            this._openCrateMenu(chip.dataset.crateId, chip);
        });
        document.getElementById('filterLine')?.addEventListener('click', (e) => this._onFilterLineClick(e));
        // Esc on the scope's chip clears it, as its × does.
        document.getElementById('filterLine')?.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || !e.target.closest?.('[data-pill-cat="scope"]')) return;
            e.preventDefault(); e.stopPropagation();
            this._removeLineCondition('scope');
        });

        // Art images speculatively hit /api/library/art/ for local tracks.
        // When the request fails (no embedded art, or the file is no longer
        // at the stored path) swap the img for a muted placeholder span so
        // the surface never shows a broken-image icon. `data-art-fallback`
        // may carry the placeholder's class list; empty means table thumb.
        // Error events don't bubble, so this listener runs in capture phase.
        document.addEventListener('error', (e) => {
            const img = e.target;
            if (!(img instanceof HTMLImageElement) || !img.hasAttribute('data-art-fallback')) return;
            const placeholder = document.createElement('span');
            placeholder.className = img.getAttribute('data-art-fallback') || 'art-thumb art-placeholder';
            placeholder.setAttribute('aria-hidden', 'true');
            img.replaceWith(placeholder);
        }, true);

        if (!VIEWER) document.querySelector('[data-listen]')?.addEventListener('click', () => toggleListenSheet(this));
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            // The one search: typed text narrows the view, and the Go list under it goes (go-list.js).
            this.pasteLink = new PasteLink({ app: this, input: searchInput });
            this.goList = new GoList({ app: this, input: searchInput, pasteLink: this.pasteLink });
        }

        document.addEventListener('keydown', (e) => {
            const target = e.target;
            const tag = target && target.tagName;
            const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || (target && target.isContentEditable);
            const search = document.getElementById('searchInput');
            // ⌘K and `/` land in the search field (on the phone's graph and in the viewer, the map's Search chip opens it).
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                this.goList?.focus();
                return;
            }
            if (e.defaultPrevented) return;
            // ⌘⇧L toggles the Listen sheet, but never behind an open modal.
            if (!VIEWER && (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'l'
                && !document.querySelector('.bte-root.bte-open, .tr-root.tr-open, .enrich-backdrop')) {
                e.preventDefault();
                toggleListenSheet(this);
                return;
            }
            if (target?.closest('.detail-panel')) return;
            if (!e.metaKey && !e.ctrlKey && !e.altKey && !isEditable && tag !== 'SELECT'
                && !document.querySelector('.bte-open, .tr-open, .enrich-backdrop')) {
                if (e.key.toLowerCase() === 'q') {
                    if (this._queueKey(e)) return;
                    if (e.shiftKey) {
                        const item = trackActions(this, this._actionTargetIds()).find((a) => a.id === 'queue');
                        if (item) { e.preventDefault(); item.run(); }
                    }
                    return;
                }
                // `]` collapses or expands the right-hand slot.
                if (e.key === ']' && this.rightSlot?.toggle()) { e.preventDefault(); return; }
                // `v`: Grid | Graph on a Collection tab; on an artist, label or tag page, its graph.
                if (e.key === 'v' && this._viewKey()) { e.preventDefault(); return; }
                // `b`, `d`, `y`, `w`: Bandcamp, Discogs, YouTube, WhoSampled for what Info shows; on the graph
                // with Info closed, for the selection bar.
                const siteRoot = this._atlasView?._active && !this.rightSlot?.shows?.('details') ? document.getElementById('atlasBar') : this.panel?.host;
                if (['b', 'd', 'y', 'w'].includes(e.key) && openSiteKey(e.key, siteRoot)) { e.preventDefault(); return; }
                // `*`: ☆ on a Collection tab (one click, as the header's ☆ with one collection in use).
                if (e.key === '*' && FAV_ROUTE_VIEWS.includes(this._route?.view)) { e.preventDefault(); this._syncRoute({ fav: this._favOnly() ? undefined : this._favDefault() }); return; }
                if (['f', 'F', 'g', 'G', 'e', 'n'].includes(e.key)) {
                    // On the graph: `f` (☆) and `⇧F` (♡) mark an artist, album, label or tag itself; `e`, `n` are for tracks only.
                    const node = this._atlasView?._active ? this._graphKeyTarget()?.node : null;
                    const intent = node ? nodeKeyIntent(e.key.toLowerCase(), node) : 'tracks';
                    if (intent === 'none') { e.preventDefault(); return; }
                    if (intent === 'star') {
                        e.preventDefault();
                        if (node.name) this.marks.toggle(markForKey(e.key) || STAR, node.type, node.name).catch((err) => this.showNotification(`Favorite not saved: ${err?.message || err}`, 'error'));
                        return;
                    }
                    const key = e.key === 'F' ? '⇧F' : e.key.toLowerCase();
                    const item = trackActions(this, this._actionTargetIds()).find((a) => a.key === key);
                    if (item) {
                        e.preventDefault();
                        item.run(item.id === 'gig' ? gigShortcutRunOptions(e.key) : undefined);
                        return;
                    }
                }
                if ((e.key === 'N' || e.key === 'P') && this.audioPlayer?.queue.current) {
                    e.preventDefault();
                    if (e.key === 'N') this.audioPlayer.next(); else this.audioPlayer.previous();
                    return;
                }
                // Space is play/pause only when nothing interactive has focus;
                // rows, buttons and fields keep their own Space behaviour.
                if (e.key === ' ' && !e.shiftKey && this.audioPlayer?.queue.current
                    && !target?.closest?.('a, button, input, select, textarea, summary, [tabindex], [role="button"], [role="row"], [role="option"]')) {
                    e.preventDefault();
                    this.audioPlayer.toggle();
                    return;
                }
            }
            if (e.key === '/' && !isEditable) {
                if (this.goList?.focus()) e.preventDefault();
                return;
            }
            // ⌘\ / Ctrl+\ → toggle the sidebar drawer (VS Code / Slack convention).
            if (e.key === '\\' && (e.metaKey || e.ctrlKey) && !isEditable) {
                e.preventDefault();
                this.sidebar?.toggle();
                return;
            }
            // ⌘[ / Ctrl+[ → back (mirrors browser + IDE conventions).
            if (e.key === '[' && (e.metaKey || e.ctrlKey) && !isEditable) {
                e.preventDefault();
                history.back();
                return;
            }
            if (e.key === ']' && (e.metaKey || e.ctrlKey) && !isEditable) {
                e.preventDefault();
                history.forward();
                return;
            }
            // ⌘A / Ctrl+A → select every filtered track (not just the drawn rows).
            if (e.key.toLowerCase() === 'a' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !isEditable) {
                const wrap = document.querySelector('.library-table-wrapper');
                const visible = this._lastRenderedVisible;
                if (wrap && Array.isArray(visible) && visible.length) {
                    e.preventDefault();
                    for (const t of visible) this._selectedTrackIds.add(t.id);
                    for (const row of wrap.querySelectorAll('tbody tr.library-table-row')) this._syncRowDomState(row, true);
                    this._updateSelectionBar(wrap);
                    return;
                }
            }
            if (e.key === 'Escape') {
                // Let the tag-editor's own Escape handler close it first;
                // don't also clear search in the background.
                if (document.querySelector('.bte-root.bte-open')) return;
                if (document.querySelector('.tr-root.tr-open')) return;
                // In-app modals (gig pickers, export confirms…) own Escape
                // while they are open; clearing the selection behind them
                // silently discards what the user was about to act on.
                if (document.querySelector('.enrich-backdrop')) return;
                // The order lives in escapeTarget (collection-header.js).
                const escTarget = escapeTarget({
                    fieldFocused: !!this.goList?.hasFocus(),
                    sheetOpen: !!this._listenView?.isOpen,
                    crateMenuOpen: !!this._closeCrateMenu,
                    pickerOpen: !!this._bandPops?.isOpen,
                    bandOpen: !!this._bandOpen,
                    slotExpanded: !!this.rightSlot && !this.rightSlot.view.collapsed,
                    hasSelection: this._selectedTrackIds.size > 0,
                    hasSearch: !!search?.value,
                });
                if (escTarget === 'field') { this.goList.escape(); return; }
                if (escTarget === 'sheet') { closeListenSheet(this); return; }
                if (escTarget === 'crate-menu') { this._closeCrateMenu(); return; }
                if (escTarget === 'picker') { this._bandPops.close(); return; }
                if (escTarget === 'band') {
                    this._toggleBand(false);
                    if (document.getElementById('filterBand')?.contains(document.activeElement)) document.activeElement.blur();
                    return;
                }
                // On the graph, the Esc after the slot collapses clears the focus.
                if (escTarget === 'slot') { this.rightSlot.escape(); return; }
                if (this._atlasView?._active && this._atlasView.handleEscape(e)) return;
                if (escTarget === 'selection') {
                    const wrap = document.querySelector('.library-table-wrapper');
                    this._selectedTrackIds = new Set();
                    this._lastSelectedIdx = null;
                    if (wrap) {
                        for (const row of wrap.querySelectorAll('tbody tr.library-table-row')) this._syncRowDomState(row, false);
                        this._updateSelectionBar(wrap);
                    }
                    return;
                }
                if (escTarget === 'search') {
                    search.value = '';
                    search.dispatchEvent(new Event('input', { bubbles: true }));
                    if (document.activeElement === search) search.blur();
                    return;
                }
                // Native <select> dropdown: blurring the focused select closes the popup.
                if (tag === 'SELECT') {
                    target.blur();
                }
            }
        });
    }

    // ── Navigation ──

    /** Tear down any stateful resources owned by the view we're leaving. */
    _teardownView(prevView) {
        if (!prevView) return;

        this._teardownTableVirtual();
        this._tableScroll = null;
        if (prevView === 'storage') this.storageView?.destroy();
        if (prevView === 'settings') { this._ingestSSE?.close(); this._ingestSSE = null; }
        if (isToolListView(prevView)) this._toolList?.destroy();
        if (prevView === 'track') this._trackPage?.dispose();
        if (['artists', 'albums', 'labels', 'tags'].includes(prevView)) this._indexView?.teardown();

        if (DISCOVER_VIEWS.includes(prevView)) {
            // Destroy all live Chart.js instances registered in chartRenderer.
            const instances = this.chartRenderer?._instances;
            if (instances) {
                for (const canvasId of Object.keys(instances)) {
                    this.chartRenderer.destroy(canvasId);
                }
            }

            // Clear drill state in-memory and in sessionStorage so return to
            // Discover always starts fresh — user said drill must not persist.
            this._discoverChartDrill = null;
            try { sessionStorage.removeItem(DISCOVER_DRILL_STORAGE_KEY); } catch (_) {}

            // Also clear chart selection state so it doesn't ghost on return.
            this._discoverChartSelection = [];
            try { sessionStorage.removeItem('discover_chart_selection'); } catch (_) {}

            // Dismiss any open context menu and remove its stray listeners.
            if (typeof this._closeDiscoverChartMenu === 'function') this._closeDiscoverChartMenu();

            if (prevView === 'discover') { this._discoverNew?.teardown(); this._shortlistView?.teardown(); this._atlasView?.teardown(); }
            if (prevView === 'charts') this._chartsView?.teardown();

            // BandcampFollowDiff is wired via renderBandcampFollowDiff(bcMount, …).
            // Its listeners are DOM-scoped to bcMount which is removed when
            // contentArea.innerHTML is replaced — no explicit dispose needed.
        }
    }

    async loadView(viewName, { routed = false } = {}) {
        if (!routed) {
            if (viewName === this._route?.view) return this._syncRoute();
            const view = viewName === 'exploreme' ? 'collection' : viewName;
            return this.navigate({ view, id: view === 'gigs' ? this._currentGigId || undefined : undefined, filter: this._scopeFilter({ view }) });
        }
        const isStale = this._routeIsStale || (() => false);
        const prevView = this.currentView;
        if (prevView !== viewName) this._teardownView(prevView);
        this.currentView = viewName;
        // A Collection load still awaiting IndexedDB must not resume on top of
        // the view we're switching to; bump its generation so it bails.
        if (viewName !== 'collection') this._collectionLoadGuard?.begin();
        if (typeof this._closeDiscoverChartMenu === 'function') this._closeDiscoverChartMenu();
        if (typeof this._closeFilesPopover === 'function') this._closeFilesPopover();
        // The header's filter band and line belong to the header views; the search field shows on
        // every view (the viewer's is the map's Search chip), narrowing where the view has a filter.
        if (!hasHeader(viewName)) this._hideCollectionHeader();
        this._syncNav(viewName);
        this.goList?.syncView({ ...this._route, view: viewName });

        const contentArea = document.getElementById('contentArea');
        if (!contentArea) return;
        // A graph draws in its own host (view-stage.js); every other view is the page. The page
        // still holding this view stays until it redraws; "Loading..." only the first time a view is built.
        const onGraph = (viewName === 'discover' && !this._route?.tab) || (hasGraph(viewName) && this._route?.graph);
        if (!onGraph) {
            showStage(false);
            if (contentArea.dataset.view !== viewName) contentArea.innerHTML = this._builtViews.has(viewName) ? '' : '<div class="loading">Loading...</div>';
        }

        try {
            switch (viewName) {
                case 'collection': await (this._route?.graph ? this.loadAtlasView() : this.loadCollectionView()); break;
                case 'charts': await this.loadChartsView(); break;
                case 'artists': case 'albums': case 'labels': case 'tags': await (this._route?.graph ? this.loadAtlasView() : this.loadIndexView(viewName)); break;
                case 'discover': await this.loadDiscoverView(); break;
                case 'sound-check': this.loadUnbuiltView(viewName); break;
                case 'tagging': case 'fields': case 'formatting': await this.loadToolListView(viewName); break;
                case 'identities': await this.loadIdentitiesView(); break;
                case 'playlists': await (this._playlistsView ||= new PlaylistsView({ app: this })).render(contentArea, this._route); break;
                case 'rekordbox': await renderPlaylistsWorkspace(contentArea, this); break;
                case 'gigs': await this.loadGigsView(); break;
                case 'storage': await this.loadStorageView(); break;
                case 'duplicates': await this.loadDuplicatesView(); break;
                case 'settings': await this.loadSettingsView(this._route); break;
                case 'paths': await this.loadPathsView(); break;
                case 'similarity': await this.loadSimilarityView(); break;
                default: await this.loadCollectionView();
            }
            if (isStale()) return;
            this._builtViews.add(viewName);
            if (!onGraph) contentArea.dataset.view = viewName;
            this.renderCratesSidebar();
        } catch (error) {
            delete contentArea.dataset.view;
            if (isStale()) return;
            console.error(`Error loading ${viewName}:`, error);
            contentArea.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${this.escapeHtml(error.message)}</p><button class="btn" id="viewRetryBtn">Retry</button></div>`;
            contentArea.querySelector('#viewRetryBtn')?.addEventListener('click', () => this.loadView(viewName));
        }
    }

    /** Open a sidebar entry or section tab. The non-routed loadView path builds
     *  the route from the live filter state, so a typed search survives. */
    _goToView(view, tab) {
        if (!view) return;
        if (tab) this.navigate({ view, tab, filter: this._scopeFilter({ view, tab }) });
        // A Collection tab opens in the current mode, ☆ kept.
        else if (sectionOf(view) === 'collection' && view !== this._route?.view) this.navigate({ ...this._tabRoute(view), filter: this._scopeFilter({ view }) });
        else this.loadView(view);
    }

    /** A Collection tab's route: the current mode, the graph's place, and the favourites filter on now. */
    _tabRoute(view) {
        const current = this._route?.graph && hasGraph(this._route.view) ? this._route.focus : null;
        return tabRoute(view, { graphTabs: this._graphTabs, fav: this._favRoute(), current });
    }

    /** The favourites filter Collection has on: the route's on a Collection tab, else the last one a Collection tab had. */
    _collectionFav() {
        const route = this._route;
        if (route && routeCarries(route, 'routeFav') && scopeFor(route.view) === 'collection') return route.fav || undefined;
        return this._lastCollectionFav;
    }

    /** The filter a route to `view` opens with: its scope's, live or remembered. None when the route carries no filter. */
    _scopeFilter(route) {
        if (!routeCarries(route, 'routeFilter')) return undefined;
        const scope = scopeFor(route.view);
        return scope === this._activeFilterScope ? this.filterEngine.state : this._filterScopes[scope];
    }

    /** Highlight the sidebar entry that owns `view` and draw its tab strip. */
    _syncNav(view) {
        this.tabBar?.sync(view);
        const section = sectionOf(view);
        document.querySelectorAll('.nav-item').forEach((item) => {
            const active = item.dataset.section === section;
            item.classList.toggle('active', active);
            if (active) item.setAttribute('aria-current', 'page');
            else item.removeAttribute('aria-current');
        });
        this._renderTabStrip(view);
        const subtabs = document.getElementById('sectionSubtabs');
        if (subtabs) { subtabs.innerHTML = subtabsHtml(view); subtabs.hidden = !subtabs.innerHTML; }
        renderDesktopOnlyNotice(document.getElementById('desktopOnlyNotice'), view);
    }

    /** Draw the tab strip; header views add their controls after the last tab. */
    _renderTabStrip(view) {
        const el = document.getElementById('sectionTabs');
        // The web viewer has no tab strip: the map, its Collection | Discover toggle, Search and back/forward are its navigation.
        if (VIEWER) { if (el) { el.innerHTML = ''; el.hidden = true; } return; }
        const section = sectionOf(view);
        const tab = this._route?.view === view ? this._route.tab : undefined;
        const hiddenViews = this._devTools || view === 'similarity' ? [] : ['similarity'];
        // The controls stay put while a tab switch loads; the new view repaints them.
        // Another scope's controls (Collection's ☆ and ⋯ on Favorites) never show.
        let controls = hasHeader(view) && this._header && scopeFor(this._header.view) === scopeFor(view) ? this._header.controls : '';
        // Playlists and Charts have no graph: the switch keeps its place, dimmed on the mode, also
        // while the view loads under the last tab's controls. Charts has no other controls.
        if (section === 'collection' && !hasGraph(view) && !VIEWER) controls = withDimmedSwitch(controls, viewSwitchHtml(this._graphTabs.graph, { dimmed: true }));
        // Collection's tabs open in the current mode, ☆ kept.
        const hrefFor = section === 'collection' ? (v) => buildRoute(this._tabRoute(v)) : null;
        renderSectionTabs(el, section, view, { counts: this._navCounts, viewTabs: VIEW_TABS[view], tab, hiddenViews, controlsHtml: controls, hrefFor });
        mountToolsApply(el, section, this._stagedState || {}, (batchId) => this._openApplyStaged(batchId));
    }

    /** Store a sidebar / tab count and paint every element that shows it. */
    _setNavCount(key, n) {
        this._navCounts ||= {};
        this._navCounts[key] = n;
        document.querySelectorAll(`[data-nav-count="${key}"], [data-tab-count="${key}"]`).forEach((el) => {
            if (n > 0) { el.textContent = n; el.hidden = false; }
            else { el.textContent = ''; el.hidden = true; }
        });
    }

    /** Placeholder for section tabs whose content lands in a later step. */
    loadUnbuiltView(view) {
        const elsewhere = null;
        document.getElementById('viewTitle').textContent = VIEW_LABELS[view];
        document.getElementById('viewSubtitle').textContent = '';
        document.getElementById('contentArea').innerHTML = `<div class="empty-state"><p>Not built yet.</p>${elsewhere ? `<a href="#/${elsewhere[0]}">${elsewhere[1]}</a>` : ''}</div>`;
    }

    async loadSettingsView(route = {}) {
        const routeIsStale = this._routeIsStale || (() => false);
        this._loadSettingsViewGuard ||= createStaleGuard();
        const loadIsStale = this._loadSettingsViewGuard.begin();
        const isStale = () => routeIsStale() || loadIsStale();
        const contentArea = document.getElementById('contentArea');
        // The Inbox and Other imports cards (the old Import view) come first.
        const database = this.integrationManager?.database;
        // Tracks come from the shared cache, so opening Settings doesn't refetch the library.
        const counts = await otherImportsCounts({
            getBandcampAccounts: () => this.integrationManager.getBandcampAccounts(),
            getSetting: (key) => database.getSetting(key),
            getTracks: () => this._rawTracks(),
        });
        if (isStale()) return;
        const discogsBlock = () => discogsBlockHtml({ ...counts, hasBackend: this.hasBackend, discogsAvailable: !!(this.hasBackend && this.backendServices?.discogs) });
        const other = otherImportsCardHtml({ ...counts, hasBackend: this.hasBackend, discogsAvailable: !!(this.hasBackend && this.backendServices?.discogs) });
        await renderSettingsView(contentArea, {
            leadingHtml: (this.hasBackend ? inboxCardHtml() : '') + other,
            hasBackend: this.hasBackend,
            onDiscogsChanged: (status) => {
                this.backendServices = { ...this.backendServices, discogs: !!status?.connected };
                // Other imports' Discogs block follows the Discogs card on the same page.
                const block = document.getElementById('otherImportsDiscogs');
                if (block && !isStale()) { block.innerHTML = discogsBlock(); this._wireDiscogsImport(isStale); }
            },
            skins: this.skins,
            database,
            notify: (message, type) => this.showNotification(message, type),
        });
        if (isStale()) return;
        this._setupCSVListeners();
        this._setupIngestUI();
        this._setupOtherImports(isStale);
        this._scrollToSettingsSection(route.section);
        if (this.hasBackend) this._fillIngestFolders(isStale);
    }

    /** Scroll a `?section=` card into view: Inbox by its id, the rest by their heading. */
    _scrollToSettingsSection(section) {
        if (!section) return;
        const card = section === 'inbox' ? document.getElementById('settingsInbox')
            : document.getElementById(section === 'appearance' ? 'appearanceTitle' : `settings${section[0].toUpperCase()}${section.slice(1)}Title`)?.closest('section');
        if (!card) return;
        card.scrollIntoView?.({ block: 'start' });
        if (card.hasAttribute('tabindex')) card.focus({ preventScroll: true });
    }

    /** The Inbox card's folders line; any failure leaves it hidden. */
    async _fillIngestFolders(isStale) {
        try {
            const [paths, inbox] = await Promise.all(['/api/ingest/paths', '/api/ingest/inbox'].map(async (url) => {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`${url} ${res.status}`);
                return res.json();
            }));
            if (isStale()) return;
            const el = document.getElementById('ingestFolders');
            const html = foldersLineHtml(paths, inbox?.watcher);
            if (!el || !html) return;
            el.innerHTML = html;
            el.hidden = false;
        } catch (err) { console.warn('Settings: ingest folders unavailable', err); }
    }

    async loadSimilarityView() {
        document.getElementById('viewTitle').textContent = 'Similarity';
        document.getElementById('viewSubtitle').textContent = 'Dev';
        const contentArea = document.getElementById('contentArea');
        const fetchJson = async (path, init) => (await fetch(path, init)).json();
        try { await renderSimilarityTool(contentArea, { fetchJson }); } catch (err) {
            contentArea.innerHTML = `<div class="empty-state"><p>${this.escapeHtml(err.message)}</p></div>`;
        }
    }

    async loadPathsView() {
        document.getElementById('viewTitle').textContent = 'File paths';
        document.getElementById('viewSubtitle').textContent = 'Tracks whose file has moved';
        document.getElementById('contentArea').innerHTML = `
            <div class="import-section import-path-repair">
                <p class="muted">Check looks for each missing file under the library folders. Rewrite changes stored paths only; files stay where they are.</p>
                <div class="import-actions">
                    <button type="button" class="btn btn-sm" id="pathRepairCheckBtn">Check paths</button>
                    <span class="import-status" id="pathRepairStatus" role="status"></span>
                </div>
                <div class="paths-report" id="pathRepairReport"></div>
            </div>`;
        this._wirePathRepair();
    }

    async loadStorageView() {
        const contentArea = document.getElementById('contentArea');
        if (!this.hasBackend) {
            document.getElementById('viewTitle').textContent = 'Storage';
            document.getElementById('viewSubtitle').textContent = 'Read-only library evidence';
            contentArea.innerHTML = '<div class="empty-state"><h3>Backend not running</h3><p>Start the server to scan and compare manifests.</p></div>';
            return;
        }
        if (!this.storageView) {
            this.storageView = new StorageView({
                notify: (message, type) => this.showNotification(message, type),
            });
        }
        await this.storageView.render(contentArea);
    }

    async loadArtistPageView(artistName) {
        const routeIsStale = this._routeIsStale || (() => false);
        this._loadArtistPageViewGuard ||= createStaleGuard();
        const loadIsStale = this._loadArtistPageViewGuard.begin();
        const isStale = () => routeIsStale() || loadIsStale();
        if (!artistName) return;
        this._teardownView(this.currentView);
        this.currentView = 'artist';
        document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
        this._hideCollectionHeader();
        document.querySelector('.search-container').style.display = 'none';
        if (!this._artistPage) this._artistPage = new ArtistPage({ app: this });
        try {
            await this._artistPage.render(artistName);
            if (isStale()) return;
            this.renderCratesSidebar();
        } catch (err) {
            if (isStale()) return;
            console.error('Artist page failed:', err);
            const contentArea = document.getElementById('contentArea');
            if (contentArea) {
                contentArea.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${this.escapeHtml(err.message)}</p><button class="btn" id="artistPageBackBtn">Back to Collection</button></div>`;
                contentArea.querySelector('#artistPageBackBtn')?.addEventListener('click', () => this.loadView('collection'));
            }
        }
    }

    async loadTagPageView(tagName) {
        const routeIsStale = this._routeIsStale || (() => false);
        this._loadTagPageViewGuard ||= createStaleGuard();
        const loadIsStale = this._loadTagPageViewGuard.begin();
        const isStale = () => routeIsStale() || loadIsStale();
        if (!tagName) return;
        // Same push-stack pattern as artist/label: only push from a restorable
        // origin view so tag→tag hops don't stack. Tag is not itself a

        this._teardownView(this.currentView);
        this.currentView = 'tag';
        document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
        this._hideCollectionHeader();
        document.querySelector('.search-container').style.display = 'none';
        if (!this._tagPage) this._tagPage = new TagPage({ app: this });
        try {
            await this._tagPage.render(tagName);
            if (isStale()) return;
            this.renderCratesSidebar();
        } catch (err) {
            if (isStale()) return;
            console.error('Tag page failed:', err);
            const contentArea = document.getElementById('contentArea');
            if (contentArea) {
                contentArea.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${this.escapeHtml(err.message)}</p><button class="btn" id="tagPageBackBtn">Back to Collection</button></div>`;
                contentArea.querySelector('#tagPageBackBtn')?.addEventListener('click', () => this.loadView('collection'));
            }
        }
    }

    async loadTrackPageView(trackId) {
        const routeIsStale = this._routeIsStale || (() => false);
        this._loadTrackPageViewGuard ||= createStaleGuard();
        const loadIsStale = this._loadTrackPageViewGuard.begin();
        const isStale = () => routeIsStale() || loadIsStale();
        if (!trackId) return;
        this._teardownView(this.currentView);
        this.currentView = 'track';
        document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
        this._hideCollectionHeader();
        document.querySelector('.search-container').style.display = 'none';
        if (!this._trackPage) this._trackPage = new TrackPage({ app: this });
        try {
            await this._trackPage.render(trackId);
            if (isStale()) return;
            this.renderCratesSidebar();
        } catch (err) {
            if (isStale()) return;
            console.error('Track page failed:', err);
            const contentArea = document.getElementById('contentArea');
            if (contentArea) {
                contentArea.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${this.escapeHtml(err.message)}</p><button class="btn" id="trackPageBackBtn">Back to Collection</button></div>`;
                contentArea.querySelector('#trackPageBackBtn')?.addEventListener('click', () => this.loadView('collection'));
            }
        }
    }

    // BPM is a navigable object like artist or label: clicking one lands on
    // Collection filtered to that whole-number BPM bucket (124 → 124.00–124.99),
    // with the BPM slider left in place to widen from there.
    filterCollectionByBpm(bpm) {
        const bucket = bpmBucket(bpm);
        if (!bucket) return;
        const filter = this._cloneFilterState(this._filterScopes.collection || this._emptyFilterState());
        filter.bpmRange = bucket;
        return this.navigate({ view: 'collection', filter });
    }

    /** Collection's filter with that one year (a range replaces discrete years). */
    filterCollectionByYear(year) {
        const filter = this._cloneFilterState(this._filterScopes.collection || this._emptyFilterState());
        filter.yearRange = { min: year, max: year };
        filter.years = [];
        return this.navigate({ view: 'collection', filter });
    }

    /** Collection's filter with that one key. */
    filterCollectionByKey(key) {
        if (!key) return;
        const filter = this._cloneFilterState(this._filterScopes.collection || this._emptyFilterState());
        filter.keys = [key];
        return this.navigate({ view: 'collection', filter });
    }

    async loadAlbumPageView(albumName, artistName) {
        const routeIsStale = this._routeIsStale || (() => false);
        this._loadAlbumPageViewGuard ||= createStaleGuard();
        const loadIsStale = this._loadAlbumPageViewGuard.begin();
        const isStale = () => routeIsStale() || loadIsStale();
        if (!albumName || !artistName) return;
        // Capture origin BEFORE we mutate currentView so back-restore lands
        // the user where they came from. Skip pushing on album→album hops.
        this._teardownView(this.currentView);
        this.currentView = 'album';
        document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
        this._hideCollectionHeader();
        document.querySelector('.search-container').style.display = 'none';
        if (!this._albumPage) this._albumPage = new AlbumPage({ app: this });
        try {
            await this._albumPage.render(albumName, artistName);
            if (isStale()) return;
            this.renderCratesSidebar();
        } catch (err) {
            if (isStale()) return;
            console.error('Album page failed:', err);
            const contentArea = document.getElementById('contentArea');
            if (contentArea) {
                contentArea.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${this.escapeHtml(err.message)}</p><button class="btn" id="albumPageBackBtn">Back to Collection</button></div>`;
                contentArea.querySelector('#albumPageBackBtn')?.addEventListener('click', () => this.loadView('collection'));
            }
        }
    }

    async loadLabelPageView(labelName) {
        const routeIsStale = this._routeIsStale || (() => false);
        this._loadLabelPageViewGuard ||= createStaleGuard();
        const loadIsStale = this._loadLabelPageViewGuard.begin();
        const isStale = () => routeIsStale() || loadIsStale();
        if (!labelName) return;
        // Capture origin BEFORE we mutate currentView, so back-restore lands
        // the user where they came from (Collection, Discover, or Explore).
        // Skip pushing if we're already on a Label page (label→label hops).
        this._teardownView(this.currentView);
        this.currentView = 'label';
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        this._hideCollectionHeader();
        document.querySelector('.search-container').style.display = 'none';
        if (!this._labelPage) this._labelPage = new LabelPage({ app: this });
        try {
            await this._labelPage.render(labelName);
            if (isStale()) return;
            this.renderCratesSidebar();
        } catch (err) {
            if (isStale()) return;
            console.error('Label page failed:', err);
            const contentArea = document.getElementById('contentArea');
            if (contentArea) {
                contentArea.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${this.escapeHtml(err.message)}</p><button class="btn" id="labelPageBackBtn">Back to Collection</button></div>`;
                contentArea.querySelector('#labelPageBackBtn')?.addEventListener('click', () => this.loadView('collection'));
            }
        }
    }

    // Back button + density/skin pickers cluster, mounted once in the top bar.
    // The back button is always in the DOM so its disabled state is the single
    // signal to the user about whether the stack has anything to restore.
    _mountTopBarControls(topBar) {
        const cluster = document.createElement('div');
        cluster.className = 'top-bar-controls';
        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'top-bar-back-btn';
        backBtn.setAttribute('aria-label', 'Back');
        backBtn.title = 'Back (⌘[)';
        backBtn.innerHTML = '<span class="back-arrow" aria-hidden="true">←</span>';
        backBtn.disabled = false;
        backBtn.addEventListener('click', () => history.back());
        cluster.appendChild(backBtn);
        const forward = document.createElement('button');
        forward.type = 'button';
        forward.className = 'top-bar-back-btn';
        forward.textContent = '→';
        forward.setAttribute('aria-label', 'Forward');
        forward.addEventListener('click', () => history.forward());
        cluster.appendChild(forward);
        topBar.appendChild(cluster);
        this._topBarControlsEl = cluster;
        this._backBtnEl = backBtn;

    }

    _clearAllFilters() {
        this._healthFilter = null;
        this._soundIssuesOnly = false;
        this._activeCrateId = null;
        this._modifiedCrate = null;
        this.filterEngine.clearAll();
        return this._syncRoute();
    }

    _rememberRouteState() {
        return {};
    }

    navigate(route, { replace = false } = {}) {
        // Listen is a sheet over Collection, not a place of its own.
        if (route?.listen) {
            if (VIEWER) return undefined;
            if (headerProfile(this.currentView)?.listen) return openListenSheet(this);
            // Off the header views: `#/listen` opens Collection, and its route opens the sheet.
            location.hash = '#/listen';
            return undefined;
        }
        // Keep the short address, but stamp remembered defaults on its history
        // entry before later user choices overwrite localStorage.
        if (this._route) history.replaceState({ ...history.state, umm: this._routeState }, '', location.href);
        // Every way into a Collection tab opens it in the current mode; only `graph` given says otherwise.
        if (!VIEWER) route = withMode(route, { graphTabs: this._graphTabs, current: this._route?.graph && hasGraph(this._route.view) ? this._route.focus : null });
        const hash = buildRoute(route);
        if (replace) {
            // A replaced entry keeps its place in the history (phone.js's Back depth).
            history.replaceState(Number.isInteger(history.state?.ummDepth) ? { ummDepth: history.state.ummDepth } : null, '', hash);
            return this._openRoute(parseRoute(hash));
        }
        if (hash === location.hash) return this._openRoute(parseRoute(hash));
        location.hash = hash;
    }

    /** Open the address bar's route. An old link (Map, Favorites, History, old
     *  graph and chart links) is rewritten in place, so the bar shows where you are. */
    _openHash() {
        let route = parseRoute(location.hash);
        // An old address (`#/favorites`, `#/history`) names no view: it opens in the current mode.
        // `#/listen` stays the Tracks table: its sheet would not survive a graph's opening pick.
        if (route.redirect && !route.listen && !VIEWER) route = withMode(route, { graphTabs: this._graphTabs });
        if (route.redirect) history.replaceState(history.state, '', buildRoute(route));
        return this._openRoute(route);
    }

    _syncRoute(patch = {}, { replace = false } = {}) {
        const route = { ...(this._route || { view: this.currentView || 'collection' }), ...patch };
        if (routeCarries(route, 'routeFilter')) route.filter = this._cloneFilterState(this.filterEngine.state);
        if (replace) {
            history.replaceState({ ...history.state, umm: this._routeState }, '', buildRoute(route));
            this._route = parseRoute(buildRoute(route));
            return Promise.resolve();
        }
        return this.navigate(route);
    }

    async _openRoute(route) {
        // `#/listen` is Collection with the Listen sheet open; the sheet is not kept on the route.
        const { listen, ...rest } = route;
        route = rest;
        if (VIEWER && isHiddenRoute(route)) {
            history.replaceState(history.state, '', VIEWER_PROFILE.home);
            route = parseRoute(VIEWER_PROFILE.home);
        }
        const isStale = this._routeGuard.begin();
        this._collectionLoadGuard?.begin();
        const previous = this._route;
        // The right-hand slot lives in Collection, Explore and Discover; outside them Details closes and Gig hides.
        this.rightSlot.syncSection(sectionOf(route.view));
        const sameDiscover = DISCOVER_VIEWS.includes(route.view) && previous?.view === route.view;
        // The graph refocuses in place: a Collection graph, from any graph tab to any other (only
        // the lit kind changes), and Discover's Graph tab (no `tab`).
        const sameGraph = Boolean(route.graph && previous?.graph && hasGraph(route.view) && hasGraph(previous.view));
        const incremental = sameGraph || (sameDiscover && route.view === 'discover' && !route.tab && !previous?.tab);
        // Leaving a Collection graph (Grid, another view) keeps the map built behind the page.
        if (previous?.graph && !sameGraph) this._atlasView?.suspend();
        // The mode is what a tab with both views shows; Playlists and Charts leave it as it was.
        if (hasGraph(route.view)) {
            const next = rememberMode(this._graphTabs, route.view, route.graph);
            if (next !== this._graphTabs) writeGraphTabs(this._graphTabs = next);
        }
        if (routeCarries(route, 'routeFav') && scopeFor(route.view) === 'collection') this._lastCollectionFav = route.fav || undefined;
        this._prevRoute = previous;
        this._route = route;
        this.gigPanel?.setPage(pageEntity(route));
        this._routeIsStale = isStale;
        if (route.dev && !this._devTools) {
            // #/similarity?dev=1 switches the dev-only tools on (setting `dev_tools`).
            this._devTools = true;
            this.integrationManager?.database?.saveSetting('dev_tools', true)?.catch?.(() => {});
        }
        if (this._activeFilterScope) this._filterScopes[this._activeFilterScope] = this._cloneFilterState(this.filterEngine.state);
        if (routeCarries(route, 'routeFilter')) {
            // A tab switch among the six Collection views keeps the same state object.
            const next = routeFilterState(route, { activeScope: this._activeFilterScope, state: this.filterEngine.state, empty: () => this._emptyFilterState() });
            if (next.state !== this.filterEngine.state) this.filterEngine.state = { ...this._cloneFilterState(next.state), ids: next.state.ids };
            // The saved filter in use belongs to its scope: Favorites' is not Collection's.
            if (next.scope !== this._activeFilterScope) this._swapScopeCrate(this._activeFilterScope, next.scope);
            this._activeFilterScope = next.scope;
            this._filterScopes[next.scope] = this._cloneFilterState(this.filterEngine.state);
        }
        // A scope from the address (Back, a reload, a link): its tracks, before any view lists them.
        const scope = this.filterEngine.state.scope;
        if (scope?.id && !scope.ids) {
            await resolveScope(scope, { data: (this._scopeData ||= new AtlasData()), tracks: () => this._allTracks(), show: readShow(), isAlive: () => !isStale() });
            if (isStale()) return;
            if (this._activeFilterScope) this._filterScopes[this._activeFilterScope] = this._cloneFilterState(this.filterEngine.state);
        }
        const persist = (field, value, key) => {
            if (!value) return;
            this[field] = value;
            try { localStorage.setItem(key, value); } catch (_) {}
        };
        rememberTool(route.view);
        if (DISCOVER_VIEWS.includes(route.view)) {
            // Only a view departure tears down Explore or Charts; a same-view focus,
            // chart or selection change redraws in place.
            if (!sameDiscover) this._teardownView(this.currentView);
            this.currentView = route.view;
            if (route.view === 'charts') {
                this._discoverChartSelection = route.sel || [];
                this._saveDiscoverChartSelection();
                // The drill is in the address: Back and a reload return to it.
                this._discoverChartDrill = route.drill || null;
            }
        }
        this._currentGigId = route.view === 'gigs' ? route.id || null : null;
        const entities = { artist: 'loadArtistPageView', label: 'loadLabelPageView', tag: 'loadTagPageView', album: 'loadAlbumPageView', track: 'loadTrackPageView' };
        // A graph tab to another graph tab: the same map, now that tab's view.
        if (sameGraph && previous.view !== route.view) this.currentView = route.view;
        if (incremental) await this._atlasView?.applyRoute(route);
        else if (route.view === 'playlists' && this.currentView === 'playlists' && this._playlistsView) await this._playlistsView.render(document.getElementById('contentArea'), route);
        else {
            const loader = entities[route.view];
            if (loader) {
                // An object page draws into the page outside loadView.
                showStage(false);
                const area = document.getElementById('contentArea');
                if (area) delete area.dataset.view;
                await this[loader](route.view === 'track' ? route.id : route.name, route.artist);
            } else await this.loadView(route.view, { routed: true });
        }
        if (isStale()) return;
        this._syncNav(route.view);
        // A focused table row's node takes keyboard focus on the map (graph-mirror.js).
        if (this._keyFocusNext && route.graph) this._atlasView?.keyFocus(this._keyFocusNext);
        this._keyFocusNext = null;
        if (route.openQueue) { this.audioPlayer?.show?.(); this.queuePanel?.show?.(); }
        if (route.savedFilters) this._toggleBand(true);
        // Review's old Exploreme tab: Collection with the pinned Exploreme filter.
        if (route.exploreme) await this._loadPinnedFilter('exploreme');
        if (listen && !VIEWER) openListenSheet(this);
        else if (!headerProfile(route.view, { viewer: VIEWER })?.listen) closeListenSheet(this);
        this._routeState = this._rememberRouteState();
        history.replaceState({ ...history.state, umm: this._routeState }, '', location.href);
        const label = route.name || (route.view === 'track' ? this._tracksCache?.find((t) => String(t.id) === route.id)?.title || route.id : route.view === 'gigs' && route.id ? this._currentGigName : VIEW_LABELS[route.view]);
        if (!serializeFilter(route.filter) && label) {
            this._route.label = label;
            this._recordRecent(route, label);
        }
    }

    _readRecentPlaces() {
        try { const recent = JSON.parse(localStorage.getItem('umm.recentPlaces') || '[]'); return Array.isArray(recent) ? recent : []; }
        catch (_) { return []; }
    }

    _recordRecent(route, label) {
        try { localStorage.setItem('umm.recentPlaces', JSON.stringify(pushRecent(this._readRecentPlaces(), { route, label }))); } catch (_) {}
    }

    async listGigsForGoList() {
        try { return await listGigs(this.integrationManager?.database, { sort: 'updatedAt' }); } catch (_) { return []; }
    }

    /** With the graph showing: a hovered row beside it (Info, a gig, the queue), else the graph's node. */
    _graphKeyTarget() {
        const row = document.querySelector('[data-track-id]:hover');
        return graphKeyTarget(row?.dataset.trackId, row?.dataset.trackId ? null : this._atlasView.actionTarget());
    }

    _actionTargetIds() {
        // On the graph, the node under the keys or the pointer; the table's hidden selection never.
        if (this._atlasView?._active) return this._graphKeyTarget()?.ids || [];
        if (this.currentView === 'collection' && this._selectedTrackIds?.size) return [...this._selectedTrackIds];
        const row = document.querySelector('[data-track-id]:hover');
        if (row?.dataset.trackId) return [row.dataset.trackId];
        if (this.currentView === 'track' && this._route?.id) return [this._route.id];
        return [];
    }

    // `q` always toggles the queue panel. Shift+Q returns false when targets
    // exist so the caller can run Add to queue.
    _queueKey(e) {
        const panel = this.queuePanel;
        const player = this.audioPlayer;
        if (!panel || !player) return false;
        const action = queueKeyAction({
            shiftKey: e.shiftKey,
            targets: this._actionTargetIds().length,
            hasCurrent: Boolean(player.queue.current),
        });
        if (action === 'queue') return false;
        if (action === 'none') return true;
        e.preventDefault();
        if (action === 'toggle' && panel.open) panel.close();
        else if (action === 'toggle') { player.show(); panel.show(); }
        return true;
    }

    /** Paint the rows' ☆ and ♡ again (these track ids; none given: every row). Paint only. */
    _paintRowMarks(ids = null) {
        const wanted = ids ? new Set(ids.map(String)) : null;
        document.querySelectorAll('.row-fav-btn[data-fav-track-id]').forEach((btn) => {
            if (wanted && !wanted.has(btn.dataset.favTrackId)) return;
            const id = btn.dataset.mark || STAR;
            paintMark(btn, this.marks.collection(id), this.marks.has(id, 'track', btn.dataset.favTrackId));
        });
    }

    /** After a row action: the rows' marks, then the selection bar and the track page. */
    _refreshRowFavoriteStars(ids = null) {
        this._paintRowMarks(ids);
        const wrapper = document.querySelector('.library-table-wrapper');
        if (wrapper) this._updateSelectionBar(wrapper);
        this._trackPage?.refreshActions?.();
    }

    // ── Collection View ──

    async loadCollectionView() {
        if (this._route?.view === 'collection' && serializeFilter(this._route.filter) !== serializeFilter(this.filterEngine.state)) return this._syncRoute();
        const viewTitle = document.getElementById('viewTitle');
        const contentArea = document.getElementById('contentArea');

        // Loads overlap whenever a second filter change lands while this one is
        // still awaiting IndexedDB. Each call clears `contentArea` and appends
        // its sections afterwards, so an older call that resumes late would
        // stack a stale table under the fresh one. Bail out after every await
        // once a newer load has begun.
        this._collectionLoadGuard ||= createStaleGuard();
        const loadIsStale = this._collectionLoadGuard.begin();
        const routeIsStale = this._routeIsStale || (() => false);
        const isStale = () => loadIsStale() || routeIsStale();

        viewTitle.textContent = 'Collection';

        // Resolve active-crate drift before rendering so the filter line sees it.
        await this._syncActiveCrateState();
        if (isStale()) return;
        // Read every favourites mark so the table's ☆ and ♡ render without
        // per-row async lookups.
        await this._refreshFavoritedTrackIds();
        await this._membershipIndex();
        if (isStale()) return;

        const [rawTracks] = await Promise.all([
            this._allTracks(),
            this._ensureSoundCheckData(),
        ]);
        if (isStale()) return;
        // ★: the tracks in the chosen collections, and every track by an artist or label in them.
        const favOnly = !!this._route?.fav && this._route.view === 'collection';
        let isFav = null;
        if (favOnly) {
            let favs = [];
            try { favs = await this.integrationManager.database.listMarks(this._route.fav); } catch (err) { console.warn('favorites unavailable', err); }
            if (isStale()) return;
            isFav = favoriteTrackFilter(favs);
        }
        const allTracks = collectionTracks(rawTracks, { includeExploreme: this._includeExploreme, includeStashed: this._stashedOnly() }).filter((t) => !isFav || isFav(t));
        await this._prepareRulesPass();
        let filtered = this.filterEngine.applyFilters(allTracks);
        // Health filter narrows further to RB-only tracks matching a predicate from the Discover card.
        if (this._healthFilter && HEALTH_FILTERS[this._healthFilter]) {
            const rbOnly = filtered.filter((t) => t.source === 'rekordbox');
            const ctx = buildHealthContext(allTracks.filter((t) => t.source === 'rekordbox'));
            filtered = rbOnly.filter((t) => HEALTH_FILTERS[this._healthFilter].predicate(t, ctx));
        }
        if (this._soundIssuesOnly) filtered = filtered.filter((track) => this._trackHasSoundIssue(track));
        const options = this.filterEngine.getNarrowedOptions(allTracks);

        // Read by the ⋯ menu's Sound issues and Tag replacements entries,
        // which stand in for the old toggles-row buttons until Tools phase 3.
        this._soundTagProposals = this._soundStatusAvailable
            ? collectSoundQualityTagProposals(this._tracksCache || allTracks, this._soundStatusIndex)
            : [];

        this._renderCollectionHeader('collection', { allTracks, filtered, options });

        if (allTracks.length === 0 && !favOnly) {
            contentArea.innerHTML = `
                <div class="empty-state">
                    <h3>No music yet</h3>
                    <p>Import a Rekordbox XML or CSV to get started.</p>
                    <button class="btn" id="collectionGoImportBtn">Go to Inbox</button>
                </div>
            `;
            contentArea.querySelector('#collectionGoImportBtn')?.addEventListener('click', () => this.navigate({ view: 'settings', section: 'inbox' }));
            return;
        }

        contentArea.innerHTML = '';

        if (!this._distributionCollapsed) this._renderCollectionDistribution(filtered, contentArea);

        if (favOnly && !allTracks.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML = '<p>No favorites yet.</p>';
            contentArea.appendChild(empty);
            return;
        }
        this._renderTable(filtered, contentArea);
        // Files column (P2.1): kick the bulk pair/drift fetch in the
        // background and patch dots in-place when it lands. Cached for 60s
        // so re-renders during a session don't re-fetch.
        this._ensureFilesPairData()
            .then(() => this._refreshFilesCells())
            .catch((err) => console.warn('files pair data load failed:', err));
    }

    _cloneFilterState(s) {
        // Every array facet is `[...(s.key || [])]` so older persisted state
        // (crates, filter-scope caches) missing newer facets like `albums`
        // doesn't blow up on iteration.
        return {
            artists: [...(s.artists || [])],
            labels: [...(s.labels || [])],
            albums: [...(s.albums || [])],
            genres: [...(s.genres || [])],
            subgenres: [...(s.subgenres || [])],
            tags: [...(s.tags || [])],
            years: [...(s.years || [])],
            sources: [...(s.sources || [])],
            keys: [...(s.keys || [])],
            bpmRange: s.bpmRange ? { min: s.bpmRange.min, max: s.bpmRange.max } : null,
            yearRange: s.yearRange ? { min: s.yearRange.min, max: s.yearRange.max } : null,
            camelotCompatible: !!s.camelotCompatible,
            search: s.search || '',
            ids: s.ids ? { ids: [...s.ids.ids], label: s.ids.label } : null,
            scope: s.scope?.id ? { ...s.scope, ids: s.scope.ids ? [...s.scope.ids] : null } : null,
            dateAddedRange: s.dateAddedRange ? { ...s.dateAddedRange } : null,
            matchMode: s.matchMode === 'any' ? 'any' : 'all',
            rules: s.rules ? JSON.parse(JSON.stringify(s.rules)) : null,
            invalidFilter: !!s.invalidFilter,
            savedRules: s.savedRules || null,
            crateId: s.crateId || null,
        };
    }

    _emptyFilterState(matchMode = 'all') {
        return {
            artists: [], labels: [], albums: [], genres: [], subgenres: [], tags: [], years: [], sources: [],
            keys: [], bpmRange: null, yearRange: null, camelotCompatible: false,
            dateAddedRange: null, search: '', ids: null, scope: null,
            matchMode: matchMode === 'any' ? 'any' : 'all',
            rules: null, invalidFilter: false, savedRules: null, crateId: null,
        };
    }

    /** Where Collection and Exploreme remember all/any; other scopes keep it in their filter only. */
    _matchModeSettingKey() {
        const scope = scopeFor(this.currentView);
        return scope === 'collection' || scope === 'exploreme' ? `filter_match_mode_${scope}` : null;
    }

    async _saveMatchMode(mode) {
        const key = this._matchModeSettingKey();
        // The viewer keeps no settings: all/any lasts for the page.
        if (!key || VIEWER) return;
        try { await this.integrationManager.database.saveSetting(key, mode); } catch (err) { console.error('persist matchMode failed', err); }
    }

    // ── Explore view ──

    async loadExploremeView() {
        const routeIsStale = this._routeIsStale || (() => false);
        this._loadExploremeViewGuard ||= createStaleGuard();
        const loadIsStale = this._loadExploremeViewGuard.begin();
        const isStale = () => routeIsStale() || loadIsStale();
        const viewTitle = document.getElementById('viewTitle');
        const contentArea = document.getElementById('contentArea');

        viewTitle.textContent = 'Explore';

        const rawTracks = await this._allTracks();

        if (isStale()) return;
        await this._refreshFavoritedTrackIds();
        if (isStale()) return;
        // ★: the tracks in the chosen collections, and every track by an artist or label in them.
        let isFav = null;
        if (this._exploremeFavOnly) {
            let favs = [];
            try { favs = await this.integrationManager.database.listMarks(this._exploremeFavOnly); } catch (err) { console.warn('favorites unavailable', err); }
            if (isStale()) return;
            isFav = favoriteTrackFilter(favs);
        }
        const allTracks = exploremeTracks(rawTracks).filter((t) => !isFav || isFav(t));
        const filtered = this.filterEngine.applyFilters(allTracks);

        const options = this.filterEngine.getNarrowedOptions(allTracks);

        this._renderCollectionHeader('exploreme', { allTracks, filtered, options, unit: 'tracks to get to know' });

        if (allTracks.length === 0) {
            contentArea.innerHTML = `
                <div class="empty-state">
                    <h3>Nothing tagged <code>exploreme</code> yet</h3>
                    <p>Add <code>exploreme</code> to a Rekordbox track's comments to see it here.</p>
                </div>
            `;
            return;
        }

        contentArea.innerHTML = '';

        this._renderTable(filtered, contentArea);
    }

    // ── Collection header: tab controls, filter band, filter line ──
    // The markup comes from collection-header.js; this is the wiring. Clicks
    // are delegated from #sectionTabs, #filterBand and #filterLine, bound once
    // in setupEventListeners.

    /** Conditions the line shows that the filter state does not hold. Health and
     *  Sound issues narrow only the Collection table, so only it shows them. */
    _filterLineExtras(view = this.currentView) {
        const state = this.filterEngine.state;
        const extra = [];
        if (state.rules || state.invalidFilter) {
            extra.push({ cat: 'rules', value: 'rules', label: state.invalidFilter ? 'Unreadable filter link' : describeRules(state.rules) });
        }
        if (state.ids) extra.push({ cat: 'ids', value: 'ids', label: state.ids.label || `${state.ids.ids.length} tracks` });
        if (view !== 'collection') return extra;
        const health = this._healthFilter && HEALTH_FILTERS[this._healthFilter]?.label;
        if (health) extra.push({ cat: 'health', value: this._healthFilter, label: `Health: ${health}` });
        if (this._soundIssuesOnly) extra.push({ cat: 'sound', value: '1', label: 'Sound issues' });
        return extra;
    }

    /** Subtitle, tab controls, band and line for a view with a header profile
     *  (header-profiles.js). `subtitle` replaces the track count; `count` counts
     *  in place of `filtered`, for a view that lists no rows (a graph); `before` and
     *  `after` are the view's own controls, either side of Filter. */
    _renderCollectionHeader(view, { allTracks = [], filtered = [], count = null, bandCount = null, options = {}, unit = 'tracks', subtitle: subtitleOverride = null, before = '', after = '' } = {}) {
        this._headerArgs = { view, allTracks, filtered, count, bandCount, options, unit, subtitle: subtitleOverride, before, after };
        const profile = headerProfile(view, { viewer: VIEWER }) || {};
        const state = this.filterEngine.state;
        const esc = (s) => this.escapeHtml(s);
        const extra = this._filterLineExtras(view);
        const favOnly = this._favOnly();
        const scoped = this.filterEngine.hasActiveFilters() || extra.length > 0;

        const subtitle = document.getElementById('viewSubtitle');
        if (subtitle) subtitle.textContent = subtitleOverride ?? subtitleText({ total: allTracks.length, filtered: count ?? filtered.length, scoped, unit }) + (favOnly ? ` · ${this._favLabel()}` : '');

        // Playlists' switch is dimmed in _renderTabStrip.
        const viewSwitch = hasGraph(view) && this._route?.view === view ? viewSwitchHtml(Boolean(this._route.graph), { viewer: VIEWER }) : '';
        const filterCount = activeConditionCount(state) + extra.length;
        this._favShape = this._favMenuShape();
        this._header = { view, controls: controlsHtml({ favOnly, favLabel: this._favLabel(), favMenu: this._favShape.menu, filterCount, bandOpen: this._bandOpen, star: profile.star, menu: profile.menu, before, after, viewSwitch }) };
        this._renderTabStrip(view);
        if (VIEWER) this._atlasView?.syncFilterChip({ count: filterCount, open: this._bandOpen });

        // A saved filter that drifted is still the line's name, marked modified.
        const crateId = this._activeCrateId || this._modifiedCrate?.id || null;
        const modified = !this._activeCrateId && !!this._modifiedCrate;
        const crateName = (this._crates || []).find((c) => c.id === crateId)?.name || this._modifiedCrate?.name || '';

        const band = document.getElementById('filterBand');
        if (band) {
            const focused = band.contains(document.activeElement) ? document.activeElement : null;
            const focusSel = focused && ['data-filter-cat', 'data-bpm-min', 'data-bpm-max', 'data-year-min', 'data-year-max', 'data-camelot', 'data-added-btn', 'data-band-more']
                .filter((a) => focused.hasAttribute(a)).map((a) => `[${a}${focused.getAttribute(a) ? `="${focused.getAttribute(a)}"` : ''}]`)[0];
            band.hidden = !this._bandOpen;
            // The saved-filter menu belongs to a chip; it goes when the chips do.
            this._closeCrateMenu?.();
            band.innerHTML = !this._bandOpen ? '' : bandHtml({
                saved: profile.saved !== false,
                rules: profile.rules !== false,
                chips: savedChips([...(this._crates || []), ...(profile.pinned ? PINNED_FILTERS : [])], { activeCrateId: crateId, modified }),
                hasFilter: this.filterEngine.hasActiveFilters(),
                controls: visibleControls(this._filterRows, state).filter((k) => !profile.hiddenControls?.includes(k)),
                options,
                state,
                matchMode: state.matchMode === 'any' ? 'any' : 'all',
                rulesMode: !!state.rules || !!state.invalidFilter,
                rulesSummary: this._rulesSummary(),
                more: this._bandMore,
                count: bandCount ?? (subtitleOverride === null ? count ?? filtered.length : null),
                unit,
                escapeHtml: esc,
            });
            if (focusSel) band.querySelector(focusSel)?.focus();
            this._bandPops?.refresh(band);
            // The viewer's band floats under the map's Filter chip; the phone keeps its own layout.
            this._floatingBand ||= createFloatingBand({ doc: document, onClose: () => this._toggleBand(false) });
            this._floatingBand.sync({ band, chip: VIEWER && !PHONE && this._atlasView?._active ? document.getElementById('atlasFilter') : null, open: this._bandOpen });
        }

        const line = document.getElementById('filterLine');
        if (line) {
            const swatches = this._atlasView?._active ? this._atlasView.swatches() : null;
            const html = filterLineHtml(filterLineModel(state, { crateName, modified, extra, swatches }), { escapeHtml: esc });
            patchHtml(line, html);
            line.hidden = !html;
        }
        this.gigPanel?.refreshFoot();
    }

    /** Rules mode's one-line summary in the band. */
    _rulesSummary() {
        const state = this.filterEngine.state;
        if (state.invalidFilter) return 'This filter link could not be read.';
        if (!state.rules) return '';
        const skipped = this.filterEngine.lastSkipped?.length || 0;
        const tooBig = encodeRules(state.rules) === null && !state.crateId;
        return [
            describeRules(state.rules),
            skipped ? `${skipped} rule${skipped === 1 ? '' : 's'} waiting for data` : '',
            tooBig ? 'too large for a link — save the filter' : '',
        ].filter(Boolean).join(' · ');
    }

    /** Repaint the header from the last render's data (band toggle, crate list). */
    _repaintCollectionHeader() {
        const args = this._headerArgs;
        if (args && hasHeader(this.currentView)) this._renderCollectionHeader(args.view, args);
    }

    /** Views without the header: no band, no line, no tab controls. */
    _hideCollectionHeader() {
        this._closeCrateMenu?.();
        this._headerArgs = null;
        this._header = null;
        this._bandOpen = false;
        this._bandPops?.close();
        this._floatingBand?.stop();
        this.gigPanel?.refreshFoot();
        for (const id of ['filterBand', 'filterLine']) {
            const el = document.getElementById(id);
            if (el) { el.hidden = true; el.innerHTML = ''; }
        }
    }

    _toggleBand(open = !this._bandOpen) {
        this._bandOpen = !!open;
        this._repaintCollectionHeader();
    }

    /** The band's facet pickers and Added presets (band-popovers.js), made on first use. */
    _bandPopovers() {
        return (this._bandPops ||= createBandPopovers({
            doc: document,
            engine: this.filterEngine,
            apply: (fn) => this._applyFilterChange(fn),
            current: () => ({ options: this._headerArgs?.options || {}, state: this.filterEngine.state }),
            onMore: () => { this._bandMore = !this._bandMore; this._repaintCollectionHeader(); },
            swatches: () => (this._atlasView?._active ? this._atlasView.swatches() : null),
        }));
    }

    /** Reload the current header view in place (no route change). */
    _reloadHeaderView() {
        const view = this.currentView;
        // A graph relights in place, Tracks' and Discover's included: the map stays.
        if (this._atlasView?._active) return this._atlasView.applyRoute(this._route);
        if (view === 'exploreme') return this.loadExploremeView();
        if (view === 'collection') return this.loadCollectionView();
        if (view === 'playlists') return this._playlistsView?.refresh();
        if (COLLECTION_VIEWS.includes(view)) return this.loadIndexView(view);
        return this.loadView(view);
    }

    /** A filter change from the band or line: apply it and reload. Other
     *  conditions (health, sound issues) stay; each pill's × removes its own. */
    _applyFilterChange(fn) {
        fn();
        return this.loadView(this.currentView);
    }

    /** ☆/★: Collection keeps it in the route (`fav`); Explore Me, which has
     *  no route of its own, keeps it for the session. */
    /** Grid | Graph on a Collection tab (`v`): the same tab, ☆ and filter, in the other view. */
    _setGraphView(graph = !this._route?.graph) {
        const route = this._route;
        if (!route || !hasGraph(route.view) || Boolean(route.graph) === graph) return false;
        const { focus, graph: _g, ...rest } = route;
        if (!graph) {
            // The table marks the selection's rows; keyboard focus on the map goes to the first (graph-mirror.js).
            this._mirrorSwitch = { focus: Boolean(document.activeElement?.closest?.('#atlasHost')) };
            return this.navigate({ ...rest, graph: false });
        }
        // From the Tracks table: its selected rows, or its focused row, say where the map opens.
        const row = route.view === 'collection' ? document.activeElement?.closest?.('tr.library-table-row')?.dataset.trackId ?? null : null;
        const pick = route.view === 'collection'
            ? graphFromTable({ selected: this._selectedTrackIds, focusedId: row, remembered: graphFocus.get(route.view) })
            : { focus: graphFocus.get(route.view) || null, rows: null };
        (this._atlasView ||= new AtlasView({ app: this })).setRows(pick.rows ? rowArtistIds(pick.rows, this._tracksCache || []) : null);
        this._keyFocusNext = row != null && pick.focus ? pick.focus : null;
        return this.navigate({ ...rest, graph: true, focus: pick.focus || undefined });
    }

    _viewKey() {
        const route = this._route;
        if (hasGraph(route?.view)) return this._setGraphView() !== false;
        const page = ['artist', 'label', 'tag'].includes(route?.view) && exploreRouteFor({ type: route.view, name: route.name });
        if (page) this.navigate(page);
        return Boolean(page);
    }

    _favOnly() {
        return Boolean(this._favRoute());
    }

    /** The favourites collections the header's ☆ has on: `true` (☆ alone), a list of ids, or undefined. */
    _favRoute() {
        if (this.currentView === 'exploreme') return normalizeFav(this._exploremeFavOnly);
        return FAV_ROUTE_VIEWS.includes(this._route?.view) ? normalizeFav(this._route.fav) : undefined;
    }

    /** What the one-click ☆ turns on: the one collection in use, else ☆. */
    _favDefault() {
        const used = this.marks.inUse();
        return used.length === 1 ? normalizeFav([used[0].id]) : true;
    }

    /** ☆ is a menu once more than one collection has marks (or one that is off is on). */
    _favMenuShape() {
        const used = this.marks.inUse().map((c) => c.id);
        const on = favIds(this._favRoute());
        const ids = [...new Set([...used, ...on])];
        return { menu: ids.length > 1, ids, key: `${ids.length > 1}|${ids.join(',')}` };
    }

    /** The header ☆'s face: off, the outline of what one click turns on; on, the glyphs of what is on, filled. */
    _favLabel() {
        const on = favIds(this._favRoute());
        if (!on.length) return this.marks.collection(favIds(this._favDefault())[0])?.glyph || '☆';
        return on.map((id) => filledGlyph(this.marks.collection(id)?.glyph || '☆')).join('');
    }

    _setFav(fav) {
        if (this.currentView === 'exploreme') {
            this._exploremeFavOnly = normalizeFav(fav);
            this.loadExploremeView();
        } else if (FAV_ROUTE_VIEWS.includes(this.currentView)) {
            this._syncRoute({ fav: normalizeFav(fav) });
        }
    }

    /** The header's ☆ menu: each collection in use, checked when on; several show what is in any of them. */
    _openFavMenu(anchor) {
        const ids = this._favMenuShape().ids;
        const menu = document.createElement('div');
        menu.className = 'row-context-menu column-menu fav-filter-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Favorites');
        // The route moves after the click: paint the choice just made, not the route's.
        const paint = (fav = this._favRoute()) => {
            const on = new Set(favIds(fav));
            menu.innerHTML = ids.map((id) => {
                const c = this.marks.collection(id);
                if (!c) return '';
                return `<button type="button" class="row-context-item" data-fav-pick="${escapeHtml(id)}" role="menuitemcheckbox" aria-checked="${on.has(id)}"><span class="column-menu-check" aria-hidden="true">${on.has(id) ? '✓' : ''}</span><span class="fav-glyph" aria-hidden="true">${escapeHtml(c.glyph)}</span><span>${escapeHtml(c.name)}</span></button>`;
            }).join('');
        };
        let chosen = this._favRoute();
        paint(chosen);
        const r = anchor.getBoundingClientRect();
        this._mountMenu(menu, { x: r.left, y: r.bottom + 4 });
        menu.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-fav-pick]');
            if (!btn) return;
            const id = btn.dataset.favPick;
            chosen = toggleFav(chosen, id);
            this._setFav(chosen);
            paint(chosen);
            menu.querySelector(`[data-fav-pick="${CSS.escape(id)}"]`)?.focus();
        });
        menu.querySelector('[data-fav-pick]')?.focus();
    }

    /** A mark given or taken anywhere: rows, the player bar and the header's ☆ follow. */
    _marksChanged() {
        // Paint only: the selection bar's update would hand Info back to the (empty) selection.
        this._paintRowMarks();
        this.audioPlayer?.refreshMarks?.();
        this.panel?._paintMarks?.();
        this._trackPage?.refreshActions?.();
        if (this._headerArgs?.view === this.currentView && this._favShape && this._favMenuShape().key !== this._favShape.key) {
            const { view, ...args } = this._headerArgs;
            this._renderCollectionHeader(view, args);
        }
    }

    _onTabControlsClick(e) {
        const favBtn = e.target.closest('[data-fav-only]');
        if (favBtn) {
            if (this._favMenuShape().menu) this._openFavMenu(favBtn);
            else this._setFav(this._favOnly() ? undefined : this._favDefault());
            return true;
        }
        const sw = e.target.closest('[data-view-switch]');
        if (sw) { this._setGraphView(sw.dataset.viewSwitch === 'graph'); return true; }
        if (e.target.closest('[data-filter-toggle]')) { this._toggleBand(); return true; }
        const menuBtn = e.target.closest('[data-header-menu]');
        if (menuBtn) { this._openHeaderMenu(menuBtn); return true; }
        return false;
    }

    async _onBandClick(e) {
        if (this._bandPopovers().handleClick(e)) return;
        const chip = e.target.closest('[data-crate-id]');
        if (chip) {
            const id = chip.dataset.crateId;
            this._bandOpen = false;
            if (id.startsWith('pinned:')) await this._loadPinnedFilter(id.slice('pinned:'.length));
            else await this._loadCrate(id);
            return;
        }
        if (e.target.closest('[data-save-crate]')) { this._onSaveCrate(); return; }
        if (e.target.closest('[data-update-crate]')) {
            const id = this._activeCrateId || this._modifiedCrate?.id;
            if (id) { this._modifiedCrate = null; await this._updateCrate(id); }
            return;
        }
        if (e.target.closest('[data-edit-rules]')) { this._openRulesBuilder(); return; }
        if (e.target.closest('[data-clear-rules]')) {
            const rules = this.filterEngine.state.rules;
            if (rules && !(await this._openGigConfirmModal({ title: 'Discard rules?', confirmLabel: 'Discard' }))) return;
            this._applyFilterChange(() => this.filterEngine.clearCategory('rules'));
        }
    }

    _onBandChange(e) {
        const t = e.target;
        if (t.matches('[data-camelot]')) {
            this._applyFilterChange(() => this.filterEngine.setCamelotCompatible(t.checked));
        }
    }

    _commitBandBpm(band) {
        const read = (sel) => { const v = band.querySelector(sel)?.value; return v === '' || v == null ? null : Number(v); };
        const min = read('[data-bpm-min]');
        const max = read('[data-bpm-max]');
        const cur = this.filterEngine.state.bpmRange;
        if ((cur?.min ?? null) === min && (cur?.max ?? null) === max) return;
        this._applyFilterChange(() => this.filterEngine.setBpmRange(min, max));
    }

    /** The Year inputs: a range (an empty end takes the oldest or newest year present), empty clears. */
    _commitBandYear(band) {
        const next = yearInputRange(band.querySelector('[data-year-min]')?.value, band.querySelector('[data-year-max]')?.value, this._headerArgs?.options?.yearSpan);
        if (next === undefined) return;
        const cur = this.filterEngine.state.yearRange;
        if ((cur?.min ?? null) === (next?.min ?? null) && (cur?.max ?? null) === (next?.max ?? null)) return;
        this._applyFilterChange(() => this.filterEngine.setYearRange(next?.min ?? null, next?.max ?? null));
    }

    _onFilterLineClick(e) {
        if (e.target.closest('[data-clear-filters]')) { this._clearAllFilters(); return; }
        if (e.target.closest('[data-pill-more]')) { this._toggleBand(true); return; }
        const pill = e.target.closest('[data-pill-cat]');
        if (!pill) return;
        const { pillCat: cat, pillValue: value } = pill.dataset;
        if (e.target.closest('.x')) { this._removeLineCondition(cat, value); return; }
        this._toggleBand(true);
        const sel = PILL_FOCUS[cat] || `[data-filter-cat="${cat}"]`;
        const control = document.getElementById('filterBand')?.querySelector(sel);
        // A facet's pill opens its picker; a range's focuses its input.
        if (control?.matches?.('.facet-btn')) this._bandPopovers().handleClick({ target: control });
        else control?.focus();
    }

    async _removeLineCondition(cat, value) {
        const engine = this.filterEngine;
        if (cat === 'health') { this._healthFilter = null; return this.loadView(this.currentView); }
        if (cat === 'sound') { this._soundIssuesOnly = false; return this.loadView(this.currentView); }
        if (cat === 'match') {
            engine.setMatchMode('all');
            await this._saveMatchMode('all');
            return this.loadView(this.currentView);
        }
        if (cat === 'rules') {
            if (engine.state.rules && !(await this._openGigConfirmModal({ title: 'Discard rules?', confirmLabel: 'Discard' }))) return;
            return this._applyFilterChange(() => engine.clearCategory('rules'));
        }
        return this._applyFilterChange(() => {
            if (cat === 'bpm') engine.setBpmRange(null, null);
            else if (cat === 'yearRange') engine.setYearRange(null, null);
            else if (cat === 'camelot') engine.setCamelotCompatible(false);
            else if (cat === 'dateAdded') engine.setDateAddedRange(null);
            else if (cat === 'ids' || cat === 'scope') engine.clearCategory(cat);
            else engine.toggleFilter(cat, value);
        });
    }

    async _openRulesBuilder() {
        const state = this.filterEngine.state;
        const all = await this._allTracks();
        const db = this.integrationManager?.database;
        const gigs = db ? await listGigs(db).catch(() => []) : [];
        openFilterBuilder({
            app: this, rules: state.rules || liftFlatState(state), options: this.filterEngine.getFilterOptions(all || []), gigs,
            onApply: (rules) => {
                this._healthFilter = null;
                this.filterEngine.setRules(rules);
                // Same view, same scope (an index's `within`, an open playlist), new filter.
                this._syncRoute();
            },
        });
    }

    /** Shared shell for the header's pop-up menus: place at x/y, close on outside click or Esc. */
    _mountMenu(menu, { x, y, right }) {
        document.querySelectorAll('.row-context-menu').forEach((m) => m.remove());
        document.body.appendChild(menu);
        const rect = menu.getBoundingClientRect();
        if (right != null) x = right - rect.width;
        menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - rect.width - 8))}px`;
        menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - rect.height - 8))}px`;
        const close = () => {
            menu.remove();
            document.removeEventListener('mousedown', outside, true);
            document.removeEventListener('keydown', onKey, true);
        };
        const outside = (e) => { if (!menu.contains(e.target)) close(); };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        setTimeout(() => {
            document.addEventListener('mousedown', outside, true);
            document.addEventListener('keydown', onKey, true);
        }, 0);
        return close;
    }

    /** Is a Collection tab's graph the view on screen? */
    _graphOnScreen() {
        return Boolean(this._route?.graph && hasGraph(this._route.view) && this._atlasView?._active);
    }

    /** The tabs row's ⋯ menu. */
    _openHeaderMenu(anchor) {
        const view = this._headerArgs?.view || this.currentView;
        // A graph on screen: only what acts on the map (the table's own items go).
        const graph = this._graphOnScreen();
        const items = menuItems({
            view,
            graph,
            showArt: this._showArtCol,
            scoped: this.filterEngine.hasActiveFilters(),
            insights: view === 'collection' && !graph ? !this._distributionCollapsed : undefined,
            soundIssues: view === 'collection' && this._soundStatusAvailable ? !!this._soundIssuesOnly : undefined,
            tagReplacements: view === 'collection' && (this._soundTagProposals?.length || 0) > 0,
            exploreme: view === 'collection' ? !!this._includeExploreme : undefined,
            group: view === 'collection' && !graph ? readGroup() : undefined,
        });
        const menu = document.createElement('div');
        menu.className = 'row-context-menu column-menu header-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Collection');
        menu.innerHTML = items.map((item) => {
            const check = `<span class="column-menu-check" aria-hidden="true">${item.checked ? '✓' : ''}</span>`;
            if (item.heading) return `<div class="row-context-heading" role="presentation">${escapeHtml(item.label)}</div>`;
            if (item.radio) return `<button type="button" class="row-context-item" data-menu-key="${item.key}" role="menuitemradio" aria-checked="${!!item.checked}">${check}<span>${escapeHtml(item.label)}</span></button>`;
            if (item.key === 'density') return `<div class="row-context-item header-menu-density" role="group" aria-label="Density">${check}<span>${escapeHtml(item.label)}</span><span class="header-menu-density-slot"></span></div>`;
            const role = 'checked' in item ? `menuitemcheckbox" aria-checked="${!!item.checked}` : 'menuitem';
            return `<button type="button" class="row-context-item" data-menu-key="${item.key}" role="${role}">${check}<span>${escapeHtml(item.label)}</span></button>`;
        }).join('');
        const slot = menu.querySelector('.header-menu-density-slot');
        if (slot) this.density?.mountPicker(slot);
        const r = anchor.getBoundingClientRect();
        const at = { right: r.right, y: r.bottom + 4 };
        const close = this._mountMenu(menu, at);
        menu.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-menu-key]');
            if (!btn) return;
            close();
            this._runHeaderMenuItem(btn.dataset.menuKey, { ...at, anchor });
        });
        menu.querySelector('[data-menu-key]')?.focus();
    }

    async _runHeaderMenuItem(key, { right, y, anchor }) {
        const filtered = this._headerArgs?.filtered || [];
        // The Tracks table's order where there is one; on a graph its lit tracks in that order; elsewhere the matching tracks.
        const tableOrder = () => (this._graphOnScreen() ? this._atlasView.headerTracks()
            : (['collection', 'exploreme'].includes(this.currentView) && this._lastRenderedOrdered) || filtered);
        switch (key) {
            case 'columns':
                this._openColumnMenu({ right, y, afterKey: null, onChange: () => this._reloadHeaderView() });
                break;
            case 'filters': this._openFilterRowsMenu(anchor); break;
            case 'artwork':
                this._showArtCol = !this._showArtCol;
                await this.integrationManager.database.saveSetting('collection_show_art_col', this._showArtCol);
                this._reloadHeaderView();
                break;
            case 'play-all':
            case 'shuffle-all': {
                const playable = tableOrder().filter(isLocalPlayable);
                const shuffle = key === 'shuffle-all';
                this.playLocalTrack(shuffle ? null : playable[0], playable, this._collectionPlayContext(), { shuffle });
                break;
            }
            case 'chart-slice': this._openCurrentFilterInDiscover(); break;
            case 'insights':
                this._distributionCollapsed = !this._distributionCollapsed;
                this._reloadHeaderView();
                break;
            case 'sound-issues':
                this._soundIssuesOnly = !this._soundIssuesOnly;
                this._reloadHeaderView();
                break;
            case 'exploreme':
                this._includeExploreme = !this._includeExploreme;
                try { await this.integrationManager.database.saveSetting('include_exploreme', this._includeExploreme); } catch (_) { /* the viewer keeps it for the visit */ }
                this._reloadHeaderView();
                break;
            case 'tag-replacements': await this._openTagReplacements(); break;
            default:
                if (key.startsWith('group:')) { writeGroup(key.slice(6)); this._reloadHeaderView(); }
                break;
        }
    }

    async _openTagReplacements() {
        let result;
        try {
            result = await openSoundQualityTagReview({
                proposals: this._soundTagProposals || [],
                database: this.integrationManager.database,
                onApplyStaged: () => this._openApplyStaged(),
            });
        } catch (error) {
            this.showNotification(`Could not open tag review: ${error.message}`, 'error');
            return;
        }
        if (!result) return;
        const staged = result.staged.length;
        const skipped = result.conflicts.length;
        const failed = result.failed.length;
        if (staged) this.showNotification(`${staged} quality tag${staged === 1 ? '' : 's'} staged — nothing written`, 'success');
        else if (failed) this.showNotification(`Could not stage ${failed} quality tag${failed === 1 ? '' : 's'}`, 'error');
        else if (skipped) this.showNotification(`${skipped} staged edit${skipped === 1 ? '' : 's'} left untouched`, 'info');
    }

    /** ⋯ › Filters: which band controls show. Stays open for several toggles. */
    _openFilterRowsMenu(anchor) {
        const menu = document.createElement('div');
        menu.className = 'row-context-menu column-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Filters');
        const shown = (key) => !this._filterRows.hidden.has(key);
        menu.innerHTML = FILTER_CONTROLS.map((c) => `<button type="button" class="row-context-item" data-filter-row="${c.key}" role="menuitemcheckbox" aria-checked="${shown(c.key)}"><span class="column-menu-check" aria-hidden="true">${shown(c.key) ? '✓' : ''}</span><span>${escapeHtml(c.label)}</span></button>`).join('');
        const r = anchor.getBoundingClientRect();
        this._mountMenu(menu, { right: r.right, y: r.bottom + 4 });
        menu.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-filter-row]');
            if (!btn) return;
            const key = btn.dataset.filterRow;
            const hidden = new Set(this._filterRows.hidden);
            if (hidden.has(key)) hidden.delete(key); else hidden.add(key);
            this._filterRows = { hidden };
            btn.setAttribute('aria-checked', String(shown(key)));
            btn.querySelector('.column-menu-check').textContent = shown(key) ? '✓' : '';
            this._repaintCollectionHeader();
            try { await this.integrationManager.database.saveSetting('collection_filter_rows', { hidden: [...hidden] }); } catch (err) { console.error('persist filter rows failed', err); }
        });
        menu.querySelector('[data-filter-row]')?.focus();
    }

    _orderedColumns() {
        // Art is pinned after the star (visibility-toggled via `_showArtCol`);
        // every other data column follows the saved layout.
        const artCol = this._showArtCol ? [COLUMN_BY_KEY.get('art')] : [];
        const { order, hidden } = this._colLayout;
        return [...artCol, ...order.filter((key) => !hidden.has(key)).map((key) => COLUMN_BY_KEY.get(key)).filter(Boolean)];
    }

    _reorderColumn(dragged, target) {
        if (dragged === 'art' || target === 'art') return;
        const order = moveColumn(this._colLayout.order, dragged, target);
        if (!order) return;
        this._colLayout = { ...this._colLayout, order };
        this._saveColOrder();
    }

    _setColumnHidden(key, hide) {
        if (REQUIRED_COLUMNS.includes(key)) return;
        const hidden = new Set(this._colLayout.hidden);
        if (hide) hidden.add(key); else hidden.delete(key);
        this._colLayout = { ...this._colLayout, hidden };
        this._saveColOrder();
    }

    // Right-click on the table heading: show or hide columns, Music.app style.
    // The menu stays open so several columns can be toggled in one visit.
    _openColumnMenu({ x, y, right, afterKey, onChange }) {
        const menu = document.createElement('div');
        menu.className = 'row-context-menu column-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Columns');
        const entries = [
            { key: 'art', label: 'Artwork', on: () => this._showArtCol, required: false },
            ...this._colLayout.order.map((key) => {
                const col = COLUMN_BY_KEY.get(key);
                return { key, label: col?.menuLabel || col?.label || key, on: () => !this._colLayout.hidden.has(key), required: REQUIRED_COLUMNS.includes(key) };
            }),
        ];
        const itemHtml = (entry, i) => `<button type="button" class="row-context-item" data-column-toggle="${i}" role="menuitemcheckbox" aria-checked="${entry.on()}"${entry.required ? ' disabled' : ''}><span class="column-menu-check" aria-hidden="true">${entry.on() ? '✓' : ''}</span><span>${escapeHtml(entry.label)}</span></button>`;
        menu.innerHTML = entries.map(itemHtml).join('') + '<button type="button" class="row-context-item" data-column-reset role="menuitem"><span class="column-menu-check" aria-hidden="true"></span><span>Reset columns</span></button>';
        const close = this._mountMenu(menu, { x, y, right });
        let insertionKey = afterKey;
        menu.addEventListener('click', async (event) => {
            if (event.target.closest('[data-column-reset]')) {
                this._colLayout = resolveColumnLayout(null);
                this._saveColOrder();
                close();
                onChange();
                return;
            }
            const btn = event.target.closest('[data-column-toggle]');
            if (!btn || btn.disabled) return;
            const entry = entries[Number(btn.dataset.columnToggle)];
            if (entry.key === 'art') {
                this._showArtCol = !this._showArtCol;
                await this.integrationManager.database.saveSetting('collection_show_art_col', this._showArtCol);
            } else {
                const wasVisible = entry.on();
                if (wasVisible) this._setColumnHidden(entry.key, true);
                else {
                    this._colLayout = showColumnAfter(this._colLayout, entry.key, insertionKey);
                    insertionKey = entry.key;
                    this._saveColOrder();
                }
            }
            btn.setAttribute('aria-checked', String(entry.on()));
            btn.querySelector('.column-menu-check').textContent = entry.on() ? '✓' : '';
            onChange();
        });
        menu.querySelector('[data-column-toggle]:not([disabled])')?.focus();
    }

    // Debounced persistence for table sort + column order. Mirrors the
    // filter_match_mode settings-store pattern.
    _saveTableSort() {
        clearTimeout(this._saveTableSortTimer);
        this._saveTableSortTimer = setTimeout(async () => {
            try {
                await this.integrationManager.database.saveSetting('collection_table_sort', this._tableSort);
            } catch (e) { console.error('persist table sort failed', e); }
        }, 200);
    }

    _saveColOrder() {
        clearTimeout(this._saveColOrderTimer);
        this._saveColOrderTimer = setTimeout(async () => {
            try {
                const { order, hidden } = this._colLayout;
                await this.integrationManager.database.saveSetting('collection_columns', { order, hidden: [...hidden] });
            } catch (e) { console.error('persist col order failed', e); }
        }, 200);
    }

    _soundStatusFor(track) {
        return soundStatusForTrack(track, this._soundStatusIndex);
    }

    _trackHasSoundIssue(track) {
        return isSoundIssue(this._soundStatusFor(track));
    }

    async _ensureSoundCheckData({ force = false } = {}) {
        const STALE_MS = 60_000;
        if (this._soundStatusInflight) return this._soundStatusInflight;
        if (!force && this._soundStatusLoadedAt && (Date.now() - this._soundStatusLoadedAt) < STALE_MS) {
            return this._soundStatusIndex;
        }
        this._soundStatusInflight = (async () => {
            try {
                const response = await fetch('/api/sound-check/status');
                if (!response.ok) throw new Error(`Sound Check status failed: ${response.status}`);
                const payload = await response.json();
                this._soundStatusIndex = buildSoundStatusIndex(payload?.items);
                this._soundStatusAvailable = payload?.available === true;
                this._dropFilterContext();
                return this._soundStatusIndex;
            } catch (error) {
                this._soundStatusIndex = buildSoundStatusIndex();
                this._soundStatusAvailable = false;
                console.warn('Sound Check status unavailable:', error);
                return this._soundStatusIndex;
            } finally {
                this._soundStatusLoadedAt = Date.now();
                this._soundStatusInflight = null;
            }
        })();
        return this._soundStatusInflight;
    }

    // Files column (P2.1) ─── pair / drift status helpers.
    //
    // Two GETs once per Collection mount: /api/library/scan (cached server-side)
    // builds the universe of paired/mp3-only paths; /api/library/drift overlays
    // the subset that's drifted or missing. We avoid a per-row /api/library/pair
    // hit (which would be 5000+ requests) and skip enriching scanLibrary on the
    // server side. Drift may lag by one rescan cycle — that's fine; per-row
    // "Rescan this row" hits /api/library/pair for fresh truth on demand.
    _filesStatusFor(absMp3Path) {
        if (!absMp3Path) return 'unknown';
        if (!this._filesPairMap) return 'loading';
        return this._filesPairMap.get(absMp3Path) || 'unknown';
    }

    async _ensureFilesPairData({ force = false } = {}) {
        if (VIEWER) return new Map();
        const STALE_MS = 60_000;
        if (this._filesPairInflight) return this._filesPairInflight;
        if (!force && this._filesPairMap && (Date.now() - this._filesPairLoadedAt) < STALE_MS) {
            return this._filesPairMap;
        }
        this._filesPairInflight = (async () => {
            try {
                const [scanRes, driftRes] = await Promise.all([
                    fetch('/api/library/scan').then((r) => r.ok ? r.json() : null).catch(() => null),
                    fetch('/api/library/drift').then((r) => r.ok ? r.json() : null).catch(() => null),
                ]);
                const map = new Map();
                if (scanRes && Array.isArray(scanRes.pairs)) {
                    for (const p of scanRes.pairs) if (p?.mp3?.path) map.set(p.mp3.path, 'paired');
                }
                if (scanRes && Array.isArray(scanRes.mp3Only)) {
                    for (const p of scanRes.mp3Only) if (p?.mp3?.path) map.set(p.mp3.path, 'mp3only');
                }
                if (driftRes && Array.isArray(driftRes.drifted)) {
                    for (const d of driftRes.drifted) {
                        if (!d?.mp3Path) continue;
                        // missing.mp3 takes priority — file no longer at the recorded path.
                        if (d.missing?.mp3 && !d.missing?.flac) map.set(d.mp3Path, 'flaconly');
                        else map.set(d.mp3Path, 'drift');
                    }
                }
                this._filesPairMap = map;
                this._filesPairLoadedAt = Date.now();
                return map;
            } finally {
                this._filesPairInflight = null;
            }
        })();
        return this._filesPairInflight;
    }

    // Patch the rendered attention cells in-place once bulk file data lands.
    // Avoids a full table re-render so selection / scroll position aren't
    // disrupted; unchanged cells are left alone so an open popover keeps its anchor.
    _refreshFilesCells() {
        const cells = document.querySelectorAll('td.col-status[data-files-path]');
        if (!cells.length) return;
        const byId = this._vt?.idMap;
        if (!byId) return;
        // Only rendered rows exist in the DOM; rows scrolling into view are
        // drawn from the cached pair map, so nothing is refetched.
        for (const cell of cells) {
            const track = byId.get(cell.closest('tr')?.dataset.trackId);
            if (!track) continue;
            const next = this._cellHtml('status', track);
            if (next.includes(`data-attention="${cell.dataset.attention}"`)) continue;
            cell.outerHTML = next;
        }
    }

    // Open the single-track tag review drawer for one row (P3.2c). Refuses
    // rows with no local file rather than opening a panel where every control
    // is dead — a Bandcamp or Discogs row has nothing to write to.
    /**
     * The batch editor's local rows go straight to the files through the batch
     * apply, with a quiet notice and Undo. The preview opens only when the plan
     * is refused, needs the typed count, Rekordbox is running, or the run stops;
     * closing it before a batch starts takes the edit back.
     */
    async _writeBatchEdit(staged) {
        const trackIds = [...new Set(staged.map((s) => s.trackId))];
        // A batch already running opens instead; this edit was never in it.
        let running = null;
        try {
            const res = await fetch('/api/tags/batch');
            running = ((await res.json()).batches || []).find((b) => b.status === 'running') || null;
        } catch { running = null; }
        if (running) {
            await this.batchTagEditor.unstage(staged);
            await this._openApplyStaged(running.batchId);
            this.showNotification('Another batch was still running, so these edits were not written. Edit tags again once it ends.', 'error');
            await this._refreshStaged();
            return;
        }
        const controller = new BatchConfirmController();
        let out;
        try {
            out = await writeOrPreview(controller, { trackIds, sources: ['manual-batch'] }, {
                openPreview: (c) => this._openApplyStaged(null, null, { controller: c }),
            });
        } catch (error) {
            this.showNotification(`Could not write tags: ${error.message}`, 'error');
            out = { started: Boolean(controller.batchId) };
        }
        if (!out.started) await this.batchTagEditor.unstage(staged);
        if (out.outcome === 'written') {
            await this._reloadAfterBatch();
            undoToast(tagsWrittenText(controller.status), () => undoWritten(controller), {
                title: mp3OnlyReasonsTitle(controller.status?.mp3OnlyReasons),
                onUndone: async () => { await this._reloadAfterBatch(); await this._refreshStaged(); },
            });
        }
        await this._refreshStaged();
    }

    /** Reload rows after a batch wrote, undid or released tags. */
    async _reloadAfterBatch() {
        this._tracksCache = null;
        this._mergedCache = null;
        if (this.currentView === 'collection') await this.loadCollectionView();
        else if (this.currentView === 'exploreme') await this.loadExploremeView();
        else if (isToolListView(this.currentView)) await this.loadToolListView(this.currentView);
    }

    /**
     * The Apply staged batch preview; resumes a batch that is still running.
     * `scope` ({ trackIds, sources }) limits the preview; a `controller` that
     * already planned or ran is shown as it stands. Resolves to the final
     * state and whether a batch started.
     */
    async _openApplyStaged(batchId = null, scope = null, { controller: given = null } = {}) {
        const controller = given || new BatchConfirmController();
        let running = null;
        if (!given) {
            try {
                const res = await fetch('/api/tags/batch');
                const json = await res.json();
                running = (json.batches || []).find((b) => b.status === 'running') || null;
            } catch { running = null; }
        }
        try {
            const opening = openBatchConfirm({ controller });
            const resumeId = batchId || running?.batchId;
            if (resumeId) {
                await controller.resume(resumeId);
                if (controller.state === 'running') controller.watch();
            } else if (!given) {
                await controller.requestPlan(scope || {});
            }
            const finalState = await opening;
            if (['committed', 'halted', 'undone', 'released'].includes(finalState)) {
                // Refresh after the dialog closes.  Refreshing only when the
                // terminal poll arrived raced the Collection cache and could
                // leave old Comments visible until a full page reload.
                await this._reloadAfterBatch();
            }
            await this._refreshStaged();
            if (finalState === 'committed') this.showNotification(batchWrittenText(controller.status), 'success', { title: mp3OnlyReasonsTitle(controller.status?.mp3OnlyReasons) });
            else if (finalState === 'halted') this.showNotification('Batch stopped early — see the dialog result', 'error');
            return { state: finalState, started: Boolean(controller.batchId), resumed: Boolean(resumeId) };
        } catch (error) {
            this.showNotification(`Could not open batch apply: ${error.message}`, 'error');
            return { state: 'error', started: Boolean(controller.batchId) };
        }
    }

    /** Review & write tags: Info is the editor. Select the row if needed and open Info on it. */
    async _openTrackReview(trackId) {
        const id = String(trackId ?? '');
        const track = [...(this._lastRenderedOrdered || []), ...(this._tracksCache || [])].find((t) => String(t.id) === id);
        if (!track) {
            this.showNotification('Track not found in the current view', 'error');
            return;
        }
        if (!(await this.panel.canLeave(this._infoFocusedId, id))) return;
        const idx = (this._lastRenderedOrdered || []).findIndex((t) => String(t.id) === id);
        this._infoFocusedId = id;
        if (idx >= 0 && this._focusedSelectedId() !== id) {
            this._selectedTrackIds = new Set([id]);
            this._tableFocusIdx = idx;
            this._syncSelectionDom();
        }
        await this.panel.open(track, null, { focus: false });
    }

    /** After a write from Info (or its Undo): the row shows the new values without a reload. */
    _trackWritten(track) {
        if (!track) return;
        for (const list of [this._lastRenderedOrdered, this._tracksCache]) {
            const row = (list || []).find((t) => String(t.id) === String(track.id));
            if (row) Object.assign(row, track);
        }
        this._vt?.update?.(true);
    }

    // Drawer for a single row's pair status. Floating panel anchored under the
    // clicked dot — same lifecycle pattern as `_openDiscoverChartMenu`.
    async _openFilesPopover(btn) {
        if (!btn) return;
        const path = btn.dataset.filesPath;
        if (!path) return;
        this._closeFilesPopover();

        const popover = document.createElement('div');
        popover.className = 'files-popover';
        popover.setAttribute('role', 'dialog');
        popover.innerHTML = this._filesPopoverHtml({ path, data: null, loading: true });
        document.body.appendChild(popover);
        this._filesPopover = popover;
        this._positionFilesPopover(popover, btn);

        const dismiss = (ev) => {
            if (ev.type === 'keydown' && ev.key !== 'Escape') return;
            if (ev.type === 'mousedown' && (popover.contains(ev.target) || btn.contains(ev.target))) return;
            if (ev.type === 'keydown') ev.stopImmediatePropagation();
            this._closeFilesPopover();
        };
        this._filesPopoverDismiss = dismiss;
        document.addEventListener('keydown', dismiss, true);
        document.addEventListener('mousedown', dismiss);

        const data = await this._fetchFilesRow(path);
        if (this._filesPopover !== popover) return; // user closed/reopened
        popover.innerHTML = this._filesPopoverHtml({ path, data, loading: false });
        this._wireFilesPopover(popover, btn);
        this._positionFilesPopover(popover, btn);
    }

    _closeFilesPopover() {
        if (this._filesPopover) {
            this._filesPopover.remove();
            this._filesPopover = null;
        }
        if (this._filesPopoverDismiss) {
            document.removeEventListener('keydown', this._filesPopoverDismiss, true);
            document.removeEventListener('mousedown', this._filesPopoverDismiss);
            this._filesPopoverDismiss = null;
        }
    }

    _positionFilesPopover(popover, anchor) {
        const rect = anchor.getBoundingClientRect();
        const w = popover.offsetWidth || 360;
        const h = popover.offsetHeight || 220;
        const x = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
        const y = Math.min(rect.bottom + 4, window.innerHeight - h - 8);
        popover.style.left = `${x}px`;
        popover.style.top = `${y}px`;
    }

    async _fetchFilesRow(mp3Path) {
        try {
            const r = await fetch(`/api/library/pair?mp3=${encodeURIComponent(mp3Path)}`);
            if (!r.ok) return { error: `HTTP ${r.status}` };
            return await r.json();
        } catch (err) {
            return { error: err?.message || 'fetch failed' };
        }
    }

    _filesFmtBytes(n) {
        if (!n && n !== 0) return '—';
        if (n >= 1024 ** 3) return `${(n / (1024 ** 3)).toFixed(1)} GB`;
        if (n >= 1024 ** 2) return `${(n / (1024 ** 2)).toFixed(1)} MB`;
        if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
        return `${n} B`;
    }

    _filesFmtDate(ts) {
        if (!ts) return '—';
        try { return new Date(ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); }
        catch { return '—'; }
    }

    _filesPopoverHtml({ path, data, loading }) {
        const escPath = escapeHtml(path);
        if (loading) {
            return `
                <div class="files-pop-head">
                    <div class="files-pop-row"><span class="files-pop-key">MP3</span><code class="files-pop-path">${escPath}</code></div>
                </div>
                <div class="files-pop-body files-pop-loading">Loading…</div>
            `;
        }
        if (data?.error) {
            return `
                <div class="files-pop-head">
                    <div class="files-pop-row"><span class="files-pop-key">MP3</span><code class="files-pop-path">${escPath}</code></div>
                </div>
                <div class="files-pop-body files-pop-error">Error: ${escapeHtml(data.error)}</div>
                <div class="files-pop-actions">
                    <button type="button" class="files-pop-btn" data-files-action="rescan">Rescan this row</button>
                </div>
            `;
        }

        const paired = !!data?.paired;
        const sc = data?.sidecar;
        const drift = data?.drift;
        const flacPath = data?.flacPath || '';
        const mp3Size = sc?.mp3?.size;
        const flacSize = sc?.flac?.size;
        const mp3Mtime = sc?.mp3?.mtimeMs;
        const flacMtime = sc?.flac?.mtimeMs;
        const lastSynced = sc?.lastSyncedAt;

        const mp3StatusHtml = !paired
            ? `<span class="files-pop-tag files-pop-tag--mp3only">no pair</span>`
            : drift?.missing?.mp3
                ? `<span class="files-pop-tag files-pop-tag--missing">missing</span>`
                : drift?.mp3Drift
                    ? `<span class="files-pop-tag files-pop-tag--drift">modified ${escapeHtml(this._filesFmtDate(mp3Mtime))}</span>`
                    : `<span class="files-pop-tag files-pop-tag--sync">in sync</span>`;
        const flacStatusHtml = !paired
            ? `<span class="files-pop-tag files-pop-tag--mp3only">no pair</span>`
            : drift?.missing?.flac
                ? `<span class="files-pop-tag files-pop-tag--missing">missing</span>`
                : drift?.flacDrift
                    ? `<span class="files-pop-tag files-pop-tag--drift">modified ${escapeHtml(this._filesFmtDate(flacMtime))}</span>`
                    : `<span class="files-pop-tag files-pop-tag--sync">in sync</span>`;

        return `
            <div class="files-pop-head">
                <div class="files-pop-row">
                    <span class="files-pop-key">MP3</span>
                    <code class="files-pop-path" data-files-copy="${escPath}" title="Click to copy">${escPath}</code>
                </div>
                <div class="files-pop-row">
                    <span class="files-pop-key">FLAC</span>
                    ${flacPath
                        ? `<code class="files-pop-path" data-files-copy="${escapeHtml(flacPath)}" title="Click to copy">${escapeHtml(flacPath)}</code>`
                        : `<span class="files-pop-empty">no pair</span>`}
                </div>
            </div>
            <div class="files-pop-grid">
                <div class="files-pop-cell"><span class="files-pop-key">MP3 size</span><span class="files-pop-val">${escapeHtml(this._filesFmtBytes(mp3Size))}</span></div>
                <div class="files-pop-cell"><span class="files-pop-key">FLAC size</span><span class="files-pop-val">${escapeHtml(this._filesFmtBytes(flacSize))}</span></div>
                <div class="files-pop-cell"><span class="files-pop-key">MP3</span>${mp3StatusHtml}</div>
                <div class="files-pop-cell"><span class="files-pop-key">FLAC</span>${flacStatusHtml}</div>
                <div class="files-pop-cell files-pop-cell--wide"><span class="files-pop-key">Last synced</span><span class="files-pop-val">${escapeHtml(this._filesFmtDate(lastSynced))}</span></div>
            </div>
            <div class="files-pop-actions">
                <button type="button" class="files-pop-btn" data-files-action="rescan">Rescan this row</button>
                <button type="button" class="files-pop-btn" data-files-action="reveal" data-path="${escPath}">Reveal in Finder</button>
            </div>
        `;
    }

    _wireFilesPopover(popover, anchorBtn) {
        const path = anchorBtn?.dataset?.filesPath || '';
        popover.querySelectorAll('[data-files-copy]').forEach((el) => {
            el.addEventListener('click', async (e) => {
                e.stopPropagation();
                const value = el.dataset.filesCopy;
                if (!value) return;
                try {
                    await navigator.clipboard.writeText(value);
                    const prev = el.textContent;
                    el.classList.add('files-pop-copied');
                    el.textContent = 'copied';
                    setTimeout(() => {
                        el.classList.remove('files-pop-copied');
                        el.textContent = prev;
                    }, 700);
                } catch {
                    this.showNotification?.('Copy failed', 'error');
                }
            });
        });
        popover.querySelector('[data-files-action="rescan"]')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            popover.querySelector('.files-pop-actions')?.classList.add('is-busy');
            const data = await this._fetchFilesRow(path);
            if (this._filesPairMap) {
                if (!data?.paired) this._filesPairMap.set(path, 'mp3only');
                else if (data.drift?.missing?.mp3 && !data.drift?.missing?.flac) this._filesPairMap.set(path, 'flaconly');
                else if (data.drift?.mp3Drift || data.drift?.flacDrift || data.drift?.missing?.flac) this._filesPairMap.set(path, 'drift');
                else this._filesPairMap.set(path, 'paired');
            }
            this._refreshFilesCells();
            popover.innerHTML = this._filesPopoverHtml({ path, data, loading: false });
            this._wireFilesPopover(popover, anchorBtn);
            // A rescan that clears the problem removes the glyph; keep the popover where it was.
            if (anchorBtn.isConnected) this._positionFilesPopover(popover, anchorBtn);
        });
        popover.querySelector('[data-files-action="reveal"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const p = e.currentTarget.dataset.path || '';
            if (!p) return;
            // file:// URLs only reveal in Finder when opened from the desktop, not
            // from a browser tab — most browsers block them silently. Best-effort
            // attempt, then fall through to copying the path so the user can paste it.
            try { window.open('file://' + p, '_blank', 'noopener'); } catch {}
            navigator.clipboard?.writeText(p).then(() => {
                this.showNotification?.('Path copied — paste into Finder (⌘⇧G)', 'info');
            }).catch(() => {});
        });
    }

    // Drop the scroll/resize listeners of the virtualized table (if any).
    _teardownTableVirtual() {
        this._vt?.teardown?.();
        this._vt = null;
    }

    /** The shared tracks table. `context` names the play context for
     *  double-click (an object page passes its own); default is the view's. */
    _renderTable(tracks, container, { context = null, playlist = null } = {}) {
        this._teardownTableVirtual();
        this._tablePlayContext = context;
        // A playlist page keeps its own order: a # column, no header sort, an optional ×.
        this._tablePlaylist = playlist;
        const viewerHiddenColumns = new Set(['status', 'comments', 'source', 'gigs']);
        const orderedColumns = VIEWER ? this._orderedColumns().filter((c) => !viewerHiddenColumns.has(c.key)) : this._orderedColumns();
        const dataColumns = playlist ? orderedColumns.map((c) => ({ ...c, sortable: false })) : orderedColumns;
        // ▶ shows on row hover; the playing row (`row-playing`) shows ♪.
        const playCol = {
            key: '__play',
            label: '',
            width: 26,
            cell: () => `<td class="col-play"><button type="button" class="row-play" data-row-play aria-label="Play">▶</button></td>`,
        };
        // ☆ and ♡, one click each (favorite-marks.js); the other collections are in the row menu.
        const favCol = {
            key: '__fav',
            label: '',
            width: 44,
            cell: (t, app) => `<td class="col-fav">${markPairHtml(app.marks.of('track', t.id), { collections: app.marks.collections, cls: 'row-fav-btn', attrs: `data-fav-track-id="${escapeHtml(t.id)}"` })}</td>`,
            compare: () => 0,
        };
        // On a phone each row ends in ⋯, its right-click menu (phone-rows.js).
        const menuCols = PHONE ? [{ key: '__menu', label: '', width: 44, sortable: false, cell: () => '<td class="col-menu"><button type="button" class="row-menu-btn" data-row-menu aria-label="More">⋯</button></td>' }] : [];
        const columns = VIEWER ? dataColumns : playlist ? [
            ...(playlist.bulk ? [playlistSelectColumn] : []), playCol, favCol,
            ...playlistColumns(playlist), ...dataColumns,
            ...(playlist.removable ? [playlistRemoveColumn] : []), ...menuCols,
        ] : [playCol, favCol, ...dataColumns, ...menuCols];
        const sorts = playlist ? [] : normalizeSort(this._tableSort);
        // Tracks' Group (⋯): rows sort by the group first; a leading column names each run.
        const group = !playlist && !context && this.currentView === 'collection' ? readGroup() : 'none';
        const sorted = sorts.length ? [...tracks].sort(sortComparator(sorts, COLUMN_BY_KEY)) : tracks;
        const ordered = group === 'none' ? sorted : groupTracks(sorted, group);
        if (group !== 'none') {
            columns.unshift({ key: '__group', label: '', width: 132, sortable: false,
                cell: (t, app, idx) => { const v = groupLabelAt(ordered, idx, group); return `<td class="col-group${v ? ' is-start' : ''}" title="${escapeHtml(v)}">${escapeHtml(v)}</td>`; } });
        }
        const total = ordered.length;
        // The whole filtered, sorted set is the selection scope; rows are only
        // windowed for drawing. Ids that left the filtered set are dropped.
        const visible = ordered;
        const filteredIds = new Set(ordered.map(track => track.id));
        this._lastSelectedIdx = null;
        this._selectedTrackIds = new Set([...this._selectedTrackIds].filter(id => filteredIds.has(id)));

        const [primary, second] = sorts;
        const sortClass = (key) => (primary?.key === key ? `sort-${primary.dir}` : second?.key === key ? 'two' : '');
        const secondMark = (key) => (second?.key === key ? `<sup aria-hidden="true">${second.dir === 'asc' ? '↑' : '↓'}2</sup>` : '');
        const colgroup = columns
            .map((c) => {
                const w = (c.key === '__play' || c.key === '__fav' || c.key === '__group') ? c.width : (this._colWidths[c.key] ?? c.width);
                return `<col data-col="${c.key}"${w ? ` style="width:${w}px"` : ''}>`;
            })
            .join('');
        const thead = columns
            .map((c) => {
                if (c.key === '__select') return '<th data-col="__select" class="col-select" aria-label="Select"></th>';
                if (c.key === '__group') return '<th data-col="__group" class="col-group"></th>';
                if (c.key === '__play') return `<th data-col="__play" class="col-play"></th>`;
                if (c.key === '__fav') {
                    return `<th data-col="__fav" class="col-fav-header" title="Favorites"><span class="col-header-label" aria-hidden="true">★</span></th>`;
                }
                if (c.sortable === false) {
                    const titleAttr = c.headerTitle ? ` title="${escapeHtml(c.headerTitle)}"` : '';
                    return `<th data-col="${c.key}" class="col-nosort"${titleAttr}><span class="col-header-label">${c.label}</span></th>`;
                }
                const titleAttr = c.headerTitle ? ` title="${escapeHtml(c.headerTitle)}"` : '';
                return `
                <th tabindex="0" aria-sort="${primary?.key === c.key ? (primary.dir === 'asc' ? 'ascending' : 'descending') : 'none'}" data-col="${c.key}" class="${sortClass(c.key)}"${titleAttr}>
                    <span class="col-drag-handle" draggable="true" data-col="${c.key}" title="Drag to reorder"></span>
                    <span class="col-header-label">${c.label}</span>${secondMark(c.key)}
                    <span class="col-resize-handle" data-col="${c.key}" title="Drag to resize"></span>
                </th>`;
            })
            .join('');
        const vt = {
            ordered,
            total,
            columns,
            rowHeight: this._tableRowHeight || null,
            win: null,
            focusIdx: Math.min(Math.max(0, this._tableFocusIdx || 0), Math.max(0, total - 1)),
            idMap: new Map(ordered.map((t) => [String(t.id), t])),
            teardown: null,
        };
        this._vt = vt;
        // The Tracks graph's selection marks its rows, in its map colour (graph-mirror.js).
        const markFocus = !playlist && !context && this.currentView === 'collection' ? graphFocus.get('collection') : null;
        const marked = markFocus ? markedTrackIds(markFocus, ordered) : new Set();
        const markColour = marked.size ? this._atlasView?.nodeColour?.(markFocus) || '' : '';
        const markAttr = markColour ? ` style="--mark:${escapeHtml(markColour)}"` : '';
        const rowHtml = (t, idx) => {
            const cells = columns.map((c) => c.cell(t, this, idx).replace(/^<td/, `<td data-col="${c.key}"`)).join('');
            const dim = t._dim ? ` is-dim" title="${escapeHtml(t._dim)}` : '';
            const mark = marked.has(String(t.id)) ? ` is-graph-mark"${markAttr} data-graph-mark="1` : '';
            return `<tr class="library-table-row${this._selectedTrackIds.has(t.id) ? ' row-selected' : ''}${mark}${dim}" tabindex="${idx === vt.focusIdx ? 0 : -1}" draggable="true" data-row-idx="${idx}" data-track-id="${escapeHtml(t.id)}">${cells}</tr>`;
        };
        const spacerHtml = (h) => `<tr class="vt-spacer" aria-hidden="true"><td colspan="${columns.length}" style="height:${h}px"></td></tr>`;

        const wrapper = document.createElement('div');
        wrapper.className = 'library-table-wrapper';
        if (this.filterEngine.state.invalidFilter) wrapper.classList.add('is-filter-invalid');
        wrapper.innerHTML = `
            ${VIEWER ? '' : `<div class="selection-bar" data-selection-bar${this._selectedTrackIds.size ? '' : ' hidden'}>
                <span class="selection-count" data-selection-count role="status">${this._selectedTrackIds.size} selected</span>
                <div class="selection-bar-actions">
                    <button type="button" class="btn btn-sm" data-open-batch-tag>Edit tags</button>
                    <button type="button" class="selection-clear-btn" data-selection-clear>Clear</button>
                </div>
            </div>`}
            <table class="library-table track-table" data-sort="${escapeHtml(primary?.key || '')}">
                <colgroup>${colgroup}</colgroup>
                <thead><tr>${thead}</tr></thead>
                <tbody></tbody>
            </table>
            ${!total ? emptyTableHtml({ clearable: !context && !playlist && hasHeader(this.currentView) }) : ''}
        `;

        this._lastRenderedVisible = visible;
        this._lastRenderedOrdered = ordered;
        container.appendChild(wrapper);
        wrapper.querySelector('.empty-state [data-clear-filters]')?.addEventListener('click', () => this._clearAllFilters());
        const table = wrapper.querySelector('table');
        const tbodyEl = wrapper.querySelector('tbody');
        const scroller = container.closest?.('.main-scroll') || document.querySelector('.main-scroll');

        const measureRow = () => {
            const h = tbodyEl.querySelector('tr.library-table-row')?.getBoundingClientRect().height;
            return h > 0 ? h : null;
        };
        const draw = (win) => {
            let html = spacerHtml(win.topSpacer);
            for (let i = win.start; i < win.end; i++) html += rowHtml(ordered[i], i);
            html += spacerHtml(win.bottomSpacer);
            tbodyEl.innerHTML = html;
            vt.win = win;
            this.gigPanel?.decorateRows(tbodyEl);
            this._syncLocalPlayControls();
            // Batch-tag previews only matter for rows that exist.
            this._updateTablePreviews();
        };
        // Offset of the viewport top inside the rows, in px.
        const metrics = () => {
            const rel = Math.max(0, (scroller?.getBoundingClientRect().top ?? 0) - tbodyEl.getBoundingClientRect().top);
            return { scrollTop: rel, viewportHeight: scroller?.clientHeight || window.innerHeight };
        };
        // `force` redraws even when the window has not drifted.
        const update = (force = false) => {
            if (!total) return;
            if (!vt.rowHeight) {
                // Probe: draw the first rows plainly to learn the real height.
                draw({ start: 0, end: Math.min(total, 40), topSpacer: 0, bottomSpacer: 0 });
                vt.rowHeight = measureRow();
                if (!vt.rowHeight) return;
                this._tableRowHeight = vt.rowHeight;
                force = true;
            }
            for (let pass = 0; pass < 2; pass++) {
                const next = computeWindow({ ...metrics(), rowHeight: vt.rowHeight, total });
                if (force || shouldRedraw(vt.win, next)) {
                    const active = tbodyEl.contains(document.activeElement) ? document.activeElement : null;
                    const focusedId = active?.dataset?.trackId;
                    draw(next);
                    if (focusedId && active.matches?.('tr.library-table-row')) {
                        tbodyEl.querySelector(`tr[data-track-id="${CSS.escape(focusedId)}"]`)?.focus({ preventScroll: true });
                    }
                }
                // Density changes alter row height without a re-render.
                const measured = measureRow();
                if (measured && Math.abs(measured - vt.rowHeight) > 0.5) {
                    vt.rowHeight = measured;
                    this._tableRowHeight = measured;
                    force = true;
                    continue;
                }
                break;
            }
        };
        vt.update = update;
        // Scroll a row by its index into view, redrawing the window.
        vt.scrollToRow = (idx) => {
            const tableTop = tbodyEl.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
            const header = table.querySelector('thead')?.getBoundingClientRect().height || 0;
            scroller.scrollTop = scrollTopForRow({
                index: idx, rowHeight: vt.rowHeight, scrollTop: scroller.scrollTop - tableTop,
                viewportHeight: scroller.clientHeight, headerHeight: header,
            }) + tableTop;
            update(true);
            // Rows taller than the estimate (wrapped cells) shift the window as it redraws: settle the drawn row into view.
            for (let i = 0; i < 4; i++) {
                const row = tbodyEl.querySelector(`tr[data-row-idx="${idx}"]`)?.getBoundingClientRect(), box = scroller.getBoundingClientRect();
                if (!row || (row.top >= box.top + header && row.bottom <= box.bottom)) break;
                scroller.scrollTop += row.top - (box.top + header + (box.height - header) / 3);
                update(true);
            }
        };
        // Focus a row by its index in the ordered set, scrolling and
        // redrawing first when it is outside the rendered window.
        vt.focusRow = (idx) => {
            if (!total || !scroller) return null;
            idx = Math.max(0, Math.min(total - 1, idx));
            vt.focusIdx = idx;
            this._tableFocusIdx = idx;
            if (!tbodyEl.querySelector(`tr[data-row-idx="${idx}"]`)) vt.scrollToRow(idx);
            for (const r of tbodyEl.querySelectorAll('tr.library-table-row')) r.tabIndex = Number(r.dataset.rowIdx) === idx ? 0 : -1;
            const row = tbodyEl.querySelector(`tr[data-row-idx="${idx}"]`);
            row?.focus();
            return row;
        };

        this._wireTableInteractions(wrapper, tracks, container, visible, vt);
        wireTrackDrag(tbodyEl, {
            source: playlist?.source || null,
            idsFor: (id) => {
                const row = vt.idMap.get(String(id));
                const picked = row && this._selectedTrackIds.has(row.id) ? ordered.filter((t) => this._selectedTrackIds.has(t.id)) : row ? [row] : [];
                return picked.filter((t) => !t._synthetic).map((t) => String(t.id));
            },
        });

        // Draw once, restore the scroll position of a same-view re-render
        // (the browser clamps it if the list got shorter), then follow scrolling.
        update(true);
        const saved = this._tableScroll;
        // Object pages share a view name; their play context tells one page from another.
        const scrollView = context ? `${this.currentView}|${context.key}` : this.currentView;
        // A new filter or search starts at the top; other re-renders keep their place.
        const scope = serializeFilter(this.filterEngine.state);
        if (scroller && saved && saved.view === scrollView) {
            const top = saved.scope === scope ? saved.top : 0;
            if (scroller.scrollTop !== top) { scroller.scrollTop = top; update(true); }
            this._tableScroll = { ...saved, scope, top };
        }
        // Just switched from the graph (`v`): the first marked row comes into view when none is,
        // and takes keyboard focus when the map had it.
        const mirror = markFocus ? this._mirrorSwitch : null;
        this._mirrorSwitch = null;
        const firstMark = mirror && scroller ? firstMarked(ordered, marked) : -1;
        if (firstMark >= 0) {
            const box = scroller.getBoundingClientRect();
            const seen = [...tbodyEl.querySelectorAll('tr[data-graph-mark]')].some((r) => { const b = r.getBoundingClientRect(); return b.bottom > box.top && b.top < box.bottom; });
            if (mirror.focus) vt.focusRow(firstMark);
            else if (!seen) vt.scrollToRow(firstMark);
            this._tableScroll = { view: scrollView, scope, top: scroller.scrollTop };
        }
        if (scroller && total) {
            let frame = 0;
            const onScroll = () => {
                if (frame) return;
                frame = requestAnimationFrame(() => {
                    frame = 0;
                    if (!wrapper.isConnected) { if (this._vt === vt) this._teardownTableVirtual(); return; }
                    // The page put away for the map (view-stage.js) keeps the place it had.
                    if (scroller.hidden || scroller.style.position) return;
                    this._tableScroll = { view: scrollView, scope, top: scroller.scrollTop };
                    update();
                });
            };
            scroller.addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('resize', onScroll);
            vt.teardown = () => {
                if (frame) cancelAnimationFrame(frame);
                scroller.removeEventListener('scroll', onScroll);
                window.removeEventListener('resize', onScroll);
            };
        }
    }

    _cellHtml(key, track) {
        const col = COLUMN_BY_KEY.get(key);
        if (!col) return `<td data-col="${key}"></td>`;
        return col.cell(track, this).replace(/^<td/, `<td data-col="${key}"`);
    }

    _updateTablePreviews() {
        const wrapper = document.querySelector('.library-table-wrapper');
        if (!wrapper) return;
        const tbody = wrapper.querySelector('tbody');
        if (!tbody) return;
        const idToTrack = this._vt?.idMap;
        if (!idToTrack?.size) return;

        for (const tr of tbody.querySelectorAll('tr.library-table-row')) {
            const id = tr.dataset.trackId;
            const track = idToTrack.get(id);
            if (!track) continue;
            const preview = this.batchTagEditor ? this.batchTagEditor.getPreviewForTrack(track) : null;
            const genreCell = tr.querySelector('td[data-col="genre"]');
            const commentsCell = tr.querySelector('td[data-col="comments"]');

            if (preview) {
                if (genreCell && preview.genreChanged) {
                    const oldVal = track.genre || '';
                    const newVal = preview.newGenre || '(cleared)';
                    genreCell.innerHTML =
                        (oldVal ? `<span class="bte-preview-old">${escapeHtml(oldVal)}</span>` : '') +
                        `<span class="bte-preview">${escapeHtml(newVal)}</span>`;
                } else if (genreCell) {
                    genreCell.outerHTML = this._cellHtml('genre', track);
                }
                if (commentsCell && preview.tagsChanged) {
                    const oldVal = track.comments || '';
                    const newVal = preview.newComments || '(cleared)';
                    commentsCell.innerHTML =
                        (oldVal ? `<span class="bte-preview-old">${escapeHtml(oldVal)}</span>` : '') +
                        `<span class="bte-preview">${escapeHtml(newVal)}</span>`;
                } else if (commentsCell) {
                    commentsCell.outerHTML = this._cellHtml('comments', track);
                }
            } else {
                if (genreCell) genreCell.outerHTML = this._cellHtml('genre', track);
                if (commentsCell) commentsCell.outerHTML = this._cellHtml('comments', track);
            }
        }
    }

    _updateSelectionBar(wrapper) {
        const bar = wrapper.querySelector('[data-selection-bar]');
        const countEl = wrapper.querySelector('[data-selection-count]');
        if (!bar || !countEl) return;
        const n = this._selectedTrackIds.size;
        countEl.textContent = `${n} selected`;
        let shared = bar.querySelector('[data-shared-track-actions]');
        if (!shared) {
            shared = document.createElement('span');
            shared.dataset.sharedTrackActions = '';
            const clear = bar.querySelector('[data-selection-clear]');
            if (clear) clear.before(shared); else bar.appendChild(shared);
        }
        const items = selectionBarActions(trackActions(this, [...this._selectedTrackIds]));
        shared.innerHTML = items.map((item, i) => `<button type="button" class="btn btn-sm btn-secondary" data-shared-action="${i}">${escapeHtml(item.label)}</button>`).join('');
        shared.querySelectorAll('[data-shared-action]').forEach((btn) => btn.addEventListener('click', (event) => {
            const item = items[Number(btn.dataset.sharedAction)];
            item.run(visibleActionRunOptions(item, event));
        }));
        let playlistActions = bar.querySelector('[data-playlist-bulk-host]');
        if (this._tablePlaylist?.bulk) {
            if (!playlistActions) {
                playlistActions = document.createElement('span');
                playlistActions.dataset.playlistBulkHost = '';
                bar.querySelector('.selection-bar-actions')?.prepend(playlistActions);
            }
            playlistActions.innerHTML = playlistBulkActionsHtml({ allowTransfer: this._tablePlaylist.bulk.allowTransfer !== false });
            wirePlaylistBulkActions(playlistActions, {
                ids: () => [...this._selectedTrackIds],
                run: this._tablePlaylist.bulk.run,
                transfer: this._tablePlaylist.bulk.transfer,
            });
        } else playlistActions?.remove();
        if (n > 0) bar.removeAttribute('hidden');
        else bar.setAttribute('hidden', '');
        this._selectionToSlot();
    }

    /** The focused row: the last clicked or arrowed-to when it is selected, else the last selected. */
    _focusedSelectedId() {
        const ids = [...this._selectedTrackIds].map(String);
        const at = this._lastRenderedOrdered?.[this._tableFocusIdx]?.id;
        return at != null && ids.includes(String(at)) ? String(at) : ids[ids.length - 1] || null;
    }

    /** Every selection change: Gigs gets the selection; Info, showing or closed only because it was empty, gets the focused track, or Select a track. */
    _selectionToSlot() {
        const focusedId = this._focusedSelectedId();
        this.gigPanel?.setSelection([...this._selectedTrackIds], focusedId);
        if (this.rightSlot?.section !== 'collection' || !(this.rightSlot.shows('details') || this.rightSlot.awaitsInfo)) return;
        // Info moves only when the focused row changes (or it is empty): an entity opened from the track stays.
        if (focusedId === this._infoFocusedId && this.panel.kind) {
            this._infoSelection = { ids: new Set(this._selectedTrackIds), idx: this._tableFocusIdx };
            this.panel.syncSelection();
            return;
        }
        // Unsaved edits on another track: "Discard changes?" first; declined keeps the previous focus.
        if (this._infoFocusedId && focusedId !== this._infoFocusedId && this.panel.hasEdits(this._infoFocusedId)) { this._leaveInfo(this._infoFocusedId); return; }
        this._infoFocusedId = focusedId;
        this._infoSelection = { ids: new Set(this._selectedTrackIds), idx: this._tableFocusIdx };
        if (!focusedId) { this.panel.clear(); return; }
        const track = (this._lastRenderedOrdered || []).find((t) => String(t.id) === focusedId);
        if (track) this.panel.open(track, null, { focus: false });
    }

    async _leaveInfo(fromId) {
        if (this._infoAsking) return;
        this._infoAsking = true;
        const ok = await this.panel.canLeave(fromId).finally(() => { this._infoAsking = false; });
        if (ok) { this._selectionToSlot(); return; }
        const prev = this._infoSelection;
        if (prev) { this._selectedTrackIds = new Set(prev.ids); this._tableFocusIdx = prev.idx; }
        if (!this._syncSelectionDom()) this._selectionToSlot();
        if (prev?.idx != null) this._vt?.focusRow?.(prev.idx);
    }

    /** Selection and focus changed outside a click (Info): mirror them into the drawn rows and the selection bar. */
    _syncSelectionDom() {
        this.gigPanel?.setSelection([...this._selectedTrackIds], this._focusedSelectedId());
        const wrapper = document.querySelector('.library-table-wrapper');
        if (!wrapper) return false;
        for (const row of wrapper.querySelectorAll('tbody tr.library-table-row')) {
            this._syncRowDomState(row, this._selectedTrackIds.has(row.dataset.trackId));
            row.tabIndex = Number(row.dataset.rowIdx) === this._tableFocusIdx ? 0 : -1;
        }
        if (this._vt) this._vt.focusIdx = this._tableFocusIdx;
        this._updateSelectionBar(wrapper);
        return true;
    }

    /** The Gigs tab's foot line: the tracks the filter matches, or null without a filter. */
    _filterResultTracks() {
        const args = this._headerArgs;
        if (!args) return null;
        const scoped = this.filterEngine.hasActiveFilters() || (args.view === 'collection' && (!!this._healthFilter || !!this._soundIssuesOnly));
        return scoped ? args.filtered || [] : null;
    }

    // Mirror a single row's selection state into the DOM.
    // Used by row-click, shift-click range, and cmd-A so the re-render path stays cheap.
    _syncRowDomState(row, selected) {
        row?.classList.toggle('row-selected', selected);
        const checkbox = row?.querySelector?.('[data-playlist-row-select]');
        if (checkbox) checkbox.checked = selected;
    }

    _wireTableInteractions(wrapper, tracks, container, visible, vt) {
        const table = wrapper.querySelector('table');
        table.addEventListener('keydown', event => {
            const row = event.target.closest('tr[data-track-id]');
            if (!row || event.target !== row) return;
            // Rows are windowed, so movement follows the ordered array, not the DOM.
            const idx = Number(row.dataset.rowIdx);
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const last = visible.length - 1;
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? last
                    : Math.max(0, Math.min(last, idx + (event.key === 'ArrowDown' ? 1 : -1)));
                if (this._tablePlaylist?.bulk && event.shiftKey && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
                    applySelection({ idx: next, id: visible[next]?.id, shiftKey: true, cmdKey: false });
                }
                vt.focusRow(next);
                this._selectionToSlot();
            } else if (event.key === 'Enter') {
                event.preventDefault();
                this.navigate({ view: 'track', id: visible[idx].id });
            } else if (event.key === ' ') {
                event.preventDefault();
                applySelection({ idx, id: visible[idx].id, cmdKey: true });
            }
        });
        // Remove whichever table is current, not this closure's: the column menu stays open
        // across re-renders and calls this again after the first table is gone.
        const rerender = () => { container.querySelectorAll(':scope > .library-table-wrapper').forEach((w) => w.remove()); this._renderTable(tracks, container, { context: this._tablePlayContext, playlist: this._tablePlaylist }); };

        // Delegated YouTube play triangle — survives sort/re-render because wrapper is re-wired.
        wrapper.addEventListener('click', (e) => {
            const btn = e.target.closest?.('.yt-play-btn');
            if (!btn || !wrapper.contains(btn)) return;
            e.stopPropagation();
            this._handleYtButtonClick(btn);
        });

        // Local playback follows the currently visible/sorted table order,
        // which makes previous/next useful during a focused curation pass.
        wrapper.addEventListener('click', (e) => {
            const btn = e.target.closest?.('.local-play-trigger');
            if (!btn || !wrapper.contains(btn)) return;
            e.preventDefault();
            e.stopPropagation();
            const track = visible.find((item) => String(item.id) === String(btn.dataset.localPlayId));
            if (track) this.playLocalTrack(track, this._lastRenderedOrdered || visible, this._tablePlayContext || this._collectionPlayContext());
        });

        // The play cell's ▶ plays the row in table order, as a double-click
        // does, and leaves the selection alone.
        wrapper.addEventListener('click', (e) => {
            const btn = e.target.closest?.('[data-row-play]');
            if (!btn || !wrapper.contains(btn)) return;
            e.preventDefault();
            e.stopPropagation();
            // The second click of a double-click would toggle it straight back to paused.
            if (e.detail > 1) return;
            const track = vt.idMap.get(btn.closest('tr')?.dataset.trackId);
            if (track) this.playLocalTrack(track, this._lastRenderedOrdered || visible, this._tablePlayContext || this._collectionPlayContext());
        });

        // Selection bar: clear + Edit tags.
        wrapper.querySelector('[data-selection-clear]')?.addEventListener('click', () => {
            this._selectedTrackIds = new Set();
            this._lastSelectedIdx = null;
            rerender();
        });

        wrapper.querySelector('[data-open-batch-tag]')?.addEventListener('click', () => {
            if (!this.batchTagEditor) return;
            if (this._selectedTrackIds.size === 0) {
                this.showNotification('Select tracks first', 'info');
                return;
            }
            this.batchTagEditor.open();
        });
        this._updateSelectionBar(wrapper);

        // Right-click on a row → context menu. If the
        // right-clicked row is part of a multi-selection, operate on the whole
        // selection; otherwise just the clicked row.
        table.querySelector('tbody')?.addEventListener('contextmenu', (e) => {
            if (VIEWER) return;
            const tr = e.target.closest('tr.library-table-row');
            if (!tr) return;
            // Don't hijack right-click on interactive children (links, buttons,
            // form controls) so native menus still work where useful.
            if (e.target.closest('a, button, input, select')) return;
            e.preventDefault();
            const id = tr.dataset.trackId;
            const ids = (id && this._selectedTrackIds.has(id) && this._selectedTrackIds.size > 1)
                ? Array.from(this._selectedTrackIds)
                : (id ? [id] : []);
            if (!ids.length) return;
            const sourceLabel = this.currentView === 'exploreme' ? 'Explore'
                : this.currentView === 'discover' ? 'Discover'
                : 'Collection';
            const single = ids.length === 1 ? visible.find((item) => String(item.id) === String(ids[0])) : null;
            const extra = single ? this._digTargets(single).map((target) => ({
                id: `link-${target.kind}`, label: target.title,
                run: () => window.open(target.href, '_blank', 'noopener'),
            })) : [];
            this._openRowContextMenu({ trackIds: ids, x: e.clientX, y: e.clientY, source: sourceLabel, extra });
        });

        // Unified selection handler for row clicks and Space.
        // modifier flags reflect the event's modifier keys. `idx` is the visible-row
        // index of the click target (used for shift-range), `id` is the track id.
        const applySelection = ({ idx, id, shiftKey, cmdKey }) => {
            if (!id) return;
            const cur = this._selectedTrackIds.has(id);
            // Replace-mode (plain click): clear everything else first.
            if (!shiftKey && !cmdKey) {
                this._selectedTrackIds = new Set([id]);
                if (!Number.isNaN(idx)) this._lastSelectedIdx = idx;
            } else if (shiftKey && this._lastSelectedIdx != null && !Number.isNaN(idx)) {
                const [lo, hi] = idx < this._lastSelectedIdx ? [idx, this._lastSelectedIdx] : [this._lastSelectedIdx, idx];
                const target = !cur;
                for (let i = lo; i <= hi; i++) {
                    const t = visible[i];
                    if (!t) continue;
                    if (target) this._selectedTrackIds.add(t.id);
                    else this._selectedTrackIds.delete(t.id);
                }
            } else {
                const target = !cur;
                if (target) this._selectedTrackIds.add(id);
                else this._selectedTrackIds.delete(id);
                if (!Number.isNaN(idx)) this._lastSelectedIdx = idx;
            }
            // Reflect state without a full table re-render.
            for (const row of table.querySelectorAll('tbody tr.library-table-row')) {
                this._syncRowDomState(row, this._selectedTrackIds.has(row.dataset.trackId));
            }
            this._updateSelectionBar(wrapper);
        };

        // Playlist checkboxes are a visible alternative to modifier-click.
        table.querySelector('tbody')?.addEventListener('click', (e) => {
            const input = e.target.closest?.('[data-playlist-row-select]');
            if (!input) return;
            e.stopPropagation();
            const row = input.closest('tr[data-track-id]');
            if (!row) return;
            applySelection({
                idx: Number(row.dataset.rowIdx), id: row.dataset.trackId,
                shiftKey: e.shiftKey, cmdKey: true,
            });
            input.checked = this._selectedTrackIds.has(row.dataset.trackId);
        });

        // A row's ☆ or ♡: the track in that collection (type 'track', the track id as its name).
        table.querySelector('tbody')?.addEventListener('click', async (e) => {
            const btn = e.target.closest?.('.row-fav-btn');
            if (!btn) return;
            e.stopPropagation();
            const id = String(btn.dataset.favTrackId || '');
            if (!id) return;
            await trackActions(this, [id]).find((a) => a.id === (btn.dataset.mark === HEART ? 'heart' : 'favorite'))?.run();
        });

        // Double-click a row → play it, in table order, as Music.app and
        // Rekordbox do. Tag review stays on the row menu and the inspector.
        table.querySelector('tbody')?.addEventListener('dblclick', (e) => {
            if (e.target.closest('.cell-label-link, .cell-artist-link, .cell-token, .yt-play-btn, .row-fav-btn, .files-dot, .art-thumb, a, button, input')) return;
            const tr = e.target.closest('tr.library-table-row');
            if (!tr) return;
            e.preventDefault();
            const track = visible.find((item) => String(item.id) === tr.dataset.trackId);
            if (track && VIEWER) this.navigate({ view: 'track', id: String(track.id) });
            else if (track) this.playLocalTrack(track, this._lastRenderedOrdered || visible, this._tablePlayContext || this._collectionPlayContext());
        });

        // Artwork thumb → the art at full size in an overlay.
        table.querySelector('tbody')?.addEventListener('click', (e) => {
            const img = e.target.closest?.('img[data-art-open]');
            if (!img || !table.contains(img)) return;
            e.preventDefault();
            e.stopPropagation();
            const track = visible.find((item) => String(item.id) === img.closest('tr')?.dataset.trackId);
            this._openArtOverlay(img.currentSrc || img.src, track ? [track.artist, track.album || track.title].filter(Boolean).join(' — ') : '', img);
        });

        // Right-click a heading → show or hide columns.
        table.querySelector('thead')?.addEventListener('contextmenu', (e) => {
            if (VIEWER) return;
            e.preventDefault();
            const heading = e.target.closest('th');
            this._openColumnMenu({ x: e.clientX, y: e.clientY, afterKey: heading?.dataset.col, onChange: rerender });
        });

        // Files dot → row drawer (P2.1). Delegated so it survives sort/re-render.
        table.querySelector('tbody')?.addEventListener('click', (e) => {
            const dot = e.target.closest?.('.files-dot');
            if (!dot || !table.contains(dot)) return;
            e.preventDefault();
            e.stopPropagation();
            this._openFilesPopover(dot);
        });

        // Row-body click: plain=replace, cmd/ctrl=toggle, shift=range.
        // Skip clicks on interactive cells so entity links + play button still navigate.
        table.querySelector('tbody')?.addEventListener('click', (e) => {
            if (e.target.closest('.cell-label-link, .cell-artist-link, .cell-token, .yt-play-btn, .row-fav-btn, .files-dot, img[data-art-open], a, button, input')) return;
            const tr = e.target.closest('tr.library-table-row');
            if (!tr) return;
            e.preventDefault();
            const idx = Number(tr.dataset.rowIdx);
            const id = tr.dataset.trackId;
            if (VIEWER) { this.navigate({ view: 'track', id }); return; }
            table.querySelectorAll('tbody tr.library-table-row').forEach(row => row.tabIndex = row === tr ? 0 : -1);
            vt.focusIdx = idx;
            this._tableFocusIdx = idx;
            tr.focus({ preventScroll: true });
            applySelection({
                idx, id,
                shiftKey: e.shiftKey,
                cmdKey: e.metaKey || e.ctrlKey,
            });
        });

        // Sort on header click; Shift-click sets the second sort (ignoring the
        // drag and resize handles and the fixed leading columns).
        table.querySelectorAll('thead th').forEach((th) => {
            th.addEventListener('keydown', event => {
                if (event.target === th && ['Enter', ' '].includes(event.key)) {
                    event.preventDefault();
                    th.click();
                    container.querySelector(`th[data-col="${th.dataset.col}"]`)?.focus();
                }
            });
            th.addEventListener('click', (e) => {
                if (th.dataset.col === '__play' || th.dataset.col === '__fav') return;
                if (th.classList.contains('col-nosort')) return;
                if (e.target.closest('.col-resize-handle, .col-drag-handle')) return;
                this._tableSort = nextSort(this._tableSort, th.dataset.col, { shift: e.shiftKey });
                this._saveTableSort();
                rerender();
            });
        });

        // Label / artist cells → entity pages. Genre / subgenre / tag cells
        // → filter Collection by the clicked token (capacities-style — every
        // token is a navigable object).
        table.querySelector('tbody')?.addEventListener('click', (e) => {
            const ent = readEntityLink(e.target);
            if (ent) {
                e.preventDefault();
                e.stopPropagation();
                openEntity(this, ent);
                return;
            }
            const pl = e.target.closest('[data-playlist-gig]');
            if (pl) {
                e.preventDefault();
                e.stopPropagation();
                this.navigate(playlistLinkRoute(pl.dataset.playlistGig, pl.dataset.playlistLane, this.filterEngine.state));
                return;
            }
            const lab = e.target.closest('.cell-label-link');
            if (lab) {
                e.preventDefault();
                e.stopPropagation();
                const label = lab.dataset.label;
                if (label) this.navigate({ view: 'label', name: label });
                return;
            }
            const art = e.target.closest('.cell-artist-link');
            if (art) {
                e.preventDefault();
                e.stopPropagation();
                const artist = art.dataset.artist;
                if (artist) this.navigate({ view: 'artist', name: artist });
                return;
            }
            const tok = e.target.closest('.cell-token');
            if (tok) {
                e.preventDefault();
                e.stopPropagation();
                const genre = tok.dataset.genre;
                const subgenresCombo = tok.dataset.subgenres; // pipe-joined
                const subgenre = tok.dataset.subgenre;
                const tag = tok.dataset.tag;
                const album = tok.dataset.album;
                const albumArtist = tok.dataset.artist;
                // Entity-cell tokens navigate to their entity page (same
                // affordance as artist/label cells elsewhere). Tag, and
                // album-with-artist both go to the corresponding page.
                // Genre/subgenre/year/etc still fall through to in-place
                // filter toggling since they don't have entity pages yet.
                if (tag) {
                    this.navigate({ view: 'tag', name: tag });
                    return;
                }
                if (album && albumArtist) {
                    this.navigate({ view: 'album', name: album, artist: albumArtist });
                    return;
                }

                if (genre && subgenresCombo) {
                    // "Genre: Subgenre" combined click — set both facets at
                    // once, replacing any previous genre/subgenre selection.
                    this.filterEngine.setFilter('genres', [genre]);
                    this.filterEngine.setFilter('subgenres', subgenresCombo.split('|'));
                } else if (genre) {
                    this.filterEngine.toggleFilter('genres', genre);
                } else if (subgenre) {
                    this.filterEngine.toggleFilter('subgenres', subgenre);
                } else if (album) {
                    this.filterEngine.toggleFilter('albums', album);
                }
                this.loadView(this.currentView);
            }
        });

        // Resize: drag the right-edge handle to set a column width.
        table.querySelectorAll('.col-resize-handle').forEach((handle) => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault(); e.stopPropagation();
                const key = handle.dataset.col;
                const col = table.querySelector(`colgroup col[data-col="${key}"]`);
                const th = handle.closest('th');
                const startX = e.clientX;
                const startW = th.getBoundingClientRect().width;
                const onMove = (ev) => {
                    const next = Math.max(48, startW + ev.clientX - startX);
                    col.style.width = `${next}px`;
                    this._colWidths[key] = next;
                };
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    document.body.classList.remove('col-resize-active');
                };
                document.body.classList.add('col-resize-active');
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        });

        // Drag-and-drop column reordering via the left-edge grip.
        const clearDropTargets = () =>
            table.querySelectorAll('th.col-drop-target').forEach((h) => h.classList.remove('col-drop-target'));

        wrapper.querySelectorAll('.col-drag-handle').forEach((handle) => {
            handle.addEventListener('click', (e) => e.stopPropagation());
            handle.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', handle.dataset.col);
                e.dataTransfer.effectAllowed = 'move';
                wrapper.classList.add('library-col-dragging');
            });
            handle.addEventListener('dragend', () => {
                wrapper.classList.remove('library-col-dragging');
                clearDropTargets();
            });
        });
        table.querySelectorAll('thead th').forEach((th) => {
            th.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                clearDropTargets();
                th.classList.add('col-drop-target');
            });
            th.addEventListener('drop', (e) => {
                e.preventDefault();
                clearDropTargets();
                this._reorderColumn(e.dataTransfer.getData('text/plain'), th.dataset.col);
                rerender();
            });
        });
    }

    _digLinks(track) {
        const parts = [];
        // Local playback is the primary action; a hairline separates it from
        // the external "dig" services so it reads as the player, not a link.
        if (isLocalPlayable(track)) {
            parts.push(this.localPlayControlHtml(track));
            parts.push('<span class="track-links-sep" aria-hidden="true"></span>');
        }
        for (const target of this._digTargets(track)) parts.push(this._listenIconHtml(target));
        return parts.join('');
    }

    canPlayLocalTrack(track) {
        return !VIEWER && isLocalPlayable(track);
    }

    localPlayControlHtml(track, { page = false } = {}) {
        if (VIEWER) return '';
        if (!isLocalPlayable(track)) return '';
        const current = this.audioPlayer?.isCurrent(track.id);
        const playing = current && this.audioPlayer.isPlaying;
        const label = playing ? 'Pause local file' : (current ? 'Resume local file' : 'Play local file');
        if (page) {
            return `<button type="button" class="lp-action local-play-page-btn local-play-trigger${current ? ' is-current' : ''}${playing ? ' is-playing' : ''}" data-local-play-id="${escapeHtml(track.id)}" aria-label="${label}" title="${label}"><span class="local-play-glyph" aria-hidden="true">${playGlyphHtml(playing)}</span><span data-local-play-label>${playing ? 'Pause' : 'Play'}</span></button>`;
        }
        return `<button type="button" class="listen-icon local-play-trigger${current ? ' is-current' : ''}${playing ? ' is-playing' : ''}" data-local-play-id="${escapeHtml(track.id)}" aria-label="${label}" title="${label}"><span class="local-play-glyph" aria-hidden="true">${playGlyphHtml(playing)}</span></button>`;
    }

    _trackById(id) {
        const source = this._tracksCache;
        if (!source) return null;
        if (this._trackByIdSource !== source) {
            this._trackByIdMap = new Map(source.map((track) => [String(track.id), track]));
            this._trackByIdSource = source;
        }
        return this._trackByIdMap.get(String(id)) || this._mergedCache?.find((track) => String(track.id) === String(id)) || null;
    }

    // Boot: restore the saved queue paused. Prune ids only when the full
    // collection loaded; a failed read must never delete queue entries.
    async _restorePlayback() {
        if (VIEWER) return;
        let knownIds = null;
        try {
            const tracks = await this._rawTracks();
            if (Array.isArray(tracks)) knownIds = new Set(tracks.map((track) => String(track.id)));
        } catch (err) {
            console.warn('[player] collection unavailable, queue restored without pruning:', err?.message || err);
        }
        try {
            await this.audioPlayer?.restore({ knownIds, resume: takePlaybackResume() });
        } catch (err) {
            console.error('[player] queue restore failed', err);
        }
    }

    playerCommands() {
        const player = this.audioPlayer;
        if (!player?.queue.current) return [];
        return [
            ...(player.host.hidden ? [{ label: 'Show player', run: () => player.show() }] : []),
            { label: 'Show queue', run: () => { player.show(); this.queuePanel?.show(); } },
        ];
    }

    /**
     * Start playback from a list. `context`: { key, kind, label, route }.
     * Replacing the context while Up next holds tracks applies the
     * playback_up_next_on_new_list setting (ask | keep | clear).
     */
    async playLocalTrack(track, queue = null, context = null, { shuffle = null } = {}) {
        const player = this.audioPlayer;
        if (!player || (track && !isLocalPlayable(track))) {
            this.showNotification?.('No playable local file for this track', 'info');
            return false;
        }
        if (track && player.isCurrent(track.id) && shuffle === null) return player.toggle();
        const ctx = context || { key: 'collection', kind: 'collection', label: 'Collection', route: { view: 'collection' } };
        let clearUpNext = false;
        const replacing = shuffle !== null || player.contextKey !== ctx.key;
        if (replacing && player.queue.upNext.length) {
            const choice = await this._upNextChoice(player.queue.upNext.length);
            if (!choice) return false;
            clearUpNext = choice === 'clear';
        }
        const tracks = queue || this._tracksCache || (track ? [track] : []);
        const started = player.playFromList(track, { tracks, context: ctx, clearUpNext, shuffle });
        if (!started) this.showNotification?.('No playable local files in this list', 'info');
        return started;
    }

    /**
     * List-level Play and Shuffle next to `anchor` (inserted at `position`).
     * Renders nothing when the list has no playable local file.
     */
    mountListPlay(anchor, tracks, context, { position = 'beforebegin', chip = false } = {}) {
        if (!anchor || !(tracks || []).some(isLocalPlayable)) return;
        const cls = chip ? 'link-chip chip-sm list-play-btn' : 'lp-action list-play-btn';
        anchor.insertAdjacentHTML(position, `<span class="list-play" role="group" aria-label="Play list"><button type="button" class="${cls}" data-list-play="play">${PLAYER_ICONS.play}<span>Play</span></button><button type="button" class="${cls}" data-list-play="shuffle">${PLAYER_ICONS.shuffle}<span>Shuffle</span></button></span>`);
        const group = position === 'beforebegin' ? anchor.previousElementSibling
            : position === 'afterend' ? anchor.nextElementSibling
                : position === 'afterbegin' ? anchor.firstElementChild : anchor.lastElementChild;
        group?.querySelectorAll('[data-list-play]').forEach((button) => button.addEventListener('click', (event) => {
            event.stopPropagation();
            const playable = tracks.filter(isLocalPlayable);
            const shuffle = button.dataset.listPlay === 'shuffle';
            this.playLocalTrack(shuffle ? null : playable[0], playable, context, { shuffle });
        }));
    }

    // Table views share one renderer; the context names whichever is showing.
    _collectionPlayContext() {
        const route = this._route ? JSON.parse(JSON.stringify(this._route)) : { view: 'collection' };
        if (this.currentView === 'collection' && this._route?.fav) return { key: 'collection:fav', kind: 'favorites', label: 'Favorites', route };
        if (this.currentView === 'exploreme') return { key: 'exploreme', kind: 'collection', label: 'Review', route };
        return { key: 'collection', kind: 'collection', label: 'Collection', route };
    }

    async _upNextChoice(count) {
        const database = this.integrationManager?.database;
        const setting = await readUpNextOnNewList(database);
        if (setting !== 'ask') return setting;
        const result = await this._openUpNextPrompt(count);
        if (result?.remember) {
            try { await writeUpNextOnNewList(database, result.choice); } catch (err) {
                this.showNotification?.(`Preference not saved: ${err?.message || err}`, 'error');
            }
        }
        return result?.choice || null;
    }

    _openUpNextPrompt(count) {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'enrich-backdrop';
            const dialog = document.createElement('div');
            dialog.className = 'enrich-dialog up-next-prompt';
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.setAttribute('aria-labelledby', 'upNextPromptTitle');
            dialog.innerHTML = `
                <header class="enrich-head">
                    <h2 id="upNextPromptTitle">Clear Up next?</h2>
                    <p>${count === 1 ? '1 track queued.' : `${count} tracks queued.`}</p>
                </header>
                <footer class="enrich-foot">
                    <div class="enrich-foot-left">
                        <label class="up-next-remember"><input type="checkbox" data-remember> Don't ask again</label>
                    </div>
                    <div class="enrich-foot-right">
                        <button type="button" class="btn btn-sm btn-secondary" data-choice="clear">Clear</button>
                        <button type="button" class="btn btn-sm" data-choice="keep">Keep</button>
                    </div>
                </footer>`;
            backdrop.appendChild(dialog);
            document.body.appendChild(backdrop);
            const previousFocus = document.activeElement;
            const close = (choice) => {
                backdrop.remove();
                document.removeEventListener('keydown', onKeyDown, true);
                if (previousFocus?.isConnected) previousFocus.focus();
                resolve(choice ? { choice, remember: dialog.querySelector('[data-remember]').checked } : null);
            };
            const onKeyDown = (event) => {
                if (event.key === 'Escape' && isTopmostBackdrop(backdrop)) { event.preventDefault(); event.stopPropagation(); close(null); }
            };
            document.addEventListener('keydown', onKeyDown, true);
            backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(null); });
            for (const button of dialog.querySelectorAll('[data-choice]')) {
                button.addEventListener('click', () => close(button.dataset.choice));
            }
            requestAnimationFrame(() => dialog.querySelector('[data-choice="keep"]')?.focus());
        });
    }

    _syncLocalPlayControls() {
        if (!this.audioPlayer) return;
        for (const button of document.querySelectorAll('.local-play-trigger')) {
            const current = this.audioPlayer.isCurrent(button.dataset.localPlayId);
            const playing = current && this.audioPlayer.isPlaying;
            button.classList.toggle('is-current', current);
            button.classList.toggle('is-playing', playing);
            const label = playing ? 'Pause local file' : (current ? 'Resume local file' : 'Play local file');
            button.setAttribute('aria-label', label);
            button.title = label;
            const glyph = button.querySelector('.local-play-glyph');
            if (glyph) glyph.innerHTML = playGlyphHtml(playing);
            const text = button.querySelector('[data-local-play-label]');
            if (text) text.textContent = playing ? 'Pause' : 'Play';
        }
        // The Links column may be hidden, so mark the row from its own id.
        for (const row of document.querySelectorAll('.library-table-row[data-track-id]')) {
            const current = this.audioPlayer.isCurrent(row.dataset.trackId);
            row.classList.toggle('row-playing', current);
            row.querySelector('[data-row-play]')?.setAttribute('aria-label', current && this.audioPlayer.isPlaying ? 'Pause' : 'Play');
        }
    }

    // Uniform 16×16 brand favicon SVGs. Inline so all five render identically
    // across skins/density. `is-direct` keeps full opacity for direct links;
    // searches render at reduced opacity so the "direct" vs "search" affordance
    // reads without mixing shapes or sizes.
    _listenIconHtml({ href, kind, title, direct }) {
        const label = escapeHtml(title);
        const svg = this._listenSvg(kind);
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" class="listen-icon listen-icon--${kind}${direct ? ' is-direct' : ''}" title="${label}" aria-label="${label}">${svg}</a>`;
    }

    _listenSvg(kind) {
        if (kind === 'bc') {
            return `<svg class="listen-svg" viewBox="0 0 16 16" aria-hidden="true" width="16" height="16"><circle cx="8" cy="8" r="7" fill="#1DA0C3"/><path d="M4.5 10l2-4h5l-2 4z" fill="#fff"/></svg>`;
        }
        if (kind === 'dc') {
            return `<svg class="listen-svg" viewBox="0 0 16 16" aria-hidden="true" width="16" height="16"><circle cx="8" cy="8" r="7" fill="#1e1e1e"/><circle cx="8" cy="8" r="4.2" fill="none" stroke="#fff" stroke-width="1"/><circle cx="8" cy="8" r="1.2" fill="#fff"/></svg>`;
        }
        if (kind === 'bp') {
            return `<svg class="listen-svg" viewBox="0 0 16 16" aria-hidden="true" width="16" height="16"><rect x="1" y="1" width="14" height="14" rx="3" ry="3" fill="#01FF95"/><path d="M6 4.5v7l5-3.5z" fill="#0b0b0b"/></svg>`;
        }
        if (kind === 'tb') {
            return `<svg class="listen-svg" viewBox="0 0 16 16" aria-hidden="true" width="16" height="16"><circle cx="8" cy="8" r="7" fill="#FF2D87"/><path d="M4 8h1.5v2.5h1V8H8V6.5H4zm5 2.5h1V8h1.2v2.5h1V6.5H9z" fill="#fff"/></svg>`;
        }
        return `<svg class="listen-svg" viewBox="0 0 16 16" aria-hidden="true" width="16" height="16"><rect x="0.5" y="3" width="15" height="10" rx="2.5" ry="2.5" fill="#FF0000"/><path d="M6.5 5.8v4.4L10.4 8z" fill="#fff"/></svg>`;
    }

    // Open a YouTube search for "artist - title". No Discogs round-trip — the
    // search page reliably surfaces a playable result even when Discogs has no
    // video on file, and it lets the user pick if the first hit is the wrong
    // mix/edit. `album` is included only as a fallback when title is missing.
    _handleYtButtonClick(btn) {
        if (!btn) return;
        const artist = (btn.dataset.ytArtist || '').trim();
        const title = (btn.dataset.ytTitle || btn.dataset.ytAlbum || '').trim();
        const query = [artist, title].filter(Boolean).join(' - ');
        if (!query) {
            this.showNotification?.('No artist/title to search.', 'info');
            return;
        }
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank', 'noopener');
    }

    // ── Acquisition timeline helpers ──

    _acquisitionHistogram(tracks) {
        const buckets = {};
        for (const t of tracks) {
            const d = (t.date_added || '').slice(0, 7);
            if (!d || d.length !== 7 || d[4] !== '-') continue;
            buckets[d] = (buckets[d] || 0) + 1;
        }
        const months = Object.keys(buckets).sort();
        if (!months.length) return [];
        // Fill gaps so dry spells are visible.
        const out = [];
        const [sy, sm] = months[0].split('-').map(Number);
        const [ey, em] = months[months.length - 1].split('-').map(Number);
        let y = sy, m = sm;
        while (y < ey || (y === ey && m <= em)) {
            const key = `${y}-${String(m).padStart(2, '0')}`;
            out.push({ month: key, count: buckets[key] || 0 });
            m++;
            if (m > 12) { m = 1; y++; }
        }
        return out;
    }

    _formatMonth(ym) {
        const [y, m] = ym.split('-').map(Number);
        const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${names[m - 1]} ${y}`;
    }

    _monthBounds(ym) {
        const [y, m] = ym.split('-').map(Number);
        const last = new Date(y, m, 0).getDate();
        const mm = String(m).padStart(2, '0');
        return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
    }

    // ── Discover-local cross-filter (P1.2) + chart tooltips/menu (P1.3) ──

    /**
     * Filtered subset of allTracks given the current Discover-local chart selection.
     * Multiple selections AND together; selections within the same chart OR together.
     * Exposed so future agents (A4 / P2.2 context strip) can read the active slice.
     */
    getDiscoverSelectedTracks(allTracks) {
        const sel = this._discoverChartSelection || [];
        if (!sel.length) return allTracks;
        const byChart = new Map();
        for (const s of sel) {
            if (!byChart.has(s.chart)) byChart.set(s.chart, new Set());
            byChart.get(s.chart).add(s.value);
        }
        return allTracks.filter((t) => {
            for (const [chart, values] of byChart) {
                if (!this._trackMatchesChartSelection(t, chart, values)) return false;
            }
            return true;
        });
    }

    _trackMatchesChartSelection(t, chart, values) {
        if (chart === 'labels') return !!(t.label && values.has(t.label.trim()));
        if (chart === 'artists') return !!(t.artist && values.has(t.artist.trim()));
        if (chart === 'years') return t.year != null && values.has(String(t.year));
        if (chart === 'genres') {
            const tokens = primaryGenreTokensTrack(t);
            return tokens.some((g) => values.has(g));
        }
        if (chart === 'acquisition') {
            const ym = (t.date_added || '').slice(0, 7);
            return ym && values.has(ym);
        }
        return true;
    }

    _computeChartAggregations(tracks) {
        const labelArtists = {};
        const labelTracks = {};
        const labelMaxYear = {};
        const labelTopArtist = {};
        const labelArtistCount = {};
        const labelBpms = {};
        const genreCount = {};
        const genreLabelCount = {};
        const genreBpms = {};
        const yearCount = {};
        const yearLabelCount = {};
        const artistCount = {};
        const tagCount = {};
        const albumAggMap = new Map(); // key `${artist}\u241e${album}` — same as jump-to album keys
        const currentYear = new Date().getFullYear();

        for (const t of tracks) {
            const artist = (t.artist || '').trim();
            const label = (t.label || '').trim();
            const album = (t.album || '').trim();
            const genre = (t.genre || '').trim();
            const year = t.year && Number(t.year);
            const validYear = year && year > 1900 && year <= currentYear;
            const bpm = Number(t.bpm);
            const validBpm = Number.isFinite(bpm) && bpm > 0;

            if (artist) artistCount[artist] = (artistCount[artist] || 0) + 1;
            if (artist && album) {
                const ak = `${artist}\u241e${album}`;
                const prev = albumAggMap.get(ak);
                if (prev) prev.count += 1;
                else albumAggMap.set(ak, { artist, album, count: 1 });
            }
            // Tags live in `tags` (if populated) or `comments` (comma-separated).
            const tagList = Array.isArray(t.tags) && t.tags.length
                ? t.tags
                : (t.comments ? t.comments.split(',').map((s) => s.trim()).filter(Boolean) : []);
            for (const tag of tagList) {
                if (!tag) continue;
                tagCount[tag] = (tagCount[tag] || 0) + 1;
            }

            if (label) {
                labelTracks[label] = (labelTracks[label] || 0) + 1;
                if (artist) {
                    (labelArtists[label] ??= new Set()).add(artist);
                    const counts = (labelArtistCount[label] ??= {});
                    counts[artist] = (counts[artist] || 0) + 1;
                }
                if (validYear) labelMaxYear[label] = Math.max(labelMaxYear[label] || 0, year);
                if (validBpm) (labelBpms[label] ??= []).push(bpm);
            }
            if (genre) {
                const tokens = primaryGenreTokensTrack(t);
                for (const g of tokens) {
                    genreCount[g] = (genreCount[g] || 0) + 1;
                    if (label) {
                        const m = (genreLabelCount[g] ??= {});
                        m[label] = (m[label] || 0) + 1;
                    }
                    if (validBpm) (genreBpms[g] ??= []).push(bpm);
                }
            }
            if (validYear) {
                yearCount[year] = (yearCount[year] || 0) + 1;
                if (label) {
                    const m = (yearLabelCount[year] ??= {});
                    m[label] = (m[label] || 0) + 1;
                }
            }
        }

        for (const [label, counts] of Object.entries(labelArtistCount)) {
            const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
            if (top) labelTopArtist[label] = top[0];
        }

        // Full (uncapped) rankings — the Discover view applies per-card
        // sort + top-N cap below so sort/expand toggles can reshape the view
        // without re-aggregating.
        const labelsRanked = Object.entries(labelArtists)
            .map(([label, artists]) => ({ label, count: artists.size }))
            .sort((a, b) => b.count - a.count);
        const genresRanked = Object.entries(genreCount).sort((a, b) => b[1] - a[1]);
        const artistsRanked = Object.entries(artistCount)
            .map(([artist, count]) => ({ artist, count }))
            .sort((a, b) => b.count - a.count);
        const tagsRanked = Object.entries(tagCount)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);
        const albumsRanked = [...albumAggMap.values()].sort((a, b) => b.count - a.count);
        const yearKeys = Object.keys(yearCount).map(Number).sort((a, b) => a - b);
        const acquisition = this._acquisitionHistogram(tracks);

        return {
            // Ranked (uncapped) — caller applies sort + cap.
            labelsRanked, genresRanked, artistsRanked, albumsRanked, tagsRanked,
            // Time-ordered — sort is chronological, caller may cap.
            yearKeys, yearCount, acquisition,
            // Legacy slices (still consumed by Go-further / tooltip helpers).
            topLabels: labelsRanked.slice(0, 12),
            topGenres: genresRanked.slice(0, 8),
            labelArtists, labelTracks, labelMaxYear, labelTopArtist, labelBpms,
            genreLabelCount, genreBpms, yearLabelCount,
        };
    }

    // ── Chart card sort/expand helpers (Discover) ──
    _chartCapFor(chartId) {
        // Doughnut is fixed (no expand), others toggle 10 ↔ 30.
        if (chartId === 'genres') return 8;
        return this._chartExpanded[chartId] ? 30 : 10;
    }

    _applyChartSort(items, chartId, keyFn) {
        const mode = this._chartSort[chartId] || 'count-desc';
        const arr = items.slice();
        if (mode === 'alpha-asc') {
            arr.sort((a, b) => String(keyFn(a)).localeCompare(String(keyFn(b))));
        } else if (mode === 'count-asc') {
            // Stable secondary by name so ties render predictably.
            arr.sort((a, b) => {
                const ca = a.count ?? a[1]; const cb = b.count ?? b[1];
                return ca - cb || String(keyFn(a)).localeCompare(String(keyFn(b)));
            });
        } else {
            arr.sort((a, b) => {
                const ca = a.count ?? a[1]; const cb = b.count ?? b[1];
                return cb - ca || String(keyFn(a)).localeCompare(String(keyFn(b)));
            });
        }
        return arr;
    }

    _cycleChartSort(chartId) {
        const order = ['count-desc', 'alpha-asc', 'count-asc'];
        const cur = this._chartSort[chartId] || 'count-desc';
        const idx = order.indexOf(cur);
        this._chartSort[chartId] = order[(idx + 1) % order.length];
        this._saveChartCardState(chartId);
        this._refreshCharts();
    }

    _toggleChartExpanded(chartId) {
        this._chartExpanded[chartId] = !this._chartExpanded[chartId];
        this._saveChartCardState(chartId);
        this._refreshCharts();
    }

    _saveChartCardState(chartId) {
        clearTimeout(this._saveChartStateTimers?.[chartId]);
        this._saveChartStateTimers ||= {};
        this._saveChartStateTimers[chartId] = setTimeout(async () => {
            try {
                await this.integrationManager.database.saveSetting(
                    `discover_chart_sort_${chartId}`, this._chartSort[chartId],
                );
                await this.integrationManager.database.saveSetting(
                    `discover_chart_expanded_${chartId}`, !!this._chartExpanded[chartId],
                );
            } catch (e) { console.error('persist chart card state failed', e); }
        }, 200);
    }

    // ── Collection distribution strip (filter-bar ↔ table) ──

    // DJ-sensible BPM buckets. Ranges are half-open on the top except the last bucket.
    static DISTRIBUTION_BPM_BUCKETS = [
        { id: 'bpm-lt100',    label: '<100',     min: null, max: 99  },
        { id: 'bpm-100-114',  label: '100–114',  min: 100,  max: 114 },
        { id: 'bpm-115-124',  label: '115–124',  min: 115,  max: 124 },
        { id: 'bpm-125-134',  label: '125–134',  min: 125,  max: 134 },
        { id: 'bpm-135plus',  label: '135+',     min: 135,  max: null },
    ];

    // Aggregate `tracks` for the distribution strip. Reuses `_computeChartAggregations`
    // for genres/labels/years (one scan, already-filtered subset — counts honor the
    // active filter). BPM bucketing is inline since it's small and needs custom ranges.
    _computeDistributionAggregations(tracks) {
        const agg = this._computeChartAggregations(tracks);
        const genres = agg.genresRanked.map(([value, count]) => ({ value, count }));
        const labels = agg.labelsRanked.map(({ label, count }) => ({ value: label, count }));
        const years = Object.entries(agg.yearCount)
            .map(([y, c]) => ({ value: String(y), count: c }))
            .sort((a, b) => b.count - a.count || Number(b.value) - Number(a.value));

        // Acquisition year: year of `date_added`. Separate from track `year` (release year).
        const acqYearCount = {};
        for (const t of tracks) {
            const d = (t.date_added || '').slice(0, 4);
            if (!d || d.length !== 4 || !/^\d{4}$/.test(d)) continue;
            acqYearCount[d] = (acqYearCount[d] || 0) + 1;
        }
        const acqYears = Object.entries(acqYearCount)
            .map(([y, c]) => ({ value: y, count: c }))
            .sort((a, b) => b.count - a.count || Number(b.value) - Number(a.value));

        // BPM buckets.
        const buckets = this.constructor.DISTRIBUTION_BPM_BUCKETS.map(b => ({ ...b, count: 0 }));
        for (const t of tracks) {
            const bpm = Number(t.bpm);
            if (!Number.isFinite(bpm) || bpm <= 0) continue;
            for (const b of buckets) {
                if ((b.min == null || bpm >= b.min) && (b.max == null || bpm <= b.max)) {
                    b.count += 1;
                    break;
                }
            }
        }
        const bpm = buckets.map(b => ({
            value: b.id, label: b.label, count: b.count, min: b.min, max: b.max,
        }));

        return { genres, labels, bpm, years: acqYears };
    }

    _distributionRowIsSelected(cardId, value) {
        if (cardId === 'genres') return this.filterEngine.state.genres.includes(value);
        if (cardId === 'labels') return this.filterEngine.state.labels.includes(value);
        if (cardId === 'years') {
            // Years card shows acquisition years (date_added). Wire to dateAddedRange.
            const r = this.filterEngine.state.dateAddedRange;
            return !!(r && r.from === `${value}-01-01` && r.to === `${value}-12-31`);
        }
        if (cardId === 'bpm') {
            const r = this.filterEngine.state.bpmRange;
            if (!r) return false;
            const bucket = this.constructor.DISTRIBUTION_BPM_BUCKETS.find(b => b.id === value);
            if (!bucket) return false;
            const a = (r.min == null ? null : Number(r.min));
            const b = (r.max == null ? null : Number(r.max));
            return a === bucket.min && b === bucket.max;
        }
        return false;
    }

    _distributionCardSpec(cardId) {
        if (cardId === 'genres') return { title: 'Top Genres' };
        if (cardId === 'labels') return { title: 'Top Labels' };
        if (cardId === 'bpm')    return { title: 'BPM' };
        if (cardId === 'years')  return { title: 'Released' };
        return { title: cardId };
    }

    _renderDistributionCard(cardId, rows) {
        const spec = this._distributionCardSpec(cardId);
        const expanded = !!this._distributionExpanded[cardId];
        const isBpm = cardId === 'bpm';
        // BPM has a fixed 5 rows, never needs expansion.
        const defaultCap = 5;
        const expandedCap = 15;
        const cap = isBpm ? rows.length : (expanded ? expandedCap : defaultCap);
        const view = rows.slice(0, cap);
        const total = rows.length;
        const showExpand = !isBpm && total > defaultCap;
        const maxCount = view.reduce((m, r) => Math.max(m, r.count), 0) || 1;

        const expandBtn = showExpand
            ? `<button class="mini-chart-expand" type="button" data-card="${cardId}" aria-pressed="${expanded ? 'true' : 'false'}">${expanded ? 'Show less' : 'Show more'}</button>`
            : '';

        let bodyHtml;
        if (view.length === 0) {
            bodyHtml = `<div class="mini-chart-empty">No matches</div>`;
        } else {
            bodyHtml = view.map((r) => {
                const pct = Math.max(2, Math.round((r.count / maxCount) * 100));
                const selected = this._distributionRowIsSelected(cardId, r.value);
                const display = isBpm ? r.label : r.value;
                const title = isBpm ? r.label : String(r.value);
                return `<button class="mini-chart-row${selected ? ' is-selected' : ''}"
                        type="button"
                        data-card="${cardId}"
                        data-value="${this.escapeHtml(String(r.value))}"
                        aria-pressed="${selected ? 'true' : 'false'}"
                        title="${this.escapeHtml(title)}">
                    <span class="mini-chart-fill" style="width:${pct}%"></span>
                    <span class="mini-chart-name">${this.escapeHtml(String(display))}</span>
                    <span class="mini-chart-count">${r.count.toLocaleString()}</span>
                </button>`;
            }).join('');
        }

        const footHtml = (showExpand && total > defaultCap && !expanded)
            ? `<div class="mini-chart-foot">+${(total - defaultCap).toLocaleString()} more</div>`
            : '';

        return `<section class="mini-chart-card" data-card="${cardId}">
            <header class="mini-chart-header">
                <h4>${spec.title}</h4>
                ${expandBtn}
            </header>
            <div class="mini-chart-body">${bodyHtml}</div>
            ${footHtml}
        </section>`;
    }

    _renderCollectionDistribution(filtered, contentArea) {
        const strip = document.createElement('section');
        strip.className = 'collection-distribution-strip';
        if (this._distributionCollapsed) strip.classList.add('is-collapsed');

        const count = filtered.length;
        const countText = `${count.toLocaleString()} track${count === 1 ? '' : 's'}`;

        if (this._distributionCollapsed) {
            // Collapsed mode: thin header only, skip aggregation entirely.
            strip.innerHTML = `
                <div class="distribution-collapsed-bar">
                    <span class="distribution-collapsed-label">Distribution &middot; your filter &middot; ${this.escapeHtml(countText)}</span>
                    <button type="button" class="distribution-toggle" data-action="expand" aria-pressed="true" title="Expand">Show</button>
                </div>`;
            strip.querySelector('.distribution-toggle').addEventListener('click', () => {
                this._distributionCollapsed = false;
                this.loadCollectionView();
            });
            contentArea.appendChild(strip);
            return;
        }

        const agg = this._computeDistributionAggregations(filtered);

        const cardIds = ['genres', 'labels', 'bpm', 'years'];
        const cardsHtml = cardIds.map((id) => this._renderDistributionCard(id, agg[id])).join('');

        strip.innerHTML = `
            <header class="distribution-strip-header">
                <span class="distribution-strip-label">Distribution</span>
                <span class="distribution-strip-count">${this.escapeHtml(countText)}</span>
                <button type="button" class="distribution-toggle" data-action="collapse" aria-pressed="false" title="Collapse">Hide</button>
            </header>
            <div class="mini-chart-grid">${cardsHtml}</div>
        `;

        strip.querySelector('.distribution-toggle').addEventListener('click', () => {
            this._distributionCollapsed = true;
            this.loadCollectionView();
        });

        strip.querySelectorAll('.mini-chart-expand').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.card;
                this._distributionExpanded[id] = !this._distributionExpanded[id];
                this.loadCollectionView();
            });
        });

        strip.querySelectorAll('.mini-chart-row').forEach((row) => {
            row.addEventListener('click', () => this._onDistributionRowClick(row.dataset.card, row.dataset.value));
        });

        contentArea.appendChild(strip);
    }

    _onDistributionRowClick(cardId, value) {
        this._healthFilter = null;
        if (cardId === 'genres' || cardId === 'labels') {
            this.filterEngine.toggleFilter(cardId, value);
            this.loadCollectionView();
            return;
        }
        if (cardId === 'years') {
            // Acquisition year → dateAddedRange spanning that year. Click again to clear.
            const selected = this._distributionRowIsSelected('years', value);
            if (selected) this.filterEngine.setDateAddedRange(null);
            else this.filterEngine.setDateAddedRange({ from: `${value}-01-01`, to: `${value}-12-31` });
            this.loadCollectionView();
            return;
        }
        if (cardId === 'bpm') {
            const bucket = this.constructor.DISTRIBUTION_BPM_BUCKETS.find(b => b.id === value);
            if (!bucket) return;
            const selected = this._distributionRowIsSelected('bpm', value);
            if (selected) this.filterEngine.setBpmRange(null, null);
            else this.filterEngine.setBpmRange(bucket.min, bucket.max);
            this.loadCollectionView();
        }
    }

    // Universal Go-further panel on Collection. Mounts the same render fn used
    // on Discover, scoped to whichever subset the table is currently showing.
    // Wrapped in a collapsible shell that mirrors the distribution strip.
    _renderCollectionGoFurther(filteredTracks, rawTracks, contentArea) {
        const exploremeTracks = (rawTracks || []).filter(isExploremeTrack);
        // Same computation Discover uses; exploreme is always passed separately
        // so the Explore tab populates regardless of `_includeExploreme`.
        const signals = computeDigSignals(
            filteredTracks.filter((t) => !isExploremeTrack(t)),
            exploremeTracks,
        );

        const wrap = document.createElement('section');
        wrap.className = 'collection-go-further';
        if (this._collectionGoFurtherCollapsed) wrap.classList.add('is-collapsed');

        if (this._collectionGoFurtherCollapsed) {
            wrap.innerHTML = `
                <div class="distribution-collapsed-bar">
                    <span class="distribution-collapsed-label">Go further</span>
                    <button type="button" class="distribution-toggle" data-action="expand" aria-pressed="true" title="Expand">Show</button>
                </div>`;
            wrap.querySelector('.distribution-toggle').addEventListener('click', () => {
                this._collectionGoFurtherCollapsed = false;
                this._saveCollectionGoFurtherState();
                this.loadCollectionView();
            });
            contentArea.appendChild(wrap);
            return;
        }

        // The shared render fn returns the full `.go-further` block; we hoist
        // its collapse toggle into our shell header so the markup stays one
        // panel-level concern instead of two.
        const innerHtml = this._renderGoFurtherSection(signals, { scoped: false, sliceSize: filteredTracks.length });
        if (!innerHtml) return; // no signals to surface — skip mounting at all

        wrap.innerHTML = `
            <header class="distribution-strip-header collection-gf-header">
                <span class="distribution-strip-label">Go further</span>
                <button type="button" class="distribution-toggle" data-action="collapse" aria-pressed="false" title="Collapse">Hide</button>
            </header>
            ${innerHtml}`;

        wrap.querySelector('.distribution-toggle').addEventListener('click', () => {
            this._collectionGoFurtherCollapsed = true;
            this._saveCollectionGoFurtherState();
            this.loadCollectionView();
        });

        contentArea.appendChild(wrap);
        // Re-use the existing wiring (tabs + show-more) — same DOM, same handlers.
        this._wireGoFurtherSection(wrap);
        // Tile clicks (scoped to `wrap` so we don't double-bind Discover's copy).
        // The exploreme tiles need their own handler since they route to Explore.
        wrap.querySelectorAll('.dig-exploreme-label').forEach((a) => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const prevMode = this._filterScopes.exploreme?.matchMode;
                const seed = this._emptyFilterState(prevMode);
                seed.labels = [a.dataset.label];
                this._filterScopes.exploreme = seed;
                this.loadView('exploreme');
            });
        });
        wrap.querySelectorAll('.dig-label').forEach((a) => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                if (a.dataset.label) this.navigate({ view: 'label', name: a.dataset.label });
            });
        });
        wrap.querySelectorAll('.dig-artist').forEach((a) => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                this.filterEngine.setFilter('artists', [a.dataset.artist]);
                this.loadView('collection');
            });
        });
    }

    _saveCollectionGoFurtherState() {
        clearTimeout(this._saveCollectionGoFurtherTimer);
        this._saveCollectionGoFurtherTimer = setTimeout(async () => {
            try {
                await this.integrationManager.database.saveSetting(
                    'collection_go_further_collapsed', !!this._collectionGoFurtherCollapsed,
                );
            } catch (e) { console.error('persist Collection go-further state failed', e); }
        }, 200);
    }

    // Build the control cluster inside `.chart-card-header`. `sortable` hides
    // the sort toggle where it's meaningless (time-ordered charts).
    _chartControlsHtml(chartId, { sortable = true, expandable = true } = {}) {
        const sortMode = this._chartSort[chartId] || 'count-desc';
        const sortLabel = sortMode === 'alpha-asc' ? 'A–Z' : sortMode === 'count-asc' ? 'Low' : 'Top';
        const expanded = !!this._chartExpanded[chartId];
        const parts = [];
        if (sortable) {
            parts.push(`<button class="chart-sort-toggle" type="button" data-chart="${chartId}" data-mode="${sortMode}" title="Cycle sort">${sortLabel}</button>`);
        }
        if (expandable) {
            parts.push(`<button class="chart-expand-toggle" type="button" data-chart="${chartId}" aria-pressed="${expanded ? 'true' : 'false'}">${expanded ? 'Show less' : 'Show more'}</button>`);
        }
        return parts.length ? `<div class="chart-card-controls">${parts.join('')}</div>` : '';
    }

    _chartMoreFooterHtml(totalCount, cap, chartId) {
        if (totalCount <= cap) return '';
        const remaining = totalCount - cap;
        const verb = this._chartExpanded[chartId] ? 'show less' : 'show all';
        return `<div class="chart-card-foot"><button class="chart-see-more" type="button" data-chart="${chartId}">+${remaining.toLocaleString()} more · ${verb}</button></div>`;
    }

    // Build the Set of currently selected values for a given chart id.
    _selectionSetFor(chartId) {
        const vals = (this._discoverChartSelection || [])
            .filter((s) => s.chart === chartId)
            .map((s) => String(s.value));
        return new Set(vals);
    }

    _tooltipForLabel(labelName, count, agg) {
        const owned = agg.labelTracks[labelName] || count;
        const lastYear = agg.labelMaxYear[labelName];
        const related = [];
        if (lastYear) related.push(`Last acquired: ${lastYear}`);
        const gapBucket = this._labelGapBuckets?.get(labelName);
        if (gapBucket && gapBucket.totalCatalog != null) {
            related.push(`Gap: ${Math.max(0, gapBucket.totalCatalog - gapBucket.ownedCount)} on Discogs`);
        }
        const top = agg.labelTopArtist[labelName];
        if (top) related.push(`Top artist: ${top}`);
        return { primary: `${labelName}: ${count} artists (${owned} tracks)`, related };
    }

    _tooltipForGenre(genreName, count, agg) {
        const labelMap = agg.genreLabelCount[genreName] || {};
        const topLabels = Object.entries(labelMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l]) => l);
        const bpms = agg.genreBpms[genreName] || [];
        const related = [];
        if (topLabels.length) related.push(`Top labels: ${topLabels.join(', ')}`);
        if (bpms.length) {
            const avg = Math.round(bpms.reduce((s, b) => s + b, 0) / bpms.length);
            related.push(`Avg BPM: ${avg}`);
        }
        return { primary: `${genreName}: ${count} tracks`, related };
    }

    _tooltipForYear(year, count, agg) {
        const labelMap = agg.yearLabelCount[year] || {};
        const top = Object.entries(labelMap).sort((a, b) => b[1] - a[1])[0];
        const related = top ? [`Top label: ${top[0]} (${top[1]})`] : [];
        return { primary: `${year}: ${count} tracks`, related };
    }

    _tooltipForAcquisition(bucket, count, _agg) {
        if (!bucket) return { primary: `${count} tracks` };
        return { primary: `${this._formatMonth(bucket.month)}: ${count} tracks added`, related: [] };
    }

    _renderChartSelectionsRow(subsetCount, totalCount) {
        const sel = this._discoverChartSelection || [];
        const hasDrill = !!(this._discoverChartDrill && this._discoverChartDrill.levels?.length);
        // Render whenever there are chart selections OR an active drill, so the
        // "Clear all" button is always reachable without hunting for the breadcrumb.
        if (!sel.length && !hasDrill) return '';
        const pills = sel.map((s, i) => {
            const labelMap = { genres: 'Genre', labels: 'Label', artists: 'Artist', years: 'Year', acquisition: 'Month' };
            const valueText = s.chart === 'acquisition' ? this._formatMonth(s.value) : s.value;
            return `
                <button class="chart-sel-pill" type="button" data-i="${i}"
                        title="Remove ${this.escapeHtml(labelMap[s.chart] || s.chart)} filter">
                    <span class="chart-sel-pill-key">${this.escapeHtml(labelMap[s.chart] || s.chart)}</span>
                    <span class="chart-sel-pill-val">${this.escapeHtml(valueText)}</span>
                    <span class="chart-sel-pill-x" aria-hidden="true">&times;</span>
                </button>`;
        }).join('');
        return `
            <div class="chart-selections" role="region" aria-label="Chart filter selections">
                <span class="chart-selections-label">Chart filter:</span>
                <div class="chart-selections-pills">${pills}</div>
                <span class="chart-selections-count">${subsetCount.toLocaleString()} of ${totalCount.toLocaleString()} tracks</span>
                <button class="chart-selections-clear" type="button">Clear all</button>
            </div>`;
    }

    _wireChartSelectionRow(contentArea) {
        const row = contentArea.querySelector('.chart-selections');
        if (!row) return;
        row.querySelectorAll('.chart-sel-pill').forEach((btn) => {
            btn.addEventListener('click', () => {
                const i = Number(btn.dataset.i);
                if (Number.isInteger(i)) this._removeDiscoverChartSelection(i);
            });
        });
        // "Clear all" is an unconditional full reset: selections + drill + lens scope.
        const clear = row.querySelector('.chart-selections-clear');
        if (clear) clear.addEventListener('click', () => this._clearDiscoverChartSelection());
    }

    // Sort + show-more/less toggles inside each chart card header, plus the
    // "+N more · show all" footer button.
    _wireChartCardControls(contentArea) {
        contentArea.querySelectorAll('.chart-sort-toggle').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.chart;
                if (id) this._cycleChartSort(id);
            });
        });
        contentArea.querySelectorAll('.chart-expand-toggle, .chart-see-more').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.chart;
                if (id) this._toggleChartExpanded(id);
            });
        });
    }

    _addDiscoverChartSelection(chart, value) {
        if (value == null || value === '') return;
        const exists = this._discoverChartSelection.some((s) => s.chart === chart && s.value === value);
        if (exists) return;
        this._discoverChartSelection.push({ chart, value });
        this._saveDiscoverChartSelection();
        this._closeDiscoverChartMenu();
        this._syncRoute({ sel: this._discoverChartSelection });
    }

    // Translate the current Collection filterEngine state into a Discover view:
    //   - chart-mappable facets (genres, labels, years) → discoverChartSelection
    //     entries (one per value, preserving the existing {chart, value} shape).
    //   - everything else (search, BPM, date range, tags, subgenres, artists,
    //     sources, keys) → cached into _filterScopes.explore so the Discover
    //     subset matches even though those facets aren't chart-pillable.
    _openCurrentFilterInDiscover() {
        if (!this.filterEngine.hasActiveFilters()) return;
        const live = this.filterEngine.state;

        // Build the chart selection from chart-mappable facets.
        const sel = [];
        for (const v of live.genres || []) sel.push({ chart: 'genres', value: String(v) });
        for (const v of live.labels || []) sel.push({ chart: 'labels', value: String(v) });
        for (const v of live.years || []) sel.push({ chart: 'years', value: String(v) });
        this._discoverChartSelection = sel;
        this._saveDiscoverChartSelection();

        // Everything else survives via the Discover filter scope so the same
        // subset is in view, even though those facets won't appear as pills.
        // Strip chart-mapped facets so they don't double-filter on top of the
        // chart selection (which already enforces them).
        const scoped = this._cloneFilterState(live);
        scoped.genres = [];
        scoped.labels = [];
        scoped.years = [];
        this._filterScopes.charts = scoped;

        this.navigate({ view: 'charts', filter: scoped, sel });
    }

    _removeDiscoverChartSelection(index) {
        this._discoverChartSelection.splice(index, 1);
        this._saveDiscoverChartSelection();
        this._closeDiscoverChartMenu();
        this._syncRoute({ sel: this._discoverChartSelection });
    }

    _clearDiscoverChartSelection() {
        const hadSel = this._discoverChartSelection.length > 0;
        const hadCarriedFilter = this._activeFilterScope === 'charts'
            && this.filterEngine.hasActiveFilters();
        const hadDrill = !!(this._discoverChartDrill && this._discoverChartDrill.levels?.length);
        if (!hadSel && !hadCarriedFilter && !hadDrill) return;
        this._discoverChartSelection = [];
        this._saveDiscoverChartSelection();
        this._clearDiscoverChartDrill();
        // Also clear any non-pill filters that rode along from "Dig from this"
        // so the user has a single Reset-to-zero gesture on the chart row.
        if (hadCarriedFilter) {
            this.filterEngine.clearAll();
            this._filterScopes.charts = this._emptyFilterState();
        }
        this._closeDiscoverChartMenu();
        this._syncRoute({ sel: this._discoverChartSelection });
    }

    // sessionStorage-backed — ephemeral exploration state, scoped to this tab.
    _loadDiscoverChartSelection() {
        const ALLOWED_CHARTS = new Set(['genres', 'labels', 'artists', 'years', 'acquisition']);
        try {
            const raw = sessionStorage.getItem('discover_chart_selection');
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            // Strict shape check: reject entries from a stale storage schema so we
            // never surface a pre-existing selection (e.g. a pre-fix "Reggae")
            // that would silently AND with a new click like "Electronic".
            return parsed.filter((s) =>
                s && typeof s === 'object'
                && ALLOWED_CHARTS.has(s.chart)
                && typeof s.value === 'string' && s.value.length > 0,
            );
        } catch { return []; }
    }

    _saveDiscoverChartSelection() {
        try {
            sessionStorage.setItem('discover_chart_selection', JSON.stringify(this._discoverChartSelection || []));
        } catch (e) { console.error('persist chart selection failed', e); }
    }

    /** Raw library rows → Discover “dig slice”: exclude Explore Me, optionally apply Discover filter scope. */
    _discoverBaseTracks(rawTracks) {
        let tracks = rawTracks.filter((t) => !isExploremeTrack(t) && !isStashedTrack(t));
        if (this._activeFilterScope === 'charts' && this.filterEngine.hasActiveFilters()) {
            tracks = this.filterEngine.applyFilters(tracks);
        }
        return tracks;
    }

    _loadDiscoverChartDrill() {
        const ALLOW_CHART = new Set(['genres', 'labels', 'years', 'acquisition']);
        try {
            const raw = sessionStorage.getItem(DISCOVER_DRILL_STORAGE_KEY);
            if (!raw) return null;
            const o = JSON.parse(raw);
            if (!o || typeof o !== 'object' || !ALLOW_CHART.has(o.chartId)) return null;
            if (!Array.isArray(o.levels)) return null;
            const levels = o.levels.filter((l) => l && typeof l === 'object'
                && typeof l.k === 'string' && typeof l.v === 'string' && l.v.length > 0);
            if (!levels.length) return null;
            return { chartId: o.chartId, levels };
        } catch {
            return null;
        }
    }

    _saveDiscoverChartDrill() {
        try {
            if (!this._discoverChartDrill || !this._discoverChartDrill.levels?.length) {
                sessionStorage.removeItem(DISCOVER_DRILL_STORAGE_KEY);
            } else {
                sessionStorage.setItem(DISCOVER_DRILL_STORAGE_KEY, JSON.stringify(this._discoverChartDrill));
            }
        } catch (e) { console.error('persist chart drill failed', e); }
        // Each drill step is a history entry on Charts' address.
        if (this.currentView === 'charts' && this._route?.view === 'charts') {
            const drill = this._discoverChartDrill?.levels?.length ? { chartId: this._discoverChartDrill.chartId, levels: this._discoverChartDrill.levels.map((l) => ({ ...l })) } : undefined;
            const next = { ...this._route, drill };
            if (buildRoute(next) !== buildRoute(this._route)) {
                // A new entry, one deeper for Back: its depth stamp is not the one it was copied from.
                const { ummDepth: _from, ...state } = history.state || {};
                history.pushState(state, '', buildRoute(next));
                stampEntry();
                this._route = next;
            }
        }
    }

    _clearDiscoverChartDrill() {
        this._discoverChartDrill = null;
        this._saveDiscoverChartDrill();
    }

    _narrowTracksForDrill(chartId, levels, parentTracks) {
        let t = parentTracks;
        if (chartId === 'genres') {
            for (const lev of levels) {
                if (lev.k === 'genre') {
                    t = t.filter((tr) => primaryGenreTokensTrack(tr).includes(lev.v));
                } else if (lev.k === 'subgenre') {
                    t = t.filter((tr) => subgenreTokensTrack(tr).includes(lev.v));
                } else if (lev.k === 'tag') {
                    const want = lev.v.toLowerCase();
                    t = t.filter((tr) => Array.isArray(tr.tags)
                        && tr.tags.some((tg) => String(tg || '').toLowerCase() === want));
                } else if (lev.k === 'glabel') {
                    t = t.filter((tr) => (tr.label || '').trim() === lev.v);
                } else if (lev.k === 'gartist') {
                    t = t.filter((tr) => (tr.artist || '').trim() === lev.v);
                }
            }
        } else if (chartId === 'labels') {
            for (const lev of levels) {
                if (lev.k === 'label') {
                    t = t.filter((tr) => (tr.label || '').trim() === lev.v);
                } else if (lev.k === 'lartist') {
                    t = t.filter((tr) => (tr.artist || '').trim() === lev.v);
                }
            }
        } else if (chartId === 'years') {
            for (const lev of levels) {
                if (lev.k === 'year') {
                    t = t.filter((tr) => String(tr.year) === lev.v);
                } else if (lev.k === 'yr_label') {
                    t = t.filter((tr) => (tr.label || '').trim() === lev.v);
                }
            }
        } else if (chartId === 'acquisition') {
            for (const lev of levels) {
                if (lev.k === 'month') {
                    t = t.filter((tr) => (tr.date_added || '').slice(0, 7) === lev.v);
                } else if (lev.k === 'm_label') {
                    t = t.filter((tr) => (tr.label || '').trim() === lev.v);
                }
            }
        }
        return t;
    }

    /**
     * Build the next drill view for the Genres card. `levels` = current path; children are one step deeper.
     * Returns ranked [label, count][] for doughnut / bar, or null to fall back to default genre chart.
     */
    _genreDrillRankedBuckets(levels, narrowTracks) {
        const depth = levels.length;
        if (depth === 0) return null;
        if (depth >= 5) return []; // 5 levels: genre → subgenre → tag → label → artist (terminal)
        const map = {};
        const bump = (key) => {
            if (!key) return;
            map[key] = (map[key] || 0) + 1;
        };
        if (depth === 1) {
            for (const tr of narrowTracks) for (const sg of subgenreTokensTrack(tr)) bump(sg);
        } else if (depth === 2) {
            for (const tr of narrowTracks) {
                if (Array.isArray(tr.tags)) for (const tg of tr.tags) bump(String(tg || '').trim());
            }
        } else if (depth === 3) {
            for (const tr of narrowTracks) bump((tr.label || '').trim());
        } else if (depth === 4) {
            for (const tr of narrowTracks) bump((tr.artist || '').trim());
        }
        return Object.entries(map).filter(([k]) => k).sort((a, b) => b[1] - a[1]);
    }

    /** Top artists on a label within narrowTracks (Labels card drill level 2). */
    _labelDrillArtistsRanked(labelName, narrowTracks) {
        const map = {};
        for (const tr of narrowTracks) {
            if ((tr.label || '').trim() !== labelName) continue;
            const a = (tr.artist || '').trim();
            if (a) map[a] = (map[a] || 0) + 1;
        }
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }

    /** Labels that released in year (Years card drill). */
    _yearDrillLabelsRanked(yearStr, narrowTracks) {
        const map = {};
        const y = Number(yearStr);
        for (const tr of narrowTracks) {
            const ty = tr.year && Number(tr.year);
            if (ty !== y) continue;
            const lb = (tr.label || '').trim();
            if (lb) map[lb] = (map[lb] || 0) + 1;
        }
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }

    /** Labels acquired in month (Acquisition drill). */
    _monthDrillLabelsRanked(monthYm, narrowTracks) {
        const map = {};
        for (const tr of narrowTracks) {
            if ((tr.date_added || '').slice(0, 7) !== monthYm) continue;
            const lb = (tr.label || '').trim();
            if (lb) map[lb] = (map[lb] || 0) + 1;
        }
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }

    _chartDrillBreadcrumbHtml(chartId, levels, rootLabel) {
        if (!levels?.length) return '';
        // Back arrow — first-class drill-out control. Pops one level.
        const back = `<button type="button" class="chart-drill-back" data-drill-chart="${chartId}" title="Back one level" aria-label="Back one level">←</button>`;
        const bits = [`<button type="button" class="chart-drill-crumb chart-drill-root" data-drill-chart="${chartId}" data-drill-keep="0">${this.escapeHtml(rootLabel)}</button>`];
        for (let i = 0; i < levels.length; i++) {
            const lv = levels[i];
            let txt = lv.v;
            if (lv.k === 'month' && /^\d{4}-\d{2}$/.test(lv.v)) txt = this._formatMonth(lv.v);
            const esc = this.escapeHtml(txt);
            if (i < levels.length - 1) {
                bits.push(`<span class="chart-drill-sep">›</span><button type="button" class="chart-drill-crumb" data-drill-chart="${chartId}" data-drill-keep="${i + 1}">${esc}</button>`);
            } else {
                bits.push(`<span class="chart-drill-sep">›</span><span class="chart-drill-active">${esc}</span>`);
            }
        }
        // Exit chip: clear the entire drill in one tap.
        bits.push(`<button type="button" class="chart-drill-exit" data-drill-chart="${chartId}" title="Exit drill">&times; exit</button>`);
        return `<div class="chart-drill-trail" data-drill-chart="${chartId}" aria-label="Drill path">${back}${bits.join('')}</div>`;
    }

    _wireChartDrillBreadcrumbs(contentArea) {
        contentArea.querySelectorAll('.chart-drill-crumb').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.drillChart;
                const keep = Number(btn.dataset.drillKeep);
                if (!this._discoverChartDrill || this._discoverChartDrill.chartId !== id) return;
                if (!Number.isInteger(keep) || keep < 0) return;
                if (keep === 0) this._clearDiscoverChartDrill();
                else this._discoverChartDrill.levels = this._discoverChartDrill.levels.slice(0, keep);
                this._saveDiscoverChartDrill();
                this._refreshCharts();
            });
        });
        // "× exit" chip — clears the entire drill immediately.
        contentArea.querySelectorAll('.chart-drill-exit').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.drillChart;
                if (this._discoverChartDrill?.chartId === id) this._clearDiscoverChartDrill();
                this._refreshCharts();
            });
        });
        // "← back" button — pops one drill level at a time.
        contentArea.querySelectorAll('.chart-drill-back').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.drillChart;
                if (this._discoverChartDrill?.chartId !== id) return;
                const lvs = this._discoverChartDrill.levels || [];
                if (!lvs.length) return;
                if (lvs.length === 1) {
                    this._clearDiscoverChartDrill();
                } else {
                    this._discoverChartDrill.levels = lvs.slice(0, lvs.length - 1);
                    this._saveDiscoverChartDrill();
                }
                this._refreshCharts();
            });
        });
    }

    /**
     * Context menu "Drill into…" — starts a new drill or appends along the active chart path.
     * Switching chart replaces drill state (single active drill).
     */
    _drillIntoFromMenu(chart, rawValue) {
        if (rawValue == null || rawValue === '') return;
        const v = String(rawValue);
        const cur = this._discoverChartDrill;

        if (cur && cur.chartId === chart) {
            if (chart === 'genres' && cur.levels.length < 5) {
                const kind = GENRE_DRILL_APPEND_KIND[cur.levels.length];
                cur.levels.push({ k: kind, v });
                this._saveDiscoverChartDrill();
                this._closeDiscoverChartMenu();
                this._refreshCharts();
                return;
            }
            if (chart === 'labels' && cur.levels.length === 1) {
                cur.levels.push({ k: 'lartist', v });
                this._saveDiscoverChartDrill();
                this._closeDiscoverChartMenu();
                this._refreshCharts();
                return;
            }
        }

        if (chart === 'genres') {
            this._discoverChartDrill = { chartId: 'genres', levels: [{ k: 'genre', v }] };
        } else if (chart === 'labels') {
            this._discoverChartDrill = { chartId: 'labels', levels: [{ k: 'label', v }] };
        } else if (chart === 'years') {
            this._discoverChartDrill = { chartId: 'years', levels: [{ k: 'year', v }] };
        } else if (chart === 'acquisition') {
            this._discoverChartDrill = { chartId: 'acquisition', levels: [{ k: 'month', v }] };
        } else return;
        this._saveDiscoverChartDrill();
        this._closeDiscoverChartMenu();
        this._refreshCharts();
    }

    /** Plain-click on a chart segment: always drill in (last.fm-style).
     *  - No drill yet (or drill on a different chart) → start a fresh drill seeded with this value.
     *  - Drill already active on this chart → deepen it.
     *  Returns true so the caller skips its fallback chart-selection add. */
    _appendDiscoverDrillClick(chartId, rawLabel) {
        const val = String(rawLabel);
        const SEED_KIND = { genres: 'genre', labels: 'label', years: 'year', acquisition: 'month' };
        const seedKind = SEED_KIND[chartId];
        if (!seedKind) return false;

        let d = this._discoverChartDrill;
        if (!d || d.chartId !== chartId) {
            this._discoverChartDrill = { chartId, levels: [{ k: seedKind, v: val }] };
            this._saveDiscoverChartDrill();
            // Cross-chart drill: the Labels card shows the labels released in
            // that year or added in that month.
            this._refreshCharts();
            return true;
        }

        const L = d.levels.length;
        if (chartId === 'genres') {
            if (L >= 5) return true; // at max depth (genre → subgenre → tag → label → artist)
            const kind = GENRE_DRILL_APPEND_KIND[L];
            d.levels.push({ k: kind, v: val });
        } else if (chartId === 'labels' && L === 1) {
            d.levels.push({ k: 'lartist', v: val });
        } else {
            return true; // at max depth for this chart — swallow click, don't fall through to selection
        }
        this._saveDiscoverChartDrill();
        this._refreshCharts();
        return true;
    }

    _openDiscoverChartMenu(chart, value, info) {
        let menu = document.getElementById('discoverChartContextMenu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'discoverChartContextMenu';
            menu.className = 'chart-context-menu';
            menu.setAttribute('role', 'menu');
            menu.hidden = true;
            document.body.appendChild(menu);
        }
        const items = this._chartMenuItems(chart, value);
        if (!items.length) return;
        menu.innerHTML = items.map((it, i) =>
            `<button class="chart-ctx-item" type="button" role="menuitem" data-i="${i}">${this.escapeHtml(it.label)}</button>`,
        ).join('');
        menu.hidden = false;
        const x = Math.min(info.clientX, window.innerWidth - 240);
        const y = Math.min(info.clientY, window.innerHeight - (items.length * 32 + 16));
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        const buttons = menu.querySelectorAll('.chart-ctx-item');
        buttons.forEach((b, i) => {
            b.addEventListener('click', () => {
                this._closeDiscoverChartMenu();
                items[i].run();
            });
        });
        if (buttons[0]) buttons[0].focus();

        const dismiss = (ev) => {
            if (ev.type === 'keydown' && ev.key !== 'Escape') return;
            if (ev.type === 'mousedown' && menu.contains(ev.target)) return;
            // Local Esc-handler — stopImmediatePropagation so the global handler doesn't also clear search.
            if (ev.type === 'keydown') ev.stopImmediatePropagation();
            this._closeDiscoverChartMenu();
        };
        this._chartMenuDismiss = dismiss;
        // capture on keydown so we run before the global document handler.
        document.addEventListener('keydown', dismiss, true);
        document.addEventListener('mousedown', dismiss);
    }

    _closeDiscoverChartMenu() {
        const menu = document.getElementById('discoverChartContextMenu');
        if (menu) {
            menu.hidden = true;
            menu.innerHTML = '';
        }
        if (this._chartMenuDismiss) {
            document.removeEventListener('keydown', this._chartMenuDismiss, true);
            document.removeEventListener('mousedown', this._chartMenuDismiss);
            this._chartMenuDismiss = null;
        }
    }

    _chartMenuItems(chart, value) {
        const items = [];
        const d = this._discoverChartDrill;
        let canDrillMore = false;
        if (chart === 'genres') {
            canDrillMore = !(d?.chartId === 'genres' && d.levels.length >= 5);
        } else if (chart === 'years') {
            // Labels chart does not drill — it is selection-only.
            canDrillMore = !(d?.chartId === 'years' && d.levels.length >= 2);
        } else if (chart === 'acquisition') {
            canDrillMore = !(d?.chartId === 'acquisition' && d.levels.length >= 2);
        }
        if (canDrillMore) {
            items.push({ label: 'Drill into…', run: () => this._drillIntoFromMenu(chart, value) });
        }

        if (chart === 'labels') {
            items.push({ label: `Open label page: ${value}`, run: () => this.navigate({ view: 'label', name: value }) });
            items.push({ label: 'Filter Collection by this label', run: () => {
                this.filterEngine.setFilter('labels', [value]);
                this.loadView('collection');
            } });
            items.push({ label: 'Add to chart selection', run: () => this._addDiscoverChartSelection('labels', value) });
        } else if (chart === 'genres') {
            items.push({ label: 'Filter Collection by this genre', run: () => {
                this.filterEngine.setFilter('genres', [value]);
                this.loadView('collection');
            } });
            const hideSel = d?.chartId === 'genres' && d.levels.length >= 1;
            if (!hideSel) {
                items.push({ label: 'Add to chart selection', run: () => this._addDiscoverChartSelection('genres', value) });
            }
        } else if (chart === 'years') {
            if (d?.chartId === 'years' && d.levels.length === 1) {
                items.push({
                    label: 'Filter Collection (year + label)',
                    run: () => {
                        this.filterEngine.setFilter('years', [String(d.levels[0].v)]);
                        this.filterEngine.setFilter('labels', [value]);
                        this.loadView('collection');
                    },
                });
            } else {
                items.push({ label: 'Filter Collection by this year', run: () => {
                    this.filterEngine.setFilter('years', [String(value)]);
                    this.loadView('collection');
                } });
            }
            const hideSel = d?.chartId === 'years' && d.levels.length >= 1;
            if (!hideSel) {
                items.push({ label: 'Add to chart selection', run: () => this._addDiscoverChartSelection('years', String(value)) });
            }
        } else if (chart === 'acquisition') {
            if (d?.chartId === 'acquisition' && d.levels.length === 1) {
                items.push({
                    label: 'Filter Collection (month + label)',
                    run: () => {
                        this.filterEngine.setFilter('labels', [value]);
                        this.filterEngine.setDateAddedRange(this._monthBounds(d.levels[0].v));
                        this.loadView('collection');
                    },
                });
            } else {
                items.push({ label: 'Filter Collection by this month', run: () => {
                    this.filterEngine.setDateAddedRange(this._monthBounds(value));
                    this.loadView('collection');
                } });
            }
            const hideSel = d?.chartId === 'acquisition' && d.levels.length >= 1;
            if (!hideSel) {
                items.push({ label: 'Add to chart selection', run: () => this._addDiscoverChartSelection('acquisition', value) });
            }
        }
        return items;
    }

    // ── Go further (dig signals) ──

    _renderGoFurtherSection(signals, opts = {}) {
        const { stale, shallow, explore, oneTrack } = signals;
        const { scoped = false, sliceSize = 0 } = opts;
        const visibleCap = 8;

        const labelTile = (name, badges, cls = 'dig-label') => `
            <button class="label-tile gf-tile label-link ${cls}" data-label="${this.escapeHtml(name)}" title="${this.escapeHtml(name)}">
                <span class="label-tile-name">${this.escapeHtml(name)}</span>
                <span class="gf-badges">${badges}</span>
            </button>`;
        const artistTile = (name, badges) => `
            <button class="label-tile artist-tile gf-tile dig-artist" data-artist="${this.escapeHtml(name)}" title="${this.escapeHtml(name)}">
                <span class="label-tile-name">${this.escapeHtml(name)}</span>
                <span class="gf-badges">${badges}</span>
            </button>`;
        const badge = (text) => `<span class="gf-badge">${text}</span>`;

        const panes = [
            {
                key: 'stale',
                label: 'Stale',
                aria: 'Labels with at least 3 tracks where the newest year is at least 2 years behind today.',
                rows: stale.map((l) => labelTile(l.label, badge(l.count) + badge(l.lastYear) + badge(`${l.gap}y`))),
            },
            {
                key: 'shallow',
                label: 'Shallow',
                aria: 'Labels with at least 4 distinct artists owned but fewer than 1.5 tracks per artist on average — sampled, not yet explored.',
                rows: shallow.map((l) => labelTile(l.label, badge(`${l.artistCount}a`) + badge(`${l.trackCount}t`))),
            },
            {
                key: 'explore',
                label: 'Explore',
                aria: 'Top labels among tracks you tagged with the exploreme keyword — your existing dig backlog.',
                rows: explore.map((l) => labelTile(l.label, badge(l.count), 'dig-exploreme-label')),
            },
            {
                key: 'onetrack',
                label: 'One-track',
                aria: 'Artists you only own one track from, ranked by how many of their labels you already own deeply.',
                rows: oneTrack.map((a) => artistTile(a.artist, badge(`${a.connectedness} lbl`))),
            },
        ].filter((p) => p.rows.length);

        if (!panes.length) return '';

        const tabs = panes.map((p, i) => `
            <button class="gf-tab${i === 0 ? ' active' : ''}" role="tab" data-pane="${p.key}"
                    aria-selected="${i === 0 ? 'true' : 'false'}"
                    aria-description="${this.escapeHtml(p.aria)}"
                    title="${this.escapeHtml(p.aria)}">
                <span class="gf-tab-label">${p.label}</span>
                <span class="gf-tab-count">${p.rows.length}</span>
            </button>`).join('');

        const grids = panes.map((p, i) => {
            const visible = p.rows.slice(0, visibleCap);
            const rest = p.rows.slice(visibleCap);
            const more = rest.length
                ? `<button class="gf-more" type="button" data-pane="${p.key}" aria-expanded="false">+${rest.length}</button>
                   <div class="gf-rest" data-pane="${p.key}" hidden>${rest.join('')}</div>`
                : '';
            return `<div class="gf-pane${i === 0 ? ' active' : ''}" data-pane="${p.key}" role="tabpanel">
                <div class="gf-grid">${visible.join('')}</div>
                ${more}
            </div>`;
        }).join('');

        const scopeChip = scoped
            ? `<span class="gf-scope" title="Signals computed from the ${sliceSize} tracks in your chart selection.">in slice · ${sliceSize}</span>`
            : '';

        return `
            <div class="discover-section go-further${scoped ? ' gf-scoped' : ''}">
                <div class="gf-head">
                    <h3>Go further</h3>
                    ${scopeChip}
                    <div class="gf-tabs" role="tablist">${tabs}</div>
                </div>
                ${grids}
            </div>`;
    }

    _wireGoFurtherSection(contentArea) {
        const root = contentArea.querySelector('.go-further');
        if (!root) return;
        const tabs = root.querySelectorAll('.gf-tab');
        const panes = root.querySelectorAll('.gf-pane');
        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                const key = tab.dataset.pane;
                tabs.forEach((t) => {
                    const on = t === tab;
                    t.classList.toggle('active', on);
                    t.setAttribute('aria-selected', on ? 'true' : 'false');
                });
                panes.forEach((p) => p.classList.toggle('active', p.dataset.pane === key));
            });
        });
        root.querySelectorAll('.gf-more').forEach((btn) => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.pane;
                const rest = root.querySelector(`.gf-rest[data-pane="${key}"]`);
                if (!rest) return;
                const expanded = btn.getAttribute('aria-expanded') === 'true';
                btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
                rest.hidden = expanded;
                btn.textContent = expanded ? `+${rest.children.length}` : 'less';
            });
        });
    }

    // ── Forgotten Gems card ──

    // ── Discover View — exploration canvas (P2.7) ──
    //
    // Hero = relational graph (CreditsWeb). Right drawer = entity detail
    // (gaps / seed adjacency / Claude context). Charts live as a compact
    // strip below the canvas. Chart-drill and chart-selection state is kept
    // so "Dig from this" jumps still carry scope in.

    primaryGenreTokensTrack(track) { return primaryGenreTokensTrack(track); }

    /**
     * The visualizer, from the player's wave: the Collection graph on the playing track with the
     * mode started there; leaving it comes back to the address it was opened from. The wave again
     * while it runs leaves it.
     */
    openVisualizer() {
        const track = this.audioPlayer?.currentTrack;
        if (VIEWER || track?.id == null) return undefined;
        const view = (this._atlasView ||= new AtlasView({ app: this }));
        if (view.viz.on) return view.viz.stop();
        const back = location.hash, focus = `track:${track.id}`;
        view.visualize({ onExit: () => { if (location.hash !== back) location.hash = back; } });
        const here = this._route?.graph && this._route.view === 'collection' && view._active && !view.discover;
        if (here && this._route.focus === focus) return undefined;
        return this.navigate({ view: 'collection', graph: true, focus, filter: this._scopeFilter({ view: 'collection' }) });
    }

    /** A Collection graph: the map kept behind the page comes back as it was, else it is built. */
    async loadAtlasView() {
        if (!this._atlasView) this._atlasView = new AtlasView({ app: this });
        const view = this._atlasView;
        return view.canResume(this._route) ? view.resume(this._route) : view.render(this._route);
    }

    async loadChartsView() {
        if (this._route?.view === 'charts' && (serializeFilter(this._route.filter) !== serializeFilter(this.filterEngine.state)
            || JSON.stringify(this._route.sel || []) !== JSON.stringify(this._discoverChartSelection || []))) return this._syncRoute({ sel: this._discoverChartSelection });
        if (!this._chartsView) this._chartsView = new ChartsView({ app: this });
        return this._chartsView.render(this._route);
    }

    /** Artists, Albums, Labels or Tags: a tile grid of the collection. */
    async loadIndexView(view) {
        if (!this._indexView) this._indexView = new IndexView({ app: this });
        return this._indexView.render(this._route?.view === view ? this._route : { view });
    }

    /** Chart state (sort, expand, drill, selection) changed: redraw the Charts view. */
    _refreshCharts() {
        if (this.currentView !== 'charts' || !this._chartsView) return Promise.resolve();
        return this._chartsView.render(this._route);
    }

    /** The tracks in the Tracks table's current sort (Play from the panel queues this order). */
    _sortLikeTable(tracks) {
        const ordered = [...tracks];
        if (normalizeSort(this._tableSort).length) ordered.sort(sortComparator(this._tableSort, COLUMN_BY_KEY));
        return ordered;
    }

    /** Discover: the Graph (the atlas in Discover mode), New Releases or Shortlist, by `tab`. */
    async loadDiscoverView() {
        const tab = this._route?.view === 'discover' ? this._route.tab : undefined;
        this._discoverNew?.teardown();
        this._shortlistView?.teardown();
        this._atlasView?.teardown();
        // The header (☆, the Filter band) is the Graph tab's alone.
        if (tab) this._hideCollectionHeader();
        if (tab === 'new') return (this._discoverNew ||= new DiscoverNewView({ app: this })).render(document.getElementById('contentArea'));
        if (tab === 'shortlist') return this.loadShortlistView();
        return this.loadAtlasView(); // Discover › Graph: the atlas in Discover mode
    }

    // ── Label Gap Report ──

    _renderLabelGapSection(buckets) {
        const sort = (this._labelGapSort ||= 'owned');
        const ranked = this._rankLabelGaps(buckets, sort);
        const visible = ranked.slice(0, 10);
        const maxTotal = Math.max(...visible.map((b) => (b.totalCatalog ?? b.ownedCount)), 1);

        const tiles = visible.map((b) => {
            const total = b.totalCatalog;
            const ownedPct = total ? Math.min(100, Math.round((b.ownedCount / total) * 100)) : null;
            const missingText = total != null ? `${total - b.ownedCount} missing` : 'catalog?';
            return `
                <div class="lg-label-tile label-link" data-label="${this.escapeHtml(b.label)}" tabindex="0" title="${this.escapeHtml(b.label)}">
                    <div class="lg-label-tile-name">${this.escapeHtml(b.label)}</div>
                    <div class="lg-label-tile-counts">
                        <span class="lg-tile-owned">${b.ownedCount}</span>
                        <span class="lg-tile-sep">/</span>
                        <span class="lg-tile-total">${total != null ? total : '?'}</span>
                    </div>
                    <div class="lg-tile-spark">
                        <div class="lg-tile-spark-fill" style="width: ${ownedPct != null ? ownedPct : 0}%"></div>
                    </div>
                    <div class="lg-tile-missing">${missingText}</div>
                </div>`;
        }).join('');

        const rows = visible.map((b, i) => {
            const total = b.totalCatalog;
            const ownedPct = total ? Math.min(100, Math.round((b.ownedCount / total) * 100)) : 0;
            const barWidth = total ? Math.min(100, Math.round((total / maxTotal) * 100)) : Math.round((b.ownedCount / maxTotal) * 100);
            const fillWidth = total ? ownedPct : 100;
            const missingText = total != null
                ? `<span class="lg-missing">${total - b.ownedCount} missing</span>`
                : '<span class="lg-missing-pending">? missing</span>';
            const catalogText = total != null ? `${total} in catalog` : 'catalog not fetched';
            const status = b.status || 'idle';
            return `
                <li class="lg-row ${b.expanded ? 'is-expanded' : ''}" data-label="${this.escapeHtml(b.label)}" data-idx="${i}" tabindex="0">
                    <div class="lg-row-main">
                        <div class="lg-row-top">
                            <span class="lg-label-name">${this.escapeHtml(b.label)}</span>
                            <span class="lg-row-stats">
                                <span>${b.ownedCount} owned</span>
                                <span class="lg-sep">·</span>
                                <span>${catalogText}</span>
                                <span class="lg-sep">·</span>
                                ${missingText}
                            </span>
                            <a href="#" class="lg-open-label" title="Open label page" data-label="${this.escapeHtml(b.label)}">Open</a>
                            <a href="#" class="lg-refresh" title="Re-fetch from Discogs" data-label="${this.escapeHtml(b.label)}">Refresh</a>
                        </div>
                        <div class="lg-bar" style="width: ${barWidth}%">
                            <div class="lg-bar-fill" style="width: ${fillWidth}%"></div>
                        </div>
                    </div>
                    ${b.expanded ? this._renderLabelGapDetail(b, status) : ''}
                </li>`;
        }).join('');

        return `
            <div class="discover-section label-gap-section" data-collapsed="${this._labelGapCollapsed ? '1' : '0'}">
                <div class="lg-header">
                    <div>
                        <h3>Label Gap Report</h3>
                        <p class="muted">Catalogue depth on labels you own.</p>
                    </div>
                    <button class="lg-toggle btn-link" aria-expanded="${this._labelGapCollapsed ? 'false' : 'true'}">${this._labelGapCollapsed ? 'Show' : 'Hide'}</button>
                </div>
                <div class="lg-body" ${this._labelGapCollapsed ? 'hidden' : ''}>
                    <div class="lg-sort">
                        <span class="muted">Sort:</span>
                        <button class="lg-sort-btn ${sort === 'owned' ? 'active' : ''}" data-sort="owned">Owned</button>
                        <button class="lg-sort-btn ${sort === 'gap' ? 'active' : ''}" data-sort="gap">Gap size</button>
                        <button class="lg-sort-btn ${sort === 'gapPct' ? 'active' : ''}" data-sort="gapPct">Gap %</button>
                    </div>
                    <div class="lg-label-grid">${tiles}</div>
                    <details class="lg-details-toggle">
                        <summary>Show missing-release detail</summary>
                        <ul class="lg-list">${rows}</ul>
                    </details>
                </div>
            </div>`;
    }

    _rankLabelGaps(buckets, sort) {
        const withStats = buckets.map((b) => {
            const cached = this.labelGap._catalogueCache.get(b.label);
            const totalCatalog = cached?.totalCatalog ?? null;
            const missing = totalCatalog != null ? totalCatalog - b.ownedCount : null;
            return {
                ...b,
                totalCatalog,
                missing,
                expanded: this._labelGapExpanded?.has(b.label) || false,
                status: this._labelGapStatus?.get(b.label) || 'idle',
            };
        });
        const byOwned = (a, b) => b.ownedCount - a.ownedCount;
        if (sort === 'gap') {
            return withStats.sort((a, b) => (b.missing ?? -1) - (a.missing ?? -1) || byOwned(a, b));
        }
        if (sort === 'gapPct') {
            const pct = (x) => (x.totalCatalog ? (x.totalCatalog - x.ownedCount) / x.totalCatalog : -1);
            return withStats.sort((a, b) => pct(b) - pct(a) || byOwned(a, b));
        }
        return withStats.sort(byOwned);
    }

    _renderLabelGapDetail(b, status) {
        if (status === 'loading') {
            return '<div class="lg-detail"><p class="muted">Fetching Discogs catalogue…</p></div>';
        }
        if (status === 'error') {
            const msg = this._labelGapErrors?.get(b.label) || 'Lookup failed';
            return `<div class="lg-detail lg-error"><p class="muted">${this.escapeHtml(msg)} · <a href="#" class="lg-retry" data-label="${this.escapeHtml(b.label)}">Retry</a></p></div>`;
        }
        const cached = this.labelGap._catalogueCache.get(b.label);
        if (!cached) return '';
        const items = cached.missing.slice(0, 50);
        if (!items.length) {
            return '<div class="lg-detail"><p class="muted">No missing releases detected — you have the full catalogue.</p></div>';
        }
        const rows = items.map((r, i) => `
            <tr class="${i % 2 ? 'odd' : ''}">
                <td class="lg-year">${r.year || ''}</td>
                <td class="lg-artist">${this.escapeHtml(r.artist || '')}</td>
                <td class="lg-title">${this.escapeHtml(r.title || '')}</td>
                <td class="lg-link"><a href="${r.url}" target="_blank" rel="noopener">Discogs</a></td>
            </tr>`).join('');
        const more = cached.missing.length > items.length
            ? `<p class="muted lg-more">+ ${cached.missing.length - items.length} more on Discogs</p>` : '';
        return `
            <div class="lg-detail">
                <table class="lg-table"><tbody>${rows}</tbody></table>
                ${more}
            </div>`;
    }

    _wireLabelGapSection(contentArea) {
        const section = contentArea.querySelector('.label-gap-section');
        if (!section) return;
        this._labelGapExpanded ||= new Set();
        this._labelGapStatus ||= new Map();
        this._labelGapErrors ||= new Map();

        const toggle = section.querySelector('.lg-toggle');
        toggle?.addEventListener('click', (e) => {
            e.preventDefault();
            this._labelGapCollapsed = !this._labelGapCollapsed;
            this._rerenderLabelGap();
        });

        section.querySelectorAll('.lg-sort-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this._labelGapSort = btn.dataset.sort;
                this._rerenderLabelGap();
            });
        });

        section.querySelectorAll('.lg-row').forEach((row) => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.lg-refresh') || e.target.closest('.lg-retry') || e.target.closest('a')) return;
                this._toggleLabelGapRow(row.dataset.label);
            });
            row.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this._toggleLabelGapRow(row.dataset.label); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); row.nextElementSibling?.focus(); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); row.previousElementSibling?.focus(); }
            });
        });

        section.querySelectorAll('.lg-refresh').forEach((a) => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._loadLabelGap(a.dataset.label, { refresh: true, expand: true });
            });
        });
        section.querySelectorAll('.lg-open-label').forEach((a) => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.navigate({ view: 'label', name: a.dataset.label });
            });
        });
        section.querySelectorAll('.lg-retry').forEach((a) => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._loadLabelGap(a.dataset.label, { expand: true });
            });
        });

        section.querySelectorAll('.lg-label-tile').forEach((tile) => {
            const go = () => {
                this.filterEngine.setFilter('labels', [tile.dataset.label]);
                this.loadView('collection');
            };
            tile.addEventListener('click', go);
            tile.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
            });
        });
    }

    async _toggleLabelGapRow(labelName) {
        if (!labelName) return;
        if (this._labelGapExpanded.has(labelName)) {
            this._labelGapExpanded.delete(labelName);
            this._rerenderLabelGap();
            return;
        }
        this._labelGapExpanded.add(labelName);
        const cached = this.labelGap._catalogueCache.get(labelName);
        if (cached) {
            this._rerenderLabelGap();
            return;
        }
        await this._loadLabelGap(labelName, { expand: true });
    }

    async _loadLabelGap(labelName, { refresh = false, expand = false } = {}) {
        const bucket = this._labelGapBuckets?.get(labelName);
        if (!bucket) return;
        if (expand) this._labelGapExpanded.add(labelName);
        this._labelGapStatus.set(labelName, 'loading');
        this._labelGapErrors.delete(labelName);
        this._rerenderLabelGap();
        try {
            if (refresh) this.labelGap.clearCacheFor(labelName);
            await this.labelGap.getGap(labelName, bucket, { refresh });
            this._labelGapStatus.set(labelName, 'idle');
        } catch (err) {
            const msg = err.code === 'no-match' ? 'Not found on Discogs'
                : err.code === 'disconnected' ? 'Connect Discogs in Settings'
                : err.code === 'rate-limit' ? 'Discogs rate-limited — try again shortly'
                : 'Lookup failed';
            console.warn('LabelGap:', err);
            this._labelGapStatus.set(labelName, 'error');
            this._labelGapErrors.set(labelName, msg);
        }
        this._rerenderLabelGap();
    }

    _rerenderLabelGap() {
        const contentArea = document.getElementById('contentArea');
        if (!contentArea) return;
        const existing = contentArea.querySelector('.label-gap-section');
        if (!existing || !this._labelGapBuckets) return;
        const buckets = [...this._labelGapBuckets.values()];
        const html = this._renderLabelGapSection(buckets);
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        existing.replaceWith(tmp.firstElementChild);
        this._wireLabelGapSection(contentArea);
    }

    // ── Dedup Inspector ──

    async loadDuplicatesView() {
        const routeIsStale = this._routeIsStale || (() => false);
        this._loadDuplicatesViewGuard ||= createStaleGuard();
        const loadIsStale = this._loadDuplicatesViewGuard.begin();
        const isStale = () => routeIsStale() || loadIsStale();
        const viewTitle = document.getElementById('viewTitle');
        const viewSubtitle = document.getElementById('viewSubtitle');
        const contentArea = document.getElementById('contentArea');

        viewTitle.textContent = 'Duplicates';

        // Force a merge so _dedupClusters is populated, even on first load.
        await this._allTracks();
        if (isStale()) return;
        const clusters = [...(this._dedupClusters?.values() || [])];

        let hiddenRows = 0;
        let rbRb = 0, rbBc = 0, mixed = 0;
        for (const c of clusters) {
            hiddenRows += c.siblings.length;
            if (c.kind === 'rb-rb') rbRb++;
            else if (c.kind === 'rb-bc') rbBc++;
            else mixed++;
        }

        viewSubtitle.textContent = `${clusters.length} cluster${clusters.length === 1 ? '' : 's'}, ${hiddenRows} row${hiddenRows === 1 ? '' : 's'} hidden in Collection`;

        if (clusters.length === 0) {
            contentArea.innerHTML = `
                <div class="empty-state">
                    <h3>No duplicates detected</h3>
                    <p>The matcher didn't find any Bandcamp ↔ Rekordbox overlaps or repeated Rekordbox rows.</p>
                </div>
            `;
            return;
        }

        // Sort: largest clusters first, then alphabetically by primary artist/title.
        clusters.sort((a, b) => {
            const sa = a.siblings.length + 1;
            const sb = b.siblings.length + 1;
            if (sa !== sb) return sb - sa;
            const na = `${a.primary.artist || ''}|${a.primary.title || ''}`.toLowerCase();
            const nb = `${b.primary.artist || ''}|${b.primary.title || ''}`.toLowerCase();
            return na.localeCompare(nb);
        });

        const PAGE = 50;
        this._dedupShown = PAGE;

        const row = (t, isPrimary) => {
            const fmtDur = t.duration ? `${Math.floor(t.duration / 60)}:${String(Math.floor(t.duration % 60)).padStart(2, '0')}` : '';
            return `
                <tr class="${isPrimary ? 'dedup-primary' : ''}">
                    <td>${isPrimary ? '<span class="dedup-star" title="Primary">★</span>' : ''}</td>
                    <td>${this.escapeHtml(t.artist || '')}</td>
                    <td>${this.escapeHtml(t.title || '')}</td>
                    <td>${this.escapeHtml(t.album || '')}</td>
                    <td><span class="source-badge source-${t.source || t.platform}">${t.source || t.platform || ''}</span></td>
                    <td>${fmtDur}</td>
                    <td>${t.year || ''}</td>
                </tr>
            `;
        };

        const renderClusterCard = (c) => {
            const rows = [row(c.primary, true), ...c.siblings.map((s) => row(s, false))].join('');
            return `
                <div class="dedup-card">
                    <div class="dedup-card-header">
                        <span class="dedup-kind dedup-kind-${c.kind}">${c.kind}</span>
                        <span class="dedup-count">${c.siblings.length + 1} rows</span>
                        <a href="#" class="dedup-view-link" data-artist="${this.escapeHtml(c.primary.artist || '')}">View in Collection</a>
                    </div>
                    <table class="library-table dedup-table">
                        <thead><tr><th></th><th>Artist</th><th>Title</th><th>Album</th><th>Source</th><th>Dur</th><th>Year</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
        };

        const rerender = () => {
            const shown = clusters.slice(0, this._dedupShown);
            const more = clusters.length - shown.length;
            contentArea.innerHTML = `
                <div class="stats-row">
                    <div class="stat-card"><h3>${clusters.length}</h3><p>Clusters</p></div>
                    <div class="stat-card"><h3>${hiddenRows}</h3><p>Rows hidden</p></div>
                    <div class="stat-card"><h3>${rbRb}</h3><p>RB ↔ RB</p></div>
                    <div class="stat-card"><h3>${rbBc + mixed}</h3><p>RB ↔ BC</p></div>
                </div>
                <div class="dedup-list">
                    ${shown.map(renderClusterCard).join('')}
                </div>
                ${more > 0 ? `<div class="dedup-more"><button class="btn btn-sm" id="dedupShowMore">Show 50 more (${more} remaining)</button></div>` : ''}
            `;

            contentArea.querySelectorAll('.dedup-view-link').forEach((a) => {
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    const artist = a.dataset.artist;
                    if (artist) this.filterEngine.setFilter('artists', [artist]);
                    this.loadView('collection');
                });
            });
            document.getElementById('dedupShowMore')?.addEventListener('click', () => {
                this._dedupShown += PAGE;
                rerender();
            });
        };

        rerender();
    }

    // ── Import View ──

    // Tools → File paths. Check is read-only: the server walks the library
    // roots and classifies every stored path that no longer points at a file.
    // Rewrite sends the reviewed picks with the check's plan; the server
    // rechecks, backs up the database and changes rows only, never files
    // (stale stored paths spec, "Check, rewrite and undo"). Rows changed, so the
    // in-memory collection is dropped and reloads on next view.
    _wirePathRepair() {
        const checkBtn = document.getElementById('pathRepairCheckBtn');
        const status = document.getElementById('pathRepairStatus');
        const out = document.getElementById('pathRepairReport');
        if (!checkBtn || !status || !out) return;

        const setStatus = (text, error = false) => {
            status.classList.toggle('error', error);
            status.textContent = text;
        };
        const showUndo = (result, report) => {
            out.innerHTML = renderRewriteResult(result, report);
            out.querySelector('[data-paths-undo]')?.addEventListener('click', async (event) => {
                const undoBtn = event.currentTarget;
                undoBtn.disabled = true;
                undoBtn.textContent = 'Undoing…';
                try {
                    const undone = await postPathRewriteUndo(result.rewriteId);
                    this._tracksCache = null;
                    setStatus(undoSummary(undone));
                    out.innerHTML = renderUndoResult(undone, report);
                } catch (err) {
                    console.error('Path rewrite undo failed:', err);
                    setStatus(`Undo failed: ${err.message}`, true);
                    undoBtn.disabled = false;
                    undoBtn.textContent = 'Undo';
                }
            });
        };

        checkBtn.addEventListener('click', async () => {
            checkBtn.disabled = true;
            setStatus('Checking…');
            out.innerHTML = '';
            try {
                const report = await fetchPathReport();
                status.textContent = totalsLine(report.totals);
                out.innerHTML = renderPathReport(report);
                wirePathSelection(out, {
                    threshold: report.confirmThreshold ?? CONFIRM_THRESHOLD,
                    onRewrite: async (picks, confirm) => {
                        checkBtn.disabled = true;
                        try {
                            const result = await postPathRewrite({ planId: report.planId, picks, confirm });
                            this._tracksCache = null;
                            setStatus(rewriteSummary(result));
                            showUndo(result, report);
                        } catch (err) {
                            console.error('Path rewrite failed:', err);
                            setStatus(rewriteErrorLine(err), true);
                        } finally {
                            checkBtn.disabled = false;
                        }
                    },
                });
            } catch (err) {
                console.error('Path check failed:', err);
                status.classList.add('error');
                status.textContent = err.code === 'EINCOMPLETE'
                    ? `Couldn't finish: ${err.message}. Nothing was classified.`
                    : `Check failed: ${err.message}`;
            } finally {
                checkBtn.disabled = false;
            }
        });
    }

    /** Other imports card: Playlist XML…, the file pickers, Bandcamp Scan and Discogs Import Collection. */
    _setupOtherImports(isStale = () => false) {
        document.getElementById('rekordboxPlaylistsBtn')?.addEventListener('click', () => this.navigate({ view: 'playlists' }));
        document.getElementById('rekordboxCSVPickBtn')?.addEventListener('click', () => document.getElementById('rekordboxCSVInput')?.click());
        document.getElementById('shazamCSVPickBtn')?.addEventListener('click', () => document.getElementById('shazamCSVInput')?.click());
        document.getElementById('bandcampJSONPickBtn')?.addEventListener('click', () => document.getElementById('bandcampFileInput')?.click());

        document.getElementById('bandcampScanBtn')?.addEventListener('click', async () => {
            const input = document.getElementById('bandcampUsernameInput');
            const status = document.getElementById('bandcampImportStatus');
            const user = (input.value || '').trim();
            if (!user) { status.textContent = 'Enter a username.'; return; }
            const btn = document.getElementById('bandcampScanBtn');
            btn.disabled = true; status.textContent = 'Scanning...';
            try {
                const res = await fetch('/api/bandcamp/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user }) });
                if (isStale()) return;
                if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Error ${res.status}`); }
                const data = await res.json();
                if (isStale()) return;
                const result = await this.integrationManager.importBandcampData(data);
                if (isStale()) return;
                this._invalidateTracks();
                status.textContent = bandcampImportSummary(result); status.className = result.accountsKept ? 'import-status error' : 'import-status';
            } catch (err) {
            if (isStale()) return; status.textContent = err.message; status.className = 'import-status error'; }
            finally { btn.disabled = false; }
        });

        document.getElementById('bandcampFileInput')?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            const status = document.getElementById('bandcampImportStatus');
            try {
                const result = await this.integrationManager.importBandcampData(await file.text());
                if (isStale()) return;
                this._invalidateTracks();
                status.textContent = bandcampImportSummary(result); status.className = result.accountsKept ? 'import-status error' : 'import-status';
            } catch (err) {
            if (isStale()) return; status.textContent = err.message; status.className = 'import-status error'; }
            e.target.value = '';
        });

        this._wireDiscogsImport(isStale);
    }

    /** Other imports' Discogs → Import Collection; rewired when the block is redrawn. */
    _wireDiscogsImport(isStale = () => false) {
        document.getElementById('discogsImportBtn')?.addEventListener('click', async () => {
            const btn = document.getElementById('discogsImportBtn');
            const status = document.getElementById('discogsImportStatus');
            btn.disabled = true; status.textContent = 'Fetching...';
            try {
                const tracks = await this.integrationManager.importDiscogsCollection({
                    onProgress: ({ completed, total, title }) => {
                        if (!isStale()) status.textContent = title
                            ? `Reading tracklists ${completed + 1}/${total}: ${title}`
                            : `Saving tracks from ${total} releases…`;
                    },
                });
                if (isStale()) return;
                this._invalidateTracks();
                status.textContent = `Imported ${tracks.length} tracks from Discogs.`;
                btn.disabled = false;
            } catch (err) {
            if (isStale()) return; status.textContent = err.message; status.className = 'import-status error'; btn.disabled = false; }
        });
    }

    _setupCSVListeners() {
        document.getElementById('rekordboxCSVInput')?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            const status = document.getElementById('csvImportStatus');
            const isXML = file.name.toLowerCase().endsWith('.xml');
            try {
                const text = await file.text();
                const tracks = isXML
                    ? await this.integrationManager.importRekordboxXML(text)
                    : await this.integrationManager.importRekordboxCSV(text);
                this._invalidateTracks();
                status.textContent = `Imported ${tracks.length} Rekordbox tracks.`; status.className = 'import-status';
            } catch (err) { status.textContent = err.message; status.className = 'import-status error'; }
            e.target.value = '';
        });

        document.getElementById('shazamCSVInput')?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            const status = document.getElementById('csvImportStatus');
            try {
                const tracks = await this.integrationManager.importShazamCSV(await file.text());
                this._invalidateTracks();
                status.textContent = `Imported ${tracks.length} Shazam tracks.`; status.className = 'import-status';
            } catch (err) { status.textContent = err.message; status.className = 'import-status error'; }
            e.target.value = '';
        });
    }

    // ── Library View ──

    async loadLibraryView() {
        const viewTitle = document.getElementById('viewTitle');
        const viewSubtitle = document.getElementById('viewSubtitle');
        const contentArea = document.getElementById('contentArea');

        viewTitle.textContent = 'Library';
        viewSubtitle.textContent = 'On-disk DJ library + lossless archive';

        contentArea.innerHTML = `
            <div class="library-actions">
                <button class="btn btn-secondary" id="libraryRescanBtn">Rescan</button>
                <span class="muted" id="libraryScanInfo">Loading…</span>
            </div>
            <div id="libraryContent"><div class="loading">Scanning…</div></div>
        `;

        // per-section render state: how many rows are currently visible
        this._libraryPageSize = 50;
        this._libraryVisible = { mp3Only: 50, flacOnly: 50, pairs: 0 };
        this._libraryData = null;

        const fmtBytes = (n) => {
            if (!n) return '—';
            const gb = n / (1024 ** 3);
            if (gb >= 1) return `${gb.toFixed(1)} GB`;
            const mb = n / (1024 ** 2);
            if (mb >= 1) return `${mb.toFixed(0)} MB`;
            return `${(n / 1024).toFixed(0)} KB`;
        };
        const fmtRelative = (ts) => {
            const s = Math.max(1, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
            if (s < 60) return `${s}s ago`;
            if (s < 3600) return `${Math.round(s / 60)}m ago`;
            if (s < 86400) return `${Math.round(s / 3600)}h ago`;
            return `${Math.round(s / 86400)}d ago`;
        };
        const fmtDate = (ts) => {
            if (!ts) return '—';
            return new Date(ts).toISOString().slice(0, 10);
        };

        const render = (data) => {
            this._libraryData = data;
            const info = document.getElementById('libraryScanInfo');
            const content = document.getElementById('libraryContent');
            if (!info || !content) return;
            const { summary, paths, scannedAt, elapsedMs, cached } = data;
            info.textContent = `${cached ? 'cached' : 'fresh'} · scanned ${fmtRelative(scannedAt)} · ${elapsedMs}ms`;
            info.title = new Date(scannedAt).toLocaleString();

            content.innerHTML = `
                <div class="stats-row">
                    <div class="stat-card"><h3>${summary.mp3Total}</h3><p>MP3 total</p></div>
                    <div class="stat-card"><h3>${summary.flacTotal}</h3><p>FLAC total</p></div>
                    <div class="stat-card"><h3>${summary.paired}</h3><p>Paired</p></div>
                    <div class="stat-card"><h3>${summary.mp3Only}</h3><p>MP3 only</p></div>
                    <div class="stat-card"><h3>${summary.flacOnly}</h3><p>FLAC only</p></div>
                    <div class="stat-card"><h3>${fmtBytes(summary.mp3Bytes)}</h3><p>MP3 size</p></div>
                    <div class="stat-card"><h3>${fmtBytes(summary.flacBytes)}</h3><p>FLAC size</p></div>
                </div>

                <div class="library-paths muted">
                    <div>LIBRARY_DIR: <code>${this.escapeHtml(paths.library)}</code></div>
                    <div>LOSSLESS_DIR: <code>${this.escapeHtml(paths.lossless)}</code></div>
                </div>

                <div id="librarySections"></div>
            `;
            this._renderLibrarySections();
        };

        const fetchScan = async (force = false) => {
            const content = document.getElementById('libraryContent');
            try {
                const url = `/api/library/scan${force ? '?force=1' : ''}`;
                const res = await fetch(url);
                if (!res.ok) {
                    let msg = `Scan failed (${res.status})`;
                    try { const data = await res.json(); if (data.error) msg = data.error; } catch {}
                    throw new Error(msg);
                }
                const data = await res.json();
                render(data);
            } catch (err) {
                // network/connect error → backend not running
                const isNetErr = err instanceof TypeError;
                content.innerHTML = isNetErr
                    ? `<div class="empty-state"><h3>Backend not running</h3><p class="muted">Start the server with <code>cd server && npm run dev</code> to scan the library.</p></div>`
                    : `<div class="empty-state"><h3>Scan failed</h3><p>${this.escapeHtml(err.message)}</p></div>`;
                const info = document.getElementById('libraryScanInfo');
                if (info) info.textContent = '';
            }
        };

        // stash helpers so _renderLibrarySections / click handlers can reach them
        this._libraryFmt = { fmtBytes, fmtDate };

        document.getElementById('libraryRescanBtn').addEventListener('click', async (e) => {
            e.target.disabled = true;
            document.getElementById('libraryScanInfo').textContent = 'Scanning…';
            await fetchScan(true);
            e.target.disabled = false;
        });

        // delegated clicks for "Show more" / collapsed pairs expander
        contentArea.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-library-action]');
            if (!btn) return;
            const action = btn.dataset.libraryAction;
            const bucket = btn.dataset.bucket;
            if (action === 'more') {
                this._libraryVisible[bucket] += this._libraryPageSize;
            } else if (action === 'expand') {
                this._libraryVisible[bucket] = this._libraryPageSize;
            } else if (action === 'collapse') {
                this._libraryVisible[bucket] = 0;
            }
            this._renderLibrarySections();
        });

        await fetchScan(false);
    }

    _renderLibrarySections() {
        const host = document.getElementById('librarySections');
        if (!host || !this._libraryData) return;
        const { mp3Only, flacOnly, pairs } = this._libraryData;
        host.innerHTML = `
            ${this._renderLibrarySection(
                'MP3 without lossless',
                `In the DJ library but no archived FLAC — can't be re-derived if the MP3 is lost.`,
                mp3Only, 'mp3Only', 'warn', 'mp3'
            )}
            ${this._renderLibrarySection(
                'FLAC without MP3',
                `Lossless archived but no MP3 — won't show up in Rekordbox or day-to-day library.`,
                flacOnly, 'flacOnly', 'warn', 'flac'
            )}
            ${this._renderLibrarySection(
                'Paired',
                `MP3 ↔ FLAC pairs. Collapsed by default — this list can be large.`,
                pairs, 'pairs', 'normal', 'pair'
            )}
        `;
    }

    _renderLibrarySection(title, description, items, bucket, severity, kind) {
        const { fmtBytes, fmtDate } = this._libraryFmt;
        const visible = this._libraryVisible[bucket] || 0;
        const shown = items.slice(0, visible);
        const remaining = items.length - shown.length;

        // pick the file node to show per row (mp3 for pairs + mp3Only, flac for flacOnly)
        const pickFile = (it) => kind === 'flac' ? it.flac : (it.mp3 || it.flac);

        const rows = shown.map((it) => {
            const f = pickFile(it) || {};
            return `
                <tr>
                    <td>${this.escapeHtml(it.artist)}</td>
                    <td>${this.escapeHtml(it.album)}</td>
                    <td>${this.escapeHtml(it.stem)}</td>
                    <td class="num">${fmtBytes(f.size)}</td>
                    <td>${fmtDate(f.mtime)}</td>
                </tr>
            `;
        }).join('');

        const controls = [];
        if (items.length === 0) {
            // nothing to do
        } else if (visible === 0) {
            controls.push(`<button class="btn btn-secondary btn-sm" data-library-action="expand" data-bucket="${bucket}">Show first ${this._libraryPageSize}</button>`);
        } else {
            if (remaining > 0) {
                const next = Math.min(this._libraryPageSize, remaining);
                controls.push(`<button class="btn btn-secondary btn-sm" data-library-action="more" data-bucket="${bucket}">Show ${next} more (${remaining} remaining)</button>`);
            }
            controls.push(`<button class="btn btn-secondary btn-sm" data-library-action="collapse" data-bucket="${bucket}">Collapse</button>`);
        }

        return `
            <div class="library-section ${severity}">
                <h3>${title} <span class="library-count">${items.length}</span></h3>
                <p class="muted">${description}</p>
                ${items.length === 0 ? '<p class="muted">None.</p>' : `
                    ${visible > 0 ? `
                        <div class="library-table-wrapper">
                            <table class="library-table">
                                <thead><tr><th>Artist</th><th>Album</th><th>Track</th><th class="num">Size</th><th>Modified</th></tr></thead>
                                <tbody>${rows}</tbody>
                            </table>
                        </div>
                    ` : ''}
                    <div class="library-section-controls">${controls.join(' ')}</div>
                `}
            </div>
        `;
    }

    _setupIngestUI() {
        const dropzone = document.getElementById('ingestDropzone');
        const fileInput = document.getElementById('ingestFileInput');
        const browseBtn = document.getElementById('ingestBrowseBtn');
        const rescanBtn = document.getElementById('runIngestBtn');
        const status = document.getElementById('ingestStatus');
        const activeList = document.getElementById('ingestActive');
        const errorList = document.getElementById('ingestErrors');
        const totalsEl = document.getElementById('ingestTotals');
        const inboxCount = document.getElementById('ingestInboxCount');
        const inboxFiles = document.getElementById('ingestInboxFiles');
        const watcherWarning = document.getElementById('ingestWatcherWarning');
        if (!dropzone) return;

        // A dead watcher is silent by nature: files land in the inbox and simply
        // never get picked up. Say so, and point at the manual path out.
        const showWatcherStopped = (detail) => {
            if (!watcherWarning) return;
            watcherWarning.textContent = `Inbox watcher stopped${detail ? ` (${detail})` : ''}. `
                + `Dropped files won't be picked up automatically — use “Scan inbox”, or restart the server.`;
            watcherWarning.hidden = false;
        };

        // Human labels for engine stage values.
        const STAGE_LABELS = {
            'reading-tags': 'Reading tags',
            'converting': 'Converting to MP3',
            'archiving': 'Archiving FLAC',
            'organizing': 'Organizing',
            'uploading': 'Uploading',
            'starting': 'Starting…',
        };

        const rows = new Map();   // filename → active <li>
        const errs = new Map();   // filename → error <li>
        let totals = { total: 0, done: 0, errors: 0 };

        const fmtSize = (n) => {
            if (!n) return '—';
            if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
            return `${Math.round(n / 1024)} KB`;
        };

        const renderTotals = () => {
            if (totals.total === 0) { totalsEl.textContent = ''; return; }
            const pending = Math.max(0, totals.total - totals.done - totals.errors);
            totalsEl.textContent = `${totals.done}/${totals.total} done · ${totals.errors} error${totals.errors === 1 ? '' : 's'} · ${pending} pending`;
        };

        const renderIdle = () => {
            activeList.innerHTML = `<li class="ingest-row muted">Idle — waiting for new files</li>`;
            rows.clear();
        };

        const rekordboxCountEl = document.getElementById('rekordboxPendingCount');
        const rekordboxHintEl = document.getElementById('rekordboxPendingHint');
        const rekordboxStatusEl = document.getElementById('rekordboxStatus');
        let rekordboxPaths = null;

        const refreshRekordboxPending = async () => {
            if (!rekordboxCountEl) return;
            try {
                const res = await fetch('/api/ingest/rekordbox/pending');
                const data = await res.json();
                rekordboxPaths = data.paths || null;
                rekordboxCountEl.textContent = data.count === 0 ? 'none queued' : `${data.count} track${data.count === 1 ? '' : 's'} queued`;
            } catch {
                rekordboxCountEl.textContent = 'unavailable';
            }
        };

        const refreshInbox = async () => {
            try {
                const res = await fetch('/api/ingest/inbox');
                const data = await res.json();
                const unsupported = data.unsupported || [];
                const total = data.count + unsupported.length;
                inboxCount.textContent = total === 0 ? 'empty' : `${total} file${total === 1 ? '' : 's'}`;
                if (data.watcher === 'stopped') showWatcherStopped();
                else if (watcherWarning) watcherWarning.hidden = true;
                if (total === 0) {
                    inboxFiles.innerHTML = `<li class="muted">Inbox is empty</li>`;
                    return;
                }
                const row = (name, detail) =>
                    `<li><span class="ingest-inbox-name">${this.escapeHtml(name)}</span><span class="muted">${detail}</span></li>`;
                inboxFiles.innerHTML = [
                    ...data.files.map((f) => row(f.name, fmtSize(f.size))),
                    ...unsupported.map((f) => row(f.name, 'Not supported')),
                ].join('');
            } catch (err) {
                inboxCount.textContent = 'unavailable';
            }
        };

        const ensureRow = (name) => {
            let li = rows.get(name);
            if (!li) {
                // Clear the idle placeholder if present.
                if (activeList.querySelector('.ingest-row.muted')) activeList.innerHTML = '';
                li = document.createElement('li');
                li.className = 'ingest-row';
                li.innerHTML = `<span class="ingest-name"></span><span class="ingest-stage">queued</span>`;
                li.querySelector('.ingest-name').textContent = name;
                activeList.appendChild(li);
                rows.set(name, li);
            }
            return li;
        };
        const setStage = (name, stageText, cls = '') => {
            const li = ensureRow(name);
            li.querySelector('.ingest-stage').textContent = stageText;
            li.className = `ingest-row ${cls}`.trim();
        };
        const removeRow = (name) => {
            const li = rows.get(name);
            if (li) { li.remove(); rows.delete(name); }
        };
        const clearError = (name) => {
            const li = errs.get(name);
            if (li) { li.remove(); errs.delete(name); }
        };
        const addError = (name, message, inboxPath = name) => {
            clearError(name);
            const li = document.createElement('li');
            li.className = 'ingest-error-row';
            const ts = new Date().toLocaleTimeString();
            li.innerHTML = `
                <span class="ingest-name"></span>
                <span class="ingest-error-msg"></span>
                <span class="muted ingest-error-ts">${ts}</span>
                <button type="button" class="btn btn-sm ingest-retry-btn">Retry</button>
                <button type="button" class="btn btn-link ingest-dismiss-btn" title="Dismiss" aria-label="Dismiss">×</button>
            `;
            li.querySelector('.ingest-name').textContent = name;
            li.querySelector('.ingest-error-msg').textContent = message;
            li.querySelector('.ingest-retry-btn').addEventListener('click', async () => {
                const btn = li.querySelector('.ingest-retry-btn');
                btn.disabled = true;
                try {
                    const res = await fetch('/api/ingest/retry', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filename: inboxPath }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Retry failed');
                } catch (err) {
                    btn.disabled = false;
                    li.querySelector('.ingest-error-msg').textContent = err.message;
                }
            });
            li.querySelector('.ingest-dismiss-btn').addEventListener('click', () => clearError(name));
            errorList.appendChild(li);
            errs.set(name, li);
        };

        // Subscribe to SSE stream (one per view load; EventSource auto-reconnects)
        if (this._ingestSSE) { try { this._ingestSSE.close(); } catch {} }
        try {
            const es = new EventSource('/api/ingest/events');
            this._ingestSSE = es;
            es.onmessage = (ev) => {
                let evt; try { evt = JSON.parse(ev.data); } catch { return; }
                switch (evt.type) {
                    case 'run:start':
                        totals = { total: evt.count || 0, done: 0, errors: 0 };
                        renderTotals();
                        if (evt.count > 0) status.textContent = `Processing ${evt.count} file(s)...`;
                        break;
                    case 'run:skipped':
                        // Watcher fired while a run was active; engine will pick up new files
                        // on the next tick. Nothing to show — surfacing it would just confuse.
                        break;
                    case 'watcher:error':
                        showWatcherStopped(evt.code || evt.error);
                        break;
                    case 'file:start':
                        setStage(evt.file, STAGE_LABELS.starting, 'active');
                        break;
                    case 'file:stage': {
                        const label = STAGE_LABELS[evt.stage] || evt.stage;
                        setStage(evt.file, `${label}…`, 'active');
                        break;
                    }
                    case 'file:done':
                        totals.done += 1;
                        renderTotals();
                        removeRow(evt.file);
                        clearError(evt.file); // a successful retry wipes the error
                        refreshInbox();
                        refreshRekordboxPending();
                        // The engine wrote the song's track row; the next view reads it.
                        if (evt.trackId) this._invalidateTracks();
                        break;
                    case 'file:error':
                        totals.errors += 1;
                        renderTotals();
                        removeRow(evt.file);
                        addError(evt.file, evt.error || 'Unknown error', evt.inboxPath || evt.file);
                        refreshInbox();
                        break;
                    case 'run:done':
                        status.textContent = `Done. ${evt.processed} processed${evt.errors?.length ? `, ${evt.errors.length} error(s)` : ''}.`;
                        if (rows.size === 0) renderIdle();
                        refreshInbox();
                        break;
                }
            };
        } catch (err) { console.warn('SSE unavailable:', err); }

        const uploadFiles = async (fileList) => {
            const files = [...fileList];
            if (!files.length) return;
            for (const f of files) setStage(f.name, `${STAGE_LABELS.uploading}…`, 'active');
            const fd = new FormData();
            for (const f of files) fd.append('files', f);
            status.textContent = `Uploading ${files.length} file(s)...`;
            try {
                const res = await fetch('/api/ingest/upload', { method: 'POST', body: fd });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
                status.textContent = `Uploaded ${data.received} file(s), processing...`;
                refreshInbox();
            } catch (err) {
                status.textContent = err.message;
                status.className = 'import-status error';
                for (const f of files) {
                    removeRow(f.name);
                    addError(f.name, err.message);
                }
            }
        };

        refreshInbox();
        refreshRekordboxPending();
        renderIdle();

        document.getElementById('rekordboxClearBtn')?.addEventListener('click', async () => {
            const btn = document.getElementById('rekordboxClearBtn');
            btn.disabled = true;
            try {
                const res = await fetch('/api/ingest/rekordbox/clear', { method: 'POST' });
                if (!res.ok) throw new Error(`Error ${res.status}`);
                rekordboxStatusEl.textContent = 'Cleared.';
                rekordboxStatusEl.className = 'import-status';
                refreshRekordboxPending();
            } catch (err) {
                rekordboxStatusEl.textContent = err.message;
                rekordboxStatusEl.className = 'import-status error';
            } finally { btn.disabled = false; }
        });

        document.getElementById('rekordboxOpenFolderBtn')?.addEventListener('click', () => {
            if (!rekordboxPaths) { rekordboxStatusEl.textContent = 'No paths yet.'; return; }
            rekordboxHintEl.innerHTML = `
                Folder: <code>${this.escapeHtml(rekordboxPaths.dir)}</code><br>
                M3U: <code>${this.escapeHtml(rekordboxPaths.m3u8)}</code><br>
                XML: <code>${this.escapeHtml(rekordboxPaths.xml)}</code>
            `;
        });

        browseBtn?.addEventListener('click', () => fileInput.click());
        fileInput?.addEventListener('change', (e) => { uploadFiles(e.target.files); e.target.value = ''; });

        ['dragenter', 'dragover'].forEach(evt => dropzone.addEventListener(evt, (e) => {
            e.preventDefault(); e.stopPropagation(); dropzone.classList.add('drag-over');
        }));
        ['dragleave', 'drop'].forEach(evt => dropzone.addEventListener(evt, (e) => {
            e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('drag-over');
        }));
        dropzone.addEventListener('drop', (e) => {
            if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files);
        });

        rescanBtn?.addEventListener('click', async () => {
            rescanBtn.disabled = true;
            status.textContent = 'Scanning inbox...';
            status.className = 'import-status';
            try {
                const res = await fetch('/api/ingest/run', { method: 'POST' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Server error');
                if (data.processed === 0) status.textContent = 'Inbox is empty.';
            } catch (err) {
                status.textContent = err.message;
                status.className = 'import-status error';
            } finally { rescanBtn.disabled = false; }
        });
    }

    // ── Smart Crates ──

    // Shared drift check: if the live filter state no longer matches the active crate,
    // stash it as _modifiedCrate so UI surfaces (header pill + sidebar) stay in sync.
    async _syncActiveCrateState() {
        if (!this.crateManager || !this._activeCrateId) return;
        const active = await this.crateManager.get(this._activeCrateId);
        if (!active) {
            this._activeCrateId = null;
            this._modifiedCrate = null;
            return;
        }
        if (!sameFilter(active.filterState, this.filterEngine.state)) {
            this._modifiedCrate = { id: active.id, name: active.name };
            this._activeCrateId = null;
        }
    }

    /** Refresh the saved filters behind the band's Saved row (and the
     *  line's name), then repaint the header. Kept under its old name: other
     *  modules call it after changing a crate. */
    async renderCratesSidebar() {
        if (!this.crateManager || VIEWER) return;
        const crates = await this.crateManager.list();
        // Drop the active highlight if the live filter no longer matches the
        // saved one; the line then shows its name marked modified.
        if (this._activeCrateId) {
            const active = crates.find((c) => c.id === this._activeCrateId);
            if (!active) {
                this._activeCrateId = null;
                this._modifiedCrate = null;
            } else if (!sameFilter(active.filterState, this.filterEngine.state)) {
                this._modifiedCrate = { id: active.id, name: active.name };
                this._activeCrateId = null;
            }
        }
        this._crates = crates;
        this._repaintCollectionHeader();
    }

    /** The saved filter in use (the band's lit chip, the line's name) is kept
     *  per scope. Collection, Exploreme and Charts share one, as they always have. */
    _swapScopeCrate(from, to) {
        const group = (scope) => (['exploreme', 'charts'].includes(scope) ? 'collection' : scope || 'collection');
        if (group(from) === group(to)) return;
        this._scopeCrates ||= {};
        this._scopeCrates[group(from)] = { active: this._activeCrateId, modified: this._modifiedCrate };
        const kept = this._scopeCrates[group(to)];
        this._activeCrateId = kept?.active || null;
        this._modifiedCrate = kept?.modified || null;
    }

    /** Stashed is on while its `stash` tag is in the filter: clearing the filter,
     *  loading another one or removing the tag leaves it. */
    _stashedOnly() {
        if (!this._includeStashed) return false;
        if ((this.filterEngine?.state?.tags || []).some((t) => String(t).toLowerCase() === STASH_TOKEN)) return true;
        this._includeStashed = false;
        Promise.resolve(this.integrationManager?.database?.saveSetting?.('include_stashed', false)).catch(() => {});
        return false;
    }

    /** Activate a pinned built-in filter (Exploreme, Stashed). */
    async _loadPinnedFilter(id) {
        if (id !== 'exploreme' && id !== 'stashed') return;
        this._activeCrateId = null;
        this._modifiedCrate = null;
        this.filterEngine.clearAll();
        const db = this.integrationManager?.database;
        if (id === 'exploreme') {
            // Reveal default-excluded exploreme rows + narrow to them.
            this._includeExploreme = true;
            try { await db?.saveSetting('include_exploreme', true); } catch (_) {}
            this.filterEngine.setFilter('tags', ['exploreme']);
        } else {
            // Only the stashed rows, while the `stash` tag stays in the filter.
            this._includeStashed = true;
            try { await db?.saveSetting('include_stashed', true); } catch (_) {}
            this.filterEngine.setFilter('tags', [STASH_TOKEN]);
        }
        if (this._filterScopes) {
            this._filterScopes.collection = this._cloneFilterState(this.filterEngine.state);
        }
        this._activeFilterScope = 'collection';
        this.loadView('collection');
    }

    // Every favourites mark, read again before each render that shows the ☆ and ♡
    // column, so the rows draw without a per-row lookup. A failed read keeps the last.
    async _refreshFavoritedTrackIds() {
        try { await this.marks.load(); } catch (_) { /* keep the last read */ }
    }

    /** Shortlist view (P1.2) — delegate to the module. */
    async loadShortlistView() {
        if (!this._shortlistView) this._shortlistView = new ShortlistView({ app: this });
        await this._shortlistView.render();
    }

    /** Tools' shared list: Tagging, Cleanup › Formatting and Missing fields (tool-list.js). */
    async loadToolListView(view) {
        document.getElementById('viewTitle').textContent = toolListTitle(view);
        document.getElementById('viewSubtitle').textContent = '';
        this._toolList?.destroy();
        this._toolList = new ToolListView({ app: this });
        await this._toolList.render(document.getElementById('contentArea'), this._route?.view === view ? this._route : { view });
    }

    /** Cleanup › Discogs: pick the Discogs match of ambiguous artists and labels (identity-tool.js). */
    async loadIdentitiesView() {
        document.getElementById('viewTitle').textContent = 'Cleanup';
        document.getElementById('viewSubtitle').textContent = '';
        await new IdentityListView({ app: this }).render(document.getElementById('contentArea'), this._route?.view === 'identities' ? this._route : { view: 'identities' });
    }

    // Gig views live in gig-view.js (gig membership Phase 0). These delegates
    // keep the router, track actions and the [data-gig-new] handlers unchanged.
    get _gigView() { return this.__gigView ||= new GigView({ app: this }); }
    loadGigsView() { return this._gigView.render(); }
    _openGigLanePicker(trackIds, opts) { return this._gigView.openLanePicker(trackIds, opts); }
    _addToPlaylist(trackIds, opts) { return addToPlaylist(this, trackIds, opts); }
    _onCreateGig() { return this._gigView.createGigFromPrompt(); }

    // Right-click on a Collection table row → small action menu pinned at
    // the cursor. Currently single-purpose but structured so we can drop
    // additional row actions in later without rewriting the menu shell.
    // Full-size artwork over a dimmed page. Any click or Escape closes it and
    // focus returns to the thumbnail.
    _openArtOverlay(src, label = '', trigger = null) {
        if (!src) return;
        document.querySelector('.art-overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.className = 'art-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', label || 'Artwork');
        overlay.tabIndex = -1;
        overlay.innerHTML = `<img class="art-overlay-img" src="${escapeHtml(src)}" alt="${escapeHtml(label)}">`;
        const close = () => {
            overlay.remove();
            document.removeEventListener('keydown', onKey, true);
            if (trigger?.isConnected) trigger.focus?.();
        };
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            close();
        };
        overlay.addEventListener('click', close);
        overlay.querySelector('img').addEventListener('error', close, { once: true });
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(overlay);
        overlay.focus();
    }

    // Search and shop links for one track, shared by the Links column, the row
    // menu and the inspector. Direct links win over searches.
    _digTargets(track) {
        const artist = (track.artist || '').trim();
        const album = (track.album || '').trim();
        const title = (track.title || '').trim();
        const aq = encodeURIComponent(artist);
        const albumQ = encodeURIComponent([artist, album].filter(Boolean).join(' '));
        const titleQ = encodeURIComponent([artist, title].filter(Boolean).join(' '));
        const releaseQ = albumQ || titleQ;
        const out = [];
        const ytQuery = [artist, title || album].filter(Boolean).join(' - ');
        if (ytQuery) out.push({ kind: 'yt', href: `https://www.youtube.com/results?search_query=${encodeURIComponent(ytQuery)}`, title: 'Search YouTube', direct: false });
        // Bandcamp searches by artist + track title, not album — album-level
        // results are noisy and the user is usually after a specific track.
        const bcHref = track.bandcamp_url || track._bandcampUrl || (titleQ ? `https://bandcamp.com/search?q=${titleQ}` : null);
        if (bcHref) out.push({ kind: 'bc', href: bcHref, title: track.bandcamp_url ? 'Open on Bandcamp' : track._bandcampUrl ? 'Also on Bandcamp' : 'Search Bandcamp', direct: !!(track.bandcamp_url || track._bandcampUrl) });
        const bpHref = track.beatport_url || (releaseQ ? `https://www.beatport.com/search?q=${releaseQ}` : null);
        if (bpHref) out.push({ kind: 'bp', href: bpHref, title: track.beatport_url ? 'Open on Beatport' : 'Search Beatport', direct: !!track.beatport_url });
        let dcHref = track.discogs_url;
        if (!dcHref) {
            if (albumQ) dcHref = `https://www.discogs.com/search/?q=${albumQ}`;
            else if (titleQ) dcHref = `https://www.discogs.com/search/?q=${titleQ}`;
            else if (aq) dcHref = `https://www.discogs.com/search/?q=${aq}&type=artist`;
        }
        if (dcHref) out.push({ kind: 'dc', href: dcHref, title: track.discogs_url ? 'Open on Discogs' : 'Search Discogs', direct: !!track.discogs_url });
        const tbHref = track.tunebat_url || (titleQ ? `https://tunebat.com/Search?q=${titleQ}` : null);
        if (tbHref) out.push({ kind: 'tb', href: tbHref, title: track.tunebat_url ? 'Open on Tunebat' : 'Search Tunebat', direct: !!track.tunebat_url });
        return out;
    }

    _openRowContextMenu({ trackIds, x, y, source = 'Collection', extra = [] }) {
        document.querySelectorAll('.row-context-menu').forEach((m) => m.remove());
        const menu = document.createElement('div');
        menu.className = 'row-context-menu';
        menu.setAttribute('role', 'menu');
        const items = [...trackActions(this, trackIds), ...extra].filter((item) => item.menu !== false);
        const subOf = items.find((item) => item.submenu)?.submenu || [];
        menu.innerHTML = items.map((item, i) => (item.submenu ? favoritesGroupHtml(item.submenu)
            : `<button type="button" class="row-context-item" data-context-action="${i}" role="menuitem"><span>${escapeHtml(item.label)}</span>${item.key ? `<kbd>${escapeHtml(item.key)}</kbd>` : ''}</button>`)).join('');
        wireFavoritesGroup(menu, subOf);
        document.body.appendChild(menu);
        // In the page's own px: a phone's sideways graph turns the body (phone.js).
        const { w: vw, h: vh } = viewSize();
        const rect = { width: menu.offsetWidth, height: menu.offsetHeight };
        ({ x, y } = viewPoint(x, y));
        const px = Math.min(x, vw - rect.width - 8);
        const py = Math.min(y, vh - rect.height - 8);
        menu.style.left = `${Math.max(4, px)}px`;
        menu.style.top = `${Math.max(4, py)}px`;
        const close = () => {
            menu.remove();
            document.removeEventListener('mousedown', outside, true);
            document.removeEventListener('keydown', onKey, true);
        };
        const outside = (e) => { if (!menu.contains(e.target)) close(); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        // Defer attach so the originating right-click doesn't immediately close it.
        setTimeout(() => {
            document.addEventListener('mousedown', outside, true);
            document.addEventListener('keydown', onKey, true);
        }, 0);
        menu.querySelectorAll('[data-context-action]').forEach((btn) => btn.addEventListener('click', (event) => {
            close();
            const item = items[Number(btn.dataset.contextAction)];
            item.run(visibleActionRunOptions(item, event));
        }));
    }

    // Look tracks up against the UNFILTERED IndexedDB store. Bypasses
    // `bandcamp_exclude_from_library` (applied inside
    // IntegrationManager.getAllTracks) and the merge-time hidden-id pruning
    // in `_computeMerge`. Used only for the gig-export resolve path so a gig
    // built when a track was visible doesn't drop just because the user later
    // toggled a Collection-view setting or re-imported the library.
    async _unfilteredTracksById() {
        const db = this.integrationManager?.database;
        if (!db || typeof db.getTracks !== 'function') {
            const all = await this._allTracks();
            const m = new Map();
            for (const t of all || []) m.set(t.id, t);
            return m;
        }
        const tracks = await db.getTracks();
        const m = new Map();
        for (const t of tracks || []) m.set(t.id, t);
        return m;
    }

    // Resolve a gig's stored trackIds against the unfiltered library and
    // bucket each into resolvable / unresolvable. Each unresolved track gets
    // a reason string the pre-export modal can show.
    //
    // BPM-roll lanes are populated AFTER all other lanes resolve, by taking
    // the union of those lanes' POST-DROP trackIds and sorting by BPM asc.
    // This guarantees BPM never includes tracks that were dropped (no local
    // path, missing from library) elsewhere in the gig.
    _resolveGigTracks(gig, byIdUnfiltered) {
        const playlists = Array.isArray(gig.playlists) ? gig.playlists : [];
        const exportPlaylists = playlists.map((p) => ({
            name: p.name || 'Untitled',
            tracks: [],
            isBpmRoll: !!p?.isBpmRoll,
        }));
        const dropped = []; // { laneName, trackId, reason, hint?, track? }

        const buildExportTrack = (t) => ({
            trackId: t.id,
            name: t.title || '',
            artist: t.artist || '',
            album: t.album || '',
            genre: t.genre || '',
            bpm: t.bpm || null,
            comments: t.comments || '',
            year: t.year || null,
            localPath: t.local_path || t.path || '',
        });

        // Pass 1: resolve every non-BPM-roll lane against the library.
        for (let i = 0; i < playlists.length; i += 1) {
            const p = playlists[i];
            if (p?.isBpmRoll) continue;
            const lane = exportPlaylists[i];
            for (const tid of (p.trackIds || [])) {
                const t = byIdUnfiltered.get(tid);
                if (!t) {
                    dropped.push({ laneName: lane.name, trackId: tid, reason: 'not-in-library' });
                    continue;
                }
                const localPath = t.local_path || t.path || '';
                if (!localPath) {
                    dropped.push({ laneName: lane.name, trackId: tid, reason: 'no-local-path', track: t });
                    continue;
                }
                lane.tracks.push(buildExportTrack(t));
            }
        }

        // Pass 2: populate each BPM-roll lane from the POST-DROP union of the
        // other lanes' resolved tracks, sorted by BPM ascending. Tracks with
        // no/invalid BPM sink to the bottom in their first-seen order.
        const parseBpm = (v) => {
            if (v == null || v === '') return NaN;
            const n = typeof v === 'number' ? v : parseFloat(v);
            return Number.isFinite(n) && n > 0 ? n : NaN;
        };
        for (let i = 0; i < exportPlaylists.length; i += 1) {
            if (!exportPlaylists[i].isBpmRoll) continue;
            const seen = new Set();
            const pool = [];
            for (let j = 0; j < exportPlaylists.length; j += 1) {
                if (j === i) continue;
                if (exportPlaylists[j].isBpmRoll) continue;
                for (const tr of exportPlaylists[j].tracks) {
                    if (seen.has(tr.trackId)) continue;
                    seen.add(tr.trackId);
                    pool.push(tr);
                }
            }
            pool.sort((a, b) => {
                const aN = parseBpm(a.bpm);
                const bN = parseBpm(b.bpm);
                const aBad = Number.isNaN(aN);
                const bBad = Number.isNaN(bN);
                if (aBad && bBad) return 0;
                if (aBad) return 1;
                if (bBad) return -1;
                return aN - bN;
            });
            exportPlaylists[i].tracks = pool;
        }

        // Strip the transient flag — server doesn't need it.
        for (const lane of exportPlaylists) delete lane.isBpmRoll;

        return { exportPlaylists, dropped };
    }

    // Build a `gigs` payload reflecting EVERY gig in IDB with each lane's
    // tracks already resolved to the export shape. This is what the server
    // needs to keep ~/Music/umm.xml comprehensive across all gigs (not just
    // the one being exported right now).
    //
    // The `hideFromRekordbox` flag is forwarded so the server-side writer can
    // skip those gigs when composing umm.xml. The full record is still
    // snapshotted to gigs-snapshot.json so toggling the flag back later
    // re-includes the gig without needing the client to resend playlists.
    async _buildAllGigsPayload(byIdUnfiltered) {
        const db = this.integrationManager?.database;
        if (!db) return [];
        const all = await listGigs(db);
        return (all || []).map((g) => {
            const { exportPlaylists } = this._resolveGigTracks(g, byIdUnfiltered);
            return {
                name: g.name || 'Untitled gig',
                gigDate: g.gigDate || null,
                hideFromRekordbox: !!g.hideFromRekordbox,
                playlists: exportPlaylists,
            };
        });
    }

    /** Push the current gig roster (with `hideFromRekordbox` flags) to the
     *  server, which snapshots it + re-emits ~/Music/umm.xml. Called whenever
     *  the user toggles a gig's sidebar visibility or wipes the sidebar.
     *  Returns the parsed response (or null on failure). */
    async _syncRekordboxSidebar() {
        this.showNotification('Working edits are saved. Use Publish to Rekordbox to update the XML handoff.', 'info');
        return null;
    }

    async _exportGigToRekordbox(gigId) {
        const gig = await getGig(this.integrationManager?.database, gigId);
        if (gig) await publishWorkspace(this, gig.standalone ? 'standalone' : 'gig', gigId, gig);
    }

    // Pre-export confirmation listing tracks that won't make it into the XML
    // and why. `fatal === true` means there's nothing left to export and the
    // dialog should not offer a "Export anyway" button. Returns a Promise that
    // resolves to true when the user wants to proceed with whatever's
    // exportable (false = cancel).
    _showGigExportDropModal({ dropped, totalExportable, exportPlaylists, gig, fatal }) {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'enrich-backdrop';
            const dialog = document.createElement('div');
            dialog.className = 'enrich-dialog';
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-label', 'Export warning');
            backdrop.appendChild(dialog);
            document.body.appendChild(backdrop);

            const close = (val) => {
                backdrop.remove();
                document.removeEventListener('keydown', escHandler);
                resolve(val);
            };
            const escHandler = (e) => { if (e.key === 'Escape' && isTopmostBackdrop(backdrop)) close(false); };
            document.addEventListener('keydown', escHandler);
            backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });

            const reasonLabel = {
                'not-in-library': 'Not in library (re-imported / metadata changed)',
                'no-local-path': 'No local file (Bandcamp / Discogs / streaming row)',
                'path-outside-roots': 'Path outside LIBRARY_DIR / LOSSLESS_DIR',
            };

            const byReason = new Map();
            for (const d of dropped) {
                if (!byReason.has(d.reason)) byReason.set(d.reason, []);
                byReason.get(d.reason).push(d);
            }
            const groupsHtml = Array.from(byReason.entries()).map(([reason, items]) => {
                const rowsHtml = items.slice(0, 100).map((d) => {
                    const t = d.track;
                    const label = t
                        ? `${escapeHtml(t.artist || 'Unknown')} – ${escapeHtml(t.title || d.trackId)}`
                        : `<code>${escapeHtml(d.trackId)}</code>`;
                    return `<li><span class="muted">[${escapeHtml(d.laneName)}]</span> ${label}</li>`;
                }).join('');
                const overflow = items.length > 100
                    ? `<li class="muted">…and ${items.length - 100} more</li>`
                    : '';
                return `<section class="export-drop-group">
                    <h3>${escapeHtml(reasonLabel[reason] || reason)} <span class="muted">· ${items.length}</span></h3>
                    <ul class="export-drop-list">${rowsHtml}${overflow}</ul>
                </section>`;
            }).join('');

            const headline = fatal
                ? `<strong>Nothing exportable.</strong> All ${dropped.length} track${dropped.length === 1 ? '' : 's'} in this gig will be skipped.`
                : `<strong>${dropped.length} track${dropped.length === 1 ? ' will be skipped' : 's will be skipped'}.</strong> ${totalExportable} of ${totalExportable + dropped.length} will export across ${exportPlaylists.length} playlist${exportPlaylists.length === 1 ? '' : 's'}.`;

            dialog.innerHTML = `
                <header class="enrich-head">
                    <h2>Export "${escapeHtml(gig.name || 'Gig')}" — review skipped tracks</h2>
                    <p>${headline}</p>
                </header>
                <div class="enrich-body export-drop-body">${groupsHtml}</div>
                <footer class="enrich-foot">
                    <div class="enrich-foot-left"></div>
                    <div class="enrich-foot-right">
                        <button type="button" class="btn btn-sm btn-secondary" data-cancel>${fatal ? 'Close' : 'Cancel'}</button>
                        ${fatal ? '' : '<button type="button" class="btn btn-sm" data-continue>Export anyway</button>'}
                    </div>
                </footer>
            `;
            dialog.querySelector('[data-cancel]')?.addEventListener('click', () => close(false));
            dialog.querySelector('[data-continue]')?.addEventListener('click', () => close(true));
        });
    }

    // Like New gig, exporting used to rely on a native confirm dialog. Keep
    // the confirmation in-app so the action stays visible in embedded shells.
    _showGigExportConfirmModal({ gig, totalExportable, playlistCount }) {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'enrich-backdrop';
            const dialog = document.createElement('div');
            dialog.className = 'enrich-dialog gig-export-confirm-dialog';
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.setAttribute('aria-label', 'Export gig to Rekordbox');
            dialog.innerHTML = `
                <header class="enrich-head">
                    <h2>Export "${escapeHtml(gig.name || 'Gig')}" to Rekordbox</h2>
                    <p>${totalExportable} ${totalExportable === 1 ? 'track' : 'tracks'} across ${playlistCount} ${playlistCount === 1 ? 'playlist' : 'playlists'} are ready to export.</p>
                </header>
                <div class="enrich-body">
                    <p class="muted">This refreshes the stable <code>~/Music/umm.xml</code> file Rekordbox should watch, and saves a timestamped archive in <code>~/Music/umm-export/</code>.</p>
                </div>
                <footer class="enrich-foot">
                    <div class="enrich-foot-left"></div>
                    <div class="enrich-foot-right">
                        <button type="button" class="btn btn-sm btn-secondary" data-cancel>Cancel</button>
                        <button type="button" class="btn btn-sm" data-confirm>Update Rekordbox XML</button>
                    </div>
                </footer>`;
            backdrop.appendChild(dialog);
            document.body.appendChild(backdrop);

            const close = (result) => {
                backdrop.remove();
                document.removeEventListener('keydown', onKeyDown);
                resolve(result);
            };
            const onKeyDown = (event) => {
                if (event.key === 'Escape' && isTopmostBackdrop(backdrop)) close(false);
            };
            document.addEventListener('keydown', onKeyDown);
            backdrop.addEventListener('click', (event) => {
                if (event.target === backdrop) close(false);
            });
            dialog.querySelector('[data-cancel]')?.addEventListener('click', () => close(false));
            dialog.querySelector('[data-confirm]')?.addEventListener('click', () => close(true));
            requestAnimationFrame(() => dialog.querySelector('[data-confirm]')?.focus());
        });
    }

    // `targetGigId` pins the import onto one gig (detail view "Update from
    // Rekordbox"). Without it the modal offers existing-gig vs new-gig, with
    // the folder-name match preselected. Merge/replace default lives in
    // Settings; the modal's "make this my default" checkbox writes the same key.
    async _onImportRekordboxXml(targetGigId = null) {
        const db = this.integrationManager?.database;
        if (!db) return;
        const result = await openRekordboxImportModal({
            database: db,
            // Use the unfiltered IDB roster so we match against every track,
            // not just what's currently visible in Collection.
            fetchAllTracks: async () => {
                if (typeof db.getTracks === 'function') return await db.getTracks();
                return await this._allTracks();
            },
            listGigs: () => listGigs(db, { sort: 'updatedAt' }),
            targetGigId,
            getDefaultMode: () => readRekordboxImportMode(db),
            setDefaultMode: (mode) => writeRekordboxImportMode(db, mode),
            notify: (msg, kind) => this.showNotification?.(msg, kind),
        });
        if (!result) return;
        // New library records may have been added — invalidate caches.
        this._invalidateTracks();
        // Land on the gig (new or updated) so the BPM lane's fresh union is visible.
        this.navigate({ view: 'gigs', id: result.gigId });
    }

    // Shared in-app field dialog for playlist and gig-folder names. Native
    // prompts are unreliable in the embedded app shell, so every gig action
    // that requires text entry uses this visible form instead.
    _openGigFieldModal({ title, description = '', label, value = '', type = 'text', submitLabel = 'Save', allowBlank = false }) {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'enrich-backdrop';
            const dialog = document.createElement('form');
            dialog.className = 'enrich-dialog gig-create-dialog';
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.setAttribute('aria-label', title);
            dialog.innerHTML = `
                <header class="enrich-head">
                    <h2>${escapeHtml(title)}</h2>
                    ${description ? `<p class="muted">${escapeHtml(description)}</p>` : ''}
                </header>
                <div class="enrich-body gig-create-fields">
                    <label class="gig-create-label" for="gigFieldValue">${escapeHtml(label)}</label>
                    <input class="gig-create-input" id="gigFieldValue" name="value" type="${type}" value="${escapeHtml(String(value || ''))}" autocomplete="off">
                    <p class="error" data-field-error hidden></p>
                </div>
                <footer class="enrich-foot">
                    <div class="enrich-foot-left"></div>
                    <div class="enrich-foot-right">
                        <button type="button" class="btn btn-sm btn-secondary" data-cancel>Cancel</button>
                        <button type="submit" class="btn btn-sm">${escapeHtml(submitLabel)}</button>
                    </div>
                </footer>`;
            backdrop.appendChild(dialog);
            document.body.appendChild(backdrop);

            const input = dialog.elements.value;
            const errorEl = dialog.querySelector('[data-field-error]');
            const finish = (result) => {
                backdrop.remove();
                document.removeEventListener('keydown', onKeyDown);
                resolve(result);
            };
            const onKeyDown = (event) => {
                if (event.key === 'Escape' && isTopmostBackdrop(backdrop)) finish(null);
            };
            document.addEventListener('keydown', onKeyDown);
            backdrop.addEventListener('click', (event) => {
                if (event.target === backdrop) finish(null);
            });
            dialog.querySelector('[data-cancel]')?.addEventListener('click', () => finish(null));
            dialog.addEventListener('submit', (event) => {
                event.preventDefault();
                const next = String(input?.value || '').trim();
                if (!allowBlank && !next) {
                    errorEl.textContent = `${label} is required.`;
                    errorEl.hidden = false;
                    input?.focus();
                    return;
                }
                finish(next);
            });
            requestAnimationFrame(() => input?.focus());
        });
    }

    _openGigConfirmModal({ title, message, confirmLabel }) {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'enrich-backdrop';
            const dialog = document.createElement('div');
            dialog.className = 'enrich-dialog gig-export-confirm-dialog';
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.setAttribute('aria-label', title);
            dialog.innerHTML = `
                <header class="enrich-head">
                    <h2>${escapeHtml(title)}</h2>
                    ${message ? `<p>${escapeHtml(message)}</p>` : ''}
                </header>
                <footer class="enrich-foot">
                    <div class="enrich-foot-left"></div>
                    <div class="enrich-foot-right">
                        <button type="button" class="btn btn-sm btn-secondary" data-cancel>Cancel</button>
                        <button type="button" class="btn btn-sm" data-confirm>${escapeHtml(confirmLabel)}</button>
                    </div>
                </footer>`;
            backdrop.appendChild(dialog);
            document.body.appendChild(backdrop);

            const close = (result) => {
                backdrop.remove();
                document.removeEventListener('keydown', onKeyDown);
                resolve(result);
            };
            const onKeyDown = (event) => {
                if (event.key === 'Escape' && isTopmostBackdrop(backdrop)) close(false);
            };
            document.addEventListener('keydown', onKeyDown);
            backdrop.addEventListener('click', (event) => {
                if (event.target === backdrop) close(false);
            });
            dialog.querySelector('[data-cancel]')?.addEventListener('click', () => close(false));
            dialog.querySelector('[data-confirm]')?.addEventListener('click', () => close(true));
            requestAnimationFrame(() => dialog.querySelector('[data-confirm]')?.focus());
        });
    }

    // Shared overflow-menu mount used by both the list-view "More" pill and
    // the detail-header "More" pill. Uses viewport-fixed positioning so the
    // menu can escape the gigs-table cell (which clips it via `overflow:
    // hidden` on the table). Items: [{ act, label, danger? }]. Hands the
    // chosen `act` back via the `onPick` callback. Outside-click + Escape
    // dismiss; tries to anchor below the trigger but flips above if it would
    // overflow the viewport bottom.
    _mountGigOverflowMenu({ anchorBtn, items, onPick }) {
        document.querySelectorAll('.gig-overflow-menu').forEach((m) => m.remove());
        const menu = document.createElement('div');
        menu.className = 'gig-overflow-menu';
        menu.setAttribute('role', 'menu');
        menu.innerHTML = items.map((it) => {
            const cls = it.danger ? 'gig-overflow-item is-danger' : 'gig-overflow-item';
            return `<button type="button" class="${cls}" data-act="${escapeHtml(it.act)}">${escapeHtml(it.label)}</button>`;
        }).join('');
        document.body.appendChild(menu);

        // Position: prefer below trigger, flip above if it would clip the
        // viewport bottom. Clamp x within the viewport.
        // In the page's own px: a phone's sideways graph turns the body (phone.js).
        const a = viewRect(anchorBtn.getBoundingClientRect());
        const rect = { top: a.y0, bottom: a.y1, right: a.x1 };
        const menuRect = { width: menu.offsetWidth, height: menu.offsetHeight };
        const { w: vw, h: vh } = viewSize();
        const margin = 6;
        let top = rect.bottom + 4;
        if (top + menuRect.height > vh - margin) {
            top = Math.max(margin, rect.top - menuRect.height - 4);
        }
        // Right-align with the trigger so the menu hangs from the button's
        // right edge, then clamp into the viewport.
        let left = rect.right - menuRect.width;
        left = Math.min(Math.max(margin, left), vw - menuRect.width - margin);
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;

        const close = () => {
            menu.remove();
            document.removeEventListener('mousedown', onDocClick, true);
            document.removeEventListener('keydown', onKey, true);
        };
        const onDocClick = (e) => { if (!menu.contains(e.target) && e.target !== anchorBtn) close(); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        // Defer wiring so the originating click that opened the menu doesn't
        // immediately close it.
        setTimeout(() => {
            document.addEventListener('mousedown', onDocClick, true);
            document.addEventListener('keydown', onKey, true);
        }, 0);

        menu.querySelectorAll('[data-act]').forEach((b) => {
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                const act = b.dataset.act;
                close();
                onPick(act);
            });
        });
    }

    // Track → [{ gigId, gigName, laneId, laneName }] (gig membership Phase 2).
    // Built from gigs already in memory on first read; any gig write drops it
    // (gigs.js notifies) and visible Gigs cells refresh in place.
    async _membershipIndex() {
        if (this.__membershipIndex) return this.__membershipIndex;
        const db = this.integrationManager?.database;
        const gigs = db ? await listGigs(db).catch(() => []) : [];
        this.__membershipIndex = buildMembershipIndex(gigs);
        return this.__membershipIndex;
    }
    _dropMembershipIndex() {
        this.__membershipIndex = null;
        if (!document.querySelector('td[data-membership-id]')) return;
        this._membershipIndex().then((index) => {
            document.querySelectorAll('td[data-membership-id]').forEach((cell) => {
                const id = cell.dataset.membershipId;
                cell.outerHTML = playlistsCellHtml(id, index.get(String(id))).replace(/^<td/, '<td data-col="gigs"');
            });
        }).catch(() => {});
    }

    // Data the rule compiler needs that a track row does not carry. Rebuilt
    // lazily; dropped on gig writes and when the sound-check payload reloads.
    async _ensureFilterContext() {
        if (this.__filterContext) return this.__filterContext;
        const db = this.integrationManager?.database;
        const connector = this.integrationManager?.discogsConnector;
        const relationsService = (db && connector ? new EntityRelations({ database: db, connector, queue: this.discogsQueue }) : null);
        const [membershipIndex, identities, relations] = await Promise.all([
            this._membershipIndex(),
            db?.getAllEntityIdentity ? db.getAllEntityIdentity().catch(() => []) : [],
            relationsService ? relationsService.relations().catch(() => []) : [],
        ]);
        await this._ensureSoundCheckData().catch(() => {});
        const credits = await this._creditsByRelease();
        this.__filterContext = { membershipIndex, identities, relations, soundStatusIndex: this._soundStatusIndex, credits };
        this.filterEngine.setContext(this.__filterContext);
        return this.__filterContext;
    }
    _dropFilterContext() { this.__filterContext = null; this.filterEngine.setContext({}); }
    async _creditsByRelease() {
        const db = this.integrationManager?.database;
        if (!db?.getAllCredits) return new Map();
        const rows = await db.getAllCredits().catch(() => []);
        return new Map((rows || []).map((row) => [String(row.id), row]));
    }
    // A saved:<crateId> link carries its rules in the crate, not the hash.
    async _resolveSavedRules() {
        const s = this.filterEngine.state;
        if (!s.savedRules || s.rules) return;
        const crate = this.crateManager ? await this.crateManager.get(s.savedRules).catch(() => null) : null;
        if (crate?.filterState?.rules) {
            this.filterEngine.state = { ...this._cloneFilterState(crate.filterState), ids: s.ids, crateId: crate.id, savedRules: null };
        } else { s.invalidFilter = true; s.savedRules = null; }
    }
    // Before a rules-mode pass: resolve a saved link, then load the context.
    async _prepareRulesPass() {
        await this._resolveSavedRules();
        if (this.filterEngine.state.rules) await this._ensureFilterContext();
    }

    /** Tools' count (tracks with staged changes) and Apply in its tab row; best-effort. */
    async _refreshStaged() {
        if (VIEWER) return;
        try {
            const [diffs, batches] = await Promise.all([
                this.integrationManager.database.listPendingTagDiffs(),
                fetch('/api/tags/batch').then((r) => r.json()).catch(() => ({})),
            ]);
            const staged = stagedTrackCount(diffs);
            this._stagedState = { staged, recoverable: staged ? null : latestRecoverableBatch(batches.batches || []) };
            this._setNavCount('staged', staged);
            mountToolsApply(document.getElementById('sectionTabs'), sectionOf(this.currentView), this._stagedState, (batchId) => this._openApplyStaged(batchId));
        } catch (_) { /* count best-effort */ }
    }

    // In-app modal rather than the native prompt(): native dialogs are
    // suppressed (returning null with no feedback) inside embedded webviews
    // and by some browser settings, which read as "the click did nothing".
    async _onSaveCrate() {
        const name = await this._openGigFieldModal({
            title: 'Save filter',
            label: 'Filter name',
            submitLabel: 'Save filter',
        });
        if (name == null) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        const { ids: _sessionIds, scope: _scope, ...crateState } = this.filterEngine.state;
        const crate = await this.crateManager.save(trimmed, crateState);
        this._activeCrateId = crate.id;
        this._modifiedCrate = null;
        this.renderCratesSidebar();
        this.showNotification(`Saved filter: ${trimmed}`, 'success');
    }

    async _loadCrate(id) {
        const crate = await this.crateManager.get(id);
        if (!crate) return;
        // The scope stays: a saved filter narrows within it.
        this.filterEngine.state = { ...this._cloneFilterState(crate.filterState), scope: this.filterEngine.state.scope || null };
        this.filterEngine.state.crateId = id;
        this._activeCrateId = id;
        this._modifiedCrate = null;
        this._healthFilter = null;
        // A saved filter applies where it is picked: any view whose route carries
        // the filter and draws the header. Anywhere else it opens Tracks.
        const here = hasHeader(this.currentView) && routeCarries({ view: this.currentView, tab: this._route?.tab }, 'routeFilter');
        const scope = here ? scopeFor(this.currentView) : 'collection';
        // Mirror the live-state into the scope cache so view switches don't wipe it.
        this._filterScopes[scope] = this._cloneFilterState(this.filterEngine.state);
        this._activeFilterScope = scope;
        this.loadView(here ? this.currentView : 'collection');
    }

    _openCrateMenu(id, anchorBtn) {
        document.querySelectorAll('.crate-menu').forEach((m) => m.remove());
        const menu = document.createElement('div');
        menu.className = 'crate-menu';
        menu.innerHTML = `
            <button data-act="rename">Rename</button>
            <button data-act="duplicate">Duplicate</button>
            <button data-act="update">Update to current filters</button>
            <button data-act="delete">Delete</button>
        `;
        // Fixed to the viewport, anchored under the chip.
        const r = anchorBtn.getBoundingClientRect();
        menu.style.top = `${Math.round(r.bottom + 2)}px`;
        menu.style.left = `${Math.round(r.left)}px`;
        document.body.appendChild(menu);

        const close = () => { menu.remove(); document.removeEventListener('click', onDocClick, true); this._closeCrateMenu = null; };
        this._closeCrateMenu = close;
        const onDocClick = (e) => { if (!menu.contains(e.target) && e.target !== anchorBtn) close(); };
        setTimeout(() => document.addEventListener('click', onDocClick, true), 0);

        menu.querySelectorAll('button').forEach((b) => {
            b.addEventListener('click', async (e) => {
                e.stopPropagation();
                const act = b.dataset.act;
                close();
                if (act === 'rename') await this._renameCrate(id);
                else if (act === 'duplicate') await this._duplicateCrate(id);
                else if (act === 'update') await this._updateCrate(id);
                else if (act === 'delete') await this._confirmDeleteCrate(id);
            });
        });
    }

    async _renameCrate(id) {
        const crate = await this.crateManager.get(id);
        if (!crate) return;
        const name = await this._openGigFieldModal({
            title: 'Rename filter',
            label: 'Filter name',
            value: crate.name || '',
            submitLabel: 'Rename',
        });
        if (name == null) return;
        const trimmed = name.trim();
        if (!trimmed || trimmed === crate.name) return;
        await this.crateManager.rename(id, trimmed);
        this.renderCratesSidebar();
        this.showNotification(`Renamed filter: ${trimmed}`, 'success');
    }

    async _duplicateCrate(id) {
        await this.crateManager.duplicate(id);
        this.renderCratesSidebar();
    }

    async _updateCrate(id) {
        const { ids: _sessionIds, scope: _scope, ...crateState } = this.filterEngine.state;
        await this.crateManager.update(id, crateState);
        this._activeCrateId = id;
        this.renderCratesSidebar();
        this.showNotification('Filter updated', 'success');
    }

    async _confirmDeleteCrate(id) {
        const crate = await this.crateManager.get(id);
        if (!crate) return;
        const ok = await this._openGigConfirmModal({
            title: 'Delete filter',
            message: `Delete the saved filter "${crate.name}"? Your tracks are not affected.`,
            confirmLabel: 'Delete filter',
        });
        if (!ok) return;
        await this.crateManager.delete(id);
        if (this._activeCrateId === id) this._activeCrateId = null;
        this.renderCratesSidebar();
        this.showNotification(`Deleted filter: ${crate.name}`, 'info');
    }

    // ── Utilities ──

    escapeHtml(s) {
        return escapeHtml(s);
    }

    showNotification(message, type = 'info', { title = '' } = {}) {
        const n = document.createElement('div');
        n.className = `notification ${type}`;
        n.textContent = message;
        if (title) n.title = title;
        document.body.appendChild(n);
        setTimeout(() => n.remove(), 3000);
    }
}

const app = new UnifiedMusicApp();
window.app = app;
export default app;
