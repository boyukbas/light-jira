'use strict';

// ── TICKET NAVIGATION & HISTORY ───────────────────────────────────────────────
function openTicketByKey(val, targetGroupId) {
  if (!val) return;
  const key = normalise(val);
  let g = targetGroupId ? getGroup(targetGroupId) : getActiveGroup();
  if (!targetGroupId && (g.id === 'history' || g.isFilter)) {
    g = getDefaultGroup();
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

// Sequentially loads all tickets in the active group that are not yet cached.
// Renders incrementally so cards appear as data arrives.
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
