// tronc3d — the sculpture's build off the main thread (module worker): posts each floor as it is meshed (buffers transferred).
import { buildFloors } from './sculpt.js';
for (const r of buildFloors(1e9)) {
  if (!r) continue;
  const [, F] = r, G = F.grains;
  postMessage({ floor: F }, [F.pos.buffer, F.nrm.buffer, F.aux.buffer, F.idx.buffer, G.rest.buffer, G.nrm.buffer, G.aux.buffer]);
}
postMessage({ done: true });
