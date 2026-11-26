# fire3 — sources

- `fire3.js` adapts `dist/tsl/vanilla.esm.js` of **@wolffo/three-fire 1.4.0** (npm; repo https://github.com/typeWolffo/THREE.Fire;
  demo https://threefire.netlify.app/), downloaded from unpkg on 2026-11-26. License: **MIT**, © 2015 typeWolffo —
  `LICENSE-three-fire.txt`. It is the TSL port of **mattatz/THREE.Fire** (MIT).
- Changes (brasa v2, Personaje): THREE/TSL passed in (no bare imports); the fire gradient texture is generated in code
  (`makeFireTexture`; the repo's `Fire-grayscale.png` states no license, so it is not used); depth-tested, additive, a brightness
  uniform, the time driven by the host; the march length normalised so fewer iterations keep the same density.
- Nothing is fetched at run time.
