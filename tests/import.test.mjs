import { readFileSync } from 'node:fs';
import { parseSTL, parse3MF, parseSTEP, processImport } from '../src/importer.js';
import { soupToSTL, partsTo3MF } from '../src/export.js';
const dir = process.argv[2];
const occtF = (await import('occt-import-js')).default;
const occt = await occtF();
const show = (name, raw) => {
  const t = performance.now();
  const r = processImport(raw);
  console.log(name.padEnd(28), `tris=${r.triangles} miroir=${r.mirrored} creux=${r.hollowModel} L=${r.body.length} H=${r.body.height} W=${r.body.width} n=${r.body.squareness}`,
    `Vext=${(r.rcOuter.Vmat / 1000).toFixed(2)}cm3 Vmat=${(r.rc.Vmat / 1000).toFixed(2)}cm3`, r.lip ? `bavette ${r.lip.length}x${r.lip.width}@${r.lip.angle}° ép ${r.lip.thickness}` : 'sans bavette', `${(performance.now() - t).toFixed(0)}ms`);
  return r;
};
import { existsSync } from 'node:fs';
let fail = 0;
for (const f of ['leurre_entier', 'demi_coquille', 'demi_coquille_creuse']) {
  if (existsSync(`${dir}/${f}.stl`)) {
    const r = show(`${f}.stl`, parseSTL(readFileSync(`${dir}/${f}.stl`).buffer));
    if (Math.abs(r.body.length - 119.7) > 2) fail++;
  }
  const step = await parseSTEP(readFileSync(`${dir}/${f}.step`).buffer, occt);
  const r = show(`${f}.step`, step);
  if (Math.abs(r.body.length - 119.7) > 2 || !r.lip || Math.abs(r.rcOuter.Vmat / 1000 - 35.8) > 1) fail++;
  if (f !== 'leurre_entier' && !r.mirrored) fail++;
  if (f === 'demi_coquille_creuse' && !r.hollowModel) fail++;
}
// 3MF et STL binaire fabriqués à partir du STEP entier (avec un décalage de plateau dans le 3MF)
const ref = await parseSTEP(readFileSync(`${dir}/leurre_entier.step`).buffer, occt);
const blob = partsTo3MF([{ key: 'solid', label: 'test', soup: ref }], { name: 'test' });
show('leurre_entier.3mf', parse3MF(await blob.arrayBuffer()));
show('leurre_entier_binaire.stl', parseSTL(soupToSTL(ref, 'x').buffer));
process.exit(fail ? 1 : 0);
