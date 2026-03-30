// @ts-check
const { test, expect } = require('@playwright/test');

const issueFixture = require('./fixtures/issue.json');
const searchFixture = require('./fixtures/search-results.json');
const filterFixture = require('./fixtures/filter.json');

// Inject a valid config into localStorage so the app starts configured
// (prevents settings modal from auto-opening)
const initConfig = () => {
  const config = {
    email: 'test@example.com',
    token: 'fake-api-token',
    baseUrl: 'https://site.atlassian.net',
    historyLimit: 100,
    proxyUrl: '',
  };
  localStorage.setItem('jira_config', JSON.stringify(config));
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register = () => Promise.resolve({});
  }
};

// Route helpers — url param in page.route() is a URL object, use .toString()
function mockIssueRoute(page, issueData) {
  page.route(
    (url) => url.toString().includes('/rest/api/3/issue/'),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(issueData),
      });
    }
  );
}

function mockFieldsRoute(page) {
  page.route(
    (url) => url.toString().includes('/rest/api/3/field'),
    async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
  );
}

function mockJqlRoute(page, data) {
  page.route(
    (url) => url.toString().includes('/rest/api/3/search/jql'),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data),
      });
    }
  );
}

function mockFilterRoute(page, data) {
  page.route(
    (url) => url.toString().includes('/rest/api/3/filter/'),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data),
      });
    }
  );
}

// Helper: create a new group using the inline input (replaces old prompt() flow)
async function createGroup(page, name) {
  await page.click('#add-group-btn');
  await page.fill('.g-name-input', name);
  await page.keyboard.press('Enter');
}

// ── 1. LAYOUT ─────────────────────────────────────────────────────────────────
test.describe('Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    await page.goto('/');
  });

  test('topbar is visible', async ({ page }) => {
    await expect(page.locator('#topbar')).toBeVisible();
  });

  test('sidebar, middle, and reading panes are present', async ({ page }) => {
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#middle')).toBeVisible();
    await expect(page.locator('#reading')).toBeVisible();
  });

  test('Inbox group is present in sidebar', async ({ page }) => {
    await expect(page.locator('#group-list .group-item').first()).toContainText('Inbox');
  });

  test('empty state is shown in reading pane', async ({ page }) => {
    await expect(page.locator('#reading-empty')).toBeVisible();
    await expect(page.locator('#reading-empty h2')).toContainText('No ticket selected');
  });
});

// ── 2. SETTINGS ───────────────────────────────────────────────────────────────
test.describe('Settings', () => {
  // Note: these tests do NOT use initConfig in beforeEach because some tests
  // need to verify the unconfigured state (auto-open modal) and configured state separately.

  test('settings modal opens when settings button is clicked', async ({ page }) => {
    await page.addInitScript(initConfig);
    await page.goto('/');
    await page.click('#settings-btn');
    await expect(page.locator('#settings-overlay')).not.toHaveClass(/hidden/);
  });

  test('settings modal closes with cancel button', async ({ page }) => {
    await page.addInitScript(initConfig);
    await page.goto('/');
    await page.click('#settings-btn');
    await page.click('#settings-cancel');
    await expect(page.locator('#settings-overlay')).toHaveClass(/hidden/);
  });

  test('settings values are saved and reloaded after page refresh', async ({ page }) => {
    // No initConfig so modal auto-opens on first load
    await page.goto('/');
    await page.fill('#cfg-email', 'user@test.com');
    await page.fill('#cfg-token', 'mytoken123');
    await page.fill('#cfg-url', 'https://mysite.atlassian.net');
    await page.click('#settings-save');

    // Reload — no initConfig, so saved values persist in localStorage
    await page.reload();
    await page.click('#settings-btn');
    await expect(page.locator('#cfg-email')).toHaveValue('user@test.com');
    await expect(page.locator('#cfg-url')).toHaveValue('https://mysite.atlassian.net');
  });

  test('settings modal shows required field labels', async ({ page }) => {
    await page.addInitScript(initConfig);
    await page.goto('/');
    await page.click('#settings-btn');
    const modal = page.locator('#settings-modal');
    await expect(modal.locator('.form-label').first()).toContainText('Email');
    await expect(modal.locator('.form-label').nth(1)).toContainText('API Token');
    await expect(modal.locator('.form-label').nth(2)).toContainText('Jira URL');
  });
});

// ── 3. TICKETS ────────────────────────────────────────────────────────────────
test.describe('Tickets', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
  });

  test('opening a ticket key adds it to Inbox list', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.click('#search-btn');

    // Ticket list uses .list-card class
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#ticket-list .list-card').first()).toContainText('PROJ-123');
  });

  test('selecting a ticket shows it in the reading pane', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.click('#search-btn');

    await page.locator('#ticket-list .list-card').first().click();

    await expect(page.locator('#reading-content')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#reading-content')).toContainText('PROJ-123');
    await expect(page.locator('#reading-content')).toContainText(
      'Test ticket summary for automation'
    );
  });

  test('newly opened ticket summary updates in list after fetch resolves', async ({ page }) => {
    // Regression: C3 fast path was skipping full rebuild when key list was
    // unchanged, leaving "Loading..." stuck in the card until another item
    // was opened. The fast path must be bypassed while any key is uncached.
    await page.fill('#search-input', 'PROJ-123');
    await page.click('#search-btn');

    // Card must eventually show the real summary, not "Loading..."
    await expect(page.locator('#ticket-list .list-card').first()).toContainText(
      'Test ticket summary for automation',
      { timeout: 5000 }
    );
  });

  test('ticket key is normalised from lowercase input', async ({ page }) => {
    await page.fill('#search-input', 'proj-123');
    await page.click('#search-btn');

    await expect(page.locator('#ticket-list .list-card').first()).toContainText('PROJ-123', {
      timeout: 5000,
    });
  });

  test('F2 focuses the search input and opening a ticket works', async ({ page }) => {
    await page.keyboard.press('F2');
    await expect(page.locator('#search-input')).toBeFocused();

    await page.fill('#search-input', 'PROJ-123');
    await page.keyboard.press('Enter');

    await expect(page.locator('#ticket-list .list-card').first()).toContainText('PROJ-123', {
      timeout: 5000,
    });
  });

  test('ticket added to Inbox shows count of 1 in sidebar', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.click('#search-btn');

    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });

    const inboxItem = page.locator('#group-list .group-item').first();
    await expect(inboxItem.locator('.count')).toContainText('1');
  });
});

// ── 4. FILTERS ────────────────────────────────────────────────────────────────
test.describe('Filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockJqlRoute(page, searchFixture);
    mockFilterRoute(page, filterFixture);
    mockFieldsRoute(page);
    await page.goto('/');
  });

  test('button label changes to Load Filter when JQL is typed', async ({ page }) => {
    await page.fill('#search-input', 'project = PROJ ORDER BY updated DESC');
    await expect(page.locator('#search-btn')).toContainText('Load Filter');

    await page.fill('#search-input', 'PROJ-123');
    await expect(page.locator('#search-btn')).toContainText('Open');
  });

  test('loading JQL via search bar creates a filter group with 3 tickets', async ({ page }) => {
    await page.fill('#search-input', 'project = PROJ ORDER BY updated DESC');
    await page.click('#search-btn');

    // Inbox + filter group = 2
    await expect(page.locator('#group-list .group-item')).toHaveCount(2, { timeout: 5000 });
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(3);
  });

  test('loading by filter ID uses filter name as group name', async ({ page }) => {
    await page.fill('#search-input', '12345');
    await page.click('#search-btn');

    await expect(page.locator('#group-list .group-item').nth(1)).toContainText('My Test Filter', {
      timeout: 5000,
    });
  });

  test('pasting filter URL in search bar loads tickets', async ({ page }) => {
    await page.fill('#search-input', 'https://site.atlassian.net/issues/?filter=12345');
    await page.click('#search-btn');

    await expect(page.locator('#ticket-list .list-card')).toHaveCount(3, { timeout: 5000 });
  });

  test('filter tickets do not appear in Inbox after switching to it', async ({ page }) => {
    await page.fill('#search-input', 'project = PROJ');
    await page.click('#search-btn');

    await expect(page.locator('#group-list .group-item')).toHaveCount(2, { timeout: 5000 });

    // Switch to Inbox
    await page.locator('#group-list .group-item').first().click();
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(0);
  });
});

// ── 5. GROUPS ─────────────────────────────────────────────────────────────────
test.describe('Groups', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    await page.goto('/');
  });

  test('can create a new group', async ({ page }) => {
    await createGroup(page, 'My New List');

    // Inbox + new group = 2 (History is now its own tab, not a sidebar group)
    await expect(page.locator('#group-list .group-item')).toHaveCount(2);
    await expect(page.locator('#group-list .group-item').nth(1)).toContainText('My New List');
  });

  test('pressing Escape while creating a group cancels it', async ({ page }) => {
    await page.click('#add-group-btn');
    await page.fill('.g-name-input', 'Abandoned');
    await page.keyboard.press('Escape');

    // Only Inbox should remain
    await expect(page.locator('#group-list .group-item')).toHaveCount(1);
  });

  test('can rename a group via inline action button', async ({ page }) => {
    await createGroup(page, 'Original Name');

    // Click the group to activate it (shows action buttons)
    await page.locator('#group-list .group-item').nth(1).click();

    // Rename button shows inline input on active group
    await page.locator('.g-action-btn[data-action="rename"]').click();
    await page.locator('.g-name-input').fill('Renamed List');
    await page.keyboard.press('Enter');

    await expect(page.locator('#group-list .group-item').nth(1)).toContainText('Renamed List');
  });
});

// ── 6. NOTES ──────────────────────────────────────────────────────────────────
test.describe('Notes', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    await page.goto('/');
  });

  test('switching to Notes tab changes app mode', async ({ page }) => {
    await page.click('#tab-notes');
    await expect(page.locator('#tab-notes')).toHaveClass(/active/);
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'notes');
    await expect(page.locator('#notes-canvas-pane')).toBeVisible();
  });

  test('can create a note and click canvas to add text block', async ({ page }) => {
    await page.click('#tab-notes');
    await page.click('#add-note-btn');

    // New note appears in sidebar
    await expect(page.locator('#nc-notes-list .nc-note-item')).toHaveCount(1, { timeout: 3000 });

    // Click on empty canvas area creates a text block
    await page.click('#note-canvas', { position: { x: 100, y: 100 } });
    await expect(page.locator('#note-canvas .cb')).toHaveCount(1, { timeout: 3000 });
    await expect(page.locator('#note-canvas .cb-text')).toHaveCount(1);
  });

  test('empty text block is removed when focus leaves without typing', async ({ page }) => {
    await page.click('#tab-notes');
    await page.click('#add-note-btn');

    // Click canvas to create an empty text block
    await page.click('#note-canvas', { position: { x: 120, y: 120 } });
    await expect(page.locator('#note-canvas .cb')).toHaveCount(1, { timeout: 3000 });

    // Blur by clicking the title input (not the canvas — avoids creating a second block)
    await page.click('#nc-title-input');

    // The empty block should have been removed on blur
    await expect(page.locator('#note-canvas .cb')).toHaveCount(0, { timeout: 3000 });
  });

  test('Mindmap tab is between Notes and History', async ({ page }) => {
    const tabs = await page.locator('#tab-bar .tab-btn').allTextContents();
    const cleaned = tabs.map((t) => t.trim());
    const notesIdx = cleaned.findIndex((t) => t.includes('Notes'));
    const mindmapIdx = cleaned.findIndex((t) => t.includes('Mindmap'));
    const historyIdx = cleaned.findIndex((t) => t.includes('History'));
    expect(notesIdx).toBeLessThan(mindmapIdx);
    expect(mindmapIdx).toBeLessThan(historyIdx);
  });

  test('Mindmap sidebar shows diagram list and add button', async ({ page }) => {
    await page.click('#tab-mindmap');
    await expect(page.locator('#mm-diagram-list')).toBeVisible();
    await expect(page.locator('#mm-add-btn')).toBeVisible();
    // Default diagram exists after first load
    await expect(page.locator('#mm-diagram-list .mm-diagram-item')).toHaveCount(1, {
      timeout: 3000,
    });
  });

  test('adding a second diagram updates the sidebar', async ({ page }) => {
    await page.click('#tab-mindmap');
    await expect(page.locator('#mm-diagram-list .mm-diagram-item')).toHaveCount(1, {
      timeout: 3000,
    });
    await page.click('#mm-add-btn');
    await expect(page.locator('#mm-diagram-list .mm-diagram-item')).toHaveCount(2, {
      timeout: 3000,
    });
  });
});

// ── 6b. LABELS TAB ───────────────────────────────────────────────────────────
test.describe('Labels Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
  });

  test('Labels tab is between Jira and Notes', async ({ page }) => {
    const tabs = await page.locator('#tab-bar .tab-btn').allTextContents();
    const cleaned = tabs.map((t) => t.trim());
    const jiraIdx = cleaned.findIndex((t) => t.includes('Jira'));
    const labelsIdx = cleaned.findIndex((t) => t.includes('Labels'));
    const notesIdx = cleaned.findIndex((t) => t.includes('Notes'));
    expect(jiraIdx).toBeLessThan(labelsIdx);
    expect(labelsIdx).toBeLessThan(notesIdx);
  });

  test('switching to Labels tab changes app mode', async ({ page }) => {
    await page.click('#tab-labels');
    await expect(page.locator('#tab-labels')).toHaveClass(/active/);
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'labels');
  });

  test('Labels tab shows no-label group when ticket has no labels', async ({ page }) => {
    // Load a ticket (has no labels by default)
    await page.fill('#search-input', 'PROJ-123');
    await page.click('#search-btn');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });

    await page.click('#tab-labels');
    await expect(page.locator('#group-list')).toContainText('no-label');
  });

  test('Labels tab shows labeled ticket under its label group', async ({ page }) => {
    // Load a ticket and assign a label via state
    await page.addInitScript(() => {
      const orig = localStorage.setItem.bind(localStorage);
      // After app initializes, inject a label
    });

    // Assign a label programmatically then switch to labels tab
    await page.fill('#search-input', 'PROJ-123');
    await page.click('#search-btn');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });

    // Apply label via JS
    await page.evaluate(() => {
      window.applyLabel('PROJ-123', 'bug');
    });

    await page.click('#tab-labels');
    await expect(page.locator('#group-list')).toContainText('bug');
  });

  test('clicking a label group in Labels tab shows its tickets in middle pane', async ({
    page,
  }) => {
    // Load ticket and add label
    await page.fill('#search-input', 'PROJ-123');
    await page.click('#search-btn');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
    await page.evaluate(() => window.applyLabel('PROJ-123', 'bug'));

    await page.click('#tab-labels');
    // Click the "bug" label group
    await page.locator('#group-list .group-item').filter({ hasText: 'bug' }).click();
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#ticket-list .list-card')).toContainText('PROJ-123');
  });
});

// ── 7. HISTORY ────────────────────────────────────────────────────────────────
test.describe('History', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
  });

  test('clicking history tab switches to history mode', async ({ page }) => {
    await page.click('#tab-history');
    await expect(page.locator('#tab-history')).toHaveClass(/active/);
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'history');
  });

  test('remove button deletes the entry from history', async ({ page }) => {
    // Open a ticket so it lands in history
    await page.fill('#search-input', 'PROJ-123');
    await page.click('#search-btn');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });

    await page.click('#tab-history');
    await expect(page.locator('.ht-row')).toHaveCount(1, { timeout: 5000 });

    // Click the remove button on that row
    await page.locator('.ht-remove-btn').click();

    // Row should be gone
    await expect(page.locator('.ht-row')).toHaveCount(0, { timeout: 3000 });

    // Persisted in state too
    const histCount = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('jira_state') || '{}');
      const hist = (s.groups || []).find((g) => g.id === 'history');
      return hist ? hist.keys.length : 0;
    });
    expect(histCount).toBe(0);
  });

  test('opening a ticket persists it in history state', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.click('#search-btn');

    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });

    // Check history group in localStorage
    const histCount = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('jira_state') || '{}');
      const hist = (s.groups || []).find((g) => g.id === 'history');
      return hist ? hist.keys.length : 0;
    });
    expect(histCount).toBeGreaterThan(0);
  });
});

// ── 7b. HISTORY COLUMN SORT & RESIZE ─────────────────────────────────────────
test.describe('History Column Sort', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
  });

  // Open tickets in order 200→100→300 so natural history order = [300, 100, 200]
  async function openThreeTickets(page) {
    for (const key of ['PROJ-200', 'PROJ-100', 'PROJ-300']) {
      await page.fill('#search-input', key);
      await page.click('#search-btn');
      await expect(page.locator('#ticket-list .list-card.active')).toBeVisible({ timeout: 5000 });
    }
    await page.click('#tab-history');
    await expect(page.locator('.ht-row')).toHaveCount(3, { timeout: 5000 });
  }

  test('sortable column headers render with sort indicators', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.click('#search-btn');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
    await page.click('#tab-history');
    await expect(page.locator('.ht-th-sortable[data-sort-col="key"]')).toBeVisible();
    await expect(page.locator('.ht-th-sortable[data-sort-col="summary"]')).toBeVisible();
    await expect(page.locator('.ht-th-sortable[data-sort-col="viewed"]')).toBeVisible();
  });

  test('clicking Key header sorts ascending, again descending, third click resets', async ({
    page,
  }) => {
    await openThreeTickets(page);

    // Natural order first row: PROJ-300 (most recently opened)
    await expect(page.locator('.ht-row').first()).toHaveAttribute('data-key', 'PROJ-300');

    // 1st click → ascending
    await page.click('.ht-th-sortable[data-sort-col="key"]');
    const keys1 = await page.locator('.ht-row').evaluateAll((rows) =>
      rows.map((r) => r.dataset.key)
    );
    expect(keys1).toEqual(['PROJ-100', 'PROJ-200', 'PROJ-300']);

    // 2nd click → descending
    await page.click('.ht-th-sortable[data-sort-col="key"]');
    const keys2 = await page.locator('.ht-row').evaluateAll((rows) =>
      rows.map((r) => r.dataset.key)
    );
    expect(keys2).toEqual(['PROJ-300', 'PROJ-200', 'PROJ-100']);

    // 3rd click → natural order restored [300, 100, 200]
    await page.click('.ht-th-sortable[data-sort-col="key"]');
    const keys3 = await page.locator('.ht-row').evaluateAll((rows) =>
      rows.map((r) => r.dataset.key)
    );
    expect(keys3).toEqual(['PROJ-300', 'PROJ-100', 'PROJ-200']);
  });

  test('active sort column gets data-sort-active attribute', async ({ page }) => {
    await openThreeTickets(page);
    await page.click('.ht-th-sortable[data-sort-col="key"]');
    await expect(page.locator('.ht-th-sortable[data-sort-col="key"]')).toHaveAttribute(
      'data-sort-active',
      '1'
    );
    // Other columns should not be active
    await expect(
      page.locator('.ht-th-sortable[data-sort-col="summary"]')
    ).not.toHaveAttribute('data-sort-active');
  });

  test('resize handles are present on every sortable column header', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.click('#search-btn');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
    await page.click('#tab-history');
    // 6 sortable columns: key, summary, status, assignee, created, viewed
    await expect(page.locator('.ht-th-sortable .ht-resize-handle')).toHaveCount(6);
  });

  test('dragging resize handle changes column width', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.click('#search-btn');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
    await page.click('#tab-history');

    const keyTh = page.locator('.ht-th-sortable[data-sort-col="key"]');
    const beforeW = await keyTh.evaluate((el) => el.offsetWidth);

    // Dispatch mouse events directly — page.mouse does not reliably target
    // position-absolute children inside sticky <th> elements in headless Chromium.
    const afterW = await page.evaluate(() => {
      const th = document.querySelector('.ht-th-sortable[data-sort-col="key"]');
      const handle = th.querySelector('.ht-resize-handle');
      handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true, cancelable: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 160, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return th.offsetWidth;
    });
    expect(afterW).toBeGreaterThan(beforeW + 40);
  });
});

// ── 8. TABS ───────────────────────────────────────────────────────────────────
test.describe('Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    await page.goto('/');
  });

  test('Jira tab is active by default', async ({ page }) => {
    await expect(page.locator('#tab-jira')).toHaveClass(/active/);
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'jira');
  });

  test('switching tabs and back restores Jira view', async ({ page }) => {
    await page.click('#tab-notes');
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'notes');

    await page.click('#tab-jira');
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'jira');
    await expect(page.locator('#tab-jira')).toHaveClass(/active/);
  });

  test('switching back to Jira with active ticket renders reading pane without errors', async ({
    page,
  }) => {
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);

    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.fill('#search-input', 'PROJ-123');
    await page.click('#search-btn');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('#reading-content')).toBeVisible({ timeout: 5000 });

    // Switch away and back — renderReading must not throw
    await page.click('#tab-notes');
    await page.click('#tab-jira');
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'jira');

    // No JS errors should have been thrown (catches bindPasteHandler ReferenceError)
    const referenceErrors = jsErrors.filter(
      (m) => m.includes('ReferenceError') || m.includes('not defined')
    );
    expect(referenceErrors).toHaveLength(0);
  });

  test('Mindmap tab switches to mindmap mode and shows editor/preview panes', async ({ page }) => {
    await page.click('#tab-mindmap');
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'mindmap');
    await expect(page.locator('#tab-mindmap')).toHaveClass(/active/);
    await expect(page.locator('#mindmap-pane')).toBeVisible();
    await expect(page.locator('#mm-code')).toBeVisible();
    await expect(page.locator('#mm-preview')).toBeVisible();
    // Default diagram code is pre-loaded
    await expect(page.locator('#mm-code')).toHaveValue(/journey/);
  });

  test('Mindmap copy button shows toast', async ({ page }) => {
    await page.click('#tab-mindmap');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.click('#mm-copy-btn');
    await expect(page.locator('#toast')).toContainText('copied', { timeout: 3000 });
  });

  test('Mindmap refresh button exists and re-renders preview', async ({ page }) => {
    await page.click('#tab-mindmap');
    await expect(page.locator('#mm-refresh-btn')).toBeVisible();
    // Clear preview to verify refresh actually re-renders it
    await page.evaluate(() => {
      document.getElementById('mm-preview').innerHTML = '';
    });
    await page.click('#mm-refresh-btn');
    // Preview should have content again after refresh
    await expect(page.locator('#mm-preview')).not.toBeEmpty({ timeout: 3000 });
  });
});

// ── 9. BULK ACTIONS ───────────────────────────────────────────────────────────
test.describe('Bulk Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');

    // Add two tickets to Inbox
    await page.fill('#search-input', 'PROJ-123');
    await page.click('#search-btn');
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(1, { timeout: 5000 });
    await page.fill('#search-input', 'PROJ-456');
    await page.click('#search-btn');
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(2, { timeout: 5000 });
  });

  test('clicking bulk-select-btn enters bulk mode', async ({ page }) => {
    await page.click('#bulk-select-btn');
    await expect(page.locator('#middle')).toHaveClass(/bulk-mode/);
    await expect(page.locator('#bulk-toolbar')).toHaveClass(/visible/);
  });

  test('clicking bulk-done-btn exits bulk mode', async ({ page }) => {
    await page.click('#bulk-select-btn');
    await page.click('#bulk-done-btn');
    await expect(page.locator('#middle')).not.toHaveClass(/bulk-mode/);
    await expect(page.locator('#bulk-toolbar')).not.toHaveClass(/visible/);
  });

  test('clicking a card in bulk mode selects it', async ({ page }) => {
    await page.click('#bulk-select-btn');
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('#ticket-list .list-card.selected')).toHaveCount(1);
    await expect(page.locator('#bulk-count')).toContainText('1 selected');
  });

  test('bulk delete removes selected tickets', async ({ page }) => {
    await page.click('#bulk-select-btn');
    await page.locator('#ticket-list .list-card').first().click();
    await page.click('#bulk-delete-btn');
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(1, { timeout: 3000 });
  });

  test('bulk move transfers selected tickets to another group', async ({ page }) => {
    // Create a second group
    await createGroup(page, 'Target Group');
    await expect(page.locator('#group-list .group-item')).toHaveCount(2, { timeout: 3000 });

    // Switch back to Inbox and enter bulk mode
    await page.locator('#group-list .group-item').first().click();
    await page.click('#bulk-select-btn');
    await page.locator('#ticket-list .list-card').first().click();

    // Move via dropdown
    await page.selectOption('#bulk-move-select', { label: 'Target Group' });

    // Inbox should now have 1 ticket
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(1, { timeout: 3000 });
  });
});

// ── 7b. READING PANE — CODE BLOCK COPY ───────────────────────────────────────
test.describe('Code Block Copy', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockFieldsRoute(page);
    // Return an issue with a code block in the description
    page.route(
      (url) => url.toString().includes('/rest/api/3/issue/'),
      async (route) => {
        const issueWithCode = {
          ...require('./fixtures/issue.json'),
          renderedFields: {
            description: '<p>Check this code:</p><pre><code>console.log("hello");</code></pre>',
            comment: { comments: [] },
          },
        };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(issueWithCode),
        });
      }
    );
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.click('#search-btn');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('#reading-content')).toBeVisible({ timeout: 5000 });
  });

  test('code block in reading pane has a copy button', async ({ page }) => {
    await expect(page.locator('#reading-content .code-copy-btn')).toBeVisible({ timeout: 3000 });
  });

  test('clicking code copy button shows toast', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#reading-content .code-copy-btn').first().click();
    await expect(page.locator('#toast')).toContainText(/cop/i, { timeout: 3000 });
  });
});

// ── 7c. JIRA LINK HANDLING ────────────────────────────────────────────────────
test.describe('Jira Link Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockFieldsRoute(page);
    // Return an issue with Jira links in description
    page.route(
      (url) => url.toString().includes('/rest/api/3/issue/PROJ-123'),
      async (route) => {
        const issueWithLinks = {
          ...require('./fixtures/issue.json'),
          renderedFields: {
            description:
              '<p>See <a href="https://site.atlassian.net/browse/ENHANCE-3133">ENHANCE-3133</a></p>' +
              '<p>Contact <a href="https://site.atlassian.net/jira/people/user123">John Doe</a></p>',
            comment: { comments: [] },
          },
        };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(issueWithLinks),
        });
      }
    );
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.click('#search-btn');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('#reading-content')).toBeVisible({ timeout: 5000 });
  });

  test('clicking a /browse/ link opens ticket in app', async ({ page }) => {
    // Mock the linked ticket route
    page.route(
      (url) => url.toString().includes('/rest/api/3/issue/ENHANCE-3133'),
      async (route) => {
        const f = require('./fixtures/issue.json');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...f, key: 'ENHANCE-3133' }),
        });
      }
    );
    await page.locator('#reading-content a[href*="/browse/ENHANCE-3133"]').click();
    await expect(page.locator('#reading-content')).toContainText('ENHANCE-3133', { timeout: 5000 });
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'jira');
  });

  test('profile links are not intercepted', async ({ page }) => {
    const link = page.locator('#reading-content a[href*="/jira/people/"]');
    await expect(link).toBeVisible();
    // Profile link should open externally — verify it has target="_blank"
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('ctrl+click on browse link opens in browser not app', async ({ page }) => {
    // Ctrl+click should not trigger in-app navigation
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    // Record state before
    const keyBefore = await page.evaluate(() => window.state?.activeKey);
    await page
      .locator('#reading-content a[href*="/browse/ENHANCE-3133"]')
      .click({ modifiers: ['Control'] });
    // activeKey should not change to ENHANCE-3133 (app-navigation was skipped)
    const keyAfter = await page.evaluate(() => window.state?.activeKey);
    expect(keyAfter).toBe(keyBefore);
  });
});

// ── 8. ERROR PATHS ────────────────────────────────────────────────────────────
test.describe('Error Paths', () => {
  test.beforeEach(async ({ page }) => {
    mockFieldsRoute(page);
    await page.addInitScript(initConfig);
    await page.goto('/');
  });

  test('401 from fetchIssue shows error in reading pane', async ({ page }) => {
    page.route(
      (url) => url.toString().includes('/rest/api/3/issue/'),
      async (route) => {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: '{"message":"Unauthorized"}',
        });
      }
    );

    await page.fill('#search-input', 'PROJ-401');
    await page.click('#search-btn');

    // Select the ticket to trigger renderReading
    await page.locator('#ticket-list .list-card').first().click();

    // Reading pane should show an error message, not a spinner
    await expect(page.locator('#reading-content')).toContainText(/error/i, { timeout: 5000 });
    await expect(page.locator('#reading-content .loading-spinner')).toHaveCount(0);
  });

  test('network failure during filter load shows toast error', async ({ page }) => {
    page.route(
      (url) => url.toString().includes('/rest/api/3/search/jql'),
      async (route) => {
        await route.abort('failed');
      }
    );

    await page.fill('#search-input', 'project = FAIL');
    await page.click('#search-btn');

    await expect(page.locator('#toast')).toContainText(/error/i, { timeout: 5000 });
  });

  test('corrupted localStorage is recovered gracefully', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('jira_state', '{bad json{{');
    });
    await page.goto('/');

    // App should still render — sidebar and middle pane present
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#middle')).toBeVisible();
  });

  test('XSS in ticket summary is escaped in ticket list', async ({ page }) => {
    const xssIssue = {
      ...require('./fixtures/issue.json'),
      key: 'PROJ-99',
      fields: {
        ...require('./fixtures/issue.json').fields,
        summary: '<img src=x onerror="window.__xss=1">',
        description: undefined,
      },
    };
    page.route(
      (url) => url.toString().includes('/rest/api/3/issue/'),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(xssIssue),
        });
      }
    );

    await page.fill('#search-input', 'PROJ-99');
    await page.click('#search-btn');

    // Wait for ticket to appear in list
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(1, { timeout: 3000 });

    // XSS payload must not execute
    const xssRan = await page.evaluate(() => window.__xss);
    expect(xssRan).toBeFalsy();

    // Raw HTML must not appear unescaped in the DOM
    const cardHtml = await page.locator('#ticket-list .list-card').innerHTML();
    expect(cardHtml).not.toContain('<img src=x');
  });

  test('settings URL validation rejects invalid Jira URL', async ({ page }) => {
    await page.click('#settings-btn');
    await page.fill('#cfg-url', 'not-a-valid-url');
    await page.click('#settings-save');

    // Error message should appear; overlay must stay open
    await expect(page.locator('#settings-overlay')).not.toHaveClass(/hidden/);
    await expect(page.locator('.field-error')).toBeVisible();
  });

  test('settings URL validation accepts valid Jira URL', async ({ page }) => {
    mockIssueRoute(page, issueFixture);
    await page.click('#settings-btn');
    await page.fill('#cfg-url', 'https://company.atlassian.net');
    await page.fill('#cfg-email', 'user@company.com');
    await page.fill('#cfg-token', 'mytoken');
    await page.click('#settings-save');

    // Overlay should close on valid input
    await expect(page.locator('#settings-overlay')).toHaveClass(/hidden/);
  });
});

// ── 9. DRAG AND DROP ──────────────────────────────────────────────────────────
test.describe('Drag and Drop', () => {
  test.beforeEach(async ({ page }) => {
    mockFieldsRoute(page);
    mockIssueRoute(page, issueFixture);
    await page.addInitScript(initConfig);
    await page.goto('/');

    // Add two tickets to Inbox
    await page.fill('#search-input', 'PROJ-1');
    await page.click('#search-btn');
    await page.fill('#search-input', 'PROJ-2');
    await page.click('#search-btn');
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(2, { timeout: 3000 });
  });

  test('dragging a ticket card reorders it within the group', async ({ page }) => {
    const cards = page.locator('#ticket-list .list-card');
    const firstKey = await cards.nth(0).getAttribute('data-key');
    const secondKey = await cards.nth(1).getAttribute('data-key');

    // Simulate drag: dragstart on first card, drop on second card
    await cards.nth(0).dispatchEvent('dragstart');
    await cards.nth(1).dispatchEvent('dragover');
    await cards.nth(1).dispatchEvent('drop');

    // Order should be reversed
    await expect(cards.nth(0)).toHaveAttribute('data-key', secondKey);
    await expect(cards.nth(1)).toHaveAttribute('data-key', firstKey);
  });

  test('dragging a ticket to another group moves it', async ({ page }) => {
    // Create a second group
    await createGroup(page, 'Target');
    await expect(page.locator('#group-list .group-item')).toHaveCount(2, { timeout: 3000 });

    // Switch back to Inbox (first group) so the source cards are visible
    await page.locator('#group-list .group-item').first().click();
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(2, { timeout: 3000 });

    const sourceCard = page.locator('#ticket-list .list-card').first();
    const targetGroup = page.locator('#group-list .group-item').nth(1);

    await sourceCard.dispatchEvent('dragstart');
    await targetGroup.dispatchEvent('dragover');
    await targetGroup.dispatchEvent('drop');

    // Inbox should now have 1 ticket
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(1, { timeout: 3000 });
  });

  test('dragging a group reorders groups in the sidebar', async ({ page }) => {
    // Create a second group
    await createGroup(page, 'Second');
    await expect(page.locator('#group-list .group-item')).toHaveCount(2, { timeout: 3000 });

    const groups = page.locator('#group-list .group-item');
    const firstGroupId = await groups.nth(0).getAttribute('data-id');
    const secondGroupId = await groups.nth(1).getAttribute('data-id');

    // Drag second group handle to first group slot
    const handle = groups.nth(1).locator('.g-drag-handle');
    await handle.dispatchEvent('dragstart');
    await groups.nth(0).dispatchEvent('dragover');
    await groups.nth(0).dispatchEvent('drop');

    // Groups should be reordered
    await expect(groups.nth(0)).toHaveAttribute('data-id', secondGroupId);
    await expect(groups.nth(1)).toHaveAttribute('data-id', firstGroupId);
  });
});
