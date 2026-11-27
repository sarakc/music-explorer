// Info's items: names, rows and covers. Each carries its kind's shape and, as --c, its map colour.

import { glyphSvg } from './kind-glyph.js';
import { escapeHtml as esc } from './html.js';
import { VIEWER } from './viewer-profile.js';

const style = (colour) => (colour?.fill ? ` style="--c:${esc(colour.fill)}"` : '');
const glyphOf = (type, colour, owned) => glyphSvg(type, { fill: colour?.fill || null, soft: colour?.soft || null, owned });

/** An entity link: its shape, then its name. Not owned: an outline shape and a dimmer word. */
export function nameHtml({ id, type, name, colour = null, owned = true, attrs = '' }) {
    return `<button type="button" class="ik-name${owned ? '' : ' is-out'}" data-id="${esc(id)}"${style(colour)}${attrs ? ` ${attrs}` : ''}>${glyphOf(type, colour, owned)}<span class="tx">${esc(name)}</span></button>`;
}

/** A track row: ▶, the title and a faint "· by"; `hint` ("124 BPM · 8A") shows on hover. */
export function trackRowHtml({ id, title, by = '', hint = '', colour = null, owned = true, linked = true, playable = true, showPlay = !VIEWER, attrs = '' }) {
    return `<div class="ik-row" data-track-id="${esc(id)}" role="button" tabindex="0"${hint ? ` title="${esc(hint)}"` : ''}${style(colour)}${attrs ? ` ${attrs}` : ''}>`
        + (showPlay ? `<button type="button" class="ik-play" data-row-play="${esc(id)}" aria-label="Play ${esc(title || 'track')}"${playable ? '' : ' disabled'}>▶</button>` : '')
        + glyphOf('track', colour, owned && linked)
        + `<span class="ti">${esc(title || 'Untitled')}</span>${by ? `<span class="by"> · ${esc(by)}</span>` : ''}</div>`;
}

/** A release the library lacks: an outline album square, the title and the year. */
export function releaseRowHtml({ index, title, artist = '', year = '', colour = null }) {
    return `<li class="ik-row is-release" data-missing-release="${esc(index)}" tabindex="0" role="button"${style(colour)}>${glyphOf('album', colour, false)}`
        + `<span class="ti">${esc(title)}${artist ? `<span class="by"> · ${esc(artist)}</span>` : ''}</span>${year ? `<span class="bpm">${esc(year)}</span>` : ''}</li>`;
}

/** An album as a cover: a 50px square (the art when there is one) and its title. */
export function coverHtml({ id, name, src = '', colour = null, owned = true, attrs = '' }) {
    return `<button type="button" class="ik-cover${owned ? '' : ' is-out'}" data-id="${esc(id)}"${style(colour)}${attrs ? ` ${attrs}` : ''}>`
        + `<span class="sq">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}</span><span class="t">${esc(name)}</span></button>`;
}

/** The ruled list. */
export const rowsHtml = (rows) => `<div class="ik-rows">${rows.join('')}</div>`;
