# VEATION Touch

LiDAR touch-wall tracking for immersive rooms — Alma Digital Studio.
2D LiDARs (Slamtec RPLIDAR S2E over Ethernet) → calibrated touches → OSC · TUIO · WebSocket · Spout · Webhook · Art-Net · sACN.

## Run

```bash
npm install
npm run engine      # engine + web UI on http://localhost:8770 (no Electron)
npm start           # desktop app (Electron)
npm test            # unit, driver end-to-end and UI tests (the real UI in a hidden Electron window)
```

Calibrate from a phone or tablet at the wall: **Connect device** (top bar) shows a QR code with the LAN address and
the access key. The phone (same network as the server) opens the calibration remote — prepare, calibrate, fit,
verify, wall by wall; **Full app** opens the whole app on it.

No sensors at hand? Pick the room **Barcelona XR Lab (simulated)**, turn on **Virtual hands** in *Live* and
touch the walls in the view.

## Repository

| Path | What |
|---|---|
| `app/main.js` | Electron main: engine supervisor, windows (operator + projection), tray, autostart |
| `engine/` | Tracking engine (runs in a utilityProcess or standalone with Node) |
| `engine/drivers/` | `s2e.js` UDP driver · `s2e-protocol.js` wire format · `sim.js` simulated sensor |
| `engine/core/` | geometry · pipeline (per sensor) · tracker (per wall) · corners (one touch across a corner) · zones · calibration · auto-align · level check · filters |
| `engine/outputs/` | OSC encoder · output routing (OSC, Triggers, TUIO, Webhook, Art-Net, sACN) · Spout texture |
| `engine/sim/` | synthetic wall scene + a software S2E (UDP) used by tests |
| `engine/server.js` | HTTP + WebSocket: serves the UI to the window and to tablets, `/ws/data` for apps |
| `engine/mdns.js` | mDNS responder: tablets open `http://veation-touch.local:8770/` |
| `ui/` | operator UI (vanilla JS, no build step): full app (`app.js`), phone calibration remote (`remote.js`), 3D room view (`room3d.js`, WebGL2) and `projection.html` |
| `sdk/veation-touch.js` | client SDK for web/Electron apps |
| `profiles/` | bundled room profiles (seeded into the data folder on first run) |
| `tests/` | `node --test` suites |
| `docs/OSC.md` | output protocol reference (public API) |
| `docs/MANUAL-OPERACION.md` | operator manual (Spanish) |
| `docs/ux/` | UX proposal, reference-product analysis, phone screenshots |
| `native/spout-send/` | prebuilt Spout sender (studio's own addon, from VEATION) |
| `docs/research/` | research reports, notes and the official Slamtec S2E documents |
| `ARCHITECTURE.md` | how it works and why |

Data folder (`%APPDATA%\VEATION Touch`, or `./.data` for `npm run engine`): `settings.json`, `profiles/`,
learned backgrounds, `backups/` (last 30 versions of each profile), `logs/`.
