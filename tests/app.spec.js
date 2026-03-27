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
  page.route(url => url.toString().includes('/rest/api/3/issue/'), async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(issueData) });
  });
}

function mockFieldsRoute(page) {
  page.route(url => url.toString().includes('/rest/api/3/field'), async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

function mockJqlRoute(page, data) {
  page.route(url => url.toString().includes('/rest/api/3/search/jql'), async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
}

function mockFilterRoute(page, data) {
  page.route(url => url.toString().includes('/rest/api/3/filter/'), async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
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
    await expect(page.locator('#reading-content')).toContainText('Test ticket summary for automation');
  });

  test('ticket key is normalised from lowercase input', async ({ page }) => {
    await page.fill('#search-input', 'proj-123');
    await page.click('#search-btn');

    await expect(page.locator('#ticket-list .list-card').first()).toContainText('PROJ-123', { timeout: 5000 });
  });

  test('opening ticket via F2 shortcut works', async ({ page }) => {
    await page.keyboard.press('F2');
    await expect(page.locator('#f2-modal')).not.toHaveClass(/hidden/);

    await page.fill('#f2-input', 'PROJ-123');
    await page.keyboard.press('Enter');

    await expect(page.locator('#ticket-list .list-card').first()).toContainText('PROJ-123', { timeout: 5000 });
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

  test('filter modal opens and closes', async ({ page }) => {
    await page.click('#filter-btn');
    await expect(page.locator('#filter-overlay')).not.toHaveClass(/hidden/);

    await page.click('#filter-cancel');
    await expect(page.locator('#filter-overlay')).toHaveClass(/hidden/);
  });

  test('loading JQL creates a filter group with 3 tickets', async ({ page }) => {
    await page.click('#filter-btn');
    await page.fill('#filter-input', 'project = PROJ ORDER BY updated DESC');
    await page.click('#filter-load');

    await expect(page.locator('#filter-overlay')).toHaveClass(/hidden/, { timeout: 5000 });
    await expect(page.locator('#group-list .group-item')).toHaveCount(2); // Inbox + filter group
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(3);
  });

  test('loading by filter ID uses filter name as group name', async ({ page }) => {
    await page.click('#filter-btn');
    await page.fill('#filter-input', '12345');
    await page.click('#filter-load');

    await expect(page.locator('#filter-overlay')).toHaveClass(/hidden/, { timeout: 5000 });
    await expect(page.locator('#group-list .group-item').nth(1)).toContainText('My Test Filter');
  });

  test('pasting filter URL in search bar loads tickets', async ({ page }) => {
    await page.fill('#search-input', 'https://site.atlassian.net/issues/?filter=12345');
    await page.click('#search-btn');

    await expect(page.locator('#ticket-list .list-card')).toHaveCount(3, { timeout: 5000 });
  });

  test('filter tickets do not appear in Inbox after switching to it', async ({ page }) => {
    await page.click('#filter-btn');
    await page.fill('#filter-input', 'project = PROJ');
    await page.click('#filter-load');

    await expect(page.locator('#filter-overlay')).toHaveClass(/hidden/, { timeout: 5000 });

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
    page.once('dialog', dialog => dialog.accept('My New List'));
    await page.click('#add-group-btn');

    await expect(page.locator('#group-list .group-item')).toHaveCount(2); // Inbox + new
    await expect(page.locator('#group-list .group-item').nth(1)).toContainText('My New List');
  });

  test('can rename a group via context menu', async ({ page }) => {
    page.once('dialog', dialog => dialog.accept('Original Name'));
    await page.click('#add-group-btn');

    await page.locator('#group-list .group-item').nth(1).click({ button: 'right' });
    await expect(page.locator('#ctx-menu')).toBeVisible();

    page.once('dialog', dialog => dialog.accept('Renamed List'));
    await page.click('#ctx-rename');

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
  });

  test('can create a standalone note in notes mode', async ({ page }) => {
    await page.click('#tab-notes');
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'notes');

    // The Jira-mode addEventListener fires first (shows prompt), then onclick=createNote fires.
    // Dismiss the prompt to let createNote run.
    page.once('dialog', dialog => dialog.dismiss());
    await page.click('#add-group-btn');

    // Notes sidebar renders .note-item elements (not .group-item)
    await expect(page.locator('#group-list .note-item')).toHaveCount(1, { timeout: 3000 });
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

  test('clicking history button activates history view', async ({ page }) => {
    await page.click('#history-toggle-btn');
    await expect(page.locator('body')).toHaveAttribute('data-active-view', 'history');
  });

  test('opening a ticket persists it in history state', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.click('#search-btn');

    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });

    // Check history group in localStorage
    const histCount = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('jira_state') || '{}');
      const hist = (s.groups || []).find(g => g.id === 'history');
      return hist ? hist.keys.length : 0;
    });
    expect(histCount).toBeGreaterThan(0);
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
});
