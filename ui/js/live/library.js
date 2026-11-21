// Live › the bottom bar and the library's helpers (MEDIA-SERVER.md §4b.3, §4d): the copies in progress ("Copying 2 of 7
// · 12.4 / 31 GB · 4 min left"), the room's video and audio masters and Mute. Clips play from the library, never from the
// USB stick: importing copies (§4d.2); the files of the show are the browser's (browser.js).
// Also here: "Locate…" (§4d.5: a folder is searched by name + size + content and every match is fixed at once) and the
// Problems the show adds to the top bar (missing files, copies that stopped).

import { store, cmd } from '../conn.js';
import { h, fader, toast, modal } from '../dom.js';

const GB = 1024 ** 3, MB = 1024 ** 2;
/** A size as Windows Explorer writes it (binary units, one decimal) — the engine's formatBytes. */
export function bytes(b) {
  b = Math.max(0, b || 0);
  if (b >= GB) return `${(b / GB).toFixed(1)} GB`;
  if (b >= MB) return `${(b / MB).toFixed(1)} MB`;
  return `${Math.ceil(b / 1024)} KB`;
}
/** "4 min left", "35 s left", "1 h 5 min left". */
export function left(s) {
  if (!Number.isFinite(s)) return '';
  s = Math.max(0, Math.round(s));
  if (s < 60) return `${s} s left`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min left` : `${Math.floor(m / 60)} h ${m % 60} min left`;
}
export const duration = (s) => { s = Math.max(0, Math.round(s || 0)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
/** m:ss.t — a position in a clip, to a tenth. */
export const stamp = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };

/**
 * What the copies are doing, in one line: {text, frac, kind: 'copying'|'stopped'|'done'|null, job (the one copying)}.
 * The batch is what is queued or copying plus what finished a moment ago (the engine keeps those 10 s).
 */
export function copySummary(jobs = []) {
  const mine = jobs.filter((j) => j.kind !== 'export'), exp = jobs.filter((j) => j.kind === 'export');
  const line = (list, verb) => {
    const active = list.filter((j) => j.state === 'queued' || j.state === 'copying');
    if (!active.length) return null;
    const batch = list.filter((j) => j.state !== 'cancelled' && j.state !== 'failed' && j.state !== 'interrupted');
    const done = batch.filter((j) => j.state === 'done').length;
    const total = batch.reduce((a, j) => a + (j.total || 0), 0), got = batch.reduce((a, j) => a + (j.state === 'done' ? j.total || 0 : j.done || 0), 0);
    const cur = active.find((j) => j.state === 'copying') || null;
    const rate = cur?.mbps ? cur.mbps * MB : 0;
    const eta = rate ? (total - got) / rate : cur?.etaS ?? null;
    return { kind: 'copying', job: cur, frac: total ? got / total : 0, text: `${verb} ${done + 1} of ${batch.length} · ${bytes(got)} / ${bytes(total)}${eta !== null ? ` · ${left(eta)}` : ''}` };
  };
  const a = line(mine, 'Copying') || line(exp, 'Exporting');
  if (a) return a;
  const stopped = mine.filter((j) => j.state === 'interrupted' || j.state === 'failed');
  if (stopped.length) return { kind: 'stopped', frac: 0, text: stopped.length === 1 ? `Copy of "${stopped[0].name}" ${stopped[0].state === 'failed' ? 'failed' : 'interrupted — plug the drive back in'}` : `${stopped.length} copies stopped — plug the drive back in` };
  const done = mine.filter((j) => j.state === 'done').length;
  if (done) return { kind: 'done', frac: 1, text: `Copied ${done} file${done === 1 ? '' : 's'} into the library` };
  return { kind: null, frac: 0, text: '' };
}

/** The Problems of the show (top bar and Status › Health): missing files with Locate…, copies that stopped. */
export function missingProblems(L) {
  const M = store.state?.media;
  if (!M || !L.show()) return [];
  const items = [], miss = (M.problems || []).filter((p) => p.kind === 'missing-media');
  const btn = () => h('button', { class: 'btn small', onclick: () => locate(L) }, 'Locate…');
  if (miss.length === 1) items.push(['warn', miss[0].text, btn()]);
  else if (miss.length) items.push(['warn', `${miss.length} files of the show are missing from the media library.`, btn(), miss.map((p) => p.text).join('\n')]);
  for (const p of (M.problems || []).filter((x) => x.kind === 'copy')) items.push(['warn', p.text]);
  return items;
}

/**
 * Locate…: a folder (typed, or dropped on the dialog from the explorer) is searched for every missing file of the show
 * by name, size and content; what is found is fixed at once (copied into the library when it is outside it).
 */
export function locate(L) {
  const S = store.state;
  if (!S?.local) { toast('Locate… works on the computer of the room (the desktop app).', 'warn'); return; }
  const n = (S.media?.problems || []).filter((p) => p.kind === 'missing-media').length;
  const input = h('input', { type: 'text', placeholder: 'D:\\Show media', spellcheck: 'false', style: { width: '100%' } });
  const zone = h('div', { class: 'lv-drop' }, window.vtDesktop ? 'or drop the folder here from the explorer' : 'Type the folder of this computer where the files are.');
  zone.addEventListener('dragover', (e) => { if (!window.vtDesktop || !e.dataTransfer?.types.includes('Files')) return; e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation(); zone.classList.remove('dragover');
    const p = window.vtDesktop?.pathsFor(e.dataTransfer.files)?.[0];
    if (p) { input.value = p; go(); }
  });
  const status = h('p', { class: 'muted', style: { minHeight: '1.5em' } });
  const ok = h('button', { class: 'btn primary', onclick: () => go() }, 'Search');
  async function go() {
    const dir = input.value.trim();
    if (!dir) { input.focus(); return; }
    ok.disabled = true; status.textContent = 'Searching…';
    try {
      const r = await cmd('media.relink', { dir });
      const found = r.fixed + r.copying;
      close();
      const parts = [r.fixed ? `${r.fixed} relinked` : null, r.copying ? `${r.copying} being copied into the library` : null].filter(Boolean).join(', ');
      toast(found ? `Found ${found}: ${parts}.${r.notFound.length ? ` Still missing: ${r.notFound.join(', ')}` : ''}` : `Not found in ${dir}: ${r.notFound.join(', ') || 'nothing was missing'}`, found && !r.notFound.length ? 'ok' : 'warn');
      if (r.rejected?.length) toast(r.rejected.map((x) => x.message).join('\n'), 'bad');
    } catch (e) { ok.disabled = false; status.textContent = e.message; }
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  const close = modal('Locate missing files', h('div', { class: 'lv-locate' },
    h('p', { style: { marginTop: 0 } }, `${n || 'The'} missing file${n === 1 ? '' : 's'} of the show: choose the folder where ${n === 1 ? 'it is' : 'they are'} (a USB drive, another disk). Every file found there by name, size and content is fixed at once.`),
    input, zone, status,
    h('div', { class: 'actions' }, ok, h('button', { class: 'btn', onclick: () => close() }, 'Cancel'))));
  setTimeout(() => input.focus(), 30);
}

/**
 * The bottom bar of Live: what is copying into the library (one line, with its bar and Cancel), the room's video master
 * (amber while it is not 100 %), the audio master and Mute. The files themselves are the browser's (browser.js).
 */
export function createLibrary(L) {
  const el = h('div', { class: 'lv-bottom' });
  let key = '';

  const keyNow = () => { const S = store.state, A = S.profile.audio; return JSON.stringify([A.master, A.mute, S.media?.master ?? 1, !!L.show(), L.locked()]); };
  // a fader of the bar being moved (or focused) is never built again under the hand
  const busy = () => !!el.querySelector('.vfield.drag') || (el.contains(document.activeElement) && document.activeElement.classList.contains('vfield'));

  function render(force = false) {
    const S = store.state, A = S.profile.audio, vm = S.media?.master ?? 1;
    const k = keyNow();
    if (!force && (k === key || busy())) return;
    key = k;
    const vfader = fader('Video', vm, { min: 0, max: 1, step: 0.01, k: 100, unit: '%' },
      L.throttle((v) => cmd('media.master', { value: v }).catch(() => {})), (v) => L.run(cmd('media.master', { value: v })));
    el.replaceChildren(
      h('div', { class: 'lv-copyline' }, h('span', { class: 'txt tnum' }), h('span', { class: 'lv-cbar' }, h('i'))),
      h('button', { class: 'btn small lv-cancel', hidden: true, title: 'Stop this copy (it leaves nothing behind)', onclick: cancel }, 'Cancel'),
      h('div', { class: 'grow' }),
      h('div', { class: `lv-master lv-vmaster${vm < 0.999 ? ' off' : ''}`, title: 'The room picture level: every layer, together (the Blackout is the switch)' }, vfader),
      h('div', { class: 'lv-master' }, fader('Audio', A.master, { min: 0, max: 1, step: 0.01, k: 100, unit: '%' },
        L.throttle((v) => cmd('audio.set', { master: v }).catch(() => {})), (v) => L.run(cmd('audio.set', { master: v })))),
      h('button', { class: `btn small lv-mute${A.mute ? ' on' : ''}`, 'aria-pressed': String(!!A.mute), title: A.mute ? 'The room is muted — click to hear it' : 'Mute the room (sound pieces and clips)', onclick: () => L.run(cmd('audio.mute', { mute: !store.state.profile.audio.mute })) }, A.mute ? 'Muted' : 'Mute'));
    patch();
  }

  function cancel() {
    const j = copySummary(L.media().import).job;
    if (j) L.run(cmd('media.importCancel', { id: j.id }));
  }

  function patch() {
    el.querySelector('.lv-vmaster')?.classList.toggle('off', (store.state.media?.master ?? 1) < 0.999); // (in place: a fader in hand stays)
    if (key && keyNow() !== key && !busy()) { render(); return; } // another device moved a master
    const sum = copySummary(L.media().import);
    const line = el.querySelector('.lv-copyline');
    if (!line) return;
    line.querySelector('.txt').textContent = sum.text;
    line.querySelector('.lv-cbar i').style.width = `${(sum.frac * 100).toFixed(1)}%`;
    line.classList.toggle('on', !!sum.kind);
    line.classList.toggle('stopped', sum.kind === 'stopped');
    line.classList.toggle('done', sum.kind === 'done');
    el.querySelector('.lv-cancel').hidden = !(sum.kind === 'copying' && sum.job && !L.locked());
  }

  return { el, render, patch, paint() {} };
}
