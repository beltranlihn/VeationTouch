// Output routing: every enabled destination of the profile gets the frame in its format.
//   osc  — VEATION Touch address space (docs/OSC.md)
//   tuio — TUIO 1.1 /tuio/2Dcur, one source per wall (optionally one port per wall)
//   triggers — zones as OSC on/off · webhook — zone events as HTTP POST (JSON) · artnet — zones as DMX channels
// WebSocket output lives in server.js (same frame object, JSON).

import dgram from 'node:dgram';
import { message, bundles, i } from './osc.js';
import { wallToUv, wallToCanvas, zoneAddress } from '../profile.js';
import { TextureOutput } from './texture.js';
import { artDmx } from './artnet.js';

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
    // texture outputs own a Spout sender: create, reconfigure or release them
    this.textures ??= new Map();
    const wanted = new Set(this.outputs.filter((o) => o.type === 'texture' && o.enabled).map((o) => o.id));
    for (const [id, t] of this.textures) if (!wanted.has(id)) { t.close(); this.textures.delete(id); }
    for (const o of this.outputs) {
      if (!wanted.has(o.id)) continue;
      let t = this.textures.get(o.id);
      if (!t) { t = new TextureOutput(this.log); this.textures.set(o.id, t); }
      t.configure(o, profile);
      this.stats.get(o.id).lastError = t.error;
    }
  }

  /** Map a touch to the output coordinate space: [u, v] in 0..1, origin top-left. */
  _uv(o, wall, x, y) {
    if (o.coords === 'canvas') {
      const c = this.profile.canvas;
      const [px, py] = wallToCanvas(wall, x, y); // honours the wall's corner-pin mapping
      return [px / c.width, py / c.height];
    }
    return wallToUv(wall, x, y);
  }

  _velUv(o, wall, vx, vy, x = wall.width / 2, y = wall.height / 2) {
    if (o.coords === 'canvas') {
      // finite difference through the (possibly projective) mapping
      const dt = 0.05;
      const [u0, v0] = this._uv(o, wall, x, y);
      const [u1, v1] = this._uv(o, wall, x + vx * dt, y + vy * dt);
      return [(u1 - u0) / dt, (v1 - v0) / dt];
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
        if (o.type === 'texture') {
          if (due) { const t = this.textures?.get(o.id); if (t?.send(walls, nowMs)) st.sent++; else if (t?.error) st.lastError = t.error; }
        } else if (o.type === 'tuio') { if (due) this._tuio(o, walls); }
        else if (o.type === 'triggers') this._triggers(o, frame);
        else if (o.type === 'webhook') this._webhook(o, frame);
        else if (o.type === 'artnet') { if (due) this._artnet(o, frame, nowMs); }
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
          const [vu, vv] = this._velUv(o, wall, t.vx, t.vy, t.x, t.y);
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
        const [vu, vv] = this._velUv(o, wall, t.vx, t.vy, t.x, t.y);
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

  /**
   * "Triggers": zones only, in the simplest form a show controller understands
   * (Resolume, MadMapper, QLab, lighting desks): `<address> 1` on enter, `<address> 0` on exit,
   * `<address>/hold 1` once after the hold time, `<address>/count n` when the count changes.
   */
  _triggers(o, frame) {
    const zones = new Map(this.profile.zones.map((z) => [z.id, z]));
    const inScope = (z) => z && (!o.walls.length || o.walls.includes(z.wallId));
    const msgs = [];
    for (const e of frame.zoneEvents) {
      const z = zones.get(e.zoneId);
      if (!inScope(z)) continue;
      const a = zoneAddress(z);
      if (e.type === 'enter') msgs.push(message(a, [i(1)]));
      else if (e.type === 'exit') msgs.push(message(a, [i(0)]));
      else if (e.type === 'hold') msgs.push(message(`${a}/hold`, [i(1)]));
    }
    const last = (this._lastCounts ??= new Map());
    for (const [zid, c] of Object.entries(frame.zoneCounts)) {
      const z = zones.get(zid);
      if (!inScope(z)) continue;
      const key = `${o.id}/${zid}`;
      if (last.get(key) !== c.count) { last.set(key, c.count); msgs.push(message(`${zoneAddress(z)}/count`, [i(c.count)])); }
    }
    for (const b of bundles(msgs)) this._send(o, b);
  }

  _zonesInScope(o) {
    return this.profile.zones.filter((z) => z.enabled !== false && (!o.walls.length || o.walls.includes(z.wallId)));
  }

  /**
   * Webhook: one HTTP POST (JSON) per zone event, in order (one request at a time per destination), 3 s timeout.
   * A dead endpoint never blocks tracking: the queue is capped and overflow is counted as errors.
   */
  _webhook(o, frame) {
    if (!o.url || !frame.zoneEvents.length) return;
    const zones = new Map(this._zonesInScope(o).map((z) => [z.id, z]));
    for (const e of frame.zoneEvents) {
      const z = zones.get(e.zoneId);
      if (!z) continue;
      this._post(o, {
        event: e.type, zone: { id: z.id, name: z.name, wallId: z.wallId, address: zoneAddress(z) },
        count: e.count, ...(e.duration !== undefined ? { duration: Math.round(e.duration * 1000) / 1000 } : {}),
        room: frame.roomCount, time: new Date().toISOString(),
      });
    }
  }

  _post(o, body) {
    const st = this.stats.get(o.id);
    const hooks = (this._hooks ??= new Map());
    let h = hooks.get(o.id);
    if (!h) { h = { q: [], busy: false }; hooks.set(o.id, h); }
    if (h.q.length >= 64) { st.errors++; st.lastError = 'endpoint too slow — events dropped'; return; }
    h.q.push({ url: o.url, body });
    const pump = () => {
      if (h.busy || !h.q.length) return;
      h.busy = true;
      const { url, body: b } = h.q.shift();
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'VEATION-Touch' }, body: JSON.stringify(b), signal: AbortSignal.timeout(3000) })
        .then((r) => { if (r.ok) { st.sent++; st.lastError = null; } else { st.errors++; st.lastError = `HTTP ${r.status}`; } return r.body?.cancel?.(); })
        .catch((e) => { st.errors++; st.lastError = fetchError(e); })
        .finally(() => { h.busy = false; pump(); });
    };
    pump();
  }

  /**
   * Art-Net: one DMX channel per zone in scope (profile order) from `channel`: 255 while the zone is active,
   * 0 otherwise. Sent on change and at least once a second (nodes hold the last value).
   */
  _artnet(o, frame, nowMs, force = null) {
    const zones = this._zonesInScope(o);
    const n = Math.max(0, Math.min(zones.length, 513 - o.channel));
    const data = new Uint8Array(Math.max(2, (o.channel - 1 + n + 1) & ~1));
    for (let k = 0; k < n; k++) data[o.channel - 1 + k] = force ?? (frame.zoneCounts[zones[k].id]?.active ? 255 : 0);
    const dmx = (this._dmx ??= new Map());
    const prev = dmx.get(o.id);
    if (!force && prev && Buffer.compare(prev.data, data) === 0 && nowMs - prev.at < 1000) return;
    const seq = prev ? (prev.seq % 255) + 1 : 1;
    dmx.set(o.id, { data: force ? new Uint8Array(0) : data, at: force ? 0 : nowMs, seq }); // after a test: resend the real state
    this._send(o, artDmx(o.universe, seq, data));
  }

  /** One-shot test message to a destination. */
  test(o) {
    if (o.type === 'texture') return; // the texture is continuous: open a Spout receiver to see it
    if (o.type === 'webhook') { if (!o.url) throw new Error('no URL'); this._post(o, { event: 'test', source: 'VEATION Touch', time: new Date().toISOString() }); return; }
    if (o.type === 'artnet') { this._artnet(o, { zoneCounts: {} }, 0, 255); return; } // every mapped channel full for ≤ 1 s
    const buf = o.type === 'tuio'
      ? bundles([message('/tuio/2Dcur', ['source', 'vt-test@veation']), message('/tuio/2Dcur', ['alive']), message('/tuio/2Dcur', ['fseq', i(0)])])[0]
      : message(`${o.prefix}/test`, ['VEATION Touch', i(Date.now() % 1e9)]);
    this._send(o, buf);
  }

  snapshot() {
    return Object.fromEntries([...this.stats].map(([k, v]) => [k, { sent: v.sent, errors: v.errors, lastError: v.lastError }]));
  }

  close() {
    for (const t of this.textures?.values() || []) t.close();
    try { this.sock.close(); } catch { /* closed */ }
  }
}

/** A readable reason for a failed fetch (undici hides it in `cause`, sometimes inside an AggregateError). */
function fetchError(e) {
  if (e?.name === 'TimeoutError') return 'timeout (3 s)';
  const c = e?.cause, code = c?.code || c?.errors?.[0]?.code;
  return { ECONNREFUSED: 'connection refused', ENOTFOUND: 'host not found', EHOSTUNREACH: 'host unreachable', ETIMEDOUT: 'connection timed out', ECONNRESET: 'connection reset' }[code]
    || code || (c?.message === 'bad port' ? 'port blocked for HTTP (use another port)' : c?.message) || e?.message || 'failed';
}
