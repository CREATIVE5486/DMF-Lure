// Opérations booléennes (CSG) : pièces imprimables avec bavette intégrée, moules et contre-moules.
// Les petits volumes disjoints (évents, logements…) sont regroupés dans une seule brosse pour limiter le nombre d'opérations.
import * as THREE from 'three';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import {
  buildSolidBody, buildCavity, buildLipSoup, buildPaddleSoup, leaderHoleSoup, cylinderSoup, loftRings,
  armaturePath, weld, soupBounds, makeProfile, lineTiePoint, hangerPoints, repairTJunctions,
} from './geometry.js';
import { BALLAST_MATERIALS } from './design.js';

const evaluator = new Evaluator();
evaluator.attributes = ['position', 'normal'];
evaluator.useGroups = false;

export function brushFromSoup(soup) {
  const { vertices, triangles } = weld(soup, 1e-5);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  g.setIndex(new THREE.BufferAttribute(triangles, 1));
  g.computeVertexNormals();
  const b = new Brush(g);
  b.updateMatrixWorld();
  return b;
}

export function mergeSoups(list) {
  const parts = list.filter(Boolean);
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function boxSoup(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return new Float32Array(g.toNonIndexed().attributes.position.array);
}

function op(a, b, kind) {
  const r = evaluator.evaluate(a, b, kind);
  r.updateMatrixWorld();
  return r;
}
const add = (a, b) => (b ? op(a, b, ADDITION) : a);
const sub = (a, b) => (b ? op(a, b, SUBTRACTION) : a);
const inter = (a, b) => op(a, b, INTERSECTION);
const brushOf = (soups) => { const s = mergeSoups(soups); return s.length ? brushFromSoup(s) : null; };

export function brushToSoup(b) {
  const g = b.geometry.index ? b.geometry.toNonIndexed() : b.geometry;
  return new Float32Array(g.attributes.position.array);
}

// Soupe finale réparée (étanche) pour l'export
export function finalSoup(b) {
  return repairTJunctions(brushToSoup(b));
}

// Tube balayé le long d'une polyligne (une seule surface fermée)
export function tubeSoup(points, r, m = 12) {
  const P = points.map((p) => new THREE.Vector3(...p));
  const rings = [];
  const frames = [];
  let prevN = null;
  for (let i = 0; i < P.length; i++) {
    const tIn = i > 0 ? P[i].clone().sub(P[i - 1]).normalize() : null;
    const tOut = i < P.length - 1 ? P[i + 1].clone().sub(P[i]).normalize() : null;
    const t = (tIn && tOut ? tIn.clone().add(tOut) : (tIn || tOut)).normalize();
    let n = prevN ? prevN.clone().sub(t.clone().multiplyScalar(prevN.dot(t))) : new THREE.Vector3(0, 0, 1).sub(t.clone().multiplyScalar(t.z));
    if (n.lengthSq() < 1e-6) n = new THREE.Vector3(0, 1, 0).sub(t.clone().multiplyScalar(t.y));
    n.normalize();
    prevN = n;
    const bnm = new THREE.Vector3().crossVectors(t, n);
    frames.push([P[i], n, bnm]);
  }
  const ringAt = (c, n, b, rr) => {
    const pts = [];
    for (let j = 0; j < m; j++) {
      const ph = (j / m) * Math.PI * 2;
      const p = c.clone().addScaledVector(n, Math.cos(ph) * rr).addScaledVector(b, Math.sin(ph) * rr);
      pts.push([p.x, p.y, p.z]);
    }
    return pts;
  };
  rings.push(ringAt(...frames[0], 0));
  for (const f of frames) rings.push(ringAt(...f, r));
  rings.push(ringAt(...frames.at(-1), 0));
  return loftRings(rings);
}

function hemisphereSoup(c, r, dir = 1, n = 10, m = 24) {
  const rings = [];
  rings.push(Array.from({ length: m }, () => [c[0], c[1], c[2]]));
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    const rr = r * Math.cos(a), z = c[2] + dir * r * Math.sin(a);
    const pts = [];
    for (let j = 0; j < m; j++) {
      const ph = (j / m) * Math.PI * 2;
      pts.push(i === n ? [c[0], c[1], z] : [c[0] + Math.cos(ph) * rr, c[1] + Math.sin(ph) * rr, z]);
    }
    rings.push(pts);
  }
  return loftRings(rings);
}

function funnelSoup(a, b, r0, r1, m = 20) {
  const rings = [];
  for (const [s, r] of [[0, 0], [0, r0], [1, r1], [1, 0]]) {
    const c = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2]];
    const pts = [];
    for (let j = 0; j < m; j++) { const ph = (j / m) * Math.PI * 2; pts.push([c[0] + Math.cos(ph) * r, c[1], c[2] + Math.sin(ph) * r]); }
    rings.push(pts);
  }
  return loftRings(rings);
}

// Solide extérieur complet : corps ∪ bavette ∪ palette
export function outerBrush(design, { withLip = true } = {}) {
  let b = brushFromSoup(buildSolidBody(design, 130, 88));
  if (withLip && design.lip.enabled) b = add(b, brushFromSoup(buildLipSoup(design)));
  const pad = buildPaddleSoup(design);
  if (pad) b = add(b, brushFromSoup(pad));
  return b;
}

// Chemin principal de l'armature (sans les boucles) + tiges verticales des pitons
function armatureParts(design, r, extend = null) {
  const P = makeProfile(design);
  const yc = (u) => (P.top(u) - P.bot(u)) / 2;
  const tie = lineTiePoint(design).point;
  const main = [[tie.x, tie.y, 0]];
  if (tie.x < P.L * 0.06) main.push([P.L * 0.06, yc(0.06), 0]);
  for (const h of design.hooks.belly.slice().sort((a, b) => a.u - b.u)) {
    const u = Math.max(0.06, Math.min(0.94, h.u));
    main.push([u * P.L, yc(u) - P.bot(u) * 0.35, 0]);
  }
  main.push([P.L * 0.95, yc(0.95), 0]);
  main.push([P.L + 2, yc(0.97) * 0.6, 0]);
  if (extend) { main.unshift([extend[0], main[0][1], 0]); main.push([extend[1], main.at(-1)[1], 0]); }
  const stubs = hangerPoints(design).filter((h) => h.kind === 'belly').map((h) => {
    const u = h.point.x / P.L;
    return cylinderSoup([h.point.x, yc(u) - P.bot(u) * 0.35, 0], [h.point.x, h.point.y - (extend ? 6 : 0), 0], r * (extend ? 1.15 : 1), 12);
  });
  return { main: tubeSoup(main, r), stubs };
}

/* ------------------------------ Pièces imprimées ------------------------------ */
export function printSolids(design, { mode = 'halves', hollow = true, wireGroove = true } = {}) {
  const integrated = design.print.lipIntegrated !== false;
  let body = outerBrush(design, { withLip: integrated });
  const cav = hollow && (design.print.infill || 0) < 100 ? buildCavity(design, design.print.wall) : null;
  const hole = leaderHoleSoup(design);
  body = sub(body, brushOf([cav, hole]));
  const out = [];
  if (mode === 'solid') {
    out.push({ key: 'solid', soup: finalSoup(body) });
  } else {
    if (wireGroove && !hole) {
      const a = armatureParts(design, 0.7);
      body = sub(body, brushFromSoup(a.main));
      body = sub(body, brushOf(a.stubs));
    }
    const bb = soupBounds(brushToSoup(body));
    const left = inter(body, brushFromSoup(boxSoup([bb.min[0] - 5, bb.min[1] - 5, 0], [bb.max[0] + 5, bb.max[1] + 5, 999])));
    const right = inter(body, brushFromSoup(boxSoup([bb.min[0] - 5, bb.min[1] - 5, -999], [bb.max[0] + 5, bb.max[1] + 5, 0])));
    out.push({ key: 'left', soup: finalSoup(left) }, { key: 'right', soup: finalSoup(right) });
  }
  if (design.lip.enabled && !integrated) out.push({ key: 'lip', soup: buildLipSoup(design) });
  return out;
}

/* ------------------------------ Moule de coulée ------------------------------ */
function moldLayout(design, lb, m) {
  const P = makeProfile(design);
  const min = [lb.min[0] - m, lb.min[1] - m, -(lb.max[2] + m)];
  const max = [lb.max[0] + m, lb.max[1] + m + 4, lb.max[2] + m];
  const sx = 0.55 * P.L;
  const ventPts = [[P.L * 0.03, P.top(0.03) * 0.5], [P.L * 0.97, P.top(0.97) * 0.5], [P.L * 0.25, P.top(0.25)], [P.L * 0.82, P.top(0.82)]];
  const keyPts = [[min[0] + m * 0.5, min[1] + m * 0.5], [max[0] - m * 0.5, min[1] + m * 0.5], [min[0] + m * 0.5, max[1] - m * 0.5], [max[0] - m * 0.5, max[1] - m * 0.5]];
  return { P, min, max, sx, sy: P.top(0.55), ventPts, keyPts };
}

export function moldGeometry(design, o = {}) {
  const opt = { margin: 10, keyR: 4, sprueR: 3.5, ventR: 0.9, wireDia: 1.2, ballDia: 0, clearance: 0.25, ...o };
  const lure = outerBrush(design, { withLip: true });
  const lb = soupBounds(brushToSoup(lure));
  const m = opt.margin;
  const Lo = moldLayout(design, lb, m);
  const { P, min, max } = Lo;
  const features = { keys: [], sprue: [Lo.sx, max[1]], vents: [], pins: [], balls: [], wireDia: opt.wireDia };

  // canaux (disjoints entre eux) : entonnoir + évents
  const channels = [funnelSoup([Lo.sx, Lo.sy - 1, 0], [Lo.sx, max[1] + 1, 0], opt.sprueR * 0.6, opt.sprueR * 1.6)];
  const vents = [...Lo.ventPts];
  if (design.lip.enabled) { const tie = lineTiePoint(design).point; vents.push([tie.x, tie.y]); }
  for (const [vx, vy] of vents) {
    if (Math.abs(vx - Lo.sx) < opt.sprueR * 2) continue;
    channels.push(cylinderSoup([vx, vy - 0.5, 0], [vx, max[1] + 1, 0], opt.ventR, 12));
    features.vents.push([vx, vy]);
  }
  let cavity = add(lure, brushOf(channels));
  // armature : traverse le moule à l'avant et à l'arrière, + logements des boucles de pitons
  const arm = armatureParts(design, opt.wireDia / 2 + 0.1, [min[0] - 1, max[0] + 1]);
  cavity = add(cavity, brushFromSoup(arm.main));
  cavity = add(cavity, brushOf(arm.stubs));
  cavity = add(cavity, brushOf([leaderHoleSoup(design)]));

  // billes de lest : tétons de calage (Ø 1,2 mm) depuis chaque coquille
  const bm = BALLAST_MATERIALS[design.ballast.material] || BALLAST_MATERIALS.lead;
  const grams = Math.max(0, design.ballast.grams || 0);
  if (grams > 0) {
    const bd = opt.ballDia || ballDiameterFor(design);
    const per = (Math.PI / 6) * bd ** 3 * bm.density / 1000;
    const count = Math.max(1, Math.min(14, Math.round(grams / per)));
    const u0 = Math.max(0.12, Math.min(0.88, design.ballast.u));
    const pins = [];
    for (let i = 0; i < count; i++) {
      const x = u0 * P.L + (i - (count - 1) / 2) * bd * 1.15;
      const u = Math.max(0.05, Math.min(0.95, x / P.L));
      const y = -P.bot(u) * 0.35;
      features.balls.push([x, y, bd]);
      for (const sgn of [1, -1]) {
        pins.push(cylinderSoup([x, y, sgn * (bd / 2 - 0.15)], [x, y, sgn * (P.hw(u) * 1.6 + 2)], 0.6, 10));
        features.pins.push([x, y, sgn]);
      }
    }
    cavity = sub(cavity, brushOf(pins));
    features.ballCount = count;
    features.ballDia = bd;
    features.ballGrams = count * per;
  }

  const moldAll = sub(brushFromSoup(boxSoup(min, max)), cavity);
  let A = inter(moldAll, brushFromSoup(boxSoup([min[0] - 1, min[1] - 1, 0], [max[0] + 1, max[1] + 1, max[2] + 1])));
  let B = inter(moldAll, brushFromSoup(boxSoup([min[0] - 1, min[1] - 1, min[2] - 1], [max[0] + 1, max[1] + 1, 0])));
  const kr = Math.min(opt.keyR, m * 0.4);
  const malesOnA = Lo.keyPts.map(([kx, ky]) => hemisphereSoup([kx, ky, 0], kr, -1));
  const holesOnB = Lo.keyPts.map(([kx, ky]) => hemisphereSoup([kx, ky, 0], kr + opt.clearance, -1));
  A = add(A, brushOf(malesOnA));
  B = sub(B, brushOf(holesOnB));
  features.keys = Lo.keyPts.map(([kx, ky]) => [kx, ky, kr]);
  return { A, B, min, max, features, cavityBounds: lb };
}

/* ------------------------------ Contre-moule (maître silicone) ------------------------------ */
// Boîte de coffrage + demi-leurre en positif sur la plaque de joint.
export function masterGeometry(design, o = {}) {
  const opt = { margin: 12, wall: 2.4, base: 3, keyR: 4, sprueR: 3.5, ventR: 0.9, ...o };
  const lure = outerBrush(design, { withLip: true });
  const lb = soupBounds(brushToSoup(lure));
  const m = opt.margin;
  const Lo = moldLayout(design, lb, m);
  const { min, max } = Lo;
  const depth = lb.max[2] + m;
  const out = [];
  for (const side of [1, -1]) {
    const halfBox = brushFromSoup(side > 0 ? boxSoup([min[0], min[1], 0], [max[0], max[1], 999]) : boxSoup([min[0], min[1], -999], [max[0], max[1], 0]));
    const posParts = [funnelSoup([Lo.sx, Lo.sy - 1, 0], [Lo.sx, max[1], 0], opt.sprueR * 0.6, opt.sprueR * 1.6)];
    for (const [vx, vy] of Lo.ventPts) {
      if (Math.abs(vx - Lo.sx) < opt.sprueR * 2) continue;
      posParts.push(cylinderSoup([vx, vy - 0.5, 0], [vx, max[1], 0], opt.ventR, 12));
    }
    let pos = add(lure, brushOf(posParts));
    pos = inter(pos, halfBox);
    const zb0 = side > 0 ? -opt.base : 0, zb1 = side > 0 ? 0 : opt.base;
    const z0 = side > 0 ? 0 : -depth, z1 = side > 0 ? depth : 0;
    const frame = sub(
      brushFromSoup(boxSoup([min[0] - opt.wall, min[1] - opt.wall, Math.min(z0, zb0)], [max[0] + opt.wall, max[1] + opt.wall, Math.max(z1, zb1)])),
      brushFromSoup(boxSoup([min[0], min[1], side > 0 ? 0 : -depth - 1], [max[0], max[1], side > 0 ? depth + 1 : 0])),
    );
    let master = add(frame, pos);
    const kr = Math.min(opt.keyR, m * 0.4);
    if (side > 0) master = sub(master, brushOf(Lo.keyPts.map(([kx, ky]) => hemisphereSoup([kx, ky, 0], kr, -1))));
    else master = add(master, brushOf(Lo.keyPts.map(([kx, ky]) => hemisphereSoup([kx, ky, 0], kr, -1))));
    out.push({ side, brush: master, siliconeVolume: (max[0] - min[0]) * (max[1] - min[1]) * depth });
  }
  return { masters: out, min, max, depth };
}

export function ballDiameterFor(design) {
  const P = makeProfile(design);
  const u = Math.max(0.12, Math.min(0.88, design.ballast.u));
  const room = Math.min(P.bot(u) * 0.9, P.hw(u) * 1.4);
  const stdSizes = [3, 4, 4.5, 5, 6, 7, 8, 10, 12];
  return stdSizes.filter((d) => d <= room).at(-1) || 3;
}
