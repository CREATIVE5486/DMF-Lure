// Client du worker CSG (une seule requête en cours ; les demandes obsolètes sont ignorées).
import CsgWorker from './csgWorker.js?worker&inline';

let worker = null;
let seq = 0;
const pending = new Map();

function get() {
  if (worker) return worker;
  worker = new CsgWorker();
  worker.onmessage = (e) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data); else p.reject(new Error(e.data.error));
  };
  worker.onerror = (e) => { for (const p of pending.values()) p.reject(e); pending.clear(); worker = null; };
  return worker;
}

export function runCsg(kind, design, opts = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    get().postMessage({ id, kind, design: JSON.parse(JSON.stringify(design)), opts });
  });
}
