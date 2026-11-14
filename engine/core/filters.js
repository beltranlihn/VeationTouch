// One Euro filter (Casiez, Roussel & Vogel, CHI 2012) — written from the paper's equations.
// Low jitter at low speed, low lag at high speed: the cutoff rises with the speed.

const alpha = (cutoff, dt) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuro {
  /** @param {{minCutoff?:number, beta?:number, dCutoff?:number}} p */
  constructor(p = {}) {
    this.set(p);
    this.reset();
  }

  set({ minCutoff = 1.0, beta = 0.5, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
  }

  reset() { this.x = null; this.dx = 0; this.t = null; }

  /** @param {number} value @param {number} tSec */
  filter(value, tSec) {
    if (this.x === null || this.t === null) { this.x = value; this.t = tSec; this.dx = 0; return value; }
    const dt = Math.max(1e-3, tSec - this.t);
    this.t = tSec;
    const rawDx = (value - this.x) / dt;
    const ad = alpha(this.dCutoff, dt);
    this.dx = ad * rawDx + (1 - ad) * this.dx;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = alpha(cutoff, dt);
    this.x = a * value + (1 - a) * this.x;
    return this.x;
  }
}

/**
 * Hungarian / Kuhn–Munkres assignment for a rectangular cost matrix (rows ≤ or ≥ cols).
 * Returns, for every row, the assigned column or -1.
 * @param {number[][]} cost
 */
export function hungarian(cost) {
  const nr = cost.length;
  if (!nr) return [];
  const nc = cost[0].length;
  if (!nc) return new Array(nr).fill(-1);
  const n = Math.max(nr, nc);
  const BIG = 1e9;
  const a = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i >= 1 && j >= 1 && i <= nr && j <= nc ? cost[i - 1][j - 1] : i >= 1 && j >= 1 ? BIG / 1000 : 0)));
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = a[i0][j] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const res = new Array(nr).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j] >= 1 && p[j] <= nr && j <= nc) res[p[j] - 1] = j - 1;
  return res;
}
