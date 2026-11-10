// Propriétés massiques et hydrostatiques du leurre fini (corrigées pour l'impression).
import {
  makeProfile, buildSolidBody, buildCavity, buildLipSoup, buildPaddleSoup, leaderHoleSoup, soupVolume, soupArea,
  lineTiePoint, hangerPoints, sectionXYZ, lipFrame, ringSpec,
  importMassMode,
} from './geometry.js';
import { importedFor } from './importedStore.js';
import { columnsSubmerged } from './importer.js';
import { MATERIALS, BALLAST_MATERIALS, hardwareFor, hookSpec, HARDWARE_TABLE } from './design.js';

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
  const imp = importedFor(design);
  if (imp) return { P, imported: imp.rcOuter, sl: [] };
  const sl = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    sl.push({ x: u * P.L, dx: P.L / n, poly: sectionPoly(P, u, 40) });
  }
  return { P, sl };
}

function submerged(slices, h, tanT, xr) {
  if (slices.imported) return columnsSubmerged(slices.imported, h, tanT, xr);
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
  if (slices.imported) {
    for (const col of slices.imported.cols) for (const [a, b2] of col.inner) {
      const xm = best.t >= 0 ? a : b2; // extrémité la plus haute par rapport au plan incliné
      free = Math.max(free, (col.y + slices.imported.c / 2 - (best.h + (xm - xg) * best.t)) * Math.cos(th));
    }
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

  const imp = importedFor(design);
  const solid = imp ? { volume: imp.rcOuter.Vmat, centroid: imp.rcOuter.Cmat } : soupVolume(buildSolidBody(design, 100, 64));
  const Vout = solid.volume;
  const infill = Math.max(0, Math.min(100, design.print.infill || 0)) / 100;
  let cav;
  if (imp && importMassMode(design) === 'mesh') {
    // masse « telle que modélisée » : matière réelle du maillage (coque si creux)
    const Vm = Math.min(Vout, imp.rc.Vmat), Vc = Math.max(0, Vout - Vm);
    cav = { volume: Vc, centroid: Vc > 1 ? [0, 1, 2].map((k) => (Vout * solid.centroid[k] - Vm * imp.rc.Cmat[k]) / Vc) : solid.centroid };
  } else {
    const cavSoup = infill < 1 ? buildCavity(design, design.print.wall, 60, 40) : null;
    cav = cavSoup ? soupVolume(cavSoup) : { volume: 0, centroid: solid.centroid };
  }
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
  if (infill > 0 && Vcav > 0 && !(imp && importMassMode(design) === 'mesh')) items.push({ key: 'infill', mass: Vcav * infill * rho, pos: cav.centroid, disp: 0 });

  const area = imp ? imp.area : soupArea(buildSolidBody(design, 70, 40));
  const coat = Math.max(0, design.print.coat ?? 0.12);
  if (coat > 0) items.push({ key: 'coat', mass: area * coat * 1.15 / 1000, pos: solid.centroid, disp: area * coat, dispPos: solid.centroid });

  if (design.lip.enabled && !imp) {
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
    // hystérésis de ±5 % autour des seuils : évite les changements de taille en boucle
    const pick = (m) => { const r = hardwareFor(m); return { size: hk.type === 'single' ? r.single : r.treble, ring: m > 110 ? r.ringAlt || r.ring : r.ring }; };
    const mid = pick(mp.mass), lo = pick(mp.mass * 0.95), hi = pick(mp.mass * 1.05);
    const cur = hk.tail.enabled ? hk.tail.size : hk.belly[0]?.size;
    const keep = cur === lo.size || cur === hi.size;
    const size = keep ? cur : mid.size;
    const ring = keep && (hk.ring === lo.ring || hk.ring === hi.ring) ? hk.ring : mid.ring;
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

// Lest (g) + quincaillerie cohérents pour atteindre l'objectif. Pour chaque taille d'hameçon possible,
// on calcule le lest ; on garde la première combinaison que la règle de taille automatique conserve.
export function solveBallast(design, targetId, water = 'fresh') {
  const solveFrozen = (d) => {
    for (let it = 0; it < 6; it++) {
      const mp = computeMassProps(d, water);
      const delta = ballastForTarget(d, mp, targetId, water);
      if (Math.abs(delta) < 0.03) break;
      d.ballast.grams = Math.max(0, d.ballast.grams + delta);
    }
    return d;
  };
  if (!design.hooks.auto) return { grams: Math.round(solveFrozen(structuredClone(design)).ballast.grams * 10) / 10, hooks: null };
  const single = design.hooks.type === 'single';
  const rows = HARDWARE_TABLE.filter((r, i, a) => a.findIndex((q) => (single ? q.single : q.treble) === (single ? r.single : r.treble)) === i);
  let fallback = null;
  for (const r of rows) {
    const d = structuredClone(design);
    const size = single ? r.single : r.treble;
    d.hooks.belly.forEach((b) => { b.size = size; });
    d.hooks.tail.size = size;
    d.hooks.ring = r.ring;
    solveFrozen(d);
    const probe = structuredClone(d);
    autoHardware(probe, water);
    const kept = probe.hooks.tail.size === size && (probe.hooks.belly[0]?.size ?? size) === size;
    if (!fallback) fallback = d;
    if (kept) return { grams: Math.round(d.ballast.grams * 10) / 10, hooks: d.hooks };
  }
  return { grams: Math.round(fallback.ballast.grams * 10) / 10, hooks: fallback.hooks };
}
