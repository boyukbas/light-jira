# Light Jira — Backlog

Priority scale: **P1** critical bug · **P2** high-value improvement · **P3** nice-to-have

---

## P1 — Critical Bugs

### B1 · Duplicate event listener on "Add Group" button

**File:** `app.js:338` and `app.js:287–295` (inside `renderSidebar()`)

Two separate registrations exist on `#add-group-btn`:

- `app.js:338` — a top-level `addEventListener('click', ...)` that runs once at startup
- `app.js:287–295` — inside `renderSidebar()`, which sets `addBtn.onclick = ...` on every render

Because `renderSidebar()` is called on every state change, `onclick` gets reassigned repeatedly (harmless), but the persistent `addEventListener` from line 338 also fires on every click. Currently both handlers do the same thing so the dupe is masked — but this is a latent bug: if the two handlers ever diverge, both will fire. The correct fix is to keep only one registration point.

---

### B2 · Race condition in `renderReading()` during fast navigation

**File:** `app.js:667–686`

When a ticket has no cached description, `renderReading()` starts an async `fetchIssue(key)` and returns. The `.then()` callback checks `if (state.activeKey === key)` before re-rendering — but it unconditionally writes `issueCache[key] = data` and calls `renderMiddle()` regardless.

Failure scenario:
1. User clicks PROJ-1 (not cached) → fetch starts
2. Before fetch resolves, user clicks PROJ-2
3. PROJ-1 fetch resolves → writes to `issueCache`, calls `renderMiddle()` mid-navigation
4. `renderMiddle()` re-renders the ticket list with stale context, potentially clearing the active state of PROJ-2

The `renderMiddle()` call inside the `.then()` should be guarded the same way `renderReading()` is.

---

### B3 · Silent error swallowing in history table loading

**File:** `app.js:620–631`

The history loading loop:

```js
uncached.forEach(async (entry) => {
  try {
    await fetchIssue(key);
    ...
  } catch (_) {
    // leave the row as "Loading…" — network may be unavailable
  }
});
```

All errors — including 401 Unauthorized (bad API token), 403 Forbidden, 404, and genuine network failures — are caught and discarded. The row stays "Loading…" forever with no visual distinction. A user with a misconfigured token will see the history table perpetually loading with no actionable feedback. The catch should at minimum check the error type and render a visual error state on the row.

---

## P2 — High-Value Improvements

### U1 · Empty state doesn't distinguish filter groups with zero results

**File:** `app.js:410–414`

When a filter group loads but the JQL returns zero tickets, the middle pane shows the generic empty message:
> "No tickets in this list. Search a key to add one."

This is misleading — the user didn't manually add tickets, the JQL ran and returned nothing. A filter-aware empty state should say something like "Filter returned no results" and show the JQL query. The `group.isFilter` and `group.query` flags are already available on the group object.

---

### U2 · No validation on Jira URL and Proxy URL in settings

**File:** `app.js:1750–1759`

The settings save handler does no validation:

```js
cfg.baseUrl = (document.getElementById('cfg-url').value || DEFAULTS.baseUrl).replace(/\/$/, '');
cfg.proxyUrl = (document.getElementById('cfg-proxy-url').value || '').trim().replace(/\/$/, '');
```

Entering `not a url` silently saves. The first API call then fails with a cryptic `TypeError: Failed to fetch` or `Invalid URL` deep in `fetchIssue()`, with no connection back to the settings field that caused it. A `URL` constructor try/catch on save would let the UI show an inline error immediately.

---

### P1 · History loads all uncached entries with no concurrency limit

**File:** `app.js:620–631`

`forEach(async ...)` fires every `fetchIssue()` call simultaneously. If history has 100 uncached entries, 100 requests fire at once. Browser connection limits (typically 6 per domain) queue the excess, but the Jira API's rate limits apply to the whole burst. This also starves any in-flight fetch for the currently selected ticket.

Fix: process in batches of ~5 using a simple async queue or `Promise.all` over chunks. The existing per-entry `renderHistoryTable()` update pattern can stay — just limit concurrency.

---

### A1 · Settings modal missing ARIA roles and focus management

**File:** `index.html:341–396`, `app.js:1738–1759`

The settings modal overlay has no semantic modal markup:

- No `role="dialog"` — screen readers don't know it's a modal
- No `aria-modal="true"` — background content remains in the accessibility tree
- No `aria-labelledby` pointing at the "Jira Connection" heading
- On open (`app.js:1744`): no `.focus()` call moves focus into the modal
- On close: focus does not return to the `#settings-btn` that opened it
- Tab key escapes the modal into background content

---

### A2 · All icon-only buttons lack `aria-label`

**File:** `index.html:92, 125, 164, 182, 199`

Five buttons use only `title` for their accessible name:

| Element | `title` value |
|---|---|
| `#settings-btn` | "Settings" |
| sidebar collapse button | "Collapse Sidebar" |
| `#middle-collapse-btn` | "Collapse Items" |
| `#bulk-select-btn` | "Select tickets" |
| `#refresh-all-btn` | "Refresh List" |

`title` is a tooltip, not a reliable accessible name — screen readers may or may not announce it depending on browser/reader combination. Each button needs `aria-label` matching the `title` value.

---

### A3 · Note editor `contenteditable` div missing ARIA semantics

**File:** `index.html:314–319`

```html
<div id="note-editor-body" class="note-editor-body" contenteditable="true" ...></div>
```

Missing:
- `role="textbox"` — screen readers don't identify it as an input
- `aria-multiline="true"` — not communicated as multi-line
- `aria-label` or `aria-labelledby` — no accessible name

The toolbar buttons (`B`, `I`, list icons) also have no `aria-label`, relying solely on their visual content.

---

### T1 · No tests for error paths

**File:** `tests/app.spec.js`

Zero tests cover failure scenarios. Specifically missing:

- API 401/403 during `fetchIssue()` — should show error in reading pane, not spinner forever
- Network failure during filter load — should show toast, not silent failure
- Corrupted `localStorage` (malformed JSON) — `loadState()` has a catch but it's untested
- XSS probe: ticket summary containing `<img src=x onerror=alert(1)>` — verify `esc()` is applied

These are the failure modes most likely to affect real users with misconfigured credentials or flaky connections.

---

### T2 · No tests for drag-and-drop and group reordering

**File:** `tests/app.spec.js`; implementation at `app.js:1260–1295`

The group reorder logic (`handleGroupDragStart` / `handleDropToGroup`) and ticket drag between groups are entirely untested. This is one of the more complex code paths — `handleDropToGroup` checks `draggedGroupId` first (reorder) before falling through to `draggedKey` (ticket move). The dual-mode logic has no coverage.

---

## P3 — Code Health & Nice-to-Have

### C1 · History entry dual-format guard repeated 11 times

**File:** `app.js:403, 419, 420, 488, 543, 544, 621, 1338, 1641, 1707, 1726`

History keys can be either plain strings (legacy) or `{ key, added }` objects. The guard:

```js
typeof entry === 'string' ? entry : entry.key
```

appears 11 times across the codebase. Any new code that touches history keys must know to write this guard — it's easy to forget. A single `entryKey(e)` helper would eliminate all 11 occurrences and make new history operations safe by default.

---

### C2 · Inline drag event handlers built via string concatenation

**File:** `app.js:197–215` (group drag handles), `app.js:435–439` (ticket cards)

Six drag handlers are injected as inline strings:

```js
'ondragstart="handleDragStart(event, \'' + esc(key) + '\')"'
'ondragover="handleDragOver(event)"'
'ondrop="handleDropToItem(event, \'' + esc(key) + '\')"'
'ondragleave="handleDragLeave(event)"'
```

While `esc()` is used, this pattern requires the escaping to be applied perfectly on every use. The card click handler already uses `el.dataset.key` + `addEventListener` — the drag handlers could follow the same pattern: set `data-key` on the element and attach drag listeners in the post-render `querySelectorAll` loop.

---

### C3 · Full re-render on every `renderMiddle()` call

**File:** `app.js:392–483`

`renderMiddle()` regenerates the complete `#ticket-list` innerHTML on every call, including when only the active card changes. A user clicking through 10 tickets triggers 10 full list rebuilds. For groups with 50+ tickets this causes measurable layout jank.

The most impactful optimisation: when only `state.activeKey` changes, toggle `.active` directly on the DOM nodes instead of rebuilding. The full rebuild path stays for data changes (refresh, filter, search).

---

### C4 · `prompt()` used for group rename and creation

**File:** `app.js:300–304`, `app.js:338–344`

Group creation and rename use browser `prompt()`. This blocks the main thread, looks out of place in a polished UI, and cannot be tested reliably in Playwright (requires `page.once('dialog', ...)`). An inline edit field on the group name (double-click to edit, Enter/Escape to confirm/cancel) would match the existing inline rename-button pattern and be fully testable.

---
