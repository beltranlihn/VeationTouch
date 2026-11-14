# Real-world RPLIDAR interactive installations and how they were built (research notes, Nov 2026)

Overall finding: I found very few DOCUMENTED, named, venue-specific installations that used RPLIDAR (especially S2/S2E) for touch walls. What exists is (a) Slamtec's own Interactive Toolkit docs, (b) TouchDesigner/vvvv community plugins and forum threads, (c) small maker/academic projects, (d) vendor marketing for competing "interactive LiDAR" products. No YouTube making-of, Instructables or Hackster write-up for an RPLIDAR touch wall was found; searches for museum/festival case studies naming RPLIDAR returned nothing citable. Web search tool was US-only, and slamtec.com Chinese pages were not specifically reached.

## 1. Which installations/projects used RPLIDAR for interactive walls, floors, tables or immersive rooms?

### Takeaway
No named commercial installation with full specs (venue, studio, mounting height, wall distance) was found for any RPLIDAR model. The best documented cases are an academic room-scale lidar touch system (model unconfirmed), a hobby A1 floor projection, and a university lab TouchDesigner setup. Treat the "catalogue" below as thin.

### Cited Findings
- **ETRI/Korea, "Development of Touch Interface Using LIDAR for Multi-user Interactions in Projection-based VR" (IEEE ICTC 2022, Jeju, pp. 1783-1785).** Network of LIDAR distance sensors for touch on five surfaces (four walls + floor) of a large projection-VR room; tested single- and multi-user multi-touch; reports real-time feedback with minimal perceived delay. Authors: Hojin Lee, Sunghyun Kim, Seong-Won Ryu, Junseok Lee, Koo-Joo Kwon, Sukhyun Lim, Eun-Seok Lee. Sensor model, count, mounting and calibration NOT available (only abstract seen); do not assume RPLIDAR. Closest analogue to a 4-wall room. — [abstract via unpaywall](https://unpaywall.org/10.1109%2FICTC55196.2022.9952443); [authors, researchr](https://researchr.org/publication/LeeKRLKLL22)
- **LiTouch thesis (Politecnico di Milano).** Described in a search summary as a system where one or more lidars, each placed on a wall, scan points intersecting the video projections on the walls. I could not open the page (HTTP 403), so model, calibration and results are unverified. — [POLITesi record](https://www.politesi.polimi.it/handle/10589/173775)
- **"LiDAR as an input device", Hackaday.io project 181878 (hobbyist).** RPLIDAR A1 + Raspberry Pi 4 + Python for single-user floor projection (edutainment). Points grouped by angle proximity, each group averaged, converted to Cartesian and compared with predefined targets (about 3 deg / 25 units tolerance); a target activates after 3 scans. Cursor distance cutoff `dist < 750` (units unstated). Calibration "very rough and non-calibrated". Reported problems: jittery readings, occluding objects can't be tracked separately, Python rplidar library did not work well with current firmware under CPython, cursor needed smoothing (velocity/vector method). Replaced an ultrasonic array that had 1-2 s response. Mounting height/distance not given; licence not stated; project on hold. — [Hackaday project](https://hackaday.io/project/181878-lidar-as-an-input-device)
- **UAL Creative Technology Lab (University of the Arts London), "Interactive Projections".** Slamtec RPLidar (model unspecified) with TouchDesigner for position tracking in projections. Windows build: Visual Studio (not VS Code), repo SlamtecLidarTDCPPCHOP + rplidar_sdk, open `CPlusPlusCHOPExample.sln`; Mac/TD component via creativetechnologylab/LiDAR-Sensor with `LiDAR_Sensor.tox` (untested beyond author's machines). Only filtering tip: use a Transform TOP to mask walls/areas not to be monitored. Warns setup takes significant time. Mounting and calibration not covered. — [UAL page](https://lab.arts.ac.uk/books/projection-mapping/page/interactive-projections); repos: [SlamtecLidarTDCPPCHOP](https://github.com/thepelkus-too/SlamtecLidarTDCPPCHOP), [LiDAR-Sensor](https://github.com/creativetechnologylab/LiDAR-Sensor). Licences not checked.
- **alltd.org tutorials on RPLIDAR in TouchDesigner**: one uses an A1M8 with a GitHub repo and CPlusPlus CHOP to make "any surface" multi-touch; a 2025 update covers a "SlamtecCHOP" plugin, drivers, troubleshooting, mapping lidar to screen space. I could only see search-snippet summaries (page fetch returned an unrelated index), so details unverified. — [2018-era A1M8 tutorial](https://alltd.org/?p=24130); [2025 update](https://alltd.org/?p=43917); [Part II touchscreen video](https://alltd.org/?p=52053)
- **vvvv: VL.Devices.RPLidar (2024).** Node set returning measured points from one or more RPLidar devices; pair with VL.DBSCAN (clustering) and VL.TrackObjects (tracking) to build a multitouch surface. Built on third-party C# RPLidar4Net.IO. S2E/mounting/calibration not covered. — [vvvv blog](https://vvvv.org/blog/2024/introducing-support-for-rplidar-devices-by-slamtec); [NuGet VL.Devices.RPLidar](https://www.nuget.org/packages/VL.Devices.RPLidar)
- **Modulo Kinetic (Modulo Pi) lists Slamtec RPlidar S3 / A3** (plus Hokuyo UST-10LX/20LX, Leuze ROD 4) as supported 2D LiDARs for interactive projection on walls/floors; application-note body not read. — [Modulo Kinetic v5 manual](https://support.modulo-pi.com/modulo-kinetic-manual/v5/en/topic/interactivity-with-2d-and-3d-lidars)
- **MDPI Electronics 2023, 12(15), 3351**: reportedly low-cost 2D LiDAR case studies in a science museum incl. an interactive floor projection (privacy argument). Page returned 403; sensor model unknown. — [MDPI](https://mdpi.com/2079-9292/12/15/3351)
- **Comparable but NOT RPLIDAR (for context):** Palace Museum installation using Hokuyo UST-10LX in Unity, with colliders generated on a canvas matching wall size (from search summary) and [hokuyo-unity](https://github.com/wangyangwang/hokuyo-unity) (archived); KL Multimedia "Radar Touch" (Colink lidar, 25 Hz, PoE, TUIO/Windows Touch/mouse; vendor says objects create blind zones behind them, needing reverse-facing radar) — [KL Multimedia](https://www.klmultimedia.com/radar-touch.html); Future Wife "LIDAR Touch" LED wall (no sensor model or details) — [page](https://www.futurewife.tv/lidar-touch).

### Inferences
- Commercial interactive-lidar vendors mostly sell dedicated 25-50 Hz sensors (LidarMagic, Colink, etc.), which suggests the RPLIDAR S2E at 10 Hz (user's spec) is at the low end for this use; this is an inference, not a source claim.
- A multi-wall room with one lidar per wall (ETRI, LiTouch) matches the Barcelona 4-sensor plan, so both are worth obtaining in full text.

### Gaps
- No named studio/venue installation using S2/S2E/S3/A2/A3 with mounting height, wall offset, calibration and lessons found.
- ETRI and LiTouch full texts not read; sensor models unverified.
- No YouTube/Vimeo making-of, Instructables or Hackster page found. Behance/LinkedIn studio posts not found via search.

## 2. Slamtec's own case studies, application notes and recommended mounting

### Takeaway
Slamtec ships a free "RPLIDAR Interactive Toolkit (Framegrabber.NET)" for mouse emulation and TUIO output, and an older multi-touch SDK tutorial. Mounting guidance is a single line: sensor about 50 cm above or below the interactive area. No dedicated S2E touch-wall case study found.

### Cited Findings
- Toolkit manual (Beta 1.2.3-EN, 2023-09-11), text extracted locally from the PDF: supports all Slamtec lidars (A, S series, T1); serial and Ethernet (enter IP and port, TCP mode); default baud A1 115200, A2/A3/S1 256000, S2/S3 1000000. — [Manual PDF](https://wiki.slamtec.com/download/attachments/83066883/RPLIDAR%20Interactive%20Toolkit%20Instruction%20Manual%20-%20V1.1.pdf?api=v2)
- Mounting: "usually installed in the interactive screen area directly above or directly below the position of about 50cm, support customized settings". Same manual.
- Setup: enter interactive area Size in mm (example wall 3.2 m x 1.83 m = 3200 x 1830); set Bias for sensor position (example: sensor below the area, Bias Width = -1/2 Size.Width = -1600, Bias Height = 390 = sensor centre distance from the bottom edge of area); coordinate system can be flipped/rotated for installation angle. Same manual.
- Output: mouse emulation (click, drag) and multi-touch TUIO; recommended TUIO config uses "MMERGING" plus TUIO checkbox, default port 3333 (change needs restart). Parameters: Lifetime (frames a cursor survives after leaving), Max speed (max pixel move between frames before treated as new cursor), Merge distance (min mm between objects to be separate cursors; "should be larger than 30"). Same manual.
- Filter: only in multi-touch TUIO mode; Kalman-like Q and R values balance smoothing vs "jelly"; higher Q / lower R = faster response; smoothing costs latency, which Slamtec says is "usually acceptable" versus display latency. Same manual.
- Motor speed adjustable (RPM on S series); FPS shown is point-cloud refresh, not exactly motor speed. Manual lists integration targets Unity3D, Flash, Ventuz, CooLux and ships Unity demo materials ([SlamTecDemo.zip](https://wiki.slamtec.com/download/attachments/83066883/SlamTecDemo.zip?version=1&modificationDate=1690535681110&api=v2)). Same manual.
- Manual does not say the S2E is explicitly tested; it states "ALL SLAMTEC LIDARs" and Ethernet support. No multi-lidar fusion described in the extracted text (not seen; I read only up to the install-example section header, figures are images).
- Older Slamtec tutorial "How to build a multi-touch application using RPLIDAR": C++ SDK package (multi-touch server, calibration app, TUIO demo client on port 4444), needs Visual Studio 2010/Windows; calibration = load `multi_touch.json`, drag a white dashed rectangle over laser points to define touch area, save. Says RPLIDAR A1 unsupported (as stated there). — [Slamtec news 857](https://www.slamtec.com/en/news/detail/857)
- S2E datasheet/manual (not fetched successfully): search snippets say S2E range 0.05-30 m at 90% reflectivity, 0.05-10 m at 10%; default IP 192.168.11.2, PC must be on a different address. — [S2E manual (EN)](https://bucket-download.slamtec.com/5350555d005bfd7a8685fcea6e80e9edb764adb1/SLAMTEC_rplidarkit_usermanual_S2E_v1.0_en.pdf), [S2E datasheet CN](https://bucket-download.slamtec.com/837162e04b2bbba549e56cf8dfb621f44df100f6/SLAMTEC_rplidar_datasheet_S2E_v1.5_cn.pdf). Scan frequency not verified by me.

### Inferences
- The 50 cm guideline is for a sensor above or below the area, in the plane being touched; Slamtec gives no guidance on scan-plane offset from the wall (a few cm), so the user's design choice has no Slamtec backing.
- The toolkit's TUIO parameters (merge distance > 30 mm, lifetime, max speed) are a useful baseline for the tracker's defaults.

### Gaps
- No Slamtec case-study page, Chinese-language application note, or S2E-specific touch guidance found. Toolkit's multi-sensor handling and S2E compatibility not confirmed.

## 3. Community documentation (TouchDesigner, GitHub, blogs)

### Takeaway
TouchDesigner support is a community C++ CHOP wrapping the Slamtec SDK; the Derivative forum thread shows it works for some users with S2/S2E/A1 but has recurring stability and Ethernet-setup problems, and no native CHOP exists (users ask for one like Hokuyo's).

### Cited Findings
- Derivative forum thread "Slamtec RPLidar support" (Dec 2024 to Oct 2025), as summarised from the page: Brad_Emery pointed to `thepelkus-too/SlamtecLidarTDCPPCHOP`; one S2 (USB) working well (Jan 2025); hhn tested S2E and A1 with Touch Engine (Jul 2025); user r3nder said that repo didn't work for them and used Framegrabber with TUIO instead; Vasily said no limit on number of lidars, prefers network units for stability, has run up to 8 on one machine, and recommended USR-M0 software to set IP/port. — [thread](https://forum.derivative.ca/t/slamtec-rplidar-support-2023-05-19-10-58/344383?page=2)
- Problems in that thread: S2M1 not found over Ethernet (Mar 2025); A3M1 pings but doesn't spin, "RPLidar is busy" (Apr 2025); S2 serial fails at 1,000,000 baud though SDK works (Aug 2025); TouchDesigner crashes on project open when the DLL loads with sensor missing/faulty, mitigated by delayed load and unloading the DLL (CPlusPlusCHOP load page) (Aug-Sep 2025); one user dropped it for live performance as inconsistent (Oct 2025); firewall/antivirus tips (May 2025); Apple Silicon build errors. Same thread. Latency not discussed.
- Wrapper licences were not checked (SlamtecLidarTDCPPCHOP, LiDAR-Sensor); Slamtec rplidar_sdk is on GitHub — [slamtec/rplidar_sdk](https://github.com/slamtec/rplidar_sdk) (licence not verified by me).
- Open-source TUIO client libs (reacTIVision/tuio11_cpp, tuio11_net) exist for consuming Slamtec toolkit output — [reacTIVision](https://github.com/mkalten/reacTIVision). Not RPLIDAR-specific.
- HKU Bookstack page (via search snippet) says Slamtec RPLidar scan frequency is too slow for position tracking in TouchDesigner and links Hokuyo CHOP docs — [HKU](https://bookstack.hku.nl/books/sensors/page/lidar-scanners/export/pdf). Opinion, not tested by me.

### Inferences
- Running the lidar in a separate process (e.g. the Electron app) and sending OSC/TUIO to TouchDesigner avoids the DLL crash class of problems; consistent with the forum reports but not stated there.

### Gaps
- No Instructables/Hackster RPLIDAR touch-wall write-up, no YouTube description summaries (video pages not reachable), no GitHub RPLIDAR touch-wall repo found (only the TD CHOPs above).

## 4. Recurring practical issues

### Takeaway
Reported issues are mostly software/network (Ethernet discovery, DLL crashes, baud) plus inherent 2D limits (occlusion, jitter). Reflections, calibration drift and multi-sensor interference are essentially undocumented for RPLIDAR touch use in what I found.

### Cited Findings
- Occlusion: objects blocking each other cannot be tracked separately — [Hackaday](https://hackaday.io/project/181878-lidar-as-an-input-device); vendor KL Multimedia states an object leaves a blind zone behind it, requiring opposing sensors — [KL](https://www.klmultimedia.com/radar-touch.html).
- Jitter and latency: smoothing trades off latency (Slamtec filter) — [manual](https://wiki.slamtec.com/download/attachments/83066883/RPLIDAR%20Interactive%20Toolkit%20Instruction%20Manual%20-%20V1.1.pdf?api=v2); Hackaday needed velocity-based smoothing.
- Network setup: S2E default IP 192.168.11.2, must differ from PC subnet address — S2E manual (link above); Ethernet detection failures — Derivative thread.
- Vendor guidance (poelidar.com, marketing): scan area slightly outside the projection zone and crop in software; a tracking ID is a temporary label when targets merge or reappear — [guide](https://www.poelidar.com/step-by-step-guide-to-installing-lidar-interactive-floor-projection-systems/), [multi-user](https://www.poelidar.com/multi-user-museum-interactive-projection/). Low-reliability vendor sources.

### Inferences
- With 4-15 people at 10 Hz, occlusion and ID swaps will dominate; overlapping coverage from adjacent-wall sensors (as in ETRI's network) may help but is untested here. Multi-sensor interference between S2E units is not documented; test early.

### Gaps
- No sourced data on calibration drift, reflective surfaces (glass/LED walls), multi-RPLIDAR crosstalk, sensor failure rates, or 10 Hz latency measurements for touch.
