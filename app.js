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
  appMode: 'jira', // 'jira' or 'notes'
  standAloneNotes: [], // [{id, title, body, created, updated}]
  activeNoteId: null,
};

let draggedKey = null; // for drag & drop
let screenshotStore = {}; // id -> data URL (stored separately from state to manage size)

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

function updateViewMode() {
  document.body.setAttribute('data-app-mode', state.appMode);

  // Update tab bar
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  const activeTab = document.getElementById('tab-' + state.appMode);
  if (activeTab) activeTab.classList.add('active');

  // Apply layout from state
  const sb = document.getElementById('sidebar');
  const mid = document.getElementById('middle');
  const nts = document.getElementById('notes-pane');

  if (sb) {
    sb.style.width = state.layout.sidebarWidth + 'px';
    sb.classList.toggle('collapsed', state.layout.sidebarCollapsed);
  }
  if (mid) {
    mid.style.width = state.layout.middleWidth + 'px';
    mid.classList.toggle('collapsed', state.layout.middleCollapsed);
  }
  if (nts) {
    nts.style.width = state.layout.notesWidth + 'px';
  }

  if (state.appMode === 'notes') {
    renderNotesSidebar();
    renderNoteEditor();
  } else if (state.appMode === 'history') {
    renderSidebar();
    renderHistoryTable();
  } else {
    renderSidebar();
    renderMiddle();
    renderReading();
  }
}

// ── LAYOUT & RESIZING ─────────────────────────────────────────────────────────
window.toggleCollapse = function (id) {
  if (id === 'sidebar') state.layout.sidebarCollapsed = !state.layout.sidebarCollapsed;
  if (id === 'middle') state.layout.middleCollapsed = !state.layout.middleCollapsed;
  saveState();
  updateViewMode();
};

function initResizing() {
  const body = document.getElementById('app-body');
  const setup = (handleId, targetId, prop, min, align) => {
    const handle = document.getElementById(handleId);
    const target = document.getElementById(targetId);
    if (!handle || !target) return;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      body.classList.add('resizing');
      handle.classList.add('active');
      const startX = e.pageX;
      const startW = target.offsetWidth;

      const onMouseMove = (moveE) => {
        let diff = moveE.pageX - startX;
        if (align === 'right') diff = -diff;
        let newW = startW + diff;
        if (newW < min) newW = min;
        target.style.width = newW + 'px';
        state.layout[prop] = newW;
      };

      const onMouseUp = () => {
        body.classList.remove('resizing');
        handle.classList.remove('active');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        saveState();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  };

  setup('resizer-sidebar', 'sidebar', 'sidebarWidth', 120, 'left');
  setup('resizer-middle', 'middle', 'middleWidth', 150, 'left');
  setup('resizer-notes', 'notes-pane', 'notesWidth', 200, 'right');
}

// ── RENDER SIDEBAR ────────────────────────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('group-list');
  if (!list) return;
  let html = '';

  for (const g of state.groups) {
    if (g.id === 'history') continue; // history is now its own tab
    const isActive = state.activeGroupId === g.id;
    const activeClass = isActive ? ' active' : '';

    const icon = avBadge(g.name, 'av-sm');

    const dragAttrs =
      'ondragover="handleDragOver(event)" ondrop="handleDropToGroup(event, \'' +
      esc(g.id) +
      '\')" ondragleave="handleDragLeave(event)"';

    // Inline action buttons (rename + delete) — shown when active
    const renameBtn =
      '<button class="g-action-btn" data-action="rename" data-id="' +
      esc(g.id) +
      '" title="Rename">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
      '</button>';
    const deleteBtn =
      '<button class="g-action-btn" data-action="delete" data-id="' +
      esc(g.id) +
      '" title="Delete">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>' +
      '</button>';
    const actions = isActive ? '<span class="g-actions">' + renameBtn + deleteBtn + '</span>' : '';

    // order: icon | name [flex] | actions | count — count always at far right
    html +=
      '<div class="group-item' +
      activeClass +
      '" data-id="' +
      esc(g.id) +
      '" ' +
      dragAttrs +
      '>' +
      icon +
      '<span class="g-name">' +
      esc(g.name) +
      '</span>' +
      actions +
      '<span class="count">' +
      g.keys.length +
      '</span>' +
      '</div>';
  }
  list.innerHTML = html;

  list.querySelectorAll('.group-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.g-action-btn')) return; // handled separately
      state.appMode = 'jira';
      state.activeGroupId = el.dataset.id;
      const g = getGroup(state.activeGroupId);
      if (!state.activeKey || !g.keys.includes(state.activeKey)) {
        state.activeKey = g.keys[0] || null;
      }
      saveState();
      updateViewMode();
    });
  });

  list.querySelectorAll('.g-action-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (btn.dataset.action === 'rename') renameGroup(id);
      else if (btn.dataset.action === 'delete') deleteGroup(id);
    });
  });

  // Restore header and add-group-btn for Jira mode
  const sidebarHeader = document.querySelector('#sidebar .middle-header span:first-child');
  if (sidebarHeader) sidebarHeader.textContent = 'Lists';
  const addBtn = document.getElementById('add-group-btn');
  if (addBtn) {
    addBtn.onclick = () => {
      const name = prompt('New List Name:');
      if (name && name.trim()) {
        const id = 'g_' + Date.now();
        insertGroupBeforeHistory({ id, name: name.trim(), keys: [] });
        state.activeGroupId = id;
        saveState();
        updateViewMode();
      }
    };
  }
}

function renameGroup(id) {
  const g = getGroup(id);
  const newName = prompt('Rename list:', g.name);
  if (newName && newName.trim()) {
    g.name = newName.trim();
    saveState();
    updateViewMode();
  }
}

function deleteGroup(id) {
  if (id === 'history') return;
  const g = getGroup(id);
  const msg = g.isFilter
    ? 'Delete this filter group? (Filter tickets are not moved to History.)'
    : 'Delete this group? Tickets will be moved to History.';
  if (confirm(msg)) {
    if (!g.isFilter) {
      for (const key of g.keys) {
        addToHistory(key);
      }
    }
    state.groups = state.groups.filter((x) => x.id !== id);
    if (state.activeGroupId === id) {
      state.activeGroupId = getDefaultGroup()?.id || state.groups[0]?.id;
    }
    saveState();
    updateViewMode();
  }
}

// ── GROUPS ────────────────────────────────────────────────────────────────────
function insertGroupBeforeHistory(group) {
  const histIdx = state.groups.findIndex((g) => g.id === 'history');
  if (histIdx !== -1) state.groups.splice(histIdx, 0, group);
  else state.groups.push(group);
}

document.getElementById('add-group-btn').addEventListener('click', () => {
  const name = prompt('New List Name:');
  if (name && name.trim()) {
    const id = 'g_' + Date.now();
    insertGroupBeforeHistory({ id, name: name.trim(), keys: [] });
    state.activeGroupId = id;
    saveState();
    updateViewMode();
  }
});

// ── RENDER MIDDLE ─────────────────────────────────────────────────────────────
function renderMiddle() {
  const group = getActiveGroup();
  const nameEl = document.getElementById('current-group-name');
  if (nameEl) nameEl.textContent = group.name;

  const list = document.getElementById('ticket-list');
  if (!list) return;
  if (!group.keys.length) {
    list.innerHTML =
      '<div class="empty-msg">No tickets in this list.<br>Search a key to add one.</div>';
    return;
  }

  let html = '';
  for (const entry of group.keys) {
    const key = typeof entry === 'string' ? entry : entry.key;
    const addedDate = typeof entry === 'object' && entry.added ? relDate(entry.added) : null;
    const active = state.activeKey === key ? ' active' : '';
    const issue = issueCache[key] || {};
    const f = issue.fields || {};
    let sum = f.summary || 'Loading...';
    let stat = f.status ? f.status.name : '';

    html +=
      '<div class="list-card' +
      active +
      '" data-key="' +
      esc(key) +
      '" draggable="true" ' +
      'ondragstart="handleDragStart(event, \'' +
      esc(key) +
      '\')" ondragover="handleDragOver(event)" ondrop="handleDropToItem(event, \'' +
      esc(key) +
      '\')" ondragleave="handleDragLeave(event)">' +
      '<div class="lc-key-row">' +
      (stat
        ? '<span class="status-badge ' +
          statusClass(f.status?.statusCategory?.name || stat) +
          '">' +
          esc(stat) +
          '</span>'
        : '') +
      '</div>' +
      '<div class="lc-title-row">' +
      '<span class="lc-summary">' +
      '<span style="color:var(--accent);">' +
      esc(key) +
      '</span> ' +
      esc(sum) +
      '</span>' +
      '</div>' +
      (addedDate ? '<div class="lc-added">viewed ' + addedDate + '</div>' : '') +
      '<button class="lc-delete" title="Remove from list" onclick="event.stopPropagation(); removeTicket(\'' +
      esc(key) +
      '\')">✕</button>' +
      '</div>';
  }
  list.innerHTML = html;
  list.querySelectorAll('.list-card').forEach((el) => {
    el.addEventListener('click', () => {
      if (group.id === 'history') {
        openFromHistory(el.dataset.key);
      } else {
        state.activeKey = el.dataset.key;
        saveState();
        updateViewMode();
      }
    });
  });
}

function removeTicket(key) {
  const group = getActiveGroup();
  if (group.id === 'history') {
    group.keys = group.keys.filter((k) => (typeof k === 'string' ? k !== key : k.key !== key));
  } else {
    group.keys = group.keys.filter((k) => k !== key);
  }
  if (state.activeKey === key) state.activeKey = null;
  saveState();
  updateViewMode();
}

// ── RENDER HISTORY TABLE ──────────────────────────────────────────────────────
function renderHistoryTable() {
  const pane = document.getElementById('history-pane');
  if (!pane) return;
  const hist = getGroup('history');
  const limit = parseInt(cfg.historyLimit) || 100;
  const entries = hist.keys.slice(0, limit);

  if (!entries.length) {
    pane.innerHTML =
      '<div class="ht-empty">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="color:var(--text-tertiary)">' +
      '<path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/>' +
      '</svg>' +
      '<h3>No history yet</h3>' +
      '<p>Open tickets to build your history.</p>' +
      '</div>';
    return;
  }

  const shown = entries.length;
  const total = hist.keys.length;
  const headerRight =
    total > shown ? shown + ' of ' + total + ' shown' : shown + ' item' + (shown === 1 ? '' : 's');

  let html =
    '<div class="middle-header">' +
    '<span>History</span>' +
    '<span style="font-size:11px;color:var(--text-tertiary);font-weight:400;">' +
    esc(headerRight) +
    '</span>' +
    '</div>' +
    '<div class="ht-scroll">' +
    '<table class="ht-table">' +
    '<thead><tr>' +
    '<th class="ht-col-key">Key</th>' +
    '<th class="ht-col-summary">Summary</th>' +
    '<th class="ht-col-status">Status</th>' +
    '<th class="ht-col-assignee">Assignee</th>' +
    '<th class="ht-col-created">Created</th>' +
    '<th class="ht-col-viewed">Viewed</th>' +
    '<th class="ht-col-remove"></th>' +
    '</tr></thead>' +
    '<tbody>';

  for (const entry of entries) {
    const key = typeof entry === 'string' ? entry : entry.key;
    const added = typeof entry === 'object' ? entry.added : null;
    const issue = issueCache[key];
    const f = issue ? issue.fields || {} : null;
    const loaded = f !== null;

    const summary = loaded ? f.summary || '—' : 'Loading…';
    const status = loaded ? (f.status ? f.status.name : '—') : '';
    const assigneeName = loaded ? (f.assignee ? f.assignee.displayName : null) : null;
    const created = loaded ? (f.created ? relDate(f.created) : '—') : '';
    const viewed = added ? relDate(added) : '';
    const statusCls =
      loaded && f.status ? statusClass(f.status?.statusCategory?.name || status) : '';
    const assigneeHtml = loaded
      ? assigneeName
        ? '<div class="ht-assignee-cell">' +
          avBadge(assigneeName, 'av-sm') +
          '<span>' +
          esc(assigneeName) +
          '</span></div>'
        : '—'
      : '<span class="ht-loading">…</span>';

    html +=
      '<tr class="ht-row" data-key="' +
      esc(key) +
      '">' +
      '<td class="ht-cell ht-key-cell"><span class="ht-key-text">' +
      esc(key) +
      '</span></td>' +
      '<td class="ht-cell ht-summary-cell">' +
      (loaded ? esc(summary) : '<span class="ht-loading">' + esc(summary) + '</span>') +
      '</td>' +
      '<td class="ht-cell">' +
      (status
        ? '<span class="status-badge ' + statusCls + '">' + esc(status) + '</span>'
        : loaded
          ? '—'
          : '<span class="ht-loading">…</span>') +
      '</td>' +
      '<td class="ht-cell">' +
      assigneeHtml +
      '</td>' +
      '<td class="ht-cell ht-viewed-cell">' +
      (loaded ? esc(created) : '<span class="ht-loading">…</span>') +
      '</td>' +
      '<td class="ht-cell ht-viewed-cell">' +
      esc(viewed) +
      '</td>' +
      '<td class="ht-cell ht-remove-cell"><button class="ht-remove-btn" data-key="' +
      esc(key) +
      '" title="Remove from history">✕</button></td>' +
      '</tr>';
  }

  html += '</tbody></table></div>';
  pane.innerHTML = html;

  pane.querySelectorAll('.ht-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.ht-remove-btn')) return;
      openFromHistory(row.dataset.key);
    });
  });

  pane.querySelectorAll('.ht-remove-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeTicket(btn.dataset.key);
    });
  });

  // Fetch uncached items asynchronously, then refresh table when each arrives
  const uncached = entries.filter((e) => {
    const k = typeof e === 'string' ? e : e.key;
    return !issueCache[k];
  });
  uncached.forEach(async (entry) => {
    const key = typeof entry === 'string' ? entry : entry.key;
    try {
      await fetchIssue(key);
      saveState();
      if (state.activeGroupId === 'history' && state.appMode !== 'notes') {
        renderHistoryTable();
      }
    } catch (_) {
      // leave the row as "Loading…" — network may be unavailable
    }
  });
}

async function loadAllGroupTickets() {
  const group = getActiveGroup();
  for (const key of group.keys) {
    if (!issueCache[key]) {
      try {
        issueCache[key] = await fetchIssue(key);
        saveState();
        renderMiddle();
        if (state.activeKey === key) renderReading();
      } catch (e) {}
    }
  }
}

// ── RENDER RIGHT (READING) ────────────────────────────────────────────────────
function renderReading() {
  const empty = document.getElementById('reading-empty');
  const content = document.getElementById('reading-content');
  if (!empty || !content) return;
  if (!state.activeKey) {
    empty.style.display = 'block';
    content.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  content.style.display = 'block';

  const key = state.activeKey;
  addToHistory(key); // record view — deduplicates silently, updates timestamp
  const issue = issueCache[key];
  // Partial cache entries (from JQL search) only have a few fields — description is never included.
  // A full fetchIssue (fields=*all) always has description present (even if null).
  // This check correctly catches both new partial entries and old ones that had renderedFields.
  if (!issue || issue.fields?.description === undefined) {
    content.innerHTML =
      '<div class="loading-spinner"><div class="spinner"></div>Loading ' + esc(key) + '...</div>';
    fetchIssue(key)
      .then((data) => {
        issueCache[key] = data;
        saveState();
        renderMiddle();
        if (state.activeKey === key) renderReading();
      })
      .catch((err) => {
        content.innerHTML =
          '<div class="empty-msg" style="color:var(--red);">Error loading ' +
          esc(key) +
          ':<br>' +
          esc(err.message) +
          '</div>';
      });
    return;
  }

  const f = issue.fields;
  let selHtml =
    '<select class="rs-group-select" onchange="moveTicket(\'' + esc(key) + '\', this.value)">';
  for (const g of state.groups) {
    selHtml +=
      '<option value="' +
      esc(g.id) +
      '" ' +
      (g.id === state.activeGroupId ? 'selected' : '') +
      '>' +
      esc(g.name) +
      '</option>';
  }
  selHtml += '</select>';

  let html = '<div class="rs-header">';
  html += '<div style="margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap;">';
  const myLbls = state.labels[key] || [];
  for (const L of myLbls) {
    const c = state.labelColors[L] || '#6e7681';
    const escapedL = esc(L).replace(/'/g, "\\'");
    html +=
      '<span class="lbl-badge" style="background:' +
      c +
      ';' +
      (c === '#f0883e' || c === '#e3b341' ? 'color:#000;' : 'color:#fff;') +
      '">' +
      '<span onclick="viewByLabel(\'' +
      escapedL +
      '\')" style="cursor:pointer;" title="View all tickets with this label">' +
      esc(L) +
      '</span>' +
      ' <span class="x-btn" onclick="removeLabel(\'' +
      esc(key) +
      "', '" +
      escapedL +
      '\')">✕</span></span>';
  }
  html += '<button class="lbl-add" onclick="addLabel(\'' + esc(key) + '\')">+ Label</button></div>';

  html +=
    '<div class="rs-title-row"><div class="rs-title"><a href="' +
    esc(cfg.baseUrl) +
    '/browse/' +
    esc(key) +
    '" target="_blank" style="color:var(--accent);text-decoration:none;">' +
    esc(key) +
    '</a> ' +
    esc(f.summary) +
    '</div></div>';
  html +=
    '<div class="rs-actions">' +
    selHtml +
    '<button class="top-btn" onclick="toggleNotes()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg> Notes</button>' +
    '<button class="top-btn" onclick="forceRefreshReading()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.38-7.72"/></svg> Refresh</button></div></div>';

  html += '<div class="meta-grid">';
  const metas = [
    {
      l: 'Status',
      v:
        '<span class="status-badge ' +
        statusClass(f.status?.statusCategory?.name || f.status?.name) +
        '">' +
        esc(f.status?.name) +
        '</span>',
    },
    {
      l: 'Assignee',
      v: f.assignee
        ? avBadge(f.assignee.displayName, 'av-sm') + ' ' + esc(f.assignee.displayName)
        : 'Unassigned',
    },
    {
      l: 'Reporter',
      v: f.reporter
        ? avBadge(f.reporter.displayName, 'av-sm') + ' ' + esc(f.reporter.displayName)
        : '—',
    },
    { l: 'Type', v: f.issuetype?.name || '—' },
    { l: 'Created', v: relDate(f.created) },
    { l: 'Updated', v: relDate(f.updated) },
  ];
  for (const m of metas)
    html +=
      '<div class="meta-item"><div class="meta-label">' +
      m.l +
      '</div><div class="meta-value">' +
      m.v +
      '</div></div>';
  html += '</div>';

  html +=
    '<div class="section-title" id="hierarchy-title" style="display:none;">Hierarchy</div><div id="hierarchy-chain" style="margin-bottom:12px;"></div>';

  if (issue.renderedFields) {
    const HIDDEN_FIELDS = [
      'last viewed',
      'updated',
      'status category changed',
      '[chart] date of first response',
      'created',
      'parent key',
      'ticket score',
      'service offering',
    ];

    if (issue.renderedFields.description) {
      // Aggressive strip of Smart Link icons and Jira-injected decorators
      let cleanDesc = issue.renderedFields.description;
      cleanDesc = cleanDesc.replace(/<img[^>]*lightbulb[^>]*>/gi, '');
      cleanDesc = cleanDesc.replace(/<img[^>]*favicon[^>]*>/gi, '');
      cleanDesc = cleanDesc.replace(/<span[^>]*ak-link-icon[^>]*>.*?<\/span>/gi, '');
      cleanDesc = cleanDesc.replace(/<img[^>]*info-modeler[^>]*>/gi, '');
      html +=
        '<div class="section-title">Description</div><div class="description">' +
        cleanDesc +
        '</div>';
    }
    for (const [keyField, val] of Object.entries(issue.renderedFields)) {
      if (keyField === 'description' || keyField === 'comment' || !val || typeof val !== 'string')
        continue;
      const fName =
        customFieldMap[keyField] ||
        keyField.charAt(0).toUpperCase() + keyField.slice(1).replace(/_/g, ' ');
      const ln = fName.toLowerCase();
      if (ln.includes('time') || ln.includes('estimate') || ln.includes('worklog')) continue;
      if (ln.includes('incident')) continue;
      if (HIDDEN_FIELDS.includes(ln)) continue;
      html +=
        '<div class="section-title">' +
        esc(fName) +
        '</div><div class="description">' +
        val +
        '</div>';
    }
  }

  if (f.issuelinks && f.issuelinks.length) {
    html += '<div class="section-title">Linked Issues</div><div class="links-grid">';
    for (const l of f.issuelinks) {
      const isOut = !!l.outwardIssue;
      const t = isOut ? l.outwardIssue : l.inwardIssue;
      const rel = isOut ? l.type.outward : l.type.inward;
      html +=
        '<div class="link-card" onclick="openTicketByKey(\'' +
        esc(t.key) +
        '\')">' +
        '<div style="flex:1;min-width:0;">' +
        '<div class="link-type">' +
        esc(rel) +
        '</div>' +
        '<div class="link-key">' +
        esc(t.key) +
        '</div>' +
        '<div class="link-sum">' +
        esc(t.fields?.summary || '') +
        '</div></div>' +
        '<a href="' +
        esc(cfg.baseUrl) +
        '/browse/' +
        esc(t.key) +
        '" target="_blank" class="link-open-jira" onclick="event.stopPropagation()" title="Open in Jira">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
        '</a></div>';
    }
    html += '</div>';
  }

  const comments = f.comment?.comments || [];
  const rc = issue.renderedFields?.comment?.comments || [];
  if (comments.length) {
    html += '<div class="section-title">Comments (' + comments.length + ')</div><div>';
    for (let i = 0; i < comments.length; i++) {
      const c = comments[i];
      html +=
        '<div class="comment-item">' +
        '<div class="c-avatar">' +
        avBadge(c.author?.displayName, 'av-md') +
        '</div>' +
        '<div class="c-content">' +
        '<div class="c-header"><span class="c-author">' +
        esc(c.author?.displayName) +
        '</span><span class="c-date">' +
        relDate(c.created) +
        '</span></div>' +
        '<div class="c-body description">' +
        (rc[i] ? rc[i].body : '') +
        '</div></div></div>';
    }
    html += '</div>';
  }
  content.innerHTML = html;
  const notesTextEl = document.getElementById('notes-text');
  notesTextEl.value = state.notes[key] || '';
  bindPasteHandler(notesTextEl, 'ticket_' + key);
  bindAuthImages(content);
  renderHierarchy(key, f.parent);
}

async function renderHierarchy(rootKey, directParent) {
  if (!directParent) return;
  const titleEl = document.getElementById('hierarchy-title');
  const chainEl = document.getElementById('hierarchy-chain');
  if (!titleEl || !chainEl) return;

  // Build chain by walking up through parents (using cache or fetching)
  const chain = []; // [{key, summary, type}] from root to top
  let parentKey = directParent.key;
  const visited = new Set([rootKey]);

  while (parentKey && !visited.has(parentKey) && chain.length < 6) {
    visited.add(parentKey);
    let parentIssue = issueCache[parentKey];
    if (!parentIssue) {
      try {
        parentIssue = await fetchIssue(parentKey);
        issueCache[parentKey] = parentIssue;
        saveState();
      } catch {
        break;
      }
    }
    const pf = parentIssue.fields || {};
    chain.unshift({ key: parentKey, summary: pf.summary || '—', type: pf.issuetype?.name || '—' });
    parentKey = pf.parent ? pf.parent.key : null;
  }

  if (!chain.length) return;

  // Re-check the chain container still exists (user may have navigated away)
  const titleEl2 = document.getElementById('hierarchy-title');
  const chainEl2 = document.getElementById('hierarchy-chain');
  if (!titleEl2 || !chainEl2) return;

  titleEl2.style.display = '';
  let html = '';
  for (let i = 0; i < chain.length; i++) {
    const item = chain[i];
    const indent = i * 16;
    html +=
      '<div style="padding-left:' +
      indent +
      'px;margin-bottom:4px;">' +
      '<a href="' +
      esc(cfg.baseUrl) +
      '/browse/' +
      esc(item.key) +
      '" target="_blank" class="rs-parent-link">' +
      '<span style="font-size:11px;opacity:0.6;margin-right:4px;">' +
      esc(item.type) +
      '</span>' +
      esc(item.key) +
      ' — ' +
      esc(item.summary) +
      '</a></div>';
  }
  chainEl2.innerHTML = html;
}

function toggleNotes() {
  document.getElementById('notes-pane').classList.toggle('open');
}
function saveNotes(val) {
  if (state.activeKey) {
    state.notes[state.activeKey] = val;
    saveState();
  }
}

// ── RICH NOTES EDITOR HELPERS ─────────────────────────────────────────────────
function noteBodyToHtml(body) {
  if (!body) return '';
  // Already HTML — return as-is
  if (/<[a-z][\s\S]*>/i.test(body)) return body;
  // Plain text with optional ![screenshot](img_xxx) markers → convert to HTML
  return body
    .split('\n')
    .map((line) => {
      const m = line.match(/^!\[screenshot\]\((img_\d+)\)$/);
      if (m) return '<img data-img-id="' + m[1] + '" class="note-inline-img">';
      return '<p>' + (line ? esc(line) : '<br>') + '</p>';
    })
    .join('');
}

function serializeEditorBody(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('img[data-img-id]').forEach((img) => img.removeAttribute('src'));
  return clone.innerHTML;
}

function resolveImages(el) {
  el.querySelectorAll('img[data-img-id]').forEach((img) => {
    const id = img.getAttribute('data-img-id');
    if (screenshotStore[id]) img.src = screenshotStore[id];
  });
}

function insertImageAtCursor(file, editorEl) {
  const reader = new FileReader();
  reader.onload = () => {
    const imgId = 'img_' + Date.now();
    screenshotStore[imgId] = reader.result;
    editorEl.focus();
    const img = document.createElement('img');
    img.setAttribute('data-img-id', imgId);
    img.src = reader.result;
    img.className = 'note-inline-img';
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(img);
      range.setStartAfter(img);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editorEl.appendChild(img);
    }
    editorEl.dispatchEvent(new Event('input'));
    saveState();
    toast('Screenshot pasted', 'success');
  };
  reader.readAsDataURL(file);
}

function bindPasteHandler(editorEl) {
  editorEl.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        insertImageAtCursor(item.getAsFile(), editorEl);
        return;
      }
    }
  });
  editorEl.addEventListener('dragover', (e) => e.preventDefault());
  editorEl.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) {
      e.preventDefault();
      insertImageAtCursor(file, editorEl);
    }
  });
}

window.moveTicket = function (key, newGroupId) {
  const oldG = getGroup(state.activeGroupId);
  oldG.keys = oldG.keys.filter((k) => k !== key);
  const newG = getGroup(newGroupId);
  if (!newG.keys.includes(key)) newG.keys.unshift(key);
  if (state.activeKey === key && state.activeGroupId !== newGroupId) state.activeKey = null;
  saveState();
  updateViewMode();
  toast('Moved to ' + newG.name, 'success');
};

window.forceRefreshReading = async function () {
  const key = state.activeKey;
  if (key) {
    delete issueCache[key];
    renderReading();
  }
};

function addLabel(key) {
  // Get all existing labels for suggestions
  const allLabels = Object.keys(state.labelColors);
  const currentLabels = state.labels[key] || [];
  const suggestions = allLabels.filter((l) => !currentLabels.includes(l));

  // Show label picker modal
  showLabelPicker(key, suggestions);
}

function showLabelPicker(key, suggestions) {
  // Remove existing picker if any
  const existing = document.getElementById('label-picker');
  if (existing) existing.remove();

  let html =
    '<div id="label-picker" class="label-picker-overlay">' +
    '<div class="label-picker-box">' +
    '<div class="label-picker-header">Add Label<button class="modal-close" onclick="closeLabelPicker()">&times;</button></div>' +
    '<input type="text" id="label-picker-input" class="form-input" placeholder="Type a label name..." autocomplete="off" />';

  html += '<div class="label-picker-suggestions" id="label-picker-list">';
  for (const lbl of suggestions) {
    const c = state.labelColors[lbl] || '#6e7681';
    html +=
      '<div class="label-picker-item" data-label="' +
      esc(lbl) +
      '">' +
      '<span class="lbl-badge" style="background:' +
      c +
      ';' +
      (c === '#f0883e' || c === '#e3b341' ? 'color:#000;' : 'color:#fff;') +
      '">' +
      esc(lbl) +
      '</span></div>';
  }
  if (!suggestions.length) {
    html +=
      '<div style="padding:8px;color:var(--text-tertiary);font-size:12px;text-align:center;">No existing labels. Type to create one.</div>';
  }
  html += '</div></div></div>';

  document.body.insertAdjacentHTML('beforeend', html);

  const input = document.getElementById('label-picker-input');
  const listEl = document.getElementById('label-picker-list');

  input.focus();

  // Filter suggestions as you type
  input.addEventListener('input', () => {
    const val = input.value.trim().toLowerCase();
    listEl.querySelectorAll('.label-picker-item').forEach((item) => {
      item.style.display = item.dataset.label.toLowerCase().includes(val) ? '' : 'none';
    });
  });

  // Enter to create new label
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = input.value.trim();
      if (val) {
        applyLabel(key, val);
        closeLabelPicker();
      }
    }
    if (e.key === 'Escape') closeLabelPicker();
  });

  // Click suggestion to apply
  listEl.querySelectorAll('.label-picker-item').forEach((item) => {
    item.addEventListener('click', () => {
      applyLabel(key, item.dataset.label);
      closeLabelPicker();
    });
  });

  // Click overlay to close
  document.getElementById('label-picker').addEventListener('click', (e) => {
    if (e.target.id === 'label-picker') closeLabelPicker();
  });
}

function applyLabel(key, name) {
  const tn = name.trim();
  if (!tn) return;
  if (!state.labelColors[tn])
    state.labelColors[tn] = AV_COLORS[Object.keys(state.labelColors).length % AV_COLORS.length];
  if (!state.labels[key]) state.labels[key] = [];
  if (!state.labels[key].includes(tn)) {
    state.labels[key].push(tn);
    saveState();
    renderReading();
    toast('Label "' + tn + '" added');
  }
}

window.closeLabelPicker = function () {
  const el = document.getElementById('label-picker');
  if (el) el.remove();
};

function removeLabel(key, lbl) {
  if (state.labels[key]) {
    state.labels[key] = state.labels[key].filter((x) => x !== lbl);
    saveState();
    renderReading();
  }
}

// Global label navigation: find all tickets with a given label
window.viewByLabel = function (label) {
  const ticketKeys = [];
  for (const [key, labels] of Object.entries(state.labels)) {
    if (labels.includes(label)) ticketKeys.push(key);
  }
  if (!ticketKeys.length) {
    toast('No tickets found with label "' + label + '"', 'error');
    return;
  }

  // Create or find a group with this label name
  let groupId = 'lbl_' + label.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  let group = state.groups.find((g) => g.id === groupId);
  if (!group) {
    group = { id: groupId, name: '🏷️ ' + label, keys: [] };
    insertGroupBeforeHistory(group);
  }
  group.keys = ticketKeys;
  state.activeGroupId = groupId;
  state.activeKey = ticketKeys[0] || null;
  state.appMode = 'jira';
  saveState();
  updateViewMode();
  toast(ticketKeys.length + ' ticket(s) with label "' + label + '"');
};

// ── FILTER & JQL MODE ─────────────────────────────────────────────────────────
async function runFilterLoad(rawInput, customName = '') {
  const parsed = parseFilterInput(rawInput);
  let jql = '';
  let groupName = customName || 'Filter Results';

  if (parsed.type === 'filterId') {
    const filter = await fetchFilterById(parsed.value);
    jql = filter.jql;
    if (!customName) groupName = filter.name;
  } else {
    jql = parsed.value;
  }

  const results = await fetchByJql(jql);
  const issues = results.issues || [];
  if (!issues.length) {
    toast('No tickets found for this query', 'error');
    return;
  }

  const keys = issues.map((iss) => {
    if (issueCache[iss.key]?.fields?.description === undefined) issueCache[iss.key] = iss;
    return iss.key;
  });
  const id = 'filter_' + Date.now();
  insertGroupBeforeHistory({ id, name: groupName, keys, query: jql, isFilter: true });
  state.activeGroupId = id;
  state.activeKey = keys[0];
  saveState();
  updateViewMode();
  toast('Loaded ' + keys.length + ' tickets into "' + groupName + '"', 'success');
}

// ── DRAG AND DROP ─────────────────────────────────────────────────────────────
window.handleDragStart = (e, key) => {
  draggedKey = key;
};
window.handleDragOver = (e) => {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
};
window.handleDragLeave = (e) => {
  e.currentTarget.classList.remove('drag-over');
};
window.handleDropToGroup = (e, gId) => {
  e.currentTarget.classList.remove('drag-over');
  if (draggedKey) {
    const oldG = state.groups.find((x) => x.keys.includes(draggedKey));
    if (oldG && oldG.id !== gId) window.moveTicket(draggedKey, gId);
  }
};
window.handleDropToItem = (e, targetKey) => {
  e.currentTarget.classList.remove('drag-over');
  e.preventDefault();
  e.stopPropagation();
  if (!draggedKey || draggedKey === targetKey) return;
  const g = getActiveGroup();
  const oldIdx = g.keys.indexOf(draggedKey),
    newIdx = g.keys.indexOf(targetKey);
  if (oldIdx !== -1 && newIdx !== -1) {
    g.keys.splice(oldIdx, 1);
    g.keys.splice(newIdx, 0, draggedKey);
    saveState();
    renderMiddle();
  }
};

// ── IMAGE AUTH ENGINE ─────────────────────────────────────────────────────────
async function bindAuthImages(container) {
  container.querySelectorAll('img[src]').forEach((img) => {
    let src = img.getAttribute('src');
    if (
      src &&
      !src.startsWith('data:') &&
      !src.startsWith('blob:') &&
      (src.startsWith('/') || src.includes(cfg.baseUrl.split('//')[1]))
    ) {
      img.dataset.authSrc = src.startsWith('/') ? cfg.baseUrl + src : src;
      img.removeAttribute('src');
    }
  });
  container.querySelectorAll('img[data-auth-src]').forEach(async (img) => {
    const blob = await fetchBlob(img.dataset.authSrc);
    if (blob) img.src = blob;
    else img.alt = 'Image unavailable';
    delete img.dataset.authSrc;
  });
}

function openTicketByKey(val) {
  if (!val) return;
  const key = normalise(val);
  let g = getActiveGroup();
  if (g.id === 'history' || g.isFilter) {
    g = getDefaultGroup();
    state.activeGroupId = g.id;
  }
  if (g.keys.includes(key)) {
    toast(key + ' is already in this list');
  } else {
    g.keys.unshift(key);
  }
  state.activeKey = key;
  saveState();
  updateViewMode();
}

window.addToHistory = function (key) {
  const h = getGroup('history');
  if (h) {
    h.keys = h.keys.filter((k) => (typeof k === 'string' ? k !== key : k.key !== key));
    h.keys.unshift({ key, added: Date.now() });
    const limit = parseInt(cfg.historyLimit) || 100;
    if (h.keys.length > limit) h.keys = h.keys.slice(0, limit);
  }
};

window.openFromHistory = function (key) {
  let g = state.groups.find((x) => x.id !== 'history' && x.keys.includes(key)) || getDefaultGroup();
  if (!g.keys.includes(key)) g.keys.unshift(key);
  state.appMode = 'jira';
  state.activeGroupId = g.id;
  state.activeKey = key;
  saveState();
  updateViewMode();
};

// ── NOTES MODE ────────────────────────────────────────────────────────────────
function switchTab(tab) {
  state.appMode = tab;
  saveState();
  updateViewMode();
}

function createNote() {
  const note = {
    id: 'note_' + Date.now(),
    title: '',
    body: '',
    created: Date.now(),
    updated: Date.now(),
  };
  state.standAloneNotes.unshift(note);
  state.activeNoteId = note.id;
  saveState();
  updateViewMode();
  const titleInput = document.getElementById('note-title-input');
  if (titleInput) titleInput.focus();
}

function deleteNote(noteId) {
  if (!confirm('Delete this note?')) return;
  state.standAloneNotes = state.standAloneNotes.filter((n) => n.id !== noteId);
  if (state.activeNoteId === noteId) {
    state.activeNoteId = state.standAloneNotes.length ? state.standAloneNotes[0].id : null;
  }
  saveState();
  updateViewMode();
}

function getActiveNote() {
  return state.standAloneNotes.find((n) => n.id === state.activeNoteId) || null;
}

function renderNotesSidebar() {
  const list = document.getElementById('group-list');
  if (!list) return;
  const search = document.getElementById('notes-search-val') || '';

  let html = '';
  const notes = state.standAloneNotes;

  for (const note of notes) {
    const active = state.activeNoteId === note.id ? ' active' : '';
    const title = note.title || 'Untitled Note';
    const preview = stripHtml(note.body || '')
      .trim()
      .substring(0, 60);
    const dateStr = relDate(new Date(note.updated));

    html +=
      '<div class="note-item' +
      active +
      '" data-note-id="' +
      esc(note.id) +
      '">' +
      '<span class="note-item-title">' +
      esc(title) +
      '</span>' +
      '<span class="note-item-preview">' +
      esc(preview || 'Empty note') +
      '</span>' +
      '<span class="note-item-date">' +
      dateStr +
      '</span>' +
      '<button class="note-delete-btn" data-delete-id="' +
      esc(note.id) +
      '" title="Delete Note">✕</button>' +
      '</div>';
  }

  if (!notes.length) {
    html =
      '<div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:12px;">No notes yet.<br>Click + to create one.</div>';
  }

  list.innerHTML = html;

  // Bind click events
  list.querySelectorAll('.note-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('note-delete-btn')) return;
      state.activeNoteId = el.dataset.noteId;
      saveState();
      updateViewMode();
    });
  });

  list.querySelectorAll('.note-delete-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteNote(btn.dataset.deleteId);
    });
  });

  // Update sidebar header for notes mode
  const sidebarHeader = document.querySelector('#sidebar .middle-header span:first-child');
  if (sidebarHeader) sidebarHeader.textContent = 'Notes';

  // Change add-group-btn to add-note
  const addBtn = document.getElementById('add-group-btn');
  if (addBtn) {
    addBtn.onclick = createNote;
  }
}

function renderNoteEditor() {
  const pane = document.getElementById('notes-editor-pane');
  if (!pane) return;

  const note = getActiveNote();
  if (!note) {
    pane.innerHTML =
      '<div class="notes-empty-state">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="color:var(--text-tertiary);">' +
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
      '<polyline points="14 2 14 8 20 8"/></svg>' +
      '<h3>No note selected</h3>' +
      '<p>Select a note from the sidebar or create a new one.</p></div>';
    return;
  }

  // Restore the editor structure if it was replaced by empty state
  if (!document.getElementById('note-title-input')) {
    pane.innerHTML =
      '<div class="notes-editor-header">' +
      '<input type="text" class="note-title-input" id="note-title-input" placeholder="Untitled Note" />' +
      '<span class="note-date" id="note-date-display"></span></div>' +
      '<div class="note-toolbar" id="note-toolbar">' +
      '<button class="note-tool-btn" data-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button>' +
      '<button class="note-tool-btn" data-cmd="italic" title="Italic (Ctrl+I)"><i>I</i></button>' +
      '<div class="note-toolbar-sep"></div>' +
      '<button class="note-tool-btn" data-cmd="insertUnorderedList" title="Bullet List">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>' +
      '</button>' +
      '<button class="note-tool-btn" data-cmd="insertOrderedList" title="Numbered List">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 5h1v4" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 9h2" stroke="currentColor" stroke-width="1.5"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>' +
      '</button></div>' +
      '<div id="note-editor-body" class="note-editor-body" contenteditable="true" data-placeholder="Start writing..."></div>';
  }

  const ti = document.getElementById('note-title-input');
  const body = document.getElementById('note-editor-body');
  const dd = document.getElementById('note-date-display');
  const toolbar = document.getElementById('note-toolbar');

  if (ti) {
    ti.value = note.title;
    ti.oninput = () => {
      note.title = ti.value;
      note.updated = Date.now();
      saveState();
      const sidebarItem = document.querySelector(
        '.note-item[data-note-id="' + note.id + '"] .note-item-title'
      );
      if (sidebarItem) sidebarItem.textContent = note.title || 'Untitled Note';
    };
  }

  if (body) {
    body.innerHTML = noteBodyToHtml(note.body);
    resolveImages(body);
    body.oninput = () => {
      note.body = serializeEditorBody(body);
      note.updated = Date.now();
      saveState();
      const sidebarItem = document.querySelector(
        '.note-item[data-note-id="' + note.id + '"] .note-item-preview'
      );
      if (sidebarItem)
        sidebarItem.textContent = stripHtml(note.body).trim().substring(0, 60) || 'Empty note';
    };
    bindPasteHandler(body);
  }

  if (toolbar) {
    toolbar.querySelectorAll('.note-tool-btn[data-cmd]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.execCommand(btn.dataset.cmd, false, null);
      });
    });
  }

  if (dd) {
    dd.textContent = new Date(note.updated).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

function init() {
  loadConfig();
  if (!isConfigured()) document.getElementById('settings-overlay').classList.remove('hidden');
  loadState();
  initResizing();
  updateViewMode();
  if (isConfigured()) {
    fetchCustomFields();
    loadAllGroupTickets();
  }

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');

  function classifySearchInput(val) {
    const t = val.trim();
    if (!t) return 'open';
    if (/^\d+$/.test(t)) return 'filter'; // numeric filter ID
    if (t.startsWith('http')) {
      try {
        const u = new URL(t);
        if (u.searchParams.get('filter') || u.searchParams.get('jql')) return 'filter';
      } catch {}
      return 'open'; // browse URL → single ticket
    }
    const upper = t.toUpperCase();
    if (/^[A-Z][A-Z0-9]+-\d+$/.test(upper)) return 'open'; // ticket key
    return 'filter'; // everything else is JQL
  }

  searchInput.addEventListener('input', () => {
    const kind = classifySearchInput(searchInput.value);
    searchBtn.textContent = kind === 'filter' ? 'Load Filter' : 'Open';
  });

  document.getElementById('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = searchInput.value.trim();
    if (!val) return;

    if (classifySearchInput(val) === 'filter') {
      searchBtn.disabled = true;
      searchBtn.textContent = 'Loading…';
      try {
        await runFilterLoad(val);
        searchInput.value = '';
        searchBtn.textContent = 'Open';
      } catch (err) {
        toast('Error loading filter: ' + err.message, 'error');
        searchBtn.textContent = 'Load Filter';
      } finally {
        searchBtn.disabled = false;
      }
    } else {
      openTicketByKey(val);
      searchInput.value = '';
      searchBtn.textContent = 'Open';
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      const modal = document.getElementById('f2-modal');
      modal.classList.remove('hidden');
      setTimeout(() => document.getElementById('f2-input').focus(), 50);
    } else if (e.key === 'Escape') document.getElementById('f2-modal').classList.add('hidden');
  });

  document.getElementById('f2-form').addEventListener('submit', (e) => {
    e.preventDefault();
    openTicketByKey(document.getElementById('f2-input').value.trim());
    document.getElementById('f2-modal').classList.add('hidden');
    document.getElementById('f2-input').value = '';
  });

  document.getElementById('refresh-all-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.style.pointerEvents = 'none';
    btn.style.opacity = '0.5';
    const g = getActiveGroup();

    if (g.isFilter && g.query) {
      try {
        const results = await fetchByJql(g.query);
        const issues = results.issues || [];
        g.keys = issues.map((iss) => {
          if (issueCache[iss.key]?.fields?.description === undefined) issueCache[iss.key] = iss;
          return iss.key;
        });
        toast('Filter refreshed (' + g.keys.length + ' items)');
      } catch (err) {
        toast('Refresh failed: ' + err.message, 'error');
      }
    } else {
      for (const k of g.keys) delete issueCache[k];
      await loadAllGroupTickets();
      toast('List refreshed');
    }

    btn.style.pointerEvents = '';
    btn.style.opacity = '1';
    renderMiddle();
    if (state.activeKey) renderReading();
  });

  document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('cfg-url').value = cfg.baseUrl;
    document.getElementById('cfg-email').value = cfg.email;
    document.getElementById('cfg-token').value = cfg.token;
    document.getElementById('cfg-hist-limit').value = cfg.historyLimit || 100;
    document.getElementById('cfg-proxy-url').value = cfg.proxyUrl || '';
    document.getElementById('settings-overlay').classList.remove('hidden');
  });
  const closeCfg = () => document.getElementById('settings-overlay').classList.add('hidden');
  document.getElementById('settings-close').addEventListener('click', closeCfg);
  document.getElementById('settings-cancel').addEventListener('click', closeCfg);
  document.getElementById('settings-save').addEventListener('click', () => {
    cfg.baseUrl = (document.getElementById('cfg-url').value || DEFAULTS.baseUrl).replace(/\/$/, '');
    cfg.email = document.getElementById('cfg-email').value.trim();
    cfg.token = document.getElementById('cfg-token').value.trim();
    cfg.historyLimit = parseInt(document.getElementById('cfg-hist-limit').value) || 100;
    cfg.proxyUrl = (document.getElementById('cfg-proxy-url').value || '').trim().replace(/\/$/, '');
    saveConfig();
    closeCfg();
    toast('Settings saved');
    if (getActiveGroup().keys.length) loadAllGroupTickets();
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .catch((err) => console.error('ServiceWorker setup failed: ', err));
  });
}

init();
