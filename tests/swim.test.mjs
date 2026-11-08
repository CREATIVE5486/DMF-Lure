import { PRESETS, presetDesign } from '../src/design.js';
import { computeMassProps } from '../src/physics.js';
import { makeHydro, SwimPhysics, SCENARIOS } from '../src/swimPhysics.js';
let fail = 0;
for (const p of PRESETS) {
  const d = presetDesign(p.id);
  const mp = computeMassProps(d);
  const h = makeHydro(d, mp);
  const out = [];
  for (const sc of Object.keys(SCENARIOS)) {
    const sim = new SwimPhysics(h, { scenario: sc, depth: 8 });
    let steps = 0;
    while (!sim.finished && steps < 200000) { sim.step(1 / 500); steps++; }
    const v = sim.verdict();
    const M = sim.metrics;
    if (!Number.isFinite(sim.pos.x) || !Number.isFinite(M.maxDepth)) { fail++; console.log('NaN', p.id, sc); }
    out.push(`${sc}:${M.maxDepth.toFixed(2)}m ${v.ok ? '✓' : '✗' + v.reason} f=${(M.freqSum / (M.freqN || 1)).toFixed(1)}Hz t=${sim.t.toFixed(0)}s`);
  }
  console.log(p.id.padEnd(8), `vCrit=${h.vCrit.toFixed(2)} yaw=${h.yawAmp.toFixed(1)}° roll=${h.rollAmp.toFixed(1)}° net=${mp.netBuoyancy.toFixed(2)}g`);
  console.log('   ', out.join(' | '));
}
process.exit(fail ? 1 : 0);
