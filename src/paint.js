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
    // Couche « feuille holographique » : R = irisation, G = rugosité, B = métal (lue par le matériau 3D)
    this.fcanvas = document.createElement('canvas');
    this.fcanvas.width = TEX_W;
    this.fcanvas.height = TEX_H;
    this.fctx = this.fcanvas.getContext('2d', { willReadFrequently: true });
    this.foilTexture = new THREE.CanvasTexture(this.fcanvas);
    this.foilTexture.flipY = false;
    this.foilTexture.wrapT = THREE.RepeatWrapping;
    this.foilTexture.colorSpace = THREE.NoColorSpace;
    this.resetFoil();
    this.fill('#f2efe6');
  }

  resetFoil() {
    this.fctx.globalAlpha = 1;
    this.fctx.fillStyle = 'rgb(0,255,0)';
    this.fctx.fillRect(0, 0, TEX_W, TEX_H);
  }

  // Bande de feuille holo entre f0 (dos=0) et f1 (ventre=1)
  foilBand(f0, f1, alpha = 1, soft = 0.05, u0 = 0, u1 = 1) {
    const g = this.fctx;
    for (let y = 0; y < TEX_H; y++) {
      const f = Painter.fOfY(y + 0.5);
      const a = smooth(f0 - soft, f0 + soft, f) * (1 - smooth(f1 - soft, f1 + soft, f)) * alpha;
      if (a <= 0.003) continue;
      g.fillStyle = `rgba(255,60,255,${a})`;
      g.fillRect(u0 * TEX_W, y, (u1 - u0) * TEX_W, 1);
    }
  }

  foilScales(f0 = 0.12, f1 = 0.7) {
    const g = this.fctx;
    this.drawScales(g, { color: 'rgb(30,190,40)', size: Math.max(2.4, this.L / 40), line: 0.3, alpha: 0.9, f0, f1 });
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
    this.foilTexture.needsUpdate = true;
    if (this.onChange) this.onChange();
  }

  /* ------------------------- historique ------------------------- */
  grab() { return { c: this.ctx.getImageData(0, 0, TEX_W, TEX_H), f: this.fctx.getImageData(0, 0, TEX_W, TEX_H) }; }
  put(s) { this.ctx.putImageData(s.c, 0, 0); this.fctx.putImageData(s.f, 0, 0); }
  snapshot() {
    this.undoStack.push(this.grab());
    if (this.undoStack.length > 16) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(this.grab());
    this.put(this.undoStack.pop());
    this.changed();
    return true;
  }
  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.grab());
    this.put(this.redoStack.pop());
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
    const foil = b.tool === 'foil' || b.tool === 'unfoil';
    const color = erase ? this.baseColor || '#f2efe6' : b.color;
    let [R, G, B] = hexToRgb(color);
    if (b.tool === 'foil') [R, G, B] = [255, 60, 255];
    if (b.tool === 'unfoil') [R, G, B] = [0, 255, 0];
    const alpha = b.opacity * pressure * (b.tool === 'airbrush' || foil ? 0.35 : 1);
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
    if (b.stencil !== 'none' && !erase && b.tool !== 'unfoil') {
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(this.stencilCanvas(b.stencil), 0, 0);
      g.globalCompositeOperation = 'source-over';
    }
    const minX = Math.max(0, Math.floor(x - rx - 2)), w = Math.min(TEX_W, Math.ceil(x + rx + 2)) - minX;
    if (w > 0) (foil ? this.fctx : this.ctx).drawImage(this.tmp, minX, 0, w, TEX_H, minX, 0, w, TEX_H);
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
    this.resetFoil();
    s.paint(this);
    this.changed();
  }

  foilDataURL() {
    try { return this.fcanvas.toDataURL('image/webp', 0.9); } catch { return this.fcanvas.toDataURL('image/png'); }
  }

  loadFoilDataURL(url) {
    return new Promise((resolve) => {
      if (!url) { this.resetFoil(); this.changed(); resolve(false); return; }
      const img = new Image();
      img.onload = () => { this.fctx.drawImage(img, 0, 0, TEX_W, TEX_H); this.changed(); resolve(true); };
      img.onerror = () => resolve(false);
      img.src = url;
    });
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

// Rayures ondulées type maquereau sur le dos
function mackerelLines(p, color, count = 16, seed = 3) {
  const g = p.ctx;
  const r = rng(seed);
  g.save();
  g.strokeStyle = color;
  g.lineCap = 'round';
  for (let k = 0; k < count; k++) {
    const u = 0.14 + (0.8 * (k + r() * 0.5)) / count;
    const { sx } = p.scaleAt(u);
    g.lineWidth = sx * (0.9 + r() * 0.7);
    for (const side of [1, -1]) {
      g.beginPath();
      for (let i = 0; i <= 20; i++) {
        const f = (i / 20) * 0.34;
        const th = Math.acos(1 - 2 * f);
        const y = side > 0 ? (th / (Math.PI * 2)) * TEX_H : TEX_H - (th / (Math.PI * 2)) * TEX_H;
        const x = u * TEX_W + Math.sin(i * 0.9 + k) * sx * 1.6 + i * sx * 0.25;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  g.restore();
}

// Tache claire autour de l'œil (« face » blanche des stickbaits)
function facePatch(p, color, u0 = 0.02, u1 = 0.2, f0 = 0.1, f1 = 0.85, alpha = 1) {
  p.lengthwise(color, u0, u1, alpha, 0.03);
  void f0; void f1;
}

export const SCHEMES = [
  {
    id: 'sardineHolo', name: { fr: 'Sardine holo', en: 'Holo sardine' },
    swatch: ['#1d4f6e', '#c9d6dc', '#ffffff'],
    paint(p) {
      p.fill('#ffffff');
      p.gradient([[0, '#173f5c'], [0.18, '#2f7f8f'], [0.32, '#b9c9cf'], [0.6, '#eef2f3'], [1, '#ffffff']]);
      p.scales({ color: '#143447', size: 2.4, line: 0.3, alpha: 0.45, f0: 0, f1: 0.5 });
      p.spots('#10232e', { count: 7, min: 1.2, max: 1.6, f0: 0.3, f1: 0.33, seed: 4 });
      p.foilBand(0.18, 0.8, 1);
      p.foilScales(0.15, 0.7);
      p.gill('#d4263a', 0.12, 0.5);
    },
  },
  {
    id: 'orangeTroll', name: { fr: 'Orange / jaune (traîne)', en: 'Orange / yellow (troll)' },
    swatch: ['#ff5a14', '#ffb21a', '#fff4b0'],
    paint(p) {
      p.fill('#fff4b0');
      p.gradient([[0, '#ff4a10'], [0.25, '#ff7a14'], [0.45, '#ffb21a'], [0.75, '#ffe35a'], [1, '#fff4b0']]);
      p.lengthwise('#ff3a0a', 0, 0.16, 0.6, 0.05);
      p.foilBand(0.3, 0.75, 0.6);
      p.scales({ color: '#d4560d', size: 2.6, line: 0.25, alpha: 0.35, f0: 0.05, f1: 0.55 });
    },
  },
  {
    id: 'redOrange', name: { fr: 'Rouge / orange flashy', en: 'Flashy red / orange' },
    swatch: ['#ff3d14', '#ff8a2a', '#ffffff'],
    paint(p) {
      p.fill('#ffe0c8');
      p.gradient([[0, '#e2280c'], [0.3, '#ff4a14'], [0.6, '#ff7a2a'], [0.85, '#ffb07a'], [1, '#ffe3cc']]);
      facePatch(p, '#ffffff', 0.04, 0.17, 0, 1, 0.9);
      p.band('#ffffff', 0.38, 0.52, 0.85, 0.03, 0.2, 0.9);
      p.foilBand(0.38, 0.52, 1, 0.03, 0.2, 0.9);
      p.gill('#b8160a', 0.17, 0.8);
    },
  },
  {
    id: 'chartreuseBlue', name: { fr: 'Chartreuse / bleu holo', en: 'Chartreuse / blue holo' },
    swatch: ['#16a3a3', '#d9f24a', '#ffffff'],
    paint(p) {
      p.fill('#ffffff');
      p.gradient([[0, '#0f6f8a'], [0.2, '#16a3a3'], [0.38, '#b8e6e0'], [0.65, '#f4fbf6'], [1, '#ffffff']]);
      p.lengthwise('#d9f24a', 0, 0.2, 0.95, 0.04);
      mackerelLines(p, 'rgba(10,60,90,0.55)', 14, 9);
      p.foilBand(0.2, 0.8, 1);
      p.foilScales(0.15, 0.75);
    },
  },
  {
    id: 'bonitoBlue', name: { fr: 'Bonite bleue', en: 'Blue bonito' },
    swatch: ['#163a8a', '#9fb4d6', '#ffffff'],
    paint(p) {
      p.fill('#ffffff');
      p.gradient([[0, '#0e2766'], [0.2, '#1d4fb0'], [0.35, '#8fa8d8'], [0.6, '#e6ecf5'], [1, '#ffffff']]);
      p.lengthwise('#0b1c4a', 0, 0.12, 0.7, 0.04);
      p.foilBand(0.2, 0.78, 1);
      p.foilScales(0.15, 0.7);
      for (let i = 0; i < 4; i++) p.band('#5a6d8c', 0.62 + i * 0.07, 0.64 + i * 0.07, 0.35, 0.01, 0.25, 0.85);
    },
  },
  {
    id: 'mackerel', name: { fr: 'Maquereau', en: 'Mackerel' },
    swatch: ['#1e6a5c', '#111', '#e8eef0'],
    paint(p) {
      p.fill('#ffffff');
      p.gradient([[0, '#1a5a55'], [0.2, '#2e8a7a'], [0.34, '#b8cdd0'], [0.6, '#eef3f4'], [1, '#ffffff']]);
      mackerelLines(p, 'rgba(10,15,18,0.9)', 18, 5);
      p.foilBand(0.3, 0.85, 1);
    },
  },
  {
    id: 'flyingFish', name: { fr: 'Poisson volant', en: 'Flying fish' },
    swatch: ['#1f3c9c', '#7fb0e8', '#ffffff'],
    paint(p) {
      p.fill('#ffffff');
      p.gradient([[0, '#162d78'], [0.25, '#2f5fc8'], [0.42, '#a8c8f0'], [0.65, '#f2f6fb'], [1, '#ffffff']]);
      p.foilBand(0.25, 0.75, 0.8);
      p.lateralLine('#1d3a8a', 0.4, 1.5);
    },
  },
  {
    id: 'pinkSardine', name: { fr: 'Sardine rose', en: 'Pink sardine' },
    swatch: ['#e0368a', '#f6b8d6', '#ffffff'],
    paint(p) {
      p.fill('#ffffff');
      p.gradient([[0, '#c21f72'], [0.22, '#ef4f9a'], [0.4, '#f6c0da'], [0.7, '#fbeef4'], [1, '#ffffff']]);
      p.foilBand(0.25, 0.8, 1);
      p.foilScales(0.2, 0.7);
    },
  },
  {
    id: 'redHead', name: { fr: 'Tête rouge', en: 'Red head' },
    swatch: ['#d61a1a', '#ffffff', '#e8e8e8'],
    paint(p) {
      p.fill('#ffffff');
      p.gradient([[0, '#f2f2f2'], [1, '#ffffff']]);
      p.lengthwise('#d61a1a', 0, 0.24, 1, 0.03);
      p.foilBand(0.2, 0.85, 0.8, 0.05, 0.22, 1);
    },
  },
  {
    id: 'skirtGreen', name: { fr: 'Tête chrome verte', en: 'Green chrome head' },
    swatch: ['#1ea860', '#9df0b8', '#e9fff0'],
    paint(p) {
      p.fill('#d8ffe6');
      p.gradient([[0, '#127a42'], [0.4, '#2ad07a'], [1, '#bff7d2']]);
      p.foilBand(0, 1, 1, 0.01);
    },
  },
  {
    id: 'softGhost', name: { fr: 'Shad naturel (souple)', en: 'Natural shad (soft)' },
    swatch: ['#5e6a4a', '#c8cfc4', '#f7f7f2'],
    paint(p) {
      p.fill('#f7f7f2');
      p.gradient([[0, '#4a5638'], [0.22, '#7c8a62'], [0.4, '#c8cfc4'], [0.7, '#f1f2ec'], [1, '#fbfbf7']]);
      p.glitter('#ffffff', 0.002, 7);
      p.glitter('#c9a24a', 0.001, 9);
    },
  },
  {
    id: 'glow', name: { fr: 'Phosphorescent', en: 'Glow' },
    swatch: ['#b8f5b0', '#effff0', '#ffffff'],
    paint(p) {
      p.fill('#f2fff2');
      p.gradient([[0, '#9de89a'], [0.5, '#dcffd8'], [1, '#f7fff7']]);
    },
  },
  {
    id: 'firetiger', name: { fr: 'Firetiger', en: 'Firetiger' },
    swatch: ['#9be22d', '#ff6a1a', '#111'],
    paint(p) {
      p.fill('#fff6d0');
      p.gradient([[0, '#3d8f1c'], [0.22, '#9be22d'], [0.5, '#d7f046'], [0.72, '#ffd24a'], [0.86, '#ff7b2a'], [1, '#ff5a1a']]);
      p.tigerBars('#141414', { count: 7, width: 3.4, depth: 0.6 });
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
      p.foilBand(0.25, 0.85, 1);
    },
  },
  {
    id: 'white', name: { fr: 'Blanc (apprêt)', en: 'White (primer)' },
    swatch: ['#ffffff', '#f2efe6', '#e5e1d6'],
    paint(p) { p.fill('#f2efe6'); },
  },
];
