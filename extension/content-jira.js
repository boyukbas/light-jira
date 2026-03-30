'use strict';

// Runs on *.atlassian.net pages.
// Responds to extract-keys messages from the popup with all Jira issue keys found on the page.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'extract-keys') return;

  const keys = new Set();

  // 1. Anchor tags pointing to /browse/PROJ-123
  document.querySelectorAll('a[href*="/browse/"]').forEach((a) => {
    const m = a.href.match(/\/browse\/([A-Z][A-Z0-9]{0,9}-\d+)/);
    if (m) keys.add(m[1]);
  });

  // 2. data-issue-key attributes used by Jira board/backlog cards
  document.querySelectorAll('[data-issue-key]').forEach((el) => {
    const k = el.dataset.issueKey;
    if (/^[A-Z][A-Z0-9]{0,9}-\d+$/.test(k)) keys.add(k);
  });

  // 3. Elements with testids that carry the key as text (Jira's new UI)
  document.querySelectorAll('[data-testid*="issue-key"]').forEach((el) => {
    const text = el.textContent.trim();
    if (/^[A-Z][A-Z0-9]{0,9}-\d+$/.test(text)) keys.add(text);
  });

  sendResponse({ keys: Array.from(keys).sort() });
});
