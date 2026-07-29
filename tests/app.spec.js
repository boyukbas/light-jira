// @ts-check
const { test, expect } = require('@playwright/test');

const issueFixture = require('./fixtures/issue.json');
const searchFixture = require('./fixtures/search-results.json');
const filterFixture = require('./fixtures/filter.json');

// Inject a valid config into localStorage so the app starts configured
// (prevents settings modal from auto-opening). Also seeds a baseline existing
// state so the app treats the test as a RETURNING user — all tabs visible.
// Progressive disclosure hides advanced tabs only on a brand-new install, which
// the "Tab visibility" suite covers explicitly via initConfigFresh().
const initConfig = () => {
  const config = {
    email: 'test@example.com',
    token: 'fake-api-token',
    baseUrl: 'https://site.atlassian.net',
    useCloud: false,
  };
  localStorage.setItem('jira_config', JSON.stringify(config));
  if (!localStorage.getItem('jira_state')) {
    localStorage.setItem(
      'jira_state',
      JSON.stringify({
        groups: [
          { id: 'inbox', name: 'Inbox', keys: [] },
          { id: 'history', name: 'History', keys: [] },
        ],
        activeGroupId: 'inbox',
        tabVisibility: {
          jira: true,
          labels: true,
          timeline: true,
          history: true,
          notes: true,
          mindmap: true,
          snippets: true,
        },
      })
    );
  }
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register = () => Promise.resolve({});
  }
};

// Configured but with NO prior state — a genuine first run (advanced tabs hidden).
const initConfigFresh = () => {
  localStorage.setItem(
    'jira_config',
    JSON.stringify({
      email: 'test@example.com',
      token: 'fake-api-token',
      baseUrl: 'https://site.atlassian.net',
    })
  );
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

  test('sidebar collapses and can be uncollapsed via its own button', async ({ page }) => {
    await page.click('#sidebar-collapse-btn');
    await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
    // Wait for the 100ms CSS width transition to settle before measuring
    await page.waitForTimeout(200);
    // The uncollapse button must be fully within the 48px collapsed sidebar (not clipped by overflow:hidden)
    const sidebarBox = await page.locator('#sidebar').boundingBox();
    const btnBox = await page.locator('#sidebar-collapse-btn').boundingBox();
    expect(btnBox.x + btnBox.width).toBeLessThanOrEqual(sidebarBox.x + sidebarBox.width);
    await page.click('#sidebar-collapse-btn');
    await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
  });

  test('middle pane collapses and can be uncollapsed via its own button', async ({ page }) => {
    await page.click('#middle-collapse-btn');
    await expect(page.locator('#middle')).toHaveClass(/collapsed/);
    await expect(page.locator('#middle-collapse-btn')).toBeVisible();
    await page.click('#middle-collapse-btn');
    await expect(page.locator('#middle')).not.toHaveClass(/collapsed/);
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
    // No initConfig — open Settings explicitly (the app no longer auto-opens it).
    await page.goto('/');
    await page.click('#settings-btn');
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

  test('saving without a Jira URL shows a guiding error and keeps the modal open', async ({
    page,
  }) => {
    await page.goto('/');
    await page.click('#settings-btn');
    await page.fill('#cfg-email', 'user@test.com');
    await page.fill('#cfg-token', 'tok');
    await page.fill('#cfg-url', ''); // forgot to set the site
    await page.click('#settings-save');
    await expect(page.locator('#settings-overlay')).not.toHaveClass(/hidden/);
    await expect(page.locator('#cfg-url')).toHaveClass(/input-error/);
    await expect(page.locator('.field-error')).toContainText(/Jira/i);
  });

  test('saving the example placeholder URL is rejected', async ({ page }) => {
    await page.goto('/');
    await page.click('#settings-btn');
    await page.fill('#cfg-url', 'https://your-domain.atlassian.net');
    await page.click('#settings-save');
    await expect(page.locator('#settings-overlay')).not.toHaveClass(/hidden/);
    await expect(page.locator('.field-error')).toBeVisible();
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

  test('API token field has a help link to the Atlassian token page', async ({ page }) => {
    await page.addInitScript(initConfig);
    await page.goto('/');
    await page.click('#settings-btn');
    const link = page.locator('#settings-modal a[href*="atlassian.com"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('history limit field is not present in settings', async ({ page }) => {
    await page.addInitScript(initConfig);
    await page.goto('/');
    await page.click('#settings-btn');
    await expect(page.locator('#cfg-hist-limit')).toHaveCount(0);
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
    await page.locator('#search-input').press('Enter');

    // Ticket list uses .list-card class
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#ticket-list .list-card').first()).toContainText('PROJ-123');
  });

  test('selecting a ticket shows it in the reading pane', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');

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
    await page.locator('#search-input').press('Enter');

    // Card must eventually show the real summary, not "Loading..."
    await expect(page.locator('#ticket-list .list-card').first()).toContainText(
      'Test ticket summary for automation',
      { timeout: 5000 }
    );
  });

  test('ticket key is normalised from lowercase input', async ({ page }) => {
    await page.fill('#search-input', 'proj-123');
    await page.locator('#search-input').press('Enter');

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
    await page.locator('#search-input').press('Enter');

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

  test('JQL input is classified as filter and loads a filter group', async ({ page }) => {
    await page.fill('#search-input', 'project = PROJ ORDER BY updated DESC');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#group-list .group-item')).toHaveCount(2, { timeout: 5000 });
  });

  test('loading JQL via search bar creates a filter group with 3 tickets', async ({ page }) => {
    await page.fill('#search-input', 'project = PROJ ORDER BY updated DESC');
    await page.locator('#search-input').press('Enter');

    // Inbox + filter group = 2
    await expect(page.locator('#group-list .group-item')).toHaveCount(2, { timeout: 5000 });
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(3);
  });

  test('loading by filter ID uses filter name as group name', async ({ page }) => {
    await page.fill('#search-input', '12345');
    await page.locator('#search-input').press('Enter');

    await expect(page.locator('#group-list .group-item').nth(1)).toContainText('My Test Filter', {
      timeout: 5000,
    });
  });

  test('pasting filter URL in search bar loads tickets', async ({ page }) => {
    await page.fill('#search-input', 'https://site.atlassian.net/issues/?filter=12345');
    await page.locator('#search-input').press('Enter');

    await expect(page.locator('#ticket-list .list-card')).toHaveCount(3, { timeout: 5000 });
  });

  test('filter tickets do not appear in Inbox after switching to it', async ({ page }) => {
    await page.fill('#search-input', 'project = PROJ');
    await page.locator('#search-input').press('Enter');

    await expect(page.locator('#group-list .group-item')).toHaveCount(2, { timeout: 5000 });

    // Switch to Inbox
    await page.locator('#group-list .group-item').first().click();
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(0);
  });
});

// ── 4b. PLANS URL ─────────────────────────────────────────────────────────────
test.describe('Plans URL', () => {
  const PLAN_URL = 'https://site.atlassian.net/jira/plans/6083/scenarios/6099/timeline?vid=8813';

  function mockPlanRoute(page) {
    page.route(
      (url) => url.toString().includes('/rest/agile/1.0/plan/'),
      async (route) => {
        const reqUrl = route.request().url();
        if (reqUrl.includes('/issue')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(searchFixture),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: 6083, title: 'My Roadmap' }),
          });
        }
      }
    );
  }

  test('plans URL loads a filter group when submitted', async ({ page }) => {
    await page.addInitScript(initConfig);
    mockPlanRoute(page);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', PLAN_URL);
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#group-list .group-item')).toHaveCount(2, { timeout: 5000 });
  });

  test('loading a plans URL creates a group named after the plan', async ({ page }) => {
    await page.addInitScript(initConfig);
    mockPlanRoute(page);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', PLAN_URL);
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#group-list .group-item').nth(1)).toContainText('My Roadmap', {
      timeout: 5000,
    });
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(3);
  });

  test('plans API 404 shows helpful error toast', async ({ page }) => {
    await page.addInitScript(initConfig);
    page.route(
      (url) => url.toString().includes('/rest/agile/1.0/plan/'),
      async (route) => {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      }
    );
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', PLAN_URL);
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#toast')).toContainText('Jira Premium', { timeout: 5000 });
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

  test('Notes tab appears before Mindmap in aux-tab-bar', async ({ page }) => {
    const tabs = await page.locator('#aux-tab-bar .tab-btn').allTextContents();
    const cleaned = tabs.map((t) => t.trim());
    const notesIdx = cleaned.findIndex((t) => t.includes('Notes'));
    const mindmapIdx = cleaned.findIndex((t) => t.includes('Mindmap'));
    expect(notesIdx).toBeGreaterThanOrEqual(0);
    expect(notesIdx).toBeLessThan(mindmapIdx);
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

  test('diagram name input is visible and pre-filled in editor header', async ({ page }) => {
    await page.click('#tab-mindmap');
    await expect(page.locator('#mm-diagram-name')).toBeVisible({ timeout: 3000 });
    // Default diagram name is pre-filled (not empty)
    const val = await page.locator('#mm-diagram-name').inputValue();
    expect(val.trim().length).toBeGreaterThan(0);
  });

  test('typing in diagram name input updates sidebar title live', async ({ page }) => {
    await page.click('#tab-mindmap');
    await expect(page.locator('#mm-diagram-list .mm-diagram-item')).toHaveCount(1, {
      timeout: 3000,
    });
    await page.fill('#mm-diagram-name', 'My Custom Diagram');
    await expect(page.locator('#mm-diagram-list .mm-diagram-title').first()).toHaveText(
      'My Custom Diagram'
    );
  });

  test('diagram name persists after switching diagrams and back', async ({ page }) => {
    await page.click('#tab-mindmap');
    await expect(page.locator('#mm-diagram-list .mm-diagram-item')).toHaveCount(1, {
      timeout: 3000,
    });
    await page.fill('#mm-diagram-name', 'First Renamed');
    // Create a second diagram and switch to it
    await page.click('#mm-add-btn');
    await expect(page.locator('#mm-diagram-list .mm-diagram-item')).toHaveCount(2, {
      timeout: 3000,
    });
    // Switch back to the first diagram
    await page.locator('#mm-diagram-list .mm-diagram-item').first().click();
    await expect(page.locator('#mm-diagram-name')).toHaveValue('First Renamed');
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

  test('Labels tab is after Jira in main tab-bar', async ({ page }) => {
    const tabs = await page.locator('#tab-bar .tab-btn').allTextContents();
    const cleaned = tabs.map((t) => t.trim());
    const jiraIdx = cleaned.findIndex((t) => t.includes('Jira'));
    const labelsIdx = cleaned.findIndex((t) => t.includes('Labels'));
    expect(jiraIdx).toBeGreaterThanOrEqual(0);
    expect(jiraIdx).toBeLessThan(labelsIdx);
  });

  test('switching to Labels tab changes app mode', async ({ page }) => {
    await page.click('#tab-labels');
    await expect(page.locator('#tab-labels')).toHaveClass(/active/);
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'labels');
  });

  test('Labels tab does not show no-label group for unlabeled tickets', async ({ page }) => {
    // Load a ticket (has no labels by default)
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });

    await page.click('#tab-labels');
    // Unlabeled tickets should not produce a "no-label" group
    await expect(page.locator('#group-list')).not.toContainText('no-label');
  });

  test('Find Duplicates button is hidden in Labels mode', async ({ page }) => {
    await page.click('#tab-labels');
    await expect(page.locator('#find-duplicates-btn')).not.toBeVisible();
  });

  test('Find Duplicates button is visible in Jira mode', async ({ page }) => {
    await expect(page.locator('#find-duplicates-btn')).toBeVisible();
  });

  test('Labels tab shows labeled ticket under its label group', async ({ page }) => {
    // Load a ticket and assign a label via state
    await page.addInitScript(() => {
      const orig = localStorage.setItem.bind(localStorage);
      // After app initializes, inject a label
    });

    // Assign a label programmatically then switch to labels tab
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
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
    await page.locator('#search-input').press('Enter');
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
    await page.locator('#search-input').press('Enter');
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
    await page.locator('#search-input').press('Enter');

    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });

    // History is recorded and persisted asynchronously after the ticket opens,
    // so poll the stored state rather than reading it once — a single read can
    // win the race against the write (source of intermittent flakiness).
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const s = JSON.parse(localStorage.getItem('jira_state') || '{}');
            const hist = (s.groups || []).find((g) => g.id === 'history');
            return hist ? hist.keys.length : 0;
          }),
        { timeout: 5000 }
      )
      .toBeGreaterThan(0);
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
      await page.locator('#search-input').press('Enter');
      await expect(page.locator('#ticket-list .list-card.active')).toBeVisible({ timeout: 5000 });
    }
    await page.click('#tab-history');
    await expect(page.locator('.ht-row')).toHaveCount(3, { timeout: 5000 });
  }

  test('sortable column headers render with sort indicators', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
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
    const keys1 = await page
      .locator('.ht-row')
      .evaluateAll((rows) => rows.map((r) => r.dataset.key));
    expect(keys1).toEqual(['PROJ-100', 'PROJ-200', 'PROJ-300']);

    // 2nd click → descending
    await page.click('.ht-th-sortable[data-sort-col="key"]');
    const keys2 = await page
      .locator('.ht-row')
      .evaluateAll((rows) => rows.map((r) => r.dataset.key));
    expect(keys2).toEqual(['PROJ-300', 'PROJ-200', 'PROJ-100']);

    // 3rd click → natural order restored [300, 100, 200]
    await page.click('.ht-th-sortable[data-sort-col="key"]');
    const keys3 = await page
      .locator('.ht-row')
      .evaluateAll((rows) => rows.map((r) => r.dataset.key));
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
    await expect(page.locator('.ht-th-sortable[data-sort-col="summary"]')).not.toHaveAttribute(
      'data-sort-active'
    );
  });

  test('resize handles are present on every sortable column header', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
    await page.click('#tab-history');
    // 6 sortable columns: key, summary, status, assignee, created, viewed
    await expect(page.locator('.ht-th-sortable .ht-resize-handle')).toHaveCount(6);
  });

  test('dragging resize handle changes column width', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
    await page.click('#tab-history');

    const keyTh = page.locator('.ht-th-sortable[data-sort-col="key"]');
    const beforeW = await keyTh.evaluate((el) => el.offsetWidth);

    // Dispatch mouse events directly — page.mouse does not reliably target
    // position-absolute children inside sticky <th> elements in headless Chromium.
    const afterW = await page.evaluate(() => {
      const th = document.querySelector('.ht-th-sortable[data-sort-col="key"]');
      const handle = th.querySelector('.ht-resize-handle');
      handle.dispatchEvent(
        new MouseEvent('mousedown', { clientX: 100, bubbles: true, cancelable: true })
      );
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 160, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return th.offsetWidth;
    });
    expect(afterW).toBeGreaterThan(beforeW + 40);
  });

  test('resized column width persists after sort re-render', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
    await page.click('#tab-history');

    // Resize the Key column by 60px
    const beforeW = await page.evaluate(() => {
      const th = document.querySelector('.ht-th-sortable[data-sort-col="key"]');
      const handle = th.querySelector('.ht-resize-handle');
      handle.dispatchEvent(
        new MouseEvent('mousedown', { clientX: 100, bubbles: true, cancelable: true })
      );
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 160, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return th.offsetWidth;
    });
    expect(beforeW).toBeGreaterThan(100);

    // Trigger a sort (re-renders the table)
    await page.click('.ht-th-sortable[data-sort-col="key"]');

    // Width should be preserved
    const afterSortW = await page
      .locator('.ht-th-sortable[data-sort-col="key"]')
      .evaluate((el) => el.offsetWidth);
    expect(afterSortW).toBeCloseTo(beforeW, -1); // within 10px
  });

  test('mousedown on resize handle alone does not change column width', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
    await page.click('#tab-history');

    const { beforeW, afterW } = await page.evaluate(() => {
      const th = document.querySelector('.ht-th-sortable[data-sort-col="key"]');
      const beforeW = th.offsetWidth;
      const handle = th.querySelector('.ht-resize-handle');
      handle.dispatchEvent(
        new MouseEvent('mousedown', { clientX: 100, bubbles: true, cancelable: true })
      );
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return { beforeW, afterW: th.offsetWidth };
    });
    expect(afterW).toBe(beforeW);
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
    await page.locator('#search-input').press('Enter');
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
    await expect(page.locator('#mm-code')).toHaveValue(/sequenceDiagram/);
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

  test('docs button is visible and links to Mermaid docs', async ({ page }) => {
    await page.click('#tab-mindmap');
    const docsBtn = page.locator('#mm-docs-btn');
    await expect(docsBtn).toBeVisible({ timeout: 3000 });
    const href = await docsBtn.getAttribute('href');
    expect(href).toContain('mermaid.js.org');
  });

  test('dice button is visible in editor header', async ({ page }) => {
    await page.click('#tab-mindmap');
    await expect(page.locator('#mm-dice-btn')).toBeVisible({ timeout: 3000 });
  });

  test('dice button loads a valid Mermaid example into the textarea', async ({ page }) => {
    await page.click('#tab-mindmap');
    await page.click('#mm-dice-btn');
    const code = await page.locator('#mm-code').inputValue();
    const knownTypes = [
      'flowchart',
      'sequenceDiagram',
      'classDiagram',
      'stateDiagram',
      'erDiagram',
      'gantt',
      'pie',
      'gitGraph',
      'mindmap',
      'timeline',
      'journey',
      'quadrantChart',
      'xychart-beta',
    ];
    expect(knownTypes.some((t) => code.includes(t))).toBe(true);
  });

  test('dice button updates the diagram name to the example type', async ({ page }) => {
    await page.click('#tab-mindmap');
    await page.click('#mm-dice-btn');
    const name = await page.locator('#mm-diagram-name').inputValue();
    const knownNames = [
      'Flowchart',
      'Sequence Diagram',
      'Class Diagram',
      'State Diagram',
      'ER Diagram',
      'Gantt Chart',
      'Pie Chart',
      'Git Graph',
      'Mind Map',
      'Timeline',
      'User Journey',
      'Quadrant Chart',
      'XY Chart',
    ];
    expect(knownNames.includes(name)).toBe(true);
  });

  test('dice button updates the sidebar title to the example type', async ({ page }) => {
    await page.click('#tab-mindmap');
    await page.click('#mm-dice-btn');
    const sidebarTitle = await page
      .locator('#mm-diagram-list .mm-diagram-title')
      .first()
      .textContent();
    const knownNames = [
      'Flowchart',
      'Sequence Diagram',
      'Class Diagram',
      'State Diagram',
      'ER Diagram',
      'Gantt Chart',
      'Pie Chart',
      'Git Graph',
      'Mind Map',
      'Timeline',
      'User Journey',
      'Quadrant Chart',
      'XY Chart',
    ];
    expect(knownNames.includes(sidebarTitle.trim())).toBe(true);
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
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(1, { timeout: 5000 });
    await page.fill('#search-input', 'PROJ-456');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(2, { timeout: 5000 });
  });

  // ── Core click behaviour ───────────────────────────────────────────────────

  test('plain click opens ticket — not checkbox selection', async ({ page }) => {
    await page.locator('#ticket-list .list-card').first().click();
    // Reading pane content should become visible
    await expect(page.locator('#reading-content')).toBeVisible({ timeout: 3000 });
    // No card should be "selected" (bulk-selected)
    await expect(page.locator('#ticket-list .list-card.selected')).toHaveCount(0);
  });

  test('ctrl+click selects ticket without making it active', async ({ page }) => {
    // ctrl+click the second card (no prior active)
    await page
      .locator('#ticket-list .list-card')
      .nth(1)
      .click({ modifiers: ['Control'] });
    // second card should have .selected but NOT .active
    await expect(page.locator('#ticket-list .list-card').nth(1)).toHaveClass(/selected/);
    await expect(page.locator('#ticket-list .list-card').nth(1)).not.toHaveClass(/active/);
  });

  test('ctrl+click toggles deselection of already selected ticket', async ({ page }) => {
    const card = page.locator('#ticket-list .list-card').first();
    await card.click({ modifiers: ['Control'] });
    await expect(page.locator('#ticket-list .list-card.selected')).toHaveCount(1);
    await card.click({ modifiers: ['Control'] });
    await expect(page.locator('#ticket-list .list-card.selected')).toHaveCount(0);
  });

  test('shift+click selects all tickets in range', async ({ page }) => {
    // Add a third ticket so we can test a range of 3
    await page.fill('#search-input', 'PROJ-789');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(3, { timeout: 5000 });

    // ctrl+click first to set anchor, then shift+click third
    await page
      .locator('#ticket-list .list-card')
      .first()
      .click({ modifiers: ['Control'] });
    await page
      .locator('#ticket-list .list-card')
      .nth(2)
      .click({ modifiers: ['Shift'] });
    await expect(page.locator('#ticket-list .list-card.selected')).toHaveCount(3);
  });

  test('plain click after selection clears selection and opens ticket', async ({ page }) => {
    // First ctrl+click to build up a selection
    await page
      .locator('#ticket-list .list-card')
      .first()
      .click({ modifiers: ['Control'] });
    await expect(page.locator('#ticket-list .list-card.selected')).toHaveCount(1);
    // Now plain click the second card
    await page.locator('#ticket-list .list-card').nth(1).click();
    // Selection should be cleared
    await expect(page.locator('#ticket-list .list-card.selected')).toHaveCount(0);
    // The clicked card should now be active
    await expect(page.locator('#ticket-list .list-card').nth(1)).toHaveClass(/active/);
  });

  // ── Toolbar visibility ─────────────────────────────────────────────────────

  test('bulk toolbar is hidden when no selection', async ({ page }) => {
    await expect(page.locator('#bulk-toolbar')).not.toHaveClass(/visible/);
  });

  test('bulk toolbar appears when a ticket is ctrl+clicked', async ({ page }) => {
    await page
      .locator('#ticket-list .list-card')
      .first()
      .click({ modifiers: ['Control'] });
    await expect(page.locator('#bulk-toolbar')).toHaveClass(/visible/);
  });

  test('bulk toolbar hides when plain click clears selection', async ({ page }) => {
    await page
      .locator('#ticket-list .list-card')
      .first()
      .click({ modifiers: ['Control'] });
    await expect(page.locator('#bulk-toolbar')).toHaveClass(/visible/);
    await page.locator('#ticket-list .list-card').nth(1).click();
    await expect(page.locator('#bulk-toolbar')).not.toHaveClass(/visible/);
  });

  test('switching groups clears selection and hides toolbar', async ({ page }) => {
    await createGroup(page, 'Other Group');
    // Go back to Inbox and select a ticket
    await page.locator('#group-list .group-item').first().click();
    await page
      .locator('#ticket-list .list-card')
      .first()
      .click({ modifiers: ['Control'] });
    await expect(page.locator('#bulk-toolbar')).toHaveClass(/visible/);
    // Switch to Other Group
    await page.locator('#group-list .group-item').last().click();
    await expect(page.locator('#bulk-toolbar')).not.toHaveClass(/visible/);
    await expect(page.locator('#ticket-list .list-card.selected')).toHaveCount(0);
  });

  test('switching to Labels tab clears selection and hides toolbar', async ({ page }) => {
    await page
      .locator('#ticket-list .list-card')
      .first()
      .click({ modifiers: ['Control'] });
    await expect(page.locator('#bulk-toolbar')).toHaveClass(/visible/);
    await page.click('#tab-labels');
    await expect(page.locator('#bulk-toolbar')).not.toHaveClass(/visible/);
  });

  // ── Toolbar position ───────────────────────────────────────────────────────

  test('bulk toolbar is positioned above the ticket list in DOM', async ({ page }) => {
    const order = await page.evaluate(() => {
      const mid = document.getElementById('middle');
      const ids = Array.from(mid.children).map((el) => el.id);
      return { toolbar: ids.indexOf('bulk-toolbar'), list: ids.indexOf('ticket-list') };
    });
    expect(order.toolbar).toBeGreaterThanOrEqual(0);
    expect(order.toolbar).toBeLessThan(order.list);
  });

  // ── Toolbar actions ────────────────────────────────────────────────────────

  test('Delete button is disabled when no tickets are selected', async ({ page }) => {
    await expect(page.locator('#bulk-delete-btn')).toBeDisabled();
  });

  test('Delete button is enabled when tickets are ctrl+clicked', async ({ page }) => {
    await page
      .locator('#ticket-list .list-card')
      .first()
      .click({ modifiers: ['Control'] });
    await expect(page.locator('#bulk-delete-btn')).toBeEnabled();
  });

  test('bulk delete removes selected tickets', async ({ page }) => {
    await page
      .locator('#ticket-list .list-card')
      .first()
      .click({ modifiers: ['Control'] });
    await page.click('#bulk-delete-btn');
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(1, { timeout: 3000 });
  });

  test('bulk delete hides toolbar after removing all selected', async ({ page }) => {
    await page
      .locator('#ticket-list .list-card')
      .first()
      .click({ modifiers: ['Control'] });
    await page.click('#bulk-delete-btn');
    await expect(page.locator('#bulk-toolbar')).not.toHaveClass(/visible/);
  });

  test('bulk move transfers selected tickets to another group', async ({ page }) => {
    await createGroup(page, 'Target Group');
    await expect(page.locator('#group-list .group-item')).toHaveCount(2, { timeout: 3000 });

    await page.locator('#group-list .group-item').first().click();
    await page
      .locator('#ticket-list .list-card')
      .first()
      .click({ modifiers: ['Control'] });
    await page.selectOption('#bulk-move-select', { label: 'Target Group' });

    await expect(page.locator('#ticket-list .list-card')).toHaveCount(1, { timeout: 3000 });
  });

  test('bulk delete icon-only button has title attribute', async ({ page }) => {
    await expect(page.locator('#bulk-delete-btn')).toHaveAttribute('title');
    const text = await page.locator('#bulk-delete-btn').textContent();
    expect(text.trim()).toBe('');
  });

  test('typing in bulk-assign-input shows matching users', async ({ page }) => {
    const usersFixture = [
      { accountId: 'user-bob-456', displayName: 'Bob Builder', emailAddress: 'bob@example.com' },
    ];
    page.route(
      (url) => url.toString().includes('/rest/api/3/user/search'),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(usersFixture),
        });
      }
    );
    // First select a ticket so the assign input is enabled
    await page
      .locator('#ticket-list .list-card')
      .first()
      .click({ modifiers: ['Control'] });
    await page.fill('#bulk-assign-input', 'Bob');
    await expect(
      page.locator('#bulk-assign-results .bulk-assign-result:text("Bob Builder")')
    ).toBeVisible({ timeout: 3000 });
  });

  test('selecting a user from bulk-assign dropdown calls PUT for each selected ticket', async ({
    page,
  }) => {
    const usersFixture = [
      { accountId: 'user-bob-456', displayName: 'Bob Builder', emailAddress: 'bob@example.com' },
    ];
    page.route(
      (url) => url.toString().includes('/rest/api/3/user/search'),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(usersFixture),
        });
      }
    );
    const putBodies = [];
    page.route(
      (url) => url.toString().includes('/rest/api/3/issue/'),
      async (route) => {
        if (route.request().method() === 'PUT') {
          putBodies.push(route.request().postDataJSON());
          await route.fulfill({ status: 204, body: '' });
        } else {
          await route.continue();
        }
      }
    );

    // Select both tickets with ctrl+click
    await page
      .locator('#ticket-list .list-card')
      .nth(0)
      .click({ modifiers: ['Control'] });
    await page
      .locator('#ticket-list .list-card')
      .nth(1)
      .click({ modifiers: ['Control'] });

    await page.fill('#bulk-assign-input', 'Bob');
    await page
      .locator('#bulk-assign-results .bulk-assign-result:text("Bob Builder")')
      .click({ timeout: 3000 });

    await expect(async () => {
      expect(putBodies.length).toBe(2);
      expect(putBodies.every((b) => b?.fields?.assignee?.accountId === 'user-bob-456')).toBe(true);
    }).toPass({ timeout: 5000 });
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
    await page.locator('#search-input').press('Enter');
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
    await page.locator('#search-input').press('Enter');
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
    await page
      .locator('#reading-content a[href*="/browse/ENHANCE-3133"]:not(.jira-link-icon)')
      .click();
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
      .locator('#reading-content a[href*="/browse/ENHANCE-3133"]:not(.jira-link-icon)')
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
    await page.locator('#search-input').press('Enter');

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
    await page.locator('#search-input').press('Enter');

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
    await page.locator('#search-input').press('Enter');

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
    await page.locator('#search-input').press('Enter');
    await page.fill('#search-input', 'PROJ-2');
    await page.locator('#search-input').press('Enter');
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

  test('dragging a card down lands it after the drop target (displacement)', async ({ page }) => {
    // Add a third ticket so we can prove direction-aware displacement, not just swap.
    await page.fill('#search-input', 'PROJ-3');
    await page.locator('#search-input').press('Enter');
    const cards = page.locator('#ticket-list .list-card');
    await expect(cards).toHaveCount(3, { timeout: 3000 });
    const [k0, k1, k2] = await Promise.all([
      cards.nth(0).getAttribute('data-key'),
      cards.nth(1).getAttribute('data-key'),
      cards.nth(2).getAttribute('data-key'),
    ]);

    // Drag the top card DOWN onto the middle card → it should land AFTER it.
    await cards.nth(0).dispatchEvent('dragstart');
    await cards.nth(1).dispatchEvent('dragover');
    await cards.nth(1).dispatchEvent('drop');

    await expect(cards.nth(0)).toHaveAttribute('data-key', k1);
    await expect(cards.nth(1)).toHaveAttribute('data-key', k0);
    await expect(cards.nth(2)).toHaveAttribute('data-key', k2);
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

// ── 9b. DRAG-REORDER AUX LISTS (notes / mindmap / snippets) ───────────────────
test.describe('Drag-reorder aux lists', () => {
  test.beforeEach(async ({ page }) => {
    mockFieldsRoute(page);
    mockIssueRoute(page, issueFixture);
    await page.addInitScript(initConfig);
    await page.goto('/');
  });

  test('dragging a note reorders it in the sidebar', async ({ page }) => {
    await page.click('#tab-notes');
    await page.click('#add-note-btn');
    await page.click('#add-note-btn');
    const items = page.locator('#nc-notes-list .nc-note-item');
    await expect(items).toHaveCount(2, { timeout: 3000 });
    const id0 = await items.nth(0).getAttribute('data-id');
    const id1 = await items.nth(1).getAttribute('data-id');

    await items.nth(0).dispatchEvent('dragstart');
    await items.nth(1).dispatchEvent('dragover');
    await items.nth(1).dispatchEvent('drop');

    await expect(items.nth(0)).toHaveAttribute('data-id', id1);
    await expect(items.nth(1)).toHaveAttribute('data-id', id0);
  });

  test('dragging a diagram reorders it in the sidebar', async ({ page }) => {
    await page.click('#tab-mindmap');
    const items = page.locator('#mm-diagram-list .mm-diagram-item');
    await expect(items).toHaveCount(1, { timeout: 3000 }); // auto-seeded default
    await page.click('#mm-add-btn');
    await expect(items).toHaveCount(2, { timeout: 3000 });
    const id0 = await items.nth(0).getAttribute('data-id');
    const id1 = await items.nth(1).getAttribute('data-id');

    await items.nth(0).dispatchEvent('dragstart');
    await items.nth(1).dispatchEvent('dragover');
    await items.nth(1).dispatchEvent('drop');

    await expect(items.nth(0)).toHaveAttribute('data-id', id1);
    await expect(items.nth(1)).toHaveAttribute('data-id', id0);
  });

  test('dragging a snippet reorders it in the sidebar', async ({ page }) => {
    await page.click('#tab-snippets');
    await page.click('#add-cb-btn');
    await page.click('#add-cb-btn');
    const items = page.locator('#cb-snippet-list .cb-item');
    await expect(items).toHaveCount(2, { timeout: 3000 });
    const id0 = await items.nth(0).getAttribute('data-id');
    const id1 = await items.nth(1).getAttribute('data-id');

    await items.nth(0).dispatchEvent('dragstart');
    await items.nth(1).dispatchEvent('dragover');
    await items.nth(1).dispatchEvent('drop');

    await expect(items.nth(0)).toHaveAttribute('data-id', id1);
    await expect(items.nth(1)).toHaveAttribute('data-id', id0);
  });

  test('reordering within a group filter preserves other-group items', async ({ page }) => {
    // Two notes in "All"; verify the underlying array reorder is index-correct
    // even though the sidebar shows a filtered view.
    await page.click('#tab-notes');
    await page.click('#add-note-btn');
    await page.click('#add-note-btn');
    const items = page.locator('#nc-notes-list .nc-note-item');
    await expect(items).toHaveCount(2, { timeout: 3000 });
    const id0 = await items.nth(0).getAttribute('data-id');

    await items.nth(0).dispatchEvent('dragstart');
    await items.nth(1).dispatchEvent('dragover');
    await items.nth(1).dispatchEvent('drop');

    // The moved note is now second; both notes still present (none lost).
    await expect(items).toHaveCount(2);
    await expect(items.nth(1)).toHaveAttribute('data-id', id0);
  });
});

// ── openTicketByKey guards ────────────────────────────────────────────────────
test.describe('openTicketByKey guards', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
  });

  test('beaming to a deleted targetGroupId falls back with a toast warning', async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('jira-beam', {
          detail: { type: 'open-url', url: 'PROJ-99', targetGroupId: 'nonexistent-group' },
        })
      );
    });
    // Ticket should still be added somewhere (default group)
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
    // A warning toast must inform the user the target was not found
    await expect(page.locator('#toast')).toContainText('not found', { timeout: 3000 });
  });

  test('beaming to a filter group targetGroupId routes to default group instead', async ({
    page,
  }) => {
    // Seed a filter group alongside the default groups via addInitScript so it is in
    // place before the app's loadState() runs on reload — a plain evaluate()+reload()
    // races the app's own save and the seed gets clobbered.
    await page.addInitScript(() => {
      localStorage.setItem(
        'jira_state',
        JSON.stringify({
          groups: [
            { id: 'inbox', name: 'Inbox', keys: [] },
            {
              id: 'g_filter',
              name: 'My Filter',
              keys: ['PROJ-10'],
              isFilter: true,
              query: 'project = PROJ',
            },
            { id: 'history', name: 'History', keys: [] },
          ],
          activeGroupId: 'inbox',
        })
      );
    });
    await page.reload();
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('jira-beam', {
          detail: { type: 'open-url', url: 'PROJ-99', targetGroupId: 'g_filter' },
        })
      );
    });
    // PROJ-99 must NOT appear in the filter group's keys
    const filterKeys = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('jira_state'));
      return s.groups.find((g) => g.id === 'g_filter').keys;
    });
    expect(filterKeys).not.toContain('PROJ-99');
    // It should be in the default group (Inbox)
    const inboxKeys = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('jira_state'));
      return s.groups.find((g) => g.id === 'inbox').keys;
    });
    expect(inboxKeys).toContain('PROJ-99');
  });
});

// ── 12. JIRA BEAM EXTENSION INTEGRATION ──────────────────────────────────────
test.describe('Jira Beam', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
  });

  test('open-url beam with ticket key opens the ticket', async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('jira-beam', { detail: { type: 'open-url', url: 'PROJ-123' } })
      );
    });
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
  });

  test('open-url beam with Jira browse URL extracts key and opens ticket', async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('jira-beam', {
          detail: { type: 'open-url', url: 'https://site.atlassian.net/browse/PROJ-123' },
        })
      );
    });
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
  });

  test('open-group beam creates a named group with the given keys', async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('jira-beam', {
          detail: { type: 'open-group', name: 'Sprint 42', keys: ['PROJ-1', 'PROJ-2', 'PROJ-3'] },
        })
      );
    });
    await expect(page.locator('#group-list .group-item').nth(1)).toContainText('Sprint 42', {
      timeout: 3000,
    });
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(3, { timeout: 5000 });
  });

  test('open-group beam shows a success toast', async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('jira-beam', {
          detail: { type: 'open-group', name: 'My Sprint', keys: ['PROJ-1', 'PROJ-2'] },
        })
      );
    });
    await expect(page.locator('#toast')).toContainText('Beamed 2 tickets', { timeout: 3000 });
  });

  test('?beam= URL param creates group on page load', async ({ page }) => {
    const payload = { type: 'open-group', name: 'Param Group', keys: ['PROJ-1', 'PROJ-2'] };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto(`/?beam=${encoded}`);
    await expect(page.locator('#group-list .group-item').nth(1)).toContainText('Param Group', {
      timeout: 3000,
    });
  });

  // Regression: a ?beam= URL param used to fire before loadState() populated the
  // in-memory state. handleBeam() would then save the default (empty) state back
  // to storage, wiping every pre-existing group, label, note, etc. This test
  // guarantees that the user's prior data survives a cold-load beam.
  test('?beam= URL param preserves pre-existing saved groups', async ({ page }) => {
    const payload = { type: 'open-group', name: 'Beamed Group', keys: ['PROJ-9'] };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
    await page.addInitScript(initConfig);
    await page.addInitScript(() => {
      localStorage.setItem(
        'jira_state',
        JSON.stringify({
          groups: [
            { id: 'inbox', name: 'Inbox', keys: [] },
            { id: 'g_saved', name: 'My Saved Group', keys: ['PROJ-5'] },
            { id: 'history', name: 'History', keys: [] },
          ],
          activeGroupId: 'inbox',
          activeKey: null,
          appMode: 'jira',
          notes: { 'PROJ-5': 'important note' },
          labels: { 'PROJ-5': ['urgent'] },
          labelColors: { urgent: '#f85149' },
        })
      );
    });
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto(`/?beam=${encoded}`);

    // The beamed group should appear…
    await expect(page.locator('#group-list .group-item', { hasText: 'Beamed Group' })).toBeVisible({
      timeout: 3000,
    });
    // …and the pre-existing saved group must still be there.
    await expect(
      page.locator('#group-list .group-item', { hasText: 'My Saved Group' })
    ).toBeVisible();

    // Persisted in storage too — the notes/labels should be intact.
    const persisted = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('jira_state') || '{}');
      return {
        groupIds: (s.groups || []).map((g) => g.id),
        note: s.notes?.['PROJ-5'] || null,
        label: s.labels?.['PROJ-5']?.[0] || null,
      };
    });
    expect(persisted.groupIds).toContain('g_saved');
    expect(persisted.note).toBe('important note');
    expect(persisted.label).toBe('urgent');
  });
});

// ── XSS SANITIZATION (Jira-rendered HTML) ────────────────────────────────────
test.describe('Jira HTML sanitization', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
  });

  test('script tags inside description do not execute', async ({ page }) => {
    const xssIssue = {
      ...issueFixture,
      key: 'PROJ-123',
      renderedFields: {
        description: '<p>before</p><script>window.__xss = 1;</script><p>after</p>',
      },
    };
    mockIssueRoute(page, xssIssue);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');

    await expect(page.locator('.description').first()).toContainText('before', { timeout: 5000 });
    // Script tag was stripped — no global set, and no <script> in the DOM.
    const hit = await page.evaluate(() => window.__xss);
    expect(hit).toBeUndefined();
    const scriptCount = await page.locator('.description script').count();
    expect(scriptCount).toBe(0);
  });

  test('onerror handlers on img are stripped', async ({ page }) => {
    const xssIssue = {
      ...issueFixture,
      key: 'PROJ-123',
      renderedFields: {
        description: '<img src="x" onerror="window.__xss=1">',
      },
    };
    mockIssueRoute(page, xssIssue);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');

    await expect(page.locator('#reading-content')).toBeVisible({ timeout: 5000 });
    // Let any pending error handler fire.
    await page.waitForTimeout(200);
    const hit = await page.evaluate(() => window.__xss);
    expect(hit).toBeUndefined();
    const hasOnerror = await page.locator('.description img[onerror]').count();
    expect(hasOnerror).toBe(0);
  });

  test('javascript: href is stripped from anchors', async ({ page }) => {
    const xssIssue = {
      ...issueFixture,
      key: 'PROJ-123',
      renderedFields: {
        description: '<a href="javascript:window.__xss=1" id="bad">click</a>',
      },
    };
    mockIssueRoute(page, xssIssue);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');

    await expect(page.locator('.description a').first()).toBeVisible({ timeout: 5000 });
    const href = await page.locator('.description a').first().getAttribute('href');
    expect(href).toBeNull();
  });

  // Regression: multiple sibling "unknown" tags (not allowlisted, not stripped)
  // used to crash the sanitizer with "null (reading 'removeChild')" — the old
  // unwrap path re-scanned the parent and detached a sibling mid-iteration.
  test('multiple sibling unknown tags in description do not crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const issue = {
      ...issueFixture,
      key: 'PROJ-123',
      renderedFields: {
        description: '<p>start</p><widget>alpha</widget><gadget>beta</gadget><p>end</p>',
      },
    };
    mockIssueRoute(page, issue);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');

    await expect(page.locator('.description').first()).toContainText('start', { timeout: 5000 });
    const text = await page.locator('.description').first().innerText();
    expect(text).toContain('alpha'); // unknown tag unwrapped, text kept
    expect(text).toContain('beta');
    expect(text).toContain('end');
    expect(errors).toEqual([]);
  });

  test('multiple sibling unknown tags in a comment do not crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const issue = {
      ...issueFixture,
      key: 'PROJ-123',
      fields: {
        ...issueFixture.fields,
        comment: {
          comments: [{ author: { displayName: 'Ada' }, created: '2026-01-01T00:00:00.000+0000' }],
          total: 1,
        },
      },
      renderedFields: {
        description: '<p>ok</p>',
        comment: { comments: [{ body: '<widget>one</widget><gadget>two</gadget>' }] },
      },
    };
    mockIssueRoute(page, issue);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');

    await expect(page.locator('.comment-item .c-body').first()).toBeVisible({ timeout: 5000 });
    const text = await page.locator('.comment-item .c-body').first().innerText();
    expect(text).toContain('one');
    expect(text).toContain('two');
    expect(errors).toEqual([]);
  });

  // <tt> is Jira's legacy monospace element ({{...}} / inline code). It is benign,
  // so it is allowlisted and preserved rather than unwrapped. Two siblings mirror
  // the real tickets that crashed the published build (TTN-116061, PAPI-80667).
  test('<tt> monospace tags are preserved', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const issue = {
      ...issueFixture,
      key: 'PROJ-123',
      renderedFields: {
        description: '<p>see <tt>CODE_A</tt> and <tt>CODE_B</tt></p>',
      },
    };
    mockIssueRoute(page, issue);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');

    await expect(page.locator('.description').first()).toContainText('see', { timeout: 5000 });
    await expect(page.locator('.description tt')).toHaveCount(2);
    await expect(page.locator('.description tt').first()).toHaveText('CODE_A');
    expect(errors).toEqual([]);
  });

  // C1: benign legacy/semantic tags Jira can emit are allowlisted (preserved),
  // not unwrapped to bare text.
  test('benign legacy tags (time/details/summary/wbr) are preserved', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const issue = {
      ...issueFixture,
      key: 'PROJ-123',
      renderedFields: {
        description:
          '<p>due <time datetime="2026-01-01">Jan 1</time><wbr /></p>' +
          '<details open><summary>More</summary><p>hidden</p></details>',
      },
    };
    mockIssueRoute(page, issue);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');

    await expect(page.locator('.description').first()).toContainText('due', { timeout: 5000 });
    await expect(page.locator('.description time')).toHaveCount(1);
    await expect(page.locator('.description time')).toHaveAttribute('datetime', '2026-01-01');
    await expect(page.locator('.description details')).toHaveCount(1);
    await expect(page.locator('.description summary')).toHaveText('More');
    await expect(page.locator('.description wbr')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  // C2: ADF <status>/<mention> tokens render as styled spans instead of flattening.
  test('<status> renders as a lozenge and <mention> as an @chip', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const issue = {
      ...issueFixture,
      key: 'PROJ-123',
      renderedFields: {
        description:
          '<p><status data-color="green">Done</status> by <mention>Ada Lovelace</mention></p>',
      },
    };
    mockIssueRoute(page, issue);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');

    await expect(page.locator('.description .jira-status')).toHaveText('Done', { timeout: 5000 });
    await expect(page.locator('.description .jira-status')).toHaveAttribute('data-color', 'green');
    await expect(page.locator('.description .jira-mention')).toHaveText('@Ada Lovelace');
    // Raw ADF tags are gone (replaced by spans).
    await expect(page.locator('.description status')).toHaveCount(0);
    await expect(page.locator('.description mention')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

// ── FIND DUPLICATES ───────────────────────────────────────────────────────────
test.describe('Find Duplicates', () => {
  // Seed state: PROJ-1 appears in both Inbox and Other → 1 duplicate
  const seedWithDupes = () => {
    localStorage.setItem(
      'jira_state',
      JSON.stringify({
        groups: [
          { id: 'inbox', name: 'Inbox', keys: ['PROJ-1', 'PROJ-2'] },
          { id: 'g_other', name: 'Other', keys: ['PROJ-1', 'PROJ-3'] },
          { id: 'history', name: 'History', keys: [] },
        ],
        activeGroupId: 'inbox',
        activeKey: null,
        appMode: 'jira',
        labels: {},
        labelColors: {},
        notes: {},
        standAloneNotes: [],
        mindMaps: [],
      })
    );
  };

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    await page.addInitScript(seedWithDupes);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
  });

  test('clicking find duplicates creates a Duplicates group', async ({ page }) => {
    await page.click('#find-duplicates-btn');
    await expect(page.locator('#group-list .group-item[data-id="inbox"]')).toBeVisible();
    const dupGroups = page.locator('#group-list .group-item').filter({ hasText: 'Duplicates' });
    await expect(dupGroups).toHaveCount(1);
  });

  test('clicking find duplicates twice creates only one Duplicates group', async ({ page }) => {
    await page.click('#find-duplicates-btn');
    await page.click('#find-duplicates-btn');
    const dupGroups = page.locator('#group-list .group-item').filter({ hasText: 'Duplicates' });
    await expect(dupGroups).toHaveCount(1);
  });

  test('second run reports same duplicate count as first run', async ({ page }) => {
    await page.click('#find-duplicates-btn');
    await expect(page.locator('#toast')).toContainText('Found 1 duplicate', { timeout: 3000 });
    await page.click('#find-duplicates-btn');
    await expect(page.locator('#toast')).toContainText('Found 1 duplicate', { timeout: 3000 });
  });
});

// ── FIELD EDITING (Story Points & Assignee) ───────────────────────────────────
test.describe('Field Editing', () => {
  const usersFixture = [
    { accountId: 'user-bob-456', displayName: 'Bob Builder', emailAddress: 'bob@example.com' },
  ];

  function mockPutRoute(page, onBody) {
    page.route(
      (url) => url.toString().includes('/rest/api/3/issue/PROJ-123'),
      async (route) => {
        if (route.request().method() === 'PUT') {
          const body = route.request().postDataJSON();
          onBody(body);
          await route.fulfill({ status: 204, body: '' });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(issueFixture),
          });
        }
      }
    );
  }

  function mockUserSearchRoute(page) {
    page.route(
      (url) => url.toString().includes('/rest/api/3/user/search'),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(usersFixture),
        });
      }
    );
  }

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
    // Open PROJ-123 and select it
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('#reading-content')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.meta-grid')).toBeVisible({ timeout: 5000 });
  });

  test('story points are shown in the meta grid', async ({ page }) => {
    await expect(page.locator('.meta-label:text("Story Points")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-editable="story-points"] .meta-value')).toContainText('5');
  });

  test('clicking story points shows an inline number input', async ({ page }) => {
    await page.locator('[data-editable="story-points"] .meta-value').click();
    await expect(page.locator('[data-editable="story-points"] input[type="number"]')).toBeVisible();
  });

  test('editing story points saves to Jira API', async ({ page }) => {
    let putBody = null;
    mockPutRoute(page, (b) => (putBody = b));

    await page.locator('[data-editable="story-points"] .meta-value').click();
    const input = page.locator('[data-editable="story-points"] input[type="number"]');
    await input.fill('8');
    await input.press('Enter');

    await expect(async () => {
      expect(putBody?.fields?.story_points).toBe(8);
    }).toPass({ timeout: 3000 });
  });

  test('clicking assignee shows an inline text input for searching', async ({ page }) => {
    await page.locator('[data-editable="assignee"] .meta-value').click();
    await expect(page.locator('[data-editable="assignee"] input[type="text"]')).toBeVisible();
  });

  test('typing in assignee input shows matching users in a dropdown', async ({ page }) => {
    mockUserSearchRoute(page);
    await page.locator('[data-editable="assignee"] .meta-value').click();
    await page.locator('[data-editable="assignee"] input[type="text"]').fill('Bob');
    await expect(page.locator('.user-search-result:text("Bob Builder")')).toBeVisible({
      timeout: 3000,
    });
  });

  test('selecting a user from dropdown saves assignee to Jira API', async ({ page }) => {
    mockUserSearchRoute(page);
    let putBody = null;
    mockPutRoute(page, (b) => (putBody = b));

    await page.locator('[data-editable="assignee"] .meta-value').click();
    await page.locator('[data-editable="assignee"] input[type="text"]').fill('Bob');
    await page.locator('.user-search-result:text("Bob Builder")').click({ timeout: 3000 });

    await expect(async () => {
      expect(putBody?.fields?.assignee?.accountId).toBe('user-bob-456');
    }).toPass({ timeout: 3000 });
  });
});

// ── STATUS TRANSITIONS ────────────────────────────────────────────────────────
test.describe('Status Transitions', () => {
  const transitionsFixture = {
    transitions: [
      {
        id: '21',
        name: 'Done',
        to: { name: 'Done', statusCategory: { key: 'done', name: 'Done' } },
      },
      {
        id: '11',
        name: 'To Do',
        to: { name: 'To Do', statusCategory: { key: 'new', name: 'To Do' } },
      },
    ],
  };

  // The transitions endpoint (/rest/api/3/issue/KEY/transitions) also matches the
  // generic issue matcher, so this route is registered AFTER mockIssueRoute in the
  // test body — Playwright runs the most-recently-added matching handler first.
  function mockTransitionsRoute(page, onPost) {
    page.route(
      (url) => url.toString().includes('/transitions'),
      async (route) => {
        if (route.request().method() === 'POST') {
          if (onPost) onPost(route.request().postDataJSON());
          await route.fulfill({ status: 204, body: '' });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(transitionsFixture),
          });
        }
      }
    );
  }

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('.meta-grid')).toBeVisible({ timeout: 5000 });
  });

  test('Status field is editable and carries the Jira scope badge', async ({ page }) => {
    await expect(page.locator('[data-editable="status"]')).toBeVisible();
    await expect(page.locator('[data-editable="status"] .field-scope-jira')).toBeVisible();
  });

  test('clicking Status shows a dropdown of available transitions', async ({ page }) => {
    mockTransitionsRoute(page);
    await page.locator('[data-editable="status"] .meta-value').click();
    await expect(page.locator('.status-transition-option:text("Done")')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('.status-transition-option:text("To Do")')).toBeVisible();
  });

  test('selecting a transition POSTs it to Jira', async ({ page }) => {
    let postBody = null;
    mockTransitionsRoute(page, (b) => (postBody = b));
    await page.locator('[data-editable="status"] .meta-value').click();
    await page.locator('.status-transition-option:text("Done")').click({ timeout: 3000 });
    await expect(async () => {
      expect(postBody?.transition?.id).toBe('21');
    }).toPass({ timeout: 3000 });
  });

  test('after a transition the status badge reflects the new status', async ({ page }) => {
    mockTransitionsRoute(page);
    await page.locator('[data-editable="status"] .meta-value').click();
    await page.locator('.status-transition-option:text("Done")').click({ timeout: 3000 });
    await expect(page.locator('[data-editable="status"] .status-badge')).toContainText('Done', {
      timeout: 3000,
    });
  });
});

// ── COMMENTS ──────────────────────────────────────────────────────────────────
test.describe('Comments', () => {
  // /comment also matches the generic issue matcher, so register after
  // mockIssueRoute; Playwright runs the most-recently-added matching handler first.
  function mockCommentRoute(page, onPost) {
    page.route(
      (url) => url.toString().includes('/comment'),
      async (route) => {
        if (route.request().method() === 'POST') {
          if (onPost) onPost(route.request().postDataJSON());
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ id: '10100', body: {} }),
          });
        } else {
          await route.fallback();
        }
      }
    );
  }

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('#reading-content')).toBeVisible({ timeout: 5000 });
  });

  test('a comment compose box is shown even with no comments', async ({ page }) => {
    await expect(page.locator('#comment-input')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-action="submit-comment"]')).toBeVisible();
  });

  test('submitting a comment POSTs ADF to Jira', async ({ page }) => {
    let postBody = null;
    mockCommentRoute(page, (b) => (postBody = b));
    await page.locator('#comment-input').fill('Looks good to me');
    await page.locator('[data-action="submit-comment"]').click();
    await expect(async () => {
      expect(postBody?.body?.type).toBe('doc');
      expect(JSON.stringify(postBody?.body)).toContain('Looks good to me');
    }).toPass({ timeout: 3000 });
  });

  test('an empty comment is not submitted', async ({ page }) => {
    let posted = false;
    mockCommentRoute(page, () => (posted = true));
    await page.locator('[data-action="submit-comment"]').click();
    await page.waitForTimeout(500);
    expect(posted).toBe(false);
  });

  test('the compose box clears after a successful submit', async ({ page }) => {
    mockCommentRoute(page);
    await page.locator('#comment-input').fill('Ship it');
    await page.locator('[data-action="submit-comment"]').click();
    await expect(page.locator('#comment-input')).toHaveValue('', { timeout: 3000 });
  });
});

// ── CROSS-LINKING (notes / diagrams / snippets ↔ tickets) ─────────────────────
test.describe('Cross-linking', () => {
  const seededState = {
    groups: [
      { id: 'inbox', name: 'Inbox', keys: [] },
      { id: 'history', name: 'History', keys: [] },
    ],
    activeGroupId: 'inbox',
    standAloneNotes: [
      { id: 'note_1', title: 'Design spike', blocks: [], created: 1, updated: 1, linkedKeys: [] },
    ],
    mindMaps: [{ id: 'mm_1', name: 'Rollout plan', code: 'graph TD; A-->B', linkedKeys: [] }],
    codeBlocks: [],
  };
  const seedState = (st) => localStorage.setItem('jira_state', JSON.stringify(st));

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    await page.addInitScript(seedState, seededState);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('#reading-content')).toBeVisible({ timeout: 5000 });
  });

  test('reading pane shows a Link button in a linked-items section', async ({ page }) => {
    await expect(page.locator('[data-action="link-item-add"]')).toBeVisible();
  });

  test('linking a note shows it in the linked list', async ({ page }) => {
    await page.locator('[data-action="link-item-add"]').click();
    await page.locator('.link-picker-option:has-text("Design spike")').click();
    await expect(page.locator('.linked-item:has-text("Design spike")')).toBeVisible();
  });

  test('a linked note persists in state', async ({ page }) => {
    await page.locator('[data-action="link-item-add"]').click();
    await page.locator('.link-picker-option:has-text("Design spike")').click();
    await expect(page.locator('.linked-item:has-text("Design spike")')).toBeVisible();
    const linked = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('jira_state'));
      return s.standAloneNotes[0].linkedKeys;
    });
    expect(linked).toContain('PROJ-123');
  });

  test('unlinking removes it from the list', async ({ page }) => {
    await page.locator('[data-action="link-item-add"]').click();
    await page.locator('.link-picker-option:has-text("Design spike")').click();
    await expect(page.locator('.linked-item:has-text("Design spike")')).toBeVisible();
    await page.locator('.linked-item:has-text("Design spike") [data-action="unlink-item"]').click();
    await expect(page.locator('.linked-item:has-text("Design spike")')).toHaveCount(0);
  });

  test('clicking a linked note opens the Notes tab with that note active', async ({ page }) => {
    await page.locator('[data-action="link-item-add"]').click();
    await page.locator('.link-picker-option:has-text("Design spike")').click();
    await page.locator('.linked-item[data-type="note"] [data-action="open-linked-item"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'notes');
    const activeId = await page.evaluate(() => window.getState().activeNoteId);
    expect(activeId).toBe('note_1');
  });
});

// ── COMMAND PALETTE (Ctrl/Cmd+K) ──────────────────────────────────────────────
test.describe('Command palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
    await expect(page.locator('#sidebar')).toBeVisible();
  });

  test('Ctrl+K opens the palette and focuses the input', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.locator('#command-palette-overlay')).not.toHaveClass(/hidden/);
    await expect(page.locator('#command-palette-input')).toBeFocused();
  });

  test('Escape closes the palette', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.locator('#command-palette-overlay')).not.toHaveClass(/hidden/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#command-palette-overlay')).toHaveClass(/hidden/);
  });

  test('typing filters the command list', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.locator('#command-palette-input').fill('Timeline');
    await expect(page.locator('.cp-option:has-text("Timeline")')).toBeVisible();
  });

  test('selecting the Timeline command switches to the Timeline tab', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.locator('#command-palette-input').fill('Timeline');
    await page.locator('.cp-option:has-text("Timeline")').click();
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'timeline');
    await expect(page.locator('#command-palette-overlay')).toHaveClass(/hidden/);
  });

  test('Enter runs the highlighted command', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.locator('#command-palette-input').fill('History');
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'history');
  });

  test('arrow keys move the active option', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.locator('.cp-option.active')).toHaveCount(1);
    const first = await page.locator('.cp-option.active').textContent();
    await page.keyboard.press('ArrowDown');
    const second = await page.locator('.cp-option.active').textContent();
    expect(second).not.toBe(first);
  });
});

// ── ASSIGN TO ME ──────────────────────────────────────────────────────────────
test.describe('Assign to me', () => {
  const myself = { accountId: 'me-123', displayName: 'Me Myself', emailAddress: 'me@example.com' };

  function mockMyselfRoute(page) {
    page.route(
      (url) => url.toString().includes('/rest/api/3/myself'),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(myself),
        });
      }
    );
  }

  function mockPutRoute(page, onBody) {
    page.route(
      (url) => url.toString().includes('/rest/api/3/issue/PROJ-123'),
      async (route) => {
        if (route.request().method() === 'PUT') {
          onBody(route.request().postDataJSON());
          await route.fulfill({ status: 204, body: '' });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(issueFixture),
          });
        }
      }
    );
  }

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('#reading-content')).toBeVisible({ timeout: 5000 });
  });

  test('reading pane has an Assign to me button', async ({ page }) => {
    await expect(page.locator('.rs-actions [data-action="assign-me"]')).toBeVisible();
  });

  test('a ticket card has an assign-to-me button', async ({ page }) => {
    await expect(page.locator('#ticket-list .list-card .lc-assign-me').first()).toHaveCount(1);
  });

  test('clicking Assign to me PUTs my accountId to Jira', async ({ page }) => {
    mockMyselfRoute(page);
    let putBody = null;
    mockPutRoute(page, (b) => (putBody = b));
    await page.locator('.rs-actions [data-action="assign-me"]').click();
    await expect(async () => {
      expect(putBody?.fields?.assignee?.accountId).toBe('me-123');
    }).toPass({ timeout: 3000 });
  });
});

// ── STALE TICKET BADGE ────────────────────────────────────────────────────────
test.describe('Stale ticket badge', () => {
  function issueWithUpdated(updated) {
    const clone = JSON.parse(JSON.stringify(issueFixture));
    clone.fields.updated = updated;
    return clone;
  }

  async function openTicket(page, issue) {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issue);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    // Wait until the card has real (cached) data before asserting the badge.
    await expect(page.locator('#ticket-list .list-card[data-cached="true"]')).toBeVisible({
      timeout: 5000,
    });
  }

  test('a long-untouched ticket shows an idle badge on its card', async ({ page }) => {
    await openTicket(page, issueWithUpdated('2000-01-01T00:00:00.000+0000'));
    await expect(page.locator('#ticket-list .list-card .lc-stale')).toBeVisible();
    await expect(page.locator('#ticket-list .list-card .lc-stale')).toContainText('idle');
  });

  test('a freshly updated ticket shows no idle badge', async ({ page }) => {
    await openTicket(page, issueWithUpdated(new Date().toISOString()));
    await expect(page.locator('#ticket-list .list-card .lc-stale')).toHaveCount(0);
  });
});

// ── BACKUP & EXPORT ───────────────────────────────────────────────────────────
test.describe('Backup & export', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    await page.goto('/');
    await expect(page.locator('#sidebar')).toBeVisible();
  });

  test('Settings exposes Export and Import controls', async ({ page }) => {
    await page.click('#settings-btn');
    await expect(page.locator('#export-data-btn')).toBeVisible();
    await expect(page.locator('#import-data-btn')).toBeVisible();
  });

  test('Export downloads a JSON backup containing the groups', async ({ page }) => {
    const fs = require('fs');
    await page.click('#settings-btn');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#export-data-btn'),
    ]);
    expect(download.suggestedFilename()).toMatch(/^crisp-backup-.*\.json$/);
    const path = await download.path();
    const parsed = JSON.parse(fs.readFileSync(path, 'utf8'));
    expect(parsed.data && Array.isArray(parsed.data.groups)).toBe(true);
    // Credentials must never be in the backup.
    expect(JSON.stringify(parsed)).not.toContain('fake-api-token');
  });

  test('an automatic daily snapshot is written on load', async ({ page }) => {
    await expect
      .poll(async () =>
        page.evaluate(
          () => Object.keys(localStorage).filter((k) => k.startsWith('crisp_backup_')).length
        )
      )
      .toBeGreaterThan(0);
  });

  test('the settings modal lists at least one restorable snapshot', async ({ page }) => {
    // Give the on-load snapshot a moment to persist.
    await expect
      .poll(async () =>
        page.evaluate(
          () => Object.keys(localStorage).filter((k) => k.startsWith('crisp_backup_')).length
        )
      )
      .toBeGreaterThan(0);
    await page.click('#settings-btn');
    await expect(page.locator('#backup-snapshots .snapshot-row').first()).toBeVisible({
      timeout: 3000,
    });
  });

  test('importing a backup replaces the current state', async ({ page }) => {
    const backup = JSON.stringify({
      app: 'crisp-for-jira',
      schema: 1,
      data: {
        groups: [
          { id: 'inbox', name: 'Imported List', keys: [] },
          { id: 'history', name: 'History', keys: [] },
        ],
        activeGroupId: 'inbox',
      },
    });
    page.on('dialog', (d) => d.accept());
    await page.click('#settings-btn');
    await page.setInputFiles('#import-file-input', {
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(backup),
    });
    await expect(page.locator('#group-list')).toContainText('Imported List', { timeout: 3000 });
  });
});

// ── TAB VISIBILITY (progressive disclosure) ───────────────────────────────────
test.describe('Tab visibility', () => {
  const ADV = ['labels', 'timeline', 'history', 'notes', 'mindmap', 'snippets'];

  test('a new install shows only the Jira tab', async ({ page }) => {
    await page.addInitScript(initConfigFresh);
    await page.goto('/');
    await expect(page.locator('#tab-jira')).toBeVisible();
    for (const t of ADV) {
      await expect(page.locator('#tab-' + t)).toBeHidden();
    }
  });

  test('an existing install keeps all tabs visible', async ({ page }) => {
    await page.addInitScript(initConfig);
    await page.goto('/');
    for (const t of ['jira', ...ADV]) {
      await expect(page.locator('#tab-' + t)).toBeVisible();
    }
  });

  test('the tab-bar + menu enables a hidden tab', async ({ page }) => {
    await page.addInitScript(initConfigFresh);
    await page.goto('/');
    await expect(page.locator('#tab-timeline')).toBeHidden();
    await page.click('#tab-add-btn');
    await page.locator('.tab-add-option[data-tab="timeline"]').click();
    await expect(page.locator('#tab-timeline')).toBeVisible();
  });

  test('Settings checkboxes toggle a tab on and off', async ({ page }) => {
    await page.addInitScript(initConfigFresh);
    await page.goto('/');
    await page.click('#settings-btn');
    await page.locator('#tabvis-snippets').check();
    await expect(page.locator('#tab-snippets')).toBeVisible();
    await page.locator('#tabvis-snippets').uncheck();
    await expect(page.locator('#tab-snippets')).toBeHidden();
  });

  test('the command palette reveals and switches to a hidden tab', async ({ page }) => {
    await page.addInitScript(initConfigFresh);
    await page.goto('/');
    await expect(page.locator('#tab-mindmap')).toBeHidden();
    await page.keyboard.press('Control+k');
    await page.locator('#command-palette-input').fill('Mindmap');
    await page.locator('.cp-option:has-text("Mindmap")').click();
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'mindmap');
    await expect(page.locator('#tab-mindmap')).toBeVisible();
  });
});

// ── FIRST-RUN WELCOME ─────────────────────────────────────────────────────────
test.describe('First-run welcome', () => {
  test('hints at customizing tabs with the + menu', async ({ page }) => {
    // No config + no state → unconfigured first run, so the welcome renders.
    await page.goto('/');
    const welcome = page.locator('#ticket-list .first-run');
    await expect(welcome).toContainText('more tabs', { timeout: 5000 });
    await expect(welcome).toContainText('tab bar');
  });
});

// ── OPEN IN JIRA BUTTONS ─────────────────────────────────────────────────────
test.describe('Open in Jira buttons', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('#reading-content')).toBeVisible({ timeout: 5000 });
  });

  test('ticket card in list has an open-in-Jira link', async ({ page }) => {
    const card = page.locator('#ticket-list .list-card').first();
    const jiraLink = card.locator('.lc-jira-link');
    await expect(jiraLink).toHaveAttribute('href', /\/browse\/PROJ-123/);
    await expect(jiraLink).toHaveAttribute('target', '_blank');
  });

  test('reading pane title has an open-in-Jira icon link', async ({ page }) => {
    // The ticket key in the title is intercepted by bindJiraLinks which injects a
    // .jira-link-icon right after it as an escape hatch to open in Jira
    const icon = page.locator('#reading-content .rs-title .jira-link-icon').first();
    await expect(icon).toBeVisible({ timeout: 5000 });
    await expect(icon).toHaveAttribute('href', /\/browse\/PROJ-123/);
  });

  test('browse links in description get an open-in-Jira icon appended', async ({ page }) => {
    // The fixture description contains a /browse/PROJ-999 link
    const icon = page.locator('#reading-content .description .jira-link-icon');
    await expect(icon).toBeVisible({ timeout: 5000 });
    await expect(icon).toHaveAttribute('href', /\/browse\/PROJ-999/);
  });
});

// ── Meta grid simple fields ────────────────────────────────────────────────────
test.describe('Meta grid simple fields', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('.meta-grid')).toBeVisible({ timeout: 5000 });
  });

  test('priority is shown in the meta grid', async ({ page }) => {
    await expect(page.locator('.meta-grid')).toContainText('Priority');
    await expect(page.locator('.meta-grid')).toContainText('Medium');
  });

  test('due date is shown in the meta grid', async ({ page }) => {
    await expect(page.locator('.meta-grid')).toContainText('Due');
  });

  test('fix versions are shown in the meta grid', async ({ page }) => {
    await expect(page.locator('.meta-grid')).toContainText('Fix Version');
    await expect(page.locator('.meta-grid')).toContainText('v2.0');
  });

  test('components are shown in the meta grid', async ({ page }) => {
    await expect(page.locator('.meta-grid')).toContainText('Component');
    await expect(page.locator('.meta-grid')).toContainText('Backend');
  });
});

// ── UI standardisation ────────────────────────────────────────────────────────
test.describe('UI standardisation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    await page.goto('/');
  });

  // P3: Remove "Open" button
  test('search bar has no submit button', async ({ page }) => {
    await expect(page.locator('#search-btn')).toHaveCount(0);
  });

  test('pressing Enter in search input opens a ticket', async ({ page }) => {
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#ticket-list .list-card')).toHaveCount(1, { timeout: 5000 });
  });

  // P3: Notes and Mindmap tabs moved to aux tab bar
  test('Notes and Mindmap tabs are NOT in the main tab-bar', async ({ page }) => {
    const mainTabs = await page.locator('#tab-bar .tab-btn').allTextContents();
    const names = mainTabs.map((t) => t.trim());
    expect(names.some((t) => t.includes('Notes'))).toBe(false);
    expect(names.some((t) => t.includes('Mindmap'))).toBe(false);
  });

  test('Notes and Mindmap tabs exist in aux-tab-bar', async ({ page }) => {
    await expect(page.locator('#aux-tab-bar #tab-notes')).toBeVisible();
    await expect(page.locator('#aux-tab-bar #tab-mindmap')).toBeVisible();
  });

  test('clicking Notes tab in aux-tab-bar switches to notes mode', async ({ page }) => {
    await page.click('#aux-tab-bar #tab-notes');
    await expect(page.locator('#tab-notes')).toHaveClass(/active/);
  });

  // P2: Add buttons in section title row
  test('Mindmap add button is in the sidebar header', async ({ page }) => {
    await page.click('#tab-mindmap');
    await expect(page.locator('.mm-sidebar-header #mm-add-btn')).toHaveCount(1);
  });

  test('Mindmap add button is left of collapse button in header', async ({ page }) => {
    await page.click('#tab-mindmap');
    const isLeftOf = await page.evaluate(() => {
      const add = document.getElementById('mm-add-btn');
      const collapse = document.getElementById('mm-collapse-btn');
      return !!(add.compareDocumentPosition(collapse) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(isLeftOf).toBe(true);
  });

  test('Notes add button is in the sidebar header', async ({ page }) => {
    await page.click('#tab-notes');
    await expect(page.locator('.nc-sidebar-header #add-note-btn')).toHaveCount(1);
  });

  test('Notes add button is left of collapse button in header', async ({ page }) => {
    await page.click('#tab-notes');
    const isLeftOf = await page.evaluate(() => {
      const add = document.getElementById('add-note-btn');
      const collapse = document.getElementById('nc-collapse-btn');
      return !!(add.compareDocumentPosition(collapse) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(isLeftOf).toBe(true);
  });

  test('#add-group-btn is in the sidebar header', async ({ page }) => {
    const inside = await page.evaluate(() =>
      document
        .querySelector('#sidebar .middle-header')
        .contains(document.getElementById('add-group-btn'))
    );
    expect(inside).toBe(true);
  });

  test('#add-group-btn is left of sidebar-collapse-btn in header', async ({ page }) => {
    const isLeftOf = await page.evaluate(() => {
      const add = document.getElementById('add-group-btn');
      const collapse = document.getElementById('sidebar-collapse-btn');
      return !!(add.compareDocumentPosition(collapse) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(isLeftOf).toBe(true);
  });
});

// ── TIMELINE ─────────────────────────────────────────────────────────────────
test.describe('Timeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
  });

  test('Timeline tab is visible in the main tab-bar', async ({ page }) => {
    await expect(page.locator('#tab-bar #tab-timeline')).toBeVisible();
  });

  test('Timeline tab is between Labels and History in main tab-bar', async ({ page }) => {
    const tabs = await page.locator('#tab-bar .tab-btn').allTextContents();
    const cleaned = tabs.map((t) => t.trim());
    const labelsIdx = cleaned.findIndex((t) => t.includes('Labels'));
    const timelineIdx = cleaned.findIndex((t) => t.includes('Timeline'));
    const historyIdx = cleaned.findIndex((t) => t.includes('History'));
    expect(timelineIdx).toBeGreaterThan(labelsIdx);
    expect(timelineIdx).toBeLessThan(historyIdx);
  });

  test('clicking Timeline tab switches to timeline mode', async ({ page }) => {
    await page.click('#tab-timeline');
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'timeline');
  });

  test('timeline pane is visible in timeline mode', async ({ page }) => {
    await page.click('#tab-timeline');
    await expect(page.locator('#timeline-pane')).toBeVisible();
  });

  test('Start field is shown in the reading pane meta grid', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('.meta-grid')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.meta-label:text("Start")')).toBeVisible();
  });

  test('ETA field is shown in the reading pane meta grid', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('.meta-grid')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.meta-label:text("ETA")')).toBeVisible();
  });

  test('clicking Start field shows a date input', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('.meta-grid')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-editable="tl-start"] .meta-value').click();
    await expect(page.locator('[data-editable="tl-start"] input[type="date"]')).toBeVisible();
  });

  test('setting a start date saves to state.timelines', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('.meta-grid')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-editable="tl-start"] .meta-value').click();
    await page.locator('[data-editable="tl-start"] input[type="date"]').fill('2026-06-01');
    await page.locator('[data-editable="tl-start"] input[type="date"]').press('Enter');
    const saved = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('jira_state') || '{}');
      return s.timelines?.['PROJ-123']?.start;
    });
    expect(saved).toBe('2026-06-01');
  });

  test('timeline pane lists tickets that have a scheduled date', async ({ page }) => {
    // Seed a ticket with a timeline date
    await page.addInitScript(() => {
      const s = JSON.parse(localStorage.getItem('jira_state') || '{}');
      s.timelines = { 'PROJ-123': { start: '2026-06-01', eta: '2026-06-15' } };
      localStorage.setItem('jira_state', JSON.stringify(s));
    });
    await page.goto('/');
    // Add PROJ-123 to inbox so it's in a group
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
    await page.click('#tab-timeline');
    await expect(page.locator('#timeline-pane')).toBeVisible();
    await expect(page.locator('#timeline-pane')).toContainText('PROJ-123', { timeout: 3000 });
  });
});

// ── META GRID DISCOVERABILITY ─────────────────────────────────────────────────
test.describe('Meta grid discoverability', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('.meta-grid')).toBeVisible({ timeout: 5000 });
  });

  test('Due field is editable (has data-editable="due-date")', async ({ page }) => {
    await expect(page.locator('[data-editable="due-date"]')).toBeVisible();
  });

  test('clicking Due field shows a date input', async ({ page }) => {
    await page.locator('[data-editable="due-date"] .meta-value').click();
    await expect(page.locator('[data-editable="due-date"] input[type="date"]')).toBeVisible();
  });

  test('setting Due date sends PUT to Jira with duedate field', async ({ page }) => {
    let putBody = null;
    page.route(
      (url) => url.toString().includes('/rest/api/3/issue/PROJ-123'),
      async (route) => {
        if (route.request().method() === 'PUT') {
          putBody = route.request().postDataJSON();
          await route.fulfill({ status: 204, body: '' });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(issueFixture),
          });
        }
      }
    );
    await page.locator('[data-editable="due-date"] .meta-value').click();
    await page.locator('[data-editable="due-date"] input[type="date"]').fill('2026-07-01');
    await page.locator('[data-editable="due-date"] input[type="date"]').press('Enter');
    await expect(async () => {
      expect(putBody?.fields?.duedate).toBe('2026-07-01');
    }).toPass({ timeout: 3000 });
  });

  test('Jira-synced editable fields have a Jira scope badge', async ({ page }) => {
    await expect(page.locator('[data-editable="assignee"] .field-scope-jira')).toBeVisible();
    await expect(page.locator('[data-editable="story-points"] .field-scope-jira')).toBeVisible();
    await expect(page.locator('[data-editable="due-date"] .field-scope-jira')).toBeVisible();
  });

  test('local editable fields have a Local scope badge', async ({ page }) => {
    await expect(page.locator('[data-editable="tl-start"] .field-scope-local')).toBeVisible();
    await expect(page.locator('[data-editable="tl-eta"] .field-scope-local')).toBeVisible();
  });
});

// ── EDITABLE FIELD RE-ACTIVATION ─────────────────────────────────────────────
// Regression tests: clicking an editable field a second time (after blur/Escape)
// must show the input again. The original bug was a stale DOM reference captured
// once at bind-time; after replaceWith() the closure held a detached node.
test.describe('Editable field re-activation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('.meta-grid')).toBeVisible({ timeout: 5000 });
  });

  // Helper: open field → set value → blur → re-open → assert input visible again
  async function roundTrip(page, selector, inputType, fillValue) {
    const valueLocator = page.locator(`${selector} .meta-value`);
    const inputLocator = page.locator(`${selector} input[type="${inputType}"]`);
    // First activation
    await valueLocator.click();
    await expect(inputLocator).toBeVisible({ timeout: 3000 });
    if (fillValue !== null) await inputLocator.fill(fillValue);
    await inputLocator.press('Escape');
    await expect(inputLocator).not.toBeVisible({ timeout: 2000 });
    // Second activation — this failed before the fix
    await valueLocator.click();
    await expect(inputLocator).toBeVisible({ timeout: 3000 });
  }

  test('Due date is re-activatable after Escape', async ({ page }) => {
    await roundTrip(page, '[data-editable="due-date"]', 'date', null);
  });

  test('Due date is re-activatable after committing a date', async ({ page }) => {
    const valueLocator = page.locator('[data-editable="due-date"] .meta-value');
    const inputLocator = page.locator('[data-editable="due-date"] input[type="date"]');
    // First: set a date and commit via Enter
    await valueLocator.click();
    await expect(inputLocator).toBeVisible({ timeout: 3000 });
    await inputLocator.fill('2026-08-01');
    await inputLocator.press('Enter');
    await expect(inputLocator).not.toBeVisible({ timeout: 2000 });
    // Second activation
    await valueLocator.click();
    await expect(inputLocator).toBeVisible({ timeout: 3000 });
  });

  test('Start date is re-activatable after Escape', async ({ page }) => {
    await roundTrip(page, '[data-editable="tl-start"]', 'date', null);
  });

  test('ETA date is re-activatable after committing a date', async ({ page }) => {
    const valueLocator = page.locator('[data-editable="tl-eta"] .meta-value');
    const inputLocator = page.locator('[data-editable="tl-eta"] input[type="date"]');
    await valueLocator.click();
    await expect(inputLocator).toBeVisible({ timeout: 3000 });
    await inputLocator.fill('2026-09-01');
    await inputLocator.press('Enter');
    await expect(inputLocator).not.toBeVisible({ timeout: 2000 });
    await valueLocator.click();
    await expect(inputLocator).toBeVisible({ timeout: 3000 });
  });

  test('Story Points is re-activatable after Escape', async ({ page }) => {
    await roundTrip(page, '[data-editable="story-points"]', 'number', null);
  });

  test('Story Points is re-activatable after committing a value', async ({ page }) => {
    const valueLocator = page.locator('[data-editable="story-points"] .meta-value');
    const inputLocator = page.locator('[data-editable="story-points"] input[type="number"]');
    await valueLocator.click();
    await expect(inputLocator).toBeVisible({ timeout: 3000 });
    await inputLocator.fill('13');
    await inputLocator.press('Enter');
    await expect(inputLocator).not.toBeVisible({ timeout: 2000 });
    await valueLocator.click();
    await expect(inputLocator).toBeVisible({ timeout: 3000 });
  });

  test('Assignee is re-activatable after Escape', async ({ page }) => {
    await roundTrip(page, '[data-editable="assignee"]', 'text', null);
  });

  test('date field keeps its calendar affordance after a commit', async ({ page }) => {
    // After committing, the rebuilt .meta-value must still expose its edit affordance.
    const valueLocator = page.locator('[data-editable="due-date"] .meta-value');
    const inputLocator = page.locator('[data-editable="due-date"] input[type="date"]');
    await valueLocator.click();
    await expect(inputLocator).toBeVisible({ timeout: 3000 });
    await inputLocator.press('Escape');
    await expect(inputLocator).not.toBeVisible({ timeout: 2000 });
    // Date fields use the calendar button as their affordance (non-date fields use .edit-hint).
    await expect(page.locator('[data-editable="due-date"] .meta-value .cal-btn')).toBeAttached();
  });
});

// ── SIDEBAR COLLAPSE (Notes + Mindmap) ───────────────────────────────────────
test.describe('Sidebar Collapse — Notes and Mindmap', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockFieldsRoute(page);
    await page.goto('/');
  });

  test('Notes sidebar has a collapse button on the right of the header', async ({ page }) => {
    await page.click('#tab-notes');
    await expect(page.locator('#nc-collapse-btn')).toBeVisible();
  });

  test('clicking Notes collapse button collapses the sidebar', async ({ page }) => {
    await page.click('#tab-notes');
    await page.click('#nc-collapse-btn');
    await expect(page.locator('#nc-sidebar')).toHaveClass(/collapsed/);
  });

  test('clicking Notes collapse again expands the sidebar', async ({ page }) => {
    await page.click('#tab-notes');
    await page.click('#nc-collapse-btn');
    await page.click('#nc-collapse-btn');
    await expect(page.locator('#nc-sidebar')).not.toHaveClass(/collapsed/);
  });

  test('Mindmap sidebar has a collapse button on the right of the header', async ({ page }) => {
    await page.click('#tab-mindmap');
    await expect(page.locator('#mm-collapse-btn')).toBeVisible();
  });

  test('clicking Mindmap collapse button collapses the sidebar', async ({ page }) => {
    await page.click('#tab-mindmap');
    await page.click('#mm-collapse-btn');
    await expect(page.locator('#mm-sidebar-panel')).toHaveClass(/collapsed/);
  });

  test('clicking Mindmap collapse again expands the sidebar', async ({ page }) => {
    await page.click('#tab-mindmap');
    await page.click('#mm-collapse-btn');
    await page.click('#mm-collapse-btn');
    await expect(page.locator('#mm-sidebar-panel')).not.toHaveClass(/collapsed/);
  });
});

// ── NOTES GROUPS ──────────────────────────────────────────────────────────────
test.describe('Notes Groups', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.click('#tab-notes');
  });

  test('Notes sidebar shows a groups section', async ({ page }) => {
    await expect(page.locator('#nc-group-list')).toBeVisible();
  });

  test('Groups section shows All Notes by default', async ({ page }) => {
    await expect(page.locator('#nc-group-list')).toContainText('All');
  });

  test('add-note-group-btn shows an inline input', async ({ page }) => {
    await page.click('#add-note-group-btn');
    await expect(page.locator('#nc-group-list .g-name-input')).toBeVisible();
  });

  test('pressing Enter commits group creation', async ({ page }) => {
    await page.click('#add-note-group-btn');
    await page.fill('#nc-group-list .g-name-input', 'Work');
    await page.press('#nc-group-list .g-name-input', 'Enter');
    await expect(page.locator('#nc-group-list .group-item')).toHaveCount(2); // All + Work
    await expect(page.locator('#nc-group-list')).toContainText('Work');
  });

  test('pressing Escape cancels group creation', async ({ page }) => {
    await page.click('#add-note-group-btn');
    await page.press('#nc-group-list .g-name-input', 'Escape');
    // Only "All" remains
    await expect(page.locator('#nc-group-list .group-item')).toHaveCount(1);
  });

  test('new note is assigned to active group', async ({ page }) => {
    // Create a group
    await page.click('#add-note-group-btn');
    await page.fill('#nc-group-list .g-name-input', 'Work');
    await page.press('#nc-group-list .g-name-input', 'Enter');
    // Work group is now active; create a note
    await page.click('#add-note-btn');
    // Switch to All — note should appear
    await page.locator('#nc-group-list .group-item').first().click();
    await expect(page.locator('#nc-notes-list .nc-note-item')).toHaveCount(1);
    // Switch back to Work — note should still appear
    await page.locator('#nc-group-list .group-item').last().click();
    await expect(page.locator('#nc-notes-list .nc-note-item')).toHaveCount(1);
  });

  test('switching to All Notes shows notes from all groups', async ({ page }) => {
    // Create two groups and one note each
    await page.click('#add-note-group-btn');
    await page.fill('#nc-group-list .g-name-input', 'Group A');
    await page.press('#nc-group-list .g-name-input', 'Enter');
    await page.click('#add-note-btn');

    await page.click('#add-note-group-btn');
    await page.fill('#nc-group-list .g-name-input', 'Group B');
    await page.press('#nc-group-list .g-name-input', 'Enter');
    await page.click('#add-note-btn');

    // All Notes should show both
    await page.locator('#nc-group-list .group-item').first().click();
    await expect(page.locator('#nc-notes-list .nc-note-item')).toHaveCount(2);
  });

  test('deleting a group moves its notes to All', async ({ page }) => {
    await page.click('#add-note-group-btn');
    await page.fill('#nc-group-list .g-name-input', 'Temp');
    await page.press('#nc-group-list .g-name-input', 'Enter');
    await page.click('#add-note-btn');
    // Delete the group
    await page.locator('#nc-group-list .nc-group-del').click();
    // Should be back to All Notes with 1 note
    await expect(page.locator('#nc-group-list .group-item')).toHaveCount(1);
    await expect(page.locator('#nc-notes-list .nc-note-item')).toHaveCount(1);
  });
});

// ── MINDMAP GROUPS ────────────────────────────────────────────────────────────
test.describe('Mindmap Groups', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.click('#tab-mindmap');
  });

  test('Mindmap sidebar shows a groups section', async ({ page }) => {
    await expect(page.locator('#mm-group-list')).toBeVisible();
  });

  test('Groups section shows All Diagrams by default', async ({ page }) => {
    await expect(page.locator('#mm-group-list')).toContainText('All');
  });

  test('add-mm-group-btn shows an inline input', async ({ page }) => {
    await page.click('#add-mm-group-btn');
    await expect(page.locator('#mm-group-list .g-name-input')).toBeVisible();
  });

  test('pressing Enter commits diagram group creation', async ({ page }) => {
    await page.click('#add-mm-group-btn');
    await page.fill('#mm-group-list .g-name-input', 'Project');
    await page.press('#mm-group-list .g-name-input', 'Enter');
    await expect(page.locator('#mm-group-list .group-item')).toHaveCount(2);
    await expect(page.locator('#mm-group-list')).toContainText('Project');
  });

  test('new diagram is assigned to active group', async ({ page }) => {
    await page.click('#add-mm-group-btn');
    await page.fill('#mm-group-list .g-name-input', 'Sprint');
    await page.press('#mm-group-list .g-name-input', 'Enter');
    // Sprint is active; create a diagram
    await page.click('#mm-add-btn');
    // Switch to All — new diagram should appear
    await page.locator('#mm-group-list .group-item').first().click();
    // default diagram + new = at least 2
    const count = await page.locator('#mm-diagram-list .mm-diagram-item').count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ── COLLAPSE BUTTON POSITION ──────────────────────────────────────────────────
test.describe('Collapse button rightmost — middle pane', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockFieldsRoute(page);
    await page.goto('/');
  });

  test('middle-collapse-btn is the last child of #middle .middle-header', async ({ page }) => {
    const isLast = await page.evaluate(() => {
      const header = document.querySelector('#middle .middle-header');
      const btn = document.getElementById('middle-collapse-btn');
      return header.lastElementChild === btn;
    });
    expect(isLast).toBe(true);
  });
});

// ── LABELS MODE: ADD GROUP BUTTON HIDDEN ──────────────────────────────────────
test.describe('Labels mode — add group button hidden', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.click('#tab-labels');
  });

  test('#add-group-btn is hidden in Labels mode', async ({ page }) => {
    await expect(page.locator('#add-group-btn')).toBeHidden();
  });
});

// ── GROUPS PANE AS SEPARATE LEFTMOST SECTION ──────────────────────────────────
test.describe('Groups pane — Notes', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.click('#tab-notes');
  });

  test('#nc-groups-pane exists and is visible', async ({ page }) => {
    await expect(page.locator('#nc-groups-pane')).toBeVisible();
  });

  test('#nc-groups-pane is before #nc-sidebar in the DOM', async ({ page }) => {
    const isBefore = await page.evaluate(() => {
      const pane = document.getElementById('nc-groups-pane');
      const sidebar = document.getElementById('nc-sidebar');
      return !!(pane.compareDocumentPosition(sidebar) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(isBefore).toBe(true);
  });

  test('#add-note-group-btn is inside #nc-groups-pane', async ({ page }) => {
    const inside = await page.evaluate(() =>
      document
        .getElementById('nc-groups-pane')
        .contains(document.getElementById('add-note-group-btn'))
    );
    expect(inside).toBe(true);
  });
});

test.describe('Groups pane — Mindmap', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockFieldsRoute(page);
    await page.goto('/');
    await page.click('#tab-mindmap');
  });

  test('#mm-groups-pane exists and is visible', async ({ page }) => {
    await expect(page.locator('#mm-groups-pane')).toBeVisible();
  });

  test('#mm-groups-pane is before #mm-sidebar-panel in the DOM', async ({ page }) => {
    const isBefore = await page.evaluate(() => {
      const pane = document.getElementById('mm-groups-pane');
      const sidebar = document.getElementById('mm-sidebar-panel');
      return !!(pane.compareDocumentPosition(sidebar) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(isBefore).toBe(true);
  });

  test('#add-mm-group-btn is inside #mm-groups-pane', async ({ page }) => {
    const inside = await page.evaluate(() =>
      document
        .getElementById('mm-groups-pane')
        .contains(document.getElementById('add-mm-group-btn'))
    );
    expect(inside).toBe(true);
  });
});

// ── DELETE BUTTONS USE SVG TRASH ICON ─────────────────────────────────────────
test.describe('Delete button icons', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockFieldsRoute(page);
    await page.goto('/');
  });

  test('Note delete button has SVG icon', async ({ page }) => {
    await page.click('#tab-notes');
    await page.click('#add-note-btn');
    await expect(page.locator('#nc-notes-list .nc-note-del svg')).toHaveCount(1);
  });

  test('Note group delete button has SVG icon', async ({ page }) => {
    await page.click('#tab-notes');
    await page.click('#add-note-group-btn');
    await page.fill('#nc-group-list .g-name-input', 'TestG');
    await page.press('#nc-group-list .g-name-input', 'Enter');
    await expect(page.locator('#nc-group-list .nc-group-del svg')).toHaveCount(1);
  });

  test('Diagram delete button has SVG icon', async ({ page }) => {
    await page.click('#tab-mindmap');
    await expect(page.locator('#mm-diagram-list .mm-diagram-del svg')).toHaveCount(1);
  });

  test('Mindmap group delete button has SVG icon', async ({ page }) => {
    await page.click('#tab-mindmap');
    await page.click('#add-mm-group-btn');
    await page.fill('#mm-group-list .g-name-input', 'TestG');
    await page.press('#mm-group-list .g-name-input', 'Enter');
    await expect(page.locator('#mm-group-list .mm-group-del svg')).toHaveCount(1);
  });
});

// ── AUTO-REFRESH ──────────────────────────────────────────────────────────────
test.describe('Auto-refresh', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockFieldsRoute(page);
    await page.goto('/');
  });

  test('auto-refresh toggle button is visible in topbar', async ({ page }) => {
    await expect(page.locator('#auto-refresh-btn')).toBeVisible();
  });

  test('auto-refresh is off by default', async ({ page }) => {
    const active = await page.locator('#auto-refresh-btn').getAttribute('data-active');
    expect(active).toBe('false');
  });

  test('clicking auto-refresh button enables it', async ({ page }) => {
    await page.click('#auto-refresh-btn');
    const active = await page.locator('#auto-refresh-btn').getAttribute('data-active');
    expect(active).toBe('true');
  });

  test('clicking auto-refresh twice disables it again', async ({ page }) => {
    await page.click('#auto-refresh-btn');
    await page.click('#auto-refresh-btn');
    const active = await page.locator('#auto-refresh-btn').getAttribute('data-active');
    expect(active).toBe('false');
  });
});

// ── OPEN IN WINDOW SETTING ────────────────────────────────────────────────────
test.describe('Open in Window setting', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockFieldsRoute(page);
    await page.goto('/');
  });

  test('settings modal has Open in Window toggle', async ({ page }) => {
    await page.click('#settings-btn');
    await expect(page.locator('#cfg-open-in-window')).toBeVisible();
  });

  test('Open in Window toggle is ON by default', async ({ page }) => {
    await page.click('#settings-btn');
    await expect(page.locator('#cfg-open-in-window')).toBeChecked();
  });

  test('Open in Window toggle state is saved on settings save', async ({ page }) => {
    await page.click('#settings-btn');
    await page.locator('#cfg-open-in-window').uncheck();
    await page.click('#settings-save');
    await page.click('#settings-btn');
    await expect(page.locator('#cfg-open-in-window')).not.toBeChecked();
  });
});

// ── LABELS TAB — ACTIVE KEY ISOLATION ────────────────────────────────────────
test.describe('Labels tab — active key isolation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockIssueRoute(page, issueFixture);
    mockFieldsRoute(page);
    await page.goto('/');
  });

  test('switching to Labels tab with a Jira ticket selected shows empty reading pane', async ({
    page,
  }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('#reading-content')).toBeVisible({ timeout: 5000 });

    await page.click('#tab-labels');
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'labels');
    await expect(page.locator('#reading-content')).not.toBeVisible();
    await expect(page.locator('#reading-empty')).toBeVisible();
  });

  test('switching back to Jira tab restores previously selected ticket', async ({ page }) => {
    await page.fill('#search-input', 'PROJ-123');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#ticket-list .list-card')).toBeVisible({ timeout: 5000 });
    await page.locator('#ticket-list .list-card').first().click();
    await expect(page.locator('#reading-content')).toBeVisible({ timeout: 5000 });

    await page.click('#tab-labels');
    await page.click('#tab-jira');
    await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'jira');
    await expect(page.locator('#reading-content')).toBeVisible({ timeout: 3000 });
  });
});

// ── TOPBAR REDESIGN ───────────────────────────────────────────────────────────
test.describe('Topbar redesign', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(initConfig);
    mockFieldsRoute(page);
    await page.goto('/');
  });

  test('logo does not contain "Crisp for Jira" text', async ({ page }) => {
    const logoText = await page.locator('#logo').textContent();
    expect(logoText.trim()).not.toContain('Crisp for Jira');
  });

  test('search form is inside topbar', async ({ page }) => {
    const inside = await page.evaluate(() =>
      document.getElementById('topbar').contains(document.getElementById('search-form'))
    );
    expect(inside).toBe(true);
  });

  test('main tab-bar comes before search form in topbar', async ({ page }) => {
    const tabBarBeforeSearch = await page.evaluate(() => {
      const tabBar = document.getElementById('tab-bar');
      const search = document.getElementById('search-form');
      return !!(tabBar.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(tabBarBeforeSearch).toBe(true);
  });

  test('aux-tab-bar comes after search form in topbar', async ({ page }) => {
    const auxAfterSearch = await page.evaluate(() => {
      const search = document.getElementById('search-form');
      const aux = document.getElementById('aux-tab-bar');
      return !!(search.compareDocumentPosition(aux) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(auxAfterSearch).toBe(true);
  });
});

// ── PWA ───────────────────────────────────────────────────────────────────────
test.describe('PWA', () => {
  test('registers service worker on startup', async ({ page }) => {
    // initConfig stubs register; our spy overrides it afterwards so we can assert
    await page.addInitScript(initConfig);
    await page.addInitScript(() => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register = (url) => {
          window.__swRegisteredUrl = url;
          return Promise.resolve({});
        };
      }
    });
    await page.goto('/');
    const swUrl = await page.evaluate(() => window.__swRegisteredUrl);
    expect(swUrl).toBe('/sw.js');
  });
});
