import { h, section, slider, segmented, button, stat } from '../ui.js';
import { T } from '../i18n.js';
import { state, updateDesign } from '../store.js';
import { computeMassProps } from '../physics.js';
import { makeHydro, SwimPhysics, KNOT } from '../swimPhysics.js';
import { fmtDepth } from '../units.js';

let diagEl = null, whatifEl = null, whatifTimer = null, whatifSeq = 0;

// Simulation rapide (traîne) pour comparer des variantes
function quickRun(design, speed, water) {
  const mp = computeMassProps(design, water);
  const hyd = makeHydro(design, mp, water);
  const sim = new SwimPhysics(hyd, { scenario: 'troll', speed, lineOut: 40, depth: 80, water });
  let n = 0;
  while (sim.t < 22 && n < 9000) { sim.step(1 / 250); n++; }
  return { depth: sim.metrics.maxDepth, freq: sim.metrics.freqSum / (sim.metrics.freqN || 1), yaw: hyd.yawAmp, vCrit: hyd.vCrit, blow: sim.metrics.blowout, mass: mp.mass, net: mp.netBuoyancy, righting: mp.righting };
}

function variants(d) {
  const out = [];
  const add = (fr, en, fn) => { const x = structuredClone(d); fn(x); out.push({ fr, en, design: x, apply: fn }); };
  if (d.lip.enabled) {
    add('Bavette plus horizontale (−8°)', 'Flatter lip (−8°)', (x) => { x.lip.angle = Math.max(5, x.lip.angle - 8); });
    add('Bavette plus verticale (+8°)', 'Steeper lip (+8°)', (x) => { x.lip.angle = Math.min(90, x.lip.angle + 8); });
    add('Bavette plus longue (+20 %)', 'Longer lip (+20%)', (x) => { x.lip.length = Math.round(x.lip.length * 1.2 * 10) / 10; });
    add('Bavette plus large (+20 %)', 'Wider lip (+20%)', (x) => { x.lip.width = Math.round(x.lip.width * 1.2 * 10) / 10; });
  }
  add('Corps plus large (+15 %)', 'Wider body (+15%)', (x) => { x.body.width = Math.round(x.body.width * 1.15 * 10) / 10; });
  add('Ventre en V (+30 %)', 'V belly (+30%)', (x) => { x.body.keel = Math.min(1, (x.body.keel || 0) + 0.3); });
  add('Plus de lest (+10 % du poids)', 'More ballast (+10% weight)', (x) => { x.ballast.grams = Math.round((x.ballast.grams + Math.max(1, x.body.length * 0.05)) * 10) / 10; });
  add('Lest plus en arrière (+10 %)', 'Ballast further back (+10%)', (x) => { x.ballast.u = Math.min(0.9, x.ballast.u + 0.1); });
  return out;
}

function sentence(base, v) {
  const parts = [];
  const dd = v.depth - base.depth;
  if (Math.abs(dd) > 0.15) parts.push(dd > 0 ? T(`plonge plus profond (+${dd.toFixed(1)} m)`, `dives deeper (+${dd.toFixed(1)} m)`) : T(`nage moins profond (${dd.toFixed(1)} m)`, `runs shallower (${dd.toFixed(1)} m)`));
  const dy = v.yaw - base.yaw;
  if (Math.abs(dy) > 0.8) parts.push(dy > 0 ? T('nage plus large', 'wider wobble') : T('nage plus serrée', 'tighter wobble'));
  const df = v.freq - base.freq;
  if (Math.abs(df) > 0.4) parts.push(df > 0 ? T(`vibre plus vite (+${df.toFixed(1)} Hz)`, `vibrates faster (+${df.toFixed(1)} Hz)`) : T(`vibre plus lentement (${df.toFixed(1)} Hz)`, `vibrates slower (${df.toFixed(1)} Hz)`));
  const dv = (v.vCrit - base.vCrit) / KNOT;
  if (Math.abs(dv) > 0.3 && base.vCrit < 7) parts.push(dv > 0 ? T(`tient ${dv.toFixed(1)} nœud(s) de plus avant de décrocher`, `holds ${dv.toFixed(1)} kn more before blowing out`) : T(`décroche ${(-dv).toFixed(1)} nœud(s) plus tôt`, `blows out ${(-dv).toFixed(1)} kn earlier`));
  const dr = v.righting - base.righting;
  if (Math.abs(dr) > 0.4) parts.push(dr > 0 ? T('plus stable en roulis', 'more roll-stable') : T('moins stable en roulis', 'less roll-stable'));
  if (Math.sign(v.net) !== Math.sign(base.net) && Math.abs(v.net - base.net) > 0.1) parts.push(v.net < 0 ? T('devient coulant', 'becomes sinking') : T('devient flottant', 'becomes floating'));
  if (v.blow && !base.blow) parts.push(T('⚠ décroche à cette vitesse', '⚠ blows out at this speed'));
  return parts.length ? parts.join(', ') : T('presque aucun effet', 'almost no effect');
}

function scheduleWhatIf(app) {
  clearTimeout(whatifTimer);
  whatifTimer = setTimeout(() => runWhatIf(app), 400);
}

async function runWhatIf(app) {
  if (!whatifEl) return;
  const seq = ++whatifSeq;
  const d = state.design;
  const water = state.water;
  const speed = app.swim?.params?.speed || 5 * KNOT;
  whatifEl.innerHTML = '';
  whatifEl.append(h('p', { class: 'muted' }, T('Simulation des variantes…', 'Simulating variants…')));
  const base = quickRun(d, speed, water);
  const vs = variants(d);
  const rows = [];
  for (const v of vs) {
    await new Promise((r) => setTimeout(r, 0));
    if (seq !== whatifSeq || !whatifEl) return;
    rows.push({ v, res: quickRun(v.design, speed, water) });
  }
  whatifEl.innerHTML = '';
  whatifEl.append(h('p', { class: 'hint' }, T(`Référence à ${(speed / KNOT).toFixed(1)} nœuds (traîne, 40 m de ligne) : ${fmtDepth(base.depth)}, ${base.freq.toFixed(1)} Hz.`, `Baseline at ${(speed / KNOT).toFixed(1)} kn (trolling, 40 m line): ${fmtDepth(base.depth)}, ${base.freq.toFixed(1)} Hz.`)));
  for (const { v, res } of rows) {
    whatifEl.append(h('div', { class: 'whatif' },
      h('div', {}, h('b', {}, T(v.fr, v.en)), h('p', {}, sentence(base, res))),
      button(T('Appliquer', 'Apply'), () => { updateDesign((x) => v.apply(x)); app.rerender(); }, { cls: 'small' })));
  }
}

// Diagnostic écrit à partir des résultats de la soufflerie
function diagnose(app, s) {
  const d = state.design;
  const lines = [];
  const ok = (txt) => lines.push(['ok', txt]);
  const warn = (txt) => lines.push(['warn', txt]);
  const info = (txt) => lines.push(['info', txt]);
  if ((s.steps || 0) < 2500) { info(T('Calcul en cours : attendez que l’écoulement se stabilise (≈ 3 000 itérations).', 'Computing: wait for the flow to settle (≈ 3,000 iterations).')); return lines; }
  const side = app.cfd.view === 'side';
  const fast = d.type === 'bonito' || d.type === 'skirt' || d.type === 'deep';
  if (s.cd < 1.2) ok(T('Traînée faible : le leurre glisse bien dans l’eau. Il tiendra les grandes vitesses (traîne rapide, lancers loin) mais aura une nage discrète.', 'Low drag: the lure slips through the water. It will handle high speed (fast trolling, long casts) with a subtle action.'));
  else if (s.cd < 2.2) ok(T('Traînée moyenne : bon compromis entre nage marquée et tenue en vitesse.', 'Medium drag: good balance between strong action and speed handling.'));
  else (fast ? warn : info)(T('Traînée forte : nage puissante et beaucoup de vibrations, mais le leurre « tire » fort sur la ligne et risque de décrocher à grande vitesse. Pour l’alléger : bavette plus petite ou plus horizontale, nez plus pointu.', 'High drag: strong action and lots of vibration, but heavy pull and risk of blowing out at speed. To reduce it: smaller or flatter lip, sharper nose.'));
  if (side) {
    if (s.cl < -1.5) ok(T('Forte portance vers le bas : la bavette fait plonger franchement. Idéal pour un plongeur profond.', 'Strong downward lift: the lip drives the lure down hard. Ideal for a deep diver.'));
    else if (s.cl < -0.3) ok(T('Portance modérée vers le bas : le leurre plonge progressivement et reste à une profondeur moyenne.', 'Moderate downward lift: the lure dives gradually to mid depth.'));
    else if (s.cl < 0.3) info(T('Portance quasi nulle : le leurre reste à son niveau (normal pour un stickbait, popper ou bonito). Pour qu’il plonge : ajoutez une bavette ou inclinez-la.', 'Near-zero lift: the lure holds its level (normal for stickbait, popper or bonito). To dive: add or tilt a lip.'));
    else warn(T('Portance vers le haut : le leurre a tendance à remonter. Réduisez l’assiette (tête moins haute) ou ajoutez une bavette.', 'Upward lift: the lure tends to rise. Reduce the pitch or add a lip.'));
  }
  if (s.st > 0.05) {
    const v = app.swim?.params?.speed || 5 * KNOT;
    const D = (side ? app.massProps?.dims.height : app.massProps?.dims.width) / 1000 || 0.03;
    const f = (s.st * v) / D;
    info(T(`Sillage oscillant (Strouhal ${s.st.toFixed(2)}) : à ${(v / KNOT).toFixed(1)} nœuds, les tourbillons se détachent ≈ ${f.toFixed(0)} fois par seconde. C’est cette vibration que les poissons ressentent par la ligne latérale.`, `Oscillating wake (Strouhal ${s.st.toFixed(2)}): at ${(v / KNOT).toFixed(1)} kn, vortices shed ≈ ${f.toFixed(0)} times per second, the vibration fish feel through their lateral line.`));
  } else info(T('Sillage encore stable : augmentez le nombre de Reynolds pour voir les tourbillons alternés.', 'Wake still steady: raise the Reynolds number to see alternating vortices.'));
  if (app.massProps && app.massProps.righting < 0.5) warn(T('Attention : centre de gravité trop haut, le leurre peut se coucher. Descendez le lest.', 'Warning: CG too high, the lure may roll over. Lower the ballast.'));
  return lines;
}

let statsEl = null, legend = null, lastStats = 0;

export function render(app) {
  const lab = app.cfd;
  const leftEl = h('div', { class: 'panel-inner' },
    section(T('Soufflerie', 'Flow tunnel'), [
      h('div', { class: 'field' }, h('label', {}, T('Coupe', 'Section')), segmented({ options: [{ value: 'side', label: T('Côté', 'Side') }, { value: 'top', label: T('Dessus', 'Top') }], value: lab.view, small: true, onChange: (v) => lab.setOptions({ view: v }) })),
      h('div', { class: 'field' }, h('label', {}, T('Affichage', 'Display')), segmented({
        options: [{ value: 'speed', label: T('Vitesse', 'Speed') }, { value: 'vorticity', label: T('Tourbillons', 'Vorticity') }, { value: 'pressure', label: T('Pression', 'Pressure') }],
        value: lab.field, small: true, onChange: (v) => { lab.field = v; drawLegend(lab); },
      })),
      slider({ label: T('Nombre de Reynolds (simulé)', 'Reynolds number (simulated)'), min: 60, max: 400, step: 10, value: lab.re, fmt: (v) => String(v), onChange: (v) => lab.setOptions({ re: v }), hint: T('Plus élevé = sillage plus turbulent', 'Higher = more turbulent wake') }),
      slider({ label: T('Assiette (tangage)', 'Pitch angle'), min: -25, max: 35, step: 1, value: lab.pitch, fmt: (v) => `${v}°`, onChange: (v) => lab.setOptions({ pitch: v }), hint: T('Les plongeurs nagent tête basse', 'Divers swim nose-down') }),
      h('div', { class: 'btn-row' },
        button(T('Pause / reprise', 'Pause / resume'), () => { lab.running = !lab.running; }, { cls: 'small' }),
        button(T('Réinitialiser', 'Reset'), () => lab.init(), { cls: 'small' })),
    ]),
    section(T('Comment lire', 'How to read'), [
      h('p', { class: 'hint' }, T(
        'Écoulement 2D autour d’une coupe du leurre (méthode de Boltzmann sur réseau, D2Q9). L’eau arrive par la gauche. Le sillage oscillant derrière le corps est ce qui fait « vibrer » le leurre. Une portance négative signifie que la bavette fait plonger.',
        '2D flow around a lure section (lattice Boltzmann, D2Q9). Water comes from the left. The oscillating wake behind the body is what makes the bait vibrate. Negative lift means the lip drives it down.')),
    ]),
  );
  statsEl = h('div', {});
  legend = h('canvas', { class: 'legend', width: 300, height: 26 });
  diagEl = h('div', { class: 'diag' });
  whatifEl = h('div', {});
  scheduleWhatIf(app);
  const rightEl = h('div', { class: 'panel-inner' },
    section(T('Diagnostic', 'Diagnosis'), [diagEl]),
    section(T('Et si je…', 'What if I…'), [whatifEl]),
    section(T('Résultats', 'Results'), [statsEl]),
    section(T('Échelle', 'Scale'), [legend]),
  );
  drawLegend(lab);
  return { left: leftEl, right: rightEl, overlay: h('div', { class: 'cfd-tag' }, T('Écoulement →', 'Flow →')) };
}

function drawLegend(lab) {
  if (!legend) return;
  const g = legend.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 300, 0);
  if (lab.field === 'speed') ['#30123b', '#4662d7', '#36aaf9', '#1ae4b6', '#72fe5e', '#c8ef34', '#faba39', '#f66b19', '#ca2a04', '#7a0403'].forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c));
  else { gr.addColorStop(0, '#2638ff'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#ff2638'); }
  g.fillStyle = gr;
  g.fillRect(0, 0, 300, 26);
}

export function frame(app) {
  if (!statsEl) return;
  const now = performance.now();
  if (now - lastStats < 300) return;
  lastStats = now;
  const s = app.cfd.stats;
  statsEl.innerHTML = '';
  const dive = s.cl < -0.05;
  statsEl.append(
    stat(T('Coefficient de traînée Cd', 'Drag coefficient Cd'), s.cd.toFixed(2)),
    stat(T('Portance Cl', 'Lift Cl'), `${s.cl.toFixed(2)} ${app.cfd.view === 'side' ? (dive ? T('↓ plonge', '↓ dives') : T('↑ remonte', '↑ rises')) : ''}`),
    stat(T('Nombre de Strouhal', 'Strouhal number'), s.st > 0 ? s.st.toFixed(3) : T('en cours…', 'settling…')),
    stat(T('Itérations', 'Iterations'), String(s.steps || 0)),
    h('p', { class: 'hint' }, T('Valeurs relatives (2D, Reynolds réduit) : comparez vos variantes entre elles.', 'Relative values (2D, reduced Reynolds): compare your variants against each other.')));
  if (diagEl) {
    diagEl.innerHTML = '';
    for (const [k, txt] of diagnose(app, s)) diagEl.append(h('p', { class: 'diag-' + k }, k === 'ok' ? '✓ ' : k === 'warn' ? '⚠ ' : 'ℹ ', txt));
  }
}

export function onStats(app) { app.cfd.setDesign(app.design); scheduleWhatIf(app); }
export function destroy() { statsEl = null; legend = null; diagEl = null; whatifEl = null; whatifSeq++; }
