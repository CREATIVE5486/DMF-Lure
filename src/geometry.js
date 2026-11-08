// Génération géométrique paramétrique du leurre.
// Repère (mm) : x = axe longitudinal (nez à x=0, queue à x=L), y = haut, z = flanc.
// Le nez pointe vers -x : c'est la direction de nage.
import * as THREE from 'three';
import { makeMonotone, clamp } from './curves.js';

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
  const P = {
    L, H, W, n: clamp(b.squareness, 1.6, 6),
    top: (u) => H * Math.max(0.005, ft(u)) * env(u),
    bot: (u) => H * Math.max(0.005, fb(u)) * env(u),
    hw: (u) => W * 0.5 * Math.max(0.005, fw(u)) * env(u),
  };
  return P;
}

// Échantillonnage en u resserré aux extrémités
export function ringUs(n) {
  const us = new Float64Array(n);
  for (let i = 0; i < n; i++) us[i] = (1 - Math.cos(Math.PI * (i / (n - 1)))) / 2;
  return us;
}

export function sectionXYZ(P, u, theta, top, bot, hw) {
  const c = Math.cos(theta), s = Math.sin(theta), e = 2 / P.n;
  const y = c >= 0 ? top * Math.pow(c, e) : -bot * Math.pow(-c, e);
  const z = (s >= 0 ? 1 : -1) * hw * Math.pow(Math.abs(s), e);
  return [u * P.L, y, z];
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

// Maillage affiché : grille (u, θ) avec UV linéaires en mm le long du corps.
export function buildBodyGeometry(design, nu = 150, nt = 112) {
  const P = makeProfile(design);
  const us = ringUs(nu);
  const cols = nt + 1;
  const pos = new Float32Array(nu * cols * 3);
  const uv = new Float32Array(nu * cols * 2);
  for (let i = 0; i < nu; i++) {
    const u = us[i];
    const top = P.top(u), bot = P.bot(u), hw = P.hw(u);
    const tip = i === 0 || i === nu - 1;
    for (let j = 0; j < cols; j++) {
      const th = (j / nt) * Math.PI * 2;
      const k = i * cols + j;
      const [x, y, z] = tip ? [u * P.L, 0, 0] : sectionXYZ(P, u, th, top, bot, hw);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      uv[k * 2] = u; uv[k * 2 + 1] = j / nt;
    }
  }
  const idx = [];
  for (let i = 0; i < nu - 1; i++) {
    for (let j = 0; j < nt; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      if (i > 0) idx.push(a, b, c);
      if (i < nu - 2) idx.push(b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  // couture : moyenne des normales θ=0 et θ=2π ; pointes : normale axiale
  for (let i = 0; i < nu; i++) {
    const a = i * cols, b = i * cols + nt;
    if (i === 0 || i === nu - 1) {
      for (let j = 0; j < cols; j++) nrm.setXYZ(i * cols + j, i === 0 ? -1 : 1, 0, 0);
      continue;
    }
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

// Circonférence locale (mm) — sert à corriger la déformation du pinceau en peinture.
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

/* ------------------------------ Bavette ------------------------------ */

export function lipFrame(design) {
  const P = makeProfile(design);
  const lip = design.lip;
  const a = THREE.MathUtils.degToRad(clamp(lip.angle, 0, 90));
  const u = clamp(lip.posU, 0, 0.3);
  const root = new THREE.Vector3(u * P.L, -P.bot(u) * clamp(lip.rootDepth, 0, 1), 0);
  const dir = new THREE.Vector3(-Math.cos(a), -Math.sin(a), 0);
  const side = new THREE.Vector3(0, 0, 1);
  const normal = new THREE.Vector3().crossVectors(dir, side); // (-sin a, cos a, 0)
  const insert = Math.min(6, lip.length * 0.3 + 1.5);
  return { root, dir, side, normal, insert, angle: a };
}

export function lipShape(lip, insert) {
  const l = Math.max(1, lip.length), w = Math.max(2, lip.width), hw = w / 2;
  const s = new THREE.Shape();
  const x0 = -insert;
  const rootW = hw * 0.82;
  s.moveTo(x0, -rootW);
  s.lineTo(0, -rootW);
  switch (lip.shape) {
    case 'square': {
      const r = Math.min(hw * 0.25, l * 0.3);
      s.lineTo(l * 0.2, -hw);
      s.lineTo(l - r, -hw);
      s.quadraticCurveTo(l, -hw, l, -hw + r);
      s.lineTo(l, hw - r);
      s.quadraticCurveTo(l, hw, l - r, hw);
      s.lineTo(l * 0.2, hw);
      break;
    }
    case 'coffin': {
      const c = Math.min(hw * 0.45, l * 0.35);
      s.lineTo(l * 0.25, -hw);
      s.lineTo(l - c, -hw);
      s.lineTo(l, -hw + c);
      s.lineTo(l, hw - c);
      s.lineTo(l - c, hw);
      s.lineTo(l * 0.25, hw);
      break;
    }
    case 'bill': {
      const tw = hw * 0.55;
      s.lineTo(l * 0.15, -hw);
      s.lineTo(l - tw, -tw);
      s.absarc(l - tw, 0, tw, -Math.PI / 2, Math.PI / 2, false);
      s.lineTo(l * 0.15, hw);
      break;
    }
    default: { // round
      const r = Math.min(hw, l * 0.75);
      s.lineTo(l * 0.15, -hw);
      s.lineTo(l - r, -hw);
      if (r < hw) {
        s.lineTo(l - r, -hw);
        s.absellipse(l - r, 0, r, hw, -Math.PI / 2, Math.PI / 2, false, 0);
      } else {
        s.absarc(l - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
      }
      s.lineTo(l * 0.15, hw);
    }
  }
  s.lineTo(0, rootW);
  s.lineTo(x0, rootW);
  s.lineTo(x0, -rootW);
  return s;
}

// Matrice : repère local de la bavette (x long., y largeur, z épaisseur) → repère leurre
export function lipMatrix(design) {
  const F = lipFrame(design);
  const m = new THREE.Matrix4().makeBasis(F.dir, F.side, F.normal);
  const t = Math.max(0.4, design.lip.thickness);
  const off = F.normal.clone().multiplyScalar(-t / 2);
  m.setPosition(F.root.clone().add(off));
  return m;
}

export function buildLipGeometry(design, { local = false } = {}) {
  const F = lipFrame(design);
  const shape = lipShape(design.lip, F.insert);
  const t = Math.max(0.4, design.lip.thickness);
  const bevel = Math.min(0.25, t * 0.2);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: t - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 24,
  });
  g.translate(0, 0, bevel);
  if (!local) g.applyMatrix4(lipMatrix(design));
  g.computeVertexNormals();
  return g;
}

/* ------------------------------ Quincaillerie ------------------------------ */

export function lineTiePoint(design) {
  const P = makeProfile(design);
  const mode = design.lip.enabled ? design.lineTie.mode : (design.lineTie.mode === 'lip' ? 'nose' : design.lineTie.mode);
  if (mode === 'lip') {
    const F = lipFrame(design);
    const along = clamp(design.lineTie.lipPos, 0.05, 0.9) * design.lip.length;
    return {
      point: F.root.clone().addScaledVector(F.dir, along).addScaledVector(F.normal, design.lip.thickness / 2 + 1.2),
      axis: F.normal.clone(), mode,
    };
  }
  if (mode === 'back') {
    const u = 0.22;
    return { point: new THREE.Vector3(u * P.L, P.top(u) + 1.8, 0), axis: new THREE.Vector3(0, 1, 0), mode };
  }
  const u = 0.01;
  const y = (P.top(0.05) - P.bot(0.05)) * 0.15;
  return { point: new THREE.Vector3(u * P.L - 2, y, 0), axis: new THREE.Vector3(-1, 0, 0), mode };
}

export function hangerPoints(design) {
  const P = makeProfile(design);
  const out = design.hooks.belly.map((h) => {
    const u = clamp(h.u, 0.08, 0.92);
    return { point: new THREE.Vector3(u * P.L, -P.bot(u) - 1.2, 0), size: h.size, kind: 'belly' };
  });
  if (design.hooks.tail.enabled) {
    out.push({ point: new THREE.Vector3(P.L + 1.6, (P.top(0.97) - P.bot(0.97)) * 0.3, 0), size: design.hooks.tail.size, kind: 'tail' });
  }
  return out;
}

/* ------------------------------ Pièces imprimables ------------------------------ */
// Les pièces sont des « soupes » de triangles (Float32Array, 9 valeurs / triangle), étanches.

function pushTri(arr, a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * cx + cy * cy + cz * cz < 1e-20) return; // dégénéré (pointes)
  arr.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

function triNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

function pushOriented(arr, a, b, c, want) {
  const n = triNormal(a, b, c);
  if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) pushTri(arr, a, c, b);
  else pushTri(arr, a, b, c);
}

// Corps plein (non coupé)
export function buildSolidBody(design, nu = 140, nt = 96) {
  const P = makeProfile(design);
  const us = ringUs(nu);
  const rings = [];
  for (let i = 0; i < nu; i++) {
    const u = us[i];
    const top = P.top(u), bot = P.bot(u), hw = P.hw(u);
    const ring = [];
    for (let j = 0; j < nt; j++) {
      ring.push(i === 0 || i === nu - 1 ? [u * P.L, 0, 0] : sectionXYZ(P, u, (j / nt) * Math.PI * 2, top, bot, hw));
    }
    rings.push(ring);
  }
  const arr = [];
  for (let i = 0; i < nu - 1; i++) {
    for (let j = 0; j < nt; j++) {
      const j1 = (j + 1) % nt;
      const a = rings[i][j], b = rings[i][j1], c = rings[i + 1][j], d = rings[i + 1][j1];
      pushTri(arr, a, b, c);
      pushTri(arr, b, d, c);
    }
  }
  return new Float32Array(arr);
}

// Demi-coque creuse. side = +1 (flanc z>0) ou -1. Plan de joint z = 0.
export function buildHalfShell(design, side = 1, opts = {}) {
  const nu = opts.nu || 130, m = opts.nt || 56;
  const wall = Math.max(0.4, opts.wall ?? design.print.wall);
  const hollow = opts.hollow ?? true;
  const P = makeProfile(design);
  const us = ringUs(nu);
  const outer = [], inner = [];
  let i0 = -1, i1 = -1;
  for (let i = 0; i < nu; i++) {
    const u = us[i];
    const top = P.top(u), bot = P.bot(u), hw = P.hw(u);
    const tip = i === 0 || i === nu - 1;
    const ring = [];
    for (let j = 0; j <= m; j++) {
      const th = (j / m) * Math.PI;
      ring.push(tip ? [u * P.L, 0, 0] : sectionXYZ(P, u, th, top, bot, hw));
    }
    outer.push(ring);
    const it = top - wall, ib = bot - wall, ih = hw - wall;
    const x = u * P.L;
    const ok = hollow && !tip && it > 0.35 && ib > 0.35 && ih > 0.35 && x > wall * 1.5 && x < P.L - wall * 1.5;
    if (ok) {
      if (i0 < 0) i0 = i;
      if (i1 === i - 1 || i1 < 0) i1 = i;
      const r = [];
      for (let j = 0; j <= m; j++) r.push(sectionXYZ(P, u, (j / m) * Math.PI, it, ib, ih));
      inner[i] = r;
    }
  }
  const hasCavity = i0 >= 0 && i1 - i0 >= 2;
  const arr = [];
  // surface extérieure (normale sortante = ∂θ × ∂x)
  for (let i = 0; i < nu - 1; i++) {
    for (let j = 0; j < m; j++) {
      const a = outer[i][j], b = outer[i][j + 1], c = outer[i + 1][j], d = outer[i + 1][j + 1];
      pushTri(arr, a, b, c);
      pushTri(arr, b, d, c);
    }
  }
  // plan de joint (z = 0) : bandes x-monotones entre bord haut et bord bas (+ trou de la cavité)
  const W = [0, 0, -1];
  const T = (i) => outer[i][0], B = (i) => outer[i][m];
  const IT = (i) => inner[i][0], IB = (i) => inner[i][m];
  for (let i = 0; i < nu - 1; i++) {
    const inA = hasCavity && i >= i0 && i <= i1, inB = hasCavity && i + 1 >= i0 && i + 1 <= i1;
    if (inA && inB) {
      pushOriented(arr, T(i), T(i + 1), IT(i + 1), W); pushOriented(arr, T(i), IT(i + 1), IT(i), W);
      pushOriented(arr, IB(i), IB(i + 1), B(i + 1), W); pushOriented(arr, IB(i), B(i + 1), B(i), W);
    } else if (!inA && inB) { // entrée dans la cavité : éventail depuis B(i)
      const poly = [T(i), T(i + 1), IT(i + 1), IB(i + 1), B(i + 1)];
      for (let k = 0; k < poly.length - 1; k++) pushOriented(arr, B(i), poly[k], poly[k + 1], W);
    } else if (inA && !inB) { // sortie de la cavité : éventail depuis B(i+1)
      const poly = [B(i), IB(i), IT(i), T(i), T(i + 1)];
      for (let k = 0; k < poly.length - 1; k++) pushOriented(arr, B(i + 1), poly[k], poly[k + 1], W);
    } else {
      pushOriented(arr, T(i), T(i + 1), B(i + 1), W); pushOriented(arr, T(i), B(i + 1), B(i), W);
    }
  }
  if (hasCavity) {
    for (let i = i0; i < i1; i++) {
      for (let j = 0; j < m; j++) {
        const a = inner[i][j], b = inner[i][j + 1], c = inner[i + 1][j], d = inner[i + 1][j + 1];
        pushTri(arr, a, c, b);
        pushTri(arr, b, c, d);
      }
    }
    for (const [ii, want] of [[i0, [1, 0, 0]], [i1, [-1, 0, 0]]]) {
      const r = inner[ii];
      for (let k = 1; k < m; k++) pushOriented(arr, r[0], r[k], r[k + 1], want);
    }
  }
  const out = new Float32Array(arr);
  if (side < 0) {
    for (let t = 0; t < out.length; t += 9) {
      for (let k = 0; k < 9; k += 3) out[t + k + 2] = -out[t + k + 2];
      // inversion d'ordre (b <-> c) pour garder des normales sortantes
      for (let k = 0; k < 3; k++) { const tmp = out[t + 3 + k]; out[t + 3 + k] = out[t + 6 + k]; out[t + 6 + k] = tmp; }
    }
  }
  return out;
}

export function geometryToSoup(g) {
  const ng = g.index ? g.toNonIndexed() : g;
  return new Float32Array(ng.attributes.position.array);
}

export function buildLipSoup(design, local = true) {
  return geometryToSoup(buildLipGeometry(design, { local }));
}

export function soupToGeometry(soup) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(soup, 3));
  g.computeVertexNormals();
  return g;
}

// Volume (mm³) et centroïde d'une soupe fermée
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
    const n = triNormal([soup[t], soup[t + 1], soup[t + 2]], [soup[t + 3], soup[t + 4], soup[t + 5]], [soup[t + 6], soup[t + 7], soup[t + 8]]);
    A += Math.hypot(n[0], n[1], n[2]) / 2;
  }
  return A;
}

// Soudure des sommets (pour 3MF / contrôle d'étanchéité)
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

export function checkManifold(soup) {
  const { triangles } = weld(soup, 1e-3);
  const edges = new Map();
  for (let t = 0; t < triangles.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = triangles[t + k], b = triangles[t + ((k + 1) % 3)];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
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
  return { open, nonManifold, flipped, ok: open === 0 && nonManifold === 0 && flipped === 0, triangles: triangles.length / 3 };
}
