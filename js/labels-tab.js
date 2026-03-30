'use strict';

// ── LABELS TAB ────────────────────────────────────────────────────────────────

// Build the list of label groups from state.labels + all tracked ticket keys.
// Returns [{label, keys, color}] sorted alphabetically, with 'no-label' last.
function getLabelGroups() {
  // Collect all tracked ticket keys (non-history groups)
  const allTrackedKeys = new Set();
  for (const g of state.groups) {
    if (g.id === 'history') continue;
    for (const e of g.keys) allTrackedKeys.add(entryKey(e));
  }

  // Build label → keys map
  const labelMap = {}; // label → Set of keys
  const noLabelKeys = [];

  for (const key of allTrackedKeys) {
    const lbls = state.labels[key];
    if (!lbls || !lbls.length) {
      noLabelKeys.push(key);
    } else {
      for (const lbl of lbls) {
        if (!labelMap[lbl]) labelMap[lbl] = new Set();
        labelMap[lbl].add(key);
      }
    }
  }

  const groups = Object.keys(labelMap)
    .sort()
    .map((lbl) => ({
      label: lbl,
      keys: Array.from(labelMap[lbl]),
      color: state.labelColors[lbl] || '#6e7681',
    }));

  if (noLabelKeys.length) {
    groups.push({ label: 'no-label', keys: noLabelKeys, color: '#6e7681' });
  }

  return groups;
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
function renderLabelsSidebar() {
  const list = document.getElementById('group-list');
  if (!list) return;

  const groups = getLabelGroups();

  if (!groups.length) {
    list.innerHTML =
      '<div style="padding:12px;color:var(--text-tertiary);font-size:12px;text-align:center;">' +
      'No labels yet.<br>Add labels to tickets in the Jira tab.</div>';
    // Ensure a valid active group
    state.labelsActiveGroup = null;
    return;
  }

  // Auto-select first group if nothing is active or active no longer exists
  if (!state.labelsActiveGroup || !groups.find((g) => g.label === state.labelsActiveGroup)) {
    state.labelsActiveGroup = groups[0].label;
  }

  let html = '';
  for (const g of groups) {
    const isActive = g.label === state.labelsActiveGroup;
    const activeClass = isActive ? ' active' : '';
    const isNoLabel = g.label === 'no-label';
    const badgeColor = isNoLabel ? '#6e7681' : g.color || '#6e7681';
    const textColor =
      badgeColor === '#f0883e' || badgeColor === '#e3b341' ? 'color:#000;' : 'color:#fff;';
    const badge = isNoLabel
      ? '<span class="lbl-badge" style="background:#6e7681;color:#fff;font-size:9px;">?</span>'
      : '<span class="lbl-badge" style="background:' +
        badgeColor +
        ';' +
        textColor +
        'font-size:9px;">' +
        esc(g.label.charAt(0).toUpperCase()) +
        '</span>';

    html +=
      '<div class="group-item' +
      activeClass +
      '" data-label="' +
      esc(g.label) +
      '">' +
      badge +
      '<span class="g-name">' +
      esc(isNoLabel ? 'no-label' : g.label) +
      '</span>' +
      '<span class="count">' +
      g.keys.length +
      '</span>' +
      '</div>';
  }

  list.innerHTML = html;

  list.querySelectorAll('.group-item').forEach((el) => {
    el.addEventListener('click', () => {
      state.labelsActiveGroup = el.dataset.label;
      saveState();
      list.querySelectorAll('.group-item').forEach((i) => {
        i.classList.toggle('active', i.dataset.label === state.labelsActiveGroup);
      });
      renderLabelsMiddle();
    });
  });
}

// ── MIDDLE PANE ───────────────────────────────────────────────────────────────
function renderLabelsMiddle() {
  const nameEl = document.getElementById('current-group-name');
  if (nameEl) nameEl.textContent = state.labelsActiveGroup || 'Labels';

  const list = document.getElementById('ticket-list');
  if (!list) return;

  if (!state.labelsActiveGroup) {
    list.innerHTML = '<div class="empty-msg">Select a label group to view tickets.</div>';
    return;
  }

  const groups = getLabelGroups();
  const group = groups.find((g) => g.label === state.labelsActiveGroup);

  if (!group || !group.keys.length) {
    list.innerHTML = '<div class="empty-msg">No tickets in this label group.</div>';
    return;
  }

  let html = '';
  for (const key of group.keys) {
    const active = state.activeKey === key ? ' active' : '';
    const issue = issueCache[key] || {};
    const f = issue.fields || {};
    const sum = f.summary || 'Loading...';
    const stat = f.status ? f.status.name : '';

    html +=
      '<div class="list-card' +
      active +
      '" data-key="' +
      esc(key) +
      '" data-cached="' +
      (f.summary ? 'true' : 'false') +
      '">' +
      (stat
        ? '<div class="lc-key-row"><span class="status-badge ' +
          statusClass(f.status?.statusCategory?.name || stat) +
          '">' +
          esc(stat) +
          '</span></div>'
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
      '</div>';
  }

  list.innerHTML = html;

  list.querySelectorAll('.list-card').forEach((el) => {
    el.addEventListener('click', () => {
      state.activeKey = el.dataset.key;
      saveState();
      list.querySelectorAll('.list-card').forEach((c) => {
        c.classList.toggle('active', c.dataset.key === state.activeKey);
      });
      renderReading();
    });
  });
}
