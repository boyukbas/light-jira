# How to capture store assets

## Screenshots (1280×800, required format for Chrome Web Store)

Open each HTML file below in Chrome. Set the window to exactly 1280×800
(DevTools → device toolbar → custom dimensions), then capture with
DevTools → Screenshot or Cmd/Ctrl+Shift+P → "Capture full size screenshot".

| File | Subject |
|---|---|
| `screenshot-1-workspace.html` | Three-pane workspace — groups + ticket list + reading pane |
| `screenshot-2-search-and-jql.html` | Smart search bar — ticket keys, JQL, filter IDs |
| `screenshot-3-history.html` | History table — sortable, resizable columns |
| `screenshot-4-notes-canvas.html` | Freeform notes canvas with text + diagram blocks |
| `screenshot-5-popup.html` | Jira Beam popup — detect and beam tickets |

## Promo tile (440×280)

Open `promo-tile-440x280.html` in Chrome. Set viewport to 440×280 and capture.

## App icon

The icon is auto-generated from `icon.svg` using Playwright:

```bash
node extension/generate-icons.js
```

Output: `extension/icons/icon16.png`, `icon48.png`, `icon128.png`

The 128×128 PNG is used for the Chrome Web Store listing icon.

## Marquee promo tile (1400×560, optional)

Not included as an HTML file. Use Figma or any design tool to create a
1400×560 graphic with the following layout:

  Left half: Large headline text (see listing-copy.txt → MARQUEE PROMO HEADLINE)
  Right half: screenshot-1-workspace.html rendered at ~50% scale
  Background: dark navy radial gradient matching the screenshot backgrounds (#060b18 → #1e1b4b)
  Accent: amber dot (#fbbf24) echoing the icon's accent colour
