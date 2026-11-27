// ReleaseChecker: looks up the latest release per artist/label via backend Discogs proxy
// Caches results in IndexedDB settings store (24hr TTL)

class ReleaseChecker {
    constructor(database) {
        this.database = database;
        this.CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    }

    _cacheKey(type, name) {
        return `release_cache_${type}_${name.toLowerCase().replace(/\s+/g, '_')}`;
    }

    async _getCached(type, name) {
        if (!this.database) return null;
        const key = this._cacheKey(type, name);
        const cached = await this.database.getSetting(key);
        if (!cached) return null;
        if (Date.now() - cached.timestamp > this.CACHE_TTL) return null;
        return cached.data;
    }

    async _setCache(type, name, data) {
        if (!this.database) return;
        const key = this._cacheKey(type, name);
        await this.database.saveSetting(key, { data, timestamp: Date.now() });
    }

    async getLatestRelease(name, type = 'artist') {
        // Check cache first
        const cached = await this._getCached(type, name);
        if (cached !== null) return cached;

        try {
            const endpoint = type === 'label' ? 'label' : 'artist';
            const res = await fetch(`/api/releases/${endpoint}/${encodeURIComponent(name)}`);
            if (!res.ok) return null;
            const data = await res.json();
            await this._setCache(type, name, data);
            return data;
        } catch {
            return null;
        }
    }

    async batchCheck(names, type = 'artist', onProgress) {
        const results = [];
        for (let i = 0; i < names.length; i++) {
            const result = await this.getLatestRelease(names[i], type);
            results.push(result);
            if (onProgress) onProgress(i + 1, names.length, names[i], result);
        }
        return results;
    }
}

export default ReleaseChecker;
