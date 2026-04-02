'use strict';

// ── RENDER SIDEBAR ────────────────────────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('group-list');
  if (!list) return;
  let html = '';

  for (const g of state.groups) {
    if (g.id === 'history') continue; // history is now its own tab
    const isActive = state.activeGroupId === g.id;
    const activeClass = isActive ? ' active' : '';

    const dragHandle =
      '<span class="g-drag-handle" draggable="true" title="Drag to reorder">' +
      '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">' +
      '<circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/>' +
      '<circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>' +
      '<circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/>' +
      '</svg></span>';

    const icon = g.isFilter
      ? '<span class="g-filter-badge" title="Filter group">' +
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
        '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg></span>'
      : avBadge(g.name, 'av-sm');

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

    // order: drag-handle | icon | name [flex] | actions | count
    html +=
      '<div class="group-item' +
      activeClass +
      '" data-id="' +
      esc(g.id) +
      '">' +
      dragHandle +
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
    const gId = el.dataset.id;

    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('dragleave', handleDragLeave);
    el.addEventListener('drop', (e) => handleDropToGroup(e, gId));

    const handle = el.querySelector('.g-drag-handle');
    if (handle) handle.addEventListener('dragstart', (e) => handleGroupDragStart(e, gId));

    el.addEventListener('click', (e) => {
      if (e.target.closest('.g-action-btn') || e.target.closest('.g-drag-handle')) return;
      // Clear middle-pane search and bulk mode when switching groups
      groupSearchQuery = '';
      const gsi = document.getElementById('group-search-input');
      if (gsi) gsi.value = '';
      if (bulkSelectMode) exitBulkMode();
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
    addBtn.onclick = () => startInlineGroupCreate();
  }
  const dupBtn = document.getElementById('find-duplicates-btn');
  if (dupBtn) {
    dupBtn.onclick = () => findDuplicates();
  }
}

function startInlineGroupCreate() {
  const list = document.getElementById('group-list');
  if (!list) return;
  // Don't stack multiple inputs
  if (list.querySelector('.group-item-new')) return;

  const row = document.createElement('div');
  row.className = 'group-item-new';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'g-name-input';
  input.placeholder = 'List name…';
  row.appendChild(input);
  list.appendChild(row);
  input.focus();

  let done = false;

  function commit() {
    if (done) return;
    done = true;
    const name = input.value.trim();
    row.remove();
    if (name) {
      const id = 'g_' + Date.now();
      insertGroupBeforeHistory({ id, name, keys: [] });
      state.activeGroupId = id;
      saveState();
    }
    updateViewMode();
  }

  function cancel() {
    if (done) return;
    done = true;
    row.remove();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      cancel();
    }
  });
  input.addEventListener('blur', commit);
}

function renameGroup(id) {
  const item = document.querySelector('.group-item[data-id="' + id + '"]');
  if (!item) return;
  const nameSpan = item.querySelector('.g-name');
  if (!nameSpan) return;

  const current = nameSpan.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'g-name-input';
  input.value = current;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  let done = false;

  function commit() {
    if (done) return;
    done = true;
    const trimmed = input.value.trim();
    if (trimmed && trimmed !== current) {
      getGroup(id).name = trimmed;
      saveState();
    }
    updateViewMode();
  }

  function cancel() {
    if (done) return;
    done = true;
    updateViewMode(); // restore sidebar without saving
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      cancel();
    }
  });
  input.addEventListener('blur', commit);
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

// ── FIND DUPLICATES ───────────────────────────────────────────────────────────
function findDuplicates() {
  // Count how many non-history groups each key appears in
  const keyCounts = new Map(); // key -> count
  for (const g of state.groups) {
    if (g.id === 'history') continue;
    for (const k of g.keys) {
      const key = entryKey(k);
      keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
    }
  }

  const duplicates = Array.from(keyCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key);

  if (!duplicates.length) {
    toast('No duplicate tickets found across lists', 'info');
    return;
  }

  const id = 'g_dupes_' + Date.now();
  insertGroupBeforeHistory({ id, name: 'Duplicates', keys: duplicates });
  state.activeGroupId = id;
  state.activeKey = duplicates[0];
  saveState();
  updateViewMode();
  toast(
    'Found ' + duplicates.length + ' duplicate' + (duplicates.length === 1 ? '' : 's'),
    'success'
  );
  if (isConfigured()) loadAllGroupTickets();
}

// ── GROUPS ────────────────────────────────────────────────────────────────────
function insertGroupBeforeHistory(group) {
  const histIdx = state.groups.findIndex((g) => g.id === 'history');
  if (histIdx !== -1) state.groups.splice(histIdx, 0, group);
  else state.groups.push(group);
}
