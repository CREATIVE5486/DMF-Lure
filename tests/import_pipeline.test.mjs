// Chaîne complète : import → design équipé → masse, flottaison, nage, pièces CSG
import { readFileSync } from 'node:fs';
import { parseSTEP, processImport } from '../src/importer.js';
import { designFromImport } from '../src/design.js';
import { setImported } from '../src/importedStore.js';
import { computeMassProps, restingAttitude, autoHardware, ballastForTarget } from '../src/physics.js';
import { makeHydro, SwimPhysics, KNOT } from '../src/swimPhysics.js';
import { printSolids, moldGeometry, finalSoup } from '../src/csg.js';
import { soupVolume } from '../src/geometry.js';
const dir = process.argv[2];
const occt = await (await import('occt-import-js')).default();
let fail = 0;
for (const f of ['leurre_entier', 'demi_coquille_creuse']) {
  const raw = await parseSTEP(readFileSync(`${dir}/${f}.step`).buffer, occt);
  const proc = processImport(raw);
  setImported('t_' + f, { raw, proc });
  const d = designFromImport(proc, { id: 't_' + f, fileName: f + '.step', format: 'step', params: {} });
  autoHardware(d, 'salt');
  let mp = computeMassProps(d, 'salt');
  const add = ballastForTarget(d, mp, 'float_mid', 'salt');
  d.ballast.grams = Math.max(0, add);
  mp = computeMassProps(d, 'salt');
  const rest = restingAttitude(d, mp, 'salt');
  const hyd = makeHydro(d, mp, 'salt');
  const sim = new SwimPhysics(hyd, { scenario: 'troll', speed: 4 * KNOT, lineOut: 30, depth: 40, water: 'salt' });
  while (sim.t < 20) sim.step(1 / 300);
  if (!Number.isFinite(mp.mass) || !Number.isFinite(sim.metrics.maxDepth)) fail++;
  console.log(f, `masse ${mp.mass.toFixed(1)} g, lest ${d.ballast.grams.toFixed(1)} g, ${mp.buoyancyClass}, repos ${rest.floating ? rest.submergedPct.toFixed(0) + '% immergé' : 'coule'}, hameçons ${d.hooks.tail.size} anneau ${d.hooks.ring}, traîne 4 nds → ${sim.metrics.maxDepth.toFixed(1)} m, attache ${d.lineTie.mode}`);
  const parts = printSolids(d, { mode: 'halves' });
  console.log('  pièces', parts.map((p) => `${p.key} ${(soupVolume(p.soup).volume / 1000).toFixed(1)}cm3`).join(' '));
  const m = moldGeometry(d);
  console.log('  moule A', (soupVolume(finalSoup(m.A)).volume / 1000).toFixed(0), 'cm3, billes', m.features.ballCount || 0);
}
process.exit(fail);
