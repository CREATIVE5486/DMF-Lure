import { PRESETS, presetDesign } from '../src/design.js';
import { computeMassProps, autoHardware } from '../src/physics.js';
import { makeHydro, SwimPhysics, SCENARIOS, KNOT } from '../src/swimPhysics.js';
let fail = 0;
const run = (h, params, maxT) => {
  const sim = new SwimPhysics(h, params);
  let steps = 0;
  while (!sim.finished && sim.t < maxT && steps < 400000) { sim.step(1 / 500); steps++; }
  if (!Number.isFinite(sim.pos.x) || !Number.isFinite(sim.metrics.maxDepth)) fail++;
  return sim;
};
for (const p of PRESETS) {
  const d = presetDesign(p.id); autoHardware(d, 'salt');
  const mp = computeMassProps(d, 'salt');
  const h = makeHydro(d, mp, 'salt');
  const out = [];
  for (const kn of [3, 5, 7]) {
    const sim = run(h, { scenario: 'troll', speed: kn * KNOT, lineOut: 40, depth: 40, water: 'salt' }, 40);
    const v = sim.verdict();
    out.push(`${kn}kn:${sim.metrics.maxDepth.toFixed(1)}m${v.ok ? '✓' : '✗'}`);
  }
  const st = run(h, { scenario: 'stop', depth: 40, water: 'salt' }, 8);
  out.push(`arrêt: y=${(st.pos.y * 1000).toFixed(0)}mm imm=${(st.sub * 100).toFixed(0)}% pitch=${(st.pitch * 57.3).toFixed(0)}°`);
  for (const sc of ['steady', 'twitch']) {
    const sim = run(h, { scenario: sc, speed: 1, cast: 30, depth: 40, water: 'salt' }, 120);
    out.push(`${sc}:${sim.metrics.maxDepth.toFixed(1)}m`);
  }
  console.log(p.id.padEnd(15), `vCrit=${(h.vCrit / KNOT).toFixed(1)}kn`, out.join(' | '));
}
process.exit(fail ? 1 : 0);
