# Artists and references: RPLIDAR / 2D LiDAR in TouchDesigner (interactive walls/floors)

Research date: 2026-11-14. About 18 tool calls. Many fetches returned only page chrome (YouTube, alltd.org), so video content is mostly known from titles and secondary descriptions. Those items are marked UNVERIFIED.

## Q1. Lake Heckaman: who he is, channels, and what his RPLIDAR content covers

### Takeaway
The spelling "Lake Heckaman" is correct. He is a TouchDesigner tutorial author with a YouTube channel, Patreon (water__shed) and portfolio site. He is a real, repeatedly cited reference for RPLIDAR in TouchDesigner, but the only artifacts I could tie to him are a YouTube video ("Slamtec RPLiDAR in TouchDesigner") and a 2025 update video. The C++ CHOP he demonstrates was written by someone else (thepelkus-too). I could not verify the video's technical content.

### Cited Findings
- Lake Heckaman describes himself as a "new media artist and technologist" making interactive works explored by viewers in physical space. His Patreon (water__shed) offers TouchDesigner tutorials, and the latest post when fetched was "GSOPs Tutorials: Chroma Key." The page lists a membership with prices in EUR, but no tier names or prices were visible. — [Patreon](https://www.patreon.com/water__shed)
- The Patreon page links to his website www.lakeheckaman.com, his YouTube channel (youtube.com/channel/UCy0c3pLb3Tye4A93JoBAwRg) and Instagram @lake_heckaman. No GitHub is listed. — [Patreon](https://www.patreon.com/water__shed)
- lakeheckaman.com returned HTTP 403 to my fetch, so I could not inspect the site. — [lakeheckaman.com](https://lakeheckaman.com)
- His other tutorials include GLSL dithering, a GLSL slit-scan effect, a "Mastering GLSL in TouchDesigner" series and a Gaussian splat component tutorial. They are mirrored on Derivative's community site and on ALLTD. — [ALLTD uploader page](https://alltd.org/uploader/lakeheckaman), [Derivative dithering post](https://derivative.ca/community-post/tutorial/touchdesigner-glsl-effect-dithering/72708)
- Video "Slamtec RPLiDAR in TouchDesigner" is https://www.youtube.com/watch?v=fAvF2niosNA. The README of thepelkus-too/SlamtecLidarTDCPPCHOP links to it as "Lake Heckaman's walkthrough." — [GitHub README](https://github.com/thepelkus-too/SlamtecLidarTDCPPCHOP)
- A Derivative forum user (Brad_Emery, Dec 11, 2024) pointed to that repo and "a Lake Heckaman video on implementing it." — [Derivative forum thread p.2](https://forum.derivative.ca/t/slamtec-rplidar-support-2023-05-19-10-58/344383?page=2)
- ALLTD lists "Slamtec RPLiDAR in TouchDesigner" at https://alltd.org/?p=24130. A search snippet described it as turning any surface into a multi-touch surface with an RPLiDAR A1M8. The page itself showed only the site index, so I could not confirm the author or content. UNVERIFIED. — [ALLTD](https://alltd.org/?p=24130)
- A video titled "2025 Update: Slamtec LiDAR for TouchDesigner" exists: YouTube https://www.youtube.com/watch?v=l6noiFoRERY and ALLTD https://alltd.org/?p=43917. The HKU wiki links it as the Slamtec S3 TouchDesigner tutorial. A search snippet describes it as covering how LiDAR works, driver install, SlamtecCHOP setup, troubleshooting, and tracking, instancing and point-cloud rendering. My fetches returned only the title, so the author is unconfirmed. My earlier search snippet associated it with Heckaman's site ("Heckaman's own site lists a 2025 update"). UNVERIFIED attribution and content. — [HKU wiki](https://bookstack.hku.nl/books/sensors/page/lidar-scanners), [ALLTD](https://alltd.org/?p=43917)
- ALLTD also has "I turned my monitor into a touchscreen | TouchDesigner Tutorial (Part II / Part 3)" (https://alltd.org/?p=52053, tag page https://alltd.org/tag/lidar). The snippet says Part II covers connecting the sensor, calibrating it and converting the stream to touch coordinates. I could not verify the author or sensor. UNVERIFIED. — [ALLTD lidar tag](https://alltd.org/tag/lidar)
- The referenced plugin (thepelkus-too) is MIT licensed. It is USB/serial only and supports Polar or Cartesian output plus an Offset rotation. Its known issues are half-degree bucketing and incorrect Cartesian channel fill. It is no longer maintained, and the author points to Ajasra/SlamtecCHOP. Prebuilt releases exist, including an ARM Mac build dated 2024-08-21. — [GitHub README](https://github.com/thepelkus-too/SlamtecLidarTDCPPCHOP)
- The README does not list supported models. A forum snippet says the plugin worked with the A1M8, while some users had trouble with the S2. — [GitHub README](https://github.com/thepelkus-too/SlamtecLidarTDCPPCHOP), [Derivative forum](https://forum.derivative.ca/t/slamtec-rplidar-support-2023-05-19-10-58/344383?page=2)
- I found no downloadable Heckaman-authored .tox or LiDAR-specific Patreon post. The Patreon page shows none, but its posts are mostly gated. — [Patreon](https://www.patreon.com/water__shed)

### Inferences
- His approach is probably: USB, A1-class sensor, community C++ CHOP, then blob tracking or touch conversion in TouchDesigner. This is inferred from the README link and snippets, not from watching the video. It does not cover Ethernet or the S2E.
- It is worth watching both videos (fAvF2niosNA and l6noiFoRERY) manually for calibration and mounting tips.

### Gaps
- Video contents, upload dates, description links and any Patreon file for the LiDAR tutorials could not be read (YouTube and ALLTD pages returned only chrome).
- Whether the ALLTD "monitor into touchscreen" series is Heckaman's is unconfirmed.
- lakeheckaman.com was not accessible.

## Q2. Other people and references with RPLIDAR / LiDAR touch content

### Takeaway
The most useful new finds are Ajasra (Vasily)'s SlamtecCHOP, which does support network (UDP/TCP) lidars including the S2E according to Derivative's asset page, and the Derivative forum thread with concrete S2E, S2M1 and A3M1 Ethernet pitfalls. I found no RPLIDAR content from Bileam Tschepe, Torin Blankensmith, Matthew Ragan or Elburz. Interactive & Immersive HQ has Hokuyo and blob-tracking material, but I could not confirm any RPLIDAR content.

### Cited Findings
**Ajasra / Vasily: SlamtecCHOP (C++ CHOP)**
- The Derivative asset page (Feb 1, 2023, 9,067 reads, 0 comments) lists support for A1, A2, A3, S1, S2 and S3, and says network versions can be used as the S2E. It has a Serial/TCP toggle: serial needs a COM port and baud rate (115200 for A1/A2/A3, 1000000 for S2), and network uses UDP or TCP with IP and port. It also provides an InfoDAT and InfoCHOP and a demo .toe, and its output can feed blob tracking. No license is stated. — [Derivative asset](https://derivative.ca/community-post/asset/slamtec-rplidar-support/67156)
- The GitHub README (https://github.com/Ajasra/SlamtecCHOP) conflicts with the asset page on networking. It lists A1, A2, A3, S1, S2 and S3 and says the C1 is untested. Network (TCP/UDP) support is a TODO item. V3 is the stable release and V4 was rolled back after intermittent failures. SDK 2.1.0 causes a crash. The Releases page showed no entries when fetched, and no license is shown. — [GitHub](https://github.com/Ajasra/SlamtecCHOP)
- Because of this conflict, verify S2E/UDP support in the current build before relying on it.

**Derivative forum thread "Slamtec RPLidar support" (practical problems)**
- Vasily (Jan 21, 2025): there is no limit on the number of lidars. He prefers network units because serial over long cables is unreliable and USB bandwidth is limited, and he has run up to 8 on one machine. — [forum](https://forum.derivative.ca/t/slamtec-rplidar-support-2023-05-19-10-58/344383?page=2)
- BonkoKar (Mar 2025): an S2M1 over Ethernet via a USR-M0 adapter and RoboStudio found no device on the network, and changing the IP failed. Serial worked. — same thread
- david.skovron (Apr 2025): an A3M1 over Ethernet. The USR software could ping and change the IP, but the lidar did not spin and the Info DAT said "RPLidar is busy." Serial worked. — same thread
- Vasily (May 2025): use the USR-M0 setup tool to set IP and port, disable antivirus and Defender, and use an IP scanner. — same thread
- hhn (Jul 2025): tested on S2E and A1, and TouchEngine keeps the plugin active when saving. — same thread
- alexis310901 (Aug 2025): an S2 never connected at 1,000,000 baud, though it worked in the RPLidar SDK. — same thread
- rishabhrajan (Aug-Oct 2025): TouchDesigner crashed on opening projects that reference the C++ CHOP DLL. Vasily's fix was to unload and deactivate the plugin on project save, then load and activate it after a short delay on start. Detection was inconsistent in practice, so he dropped it for live performance and suggested it may suit controlled studio setups. — same thread
- r3nder (Dec 2024): the thepelkus repo did not work for them, so they used Slamtec's Framegrabber with TUIO. — same thread
- Apple Silicon compilation of Ajasra's CHOP was unresolved as of Feb 2025. — same thread

**Slamtec RPLIDAR Interactive Toolkit (vendor, already known)**
- The manual says the sensor is usually installed directly above or below the interactive area, about 50 cm from it. You enter the real area size in mm, and it outputs multi-touch data over TUIO. — [manual PDF](https://wiki.slamtec.com/download/attachments/83066883/RPLIDAR%20Interactive%20Toolkit%20Instruction%20Manual%20-%20V1.1.pdf?api=v2) (from search snippet, not opened)

**University wikis**
- UAL Creative Technology Lab (Marta Ilacqua), "Interactive Projections": uses the SlamtecLidarTDCPPCHOP built in Visual Studio. The Mac route is a plugin in the creativetechnologylab LiDAR-Sensor repo, and a prebuilt `LiDAR_Sensor.tox` is provided. Mounting and calibration are not covered. Tips: setup takes time, and you need full Visual Studio, not VS Code. — [page](https://lab.arts.ac.uk/books/projection-mapping/page/interactive-projections/revisions/3839)
- HKU sensors wiki: the Hokuyo URG-04LX-UG01 (USB, 10 Hz) is said to be too slow for position tracking, and the UST-10LX (Ethernet, 40 Hz) is recommended, often 2 or 4 units to locate people on the floor. It also lists the Slamtec S3 with the video link above, SICK LMS100 at the Museo Leonardo da Vinci in Milan, and Ars Electronica Futurelab's Pharus. — [HKU wiki](https://bookstack.hku.nl/books/sensors/page/lidar-scanners). This 10 Hz point is relevant to S2E's 10 Hz.

**Others**
- Future Wife (Beau Burrows): "LIDAR Touch," a deployable hardware and software solution that turns any surface into an interactive canvas, usable with LED walls or projectors. No sensor model, no TouchDesigner mention, no downloads, copyright Future Wife, LLC. Possible commercial competitor or reference. — [futurewife.tv](https://www.futurewife.tv/lidar-touch)
- Hokuyo case study of a wall setup (sensor at top or bottom of the wall detecting hand position) and a floor setup at feet level. — [Hokuyo](https://www.hokuyo-aut.jp/case/data.php?id=15) (from snippet only)
- tdlidar (Aristides.Lab) is an iPhone LiDAR to TouchDesigner tool over OSC/NDI/TCP, with Pro at $29.99. It is not a 2D scanning LiDAR and is not relevant, noted only to avoid confusion. — [Derivative post](https://derivative.ca/community-post/tutorial/tdlidar-941-%E2%80%94-full-oscmidi-show-control-seven-new-modes-and-tdlidar-operator)
- Aggregator pages (irc.pcper.com, baks.verde.ag, etc.) repeat "Interactive Particles with Slamtec LiDAR, 3-part series using RPLidar A1." These are scraped spam pages with no author. Treat as unreliable. UNVERIFIED.

### Inferences
- Ethernet lidar problems in TouchDesigner are common (S2M1, A3M1 with USR-M0), so Alma's own UDP stack for the S2E, outside TouchDesigner, avoids those issues.
- Public TouchDesigner content is dominated by A1 over USB serial. Little is published for S2E, wall-parallel scanning, or latency.

### Gaps
- No content found from Bileam Tschepe, Torin Blankensmith, Matthew Ragan or Elburz. The searches did not specifically target their channels, so absence is not proof.
- Interactive & Immersive HQ: only a blob-tracking page appeared in search results; LiDAR content unconfirmed. IIHQ has a Hokuyo blob-tracking tutorial per the HKU wiki, not opened.
- Patreon-gated files, the YouTube transcripts and comments, and mounting, latency and calibration tips from the videos could not be retrieved.
- Licenses are missing for Ajasra's CHOP.
