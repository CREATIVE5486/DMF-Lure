// État global de l'application + historique annuler/rétablir du design.
import { presetDesign, normalizeDesign } from './design.js';

const listeners = new Map();
export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}
export function emit(evt, payload) {
  for (const fn of listeners.get(evt) || []) {
    try { fn(payload); } catch (e) { console.error(e); }
  }
}

export const state = {
  design: presetDesign('shad'),
  projectId: null,
  tab: 'design',
  water: 'fresh',
  dirty: false,
};

const undoStack = [];
const redoStack = [];
let lastPush = 0;
let lastSnapshot = JSON.stringify(state.design);

function pushUndo(force = false) {
  const now = performance.now();
  if (force || now - lastPush > 450) {
    undoStack.push(lastSnapshot);
    if (undoStack.length > 120) undoStack.shift();
    redoStack.length = 0;
  }
  lastPush = now;
}

// Modifie le design via une fonction (d) => { ... } et notifie les vues.
export function updateDesign(mutator, { history = true, source = '' } = {}) {
  if (history) pushUndo();
  mutator(state.design);
  lastSnapshot = JSON.stringify(state.design);
  state.dirty = true;
  emit('design', { source });
  emit('history');
}

export function replaceDesign(d, { history = true } = {}) {
  if (history) pushUndo(true);
  state.design = normalizeDesign(d);
  lastSnapshot = JSON.stringify(state.design);
  state.dirty = true;
  emit('design', { source: 'replace' });
  emit('design-replaced');
  emit('history');
}

export function resetHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  lastSnapshot = JSON.stringify(state.design);
  emit('history');
}

export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

export function undo() {
  if (!undoStack.length) return;
  redoStack.push(lastSnapshot);
  lastSnapshot = undoStack.pop();
  state.design = JSON.parse(lastSnapshot);
  emit('design', { source: 'undo' });
  emit('design-replaced');
  emit('history');
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push(lastSnapshot);
  lastSnapshot = redoStack.pop();
  state.design = JSON.parse(lastSnapshot);
  emit('design', { source: 'redo' });
  emit('design-replaced');
  emit('history');
}
