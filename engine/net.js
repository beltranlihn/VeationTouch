// Network diagnostics for pairing a phone/tablet: is the Windows Firewall letting it in? Which Wi-Fi is this PC on?
// And the two system changes the operator can approve from the app (Windows shows its own administrator prompt):
// the firewall rule, and the address of the network card on the sensors' PoE switch.
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

/** Run netsh with administrator rights: Windows shows its UAC prompt on the server; cancelling it rejects. */
function elevatedNetsh(netshArgs) {
  const ps = `Start-Process -FilePath netsh -ArgumentList '${netshArgs.replace(/'/g, "''")}' -Verb RunAs -WindowStyle Hidden -Wait`;
  return new Promise((resolve, reject) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('the administrator prompt was cancelled'))));
  });
}

/**
 * Give a network card a fixed IPv4 address (the card on the sensors' switch, which has no DHCP).
 * Windows asks for administrator rights.
 */
export function setInterfaceAddress(name, ip, mask = '255.255.255.0') {
  if (process.platform !== 'win32') return Promise.reject(new Error('set the address in the system network settings'));
  if (!/^[\p{L}\p{N} ._()#*-]{1,80}$/u.test(name)) return Promise.reject(new Error('unexpected network card name'));
  if (![ip, mask].every((s) => /^(\d{1,3}\.){3}\d{1,3}$/.test(s))) return Promise.reject(new Error('invalid IPv4 address'));
  return elevatedNetsh(`interface ipv4 set address name="${name}" static ${ip} ${mask}`);
}

/** Open Windows' Mobile hotspot settings: the operator turns it on there (nothing is changed from here). */
export function openHotspotSettings() {
  if (process.platform !== 'win32') return Promise.reject(new Error('only on Windows'));
  return new Promise((resolve, reject) => {
    const p = spawn('cmd.exe', ['/c', 'start', '', 'ms-settings:network-mobilehotspot'], { windowsHide: true, detached: true, stdio: 'ignore' });
    p.on('error', reject);
    p.on('spawn', () => { p.unref(); resolve(); });
  });
}

/**
 * The Wi-Fi network (SSID) of each wireless card, from `netsh wlan show interfaces`. The labels are localised
 * except "SSID"; the first entry of each block is the card's name.
 * @returns {Object<string,string>} card name → SSID
 */
export function parseWlanInterfaces(text) {
  const out = {};
  for (const block of String(text).split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/).map((l) => l.match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/)).filter(Boolean);
    const ssid = lines.find((m) => m[1] === 'SSID');
    if (ssid && lines[0][2] && ssid[2]) out[lines[0][2]] = ssid[2];
  }
  return out;
}

export async function wifiSsids() {
  if (process.platform !== 'win32') return {};
  const r = await run('netsh', ['wlan', 'show', 'interfaces'], 4000);
  return r.ok ? parseWlanInterfaces(r.out) : {};
}

/** Guest / public Wi-Fi usually stops devices from reaching each other ("client isolation"). */
export const looksLikeGuestNetwork = (ssid) => /guest|invitad|convidat|invité|gast|visit|public|free/i.test(String(ssid || ''));

/** Add an inbound TCP rule for the UI port. Windows asks for administrator rights (UAC). */
export function fixFirewall(port) {
  if (process.platform !== 'win32') return Promise.reject(new Error('only needed on Windows'));
  const name = `VEATION Touch (port ${port})`;
  return elevatedNetsh(`advfirewall firewall add rule name="${name}" dir=in action=allow protocol=TCP localport=${port} profile=any`);
}
