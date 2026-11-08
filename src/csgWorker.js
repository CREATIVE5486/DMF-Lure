// Calculs CSG en arrière-plan (l'interface reste fluide).
import { printSolids, moldGeometry, masterGeometry, finalSoup } from './csg.js';

self.onmessage = (e) => {
  const { id, kind, design, opts } = e.data;
  try {
    let parts = [];
    let features = null;
    if (kind === 'print') {
      parts = printSolids(design, opts);
    } else if (kind === 'mold') {
      const m = moldGeometry(design, opts);
      parts = [{ key: 'moldA', soup: finalSoup(m.A) }, { key: 'moldB', soup: finalSoup(m.B) }];
      features = { ...m.features, min: m.min, max: m.max };
    } else if (kind === 'master') {
      const m = masterGeometry(design, opts);
      parts = m.masters.map((x) => ({ key: x.side > 0 ? 'masterA' : 'masterB', soup: finalSoup(x.brush) }));
      features = { min: m.min, max: m.max, depth: m.depth, siliconeVolume: m.masters[0].siliconeVolume };
    }
    self.postMessage({ id, ok: true, parts, features }, parts.map((p) => p.soup.buffer));
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
