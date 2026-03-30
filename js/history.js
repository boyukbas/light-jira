'use strict';

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
    const key = entryKey(entry);
    const added = typeof entry === 'object' ? entry.added : null;
    const issue = issueCache[key];
    // _error sentinel is set when a fetch fails — distinguish from not-yet-loaded
    const failed = issue?._error;
    const f = !failed && issue ? issue.fields || {} : null;
    const loaded = !failed && f !== null;

    const summary = failed ? 'Failed to load' : loaded ? f.summary || '—' : 'Loading\u2026';
    const status = loaded ? (f.status ? f.status.name : '—') : '';
    const assigneeName = loaded ? (f.assignee ? f.assignee.displayName : null) : null;
    const created = loaded ? (f.created ? relDate(f.created) : '—') : '';
    const viewed = added ? relDate(added) : '';
    const statusCls =
      loaded && f.status ? statusClass(f.status?.statusCategory?.name || status) : '';
    const assigneeHtml = loaded
      ? assigneeName
        ? '<div class="ht-assignee-cell">' +
          avBadge(assigneeName, 'av-rg') +
          '<span>' +
          esc(assigneeName) +
          '</span></div>'
        : '—'
      : failed
        ? ''
        : '<span class="ht-loading">\u2026</span>';

    html +=
      '<tr class="ht-row" data-key="' +
      esc(key) +
      '">' +
      '<td class="ht-cell ht-key-cell"><span class="ht-key-text">' +
      esc(key) +
      '</span></td>' +
      '<td class="ht-cell ht-summary-cell">' +
      (failed
        ? '<span style="color:var(--red);">' + esc(summary) + '</span>'
        : loaded
          ? esc(summary)
          : '<span class="ht-loading">' + esc(summary) + '</span>') +
      '</td>' +
      '<td class="ht-cell">' +
      (status
        ? '<span class="status-badge ' + statusCls + '">' + esc(status) + '</span>'
        : loaded
          ? '—'
          : failed
            ? ''
            : '<span class="ht-loading">\u2026</span>') +
      '</td>' +
      '<td class="ht-cell">' +
      assigneeHtml +
      '</td>' +
      '<td class="ht-cell ht-viewed-cell">' +
      (loaded ? esc(created) : failed ? '' : '<span class="ht-loading">\u2026</span>') +
      '</td>' +
      '<td class="ht-cell ht-viewed-cell">' +
      esc(viewed) +
      '</td>' +
      '<td class="ht-cell ht-remove-cell"><button class="ht-remove-btn" data-key="' +
      esc(key) +
      '" title="Remove from history">\u2715</button></td>' +
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
      const hist = getGroup('history');
      hist.keys = hist.keys.filter((k) => entryKey(k) !== btn.dataset.key);
      saveState();
      renderHistoryTable();
    });
  });

  // ── B3 fix: fetch uncached entries in batches of 5; surface errors ───────
  const BATCH = 5;
  const uncached = entries.filter((e) => !issueCache[entryKey(e)]);

  if (!uncached.length) return;

  (async () => {
    for (let i = 0; i < uncached.length; i += BATCH) {
      const batch = uncached.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (entry) => {
          const key = entryKey(entry);
          try {
            issueCache[key] = await fetchIssue(key);
            saveState();
          } catch (err) {
            // Mark with error sentinel so the row renders an error state
            // instead of staying "Loading…" forever (B3 fix)
            issueCache[key] = { _error: true, _errorMsg: err.message };
          }
          if (state.appMode === 'history') renderHistoryTable();
        })
      );
    }
  })();
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
      } catch (err) {
        console.warn('Failed to load', key, err.message);
      }
    }
  }
}
