// Stored reasons: `[[signal, s, detail], …]` with `s` to 3 places, about a
// third smaller than the `{ signal, s, detail }` objects the blend returns.
// Reading takes either form, so a file written before the change still reads.
const round3 = (v) => Math.round(v * 1000) / 1000;

export const encodeReasons = (reasons) => JSON.stringify((reasons || []).map((r) => (r.detail === undefined ? [r.signal, round3(r.s)] : [r.signal, round3(r.s), r.detail])));

export function decodeReasons(text) {
  const list = typeof text === 'string' ? JSON.parse(text) : text || [];
  return list.map((r) => (Array.isArray(r) ? (r.length > 2 ? { signal: r[0], s: r[1], detail: r[2] } : { signal: r[0], s: r[1] }) : r));
}
