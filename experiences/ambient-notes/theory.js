// Ambient notes — pitch logic (pure: no Web Audio, runs in Node for the tests).
// Keys, scales, the ladder of notes a wall's height is mapped onto, and the pad's chords.

export const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Semitone steps from the key's root. Pentatonic scales first: any combination of two hands sounds good. */
export const SCALES = {
  'major-pentatonic': [0, 2, 4, 7, 9],
  'minor-pentatonic': [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
};

/** The part of a wall's height that is used: a hand rarely reaches the very floor or the very top. */
export const V_LOW = 0.08;
export const V_HIGH = 0.92;

export const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);
export const hzToMidi = (f) => 69 + 12 * Math.log2(f / 440);

/** Pitch class (0..11) of a key name; unknown names fall back to C. */
export function keyPc(key) {
  const i = KEYS.indexOf(key);
  return i < 0 ? 0 : i;
}

export const scaleSteps = (scale) => SCALES[scale] || SCALES['minor-pentatonic'];

/** Does this MIDI note (or pitch class) belong to the scale of this key? */
export function inScale(midi, key, scale) {
  const pc = (((Math.round(midi) - keyPc(key)) % 12) + 12) % 12;
  return scaleSteps(scale).includes(pc);
}

/**
 * Every note of the scale from the key's root in `lowOctave` (C3 = octave 3 = MIDI 48) up over `octaves` octaves,
 * ending on the root. Ascending MIDI numbers.
 */
export function scaleLadder(key, scale, lowOctave = 3, octaves = 3) {
  const steps = scaleSteps(scale);
  const oct = Math.max(1, Math.min(6, Math.round(octaves)));
  const base = 12 * (Math.round(lowOctave) + 1) + keyPc(key);
  const out = [];
  for (let o = 0; o < oct; o++) for (const s of steps) out.push(base + 12 * o + s);
  out.push(base + 12 * oct);
  return out;
}

/** Height (0 = floor, 1 = top) → a note of the ladder: low hand = low note. (When the wall's height is not known.) */
export function noteForHeight(v, ladder) {
  const x = Math.min(1, Math.max(0, ((Number.isFinite(v) ? v : 0.5) - V_LOW) / (V_HIGH - V_LOW)));
  return ladder[Math.min(ladder.length - 1, Math.floor(x * ladder.length))];
}

// Where hands are: a person reaches ~2.1 m up a wall and rarely plays below ~0.3 m. The scale lives between the two, in
// METRES, whatever the wall's height (on a 3.5 m wall the top of the wall is out of reach and must not hold notes).
export const REACH_M = 2.1;
export const FLOOR_M = 0.3;
const MIN_SPAN_M = 0.3;

/**
 * Height in metres above the floor → a note of the ladder: the WHOLE ladder between `floor` and `reach` (low hand = low
 * note); a hand above `reach` plays the top note, one below `floor` the lowest.
 */
export function noteForHeightM(y, ladder, floor = FLOOR_M, reach = REACH_M) {
  const lo = Math.max(0, Number.isFinite(floor) ? floor : FLOOR_M);
  const hi = Math.max(lo + MIN_SPAN_M, Number.isFinite(reach) ? reach : REACH_M);
  const x = Math.min(1, Math.max(0, ((Number.isFinite(y) ? y : (lo + hi) / 2) - lo) / (hi - lo)));
  return ladder[Math.min(ladder.length - 1, Math.floor(x * ladder.length))];
}

/* ------------------------------------------------------------------ the pad's chords */

// Root of each chord as a degree of the scale (0 = the key's root); cycled slowly. Chords are stacked from the scale's
// OWN notes (degree, +2, +4, +6 steps of the scale), so the pad never contains a note the hands cannot play.
const PROGRESSION = {
  5: [0, 3, 1, 4, 2, 3],
  7: [0, 5, 3, 4, 0, 2, 3, 1],
};

/**
 * The pad's chord number `step` (0, 1, 2…, cycling) in a key and scale:
 * `{ notes: [midi × 4], bass: midi, root: midi, degree }`. The chord sits around C3..C5; the bass is an octave below
 * the root (for the sub channel).
 */
export function chordFor(key, scale, step = 0) {
  const steps = scaleSteps(scale), n = steps.length;
  const prog = PROGRESSION[n] || PROGRESSION[7];
  const degree = prog[((step % prog.length) + prog.length) % prog.length] % n;
  const base = 12 * 4 + keyPc(key); // octave 3 (C3 = 48)
  const at = (idx) => base + steps[idx % n] + 12 * Math.floor(idx / n);
  const notes = [0, 2, 4, 6].map((k) => {
    let m = at(degree + k);
    while (m > 76) m -= 12; // keep the pad warm
    return m;
  });
  let root = notes[0];
  const bass = root - 12;
  notes.sort((a, b) => a - b);
  return { notes, bass, root, degree };
}
