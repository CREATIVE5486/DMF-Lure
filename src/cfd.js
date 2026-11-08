// Labo hydro : soufflerie 2D par méthode de Boltzmann sur réseau (D2Q9, BGK).
import { makeProfile, lipFrame } from './geometry.js';

const EX = [0, 1, 0, -1, 0, 1, -1, -1, 1];
const EY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
const W9 = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];

function turbo(t) {
  t = Math.max(0, Math.min(1, t));
  const r = 34.61 + t * (1172.33 - t * (10793.56 - t * (33300.12 - t * (38394.49 - t * 14825.05))));
  const g = 23.31 + t * (557.33 + t * (1225.33 - t * (3574.96 - t * (1073.77 + t * 707.56))));
  const b = 27.2 + t * (3211.1 - t * (15327.97 - t * (27814 - t * (22569.18 - t * 6838.66))));
  return [Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))];
}
function diverge(t) { // bleu - blanc - rouge
  t = Math.max(-1, Math.min(1, t));
  if (t < 0) return [255 * (1 + t * 0.85), 255 * (1 + t * 0.6), 255];
  return [255, 255 * (1 - t * 0.6), 255 * (1 - t * 0.85)];
}

export class CFDLab {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nx = 280; this.ny = 112;
    this.view = 'side';
    this.field = 'speed';
    this.u0 = 0.09;
    this.re = 220;
    this.pitch = 0;
    this.running = true;
    this.stepsPerFrame = 10;
    this.alloc();
    this.img = new ImageData(this.nx, this.ny);
    this.off = document.createElement('canvas');
    this.off.width = this.nx; this.off.height = this.ny;
    this.octx = this.off.getContext('2d');
    this.tracers = new Float32Array(1800 * 2);
    for (let i = 0; i < this.tracers.length; i += 2) this.respawn(i, true);
    this.hist = [];
    this.stats = { cd: 0, cl: 0, st: 0, reLattice: 0 };
  }

  alloc() {
    const n = this.nx * this.ny;
    this.f = new Float32Array(n * 9);
    this.f2 = new Float32Array(n * 9);
    this.solid = new Uint8Array(n);
    this.rho = new Float32Array(n);
    this.ux = new Float32Array(n);
    this.uy = new Float32Array(n);
  }

  setDesign(design) {
    this.design = design;
    this.rasterize();
    this.init();
  }

  setOptions(o) {
    const geom = o.view !== undefined && o.view !== this.view || o.pitch !== undefined && o.pitch !== this.pitch;
    Object.assign(this, o);
    if (geom) { this.rasterize(); this.init(); }
  }

  rasterize() {
    const d = this.design;
    if (!d) return;
    const P = makeProfile(d);
    const { nx, ny } = this;
    this.solid.fill(0);
    const bodyLenCells = nx * 0.25;
    const s = bodyLenCells / P.L; // cellules par mm
    this.scale = s;
    const x0 = nx * 0.22, y0 = ny * 0.5;
    const cp = Math.cos(-this.pitch * Math.PI / 180), sp = Math.sin(-this.pitch * Math.PI / 180);
    const cx = P.L * 0.45;
    let lip = null;
    if (d.lip.enabled) {
      const F = lipFrame(d);
      lip = { F, t: Math.max(d.lip.thickness, 1.6 / s) };
    }
    let minY = Infinity, maxY = -Infinity;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        // coordonnées leurre (mm), avec rotation de tangage autour du centre
        let X = (i - x0) / s, Y = (y0 - j) / s;
        const Xr = cx + (X - cx) * cp - Y * sp, Yr = (X - cx) * sp + Y * cp;
        X = Xr; Y = Yr;
        let inside = false;
        if (X >= 0 && X <= P.L) {
          const u = X / P.L;
          if (this.view === 'side') inside = Y <= P.top(u) && Y >= -P.bot(u);
          else inside = Math.abs(Y) <= P.hw(u);
        }
        if (!inside && lip) {
          const { F, t } = lip;
          const rx = X - F.root.x, ry = (this.view === 'side' ? Y - F.root.y : 0);
          if (this.view === 'side') {
            const a = rx * F.dir.x + ry * F.dir.y; // le long
            const b = rx * F.normal.x + ry * F.normal.y; // épaisseur
            inside = a >= 0 && a <= d.lip.length && Math.abs(b) <= t / 2;
          } else {
            const along = -rx; // projection horizontale
            const lproj = d.lip.length * Math.cos(F.angle);
            const frac = lproj > 0 ? along / lproj : 0;
            inside = along >= 0 && along <= lproj + t && Math.abs(Y) <= (d.lip.width / 2) * (frac > 0.8 ? 0.85 : 1);
          }
        }
        if (inside) {
          this.solid[j * nx + i] = 1;
          minY = Math.min(minY, j); maxY = Math.max(maxY, j);
        }
      }
    }
    this.D = Math.max(4, maxY - minY + 1);
  }

  init() {
    const { nx, ny, u0 } = this;
    const n = nx * ny;
    for (let k = 0; k < n; k++) {
      const ux = this.solid[k] ? 0 : u0;
      for (let q = 0; q < 9; q++) this.f[k * 9 + q] = this.feq(q, 1, ux, 0);
    }
    this.t = 0;
    this.hist = [];
    this.sm = undefined;
    this.cdAvg = 0; this.clAvg = 0;
  }

  feq(q, rho, ux, uy) {
    const eu = EX[q] * ux + EY[q] * uy;
    return W9[q] * rho * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * (ux * ux + uy * uy));
  }

  step() {
    const { nx, ny, f, f2, solid, u0 } = this;
    const nu = (u0 * this.D) / this.re;
    const omega = 1 / (3 * nu + 0.5);
    let Fx = 0, Fy = 0;
    // collision + propagation (push)
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i, b = k * 9;
        if (solid[k]) continue;
        let rho = 0, ux = 0, uy = 0;
        for (let q = 0; q < 9; q++) { const v = f[b + q]; rho += v; ux += v * EX[q]; uy += v * EY[q]; }
        if (!(rho > 0.2 && rho < 5)) { rho = 1; ux = u0; uy = 0; }
        ux /= rho; uy /= rho;
        const edge = i === 0 || j === 0 || j === ny - 1;
        if (edge) { rho = 1; ux = u0; uy = 0; }
        this.rho[k] = rho; this.ux[k] = ux; this.uy[k] = uy;
        const usq = 1.5 * (ux * ux + uy * uy);
        for (let q = 0; q < 9; q++) {
          const eu = EX[q] * ux + EY[q] * uy;
          const fe = W9[q] * rho * (1 + 3 * eu + 4.5 * eu * eu - usq);
          const post = edge ? fe : f[b + q] + omega * (fe - f[b + q]);
          let ii = i + EX[q], jj = j - EY[q];
          if (ii >= nx) ii = nx - 1;
          if (ii < 0 || jj < 0 || jj >= ny) continue;
          const kk = jj * nx + ii;
          if (solid[kk]) {
            // rebond : la population revient dans la cellule, direction opposée
            f2[b + OPP[q]] = post;
            Fx += 2 * post * EX[q];
            Fy += 2 * post * EY[q];
          } else {
            f2[kk * 9 + q] = post;
          }
        }
      }
    }
    // sortie : gradient nul
    for (let j = 0; j < ny; j++) {
      const a = (j * nx + nx - 1) * 9, c = (j * nx + nx - 2) * 9;
      for (let q = 0; q < 9; q++) f2[a + q] = f2[c + q];
    }
    this.f = f2; this.f2 = f;
    this.t++;
    const q = 0.5 * u0 * u0 * this.D;
    const cd = Fx / q, cl = Fy / q;
    this.cdAvg += (cd - this.cdAvg) * 0.01;
    this.clAvg += (cl - this.clAvg) * 0.01;
    if (this.t > 2500) {
      this.sm = (this.sm ?? cl) + (cl - (this.sm ?? cl)) * 0.08; // lissage
      this.hist.push(this.sm);
      if (this.hist.length > 4000) this.hist.shift();
    }
  }

  respawn(i, anywhere = false) {
    this.tracers[i] = anywhere ? Math.random() * this.nx : Math.random() * 3;
    this.tracers[i + 1] = Math.random() * this.ny;
  }

  advect() {
    const { nx, ny, ux, uy } = this;
    for (let i = 0; i < this.tracers.length; i += 2) {
      const x = this.tracers[i], y = this.tracers[i + 1];
      const ix = x | 0, iy = y | 0;
      if (ix < 0 || ix >= nx - 1 || iy < 0 || iy >= ny - 1) { this.respawn(i); continue; }
      const k = iy * nx + ix;
      if (this.solid[k]) { this.respawn(i); continue; }
      // ux en cellules / pas ; uy positif = vers le haut (j diminue)
      this.tracers[i] = x + ux[k] * this.stepsPerFrame;
      this.tracers[i + 1] = y - uy[k] * this.stepsPerFrame;
    }
  }

  computeStrouhal() {
    const h = this.hist;
    if (h.length < 1200) return 0;
    let mean = 0;
    for (const v of h) mean += v;
    mean /= h.length;
    let crossings = 0, first = -1, last = -1;
    for (let i = 1; i < h.length; i++) {
      if (h[i - 1] < mean && h[i] >= mean) { crossings++; if (first < 0) first = i; last = i; }
    }
    if (crossings < 3) return 0;
    const period = (last - first) / (crossings - 1);
    return this.D / (period * this.u0);
  }

  frame() {
    if (this.running) {
      const t0 = performance.now();
      let n = 0;
      while (n < 24 && (n < 2 || performance.now() - t0 < 11)) { this.step(); n++; }
      this.stepsPerFrame = n;
      this.advect();
    }
    this.draw();
    const st = this.computeStrouhal();
    this.stats = { cd: this.cdAvg, cl: this.clAvg, st, steps: this.t, D: this.D };
  }

  draw() {
    const { nx, ny, img, ux, uy, solid, u0 } = this;
    const data = img.data;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i, o = k * 4;
        let c;
        if (solid[k]) c = [235, 228, 205];
        else if (this.field !== 'speed' && (i < 3 || j < 3 || j > ny - 4)) c = [255, 255, 255];
        else if (this.field === 'vorticity') {
          const r = Math.min(nx - 2, Math.max(1, i)), q = Math.min(ny - 2, Math.max(1, j));
          const w = (uy[q * nx + r + 1] - uy[q * nx + r - 1]) - (ux[(q - 1) * nx + r] - ux[(q + 1) * nx + r]);
          c = diverge((w / u0) * 6);
        } else if (this.field === 'pressure') {
          c = diverge(((this.rho[k] - 1) / (u0 * u0)) * 1.2);
        } else {
          c = turbo(Math.hypot(ux[k], uy[k]) / (u0 * 1.6));
        }
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
      }
    }
    this.octx.putImageData(img, 0, 0);
    const cv = this.canvas, g = this.ctx;
    const W = cv.width, H = cv.height;
    g.fillStyle = '#081418';
    g.fillRect(0, 0, W, H);
    const sc = Math.min(W / nx, H / ny);
    const ox = (W - nx * sc) / 2, oy = (H - ny * sc) / 2;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.off, ox, oy, nx * sc, ny * sc);
    g.fillStyle = this.field === 'speed' ? 'rgba(255,255,255,0.55)' : 'rgba(20,30,40,0.5)';
    const ps = Math.max(1, sc * 0.45);
    for (let i = 0; i < this.tracers.length; i += 2) g.fillRect(ox + this.tracers[i] * sc, oy + this.tracers[i + 1] * sc, ps, ps);
    this.layout = { ox, oy, sc };
  }
}
