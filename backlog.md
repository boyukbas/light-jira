# Light Jira — Backlog

Priority scale: **P1** critical bug · **P2** high-value improvement · **P3** nice-to-have

---

*Add new items here as they are discovered. Follow the priority scale and include file references and failure scenarios.*

---

**P2** Lambda CORS proxy — abuse prevention & rate control

**Context:** The Lambda URL is embedded in `api.js` (open source). An attacker who finds it cannot steal Jira data (every real request requires the user's Jira email+token), but can exhaust Lambda invocations through junk calls. At 20 users × ~100 calls/day × 30 days ≈ 60,000/month — only 6% of the 1M free tier under normal load. The attack surface is resource exhaustion, not data breach.

**Recommended layers (in priority order):**

**Layer 1 — AWS Console (free, 5 min) — do first**
- Set Lambda Reserved Concurrency = 10. Caps simultaneous executions; burst DDoS gets throttled (502), not billed.
- Add a CloudWatch alarm: Lambda invocations > 5,000/day → email alert. Gives early warning before free tier runs out.

**Layer 2 — Origin header check in Lambda (free, highest impact)**
Browsers always send an `Origin` header on cross-origin requests; curl/scripts generally don't.
Add to the Lambda handler:
```js
const ALLOWED_ORIGINS = [
  'https://yourdomain.github.io', // wherever the app is deployed
];
const origin = event.headers?.origin || event.headers?.Origin || '';
if (!ALLOWED_ORIGINS.includes(origin)) {
  return { statusCode: 403, body: 'Forbidden' };
}
```
This stops all opportunistic scripts that don't spoof the header. Sophisticated attackers can still set the header manually, but that is a much smaller surface.

**Layer 3 — Static app key header (optional, low-cost deterrent)**
Not a real secret (it lives in JS source), but adds friction for script kiddies who find the URL but don't inspect request headers.
- Client (`api.js` → `commonHeaders()`): add `'X-App-Key': '<random-string>'`
- Lambda: check `event.headers['x-app-key'] === process.env.APP_KEY`; return 403 if wrong.
- Store the key in a Lambda environment variable, not hardcoded in Lambda source.

**Layer 4 — Localhost CORS guard (client-side + Lambda)**
- Lambda: do not include `localhost` or `127.0.0.1` in `Access-Control-Allow-Origin`. Local users should use the local `proxy.js`, not the cloud Lambda.
- Client (`js/init.js` or settings UI): disable/warn on the "Cloud" radio button when `window.location.hostname === 'localhost'` or `window.location.protocol === 'file:'`.

**Decision pending:** Whether to implement Layer 3 (app key) and Layer 4 (localhost guard client-side). Layers 1 and 2 are pure AWS-side changes.
