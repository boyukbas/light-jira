'use strict';

// ── INIT ──────────────────────────────────────────────────────────────────────
async function init() {
  loadConfig();
  if (!isConfigured()) openCfg();
  await loadState();
  initResizing();
  initMindMap();
  updateViewMode();
  if (isConfigured()) {
    fetchCustomFields();
    loadAllGroupTickets();
  }

  // ── Tab switching ─────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ── Smart search bar ──────────────────────────────────────────────────────
  const searchInput = document.getElementById('search-input');

  // Classify the search bar value to decide whether to open a ticket or load a filter.
  // Returns 'filter' for JQL / filter IDs / filter URLs, 'open' for ticket keys.
  function classifySearchInput(val) {
    const t = val.trim();
    if (!t) return 'open';
    if (/^\d+$/.test(t)) return 'filter'; // numeric filter ID
    if (t.startsWith('http')) {
      try {
        const u = new URL(t);
        if (u.searchParams.get('filter') || u.searchParams.get('jql')) return 'filter';
        if (/\/jira\/plans\/\d+/.test(u.pathname)) return 'filter';
      } catch {}
      return 'open'; // browse URL → single ticket
    }
    if (/^[A-Z][A-Z0-9]+-\d+$/.test(t.toUpperCase())) return 'open';
    return 'filter'; // everything else is JQL
  }

  let filterLoading = false;
  document.getElementById('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (filterLoading) return;
    const val = searchInput.value.trim();
    if (!val) return;

    if (classifySearchInput(val) === 'filter') {
      filterLoading = true;
      try {
        await runFilterLoad(val);
        searchInput.value = '';
      } catch (err) {
        toast('Error loading filter: ' + err.message, 'error');
      } finally {
        filterLoading = false;
      }
    } else {
      openTicketByKey(val);
      searchInput.value = '';
    }
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    // F2 → focus search bar from anywhere
    if (e.key === 'F2') {
      e.preventDefault();
      const si = document.getElementById('search-input');
      if (si) {
        si.focus();
        si.select();
      }
      return;
    }

    // Arrow keys → navigate ticket list (skip when an input/textarea is focused)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const tag = document.activeElement?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        document.activeElement?.contentEditable === 'true'
      )
        return;
      if (state.appMode !== 'jira') return;
      e.preventDefault();
      const group = getActiveGroup();
      const keys = group.keys.map(entryKey);
      if (!keys.length) return;
      const idx = state.activeKey ? keys.indexOf(state.activeKey) : -1;
      const newIdx =
        e.key === 'ArrowDown' ? Math.min(idx + 1, keys.length - 1) : Math.max(idx - 1, 0);
      if (newIdx !== idx && newIdx >= 0) {
        state.activeKey = keys[newIdx];
        saveState();
        updateViewMode();
        setTimeout(
          () => document.querySelector('.list-card.active')?.scrollIntoView({ block: 'nearest' }),
          0
        );
      }
    }
  });

  // ── Group search ──────────────────────────────────────────────────────────
  const groupSearchInput = document.getElementById('group-search-input');
  if (groupSearchInput) {
    groupSearchInput.addEventListener('input', () => {
      groupSearchQuery = groupSearchInput.value;
      renderMiddle();
    });
  }

  // ── Refresh button ────────────────────────────────────────────────────────
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

  // ── Bulk select ───────────────────────────────────────────────────────────
  document.getElementById('bulk-select-btn').addEventListener('click', () => {
    if (bulkSelectMode) exitBulkMode();
    else enterBulkMode();
  });
  document.getElementById('bulk-done-btn').addEventListener('click', exitBulkMode);

  document.getElementById('bulk-delete-btn').addEventListener('click', () => {
    if (!selectedKeys.size) return;
    const group = getActiveGroup();
    const count = selectedKeys.size;
    group.keys = group.keys.filter((k) => !selectedKeys.has(entryKey(k)));
    if (selectedKeys.has(state.activeKey)) state.activeKey = null;
    selectedKeys.clear();
    saveState();
    toast(count + ' ticket' + (count === 1 ? '' : 's') + ' removed');
    exitBulkMode();
    updateViewMode();
  });

  document.getElementById('bulk-move-select').addEventListener('change', (e) => {
    const targetId = e.target.value;
    if (!targetId || !selectedKeys.size) return;
    const sourceGroup = getActiveGroup();
    const targetGroup = getGroup(targetId);
    if (!targetGroup) return;
    const count = selectedKeys.size;
    for (const key of selectedKeys) {
      if (!targetGroup.keys.includes(key)) targetGroup.keys.push(key);
      sourceGroup.keys = sourceGroup.keys.filter((k) => entryKey(k) !== key);
    }
    if (selectedKeys.has(state.activeKey)) state.activeKey = null;
    selectedKeys.clear();
    e.target.value = '';
    saveState();
    toast(count + ' ticket' + (count === 1 ? '' : 's') + ' moved to ' + targetGroup.name);
    exitBulkMode();
    updateViewMode();
  });

  // ── Bulk assign ───────────────────────────────────────────────────────────
  let bulkAssignTimer = null;
  const bulkAssignInput = document.getElementById('bulk-assign-input');
  const bulkAssignResults = document.getElementById('bulk-assign-results');

  bulkAssignInput.addEventListener('input', () => {
    clearTimeout(bulkAssignTimer);
    const q = bulkAssignInput.value.trim();
    if (!q) {
      bulkAssignResults.innerHTML = '';
      bulkAssignResults.classList.remove('open');
      return;
    }
    bulkAssignTimer = setTimeout(async () => {
      const users = await searchUsers(q);
      bulkAssignResults.innerHTML = '';
      if (!users.length) {
        bulkAssignResults.classList.remove('open');
        return;
      }
      for (const u of users) {
        const li = document.createElement('li');
        li.className = 'bulk-assign-result';
        li.textContent = u.displayName;
        li.addEventListener('mousedown', async (e) => {
          e.preventDefault(); // prevent input blur before click registers
          bulkAssignResults.classList.remove('open');
          bulkAssignInput.value = '';
          const keys = Array.from(selectedKeys);
          const count = keys.length;
          try {
            await Promise.all(
              keys.map((k) => updateIssueFields(k, { assignee: { accountId: u.accountId } }))
            );
            // Invalidate cache so assignee badge refreshes on next open
            for (const k of keys) {
              if (issueCache[k]?.fields)
                issueCache[k].fields.assignee = {
                  displayName: u.displayName,
                  accountId: u.accountId,
                };
            }
            saveState();
            toast(count + ' ticket' + (count === 1 ? '' : 's') + ' assigned to ' + u.displayName);
          } catch (err) {
            toast('Assign failed: ' + err.message, 'error');
          }
        });
        bulkAssignResults.appendChild(li);
      }
      bulkAssignResults.classList.add('open');
    }, 250);
  });

  bulkAssignInput.addEventListener('blur', () => {
    setTimeout(() => {
      bulkAssignResults.classList.remove('open');
    }, 150);
  });

  // ── Pane collapse / notes pane ────────────────────────────────────────────
  document
    .getElementById('sidebar-collapse-btn')
    .addEventListener('click', () => toggleCollapse('sidebar'));
  document
    .getElementById('middle-collapse-btn')
    .addEventListener('click', () => toggleCollapse('middle'));
  document.getElementById('notes-pane-close').addEventListener('click', toggleNotes);

  const notesText = document.getElementById('notes-text');
  if (notesText) notesText.addEventListener('input', () => saveNotes(notesText.value));

  // ── Settings modal ────────────────────────────────────────────────────────
  initSettings();
}

init().catch(console.error);
