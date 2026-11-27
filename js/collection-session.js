const endpoint = '/api/playback/session';
let active = null;

export function sessionHeaders() {
    return active ? { 'X-UMM-Session': active.id } : {};
}

export function playbackSessionId() {
    return active?.id;
}

export function sessionCanPlay() {
    return !active || active.canPlay();
}

function randomId() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function exchange(id, action, detail = {}) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, ...detail }),
        signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Collection session request failed (${response.status})`);
    return response.json();
}

function standbyUrl() {
    const url = new URL(location.href);
    url.searchParams.set('standby', '1');
    return url;
}

function monitor(id, ttl, firstRequest) {
    let expires = firstRequest + ttl;
    let busy = false;
    let stopped = false;
    const stream = new EventSource(`${endpoint}/events?id=${id}`);
    const player = () => window.app?.audioPlayer;

    async function tick() {
        if (stopped) return;
        if (Date.now() >= expires) return giveUp();
        if (busy) return;
        busy = true;
        const started = Date.now();
        try {
            const result = await exchange(id, 'heartbeat', { playing: player()?.isPlaying || false });
            if (result.state === 'yield') return giveUp({ transfer: true });
            if (result.state === 'standby') return giveUp();
            if (result.state === 'active') expires = started + result.ttl;
        } catch {
            if (Date.now() >= expires) return giveUp();
        } finally {
            busy = false;
        }
    }

    function stop() {
        stopped = true;
        clearInterval(interval);
        stream.close();
        document.removeEventListener('visibilitychange', tick);
    }

    async function giveUp({ transfer = false } = {}) {
        if (stopped) return;
        stop();
        const snapshot = player()?.pauseForHandoff();
        window.app?.preview?.stop();
        document.body.inert = true;
        if (transfer) {
            try {
                await player()?.finishHandoff();
                await exchange(id, 'release', { snapshot: { ...player()?.handoffPosition(), playing: snapshot?.playing } });
            } catch {
                releaseBeacon(snapshot);
            }
        }
        location.replace(standbyUrl());
    }

    function releaseBeacon(snapshot) {
        navigator.sendBeacon(endpoint, new Blob([JSON.stringify({ id, action: 'release', snapshot })], { type: 'application/json' }));
    }

    const interval = setInterval(tick, 4_000);
    stream.onmessage = ({ data }) => {
        if (data === 'yield') void giveUp({ transfer: true });
        if (data === 'lost') void giveUp();
    };
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('pagehide', () => {
        if (stopped) return;
        const snapshot = player()?.pauseForHandoff();
        stop();
        releaseBeacon(snapshot);
    }, { once: true });
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) location.replace(standbyUrl());
    });
    return {
        id,
        onProgress: () => {
            if (Date.now() + 15_000 >= expires) void tick();
        },
        canPlay: () => {
            if (stopped) return false;
            if (Date.now() < expires) return true;
            void giveUp();
            return false;
        },
    };
}

export function sessionPlaybackProgress() {
    active?.onProgress();
}

export async function enterCollection(start) {
    const standby = document.getElementById('collectionStandby');
    const button = standby.querySelector('button');
    const status = standby.querySelector('[role="status"]');
    const url = new URL(location.href);
    const forcedStandby = url.searchParams.has('standby');
    if (forcedStandby) {
        url.searchParams.delete('standby');
        history.replaceState(history.state, '', url);
    }
    const id = randomId();
    const wait = () => new Promise((resolve) => setTimeout(resolve, 700));

    async function connect(action) {
        button.disabled = true;
        status.textContent = action === 'takeover' ? 'Switching to this window…' : 'Opening collection…';
        try {
            let requestTime = Date.now();
            let result = await exchange(id, action);
            // A normal reload can arrive just before the old document's
            // release beacon. Give that beacon a chance to land.
            if (action === 'open' && result.state === 'standby') {
                await wait();
                requestTime = Date.now();
                result = await exchange(id, action);
            }
            const deadline = Date.now() + 37_000;
            while (result.state === 'waiting' && Date.now() < deadline) {
                await wait();
                requestTime = Date.now();
                result = await exchange(id, action);
            }
            if (result.state === 'active') {
                active = { ...monitor(id, result.ttl, requestTime), resume: result.resume };
                standby.hidden = true;
                document.documentElement.classList.remove('collection-standby');
                await start();
                return;
            }
            status.textContent = result.state === 'waiting' ? 'The other window hasn’t responded yet.' : 'Your collection is open somewhere else.';
        } catch (error) {
            console.error('[collection session]', error);
            standby.hidden = false;
            document.documentElement.classList.add('collection-standby');
            status.textContent = 'Couldn’t open the collection. Try again.';
        }
        button.disabled = false;
    }

    button.addEventListener('click', () => void connect('takeover'));
    if (forcedStandby) status.textContent = 'Your collection is open somewhere else.';
    else await connect('open');
}

export function takePlaybackResume() {
    if (!active?.resume) return false;
    active.resume = false;
    return true;
}
