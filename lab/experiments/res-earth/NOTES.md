# Ressonància study — Body and earth

- **Status:** prototype
- **Kind:** visual
- **Author:** Vicente
- **Updated:** 2026-11-23

## Concept

Chapter II, *Pinya — Força*. Round the four walls, a warm, soft matter: wet clay, earth, skin (umber, terracotta, ochre, a little
bone) in a dark room under one low raking light, with two slow lamps wandering round the room. The surface is a mass of soft rounded
mounds, like bodies pressed so close they become one, and it breathes (≈4 s in, 6 s out: the mass swells slightly and the light rises
and falls).

- **It yields under the hand.** A height field (a ping-pong simulation at a quarter of the size) takes a dent with a soft raised rim
  the moment a hand arrives (≈60 % within 30 ms), stays damp and warm there, and relaxes slowly (`memory`). A moving hand leaves a trough.
  Each hand is also a warm light held close to the clay, raking across the print.
- **Handprints.** A landing hand stamps a procedural hand (palm, heel, four fingers, webbed thumb, ≈19 cm, left or right) that glows
  from inside and fades over ~20 s; the relief of the print lasts ~30 s. A hand that lands on a pinya slot snaps its print into the slot.
- **The pinya.** Round each wall's centre (1.25 m from the floor), three rings of handprint slots with the fingers pointing inward and a
  shallow arm reaching in behind each hand: ring 1 (0.45 m, 6), ring 2 (0.8 m, 10), ring 3 (1.15 m, 14). The rings are drawn as ellipses
  (vertical radius × 0.58), which keeps every slot between ≈0.55 and 1.95 m from the floor (the "0.6–2.0 m" rule) and reads as the pinya
  seen obliquely from the bell tower. A small round "button" sits at the centre, where the trunk will rise.
- **The circle closes.** Near the end, a band of linked hands (alternately mirrored, fingers pointing the way it turns) grows out of
  every pinya at hand height until it joins the walls, then turns slowly round the room (one turn ≈75 s) with four slow crests of light:
  a rotllana. Built on an integer number of hands round the perimeter, so there is no cut at P3→P4.
- **Crack.** The transition out: the clay dries (paler, matte), the great cracks open first, then whole shards break free (their outline
  opens at once) and tilt a little with curled edges, with warm light showing in the cracks. At 1 it reads as broken tiles: the beginning
  of the trencadís of chapter III.

## Solo path

One person: any landing hand answers at once (dent, print, light). Resting a hand on a slot lights it immediately and keeps it lit for
~9 s after leaving. Walking along a wall leaves a trail of prints that fade.

## Group path

Several people fill several slots at once on several walls; with the director's `progress` the rings fill ring by ring, then the
rotllana joins the walls. Tested with 30 pinned hands (see below).

## Controls

| Parameter | What it does |
|---|---|
| `progress` (Study: progress) | 0 → 0.84: fills the slots of every wall ring by ring (ring 1, then 2, then 3; random order inside a ring). 0.84 → 0.97: the band of linked hands grows out of each pinya and joins the walls. 0.9 → 1: the band starts turning round the room. |
| `crack` | 0 → 1: dries and cracks the clay (great cracks from ≈0.05, shards from ≈0.3, all open at 1). Eased in the scene (no jumps). |
| `relief` | strength of the shading from the height field (0 = flat). |
| `depth` | how deep a hand presses the clay. |
| `memory` | seconds for a dent to relax (a time constant; the damp mark lasts 1.6×). |
| `glow` | the inner glow of prints, slots and band. |
| `breath` | depth of the breathing (0 = still). |
| `brightness`, `bloom`, `quality` | host parameters (unchanged). `quality` scales the scene target; the simulation is always a quarter of it. |

A hand within ≈0.26 m of a slot lights that slot at once, whatever `progress` is.

## Audio

None in this study (the piece's sound is separate). Suggested hooks: a soft low thud per landing hand, a breath bed in phase with the
4 s / 6 s cycle.

## Status and tests

Tested in the lab harness with `lab/tools/check.mjs` at `scale=1` (7196×912), no console errors in any run:
- 0 hands, `group=4`, pinned hands (on a slot, on open clay), 30 pinned hands; `progress` 0, 0.2, 0.45, 0.6, 0.7, 0.93, 1; `crack` 0.35,
  0.5, 0.6, 1; `quality=low`.
- Seam: the band and the clay are continuous across P3→P4 (checked in a crop joining both edges).
- fps at scale=1 on the dev Mac (Apple M1 Max): **60** with 4 hands and with 30 hands at `crack` 0; **52** in the worst case
  (30 hands + `crack` 1 + band turning). The room's RTX 6000 Ada should hold 60 easily; if not, the crack path (two periodic Voronoi
  layers at full size) is the cost to cut.
- NOT verified: the real engine (`lab-engine.mjs`) and the LiDAR feel (**L**); GPU time in ms on the room's machine; the animated feel
  (breath, relaxation, band rotation, the crack easing) was only judged from stills; 3.5 m wall heights (the pinya centre is a fixed
  1.25 m from the floor, so it is fine, but not looked at).

Weak points: the prints read a little "graphic" up close (flat warm fill); the band at `progress` 1 is a single line of hands, elegant
but modest; up to 40 free prints are kept (the oldest is replaced).

## Requests to the studio

None. (Everything lives in the scene; it attaches a second colour attachment to one of its own `env.target` FBOs for an MRT pass,
which needs no host change.)
