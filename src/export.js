// Exports : STL binaire, 3MF, ZIP, fiche de montage Markdown, JSON du projet.
import * as THREE from 'three';
import { weld, lineTiePoint, hangerPoints, makeProfile, ringSpec } from './geometry.js';
import { computeMassProps, restingAttitude, BALLAST_TARGETS, ballastForTarget } from './physics.js';
import { MATERIALS, BALLAST_MATERIALS, LURE_TYPES } from './design.js';
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

export const PART_LABELS = {
  left: { fr: 'Demi-corps gauche', en: 'Left half', file: 'moitie_gauche' },
  right: { fr: 'Demi-corps droit', en: 'Right half', file: 'moitie_droite' },
  solid: { fr: 'Corps une pièce', en: 'One-piece body', file: 'corps' },
  lip: { fr: 'Bavette séparée', en: 'Separate lip', file: 'bavette' },
  moldA: { fr: 'Moule — coquille A', en: 'Mold — half A', file: 'moule_A' },
  moldB: { fr: 'Moule — coquille B', en: 'Mold — half B', file: 'moule_B' },
  masterA: { fr: 'Contre-moule A (coffrage)', en: 'Master A (mold box)', file: 'contre_moule_A' },
  masterB: { fr: 'Contre-moule B (coffrage)', en: 'Master B (mold box)', file: 'contre_moule_B' },
};

// Orientation d'impression (Z vers le haut, pièce posée sur z = 0) selon la pièce
const ORIENT = {
  left: (x, y, z, o) => { o[0] = x; o[1] = y; o[2] = z; },
  right: (x, y, z, o) => { o[0] = x; o[1] = -y; o[2] = -z; },
  solid: (x, y, z, o) => { o[0] = x; o[1] = -z; o[2] = y; },
  lip: (x, y, z, o) => { o[0] = x; o[1] = -z; o[2] = y; },
  moldA: (x, y, z, o) => { o[0] = x; o[1] = -y; o[2] = -z; },
  moldB: (x, y, z, o) => { o[0] = x; o[1] = y; o[2] = z; },
  masterA: (x, y, z, o) => { o[0] = x; o[1] = y; o[2] = z; },
  masterB: (x, y, z, o) => { o[0] = x; o[1] = -y; o[2] = -z; },
};

// Pièces CSG → repère imprimante, disposées sur le plateau.
export function layoutParts(design, rawParts) {
  const safe = (design.name || 'leurre').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'leurre';
  let y = 0;
  const placed = rawParts.map((p) => {
    const lab = PART_LABELS[p.key] || { fr: p.key, en: p.key, file: p.key };
    const oriented = transformSoup(p.soup, ORIENT[p.key] || ORIENT.left);
    const b = bounds(oriented);
    const dx = -b.min[0] - b.size[0] / 2, dy = y - b.min[1], dz = -b.min[2];
    y += b.size[1] + 8;
    return { key: p.key, label: L(lab.fr, lab.en), file: `${safe}_${lab.file}.stl`, soup: transformSoup(oriented, (a, c, e, o) => { o[0] = a + dx; o[1] = c + dy; o[2] = e + dz; }) };
  });
  const total = y - 8;
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
  const colors = { left: '#E8E2D0', right: '#E8E2D0', lip: '#BFD9E6', solid: '#E8E2D0', moldA: '#7FB7C9', moldB: '#7FC9A9', masterA: '#D9B36C', masterB: '#D99A6C' };
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

export function buildSheet(design, water = 'fresh', extra = {}) {
  const mp = computeMassProps(design, water);
  const P = makeProfile(design);
  const mat = MATERIALS[design.print.material];
  const bm = BALLAST_MATERIALS[design.ballast.material];
  const tie = lineTiePoint(design);
  const hangers = hangerPoints(design);
  const ring = ringSpec(design);
  const rest = restingAttitude(design, mp, water);
  const hw = mp.hardware;
  const cls = { floating: L('Flottant', 'Floating'), suspending: L('Suspending (neutre)', 'Suspending'), sinking: L('Coulant', 'Sinking') }[mp.buoyancyClass];
  const tieLabel = { nose: L('nez', 'nose'), lip: L('sur la bavette', 'on the lip'), back: L('sur le dos', 'on the back') }[tie.mode];
  const hookLines = hangers.map((h, i) => `| ${i + 1} | ${h.kind === 'tail' ? L('Queue', 'Tail') : L('Ventre', 'Belly')} | ${f1(h.point.x)} mm ${L('du nez', 'from nose')}${h.trail ? ` (+${f1(h.trail)} mm ${L('de traîne', 'trailing')})` : ''} | ${h.spec.ref} — ${h.spec.len} mm, ${h.spec.mass} g | ${ring.label} |`).join('\n');
  const targets = BALLAST_TARGETS.map((t) => `| ${L(t.fr, t.en)} (${L(t.descFr, t.descEn)}) | ${(() => { const d = ballastForTarget(design, mp, t.id, water); return `${d >= 0 ? '+' : ''}${f2(d)} g`; })()} |`).join('\n');
  const mold = extra.mold;
  const date = new Date().toISOString().slice(0, 10);
  return `# ${design.name} — ${L('Fiche de fabrication', 'Build sheet')}

${L('Généré par', 'Generated by')} **DMF Lure Studio** · ${date} · ${L('Type', 'Type')} : ${L(LURE_TYPES[design.type]?.fr || '', LURE_TYPES[design.type]?.en || '')}

## ${L('Dimensions', 'Dimensions')}

| | mm | in |
|---|---|---|
| ${L('Longueur corps', 'Body length')} | ${f1(mp.dims.length)} | ${inch(mp.dims.length)} |
| ${L('Hauteur max', 'Max height')} | ${f1(mp.dims.height)} | ${inch(mp.dims.height)} |
| ${L('Largeur max', 'Max width')} | ${f1(mp.dims.width)} | ${inch(mp.dims.width)} |
| ${L('Largeur dos / ventre', 'Back / belly width')} | × ${design.body.backWidth} / × ${design.body.bellyWidth}${design.body.keel ? ` · ${L('ventre en V', 'V belly')} ${Math.round(design.body.keel * 100)} %` : ''} | |
${design.lip.enabled ? `| ${L('Bavette', 'Lip')} (${design.lip.shape}) | ${f1(design.lip.length)} × ${f1(design.lip.width)} × ${f1(design.lip.thickness)} @ ${design.lip.angle}° | ${design.print.lipIntegrated !== false ? L('intégrée au corps', 'integrated') : L('pièce séparée', 'separate part')} |` : `| ${L('Bavette', 'Lip')} | ${L('aucune', 'none')} | |`}

## ${L('Poids & flottabilité prévus (leurre fini)', 'Predicted weight & buoyancy (finished bait)')}

- ${L('Masse totale', 'Total mass')} : **${f2(mp.mass)} g** (${oz(mp.mass)} oz)
- ${L('Flottabilité nette', 'Net buoyancy')} : **${mp.netBuoyancy >= 0 ? '+' : ''}${f2(mp.netBuoyancy)} g** → **${cls}** (${water === 'salt' ? L('eau de mer', 'salt water') : L('eau douce', 'fresh water')})
- ${L('Au repos', 'At rest')} : ${rest.floating ? `${f1(rest.submergedPct)} % ${L('immergé, franc-bord', 'submerged, freeboard')} ${f1(rest.freeboard)} mm, ${L('assiette', 'trim')} ${f1(rest.trimDeg)}° (${rest.trimDeg > 0 ? L('nez bas', 'nose down') : L('queue basse', 'tail down')})` : L('coule', 'sinks')}
- ${L('Stabilité (centre de poussée − centre de gravité)', 'Stability (CB − CG)')} : ${f2(mp.righting)} mm ${mp.righting > 0.3 ? '✅' : '⚠️'}

| ${L('Objectif de lestage', 'Ballast target')} | ${L('Lest à ajouter', 'Ballast change')} |
|---|---|
${targets}

## ${L('Quincaillerie (adaptée au poids)', 'Hardware (sized to weight)')}

- ${L('Bas de ligne conseillé', 'Recommended leader')} : ${hw.leader} · ${L('résistance visée', 'target strength')} ${hw.strength}
- ${L('Attache de ligne', 'Line tie')} : ${tieLabel} — ${f1(tie.point.x)} mm ${L('du nez', 'from nose')}
- ${L('Armature', 'Through-wire')} : ${L('inox', 'stainless')} ${mp.mass > 45 ? '1,2' : mp.mass > 20 ? '1,0' : '0,8'} mm ${L('dans le plan de joint (rainure prévue dans les fichiers)', 'in the joint plane (groove included in the files)')}

| # | ${L('Position', 'Position')} | ${L('Distance', 'Distance')} | ${L('Hameçon', 'Hook')} | ${L('Anneau brisé', 'Split ring')} |
|---|---|---|---|---|
${hookLines || '| – | – | – | – | – |'}

${design.ballast.grams > 0 ? `- ${L('Lest', 'Ballast')} : ${f2(design.ballast.grams)} g ${bm.label} ${L('à', 'at')} ${f1(design.ballast.u * P.L)} mm ${L('du nez', 'from nose')}` : ''}

## ${L('Impression 3D', '3D printing')}

- ${L('Matière', 'Material')} : **${mat.label}** (${mat.density} g/cm³) · ${L('paroi', 'wall')} ${f1(design.print.wall)} mm (≈ ${Math.max(2, Math.round(design.print.wall / 0.42))} ${L('périmètres', 'perimeters')}) · ${L('remplissage cavité', 'cavity infill')} ${design.print.infill || 0} %
- ${L('Chaque demi-corps se pose sur sa face de joint (déjà orienté), sans supports. Couche 0,12–0,16 mm.', 'Each half lies on its joint face (already oriented), no supports. 0.12–0.16 mm layers.')}
${design.lip.enabled && design.print.lipIntegrated !== false ? `- ${L('La bavette est imprimée avec le corps : rien à coller.', 'The lip prints with the body: nothing to glue.')}` : ''}
${mold ? `
## ${L('Moule de coulée', 'Casting mold')}

- ${L('Deux coquilles A/B avec 4 plots de centrage (jeu 0,25 mm), entonnoir de coulée sur le dos et', 'Two halves A/B with 4 registration keys (0.25 mm clearance), pour funnel on the back and')} ${mold.vents?.length || 0} ${L('évents', 'vents')}.
- ${L('Rainure d’armature Ø', 'Armature groove Ø')} ${f1((mold.wireDia || 1.2) + 0.2)} mm ${L('qui traverse le moule : tendre le fil inox entre l’avant et l’arrière avant de fermer.', 'running through the mold: tension the wire front to back before closing.')}
- ${L('Logements des boucles de pitons sous le ventre.', 'Pockets for the hanger loops under the belly.')}
${mold.ballCount ? `- ${L('Billes de lest', 'Ballast balls')} : ${mold.ballCount} × Ø ${f1(mold.ballDia)} mm (≈ ${f2(mold.ballGrams)} g) ${L('tenues par des tétons de calage de chaque côté (petits trous Ø 1,2 mm à reboucher après démoulage).', 'held by locating pins on each side (small Ø 1.2 mm holes to fill after demolding).')}` : ''}
- ${L('Démoulant (cire ou spray PVA) sur les deux coquilles, serrer avec 2 serre-joints, couler lentement par l’entonnoir jusqu’à ce que la résine sorte des évents.', 'Release agent on both halves, clamp, pour slowly until resin appears at the vents.')}
` : ''}
## ${L('Assemblage', 'Assembly')}

1. ${L('Ébavurer les faces de joint et tester l’ajustement à blanc.', 'Deburr the joint faces and dry-fit.')}
2. ${L('Former l’armature inox, la poser dans la rainure ; coller le lest au fond de la cavité.', 'Bend the stainless harness, lay it in the groove; glue the ballast in the cavity.')}
3. ${L('Coller les deux moitiés (époxy 5 min ou cyano), maintenir serré 10 min.', 'Glue the halves (5-min epoxy or CA), clamp 10 min.')}
4. ${L('Poncer, apprêt, peinture (texture exportée), yeux, vernis époxy 2 couches.', 'Sand, prime, paint (exported texture), eyes, two coats of epoxy.')}
5. ${L('Test en bassin, régler l’attache à la pince si le leurre tire d’un côté.', 'Tank test; tune the tie with pliers if it runs to one side.')}

---
${L('Valeurs estimées par le calcul : validez toujours en bassin.', 'Computed estimates: always confirm with a tank test.')}
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
