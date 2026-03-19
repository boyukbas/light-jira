/**
 * Jira Light — Local Proxy Server
 * Forwards API requests to Jira Cloud (avoids browser CORS restrictions).
 *
 * Usage:   node proxy.js
 * Then open: http://localhost:3000
 */

'use strict';

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { URL } = require('url');

const PORT      = parseInt(process.env.PORT || '3000', 10);
const JIRA_BASE = (process.env.JIRA_BASE || 'https://regusit.atlassian.net').replace(/\/$/, '');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const CORS_HEADERS = {
  'access-control-allow-origin':  '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
  'access-control-allow-headers': 'Authorization, Content-Type, Accept, X-Atlassian-Token',
  'access-control-max-age':       '86400',
};

function proxyRequest(req, res, targetUrlStr, depth = 0) {
  if (depth > 5) { res.writeHead(508); res.end('Too many redirects'); return; }

  let target;
  let jiraUrl;
  try { 
    target = new URL(targetUrlStr); 
    jiraUrl = new URL(JIRA_BASE);
  } catch (e) {
    res.writeHead(400); res.end('Bad target URL: ' + e.message); return;
  }

  const fwdHeaders = {};
  const skip = new Set(['host','origin','referer','connection','upgrade','te','trailer','transfer-encoding','keep-alive','proxy-authorization','proxy-connection']);
  
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
    port:     target.port || (target.protocol === 'https:' ? 443 : 80),
    path:     target.pathname + target.search,
    method:   req.method,
    headers:  fwdHeaders,
  };

  const lib = target.protocol === 'https:' ? https : http;

  const proxyReq = lib.request(options, proxyRes => {
    if ([301,302,303,307,308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
      const loc = proxyRes.headers.location.startsWith('http')
        ? proxyRes.headers.location
        : target.origin + proxyRes.headers.location;
      proxyRes.resume();
      proxyRequest(req, res, loc, depth + 1);
      return;
    }

    const outHeaders = { ...CORS_HEADERS };
    const hopByHop = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      if (!hopByHop.has(k.toLowerCase())) outHeaders[k] = v;
    }

    res.writeHead(proxyRes.statusCode, outHeaders);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', err => {
    console.error('[proxy error]', err.message);
    if (!res.headersSent) { res.writeHead(502, CORS_HEADERS); }
    res.end('Proxy error: ' + err.message);
  });

  if (!['GET','HEAD','OPTIONS'].includes(req.method.toUpperCase())) {
    req.pipe(proxyReq, { end: true });
  } else {
    proxyReq.end();
  }
}

const server = http.createServer((req, res) => {
  const method   = req.method.toUpperCase();
  const reqUrl   = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(reqUrl.pathname);

  if (method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // ── /api/jira/* → proxy to primary Jira ──────────────────────────────────
  if (pathname.startsWith('/api/jira/')) {
    const jiraPath = pathname.slice('/api/jira'.length) + reqUrl.search;
    const target   = JIRA_BASE + jiraPath;
    console.log(`[proxy jira] ${method} ${target}`);
    proxyRequest(req, res, target);
    return;
  }

  // ── /api/ext/* → generic proxy (for avatars from different domains) ──────
  if (pathname === '/api/ext') {
    const target = reqUrl.searchParams.get('url');
    if (!target) {
      res.writeHead(400, CORS_HEADERS); res.end('Missing url parameter');
      return;
    }
    // Only allow absolute URLs
    if (!target.startsWith('http')) {
      res.writeHead(400, CORS_HEADERS); res.end('URL must start with http');
      return;
    }
    console.log(`[proxy ext] ${method} ${target}`);
    proxyRequest(req, res, target);
    return;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, CORS_HEADERS); res.end('Method not allowed'); return;
  }

  let relPath = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname + path.sep) && filePath !== __dirname) {
    res.writeHead(403, CORS_HEADERS); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { ...CORS_HEADERS, 'content-type': 'text/plain' });
      res.end('Not found: ' + safePath);
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { ...CORS_HEADERS, 'content-type': mime, 'cache-control': 'no-cache' });
    res.end(data);
  });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌  Port ${PORT} is already in use.\n`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅  Jira Light is running!\n`);
  console.log(`   Open in browser: http://localhost:${PORT}`);
  console.log(`   Internal Jira:   ${JIRA_BASE}\n`);
});
