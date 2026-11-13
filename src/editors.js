// Éditeurs 2D interactifs : profil (vue de côté) et vue de dessus, points de contrôle déplaçables.
import { makeProfile, sectionCurve, SECTION_K } from './geometry.js';
import { makeMonotone } from './curves.js';
import { state, updateDesign } from './store.js';
import { T } from './i18n.js';

const COL = { grid: 'rgba(120,180,190,0.10)', axis: 'rgba(120,180,190,0.35)', fill: 'rgba(47,211,181,0.10)', line: '#2fd3b5', raw: 'rgba(47,211,181,0.35)', pt: '#e9fffa', ptA: '#ffd166', lip: 'rgba(190,225,240,0.55)' };

export class CurveEditor {
  // mode 'side' : courbes top (y>0) et bottom (y<0) ; mode 'plan' : demi-largeur miroir
  constructor(mode, opts = {}) {
    this.mode = mode;
    this.onSelect = opts.onSelect || null;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'curve-editor' + (opts.tall ? ' tall' : '');
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
      if (p) { this.drag = p; this.selected = { key: p.curve.key, i: p.i }; this.onSelect?.(this.selected); c.setPointerCapture(e.pointerId); e.preventDefault(); }
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

/* ===================== Éditeur de section (station) ===================== */

export class SectionEditor {
  constructor(getIndex, onSelect = null) {
    this.getIndex = getIndex;
    this.onSelect = onSelect;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'section-editor';
    this.ctx = this.canvas.getContext('2d');
    this.drag = null;
    this.sel = -1;
    this.bind();
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(this.canvas);
  }

  station() {
    const st = state.design.body.sections?.stations || [];
    return st[this.getIndex()] || null;
  }

  frame() {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 300, hh = c.clientHeight || 260;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hh * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); }
    const st = this.station();
    const P = makeProfile(state.design);
    const u = st ? st.u : 0.5;
    const top = P.top(u), bot = P.bot(u), hw = P.hw(u);
    const s = Math.min((w - 40) / (2 * hw * 1.3), (hh - 30) / ((top + bot) * 1.1));
    return { w, hh, dpr, s, cx: w / 2, cy: 15 + top * s * 1.05, top, bot, hw, u };
  }

  // point normalisé → écran (en tenant compte de la normalisation de largeur)
  toScreen(F, zn, yn, zm) { return [F.cx + (zn / zm) * F.hw * F.s, F.cy - (yn >= 0 ? yn * F.top : yn * F.bot) * F.s]; }
  fromScreen(F, x, y, zm) {
    const z = ((x - F.cx) / (F.hw * F.s)) * zm;
    const yy = (F.cy - y) / F.s;
    return [Math.max(0, z), Math.max(-1, Math.min(1, yy >= 0 ? yy / F.top : yy / F.bot))];
  }

  bind() {
    const c = this.canvas;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const find = (x, y) => {
      const st = this.station();
      if (!st) return -1;
      const F = this.frame();
      const zm = sectionCurve(st.pts).zm;
      let best = -1, bd = 14;
      st.pts.forEach(([z, yv], i) => { const [sx, sy] = this.toScreen(F, z, yv, zm); const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = i; } });
      return best;
    };
    c.addEventListener('pointerdown', (e) => {
      const [x, y] = pos(e);
      const i = find(x, y);
      if (e.button === 2) {
        if (i >= 0 && this.station().pts.length > 2) updateDesign((d) => { d.body.sections.stations[this.getIndex()].pts.splice(i, 1); }, { source: 'editor' });
        e.preventDefault();
        return;
      }
      if (i >= 0) { this.sel = i; this.drag = { i, zm: sectionCurve(this.station().pts).zm }; c.setPointerCapture(e.pointerId); this.onSelect?.(i); this.draw(); }
    });
    c.addEventListener('pointermove', (e) => {
      const [x, y] = pos(e);
      if (!this.drag) { c.style.cursor = find(x, y) >= 0 ? 'grab' : 'crosshair'; return; }
      const F = this.frame();
      const [z, yn] = this.fromScreen(F, x, y, this.drag.zm);
      updateDesign((d) => { d.body.sections.stations[this.getIndex()].pts[this.drag.i] = [Math.round(z * 1000) / 1000, Math.round(yn * 1000) / 1000]; }, { source: 'editor' });
    });
    const end = () => { this.drag = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('dblclick', (e) => {
      const st = this.station();
      if (!st) return;
      const [x, y] = pos(e);
      const F = this.frame();
      const zm = sectionCurve(st.pts).zm;
      const [z, yn] = this.fromScreen(F, Math.max(F.cx, x), y, zm);
      // insertion dans l'ordre dos → ventre (y décroissant)
      const pts = st.pts;
      let at = pts.findIndex((p) => p[1] < yn);
      if (at < 0) at = pts.length;
      updateDesign((d) => { d.body.sections.stations[this.getIndex()].pts.splice(at, 0, [Math.round(z * 1000) / 1000, Math.round(yn * 1000) / 1000]); }, { source: 'editor' });
    });
  }

  draw() {
    const F = this.frame();
    const g = this.ctx;
    g.setTransform(F.dpr, 0, 0, F.dpr, 0, 0);
    g.clearRect(0, 0, F.w, F.hh);
    g.strokeStyle = 'rgba(120,180,190,0.10)';
    const step = 2 * F.s;
    for (let x = F.cx % step; x < F.w; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, F.hh); g.stroke(); }
    for (let y = F.cy % step; y < F.hh; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(F.w, y); g.stroke(); }
    g.strokeStyle = 'rgba(120,180,190,0.4)';
    g.beginPath(); g.moveTo(F.cx, 0); g.lineTo(F.cx, F.hh); g.moveTo(0, F.cy); g.lineTo(F.w, F.cy); g.stroke();
    const all = state.design.body.sections?.stations || [];
    const idx = this.getIndex();
    const drawCurve = (st, color, width, dash = []) => {
      const { Z, Y } = sectionCurve(st.pts);
      g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash);
      for (const side of [1, -1]) {
        g.beginPath();
        for (let k = 0; k < SECTION_K; k++) {
          const x = F.cx + side * Z[k] * F.hw * F.s, y = F.cy - (Y[k] >= 0 ? Y[k] * F.top : Y[k] * F.bot) * F.s;
          if (k) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.stroke();
      }
      g.setLineDash([]);
    };
    all.forEach((st, i) => { if (i !== idx) drawCurve(st, 'rgba(200,230,235,0.22)', 1, [4, 4]); });
    const st = all[idx];
    if (!st) return;
    // remplissage de la section courante
    const { Z, Y, zm } = sectionCurve(st.pts);
    g.beginPath();
    for (let k = 0; k < SECTION_K; k++) { const x = F.cx + Z[k] * F.hw * F.s, y = F.cy - (Y[k] >= 0 ? Y[k] * F.top : Y[k] * F.bot) * F.s; if (k) g.lineTo(x, y); else g.moveTo(x, y); }
    for (let k = SECTION_K - 1; k >= 0; k--) { const x = F.cx - Z[k] * F.hw * F.s, y = F.cy - (Y[k] >= 0 ? Y[k] * F.top : Y[k] * F.bot) * F.s; g.lineTo(x, y); }
    g.fillStyle = 'rgba(47,211,181,0.12)';
    g.fill();
    drawCurve(st, '#2fd3b5', 2);
    // polygone de contrôle + points
    g.strokeStyle = 'rgba(255,209,102,0.35)'; g.lineWidth = 1;
    g.beginPath();
    const ctrl = [[0, 1], ...st.pts, [0, -1]];
    ctrl.forEach(([z, y], i) => { const [sx, sy] = this.toScreen(F, z, y, zm); if (i) g.lineTo(sx, sy); else g.moveTo(sx, sy); });
    g.stroke();
    st.pts.forEach(([z, y], i) => {
      const [sx, sy] = this.toScreen(F, z, y, zm);
      g.beginPath(); g.arc(sx, sy, i === this.sel ? 6.5 : 5, 0, Math.PI * 2);
      g.fillStyle = i === this.sel ? '#ffd166' : '#e9fffa'; g.fill();
      g.strokeStyle = '#0b1a20'; g.lineWidth = 2; g.stroke();
    });
    g.fillStyle = 'rgba(200,230,235,0.75)';
    g.font = '11px system-ui, sans-serif';
    g.fillText(`${(st.u * state.design.body.length).toFixed(1)} mm`, 8, F.hh - 8);
    g.fillText(`${(2 * F.hw).toFixed(1)} × ${(F.top + F.bot).toFixed(1)} mm`, F.w - 110, F.hh - 8);
  }

  destroy() { this.ro.disconnect(); }
}
