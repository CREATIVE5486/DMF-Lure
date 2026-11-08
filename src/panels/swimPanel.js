import { h, section, slider, select, segmented, button, stat, icon } from '../ui.js';
import { T, TL } from '../i18n.js';
import { state, updateDesign } from '../store.js';
import { SCENARIOS, LINES, makeHydro, SwimPhysics, KNOT } from '../swimPhysics.js';
import { BALLAST_TARGETS, ballastForTarget } from '../physics.js';
import { fmtDepth, fmtSpeed, fmtForce, fmtMass, fmtLen } from '../units.js';

let hud = null, chart = null, benchEl = null, liveEl = null, playBtn = null, gauge = null, badgeEl = null;
let benchTimer = null;
let swRef = null;

const kn = (ms) => ms / KNOT;
const fmtKn = (ms) => `${kn(ms).toFixed(1)} ${T('nœuds', 'kn')}`;
const isCast = (sc) => sc !== 'troll' && sc !== 'stop';

function scenarioHint(k) {
  return {
    troll: T('bateau à vitesse constante', 'boat at constant speed'),
    stop: T('immobile : ligne de flottaison', 'still: waterline'),
    steady: T('moulinage constant', 'constant reel'),
    stopgo: T('2 s / pause 1,2 s', '2 s / 1.2 s pause'),
    twitch: T('coups de scion', 'rod jerks'),
    burn: T('très rapide', 'very fast'),
    slow: T('lent et profond', 'slow & low'),
    yoyo: T('tirée / descente', 'lift & drop'),
  }[k];
}

export function render(app) {
  const sw = app.swim;
  swRef = sw;
  const p = sw.params;
  // réglage à chaud : la nage continue
  const live = (o) => { sw.setParams(o); updatePlay(); scheduleBench(app); };

  const scen = h('div', { class: 'scenario-grid' }, Object.entries(SCENARIOS).map(([k, v]) => h('button', {
    type: 'button', class: 'scenario' + (p.scenario === k ? ' on' : ''),
    onclick: () => { live({ scenario: k }); app.rerender(); },
  }, h('b', {}, TL(v.label)), h('small', {}, scenarioHint(k)))));

  const d = state.design;
  const upd = (fn) => updateDesign(fn, { source: 'swim-live' });
  const tweak = [
    h('p', { class: 'hint' }, T('Les modifications s’appliquent pendant que le leurre nage.', 'Changes apply while the lure keeps swimming.')),
    slider({ label: T('Longueur du corps', 'Body length'), min: 30, max: 250, step: 1, value: d.body.length, fmt: (v) => fmtLen(v, 0), onInput: (v) => upd((x) => { x.body.length = v; }) }),
    slider({ label: T('Hauteur', 'Height'), min: 8, max: 80, step: 0.5, value: d.body.height, fmt: (v) => fmtLen(v), onInput: (v) => upd((x) => { x.body.height = v; }) }),
    slider({ label: T('Largeur', 'Width'), min: 5, max: 60, step: 0.5, value: d.body.width, fmt: (v) => fmtLen(v), onInput: (v) => upd((x) => { x.body.width = v; }) }),
    ...(d.lip.enabled ? [
      slider({ label: T('Bavette — longueur', 'Lip — length'), min: 4, max: 90, step: 0.5, value: d.lip.length, fmt: (v) => fmtLen(v), onInput: (v) => upd((x) => { x.lip.length = v; }) }),
      slider({ label: T('Bavette — largeur', 'Lip — width'), min: 4, max: 60, step: 0.5, value: d.lip.width, fmt: (v) => fmtLen(v), onInput: (v) => upd((x) => { x.lip.width = v; }) }),
      slider({ label: T('Bavette — angle', 'Lip — angle'), min: 5, max: 90, step: 1, value: d.lip.angle, fmt: (v) => `${v}°`, onInput: (v) => upd((x) => { x.lip.angle = v; }) }),
    ] : []),
    slider({ label: T('Lest', 'Ballast'), min: 0, max: 200, step: 0.5, value: d.ballast.grams, fmt: (v) => fmtMass(v, 1), onInput: (v) => upd((x) => { x.ballast.grams = v; }) }),
    slider({ label: T('Position du lest', 'Ballast position'), min: 0.05, max: 0.9, step: 0.01, value: d.ballast.u, fmt: (v) => fmtLen(v * d.body.length, 0), onInput: (v) => upd((x) => { x.ballast.u = v; }) }),
  ];

  const leftEl = h('div', { class: 'panel-inner' },
    section(T('Animation', 'Animation'), [
      scen,
      slider({ label: p.scenario === 'troll' ? T('Vitesse du bateau', 'Boat speed') : T('Vitesse de récupération', 'Retrieve speed'), min: 0.5, max: 14, step: 0.1, value: kn(p.speed), fmt: (v) => `${v.toFixed(1)} ${T('nœuds', 'kn')} · ${fmtSpeed(v * KNOT)}`, onInput: (v) => live({ speed: v * KNOT }) }),
      p.scenario === 'troll'
        ? slider({ label: T('Ligne sortie derrière le bateau', 'Line out behind the boat'), min: 5, max: 150, step: 1, value: p.lineOut, fmt: (v) => fmtDepth(v, 0), onInput: (v) => live({ lineOut: v }), hint: T('Plus de ligne = plus profond', 'More line = deeper') })
        : isCast(p.scenario) ? slider({ label: T('Distance de lancer', 'Cast distance'), min: 5, max: 80, step: 1, value: p.cast, fmt: (v) => fmtDepth(v, 0), onInput: (v) => live({ cast: v }), hint: T('Appliquée au prochain lancer', 'Applies on the next cast') }) : null,
    ]),
    section(T('Modifier le leurre en direct', 'Edit the lure live'), tweak),
    section(T('Ligne', 'Line'), [
      select({ label: T('Type de fil', 'Line type'), value: p.line, options: Object.entries(LINES).map(([k, v]) => ({ value: k, label: TL(v.label) })), onChange: (v) => live({ line: v }) }),
      slider({ label: T('Diamètre', 'Diameter'), min: 0.1, max: 1.2, step: 0.01, value: p.lineDiam, fmt: (v) => `${v.toFixed(2)} mm`, onInput: (v) => live({ lineDiam: v }), hint: T('Plus fin = plus profond', 'Thinner = deeper') }),
      slider({ label: p.scenario === 'troll' ? T('Hauteur du porte-canne', 'Rod holder height') : T('Hauteur du scion', 'Rod tip height'), min: 0, max: 4, step: 0.1, value: p.rodHeight, fmt: (v) => fmtDepth(v), onInput: (v) => live({ rodHeight: v }) }),
    ]),
    section(T('Eau', 'Water'), [
      slider({ label: T('Profondeur du fond', 'Bottom depth'), min: 1, max: 80, step: 0.5, value: p.depth, fmt: (v) => fmtDepth(v), onInput: (v) => live({ depth: v }) }),
      segmented({ options: [{ value: 'salt', label: T('Eau de mer', 'Salt') }, { value: 'fresh', label: T('Eau douce', 'Fresh') }], value: p.water, small: true, onChange: (v) => { state.water = v; app.refreshStats(); live({ water: v }); } }),
    ]),
    section(T('Caméra', 'Camera'), [
      segmented({
        options: [{ value: 'side', label: T('Côté', 'Side') }, { value: 'top', label: T('Dessus', 'Top') }, { value: 'behind', label: T('Derrière', 'Behind') }, { value: 'wide', label: T('Large', 'Wide') }, { value: 'free', label: T('Libre', 'Free') }],
        value: sw.camMode, small: true, onChange: (v) => sw.setCamMode(v),
      }),
    ]),
  );

  chart = h('canvas', { class: 'dive-chart', width: 600, height: 260 });
  liveEl = h('div', {});
  benchEl = h('div', { class: 'bench' }, h('p', { class: 'muted' }, T('Calcul…', 'Computing…')));
  const rightEl = h('div', { class: 'panel-inner' },
    section(p.scenario === 'stop' ? T('Flottaison au repos', 'Waterline at rest') : T('Courbe de plongée', 'Dive curve'), [chart, h('p', { class: 'hint' }, isCast(p.scenario) ? T('Profondeur selon la distance au pêcheur', 'Depth vs distance to angler') : T('Profondeur au cours des 60 dernières secondes', 'Depth over the last 60 seconds'))]),
    section(T('Mesures en direct', 'Live readings'), [liveEl]),
    section(T('Banc d’essai', 'Test bench'), [benchEl, button(T('Relancer le banc', 'Re-run bench'), () => scheduleBench(app, 0), { cls: 'small wide' })]),
  );

  hud = h('div', { class: 'hud' });
  gauge = h('div', { class: 'gauge' }, h('div', { class: 'gauge-bar' }, h('i', {})), h('span', {}));
  playBtn = h('button', { type: 'button', class: 'play', onclick: () => { if (sw.sim.finished) sw.restart(); else sw.playing = !sw.playing; updatePlay(); }, 'aria-label': 'Play/Pause' });
  const speeds = segmented({ options: [1, 0.5, 0.25, 0.1, 0.05].map((v) => ({ value: v, label: `${v}×` })), value: sw.playback, small: true, onChange: (v) => { sw.playback = v; } });
  const player = h('div', { class: 'player' },
    h('button', { type: 'button', class: 'icon-btn', title: T('Recommencer', 'Restart'), onclick: () => { sw.restart(); updatePlay(); } }, icon('restart')),
    playBtn, speeds);
  badgeEl = h('div', { class: 'badge' });
  const overlay = h('div', {}, hud, gauge, badgeEl, player);
  sw.onFinish = () => { updatePlay(); updateBadge(app); };
  updatePlay();
  scheduleBench(app, 50);
  return { left: leftEl, right: rightEl, overlay };
}

function updatePlay() {
  if (!playBtn || !swRef) return;
  playBtn.innerHTML = '';
  playBtn.append(icon(swRef.playing && !swRef.sim?.finished ? 'pause' : 'play', 20));
}

function updateBadge(app) {
  if (!badgeEl) return;
  const sw = app.swim, sim = sw.sim;
  const sc = sw.params.scenario;
  const name = TL(SCENARIOS[sc].label);
  if (sc === 'stop') {
    const r = sw.hydro?.rest;
    badgeEl.className = 'badge ok';
    badgeEl.textContent = r && r.floating ? `${T('Flotte', 'Floats')} · ${r.submergedPct.toFixed(0)} % ${T('immergé', 'submerged')}` : T('Coule', 'Sinks');
    return;
  }
  const v = sim.verdict();
  badgeEl.className = 'badge ' + (v.ok ? 'ok' : 'bad');
  badgeEl.textContent = v.ok ? `${name} ✓` : `${name} — ${v.reason === 'blowout' ? T('décroche !', 'blows out!') : T('se couche', 'rolls over')}`;
}

function scheduleBench(app, delay = 400) {
  clearTimeout(benchTimer);
  benchTimer = setTimeout(() => runBench(app), delay);
}

function runBench(app) {
  if (!benchEl || !app.massProps) return;
  const sw = app.swim;
  const hyd = makeHydro(state.design, app.massProps, sw.params.water);
  benchEl.innerHTML = '';
  const row = (label, sim, extra = '') => {
    const vd = sim.verdict();
    const M = sim.metrics;
    benchEl.append(h('div', { class: 'bench-row ' + (vd.ok ? 'ok' : 'bad') },
      h('b', {}, label),
      h('span', {}, fmtDepth(M.maxDepth)),
      h('span', {}, extra || `${(M.freqSum / (M.freqN || 1)).toFixed(1)} Hz`),
      h('span', { class: 'mark' }, vd.ok ? '✓' : (vd.reason === 'blowout' ? T('décroche', 'blow-out') : '✗'))));
  };
  for (const k of [3, 5, 7, 9]) {
    const sim = new SwimPhysics(hyd, { ...sw.params, scenario: 'troll', speed: k * KNOT });
    let n = 0;
    while (sim.t < 30 && n < 20000) { sim.step(1 / 300); n++; }
    row(`${T('Traîne', 'Troll')} ${k} ${T('nds', 'kn')}`, sim);
  }
  for (const k of ['steady', 'stopgo', 'twitch']) {
    const sim = new SwimPhysics(hyd, { ...sw.params, scenario: k, speed: Math.min(sw.params.speed, 1.5), cast: Math.min(sw.params.cast, 30) });
    let n = 0;
    while (!sim.finished && n < 40000) { sim.step(1 / 300); n++; }
    row(TL(SCENARIOS[k].label), sim);
  }
}

export function frame(app) {
  const sw = app.swim;
  const sim = sw.sim;
  if (!sim || !hud) return;
  const tick = Math.floor(performance.now() / 100);
  if (tick === hud._t) return;
  hud._t = tick;
  const sc = sw.params.scenario;
  const depth = Math.max(0, -sim.pos.y);
  const speed = Math.hypot(sim.vel.x, sim.vel.y, sim.vel.z);
  hud.innerHTML = '';
  hud.append(
    h('div', { class: 'hud-row' },
      hudCell(T('Temps', 'Time'), `${sim.t.toFixed(1)} s`),
      hudCell(T('Profondeur', 'Depth'), fmtDepth(depth)),
      hudCell(sc === 'troll' ? T('Derrière le bateau', 'Behind boat') : T('Distance', 'Distance'), fmtDepth(sim.pos.x - sim.rodX)),
      hudCell(T('Vitesse', 'Speed'), fmtKn(speed)),
      hudCell(T('Traction', 'Line pull'), fmtForce(sim.tension))),
    h('div', { class: 'hud-sub' }, `● ${T('Poids corrigé pour l’impression', 'Weight corrected for the print')} : ${fmtMass(app.massProps?.mass || 0)}`));
  const maxD = sw.params.depth;
  gauge.querySelector('i').style.top = `${Math.min(100, (depth / maxD) * 100)}%`;
  gauge.querySelector('span').textContent = fmtDepth(maxD, 0);
  updateBadge(app);
  if (liveEl && Math.floor(performance.now() / 300) !== liveEl._t) {
    liveEl._t = Math.floor(performance.now() / 300);
    const M = sim.metrics;
    liveEl.innerHTML = '';
    if (sc === 'stop') {
      const r = sw.hydro.rest;
      liveEl.append(
        stat(T('État', 'State'), r.floating ? T('flotte', 'floats') : T('coule', 'sinks')),
        ...(r.floating ? [
          stat(T('Volume immergé', 'Submerged volume'), `${r.submergedPct.toFixed(0)} %`),
          stat(T('Hauteur hors de l’eau', 'Freeboard'), fmtLen(r.freeboard)),
          stat(T('Assiette', 'Trim'), `${Math.abs(r.trimDeg).toFixed(1)}° ${r.trimDeg > 0.5 ? T('nez bas', 'nose down') : r.trimDeg < -0.5 ? T('queue basse', 'tail down') : T('à plat', 'level')}`),
        ] : [stat(T('Vitesse de chute', 'Sink rate'), fmtSpeed(Math.max(0, -sim.vel.y)))]),
        stat(T('Profondeur', 'Depth'), fmtDepth(depth)),
        h('div', { class: 'target-row' }, ...BALLAST_TARGETS.slice(0, 3).map((t) => button(TL({ fr: t.fr, en: t.en }), () => {
          const delta = ballastForTarget(state.design, app.massProps, t.id, state.water);
          updateDesign((x) => { x.ballast.grams = Math.max(0, Math.round((x.ballast.grams + delta) * 10) / 10); }, { source: 'swim-live' });
        }, { cls: 'small' }))),
      );
    } else {
      liveEl.append(
        stat(T('Profondeur max', 'Max depth'), fmtDepth(M.maxDepth)),
        stat(T('Wobble', 'Wobble'), `${sim.freq.toFixed(1)} Hz · ±${(sw.hydro.yawAmp).toFixed(0)}°`),
        stat(T('Roulis max', 'Max roll'), `${Math.min(180, M.maxRoll).toFixed(0)}°`),
        stat(T('Traction max', 'Max line pull'), fmtForce(M.maxTension)),
        stat(T('Contacts au fond', 'Bottom contacts'), String(M.bottomHits)),
        stat(T('Vitesse de décrochage', 'Blow-out speed'), sw.hydro.vCrit > 7 ? T('> 14 nœuds', '> 14 kn') : fmtKn(sw.hydro.vCrit)));
    }
    drawChart(sw);
  }
}

function hudCell(k, v) { return h('div', { class: 'hud-cell' }, h('small', {}, k), h('b', {}, v)); }

function drawChart(sw) {
  if (!chart) return;
  const g = chart.getContext('2d');
  const W = chart.width, H = chart.height;
  const pad = { l: 50, r: 12, t: 12, b: 28 };
  g.clearRect(0, 0, W, H);
  const tr = sw.sim.trace;
  const cast = isCast(sw.params.scenario);
  let maxY = sw.params.depth;
  const recent = cast ? tr : tr.filter((e) => e[0] > sw.sim.t - 60);
  const deepest = recent.reduce((m, e) => Math.max(m, e[2]), 0);
  maxY = Math.max(1, Math.min(maxY, Math.ceil(deepest * 1.3 + 0.5)));
  const x0 = cast ? sw.params.cast : Math.max(60, sw.sim.t), x1 = cast ? 0 : Math.max(0, sw.sim.t - 60);
  const span = (x0 - x1) || 1, pw = W - pad.l - pad.r;
  const X = (x) => pad.l + (cast ? (x0 - x) / span : (x - x1) / span) * pw;
  const Y = (y) => pad.t + (y / maxY) * (H - pad.t - pad.b);
  g.strokeStyle = 'rgba(140,190,200,0.15)';
  g.fillStyle = 'rgba(180,215,220,0.75)';
  g.font = '20px system-ui, sans-serif';
  const ystep = maxY > 20 ? 5 : maxY > 8 ? 2 : maxY > 3 ? 1 : 0.5;
  for (let y = 0; y <= maxY + 1e-6; y += ystep) {
    g.beginPath(); g.moveTo(pad.l, Y(y)); g.lineTo(W - pad.r, Y(y)); g.stroke();
    g.fillText(fmtDepth(y, ystep < 1 ? 1 : 0), 2, Y(y) + 6);
  }
  if (cast) {
    const xstep = x0 > 30 ? 10 : 5;
    for (let x = 0; x <= x0; x += xstep) g.fillText(fmtDepth(x, 0), X(x) - 14, H - 4);
  } else {
    for (let s = Math.ceil(x1 / 10) * 10; s <= x0; s += 10) g.fillText(`${s} s`, X(s) - 14, H - 4);
  }
  if (recent.length > 1) {
    g.strokeStyle = '#2fd3b5';
    g.lineWidth = 3;
    g.beginPath();
    recent.forEach((e, i) => { const x = X(cast ? e[1] : e[0]), y = Y(e[2]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    const e = recent[recent.length - 1];
    g.fillStyle = '#ffd166';
    g.beginPath(); g.arc(X(cast ? e[1] : e[0]), Y(e[2]), 6, 0, Math.PI * 2); g.fill();
  }
}

export function onStats(app) {
  app.swim.setDesign(state.design, app.painter, app.massProps);
  scheduleBench(app);
}

export function onKey(app, e) {
  if (e.code === 'Space') {
    e.preventDefault();
    const sw = app.swim;
    if (sw.sim.finished) sw.restart(); else sw.playing = !sw.playing;
    updatePlay();
  }
}

export function destroy(app) {
  app.swim.onFinish = null;
  hud = chart = benchEl = liveEl = playBtn = gauge = badgeEl = null;
}
