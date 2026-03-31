'use strict';

// Runs on *.atlassian.net pages.
// Responds to extract-keys messages from the popup with all Jira issue keys
// and their best-effort titles found on the page.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'extract-keys') return;

  // Map from key → title (best title found so far; defaults to the key itself)
  const tickets = new Map();

  function addTicket(key, title) {
    if (!/^[A-Z][A-Z0-9]{0,9}-\d+$/.test(key)) return;
    // Only upgrade an existing entry if we found a real title
    if (!tickets.has(key) || (title && title !== key)) {
      tickets.set(key, title || key);
    }
  }

  // 1. Anchor tags pointing to /browse/PROJ-123
  document.querySelectorAll('a[href*="/browse/"]').forEach((a) => {
    const m = a.href.match(/\/browse\/([A-Z][A-Z0-9]{0,9}-\d+)/);
    if (!m) return;
    const key = m[1];

    // Strategy A: explicit summary element in the nearest issue container (most reliable)
    const container =
      a.closest('[data-issue-key]') || a.closest('[data-testid*="issue"]') || a.parentElement;
    const summaryEl = container && container.querySelector('[data-testid*="summary"]');
    if (summaryEl) {
      addTicket(key, summaryEl.textContent.trim());
      return;
    }

    // Strategy B: anchor text with the bare key removed.
    // Jira injects bracket tags ([1], [ATTENTION], etc.) and SVG icon text into anchors —
    // any remainder starting with '[' is UI chrome, not a title.
    const cleaned = a.textContent.replace(key, '').trim();
    const title = cleaned && !/^\[/.test(cleaned) ? cleaned : '';
    addTicket(key, title);
  });

  // 2. data-issue-key attributes used by Jira board/backlog cards
  document.querySelectorAll('[data-issue-key]').forEach((el) => {
    const key = el.dataset.issueKey;
    if (!/^[A-Z][A-Z0-9]{0,9}-\d+$/.test(key)) return;
    const summaryEl = el.querySelector('[data-testid*="summary"]');
    const title = summaryEl ? summaryEl.textContent.trim() : '';
    addTicket(key, title);
  });

  // 3. Elements with testids that carry the key as text (Jira's new UI)
  document.querySelectorAll('[data-testid*="issue-key"]').forEach((el) => {
    const key = el.textContent.trim();
    if (!/^[A-Z][A-Z0-9]{0,9}-\d+$/.test(key)) return;
    const container = el.closest('[data-testid*="issue"]') || el.parentElement;
    const summaryEl = container && container.querySelector('[data-testid*="summary"]');
    const title = summaryEl ? summaryEl.textContent.trim() : '';
    addTicket(key, title);
  });

  // 4. Single-issue page: the page h1 is the issue summary
  const keyEl = document.querySelector('[data-testid*="issue-key"]');
  const h1 = document.querySelector('h1[data-testid*="summary"], h1');
  if (keyEl && h1) {
    const key = keyEl.textContent.trim();
    const title = h1.textContent.trim();
    if (/^[A-Z][A-Z0-9]{0,9}-\d+$/.test(key) && title && title !== key) {
      tickets.set(key, title);
    }
  }

  // 5. Single /browse/KEY page fallback — extract title from document.title.
  // This works across all Jira UI generations (classic, next-gen, team-managed)
  // because the browser tab title always reflects the issue summary.
  // Title formats Jira uses:
  //   "TTN-140922 My Issue Title - Regus Jira"
  //   "[TTN-140922] My Issue Title - Jira"
  //   "TTN-140922: My Issue Title | Atlassian Jira"
  const browseMatch = window.location.pathname.match(/\/browse\/([A-Z][A-Z0-9]{0,9}-\d+)/i);
  if (browseMatch) {
    const urlKey = browseMatch[1].toUpperCase();
    const fromTitle = document.title
      .replace(/\s+[-|]\s+.+$/, '') // strip " - Site Name" / " | Site Name" suffix
      .replace(urlKey, '') // remove the bare key
      .replace(/^[\s:[\]]+/, '') // strip leading punctuation left behind
      .trim();
    if (fromTitle) tickets.set(urlKey, fromTitle);
  }

  const sorted = Array.from(tickets.entries()).sort(([a], [b]) => a.localeCompare(b));
  sendResponse({
    keys: sorted.map(([key]) => key),
    tickets: sorted.map(([key, title]) => ({ key, title })),
  });
});
