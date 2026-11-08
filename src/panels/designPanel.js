import { h, section, slider, select, toggle, segmented, button, stat, icon } from '../ui.js';
import { T, TL } from '../i18n.js';
import { state, updateDesign } from '../store.js';
import { PRESETS, HOOK_SIZES, BALLAST_MATERIALS } from '../design.js';
import { CurveEditor } from '../editors.js';
import { fmtLen, fmtMass, fmtMassSigned, fmtDepth, fmtSpeed } from '../units.js';
import { makeHydro, SwimPhysics } from '../swimPhysics.js';

let editors = [];
let rightEl = null;
let estimateTimer = null;

const mm = (v) => fmtLen(v, 1);

function set(path, v) {
  updateDesign((d) => {
    const keys = path.split('.');
    let o = d;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys.at(-1)] = v;
  }, { source: 'slider' });
}

export function render(app) {
  const d = state.design;
  editors = [new CurveEditor('side'), new CurveEditor('plan')];

  const presets = h('div', { class: 'preset-grid' }, PRESETS.map((p) => h('button', {
    type: 'button', class: 'preset-card', title: TL(p.desc),
    onclick: () => app.applyPreset(p.id),
  }, h('b', {}, TL(p.name)), h('small', {}, TL(p.desc)))));

  const body = [
    slider({ label: T('Longueur', 'Length'), min: 25, max: 180, step: 1, value: d.body.length, fmt: mm, onInput: (v) => set('body.length', v) }),
    slider({ label: T('Hauteur', 'Height'), min: 6, max: 70, step: 0.5, value: d.body.height, fmt: mm, onInput: (v) => set('body.height', v) }),
    slider({ label: T('Largeur', 'Width'), min: 5, max: 50, step: 0.5, value: d.body.width, fmt: mm, onInput: (v) => set('body.width', v) }),
    slider({ label: T('Section (rond → carré)', 'Section (round → boxy)'), min: 1.6, max: 5, step: 0.05, value: d.body.squareness, fmt: (v) => v.toFixed(2), onInput: (v) => set('body.squareness', v), hint: T('2 = ovale, > 3 = flancs plats', '2 = oval, > 3 = flat sides') }),
    slider({ label: T('Arrondi du nez', 'Nose roundness'), min: 0.03, max: 0.4, step: 0.005, value: d.body.noseRound, fmt: (v) => `${Math.round(v * 100)} %`, onInput: (v) => set('body.noseRound', v) }),
    slider({ label: T('Arrondi de la queue', 'Tail roundness'), min: 0.03, max: 0.4, step: 0.005, value: d.body.tailRound, fmt: (v) => `${Math.round(v * 100)} %`, onInput: (v) => set('body.tailRound', v) }),
  ];

  const lip = d.lip.enabled ? [
    h('div', { class: 'field' }, h('label', {}, T('Forme', 'Shape')), segmented({
      options: [{ value: 'round', label: T('Ronde', 'Round') }, { value: 'square', label: T('Carrée', 'Square') }, { value: 'coffin', label: 'Coffin' }, { value: 'bill', label: T('Bec', 'Bill') }],
      value: d.lip.shape, small: true, onChange: (v) => set('lip.shape', v),
    })),
    slider({ label: T('Longueur', 'Length'), min: 4, max: 45, step: 0.5, value: d.lip.length, fmt: mm, onInput: (v) => set('lip.length', v) }),
    slider({ label: T('Largeur', 'Width'), min: 4, max: 40, step: 0.5, value: d.lip.width, fmt: mm, onInput: (v) => set('lip.width', v) }),
    slider({ label: T('Angle', 'Angle'), min: 5, max: 90, step: 1, value: d.lip.angle, fmt: (v) => `${v}°`, onInput: (v) => set('lip.angle', v), hint: T('Plus il est horizontal, plus le leurre plonge', 'The flatter, the deeper it dives') }),
    slider({ label: T('Épaisseur', 'Thickness'), min: 0.6, max: 3, step: 0.1, value: d.lip.thickness, fmt: mm, onInput: (v) => set('lip.thickness', v) }),
    slider({ label: T('Position (depuis le nez)', 'Position (from nose)'), min: 0, max: 0.2, step: 0.005, value: d.lip.posU, fmt: (v) => mm(v * d.body.length), onInput: (v) => set('lip.posU', v) }),
    slider({ label: T('Hauteur d’ancrage', 'Mount height'), min: 0, max: 1, step: 0.01, value: d.lip.rootDepth, fmt: (v) => `${Math.round(v * 100)} %`, onInput: (v) => set('lip.rootDepth', v) }),
  ] : [h('p', { class: 'muted' }, T('Sans bavette : leurre vibrant (lipless) ou de surface.', 'No lip: lipless / topwater bait.'))];

  const tieModes = [{ value: 'nose', label: T('Nez', 'Nose') }, { value: 'back', label: T('Dos', 'Back') }];
  if (d.lip.enabled) tieModes.splice(1, 0, { value: 'lip', label: T('Bavette', 'Lip') });
  const hooks = [
    h('div', { class: 'field' }, h('label', {}, T('Attache de ligne', 'Line tie')), segmented({ options: tieModes, value: d.lip.enabled || d.lineTie.mode !== 'lip' ? d.lineTie.mode : 'nose', small: true, onChange: (v) => { set('lineTie.mode', v); app.rerender(); } })),
    d.lineTie.mode === 'lip' && d.lip.enabled ? slider({ label: T('Position sur la bavette', 'Position on lip'), min: 0.05, max: 0.9, step: 0.01, value: d.lineTie.lipPos, fmt: (v) => `${Math.round(v * 100)} %`, onInput: (v) => set('lineTie.lipPos', v) }) : null,
    h('div', { class: 'field' }, h('label', {}, T('Hameçons ventraux', 'Belly hooks')), segmented({
      options: [0, 1, 2, 3].map((n) => ({ value: n, label: String(n) })), value: d.hooks.belly.length, small: true,
      onChange: (n) => {
        updateDesign((dd) => {
          const cur = dd.hooks.belly;
          const size = cur[0]?.size || 4;
          const pos = { 0: [], 1: [0.4], 2: [0.3, 0.62], 3: [0.26, 0.5, 0.74] }[n];
          dd.hooks.belly = pos.map((u, i) => ({ u: cur[i]?.u && n === cur.length ? cur[i].u : u, size }));
        });
        app.rerender();
      },
    })),
    ...d.hooks.belly.map((hk, i) => h('div', { class: 'hook-row' },
      slider({ label: `${T('Hameçon', 'Hook')} ${i + 1}`, min: 0.12, max: 0.88, step: 0.01, value: hk.u, fmt: (v) => mm(v * d.body.length), onInput: (v) => updateDesign((dd) => { dd.hooks.belly[i].u = v; }, { source: 'slider' }) }),
      select({ label: '', options: Object.keys(HOOK_SIZES).map((s) => ({ value: s, label: `#${s}` })), value: hk.size, onChange: (v) => updateDesign((dd) => { dd.hooks.belly[i].size = Number(v); }) }))),
    h('div', { class: 'hook-row' },
      toggle({ label: T('Hameçon de queue', 'Tail hook'), value: d.hooks.tail.enabled, onChange: (v) => set('hooks.tail.enabled', v) }),
      select({ label: '', options: Object.keys(HOOK_SIZES).map((s) => ({ value: s, label: `#${s}` })), value: d.hooks.tail.size, onChange: (v) => set('hooks.tail.size', Number(v)) })),
  ];

  const eyes = [
    toggle({ label: T('Yeux 3D', '3D eyes'), value: d.eyes.enabled, onChange: (v) => set('eyes.enabled', v) }),
    slider({ label: T('Diamètre', 'Diameter'), min: 2, max: 14, step: 0.1, value: d.eyes.size, fmt: mm, onInput: (v) => set('eyes.size', v) }),
    slider({ label: T('Position', 'Position'), min: 0.04, max: 0.4, step: 0.005, value: d.eyes.u, fmt: (v) => mm(v * d.body.length), onInput: (v) => set('eyes.u', v) }),
    slider({ label: T('Hauteur', 'Height'), min: 0.3, max: 1.5, step: 0.01, value: d.eyes.theta, fmt: (v) => `${Math.round((1 - v / 1.57) * 100)} %`, onInput: (v) => set('eyes.theta', v) }),
  ];

  const ballast = [
    slider({ label: T('Masse de lest', 'Ballast mass'), min: 0, max: 30, step: 0.1, value: d.ballast.grams, fmt: (v) => fmtMass(v, 1), onInput: (v) => set('ballast.grams', v) }),
    slider({ label: T('Position', 'Position'), min: 0.15, max: 0.85, step: 0.01, value: d.ballast.u, fmt: (v) => mm(v * d.body.length), onInput: (v) => set('ballast.u', v) }),
    select({ label: T('Matière', 'Material'), options: Object.entries(BALLAST_MATERIALS).map(([k, v]) => ({ value: k, label: v.label })), value: d.ballast.material, onChange: (v) => set('ballast.material', v) }),
    h('div', { class: 'btn-row' }, button(T('Ajuster pour suspending', 'Tune to suspend'), () => {
      const mp = app.massProps;
      if (!mp) return;
      updateDesign((dd) => { dd.ballast.grams = Math.max(0, Math.round((dd.ballast.grams + mp.ballastToSuspend) * 10) / 10); });
      app.rerender();
    }, { cls: 'small' })),
  ];

  const leftEl = h('div', { class: 'panel-inner' },
    section(T('Base de départ', 'Starting point'), [presets], { open: true }),
    section(T('Corps', 'Body'), body),
    section(T('Profil (vue de côté)', 'Profile (side view)'), [editors[0].canvas, h('p', { class: 'hint' }, T('Glissez les points · double-clic : ajouter · clic droit : supprimer', 'Drag points · double-click: add · right-click: remove'))]),
    section(T('Vue de dessus', 'Top view'), [editors[1].canvas]),
    section(T('Bavette', 'Lip'), [toggle({ label: T('Bavette', 'Lip'), value: d.lip.enabled, onChange: (v) => { set('lip.enabled', v); app.rerender(); } }), ...lip]),
    section(T('Attache & hameçons', 'Line tie & hooks'), hooks),
    section(T('Yeux', 'Eyes'), eyes, { open: false }),
    section(T('Lest (plombage)', 'Ballast (weight)'), ballast),
  );

  rightEl = h('div', { class: 'panel-inner' });
  fillRight(app);

  const overlay = h('div', { class: 'view-toolbar' },
    ...[['reset', T('3/4', '3/4')], ['left', T('Côté', 'Side')], ['top', T('Dessus', 'Top')], ['belly', T('Ventre', 'Belly')], ['front', T('Face', 'Front')]]
      .map(([v, l]) => h('button', { type: 'button', class: 'chip', onclick: () => app.studio.view(v) }, l)));
  requestAnimationFrame(() => editors.forEach((e) => e.draw()));
  scheduleEstimate(app);
  return { left: leftEl, right: rightEl, overlay };
}

function fillRight(app) {
  if (!rightEl) return;
  const mp = app.massProps;
  const d = state.design;
  rightEl.innerHTML = '';
  if (!mp) return;
  const cls = { floating: T('Flottant', 'Floating'), suspending: T('Suspending', 'Suspending'), sinking: T('Coulant', 'Sinking') }[mp.buoyancyClass];
  const stable = mp.righting > 0.3;
  rightEl.append(
    section(T('Leurre fini (prévu)', 'Finished bait (predicted)'), [
      h('div', { class: 'big-stat' }, h('span', { class: 'v' }, fmtMass(mp.mass)), h('span', { class: 'k' }, T('masse totale', 'total mass'))),
      h('div', { class: 'pills' },
        h('span', { class: `pill ${mp.buoyancyClass}` }, cls, ' ', fmtMassSigned(mp.netBuoyancy)),
        h('span', { class: `pill ${stable ? 'ok' : 'warn'}` }, stable ? T('Stable', 'Stable') : T('Instable', 'Unstable'))),
      stat(T('Longueur', 'Length'), mm(mp.dims.length)),
      stat(T('Hauteur', 'Height'), mm(mp.dims.height)),
      stat(T('Largeur', 'Width'), mm(mp.dims.width)),
      stat(T('Volume', 'Volume'), `${(mp.displacement / 1000).toFixed(2)} cm³`),
      stat(T('Bras de redressement', 'Righting arm'), mm(mp.righting)),
      stat(T('Pour suspendre', 'To suspend'), `${mp.ballastToSuspend >= 0 ? '+' : ''}${fmtMass(mp.ballastToSuspend)} ${T('de lest', 'ballast')}`),
    ]),
    section(T('Comportement estimé', 'Estimated behaviour'), [h('div', { id: 'estimate' }, h('p', { class: 'muted' }, T('Calcul…', 'Computing…')))]),
    section(T('Affichage', 'Display'), [
      toggle({ label: T('Quincaillerie', 'Hardware'), value: app.studio.options.hardware, onChange: (v) => { app.studio.setOptions({ hardware: v }); app.studio.setLure(d, app.painter.texture); } }),
      toggle({ label: T('Centres de gravité / poussée', 'CG / CB markers'), hint: T('rouge = gravité, bleu = poussée', 'red = gravity, blue = buoyancy'), value: app.studio.options.markers, onChange: (v) => app.studio.setOptions({ markers: v }) }),
      toggle({ label: T('Rayons X', 'X-ray'), value: app.studio.options.xray, onChange: (v) => { app.studio.setOptions({ xray: v }); app.studio.setLure(d, app.painter.texture); } }),
      toggle({ label: T('Fil de fer', 'Wireframe'), value: app.studio.options.wireframe, onChange: (v) => { app.studio.setOptions({ wireframe: v }); app.studio.setLure(d, app.painter.texture); } }),
    ]),
    ...(mp.warnings.length ? [section(T('Avertissements', 'Warnings'), mp.warnings.map((w) => h('div', { class: 'warn-row' }, icon('help', 14), warnText(w))))] : []),
  );
}

export function warnText(w) {
  return {
    wallThin: T('Paroi < 0,8 mm : fragile à l’impression.', 'Wall < 0.8 mm: fragile when printed.'),
    lipThin: T('Bavette < 0,9 mm : risque de casse.', 'Lip < 0.9 mm: may break.'),
    unstable: T('Centre de gravité trop haut : le leurre risque de se retourner. Ajoutez du lest bas.', 'CG too high: the bait may roll over. Add low ballast.'),
    ballastFit: T('Le lest ne tient pas dans la cavité : réduisez-le ou utilisez du tungstène.', 'Ballast does not fit the cavity: reduce it or use tungsten.'),
    noCavity: T('Corps trop fin pour être creux.', 'Body too thin to be hollow.'),
  }[w] || w;
}

function scheduleEstimate(app) {
  clearTimeout(estimateTimer);
  estimateTimer = setTimeout(() => runEstimate(app), 160);
}

function runEstimate(app) {
  const el = document.getElementById('estimate');
  const mp = app.massProps;
  if (!el || !mp) return;
  const hyd = makeHydro(state.design, mp, state.water);
  const sim = new SwimPhysics(hyd, { scenario: 'steady', speed: 0.9, cast: 20, depth: 12 });
  let n = 0;
  while (!sim.finished && n < 40000) { sim.step(1 / 250); n++; }
  const M = sim.metrics;
  const freq = M.freqSum / (M.freqN || 1);
  const action = hyd.yawAmp > 12 ? T('large (wide wobble)', 'wide wobble') : hyd.yawAmp > 7 ? T('moyenne', 'medium') : T('serrée (tight)', 'tight');
  el.innerHTML = '';
  el.append(
    stat(T('Profondeur max (0,9 m/s)', 'Max depth (0.9 m/s)'), fmtDepth(M.maxDepth)),
    stat(T('Fréquence de wobble', 'Wobble frequency'), `${freq.toFixed(1)} Hz`),
    stat(T('Action', 'Action'), action),
    stat(T('Vitesse de décrochage', 'Blow-out speed'), hyd.vCrit > 3 ? '> 3 m/s' : fmtSpeed(hyd.vCrit)),
  );
}

export function onDesign(app, source) {
  editors.forEach((e) => e.draw());
  if (source === 'replace' || source === 'undo' || source === 'redo') return;
}

export function onStats(app) {
  const open = rightEl ? [...rightEl.querySelectorAll('.sec')].map((s) => s.classList.contains('closed')) : [];
  fillRight(app);
  if (rightEl) [...rightEl.querySelectorAll('.sec')].forEach((s, i) => { if (open[i]) s.classList.add('closed'); });
  scheduleEstimate(app);
}

export function destroy() {
  editors.forEach((e) => e.destroy());
  editors = [];
  rightEl = null;
}
