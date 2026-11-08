// Propriétés massiques et hydrostatiques du leurre fini (corrigées pour l'impression).
import {
  makeProfile, buildSolidBody, buildCavity, buildLipSoup, buildPaddleSoup, leaderHoleSoup, soupVolume, soupArea,
  lineTiePoint, hangerPoints, sectionXYZ, lipFrame, ringSpec,
} from './geometry.js';
import { MATERIALS, BALLAST_MATERIALS, hardwareFor, hookSpec } from './design.js';

export const WATER = { fresh: 0.998, salt: 1.025 };
const STEEL = 7.85;
const G = 9.81;

function sectionPoly(P, u, n = 48) {
  const top = P.top(u), bot = P.bot(u), hw = P.hw(u);
  const pts = [];
  for (let j = 0; j < n; j++) { const p = sectionXYZ(P, u, (j / n) * Math.PI * 2, top, bot, hw); pts.push([p[1], p[2]]); }
  return pts;
}

function polyArea(pts) {
  let A = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; A += a[0] * b[1] - b[0] * a[1]; }
  return Math.abs(A) / 2;
}

// Aire et centroïde (y) de la partie de section sous y < h
function clipBelow(pts, h) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ina = a[0] < h, inb = b[0] < h;
    if (ina) out.push(a);
    if (ina !== inb) { const t = (h - a[0]) / (b[0] - a[0]); out.push([h, a[1] + (b[1] - a[1]) * t]); }
  }
  if (out.length < 3) return { A: 0, cy: 0 };
  let A = 0, cy = 0;
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length];
    const cr = a[0] * b[1] - b[0] * a[1];
    A += cr; cy += (a[0] + b[0]) * cr;
  }
  if (Math.abs(A) < 1e-9) return { A: 0, cy: 0 };
  return { A: Math.abs(A) / 2, cy: cy / (3 * A) };
}

export function bodyDims(design) {
  const P = makeProfile(design);
  let maxH = 0, maxW = 0, maxA = 0, yTop = -1e9, yBot = 1e9;
  for (let i = 0; i <= 100; i++) {
    const u = i / 100;
    maxH = Math.max(maxH, P.top(u) + P.bot(u));
    yTop = Math.max(yTop, P.top(u));
    yBot = Math.min(yBot, -P.bot(u));
    if (i % 4 === 0) {
      const poly = sectionPoly(P, u, 40);
      let w = 0;
      for (const p of poly) w = Math.max(w, Math.abs(p[1]) * 2);
      maxW = Math.max(maxW, w);
      maxA = Math.max(maxA, polyArea(poly));
    }
  }
  return { length: P.L, height: maxH, width: maxW, frontalArea: maxA, yTop, yBot };
}

export function lipArea(design) {
  if (!design.lip.enabled) return 0;
  const l = design.lip.length, w = design.lip.width;
  const k = { round: 0.86, square: 0.96, coffin: 0.9, bill: 0.74 }[design.lip.shape] ?? 0.88;
  return l * w * k;
}

/* ------------------------------ Hydrostatique ------------------------------ */
// Volume immergé du corps sous le plan y = h + (x − xr)·tanθ (repère leurre), par tranches.
function makeSlices(design, n = 70) {
  const P = makeProfile(design);
  const sl = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    sl.push({ x: u * P.L, dx: P.L / n, poly: sectionPoly(P, u, 40) });
  }
  return { P, sl };
}

function submerged(slices, h, tanT, xr) {
  let V = 0, mx = 0, my = 0;
  for (const s of slices.sl) {
    const hh = h + (s.x - xr) * tanT;
    const { A, cy } = clipBelow(s.poly, hh);
    const dv = A * s.dx;
    V += dv; mx += dv * s.x; my += dv * cy;
  }
  return { V, cx: V > 0 ? mx / V : 0, cy: V > 0 ? my / V : 0 };
}

// Équilibre au repos : tirant d'eau h et assiette θ tels que poussée = poids et CG/CB alignés.
export function restingAttitude(design, mp, water = 'fresh') {
  const rho = (WATER[water] || WATER.fresh) / 1000;
  const slices = makeSlices(design);
  const Vbody = submerged(slices, 1e6, 0, 0).V;
  const extraDisp = Math.max(0, mp.displacement - Vbody); // bavette + quincaillerie, supposées immergées
  const target = mp.mass / rho - extraDisp;
  const xg = mp.cg[0], yg = mp.cg[1];
  if (target >= Vbody) return { floating: false, submergedPct: 100, freeboard: 0, trimDeg: 0 };
  if (target <= 0) return { floating: true, submergedPct: 0, freeboard: mp.dims.height, trimDeg: 0, h: mp.dims.yBot, tanT: 0, xr: xg };
  const dims = mp.dims;
  const solveH = (tanT) => {
    let lo = dims.yBot - 60, hi = dims.yTop + 60;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (submerged(slices, mid, tanT, xg).V < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const f = (th) => {
    const t = Math.tan(th);
    const h = solveH(t);
    const s = submerged(slices, h, t, xg);
    // composante de (CB − CG) le long de la surface : nulle à l'équilibre
    const dx = s.cx - xg, dy = s.cy - yg;
    return { val: (dx + dy * t) / Math.sqrt(1 + t * t), h, t, s };
  };
  let a = -1.2, b = 1.2;
  let fa = f(a).val, fb = f(b).val;
  let best = f(0);
  if (fa * fb < 0) {
    for (let k = 0; k < 30; k++) {
      const m = (a + b) / 2;
      const fm = f(m);
      if (fa * fm.val <= 0) { b = m; fb = fm.val; } else { a = m; fa = fm.val; }
      best = fm;
    }
  }
  const th = Math.atan(best.t);
  // franc-bord : hauteur émergée max au-dessus de la surface (perpendiculaire)
  const P = slices.P;
  let free = 0;
  for (const s of slices.sl) {
    const hh = best.h + (s.x - xg) * best.t;
    free = Math.max(free, (P.top(s.x / P.L) - hh) * Math.cos(th));
  }
  return {
    floating: true,
    submergedPct: (best.s.V / Vbody) * 100,
    freeboard: Math.max(0, free),
    trimDeg: -th * 180 / Math.PI, // > 0 = nez vers le bas
    h: best.h, tanT: best.t, xr: xg,
  };
}

// Volume du corps sous un plan horizontal y = h (pour la flottabilité de la simulation)
export function displacementTable(design, n = 40) {
  const slices = makeSlices(design, 50);
  const dims = bodyDims(design);
  const tab = [];
  for (let i = 0; i <= n; i++) {
    const h = dims.yBot + ((dims.yTop - dims.yBot) * i) / n;
    tab.push([h, submerged(slices, h, 0, 0).V]);
  }
  return tab;
}

/* ------------------------------ Masses ------------------------------ */
export function computeMassProps(design, water = 'fresh') {
  const P = makeProfile(design);
  const mat = MATERIALS[design.print.material] || MATERIALS.PLA;
  const rho = mat.density / 1000; // g/mm³
  const rhoW = (WATER[water] || WATER.fresh) / 1000;

  const solid = soupVolume(buildSolidBody(design, 100, 64));
  const Vout = solid.volume;
  const infill = Math.max(0, Math.min(100, design.print.infill || 0)) / 100;
  const cavSoup = infill < 1 ? buildCavity(design, design.print.wall, 60, 40) : null;
  const cav = cavSoup ? soupVolume(cavSoup) : { volume: 0, centroid: solid.centroid };
  const hole = leaderHoleSoup(design);
  const holeV = hole ? Math.PI * (design.features.leaderHole.dia / 2) ** 2 * P.L * 0.9 : 0;
  const Vcav = Math.max(0, cav.volume);
  const Vshell = Math.max(0, Vout - Vcav - holeV);
  const Cshell = Vshell > 1 ? [
    (Vout * solid.centroid[0] - Vcav * cav.centroid[0]) / (Vout - Vcav),
    (Vout * solid.centroid[1] - Vcav * cav.centroid[1]) / (Vout - Vcav), 0,
  ] : solid.centroid;

  const items = [];
  items.push({ key: 'shell', mass: Vshell * rho, pos: Cshell, disp: Vout - holeV, dispPos: solid.centroid });
  if (infill > 0 && Vcav > 0) items.push({ key: 'infill', mass: Vcav * infill * rho, pos: cav.centroid, disp: 0 });

  const area = soupArea(buildSolidBody(design, 70, 40));
  const coat = Math.max(0, design.print.coat ?? 0.12);
  if (coat > 0) items.push({ key: 'coat', mass: area * coat * 1.15 / 1000, pos: solid.centroid, disp: area * coat, dispPos: solid.centroid });

  if (design.lip.enabled) {
    const lv = soupVolume(buildLipSoup(design));
    const F = lipFrame(design);
    const exposed = design.lip.length / (design.lip.length + F.insert);
    const integrated = design.print.lipIntegrated !== false;
    const dens = integrated ? mat.density : (design.lip.clear ? 1.2 : mat.density);
    items.push({ key: 'lip', mass: lv.volume * exposed * dens / 1000, pos: lv.centroid, disp: lv.volume * exposed, dispPos: lv.centroid });
  }
  const pad = buildPaddleSoup(design);
  if (pad) {
    const pv = soupVolume(pad);
    items.push({ key: 'paddle', mass: pv.volume * rho, pos: pv.centroid, disp: pv.volume, dispPos: pv.centroid });
  }
  const sk = design.features?.skirt;
  if (sk?.enabled) {
    const vol = sk.strands * sk.length * 5 * 0.35; // lanières de vinyle ~5 × 0,35 mm
    const pos = [P.L + sk.length * 0.45, 0, 0];
    items.push({ key: 'skirt', mass: vol * 1.25 / 1000, pos, disp: vol, dispPos: pos });
  }

  const tie = lineTiePoint(design);
  items.push({ key: 'tie', mass: 0.22, pos: tie.point.toArray(), disp: 0.22 / STEEL * 1000, dispPos: tie.point.toArray() });

  const ring = ringSpec(design);
  for (const h of hangerPoints(design)) {
    const hs = h.spec;
    const p = h.point;
    const r = ring.dia;
    const hookPos = h.kind === 'tail'
      ? [p.x + r + (h.trail || 0) + hs.len * 0.35, p.y - hs.len * 0.35, 0]
      : [p.x, p.y - r - hs.len * 0.5, 0];
    const m = hs.mass + ring.mass + 0.08;
    items.push({ key: 'hook', mass: m, pos: hookPos, disp: m / STEEL * 1000, dispPos: hookPos });
  }

  const bm = BALLAST_MATERIALS[design.ballast.material] || BALLAST_MATERIALS.tungsten;
  const bg = Math.max(0, design.ballast.grams || 0);
  let ballastFits = true;
  if (bg > 0) {
    const u = Math.max(0.05, Math.min(0.92, design.ballast.u));
    const vol = bg / bm.density * 1000;
    const r = Math.cbrt(vol * 3 / (4 * Math.PI));
    const wall = design.print.wall;
    const y = -P.bot(u) + wall + Math.min(r, P.bot(u) * 0.6);
    if (Vcav > 0 && vol > Vcav * 0.6) ballastFits = false;
    items.push({ key: 'ballast', mass: bg, pos: [u * P.L, y, 0], disp: infill >= 1 ? 0 : 0 });
  }

  let mass = 0, disp = 0;
  const cg = [0, 0, 0], cb = [0, 0, 0];
  for (const it of items) {
    mass += it.mass;
    for (let k = 0; k < 3; k++) cg[k] += it.mass * it.pos[k];
    if (it.disp) {
      disp += it.disp;
      for (let k = 0; k < 3; k++) cb[k] += it.disp * it.dispPos[k];
    }
  }
  for (let k = 0; k < 3; k++) { cg[k] /= mass || 1; cb[k] /= disp || 1; }
  const buoyancy = disp * rhoW;
  const net = buoyancy - mass;
  const tol = Math.max(0.06, mass * 0.012);
  const buoyancyClass = net > tol ? 'floating' : net < -tol ? 'sinking' : 'suspending';
  const dims = bodyDims(design);
  const warnings = [];
  if (design.print.wall < 0.8) warnings.push('wallThin');
  if (design.lip.enabled && design.lip.thickness < 0.9) warnings.push('lipThin');
  if (cb[1] - cg[1] < 0.3) warnings.push('unstable');
  if (!ballastFits) warnings.push('ballastFit');
  if (Vcav < 50 && infill === 0) warnings.push('noCavity');

  const mp = {
    mass, buoyancy, netBuoyancy: net, buoyancyClass, displacement: disp, items, cg, cb,
    righting: cb[1] - cg[1], ballastToSuspend: net, dims, lipArea: lipArea(design), area,
    volumes: { outer: Vout, shell: Vshell, cavity: Vcav }, warnings, water,
    hardware: hardwareFor(mass),
  };
  return mp;
}

/* ------------------------------ Objectifs de lestage ------------------------------ */
export const BALLAST_TARGETS = [
  { id: 'float_high', fr: 'Flottant haut', en: 'High floater', descFr: '≈ 1/3 immergé', descEn: '≈ 1/3 submerged', submerged: 0.35 },
  { id: 'float_mid', fr: 'Flottant mi-hauteur', en: 'Mid-height floater', descFr: 'ligne d’eau à mi-corps', descEn: 'waterline at mid-body', submerged: 0.5 },
  { id: 'float_low', fr: 'Flottant affleurant', en: 'Low floater', descFr: '≈ 85 % immergé', descEn: '≈ 85% submerged', submerged: 0.85 },
  { id: 'suspend', fr: 'Suspending', en: 'Suspending', descFr: 'reste à la profondeur', descEn: 'holds depth', sink: 0 },
  { id: 'sink_slow', fr: 'Coulant lent', en: 'Slow sinking', descFr: '≈ 0,3 m/s', descEn: '≈ 1 ft/s', sink: 0.3 },
  { id: 'sink_fast', fr: 'Coulant rapide', en: 'Fast sinking', descFr: '≈ 1 m/s', descEn: '≈ 3 ft/s', sink: 1.0 },
];

// Lest (g) à ajouter (+) ou retirer (−) pour atteindre l'objectif. Le lest est interne (ne déplace pas d'eau).
export function ballastForTarget(design, mp, targetId, water = 'fresh') {
  const t = BALLAST_TARGETS.find((x) => x.id === targetId);
  if (!t) return 0;
  const rhoW = WATER[water] || WATER.fresh; // g/cm³
  let massTarget;
  if (t.submerged !== undefined) {
    const slices = makeSlices(design);
    const Vbody = submerged(slices, 1e6, 0, 0).V;
    const extra = Math.max(0, mp.displacement - Vbody);
    massTarget = (Vbody * t.submerged + extra) * rhoW / 1000;
  } else {
    const L = mp.dims.length / 1000, W = mp.dims.width / 1000;
    const Cy = 1.0 * L * W * 0.75 * 0.4; // chute inclinée, pas à plat
    const netN = 0.5 * rhoW * 1000 * Cy * t.sink * t.sink;
    massTarget = mp.displacement * rhoW / 1000 + (netN / G) * 1000;
  }
  return massTarget - mp.mass;
}

// Ajuste automatiquement hameçons et anneaux brisés au poids du leurre (tableaux fournis).
export function autoHardware(design, water = 'fresh') {
  const hk = design.hooks;
  if (!hk.auto) return false;
  let changed = false;
  for (let it = 0; it < 3; it++) {
    const mp = computeMassProps(design, water);
    const row = hardwareFor(mp.mass);
    const size = hk.type === 'single' ? row.single : row.treble;
    const ring = mp.mass > 110 ? row.ringAlt || row.ring : row.ring;
    let c = false;
    for (const b of hk.belly) if (b.size !== size) { b.size = size; c = true; }
    if (hk.tail.size !== size) { hk.tail.size = size; c = true; }
    if (hk.ring !== ring) { hk.ring = ring; c = true; }
    if (!c) break;
    changed = true;
  }
  void hookSpec;
  return changed;
}
