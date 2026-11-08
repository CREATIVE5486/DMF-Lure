import { h, section, slider, select, toggle, segmented, button, colorInput, icon, toast } from '../ui.js';
import { T, TL } from '../i18n.js';
import { state, updateDesign } from '../store.js';
import { SCHEMES, TEX_W, TEX_H } from '../paint.js';
import { downloadBlob } from '../export.js';
import { fmtLen } from '../units.js';

const PALETTE = ['#111111', '#ffffff', '#f2efe6', '#c0c4c9', '#5a6068', '#1d2f4f', '#1f5fbf', '#3aa0ff', '#2a8a3e', '#7ed321', '#d7ff38', '#ffe14a', '#ffb000', '#ff7a1a', '#e0283a', '#b0204e', '#ff6fb5', '#7b3fbf', '#6b4a2b', '#a87b4f', '#e9d27a', '#cfa648'];

let cleanup = [];
let mode = 'paint';
let recent = [];

export function render(app) {
  const p = app.painter;
  const b = p.brush;
  const d = state.design;

  const toolBtn = (id, ic, label) => {
    const el = h('button', { type: 'button', class: 'tool' + (b.tool === id ? ' on' : ''), title: label, onclick: () => { b.tool = id; app.rerender(); } }, icon(ic, 20), h('span', {}, label));
    return el;
  };

  const swatches = h('div', { class: 'swatches' }, [...new Set([...recent, ...PALETTE])].slice(0, 28).map((c) => h('button', {
    type: 'button', class: 'sw' + (c.toLowerCase() === b.color.toLowerCase() ? ' on' : ''), style: { background: c }, title: c, 'aria-label': c,
    onclick: () => { setColor(c); app.rerender(); },
  })));
  const setColor = (c) => {
    b.color = c;
    recent = [c, ...recent.filter((x) => x !== c)].slice(0, 6);
  };

  const tools = h('div', { class: 'tools' },
    toolBtn('airbrush', 'air', T('Aérographe', 'Airbrush')),
    toolBtn('brush', 'brush', T('Pinceau', 'Brush')),
    toolBtn('eraser', 'eraser', T('Gomme', 'Eraser')),
    toolBtn('picker', 'picker', T('Pipette', 'Eyedropper')),
    toolBtn('text', 'text', T('Texte', 'Text')));

  const brushOpts = [
    h('div', { class: 'color-row' }, colorInput({ value: b.color, onChange: (c) => { b.color = c; } }), h('span', { class: 'muted' }, T('Couleur', 'Color'))),
    swatches,
    b.tool === 'text'
      ? [
        h('div', { class: 'field' }, h('label', {}, T('Texte', 'Text')), (() => { const i = h('input', { type: 'text', value: b.text, maxlength: 24 }); i.addEventListener('input', () => { b.text = i.value; }); return i; })()),
        slider({ label: T('Taille du texte', 'Text size'), min: 1.5, max: 20, step: 0.5, value: b.textSize, fmt: (v) => fmtLen(v), onInput: (v) => { b.textSize = v; } }),
        segmented({ options: [{ value: 'bold', label: T('Gras', 'Bold') }, { value: 'normal', label: 'Normal' }, { value: 'italic', label: T('Italique', 'Italic') }], value: b.font, small: true, onChange: (v) => { b.font = v; } }),
      ]
      : slider({ label: T('Taille', 'Size'), min: 0.5, max: 30, step: 0.5, value: b.size, fmt: (v) => fmtLen(v), onInput: (v) => { b.size = v; } }),
    slider({ label: T('Opacité', 'Opacity'), min: 0.05, max: 1, step: 0.05, value: b.opacity, fmt: (v) => `${Math.round(v * 100)} %`, onInput: (v) => { b.opacity = v; } }),
    b.tool === 'airbrush' || b.tool === 'brush' ? slider({ label: T('Dureté', 'Hardness'), min: 0, max: 0.95, step: 0.05, value: b.hardness, fmt: (v) => `${Math.round(v * 100)} %`, onInput: (v) => { b.hardness = v; } }) : null,
    toggle({ label: T('Symétrie gauche / droite', 'Mirror left / right'), value: b.mirror, onChange: (v) => { b.mirror = v; } }),
    select({
      label: T('Pochoir (masque)', 'Stencil (mask)'), value: b.stencil, onChange: (v) => { b.stencil = v; },
      options: [{ value: 'none', label: T('Aucun', 'None') }, { value: 'scales', label: T('Filet à écailles', 'Scale netting') }, { value: 'dots', label: T('Points', 'Dots') }, { value: 'stripes', label: T('Rayures', 'Stripes') }],
    }),
  ];

  const pat = { back: '#22303a', side: '#b9c3c9', belly: '#ffffff', fx: '#141414' };
  const op = (fn) => { p.snapshot(); fn(); p.changed(); app.updateHistoryButtons(); };
  const patterns = [
    h('div', { class: 'grad-row' },
      colorInput({ value: pat.back, label: T('Dos', 'Back'), onChange: (c) => { pat.back = c; } }),
      colorInput({ value: pat.side, label: T('Flanc', 'Side'), onChange: (c) => { pat.side = c; } }),
      colorInput({ value: pat.belly, label: T('Ventre', 'Belly'), onChange: (c) => { pat.belly = c; } })),
    button(T('Appliquer le dégradé', 'Apply gradient'), () => op(() => p.gradient([[0, pat.back], [0.35, pat.side], [0.7, pat.belly], [1, pat.belly]])), { cls: 'small wide' }),
    h('div', { class: 'color-row' }, colorInput({ value: pat.fx, onChange: (c) => { pat.fx = c; } }), h('span', { class: 'muted' }, T('Couleur des motifs', 'Pattern color'))),
    h('div', { class: 'pattern-grid' },
      button(T('Barres tigre', 'Tiger bars'), () => op(() => p.tigerBars(pat.fx, { seed: Math.floor(Math.random() * 999) })), { cls: 'small' }),
      button(T('Écailles', 'Scales'), () => op(() => p.scales({ color: pat.fx, size: 2.6, line: 0.45, alpha: 0.75, f0: 0, f1: 0.62 })), { cls: 'small' }),
      button(T('Taches', 'Spots'), () => op(() => p.spots(pat.fx, { seed: Math.floor(Math.random() * 999) })), { cls: 'small' }),
      button(T('Paillettes', 'Glitter'), () => op(() => p.glitter(pat.fx, 0.002, Math.floor(Math.random() * 999))), { cls: 'small' }),
      button(T('Ouïes', 'Gills'), () => op(() => p.gill(pat.fx === '#141414' ? '#d4263a' : pat.fx, 0.18)), { cls: 'small' }),
      button(T('Ligne latérale', 'Lateral line'), () => op(() => p.lateralLine(pat.fx, 0.6, 1.2)), { cls: 'small' }),
      button(T('Ventre orangé', 'Orange belly'), () => op(() => p.band('#ff7a1a', 0.82, 1.05, 0.6, 0.06)), { cls: 'small' }),
      button(T('Tête sombre', 'Dark head'), () => op(() => p.lengthwise(pat.fx, 0, 0.22, 0.45, 0.08)), { cls: 'small' })),
  ];

  const schemes = h('div', { class: 'scheme-grid' }, SCHEMES.map((s) => h('button', {
    type: 'button', class: 'scheme', onclick: () => { op(() => s.paint(p)); updateDesign((dd) => { dd.paintPreset = s.id; }, { history: false, source: 'paint' }); },
  }, h('span', { class: 'chips' }, s.swatch.map((c) => h('i', { style: { background: c } }))), h('span', {}, TL(s.name)))));

  const finish = [
    slider({ label: T('Brillance', 'Gloss'), min: 0, max: 1, step: 0.02, value: 1 - d.finish.roughness, fmt: (v) => `${Math.round(v * 100)} %`, onInput: (v) => { updateDesign((dd) => { dd.finish.roughness = 1 - v; }, { source: 'finish' }); } }),
    slider({ label: T('Métallisé (chrome)', 'Metallic (chrome)'), min: 0, max: 1, step: 0.02, value: d.finish.metalness, fmt: (v) => `${Math.round(v * 100)} %`, onInput: (v) => { updateDesign((dd) => { dd.finish.metalness = v; }, { source: 'finish' }); } }),
    slider({ label: T('Vernis époxy', 'Epoxy clear coat'), min: 0, max: 1, step: 0.05, value: d.finish.clearcoat, fmt: (v) => `${Math.round(v * 100)} %`, onInput: (v) => { updateDesign((dd) => { dd.finish.clearcoat = v; }, { source: 'finish' }); } }),
    h('div', { class: 'grad-row' },
      colorInput({ value: d.eyes.iris, label: T('Iris', 'Iris'), onChange: (c) => updateDesign((dd) => { dd.eyes.iris = c; }, { source: 'finish' }) }),
      colorInput({ value: d.eyes.pupil, label: T('Pupille', 'Pupil'), onChange: (c) => updateDesign((dd) => { dd.eyes.pupil = c; }, { source: 'finish' }) })),
    d.lip.enabled ? toggle({ label: T('Bavette transparente', 'Clear lip'), value: d.lip.clear, onChange: (v) => { updateDesign((dd) => { dd.lip.clear = v; }); app.rerender(); } }) : null,
    d.lip.enabled && !d.lip.clear ? h('div', { class: 'color-row' }, colorInput({ value: d.lip.color, onChange: (c) => updateDesign((dd) => { dd.lip.color = c; }, { source: 'finish' }) }), h('span', { class: 'muted' }, T('Couleur bavette', 'Lip color'))) : null,
  ];

  const file = [
    h('div', { class: 'btn-row' },
      button(T('Annuler', 'Undo'), () => { p.undo(); app.updateHistoryButtons(); }, { cls: 'small', ic: 'undo' }),
      button(T('Rétablir', 'Redo'), () => { p.redo(); app.updateHistoryButtons(); }, { cls: 'small', ic: 'redo' })),
    button(T('Remettre en blanc', 'Reset to white'), () => op(() => p.fill('#f2efe6')), { cls: 'small wide' }),
    button(T('Exporter la texture (PNG)', 'Export texture (PNG)'), () => p.canvas.toBlob((bl) => downloadBlob(bl, `${app.fileSafe(state.design.name)}_texture.png`)), { cls: 'small wide', ic: 'download' }),
    button(T('Importer une texture', 'Import a texture'), () => {
      const i = h('input', { type: 'file', accept: 'image/*' });
      i.addEventListener('change', () => {
        const f = i.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => { p.snapshot(); p.loadDataURL(r.result); };
        r.readAsDataURL(f);
      });
      i.click();
    }, { cls: 'small wide', ic: 'upload' }),
    h('p', { class: 'hint' }, T(`Gabarit ${TEX_W}×${TEX_H} px : horizontal = nez → queue, vertical = dos → flanc gauche → ventre → flanc droit → dos.`, `Template ${TEX_W}×${TEX_H} px: horizontal = nose → tail, vertical = back → left side → belly → right side → back.`)),
  ];

  const leftEl = h('div', { class: 'panel-inner' },
    section(T('Outils', 'Tools'), [tools, ...brushOpts]),
    section(T('Coloris prêts', 'Ready-made schemes'), [schemes]),
    section(T('Motifs', 'Patterns'), patterns, { open: false }),
  );
  const rightEl = h('div', { class: 'panel-inner' },
    section(T('Finition', 'Finish'), finish),
    section(T('Texture', 'Texture'), file),
    section(T('Aperçu UV', 'UV preview'), [(() => { const c = h('canvas', { class: 'uv-preview', width: 512, height: 256 }); const g = c.getContext('2d'); const draw = () => { g.drawImage(p.canvas, 0, 0, 512, 256); }; draw(); const id = setInterval(draw, 500); cleanup.push(() => clearInterval(id)); return c; })()], { open: false }),
  );

  // barre d'outils sur la vue
  const cursor = h('div', { class: 'brush-cursor' });
  const overlay = h('div', {},
    h('div', { class: 'view-toolbar' },
      segmented({ options: [{ value: 'paint', label: T('Peindre', 'Paint'), icon: 'brush' }, { value: 'orbit', label: T('Tourner', 'Rotate'), icon: 'rotate' }], value: mode, small: true, onChange: (v) => { mode = v; setControls(); } }),
      ...[['left', T('Gauche', 'Left')], ['right', T('Droite', 'Right')], ['top', T('Dessus', 'Top')], ['belly', T('Ventre', 'Belly')], ['front', T('Face', 'Front')], ['reset', '3/4']]
        .map(([v, l]) => h('button', { type: 'button', class: 'chip', onclick: () => app.studio.view(v) }, l))),
    cursor);

  const studio = app.studio;
  const setControls = () => {
    studio.controls.mouseButtons = mode === 'paint'
      ? { LEFT: null, MIDDLE: 1, RIGHT: 0 }
      : { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
    studio.controls.touches = mode === 'paint' ? { ONE: null, TWO: 3 } : { ONE: 0, TWO: 2 };
  };
  setControls();

  const canvas = app.glCanvas;
  let painting = false, lastPt = null;
  const uvToPx = (uv) => [uv.x * TEX_W, uv.y * TEX_H];
  const down = (e) => {
    if (mode !== 'paint' || e.button !== 0) return;
    const hit = studio.pick(e.clientX, e.clientY);
    if (!hit || !hit.uv) return;
    const [x, y] = uvToPx(hit.uv);
    if (b.tool === 'picker') { setColor(p.pick(x, y)); app.rerender(); return; }
    p.snapshot();
    app.updateHistoryButtons();
    if (b.tool === 'text') { p.stampText(x, y); p.changed(); return; }
    painting = true;
    lastPt = [x, y];
    p.dab(x, y);
    p.changed();
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    updateCursor(e);
    if (!painting) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) {
      const hit = studio.pick(ev.clientX, ev.clientY);
      if (!hit || !hit.uv) { lastPt = null; continue; }
      const [x, y] = uvToPx(hit.uv);
      p.strokeTo(x, y, lastPt);
      lastPt = [x, y];
    }
    p.changed();
  };
  const up = () => { painting = false; lastPt = null; };
  const updateCursor = (e) => {
    if (mode !== 'paint' || b.tool === 'picker' || b.tool === 'text') { cursor.style.display = 'none'; return; }
    const r = canvas.getBoundingClientRect();
    const hit = studio.pick(e.clientX, e.clientY);
    if (!hit) { cursor.style.display = 'none'; return; }
    const d2 = b.size * studio.pxPerMm();
    cursor.style.display = 'block';
    cursor.style.width = cursor.style.height = `${Math.max(4, d2)}px`;
    cursor.style.transform = `translate(${e.clientX - r.left - d2 / 2}px, ${e.clientY - r.top - d2 / 2}px)`;
    cursor.style.borderColor = b.tool === 'eraser' ? '#fff' : b.color;
  };
  const leave = () => { cursor.style.display = 'none'; };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  canvas.addEventListener('pointerleave', leave);
  cleanup.push(() => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointerleave', leave);
    studio.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
    studio.controls.touches = { ONE: 0, TWO: 2 };
  });
  void toast;
  return { left: leftEl, right: rightEl, overlay };
}

export function onKey(app, e) {
  const b = app.painter.brush;
  if (e.key === '[') { b.size = Math.max(0.5, b.size - 0.5); app.rerender(); }
  if (e.key === ']') { b.size = Math.min(30, b.size + 0.5); app.rerender(); }
}

export function onDesign(app, source) {
  if (source === 'finish') {
    const body = app.studio.lure?.userData.body;
    const d = state.design;
    if (body) {
      body.material.roughness = d.finish.roughness;
      body.material.metalness = d.finish.metalness;
      body.material.clearcoat = d.finish.clearcoat;
    }
  }
}

export function destroy() {
  cleanup.forEach((f) => f());
  cleanup = [];
}
