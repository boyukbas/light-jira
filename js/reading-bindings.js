'use strict';

// ── READING PANE — EVENT BINDING & HIERARCHY ──────────────────────────────────

// Pattern for Jira user/profile links — these should not be intercepted
const JIRA_PROFILE_RE = /\/(jira\/people|jira\/user|profile|users?)\//i;
// Pattern for /browse/KEY-123 links
const JIRA_BROWSE_RE = /\/browse\/([A-Z][A-Z0-9_]+-\d+)/i;

function bindReadingHandlers(container, key) {
  container.querySelectorAll('.link-open-jira').forEach((a) => {
    a.addEventListener('click', (e) => e.stopPropagation());
  });

  container.querySelectorAll('[data-action]').forEach((el) => {
    const { action, label } = el.dataset;
    const elKey = el.dataset.key;
    switch (action) {
      case 'add-label':
        el.addEventListener('click', () => addLabel(elKey));
        break;
      case 'remove-label':
        el.addEventListener('click', () => removeLabel(elKey, label));
        break;
      case 'view-label':
        el.addEventListener('click', () => window.viewByLabel(label));
        break;
      case 'move-ticket':
        el.addEventListener('change', () => window.moveTicket(elKey, el.value));
        break;
      case 'toggle-notes':
        el.addEventListener('click', toggleNotes);
        break;
      case 'refresh-reading':
        el.addEventListener('click', () => window.forceRefreshReading());
        break;
      case 'open-ticket':
        el.addEventListener('click', () => openTicketByKey(elKey));
        break;
    }
  });
}

function bindCodeCopyButtons(container) {
  container.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('.code-copy-btn')) return; // already added
    const btn = document.createElement('button');
    btn.className = 'code-copy-btn top-btn icon-only';
    btn.title = 'Copy code';
    btn.setAttribute('aria-label', 'Copy code');
    btn.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
      '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
      '</svg>';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const code = pre.querySelector('code') || pre;
      navigator.clipboard.writeText(code.textContent || '').then(() => toast('Code copied!'));
    });
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });
}

function bindJiraLinks(container) {
  container.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';

    // Profile links — open externally, never intercept
    if (JIRA_PROFILE_RE.test(href)) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      return;
    }

    const m = JIRA_BROWSE_RE.exec(href);
    if (!m) return;

    const linkedKey = m[1].toUpperCase();
    a.addEventListener('click', (e) => {
      e.preventDefault();
      // Ctrl/Cmd+click → open in browser
      if (e.ctrlKey || e.metaKey) {
        window.open(href, '_blank', 'noopener,noreferrer');
        return;
      }
      openFromHistory(linkedKey);
    });
  });
}

async function bindAuthImages(container) {
  container.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src');
    if (
      src &&
      !src.startsWith('data:') &&
      !src.startsWith('blob:') &&
      (src.startsWith('/') || src.includes(cfg.baseUrl.split('//')[1]))
    ) {
      img.dataset.authSrc = src.startsWith('/') ? cfg.baseUrl + src : src;
      img.removeAttribute('src');
    }
  });
  container.querySelectorAll('img[data-auth-src]').forEach(async (img) => {
    const blob = await fetchBlob(img.dataset.authSrc);
    if (blob) img.src = blob;
    else img.alt = 'Image unavailable';
    delete img.dataset.authSrc;
  });
}

async function renderHierarchy(rootKey, directParent) {
  if (!directParent) return;
  const titleEl = document.getElementById('hierarchy-title');
  const chainEl = document.getElementById('hierarchy-chain');
  if (!titleEl || !chainEl) return;

  // Walk up through parents, using cache where possible
  const chain = []; // [{key, summary, type}] ordered from top to direct parent
  let parentKey = directParent.key;
  const visited = new Set([rootKey]);

  while (parentKey && !visited.has(parentKey) && chain.length < 6) {
    visited.add(parentKey);
    let parentIssue = issueCache[parentKey];
    if (!parentIssue) {
      try {
        parentIssue = await fetchIssue(parentKey);
        issueCache[parentKey] = parentIssue;
        saveState();
      } catch {
        break;
      }
    }
    const pf = parentIssue.fields || {};
    chain.unshift({
      key: parentKey,
      summary: pf.summary || '\u2014',
      type: pf.issuetype?.name || '\u2014',
    });
    parentKey = pf.parent ? pf.parent.key : null;
  }

  if (!chain.length) return;

  // Re-check elements still exist — user may have navigated away during async walk
  const titleEl2 = document.getElementById('hierarchy-title');
  const chainEl2 = document.getElementById('hierarchy-chain');
  if (!titleEl2 || !chainEl2) return;

  titleEl2.style.display = '';
  let html = '';
  for (let i = 0; i < chain.length; i++) {
    const item = chain[i];
    html +=
      '<div style="padding-left:' +
      i * 16 +
      'px;margin-bottom:4px;">' +
      '<a href="' +
      esc(cfg.baseUrl) +
      '/browse/' +
      esc(item.key) +
      '" target="_blank" class="rs-parent-link">' +
      '<span style="font-size:11px;opacity:0.6;margin-right:4px;">' +
      esc(item.type) +
      '</span>' +
      esc(item.key) +
      ' \u2014 ' +
      esc(item.summary) +
      '</a></div>';
  }
  chainEl2.innerHTML = html;
}
