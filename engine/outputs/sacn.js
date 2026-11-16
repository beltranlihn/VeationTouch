// sACN — ANSI E1.31 "Streaming ACN" DMX data packet, implemented from the published standard (E1.31-2018).
// Fixed 126-byte header + START code + up to 512 slots, UDP port 5568, multicast 239.255.<universe hi>.<universe lo>.
//
//   Root layer     0–37    preamble 0x0010 · postamble 0 · "ASC-E1.17\0\0\0" · flags+length · vector 4 · CID (16)
//   Framing layer  38–114  flags+length · vector 2 · source name (64, UTF-8) · priority · sync addr · sequence · options · universe
//   DMP layer      115–…   flags+length · vector 2 · 0xA1 · first address 0 · increment 1 · count · START code 0 · slots

export const SACN_PORT = 5568;
const ACN_ID = Buffer.from('ASC-E1.17\0\0\0', 'latin1');
const fl = (len) => 0x7000 | (len & 0x0fff); // flags 0x7 + 12-bit PDU length

/** Multicast group of a universe (1–63999). */
export const sacnGroup = (universe) => `239.255.${(universe >> 8) & 0xff}.${universe & 0xff}`;

/**
 * @param {{universe:number, sequence:number, cid:Buffer, source?:string, priority?:number, terminated?:boolean}} o
 * @param {Uint8Array} data  DMX slots 1…n (n ≤ 512)
 */
export function sacnPacket({ universe, sequence, cid, source = 'VEATION Touch', priority = 100, terminated = false }, data) {
  const n = Math.min(512, data.length);
  const buf = Buffer.alloc(126 + n);
  buf.writeUInt16BE(0x0010, 0);
  buf.writeUInt16BE(0x0000, 2);
  ACN_ID.copy(buf, 4);
  buf.writeUInt16BE(fl(buf.length - 16), 16);
  buf.writeUInt32BE(0x00000004, 18);          // VECTOR_ROOT_E131_DATA
  cid.copy(buf, 22, 0, 16);
  buf.writeUInt16BE(fl(buf.length - 38), 38);
  buf.writeUInt32BE(0x00000002, 40);          // VECTOR_E131_DATA_PACKET
  buf.write(source.slice(0, 63), 44, 'utf8'); // null-padded to 64 bytes
  buf[108] = Math.max(0, Math.min(200, priority));
  buf.writeUInt16BE(0, 109);                  // no synchronisation universe
  buf[111] = sequence & 0xff;
  buf[112] = terminated ? 0x40 : 0;           // Stream_Terminated
  buf.writeUInt16BE(universe, 113);
  buf.writeUInt16BE(fl(buf.length - 115), 115);
  buf[117] = 0x02;                            // VECTOR_DMP_SET_PROPERTY
  buf[118] = 0xa1;                            // address & data type
  buf.writeUInt16BE(0, 119);                  // first property address
  buf.writeUInt16BE(1, 121);                  // address increment
  buf.writeUInt16BE(n + 1, 123);              // property value count (START code + slots)
  buf[125] = 0;                               // START code: dimmer data
  buf.set(data.subarray(0, n), 126);
  return buf;
}

/** Parse an E1.31 data packet (tests, diagnostics). null if it is not one. */
export function parseSacn(buf) {
  if (buf.length < 126 || !buf.subarray(4, 16).equals(ACN_ID) || buf.readUInt32BE(18) !== 4 || buf.readUInt32BE(40) !== 2 || buf[117] !== 2) return null;
  const count = buf.readUInt16BE(123);
  return {
    rootLength: buf.readUInt16BE(16) & 0x0fff, framingLength: buf.readUInt16BE(38) & 0x0fff, dmpLength: buf.readUInt16BE(115) & 0x0fff,
    cid: buf.subarray(22, 38), source: buf.toString('utf8', 44, 108).replace(/\0+$/, ''), priority: buf[108], sequence: buf[111],
    terminated: !!(buf[112] & 0x40), universe: buf.readUInt16BE(113), startCode: buf[125], data: buf.subarray(126, 125 + count),
  };
}
