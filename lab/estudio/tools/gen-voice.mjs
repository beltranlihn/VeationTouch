// gen-voice.mjs — the Ressonància voice lines that are missing (05-plan §3, "N"), made once with ElevenLabs and kept offline.
//
//   node lab/estudio/tools/gen-voice.mjs [--only a,b,c] [--force] [--dry] [--key <file>]
//
// Same voice, model, settings and format as Vicente's Spanish lines (audio/es/voice-lines-es.json): Mía Evans
// (Qvbf0AoA7UZSgJUp8Ba5), eleven_v4, stability 0.5, similarity_boost 0.8, mp3_44100_128, language_code es, expressive tags in
// brackets. Every file is checked with speech-to-text (scribe_v1): the words must be the script's and no tag may be spoken.
// Writes audio/es/<name>.mp3 and merges lines / tts_text / seconds / stt / request_ids into voice-lines-es.json.
//
// THE KEY: read from a file at run time (default C:\Users\beltr\Desktop\ApiEleven.txt, or ELEVEN_KEY_FILE). It is never
// printed, logged or written anywhere: errors print the HTTP status and the API's message only.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ES = path.resolve(HERE, '../../experiments/ressonancia-sound/audio/es');
const JSON_PATH = path.join(ES, 'voice-lines-es.json');
const API = 'https://api.elevenlabs.io';
const VOICE = 'Qvbf0AoA7UZSgJUp8Ba5', MODEL = 'eleven_v4', FORMAT = 'mp3_44100_128';
const SETTINGS = { stability: 0.5, similarity_boost: 0.8 };
const CONCURRENCY = 3;

// name: [script line (what is said, with its tag), tts text if the spelling must be helped (Catalan words), energy note]
// Catalan words keep their spelling in the script; the TTS text may spell them for a Spanish reader (as Vicente did with
// «Descarregát»): enxaneta → «enshaneta» is not Spanish either, so it is first tried as written and checked by ear later.
export const LINES = {
  // I · Brasa
  'v-brasa-fire': ['[softly, pleased] El fuego prende.'],
  'v-brasa-pass': ['[warm, urging] Pasad el fuego. De mano en mano.'],
  'v-colla-1': ['[warmly] La colla os ayuda.'],
  'v-brasa-lap': ['[warm, rising] El fuego ha dado la vuelta.'],
  'v-hold': ['[softly] Dejad la mano sobre la luz.'],
  'v-brasa-hold': ['[softly, encouraging] Posad la mano en la luz. Todos.'],
  'v-brasa-wave': ['[warm, rising] Eso es. La plaza despierta.'],
  'v-brasa-awake': ['[warmly] La plaza está despierta.'],
  // II · Pinya
  'v-pinya-task': ['[warm, steady] Ahora, la fuerza. Palma con palma.'],
  'v-pinya-wall': ['[warm, firm] Este lado aguanta.'],
  'v-pinya-other': ['[warm, urging] Ahora allí. Llevad la fuerza al otro muro.'],
  'v-colla-2': ['[warmly] No estáis solos. La colla empuja.'],
  'v-struct-1': ['[warm, proud] Es un pilar.'],
  'v-struct-2': ['[warm, proud] Es una torre.'],
  'v-struct-3': ['[warm, proud] Es un tres.'],
  'v-struct-4': ['[warm, proud] Es un quatre.', '[warm, proud] Es un cuatre.'],
  // III · Tronc (each floor a little more lifted)
  'v-floor-2': ['[steady] Segundo piso.'],
  'v-floor-3': ['[steady] Tercer piso.'],
  'v-floor-4': ['[steady, warm] Cuarto piso.'],
  'v-floor-5': ['[warm, proud] Quinto piso. Ya es un castell.'],
  'v-floor-6': ['[warm, proud] Sexto.'],
  'v-floor-7': ['[excited, warm] Séptimo piso.'],
  'v-floor-8': ['[excited] Octavo.'],
  'v-floor-9': ['[awed, excited] Noveno. No cabe más cielo.'],
  'v-tronc-level': ['[softly, pleased] Recta. Así.'],
  'v-tronc-steady': ['[relieved, warm] La pinya aguanta.'],
  'v-tronc-slip': ['[concerned, then encouraging] Ha cedido un piso. Arriba otra vez.'],
  'v-tronc-done': ['[warm, proud] La torre está en pie.'],   // «El tronc está en pie» came out as «tronco» three times (scribe_v1, with and without a language hint)
  // IV · Pom de dalt (whispered)
  'v-pom-handoff': ['[whispers] Pasa de mano en mano.'],
  'v-pom-arrived-0': ['[whispers, warm] Los dosos están arriba.'],
  'v-pom-breath': ['[whispers] Sube el acotxador. Contened el aliento.', '[whispers] Sube el acochador. Contened el aliento.'],
  'v-pom-hush': ['[whispers, very quietly] Shhh. Quietos.'],
  'v-pom-arrived-1': ['[whispers] Ya está. Falta la más pequeña.'],
  'v-pom-silence': ['[whispers] La enxaneta. Ni un gesto.'],
  // Coronation · V
  'v-crown-shout': ['[excited, shouting] ¡Coronado!'],
  'v-festa-echo': ['[joyful] Lanzad una onda al muro de enfrente.'],
  'v-festa-return': ['[joyful, inviting] Devolvedla.'],
  'v-festa-call': ['[joyful] Y ahora, todos a la vez.'],
  'v-festa-bloom': ['[awed, full voice] Esto es la ressonància.'],
  // Baixada, fall, acta
  'v-baixada-free': ['[warmly, relieved] Lo habéis bajado. La plaza es vuestra.'],   // 25-11: the baixada's free coda (8 s)
  'v-baixada-ok': ['[softly, warm] Bien. Otro más.'],
  'v-baixada-warn': ['[urgent, low] No lo soltéis.'],
  'v-fall': ['[softly, consoling] Ha caído. La pinya lo ha recogido.'],
  'v-acta-print': ['[warmly] Dejad vuestra mano en el muro.'],
  'v-warn-return': ['[softly, calling] Volved al muro. La pinya os necesita.'],   // «(El|Vuestro) castell os necesita» came out as «castillo» four times (scribe_v1, with and without a language hint)
};

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const only = opt('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
const force = args.includes('--force'), dry = args.includes('--dry');
const keyFile = opt('--key') || process.env.ELEVEN_KEY_FILE || 'C:\\Users\\beltr\\Desktop\\ApiEleven.txt';

const plain = (s) => s.replace(/\[[^\]]*\]\s*/g, '').trim();
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zñ0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const exists = async (p) => { try { return (await stat(p)).size > 0; } catch { return false; } };

async function readKey() {
  const raw = await readFile(keyFile, 'utf8');
  const m = raw.match(/sk_[A-Za-z0-9]+/) || raw.match(/[A-Za-z0-9_-]{24,}/);
  if (!m) throw new Error('no key found in the key file');
  return m[0];
}

async function post(KEY, url, init, tries = 5) {
  for (let i = 0; i < tries; i++) {
    let r;
    try { r = await fetch(url, { method: 'POST', ...init, headers: { 'xi-api-key': KEY, ...(init.headers || {}) } }); } catch (e) {
      await new Promise((s) => setTimeout(s, 1500 * 2 ** i)); if (i === tries - 1) throw new Error(`network: ${e.message}`); continue;
    }
    if (r.ok) return r;
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 2000 * 2 ** i)); continue; }
    throw new Error(`${new URL(url).pathname} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  throw new Error(`${new URL(url).pathname}: no success after ${tries} tries`);
}

async function tts(KEY, text) {
  const r = await post(KEY, `${API}/v1/text-to-speech/${VOICE}?output_format=${FORMAT}`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL, language_code: 'es', voice_settings: SETTINGS }),
  });
  return { buf: Buffer.from(await r.arrayBuffer()), id: r.headers.get('request-id') || r.headers.get('x-request-id') || null };
}

async function stt(KEY, buf) {
  const fd = new FormData();
  fd.append('model_id', 'scribe_v1');
  fd.append('language_code', 'es');
  fd.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'line.mp3');
  const r = await post(KEY, `${API}/v1/speech-to-text`, { body: fd });
  const j = await r.json();
  return (j.text || '').trim();
}

// mp3 duration: walk the MPEG frames (CBR 128 kbps here, but count frames to be exact)
function mp3Seconds(buf) {
  let i = 0;
  if (buf.slice(0, 3).toString() === 'ID3') i = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  const BR = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], SR = [44100, 48000, 32000];
  let frames = 0, sr = 44100;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const br = BR[(buf[i + 2] >> 4) & 15], s = SR[(buf[i + 2] >> 2) & 3], pad = (buf[i + 2] >> 1) & 1;
    if (!br || !s) { i++; continue; }
    sr = s; frames++; i += Math.floor((144000 * br) / s) + pad;
  }
  return Math.round(((frames * 1152) / sr) * 100) / 100;
}

async function main() {
  const names = Object.keys(LINES).filter((n) => !only || only.includes(n));
  const todo = [];
  for (const n of names) if (force || !(await exists(path.join(ES, `${n}.mp3`)))) todo.push(n);
  console.log(`gen-voice: ${todo.length} line(s) to make of ${names.length}${dry ? ' (dry)' : ''}`);
  if (dry) { for (const n of todo) console.log(`  ${n}: ${LINES[n][1] || LINES[n][0]}`); return; }
  if (!todo.length) return;
  const KEY = await readKey();
  const J = JSON.parse(await readFile(JSON_PATH, 'utf8'));
  for (const k of ['lines', 'seconds', 'stt', 'tts_text', 'request_ids']) J[k] ||= {};
  const report = [];
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const n = todo[next++], [line, ttsText] = LINES[n], text = ttsText || line;
      try {
        const { buf, id } = await tts(KEY, text);
        await writeFile(path.join(ES, `${n}.mp3`), buf);
        const heard = await stt(KEY, buf), sec = mp3Seconds(buf);
        const want = norm(plain(line)), got = norm(heard);
        const tagSpoken = /\b(softly|whispers?|warm(ly)?|excited|shouting|joyful|awed|urgent|proud|steady)\b/i.test(heard);
        const ok = !tagSpoken && (got === want || got.replace(/ /g, '') === want.replace(/ /g, ''));
        J.lines[n] = line; if (ttsText) J.tts_text[n] = ttsText; J.seconds[n] = sec; J.stt[n] = heard; J.request_ids[n] = id;
        report.push({ n, sec, kb: Math.round(buf.length / 1024), ok, tagSpoken, heard });
        console.log(`${ok ? 'OK  ' : 'LOOK'} ${n} ${sec}s ${Math.round(buf.length / 1024)}KB «${heard}»${tagSpoken ? ' TAG SPOKEN' : ''}`);
      } catch (e) { report.push({ n, error: e.message }); console.log(`FAIL ${n}: ${e.message}`); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  J.notes_2026_11_25 = 'Studio night (05-plan §3): new lines with the same voice (Mía Evans), model eleven_v4, settings 0.5/0.8, mp3_44100_128, language_code es; made by lab/estudio/tools/gen-voice.mjs; checked with scribe_v1 (stt). request_ids kept for regeneration.';
  await writeFile(JSON_PATH, JSON.stringify(J, null, 2) + '\n');
  const bad = report.filter((r) => r.error || !r.ok);
  console.log(`gen-voice: done, ${report.length - bad.length} OK, ${bad.length} to look at`);
}

main().catch((e) => { console.error(`gen-voice: ${e.message}`); process.exit(1); });
