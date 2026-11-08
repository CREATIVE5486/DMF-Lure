// test sans DOM : on simule les classes nécessaires
globalThis.ImageData = class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); } };
globalThis.document = { createElement: () => ({ getContext: () => ({ putImageData() {} }) }) };
const { CFDLab } = await import('../src/cfd.js');
const { presetDesign } = await import('../src/design.js');
const canvas = { width: 600, height: 240, getContext: () => ({ fillRect() {}, drawImage() {}, putImageData() {} }) };
for (const id of ['shad', 'deep', 'lipless']) {
  const lab = new CFDLab(canvas);
  lab.setDesign(presetDesign(id));
  for (let i = 0; i < 5000; i++) lab.step();
  const st = lab.computeStrouhal();
  console.log(id, 'Cd', lab.cdAvg.toFixed(3), 'Cl', lab.clAvg.toFixed(3), 'St', st.toFixed(3), 'D', lab.D, Number.isFinite(lab.cdAvg) ? 'OK' : 'NaN');
}
