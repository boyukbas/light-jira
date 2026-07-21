'use strict';

// ── TICKET NAVIGATION & HISTORY ───────────────────────────────────────────────
function openTicketByKey(val, targetGroupId) {
  if (!val) return;
  const key = normalise(val);
  let g;
  if (targetGroupId) {
    g = getGroup(targetGroupId);
    if (g.id !== targetGroupId) {
      toast('Target list not found, opening in default list', 'warn');
      g = getDefaultGroup();
    } else if (g.isFilter || g.id === 'history') {
      g = getDefaultGroup();
    }
  } else {
    g = getActiveGroup();
    if (g.id === 'history' || g.isFilter) g = getDefaultGroup();
  }
  state.activeGroupId = g.id;
  if (g.keys.includes(key)) {
    toast(key + ' is already in this list');
  } else {
    g.keys.unshift(key);
  }
  state.activeKey = key;
  saveState();
  updateViewMode();
}

window.moveTicket = function (key, newGroupId) {
  const oldG = getGroup(state.activeGroupId);
  oldG.keys = oldG.keys.filter((k) => k !== key);
  const newG = getGroup(newGroupId);
  if (!newG.keys.includes(key)) newG.keys.unshift(key);
  if (state.activeKey === key && state.activeGroupId !== newGroupId) state.activeKey = null;
  saveState();
  updateViewMode();
  toast('Moved to ' + newG.name, 'success');
};

window.forceRefreshReading = async function () {
  const key = state.activeKey;
  if (key) {
    delete issueCache[key];
    renderReading();
  }
};

window.addToHistory = function (key) {
  const h = getGroup('history');
  if (h) {
    h.keys = h.keys.filter((k) => entryKey(k) !== key);
    h.keys.unshift({ key, added: Date.now() });
    const limit = HISTORY_LIMIT;
    if (h.keys.length > limit) h.keys = h.keys.slice(0, limit);
  }
};

window.openFromHistory = function (key) {
  let g = state.groups.find((x) => x.id !== 'history' && x.keys.includes(key)) || getDefaultGroup();
  if (!g.keys.includes(key)) g.keys.unshift(key);
  state.appMode = 'jira';
  state.activeGroupId = g.id;
  state.activeKey = key;
  saveState();
  updateViewMode();
};

// ── ASSIGN TO ME ──────────────────────────────────────────────────────────────
// Cache the current user for the session so the one-click assign doesn't re-fetch
// /myself on every use.
let _myself = null;
async function getMyself() {
  if (_myself) return _myself;
  _myself = await fetchMyself();
  return _myself;
}

async function assignToMe(key) {
  try {
    const me = await getMyself();
    if (!me?.accountId) {
      toast('Could not identify the current user', 'error');
      return;
    }
    await updateIssueFields(key, { assignee: { accountId: me.accountId } });
    if (issueCache[key]?.fields) {
      issueCache[key].fields.assignee = { accountId: me.accountId, displayName: me.displayName };
    }
    saveState();
    toast('Assigned to you', 'success');
    if (state.appMode === 'jira' || state.appMode === 'labels') {
      renderMiddle();
      if (state.activeKey === key) renderReading();
    }
  } catch (e) {
    toast('Failed to assign: ' + e.message, 'error');
  }
}

// Sequentially loads all tickets in the active group that are not yet cached.
// Renders incrementally so cards appear as data arrives. A single saveState()
// call at the end batches what was previously a write-per-ticket storm — for a
// 50-ticket group that's 50 localStorage writes vs 1 (and in extension mode the
// debounced sync path is called N times but only persists once anyway).
async function loadAllGroupTickets() {
  const group = getActiveGroup();
  let fetched = false;
  for (const key of group.keys) {
    const k = entryKey(key);
    if (!issueCache[k]) {
      try {
        issueCache[k] = await fetchIssue(k);
        fetched = true;
        renderMiddle();
        if (state.activeKey === k) renderReading();
      } catch (err) {
        console.warn('Failed to load', k, err.message);
      }
    }
  }
  if (fetched) saveState();
}
