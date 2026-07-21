'use strict';

// ── BACKUP & EXPORT ───────────────────────────────────────────────────────────
// Two light, backend-free safety nets over the single `state` object:
//   1. Manual Export / Import — a portable JSON file.
//   2. Automatic rolling daily snapshots — a bounded ring in the same storage
//      backend as the app, so a corrupted/emptied state can be rolled back.
// `state` holds no credentials (those live in cfg / localStorage 'jira_config')
// and no issueCache/screenshots (separate module vars), so a plain dump of it is
// exactly the user's data — small and safe to share.

const BACKUP_PREFIX = 'crisp_backup_';
const BACKUP_INDEX_KEY = 'crisp_backup_index';
const SNAPSHOT_MAX = 7;

// Storage helpers — chrome.storage.local in the extension, localStorage otherwise
// (mirrors the IS_EXT split in state.js). Values are stored/returned as objects.
async function _bkGet(keys) {
  if (IS_EXT) return chrome.storage.local.get(keys);
  const out = {};
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v != null) {
      try {
        out[k] = JSON.parse(v);
      } catch {
        /* skip corrupt entry */
      }
    }
  }
  return out;
}
async function _bkSet(obj) {
  if (IS_EXT) return chrome.storage.local.set(obj);
  for (const k of Object.keys(obj)) localStorage.setItem(k, JSON.stringify(obj[k]));
}
async function _bkRemove(keys) {
  if (IS_EXT) return chrome.storage.local.remove(keys);
  for (const k of keys) localStorage.removeItem(k);
}

function _backupEnvelope() {
  return { app: 'crisp-for-jira', schema: 1, savedAt: new Date().toISOString(), data: state };
}

// Reassign the global `state` from imported/snapshot data, upgrade it, persist,
// and re-render. Mirrors what loadState does on startup.
function _applyImportedData(data) {
  // eslint-disable-next-line no-global-assign
  state = data;
  applyMigrations();
  saveState();
  if (typeof updateViewMode === 'function') updateViewMode();
}

// ── EXPORT / IMPORT ────────────────────────────────────────────────────────────
function exportData() {
  const filename = 'crisp-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  const blob = new Blob([JSON.stringify(_backupEnvelope(), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the download has surely started, so the object URL doesn't leak.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Parse a backup file's text into a usable state object, tolerating both the
// enveloped form ({app, data}) and a bare state dump. Throws on anything that
// isn't recognisably Crisp data.
function parseBackup(text) {
  const parsed = JSON.parse(text);
  const data = parsed && parsed.data ? parsed.data : parsed;
  if (!data || !Array.isArray(data.groups)) {
    throw new Error('Not a valid Crisp backup file');
  }
  return data;
}

function importBackupFile(file, onDone) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = parseBackup(String(reader.result));
    } catch (e) {
      toast('Import failed: ' + e.message, 'error');
      return;
    }
    if (
      !confirm(
        'Replace all current data with this backup? Your current groups, notes, diagrams, and preferences will be overwritten.'
      )
    ) {
      return;
    }
    _applyImportedData(data);
    toast('Backup imported', 'success');
    if (typeof onDone === 'function') onDone();
  };
  reader.onerror = () => toast('Could not read the file', 'error');
  reader.readAsText(file);
}

// ── AUTOMATIC DAILY SNAPSHOTS ───────────────────────────────────────────────────
// Called from loadState() after startup. Writes at most one snapshot per calendar
// day (the state as first loaded that day) and prunes to the last SNAPSHOT_MAX
// days, so this is a bounded, low-write safety net — not a per-save log.
async function maybeSnapshot() {
  if (!stateLoaded) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const got = await _bkGet([BACKUP_INDEX_KEY]);
    const index = Array.isArray(got[BACKUP_INDEX_KEY]) ? got[BACKUP_INDEX_KEY].slice() : [];
    if (index.includes(today)) return; // already snapshotted today
    index.push(today);
    index.sort();
    const toRemove = [];
    while (index.length > SNAPSHOT_MAX) {
      toRemove.push(BACKUP_PREFIX + index.shift());
    }
    await _bkSet({ [BACKUP_PREFIX + today]: _backupEnvelope(), [BACKUP_INDEX_KEY]: index });
    if (toRemove.length) await _bkRemove(toRemove);
  } catch (e) {
    console.warn('Snapshot failed:', e);
  }
}

async function listSnapshots() {
  const got = await _bkGet([BACKUP_INDEX_KEY]);
  const index = Array.isArray(got[BACKUP_INDEX_KEY]) ? got[BACKUP_INDEX_KEY] : [];
  return index.slice().sort().reverse(); // newest first
}

async function restoreSnapshot(date) {
  const key = BACKUP_PREFIX + date;
  const got = await _bkGet([key]);
  const snap = got[key];
  if (!snap || !snap.data || !Array.isArray(snap.data.groups)) {
    toast('Snapshot not found', 'error');
    return;
  }
  _applyImportedData(snap.data);
  toast('Restored backup from ' + date, 'success');
}
