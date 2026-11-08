// Modèle physique de nage (SI). Indépendant du rendu → testable sous Node.
// Repère : x horizontal (le pêcheur est en x = 0, le leurre arrive depuis x > 0), y vertical (surface y = 0), z latéral.
import { WATER } from './physics.js';
import { HOOK_SIZES } from './design.js';

const G = 9.81;
const deg = Math.PI / 180;

export const LINES = {
  mono: { E: 2.0e9, density: 1.14, label: { fr: 'Nylon (mono)', en: 'Monofilament' } },
  fluoro: { E: 2.6e9, density: 1.78, label: { fr: 'Fluorocarbone', en: 'Fluorocarbon' } },
  braid: { E: 25e9, density: 0.97, label: { fr: 'Tresse', en: 'Braid' } },
};

export const SCENARIOS = {
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
  else if (!lipOn) vCrit = 3.2;
  else vCrit = Math.sqrt((2 * Mright) / (rho * Alip * 0.15 * armLip)) * 1.35;
  const lipW = lipOn ? design.lip.width / 1000 : H;
  const ratio = lipOn ? Math.min(1.2, mp.lipArea / (mp.dims.height * mp.dims.width)) : 0.1;
  const angleFactor = lipOn ? 0.55 + 0.45 * Math.sin(Math.min(90, design.lip.angle + 30) * deg) : 0.6;
  const yawAmp = (lipOn ? 3 + 16 * ratio * angleFactor : 2.5) * Math.pow(Math.max(0.4, W / H), 0.35);
  const rollAmp = Math.min(40, yawAmp * (0.5 + 0.9 * Math.max(0, H / W - 1)) * Math.sqrt(2.5 / Math.max(0.6, mp.righting)));
  const hookLen = Math.max(...design.hooks.belly.map((h) => (HOOK_SIZES[h.size] || HOOK_SIZES[4]).len), 0) / 1000;
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
  };
}

export const defaultSwimParams = () => ({
  scenario: 'steady', speed: 0.9, line: 'fluoro', lineDiam: 0.28, cast: 25, depth: 4, rodHeight: 1.2, water: 'fresh',
});

export class SwimPhysics {
  constructor(hydro, params) {
    this.h = hydro;
    this.p = { ...defaultSwimParams(), ...params };
    this.reset();
  }

  setHydro(h) { this.h = h; }
  setParams(p) { Object.assign(this.p, p); }

  reset() {
    const p = this.p;
    this.t = 0;
    this.pos = { x: p.cast, y: -0.005, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.lineLen = Math.hypot(p.cast, p.rodHeight) + 0.6;
    this.phase = 0;
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.rollSpin = 0;
    this.dart = 0; this.dartSide = 1; this.lastTwitch = -1;
    this.tension = 0;
    this.reel = 0;
    this.freq = 0;
    this.blown = 0;
    this.finished = false;
    this.events = [];
    this.trace = [];
    this.metrics = { maxDepth: 0, maxTension: 0, bottomHits: 0, blowout: false, freqSum: 0, freqN: 0, maxRoll: 0, maxYaw: 0, maxSpeed: 0 };
    this.lastTrace = -1;
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

  step(dt) {
    if (this.finished) return;
    const h = this.h, p = this.p, s = this;
    const settle = s.t < 0.6;
    const reel = settle ? 0 : this.reelSpeed(s.t);
    s.reel = reel;
    s.lineLen = Math.max(0.5, s.lineLen - reel * dt);

    // --- ligne : élastique, sans compression
    const rx = 0 - s.pos.x, ry = p.rodHeight - s.pos.y, rz = 0 - s.pos.z;
    const D = Math.hypot(rx, ry, rz);
    const nx = rx / D, ny = ry / D, nz = rz / D;
    const line = LINES[p.line] || LINES.mono;
    const A = Math.PI * (p.lineDiam / 2000) ** 2;
    const k = (line.E * A) / Math.max(1, s.lineLen);
    const c = 1.4 * Math.sqrt(k * h.mEff);
    const stretch = D - s.lineLen;
    const vToward = s.vel.x * nx + s.vel.y * ny + s.vel.z * nz;
    let T = stretch > 0 ? k * stretch - c * vToward : 0;
    T = Math.max(0, Math.min(T, 60));
    s.tension = T;

    let fx = T * nx, fy = T * ny, fz = T * nz;

    // --- hydrostatique
    const depth = -s.pos.y;
    const sub = Math.max(0, Math.min(1, depth / h.H + 0.5));
    fy += h.rho * G * h.V * sub - h.m * G;

    // --- traînée anisotrope
    const sp = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
    fx -= 0.5 * h.rho * h.Cx * Math.abs(s.vel.x) * s.vel.x * (sub > 0 ? 1 : 0.02);
    fy -= 0.5 * h.rho * h.Cy * Math.abs(s.vel.y) * s.vel.y * (sub > 0 ? 1 : 0.02);
    fz -= 0.5 * h.rho * h.Cz * Math.abs(s.vel.z) * s.vel.z * (sub > 0 ? 1 : 0.02);

    // --- portance de la bavette (fait plonger)
    const fwd = Math.max(0, -s.vel.x);
    const blownFactor = 1 - Math.min(1, s.blown) * 0.75;
    const dive = 0.5 * h.rho * fwd * fwd * h.Alip * h.lipCl * sub * blownFactor;
    fy -= dive;
    fx -= dive * 0.08;

    // --- traînée du fil immergé (le fil « tire » le leurre vers le haut)
    if (depth > 0 && D > 0.5) {
      const lsub = D * (depth / (depth + p.rodHeight));
      const vpx = s.vel.x - vToward * nx, vpy = s.vel.y - vToward * ny, vpz = s.vel.z - vToward * nz;
      const vp = Math.hypot(vpx, vpy, vpz);
      if (vp > 1e-4) {
        const F = 0.5 * h.rho * 1.1 * (p.lineDiam / 1000) * lsub * vp * vp * 0.1;
        fx -= (F * vpx) / vp; fy -= (F * vpy) / vp; fz -= (F * vpz) / vp;
      }
    }

    // --- décrochage (blow-out) au-delà de la vitesse critique
    if (fwd > h.vCrit) s.blown = Math.min(1.5, s.blown + dt * 2.5 * (fwd / h.vCrit - 0.95));
    else s.blown = Math.max(0, s.blown - dt * 1.5);
    if (s.blown > 0.6) {
      s.metrics.blowout = true;
      fz += 0.5 * h.rho * fwd * fwd * h.Alip * 0.5 * Math.sin(s.rollSpin * 0.5 + 1);
    }

    // --- twitch : écart latéral alterné
    if (p.scenario === 'twitch' && !settle) {
      const cyc = Math.floor(s.t / 1.0);
      if (cyc !== s.lastTwitch && (s.t % 1.0) < 0.05) {
        s.lastTwitch = cyc;
        s.dartSide *= -1;
        s.vel.z += s.dartSide * 0.55 * Math.min(1.5, 0.5 + h.L * 8);
        s.dart = 1;
        s.events.push({ t: s.t, type: 'twitch' });
      }
    }
    s.dart = Math.max(0, s.dart - dt * 2.2);

    // --- intégration
    s.vel.x += (fx / h.mEff) * dt;
    s.vel.y += (fy / h.mEff) * dt;
    s.vel.z += (fz / h.mEff) * dt;
    s.pos.x += s.vel.x * dt;
    s.pos.y += s.vel.y * dt;
    s.pos.z += s.vel.z * dt;

    // surface : le leurre ne sort pas de l'eau
    if (s.pos.y > h.H * 0.25) { s.pos.y = h.H * 0.25; s.vel.y = Math.min(0, s.vel.y); }
    // fond
    const floor = -p.depth + h.H * 0.5 + h.hookHang;
    if (s.pos.y < floor) {
      s.pos.y = floor;
      if (s.vel.y < -0.05) {
        s.metrics.bottomHits++;
        s.events.push({ t: s.t, type: 'bottom' });
        s.vel.z += (Math.random() - 0.5) * 0.25;
        s.vel.x *= 0.85;
      }
      s.vel.y = Math.abs(s.vel.y) * 0.25;
    }

    // --- attitude (cinématique)
    const f = Math.min(18, h.lipOn ? (h.strouhal * fwd) / h.lipW : (0.22 * fwd) / Math.max(0.01, h.H));
    s.freq = f;
    s.phase += 2 * Math.PI * f * dt;
    const ampK = Math.min(1, fwd / 0.35);
    const pathPitch = Math.atan2(-s.vel.y, Math.max(0.05, fwd));
    const targetPitch = fwd > 0.05 ? pathPitch + h.lipTrim * ampK : (s.vel.y > 0.02 ? -0.12 : 0.04);
    s.pitch += (Math.max(-0.6, Math.min(0.6, targetPitch)) - s.pitch) * Math.min(1, dt * 6);
    const dartYaw = s.dart * s.dartSide * 32 * deg * Math.sin(Math.min(1, s.dart) * Math.PI);
    s.yaw = h.yawAmp * deg * ampK * Math.sin(s.phase) + dartYaw;
    if (s.blown > 0.6) s.rollSpin += dt * (6 + fwd * 8);
    else s.rollSpin *= 1 - Math.min(1, dt * 3);
    s.roll = h.rollAmp * deg * ampK * Math.sin(s.phase + 0.6) + s.rollSpin + s.dart * s.dartSide * 25 * deg;

    s.t += dt;

    // --- mesures
    const M = s.metrics;
    M.maxDepth = Math.max(M.maxDepth, depth);
    M.maxTension = Math.max(M.maxTension, T);
    M.maxSpeed = Math.max(M.maxSpeed, sp);
    if (fwd > 0.2) { M.freqSum += f * dt; M.freqN += dt; }
    M.maxRoll = Math.max(M.maxRoll, Math.abs(s.roll % (2 * Math.PI)) / deg);
    M.maxYaw = Math.max(M.maxYaw, Math.abs(s.yaw) / deg);
    if (s.t - s.lastTrace > 0.05) { s.trace.push([s.pos.x, depth]); s.lastTrace = s.t; }

    if (s.pos.x < 1.2 || s.t > 240) s.finished = true;
  }

  verdict() {
    const M = this.metrics;
    if (M.blowout) return { ok: false, reason: 'blowout' };
    if (M.maxRoll > 70) return { ok: false, reason: 'roll' };
    return { ok: true };
  }
}
