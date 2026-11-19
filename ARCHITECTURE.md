# Architecture

## Processes

```
Electron main (app/main.js) ── thin: windows, tray, autostart, supervisor
  ├─ utilityProcess: ENGINE (engine/main.js) ── restarted with backoff if it dies
  │     sensors (UDP) → pipelines → trackers → zones → outputs (OSC/TUIO/Art-Net/sACN UDP, Webhook, Spout)
  │     HTTP + WebSocket server on :8770 (falls back to the next free port)
  │     mDNS responder on UDP 5353: <local name>.local → this server (engine/mdns.js)
  ├─ BrowserWindow: operator UI  → http://127.0.0.1:<port>/
  └─ BrowserWindow: projection   → http://127.0.0.1:<port>/projection (frameless, fullscreen on a chosen display)
Phones / tablets on the LAN → http://<server-ip>:<port>/?k=<access key>  (or http://veation-touch.local:<port>/…)
Apps (TouchDesigner, Unreal, web) ← OSC / TUIO / ws://<server>:<port>/ws/data
```

- The **engine owns the server**, so the tablet keeps working when the desktop window is closed or crashes,
  and the engine can run headless (`node engine/main.js`).
- Supervisor: exit → restart after 1, 2, 4… 30 s; the backoff resets after a minute of healthy running.
  Uncaught exceptions in the engine are logged and the process exits on purpose (clean restart > limping on).
- Memory: the engine's live heap is ~10 MB (flat over hours with forced GC), but V8 grows its spaces lazily, so
  the engine runs with `--js-flags=--max-old-space-size=256 --max-semi-space-size=8` (a utilityProcess ignores bare
  V8 flags in `execArgv`). Safety net: the supervisor restarts the engine if it holds > 1.5 GB for 3 minutes.
  `GET /api/health` reports uptime, RSS, heap used and the heap limit (for external monitoring).
- Closing the operator window hides it to the tray; *Quit* is in the tray menu. Display sleep is blocked.
- Security: localhost is trusted; LAN UI clients need the access key (random, in `settings.json`, embedded in
  the pairing QR). `/ws/data` is read-only and open (apps on other machines must be able to read touches).

## Coordinates

| Frame | Units | Origin / axes |
|---|---|---|
| sensor | metres | LiDAR centre; `x = d·cos θ`, `y = d·sin θ` with the raw angle θ |
| wall | metres | bottom-left corner of the touch surface **seen from inside the room**, x right, y up |
| wall UV | 0–1 | top-left of the wall (screen convention) — what OSC/TUIO/WS send by default |
| canvas | pixels | the video output (e.g. 3840×2400); each wall has a `pixelRect` inside it |

sensor → wall uses the **calibration homography** if the sensor is calibrated, otherwise the **measured pose**
(x, y, rotation, mirror). wall → canvas is the linear map of the wall's `pixelRect` (the projector's warping
is the video processor's job).

## Pipeline (per sensor, every revolution ≈ 10 Hz) — `engine/core/pipeline.js`

1. Drop invalid samples, low quality (Sensitivity mode) and returns < 8 cm (bracket).
2. **Background** per 0.25° bin, learned with the room empty (median of per-revolution minima). A sample is
   foreground when it is closer than background − 40 mm (min over the bin and its neighbours, so object edges
   do not flicker). If a bin's minima spread more than max(100 mm, 3 %) during the capture, in runs of ≥ 4 bins
   (1°), something moved: the capture is flagged with where it happened (wall metres) and the UI asks to repeat it.
   The UI starts every capture with a 5 s countdown.
3. Map to the wall; keep only the **ROI**: the wall rectangle minus edge (3 cm) and floor (5 cm) bands and
   the wall's masks (door, lamp…). Calibration runs in *raw* mode (no ROI) because the pose may be wrong.
4. **Segment** in scan order: a gap > 5 cm or > 2° starts a new object (handles the 0/360° seam).
5. **Size gate**: 1.5 cm < size < 30 cm. Bigger objects (a body leaning on the wall) are reported as *rejected*.
6. **Activity** (pose-independent): directions whose nearest return changed since the previous revolution, in
   runs of ≥ 4 bins, max over 0.5 s. The Sensors list shows *moving* — wave a hand to find which unit is which.
7. **Contact correction**: the LiDAR sees the near half of a hand; the centroid of that arc sits ≈ 2r/π in front
   of the centre. It is pushed back along the ray in the sensor frame (≈ 35 mm error → < 15 mm in tests).

## Tracking (per wall) — `engine/core/tracker.js`

- Detections of all sensors of a wall are merged (< 8 cm) and associated to tracks with the **Hungarian**
  algorithm, gated by `0.15 m + 4 m/s · Δt`.
- Life cycle: tentative → **down** after 2 revolutions (~100–200 ms; hides single-revolution blips) →
  coasting up to 220 ms through dropouts/occlusion → **up**.
- **One Euro** filter per axis; output at 60 Hz with up to 60 ms of constant-velocity extrapolation to hide the
  10 Hz steps. All values are per-profile (`tracking`) and editable in *System › Processing*.

## Continuous corners — `engine/core/corners.js`

The point of one content canvas around the room: a hand sliding from one wall onto the next must stay ONE touch.
Walls keep their own trackers; `CornerLinker` sits on top. Consecutive walls with `joinNext` share a corner (the last
joins the first when the plan closes, `planCloses`); unset, `joinNext` defaults to on only when the walls close a room.
Near a corner (`tracking.cornerZone`, 25 cm each side) touches
are followed in corner coordinates — u = signed distance from the corner along the strip, so both sides are one line.
A new track there joins the touch at its height (same public id, no down) and is confirmed at once with that hand's
velocity (no `confirmFrames` wait, no start from rest) — only to close a gap: while the other wall still sees the
hand, and never for a track on a wall that already carries that touch (another hand). When both sensors see the hand the position is their
recency-weighted average; through the blind stretch at the corner (edge margins, two scan planes — no sensor sees
the hand there) a hand last seen heading into the corner is carried at its own speed (beyond the trackers' own
`predictMs`) until the other wall sees it, at most until it is past the far wall's corner zone (≤ 1.2 s). The reported
wall follows u with 3 cm of hysteresis (`cross` event when it changes);
up only when the hand is really gone. Measured with simulated 10 Hz sensors and a 24 cm blind stretch: one down, one
cross, one up at 0.5–1.5 m/s, and at the corner the lag and the frame-to-frame steps are no larger than anywhere
else on the wall (tests). Limits: two people touching the two sides of a corner within 25 cm, at the same height,
become one touch; a hand lifted while heading into a corner ends a moment later than elsewhere.

## Calibration — `engine/core/calibration.js`

1. Capture the background with the room empty (per sensor).
2. The projection shows targets on the wall (default 3×3 between 0.45 m and 1.9 m — within reach).
3. For each target, every sensor of the wall records a **stable single detection** held for 0.7 s
   (median of the samples), then waits for the hand to leave. A sensor that cannot see a target does not block
   the wizard (it advances 1.5 s after the first sensor captured).
4. Per sensor: **homography** (≥ 4 points, normalised DLT) or affine (3). Residual RMS and worst point are
   shown; *Back* redoes a target. *Apply* stores the matrix in the profile.

After the fit: **Redo worst point** re-captures the target with the largest residual and comes straight back to
the result. **Verify** (`VerifySession`) then shows 5 check points the calibration did NOT use and measures the
*tracked* touch (pipeline + tracker = what the outputs send) against each one: mean / worst error in mm.

## Auto-align — `engine/core/autoalign.js`

With the room empty the scan plane cuts the floor and both neighbouring walls along three straight lines.
Sequential RANSAC + total least squares finds them (from the learned background, or a live revolution); the
configured approximate pose only labels them (floor / left / right) and fixes which way is right. Result: sensor
height, distance to the left wall, rotation, mirror flag — and the wall width measured between the neighbours,
flagged when it differs from the plans by > 3 cm. Tested at < 1.5 cm / < 0.4° (normal and upside-down mounts).
- **Left/right is not measured.** Floor + two side walls look the same mirrored, so the mirror flag is the
  approximate pose's (`sideFrom: 'approximate pose'`). At XR Lab all four sensors were mirrored and Auto-align
  returned plausible poses with x ≈ width − x. Hence **Side check** (`sensor.sideCheck {id, pose}`): one hand held
  near the LEFT end, mapped with the proposed pose, must come out in the left third (6 steady revolutions with a
  single detection, ROI/masks off while checking). If it comes out on the right the UI offers
  `sensor.autoAlign {id, mirror: !mirror}`.
- **An object in the plane is not a wall.** When the width measured between the two side lines is > 25 cm off the
  plans, one of them is something else (XR Lab P1: a truss leg 1.70 m from the corner gave 4.78 m for a 6.48 m
  wall): x is taken from the side that agrees with the approximate pose, `xWarn` says so, and the width is not
  offered as the wall width (`widthTrusted: false`).

## Level check — `engine/core/levelcheck.js`

Mounting aid (`sensor.levelCheck`). A 2D LiDAR cannot measure its own tilt, but with the room empty two symptoms
show in its static returns (live: median of the last 5 revolutions, so it can be re-run right after adjusting the
bracket), mapped to the wall with the current pose or calibration: **grazing** — returns inside the wall rectangle
that are neither floor (±8 cm), a neighbouring wall (±8 cm) nor inside a mask: the plane reaches the wall there and
hides everything beyond; and **floor coverage** — the floor must be seen corner to corner (10 cm cells), the
missing stretches are listed. Result: verdict, the grazing region in words ("lower left") and metres, its distance
from the sensor, advice, and marks drawn in red on the Sensors canvas. If the live data no longer matches the
stored background (≥ 2° of the scan off by > 10 cm) it also asks to recapture the background. It cannot see a plane
that is too far from the wall (ruler check). The simulator can lean a sensor's plane (`simulation.planes[sensorId]
= {gapMm, tiltDeg, towardsDeg}`) to test and demo it.

## Operation

- **Show mode** (`app.lock`): the engine refuses every editing command (profile, background, calibration,
  auto-align) until unlocked; projection, outputs tests and virtual hands keep working.
- **Health** (Live): sensors not scanning (with the last error), no background, not calibrated, output errors,
  engine below 50 fps.
- **Versions**: every save keeps the previous file (last 30); System › Versions lists and restores them.
- **Pairing**: network picker (this PC's Windows hotspot — 192.168.137.x — first, the LiDAR subnet last) naming the
  Wi-Fi (SSID from `netsh wlan show interfaces`, refreshed every 20 s; `engine/net.js`) the phone must join, a
  warning when it looks like guest Wi-Fi (client isolation) with a button that opens Windows' Mobile hotspot settings,
  firewall check of the app's own rules with an elevated "Fix" offered only at the server, and three live states:
  connected · reached this computer but not connected (the server notes page loads from non-local addresses,
  `status.reached`) · nothing reached it.
- **Startup guard** (`ui/js/boot-guard.js`, a classic script in every page's head, before the modules): if the page
  does not start (a script error, a module that fails to load, nothing within 12 s) it shows «This page could not
  start» with the error and a Reload button, and POSTs the error to `/api/client-error`; the server writes ONE log
  line per error (control characters stripped, ≤ 20 per address every 10 min, no key needed: a page that did not
  start has none). Pages call `window.__vtStarted()` once up; later errors are only logged. Born from a bug that
  left every QR-opened phone on a silent empty page (`history` shadowed in `conn.js`).
- **Local name** (`engine/mdns.js`, RFC 6762, own code): the engine answers A questions for `<name>.local`
  (System › Network, default `veation-touch`) with the address of the interface on the querier's subnet, announces
  itself on start and says goodbye on stop. QU questions and plain DNS clients (source port ≠ 5353) get a unicast
  answer (legacy: id echoed, TTL ≤ 10 s). No probing: another host answering for the same name is shown as a
  conflict. A busy/blocked UDP 5353 only loses the name. Windows does not resolve the name on the server itself
  (it ignores its own answer) — use `localhost` there. Resolution on Android depends on the version; the QR always
  works.
- **One device drives a calibration** (`engine.control`): `calib.start` / `verify.start` record the UI device that
  sent them (the server stamps `__client` on every command — never trusted from the client). While the session
  runs, editing and session commands (`CONTROL_OPS`) from other devices are refused with "calibration in progress
  on <device>"; they see a view-only banner and can **Take control** (`control.take`, with confirmation). If the
  driving device disconnects, the next device that acts takes over. Commands without a device (tests, the engine
  itself) are never restricted. Released when the session ends.

## Recording and replay — `engine/record.js`

Raw revolutions of every sensor (before any processing) go to a gzip stream: a JSON header (profile snapshot,
sensor ids) then frames of u16 angle·64, u16 distance mm, u8 quality — ~16 kB per revolution, 10 min max.
`ReplaySource` plays a file in real time with fresh host timestamps; while replaying, every sensor of the active
profile is a `ReplayDriver` fed by it (matched by sensor id), so background, tracking, zones, calibration and
outputs behave exactly as in the room. Recording is refused during a replay and vice versa.

## Discovery — `engine/discover.js`

Sweeps the networks where sensors are (the one of the factory address 192.168.11.2 and those of the profile's
S2E hosts; every local network up to /22 with `sensor.discover {everywhere: true}` — "Search every network")
with GET_HEALTH on UDP 8089 (paced), then GET_INFO for serial and firmware. Sockets to a sensor (driver and
discovery) bind to this computer's own address on the sensor's network (`localAddressFor`, recomputed on every
connect) and fall back to 0.0.0.0 when there is none: at XR Lab the sensors are reached through a second address
on the Dante card, and Windows' source-address choice is not something to rely on. A sensor's `lastError` is
cleared when it returns to `scanning`. Sensors that are streaming are never probed: any request stops
an S2E's stream. Re-addressing (`readdress`): refuse if the new address answers already, note the unit's serial,
SET_LIDAR_CONF 0x0001CCC0 (ip, mask, gw) + RESET, then poll the new address until the SAME serial answers
(`READDRESS_WAIT_MS` = 90 s: four real S2E took 11, 34, 60 and 61 s to answer again). A unit that answers on its
old address again after restarting refused the change ("kept its old address", detected from 8 s on). One still
silent at the end is `pending`, not an error: the profile follows it anyway and the sensor connects when it
answers. The UI counts the seconds while it waits, and its command timeout is longer for this command
(`CMD_TIMEOUT_MS` in `ui/js/conn.js`; the default 15 s would have cut it). `readStaticIp` reads the configuration back
without changing anything. The engine refuses an address no network card of this computer could reach, and the
profile follows the unit (its sensor gets the new host, or a new sensor is added on the chosen wall).
`sensor.discover` also returns, per wall, the address its unit should get (the one its sensor in the profile waits
on, else .11, .12… free) and the network cards with only a 169.254 address (plugged into a network without DHCP —
the sensors' switch), which `net.setSensorNic` sets to 192.168.11.5 through an elevated netsh (UAC on the server).
The emulator re-binds to the new address on RESET (`rebind`), so all of this is tested end to end on loopback
addresses.

## Content underlay

One image per profile (`profiles/<id>/underlay.png|jpg|webp`, magic-byte checked, 25 MB max, POST
`/api/underlay` with the same auth as the UI). Drawn under the canvas in Mapping and, per wall, from that wall's
pixel region in the strip/focus views — corner and grid mappings use the bounding box (approximation).

## RPLIDAR S2E driver — `engine/drivers/s2e.js`

Clean-room implementation of the published protocol (see `docs/research/notes/Documentacion oficial S2E/`).
- One UDP socket per sensor; the LiDAR (default `192.168.11.2:8089`) never talks first.
- Session: STOP → GET_HEALTH (RESET on protection stop) → GET_INFO → enumerate scan modes (0x70…0x7F)
  → EXPRESS_SCAN in the chosen mode → optional MOTOR_SPEED_CTRL.
- *auto* mode prefers **Sensitivity** (answer 0x83: real per-sample angles, quality, device timestamp, CRC32);
  DenseBoost (0x85) and Standard (0x81) are supported too.
- Datagrams are treated as a byte stream (re-assembly + resync + checksum/CRC per packet).
- **No keep-alive exists**, so a watchdog restarts the session after 2 s without data (8 s for the first packet,
  motor spin-up); the second failure sends RESET; every 4th reopens the socket; backoff up to 10 s. The sensor
  stays *offline* (not *connecting*) until data flows again.
- Tested end-to-end against `engine/sim/s2e-emulator.js` (a software S2E), including a cut cable.

## Profiles — `engine/profile.js`

One JSON per room: `canvas`, `walls` (size, `pixelRect`, masks), `sensors` (driver, ip, pose, calibration),
`zones`, `outputs`, `processing`, `tracking`, `simulation`. `normalizeProfile` is the single gate (defaults,
clamping, id sanitising, schema migration). Writes are atomic (temp + fsync + rename) and the previous version
goes to `backups/` (last 30); an unreadable profile is restored from the newest backup.

## Mapping (wall → output canvas)

`wall.mapping` is `rect` (= `pixelRect`, axis-aligned) or `corners` (corner pin: a homography from the wall's
UV square onto 4 canvas points; `pixelRect` then holds the bounding box for old clients). One implementation in
`engine/core/geometry.js`, served to the browser as `/shared/geometry.js`, so the engine (canvas-coordinate
outputs), the projection page and the UI agree to the pixel. The projection's *Identify* mode draws each wall's
grid through its mapping with amber corner markers: the operator drags corners until they sit on the physical
corners. The third level is `grid`: an N×M mesh (`us`, `vs` node positions in wall UV + canvas points),
bilinear inside each cell; it starts from the current mapping (nothing jumps), rows/columns are inserted where the
operator clicks without changing the map (`gridInsert`), and nodes are dragged on the canvas or nudged 1/5/20 px
from the tablet pad.

**Fit** (the calibration remote, `ui/js/remote.js`): the operator puts a hand on a projected mesh point k; the
sensor reads the hand at wall UV (u, v). `gridSolveNode` moves only point k so that the map sends (u, v) to the
pixel point k had — the pixel physically under the hand — dividing the error by k's bilinear weight at (u, v);
it refuses when that weight is < 0.25 (hand too far from the point). The remote tells the engine which point it is
moving (`projection.set {fit: {wallId, node}}`, never saved, cleared when that device disconnects or the room
changes); the projection then draws that wall's mesh, the point and the live touches as rings whatever its mode,
and the simulated wandering hands leave the wall. The canonical `wallUvToCanvas` (rect, corner pin, mesh) lives in
`geometry.js` and is used by the engine, the outputs, the UI and the projection.

**Bad touches during calibration** (`CalibrationSession.suspectTarget`): leave-one-out with an AFFINE fit (8 points
would nearly pin down a homography's 8 unknowns, and it bends towards a bad point); a target whose capture lands
> 4 cm and > 5× the others' residual from the fit of the others is asked again automatically, once per target, before
the result is shown. "Redo worst point" uses the same test first.

**Verification is kept** on its wall (`wall.verified`: mean, worst, pass = worst ≤ `verifyPassMm(wall)` — 25 mm, plus
half of the scan plane's distance beyond 3 cm (`wall.planeOffset`: a plane in front of something on the wall reads the
arm where it crosses, so the reading moves with the arm's angle) — and where the worst point was)
and dropped when that wall's mapping or its sensors' calibration changes (in `profile.update` and on apply).

**Room setup guide** (the remote): `nextTask()` returns ONE next thing — sensors running → background → projection →
calibrate each wall with sensors → verify each → fix a failed one at its worst point (Fit with the nearest mesh
point chosen) → walk test → lock. **Walk test**: while the remote's Test step is open, `projection.set {walk}`
(transient, cleared with that device) makes the projection draw what the outputs send — the first Texture output's
`TouchMask` discs — on every wall, with the zones; the remote ticks each wall touched and each joined corner crossed
(`cross` events), and "Fix here" opens Fit on the wall of the one hand. Passing it is remembered per device
(localStorage) until a newer verification.

## Zones — `engine/core/zones.js`

A zone is a shape — `rect`, `polygon` (3–64 points) or `circle` — in one of two spaces:
- `space: 'wall'`: wall metres on `wallId` (y up), tested against that wall's touches.
- `space: 'canvas'`: output-canvas pixels (y down). Every touch is taken through its wall's Mapping
  (`wallToCanvas`) before the test, so a zone drawn on the content can span walls (a door painted across a
  corner) and always matches what is projected. `wallId` is `null`; `walls` (derived on normalisation: walls whose
  canvas region overlaps the shape, `polygonsOverlap`) decides which outputs with a wall filter carry it.
Non-rect shapes keep their bounds in `rect` (lists, older readers). A zone is active while at least `minHands`
touches are inside (enter / hold after `holdMs` / exit debounced by `releaseMs`). `zone.fire` forces a zone
active for 0.4 s through the same path (events flagged `test: true`) to check a receiver without touching the
wall. Masks can be `rect` or `polygon` (pipeline and Level check use `pointInShape`). The editor
(`ui/js/workspace.js` + `ui/js/shapes.js`) draws rect / polygon / circle in either space; canvas zones are drawn
dashed on each wall they reach (inverse mapping: linear, inverse homography, or `invertMap` for grids).

## 3D room view — `ui/js/room3d.js`

Live › 3D: the walls stand on the floor following `roomPlan()` (shared geometry: wall i starts where wall i−1 ends,
`wall.turn` degrees clockwise, 90 = an ordinary inside corner), each textured with its part of the content image,
its zones (filled while active, canvas zones dashed) and masks — a per-wall canvas texture redrawn only when that
changes. Touches, sensors and the LiDAR points are drawn as geometry every frame. Own WebGL2 (two small programs),
no dependency. A room whose wall loop almost closes (measured widths never match: XR Lab misses by 7.6 cm) is drawn
closed (`roomPlan(walls, {close:true})` spreads the mismatch), because the data treats it as one continuous surface;
the Live 2D strip likewise draws joined walls touching, with "↻" at both ends of a closed room. Walls are
one-sided, so from outside the near walls hide and you look in (outlines stay); *Inside*
stands at eye height in the middle. The virtual hand picks the wall under the pointer (ray against the wall
planes) and touches it — across corners too.

## Texture output

`engine/core/mask.js` rasterises the touches (CPU, Uint8 mask, smoothstep edge, exponential trail, disc radius fixed
or following the touch's measured width) in canvas pixels through the mapping; `engine/outputs/texture.js` expands
it to RGBA. Each output has ONE sink and only that one runs: **Spout** (the studio's own prebuilt addon,
`native/spout-send/dsp_spout.node`, Node-API, unpacked from the asar; one sender per process), **NDI**
(`engine/outputs/ndi.js`: the NDI Runtime installed on the computer — found through `NDI_RUNTIME_DIR_V6/_V5`,
`VT_NDI_LIB` overrides — called through koffi (MIT); structures from the MIT-licensed SDK header; nothing of NDI is
bundled; `tests/ndi.test.mjs` receives the source back through the runtime and checks its pixels) or a **full-screen
window** (the engine renders nothing: it emits `textureWindows` [{id, displayId}], the desktop app opens one frameless
full-screen window per entry at `/texture?o=<id>`, and `ui/js/texture.js` draws the mask itself from the live touches,
fit or stretch). ~1.5 ms per frame at 960×600. The same module is served as `/shared/mask.js`: the UI's live
preview (Outputs › Texture) runs it on the live touches (≈30 Hz, capped at 0.7 Mpx), so the preview is the output,
and the blob faders preview while dragged without saving. Faders follow VEATION's inspector (`fader()` in
`ui/js/dom.js`: 3 px groove + fill, no knob, value in an s0 box that can be typed in); a UI test fails if a native
range input appears in any view.

**Pixel map.** In rooms where the projectors are fed by the room's media system from our Texture output (XR Lab),
our projection window is not on the walls, so the calibration pattern travels in the Texture output itself.
`projection.set {grid}` (transient, owned by the client that set it, in the state as `grid`), and any running
calibration, verification or Fit, make the engine attach `frame.overlay` to every frame. A Texture output with
`overlay: 'auto'` (default; `'off'` keeps it pure touches) passes it to `core/mask.js`, which rasterises
`wallPattern(wall)` into a cached buffer:
- the wall outline;
- 0.5 m and 1 m wall-metre lines carried through the Mapping;
- a centre cross, corner marks, the wall id and the metre numbers (5×7 bitmap font, sized to the output scale);
- the session targets (current target ringed and numbered).
The buffer is composited by maximum over the touch mask, so trails are untouched. The projection page strokes the
same `wallPattern` geometry. The desktop preview and the full-screen texture page run the same rasteriser from
`store.state.grid` and `store.status`.

## Internet access — `engine/cloud.js`, `cloud/`

The room can be opened from any network without touching the router or the firewall. With internet access on
(at the server itself), `engine/cloud.js` keeps an outbound WebSocket to the relay:
- `cloud/relay`: a Cloudflare Worker with one Durable Object per room, deployed as
  `veation-relay.almadigitalstudio.workers.dev`;
- `node-relay.mjs`: the same protocol on Node, for the tests and self-hosting.

The relay forwards a browser's HTTP and WebSocket traffic over that link (`core.mjs`: `req`/`res`, `open`/`msg`/`close`,
bodies ≤ 4 MB, 8 browser sockets per room). The engine answers by calling its own server on 127.0.0.1, so the UI is
always the one matching the server's version. `/r/<room>/` sets a `vt_room` cookie, because the UI uses absolute
paths.

Rooms and secrets:
- Each room has a random `roomId` and a secret. The first link claims the room; the relay keeps only the
  secret's hash.
- `cloud.reset` ("New address") replaces both and kills every link already shared.

Trust: tunnelled traffic is stamped with a per-process secret header, so `peerOf()` in `server.js` treats it as a
remote device:
- it needs the pairing key exactly like a phone on the LAN;
- it is never local;
- local-only commands (`net.*`, `cloud.set`, `cloud.reset`) are refused.

The shareable link is `https://veation-touch.vercel.app/#r=<room>&k=<key>&relay=<relay>`. The key travels in the
hash, so the launcher host never sees it. The launcher (`cloud/launcher`, a static Vercel site) remembers rooms on
the device, shows each one online/offline (`/_relay/status`) and sends the browser to the relay. Tested end to end
against the deployed relay on 2026-11-19: page + `/ws/ui` state in ~150 ms, refused without the key.

Deploy:
- relay: `cd cloud/relay && npx wrangler deploy`;
- launcher: `cd cloud/launcher && npx vercel deploy --prod` (project `veation-touch`).

## UI tests — `tests/ui.test.mjs`

The operator UI is tested in the real thing: each test starts an engine on a temporary folder (bundled profiles →
the simulated XR Lab room), opens the UI in a hidden Electron window (`tests/ui/runner.cjs`), runs a script in the
page and asserts on what it returns; page errors fail the test. The server option `trustLocal: false` lets a test act
as a tablet without the access key (`/api/pair-check` tells "not paired" from "engine down"). `--mobile` emulates a
phone (touch as the main pointer → the calibration remote). Each run has its own in-memory session (no localStorage
carried between tests). A hidden window paints no frames: tests that read a canvas call its draw first
(`__vt.ws.draw()`, `__proj.draw()`).

## UI

`ui/js/main.js` picks the interface per device: touch as the main pointer (phones, tablets) → the **calibration
remote** (`remote.js`: wall picker, Prepare / Calibrate / Fit / Verify, projection mode; it reuses the calibration
panels of `views.js` and updates what changes 30 times a second in place, so buttons are never rebuilt under the
finger); otherwise the full app. `?ui=full|remote` overrides it and is remembered on the device.

Same SPA for the Electron window and the tablet (`ui/`, vanilla ES modules, no build step). **Each tool turns the
central canvas into its own workspace** (`ui/js/workspace.js`): Live/Room show all walls (Room: drag edges to
resize walls), Mapping shows the output canvas in pixels (move regions, drag corners), Sensors/Calibrate/Zones
focus one wall (drag/rotate sensors; draw, move, reshape zones and masks — rect, polygon, circle — with handles
and snapping); Zones › Canvas edits canvas zones on the output canvas, over the content. Drags are
previewed locally and committed once; every edit goes into a client-side undo history (Ctrl+Z / Ctrl+Shift+Z),
cleared by operations that must not be undone by accident (load room, apply calibration). Keys 1–8 switch tools. The server is authoritative: edits send the whole
profile with its revision; stale revisions are refused and the client reloads. Point clouds are binary
WebSocket frames (Float32), ≤ 10 Hz (5 Hz on touch devices) and only built while someone views them.

## Validation still needed with real sensors

| Item | Why it matters |
|---|---|
| Plane-to-wall distance and the ±1.5° plane tilt | the bracket must allow 2-axis levelling |
| Level check bands (±8 cm floor / side walls) on real skirting boards and corners | false grazing alarms |
| Background-movement (100 mm / 3 %) and activity (80 mm / 3 %) thresholds vs real S2E noise | false "movement" / "moving" |
| Noise on skin / dark clothes at 1–5 m | `bgThresholdMm`, `minSize`, One Euro tuning |
| Default scan mode, max motor rpm | latency vs points |
| Disconnect/reconnect behaviour, multiple units on one subnet | watchdog timings |
| Crosstalk between walls at the corners | masks / motor speeds |
| End-to-end latency (hand → projection) | `predictMs`, `confirmFrames` |
| `setStaticIp` (SET_LIDAR_CONF 0x0001CCC0) | **validated** at XR Lab (2026-11-19, 4 units, fw 1.02): it works; the unit answers again on the new address after 11–61 s |
