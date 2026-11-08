// Bibliothèque de projets locale (IndexedDB), avec repli mémoire si indisponible.
const DB = 'dmf-lure-studio';
const STORE = 'projects';
let dbp = null;
const memory = new Map();

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

async function tx(mode, fn) {
  const db = await open();
  if (!db) return fn(null);
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  });
}

const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function saveProject(p) {
  const rec = { ...p, updated: Date.now() };
  return tx('readwrite', (s) => (s ? req2p(s.put(rec)) : memory.set(rec.id, rec))).then(() => rec);
}

export async function loadProject(id) {
  return tx('readonly', (s) => (s ? req2p(s.get(id)) : memory.get(id)));
}

export async function listProjects() {
  const all = await tx('readonly', (s) => (s ? req2p(s.getAll()) : [...memory.values()]));
  return (all || []).sort((a, b) => b.updated - a.updated);
}

export async function deleteProject(id) {
  return tx('readwrite', (s) => (s ? req2p(s.delete(id)) : memory.delete(id)));
}

export const newId = () => 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
