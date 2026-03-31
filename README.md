# Light Jira

**A high-performance, minimalist Jira client built for speed and deep productivity.**

Light Jira is a Chrome Extension that replaces sluggish Jira tabs with a streamlined, keyboard-friendly interface. Organise tickets into custom groups, tag them with labels, take freeform canvas notes, sketch diagrams, load from JQL filters, and maintain a full browsing history — all cached locally for instant offline access.

---

## Table of Contents

1. [Key Features](#key-features)
2. [Getting Started](#getting-started)
3. [App Tabs](#app-tabs)
   - [Jira Tab](#jira-tab)
   - [Labels Tab](#labels-tab)
   - [Notes Tab](#notes-tab)
   - [Mindmap Tab](#mindmap-tab)
   - [History Tab](#history-tab)
4. [Smart Search Bar](#smart-search-bar)
5. [Reading Pane](#reading-pane)
6. [Keyboard Shortcuts](#keyboard-shortcuts)
7. [Configuration](#configuration)
8. [Development](#development)
9. [Architecture](#architecture)
10. [State Model](#state-model)

---

## Key Features

- **Performance-First** — Pure vanilla JS, no framework overhead, instant loads. No bundler, no transpiler.
- **Five-Tab Workspace** — Jira groups, Labels view, freeform Notes canvas, Mermaid Mindmaps, and History table.
- **Smart Search Bar** — Single input handles ticket keys, filter IDs, JQL queries, and Jira URLs. Press `F2` from anywhere to focus instantly.
- **Custom Groups** — Create, rename, reorder (drag), and delete ticket lists. Filter groups (JQL) shown with a funnel badge.
- **Labels System** — Tag tickets with coloured labels. The Labels tab auto-generates groups from your tags. Tickets with no labels appear in a "no-label" bucket.
- **Freeform Notes Canvas** — Click anywhere to place a text block. Drag blocks freely. Paste or drop images. Insert live Mermaid diagrams inline.
- **Mermaid Diagrams** — Full Mermaid v11 support with multiple named diagrams, live preview, copy-to-clipboard, and a refresh button. Pan and zoom the preview.
- **History Tab** — Full-width grid of every ticket you've opened, with Key, Summary, Status, Assignee, Created, and Last Viewed. Sortable and resizable columns.
- **Code Block Copy** — Every code block in a ticket description gets a hover-reveal Copy button.
- **Jira Link Interception** — `/browse/KEY-123` links open inside the app. Ctrl/Cmd+click opens in the browser. User profile links always open externally.
- **Offline Persistence** — Ticket data, notes, screenshots, and state stored in `localStorage`. Works without a connection for already-cached tickets.
- **Jira Beam** — Content script on Jira pages detects ticket keys in the current view and surfaces them in the extension popup for one-click navigation.

---

## Getting Started

### Install the extension

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the repository root folder.
5. Pin the **Light Jira** extension from the toolbar.

### Configure credentials

Click the **gear icon** inside the extension (or the popup), and enter:

| Field | Value |
|---|---|
| Jira URL | `https://yourcompany.atlassian.net` |
| Email | Your Atlassian account email |
| API Token | [Generate here](https://id.atlassian.com/manage-profile/security/api-tokens) |

Click **Save**. The extension connects directly to Jira's REST API using your credentials.

---

## App Tabs

The tab bar lives at the top-right. Tab order: **Jira → Labels → Notes → Mindmap → History**.

### Jira Tab

The core Jira workspace. Three-pane layout:

```
┌──────────────┬────────────────────┬───────────────────────────┐
│   SIDEBAR    │   TICKET LIST      │   READING PANE            │
│              │                    │                           │
│  Groups      │  Cards for active  │  Full ticket details:     │
│  (custom +   │  group, filtered   │  description, comments,   │
│   filter)    │  by search query   │  hierarchy, labels, notes │
└──────────────┴────────────────────┴───────────────────────────┘
```

**Groups (Sidebar)**

- **Create** — Click `+` at the bottom of the sidebar; type a name and press Enter. Press Escape to cancel without creating.
- **Rename** — Click a group to activate it, then click the pencil icon. Edit inline and press Enter to save. Escape cancels.
- **Delete** — Click the trash icon on the active group. Tickets move to History automatically.
- **Reorder** — Drag from the six-dot grip handle. Drop onto another group to move it above.

**Ticket Cards (Middle Pane)**

Each card shows:
- Status badge (colour-coded: green = done, blue = in-progress, grey = todo/backlog)
- Assignee initial badge
- Ticket key (accented) + summary
- Remove button (`✕`)

**Filter Groups**

Enter a filter URL, filter ID, or JQL query in the search bar. The app creates a filter group (funnel icon). Use the refresh button in the list header to reload results in-place.

**Bulk Actions**

Click the checkbox icon in the middle header to enter bulk mode. Cards grow checkboxes. Select any number of tickets, then use the toolbar to:
- **Move** — Select destination group from the dropdown
- **Delete** — Remove all selected tickets from the current group

**Group Search**

Type in the search field inside the ticket list header to filter cards by key or summary. Cleared automatically when you switch groups.

**Keyboard Navigation**

`↑` / `↓` — Move between cards in the active group. Fires only when no input is focused.

---

### Labels Tab

The Labels tab auto-generates groups from the labels you've assigned to tickets. No manual group creation needed.

- **Groups** — One group per unique label, sorted alphabetically. Tickets with no labels appear in a **no-label** group.
- **Ticket count** — Each group shows the number of tickets it contains.
- **Click a group** — The middle pane updates instantly to show that group's tickets.
- **Click a ticket** — Opens it in the reading pane (same as the Jira tab).
- **Assigning labels** — Labels are added in the Jira tab reading pane (label picker button). Once assigned, the Labels tab reflects them immediately.

Labels use the same colour system as label badges: colours are assigned deterministically from a palette and stored in `state.labelColors`.

---

### Notes Tab

A freeform infinite canvas for each standalone note. Multiple notes are managed from the left sidebar.

**Creating and selecting notes**

- Click `+` in the sidebar header to create a new note.
- Click any note in the sidebar to switch to it.
- Notes are ordered most-recently-updated first.
- Click `✕` on a note to delete it (with confirmation).

**Canvas**

The canvas is a large scrollable area (`2400px × 2400px`) with a subtle dot-grid background. Everything on it is an absolutely-positioned, freely draggable block.

**Text blocks**

- Click anywhere on the empty canvas to create a text block at that position.
- Text blocks use `contenteditable` with placeholder text.
- Supports rich formatting via the browser's built-in selection menu (or paste rich text from other apps).
- Drag the six-dot grip handle (top-left of each block) to move it.

**Image blocks**

- **Paste** — Copy an image to your clipboard, click on the canvas, and paste (`Ctrl/Cmd+V`). The image is placed at the bottom of existing content.
- **Drag and drop** — Drop an image file directly onto the canvas. It appears at the drop coordinates.
- Images are stored as data URLs in `screenshotStore` (separate from main state to manage size).

**Mermaid diagram blocks**

- Click the **Diagram** button in the canvas header to insert a Mermaid code block.
- The block shows a code textarea on the left and a live-rendered SVG preview on the right.
- Edit the code; the preview updates after a short debounce (450ms).

**Block operations**

| Action | How |
|---|---|
| Move a block | Drag from the grip handle |
| Delete a block | Click the `✕` button |
| Resize a block | (width set at creation: 400px text, 520px diagrams) |

---

### Mindmap Tab

A Mermaid diagram workspace with a multi-diagram sidebar.

**Sidebar**

- Lists all saved diagrams.
- Click a diagram to make it active.
- `+` button creates a new diagram (pre-filled with a sequence diagram example).
- `✕` on a diagram deletes it (with confirmation).

**Editor + Preview**

- Left: **Diagram Code** textarea with a Refresh button and a Copy button.
- Right: Live SVG preview rendered by Mermaid v11 with pan and zoom controls.

**Pan and Zoom**

- **Scroll** — Zoom in/out at the cursor position.
- **Drag** — Pan the preview canvas.
- **Overlay buttons** — `+` / `-` / reset buttons in the bottom-right corner.

**Supported diagram types**

Any Mermaid diagram type works: `flowchart`, `sequenceDiagram`, `classDiagram`, `stateDiagram`, `erDiagram`, `journey`, `gantt`, `pie`, `gitgraph`, `mindmap`, and more.

---

### History Tab

A full-width table of every ticket you've opened in the app.

- Columns: **Key**, **Summary**, **Status**, **Assignee**, **Created**, **Last Viewed**
- Click a column header to sort; click again to reverse; click a third time to clear sorting.
- Drag column edges to resize.
- Entries are added when a ticket is loaded (not when a filter is imported).
- Click any row to open that ticket in the Jira tab.
- Remove individual entries with the `✕` button on each row.
- History is capped at 150 entries (`HISTORY_LIMIT` in `api.js`).

---

## Smart Search Bar

The single search input at the top handles multiple input types. The button label adapts in real-time:

| Input | Detected As | Button Label | Action |
|---|---|---|---|
| `PROJ-123` | Ticket key | **Open** | Fetches and opens the ticket |
| `https://…/browse/PROJ-123` | Jira browse URL | **Open** | Same as a bare key |
| `12345` (numeric) | Filter ID | **Load Filter** | Loads filter results into current group |
| `https://…/issues/?filter=12345` | Filter URL | **Load Filter** | Same |
| `project = PROJ ORDER BY created DESC` | JQL | **Load Filter** | Runs JQL and creates a filter group |
| `https://…/issues/?jql=…` | JQL URL | **Load Filter** | Extracts and runs the JQL |

**Press `F2`** from anywhere in the app to instantly focus the search bar. **Press `Escape`** to blur it.

---

## Reading Pane

The right pane shows full ticket details when a ticket is selected.

### Layout

```
┌───────────────────────────────────────┐
│  KEY  Title                 [⤢] [↗]  │
│  Status · Assignee                    │
│  Reporter  Labels  (+ add label)      │
├───────────────────────────────────────┤
│  PARENT CHAIN (if epic/story/subtask) │
├───────────────────────────────────────┤
│  DESCRIPTION (rendered HTML)          │
│                                       │
│  LINKED TICKETS (if any)              │
│                                       │
│  COMMENTS                             │
└───────────────────────────────────────┘
```

### Code Blocks

Code blocks (`<pre>`) in the description get a **Copy** button that appears on hover (top-right corner). Click it to copy the code content to the clipboard.

### Jira Links

Links in the ticket description are intercepted intelligently:

- **`/browse/KEY-123`** → opens the ticket inside the app
- **`Ctrl/Cmd + click`** on a browse link → opens in the browser instead
- **User profile links** (`/jira/people/`, `/profile/`) → always open in a new browser tab

### Labels

Click **+ Add Label** to open the label picker. Type a new label name or click an existing suggestion. Existing labels show as coloured badges. Click the `✕` on a badge to remove that label from the ticket.

### Private Notes

The floating notes panel (bottom of the reading pane, toggled with the notepad icon) is a plain textarea for private thoughts attached to the ticket. Notes are local-only and never sent to Jira.

### Parent Hierarchy

If a ticket has a parent (sub-task → story → epic), the hierarchy chain is displayed at the top of the reading pane. Each level is a link that opens the parent in the app.

### Linked Issues

Linked tickets (blocks/is blocked by, relates to, etc.) appear in a section with their type, key, summary, and a link to open in the app or Jira.

---

## Keyboard Shortcuts

| Key | Action | Context |
|---|---|---|
| `F2` | Focus the search bar | Anywhere |
| `↑` / `↓` | Navigate ticket list | Jira tab, no input focused |
| `Enter` | Open ticket / Load filter | Search bar focused |
| `Escape` | Blur search bar | Search bar focused |
| `Ctrl/Cmd + V` | Paste image | Notes canvas |
| `Ctrl/Cmd + click` | Open Jira link in browser | Reading pane links |

---

## Configuration

Click the **gear icon** (top-right) to open Settings.

| Field | Description |
|---|---|
| **Jira URL** | Your instance, e.g. `https://company.atlassian.net` |
| **Email** | Your Atlassian account email |
| **API Token** | [Generate here](https://id.atlassian.com/manage-profile/security/api-tokens) |

Settings are validated: Jira URL must be a valid URL. Errors are shown inline next to the relevant field.

---

## Development

```bash
npm run lint          # all checks (CSS quality + undefined classes + formatting)
npm run lint:css      # stylelint only
npm run lint:classes  # check for undefined CSS classes
npm run lint:format   # prettier check
npm run format        # auto-fix formatting
npm test              # Playwright E2E tests (all API mocked)
npm run test:ui       # Playwright with interactive UI
```

### Test-Driven Development

**All changes follow TDD**: write a failing test first, make it pass, then run the full suite.

1. Write a test that describes the behaviour (it should fail).
2. Make the minimal code change to turn it green.
3. Run `npm test` to confirm no regressions.

Tests live in `tests/app.spec.js` and use Playwright with fully mocked API routes — no real Jira needed.

To catch JS runtime errors in a test, register a `page.on('pageerror', ...)` listener before triggering the action, then assert on the collected errors array.

### Commit Discipline

Commit after each logical change. Push only when all changes for a session are complete.

---

## Architecture

### Stack

| Layer | Technology |
|---|---|
| Extension | Chrome Manifest V3 (`extension/` folder) |
| Front-end | Vanilla JavaScript (ES2020) / HTML5 / CSS3 |
| Storage | `localStorage` (state + issue cache + screenshots) |
| Tests | Playwright E2E |
| Linting | Stylelint + custom class checker + Prettier |

No build step. No framework. No bundler. The extension uses `host_permissions` to call Jira's REST API directly — no proxy server required.

### JS Module Layout

The app is split into focused files loaded via plain `<script>` tags in `index.html`:

| File | Responsibility |
|---|---|
| `api.js` | Jira API calls (`fetchIssue`, `fetchByJql`, `fetchFilter`), config load/save |
| `utils.js` | `esc()`, `relDate()`, `avBadge()`, `statusClass()`, `stripHtml()`, `AV_COLORS` |
| `js/state.js` | App state object, `loadState`/`saveState`, group helpers, migrations |
| `js/layout.js` | `updateViewMode()` (master render dispatcher), pane collapse, resizer drag |
| `js/sidebar.js` | Group list rendering, inline create/rename, drag reorder |
| `js/middle.js` | Ticket list rendering (fast-path optimisation), bulk select mode |
| `js/history.js` | History table render, sort, column resize, batch-fetch with per-row error states |
| `js/reading.js` | Slim orchestrator: assembles reading pane HTML, calls binders |
| `js/reading-content.js` | Pure HTML builders: labels, meta grid, description, linked issues, comments |
| `js/reading-bindings.js` | DOM binders: action handlers, code copy, Jira link interception, auth images, hierarchy |
| `js/labels.js` | Label picker modal, `applyLabel`, `removeLabel`, `viewByLabel` |
| `js/labels-tab.js` | Labels tab render functions (`renderLabelsSidebar`, `renderLabelsMiddle`) |
| `js/notes.js` | Notes view: sidebar, canvas mount, note CRUD |
| `js/notes-canvas.js` | Canvas block builder, drag, image paste/drop, Mermaid inline blocks |
| `js/mindmap.js` | Multi-diagram Mindmap tab, sidebar, Mermaid render loop, pan/zoom |
| `js/drag-drop.js` | All drag-and-drop handlers (tickets and groups) |
| `js/filters.js` | `parseFilterInput`, `runFilterLoad`, `applyFilterGroup` |
| `js/tickets.js` | `openFromHistory`, `loadAllGroupTickets`, ticket move helpers |
| `js/settings.js` | Settings modal: `openCfg`, `initSettings`, validation helpers |
| `js/beam.js` | Jira Beam protocol: popup↔page messaging, `?beam=` URL param processing |
| `js/init.js` | DOM event wiring, app startup (`init()`) |

### CSS File Map

| File | Owns |
|---|---|
| `css/base.css` | Variables, reset, scrollbars |
| `css/layout.css` | Topbar, three-pane flex layout, resizer handles |
| `css/sidebar.css` | Group list, group item, badges, action buttons |
| `css/ticket-list.css` | Middle pane, ticket cards, middle-header; history table (`.ht-*`) |
| `css/reading.css` | Reading pane, ticket details, notes panel |
| `css/jira-content.css` | Jira description HTML rendering, code block copy button |
| `css/ui.css` | Button system (`.top-btn`), search bar, modals, toasts, badges, forms |
| `css/tabs.css` | Tab bar, per-mode layout overrides, Notes canvas, Mindmap pane styles |

### Rendering Pipeline

`updateViewMode()` in `layout.js` is the single entry point for all re-renders:

1. Sets `body[data-app-mode]` and updates the active tab class.
2. Dispatches to the mode-specific render functions:

```
appMode === 'jira'     → renderSidebar() + renderMiddle() + renderReading()
appMode === 'labels'   → renderLabelsSidebar() + renderLabelsMiddle() + renderReading()
appMode === 'notes'    → renderNotesSidebar() + renderNoteCanvas()
appMode === 'mindmap'  → renderMindMapSidebar() + renderMindMap()
appMode === 'history'  → renderSidebar() + renderHistoryTable()
```

CSS `data-app-mode` attribute selectors handle which panes are visible — no JS toggling of `display`.

### Middle Pane Fast Path

`renderMiddle()` has an optimisation: if the visible key list hasn't changed and no "Loading..." card now has cache data, it skips the full `innerHTML` rebuild and only toggles `.active` / `.selected` on existing DOM nodes. Each card carries a `data-cached="true/false"` watermark for this check.

### State Model

All persistent app state lives in a single `state` object, serialised to `localStorage` as `jira_state`:

```js
state = {
  groups: [{ id, name, keys[], isFilter?, query? }],
  activeGroupId: string,
  activeKey: string | null,
  notes: { [ticketKey]: string },          // private per-ticket notes
  labels: { [ticketKey]: string[] },       // assigned labels
  labelColors: { [label]: string },        // label → hex color
  labelsActiveGroup: string | null,        // active label in Labels tab
  layout: { sidebarWidth, middleWidth, notesWidth, sidebarCollapsed, middleCollapsed },
  appMode: 'jira' | 'labels' | 'notes' | 'history' | 'mindmap',
  standAloneNotes: [{ id, title, blocks[], created, updated }],
  activeNoteId: string | null,
  mindMaps: [{ id, name, code }],
  activeMindMapId: string | null,
}
```

Special groups: `'history'` (always present, never shown in sidebar, keys are `{key, added}` objects). All other groups use plain string keys.

`issueCache` is stored separately as `jira_issue_cache`. `screenshotStore` (base64 image data URLs) is stored as `jira_screenshots`.

### State Migrations

`loadState()` automatically migrates old data formats:

- Old single `mindMapCode` string → `mindMaps[0]`
- Old note `body` string → `blocks[]` array (canvas format)
- Old history keys (plain strings) → `{key, added}` objects
- Ensures all required fields exist on old state objects

---

## Avatar Badge System

Avatars are deterministic initial badges — no external image requests.

| Class | Size | Used for |
|---|---|---|
| `.av-sm` | 18 × 18px | Sidebar group initials |
| `.av-rg` | 22 × 22px | Assignee in ticket cards + reading pane |
| `.av-md` | 32 × 32px | Comment author avatars |

Colour is picked from a 10-colour palette (`AV_COLORS`) using `name.length % 10`.

---

## Button System

All interactive controls use the `.top-btn` class from `css/ui.css`. Three variants:

| Class | Use for |
|---|---|
| `.top-btn` | Ghost/secondary — Cancel, Refresh (reading pane) |
| `.top-btn.primary` | Accent fill — Save, Load Filter, destructive confirms |
| `.top-btn.icon-only` | 28×28 icon buttons — Settings, Collapse, Copy, Refresh |

---

*Light Jira is an unofficial community project, not affiliated with or endorsed by Atlassian. "Jira" is a trademark of Atlassian.*
