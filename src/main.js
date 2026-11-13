import './style.css';
import * as THREE from 'three';
import { Studio } from './studio.js';
import { Painter, SCHEMES } from './paint.js';
import { SwimView } from './swim.js';
import { CFDLab } from './cfd.js';
import { computeMassProps, autoHardware } from './physics.js';
import { state, on, emit, updateDesign, replaceDesign, undo, redo, canUndo, canRedo, resetHistory } from './store.js';
import { presetDesign, normalizeDesign, PRESETS, designFromImport } from './design.js';
import { readModelFile, processImport, mergeSoups, defaultImportParams, decimate } from './importer.js';
import { setImported, importedRaw, importedFor } from './importedStore.js';
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
import * as interiorPanel from './panels/interiorPanel.js';

const PANELS = { design: designPanel, interior: interiorPanel, paint: paintPanel, swim: swimPanel, cfd: cfdPanel, export: exportPanel };

/* ------------------------------- squelette ------------------------------- */
const root = document.getElementById('app');
const left = h('aside', { class: 'panel left', id: 'left' });
const right = h('aside', { class: 'panel right', id: 'right' });
const glCanvas = h('canvas', { id: 'gl', 'aria-label': T('Vue 3D', '3D view') });
const cfdCanvas = h('canvas', { id: 'cfd', class: 'hidden', 'aria-label': T('Simulation d’écoulement', 'Flow simulation') });
const sketchEl = h('canvas', { id: 'sketch', class: 'hidden', 'aria-label': T('Schéma coté de l’intérieur', 'Dimensioned interior sketch') });
const overlay = h('div', { class: 'overlay' });
const viewport = h('section', { class: 'viewport', id: 'viewport' }, glCanvas, cfdCanvas, sketchEl, overlay);
const nameInput = h('input', { class: 'name-input', value: state.design.name, 'aria-label': T('Nom du leurre', 'Lure name'), maxlength: 40 });
const tabsEl = h('nav', { class: 'tabs', role: 'tablist' });
const undoBtn = h('button', { class: 'icon-btn', type: 'button', title: T('Annuler (Ctrl+Z)', 'Undo (Ctrl+Z)'), onclick: () => doUndo() }, icon('undo'));
const redoBtn = h('button', { class: 'icon-btn', type: 'button', title: T('Rétablir (Ctrl+Y)', 'Redo (Ctrl+Y)'), onclick: () => doRedo() }, icon('redo'));

const TABS = () => [
  { id: 'design', label: T('Conception', 'Design'), ic: 'design' },
  { id: 'interior', label: T('Intérieur', 'Interior'), ic: 'ruler' },
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
  renderer, studio, painter, swim, cfd, viewport, overlay, glCanvas, cfdCanvas, sketchCanvas: sketchEl,
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
  studio.setLure(state.design, painter);
  if (app.massProps) studio.setMarkers(app.massProps.cg, app.massProps.cb);
  lureDirty = false;
  swimDirty = true;
}

function refreshStats() {
  try {
    if (state.design.hooks.auto && autoHardware(state.design, state.water)) { lureDirty = true; swimDirty = true; }
  } catch (e) { console.error(e); }
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

app.undo = () => doUndo();
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
  glCanvas.classList.toggle('hidden', id === 'cfd' || id === 'interior');
  cfdCanvas.classList.toggle('hidden', id !== 'cfd');
  sketchEl.classList.toggle('hidden', id !== 'interior');
  if (!app.massProps) computeProps();
  if (id === 'swim' && swimDirty) {
    if (lureDirty) rebuildLure();
    swim.setDesign(state.design, painter, app.massProps);
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
      swim.setDesign(state.design, painter, app.massProps || computeProps());
      swimDirty = false;
    }
    swim.update(dt);
    swim.render();
  } else if (tab === 'cfd') {
    cfd.frame();
  } else if (tab === 'interior') {
    if (lureDirty) rebuildLure();
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
    await saveProject({
      id: state.projectId, name: state.design.name, design: state.design, paint: painter.toDataURL(), foil: painter.foilDataURL(), thumb: thumbnail(),
      mesh: state.design.type === 'imported' ? importedRaw(state.design) : undefined,
    });
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
  if (p.design?.type === 'imported' && p.mesh && p.design.imported?.id) registerImported(p.design.imported.id, p.mesh, p.design.imported.params);
  replaceDesign(p.design, { history: false });
  resetHistory();
  nameInput.value = state.design.name;
  lureDirty = true;
  if (!(await painter.loadDataURL(p.paint))) painter.applyScheme(state.design.paintPreset || 'sardineHolo');
  else await painter.loadFoilDataURL(p.foil);
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
      button(T('Importer un modèle 3D', 'Import a 3D model'), () => { m.close(); importModel(); }, { ic: 'upload' }),
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
          (() => {
            // confirmation en deux clics (sans boîte de dialogue système)
            const del = button('', async () => {
              if (!del.classList.contains('armed')) {
                del.classList.add('armed');
                del.querySelector('span')?.remove();
                del.append(h('span', {}, T('Confirmer', 'Confirm')));
                setTimeout(() => { if (del.isConnected) { del.classList.remove('armed'); del.querySelector('span')?.remove(); } }, 3000);
                return;
              }
              await deleteProject(p.id);
              if (p.id === state.projectId) state.projectId = null;
              toast(T('Leurre supprimé', 'Lure deleted'));
              refresh();
            }, { cls: 'small danger', ic: 'trash', title: T('Supprimer', 'Delete') });
            return del;
          })()));
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
      const src = data.design || data;
      if (src?.type === 'imported' && data.mesh && src.imported?.id) registerImported(src.imported.id, b64ToF32(data.mesh), src.imported.params);
      const design = normalizeDesign(src);
      state.projectId = newId();
      replaceDesign(design);
      nameInput.value = design.name;
      lureDirty = true;
      if (data.paint) { await painter.loadDataURL(data.paint); await painter.loadFoilDataURL(data.foil); } else painter.applyScheme(design.paintPreset || 'sardineHolo');
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

/* ------------------------------- import de modèles 3D ------------------------------- */
function f32ToB64(f) {
  const u8 = new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToF32(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Float32Array(u8.buffer);
}

function registerImported(id, raw, params) {
  const f = raw instanceof Float32Array ? raw : new Float32Array(raw);
  setImported(id, { raw: f, proc: processImport(f, params) });
}

// Ouvre un ou plusieurs fichiers (STL, 3MF, STEP) : leurre entier, demi-coquille, ou les 2 moitiés
function importModel() {
  const inp = h('input', { type: 'file', accept: '.stl,.3mf,.step,.stp', multiple: true });
  inp.addEventListener('change', async () => {
    const files = [...inp.files];
    if (!files.length) return;
    const isStep = files.some((f) => /\.(step|stp)$/i.test(f.name));
    toast(isStep ? T('Lecture du STEP (moteur CAO, quelques secondes)…', 'Reading STEP (CAD engine, a few seconds)…') : T('Import en cours…', 'Importing…'));
    try {
      const soups = [];
      for (const f of files) soups.push(await readModelFile(f.name, await f.arrayBuffer()));
      let raw = mergeSoups(soups);
      const nTris = raw.length / 9;
      if (nTris > 220000) {
        toast(T(`Maillage très détaillé (${Math.round(nTris / 1000)} k triangles) : simplification…`, `Very dense mesh (${Math.round(nTris / 1000)}k triangles): simplifying…`));
        await new Promise((r) => setTimeout(r, 30));
        raw = decimate(raw);
      }
      const id = 'imp_' + Date.now().toString(36);
      const params = defaultImportParams();
      registerImported(id, raw, params);
      const proc = importedFor({ type: 'imported', imported: { id } });
      if (state.dirty) await saveCurrent(false);
      const name = files.length > 1 ? files[0].name.replace(/[_-]?(gauche|droite|left|right|a|b)?\.(stl|3mf|step|stp)$/i, '') : files[0].name;
      const design = designFromImport(proc, { id, fileName: name, format: files[0].name.split('.').pop().toLowerCase(), params });
      state.projectId = newId();
      replaceDesign(design);
      nameInput.value = design.name;
      painter.applyScheme('white');
      studio.setOptions({ xray: true });
      lureDirty = true;
      setTab('design');
      const what = proc.mirrored ? T('demi-coquille reconstituée par symétrie', 'half shell mirrored to a full body') : T('leurre entier', 'full lure');
      toast(`${T('Importé', 'Imported')} : ${what}${proc.lip ? T(' · bavette détectée', ' · lip detected') : ''} ✓`);
      saveCurrent(false);
    } catch (e) {
      console.error(e);
      toast(`${T('Import impossible', 'Import failed')} : ${e.message || e}`, 'err');
    }
  });
  inp.click();
}
app.importModel = importModel;

// Recalcule le modèle importé avec de nouveaux réglages (orientation, unités, symétrie…)
app.reprocessImport = (patch) => {
  const d = state.design;
  const raw = importedRaw(d);
  if (!raw) return;
  const params = { ...defaultImportParams(), ...(d.imported.params || {}), ...patch };
  setImported(d.imported.id, { proc: processImport(raw, params) });
  const proc = importedFor(d);
  updateDesign((x) => {
    x.imported.params = params;
    x.body = { ...x.body, ...structuredClone(proc.body) };
    if (params.lipAuto && proc.lip) x.lip = { ...x.lip, ...proc.lip };
    if (params.lipAuto && !proc.lip) x.lip.enabled = false;
  }, { source: 'replace' });
  lureDirty = true;
  swimDirty = true;
  rerender();
};

app.exportJson = () => {
  const raw = state.design.type === 'imported' ? importedRaw(state.design) : null;
  const data = { app: 'DMF Lure Studio', format: 3, design: state.design, paint: painter.toDataURL(), foil: painter.foilDataURL(), mesh: raw ? f32ToB64(raw) : undefined };
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
  if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[1-6]$/.test(e.key)) { setTab(TABS()[Number(e.key) - 1].id); return; }
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
