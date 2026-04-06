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

  const assignInput = document.getElementById('bulk-assign-input');
  if (assignInput) assignInput.disabled = count === 0;

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
        const key = entryKey(entry);
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

  // ── Fast path: if only activeKey/selection changed, skip full rebuild ────────
  // Each card carries data-cached="false" when rendered without field data. If any
  // such card now has data in issueCache, the fast path must be skipped so the
  // "Loading..." placeholder gets replaced with real content.
  const existingCards = list.querySelectorAll('.list-card');
  const currentKeyList = visibleKeys.map(entryKey);
  const existingKeyList = Array.from(existingCards, (el) => el.dataset.key);
  const anyStaleCard = Array.from(existingCards).some(
    (el) => el.dataset.cached === 'false' && issueCache[el.dataset.key]?.fields
  );
  if (
    !anyStaleCard &&
    currentKeyList.length === existingKeyList.length &&
    currentKeyList.every((k, i) => k === existingKeyList[i])
  ) {
    existingCards.forEach((el) => {
      const k = el.dataset.key;
      el.classList.toggle('active', k === state.activeKey);
      el.classList.toggle('selected', bulkSelectMode && selectedKeys.has(k));
    });
    return;
  }

  let html = '';
  for (const entry of visibleKeys) {
    const key = entryKey(entry);
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
      '" data-cached="' +
      (f.summary ? 'true' : 'false') +
      '" draggable="true">' +
      (stat
        ? '<div class="lc-key-row">' +
          '<span class="status-badge ' +
          statusClass(f.status?.statusCategory?.name || stat) +
          '">' +
          esc(stat) +
          '</span>' +
          '</div>'
        : '') +
      '<div class="lc-title-row">' +
      (f.assignee ? avBadge(f.assignee.displayName, 'av-rg') : '') +
      '<span class="lc-summary">' +
      '<span style="color:var(--accent);">' +
      esc(key) +
      '</span> ' +
      esc(sum) +
      '</span>' +
      '</div>' +
      (addedDate ? '<div class="lc-added">viewed ' + addedDate + '</div>' : '') +
      '<a class="lc-jira-link" href="' +
      esc(cfg.baseUrl) +
      '/browse/' +
      esc(key) +
      '" target="_blank" rel="noopener noreferrer" title="Open in Jira" onclick="event.stopPropagation()">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
      '</a>' +
      '<button class="lc-delete" title="Remove from list">✕</button>' +
      '</div>';
  }
  list.innerHTML = html;
  list.querySelectorAll('.list-card').forEach((el) => {
    const k = el.dataset.key;

    el.addEventListener('click', () => {
      if (bulkSelectMode) {
        if (selectedKeys.has(k)) selectedKeys.delete(k);
        else selectedKeys.add(k);
        el.classList.toggle('selected', selectedKeys.has(k));
        updateBulkToolbar();
        return;
      }
      if (group.id === 'history') {
        openFromHistory(k);
      } else {
        state.activeKey = k;
        saveState();
        updateViewMode();
      }
    });

    el.querySelector('.lc-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      removeTicket(k);
    });

    el.addEventListener('dragstart', (e) => handleDragStart(e, k));
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('drop', (e) => handleDropToItem(e, k));
    el.addEventListener('dragleave', handleDragLeave);
  });
}

function removeTicket(key) {
  const group = getActiveGroup();
  if (group.id === 'history') {
    group.keys = group.keys.filter((k) => entryKey(k) !== key);
  } else {
    group.keys = group.keys.filter((k) => k !== key);
  }
  if (state.activeKey === key) state.activeKey = null;
  saveState();
  updateViewMode();
}
