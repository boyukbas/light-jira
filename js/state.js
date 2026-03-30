'use strict';

// ── APP STATE ─────────────────────────────────────────────────────────────────
let state = {
  groups: [{ id: 'inbox', name: 'Inbox', keys: [] }],
  activeGroupId: 'inbox',
  activeKey: null,
  notes: {}, // key -> string (ticket notes)
  labels: {}, // key -> [string]
  labelColors: {}, // label text -> color
  layout: {
    sidebarWidth: 240,
    middleWidth: 320,
    notesWidth: 320,
    sidebarCollapsed: false,
    middleCollapsed: false,
  },
  appMode: 'jira', // 'jira' | 'notes' | 'history' | 'mindmap'
  standAloneNotes: [], // [{id, title, body, created, updated}]
  activeNoteId: null,
  mindMapCode: '', // mermaid diagram source persisted across sessions
};

let draggedKey = null; // for ticket drag & drop
let draggedGroupId = null; // for group reordering drag
let groupSearchQuery = ''; // current keyword filter in the middle pane
let screenshotStore = {}; // id -> data URL (stored separately from state to manage size)
let bulkSelectMode = false; // whether the middle pane is in multi-select mode
let selectedKeys = new Set(); // keys currently checked in bulk mode

function loadState() {
  try {
    const s = localStorage.getItem('jira_state');
    if (s) {
      const parsed = JSON.parse(s);
      if (parsed.groups && parsed.groups.length) state = parsed;
    } else {
      const old = localStorage.getItem('jira_open_keys');
      if (old) state.groups[0].keys = JSON.parse(old);
    }
    // Migration/Ensure fields
    let hist = state.groups.find((g) => g.id === 'history');
    if (hist && hist.keys.length && typeof hist.keys[0] === 'string') {
      hist.keys = hist.keys.map((k) => ({ key: k, added: Date.now() }));
    }
    if (!hist) state.groups.push({ id: 'history', name: 'History', keys: [] });

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
      };
    if (!state.appMode) state.appMode = 'jira';
    // History is now a tab — activeGroupId should never be 'history'
    if (state.activeGroupId === 'history') {
      const first = state.groups.find((g) => g.id !== 'history');
      state.activeGroupId = first ? first.id : 'inbox';
    }
    if (!state.standAloneNotes) state.standAloneNotes = [];
    if (state.activeNoteId === undefined) state.activeNoteId = null;
    if (!state.mindMapCode) state.mindMapCode = '';

    const cached = localStorage.getItem('jira_issue_cache');
    if (cached) issueCache = JSON.parse(cached);
    const ssData = localStorage.getItem('jira_screenshots');
    if (ssData) screenshotStore = JSON.parse(ssData);
  } catch (err) {
    console.warn('State parse error. Resetting to defaults.', err);
    saveState(); // Overwrite corrupted state with current defaults
  }
}

function saveState() {
  localStorage.setItem('jira_state', JSON.stringify(state));
  localStorage.setItem('jira_issue_cache', JSON.stringify(issueCache));
  localStorage.setItem('jira_screenshots', JSON.stringify(screenshotStore));
}

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
