// Live › what a file of the show IS, in words and badges (the engine decides the kind: media.kind = hap | video | image |
// audio; the page only names it). One place, so the cell, the browser tile, the inspector and the hover card agree.
//   kind      still · audio · video — and the codec beside it: HAP, HAP Q, H.264, PNG, WAV…
//   notes     what the import said about the file ("wide H.264: plays at ≤30 fps"): m.notes, a string each, or
//             { message, convert: true } when the engine says a conversion to HAP would fix it
// The engine's own words stay the engine's: nothing here judges a file by its extension.

const HAP_NAME = { Hap1: 'HAP', Hap5: 'HAP Alpha', HapY: 'HAP Q', HapA: 'HAP Alpha-only' };
const VIDEO_CODEC = [[/^(avc1|avc3|h264)/i, 'H.264'], [/^(hvc1|hev1|h265|hevc)/i, 'H.265'], [/^vp0?9/i, 'VP9'], [/^av01/i, 'AV1']];

/** The codec of a medium in a word or two ('HAP Q', 'H.264', 'PNG', 'WAV'), '' when unknown. */
export function codecOf(m) {
  if (!m) return '';
  if (m.kind === 'image') return String(m.image?.format || '').toUpperCase();
  // a sound is named by its file type (WAV, MP3, M4A…): what a person calls it; PCM S16LE says nothing to an operator
  if (m.kind === 'audio') return (/\.([A-Za-z0-9]{2,5})$/.exec(m.file || '')?.[1] || m.audio?.codecName || m.audio?.codec || '').toUpperCase();
  const v = m.video || {};
  if (HAP_NAME[v.fourcc]) return HAP_NAME[v.fourcc];
  for (const [re, name] of VIDEO_CODEC) if (re.test(v.codec || '')) return name;
  return v.codecName || v.fourcc?.trim() || 'Video';
}

/** {kind: 'image'|'audio'|'video', label: 'STILL'|'AUDIO'|'VIDEO', codec, text} — text is what the cell badge says. */
export function badgeOf(m) {
  const kind = m?.kind === 'image' ? 'image' : m?.kind === 'audio' ? 'audio' : 'video';
  const label = { image: 'STILL', audio: 'AUDIO', video: 'VIDEO' }[kind], codec = codecOf(m);
  // a movie's badge is its codec (VIDEO would say nothing the picture does not); a still or a sound names its kind first
  const text = kind === 'video' ? codec : codec ? `${label} ${codec}` : label;
  return { kind, label, codec, text, hap: m?.kind === 'hap' };
}

/** The notes of a medium, [{text, convert}] (the engine's words). */
export function notesOf(m) {
  // the engine ends the notes a conversion fixes with "Use Convert to HAP"; an object says it with convert: true
  return (m?.notes || []).map((n) => (typeof n === 'string' ? { text: n, convert: /convert to hap/i.test(n) } : { text: String(n?.message || n?.text || ''), convert: !!n?.convert || /convert to hap/i.test(String(n?.message || n?.text || '')) })).filter((n) => n.text);
}

/** Does the engine hint that converting this medium to HAP would help? */
export const convertHint = (m) => notesOf(m).some((n) => n.convert);

/** A movie Chromium plays natively (not HAP): the only kind a conversion is for. */
export const isNativeVideo = (m) => m?.kind === 'video';

/** Refused files carry their message as a string, or as {text, convert}. */
export const messageOf = (r) => (typeof r?.message === 'string' ? r.message : String(r?.message?.text || r?.message?.message || r?.message || ''));
export const rejectConvert = (r) => !!(r?.convert || r?.message?.convert);

/** The colours of a clip (clip.color): six tints low in saturation — they read as value, never as a third accent. */
export const CLIP_COLORS = [
  ['#808892', 'Slate'], ['#8c8981', 'Sand'], ['#7e8c84', 'Moss'], ['#888494', 'Heather'], ['#8f7f7b', 'Clay'], ['#87898c', 'Mist'],
];
