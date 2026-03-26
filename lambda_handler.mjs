import https from 'https';
import http from 'http';

const JIRA_BASE_DEFAULT = (process.env.JIRA_BASE || 'https://site.atlassian.net').replace(/\/$/, '');

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || 'GET';
  const rawPath = event.rawPath || '';
  const rawQueryString = event.rawQueryString || '';
  
  const jiraHostHeader = event.headers['x-jira-host'] || event.headers['X-Jira-Host'];
  const targetBase = jiraHostHeader ? 'https://' + jiraHostHeader : JIRA_BASE_DEFAULT;

  let targetPath = '';
  if (rawPath.startsWith('/api/jira')) {
    targetPath = rawPath.replace('/api/jira', '');
  } else if (rawPath.startsWith('/rest/') || rawPath.startsWith('/s/')) {
    targetPath = rawPath;
  } else if (rawPath === '/api/ext') {
    const urlParam = event.queryStringParameters?.url;
    if (!urlParam) return { statusCode: 400, body: 'Missing url parameter' };
    return await proxyRequest(method, urlParam, event, authHeader);
  } else {
    return { statusCode: 404, body: 'Proxy Error: Unhandled Path ' + rawPath };
  }

  targetPath = targetPath.replace(/^\/\//, '/');
  if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;

  const targetUrl = targetBase.replace(/\/$/, '') + targetPath + (rawQueryString ? '?' + rawQueryString : '');
  const authKey = Object.keys(event.headers).find(k => k.toLowerCase() === 'authorization');
  const authHeader = authKey ? event.headers[authKey] : null;

  try {
    return await proxyRequest(method, targetUrl, event, authHeader);
  } catch (err) {
    console.error('Lambda Proxy Error:', err);
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) };
  }
};

async function proxyRequest(method, targetUrlStr, event, authHeader, depth = 0) {
  if (depth > 5) return { statusCode: 508, body: 'Too many redirects' };

  return new Promise((resolve, reject) => {
    const target = new URL(targetUrlStr);
    const isJira = target.hostname.includes('atlassian.net') || target.hostname.includes('atlassian.com');
    
    const fwdHeaders = {};
    const skip = new Set(['host', 'content-length', 'content-encoding', 'transfer-encoding', 'connection', 'accept-encoding', 'upgrade', 'x-jira-host', 'access-control-allow-origin', 'access-control-allow-credentials']);
    if (!isJira) skip.add('authorization'); // Security: Don't leak credentials to S3/External

    for (const [k, v] of Object.entries(event.headers)) {
        if (!skip.has(k.toLowerCase())) fwdHeaders[k] = v;
    }
    fwdHeaders['host'] = target.host;
    fwdHeaders['accept-encoding'] = 'identity';
    if (authHeader && isJira) fwdHeaders['Authorization'] = authHeader;

    const lib = target.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: target.pathname + target.search,
      method: method,
      headers: fwdHeaders,
      timeout: 15000 
    }, (res) => {
      // Handle Redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : target.origin + res.headers.location;
        proxyRequest(method, loc, event, authHeader, depth + 1).then(resolve).catch(reject);
        return;
      }

      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const ct = res.headers['content-type'] || '';
        const isBinary = !ct.includes('text') && !ct.includes('json') && !ct.includes('javascript');
        
        const resHeaders = {};
        for (const [k, v] of Object.entries(res.headers)) {
            if (!skip.has(k.toLowerCase())) resHeaders[k] = v;
        }
        
        resolve({
          statusCode: res.statusCode,
          headers: resHeaders,
          body: buffer.toString(isBinary ? 'base64' : 'utf8'),
          isBase64Encoded: isBinary
        });
      });
    });

    req.on('error', (e) => reject(e));
    if (event.body) req.write(event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body));
    req.end();
  });
}
