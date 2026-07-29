// @ts-check
// Tests for the toolbar popup (extension/popup.html). The popup is normally
// driven by chrome.* extension APIs that don't exist in a plain page, so we
// inject a configurable `chrome` stub via addInitScript before the popup's
// own scripts run, then drive the DOM and assert on the recorded calls.
const { test, expect } = require('@playwright/test');

// Serializable stub installed in the page BEFORE popup.js executes. Records the
// side-effecting calls (beams, window/tab creation, close) on window.__calls.
function installChromeStub(cfg) {
  window.__calls = {
    beams: [],
    windowsCreated: [],
    tabsCreated: [],
    sendMessage: [],
    extracted: [], // tab ids asked for keys — proves which window was scanned
    closed: false,
  };
  const store = {
    sync: { crisp_groups: cfg.groups, crisp_prefs: cfg.prefs },
    local: { jira_issue_cache: cfg.issueCache || {} },
  };
  const pick = (bag, key) => {
    const keys = Array.isArray(key) ? key : [key];
    const out = {};
    for (const k of keys) if (bag[k] !== undefined) out[k] = bag[k];
    return out;
  };
  window.chrome = {
    runtime: {
      id: 'testid',
      getURL: (p) => `chrome-extension://testid/${p}`,
      sendMessage: (m) => {
        window.__calls.sendMessage.push(m);
        if (m && m.type === 'beam') window.__calls.beams.push(m.payload);
      },
      onMessage: { addListener: () => {} },
    },
    tabs: {
      query: async (q) => {
        if (q.url && q.url.includes('index.html')) return cfg.appTab ? [cfg.appTab] : [];
        if (q.url && q.url.includes('atlassian.net')) {
          const all = cfg.atlassianTabs || [];
          // Honour currentWindow so window-scoped beaming can be tested. A tab
          // with no windowId counts as being in the current window, which keeps
          // pre-existing fixtures working unchanged.
          if (!q.currentWindow) return all;
          const cw = cfg.currentWindowId === undefined ? 1 : cfg.currentWindowId;
          return all.filter((t) => t.windowId === undefined || t.windowId === cw);
        }
        if (q.active) return cfg.currentTab ? [cfg.currentTab] : [];
        return [];
      },
      update: async () => {},
      create: async (o) => {
        window.__calls.tabsCreated.push(o);
      },
      sendMessage: async (tabId, msg) => {
        if (msg && msg.type === 'extract-keys') {
          window.__calls.extracted.push(tabId);
          return cfg.extractResponse || { keys: [], tickets: [] };
        }
        return null;
      },
    },
    windows: {
      create: async (o) => {
        window.__calls.windowsCreated.push(o);
      },
      update: async () => {},
    },
    storage: {
      sync: { get: async (key) => pick(store.sync, key) },
      local: { get: async (key) => pick(store.local, key) },
    },
  };
  // Popups close themselves after acting; record instead of (uselessly) closing.
  window.close = () => {
    window.__calls.closed = true;
  };
}

const HISTORY = (keys) => ({ id: 'history', name: 'History', keys });

// Navigate to the popup with a given stub config, then wait until init() has
// finished wiring (it focuses the quick-open input as its last always-run step).
async function openPopup(page, cfg) {
  await page.addInitScript(installChromeStub, cfg);
  await page.goto('/extension/popup.html');
  await page.waitForFunction(
    () => document.activeElement && document.activeElement.id === 'quick-open-input'
  );
}

test.describe('Popup — quick open', () => {
  test('typing a key and clicking Open beams it as an open-url payload', async ({ page }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com', title: 'Example' },
      groups: [HISTORY([])],
      prefs: { openInWindow: true },
    });

    await page.fill('#quick-open-input', 'TTN-116061');
    await page.click('#quick-open-btn');

    await expect.poll(() => page.evaluate(() => window.__calls.windowsCreated.length)).toBe(1);

    const payload = await page.evaluate(() => {
      const url = window.__calls.windowsCreated[0].url;
      const b64 = new URL(url).searchParams.get('beam');
      return JSON.parse(
        new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
      );
    });
    expect(payload).toEqual({ type: 'open-url', url: 'TTN-116061' });
  });

  test('Enter in the quick-open input opens too', async ({ page }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [HISTORY([])],
      prefs: { openInWindow: false }, // tab, not window
    });

    await page.fill('#quick-open-input', 'project = FOO ORDER BY created');
    await page.locator('#quick-open-input').press('Enter');

    await expect.poll(() => page.evaluate(() => window.__calls.tabsCreated.length)).toBe(1);
    const url = await page.evaluate(() => window.__calls.tabsCreated[0].url);
    expect(url).toContain('?beam=');
  });
});

test.describe('Popup — recents', () => {
  test('recent tickets render (newest first, with cached titles) off a Jira page', async ({
    page,
  }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [
        HISTORY([
          { key: 'AAA-1', added: 10 },
          { key: 'BBB-2', added: 30 },
          { key: 'CCC-3', added: 20 },
        ]),
      ],
      issueCache: {
        'BBB-2': { fields: { summary: 'Newest thing' } },
        'AAA-1': { fields: { summary: 'Oldest thing' } },
      },
      prefs: {},
    });

    await expect(page.locator('#section-recent')).toBeVisible();
    const rows = page.locator('#recent-list li');
    await expect(rows).toHaveCount(3);
    // Sorted by `added` desc: BBB-2 (30), CCC-3 (20), AAA-1 (10)
    await expect(rows.nth(0).locator('.key-label')).toHaveText('BBB-2');
    await expect(rows.nth(0).locator('.key-title')).toHaveText('Newest thing');
    await expect(rows.nth(2).locator('.key-label')).toHaveText('AAA-1');
  });

  test('clicking a recent row beams that key', async ({ page }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [HISTORY([{ key: 'AAA-1', added: 10 }])],
      prefs: { openInWindow: true },
    });

    await page.locator('#recent-list li').first().click();
    await expect.poll(() => page.evaluate(() => window.__calls.windowsCreated.length)).toBe(1);
    const payload = await page.evaluate(() => {
      const b64 = new URL(window.__calls.windowsCreated[0].url).searchParams.get('beam');
      return JSON.parse(
        new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
      );
    });
    expect(payload).toEqual({ type: 'open-url', url: 'AAA-1' });
  });

  test('empty history shows the hint, not a recents list', async ({ page }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [HISTORY([])],
      prefs: {},
    });
    await expect(page.locator('#section-hint')).toBeVisible();
    await expect(page.locator('#section-recent')).toBeHidden();
  });
});

test.describe('Popup — feedback & a11y', () => {
  // Beam All walks the window's tabs and takes the ONE ticket each tab is sitting
  // on, read from its URL. No content-script round-trip, so it also works on tabs
  // opened before the extension was last reloaded.
  const ticketTab = (id, key, windowId) => ({
    id,
    windowId,
    url: `https://site.atlassian.net/browse/${key}`,
    title: `${key} Something happened - Jira`,
  });

  test('Jira tabs that are not issue pages leave nothing to beam', async ({ page }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [HISTORY([])],
      prefs: {},
      // Jira tabs are open, but a dashboard and a board are not tickets — so the
      // user is told up front rather than clicking and getting an error.
      atlassianTabs: [
        { id: 10, url: 'https://site.atlassian.net/jira/dashboards/1' },
        { id: 11, url: 'https://site.atlassian.net/jira/software/projects/X/boards/2' },
      ],
    });

    await expect(page.locator('#beam-all-btn')).toBeDisabled();
    await expect(page.locator('#beam-all-btn')).toContainText(/no ticket tabs/i);
  });

  test('a beam that finds nothing mid-flight reports it instead of closing', async ({ page }) => {
    // Race guard: the tabs counted when the popup opened can be closed before the
    // click lands. Drive beamAllJiraTabs directly, since the button is by then
    // (correctly) disabled in every reachable UI state.
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [HISTORY([])],
      prefs: {},
      atlassianTabs: [{ id: 10, url: 'https://site.atlassian.net/browse/GONE-1' }],
    });

    await page.evaluate(() => {
      chrome.tabs.query = async () => []; // every ticket tab went away
      return beamAllJiraTabs(null);
    });

    await expect(page.locator('#popup-msg')).toBeVisible();
    await expect(page.locator('#popup-msg')).toContainText(/ticket tabs/i);
    expect(await page.evaluate(() => window.__calls.closed)).toBe(false);
    expect(await page.evaluate(() => window.__calls.windowsCreated.length)).toBe(0);
  });

  test('Beam All is disabled when the active window has no Jira tabs', async ({ page }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [HISTORY([])],
      prefs: {},
      atlassianTabs: [],
    });

    const btn = page.locator('#beam-all-btn');
    await expect(btn).toBeDisabled();
    await expect(btn).toContainText(/no ticket tabs/i);
  });

  test('Beam All label counts the ticket tabs in the active window only', async ({ page }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [HISTORY([])],
      prefs: {},
      currentWindowId: 1,
      // 2 ticket tabs here, 1 in another window, plus a board that is not a ticket.
      atlassianTabs: [
        ticketTab(10, 'AAA-1', 1),
        ticketTab(11, 'AAA-2', 1),
        { id: 12, windowId: 1, url: 'https://site.atlassian.net/jira/software/boards/3' },
        ticketTab(99, 'ZZZ-9', 2),
      ],
    });

    await expect(page.locator('#beam-all-btn')).toContainText('2');
    await expect(page.locator('#beam-all-btn')).toBeEnabled();
  });

  test('Beam All takes one ticket per tab and skips non-ticket tabs', async ({ page }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [HISTORY([])],
      prefs: { openInWindow: true },
      currentWindowId: 1,
      atlassianTabs: [
        ticketTab(10, 'AAA-1', 1),
        ticketTab(11, 'AAA-2', 1),
        ticketTab(12, 'AAA-1', 1), // same ticket open twice — must dedupe
        { id: 13, windowId: 1, url: 'https://site.atlassian.net/jira/dashboards/1' },
      ],
    });

    await page.click('#beam-all-btn');
    await expect.poll(() => page.evaluate(() => window.__calls.windowsCreated.length)).toBe(1);
    const payload = await decodeLastWindowBeam(page);
    expect(payload.keys).toEqual(['AAA-1', 'AAA-2']);
    // Proves the collection is URL-based: no tab was asked to extract keys.
    expect(await page.evaluate(() => window.__calls.extracted)).toEqual([]);
  });

  test('Beam All only collects tabs from the active window', async ({ page }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [HISTORY([])],
      prefs: { openInWindow: true },
      currentWindowId: 1,
      atlassianTabs: [ticketTab(10, 'AAA-1', 1), ticketTab(99, 'ZZZ-9', 2)],
    });

    await page.click('#beam-all-btn');
    await expect.poll(() => page.evaluate(() => window.__calls.windowsCreated.length)).toBe(1);
    const payload = await decodeLastWindowBeam(page);
    expect(payload.keys).toEqual(['AAA-1']);
  });

  test('an opt-in link beams Jira tabs from other windows too', async ({ page }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [HISTORY([])],
      prefs: { openInWindow: true },
      currentWindowId: 1,
      atlassianTabs: [ticketTab(10, 'AAA-1', 1), ticketTab(99, 'ZZZ-9', 2)],
    });

    const link = page.locator('#beam-all-windows-btn');
    await expect(link).toBeVisible();
    await expect(link).toContainText('1');

    await link.click();
    await expect.poll(() => page.evaluate(() => window.__calls.windowsCreated.length)).toBe(1);
    const payload = await decodeLastWindowBeam(page);
    expect(payload.keys.sort()).toEqual(['AAA-1', 'ZZZ-9']);
  });

  test('the other-windows link stays hidden when every Jira tab is in this window', async ({
    page,
  }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [HISTORY([])],
      prefs: {},
      currentWindowId: 1,
      atlassianTabs: [ticketTab(10, 'AAA-1', 1)],
    });

    await expect(page.locator('#beam-all-windows-btn')).toBeHidden();
  });

  test('Select-all is a real <button>, not an anchor', async ({ page }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 5, url: 'https://regusit.atlassian.net/browse/X-1', title: 'X-1 thing' },
      groups: [HISTORY([])],
      prefs: {},
      extractResponse: { keys: ['X-1'], tickets: [{ key: 'X-1', title: 'A thing' }] },
    });

    await expect(page.locator('#section-keys')).toBeVisible();
    const tag = await page.locator('#select-all-link').evaluate((el) => el.tagName);
    expect(tag).toBe('BUTTON');
  });
});

test.describe('Popup — window sizing', () => {
  test('computeAppWindowBounds is centred and capped for small and large screens', async ({
    page,
  }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [HISTORY([])],
      prefs: {},
    });

    // Small laptop: scales down (never exceeds the screen), centred.
    const small = await page.evaluate(() => computeAppWindowBounds(1366, 768));
    expect(small.width).toBeLessThanOrEqual(1366);
    expect(small.height).toBeLessThanOrEqual(768);
    expect(small.left).toBe(Math.round((1366 - small.width) / 2));
    expect(small.top).toBe(Math.round((768 - small.height) / 2));

    // Large monitor: capped at the max, still centred.
    const large = await page.evaluate(() => computeAppWindowBounds(3840, 2160));
    expect(large.width).toBe(1600);
    expect(large.height).toBe(1000);
    expect(large.left).toBe(Math.round((3840 - 1600) / 2));
  });
});

// Decode the beam payload of the most recently created app window.
const decodeLastWindowBeam = (page) =>
  page.evaluate(() => {
    const b64 = new URL(window.__calls.windowsCreated[0].url).searchParams.get('beam');
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  });

test.describe('Popup — issue-page primary action (B1)', () => {
  test('on a /browse/KEY page the button opens that ticket by key', async ({ page }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: {
        id: 5,
        url: 'https://regusit.atlassian.net/browse/TTN-116061',
        title: 'TTN-116061 A thing',
      },
      groups: [HISTORY([])],
      prefs: { openInWindow: true },
      extractResponse: { tickets: [{ key: 'TTN-116061', title: 'A thing' }] },
    });

    await expect(page.locator('#beam-url-btn')).toHaveText('Open TTN-116061');
    await page.click('#beam-url-btn');
    await expect.poll(() => page.evaluate(() => window.__calls.windowsCreated.length)).toBe(1);
    expect(await decodeLastWindowBeam(page)).toEqual({ type: 'open-url', url: 'TTN-116061' });
  });
});

test.describe('Popup — fuzzy quick-open (B2)', () => {
  test('typing fuzzy-matches history and clicking a suggestion opens it', async ({ page }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [HISTORY([{ key: 'ABC-9', added: 1 }])],
      issueCache: { 'ABC-9': { fields: { summary: 'Payment gateway timeout' } } },
      prefs: { openInWindow: true },
    });

    await page.fill('#quick-open-input', 'paymnt'); // fuzzy (typo)
    await expect(page.locator('#quick-open-results')).toBeVisible();
    await expect(page.locator('#quick-open-results li .key-label').first()).toHaveText('ABC-9');

    await page.locator('#quick-open-results li').first().click();
    await expect.poll(() => page.evaluate(() => window.__calls.windowsCreated.length)).toBe(1);
    expect(await decodeLastWindowBeam(page)).toEqual({ type: 'open-url', url: 'ABC-9' });
  });

  test('Enter with no suggestion falls back to a raw open-url', async ({ page }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [HISTORY([{ key: 'ABC-9', added: 1 }])],
      issueCache: { 'ABC-9': { fields: { summary: 'Payment gateway timeout' } } },
      prefs: { openInWindow: true },
    });

    await page.fill('#quick-open-input', 'QQQQ-1'); // matches nothing in history
    await expect(page.locator('#quick-open-results')).toBeHidden();
    await page.locator('#quick-open-input').press('Enter');
    await expect.poll(() => page.evaluate(() => window.__calls.windowsCreated.length)).toBe(1);
    expect(await decodeLastWindowBeam(page)).toEqual({ type: 'open-url', url: 'QQQQ-1' });
  });
});

test.describe('Popup — arrow-key navigation (B3)', () => {
  test('ArrowDown highlights a suggestion and Enter opens the highlighted one', async ({
    page,
  }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [
        HISTORY([
          { key: 'PAY-1', added: 2 },
          { key: 'PAY-2', added: 1 },
        ]),
      ],
      issueCache: {
        'PAY-1': { fields: { summary: 'Payment retry' } },
        'PAY-2': { fields: { summary: 'Payment refund' } },
      },
      prefs: { openInWindow: true },
    });

    await page.fill('#quick-open-input', 'payment');
    await expect(page.locator('#quick-open-results li').first()).toBeVisible();
    await page.locator('#quick-open-input').press('ArrowDown');

    const activeKey = await page
      .locator('#quick-open-results li.active .key-label')
      .first()
      .innerText();
    await page.locator('#quick-open-input').press('Enter');
    await expect.poll(() => page.evaluate(() => window.__calls.windowsCreated.length)).toBe(1);
    expect(await decodeLastWindowBeam(page)).toEqual({ type: 'open-url', url: activeKey });
  });
});

test.describe('Popup — Beam All group payload', () => {
  const tabs = [
    { id: 10, windowId: 1, url: 'https://site.atlassian.net/browse/D-1' },
    { id: 11, windowId: 2, url: 'https://site.atlassian.net/browse/D-2' },
  ];
  const cfg = {
    appTab: null,
    currentTab: { id: 1, url: 'https://example.com' },
    groups: [HISTORY([])],
    prefs: { openInWindow: true },
    currentWindowId: 1,
    atlassianTabs: tabs,
  };

  test('a window-scoped beam is an open-group named for this window', async ({ page }) => {
    await openPopup(page, cfg);
    await page.click('#beam-all-btn');
    await expect.poll(() => page.evaluate(() => window.__calls.windowsCreated.length)).toBe(1);
    const payload = await decodeLastWindowBeam(page);
    expect(payload.type).toBe('open-group');
    expect(payload.name).toBe('Jira Tabs');
    expect(payload.keys).toEqual(['D-1']);
  });

  test('an all-windows beam is named distinctly so the two never collide', async ({ page }) => {
    await openPopup(page, cfg);
    await page.click('#beam-all-windows-btn');
    await expect.poll(() => page.evaluate(() => window.__calls.windowsCreated.length)).toBe(1);
    const payload = await decodeLastWindowBeam(page);
    expect(payload.name).toBe('All Jira Tabs');
    expect(payload.keys.sort()).toEqual(['D-1', 'D-2']);
  });
});

// ── Layout: the popup itself must never scroll ────────────────────────────────
// A Chrome popup is capped at 600px tall. Without an internal scroll region the
// whole body scrolls, which puts a scrollbar down the entire popup and pushes
// the footer actions out of reach. Only <main> may scroll.
test.describe('Popup — no outer scrollbar', () => {
  const manyTickets = Array.from({ length: 40 }, (_, i) => ({
    key: `LONG-${i + 1}`,
    title: `A reasonably long ticket title number ${i + 1}`,
  }));

  const openCrowded = (page) =>
    openPopup(page, {
      appTab: null,
      currentTab: {
        id: 1,
        url: 'https://site.atlassian.net/browse/LONG-1',
        title: 'Crowded board - Jira',
      },
      groups: [HISTORY([])],
      prefs: {},
      atlassianTabs: [{ id: 1 }],
      extractResponse: { tickets: manyTickets },
    });

  test('body does not scroll even with a long ticket list', async ({ page }) => {
    // 520px rather than Chrome's 600px ceiling: at 600 this fixture lands almost
    // exactly on the boundary, so a shorter popup makes the overflow deterministic.
    // The invariants asserted here must hold at any popup height.
    await page.setViewportSize({ width: 420, height: 520 });
    await openCrowded(page);
    await expect(page.locator('#keys-list li')).toHaveCount(40);

    // Measure the scrolling element (documentElement), not body: a body with no
    // height constraint reports its own content height, which would make this
    // comparison trivially true.
    const doc = await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return { scroll: el.scrollHeight, client: el.clientHeight };
    });
    // Allow a 1px rounding tolerance.
    expect(doc.scroll).toBeLessThanOrEqual(doc.client + 1);
  });

  test('the section label states the total so off-screen rows are discoverable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 420, height: 520 });
    await openCrowded(page);
    await expect(page.locator('#section-keys .section-label')).toContainText('40');
  });

  test('the ticket list is the scroll region, not the page', async ({ page }) => {
    // 520px rather than Chrome's 600px ceiling: at 600 this fixture lands almost
    // exactly on the boundary, so a shorter popup makes the overflow deterministic.
    // The invariants asserted here must hold at any popup height.
    await page.setViewportSize({ width: 420, height: 520 });
    await openCrowded(page);
    await expect(page.locator('#keys-list li')).toHaveCount(40);

    const list = await page.evaluate(() => {
      const el = document.getElementById('keys-list');
      return { scroll: el.scrollHeight, client: el.clientHeight };
    });
    expect(list.scroll).toBeGreaterThan(list.client);
  });

  test('the section action and footer stay fully visible, never sliced', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 520 });
    await openCrowded(page);
    await expect(page.locator('#keys-list li')).toHaveCount(40);

    // The list gives up height so this button is never cut off at the fold.
    await expect(page.locator('#beam-group-btn')).toBeInViewport({ ratio: 1 });

    // Footer is pinned: fully inside the popup viewport without scrolling.
    const footer = await page.locator('footer').boundingBox();
    const viewportHeight = page.viewportSize().height;
    expect(footer.y + footer.height).toBeLessThanOrEqual(viewportHeight + 1);
    await expect(page.locator('#open-app-btn')).toBeInViewport({ ratio: 1 });
  });
});
