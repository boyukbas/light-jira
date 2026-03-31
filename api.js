'use strict';

const HISTORY_LIMIT = 150;

const DEFAULTS = {
  baseUrl: 'https://site.atlassian.net',
  email: '',
  token: '',
};
let cfg = { ...DEFAULTS };

let issueCache = {}; // in-memory cache for fast pane switching
let blobCache = {}; // prevents reloading identical images
let customFieldMap = {}; // maps customfield_10010 to "Business Case", etc

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

async function fetchIssue(key) {
  const fields = '*all';
  const url =
    apiBase() +
    '/rest/api/3/issue/' +
    encodeURIComponent(key) +
    '?fields=' +
    fields +
    '&expand=renderedFields';
  const r = await fetch(url, { headers: commonHeaders() });
  if (!r.ok) {
    let msg = r.status + ' ' + r.statusText;
    try {
      const j = await r.json();
      msg += ': ' + (j.errorMessages?.[0] || j.message || '');
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

async function fetchCustomFields() {
  try {
    const url = apiBase() + '/rest/api/3/field';
    const fields = await (await fetch(url, { headers: commonHeaders() })).json();
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
    blobCache[url] = objectUrl;
    return objectUrl;
  } catch {
    return null;
  }
}

// ── JQL SEARCH ────────────────────────────────────────────────────────────────
async function fetchByJql(jql, maxResults = 50) {
  const url =
    apiBase() +
    '/rest/api/3/search/jql?jql=' +
    encodeURIComponent(jql) +
    '&maxResults=' +
    maxResults +
    '&fields=summary,status,assignee,issuetype,parent,created,updated,reporter';
  const r = await fetch(url, { headers: commonHeaders() });
  if (!r.ok) {
    let msg = r.status + ' ' + r.statusText;
    try {
      const j = await r.json();
      msg += ': ' + (j.errorMessages?.[0] || j.message || '');
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

async function fetchFilterById(filterId) {
  const url = apiBase() + '/rest/api/3/filter/' + encodeURIComponent(filterId);
  const r = await fetch(url, { headers: commonHeaders() });
  if (!r.ok) {
    let msg = r.status + ' ' + r.statusText;
    try {
      const j = await r.json();
      msg += ': ' + (j.errorMessages?.[0] || j.message || '');
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

async function fetchPlanIssues(planId) {
  const url =
    apiBase() + '/rest/agile/1.0/plan/' + encodeURIComponent(planId) + '/issue?maxResults=200';
  const r = await fetch(url, { headers: commonHeaders() });
  if (!r.ok) {
    let msg = r.status + ' ' + r.statusText;
    try {
      const j = await r.json();
      msg += ': ' + (j.errorMessages?.[0] || j.message || '');
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

async function fetchPlanDetails(planId) {
  try {
    const url = apiBase() + '/rest/agile/1.0/plan/' + encodeURIComponent(planId);
    const r = await fetch(url, { headers: commonHeaders() });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}
