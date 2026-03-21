'use strict';

// ── APP STATE ─────────────────────────────────────────────────────────────────
let state = {
  groups: [{ id: 'inbox', name: 'Inbox', keys: [] }],
  activeGroupId: 'inbox',
  activeKey: null,
  notes: {}, // key -> string
  labels: {}, // key -> [string]
  labelColors: {} // label text -> color
};

let draggedKey = null; // for drag & drop
let ctxGroupId = null; // group ID actively being right-clicked

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
    // Ensure history exists instead of recycle
    let rec = state.groups.find(g => g.id === 'recycle');
    if (rec) { rec.id = 'history'; rec.name = 'History'; }
    if (!state.groups.find(g => g.id === 'history')) {
      state.groups.push({ id: 'history', name: 'History', keys: [] });
    }
    if (!state.notes) state.notes = {};
    if (!state.labels) state.labels = {};
    if (!state.labelColors) state.labelColors = {};
  } catch {}
}
function saveState() {
  localStorage.setItem('jira_state', JSON.stringify(state));
}
function getGroup(id) { return state.groups.find(g => g.id === id) || state.groups[0]; }
function getActiveGroup() { return getGroup(state.activeGroupId); }

function updateViewMode() {
  const isHist = state.activeGroupId === 'history';
  document.body.setAttribute('data-active-view', isHist ? 'history' : 'normal');
  renderSidebar();
  if (isHist) renderHistoryTable();
  else { 
    renderMiddle(); 
    renderReading(); 
    loadAllGroupTickets();
  }
}

// ── RENDER SIDEBAR ────────────────────────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('group-list');
  if (!list) return;
  let html = '';
  for (const g of state.groups) {
    const activeObj = state.activeGroupId === g.id ? ' active' : '';
    html += '<div class="group-item' + activeObj + '" data-id="' + esc(g.id) + '" ' +
      'ondragover="handleDragOver(event)" ondrop="handleDropToGroup(event, \'' + esc(g.id) + '\')" ondragleave="handleDragLeave(event)" ' +
      'oncontextmenu="showGroupCtx(event, \'' + esc(g.id) + '\')">' +
      '<span class="g-name">' + esc(g.name) + '</span>' +
      '<span class="count" ' + (g.id === 'history' ? 'style="display:none;"' : '') + '>' + g.keys.length + '</span>' +
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
    let parent = f.parent ? f.parent.key : '';
    
    html += '<div class="list-card' + active + '" data-key="' + esc(key) + '" draggable="true" ' +
      'ondragstart="handleDragStart(event, \'' + esc(key) + '\')" ondragover="handleDragOver(event)" ondrop="handleDropToItem(event, \'' + esc(key) + '\')" ondragleave="handleDragLeave(event)">' +
      '<div class="lc-key-row">' +
        (stat ? '<span class="status-badge ' + statusClass(f.status?.statusCategory?.name || stat) + '">' + esc(stat) + '</span>' : '') +
      '</div>' +
      '<div class="lc-title-row">' +
        '<span class="lc-summary">' +
          (parent ? '<span class="lc-parent">↑ ' + esc(parent) + '</span> ' : '') +
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
        renderMiddle();
        if (state.activeKey === key) renderReading();
      } catch(e) {}
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
  if (f.parent) {
    html += '<a href="' + esc(cfg.baseUrl) + '/browse/' + esc(f.parent.key) + '" target="_blank" class="rs-parent-link">↑ ' + esc(f.parent.key) + ' : ' + esc(f.parent.fields?.summary) + '</a>';
  }
  
  html += '<div style="margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap;">';
  const myLbls = state.labels[key] || [];
  for (const L of myLbls) {
    const c = state.labelColors[L] || '#6e7681';
    html += '<span class="lbl-badge" style="background:' + c + ';' + (c==='#f0883e'||c==='#e3b341'?'color:#000;':'color:#fff;') + '">' + esc(L) +
            ' <span class="x-btn" onclick="removeLabel(\'' + esc(key) + '\', \'' + esc(L) + '\')">✕</span></span>';
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
    { l: 'Priority', v: f.priority?.name || '—' },
    { l: 'Type', v: f.issuetype?.name || '—' },
    { l: 'Created', v: relDate(f.created) }
  ];
  for (const m of metas) html += '<div class="meta-item"><div class="meta-label">' + m.l + '</div><div class="meta-value">' + m.v + '</div></div>';
  html += '</div>';

  if (issue.renderedFields) {
    if (issue.renderedFields.description) html += '<div class="section-title">Description</div><div class="description">' + issue.renderedFields.description + '</div>';
    for (const [keyField, val] of Object.entries(issue.renderedFields)) {
      if (keyField === 'description' || keyField === 'comment' || !val || typeof val !== 'string') continue;
      const fName = customFieldMap[keyField] || (keyField.charAt(0).toUpperCase() + keyField.slice(1).replace(/_/g, ' '));
      const ln = fName.toLowerCase();
      if (ln.includes('time') || ln.includes('estimate') || ln.includes('worklog')) continue;
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
  document.getElementById('notes-text').value = state.notes[key] || '';
  bindAuthImages(content);
}

function toggleNotes() { document.getElementById('notes-pane').classList.toggle('open'); }
function saveNotes(val) { if (state.activeKey) { state.notes[state.activeKey] = val; saveState(); } }

window.moveTicket = function(key, newGroupId) {
  const oldG = getGroup(state.activeGroupId);
  oldG.keys = oldG.keys.filter(k => k !== key);
  const newG = getGroup(newGroupId);
  if (!newG.keys.includes(key)) newG.keys.unshift(key);
  if (state.activeKey === key && state.activeGroupId !== newGroupId) state.activeKey = null; 
  saveState(); updateViewMode();
  toast('Moved to ' + newG.name, 'success');
};

window.forceRefreshReading = async function() {
  const key = state.activeKey;
  if (key) { delete issueCache[key]; renderReading(); }
};

function addLabel(key) {
  const name = prompt('Enter a label:');
  if (!name || !name.trim()) return;
  const tn = name.trim();
  if (!state.labelColors[tn]) state.labelColors[tn] = AV_COLORS[Object.keys(state.labelColors).length % AV_COLORS.length];
  if (!state.labels[key]) state.labels[key] = [];
  if (!state.labels[key].includes(tn)) { state.labels[key].push(tn); saveState(); renderReading(); }
}

function removeLabel(key, lbl) {
  if (state.labels[key]) { state.labels[key] = state.labels[key].filter(x => x !== lbl); saveState(); renderReading(); }
}

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
      if (src.startsWith('/')) src = cfg.baseUrl + src;
      img.removeAttribute('src'); img.dataset.authSrc = proxyUrl(src);
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

window.addToHistory = function(key) {
  const h = getGroup('history');
  if (h) {
    h.keys = h.keys.filter(k => k !== key);
    h.keys.unshift(key);
    if (h.keys.length > 200) h.keys.pop();
  }
};

window.openFromHistory = function(key) {
  let g = state.groups.find(x => x.id !== 'history' && x.keys.includes(key)) || getGroup('inbox');
  if (!g.keys.includes(key)) g.keys.unshift(key);
  state.activeGroupId = g.id; state.activeKey = key;
  addToHistory(key); saveState(); updateViewMode();
};

function renderHistoryTable() {
  const h = getGroup('history');
  let html = '<div class="middle-header" style="border-bottom: 1px solid var(--border-subtle);background:var(--card);flex-shrink:0;">History</div>';
  html += '<div id="history-table-container"><table class="ht-table"><colgroup><col style="width: 240px;"><col style="width: 150px;"><col style="width: 180px;"><col style="width: 120px;"><col style="width: 160px;"><col style="width: auto;"></colgroup><thead><tr><th>Work</th><th>Created</th><th>Assignee</th><th>Status</th><th>Parent</th><th>Description</th></tr></thead><tbody>';
  for (const key of h.keys) {
    const issue = issueCache[key] || {}, f = issue.fields || {};
    const typeIcon = f.issuetype?.iconUrl ? '<img src="'+esc(f.issuetype.iconUrl)+'" style="width:14px;height:14px;vertical-align:middle;margin-right:8px;border-radius:2px;">' : '';
    const workHtml = typeIcon + '<span style="color:var(--accent);font-weight:600;margin-right:6px;font-family:var(--mono);">' + esc(key) + '</span>' + esc(f.summary || 'Loading...');
    const createdHtml = f.created ? new Date(f.created).toLocaleString(undefined, {dateStyle:'medium', timeStyle:'short'}) : '';
    const assgnHtml = f.assignee ? avBadge(f.assignee.displayName, 'av-sm') + ' <span style="font-size:12px;margin-left:4px;">' + esc(f.assignee.displayName) + '</span>' : '<span style="color:var(--text-tertiary)">Unassigned</span>';
    const statHtml = f.status ? '<span class="status-badge ' + statusClass(f.status.statusCategory?.name || f.status.name) + '">' + esc(f.status.name) + '</span>' : '';
    const pSum = f.parent?.fields?.summary ? f.parent.fields.summary.substring(0,25) + (f.parent.fields.summary.length>25?'...':'') : '';
    const parentHtml = f.parent ? '<span class="lc-parent">↑ ' + esc(f.parent.key) + (pSum ? ' ' + esc(pSum) : '') + '</span>' : '';
    let descTxt = ''; if (issue.renderedFields?.description) descTxt = stripHtml(issue.renderedFields.description).replace(/\s+/g, ' ').trim().substring(0, 100);
    html += '<tr onclick="openFromHistory(\''+esc(key)+'\')"><td class="td-limit">' + workHtml + '</td><td class="td-limit" style="color:var(--text-secondary);">' + createdHtml + '</td><td class="td-limit">' + assgnHtml + '</td><td class="td-limit">' + statHtml + '</td><td class="td-limit">' + parentHtml + '</td><td class="td-limit" style="color:var(--text-tertiary);">' + esc(descTxt) + '</td></tr>';
  }
  html += '</tbody></table></div>';
  document.getElementById('history-pane').innerHTML = html;
  for (const key of h.keys) if (!issueCache[key] && isConfigured()) fetchIssue(key).then(d => { issueCache[key] = d; renderHistoryTable(); }).catch(()=>{});
}

function init() {
  loadConfig();
  if (!isConfigured()) document.getElementById('settings-overlay').classList.remove('hidden');
  loadState(); updateViewMode();
  if (isConfigured()) { fetchCustomFields(); loadAllGroupTickets(); }

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

  document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('cfg-url').value = cfg.baseUrl;
    document.getElementById('cfg-email').value = cfg.email;
    document.getElementById('cfg-token').value = cfg.token;
    document.getElementById('cfg-project').value = cfg.defaultProject;
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
