// Output routing: every enabled destination of the profile gets the frame in its format.
//   osc  — VEATION Touch address space (docs/OSC.md)
//   tuio — TUIO 1.1 /tuio/2Dcur, one source per wall (optionally one port per wall)
// WebSocket output lives in server.js (same frame object, JSON).

import dgram from 'node:dgram';
import { message, bundles, i } from './osc.js';
import { wallToUv } from '../profile.js';

export class OutputManager {
  constructor(log) {
    this.log = log;
    this.sock = dgram.createSocket('udp4');
    this.sock.on('error', (e) => this.log.warn(`output socket: ${e.message}`));
    this.sock.bind(0);
    try { this.sock.setBroadcast(true); } catch { /* bind not done yet; set on listening */ }
    this.sock.on('listening', () => { try { this.sock.setBroadcast(true); } catch { /* ignore */ } });
    this.outputs = [];
    this.stats = new Map();
    this.fseq = 0;
  }

  configure(profile) {
    this.profile = profile;
    this.outputs = profile.outputs;
    for (const o of this.outputs) if (!this.stats.has(o.id)) this.stats.set(o.id, { sent: 0, errors: 0, last: 0, lastError: null });
  }

  /** Map a touch to the output coordinate space: [u, v] in 0..1, origin top-left. */
  _uv(o, wall, x, y) {
    if (o.coords === 'canvas') {
      const r = wall.pixelRect, c = this.profile.canvas;
      return [(r.x + (x / wall.width) * r.w) / c.width, (r.y + (1 - y / wall.height) * r.h) / c.height];
    }
    return wallToUv(wall, x, y);
  }

  _velUv(o, wall, vx, vy) {
    if (o.coords === 'canvas') {
      const r = wall.pixelRect, c = this.profile.canvas;
      return [(vx / wall.width) * (r.w / c.width), (-vy / wall.height) * (r.h / c.height)];
    }
    return [vx / wall.width, -vy / wall.height];
  }

  _send(o, buf, port = o.port) {
    const st = this.stats.get(o.id);
    this.sock.send(buf, port, o.host, (err) => {
      if (err) { st.errors++; st.lastError = err.message; } else st.sent++;
    });
  }

  /**
   * @param {object} frame  { seq, t, walls:[{wall, touches}], events, zoneEvents, zoneCounts, roomCount, burst }
   * @param {number} nowMs
   */
  send(frame, nowMs) {
    this.fseq++;
    for (const o of this.outputs) {
      if (!o.enabled) continue;
      const st = this.stats.get(o.id);
      const due = nowMs - st.last >= 1000 / o.rateHz - 2;
      const hasEvents = frame.events.length || frame.zoneEvents.length;
      if (!due && !hasEvents) continue;
      const walls = o.walls.length ? frame.walls.filter((w) => o.walls.includes(w.wall.id)) : frame.walls;
      try {
        if (o.type === 'tuio') { if (due) this._tuio(o, walls); }
        else this._osc(o, walls, frame, due);
      } catch (e) { st.errors++; st.lastError = e.message; }
      if (due) st.last = nowMs;
    }
  }

  _osc(o, walls, frame, due) {
    const P = o.prefix;
    const msgs = [];
    const wallById = new Map(walls.map((w) => [w.wall.id, w.wall]));
    // Events first: they are sent even between rate-limited frames.
    for (const e of frame.events) {
      const wall = wallById.get(e.wallId);
      if (!wall) continue;
      const [u, v] = this._uv(o, wall, e.x, e.y);
      if (e.type === 'down') msgs.push(message(`${P}/wall/${wall.id}/down`, [i(e.id), u, v]));
      else msgs.push(message(`${P}/wall/${wall.id}/up`, [i(e.id), u, v, e.duration ?? 0]));
    }
    for (const e of frame.zoneEvents) {
      if (!o.walls.length || o.walls.includes(e.wallId)) msgs.push(message(`${P}/zone/${e.zoneId}/${e.type}`, [i(e.count)]));
    }
    if (due) {
      msgs.push(message(`${P}/frame`, [i(frame.seq), frame.t / 1000]));
      msgs.push(message(`${P}/room/count`, [i(frame.roomCount)]));
      msgs.push(message(`${P}/room/burst`, [i(frame.burst)]));
      for (const [zid, z] of Object.entries(frame.zoneCounts)) msgs.push(message(`${P}/zone/${zid}/count`, [i(z.count)]));
      for (const { wall, touches } of walls) {
        msgs.push(message(`${P}/wall/${wall.id}/count`, [i(touches.length)]));
        msgs.push(message(`${P}/wall/${wall.id}/alive`, touches.map((t) => i(t.id))));
        for (const t of touches) {
          const [u, v] = this._uv(o, wall, t.x, t.y);
          const [vu, vv] = this._velUv(o, wall, t.vx, t.vy);
          msgs.push(message(`${P}/wall/${wall.id}/touch`, [i(t.id), u, v, vu, vv, t.size, t.age]));
        }
      }
    }
    for (const b of bundles(msgs)) this._send(o, b);
  }

  _tuio(o, walls) {
    walls.forEach(({ wall, touches }, k) => {
      const head = [
        message('/tuio/2Dcur', ['source', `vt-${wall.id}@veation`]),
        message('/tuio/2Dcur', ['alive', ...touches.map((t) => i(t.id))]),
      ];
      const sets = touches.map((t) => {
        const [u, v] = this._uv(o, wall, t.x, t.y);
        const [vu, vv] = this._velUv(o, wall, t.vx, t.vy);
        return message('/tuio/2Dcur', ['set', i(t.id), u, v, vu, vv, 0]);
      });
      const fseq = message('/tuio/2Dcur', ['fseq', i(this.fseq)]);
      const port = o.tuioPortPerWall ? o.port + k : o.port;
      // Every TUIO bundle carries source + alive + some sets + fseq. With many touches the sets
      // are spread over several bundles (alive repeated) to stay below the MTU.
      const fixed = [...head, fseq].reduce((a, m) => a + m.length + 4, 16);
      let chunk = [], size = fixed;
      const flush = () => { this._send(o, bundles([...head, ...chunk, fseq], 65000)[0], port); chunk = []; size = fixed; };
      for (const s of sets) {
        if (chunk.length && size + s.length + 4 > 1400) flush();
        chunk.push(s); size += s.length + 4;
      }
      flush();
    });
  }

  /** One-shot test message to a destination. */
  test(o) {
    const buf = o.type === 'tuio'
      ? bundles([message('/tuio/2Dcur', ['source', 'vt-test@veation']), message('/tuio/2Dcur', ['alive']), message('/tuio/2Dcur', ['fseq', i(0)])])[0]
      : message(`${o.prefix}/test`, ['VEATION Touch', i(Date.now() % 1e9)]);
    this._send(o, buf);
  }

  snapshot() {
    return Object.fromEntries([...this.stats].map(([k, v]) => [k, { sent: v.sent, errors: v.errors, lastError: v.lastError }]));
  }

  close() { try { this.sock.close(); } catch { /* closed */ } }
}
