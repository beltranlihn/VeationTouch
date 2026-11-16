# Output protocol (public API)

All coordinates are **u, v ∈ 0–1 with the origin at the TOP-LEFT** of the wall (default) or of the whole output
canvas (destination option *Canvas*). Velocities are in u/s, v/s. Sizes in metres, ages in seconds.
Ids are unique per touch for the whole session (they never repeat while the engine runs).

**Continuous corners.** Walls joined by a continuous corner (Room › *Corner with the next wall › Continuous*, on by
default between consecutive walls; the last and the first wall too when the room closes) behave as one surface: a
hand sliding across the corner is ONE touch — it keeps its id, its age and its zones, there is **no up on the wall
it leaves and no down on the wall it enters**; it simply moves from one wall's stream to the other's and a `cross`
event says so. Through the short blind stretch at the corner the touch is carried at the hand's speed, so in canvas
coordinates it moves on without a jump.

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

## Texture (Spout, same machine)

A greyscale mask of the touches — white discs on black — rendered in output-canvas pixels through each wall's
Mapping, shared as a Spout sender (default name `VEATION Touch`). Options: resolution (1/8 … full canvas),
disc radius (m), soft edge, trail (ms), rate (default 30 Hz). Receive it with TouchDesigner's *Syphon Spout In
TOP*, Resolume/MadMapper Spout sources, or a Spout plugin in Unreal. One Texture output per installation.

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
