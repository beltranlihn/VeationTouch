// Preload of the main window (app/main.js › createMainWindow, the operator UI). A page cannot know where a file that is
// dropped on it lives on disk; the media library needs that path to copy the file in (media.import). This preload gives
// the page exactly one function for it and nothing else: no ipc, no Node, contextIsolation and the sandbox stay on.
// In a browser or on a phone `window.vtDesktop` does not exist; the UI checks for it before offering a drop.

const { contextBridge, webUtils } = require('electron');

/** The disk paths of an array of Files; anything that is not a file on disk (made by the page, not a File) is left out. */
function paths(files) {
  const out = [];
  for (const f of Array.isArray(files) ? files : []) {
    let p = '';
    try { p = webUtils.getPathForFile(f); } catch { /* not a File */ }
    if (p) out.push(p);
  }
  return out;
}

// only for the app's own pages (the engine on this computer), never for a page the window might be sent to
if (/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(location.origin)) {
  // window.vtDesktop.pathsFor(fileList | File[]) → string[]. It is defined in the page's world because a FileList (what
  // a drop or a file input gives) does not cross the bridge to this preload; an array of its Files does.
  contextBridge.executeInMainWorld({
    func: (bridge) => {
      const api = Object.freeze({ pathsFor: (files) => bridge(Array.from(files ?? [])) });
      Object.defineProperty(window, 'vtDesktop', { value: api, enumerable: true });
    },
    args: [paths],
  });
}
