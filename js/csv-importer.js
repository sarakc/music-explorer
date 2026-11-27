// CSV Importer: parse Rekordbox CSV/XML and Shazam CSV into the unified track schema.
//
// Identity: `id` is the legacy metadata hash (`rb_<hash(artist|title|album)>`)
// so existing users' ids stay put. `recordingKey` carries the same hash even
// when music-database.js has to give a same-tagged alternate file its own id,
// and `rekordbox_xml_id` / `local_path` are the bindings the upsert uses to
// recognise a track whose tags changed (see planImportUpsert).

// Legacy 32-bit string hash → base36. Kept byte-for-byte so ids don't churn.
export function hashKey(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h).toString(36);
}

// Rekordbox's own exports are tab-separated; most other tools use commas.
export function detectDelimiter(headerLine) {
    return String(headerLine || '').includes('\t') ? '\t' : ',';
}

// RFC 4180 record parser: a quoted field may contain the delimiter, newlines
// and doubled quotes (`""` → `"`). Records end at CR, LF or CRLF outside
// quotes. Blank lines are dropped; empty fields (including a trailing one)
// are kept. Fields are trimmed, matching the legacy parser.
export function parseCSVRecords(text, delimiter = null) {
    const src = String(text ?? '').replace(/^\uFEFF/, '');
    const delim = delimiter || detectDelimiter(src.slice(0, src.search(/\r|\n|$/)));
    const records = [];
    let fields = [];
    let field = '';
    let inQuotes = false;

    const endField = () => { fields.push(field.trim()); field = ''; };
    const endRecord = () => {
        endField();
        if (fields.length > 1 || fields[0] !== '') records.push(fields);
        fields = [];
    };

    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inQuotes) {
            if (ch !== '"') field += ch;
            else if (src[i + 1] === '"') { field += '"'; i++; }
            else inQuotes = false;
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === delim) {
            endField();
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && src[i + 1] === '\n') i++;
            endRecord();
        } else {
            field += ch;
        }
    }
    if (field || fields.length) endRecord();
    return records;
}

const splitTags = (comments) => (comments
    ? comments.split(',').map((t) => t.trim()).filter(Boolean)
    : []);

// One builder for both Rekordbox CSV rows and XML <TRACK> elements so the two
// paths can't drift on id, tags or the cover-art sentinel.
export function rekordboxTrackFromFields({
    title = '', artist = '', album = '', label = '', genre = '', comments = '',
    bpm = 0, year = null, duration = 0, tonality = '', localPath = '',
    dateAdded = '', playCount = 0, lastPlayed = '', sourceTrackId = null,
} = {}) {
    const id = 'rb_' + hashKey(`${artist}|${title}|${album}`);
    return {
        id,
        recordingKey: id,
        title,
        artist,
        album,
        genre,
        year,
        duration,
        platform: 'local',
        source: 'rekordbox',
        availability: 'local',
        label,
        bpm,
        tonality,
        comments,
        tags: splitTags(comments),
        local_path: localPath,
        date_added: dateAdded,
        play_count: playCount,
        last_played: lastPlayed,
        // Sentinel: coverArtUrl() resolves this to /api/library/art/:id
        // which extracts the APIC frame on demand. Only set when a file
        // path exists — streaming/remote rows stay null.
        coverArt: localPath ? `local:${id}` : null,
        coverArt_source: localPath ? 'local' : null,
        // Rekordbox's collection TrackID — stable across exports, so the
        // upsert can follow a track through retags and relocations.
        rekordbox_xml_id: sourceTrackId ? String(sourceTrackId) : null,
    };
}

// The header names each import reads. The header row is the first record that
// names at least two of them, so a preamble (Shazam's "Shazam Library" line) is
// skipped; with no such record it is the first line.
const REKORDBOX_COLUMNS = ['Track Name', 'Name', 'Title', 'Artist Name', 'Artist', 'Album', 'Label', 'Genre', 'BPM', 'File', 'File Path'];
const SHAZAM_COLUMNS = ['Index', 'TagTime', 'Title', 'title', 'Name', 'Artist', 'artist', 'URL', 'url', 'TrackKey'];

export function findHeaderRow(records, columns = []) {
    const known = new Set(columns);
    const i = records.findIndex((r) => r.filter((cell) => known.has(cell)).length >= 2);
    return i < 0 ? 0 : i;
}

class CSVImporter {
    parseCSV(text, columns = []) {
        const all = parseCSVRecords(text);
        const [headers, ...records] = all.slice(findHeaderRow(all, columns));
        if (!headers || !records.length) return [];
        return records.map((values) => {
            const row = {};
            headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
            return row;
        });
    }

    _hash(str) {
        return hashKey(str);
    }

    importRekordboxCSV(csvText) {
        return this.parseCSV(csvText, REKORDBOX_COLUMNS).map((row) => {
            const genre = row['Genre'] || '';
            const subgenre = row['Subgenre'] || '';
            return rekordboxTrackFromFields({
                title: row['Track Name'] || row['Name'] || row['Title'] || '',
                artist: row['Artist Name'] || row['Artist'] || '',
                album: row['Album'] || '',
                label: row['Label'] || '',
                genre: subgenre ? `${genre}: ${subgenre}` : genre,
                comments: row['Comments'] || row['Comment'] || '',
                bpm: parseFloat(row['BPM'] || '0') || 0,
                localPath: row['File'] || row['File Path'] || '',
                dateAdded: row['Date Added'] || row['DateAdded'] || '',
                playCount: parseInt(row['PlayCount'] || row['Play Count'] || row['Plays'] || '0', 10) || 0,
                lastPlayed: row['Last Played'] || row['DateLastPlayed'] || row['Last Played At'] || '',
            });
        }).filter((t) => t.title || t.artist);
    }

    importRekordboxXML(xmlText) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'text/xml');
        const trackEls = doc.querySelectorAll('COLLECTION TRACK');

        return Array.from(trackEls).map((el) => {
            // Decode file:// URL to local path
            const location = el.getAttribute('Location') || '';
            let localPath = '';
            if (location) {
                try {
                    localPath = decodeURIComponent(location.replace('file://localhost', ''));
                } catch { localPath = location; }
            }

            return rekordboxTrackFromFields({
                title: el.getAttribute('Name') || '',
                artist: el.getAttribute('Artist') || '',
                album: el.getAttribute('Album') || '',
                label: el.getAttribute('Label') || '',
                genre: el.getAttribute('Genre') || '',
                comments: el.getAttribute('Comments') || '',
                bpm: parseFloat(el.getAttribute('AverageBpm') || '0') || 0,
                year: parseInt(el.getAttribute('Year') || '0') || null,
                duration: parseInt(el.getAttribute('TotalTime') || '0') || 0,
                tonality: el.getAttribute('Tonality') || '',
                localPath,
                dateAdded: el.getAttribute('DateAdded') || '',
                playCount: parseInt(el.getAttribute('PlayCount') || '0', 10) || 0,
                lastPlayed: el.getAttribute('DateLastPlayed') || el.getAttribute('LastPlayed') || '',
                sourceTrackId: el.getAttribute('TrackID') || null,
            });
        }).filter((t) => t.title || t.artist);
    }

    importShazamCSV(csvText) {
        return this.parseCSV(csvText, SHAZAM_COLUMNS).map((row) => {
            // Shazam CSV columns vary but typically: Index, TagTime, Title, Artist, URL, TrackKey
            const title = row['Title'] || row['title'] || row['Name'] || '';
            const artist = row['Artist'] || row['artist'] || '';
            const url = row['URL'] || row['url'] || row['TrackKey'] || '';

            const id = 'shazam_' + hashKey(`${artist}|${title}`);

            return {
                id,
                recordingKey: id,
                title,
                artist,
                album: '',
                genre: '',
                year: null,
                duration: 0,
                platform: 'shazam',
                source: 'shazam',
                availability: 'streaming',
                tags: [],
                shazam_url: url,
            };
        }).filter((t) => t.title || t.artist);
    }
}

export default CSVImporter;
