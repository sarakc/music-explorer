// Library Organizer - Advanced statistics and library management
class LibraryOrganizer {
    constructor() {
        this.statistics = {};
        this.genreAnalysis = {};
        this.labelAnalysis = {};
        this.yearAnalysis = {};
        this.artistAnalysis = {};
    }

    async analyzeLibrary(tracks) {
        try {
            console.log('Analyzing library...');
            
            this.statistics = this.calculateBasicStatistics(tracks);
            this.genreAnalysis = this.analyzeGenres(tracks);
            this.labelAnalysis = this.analyzeLabels(tracks);
            this.yearAnalysis = this.analyzeYears(tracks);
            this.artistAnalysis = this.analyzeArtists(tracks);
            
            return {
                statistics: this.statistics,
                genreAnalysis: this.genreAnalysis,
                labelAnalysis: this.labelAnalysis,
                yearAnalysis: this.yearAnalysis,
                artistAnalysis: this.artistAnalysis
            };
        } catch (error) {
            console.error('Error analyzing library:', error);
            return null;
        }
    }

    calculateBasicStatistics(tracks) {
        const stats = {
            totalTracks: tracks.length,
            totalDuration: 0,
            totalSize: 0,
            averageDuration: 0,
            averageSize: 0,
            localTracks: 0,
            streamingTracks: 0,
            uniqueArtists: 0,
            uniqueAlbums: 0,
            uniqueGenres: 0,
            uniqueLabels: 0,
            years: new Set(),
            decades: new Set()
        };

        const artists = new Set();
        const albums = new Set();
        const genres = new Set();
        const labels = new Set();

        tracks.forEach(track => {
            // Duration
            if (track.duration) {
                stats.totalDuration += track.duration;
            }

            // File size
            if (track.file_size) {
                stats.totalSize += track.file_size;
            }

            // Source counting
            if (track.source === 'local') {
                stats.localTracks++;
            } else {
                stats.streamingTracks++;
            }

            // Unique counts
            if (track.artist) artists.add(track.artist);
            if (track.album) albums.add(track.album);
            if (track.genre) genres.add(track.genre);
            if (track.label) labels.add(track.label);

            // Years and decades
            if (track.year) {
                stats.years.add(track.year);
                const decade = Math.floor(track.year / 10) * 10;
                stats.decades.add(decade);
            }
        });

        stats.uniqueArtists = artists.size;
        stats.uniqueAlbums = albums.size;
        stats.uniqueGenres = genres.size;
        stats.uniqueLabels = labels.size;
        stats.averageDuration = stats.totalTracks > 0 ? stats.totalDuration / stats.totalTracks : 0;
        stats.averageSize = stats.totalTracks > 0 ? stats.totalSize / stats.totalTracks : 0;

        // Convert to hours
        stats.totalDurationHours = Math.round((stats.totalDuration / 3600) * 10) / 10;
        stats.averageDurationMinutes = Math.round((stats.averageDuration / 60) * 10) / 10;

        // Convert to MB
        stats.totalSizeMB = Math.round((stats.totalSize / (1024 * 1024)) * 10) / 10;
        stats.averageSizeMB = Math.round((stats.averageSize / (1024 * 1024)) * 10) / 10;

        return stats;
    }

    analyzeGenres(tracks) {
        const genreCounts = {};
        const genreSubgenreCounts = {};
        const genreArtists = {};
        const genreAlbums = {};
        const genreDuration = {};

        tracks.forEach(track => {
            if (!track.genre) return;

            const genre = track.genre.toLowerCase();
            const subgenre = track.subgenre ? track.subgenre.toLowerCase() : 'no subgenre';
            const genreSubgenre = `${genre} - ${subgenre}`;

            // Count tracks
            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
            genreSubgenreCounts[genreSubgenre] = (genreSubgenreCounts[genreSubgenre] || 0) + 1;

            // Collect artists
            if (!genreArtists[genre]) genreArtists[genre] = new Set();
            if (track.artist) genreArtists[genre].add(track.artist);

            // Collect albums
            if (!genreAlbums[genre]) genreAlbums[genre] = new Set();
            if (track.album) genreAlbums[genre].add(track.album);

            // Sum duration
            genreDuration[genre] = (genreDuration[genre] || 0) + (track.duration || 0);
        });

        // Convert sets to counts and sort
        const analysis = {
            topGenres: this.sortByValue(genreCounts, 10),
            topSubgenres: this.sortByValue(genreSubgenreCounts, 10),
            genreArtists: Object.fromEntries(
                Object.entries(genreArtists).map(([genre, artists]) => [genre, artists.size])
            ),
            genreAlbums: Object.fromEntries(
                Object.entries(genreAlbums).map(([genre, albums]) => [genre, albums.size])
            ),
            genreDuration: Object.fromEntries(
                Object.entries(genreDuration).map(([genre, duration]) => [genre, Math.round(duration / 3600 * 10) / 10])
            )
        };

        return analysis;
    }

    analyzeLabels(tracks) {
        const labelCounts = {};
        const labelArtists = {};
        const labelGenres = {};
        const labelYears = {};

        tracks.forEach(track => {
            if (!track.label) return;

            const label = track.label.toLowerCase();

            // Count tracks
            labelCounts[label] = (labelCounts[label] || 0) + 1;

            // Collect artists
            if (!labelArtists[label]) labelArtists[label] = new Set();
            if (track.artist) labelArtists[label].add(track.artist);

            // Collect genres
            if (!labelGenres[label]) labelGenres[label] = new Set();
            if (track.genre) labelGenres[label].add(track.genre);

            // Collect years
            if (!labelYears[label]) labelYears[label] = new Set();
            if (track.year) labelYears[label].add(track.year);
        });

        const analysis = {
            topLabels: this.sortByValue(labelCounts, 10),
            labelArtists: Object.fromEntries(
                Object.entries(labelArtists).map(([label, artists]) => [label, artists.size])
            ),
            labelGenres: Object.fromEntries(
                Object.entries(labelGenres).map(([label, genres]) => [label, genres.size])
            ),
            labelYears: Object.fromEntries(
                Object.entries(labelYears).map(([label, years]) => [label, Array.from(years).sort()])
            )
        };

        return analysis;
    }

    analyzeYears(tracks) {
        const yearCounts = {};
        const yearGenres = {};
        const yearArtists = {};
        const yearLabels = {};
        const decadeCounts = {};

        tracks.forEach(track => {
            if (!track.year) return;

            const year = track.year;
            const decade = Math.floor(year / 10) * 10;

            // Count tracks by year
            yearCounts[year] = (yearCounts[year] || 0) + 1;
            decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;

            // Collect genres by year
            if (!yearGenres[year]) yearGenres[year] = new Set();
            if (track.genre) yearGenres[year].add(track.genre);

            // Collect artists by year
            if (!yearArtists[year]) yearArtists[year] = new Set();
            if (track.artist) yearArtists[year].add(track.artist);

            // Collect labels by year
            if (!yearLabels[year]) yearLabels[year] = new Set();
            if (track.label) yearLabels[year].add(track.label);
        });

        const analysis = {
            topYears: this.sortByValue(yearCounts, 10),
            topDecades: this.sortByValue(decadeCounts, 10),
            yearGenres: Object.fromEntries(
                Object.entries(yearGenres).map(([year, genres]) => [year, genres.size])
            ),
            yearArtists: Object.fromEntries(
                Object.entries(yearArtists).map(([year, artists]) => [year, artists.size])
            ),
            yearLabels: Object.fromEntries(
                Object.entries(yearLabels).map(([year, labels]) => [year, labels.size])
            )
        };

        return analysis;
    }

    analyzeArtists(tracks) {
        const artistCounts = {};
        const artistGenres = {};
        const artistLabels = {};
        const artistYears = {};
        const artistAlbums = {};
        const artistDuration = {};

        tracks.forEach(track => {
            if (!track.artist) return;

            const artist = track.artist.toLowerCase();

            // Count tracks
            artistCounts[artist] = (artistCounts[artist] || 0) + 1;

            // Collect genres
            if (!artistGenres[artist]) artistGenres[artist] = new Set();
            if (track.genre) artistGenres[artist].add(track.genre);

            // Collect labels
            if (!artistLabels[artist]) artistLabels[artist] = new Set();
            if (track.label) artistLabels[artist].add(track.label);

            // Collect years
            if (!artistYears[artist]) artistYears[artist] = new Set();
            if (track.year) artistYears[artist].add(track.year);

            // Collect albums
            if (!artistAlbums[artist]) artistAlbums[artist] = new Set();
            if (track.album) artistAlbums[artist].add(track.album);

            // Sum duration
            artistDuration[artist] = (artistDuration[artist] || 0) + (track.duration || 0);
        });

        const analysis = {
            topArtists: this.sortByValue(artistCounts, 10),
            artistGenres: Object.fromEntries(
                Object.entries(artistGenres).map(([artist, genres]) => [artist, genres.size])
            ),
            artistLabels: Object.fromEntries(
                Object.entries(artistLabels).map(([artist, labels]) => [artist, labels.size])
            ),
            artistYears: Object.fromEntries(
                Object.entries(artistYears).map(([artist, years]) => [artist, Array.from(years).sort()])
            ),
            artistAlbums: Object.fromEntries(
                Object.entries(artistAlbums).map(([artist, albums]) => [artist, albums.size])
            ),
            artistDuration: Object.fromEntries(
                Object.entries(artistDuration).map(([artist, duration]) => [artist, Math.round(duration / 3600 * 10) / 10])
            )
        };

        return analysis;
    }

    sortByValue(obj, limit = null) {
        const sorted = Object.entries(obj)
            .sort(([,a], [,b]) => b - a);
        
        return limit ? sorted.slice(0, limit) : sorted;
    }

    // Generate recommendations based on library analysis
    generateRecommendations(tracks, analysis) {
        const recommendations = {
            missingGenres: this.findMissingGenres(analysis.genreAnalysis),
            similarArtists: this.findSimilarArtists(tracks, analysis.artistAnalysis),
            labelSuggestions: this.findLabelSuggestions(analysis.labelAnalysis),
            yearGaps: this.findYearGaps(analysis.yearAnalysis),
            underRepresented: this.findUnderRepresented(tracks, analysis)
        };

        return recommendations;
    }

    findMissingGenres(genreAnalysis) {
        const commonGenres = [
            'rock', 'pop', 'electronic', 'jazz', 'classical', 'hip hop', 'r&b', 'country', 'folk', 'blues',
            'reggae', 'punk', 'metal', 'indie', 'alternative', 'dance', 'house', 'techno', 'ambient', 'experimental'
        ];

        const existingGenres = new Set(Object.keys(genreAnalysis.topGenres).map(g => g.toLowerCase()));
        return commonGenres.filter(genre => !existingGenres.has(genre));
    }

    findSimilarArtists(tracks, artistAnalysis) {
        // This would typically use a music recommendation API
        // For now, return artists with similar genre profiles
        const recommendations = {};
        
        Object.entries(artistAnalysis.topArtists).forEach(([artist, count]) => {
            if (count > 1) {
                recommendations[artist] = this.findArtistsWithSimilarGenres(tracks, artist);
            }
        });

        return recommendations;
    }

    findArtistsWithSimilarGenres(tracks, targetArtist) {
        const targetGenres = new Set();
        tracks.forEach(track => {
            if (track.artist?.toLowerCase() === targetArtist.toLowerCase() && track.genre) {
                targetGenres.add(track.genre.toLowerCase());
            }
        });

        const similarArtists = [];
        const artistGenres = {};

        tracks.forEach(track => {
            if (track.artist?.toLowerCase() !== targetArtist.toLowerCase() && track.genre) {
                if (!artistGenres[track.artist]) {
                    artistGenres[track.artist] = new Set();
                }
                artistGenres[track.artist].add(track.genre.toLowerCase());
            }
        });

        Object.entries(artistGenres).forEach(([artist, genres]) => {
            const intersection = new Set([...targetGenres].filter(x => genres.has(x)));
            const similarity = intersection.size / Math.max(targetGenres.size, genres.size);
            
            if (similarity > 0.3) {
                similarArtists.push({ artist, similarity });
            }
        });

        return similarArtists.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
    }

    findLabelSuggestions(labelAnalysis) {
        // Return labels that might be worth exploring based on current collection
        return Object.entries(labelAnalysis.topLabels)
            .filter(([, count]) => count >= 2)
            .map(([label]) => label);
    }

    findYearGaps(yearAnalysis) {
        const years = Object.keys(yearAnalysis.topYears).map(Number).sort();
        const gaps = [];
        
        for (let i = 0; i < years.length - 1; i++) {
            const gap = years[i + 1] - years[i];
            if (gap > 5) {
                gaps.push({
                    start: years[i],
                    end: years[i + 1],
                    gap: gap
                });
            }
        }
        
        return gaps;
    }

    findUnderRepresented(tracks, analysis) {
        const underRepresented = {
            genres: [],
            artists: [],
            years: []
        };

        // Find genres with only 1-2 tracks
        Object.entries(analysis.genreAnalysis.topGenres).forEach(([genre, count]) => {
            if (count <= 2) {
                underRepresented.genres.push({ genre, count });
            }
        });

        // Find artists with only 1 track
        Object.entries(analysis.artistAnalysis.topArtists).forEach(([artist, count]) => {
            if (count === 1) {
                underRepresented.artists.push({ artist, count });
            }
        });

        return underRepresented;
    }

    // Export analysis data
    exportAnalysis(format = 'json') {
        const data = {
            statistics: this.statistics,
            genreAnalysis: this.genreAnalysis,
            labelAnalysis: this.labelAnalysis,
            yearAnalysis: this.yearAnalysis,
            artistAnalysis: this.artistAnalysis,
            timestamp: new Date().toISOString()
        };

        if (format === 'csv') {
            return this.convertToCSV(data);
        }

        return JSON.stringify(data, null, 2);
    }

    convertToCSV(data) {
        // Convert analysis data to CSV format
        const csvRows = [];
        
        // Statistics
        csvRows.push(['Category', 'Metric', 'Value']);
        Object.entries(data.statistics).forEach(([key, value]) => {
            if (typeof value === 'number' || typeof value === 'string') {
                csvRows.push(['Statistics', key, value]);
            }
        });

        // Top genres
        csvRows.push(['', '', '']);
        csvRows.push(['Top Genres', 'Genre', 'Count']);
        data.genreAnalysis.topGenres.forEach(([genre, count]) => {
            csvRows.push(['Top Genres', genre, count]);
        });

        // Top artists
        csvRows.push(['', '', '']);
        csvRows.push(['Top Artists', 'Artist', 'Count']);
        data.artistAnalysis.topArtists.forEach(([artist, count]) => {
            csvRows.push(['Top Artists', artist, count]);
        });

        return csvRows.map(row => row.join(',')).join('\n');
    }
}

export default LibraryOrganizer; 