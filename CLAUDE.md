# Light Jira — Claude Code Guidelines

## Stack

Vanilla JS / HTML5 / CSS3. No framework, no build step. Node.js proxy only for CORS.

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
- `state.appMode` — `'jira'` | `'notes'` | `'history'`
- `state.labels` — `{ [ticketKey]: string[] }`
- `state.standAloneNotes` — array of standalone note objects `{ id, title, body, created, updated }`
- `state.activeNoteId` — currently selected note id (notes mode)

Special group ids: `'history'` (always present, never shown in sidebar). History keys are `{key, added}` objects, not plain strings. No group is "special" otherwise — `getDefaultGroup()` finds the first non-history, non-filter group as a safe fallback instead of hardcoding `'inbox'`.

`issueCache` (in-memory, persisted to `localStorage` as `jira_issue_cache`) maps ticket key → Jira API response. Entries from `fetchIssue()` have `renderedFields`; entries from `fetchByJql()` do not. Always check `issue.renderedFields` before assuming a cache entry is complete.

## Rendering pipeline

`updateViewMode()` is the single entry point for all re-renders. Call it after any state change. It:
1. Sets `body[data-app-mode]` and `body[data-active-view]` attributes
2. **jira mode** → `renderSidebar()`, `renderMiddle()`, `renderReading()`
3. **notes mode** → `renderNotesSidebar()`, `renderNoteEditor()`
4. **history mode** → `renderSidebar()`, `renderHistoryTable()`

## Notes editor

The notes editor uses a `contenteditable` div (`#note-editor-body`, class `.note-editor-body`) — not a textarea. Images are pasted/dropped inline as `<img data-img-id="img_xxx">` elements; their `src` is stripped before saving and restored from `screenshotStore` on load. Key helpers:
- `noteBodyToHtml(body)` — migrates old plain-text / `![screenshot](img_xxx)` format to HTML on load
- `serializeEditorBody(el)` — clones the editor, strips `src` attributes, returns innerHTML for storage
- `resolveImages(el)` — sets `src` on all `img[data-img-id]` elements from `screenshotStore`

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

## Mock server

`proxy.js` supports `MOCK=1` env var (or `--mock` CLI flag). When active, `/api/jira/rest/api/3/*` requests are intercepted by `serveMock()` — no real Jira is needed. Ten pre-built `DEMO-*` issues are defined in `MOCK_ISSUES`; any other key generates a placeholder. Start with `npm run mock`. In the browser, set Jira URL to `http://localhost:3000` with any email/token.

## Testing

Run `npm test` after any change to confirm no regressions. Tests live in `tests/app.spec.js` and use Playwright with mocked API routes (no real Jira needed). 31 tests covering layout, settings, tickets, filters, groups, notes, history, tabs, and bulk actions. Add tests for new user-facing behaviour.

## Commit discipline

Commit after each logical change. Push only when all changes for a session are complete.
