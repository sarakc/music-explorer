// Shared markup helpers: HTML escaping and the words for the library's kinds.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text made safe for HTML content and quoted attributes; null and undefined become ''. */
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** A kind's display word: artist → Artist. */
export const TYPE_WORD = Object.freeze({ artist: 'Artist', label: 'Label', tag: 'Tag', album: 'Album', track: 'Track' });
