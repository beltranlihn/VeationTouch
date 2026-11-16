// Startup guard — a classic script loaded before the app's modules, written to run on any browser. If the page does
// not start (a script error, a module that fails to load, a browser too old for the app), it says so on screen
// instead of leaving an empty page, and sends the error to the computer, where it appears in the app's log (an
// operator can then read what happened on a phone without a screenshot). After a good start, errors are only sent.
// The page calls window.__vtStarted() once its interface is up.
(function () {
  var started = false, shown = false, sent = 0;

  function report(kind, message, where) {
    if (sent >= 5) return; // a page that keeps failing must not flood the log
    sent++;
    var body = JSON.stringify({ kind: kind, message: String(message || '').slice(0, 500), where: String(where || '').slice(0, 300), page: location.pathname, started: started });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon('/api/client-error', body)) return;
      var x = new XMLHttpRequest();
      x.open('POST', '/api/client-error');
      x.send(body);
    } catch (e) { /* nowhere to report to */ }
  }

  function show(message) {
    if (started || shown) return;
    shown = true;
    var d = document.createElement('div');
    d.id = 'bootFail';
    d.setAttribute('role', 'alert');
    // inline styles: it must read well even if the stylesheet is what failed (VEATION surfaces, ink and amber)
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;'
      + 'background:#111;color:#E0E0E0;font:15px/1.45 Geist, system-ui, sans-serif;';
    d.innerHTML = '<div style="max-width:420px;background:#1B1B1B;border:1px solid #262626;border-left:2px solid #E5B567;border-radius:8px;padding:18px 20px">'
      + '<b style="display:block;font-size:17px;margin-bottom:8px">This page could not start</b>'
      + '<p style="margin:0 0 10px;color:#B8B8B8;word-break:break-word"></p>'
      + '<p style="margin:0 0 14px;color:#8C8C8C;font-size:13px">The error was sent to the computer: it is in the app’s log (System › Log).</p>'
      + '<button type="button" style="font:inherit;color:#111;background:#E0E0E0;border:0;border-radius:6px;padding:9px 16px">Reload</button></div>';
    d.querySelector('p').textContent = message;
    d.querySelector('button').onclick = function () { location.reload(); };
    (document.body || document.documentElement).appendChild(d);
  }

  window.addEventListener('error', function (e) {
    var t = e.target;
    var where = e.filename ? e.filename.replace(location.origin, '') + ':' + e.lineno + ':' + e.colno
      : t && t !== window && (t.src || t.href) ? String(t.src || t.href).replace(location.origin, '') : '';
    var message = e.message || ('could not load ' + where);
    report('error', message, where);
    show(message + (where ? ' (' + where + ')' : ''));
  }, true); // capture: a script or module that fails to load does not bubble

  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    var message = r && r.message ? r.name + ': ' + r.message : String(r);
    var where = r && r.stack ? String(r.stack).split('\n').slice(0, 3).join(' | ').replace(new RegExp(location.origin, 'g'), '') : '';
    report('rejection', message, where);
    show(message);
  });

  window.__vtStarted = function () {
    started = true;
    var d = document.getElementById('bootFail');
    if (d) d.parentNode.removeChild(d);
  };

  setTimeout(function () {
    if (started) return;
    report('timeout', 'the page did not start within 12 s', navigator.userAgent);
    show('The page did not start. This browser may be too old for the app: reload, or try another browser.');
  }, 12000);
})();
