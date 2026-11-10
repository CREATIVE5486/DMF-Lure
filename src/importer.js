// Import de leurres existants (STL, 3MF, STEP) : lecture, orientation, reconstruction des demi-coquilles,
// détection de la bavette, volumes exacts par lancer de rayons et profil paramétrique équivalent.
import { unzipSync, strFromU8 } from 'fflate';
import { weld, soupVolume, soupArea } from './geometry.js';

/* =============================== Lecture des fichiers =============================== */

export function parseSTL(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (u8.length >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === u8.length) {
      const out = new Float32Array(n * 9);
      let o = 84;
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(o + 12 + k * 4, true);
        o += 50;
      }
      return out;
    }
  }
  const txt = new TextDecoder().decode(u8);
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
  const vals = [];
  let m;
  while ((m = re.exec(txt))) vals.push(+m[1], +m[2], +m[3]);
  if (vals.length < 9) throw new Error('STL vide ou illisible');
  return new Float32Array(vals.slice(0, vals.length - (vals.length % 9)));
}

// 3MF : archive ZIP contenant du XML (objets, composants, transformations)
export function parse3MF(buf) {
  const files = unzipSync(new Uint8Array(buf));
  const models = Object.keys(files).filter((k) => k.toLowerCase().endsWith('.model'));
  if (!models.length) throw new Error('3MF sans modèle');
  const objects = new Map();
  const builds = [];
  const attr = (s, name) => { const r = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(s); return r ? r[1] : null; };
  const parseT = (t) => (t ? t.trim().split(/\s+/).map(Number) : null);
  for (const path of models) {
    const xml = strFromU8(files[path]);
    const objRe = /<(?:\w+:)?object\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?object>/g;
    let om;
    while ((om = objRe.exec(xml))) {
      const id = `${path}#${attr(om[1], 'id')}`;
      const body = om[2];
      const verts = [];
      const vre = /<(?:\w+:)?vertex\b([^>]*)\/?>/g;
      let vm;
      while ((vm = vre.exec(body))) verts.push(+attr(vm[1], 'x'), +attr(vm[1], 'y'), +attr(vm[1], 'z'));
      const tris = [];
      const tre = /<(?:\w+:)?triangle\b([^>]*)\/?>/g;
      let tm;
      while ((tm = tre.exec(body))) tris.push(+attr(tm[1], 'v1'), +attr(tm[1], 'v2'), +attr(tm[1], 'v3'));
      const comps = [];
      const cre = /<(?:\w+:)?component\b([^>]*)\/?>/g;
      let cm;
      while ((cm = cre.exec(body))) {
        const p = attr(cm[1], 'p:path') || attr(cm[1], 'path');
        comps.push({ ref: `${p ? p.replace(/^\//, '') : path}#${attr(cm[1], 'objectid')}`, t: parseT(attr(cm[1], 'transform')) });
      }
      objects.set(id, { verts, tris, comps });
    }
    const ire = /<(?:\w+:)?item\b([^>]*)\/?>/g;
    let im;
    while ((im = ire.exec(xml))) {
      const p = attr(im[1], 'p:path') || attr(im[1], 'path');
      builds.push({ ref: `${p ? p.replace(/^\//, '') : path}#${attr(im[1], 'objectid')}`, t: parseT(attr(im[1], 'transform')) });
    }
  }
  const mul = (a, b) => { // matrices 3MF 3×4 (ligne : m00 m01 m02 m10 … m32), point' = p·M
    if (!a) return b; if (!b) return a;
    const A = [[a[0], a[1], a[2], 0], [a[3], a[4], a[5], 0], [a[6], a[7], a[8], 0], [a[9], a[10], a[11], 1]];
    const B = [[b[0], b[1], b[2], 0], [b[3], b[4], b[5], 0], [b[6], b[7], b[8], 0], [b[9], b[10], b[11], 1]];
    const C = A.map((r) => [0, 1, 2, 3].map((j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
    return [C[0][0], C[0][1], C[0][2], C[1][0], C[1][1], C[1][2], C[2][0], C[2][1], C[2][2], C[3][0], C[3][1], C[3][2]];
  };
  const parts = [];
  const emit = (ref, t, depth = 0) => {
    const o = objects.get(ref);
    if (!o || depth > 8) return;
    for (const c of o.comps) emit(c.ref, mul(c.t, t), depth + 1);
    if (!o.tris.length) return;
    const out = new Float32Array(o.tris.length * 3);
    for (let i = 0; i < o.tris.length; i++) {
      const v = o.tris[i] * 3;
      let x = o.verts[v], y = o.verts[v + 1], z = o.verts[v + 2];
      if (t) { const X = x * t[0] + y * t[3] + z * t[6] + t[9], Y = x * t[1] + y * t[4] + z * t[7] + t[10], Z = x * t[2] + y * t[5] + z * t[8] + t[11]; x = X; y = Y; z = Z; }
      out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
    }
    parts.push(out);
  };
  const list = builds.length ? builds : [...objects.keys()].map((ref) => ({ ref, t: null }));
  for (const b of list) emit(b.ref, b.t);
  if (!parts.length) throw new Error('3MF : aucun maillage trouvé');
  return mergeSoups(parts);
}

let occtPromise = null;
async function loadOcct() {
  if (!occtPromise) {
    occtPromise = (async () => {
      const mod = await import('occt-import-js');
      const factory = mod.default || mod;
      const wasm = (await import('occt-import-js/dist/occt-import-js.wasm?url')).default;
      return factory({ locateFile: () => wasm });
    })();
  }
  return occtPromise;
}

// STEP : moteur OpenCascade (WebAssembly), chargé seulement quand on en a besoin
export async function parseSTEP(buf, occtOverride = null) {
  const occt = occtOverride || await loadOcct();
  const res = occt.ReadStepFile(new Uint8Array(buf), { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.0015, angularDeflection: 0.3 });
  if (!res || !res.success || !res.meshes?.length) throw new Error('STEP illisible');
  const parts = res.meshes.map((m) => {
    const p = m.attributes.position.array, idx = m.index.array;
    const out = new Float32Array(idx.length * 3);
    for (let i = 0; i < idx.length; i++) { out[i * 3] = p[idx[i] * 3]; out[i * 3 + 1] = p[idx[i] * 3 + 1]; out[i * 3 + 2] = p[idx[i] * 3 + 2]; }
    return out;
  });
  return mergeSoups(parts);
}

export async function readModelFile(name, buf) {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'stl') return parseSTL(buf);
  if (ext === '3mf') return parse3MF(buf);
  if (ext === 'step' || ext === 'stp') return parseSTEP(buf);
  throw new Error(`Format non pris en charge : .${ext}`);
}

export function mergeSoups(list) {
  const n = list.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const p of list) { out.set(p, o); o += p.length; }
  return out;
}

/* =============================== Outils géométriques =============================== */

function bounds(s) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < s.length; i += 3) for (let k = 0; k < 3; k++) { if (s[i + k] < mn[k]) mn[k] = s[i + k]; if (s[i + k] > mx[k]) mx[k] = s[i + k]; }
  return { min: mn, max: mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] };
}

function mapSoup(s, fn, flip = false) {
  const out = new Float32Array(s.length);
  const v = [0, 0, 0];
  for (let i = 0; i < s.length; i += 3) { fn(s[i], s[i + 1], s[i + 2], v); out[i] = v[0]; out[i + 1] = v[1]; out[i + 2] = v[2]; }
  if (flip) for (let t = 0; t < out.length; t += 9) for (let k = 0; k < 3; k++) { const a = out[t + 3 + k]; out[t + 3 + k] = out[t + 6 + k]; out[t + 6 + k] = a; }
  return out;
}

// Composantes connexes (par sommets partagés)
function components(soup) {
  const { triangles } = weld(soup, 1e-3);
  const nv = Math.max(...triangles) + 1;
  const parent = new Int32Array(nv).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < triangles.length; t += 3) {
    const a = find(triangles[t]), b = find(triangles[t + 1]), c = find(triangles[t + 2]);
    parent[b] = a; parent[c] = a;
  }
  const groups = new Map();
  for (let t = 0; t < triangles.length; t += 3) {
    const r = find(triangles[t]);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(t / 3);
  }
  return [...groups.values()].map((tris) => {
    const out = new Float32Array(tris.length * 9);
    tris.forEach((ti, i) => out.set(soup.subarray(ti * 9, ti * 9 + 9), i * 9));
    return out;
  });
}

// Recherche d'une face de joint plane (demi-coquille) sur une des faces de la boîte englobante
function findJointPlane(soup) {
  const b = bounds(soup);
  const total = soupArea(soup);
  let best = null;
  for (let ax = 0; ax < 3; ax++) {
    for (const side of [0, 1]) {
      const plane = side ? b.max[ax] : b.min[ax];
      const tol = Math.max(0.02, b.size[ax] * 0.002);
      let area = 0;
      for (let t = 0; t < soup.length; t += 9) {
        let on = true;
        for (let k = 0; k < 3; k++) if (Math.abs(soup[t + k * 3 + ax] - plane) > tol) { on = false; break; }
        if (!on) continue;
        const ux = soup[t + 3] - soup[t], uy = soup[t + 4] - soup[t + 1], uz = soup[t + 5] - soup[t + 2];
        const vx = soup[t + 6] - soup[t], vy = soup[t + 7] - soup[t + 1], vz = soup[t + 8] - soup[t + 2];
        area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
      }
      const frac = area / total;
      if (!best || frac > best.frac) best = { ax, side, plane, frac, tol };
    }
  }
  return best && best.frac > 0.06 ? best : null;
}

/* =============================== Volumes par lancer de rayons =============================== */
// Rayons parallèles à x sur une grille (y, z) : intervalles intérieurs exacts → volume extérieur (cavités
// comprises, = eau déplacée), volume de matière (parité), profil par tranches.
export function rayColumns(soup, cellTarget = 9000) {
  const b = bounds(soup);
  const Hs = b.size[1], Ws = b.size[2];
  const c = Math.max(0.15, Math.sqrt((Hs * Ws) / cellTarget));
  const ny = Math.max(4, Math.ceil(Hs / c) + 1), nz = Math.max(4, Math.ceil(Ws / c) + 1);
  const y0 = b.min[1] - c * 0.5 + c * 0.0137, z0 = b.min[2] - c * 0.5 + c * 0.0291;
  const hits = Array.from({ length: ny * nz }, () => []);
  for (let t = 0; t < soup.length; t += 9) {
    const ax = soup[t], ay = soup[t + 1], az = soup[t + 2];
    const bx = soup[t + 3], by = soup[t + 4], bz = soup[t + 5];
    const cx = soup[t + 6], cy = soup[t + 7], cz = soup[t + 8];
    const den = (by - cy) * (az - cz) + (cz - bz) * (ay - cy);
    if (Math.abs(den) < 1e-12) continue;
    const jy0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / c)), jy1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by, cy) - y0) / c));
    const jz0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / c)), jz1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - z0) / c));
    for (let j = jy0; j <= jy1; j++) {
      const py = y0 + (j + 0.5) * c;
      for (let k = jz0; k <= jz1; k++) {
        const pz = z0 + (k + 0.5) * c;
        const l1 = ((by - cy) * (pz - cz) + (cz - bz) * (py - cy)) / den;
        const l2 = ((cy - ay) * (pz - cz) + (az - cz) * (py - cy)) / den;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        hits[j * nz + k].push(l1 * ax + l2 * bx + l3 * cx);
      }
    }
  }
  const cols = [];
  const dA = c * c;
  let Vout = 0, Vmat = 0, mx = 0, my = 0, mz = 0, gx = 0, gy = 0, gz = 0;
  for (let j = 0; j < ny; j++) {
    for (let k = 0; k < nz; k++) {
      const h = hits[j * nz + k];
      if (h.length < 2) continue;
      h.sort((p, q) => p - q);
      const xs = [];
      for (const v of h) if (!xs.length || v - xs[xs.length - 1] > 1e-5) xs.push(v);
      if (xs.length % 2) xs.pop();
      if (xs.length < 2) continue;
      const y = y0 + (j + 0.5) * c, z = z0 + (k + 0.5) * c;
      const inner = [];
      let mat = 0;
      for (let i = 0; i < xs.length; i += 2) { inner.push([xs[i], xs[i + 1]]); mat += xs[i + 1] - xs[i]; gx += (xs[i] + xs[i + 1]) / 2 * (xs[i + 1] - xs[i]) * dA; }
      const x0 = xs[0], x1 = xs[xs.length - 1];
      cols.push({ y, z, x0, x1, inner });
      const lo = (x1 - x0) * dA;
      Vout += lo; mx += lo * (x0 + x1) / 2; my += lo * y; mz += lo * z;
      Vmat += mat * dA; gy += mat * dA * y; gz += mat * dA * z;
    }
  }
  return {
    cols, dA, c, bounds: b,
    Vout, Cout: Vout ? [mx / Vout, my / Vout, mz / Vout] : [0, 0, 0],
    Vmat, Cmat: Vmat ? [gx / Vmat, gy / Vmat, gz / Vmat] : [0, 0, 0],
  };
}

// Volume immergé sous le plan y = h + (x − xr)·t (repère leurre), d'après les colonnes
export function columnsSubmerged(rc, h, t, xr) {
  let V = 0, mx = 0, my = 0;
  const dA = rc.dA;
  for (const col of rc.cols) {
    if (Math.abs(t) < 1e-9 && col.y >= h) continue;
    const xc = Math.abs(t) < 1e-9 ? 0 : xr + (col.y - h) / t; // limite où le plan passe à la hauteur de la colonne
    for (let [a, b] of col.inner) {
      if (Math.abs(t) >= 1e-9) {
        if (t > 0) a = Math.max(a, xc); else b = Math.min(b, xc);
        if (b <= a) continue;
      }
      const v = (b - a) * dA;
      V += v; mx += v * (a + b) / 2; my += v * col.y;
    }
  }
  return { V, cx: V > 0 ? mx / V : 0, cy: V > 0 ? my / V : 0 };
}

/* =============================== Traitement complet =============================== */

const UNIT = { mm: 1, cm: 10, m: 1000, in: 25.4 };

function lanczosGamma(z) {
  const g = 7, p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * lanczosGamma(1 - z));
  z -= 1;
  let x = p[0];
  for (let i = 1; i < g + 2; i++) x += p[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}
// aire d'une super-ellipse rapportée à son rectangle englobant
const seRatio = (n) => (lanczosGamma(1 + 1 / n) ** 2) / lanczosGamma(1 + 2 / n);

export const defaultImportParams = () => ({ units: 'auto', rotate: 0, flipNose: false, flipUp: false, mirror: 'auto', massMode: 'auto', lipAuto: true });

// raw : soupe brute ; params : réglages utilisateur. Renvoie le modèle prêt + paramètres de design dérivés.
export function processImport(raw, params = defaultImportParams()) {
  const P = { ...defaultImportParams(), ...params };
  let s = raw;
  // unités
  let b = bounds(s);
  const maxDim = Math.max(...b.size);
  let unit = P.units;
  if (unit === 'auto') unit = maxDim < 0.5 ? 'm' : maxDim < 8 ? 'in' : 'mm';
  const k = UNIT[unit] || 1;
  if (k !== 1) s = mapSoup(s, (x, y, z, o) => { o[0] = x * k; o[1] = y * k; o[2] = z * k; });

  // détection de demi-coquille avant orientation
  let joint = P.mirror === 'no' ? null : findJointPlane(s);
  if (P.mirror === 'yes' && !joint) {
    b = bounds(s);
    const ax = b.size.indexOf(Math.min(...b.size));
    joint = { ax, side: 0, plane: b.min[ax], frac: 0 };
  }
  // orientation : x = longueur, z = normale du plan de joint (ou plus petite dimension), y = hauteur
  b = bounds(s);
  const axes = [0, 1, 2];
  let zAx = joint ? joint.ax : b.size.indexOf(Math.min(...b.size));
  const rest = axes.filter((a) => a !== zAx);
  const xAx = b.size[rest[0]] >= b.size[rest[1]] ? rest[0] : rest[1];
  const yAx = rest.find((a) => a !== xAx);
  const sgn = (xAx + 1) % 3 === yAx ? 1 : -1; // conserver un repère direct
  s = mapSoup(s, (x, y, z, o) => { const v = [x, y, z]; o[0] = v[xAx]; o[1] = v[yAx]; o[2] = sgn * v[zAx]; }, sgn < 0);
  let mirrored = false;
  if (joint) {
    let planeZ = sgn * joint.plane;
    b = bounds(s);
    // la moitié doit être côté z ≥ plan
    if (Math.abs(b.max[2] - planeZ) < Math.abs(b.min[2] - planeZ)) {
      s = mapSoup(s, (x, y, z, o) => { o[0] = x; o[1] = y; o[2] = -z; }, true);
      planeZ = -planeZ;
    }
    s = mapSoup(s, (x, y, z, o) => { o[0] = x; o[1] = y; o[2] = z - planeZ; });
    // retirer les faces du plan de joint puis ajouter le symétrique
    const tol = Math.max(0.02, joint.tol || 0.05);
    const keep = [];
    for (let t = 0; t < s.length; t += 9) {
      if (Math.abs(s[t + 2]) < tol && Math.abs(s[t + 5]) < tol && Math.abs(s[t + 8]) < tol) continue;
      keep.push(t);
    }
    const half = new Float32Array(keep.length * 9);
    keep.forEach((t, i) => half.set(s.subarray(t, t + 9), i * 9));
    for (let i = 2; i < half.length; i += 3) if (Math.abs(half[i]) < tol) half[i] = 0;
    const other = mapSoup(half, (x, y, z, o) => { o[0] = x; o[1] = y; o[2] = -z; }, true);
    s = mergeSoups([half, other]);
    mirrored = true;
  }
  // réglages manuels : rotation autour de l'axe long, inversion avant/arrière, haut/bas
  const rot = ((P.rotate % 360) + 360) % 360;
  if (rot) {
    const a = (rot * Math.PI) / 180, ca = Math.round(Math.cos(a)), sa = Math.round(Math.sin(a));
    s = mapSoup(s, (x, y, z, o) => { o[0] = x; o[1] = y * ca - z * sa; o[2] = y * sa + z * ca; });
  }
  if (P.flipNose) s = mapSoup(s, (x, y, z, o) => { o[0] = -x; o[1] = y; o[2] = -z; });
  if (P.flipUp) s = mapSoup(s, (x, y, z, o) => { o[0] = x; o[1] = -y; o[2] = -z; });
  // nez du côté où le corps est le plus fin (bavette ou pointe) : heuristique si non forcé
  b = bounds(s);
  if (s.length && soupVolume(s).volume < 0) s = mapSoup(s, (x, y, z, o) => { o[0] = x; o[1] = y; o[2] = z; }, true);

  // composantes : on garde l'enveloppe extérieure (les surfaces intérieures = cavités)
  const comps = components(s);
  const boxes = comps.map((c) => ({ c, b: bounds(c) }));
  const inside = (p, q) => p.b.min.every((v, i) => v >= q.b.min[i] - 0.01) && p.b.max.every((v, i) => v <= q.b.max[i] + 0.01) && p !== q && p.b.size[0] < q.b.size[0];
  const outer = boxes.filter((p) => !boxes.some((q) => inside(p, q))).map((p) => p.c);
  const outerSoup = mergeSoups(outer);
  const hollowModel = outer.length < comps.length;

  const rcAll = rayColumns(outerSoup);
  b = rcAll.bounds;
  // tranches le long de x pour le profil et la bavette
  const nb = 140;
  const xmin = b.min[0], xmax = b.max[0], dx = (xmax - xmin) / nb;
  const sl = Array.from({ length: nb }, (_, i) => ({ x: xmin + (i + 0.5) * dx, top: -Infinity, bot: Infinity, zmax: 0, area: 0 }));
  for (const col of rcAll.cols) for (const [ca, cb] of col.inner) {
    const i0 = Math.max(0, Math.floor((ca - xmin) / dx)), i1 = Math.min(nb - 1, Math.floor((cb - xmin) / dx));
    for (let i = i0; i <= i1; i++) {
      const q = sl[i];
      if (q.x < ca || q.x > cb) continue;
      q.top = Math.max(q.top, col.y + rcAll.c / 2);
      q.bot = Math.min(q.bot, col.y - rcAll.c / 2);
      q.zmax = Math.max(q.zmax, Math.abs(col.z) + rcAll.c / 2);
      q.area += rcAll.dA;
    }
  }
  const valid = sl.filter((q) => q.area > 0);
  const thick = (q) => q.top - q.bot;
  const Hmax = Math.max(...valid.map(thick));
  // l'avant est le côté le plus effilé : si l'arrière ressemble à une bavette, on retourne
  const lipLike = (q) => q.area > 0 && 2 * q.zmax > 2.0 * thick(q) && thick(q) < 0.2 * Hmax;
  const frontLip = sl.slice(0, 20).filter(lipLike).length, backLip = sl.slice(-20).filter(lipLike).length;
  if (!P.flipNose && backLip > frontLip + 2) {
    return processImport(raw, { ...P, flipNose: true });
  }
  // bavette : tranches avant fines et larges
  let lip = null;
  let iNose = valid.length ? sl.indexOf(valid[0]) : 0;
  if (P.lipAuto) {
    let i = iNose, last = -1;
    while (i < nb * 0.45 && (lipLike(sl[i]) || sl[i].area === 0)) { if (sl[i].area > 0) last = i; i++; }
    if (last - iNose >= 3 && (sl[last].x - sl[iNose].x) > 0.05 * (xmax - xmin)) {
      const lipSl = sl.slice(iNose, last + 1).filter((q) => q.area > 0);
      const n = lipSl.length;
      const mxs = lipSl.reduce((a, q) => a + q.x, 0) / n, mys = lipSl.reduce((a, q) => a + (q.top + q.bot) / 2, 0) / n;
      let num = 0, den = 0;
      for (const q of lipSl) { num += (q.x - mxs) * ((q.top + q.bot) / 2 - mys); den += (q.x - mxs) ** 2; }
      const slope = den > 0 ? num / den : 0;
      const ang = Math.max(3, Math.min(85, (Math.atan(Math.abs(slope)) * 180) / Math.PI));
      const thk = lipSl.map(thick).sort((p, q) => p - q)[Math.floor(n / 2)];
      lip = {
        xStart: sl[iNose].x, xEnd: sl[last].x + dx / 2,
        angle: Math.round(ang),
        width: Math.round(2 * Math.max(...lipSl.map((q) => q.zmax)) * 10) / 10,
        thickness: Math.max(0.6, Math.min(6, Math.round(thk * Math.cos((ang * Math.PI) / 180) * 10) / 10)),
        slope, yAt: (x) => mys + slope * (x - mxs),
      };
      iNose = last + 1;
      while (iNose < nb && sl[iNose].area === 0) iNose++;
    }
  }
  // corps : de iNose à la dernière tranche pleine
  let iTail = nb - 1;
  while (iTail > iNose && sl[iTail].area === 0) iTail--;
  const body = sl.slice(iNose, iTail + 1).filter((q) => q.area > 0);
  const xNose = body[0].x - dx / 2, xTail = body[body.length - 1].x + dx / 2;
  const L = xTail - xNose;
  const big = body.reduce((m, q) => (q.area > m.area ? q : m), body[0]);
  const yAxis = (big.top + big.bot) / 2;
  const zAxis = (b.min[2] + b.max[2]) / 2;
  // recentrage : nez du corps en x = 0, axe en y = 0, symétrie en z = 0
  const shift = (x, y, z, o) => { o[0] = x - xNose; o[1] = y - yAxis; o[2] = z - zAxis; };
  const finalSoup = mapSoup(s, shift);
  const finalOuter = mapSoup(outerSoup, shift);
  const rc = rayColumns(finalSoup); // matière (parité) : coque réelle si le modèle est creux
  const rcOuter = hollowModel ? rayColumns(finalOuter) : rc; // enveloppe extérieure : eau déplacée

  // profil paramétrique équivalent (pour placer quincaillerie, yeux, lest, et pour la soufflerie)
  const H = Math.max(...body.map(thick));
  const W = 2 * Math.max(...body.map((q) => q.zmax));
  const K = 36;
  const top = [], bottom = [], plan = [];
  let ratioSum = 0, ratioN = 0;
  for (let i = 0; i < K; i++) {
    const u = i / (K - 1);
    const x = xNose + u * L;
    const q = body.reduce((m, r) => (Math.abs(r.x - x) < Math.abs(m.x - x) ? r : m), body[0]);
    top.push([u, Math.max(0.01, (q.top - yAxis) / H)]);
    bottom.push([u, Math.max(0.01, (yAxis - q.bot) / H)]);
    plan.push([u, Math.max(0.01, q.zmax / (W / 2))]);
    if (u > 0.2 && u < 0.8) { ratioSum += q.area / (thick(q) * 2 * q.zmax); ratioN++; }
  }
  const r = ratioN ? ratioSum / ratioN : Math.PI / 4;
  let lo = 1.6, hi = 6;
  for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (seRatio(m) < r) lo = m; else hi = m; }
  const squareness = Math.round(((lo + hi) / 2) * 100) / 100;

  let lipParams = null;
  if (lip) {
    const lipLen = (lip.xEnd - lip.xStart) / Math.cos((lip.angle * Math.PI) / 180);
    const botNose = Math.max(0.5, yAxis - body[0].bot);
    const rootY = lip.yAt(xNose) - yAxis;
    lipParams = {
      enabled: true, length: Math.round(lipLen * 10) / 10, width: lip.width, thickness: lip.thickness, angle: lip.angle,
      shape: 'round', posU: 0.02, rootDepth: Math.max(0, Math.min(1, -rootY / botNose)), scoop: 0, rib: 0, rootFlare: 0.4,
    };
  }

  return {
    soup: finalSoup, outerSoup: finalOuter, rc, rcOuter, unit, mirrored, hollowModel, triangles: finalSoup.length / 9,
    lip: lipParams,
    body: { length: Math.round(L * 10) / 10, height: Math.round(H * 10) / 10, width: Math.round(W * 10) / 10, squareness, noseRound: 0.02, tailRound: 0.02, backWidth: 1, bellyWidth: 1, keel: 0, cup: 0, top, bottom, plan },
    area: soupArea(finalOuter),
    bounds: bounds(finalSoup),
  };
}
