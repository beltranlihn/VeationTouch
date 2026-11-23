# Lab template — Soft bells

- **Status:** template
- **Kind:** sound
- **Author:** Alma Digital Studio
- **Updated:** 2026-11-23

## Concept
A sound piece to copy. Each touch strikes one soft bell on its own wall; the hand's height (in metres) picks the note of a minor
pentatonic scale; a held hand lets the note swell, lifting it leaves a long tail. A very quiet pad plays on every wall and its root
goes to the sub.

## Solo path
One visitor strokes a wall: a slow, sparse melody that follows the hand's height, always on that wall's channel.

## Group path
Several hands: notes on several walls at once, at most 10 voices in total (the oldest yields).

## Controls
Bells volume, Pad volume, Release (see `manifest.json`).

## Audio
Web Audio synthesis only. Wall inputs per touch, room input for the pad and the reverb, sub input for the pad's root.

## Status and tests
Runs on the lab's sound stage (`/sound/lab-template-sound`) with the simulated 4.1 room. Not tested in the app yet.

## Requests to the studio
None.
