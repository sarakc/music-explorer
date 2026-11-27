// CrateManager: persist FilterEngine state snapshots via the db client.

import { dbGetAll, dbGet, dbPut, dbDelete } from './db-client.js';

const STORE = 'crates';

const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));

class CrateManager {
    constructor(database) {
        this.database = database;
    }

    async list() {
        const crates = await dbGetAll(STORE);
        crates.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        return crates;
    }

    get(id) {
        return dbGet(STORE, id);
    }

    async save(name, filterState) {
        const now = Date.now();
        const crate = {
            id: crypto.randomUUID(),
            name: String(name || '').trim() || 'Untitled filter',
            filterState: deepCopy(filterState),
            createdAt: now,
            updatedAt: now,
        };
        return this._put(crate);
    }

    async rename(id, newName) {
        const existing = await this.get(id);
        if (!existing) return null;
        existing.name = String(newName || '').trim() || existing.name;
        existing.updatedAt = Date.now();
        return this._put(existing);
    }

    async update(id, filterState) {
        const existing = await this.get(id);
        if (!existing) return null;
        existing.filterState = deepCopy(filterState);
        existing.updatedAt = Date.now();
        return this._put(existing);
    }

    async duplicate(id) {
        const existing = await this.get(id);
        if (!existing) return null;
        const now = Date.now();
        const copy = {
            id: crypto.randomUUID(),
            name: `${existing.name} (copy)`,
            filterState: deepCopy(existing.filterState),
            createdAt: now,
            updatedAt: now,
        };
        return this._put(copy);
    }

    async delete(id) {
        await dbDelete(STORE, id);
    }

    async _put(crate) {
        await dbPut(STORE, crate.id, crate);
        return crate;
    }
}

export default CrateManager;
