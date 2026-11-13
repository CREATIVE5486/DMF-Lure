// Schéma coté de l'intérieur du leurre (vue de côté + vue de dessus), rendu sur canvas ou en SVG.
import { makeProfile, armaturePath, hangerPoints, lineTiePoint, lipFrame, pocketBalls, sectionXYZ } from './geometry.js';
import { POCKET_TYPES } from './design.js';

const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1).replace('.0', '');

// Crayon : même dessin vers canvas 2D ou chaîne SVG
function canvasPen(g) {
  return {
    line(x1, y1, x2, y2, st = {}) { g.save(); applyStroke(g, st); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.restore(); },
    poly(pts, closed, st = {}) {
      if (pts.length < 2) return;
      g.save(); applyStroke(g, st); g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (closed) g.closePath();
      if (st.fill) { g.fillStyle = st.fill; g.fill(); }
      if (st.stroke !== 'none') g.stroke();
      g.restore();
    },
    circle(cx, cy, r, st = {}) { g.save(); applyStroke(g, st); g.beginPath(); g.arc(cx, cy, Math.max(0.5, r), 0, Math.PI * 2); if (st.fill) { g.fillStyle = st.fill; g.fill(); } if (st.stroke !== 'none') g.stroke(); g.restore(); },
    text(x, y, s, st = {}) { g.save(); g.fillStyle = st.color || '#cfe3e6'; g.font = `${st.weight || 500} ${st.size || 11}px system-ui, sans-serif`; g.textAlign = st.align || 'center'; g.textBaseline = st.base || 'middle'; if (st.bg) { const w = g.measureText(s).width + 6; g.fillStyle = st.bg; g.fillRect(st.align === 'left' ? x - 3 : st.align === 'right' ? x - w + 3 : x - w / 2, y - 8, w, 16); g.fillStyle = st.color || '#cfe3e6'; } g.fillText(s, x, y); g.restore(); },
  };
}
function applyStroke(g, st) {
  g.strokeStyle = st.stroke && st.stroke !== 'none' ? st.stroke : '#cfe3e6';
  g.lineWidth = st.width || 1;
  g.setLineDash(st.dash || []);
}

function svgPen(out) {
  const at = (st) => `stroke="${st.stroke === 'none' ? 'none' : st.stroke || '#222'}" stroke-width="${st.width || 1}" fill="${st.fill || 'none'}"${st.dash ? ` stroke-dasharray="${st.dash.join(' ')}"` : ''}`;
  const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  return {
    line(x1, y1, x2, y2, st = {}) { out.push(`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" ${at(st)}/>`); },
    poly(pts, closed, st = {}) { if (pts.length < 2) return; out.push(`<${closed ? 'polygon' : 'polyline'} points="${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}" ${at(st)}/>`); },
    circle(cx, cy, r, st = {}) { out.push(`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${Math.max(0.5, r).toFixed(2)}" ${at(st)}/>`); },
    text(x, y, s, st = {}) { out.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-family="Arial, sans-serif" font-size="${st.size || 11}" font-weight="${st.weight || 500}" fill="${st.color || '#222'}" text-anchor="${st.align === 'left' ? 'start' : st.align === 'right' ? 'end' : 'middle'}" dominant-baseline="middle">${esc(s)}</text>`); },
  };
}

// Cote horizontale entre x1 et x2 (écran) à la hauteur y, avec texte
function dimH(pen, x1, x2, y, label, col, refY1 = null, refY2 = null) {
  if (refY1 !== null) pen.line(x1, refY1, x1, y + 3, { stroke: col, width: 0.6, dash: [2, 2] });
  if (refY2 !== null) pen.line(x2, refY2, x2, y + 3, { stroke: col, width: 0.6, dash: [2, 2] });
  pen.line(x1, y, x2, y, { stroke: col, width: 0.8 });
  const a = 4 * Math.sign(x2 - x1 || 1);
  pen.poly([[x1, y], [x1 + a, y - 2.2], [x1 + a, y + 2.2]], true, { stroke: 'none', fill: col });
  pen.poly([[x2, y], [x2 - a, y - 2.2], [x2 - a, y + 2.2]], true, { stroke: 'none', fill: col });
  pen.text((x1 + x2) / 2, y - 7, label, { color: col, size: 10 });
}
function dimV(pen, x, y1, y2, label, col) {
  pen.line(x, y1, x, y2, { stroke: col, width: 0.8 });
  const a = 4 * Math.sign(y2 - y1 || 1);
  pen.poly([[x, y1], [x - 2.2, y1 + a], [x + 2.2, y1 + a]], true, { stroke: 'none', fill: col });
  pen.poly([[x, y2], [x - 2.2, y2 - a], [x + 2.2, y2 - a]], true, { stroke: 'none', fill: col });
  pen.text(x + 4, (y1 + y2) / 2, label, { color: col, size: 10, align: 'left' });
}

// Emprise d'un logement projetée : vue de côté (x,y) ou de dessus (x,z)
function pocketOutline(p, view, N = 40) {
  const pts = [];
  const along = view === 'side' ? (p.axis === 'x' ? 'h' : p.axis === 'y' ? 'v' : 'c') : (p.axis === 'x' ? 'h' : p.axis === 'z' ? 'v' : 'c');
  const cx = p.x, cy = view === 'side' ? p.y : (p.z || 0);
  if (p.shape === 'sphere' || along === 'c') {
    const r = p.dia / 2;
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return pts;
  }
  if (p.shape === 'box') {
    const hx = p.length / 2, hy = (view === 'side' ? p.height : p.width) / 2;
    const r = Math.min(hx, hy) * 0.35;
    const corner = (x0, y0, a0) => { for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * (Math.PI / 2); pts.push([x0 + Math.cos(a) * r, y0 + Math.sin(a) * r]); } };
    corner(cx + hx - r, cy + hy - r, 0); corner(cx - hx + r, cy + hy - r, Math.PI / 2); corner(cx - hx + r, cy - hy + r, Math.PI); corner(cx + hx - r, cy - hy + r, Math.PI * 1.5);
    return pts;
  }
  const r = p.dia / 2, half = Math.max(0, p.length / 2 - r);
  const hor = along === 'h';
  for (let i = 0; i <= N / 2; i++) { const a = -Math.PI / 2 + (i / (N / 2)) * Math.PI; pts.push(hor ? [cx + half + Math.cos(a) * r, cy + Math.sin(a) * r] : [cx + Math.sin(a) * r, cy + half + Math.cos(a) * r]); }
  for (let i = 0; i <= N / 2; i++) { const a = Math.PI / 2 + (i / (N / 2)) * Math.PI; pts.push(hor ? [cx - half + Math.cos(a) * r, cy + Math.sin(a) * r] : [cx + Math.sin(a) * r, cy - half + Math.cos(a) * r]); }
  return pts;
}

export function pocketLabel(p) {
  if (p.shape === 'box') return `${fmt(p.length)} × ${fmt(p.height)} × ${fmt(p.width)}`;
  if (p.shape === 'sphere') return `Ø${fmt(p.dia)}`;
  return `Ø${fmt(p.dia)} × ${fmt(p.length)}`;
}

/* Dessine le schéma. W, H : taille en px. sel : id du logement sélectionné. light : thème clair (export). */
export function drawSketch(pen, design, W, H, { sel = null, light = false, editWire = false, lang = 'fr' } = {}) {
  const C = light
    ? { bg: '#ffffff', body: '#1a2a30', fillBody: '#eef3f4', cav: '#7d8f95', wire: '#4b5560', dim: '#0b6b5d', dim2: '#7a4b00', pocketB: '#d9822b', pocketA: '#2a8fd6', pocketR: '#8a55d6', ball: '#555c66', text: '#1a2a30', sel: '#e0a800' }
    : { bg: '#0a1a20', body: '#2fd3b5', fillBody: 'rgba(47,211,181,0.07)', cav: 'rgba(200,230,235,0.45)', wire: '#c8ced6', dim: '#8fe3d3', dim2: '#ffd166', pocketB: '#ffa64d', pocketA: '#45c8ff', pocketR: '#c58cff', ball: '#aab1ba', text: '#cfe3e6', sel: '#ffd166' };
  const d = design;
  const P = makeProfile(d);
  const lipOn = d.lip.enabled && d.type !== 'imported';
  let xMin = 0, xMax = P.L + 4;
  let lipPts = null;
  if (lipOn) {
    const F = lipFrame(d);
    const tip = F.root.clone().addScaledVector(F.dir, d.lip.length);
    const n = F.normal.clone().multiplyScalar(Math.max(1, d.lip.thickness) / 2);
    lipPts = [[F.root.x + n.x, F.root.y + n.y], [tip.x + n.x, tip.y + n.y], [tip.x - n.x, tip.y - n.y], [F.root.x - n.x, F.root.y - n.y]];
    xMin = Math.min(xMin, tip.x - 2);
  }
  const hk = hangerPoints(d);
  for (const h of hk) xMax = Math.max(xMax, h.point.x + 2);
  const yTop = Math.max(...Array.from({ length: 41 }, (_, i) => P.top(i / 40)));
  const yBot = -Math.max(...Array.from({ length: 41 }, (_, i) => P.bot(i / 40)));
  const pockets = d.interior?.pockets || [];
  const rows = pockets.length + (hk.filter((h) => h.kind === 'belly').length ? 1 : 0) + 1;
  // mise en page : vue de côté en haut, cotes dessous, vue de dessus en bas
  const marginL = 46, marginR = 70, top0 = 34;
  const sideHmm = yTop - yBot, topWmm = P.W * Math.max(1, P.bw, P.vw);
  const dimSpace = 18 * rows + 24;
  const avail = H - top0 - dimSpace - 40;
  const s = Math.min((W - marginL - marginR) / (xMax - xMin), avail / (sideHmm + topWmm + 10));
  const X = (x) => marginL + (x - xMin) * s;
  const sideY0 = top0 + yTop * s; // y = 0 du leurre
  const SY = (y) => sideY0 - y * s;
  const topY0 = sideY0 - yBot * s + dimSpace + 14 + (topWmm / 2) * s;
  const TY = (z) => topY0 - z * s;
  const hits = [];
  const t = (fr, en) => (lang === 'en' ? en : fr);

  pen.text(marginL, 14, t('VUE DE CÔTÉ', 'SIDE VIEW'), { color: C.text, size: 11, weight: 700, align: 'left' });
  // contour vue de côté
  const N = 160;
  const outline = [];
  for (let i = 0; i <= N; i++) { const u = i / N; outline.push([X(u * P.L), SY(P.top(u))]); }
  for (let i = N; i >= 0; i--) { const u = i / N; outline.push([X(u * P.L), SY(-P.bot(u))]); }
  pen.poly(outline, true, { stroke: C.body, width: 1.6, fill: C.fillBody });
  if (lipPts) pen.poly(lipPts.map(([x, y]) => [X(x), SY(y)]), true, { stroke: C.body, width: 1.2, fill: C.fillBody });
  pen.line(X(xMin) - 6, SY(0), X(xMax) + 6, SY(0), { stroke: C.cav, width: 0.6, dash: [6, 3, 1, 3] });
  // cavité automatique
  if (d.interior?.autoHollow !== false && (d.print.infill || 0) < 100) {
    const w = d.print.wall;
    const cav = [];
    for (let i = 4; i <= N - 4; i++) { const u = i / N; const tp = P.top(u) - w; if (tp > 0.5) cav.push([X(u * P.L), SY(tp)]); }
    for (let i = N - 4; i >= 4; i--) { const u = i / N; const bt = P.bot(u) - w; if (bt > 0.5) cav.push([X(u * P.L), SY(-bt)]); }
    pen.poly(cav, true, { stroke: C.cav, width: 0.8, dash: [4, 3] });
  }
  // armature
  const wire = armaturePath(d);
  if (d.interior?.wire?.enabled !== false) {
    pen.poly(wire.map(([x, y]) => [X(x), SY(y)]), false, { stroke: C.wire, width: Math.max(1.2, (d.interior?.wire?.dia || 1) * s) });
    if (editWire) wire.forEach(([x, y], i) => { pen.circle(X(x), SY(y), 4.5, { stroke: C.sel, width: 1.4, fill: C.bg }); hits.push({ kind: 'wire', i, x: X(x), y: SY(y), r: 7 }); });
  }
  // attache + pitons
  const tie = lineTiePoint(d).point;
  pen.circle(X(tie.x), SY(tie.y), 3, { stroke: C.text, width: 1.2 });
  for (const h of hk) pen.circle(X(h.point.x), SY(h.point.y), 2.6, { stroke: C.text, width: 1.2 });
  // lest libre
  if ((d.ballast.grams || 0) > 0) {
    const u = Math.max(0.05, Math.min(0.92, d.ballast.u));
    pen.circle(X(u * P.L), SY(-P.bot(u) * 0.45), 3.5, { stroke: C.ball, width: 1, fill: C.ball });
  }
  // logements
  const colFor = (p) => (p.type === 'air' ? C.pocketA : p.type === 'rattle' ? C.pocketR : C.pocketB);
  for (const p of pockets) {
    const isSel = p.id === sel;
    const col = colFor(p);
    pen.poly(pocketOutline(p, 'side').map(([x, y]) => [X(x), SY(y)]), true, { stroke: isSel ? C.sel : col, width: isSel ? 2 : 1.3, fill: light ? 'none' : 'rgba(255,255,255,0.04)' });
    for (const [bx, by] of pocketBalls(p)) pen.circle(X(bx), SY(by), (p.ballDia / 2) * s, { stroke: C.ball, width: 0.8, fill: light ? '#c9cdd2' : 'rgba(170,177,186,0.45)' });
    pen.text(X(p.x), SY(p.y) - (p.shape === 'box' ? p.height : p.axis === 'y' ? p.length : p.dia) / 2 * s - 8, pocketLabel(p), { color: isSel ? C.sel : col, size: 10, weight: 700, bg: light ? '#ffffff' : 'rgba(10,26,32,0.8)' });
    hits.push({ kind: 'pocket', id: p.id, view: 'side', x: X(p.x), y: SY(p.y), r: Math.max(8, Math.min(p.length || p.dia, 30) / 2 * s) });
  }
  // cotes : longueur totale (en haut), hauteur (à droite)
  dimH(pen, X(0), X(P.L), top0 - 10, `${fmt(P.L)} mm`, C.dim, SY(P.top(0.02)), SY(P.top(0.98)));
  dimV(pen, X(xMax) + 22, SY(yTop), SY(yBot), `${fmt(yTop - yBot)}`, C.dim);
  // chaîne de cotes depuis le nez
  let row = 0;
  const baseY = SY(yBot) + 22;
  for (const p of pockets) {
    const y = baseY + row * 18;
    dimH(pen, X(0), X(p.x), y, `${fmt(p.x)}`, colFor(p), SY(0), SY(p.y));
    pen.text(X(p.x) + 6, y, `${t('h', 'h')} ${p.y >= 0 ? '+' : ''}${fmt(p.y)}`, { color: colFor(p), size: 9, align: 'left' });
    row++;
  }
  const bellyH = hk.filter((h) => h.kind === 'belly');
  if (bellyH.length) {
    const y = baseY + row * 18;
    let prev = 0;
    for (const h of bellyH) { dimH(pen, X(prev), X(h.point.x), y, fmt(h.point.x - prev), C.dim2, prev === 0 ? SY(0) : null, SY(h.point.y)); prev = h.point.x; }
    pen.text(X(xMax) + 4, y, t('pitons', 'hangers'), { color: C.dim2, size: 9, align: 'left' });
  }

  // vue de dessus
  pen.text(marginL, topY0 - (topWmm / 2) * s - 12, t('VUE DE DESSUS', 'TOP VIEW'), { color: C.text, size: 11, weight: 700, align: 'left' });
  const plan = [];
  const widthAt = (u) => {
    let zm = 0;
    const tp = P.top(u), bt = P.bot(u), hw = P.hw(u);
    for (let j = 0; j <= 24; j++) zm = Math.max(zm, sectionXYZ(P, u, (j / 24) * Math.PI, tp, bt, hw)[2]);
    return zm;
  };
  for (let i = 0; i <= N; i++) { const u = i / N; plan.push([X(u * P.L), TY(widthAt(u))]); }
  for (let i = N; i >= 0; i--) { const u = i / N; plan.push([X(u * P.L), TY(-widthAt(u))]); }
  pen.poly(plan, true, { stroke: C.body, width: 1.6, fill: C.fillBody });
  pen.line(X(xMin) - 6, TY(0), X(xMax) + 6, TY(0), { stroke: C.cav, width: 0.6, dash: [6, 3, 1, 3] });
  if (d.interior?.wire?.enabled !== false) pen.line(X(wire[0][0]), TY(0), X(wire.at(-1)[0]), TY(0), { stroke: C.wire, width: Math.max(1.2, (d.interior?.wire?.dia || 1) * s) });
  for (const p of pockets) {
    const isSel = p.id === sel;
    pen.poly(pocketOutline(p, 'top').map(([x, z]) => [X(x), TY(z)]), true, { stroke: isSel ? C.sel : colFor(p), width: isSel ? 2 : 1.2 });
    for (const [bx, , bz] of pocketBalls(p)) pen.circle(X(bx), TY(bz), (p.ballDia / 2) * s, { stroke: C.ball, width: 0.8, fill: light ? '#c9cdd2' : 'rgba(170,177,186,0.45)' });
    hits.push({ kind: 'pocket', id: p.id, view: 'top', x: X(p.x), y: TY(p.z || 0), r: Math.max(8, Math.min(p.length || p.dia, 30) / 2 * s) });
  }
  const wMax = Math.max(...Array.from({ length: 41 }, (_, i) => widthAt(i / 40)));
  dimV(pen, X(xMax) + 22, TY(wMax), TY(-wMax), `${fmt(wMax * 2)}`, C.dim);
  // légende
  const leg = [[C.pocketB, POCKET_TYPES.balls[lang] || POCKET_TYPES.balls.fr], [C.pocketA, POCKET_TYPES.air[lang] || POCKET_TYPES.air.fr], [C.pocketR, POCKET_TYPES.rattle[lang] || POCKET_TYPES.rattle.fr], [C.wire, t('Armature', 'Armature')]];
  let lx = W - marginR - 10;
  for (let i = leg.length - 1; i >= 0; i--) {
    const [c, l] = leg[i];
    pen.text(lx, 14, l, { color: c, size: 10, align: 'right' });
    lx -= l.length * 5.6 + 22;
  }
  pen.text(W - 8, H - 8, t('Cotes en mm depuis le nez · h = hauteur / axe', 'Dimensions in mm from the nose · h = height / axis'), { color: C.text, size: 9, align: 'right' });
  return { hits, X, SY, TY, s, sideY0, topY0, xMin };
}

export function sketchCanvas(canvas, design, opts) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 800, H = canvas.clientHeight || 600;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0a1a20';
  g.fillRect(0, 0, W, H);
  return drawSketch(canvasPen(g), design, W, H, opts);
}

export function sketchSVG(design, opts = {}) {
  const W = 1100, H = 780;
  const out = [];
  out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  drawSketch(svgPen(out), design, W, H, { ...opts, light: true });
  out.push(`<text x="12" y="${H - 8}" font-family="Arial, sans-serif" font-size="10" fill="#555">${String(design.name).replace(/[<>&]/g, '')} — DMF Lure Studio</text>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${out.join('\n')}\n</svg>\n`;
}
