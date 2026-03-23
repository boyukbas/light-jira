import https from 'https';

// Fallback if header is missing
const JIRA_BASE_DEFAULT = (process.env.JIRA_BASE || 'https://site.atlassian.net').replace(/\/$/, '');

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || 'GET';
  const rawPath = event.rawPath || '';
  const rawQueryString = event.rawQueryString || '';
  
  // 1. Determine target host
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
    return await proxyRequest(method, urlParam, event, null);
  } else {
    return { statusCode: 404, body: 'Proxy Error: Unhandled Path ' + rawPath };
  }

  targetPath = targetPath.replace(/^\/\//, '/');
  if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;

  const targetUrl = targetBase.replace(/\/$/, '') + targetPath + (rawQueryString ? '?' + rawQueryString : '');
  
  // Find authorization header
  const authKey = Object.keys(event.headers).find(k => k.toLowerCase() === 'authorization');
  const authHeader = authKey ? event.headers[authKey] : null;

  try {
    return await proxyRequest(method, targetUrl, event, authHeader);
  } catch (err) {
    console.error('Lambda Proxy Error:', err);
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) };
  }
};

async function proxyRequest(method, targetUrlStr, event, authHeader) {
  return new Promise((resolve, reject) => {
    const target = new URL(targetUrlStr);
    const fwdHeaders = {};
    const skip = new Set(['host', 'content-length', 'content-encoding', 'transfer-encoding', 'connection', 'accept-encoding', 'upgrade', 'x-jira-host']);
    
    for (const [k, v] of Object.entries(event.headers)) {
        if (!skip.has(k.toLowerCase())) {
            fwdHeaders[k] = v;
        }
    }
    fwdHeaders['host'] = target.host;
    fwdHeaders['accept-encoding'] = 'identity';
    if (authHeader) fwdHeaders['Authorization'] = authHeader;

    const req = https.request({
      hostname: target.hostname,
      path: target.pathname + target.search,
      method: method,
      headers: fwdHeaders,
      timeout: 15000 
    }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const ct = res.headers['content-type'] || '';
        const isBinary = !ct.includes('text') && !ct.includes('json') && !ct.includes('javascript');
        
        const resHeaders = {};
        for (const [k, v] of Object.entries(res.headers)) {
            if (!skip.has(k.toLowerCase())) {
                resHeaders[k] = v;
            }
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
