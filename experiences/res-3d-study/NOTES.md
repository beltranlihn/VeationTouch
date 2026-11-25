# Ressonància — 3D study

- **Status:** prototype
- **Kind:** visual
- **Author:** Vicente
- **Updated:** 2026-11-23

## Concept
A host for one 3D part alone (`?part=<name>`; parts in `../ressonancia/scenes3d/parts/`, contract in `scenes3d/PARTS.md`), on
the room of `res-3d`. The part's own parameters come from `parts/<name>.json` and join the lab's panel (P). `t` is the sequence
clock (the intro's 0–70 s): it runs from "Study: sequence time", or stays still with "Run the clock" off.

## Solo path / Group path
As the part.

## Controls
`progress`, `t`, `run`, `renderer`, `eye`, `bloom`, `exposure`, plus the part's.

## Audio
None.

## Status and tests
Tested with the example part (`_example`): no errors, 60 fps at `?scale=1`, WebGPU.

## Requests to the studio
None (see `res-3d`).
