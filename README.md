# Light Jira

**A high-performance, minimalist Jira client built for speed and deep productivity.**

Light Jira is a PWA designed to replace heavy Jira tabs with a streamlined three-pane interface. Organise tickets into custom groups, keep private notes, load from JQL filters, and maintain a history of everything you view — all cached locally for offline access.

---

## Key Features

- **Performance-First** — Pure vanilla JS. No framework overhead, instant loads.
- **Three-Pane Layout** — Sidebar groups → ticket list → reading pane.
- **Grouped Workflow** — Inbox, custom lists, and filter-loaded groups.
- **Filter & JQL Loading** — Paste a filter URL or write JQL to populate a group.
- **Standalone Notes** — A separate note-taking mode with title, body, and screenshots.
- **Label Intelligence** — Tag tickets; click a label to view all tagged tickets.
- **Ticket Hierarchy** — Parent chain displayed up to the top-level Epic.
- **History Tracking** — Every opened ticket is tracked as a sidebar group.
- **Offline Persistence** — All ticket data, notes, and screenshots cached in localStorage.
- **Quick Open (F2)** — Press `F2` to open any ticket by key, URL, or filter.
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

### Configuration
Click the **gear icon** and enter:
- **Email** — your Atlassian account email
- **API Token** — from [Atlassian Security Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
- **Jira URL** — e.g. `https://company.atlassian.net`

### Cloud Deployment (GitHub Pages)
Use the included `lambda_handler.js` + `main.tf` to deploy a CORS-bridging AWS Lambda, then paste the Function URL into **Cloud Proxy URL** in settings.

---

## Development

```bash
npm run lint        # all checks (CSS + classes + format)
npm test            # Playwright E2E tests (26 tests, API mocked)
npm run test:ui     # Playwright with interactive UI
npm run format      # auto-fix formatting
```

---

## Stack

- **Core** — Vanilla JavaScript / HTML5 / CSS3
- **Storage** — `localStorage` (state, cache, screenshots)
- **Proxy** — Node.js `http` module (`proxy.js`)
- **Tests** — Playwright E2E

---

*Light Jira is an unofficial community project, not affiliated with or endorsed by Atlassian. "Jira" is a trademark of Atlassian.*
