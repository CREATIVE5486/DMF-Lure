// Exports : STL binaire, 3MF, ZIP, fiche de montage Markdown, JSON du projet.
import * as THREE from 'three';
import { buildHalfShell, buildSolidBody, buildLipSoup, weld, lineTiePoint, hangerPoints, makeProfile } from './geometry.js';
import { computeMassProps } from './physics.js';
import { HOOK_SIZES, MATERIALS, BALLAST_MATERIALS } from './design.js';
import { makeZip } from './zip.js';
import { getLang } from './i18n.js';

const L = (fr, en) => (getLang() === 'en' ? en : fr);

function transformSoup(soup, fn) {
  const out = new Float32Array(soup.length);
  const v = [0, 0, 0];
  for (let i = 0; i < soup.length; i += 3) {
    fn(soup[i], soup[i + 1], soup[i + 2], v);
    out[i] = v[0]; out[i + 1] = v[1]; out[i + 2] = v[2];
  }
  return out;
}

function bounds(soup) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < soup.length; i += 3) {
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], soup[i + k]); mx[k] = Math.max(mx[k], soup[i + k]); }
  }
  return { min: mn, max: mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] };
}

// Pièces dans le repère imprimante (Z vers le haut, posées sur z = 0), disposées sur le plateau.
export function printParts(design, opts = {}) {
  const parts = [];
  const hollow = opts.hollow ?? true;
  const safe = (design.name || 'leurre').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'leurre';
  if (opts.solid) {
    const s = buildSolidBody(design, 160, 112);
    parts.push({ key: 'solid', file: `${safe}_corps_plein.stl`, label: L('Corps plein', 'Solid body'), soup: transformSoup(s, (x, y, z, o) => { o[0] = x; o[1] = -z; o[2] = y; }) });
  } else {
    const left = buildHalfShell(design, 1, { hollow, nu: 160, nt: 72 });
    parts.push({ key: 'left', file: `${safe}_moitie_gauche.stl`, label: L('Demi-corps gauche', 'Left half'), soup: left });
    const right = buildHalfShell(design, -1, { hollow, nu: 160, nt: 72 });
    parts.push({ key: 'right', file: `${safe}_moitie_droite.stl`, label: L('Demi-corps droit', 'Right half'), soup: transformSoup(right, (x, y, z, o) => { o[0] = x; o[1] = -y; o[2] = -z; }) });
  }
  if (design.lip.enabled) {
    parts.push({ key: 'lip', file: `${safe}_bavette.stl`, label: L('Bavette', 'Lip'), soup: buildLipSoup(design, true) });
  }
  // disposition sur le plateau : pièces empilées selon Y avec 6 mm d'écart, centrées en X
  let y = 0;
  const placed = parts.map((p) => {
    const b = bounds(p.soup);
    const dx = -b.min[0] - b.size[0] / 2, dy = y - b.min[1], dz = -b.min[2];
    y += b.size[1] + 6;
    return { ...p, soup: transformSoup(p.soup, (a, c, e, o) => { o[0] = a + dx; o[1] = c + dy; o[2] = e + dz; }) };
  });
  const total = y - 6;
  for (const p of placed) {
    for (let i = 1; i < p.soup.length; i += 3) p.soup[i] -= total / 2;
    p.bounds = bounds(p.soup);
  }
  return placed;
}

export function soupToSTL(soup, name = 'part') {
  const n = soup.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const header = `DMF Lure Studio - ${name}`.slice(0, 79);
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < soup.length; t += 9) {
    const ax = soup[t], ay = soup[t + 1], az = soup[t + 2];
    const ux = soup[t + 3] - ax, uy = soup[t + 4] - ay, uz = soup[t + 5] - az;
    const vx = soup[t + 6] - ax, vy = soup[t + 7] - ay, vz = soup[t + 8] - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
    for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, soup[t + k], true);
    dv.setUint16(o + 48, 0, true);
    o += 50;
  }
  return new Uint8Array(buf);
}

const xmlEsc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

export function partsTo3MF(parts, design) {
  const colors = { left: '#E8E2D0', right: '#E8E2D0', lip: '#BFD9E6', solid: '#E8E2D0' };
  let objects = '', items = '', id = 2;
  const mats = parts.map((p) => `<base name="${xmlEsc(p.label)}" displaycolor="${colors[p.key] || '#DDDDDD'}FF"/>`).join('');
  parts.forEach((p, idx) => {
    const { vertices, triangles } = weld(p.soup, 1e-4);
    const vs = [];
    for (let i = 0; i < vertices.length; i += 3) vs.push(`<vertex x="${vertices[i].toFixed(4)}" y="${vertices[i + 1].toFixed(4)}" z="${vertices[i + 2].toFixed(4)}"/>`);
    const ts = [];
    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i], b = triangles[i + 1], c = triangles[i + 2];
      if (a === b || b === c || a === c) continue;
      ts.push(`<triangle v1="${a}" v2="${b}" v3="${c}"/>`);
    }
    objects += `<object id="${id}" type="model" name="${xmlEsc(p.label)}" pid="1" pindex="${idx}"><mesh><vertices>${vs.join('')}</vertices><triangles>${ts.join('')}</triangles></mesh></object>`;
    items += `<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 128 128 0"/>`;
    id++;
  });
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="fr-FR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${xmlEsc(design.name)}</metadata>
<metadata name="Application">DMF Lure Studio</metadata>
<resources><basematerials id="1">${mats}</basematerials>${objects}</resources>
<build>${items}</build>
</model>`;
  const types = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
  const blob = makeZip([
    { name: '[Content_Types].xml', data: types },
    { name: '_rels/.rels', data: rels },
    { name: '3D/3dmodel.model', data: model },
  ]);
  return new Blob([blob], { type: 'model/3mf' });
}

export function partsToZip(parts, extra = []) {
  return makeZip([...parts.map((p) => ({ name: p.file, data: soupToSTL(p.soup, p.label) })), ...extra]);
}

const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
const oz = (g) => (g / 28.3495).toFixed(3);
const inch = (mm) => (mm / 25.4).toFixed(2);

export function buildSheet(design, water = 'fresh') {
  const mp = computeMassProps(design, water);
  const P = makeProfile(design);
  const mat = MATERIALS[design.print.material];
  const bm = BALLAST_MATERIALS[design.ballast.material];
  const tie = lineTiePoint(design);
  const hangers = hangerPoints(design);
  const cls = { floating: L('Flottant', 'Floating'), suspending: L('Suspending (neutre)', 'Suspending'), sinking: L('Coulant', 'Sinking') }[mp.buoyancyClass];
  const tieLabel = { nose: L('nez', 'nose'), lip: L('sur la bavette', 'on the lip'), back: L('sur le dos', 'on the back') }[tie.mode];
  const hookLines = hangers.map((h, i) => {
    const hs = HOOK_SIZES[h.size];
    return `| ${i + 1} | ${h.kind === 'tail' ? L('Queue', 'Tail') : L('Ventre', 'Belly')} | ${f1(h.point.x)} mm ${L('du nez', 'from nose')} | ${L('Triple', 'Treble')} #${h.size} (${hs.len} mm, ${hs.mass} g) | ${hs.ring} mm |`;
  }).join('\n');
  const date = new Date().toISOString().slice(0, 10);
  return `# ${design.name} — ${L('Fiche de fabrication', 'Build sheet')}

${L('Généré par', 'Generated by')} **DMF Lure Studio** · ${date}

## ${L('Dimensions', 'Dimensions')}

| | mm | in |
|---|---|---|
| ${L('Longueur corps', 'Body length')} | ${f1(mp.dims.length)} | ${inch(mp.dims.length)} |
| ${L('Hauteur max', 'Max height')} | ${f1(mp.dims.height)} | ${inch(mp.dims.height)} |
| ${L('Largeur max', 'Max width')} | ${f1(mp.dims.width)} | ${inch(mp.dims.width)} |
${design.lip.enabled ? `| ${L('Bavette', 'Lip')} (${design.lip.shape}) | ${f1(design.lip.length)} × ${f1(design.lip.width)} × ${f1(design.lip.thickness)} @ ${design.lip.angle}° | |` : `| ${L('Bavette', 'Lip')} | ${L('aucune (lipless)', 'none (lipless)')} | |`}

## ${L('Poids & flottabilité prévus (leurre fini)', 'Predicted weight & buoyancy (finished bait)')}

- ${L('Masse totale', 'Total mass')} : **${f2(mp.mass)} g** (${oz(mp.mass)} oz)
- ${L('Volume déplacé', 'Displaced volume')} : ${f2(mp.displacement / 1000)} cm³ → ${L('poussée', 'buoyancy')} ${f2(mp.buoyancy)} g (${water === 'salt' ? L('eau de mer', 'salt water') : L('eau douce', 'fresh water')})
- ${L('Flottabilité nette', 'Net buoyancy')} : **${mp.netBuoyancy >= 0 ? '+' : ''}${f2(mp.netBuoyancy)} g** → **${cls}**
- ${L('Stabilité (centre de poussée − centre de gravité)', 'Stability (CB − CG)')} : ${f2(mp.righting)} mm ${mp.righting > 0.3 ? '✅' : '⚠️'}
- ${L('Lest à ajouter/retirer pour être suspending', 'Ballast change to suspend')} : ${mp.ballastToSuspend >= 0 ? '+' : ''}${f2(mp.ballastToSuspend)} g (${bm.label})

| ${L('Composant', 'Component')} | g |
|---|---|
${mp.items.map((i) => `| ${({ shell: L('Coque imprimée', 'Printed shell'), infill: L('Remplissage', 'Infill'), coat: L('Apprêt + peinture + vernis', 'Primer + paint + clear coat'), lip: L('Bavette', 'Lip'), tie: L('Attache de ligne', 'Line tie'), hook: L('Hameçon + anneau', 'Hook + split ring'), ballast: L('Lest', 'Ballast') })[i.key]} | ${f2(i.mass)} |`).join('\n')}

## ${L('Impression 3D', '3D printing')}

- ${L('Matière', 'Material')} : **${mat.label}** (${mat.density} g/cm³)
- ${L('Épaisseur de paroi', 'Wall thickness')} : ${f1(design.print.wall)} mm → ${L('régler', 'set')} ${Math.max(2, Math.round(design.print.wall / 0.42))} ${L('périmètres (buse 0,4)', 'perimeters (0.4 nozzle)')}
- ${L('Remplissage', 'Infill')} : ${design.print.infill || 0} % ${design.print.infill ? '' : L('(coque creuse : laisser 100 % sur les parois, 0 % dans la cavité)', '(hollow: cavity already modelled, use 100% for walls)')}
- ${L('Hauteur de couche', 'Layer height')} : 0,12 – 0,16 mm
- ${L('Orientation', 'Orientation')} : ${L('chaque demi-corps posé sur sa face de joint (déjà orienté dans les fichiers), sans supports', 'each half flat on its joint face (already oriented), no supports')}
- ${L('Bavette', 'Lip')} : ${L('à plat ; idéalement en PETG/PC transparent ou découpée dans du polycarbonate 1,5 mm', 'flat; ideally clear PETG/PC or cut from 1.5 mm polycarbonate')}

## ${L('Quincaillerie', 'Hardware')}

- ${L('Attache de ligne', 'Line tie')} : ${tieLabel} — ${f1(tie.point.x)} mm ${L('du nez', 'from nose')}
- ${L('Armature', 'Through-wire')} : ${L('inox 0,8 mm, posée dans le plan de joint, boucles aux positions ci-dessous', '0.8 mm stainless, laid in the joint plane, loops at the positions below')}

| # | ${L('Position', 'Position')} | ${L('Distance', 'Distance')} | ${L('Hameçon', 'Hook')} | ${L('Anneau brisé', 'Split ring')} |
|---|---|---|---|---|
${hookLines || `| – | – | – | – | – |`}

${design.ballast.grams > 0 ? `- ${L('Lest', 'Ballast')} : ${f2(design.ballast.grams)} g ${bm.label}, ${L('au fond de la cavité à', 'at the bottom of the cavity,')} ${f1(design.ballast.u * P.L)} mm ${L('du nez', 'from nose')}` : ''}

## ${L('Assemblage', 'Assembly')}

1. ${L('Ébavurer les faces de joint (papier 400) et tester l’ajustement à blanc.', 'Deburr the joint faces (400 grit) and dry-fit.')}
2. ${L('Former l’armature inox, la poser dans le plan de joint ; coller le lest au fond de la cavité.', 'Bend the stainless wire harness, lay it in the joint plane; glue the ballast at the bottom of the cavity.')}
3. ${L('Coller les deux moitiés à l’époxy 5 min ou cyanoacrylate ; maintenir serré 10 min.', 'Glue the halves with 5-minute epoxy or CA; clamp 10 min.')}
4. ${L('Entailler une fente de bavette (scie fine, épaisseur', 'Cut the lip slot (fine saw, thickness')} ${f1(design.lip.thickness)} mm, ${L('angle', 'angle')} ${design.lip.angle}°) ${L('et coller la bavette à l’époxy.', 'and epoxy the lip in.')}
5. ${L('Poncer, apprêt blanc, peinture (gabarit de texture exporté), yeux 3D.', 'Sand, white primer, paint (exported texture template), 3D eyes.')}
6. ${L('Vernis époxy 2 couches (ou UV), séchage en rotation.', 'Two coats of epoxy (or UV) clear, cure on a turner.')}
7. ${L('Test en bassin : ajuster l’attache (pince) si le leurre tire d’un côté.', 'Tank test: tune the line tie with pliers if it runs to one side.')}

---
${L('Les valeurs sont des estimations physiques ; vérifiez toujours en bassin.', 'Values are physical estimates; always confirm with a tank test.')}
`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Pour l'affichage 3D : repère imprimante (Z haut) → repère Three.js (Y haut)
export function printSoupToThree(soup) {
  return transformSoup(soup, (x, y, z, o) => { o[0] = x; o[1] = z; o[2] = -y; });
}

export { THREE };
