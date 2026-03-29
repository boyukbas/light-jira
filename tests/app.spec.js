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
    page.once('dialog', (dialog) => dialog.accept('My New List'));
    await page.click('#add-group-btn');

    // Inbox + new group = 2 (History is now its own tab, not a sidebar group)
    await expect(page.locator('#group-list .group-item')).toHaveCount(2);
    await expect(page.locator('#group-list .group-item').nth(1)).toContainText('My New List');
  });

  test('can rename a group via inline action button', async ({ page }) => {
    page.once('dialog', (dialog) => dialog.accept('Original Name'));
    await page.click('#add-group-btn');

    // Click the group to activate it (shows action buttons)
    await page.locator('#group-list .group-item').nth(1).click();

    // Rename button appears on active group
    page.once('dialog', (dialog) => dialog.accept('Renamed List'));
    await page.locator('.g-action-btn[data-action="rename"]').click();

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
    page.once('dialog', (dialog) => dialog.dismiss());
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

  test('clicking history tab switches to history mode', async ({ page }) => {
    await page.click('#tab-history');
    await expect(page.locator('#tab-history')).toHaveClass(/active/);
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'history');
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
    page.once('dialog', (dialog) => dialog.accept('Target Group'));
    await page.click('#add-group-btn');
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
    page.once('dialog', (dialog) => dialog.accept('Target'));
    await page.click('#add-group-btn');
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
    page.once('dialog', (dialog) => dialog.accept('Second'));
    await page.click('#add-group-btn');
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
