'use strict';

const HISTORY_LIMIT = 150;

const DEFAULTS = {
  baseUrl: 'https://site.atlassian.net',
  email: '',
  token: '',
};
let cfg = { ...DEFAULTS };

let issueCache = {}; // in-memory cache for fast pane switching
let blobCache = {}; // url -> object URL; capped below so URL.createObjectURL() doesn't leak
let customFieldMap = {}; // maps customfield_10010 to "Business Case", etc

// Blob cache is FIFO-capped. createObjectURL holds a blob in memory until the
// URL is revoked, so an uncapped cache over a long session with many attachment
// images leaks megabytes.
const BLOB_CACHE_MAX = 200;

function loadConfig() {
  try {
    const s = localStorage.getItem('jira_config');
    if (s) {
      cfg = { ...DEFAULTS, ...JSON.parse(s) };
    }
  } catch (e) {
    console.error('Config parsing error:', e);
    cfg = { ...DEFAULTS };
  }
}
function saveConfig() {
  localStorage.setItem('jira_config', JSON.stringify(cfg));
}
function isConfigured() {
  return !!(cfg.email && cfg.token && cfg.baseUrl);
}
function authHeader() {
  return 'Basic ' + btoa(cfg.email + ':' + cfg.token);
}
function commonHeaders() {
  return { Authorization: authHeader(), Accept: 'application/json' };
}

function apiBase() {
  return cfg.baseUrl;
}

// ── SHARED FETCH HELPER ───────────────────────────────────────────────────────
// All Jira REST calls share the same error-message shape: "<status> <statusText>:
// <errorMessages[0] or message>". Extracting this removes five duplicated try/
// catch blocks and gives us a single place to evolve the error contract.
async function _apiFetchJson(path, options) {
  const r = await fetch(apiBase() + path, { headers: commonHeaders(), ...options });
  // PUT /issue returns 204 on success with empty body — treat as OK, return null.
  if (r.status === 204) return null;
  if (!r.ok) {
    let msg = r.status + ' ' + r.statusText;
    try {
      const j = await r.json();
      msg += ': ' + (j.errorMessages?.[0] || j.message || '');
    } catch {
      /* body not JSON — stick with the status line */
    }
    throw new Error(msg);
  }
  return r.json();
}

async function fetchIssue(key) {
  return _apiFetchJson(
    '/rest/api/3/issue/' + encodeURIComponent(key) + '?fields=*all&expand=renderedFields'
  );
}

async function fetchCustomFields() {
  try {
    const fields = await _apiFetchJson('/rest/api/3/field');
    for (const f of fields) customFieldMap[f.id] = f.name;
  } catch (e) {
    console.error('Error fetching custom fields map:', e);
  }
}

async function fetchBlob(url) {
  if (blobCache[url]) return blobCache[url];
  try {
    const r = await fetch(url, { headers: commonHeaders() });
    if (!r.ok) return null;
    const objectUrl = URL.createObjectURL(await r.blob());
    // FIFO evict oldest entries once we hit the cap. Revoking releases the
    // underlying Blob — without this, every cached image's bytes stay in
    // memory for the whole session.
    const keys = Object.keys(blobCache);
    if (keys.length >= BLOB_CACHE_MAX) {
      const oldest = keys[0];
      try {
        URL.revokeObjectURL(blobCache[oldest]);
      } catch {
        /* revocation is best-effort */
      }
      delete blobCache[oldest];
    }
    blobCache[url] = objectUrl;
    return objectUrl;
  } catch {
    return null;
  }
}

async function updateIssueFields(key, fields) {
  await _apiFetchJson('/rest/api/3/issue/' + encodeURIComponent(key), {
    method: 'PUT',
    headers: { ...commonHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

// ── WORKFLOW TRANSITIONS ─────────────────────────────────────────────────────
// GET returns only the transitions legal from the issue's CURRENT status, so the
// UI can never offer an illegal move. Each transition carries `to` — the status
// the issue lands in — which we use to update the cache without a re-fetch.
async function fetchTransitions(key) {
  const data = await _apiFetchJson('/rest/api/3/issue/' + encodeURIComponent(key) + '/transitions');
  return data?.transitions || [];
}

async function doTransition(key, transitionId) {
  await _apiFetchJson('/rest/api/3/issue/' + encodeURIComponent(key) + '/transitions', {
    method: 'POST',
    headers: { ...commonHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ transition: { id: transitionId } }),
  });
}

async function searchUsers(query) {
  try {
    return await _apiFetchJson(
      '/rest/api/3/user/search?query=' + encodeURIComponent(query) + '&maxResults=5'
    );
  } catch {
    // User-search failures are silent in the UI (empty dropdown) — matches the
    // previous behaviour.
    return [];
  }
}

// ── JQL SEARCH ─────────────────────────────────────────────────────────────────
async function fetchByJql(jql, maxResults = 50) {
  return _apiFetchJson(
    '/rest/api/3/search/jql?jql=' +
      encodeURIComponent(jql) +
      '&maxResults=' +
      maxResults +
      '&fields=summary,status,assignee,issuetype,parent,created,updated,reporter'
  );
}

async function fetchFilterById(filterId) {
  return _apiFetchJson('/rest/api/3/filter/' + encodeURIComponent(filterId));
}

async function fetchPlanIssues(planId) {
  return _apiFetchJson(
    '/rest/agile/1.0/plan/' + encodeURIComponent(planId) + '/issue?maxResults=200'
  );
}

async function fetchPlanDetails(planId) {
  try {
    return await _apiFetchJson('/rest/agile/1.0/plan/' + encodeURIComponent(planId));
  } catch {
    return null;
  }
}
