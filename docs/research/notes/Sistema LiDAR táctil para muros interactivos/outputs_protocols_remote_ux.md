# Output protocols (TouchDesigner / Unreal / web-Electron) and remote calibration UX for a LiDAR touch-wall tracker

Scope note: about 17 fetch/search calls. Sources are primary where possible (OSC spec, tuio.org, Derivative docs, Epic docs, MDN, Augmenta docs). Several questions were not covered and are listed under Gaps in each section. Everything under "Inferences" is my reasoning, not sourced.

## OSC 1.0/1.1: transport, bundles, timetags, payload size, address-space design

### Takeaway
OSC 1.0 is the only published spec (1.1 was never formally published). Use UDP with one OSC bundle per frame and timetag "immediately", keep each datagram under about 1472 bytes, and use TUIO-style alive lists plus frame ids for robustness. Address-space and event design below is inferred from TUIO and Augmenta patterns, not from a spec.

### Cited Findings
- OSC 1.1 was never published as a spec; the site points to the 2009 NIME paper as the authoritative reflection of 1.1 ideas. — [OSC 1.1 page](https://opensoundcontrol.stanford.edu/spec-1_1.html)
- A bundle is the string "#bundle", a 64-bit time tag, then elements each prefixed by an int32 byte size (multiple of 4). Bundles may nest, and an inner time tag must be >= the outer one. — [OSC 1.0 spec](https://opensoundcontrol.stanford.edu/spec-1_0.html)
- Time tag: NTP format (seconds since 1900 plus fraction). The value with 63 zero bits and a final 1 means "immediately". Tags in the past are dispatched at once. OSC provides no clock synchronization mechanism. — [OSC 1.0 spec](https://opensoundcontrol.stanford.edu/spec-1_0.html)
- Messages inside one bundle are atomic (invoked in immediate succession) and must be dispatched in order. — [OSC 1.0 spec](https://opensoundcontrol.stanford.edu/spec-1_0.html)
- Packet size is always a multiple of 4. On UDP one datagram carries one packet. On stream transports such as TCP the stream carries an int32 size before each packet. The 1.0 spec text as fetched does not describe SLIP framing. — [OSC 1.0 spec](https://opensoundcontrol.stanford.edu/spec-1_0.html)
- Address patterns support `?`, `*`, `[..]`, `{a,b}`; matching requires the same number of "/" parts; invocation order among multiple matches is unspecified. — [OSC 1.0 spec](https://opensoundcontrol.stanford.edu/spec-1_0.html)
- 1472 bytes is the largest UDP payload that avoids IPv4 fragmentation on a 1500-byte Ethernet MTU (1500 minus 20 IP minus 8 UDP). Tunnels reduce it (about 1448 for GRE, about 1422 for IPsec ESP per one source). Fragmentation should be avoided because a lost fragment drops the whole datagram. — [OneUptime: UDP fragmentation](https://oneuptime.com/blog/post/2026-03-20-troubleshoot-udp-fragmentation/markdown); [Gaffer On Games](https://gafferongames.com/post/packet_fragmentation_and_reassembly/)
- TouchDesigner OSC In CHOP supports UDP and multicast UDP; the docs do not mention TCP/SLIP. OSC In DAT offers UDP, multicast UDP and "Reliable Messaging (UDT)". — [OSC In CHOP](https://docs.derivative.ca/OSC_In_CHOP); [OSC In DAT](https://docs.derivative.ca/OSC_In_DAT)
- Unreal's OSC server supports multicast loopback and IP allowlisting. — [UE OSC overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/osc-plugin-overview-for-unreal-engine)

### Inferences
- Send UDP unicast per configured destination (default). Use broadcast or multicast only as an option, because venue switches and Wi-Fi often handle them badly and Windows firewalls and multi-NIC hosts add pitfalls.
- Do not support TCP/SLIP OSC in v1: none of the three core receivers documents it (TD docs silent; Unreal not confirmed). Offer WebSocket for reliable delivery instead.
- Size budget: a touch message with an id, x, y, plus state is roughly 40 to 60 bytes, so about 20 touches fit under 1472 bytes. For groups of 15 people with 2 hands, one bundle per wall per frame fits in one datagram. Add a guard that splits into multiple bundles, as TUIO 2.0 does, when the cap is reached.
- Timetag: always send "immediately" (value 1), since OSC has no clock sync; put a separate monotonic `t` argument in the frame message if receivers need timing.
- Suggested schema (proposal): per wall `/alma/<wall>/frame <seq:int> <tsMs:int64> <n:int>`, then `/alma/<wall>/touch <id> <x> <y> <state> <ageMs>`, then `/alma/<wall>/alive <ids...>`; events `/alma/<wall>/event/down|up <id> <x> <y>`; zones `/alma/<wall>/zone/<name>/enter|exit|hold <id>`; aggregates `/alma/<wall>/count <n>`. Send positions normalized 0 to 1 (wall-relative, origin top-left) plus optional metric meters, because the wall-to-pixel mapping differs per receiver and per room. This follows the TUIO alive/fseq pattern.

### Gaps
- No authoritative source found on "per-touch messages vs one bundle per frame" benchmarks or on SLIP-over-TCP OSC details (the OSC 1.0 page does not cover SLIP).

## TUIO 1.1 and 2.0: multi-wall representation, pitfalls

### Takeaway
TUIO 1.1 carries 2Dcur as an OSC bundle of source, alive, set..., fseq on UDP port 3333, and the source message is how multiple sources are multiplexed; TUIO 2.0 puts the source in /tuio2/frm. Use one port per wall (and also a source name) for maximum receiver compatibility.

### Cited Findings
- TUIO 1.1 messages: `/tuio/2Dcur source application@address`, `alive s_id...`, `set s_id x y X Y m`, `fseq f_id`. A bundle typically starts with alive, followed by sets, and ends with fseq. Minimum is alive plus fseq. — [tuio.org specification](https://www.tuio.org/?specification)
- fseq increases with each bundle; redundant bundles carry -1. Default transport is UDP, default port 3333. Large object sets are split across bundles each with alive. Quiet-surface alive/fseq is resent about once per second, with redundant SET repeats. — [tuio.org specification](https://www.tuio.org/?specification)
- The SOURCE message is `application@address`; strings without "@" are treated as localhost, and clients can multiplex several sources. — [tuio.org specification](https://www.tuio.org/?specification)
- TUIO 2.0: `/tuio2/frm f_id time dim source`, `/tuio2/alv ids`, `/tuio2/ptr s_id tu_id c_id x y angle shear radius press [vel/accel]`, `/tuio2/tok`, `/tuio2/bnd`, `/tuio2/sym`. A bundle must contain at least FRM (first) and ALV (last). Split bundles share the same FRM. The spec advises keeping packets near MTU (about 1500 bytes). The source string format is `src_name:src_instance@src_origin`. The compact list and detailed sections disagree on some field names, so verify field order. — [TUIO 2.0 spec](https://www.tuio.org/?tuio20)
- TouchDesigner TUIO In DAT supports TUIO 1.1 and 2.0, over UDP, multicast UDP or UDT, with Port and Shared Connection parameters; the page does not describe the output column layout. — [TUIO In DAT](https://docs.derivative.ca/TUIO_In_DAT)
- Unreal does not support TUIO natively; forum answers say it is unlikely to be added, and I found no maintained UE TUIO plugin. — [UE forum: OSC/TUIO in UE4](https://forums.unrealengine.com/t/is-osc-tuio-supported-in-ue4/284511)
- Augmenta's TUIO output is standard TUIO 1.1 with extra `/scene` and `/fusion` messages, does not expose the full data set, and Augmenta's TouchDesigner legacy plugin recommends TUIO as more stable than their OSC. — [Augmenta TouchDesigner (search result summary)](https://github.com/augmenta-tech/augmenta-touchdesigner)

### Inferences
- A 4-wall deployment fits best as 4 TUIO ports (3333 to 3336) with source names `alma-wall1@host` and so on. Per-wall ports avoid id collisions and let each TD In DAT or app be independent.
- TUIO is a useful compatibility export (TD TUIO In DAT, Qt/Unity clients, many existing apps) but loses zones, events and metrics. Treat it as secondary, not the primary schema.
- Because UE has no TUIO support, TUIO would only help TD and third-party apps.
- TUIO 2.0 pointers have `press` and `radius`, which could map to hand width or touch confidence; client library support for 2.0 is less common than for 1.1 (unverified).

### Gaps
- Real-world TUIO 2.0 client support was not surveyed.
- TUIO In DAT column layout and rate limits are undocumented on the page fetched.

## TouchDesigner receiving patterns

### Takeaway
OSC In CHOP is channel-based (good for fixed count, smooth values) and OSC In DAT is row-per-message or per-bundle with a callback; neither documents bundle semantics beyond a Split Bundle option on the DAT. Augmenta chose a native WebSocket plugin for TD, which shows a vendor-supplied component helps adoption.

### Cited Findings
- OSC In CHOP: each address becomes a channel; Strip Prefix Segments and OSC Address Scope filter names; queue parameters (Queued, Queue Variance, Maximum Queue, Queue Adjust Time) and Info CHOP channels (queue_length, total_bumped) help diagnose backlog. The page does not mention bundles or timestamps. Active off means data is lost; on Windows the Firewall can block reception. — [OSC In CHOP](https://docs.derivative.ca/OSC_In_CHOP)
- OSC In DAT: each row is either one message or a whole bundle; "Split Bundle into Messages" gives one row per message; "Split Message into Columns" splits address and args; optional Bundle Timestamp column; Callbacks DAT runs once per received message; table is a FIFO limited by Maximum Lines with Clamp Output default 100; OSC Address Scope reduces generated messages. No performance benchmarks given. — [OSC In DAT](https://docs.derivative.ca/OSC_In_DAT)
- TUIO In DAT parses TUIO 1.1/2.0 into table columns and fires callbacks. — [TUIO In DAT](https://docs.derivative.ca/TUIO_In_DAT)
- Augmenta's native TouchDesigner plugin (Windows only, requires TD 2023+, Augmenta 1.5+) uses a Client DAT connected to Augmenta's WebSocket output and exposes Clusters, Zones (Enters, Leaves, Presence, sliders), Point POP/TOP operators; it is installed by copying files to `Documents\Derivative\Plugins`. The older OSC plugin is the macOS option. — [Augmenta TD native plugin](https://docs.augmenta.tech/create-content/touchdesigner-native-plugin-(new-!))
- A forum post reports OSC sent from a Python timer callback arrived in 16 ms bursts rather than 5 to 8 ms spacing (timing worth testing). — [Derivative forum](https://forum.derivative.ca/t/resolved-trouble-hitting-200-fps-for-music-sequencing/304730)

### Inferences
- Recommended TD pattern: OSC In DAT with Split Bundle off (one row per frame bundle) plus a small callback that writes touches into a Table or Script CHOP/ DAT-to-CHOP; or OSC In CHOP with fixed slots (`touch1/x`...) when hands max out at a known count. With 60 Hz and about 30 touches, the Python callback cost per packet is small if one bundle per frame is used (reasoning, not measured).
- A TD `.tox` (receiver component: Client DAT or OSC In plus parsed touch table, per-wall Select, zone event outputs, auto-reconnect, sample sheet mapping normalized to 1920x1200) would likely help adoption, following the Augmenta precedent. A pure-Python-in-`.tox` using WebSocket DAT avoids shipping a C++ plugin and keeps it permissive and cross-platform.
- Ship a TD example `.toe` with per-wall mapping of the 3840x2400 2x2 layout.

### Gaps
- No benchmark or official statement on OSC In DAT vs CHOP performance with many addresses; no confirmation how the CHOP handles bundles.
- WebSocket DAT specifics (message framing, reconnect) not fetched.

## Unreal Engine 5.x receiving

### Takeaway
Epic's OSC plugin handles messages and bundles with Blueprint events and address-pattern binding, but threading and rate limits were not documented in the pages I could read. Augmenta's approach (Live Link source plus a Manager that moves events from a worker thread to the game thread) is the best precedent for many touch points.

### Cited Findings
- UOSCServer listens for OSC messages and bundles; supports multicast loopback and IP allowlist; Blueprint events `OnOscMessageReceived` and `OnOscBundleReceived`; `BindEventToOnOSCAddressPatternMatchesPath` supports wildcard patterns; FOSCBundle exposes GetMessagesFromBundle / GetBundlesFromBundle; plugin has C++ and Blueprint APIs. — [UE OSC overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/osc-plugin-overview-for-unreal-engine) (first 100,000 of 115,133 characters read)
- A search summary states the OSC plugin queues incoming packets and processes them on the game thread; the community UE4-OSC plugin buffers on a listener thread and drains per frame. This comes from a search-result snippet, not a primary page I read. — [UOSCServer API](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/OSC/UOSCServer?lang=en-US); [UE4-OSC](https://github.com/monsieurgustav/UE4-OSC)
- Augmenta's Unreal integration is a free Live Link plugin on Fab receiving OSC V2 on default port 12000; scene, video output and objects are Live Link Transform subjects; an Augmenta Manager (C++/Blueprint) relays enter/update/leave events from the Live Link thread to the game thread via a queue (warning threshold at capacity 2047); objects time out if not updated; nDisplay cluster events support a binary mode that is faster than JSON. — [Augmenta Unreal docs](https://docs.augmenta.tech/create-content/unreal-engine)
- No native TUIO support in Unreal. — [UE forum](https://forums.unrealengine.com/t/is-osc-tuio-supported-in-ue4/284511)

### Inferences
- Core recommendation: OSC (one bundle per frame per wall) into Epic's built-in OSC plugin for zero-install; deliver a small Blueprint/C++ helper plugin (MIT/Apache) that binds to the bundle event, parses the frame once, and exposes `OnTouchDown/Move/Up`, `OnZoneEnter/Exit`, and a `GetTouches` array, instead of many address bindings in Blueprint.
- Blueprint handling of one event per touch message at 60 Hz x 30 touches (about 1800 events/s) is likely heavier than parsing one bundle in C++ (reasoning, not measured).
- A WebSocket client plugin is an alternative but adds engine-module dependencies. Live Link is a good fit if we want actors driven by touches, but it is a larger plugin build; defer.
- In nDisplay setups, input would need to be replicated to the cluster (see Augmenta's cluster manager); relevant only if Unreal drives the 3840x2400 output through nDisplay (unverified for this project).

### Gaps
- Threading, tick-rate and queue-size behavior of Epic's OSC plugin not confirmed from the primary doc (UOSCServer API page returned no members; overview page was truncated).
- Remote Control API suitability for 60 Hz input not researched.

## Custom web/Electron apps

### Takeaway
Browsers cannot receive UDP, so the tracker should host a WebSocket server (JSON by default, optional binary) and ship a tiny TypeScript SDK. WebTransport is now Baseline 2026 but requires HTTP/3 and HTTPS, which is awkward on a LAN.

### Cited Findings
- WebTransport runs over HTTP/3 (QUIC), requires an `https://` URL with explicit port, secure contexts only, supports reliable streams and unreliable datagrams, and is available in Web Workers. MDN marks it Baseline 2026, "Newly available", since March 2026. Servers typically use libraries such as webtransport-go, aioquic, wtransport or `@fails-components/webtransport` for Node. — [MDN WebTransport API](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API)
- Augmenta ships a JavaScript WebGL/three.js library (legacy) with callbacks for object entered, updated, and about to leave, and offers WebSocket and JSON outputs. — [Augmenta JS lib](https://docs.augmenta.tech/create-content/javascript-webglthree.js-library-(legacy)); [Augmenta data protocols summary](https://github.com/Augmenta-tech/Augmenta/wiki/Data)

### Inferences
- Electron renderer or main process can use Node `dgram` for UDP/OSC directly (Electron's Node integration; not verified in a source here), so the Electron+WebGPU apps could receive OSC with no relay, while pure browsers need WebSocket. One WebSocket schema covers both.
- Localhost WebSocket latency is typically sub-millisecond to low milliseconds and LAN adds small jitter; at 60 Hz (16.7 ms frames) JSON is sufficient for about 30 touches (about 2 to 3 KB/frame). No measured source was found; offer binary (MessagePack or fixed Float32 layout) as an option only if needed.
- WebTransport: not recommended for v1. Self-signed certificates and `serverCertificateHashes` handling add friction for a venue LAN (inference); revisit later.
- SDK sketch (proposal): `const c = new AlmaClient('ws://host:port'); c.on('touch', cb); c.on('zone:enter', cb); c.subscribe({walls:['w1'], rate:60, fields:['x','y']})`, auto-reconnect, normalized to wall size, typed events, TypeScript types generated from the same schema used for OSC. Use permissive license (MIT).

### Gaps
- No measured latency data for localhost vs LAN WebSocket/WebTransport.
- JSON vs MessagePack throughput not sourced.

## Other outputs and output-routing UX

### Takeaway
Few sources were found on the later outputs. Augmenta offers a model: multiple named outputs (OSC, TUIO, WebSocket, JSON) each created and configured per destination in the UI, with presets per target application.

### Cited Findings
- Augmenta Fusion presets control output; for TouchDesigner OSC and TUIO are sent on the same port by default while for Notch they use separate ports (TUIO 13000, OSC 13100). — [Augmenta Notch example](https://www.github.com/Augmenta-tech/Augmenta-notch-example)
- In Augmenta a WebSocket output is created under Setup → Sources & Outputs → Output → Generic → Websocket. — [Augmenta TD native plugin](https://docs.augmenta.tech/create-content/touchdesigner-native-plugin-(new-!))
- Augmenta provides an Ableton Live "Zone Clip Trigger" integration, showing zones used as triggers for music. — [Augmenta Ableton Zone Clip Trigger](https://docs.augmenta.tech/create-content/ableton-live/zone-clip-trigger)
- Augmenta's Unity integration requires a separate manager per stream on a different OSC port, and Unreal distinguishes streams by scene name. — [Augmenta Unity](https://docs.augmenta.tech/create-content/unity); [Augmenta Unreal](https://docs.augmenta.tech/create-content/unreal-engine)

### Inferences
- Output routing UX (proposal modeled on Augmenta presets): a list of destinations, each with protocol (OSC / TUIO / WebSocket), host:port, wall filter, rate cap (for example 30/60 Hz), field set, coordinate space (normalized / pixels / metric), and a per-destination "test" and status LED. Provide presets "TouchDesigner", "Unreal", "Web app".
- Priority after the core three: (1) TUIO 1.1 export, (2) MIDI/ Art-Net / sACN zone triggers (lighting and audio often accompany immersive rooms), (3) HTTP webhooks for zone events, (4) Spout/NDI debug video of the 2D view. This ordering is judgment; I found no usage data. MIDI, Art-Net, sACN, Spout/NDI were not researched.

### Gaps
- No documentation fetched for MIDI, Art-Net/sACN, webhooks, Spout/NDI, or output routing in tools other than Augmenta.
- Augmenta's current OSC v2 address layout and JSON schema were not retrievable (the wiki redirects to docs.augmenta.tech and the subpage was not found).

## Part B: calibration and setup workflow of comparable tools

### Takeaway
Augmenta's documented flow is: network with a DHCP router, per-node web UI panels (Input, Background, Processing, Output), scene size in meters, two-point calibration by placing an object and dragging a transformer while the merged view is projected, then walk-through validation. This supports the proposed wizard. No Hokuyo or other LiDAR-touch tool docs were reviewed.

### Cited Findings
- Network: use a router not a switch so nodes get IPs; nodes fall back to 169.254.x.x link-local; sources can be added manually by MAC or IP and woken/restarted from the app. — [Augmenta legacy setup guide](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)
- Placement for LiDAR: mount high enough that rays don't hit the floor, out of reach, minimal occlusion; verify overlaps by placing an object seen by both nodes. — [Augmenta legacy setup guide](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)
- Node web UI sequential panels: Input (masks, range), Background, Processing (min object size, noise threshold; for LiDAR, larger size filter reduces false points from limbs), Output; goal is stable blobs with bounding boxes; config auto-saves. — [Augmenta legacy setup guide](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)
- Fusion: enter scene area in meters and output resolution with matching aspect ratio; add sources by auto-detect or IP; two-point calibration with only one source enabled, Spout video of the merger on the projection, drag/rotate/scale a transformer until the detected point matches an object at two opposite positions (Shift-drag rotate/scale, Alt-drag anchor, right-click snap). — [Augmenta legacy setup guide](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)
- Validation: walk the area including overlaps and confirm points match real positions. After calibration the video output is no longer needed; consider disabling the background for long installs because data can drift with temperature. — [Augmenta legacy setup guide](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)
- Augmenta's guide is marked legacy and focuses on camera nodes; the LiDAR content is limited. — same source.

### Inferences (wizard proposal)
1. Discover sensors (RPLIDAR S2E over Ethernet: scan subnet / manual IP; show health). 2. Name and assign to wall. 3. Enter wall width/height (or import plan) and projector region in the 3840x2400 canvas. 4. Capture background/mask while room is empty (average N scans, mask static points beyond wall plane). 5. Align scan plane to wall (set offset, distance threshold band). 6. Target calibration: tracker draws targets (corners plus center, at least 4 to 9 points) on that wall's quadrant; operator touches each; auto-advance on stable touch (position variance below threshold for about 0.5 s); fit homography from LiDAR-plane coordinates to normalized wall coordinates; show residual error per target. 7. Validation: free touch test with trails, heatmap, max/mean residual with pass/fail threshold. 8. Draw zones on the wall view. 9. Configure outputs. 10. Save venue profile (JSON, versioned, exportable for reuse across rooms). Steps follow Augmenta's sequence; the projected-target homography step and thresholds are my design (not documented in the sources found).

### Gaps
- No documentation retrieved for Hokuyo-based touch software, TouchDesigner LiDAR workflows, or other LiDAR touch products.
- No source for target-count or tolerance numbers.

## Mobile/tablet UI patterns, auto-advance calibration, network setup, i18n

### Takeaway
Only partial sourcing. Open Stage Control provides a precedent for a server-hosted web UI reached from any browser on the LAN, but I could not confirm its PWA/QR/auth features. PWA install needs HTTPS or localhost, which matters for a LAN tablet. Wi-Fi client isolation is the main network pitfall.

### Cited Findings
- Open Stage Control runs as a server; any compatible browser pointed at its address creates a client instance, and the server displays its address on start; its changelog mentions a QR code feature (fix for QR code not updating when network changes). PWA support was not confirmed. — [Open Stage Control (ammd.net)](https://ammd.net/Open-Stage-Control); [changelog](https://openstagecontrol.ammd.net/docs/changelog)
- PWA installability (Chromium) requires a manifest with name/short_name, 192 px and 512 px icons, start_url, display; must be served over HTTPS or from localhost/127.0.0.1 (plain HTTP allowed only for localhost); service workers are not required for installability. — [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- Wi-Fi client isolation: on Meraki, clients on an isolated SSID can generally reach only the default gateway; WatchGuard (8.6.x+) also blocks wireless clients from wired hosts; Ruckus has separate wired client isolation; Peplink guest protect blocks Wi-Fi to wired on the same VLAN; the fix is to disable isolation for the SSID or use a VLAN with firewall rules, and behaviour varies by vendor/firmware. — [Meraki](https://documentation.meraki.com/MR/Design_and_Configure/Firewall_and_Traffic_Shaping/Wireless_Client_Isolation); [WatchGuard](https://www.watchguard.com/help/docs/help-center/en-US/content/en-us/Fireware/wireless/ap_station_isolation_c.html); [Peplink forum](https://forum.peplink.com/t/lan-to-wifi-devices-communicating/29855/2)
- Augmenta's UI patterns: sequential panels, source list with add button, Inspector, drag/rotate transformer gestures. — [Augmenta legacy setup guide](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)

### Inferences
- Over plain HTTP on a LAN IP, the tablet cannot install a PWA (not localhost). Options: the app serves HTTPS with a self-signed or locally trusted certificate (certificate trust friction), or skip install and use "Add to home screen" shortcut/ browser fullscreen; test on iPad Safari and Android Chrome (not verified).
- Network recommendation: a dedicated travel router / AP in the room, wired to the same switch as the sensors and tracker PC, client isolation off, DHCP reservation for the tracker (or hostname via mDNS), QR code on the tracker's screen with the URL. Mention the venue-IT requirement early in docs.
- Operator lock: one controlling session with a token; others read-only; auto-release after idle timeout; always show connection state and who holds the lock.
- Touch-wall calibration UX: the tablet shows progress ring and current target index; the wall shows the large target; auto-advance after a stable touch with brief audio/haptic ("vibrate") confirmation; Undo for last point; allow manual advance via big button for one-handed use. Dark theme with high contrast. All design guidance here is unsourced.
- i18n (ES/CA/EN): ICU message-format catalogs (for example i18next); not sourced. Operator docs: short illustrated quick-start PDF per language plus in-app step help.

### Gaps
- No source found for tablet layout best practices, haptics/sound confirmation research, operator-lock patterns, venue Wi-Fi norms for immersive rooms, or i18n/documentation patterns; these are design judgments only.
- Open Stage Control official docs returned 403; PWA/auth features unverified.
