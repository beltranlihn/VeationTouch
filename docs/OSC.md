# Output protocol (public API)

All coordinates are **u, v ∈ 0–1 with the origin at the TOP-LEFT** of the wall (default) or of the whole output
canvas (destination option *Canvas*). Velocities are in u/s, v/s. Sizes in metres, ages in seconds.
Ids are unique per touch for the whole session (they never repeat while the engine runs).

**Continuous corners.** Walls joined by a continuous corner (Room › *Corner with the next wall › Continuous*; on by
default when the walls close a room — every corner, the last one included — off otherwise) behave as one surface: a
hand sliding across the corner is ONE touch — it keeps its id, its age and its zones, there is **no up on the wall
it leaves and no down on the wall it enters**; it simply moves from one wall's stream to the other's and a `cross`
event says so. Through the short blind stretch at the corner the touch is carried at the hand's speed, so in canvas
coordinates it moves on without a jump. A hand resting in the corner stays on one wall (the reported wall changes
only 3 cm past the corner).

## OSC (UDP, default port 9000, prefix `/vt`)

Sent at the destination rate (default 60 Hz), packed in bundles below 1400 bytes (no IP fragmentation).
`down` / `up` and zone events are sent immediately, even between frames.

| Address | Arguments |
|---|---|
| `/vt/frame` | `i seq` `f time_s` |
| `/vt/room/count` | `i` touches in the room |
| `/vt/room/burst` | `i` touch-downs in the last 300 ms ("hands landing together") |
| `/vt/wall/<wallId>/count` | `i` |
| `/vt/wall/<wallId>/alive` | `i…` ids currently on the wall |
| `/vt/wall/<wallId>/touch` | `i id` `f u` `f v` `f vu` `f vv` `f size` `f age` |
| `/vt/wall/<wallId>/down` | `i id` `f u` `f v` |
| `/vt/wall/<wallId>/up` | `i id` `f u` `f v` `f duration` |
| `/vt/cross` | `i id` `s fromWall` `s toWall` — the touch slid across a continuous corner (same id, no up / down) |
| `/vt/zone/<zoneId>/enter` · `/hold` · `/exit` | `i count` |
| `/vt/zone/<zoneId>/count` | `i` |
| `/vt/test` | `s` `i` — sent by *Send test* |

A destination limited to some walls sees a crossing towards or from a wall it does not carry as an ordinary
`up` (on the wall it carries, at its edge) or `down`.

**TouchDesigner:** OSC In DAT on the port (it splits bundles into rows); filter with a Select DAT on
`/vt/wall/*/touch`, or use an OSC In CHOP for counts. **Unreal:** OSC plugin → OSC Server, bind
`/vt/wall/*/touch` and the `down`/`up` addresses.

### Zones

A zone is a rect, polygon or circle, either on one wall (metres) or on the **output canvas** (pixels, over the
content — a canvas zone can span walls; touches reach it through each wall's Mapping). It is active while at least
*Min hands* touches are inside. Every format below reports zones the same way whatever their shape. In the JSON
formats (WebSocket, Webhook) a canvas zone has `wallId: null` and lists the walls it covers in `walls`. *Fire* (in
Zones) makes a zone active for 0.4 s to test a receiver: its `enter` carries `test: true` in the JSON formats (OSC
cannot tell it apart). A destination restricted to some walls carries the zones that cover any of them.

## Triggers (OSC, UDP, default port 7000)

Zones only, in the simplest form show controllers understand (Resolume, MadMapper, QLab, lighting desks).
Each zone has a trigger address (editable in *Zones*; default `/<zone-name-slug>`):

| Address | Arguments | When |
|---|---|---|
| `<address>` | `i 1` | first touch enters the zone |
| `<address>` | `i 0` | the zone empties (after its release time) |
| `<address>/hold` | `i 1` | once, after the zone's hold time |
| `<address>/count` | `i n` | when the number of touches in the zone changes |

## Webhook (HTTP POST, JSON)

Zone events as one `POST` each to the configured `http://` or `https://` URL, `Content-Type: application/json`,
in order (one request at a time per destination, 3 s timeout, at most 64 queued; overflow and failures are
counted as errors, never block tracking). Body:

```json
{ "event": "enter", "zone": { "id": "Z1", "name": "Big Door", "wallId": "P1", "walls": ["P1"], "address": "/big-door" },
  "count": 1, "room": 3, "time": "2026-11-15T18:04:05.123Z" }
```

`event` is `enter`, `hold` or `exit` (`exit` adds `"duration"` in seconds); a zone *Fire* adds `"test": true` to its
`enter`; *Send test* posts `{ "event": "test" }`. For a canvas zone `wallId` is `null`.
Any 2xx answer counts as delivered.

## Art-Net (DMX over UDP, default port 6454)

One DMX channel per zone in scope (zones of the selected walls, in profile order), starting at *First channel*:
`255` while the zone is active (between its enter and exit), `0` otherwise. ArtDmx (protocol 14) on the 15-bit
Port-Address *Universe*, sent on every change and at least once a second (keep-alive), sequence 1–255. Default
host `255.255.255.255` (local broadcast); use the node's IP to unicast. *Send test* sets every mapped channel to
255 for up to a second. Art-Net™ Designed by and Copyright Artistic Licence Holdings Ltd.

## sACN — ANSI E1.31 (DMX over UDP, port 5568)

The same channel map as Art-Net (one channel per zone in scope from *First channel*, `255` while active), as E1.31
data packets: universe 1–63999, *Priority* 0–200 (default 100), START code 0, sequence 0–255 wrapping, source name
`VEATION Touch`, a CID that is stable per room and destination. Sent on change and at least once a second (receivers
time out after 2.5 s). Destination `multicast` (default) = the universe's group `239.255.<hi>.<lo>`; or a receiver's
IP for unicast.

## The room output (Spout) — source "VEATION Touch"

VEATION Touch has **one Spout sender**, and it carries **the room's image**: one picture at the render size (output
canvas × the output's *scale*, e.g. 7196 × 912 at scale 1), at 30 or 60 fps, on the GPU. A media server (Resolume,
MadMapper, TouchDesigner *Syphon Spout In TOP*, Unreal's Spout plugin) takes it as a single source; its default name is
**`VEATION Touch`** (`senderName` of the output, editable in Experiences › Output). Same computer only: Spout shares a
GPU texture. The same image can instead fill a display (`sink: window`, `fit` = canvas proportions with black around, or
`stretch`) or open in a browser at `/output?run=1`.

The image is made of up to three **layers** stacked on black, in the order the operator chooses (the first of the list
in the app is the top layer). Each layer has a switch, an opacity (0–1) and a blend (`normal`, `screen`, `add`,
`multiply`):

| Layer | What it draws |
|---|---|
| `experience` | the experience that is playing (Experiences tab), at the render size |
| `touches` | the greyscale mask of the touches described below: white discs on black, through each wall's Mapping. Its own settings: resolution of the mask (`scale`, a fraction of the canvas, default 1/4, stretched up to the render size), disc radius, `sizeMode`, soft edge, trail, walls |
| `grid` | the **pixel map**: each wall's outline, a grid in wall metres (0.5 m thin, 1 m thicker with its number), a centre cross, corner marks and the wall id, and the targets of a running calibration (every target a dot, the current one a ring with a crosshair and its number), verification (its check points and where the touch landed) or Fit (the mesh node being moved) |

With **only the `touches` layer on**, the Spout source is exactly the mask the Texture output used to send: white on
black, same resolution rules.

**Calibration mode.** While a calibration, a verification, Fit or the phone's walk test runs, or the walls' *Grid* is on
(`projection.set {grid}`), the output **switches by itself** to what calibration needs: the `grid` (with the targets)
on top of the `touches`, on black, with no experience, whatever the operator's layers are. When that ends it goes back
to the operator's layers. The UI shows it (`state.output.calibrating`); the layers the operator set are never changed.

Control (UI channel commands, not OSC): `output.set {on, sink, senderName, displayId, fit, scale, fps}` (Show mode locks
everything but `on`), `output.layers {layers}` (all three layers, bottom to top, each `{id, on, opacity, blend}`; `touches`
also `radius, sizeMode, softness, trailMs, walls, scale`), `experience.play` / `experience.stop`. `experience.play` selects the
experience and loads the show's preset for it, when there is one: the live parameters are reset to the preset's. `experience.stop`
switches the experience off and clears the clips that belong to it (the other layers keep playing). State: `state.output = {running, calibrating, layersEffective, …}`.

**Screens (Advanced Output, `sink: 'screens'`).** Instead of the whole canvas, the room output is cut into **slices**
drawn onto the room's displays (`profile.output.screens[]`: each screen `{id, name, enabled, display, width, height,
slices}`, each slice `{id, name, wallId, enabled, input, output, flipH, flipV}` — `input` a canvas rectangle or `null`
= its wall's region; `output` `{mode: 'rect', rect}`, `{mode: 'corners', corners}` or a grid `{mode: 'grid', us, vs,
points}` in screen pixels). One window covers the screens' displays; a screen whose display is not connected opens
nothing and is listed in `state.output.screens.problems`. Commands: `output.set {sink: 'screens'}`, `output.screens
{screens}` or `{template: 'fx4' | 'walls' | 'per-wall', fit?, screenId?}` (locked in Show mode), `output.testCard {on}`
(a test card on every screen; never saved). State: `state.output.screens = {list, window, problems}`,
`state.output.testCard`. Spout and the single window are unchanged.

## Texture (NDI or full screen)

A greyscale mask of the touches — white discs on black — rendered in output-canvas pixels through each wall's
Mapping. Each Texture output goes to **one** destination (`sink`), and only that one runs:

| `sink` | Where | Receive it with |
|---|---|---|
| `ndi` (default) | the network — the NDI source `<COMPUTER> (<senderName>)`, BGRA frames at `rateHz` | TouchDesigner *NDI In TOP*, Resolume / MadMapper / OBS NDI source, Unreal NDI plugin |
| `window` | a full-screen window on display `displayId` (desktop app), `fit` = `fit` (canvas proportions, black around) or `stretch` | a capture card or another machine's video input; any browser can open `/texture?o=<id>` |

**Spout is not a destination of a Texture output.** The app has a single Spout sender, the room output above, whose
`touches` layer is this same mask. Profiles saved with a Texture output over Spout are migrated when they load: that output
becomes the `touches` layer (on, with its settings, and its sender name if it had a custom one).

Options: resolution (1/8 … full canvas), disc radius (m), disc size (`sizeMode`: `fixed`, or `touch` — the disc takes
half the touch's measured width, never less than the radius), soft edge, trail (ms), rate (default 30 Hz), walls.
**Calibration overlay** (`overlay`: `auto` (default) or `off`). While the walls' *Grid* is on (`projection.set {grid}`) or a
calibration, verification or Fit runs, an `auto` output draws the same **pixel map** as the `grid` layer on top of the
touches, in grey and white so the frame stays a greyscale image; with `off`, or when none of those is active, the texture is
pure touches. NDI uses the NDI Runtime installed on the computer (free, ndi.video — not bundled). NDI® is a registered
trademark of Vizrt NDI AB.

## Canvas coordinates and Mapping

With *Coordinates: Canvas*, u/v are relative to the whole output canvas and follow each wall's **Mapping**:
`rect` (axis-aligned region), `corners` (corner pin = homography onto 4 canvas points) or `grid` (N×M mesh,
bilinear per cell: `{us, vs, points}`). The WebSocket `hello` includes each wall's `mapping`; the SDK's
`toCanvas()` applies it.

## TUIO 1.1 (UDP, default port 3333)

Standard `/tuio/2Dcur` (`source`, `alive`, `set s x y X Y m`, `fseq`), one source per wall (`vt-<wallId>@veation`).
With *One port per wall* each wall gets its own port (base port + index) for receivers that ignore `source`.

## WebSocket (`ws://<server>:<port>/ws/data`)

On connect: `{type:"hello", profile:{id, name, canvas, walls:[{id,name,width,height,pixelRect}]}}`.
Then frames (`zones` / `zoneEvents` as described in *Zones* above):

```json
{"type":"frame","seq":123,"t":45678,
 "walls":[{"id":"P2","touches":[{"id":7,"u":0.41,"v":0.62,"x":3.01,"y":1.33,"vx":0.1,"vy":0,"size":0.08,"age":1.2}]}],
 "events":[{"type":"down","id":7,"wallId":"P2","x":3.01,"y":1.33,"t":45600}],
 "zones":{"Z1":{"count":1,"active":true,"ids":[7]}},"zoneEvents":[],"room":{"count":1,"burst":0}}
```

`events` are `down`, `up` and `cross` (`{"type":"cross","id":7,"from":"P1","to":"P2","wallId":"P2","x":0.04,"y":1.2,
"fromX":6.483}` — `fromX` is where it left the previous wall). Send `{"type":"subscribe","rateHz":30}` to lower the
rate. `x, y` are wall metres (origin bottom-left). The SDK emits `cross` like `down` / `up`.
SDK: `http://<server>:<port>/sdk/veation-touch.js` (see the header of the file).


## Media server (nothing above is removed; `experience.play`/`stop` now also drive the show's preset and clips)

The engine is also the room's media server (clips in a grid of layers × columns, presets, GPU mix, audio of the clips).
It is driven through the **app socket** `ws://<server>:<port>/ws/ui` (same access key as the UI; the `/ws/data` socket
above is untouched and carries no media). Video and audio never travel on any socket: only state, commands and
thumbnails. **The `media` layer is optional for clients:** a client that only reads touches, zones or `/ws/data` can ignore
every `media`, `show` and `library` field and every `media*` message — they are additions, an old client keeps working.

**Commands** — `{"type":"cmd","id":1,"op":"<op>","args":{…}}`, answered by `{"type":"ack","id":1,"ok":true,"result":…}`.
Allowed in Show mode (the room locked): the launch ops.

| Op | Args | Does |
|---|---|---|
| `clip.trigger` | `clipId` or `{deckId, layerId, column}`, optional `offset` (seconds into one pass of the clip's segment) | Launches a clip on its layer (a second launch restarts or ejects, per the layer's trigger). With `offset` it starts there and never toggles off: the clip panel's scrub |
| `column.trigger` · `column.next` · `column.prev` | `{deckId, column}` · `{dir: 1 \| -1}` | Launches a column (layers with `ignoreColumn` are skipped) / steps through them |
| `layer.clear` · `media.clearAll` | `{layerId}` | Ejects with the layer's transition |
| `layer.set` | `{layerId, opacity, blend, bypass, volume, mute}` | Live mix |
| `layer.solo` | `{layerId}` or `{layerId: null}` | Shows only that layer: the others reach the output as `bypass: true` (their own switch is `bypassSet`); `state.media.solo`. Not saved in the show |
| `media.master` | `{value}` 0…1 | The room's picture level, all layers together (`state.media.master`; the output page dims the image by it). Not saved in the show |
| `media.blackout` | `{on}` | Fades to black and silences; lifting it brings everything back |
| `preset.load` · `preset.unload` · `preset.param` | `{presetId}` · — · `{presetId, key, value}` | The live experience of a preset card |
| `output.testCard` | `{on}` | Test card on the Advanced Output screens |

Read-only, **this computer only** (refused from the LAN and through the relay; the Live browser's Disk view): `media.fsRoots` (the library, the user's folders and the drives), `media.fsList {dir}` (the folders and files of an absolute path, hidden ones left out; `{dir, parent, entries: [{name, kind: 'dir'|'file', size, mtimeMs}], truncated}`) and `media.fsExpand {paths}` (a folder becomes the files in it). `GET /api/media/diskthumb?path=&s=160|480` gives a thumbnail of a file that is in no show (same rule).

Blocked in Show mode: `show.update` (revision-checked), `show.load/create/delete/export/import`, `media.import`,
`media.importCancel`, `media.relink`, `media.remove`, `media.setDir`, `output.screens`. `audio.media` stays open in Show mode for `level` only (routing is locked).

**State** (additions to the `state` message and the `status` message):
- `show` — `{id, name, rev, media[], clips[], layers[], decks[], presets[], start}` (`start`: the card/column the room
  launches by itself when the engine starts).
- `media` — the transport: `{rev, blackout, column, preload[], layers{<id>: {play, from, …}}, xlayer, preset, import[], problems[]}`.
  Positions are never sent as a moving value: a play carries `startAt`, `in`, `out`, `loops`, `end` and the clock does the rest
  (`/shared/transport.js › playhead()` is the one formula).
- `library` — `{dir, isDefault, drive, free, total}`.
- `status.health` — `[{kind: 'bad' | 'warn', code, text}]`; codes: `output-down`, `output-error`, `decode-lag`,
  `library-missing`, `library-full`, `audio-device`, `audio-error`, `audio-down`, `audio-dropouts`, `engine-stall`.
  `status.engine` gains `tickGapMs` (the longest gap between two ticks of the last second).
- `GET /api/health` also returns `engine: {fps, tickMaxMs, tickGapMs}` and `problems: ["bad:output-down", …]` (codes only).

**Messages**
- `{"type":"media", …state.media}` — sent alone when only the transport changes (a launch is ~300 bytes).
- `{"type":"mediaEvent","event":"started"|"ended"|"error","playId","clipId","layerId"}` — `ended` carries `reason`, `error` carries `error`.
- Through the internet relay a client receives `state`/`media` **compact** (`"compact":1`): clip fields equal to the defaults
  and finished copies are left out, to stay well under 64 kB. `/shared/media/wire.js › expandState()` restores them; a
  message without `compact` is complete.

**HTTP**: `GET /api/media/thumb/<mediaId>.png?s=160|480` (same access rule as the UI; also through the relay). There is no
route that serves video; PCM (`/api/media/pcm`) is for this computer only.

### `vt.media` (experiences)

Experiences (`experiences/runtime.js`) get `vt.media`; in the viewer and standalone it is a simulation that resolves at once.

```js
vt.media.available                  // false in standalone / viewer
vt.media.slot('reel')               // → clip | null  (slots declared in the manifest's "media")
vt.media.preload(clipId)            // first frame kept ready (8 clips at most)
vt.media.play(clipId, { end: 'clear', transitionMs: 600 })  // → Promise<{ playId }>  (reserved layer)
vt.media.stop({ transitionMs: 400 })
vt.media.on('started' | 'ended' | 'error', fn)               // { playId, clipId }
vt.media.state()                    // { playing, clipId, position, duration }
```
