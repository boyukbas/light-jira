'use strict';

const https = require('https');

const JIRA_BASE = (process.env.JIRA_BASE || 'https://site.atlassian.net').replace(/\/$/, '');

/**
 * AWS Lambda Proxy Handler
 */
exports.handler = async (event) => {
  const method = event.requestContext.http.method;
  const rawPath = event.rawPath;
  const rawQueryString = event.rawQueryString;
  
  // ── Route matching ────────────────────────────────────────────────────────
  let targetPath = '';
  if (rawPath.startsWith('/api/jira/')) {
    targetPath = rawPath.slice('/api/jira'.length);
  } else if (rawPath.startsWith('/rest/') || rawPath.startsWith('/s/')) {
    targetPath = rawPath;
  } else if (rawPath === '/api/ext') {
    const urlParam = event.queryStringParameters?.url;
    if (!urlParam) return { statusCode: 400, body: 'Missing url parameter' };
    return await proxyRequest(method, urlParam, event);
  } else {
    return { statusCode: 404, body: 'Not found: ' + rawPath };
  }

  const targetUrl = JIRA_BASE + targetPath + (rawQueryString ? '?' + rawQueryString : '');
  console.log(`[proxy] ${method} ${targetUrl}`);
  
  return await proxyRequest(method, targetUrl, event);
};

async function proxyRequest(method, targetUrlStr, event) {
  const target = new URL(targetUrlStr);
  const isJiraApi = target.hostname.includes('atlassian.net');

  const fwdHeaders = {};
  const skip = new Set(['host', 'origin', 'referer', 'connection', 'upgrade', 'content-length']);
  
  if (!isJiraApi) {
    skip.add('authorization');
    skip.add('cookie');
  }

  for (const [k, v] of Object.entries(event.headers)) {
    if (!skip.has(k.toLowerCase())) fwdHeaders[k.toLowerCase()] = v;
  }
  fwdHeaders['host'] = target.host;

  const options = {
    hostname: target.hostname,
    port: 443,
    path: target.pathname + target.search,
    method: method,
    headers: fwdHeaders,
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const isBinary = !res.headers['content-type']?.includes('text') && 
                         !res.headers['content-type']?.includes('json') &&
                         !res.headers['content-type']?.includes('javascript');

        const responseHeaders = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (!['transfer-encoding', 'connection', 'content-length'].includes(k.toLowerCase())) {
            responseHeaders[k] = v;
          }
        }

        resolve({
          statusCode: res.statusCode,
          headers: responseHeaders,
          body: buffer.toString(isBinary ? 'base64' : 'utf8'),
          isBase64Encoded: isBinary
        });
      });
    });

    req.on('error', (err) => {
      resolve({ statusCode: 502, body: 'Proxy error: ' + err.message });
    });

    if (event.body) {
      const bodyBuffer = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body);
      req.write(bodyBuffer);
    }
    req.end();
  });
}
