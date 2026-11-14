# Architecture

## Processes

```
Electron main (app/main.js) ── thin: windows, tray, autostart, supervisor
  ├─ utilityProcess: ENGINE (engine/main.js) ── restarted with backoff if it dies
  │     sensors (UDP) → pipelines → trackers → zones → outputs (OSC/TUIO UDP)
  │     HTTP + WebSocket server on :8770 (falls back to the next free port)
  ├─ BrowserWindow: operator UI  → http://127.0.0.1:<port>/
  └─ BrowserWindow: projection   → http://127.0.0.1:<port>/projection (frameless, fullscreen on a chosen display)
Phones / tablets on the LAN → http://<server-ip>:<port>/?k=<access key>
Apps (TouchDesigner, Unreal, web) ← OSC / TUIO / ws://<server>:<port>/ws/data
```

- The **engine owns the server**, so the tablet keeps working when the desktop window is closed or crashes,
  and the engine can run headless (`node engine/main.js`).
- Supervisor: exit → restart after 1, 2, 4… 30 s; the backoff resets after a minute of healthy running.
  Uncaught exceptions in the engine are logged and the process exits on purpose (clean restart > limping on).
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
   do not flicker).
3. Map to the wall; keep only the **ROI**: the wall rectangle minus edge (3 cm) and floor (5 cm) bands and
   the wall's masks (door, lamp…). Calibration runs in *raw* mode (no ROI) because the pose may be wrong.
4. **Segment** in scan order: a gap > 5 cm or > 2° starts a new object (handles the 0/360° seam).
5. **Size gate**: 1.5 cm < size < 30 cm. Bigger objects (a body leaning on the wall) are reported as *rejected*.
6. **Contact correction**: the LiDAR sees the near half of a hand; the centroid of that arc sits ≈ 2r/π in front
   of the centre. It is pushed back along the ray in the sensor frame (≈ 35 mm error → < 15 mm in tests).

## Tracking (per wall) — `engine/core/tracker.js`

- Detections of all sensors of a wall are merged (< 8 cm) and associated to tracks with the **Hungarian**
  algorithm, gated by `0.15 m + 4 m/s · Δt`.
- Life cycle: tentative → **down** after 2 revolutions (~100–200 ms; hides single-revolution blips) →
  coasting up to 220 ms through dropouts/occlusion → **up**.
- **One Euro** filter per axis; output at 60 Hz with up to 60 ms of constant-velocity extrapolation to hide the
  10 Hz steps. All values are per-profile (`tracking`) and editable in *System › Processing*.

## Calibration — `engine/core/calibration.js`

1. Capture the background with the room empty (per sensor).
2. The projection shows targets on the wall (default 3×3 between 0.45 m and 1.9 m — within reach).
3. For each target, every sensor of the wall records a **stable single detection** held for 0.7 s
   (median of the samples), then waits for the hand to leave. A sensor that cannot see a target does not block
   the wizard (it advances 1.5 s after the first sensor captured).
4. Per sensor: **homography** (≥ 4 points, normalised DLT) or affine (3). Residual RMS and worst point are
   shown; *Back* redoes a target. *Apply* stores the matrix in the profile.

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

## UI

Same SPA for the Electron window and the tablet (`ui/`, vanilla ES modules, no build step). The canvas shows the
room **unrolled** (walls side by side at one metric scale). The server is authoritative: edits send the whole
profile with its revision; stale revisions are refused and the client reloads. Point clouds are binary
WebSocket frames (Float32), ≤ 10 Hz (5 Hz on touch devices) and only built while someone views them.

## Validation still needed with real sensors

| Item | Why it matters |
|---|---|
| Plane-to-wall distance and the ±1.5° plane tilt | the bracket must allow 2-axis levelling |
| Noise on skin / dark clothes at 1–5 m | `bgThresholdMm`, `minSize`, One Euro tuning |
| Default scan mode, max motor rpm | latency vs points |
| Disconnect/reconnect behaviour, multiple units on one subnet | watchdog timings |
| Crosstalk between walls at the corners | masks / motor speeds |
| End-to-end latency (hand → projection) | `predictMs`, `confirmFrames` |
| `setStaticIp` (SET_LIDAR_CONF 0x0001CCC0) | untested — use RoboStudio until verified |
