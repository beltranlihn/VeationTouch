# Electron Architecture, Stack, Robustness and Windows Deployment for an Always-On LiDAR Tracking Server

Research date: 2026-11-14. Tool budget was limited; many docs pages were summarized by a fetch model, and several pages (Companion/Open Stage Control internals, NSIS options detail, napi-rs license, Spout bindings) returned little. Items marked "(training knowledge, unverified)" appear only under Inferences and must be checked before being relied on.

## 1. Electron version and process model (utilityProcess vs worker_threads vs child process; IPC)

### Takeaway
Target a currently supported Electron major (45 is newest stable; 43/44 also supported; all ship Node 24). For a real-time engine, run it in an Electron `utilityProcess` (separate OS process, MessagePort IPC) so a native or V8 crash cannot take down the main/UI processes. `worker_threads` share the process and give weaker isolation.

### Cited Findings
- Supported Electron majors in Nov 2026 are 43, 44 and 45. Electron 45 = Chromium M156, Node 24, released 20 Oct 2026, support to 27 Apr 2027 (latest 45.3.1). Electron 44 = M152, Node 24, released 24 Aug 2026, support to 2 Mar 2027. Electron 43 supported until 5 Jan 2027. Electron 40-42 are all Node 24; 39 and earlier are Node 22. — [endoflife.date/electron](https://endoflife.date/electron)
- Search results conflicted on "latest stable" (one aggregator said 44.7.0; a releases page showed a stale 42.x label); endoflife.date lists 45.x as newest and is the most consistent source. Only the latest three majors are supported, roughly one major every 8 weeks. — [Electron releases search results](https://releases.electronjs.org/), [endoflife.date](https://endoflife.date/electron)
- `utilityProcess.fork(modulePath, args, options)` creates a child with Node.js and message ports enabled, launched via Chromium's Services API; it is the Electron analogue of `child_process.fork`. Only callable after `app` ready. Options include `env`, `execArgv`, `cwd`, `stdio` (stdin must be `ignore`), `serviceName` (shows in app metrics). — [Electron utilityProcess docs](https://www.electronjs.org/docs/latest/api/utility-process)
- Communication: main uses `child.postMessage(msg, [transfer])` and the `'message'` event; the child uses `process.parentPort`. MessagePortMain objects can be transferred to the child, so a renderer or other process can get a direct port. `'exit'` event gives the exit code; `child.pid` becomes undefined after exit; `kill()` ends it. An experimental `'error'` event reports V8 fatal errors with a diagnostic report. The docs describe no automatic restart (the supervisor must be written). — [Electron utilityProcess docs](https://www.electronjs.org/docs/latest/api/utility-process)
- Electron recommends utilityProcess over `child_process.fork` for crash-prone components and CPU-heavy tasks from the main process (as summarized from the process-model docs). Worker threads run in the same process with no separate memory space; a native crash in a worker would likely take down the whole process (the search summary labels this its own inference from the design). — [Electron process model](https://electronjs.org/docs/latest/tutorial/process-model), [Node.js concurrency models](https://nodejs.org/learn/concurrency/comparing-nodejs-concurrency-models)
- MessageChannelMain / MessagePortMain exist because the main process has no Blink integration; ports can be created in main and handed to renderers (`webContents.postMessage`) or utility processes so they talk directly without relaying through main. Ordinary `send`/`invoke` cannot transfer ports. The docs say direct ports avoid "performance overhead of relaying via the main process" but do not discuss transferable ArrayBuffers or structured-clone cost. — [Electron MessagePorts tutorial](https://www.electronjs.org/docs/latest/tutorial/message-ports)
- App-level events useful for supervision: `child-process-gone` (non-renderer processes; type includes Utility; reasons include crashed, oom, abnormal-exit, killed, launch-failed) and `render-process-gone`. `app.getAppMetrics()` returns CPU/memory per process (note: each call resets CPU measurement windows). `app.requestSingleInstanceLock()` prevents duplicate instances and emits `second-instance`. — [Electron app API](https://www.electronjs.org/docs/latest/api/app)
- A recent Electron PR fixed a crash when calling `utilityProcess.postMessage()` after the process exited, i.e. guard sends against dead children and keep Electron patched. — [Electron PR 53293](https://releases.electronjs.org/pr/53293)
- Crash reporting: `crashReporter.start({ uploadToServer: false })` collects minidumps locally in `app.getPath('crashDumps')` (can be changed with `app.setPath('crashDumps', ...)` before starting). Node child processes forked from main are monitored automatically; `utilityProcess` has no extra-parameter API (only `globalExtra` goes with its crashes). The file layout inside the dump dir is an implementation detail. — [Electron crashReporter docs](https://www.electronjs.org/docs/latest/api/crash-reporter)

### Inferences
- Recommended topology: Main (thin supervisor: tray, windows, settings, lifecycle) + `utilityProcess` "engine" (UDP ingest, processing, OSC/TUIO, HTTP/WebSocket server) + renderer(s) for operator UI and projection output. Main creates a `MessageChannelMain` and hands one port to the engine and one to each renderer, so point-cloud frames flow engine -> renderer without touching main.
- Optionally split a second utilityProcess for the web/WebSocket server so a UI-facing bug cannot disrupt 60 Hz output, or run each sensor driver in its own utility process if a native driver is used (blast radius = one sensor).
- Because a headless/tray mode still needs a "UI" for tablets, the engine process hosting the HTTP/WebSocket server means the web UI keeps working even if the Electron renderer window is closed or crashed. The engine package should also be runnable as a plain Node process (same code, no Electron) for tests and headless CI.
- Supervisor in main: listen to utility `'exit'` and app `'child-process-gone'`, restart with exponential backoff and a crash-loop cap, re-send sensor/profile config over the new port, show state in tray/UI. Also add a heartbeat (engine posts a tick every ~1 s; main restarts if missed N times) because a hung event loop does not emit `'exit'`.
- SharedArrayBuffer between utility process and renderer is not documented in the fetched pages; do not plan on it. Plain MessagePort postMessage with transferred `ArrayBuffer`s (Float32Array frames) is the documented-safe path; benchmark it for the 4-sensor load (tens of thousands of points/s per sensor at 10 Hz is small, roughly <1 MB/s per sensor). (Transferable behavior over Electron ports: training knowledge, unverified.)
- Keep the renderer fed with downsampled/decimated data at display rate (e.g., 30 Hz) rather than every packet.

### Gaps
- No authoritative benchmark found for MessagePort throughput/latency in Electron, nor confirmation that ArrayBuffer transfer is zero-copy across main/utility/renderer boundaries, nor SharedArrayBuffer support across Electron processes.
- Did not verify the exact current Electron stable patch beyond endoflife.date (45.3.1 as of 12 Nov 2026).
- Behavior of utilityProcess when running with no BrowserWindow open (headless/tray) was not specifically documented; Electron app stays alive with `window-all-closed` handler that does not quit (training knowledge, unverified).

## 2. Native code options for sensor drivers

### Takeaway
No source found argues for native code here. For UDP at ~10 Hz and tens of thousands of points/s, pure TypeScript `node:dgram` inside the utility process is sufficient and avoids ABI/packaging risk; native/Rust is only warranted for heavy processing (clustering) and should sit behind N-API with a fallback or in a sidecar.

### Cited Findings
- napi-rs builds Node-API addons in Rust; it depends on Node-API and requires Node 10+; async/threadsafe functions need N-API v4, BigInt v6; its table lists Windows x64/x86/arm64 and builds use `@napi-rs/cli` (`napi build --release`). Because it uses stable Node-API, binaries are not tied to a specific Node/Electron ABI (the page did not say this about Electron explicitly, and gave no license). — [napi-rs repository](https://github.com/napi-rs/napi-rs)
- Native addons for Electron must be rebuilt against Electron headers and unpacked from the asar archive (stated in a grandiose fork's README as general Electron guidance). — [@stagetimerio/grandiose via search results](https://github.com/streampunk/grandiose)
- Electron utility processes are described as the place for crash-prone components, which fits a native-addon-hosting process. — [Electron process model](https://electronjs.org/docs/latest/tutorial/process-model)

### Inferences
- Order of preference: (1) pure TS `node:dgram` ingest + TS/WASM processing; (2) if profiling shows hot spots, a Rust (napi-rs, Node-API so no per-Electron rebuild) or WASM module for the processing step only; (3) a sidecar `.exe` (e.g., Rust or C++ using Slamtec's SDK) launched and supervised by main, talking UDP/localhost or named pipe, if the vendor SDK is required. Sidecar gives the best crash isolation and avoids Electron ABI issues, at the cost of an extra supervised binary and signing it.
- Slamtec SDK licensing (rplidar_sdk is commonly BSD-2 but this was NOT verified here) and the S2E UDP protocol details belong to the sensor researcher.
- With Node-API addons, use prebuilt binaries per platform (prebuildify/napi-rs style) and add them to `asarUnpack`; do not depend on node-gyp toolchains on the deployment PC.

### Gaps
- Did not verify licenses of node-addon-api, cmake-js, prebuildify, @electron/rebuild, napi-rs (all believed permissive, training knowledge, unverified).
- No measurements of node:dgram packet-loss behavior on Windows at this rate; set a large `SO_RCVBUF` (via `socket.setRecvBufferSize`) is standard practice (training knowledge, unverified).

## 3. Robustness patterns (supervision, logging, config, memory, degradation)

### Takeaway
Electron provides the primitives (exit/child-process-gone events, local crash dumps, single-instance lock, app metrics) but no auto-restart; build a supervisor + heartbeat, per-sensor reconnect state machines, and a validated, atomically written, versioned config with backups and a safe mode.

### Cited Findings
- Detect child failure with `utilityProcess` `'exit'` and app `'child-process-gone'` (reasons crashed/oom/killed/launch-failed). — [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process), [Electron app](https://www.electronjs.org/docs/latest/api/app)
- Local-only crash dumps via `crashReporter.start({ uploadToServer: false })` into `app.getPath('crashDumps')`; renderers are only covered if the reporter starts before they are created. — [crashReporter docs](https://www.electronjs.org/docs/latest/api/crash-reporter)
- `app.getAppMetrics()` supplies per-process CPU/memory for health display and leak watch. — [Electron app](https://www.electronjs.org/docs/latest/api/app)
- Single-instance enforcement via `requestSingleInstanceLock()`. — [Electron app](https://www.electronjs.org/docs/latest/api/app)
- Companion (comparable app) uses a Vitest test setup and an `e2e` folder, and separates server, web UI, launcher and shared libs into packages. — [Companion repo](https://github.com/bitfocus/companion)

### Inferences
- Supervisor: restart engine with backoff (e.g., 0.5 s, 1, 2, 5 s, cap 30 s), crash-loop breaker (N crashes in M minutes -> start in safe mode: sensors disabled, last-known-good config, UI shows error).
- Heartbeat: engine -> main every 1 s with per-sensor stats (packets/s, last-scan age, dropped packets, frame processing ms p50/p99, RSS, event-loop lag via `perf_hooks.monitorEventLoopDelay`); main forwards to UI and raises alerts when stale.
- Per-sensor state machine (connecting / streaming / degraded / lost) with reconnect backoff and timers; one failed sensor only marks its coverage zone invalid; engine keeps outputting from the remaining sensors and flags zones with reduced coverage.
- Config: Zod/TypeBox/Ajv schema validation (all widely MIT/BSD, unverified here), write to temp file + fsync + rename (atomic), keep N rotating backups, `schemaVersion` with ordered migrations, on validation failure load last backup then fall back to safe mode. Per-venue profiles as separate files in `%ProgramData%` or userData.
- Logging: pino (MIT) or electron-log (MIT) with size/daily rotation in the engine process, separate log files per process (training knowledge, unverified licenses).
- 24/7 leak prevention: preallocate/reuse typed arrays for frames, bound all queues (drop oldest, never grow), avoid per-frame closures/objects in the hot path, expose RSS/heap in heartbeat, optionally scheduled engine restart in a maintenance window as belt-and-braces; soak-test with the sensor simulator.
- Use `powerSaveBlocker.start('prevent-display-sleep')` and OS power-plan settings during shows (training knowledge, unverified).

### Gaps
- No source fetched on pino/electron-log rotation specifics, atomic-write libraries (write-file-atomic), or memory-leak studies; recommendations above are engineering practice, not cited.

## 4. Windows deployment: packaging, autostart, firewall, signing, updates

### Takeaway
Use electron-builder with an NSIS per-machine installer; auto-start the app in the interactive user session (login item or a Task Scheduler "at logon" task) with Windows auto-login, not as a Windows Service, because services run in session 0 and cannot show UI. Code-sign (Azure Artifact/Trusted Signing is the cheapest path) but expect SmartScreen reputation to build over time regardless of EV/OV.

### Cited Findings
- Services run in session 0; since Vista they cannot directly interact with the user and Microsoft says interactive-service techniques should not be used in new code. The suggested pattern is a service plus a separate GUI app launched in the user session (e.g., via HKLM Run key) talking over IPC with ACLs. `NoInteractiveServices` defaults to 1. — [Microsoft Learn: Interactive Services](https://learn.microsoft.com/en-us/windows/win32/services/interactive-services)
- `app.setLoginItemSettings({ openAtLogin, path, args, enabled, name })` on Windows: `path` defaults to `process.execPath`, `enabled` toggles the startup-approved registry key (visible in Task Manager/Settings), `name` is the registry value name. With Squirrel, `path` should point to the stub launcher. — [Electron app API](https://www.electronjs.org/docs/latest/api/app)
- WinSW (Windows service wrapper) is MIT-licensed; services are defined in XML; 3.x is on the `v3` branch (stable 2.x releases, 3.x pre-releases); supports install/start/stop/restart, rolling logs; needs .NET Framework 4.6.1+ or a bundled native .NET 7 build. The page says nothing about session 0. — [WinSW repo](https://github.com/winsw/winsw)
- electron-builder NSIS configuration supports per-machine install, one-click mode, elevation, custom NSIS script with a `customInstall` macro, deleting app data on uninstall, offline installs and differential updates, run-after-finish (option names only; the page lacked detail). — [electron-builder NSIS](https://www.electron.build/nsis.html)
- electron-builder Windows signing: `win.sign.type` = `signtool` (default, .pfx or cert store), `hsm` (beta), `pkcs11` (beta), `azure` (beta, Azure Trusted Signing, any OS, needs AZURE_TENANT_ID/CLIENT_ID/CLIENT_SECRET and the "Trusted Signing Certificate Profile Signer" role, network access at build). OV vs EV: EV keys are hardware-bound and cannot be exported to a file; electron-builder's docs say EV "no longer earns SmartScreen reputation immediately" since 2024, so EV and OV are treated alike by SmartScreen. electron-updater rejects NSIS updates whose signer differs from `publisherName` (must be a full DN). — [electron-builder Windows code signing](https://www.electron.build/docs/features/code-signing/code-signing-win)
- Electron's docs describe Azure Artifact Signing (formerly Trusted Signing) as the cheapest option and a way to get rid of SmartScreen warnings, but availability is limited to developers in certain countries; electron-builder's docs are more cautious ("does not provide instant SmartScreen trust"). Microsoft Q&A threads (anecdotal, some AI-written) report that from about 26 Mar / 1 Apr 2026 new intermediate CAs for Trusted Signing caused SmartScreen "Unrecognized app" warnings again. — [Electron code signing](https://electronjs.org/docs/latest/tutorial/code-signing), [electron-builder code signing](https://www.electron.build/docs/features/code-signing/), [Microsoft Q&A: SmartScreen regression](https://learn.microsoft.com/en-us/answers/questions/5855708/trusted-signing-regression-in-smartscreen-reputati)

### Inferences
- Recommended start-up chain for a room server: Windows auto-login to a dedicated local account -> Task Scheduler task "At log on" (highest privileges not required; restart on failure, run only when user logged on) or `setLoginItemSettings` -> tray app starts engine headless (no window) and opens the projection window on the target display. The Task Scheduler option gives restart-on-failure and delay controls that login items lack; an optional tiny watchdog (second scheduled task or the app's own Run key) can relaunch the main app if it dies.
- A Windows Service (WinSW MIT / NSSM / node-windows) would only suit a headless engine-only sidecar with no GPU/window; it cannot own the projection window (session 0). If used, follow Microsoft's pattern: service engine + GUI in the user session via IPC. Simpler and recommended: no service. (NSSM license—public domain per training knowledge—and node-windows license unverified.)
- Firewall: create inbound rules in an NSIS `customInstall` macro (`netsh advfirewall firewall add rule ...` for the HTTP/WebSocket port, UDP sensor/OSC ports, mDNS UDP 5353) scoped to the Private profile and program path; remove on uninstall; the installer is per-machine so it has elevation. Also set the room network profile to Private. (Training knowledge, unverified; Microsoft firewall docs not fetched.)
- Show-day hardening: disable sleep/hibernate via `powercfg`, set Windows Update active hours/deferral or use group policy (needs admin; Home edition limited; use Pro/IoT Enterprise LTSC), disable notifications/Focus assist, hide taskbar. Not sourced.
- Offline updates: ship a versioned NSIS installer (and a profiles/config export) to install via USB; electron-updater can use a generic provider pointing at a local folder/share, but signer must match `publisherName`. Keep config outside the install dir so upgrades preserve venue profiles.
- Signing choice: if Azure Artifact Signing is available to the company's country/entity, use it with electron-builder `azure` type; otherwise OV (key on token/cloud HSM since 2023, training knowledge). For a handful of installs on managed venue PCs, SmartScreen is low impact (install via USB, unblock file, or Defender exclusion); don't pay for EV expecting instant reputation.
- Electron Forge was not researched; electron-builder was the only deployment tool verified (NSIS + auto-update + Azure signing).

### Gaps
- Not fetched: Task Scheduler docs, Windows Firewall/netsh docs, Windows Update/power policy docs, electron-builder auto-update/offline provider details, NSSM/node-windows licenses, Electron Forge makers (Squirrel/WiX), Azure Artifact Signing eligibility and pricing in the company's country.
- SmartScreen outcome with Artifact Signing is contested (Electron docs vs electron-builder docs vs anecdotal Microsoft Q&A).

## 5. Embedded web server and remote tablet UI

### Takeaway
Fastify, Hono and ws are all MIT and fine for proprietary use. uWebSockets.js is Apache-2.0 but is installed from GitHub tags rather than npm and is unnecessary at this scale. Companion and Open Stage Control demonstrate the Node-server-plus-browser-UI model.

### Cited Findings
- Fastify: MIT, "Copyright (c) 2016-present The Fastify team". — [Fastify LICENSE](https://raw.githubusercontent.com/fastify/fastify/main/LICENSE)
- Hono: MIT, "Copyright (c) 2021-present Yusuke Wada and Hono contributors". — [Hono LICENSE](https://raw.githubusercontent.com/honojs/hono/main/LICENSE)
- ws: MIT license (Einar Otto Stangvik, Arnout Kazemier, Luigi Pinca). — [ws LICENSE](https://raw.githubusercontent.com/websockets/ws/master/LICENSE)
- bonjour-service (mDNS): MIT (ON LX Limited; portions Thomas Watson Steen). — [bonjour-service LICENSE](https://raw.githubusercontent.com/onlxltd/bonjour-service/master/LICENSE)
- uWebSockets.js: Apache-2.0 for source with explicit notice; distributed from GitHub tags (`npm install uNetworking/uWebSockets.js#v20.70.0`), not the npm registry; page states "Intellectual property, all rights reserved"; no statement about Electron/ABI or Windows binaries. — [uWebSockets.js repo](https://github.com/uNetworking/uWebSockets.js)
- Bitfocus Companion: MIT license (Copyright 2018 Bitfocus AS; contributor CLA for core), Node.js + TypeScript monorepo with separate `companion` (server), `webui`, `launcher`, `launcher-ui`, `shared-lib`, `satellite-protocol`, `e2e` folders, Vitest, Storybook, Docker image; 700+ connection modules. — [Companion LICENSE.md](https://raw.githubusercontent.com/bitfocus/companion/main/LICENSE.md), [Companion repo](https://github.com/bitfocus/companion), [Companion DEVELOPER.md](https://raw.githubusercontent.com/bitfocus/companion/main/DEVELOPER.md)
- Open Stage Control: "Libre and modular OSC / MIDI controller"; GPLv3 (GitLab project page on Framagit lists GNU GPLv3); GitHub repo is archived and moved to framagit. Copyleft: learn-from only. — [Open Stage Control (framagit)](https://framagit.org/jean-emmanuel/open-stage-control), [GitHub mirror](https://github.com/jean-emmanuel/open-stage-control)

### Inferences
- Use Fastify (or Hono on `@hono/node-server`) for static SPA + REST/token pairing, `ws` for the realtime socket; serve the same built SPA to the Electron window (via `http://127.0.0.1:port`, or file/custom protocol) and to LAN browsers. Fastify pairs with a plugin ecosystem (static, rate-limit); verify each plugin's license before use.
- Discovery: show the LAN URL + QR code in the tray/UI, optionally advertise `_http._tcp` via bonjour-service. mDNS can be blocked on some venue networks, so the QR/IP must remain primary.
- Security for LAN tool: random PIN displayed on the server UI to pair, issue a signed token stored in the tablet, one "operator lock" (editor) with others read-only, server-authoritative state with versioned patches (Immer patches or JSON Patch RFC 6902) over WebSocket; clients send intents, server validates against the schema and broadcasts patches. (Design recommendations, not sourced.)
- Binding the server to LAN interfaces needs a firewall rule; expose only the HTTP port; keep OSC output destinations configurable.
- uWebSockets.js is not needed for a few clients and brings GitHub-tag install, native-binary and Electron compatibility risk.

### Gaps
- Could not retrieve Open Stage Control architecture (headless `--no-gui` mode, libraries) or Companion's module process model/launcher/tray details (fetched pages were navigation-only); the Companion developer docs at companion.free/for-developers/ were not fetched.
- Immer and JSON-patch library licenses (Immer is MIT per training knowledge) not verified. Chataigne (licensed GPL per training knowledge) not researched.

## 6. Frontend stack, rendering and UI libraries

### Takeaway
No sources were gathered on this topic in the available budget.

### Cited Findings
- None retrieved.

### Inferences
- (Training knowledge, unverified; check before adopting) React or Solid/Svelte are all viable; React has the largest ecosystem of dense-tool UI kits (e.g., Radix/shadcn-style components are MIT). For 4 point clouds at 10-60 Hz, Canvas2D is enough for tens of thousands of points on desktop but WebGL (PixiJS MIT, regl MIT) is safer on mobile Safari; render from typed arrays and cap tablet frame rate. Operator tablets can receive downsampled data from the server.
- Keep the engine-to-UI protocol binary (typed arrays over WebSocket/MessagePort) rather than JSON for point data.

### Gaps
- Entire topic unresearched: benchmarks for Canvas2D vs WebGL on mobile Safari/Chrome, PixiJS/regl/three.js licenses and versions, UI kit licenses (e.g., Mantine/Radix/shadcn/Konsta), React vs Svelte vs Solid for touch tools.

## 7. Projection output window and Spout/NDI

### Takeaway
A dedicated frameless fullscreen BrowserWindow is the standard approach, but nothing authoritative was gathered on the `screen` API specifics. NDI Node bindings exist but with unclear licensing; no Spout binding was found.

### Cited Findings
- Electron's app can be switched to software rendering with `app.disableHardwareAcceleration()` before ready (not recommended for a WebGL output); `app.getAppMetrics()` includes GPU process stats. — [Electron app API](https://www.electronjs.org/docs/latest/api/app)
- NDI Node bindings: original `grandiose` (Streampunk) not updated since 2023 with missing send functionality; `Grandi` is a TypeScript rewrite for NDI 6 bundling the native addon and NDI SDK runtime per platform; a `@stagetimerio/grandiose` fork finds/receives/sends and documents Electron rebuild/asar-unpack guidance; one grandiose-family package (grandiose-mac) lists Apache-2.0; NewTek's include files MIT, but the NDI SDK library files are under the NDI SDK license; `vygr-labs/ndi-node` is GPL-3.0 (copyleft, avoid). — [grandiose search results](https://github.com/streampunk/grandiose), [ndi-node](https://github.com/vygr-labs/ndi-node), [NDI license](https://docs.ndi.video/all/using-ndi/ndi-tools/installing-ndi-tools/software-license-agreement)

### Inferences
- Use `screen.getAllDisplays()`/`display-added`/`display-removed` events to pin the output window to the 3840x2400 display, `frame:false`, `fullscreen`/kiosk, `alwaysOnTop`, `show:false` until ready, and reposition on display changes (training knowledge, unverified here). Treat the 2x2 split as a CSS/canvas layout concern (four 1920x1200 quadrants) inside one window.
- Spout/NDI sharing is optional; NDI's SDK license must be reviewed for redistribution in a commercial installer. Offscreen rendering (`paint` event with `offscreen: true`) is the usual way to get frames out but is CPU-heavy at 4K (training knowledge, unverified). OSC/TUIO already covers the main data output.

### Gaps
- Not researched: Electron `screen` API details, multi-display DPI scaling, kiosk behavior, Spout bindings and licenses (none found), NDI redistribution terms.

## 8. Repository, tooling, testing, CI, and driver abstraction

### Takeaway
Companion's repo layout (separate server, web UI, launcher, shared libs, e2e, Vitest) is a good model; remaining tooling choices (pnpm, electron-vite, Playwright for Electron, Windows CI, record/playback, plugin interface) were not researched and are recommendations only.

### Cited Findings
- Companion uses Vitest for unit tests, ESLint/Prettier with husky + lint-staged, `yarn check-types`, Storybook for web UI components, and Docusaurus for docs. — [Companion DEVELOPER.md](https://raw.githubusercontent.com/bitfocus/companion/main/DEVELOPER.md)
- Companion's repo has `satellite-protocol` and `shared-lib` packages and "module" connections (700+) developed via a `module-local-dev` folder, i.e. a plugin model with a shared protocol/types package. — [Companion repo](https://github.com/bitfocus/companion)

### Inferences
- Suggested packages: `core` (pure TS engine: scan parsing, background subtraction, clustering, tracking, filters; no Electron or Node-only APIs where possible), `drivers/*` (one package per sensor, implementing a small `SensorDriver` interface: `start/stop`, `events: scan | status | error`, `capabilities`, config schema), `protocol` (shared types/zod schemas), `server` (HTTP/WS/OSC), `ui` (SPA), `app` (Electron main/preload, supervisor), `sim` (simulator + recorded-scan player).
- Deterministic regression: record raw UDP datagrams or decoded scans with timestamps to a file, replay via a `ReplayDriver` that satisfies the same interface; run in Vitest headless; same driver used by the simulator for UI development and soak tests. Playwright's Electron support and GitHub Actions `windows-latest` runners are standard (training knowledge, unverified).

### Gaps
- Not researched or verified: pnpm workspaces specifics, electron-vite vs Vite + Forge, Playwright `_electron` support, Windows CI cost/behavior, plugin-interface patterns from other projects, Hokuyo/other RPLIDAR protocol differences.
