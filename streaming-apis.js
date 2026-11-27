// Streaming Platform API Integrations
class StreamingAPIs {
    constructor() {
        this.apis = {
            spotify: new SpotifyAPI(),
            apple: new AppleMusicAPI(),
            youtube: new YouTubeAPI(),
            bandcamp: new BandcampAPI()
        };
    }

    async authenticatePlatform(platform) {
        return await this.apis[platform]?.authenticate();
    }

    async getLibrary(platform) {
        return await this.apis[platform]?.getLibrary();
    }

    async searchTracks(platform, query) {
        return await this.apis[platform]?.search(query);
    }
}

class SpotifyAPI {
    constructor() {
        this.clientId = null; // Set from backend /api/health or manually
        this.redirectUri = `${window.location.origin}/callback.html`;
        this.scope = 'user-library-read playlist-read-private';
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = 0;
        this._codeVerifier = null;
    }

    setClientId(clientId) {
        this.clientId = clientId;
    }

    // PKCE helpers
    _generateRandomString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        const values = crypto.getRandomValues(new Uint8Array(length));
        return Array.from(values, (v) => chars[v % chars.length]).join('');
    }

    async _generateCodeChallenge(verifier) {
        const data = new TextEncoder().encode(verifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    async authenticate() {
        if (!this.clientId || this.clientId === 'YOUR_SPOTIFY_CLIENT_ID') {
            console.warn('Spotify client ID not configured');
            return false;
        }

        // Check for existing valid token
        if (this.accessToken && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        // Try refreshing if we have a refresh token
        if (this.refreshToken) {
            const refreshed = await this._refreshAccessToken();
            if (refreshed) return this.accessToken;
        }

        // Start PKCE auth flow
        this._codeVerifier = this._generateRandomString(64);
        const codeChallenge = await this._generateCodeChallenge(this._codeVerifier);

        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            redirect_uri: this.redirectUri,
            scope: this.scope,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge,
        });

        const authUrl = `https://accounts.spotify.com/authorize?${params}`;
        const authWindow = window.open(authUrl, 'spotify-auth', 'width=500,height=700');

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Spotify auth timed out'));
            }, 120000);

            const handler = async (event) => {
                if (event.data?.type === 'SPOTIFY_AUTH_CALLBACK') {
                    window.removeEventListener('message', handler);
                    clearTimeout(timeout);
                    if (authWindow) authWindow.close();

                    if (event.data.error) {
                        reject(new Error(event.data.error));
                        return;
                    }

                    try {
                        await this._exchangeCode(event.data.code);
                        resolve(this.accessToken);
                    } catch (err) {
                        reject(err);
                    }
                }
            };
            window.addEventListener('message', handler);
        });
    }

    async _exchangeCode(code) {
        const res = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.clientId,
                grant_type: 'authorization_code',
                code,
                redirect_uri: this.redirectUri,
                code_verifier: this._codeVerifier,
            }),
        });

        if (!res.ok) throw new Error('Token exchange failed');
        const data = await res.json();
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;
        this.tokenExpiry = Date.now() + data.expires_in * 1000;
    }

    async _refreshAccessToken() {
        try {
            const res = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    grant_type: 'refresh_token',
                    refresh_token: this.refreshToken,
                }),
            });
            if (!res.ok) return false;
            const data = await res.json();
            this.accessToken = data.access_token;
            if (data.refresh_token) this.refreshToken = data.refresh_token;
            this.tokenExpiry = Date.now() + data.expires_in * 1000;
            return true;
        } catch {
            return false;
        }
    }

    async _authedFetch(url) {
        if (!this.accessToken) throw new Error('Not authenticated');
        if (Date.now() >= this.tokenExpiry && this.refreshToken) {
            await this._refreshAccessToken();
        }
        return fetch(url, {
            headers: { Authorization: `Bearer ${this.accessToken}` },
        });
    }

    async getLibrary() {
        const tracks = [];
        let offset = 0;
        const limit = 50;

        while (true) {
            const response = await this._authedFetch(
                `https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`
            );
            const data = await response.json();
            if (!data.items) break;
            tracks.push(...data.items.map((item) => this.formatTrack(item.track)));
            if (data.items.length < limit) break;
            offset += limit;
        }

        return tracks;
    }

    async search(query) {
        const response = await this._authedFetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=20`
        );
        const data = await response.json();
        return (data.tracks?.items || []).map((track) => this.formatTrack(track));
    }

    formatTrack(spotifyTrack) {
        return {
            id: `spotify_${spotifyTrack.id}`,
            title: spotifyTrack.name,
            artist: spotifyTrack.artists.map((a) => a.name).join(', '),
            album: spotifyTrack.album.name,
            genre: spotifyTrack.album.genres?.[0] || '',
            duration: Math.floor(spotifyTrack.duration_ms / 1000),
            platform: 'spotify',
            source: 'spotify',
            availability: 'streaming',
            spotify_id: spotifyTrack.id,
            spotify_url: spotifyTrack.external_urls?.spotify || '',
            tags: [],
            year: spotifyTrack.album.release_date
                ? new Date(spotifyTrack.album.release_date).getFullYear()
                : null,
            label: '',
        };
    }
}

class AppleMusicAPI {
    constructor() {
        this.developerToken = 'YOUR_APPLE_MUSIC_DEVELOPER_TOKEN';
        this.userToken = null;
    }

    async authenticate() {
        // Apple Music requires a developer token and user token
        // This is more complex and requires server-side implementation
        console.log('Apple Music authentication requires server-side implementation');
        return false;
    }

    async getLibrary() {
        // Implementation would go here
        return [];
    }
}

class YouTubeAPI {
    constructor() {
        this.apiKey = 'YOUR_YOUTUBE_API_KEY';
    }

    async getLibrary() {
        // YouTube Music API is limited, would need to scrape playlists
        return [];
    }
}

class BandcampAPI {
    constructor() {
        // Bandcamp doesn't have a public API, would need to scrape
    }

    async getLibrary() {
        // Implementation would involve web scraping
        return [];
    }
}

export default StreamingAPIs; 