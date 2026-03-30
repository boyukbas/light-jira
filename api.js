'use strict';

const CLOUD_PROXY_URL = 'https://wj342i36cjmzpkicz6b72moapi0fiucq.lambda-url.eu-central-1.on.aws';

const HISTORY_LIMIT = 150;

const DEFAULTS = {
  baseUrl: 'https://site.atlassian.net',
  email: '',
  token: '',
  useCloud: true,
};
let cfg = { ...DEFAULTS };

let issueCache = {}; // in-memory cache for fast pane switching
let blobCache = {}; // prevents reloading identical images
let customFieldMap = {}; // maps customfield_10010 to "Business Case", etc

function loadConfig() {
  try {
    const s = localStorage.getItem('jira_config');
    if (s) {
      const stored = JSON.parse(s);
      // Migrate: old proxyUrl field → useCloud boolean
      if ('proxyUrl' in stored && !('useCloud' in stored)) {
        stored.useCloud = stored.proxyUrl === CLOUD_PROXY_URL;
        delete stored.proxyUrl;
      }
      cfg = { ...DEFAULTS, ...stored };
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
  const h = { Authorization: authHeader(), Accept: 'application/json' };
  if (cfg.baseUrl) h['X-Jira-Host'] = new URL(cfg.baseUrl).host;
  return h;
}

function apiBase() {
  const proto = window.location.protocol;
  // Extension page has host_permissions — talks directly to Jira, no proxy needed
  if (proto === 'chrome-extension:' || proto === 'file:') return cfg.baseUrl;
  if (cfg.useCloud) return CLOUD_PROXY_URL + '/api/jira';
  return '/api/jira';
}

function proxyUrl(fullUrl) {
  if (!fullUrl) return fullUrl;
  // Extension page fetches media directly via host_permissions — no proxy needed
  if (window.location.protocol === 'chrome-extension:') return fullUrl;
  const base = cfg.useCloud ? CLOUD_PROXY_URL : '';
  const jira = cfg.baseUrl ? cfg.baseUrl.replace(/\/$/, '') : '';

  // Prevent double proxying if we already hit the Lambda
  if (base && fullUrl.startsWith(base)) return fullUrl;

  if (jira && fullUrl.startsWith(jira)) {
    const path = fullUrl.slice(jira.length);
    return (base || '/api/jira') + path;
  }
  if (fullUrl.startsWith('http')) {
    const isLocal = fullUrl.includes(window.location.host);
    if (!isLocal) return (base || '/api/ext') + '?url=' + encodeURIComponent(fullUrl);
  }
  return fullUrl;
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
    const target = proxyUrl(url);
    const r = await fetch(target, { headers: commonHeaders() });
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

function parseFilterInput(input) {
  const trimmed = input.trim();
  // Handle filter URL: https://site.atlassian.net/issues/?filter=12345
  try {
    if (trimmed.startsWith('http')) {
      const url = new URL(trimmed);
      const filterId = url.searchParams.get('filter');
      if (filterId) return { type: 'filterId', value: filterId };
      // Could also be a JQL URL
      const jql = url.searchParams.get('jql');
      if (jql) return { type: 'jql', value: jql };
      // Plans URL: /jira/plans/{planId}/scenarios/{scenarioId}/...
      const plansMatch = url.pathname.match(/\/jira\/plans\/(\d+)/);
      if (plansMatch) return { type: 'planId', value: plansMatch[1] };
    }
  } catch {
    /* not a URL */
  }

  // Plain filter ID
  if (/^\d+$/.test(trimmed)) return { type: 'filterId', value: trimmed };

  // Assume it's JQL
  return { type: 'jql', value: trimmed };
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
