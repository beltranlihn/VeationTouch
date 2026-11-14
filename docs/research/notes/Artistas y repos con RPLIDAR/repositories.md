# Open-source repos for RPLIDAR network models (S2E/S2/S3/C1) in interactive/touch/tracking use, and non-SDK UDP protocol implementations

Method note: GitHub search API (unauthenticated, rate-limited partway through) plus page fetches. Licenses come from the GitHub API `license` field or the repo page file list. "none detected" means the API returned null license or no LICENSE file was visible; treat as unlicensed (all rights reserved), learn-from only. Star counts and last-push dates come from the search API (pushed_at) as of Nov 2026. Where the API was rate-limited I could not re-verify.

## Q1: New repos that read RPLIDAR S2/S2E/S3/C1, especially over Ethernet/UDP, and do touch/blob tracking or TUIO/OSC output

### Takeaway
No open-source repo found that combines RPLIDAR S2E over UDP with touch/blob tracking and TUIO/OSC output. All touch-oriented repos found are serial-only (A1/A2/S1/C1) or wrap the Slamtec native SDK DLL; none is reusable under a permissive license except tiny MIT wrappers that have no touch logic. Slamtec's own closed "Interactive Toolkit" is the only product matching the use case over Ethernet.

### Cited Findings
**Touch / TUIO / interactive-wall repos**
- Hermeak1/__lidar_unity_ (C#, ~0 stars, last push 2026-08-29): Windows app turning a wall into a touch surface with 1-4 Slamtec RPLIDARs; scan -> screen coordinates -> `mouse_event` P/Invoke injection; per-sensor JSON calibration; uses Slamtec SDK native DLL via `RplidarBinding.cs`. Model and transport (serial vs UDP) not stated; README says archived/reference only. License: none detected (API license null; no LICENSE in file list). Learn-from only. Closest functional analogue to our product (multi-sensor, per-monitor mapping). — [repo](https://github.com/Hermeak1/__lidar_unity_)
- JpHoooo/unity-tuio-rplidar (C#, 27 stars, last push 2021-09-06): Unity project; RPLIDAR A2M6-R3 over USB serial (CP210x) into Slamtec's TUIO multitouch server/calibration tool, Unity consumes TUIO. License: none detected. Learn-from only; S2E not covered. — [repo](https://github.com/JpHoooo/unity-tuio-rplidar)
- georgevpp-code/RPLidar-S1-Touchdesigner-multitouch (Batchfile/TouchDesigner, 1 star, last push 2024-09-01): TUIO bridge in TouchDesigner for RPLIDAR S1; ships `RPLidarDLL.dll` and `Framegrabber.NET.exe` (i.e. wraps Slamtec's closed Interactive Toolkit) with start/kill batch scripts. License: none detected; bundles binaries of unknown redistribution rights. Do not reuse. — [repo](https://github.com/georgevpp-code/RPLidar-S1-Touchdesigner-multitouch)
- kamiyam/slamtec-rplidar-touch (JavaScript, 2 stars, last push 2019-01-29) and timetzhang/INTERACTIVE.rplidar-touch (C++, 0 stars, last push 2020-05-14): small old touch experiments, listed by GitHub search; I did not open them. License: none detected on both (search API). Likely A-series serial. — [kamiyam](https://github.com/kamiyam/slamtec-rplidar-touch), [timetzhang](https://github.com/timetzhang/INTERACTIVE.rplidar-touch)
- yoonsscom/__Rplidar_unity__ (no language, 0 stars, push 2024-07-12): description "Used Slamtec_Rplidar and able to use on unity game for touch the wall." License none detected. Not opened. — [repo](https://github.com/yoonsscom/__Rplidar_unity__)
- YamadaKyohei/rplidar_touchdesigner (MIT per API, 0 stars, push 2021-10-09): reads RPLIDAR A1M8 in TouchDesigner; serial A1 only, but MIT. Not opened; value likely minimal. — [repo](https://github.com/YamadaKyohei/rplidar_touchdesigner)
- ZKM Karlsruhe "lidar" (C++17, Lua; 7 stars; 72 commits): multi-LiDAR people tracking; client nodes on Raspberry Pi/Rock Pi send over UDP (one UDP port per sensor) to a server that does detection/tracking; outputs OSC, WebSockets, MQTT, InfluxDB, Lua; calibrates sensors against a pixel map with a simulation mode. License: BSD Simplified (LICENSE.txt) so reusable with attribution. README names no specific sensor models (RPLIDAR support not confirmed). Best architecture reference for multi-sensor tracking + OSC/WebSocket output. Linux-oriented. — [repo](https://github.com/zkmkarlsruhe/lidar), [README](https://github.com/zkmkarlsruhe/lidar/blob/main/README.md)
- Slamtec "RPLIDAR Interactive Toolkit" (Framegrabber.NET; closed source; beta v1.2.3, 2023): multi-touch, TUIO output, mouse emulation, Ethernet connection, S3 listed; recommends mounting the sensor at ~50 cm from the interactive surface. Not open source as far as found. — [manual PDF](https://wiki.slamtec.com/download/attachments/83066883/RPLIDAR%20Interactive%20Toolkit%20Instruction%20Manual%20-%20V1.1.pdf?api=v2); older multi-touch guide: [Slamtec](https://www.slamtec.com/en/news/detail/857)
- UAL Creative Computing Institute guide points to TouchDesigner routes: SlamtecLidarTDCPPCHOP (already covered) and creativetechnologylab/LiDAR-Sensor (Mac plugin + `LiDAR_Sensor.tox`; license not verified); connection type and model not stated. — [guide](https://lab.arts.ac.uk/books/projection-mapping/page/interactive-projections), [repo](https://github.com/creativetechnologylab/LiDAR-Sensor)

**Unity wrappers (no touch logic)**
- adityarahmanda/rplidar4net-unity (C#, 1 star, push 2026-11-09, MIT): Unity package wrapping the RPLidar4Net library; serial port + baud rate only, `onScanFrame` event. Network not supported per README. — [repo](https://github.com/adityarahmanda/rplidar4net-unity)
- zcyemi/Rplidar-Unity (C++, 36 stars, push 2018-12-01, MIT): wrapper of Rplidar API for Unity/.NET Core; old SDK, serial. — [repo](https://github.com/zcyemi/Rplidar-Unity)
- DodoZhang/RPLidarC1PluginForUnity (C++, 0 stars, push 2024-05-30, license none detected): C1 plugin for Unity; serial, C1 is USB-only. — [repo](https://github.com/DodoZhang/RPLidarC1PluginForUnity)
- Other Unity hits (no license detected): inoook/RPLidar_Unity, Poco-z/UnityRplidar. No Unreal plugin found.

**Other**
- Only0nce/rplidar_s2e (BSD-2-Clause, 1 commit, 0 stars, push 2023-11-22): despite the name, a copy of Slamtec's `rplidar_ros` ROS node with S2E launch files; README mentions only serial baud rates. Not a UDP implementation. — [repo](https://github.com/Only0nce/rplidar_s2e)
- ajin-scrap-monitoring/scrap-monitoring-lidar-simulator (Rust, 0 stars, push 2026-09-16, no license): synthetic scan generator for validating an "RPLIDAR S2E processing pipeline" (Korean description); not opened, probably industrial and not touch. — [repo](https://github.com/ajin-scrap-monitoring/scrap-monitoring-lidar-simulator)
- Slamtec/rplidar_ros (ROS2 branch includes `view_rplidar_s2e_launch.py`; S2E supported), Slamtec/sllidar_ros2 are official wrappers, same SDK. — [ROS index](https://index.ros.org/p/rplidar_ros/)

### Inferences
- Because touch repos here wrap Slamtec's SDK DLL or Framegrabber, none teaches S2E network handling; they are useful only for calibration/mapping UX (Hermeak1 JSON per-sensor calibration, per-monitor mapping) and architecture.
- ZKM lidar (BSD) is the only permissively licensed multi-sensor tracker with OSC/WebSocket output, but it targets generic LiDAR on Linux with its own node protocol; reuse of ideas (sensor->UDP->server, pixel-map calibration, simulation mode) is realistic, code reuse in a TypeScript/Electron app is not.
- No permissive-licensed prior art exists for blob tracking on RPLIDAR scans, so this component must be written in-house (or taken from generic permissive 2D-cluster/Kalman libraries, outside this scope).

### Gaps
- Licenses and contents of kamiyam, timetzhang, yoonsscom, creativetechnologylab/LiDAR-Sensor not verified (GitHub API rate limit hit; pages not opened).
- Whether Hermeak1/__lidar_unity_ ever used S2E/UDP is unknown (it relies on the Slamtec SDK DLL, which does support UDP channels, but no model or transport is stated).
- Searches for "sllidar udp", "rplidar electron", "lidar touch wall tuio" returned no repositories; no Node/TypeScript repo found.
- GitLab and Gitee not searched systematically; a Gitee mirror (gitee.com/dcctt/rplidar) surfaced but was not examined.

## Q2: Clean-room implementations of the S2E UDP protocol, Wireshark dissectors, protocol notes

### Takeaway
The only non-SDK S2E UDP code found is the vvvv community effort (antokhio fork of VL.Devices.RPLidar, branch `feat/udp-lidar`, plus a gist `RPLidarUDPSocket.cs`), already known from prior research. No Wireshark dissector, no Node/TS, Rust, Go or Python native UDP implementation was found. The best study material is the official protocol PDFs plus open decoders for serial capsules.

### Cited Findings
- Slamtec protocol: the host talks to the LIDAR over Ethernet via UDP, with the LIDAR as the UDP server; the S2E protocol PDF (Chinese) defines the UDP user-data message format for scan data, device info and health. — [S2E protocol v1.0 cn](https://bucket-download.slamtec.com/29ed73b84370f1ff1e3c09022b79976b46c6558f/SLAMTEC_rplidarkit_protocol_S2E_v1.0_cn.pdf); English general protocol [LR001 v1.0 en](https://bucket-download.slamtec.com/1cb3edd319c0fee6922fc5962e7765e887eccc36/LR001_SLAMTEC_lidar_protocol_v1.0_en.pdf)
- S2E default IP 192.168.11.2, UDP port 8089 (RoboStudio "Udp Server" mode); 32K sample rate requires the newer high-speed protocol, and older protocols are backward compatible with limited range. — [S2E user manual](https://stgaws.robu.in/wp-content/uploads/2023/03/SLAMTEC_rplidarkit_usermanual_S2E_v1.1_en-1.pdf), [datasheet v1.8](https://stgaws.robu.in/wp-content/uploads/2023/03/SLAMTEC_rplidar_datasheet_S2E_v1.8_en.pdf)
- vvvv thread: working raw-.NET UDP connection to S2E reached by July (year per thread); key gotchas: lidar acts as the server so the client must `Connect`/use an explicit EndPoint with `ReceiveFrom` or nothing arrives; code in a gist `RPLidarUDPSocket.cs` and repo `antokhio/VL.Devices.RPLidar` branch `feat/udp-lidar`. — [thread](https://forum.vvvv.org/t/observable-udp-socket/24484)
- RobotShop forum: a developer coding against the interface doc could discover the lidars on the network but got no response to follow-up requests (info request, scan start). — [thread](https://community.robotshop.com/forum/t/rplidar-s2e-ethernet-connection/97232)
- Open decoders of capsule formats: `rplidar_drv_rs` 0.7.0 has `ultra_capsuled_parser` (caches previous capsule); Slamtec's `handler_capsules.cpp` in rplidar_ros/SDK contains ultra dense decoding and sample-delay offset. Serial-oriented, but capsule payloads should be the same data. — [docs.rs source](https://docs.rs/rplidar_drv_rs/0.7.0/src/rplidar_drv/lib.rs.html), [rplidar_ros docs](https://docs.ros.org/en/api/rplidar_ros/html/namespaceunpacker.html). Note cnwzhjs/rplidar.rs is GPLv3 per a search snippet (earlier research listed rplidar_drv; license differs by source, verify before use) — [repo](https://www.github.com/cnwzhjs/rplidar.rs)
- Other protocol-level libs, serial only: Go `Dolphindalt/gorplidar` (MIT per ecosyste.ms, stale >5 years) — [listing](https://packages.ecosyste.ms/registries/proxy.golang.org/packages/github.com%2FDolphindalt%2Fgorplidar); Python `Roboticia/RPLidar`, `pyrplidar`; Elixir `rplidar` (hex.pm); `tether-rplidar` crate. — [pyrplidar](https://pypi.org/project/pyrplidar/0.1.1), [hex](https://readme.hex.pm/rplidar/0.1.0)
- Wireshark: web search found no published Slamtec dissector. A custom Lua dissector registered on `udp.port` 8089 is the practical route. — [Wireshark dev guide](https://www.wireshark.org/docs/wsdg_html/)
- Slamtec header `sl_lidar_protocol.h` (in official SDK) lists packet structs. — [rplidar_ros doc view](https://docs.ros.org/en/melodic/api/rplidar_ros/html/sl__lidar__protocol_8h_source.html)

### Inferences
- A TypeScript implementation would need to be built from the S2E protocol PDF plus the SDK's BSD-2 headers/decoders (`sl_lidar_protocol.h`, `handler_capsules.cpp`) as reference; the vvvv gist (license unverified) is the only proof the raw-socket path works.
- Capturing traffic from RoboStudio/SDK demo with Wireshark and writing a Lua dissector would also double as a test fixture for our parser.

### Gaps
- Licence of the vvvv gist and of antokhio/VL.Devices.RPLidar unverified here.
- I did not read the contents of the S2E protocol PDF (packet layout, checksum, request IDs) or the gist.
- No confirmation whether S2E UDP framing differs from serial framing beyond the PDF statement.
- Searches for npm/NuGet/crates packages implementing S2E UDP returned nothing.

## Q3: Unity / Unreal plugins for RPLIDAR touch

### Takeaway
Unity has several small unlicensed or MIT wrappers and one TUIO-based example; none handles S2E network or has maintained touch logic. No Unreal plugin was found.

### Cited Findings
- Unity touch-related: JpHoooo/unity-tuio-rplidar (27 stars, unlicensed, A2M6 serial via TUIO); Hermeak1/__lidar_unity_ (Windows mouse injection, unlicensed); yoonsscom/__Rplidar_unity__ (unlicensed) — see Q1 URLs.
- Unity wrappers: adityarahmanda/rplidar4net-unity (MIT, serial), zcyemi/Rplidar-Unity (MIT, old). — see Q1 URLs.
- Search for Unreal plugins returned only simulation tools (AWSIM RGL Unity plugin) and a Unity Asset Store "Lidar Plugin" not confirmed to be RPLIDAR — [AWSIM RGL](https://robotecai.github.io/AWSIM/Components/Sensors/LiDARSensor/RGLUnityPlugin), [Asset Store](https://assetstore.unity.com/packages/tools/input-management/lidar-plugin-336212)
- RobotShop thread: user trying to get A2M6 data into Unity with no working solution reported. — [thread](https://community.robotshop.com/forum/t/rplidar-a2m6-unity-or-as3/28758)

### Inferences
- Not relevant to our Electron/TS product except as calibration-UX reference; TUIO-to-Unity pattern shows downstream engines are served best by a standard TUIO/OSC output, which is already in our plan.

### Gaps
- No Unreal RPLIDAR plugin found; Asset Store package not examined; no GitLab results.
