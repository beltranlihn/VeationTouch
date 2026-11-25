// Same-origin capture sink: proxies every request to the lab server (UP), except POST /__save?f=<sub/name.png>, written under OUT.
//   node save-server.mjs <out-dir> <port> <upstream-port>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const OUT = process.argv[2];
const port = Number(process.argv[3] || 8797);
const UP = Number(process.argv[4] || 8795);
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__save') {
    const f = (u.searchParams.get('f') || '').replace(/\\/g, '/');
    if (req.method !== 'POST' || !/^[A-Za-z0-9 _.\-/]+\.png$/.test(f) || f.includes('..')) { res.writeHead(400); return res.end('bad'); }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const dst = path.join(OUT, f);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, Buffer.concat(chunks));
      console.log('saved', dst);
      res.writeHead(200); res.end('ok');
    });
    return;
  }
  if (/\/audio\//.test(req.url)) console.log('AUDIO', req.url);
  const p = http.request({ host: '127.0.0.1', port: UP, path: req.url, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode, r.headers); r.pipe(res);
  });
  p.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(p);
}).listen(port, '127.0.0.1', () => console.log('proxy+save on', port, '→', UP));
