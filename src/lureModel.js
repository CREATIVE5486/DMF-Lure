// Construction du modèle 3D affiché (corps peint, bavette, yeux, quincaillerie).
import * as THREE from 'three';
import {
  buildBodyGeometry, buildLipGeometry, lineTiePoint, hangerPoints, makeProfile, surfaceNormal, buildPaddleSoup, smoothGeometry, ringSpec,
} from './geometry.js';

const metal = new THREE.MeshStandardMaterial({ color: 0xc7ccd3, metalness: 1, roughness: 0.22 });
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 1, roughness: 0.32 });

const eyeTexCache = new Map();
function eyeTexture(iris, pupil) {
  const key = iris + pupil;
  if (eyeTexCache.has(key)) return eyeTexCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  grad.addColorStop(0, iris);
  grad.addColorStop(0.75, iris);
  grad.addColorStop(1, shade(iris, -0.45));
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  // stries de l'iris
  g.globalAlpha = 0.18;
  g.strokeStyle = shade(iris, -0.6);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 52, 128 + Math.sin(a) * 52);
    g.lineTo(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = pupil;
  g.beginPath();
  g.arc(128, 128, 54, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.ellipse(100, 98, 16, 11, -0.5, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  eyeTexCache.set(key, t);
  return t;
}

export function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return '#' + c.getHexString();
}

function eyeGeometry(r) {
  const g = new THREE.SphereGeometry(r, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * r) + 0.5, p.getZ(i) / (2 * r) + 0.5);
  g.scale(1, 0.42, 1);
  return g;
}

function splitRing(radius, wire, mat = metal) {
  const grp = new THREE.Group();
  const geo = new THREE.TorusGeometry(radius, wire, 8, 40);
  const a = new THREE.Mesh(geo, mat);
  const b = new THREE.Mesh(geo, mat);
  b.position.z = wire * 1.6;
  grp.add(a, b);
  return grp;
}

function hookCurve(len, gap, shankBot, shankTop, single = false) {
  const r = gap / 2;
  const pts = [new THREE.Vector3(0, shankTop, 0), new THREE.Vector3(0, shankBot, 0)];
  for (let k = 1; k <= 10; k++) {
    const a = Math.PI + (k / 10) * Math.PI;
    pts.push(new THREE.Vector3(r + Math.cos(a) * r, shankBot + Math.sin(a) * r, 0));
  }
  pts.push(new THREE.Vector3(gap * 0.98, shankBot + len * (single ? 0.22 : 0.18), 0));
  pts.push(new THREE.Vector3(gap * 0.8, shankBot + len * (single ? 0.4 : 0.32), 0));
  return new THREE.CatmullRomCurve3(pts);
}

// Triple : spec = { len, gap }
export function makeTreble(spec, mat = metal) {
  const len = spec.len, gap = spec.gap;
  const wire = Math.max(0.32, len * 0.034);
  const grp = new THREE.Group();
  const eyeR = wire * 2.3;
  const eye = new THREE.Mesh(new THREE.TorusGeometry(eyeR, wire, 8, 24), mat);
  eye.rotation.y = Math.PI / 2;
  eye.position.y = -eyeR;
  grp.add(eye);
  const shankTop = -eyeR * 2, shankBot = -len * 0.8;
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(wire * 1.4, wire * 1.4, shankTop - shankBot, 10), mat);
  shank.position.y = (shankTop + shankBot) / 2;
  grp.add(shank);
  const hookGeo = new THREE.TubeGeometry(hookCurve(len, gap, shankBot, shankTop - len * 0.15), 44, wire, 7, false);
  const barbGeo = new THREE.ConeGeometry(wire * 1.6, len * 0.09, 8);
  for (let i = 0; i < 3; i++) {
    const h = new THREE.Mesh(hookGeo, mat);
    const barb = new THREE.Mesh(barbGeo, mat);
    barb.position.set(gap * 0.78, shankBot + len * 0.33, 0);
    barb.rotation.z = 0.35;
    const arm = new THREE.Group();
    arm.add(h, barb);
    arm.rotation.y = (i / 3) * Math.PI * 2 + Math.PI / 6;
    grp.add(arm);
  }
  grp.userData.length = len;
  return grp;
}

// Simple (type « Lone Diablo ») : œillet en haut, pointe vers l'avant
export function makeSingle(spec, mat = metal) {
  const len = spec.len, gap = spec.gap;
  const wire = Math.max(0.45, len * 0.045);
  const grp = new THREE.Group();
  const eyeR = wire * 2.4;
  const eye = new THREE.Mesh(new THREE.TorusGeometry(eyeR, wire, 8, 24), mat);
  eye.rotation.y = Math.PI / 2;
  eye.position.y = -eyeR;
  grp.add(eye);
  const shankTop = -eyeR * 2, shankBot = -len * 0.82;
  const geo = new THREE.TubeGeometry(hookCurve(len, gap, shankBot, shankTop, true), 48, wire, 8, false);
  const h = new THREE.Mesh(geo, mat);
  const barb = new THREE.Mesh(new THREE.ConeGeometry(wire * 1.5, len * 0.1, 8), mat);
  barb.position.set(gap * 0.78, shankBot + len * 0.4, 0);
  barb.rotation.z = 0.4;
  const arm = new THREE.Group();
  arm.add(h, barb);
  arm.rotation.y = -Math.PI / 2; // pointe tournée vers l'avant du leurre
  grp.add(arm);
  grp.userData.length = len;
  return grp;
}

export function makeBodyMaterial(design, texture) {
  return new THREE.MeshPhysicalMaterial({
    map: texture || null,
    color: texture ? 0xffffff : 0xe9e4d6,
    roughness: design.finish?.roughness ?? 0.22,
    metalness: design.finish?.metalness ?? 0.05,
    clearcoat: design.finish?.clearcoat ?? 1,
    clearcoatRoughness: 0.04,
  });
}

// Jupe de traîne : lanières de vinyle animées
function buildSkirt(design, P) {
  const sk = design.features.skirt;
  const grp = new THREE.Group();
  const n = Math.max(6, Math.min(64, Math.round(sk.strands)));
  const seg = 18;
  const len = Math.max(20, sk.length);
  const x0 = P.L - 3;
  const yc = (P.top(0.96) - P.bot(0.96)) / 2;
  const r0 = Math.max(3, Math.min(P.top(0.96), P.hw(0.96)) * 0.9);
  const strands = [];
  const mats = [
    new THREE.MeshPhysicalMaterial({ color: sk.color1, roughness: 0.35, side: THREE.DoubleSide, transparent: true, opacity: 0.88, sheen: 0.6 }),
    new THREE.MeshPhysicalMaterial({ color: sk.color2, roughness: 0.35, side: THREE.DoubleSide, transparent: true, opacity: 0.88, sheen: 0.6 }),
    new THREE.MeshPhysicalMaterial({ color: 0xdfe8ee, roughness: 0.15, metalness: 0.9, side: THREE.DoubleSide, iridescence: 1 }),
  ];
  for (let k = 0; k < n; k++) {
    const phi = (k / n) * Math.PI * 2 + (k % 2) * 0.07;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array((seg + 1) * 2 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idx = [];
    for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, mats[k % 7 === 3 ? 2 : k % 2]);
    mesh.frustumCulled = false;
    grp.add(mesh);
    strands.push({ mesh, phi, w: 3.6 + (k % 3) * 0.6, len: len * (0.9 + ((k * 37) % 10) / 50), seed: k * 1.7 });
  }
  const update = (t, speed = 0) => {
    const spread = 0.06 + 0.25 / (1 + speed * 2);
    for (const st of strands) {
      const pos = st.mesh.geometry.attributes.position.array;
      const cy = Math.cos(st.phi), sz = Math.sin(st.phi);
      for (let i = 0; i <= seg; i++) {
        const s = i / seg;
        const wave = Math.sin(t * (6 + speed * 6) - s * 7 + st.seed) * s * (2 + 4 / (1 + speed));
        const droop = -s * s * st.len * 0.12 / (1 + speed * 3);
        const rr = r0 + s * st.len * spread;
        const x = x0 + s * st.len;
        const y = yc + cy * rr + droop + wave * -sz * 0.6;
        const z = sz * rr + wave * cy * 0.6;
        const hw = st.w / 2 * (1 - s * 0.4);
        pos.set([x, y - sz * hw, z + cy * hw], i * 6);
        pos.set([x, y + sz * hw, z - cy * hw], i * 6 + 3);
      }
      st.mesh.geometry.attributes.position.needsUpdate = true;
      st.mesh.geometry.computeVertexNormals();
    }
  };
  update(0, 0);
  grp.userData.update = update;
  grp.name = 'skirt';
  return grp;
}

export function buildLure(design, texture, opts = {}) {
  const { hardware = true, simpleLip = false } = opts;
  const group = new THREE.Group();
  group.name = 'lure';
  const P = makeProfile(design);
  const bodyGeo = buildBodyGeometry(design, opts.nu || 150, opts.nt || 112);
  const bodyMat = makeBodyMaterial(design, texture);
  if (opts.foil) {
    bodyMat.metalnessMap = opts.foil;
    bodyMat.roughnessMap = opts.foil;
    bodyMat.iridescenceMap = opts.foil;
    bodyMat.iridescence = 1;
    bodyMat.iridescenceIOR = 1.6;
    bodyMat.metalness = design.finish?.metalness ?? 0.9;
    bodyMat.roughness = Math.max(0.02, design.finish?.roughness ?? 0.2);
  }
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.name = 'body';
  body.castShadow = true;
  group.add(body);

  if (design.lip.enabled) {
    const lipGeo = buildLipGeometry(design);
    const lipMat = design.lip.clear
      ? (simpleLip
        ? new THREE.MeshPhysicalMaterial({ color: 0xeef6ff, roughness: 0.05, transparent: true, opacity: 0.5, clearcoat: 1 })
        : new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, transmission: 0.9, thickness: design.lip.thickness * 2, ior: 1.58, clearcoat: 1, transparent: true }))
      : new THREE.MeshPhysicalMaterial({ color: design.lip.color, roughness: 0.25, clearcoat: 1 });
    const lip = new THREE.Mesh(lipGeo, lipMat);
    lip.name = 'lip';
    group.add(lip);
  }

  let paddle = null;
  const padSoup = buildPaddleSoup(design);
  if (padSoup) {
    const g = smoothGeometry(padSoup);
    const pivotX = P.L - 2;
    g.translate(-pivotX, 0, 0);
    paddle = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: design.features.paddle.color || '#c9d2d6', roughness: 0.45, clearcoat: 0.3 }));
    paddle.position.x = pivotX;
    paddle.name = 'paddle';
    group.add(paddle);
  }

  let skirt = null;
  if (design.features?.skirt?.enabled) {
    skirt = buildSkirt(design, P);
    group.add(skirt);
  }

  if (design.eyes.enabled) {
    const r = design.eyes.size / 2;
    const geo = eyeGeometry(r);
    const mat = new THREE.MeshPhysicalMaterial({ map: eyeTexture(design.eyes.iris, design.eyes.pupil), roughness: 0.1, clearcoat: 1 });
    for (const sgn of [1, -1]) {
      const th = sgn > 0 ? design.eyes.theta : Math.PI * 2 - design.eyes.theta;
      const { p, n } = surfaceNormal(P, Math.max(0.03, Math.min(0.6, design.eyes.u)), th);
      const eye = new THREE.Mesh(geo, mat);
      eye.position.copy(p).addScaledVector(n, -r * 0.08);
      eye.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      eye.name = 'eye';
      group.add(eye);
    }
  }

  const hookPivots = [];
  if (hardware) {
    const rs = ringSpec(design);
    const tie = lineTiePoint(design);
    const ringR = rs.dia / 2;
    const tieRing = splitRing(ringR, rs.wire / 2);
    tieRing.position.copy(tie.point).addScaledVector(tie.axis, ringR * 0.8);
    tieRing.rotation.z = Math.atan2(tie.axis.y, tie.axis.x) - Math.PI / 2;
    group.add(tieRing);
    const eyelet = new THREE.Mesh(new THREE.TorusGeometry(Math.max(1.1, rs.dia * 0.16), Math.max(0.35, rs.wire * 0.45), 8, 20), metal);
    eyelet.position.copy(tie.point);
    group.add(eyelet);

    for (const h of hangerPoints(design)) {
      const pivot = new THREE.Group();
      pivot.position.copy(h.point);
      const screw = new THREE.Mesh(new THREE.TorusGeometry(Math.max(1, rs.dia * 0.15), Math.max(0.33, rs.wire * 0.4), 8, 20), metal);
      screw.position.y = h.kind === 'tail' ? 0 : 0.2;
      if (h.kind === 'tail') screw.rotation.z = Math.PI / 2;
      pivot.add(screw);
      const rr = rs.dia / 2;
      const trail = h.kind === 'tail' ? (h.trail || 0) : 0;
      if (trail > 0) {
        // bas de ligne rigide (câble) entre la tête et l'hameçon
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, trail, 8), metal);
        cable.rotation.z = Math.PI / 2;
        cable.position.x = trail / 2;
        pivot.add(cable);
      }
      const ring = splitRing(rr, rs.wire / 2);
      ring.position.set(h.kind === 'tail' ? rr + trail : 0, h.kind === 'tail' ? 0 : -rr, -0.25);
      ring.rotation.y = Math.PI / 2;
      pivot.add(ring);
      const hookMesh = h.type === 'single' ? makeSingle(h.spec, opts.blackHooks ? darkMetal : metal) : makeTreble(h.spec, opts.blackHooks ? darkMetal : metal);
      hookMesh.position.set(h.kind === 'tail' ? rr * 2 + trail : 0, h.kind === 'tail' ? 0 : -rr * 2, 0);
      pivot.add(hookMesh);
      pivot.userData.kind = h.kind;
      hookPivots.push(pivot);
      group.add(pivot);
    }
  }
  group.userData = { body, hookPivots, profile: P, skirt, paddle };
  return group;
}

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m !== metal && m !== darkMetal) m.dispose();
    }
  });
}
