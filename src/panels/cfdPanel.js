import { h, section, slider, segmented, button, stat } from '../ui.js';
import { T } from '../i18n.js';

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
  const rightEl = h('div', { class: 'panel-inner' },
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
}

export function onStats(app) { app.cfd.setDesign(app.design); }
export function destroy() { statsEl = null; legend = null; }
