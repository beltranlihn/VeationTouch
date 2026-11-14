# Documented installations using non-RPLIDAR 2D LiDAR / laser range finders for touch walls and immersive rooms

Scope note: ~17 tool calls. Public engineering detail is sparse. Most studio pages are marketing and omit sensor models, plane distance, calibration and latency. The richest source is the Immersive Gamebox patent (US11467695B1). Many items below are "not documented"; see Gaps. No quantitative accuracy or latency figures were found for any LiDAR touch wall except where stated.

## 1. Documented touch-wall / immersive-room projects with 2D LiDAR (model, count, placement, software, calibration, issues)

### Takeaway
The only documented multi-wall room with an engineering description is Immersive Gamebox (patent): one 2D LiDAR per wall, detection plane slightly in front of a frameless projected wall, with a two-phase calibration. Ars Electronica pharus (ankle-height floor tracking) and Augmenta (4 LiDARs on a touch wall at ISE/InfoComm 2024) are documented but with little detail. Academic precedents (MIT LaserWall, Hirai ISS/ITS 2011 two-scanner wall) establish the occlusion problem and the multi-scanner merge solution.

### Cited Findings

**Immersive Gamebox (patent US11467695B1, "Touchscreen display system", filed 2021-09-16, granted 2022-10-11)**
- Inventors William Thomas Dean and Jan Breens; original assignee Immersive Group Gaming Ltd, current assignee listed as Immersive Gamebox Ltd — [Google Patents](https://patents.google.com/patent/US11467695)
- Main example is an interactive room with four walls, three of them interactive (front, left, right), each with its own lidar sensor (102-F/L/R); one, two, three or all four walls may be interactive. Projectors sit at or near the ceiling — [Google Patents](https://patents.google.com/patent/US11467695); search-result summary of the same patent: [USPTO PDF](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11467695) (the PDF itself is scanned images, not extractable by me; claims were read via the Google Patents text)
- Touch is detected by a single lidar sensor per display screen, not by sensors in a display border; display is "frameless" so the image runs edge to edge across adjacent walls — [Google Patents](https://patents.google.com/patent/US11467695)
- Detection plane is adjacent to and roughly parallel with the screen, extending down to the floor, "slightly in front of the display screen" so no physical contact is needed; no numeric distance given, only that the gap is small enough not to be readily apparent in use — [Google Patents](https://patents.google.com/patent/US11467695)
- Sensor placement: on the screen itself in the main example, but ceiling or floor recess also possible; ideal location on the wall's horizontal centerline with the vertical axis pointing down; misalignment is expected and handled by calibration — [Google Patents](https://patents.google.com/patent/US11467695)
- Calibration phase 1 (geometry): with nothing in the room the sensor scans adjacent walls and floor, fits lines to the returns using the known room layout, estimates its own position/orientation, converts detections to normalized surface coordinates. Phase 2 (mapping): the system displays targets at known coordinates, a user touches each; the mapping compensates skew; three targets generally sufficient — [Google Patents](https://patents.google.com/patent/US11467695)
- Rejecting adjacent walls/floor: buffer region inside the fitted wall and floor lines, maximum object size (wall returns cluster into much larger objects), or known surface positions — [Google Patents](https://patents.google.com/patent/US11467695)
- Detection algorithm: polar to (x, y); cluster points within a threshold distance; fit a circle to each cluster; accept as touch only if radius is between min and max (tuned to a human hand scale), which rejects spurious returns such as reflections from an opened door — [Google Patents](https://patents.google.com/patent/US11467695)
- Each wall's touches are aggregated per object into one touch input. Latency, touch-count limit and sensor-to-sensor interference are NOT stated in the portion I read (about the first 100k of 143k characters) — [Google Patents](https://patents.google.com/patent/US11467695)

**Augmenta / Théoriz / Christie (ISE and InfoComm 2024 immersive room)**
- Room used six Christie 4K13-HS projectors; Augmenta used four "new generation" 2D LiDAR sensors so visitors could use the wall as a large touch surface, "up to a finger detection precision" (vendor claim); four 3D network cameras handled the floor — [Christie](https://christiedigital.com/spotlight/how-to-create-an-immersive-experience)
- All sensors connected to a tracking server (in the technical booth) that handled processing, calibration and data formatting — [Christie](https://christiedigital.com/spotlight/how-to-create-an-immersive-experience)
- Stated main challenge: strategically positioning an optimal number of sensors to keep precision during peak crowd periods. Sensor model, mount positions, calibration procedure and latency not given — [Christie](https://christiedigital.com/spotlight/how-to-create-an-immersive-experience)

**Augmenta Utopia (30 x 10 x 6 m space; 20 x 10 m interactive floor, 20 x 6 m interactive wall)**
- 1x Augmenta Pro8 server + 6x SICK Visionary T-mini (3D ToF, not 2D LiDAR) mounted at 6 m for the floor; budget did not allow wall sensors so people's height data from floor sensors drove "portal" effects near the wall; three servers (Augmenta, TouchDesigner, Unity) on a standard switch. Reported via a search-result summary of a mirror page: [kelaenderkoe mirror of augmenta.tech/utopia](https://kelaenderkoe.pages.dev/Using-https-augmenta.tech/utopia) (second-hand mirror; not verified against augmenta.tech directly)

**Augmenta legacy setup guide (general guidance)**
- For lidars: mount out of people's reach, high enough to keep rays off the surface, avoid occlusion (e.g. top middle of a wall); angular resolution limits smallest detectable object, which grows with distance — [Augmenta legacy guide](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)
- Nodes calibrated in AugmentaFusion with a two-point process; use a router (not a switch) so nodes get IP addresses; OSC between nodes and fusion server — [Augmenta legacy guide](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)
- Camera-node guidance (not LiDAR): 0.5-2 m overlap between nodes, roughly 30% — [Augmenta legacy guide](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)

**Ars Electronica Futurelab pharus (Deep Space 8K and others)**
- 2D laser rangefinders mounted at "ankle height" around the interaction surface; number varies by application ("less or more"); Object Slicer variant used four; each sensor records the contour of its surroundings and contours are combined; if one sensor loses line of sight others take over; if all lose it the system predicts motion briefly; no markers; up to 30 people simultaneously in Deep Space 8K per an early test; in the X-Reality-Lab a second unit has sensors on the ceiling facing down along the perimeter — [Ars Electronica Futurelab](https://ars.electronica.art/futurelab/?p=17221)
- Search-result summary (not fully verified): six laser sensors around the Deep Space floor edge; otto Naderer main researcher — [Ars Electronica Futurelab](https://ars.electronica.art/futurelab/?p=17221), [Deep Space 8K Interactive](https://ars.electronica.art/center/en/deepspace-interactive)
- A university resource page says Hokuyo UTM-30LX-EW was used by Ars Electronica Futurelab; the sensor brand for pharus is NOT confirmed by Ars Electronica's own page — [HKU Bookstack](https://bookstack.hku.nl/books/sensors/page/lidar-scanners)

**Logic Integration 50-foot LED touchscreen (2026 CEPro)**
- LiDAR-based touch sensing deployed across an LED canvas; sensor model, count, placement, software, calibration not stated (equipment list mentions "OptiTUIO Sensor Mounts", suggesting a TUIO-based pipeline, unconfirmed) — [CEPro](https://www.cepro.com/projects/logic-integration-builds-50-foot-touchscreen-with-microleds-and-lidar/629649/)

**Other**
- Milan MUST science museum used a SICK LMS100-10000 with OSC from a custom app to Processing — [HKU Bookstack](https://bookstack.hku.nl/books/sensors/page/lidar-scanners)
- World Habitat Day 2025 immersive room: "Hokuyo LiDAR sensors", Unity, wall summons butterfly particles; no count/placement/calibration (portfolio page) — [Aditya Rahmanda](https://adityarahmanda.github.io/en/works/202510-world-habitat-day-2025/)
- Commercial Laser's Track software supports Hokuyo UST-10LX/20LX/30LX (Ethernet TCP 10940), URG-04LX-UG01, UTM-30LX; multiple lasers fused so a finger seen by two sensors becomes one contact; per-sensor pose (X/Y, rotation, mirror), min/max range, inclusion/exclusion rectangles; outputs Windows Touch, TUIO 1.1 and raw OSC. No accuracy/latency/plane-height figures published (vendor page) — [Laser's Track](https://laserstrack.pages.dev/)
- Academic: Hirai et al., "Multi-touch wall display system using multiple laser range scanners", ACM ITS/ISS 2011 (DOI 10.1145/2076354.2076408): two scanners to reduce occlusion; each scanner reports touch positions/areas; overlapping touches merged into one event; TUIO output. I read only the abstract via summary; full text blocked (ACM 403) — [DOI](https://doi.org/10.1145/2076354.2076408), [Unpaywall](https://unpaywall.org/10.1145%2F2076354.2076408)
- MIT LaserWall (Paradiso, Strickon, 1997/98): scanning laser rangefinder, phase-shift ranging, up to 30 Hz over 90 degrees, hand-sized objects detected several metres away; multiple hands tracked only if they do not occlude each other; no numeric accuracy or latency — [MIT Media Lab](https://paradiso.media.mit.edu/SpectrumWeb/captions/Laser.html), CHI '98 paper [PDF](https://cba-mit-edu.ezproxy.canberra.edu.au/docs/papers/98.1.CHI98_Laser.pdf)
- An IEEE ICTC 2022 paper reportedly describes a LIDAR touch system with tangible interaction on five surfaces (four walls and a floor) using a network of distance sensors; I could not open it (redirect to IEEE Xplore not completed) — [DOI](https://doi.org/10.1109/ICTC55196.2022.9952443)
- Not a LiDAR system but sometimes confused: KL Multimedia "Arc Wall Interaction" uses an IR laser curtain plus camera, 1 mm claimed accuracy, 30 touches, 60 FPS — [KL Multimedia](https://www.klmultimedia.com/Arc-Wall-Interaction.html)

### Inferences
- The Immersive Gamebox design is the closest documented analogue to the Barcelona XR Lab: one sensor per wall, centerline-top mounting, scan plane in front of a frameless projected surface, geometric self-calibration from wall/floor lines plus a touch-target mapping (3 points).
- Cluster-then-circle-fit with a min/max radius is a documented, simple discriminator for hand-sized objects and for rejecting wall returns; it should map directly onto RPLIDAR S2E data.
- Gamebox's room is small (groups of players), so its single-sensor-per-wall approach may not scale to 4-15 simultaneous touches per wall; the Hirai two-scanner merge and Augmenta's four-sensor wall suggest redundancy when crowds occlude each other.

### Gaps
- Sensor models and mount positions for the Augmenta/Christie wall, Atelier des Lumieres, Frameless, Illuminarium, ARTECHOUSE, teamLab, Moment Factory, Dotdotdot, Onformative, Hellicar, Superbien: not found; searched only the first two queries broadly, no studio page with engineering detail surfaced.
- Hirai 2011 full text (sensor model, accuracy, latency, merge algorithm) not accessible.
- Gamebox patent: second 43k characters unread; may contain latency/interference/multi-touch details.

## 2. Multi-wall rooms: corners, crosstalk, people standing close to walls

### Takeaway
Only the Gamebox patent documents multi-wall handling: every wall has its own sensor and exclusion of adjacent wall/floor returns by fitted lines plus buffers. No source documented inter-sensor optical crosstalk.

### Cited Findings
- Adjacent walls and the floor have their own sensors so the display runs edge to edge; returns from adjacent surfaces are excluded via buffer inside the fitted wall/floor lines, max object size, or known surface positions — [Google Patents](https://patents.google.com/patent/US11467695)
- Reflections (e.g. from an opened door) are a documented false-positive source, handled by min/max cluster radius — [Google Patents](https://patents.google.com/patent/US11467695)
- pharus fuses multiple sensors and hands over tracks when a sensor loses line of sight, plus short motion prediction to bridge dropouts — [Ars Electronica Futurelab](https://ars.electronica.art/futurelab/?p=17221)
- Augmenta's lidar guidance: mount high on the wall (top middle) to avoid occlusion and keep out of reach — [Augmenta legacy guide](https://augmenta.gitbook.io/legacy-augmenta-setup-guide)

### Inferences
- A sensor on one wall's centerline sees the adjacent wall surfaces at near-grazing angles; the patent's fitted-line plus buffer exclusion is the documented answer for the corner problem.
- Crosstalk between S2E units (different 2D scan planes at roughly the same height) is unaddressed in sources; would need on-site testing (assumption).

### Gaps
- No documented crosstalk issue or fix between adjacent-wall LiDARs.
- No data on how close to a wall people stand versus plane distance.

## 3. Best-practice guides from vendors / integrators / community

### Takeaway
Vendor guides are generic. Practical items: TouchDesigner has native Hokuyo and Blob Track CHOPs; HKU notes a 10 Hz scanner is considered too slow for position tracking while 40 Hz UST-10LX is OK. This matters for the 10 Hz S2E.

### Cited Findings
- Hokuyo CHOP supports Ethernet models (UST-10LX tested), 0.25 degree resolution, 1080 points over 270 degrees — [Derivative Hokuyo CHOP](https://docs.derivative.ca/Hokuyo_CHOP)
- Blob Track CHOP expects tx/ty channels and has a max-blob-movement setting for frame-to-frame identity; Leuze ROD4 CHOP has built-in blob tracking giving unique IDs — [Derivative Blob Track CHOP](https://docs.derivative.ca/Blob_Track_CHOP), [Leuze ROD4 CHOP](https://derivative.ca/UserGuide/Leuze_ROD4_CHOP)
- HKU: URG-04LX-UG01 (10 Hz) scanning frequency "too slow for position tracking"; UST-10LX 40 Hz "fast enough"; suggests two or four units — [HKU Bookstack](https://bookstack.hku.nl/books/sensors/page/lidar-scanners)
- Latency benchmarks for other sensing methods: under 70 ms for depth-sensor touch (ISS '22), 66-82 ms camera tabletop; HID injection lower latency than TUIO per a 2012 Calgary thesis — summarized from search results, [Xiao ISS'22](https://www.robertxiao.ca/research/low-latency-touch/), [Calgary thesis](https://ucalgary.scholaris.ca/server/api/core/bitstreams/503b9800-5806-4688-8640-50e6cfef7aa5/content) (not opened)

### Inferences
- At 10 Hz the S2E's inter-scan period alone is 100 ms; the HKU remark is about floor-position tracking, so relevance to touch is likely greater (fast swipes), but this is untested here.

### Gaps
- No Hokuyo application note, Lightact, MAD/Modulo Kinetic or TouchDesigner forum case study with wall-touch engineering found.
- No documented quantitative plane-to-wall distance, accuracy or sensor height for any touch wall beyond the "slightly in front" statement.
