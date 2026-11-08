import { PRESETS, presetDesign } from '../src/design.js';
import { buildSolidBody, buildCavity, buildLipSoup, buildPaddleSoup, soupVolume, checkManifold } from '../src/geometry.js';
import { computeMassProps, restingAttitude, ballastForTarget, BALLAST_TARGETS, autoHardware } from '../src/physics.js';

let fail = 0;
const check = (name, cond, info = '') => { if (!cond) { fail++; console.log('✗', name, info); } else console.log('✓', name, info); };

for (const p of PRESETS) {
  const d = presetDesign(p.id);
  autoHardware(d);
  const parts = { solid: buildSolidBody(d) };
  const cav = buildCavity(d);
  if (cav) parts.cavity = cav;
  if (d.lip.enabled) parts.lip = buildLipSoup(d);
  const pad = buildPaddleSoup(d);
  if (pad) parts.paddle = pad;
  for (const [k, soup] of Object.entries(parts)) {
    const m = checkManifold(soup);
    const v = soupVolume(soup).volume;
    check(`${p.id}/${k} fermé`, m.ok && v > 0, `tris=${m.triangles} open=${m.open} nm=${m.nonManifold} flip=${m.flipped} V=${(v / 1000).toFixed(2)}cm3`);
  }
  const mp = computeMassProps(d);
  const rest = restingAttitude(d, mp);
  check(`${p.id} masse finie`, Number.isFinite(mp.mass) && mp.mass > 0);
  const tg = BALLAST_TARGETS.map((t) => `${t.id}:${ballastForTarget(d, mp, t.id).toFixed(1)}`).join(' ');
  console.log(`   ${mp.mass.toFixed(1)} g net ${mp.netBuoyancy.toFixed(1)} g (${mp.buoyancyClass}) stab ${mp.righting.toFixed(1)} mm · hameçons ${d.hooks.type} ${d.hooks.tail.size} anneau ${d.hooks.ring} · repos: ${rest.floating ? `${rest.submergedPct.toFixed(0)}% immergé, assiette ${rest.trimDeg.toFixed(1)}°` : 'coule'}`);
  console.log(`   lest: ${tg}`);
}
if (fail) { console.log(`${fail} échec(s)`); process.exit(1); }
console.log('Tous les tests passent.');
