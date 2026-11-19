// The room's sound — the audio window (/audio). The desktop app keeps this page open, hidden, while room audio is on.
//
//   one SYNTHESIS context (48 kHz, no device of its own) runs the graph of audio-graph.js: the sound piece, the routing to the
//   logical channels, the crossover, master / mute, the limiter. Its last node writes the channels into ring buffers
//   (SharedArrayBuffer) — one per output device — and each device has a SINK context (setSinkId) whose worklet plays its
//   channels. That is how 8 channels reach a Dante Virtual Soundcard that Windows shows as stereo pairs. Without devices in the
//   profile everything is folded into left / right on the computer's default device.
// Contract: experiences/SOUND-API.md, ARCHITECTURE.md › Room audio. The engine tells this page what to do through its state
// (profile.audio, state.audio.test, state.audio.sound) and this page tells the engine what it found through `audio.report`.

import { store, on, connect, cmd } from './conn.js';
import { layoutDevices, createRing, linToDb, SAMPLE_RATE, RING_TARGET } from './audio-core.js';
import { buildRoomAudio } from './audio-graph.js';

const FADE_MS = 1000;          // start / stop fades of the sound piece
const REPORT_MS = 500;
const PEAK_HOLD_MS = 3000;
const WORKLETS = '/js/audio-worklets.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const msg = (e) => String(e?.message || e || 'error').slice(0, 300);
const statusEl = document.getElementById('status');
const say = (t) => { if (statusEl) statusEl.textContent = t; };

let devices = [];              // every output device: { deviceId, label, channels, default }
const chCache = new Map();     // deviceId|label → maxChannelCount
let labelsTried = false, devicesRead = false;
let room = null;               // the running graph: { key, synth, built, writer, sinks, layout, epoch }
let piece = null;              // the sound piece: { id, inst, vt, off }
let failedPiece = null;        // a piece that would not start: not retried until it is stopped and played again
let error = null, soundError = null;
const peaks = [];              // { t, lin } from the limiter
let epoch = 0;
let lastTest = 0;

const A = () => store.state.profile.audio;

// ---------------------------------------------------------------------------------------------- devices

/** The number of channels a device offers: a context opened on it, briefly (the readout of the Audio card). */
async function probe(deviceId) {
  let ctx = null;
  try {
    ctx = new AudioContext(deviceId && deviceId !== 'default' ? { sinkId: deviceId } : {});
    if (deviceId && deviceId !== 'default' && typeof ctx.setSinkId === 'function') await ctx.setSinkId(deviceId);
    return ctx.destination.maxChannelCount;
  } finally { ctx?.close().catch(() => {}); }
}

/** Labels of audio devices stay empty until the page has had the microphone permission once (the app grants it to this window only). */
async function unlockLabels(list) {
  if (labelsTried || list.every((d) => d.label)) return false;
  labelsTried = true;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const t of s.getTracks()) t.stop();
    return true;
  } catch { return false; } // no microphone or no permission: the devices are listed without names
}

async function refreshDevices() {
  let list = [];
  try {
    list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'communications');
    if (await unlockLabels(list)) list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'communications');
  } catch (e) { error = `Cannot list the audio devices: ${msg(e)}`; }
  const out = [];
  for (const d of list) {
    const key = `${d.deviceId}|${d.label}`;
    if (!chCache.has(key)) chCache.set(key, await probe(d.deviceId).catch(() => 0));
    out.push({ deviceId: d.deviceId, label: d.label || `Output ${out.length + 1}`, channels: chCache.get(key) || 2, default: d.deviceId === 'default' });
  }
  devices = out;
}

// ---------------------------------------------------------------------------------------------- the graph

const structKey = (P, layout) => JSON.stringify([
  layout.fold, layout.sinks.map((s) => [s.deviceId, s.first, s.count, s.missing]), P.audio.channels, P.audio.map, P.audio.sub.channel,
  P.audio.wallHighpassHz > 0, P.walls.map((w) => w.id),
]);

async function newContext(opt, sinkId) {
  try { return new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive', ...opt }); } catch (e) {
    if (!opt.sinkId) throw e;
    const { sinkId: _drop, ...rest } = opt; // a browser that takes no sinkId in the constructor: set it afterwards
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive', ...rest });
    if (sinkId !== undefined && typeof ctx.setSinkId === 'function') await ctx.setSinkId(sinkId);
    return ctx;
  }
}

async function openSink(s) {
  const out = { ...s, ctx: null, ring: null, node: null, state: 'off', underruns: 0, error: null };
  if (s.missing) { out.state = 'missing'; return out; }
  try {
    out.ring = createRing(s.count);
    out.ctx = await newContext(s.deviceId ? { sinkId: s.deviceId } : {}, s.deviceId || undefined);
    if (s.deviceId && typeof out.ctx.setSinkId === 'function') await out.ctx.setSinkId(s.deviceId);
    await out.ctx.audioWorklet.addModule(WORKLETS);
    const d = out.ctx.destination;
    d.channelCount = Math.max(1, Math.min(s.count, d.maxChannelCount || s.count)); d.channelInterpretation = 'discrete';
    out.node = new AudioWorkletNode(out.ctx, 'vt-ring-reader', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [s.count], channelInterpretation: 'discrete',
      processorOptions: { sab: out.ring.sab, target: RING_TARGET },
    });
    out.node.port.onmessage = (e) => { out.state = e.data?.state || out.state; out.underruns = e.data?.underruns ?? out.underruns; };
    out.node.connect(d);
    await out.ctx.resume();
    out.state = 'prime';
  } catch (e) { out.error = msg(e); out.state = 'error'; }
  return out;
}

async function teardown() {
  if (piece) await stopPiece(true);
  const r = room;
  room = null;
  if (!r) return;
  try { r.built.dispose(); r.writer.disconnect(); } catch { /* gone */ }
  for (const c of [r.synth, ...r.sinks.map((s) => s.ctx)]) c?.close().catch(() => {});
}

async function build(layout, key) {
  await teardown();
  epoch++;
  const P = store.state.profile, cfg = { ...A(), walls: P.walls.map((w) => ({ id: w.id, name: w.name })), fold: layout.fold };
  const synth = await newContext({ sinkId: { type: 'none' } }); // (a browser without 'none' plays it on the default device, silent: the writer outputs zeros)
  const built = await buildRoomAudio(synth, cfg, { workletUrl: WORKLETS, fadeStart: 0 });
  const sinks = [];
  for (const s of layout.sinks) sinks.push(await openSink(s));
  const rings = sinks.filter((s) => s.ring && !s.error).map((s) => ({ sab: s.ring.sab, first: s.first, count: s.count }));
  const writer = new AudioWorkletNode(synth, 'vt-ring-writer', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: built.outputChannels, channelCountMode: 'explicit', channelInterpretation: 'discrete',
    processorOptions: { rings },
  });
  built.output.connect(writer); writer.connect(synth.destination);
  built.onMeter((m) => { peaks.push({ t: performance.now(), lin: m.peak }); });
  await synth.resume();
  room = { key, synth, built, writer, sinks, layout, epoch };
  const bad = sinks.filter((s) => s.error);
  error = bad.length ? `${bad[0].label}: ${bad[0].error}` : null;
}

// ---------------------------------------------------------------------------------------------- the sound piece

async function startPiece(id) {
  const entry = (store.state.sounds || []).find((e) => e.id === id);
  if (!entry) { soundError = `"${id}" is not a sound piece of this app`; failedPiece = id; return; }
  let vt = null;
  try {
    const mod = await import(`/experiences/${id}/${entry.entry}`);
    if (typeof mod.default !== 'function') throw new Error(`${entry.entry} has no default export (async function start(host))`);
    const { connectExperience } = await import('/experiences/runtime.js');
    vt = await connectExperience({ sound: true, id });
    room.built.fade(0, 0);
    const inst = await mod.default({ audio: room.built.audio, vt, params: { ...vt.params } });
    piece = { id, inst, vt, off: vt.on('params', (p) => { try { inst?.setParams?.({ ...p }); } catch (e) { soundError = msg(e); } }) };
    room.built.fade(1, FADE_MS);
    soundError = null; failedPiece = null;
  } catch (e) {
    soundError = msg(e); failedPiece = id;
    vt?.dispose?.();
    room?.built.fade(0, 0);
  }
}

/** Fade out (the host fades the pieces' level; the piece releases its voices), then let go. `fast`: no fade (rebuilding). */
async function stopPiece(fast = false) {
  const p = piece;
  if (!p) return;
  piece = null;
  p.off?.();
  const ms = fast ? 0 : FADE_MS;
  try {
    room?.built.fade(0, ms);
    await Promise.race([Promise.all([p.inst?.stop?.(ms), sleep(ms)]), sleep(ms + 2000)]);
  } catch (e) { soundError = msg(e); }
  p.vt?.dispose?.();
}

// ---------------------------------------------------------------------------------------------- keeping it in step with the engine

let running = false, again = false;
async function sync() {
  if (running) { again = true; return; }
  running = true;
  try {
    do {
      again = false;
      const S = store.state, P = S.profile;
      if (!P.audio.on) { await teardown(); say('Room audio is off'); continue; }
      if (!devicesRead) { devicesRead = true; await refreshDevices(); } // (only once audio is wanted: listing devices opens a context on each)
      const layout = layoutDevices(P.audio.devices, devices), key = structKey(P, layout);
      if (!room || room.key !== key) { try { await build(layout, key); } catch (e) { error = `Audio could not start: ${msg(e)}`; await teardown(); } }
      if (room) {
        room.built.set({ master: P.audio.master, mute: P.audio.mute, ceilingDb: P.audio.ceilingDb, wallHighpassHz: P.audio.wallHighpassHz, crossoverHz: P.audio.sub.crossoverHz });
        const want = S.audio.sound.running ? S.audio.sound.id : null;
        if (!want) failedPiece = null;
        if (piece && piece.id !== want) await stopPiece();
        if (want && !piece && failedPiece !== want) await startPiece(want);
        say(`Room audio — ${room.layout.fold ? 'stereo (default device)' : `${room.layout.total} channels on ${room.sinks.length} device${room.sinks.length === 1 ? '' : 's'}`}${piece ? ` · ${piece.id}` : ''}`);
      }
    } while (again);
  } catch (e) { error = msg(e); } finally { running = false; }
}

/** A test tone asked for by the engine (not queued behind a fade: it must answer at once). */
function checkTest() {
  const t = store.state?.audio?.test;
  if (!t || t.seq === lastTest) return;
  lastTest = t.seq;
  if (Date.now() - t.at > 3000) return; // an old request seen on connecting
  room?.built.tone(t.channel);
}

function report() {
  const S = store.state;
  if (!S) return;
  const now = performance.now();
  while (peaks.length && now - peaks[0].t > PEAK_HOLD_MS) peaks.shift();
  const peak = peaks.reduce((m, p) => Math.max(m, p.lin), 0);
  const iso = !crossOriginIsolated ? 'This page is not cross-origin isolated, so the audio contexts cannot share memory (the server must send COOP and COEP).' : null;
  cmd('audio.report', {
    devices: devices.map((d) => ({ label: d.label, channels: d.channels, default: d.default })),
    sinks: (room?.sinks || []).map((s) => ({ label: s.label, first: s.first, count: s.count, missing: s.missing, error: s.error, state: s.state })),
    logical: A().channels, available: room?.layout.total ?? 0, fold: room ? room.layout.fold : A().devices.length === 0,
    peakDb: peak > 0 ? linToDb(peak) : -120, rate: room?.synth.sampleRate ?? 0, isolated: !!crossOriginIsolated,
    error: error || iso,
    sound: { active: !!piece, id: piece?.id ?? S.audio?.sound?.id ?? null, error: soundError },
  }).catch(() => {});
}

// A browser tab (not the desktop app) may keep its contexts suspended until the page is touched
const wake = () => { for (const c of [room?.synth, ...(room?.sinks || []).map((s) => s.ctx)]) if (c && c.state === 'suspended') c.resume().catch(() => {}); };
addEventListener('pointerdown', wake); addEventListener('keydown', wake);

async function main() {
  connect();
  if (!store.state) await new Promise((res) => { const off = on('state', () => { off(); res(); }); });
  navigator.mediaDevices?.addEventListener?.('devicechange', async () => { if (!devicesRead) return; chCache.clear(); await refreshDevices(); sync(); });
  on('state', () => { checkTest(); sync(); });
  await sync();
  setInterval(report, REPORT_MS);
  report();
  window.__vtAudio = { get room() { return room; }, get piece() { return piece; }, get devices() { return devices; } }; // (tests, debugging)
  window.__vtStarted?.();
}
main().catch((e) => { error = msg(e); say(`Room audio failed: ${error}`); });
