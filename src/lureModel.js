// Construction du modèle 3D affiché (corps peint, bavette, yeux, quincaillerie).
import * as THREE from 'three';
import {
  buildBodyGeometry, buildLipGeometry, lineTiePoint, hangerPoints, makeProfile, surfaceNormal,
} from './geometry.js';
import { HOOK_SIZES } from './design.js';

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

export function makeTreble(size, mat = metal) {
  const hs = HOOK_SIZES[size] || HOOK_SIZES[4];
  const len = hs.len;
  const wire = Math.max(0.32, len * 0.032);
  const gap = len * 0.36;
  const grp = new THREE.Group();
  const eyeR = wire * 2.3;
  const eye = new THREE.Mesh(new THREE.TorusGeometry(eyeR, wire, 8, 24), mat);
  eye.rotation.y = Math.PI / 2;
  eye.position.y = -eyeR;
  grp.add(eye);
  const shankTop = -eyeR * 2, shankBot = -len * 0.78;
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(wire * 1.35, wire * 1.35, shankTop - shankBot, 10), mat);
  shank.position.y = (shankTop + shankBot) / 2;
  grp.add(shank);
  const r = gap / 2;
  const pts = [new THREE.Vector3(0, shankTop - len * 0.2, 0), new THREE.Vector3(0, shankBot, 0)];
  for (let k = 1; k <= 8; k++) {
    const a = Math.PI + (k / 8) * Math.PI;
    pts.push(new THREE.Vector3(r + Math.cos(a) * r, shankBot + Math.sin(a) * r, 0));
  }
  pts.push(new THREE.Vector3(gap * 0.98, shankBot + len * 0.18, 0));
  pts.push(new THREE.Vector3(gap * 0.86, shankBot + len * 0.32, 0));
  const curve = new THREE.CatmullRomCurve3(pts);
  const hookGeo = new THREE.TubeGeometry(curve, 40, wire, 6, false);
  const barbGeo = new THREE.ConeGeometry(wire * 1.6, len * 0.09, 8);
  for (let i = 0; i < 3; i++) {
    const h = new THREE.Mesh(hookGeo, mat);
    const barb = new THREE.Mesh(barbGeo, mat);
    barb.position.set(gap * 0.84, shankBot + len * 0.33, 0);
    barb.rotation.z = 0.25;
    const arm = new THREE.Group();
    arm.add(h, barb);
    arm.rotation.y = (i / 3) * Math.PI * 2 + Math.PI / 6;
    grp.add(arm);
  }
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

export function buildLure(design, texture, opts = {}) {
  const { hardware = true, simpleLip = false } = opts;
  const group = new THREE.Group();
  group.name = 'lure';
  const P = makeProfile(design);
  const bodyGeo = buildBodyGeometry(design, opts.nu || 150, opts.nt || 112);
  const body = new THREE.Mesh(bodyGeo, makeBodyMaterial(design, texture));
  body.name = 'body';
  body.castShadow = true;
  group.add(body);

  if (design.lip.enabled) {
    const lipGeo = buildLipGeometry(design);
    const lipMat = design.lip.clear
      ? (simpleLip
        ? new THREE.MeshPhysicalMaterial({ color: 0xeef6ff, roughness: 0.05, transparent: true, opacity: 0.45, clearcoat: 1 })
        : new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, transmission: 0.92, thickness: design.lip.thickness, ior: 1.58, clearcoat: 1, transparent: true }))
      : new THREE.MeshPhysicalMaterial({ color: design.lip.color, roughness: 0.25, clearcoat: 1 });
    const lip = new THREE.Mesh(lipGeo, lipMat);
    lip.name = 'lip';
    group.add(lip);
  }

  if (design.eyes.enabled) {
    const r = design.eyes.size / 2;
    const geo = eyeGeometry(r);
    const mat = new THREE.MeshPhysicalMaterial({ map: eyeTexture(design.eyes.iris, design.eyes.pupil), roughness: 0.1, clearcoat: 1 });
    for (const sgn of [1, -1]) {
      const th = sgn > 0 ? design.eyes.theta : Math.PI * 2 - design.eyes.theta;
      const { p, n } = surfaceNormal(P, Math.max(0.03, Math.min(0.5, design.eyes.u)), th);
      const eye = new THREE.Mesh(geo, mat);
      eye.position.copy(p).addScaledVector(n, -r * 0.08);
      eye.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      eye.name = 'eye';
      group.add(eye);
    }
  }

  const hookPivots = [];
  if (hardware) {
    const tie = lineTiePoint(design);
    const ringR = 2.2;
    const tieRing = splitRing(ringR, 0.32);
    tieRing.position.copy(tie.point).addScaledVector(tie.axis, ringR * 0.8);
    tieRing.rotation.z = Math.atan2(tie.axis.y, tie.axis.x) - Math.PI / 2;
    group.add(tieRing);
    const eyelet = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.35, 8, 20), metal);
    eyelet.position.copy(tie.point);
    group.add(eyelet);

    for (const h of hangerPoints(design)) {
      const hs = HOOK_SIZES[h.size] || HOOK_SIZES[4];
      const pivot = new THREE.Group();
      pivot.position.copy(h.point);
      const screw = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.33, 8, 20), metal);
      screw.position.y = h.kind === 'tail' ? 0 : 0.2;
      if (h.kind === 'tail') screw.rotation.z = Math.PI / 2;
      pivot.add(screw);
      const rr = hs.ring / 2;
      const ring = splitRing(rr, Math.max(0.25, rr * 0.12));
      ring.position.set(h.kind === 'tail' ? rr : 0, h.kind === 'tail' ? 0 : -rr, -0.25);
      ring.rotation.y = Math.PI / 2;
      pivot.add(ring);
      const treble = makeTreble(h.size, opts.blackHooks ? darkMetal : metal);
      treble.position.set(h.kind === 'tail' ? rr * 2 : 0, h.kind === 'tail' ? 0 : -rr * 2, 0);
      pivot.add(treble);
      pivot.userData.kind = h.kind;
      hookPivots.push(pivot);
      group.add(pivot);
    }
  }
  group.userData = { body, hookPivots, profile: P };
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
