// Modèle de données d'un leurre. Toutes les longueurs sont en millimètres, les masses en grammes.

export const DESIGN_VERSION = 2;

/* ----------------------------- Quincaillerie -----------------------------
   Sources : tableaux fournis (pechextreme.com, discounttackle.com).
   len = hauteur/longueur hors-tout (mm), gap = ouverture (mm), mass = masse d'un hameçon (g). */
export const TREBLES = {
  '10': { len: 11, gap: 4, mass: 0.17, ref: 'Triple #10' },
  '8': { len: 13, gap: 5, mass: 0.25, ref: 'Triple #8' },
  '6': { len: 16, gap: 6, mass: 0.38, ref: 'Triple #6' },
  '4': { len: 20, gap: 7.5, mass: 0.6, ref: 'Triple #4' },
  '2': { len: 24.7, gap: 9.4, mass: 1.7, ref: 'Owner ST-66 #2' },
  '1': { len: 28.2, gap: 10.5, mass: 2.2, ref: 'Owner ST-66 #1' },
  '1/0': { len: 32.3, gap: 11.7, mass: 3.1, ref: 'Owner ST-66 1/0' },
  '2/0': { len: 35.7, gap: 13.4, mass: 4.7, ref: 'Owner ST-66 2/0' },
  '3/0': { len: 39.7, gap: 15.1, mass: 6.7, ref: 'Owner ST-66 3/0' },
  '4/0': { len: 47.9, gap: 17.5, mass: 9, ref: 'Owner ST-66 4/0' },
  '5/0': { len: 52.2, gap: 20.5, mass: 11.5, ref: 'Owner ST-66 5/0' },
};

export const SINGLES = {
  '1': { len: 26, gap: 13, mass: 1.0, ref: 'Simple #1' },
  '2/0': { len: 30.2, gap: 15.7, mass: 1.4, ref: 'BKK Lone Diablo 2/0' },
  '3/0': { len: 33.3, gap: 17, mass: 2.1, ref: 'BKK Lone Diablo 3/0' },
  '4/0': { len: 37, gap: 19.5, mass: 2.7, ref: 'BKK Lone Diablo 4/0' },
  '5/0': { len: 39.9, gap: 21.6, mass: 3.8, ref: 'BKK Lone Diablo 5/0' },
  '7/0': { len: 44.5, gap: 24.5, mass: 4.9, ref: 'BKK Lone Diablo 7/0' },
  '9/0': { len: 51.5, gap: 26.2, mass: 7, ref: 'BKK Lone Diablo 9/0' },
  '11/0': { len: 56.3, gap: 28.9, mass: 9.2, ref: 'BKK Lone Diablo 11/0' },
  '13/0': { len: 62, gap: 33.2, mass: 11.3, ref: 'BKK Lone Diablo 13/0' },
};

// Anneaux brisés (diamètre extérieur ≈ mm, fil ≈ mm, masse ≈ g, résistance lb)
export const SPLIT_RINGS = {
  hw2: { label: 'Owner Hyper Wire #2', dia: 5, wire: 0.5, mass: 0.1, lb: 35 },
  hw3: { label: 'Owner Hyper Wire #3', dia: 5.5, wire: 0.55, mass: 0.14, lb: 45 },
  hw4: { label: 'Owner Hyper Wire #4', dia: 6.5, wire: 0.65, mass: 0.2, lb: 50 },
  hw5: { label: 'Owner Hyper Wire #5', dia: 7.5, wire: 0.75, mass: 0.3, lb: 60 },
  hw6: { label: 'Owner Hyper Wire #6', dia: 8.5, wire: 0.85, mass: 0.45, lb: 70 },
  hw7: { label: 'Owner Hyper Wire #7', dia: 9.5, wire: 0.95, mass: 0.6, lb: 80 },
  hw8: { label: 'Owner Hyper Wire #8', dia: 10.5, wire: 1.05, mass: 0.85, lb: 120 },
  hw9: { label: 'Owner Hyper Wire #9', dia: 11.5, wire: 1.15, mass: 1.1, lb: 170 },
  hw10: { label: 'Owner Hyper Wire #10', dia: 12.5, wire: 1.25, mass: 1.4, lb: 220 },
  hw11: { label: 'Owner Hyper Wire #11', dia: 13.5, wire: 1.35, mass: 1.7, lb: 250 },
  ul5: { label: 'Owner Ultra #5', dia: 10, wire: 1.2, mass: 1.2, lb: 110 },
  ul6: { label: 'Owner Ultra #6', dia: 11, wire: 1.35, mass: 1.6, lb: 150 },
  ul7: { label: 'Owner Ultra #7', dia: 12.5, wire: 1.5, mass: 2.1, lb: 215 },
  ul8: { label: 'Owner Ultra #8', dia: 13.5, wire: 1.65, mass: 2.6, lb: 240 },
  ul9: { label: 'Owner Ultra #9', dia: 15, wire: 1.8, mass: 3.4, lb: 320 },
  ul10: { label: 'Owner Ultra #10', dia: 16.5, wire: 2, mass: 4.2, lb: 370 },
};

// Correspondance poids du leurre → quincaillerie (tableaux fournis)
export const HARDWARE_TABLE = [
  { max: 6, treble: '8', single: '1', ring: 'hw2', ringAlt: null, leader: '8–12 lb', strength: '≥ 25 lb' },
  { max: 10, treble: '6', single: '1', ring: 'hw2', ringAlt: null, leader: '12–20 lb', strength: '≥ 35 lb' },
  { max: 20, treble: '4', single: '1', ring: 'hw3', ringAlt: null, leader: '20–30 lb (9–14 kg)', strength: '≥ 45 lb (20 kg)' },
  { max: 25, treble: '2', single: '2/0', ring: 'hw4', ringAlt: null, leader: '30–40 lb (14–18 kg)', strength: '≥ 50 lb (23 kg)' },
  { max: 30, treble: '1', single: '3/0', ring: 'hw5', ringAlt: null, leader: '30–40 lb (14–18 kg)', strength: '≥ 50 lb (23 kg)' },
  { max: 45, treble: '1/0', single: '4/0', ring: 'hw6', ringAlt: null, leader: '40–60 lb (18–27 kg)', strength: '≥ 70 lb (32 kg)' },
  { max: 60, treble: '2/0', single: '5/0', ring: 'hw8', ringAlt: 'ul5', leader: '60–80 lb (27–36 kg)', strength: '≥ 110 lb (50 kg)' },
  { max: 80, treble: '3/0', single: '7/0', ring: 'hw9', ringAlt: 'ul6', leader: '80–100 lb (36–45 kg)', strength: '≥ 150 lb (68 kg)' },
  { max: 110, treble: '4/0', single: '9/0', ring: 'hw10', ringAlt: 'ul7', leader: '100–130 lb (45–59 kg)', strength: '≥ 220 lb (100 kg)' },
  { max: Infinity, treble: '5/0', single: '11/0', ring: 'ul9', ringAlt: 'ul9', leader: '130–200 lb (59–91 kg)', strength: '≥ 320 lb (145 kg)' },
];

export function hardwareFor(massG) {
  return HARDWARE_TABLE.find((r) => massG <= r.max) || HARDWARE_TABLE.at(-1);
}

export function hookSpec(type, size) {
  const t = type === 'single' ? SINGLES : TREBLES;
  return t[size] || t[Object.keys(t)[3]] || Object.values(t)[0];
}

export const MATERIALS = {
  PLA: { density: 1.24, label: 'PLA' },
  PETG: { density: 1.27, label: 'PETG' },
  ABS: { density: 1.04, label: 'ABS' },
  ASA: { density: 1.07, label: 'ASA' },
  RESIN: { density: 1.15, label: 'Résine (SLA / coulée)' },
  TPU: { density: 1.21, label: 'TPU (souple)' },
  SILICONE: { density: 1.1, label: 'Silicone / plastisol (coulé)' },
};

export const BALLAST_MATERIALS = {
  lead: { density: 11.34, label: 'Plomb' },
  tungsten: { density: 19.3, label: 'Tungstène' },
  steel: { density: 7.85, label: 'Acier (billes)' },
};

export const LURE_TYPES = {
  stickbait: { fr: 'Stickbait', en: 'Stickbait' },
  minnow: { fr: 'Minnow', en: 'Minnow' },
  deep: { fr: 'Grosse bavette', en: 'Deep diver' },
  bonito: { fr: 'Bonito', en: 'Bonito' },
  skirt: { fr: 'Jupe de traîne', en: 'Trolling skirt' },
  popper: { fr: 'Popper', en: 'Popper' },
  soft: { fr: 'Leurre souple', en: 'Soft lure' },
  imported: { fr: 'Modèle importé', en: 'Imported model' },
};

export function baseDesign() {
  return {
    version: DESIGN_VERSION,
    type: 'minnow',
    name: 'Minnow',
    body: {
      length: 120,
      height: 21,
      width: 15,
      squareness: 2.1,
      noseRound: 0.08,
      tailRound: 0.07,
      backWidth: 1,
      bellyWidth: 0.85,
      keel: 0,
      cup: 0,
      top: [[0, 0.42], [0.15, 0.58], [0.5, 0.56], [0.85, 0.34], [1, 0.2]],
      bottom: [[0, 0.38], [0.25, 0.46], [0.55, 0.42], [0.85, 0.24], [1, 0.14]],
      plan: [[0, 0.7], [0.25, 1], [0.6, 0.85], [0.9, 0.45], [1, 0.3]],
    },
    lip: {
      enabled: true,
      length: 14,
      width: 12,
      thickness: 1.6,
      angle: 28,
      shape: 'round',
      posU: 0.03,
      rootDepth: 0.4,
      scoop: 0.25,
      rib: 0.3,
      rootFlare: 0.6,
      clear: true,
      color: '#e9e6dd',
    },
    lineTie: { mode: 'nose', lipPos: 0.4 },
    hooks: {
      type: 'treble',
      auto: true,
      ring: 'hw3',
      belly: [{ u: 0.3, size: '4' }, { u: 0.62, size: '4' }],
      tail: { enabled: true, size: '4', trail: 0 },
    },
    features: {
      skirt: { enabled: false, length: 150, strands: 28, color1: '#29d17a', color2: '#f2e94a' },
      paddle: { enabled: false, size: 22 },
      leaderHole: { enabled: false, dia: 4 },
    },
    eyes: { enabled: true, u: 0.07, theta: 0.95, size: 7, iris: '#f6c800', pupil: '#111111' },
    ballast: { grams: 6, u: 0.4, material: 'tungsten' },
    print: { material: 'PLA', wall: 1.4, infill: 0, coat: 0.15, lipIntegrated: true },
    finish: { roughness: 0.2, metalness: 0.9, clearcoat: 1 },
    paintPreset: 'sardineHolo',
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
    id: 'stickbait',
    name: { fr: 'Stickbait flottant', en: 'Floating stickbait' },
    desc: { fr: 'Surface, walking the dog · 160 mm', en: 'Topwater, walk the dog · 160 mm' },
    over: {
      type: 'stickbait', name: 'Stickbait',
      body: {
        length: 160, height: 32, width: 27, squareness: 2.15, noseRound: 0.11, tailRound: 0.09, backWidth: 1.05, bellyWidth: 0.85,
        top: [[0, 0.32], [0.2, 0.5], [0.5, 0.52], [0.8, 0.36], [1, 0.16]],
        bottom: [[0, 0.36], [0.25, 0.5], [0.55, 0.47], [0.85, 0.26], [1, 0.12]],
        plan: [[0, 0.62], [0.25, 1], [0.55, 0.95], [0.85, 0.5], [1, 0.28]],
      },
      lip: { enabled: false },
      lineTie: { mode: 'nose' },
      hooks: { type: 'treble', belly: [{ u: 0.33, size: '1/0' }], tail: { enabled: true, size: '1/0', trail: 0 } },
      eyes: { u: 0.08, size: 9 },
      ballast: { grams: 9, u: 0.62, material: 'tungsten' },
      print: { wall: 1.8 },
      paintPreset: 'redOrange',
    },
  },
  {
    id: 'stickbait_sink',
    name: { fr: 'Stickbait coulant', en: 'Sinking stickbait' },
    desc: { fr: 'Sub-surface, nage en S · 140 mm', en: 'Sub-surface S-swim · 140 mm' },
    over: {
      type: 'stickbait', name: 'Stickbait coulant',
      body: {
        length: 140, height: 28, width: 20, squareness: 2.2, noseRound: 0.1, tailRound: 0.08, backWidth: 1, bellyWidth: 0.8,
        top: [[0, 0.34], [0.22, 0.52], [0.5, 0.53], [0.8, 0.36], [1, 0.16]],
        bottom: [[0, 0.36], [0.25, 0.5], [0.55, 0.47], [0.85, 0.26], [1, 0.12]],
        plan: [[0, 0.6], [0.25, 1], [0.55, 0.95], [0.85, 0.5], [1, 0.28]],
      },
      lip: { enabled: false },
      lineTie: { mode: 'nose' },
      hooks: { type: 'treble', belly: [{ u: 0.4, size: '1/0' }], tail: { enabled: true, size: '1/0', trail: 0 } },
      eyes: { u: 0.08, size: 8 },
      ballast: { grams: 30, u: 0.45, material: 'tungsten' },
      print: { wall: 1.8 },
      paintPreset: 'sardineHolo',
    },
  },
  {
    id: 'minnow',
    name: { fr: 'Minnow', en: 'Minnow' },
    desc: { fr: 'Petite bavette, 0,5–3 m · 120 mm', en: 'Small lip, 2–10 ft · 120 mm' },
    over: {},
  },
  {
    id: 'deep',
    name: { fr: 'Grosse bavette de traîne', en: 'Deep trolling diver' },
    desc: { fr: 'Type X-Rap Magnum, ~10 m à 4–8 nœuds', en: 'X-Rap Magnum style, ~30 ft at 4–8 kn' },
    over: {
      type: 'deep', name: 'Grosse bavette',
      body: {
        length: 160, height: 33, width: 26, squareness: 2.2, noseRound: 0.1, tailRound: 0.08, backWidth: 1, bellyWidth: 0.8,
        top: [[0, 0.36], [0.2, 0.52], [0.5, 0.5], [0.82, 0.34], [1, 0.16]],
        bottom: [[0, 0.38], [0.22, 0.5], [0.55, 0.46], [0.85, 0.26], [1, 0.12]],
        plan: [[0, 0.65], [0.25, 1], [0.55, 0.92], [0.85, 0.5], [1, 0.3]],
      },
      lip: { length: 58, width: 30, thickness: 3, angle: 10, shape: 'bill', posU: 0.04, rootDepth: 0.3, scoop: 0.55, rib: 0.7, rootFlare: 1 },
      lineTie: { mode: 'lip', lipPos: 0.5 },
      hooks: { type: 'treble', belly: [{ u: 0.36, size: '2/0' }], tail: { enabled: true, size: '2/0', trail: 0 } },
      eyes: { u: 0.07, size: 10 },
      ballast: { grams: 15, u: 0.36, material: 'tungsten' },
      print: { wall: 2 },
      paintPreset: 'orangeTroll',
    },
  },
  {
    id: 'bonito',
    name: { fr: 'Bonito', en: 'Bonito' },
    desc: { fr: 'Coulant lourd sans bavette · 170 mm', en: 'Heavy sinking lipless · 170 mm' },
    over: {
      type: 'bonito', name: 'Bonito',
      body: {
        length: 170, height: 40, width: 30, squareness: 2.15, noseRound: 0.14, tailRound: 0.06, backWidth: 1.1, bellyWidth: 0.75, keel: 0.25,
        top: [[0, 0.3], [0.18, 0.52], [0.42, 0.52], [0.8, 0.3], [1, 0.12]],
        bottom: [[0, 0.32], [0.2, 0.48], [0.45, 0.45], [0.82, 0.22], [1, 0.1]],
        plan: [[0, 0.6], [0.22, 1], [0.5, 0.88], [0.85, 0.42], [1, 0.22]],
      },
      lip: { enabled: false },
      lineTie: { mode: 'nose' },
      hooks: { type: 'single', belly: [{ u: 0.32, size: '7/0' }], tail: { enabled: true, size: '7/0', trail: 0 } },
      eyes: { u: 0.09, size: 13 },
      ballast: { grams: 40, u: 0.38, material: 'lead' },
      print: { wall: 2, infill: 100 },
      paintPreset: 'bonitoBlue',
    },
  },
  {
    id: 'skirt',
    name: { fr: 'Jupe de traîne', en: 'Trolling skirt' },
    desc: { fr: 'Tête + jupe vinyle, 7–14 nœuds', en: 'Head + vinyl skirt, 7–14 kn' },
    over: {
      type: 'skirt', name: 'Jupe de traîne',
      body: {
        length: 55, height: 30, width: 30, squareness: 2, noseRound: 0.05, tailRound: 0.03, backWidth: 1, bellyWidth: 1, cup: 5,
        top: [[0, 0.46], [0.3, 0.5], [0.7, 0.44], [1, 0.36]],
        bottom: [[0, 0.46], [0.3, 0.5], [0.7, 0.44], [1, 0.36]],
        plan: [[0, 0.92], [0.3, 1], [0.7, 0.88], [1, 0.72]],
      },
      lip: { enabled: false },
      lineTie: { mode: 'nose' },
      hooks: { type: 'single', belly: [], tail: { enabled: true, size: '9/0', trail: 120 } },
      features: { skirt: { enabled: true, length: 160, strands: 32 }, leaderHole: { enabled: true, dia: 4 } },
      eyes: { u: 0.35, theta: 1.1, size: 12 },
      ballast: { grams: 0, u: 0.5, material: 'lead' },
      print: { material: 'RESIN', wall: 2, infill: 100 },
      finish: { metalness: 0.4 },
      paintPreset: 'skirtGreen',
    },
  },
  {
    id: 'popper',
    name: { fr: 'Popper', en: 'Popper' },
    desc: { fr: 'Tête concave, surface · 120 mm', en: 'Cupped face, topwater · 120 mm' },
    over: {
      type: 'popper', name: 'Popper',
      body: {
        length: 120, height: 34, width: 30, squareness: 2.05, noseRound: 0.04, tailRound: 0.09, backWidth: 1, bellyWidth: 0.85, cup: 9,
        top: [[0, 0.44], [0.25, 0.52], [0.55, 0.48], [0.85, 0.3], [1, 0.14]],
        bottom: [[0, 0.44], [0.25, 0.5], [0.55, 0.44], [0.85, 0.24], [1, 0.1]],
        plan: [[0, 0.92], [0.25, 1], [0.55, 0.88], [0.85, 0.45], [1, 0.25]],
      },
      lip: { enabled: false },
      lineTie: { mode: 'nose' },
      hooks: { type: 'treble', belly: [{ u: 0.4, size: '1' }], tail: { enabled: true, size: '1', trail: 0 } },
      eyes: { u: 0.13, size: 9 },
      ballast: { grams: 6, u: 0.62, material: 'tungsten' },
      print: { wall: 1.8 },
      paintPreset: 'chartreuseBlue',
    },
  },
  {
    id: 'soft',
    name: { fr: 'Leurre souple', en: 'Soft lure' },
    desc: { fr: 'Shad à queue vibrante + tête plombée', en: 'Paddle-tail shad + jig head' },
    over: {
      type: 'soft', name: 'Shad souple',
      body: {
        length: 120, height: 25, width: 16, squareness: 2.1, noseRound: 0.12, tailRound: 0.04, backWidth: 0.95, bellyWidth: 0.9,
        top: [[0, 0.42], [0.2, 0.56], [0.5, 0.5], [0.78, 0.2], [0.9, 0.12], [1, 0.16]],
        bottom: [[0, 0.4], [0.25, 0.5], [0.55, 0.42], [0.78, 0.16], [0.9, 0.1], [1, 0.12]],
        plan: [[0, 0.75], [0.25, 1], [0.55, 0.85], [0.8, 0.32], [0.92, 0.22], [1, 0.25]],
      },
      lip: { enabled: false },
      lineTie: { mode: 'nose' },
      hooks: { type: 'single', belly: [{ u: 0.42, size: '2/0' }], tail: { enabled: false, size: '2/0', trail: 0 } },
      features: { paddle: { enabled: true, size: 26 } },
      eyes: { u: 0.08, size: 6 },
      ballast: { grams: 20, u: 0.08, material: 'lead' },
      print: { material: 'SILICONE', wall: 1.5, infill: 100 },
      finish: { roughness: 0.45, metalness: 0.2, clearcoat: 0.2 },
      paintPreset: 'softGhost',
    },
  },
];

export function presetDesign(id) {
  const p = PRESETS.find((x) => x.id === id) || PRESETS[0];
  return merge(baseDesign(), p.over);
}

const OLD_SIZE = (s) => String(s);

// Rend un design importé robuste (champs manquants, anciens fichiers…)
export function normalizeDesign(d) {
  const base = baseDesign();
  if (!d || typeof d !== 'object') return base;
  const out = merge(base, d);
  const pts = (arr, def) => (Array.isArray(arr) && arr.length >= 2 && arr.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) ? arr : def);
  out.body.top = pts(out.body.top, base.body.top);
  out.body.bottom = pts(out.body.bottom, base.body.bottom);
  out.body.plan = pts(out.body.plan, base.body.plan);
  if (!LURE_TYPES[out.type]) out.type = out.lip.enabled ? 'minnow' : 'stickbait';
  if (out.type === 'imported' && !out.imported?.id) out.type = out.lip.enabled ? 'minnow' : 'stickbait';
  if (!Array.isArray(out.hooks.belly)) out.hooks.belly = base.hooks.belly;
  const table = out.hooks.type === 'single' ? SINGLES : TREBLES;
  const fix = (s) => (table[OLD_SIZE(s)] ? OLD_SIZE(s) : Object.keys(table)[3]);
  out.hooks.belly = out.hooks.belly.filter((h) => h && Number.isFinite(h.u)).map((h) => ({ u: h.u, size: fix(h.size) }));
  out.hooks.tail.size = fix(out.hooks.tail.size);
  if (!SPLIT_RINGS[out.hooks.ring]) out.hooks.ring = 'hw4';
  if (!MATERIALS[out.print.material]) out.print.material = 'PLA';
  if (!BALLAST_MATERIALS[out.ballast.material]) out.ballast.material = 'tungsten';
  out.version = DESIGN_VERSION;
  return out;
}

// Design complet à partir d'un modèle importé (forme fixe, quincaillerie à placer)
export function designFromImport(proc, meta) {
  const d = baseDesign();
  d.type = 'imported';
  d.name = (meta.fileName || 'Leurre importé').replace(/\.(stl|3mf|step|stp)$/i, '').slice(0, 40);
  d.imported = { id: meta.id, fileName: meta.fileName, format: meta.format, params: meta.params };
  d.body = { ...d.body, ...structuredClone(proc.body) };
  if (proc.lip) {
    d.lip = { ...d.lip, ...proc.lip, clear: false };
    d.lineTie = { mode: proc.lip.angle < 35 && proc.lip.length > proc.body.height * 0.8 ? 'lip' : 'nose', lipPos: 0.45 };
  } else {
    d.lip = { ...d.lip, enabled: false };
    d.lineTie = { mode: 'nose', lipPos: 0.4 };
  }
  const L = d.body.length;
  d.hooks = { ...d.hooks, auto: true, type: 'treble', belly: L < 70 ? [{ u: 0.42, size: '4' }] : L < 140 ? [{ u: 0.3, size: '4' }, { u: 0.62, size: '4' }] : [{ u: 0.36, size: '4' }], tail: { enabled: true, size: '4', trail: 0 } };
  d.eyes = { ...d.eyes, enabled: false };
  d.features = { ...d.features, skirt: { ...d.features.skirt, enabled: false }, paddle: { ...d.features.paddle, enabled: false }, leaderHole: { ...d.features.leaderHole, enabled: false } };
  d.ballast = { grams: 0, u: 0.45, material: 'tungsten' };
  d.print = { ...d.print, lipIntegrated: true };
  d.paintPreset = 'white';
  return d;
}
