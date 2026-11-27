// Platform checks shared by playback code. One place decides "is iOS", so the
// lock-screen handlers (player.js) and any later iOS-only playback agree.

/**
 * iPhone, iPod or iPad, in any browser (every iOS browser is WebKit). iPadOS
 * reports itself as a Mac by default, so a "Macintosh" with a touch screen counts
 * too; Macs report no touch points.
 */
export function isIOS(nav = globalThis.navigator) {
    const ua = String(nav?.userAgent || '');
    if (/\b(iPhone|iPad|iPod)\b/.test(ua)) return true;
    return /\bMacintosh\b/.test(ua) && Number(nav?.maxTouchPoints) > 1;
}
