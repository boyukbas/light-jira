'use strict';

// ── JIRA BEAM — Chrome extension integration ──────────────────────────────────
// Handles payloads from the popup (open-url, open-group) via three channels:
//   1. CustomEvent 'jira-beam' (web-page context)
//   2. chrome.runtime.onMessage (extension context)
//   3. ?beam=<base64-JSON> URL parameter (tab-not-open case)

function handleBeam(payload) {
  if (!payload || !payload.type) return;

  if (payload.type === 'open-url') {
    const url = (payload.url || '').trim();
    const targetGroupId = payload.targetGroupId || null;
    if (!url) return;
    const browseMatch = url.match(/\/browse\/([A-Z][A-Z0-9]{0,9}-\d+)/i);
    if (browseMatch) {
      openTicketByKey(browseMatch[1].toUpperCase(), targetGroupId);
      return;
    }
    if (/^[A-Z][A-Z0-9]{0,9}-\d+$/i.test(url)) {
      openTicketByKey(url.toUpperCase(), targetGroupId);
      return;
    }
    runFilterLoad(url).catch((e) => toast('Beam error: ' + e.message, 'error'));
    return;
  }

  if (payload.type === 'open-group') {
    const { name, keys } = payload;
    if (!keys || !keys.length) return;
    const id = 'beam_' + Date.now();
    insertGroupBeforeHistory({ id, name: name || 'Beamed Group', keys });
    state.activeGroupId = id;
    state.activeKey = keys[0];
    saveState();
    updateViewMode();
    toast(
      'Beamed ' + keys.length + ' ticket' + (keys.length === 1 ? '' : 's') + ' into "' + name + '"',
      'success'
    );
    if (isConfigured()) loadAllGroupTickets();
  }
}

window.addEventListener('jira-beam', (e) => handleBeam(e.detail));

if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'beam') handleBeam(msg.payload);
  });
}

// Handle ?beam=<base64-JSON> sent by the extension when the app tab was not open
try {
  const beamParam = new URLSearchParams(window.location.search).get('beam');
  if (beamParam) {
    handleBeam(JSON.parse(atob(beamParam)));
    window.history.replaceState({}, '', window.location.pathname);
  }
} catch {
  /* ignore malformed beam param */
}
