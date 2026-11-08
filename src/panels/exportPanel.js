import { h, section, slider, select, toggle, segmented, button, stat, icon, toast } from '../ui.js';
import { T } from '../i18n.js';
import { state, updateDesign } from '../store.js';
import { MATERIALS } from '../design.js';
import { layoutParts, partsToZip, partsTo3MF, buildSheet, downloadBlob, soupToSTL } from '../export.js';
import { checkManifold, soupVolume, buildSolidBody, buildLipSoup } from '../geometry.js';
import { fmtMass, fmtMassSigned, fmtLen } from '../units.js';
import { warnText } from './designPanel.js';
import { runCsg } from '../csgClient.js';

let rightEl = null, partsEl = null, statusEl = null, infoEl = null, computeTimer = null, reqSeq = 0;
let current = { parts: [], features: null, kind: null };
const opts = {
  kind: 'print', split: 'halves', hollow: true, wireGroove: true,
  mold: { margin: 10, keyR: 4, sprueR: 3.5, ventR: 0.9, wireDia: 1.2, ballDia: 0 },
  master: { margin: 12, wall: 2.4 },
};

function schedule(app, delay = 500) {
  clearTimeout(computeTimer);
  computeTimer = setTimeout(() => compute(app), delay);
}

async function compute(app) {
  const id = ++reqSeq;
  if (statusEl) { statusEl.className = 'calc on'; statusEl.textContent = T('Calcul des pièces 3D…', 'Computing 3D parts…'); }
  const d = state.design;
  const kind = opts.kind;
  const o = kind === 'print' ? { mode: opts.split, hollow: opts.hollow, wireGroove: opts.wireGroove } : kind === 'mold' ? opts.mold : opts.master;
  try {
    const res = await runCsg(kind, d, o);
    if (id !== reqSeq) return;
    const parts = layoutParts(d, res.parts);
    current = { parts, features: res.features, kind };
    app.studio.setParts(parts);
    renderParts();
    if (statusEl) { statusEl.className = 'calc'; statusEl.textContent = ''; }
  } catch (e) {
    console.error(e);
    if (statusEl) { statusEl.className = 'calc err'; statusEl.textContent = T('Échec du calcul : simplifiez la forme ou réessayez.', 'Computation failed: simplify the shape or retry.'); }
  }
}

function renderParts() {
  if (!partsEl) return;
  partsEl.innerHTML = '';
  for (const p of current.parts) {
    const m = checkManifold(p.soup, 1e-4);
    const ok = m.open === 0 && m.nonManifold === 0;
    partsEl.append(h('div', { class: 'part-row' },
      h('b', {}, p.label),
      h('span', {}, `${p.bounds.size.map((v) => v.toFixed(1)).join(' × ')} mm · ${(soupVolume(p.soup).volume / 1000).toFixed(1)} cm³`),
      h('span', { class: ok ? 'ok' : 'warnc' }, ok ? T('étanche ✓', 'watertight ✓') : T('réparé (slicer OK)', 'repaired (slicer OK)')),
      button('', () => downloadBlob(new Blob([soupToSTL(p.soup, p.label)], { type: 'model/stl' }), p.file), { cls: 'small icon-only', ic: 'download', title: p.file })));
  }
  renderInfo();
}

function renderInfo() {
  if (!infoEl) return;
  infoEl.innerHTML = '';
  const d = state.design;
  const f = current.features;
  if (current.kind === 'mold' && f) {
    const lureV = soupVolume(buildSolidBody(d, 80, 48)).volume + (d.lip.enabled ? soupVolume(buildLipSoup(d)).volume * 0.8 : 0);
    infoEl.append(
      stat(T('Plots de centrage', 'Registration keys'), `${f.keys.length} × Ø ${(f.keys[0]?.[2] * 2 || 0).toFixed(1)} mm`),
      stat(T('Évents', 'Vents'), String(f.vents.length)),
      stat(T('Rainure d’armature', 'Armature groove'), `Ø ${(f.wireDia + 0.2).toFixed(1)} mm`),
      f.ballCount ? stat(T('Billes de lest', 'Ballast balls'), `${f.ballCount} × Ø ${f.ballDia} mm ≈ ${fmtMass(f.ballGrams, 1)}`) : null,
      stat(T('Résine à préparer', 'Resin to mix'), `≈ ${(lureV / 1000 * 1.15 * 1.15).toFixed(0)} g (${(lureV / 1000).toFixed(1)} cm³ + 15 %)`),
      h('p', { class: 'hint' }, T('Tendez le fil inox dans la rainure (il sort à l’avant et à l’arrière du moule), posez les billes contre les tétons, fermez avec les plots, serrez, puis coulez par l’entonnoir jusqu’à ce que la résine sorte des évents.',
        'Tension the stainless wire in its groove (it exits front and back), seat the balls against the pins, close on the keys, clamp, then pour through the funnel until resin shows at the vents.')),
    );
  } else if (current.kind === 'master' && f) {
    const lureV = soupVolume(buildSolidBody(d, 80, 48)).volume;
    const sil = Math.max(0, f.siliconeVolume - lureV / 2) / 1000;
    infoEl.append(
      stat(T('Hauteur de silicone', 'Silicone depth'), fmtLen(f.depth, 0)),
      stat(T('Silicone par coquille', 'Silicone per half'), `≈ ${sil.toFixed(0)} cm³ · ${(sil * 1.1).toFixed(0)} g`),
      h('ol', { class: 'steps-list' },
        h('li', {}, T('Imprimez les 2 contre-moules (coffrage + demi-leurre en relief).', 'Print the 2 masters (box + half-lure in relief).')),
        h('li', {}, T('Démoulant, puis coulez un silicone de moulage dur (Shore 25–40 A) dans chaque coffrage.', 'Release agent, then pour a firm mold silicone (Shore 25–40 A) in each box.')),
        h('li', {}, T('Démoulez : vous obtenez 2 coquilles en silicone avec plots de centrage, entonnoir et évents.', 'Demold: you get 2 silicone halves with keys, funnel and vents.')),
        h('li', {}, T('Talquez ou appliquez un démoulant, assemblez les coquilles et coulez le silicone/plastisol souple du leurre.', 'Dust or apply release, assemble the halves and pour the soft lure silicone/plastisol.'))),
    );
  } else if (current.kind === 'print') {
    infoEl.append(h('p', { class: 'hint' }, d.lip.enabled && d.print.lipIntegrated !== false
      ? T('La bavette est intégrée : chaque demi-coque contient sa moitié de bavette. Une rainure d’armature est creusée dans le plan de joint.', 'The lip is integrated: each half contains half of the lip. An armature groove is cut in the joint plane.')
      : T('Une rainure d’armature est creusée dans le plan de joint.', 'An armature groove is cut in the joint plane.')));
  }
}

export function render(app) {
  const d = state.design;
  const setPrint = (k, v) => { updateDesign((dd) => { dd.print[k] = v; }, { source: 'print' }); schedule(app); };
  const safe = app.fileSafe(d.name);
  const dl = (label, sub, ic, fn) => h('button', { type: 'button', class: 'dl-card', onclick: fn }, icon(ic, 18), h('span', {}, h('b', {}, label), h('small', {}, sub)));
  const sheet = () => buildSheet(state.design, state.water, { mold: current.kind === 'mold' ? current.features : null });

  const modeOpts = {
    print: [
      select({ label: T('Matière', 'Material'), value: d.print.material, options: Object.entries(MATERIALS).map(([k, v]) => ({ value: k, label: `${v.label} — ${v.density} g/cm³` })), onChange: (v) => setPrint('material', v) }),
      slider({ label: T('Épaisseur de paroi', 'Wall thickness'), min: 0.6, max: 5, step: 0.1, value: d.print.wall, fmt: (v) => fmtLen(v), onChange: (v) => setPrint('wall', v), onInput: (v) => updateDesign((dd) => { dd.print.wall = v; }, { source: 'print' }) }),
      slider({ label: T('Remplissage de la cavité', 'Cavity infill'), min: 0, max: 100, step: 5, value: d.print.infill, fmt: (v) => `${v} %`, onChange: (v) => setPrint('infill', v), hint: T('0 % = creux (flotte mieux)', '0% = hollow (floats best)') }),
      slider({ label: T('Apprêt + peinture + vernis', 'Primer + paint + clear'), min: 0, max: 0.5, step: 0.01, value: d.print.coat, fmt: (v) => fmtLen(v, 2), onInput: (v) => updateDesign((dd) => { dd.print.coat = v; }, { source: 'print' }) }),
      h('div', { class: 'field' }, h('label', {}, T('Découpe', 'Split')), segmented({
        options: [{ value: 'halves', label: T('2 demi-coques', '2 halves') }, { value: 'solid', label: T('1 pièce', '1 part') }],
        value: opts.split, small: true, onChange: (v) => { opts.split = v; schedule(app, 0); },
      })),
      toggle({ label: T('Corps creux', 'Hollow body'), value: opts.hollow, onChange: (v) => { opts.hollow = v; schedule(app, 0); } }),
      toggle({ label: T('Rainure d’armature', 'Armature groove'), value: opts.wireGroove, onChange: (v) => { opts.wireGroove = v; schedule(app, 0); } }),
      d.lip.enabled ? toggle({ label: T('Bavette intégrée (même pièce)', 'Integrated lip (same part)'), value: d.print.lipIntegrated !== false, onChange: (v) => setPrint('lipIntegrated', v) }) : null,
    ],
    mold: [
      slider({ label: T('Épaisseur autour du leurre', 'Wall around the lure'), min: 5, max: 25, step: 1, value: opts.mold.margin, fmt: (v) => fmtLen(v, 0), onChange: (v) => { opts.mold.margin = v; schedule(app, 0); } }),
      slider({ label: T('Plots de centrage (rayon)', 'Registration keys (radius)'), min: 2, max: 8, step: 0.5, value: opts.mold.keyR, fmt: (v) => fmtLen(v), onChange: (v) => { opts.mold.keyR = v; schedule(app, 0); } }),
      slider({ label: T('Entonnoir de coulée (rayon)', 'Pour funnel (radius)'), min: 1.5, max: 8, step: 0.5, value: opts.mold.sprueR, fmt: (v) => fmtLen(v), onChange: (v) => { opts.mold.sprueR = v; schedule(app, 0); } }),
      slider({ label: T('Évents (rayon)', 'Vents (radius)'), min: 0.4, max: 2, step: 0.1, value: opts.mold.ventR, fmt: (v) => fmtLen(v), onChange: (v) => { opts.mold.ventR = v; schedule(app, 0); } }),
      slider({ label: T('Fil d’armature', 'Armature wire'), min: 0.6, max: 2.5, step: 0.1, value: opts.mold.wireDia, fmt: (v) => `Ø ${fmtLen(v)}`, onChange: (v) => { opts.mold.wireDia = v; schedule(app, 0); } }),
      slider({ label: T('Billes de lest', 'Ballast balls'), min: 0, max: 12, step: 0.5, value: opts.mold.ballDia, fmt: (v) => (v ? `Ø ${fmtLen(v)}` : T('auto', 'auto')), onChange: (v) => { opts.mold.ballDia = v; schedule(app, 0); } }),
    ],
    master: [
      slider({ label: T('Épaisseur de silicone autour', 'Silicone around the lure'), min: 6, max: 25, step: 1, value: opts.master.margin, fmt: (v) => fmtLen(v, 0), onChange: (v) => { opts.master.margin = v; schedule(app, 0); } }),
      slider({ label: T('Paroi du coffrage', 'Box wall'), min: 1.2, max: 5, step: 0.2, value: opts.master.wall, fmt: (v) => fmtLen(v), onChange: (v) => { opts.master.wall = v; schedule(app, 0); } }),
    ],
  };

  statusEl = h('div', { class: 'calc' });
  infoEl = h('div', {});
  const leftEl = h('div', { class: 'panel-inner' },
    section(T('Que fabriquer ?', 'What to make?'), [
      segmented({
        options: [{ value: 'print', label: T('Impression 3D', '3D print') }, { value: 'mold', label: T('Moule de coulée', 'Casting mold') }, { value: 'master', label: T('Contre-moule silicone', 'Silicone master') }],
        value: opts.kind, small: true, onChange: (v) => { opts.kind = v; app.rerender(); },
      }),
      h('p', { class: 'hint' }, {
        print: T('Le leurre imprimé directement (PLA, PETG, résine…).', 'The lure printed directly (PLA, PETG, resin…).'),
        mold: T('Un moule rigide en 2 coquilles imprimé en 3D pour couler de la résine ou du silicone.', 'A rigid 2-part printed mold to cast resin or silicone.'),
        master: T('Des coffrages avec le leurre en relief : on y coule du silicone pour fabriquer un moule souple, puis on coule le leurre souple dedans.', 'Mold boxes with the lure in relief: pour silicone to make a soft mold, then cast the soft lure in it.'),
      }[opts.kind]),
    ]),
    section(T('Réglages', 'Settings'), modeOpts[opts.kind]),
    section(T('Pièces', 'Parts'), [statusEl, partsEl = h('div', { class: 'parts' }), infoEl]),
    section(T('Téléchargements', 'Downloads'), [h('div', { class: 'dl-grid' },
      dl('STL .zip', T('Pièces + fiche', 'Parts + sheet'), 'download', () => {
        if (!current.parts.length) return toast(T('Patientez, calcul en cours…', 'Please wait, computing…'));
        downloadBlob(partsToZip(current.parts, [{ name: `${safe}_fiche.md`, data: sheet() }]), `${safe}_${current.kind}.zip`);
        toast(T('STL exportés ✓', 'STL exported ✓'));
      }),
      dl('.3mf', T('Plateau prêt à trancher', 'Slicer-ready plate'), 'print', () => {
        if (!current.parts.length) return toast(T('Patientez, calcul en cours…', 'Please wait, computing…'));
        downloadBlob(partsTo3MF(current.parts, state.design), `${safe}_${current.kind}.3mf`);
        toast(T('3MF exporté ✓', '3MF exported ✓'));
      }),
      dl(T('Fiche de fabrication', 'Build sheet'), '.md', 'ruler', () => downloadBlob(new Blob([sheet()], { type: 'text/markdown' }), `${safe}_fiche.md`)),
      dl(T('Projet', 'Design'), '.json', 'save', () => app.exportJson()),
      dl(T('Texture peinte', 'Paint texture'), '.png', 'paint', () => app.painter.canvas.toBlob((b) => downloadBlob(b, `${safe}_texture.png`))),
      dl(T('Rendu 3D', '3D render'), '.png', 'camera', async () => {
        const st = app.studio;
        st.setMode('design');
        st.view('reset', false);
        st.update(0);
        const url = st.screenshot(1800, 1100);
        st.setMode('export');
        downloadBlob(await (await fetch(url)).blob(), `${safe}.png`);
      }),
    )]),
  );

  rightEl = h('div', { class: 'panel-inner' });
  fillRight(app);
  if (current.kind === opts.kind && current.parts.length) { app.studio.setParts(current.parts); renderParts(); }
  schedule(app, 50);
  return { left: leftEl, right: rightEl, overlay: h('div', { class: 'view-toolbar' }, h('span', { class: 'chip static' }, T('Plateau 256 × 256 mm', 'Bed 256 × 256 mm'))) };
}

function fillRight(app) {
  if (!rightEl) return;
  const mp = app.massProps;
  if (!mp) return;
  rightEl.innerHTML = '';
  const cls = { floating: T('Flottant', 'Floating'), suspending: T('Suspending', 'Suspending'), sinking: T('Coulant', 'Sinking') }[mp.buoyancyClass];
  const labels = { shell: T('Corps imprimé', 'Printed body'), infill: T('Remplissage', 'Infill'), coat: T('Finition', 'Finish coat'), lip: T('Bavette', 'Lip'), paddle: T('Palette', 'Paddle'), skirt: T('Jupe vinyle', 'Vinyl skirt'), tie: T('Attache', 'Line tie'), hook: T('Hameçon + anneau', 'Hook + ring'), ballast: T('Lest', 'Ballast') };
  rightEl.append(
    section(T('Leurre fini prévu (corrigé pour l’impression)', 'Predicted finished bait (print-corrected)'), [
      h('div', { class: 'big-row' },
        h('div', { class: 'big-stat' }, h('span', { class: 'v' }, fmtMass(mp.mass)), h('span', { class: 'k' }, T('poids', 'weight'))),
        h('div', { class: 'big-stat' }, h('span', { class: 'v' }, fmtMassSigned(mp.netBuoyancy)), h('span', { class: 'k' }, T('flottabilité nette', 'net buoyancy')))),
      h('div', { class: 'pills' }, h('span', { class: `pill ${mp.buoyancyClass}` }, cls)),
      h('table', { class: 'tbl' }, h('tbody', {}, mp.items.map((i) => h('tr', {}, h('td', {}, labels[i.key] || i.key), h('td', {}, fmtMass(i.mass)))))),
      stat(T('Volume de matière', 'Material volume'), `${(mp.volumes.shell / 1000).toFixed(2)} cm³`),
      stat(T('Filament / résine estimé', 'Estimated filament / resin'), `${((mp.volumes.shell / 1000) * MATERIALS[state.design.print.material].density * 1.08).toFixed(1)} g`),
    ]),
    section(T('Vérifications', 'Checks'), mp.warnings.length
      ? mp.warnings.map((w) => h('div', { class: 'warn-row' }, icon('help', 14), warnText(w)))
      : [h('div', { class: 'ok-row' }, '✓ ', T('Aucun problème détecté', 'No issues found'))]),
  );
}

export function onStats(app) { fillRight(app); schedule(app); }
export function destroy() { rightEl = null; partsEl = null; statusEl = null; infoEl = null; clearTimeout(computeTimer); }
