import './style.css';
import * as THREE from 'three';
import { Studio } from './studio.js';
import { Painter, SCHEMES } from './paint.js';
import { SwimView } from './swim.js';
import { CFDLab } from './cfd.js';
import { computeMassProps } from './physics.js';
import { state, on, emit, updateDesign, replaceDesign, undo, redo, canUndo, canRedo, resetHistory } from './store.js';
import { presetDesign, normalizeDesign, PRESETS } from './design.js';
import { h, icon, toast, modal, button } from './ui.js';
import { T, TL, getLang, setLang } from './i18n.js';
import { getUnits, setUnits } from './units.js';
import { saveProject, loadProject, listProjects, deleteProject, newId } from './library.js';
import { downloadBlob } from './export.js';
import * as designPanel from './panels/designPanel.js';
import * as paintPanel from './panels/paintPanel.js';
import * as swimPanel from './panels/swimPanel.js';
import * as cfdPanel from './panels/cfdPanel.js';
import * as exportPanel from './panels/exportPanel.js';

const PANELS = { design: designPanel, paint: paintPanel, swim: swimPanel, cfd: cfdPanel, export: exportPanel };

/* ------------------------------- squelette ------------------------------- */
const root = document.getElementById('app');
const left = h('aside', { class: 'panel left', id: 'left' });
const right = h('aside', { class: 'panel right', id: 'right' });
const glCanvas = h('canvas', { id: 'gl', 'aria-label': T('Vue 3D', '3D view') });
const cfdCanvas = h('canvas', { id: 'cfd', class: 'hidden', 'aria-label': T('Simulation d’écoulement', 'Flow simulation') });
const overlay = h('div', { class: 'overlay' });
const viewport = h('section', { class: 'viewport', id: 'viewport' }, glCanvas, cfdCanvas, overlay);
const nameInput = h('input', { class: 'name-input', value: state.design.name, 'aria-label': T('Nom du leurre', 'Lure name'), maxlength: 40 });
const tabsEl = h('nav', { class: 'tabs', role: 'tablist' });
const undoBtn = h('button', { class: 'icon-btn', type: 'button', title: T('Annuler (Ctrl+Z)', 'Undo (Ctrl+Z)'), onclick: () => doUndo() }, icon('undo'));
const redoBtn = h('button', { class: 'icon-btn', type: 'button', title: T('Rétablir (Ctrl+Y)', 'Redo (Ctrl+Y)'), onclick: () => doRedo() }, icon('redo'));

const TABS = () => [
  { id: 'design', label: T('Conception', 'Design'), ic: 'design' },
  { id: 'paint', label: T('Peinture', 'Paint'), ic: 'paint' },
  { id: 'swim', label: T('Simulation de nage', 'Swim simulation'), ic: 'swim' },
  { id: 'cfd', label: T('Labo hydro', 'Hydro lab'), ic: 'cfd' },
  { id: 'export', label: T('Impression & export', 'Print & export'), ic: 'print' },
];

function buildTopbar() {
  const top = h('header', { class: 'topbar' },
    h('div', { class: 'brand' },
      h('div', { class: 'logo', html: '<svg viewBox="0 0 32 32" width="26" height="26"><rect width="32" height="32" rx="8" fill="#2fd3b5"/><path d="M5 17c4-6 11-8 17-4l5-3v12l-5-3c-6 4-13 2-17-2z" fill="#0b1a20"/><circle cx="20" cy="15" r="1.6" fill="#2fd3b5"/></svg>' }),
      h('div', { class: 'brand-txt' }, h('b', {}, 'DMF Lure'), h('small', {}, 'Studio'))),
    nameInput,
    tabsEl,
    h('div', { class: 'actions' },
      h('button', { class: 'btn ghost', type: 'button', onclick: openLibrary }, icon('folder', 16), h('span', { class: 'lbl' }, T('Mes leurres', 'My lures'))),
      h('button', { class: 'icon-btn', type: 'button', title: T('Enregistrer (Ctrl+S)', 'Save (Ctrl+S)'), onclick: () => saveCurrent(true) }, icon('save')),
      undoBtn, redoBtn,
      h('button', { class: 'pill-btn', type: 'button', title: T('Unités', 'Units'), onclick: () => { setUnits(getUnits() === 'metric' ? 'imperial' : 'metric'); rerender(); } }, getUnits() === 'metric' ? 'mm · g' : 'in · oz'),
      h('button', { class: 'pill-btn', type: 'button', title: T('Langue', 'Language'), onclick: () => { setLang(getLang() === 'fr' ? 'en' : 'fr'); rebuildChrome(); } }, icon('lang', 14), getLang().toUpperCase()),
      h('button', { class: 'icon-btn', type: 'button', title: T('Aide', 'Help'), onclick: openHelp }, icon('help'))));
  return top;
}

let topbar = buildTopbar();
root.append(topbar, h('main', { class: 'workspace' }, left, viewport, right));

function renderTabs() {
  tabsEl.innerHTML = '';
  for (const t of TABS()) {
    const b = h('button', { type: 'button', role: 'tab', class: 'tab' + (state.tab === t.id ? ' on' : ''), 'aria-selected': String(state.tab === t.id), onclick: () => setTab(t.id) }, icon(t.ic, 16), h('span', {}, t.label));
    tabsEl.append(b);
  }
}

function rebuildChrome() {
  const fresh = buildTopbar();
  topbar.replaceWith(fresh);
  topbar = fresh;
  renderTabs();
  rerender();
  updateHistoryButtons();
  document.title = `DMF Lure Studio — ${T('Conception de leurres', 'Lure designer')}`;
}

/* ------------------------------- moteur 3D ------------------------------- */
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x000000, 0);

const painter = new Painter();
const studio = new Studio(renderer, glCanvas);
const swim = new SwimView(renderer, glCanvas);
const cfd = new CFDLab(cfdCanvas);

export const app = {
  renderer, studio, painter, swim, cfd, viewport, overlay, glCanvas, cfdCanvas,
  massProps: null,
  get design() { return state.design; },
  rerender: () => rerender(),
  refreshStats: () => refreshStats(),
  saveCurrent: (n) => saveCurrent(n),
};

function computeProps() {
  try { app.massProps = computeMassProps(state.design, state.water); } catch (e) { console.error(e); }
  return app.massProps;
}

let lureDirty = true, propsTimer = null, swimDirty = true;
function rebuildLure() {
  painter.setDesign(state.design);
  studio.setLure(state.design, painter.texture);
  if (app.massProps) studio.setMarkers(app.massProps.cg, app.massProps.cb);
  lureDirty = false;
  swimDirty = true;
}

function refreshStats() {
  computeProps();
  studio.setMarkers(app.massProps.cg, app.massProps.cb);
  current?.onStats?.(app);
}

on('design', ({ source }) => {
  lureDirty = true;
  swimDirty = true;
  if (nameInput.value !== state.design.name && document.activeElement !== nameInput) nameInput.value = state.design.name;
  clearTimeout(propsTimer);
  propsTimer = setTimeout(refreshStats, source === 'replace' ? 0 : 90);
  current?.onDesign?.(app, source);
  scheduleAutosave();
});
on('design-replaced', () => rerender());
on('history', () => updateHistoryButtons());
painter.onChange = () => scheduleAutosave();

nameInput.addEventListener('input', () => updateDesign((d) => { d.name = nameInput.value.trim() || T('Sans nom', 'Untitled'); }, { source: 'name' }));

function updateHistoryButtons() {
  const paint = state.tab === 'paint';
  undoBtn.disabled = paint ? !painter.undoStack.length : !canUndo();
  redoBtn.disabled = paint ? !painter.redoStack.length : !canRedo();
}
app.updateHistoryButtons = updateHistoryButtons;

function doUndo() { if (state.tab === 'paint') { painter.undo(); } else undo(); updateHistoryButtons(); }
function doRedo() { if (state.tab === 'paint') { painter.redo(); } else redo(); updateHistoryButtons(); }

/* ------------------------------- onglets ------------------------------- */
let current = null;
function setTab(id) {
  if (!PANELS[id]) return;
  state.tab = id;
  try { localStorage.setItem('dmf.tab', id); } catch { /* ignore */ }
  renderTabs();
  rerender();
  updateHistoryButtons();
}
app.setTab = setTab;

function rerender() {
  current?.destroy?.(app);
  left.innerHTML = '';
  right.innerHTML = '';
  overlay.innerHTML = '';
  viewport.dataset.tab = state.tab;
  const id = state.tab;
  glCanvas.classList.toggle('hidden', id === 'cfd');
  cfdCanvas.classList.toggle('hidden', id !== 'cfd');
  if (!app.massProps) computeProps();
  if (id === 'swim' && swimDirty) {
    if (lureDirty) rebuildLure();
    swim.setDesign(state.design, painter.texture, app.massProps);
    swim.restart();
    swimDirty = false;
  }
  if (id === 'cfd') cfd.setDesign(state.design);
  if (id === 'design' || id === 'paint' || id === 'export') studio.setMode(id);
  current = PANELS[id];
  const r = current.render(app);
  left.append(r.left);
  right.append(r.right);
  if (r.overlay) overlay.append(r.overlay);
  onResize();
}

/* ------------------------------- boucle ------------------------------- */
function onResize() {
  const w = viewport.clientWidth, hh = viewport.clientHeight;
  if (!w || !hh) return;
  renderer.setSize(w, hh, false);
  studio.resize(w, hh);
  swim.resize(w, hh);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cfdCanvas.width = Math.round(w * dpr);
  cfdCanvas.height = Math.round(hh * dpr);
}
new ResizeObserver(onResize).observe(viewport);

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const tab = state.tab;
  if (tab === 'swim') {
    if (swimDirty) {
      if (lureDirty) rebuildLure();
      swim.setDesign(state.design, painter.texture, app.massProps || computeProps());
      swimDirty = false;
    }
    swim.update(dt);
    swim.render();
  } else if (tab === 'cfd') {
    cfd.frame();
  } else {
    if (lureDirty) rebuildLure();
    studio.update(dt);
    studio.render();
  }
  current?.frame?.(app, dt);
  requestAnimationFrame(loop);
}

/* ------------------------------- sauvegarde ------------------------------- */
let autosaveTimer = null;
function scheduleAutosave() {
  state.dirty = true;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => saveCurrent(false), 1500);
}

let lastThumb = '';
function thumbnail() {
  try {
    if (state.tab === 'design' || state.tab === 'paint') lastThumb = studio.thumbnail(320, 160) || lastThumb;
  } catch (e) { console.warn(e); }
  return lastThumb;
}

async function saveCurrent(notify) {
  if (!state.projectId) state.projectId = newId();
  try {
    await saveProject({ id: state.projectId, name: state.design.name, design: state.design, paint: painter.toDataURL(), thumb: thumbnail() });
    try { localStorage.setItem('dmf.current', state.projectId); } catch { /* ignore */ }
    state.dirty = false;
    if (notify) toast(T('Leurre enregistré ✓', 'Lure saved ✓'));
  } catch (e) {
    console.error(e);
    if (notify) toast(T('Échec de l’enregistrement', 'Save failed'), 'err');
  }
}

async function openProject(id) {
  const p = await loadProject(id);
  if (!p) return;
  state.projectId = p.id;
  lastThumb = p.thumb || '';
  replaceDesign(p.design, { history: false });
  resetHistory();
  nameInput.value = state.design.name;
  lureDirty = true;
  if (!(await painter.loadDataURL(p.paint))) painter.applyScheme(state.design.paintPreset || 'chromeShad');
  painter.undoStack.length = 0;
  painter.redoStack.length = 0;
  try { localStorage.setItem('dmf.current', p.id); } catch { /* ignore */ }
}

export function newFromPreset(id, keepPaint = false) {
  const d = presetDesign(id);
  state.projectId = newId();
  replaceDesign(d, { history: !keepPaint });
  nameInput.value = d.name;
  if (!keepPaint) painter.applyScheme(d.paintPreset);
  lureDirty = true;
}
app.newFromPreset = newFromPreset;

// Applique une base au leurre courant (annulable)
app.applyPreset = (id) => {
  const d = presetDesign(id);
  replaceDesign(d);
  nameInput.value = d.name;
  painter.snapshot();
  painter.applyScheme(d.paintPreset);
  lureDirty = true;
  updateHistoryButtons();
};

async function openLibrary() {
  const list = h('div', { class: 'lib-grid' }, h('p', { class: 'muted' }, T('Chargement…', 'Loading…')));
  const m = modal(T('Mes leurres', 'My lures'), h('div', {},
    h('div', { class: 'lib-actions' },
      button(T('Nouveau leurre', 'New lure'), () => { m.close(); openNewDialog(); }, { cls: 'primary', ic: 'plus' }),
      button(T('Enregistrer une copie', 'Save a copy'), async () => {
        state.projectId = newId();
        updateDesign((d) => { d.name = `${d.name} (2)`; }, { history: false });
        nameInput.value = state.design.name;
        await saveCurrent(true);
        refresh();
      }, { ic: 'copy' }),
      button(T('Importer .json', 'Import .json'), () => importJson(() => m.close()), { ic: 'upload' })),
    list), { wide: true });
  async function refresh() {
    const items = await listProjects();
    list.innerHTML = '';
    if (!items.length) list.append(h('p', { class: 'muted' }, T('Aucun leurre enregistré pour l’instant.', 'No saved lures yet.')));
    for (const p of items) {
      const card = h('div', { class: 'lib-card' + (p.id === state.projectId ? ' current' : '') },
        h('div', { class: 'thumb', style: { backgroundImage: p.thumb ? `url(${p.thumb})` : 'none' } }),
        h('div', { class: 'meta' }, h('b', {}, p.name), h('small', {}, new Date(p.updated).toLocaleString(getLang() === 'fr' ? 'fr-FR' : 'en-US'))),
        h('div', { class: 'row-btns' },
          button(T('Ouvrir', 'Open'), async () => { await openProject(p.id); m.close(); toast(T('Leurre ouvert', 'Lure opened')); }, { cls: 'small primary' }),
          button('', async () => {
            if (!confirm(T(`Supprimer « ${p.name} » ?`, `Delete "${p.name}"?`))) return;
            await deleteProject(p.id);
            if (p.id === state.projectId) state.projectId = null;
            refresh();
          }, { cls: 'small danger', ic: 'trash', title: T('Supprimer', 'Delete') })));
      list.append(card);
    }
  }
  refresh();
}

function openNewDialog() {
  const grid = h('div', { class: 'preset-grid big' });
  const m = modal(T('Nouveau leurre — choisir une base', 'New lure — pick a base'), grid, { wide: true });
  for (const p of PRESETS) {
    grid.append(h('button', { type: 'button', class: 'preset-card', onclick: async () => { if (state.dirty) await saveCurrent(false); newFromPreset(p.id); m.close(); setTab('design'); } },
      h('b', {}, TL(p.name)), h('small', {}, TL(p.desc))));
  }
}
app.openNewDialog = openNewDialog;

function importJson(done) {
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.addEventListener('change', async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const design = normalizeDesign(data.design || data);
      state.projectId = newId();
      replaceDesign(design);
      nameInput.value = design.name;
      lureDirty = true;
      if (data.paint) await painter.loadDataURL(data.paint); else painter.applyScheme(design.paintPreset || 'chromeShad');
      toast(T('Projet importé ✓', 'Project imported ✓'));
      done && done();
    } catch (e) {
      console.error(e);
      toast(T('Fichier invalide', 'Invalid file'), 'err');
    }
  });
  inp.click();
}
app.importJson = importJson;

app.exportJson = () => {
  const data = { app: 'DMF Lure Studio', format: 1, design: state.design, paint: painter.toDataURL() };
  downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${fileSafe(state.design.name)}.design.json`);
};
export const fileSafe = (s) => (s || 'leurre').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'leurre';
app.fileSafe = fileSafe;

function openHelp() {
  modal(T('Aide & raccourcis', 'Help & shortcuts'), h('div', { class: 'help' },
    h('p', {}, T('DMF Lure Studio est un atelier complet et gratuit pour concevoir, tester et imprimer vos propres leurres. Tout fonctionne dans le navigateur, même hors-ligne ; vos leurres sont enregistrés sur cet appareil.',
      'DMF Lure Studio is a complete, free workshop to design, test and print your own lures. Everything runs in the browser, even offline; your lures are saved on this device.')),
    h('ol', {},
      h('li', {}, h('b', {}, T('Conception', 'Design')), ' — ', T('choisissez une base, réglez les dimensions et déplacez les points du profil (double-clic : ajouter, clic droit : supprimer).', 'pick a base, set dimensions and drag profile points (double-click: add, right-click: remove).')),
      h('li', {}, h('b', {}, T('Peinture', 'Paint')), ' — ', T('peignez directement sur le leurre en 3D. Clic droit ou mode « Tourner » pour faire pivoter.', 'paint directly on the 3D lure. Right-drag or "Rotate" mode to orbit.')),
      h('li', {}, h('b', {}, T('Nage', 'Swim')), ' — ', T('simulation physique : plongée, wobble, stabilité, décrochage selon la vitesse.', 'physics simulation: dive, wobble, stability, blow-out vs speed.')),
      h('li', {}, h('b', {}, T('Labo hydro', 'Hydro lab')), ' — ', T('soufflerie 2D (Boltzmann sur réseau) pour visualiser l’écoulement.', '2D wind tunnel (lattice Boltzmann) to visualise the flow.')),
      h('li', {}, h('b', {}, T('Impression', 'Print')), ' — ', T('demi-coques creuses étanches en STL/3MF + fiche de montage.', 'watertight hollow halves as STL/3MF + build sheet.'))),
    h('h3', {}, T('Raccourcis', 'Shortcuts')),
    h('ul', { class: 'keys' },
      h('li', {}, h('kbd', {}, '1'), '–', h('kbd', {}, '5'), ' ', T('changer d’onglet', 'switch tab')),
      h('li', {}, h('kbd', {}, 'Ctrl'), '+', h('kbd', {}, 'Z'), ' / ', h('kbd', {}, 'Ctrl'), '+', h('kbd', {}, 'Y'), ' ', T('annuler / rétablir', 'undo / redo')),
      h('li', {}, h('kbd', {}, 'Ctrl'), '+', h('kbd', {}, 'S'), ' ', T('enregistrer', 'save')),
      h('li', {}, h('kbd', {}, '['), ' ', h('kbd', {}, ']'), ' ', T('taille du pinceau', 'brush size')),
      h('li', {}, h('kbd', {}, T('Espace', 'Space')), ' ', T('lecture / pause (nage)', 'play / pause (swim)'))),
    h('p', { class: 'muted' }, T('Les résultats physiques sont des estimations : validez toujours en bassin.', 'Physics results are estimates: always confirm with a tank test.'))));
}

/* ------------------------------- clavier ------------------------------- */
window.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveCurrent(true); return; }
  if (typing) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
  if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[1-5]$/.test(e.key)) { setTab(TABS()[Number(e.key) - 1].id); return; }
  current?.onKey?.(app, e);
});

window.addEventListener('beforeunload', () => { if (state.dirty) saveCurrent(false); });

/* ------------------------------- démarrage ------------------------------- */
async function boot() {
  try { const t = localStorage.getItem('dmf.tab'); if (PANELS[t]) state.tab = t; } catch { /* ignore */ }
  let opened = false;
  try {
    const id = localStorage.getItem('dmf.current');
    if (id) { await openProject(id); opened = !!state.projectId; }
  } catch { /* ignore */ }
  if (!opened) {
    state.projectId = newId();
    painter.applyScheme(state.design.paintPreset);
    resetHistory();
  }
  document.documentElement.lang = getLang();
  document.title = `DMF Lure Studio — ${T('Conception de leurres', 'Lure designer')}`;
  renderTabs();
  computeProps();
  rerender();
  updateHistoryButtons();
  requestAnimationFrame(loop);
  let welcomed = false;
  try { welcomed = !!localStorage.getItem('dmf.welcomed'); localStorage.setItem('dmf.welcomed', '1'); } catch { welcomed = true; }
  if (!welcomed) openWelcome();
}

function openWelcome() {
  const m = modal(T('Bienvenue dans DMF Lure Studio', 'Welcome to DMF Lure Studio'), h('div', { class: 'welcome' },
    h('p', { class: 'lead' }, T('Votre leurre préféré n’est plus fabriqué ? Recréez-le — ou inventez le vôtre.', 'Your favourite lure got discontinued? Rebuild it — or invent your own.')),
    h('div', { class: 'steps' },
      ...[
        ['design', T('1. La forme', '1. The shape'), T('Profil, bavette, hameçons, lest', 'Profile, lip, hooks, ballast')],
        ['swim', T('2. La nage', '2. The swim'), T('Profondeur, wobble, stabilité', 'Depth, wobble, stability')],
        ['paint', T('3. La déco', '3. The paint'), T('Aérographe 3D, firetiger, écailles…', '3D airbrush, firetiger, scales…')],
        ['print', T('4. L’impression', '4. Print it'), T('STL / 3MF en deux demi-coques', 'STL / 3MF as two halves')],
      ].map(([ic, a, b]) => h('div', { class: 'step' }, icon(ic, 22), h('b', {}, a), h('small', {}, b)))),
    h('p', { class: 'muted' }, T('100 % gratuit, sans compte, fonctionne hors-ligne.', '100% free, no account, works offline.')),
    button(T('Commencer', 'Get started'), () => m.close(), { cls: 'primary wide' })));
}

boot();

if ('serviceWorker' in navigator && location.protocol === 'https:' && !import.meta.env.DEV) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

export { SCHEMES, emit };
