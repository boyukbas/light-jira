/**
 * Jira Light — Local Proxy Server
 * Forwards API requests to Jira Cloud (avoids browser CORS restrictions).
 *
 * Usage:   node proxy.js
 * Then open: http://localhost:3000
 */

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '3000', 10);
const JIRA_BASE = (process.env.JIRA_BASE || 'https://site.atlassian.net').replace(/\/$/, '');
const MOCK_MODE = process.env.MOCK === '1' || process.argv.includes('--mock');

// ── MOCK DATA ──────────────────────────────────────────────────────────────────
const MOCK_ISSUES = [
  {
    key: 'DEMO-1',
    summary: 'Set up CI/CD pipeline for automated deployments',
    status: 'In Progress',
    statusCategory: 'In Progress',
    type: 'Story',
    assignee: 'Alice Chen',
    reporter: 'Bob Kim',
    priority: 'High',
    created: '2026-01-10T09:00:00.000+0000',
    updated: '2026-03-20T14:30:00.000+0000',
    description:
      '<h2>Goal</h2><p>Automate the build and deployment pipeline using GitHub Actions.</p><ul><li>Build on every PR</li><li>Deploy to staging on merge to main</li><li>Deploy to production on tag</li></ul>',
    labels: ['infrastructure', 'devops'],
    parentKey: null,
  },
  {
    key: 'DEMO-2',
    summary: 'Fix login page crash on Safari iOS 17',
    status: 'Open',
    statusCategory: 'To Do',
    type: 'Bug',
    assignee: 'Bob Kim',
    reporter: 'Alice Chen',
    priority: 'Critical',
    created: '2026-02-03T11:20:00.000+0000',
    updated: '2026-03-22T09:15:00.000+0000',
    description:
      '<p><strong>Steps to reproduce:</strong></p><ol><li>Open app on Safari iOS 17</li><li>Navigate to /login</li><li>Tap the email field</li></ol><p><strong>Expected:</strong> Input focuses normally.</p><p><strong>Actual:</strong> App crashes with blank white screen.</p>',
    labels: ['bug', 'mobile'],
    parentKey: null,
  },
  {
    key: 'DEMO-3',
    summary: 'Migrate database to PostgreSQL 16',
    status: 'Done',
    statusCategory: 'Done',
    type: 'Task',
    assignee: 'Carol Davis',
    reporter: 'Alice Chen',
    priority: 'Medium',
    created: '2025-12-15T08:00:00.000+0000',
    updated: '2026-02-28T17:45:00.000+0000',
    description:
      '<p>Upgrade from PostgreSQL 14 to 16 to take advantage of new performance improvements and logical replication features.</p>',
    labels: ['database', 'infrastructure'],
    parentKey: null,
  },
  {
    key: 'DEMO-4',
    summary: 'Add dark mode support to the design system',
    status: 'In Progress',
    statusCategory: 'In Progress',
    type: 'Story',
    assignee: 'Alice Chen',
    reporter: 'Dan Park',
    priority: 'Medium',
    created: '2026-01-20T10:00:00.000+0000',
    updated: '2026-03-25T11:00:00.000+0000',
    description:
      '<p>Implement CSS custom property tokens for dark/light themes across all UI components.</p>',
    labels: ['design', 'ui'],
    parentKey: 'DEMO-10',
  },
  {
    key: 'DEMO-5',
    summary: 'Write API documentation for v2 endpoints',
    status: 'Open',
    statusCategory: 'To Do',
    type: 'Task',
    assignee: null,
    reporter: 'Carol Davis',
    priority: 'Low',
    created: '2026-03-01T09:30:00.000+0000',
    updated: '2026-03-01T09:30:00.000+0000',
    description:
      '<p>Create OpenAPI 3.1 spec for all v2 REST endpoints. Include request/response examples and error codes.</p>',
    labels: ['documentation'],
    parentKey: null,
  },
  {
    key: 'DEMO-6',
    summary: 'Performance regression in search results (3s → 8s)',
    status: 'Open',
    statusCategory: 'To Do',
    type: 'Bug',
    assignee: 'Bob Kim',
    reporter: 'Dan Park',
    priority: 'High',
    created: '2026-03-10T15:00:00.000+0000',
    updated: '2026-03-26T10:20:00.000+0000',
    description:
      '<p>Search latency has increased from ~3s to ~8s since the v2.4 release. Profiling suggests the issue is in the full-text index scan.</p>',
    labels: ['performance', 'bug'],
    parentKey: null,
  },
  {
    key: 'DEMO-7',
    summary: 'Implement rate limiting on public API',
    status: 'Done',
    statusCategory: 'Done',
    type: 'Story',
    assignee: 'Carol Davis',
    reporter: 'Alice Chen',
    priority: 'High',
    created: '2026-01-05T09:00:00.000+0000',
    updated: '2026-02-14T16:30:00.000+0000',
    description:
      '<p>Add per-IP and per-token rate limiting (100 req/min by default) with configurable overrides per plan tier.</p>',
    labels: ['security', 'api'],
    parentKey: null,
  },
  {
    key: 'DEMO-8',
    summary: 'Refactor authentication middleware to use JWT RS256',
    status: 'In Progress',
    statusCategory: 'In Progress',
    type: 'Story',
    assignee: 'Dan Park',
    reporter: 'Bob Kim',
    priority: 'High',
    created: '2026-02-18T11:00:00.000+0000',
    updated: '2026-03-28T09:00:00.000+0000',
    description:
      '<p>Replace HS256 symmetric signing with RS256 asymmetric keys to allow token verification without sharing secrets.</p>',
    labels: ['security', 'auth'],
    parentKey: null,
  },
  {
    key: 'DEMO-9',
    summary: 'Add Stripe billing integration',
    status: 'Open',
    statusCategory: 'To Do',
    type: 'Story',
    assignee: null,
    reporter: 'Alice Chen',
    priority: 'Medium',
    created: '2026-03-15T14:00:00.000+0000',
    updated: '2026-03-15T14:00:00.000+0000',
    description:
      '<p>Integrate Stripe Billing API to handle subscription plans, invoices, and payment method management.</p>',
    labels: ['billing', 'integration'],
    parentKey: null,
  },
  {
    key: 'DEMO-10',
    summary: 'Q2 Design System Overhaul',
    status: 'In Progress',
    statusCategory: 'In Progress',
    type: 'Epic',
    assignee: 'Alice Chen',
    reporter: 'Alice Chen',
    priority: 'High',
    created: '2026-01-02T08:00:00.000+0000',
    updated: '2026-03-25T11:00:00.000+0000',
    description:
      '<p>Full redesign of the component library for Q2 2026: tokens, dark mode, accessibility audit, and Storybook documentation.</p>',
    labels: ['epic', 'design'],
    parentKey: null,
  },
];

const MOCK_ISSUE_MAP = {};
for (const iss of MOCK_ISSUES) MOCK_ISSUE_MAP[iss.key] = iss;

const MOCK_FILTER = {
  id: '10001',
  name: 'Active Sprint',
  description: 'All issues currently in the active sprint',
  jql: 'project = DEMO AND sprint in openSprints()',
  viewUrl: 'https://demo.atlassian.net/issues/?filter=10001',
};

function makeMockIssue(data) {
  const assigneeObj = data.assignee
    ? {
        displayName: data.assignee,
        emailAddress: data.assignee.toLowerCase().replace(' ', '.') + '@demo.com',
        avatarUrls: {},
      }
    : null;
  const parentObj = data.parentKey
    ? {
        key: data.parentKey,
        fields: {
          summary: MOCK_ISSUE_MAP[data.parentKey]?.summary || data.parentKey,
          issuetype: { name: 'Epic' },
        },
      }
    : null;
  return {
    id: String(10000 + parseInt(data.key.split('-')[1] || '1', 10)),
    key: data.key,
    self: 'http://localhost:3000/rest/api/3/issue/' + data.key,
    fields: {
      summary: data.summary,
      status: {
        name: data.status,
        statusCategory: {
          key: data.statusCategory.toLowerCase().replace(/ /g, ''),
          name: data.statusCategory,
        },
      },
      issuetype: { name: data.type, iconUrl: '' },
      assignee: assigneeObj,
      reporter: {
        displayName: data.reporter,
        emailAddress: data.reporter.toLowerCase().replace(' ', '.') + '@demo.com',
      },
      priority: { name: data.priority },
      created: data.created,
      updated: data.updated,
      description: null,
      comment: { comments: [], total: 0 },
      attachment: [],
      labels: data.labels || [],
      parent: parentObj,
    },
    renderedFields: {
      description: data.description || '<p>No description provided.</p>',
      comment: { comments: [] },
    },
  };
}

function makeMockSearchResult(issues) {
  return {
    total: issues.length,
    maxResults: 50,
    startAt: 0,
    issues: issues.map((data) => {
      const full = makeMockIssue(data);
      return {
        id: full.id,
        key: full.key,
        fields: {
          summary: full.fields.summary,
          status: full.fields.status,
          issuetype: full.fields.issuetype,
          assignee: full.fields.assignee,
          reporter: full.fields.reporter,
          created: full.fields.created,
          updated: full.fields.updated,
          parent: full.fields.parent,
        },
      };
    }),
  };
}

function serveMock(req, res, pathname, searchParams) {
  const json = (obj, status = 200) => {
    res.writeHead(status, { ...CORS_HEADERS, 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  // GET /rest/api/3/field
  if (pathname === '/rest/api/3/field') {
    return json([]);
  }

  // GET /rest/api/3/search/jql
  if (pathname === '/rest/api/3/search/jql') {
    const jql = (searchParams.get('jql') || '').toLowerCase();
    let matches = MOCK_ISSUES;
    // Basic status filter
    if (jql.includes('status = "in progress"') || jql.includes("status = 'in progress'")) {
      matches = MOCK_ISSUES.filter((i) => i.statusCategory === 'In Progress');
    } else if (
      jql.includes('status = "to do"') ||
      jql.includes('status = open') ||
      jql.includes("status = 'to do'")
    ) {
      matches = MOCK_ISSUES.filter((i) => i.statusCategory === 'To Do');
    } else if (jql.includes('status = done') || jql.includes('status = "done"')) {
      matches = MOCK_ISSUES.filter((i) => i.statusCategory === 'Done');
    }
    const maxResults = parseInt(searchParams.get('maxResults') || '50', 10);
    return json(makeMockSearchResult(matches.slice(0, maxResults)));
  }

  // GET /rest/api/3/filter/:id
  const filterMatch = pathname.match(/^\/rest\/api\/3\/filter\/(\w+)$/);
  if (filterMatch) {
    return json(MOCK_FILTER);
  }

  // GET /rest/api/3/issue/:key
  const issueMatch = pathname.match(/^\/rest\/api\/3\/issue\/([A-Z]+-\d+)$/i);
  if (issueMatch) {
    const key = issueMatch[1].toUpperCase();
    const data = MOCK_ISSUE_MAP[key];
    if (data) return json(makeMockIssue(data));
    // Generate a plausible issue for any unknown key
    const generated = {
      key,
      summary: 'Investigate and resolve ' + key,
      status: 'Open',
      statusCategory: 'To Do',
      type: 'Task',
      assignee: null,
      reporter: 'Demo User',
      priority: 'Medium',
      created: '2026-01-01T00:00:00.000+0000',
      updated: '2026-03-01T00:00:00.000+0000',
      description: '<p>Auto-generated demo issue for key <strong>' + key + '</strong>.</p>',
      labels: [],
      parentKey: null,
    };
    return json(makeMockIssue(generated));
  }

  res.writeHead(404, { ...CORS_HEADERS, 'content-type': 'application/json' });
  res.end(JSON.stringify({ errorMessages: ['Mock: endpoint not found: ' + pathname], errors: {} }));
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
  'access-control-allow-headers': 'Authorization, Content-Type, Accept, X-Atlassian-Token',
  'access-control-max-age': '86400',
};

function proxyRequest(req, res, targetUrlStr, depth = 0) {
  if (depth > 5) {
    res.writeHead(508);
    res.end('Too many redirects');
    return;
  }

  let target;
  let jiraUrl;
  try {
    target = new URL(targetUrlStr);
    jiraUrl = new URL(JIRA_BASE);
  } catch (e) {
    res.writeHead(400);
    res.end('Bad target URL: ' + e.message);
    return;
  }

  const fwdHeaders = {};
  const skip = new Set([
    'host',
    'origin',
    'referer',
    'connection',
    'upgrade',
    'te',
    'trailer',
    'transfer-encoding',
    'keep-alive',
    'proxy-authorization',
    'proxy-connection',
  ]);

  // CRITICAL FIX: If we are forwarding to a non-Jira API domain (like AWS S3 for attachments
  // or atl-paas.net for avatar CDNs), we MUST strip the Authorization header.
  // Sending Basic Auth to these external CDNs explicitly triggers 400/404 blocks.
  const isJiraApi = target.hostname.includes('atlassian.net');
  if (!isJiraApi) {
    skip.add('authorization');
    skip.add('cookie');
  }

  for (const [k, v] of Object.entries(req.headers)) {
    if (!skip.has(k.toLowerCase())) fwdHeaders[k] = v;
  }
  fwdHeaders['host'] = target.host;

  const options = {
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: target.pathname + target.search,
    method: req.method,
    headers: fwdHeaders,
  };

  const lib = target.protocol === 'https:' ? https : http;

  const proxyReq = lib.request(options, (proxyRes) => {
    if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
      const loc = proxyRes.headers.location.startsWith('http')
        ? proxyRes.headers.location
        : target.origin + proxyRes.headers.location;
      proxyRes.resume();
      proxyRequest(req, res, loc, depth + 1);
      return;
    }

    const outHeaders = { ...CORS_HEADERS };
    const hopByHop = new Set([
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
    ]);
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      if (!hopByHop.has(k.toLowerCase())) outHeaders[k] = v;
    }

    res.writeHead(proxyRes.statusCode, outHeaders);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[proxy error]', err.message);
    if (!res.headersSent) {
      res.writeHead(502, CORS_HEADERS);
    }
    res.end('Proxy error: ' + err.message);
  });

  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
    req.pipe(proxyReq, { end: true });
  } else {
    proxyReq.end();
  }
}

const server = http.createServer((req, res) => {
  const method = req.method.toUpperCase();
  const reqUrl = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(reqUrl.pathname);

  if (method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const jiraHost = req.headers['x-jira-host'] || new URL(JIRA_BASE).host;
  const targetBase = 'https://' + jiraHost;

  // ── /api/jira/* → mock or proxy to primary Jira ──────────────────────────
  if (pathname.startsWith('/api/jira/')) {
    const jiraPath = pathname.slice('/api/jira'.length);
    if (MOCK_MODE) {
      console.log(`[mock] ${method} ${jiraPath}`);
      serveMock(req, res, jiraPath, reqUrl.searchParams);
      return;
    }
    const target = targetBase + jiraPath + reqUrl.search;
    console.log(`[proxy jira] ${method} ${target}`);
    proxyRequest(req, res, target);
    return;
  }

  // ── /rest/* and /s/* → fallback for absolute Jira links in HTML ───────────
  if (pathname.startsWith('/rest/') || pathname.startsWith('/s/')) {
    const target = targetBase + pathname + reqUrl.search;
    console.log(`[proxy auto] ${method} ${target}`);
    proxyRequest(req, res, target);
    return;
  }

  // ── /api/ext/* → generic proxy (for avatars from different domains) ──────
  if (pathname === '/api/ext') {
    const target = reqUrl.searchParams.get('url');
    if (!target) {
      res.writeHead(400, CORS_HEADERS);
      res.end('Missing url parameter');
      return;
    }
    // Only allow absolute URLs
    if (!target.startsWith('http')) {
      res.writeHead(400, CORS_HEADERS);
      res.end('URL must start with http');
      return;
    }
    console.log(`[proxy ext] ${method} ${target}`);
    proxyRequest(req, res, target);
    return;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, CORS_HEADERS);
    res.end('Method not allowed');
    return;
  }

  let relPath = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname + path.sep) && filePath !== __dirname) {
    res.writeHead(403, CORS_HEADERS);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { ...CORS_HEADERS, 'content-type': 'text/plain' });
      res.end('Not found: ' + safePath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { ...CORS_HEADERS, 'content-type': mime, 'cache-control': 'no-cache' });
    res.end(data);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌  Port ${PORT} is already in use.\n`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  if (MOCK_MODE) {
    console.log(`\n✅  Jira Light is running in MOCK MODE!\n`);
    console.log(`   Open in browser: http://localhost:${PORT}`);
    console.log(`   Mock issues:     DEMO-1 … DEMO-10 (any key works)\n`);
    console.log(`   In settings, set Jira URL to http://localhost:${PORT}`);
    console.log(`   Email/token can be anything (e.g. demo@demo.com / demo)\n`);
  } else {
    console.log(`\n✅  Jira Light is running!\n`);
    console.log(`   Open in browser: http://localhost:${PORT}`);
    console.log(`   Internal Jira:   ${JIRA_BASE}\n`);
  }
});
