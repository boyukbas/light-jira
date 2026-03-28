# Light Jira — Roadmap

## Completed

- **Tabbed Interface** — Standalone Notes vs Jira mode
- **Notes Editor UI** — Title, body, dates, auto-save
- **Screenshot Persistence** — Paste images with Ctrl+V into notes
- **Label Intelligence** — Dropdown suggests existing labels, global navigation
- **Full URL Support** — Paste `https://.../browse/KEY` or filter URL to open
- **Button System & Linting** — `.top-btn` design system, stylelint, prettier, check-classes
- **Automated Test Suite** — 26 Playwright E2E tests, all API calls mocked
- **Duplicate Prevention** — Block duplicate tickets within the same group
- **Inline Group Actions** — Rename/Delete icon buttons appear on click
- **Ticket Hierarchy** — Display full parent chain up to Epic/top-level
- **Link Routing** — Linked Jira tickets open inside the app; external button for Jira
- **History Tab** — Full-width grid table with Key, Summary, Status, Assignee, Created, Viewed; sidebar hidden in history mode; view-triggered tracking (no bulk-add from filters)
- **Unified Search Bar** — Single smart input handles ticket keys, filter IDs, JQL, and URLs; button label adapts in real-time
- **Group Rework** — Inbox deletable like any group; colored avatar icons; count pinned to far right; `getDefaultGroup()` fallback replaces hardcoded inbox
- **Load from Filter/JQL** — Create groups from Jira query results (integrated into search bar)

## Backlog

- **Filter Group Refresh** — Reload filter/JQL results in-place without deleting and re-adding the group
- **Mock Atlassian Server** — Develop and test fully offline with simulated API responses
- **Keyboard Navigation** — Arrow keys to navigate ticket list; Enter to open
- **Bulk Actions** — Select multiple tickets and move/label/delete in one action
- **Group Ordering** — Drag to reorder groups in the sidebar
- **Search within Group** — Filter visible tickets in middle pane by keyword
