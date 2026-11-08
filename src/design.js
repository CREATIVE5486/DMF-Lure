// Modèle de données d'un leurre. Toutes les longueurs sont en millimètres, les masses en grammes.

export const DESIGN_VERSION = 1;

export const HOOK_SIZES = {
  // taille d'hameçon triple : longueur hors-tout (mm), masse (g), anneau brisé (mm, g)
  1: { len: 29, mass: 1.35, ring: 7, ringMass: 0.3 },
  2: { len: 25, mass: 0.95, ring: 6, ringMass: 0.22 },
  4: { len: 20, mass: 0.6, ring: 5, ringMass: 0.15 },
  6: { len: 16, mass: 0.38, ring: 4.5, ringMass: 0.11 },
  8: { len: 13, mass: 0.25, ring: 4, ringMass: 0.08 },
  10: { len: 11, mass: 0.17, ring: 3.5, ringMass: 0.06 },
};

export const MATERIALS = {
  PLA: { density: 1.24, label: 'PLA' },
  PETG: { density: 1.27, label: 'PETG' },
  ABS: { density: 1.04, label: 'ABS' },
  ASA: { density: 1.07, label: 'ASA' },
  RESIN: { density: 1.15, label: 'Résine (SLA)' },
  TPU: { density: 1.21, label: 'TPU (souple)' },
};

export const BALLAST_MATERIALS = {
  lead: { density: 11.34, label: 'Plomb' },
  tungsten: { density: 19.3, label: 'Tungstène' },
  steel: { density: 7.85, label: 'Acier (billes)' },
};

export function baseDesign() {
  return {
    version: DESIGN_VERSION,
    name: 'Crank shad',
    body: {
      length: 60,
      height: 24,
      width: 17,
      squareness: 2.2,
      noseRound: 0.15,
      tailRound: 0.12,
      top: [[0, 0.42], [0.22, 0.6], [0.48, 0.6], [0.78, 0.4], [1, 0.2]],
      bottom: [[0, 0.32], [0.3, 0.44], [0.55, 0.42], [0.85, 0.22], [1, 0.12]],
      plan: [[0, 0.62], [0.3, 1], [0.6, 0.88], [0.88, 0.45], [1, 0.3]],
    },
    lip: {
      enabled: true,
      length: 17,
      width: 14,
      thickness: 1.2,
      angle: 35,
      shape: 'round',
      posU: 0.05,
      rootDepth: 0.45,
      clear: true,
      color: '#e9dfb8',
    },
    lineTie: { mode: 'nose', lipPos: 0.35 },
    hooks: { belly: [{ u: 0.4, size: 4 }], tail: { enabled: true, size: 4 } },
    eyes: { enabled: true, u: 0.12, theta: 0.95, size: 6, iris: '#f6c800', pupil: '#111111' },
    ballast: { grams: 4.2, u: 0.42, material: 'tungsten' },
    print: { material: 'PLA', wall: 1.2, infill: 0, coat: 0.12 },
    finish: { roughness: 0.22, metalness: 0.05, clearcoat: 1 },
    paintPreset: 'chromeShad',
  };
}

function merge(base, over) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = merge(out[k], v);
    } else {
      out[k] = structuredClone(v);
    }
  }
  return out;
}

export const PRESETS = [
  {
    id: 'shad',
    name: { fr: 'Crankbait shad', en: 'Shad crankbait' },
    desc: { fr: 'Polyvalent, 1,5–2,5 m', en: 'All-round, 5–8 ft' },
    over: {},
  },
  {
    id: 'deep',
    name: { fr: 'Plongeur profond', en: 'Deep diver' },
    desc: { fr: 'Grande bavette, 3–5 m', en: 'Long bill, 10–16 ft' },
    over: {
      name: 'Deep diver',
      body: {
        length: 66, height: 25, width: 18, noseRound: 0.16,
        top: [[0, 0.4], [0.25, 0.58], [0.5, 0.58], [0.8, 0.38], [1, 0.2]],
        bottom: [[0, 0.34], [0.3, 0.44], [0.55, 0.42], [0.85, 0.22], [1, 0.12]],
      },
      lip: { length: 30, width: 17, angle: 18, shape: 'round', posU: 0.06, rootDepth: 0.35, thickness: 1.5 },
      lineTie: { mode: 'lip', lipPos: 0.42 },
      hooks: { belly: [{ u: 0.38, size: 4 }], tail: { enabled: true, size: 4 } },
      ballast: { grams: 4.5, u: 0.4 },
      paintPreset: 'citrusShad',
    },
  },
  {
    id: 'square',
    name: { fr: 'Square bill', en: 'Square bill' },
    desc: { fr: 'Rebondit sur les obstacles, 0,5–1,5 m', en: 'Deflects off cover, 2–5 ft' },
    over: {
      name: 'Square bill',
      body: {
        length: 58, height: 25, width: 18, squareness: 2.6, noseRound: 0.18,
        top: [[0, 0.45], [0.25, 0.62], [0.5, 0.6], [0.8, 0.4], [1, 0.22]],
        bottom: [[0, 0.36], [0.3, 0.44], [0.55, 0.4], [0.85, 0.22], [1, 0.12]],
      },
      lip: { length: 13, width: 16, angle: 48, shape: 'square', posU: 0.04, rootDepth: 0.4, thickness: 1.4 },
      lineTie: { mode: 'nose' },
      ballast: { grams: 5, u: 0.4 },
      paintPreset: 'redCraw',
    },
  },
  {
    id: 'flat',
    name: { fr: 'Flat side', en: 'Flat side' },
    desc: { fr: 'Nage serrée, eaux froides', en: 'Tight wobble, cold water' },
    over: {
      name: 'Flat side',
      body: {
        length: 62, height: 26, width: 11, squareness: 3.4, noseRound: 0.14,
        top: [[0, 0.42], [0.25, 0.62], [0.5, 0.6], [0.8, 0.4], [1, 0.2]],
        bottom: [[0, 0.32], [0.3, 0.42], [0.55, 0.4], [0.85, 0.22], [1, 0.12]],
        plan: [[0, 0.7], [0.3, 1], [0.6, 0.95], [0.9, 0.6], [1, 0.4]],
      },
      lip: { length: 15, width: 12, angle: 38, shape: 'coffin', thickness: 1.1 },
      ballast: { grams: 2.6 },
      paintPreset: 'sexyShad',
    },
  },
  {
    id: 'lipless',
    name: { fr: 'Lipless vibrant', en: 'Lipless rattlebait' },
    desc: { fr: 'Coulant, vibrations', en: 'Sinking, vibration' },
    over: {
      name: 'Lipless',
      body: {
        length: 64, height: 30, width: 12, squareness: 2.8, noseRound: 0.2, tailRound: 0.1,
        top: [[0, 0.25], [0.2, 0.56], [0.45, 0.62], [0.8, 0.42], [1, 0.25]],
        bottom: [[0, 0.3], [0.3, 0.42], [0.6, 0.38], [0.9, 0.2], [1, 0.12]],
        plan: [[0, 0.6], [0.3, 1], [0.6, 0.92], [0.9, 0.55], [1, 0.35]],
      },
      lip: { enabled: false },
      lineTie: { mode: 'back' },
      ballast: { grams: 9, u: 0.4 },
      paintPreset: 'chartreuseShad',
    },
  },
  {
    id: 'jerk',
    name: { fr: 'Jerkbait suspending', en: 'Suspending jerkbait' },
    desc: { fr: 'Minnow fin, twitch & pause', en: 'Slim minnow, twitch & pause' },
    over: {
      name: 'Jerkbait',
      body: {
        length: 100, height: 17, width: 11, squareness: 2.1, noseRound: 0.07, tailRound: 0.06,
        top: [[0, 0.42], [0.15, 0.58], [0.5, 0.56], [0.85, 0.34], [1, 0.2]],
        bottom: [[0, 0.38], [0.25, 0.46], [0.55, 0.42], [0.85, 0.24], [1, 0.14]],
        plan: [[0, 0.7], [0.25, 1], [0.6, 0.85], [0.9, 0.45], [1, 0.3]],
      },
      lip: { length: 12, width: 9, angle: 50, shape: 'round', thickness: 1.0, posU: 0.03, rootDepth: 0.4 },
      lineTie: { mode: 'nose' },
      hooks: { belly: [{ u: 0.3, size: 6 }, { u: 0.62, size: 6 }], tail: { enabled: true, size: 6 } },
      eyes: { u: 0.07, size: 6.5 },
      ballast: { grams: 3.7, u: 0.38 },
      paintPreset: 'ghostMinnow',
    },
  },
  {
    id: 'wake',
    name: { fr: 'Wakebait', en: 'Wakebait' },
    desc: { fr: 'Nage en surface, sillage', en: 'Surface wake' },
    over: {
      name: 'Wakebait',
      body: {
        length: 70, height: 30, width: 24, squareness: 2.0, noseRound: 0.2, tailRound: 0.14,
        top: [[0, 0.45], [0.25, 0.6], [0.5, 0.58], [0.8, 0.4], [1, 0.22]],
        bottom: [[0, 0.3], [0.3, 0.4], [0.55, 0.38], [0.85, 0.22], [1, 0.12]],
      },
      lip: { length: 18, width: 26, angle: 78, shape: 'square', posU: 0.05, rootDepth: 0.2, thickness: 1.5 },
      lineTie: { mode: 'nose' },
      hooks: { belly: [{ u: 0.4, size: 2 }], tail: { enabled: true, size: 2 } },
      ballast: { grams: 0 },
      paintPreset: 'perch',
    },
  },
  {
    id: 'micro',
    name: { fr: 'Micro crank', en: 'Micro crank' },
    desc: { fr: 'Truite & perche, 38 mm', en: 'Trout & perch, 1.5"' },
    over: {
      name: 'Micro crank',
      body: { length: 38, height: 17, width: 13 },
      lip: { length: 11, width: 9, angle: 32, thickness: 0.9 },
      hooks: { belly: [{ u: 0.42, size: 10 }], tail: { enabled: true, size: 10 } },
      eyes: { size: 4.2 },
      ballast: { grams: 1.6 },
      print: { wall: 0.9 },
      paintPreset: 'firetiger',
    },
  },
];

export function presetDesign(id) {
  const p = PRESETS.find((x) => x.id === id) || PRESETS[0];
  return merge(baseDesign(), p.over);
}

// Rend un design importé robuste (champs manquants, anciens fichiers…)
export function normalizeDesign(d) {
  const base = baseDesign();
  if (!d || typeof d !== 'object') return base;
  const out = merge(base, d);
  const pts = (arr, def) => (Array.isArray(arr) && arr.length >= 2 && arr.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) ? arr : def);
  out.body.top = pts(out.body.top, base.body.top);
  out.body.bottom = pts(out.body.bottom, base.body.bottom);
  out.body.plan = pts(out.body.plan, base.body.plan);
  if (!Array.isArray(out.hooks.belly)) out.hooks.belly = base.hooks.belly;
  out.hooks.belly = out.hooks.belly.filter((h) => h && Number.isFinite(h.u)).map((h) => ({ u: h.u, size: HOOK_SIZES[h.size] ? h.size : 4 }));
  if (!HOOK_SIZES[out.hooks.tail.size]) out.hooks.tail.size = 4;
  if (!MATERIALS[out.print.material]) out.print.material = 'PLA';
  if (!BALLAST_MATERIALS[out.ballast.material]) out.ballast.material = 'tungsten';
  out.version = DESIGN_VERSION;
  return out;
}
