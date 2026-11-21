// The FFmpeg the operator can install to convert what Chromium cannot read (ProRes, DNxHD, MPEG-2, AVI...) to HAP.
// CLAUDE.md > Licencias: FFmpeg is NEVER bundled in the installer and NEVER linked. The app downloads an LGPL build on the
// operator's click (System > Converter), checks its SHA-256 against the pin below, keeps it in <data>/tools/ffmpeg/ with its
// licence text and the address of its source, and runs it as a separate process (convert.js). Nothing here touches the network
// until install() is called, which only the command `media.ffmpeg.install` does, from this computer.
//
// (The repository moved from BtbN/ to the FFmpeg-Builds organisation; the old address answers 301 to the new one. Autobuilds are purged
// over time: when the pinned one is gone the install says so and the app must be updated.)
// The pin is one exact build of BtbN's FFmpeg-Builds ("lgpl", static, win64). To move to another build: change PIN (url, sha256,
// size, version); tests/convert.test.mjs checks the shape and that the url is an LGPL one.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { listZip, extractEntry } from './zip.js';

export const PIN = Object.freeze({
  version: '8.1.3',
  build: 'n8.1.3-39-g660b5aa7db',
  url: 'https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/autobuild-2026-11-21-12-37/ffmpeg-n8.1.3-39-g660b5aa7db-win64-lgpl-8.1.zip',
  sha256: '47d2e37e5ab9dc775cf5e5e595a817a11534c2fd6533a16db476f45dd8a7ce83',
  size: 170933451,
  license: 'LGPL v2.1 or later',
  licenseUrl: 'https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html',
  source: 'https://github.com/BtbN/FFmpeg-Builds',
  sourceCode: 'https://ffmpeg.org/download.html',
});

/** `ffmpeg -version` gives {version, config} (the configure line says whether the build is GPL). */
export function runVersion(exe) {
  return new Promise((resolve, reject) => {
    let out = '';
    const p = spawn(exe, ['-hide_banner', '-version'], { windowsHide: true });
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', reject);
    p.on('close', () => {
      const m = /ffmpeg version (\S+)/.exec(out);
      if (!m) return reject(new Error('this file does not answer as FFmpeg'));
      resolve({ version: m[1], config: (/configuration: (.*)/.exec(out) || [])[1] || '' });
    });
  });
}

export class FfmpegTool {
  /**
   * @param {{dir:string, log?:object, fetchImpl?:Function, versionOf?:Function, platform?:string, pin?:object, onChange?:Function}} o
   * `fetchImpl`, `versionOf`, `pin` and `platform` are test seams: the tests never reach the network nor need a real executable.
   */
  constructor({ dir, log = null, fetchImpl = null, versionOf = runVersion, platform = process.platform, pin = PIN, onChange = () => {}, busy = () => false }) {
    this.dir = dir; this.log = log; this.fetchImpl = fetchImpl; this.versionOf = versionOf; this.platform = platform; this.pin = pin; this.onChange = onChange; this.busy = busy;
    this.installing = null; // {done, total} while the download runs
    this.error = null;
    this._abort = null;
  }

  get exe() { return path.join(this.dir, this.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'); }
  _info() { try { return JSON.parse(fs.readFileSync(path.join(this.dir, 'install.json'), 'utf8')); } catch { return null; } }

  /** What System > Converter shows. `installed` also means the executable is there. */
  status() {
    const info = this._info(), installed = !!info && fs.existsSync(this.exe);
    return {
      supported: this.platform === 'win32', installed,
      version: installed ? info.version : null, license: installed ? info.license : this.pin.license, licenseUrl: this.pin.licenseUrl,
      source: this.pin.source, sourceCode: this.pin.sourceCode, licenseFile: installed ? path.join(this.dir, 'LICENSE.txt') : null,
      folder: this.dir, size: installed ? info.size || null : this.pin.size,
      installing: this.installing ? { ...this.installing, pct: this.installing.total ? Math.min(99, Math.floor((this.installing.done / this.installing.total) * 100)) : 0 } : null,
      error: this.error, pin: { version: this.pin.version, size: this.pin.size },
    };
  }

  /** Downloads, checks and unpacks the pinned build. Resolves with status(); rejects with the reason (also kept in status().error). */
  async install() {
    if (this.platform !== 'win32') throw new Error('the converter is installed on Windows only');
    if (this.installing) throw new Error('the converter is already being installed');
    if (this.status().installed) throw new Error('the converter is already installed (remove it first to install it again)');
    if (!this.fetchImpl && typeof fetch !== 'function') throw new Error('this engine cannot download');
    const f = this.fetchImpl || fetch, pin = this.pin;
    this.error = null; this.installing = { done: 0, total: pin.size };
    this._abort = new AbortController();
    this.onChange();
    const zip = path.join(this.dir, 'download.zip.part');
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      this.log?.info?.(`FFmpeg ${pin.version}: downloading from ${pin.url}`);
      const res = await f(pin.url, { redirect: 'follow', signal: this._abort.signal });
      if (res.status === 404 || res.status === 410) throw new Error('the download is unavailable (the pinned build was withdrawn): update the app to get a newer converter');
      if (!res.ok) throw new Error(`the download failed (HTTP ${res.status})`);
      const hash = crypto.createHash('sha256');
      let n = 0, last = 0;
      const body = Readable.fromWeb ? Readable.fromWeb(res.body) : res.body;
      body.on('data', (c) => {
        n += c.length; hash.update(c);
        if (n > pin.size + 4096) body.destroy(new Error('the download is larger than the pinned build'));
        this.installing.done = n;
        if (Date.now() - last > 300) { last = Date.now(); this.onChange(); }
      });
      await pipeline(body, fs.createWriteStream(zip));
      const got = hash.digest('hex');
      if (got !== pin.sha256) throw new Error(`the download does not match the pinned SHA-256 (got ${got.slice(0, 12)}..., expected ${pin.sha256.slice(0, 12)}...): it was discarded`);
      const entries = await listZip(zip);
      const exeEntry = entries.find((e) => /(^|\/)bin\/ffmpeg\.exe$/i.test(e.name));
      const licEntry = entries.find((e) => /(^|\/)LICENSE(\.txt)?$/i.test(e.name));
      if (!exeEntry) throw new Error('the download has no ffmpeg.exe');
      await extractEntry(zip, exeEntry, this.exe);
      if (licEntry) await extractEntry(zip, licEntry, path.join(this.dir, 'LICENSE.txt'));
      else fs.writeFileSync(path.join(this.dir, 'LICENSE.txt'), `FFmpeg is licensed under the ${pin.license}. Full text: ${pin.licenseUrl}\n`);
      const v = await this.versionOf(this.exe);
      if (/--enable-(gpl|nonfree)\b/.test(v.config)) throw new Error('this FFmpeg build is not LGPL (it enables GPL or non-free code): it was removed');
      fs.writeFileSync(path.join(this.dir, 'SOURCE.txt'), `FFmpeg ${v.version} (${pin.build})\nBuilt by: ${pin.source}\nDownloaded from: ${pin.url}\nSHA-256: ${pin.sha256}\nLicence: ${pin.license} - ${pin.licenseUrl}\nFFmpeg source code: ${pin.sourceCode}\n`);
      fs.writeFileSync(path.join(this.dir, 'install.json'), JSON.stringify({ version: v.version, build: pin.build, sha256: pin.sha256, url: pin.url, license: pin.license, source: pin.source, size: fs.statSync(this.exe).size, installedAt: new Date().toISOString() }, null, 2));
      this.log?.info?.(`FFmpeg ${v.version} installed in ${this.dir}`);
    } catch (e) {
      this.error = this._abort?.signal.aborted ? 'the installation was cancelled' : String(e.message || e);
      this.log?.warn?.(`FFmpeg install: ${this.error}`);
      this._wipe();
      throw new Error(this.error);
    } finally {
      this.installing = null; this._abort = null;
      fs.rmSync(zip, { force: true });
      this.onChange();
    }
    return this.status();
  }

  cancelInstall() { this._abort?.abort(); }

  _wipe() { try { fs.rmSync(this.dir, { recursive: true, force: true }); } catch { /* in use */ } }

  /** Deletes the converter (the folder with the executable, the licence and the note of its source). */
  remove() {
    if (this.installing) throw new Error('wait for the installation to finish (or cancel it)');
    if (this.busy()) throw new Error('a conversion is running with FFmpeg: wait for it to finish (or cancel it) before removing the converter');
    this._wipe(); this.error = null;
    this.onChange();
    return this.status();
  }
}
