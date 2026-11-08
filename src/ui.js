// Petits composants d'interface sans dépendance.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const ICONS = {
  design: '<path d="M3 17c4-8 10-11 18-10M5 19l3-3M14 5l5 5"/>',
  paint: '<path d="M4 20c2 0 4-1 4-4 0-1.7 1.3-3 3-3s3 1.3 3 3"/><path d="M11 13l8-8a2 2 0 0 1 3 3l-8 8"/>',
  swim: '<path d="M2 12c3-4 8-6 13-3l5-3v12l-5-3c-5 3-10 1-13-3z"/><circle cx="14" cy="11" r="1"/>',
  cfd: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
  print: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h8M8 21v-7h8v7"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  pause: '<path d="M7 4h4v16H7zM14 4h4v16h-4z"/>',
  restart: '<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v5h5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.5"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  camera: '<path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  brush: '<path d="M14 4l6 6-8 8H6v-6z"/>',
  air: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" stroke-dasharray="2 3"/>',
  eraser: '<path d="M4 16l9-9 7 7-6 6H8z"/><path d="M13 20h7"/>',
  picker: '<path d="M14 4l6 6-2 2-6-6zM12 6l-8 8v4h4l8-8"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  lang: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  holo: '<path d="M12 3l2.2 5.3L19.5 10l-5.3 2.2L12 17.5l-2.2-5.3L4.5 10l5.3-1.7z"/><path d="M18 15l.8 1.8 1.7.7-1.7.8L18 20l-.8-1.7-1.7-.8 1.7-.7z"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
};

export function icon(name, size = 18) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
}

export function section(title, children, { open = true, extra = null } = {}) {
  const body = h('div', { class: 'sec-body' }, children);
  const head = h('button', { class: 'sec-head', type: 'button', 'aria-expanded': String(open) },
    h('span', {}, title), extra, h('span', { class: 'chev' }, '▾'));
  const el = h('section', { class: 'sec' + (open ? '' : ' closed') }, head, body);
  head.addEventListener('click', (e) => {
    if (e.target.closest('.sec-extra')) return;
    el.classList.toggle('closed');
    head.setAttribute('aria-expanded', String(!el.classList.contains('closed')));
  });
  return el;
}

export function slider({ label, min, max, step = 1, value, fmt = (v) => v, onInput, onChange, hint }) {
  const val = h('input', { class: 'num', type: 'number', min, max, step, value: round(value, step) });
  const range = h('input', { type: 'range', min, max, step, value });
  const out = h('span', { class: 'fmt' }, fmt(value));
  const set = (v, fire = true) => {
    v = Math.min(max, Math.max(min, Number(v)));
    if (!Number.isFinite(v)) return;
    range.value = v;
    val.value = round(v, step);
    out.textContent = fmt(v);
    setFill();
    if (fire && onInput) onInput(v);
  };
  const setFill = () => range.style.setProperty('--p', `${((range.value - min) / (max - min)) * 100}%`);
  range.addEventListener('input', () => set(range.value));
  range.addEventListener('change', () => onChange && onChange(Number(range.value)));
  val.addEventListener('change', () => { set(val.value); onChange && onChange(Number(val.value)); });
  setFill();
  const el = h('div', { class: 'field slider' },
    h('div', { class: 'row' }, h('label', {}, label), h('div', { class: 'vals' }, out, val)),
    range, hint ? h('div', { class: 'hint' }, hint) : null);
  el.set = (v) => set(v, false);
  return el;
}

function round(v, step) {
  const d = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  return Number(v).toFixed(d);
}

export function select({ label, options, value, onChange }) {
  const s = h('select', {}, options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
  s.addEventListener('change', () => onChange(s.value));
  return h('div', { class: 'field' }, label ? h('label', {}, label) : null, s);
}

export function toggle({ label, value, onChange, hint }) {
  const input = h('input', { type: 'checkbox', checked: !!value });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'field toggle' }, h('span', {}, label, hint ? h('small', {}, hint) : null), input, h('span', { class: 'switch' }));
}

export function segmented({ options, value, onChange, small = false }) {
  const el = h('div', { class: 'seg' + (small ? ' small' : ''), role: 'radiogroup' });
  for (const o of options) {
    const b = h('button', { type: 'button', class: String(o.value) === String(value) ? 'on' : '', role: 'radio', 'aria-checked': String(String(o.value) === String(value)), title: o.title || null },
      o.icon ? icon(o.icon, 16) : null, o.label ? h('span', {}, o.label) : null);
    b.addEventListener('click', () => {
      el.querySelectorAll('button').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('on');
      b.setAttribute('aria-checked', 'true');
      onChange(o.value);
    });
    el.append(b);
  }
  return el;
}

export function button(label, onClick, { cls = '', ic = null, title = null } = {}) {
  const b = h('button', { type: 'button', class: 'btn ' + cls, title }, ic ? icon(ic, 16) : null, label ? h('span', {}, label) : null);
  b.addEventListener('click', onClick);
  return b;
}

export function colorInput({ value, onChange, label }) {
  const i = h('input', { type: 'color', value });
  i.addEventListener('input', () => onChange(i.value));
  return h('label', { class: 'color-in' }, i, label ? h('span', {}, label) : null);
}

let toastTimer = null;
export function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(el); }
  el.textContent = msg;
  el.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 2600);
}

export function modal(title, content, { wide = false, onClose } = {}) {
  const close = () => { back.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', type: 'button', onclick: close, 'aria-label': 'Fermer' }, '✕')),
    h('div', { class: 'modal-body' }, content));
  const back = h('div', { class: 'modal-back' }, box);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', esc);
  document.body.append(back);
  return { close, box };
}

export function stat(label, value, cls = '') {
  return h('div', { class: 'stat ' + cls }, h('span', { class: 'k' }, label), h('span', { class: 'v' }, value));
}
