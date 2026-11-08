// Génération géométrique paramétrique du leurre.
// Repère (mm) : x = axe longitudinal (nez à x=0, queue à x=L), y = haut, z = flanc.
// Le nez pointe vers -x : c'est la direction de nage.
import * as THREE from 'three';
import { makeMonotone, clamp } from './curves.js';
import { hookSpec, SPLIT_RINGS } from './design.js';

/* ============================== Profil & section ============================== */

export function makeProfile(design) {
  const b = design.body;
  const L = b.length, H = b.height, W = b.width;
  const ft = makeMonotone(b.top), fb = makeMonotone(b.bottom), fw = makeMonotone(b.plan);
  const nr = clamp(b.noseRound, 0.02, 0.45), tr = clamp(b.tailRound, 0.02, 0.45);
  const env = (u) => {
    let e = 1;
    if (u < nr) { const k = 1 - u / nr; e *= Math.sqrt(Math.max(0, 1 - k * k)); }
    if (u > 1 - tr) { const k = 1 - (1 - u) / tr; e *= Math.sqrt(Math.max(0, 1 - k * k)); }
    return e;
  };
  return {
    L, H, W, nr, tr,
    n: clamp(b.squareness, 1.6, 6),
    bw: clamp(b.backWidth ?? 1, 0.2, 1.8),
    vw: clamp(b.bellyWidth ?? 1, 0.1, 1.8),
    keel: clamp(b.keel ?? 0, 0, 1),
    cup: Math.max(0, b.cup || 0),
    top: (u) => H * Math.max(0.005, ft(u)) * env(u),
    bot: (u) => H * Math.max(0.005, fb(u)) * env(u),
    hw: (u) => W * 0.5 * Math.max(0.005, fw(u)) * env(u),
  };
}

export function ringUs(n, u0 = 0, u1 = 1) {
  const us = new Float64Array(n);
  for (let i = 0; i < n; i++) us[i] = u0 + (u1 - u0) * (1 - Math.cos(Math.PI * (i / (n - 1)))) / 2;
  return us;
}

// Point de section. θ = 0 dos, π/2 flanc +z, π ventre.
// La largeur varie avec la hauteur : backWidth (dos), bellyWidth (ventre), keel (ventre en V).
export function sectionXYZ(P, u, theta, top, bot, hw) {
  const c = Math.cos(theta), s = Math.sin(theta), e = 2 / P.n;
  const tc = c >= 0 ? Math.pow(c, e) : -Math.pow(-c, e); // hauteur normalisée −1..1
  const y = tc >= 0 ? top * tc : bot * tc;
  let zs = Math.pow(Math.abs(s), e);
  let k;
  if (tc >= 0) k = 1 + (P.bw - 1) * Math.pow(tc, 1.2);
  else {
    k = 1 + (P.vw - 1) * Math.pow(-tc, 1.2);
    if (P.keel > 0) zs = zs * (1 - P.keel) + (1 + tc) * P.keel; // V linéaire vers la quille
  }
  return [u * P.L, y, (s >= 0 ? 1 : -1) * hw * k * zs];
}

export function surfacePoint(P, u, theta) {
  return new THREE.Vector3(...sectionXYZ(P, u, theta, P.top(u), P.bot(u), P.hw(u)));
}

export function surfaceNormal(P, u, theta) {
  const d = 1e-3;
  const p0 = surfacePoint(P, u, theta);
  const pu = surfacePoint(P, Math.min(1, u + d), theta).sub(surfacePoint(P, Math.max(0, u - d), theta));
  const pt = surfacePoint(P, u, theta + d).sub(surfacePoint(P, u, theta - d));
  const n = new THREE.Vector3().crossVectors(pt, pu).normalize();
  return { p: p0, n };
}

// Anneaux du corps. Chaque anneau : { u, pts: [[x,y,z] × nt] }. Pointes = points répétés.
// Popper (cup > 0) : la pointe avant est reculée → face concave.
export function bodyRings(design, nu = 140, nt = 96) {
  const P = makeProfile(design);
  const rings = [];
  const mk = (u) => {
    const top = P.top(u), bot = P.bot(u), hw = P.hw(u);
    const pts = [];
    for (let j = 0; j < nt; j++) pts.push(sectionXYZ(P, u, (j / nt) * Math.PI * 2, top, bot, hw));
    return pts;
  };
  if (P.cup > 0) {
    const uR = Math.min(0.3, P.nr);
    const tipX = uR * P.L + Math.min(P.cup, P.L * 0.3);
    const yc = (P.top(uR) - P.bot(uR)) / 2;
    rings.push({ u: 0, pts: Array.from({ length: nt }, () => [tipX, yc, 0]), tip: true });
    const us = ringUs(nu - 1, uR, 1);
    for (let i = 0; i < us.length - 1; i++) rings.push({ u: us[i], pts: mk(us[i]) });
  } else {
    const us = ringUs(nu);
    rings.push({ u: 0, pts: Array.from({ length: nt }, () => [0, 0, 0]), tip: true });
    for (let i = 1; i < nu - 1; i++) rings.push({ u: us[i], pts: mk(us[i]) });
  }
  rings.push({ u: 1, pts: Array.from({ length: nt }, () => [P.L, 0, 0]), tip: true });
  return { rings, P };
}

// Maillage affiché : grille (u, θ) avec UV linéaires le long du corps.
export function buildBodyGeometry(design, nu = 150, nt = 112) {
  const { rings, P } = bodyRings(design, nu, nt);
  const n = rings.length, cols = nt + 1;
  const pos = new Float32Array(n * cols * 3);
  const uv = new Float32Array(n * cols * 2);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < cols; j++) {
      const p = rings[i].pts[j % nt];
      const k = i * cols + j;
      pos.set(p, k * 3);
      uv[k * 2] = Math.max(0, Math.min(1, p[0] / P.L));
      uv[k * 2 + 1] = j / nt;
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < nt; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      if (i > 0) idx.push(a, b, c);
      if (i < n - 2) idx.push(b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    if (rings[i].tip) {
      const dir = i === 0 ? (P.cup > 0 ? 1 : -1) : 1;
      for (let j = 0; j < cols; j++) nrm.setXYZ(i * cols + j, dir, 0, 0);
      continue;
    }
    const a = i * cols, b = i * cols + nt;
    const nx = nrm.getX(a) + nrm.getX(b), ny = nrm.getY(a) + nrm.getY(b), nz = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(a, nx / l, ny / l, nz / l);
    nrm.setXYZ(b, nx / l, ny / l, nz / l);
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
  g.userData.profile = P;
  return g;
}

export function circumferenceTable(design, n = 128) {
  const P = makeProfile(design);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const top = P.top(u), bot = P.bot(u), hw = P.hw(u);
    let c = 0, prev = sectionXYZ(P, u, 0, top, bot, hw);
    for (let j = 1; j <= 48; j++) {
      const p = sectionXYZ(P, u, (j / 48) * Math.PI * 2, top, bot, hw);
      c += Math.hypot(p[1] - prev[1], p[2] - prev[2]);
      prev = p;
    }
    out[i] = Math.max(c, 0.5);
  }
  return out;
}

/* ============================== Utilitaires de maillage ============================== */

function pushTri(arr, a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * cx + cy * cy + cz * cz < 1e-20) return;
  arr.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

// Surface fermée à partir d'anneaux (premier et dernier dégénérés en un point). Normales sortantes.
export function loftRings(rings) {
  const arr = [];
  const nt = rings[0].length;
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let j = 0; j < nt; j++) {
      const j1 = (j + 1) % nt;
      pushTri(arr, A[j], A[j1], B[j]);
      pushTri(arr, A[j1], B[j1], B[j]);
    }
  }
  const soup = new Float32Array(arr);
  if (soupVolume(soup).volume < 0) flipSoup(soup);
  return soup;
}

export function flipSoup(s) {
  for (let t = 0; t < s.length; t += 9) {
    for (let k = 0; k < 3; k++) { const tmp = s[t + 3 + k]; s[t + 3 + k] = s[t + 6 + k]; s[t + 6 + k] = tmp; }
  }
  return s;
}

export function buildSolidBody(design, nu = 140, nt = 96) {
  return loftRings(bodyRings(design, nu, nt).rings.map((r) => r.pts));
}

// Cavité intérieure (capsule fermée) pour un corps creux de paroi `wall`.
export function buildCavity(design, wall = design.print.wall, nu = 90, nt = 64) {
  const P = makeProfile(design);
  const minK = Math.min(1, P.bw, P.vw);
  const ok = (u) => P.top(u) - wall > 0.6 && P.bot(u) - wall > 0.6 && P.hw(u) * minK * (1 - P.keel * 0.5) - wall > 0.6;
  const cupX = P.cup > 0 ? Math.min(0.3, P.nr) * P.L + Math.min(P.cup, P.L * 0.3) : 0;
  let ua = -1, ub = -1;
  for (let i = 0; i <= 400; i++) {
    const u = i / 400;
    if (u * P.L < cupX + wall * 1.5 || u * P.L < wall * 1.5 || u * P.L > P.L - wall * 1.5) continue;
    if (ok(u)) { if (ua < 0) ua = u; ub = u; } else if (ua >= 0) break;
  }
  if (ua < 0 || (ub - ua) * P.L < 4 * wall) return null;
  const span = ub - ua;
  const rings = [];
  const Pi = { ...P };
  for (let i = 0; i < nu; i++) {
    const s = (1 - Math.cos(Math.PI * (i / (nu - 1)))) / 2;
    const u = ua + span * s;
    const ce = 0.12;
    let e = 1;
    if (s < ce) { const k = 1 - s / ce; e = Math.sqrt(Math.max(0, 1 - k * k)); }
    if (s > 1 - ce) { const k = 1 - (1 - s) / ce; e = Math.min(e, Math.sqrt(Math.max(0, 1 - k * k))); }
    const top = (P.top(u) - wall) * e, bot = (P.bot(u) - wall) * e, hw = Math.max(0, P.hw(u) - wall / Math.max(0.3, minK)) * e;
    const pts = [];
    for (let j = 0; j < nt; j++) {
      pts.push(i === 0 || i === nu - 1 ? [u * P.L, (P.top(u) - P.bot(u)) / 2 * 0, 0] : sectionXYZ(Pi, u, (j / nt) * Math.PI * 2, top, bot, hw));
    }
    rings.push(pts);
  }
  return loftRings(rings);
}

/* ============================== Bavette (en relief, racine fondue) ============================== */

export function lipFrame(design) {
  const P = makeProfile(design);
  const lip = design.lip;
  const a = THREE.MathUtils.degToRad(clamp(lip.angle, 0, 90));
  const u = clamp(lip.posU, 0, 0.3);
  const root = new THREE.Vector3(u * P.L, -P.bot(u) * clamp(lip.rootDepth, 0, 1), 0);
  const dir = new THREE.Vector3(-Math.cos(a), -Math.sin(a), 0);
  const side = new THREE.Vector3(0, 0, 1);
  const normal = new THREE.Vector3().crossVectors(dir, side);
  const insert = Math.max(5, Math.min(16, lip.length * 0.3 + 3)) + lip.thickness;
  const rootW = Math.max(3, Math.min(lip.width * 0.92, 2 * P.hw(Math.max(u, 0.02)) * 0.8));
  return { root, dir, side, normal, insert, angle: a, rootW, P };
}

function lipPlanWidth(lip, a) {
  const l = Math.max(2, lip.length), W = Math.max(3, lip.width);
  switch (lip.shape) {
    case 'square': {
      const r = Math.min(W * 0.22, l * 0.3);
      if (a > l - r) { const k = (a - (l - r)) / r; return W - 2 * r * (1 - Math.sqrt(Math.max(0, 1 - k * k))); }
      return W;
    }
    case 'coffin': {
      const c = Math.min(W * 0.4, l * 0.35);
      return a > l - c ? W - 1.6 * (a - (l - c)) : W;
    }
    case 'bill': {
      const wEnd = W * 0.58;
      const w = W - (W - wEnd) * (a / l);
      const r = wEnd / 2;
      if (a > l - r) { const k = (a - (l - r)) / r; return w * Math.sqrt(Math.max(0, 1 - k * k)); }
      return w;
    }
    default: {
      const r = Math.min(W / 2, l * 0.7);
      if (a > l - r) { const k = (a - (l - r)) / r; return W * Math.sqrt(Math.max(0, 1 - k * k)); }
      return W;
    }
  }
}

export function lipRings(design, na = 72, nphi = 40) {
  const lip = design.lip;
  const F = lipFrame(design);
  const l = Math.max(2, lip.length), W = Math.max(3, lip.width), T = Math.max(0.6, lip.thickness);
  const ins = F.insert;
  const flare = clamp(lip.rootFlare ?? 0.6, 0, 1.5);
  const scoop = clamp(lip.scoop ?? 0, 0, 1);
  const rib = clamp(lip.rib ?? 0, 0, 1);
  const ne = 3.2;
  const rings = [];
  for (let i = 0; i < na; i++) {
    const s = (1 - Math.cos(Math.PI * (i / (na - 1)))) / 2;
    const a = -ins + (l + ins) * s;
    // largeur : racine étroite enfouie → transition douce → forme en plan
    const tr = clamp(a / (0.22 * l), 0, 1);
    const sm = tr * tr * (3 - 2 * tr);
    let w = a <= 0 ? F.rootW : F.rootW + (lipPlanWidth(lip, a) - F.rootW) * sm;
    if (a > 0 && sm >= 1) w = lipPlanWidth(lip, a);
    // épaisseur : forte à la racine (congé), plus fine vers le bout
    let t = T * (1 + flare * 1.3 * Math.exp(-Math.pow(Math.max(0, a) / (0.2 * l), 2))) * (1 - 0.25 * clamp(a / l, 0, 1));
    // fermeture arrondie des deux extrémités
    const e = Math.max(t * 0.9, 1.2);
    let env = 1;
    if (a > l - e) { const k = (a - (l - e)) / e; env = Math.sqrt(Math.max(0, 1 - k * k)); }
    if (a < -ins + e) { const k = (-ins + e - a) / e; env = Math.min(env, Math.sqrt(Math.max(0, 1 - k * k))); }
    if (i === 0 || i === na - 1) env = 0;
    w *= a > l - e ? Math.max(env, 0) : 1;
    if (a < -ins + e) w *= env;
    t *= env;
    const along = clamp(a / (0.3 * l), 0, 1);
    const c = F.root.clone().addScaledVector(F.dir, a);
    const pts = [];
    for (let j = 0; j < nphi; j++) {
      const ph = (j / nphi) * Math.PI * 2;
      const cy = Math.cos(ph), sy = Math.sin(ph);
      const y = (w / 2) * Math.sign(cy) * Math.pow(Math.abs(cy), 2 / ne);
      let z = (t / 2) * Math.sign(sy) * Math.pow(Math.abs(sy), 2 / ne);
      const yn = W > 0 ? y / (W / 2) : 0;
      z += scoop * T * 1.6 * yn * yn * along;
      if (sy < 0) z -= rib * T * 0.9 * (1 - clamp(a / l, 0, 1)) * Math.max(0, 1 - Math.pow(y / Math.max(1, W * 0.14), 2)) * env;
      const p = c.clone().addScaledVector(F.side, y).addScaledVector(F.normal, z);
      pts.push([p.x, p.y, p.z]);
    }
    rings.push(pts);
  }
  return rings;
}

export function buildLipSoup(design) {
  return loftRings(lipRings(design));
}

export function buildLipGeometry(design) {
  return smoothGeometry(buildLipSoup(design));
}

/* ============================== Éléments spéciaux ============================== */

function ellipsoidRings(center, ax, ay, az, n = 28, m = 36, rotZ = 0) {
  const rings = [];
  const cr = Math.cos(rotZ), sr = Math.sin(rotZ);
  for (let i = 0; i < n; i++) {
    const v = -1 + (2 * i) / (n - 1);
    const r = Math.sqrt(Math.max(0, 1 - v * v));
    const pts = [];
    for (let j = 0; j < m; j++) {
      const ph = (j / m) * Math.PI * 2;
      const lx = v * ax, ly = Math.cos(ph) * ay * r, lz = Math.sin(ph) * az * r;
      pts.push([center[0] + lx * cr - ly * sr, center[1] + lx * sr + ly * cr, center[2] + lz]);
    }
    rings.push(pts);
  }
  return rings;
}

// Palette caudale d'un shad souple
export function buildPaddleSoup(design) {
  const f = design.features?.paddle;
  if (!f?.enabled) return null;
  const P = makeProfile(design);
  const D = Math.max(6, f.size);
  const yc = (P.top(0.97) - P.bot(0.97)) / 2;
  return loftRings(ellipsoidRings([P.L + 1.5, yc - D * 0.08, 0], 1.6 + D * 0.04, D / 2, D * 0.33, 26, 40, -0.35));
}

export function cylinderSoup(a, b, r, m = 24) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const len = d.length();
  d.normalize();
  const t1 = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(d, t1).normalize();
  const v = new THREE.Vector3().crossVectors(d, u);
  const rings = [];
  const steps = [0, 0, 1, 1];
  steps.forEach((s, i) => {
    const rr = i === 0 || i === 3 ? 0 : r;
    const c = A.clone().addScaledVector(d, s * len);
    const pts = [];
    for (let j = 0; j < m; j++) {
      const ph = (j / m) * Math.PI * 2;
      const p = c.clone().addScaledVector(u, Math.cos(ph) * rr).addScaledVector(v, Math.sin(ph) * rr);
      pts.push([p.x, p.y, p.z]);
    }
    rings.push(pts);
  });
  return loftRings(rings);
}

export function sphereSoup(c, r, n = 18, m = 24) {
  return loftRings(ellipsoidRings(c, r, r, r, n, m));
}

export function leaderHoleSoup(design) {
  const f = design.features?.leaderHole;
  if (!f?.enabled) return null;
  const P = makeProfile(design);
  const yc = (P.top(0.5) - P.bot(0.5)) / 2;
  return cylinderSoup([-20, yc, 0], [P.L + 20, yc, 0], Math.max(0.5, f.dia / 2));
}

/* ============================== Quincaillerie ============================== */

export function lineTiePoint(design) {
  const P = makeProfile(design);
  const mode = design.lip.enabled ? design.lineTie.mode : (design.lineTie.mode === 'lip' ? 'nose' : design.lineTie.mode);
  if (mode === 'lip') {
    const F = lipFrame(design);
    const along = clamp(design.lineTie.lipPos, 0.05, 0.9) * design.lip.length;
    return {
      point: F.root.clone().addScaledVector(F.dir, along).addScaledVector(F.normal, design.lip.thickness * 1.2 + 1.2),
      axis: F.normal.clone(), mode,
    };
  }
  if (mode === 'back') {
    const u = 0.22;
    return { point: new THREE.Vector3(u * P.L, P.top(u) + 1.8, 0), axis: new THREE.Vector3(0, 1, 0), mode };
  }
  if (P.cup > 0) {
    const uR = Math.min(0.3, P.nr);
    const x = uR * P.L + Math.min(P.cup, P.L * 0.3);
    return { point: new THREE.Vector3(x - 2, (P.top(uR) - P.bot(uR)) / 2 - (P.bot(uR) * 0.15), 0), axis: new THREE.Vector3(-1, 0, 0), mode };
  }
  const y = (P.top(0.05) - P.bot(0.05)) * 0.15;
  return { point: new THREE.Vector3(-2, y, 0), axis: new THREE.Vector3(-1, 0, 0), mode };
}

export function ringSpec(design) {
  return SPLIT_RINGS[design.hooks.ring] || SPLIT_RINGS.hw4;
}

export function hangerPoints(design) {
  const P = makeProfile(design);
  const type = design.hooks.type;
  const out = design.hooks.belly.map((h) => {
    const u = clamp(h.u, 0.06, 0.94);
    return { point: new THREE.Vector3(u * P.L, -P.bot(u) - 1.2, 0), size: h.size, type, kind: 'belly', spec: hookSpec(type, h.size) };
  });
  if (design.hooks.tail.enabled) {
    const trail = Math.max(0, design.hooks.tail.trail || 0);
    const paddle = design.features?.paddle?.enabled ? design.features.paddle.size * 0.3 : 0;
    out.push({
      point: new THREE.Vector3(P.L + 1.6 + paddle, (P.top(0.97) - P.bot(0.97)) * 0.3, 0),
      size: design.hooks.tail.size, type, kind: 'tail', trail, spec: hookSpec(type, design.hooks.tail.size),
    });
  }
  return out;
}

// Trajet de l'armature (attache → pitons → queue) dans le plan de joint
export function armaturePath(design) {
  const P = makeProfile(design);
  const tie = lineTiePoint(design).point;
  const yc = (u) => (P.top(u) - P.bot(u)) / 2;
  const pts = [[tie.x, tie.y, 0]];
  if (tie.x < P.L * 0.05) pts.push([P.L * 0.06, yc(0.06), 0]);
  for (const h of design.hooks.belly.slice().sort((a, b) => a.u - b.u)) {
    const u = clamp(h.u, 0.06, 0.94);
    pts.push([u * P.L, yc(u) - P.bot(u) * 0.35, 0]);
    pts.push([u * P.L, -P.bot(u) - 1.5, 0]);
    pts.push([u * P.L, yc(u) - P.bot(u) * 0.35, 0]);
  }
  pts.push([P.L * 0.95, yc(0.95), 0]);
  pts.push([P.L + 2, yc(0.97) * 0.6, 0]);
  return pts;
}

/* ============================== Mesures & conversions ============================== */

export function geometryToSoup(g) {
  const ng = g.index ? g.toNonIndexed() : g;
  return new Float32Array(ng.attributes.position.array);
}

export function soupToGeometry(soup) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(soup, 3));
  g.computeVertexNormals();
  return g;
}

// Géométrie indexée lissée (normales partagées)
export function smoothGeometry(soup) {
  const { vertices, triangles } = weld(soup, 1e-4);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  g.setIndex(new THREE.BufferAttribute(triangles, 1));
  g.computeVertexNormals();
  return g;
}

export function soupVolume(soup) {
  let V = 0, cx = 0, cy = 0, cz = 0;
  for (let t = 0; t < soup.length; t += 9) {
    const ax = soup[t], ay = soup[t + 1], az = soup[t + 2];
    const bx = soup[t + 3], by = soup[t + 4], bz = soup[t + 5];
    const qx = soup[t + 6], qy = soup[t + 7], qz = soup[t + 8];
    const v = (ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx)) / 6;
    V += v;
    cx += v * (ax + bx + qx) / 4; cy += v * (ay + by + qy) / 4; cz += v * (az + bz + qz) / 4;
  }
  return { volume: V, centroid: V !== 0 ? [cx / V, cy / V, cz / V] : [0, 0, 0] };
}

export function soupArea(soup) {
  let A = 0;
  for (let t = 0; t < soup.length; t += 9) {
    const ux = soup[t + 3] - soup[t], uy = soup[t + 4] - soup[t + 1], uz = soup[t + 5] - soup[t + 2];
    const vx = soup[t + 6] - soup[t], vy = soup[t + 7] - soup[t + 1], vz = soup[t + 8] - soup[t + 2];
    A += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return A;
}

export function soupBounds(soup) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < soup.length; i += 3) {
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], soup[i + k]); mx[k] = Math.max(mx[k], soup[i + k]); }
  }
  return { min: mn, max: mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] };
}

export function weld(soup, eps = 1e-4) {
  const map = new Map();
  const verts = [];
  const tris = new Uint32Array(soup.length / 3);
  const q = 1 / eps;
  for (let i = 0; i < soup.length; i += 3) {
    const key = `${Math.round(soup[i] * q)},${Math.round(soup[i + 1] * q)},${Math.round(soup[i + 2] * q)}`;
    let id = map.get(key);
    if (id === undefined) { id = verts.length / 3; verts.push(soup[i], soup[i + 1], soup[i + 2]); map.set(key, id); }
    tris[i / 3] = id;
  }
  return { vertices: new Float32Array(verts), triangles: tris };
}

export function checkManifold(soup, eps = 1e-3) {
  const { triangles } = weld(soup, eps);
  const edges = new Map();
  let degenerate = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const a0 = triangles[t], b0 = triangles[t + 1], c0 = triangles[t + 2];
    if (a0 === b0 || b0 === c0 || a0 === c0) { degenerate++; continue; }
    for (let k = 0; k < 3; k++) {
      const a = triangles[t + k], b = triangles[t + ((k + 1) % 3)];
      const key = a < b ? a * 4294967296 + b : b * 4294967296 + a;
      const dir = a < b ? 1 : -1;
      const e = edges.get(key) || { n: 0, s: 0 };
      e.n++; e.s += dir;
      edges.set(key, e);
    }
  }
  let open = 0, nonManifold = 0, flipped = 0;
  for (const e of edges.values()) {
    if (e.n === 1) open++;
    else if (e.n > 2) nonManifold++;
    else if (e.s !== 0) flipped++;
  }
  return { open, nonManifold, flipped, degenerate, ok: open === 0 && nonManifold === 0 && flipped === 0, triangles: triangles.length / 3 };
}

/* ============================== Réparation des jonctions en T (après CSG) ============================== */
// Les opérations booléennes laissent des sommets posés au milieu d'arêtes voisines : on redécoupe
// les triangles concernés pour obtenir un maillage fermé (étanche) que tous les slicers acceptent.
export function repairTJunctions(soup, eps = 1e-3, maxIter = 4) {
  let cur = soup;
  for (let iter = 0; iter < maxIter; iter++) {
    const { vertices: V, triangles: T } = weld(cur, eps * 0.5);
    const edgeCount = new Map();
    const key = (a, b) => (a < b ? a * 4294967296 + b : b * 4294967296 + a);
    for (let t = 0; t < T.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const a = T[t + k], b = T[t + ((k + 1) % 3)];
        if (a === b) continue;
        const kk = key(a, b);
        edgeCount.set(kk, (edgeCount.get(kk) || 0) + 1);
      }
    }
    const bverts = new Set();
    for (const [kk, n] of edgeCount) {
      if (n !== 1) continue;
      bverts.add(Math.floor(kk / 4294967296));
      bverts.add(kk % 4294967296);
    }
    if (!bverts.size) return cur;
    const cell = 0.6;
    const grid = new Map();
    const gk = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    for (const v of bverts) {
      const k = gk(V[v * 3], V[v * 3 + 1], V[v * 3 + 2]);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(v);
    }
    const out = [];
    let changed = false;
    const P = (i) => [V[i * 3], V[i * 3 + 1], V[i * 3 + 2]];
    for (let t = 0; t < T.length; t += 3) {
      const tri = [T[t], T[t + 1], T[t + 2]];
      if (tri[0] === tri[1] || tri[1] === tri[2] || tri[0] === tri[2]) continue;
      const poly = [];
      let split = false;
      for (let k = 0; k < 3; k++) {
        const a = tri[k], b = tri[(k + 1) % 3];
        poly.push(a);
        if (edgeCount.get(key(a, b)) !== 1) continue;
        const A = P(a), B = P(b);
        const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
        if (len2 < 1e-12) continue;
        const found = [];
        const x0 = Math.min(A[0], B[0]) - eps, x1 = Math.max(A[0], B[0]) + eps;
        const y0 = Math.min(A[1], B[1]) - eps, y1 = Math.max(A[1], B[1]) + eps;
        const z0 = Math.min(A[2], B[2]) - eps, z1 = Math.max(A[2], B[2]) + eps;
        for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) {
          for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) {
            for (let gz = Math.floor(z0 / cell); gz <= Math.floor(z1 / cell); gz++) {
              const list = grid.get(`${gx},${gy},${gz}`);
              if (!list) continue;
              for (const v of list) {
                if (v === a || v === b) continue;
                const p = P(v);
                const s = ((p[0] - A[0]) * d[0] + (p[1] - A[1]) * d[1] + (p[2] - A[2]) * d[2]) / len2;
                if (s <= 1e-6 || s >= 1 - 1e-6) continue;
                const q = [A[0] + d[0] * s - p[0], A[1] + d[1] * s - p[1], A[2] + d[2] * s - p[2]];
                if (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] < eps * eps) found.push([s, v]);
              }
            }
          }
        }
        if (found.length) {
          found.sort((m, n) => m[0] - n[0]);
          for (const [, v] of found) poly.push(v);
          split = true;
        }
      }
      if (!split) {
        out.push(...P(tri[0]), ...P(tri[1]), ...P(tri[2]));
        continue;
      }
      changed = true;
      const c = [0, 0, 0];
      for (let k = 0; k < 3; k++) { const p = P(tri[k]); c[0] += p[0] / 3; c[1] += p[1] / 3; c[2] += p[2] / 3; }
      for (let i = 0; i < poly.length; i++) out.push(...P(poly[i]), ...P(poly[(i + 1) % poly.length]), ...c);
    }
    cur = new Float32Array(out);
    if (!changed) return cur;
  }
  return cur;
}
