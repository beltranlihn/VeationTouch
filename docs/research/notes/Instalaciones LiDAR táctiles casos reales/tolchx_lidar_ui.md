# tolchx.com/lidar-ui ("Lidar Tracker UI" / "LIDAR Visualization System")

Method note: tolchx.com is a React SPA (Vite bundle), so plain fetch returns an empty shell. Content was read by rendering the page in a browser and from the public JS bundle. Videos (video_1/2/3.mp4) were not viewed; they are described only by the on-page captions. The installer (.exe), the Patreon tiers and the Lemon Squeezy checkout were not opened.

## What does lidar-ui do? Sensors? Use case?

### Takeaway
Lidar-ui is a closed-source, commercial Windows app ("Lidar Tracker UI", v1.4.3) sold at $20/month. It reads one 2D LiDAR, tracks blobs (people or hands) and sends the tracks out via OSC, TUIO, WebSocket and Spout. It supports RPLIDAR A1/A2/A3/C1/S1/S2/S3 over USB and Hokuyo UST-10LX/20LX over Ethernet. Its main use is interactive floors and walls (a catalog of 110+ games), not specifically a calibrated touch wall.

### Cited Findings
- The page describes it as software that turns a physical space into an interactive surface, detecting people or objects to control visuals, games and apps "without touching anything" — [lidar-ui](https://tolchx.com/lidar-ui/)
- The installer is "Lidar Tracker UI" for Windows x64, version 1.4.3 — [lidar-ui](https://tolchx.com/lidar-ui/)
- Sensor claim: "Slamtec RPLidar (A1, A2, A3, C1, S1, S2, S3) and Hokuyo (UST-10LX/20LX Ethernet SCIP 2.0) via a native high-performance C++ addon". The data-flow diagram says "RPLidar USB / Hokuyo Ethernet". The S2E (Ethernet/UDP) is not named; "S2" and "S3" are. — [lidar-ui](https://tolchx.com/lidar-ui/)
- Use cases listed: interactive games on walls or floors, retail/kiosks (contactless swipe and virtual cursor in shop windows), art installations, and mapping/analytics of people in a space — [lidar-ui](https://tolchx.com/lidar-ui/)
- Companion catalog of 110+ experiences/games: the filter shows 48 listed, 36 floor, 10 wall, 2 table, 0 3D. The catalog has web demos, a PDF export and a "quote" button — [catalogo-lidar](https://tolchx.com/catalogo-lidar)
- Real-world mention: portfolio entry "BBVA Inmersivo" (2024, Ezeiza airport, Argentina). The author's role is "Developer Software", with "real-time motion capture and interactive Lidar screen". The tags are Kinect and Lidar. It is not stated that this installation uses lidar-ui itself — [site JS bundle](https://tolchx.com/assets/index-iyxRaMW3.js)
- The author's workshop (July 2026, $50 USD) covers "LIDAR SLAMTEC (large-scale tracking)", "success cases (Naturaleza Sintética and LED cubes)", and an AI-agent workflow for "Lidar apps" — [site JS bundle](https://tolchx.com/assets/index-iyxRaMW3.js)

### Inferences
- The product is aimed at artists, VJs and event installers who want a quick floor/wall game setup, not at a multi-wall room with per-wall calibration.
- RPLIDAR S2E support is plausible, since the A/C/S series share the Slamtec SDK, but the page does not confirm UDP/Ethernet for Slamtec. Only Hokuyo is listed as Ethernet.

### Gaps
- Whether Slamtec Ethernet models (S2E, S3 Ethernet) are supported is not stated.
- Videos were not watched, so the quality of the calibration and tracking demos is unverified.

## Tech stack and architecture

### Takeaway
Stack: C++ native addon feeding a Node.js (Express) server, with a Three.js web UI, packaged as an Electron desktop app. It uses a Blob Tracker for clustering and tracking. Outputs are WebSocket, UDP, OSC and TUIO, plus Spout (mentioned in the trial copy).

### Cited Findings
- Data architecture on the page: Hardware (RPLidar USB / Hokuyo Ethernet) → Backend (C++ Addon → Node.js Server) → Processing (Blob Tracker: grouping and tracking) → Output (WebSocket / UDP / OSC / TUIO) — [lidar-ui](https://tolchx.com/lidar-ui/)
- Technologies listed: Node.js, C++, Three.js, WebSocket, OSC/TUIO, Express, Electron — [lidar-ui](https://tolchx.com/lidar-ui/)
- The 7-day trial promises "calibration, interactives, multitouch tracking, Spout and OSC" — [lidar-ui](https://tolchx.com/lidar-ui/)
- Integrations named: TouchDesigner, Max/MSP, Unity, Unreal, "any web software" — [lidar-ui](https://tolchx.com/lidar-ui/)
- Licensing and updates run through the app: Patreon login (a free Patreon account is enough for the trial), or Lemon Squeezy checkout with an emailed serial and activation code. Automatic updates are advertised — [lidar-ui](https://tolchx.com/lidar-ui/)
- The site backend exposes lidar endpoints (access requests, downloads, users, sessions, funnel stats), so the author tracks the sales funnel and users — [site JS bundle](https://tolchx.com/assets/index-iyxRaMW3.js)

### Inferences
- A C++ addon plus Node server is the same shape we plan (native or SDK reader feeding a TypeScript core), so it validates Electron + Node as viable for 10 Hz 2D LiDAR.
- The web UI is served by an Express server, which is also how the "remote control panel" works (see below).

### Gaps
- No architecture documentation, SDK version, scan-rate handling, threading model or Spout implementation details are public.
- Whether the C++ addon wraps the Slamtec SDK (BSD-2 licensed) or a custom driver is unknown.

## Features (calibration, zones, filtering, multi-sensor, UI, remote, presets)

### Takeaway
The features claimed are gesture calibration (touch the 4 corners), a persistent-ID blob tracker with up to 98% data reduction, a 3D point-cloud UI with an area selector, and a remote control panel. Multi-sensor support, zones/masks and presets are not documented.

### Cited Findings
- Blob Tracker: detection and tracking of objects/people with persistent IDs, velocity, trajectory, and "data reduction up to 98%" — [lidar-ui](https://tolchx.com/lidar-ui/)
- Automatic gesture calibration: the ROI (interaction zone) is set by detecting proximity at the 4 screen corners. The demo caption says the user only touches the 4 corners — [lidar-ui](https://tolchx.com/lidar-ui/)
- Web 3D UI (Three.js): real-time point cloud, interactive area selector and remote control panel — [lidar-ui](https://tolchx.com/lidar-ui/)
- Page videos: calibration example, "real interaction" (a wall responding to user position with generative visuals), and tracking/detection (blob tracker filtering noise and assigning IDs). The files are video_1, video_2 and video_3 under tolchx.com/videos/lidar/ — [lidar-ui](https://tolchx.com/lidar-ui/)
- Gestures mentioned: Swipe and Virtual Cursor for contactless catalog browsing — [lidar-ui](https://tolchx.com/lidar-ui/)
- Hardware accessory: a 3D-printable sun-shield housing with a 1/4" tripod nut, for Slamtec C1 and similar, sold on Cults3D. It is meant for outdoor or direct-light installs — [lidar-ui](https://tolchx.com/lidar-ui/); [Cults3D model](https://cults3d.com/es/modelo-3d/variado/carcaza-lidar-c1)
- Plans: Free trial 7 days ($0) and Pro $20/month. The plan page says calibration and multitouch are part of the access. The Pro plan adds updates and a private community — [lidar-ui](https://tolchx.com/lidar-ui/)

### Inferences
- Four-corner gesture calibration is a good UX idea: no tools, one person, ~seconds. It maps a single ROI (effectively an axis-aligned/affine calibration) to one screen, with no evidence of per-wall, multi-sensor or rotation/keystone handling.
- "Data reduction 98%" suggests that sending blobs instead of raw points is the central design choice.

### Gaps
- No evidence of multi-sensor merging, trigger zones/masks, smoothing/interpolation parameters, presets or phone-based calibration.
- No UI screenshots could be described in detail (only text was read).

## Installations, lessons and limitations

### Takeaway
Little is public. The only named installation is a BBVA project at Ezeiza airport (2024), and no limitations are written up. The only environmental lesson is a sunlight shield for outdoor/bright installs.

### Cited Findings
- BBVA Inmersivo (2024): airport installation with motion capture and an interactive lidar screen; role "Developer Software" — [site JS bundle](https://tolchx.com/assets/index-iyxRaMW3.js)
- Sunlight can disturb scanning, so a visor housing is sold to "improve scan stability" — [lidar-ui](https://tolchx.com/lidar-ui/)
- Trial and subscription terms are in [tolchx.com/terms](https://tolchx.com/terms) (not read)

### Inferences
- The product is mostly distributed to creative practitioners (Patreon-based), so field lessons are probably in the author's YouTube tutorials and workshop, which were not reviewed.

### Gaps
- No case study, accuracy figures, latency figures or limitations section found. The YouTube channel (youtube.com/@tolchdesign) and the research page (tolchx.com/research) were not checked.

## Source code, license, author and contact

### Takeaway
No public source for lidar-ui. It is proprietary, distributed as a Windows .exe via Google Drive, with a paid subscription, so nothing can be reused as code. The author is "Tolch", a Buenos Aires audiovisual artist and technical director.

### Cited Findings
- Distribution: Google Drive folder with the .exe, Patreon at patreon.com/cw/LidarTracker, Lemon Squeezy checkout — [lidar-ui](https://tolchx.com/lidar-ui/)
- GitHub account github.com/tolchx has about 35 repos (TouchDesigner tools, MCP servers, Kinect calibration, etc.). None is named lidar or lidar-ui, and the GitHub search for "lidar" under that user returned 0 results — [GitHub API listing of tolchx repos](https://api.github.com/users/tolchx/repos?per_page=100)
- Repo licenses: LTX-2.5_Dashboard is MIT; Luminosity_2026 is GPL-3.0; most others have no license set. None is lidar-related — [GitHub API listing of tolchx repos](https://api.github.com/users/tolchx/repos?per_page=100)
- Author: "Tolch", audiovisual artist and technical director from Buenos Aires, with systems-engineering and multimedia-arts studies (UNA). He is a VJ for well-known electronic acts and is active in TouchDesigner, Unreal and LiDAR sensors. The real name is not published on the bio page — [bio](https://tolchx.com/bio)
- Public contact: mailto tolchx.prod@gmail.com and ixp.visuals@gmail.com (page footer), Instagram @tolch.x, YouTube @tolchdesign, manual access request form at tolchx.com/lidar-ui/solicitar-acceso — [lidar-ui](https://tolchx.com/lidar-ui/)
- No contact has been made.

### Inferences
- Treat as unlicensed/proprietary: no LICENSE file exists, so no code, UI or calibration logic may be reused. Only ideas can be taken.

### Gaps
- No LICENSE file exists to read. The EULA/terms page content was not read.

## What to adopt and what to do differently

### Takeaway
Adopt the product ideas (zero-friction calibration, blob-only output, Three.js point-cloud view, remote web panel, multi-protocol output). Do differently what it does not address: multi-wall rooms, S2E UDP, per-wall calibration and phone-based calibration.

### Cited Findings
- (See the sections above for the underlying evidence.)

### Inferences
- Adopt: (1) a calibration by touching corners/points that needs no extra tools, extended to N points for homography; (2) tracking output with persistent IDs, velocity and trajectory instead of raw points; (3) OSC + TUIO + WebSocket (+ Spout optional) as a standard output set; (4) a Three.js/web point-cloud viewer served over HTTP, which makes the remote/phone UI nearly free; (5) a sun shield and 1/4" mount as a hardware recommendation for bright rooms; (6) a free trial with activation inside the app as a distribution model.
- Do differently: (1) first-class Slamtec Ethernet (S2E, UDP) and multiple simultaneous sensors, one per wall, with a wall-to-pixel mapping into one 3840x2400 canvas split 2x2; (2) explicit room/wall calibration model (sensor → wall → projection pixels) rather than one ROI; (3) trigger zones, masks, filtering/smoothing/interpolation as visible, saved presets; (4) calibration from a phone/tablet inside the room; (5) publish diagnostics (per-sensor health, latency); (6) avoid a single-vendor Patreon dependency for licensing.
- Reuse: none as code. Reimplementing from ideas is safe; check Slamtec SDK (BSD-2) and any OSC/TUIO libraries' licenses independently.

### Gaps
- Real performance (latency, accuracy, multi-person limits) is unknown without testing the trial build. Testing the free trial would require downloading an untrusted installer and a Patreon login, so it was not done.
