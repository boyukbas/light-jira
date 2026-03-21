'use strict';

const DEFAULTS = { 
  baseUrl:'https://site.atlassian.net', 
  email:'', 
  token:'', 
  defaultProject:'PROJ',
  historyLimit: 100 
};
let cfg = {...DEFAULTS};

let issueCache = {}; // in-memory cache for fast pane switching
let blobCache = {};  // prevents reloading identical images
let customFieldMap = {}; // maps customfield_10010 to "Business Case", etc

function loadConfig() { 
  try { 
    const s = localStorage.getItem('jira_config'); 
    if (s) cfg = {...DEFAULTS, ...JSON.parse(s)}; 
  } catch(e) { 
    console.error('Config parsing error:', e);
    cfg = {...DEFAULTS};
  } 
}
function saveConfig() { localStorage.setItem('jira_config', JSON.stringify(cfg)); }
function isConfigured() { return !!(cfg.email && cfg.token && cfg.baseUrl); }
function authHeader() { return 'Basic ' + btoa(cfg.email + ':' + cfg.token); }

function apiBase() { return window.location.protocol === 'file:' ? cfg.baseUrl : '/api/jira'; }
function proxyUrl(fullUrl) {
  if (window.location.protocol === 'file:') return fullUrl;
  if (!fullUrl) return fullUrl;
  if (fullUrl.startsWith(cfg.baseUrl)) return '/api/jira' + fullUrl.slice(cfg.baseUrl.length);
  if (fullUrl.startsWith('http') && !fullUrl.includes(window.location.host)) return '/api/ext?url=' + encodeURIComponent(fullUrl);
  return fullUrl;
}

async function fetchIssue(key) {
  const fields = '*all';
  const url = apiBase() + '/rest/api/3/issue/' + encodeURIComponent(key) + '?fields=' + fields + '&expand=renderedFields';
  const r = await fetch(url, { headers: { Authorization: authHeader(), Accept: 'application/json' } });
  if (!r.ok) {
    let msg = r.status + ' ' + r.statusText;
    try { const j = await r.json(); msg += ': ' + (j.errorMessages?.[0] || j.message || ''); } catch {}
    throw new Error(msg);
  }
  return r.json();
}

async function fetchCustomFields() {
  try {
    const url = apiBase() + '/rest/api/3/field';
    const fields = await (await fetch(url, { headers: { Authorization: authHeader() } })).json();
    for (const f of fields) customFieldMap[f.id] = f.name;
  } catch(e) { console.error('Error fetching custom fields map:', e); }
}

async function fetchBlob(url) {
  if (blobCache[url]) return blobCache[url];
  try {
    const target = proxyUrl(url);
    const r = await fetch(target, { headers: { Authorization: authHeader() } });
    if (!r.ok) return null;
    const objectUrl = URL.createObjectURL(await r.blob());
    blobCache[url] = objectUrl;
    return objectUrl;
  } catch { return null; }
}
