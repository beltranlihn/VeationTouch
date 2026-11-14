// Simulated sensor: produces S2E-like revolutions (3200 samples, 10 Hz) from a SimWall.
// Used for development without hardware, demos on the tablet, and tests.

import { EventEmitter } from 'node:events';
import { SimWall } from '../sim/world.js';

export class SimDriver extends EventEmitter {
  /**
   * @param {{id:string, wall:{width:number,height:number}, pose:object, hz?:number, wanderers?:number,
   *          poseError?:{x?:number,y?:number,rotation?:number}}} cfg
   */
  constructor(cfg, log) {
    super();
    this.cfg = { hz: 10, wanderers: 0, ...cfg };
    this.log = log;
    const truth = { ...cfg.pose };
    const e = cfg.poseError || {};
    truth.x += e.x || 0; truth.y += e.y || 0; truth.rotation += e.rotation || 0;
    this.world = new SimWall(cfg.wall, truth, { wanderers: this.cfg.wanderers, seed: hash(cfg.id) });
    this.status = {
      state: 'stopped', info: { model: 0, firmware: 'sim', hardware: 0, serial: `SIM-${cfg.id}` },
      health: { status: 0, errorCode: 0 }, modes: [], mode: null, modeName: 'Simulated',
      ansType: 0x83, hz: 0, pps: 0, crcErrors: 0, lastError: null, lastPacketAt: 0, restarts: 0,
    };
    this._a0 = 0;
  }

  get id() { return this.cfg.id; }

  start() {
    if (this._timer) return;
    const period = 1000 / this.cfg.hz;
    let last = performance.now();
    this.status.state = 'scanning';
    this.status.hz = this.cfg.hz;
    this.emit('status', this.status);
    this._timer = setInterval(() => {
      const t = performance.now();
      this.world.step((t - last) / 1000);
      last = t;
      this._a0 = (this._a0 + 0.037) % 0.1125; // revolutions don't start at exactly the same angle
      const { angle, dist, quality } = this.world.scan(3200, this._a0);
      this.status.lastPacketAt = t;
      this.emit('scan', {
        sensorId: this.id, t, deviceTs: Math.round(t * 1000), count: angle.length,
        angle, dist, quality, hasQuality: true,
      });
    }, period);
  }

  async stop() {
    clearInterval(this._timer);
    this._timer = null;
    this.status.state = 'stopped';
    this.status.hz = 0;
    this.emit('status', this.status);
  }

  /** Inject / move / remove a virtual hand (wall metres). */
  touch(id, x, y, down) {
    if (down) this.world.injected.set(id, { x, y });
    else this.world.injected.delete(id);
  }

  setWanderers(n) { this.world.setWanderers(n); }
}

function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
