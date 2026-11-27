// Enhanced Playlist Manager - Advanced playlist operations and fuzzy matching
class PlaylistManager {
    constructor(integrationManager) {
        this.integrationManager = integrationManager;
        this.metadataExtractor = null;
        this.fuzzyThreshold = 90;
        this.weightTrackName = 0.7;
        this.weightArtistName = 0.3;
        this.cache = new Map();
    }

    setMetadataExtractor(extractor) {
        this.metadataExtractor = extractor;
    }

    async createPlaylist(name, description = '', tracks = []) {
        try {
            const playlist = {
                id: this.generateId(),
                name,
                description,
                tracks: tracks,
                created: new Date().toISOString(),
                modified: new Date().toISOString(),
                trackCount: tracks.length,
                totalDuration: this.calculateTotalDuration(tracks)
            };

            await this.integrationManager.database.savePlaylist(playlist);
            return playlist;
        } catch (error) {
            console.error('Error creating playlist:', error);
            throw error;
        }
    }

    async getPlaylists() {
        try {
            return await this.integrationManager.database.getPlaylists();
        } catch (error) {
            console.error('Error getting playlists:', error);
            return [];
        }
    }

    async getPlaylist(playlistId) {
        try {
            return await this.integrationManager.database.getPlaylist(playlistId);
        } catch (error) {
            console.error('Error getting playlist:', error);
            return null;
        }
    }

    async addTracksToPlaylist(playlistId, trackIds) {
        try {
            const playlist = await this.getPlaylist(playlistId);
            if (!playlist) throw new Error('Playlist not found');

            const newTracks = [...new Set([...playlist.tracks, ...trackIds])];
            playlist.tracks = newTracks;
            playlist.trackCount = newTracks.length;
            playlist.modified = new Date().toISOString();
            playlist.totalDuration = await this.calculateTotalDurationForIds(newTracks);

            await this.integrationManager.database.updatePlaylist(playlist);
            return playlist;
        } catch (error) {
            console.error('Error adding tracks to playlist:', error);
            throw error;
        }
    }

    async removeTracksFromPlaylist(playlistId, trackIds) {
        try {
            const playlist = await this.getPlaylist(playlistId);
            if (!playlist) throw new Error('Playlist not found');

            playlist.tracks = playlist.tracks.filter(id => !trackIds.includes(id));
            playlist.trackCount = playlist.tracks.length;
            playlist.modified = new Date().toISOString();
            playlist.totalDuration = await this.calculateTotalDurationForIds(playlist.tracks);

            await this.integrationManager.database.updatePlaylist(playlist);
            return playlist;
        } catch (error) {
            console.error('Error removing tracks from playlist:', error);
            throw error;
        }
    }

    async deletePlaylist(playlistId) {
        try {
            await this.integrationManager.database.deletePlaylist(playlistId);
            return true;
        } catch (error) {
            console.error('Error deleting playlist:', error);
            throw error;
        }
    }

    // Advanced playlist operations based on transjector.py functionality
    async findDuplicateTracks(playlistId) {
        try {
            const playlist = await this.getPlaylist(playlistId);
            if (!playlist) return [];

            const tracks = await this.integrationManager.database.getTracksByIds(playlist.tracks);
            const duplicates = [];

            for (let i = 0; i < tracks.length; i++) {
                for (let j = i + 1; j < tracks.length; j++) {
                    const comparison = this.compareTracks(tracks[i], tracks[j]);
                    if (comparison.isMatch) {
                        duplicates.push({
                            track1: tracks[i],
                            track2: tracks[j],
                            ...comparison
                        });
                    }
                }
            }

            return duplicates.sort((a, b) => b.score - a.score);
        } catch (error) {
            console.error('Error finding duplicate tracks:', error);
            return [];
        }
    }

    async findSimilarTracksInLibrary(targetTrack, threshold = null) {
        try {
            const allTracks = await this.integrationManager.getAllTracks();
            const matchThreshold = threshold || this.fuzzyThreshold;
            const matches = [];

            for (const track of allTracks) {
                const comparison = this.compareTracks(targetTrack, track);
                if (comparison.isMatch && comparison.score >= matchThreshold) {
                    matches.push({
                        track,
                        ...comparison
                    });
                }
            }

            return matches.sort((a, b) => b.score - a.score);
        } catch (error) {
            console.error('Error finding similar tracks:', error);
            return [];
        }
    }

    async createSmartPlaylist(criteria) {
        try {
            const allTracks = await this.integrationManager.getAllTracks();
            const filteredTracks = this.filterTracksByCriteria(allTracks, criteria);
            
            const playlistName = this.generateSmartPlaylistName(criteria);
            const playlist = await this.createPlaylist(playlistName, `Smart playlist based on: ${JSON.stringify(criteria)}`, filteredTracks.map(t => t.id));
            
            return playlist;
        } catch (error) {
            console.error('Error creating smart playlist:', error);
            throw error;
        }
    }

    filterTracksByCriteria(tracks, criteria) {
        return tracks.filter(track => {
            // Genre filter
            if (criteria.genre && track.genre) {
                if (!track.genre.toLowerCase().includes(criteria.genre.toLowerCase())) {
                    return false;
                }
            }

            // Artist filter
            if (criteria.artist && track.artist) {
                if (!track.artist.toLowerCase().includes(criteria.artist.toLowerCase())) {
                    return false;
                }
            }

            // Year range filter
            if (criteria.yearFrom && track.year) {
                if (track.year < criteria.yearFrom) {
                    return false;
                }
            }
            if (criteria.yearTo && track.year) {
                if (track.year > criteria.yearTo) {
                    return false;
                }
            }

            // Duration range filter
            if (criteria.durationFrom && track.duration) {
                if (track.duration < criteria.durationFrom) {
                    return false;
                }
            }
            if (criteria.durationTo && track.duration) {
                if (track.duration > criteria.durationTo) {
                    return false;
                }
            }

            // Label filter
            if (criteria.label && track.label) {
                if (!track.label.toLowerCase().includes(criteria.label.toLowerCase())) {
                    return false;
                }
            }

            // Source filter
            if (criteria.source && track.source !== criteria.source) {
                return false;
            }

            return true;
        });
    }

    generateSmartPlaylistName(criteria) {
        const parts = [];
        
        if (criteria.genre) parts.push(criteria.genre);
        if (criteria.artist) parts.push(criteria.artist);
        if (criteria.yearFrom && criteria.yearTo) {
            parts.push(`${criteria.yearFrom}-${criteria.yearTo}`);
        } else if (criteria.yearFrom) {
            parts.push(`${criteria.yearFrom}+`);
        } else if (criteria.yearTo) {
            parts.push(`-${criteria.yearTo}`);
        }
        if (criteria.label) parts.push(criteria.label);
        
        return parts.length > 0 ? parts.join(' - ') : 'Smart Playlist';
    }

    // Fuzzy matching functionality from transjector.py
    compareTracks(track1, track2) {
        const titleScore = this.fuzzyMatch(track1.title, track2.title);
        const artistScore = this.fuzzyMatch(track1.artist, track2.artist);
        
        const combinedScore = (this.weightTrackName * titleScore + this.weightArtistName * artistScore) / 
                            (this.weightTrackName + this.weightArtistName);
        
        return {
            score: combinedScore,
            isMatch: combinedScore >= this.fuzzyThreshold,
            titleScore,
            artistScore
        };
    }

    fuzzyMatch(str1, str2) {
        if (!str1 || !str2) return 0;
        
        const s1 = str1.toLowerCase().replace(/[^\w\s]/g, '');
        const s2 = str2.toLowerCase().replace(/[^\w\s]/g, '');
        
        if (s1 === s2) return 100;
        
        // Simple Levenshtein distance calculation
        const matrix = [];
        for (let i = 0; i <= s2.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= s1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= s2.length; i++) {
            for (let j = 1; j <= s1.length; j++) {
                if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        const distance = matrix[s2.length][s1.length];
        const maxLength = Math.max(s1.length, s2.length);
        return maxLength === 0 ? 100 : ((maxLength - distance) / maxLength) * 100;
    }

    // Playlist analysis and statistics
    async analyzePlaylist(playlistId) {
        try {
            const playlist = await this.getPlaylist(playlistId);
            if (!playlist) return null;

            const tracks = await this.integrationManager.database.getTracksByIds(playlist.tracks);
            
            const analysis = {
                playlist: playlist,
                statistics: this.calculatePlaylistStatistics(tracks),
                genreBreakdown: this.analyzePlaylistGenres(tracks),
                artistBreakdown: this.analyzePlaylistArtists(tracks),
                yearBreakdown: this.analyzePlaylistYears(tracks),
                labelBreakdown: this.analyzePlaylistLabels(tracks),
                duplicates: await this.findDuplicateTracks(playlistId)
            };

            return analysis;
        } catch (error) {
            console.error('Error analyzing playlist:', error);
            return null;
        }
    }

    calculatePlaylistStatistics(tracks) {
        const stats = {
            totalTracks: tracks.length,
            totalDuration: 0,
            averageDuration: 0,
            uniqueArtists: new Set(),
            uniqueAlbums: new Set(),
            uniqueGenres: new Set(),
            uniqueLabels: new Set(),
            years: new Set()
        };

        tracks.forEach(track => {
            if (track.duration) stats.totalDuration += track.duration;
            if (track.artist) stats.uniqueArtists.add(track.artist);
            if (track.album) stats.uniqueAlbums.add(track.album);
            if (track.genre) stats.uniqueGenres.add(track.genre);
            if (track.label) stats.uniqueLabels.add(track.label);
            if (track.year) stats.years.add(track.year);
        });

        stats.averageDuration = stats.totalTracks > 0 ? stats.totalDuration / stats.totalTracks : 0;
        stats.uniqueArtists = stats.uniqueArtists.size;
        stats.uniqueAlbums = stats.uniqueAlbums.size;
        stats.uniqueGenres = stats.uniqueGenres.size;
        stats.uniqueLabels = stats.uniqueLabels.size;
        stats.totalDurationHours = Math.round((stats.totalDuration / 3600) * 10) / 10;

        return stats;
    }

    analyzePlaylistGenres(tracks) {
        const genreCounts = {};
        tracks.forEach(track => {
            if (track.genre) {
                const genre = track.genre.toLowerCase();
                genreCounts[genre] = (genreCounts[genre] || 0) + 1;
            }
        });
        return this.sortByValue(genreCounts);
    }

    analyzePlaylistArtists(tracks) {
        const artistCounts = {};
        tracks.forEach(track => {
            if (track.artist) {
                const artist = track.artist.toLowerCase();
                artistCounts[artist] = (artistCounts[artist] || 0) + 1;
            }
        });
        return this.sortByValue(artistCounts);
    }

    analyzePlaylistYears(tracks) {
        const yearCounts = {};
        tracks.forEach(track => {
            if (track.year) {
                yearCounts[track.year] = (yearCounts[track.year] || 0) + 1;
            }
        });
        return this.sortByValue(yearCounts);
    }

    analyzePlaylistLabels(tracks) {
        const labelCounts = {};
        tracks.forEach(track => {
            if (track.label) {
                const label = track.label.toLowerCase();
                labelCounts[label] = (labelCounts[label] || 0) + 1;
            }
        });
        return this.sortByValue(labelCounts);
    }

    sortByValue(obj) {
        return Object.entries(obj)
            .sort(([,a], [,b]) => b - a);
    }

    calculateTotalDuration(tracks) {
        return tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
    }

    async calculateTotalDurationForIds(trackIds) {
        try {
            const tracks = await this.integrationManager.database.getTracksByIds(trackIds);
            return this.calculateTotalDuration(tracks);
        } catch (error) {
            console.error('Error calculating total duration:', error);
            return 0;
        }
    }

    generateId() {
        return Date.now() + Math.random().toString(36).substr(2, 9);
    }

    // Export playlist functionality
    async exportPlaylist(playlistId, format = 'json') {
        try {
            const playlist = await this.getPlaylist(playlistId);
            if (!playlist) throw new Error('Playlist not found');

            const tracks = await this.integrationManager.database.getTracksByIds(playlist.tracks);
            
            if (format === 'm3u') {
                return this.convertToM3U(playlist, tracks);
            } else if (format === 'csv') {
                return this.convertToCSV(playlist, tracks);
            } else {
                return JSON.stringify({ playlist, tracks }, null, 2);
            }
        } catch (error) {
            console.error('Error exporting playlist:', error);
            throw error;
        }
    }

    convertToM3U(playlist, tracks) {
        let m3u = `#EXTM3U\n# ${playlist.name}\n`;
        
        tracks.forEach(track => {
            m3u += `#EXTINF:${Math.floor(track.duration || 0)},${track.artist} - ${track.title}\n`;
            m3u += `${track.filePath || track.local_path || ''}\n`;
        });
        
        return m3u;
    }

    convertToCSV(playlist, tracks) {
        const csvRows = [['Title', 'Artist', 'Album', 'Genre', 'Year', 'Duration', 'Label']];
        
        tracks.forEach(track => {
            csvRows.push([
                track.title || '',
                track.artist || '',
                track.album || '',
                track.genre || '',
                track.year || '',
                this.formatDuration(track.duration || 0),
                track.label || ''
            ]);
        });
        
        return csvRows.map(row => row.join(',')).join('\n');
    }

    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

export default PlaylistManager; 