# RPLIDAR S2E - official documentation review (rev. 2, 2026-11-14)

Status: the four official PDFs are now local and were read (text extracted; figures with missing text were rendered and inspected). The previous revision of this file was written without PDF access; every item below is now tagged with its source. Tags:

- **[PROT]** S2E Protocol v1.0, **[UM]** S2E Dev Kit User Manual v1.1, **[DS]** S2E Datasheet v1.10, **[SDKM]** SDK manual v2.0 (page numbers = footer page numbers of each PDF).
- **[SDK]** Slamtec `rplidar_sdk` source on GitHub (master, SDK 2.1.0). Official code, not a spec; used only to fill gaps the PDFs leave. Facts are re-described here, no code is copied.
- **[INF]** inference/computation by us, not stated by Slamtec.
- **[BENCH]** not documented anywhere; must be measured on the real unit.

## 1. Documents

| Title | Version | Date (cover/rev table) | File |
|---|---|---|---|
| Interface Protocol and Application Notes ("Applied to LPX T1 and LIDAR S Ethernet Series") | rev 1.0 | 2022-04-22 | `SLAMTEC_rplidarkit_protocol_S2E_v1.0_en.pdf` (39 p) |
| RPLIDAR S2E Development Kit User Manual | rev 1.1 | 2024-08-13 (v1.0 was 2022-06-01) | `SLAMTEC_rplidarkit_usermanual_S2E_v1.1_en.pdf` (17 p) |
| RPLIDAR S2E Introduction and Datasheet, model S2M1-R2E | rev 1.10 | 2026-09-11 (v1.0 2022-05-13) | `SLAMTEC_rplidar_datasheet_S2E_v1.10_en.pdf` (17 p) |
| Introduction to Standard SDK (SDK manual) | rev 2.0 | 2022-04 | `LR002_SLAMTEC_rplidar_sdk_v2.0_en.pdf` (19 p) |
| Existing notes | - | - | `s2e_official_docs.md` (this file) |

Caveats about the documents themselves:
- The protocol PDF is generic (shared by LPX T1 and the "LIDAR S Ethernet" family). It never states the default IP/port, and does not document SET_LIDAR_CONF/IP config, error codes, discovery or mounting. Those come from [UM], [SDKM], [SDK].
- [DS] p.7 says "if you need detailed data format and communication protocol, please contact SLAMTEC"; the protocol PDF is that detailed document.
- The protocol's own figures contain typos (e.g. garbled checksum equation, config table columns, "781 bytes" vs offset labels). Where text was garbled, the page image was checked and/or [SDK] used; noted per item.

## 2. Spec table (S2E, model S2M1-R2E)

| Parameter | Value | Source |
|---|---|---|
| Range, white 90% reflectivity | 0.05 - 30 m | [DS] p.9 Fig 2-1 |
| Range, black 10% reflectivity | 0.05 - 10 m | [DS] p.9 |
| Blind zone / minimum range | 0.05 m (distance is measured from the rotation center, not from the housing) | [DS] p.9; [PROT] p.17 |
| Sample rate | 32 kHz; legacy Standard mode only 16 kHz and 16 m | [DS] p.3, p.9; [PROT] p.13, p.15 |
| Scan frequency, typical | 10 Hz (600 rpm) | [DS] p.3, p.9 |
| Scan frequency / motor speed range | Adjustable by command (MOTOR_SPEED_CTRL, rpm). RoboStudio screenshot shows 15.14 Hz after adjusting, so > 10 Hz works in practice. Min/max allowed values are NOT in the PDFs; the device reports them via config entries 0x04/0x05 [SDK]. | [UM] p.10 Fig 2-10; [PROT] p.34; [SDK] -> [BENCH] for limits |
| Angular resolution | 0.1125 deg at 10 Hz (= 3200 points/rev). Resolution adapts automatically to actual rotation speed (about 0.17 deg at 15 Hz) | [DS] p.3, p.4, p.9; [INF] for 15 Hz |
| Accuracy | +-30 mm (typical, 90% reflectivity) | [DS] p.9 |
| Resolution | 13 mm (typical, 90% reflectivity) | [DS] p.9 |
| Beam divergence / spot size | NOT documented | [BENCH] |
| Scan field flatness (scan-plane tilt tolerance) | **0 deg ~ 1.5 deg** ("other angle requirements can be customized") | [DS] p.9 Fig 2-1 |
| Laser | 905 nm typ (895-915), 25 W peak, 5 ns pulse, IEC-60825 Class 1 (also 21 CFR 1040.10/.11) | [DS] p.6, p.9 Fig 2-2 |
| Ranging principle | TOF (time of flight), modulated pulse | [DS] p.5, p.6 |
| Ambient light | "reliable resistance to daylight", works outdoors in direct sunlight; no lux figure in the PDFs (the older "80 klux" came from the web page) | [DS] p.6, p.9; [UM] p.15 |
| Power supply | 9 V min / 12 V typ / 28 V max, ripple +-3% (excess noise raises radiation) | [DS] p.11-12 Fig 2-7/2-8; [UM] p.11 |
| Current | start-up 1200 mA typ / 1500 mA max (12 V; lower voltage needs more current); working 200 mA typ / 220 mA max (12 V) | [DS] p.12; [UM] p.11 |
| Start-up (spin-up) time | NOT documented. After SCAN the device waits for stable motor speed before sending data | [PROT] p.12; [BENCH] |
| Warm-up | Pre-heat > 2 min with scan running for best accuracy | [UM] p.14 |
| Temperature | Switch-on min 0 C; working -10 / 25 / 50 C; storage -20 / 25 / 60 C | [DS] p.12 Fig 2-9; [UM] p.14 |
| Ingress protection | NOT in the PDFs (earlier "IP65 with cover" is from the slamtec.com web page only) | - |
| Interface | Ethernet 10/100 (IEEE 802.3/802.3u), RJ45, **UDP** | [DS] p.11 |
| Power connector | 4-pin 5557-4R plug: pin1 VCC, pin2 GND, pins 3-4 NC ("do not connect"). Kit cable: 5559-4P/5558-PT to DC 5.5x2.1 female. **No PoE is mentioned**: power is a separate 9-28 V input. | [DS] p.11, p.15; [UM] p.3 |
| Weight | 190 g typ (min/max TBD) | [DS] p.12 |
| Dimensions | Base 77 x 77 mm (81 mm including the cable-side bulge); total height 39.85 mm; base 20.85 mm; optical enclosure 19 mm; tolerance +-0.2 mm | [DS] p.15 Fig 4-1 |
| Mounting holes | 4x M3 in the bottom on a 41.7 x 41.7 mm square; screw depth <= 4 mm or internal parts are damaged | [DS] p.15 |
| Optical window | Band on the rotating upper enclosure ("receiving and emitting window"), Fig 2-3 and 4-1. The datasheet gives **no numeric window height or offset from the base**; slamtec.com web page says 18 mm window height. Scan origin = rotation center. | [DS] p.10, p.15; web |
| Rotation / coordinates | Scans clockwise; left-handed coordinate system; 0 deg = dead ahead (x axis); angle increases clockwise; origin = rotation center | [DS] p.4, p.10 Fig 2-4 |
| Self protection | Laser shut-off + protection stop on: unstable scan speed, scan speed too slow, laser signal sensor abnormal | [DS] p.13 |

## 3. Network

| Item | Value | Source |
|---|---|---|
| Transport | **UDP**; the LIDAR plays the UDP **server**. Link is 10/100M Ethernet host - switch - LIDAR. The "TCP, port 20108" in the SDK manual is for the separate Ethernet *module* (serial-to-TCP adapter) used with other models, not the S2E. | [PROT] p.3 Fig 1-1; [SDKM] p.7-8, 14 |
| Default IP | 192.168.11.2. Host NIC must be in 192.168.11.x but **not .2** (UM example: 192.168.11.5). Mask not stated in the PDFs (/24 implied by "192.168.11.x"). | [UM] p.3-4 |
| Default port | **8089** (UDP) | [UM] p.7 (RoboStudio "Udp Server"); [SDKM] p.8, 14 |
| Who sends first | Host always. The LIDAR never sends anything by itself after power-up; it only answers requests or streams after a scan request. | [PROT] p.5 |
| Request/response | One request at a time; a new request sent before the previous answer may be discarded. During scanning (multi-response) any request or STOP interrupts the stream; the interrupting request is cached and processed afterward. | [PROT] p.5-7 |
| Framing over UDP | The payload is the plain serial protocol byte stream; the SDK's UDP channel adds no header, length, heartbeat or retry: one `sendto` per request, one `recvfrom` per read. Whether each datagram holds exactly one packet is **not documented** -> implement a stream reassembler over datagrams; do not assume alignment. | [SDK] sl_udp_channel; [BENCH] |
| Source port | Not documented. Use one socket per unit; accept replies only from that unit's ip:8089. | [SDK]; [INF] |
| Change IP | RoboStudio: Lidars plugin > Command > **IP Config**, then **reset** the device. SDK: `setLidarIpConf` + `reset`. Wire level (SDK only): SET_LIDAR_CONF (cmd 0x85) with conf type 0x0001CCC0 and 12-byte payload `ip[4] mask[4] gateway[4]`; read back with GET_LIDAR_CONF 0x0001CCC0 (SDK sends 2 reserved payload bytes). Port change: not documented. | [UM] p.14 step 7; [SDK] -> verify on bench |
| Discovery | RoboStudio "Auto Discovery to Lidar..." and SDK frame_grabber "Auto-Discovery" (needs **Bonjour** installed on Windows; wait 2-3 s). Mechanism/service name not documented (Bonjour implies mDNS/DNS-SD, [INF]). Manual connect needs no discovery. | [UM] p.6-8, p.12 |
| Multiple units on one subnet | Not documented. Every unit ships as 192.168.11.2, so connect and re-address **one unit at a time** (IP Config), give each a unique static IP, then one socket per unit (dest ip:8089). MAC readable via conf 0x79 (SDK marks it LPX-only). | [UM] p.3; [SDK]; [INF] |
| Disconnect/reconnect | **Not documented.** No keep-alive/heartbeat exists in protocol or SDK. Unknown: whether the unit keeps scanning/streaming if the host vanishes, behavior when the host IP/port changes, whether a second client can take over. Reliable recovery is host-side: STOP, RESET, restart the sequence. | [PROT]; [SDK]; [BENCH] |
| Timeouts | The whole request packet must arrive within **5 s** or it is dropped. SDK default command timeout 2000 ms. After STOP wait >= 1 ms by text (Fig 4-2 and flowchart use 100 ms; SDK waits 100 ms). After RESET wait >= 1 s. | [PROT] p.8, p.14-15, p.35; [SDK] |
| Bandwidth | HQ packet 781 B per 96 samples at 32 kHz = ~333 packets/s ~ 260 kB/s (~2.1 Mbit/s) per unit; dense 84 B per 40 samples = 800 packets/s ~ 67 kB/s. Fine for 4 units on 100 Mbit. Each packet < 1472 B, so no IP fragmentation. | [INF] |

## 4. Protocol

All multi-byte fields little-endian. Source [PROT] unless stated.

### 4.1 Request packet (p.7-8)
```
A5 | cmd | [ len | payload[len] | checksum ]      (bracket part only if the command has a payload)
checksum = 0 XOR A5 XOR cmd XOR len XOR payload[0] XOR ... XOR payload[len-1]
```
- Commands without payload are just 2 bytes (`A5 25`, `A5 40`, `A5 20`, `A5 50`, `A5 52`, `A5 59`), no length, no checksum.
- Payload size 0-255. The whole packet must be sent within 5 s.
- The checksum formula is garbled in the PDF text and was confirmed with [SDK] (running XOR of every preceding byte, starting at 0, including 0xA5).

### 4.2 Response descriptor (7 bytes, p.9-10)
```
A5 5A | u32 LE: bits 0-29 = data length per packet, bits 30-31 = send mode | u8 data type
```
Send mode: 0 = single request/single response; 1 = single request/multiple response (continuous stream); 2, 3 reserved. In bytes: `len = u32 & 0x3FFFFFFF`, `mode = byte[5] >> 6`. Examples: `A5 5A 14 00 00 00 04` (info), `A5 5A 54 00 00 40 85` (dense, 84 B, multiple). All data packets after one descriptor share the same format and length. Data types: 0x04 devinfo, 0x06 health, 0x15 sample rate, 0x20 get conf, 0x21 set conf [SDK], 0x81 standard node, 0x82 capsule, 0x83 HQ, 0x84 ultra capsule [SDK], 0x85 dense capsule, 0x86 ultra-dense [SDK].

### 4.3 Commands

| Command | Request bytes | Response | Notes |
|---|---|---|---|
| STOP (0x25) | `A5 25` | none | Leaves scanning -> Idle (laser + measurement off). Ignored in Idle or Protection Stop. Wait ~100 ms before the next request (>= 1 ms by text). |
| RESET (0x40) | `A5 40` | none | Reboots the LIDAR core; the way out of Protection Stop. Wait >= 1 s. |
| SCAN (0x20) | `A5 20` | desc `A5 5A 05 00 00 40 81`, then 5-byte nodes | Legacy Standard mode only; 16 kHz and > 16 m dropped. Not for the 32 kHz modes. |
| EXPRESS_SCAN (0x82) | `A5 82 05 WM 00 00 00 00 CHK` (payload: working_mode u8 + 4 reserved bytes; [SDK] names them working_flags u16 + param u16, all 0) | desc per mode: dense `A5 5A 54 00 00 40 85`; HQ `A5 5A 0D 03 00 40 83` | WM = scan mode id from GET_LIDAR_CONF; WM=0 is legacy express. Payload cannot be omitted. Checksums: WM0 -> `22`, WM1 -> `23`, WM2 -> `20`, WM3 -> `21` (XOR, computed by us). |
| GET_INFO (0x50) | `A5 50` | desc `A5 5A 14 00 00 00 04`, 20 B | See below. |
| GET_HEALTH (0x52) | `A5 52` | desc `A5 5A 03 00 00 00 06`, 3 B | `status u8, error_code u16`. |
| GET_SAMPLERATE (0x59) | `A5 59` | desc `A5 5A 04 00 00 00 15`, 4 B | `Tstandard u16, Texpress u16` (us per sample). Legacy helper; prefer conf entries. |
| GET_LIDAR_CONF (0x84) | `A5 84 len type(u32) [payload] CHK` | desc `A5 5A <len> 00 00 00 20` (single); data = `type u32` echo + value | Entries below. |
| SET_LIDAR_CONF (0x85) | `A5 85 len type(u32) data CHK` | data type 0x21: `type u32, result u32` [SDK] | Used for IP config; not in [PROT]. |
| MOTOR_SPEED_CTRL (0xA8) | `A5 A8 02 rpm_lo rpm_hi CHK` | none (SDK sends without waiting for a response, then waits 10 ms) | Rpm = 0 -> motor stops and LIDAR goes Idle. 600 rpm = 10 Hz. Examples: 600 rpm `A5 A8 02 58 02 55`; 0 rpm `A5 A8 02 00 00 0F`. The motor only runs while a scan operation is active ([DS] p.12), so send it after the scan start ([UM] p.13 step 6). |
| HQ_SCAN (0x83) | not in the S2E protocol | - | Exists in [SDK] only; S2E Sensitivity mode is requested with EXPRESS_SCAN and its mode id. |

GET_INFO payload (20 B, p.25-26): byte0 = MajorModel (high nibble) / SubModel (low nibble); byte1 firmware_minor; byte2 firmware_major; byte3 hardware; bytes 4-19 serial number (16 B; "when converted to hex text, least significant byte prints first"). [SDK] reads bytes 1-2 as u16 `(major<<8)|minor`. The S2E model ID value is not documented -> [BENCH].

GET_LIDAR_CONF entries ([PROT] p.31-33), with example complete requests (checksums computed by us):

| Type | Name | Req payload | Resp | Example request |
|---|---|---|---|---|
| 0x70 | SCAN_MODE_COUNT (ids 0..count-1) | none | u16 | `A5 84 04 70 00 00 00 55` |
| 0x71 | SCAN_MODE_US_PER_SAMPLE | u16 mode | u32, Q8 us (value/256) | mode 0: `A5 84 06 71 00 00 00 00 00 56` |
| 0x74 | SCAN_MODE_MAX_DISTANCE | u16 mode | u32, Q8 meters (value/256) | mode 0: `A5 84 06 74 00 00 00 00 00 53` |
| 0x75 | SCAN_MODE_ANS_TYPE | u16 mode | u8 (text lists 0x81/0x82/0x83; dense answers 0x85) | mode 0: `A5 84 06 75 00 00 00 00 00 52` |
| 0x7C | SCAN_MODE_TYPICAL (Slamtec's recommended mode) | none | u16 mode id | `A5 84 04 7C 00 00 00 59` |
| 0x7F | SCAN_MODE_NAME | u16 mode | UTF-8 string, NUL-terminated | mode 0: `A5 84 06 7F 00 00 00 00 00 58` |

Extra entries known only from [SDK] (support on S2E unverified -> [BENCH]): 0x01 DESIRED_ROT_FREQ (resp `rpm u16, pwm_ref u16`; request `A5 84 04 01 00 00 00 24`), 0x04 MIN_ROT_FREQ (u16, `A5 84 04 04 00 00 00 21`), 0x05 MAX_ROT_FREQ (u16, `A5 84 04 05 00 00 00 20`), 0x60 MAX_DISTANCE, 0x79 LIDAR_MAC_ADDR (6 B), 0x80 MODEL_REVISION_ID, 0x81 MODEL_NAME_ALIAS, 0x0001CCC0 STATIC_IP (12 B). Config commands exist from firmware 1.24 on [SDK].

Example SET IP 192.168.11.3 / 255.255.255.0 / gw 192.168.11.1 ([INF], untested): `A5 85 10 C0 CC 01 00 C0 A8 0B 03 FF FF FF 00 C0 A8 0B 01 C0`, then RESET.

### 4.4 Working states (p.11-12)
Idle (default after power-up/reset; laser and measurement off) -> Scanning (on SCAN/EXPRESS_SCAN; data only after motor speed is stable) -> Request Processing (no scanning/data while answering) -> **Protection Stop** (hardware failure; still answers GET_HEALTH/GET_INFO, refuses scans until RESET). Repeated Protection Stops may mean unrecoverable damage (p.27-28).

### 4.5 Scan modes of the S2E family (p.13; [UM] p.13)
| Mode name | Max rate | Answer type | Content |
|---|---|---|---|
| Standard | 16 ksps, 16 m | 0x81 (via SCAN) | angle, distance, quality, S bit; 5 B per sample |
| DenseBoost | 32 ksps | 0x85 | distance only (no quality), 40 samples per packet; lowest bandwidth |
| Sensitivity | 32 ksps | 0x83 | distance, angle, quality (0-255), S flag, **internal timestamp**, CRC32; 96 samples per packet |

[UM] p.13: "RPLIDAR S2E supports three scan modes"; only Sensitivity carries intensity and internal timestamps. **Which numeric mode id is "typical" for the S2E is not documented** (the protocol only says: query 0x7C and use that id; do not hardcode). Enumerate at runtime (0x70, then 0x71/0x74/0x75/0x7F per id) and record the result -> [BENCH]. [PROT] p.19 says EXPRESS_SCAN with the typical mode gives best performance.

### 4.6 Dense capsule (answer 0x85, 84 bytes) - DenseBoost layout (p.20-22; decode from the p.22 figure + [SDK])
```
off 0   : byte0 = (0xA << 4) | chk[3:0]      sync1 = high nibble 0xA
off 1   : byte1 = (0x5 << 4) | chk[7:4]      sync2 = high nibble 0x5
off 2-3 : u16 start_angle_sync_q6: bit15 = S (new revolution), bits 0-14 = angle in 1/64 deg
off 4-83: 40 cabins x u16 distance (mm, 0 = invalid)
```
- **Checksum**: 8-bit XOR of bytes 2..83 must equal `(byte0 & 0x0F) | ((byte1 & 0x0F) << 4)`; drop the packet and resync on mismatch. Resync = a byte with high nibble 0xA followed by a byte with high nibble 0x5.
- **Distance**: mm directly (no q2). 0 = invalid.
- **Angle**: not per sample. Sample k (0..39) of packet i: `angle = start_i + k * delta / 40`, where `delta = (start_{i+1} - start_i) mod 360 deg` (15-bit values / 64). Packet i can only be decoded once packet i+1 has arrived (1 packet latency, ~1.25 ms at 32 kHz). Sanity guard used by the SDK: discard if delta is implausibly large (> ~45 deg for 40 samples). If packet i+1 has S=1, the cached previous packet is discarded (no interpolation across the revolution marker). The PDF only shows this graphically (Fig 4-14); the formula is from [SDK] behavior -> [BENCH] cross-check against Sensitivity-mode angles.
- **Sync / new scan**: S bit in start_angle_sync_q6 of the first packet of a revolution (p.21).
- **Quality**: none in this mode. **Timestamp**: none; use host receive time minus a latency estimate.

### 4.7 HQ / Sensitivity capsule (answer 0x83, 781 bytes) (p.22-24)
```
off 0       : u8  sync_byte = 0xA5
off 1-8     : u64 time_stamp (LIDAR internal clock, microseconds; one per packet)
off 9-776   : 96 x node_hq (8 bytes each):
                u16 angle_z_q14     deg = angle_z_q14 * 90 / 16384   (z = 0.5 pi = 90 deg)
                u32 dist_mm_q2      mm  = dist_mm_q2 / 4             (0 = invalid)
                u8  quality         0..255 echo strength
                u8  flag            S = flag & 1 (new revolution)
off 777-780 : u32 crc32
```
- Descriptor `A5 5A 0D 03 00 40 83` = 0x30D = 781 bytes, multiple mode (1 + 8 + 768 + 4).
- **CRC32** ([PROT] says only "crc32 verify"; parameters from [SDK]): CRC-32 (poly 0x04C11DB7, init 0xFFFFFFFF, reflected in/out, final XOR 0xFFFFFFFF) over bytes 0..776. The SDK implementation zero-pads that 777-byte input to a multiple of 4 (3 zero bytes) before computing; test both variants against live data and keep the one that matches -> [BENCH].
- Sync: first byte 0xA5; on CRC failure drop the packet and resync on 0xA5 (0xA5 also occurs inside data, so validate by CRC).
- Time: the on-device timestamp is per packet; per-sample time offsets are not specified. Use it for frame timing and drop detection.
- Revolution detection: S flag (or angle wrap). Scan period T between S=1 samples: `rpm = 60 / T` ([PROT] p.36).

### 4.8 Standard node (answer 0x81, 5 bytes) (p.16-17)
`b0 = (quality<<2) | (!S<<1) | S`; `b1,b2` = u16: bit0 = C (always 1), bits 1-15 = angle_q6 (deg = (v>>1)/64); `b3,b4` = u16 distance_q2 (mm = v/4, 0 invalid). Checks: S == not(!S) and C == 1.

### 4.9 Health and error codes (p.27-28)
`status`: 0 good, 1 warning (potential future hardware risk, still works), 2 error (Protection Stop). `error_code` u16 holds the cause. **No error-code table exists in the PDFs** (nor in the SDK headers read) -> log the raw value, [BENCH]. Protection triggers listed in [DS] p.13 (speed unstable/too slow, laser signal sensor abnormal). Recovery from error = RESET.

### 4.10 Recommended sequence (Fig 5-1 p.35, adapted)
1. Open UDP socket, destination ip:8089. Drain pending datagrams.
2. STOP (`A5 25`); wait 100 ms; drain (clears a stream left by a previous session).
3. GET_HEALTH, 2 s timeout. Timeout -> communication error (retry with backoff). status 2 -> RESET, wait >= 1 s, GET_HEALTH again; still 2 -> hardware failure, stop retrying. Warning (1): log, continue.
4. GET_INFO (model, firmware, serial); keep for logs and unit identity.
5. GET_LIDAR_CONF: 0x70 count, per id 0x71/0x74/0x75/0x7F, then 0x7C typical. Choose the mode (typical by default).
6. EXPRESS_SCAN with WM = chosen id; wait for the response descriptor (2 s; expect type 0x83 or 0x85, length 781 or 84, multiple mode). Data starts only after the motor is stable, so allow several seconds for the first packet ([BENCH] spin-up).
7. Optional: MOTOR_SPEED_CTRL after scan start; verify actual rpm from the S-flag period.
8. Parse stream: reassembler -> resync -> validate checksum/CRC -> decode -> frame by S bit.
9. Watchdog: if no valid packet for ~1-2 s (guess, [BENCH]), send STOP, wait 100 ms, rerun from step 3. Do not send a request while still waiting for the answer to another; any request interrupts the stream.
10. Shutdown: STOP (optionally rpm 0).

Recovery ladder: (a) STOP + drain + restart; (b) RESET (wait 1 s) + restart; (c) re-open the socket; (d) mark the unit failed and alert (repeated Protection Stops).

## 5. Installation / mounting guidance (what the docs actually say)

The manual and datasheet contain **no dedicated mounting chapter**. Available facts:
- Leave free space for the emitting/receiving light; obstructing the ranging window degrades performance and resolution ([DS] p.10). The window is a band around the rotating upper enclosure (Fig 2-3 / 4-1). No numeric clearance is specified -> keep the whole band clear except where you intentionally use the wall direction.
- Scan field flatness 0-1.5 deg ([DS] p.9): the scan plane may be tilted up to 1.5 deg (customizable on request). [INF] The offset from a wall at distance L from the sensor grows as `L * tan(tilt)`: 1.5 deg = 26 mm per metre (13 cm at 5 m, 26 cm at 10 m). Measure and shim each unit; a "few cm in front of the wall" plane across a long wall needs trimming/tolerance.
- Mount with 4x M3 on the 41.7 mm square pattern; screw depth max 4 mm ([DS] p.15). Upright orientation is the only one drawn/specified; operation upside-down at the top of a wall is not discussed -> [BENCH].
- Blind zone 0.05 m from the rotation center ([DS] p.9); 0 deg = sensor's dead-ahead axis, angles clockwise ([DS] p.10). Which side of the housing is 0 deg (relative to the cable) is only in the figure -> confirm on bench.
- Cable: no strain-relief/bend-radius guidance. 4-pin power connector and RJ45 pigtail leave at the base ([DS] p.15); do not connect pins 3-4.
- Grounding/EMI: only "power ripple must be low, noise raises radiation" ([DS] p.12). No grounding/shielding rules.
- Power: 9-28 V separate from Ethernet; start-up 1.5 A max at 12 V. **For a PoE LAN you need an isolated PoE splitter** giving 12 V (or 24 V, which lowers current). 1.5 A at 12 V = 18 W peak, above 802.3af's 12.95 W at the PD, so prefer 802.3at-class splitters or 24 V [INF].
- Environment: -10..50 C working, avoid extremes, pre-heat 2 min, keep the housing clean, do not open the shell (warranty) ([UM] p.14-15). Direct sunlight is tolerated ([DS] p.6).
- Multiple units / interference: **not documented** (no statement on optical crosstalk between several S2E). Stagger planes in height or test all four running -> [BENCH].
- Laser Class 1 ([DS] p.6); no mounting-related eye-safety constraints stated.

## 6. Firmware / tools

- **RoboStudio** (Windows, "Lidars" plugin; login required): Manual Connect (Udp Server 192.168.11.2:8089) or Auto Discovery; toolbar: Restart (clears internal errors), Save scan data, Stop scan (power-save), Start scan, Work mode switch (three modes), Adjust motor speed (shows actual Hz/rpm, e.g. 10.07 Hz / 604 rpm), Command > IP Config, download a single point-cloud frame ([UM] p.5-14). [DS] p.14 also names the "Framegrabber" plugin.
- **SDK demos**: `frame_grabber` (win32 GUI; choose Network; Auto-Discovery needs Bonjour; the SDK ships bonjour.rar and a DLL archive), `ultra_simple --channel --udp <ip> 8089`, `simple_grabber` ([UM] p.11-14; [SDKM] p.7-11). API: `startScanExpress` + `grabScanDataHq`; speed via `checkMotorCtrlSupport`/`setMotorSpeed`; IP via `setLidarIpConf` + `reset`.
- **ROS**: `rplidar_ros` (`view_rplidar_s2e.launch`) and `sllidar_ros2` ([UM] p.14).
- **Firmware upgrade tool**: none documented in any of the four PDFs (firmware version readable via GET_INFO). Ask Slamtec if an update is needed.
- Bench workflow suggestion: use RoboStudio to set unique IPs and read the typical mode / speed limits, and capture its UDP traffic in Wireshark to confirm the exact bytes our driver must emit.

## 7. SDK repo facts (github.com/Slamtec/rplidar_sdk, master)

- Version in `sdk/include/sl_lidar.h`: **2.1.0**; last commit on master 2024-04-09 (99478e5). GitHub's only tagged "latest release" is release/v1.12.0 (2019-10-31); README lists release notes up to v2.1.0; the SDK manual PDF is v2.0 (2022-04). The protocol PDF points to https://github.com/slamtec/LIDAR_sdk (older name) for the same code.
- **LICENSE file**: BSD 2-Clause "Simplified" (GitHub detects BSD-2-Clause). Header: "Copyright (c) 2009 - 2014 RoboPeak Team (http://www.robopeak.com) / Copyright (c) 2014 - 2018 Shanghai Slamtec Co., Ltd. (http://www.slamtec.com) / All rights reserved." followed by the standard two conditions (retain copyright notice in source redistributions; reproduce it in binary redistributions) and disclaimer.
- **README license statements are inconsistent**: line 9 says the SDK "is open-sourced under GPLv3 license"; the License section says "The SDK itself is licensed under BSD 2-clause license. The demo applications are licensed under GPLv3 license." Reading: BSD-2 for the SDK library, GPLv3 for demo apps. Our clean-room driver copies neither; if SDK code is ever copied, keep the BSD notice and check per-file headers. Not legal advice.
- Our approach: wire-protocol facts (byte layouts, constants, formulas) are re-implemented from the published protocol; no code is copied.
- README platform table: Windows/macOS/Linux for A1, A2, A3, S1, S2, S3, C1, T1 (S2E is not listed separately; the SDK talks to it through the UDP channel).
- **Windows build**: Visual Studio 2010 (`workspaces/vc10/sdk_and_demo.sln`) or 2019 (`workspaces/vc14/sdk_and_demo.sln`); output in `output\win32\Release|Debug`; static lib `rplidar_driver.lib` built against the VC10 MD C runtime (a mismatched CRT can break linking); Linux/macOS use `make` ([SDKM] p.3-6, 13; README). Not needed for our TS driver; useful only for bench tools (frame_grabber).
- [SDKM] p.14-15 shows `createTcpChannel("192.168.11.2", 8089)` for the UDP case: a doc typo; the real API is `createUdpChannel`.

## 8. Still undocumented / to measure on bench

1. Numeric id and name of the S2E typical mode; all mode ids with us/sample, max distance, answer type (run 0x70, 0x71, 0x74, 0x75, 0x7F, 0x7C).
2. Whether one UDP datagram carries exactly one response/packet, several, or a partial (reassembler design, loss handling).
3. HQ CRC32 padding variant (777 vs 780 bytes input); meaning of per-sample timing in HQ; whether dense interpolation matches HQ angles.
4. Allowed motor speed range (0x04/0x05); whether > 10 Hz is stable at 32 kHz and its effect on resolution/packet rate; whether 0xA8 persists after STOP/RESET or must be re-sent per scan start.
5. Spin-up time to first data; STOP/RESET timing (does the motor stop on STOP?).
6. Disconnect behavior: does the scan continue if the host stops reading or changes IP/port; any inactivity timeout; behavior with a second host; behavior after PoE/power loss and re-link (back to Idle, same IP?).
7. IP config: persistence across power cycles, effect of RESET, wire check of 0x0001CCC0 set/get, ability to change port, discovery after re-addressing, mask/gateway validity rules.
8. Error-code table for GET_HEALTH; model ID byte; unit-to-unit scan-plane tilt (0-1.5 deg) and the measured plane offset along the wall.
9. Beam divergence/spot size; actual window height above the base; minimum clearance around the window; grazing-incidence effects of a wall a few cm from the plane.
10. Operation mounted inverted; optical crosstalk with 4 units; PoE splitter inrush at start-up.
11. Where 0 deg points relative to the housing/cable, and the left-handed/clockwise to wall-coordinate conversion.
12. IP65 / 80 klux figures (web only); firmware update path.
