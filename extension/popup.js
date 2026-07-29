'use strict';

// The app is bundled inside this extension — use chrome.runtime.getURL so the
// correct chrome-extension://<id>/index.html is resolved regardless of installation.
function getAppUrl() {
  return chrome.runtime.getURL('index.html');
}

// Find the app tab if it is already open.
async function getAppTab() {
  const [tab] = await chrome.tabs.query({ url: `${getAppUrl()}*` });
  return tab || null;
}

// Read the openInWindow preference from chrome.storage.sync (saved by the app).
async function getOpenInWindow() {
  try {
    const result = await chrome.storage.sync.get('crisp_prefs');
    return result.crisp_prefs?.openInWindow !== false;
  } catch {
    return true; // default: popup window
  }
}

// Screen-relative, centred bounds for the app popup window. Pure function of the
// available screen size so it is unit-testable and never opens larger than the
// display — the old hardcoded 1440x900 overflowed small laptops and looked lost
// on large monitors.
function computeAppWindowBounds(availW, availH) {
  const width = Math.min(1600, Math.max(900, Math.round(availW * 0.85)));
  const height = Math.min(1000, Math.max(600, Math.round(availH * 0.9)));
  const left = Math.max(0, Math.round((availW - width) / 2));
  const top = Math.max(0, Math.round((availH - height) / 2));
  return { width, height, left, top };
}

function openAppWindow(url) {
  const b = computeAppWindowBounds(screen.availWidth, screen.availHeight);
  return chrome.windows.create({ url, type: 'popup', ...b });
}

// Inline feedback line. kind: '' | 'success' | 'error'.
function showMsg(text, kind) {
  const el = document.getElementById('popup-msg');
  if (!el) return;
  el.textContent = text;
  el.className = 'popup-msg' + (kind ? ' ' + kind : '');
  el.classList.remove('hidden');
}

// Send a beam payload to the app.
// If the app tab is open, focus it and send the payload via runtime messaging.
// If not, open the app using either a popup window or a tab per the openInWindow setting.
async function beamToApp(payload) {
  const [appTab, openInWindow] = await Promise.all([getAppTab(), getOpenInWindow()]);
  if (appTab) {
    chrome.runtime.sendMessage({ type: 'beam', payload });
    await chrome.tabs.update(appTab.id, { active: true });
    await chrome.windows.update(appTab.windowId, { focused: true });
  } else {
    // btoa only accepts Latin-1; UTF-8-encode first so Jira titles with
    // em-dashes, smart quotes, emoji, etc. survive the round-trip.
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const encoded = btoa(bin);
    const url = `${getAppUrl()}?beam=${encoded}`;
    if (openInWindow) {
      await openAppWindow(url);
    } else {
      await chrome.tabs.create({ url });
    }
  }
  window.close();
}

// Open a ticket / JQL / filter string in the app. The app's handleBeam already
// classifies bare keys, browse URLs, filter IDs and JQL (see js/beam.js), so the
// popup just forwards the raw string as an open-url payload — no parsing here.
function quickOpen(raw) {
  const value = (raw || '').trim();
  if (!value) return;
  beamToApp({ type: 'open-url', url: value });
}

const JIRA_TAB_URL = 'https://*.atlassian.net/*';

// Jira tabs in the active window by default. `currentWindow` in a popup means the
// window the popup was opened from, i.e. the one the user is looking at — which is
// the scope people expect from "beam my open tabs". Pass allWindows to widen it.
function queryJiraTabs(allWindows) {
  const q = { url: JIRA_TAB_URL };
  if (!allWindows) q.currentWindow = true;
  return chrome.tabs.query(q);
}

// Collect tickets from the open Jira tabs and beam them as one group.
async function beamAllJiraTabs(btn, { allWindows = false } = {}) {
  const originalLabel = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Scanning…';
  }
  const tabs = await queryJiraTabs(allWindows);
  // Query every tab concurrently — a serial await-loop made the popup feel slow
  // when many Jira tabs were open. allSettled preserves tab order (so the title
  // dedup below stays deterministic) and never rejects on a content-script-less tab.
  const settled = await Promise.allSettled(
    tabs.map((tab) => chrome.tabs.sendMessage(tab.id, { type: 'extract-keys' }))
  );
  const ticketMap = new Map();
  for (const r of settled) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const response = r.value;
    const tickets = response.tickets || (response.keys || []).map((k) => ({ key: k, title: k }));
    for (const { key, title } of tickets) {
      if (!ticketMap.has(key) || (title && title !== key)) {
        ticketMap.set(key, title || key);
      }
    }
  }
  if (!ticketMap.size) {
    // Give the user feedback instead of silently closing the popup. Restore the
    // caller's own label — it is generated from the live tab count.
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
    showMsg('No tickets found in open Jira tabs.', 'error');
    return;
  }
  beamToApp({
    type: 'open-group',
    name: allWindows ? 'All Jira Tabs' : 'Jira Tabs',
    keys: Array.from(ticketMap.keys()),
  });
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncate(s, max) {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// Load non-history, non-filter groups from chrome.storage.sync.
// Falls back to localStorage for backwards compatibility.
// Returns [] if state is missing or unparseable.
async function loadAppGroups() {
  try {
    const synced = await chrome.storage.sync.get('crisp_groups');
    if (synced.crisp_groups) {
      return synced.crisp_groups.filter((g) => g.id !== 'history' && !g.isFilter);
    }
    // Fallback: legacy localStorage (pre-sync migration)
    const raw = localStorage.getItem('jira_state');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return (parsed.groups || []).filter((g) => g.id !== 'history' && !g.isFilter);
  } catch {
    return [];
  }
}

// Load every ticket in the app's history group with its cached title. History
// entries store only {key, added}; titles come from the device-local issue
// cache when present. Callers sort/slice as needed (recents vs. search index).
async function loadHistoryTickets() {
  try {
    const [synced, local] = await Promise.all([
      chrome.storage.sync.get('crisp_groups'),
      chrome.storage.local.get('jira_issue_cache'),
    ]);
    const history = (synced.crisp_groups || []).find((g) => g.id === 'history');
    if (!history || !history.keys) return [];
    const cache = local.jira_issue_cache || {};
    return history.keys
      .map((e) => {
        const key = typeof e === 'string' ? e : e.key;
        const added = typeof e === 'string' ? 0 : e.added || 0;
        return { key, title: cache[key]?.fields?.summary || '', added };
      })
      .filter((t) => t.key);
  } catch {
    return [];
  }
}

const recentsByRecency = (tickets, limit = 6) =>
  tickets
    .slice()
    .sort((a, b) => b.added - a.added)
    .slice(0, limit);

// Roving arrow-key navigation over a list of focusable <li> rows.
function enableListArrowNav(listEl) {
  listEl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...listEl.querySelectorAll('li')];
    if (!items.length) return;
    e.preventDefault();
    const idx = items.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? Math.min(idx + 1, items.length - 1) : Math.max(idx - 1, 0);
    items[Math.max(next, 0)].focus();
  });
}

function renderRecents(recents, listEl) {
  listEl.innerHTML = '';
  for (const { key, title } of recents) {
    const li = document.createElement('li');
    li.setAttribute('role', 'button');
    li.tabIndex = 0;
    const keySpan = document.createElement('span');
    keySpan.className = 'key-label';
    keySpan.textContent = key;
    li.appendChild(keySpan);
    if (title && title !== key) {
      const titleSpan = document.createElement('span');
      titleSpan.className = 'key-title';
      titleSpan.textContent = title;
      li.appendChild(titleSpan);
    }
    li.addEventListener('click', () => quickOpen(key));
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        quickOpen(key);
      }
    });
    listEl.appendChild(li);
  }
  enableListArrowNav(listEl);
}

async function init() {
  const statusEl = document.getElementById('app-status');
  const openAppBtn = document.getElementById('open-app-btn');
  const quickInput = document.getElementById('quick-open-input');
  const quickBtn = document.getElementById('quick-open-btn');
  const sectionUrl = document.getElementById('section-url');
  const sectionKeys = document.getElementById('section-keys');
  const sectionRecent = document.getElementById('section-recent');
  const sectionHint = document.getElementById('section-hint');
  const recentList = document.getElementById('recent-list');
  const urlDisplay = document.getElementById('url-display');
  const beamUrlGroup = document.getElementById('beam-url-group');
  const beamUrlBtn = document.getElementById('beam-url-btn');
  const keysLoading = document.getElementById('keys-loading');
  const keysList = document.getElementById('keys-list');
  const groupForm = document.getElementById('group-form');
  const groupNameInput = document.getElementById('group-name');
  const beamGroupBtn = document.getElementById('beam-group-btn');
  const selectAllLink = document.getElementById('select-all-link');

  // ── App status + Open App button (always visible) ─────────────────────────
  const appTab = await getAppTab();
  if (appTab) {
    statusEl.textContent = 'App open';
    statusEl.classList.add('online');
  } else {
    statusEl.textContent = 'App closed';
  }

  openAppBtn.addEventListener('click', async () => {
    const tab = await getAppTab();
    if (tab) {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    } else {
      const openInWindow = await getOpenInWindow();
      if (openInWindow) {
        openAppWindow(getAppUrl());
      } else {
        chrome.tabs.create({ url: getAppUrl() });
      }
    }
    window.close();
  });

  // ── Beam All: scoped to the active window ─────────────────────────────────
  // The label states what will actually be beamed, so there is no guessing (and
  // no silently hoovering up tabs from a window the user isn't looking at).
  // Cross-window beaming stays reachable via a link that appears only when
  // another window really does have Jira tabs. Runs before the current-tab
  // section below, which returns early on non-Jira pages.
  const beamAllBtn = document.getElementById('beam-all-btn');
  const beamAllWindowsBtn = document.getElementById('beam-all-windows-btn');
  const plural = (n) => (n === 1 ? '' : 's');

  beamAllBtn?.addEventListener('click', (e) => beamAllJiraTabs(e.currentTarget));
  beamAllWindowsBtn?.addEventListener('click', (e) =>
    beamAllJiraTabs(e.currentTarget, { allWindows: true })
  );

  (async () => {
    const [here, everywhere] = await Promise.all([queryJiraTabs(false), queryJiraTabs(true)]);
    const mine = here.length;
    const elsewhere = Math.max(0, everywhere.length - mine);
    if (beamAllBtn) {
      if (mine) {
        beamAllBtn.textContent = `Beam ${mine} Jira Tab${plural(mine)}`;
        beamAllBtn.title = `Beam ${mine} Jira tab${plural(mine)} from this window`;
      } else {
        beamAllBtn.disabled = true;
        beamAllBtn.textContent = 'No Jira Tabs';
        beamAllBtn.title = 'No Jira tabs are open in this window';
      }
    }
    if (beamAllWindowsBtn && elsewhere) {
      beamAllWindowsBtn.textContent = `+${elsewhere} in other window${plural(elsewhere)}`;
      beamAllWindowsBtn.title = `Also beam ${elsewhere} Jira tab${plural(elsewhere)} open in other Chrome windows`;
      beamAllWindowsBtn.classList.remove('hidden');
    }
  })();

  // ── Quick-open (always visible launcher) ──────────────────────────────────
  // Fuzzy-match the user's history as they type (Fuse over key+title); Enter with
  // no highlighted suggestion falls back to a raw open-url (key / JQL / filter).
  const qoResults = document.getElementById('quick-open-results');
  const historyTickets = await loadHistoryTickets();
  const fuse =
    typeof Fuse !== 'undefined' && historyTickets.length
      ? new Fuse(historyTickets, { keys: ['key', 'title'], threshold: 0.4, ignoreLocation: true })
      : null;
  let qoMatches = [];
  let qoActive = -1; // index of the highlighted suggestion, -1 = none

  function renderQoResults() {
    qoResults.innerHTML = '';
    if (!qoMatches.length) {
      qoResults.classList.add('hidden');
      return;
    }
    qoMatches.forEach((m, i) => {
      const li = document.createElement('li');
      if (i === qoActive) li.classList.add('active');
      const k = document.createElement('span');
      k.className = 'key-label';
      k.textContent = m.key;
      li.appendChild(k);
      if (m.title) {
        const t = document.createElement('span');
        t.className = 'key-title';
        t.textContent = m.title;
        li.appendChild(t);
      }
      // mousedown, not click, so the pick registers before the input's blur.
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        quickOpen(m.key);
      });
      qoResults.appendChild(li);
    });
    qoResults.classList.remove('hidden');
  }

  function updateQoMatches() {
    const v = quickInput.value.trim();
    qoActive = -1;
    qoMatches =
      v && fuse
        ? fuse
            .search(v)
            .slice(0, 6)
            .map((r) => r.item)
        : [];
    renderQoResults();
  }

  quickInput.addEventListener('input', updateQoMatches);
  quickBtn.addEventListener('click', () => quickOpen(quickInput.value));
  quickInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && qoMatches.length) {
      e.preventDefault();
      qoActive = Math.min(qoActive + 1, qoMatches.length - 1);
      renderQoResults();
    } else if (e.key === 'ArrowUp' && qoMatches.length) {
      e.preventDefault();
      qoActive = Math.max(qoActive - 1, -1);
      renderQoResults();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (qoActive >= 0 && qoMatches[qoActive]) quickOpen(qoMatches[qoActive].key);
      else quickOpen(quickInput.value);
    } else if (e.key === 'Escape') {
      qoMatches = [];
      qoActive = -1;
      renderQoResults();
    }
  });
  quickInput.focus();

  // ── Current tab ───────────────────────────────────────────────────────────
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!currentTab) return;

  const isJiraPage = /^https:\/\/[^/]+\.atlassian\.net\//.test(currentTab.url || '');

  if (!isJiraPage) {
    // Off Jira: surface recent tickets as a launcher instead of a dead-end.
    const recents = recentsByRecency(historyTickets);
    if (recents.length) {
      renderRecents(recents, recentList);
      sectionRecent.classList.remove('hidden');
    } else {
      sectionHint.classList.remove('hidden');
    }
    return;
  }

  // ── Section A: beam current page / ticket ─────────────────────────────────
  sectionUrl.classList.remove('hidden');
  // Strip " - Site Name" / " | Site Name" suffix only — use \s+ on both sides so
  // the dash inside a ticket key (TTN-12345) is never matched.
  const pageTitle = (currentTab.title || '').replace(/\s+[-|]\s+.+$/, '').trim();
  // On a single issue page, make the primary action a one-click "Open TTN-123"
  // that beams the KEY (unambiguous) rather than the raw browse URL.
  const browseKey = (currentTab.url.match(/\/browse\/([A-Z][A-Z0-9]{0,9}-\d+)/i) || [])[1];
  if (browseKey) {
    beamUrlBtn.textContent = 'Open ' + browseKey.toUpperCase();
    const label = sectionUrl.querySelector('.section-label');
    if (label) label.textContent = 'This Ticket';
  }
  if (pageTitle) {
    // Title only — the raw URL is redundant next to it (and next to the "Open
    // TTN-123" button), and vertical space is the scarcest thing in the popup.
    // Keep the full URL discoverable on hover.
    urlDisplay.innerHTML = `<strong>${escHtml(truncate(pageTitle, 45))}</strong>`;
    urlDisplay.title = currentTab.url;
  } else {
    urlDisplay.textContent = truncate(currentTab.url, 80);
  }

  // Populate group selector from app's saved state.
  // Re-runs on focus so stale names/IDs are refreshed if the app was edited while
  // this popup was open in the background.
  async function refreshGroupSelector() {
    const groups = await loadAppGroups();
    beamUrlGroup.innerHTML = '';
    if (!groups.length) {
      beamUrlGroup.classList.add('hidden');
      return;
    }
    beamUrlGroup.classList.remove('hidden');
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Active list';
    beamUrlGroup.appendChild(defaultOpt);
    for (const g of groups) {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      beamUrlGroup.appendChild(opt);
    }
  }
  refreshGroupSelector();
  window.addEventListener('focus', refreshGroupSelector);

  beamUrlBtn.addEventListener('click', () => {
    const targetGroupId = beamUrlGroup.value || null;
    const payload = {
      type: 'open-url',
      url: browseKey ? browseKey.toUpperCase() : currentTab.url,
    };
    if (targetGroupId) payload.targetGroupId = targetGroupId;
    beamToApp(payload);
  });

  // ── Section B: keys extracted from the page ───────────────────────────────
  sectionKeys.classList.remove('hidden');

  let extractedTickets = [];
  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, { type: 'extract-keys' });
    if (response?.tickets?.length) {
      extractedTickets = response.tickets;
    } else if (response?.keys?.length) {
      // Backward-compat: old content script returns only keys
      extractedTickets = response.keys.map((key) => ({ key, title: key }));
    }
  } catch {
    // Content script not yet injected (e.g. extension just installed); graceful degradation.
  }

  keysLoading.classList.add('hidden');

  if (!extractedTickets.length) {
    keysLoading.textContent = 'No tickets found on this page.';
    keysLoading.classList.remove('hidden');
    return;
  }

  // Build checkbox list
  keysList.classList.remove('hidden');
  groupForm.classList.remove('hidden');
  groupNameInput.value = pageTitle || 'Jira Group';

  // The list is height-bounded and scrolls internally, so state the total —
  // otherwise rows below the fold are invisible with no hint that they exist.
  const keysLabel = sectionKeys.querySelector('.section-label');
  if (keysLabel) keysLabel.textContent = `Tickets on This Page (${extractedTickets.length})`;

  extractedTickets.forEach(({ key, title }) => {
    const li = document.createElement('li');
    li.tabIndex = 0; // the row is the tab stop / arrow-nav target
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'key-' + key;
    cb.checked = true;
    cb.tabIndex = -1; // toggled via the row, not a separate tab stop
    const lbl = document.createElement('label');
    lbl.htmlFor = cb.id;
    const keySpan = document.createElement('span');
    keySpan.className = 'key-label';
    keySpan.textContent = key;
    lbl.appendChild(keySpan);
    if (title && title !== key) {
      const titleSpan = document.createElement('span');
      titleSpan.className = 'key-title';
      titleSpan.textContent = title;
      lbl.appendChild(titleSpan);
    }
    li.appendChild(cb);
    li.appendChild(lbl);
    // Clicking anywhere on the row toggles the checkbox
    li.addEventListener('click', (e) => {
      if (e.target !== cb) cb.checked = !cb.checked;
    });
    // Space / Enter toggles when the row has keyboard focus
    li.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        cb.checked = !cb.checked;
      }
    });
    keysList.appendChild(li);
  });
  enableListArrowNav(keysList);

  // Select-all / deselect-all toggle
  let allSelected = true;
  selectAllLink.addEventListener('click', (e) => {
    e.preventDefault();
    allSelected = !allSelected;
    keysList.querySelectorAll('input[type=checkbox]').forEach((cb) => (cb.checked = allSelected));
    selectAllLink.textContent = allSelected ? 'Deselect all' : 'Select all';
  });
  // Start in "all selected" state, so the link label reflects what clicking will do
  selectAllLink.textContent = 'Deselect all';

  function beamSelectedGroup() {
    const selected = Array.from(keysList.querySelectorAll('input[type=checkbox]:checked')).map(
      (cb) => cb.id.replace('key-', '')
    );
    if (!selected.length) {
      showMsg('Select at least one ticket to beam.', 'error');
      return;
    }
    beamToApp({
      type: 'open-group',
      name: groupNameInput.value.trim() || 'Jira Group',
      keys: selected,
    });
  }

  beamGroupBtn.addEventListener('click', beamSelectedGroup);
  groupNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      beamSelectedGroup();
    }
  });
}

init().catch(console.error);
