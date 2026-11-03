// Propriétés massiques et hydrostatiques du leurre fini (corrigées pour l'impression).
import * as THREE from 'three';
import {
  makeProfile, buildSolidBody, buildHalfShell, buildLipSoup, soupVolume, soupArea, lipMatrix, lineTiePoint,
  hangerPoints, sectionXYZ, lipFrame,
} from './geometry.js';
import { HOOK_SIZES, MATERIALS, BALLAST_MATERIALS } from './design.js';

export const WATER = { fresh: 0.998, salt: 1.025 };
const STEEL = 7.85;
const LIP_CLEAR_DENSITY = 1.2; // polycarbonate

function sectionArea(P, u) {
  const top = P.top(u), bot = P.bot(u), hw = P.hw(u);
  let A = 0, prev = sectionXYZ(P, u, 0, top, bot, hw);
  for (let j = 1; j <= 64; j++) {
    const p = sectionXYZ(P, u, (j / 64) * Math.PI * 2, top, bot, hw);
    A += prev[1] * p[2] - p[1] * prev[2];
    prev = p;
  }
  return Math.abs(A) / 2;
}

export function bodyDims(design) {
  const P = makeProfile(design);
  let maxH = 0, maxW = 0, maxA = 0, yTop = -1e9, yBot = 1e9;
  for (let i = 0; i <= 100; i++) {
    const u = i / 100;
    maxH = Math.max(maxH, P.top(u) + P.bot(u));
    maxW = Math.max(maxW, 2 * P.hw(u));
    yTop = Math.max(yTop, P.top(u));
    yBot = Math.min(yBot, -P.bot(u));
    if (i % 4 === 0) maxA = Math.max(maxA, sectionArea(P, u));
  }
  return { length: P.L, height: maxH, width: maxW, frontalArea: maxA, yTop, yBot };
}

export function lipArea(design) {
  if (!design.lip.enabled) return 0;
  const l = design.lip.length, w = design.lip.width;
  const k = { round: 0.86, square: 0.96, coffin: 0.9, bill: 0.78 }[design.lip.shape] ?? 0.88;
  return l * w * k;
}

export function computeMassProps(design, water = 'fresh') {
  const P = makeProfile(design);
  const mat = MATERIALS[design.print.material] || MATERIALS.PLA;
  const rho = mat.density / 1000; // g/mm³
  const rhoW = (WATER[water] || WATER.fresh) / 1000;

  const solid = soupVolume(buildSolidBody(design, 100, 64));
  const half = soupVolume(buildHalfShell(design, 1, { nu: 100, nt: 40 }));
  const Vout = solid.volume;
  const Vshell = Math.min(Vout, half.volume * 2);
  const Cshell = [half.centroid[0], half.centroid[1], 0];
  const Vcav = Math.max(0, Vout - Vshell);
  const Ccav = Vcav > 1 ? [
    (Vout * solid.centroid[0] - Vshell * Cshell[0]) / Vcav,
    (Vout * solid.centroid[1] - Vshell * Cshell[1]) / Vcav, 0,
  ] : solid.centroid;

  const items = []; // { label, mass, pos:[x,y,z], disp (mm³), dispPos }
  items.push({ key: 'shell', mass: Vshell * rho, pos: Cshell, disp: Vout, dispPos: solid.centroid });
  const infill = Math.max(0, Math.min(100, design.print.infill || 0)) / 100;
  if (infill > 0) items.push({ key: 'infill', mass: Vcav * infill * rho, pos: Ccav, disp: 0 });

  const area = soupArea(buildSolidBody(design, 80, 48));
  const coat = Math.max(0, design.print.coat ?? 0.12);
  if (coat > 0) items.push({ key: 'coat', mass: area * coat * 1.15 / 1000, pos: solid.centroid, disp: area * coat, dispPos: solid.centroid });

  if (design.lip.enabled) {
    const lipSoup = buildLipSoup(design, true);
    const lv = soupVolume(lipSoup);
    const c = new THREE.Vector3(...lv.centroid).applyMatrix4(lipMatrix(design));
    const dens = design.lip.clear ? LIP_CLEAR_DENSITY : mat.density;
    const F = lipFrame(design);
    const exposed = design.lip.length / (design.lip.length + F.insert);
    items.push({ key: 'lip', mass: lv.volume * dens / 1000, pos: c.toArray(), disp: lv.volume * exposed, dispPos: c.toArray() });
  }

  const tie = lineTiePoint(design);
  items.push({ key: 'tie', mass: 0.22, pos: tie.point.toArray(), disp: 0.22 / STEEL * 1000, dispPos: tie.point.toArray() });

  for (const h of hangerPoints(design)) {
    const hs = HOOK_SIZES[h.size] || HOOK_SIZES[4];
    const p = h.point;
    const hookPos = h.kind === 'tail'
      ? [p.x + hs.ring + hs.len * 0.35, p.y - hs.len * 0.35, 0]
      : [p.x, p.y - hs.ring - hs.len * 0.5, 0];
    const m = hs.mass + hs.ringMass + 0.08; // + piton
    items.push({ key: 'hook', mass: m, pos: hookPos, disp: m / STEEL * 1000, dispPos: hookPos });
  }

  const bm = BALLAST_MATERIALS[design.ballast.material] || BALLAST_MATERIALS.tungsten;
  const bg = Math.max(0, design.ballast.grams || 0);
  let ballastFits = true;
  if (bg > 0) {
    const u = Math.max(0.1, Math.min(0.9, design.ballast.u));
    const vol = bg / bm.density * 1000;
    const r = Math.cbrt(vol * 3 / (4 * Math.PI));
    const wall = design.print.wall;
    const y = -P.bot(u) + wall + r;
    if (2 * r > P.bot(u) + P.top(u) - 2 * wall || 2 * r > 2 * P.hw(u) - 2 * wall) ballastFits = false;
    items.push({ key: 'ballast', mass: bg, pos: [u * P.L, y, 0], disp: 0 });
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
  const ballastToSuspend = net / (1 - (WATER[water] || 1) / bm.density);
  const dims = bodyDims(design);
  const warnings = [];
  if (design.print.wall < 0.8) warnings.push('wallThin');
  if (design.lip.enabled && design.lip.thickness < 0.9) warnings.push('lipThin');
  if (cb[1] - cg[1] < 0.3) warnings.push('unstable');
  if (!ballastFits) warnings.push('ballastFit');
  if (Vcav < 50 && infill === 0) warnings.push('noCavity');

  return {
    mass, buoyancy, netBuoyancy: net, buoyancyClass, displacement: disp, items, cg, cb,
    righting: cb[1] - cg[1], ballastToSuspend, dims, lipArea: lipArea(design), area,
    volumes: { outer: Vout, shell: Vshell, cavity: Vcav }, warnings, water,
  };
}
