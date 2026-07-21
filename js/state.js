'use strict';

// ── APP STATE ─────────────────────────────────────────────────────────────────
// State shape is described via JSDoc so that `tsc --checkJs` (see tsconfig.json)
// catches typos without a TypeScript migration.
//
// @typedef {{ id: string, name: string, keys: (string|{key:string, added:number})[], isFilter?: boolean, query?: string }} Group
// @typedef {{ sidebarWidth: number, middleWidth: number, notesWidth: number,
//   sidebarCollapsed: boolean, middleCollapsed: boolean, notesSidebarWidth: number,
//   mmSidebarWidth: number, mmEditorWidth: number, cbGroupsPaneWidth: number,
//   cbSidebarWidth: number, cbSidebarCollapsed: boolean,
//   ncSidebarCollapsed?: boolean, mmSidebarCollapsed?: boolean,
//   ncGroupsPaneWidth?: number, mmGroupsPaneWidth?: number }} Layout
// @typedef {{ start?: string, eta?: string }} Timeline
// @typedef {{
//   groups: Group[],
//   activeGroupId: string,
//   activeKey: string|null,
//   notes: Record<string,string>,
//   labels: Record<string,string[]>,
//   labelColors: Record<string,string>,
//   timelines: Record<string, Timeline>,
//   layout: Layout,
//   appMode: 'jira'|'labels'|'notes'|'history'|'mindmap'|'snippets',
//   labelsActiveGroup: string|null,
//   standAloneNotes: any[],
//   activeNoteId: string|null,
//   mindMaps: any[],
//   activeMindMapId: string|null,
//   codeBlocks: any[],
//   activeCodeBlockId: string|null,
//   cbGroups: any[],
//   activeCbGroupId: string|null,
//   lastCbLanguage: string,
//   autoRefresh: boolean,
//   openInWindow: boolean,
//   labelsActiveKey: string|null,
//   jiraActiveKey: string|null
// }} AppState

/** @type {AppState} */
let state = {
  groups: [{ id: 'inbox', name: 'Inbox', keys: [] }],
  activeGroupId: 'inbox',
  activeKey: null,
  notes: {}, // key -> string (ticket notes)
  labels: {}, // key -> [string]
  labelColors: {}, // label text -> color
  timelines: {}, // key -> { start?: 'YYYY-MM-DD', eta?: 'YYYY-MM-DD' }
  layout: {
    sidebarWidth: 240,
    middleWidth: 320,
    notesWidth: 320,
    sidebarCollapsed: false,
    middleCollapsed: false,
    notesSidebarWidth: 220,
    mmSidebarWidth: 200,
    mmEditorWidth: 280,
    cbGroupsPaneWidth: 180,
    cbSidebarWidth: 220,
    cbSidebarCollapsed: false,
  },
  appMode: 'jira', // 'jira' | 'labels' | 'notes' | 'history' | 'mindmap' | 'snippets'
  labelsActiveGroup: null, // active label name in labels tab (string | null)
  standAloneNotes: [], // [{id, title, blocks[], created, updated, groupId, linkedKeys[]}]
  activeNoteId: null,
  mindMaps: [], // [{id, name, code, groupId, linkedKeys[]}]
  activeMindMapId: null,
  codeBlocks: [], // [{id, title, code, language, groupId, created, updated, linkedKeys[]}]
  activeCodeBlockId: null,
  cbGroups: [], // [{id, name}]
  activeCbGroupId: null,
  lastCbLanguage: 'javascript',
  autoRefresh: false, // auto-refresh all tickets every hour
  openInWindow: true, // open app in popup window (false = open in tab)
  labelsActiveKey: null, // active ticket key while in Labels tab
  jiraActiveKey: null, // saved Jira key while Labels tab is open
};

let draggedKey = null; // for ticket drag & drop
let draggedGroupId = null; // for group reordering drag
let groupSearchQuery = ''; // current keyword filter in the middle pane
let screenshotStore = {}; // id -> data URL (stored separately from state to manage size)
let selectedKeys = new Set(); // keys currently multi-selected (ctrl/shift+click)

// ── STORAGE BACKEND DETECTION ─────────────────────────────────────────────────
// In the Chrome Extension context use chrome.storage (sync + local).
// In the test / PWA context fall back to localStorage.
const IS_EXT = typeof chrome !== 'undefined' && !!chrome?.storage?.sync;

// chrome.storage.sync key names — one key per logical slice so each stays
// under the 8 KB per-item quota even for power users.
const SK = {
  groups: 'crisp_groups',
  labels: 'crisp_labels',
  colors: 'crisp_colors',
  notes: 'crisp_notes',
  canvas: 'crisp_canvas',
  maps: 'crisp_maps',
  snippets: 'crisp_snippets',
  prefs: 'crisp_prefs',
};

// ── MIGRATIONS ────────────────────────────────────────────────────────────────
function applyMigrations() {
  // Ensure history group exists and entries are objects
  let hist = state.groups.find((g) => g.id === 'history');
  if (hist && hist.keys.length && typeof hist.keys[0] === 'string') {
    hist.keys = hist.keys.map((k) => ({ key: k, added: Date.now() }));
  }
  if (!hist) state.groups.push({ id: 'history', name: 'History', keys: [] });

  // Ensure field defaults
  if (!state.notes) state.notes = {};
  if (!state.labels) state.labels = {};
  if (!state.labelColors) state.labelColors = {};
  if (!state.layout)
    state.layout = {
      sidebarWidth: 240,
      middleWidth: 320,
      notesWidth: 320,
      sidebarCollapsed: false,
      middleCollapsed: false,
      notesSidebarWidth: 220,
      mmSidebarWidth: 200,
      mmEditorWidth: 280,
    };
  if (!state.layout.notesSidebarWidth) state.layout.notesSidebarWidth = 220;
  if (!state.layout.mmSidebarWidth) state.layout.mmSidebarWidth = 200;
  if (!state.layout.mmEditorWidth) state.layout.mmEditorWidth = 280;
  if (state.layout.ncSidebarCollapsed === undefined) state.layout.ncSidebarCollapsed = false;
  if (state.layout.mmSidebarCollapsed === undefined) state.layout.mmSidebarCollapsed = false;
  if (!state.layout.ncGroupsPaneWidth) state.layout.ncGroupsPaneWidth = 180;
  if (!state.layout.mmGroupsPaneWidth) state.layout.mmGroupsPaneWidth = 180;
  if (!state.appMode) state.appMode = 'jira';
  if (state.labelsActiveGroup === undefined) state.labelsActiveGroup = null;

  // activeGroupId must not be 'history'
  if (state.activeGroupId === 'history') {
    const first = state.groups.find((g) => g.id !== 'history');
    state.activeGroupId = first ? first.id : 'inbox';
  }
  if (!state.standAloneNotes) state.standAloneNotes = [];
  if (state.activeNoteId === undefined) state.activeNoteId = null;
  if (!state.timelines) state.timelines = {};
  if (!state.noteGroups) state.noteGroups = [];
  if (state.activeNoteGroupId === undefined) state.activeNoteGroupId = null;
  if (!state.mmGroups) state.mmGroups = [];
  if (state.activeMmGroupId === undefined) state.activeMmGroupId = null;
  // Ensure all notes and mindmaps have a groupId field
  for (const note of state.standAloneNotes) {
    if (note.groupId === undefined) note.groupId = null;
    if (!Array.isArray(note.linkedKeys)) note.linkedKeys = [];
  }

  // Migrate old note body string → canvas blocks format
  for (const note of state.standAloneNotes) {
    if ('body' in note && !note.blocks) {
      note.blocks = note.body
        ? [{ id: 'blk_' + note.id, type: 'text', x: 40, y: 40, w: 600, content: note.body }]
        : [];
      delete note.body;
    }
    if (!note.blocks) note.blocks = [];
  }

  // Migrate single mindMapCode → mindMaps array
  if (!state.mindMaps) {
    state.mindMaps = state.mindMapCode
      ? [{ id: 'mm_default', name: 'Diagram 1', code: state.mindMapCode }]
      : [];
    state.activeMindMapId = state.mindMaps.length ? state.mindMaps[0].id : null;
    delete state.mindMapCode;
  }
  if (state.activeMindMapId === undefined) state.activeMindMapId = null;
  for (const mm of state.mindMaps) {
    if (mm.groupId === undefined) mm.groupId = null;
    if (!Array.isArray(mm.linkedKeys)) mm.linkedKeys = [];
  }
  if (!state.codeBlocks) state.codeBlocks = [];
  if (state.activeCodeBlockId === undefined) state.activeCodeBlockId = null;
  if (!state.cbGroups) state.cbGroups = [];
  if (state.activeCbGroupId === undefined) state.activeCbGroupId = null;
  if (!state.lastCbLanguage) state.lastCbLanguage = 'javascript';
  if (!state.layout.cbGroupsPaneWidth) state.layout.cbGroupsPaneWidth = 180;
  if (!state.layout.cbSidebarWidth) state.layout.cbSidebarWidth = 220;
  if (state.layout.cbSidebarCollapsed === undefined) state.layout.cbSidebarCollapsed = false;
  for (const cb of state.codeBlocks) {
    if (cb.groupId === undefined) cb.groupId = null;
    if (!Array.isArray(cb.linkedKeys)) cb.linkedKeys = [];
  }
  if (state.autoRefresh === undefined) state.autoRefresh = false;
  if (state.openInWindow === undefined) state.openInWindow = true;
  if (state.labelsActiveKey === undefined) state.labelsActiveKey = null;
  if (state.jiraActiveKey === undefined) state.jiraActiveKey = null;
}

// ── LOAD/SAVE GUARDS ──────────────────────────────────────────────────────────
// Saves are dropped until loadState() completes; otherwise a caller running before
// storage has been read (e.g. a script executing during module init) would clobber
// real data with in-memory defaults. flushSaveState() and the beforeunload handler
// use this flag too.
let stateLoaded = false;

// Cache of the most recently persisted value of every sync slice, keyed by SK key
// and stored as a JSON string. We diff against this on every save so we only ever
// write slices that actually changed — cuts write volume and quota pressure.
let _lastPersistedSlices = {};

// Eviction caps to keep chrome.storage.local from growing without bound. The
// issue cache and screenshot store are both populated opportunistically and
// without any eviction before now.
const ISSUE_CACHE_MAX = 500;
const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function _evictIssueCache() {
  const keys = Object.keys(issueCache);
  const excess = keys.length - ISSUE_CACHE_MAX;
  if (excess <= 0) return;
  // Drop oldest-inserted keys. Object-property iteration order reflects
  // insertion order, which is a good-enough approximation of LRU for a cache
  // that is mostly append-on-view.
  for (let i = 0; i < excess; i++) delete issueCache[keys[i]];
}

function _evictScreenshots() {
  const entries = Object.entries(screenshotStore);
  let total = 0;
  for (const [, v] of entries) total += (v || '').length;
  if (total <= SCREENSHOT_MAX_BYTES) return;
  // FIFO by insertion order until we're under budget.
  for (const [k, v] of entries) {
    if (total <= SCREENSHOT_MAX_BYTES) break;
    total -= (v || '').length;
    delete screenshotStore[k];
  }
}

// ── LOAD STATE ────────────────────────────────────────────────────────────────
async function loadState() {
  let fatal = false;
  try {
    if (IS_EXT) {
      const synced = await chrome.storage.sync.get(Object.values(SK));

      if (synced[SK.groups]) {
        // Restore from chrome.storage.sync
        const prefs = synced[SK.prefs] || {};
        state = {
          ...state,
          groups: synced[SK.groups],
          labels: synced[SK.labels] || {},
          labelColors: synced[SK.colors] || {},
          notes: synced[SK.notes] || {},
          standAloneNotes: synced[SK.canvas] || [],
          mindMaps: synced[SK.maps] || [],
          codeBlocks: synced[SK.snippets] || [],
          ...prefs,
        };
        // Seed the diff cache with what's already on disk so the first save
        // does not rewrite every slice.
        _lastPersistedSlices = {
          [SK.groups]: JSON.stringify(synced[SK.groups]),
          [SK.labels]: JSON.stringify(synced[SK.labels] || {}),
          [SK.colors]: JSON.stringify(synced[SK.colors] || {}),
          [SK.notes]: JSON.stringify(synced[SK.notes] || {}),
          [SK.canvas]: JSON.stringify(synced[SK.canvas] || []),
          [SK.maps]: JSON.stringify(synced[SK.maps] || []),
          [SK.snippets]: JSON.stringify(synced[SK.snippets] || []),
          [SK.prefs]: JSON.stringify(prefs),
        };
      } else {
        // First run after switching to chrome.storage — migrate from localStorage
        const raw = localStorage.getItem('jira_state');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.groups?.length) {
            state = parsed;
            // NB: we deliberately do NOT saveState() here. stateLoaded is still
            // false at this point; the first real save after loadState finishes
            // will persist the migrated data into chrome.storage.sync.
          }
        }
      }

      // Cache and screenshots stay local (too large / not needed on other devices)
      const local = await chrome.storage.local.get(['jira_issue_cache', 'jira_screenshots']);
      if (local.jira_issue_cache) issueCache = local.jira_issue_cache;
      if (local.jira_screenshots) screenshotStore = local.jira_screenshots;
    } else {
      // Non-extension context (tests, PWA) — use localStorage
      const raw = localStorage.getItem('jira_state');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.groups?.length) state = parsed;
      } else {
        const old = localStorage.getItem('jira_open_keys');
        if (old) state.groups[0].keys = JSON.parse(old);
      }
      const cached = localStorage.getItem('jira_issue_cache');
      if (cached) issueCache = JSON.parse(cached);
      const ssData = localStorage.getItem('jira_screenshots');
      if (ssData) screenshotStore = JSON.parse(ssData);
    }

    applyMigrations();
  } catch (err) {
    fatal = true;
    console.warn('State load error — keeping raw data intact and using defaults in memory.', err);
    // Non-destructive recovery: preserve the raw payload under a backup key so the
    // user (or a support tech) can recover it. Do NOT auto-save defaults over it.
    try {
      if (!IS_EXT) {
        const raw = localStorage.getItem('jira_state');
        if (raw && !localStorage.getItem('jira_state_backup')) {
          localStorage.setItem('jira_state_backup', raw);
        }
      }
    } catch {
      /* backup is best-effort */
    }
    applyMigrations();
  }
  stateLoaded = true;
  if (fatal && typeof toast === 'function') {
    toast('Could not load saved data — using defaults (backup preserved).', 'error');
  }
}

// ── SAVE STATE ────────────────────────────────────────────────────────────────
// Debounce window for chrome.storage.sync writes. Short enough to feel instant
// but long enough to coalesce bursts (e.g. dragging, typing).
const SAVE_DEBOUNCE_MS = 50;

let _saveTimer = null;
let _savePending = false;
let _writeInFlight = null;

function _buildPrefsSlice() {
  return {
    activeGroupId: state.activeGroupId,
    activeKey: state.activeKey,
    appMode: state.appMode,
    labelsActiveGroup: state.labelsActiveGroup,
    activeNoteId: state.activeNoteId,
    activeMindMapId: state.activeMindMapId,
    activeCodeBlockId: state.activeCodeBlockId,
    activeCbGroupId: state.activeCbGroupId,
    lastCbLanguage: state.lastCbLanguage,
    cbGroups: state.cbGroups,
    layout: state.layout,
    timelines: state.timelines,
    autoRefresh: state.autoRefresh,
    openInWindow: state.openInWindow,
    labelsActiveKey: state.labelsActiveKey,
    jiraActiveKey: state.jiraActiveKey,
  };
}

function _buildSlicePayload() {
  return {
    [SK.groups]: state.groups,
    [SK.labels]: state.labels,
    [SK.colors]: state.labelColors,
    [SK.notes]: state.notes,
    [SK.canvas]: state.standAloneNotes,
    [SK.maps]: state.mindMaps,
    [SK.snippets]: state.codeBlocks,
    [SK.prefs]: _buildPrefsSlice(),
  };
}

async function _writeChangedSlices() {
  _evictIssueCache();
  _evictScreenshots();
  const slices = _buildSlicePayload();
  const changed = {};
  const snapshot = {};
  for (const k of Object.keys(slices)) {
    const ser = JSON.stringify(slices[k]);
    if (_lastPersistedSlices[k] !== ser) {
      changed[k] = slices[k];
      snapshot[k] = ser;
    }
  }
  if (Object.keys(changed).length) {
    try {
      await chrome.storage.sync.set(changed);
      Object.assign(_lastPersistedSlices, snapshot);
    } catch (err) {
      if (err?.message?.includes('QUOTA_EXCEEDED')) {
        try {
          await chrome.storage.local.set({ crisp_state_fallback: JSON.stringify(state) });
        } catch {
          /* ignore */
        }
        if (typeof toast === 'function') toast('Sync quota full — data saved locally', 'warn');
      } else {
        console.error('chrome.storage.sync write error:', err);
        // Leave _lastPersistedSlices unchanged so we retry on the next save.
      }
    }
  }
  try {
    await chrome.storage.local.set({
      jira_issue_cache: issueCache,
      jira_screenshots: screenshotStore,
    });
  } catch (err) {
    console.error('chrome.storage.local write error:', err);
  }
}

function _writeLocalStorage() {
  try {
    localStorage.setItem('jira_state', JSON.stringify(state));
    localStorage.setItem('jira_issue_cache', JSON.stringify(issueCache));
    localStorage.setItem('jira_screenshots', JSON.stringify(screenshotStore));
  } catch (err) {
    console.error('localStorage write error:', err);
  }
}

function saveState() {
  // Guard: never persist in-memory defaults over real data before loadState resolved.
  // Any caller that runs before loadState is silently dropped — the next save after
  // load will persist whatever the user does.
  if (!stateLoaded) return;

  if (!IS_EXT) {
    // localStorage is synchronous and cheap; writing immediately keeps existing
    // test behaviour (tests read localStorage right after actions).
    _evictIssueCache();
    _evictScreenshots();
    _writeLocalStorage();
    return;
  }

  _savePending = true;
  if (_saveTimer || _writeInFlight) return;
  _saveTimer = setTimeout(async () => {
    _saveTimer = null;
    while (_savePending) {
      _savePending = false;
      _writeInFlight = _writeChangedSlices();
      try {
        await _writeInFlight;
      } finally {
        _writeInFlight = null;
      }
    }
  }, SAVE_DEBOUNCE_MS);
}

// Flush any pending save immediately. Returns a promise that resolves when the
// final write has completed (useful in unload handlers and tests).
async function flushSaveState() {
  if (!stateLoaded) return;
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  if (!IS_EXT) {
    _evictIssueCache();
    _evictScreenshots();
    _writeLocalStorage();
    return;
  }
  if (_writeInFlight) {
    try {
      await _writeInFlight;
    } catch {
      /* ignore — errors already logged */
    }
  }
  if (_savePending) {
    _savePending = false;
    await _writeChangedSlices();
  }
}

// Best-effort flush on page hide/unload so the debounce window doesn't drop writes.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (!stateLoaded) return;
    if (!IS_EXT) {
      _writeLocalStorage();
      return;
    }
    if (_saveTimer || _savePending) {
      clearTimeout(_saveTimer);
      _saveTimer = null;
      _savePending = false;
      // Fire-and-forget — pagehide is synchronous and chrome.storage is async.
      _writeChangedSlices();
    }
  });
  // Expose for manual test flushing / future Settings "Export" action.
  window.flushSaveState = flushSaveState;
}

// ── STATE FACADE ──────────────────────────────────────────────────────────────
// The existing codebase mutates the top-level `state` object directly and calls
// saveState() afterwards. That pattern is hard to audit — stray mutations with
// no follow-up save have caused data loss bugs. New code should go through the
// facade below:
//
//   update(s => { s.activeKey = 'PROJ-1'; });
//   const snapshot = getState();      // frozen, cannot be mutated in place
//
// update() runs your callback against the live object, persists exactly once
// via saveState(), and (if requested) re-renders. Legacy direct mutations still
// work — this is additive, not enforced.

/**
 * Return a shallow-frozen view of the current state. The top-level object is
 * frozen so calling code can't accidentally mutate it, but nested arrays/objects
 * remain live references — which is intentional, since freezing deeply would
 * break the hot paths that read `state.groups[0].keys` thousands of times per
 * render. Treat the result as read-only.
 *
 * @returns {Readonly<AppState>}
 */
function getState() {
  return Object.freeze({ ...state });
}

/**
 * Mutate state inside a callback and persist exactly once. Rolls back and
 * re-throws if the callback throws, so a half-applied mutation never reaches
 * storage.
 *
 * @template T
 * @param {(s: AppState) => T} fn
 * @param {{ save?: boolean }} [opts]  Set `save:false` for transient changes
 *   (e.g. mid-drag reorders) that shouldn't trigger a save on every frame.
 * @returns {T}
 */
function update(fn, opts) {
  const save = opts?.save !== false;
  // Deep snapshot so rollback can undo nested mutations — callers mutate
  // state.groups[…].keys etc., which a shallow copy would share by reference.
  const before = structuredClone(state);
  try {
    const result = fn(state);
    if (save) saveState();
    return result;
  } catch (err) {
    state = before;
    throw err;
  }
}

// Expose on window for non-module callers (content scripts, tests, dev console).
if (typeof window !== 'undefined') {
  // @ts-ignore — augmenting window with app-level API.
  window.getState = getState;
  // @ts-ignore
  window.update = update;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
// Normalise a history-or-plain key entry to a plain key string.
// History entries are {key, added} objects; all other groups use plain strings.
function entryKey(e) {
  return typeof e === 'string' ? e : e.key;
}

function getGroup(id) {
  return state.groups.find((g) => g.id === id) || state.groups[0];
}
function getActiveGroup() {
  return getGroup(state.activeGroupId);
}
// First non-history, non-filter group — the safe fallback for any "home" operation
function getDefaultGroup() {
  return (
    state.groups.find((g) => g.id !== 'history' && !g.isFilter) ||
    state.groups.find((g) => g.id !== 'history') ||
    state.groups[0]
  );
}
