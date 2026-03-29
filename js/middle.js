'use strict';

// ── BULK SELECT ───────────────────────────────────────────────────────────────
function enterBulkMode() {
  bulkSelectMode = true;
  selectedKeys.clear();
  document.getElementById('middle').classList.add('bulk-mode');
  document.getElementById('bulk-select-btn').classList.add('active');
  document.getElementById('bulk-toolbar').classList.add('visible');
  updateBulkToolbar();
  renderMiddle();
}

function exitBulkMode() {
  bulkSelectMode = false;
  selectedKeys.clear();
  document.getElementById('middle').classList.remove('bulk-mode');
  document.getElementById('bulk-select-btn').classList.remove('active');
  document.getElementById('bulk-toolbar').classList.remove('visible');
  renderMiddle();
}

function updateBulkToolbar() {
  const count = selectedKeys.size;
  document.getElementById('bulk-count').textContent =
    count === 0 ? 'Select tickets' : count + ' selected';

  const deleteBtn = document.getElementById('bulk-delete-btn');
  deleteBtn.disabled = count === 0;
  deleteBtn.textContent = count > 0 ? 'Delete (' + count + ')' : 'Delete';

  const moveSelect = document.getElementById('bulk-move-select');
  const currentGroup = getActiveGroup();
  const targets = state.groups.filter((g) => g.id !== currentGroup.id && g.id !== 'history');
  moveSelect.innerHTML = '<option value="">Move to\u2026</option>';
  for (const g of targets) {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    moveSelect.appendChild(opt);
  }
  moveSelect.disabled = count === 0 || targets.length === 0;
}

// ── RENDER MIDDLE ─────────────────────────────────────────────────────────────
function renderMiddle() {
  const group = getActiveGroup();
  const nameEl = document.getElementById('current-group-name');
  if (nameEl) nameEl.textContent = group.name;

  const list = document.getElementById('ticket-list');
  if (!list) return;

  const q = groupSearchQuery.toLowerCase().trim();
  const visibleKeys = q
    ? group.keys.filter((entry) => {
        const key = typeof entry === 'string' ? entry : entry.key;
        if (key.toLowerCase().includes(q)) return true;
        const summary = issueCache[key]?.fields?.summary || '';
        return summary.toLowerCase().includes(q);
      })
    : group.keys;

  if (!visibleKeys.length) {
    list.innerHTML = q
      ? '<div class="empty-msg">No tickets match "<strong>' + esc(q) + '</strong>".</div>'
      : group.isFilter
        ? '<div class="empty-msg">Filter returned no results.<br><span style="font-size:11px;color:var(--text-tertiary);">' +
          esc(group.query || '') +
          '</span></div>'
        : '<div class="empty-msg">No tickets in this list.<br>Search a key to add one.</div>';
    return;
  }

  let html = '';
  for (const entry of visibleKeys) {
    const key = typeof entry === 'string' ? entry : entry.key;
    const addedDate = typeof entry === 'object' && entry.added ? relDate(entry.added) : null;
    const active = state.activeKey === key ? ' active' : '';
    const selected = bulkSelectMode && selectedKeys.has(key) ? ' selected' : '';
    const issue = issueCache[key] || {};
    const f = issue.fields || {};
    let sum = f.summary || 'Loading...';
    let stat = f.status ? f.status.name : '';

    html +=
      '<div class="list-card' +
      active +
      selected +
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
      if (bulkSelectMode) {
        const k = el.dataset.key;
        if (selectedKeys.has(k)) selectedKeys.delete(k);
        else selectedKeys.add(k);
        el.classList.toggle('selected', selectedKeys.has(k));
        updateBulkToolbar();
        return;
      }
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
