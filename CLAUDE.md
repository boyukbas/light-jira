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
| `.top-btn` | Ghost/secondary — Filter, Cancel, Notes, Refresh (reading pane) |
| `.top-btn.primary` | Accent fill — Save, Load Tickets, destructive confirms |
| `.top-btn.icon-only` | 28×28 icon buttons — History, Settings, Collapse, Refresh (list header) |

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
| `css/ticket-list.css` | Middle pane, ticket cards, middle-header |
| `css/reading.css` | Right reading pane, notes pane |
| `css/jira-content.css` | Jira description HTML rendering |
| `css/ui.css` | **Button system**, search bar, modals, toasts, badges, forms |
| `css/tabs.css` | Tab bar, notes mode layout, notes list |

## Adding new UI elements

1. Pick the right CSS file from the map above.
2. Define the class there before using it in HTML or JS.
3. Run `npm run lint` to confirm everything is clean.
