// NDI receiver used by the tests only: finds an NDI source on this computer and captures one video frame, through the
// installed NDI runtime (koffi). Returns {name, xres, yres, at(x, y)} or null. It never blocks: the sender under test
// runs on the same thread and must keep sending while we wait.

import { createRequire } from 'node:module';
import { loadNdi } from '../engine/outputs/ndi.js';

export async function captureNdi(match, { timeoutMs = 8000 } = {}) {
  const base = loadNdi();
  if (!base) return null;
  const koffi = createRequire(import.meta.url)('koffi');
  const L = koffi.load(base.file);
  const Source = koffi.struct('NDIlib_source_t', { p_ndi_name: 'const char *', p_url_address: 'const char *' });
  koffi.struct('NDIlib_find_create_t', { show_local_sources: 'bool', p_groups: 'const char *', p_extra_ips: 'const char *' });
  koffi.struct('NDIlib_recv_create_v3_t', { source_to_connect_to: 'NDIlib_source_t', color_format: 'int', bandwidth: 'int', allow_video_fields: 'bool', p_ndi_recv_name: 'const char *' });
  const findCreate = L.func('void *NDIlib_find_create_v2(const NDIlib_find_create_t *settings)');
  const findWait = L.func('bool NDIlib_find_wait_for_sources(void *finder, uint32_t timeout_ms)');
  const findSources = L.func('const NDIlib_source_t *NDIlib_find_get_current_sources(void *finder, _Out_ uint32_t *count)');
  const findDestroy = L.func('void NDIlib_find_destroy(void *finder)');
  const recvCreate = L.func('void *NDIlib_recv_create_v3(const NDIlib_recv_create_v3_t *settings)');
  const recvCapture = L.func('int NDIlib_recv_capture_v2(void *recv, _Out_ NDIlib_video_frame_v2_t *video, void *audio, void *meta, uint32_t timeout_ms)');
  const recvFree = L.func('void NDIlib_recv_free_video_v2(void *recv, const NDIlib_video_frame_v2_t *video)');
  const recvDestroy = L.func('void NDIlib_recv_destroy(void *recv)');

  const finder = findCreate({ show_local_sources: true, p_groups: null, p_extra_ips: null });
  const t0 = Date.now();
  let src = null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!src && Date.now() - t0 < timeoutMs) {
    findWait(finder, 0);
    await sleep(100);
    const n = [0];
    const ptr = findSources(finder, n);
    if (n[0]) {
      const list = koffi.decode(ptr, Source, n[0]);
      src = list.find((s) => s.p_ndi_name.includes(match)) || null;
    }
  }
  if (!src) { findDestroy(finder); return null; }
  const recv = recvCreate({ source_to_connect_to: { p_ndi_name: src.p_ndi_name, p_url_address: src.p_url_address }, color_format: 0, bandwidth: 100, allow_video_fields: false, p_ndi_recv_name: null });
  findDestroy(finder);
  try {
    while (Date.now() - t0 < timeoutMs) {
      const frame = {};
      if (recvCapture(recv, frame, null, null, 0) !== 1) { await sleep(15); continue; } // 1 = a video frame
      const bytes = Buffer.from(koffi.decode(frame.p_data, 'uint8_t', frame.line_stride_in_bytes * frame.yres));
      recvFree(recv, frame);
      return { name: src.p_ndi_name, xres: frame.xres, yres: frame.yres, at: (x, y) => bytes[y * frame.line_stride_in_bytes + x * 4] };
    }
    return null;
  } finally {
    recvDestroy(recv);
  }
}
