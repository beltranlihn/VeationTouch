// Tiny DOM helpers — no framework. Inputs commit on `change` (blur / Enter), never per keystroke.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const sec = (title, ...children) => h('section', { class: 'sec' }, title ? h('h2', {}, ...[].concat(title)) : null, ...children);

/** Labelled numeric/text field. `onCommit(value)` fires on change with a parsed value. */
export function field(label, value, onCommit, opt = {}) {
  const type = opt.type || (typeof value === 'number' ? 'number' : 'text');
  const input = h('input', {
    type, value: value ?? '', step: opt.step ?? (type === 'number' ? 'any' : undefined),
    min: opt.min, max: opt.max, placeholder: opt.placeholder, inputmode: type === 'number' ? 'decimal' : undefined,
    readonly: opt.readonly, spellcheck: 'false',
  });
  input.addEventListener('change', () => {
    let v = input.value;
    if (type === 'number') { v = Number(v); if (!Number.isFinite(v)) { input.value = value; return; } }
    onCommit(v);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  if (opt.inline) return h('label', { class: 'field' }, h('span', {}, label), input);
  return h('div', { class: 'row' }, h('label', {}, label), input, opt.unit ? h('span', { class: 'unit' }, opt.unit) : null);
}

export function selectField(label, value, options, onCommit, opt = {}) {
  const sel = h('select', {}, options.map(([v, t]) => h('option', { value: v, selected: String(v) === String(value) }, t)));
  sel.addEventListener('change', () => onCommit(opt.numeric ? Number(sel.value) : sel.value));
  if (opt.inline) return h('label', { class: 'field' }, h('span', {}, label), sel);
  return h('div', { class: 'row' }, h('label', {}, label), sel);
}

export function toggle(label, on, onChange, note) {
  const sw = h('button', { class: `switch${on ? ' on' : ''}`, role: 'switch', 'aria-checked': on ? 'true' : 'false', title: label });
  sw.addEventListener('click', () => onChange(!on));
  return h('div', { class: 'row' }, h('label', {}, label), h('div', { style: { flex: 1 } }, note ? h('span', { class: 'muted' }, note) : null), sw);
}

/**
 * VEATION fader (as in Immersive Studio Pro's inspector): a 3 px recessed groove with its fill — no knob, no dot — and
 * the value in a dark box. Press anywhere on the groove and drag (or arrow keys, Shift ×10); tap the box to type the
 * value. `onInput(v)` runs while dragging (live previews, nothing saved); `onCommit(v)` once per gesture, on release
 * (one edit, one undo step). `k` scales the stored value for display (metres shown as cm: k = 100).
 */
export function fader(label, value, { min, max, step = 1, k = 1, unit = '', decimals = 0 }, onInput, onCommit) {
  let v = value;
  const fill = h('i');
  const track = h('div', { class: 'vtrack' }, fill);
  const field = h('div', { class: 'vfield', tabindex: '0', role: 'slider', 'aria-label': label, 'aria-valuemin': String(min), 'aria-valuemax': String(max) }, track);
  const num = h('span', { class: 'num' });
  const box = h('span', { class: 'vbox tnum', role: 'button', tabindex: '0', title: 'Type a value' }, num, unit ? h('span', { class: 'u' }, unit) : null);
  const quant = (x) => Math.min(max, Math.max(min, +(Math.round((x - min) / step) * step + min).toFixed(6)));
  const shown = (x) => (+(x * k).toFixed(decimals)).toString();
  const paint = () => {
    fill.style.width = `${Math.max(0, Math.min(100, ((v - min) / (max - min || 1)) * 100))}%`;
    num.textContent = shown(v);
    field.setAttribute('aria-valuenow', String(v));
    field.setAttribute('aria-valuetext', `${shown(v)}${unit ? ` ${unit}` : ''}`);
  };
  const to = (x) => { const nv = quant(x); if (nv === v) return false; v = nv; paint(); onInput?.(v); return true; };
  const at = (cx) => { const r = track.getBoundingClientRect(); return min + (max - min) * Math.max(0, Math.min(1, (cx - r.left) / (r.width || 1))); };
  field.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = v;
    try { field.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    field.classList.add('drag');
    const move = (ev) => to(at(ev.clientX));
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      field.classList.remove('drag');
      if (v !== start) onCommit(v);
      field.dispatchEvent(new Event('faderend', { bubbles: true })); // the panel may re-render now
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    move(e);
  });
  field.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!d) return;
    e.preventDefault(); e.stopPropagation(); // the arrows nudge this value, not the selection on the canvas
    if (to(v + d * step * (e.shiftKey ? 10 : 1))) onCommit(v);
  });
  const edit = () => {
    if (box.querySelector('input')) return;
    const inp = h('input', { type: 'text', class: 'numedit', value: shown(v), inputmode: 'decimal', spellcheck: 'false', 'aria-label': label });
    let done = false;
    const end = (ok) => {
      if (done) return;
      done = true;
      const x = parseFloat(inp.value.replace(',', '.'));
      inp.remove(); num.hidden = false;
      if (ok && Number.isFinite(x) && to(x / k)) onCommit(v);
    };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') end(true); else if (e.key === 'Escape') end(false); });
    inp.addEventListener('blur', () => end(true));
    num.hidden = true;
    box.insertBefore(inp, num);
    inp.focus(); inp.select();
  };
  box.addEventListener('click', edit);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); edit(); } });
  paint();
  return h('div', { class: 'row fader' }, h('label', {}, label), field, box);
}

/** A number with − / + nudge buttons (touch friendly). */
export function nudgeField(label, value, step, onCommit, opt = {}) {
  const f = field(label, round(value, opt.decimals ?? 3), onCommit, { unit: opt.unit });
  const nudge = h('div', { class: 'nudge' },
    h('button', { title: `−${step}`, onclick: () => onCommit(round(value - step, 4)) }, '−'),
    h('button', { title: `+${step}`, onclick: () => onCommit(round(value + step, 4)) }, '+'));
  f.insertBefore(nudge, f.querySelector('.unit'));
  return f;
}

export const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

export function badge(text, kind = '') { return h('span', { class: `badge ${kind}` }, text); }
export function dot(kind) { return h('span', { class: `dot ${kind || ''}` }); }

export function toast(msg, kind = '') {
  const el = h('div', { class: `toast ${kind}` }, msg);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 6000 : 3000);
}

export function modal(title, content, { onClose } = {}) {
  const ov = document.getElementById('overlay');
  const close = () => { ov.hidden = true; ov.replaceChildren(); onClose?.(); };
  const m = h('div', { class: 'modal', role: 'dialog' },
    h('header', {}, title, h('div', { class: 'grow' }), h('button', { class: 'ibtn', onclick: close }, 'Close')),
    h('div', { class: 'content' }, content));
  ov.replaceChildren(m);
  ov.hidden = false;
  ov.onclick = (e) => { if (e.target === ov) close(); };
  return close;
}

export function confirmBox(text, okLabel = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const close = modal('Confirm', h('div', {},
      h('p', { style: { margin: '0 0 16px', lineHeight: 1.5 } }, text),
      h('div', { class: 'actions' },
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => { done = true; close(); resolve(true); } }, okLabel),
        h('button', { class: 'btn', onclick: () => { close(); } }, 'Cancel'))), { onClose: () => { if (!done) resolve(false); } });
  });
}

/** Text input dialog (Electron has no window.prompt). Resolves with the text or null. */
export function promptBox(title, value = '', okLabel = 'OK') {
  return new Promise((resolve) => {
    let done = false;
    const input = h('input', { type: 'text', value, style: { width: '100%' }, spellcheck: 'false' });
    const ok = () => { const v = input.value.trim(); if (!v) return; done = true; close(); resolve(v); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); else if (e.key === 'Escape') close(); });
    const close = modal(title, h('div', {}, input, h('div', { class: 'actions', style: { marginTop: '12px' } },
      h('button', { class: 'btn primary', onclick: ok }, okLabel),
      h('button', { class: 'btn', onclick: () => close() }, 'Cancel'))), { onClose: () => { if (!done) resolve(null); } });
    setTimeout(() => { input.focus(); input.select(); }, 30);
  });
}

/** Switch this device between the full app and the calibration remote (remembered; see main.js). */
export function switchUi(to) {
  try { localStorage.setItem('vt-ui', to); } catch { /* storage blocked */ }
  location.href = `${location.pathname}?ui=${to}`;
}

export function stateKind(state) {
  return state === 'scanning' ? 'ok' : state === 'offline' || state === 'error' ? 'bad' : state === 'stopped' || !state ? '' : 'warn';
}
