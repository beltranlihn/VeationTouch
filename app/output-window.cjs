// The room output's window (app/main.js › applyOutputWindow) — the ONLY window whose workers have Node: its HAP decoders
// read the movies with `fs` (ui/js/mixer/hap-worker.js; MEDIA-SERVER.md §3.1, VEATION's ADR-0012). That is acceptable
// only because the window never shows anything but our own server, and the code makes sure of it instead of promising
// it: every navigation of every frame (the experience's iframe included), every redirect and every new window that
// would leave our origin is refused. tests/hap-player.test.mjs runs the output page with exactly these preferences and
// this guard (tests/ui/runner.cjs --output-window) and checks that it cannot be taken elsewhere.
'use strict';

/**
 * webPreferences of the output window.
 * @param {{spout: boolean, preload?: string, gpu?: boolean}} o spout: the off-screen Spout window (its preload says so);
 *   otherwise the full-screen display window. gpu: Spout through a shared GPU texture.
 */
function outputWebPreferences({ spout = false, preload = null, gpu = false } = {}) {
  // sandbox off: Node in the workers needs it (contextIsolation stays on, and the page itself has no Node)
  const base = { contextIsolation: true, nodeIntegration: false, nodeIntegrationInWorker: true, sandbox: false, backgroundThrottling: false };
  if (!spout) return base;
  return { ...base, preload, additionalArguments: ['--vt-spout=main'], zoomFactor: 1, offscreen: gpu ? { useSharedTexture: true } : true };
}

/** Whether `url` is on `origin` (our server). about:blank / about:srcdoc are a frame's empty start. */
function sameOrigin(url, origin) {
  if (url === 'about:blank' || url === 'about:srcdoc') return true;
  try { return new URL(url).origin === origin; } catch { return false; }
}

/**
 * Keeps a webContents on `origin` (e.g. 'http://127.0.0.1:8770'). `onRefused(url)` is told about each refusal.
 * @param {Electron.WebContents} wc @param {string} origin @param {(url: string) => void} [onRefused]
 */
function guardOutputWindow(wc, origin, onRefused) {
  const stop = (e, url) => {
    const u = e?.url ?? url;
    if (sameOrigin(u, origin)) return;
    e.preventDefault();
    try { onRefused?.(u); } catch { /* only a report */ }
  };
  wc.setWindowOpenHandler(({ url }) => { try { onRefused?.(url); } catch { /* only a report */ } return { action: 'deny' }; });
  wc.on('will-navigate', stop);       // the page itself
  wc.on('will-frame-navigate', stop); // any frame: the experience's iframe, or one it would open
  wc.on('will-redirect', stop);       // a redirect of an allowed navigation
}

module.exports = { outputWebPreferences, guardOutputWindow, sameOrigin };
