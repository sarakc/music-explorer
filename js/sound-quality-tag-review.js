import { SOUND_STATUS_META } from './sound-check-status.js';
import { stageSoundQualityTagProposals } from './sound-quality-tags.js';
import { escapeHtml } from './html.js';

const statusLabel = (proposal) => SOUND_STATUS_META[proposal.status]?.label || proposal.status;

// The batch planner refuses a member whose file is gone (ENOENT) or outside the
// writable roots (EPERM); the review shows those rows blocked instead of proposing them.
const FILE_BLOCK_LABEL = { ENOENT: 'File missing' };
const fileBlockLabel = (check) => FILE_BLOCK_LABEL[check.code] || 'Outside library';

function proposalRow(proposal, index, { staged, fileCheck, unchecked }) {
    const title = proposal.track.title || proposal.track.name || '(untitled)';
    const artist = proposal.track.artist || 'Unknown';
    const action = proposal.kind === 'remove-stale' ? 'Remove stale' : 'Add';
    const fileBlocked = fileCheck && !fileCheck.ok;
    const blocked = staged || fileBlocked || unchecked;
    const label = fileBlocked ? fileBlockLabel(fileCheck) : staged ? 'Already staged' : action;
    return `
        <label class="sqtr-row${blocked ? ' is-blocked' : ''}"${fileBlocked ? ` title="${escapeHtml(fileCheck.detail)}"` : ''}>
            <input type="checkbox" data-sqtr-index="${index}" ${blocked ? 'disabled' : 'checked'}>
            <span class="sqtr-track">
                <strong>${escapeHtml(title)}</strong>
                <span>${escapeHtml(artist)}</span>
            </span>
            <span class="sqtr-status">${escapeHtml(statusLabel(proposal))}</span>
            <span class="sqtr-comments">
                <span class="sqtr-before">${escapeHtml(proposal.before) || '<em>empty</em>'}</span>
                <span class="sqtr-arrow" aria-hidden="true">→</span>
                <span class="sqtr-after">${escapeHtml(proposal.after) || '<em>empty</em>'}</span>
            </span>
            <span class="sqtr-action">${label}</span>
        </label>`;
}

const proposalPath = (proposal) => proposal.track.local_path || proposal.track.path || '';

/** Ask the server, per path, what the batch planner would say about the file. */
export async function checkTagFiles(paths, { fetchImpl = fetch, batch = 2000 } = {}) {
    const results = [];
    for (let i = 0; i < paths.length; i += batch) {
        const res = await fetchImpl('/api/tags/files-check', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ paths: paths.slice(i, i + batch) }),
        });
        if (!res.ok) throw new Error(`files-check failed (${res.status})`);
        results.push(...((await res.json()).results || []));
    }
    return results;
}

/**
 * Exact batch preview. The sole mutation is staging pending diffs; the modal
 * contains no route to the multi-file tag writer.
 */
export async function openSoundQualityTagReview({
    proposals,
    database,
    onApplyStaged,
    checkFiles = checkTagFiles,
} = {}) {
    const rows = Array.isArray(proposals) ? proposals : [];
    if (!rows.length) return { staged: [], conflicts: [], failed: [] };
    if (!database) throw new TypeError('sound quality tag review requires a database');

    const pending = await database.listPendingTagDiffs();
    const blockedIds = new Set((pending || [])
        .filter((diff) => diff.field === 'comments')
        .map((diff) => String(diff.trackId)));

    const backdrop = document.createElement('div');
    backdrop.className = 'enrich-backdrop sqtr-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'enrich-dialog sqtr-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Tag replacements');
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    let resolveClose;
    const closed = new Promise((resolve) => { resolveClose = resolve; });
    let finalResult = null;

    const close = (result = finalResult) => {
        backdrop.remove();
        document.removeEventListener('keydown', onKeydown);
        resolveClose(result);
    };
    const onKeydown = (event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        close();
    };
    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) close();
    });
    document.addEventListener('keydown', onKeydown);

    // Shift-click sets every row from the last one clicked to the clicked row's new state.
    let anchor = null;
    let shiftHeld = false;
    dialog.addEventListener('mousedown', (event) => {
        shiftHeld = event.shiftKey;
        if (event.shiftKey && event.target.closest?.('.sqtr-row')) event.preventDefault(); // no text selection
    });
    dialog.addEventListener('keydown', (event) => { shiftHeld = event.shiftKey; });

    const section = (label, content) => content.length ? `
        <section class="sqtr-section">
            <h3>${label} <span>${content.length.toLocaleString()}</span></h3>
            <div class="sqtr-list">${content.join('')}</div>
        </section>` : '';

    // fileChecks: Map path → result; undefined while checking; null when the check itself failed.
    const render = (fileChecks) => {
        const checking = fileChecks === undefined;
        const failedCheck = fileChecks === null;
        const unchecked = checking || failedCheck;
        const addRows = [];
        const cleanRows = [];
        let stagedCount = 0;
        let fileBlockedCount = 0;
        rows.forEach((proposal, index) => {
            const staged = blockedIds.has(String(proposal.track.id));
            const fileCheck = fileChecks?.get(proposalPath(proposal)) || null;
            if (fileCheck && !fileCheck.ok) fileBlockedCount += 1;
            else if (staged) stagedCount += 1;
            const html = proposalRow(proposal, index, { staged, fileCheck, unchecked });
            (proposal.kind === 'remove-stale' ? cleanRows : addRows).push(html);
        });
        const eligibleCount = unchecked ? 0 : rows.length - stagedCount - fileBlockedCount;
        const notes = [
            stagedCount ? `${stagedCount.toLocaleString()} staged already` : '',
            fileBlockedCount ? `${fileBlockedCount.toLocaleString()} blocked` : '',
        ].filter(Boolean).join(' · ');

        dialog.innerHTML = `
        <header class="enrich-head sqtr-head">
            <div>
                <h2>Tag replacements</h2>
                <p class="muted">${rows.length.toLocaleString()} change${rows.length === 1 ? '' : 's'} · review only</p>
            </div>
            <button type="button" class="sqtr-close" data-sqtr-close aria-label="Close">&times;</button>
        </header>
        <div class="sqtr-tools">
            <label><input type="checkbox" data-sqtr-all ${eligibleCount ? 'checked' : 'disabled'}> All <span data-sqtr-selected>${eligibleCount.toLocaleString()}</span></label>
            ${notes ? `<span class="muted">${notes}</span>` : '<span></span>'}
        </div>
        <div class="enrich-body sqtr-body">
            ${section('Add REPLACE ME', addRows)}
            ${section('Remove stale', cleanRows)}
        </div>
        <footer class="enrich-foot sqtr-foot">
            <span class="muted" data-sqtr-state>${checking ? 'Checking files…' : failedCheck ? 'Couldn\'t check files.' : 'Nothing is written to audio.'}</span>
            <div class="enrich-foot-right">
                ${failedCheck ? '<button type="button" class="btn btn-sm btn-secondary" data-sqtr-retry>Retry</button>' : ''}
                <button type="button" class="btn btn-sm btn-secondary" data-sqtr-cancel>Cancel</button>
                <button type="button" class="btn btn-sm" data-sqtr-stage ${eligibleCount ? '' : 'disabled'}>Stage selected</button>
            </div>
        </footer>`;
        wire();
    };

    const runFileCheck = async () => {
        const paths = [...new Set(rows.map(proposalPath))];
        try {
            const results = await checkFiles(paths);
            render(new Map((results || []).map((r) => [r.path, r])));
        } catch (error) {
            console.error('Tag replacements file check failed:', error);
            render(null);
        }
    };

    const wire = () => {
        const boxes = () => [...dialog.querySelectorAll('[data-sqtr-index]:not(:disabled)')];
        const allBox = dialog.querySelector('[data-sqtr-all]');
        const selectedEl = dialog.querySelector('[data-sqtr-selected]');
        const stageButton = dialog.querySelector('[data-sqtr-stage]');
        const updateSelection = () => {
            const selectable = boxes();
            const checked = selectable.filter((box) => box.checked).length;
            selectedEl.textContent = checked.toLocaleString();
            allBox.checked = selectable.length > 0 && checked === selectable.length;
            allBox.indeterminate = checked > 0 && checked < selectable.length;
            stageButton.disabled = checked === 0;
        };

        allBox.addEventListener('change', () => {
            boxes().forEach((box) => { box.checked = allBox.checked; });
            updateSelection();
        });
        anchor = null;
        boxes().forEach((box) => box.addEventListener('change', () => {
            const list = boxes();
            const at = list.indexOf(box);
            if (shiftHeld && anchor !== null && list[anchor]) {
                const [lo, hi] = at < anchor ? [at, anchor] : [anchor, at];
                list.slice(lo, hi + 1).forEach((other) => { other.checked = box.checked; });
            }
            anchor = at;
            shiftHeld = false;
            updateSelection();
        }));
        dialog.querySelector('[data-sqtr-close]').addEventListener('click', () => close());
        dialog.querySelector('[data-sqtr-cancel]').addEventListener('click', () => close());
        dialog.querySelector('[data-sqtr-retry]')?.addEventListener('click', (event) => {
            event.currentTarget.disabled = true;
            runFileCheck();
        });

        stageButton.addEventListener('click', async () => {
            const selected = boxes()
                .filter((box) => box.checked)
                .map((box) => rows[Number(box.dataset.sqtrIndex)])
                .filter(Boolean);
            if (!selected.length) return;
            stageButton.disabled = true;
            stageButton.textContent = 'Staging…';
            const state = dialog.querySelector('[data-sqtr-state]');
            state.textContent = `${selected.length.toLocaleString()} selected`;

            finalResult = await stageSoundQualityTagProposals({ proposals: selected, database });
            const stagedCount = finalResult.staged.length;
            const conflictCount = finalResult.conflicts.length;
            const failedCount = finalResult.failed.length;
            state.textContent = [
                `${stagedCount.toLocaleString()} staged`,
                conflictCount ? `${conflictCount.toLocaleString()} skipped` : '',
                failedCount ? `${failedCount.toLocaleString()} failed` : '',
                'nothing written',
            ].filter(Boolean).join(' · ');

            boxes().forEach((box) => { box.disabled = true; });
            allBox.disabled = true;
            const cancelButton = dialog.querySelector('[data-sqtr-cancel]');
            cancelButton.textContent = 'Done';
            stageButton.textContent = 'Apply staged…';
            stageButton.disabled = stagedCount === 0;
            stageButton.replaceWith(stageButton.cloneNode(true));
            const applyButton = dialog.querySelector('[data-sqtr-stage]');
            applyButton.addEventListener('click', () => {
                close(finalResult);
                if (typeof onApplyStaged === 'function') onApplyStaged();
            });
        });
    };

    render(undefined);
    await runFileCheck();
    return closed;
}
