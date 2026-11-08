import { h, section, slider, select, toggle, segmented, button, stat, icon, toast } from '../ui.js';
import { T } from '../i18n.js';
import { state, updateDesign } from '../store.js';
import { MATERIALS } from '../design.js';
import { printParts, partsToZip, partsTo3MF, buildSheet, downloadBlob, soupToSTL } from '../export.js';
import { checkManifold } from '../geometry.js';
import { fmtMass, fmtMassSigned, fmtLen } from '../units.js';
import { warnText } from './designPanel.js';

let rightEl = null, partsTimer = null, partsEl = null;
const opts = { solid: false, hollow: true };

function parts() { return printParts(state.design, opts); }

function refreshParts(app) {
  clearTimeout(partsTimer);
  partsTimer = setTimeout(() => {
    const ps = parts();
    app.studio.setParts(ps);
    if (partsEl) {
      partsEl.innerHTML = '';
      for (const p of ps) {
        const m = checkManifold(p.soup);
        partsEl.append(h('div', { class: 'part-row' },
          h('b', {}, p.label),
          h('span', {}, `${p.bounds.size.map((v) => v.toFixed(1)).join(' × ')} mm`),
          h('span', { class: m.ok ? 'ok' : 'bad' }, m.ok ? T('étanche ✓', 'watertight ✓') : T('à réparer', 'needs repair')),
          button('', () => downloadBlob(new Blob([soupToSTL(p.soup, p.label)], { type: 'model/stl' }), p.file), { cls: 'small icon-only', ic: 'download', title: p.file })));
      }
    }
  }, 120);
}

export function render(app) {
  const d = state.design;
  const setPrint = (k, v) => updateDesign((dd) => { dd.print[k] = v; }, { source: 'print' });
  const safe = app.fileSafe(d.name);

  const dl = (label, sub, ic, fn) => h('button', { type: 'button', class: 'dl-card', onclick: fn }, icon(ic, 18), h('span', {}, h('b', {}, label), h('small', {}, sub)));

  const leftEl = h('div', { class: 'panel-inner' },
    section(T('Réglages d’impression', 'Print settings'), [
      select({ label: T('Matière', 'Material'), value: d.print.material, options: Object.entries(MATERIALS).map(([k, v]) => ({ value: k, label: `${v.label} — ${v.density} g/cm³` })), onChange: (v) => setPrint('material', v) }),
      slider({ label: T('Épaisseur de paroi', 'Wall thickness'), min: 0.6, max: 4, step: 0.1, value: d.print.wall, fmt: (v) => fmtLen(v), onInput: (v) => setPrint('wall', v), hint: T('≈ 3 périmètres en buse 0,4 pour 1,2 mm', '≈ 3 perimeters with a 0.4 nozzle for 1.2 mm') }),
      slider({ label: T('Remplissage de la cavité', 'Cavity infill'), min: 0, max: 100, step: 5, value: d.print.infill, fmt: (v) => `${v} %`, onInput: (v) => setPrint('infill', v), hint: T('0 % = creux (flotte mieux)', '0% = hollow (floats best)') }),
      slider({ label: T('Apprêt + peinture + vernis', 'Primer + paint + clear'), min: 0, max: 0.5, step: 0.01, value: d.print.coat, fmt: (v) => fmtLen(v, 2), onInput: (v) => setPrint('coat', v) }),
      h('div', { class: 'field' }, h('label', {}, T('Découpe', 'Split')), segmented({
        options: [{ value: 'halves', label: T('2 demi-coques', '2 halves') }, { value: 'solid', label: T('Corps plein', 'Solid body') }],
        value: opts.solid ? 'solid' : 'halves', small: true, onChange: (v) => { opts.solid = v === 'solid'; refreshParts(app); },
      })),
      toggle({ label: T('Demi-coques creuses', 'Hollow halves'), value: opts.hollow, onChange: (v) => { opts.hollow = v; refreshParts(app); } }),
    ]),
    section(T('Pièces', 'Parts'), [partsEl = h('div', { class: 'parts' })]),
    section(T('Téléchargements', 'Downloads'), [h('div', { class: 'dl-grid' },
      dl('STL .zip', T('Toutes les pièces', 'All parts'), 'download', () => { downloadBlob(partsToZip(parts(), [{ name: `${safe}_fiche.md`, data: buildSheet(state.design, state.water) }]), `${safe}_stl.zip`); toast(T('STL exportés ✓', 'STL exported ✓')); }),
      dl('.3mf', T('Plateau prêt à trancher', 'Slicer-ready plate'), 'print', () => { downloadBlob(partsTo3MF(parts(), state.design), `${safe}.3mf`); toast(T('3MF exporté ✓', '3MF exported ✓')); }),
      dl(T('Fiche de montage', 'Build sheet'), '.md', 'ruler', () => downloadBlob(new Blob([buildSheet(state.design, state.water)], { type: 'text/markdown' }), `${safe}_fiche.md`)),
      dl(T('Projet', 'Design'), '.json', 'save', () => app.exportJson()),
      dl(T('Texture peinte', 'Paint texture'), '.png', 'paint', () => app.painter.canvas.toBlob((b) => downloadBlob(b, `${safe}_texture.png`))),
      dl(T('Capture 3D', '3D render'), '.png', 'camera', async () => {
        const st = app.studio;
        st.setMode('design');
        st.view('reset', false);
        st.update(0);
        const url = st.screenshot(1800, 1100);
        st.setMode('export');
        const blob = await (await fetch(url)).blob();
        downloadBlob(blob, `${safe}.png`);
      }),
    )]),
    section(T('Partager', 'Share'), [
      h('p', { class: 'hint' }, T('Envoyez le fichier .json à un ami : il pourra ouvrir votre leurre (forme + peinture) dans DMF Lure Studio via « Mes leurres → Importer ».', 'Send the .json file to a friend: they can open your lure (shape + paint) in DMF Lure Studio via "My lures → Import".')),
    ], { open: false }),
  );

  rightEl = h('div', { class: 'panel-inner' });
  fillRight(app);
  refreshParts(app);
  return { left: leftEl, right: rightEl, overlay: h('div', { class: 'view-toolbar' }, h('span', { class: 'chip static' }, T('Plateau 256 × 256 mm', 'Bed 256 × 256 mm'))) };
}

function fillRight(app) {
  if (!rightEl) return;
  const mp = app.massProps;
  if (!mp) return;
  rightEl.innerHTML = '';
  const cls = { floating: T('Flottant', 'Floating'), suspending: T('Suspending', 'Suspending'), sinking: T('Coulant', 'Sinking') }[mp.buoyancyClass];
  const labels = { shell: T('Coque imprimée', 'Printed shell'), infill: T('Remplissage', 'Infill'), coat: T('Finition', 'Finish coat'), lip: T('Bavette', 'Lip'), tie: T('Attache', 'Line tie'), hook: T('Hameçon + anneau', 'Hook + ring'), ballast: T('Lest', 'Ballast') };
  rightEl.append(
    section(T('Leurre fini prévu (corrigé pour l’impression)', 'Predicted finished bait (print-corrected)'), [
      h('div', { class: 'big-row' },
        h('div', { class: 'big-stat' }, h('span', { class: 'v' }, fmtMass(mp.mass)), h('span', { class: 'k' }, T('poids', 'weight'))),
        h('div', { class: 'big-stat' }, h('span', { class: 'v' }, fmtMassSigned(mp.netBuoyancy)), h('span', { class: 'k' }, T('flottabilité nette', 'net buoyancy')))),
      h('div', { class: 'pills' }, h('span', { class: `pill ${mp.buoyancyClass}` }, cls)),
      h('table', { class: 'tbl' }, h('tbody', {}, mp.items.map((i) => h('tr', {}, h('td', {}, labels[i.key]), h('td', {}, fmtMass(i.mass)))))),
      stat(T('Volume de matière', 'Material volume'), `${(mp.volumes.shell / 1000).toFixed(2)} cm³`),
      stat(T('Volume de la cavité', 'Cavity volume'), `${(mp.volumes.cavity / 1000).toFixed(2)} cm³`),
      stat(T('Filament estimé', 'Estimated filament'), `${((mp.volumes.shell / 1000) * (MATERIALS[state.design.print.material].density) * 1.08).toFixed(1)} g`),
    ]),
    section(T('Vérifications', 'Checks'), mp.warnings.length
      ? mp.warnings.map((w) => h('div', { class: 'warn-row' }, icon('help', 14), warnText(w)))
      : [h('div', { class: 'ok-row' }, '✓ ', T('Aucun problème détecté', 'No issues found'))]),
  );
}

export function onStats(app) { fillRight(app); refreshParts(app); }
export function destroy() { rightEl = null; partsEl = null; }
