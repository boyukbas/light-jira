'use strict';

// ── INIT ──────────────────────────────────────────────────────────────────────
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
      searchBtn.textContent = 'Loading\u2026';
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
      const si = document.getElementById('search-input');
      if (si) {
        si.focus();
        si.select();
      }
      return;
    }

    // Arrow-key navigation in the ticket list (skip when an input is focused)
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
      const keys = group.keys.map((k) => (typeof k === 'string' ? k : k.key));
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

  const groupSearchInput = document.getElementById('group-search-input');
  if (groupSearchInput) {
    groupSearchInput.addEventListener('input', () => {
      groupSearchQuery = groupSearchInput.value;
      renderMiddle();
    });
  }

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

  document.getElementById('bulk-select-btn').addEventListener('click', () => {
    if (bulkSelectMode) exitBulkMode();
    else enterBulkMode();
  });

  document.getElementById('bulk-done-btn').addEventListener('click', exitBulkMode);

  document.getElementById('bulk-delete-btn').addEventListener('click', () => {
    if (!selectedKeys.size) return;
    const group = getActiveGroup();
    const count = selectedKeys.size;
    group.keys = group.keys.filter((k) => !selectedKeys.has(typeof k === 'string' ? k : k.key));
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
      sourceGroup.keys = sourceGroup.keys.filter(
        (k) => (typeof k === 'string' ? k : k.key) !== key
      );
    }
    if (selectedKeys.has(state.activeKey)) state.activeKey = null;
    selectedKeys.clear();
    e.target.value = '';
    saveState();
    toast(count + ' ticket' + (count === 1 ? '' : 's') + ' moved to ' + targetGroup.name);
    exitBulkMode();
    updateViewMode();
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
