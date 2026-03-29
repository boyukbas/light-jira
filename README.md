# Light Jira

**A high-performance, minimalist Jira client built for speed and deep productivity.**

Light Jira is a PWA designed to replace heavy Jira tabs with a streamlined three-pane interface. Organise tickets into custom groups, keep private notes, load from JQL filters, and maintain a full browsing history — all cached locally for offline access.

---

## Key Features

- **Performance-First** — Pure vanilla JS. No framework overhead, instant loads.
- **Three-Pane Layout** — Sidebar groups → ticket list → reading pane.
- **Smart Search Bar** — Single input handles ticket keys, filter IDs, JQL queries, and Jira URLs. Button label adapts in real-time: `Open` vs `Load Filter`. Press `F2` from anywhere to focus it instantly.
- **Flexible Groups** — Create, rename, and delete custom lists. Any group (including Inbox) can be deleted; its tickets move to History automatically. Drag the grip handle to reorder groups.
- **Filter & JQL Loading** — Paste a filter URL, enter a filter ID, or write raw JQL to populate a group. Filter groups are visually distinct (funnel badge) and always open tickets with full detail.
- **Filter Group Refresh** — Reload a filter/JQL group in-place with the refresh button. Results update without deleting and re-adding the group.
- **Bulk Actions** — Enter select mode to check multiple tickets, then move them to another group or delete them in one action.
- **Search within Group** — Inline keyword filter in the ticket list; matches key and summary.
- **Keyboard Navigation** — Arrow up/down moves through the ticket list without touching the mouse.
- **History Tab** — Full-width grid table of every ticket you've viewed, with Status, Assignee, Created, and Last Viewed columns. Populated only when a ticket is actually opened — filter loads don't pollute it.
- **Rich Notes** — A separate note-taking mode with title, formatting toolbar (bold, italic, lists), inline image paste/drag-drop, and auto-save. Text and images flow together naturally.
- **Label Intelligence** — Tag tickets; click a label to view all tickets with that label.
- **Ticket Hierarchy** — Parent chain displayed up to the top-level Epic.
- **Linked Tickets** — Linked issues open inside the app; external Jira link available per ticket.
- **Offline Persistence** — All ticket data, notes, and screenshots cached in localStorage.
- **PWA Ready** — Install as a desktop or mobile app.

---

## Getting Started

### Prerequisites
- Node.js (for the local CORS proxy)

### Run locally
```bash
git clone https://github.com/boyukbas/light-jira.git
cd light-jira
npm install
node proxy.js
```
Open `http://localhost:3000` and configure via the gear icon.

### Run in mock mode (no Jira account needed)
```bash
npm run mock
```
Open `http://localhost:3000`, click the gear icon, and set:
- **Jira URL** → `http://localhost:3000`
- **Email / API Token** → anything (e.g. `demo@demo.com` / `demo`)

Ten pre-built demo tickets (`DEMO-1` … `DEMO-10`) are available. Any other key you type will also return a generated placeholder issue.

### Configuration
Click the **gear icon** and enter:
- **Email** — your Atlassian account email
- **API Token** — from [Atlassian Security Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
- **Jira URL** — e.g. `https://company.atlassian.net`

### Cloud Deployment (GitHub Pages)
Use the included `lambda_handler.mjs` + `main.tf` to deploy a CORS-bridging AWS Lambda, then paste the Function URL into **Cloud Proxy URL** in settings.

---

## Development

```bash
npm run lint        # all checks (CSS + class names + formatting)
npm test            # Playwright E2E tests (31 tests, all API calls mocked)
npm run test:ui     # Playwright with interactive UI
npm run format      # auto-fix formatting
npm run mock        # start server with mock Atlassian API (no real Jira needed)
```

---

## Stack

- **Core** — Vanilla JavaScript / HTML5 / CSS3 (no build step, no framework)
- **Storage** — `localStorage` (state, issue cache, screenshots)
- **Proxy** — Node.js `http` module (`proxy.js`) or AWS Lambda (`lambda_handler.mjs`)
- **Tests** — Playwright E2E

### JS module layout

The app is split into 12 focused files loaded via plain `<script>` tags:

| File | Responsibility |
|---|---|
| `api.js` | Jira API calls, config, auth |
| `utils.js` | `esc()`, `relDate()`, `avBadge()`, `normalise()`, constants |
| `js/state.js` | App state, `loadState`/`saveState`, group helpers |
| `js/layout.js` | `updateViewMode`, pane collapse, resizer drag |
| `js/sidebar.js` | Group list rendering, rename, delete |
| `js/middle.js` | Ticket list, bulk select mode |
| `js/history.js` | History table, batch-fetch with error states |
| `js/reading.js` | Ticket detail pane, hierarchy, auth images |
| `js/labels.js` | Label picker, apply, remove, viewByLabel |
| `js/notes.js` | Standalone notes editor, rich text |
| `js/drag-drop.js` | All drag-and-drop handlers |
| `js/filters.js` | JQL/filter load logic |
| `js/tickets.js` | Open ticket, move, history helpers |
| `js/init.js` | DOM event wiring, app startup |

---

*Light Jira is an unofficial community project, not affiliated with or endorsed by Atlassian. "Jira" is a trademark of Atlassian.*
