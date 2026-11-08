import { presetDesign } from '../src/design.js';
import { autoHardware } from '../src/physics.js';
import { printSolids, moldGeometry, masterGeometry, finalSoup as brushToSoup } from '../src/csg.js';
import { checkManifold, soupVolume } from '../src/geometry.js';
let fail = 0;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['deep', 'popper', 'soft', 'skirt'];
for (const id of ids) {
  const d = presetDesign(id); autoHardware(d);
  let t = performance.now();
  const parts = printSolids(d, { mode: 'halves' });
  const tp = performance.now() - t;
  for (const p of parts) {
    const m = checkManifold(p.soup, 1e-3); const v = soupVolume(p.soup).volume;
    if (!(v > 0)) fail++;
    console.log(id, p.key, `V=${(v/1000).toFixed(2)}cm3 tris=${m.triangles} open=${m.open} nm=${m.nonManifold} flip=${m.flipped}`, `${tp.toFixed(0)}ms`);
  }
  t = performance.now();
  const mold = moldGeometry(d);
  const tm = performance.now() - t;
  for (const [k, b] of [['A', mold.A], ['B', mold.B]]) {
    const s = brushToSoup(b); const m = checkManifold(s, 1e-3); const v = soupVolume(s).volume;
    if (!(v > 0)) fail++;
    console.log(id, 'moule', k, `V=${(v/1000).toFixed(1)}cm3 open=${m.open} nm=${m.nonManifold}`, `${tm.toFixed(0)}ms`, 'billes', mold.features.balls.length);
  }
  t = performance.now();
  const ms = masterGeometry(d);
  for (const mm of ms.masters) { const s = brushToSoup(mm.brush); const m = checkManifold(s, 1e-3); const v = soupVolume(s).volume; if (!(v > 0)) fail++; console.log(id, 'maître', mm.side, `V=${(v/1000).toFixed(1)}cm3 open=${m.open} nm=${m.nonManifold}`, `${(performance.now()-t).toFixed(0)}ms`); }
}
process.exit(fail ? 1 : 0);
