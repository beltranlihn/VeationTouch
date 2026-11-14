# LiDAR touch-wall processing pipeline: signal processing, tracking and calibration

Method note: about 13 tool calls. Several primary sources returned 403 or access-denied (OpenCV docs, HAL copy of the 1 Euro paper, ACM paper full text). Only things actually fetched are in "Cited Findings". Everything else is either my own engineering inference (labelled "Inference") or recalled textbook knowledge that I could not re-verify here (labelled "Recalled, unverified"). Defaults are estimates unless cited. The sections are ordered as the pipeline runs.

## 1. Sensor facts and raw-sample pipeline (polar to Cartesian, filtering, ROI, background, outliers)

### Takeaway
S2E gives about 32k samples/s at 10 Hz, which is about 3200 samples per rotation at 0.1125 deg, so each wall (an arc of roughly 90 to 180 deg, as the sensor sits on the wall plane) gets 800 to 1600 samples per frame. A per-angle-bin background model plus an ROI polygon and a ROS-style shadow/mixed-pixel filter is the standard, cheap front end.

### Cited Findings
- RPLIDAR S2E: 32,000 samples/s, 10 Hz typical scan frequency, 0.1125 deg typical angular resolution, range 0.05 to 30 m at 90% reflectivity and 0.05 to 10 m at 10% reflectivity, network (Ethernet) port, outputs range and intensity. — [Slamtec S2](http://www.slamtec.com/en/s2)
- ROS `laser_filters` is BSD-3-Clause (Willow Garage), so reusable in proprietary software; the repo is "assorted filters for 2D planar laser scanners". — [ros-perception/laser_filters](https://github.com/ros-perception/laser_filters)
- ROS ScanShadowsFilter removes mixed-pixel/shadow-edge points: for each beam i it compares range against beams within `window` on each side, tests the angle between the two sensor-origin lines using `min_angle`/`max_angle` (clamped to [0,90] / [90,180]), and if flagged NaNs the farther points (`neighbors` default 0, `remove_shadow_start_point` default false). Required params have no defaults; the exact isShadow criterion was not visible in the fetched header. — [scan_shadows_filter.h](https://raw.githubusercontent.com/ros-perception/laser_filters/ros2/include/laser_filters/scan_shadows_filter.h)

### Inferences
- Polar to Cartesian in sensor frame: x = r cos(theta), y = r sin(theta), theta in radians, applying the S2E's angle offset and flipping sign if the driver reports clockwise angles. Do this once per sample into preallocated Float32Array x[], y[]. Cost is about 3,200 sin/cos per scan; precompute sin/cos tables per angle bin since bins are fixed after resampling.
- Resample each scan into fixed angular bins (for example 0.1125 deg, or 0.225 deg merging pairs) so that each bin index maps to a stable background value. Take nearest-angle or the median of samples falling in the bin. Mark missing bins NaN.
- Quality gates (estimate): drop range <= 0 or invalid; drop range < 0.05 m; drop intensity/quality below a low threshold learned per install (log the intensity histogram first; do not hardcode). Drop ranges beyond the wall diagonal plus margin.
- ROI mask: transform points into wall frame (see section 8) and keep points inside the wall rectangle expanded by a small margin (estimate 2 to 5 cm) and inside depth band d in [0, D_max] from the wall (D_max about 8 to 10 cm for a plane 2 to 3 cm off the wall). The wall itself, floor and ceiling are then excluded geometrically plus by the background model. Prefer a polygon ROI per sensor so irregular rooms and door frames can be cut out.
- Background model (per bin): capture N = 50 to 100 scans (5 to 10 s) of an empty wall; store median range B[i] and a spread (MAD or p5-p95) S[i]. Foreground if B[i] - r[i] > max(T_min, k*S[i]) with T_min about 30 to 40 mm and k about 4 (estimate). Only "closer than background" counts as foreground. Because the sensor sees the wall edge-on, many bins hit the wall or floor at grazing angles; expect larger S[i] there, and per-bin thresholds handle flickering bins. Bins with S[i] above a limit (estimate 30 mm) are flagged "unstable" and ignored or require a larger threshold.
- Static capture plus very slow adaptive update is the safe default: update B[i] only for bins judged background for > 10 to 30 s, with an update rate about 0.01 per frame, and freeze updates in bins near active tracks (otherwise a hand resting on the wall is absorbed into background). Offer a manual "re-learn" button and an automatic re-learn when no foreground is seen for X minutes.
- Cleaning order (estimate): range/quality gate, ROS-style shadow filter (suggested min_angle about 5 deg, max_angle about 175 deg, window 2 to 3; tune on recordings), bin median over 3 samples, background subtraction, ROI mask, speckle removal (drop isolated foreground runs of 1 point unless range is far, because at 1.5 m a 1 cm finger is about 3 to 5 samples, but at 4 m only about 1 to 2).
- Point spacing: arc spacing = r * 0.1125 deg * pi/180 = r * 0.00196, i.e. about 2 mm at 1 m, 4 mm at 2 m, 8 mm at 4 m. A 15 mm finger gets about 7, 4 and 2 samples at 1, 2 and 4 m. Useful for size gates.

### Gaps
- No source found giving S2E ranging noise (mm) or its behavior on skin, black clothing or at grazing angles; it must be measured on site. The S2E datasheet fetched has no accuracy number.
- No source found for the exact ROS `isShadow` threshold behavior or recommended values.

## 2. Segmentation and clustering, contact-point estimation, hand vs arm vs body

### Takeaway
For a 1D-ordered scan, angular-adjacency segmentation (break when consecutive points differ in range or Euclidean gap exceeds a range-adaptive threshold) is O(n), simpler and better than DBSCAN; it is the usual choice. The visible arc is on the sensor-facing side, so contact point must be pushed back from the arc.

### Cited Findings
- The 2011 ACM ISS paper "Multi-touch wall display system using multiple laser range scanners" uses two scanners, each reports touch positions and/or areas, and merges the same touch seen by both into one event sent over TUIO. — [Unpaywall/ACM 10.1145/2076354.2076408](https://unpaywall.org/10.1145%2F2076354.2076408) (abstract-level only; full text not read)
- MIT LaserWall (Strickon and Paradiso): scanner sweeps 90 deg, finds intensity peaks per object, sends angle and range; tracks several hands "provided they don't occlude one another"; up to 30 Hz. — [The LaserWall](https://paradiso.media.mit.edu/SpectrumWeb/captions/Laser.html)

### Inferences
- Segment: iterate bins in angle order over foreground points; start a new segment when |r_i - r_{i-1}| > T_r or Euclidean distance d > T_d(r) = max(d_min, c * r * dtheta) with c about 3 to 4 (tolerates 1 to 2 missing samples) and d_min about 15 to 20 mm; also allow bridging a gap of up to 1 to 2 invalid bins. Equivalent to the classic Dietmayer adaptive breakpoint detector (Recalled, unverified: Dietmayer et al., "Model based object classification and object tracking in traffic scenes from range images", 2001).
- DBSCAN (Ester et al. 1996) with eps = f(range) is workable but needs a KD-tree/grid and a range-dependent eps, which standard implementations do not support; use only for 2D merging of multi-sensor point clouds in the overlap area (eps about 20 to 30 mm, minPts 2 to 3). Typical-range data size (a few hundred points) makes either cheap.
- Size gating on cluster chord width w (Euclidean distance between endpoints) and point count: finger/pen 8 to 25 mm (use only if you want fine touch); hand/fist 60 to 140 mm; forearm 40 to 90 mm wide but elongated along the beam; body 250 to 500 mm. Estimates; calibrate with real sessions. Defaults: accept touch blobs with w in [10, 180] mm and >= 2 points; classify w > 180 to 200 mm as "large object" (body, shoulder, backpack) and either suppress or emit a separate event type.
- Contact point: the sensor sees only the near side of the hand (front arc toward the sensor), so the centroid of visible points is biased toward the sensor by roughly half the hand's depth (estimate 15 to 40 mm). Options: (a) centroid of visible points (lowest variance, biased); (b) closest-to-wall point (noisy, tied to the leading edge); (c) fit a circle of fixed radius R_hand about 25 to 35 mm to the arc and take the center (best accuracy if the cluster has >= 5 points; with fewer, fall back to centroid pushed along the ray by R_hand). Recommended default: centroid of the arc + R_hand_offset (about 20 mm, tunable per install) along the ray from sensor to centroid, then correct empirically using the calibration targets (the homography absorbs a constant bias but not one that depends on range or angle; use a few extra targets at near and far places to check).
- Arm/body entering the plane: if the cluster is wide (> 180 mm) or elongated radially (point range spread > 150 mm along a short angular span), the wall-touching point is not the centroid. Take the cluster extremity farthest from the sensor along the wall, or the point of the cluster closest to the wall (min wall-normal distance d_wall), as the touch candidate; flag low confidence. Alternatively, split the large segment by local minima in wall distance. This is a heuristic with no source; evaluate on recordings.
- Track-level logic helps: a hand touching the wall often presents as a small blob that merges into a large blob when the arm or body enters the plane; keep the track alive by feeding it the "nearest extremity" while the large cluster contains the track's predicted position.

### Gaps
- No paper found with quantified accuracy of contact-point estimators for 2D LiDAR hand tracking (circle fit vs centroid). The 2011 ISS paper full text was not accessible. Treat the bias numbers as hypotheses to measure.

## 3. Touch vs hover: definition of touch, plane distance, false-touch reduction

### Takeaway
The plane offset is the primary "touch" definition: anything crossing the plane is a touch. A smaller offset gives fewer hover false-positives but needs a flat wall and more rigid sensor mount.

### Cited Findings
- Paradiso's survey describes laser rangefinders for tracking hands "above" surfaces, i.e. plane just above the display. — [Paradiso, Retrofitting Surfaces](https://resenv.media.mit.edu/classarchive/MAS965/readings/ParadisoRetrofitSurfaces.pdf) (as summarized by search result; text not read)
- The TouchDesigner LiDARTracker asset uses user-drawn scanning area (4 points) and multiple touch areas / trigger ranges. — [Derivative LiDARTracker](https://derivative.ca/community-post/asset/lidar-component-lidartracker)

### Inferences
- Plane offset: a plane 1 to 3 cm from the wall surface is typical in practice (unsourced; common installs I am aware of use roughly 1 to 3 cm). Below about 1 cm wall flatness and sensor tilt cause the plane to hit the wall at one end; above about 4 cm people trigger by hovering/pointing. Recommend 15 to 25 mm and a mounting jig plus a tilt check: measure wall-hit bins at the far end of the scan; if the background range at wall-grazing bins varies by more than a few mm along the wall, the plane is not parallel.
- False-touch reduction: (1) minimum blob size/point count; (2) dwell/confirmation: tracks are born after K = 2 to 3 consecutive frames (200 to 300 ms at 10 Hz; 2 frames = 200 ms is a compromise); (3) speed gate: reject birth if speed > about 2 m/s; (4) reject "large object" blobs; (5) reject blobs whose background-distance (depth into the plane) is below a threshold at far range where the noise exceeds it; (6) per-zone masks for door/furniture areas.
- Hovering vs touching cannot be distinguished by one plane. A second plane (second scanner stacked) is the only real fix; out of scope for this product unless later requested.

### Gaps
- No quantitative practitioner source for plane distance was found; the TouchDesigner forum search did not return relevant threads in the fetched results.

## 4. Occlusion with one sensor at the top of the wall

### Takeaway
A single scanner cannot see a touch directly behind another along the same ray. Two scanners per wall, in opposite corners (or one top-center plus one more), reduce this; track persistence bridges short gaps.

### Cited Findings
- 2011 ISS paper: occlusion is the central problem for a single range scanner; it adds a second scanner and merges duplicates into TUIO events. — [Unpaywall/ACM 10.1145/2076354.2076408](https://unpaywall.org/10.1145%2F2076354.2076408)
- Paradiso survey: for simple cases with few hands, a tracking filter can extrapolate trajectory of an occluded hand through the shadow. — [Paradiso, Retrofitting Surfaces](https://resenv.media.mit.edu/classarchive/MAS965/readings/ParadisoRetrofitSurfaces.pdf)
- LaserWall tracks several hands only "provided they don't occlude one another". — [The LaserWall](https://paradiso.media.mit.edu/SpectrumWeb/captions/Laser.html)

### Inferences
- Geometry: from a top-center sensor at height H above a point, hands sharing the same bearing angle within the angular width of the closer hand are shadowed. A hand of width 10 cm at range 1 m subtends about 5.7 deg and shadows the 10 to 11 cm lateral width behind it; at 2 m it subtends 2.9 deg. For a 4 m wall with a sensor at top center, vertical-column conflicts (a person's two hands stacked vertically below one another near the center line) are the common case: the upper hand hides the lower. Sensors at the wall's top corners reduce this, because hands on the same vertical column have different bearings from the corner. Two sensors in opposite top corners reduce shadowing probability further (a point is hidden from both only if collinear with both, rare).
- Also, body shadowing: a person standing at the wall with arm raised between sensor and another person's hand. Corner placement helps.
- Mitigations ranked: (1) two sensors on opposite top corners of each wall (architecture supports N sensors per wall); (2) track persistence: coast tracks up to 3 to 5 frames (0.3 to 0.5 s) with constant-velocity extrapolation and wider gate; (3) mark a track "occluded" if a closer foreground cluster covers its bearing, rather than ending it (angular occlusion test); (4) hold the last position (zero velocity) after the coast time, release after a longer timeout (1 to 2 s), only if occluded.
- Quantification is not available from sources; compute from the room geometry in simulation (Monte-Carlo random hands, N = 4 to 15 people) in the offline tool to give customers occlusion maps.

### Gaps
- No quantitative occlusion rates found in accessible sources.

## 5. Tracking: association, lifecycle, motion models, smoothing

### Takeaway
Global nearest-neighbor association with Hungarian assignment and a distance gate, a constant-velocity Kalman filter for prediction, and a One Euro filter for output smoothing is a sound, simple combination. At 10 Hz, make gates generous and rely on the Kalman prediction.

### Cited Findings
- One Euro filter has parameters mincutoff (fcmin, must be > 0; lowering reduces jitter, increases lag) and beta (speed coefficient; raising reduces lag at speed); tuning: set beta = 0 and fcmin about 1 Hz, adjust fcmin while holding still, then raise beta starting around 0.001 or 0.0001 in steps of 10 while moving fast. — [Casiez 1 Euro filter page](https://gery.casiez.net/1euro/)
- Reference implementations of the 1 Euro filter are available under BSD or MIT in Python, C, C++, Java, JavaScript and TypeScript (permissive, reusable). — [Casiez 1 Euro filter page](https://gery.casiez.net/1euro/)
- The page did not state dcutoff; other implementations default it to 1 Hz (Recalled, unverified).

### Inferences
- One Euro equations (Recalled from Casiez, Roussel, Vogel, CHI 2012; unverified in this session): alpha(fc) = 1 / (1 + tau/Te) with tau = 1/(2*pi*fc); dx = (x - x_prev)/Te, dx_hat = lowpass(dx, alpha(dcutoff)); fc = fcmin + beta * |dx_hat|; x_hat = lowpass(x, alpha(fc)). Te should be the real frame interval (use timestamps, not a fixed constant). Apply per axis in wall coordinates (mm) — beta then has units 1/mm-scale; recommended starting point for coordinates in mm and 10 Hz input: fcmin = 1.0 Hz, beta = 0.005 to 0.02, dcutoff = 1.0 Hz (estimates). Note the Nyquist limit: at 10 Hz input, cutoffs above about 3 to 4 Hz give little smoothing.
- Run One Euro at the 60 Hz output rate on the interpolated/predicted stream, or at 10 Hz on measurements? Recommend: filter at measurement rate (10 Hz, with timestamps) to reduce jitter, then do output interpolation/prediction in section 6 to avoid filtering synthetic samples.
- Association: cost = Euclidean distance between track predicted position and detection (mm); gate = max(150 mm, v_pred * dt * 2.5 + 80 mm), i.e. generous because at 10 Hz a hand can move 20 to 30 cm per frame when fast (2 to 3 m/s). Hungarian (Munkres, O(n^3), n <= 30) is trivially cheap. Unmatched detections spawn tentative tracks; unmatched tracks coast.
- Kalman: state [x, y, vx, vy], process noise acceleration sigma_a about 5 to 10 m/s^2 (estimate; hands accelerate hard), measurement noise sigma about 8 to 15 mm (centroid noise, grows with range; use sigma = 8 mm + 3 mm per metre as a starting estimate).
- Lifecycle: tentative -> confirmed after M of N hits (2 of 3), confirmed -> coasting on miss, deleted after 3 to 5 missed frames (0.3 to 0.5 s) normally, extended when occluded. Touch "up" event emitted on deletion; a "down" event emitted when confirmed (loses 1 to 2 frames latency; optionally emit down on the first frame and cancel on false positives, but that produces ghost touches).
- ID reuse: use monotonically increasing session IDs (uint32) for TUIO and WebSocket; for TUIO 1.x session IDs must be unique per active cursor; also provide a small recycled "slot" index (0 to 31) for apps expecting few fingers. Do not recycle session IDs within a session.
- Merge/split handling: if two hands approach until one cluster, keep both tracks alive using prediction for up to about 0.5 s; when the cluster splits, re-associate with the Hungarian algorithm.
- Alternatives: exponential smoothing is a special case of the One Euro filter with fixed cutoff; at 10 Hz alpha of 0.5 gives about 100 ms lag, adequate only for static users. Kalman alone tends to overshoot on abrupt stops; the combination is recommended.

### Gaps
- OpenCV and the Kalman/Hungarian references were not fetched (403); use textbook sources (Bar-Shalom; Kuhn 1955 / Munkres 1957) when writing the spec. No permissive TS Hungarian library was verified here; a short implementation is about 80 lines.

## 6. 10 Hz input to 60 Hz output: interpolation vs prediction, latency, motion skew

### Takeaway
Interpolating between measured points (delay one frame, 100 ms) is smooth but adds latency; extrapolating with a Kalman velocity gives zero added latency but overshoots at stops. Practical default: predict forward using the filtered velocity with damping, capped at the 100 ms frame interval.

### Cited Findings
- LaserWall used up to 30 Hz scanning, reducing this problem versus 10 Hz scanners. — [The LaserWall](https://paradiso.media.mit.edu/SpectrumWeb/captions/Laser.html)
- The S2E scans at 10 Hz typical. — [Slamtec S2](http://www.slamtec.com/en/s2)

### Inferences
- Where output consumers are projectors rendering at 60 Hz, a 10 Hz stream of positions looks steppy (visibly for brush/drag interactions). Options: (A) linear interpolation between the last two filtered positions, rendered at t - 100 ms: no overshoot, latency +100 ms on top of rotation latency of about 50 ms average; (B) extrapolation with damped velocity: p(t) = p_last + v * min(t - t_last, 0.1 s) * decay, zero added latency, overshoot when the hand stops; (C) hybrid: interpolate when a next measurement exists; extrapolate only in the first 50 ms. Provide a user setting "latency vs smoothness" with default (C)/(B) for painting, (A) for triggers. TUIO consumers usually do their own smoothing, so also offer raw 10 Hz output.
- Motion skew: one rotation takes 100 ms, so points at different angles are captured up to 100 ms apart. A hand moving 1 m/s moves 10 cm over a rotation, which matters for fast sweeps but not for the contact position of a single hand (each hand is captured in about 1 ms to several ms, since a 10 cm hand at 1 m subtends about 5.7 deg = about 1.6 ms of rotation). So the within-hand skew is negligible. The cross-hand timestamp error matters: per-point timestamps t_i = t_scan_start + theta_i/(2*pi) * T_rot should be assigned to each detection, and the filters/trackers should use the detection's own timestamp. Cheap and recommended. Needs the driver to expose scan start and rotation angle; if only arrival time is available, estimate from bin angle relative to the angle at which the scan starts.
- Latency budget (estimate): average 50 ms wait for hand to be swept + network and parsing about 5 to 10 ms + confirmation (K frames) 100 to 200 ms for the first touch + output interpolation 0 to 100 ms. The "down" latency is dominated by confirmation.

### Gaps
- No source found on how commercial LiDAR touch products (for example from the TouchDesigner community) handle 10 Hz upsampling.

## 7. Multi-sensor fusion

### Takeaway
Calibrate every sensor into a common wall (or room) frame, track after fusion on the merged detection list (central tracker) rather than per sensor, and de-duplicate in overlap regions with a distance threshold.

### Cited Findings
- 2011 ISS paper: both scanners report touches, same touch seen by both merged into one event. — [Unpaywall/ACM 10.1145/2076354.2076408](https://unpaywall.org/10.1145%2F2076354.2076408)
- TouchDesigner LiDARTracker connects multiple lidars and merges data. — [Derivative LiDARTracker](https://derivative.ca/community-post/asset/lidar-component-lidartracker)

### Inferences
- Pipeline: per-sensor segmentation produces detections in sensor frame; transform with each sensor's 2D rigid transform (R(theta), t) into the wall frame; pool detections; merge pairs from different sensors within d_merge about 30 to 50 mm (about 2x calibration residual) by taking a weighted mean (weight inversely to range squared, because the near sensor has the less noisy and less biased view); then run a single tracker. The contact-point bias correction (section 2) must be applied per sensor before merging, as each sees a different side of the hand.
- If only one sensor sees a position (the other is shadowed), keep the detection; do not require both. Use union rather than intersection.
- Timestamps: use a common monotonic clock (process.hrtime) stamped at packet arrival, minus estimated transport delay; the sensors are not synchronized in rotation phase, so frame times are offset by up to 100 ms; simplest robust approach is to run the tracker on a fixed 20 to 30 Hz tick, feeding the latest detections from each sensor with their age; or treat each sensor scan as an independent measurement update (asynchronous Kalman update), which is the cleaner solution because Kalman filters handle asynchronous measurements naturally.
- Multi-sensor overlaps also cover the case where the same wall has two sensors; per-wall frames are independent otherwise. Four walls = four independent trackers + one output multiplexer.

### Gaps
- No documented algorithm for the fusion in LiDARTracker (README lacks details); the ISS paper's merge radius was not readable.

## 8. Calibration

### Takeaway
(a) Sensor pose: 2D rigid transform estimated from wall-edge geometry or from touch correspondences. (b) Wall-to-pixel: homography via DLT with at least 4 correspondences, RANSAC if more, residual in px and mm. (c) Non-linear residual correction by a grid or thin-plate spline if the RMS residual exceeds the target.

### Cited Findings
- LiDARTracker's calibration is limited to dragging four points to define the scanning range. — [Derivative LiDARTracker](https://derivative.ca/community-post/asset/lidar-component-lidartracker)
- OpenCV `findHomography` supports least-squares, RANSAC, LMEDS, RHO methods with a reprojection threshold (detail not verified; docs returned 403). — [OpenCV calib3d docs](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html) (could not be fetched; recalled from memory, unverified)

### Inferences
**(a) Sensor pose.** Wall frame W: origin at wall top-left (or bottom-left), x along the wall width, y along the wall height (down or up). The scan plane is parallel to the wall, so the problem is 2D and the wall appears in the scan as a line y = 0 only edge-on; what the sensor really sees are objects in the plane. Therefore pose estimation from the wall itself is limited: floor, ceiling, adjacent walls and corners that cross the plane show up as range points. Approaches:
1. Manual/click: user touches known positions (for example 4 corners and center) and the system solves the rigid transform (Kabsch/Procrustes) between sensor-frame points and wall-frame targets. Simple and robust; works with the same touches used for projection calibration.
2. Auto-fit: using the learned background scan, run RANSAC line fitting (sample 2 points, line, count inliers within 15 mm, 200 iterations, accept >= 30 inliers) to find the wall-edge lines (left, right edges of the wall frame, floor line, adjacent-wall faces); then derive the pose from the two orthogonal lines (angle theta from the line direction; translation from the corner intersection), with mirror flag chosen by requiring the sensor to lie on the room side of the wall (cross-product sign test). Refine with point-to-line ICP against a known rectangle model (wall width W by height H, from user input), or generic point-to-point ICP against a prior scan if repeating a calibration. The Kabsch solution for correspondences: centre both sets; H = sum(q_i p_i^T); SVD H = U S V^T; R = U diag(1, det(U V^T)) V^T (the determinant term handles reflection; if the unconstrained det comes out -1 the mirror flag is set); t = q_mean - R p_mean.
3. Mirror: if a sensor is mounted upside down or the driver angle direction is reversed, theta -> -theta. Detect by the sign of det of the best-fit linear map when fitting an affine transform to correspondences with 4+ points.

**(b) Homography DLT** (wall mm -> projector pixel). For each correspondence (x,y) -> (u,v) with Hartley normalisation (translate to centroid, scale mean distance to sqrt(2)) on both sets:
```
A (2n x 9), rows per point:
[-x, -y, -1,  0,  0,  0, u*x, u*y, u]
[ 0,  0,  0, -x, -y, -1, v*x, v*y, v]
solve A h = 0 -> h = last right-singular vector of A (SVD of A^T A, 9x9)
H = T_dst^-1 * reshape(h,3x3) * T_src ; normalise so H[2][2] = 1
apply: [u v w]^T = H [x y 1]^T ; (u/w, v/w)
```
In TypeScript, a 9x9 symmetric eigenproblem can be solved with a small Jacobi eigenvalue routine (about 50 lines, no dependency). A ready dependency (for example `ml-matrix`, MIT) can supply SVD; license verify before use.
RANSAC: for 5+ points, sample 4, solve, count inliers by reprojection error < 8 px (OpenCV's default threshold is 3 px, recalled), 100 to 500 iterations, then re-fit with all inliers. Report RMS in px and in mm (mm = px * wall_mm_per_px). Targets: RMS < 6 to 10 mm on a 4 m wall for hand touches (since human touch targeting error is about 5 to 10 mm or worse; estimate). Recommend a 3x3 target grid (9 points) minimum, 4x4 recommended for walls larger than 3 m. Because the wall for each projector is a 1920x1200 sub-rectangle of the 3840x2400 output, store pixels in 1920x1200 local coordinates and add the 2x2 offsets (0 or 1920, 0 or 1200) at output.

**Non-linear correction.** If RMS after homography > target, fit residual vectors r_i = target_i - H(p_i) with: (1) piecewise bilinear on a grid (interpolate residuals of the grid nodes; cheap, needs a dense grid of 4x4 or more); or (2) thin-plate spline with a small regularisation (radial basis U(r) = r^2 ln r; solve an (n+3)x(n+3) linear system; n <= 25, trivial). Apply TPS as the residual on top of the homography, not instead of it. Beware of overfitting with few points: cross-validate (leave-one-out error).

**(c) Verification.** Show targets at new positions (not used in the fit), record touch errors, show a heatmap/vector field of error (arrow per target), report max, mean and 95th percentile error in mm; a free-draw test shows the live trail on the projection; a "stability" test: place stationary hand and report jitter (std in mm) over 3 s.

### Gaps
- OpenCV docs, the Hartley and Zisserman reference and the thin-plate spline papers were not retrieved; all formulas above are standard but unverified in this session. No permissive TS homography library was verified.

## 9. Event layer: touch down/move/up, hold, zones, simultaneity

### Takeaway
Emit TUIO-style cursor events from confirmed tracks, and derive zone events from polygon hit-testing with hysteresis and debounce.

### Cited Findings
- The ISS 2011 system and TouchDesigner LiDARTracker both output TUIO; LiDARTracker also UDP; LiDARTracker v3.0 added "trigger ranges". — [Unpaywall/ACM](https://unpaywall.org/10.1145%2F2076354.2076408), [Derivative LiDARTracker](https://derivative.ca/community-post/asset/lidar-component-lidartracker), [LidarTracker GitHub](https://github.com/FifthChat/LidarTracker)
- LidarTracker's GitHub repo shows no LICENSE file or license statement; treat it as all-rights-reserved, do not copy code. — [FifthChat/LidarTracker](https://github.com/FifthChat/LidarTracker)

### Inferences
- Events: `down` (track confirmed), `move` (position change > 1 mm or every frame), `up` (track deleted), `hold` (track stationary within radius r_hold = 15 to 20 mm for t_hold = 500 ms, then optionally repeating every 500 ms). Reset stationary timer if the track leaves r_hold.
- Zones: polygon/rectangle in wall mm or UV coordinates; hit-test using point-in-polygon (ray casting) with cheap AABB precheck. Enter when the point is inside for >= 2 frames (debounce); exit when outside the polygon expanded by hysteresis margin (10 to 20 mm) for >= 2 frames. Per-zone state: set of track IDs inside; count; first-enter timestamp; dwell time.
- Zone triggers: `zone_enter`, `zone_exit`, `zone_hold(t)`, with an optional cooldown (for example 300 ms) per zone to avoid retriggering.
- Simultaneity: maintain a sliding window (default 1 s) over zone or wall touches and report the number of distinct track IDs that touched (down event) in the window, plus the current number of active touches; "synchronised touch" events trigger when >= N distinct IDs are present within a zone/wall for >= T ms. Group experiences (4 to 15 people) can use the wall-level count.
- Output formats: TUIO 1.1 2Dcur (/tuio/2Dcur set sessionID x y X Y m; alive; fseq) with normalized coordinates; OSC with custom addresses (/wall/1/touch/<id> x y state); WebSocket JSON with the same event model. TUIO's normalized [0,1] coordinates pair naturally with per-wall UV; for the 2x2 split output include both per-wall UV and full-canvas UV.

### Gaps
- TUIO specification and OSC library licenses (for example `osc-js` MIT; verify) were not fetched.

## 10. Performance, data structures, determinism

### Takeaway
Compute is trivial: about 3,200 samples per scan x 10 Hz x 4 sensors = 128k samples/s, a few microseconds per sample in JS. Record raw scans and replay them for deterministic tuning.

### Cited Findings
- S2E produces 32k samples/s per sensor at 10 Hz. — [Slamtec S2](http://www.slamtec.com/en/s2)

### Inferences
- Budget: per scan, trig (table lookups), background compare, segmentation, Hungarian on n < 30, Kalman updates: well under 1 ms per scan in V8, so one worker thread can host all four sensors, or one worker per sensor if driver parsing is separate. Memory: one Float32Array(4096) each for r, theta, x, y, one Uint8Array flags, one Float32Array for background median and spread. Avoid per-frame object allocation (preallocate tracks in a pool; reuse arrays) to avoid GC pauses that would show up as jitter.
- Determinism: the tracker should be a pure function of (scan stream with timestamps, config), with no `Date.now()` or random calls inside (use a seeded PRNG for RANSAC). Record raw frames to a binary file (header with sensor config, then per frame: uint64 timestamp us, uint16 count, then count x (uint16 angle q14 + uint32 distance q2 + uint8 quality) as in the Slamtec protocol, or float32 arrays); replay at real time or fast-forward and compare output regression snapshots. Record also the calibration and the background.
- Include a replay UI and an offline parameter sweep (grid search over T_min, gate, fcmin, beta) with metrics: ID switches, track fragmentations, false touches/min on empty-wall recordings, and jitter std.

### Gaps
- No empirical benchmark was run in this research.

## Licensing summary (for the report writer)
- Permissive and reusable: ROS `laser_filters` (BSD-3-Clause) — [GitHub](https://github.com/ros-perception/laser_filters) (note: the repo contains multiple filters; verify per-file license headers and avoid anything that depends on ROS runtime); 1 Euro filter reference implementations in JS/TS (BSD) and C/C++ (MIT/BSD) — [Casiez](https://gery.casiez.net/1euro/).
- No license found / unusable: FifthChat LidarTracker (no license stated) — [GitHub](https://github.com/FifthChat/LidarTracker).
- Copyleft flags: none identified among the sources checked; OpenCV is Apache-2.0 for 4.5+ (recalled, unverified) but not needed in TypeScript.

## Source reliability notes
- Search-result summaries about the MIT LaserWall, Paradiso survey and ISS 2011 paper came from search snippets/abstract-level pages; the full papers were not read. DOIs/venues should be verified before citing.
- The Derivative asset page and GitHub README describe features only; no algorithmic details were found.
