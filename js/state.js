'use strict';

// ── APP STATE ─────────────────────────────────────────────────────────────────
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
  },
  appMode: 'jira', // 'jira' | 'labels' | 'notes' | 'history' | 'mindmap'
  labelsActiveGroup: null, // active label name in labels tab (string | null)
  standAloneNotes: [], // [{id, title, blocks[], created, updated}]
  activeNoteId: null,
  mindMaps: [], // [{id, name, code}]
  activeMindMapId: null,
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
}

// ── LOAD STATE ────────────────────────────────────────────────────────────────
async function loadState() {
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
          ...prefs,
        };
      } else {
        // First run after switching to chrome.storage — migrate from localStorage
        const raw = localStorage.getItem('jira_state');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.groups?.length) {
            state = parsed;
            // Persist migrated data into chrome.storage immediately
            saveState();
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
    console.warn('State load error — resetting to defaults.', err);
    applyMigrations();
    saveState();
  }
}

// ── SAVE STATE ────────────────────────────────────────────────────────────────
function saveState() {
  if (IS_EXT) {
    const prefs = {
      activeGroupId: state.activeGroupId,
      activeKey: state.activeKey,
      appMode: state.appMode,
      labelsActiveGroup: state.labelsActiveGroup,
      activeNoteId: state.activeNoteId,
      activeMindMapId: state.activeMindMapId,
      layout: state.layout,
      timelines: state.timelines,
    };
    chrome.storage.sync
      .set({
        [SK.groups]: state.groups,
        [SK.labels]: state.labels,
        [SK.colors]: state.labelColors,
        [SK.notes]: state.notes,
        [SK.canvas]: state.standAloneNotes,
        [SK.maps]: state.mindMaps,
        [SK.prefs]: prefs,
      })
      .catch((err) => {
        if (err?.message?.includes('QUOTA_EXCEEDED')) {
          // Fallback: store full state in local when sync quota is full
          chrome.storage.local.set({ crisp_state_fallback: JSON.stringify(state) });
          if (typeof toast === 'function') toast('Sync quota full — data saved locally', 'warn');
        } else {
          console.error('chrome.storage.sync write error:', err);
        }
      });
    chrome.storage.local.set({
      jira_issue_cache: issueCache,
      jira_screenshots: screenshotStore,
    });
  } else {
    localStorage.setItem('jira_state', JSON.stringify(state));
    localStorage.setItem('jira_issue_cache', JSON.stringify(issueCache));
    localStorage.setItem('jira_screenshots', JSON.stringify(screenshotStore));
  }
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
