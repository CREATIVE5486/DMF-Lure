import { h, section, slider, select, segmented, button, stat, icon } from '../ui.js';
import { T, TL } from '../i18n.js';
import { state } from '../store.js';
import { SCENARIOS, LINES, makeHydro, SwimPhysics } from '../swimPhysics.js';
import { fmtDepth, fmtSpeed, fmtForce, fmtMass } from '../units.js';

let hud = null, chart = null, benchEl = null, liveEl = null, playBtn = null, gauge = null;
let benchTimer = null;
let swRef = null;

export function render(app) {
  const sw = app.swim;
  swRef = sw;
  const p = sw.params;
  const setP = (o, restart = true) => { sw.setParams(o, { restart }); updatePlay(); };

  const scen = h('div', { class: 'scenario-grid' }, Object.entries(SCENARIOS).map(([k, v]) => h('button', {
    type: 'button', class: 'scenario' + (p.scenario === k ? ' on' : ''),
    onclick: (e) => { setP({ scenario: k }); e.currentTarget.parentElement.querySelectorAll('.scenario').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); },
  }, h('b', {}, TL(v.label)), h('small', {}, scenarioHint(k)))));

  const leftEl = h('div', { class: 'panel-inner' },
    section(T('Animation', 'Retrieve'), [
      scen,
      slider({ label: T('Vitesse de récupération', 'Retrieve speed'), min: 0.2, max: 2.5, step: 0.05, value: p.speed, fmt: (v) => fmtSpeed(v), onChange: (v) => setP({ speed: v }), onInput: (v) => setP({ speed: v }, false) }),
      slider({ label: T('Distance de lancer', 'Cast distance'), min: 5, max: 60, step: 1, value: p.cast, fmt: (v) => fmtDepth(v, 0), onChange: (v) => setP({ cast: v }) }),
    ]),
    section(T('Ligne', 'Line'), [
      select({ label: T('Type de fil', 'Line type'), value: p.line, options: Object.entries(LINES).map(([k, v]) => ({ value: k, label: TL(v.label) })), onChange: (v) => setP({ line: v }) }),
      slider({ label: T('Diamètre', 'Diameter'), min: 0.1, max: 0.5, step: 0.01, value: p.lineDiam, fmt: (v) => `${v.toFixed(2)} mm`, onChange: (v) => setP({ lineDiam: v }), hint: T('Plus fin = plus profond', 'Thinner = deeper') }),
      slider({ label: T('Hauteur du scion', 'Rod tip height'), min: 0, max: 3, step: 0.1, value: p.rodHeight, fmt: (v) => fmtDepth(v), onChange: (v) => setP({ rodHeight: v }) }),
    ]),
    section(T('Eau', 'Water'), [
      slider({ label: T('Profondeur du fond', 'Bottom depth'), min: 0.5, max: 12, step: 0.1, value: p.depth, fmt: (v) => fmtDepth(v), onChange: (v) => setP({ depth: v }) }),
      segmented({ options: [{ value: 'fresh', label: T('Eau douce', 'Fresh') }, { value: 'salt', label: T('Eau de mer', 'Salt') }], value: p.water, small: true, onChange: (v) => { state.water = v; app.refreshStats(); setP({ water: v }); } }),
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
    section(T('Courbe de plongée', 'Dive curve'), [chart, h('p', { class: 'hint' }, T('Profondeur en fonction de la distance au pêcheur', 'Depth vs distance to angler'))]),
    section(T('Mesures en direct', 'Live readings'), [liveEl]),
    section(T('Banc d’essai (toutes animations)', 'Test bench (all retrieves)'), [benchEl, button(T('Relancer le banc', 'Re-run bench'), () => runBench(app), { cls: 'small wide' })]),
  );

  // HUD + lecteur
  hud = h('div', { class: 'hud' });
  gauge = h('div', { class: 'gauge' }, h('div', { class: 'gauge-bar' }, h('i', {})), h('span', {}));
  playBtn = h('button', { type: 'button', class: 'play', onclick: () => { if (sw.sim.finished) sw.restart(); else sw.playing = !sw.playing; updatePlay(); }, 'aria-label': 'Play/Pause' });
  const speeds = segmented({ options: [1, 0.5, 0.25, 0.1, 0.05].map((v) => ({ value: v, label: `${v}×` })), value: sw.playback, small: true, onChange: (v) => { sw.playback = v; } });
  const player = h('div', { class: 'player' },
    h('button', { type: 'button', class: 'icon-btn', title: T('Relancer', 'Recast'), onclick: () => { sw.restart(); updatePlay(); } }, icon('restart')),
    playBtn, speeds);
  const badge = h('div', { class: 'badge', id: 'swim-badge' });
  const overlay = h('div', {}, hud, gauge, badge, player);
  sw.onFinish = () => { updatePlay(); updateBadge(app); };
  updatePlay();
  runBench(app);
  return { left: leftEl, right: rightEl, overlay };
}

function scenarioHint(k) {
  return {
    steady: T('moulinage constant', 'constant reel'),
    stopgo: T('2 s / pause 1,2 s', '2 s / 1.2 s pause'),
    twitch: T('coups de scion', 'rod jerks'),
    burn: T('très rapide', 'very fast'),
    slow: T('lent et profond', 'slow & low'),
    yoyo: T('tirée / descente', 'lift & drop'),
  }[k];
}

function updatePlay() {
  if (!playBtn) return;
  const sw = swRef;
  playBtn.innerHTML = '';
  playBtn.append(icon(sw && sw.playing && !sw.sim?.finished ? 'pause' : 'play', 20));
}

function updateBadge(app) {
  const el = document.getElementById('swim-badge');
  if (!el) return;
  const sim = app.swim.sim;
  const v = sim.verdict();
  const name = TL(SCENARIOS[app.swim.params.scenario].label);
  el.className = 'badge ' + (v.ok ? 'ok' : 'bad');
  el.textContent = v.ok ? `${name} ✓` : `${name} — ${v.reason === 'blowout' ? T('décroche !', 'blows out!') : T('se couche', 'rolls over')}`;
}

function runBench(app) {
  clearTimeout(benchTimer);
  benchTimer = setTimeout(() => {
    if (!benchEl || !app.massProps) return;
    const sw = app.swim;
    const hyd = makeHydro(state.design, app.massProps, sw.params.water);
    benchEl.innerHTML = '';
    for (const [k, v] of Object.entries(SCENARIOS)) {
      const sim = new SwimPhysics(hyd, { ...sw.params, scenario: k, cast: Math.min(sw.params.cast, 25) });
      let n = 0;
      while (!sim.finished && n < 60000) { sim.step(1 / 300); n++; }
      const vd = sim.verdict();
      const M = sim.metrics;
      benchEl.append(h('div', { class: 'bench-row ' + (vd.ok ? 'ok' : 'bad') },
        h('b', {}, TL(v.label)),
        h('span', {}, fmtDepth(M.maxDepth)),
        h('span', {}, `${(M.freqSum / (M.freqN || 1)).toFixed(1)} Hz`),
        h('span', { class: 'mark' }, vd.ok ? '✓' : (vd.reason === 'blowout' ? T('décroche', 'blow-out') : '✗'))));
    }
  }, 120);
}

export function frame(app) {
  const sw = app.swim;
  const sim = sw.sim;
  if (!sim || !hud) return;
  const tick = Math.floor(performance.now() / 100);
  if (tick === hud._t) return;
  hud._t = tick;
  const depth = Math.max(0, -sim.pos.y);
  const speed = Math.hypot(sim.vel.x, sim.vel.y, sim.vel.z);
  hud.innerHTML = '';
  hud.append(
    h('div', { class: 'hud-row' },
      hudCell(T('Temps', 'Time'), `${sim.t.toFixed(1)} s`),
      hudCell(T('Profondeur', 'Depth'), fmtDepth(depth)),
      hudCell(T('Distance', 'Distance'), fmtDepth(sim.pos.x)),
      hudCell(T('Vitesse', 'Speed'), fmtSpeed(speed)),
      hudCell(T('Traction', 'Line pull'), fmtForce(sim.tension))),
    h('div', { class: 'hud-sub' }, `● ${T('Poids corrigé pour l’impression', 'Weight corrected for the print')} : ${fmtMass(app.massProps?.mass || 0)}`));
  const maxD = sw.params.depth;
  gauge.querySelector('i').style.top = `${Math.min(100, (depth / maxD) * 100)}%`;
  gauge.querySelector('span').textContent = fmtDepth(maxD, 0);
  if (Math.floor(sim.t * 10) % 3 === 0) updateBadge(app);
  if (liveEl && Math.floor(performance.now() / 250) !== liveEl._t) {
    liveEl._t = Math.floor(performance.now() / 250);
    const M = sim.metrics;
    liveEl.innerHTML = '';
    liveEl.append(
      stat(T('Profondeur max', 'Max depth'), fmtDepth(M.maxDepth)),
      stat(T('Wobble', 'Wobble'), `${sim.freq.toFixed(1)} Hz · ±${(sw.hydro.yawAmp).toFixed(0)}°`),
      stat(T('Roulis max', 'Max roll'), `${Math.min(180, M.maxRoll).toFixed(0)}°`),
      stat(T('Traction max', 'Max line pull'), fmtForce(M.maxTension)),
      stat(T('Contacts au fond', 'Bottom contacts'), String(M.bottomHits)),
      stat(T('Vitesse de décrochage', 'Blow-out speed'), sw.hydro.vCrit > 3 ? '> 3 m/s' : fmtSpeed(sw.hydro.vCrit)));
    drawChart(sw);
  }
}

function hudCell(k, v) { return h('div', { class: 'hud-cell' }, h('small', {}, k), h('b', {}, v)); }

function drawChart(sw) {
  if (!chart) return;
  const g = chart.getContext('2d');
  const W = chart.width, H = chart.height;
  const pad = { l: 46, r: 12, t: 12, b: 28 };
  g.clearRect(0, 0, W, H);
  const maxX = sw.params.cast, maxY = sw.params.depth;
  const X = (x) => pad.l + (1 - x / maxX) * (W - pad.l - pad.r);
  const Y = (y) => pad.t + (y / maxY) * (H - pad.t - pad.b);
  g.strokeStyle = 'rgba(140,190,200,0.15)';
  g.fillStyle = 'rgba(180,215,220,0.75)';
  g.font = '20px system-ui, sans-serif';
  g.lineWidth = 1;
  const ystep = maxY > 6 ? 2 : maxY > 3 ? 1 : 0.5;
  for (let y = 0; y <= maxY + 1e-6; y += ystep) {
    g.beginPath(); g.moveTo(pad.l, Y(y)); g.lineTo(W - pad.r, Y(y)); g.stroke();
    g.fillText(fmtDepth(y, ystep < 1 ? 1 : 0), 2, Y(y) + 6);
  }
  const xstep = maxX > 30 ? 10 : 5;
  for (let x = 0; x <= maxX; x += xstep) g.fillText(fmtDepth(x, 0), X(x) - 14, H - 4);
  g.fillStyle = 'rgba(125,116,87,0.45)';
  g.fillRect(pad.l, Y(maxY) - 3, W - pad.l - pad.r, 3);
  const tr = sw.sim.trace;
  if (tr.length > 1) {
    g.strokeStyle = '#2fd3b5';
    g.lineWidth = 3;
    g.beginPath();
    tr.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
    g.stroke();
    const [lx, ly] = tr[tr.length - 1];
    g.fillStyle = '#ffd166';
    g.beginPath(); g.arc(X(lx), Y(ly), 6, 0, Math.PI * 2); g.fill();
  }
}

export function onStats(app) {
  app.swim.setDesign(state.design, app.painter.texture, app.massProps);
  runBench(app);
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
  hud = chart = benchEl = liveEl = playBtn = gauge = null;
}
