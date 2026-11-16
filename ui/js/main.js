// Which interface this device gets. Phones and tablets (touch as the main pointer) open the calibration remote —
// the operator at the wall: prepare, calibrate, fit, verify. The computer opens the full app. `?ui=full` or
// `?ui=remote` overrides it, and the choice is remembered on the device (switchUi in dom.js).

const q = new URLSearchParams(location.search);
let mode = q.get('ui');
try {
  if (mode === 'full' || mode === 'remote') localStorage.setItem('vt-ui', mode);
  else mode = localStorage.getItem('vt-ui');
} catch { /* storage blocked */ }
if (mode !== 'full' && mode !== 'remote') mode = matchMedia('(pointer:coarse)').matches ? 'remote' : 'full';
document.documentElement.dataset.ui = mode;
import(mode === 'remote' ? './remote.js' : './app.js');
