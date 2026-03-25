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
    middleCollapsed: false
  },
  appMode: 'jira', // 'jira' or 'notes'
  standAloneNotes: [], // [{id, title, body, created, updated}]
  activeNoteId: null
};

let draggedKey = null; // for drag & drop
let ctxGroupId = null; // group ID actively being right-clicked
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
    let hist = state.groups.find(g => g.id === 'history');
    if (hist && hist.keys.length && typeof hist.keys[0] === 'string') {
      hist.keys = hist.keys.map(k => ({ key: k, added: Date.now() }));
    }
    if (!hist) state.groups.push({ id: 'history', name: 'History', keys: [] });

    if (!state.notes) state.notes = {};
    if (!state.labels) state.labels = {};
    if (!state.labelColors) state.labelColors = {};
    if (!state.layout) state.layout = { sidebarWidth: 240, middleWidth: 320, notesWidth: 320, sidebarCollapsed: false, middleCollapsed: false };
    if (!state.appMode) state.appMode = 'jira';
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

function getGroup(id) { return state.groups.find(g => g.id === id) || state.groups[0]; }
function getActiveGroup() { return getGroup(state.activeGroupId); }

function updateViewMode() {
  const isHist = state.activeGroupId === 'history';
  document.body.setAttribute('data-active-view', isHist ? 'history' : 'normal');
  document.body.setAttribute('data-app-mode', state.appMode);

  // Update tab bar
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
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
  } else {
    renderSidebar();
    if (isHist) renderHistoryTable();
    else {
      renderMiddle();
      renderReading();
    }
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
  const displayGroups = state.groups.filter(g => g.id !== 'history');

  for (const g of displayGroups) {
    const activeObj = state.activeGroupId === g.id ? ' active' : '';
    html += '<div class="group-item' + activeObj + '" data-id="' + esc(g.id) + '" ' +
      'ondragover="handleDragOver(event)" ondrop="handleDropToGroup(event, \'' + esc(g.id) + '\')" ondragleave="handleDragLeave(event)" ' +
      'oncontextmenu="showGroupCtx(event, \'' + esc(g.id) + '\')">' +
      '<span class="av-badge av-sm" style="background:var(--border);color:var(--text-tertiary);margin-right:8px;font-size:10px;">' + g.name[0].toUpperCase() + '</span>' +
      '<span class="g-name" style="flex:1">' + esc(g.name) + '</span>' +
      '<span class="count">' + g.keys.length + '</span>' +
      '</div>';
  }
  list.innerHTML = html;
  list.querySelectorAll('.group-item').forEach(el => {
    el.addEventListener('click', () => {
      state.activeGroupId = el.dataset.id;
      const g = getGroup(state.activeGroupId);
      if (state.activeGroupId !== 'history' && (!state.activeKey || !g.keys.includes(state.activeKey))) {
        state.activeKey = g.keys[0] || null;
      }
      saveState();
      updateViewMode();
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
        state.groups.push({ id, name: name.trim(), keys: [] });
        state.activeGroupId = id;
        saveState(); updateViewMode();
      }
    };
  }
}

// ── CONTEXT MENU & GROUPS ─────────────────────────────────────────────────────
function showGroupCtx(e, id) {
  e.preventDefault();
  ctxGroupId = id;
  const menu = document.getElementById('ctx-menu');
  menu.classList.add('show');
  let x = e.pageX;
  let y = e.pageY;
  if (x + menu.offsetWidth > window.innerWidth) x -= menu.offsetWidth;
  if (y + menu.offsetHeight > window.innerHeight) y -= menu.offsetHeight;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

function handleRenameGroup() {
  if (!ctxGroupId) return;
  if (ctxGroupId === 'inbox' || ctxGroupId === 'history') { toast('Cannot rename system list', 'error'); return; }
  const g = getGroup(ctxGroupId);
  const newName = prompt('Rename group:', g.name);
  if (newName && newName.trim()) { g.name = newName.trim(); saveState(); updateViewMode(); }
  ctxGroupId = null;
}

function handleDeleteGroup() {
  if (!ctxGroupId) return;
  if (ctxGroupId === 'inbox' || ctxGroupId === 'history') { toast('Cannot delete system list', 'error'); return; }
  if (confirm('Delete this group? Any active tickets in it will be dumped back to Inbox.')) {
    const g = getGroup(ctxGroupId);
    const inbox = getGroup('inbox');
    inbox.keys.push(...g.keys);
    state.groups = state.groups.filter(x => x.id !== ctxGroupId);
    if (state.activeGroupId === ctxGroupId) state.activeGroupId = 'inbox';
    saveState(); updateViewMode();
  }
  ctxGroupId = null;
}

document.getElementById('ctx-rename').addEventListener('click', handleRenameGroup);
document.getElementById('ctx-delete').addEventListener('click', handleDeleteGroup);
document.addEventListener('click', (e) => {
  if (!e.target.closest('#ctx-menu')) {
    document.getElementById('ctx-menu').classList.remove('show');
    ctxGroupId = null;
  }
});

document.getElementById('add-group-btn').addEventListener('click', () => {
  const name = prompt('New List Name:');
  if (name && name.trim()) {
    const id = 'g_' + Date.now();
    state.groups.push({ id, name: name.trim(), keys: [] });
    state.activeGroupId = id;
    saveState(); updateViewMode();
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
    list.innerHTML = '<div class="empty-msg">No tickets in this list.<br>Search a key to add one.</div>';
    return;
  }

  let html = '';
  for (const key of group.keys) {
    const active = state.activeKey === key ? ' active' : '';
    const issue = issueCache[key] || {};
    const f = issue.fields || {};
    let sum = f.summary || 'Loading...';
    let stat = f.status ? f.status.name : '';

    html += '<div class="list-card' + active + '" data-key="' + esc(key) + '" draggable="true" ' +
      'ondragstart="handleDragStart(event, \'' + esc(key) + '\')" ondragover="handleDragOver(event)" ondrop="handleDropToItem(event, \'' + esc(key) + '\')" ondragleave="handleDragLeave(event)">' +
      '<div class="lc-key-row">' +
      (stat ? '<span class="status-badge ' + statusClass(f.status?.statusCategory?.name || stat) + '">' + esc(stat) + '</span>' : '') +
      '</div>' +
      '<div class="lc-title-row">' +
      '<span class="lc-summary">' +
      '<span style="color:var(--accent);">' + esc(key) + '</span> ' + esc(sum) +
      '</span>' +
      '</div>' +
      '<button class="lc-delete" title="Remove from list (Kept in History)" onclick="event.stopPropagation(); removeTicket(\'' + esc(key) + '\')">✕</button>' +
      '</div>';
  }
  list.innerHTML = html;
  list.querySelectorAll('.list-card').forEach(el => {
    el.addEventListener('click', () => {
      state.activeKey = el.dataset.key;
      addToHistory(state.activeKey);
      saveState();
      updateViewMode();
    });
  });
}

function removeTicket(key) {
  const group = getActiveGroup();
  if (group.id !== 'history') group.keys = group.keys.filter(k => k !== key);
  if (state.activeKey === key) state.activeKey = null;
  saveState(); updateViewMode();
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
      } catch (e) { }
    }
  }
}

// ── RENDER RIGHT (READING) ────────────────────────────────────────────────────
function renderReading() {
  const empty = document.getElementById('reading-empty');
  const content = document.getElementById('reading-content');
  if (!empty || !content) return;
  if (!state.activeKey) {
    empty.style.display = 'block'; content.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  content.style.display = 'block';

  const key = state.activeKey;
  const issue = issueCache[key];
  if (!issue) {
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div>Loading ' + esc(key) + '...</div>';
    fetchIssue(key).then(data => {
      issueCache[key] = data;
      saveState();
      renderMiddle();
      if (state.activeKey === key) renderReading();
    }).catch(err => {
      content.innerHTML = '<div class="empty-msg" style="color:var(--red);">Error loading ' + esc(key) + ':<br>' + esc(err.message) + '</div>';
    });
    return;
  }

  const f = issue.fields;
  let selHtml = '<select class="rs-group-select" onchange="moveTicket(\'' + esc(key) + '\', this.value)">';
  for (const g of state.groups) {
    selHtml += '<option value="' + esc(g.id) + '" ' + (g.id === state.activeGroupId ? 'selected' : '') + '>' + esc(g.name) + '</option>';
  }
  selHtml += '</select>';

  let html = '<div class="rs-header">';
  html += '<div style="margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap;">';
  const myLbls = state.labels[key] || [];
  for (const L of myLbls) {
    const c = state.labelColors[L] || '#6e7681';
    const escapedL = esc(L).replace(/'/g, "\\'");
    html += '<span class="lbl-badge" style="background:' + c + ';' + (c === '#f0883e' || c === '#e3b341' ? 'color:#000;' : 'color:#fff;') + '">' +
      '<span onclick="viewByLabel(\'' + escapedL + '\')" style="cursor:pointer;" title="View all tickets with this label">' + esc(L) + '</span>' +
      ' <span class="x-btn" onclick="removeLabel(\'' + esc(key) + '\', \'' + escapedL + '\')">✕</span></span>';
  }
  html += '<button class="lbl-add" onclick="addLabel(\'' + esc(key) + '\')">+ Label</button></div>';

  html += '<div class="rs-title-row"><div class="rs-title"><a href="' + esc(cfg.baseUrl) + '/browse/' + esc(key) + '" target="_blank" style="color:var(--accent);text-decoration:none;">' + esc(key) + '</a> ' + esc(f.summary) + '</div></div>';
  html += '<div class="rs-actions">' + selHtml +
    '<button class="top-btn" onclick="toggleNotes()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg> Notes</button>' +
    '<button class="top-btn" onclick="forceRefreshReading()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.38-7.72"/></svg> Refresh</button></div></div>';

  html += '<div class="meta-grid">';
  const metas = [
    { l: 'Status', v: '<span class="status-badge ' + statusClass(f.status?.statusCategory?.name || f.status?.name) + '">' + esc(f.status?.name) + '</span>' },
    { l: 'Assignee', v: f.assignee ? avBadge(f.assignee.displayName, 'av-sm') + ' ' + esc(f.assignee.displayName) : 'Unassigned' },
    { l: 'Reporter', v: f.reporter ? avBadge(f.reporter.displayName, 'av-sm') + ' ' + esc(f.reporter.displayName) : '—' },
    { l: 'Type', v: f.issuetype?.name || '—' },
    { l: 'Created', v: relDate(f.created) },
    { l: 'Updated', v: relDate(f.updated) }
  ];
  for (const m of metas) html += '<div class="meta-item"><div class="meta-label">' + m.l + '</div><div class="meta-value">' + m.v + '</div></div>';
  html += '</div>';

  // ... (after meta-grid)
  if (f.parent) {
    let hierarchyHtml = '<div class="section-title">Hierarchy</div><div style="margin-bottom:12px;">';
    // Grandparent if available
    if (f.parent.fields?.parent) {
      const gp = f.parent.fields.parent;
      hierarchyHtml += '<div style="margin-bottom:4px;"><a href="' + esc(cfg.baseUrl) + '/browse/' + esc(gp.key) + '" target="_blank" class="rs-parent-link" style="opacity:0.7;font-size:12px;">↑ ' + esc(gp.key) + ' : ' + esc(gp.fields?.summary || '') + '</a></div>';
    }
    hierarchyHtml += '<div><a href="' + esc(cfg.baseUrl) + '/browse/' + esc(f.parent.key) + '" target="_blank" class="rs-parent-link">↑ ' + esc(f.parent.key) + ' : ' + esc(f.parent.fields?.summary) + '</a></div>';
    hierarchyHtml += '</div>';
    html += hierarchyHtml;
  }

  if (issue.renderedFields) {
    const HIDDEN_FIELDS = [
      'last viewed', 'updated', 'status category changed', 
      '[chart] date of first response', 'created', 'parent key', 
      'ticket score', 'service offering'
    ];
    
    if (issue.renderedFields.description) {
        // Aggressive strip of Smart Link icons and Jira-injected decorators
        let cleanDesc = issue.renderedFields.description;
        cleanDesc = cleanDesc.replace(/<img[^>]*lightbulb[^>]*>/gi, '');
        cleanDesc = cleanDesc.replace(/<img[^>]*favicon[^>]*>/gi, '');
        cleanDesc = cleanDesc.replace(/<span[^>]*ak-link-icon[^>]*>.*?<\/span>/gi, '');
        cleanDesc = cleanDesc.replace(/<img[^>]*info-modeler[^>]*>/gi, '');
        html += '<div class="section-title">Description</div><div class="description">' + cleanDesc + '</div>';
    }
    for (const [keyField, val] of Object.entries(issue.renderedFields)) {
      if (keyField === 'description' || keyField === 'comment' || !val || typeof val !== 'string') continue;
      const fName = customFieldMap[keyField] || (keyField.charAt(0).toUpperCase() + keyField.slice(1).replace(/_/g, ' '));
      const ln = fName.toLowerCase();
      if (ln.includes('time') || ln.includes('estimate') || ln.includes('worklog')) continue;
      if (ln.includes('incident')) continue;
      if (HIDDEN_FIELDS.includes(ln)) continue;
      html += '<div class="section-title">' + esc(fName) + '</div><div class="description">' + val + '</div>';
    }
  }

  if (f.issuelinks && f.issuelinks.length) {
    html += '<div class="section-title">Linked Issues</div><div class="links-grid">';
    for (const l of f.issuelinks) {
      const isOut = !!l.outwardIssue;
      const t = isOut ? l.outwardIssue : l.inwardIssue;
      const rel = isOut ? l.type.outward : l.type.inward;
      html += '<a href="' + esc(cfg.baseUrl) + '/browse/' + esc(t.key) + '" target="_blank" class="link-card">' +
        '<div><div class="link-type">' + esc(rel) + '</div>' +
        '<div class="link-key">' + esc(t.key) + '</div>' +
        '<div class="link-sum">' + esc(t.fields?.summary || '') + '</div></div></a>';
    }
    html += '</div>';
  }

  const comments = f.comment?.comments || [];
  const rc = issue.renderedFields?.comment?.comments || [];
  if (comments.length) {
    html += '<div class="section-title">Comments (' + comments.length + ')</div><div>';
    for (let i = 0; i < comments.length; i++) {
      const c = comments[i];
      html += '<div class="comment-item">' +
        '<div class="c-avatar">' + avBadge(c.author?.displayName, 'av-md') + '</div>' +
        '<div class="c-content">' +
        '<div class="c-header"><span class="c-author">' + esc(c.author?.displayName) + '</span><span class="c-date">' + relDate(c.created) + '</span></div>' +
        '<div class="c-body description">' + (rc[i] ? rc[i].body : '') + '</div></div></div>';
    }
    html += '</div>';
  }
  content.innerHTML = html;
  const notesTextEl = document.getElementById('notes-text');
  notesTextEl.value = state.notes[key] || '';
  bindPasteHandler(notesTextEl, 'ticket_' + key);
  bindAuthImages(content);
}

function toggleNotes() { document.getElementById('notes-pane').classList.toggle('open'); }
function saveNotes(val) { if (state.activeKey) { state.notes[state.activeKey] = val; saveState(); } }

// ── SCREENSHOT PASTE HANDLER ──────────────────────────────────────────────────
function handleImagePaste(e, textarea, contextKey) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = () => {
        const imgId = 'img_' + Date.now();
        screenshotStore[imgId] = reader.result;
        const marker = '\n![screenshot](' + imgId + ')\n';
        const pos = textarea.selectionStart;
        const before = textarea.value.substring(0, pos);
        const after = textarea.value.substring(textarea.selectionEnd);
        textarea.value = before + marker + after;
        textarea.selectionStart = textarea.selectionEnd = pos + marker.length;
        textarea.dispatchEvent(new Event('input'));
        saveState();
        toast('Screenshot pasted', 'success');
      };
      reader.readAsDataURL(file);
      break;
    }
  }
}

function bindPasteHandler(textarea, contextKey) {
  textarea.addEventListener('paste', (e) => handleImagePaste(e, textarea, contextKey));
}

window.moveTicket = function (key, newGroupId) {
  const oldG = getGroup(state.activeGroupId);
  oldG.keys = oldG.keys.filter(k => k !== key);
  const newG = getGroup(newGroupId);
  if (!newG.keys.includes(key)) newG.keys.unshift(key);
  if (state.activeKey === key && state.activeGroupId !== newGroupId) state.activeKey = null;
  saveState(); updateViewMode();
  toast('Moved to ' + newG.name, 'success');
};

window.forceRefreshReading = async function () {
  const key = state.activeKey;
  if (key) { delete issueCache[key]; renderReading(); }
};

function addLabel(key) {
  // Get all existing labels for suggestions
  const allLabels = Object.keys(state.labelColors);
  const currentLabels = state.labels[key] || [];
  const suggestions = allLabels.filter(l => !currentLabels.includes(l));
  
  // Show label picker modal
  showLabelPicker(key, suggestions);
}

function showLabelPicker(key, suggestions) {
  // Remove existing picker if any
  const existing = document.getElementById('label-picker');
  if (existing) existing.remove();
  
  let html = '<div id="label-picker" class="label-picker-overlay">' +
    '<div class="label-picker-box">' +
    '<div class="label-picker-header">Add Label<button class="modal-close" onclick="closeLabelPicker()">&times;</button></div>' +
    '<input type="text" id="label-picker-input" class="form-input" placeholder="Type a label name..." autocomplete="off" />';
  
  html += '<div class="label-picker-suggestions" id="label-picker-list">';
  for (const lbl of suggestions) {
    const c = state.labelColors[lbl] || '#6e7681';
    html += '<div class="label-picker-item" data-label="' + esc(lbl) + '">' +
      '<span class="lbl-badge" style="background:' + c + ';' + (c === '#f0883e' || c === '#e3b341' ? 'color:#000;' : 'color:#fff;') + '">' + esc(lbl) + '</span></div>';
  }
  if (!suggestions.length) {
    html += '<div style="padding:8px;color:var(--text-tertiary);font-size:12px;text-align:center;">No existing labels. Type to create one.</div>';
  }
  html += '</div></div></div>';
  
  document.body.insertAdjacentHTML('beforeend', html);
  
  const input = document.getElementById('label-picker-input');
  const listEl = document.getElementById('label-picker-list');
  
  input.focus();
  
  // Filter suggestions as you type
  input.addEventListener('input', () => {
    const val = input.value.trim().toLowerCase();
    listEl.querySelectorAll('.label-picker-item').forEach(item => {
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
  listEl.querySelectorAll('.label-picker-item').forEach(item => {
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
  if (!state.labelColors[tn]) state.labelColors[tn] = AV_COLORS[Object.keys(state.labelColors).length % AV_COLORS.length];
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
  if (state.labels[key]) { state.labels[key] = state.labels[key].filter(x => x !== lbl); saveState(); renderReading(); }
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
  let group = state.groups.find(g => g.id === groupId);
  if (!group) {
    group = { id: groupId, name: '🏷️ ' + label, keys: [] };
    state.groups.push(group);
  }
  group.keys = ticketKeys;
  state.activeGroupId = groupId;
  state.activeKey = ticketKeys[0] || null;
  state.appMode = 'jira';
  saveState();
  updateViewMode();
  toast(ticketKeys.length + ' ticket(s) with label "' + label + '"');
};

// ── DRAG AND DROP ─────────────────────────────────────────────────────────────
window.handleDragStart = (e, key) => { draggedKey = key; };
window.handleDragOver = e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); };
window.handleDragLeave = e => { e.currentTarget.classList.remove('drag-over'); };
window.handleDropToGroup = (e, gId) => {
  e.currentTarget.classList.remove('drag-over');
  if (draggedKey) {
    const oldG = state.groups.find(x => x.keys.includes(draggedKey));
    if (oldG && oldG.id !== gId) window.moveTicket(draggedKey, gId);
  }
};
window.handleDropToItem = (e, targetKey) => {
  e.currentTarget.classList.remove('drag-over');
  e.preventDefault(); e.stopPropagation();
  if (!draggedKey || draggedKey === targetKey) return;
  const g = getActiveGroup();
  const oldIdx = g.keys.indexOf(draggedKey), newIdx = g.keys.indexOf(targetKey);
  if (oldIdx !== -1 && newIdx !== -1) {
    g.keys.splice(oldIdx, 1); g.keys.splice(newIdx, 0, draggedKey);
    saveState(); renderMiddle();
  }
};

// ── IMAGE AUTH ENGINE ─────────────────────────────────────────────────────────
async function bindAuthImages(container) {
  container.querySelectorAll('img[src]').forEach(img => {
    let src = img.getAttribute('src');
    if (src && !src.startsWith('data:') && !src.startsWith('blob:') && (src.startsWith('/') || src.includes(cfg.baseUrl.split('//')[1]))) {
      img.dataset.authSrc = src.startsWith('/') ? cfg.baseUrl + src : src;
      img.removeAttribute('src'); 
    }
  });
  container.querySelectorAll('img[data-auth-src]').forEach(async img => {
    const blob = await fetchBlob(img.dataset.authSrc);
    if (blob) img.src = blob; else img.alt = 'Image unavailable';
    delete img.dataset.authSrc;
  });
}

function openTicketByKey(val) {
  if (!val) return;
  const key = normalise(val);
  addToHistory(key);
  let g = getActiveGroup();
  if (g.id === 'history') { state.activeGroupId = 'inbox'; g = getGroup('inbox'); }
  if (!g.keys.includes(key)) g.keys.unshift(key);
  state.activeKey = key; saveState(); updateViewMode();
}

window.addToHistory = function (key) {
  const h = getGroup('history');
  if (h) {
    h.keys = h.keys.filter(k => (typeof k === 'string' ? k !== key : k.key !== key));
    h.keys.unshift({ key, added: Date.now() });
    const limit = parseInt(cfg.historyLimit) || 100;
    if (h.keys.length > limit) h.keys = h.keys.slice(0, limit);
  }
};

window.openFromHistory = function (key) {
  let g = state.groups.find(x => x.id !== 'history' && x.keys.includes(key)) || getGroup('inbox');
  if (!g.keys.includes(key)) g.keys.unshift(key);
  state.activeGroupId = g.id; state.activeKey = key;
  addToHistory(key); saveState(); updateViewMode();
}

function renderHistoryTable() {
  const h = getGroup('history');
  let html = '<div class="middle-header" style="border-bottom: 1px solid var(--border-subtle);background:var(--card);flex-shrink:0;">History</div>';
  html += '<div id="history-table-container"><table class="ht-table" id="history-table">' +
    '<colgroup><col style="width: 40%;"><col style="width: 12%;"><col style="width: 12%;"><col style="width: 11%;"><col style="width: 10%;"><col style="width: 15%;"></colgroup>' +
    '<thead><tr>' +
    '<th>Work<div class="th-resizer"></div></th>' +
    '<th>Added<div class="th-resizer"></div></th>' +
    '<th>Assignee<div class="th-resizer"></div></th>' +
    '<th>Status<div class="th-resizer"></div></th>' +
    '<th>Parent<div class="th-resizer"></div></th>' +
    '<th>Created<div class="th-resizer"></div></th>' +
    '</tr></thead><tbody>';

  for (const entry of h.keys) {
    const key = typeof entry === 'string' ? entry : entry.key;
    const added = typeof entry === 'string' ? null : entry.added;
    const issue = issueCache[key] || {}, f = issue.fields || {};
    const typeIcon = f.issuetype?.iconUrl ? '<img src="' + esc(f.issuetype.iconUrl) + '" style="width:14px;height:14px;vertical-align:middle;margin-right:8px;border-radius:2px;">' : '';
    const workHtml = typeIcon + '<span style="color:var(--accent);font-weight:600;margin-right:6px;font-family:var(--mono);">' + esc(key) + '</span>' + esc(f.summary || 'Loading...');
    const addedHtml = added ? relDate(new Date(added)) : '—';
    const assgnHtml = f.assignee ? avBadge(f.assignee.displayName, 'av-sm') + ' <span style="font-size:12px;margin-left:4px;">' + esc(f.assignee.displayName) + '</span>' : '<span style="color:var(--text-tertiary)">Unassigned</span>';
    const statHtml = f.status ? '<span class="status-badge ' + statusClass(f.status.statusCategory?.name || f.status.name) + '">' + esc(f.status.name) + '</span>' : '';
    const pSum = f.parent?.fields?.summary ? f.parent.fields.summary.substring(0, 25) + (f.parent.fields.summary.length > 25 ? '...' : '') : '';
    const parentHtml = f.parent ? '<span class="lc-parent">↑ ' + esc(f.parent.key) + (pSum ? ' ' + esc(pSum) : '') + '</span>' : '';
    const createdHtml = f.created ? new Date(f.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

    html += '<tr onclick="openFromHistory(\'' + esc(key) + '\')">' +
      '<td class="td-limit">' + workHtml + '</td>' +
      '<td class="td-limit" style="color:var(--text-secondary);">' + addedHtml + '</td>' +
      '<td class="td-limit">' + assgnHtml + '</td>' +
      '<td class="td-limit">' + statHtml + '</td>' +
      '<td class="td-limit">' + parentHtml + '</td>' +
      '<td class="td-limit" style="color:var(--text-tertiary);">' + createdHtml + '</td>' +
      '</tr>';
  }
  html += '</tbody></table></div>';
  document.getElementById('history-pane').innerHTML = html;

  // Bind column resizers
  const table = document.getElementById('history-table');
  if (table) {
    table.querySelectorAll('th').forEach((th, i) => {
      const resizer = th.querySelector('.th-resizer');
      if (!resizer) return;
      resizer.addEventListener('mousedown', e => {
        e.preventDefault();
        const startX = e.pageX;
        const col = table.querySelector('colgroup').children[i];
        const startW = parseInt(window.getComputedStyle(th).width);

        const onMove = moveE => {
          const newW = startW + (moveE.pageX - startX);
          col.style.width = newW + 'px';
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  }

  for (const entry of h.keys) {
    const key = typeof entry === 'string' ? entry : entry.key;
    if (!issueCache[key] && isConfigured()) fetchIssue(key).then(d => { issueCache[key] = d; saveState(); renderHistoryTable(); }).catch(() => { });
  }
}

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
    updated: Date.now()
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
  state.standAloneNotes = state.standAloneNotes.filter(n => n.id !== noteId);
  if (state.activeNoteId === noteId) {
    state.activeNoteId = state.standAloneNotes.length ? state.standAloneNotes[0].id : null;
  }
  saveState();
  updateViewMode();
}

function getActiveNote() {
  return state.standAloneNotes.find(n => n.id === state.activeNoteId) || null;
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
    const preview = (note.body || '').replace(/\n/g, ' ').substring(0, 60);
    const dateStr = relDate(new Date(note.updated));
    
    html += '<div class="note-item' + active + '" data-note-id="' + esc(note.id) + '">' +
      '<span class="note-item-title">' + esc(title) + '</span>' +
      '<span class="note-item-preview">' + esc(preview || 'Empty note') + '</span>' +
      '<span class="note-item-date">' + dateStr + '</span>' +
      '<button class="note-delete-btn" data-delete-id="' + esc(note.id) + '" title="Delete Note">✕</button>' +
      '</div>';
  }
  
  if (!notes.length) {
    html = '<div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:12px;">No notes yet.<br>Click + to create one.</div>';
  }
  
  list.innerHTML = html;
  
  // Bind click events
  list.querySelectorAll('.note-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('note-delete-btn')) return;
      state.activeNoteId = el.dataset.noteId;
      saveState();
      updateViewMode();
    });
  });
  
  list.querySelectorAll('.note-delete-btn').forEach(btn => {
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
  const titleInput = document.getElementById('note-title-input');
  const textarea = document.getElementById('note-editor-textarea');
  const dateDisplay = document.getElementById('note-date-display');
  
  if (!pane) return;

  const note = getActiveNote();
  if (!note) {
    pane.innerHTML = '<div class="notes-empty-state">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="color:var(--text-tertiary);">' +
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
      '<polyline points="14 2 14 8 20 8"/></svg>' +
      '<h3>No note selected</h3>' +
      '<p>Select a note from the sidebar or create a new one.</p></div>';
    return;
  }

  // Restore the editor structure if it was replaced by empty state
  if (!titleInput) {
    pane.innerHTML = '<div class="notes-editor-header">' +
      '<input type="text" class="note-title-input" id="note-title-input" placeholder="Untitled Note" />' +
      '<span class="note-date" id="note-date-display"></span></div>' +
      '<textarea id="note-editor-textarea" placeholder="Start writing..."></textarea>';
  }
  
  const ti = document.getElementById('note-title-input');
  const ta = document.getElementById('note-editor-textarea');
  const dd = document.getElementById('note-date-display');
  
  if (ti) {
    ti.value = note.title;
    ti.oninput = () => {
      note.title = ti.value;
      note.updated = Date.now();
      saveState();
      // Update sidebar title without full re-render
      const sidebarItem = document.querySelector('.note-item[data-note-id="' + note.id + '"] .note-item-title');
      if (sidebarItem) sidebarItem.textContent = note.title || 'Untitled Note';
    };
  }
  if (ta) {
    ta.value = note.body;
    ta.oninput = () => {
      note.body = ta.value;
      note.updated = Date.now();
      saveState();
    };
    bindPasteHandler(ta, 'note_' + note.id);
  }
  if (dd) {
    dd.textContent = new Date(note.updated).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  }
}

function init() {
  loadConfig();
  if (!isConfigured()) document.getElementById('settings-overlay').classList.remove('hidden');
  loadState();
  initResizing();
  updateViewMode();
  if (isConfigured()) { fetchCustomFields(); loadAllGroupTickets(); }

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('search-form').addEventListener('submit', e => {
    e.preventDefault(); const val = document.getElementById('search-input').value.trim();
    openTicketByKey(val); document.getElementById('search-input').value = '';
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'F2') {
      e.preventDefault(); const modal = document.getElementById('f2-modal');
      modal.classList.remove('hidden'); setTimeout(() => document.getElementById('f2-input').focus(), 50);
    } else if (e.key === 'Escape') document.getElementById('f2-modal').classList.add('hidden');
  });

  document.getElementById('f2-form').addEventListener('submit', e => {
    e.preventDefault(); openTicketByKey(document.getElementById('f2-input').value.trim());
    document.getElementById('f2-modal').classList.add('hidden'); document.getElementById('f2-input').value = '';
  });

  document.getElementById('refresh-all-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.style.pointerEvents = 'none'; btn.style.opacity = '0.5';
    const g = getActiveGroup(); for (const k of g.keys) delete issueCache[k];
    await loadAllGroupTickets(); btn.style.pointerEvents = ''; btn.style.opacity = '1'; toast('List refreshed');
  });

  document.getElementById('history-toggle-btn').addEventListener('click', () => {
    state.activeGroupId = (state.activeGroupId === 'history') ? 'inbox' : 'history';
    saveState(); updateViewMode();
  });

  document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('cfg-url').value = cfg.baseUrl;
    document.getElementById('cfg-email').value = cfg.email;
    document.getElementById('cfg-token').value = cfg.token;
    document.getElementById('cfg-project').value = cfg.defaultProject;
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
    cfg.defaultProject = document.getElementById('cfg-project').value.trim().toUpperCase() || DEFAULTS.defaultProject;
    cfg.historyLimit = parseInt(document.getElementById('cfg-hist-limit').value) || 100;
    cfg.proxyUrl = (document.getElementById('cfg-proxy-url').value || '').trim().replace(/\/$/, '');
    saveConfig(); closeCfg(); toast('Settings saved');
    if (getActiveGroup().keys.length) loadAllGroupTickets();
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.error('ServiceWorker setup failed: ', err));
  });
}

init();
