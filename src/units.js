// Affichage des unités (métrique / impérial). Les calculs restent en mm, g, m.
let units = 'metric';
try { units = localStorage.getItem('dmf.units') || 'metric'; } catch { /* ignore */ }

export const getUnits = () => units;
export function setUnits(u) {
  units = u === 'imperial' ? 'imperial' : 'metric';
  try { localStorage.setItem('dmf.units', units); } catch { /* ignore */ }
}
const imp = () => units === 'imperial';
const fix = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '–');

export const fmtLen = (mm, d = 1) => (imp() ? `${fix(mm / 25.4, d + 1)} in` : `${fix(mm, d)} mm`);
export const fmtMass = (g, d = 2) => (imp() ? `${fix(g / 28.3495, 3)} oz` : `${fix(g, d)} g`);
export const fmtMassSigned = (g, d = 2) => (g >= 0 ? '+' : '') + fmtMass(g, d);
export const fmtDepth = (m, d = 1) => (imp() ? `${fix(m * 3.28084, d)} ft` : `${fix(m, d)} m`);
export const fmtSpeed = (ms, d = 2) => (imp() ? `${fix(ms * 3.28084, 1)} ft/s` : `${fix(ms, d)} m/s`);
export const fmtForce = (n) => (imp() ? `${fix(n / 0.27801, 2)} ozf` : `${fix(n * 101.97, 0)} gf`);
