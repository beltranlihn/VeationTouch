// Minimal OSC 1.0 encoder (messages + bundles) — no dependency.
// Types used: i (int32), f (float32), s (string). Big-endian, 4-byte aligned.

const pad4 = (n) => (n + 3) & ~3;

function oscString(s) {
  const b = Buffer.from(String(s), 'utf8');
  const out = Buffer.alloc(pad4(b.length + 1));
  b.copy(out);
  return out;
}

/**
 * @param {string} address
 * @param {(number|string|{i:number}|{f:number})[]} args  numbers are floats unless wrapped as {i}
 */
export function message(address, args = []) {
  let tags = ',';
  const parts = [];
  for (const a of args) {
    if (typeof a === 'string') { tags += 's'; parts.push(oscString(a)); }
    else if (a && typeof a === 'object' && 'i' in a) { tags += 'i'; const b = Buffer.alloc(4); b.writeInt32BE(a.i | 0); parts.push(b); }
    else { tags += 'f'; const b = Buffer.alloc(4); b.writeFloatBE(Number.isFinite(a?.f ?? a) ? (a?.f ?? a) : 0); parts.push(b); }
  }
  return Buffer.concat([oscString(address), oscString(tags), ...parts]);
}

export const i = (v) => ({ i: v });

const BUNDLE_HEAD = oscString('#bundle');
const IMMEDIATE = Buffer.from([0, 0, 0, 0, 0, 0, 0, 1]);

/** One bundle with timetag "immediately". */
export function bundle(elements) {
  const parts = [BUNDLE_HEAD, IMMEDIATE];
  for (const e of elements) {
    const len = Buffer.alloc(4);
    len.writeInt32BE(e.length);
    parts.push(len, e);
  }
  return Buffer.concat(parts);
}

/** Pack messages into as few bundles as possible, each below `maxBytes` (no IP fragmentation). */
export function bundles(messages, maxBytes = 1400) {
  const out = [];
  let cur = [], size = 16;
  for (const m of messages) {
    if (cur.length && size + 4 + m.length > maxBytes) { out.push(bundle(cur)); cur = []; size = 16; }
    cur.push(m); size += 4 + m.length;
  }
  if (cur.length) out.push(bundle(cur));
  return out;
}

/** Decoder — used by tests and the "listen" tool in the UI. */
export function decode(buf) {
  const readStr = (o) => { let e = o; while (buf[e] !== 0) e++; return [buf.toString('utf8', o, e), pad4(e + 1)]; };
  if (buf.toString('utf8', 0, 7) === '#bundle') {
    const out = [];
    let o = 16;
    while (o < buf.length) {
      const n = buf.readInt32BE(o); o += 4;
      out.push(...decodeElements(buf.subarray(o, o + n)));
      o += n;
    }
    return out;
  }
  const [address, o1] = readStr(0);
  const [tags, o2] = readStr(o1);
  const args = [];
  let o = o2;
  for (const t of tags.slice(1)) {
    if (t === 'i') { args.push(buf.readInt32BE(o)); o += 4; }
    else if (t === 'f') { args.push(buf.readFloatBE(o)); o += 4; }
    else if (t === 's') { const [s, n] = readStr(o); args.push(s); o = n; }
  }
  return [{ address, args }];
}

function decodeElements(b) { return decode(b); }
