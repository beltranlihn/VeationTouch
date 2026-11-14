// Persistence. Everything lives under the data directory:
//   settings.json                    app settings (active profile, port, access token…)
//   profiles/<id>.json               room profiles
//   profiles/<id>/bg-<sensor>.json   learned backgrounds (large arrays kept out of the profile)
//   backups/<id>/<timestamp>.json    the last 30 versions of every profile
// Writes are atomic (temp file + rename) so a power cut never leaves half a JSON.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { normalizeProfile, slug } from './profile.js';

const BACKUPS_KEPT = 30;

export function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, JSON.stringify(data, null, 2));
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export class Store {
  /** @param {string} dataDir @param {string} bundledProfilesDir @param {object} log */
  constructor(dataDir, bundledProfilesDir, log) {
    this.dir = dataDir;
    this.profilesDir = path.join(dataDir, 'profiles');
    this.backupDir = path.join(dataDir, 'backups');
    this.log = log;
    fs.mkdirSync(this.profilesDir, { recursive: true });
    this._seed(bundledProfilesDir);
  }

  _seed(bundled) {
    if (!bundled || !fs.existsSync(bundled)) return;
    const have = new Set(this.listProfiles().map((p) => p.id));
    for (const f of fs.readdirSync(bundled)) {
      if (!f.endsWith('.json')) continue;
      try {
        const p = normalizeProfile(readJson(path.join(bundled, f)));
        if (!have.has(p.id)) { writeJsonAtomic(this._file(p.id), p); this.log.info(`seeded profile ${p.id}`); }
      } catch (e) { this.log.warn(`bundled profile ${f}: ${e.message}`); }
    }
  }

  // ---------------------------------------------------------------- settings

  loadSettings() {
    const file = path.join(this.dir, 'settings.json');
    let s = {};
    try { s = readJson(file); } catch { /* first run or corrupt → defaults */ }
    const out = {
      activeProfile: typeof s.activeProfile === 'string' ? s.activeProfile : null,
      httpPort: Number.isInteger(s.httpPort) ? s.httpPort : 8770,
      token: typeof s.token === 'string' && s.token.length >= 8 ? s.token : crypto.randomBytes(9).toString('base64url'),
      projection: { displayId: s.projection?.displayId ?? null, mode: ['off', 'identify', 'debug'].includes(s.projection?.mode) ? s.projection.mode : 'off', open: !!s.projection?.open },
      autostart: !!s.autostart,
    };
    if (JSON.stringify(out) !== JSON.stringify(s)) this.saveSettings(out);
    return out;
  }

  saveSettings(s) { writeJsonAtomic(path.join(this.dir, 'settings.json'), s); }

  // ---------------------------------------------------------------- profiles

  _file(id) { return path.join(this.profilesDir, `${id}.json`); }

  listProfiles() {
    const out = [];
    for (const f of fs.readdirSync(this.profilesDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const p = readJson(path.join(this.profilesDir, f));
        out.push({ id: p.id, name: p.name, walls: p.walls?.length || 0, sensors: p.sensors?.length || 0 });
      } catch { /* skip unreadable */ }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  loadProfile(id) {
    const file = this._file(id);
    try {
      return normalizeProfile(readJson(file));
    } catch (e) {
      // Corrupt file: fall back to the newest backup instead of losing the room.
      const b = this._latestBackup(id);
      if (b) { this.log.error(`profile ${id} unreadable (${e.message}); restored from backup ${path.basename(b)}`); return normalizeProfile(readJson(b)); }
      throw e;
    }
  }

  saveProfile(p) {
    const prof = normalizeProfile(p);
    const file = this._file(prof.id);
    if (fs.existsSync(file)) this._backup(prof.id, file);
    writeJsonAtomic(file, prof);
    return prof;
  }

  deleteProfile(id) {
    const file = this._file(id);
    if (fs.existsSync(file)) { this._backup(id, file); fs.rmSync(file); }
  }

  uniqueId(name) {
    const base = slug(name);
    let id = base, k = 2;
    while (fs.existsSync(this._file(id))) id = `${base}-${k++}`;
    return id;
  }

  _backup(id, file) {
    const dir = path.join(this.backupDir, id);
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(file, path.join(dir, `${stamp}.json`));
    const all = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    for (const f of all.slice(0, Math.max(0, all.length - BACKUPS_KEPT))) fs.rmSync(path.join(dir, f));
  }

  _latestBackup(id) {
    const dir = path.join(this.backupDir, id);
    if (!fs.existsSync(dir)) return null;
    const all = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    return all.length ? path.join(dir, all[all.length - 1]) : null;
  }

  // ---------------------------------------------------------------- backgrounds

  _bgFile(profileId, sensorId) { return path.join(this.profilesDir, profileId, `bg-${sensorId}.json`); }

  loadBackground(profileId, sensorId) {
    try { return readJson(this._bgFile(profileId, sensorId)); } catch { return null; }
  }

  saveBackground(profileId, sensorId, bg) { writeJsonAtomic(this._bgFile(profileId, sensorId), bg); }

  deleteBackground(profileId, sensorId) {
    try { fs.rmSync(this._bgFile(profileId, sensorId)); } catch { /* none */ }
  }
}
