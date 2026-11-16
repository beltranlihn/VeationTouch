// NDI sender for the Texture output, through the official NDI runtime installed on this computer (NDI Tools or the
// NDI Runtime, free from ndi.video). Nothing of NDI is bundled with VEATION Touch: the runtime is found through the
// NDI_RUNTIME_DIR_V6 / _V5 variables its installer sets (VT_NDI_LIB overrides the file) and called with koffi (MIT).
// The structures follow Processing.NDI.Lib.h, the SDK header (MIT-licensed). The runtime is loaded only when an
// output actually sends over NDI.
// NDI® is a registered trademark of Vizrt NDI AB.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const FOURCC_BGRA = 0x41524742;          // NDI_LIB_FOURCC('B','G','R','A')
const FORMAT_PROGRESSIVE = 1;
const TIMECODE_SYNTHESIZE = 9223372036854775807n; // INT64_MAX: the runtime stamps the frame

let lib = null, libError = null;

/** The NDI runtime library of this computer, or null. */
export function ndiRuntimeFile(env = process.env) {
  if (env.VT_NDI_LIB) return fs.existsSync(env.VT_NDI_LIB) ? env.VT_NDI_LIB : null;
  for (const k of ['NDI_RUNTIME_DIR_V6', 'NDI_RUNTIME_DIR_V5']) {
    const f = env[k] && path.join(env[k], 'Processing.NDI.Lib.x64.dll');
    if (f && fs.existsSync(f)) return f;
  }
  return null;
}

/** Load the runtime once. Returns the bound functions, or null (`ndiError()` says why). */
export function loadNdi() {
  if (lib || libError) return lib;
  if (process.platform !== 'win32') { libError = 'NDI output needs Windows'; return null; }
  const file = ndiRuntimeFile();
  if (!file) { libError = 'NDI Runtime not found — install NDI Tools (free, ndi.video) on this computer'; return null; }
  try {
    const koffi = createRequire(import.meta.url)('koffi');
    const L = koffi.load(file);
    koffi.struct('NDIlib_send_create_t', { p_ndi_name: 'const char *', p_groups: 'const char *', clock_video: 'bool', clock_audio: 'bool' });
    koffi.struct('NDIlib_video_frame_v2_t', {
      xres: 'int', yres: 'int', FourCC: 'int', frame_rate_N: 'int', frame_rate_D: 'int', picture_aspect_ratio: 'float',
      frame_format_type: 'int', timecode: 'int64_t', p_data: 'void *', line_stride_in_bytes: 'int', p_metadata: 'const char *', timestamp: 'int64_t',
    });
    const b = {
      file,
      initialize: L.func('bool NDIlib_initialize()'),
      sendCreate: L.func('void *NDIlib_send_create(const NDIlib_send_create_t *settings)'),
      sendVideo: L.func('void NDIlib_send_send_video_v2(void *instance, const NDIlib_video_frame_v2_t *frame)'),
      connections: L.func('int NDIlib_send_get_no_connections(void *instance, uint32_t timeout_ms)'),
      sendDestroy: L.func('void NDIlib_send_destroy(void *instance)'),
    };
    if (!b.initialize()) { libError = 'NDI cannot run on this CPU'; return null; }
    lib = b;
  } catch (e) {
    libError = `the NDI Runtime could not be loaded (${e.message})`;
  }
  return lib;
}
export const ndiError = () => libError;

/** One NDI source on the network ("<COMPUTER> (<name>)"), sending greyscale frames as BGRA. */
export class NdiSender {
  /** @returns {string|null} the error, or null when the source is up */
  start(name) {
    const L = loadNdi();
    if (!L) return libError;
    this.L = L;
    this.inst = L.sendCreate({ p_ndi_name: name, p_groups: null, clock_video: false, clock_audio: false });
    return this.inst ? null : 'the NDI source could not be created';
  }

  /** Send one frame: `buf` = w × h × 4 bytes (grey, so RGBA and BGRA are the same). Synchronous: `buf` may be reused. */
  send(buf, w, h, rateHz) {
    if (!this.inst) return false;
    this.L.sendVideo(this.inst, {
      xres: w, yres: h, FourCC: FOURCC_BGRA, frame_rate_N: Math.round(rateHz * 1000), frame_rate_D: 1000,
      picture_aspect_ratio: w / h, frame_format_type: FORMAT_PROGRESSIVE, timecode: TIMECODE_SYNTHESIZE,
      p_data: buf, line_stride_in_bytes: w * 4, p_metadata: null, timestamp: 0n,
    });
    return true;
  }

  /** How many receivers are watching this source now. */
  receivers() { return this.inst ? this.L.connections(this.inst, 0) : 0; }

  stop() {
    if (this.inst) { try { this.L.sendDestroy(this.inst); } catch { /* runtime gone */ } }
    this.inst = null;
  }
}
