// Art-Net ArtDmx packet (protocol revision 14), implemented from the published specification.
// Art-Net™ Designed by and Copyright Artistic Licence Holdings Ltd.
//
//   "Art-Net\0" · OpCode 0x5000 (LE) · ProtVer 14 (BE) · Sequence · Physical · SubUni · Net · Length (BE) · Data
// The 15-bit Port-Address is Net (7 bits) : Sub-Net (4) : Universe (4); SubUni carries its low byte.

const ID = Buffer.from('Art-Net\0', 'latin1');

/**
 * @param {number} portAddress 0–32767
 * @param {number} sequence    1–255 (0 = sequencing disabled)
 * @param {Uint8Array} data    DMX slots 1…n (n even, 2–512)
 */
export function artDmx(portAddress, sequence, data) {
  const n = Math.min(512, Math.max(2, (data.length + 1) & ~1));
  const buf = Buffer.alloc(18 + n);
  ID.copy(buf, 0);
  buf.writeUInt16LE(0x5000, 8);
  buf.writeUInt16BE(14, 10);
  buf[12] = sequence & 0xff;
  buf[13] = 0;
  buf[14] = portAddress & 0xff;
  buf[15] = (portAddress >> 8) & 0x7f;
  buf.writeUInt16BE(n, 16);
  buf.set(data.subarray(0, n), 18);
  return buf;
}

/** Parse an ArtDmx packet (tests, diagnostics). null if it is not one. */
export function parseArtDmx(buf) {
  if (buf.length < 20 || !buf.subarray(0, 8).equals(ID) || buf.readUInt16LE(8) !== 0x5000) return null;
  const n = buf.readUInt16BE(16);
  return { version: buf.readUInt16BE(10), sequence: buf[12], portAddress: buf[14] | (buf[15] << 8), data: buf.subarray(18, 18 + n) };
}
