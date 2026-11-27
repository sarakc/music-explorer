// Integration Manager - Coordinates all music sources with enhanced features
import StreamingAPIs from './streaming-apis.js';
import MusicDatabase from './music-database.js';
import LibraryOrganizer from './js/library-organizer.js';
import PlaylistManager from './js/playlist-manager.js';
import EnhancedMetadataExtractor from './js/enhanced-metadata-extractor.js';
import DiscogsConnector from './js/discogs-connector.js';
import CSVImporter, { hashKey } from './js/csv-importer.js';
import { planBandcampUpsert } from './js/bandcamp-import.js';

class IntegrationManager {
    constructor() {
        this.streamingAPIs = new StreamingAPIs();
        this.database = new MusicDatabase();
        this.libraryOrganizer = new LibraryOrganizer();
        this.playlistManager = new PlaylistManager(this);
        this.metadataExtractor = new EnhancedMetadataExtractor();
        this.discogsConnector = new DiscogsConnector();
        this.csvImporter = new CSVImporter();
        this.isInitialized = false;
    }

    async initialize() {
        try {
            await this.database.init();

            // Same-origin server exposes PKCE public client id in /api/health (not a secret).
            try {
                const hr = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
                if (hr.ok) {
                    const h = await hr.json();
                    const id = h.spotify_client_id;
                    if (id) this.streamingAPIs.apis.spotify.setClientId(id);
                }
            } catch {
                /* offline or no server */
            }
            
            // Set up the metadata extractor for the playlist manager
            this.playlistManager.setMetadataExtractor(this.metadataExtractor);
            
            this.isInitialized = true;
            console.log('Integration Manager initialized with enhanced features');
        } catch (error) {
            console.error('Failed to initialize Integration Manager:', error);
        }
    }

    // Get all tracks from all sources (respects Bandcamp exclude setting)
    async getAllTracks(filters = {}) {
        if (!this.isInitialized) await this.initialize();
        let tracks = await this.database.getTracks(filters);
        const excludeBandcamp = await this.database.getSetting('bandcamp_exclude_from_library');
        if (excludeBandcamp) {
            tracks = tracks.filter(t => t.source !== 'bandcamp');
        }
        return tracks;
    }

    // Get only local tracks
    async getLocalTracks() {
        if (!this.isInitialized) await this.initialize();
        return await this.database.getTracks({ source: 'local' });
    }

    // Get a specific track by ID
    async getTrack(trackId) {
        if (!this.isInitialized) await this.initialize();
        return await this.database.getTrack(trackId);
    }

    // Platform connection methods
    async connectSpotify() {
        if (!this.isInitialized) await this.initialize();
        
        try {
            console.log('Connecting to Spotify...');
            const isAuthenticated = await this.streamingAPIs.authenticatePlatform('spotify');
            
            if (isAuthenticated) {
                const tracks = await this.streamingAPIs.getLibrary('spotify');
                console.log(`Found ${tracks.length} tracks on Spotify`);
                
                await this.database.addTracks(tracks);
                await this.database.saveSetting('spotify_connected', true);
                
                return tracks;
            }
        } catch (error) {
            console.error('Error connecting to Spotify:', error);
            throw error;
        }
        
        return [];
    }

    async connectAppleMusic() {
        if (!this.isInitialized) await this.initialize();
        
        try {
            console.log('Connecting to Apple Music...');
            const isAuthenticated = await this.streamingAPIs.authenticatePlatform('apple');
            
            if (isAuthenticated) {
                const tracks = await this.streamingAPIs.getLibrary('apple');
                console.log(`Found ${tracks.length} tracks on Apple Music`);
                
                await this.database.addTracks(tracks);
                await this.database.saveSetting('apple_connected', true);
                
                return tracks;
            }
        } catch (error) {
            console.error('Error connecting to Apple Music:', error);
            throw error;
        }
        
        return [];
    }

    // Check platform connection status
    async isSpotifyConnected() {
        if (!this.isInitialized) await this.initialize();
        return await this.database.getSetting('spotify_connected') || false;
    }

    async isAppleMusicConnected() {
        if (!this.isInitialized) await this.initialize();
        return await this.database.getSetting('apple_connected') || false;
    }

    // Bandcamp: import from JSON (output of bandcamp_import.py). Collection rows
    // merge into existing ones (planBandcampUpsert). Followed accounts are
    // replaced only by a scrape that read every page (`complete: true`); anything
    // else keeps the stored accounts.
    async importBandcampData(jsonPayload) {
        if (!this.isInitialized) await this.initialize();
        const data = typeof jsonPayload === 'string' ? JSON.parse(jsonPayload) : jsonPayload;
        if (data.error) throw new Error(`Scan failed: ${data.error}`);
        const username = data.username || 'bandcamp';
        const complete = data.complete === true;
        const collection = data.collection || [];
        const classified = data.following_classified || data.following || [];

        const tracks = planBandcampUpsert(await this.database.getTracks(), collection);
        await this.database.addTracks(tracks);

        const accounts = classified.map((acc) => ({
            id: 'bc_' + hashKey(acc.url || ''),
            url: acc.url,
            displayName: acc.display_name || acc.displayName || acc.username || acc.url,
            username: acc.username || null,
            accountType: acc.account_type || acc.accountType || 'fan',
            instagramUrl: acc.instagram_url || acc.instagramUrl || null,
            soundcloudUrl: acc.soundcloud_url || acc.soundcloudUrl || null,
            importedAt: new Date().toISOString(),
        }));
        if (complete) await this.database.setBandcampAccounts(accounts, { complete });

        await this.database.saveSetting('bandcamp_username', username);
        await this.database.saveSetting('bandcamp_last_import', new Date().toISOString());
        return { tracksAdded: tracks.length, accountsAdded: complete ? accounts.length : 0, accountsKept: !complete };
    }

    async getBandcampAccounts(accountType = null) {
        if (!this.isInitialized) await this.initialize();
        return await this.database.getBandcampAccounts(accountType);
    }

    async getBandcampExcluded() {
        if (!this.isInitialized) await this.initialize();
        return await this.database.getSetting('bandcamp_exclude_from_library') === true;
    }

    async setBandcampExcluded(excluded) {
        if (!this.isInitialized) await this.initialize();
        await this.database.saveSetting('bandcamp_exclude_from_library', !!excluded);
    }

    // Discogs: import full collection from backend
    async importDiscogsCollection(options = {}) {
        if (!this.isInitialized) await this.initialize();
        const tracks = await this.discogsConnector.fetchCollection(options);
        const result = await this.database.importDiscogsTracks(tracks);
        this.discogsConnector.connected = true;
        return result.tracks;
    }

    async isDiscogsConnected() {
        if (!this.isInitialized) await this.initialize();
        return await this.database.getSetting('discogs_connected') || false;
    }

    // Library imports merge into existing records (upsertImportedTracks) so a
    // re-import refreshes source fields without dropping UMM enrichment/edits.

    // CSV import: Rekordbox
    async importRekordboxCSV(csvText) {
        if (!this.isInitialized) await this.initialize();
        const parsed = this.csvImporter.importRekordboxCSV(csvText);
        console.log(`Parsed ${parsed.length} tracks from Rekordbox CSV`);
        if (!parsed.length) throw new Error('No tracks found in this file.');
        const tracks = await this.database.upsertImportedTracks(parsed);
        await this.database.saveSetting('rekordbox_last_import', new Date().toISOString());
        return tracks;
    }

    // XML import: Rekordbox
    async importRekordboxXML(xmlText) {
        if (!this.isInitialized) await this.initialize();
        const parsed = this.csvImporter.importRekordboxXML(xmlText);
        console.log(`Parsed ${parsed.length} tracks from Rekordbox XML`);
        const tracks = await this.database.upsertImportedTracks(parsed);
        await this.database.saveSetting('rekordbox_last_import', new Date().toISOString());
        return tracks;
    }

    // CSV import: Shazam
    async importShazamCSV(csvText) {
        if (!this.isInitialized) await this.initialize();
        const parsed = this.csvImporter.importShazamCSV(csvText);
        console.log(`Parsed ${parsed.length} tracks from Shazam CSV`);
        if (!parsed.length) throw new Error('No tracks found in this file.');
        const tracks = await this.database.upsertImportedTracks(parsed);
        await this.database.saveSetting('shazam_last_import', new Date().toISOString());
        return tracks;
    }

    // Enhanced statistics with library organizer (respects Bandcamp exclude)
    async getStatistics() {
        if (!this.isInitialized) await this.initialize();
        
        const tracks = await this.getAllTracks();
        const analysis = await this.libraryOrganizer.analyzeLibrary(tracks);
        const platformBreakdown = {};
        tracks.forEach(t => {
            const p = t.platform || t.source || 'unknown';
            platformBreakdown[p] = (platformBreakdown[p] || 0) + 1;
        });
        
        return {
            ...analysis.statistics,
            platformBreakdown,
            analysis: analysis
        };
    }

    async connectStreamingPlatform(platform) {
        if (!this.isInitialized) await this.initialize();
        
        try {
            console.log(`Connecting to ${platform}...`);
            const isAuthenticated = await this.streamingAPIs.authenticatePlatform(platform);
            
            if (isAuthenticated) {
                const tracks = await this.streamingAPIs.getLibrary(platform);
                console.log(`Found ${tracks.length} tracks on ${platform}`);
                
                await this.database.addTracks(tracks);
                await this.database.saveSetting(`${platform}_connected`, true);
                
                return tracks;
            }
        } catch (error) {
            console.error(`Error connecting to ${platform}:`, error);
        }
        
        return [];
    }

    async syncAllSources() {
        if (!this.isInitialized) await this.initialize();
        
        try {
            console.log('Syncing all music sources...');
            
            // Sync streaming platforms
            const spotifyTracks = await this.connectSpotify();
            const appleMusicTracks = await this.connectAppleMusic();
            
            const totalTracks = spotifyTracks.length + appleMusicTracks.length;
            console.log(`Synced ${totalTracks} tracks total`);
            
            return {
                spotify: spotifyTracks.length,
                appleMusic: appleMusicTracks.length,
                total: totalTracks
            };
        } catch (error) {
            console.error('Error syncing sources:', error);
            throw error;
        }
    }

    // Enhanced search with fuzzy matching (respects Bandcamp exclude)
    async searchAllSources(query) {
        if (!this.isInitialized) await this.initialize();
        
        try {
            const tracks = await this.getAllTracks();
            const results = [];
            
            for (const track of tracks) {
                const titleMatch = this.fuzzySearch(track.title, query);
                const artistMatch = this.fuzzySearch(track.artist, query);
                const albumMatch = this.fuzzySearch(track.album, query);
                const genreMatch = this.fuzzySearch(track.genre, query);
                
                const maxScore = Math.max(titleMatch, artistMatch, albumMatch, genreMatch);
                
                if (maxScore > 50) { // Lower threshold for search
                    results.push({
                        track,
                        score: maxScore,
                        matches: {
                            title: titleMatch,
                            artist: artistMatch,
                            album: albumMatch,
                            genre: genreMatch
                        }
                    });
                }
            }
            
            return results.sort((a, b) => b.score - a.score);
        } catch (error) {
            console.error('Error searching tracks:', error);
            return [];
        }
    }

    fuzzySearch(str1, str2) {
        if (!str1 || !str2) return 0;
        
        const s1 = str1.toLowerCase().replace(/[^\w\s]/g, '');
        const s2 = str2.toLowerCase().replace(/[^\w\s]/g, '');
        
        if (s1.includes(s2) || s2.includes(s1)) return 100;
        
        // Simple similarity calculation
        const words1 = s1.split(' ');
        const words2 = s2.split(' ');
        
        let matches = 0;
        for (const word1 of words1) {
            for (const word2 of words2) {
                if (word1.includes(word2) || word2.includes(word1)) {
                    matches++;
                }
            }
        }
        
        const maxWords = Math.max(words1.length, words2.length);
        return maxWords === 0 ? 0 : (matches / maxWords) * 100;
    }

    async getUnifiedLibrary(filters = {}) {
        if (!this.isInitialized) await this.initialize();
        return await this.getAllTracks(filters);
    }

    // Enhanced playlist management
    async createPlaylist(name, trackIds, description = '') {
        if (!this.isInitialized) await this.initialize();
        return await this.playlistManager.createPlaylist(name, description, trackIds);
    }

    async getPlaylists() {
        if (!this.isInitialized) await this.initialize();
        return await this.playlistManager.getPlaylists();
    }

    async getPlaylist(playlistId) {
        if (!this.isInitialized) await this.initialize();
        return await this.playlistManager.getPlaylist(playlistId);
    }

    async addTracksToPlaylist(playlistId, trackIds) {
        if (!this.isInitialized) await this.initialize();
        return await this.playlistManager.addTracksToPlaylist(playlistId, trackIds);
    }

    async removeTracksFromPlaylist(playlistId, trackIds) {
        if (!this.isInitialized) await this.initialize();
        return await this.playlistManager.removeTracksFromPlaylist(playlistId, trackIds);
    }

    async deletePlaylist(playlistId) {
        if (!this.isInitialized) await this.initialize();
        return await this.playlistManager.deletePlaylist(playlistId);
    }

    async findDuplicateTracks(playlistId) {
        if (!this.isInitialized) await this.initialize();
        return await this.playlistManager.findDuplicateTracks(playlistId);
    }

    async findSimilarTracksInLibrary(targetTrack, threshold = null) {
        if (!this.isInitialized) await this.initialize();
        return await this.playlistManager.findSimilarTracksInLibrary(targetTrack, threshold);
    }

    async createSmartPlaylist(criteria) {
        if (!this.isInitialized) await this.initialize();
        return await this.playlistManager.createSmartPlaylist(criteria);
    }

    async analyzePlaylist(playlistId) {
        if (!this.isInitialized) await this.initialize();
        return await this.playlistManager.analyzePlaylist(playlistId);
    }

    async exportPlaylist(playlistId, format = 'json') {
        if (!this.isInitialized) await this.initialize();
        return await this.playlistManager.exportPlaylist(playlistId, format);
    }

    // Enhanced library analysis (respects Bandcamp exclude)
    async analyzeLibrary() {
        if (!this.isInitialized) await this.initialize();
        const tracks = await this.getAllTracks();
        return await this.libraryOrganizer.analyzeLibrary(tracks);
    }

    async generateRecommendations() {
        if (!this.isInitialized) await this.initialize();
        const tracks = await this.getAllTracks();
        const analysis = await this.libraryOrganizer.analyzeLibrary(tracks);
        return this.libraryOrganizer.generateRecommendations(tracks, analysis);
    }

    async exportAnalysis(format = 'json') {
        if (!this.isInitialized) await this.initialize();
        const tracks = await this.getAllTracks();
        await this.libraryOrganizer.analyzeLibrary(tracks);
        return this.libraryOrganizer.exportAnalysis(format);
    }

    // Track management
    async updateTrack(track) {
        if (!this.isInitialized) await this.initialize();
        return await this.database.updateTrack(track);
    }

    async getStats() {
        if (!this.isInitialized) await this.initialize();
        return await this.getStatistics();
    }

    // Enhanced export functionality
    async exportData(format = 'json') {
        if (!this.isInitialized) await this.initialize();
        
        try {
            const tracks = await this.getAllTracks();
            
            if (format === 'csv') {
                return this.convertToCSV(tracks);
            } else if (format === 'm3u') {
                return this.convertToM3U(tracks);
            } else {
                return JSON.stringify(tracks, null, 2);
            }
        } catch (error) {
            console.error('Error exporting data:', error);
            throw error;
        }
    }

    convertToCSV(tracks) {
        const csvRows = [['Title', 'Artist', 'Album', 'Genre', 'Year', 'Duration', 'Label', 'Source']];
        
        tracks.forEach(track => {
            csvRows.push([
                track.title || '',
                track.artist || '',
                track.album || '',
                track.genre || '',
                track.year || '',
                this.formatDuration(track.duration || 0),
                track.label || '',
                track.source || ''
            ]);
        });
        
        return csvRows.map(row => row.join(',')).join('\n');
    }

    convertToM3U(tracks) {
        let m3u = '#EXTM3U\n';
        
        tracks.forEach(track => {
            m3u += `#EXTINF:${Math.floor(track.duration || 0)},${track.artist} - ${track.title}\n`;
            m3u += `${track.filePath || track.local_path || ''}\n`;
        });
        
        return m3u;
    }

    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // Playback functionality
    async playTrack(track) {
        if (!this.isInitialized) await this.initialize();
        
        try {
            if (track.source === 'local') {
                return await this.playLocalTrack(track);
            } else {
                return this.openStreamingTrack(track);
            }
        } catch (error) {
            console.error('Error playing track:', error);
            throw error;
        }
    }

    async playLocalTrack(track) {
        try {
            // For local tracks, we need to create a blob URL
            if (track.filePath) {
                const response = await fetch(track.filePath);
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                
                return {
                    url: url,
                    track: track,
                    type: 'local'
                };
            } else {
                throw new Error('No file path available for local track');
            }
        } catch (error) {
            console.error('Error playing local track:', error);
            throw error;
        }
    }

    openStreamingTrack(track) {
        // For streaming tracks, we'll open them in their respective platforms
        const platform = track.source;
        
        switch (platform) {
            case 'spotify':
                if (track.spotify_uri) {
                    window.open(`spotify:track:${track.spotify_uri}`, '_blank');
                }
                break;
            case 'apple':
                if (track.apple_music_url) {
                    window.open(track.apple_music_url, '_blank');
                }
                break;
            case 'bandcamp':
                if (track.bandcamp_url) {
                    window.open(track.bandcamp_url, '_blank');
                }
                break;
            case 'discogs':
                if (track.discogs_url) {
                    window.open(track.discogs_url, '_blank');
                }
                break;
            default:
                console.warn(`Unknown platform: ${platform}`);
        }
        
        return {
            track: track,
            type: 'streaming',
            platform: platform
        };
    }

    showPurchaseOptions(track) {
        // Show purchase options for tracks not in local library
        const options = [];
        
        if (track.source !== 'local') {
            options.push({
                platform: 'iTunes',
                url: `https://music.apple.com/search?term=${encodeURIComponent(track.artist + ' ' + track.title)}`
            });
            
            options.push({
                platform: 'Amazon',
                url: `https://www.amazon.com/s?k=${encodeURIComponent(track.artist + ' ' + track.title + ' mp3')}`
            });
            
            options.push({
                platform: 'Bandcamp',
                url: `https://bandcamp.com/search?q=${encodeURIComponent(track.artist + ' ' + track.title)}`
            });
        }
        
        return options;
    }

    // Enhanced metadata management
    async enhanceTrackMetadata(track) {
        if (!this.isInitialized) await this.initialize();
        
        try {
            // Use the enhanced metadata extractor to get better metadata
            const enhancedMetadata = await this.metadataExtractor.searchMusicBrainz(track);
            
            // Merge with existing metadata
            const updatedTrack = {
                ...track,
                ...enhancedMetadata
            };
            
            // Save to database
            await this.database.updateTrack(updatedTrack);
            
            return updatedTrack;
        } catch (error) {
            console.error('Error enhancing track metadata:', error);
            return track;
        }
    }
}

export default IntegrationManager; 