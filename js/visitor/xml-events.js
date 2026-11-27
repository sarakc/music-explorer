// A small streaming XML tokenizer for the two library formats a visitor opens
// (Rekordbox XML and Music.app's Library.xml). It reads strings (decoded upstream)
// and yields open, close and text events; it never holds a DOM. The prolog,
// DOCTYPE, comments and processing instructions are skipped; CDATA is text.
// A tag, attribute or entity cut across chunks gives the same events.

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** The five named entities and numeric ones (`&#38;`, `&#x263A;`); anything else is kept as written. */
export function decodeEntities(s) {
  if (!s.includes('&')) return s;
  return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] !== '#') return NAMED[body] ?? m;
    const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });
}

const ATTR = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function openTag(inner) {
  let body = inner, selfClosing = false;
  if (body.endsWith('/')) { selfClosing = true; body = body.slice(0, -1); }
  const name = body.match(/^[^\s/>]+/)?.[0] ?? '';
  const attrs = {};
  ATTR.lastIndex = name.length;
  for (let m; (m = ATTR.exec(body));) attrs[m[1]] = decodeEntities(m[2] ?? m[3]);
  return { type: 'open', name, attrs, selfClosing };
}

/** Index of the `>` closing a start tag at `from`, outside quoted values, or -1. */
function tagEnd(buf, from) {
  let quote = '';
  for (let i = from; i < buf.length; i++) {
    const c = buf[i];
    if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c; else if (c === '>') return i;
  }
  return -1;
}

/** Index of the `>` closing a `<!DOCTYPE …>` (an internal subset `[ … ]` may hold `>`), or -1. */
function declEnd(buf, from) {
  let depth = 0;
  for (let i = from; i < buf.length; i++) {
    const c = buf[i];
    if (c === '[') depth++; else if (c === ']') depth--; else if (c === '>' && depth <= 0) return i;
  }
  return -1;
}

/**
 * xmlEvents(chunks: AsyncIterable<string> | Iterable<string>) =>
 *   AsyncGenerator<{ type: 'open', name, attrs, selfClosing } | { type: 'close', name } | { type: 'text', text }>
 */
export async function* xmlEvents(chunks) {
  let buf = '', text = '';
  const events = [];
  // Consumes what it can of `buf`, pushing events; returns the unread rest.
  const step = (final) => {
    let pos = 0;
    const flush = () => { if (text) { events.push({ type: 'text', text }); text = ''; } };
    while (pos < buf.length) {
      if (buf[pos] !== '<') {
        const lt = buf.indexOf('<', pos);
        if (lt === -1) { if (!final) break; text += decodeEntities(buf.slice(pos)); pos = buf.length; break; }
        text += decodeEntities(buf.slice(pos, lt));
        pos = lt;
        continue;
      }
      const rest = buf.length - pos;
      if (rest < 2 && !final) break;
      const next = buf[pos + 1];
      let end;
      if (next === '!') {
        if (buf.startsWith('<!--', pos)) {
          end = buf.indexOf('-->', pos + 4);
          if (end === -1) break;
          flush(); pos = end + 3; continue;
        }
        if (rest < 9 && !final) break;
        if (buf.startsWith('<![CDATA[', pos)) {
          end = buf.indexOf(']]>', pos + 9);
          if (end === -1) break;
          text += buf.slice(pos + 9, end); pos = end + 3; continue;
        }
        end = declEnd(buf, pos + 2);
        if (end === -1) break;
        flush(); pos = end + 1; continue;
      }
      if (next === '?') {
        end = buf.indexOf('?>', pos + 2);
        if (end === -1) break;
        flush(); pos = end + 2; continue;
      }
      if (next === '/') {
        end = buf.indexOf('>', pos + 2);
        if (end === -1) break;
        flush(); events.push({ type: 'close', name: buf.slice(pos + 2, end).trim() }); pos = end + 1; continue;
      }
      end = tagEnd(buf, pos + 1);
      if (end === -1) break;
      flush(); events.push(openTag(buf.slice(pos + 1, end).trim())); pos = end + 1;
    }
    if (final) flush();
    buf = buf.slice(pos);
  };
  for await (const chunk of chunks) {
    buf += chunk;
    step(false);
    for (const e of events) yield e;
    events.length = 0;
  }
  step(true);
  yield* events;
}
