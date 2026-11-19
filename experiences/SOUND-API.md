# Sound experiences — the contract between the app and a sound piece

A sound experience is a piece that only makes sound (no canvas). It plays at the same time as a visual experience
(e.g. Alma liquid on the walls + Ambient notes in the speakers). The app owns the audio device(s), the channel
routing, the sub, the limiter, the volumes and the fades; the piece only makes sound and listens to the hands.

## Manifest
`experiences/<id>/manifest.json`: `{ id, name, description, kind: 'sound', entry: 'sound.js', params: [...] }`.
Visual experiences have no `kind` (or `kind: 'visual'`). Params use the same types as visual ones
(number / select / bool / wall).

## Entry module
```js
// experiences/<id>/sound.js
export default async function start(host) {
  const { audio, vt, params } = host;
  // build the graph on audio.ctx, connect to audio.roomInput() / audio.wallInput(...) / audio.subInput()
  return {
    setParams(p) {},            // live parameter changes (merged values)
    async stop(fadeMs) {},      // the host also fades the master; stop() releases voices and timers
  };
}
```

## `audio` (given by the host)
- `ctx` — the AudioContext (an OfflineAudioContext in tests), 48 kHz.
- `walls` — `[{ id, name, speakers }]`: the room's walls in profile order and how many speakers (logical channels)
  each one has in the audio map (≥ 1; a wall without a channel in the map is not listed).
- `wallInput(wallId, u = 0.5)` → `{ node, setPosition(u), disconnect() }`: connect a MONO source to `node`. The host
  spreads it across that wall's speakers by `u` (0 = the wall's left end seen from inside the room, 1 = its right
  end; equal power), high-passes it at the profile's wall high-pass, and also feeds the sub sum. Unknown wall → a
  node that goes nowhere (silent), never an exception.
- `roomInput()` → `AudioNode`: content heard on EVERY wall equally (the pad). Also feeds the sub sum.
- `subInput()` → `AudioNode`: content only for the sub channel (low end). Without a sub channel in the map it is
  folded into the walls.
- Master volume, mute, the final limiter (ceiling below 0 dBFS), the sub crossover, the walls' high-pass and the
  fade-in / fade-out at start / stop belong to the host. The piece must not connect to `ctx.destination`.

## `vt` (the runtime in sound mode: `experiences/runtime.js`)
- `vt.params`, `vt.on('params', fn)` — as for visual experiences.
- `vt.walls` — `[{ id, name, width, height }]` (metres, from the profile: a hand reaches ~2.1 m up a wall whatever its
  height, so a piece that maps height to something works in metres, `v × height`); `vt.closedLoop`.
- `vt.hands()` → `[{ stroke, wallId, u, v, size }]`: the hands down now. `u` 0..1 along the wall (left → right seen
  from the room), `v` 0..1 height (0 = floor, 1 = top of the wall), `size` in metres.
- `vt.on('touch', e)` with `e = { type: 'down' | 'move' | 'up', stroke, wallId, u, v, size }`:
  - `down` as soon as a NEW hand lands (no playback delay: sound must answer fast);
  - a hand the tracker splits into several ids within ~0.3 m and ~300 ms is the SAME stroke: no new `down`;
  - `up` once the stitch window has passed without a continuation (so a release starts ≤ ~300 ms late — fine for
    long tails).
```
