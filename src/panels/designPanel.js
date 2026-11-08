import { h, section, slider, select, toggle, segmented, button, stat, icon, colorInput } from '../ui.js';
import { T, TL } from '../i18n.js';
import { state, updateDesign } from '../store.js';
import { PRESETS, TREBLES, SINGLES, SPLIT_RINGS, BALLAST_MATERIALS, LURE_TYPES, hookSpec } from '../design.js';
import { CurveEditor } from '../editors.js';
import { fmtLen, fmtMass, fmtMassSigned, fmtDepth } from '../units.js';
import { makeHydro, SwimPhysics, KNOT } from '../swimPhysics.js';
import { BALLAST_TARGETS, ballastForTarget, restingAttitude } from '../physics.js';
import { makeProfile, sectionXYZ } from '../geometry.js';

let editors = [];
let rightEl = null;
let estimateTimer = null;
let sectionCanvas = null;

const mm = (v) => fmtLen(v, 1);

function set(path, v, source = 'slider') {
  updateDesign((d) => {
    const keys = path.split('.');
    let o = d;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys.at(-1)] = v;
  }, { source });
}

// Aperçu de la section (vue de face) : forme dos / ventre / V
function drawSection() {
  const c = sectionCanvas;
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth || 260, hh = c.clientHeight || 130;
  c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr);
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, hh);
  const d = state.design;
  const P = makeProfile(d);
  let best = 0.4, bh = 0;
  for (let i = 5; i < 95; i++) { const u = i / 100; const v = P.top(u) + P.bot(u); if (v > bh) { bh = v; best = u; } }
  const top = P.top(best), bot = P.bot(best), hw = P.hw(best);
  const scale = Math.min((w * 0.42) / Math.max(1, hw * Math.max(1, P.bw, P.vw)), (hh * 0.85) / (top + bot));
  const cx = w / 2, cy = hh / 2 + ((top - bot) / 2) * scale;
  const pts = [];
  for (let j = 0; j <= 96; j++) { const p = sectionXYZ(P, best, (j / 96) * Math.PI * 2, top, bot, hw); pts.push([cx + p[2] * scale, cy - p[1] * scale]); }
  g.strokeStyle = 'rgba(120,180,190,0.35)';
  g.beginPath(); g.moveTo(cx, 6); g.lineTo(cx, hh - 6); g.moveTo(10, cy); g.lineTo(w - 10, cy); g.stroke();
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.fillStyle = 'rgba(47,211,181,0.15)';
  g.fill();
  g.strokeStyle = '#2fd3b5';
  g.lineWidth = 2;
  g.stroke();
  const wall = d.print.wall;
  g.setLineDash([3, 3]);
  g.strokeStyle = 'rgba(200,230,235,0.45)';
  g.beginPath();
  for (let j = 0; j <= 96; j++) {
    const p = sectionXYZ(P, best, (j / 96) * Math.PI * 2, Math.max(0, top - wall), Math.max(0, bot - wall), Math.max(0, hw - wall));
    const x = cx + p[2] * scale, y = cy - p[1] * scale;
    if (j) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(200,230,235,0.75)';
  g.font = '11px system-ui, sans-serif';
  g.fillText(T('dos', 'back'), cx + 6, 14);
  g.fillText(T('ventre', 'belly'), cx + 6, hh - 6);
}

export function render(app) {
  const d = state.design;
  editors = [new CurveEditor('side'), new CurveEditor('plan')];

  const presets = h('div', { class: 'preset-grid' }, PRESETS.map((p) => h('button', {
    type: 'button', class: 'preset-card' + (d.type === (p.over.type || 'minnow') && d.name === (p.over.name || 'Minnow') ? ' on' : ''), title: TL(p.desc),
    onclick: () => app.applyPreset(p.id),
  }, h('b', {}, TL(p.name)), h('small', {}, TL(p.desc)))));

  const body = [
    slider({ label: T('Longueur', 'Length'), min: 25, max: 300, step: 1, value: d.body.length, fmt: mm, onInput: (v) => set('body.length', v) }),
    slider({ label: T('Hauteur', 'Height'), min: 6, max: 90, step: 0.5, value: d.body.height, fmt: mm, onInput: (v) => set('body.height', v) }),
    slider({ label: T('Largeur', 'Width'), min: 5, max: 70, step: 0.5, value: d.body.width, fmt: mm, onInput: (v) => set('body.width', v) }),
    slider({ label: T('Arrondi du nez', 'Nose roundness'), min: 0.02, max: 0.4, step: 0.005, value: d.body.noseRound, fmt: (v) => `${Math.round(v * 100)} %`, onInput: (v) => set('body.noseRound', v) }),
    slider({ label: T('Arrondi de la queue', 'Tail roundness'), min: 0.02, max: 0.4, step: 0.005, value: d.body.tailRound, fmt: (v) => `${Math.round(v * 100)} %`, onInput: (v) => set('body.tailRound', v) }),
    slider({ label: T('Tête concave (popper)', 'Cupped face (popper)'), min: 0, max: 30, step: 0.5, value: d.body.cup || 0, fmt: (v) => (v ? mm(v) : T('aucune', 'none')), onInput: (v) => set('body.cup', v), hint: T('Creuse la face avant : « bloop » et éclaboussures', 'Hollows the face: bloop and splash') }),
  ];

  sectionCanvas = h('canvas', { class: 'section-preview' });
  const sec = [
    sectionCanvas,
    slider({ label: T('Largeur du dos', 'Back width'), min: 0.3, max: 1.6, step: 0.02, value: d.body.backWidth ?? 1, fmt: (v) => `× ${v.toFixed(2)}`, onInput: (v) => set('body.backWidth', v), hint: T('> 1 : dos plus épais que le ventre', '> 1: back thicker than belly') }),
    slider({ label: T('Largeur du ventre', 'Belly width'), min: 0.1, max: 1.6, step: 0.02, value: d.body.bellyWidth ?? 1, fmt: (v) => `× ${v.toFixed(2)}`, onInput: (v) => set('body.bellyWidth', v) }),
    slider({ label: T('Ventre en V (quille)', 'V belly (keel)'), min: 0, max: 1, step: 0.02, value: d.body.keel ?? 0, fmt: (v) => `${Math.round(v * 100)} %`, onInput: (v) => set('body.keel', v), hint: T('Coque en V : nage plus stable, roule moins', 'V hull: steadier, rolls less') }),
    slider({ label: T('Section ronde → carrée', 'Round → boxy section'), min: 1.6, max: 5, step: 0.05, value: d.body.squareness, fmt: (v) => v.toFixed(2), onInput: (v) => set('body.squareness', v) }),
  ];

  const lip = d.lip.enabled ? [
    h('div', { class: 'field' }, h('label', {}, T('Forme', 'Shape')), segmented({
      options: [{ value: 'round', label: T('Ronde', 'Round') }, { value: 'square', label: T('Carrée', 'Square') }, { value: 'coffin', label: 'Coffin' }, { value: 'bill', label: T('Bec (traîne)', 'Bill (troll)') }],
      value: d.lip.shape, small: true, onChange: (v) => set('lip.shape', v),
    })),
    slider({ label: T('Longueur', 'Length'), min: 4, max: 90, step: 0.5, value: d.lip.length, fmt: mm, onInput: (v) => set('lip.length', v) }),
    slider({ label: T('Largeur', 'Width'), min: 4, max: 60, step: 0.5, value: d.lip.width, fmt: mm, onInput: (v) => set('lip.width', v) }),
    slider({ label: T('Angle', 'Angle'), min: 5, max: 90, step: 1, value: d.lip.angle, fmt: (v) => `${v}°`, onInput: (v) => set('lip.angle', v), hint: T('15–30° : plonge profond · 45° : moyen · 70–90° : reste en surface', '15–30°: dives deep · 45°: medium · 70–90°: stays shallow') }),
    slider({ label: T('Épaisseur', 'Thickness'), min: 0.6, max: 5, step: 0.1, value: d.lip.thickness, fmt: mm, onInput: (v) => set('lip.thickness', v) }),
    slider({ label: T('Creux (relief)', 'Scoop (relief)'), min: 0, max: 1, step: 0.02, value: d.lip.scoop ?? 0, fmt: (v) => `${Math.round(v * 100)} %`, onInput: (v) => set('lip.scoop', v), hint: T('Bords relevés en cuillère, comme les bavettes de traîne', 'Raised spoon edges, like trolling bills') }),
    slider({ label: T('Nervure centrale', 'Center rib'), min: 0, max: 1, step: 0.02, value: d.lip.rib ?? 0, fmt: (v) => `${Math.round(v * 100)} %`, onInput: (v) => set('lip.rib', v) }),
    slider({ label: T('Congé à la racine', 'Root fillet'), min: 0, max: 1.5, step: 0.05, value: d.lip.rootFlare ?? 0.6, fmt: (v) => `${Math.round(v * 100)} %`, onInput: (v) => set('lip.rootFlare', v), hint: T('Épaissit la jonction : la bavette se fond dans le corps', 'Thickens the joint: the lip blends into the body') }),
    slider({ label: T('Position (depuis le nez)', 'Position (from nose)'), min: 0, max: 0.2, step: 0.005, value: d.lip.posU, fmt: (v) => mm(v * d.body.length), onInput: (v) => set('lip.posU', v) }),
    slider({ label: T('Hauteur d’ancrage', 'Mount height'), min: 0, max: 1, step: 0.01, value: d.lip.rootDepth, fmt: (v) => `${Math.round(v * 100)} %`, onInput: (v) => set('lip.rootDepth', v) }),
    toggle({ label: T('Bavette intégrée au corps', 'Lip integrated in the body'), hint: T('Une seule pièce (ou 2 demi-coques)', 'One part (or 2 halves)'), value: d.print.lipIntegrated !== false, onChange: (v) => set('print.lipIntegrated', v, 'print') }),
  ] : [h('p', { class: 'muted' }, T('Sans bavette : stickbait, popper, bonito, jupe…', 'No lip: stickbait, popper, bonito, skirt…'))];

  const tieModes = [{ value: 'nose', label: T('Nez', 'Nose') }, { value: 'back', label: T('Dos', 'Back') }];
  if (d.lip.enabled) tieModes.splice(1, 0, { value: 'lip', label: T('Bavette', 'Lip') });
  const hk = d.hooks;
  const table = hk.type === 'single' ? SINGLES : TREBLES;
  const sizeOpts = Object.keys(table).map((s) => ({ value: s, label: `${s.includes('/') ? s : '#' + s}` }));
  const recBox = h('div', { class: 'rec-box', id: 'hw-rec' });
  const hooks = [
    h('div', { class: 'field' }, h('label', {}, T('Attache de ligne', 'Line tie')), segmented({ options: tieModes, value: d.lip.enabled || d.lineTie.mode !== 'lip' ? d.lineTie.mode : 'nose', small: true, onChange: (v) => { set('lineTie.mode', v); app.rerender(); } })),
    d.lineTie.mode === 'lip' && d.lip.enabled ? slider({ label: T('Position sur la bavette', 'Position on lip'), min: 0.05, max: 0.9, step: 0.01, value: d.lineTie.lipPos, fmt: (v) => `${Math.round(v * 100)} %`, onInput: (v) => set('lineTie.lipPos', v) }) : null,
    h('div', { class: 'field' }, h('label', {}, T('Type d’hameçon', 'Hook type')), segmented({
      options: [{ value: 'treble', label: T('Triple', 'Treble') }, { value: 'single', label: T('Simple', 'Single') }], value: hk.type, small: true,
      onChange: (v) => { updateDesign((x) => { x.hooks.type = v; const t = v === 'single' ? SINGLES : TREBLES; const k = Object.keys(t)[3]; x.hooks.belly.forEach((b) => { b.size = k; }); x.hooks.tail.size = k; }); app.rerender(); },
    })),
    toggle({ label: T('Taille automatique selon le poids', 'Auto size from weight'), hint: T('Hameçons et anneaux brisés (tableaux Owner / BKK)', 'Hooks and split rings (Owner / BKK tables)'), value: hk.auto, onChange: (v) => { set('hooks.auto', v, 'replace'); app.rerender(); } }),
    recBox,
    h('div', { class: 'field' }, h('label', {}, T('Hameçons ventraux', 'Belly hooks')), segmented({
      options: [0, 1, 2, 3].map((n) => ({ value: n, label: String(n) })), value: hk.belly.length, small: true,
      onChange: (n) => {
        updateDesign((dd) => {
          const cur = dd.hooks.belly;
          const size = cur[0]?.size || dd.hooks.tail.size;
          const pos = { 0: [], 1: [0.4], 2: [0.3, 0.62], 3: [0.26, 0.5, 0.74] }[n];
          dd.hooks.belly = pos.map((u, i) => ({ u: n === cur.length ? cur[i].u : u, size }));
        });
        app.rerender();
      },
    })),
    ...hk.belly.map((b, i) => h('div', { class: 'hook-row' },
      slider({ label: `${T('Hameçon', 'Hook')} ${i + 1}`, min: 0.08, max: 0.92, step: 0.01, value: b.u, fmt: (v) => mm(v * d.body.length), onInput: (v) => updateDesign((dd) => { dd.hooks.belly[i].u = v; }, { source: 'slider' }) }),
      hk.auto ? h('div', { class: 'size-tag' }, b.size) : select({ label: '', options: sizeOpts, value: b.size, onChange: (v) => updateDesign((dd) => { dd.hooks.belly[i].size = v; }) }))),
    h('div', { class: 'hook-row' },
      toggle({ label: T('Hameçon de queue', 'Tail hook'), value: hk.tail.enabled, onChange: (v) => set('hooks.tail.enabled', v) }),
      hk.auto ? h('div', { class: 'size-tag' }, hk.tail.size) : select({ label: '', options: sizeOpts, value: hk.tail.size, onChange: (v) => set('hooks.tail.size', v) })),
    hk.tail.enabled ? slider({ label: T('Hameçon traînant (câble)', 'Trailing hook (cable)'), min: 0, max: 250, step: 1, value: hk.tail.trail || 0, fmt: (v) => (v ? mm(v) : T('directement en queue', 'right at the tail')), onInput: (v) => set('hooks.tail.trail', v) }) : null,
    hk.auto ? null : select({ label: T('Anneaux brisés', 'Split rings'), value: hk.ring, options: Object.entries(SPLIT_RINGS).map(([k, v]) => ({ value: k, label: `${v.label} (${v.lb} lb)` })), onChange: (v) => set('hooks.ring', v) }),
  ];

  const f = d.features;
  const options = [
    toggle({ label: T('Jupe vinyle (traîne)', 'Vinyl skirt (troll)'), value: f.skirt.enabled, onChange: (v) => { set('features.skirt.enabled', v); app.rerender(); } }),
    ...(f.skirt.enabled ? [
      slider({ label: T('Longueur de jupe', 'Skirt length'), min: 30, max: 300, step: 5, value: f.skirt.length, fmt: mm, onInput: (v) => set('features.skirt.length', v) }),
      slider({ label: T('Nombre de lanières', 'Strands'), min: 8, max: 64, step: 2, value: f.skirt.strands, fmt: (v) => String(v), onInput: (v) => set('features.skirt.strands', v) }),
      h('div', { class: 'grad-row' },
        colorInput({ value: f.skirt.color1, label: T('Couleur 1', 'Color 1'), onChange: (c) => set('features.skirt.color1', c, 'finish') }),
        colorInput({ value: f.skirt.color2, label: T('Couleur 2', 'Color 2'), onChange: (c) => set('features.skirt.color2', c, 'finish') })),
    ] : []),
    toggle({ label: T('Tube central (bas de ligne traversant)', 'Center tube (through leader)'), value: f.leaderHole.enabled, onChange: (v) => { set('features.leaderHole.enabled', v); app.rerender(); } }),
    f.leaderHole.enabled ? slider({ label: T('Diamètre du tube', 'Tube diameter'), min: 1, max: 10, step: 0.1, value: f.leaderHole.dia, fmt: mm, onInput: (v) => set('features.leaderHole.dia', v) }) : null,
    toggle({ label: T('Queue vibrante (palette)', 'Paddle tail'), value: f.paddle.enabled, onChange: (v) => { set('features.paddle.enabled', v); app.rerender(); } }),
    f.paddle.enabled ? slider({ label: T('Taille de la palette', 'Paddle size'), min: 6, max: 60, step: 0.5, value: f.paddle.size, fmt: mm, onInput: (v) => set('features.paddle.size', v) }) : null,
  ];

  const eyes = [
    toggle({ label: T('Yeux 3D', '3D eyes'), value: d.eyes.enabled, onChange: (v) => set('eyes.enabled', v) }),
    slider({ label: T('Diamètre', 'Diameter'), min: 2, max: 25, step: 0.1, value: d.eyes.size, fmt: mm, onInput: (v) => set('eyes.size', v) }),
    slider({ label: T('Position', 'Position'), min: 0.03, max: 0.6, step: 0.005, value: d.eyes.u, fmt: (v) => mm(v * d.body.length), onInput: (v) => set('eyes.u', v) }),
    slider({ label: T('Hauteur', 'Height'), min: 0.3, max: 1.5, step: 0.01, value: d.eyes.theta, fmt: (v) => `${Math.round((1 - v / 1.57) * 100)} %`, onInput: (v) => set('eyes.theta', v) }),
  ];

  const targetsEl = h('div', { class: 'target-grid', id: 'targets' });
  const ballast = [
    slider({ label: T('Masse de lest', 'Ballast mass'), min: 0, max: 250, step: 0.1, value: d.ballast.grams, fmt: (v) => fmtMass(v, 1), onInput: (v) => set('ballast.grams', v) }),
    slider({ label: T('Position', 'Position'), min: 0.05, max: 0.9, step: 0.01, value: d.ballast.u, fmt: (v) => mm(v * d.body.length), onInput: (v) => set('ballast.u', v) }),
    select({ label: T('Matière', 'Material'), options: Object.entries(BALLAST_MATERIALS).map(([k, v]) => ({ value: k, label: v.label })), value: d.ballast.material, onChange: (v) => set('ballast.material', v) }),
    h('label', { class: 'sub-label' }, T('Lester pour obtenir…', 'Ballast to get…')),
    targetsEl,
  ];

  const leftEl = h('div', { class: 'panel-inner' },
    section(T('Base de départ', 'Starting point'), [presets]),
    section(T('Corps', 'Body'), body),
    section(T('Section : dos, ventre, forme en V', 'Section: back, belly, V shape'), sec),
    section(T('Profil (vue de côté)', 'Profile (side view)'), [editors[0].canvas, h('p', { class: 'hint' }, T('Glissez les points · double-clic : ajouter · clic droit : supprimer', 'Drag points · double-click: add · right-click: remove'))]),
    section(T('Vue de dessus', 'Top view'), [editors[1].canvas]),
    section(T('Bavette', 'Lip'), [toggle({ label: T('Bavette', 'Lip'), value: d.lip.enabled, onChange: (v) => { set('lip.enabled', v); app.rerender(); } }), ...lip]),
    section(T('Attache, hameçons & anneaux', 'Tie, hooks & rings'), hooks),
    section(T('Options (jupe, tube, palette)', 'Options (skirt, tube, paddle)'), options, { open: d.type === 'skirt' || d.type === 'soft' }),
    section(T('Yeux', 'Eyes'), eyes, { open: false }),
    section(T('Lest et flottabilité', 'Ballast & buoyancy'), ballast),
  );

  rightEl = h('div', { class: 'panel-inner' });
  fillRight(app);
  fillDynamic(app);

  const overlay = h('div', { class: 'view-toolbar' },
    ...[['reset', '3/4'], ['left', T('Côté', 'Side')], ['top', T('Dessus', 'Top')], ['belly', T('Ventre', 'Belly')], ['front', T('Face', 'Front')]]
      .map(([v, l]) => h('button', { type: 'button', class: 'chip', onclick: () => app.studio.view(v) }, l)));
  requestAnimationFrame(() => { editors.forEach((e) => e.draw()); drawSection(); });
  scheduleEstimate(app);
  return { left: leftEl, right: rightEl, overlay };
}

// Éléments qui dépendent de la masse calculée (recommandations, objectifs de lest)
function fillDynamic(app) {
  const mp = app.massProps;
  if (!mp) return;
  const d = state.design;
  const rec = document.getElementById('hw-rec');
  if (rec) {
    const r = mp.hardware;
    const tr = hookSpec('treble', r.treble), si = hookSpec('single', r.single);
    rec.innerHTML = '';
    rec.append(
      h('b', {}, `${T('Pour', 'For')} ${fmtMass(mp.mass, 0)} :`),
      h('span', {}, `${T('Triple', 'Treble')} ${tr.ref} · ${tr.mass} g`),
      h('span', {}, `${T('Simple', 'Single')} ${si.ref} · ${si.mass} g`),
      h('span', {}, `${T('Anneau', 'Ring')} ${SPLIT_RINGS[r.ring].label}${r.ringAlt && r.ringAlt !== r.ring ? ` ${T('ou', 'or')} ${SPLIT_RINGS[r.ringAlt].label}` : ''}`),
      h('span', {}, `${T('Bas de ligne', 'Leader')} ${r.leader} · ${r.strength}`));
  }
  const tags = [...document.querySelectorAll('.size-tag')];
  const sizes = [...d.hooks.belly.map((b) => b.size), d.hooks.tail.size];
  tags.forEach((el, i) => { if (sizes[i]) el.textContent = sizes[i].includes('/') ? sizes[i] : `#${sizes[i]}`; });
  const tg = document.getElementById('targets');
  if (tg) {
    tg.innerHTML = '';
    for (const t of BALLAST_TARGETS) {
      const delta = ballastForTarget(d, mp, t.id, state.water);
      const possible = d.ballast.grams + delta >= 0;
      tg.append(h('button', {
        type: 'button', class: 'target' + (possible ? '' : ' disabled'), title: TL({ fr: t.descFr, en: t.descEn }),
        onclick: () => {
          if (!possible) return;
          updateDesign((x) => { x.ballast.grams = Math.max(0, Math.round((x.ballast.grams + delta) * 10) / 10); });
          app.rerender();
        },
      }, h('b', {}, TL({ fr: t.fr, en: t.en })), h('small', {}, possible ? `${delta >= 0 ? '+' : ''}${fmtMass(delta, 1)}` : T('trop léger : retirer de la matière', 'too light: remove material'))));
    }
  }
}

function fillRight(app) {
  if (!rightEl) return;
  const mp = app.massProps;
  const d = state.design;
  rightEl.innerHTML = '';
  if (!mp) return;
  const cls = { floating: T('Flottant', 'Floating'), suspending: T('Suspending', 'Suspending'), sinking: T('Coulant', 'Sinking') }[mp.buoyancyClass];
  const stable = mp.righting > 0.3;
  let rest = null;
  try { rest = restingAttitude(d, mp, state.water); } catch { /* ignore */ }
  rightEl.append(
    section(T('Leurre fini (prévu)', 'Finished bait (predicted)'), [
      h('div', { class: 'big-stat' }, h('span', { class: 'v' }, fmtMass(mp.mass)), h('span', { class: 'k' }, `${T('masse totale', 'total mass')} · ${TL(LURE_TYPES[d.type] || LURE_TYPES.minnow)}`)),
      h('div', { class: 'pills' },
        h('span', { class: `pill ${mp.buoyancyClass}` }, cls, ' ', fmtMassSigned(mp.netBuoyancy)),
        h('span', { class: `pill ${stable ? 'ok' : 'warn'}` }, stable ? T('Stable', 'Stable') : T('Instable', 'Unstable'))),
      stat(T('Longueur', 'Length'), mm(mp.dims.length)),
      stat(T('Hauteur', 'Height'), mm(mp.dims.height)),
      stat(T('Largeur', 'Width'), mm(mp.dims.width)),
      stat(T('Volume', 'Volume'), `${(mp.displacement / 1000).toFixed(2)} cm³`),
      stat(T('Bras de redressement', 'Righting arm'), mm(mp.righting)),
    ]),
    section(T('Au repos dans l’eau', 'At rest in the water'), rest ? (rest.floating ? [
      stat(T('Volume immergé', 'Submerged'), `${rest.submergedPct.toFixed(0)} %`),
      stat(T('Hors de l’eau', 'Freeboard'), mm(rest.freeboard)),
      stat(T('Assiette', 'Trim'), `${Math.abs(rest.trimDeg).toFixed(1)}° ${rest.trimDeg > 0.5 ? T('nez bas', 'nose down') : rest.trimDeg < -0.5 ? T('queue basse', 'tail down') : T('à plat', 'level')}`),
    ] : [stat(T('État', 'State'), T('coule', 'sinks'))]) : []),
    section(T('Comportement estimé', 'Estimated behaviour'), [h('div', { id: 'estimate' }, h('p', { class: 'muted' }, T('Calcul…', 'Computing…')))]),
    section(T('Affichage', 'Display'), [
      toggle({ label: T('Quincaillerie', 'Hardware'), value: app.studio.options.hardware, onChange: (v) => { app.studio.setOptions({ hardware: v }); app.studio.setLure(state.design, app.painter); } }),
      toggle({ label: T('Centres de gravité / poussée', 'CG / CB markers'), hint: T('rouge = gravité, bleu = poussée', 'red = gravity, blue = buoyancy'), value: app.studio.options.markers, onChange: (v) => app.studio.setOptions({ markers: v }) }),
      toggle({ label: T('Rayons X', 'X-ray'), value: app.studio.options.xray, onChange: (v) => { app.studio.setOptions({ xray: v }); app.studio.setLure(state.design, app.painter); } }),
      toggle({ label: T('Fil de fer', 'Wireframe'), value: app.studio.options.wireframe, onChange: (v) => { app.studio.setOptions({ wireframe: v }); app.studio.setLure(state.design, app.painter); } }),
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
  estimateTimer = setTimeout(() => runEstimate(app), 180);
}

function runEstimate(app) {
  const el = document.getElementById('estimate');
  const mp = app.massProps;
  if (!el || !mp) return;
  const hyd = makeHydro(state.design, mp, state.water);
  const troll = new SwimPhysics(hyd, { scenario: 'troll', speed: 5 * KNOT, lineOut: 40, depth: 60, water: state.water });
  let n = 0;
  while (troll.t < 25 && n < 12000) { troll.step(1 / 250); n++; }
  const cast = new SwimPhysics(hyd, { scenario: 'steady', speed: 1, cast: 30, depth: 60, water: state.water });
  n = 0;
  while (!cast.finished && n < 30000) { cast.step(1 / 250); n++; }
  const freq = troll.metrics.freqSum / (troll.metrics.freqN || 1);
  const action = hyd.yawAmp > 12 ? T('large (wide)', 'wide') : hyd.yawAmp > 7 ? T('moyenne', 'medium') : T('serrée (tight)', 'tight');
  el.innerHTML = '';
  el.append(
    stat(T('Traîne 5 nœuds, 40 m de ligne', 'Trolling 5 kn, 40 m line'), fmtDepth(troll.metrics.maxDepth)),
    stat(T('Lancer-ramener 2 nœuds', 'Cast & retrieve 2 kn'), fmtDepth(cast.metrics.maxDepth)),
    stat(T('Fréquence de nage', 'Swim frequency'), `${freq.toFixed(1)} Hz`),
    stat(T('Action', 'Action'), action),
    stat(T('Décroche au-delà de', 'Blows out above'), hyd.vCrit > 7 ? T('> 14 nœuds', '> 14 kn') : `${(hyd.vCrit / KNOT).toFixed(1)} ${T('nœuds', 'kn')}`),
  );
}

export function onDesign(app) {
  editors.forEach((e) => e.draw());
  drawSection();
}

export function onStats(app) {
  const open = rightEl ? [...rightEl.querySelectorAll('.sec')].map((s) => s.classList.contains('closed')) : [];
  fillRight(app);
  if (rightEl) [...rightEl.querySelectorAll('.sec')].forEach((s, i) => { if (open[i]) s.classList.add('closed'); });
  fillDynamic(app);
  scheduleEstimate(app);
}

export function destroy() {
  editors.forEach((e) => e.destroy());
  editors = [];
  rightEl = null;
  sectionCanvas = null;
}
