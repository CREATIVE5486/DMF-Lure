import { PRESETS, presetDesign } from '../src/design.js';
import { buildHalfShell, buildSolidBody, buildLipSoup, soupVolume, checkManifold } from '../src/geometry.js';
import { computeMassProps } from '../src/physics.js';

let fail = 0;
const check = (name, cond, info = '') => { if (!cond) { fail++; console.log('✗', name, info); } else console.log('✓', name, info); };

for (const p of PRESETS) {
  const d = presetDesign(p.id);
  const parts = {
    solid: buildSolidBody(d),
    left: buildHalfShell(d, 1),
    right: buildHalfShell(d, -1),
    solidHalf: buildHalfShell(d, 1, { hollow: false }),
  };
  if (d.lip.enabled) parts.lip = buildLipSoup(d);
  for (const [k, soup] of Object.entries(parts)) {
    const m = checkManifold(soup);
    const v = soupVolume(soup).volume;
    check(`${p.id}/${k} étanche`, m.ok && v > 0, `tris=${m.triangles} open=${m.open} nm=${m.nonManifold} flip=${m.flipped} V=${(v / 1000).toFixed(2)}cm3`);
  }
  const vs = soupVolume(parts.solid).volume, vh = soupVolume(parts.solidHalf).volume;
  check(`${p.id} demi plein = moitié du plein`, Math.abs(2 * vh - vs) / vs < 0.02, `${(2 * vh / 1000).toFixed(2)} vs ${(vs / 1000).toFixed(2)}`);
  const mp = computeMassProps(d);
  console.log(`   masse ${mp.mass.toFixed(2)} g, flottabilité ${mp.netBuoyancy.toFixed(2)} g (${mp.buoyancyClass}), stabilité ${mp.righting.toFixed(2)} mm`);
}
if (fail) { console.log(`${fail} échec(s)`); process.exit(1); }
console.log('Tous les tests passent.');
