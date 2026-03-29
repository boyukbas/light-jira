# Light Jira — Backlog

Priority scale: **P1** critical bug · **P2** high-value improvement · **P3** nice-to-have

---

## P2 — High-Value Improvements

### U2 · No validation on Jira URL and Proxy URL in settings

**File:** `js/init.js` (settings-save handler)

The settings save handler does no validation:

```js
cfg.baseUrl = (document.getElementById('cfg-url').value || DEFAULTS.baseUrl).replace(/\/$/, '');
cfg.proxyUrl = (document.getElementById('cfg-proxy-url').value || '').trim().replace(/\/$/, '');
```

Entering `not a url` silently saves. The first API call then fails with a cryptic `TypeError: Failed to fetch` or `Invalid URL` deep in `fetchIssue()`, with no connection back to the settings field that caused it. A `URL` constructor try/catch on save would let the UI show an inline error immediately.

---

### A1 · Settings modal missing ARIA roles and focus management

**File:** `index.html:341–396`, `js/init.js` (settings open/close handlers)

The settings modal overlay has no semantic modal markup:

- No `role="dialog"` — screen readers don't know it's a modal
- No `aria-modal="true"` — background content remains in the accessibility tree
- No `aria-labelledby` pointing at the "Jira Connection" heading
- On open: no `.focus()` call moves focus into the modal
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

**File:** `index.html:313–318`, `js/notes.js` (`renderNoteEditor` re-creates the DOM)

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

**File:** `tests/app.spec.js`; implementation at `js/drag-drop.js`

The group reorder logic (`handleGroupDragStart` / `handleDropToGroup`) and ticket drag between groups are entirely untested. This is one of the more complex code paths — `handleDropToGroup` checks `draggedGroupId` first (reorder) before falling through to `draggedKey` (ticket move). The dual-mode logic has no coverage.

---

## P3 — Code Health & Nice-to-Have

### C1 · History entry dual-format guard repeated across modules

**Files:** `js/history.js`, `js/middle.js`, `js/tickets.js`, `js/state.js`

History keys can be either plain strings (legacy) or `{ key, added }` objects. The guard:

```js
typeof entry === 'string' ? entry : entry.key
```

appears multiple times across modules. A single `entryKey(e)` helper in `js/state.js` would eliminate all occurrences and make new history operations safe by default.

---

### C2 · Inline drag event handlers built via string concatenation

**File:** `js/sidebar.js` (group drag handles), `js/middle.js` (ticket cards)

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

**File:** `js/middle.js`

`renderMiddle()` regenerates the complete `#ticket-list` innerHTML on every call, including when only the active card changes. A user clicking through 10 tickets triggers 10 full list rebuilds. For groups with 50+ tickets this causes measurable layout jank.

The most impactful optimisation: when only `state.activeKey` changes, toggle `.active` directly on the DOM nodes instead of rebuilding. The full rebuild path stays for data changes (refresh, filter, search).

---

### C4 · `prompt()` used for group rename and creation

**File:** `js/sidebar.js` (`renameGroup`, `renderSidebar` add-group handler)

Group creation and rename use browser `prompt()`. This blocks the main thread, looks out of place in a polished UI, and cannot be tested reliably in Playwright (requires `page.once('dialog', ...)`). An inline edit field on the group name (double-click to edit, Enter/Escape to confirm/cancel) would match the existing inline rename-button pattern and be fully testable.

---
