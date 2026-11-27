// Enhanced Metadata Extractor - Combines functionality from old Python scripts
class EnhancedMetadataExtractor {
    constructor() {
        this.musicBrainzBaseUrl = 'https://musicbrainz.org/ws/2/';
        this.cache = new Map();
        this.fuzzyThreshold = 90;
        this.weightTrackName = 0.7;
        this.weightArtistName = 0.3;
    }

    async extractMetadata(file) {
        try {
            const basicMetadata = await this.extractBasicMetadata(file);
            const id3Metadata = await this.extractID3Metadata(file);
            const musicBrainzMetadata = await this.searchMusicBrainz(basicMetadata);
            
            // Merge all metadata sources, prioritizing ID3 > MusicBrainz > Basic
            const mergedMetadata = {
                ...basicMetadata,
                ...musicBrainzMetadata,
                ...id3Metadata
            };

            // Clean and normalize the metadata
            return this.normalizeMetadata(mergedMetadata);
        } catch (error) {
            console.error('Error extracting metadata:', error);
            return basicMetadata;
        }
    }

    async extractBasicMetadata(file) {
        const metadata = {
            id: this.generateId(),
            title: this.extractTitle(file.name),
            artist: this.extractArtist(file.name),
            album: this.extractAlbum(file.name),
            genre: 'unknown',
            duration: 0,
            platform: 'local',
            source: 'local',
            availability: 'local',
            filePath: file.name,
            local_path: file.name,
            file_size: file.size,
            last_modified: file.lastModified,
            tags: [],
            year: new Date(file.lastModified).getFullYear(),
            label: '',
            composer: '',
            grouping: '',
            comments: '',
            bpm: 0
        };

        // Extract duration using Web Audio API
        if (file.type.startsWith('audio/')) {
            const audioMetadata = await this.extractAudioMetadata(file);
            Object.assign(metadata, audioMetadata);
        }

        return metadata;
    }

    async extractID3Metadata(file) {
        try {
            // For web-based ID3 extraction, we'll use a library or manual parsing
            // This is a simplified version - in a real implementation, you'd use a proper ID3 library
            const arrayBuffer = await file.arrayBuffer();
            const metadata = {};
            
            // Basic ID3v2 header detection
            const view = new DataView(arrayBuffer);
            if (view.byteLength >= 10) {
                const header = new TextDecoder().decode(arrayBuffer.slice(0, 3));
                if (header === 'ID3') {
                    // Extract basic ID3 information
                    metadata.title = this.extractID3Frame(arrayBuffer, 'TIT2') || metadata.title;
                    metadata.artist = this.extractID3Frame(arrayBuffer, 'TPE1') || metadata.artist;
                    metadata.album = this.extractID3Frame(arrayBuffer, 'TALB') || metadata.album;
                    metadata.genre = this.extractID3Frame(arrayBuffer, 'TCON') || metadata.genre;
                    metadata.year = this.extractID3Frame(arrayBuffer, 'TYER') || metadata.year;
                    metadata.composer = this.extractID3Frame(arrayBuffer, 'TCOM') || metadata.composer;
                    metadata.grouping = this.extractID3Frame(arrayBuffer, 'TIT1') || metadata.grouping;
                    metadata.comments = this.extractID3Frame(arrayBuffer, 'COMM') || metadata.comments;
                    metadata.label = this.extractID3Frame(arrayBuffer, 'TPUB') || metadata.label;
                    metadata.bpm = this.extractID3Frame(arrayBuffer, 'TBPM') || metadata.bpm;
                }
            }
            
            return metadata;
        } catch (error) {
            console.error('Error extracting ID3 metadata:', error);
            return {};
        }
    }

    extractID3Frame(arrayBuffer, frameId) {
        try {
            const view = new DataView(arrayBuffer);
            const textDecoder = new TextDecoder('utf-8');
            
            // Search for the frame ID
            for (let i = 0; i < view.byteLength - 4; i++) {
                const frame = textDecoder.decode(arrayBuffer.slice(i, i + 4));
                if (frame === frameId) {
                    // Extract frame data (simplified)
                    const frameSize = view.getUint32(i + 4, false);
                    if (i + 8 + frameSize <= view.byteLength) {
                        const frameData = arrayBuffer.slice(i + 10, i + 10 + frameSize - 1);
                        return textDecoder.decode(frameData).replace(/\0/g, '');
                    }
                }
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    async searchMusicBrainz(metadata) {
        try {
            const cacheKey = `${metadata.title}-${metadata.artist}`;
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }

            const query = `artist:"${metadata.artist}" AND recording:"${metadata.title}"`;
            const url = `${this.musicBrainzBaseUrl}recording/?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
            
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'UnifiedMusicManager/1.0.0 (https://github.com/your-repo)'
                }
            });

            if (!response.ok) {
                return {};
            }

            const data = await response.json();
            const mbMetadata = this.parseMusicBrainzResponse(data, metadata);
            
            this.cache.set(cacheKey, mbMetadata);
            return mbMetadata;
        } catch (error) {
            console.error('Error searching MusicBrainz:', error);
            return {};
        }
    }

    parseMusicBrainzResponse(data, originalMetadata) {
        if (!data.recordings || data.recordings.length === 0) {
            return {};
        }

        // Find the best match using fuzzy matching
        let bestMatch = null;
        let bestScore = 0;

        for (const recording of data.recordings) {
            const titleScore = this.fuzzyMatch(originalMetadata.title, recording.title);
            const artistScore = this.fuzzyMatch(originalMetadata.artist, recording['artist-credit'][0].artist.name);
            
            const combinedScore = (this.weightTrackName * titleScore + this.weightArtistName * artistScore) / 
                                (this.weightTrackName + this.weightArtistName);

            if (combinedScore > bestScore && combinedScore >= this.fuzzyThreshold) {
                bestScore = combinedScore;
                bestMatch = recording;
            }
        }

        if (!bestMatch) {
            return {};
        }

        return {
            title: bestMatch.title,
            artist: bestMatch['artist-credit'][0].artist.name,
            album: bestMatch.releases?.[0]?.title || originalMetadata.album,
            year: bestMatch.releases?.[0]?.['date']?.substring(0, 4) || originalMetadata.year,
            label: bestMatch.releases?.[0]?.['label-info']?.[0]?.label?.name || originalMetadata.label,
            genre: bestMatch.tags?.[0]?.name || originalMetadata.genre,
            musicbrainz_id: bestMatch.id,
            confidence_score: bestScore
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

    normalizeMetadata(metadata) {
        return {
            ...metadata,
            title: this.normalizeString(metadata.title),
            artist: this.normalizeString(metadata.artist),
            album: this.normalizeString(metadata.album),
            genre: this.normalizeString(metadata.genre),
            label: this.normalizeString(metadata.label),
            composer: this.normalizeString(metadata.composer),
            grouping: this.normalizeString(metadata.grouping),
            comments: this.normalizeString(metadata.comments),
            tags: Array.isArray(metadata.tags) ? metadata.tags.map(t => this.normalizeString(t)) : [],
            year: parseInt(metadata.year) || new Date().getFullYear(),
            bpm: parseInt(metadata.bpm) || 0,
            duration: parseFloat(metadata.duration) || 0
        };
    }

    normalizeString(str) {
        if (!str) return '';
        return str.trim()
            .replace(/\s+/g, ' ')
            .replace(/[^\w\s\-\.]/g, '')
            .toLowerCase();
    }

    extractTitle(filename) {
        let title = filename.replace(/\.[^/.]+$/, '');
        title = title.replace(/^\d+\s*[-_]\s*/, '');
        title = title.replace(/[-_]/g, ' ');
        return title.trim();
    }

    extractArtist(filename) {
        const parts = filename.split(' - ');
        if (parts.length > 1) {
            return parts[0].trim();
        }
        return 'Unknown Artist';
    }

    extractAlbum(filename) {
        const pathParts = filename.split('/');
        return pathParts[pathParts.length - 1] || 'Unknown Album';
    }

    async extractAudioMetadata(file) {
        return new Promise((resolve) => {
            const audio = new Audio();
            const url = URL.createObjectURL(file);
            
            audio.addEventListener('loadedmetadata', () => {
                const duration = audio.duration || 0;
                URL.revokeObjectURL(url);
                resolve({ duration });
            });
            
            audio.addEventListener('error', () => {
                URL.revokeObjectURL(url);
                resolve({ duration: 0 });
            });
            
            audio.src = url;
        });
    }

    generateId() {
        return Date.now() + Math.random().toString(36).substr(2, 9);
    }

    // Compare two tracks for similarity
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

    // Find similar tracks in a collection
    findSimilarTracks(targetTrack, trackCollection, threshold = null) {
        const matchThreshold = threshold || this.fuzzyThreshold;
        const matches = [];
        
        for (const track of trackCollection) {
            const comparison = this.compareTracks(targetTrack, track);
            if (comparison.isMatch) {
                matches.push({
                    track,
                    ...comparison
                });
            }
        }
        
        return matches.sort((a, b) => b.score - a.score);
    }
}

export default EnhancedMetadataExtractor; 