# Ressonància — trailer

- **Status:** prototype
- **Kind:** visual (sound: ressonancia-sound, Vicente's)
- **Author:** Studio (Claude, directed by Beltrán), on Vicente's universes
- **Updated:** 2026-11-25

## Concept
The second half of a two-part experience. Vicente's entrance (the interactive trencadís mosaic, `umbral3d`) breaks apart and the room
presents the work for ~3 minutes, then returns to the entrance:

| Segment | Universe (Vicente's, unchanged) | Presentation layer (`parts/trailertext.js`) | Length |
|---|---|---|---|
| Entrance (preroll) | `umbral3d` | — | 12 s (param `trailer.preroll`) |
| The square | `plaza` + `castell` + `atmos` | presenters · «Ressonància» + subtitle · four lines, one per wall | 45 s |
| The correfoc | `brasa3d` + `atmos` | the written trailer, wall after wall · the work's data (two sets of four) | 53 s |
| The resonance | `festa3d` | the closing line · credits, one per wall · logos and support | 62 s |

All the words are Vicente's 3D type (`typo3d.js`): they assemble from glyph-tiles and break into tiles. Logos are white planes on the walls.

## Solo path / Group path
The trailer plays by itself. Every universe keeps its own response to hands (embers and sparks in the correfoc, ripples in the gold).
A group that finishes a chapter's play early moves the trailer on (the host follows the score into the next segment).

## Controls
Params: `lang` (es / en), `trailer.preroll`, `jump` (hold one segment on a loop, for rehearsal), `guide` (off: no targets or
instructions), `bloom`, `exposure`, `quality`, `renderer`, `mode`.

## Audio
Vicente's `ressonancia-sound`, which follows the host's jumps. Not checked yet: its voice lines in the intro and Brasa were written for
the full work and may speak instructions the trailer does not show.

## Status and tests
- 2026-11-25: lab harness, off-screen Electron window, 60 fps at scale 0.5, all ten key moments captured (Desktop «Ressonancia - Trailer»).
- To do: fps at `?scale=1`, the real engine (`lab-engine.mjs`), the sound with the trailer, the seam P3→P4 with words on screen.

## To confirm (Beltrán)
Credits and data are drafts: «Una obra de Vicente Manzano», «Dirección creativa: Alma Digital Studio», «Producción: Barcelona XR Lab»,
«Tecnología interactiva: VEATION Touch», «10 minutos», «de 2 a 15 personas». The Generalitat de Catalunya logo is missing (a line of
type stands in). The Barcelona XR Lab logo file carries «PALO ALTO»: cleared at runtime.

## Requests to the studio
None.
