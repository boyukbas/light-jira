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

// Send a beam payload to the app.
// If the app tab is open, inject a CustomEvent directly into the page context.
// If not, open the extension's index.html with the payload as a ?beam= param.
async function beamToApp(payload) {
  const appTab = await getAppTab();
  if (appTab) {
    // runtime messaging requires no host permission — works for own extension pages
    chrome.runtime.sendMessage({ type: 'beam', payload });
    await chrome.tabs.update(appTab.id, { active: true });
  } else {
    const encoded = btoa(JSON.stringify(payload));
    await chrome.tabs.create({ url: `${getAppUrl()}?beam=${encoded}` });
  }
  window.close();
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncate(s, max) {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// Load non-history, non-filter groups from the app's shared localStorage.
// Returns [] if state is missing or unparseable.
function loadAppGroups() {
  try {
    const raw = localStorage.getItem('jira_state');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return (parsed.groups || []).filter((g) => g.id !== 'history' && !g.isFilter);
  } catch {
    return [];
  }
}

async function init() {
  const statusEl = document.getElementById('app-status');
  const openAppBtn = document.getElementById('open-app-btn');
  const sectionUrl = document.getElementById('section-url');
  const sectionNotJira = document.getElementById('section-not-jira');
  const sectionKeys = document.getElementById('section-keys');
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
    } else {
      chrome.tabs.create({ url: getAppUrl() });
    }
    window.close();
  });

  // ── Current tab ───────────────────────────────────────────────────────────
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!currentTab) return;

  const isJiraPage = /^https:\/\/[^/]+\.atlassian\.net\//.test(currentTab.url || '');

  if (!isJiraPage) {
    sectionNotJira.classList.remove('hidden');
    return;
  }

  // ── Section A: beam current URL ───────────────────────────────────────────
  sectionUrl.classList.remove('hidden');
  // Strip " - Site Name" / " | Site Name" suffix only — use \s+ on both sides so
  // the dash inside a ticket key (TTN-12345) is never matched.
  const pageTitle = (currentTab.title || '').replace(/\s+[-|]\s+.+$/, '').trim();
  if (pageTitle) {
    urlDisplay.innerHTML =
      `<strong>${escHtml(truncate(pageTitle, 45))}</strong>` +
      escHtml(truncate(currentTab.url, 55));
  } else {
    urlDisplay.textContent = truncate(currentTab.url, 80);
  }

  // Populate group selector from app's saved state
  const appGroups = loadAppGroups();
  if (appGroups.length) {
    beamUrlGroup.classList.remove('hidden');
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Active list';
    beamUrlGroup.appendChild(defaultOpt);
    for (const g of appGroups) {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      beamUrlGroup.appendChild(opt);
    }
  }

  beamUrlBtn.addEventListener('click', () => {
    const targetGroupId = beamUrlGroup.value || null;
    const payload = { type: 'open-url', url: currentTab.url };
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

  extractedTickets.forEach(({ key, title }) => {
    const li = document.createElement('li');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'key-' + key;
    cb.checked = true;
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
    keysList.appendChild(li);
  });

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

  beamGroupBtn.addEventListener('click', () => {
    const selected = Array.from(keysList.querySelectorAll('input[type=checkbox]:checked')).map(
      (cb) => cb.id.replace('key-', '')
    );
    if (!selected.length) return;
    beamToApp({
      type: 'open-group',
      name: groupNameInput.value.trim() || 'Jira Group',
      keys: selected,
    });
  });
}

init().catch(console.error);
