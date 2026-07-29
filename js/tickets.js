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

// Keys whose last load attempt failed, so cards can say so instead of sitting on
// "Loading…" forever. Session-only (never persisted) — a refresh clears it.
const loadFailedKeys = new Set();
window.loadFailedKeys = loadFailedKeys;

// Jira caps `key in (...)` clauses well above this, but keeping batches modest
// bounds the URL length and matches the JQL endpoint's default page size.
const HYDRATE_BATCH = 50;
const KEY_SHAPE = /^[A-Z][A-Z0-9]{0,9}-\d+$/;

// Hydrate every uncached ticket in the active group.
//
// One JQL `key in (...)` request per batch instead of one `fields=*all` request
// per ticket: a 20-ticket beamed list went from 20 serial heavy round-trips (and
// 20 full list re-renders) to a single request. The JQL payload carries exactly
// the fields a card needs; it has no `renderedFields`/description, so opening a
// ticket still triggers a full fetch in renderReading() — which already detects
// partial cache entries. Anything the batch can't return (deleted, moved,
// permission-restricted) is marked failed rather than left mid-load.
async function loadAllGroupTickets() {
  const group = getActiveGroup();
  const missing = [];
  for (const entry of group.keys) {
    const k = entryKey(entry);
    if (!issueCache[k]) missing.push(k);
  }
  if (!missing.length) return;

  // A malformed key would break the whole JQL clause — fetch those individually.
  const batchable = missing.filter((k) => KEY_SHAPE.test(k));
  const oddballs = missing.filter((k) => !KEY_SHAPE.test(k));
  let fetched = false;

  for (let i = 0; i < batchable.length; i += HYDRATE_BATCH) {
    const batch = batchable.slice(i, i + HYDRATE_BATCH);
    try {
      const res = await fetchByJql('key in (' + batch.join(',') + ')', batch.length);
      const returned = new Set();
      for (const iss of res.issues || []) {
        if (!iss || !iss.key) continue;
        issueCache[iss.key] = iss;
        returned.add(iss.key);
        loadFailedKeys.delete(iss.key);
        fetched = true;
      }
      for (const k of batch) if (!returned.has(k)) loadFailedKeys.add(k);
    } catch (err) {
      console.warn('Batch load failed', batch.join(','), err.message);
      for (const k of batch) loadFailedKeys.add(k);
    }
    renderMiddle();
  }

  for (const k of oddballs) {
    try {
      issueCache[k] = await fetchIssue(k);
      loadFailedKeys.delete(k);
      fetched = true;
    } catch (err) {
      console.warn('Failed to load', k, err.message);
      loadFailedKeys.add(k);
    }
    renderMiddle();
  }

  if (state.activeKey && issueCache[state.activeKey]) renderReading();
  if (fetched) saveState();
}
