import { h, section, slider, select, toggle, segmented, button, stat, icon, toast } from '../ui.js';
import { T, TL, getLang } from '../i18n.js';
import { state, updateDesign } from '../store.js';
import { POCKET_TYPES, BALLAST_MATERIALS, newPocket, pocketBallMass } from '../design.js';
import { armaturePath, pocketWall, pocketVolume } from '../geometry.js';
import { BALLAST_TARGETS, solveBallast, restingAttitude, computeMassProps, ballastForTarget } from '../physics.js';
import { sketchCanvas, sketchSVG, pocketLabel } from '../sketch.js';
import { downloadBlob } from '../export.js';
import { fmtMass, fmtMassSigned, fmtLen } from '../units.js';

let sel = null;
let layout = null;
let canvas = null;
let cleanup = [];
let rightEl = null;
let editWire = false;

const mm = (v) => fmtLen(v, 1);
const pockets = () => state.design.interior.pockets;
const selected = () => pockets().find((p) => p.id === sel) || null;

function redraw() {
  if (!canvas || canvas.classList.contains('hidden')) return;
  layout = sketchCanvas(canvas, state.design, { sel, editWire: editWire && !state.design.interior.wire.auto, lang: getLang() });
}

function upd(fn, source = 'interior') { updateDesign(fn, { source }); }

function fitToBalls(p) {
  const c = 0.3;
  if (p.shape === 'sphere') { p.dia = p.ballDia + c; return; }
  p.dia = Math.round((p.ballDia + c) * 10) / 10;
  if (p.type !== 'rattle') p.length = Math.round((Math.max(1, p.ballCount) * p.ballDia * 1.01 + c) * 10) / 10;
}

export function render(app) {
  const d = state.design;
  canvas = app.sketchCanvas;
  if (!d.interior) d.interior = { autoHollow: true, wire: { enabled: true, dia: 1, auto: true, points: [] }, pockets: [] };
  const it = d.interior;
  if (sel && !selected()) sel = null;

  const wireSec = [
    toggle({ label: T('Rainure d’armature', 'Armature groove'), hint: T('Creusée dans le plan de joint des demi-coques', 'Cut in the joint plane of the halves'), value: it.wire.enabled !== false, onChange: (v) => { upd((x) => { x.interior.wire.enabled = v; }); app.rerender(); } }),
    slider({ label: T('Diamètre du fil', 'Wire diameter'), min: 0.5, max: 3, step: 0.1, value: it.wire.dia, fmt: (v) => `Ø ${mm(v)}`, onInput: (v) => upd((x) => { x.interior.wire.dia = v; }) }),
    h('div', { class: 'field' }, h('label', {}, T('Tracé', 'Path')), segmented({
      options: [{ value: 'auto', label: T('Automatique', 'Automatic') }, { value: 'manual', label: T('Esquisse libre', 'Free sketch') }], value: it.wire.auto ? 'auto' : 'manual', small: true,
      onChange: (v) => {
        upd((x) => {
          if (v === 'manual' && !(x.interior.wire.points?.length >= 2)) {
            const prev = x.interior.wire.auto; x.interior.wire.auto = true;
            x.interior.wire.points = armaturePath(x).filter((p, i, a) => i === 0 || i === a.length - 1 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 2).map(([px, py]) => [Math.round(px * 10) / 10, Math.round(py * 10) / 10]);
            x.interior.wire.auto = prev;
          }
          x.interior.wire.auto = v === 'auto';
        });
        editWire = v === 'manual';
        app.rerender();
      },
    })),
    !it.wire.auto ? h('p', { class: 'hint' }, T('Sur le schéma : glissez les points du fil · double-clic pour ajouter un point · clic droit pour le supprimer.', 'On the sketch: drag wire points · double-click to add · right-click to delete.')) : null,
    !it.wire.auto ? button(T('Repartir du tracé automatique', 'Reset to automatic path'), () => { upd((x) => { x.interior.wire.auto = true; }); upd((x) => { x.interior.wire.points = armaturePath(x).map(([px, py]) => [Math.round(px * 10) / 10, Math.round(py * 10) / 10]); x.interior.wire.auto = false; }); app.rerender(); }, { cls: 'small wide' }) : null,
  ];

  const addBtns = h('div', { class: 'pattern-grid' },
    ...Object.entries(POCKET_TYPES).map(([k, v]) => button(TL(v), () => {
      const p = newPocket(k, state.design);
      upd((x) => { x.interior.pockets.push(p); });
      sel = p.id;
      app.rerender();
    }, { cls: 'small', ic: 'plus' })));

  const list = h('div', { class: 'pocket-list' }, pockets().map((p, i) => {
    const wall = pocketWall(state.design, p);
    const bad = wall < state.design.print.wall;
    return h('button', { type: 'button', class: 'pocket-card' + (p.id === sel ? ' on' : '') + (bad ? ' bad' : ''), onclick: () => { sel = p.id === sel ? null : p.id; app.rerender(); } },
      h('i', { class: 'dot ' + p.type }),
      h('span', {}, h('b', {}, `${i + 1}. ${TL(POCKET_TYPES[p.type])}`), h('small', {}, `${pocketLabel(p)} · x ${mm(p.x)}${p.ballCount ? ` · ${p.ballCount} × Ø${p.ballDia}` : ''}`)),
      h('small', { class: 'wall' }, wall < 0 ? T('hors du corps', 'outside') : `${T('paroi', 'wall')} ${wall.toFixed(1)}`));
  }));

  const p = selected();
  const L = d.body.length, Hh = d.body.height, Ww = d.body.width;
  const edit = p ? [
    select({ label: T('Type', 'Type'), value: p.type, options: Object.entries(POCKET_TYPES).map(([k, v]) => ({ value: k, label: TL(v) })), onChange: (v) => { upd((x) => { const q = x.interior.pockets.find((y) => y.id === sel); q.type = v; if (v === 'well') q.axis = 'z'; }); app.rerender(); } }),
    h('div', { class: 'field' }, h('label', {}, T('Forme du trou', 'Hole shape')), segmented({
      options: [{ value: 'capsule', label: T('Tube / oblong', 'Tube / slot') }, { value: 'sphere', label: T('Sphère', 'Sphere') }, { value: 'box', label: T('Boîte', 'Box') }], value: p.shape, small: true,
      onChange: (v) => { upd((x) => { const q = x.interior.pockets.find((y) => y.id === sel); q.shape = v; if (v === 'box' && !q.height) { q.height = Hh * 0.25; q.width = Ww * 0.3; } }); app.rerender(); },
    })),
    p.shape === 'capsule' ? h('div', { class: 'field' }, h('label', {}, T('Orientation', 'Orientation')), segmented({
      options: [{ value: 'x', label: T('Longueur', 'Lengthwise') }, { value: 'y', label: T('Verticale', 'Vertical') }, { value: 'z', label: T('Vers le joint', 'Toward joint') }], value: p.axis, small: true,
      onChange: (v) => { upd((x) => { x.interior.pockets.find((y) => y.id === sel).axis = v; }); app.rerender(); },
    })) : null,
    slider({ label: T('Position depuis le nez (x)', 'Distance from nose (x)'), min: 0, max: L, step: 0.1, value: p.x, fmt: mm, onInput: (v) => upd((x) => { x.interior.pockets.find((y) => y.id === sel).x = v; }) }),
    slider({ label: T('Hauteur / axe (y)', 'Height / axis (y)'), min: -Hh * 0.7, max: Hh * 0.7, step: 0.1, value: p.y, fmt: mm, onInput: (v) => upd((x) => { x.interior.pockets.find((y) => y.id === sel).y = v; }) }),
    slider({ label: T('Décalage latéral (z)', 'Side offset (z)'), min: -Ww * 0.5, max: Ww * 0.5, step: 0.1, value: p.z || 0, fmt: mm, onInput: (v) => upd((x) => { x.interior.pockets.find((y) => y.id === sel).z = v; }), hint: T('0 = centré sur le plan de joint', '0 = centred on the joint plane') }),
    p.shape !== 'box' ? slider({ label: T('Diamètre du trou', 'Hole diameter'), min: 1, max: Math.max(6, Hh), step: 0.1, value: p.dia, fmt: (v) => `Ø ${mm(v)}`, onInput: (v) => upd((x) => { x.interior.pockets.find((y) => y.id === sel).dia = v; }) }) : null,
    p.shape !== 'sphere' ? slider({ label: T('Longueur', 'Length'), min: 1, max: L * 0.8, step: 0.1, value: p.length, fmt: mm, onInput: (v) => upd((x) => { x.interior.pockets.find((y) => y.id === sel).length = v; }) }) : null,
    p.shape === 'box' ? slider({ label: T('Hauteur', 'Height'), min: 1, max: Hh, step: 0.1, value: p.height, fmt: mm, onInput: (v) => upd((x) => { x.interior.pockets.find((y) => y.id === sel).height = v; }) }) : null,
    p.shape === 'box' ? slider({ label: T('Largeur', 'Width'), min: 1, max: Ww, step: 0.1, value: p.width, fmt: mm, onInput: (v) => upd((x) => { x.interior.pockets.find((y) => y.id === sel).width = v; }) }) : null,
    ...(p.type !== 'air' ? [
      h('label', { class: 'sub-label' }, T('Billes', 'Balls')),
      slider({ label: T('Diamètre des billes', 'Ball diameter'), min: 1.5, max: 14, step: 0.1, value: p.ballDia, fmt: (v) => `Ø ${mm(v)}`, onInput: (v) => upd((x) => { x.interior.pockets.find((y) => y.id === sel).ballDia = v; }) }),
      slider({ label: T('Nombre de billes', 'Number of balls'), min: 0, max: 30, step: 1, value: p.ballCount, fmt: (v) => String(v), onInput: (v) => upd((x) => { x.interior.pockets.find((y) => y.id === sel).ballCount = v; }) }),
      select({ label: T('Matière', 'Material'), value: p.ballMat, options: Object.entries(BALLAST_MATERIALS).map(([k, v]) => ({ value: k, label: v.label })), onChange: (v) => upd((x) => { x.interior.pockets.find((y) => y.id === sel).ballMat = v; }) }),
      stat(T('Masse des billes', 'Ball mass'), fmtMass(pocketBallMass(p))),
      button(T('Ajuster le trou aux billes (+0,3 mm de jeu)', 'Fit hole to balls (+0.3 mm clearance)'), () => { upd((x) => fitToBalls(x.interior.pockets.find((y) => y.id === sel))); app.rerender(); }, { cls: 'small wide' }),
    ] : [stat(T('Volume d’air', 'Air volume'), `${(pocketVolume(p) / 1000).toFixed(2)} cm³`)]),
    h('div', { class: 'btn-row' },
      button(T('Dupliquer', 'Duplicate'), () => { const q = { ...structuredClone(p), id: newPocket(p.type, state.design).id, x: p.x + (p.length || p.dia) * 1.2 }; upd((x) => { x.interior.pockets.push(q); }); sel = q.id; app.rerender(); }, { cls: 'small', ic: 'copy' }),
      button(T('Supprimer', 'Delete'), () => { upd((x) => { x.interior.pockets = x.interior.pockets.filter((y) => y.id !== sel); }); sel = null; app.rerender(); }, { cls: 'small danger', ic: 'trash' })),
  ] : [h('p', { class: 'hint' }, T('Sélectionnez un logement dans la liste ou sur le schéma.', 'Select a pocket in the list or on the sketch.'))];

  const leftEl = h('div', { class: 'panel-inner' },
    section(T('Corps', 'Body'), [
      toggle({ label: T('Corps creux automatique', 'Automatic hollow body'), hint: T('Cavité qui suit la peau à l’épaisseur de paroi', 'Cavity following the skin at wall thickness'), value: it.autoHollow !== false, onChange: (v) => { upd((x) => { x.interior.autoHollow = v; }); app.rerender(); } }),
      slider({ label: T('Épaisseur de paroi', 'Wall thickness'), min: 0.6, max: 5, step: 0.1, value: d.print.wall, fmt: mm, onInput: (v) => upd((x) => { x.print.wall = v; }) }),
    ]),
    section(T('Armature', 'Armature'), wireSec),
    section(T('Logements (billes, air, hochet)', 'Pockets (balls, air, rattle)'), [addBtns, list]),
    section(p ? `${T('Logement', 'Pocket')} ${pockets().indexOf(p) + 1}` : T('Logement sélectionné', 'Selected pocket'), edit),
  );

  rightEl = h('div', { class: 'panel-inner' });
  fillRight(app);

  // interactions sur le schéma
  let drag = null;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const find = (x, y) => {
    if (!layout) return null;
    let best = null, bd = Infinity;
    for (const hh of layout.hits) { const dd = Math.hypot(hh.x - x, hh.y - y); if (dd < Math.max(hh.r, 8) && dd < bd) { bd = dd; best = hh; } }
    return best;
  };
  const down = (e) => {
    const [x, y] = pos(e);
    const hit = find(x, y);
    if (e.button === 2) {
      if (hit?.kind === 'wire' && state.design.interior.wire.points.length > 2) upd((q) => { q.interior.wire.points.splice(hit.i, 1); });
      e.preventDefault();
      return;
    }
    if (!hit) { if (sel) { sel = null; app.rerender(); } return; }
    if (hit.kind === 'pocket' && hit.id !== sel) { sel = hit.id; app.rerender(); }
    drag = { hit, x0: x, y0: y, start: hit.kind === 'pocket' ? { ...pockets().find((q) => q.id === hit.id) } : [...state.design.interior.wire.points[hit.i]] };
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    const [x, y] = pos(e);
    if (!drag) { canvas.style.cursor = find(x, y) ? 'grab' : 'default'; return; }
    const dx = (x - drag.x0) / layout.s, dy = -(y - drag.y0) / layout.s;
    const r1 = (v) => Math.round(v * 10) / 10;
    if (drag.hit.kind === 'pocket') {
      upd((q) => {
        const pk = q.interior.pockets.find((z) => z.id === drag.hit.id);
        pk.x = r1(drag.start.x + dx);
        if (drag.hit.view === 'side') pk.y = r1(drag.start.y + dy); else pk.z = r1((drag.start.z || 0) + dy);
      });
    } else {
      upd((q) => { q.interior.wire.points[drag.hit.i] = [r1(drag.start[0] + dx), r1(drag.start[1] + dy)]; });
    }
  };
  const up = () => { if (drag) { drag = null; app.rerender(); } };
  const dbl = (e) => {
    const w = state.design.interior.wire;
    if (w.auto || !layout) return;
    const [x, y] = pos(e);
    const mx = (x - layout.X(layout.xMin)) / layout.s + layout.xMin, my = (layout.sideY0 - y) / layout.s;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < w.points.length - 1; i++) {
      const a = w.points[i], b = w.points[i + 1];
      const vx = b[0] - a[0], vy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((mx - a[0]) * vx + (my - a[1]) * vy) / (vx * vx + vy * vy || 1)));
      const dd = Math.hypot(a[0] + vx * t - mx, a[1] + vy * t - my);
      if (dd < bd) { bd = dd; bi = i; }
    }
    upd((q) => { q.interior.wire.points.splice(bi + 1, 0, [Math.round(mx * 10) / 10, Math.round(my * 10) / 10]); });
  };
  const ctx = (e) => e.preventDefault();
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('dblclick', dbl);
  canvas.addEventListener('contextmenu', ctx);
  const ro = new ResizeObserver(() => redraw());
  ro.observe(canvas);
  cleanup.push(() => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('dblclick', dbl);
    canvas.removeEventListener('contextmenu', ctx);
    ro.disconnect();
  });
  editWire = !it.wire.auto;
  requestAnimationFrame(redraw);
  return {
    left: leftEl, right: rightEl,
    overlay: h('div', { class: 'view-toolbar bottom' },
      h('span', { class: 'chip static' }, T('Schéma coté (mm) — glissez les logements', 'Dimensioned sketch (mm) — drag the pockets'))),
  };
}

function fillRight(app) {
  if (!rightEl) return;
  const mp = app.massProps;
  rightEl.innerHTML = '';
  if (!mp) return;
  const d = state.design;
  const cls = { floating: T('Flottant', 'Floating'), suspending: T('Suspending', 'Suspending'), sinking: T('Coulant', 'Sinking') }[mp.buoyancyClass];
  let rest = null;
  try { rest = restingAttitude(d, mp, state.water); } catch { /* ignore */ }
  const ballsTotal = pockets().reduce((a, p) => a + pocketBallMass(p), 0);
  const p = selected();
  const perBall = p && p.type !== 'air' ? pocketBallMass({ ...p, ballCount: 1 }) : 0;
  const warnings = pockets().map((q, i) => ({ q, i, w: pocketWall(d, q) })).filter((x) => x.w < d.print.wall);
  rightEl.append(
    section(T('Masse et flottabilité', 'Mass & buoyancy'), [
      h('div', { class: 'big-stat' }, h('span', { class: 'v' }, fmtMass(mp.mass)), h('span', { class: 'k' }, T('leurre équipé', 'rigged lure'))),
      h('div', { class: 'pills' }, h('span', { class: `pill ${mp.buoyancyClass}` }, cls, ' ', fmtMassSigned(mp.netBuoyancy))),
      stat(T('Billes dans les logements', 'Balls in pockets'), fmtMass(ballsTotal)),
      stat(T('Lest libre (collé)', 'Free ballast (glued)'), fmtMass(d.ballast.grams || 0)),
      stat(T('Stabilité (CB − CG)', 'Stability (CB − CG)'), mm(mp.righting)),
      rest ? stat(T('Au repos', 'At rest'), rest.floating ? `${rest.submergedPct.toFixed(0)} % ${T('immergé', 'submerged')} · ${Math.abs(rest.trimDeg).toFixed(1)}° ${rest.trimDeg > 0.5 ? T('nez bas', 'nose down') : rest.trimDeg < -0.5 ? T('queue basse', 'tail down') : ''}` : T('coule', 'sinks')) : null,
    ]),
    p && p.type !== 'air' ? section(T('Billes pour obtenir…', 'Balls needed for…'), [
      h('p', { class: 'hint' }, T(`Pour le logement sélectionné (${pocketLabel(p)}), lest libre remis à 0.`, `For the selected pocket (${pocketLabel(p)}), free ballast reset to 0.`)),
      h('div', { class: 'target-grid' }, (() => {
        // estimation rapide (hameçons actuels) ; calcul exact au clic
        const base = structuredClone(d);
        base.ballast.grams = 0;
        base.interior.pockets.find((q) => q.id === p.id).ballCount = 0;
        const mp0 = computeMassProps(base, state.water);
        return BALLAST_TARGETS.map((t) => {
          const g = Math.max(0, ballastForTarget(base, mp0, t.id, state.water));
          const n = perBall > 0 ? Math.round(g / perBall) : 0;
          return h('button', {
            type: 'button', class: 'target',
            onclick: () => {
              const r = solveBallast(base, t.id, state.water);
              const nn = perBall > 0 ? Math.round(r.grams / perBall) : 0;
              updateDesign((x) => { x.ballast.grams = 0; const q = x.interior.pockets.find((y) => y.id === p.id); q.ballCount = nn; fitToBalls(q); if (r.hooks) x.hooks = r.hooks; });
              toast(`${nn} × Ø${p.ballDia} mm`);
              app.rerender();
            },
          }, h('b', {}, TL({ fr: t.fr, en: t.en })), h('small', {}, `≈ ${n} × Ø${p.ballDia} (${fmtMass(n * perBall, 1)})`));
        });
      })()),
    ]) : null,
    section(T('Vérifications', 'Checks'), warnings.length ? warnings.map(({ q, i, w }) => h('div', { class: 'warn-row' }, icon('help', 14), w < 0
      ? T(`Logement ${i + 1} : dépasse du corps.`, `Pocket ${i + 1}: sticks out of the body.`)
      : T(`Logement ${i + 1} : paroi de ${w.toFixed(1)} mm (< ${d.print.wall} mm), risque de percer.`, `Pocket ${i + 1}: ${w.toFixed(1)} mm wall (< ${d.print.wall} mm), may break through.`)))
      : [h('div', { class: 'ok-row' }, '✓ ', T('Toutes les parois sont suffisantes', 'All walls are thick enough'))]),
    section(T('Exporter le schéma', 'Export the sketch'), [h('div', { class: 'dl-grid' },
      h('button', { type: 'button', class: 'dl-card', onclick: () => downloadBlob(new Blob([sketchSVG(state.design, { lang: getLang() })], { type: 'image/svg+xml' }), `${app.fileSafe(state.design.name)}_schema.svg`) }, icon('ruler', 18), h('span', {}, h('b', {}, T('Schéma coté', 'Dimensioned sketch')), h('small', {}, '.svg'))),
      h('button', { type: 'button', class: 'dl-card', onclick: () => exportPNG(app) }, icon('camera', 18), h('span', {}, h('b', {}, T('Schéma coté', 'Dimensioned sketch')), h('small', {}, '.png'))))]),
  );
}

function exportPNG(app) {
  const svg = sketchSVG(state.design, { lang: getLang() });
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = 2200; c.height = 1560;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((b) => downloadBlob(b, `${app.fileSafe(state.design.name)}_schema.png`));
  };
  img.onerror = () => toast(T('Export PNG impossible', 'PNG export failed'), 'err');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function onDesign() { redraw(); }
export function onStats(app) {
  const open = rightEl ? [...rightEl.querySelectorAll('.sec')].map((s) => s.classList.contains('closed')) : [];
  fillRight(app);
  if (rightEl) [...rightEl.querySelectorAll('.sec')].forEach((s, i) => { if (open[i]) s.classList.add('closed'); });
  redraw();
}
export function destroy() { cleanup.forEach((f) => f()); cleanup = []; rightEl = null; }
