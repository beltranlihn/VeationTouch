# Ressonància — 3D parts: the contract

A **part** is one ES module in `scenes3d/parts/<name>.js` that builds a piece of a 3D universe (the square, the castell of light,
the atmosphere…) on top of the room in `room3d.js` (four off-axis cameras from the centre of the room; see its header).

```js
export function create(ctx) {
  // ctx = { THREE (three/webgpu), TSL (three/tsl, the whole module), room (createRoom3D(...): scene, walls, eye, renderer, wallPoint…),
  //         params (live object: the study page's / the piece's parameters), parts (the other parts by name, e.g. parts.atmos.addLight) }
  const object = new ctx.THREE.Group();          // everything the part draws; the host adds it to room.scene
  return {
    object,
    update(dt, input) {},                         // every frame. input = { time (s since start), t (the sequence's own clock, s),
                                                  //   progress (0..1, the part's main control), hands (room.hands(): world positions ON
                                                  //   the wall planes), downs, ups (strokes that landed / left this frame), params }
    setParams(p) {},                              // optional: live parameter changes
    dispose() {},                                 // optional
  };
}
```

World: metres, y up, floor at y = 0, the eye at (0, 1.6, 0), the room's walls ~3.2–3.7 m from the eye (`room.walls[i]`: `centre`,
`right`, `normal` (into the room), `pa/pb/pc` corners, `width`, `height`). Everything the public should READ (targets, text) lives on
the wall planes; the world opens behind them. Far things read well from anywhere in the room; near things bend for a visitor far
from the centre: keep big structures ≥ 6 m from the eye.

The four walls share their corners exactly; `camera.userData.wall` tells a material which wall a view is drawn for.

Rules: three.js r187 only (the vendored copy, through the import map); no network; assets CC0 or generated, small, inside the
part's folder `scenes3d/parts/<name>/` with a `LICENSE.txt`/`SOURCES.md`; no allocation per frame; light budget: the strip is
7196 × 912 rendered four times (one per wall) — keep shadows few and small, prefer emissive + bloom, baked or fake lighting.
Do not touch `room3d.js` (report what it lacks to the director; its owner since T-037 is RND-F). Linear HDR values; the room host does bloom (threshold ~0.75) and ACES tone mapping.

Study page: `/experiences/res-3d-study/index.html?part=<name>` hosts one part alone, with the part's parameters from
`res-3d-study/parts/<name>.json` (an array of manifest-style params) shown in the lab's panel (P).

## Chapter parts (the whole work in 3D)

The 3D work (`res-obra3d`) runs the score (`../score.js`) and shows, block by block, a set of parts. Chapter parts get more in
`input`:

```
input.state    the score's state (see score.js): block, phase ('title' | 'play' | 'reward'), t / tp (s in block / phase),
               progress (0..1 of the block's goal), people, needWalls, buttons, walls[] (castell walls), structure, held[],
               count[], fill[], closed, beat (0..1, the pulse at 0), floors, floorProgress, lean[], weak[], balance, climber,
               climb, lightWall, nextWall, restless, resonance, blooms, outcome, values{forca,equilibri,valor,seny} …
input.events   the score's events this frame: 'wave', 'awake', 'wall:<i>', 'close', 'pulse', 'floor', 'weak', 'balance',
               'climber:<n>', 'arrived:<n>', 'crown', 'bloom', 'down', 'fall', 'hint:<x>', 'block:<x>', 'phase:<x>' …
input.arrive   0..1 — the part is coming in: 0 = not there, 1 = fully there
input.leave    0..1 — the part is going: 0 = fully there, 1 = gone
input.acta     score.acta(): { castell, structure, floors, outcome, hands, people, stillS, values }
```

**Hands and state since 24-11 (plan step 0, ENT T-038/T-039; host T-040).** The host passes the score, per hand,
`{ stroke, wall, dx, y, vx, vy, size, s, speed }` (metres; `y` from the floor; `s` along the perimeter, continuous round the room).
`input.state` adds: per wall `yMed[w]`, `yL[w]`, `yR[w]` (median hand height, m: all / left of the centre / right), `span[w]` (total
hand width in the densest 2 m), `rise[w]` (mean rise above the hands' baselines, m) — 0 when the wall has no hands; `strokes[]` = per
hand `{ stroke, wall, y, y0 (baseline: its height when it landed, following it with τ 6 s), rise, disp (m moved in the last 1 s,
filtered) }`; `learned{}` and `assist` (0..1) for the later steps; l'aleta: phase `'aleta'` of block `pom` (8 s window after the
reward), `aletaHands` (share of hands that rose) and `aletaWidth` (0..1), event `'aleta'` just before `'crown'`. `room.hands()` gives
`size` (m) as well.

**The language of the work is fragmentation** (Vicente's choice, from the intro's square breaking into floating stone and mirror):
every universe ARRIVES by assembling from fragments of its own matter (shards, sparks, motes, pieces) that float in, turn slowly
and lock into place, and LEAVES by breaking into fragments that drift up and apart, turning, catching the light like mirrors, and
thin into the dark. A transition takes ~4–6 s; the host runs `leave` of the outgoing part and `arrive` of the incoming one at the same
time, so the two cross. Make both beautiful: they are the work's signature.

**The guide is the host's**: hand targets (rings with a hand icon, 60 cm, centred on the wall at 1.25 m, more of them in Pinya) and
the lines of text (on the wall plane, ~1.8–2.4 m) are drawn by the host on top. Keep the band 0.9–1.6 m at each wall's centre
readable (no blinding light right there) and let a hand's answer be immediate (<100 ms).

A chapter part must also run alone in `res-3d-study` (no `input.state`): build a stand-in state from its study parameters
(`progress`, `arrive`, `leave`, and whatever the chapter needs, e.g. a free-running pulse).

## What the room gives since T-028 (24-11, INT)

- `room.envMap` — a pre-filtered night environment (deep blue-black sphere, a warm horizon, a few soft panels of light), for physical
  materials: `new THREE.MeshPhysicalNodeMaterial({ metalness: 1, roughness: 0.08, envMap: room.envMap, envMapIntensity: 1.5 })`
  for chrome, `transmission: 1, thickness, ior` for glass, `iridescence: 1, iridescenceIOR, iridescenceThicknessRange` for the film.
  Use it per material (do not set `scene.environment` yourself: `room.useEnvironment(k)` exists but changes every lit material in the
  work; ask the director). It can be `null` if the device could not build it: guard for that.
- `room.captureEnvironment(scene, { renderTarget, position, size })` — a part's OWN environment, rendered from the eye and pre-filtered
  (the square uses it: its slabs and glass reflect the real square). Call it once at load / warm-up, not per frame; pass the target
  it returned to refresh in place.
- `room.overlay` — a small scene drawn over the final image of each wall after the tile composition, without depth: what must never
  break in a transition (the guide's words and targets, the host's guiding thread). Parts do not use it.
- `room.aa` — `'msaa'` (default at high quality), `'taa'` (lab `?aa=taa`: each wall's projection is jittered sub-pixel every frame and
  blended with a clamped history) or `'none'`. Under TAA a part that reads `camera.projectionMatrix` sees the jittered one; nothing to do.
- `room.render(dt, pass)`, `room.setTiles({...})`, `room.tiles` — the host's tile transition (below). Parts do not call them.

**The host's transition (T-028).** On a block change the host renders the outgoing world and the incoming one separately and composes
them through a field of tiles (the work's signature, ARTE-2 §7): your part is drawn alone in its world during those ~4 s. What it means
for a part:
1. `arrive` / `leave` still run, over **4 s** now (was 5); during the tiles the host holds `leave` at 0 until ~60 % of the slabs have
   turned (then 1.5 s) and runs `arrive` in 1.6 s — the slabs carry your world's image, so keep it lit while `leave` is low. The tiles carry the change: keep your own gesture, shorter and subtler —
   no full-screen flashes on arrive/leave, no black gap of your own at the start (the tiles show your first second).
2. **Your object hangs from a host rig.** During a transition the host moves the rig (the global eye: rise, sink, a turn ≤ 7°) and puts
   it back to identity at the end. Move your own `object` / children freely (your own room movement); do not reparent `object`, and do
   not add things to `room.scene` directly (they would escape the rig and show in both worlds) — add them to your `object`.
3. Keep the world's lights where they are today (point lights on layer 31, sky / moon lights handed to the host): the two passes show and
   hide rigs, and the set of lights must not change between them.
4. Colour: the host eases a palette per block (ARTE-2 §3) into atmos (`warm`, `cool`, `air`) and castell (`tint`). Chapter parts own
   their palette; follow ARTE-2 §3 for yours.

## What the room gives since T-037 (24-11, RND-F: the tile transition rebuilt, the environment from HDRIs)

**The environment follows the colour script.** `room.envMap` is still ONE pre-filtered texture that every part holds
(`material.envMap = room.envMap`); it is now re-baked IN PLACE, so a part changes nothing to follow it.
- `room.setEnvironment(name)` — `name` is a block: `'wait' | 'intro' | 'brasa' | 'pinya' | 'tronc' | 'pom' | 'crown' | 'festa' |
  'baixada' | 'fall' | 'acta'`, or `'generated'` (INT's night with panels of light: what the room starts with; an unknown name gives
  it too). The host calls it on every block change. Each preset (`room.ENV_PRESETS`) mixes the CC0 HDRIs of the shared library
  (`assets/cc0/hdri/rooftop_night_1k.hdr` = `night`: a city skyline with lamps; `kloppenheim_07_puresky_1k.hdr` = `sky`: a broad
  soft sky) and/or the generated night (`g`), desaturated towards `sat`, times `tint`, times a vertical ramp `bottom` → `top`, times
  `gain` — always **cold and light above, warm below** (the art bible), in the block's colours («cielo del entorno»): Brasa = cold
  silver `#9FB4D8` above, ember below; Pinya = turquoise / coral; Tronc = teal / terracotta; Pom = deep blue / garden gold; crown and
  festa = pale gold / lilac; baixada = dawn lilac / peach (the brightest); wait and acta = neutral silver, dim.
- `room.setEnvironment(name, { gain: 1.4, top: [r, g, b], … })` overrides fields of a preset; `room.setEnvironment({ g, night, sky,
  sat, tint, top, bottom, gain, panels, rot })` is a custom one (linear RGB arrays; `rot` 0..1 turns the HDRI; `panels` shows INT's
  four soft lights). `{ now: true }` bakes at once.
- Cost and timing: one PMREM bake (a 256 cube + its blur chain, a few ms) inside the next `room.render()`. While a tile transition
  runs the bake waits for the wave's peak (`tiles.mix ≥ 0.5`): the outgoing world keeps its sky, the incoming one gets its own
  as the slabs turn. A preset that needs an HDRI still loading waits for it (they load in the background at start-up, ~1.5 MB
  each, local); if a file is missing the generated night is used with the preset's colours. `room.environment` = `{ name, bakes,
  loaded, pending }` (read-only, for checks). `opt.hdri: false` in `createRoom3D` skips the HDRIs.
- Per material you still choose `envMapIntensity` (chrome 1.4–1.8 in the bible; values tuned against the generated night — 2–3.5
  in some parts — may now be too high in the brighter presets: `baixada`, `festa`, `intro`). Guard for `room.envMap === null`.
- `room.captureEnvironment(...)` (a part's own environment) is unchanged.

**The tile transition (rebuilt).** Same contract for parts as T-028 (above): your part is drawn alone in its world while the
slabs carry its image. What changed is the picture: a static quadtree of slabs 0.9 / 0.45 / 0.22 / 0.11 m; one wave round the room;
each slab sinks into the wall as a real box seen from the eye of the room (a vanishing point per wall: parallax, lit inner walls
with the image's edge pulled into depth), turns with the old world on one face and the new on the other, mirrors `room.envMap`
with a specular glint while it turns, and lets light through the cracks — also over black worlds. Vertical pixel-sorting bands
where the front passes. For parts: nothing to do; a world that is nearly black is fine now (the slabs are mirrors).
- `room.setTiles({ on, mix, amount, origin, seed })` as before (host only), plus optional
  `accentFrom: [r, g, b], accentTo: [r, g, b]` (linear RGB, about 0..1): the light in the cracks and on the bevels goes from the
  outgoing chapter's accent to the incoming one's (the film's cyan → pink → gold stays as a shimmer on it; `accentK` 0..1, default
  0.8 when accents are given, 0 = the film alone), and `depth`, `mirror`, `glow`, `streaks` (each 1 = as designed, 0 = off).
- `origins: n` in `setTiles` (default 1; it stays until set again — pass `origins: 1` for chapter changes): n fronts start together,
  evenly spaced round the room from `origin` (`origins: 4, origin: 0.125` = one from the centre of each wall on the 4-wall room), each
  covering 1/n of the room in the same time: every wall starts to break at once (the intro's tear at 46 s).
- `room.tileFront(wallIndex)` → 0..1: how far the wave has passed the CENTRE of that wall (0 = not there yet; 1 = the slabs there have
  locked into the new world; always 1 when no tile transition runs). For the guide: bring a wall's new words in once it is 1
  (+0.3 s). `wallIndex` is `room.walls[i].index`.
- The pass is compiled when the room is created (no pipeline is built in the first frame of the first transition).
