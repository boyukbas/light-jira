# Light Jira — Backlog

Priority scale: **P1** critical bug · **P2** high-value improvement · **P3** nice-to-have

---

*Add new items here as they are discovered. Follow the priority scale and include file references and failure scenarios.*

---

**P2** Responsive layout — three breakpoint system (wide / medium / narrow)

**Goal:** Make the app usable at any container width so it works natively inside a Chrome Side Panel (~400 px), a narrow browser window, or a small screen — while leaving the existing wide-screen three-pane layout completely unchanged.

---

### Breakpoints

Measured on `#app-body` container width via `ResizeObserver` (not `window` width, so it works inside iframes/side panels automatically):

| Mode | Width | Layout |
|---|---|---|
| **wide** | ≥ 860 px | Three-pane — current behaviour, no change |
| **medium** | 480–859 px | Two-pane — ticket list + reading pane; sidebar becomes an off-canvas drawer |
| **narrow** | < 480 px | One-pane — drill-down: Groups → Tickets → Reading |

`body[data-layout="wide|medium|narrow"]` is the single source of truth for CSS and JS.

---

### A. New state variable — `narrowPaneView`

Module-level string in `js/layout.js`: `'groups' | 'tickets' | 'reading'`
- **Not** persisted to `localStorage` — purely transient UI state
- Helper: `setNarrowPane(view)` sets the variable, sets `body[data-narrow-pane]`, updates `#narrow-context` text, and calls `updateViewMode()`
- Auto-transitions (callers must guard `if (isNarrow())`):
  - Group click (`js/sidebar.js`) → `setNarrowPane('tickets')`
  - Ticket card click (`js/middle.js`) → `setNarrowPane('reading')`
  - Note selected (`js/notes.js`) → `setNarrowPane('reading')`
  - `handleBeam` `open-group` (`js/init.js`) → `setNarrowPane('tickets')`
  - `handleBeam` `open-url` (`js/init.js`) → `setNarrowPane('reading')`
- Mode-specific forced views:
  - `history` mode → force `'tickets'` (table is full-width, no reading pane)
  - `mindmap` mode → force `'reading'` (canvas takes full width)
  - `notes` mode → `'groups'` (note list) / `'reading'` (editor); skip `'tickets'`

---

### B. `js/layout.js` changes

1. **`initResizing()`** — add a `ResizeObserver` on `#app-body` after setting up drag handles:
   - Thresholds: `< 480` → `'narrow'`, `480–859` → `'medium'`, `≥ 860` → `'wide'`
   - Sets `document.body.dataset.layout = mode`
   - Calls `updateViewMode()` on change (debounced with `requestAnimationFrame`)
   - In narrow and medium modes, disable drag-resize mouse handlers to avoid conflicts (guard with `if (document.body.dataset.layout === 'wide')`)

2. **`updateViewMode()`** — after the existing pane-width logic, add:
   - If `data-layout !== 'wide'`: skip applying `state.layout` pixel widths (the CSS takes over)
   - Set `body[data-narrow-pane]` from `narrowPaneView`

3. Add `isNarrow()` and `isMedium()` helper functions checking `body.dataset.layout`.

---

### C. `index.html` additions

1. **Narrow back-nav strip** — inserted as first child of `#app-body`:
   ```html
   <div id="narrow-nav">
     <button id="narrow-back-btn" class="top-btn icon-only" aria-label="Back">
       <!-- left-arrow SVG -->
     </button>
     <span id="narrow-context"></span>
   </div>
   ```
   Hidden via CSS in wide/medium mode; visible in narrow. Context text:
   - `'groups'` → hidden entirely (at root, no back makes sense)
   - `'tickets'` → "← Lists"
   - `'reading'` → "← {active group name}"

2. **Hamburger button** — added to `#topbar` left of the search form (hidden in wide mode):
   ```html
   <button id="hamburger-btn" class="top-btn icon-only" aria-label="Toggle groups">
     <!-- three-line SVG -->
   </button>
   ```

3. **Drawer backdrop** — sibling of `#app-body` at root:
   ```html
   <div id="drawer-backdrop"></div>
   ```

---

### D. `js/init.js` wiring

- `#narrow-back-btn` click:
  - `narrowPaneView === 'reading'` → `setNarrowPane('tickets')`
  - `narrowPaneView === 'tickets'` → `setNarrowPane('groups')`
- `#hamburger-btn` click → toggle `body.dataset.drawerOpen = '1'` (remove to close)
- `#drawer-backdrop` click → remove `body.dataset.drawerOpen`
- After group click in `renderSidebar()` (`js/sidebar.js`): if narrow → `setNarrowPane('tickets')`
- After ticket click in `renderMiddle()` (`js/middle.js`): if narrow → `setNarrowPane('reading')`

---

### E. `css/responsive.css` — new file, all responsive overrides

All rules are scoped to `body[data-layout="narrow"]` or `body[data-layout="medium"]`. **Zero changes to existing CSS files** — this file layers on top, keeping regressions isolated.

**Narrow mode:**
```
body[data-layout="narrow"] #app-body   → flex-direction: column
body[data-layout="narrow"] #narrow-nav → display: flex (hidden otherwise)
body[data-layout="narrow"] #sidebar    → width: 100%; flex-shrink: 0
body[data-layout="narrow"] #middle     → width: 100%; flex-shrink: 0
body[data-layout="narrow"] #reading    → flex: 1; width: 100%
body[data-layout="narrow"] .resizer    → display: none
body[data-layout="narrow"] .collapse-btn → display: none
body[data-layout="narrow"] #logo span  → display: none (keep SVG icon only)
body[data-layout="narrow"] .tab-btn span → display: none (icon-only tabs)
body[data-layout="narrow"] #search-form → collapsed to icon; expands on click
```

Pane visibility driven by `body[data-narrow-pane]`:
```
body[data-layout="narrow"][data-narrow-pane="groups"]  #sidebar → display: flex
body[data-layout="narrow"][data-narrow-pane="groups"]  #middle  → display: none
body[data-layout="narrow"][data-narrow-pane="groups"]  #reading → display: none
(and so on for each combination)
```

Pane transitions — CSS slide (optional, can start with simple show/hide):
```
body[data-layout="narrow"] #sidebar,
body[data-layout="narrow"] #middle,
body[data-layout="narrow"] #reading {
  transition: transform 0.2s ease, opacity 0.15s ease;
}
/* hidden panes slide off left */
```

**Medium mode:**
```
body[data-layout="medium"] #hamburger-btn → display: flex
body[data-layout="medium"] #sidebar →
  position: fixed; left: -100%; top: 0; bottom: 0;
  width: min(75vw, 320px); z-index: 200;
  transition: left 0.2s ease; background: var(--surface);
body[data-layout="medium"][data-drawer-open] #sidebar → left: 0
body[data-layout="medium"] #drawer-backdrop →
  display: none; position: fixed; inset: 0;
  z-index: 199; background: rgba(0,0,0,0.5)
body[data-layout="medium"][data-drawer-open] #drawer-backdrop → display: block
body[data-layout="medium"] #resizer-sidebar → display: none
body[data-layout="medium"] #middle → flex: 0 0 240px; width: 240px
```

---

### F. Topbar adaptations

| Element | Narrow | Medium |
|---|---|---|
| `#logo` SVG | visible | visible |
| `#logo` text "Light Jira" | hidden | visible |
| `#search-form` | collapses to `🔍` icon button; tapping toggles `.search-expanded` which shows the full input as an overlay | visible, slightly narrower |
| `#tab-bar` tab labels | hidden (icon-only) | visible |
| `#hamburger-btn` | hidden (not needed — back nav handles sidebar) | visible |
| `#settings-btn` | visible | visible |

`#search-form` expansion in narrow: add `.search-expanded` class to `body`, which positions the search input absolutely across the full topbar width with a close button.

---

### G. Bulk select in narrow mode

`#bulk-toolbar` is currently fixed to the bottom of `#middle`. In narrow mode it works as-is since `#middle` takes full width. No changes needed.

---

### H. Files changed

| File | Change |
|---|---|
| `css/responsive.css` | **New file** — all responsive CSS |
| `js/layout.js` | ResizeObserver, `narrowPaneView`, `setNarrowPane`, `isNarrow`, `isMedium`, `updateViewMode` guard |
| `js/init.js` | Wire back button, hamburger, drawer backdrop, search expand |
| `js/sidebar.js` | Group click → `setNarrowPane('tickets')` if narrow |
| `js/middle.js` | Ticket card click → `setNarrowPane('reading')` if narrow |
| `js/notes.js` | Note select → `setNarrowPane('reading')` if narrow |
| `index.html` | `#narrow-nav`, `#hamburger-btn`, `#drawer-backdrop` |
| `style.css` | Import `css/responsive.css` |

---

### I. Testing

New Playwright tests (in addition to existing suite which must pass unchanged):
- Narrow: set viewport to 400×800; verify only one pane visible at a time
- Narrow: group click → ticket list pane; ticket click → reading pane; back button chain
- Narrow: `handleBeam` `open-group` → lands on ticket list pane
- Narrow: history tab → full-width table visible
- Medium: viewport 700×800; sidebar hidden by default; hamburger opens drawer; backdrop closes it
- Wide: viewport 1200×800; existing behaviour unchanged (regression guard)

---

**P2** Chrome Side Panel integration *(depends on: responsive layout above)*

**Goal:** Dock Light Jira as a persistent Chrome Side Panel that stays open while you browse Jira — using the responsive layout from the item above.

### How it works

Chrome's `sidePanel` API only serves **extension pages** (i.e. `chrome-extension://` URLs), not arbitrary external URLs directly. So the side panel is a thin extension page containing an `<iframe>` that loads `https://boyukbas.github.io/light-jira/`.

GitHub Pages does **not** set `X-Frame-Options` or a restrictive `frame-ancestors` CSP by default, so the iframe loads without issues. Verify before shipping by checking response headers: `curl -I https://boyukbas.github.io/light-jira/`.

### Cross-origin messaging (iframe ↔ extension page)

The extension side-panel page (`chrome-extension://`) and the iframe (`boyukbas.github.io`) are cross-origin — `executeScript` does not work across this boundary. Communication uses `window.postMessage`:

- Extension side-panel page → iframe: `iframeEl.contentWindow.postMessage(payload, 'https://boyukbas.github.io')`
- App (`js/init.js`) adds a `window.addEventListener('message', ...)` handler alongside the existing `jira-beam` CustomEvent listener; both call `handleBeam(payload)`

The existing Jira Beam popup continues to work: it targets either the side panel tab OR a regular app tab — whichever is found first.

### Files changed

| File | Change |
|---|---|
| `extension/manifest.json` | Add `"side_panel"` permission; add `"side_panel": { "default_path": "side-panel.html" }` |
| `extension/side-panel.html` | **New** — full-height iframe of the app, thin wrapper with reload button |
| `extension/side-panel.css` | **New** — iframe fills 100% of panel, zero margin |
| `extension/popup.js` | Add "Open Side Panel" button logic via `chrome.sidePanel.open({ windowId })` |
| `extension/popup.html` | Add "Open Side Panel" button below "Open App" |
| `js/init.js` | Add `window.addEventListener('message', ...)` to call `handleBeam` from postMessage |

### Acceptance criteria
- Clicking "Open Side Panel" in the popup opens the app in the Chrome side panel docked to the right
- At side-panel width (~400 px), the app is in narrow mode (responsive layout prerequisite)
- Beaming from the popup sends data into the side panel iframe correctly
- The side panel stays open while navigating between Jira pages

---

**P2** Jira Beam — companion Chrome extension

**Name:** Jira Beam
**Location:** `extension/` (load unpacked in Chrome `chrome://extensions`)

**Feature A — Beam current tab to App**
When the user is on any Jira page (*.atlassian.net), the popup shows the current URL and a "Beam to App" button. Clicking it sends an `open-url` payload to the app, which classifies the URL (browse link → ticket key, filter/plan/JQL URL → `runFilterLoad`) and opens it immediately.

**Feature B — Beam issue group to App**
The popup also scans the current Jira page for issue keys (via `/browse/KEY` links and `data-issue-key` attributes). Found keys are listed with checkboxes. The user picks a group name (defaults to page title) and clicks "Beam Group" to create a new group in the app containing the selected keys.

**Communication protocol**
- If the app tab is already open at `http://localhost:3000`: `chrome.scripting.executeScript` with `world: 'MAIN'` dispatches a `jira-beam` CustomEvent on `window` with a `{ type, payload }` detail.
- If the app tab is not open: extension opens `http://localhost:3000/?beam=<base64-JSON>` and the app reads the `?beam=` param at the end of `init()`.
- App-side entry point: `handleBeam(payload)` in `js/init.js`, listening on both `window` event and URL param.

**Manifest V3** — permissions: `tabs`, `scripting`, `activeTab`; host_permissions: `http://localhost:3000/*`, `https://*.atlassian.net/*`.

**Files:** `extension/manifest.json`, `extension/popup.html`, `extension/popup.js`, `extension/popup.css`, `extension/content-jira.js`

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
