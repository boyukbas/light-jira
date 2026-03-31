'use strict';

// ── SORT STATE (session-only, not persisted) ──────────────────────────────────
let historySortCol = null; // 'key'|'summary'|'status'|'assignee'|'created'|'viewed'
let historySortDir = 'asc'; // 'asc' | 'desc'

function sortEntries(entries) {
  if (!historySortCol) return entries;
  return [...entries].sort((a, b) => {
    const ka = entryKey(a);
    const kb = entryKey(b);
    const ia = issueCache[ka];
    const ib = issueCache[kb];
    const fa = ia && !ia._error ? ia.fields || {} : null;
    const fb = ib && !ib._error ? ib.fields || {} : null;
    let va, vb;
    switch (historySortCol) {
      case 'key':
        va = ka;
        vb = kb;
        break;
      case 'summary':
        va = fa ? fa.summary || '' : '';
        vb = fb ? fb.summary || '' : '';
        break;
      case 'status':
        va = fa ? (fa.status ? fa.status.name : '') : '';
        vb = fb ? (fb.status ? fb.status.name : '') : '';
        break;
      case 'assignee':
        va = fa ? (fa.assignee ? fa.assignee.displayName : '') : '';
        vb = fb ? (fb.assignee ? fb.assignee.displayName : '') : '';
        break;
      case 'created':
        va = fa ? fa.created || '' : '';
        vb = fb ? fb.created || '' : '';
        break;
      case 'viewed':
        va = typeof a === 'object' ? a.added : 0;
        vb = typeof b === 'object' ? b.added : 0;
        break;
      default:
        return 0;
    }
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return historySortDir === 'asc' ? cmp : -cmp;
  });
}

function thSortable(cls, colKey, label) {
  const active = historySortCol === colKey;
  const arrow = active ? (historySortDir === 'asc' ? '▲' : '▼') : '▲';
  return (
    '<th class="' +
    cls +
    ' ht-th-sortable" data-sort-col="' +
    colKey +
    '"' +
    (active ? ' data-sort-active="1"' : '') +
    '>' +
    esc(label) +
    '<span class="ht-sort-indicator">' +
    arrow +
    '</span>' +
    '</th>'
  );
}

// ── COLUMN RESIZE ─────────────────────────────────────────────────────────────
function initHtResize(pane) {
  pane.querySelectorAll('.ht-th-sortable').forEach((th) => {
    const handle = document.createElement('div');
    handle.className = 'ht-resize-handle';
    th.appendChild(handle);

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = th.offsetWidth;
      const colKey = th.dataset.sortCol;
      const col = pane.querySelector('col[data-col-key="' + colKey + '"]');

      const onMove = (mv) => {
        const newW = Math.max(40, startW + mv.clientX - startX);
        if (col) col.style.width = newW + 'px';
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

// ── RENDER HISTORY TABLE ──────────────────────────────────────────────────────
function renderHistoryTable() {
  const pane = document.getElementById('history-pane');
  if (!pane) return;
  const hist = getGroup('history');
  const limit = HISTORY_LIMIT;
  const rawEntries = hist.keys.slice(0, limit);

  if (!rawEntries.length) {
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

  const shown = rawEntries.length;
  const total = hist.keys.length;
  const headerRight =
    total > shown ? shown + ' of ' + total + ' shown' : shown + ' item' + (shown === 1 ? '' : 's');

  const entries = sortEntries(rawEntries);

  let html =
    '<div class="middle-header">' +
    '<span>History</span>' +
    '<span style="font-size:11px;color:var(--text-tertiary);font-weight:400;">' +
    esc(headerRight) +
    '</span>' +
    '</div>' +
    '<div class="ht-scroll">' +
    '<table class="ht-table">' +
    '<colgroup>' +
    '<col data-col-key="key">' +
    '<col data-col-key="summary">' +
    '<col data-col-key="status">' +
    '<col data-col-key="assignee">' +
    '<col data-col-key="created">' +
    '<col data-col-key="viewed">' +
    '<col>' +
    '</colgroup>' +
    '<thead><tr>' +
    thSortable('ht-col-key', 'key', 'Key') +
    thSortable('ht-col-summary', 'summary', 'Summary') +
    thSortable('ht-col-status', 'status', 'Status') +
    thSortable('ht-col-assignee', 'assignee', 'Assignee') +
    thSortable('ht-col-created', 'created', 'Created') +
    thSortable('ht-col-viewed', 'viewed', 'Viewed') +
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

  // ── Sort click handlers ───────────────────────────────────────────────────
  pane.querySelectorAll('th[data-sort-col]').forEach((th) => {
    th.addEventListener('click', (e) => {
      if (e.target.closest('.ht-resize-handle')) return;
      const col = th.dataset.sortCol;
      if (historySortCol === col) {
        if (historySortDir === 'asc') {
          historySortDir = 'desc';
        } else {
          historySortCol = null;
          historySortDir = 'asc';
        }
      } else {
        historySortCol = col;
        historySortDir = 'asc';
      }
      renderHistoryTable();
    });
  });

  // ── Row click handlers ────────────────────────────────────────────────────
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

  // ── Column resize handles ─────────────────────────────────────────────────
  initHtResize(pane);

  // ── B3 fix: fetch uncached entries in batches of 5; surface errors ───────
  const BATCH = 5;
  const uncached = rawEntries.filter((e) => !issueCache[entryKey(e)]);

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
