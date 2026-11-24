# Ressonància — the whole work (assembly)

- **Status:** prototype
- **Kind:** visual (pair with `ressonancia-sound`)
- **Author:** Vicente
- **Updated:** 2026-11-23

## Concept
The whole 10-minute work in one page (see `../ressonancia/GUION.md`). The score (`../ressonancia/score.js`) walks the pass from the
wait to the acta; each block shows its own universe, a scene module in `../ressonancia/scenes/` behind the contract in
`scenes/host.js`; consecutive universes cross-fade over 2.5 s. Over them: the guide's hand targets (a ring with a hand, the pulse
closing on it, a progress arc) and the text layer (`scenes/text.js`): chapter cards and one instruction line per wall.

| Block | Scene | Block | Scene |
|---|---|---|---|
| wait, brasa | fire | crown, baixada, fall | stone |
| intro | intro | festa | festa (resonance) |
| pinya | earth | acta | acta |
| tronc | stone | pom | night |

## Watching a whole pass (lab only)
`simulate.html?people=6&sound=ressonancia-sound` plays the work on its own with a virtual audience that follows the guide
(`autopilot.js`, through the harness's new `stage.put` / `stage.lift`), the room in two rows and a timeline. `&from=<block>` starts at a
chapter; `&params={"pace":2}` runs faster. Not part of the piece: the app loads `index.html`.

## Reviewing the whole work with the 3D intro (lab only)
`review.html?people=6&sound=ressonancia-sound` is `simulate.html` plus `review3d.js`: during the Intro the 3D intro (La plaça) plays
over the 2D work on the score's clock, and fades into Brasa; the rest is the 2D work. `&q3=high` for the room's 3D quality (default
medium for a laptop). Checks (`lab/tools/check.mjs`) are muted now (`LAB_AUDIBLE=1` to hear them). The voice in Spanish: add
`&soundParams={"lang":"es"}`.

## Solo path / Group path
2 to 15 people; the score estimates the group and sets how many walls and targets each goal asks (GUION.md §5).

## Controls
`jump` (go to a block), `pace` (rehearsal clock), `guide` (targets and text), `brightness`, `bloom`, `quality`.
Each scene's own parameters come from its study's manifest (`defaults.json`, generated from the `res-*` manifests).

## Audio
`ressonancia-sound` leads: it runs the same score and posts its state on a `BroadcastChannel('ressonancia')`; this page follows it,
and runs its own score when nothing arrives. In the lab: `?sound=ressonancia-sound`.

## Status and tests
- Lab harness, `?scale=1`, 8 pinned hands, no console errors, 56–61 fps on the development Mac in every block tried (brasa,
  pinya, tronc, pom, crown, baixada, acta), and with the sound piece leading (tronc, crown → festa).
- A whole pass at pace 64: wait → intro → brasa → pinya → tronc → pom → crown → festa → baixada → acta → wait, no errors.
- Not done: a pass at real pace watched by eye; the real engine (`lab-engine.mjs`); the BroadcastChannel in the app's windows;
  the LiDAR feel; GPU time on the room's server. The `festa` scene is a placeholder until its study arrives.

## Requests to the studio
See `../ressonancia/NOTES.md`.
