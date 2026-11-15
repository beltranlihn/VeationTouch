// Network diagnostics for pairing a phone/tablet: is the Windows Firewall letting it in?
// The installer adds a program rule ("VEATION Touch"); in development the operator adds a port
// rule. "Fix" adds a port rule through an elevated netsh (Windows shows its own UAC prompt on the
// server, so it is only offered to the operator sitting at the server).

import { execFile, spawn } from 'node:child_process';

const RULES = (port) => ['VEATION Touch', `VEATION Touch (port ${port})`, 'VEATION Touch (dev)'];

function run(cmd, args, timeout = 6000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout) => resolve({ ok: !err, out: String(stdout || '') }));
  });
}

/** @returns {Promise<{platform:string, rules:string[], allowed:boolean|null}>} */
export async function firewallStatus(port) {
  if (process.platform !== 'win32') return { platform: process.platform, rules: [], allowed: null };
  const found = [];
  for (const name of RULES(port)) {
    const r = await run('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${name}`]);
    if (r.ok && /Enabled:\s*Yes|Habilitada:\s*Sí|Habilitado:\s*Sí/i.test(r.out) && /Allow|Permitir/i.test(r.out)) found.push(name);
  }
  return { platform: 'win32', rules: found, allowed: found.length > 0 };
}

/** Add an inbound TCP rule for the UI port. Windows asks for administrator rights (UAC). */
export function fixFirewall(port) {
  if (process.platform !== 'win32') return Promise.reject(new Error('only needed on Windows'));
  const name = `VEATION Touch (port ${port})`;
  const netshArgs = `advfirewall firewall add rule name="${name}" dir=in action=allow protocol=TCP localport=${port} profile=any`;
  const ps = `Start-Process -FilePath netsh -ArgumentList '${netshArgs.replace(/'/g, "''")}' -Verb RunAs -WindowStyle Hidden -Wait`;
  return new Promise((resolve, reject) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('the administrator prompt was cancelled'))));
  });
}
