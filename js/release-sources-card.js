// Settings › Release sources: Bandcamp checking on or off, and Spotify "Not set
// up" until its keys are in .env, each with a progress line from
// GET /api/release-sources/status. Polls while the card is on screen.

export const BANDCAMP_BACKGROUND_KEY = 'bandcamp_background';
const n = (v) => Number(v || 0).toLocaleString('en-US');
const failedPart = (s) => (s?.failed ? ` · ${n(s.failed)} could not be checked` : '');

/** The Bandcamp progress line. */
export function bandcampLine(s) {
    if (!s) return '';
    if (s.envOff) return 'Off · BANDCAMP_BACKGROUND=off';
    if (s.state === 'off') return 'Off';
    if (s.state === 'rate-limited') return 'Checking later';
    if (!s.of) return 'No Bandcamp pages yet';
    const head = s.checking ? `Checking ${n(s.checking)} of ${n(s.of)}` : `${n(s.of)} artists and labels · up to date`;
    return head + failedPart(s);
}

/** The Spotify progress line. */
export function spotifyLine(s) {
    if (!s || s.state === 'off') return 'Not set up';
    if (s.state === 'disconnected') return s.reason === 'premium' ? 'Spotify refused the app · requires Spotify Premium' : 'Spotify rejected the client id or secret';
    if (s.state === 'rate-limited') return 'Checking later';
    const parts = [`${n(s.of)} linked artist${s.of === 1 ? '' : 's'}`];
    if (s.checking) parts.push(`checking ${n(s.checking)}`);
    if (s.matching && s.matching.done < s.matching.total) parts.push(`matching ${n(s.matching.done)} of ${n(s.matching.total)}`);
    return parts.join(' · ') + failedPart(s);
}

export const releaseSourcesCardHtml = () => `
            <section class="settings-card" aria-labelledby="settingsSourcesTitle">
                <div class="settings-section-head">
                    <h2 id="settingsSourcesTitle">Release sources</h2>
                    <p class="muted">Where New Releases looks besides Discogs.</p>
                </div>
                <div class="settings-queue" data-sources-card>
                    <label class="settings-check"><input type="checkbox" data-bandcamp-switch checked><span>Bandcamp checking</span></label>
                    <p class="muted settings-status" data-bandcamp-line></p>
                    <p class="settings-check"><span>Spotify</span></p>
                    <p class="muted settings-status" data-spotify-line></p>
                    <p class="muted settings-status" data-spotify-help hidden>Requires Spotify Premium. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env, then restart.</p>
                </div>
            </section>`;

export function wireReleaseSourcesCard(container, { database, fetchJson = (url) => fetch(url, { signal: AbortSignal.timeout(3000) }).then((r) => (r.ok ? r.json() : null)), setTimer = setInterval, clearTimer = clearInterval } = {}) {
    const card = container?.querySelector('[data-sources-card]');
    if (!card) return null;
    const toggle = card.querySelector('[data-bandcamp-switch]');
    const bandcamp = card.querySelector('[data-bandcamp-line]');
    const spotify = card.querySelector('[data-spotify-line]');
    const help = card.querySelector('[data-spotify-help]');

    const paint = (status) => {
        toggle.checked = status ? status.bandcamp?.enabled !== false : true;
        toggle.disabled = Boolean(status?.bandcamp?.envOff);
        bandcamp.textContent = status ? bandcampLine(status.bandcamp) : 'Cannot reach the server';
        spotify.textContent = status ? spotifyLine(status.spotify) : '';
        help.hidden = !status || status.spotify?.state !== 'off';
    };
    let timer = null;
    const refresh = async () => {
        if (card.isConnected === false) { clearTimer(timer); return; }
        try { paint(await fetchJson('/api/release-sources/status')); } catch (_) { paint(null); }
    };
    timer = setTimer(refresh, 5000);
    toggle.addEventListener('change', async () => {
        try { await database?.saveSetting?.(BANDCAMP_BACKGROUND_KEY, toggle.checked); } catch (_) { /* the next poll shows the real state */ }
        refresh();
    });
    return refresh();
}
