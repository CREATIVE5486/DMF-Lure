// Éditeurs 2D interactifs : profil (vue de côté) et vue de dessus, points de contrôle déplaçables.
import { makeProfile } from './geometry.js';
import { makeMonotone } from './curves.js';
import { state, updateDesign } from './store.js';
import { T } from './i18n.js';

const COL = { grid: 'rgba(120,180,190,0.10)', axis: 'rgba(120,180,190,0.35)', fill: 'rgba(47,211,181,0.10)', line: '#2fd3b5', raw: 'rgba(47,211,181,0.35)', pt: '#e9fffa', ptA: '#ffd166', lip: 'rgba(190,225,240,0.55)' };

export class CurveEditor {
  // mode 'side' : courbes top (y>0) et bottom (y<0) ; mode 'plan' : demi-largeur miroir
  constructor(mode) {
    this.mode = mode;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'curve-editor';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', mode === 'side' ? T('Profil latéral éditable', 'Editable side profile') : T('Vue de dessus éditable', 'Editable top view'));
    this.ctx = this.canvas.getContext('2d');
    this.drag = null;
    this.hover = null;
    this.bind();
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(this.canvas);
  }

  curves() {
    const b = state.design.body;
    return this.mode === 'side' ? [{ key: 'top', sign: 1, k: b.height }, { key: 'bottom', sign: -1, k: b.height }] : [{ key: 'plan', sign: 1, k: b.width / 2, mirror: true }];
  }

  frame() {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 300, hgt = c.clientHeight || 150;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hgt * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hgt * dpr); }
    const b = state.design.body;
    const L = b.length;
    const ext = this.mode === 'side' ? b.height * 0.95 : b.width * 0.75;
    const pad = 14;
    const s = Math.min((w - pad * 2) / (L * 1.18), (hgt - pad * 2) / (ext * 2));
    const ox = pad + (w - pad * 2 - L * s) * 0.62, oy = hgt / 2;
    return { w, hgt, s, ox, oy, dpr, L };
  }

  toScreen(F, xmm, ymm) { return [F.ox + xmm * F.s, F.oy - ymm * F.s]; }

  points() {
    const F = this.frame();
    const out = [];
    for (const c of this.curves()) {
      state.design.body[c.key].forEach((p, i) => {
        const [x, y] = this.toScreen(F, p[0] * F.L, c.sign * p[1] * c.k);
        out.push({ curve: c, i, x, y });
      });
    }
    return out;
  }

  bind() {
    const c = this.canvas;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const find = (x, y) => {
      let best = null, bd = 14;
      for (const p of this.points()) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
      return best;
    };
    c.addEventListener('pointerdown', (e) => {
      const [x, y] = pos(e);
      const p = find(x, y);
      if (e.button === 2 || e.altKey) { if (p) this.remove(p); e.preventDefault(); return; }
      if (p) { this.drag = p; c.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    c.addEventListener('pointermove', (e) => {
      const [x, y] = pos(e);
      if (!this.drag) { const p = find(x, y); this.hover = p; c.style.cursor = p ? 'grab' : 'crosshair'; this.draw(); return; }
      const F = this.frame();
      const { curve, i } = this.drag;
      const arr = state.design.body[curve.key];
      let u = (x - F.ox) / F.s / F.L;
      let v = ((F.oy - y) / F.s / curve.k) * curve.sign;
      v = Math.max(0.02, Math.min(1.4, v));
      const first = i === 0, last = i === arr.length - 1;
      if (first) u = 0; else if (last) u = 1;
      else u = Math.max(arr[i - 1][0] + 0.02, Math.min(arr[i + 1][0] - 0.02, u));
      updateDesign((d) => { d.body[curve.key][i] = [round3(u), round3(v)]; }, { source: 'editor' });
    });
    const end = () => { this.drag = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('dblclick', (e) => {
      const [x, y] = pos(e);
      if (find(x, y)) return;
      const F = this.frame();
      const u = (x - F.ox) / F.s / F.L;
      if (u <= 0.02 || u >= 0.98) return;
      const yy = (F.oy - y) / F.s;
      const cs = this.curves();
      const curve = cs.length > 1 ? (yy >= 0 ? cs[0] : cs[1]) : cs[0];
      const f = makeMonotone(state.design.body[curve.key]);
      updateDesign((d) => {
        const arr = d.body[curve.key];
        arr.push([round3(u), round3(f(u))]);
        arr.sort((a, b) => a[0] - b[0]);
      }, { source: 'editor' });
    });
  }

  remove(p) {
    const arr = state.design.body[p.curve.key];
    if (arr.length <= 3 || p.i === 0 || p.i === arr.length - 1) return;
    updateDesign((d) => { d.body[p.curve.key].splice(p.i, 1); }, { source: 'editor' });
  }

  draw() {
    const F = this.frame();
    const g = this.ctx;
    g.setTransform(F.dpr, 0, 0, F.dpr, 0, 0);
    g.clearRect(0, 0, F.w, F.hgt);
    // grille 5 mm
    g.strokeStyle = COL.grid;
    g.lineWidth = 1;
    const step = 5 * F.s;
    for (let x = F.ox % step; x < F.w; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, F.hgt); g.stroke(); }
    for (let y = F.oy % step; y < F.hgt; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(F.w, y); g.stroke(); }
    g.strokeStyle = COL.axis;
    g.beginPath(); g.moveTo(0, F.oy); g.lineTo(F.w, F.oy); g.stroke();

    const P = makeProfile(state.design);
    const N = 160;
    const outline = [];
    if (this.mode === 'side') {
      for (let i = 0; i <= N; i++) { const u = i / N; outline.push(this.toScreen(F, u * F.L, P.top(u))); }
      for (let i = N; i >= 0; i--) { const u = i / N; outline.push(this.toScreen(F, u * F.L, -P.bot(u))); }
    } else {
      for (let i = 0; i <= N; i++) { const u = i / N; outline.push(this.toScreen(F, u * F.L, P.hw(u))); }
      for (let i = N; i >= 0; i--) { const u = i / N; outline.push(this.toScreen(F, u * F.L, -P.hw(u))); }
    }
    g.beginPath();
    outline.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fillStyle = COL.fill;
    g.fill();
    g.strokeStyle = COL.line;
    g.lineWidth = 2;
    g.stroke();

    // bavette (vue de côté)
    const d = state.design;
    if (this.mode === 'side' && d.lip.enabled) {
      const a = (d.lip.angle * Math.PI) / 180;
      const u = d.lip.posU;
      const rx = u * F.L, ry = -P.bot(u) * d.lip.rootDepth;
      const [x0, y0] = this.toScreen(F, rx, ry);
      const [x1, y1] = this.toScreen(F, rx - Math.cos(a) * d.lip.length, ry - Math.sin(a) * d.lip.length);
      g.strokeStyle = COL.lip;
      g.lineWidth = Math.max(2, d.lip.thickness * F.s);
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.lineCap = 'butt';
    }

    // courbes brutes et points
    for (const c of this.curves()) {
      const f = makeMonotone(state.design.body[c.key]);
      g.strokeStyle = COL.raw;
      g.setLineDash([4, 4]);
      g.lineWidth = 1;
      for (const sg of c.mirror ? [1, -1] : [1]) {
        g.beginPath();
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          const [x, y] = this.toScreen(F, u * F.L, sg * c.sign * f(u) * c.k);
          if (i) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.stroke();
      }
      g.setLineDash([]);
    }
    for (const p of this.points()) {
      const active = this.drag && this.drag.curve.key === p.curve.key && this.drag.i === p.i;
      const hov = this.hover && this.hover.curve.key === p.curve.key && this.hover.i === p.i;
      g.beginPath();
      g.arc(p.x, p.y, active || hov ? 6.5 : 5, 0, Math.PI * 2);
      g.fillStyle = active ? COL.ptA : COL.pt;
      g.fill();
      g.strokeStyle = '#0b1a20';
      g.lineWidth = 2;
      g.stroke();
    }
    // cote
    g.fillStyle = 'rgba(200,230,235,0.7)';
    g.font = '11px system-ui, sans-serif';
    g.fillText(`${state.design.body.length} mm`, F.ox + (F.L * F.s) / 2 - 18, F.hgt - 4);
  }

  destroy() { this.ro.disconnect(); }
}

const round3 = (v) => Math.round(v * 1000) / 1000;
