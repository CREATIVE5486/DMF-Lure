// Moteur de peinture : texture UV (u = longueur, v = tour du corps), outils et coloris prédéfinis.
import * as THREE from 'three';
import { circumferenceTable } from './geometry.js';

export const TEX_W = 2048, TEX_H = 1024;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
function hexToRgb(hex) {
  const c = new THREE.Color(hex);
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Painter {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = TEX_W;
    this.canvas.height = TEX_H;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = false;
    this.texture.anisotropy = 8;
    this.texture.wrapT = THREE.RepeatWrapping;
    this.tmp = document.createElement('canvas');
    this.tmp.width = TEX_W;
    this.tmp.height = TEX_H;
    this.tctx = this.tmp.getContext('2d');
    this.undoStack = [];
    this.redoStack = [];
    this.brush = { tool: 'airbrush', color: '#1a1a1a', size: 4, opacity: 0.5, hardness: 0.2, mirror: true, stencil: 'none', text: 'DMF', font: 'bold', textSize: 6 };
    this.circ = new Float32Array(128).fill(60);
    this.L = 60;
    this.onChange = null;
    this.stencils = {};
    this.fill('#f2efe6');
  }

  setDesign(design) {
    this.L = design.body.length;
    this.circ = circumferenceTable(design, 128);
    this.stencils = {};
  }

  // px par mm dans chaque direction de la texture, à la position u
  scaleAt(u) {
    const c = this.circ[Math.max(0, Math.min(127, Math.round(u * 127)))];
    return { sx: TEX_W / this.L, sy: TEX_H / c };
  }

  changed() {
    this.texture.needsUpdate = true;
    if (this.onChange) this.onChange();
  }

  /* ------------------------- historique ------------------------- */
  snapshot() {
    const img = this.ctx.getImageData(0, 0, TEX_W, TEX_H);
    this.undoStack.push(img);
    if (this.undoStack.length > 24) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(this.ctx.getImageData(0, 0, TEX_W, TEX_H));
    this.ctx.putImageData(this.undoStack.pop(), 0, 0);
    this.changed();
    return true;
  }
  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.ctx.getImageData(0, 0, TEX_W, TEX_H));
    this.ctx.putImageData(this.redoStack.pop(), 0, 0);
    this.changed();
    return true;
  }

  /* ------------------------- pinceaux ------------------------- */
  stencilCanvas(kind) {
    if (this.stencils[kind]) return this.stencils[kind];
    const c = document.createElement('canvas');
    c.width = TEX_W; c.height = TEX_H;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    if (kind === 'scales') this.drawScales(g, { color: '#000', size: 2.6, line: 0.55, fill: true });
    else if (kind === 'dots') {
      const r = rng(7);
      for (let i = 0; i < 2600; i++) { g.beginPath(); g.arc(r() * TEX_W, r() * TEX_H, 2 + r() * 6, 0, Math.PI * 2); g.fill(); }
    } else if (kind === 'stripes') {
      for (let x = 0; x < TEX_W; x += 34) g.fillRect(x, 0, 16, TEX_H);
    }
    this.stencils[kind] = c;
    return c;
  }

  dab(x, y, pressure = 1) {
    const b = this.brush;
    const u = x / TEX_W;
    const { sx, sy } = this.scaleAt(u);
    const rmm = b.size / 2;
    const rx = rmm * sx, ry = rmm * sy;
    const targets = [[x, y]];
    if (b.mirror) targets.push([x, TEX_H - y]);
    const g = this.tctx;
    const erase = b.tool === 'eraser';
    const color = erase ? this.baseColor || '#f2efe6' : b.color;
    const [R, G, B] = hexToRgb(color);
    const alpha = b.opacity * pressure * (b.tool === 'airbrush' ? 0.35 : 1);
    const hard = b.tool === 'brush' || erase ? Math.max(0.6, b.hardness) : b.hardness;
    g.clearRect(0, 0, TEX_W, TEX_H);
    for (const [px, py] of targets) {
      for (const oy of [-TEX_H, 0, TEX_H]) {
        const cy = py + oy;
        if (cy + ry < 0 || cy - ry > TEX_H) continue;
        g.save();
        g.translate(px, cy);
        g.scale(1, ry / rx);
        const gr = g.createRadialGradient(0, 0, rx * hard * 0.98, 0, 0, rx);
        gr.addColorStop(0, `rgba(${R},${G},${B},${alpha})`);
        gr.addColorStop(1, `rgba(${R},${G},${B},0)`);
        g.fillStyle = gr;
        g.beginPath();
        g.arc(0, 0, rx, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
    if (b.stencil !== 'none' && !erase) {
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(this.stencilCanvas(b.stencil), 0, 0);
      g.globalCompositeOperation = 'source-over';
    }
    const minX = Math.max(0, Math.floor(x - rx - 2)), w = Math.min(TEX_W, Math.ceil(x + rx + 2)) - minX;
    if (w > 0) this.ctx.drawImage(this.tmp, minX, 0, w, TEX_H, minX, 0, w, TEX_H);
  }

  strokeTo(x, y, last) {
    if (!last) { this.dab(x, y); return; }
    const { sx } = this.scaleAt(x / TEX_W);
    const step = Math.max(1.5, this.brush.size * sx * (this.brush.tool === 'airbrush' ? 0.18 : 0.12));
    let dx = x - last[0], dy = y - last[1];
    if (Math.abs(dy) > TEX_H / 2) dy -= Math.sign(dy) * TEX_H; // traversée de la couture
    const dist = Math.hypot(dx, dy);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= n; i++) {
      let yy = last[1] + (dy * i) / n;
      yy = ((yy % TEX_H) + TEX_H) % TEX_H;
      this.dab(last[0] + (dx * i) / n, yy);
    }
  }

  pick(x, y) {
    const d = this.ctx.getImageData(Math.max(0, Math.min(TEX_W - 1, Math.round(x))), Math.max(0, Math.min(TEX_H - 1, Math.round(y))), 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  stampText(x, y) {
    const b = this.brush;
    const { sx, sy } = this.scaleAt(x / TEX_W);
    const g = this.ctx;
    const weight = b.font === 'bold' ? '800' : b.font === 'italic' ? 'italic 600' : '500';
    const draw = (py, fx, fy) => {
      g.save();
      g.translate(x, py);
      g.scale(fx, fy * (sy / sx));
      g.fillStyle = b.color;
      g.globalAlpha = b.opacity;
      g.font = `${weight} ${b.textSize * sx}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(b.text || '', 0, 0);
      g.restore();
    };
    const onLeft = y < TEX_H / 2;
    // flanc +z : lecture directe ; flanc −z : retourné (−1, −1) pour rester lisible
    draw(y, onLeft ? 1 : -1, onLeft ? 1 : -1);
    if (b.mirror) draw(TEX_H - y, onLeft ? -1 : 1, onLeft ? -1 : 1);
  }

  /* ------------------------- opérations globales ------------------------- */
  // v (0..1) → position verticale f : 0 = dos, 1 = ventre
  static fOfY(y) { const th = (y / TEX_H) * Math.PI * 2; return (1 - Math.cos(th)) / 2; }

  fill(color) {
    this.baseColor = color;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, TEX_W, TEX_H);
  }

  // Dégradé dos → flanc → ventre. stops: [[f, couleur], ...]
  gradient(stops, { alpha = 1, u0 = 0, u1 = 1 } = {}) {
    const g = this.ctx;
    g.globalAlpha = alpha;
    const x0 = u0 * TEX_W, w = (u1 - u0) * TEX_W;
    for (let y = 0; y < TEX_H; y++) {
      const f = Painter.fOfY(y + 0.5);
      let i = 0;
      while (i < stops.length - 2 && f > stops[i + 1][0]) i++;
      const [fa, ca] = stops[i], [fb, cb] = stops[Math.min(i + 1, stops.length - 1)];
      const t = fb > fa ? smooth(fa, fb, f) : 0;
      g.fillStyle = mixHex(ca, cb, t);
      g.fillRect(x0, y, w, 1);
    }
    g.globalAlpha = 1;
  }

  // Coloration en bande verticale le long du corps (ex. tête plus sombre)
  lengthwise(color, u0, u1, alpha = 0.6, feather = 0.08) {
    const g = this.ctx;
    const gr = g.createLinearGradient(u0 * TEX_W, 0, u1 * TEX_W, 0);
    const [R, G, B] = hexToRgb(color);
    const fe = Math.min(0.49, feather / Math.max(0.01, u1 - u0));
    gr.addColorStop(0, `rgba(${R},${G},${B},0)`);
    gr.addColorStop(fe, `rgba(${R},${G},${B},${alpha})`);
    gr.addColorStop(1 - fe, `rgba(${R},${G},${B},${alpha})`);
    gr.addColorStop(1, `rgba(${R},${G},${B},0)`);
    g.fillStyle = gr;
    g.fillRect(u0 * TEX_W, 0, (u1 - u0) * TEX_W, TEX_H);
  }

  // Zone verticale (f0..f1) adoucie, avec couleur
  band(color, f0, f1, alpha = 1, soft = 0.06, u0 = 0, u1 = 1) {
    const g = this.ctx;
    const [R, G, B] = hexToRgb(color);
    for (let y = 0; y < TEX_H; y++) {
      const f = Painter.fOfY(y + 0.5);
      const a = smooth(f0 - soft, f0 + soft, f) * (1 - smooth(f1 - soft, f1 + soft, f)) * alpha;
      if (a <= 0.003) continue;
      g.fillStyle = `rgba(${R},${G},${B},${a})`;
      g.fillRect(u0 * TEX_W, y, (u1 - u0) * TEX_W, 1);
    }
  }

  // Rayures « tigre » : barres irrégulières qui descendent du dos
  tigerBars(color, { count = 7, width = 3.2, depth = 0.62, u0 = 0.2, u1 = 0.92, seed = 3, alpha = 1 } = {}) {
    const g = this.ctx;
    const r = rng(seed);
    g.fillStyle = color;
    g.globalAlpha = alpha;
    for (let k = 0; k < count; k++) {
      const u = u0 + ((u1 - u0) * (k + 0.5)) / count + (r() - 0.5) * 0.02;
      const { sx } = this.scaleAt(u);
      const wpx = width * sx * (0.75 + r() * 0.5);
      const d = depth * (0.75 + r() * 0.35);
      const lean = (r() - 0.3) * wpx * 0.8;
      for (const side of [1, -1]) {
        g.beginPath();
        const N = 24;
        const pts = [];
        for (let i = 0; i <= N; i++) {
          const f = (i / N) * d;
          const th = Math.acos(1 - 2 * f);
          const y = side > 0 ? (th / (Math.PI * 2)) * TEX_H : TEX_H - (th / (Math.PI * 2)) * TEX_H;
          const taper = 1 - Math.pow(i / N, 2.2) * 0.85;
          const wob = Math.sin(i * 1.7 + k * 3.1) * wpx * 0.12;
          pts.push([u * TEX_W + (lean * i) / N + wob, y, (wpx / 2) * taper]);
        }
        g.moveTo(pts[0][0] - pts[0][2], pts[0][1]);
        for (const p of pts) g.lineTo(p[0] - p[2], p[1]);
        for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0] + pts[i][2], pts[i][1]);
        g.closePath();
        g.fill();
        // haut de la barre qui rejoint le dos
        g.fillRect(u * TEX_W - wpx / 2, side > 0 ? 0 : TEX_H - 6, wpx, 6);
      }
    }
    g.globalAlpha = 1;
  }

  drawScales(g, { color = '#000', size = 2.6, line = 0.45, fill = false, alpha = 1, f0 = 0, f1 = 0.75 } = {}) {
    const sx = TEX_W / this.L;
    const avgC = this.circ.reduce((a, b) => a + b, 0) / this.circ.length;
    const sy = TEX_H / avgC;
    const cw = size * sx, ch = size * sy * 0.8;
    g.save();
    g.strokeStyle = color;
    g.fillStyle = color;
    g.globalAlpha = alpha;
    g.lineWidth = line * sx;
    for (let row = -1; row * ch < TEX_H + ch; row++) {
      const y = row * ch;
      const f = Painter.fOfY(((y % TEX_H) + TEX_H) % TEX_H);
      if (!fill && (f < f0 || f > f1)) continue;
      for (let col = -1; col * cw < TEX_W + cw; col++) {
        const x = col * cw + (row % 2 ? cw / 2 : 0);
        g.beginPath();
        if (fill) {
          g.ellipse(x, y, cw * 0.42, ch * 0.42, 0, 0, Math.PI * 2);
          g.fill();
        } else {
          g.ellipse(x, y, cw * 0.55, ch * 0.62, 0, Math.PI * 0.5, Math.PI * 1.5);
          g.stroke();
        }
      }
    }
    g.restore();
  }

  scales(opts) { this.drawScales(this.ctx, opts); }

  spots(color, { count = 120, min = 0.6, max = 1.8, f0 = 0, f1 = 0.6, seed = 5, alpha = 0.9 } = {}) {
    const r = rng(seed);
    const g = this.ctx;
    g.fillStyle = color;
    g.globalAlpha = alpha;
    for (let i = 0; i < count; i++) {
      const u = 0.12 + r() * 0.82;
      const f = f0 + r() * (f1 - f0);
      const th = Math.acos(1 - 2 * f);
      const { sx, sy } = this.scaleAt(u);
      const rad = min + r() * (max - min);
      for (const side of [1, -1]) {
        const y = side > 0 ? (th / (Math.PI * 2)) * TEX_H : TEX_H - (th / (Math.PI * 2)) * TEX_H;
        g.beginPath();
        g.ellipse(u * TEX_W, y, rad * sx, rad * sy, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  glitter(color = '#ffffff', density = 0.0025, seed = 11) {
    const r = rng(seed);
    const g = this.ctx;
    g.fillStyle = color;
    const n = TEX_W * TEX_H * density;
    for (let i = 0; i < n; i++) {
      g.globalAlpha = 0.3 + r() * 0.7;
      g.fillRect(r() * TEX_W, r() * TEX_H, 1 + r() * 2.5, 1 + r() * 2.5);
    }
    g.globalAlpha = 1;
  }

  gill(color = '#d4263a', u = 0.2, alpha = 0.85) {
    const g = this.ctx;
    const { sx } = this.scaleAt(u);
    for (const side of [1, -1]) {
      g.save();
      g.strokeStyle = color;
      g.globalAlpha = alpha;
      g.lineWidth = 1.1 * sx;
      g.lineCap = 'round';
      g.beginPath();
      const ys = [];
      for (let i = 0; i <= 12; i++) {
        const f = 0.3 + (i / 12) * 0.4;
        const th = Math.acos(1 - 2 * f);
        ys.push(side > 0 ? (th / (Math.PI * 2)) * TEX_H : TEX_H - (th / (Math.PI * 2)) * TEX_H);
      }
      ys.forEach((y, i) => {
        const x = u * TEX_W - Math.sin((i / 12) * Math.PI) * sx * 1.6;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      });
      g.stroke();
      g.restore();
    }
  }

  // Ligne latérale
  lateralLine(color, alpha = 0.6, width = 0.6) {
    const g = this.ctx;
    const { sx } = this.scaleAt(0.5);
    g.save();
    g.strokeStyle = color;
    g.globalAlpha = alpha;
    g.lineWidth = width * sx * 0.4;
    for (const side of [1, -1]) {
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const u = 0.18 + (i / 40) * 0.78;
        const f = 0.4 + Math.sin(i * 0.3) * 0.005 - (u - 0.5) * 0.05;
        const th = Math.acos(1 - 2 * f);
        const y = side > 0 ? (th / (Math.PI * 2)) * TEX_H : TEX_H - (th / (Math.PI * 2)) * TEX_H;
        if (i === 0) g.moveTo(u * TEX_W, y); else g.lineTo(u * TEX_W, y);
      }
      g.stroke();
    }
    g.restore();
  }

  /* ------------------------- coloris prédéfinis ------------------------- */
  applyScheme(id) {
    const s = SCHEMES.find((x) => x.id === id);
    if (!s) return;
    s.paint(this);
    this.changed();
  }

  toDataURL() {
    try { return this.canvas.toDataURL('image/webp', 0.92); } catch { return this.canvas.toDataURL('image/png'); }
  }

  loadDataURL(url) {
    return new Promise((resolve) => {
      if (!url) { resolve(false); return; }
      const img = new Image();
      img.onload = () => { this.ctx.drawImage(img, 0, 0, TEX_W, TEX_H); this.changed(); resolve(true); };
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }
}

export const SCHEMES = [
  {
    id: 'firetiger', name: { fr: 'Firetiger', en: 'Firetiger' },
    swatch: ['#9be22d', '#ff6a1a', '#111'],
    paint(p) {
      p.fill('#fff6d0');
      p.gradient([[0, '#3d8f1c'], [0.22, '#9be22d'], [0.5, '#d7f046'], [0.72, '#ffd24a'], [0.86, '#ff7b2a'], [1, '#ff5a1a']]);
      p.tigerBars('#141414', { count: 7, width: 3.4, depth: 0.6 });
      p.lengthwise('#ff6a1a', 0, 0.12, 0.25, 0.06);
      p.gill('#e0283a', 0.17);
    },
  },
  {
    id: 'chromeShad', name: { fr: 'Shad chromé', en: 'Chrome shad' },
    swatch: ['#2d2f33', '#e4e7ea', '#ffffff'],
    paint(p) {
      p.fill('#f4f4f2');
      p.gradient([[0, '#22262b'], [0.18, '#555b63'], [0.35, '#d9dde1'], [0.6, '#f6f6f4'], [1, '#ffffff']]);
      p.scales({ color: '#1f2226', size: 2.8, line: 0.5, alpha: 0.85, f0: 0.0, f1: 0.62 });
      p.spots('#1b1d21', { count: 1, min: 1.6, max: 1.6, f0: 0.3, f1: 0.32 });
      p.gill('#d4263a', 0.18, 0.6);
    },
  },
  {
    id: 'citrusShad', name: { fr: 'Citrus shad', en: 'Citrus shad' },
    swatch: ['#2b5d7a', '#e8f03a', '#fff'],
    paint(p) {
      p.fill('#ffffff');
      p.gradient([[0, '#1d4e6e'], [0.22, '#3f7b8f'], [0.36, '#d8ea4a'], [0.55, '#f2f5d8'], [1, '#ffffff']]);
      p.scales({ color: '#163a52', size: 2.6, line: 0.35, alpha: 0.5, f0: 0, f1: 0.5 });
      p.band('#ff8a2a', 0.85, 1.05, 0.55, 0.06, 0, 0.35);
    },
  },
  {
    id: 'sexyShad', name: { fr: 'Sexy shad', en: 'Sexy shad' },
    swatch: ['#1c2d4a', '#cfd8e0', '#f4c430'],
    paint(p) {
      p.fill('#f7f7f5');
      p.gradient([[0, '#141e33'], [0.16, '#2c4064'], [0.3, '#8e9fb4'], [0.5, '#e8ecef'], [1, '#ffffff']]);
      p.band('#f4c430', 0.78, 1.05, 0.55, 0.08);
      p.scales({ color: '#ffffff', size: 2.4, line: 0.3, alpha: 0.35, f0: 0.15, f1: 0.6 });
      p.glitter('#ffffff', 0.0012);
    },
  },
  {
    id: 'chartreuseShad', name: { fr: 'Chartreuse shad', en: 'Chartreuse shad' },
    swatch: ['#2d6a2a', '#d7ff38', '#ffffff'],
    paint(p) {
      p.fill('#ffffff');
      p.gradient([[0, '#255d27'], [0.2, '#8bd12c'], [0.4, '#e2ff5a'], [0.65, '#f8ffe0'], [1, '#ffffff']]);
      p.scales({ color: '#1e4a1c', size: 2.6, line: 0.35, alpha: 0.45, f0: 0, f1: 0.5 });
      p.gill('#e0283a', 0.17, 0.8);
    },
  },
  {
    id: 'redCraw', name: { fr: 'Écrevisse rouge', en: 'Red craw' },
    swatch: ['#6b1a12', '#d2442b', '#ff9a3a'],
    paint(p) {
      p.fill('#ffb070');
      p.gradient([[0, '#3e0f0a'], [0.25, '#9a2618'], [0.5, '#d2442b'], [0.8, '#ff8a3a'], [1, '#ffc27a']]);
      p.spots('#2a0a06', { count: 90, min: 0.5, max: 1.4, f0: 0.05, f1: 0.55, seed: 9 });
      p.tigerBars('#4a120a', { count: 5, width: 2.4, depth: 0.5, alpha: 0.55, seed: 21 });
    },
  },
  {
    id: 'bluegill', name: { fr: 'Crapet', en: 'Bluegill' },
    swatch: ['#28402a', '#6f8c3c', '#ff8a2a'],
    paint(p) {
      p.fill('#e9d27a');
      p.gradient([[0, '#1d3420'], [0.25, '#4b6b33'], [0.5, '#8ea14a'], [0.75, '#ffb347'], [1, '#ff7f2a']]);
      p.tigerBars('#1f2e1b', { count: 6, width: 3.2, depth: 0.6, alpha: 0.6, seed: 13 });
      p.spots('#2f4bd6', { count: 1, min: 2.2, max: 2.2, f0: 0.32, f1: 0.33, seed: 2 });
    },
  },
  {
    id: 'perch', name: { fr: 'Perche', en: 'Perch' },
    swatch: ['#3c4b1e', '#c8c45a', '#ff6a2a'],
    paint(p) {
      p.fill('#f5f0d8');
      p.gradient([[0, '#2c3a17'], [0.25, '#7d8a33'], [0.48, '#d6cf6a'], [0.7, '#f3eed6'], [1, '#ffffff']]);
      p.tigerBars('#263015', { count: 6, width: 3.6, depth: 0.55, alpha: 0.85, seed: 4 });
      p.band('#ff6a2a', 0.86, 1.05, 0.4, 0.06);
      p.gill('#d4263a', 0.18);
    },
  },
  {
    id: 'ghostMinnow', name: { fr: 'Ghost minnow', en: 'Ghost minnow' },
    swatch: ['#8aa3a8', '#e9f0ee', '#d0b7e8'],
    paint(p) {
      p.fill('#f2f4f2');
      p.gradient([[0, '#5f7b82'], [0.25, '#b9cbcc'], [0.45, '#e8efee'], [1, '#ffffff']]);
      p.lateralLine('#b38fd8', 0.45, 2.2);
      p.scales({ color: '#6f8a90', size: 2.2, line: 0.25, alpha: 0.35, f0: 0, f1: 0.55 });
      p.glitter('#ffffff', 0.0018);
    },
  },
  {
    id: 'blackBlue', name: { fr: 'Noir & bleu', en: 'Black & blue' },
    swatch: ['#0d0d10', '#1d3ab3', '#3a7bff'],
    paint(p) {
      p.fill('#111216');
      p.gradient([[0, '#0a0a0c'], [0.4, '#16181e'], [1, '#1c2a6b']]);
      p.glitter('#3a7bff', 0.004, 17);
      p.tigerBars('#2a46d9', { count: 6, width: 1.6, depth: 0.45, alpha: 0.5, seed: 8 });
    },
  },
  {
    id: 'white', name: { fr: 'Blanc (apprêt)', en: 'White (primer)' },
    swatch: ['#ffffff', '#f2efe6', '#e5e1d6'],
    paint(p) { p.fill('#f2efe6'); },
  },
];
