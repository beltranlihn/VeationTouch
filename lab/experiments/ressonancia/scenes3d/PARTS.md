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
Do not touch `room3d.js` (report what it lacks). Linear HDR values; the room host does bloom (threshold ~0.75) and ACES tone mapping.

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
