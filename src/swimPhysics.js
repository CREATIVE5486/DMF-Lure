// Modèle physique de nage (SI). Indépendant du rendu → testable sous Node.
// Repère : x horizontal (le pêcheur est en x = 0, le leurre arrive depuis x > 0), y vertical (surface y = 0), z latéral.
import { WATER, displacementTable, restingAttitude, buoyancyGrid, sampleBuoyancy } from './physics.js';
import { hangerPoints, makeProfile, lineTiePoint, lipFrame, sectionXYZ } from './geometry.js';

const G = 9.81;
const deg = Math.PI / 180;

export const LINES = {
  mono: { E: 2.0e9, density: 1.14, label: { fr: 'Nylon (mono)', en: 'Monofilament' } },
  fluoro: { E: 2.6e9, density: 1.78, label: { fr: 'Fluorocarbone', en: 'Fluorocarbon' } },
  braid: { E: 25e9, density: 0.97, label: { fr: 'Tresse', en: 'Braid' } },
};

export const KNOT = 0.514444;

export const SCENARIOS = {
  troll: { label: { fr: 'Traîne (bateau)', en: 'Trolling (boat)' } },
  stop: { label: { fr: 'Arrêt (flottaison)', en: 'Rest (waterline)' } },
  steady: { label: { fr: 'Régulier', en: 'Steady' } },
  stopgo: { label: { fr: 'Stop & go', en: 'Stop & go' } },
  twitch: { label: { fr: 'Twitch', en: 'Twitch' } },
  burn: { label: { fr: 'Rapide (burn)', en: 'Burn' } },
  slow: { label: { fr: 'Lent (slow roll)', en: 'Slow roll' } },
  yoyo: { label: { fr: 'Yo-yo', en: 'Yo-yo' } },
};

export function makeHydro(design, mp, water = 'fresh') {
  const rho = (WATER[water] || WATER.fresh) * 1000;
  const L = mp.dims.length / 1000, H = mp.dims.height / 1000, W = mp.dims.width / 1000;
  const m = mp.mass / 1000;
  const V = mp.displacement * 1e-9;
  const Af = mp.dims.frontalArea * 1e-6;
  const lipOn = design.lip.enabled && mp.lipArea > 1;
  const Alip = lipOn ? mp.lipArea * 1e-6 : 0;
  const a = (lipOn ? design.lip.angle : 90) * deg;
  const lipCl = lipOn ? 1.45 * Math.pow(Math.cos(a), 1.3) * Math.sin(a + 20 * deg) : 0;
  const lipCd = lipOn ? 1.15 * Math.sin(a) + 0.12 : 0;
  const cdBody = 0.32 + 0.25 * Math.min(1, H / L);
  const righting = Math.max(-5, mp.righting) / 1000; // m
  const armLip = H * 0.5;
  const Mright = m * G * righting;
  let vCrit;
  if (righting <= 0) vCrit = 0.05;
  else if (!lipOn) vCrit = 8;
  else {
    let k = 1.35;
    if (design.lineTie.mode === 'lip') k *= 1.6; // attache sur la bavette : très stabilisant
    if (design.lip.shape === 'bill') k *= 1.15;
    vCrit = Math.sqrt((2 * Mright) / (rho * Alip * 0.15 * armLip)) * k;
  }
  const lipW = lipOn ? design.lip.width / 1000 : H;
  const ratio = lipOn ? Math.min(1.2, mp.lipArea / (mp.dims.height * mp.dims.width)) : 0.1;
  const angleFactor = lipOn ? 0.55 + 0.45 * Math.sin(Math.min(90, design.lip.angle + 30) * deg) : 0.6;
  const yawAmp = (lipOn ? 3 + 16 * ratio * angleFactor : 2.5) * Math.pow(Math.max(0.4, W / H), 0.35);
  const rollAmp = Math.min(40, yawAmp * (0.5 + 0.9 * Math.max(0, H / W - 1)) * Math.sqrt(2.5 / Math.max(0.6, mp.righting)));
  const hookLen = Math.max(0, ...hangerPoints(design).filter((h) => h.kind === 'belly').map((h) => h.spec.len)) / 1000;
  // flottabilité réelle : volume du corps sous la surface selon l'enfoncement
  const tab = displacementTable(design, 40);
  const Vbody = tab.at(-1)[1];
  const extraV = Math.max(0, mp.displacement - Vbody) * 1e-9;
  let rest = { trimDeg: 0, floating: false };
  try { rest = restingAttitude(design, mp, water); } catch { /* ignore */ }
  return {
    rho, L, H, W, m, V, Af, Alip, lipCl, lipCd, cdBody, vCrit, yawAmp, rollAmp,
    mEff: m + 0.5 * rho * V,
    Cx: cdBody * Af + lipCd * Alip,
    Cy: 1.0 * L * W * 0.75 + (lipOn ? Alip * Math.cos(a) * 1.1 : 0),
    Cz: 1.05 * L * H * 0.75,
    strouhal: 0.11, lipW: Math.max(0.006, lipW), lipOn,
    lipTrim: lipOn ? (1 - design.lip.angle / 90) * 22 * deg * Math.min(1, ratio * 1.6) : 0,
    hookHang: hookLen * 0.9 + 0.004,
    righting,
    cgY: mp.cg[1] / 1000,
    dispTab: tab.map(([hh, v]) => [hh / 1000, v * 1e-9]),
    extraV,
    restPitch: (rest.trimDeg || 0) * deg,
    restFloating: !!rest.floating,
    rest,
    ...rigidBody(design, mp, rho, { lipOn, Alip, lipW: Math.max(0.006, lipW), cdBody, Af, V }),
  };
}

/* ---------- Corps rigide 6 DDL : géométrie hydrodynamique, inertie, points d'application ---------- */
function rigidBody(design, mp, rho, o) {
  const P = makeProfile(design);
  const cg = mp.cg; // mm, repère leurre
  const toB = (x, y, z) => [(x - cg[0]) / 1000, (y - cg[1]) / 1000, (z - cg[2]) / 1000];
  // tranches pour la traînée transversale (théorie des tranches)
  const N = 16;
  const slices = [];
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N;
    const top = P.top(u), bot = P.bot(u), hw = P.hw(u);
    let zm = 0;
    for (let j = 0; j <= 16; j++) zm = Math.max(zm, sectionXYZ(P, u, (j / 16) * Math.PI, top, bot, hw)[2]);
    const yc = (top - bot) / 2;
    slices.push({ r: toB(u * P.L, yc, 0), w: (2 * zm) / 1000, h: (top + bot) / 1000, dx: P.L / N / 1000 });
  }
  // éléments traînants (ancre flottante) : jupe, palette, hameçons — stabilisent le lacet et le tangage
  let extraCx = 0;
  const yTail = (P.top(0.97) - P.bot(0.97)) / 2;
  const sk = design.features?.skirt;
  if (sk?.enabled && design.type !== 'imported') {
    const n = 8, len = Math.max(20, sk.length);
    const d0 = Math.min(P.top(0.96) + P.bot(0.96), 2 * P.hw(0.96)) * 1.1;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n, dia = d0 * (1 + f * 0.6) / 1000;
      slices.push({ r: toB(P.L + f * len, yTail, 0), w: dia, h: dia, dx: (len / n / 1000) * 0.55 });
    }
    extraCx += 0.02 * (sk.strands || 30) * (len / 1000) * 0.004; // frottement des lanières
  }
  const pad = design.features?.paddle;
  if (pad?.enabled && design.type !== 'imported') {
    const D = pad.size / 1000;
    slices.push({ r: toB(P.L + 1.5, yTail, 0), w: D * 0.66, h: D, dx: D * 0.5 });
    extraCx += 0.8 * (Math.PI / 4) * D * D * 0.66 * 0.3;
  }
  for (const hk of hangerPoints(design)) {
    const sp = hk.spec, len = sp.len, gap = sp.gap / 1000;
    const pos = hk.kind === 'tail' ? [hk.point.x + (hk.trail || 0) + len * 0.4, hk.point.y - len * 0.2, 0] : [hk.point.x, hk.point.y - len * 0.5, 0];
    slices.push({ r: toB(...pos), w: gap * 1.4, h: gap * 1.4, dx: (len / 1000) * 0.5 });
    extraCx += 1.0 * gap * (len / 1000) * 0.4;
  }
  // bavette : centre, normale, largeur
  let lipC = null, lipN = null;
  if (o.lipOn) {
    const F = lipFrame(design);
    const c = F.root.clone().addScaledVector(F.dir, design.lip.length * 0.5);
    lipC = toB(c.x, c.y, 0);
    lipN = [F.normal.x, F.normal.y, F.normal.z];
  }
  const tie = lineTiePoint(design).point;
  // inertie (kg·m²) : coque répartie en ellipsoïde creux + masses ponctuelles
  const a = P.L / 2000, b = (mp.dims.height || P.H) / 2000, c2 = (mp.dims.width || P.W) / 2000;
  let Ixx = 0, Iyy = 0, Izz = 0;
  for (const it of mp.items) {
    const m = it.mass / 1000;
    const r = toB(...it.pos);
    if (it.key === 'shell' || it.key === 'coat' || it.key === 'infill') {
      const k = it.key === 'infill' ? 1 : 1.4;
      Ixx += (k * m / 5) * (b * b + c2 * c2);
      Iyy += (k * m / 5) * (a * a + c2 * c2);
      Izz += (k * m / 5) * (a * a + b * b);
    }
    Ixx += m * (r[1] * r[1] + r[2] * r[2]);
    Iyy += m * (r[0] * r[0] + r[2] * r[2]);
    Izz += m * (r[0] * r[0] + r[1] * r[1]);
  }
  const V = o.V, L = P.L / 1000;
  const m = mp.mass / 1000;
  Ixx = Math.max(Ixx, 1e-9) + rho * V * (b * b + c2 * c2) * 0.25;
  Iyy = Math.max(Iyy, 1e-9) + rho * V * L * L * 0.04;
  Izz = Math.max(Izz, 1e-9) + rho * V * L * L * 0.04;
  return {
    rb: {
      slices, lipC, lipN, tie: toB(tie.x, tie.y, tie.z), cgmm: cg,
      I: [Ixx, Iyy, Izz],
      mAx: [m + 0.1 * rho * V, m + 0.8 * rho * V, m + 0.8 * rho * V],
      grid: buoyancyGrid(design, cg[0]),
      Cxb: o.cdBody * o.Af + extraCx,
      Cdc: 1.1,
      rollDamp: rho * L * (b + c2) ** 4 * 8,
      // excitation par les tourbillons alternés (bavette, ou corps si sans bavette)
      shedC: o.lipOn ? 0.85 : 0.08,
      shedA: o.lipOn ? o.Alip : L * (mp.dims.height / 1000) * 0.5,
      // échelle de longueur du sillage : mélange largeur de bavette / hauteur du corps
      shedW: o.lipOn ? o.lipW * 0.5 + (mp.dims.height / 1000) * 0.5 : (mp.dims.height / 1000),
      shedSt: o.lipOn ? 0.08 : 0.16,
      shedR: o.lipOn ? null : toB(P.L * 0.55, 0, 0),
    },
  };
}

// Coefficient de force normale d'une plaque (bavette) selon l'incidence α
function lipCN(al) {
  const f1 = 1.45 * Math.pow(Math.max(0, Math.cos(al)), 0.3) * Math.sin(al + 20 * deg);
  const f2 = 1.15 * Math.sin(al) + 0.12;
  return Math.max(f1, f2) * Math.min(1, al / (4 * deg));
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const defaultSwimParams = () => ({
  scenario: 'troll', speed: 5 * KNOT, line: 'braid', lineDiam: 0.4, cast: 40, lineOut: 40, depth: 25, rodHeight: 1.5, water: 'salt',
});

function interp(tab, x) {
  if (x <= tab[0][0]) return tab[0][1];
  if (x >= tab[tab.length - 1][0]) return tab[tab.length - 1][1];
  let lo = 0, hi = tab.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m][0] <= x) lo = m; else hi = m; }
  const t = (x - tab[lo][0]) / (tab[hi][0] - tab[lo][0]);
  return tab[lo][1] + (tab[hi][1] - tab[lo][1]) * t;
}

// Dynamique 6 degrés de liberté : translation + rotation (lacet, tangage, roulis) d'un corps rigide.
// Le wobble, l'écart latéral, le roulis et le décrochage émergent des forces appliquées à leur point réel :
// bavette (portance/traînée + tourbillons alternés), corps (traînée transversale par tranches), fil à l'attache,
// poids au centre de gravité, poussée au centre de carène immergé.
export class SwimPhysics {
  constructor(hydro, params) {
    this.h = hydro;
    this.p = { ...defaultSwimParams(), ...params };
    this.reset();
  }

  setHydro(h) { this.h = h; }

  // Changement de réglages à chaud : le leurre continue de nager
  setParams(p) {
    const prev = this.p.scenario;
    Object.assign(this.p, p);
    if (p.scenario && p.scenario !== prev) this.enterScenario(prev);
    if (p.lineOut !== undefined && this.p.scenario === 'troll') this.lineLen = Math.hypot(this.p.lineOut, this.p.rodHeight);
    if (this.finished && (this.p.scenario === 'troll' || this.p.scenario === 'stop')) this.finished = false;
  }

  restY() { return Math.min(0, this.h.cgY - (this.h.dispTab[0][0] + this.h.dispTab.at(-1)[0]) / 2); }

  enterScenario() {
    const p = this.p;
    if (p.scenario === 'troll') {
      this.rodX = this.pos.x - p.lineOut;
      this.lineLen = Math.hypot(p.lineOut, p.rodHeight);
    } else if (p.scenario === 'stop') {
      this.lineLen = 1e6;
      this.pos.y = this.restY();
      this.vel = { x: 0, y: 0, z: 0 };
      this.w = [0, 0, 0];
      this.setAttitude(0, this.h.restPitch || 0, 0);
    } else {
      this.lineLen = Math.hypot(this.pos.x - this.rodX, p.rodHeight - this.pos.y) + 0.05;
    }
    this.finished = false;
  }

  // R = Ry(lacet)·Rz(tangage)·Rx(roulis), matrice monde ← corps (lignes)
  setAttitude(yaw, pitch, roll) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], Rz = [cp, -sp, 0, sp, cp, 0, 0, 0, 1], Rx = [1, 0, 0, 0, cr, -sr, 0, sr, cr];
    const mul = (A, B) => { const C = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return C; };
    this.R = mul(mul(Ry, Rz), Rx);
  }

  reset() {
    const p = this.p;
    this.t = 0;
    this.rodX = 0;
    const troll = p.scenario === 'troll';
    const x0 = troll ? p.lineOut : p.scenario === 'stop' ? 5 : p.cast;
    this.pos = { x: x0, y: p.scenario === 'stop' ? this.restY() : -0.005, z: 0 };
    this.vel = { x: troll ? -p.speed : 0, y: 0, z: 0 };
    this.w = [0, 0, 0];
    this.setAttitude(0, p.scenario === 'stop' ? (this.h.restPitch || 0) : 0, 0);
    this.lineLen = troll ? Math.hypot(p.lineOut, p.rodHeight) : p.scenario === 'stop' ? 1e6 : Math.hypot(p.cast, p.rodHeight) + 0.6;
    this.phase = 0;
    this.noise = 0;
    this.seed = 12345;
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.dart = 0; this.dartSide = 1; this.lastTwitch = -1;
    this.tension = 0;
    this.reel = 0;
    this.freq = 0;
    this.upTime = 0;
    this.finished = false;
    this.events = [];
    this.trace = [];
    this.win = { yaw: [], z: [], tail: [], tcross: [], lastYaw: 0 };
    this.live = { yawAmp: 0, latAmp: 0, tailAmp: 0 };
    this.metrics = { maxDepth: 0, maxTension: 0, bottomHits: 0, blowout: false, freqSum: 0, freqN: 0, maxRoll: 0, maxYaw: 0, maxSpeed: 0, yawAmpSum: 0, latAmpSum: 0, tailAmpSum: 0, ampN: 0 };
    this.lastTrace = -1;
    this.sub = 0;
  }

  reelSpeed(t) {
    const v = this.p.speed;
    switch (this.p.scenario) {
      case 'stopgo': return (t % 3.2) < 2.0 ? v : 0;
      case 'twitch': {
        const c = t % 1.0;
        return c < 0.16 ? 3.2 : c < 0.55 ? v * 0.3 : 0;
      }
      case 'burn': return v * 1.8;
      case 'slow': return v * 0.5;
      case 'yoyo': return (t % 3.6) < 1.6 ? v * 1.3 : 0;
      default: return v;
    }
  }

  rand() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647 - 0.5; }

  step(dt) {
    if (this.finished) return;
    const n = Math.max(1, Math.ceil(dt / 0.001));
    for (let i = 0; i < n && !this.finished; i++) this.substep(dt / n);
  }

  substep(dt) {
    const h = this.h, p = this.p, s = this, B = h.rb;
    const R = s.R;
    const toW = (v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
    const toB = (v) => [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];
    const F = [0, 0, 0], M = [0, 0, 0];
    const addB = (fb, r) => { const fw = toW(fb); F[0] += fw[0]; F[1] += fw[1]; F[2] += fw[2]; const m = cross(r, fb); M[0] += m[0]; M[1] += m[1]; M[2] += m[2]; };
    const addW = (fw, r) => { F[0] += fw[0]; F[1] += fw[1]; F[2] += fw[2]; const m = cross(r, toB(fw)); M[0] += m[0]; M[1] += m[1]; M[2] += m[2]; };
    const vb = toB([s.vel.x, s.vel.y, s.vel.z]);
    const velAt = (r) => { const c = cross(s.w, r); return [vb[0] + c[0], vb[1] + c[1], vb[2] + c[2]]; };

    // --- moulinet / bateau
    const troll = p.scenario === 'troll', stop = p.scenario === 'stop';
    const settle = !troll && s.t < 0.6;
    let reel = 0;
    if (troll) s.rodX -= p.speed * dt;
    else if (!stop && !settle) reel = this.reelSpeed(s.t);
    s.reel = troll ? p.speed : reel;
    if (!troll && !stop) s.lineLen = Math.max(0.5, s.lineLen - reel * dt);

    // --- poids au centre de gravité
    F[1] -= h.m * G;

    // --- poussée au centre de carène de la partie immergée (plan d'eau exprimé dans le repère du leurre)
    const up = [R[3], R[4], R[5]];
    let uy = up[1];
    if (Math.abs(uy) < 0.25) uy = uy < 0 ? -0.25 : 0.25;
    const hmm = B.cgmm[1] - (s.pos.y * 1000) / Math.abs(uy);
    const tt = -up[0] / Math.abs(uy);
    const bz = sampleBuoyancy(B.grid, hmm, tt);
    const sub = B.grid.Vfull > 0 ? Math.max(0, Math.min(1, bz.V / B.grid.Vfull)) : 0;
    s.sub = sub;
    addW([0, h.rho * G * bz.V * 1e-9, 0], [(bz.cx - B.cgmm[0]) / 1000, (bz.cy - B.cgmm[1]) / 1000, 0]);
    F[1] += h.rho * G * h.extraV * sub;
    const wet = Math.max(0.03, sub);

    // --- traînée axiale du corps
    const ux = -vb[0];
    addB([0.5 * h.rho * B.Cxb * Math.abs(ux) * ux * wet, 0, 0], [0, 0, 0]);
    // --- traînée transversale par tranches (amortit lacet/tangage, résiste à l'écart latéral)
    for (const sl of B.slices) {
      const v = velAt(sl.r);
      const fy = -0.5 * h.rho * B.Cdc * sl.w * sl.dx * Math.abs(v[1]) * v[1] * wet;
      const fz = -0.5 * h.rho * B.Cdc * sl.h * sl.dx * Math.abs(v[2]) * v[2] * wet;
      addB([0, fy, fz], sl.r);
    }
    // --- amortissement du roulis
    M[0] += -B.rollDamp * Math.abs(s.w[0]) * s.w[0] * wet - B.rollDamp * 0.4 * s.w[0];

    // --- bavette : force normale (plongée + traînée) au centre de la bavette
    const fwd = Math.max(0, ux);
    if (h.lipOn && B.lipC) {
      const v = velAt(B.lipC);
      const u = [-v[0], -v[1], -v[2]];
      const U = Math.hypot(u[0], u[1], u[2]);
      if (U > 1e-3) {
        const un = dot(u, B.lipN);
        const al = Math.asin(Math.min(1, Math.abs(un) / U));
        const fm = 0.5 * h.rho * U * U * h.Alip * lipCN(al) * wet;
        const sg = Math.sign(un);
        addB([B.lipN[0] * fm * sg + (u[0] / U) * fm * 0.05, B.lipN[1] * fm * sg + (u[1] / U) * fm * 0.05, B.lipN[2] * fm * sg + (u[2] / U) * fm * 0.05], B.lipC);
      }
    }
    // --- tourbillons alternés (excitation du wobble) + petite turbulence (« hunting »)
    const shedU = fwd;
    s.phase += (2 * Math.PI * B.shedSt * shedU / B.shedW) * dt;
    s.noise += (-s.noise / 0.35) * dt + Math.sqrt(dt) * this.rand() * 1.2;
    const q = 0.5 * h.rho * shedU * shedU * B.shedA * wet;
    addB([0, 0, q * (B.shedC * Math.sin(s.phase) + 0.12 * B.shedC * s.noise)], B.shedR || B.lipC || [0, 0, 0]);

    // --- fil : tension élastique appliquée à l'attache
    const tieW = toW(B.tie);
    const tx = s.pos.x + tieW[0], ty = s.pos.y + tieW[1], tz = s.pos.z + tieW[2];
    const rx = s.rodX - tx, ry = p.rodHeight - ty, rz = -tz;
    const D = Math.hypot(rx, ry, rz);
    const nx = rx / D, ny = ry / D, nz = rz / D;
    const line = LINES[p.line] || LINES.mono;
    const A = Math.PI * (p.lineDiam / 2000) ** 2;
    const k = (line.E * A) / Math.max(1, s.lineLen);
    const vt = toW(velAt(B.tie));
    const vToward = vt[0] * nx + vt[1] * ny + vt[2] * nz;
    const c = 1.4 * Math.sqrt(k * h.mEff);
    const stretch = D - s.lineLen;
    let T = stretch > 0 ? k * stretch - c * vToward : 0;
    T = Math.max(0, Math.min(T, 80));
    s.tension = T;
    addW([T * nx, T * ny, T * nz], B.tie);
    // traînée du fil immergé, appliquée à l'attache
    const depth = -s.pos.y;
    if (depth > 0 && D > 0.5) {
      const lsub = D * (depth / (depth + p.rodHeight));
      const vpx = vt[0] - vToward * nx, vpy = vt[1] - vToward * ny, vpz = vt[2] - vToward * nz;
      const vp = Math.hypot(vpx, vpy, vpz);
      if (vp > 1e-4) {
        const Fl = 0.5 * h.rho * 1.1 * (p.lineDiam / 1000) * lsub * vp * vp * 0.3;
        addW([(-Fl * vpx) / vp, (-Fl * vpy) / vp, (-Fl * vpz) / vp], B.tie);
      }
    }

    // --- twitch : impulsion latérale au nez
    if (p.scenario === 'twitch' && !settle) {
      const cyc = Math.floor(s.t / 1.0);
      if (cyc !== s.lastTwitch && (s.t % 1.0) < 0.05) {
        s.lastTwitch = cyc;
        s.dartSide *= -1;
        s.vel.z += s.dartSide * 0.35;
        s.w[1] += s.dartSide * 7;
        s.dart = 1;
        s.events.push({ t: s.t, type: 'twitch' });
      }
    }
    s.dart = Math.max(0, s.dart - dt * 2.2);

    // --- intégration : translation (masse ajoutée selon les axes du leurre)
    const Fb = toB(F);
    const ab = [Fb[0] / B.mAx[0], Fb[1] / B.mAx[1], Fb[2] / B.mAx[2]];
    const aw = toW(ab);
    s.vel.x += aw[0] * dt; s.vel.y += aw[1] * dt; s.vel.z += aw[2] * dt;
    s.pos.x += s.vel.x * dt; s.pos.y += s.vel.y * dt; s.pos.z += s.vel.z * dt;
    // rotation (équations d'Euler, inertie diagonale)
    const I = B.I, w = s.w;
    const gyro = [(I[1] - I[2]) * w[1] * w[2], (I[2] - I[0]) * w[2] * w[0], (I[0] - I[1]) * w[0] * w[1]];
    for (let i = 0; i < 3; i++) w[i] += ((M[i] + gyro[i]) / I[i]) * dt;
    for (let i = 0; i < 3; i++) if (!Number.isFinite(w[i]) || Math.abs(w[i]) > 200) w[i] = Math.sign(w[i] || 1) * 200;
    // R ← R·exp([ω]×dt) puis réorthonormalisation
    const ox = w[0] * dt, oy = w[1] * dt, oz = w[2] * dt;
    const Rn = new Array(9);
    for (let r = 0; r < 3; r++) {
      const a0 = R[r * 3], a1 = R[r * 3 + 1], a2 = R[r * 3 + 2];
      Rn[r * 3] = a0 + a1 * oz - a2 * oy;
      Rn[r * 3 + 1] = a1 - a0 * oz + a2 * ox;
      Rn[r * 3 + 2] = a2 + a0 * oy - a1 * ox;
    }
    // Gram-Schmidt sur les colonnes
    let c0 = [Rn[0], Rn[3], Rn[6]];
    let l = Math.hypot(...c0); c0 = c0.map((v) => v / l);
    let c1 = [Rn[1], Rn[4], Rn[7]];
    const d01 = dot(c0, c1); c1 = c1.map((v, i) => v - d01 * c0[i]);
    l = Math.hypot(...c1); c1 = c1.map((v) => v / l);
    const c2 = cross(c0, c1);
    s.R = [c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]];

    // surface : le leurre ne sort pas de l'eau
    if (s.pos.y > h.H * 0.7) { s.pos.y = h.H * 0.7; s.vel.y = Math.min(0, s.vel.y); }
    // fond
    const floor = -p.depth + h.H * 0.5 + h.hookHang;
    if (s.pos.y < floor) {
      s.pos.y = floor;
      if (s.vel.y < -0.05) {
        s.metrics.bottomHits++;
        s.events.push({ t: s.t, type: 'bottom' });
        s.vel.z += this.rand() * 0.25;
        s.w[1] += this.rand() * 6;
        s.vel.x *= 0.85;
      }
      s.vel.y = Math.abs(s.vel.y) * 0.25;
      // posé au fond : le leurre se couche à plat (frottement + appui)
      if (Math.abs(s.vel.x) < 0.3) {
        const fw = [-s.R[0], -s.R[3], -s.R[6]];
        const yaw0 = Math.atan2(fw[2], -fw[0]);
        const pit = Math.asin(Math.max(-1, Math.min(1, -fw[1])));
        const rol = Math.atan2(s.R[7], s.R[4]);
        const k = Math.max(0, 1 - dt * 3);
        this.setAttitude(yaw0, pit * k, rol * k);
        s.w = s.w.map((x) => x * Math.max(0, 1 - dt * 10));
        s.vel.x *= Math.max(0, 1 - dt * 4); s.vel.z *= Math.max(0, 1 - dt * 4);
      }
    }

    // --- angles d'affichage tirés de la matrice
    const Rr = s.R;
    const fwdW = [-Rr[0], -Rr[3], -Rr[6]];
    s.pitch = Math.asin(Math.max(-1, Math.min(1, -fwdW[1])));
    s.yaw = Math.atan2(fwdW[2], -fwdW[0]);
    s.roll = Math.atan2(Rr[7], Rr[4]);
    s.t += dt;

    // --- mesures : fréquence réelle (passages par zéro du lacet), amplitudes (fenêtre 1,5 s)
    const Wn = s.win;
    if (s.yaw > 0 && Wn.lastYaw <= 0) { Wn.tcross.push(s.t); while (Wn.tcross.length && s.t - Wn.tcross[0] > 2) Wn.tcross.shift(); }
    Wn.lastYaw = s.yaw;
    if (Wn.tcross.length >= 2) s.freq = (Wn.tcross.length - 1) / (Wn.tcross.at(-1) - Wn.tcross[0]);
    if (s.t - (Wn.tLast || 0) > 0.01) {
      Wn.tLast = s.t;
      const tailB = B.slices[B.slices.length - 1].r;
      const tailW = toW(tailB);
      Wn.yaw.push(s.yaw); Wn.z.push(s.pos.z); Wn.tail.push(s.pos.z + tailW[2]);
      if (Wn.yaw.length > 150) { Wn.yaw.shift(); Wn.z.shift(); Wn.tail.shift(); }
      const amp = (arr) => (Math.max(...arr) - Math.min(...arr)) / 2;
      s.live = { yawAmp: amp(Wn.yaw) / deg, latAmp: amp(Wn.z) * 1000, tailAmp: amp(Wn.tail) * 1000 };
    }
    const Mx = s.metrics;
    Mx.maxDepth = Math.max(Mx.maxDepth, depth);
    Mx.maxTension = Math.max(Mx.maxTension, T);
    Mx.maxSpeed = Math.max(Mx.maxSpeed, Math.hypot(s.vel.x, s.vel.y, s.vel.z));
    if (fwd > 0.2 && s.t > 2) {
      Mx.freqSum += s.freq * dt; Mx.freqN += dt;
      Mx.yawAmpSum += s.live.yawAmp * dt; Mx.latAmpSum += s.live.latAmp * dt; Mx.tailAmpSum += s.live.tailAmp * dt; Mx.ampN += dt;
    }
    Mx.maxRoll = Math.max(Mx.maxRoll, Math.abs(s.roll) / deg);
    Mx.maxYaw = Math.max(Mx.maxYaw, Math.abs(s.yaw) / deg);
    // décrochage : le leurre passe sur le flanc et y reste
    if (Math.abs(s.roll) > 80 * deg && fwd > 0.3) { s.upTime += dt; if (s.upTime > 0.25) Mx.blowout = true; } else s.upTime = Math.max(0, s.upTime - dt);

    if (s.t - s.lastTrace > 0.05) {
      s.trace.push([s.t, s.pos.x - s.rodX, Math.max(0, depth)]);
      if (s.trace.length > 3000) s.trace.shift();
      s.lastTrace = s.t;
    }
    if (!troll && !stop && (s.pos.x - s.rodX < 1.2 || s.t > 300)) s.finished = true;
  }

  // moyennes mesurées sur la nage établie
  averages() {
    const M = this.metrics;
    const n = M.ampN || 1;
    return { freq: M.freqSum / (M.freqN || 1), yawAmp: M.yawAmpSum / n, latAmp: M.latAmpSum / n, tailAmp: M.tailAmpSum / n };
  }

  verdict() {
    const M = this.metrics;
    if (M.blowout) return { ok: false, reason: 'blowout' };
    if (M.maxRoll > 70) return { ok: false, reason: 'roll' };
    return { ok: true };
  }
}
