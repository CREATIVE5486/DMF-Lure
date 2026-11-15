// Sensibilité de la nage 6 DDL aux réglages (attache, lest, quille, bavette)
import { presetDesign } from '../src/design.js';
import { computeMassProps, autoHardware } from '../src/physics.js';
import { makeHydro, SwimPhysics, KNOT } from '../src/swimPhysics.js';
const run = (d, kn = 5) => {
  autoHardware(d, 'salt');
  const mp = computeMassProps(d, 'salt');
  const sim = new SwimPhysics(makeHydro(d, mp, 'salt'), { scenario: 'troll', speed: kn * KNOT, lineOut: 40, depth: 80, water: 'salt' });
  while (sim.t < 20) sim.step(1 / 300);
  const a = sim.averages();
  return `${sim.metrics.maxDepth.toFixed(1)} m · ${a.freq.toFixed(1)} Hz · lacet ±${a.yawAmp.toFixed(1)}° · queue ±${a.tailAmp.toFixed(0)} mm · roulis ${sim.metrics.maxRoll.toFixed(0)}°${sim.metrics.blowout ? ' DÉCROCHE' : ''}`;
};
let fail = 0;
const res = {};
const v = (name, fn) => { const d = presetDesign('deep'); fn(d); res[name] = run(d); console.log(name.padEnd(34), res[name]); if (res[name].includes('NaN')) fail++; };
v('Grosse bavette (référence)', () => {});
v('Attache avancée sur la bavette', (d) => { d.lineTie.lipPos = 0.75; });
v('Attache reculée sur la bavette', (d) => { d.lineTie.lipPos = 0.15; });
v('Attache au nez', (d) => { d.lineTie.mode = 'nose'; });
v('Lest +15 g', (d) => { d.ballast.grams += 15; });
v('Ventre en V', (d) => { d.body.keel = 0.6; });
v('Bavette plus large (+30 %)', (d) => { d.lip.width *= 1.3; });
v('Bavette plus courte (−30 %)', (d) => { d.lip.length *= 0.7; });
process.exit(fail ? 1 : 0);
