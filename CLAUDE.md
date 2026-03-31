# Light Jira — Claude Code Guidelines

## Stack

Chrome Extension (Manifest V3). Vanilla JS / HTML5 / CSS3. No framework, no build step, no bundler. The extension uses `host_permissions` to talk directly to Jira's REST API — no proxy needed.

## Linting (run before committing)

```bash
npm run lint          # all checks
npm run lint:css      # stylelint — CSS quality
npm run lint:classes  # check-classes.js — undefined CSS classes
npm run lint:format   # prettier — formatting
npm run format        # auto-fix formatting
```

## Button system

All buttons use the `.top-btn` class defined in `css/ui.css`. Three variants:

| Class | Use for |
|---|---|
| `.top-btn` | Ghost/secondary — Cancel, Refresh (reading pane) |
| `.top-btn.primary` | Accent fill — Save, Load Filter, destructive confirms |
| `.top-btn.icon-only` | 28×28 icon buttons — Settings, Collapse, Refresh (list header) |

**Rule:** never add a new button without using one of these variants. Never use raw inline styles on buttons.

## CSS conventions

- All class names must be **kebab-case** (e.g. `.lbl-badge`, not `.lblBadge`)
- Every CSS class referenced in HTML or JS **must be defined** in a CSS file. Run `npm run lint:classes` to verify.
- `css/jira-content.css` is exempt from the class-name pattern rule — those selectors target Jira's own HTML payload.
- Avoid duplicate selectors. Stylelint enforces this with `no-duplicate-selectors`.

## CSS file map

| File | Owns |
|---|---|
| `css/base.css` | Variables, reset, scrollbars |
| `css/layout.css` | Topbar, three-pane flex layout, resizer handles |
| `css/sidebar.css` | Group list, add-group button |
| `css/ticket-list.css` | Middle pane, ticket cards, middle-header; history table (`.ht-*`) |
| `css/reading.css` | Right reading pane, ticket notes pane |
| `css/jira-content.css` | Jira description HTML rendering |
| `css/ui.css` | **Button system**, search bar, modals, toasts, badges, forms |
| `css/tabs.css` | Tab bar, history tab layout, notes mode layout, notes editor (toolbar + body) |

## Adding new UI elements

1. Pick the right CSS file from the map above.
2. Define the class there before using it in HTML or JS.
3. Run `npm run lint` to confirm everything is clean.

## State and data model

Key `state` fields (persisted in `localStorage` as `jira_state`):
- `state.groups` — array of group objects `{ id, name, keys[], isFilter?, query? }`
- `state.activeGroupId` — currently selected group id
- `state.activeKey` — currently selected ticket key
- `state.appMode` — `'jira'` | `'labels'` | `'notes'` | `'mindmap'` | `'history'`
- `state.labels` — `{ [ticketKey]: string[] }`
- `state.standAloneNotes` — array of standalone note objects `{ id, title, blocks[], created, updated }`
- `state.activeNoteId` — currently selected note id (notes mode)

Special group ids: `'history'` (always present, never shown in sidebar). History keys are `{key, added}` objects, not plain strings. No group is "special" otherwise — `getDefaultGroup()` finds the first non-history, non-filter group as a safe fallback instead of hardcoding `'inbox'`.

`issueCache` (in-memory, persisted to `localStorage` as `jira_issue_cache`) maps ticket key → Jira API response. Entries from `fetchIssue()` have `renderedFields`; entries from `fetchByJql()` do not. Always check `issue.renderedFields` before assuming a cache entry is complete.

## Rendering pipeline

`updateViewMode()` is the single entry point for all re-renders. Call it after any state change. It:
1. Sets `body[data-app-mode]` and `body[data-active-view]` attributes
2. **jira mode** → `renderSidebar()`, `renderMiddle()`, `renderReading()`
3. **labels mode** → `renderLabelsSidebar()`, `renderLabelsMiddle()`, `renderReading()`
4. **notes mode** → `renderNotesSidebar()`, `renderNoteCanvas()`
5. **mindmap mode** → `renderMindMapSidebar()`, `renderMindMap()`
6. **history mode** → `renderSidebar()`, `renderHistoryTable()`

## JS file map

| File | Responsibility |
|---|---|
| `api.js` | Jira API calls (`fetchIssue`, `fetchByJql`, etc.), config load/save, `HISTORY_LIMIT` |
| `utils.js` | `esc()`, `relDate()`, `avBadge()`, `statusClass()`, `stripHtml()`, `AV_COLORS` |
| `js/state.js` | App state object, `loadState`/`saveState`, group helpers, migrations |
| `js/layout.js` | `updateViewMode()` (master render dispatcher), pane collapse, resizer drag |
| `js/sidebar.js` | Group list rendering, inline create/rename, drag reorder |
| `js/middle.js` | Ticket list rendering (fast-path optimisation), bulk select mode |
| `js/history.js` | History table render, sort, column resize, batch-fetch with per-row error states |
| `js/reading.js` | Slim orchestrator: assembles HTML from builders, calls binders, then `renderHierarchy()` |
| `js/reading-content.js` | Pure HTML builders: `buildLabelsHtml`, `buildMetaGridHtml`, `buildContentHtml`, `buildLinkedIssuesHtml`, `buildCommentsHtml` |
| `js/reading-bindings.js` | DOM binders: `bindReadingHandlers`, `bindCodeCopyButtons`, `bindJiraLinks`, `bindAuthImages`, `renderHierarchy` |
| `js/labels.js` | Label picker modal, `applyLabel`, `removeLabel`, `viewByLabel` |
| `js/labels-tab.js` | Labels tab render functions (`renderLabelsSidebar`, `renderLabelsMiddle`) |
| `js/notes.js` | Notes view: `renderNotesSidebar`, `renderNoteCanvas`, note CRUD |
| `js/notes-canvas.js` | Canvas block builder, drag, image paste/drop, Mermaid inline blocks |
| `js/mindmap.js` | Multi-diagram Mindmap tab, sidebar, Mermaid render loop, pan/zoom |
| `js/drag-drop.js` | All drag-and-drop handlers (tickets and groups) |
| `js/filters.js` | `parseFilterInput`, `runFilterLoad`, `applyFilterGroup` |
| `js/tickets.js` | `openFromHistory`, `loadAllGroupTickets`, ticket move helpers |
| `js/settings.js` | Settings modal: `openCfg`, `initSettings`, validation helpers |
| `js/beam.js` | Jira Beam protocol: `handleBeam`, chrome runtime message listener, `?beam=` URL param |
| `js/init.js` | DOM event wiring, app startup (`init()`) |

## Notes canvas

The notes editor is a freeform infinite canvas (2400×2400 px). Each note contains an array of absolutely-positioned `blocks[]`. Block types: `text`, `image`, `mermaid`. Key helpers in `js/notes-canvas.js`:
- `buildBlock(blk, note)` — creates the `.cb` DOM element for a block
- `addNoteBlock(note, type, x, y, content)` — creates a block object, appends DOM element
- `renderMermaidInBlock(previewEl, code)` — renders Mermaid SVG into a block's preview area
- `handleCanvasPaste` / `handleCanvasDrop` — image paste/drop → `readImageFile` → `addNoteBlock`

Images are stored as data URLs in `screenshotStore` (keyed by `img_xxx` id). The `src` attribute is stripped before saving and restored on load.

## Search bar

The single smart search input (`#search-input`) uses `classifySearchInput(val)` to decide the button label: `"Open"` for ticket keys and browse URLs, `"Load Filter"` for numeric IDs, filter URLs, and JQL. There is no separate filter modal. `F2` focuses this input from anywhere (no modal).

## Filter group visual

Filter groups render a `.g-filter-badge` (funnel SVG icon) instead of the `avBadge` avatar. Normal groups always use `avBadge`. The `g.isFilter` flag drives this in `renderSidebar()`.

## Group ordering

Every group item has a `.g-drag-handle` (6-dot grip icon). Dragging from that handle calls `handleGroupDragStart(event, groupId)`, which sets `draggedGroupId` and clears `draggedKey`. `handleDropToGroup` checks `draggedGroupId` first (reorder groups by splicing `state.groups`) before falling through to the ticket-move path (`draggedKey`).

## Keyboard navigation

`ArrowDown` / `ArrowUp` navigate `state.activeKey` within the active group's key list. Fires only when `state.appMode === 'jira'` and no input/textarea/contenteditable is focused. Scrolls the active card into view after render.

## Group search

`groupSearchQuery` (module-level string) filters the ticket list in `renderMiddle()` by key or summary substring. Bound to `#group-search-input` in `init()`. Cleared when the user switches groups (in the group-click handler inside `renderSidebar()`).

## Bulk select mode

`bulkSelectMode` (module-level boolean) and `selectedKeys` (module-level `Set`) drive multi-selection. `enterBulkMode()` / `exitBulkMode()` toggle the `#middle.bulk-mode` class (which CSS uses to show checkboxes via `::before`/`::after` pseudo-elements) and the `#bulk-toolbar.visible` class. Card clicks in bulk mode toggle `selectedKeys` and call `updateBulkToolbar()` — no full re-render. `renderMiddle()` adds the `.selected` class to pre-selected cards so state survives re-renders. Bulk mode is cleared automatically when switching groups.

## History entry keys

History group keys are `{key, added}` objects; all other groups use plain strings. Always use `entryKey(e)` (defined in `js/state.js`) to extract the plain string — never inline `typeof e === 'string' ? e : e.key`.

## Group inline editing

`startInlineGroupCreate()` (in `js/sidebar.js`) appends a `.group-item-new` row with a `.g-name-input` to the group list. `renameGroup(id)` swaps the `.g-name` span with a `.g-name-input` in-place. Both use a `done` boolean flag to prevent the `blur` handler from committing after keyboard cancel (Escape fires blur, which would otherwise re-save).

## Drag handlers

All `ondragstart`/`ondragover`/`ondrop`/`ondragleave` handlers are attached via `addEventListener` in the post-render `querySelectorAll` loop — not as inline HTML attributes. This matches the pattern used for click handlers. `handleGroupDragStart` guards `e.dataTransfer` before writing `effectAllowed` (synthetic events in tests have null dataTransfer).

## renderMiddle() fast path

When the visible key list hasn't changed, `renderMiddle()` skips the full innerHTML rebuild and only toggles `.active`/`.selected` on existing DOM nodes. Full rebuild still runs for data changes (refresh, filter, search, drag reorder). The comparison uses `Array.from(cards, el => el.dataset.key)` vs `visibleKeys.map(entryKey)`.

## Settings validation

The settings-save handler validates `cfg-url` with `new URL()` before saving. On failure it shows a `.field-error` div and adds `.input-error` to the input. `clearSettingsErrors()` removes both before each save attempt. Focus moves into the modal on open and returns to `#settings-btn` on close.

## Accessibility

All 5 icon-only buttons have `aria-label` matching their `title`. The settings modal has `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="settings-modal-title"`. The note editor `contenteditable` has `role="textbox"`, `aria-multiline="true"`, and `aria-label="Note body"`. All 4 toolbar buttons have `aria-label`.

## Testing (TDD — required)

**Follow TDD for every change**: write a failing test first, then make it pass. Never ship a behaviour change without a corresponding test.

1. Write a test that reproduces the bug or describes the new behaviour — confirm it **fails** before touching production code.
2. Make the minimal code change to turn the test green.
3. Run the full suite (`npm test`) to confirm no regressions.

Tests live in `tests/app.spec.js` and use Playwright with mocked API routes (no real Jira needed). Coverage includes: layout, settings, tickets, filters, groups (inline create/rename/Escape), notes, history, tabs, bulk actions, error paths (401, network abort, corrupted localStorage, XSS, URL validation), and drag-and-drop. Add tests for all new user-facing behaviour.

Use `createGroup(page, name)` helper (defined at the top of the test file) whenever a test needs a second group — it clicks `#add-group-btn`, fills `.g-name-input`, and presses Enter. Never use `page.once('dialog', ...)` for group operations.

To catch JS runtime errors in tests, register a `page.on('pageerror', ...)` listener before triggering the action, then assert the collected errors array.

## Commit discipline

Commit after each logical change. Push only when all changes for a session are complete.
