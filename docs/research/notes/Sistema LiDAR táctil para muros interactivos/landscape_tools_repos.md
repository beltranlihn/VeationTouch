# Landscape of LiDAR touch-wall tools and reusable open-source building blocks

Research date: 2026-11-14. Roughly 25 tool calls, mostly search snippets, registry JSON and GitHub API metadata. Licenses below come from npm registry metadata or the GitHub API license field, not from LICENSE files read directly. Exceptions are marked. Where the two disagree or the field is null, the license is marked "unclear" and must be checked in the LICENSE file before adoption.

## 1. Commercial and professional tools for LiDAR touch walls (features, calibration, UX, weaknesses)

### Takeaway
The market is fragmented. The closest direct competitors are Laser's Track (Hokuyo only, TUIO/OSC/Windows Touch, a tidy 4-step workflow), Modulo Kinetic (a full media server with a 2D LiDAR node graph, RPLIDAR S3 included), Augmenta (a fusion platform, Hokuyo UST-10LX documented), Slamtec's own RPLIDAR Interactive Toolkit (TUIO) and the TouchDesigner community components. Nobody found offers a phone/tablet calibration UI, multi-wall venue profiles and health monitoring together. That is the gap for Alma.

### Cited Findings

**Laser's Track (paid, Windows)**
- Fuses one or more Hokuyo UST/URG lasers into a single tracking surface, with stable contact IDs in millimetres, auto-reconnect and a frozen-sensor watchdog. — [Laser's Track](https://laserstrack.pages.dev/)
- Four-step workflow: (1) define each screen's resolution, physical size and rotation and assign sensors; (2) pick a source, set each sensor's pose, connect, and drag it into position in a World view; (3) draw inclusion/exclusion rectangles per sensor; (4) enable outputs. — [Laser's Track](https://laserstrack.pages.dev/)
- Outputs: Windows Touch injection, TUIO 1.1 (/tuio/2Dcur over UDP) and configurable raw OSC (screen index, position, velocity, width). — [Laser's Track](https://laserstrack.pages.dev/)
- Multi-sensor: detections from several lasers merge into one world-space contact, so a finger seen by two sensors counts once. — [Laser's Track](https://laserstrack.pages.dev/)
- Supports UST-10/20/30LX (Ethernet) and URG-04LX/UTM-30LX (USB), a built-in Simulator, per-sensor min/max range and zones to remove reflections. No RPLIDAR support is listed. — [Laser's Track](https://laserstrack.pages.dev/)
- Pricing: free demo with 20-minute sessions; 200 USDT per month per machine; 2000 USDT perpetual per machine; payment is in USDT on Tron. — [Laser's Track](https://laserstrack.pages.dev/)

**Augmenta (augmenta.tech)**
- Legacy setup guide: supports 3D cameras (Orbbec Astra Pro, Kinect Azure) and lidars (Hokuyo UST-10LX and UST-10LX-H01). RPLIDAR is not listed in this guide. — [Augmenta legacy guide](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)
- Architecture: per-sensor Nodes send OSC over the LAN to AugmentaFusion, which merges them into one scene. Overlapping detections are fused. — [Augmenta legacy guide](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)
- Calibration: enter scene size in metres and output resolution, add nodes as sources, then run a "two-point calibration". You place an object, align the source transformer and anchor, move the object to the opposite side, then rotate and scale the source to match. A Spout video output is used to see the result; without video, calibrate by measuring coordinates by hand. — [Augmenta legacy guide](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)
- Per-node panels are Input, Background, Processing and Output. The guide advises disabling the background for long-term installs and masking regions outside the interactive area. — [Augmenta legacy guide](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)
- Augmenta is listed as a tracking partner for immersive environments by Smode. — [Smode partner page](https://smode.io/en/tech-partners/tracking-solution-immersive-environments)
- The guide does not mention TUIO or WebSocket output, a zone editor, or licensing. This is the legacy guide, so the current product may differ.

**Modulo Kinetic (Modulo Pi media server)**
- The manual has a dedicated "Interactivity with 2D LiDARs" topic. Listed 2D sensors: Hokuyo UST-10LX/UST-20LX, Leuze ROD 4, Slamtec RPLIDAR S3, SICK TiM-561. — [Modulo Kinetic v6 manual](https://support.modulo-pi.com/modulo-kinetic-manual/v6/en/topic/interactivity-with-2d-lidars)
- Graph nodes named in the manual menu: Calibration 2D, Merge Tracking 2D, Trigger Area, Kalman, Filter Array. Contents of these nodes were not read. The 145k-character page was only partly fetched. — [same](https://support.modulo-pi.com/modulo-kinetic-manual/v6/en/topic/interactivity-with-2d-lidars)
- There is also a 2D+3D LiDAR application note. — [Modulo Kinetic v5 manual](https://support.modulo-pi.com/modulo-kinetic-manual/v5/en/topic/interactivity-with-2d-and-3d-lidars)
- A dongle-based license is mentioned in the manual menu. Price is not documented in what was read.

**Slamtec RPLIDAR Interactive Toolkit / multi-touch demo**
- Slamtec publishes a guide on building a multi-touch application with RPLIDAR (multitouch server, calibration tool, client) and an "RPLIDAR Interactive Toolkit" manual (V1.1) described as supporting multi-touch and TUIO output. — [Slamtec news](https://www.slamtec.com/en/news/detail/857), [Toolkit manual PDF](https://wiki.slamtec.com/download/attachments/83066883/RPLIDAR%20Interactive%20Toolkit%20Instruction%20Manual%20-%20V1.1.pdf?api=v2)
- I could not fetch the PDF (timeout), so the calibration steps, price and platform are not verified. Distribution appears to be a downloadable package, not a GitHub repo (from search snippet only).

**TouchDesigner**
- Native Hokuyo CHOP covers serial and Ethernet Hokuyo scanners. Derivative tested only URG-04LX-UG01, UST-10LX and UST-20LX. — [Hokuyo CHOP](https://docs.derivative.ca/Hokuyo_CHOP)
- No native RPLIDAR support. Users rely on a community C++ CHOP (A1/A2/A3/S1/S2/S3 and network S2E mentioned). Forum users asked for a native CHOP and reported mixed stability, including an S2 at 1,000,000 baud that would not connect. — [Derivative asset page](https://derivative.ca/community-post/asset/slamtec-rplidar-support/67156), [forum thread](https://forum.derivative.ca/t/slamtec-rplidar-support-2023-05-19-10-58/344383?page=2)
- The 2025 update for Slamtec LiDAR in TouchDesigner is documented here. — [alltd.org](https://alltd.org/?p=43917)
- LidarTracker v3.0 (Zink/FifthChat, C++ CHOP component) supports Hokuyo, Slamtec, EAI and SIMINICS, with multiple lidars merged, multiple touch areas, a trigger range, a calibration by dragging four points for the scan range, and UDP or TUIO output. It needs TouchDesigner 2022 or later. License is not stated on the page; the original was posted July 2020 as beta, v3.0 in Sept 2022. — [LidarTracker](https://derivative.ca/community-post/asset/lidar-component-lidartracker), [v3.0](https://derivative.ca/community-post/asset/lidar-component-lidartracker-v30/66632)

**Ars Electronica Futurelab "pharus"**
- Built by Otto Naderer at the Futurelab. It uses one or more 2D laser rangefinders and tracks visitors in Deep Space 8K, with up to 30 people at once. — [Futurelab pharus listing](https://ars.electronica.art/futurelab/en/tag/pharus), [Deep Space 8K](https://ars.electronica.art/center/en/deepspace-interactive)
- I found no public pharus repository. The PIE Hagenberg UnityTrackingClient consumes its TUIO-style data (including per-player feet) and is the only public client; its license is CC-BY-SA-4.0 (GitHub API), which is not suitable for code reuse. — [UnityTrackingClient](https://github.com/Playful-Interactive-Environments/UnityTrackingClient)
- The Futurelab's open-source mozXR framework (Unreal, Unity, TouchDesigner) was announced for March 2026. I did not confirm that it shipped or that it supports pharus. — [Futurelab](https://ars.electronica.art/futurelab/?p=32759) (search snippet only)

**Other**
- Radar Touch / interactive wall integrators (KL Multimedia) use RPLIDAR-style hardware. — [KL Multimedia](https://www.klmultimedia.com/radar-touch.html) (page not read)

### Inferences
- UX patterns worth adopting: Laser's Track's linear 4-step flow; a World view with draggable sensor poses; include/exclude rectangles per sensor; a built-in simulator; a watchdog for frozen sensors; Augmenta's two-point calibration verified by live video output; LidarTracker's four-point scan-range drag.
- Weaknesses to exploit: no RPLIDAR-first standalone tool, no remote/phone calibration, TouchDesigner dependence with unstable community plugins, a USDT-only payment model for Laser's Track, and a Modulo Kinetic dependence on a full media server and dongle.
- Because RPLIDAR S2E is network-based, a rare feature among the tools found (Hokuyo UST is the typical Ethernet device), the S2E in particular makes an Ethernet-first, offline-LAN design a differentiator.

### Gaps
- Lightact: no search result mentioned any LiDAR integration. Unconfirmed either way.
- disguise, Pixera, Notch: no evidence of native LiDAR touch support found. Unconfirmed.
- MotionMagix, Lumo Play: not researched in the searches done, so no data.
- Hokuyo's own touch tools: not found.
- Augmenta current (non-legacy) docs, pricing and RPLIDAR support: not verified. Modulo Kinetic pricing and calibration steps: not read. Slamtec toolkit calibration steps: PDF fetch timed out.
- User-reported limitations beyond the TouchDesigner forum: not found.

## 2. Feature checklist for a professional LiDAR calibration/tracking tool

### Takeaway
Synthesised from the tools above, a professional tool needs the capabilities listed below. Each is traceable to at least one tool.

### Cited Findings
- Per-screen/surface definition (resolution, physical size, rotation) with sensors assigned to surfaces. — [Laser's Track](https://laserstrack.pages.dev/)
- Visual sensor pose placement in a world view; two-point or four-point calibration. — [Laser's Track](https://laserstrack.pages.dev/), [Augmenta](https://augmenta.gitbook.io/legacy-augmenta-setup-guide), [LidarTracker](https://derivative.ca/community-post/asset/lidar-component-lidartracker)
- Background capture or removal, with the option to disable it for long-term installs. — [Augmenta](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)
- Masks and inclusion/exclusion zones, plus min/max range per sensor. — [Laser's Track](https://laserstrack.pages.dev/), [Augmenta](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)
- Multi-sensor merge with de-duplication. — [Laser's Track](https://laserstrack.pages.dev/), [Modulo](https://support.modulo-pi.com/modulo-kinetic-manual/v6/en/topic/interactivity-with-2d-lidars)
- Trigger areas and Kalman/array filters. — [Modulo](https://support.modulo-pi.com/modulo-kinetic-manual/v6/en/topic/interactivity-with-2d-lidars)
- Simulator, auto-reconnect and frozen-sensor watchdog, stable IDs. — [Laser's Track](https://laserstrack.pages.dev/)
- Multiple outputs: TUIO 1.1, raw OSC, Windows Touch, UDP. — [Laser's Track](https://laserstrack.pages.dev/), [LidarTracker](https://derivative.ca/community-post/asset/lidar-component-lidartracker)

### Inferences
- Items in Alma's brief that none of the tools above documented, and so are likely differentiators: recording and playback, presets/profiles per venue, remote/mobile calibration UI, health monitoring dashboard, output routing matrix, WebSocket output, RPLIDAR S2E native support.

### Gaps
- Whether the tools above offer recording/playback or per-venue profiles: not documented in the pages read.

## 3. Open-source repositories for LiDAR to touch / TUIO / OSC

### Takeaway
There is no maintained, permissively licensed LiDAR-to-TUIO bridge. The useful, legally safe asset is the Slamtec SDK (BSD-2-Clause per GitHub), plus learning from existing designs. The pharus code is not public.

### Cited Findings

| Repo | URL | License (source) | Last push / stars | Notes and reuse |
|---|---|---|---|---|
| slamtec/rplidar_sdk | https://github.com/slamtec/rplidar_sdk | BSD-2-Clause (GitHub API). A search snippet claimed GPLv3, so confirm in LICENSE | 2026-03-17; 592 stars; not archived | Official C++ SDK, supports S2E. Reusable via a native addon or by reimplementing the UDP/TCP protocol. Verify the LICENSE file. |
| thepelkus-too/SlamtecLidarTDCPPCHOP | https://github.com/thepelkus-too/SlamtecLidarTDCPPCHOP | MIT (GitHub API) | 2024-08-21; 27 stars | TouchDesigner C++ CHOP for RPLIDAR. Learn-from, low activity. |
| creativetechnologylab/LiDAR-Sensor | linked from https://lab.arts.ac.uk/books/projection-mapping/page/interactive-projections | unclear (not checked) | not checked | Reported to crash TouchDesigner and not to support C1. |
| mkalten/TUIO11_CPP | https://github.com/mkalten/TUIO11_CPP | LGPL-3.0 (GitHub API) | 2026-11-12; 33 stars | COPYLEFT (LGPL). Reference only. Do not link or port. |
| mkalten/TUIO11_JAVA, TUIO20_CPP | https://github.com/mkalten/TUIO11_JAVA, https://github.com/mkalten/TUIO20_CPP | LGPL (search snippets; LICENSE not read) | not checked | COPYLEFT. The TUIO 2.0 C++ library is partial. |
| mkalten/TUIO11_Simulator | https://github.com/mkalten/TUIO11_Simulator | GPL-2.0 per a third-party index only | not checked | COPYLEFT. Use as a test tool only. |
| fe9lix/Tuio.js | https://github.com/fe9lix/Tuio.js | GPL (npm `tuio` metadata); the GitHub repo also ships LICENSE-GPL | not checked | COPYLEFT, avoid. |
| Playful-Interactive-Environments/UnityTrackingClient | https://github.com/Playful-Interactive-Environments/UnityTrackingClient | CC-BY-SA-4.0 (GitHub API) | 2025-10-28; 4 stars | Copyleft-like (share-alike). Learn-from only; pharus client. |

Pharus (Ars Electronica Futurelab): closed, no public source found. See section 1.

Names searched without any hit: rplidar-tuio, lidar-touch, hokuyo-tuio, urg-tuio, ofxRPlidar, ofxHokuyo, ofxURG. These specific repos were not located, so absence is not proven. A "How to make an Interactive Video Wall using Slamtec Rplidar" C# repo (updated Sept 2020) appears on the GitHub topic page. License and TUIO output are not verified. — [GitHub topic slamtec-rplidar](https://www.github.com/topics/slamtec-rplidar)

### Inferences
- Writing our own TUIO 1.1 encoder on top of an OSC library avoids the LGPL/GPL TUIO libraries entirely. TUIO 1.1 is a small OSC profile (/tuio/2Dcur with set, alive, fseq messages).
- Mark the whole TUIO reference family as "do not link".

### Gaps
- LICENSE files were not read directly for any repo. The tool returned GitHub API metadata only.
- ofx*/Processing/Unity add-ons for Hokuyo and RPLIDAR were not located. They need a targeted GitHub search.

## 4. Reusable JS/TS building blocks (npm)

### Takeaway
There are permissive options for every needed block. The traps are `osc` (dual MIT OR GPL-2.0), the `tuio` npm package (GPL) and the TUIO reference libraries (LGPL).

### Cited Findings

| Package | Version | License (npm registry) | Repo | Notes |
|---|---|---|---|---|
| osc (osc.js) | 2.4.5 | (MIT OR GPL-2.0) | https://github.com/colinbdclark/osc.js | Dual license, so choose MIT. GitHub API reports GPL-2.0, last push 2024-08-20, 832 stars. Include the MIT election in the notices. Depends on serialport, which is heavy. |
| node-osc | 11.7.1 | Apache-2.0 | https://github.com/MylesBorins/node-osc | No runtime deps. Active (devDeps are current versions). UDP only. Recommended for OSC out. |
| osc-js | 2.4.1 | MIT | https://github.com/adzialocha/osc-js | Depends on ws. Supports UDP, WebSocket and bridge. GitHub API license field is null (inconclusive), last push 2026-08-05, 270 stars. |
| tuio (Tuio.js server) | 1.0.0 | GPL | https://github.com/fe9lix/Tuio.js | COPYLEFT, avoid. |
| munkres-js | 1.2.2 | Apache-2.0 OR BSD-3-Clause | https://github.com/addaleax/munkres-js | Hungarian assignment. Permissive. |
| 1eurofilter | 1.3.0 | BSD-3-Clause | https://github.com/casiez/OneEuroFilter | Reference implementation by Casiez, JS. GitHub API license field is null, so confirm LICENSE in the repo. |
| kalmanjs | 1.1.0 | MIT | https://github.com/wouterbulten/kalmanjs | 1D Kalman, simple. |
| density-clustering | 1.3.0 | MIT | https://github.com/LukaszKrawczyk/density-clustering | DBSCAN/OPTICS/K-means. |
| perspective-transform | 1.1.3 | MIT | https://github.com/jlouthan/perspective-transform | 4-point homography. |
| gl-matrix | 3.4.4 | MIT | https://github.com/toji/gl-matrix | Matrix and vector math. |
| ml-matrix | 6.15.1 | MIT | https://github.com/mljs/matrix | Needed for least-squares fits and SVD. |
| point-in-polygon | 1.1.0 | MIT | https://github.com/substack/point-in-polygon | Tiny. |
| bonjour-service | 1.4.4 | MIT | https://github.com/onlxltd/bonjour-service | mDNS publish/browse. |
| qrcode | 1.5.4 | MIT | https://github.com/soldair/node-qrcode | QR for the tablet URL. |

Last-release dates were not collected, so maintenance status is only partly known. Versions are the registry "latest" as fetched on 2026-11-14.

### Inferences
- A recommended minimal stack: node-osc (or osc-js if WebSocket bridging is wanted), a self-written TUIO 1.1 encoder, munkres-js, 1eurofilter, density-clustering, perspective-transform plus ml-matrix, point-in-polygon, bonjour-service, qrcode. All are MIT, Apache or BSD.
- munkres-js and kalmanjs are small and old, so vendoring them with a license notice is realistic if they go stale.

### Gaps
- Per-package last-publish dates and weekly downloads were not fetched.
- No TUIO 1.1 client/server JS library with a permissive license was verified. Not searched beyond Tuio.js.
- LICENSE text of the Casiez JS file was not read.

## 5. Open-source tracking/control servers with tablet UIs (patterns)

### Takeaway
All three are useful for patterns, but license status is unsettled for two of them. Treat all as learn-from only.

### Cited Findings
- Chataigne (benkuper/Chataigne): GPL-3.0 (GitHub API); last push 2026-11-12; 1709 stars. COPYLEFT, learn-from only. — [repo](https://github.com/benkuper/Chataigne)
- Bitfocus Companion (bitfocus/companion): GitHub API returns NOASSERTION, so the license is unclear. Secondary sources suggest MIT for parts, but that is unconfirmed. Last push 2026-11-14; 2367 stars. Its web UI is also served to tablets. — [repo](https://github.com/bitfocus/companion)
- Open Stage Control (jean-emmanuel/open-stage-control): the repo queried returned license null and is archived (last push 2026-09-23; 7 stars), so it appears to be a mirror. The original license was not verified and is unclear. It is an Electron/Node OSC controller that serves a web UI to browsers. — [repo queried](https://github.com/jean-emmanuel/open-stage-control)

### Inferences
- Patterns to copy: serve a responsive web UI from the Electron app on the LAN, announce via mDNS, show a QR code, keep the tablet UI stateless against a WebSocket state store.

### Gaps
- Real license text of Companion and Open Stage Control not verified. Treat as copyleft/unknown until read.
