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
        if (q.url && q.url.includes('atlassian.net')) return cfg.atlassianTabs || [];
        if (q.active) return cfg.currentTab ? [cfg.currentTab] : [];
        return [];
      },
      update: async () => {},
      create: async (o) => {
        window.__calls.tabsCreated.push(o);
      },
      sendMessage: async (_tabId, msg) => {
        if (msg && msg.type === 'extract-keys')
          return cfg.extractResponse || { keys: [], tickets: [] };
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
  test('Beam All with no Jira tabs shows a message and does not close', async ({ page }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [HISTORY([])],
      prefs: {},
      atlassianTabs: [],
    });

    await page.click('#beam-all-btn');
    await expect(page.locator('#popup-msg')).toBeVisible();
    await expect(page.locator('#popup-msg')).toContainText('No tickets found');
    expect(await page.evaluate(() => window.__calls.closed)).toBe(false);
    expect(await page.evaluate(() => window.__calls.windowsCreated.length)).toBe(0);
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

test.describe('Popup — Beam All is parallel (B4)', () => {
  test('aggregates tickets across multiple Jira tabs', async ({ page }) => {
    await openPopup(page, {
      appTab: null,
      currentTab: { id: 1, url: 'https://example.com' },
      groups: [HISTORY([])],
      prefs: { openInWindow: true },
      atlassianTabs: [{ id: 10 }, { id: 11 }],
      extractResponse: { tickets: [{ key: 'D-1', title: 'd' }] },
    });

    await page.click('#beam-all-btn');
    await expect.poll(() => page.evaluate(() => window.__calls.windowsCreated.length)).toBe(1);
    const payload = await decodeLastWindowBeam(page);
    expect(payload.type).toBe('open-group');
    expect(payload.keys).toEqual(['D-1']);
  });
});
