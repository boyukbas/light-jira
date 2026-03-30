'use strict';

// ── RENDER RIGHT (READING) ────────────────────────────────────────────────────
function renderReading() {
  const empty = document.getElementById('reading-empty');
  const content = document.getElementById('reading-content');
  if (!empty || !content) return;
  if (!state.activeKey) {
    empty.style.display = 'block';
    content.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  content.style.display = 'block';

  const key = state.activeKey;
  addToHistory(key); // record view — deduplicates silently, updates timestamp
  const issue = issueCache[key];
  // Partial cache entries (from JQL search) only have a few fields — description is never included.
  // A full fetchIssue (fields=*all) always has description present (even if null).
  // This check correctly catches both new partial entries and old ones that had renderedFields.
  if (!issue || issue.fields?.description === undefined) {
    content.innerHTML =
      '<div class="loading-spinner"><div class="spinner"></div>Loading ' + esc(key) + '...</div>';
    fetchIssue(key)
      .then((data) => {
        issueCache[key] = data;
        saveState();
        // B2 fix: only re-render if the user is still looking at this ticket.
        // An unconditional renderMiddle() here caused stale re-renders when the
        // user navigated away before the fetch resolved.
        if (state.activeKey === key) {
          renderMiddle();
          renderReading();
        }
      })
      .catch((err) => {
        content.innerHTML =
          '<div class="empty-msg" style="color:var(--red);">Error loading ' +
          esc(key) +
          ':<br>' +
          esc(err.message) +
          '</div>';
      });
    return;
  }

  const f = issue.fields;
  let selHtml =
    '<select class="rs-group-select" onchange="moveTicket(\'' + esc(key) + '\', this.value)">';
  for (const g of state.groups) {
    selHtml +=
      '<option value="' +
      esc(g.id) +
      '" ' +
      (g.id === state.activeGroupId ? 'selected' : '') +
      '>' +
      esc(g.name) +
      '</option>';
  }
  selHtml += '</select>';

  let html = '<div class="rs-header">';
  html += '<div style="margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap;">';
  const myLbls = state.labels[key] || [];
  for (const L of myLbls) {
    const c = state.labelColors[L] || '#6e7681';
    const escapedL = esc(L).replace(/'/g, "\\'");
    html +=
      '<span class="lbl-badge" style="background:' +
      c +
      ';' +
      (c === '#f0883e' || c === '#e3b341' ? 'color:#000;' : 'color:#fff;') +
      '">' +
      '<span onclick="viewByLabel(\'' +
      escapedL +
      '\')" style="cursor:pointer;" title="View all tickets with this label">' +
      esc(L) +
      '</span>' +
      ' <span class="x-btn" onclick="removeLabel(\'' +
      esc(key) +
      "', '" +
      escapedL +
      '\')">✕</span></span>';
  }
  html += '<button class="lbl-add" onclick="addLabel(\'' + esc(key) + '\')">+ Label</button></div>';

  html +=
    '<div class="rs-title-row"><div class="rs-title"><a href="' +
    esc(cfg.baseUrl) +
    '/browse/' +
    esc(key) +
    '" target="_blank" style="color:var(--accent);text-decoration:none;">' +
    esc(key) +
    '</a> ' +
    esc(f.summary) +
    '</div></div>';
  html +=
    '<div class="rs-actions">' +
    selHtml +
    '<button class="top-btn" onclick="toggleNotes()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg> Notes</button>' +
    '<button class="top-btn" onclick="forceRefreshReading()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.38-7.72"/></svg> Refresh</button></div></div>';

  html += '<div class="meta-grid">';
  const metas = [
    {
      l: 'Status',
      v:
        '<span class="status-badge ' +
        statusClass(f.status?.statusCategory?.name || f.status?.name) +
        '">' +
        esc(f.status?.name) +
        '</span>',
    },
    {
      l: 'Assignee',
      v: f.assignee
        ? avBadge(f.assignee.displayName, 'av-rg') + ' ' + esc(f.assignee.displayName)
        : 'Unassigned',
    },
    {
      l: 'Reporter',
      v: f.reporter
        ? avBadge(f.reporter.displayName, 'av-rg') + ' ' + esc(f.reporter.displayName)
        : '—',
    },
    { l: 'Type', v: f.issuetype?.name || '—' },
    { l: 'Created', v: relDate(f.created) },
    { l: 'Updated', v: relDate(f.updated) },
  ];
  for (const m of metas)
    html +=
      '<div class="meta-item"><div class="meta-label">' +
      m.l +
      '</div><div class="meta-value">' +
      m.v +
      '</div></div>';
  html += '</div>';

  html +=
    '<div class="section-title" id="hierarchy-title" style="display:none;">Hierarchy</div><div id="hierarchy-chain" style="margin-bottom:12px;"></div>';

  if (issue.renderedFields) {
    const HIDDEN_FIELDS = [
      'last viewed',
      'updated',
      'status category changed',
      '[chart] date of first response',
      'created',
      'parent key',
      'ticket score',
      'service offering',
    ];

    if (issue.renderedFields.description) {
      // Aggressive strip of Smart Link icons and Jira-injected decorators
      let cleanDesc = issue.renderedFields.description;
      cleanDesc = cleanDesc.replace(/<img[^>]*lightbulb[^>]*>/gi, '');
      cleanDesc = cleanDesc.replace(/<img[^>]*favicon[^>]*>/gi, '');
      cleanDesc = cleanDesc.replace(/<span[^>]*ak-link-icon[^>]*>.*?<\/span>/gi, '');
      cleanDesc = cleanDesc.replace(/<img[^>]*info-modeler[^>]*>/gi, '');
      html +=
        '<div class="section-title">Description</div><div class="description">' +
        cleanDesc +
        '</div>';
    }
    for (const [keyField, val] of Object.entries(issue.renderedFields)) {
      if (keyField === 'description' || keyField === 'comment' || !val || typeof val !== 'string')
        continue;
      const fName =
        customFieldMap[keyField] ||
        keyField.charAt(0).toUpperCase() + keyField.slice(1).replace(/_/g, ' ');
      const ln = fName.toLowerCase();
      if (ln.includes('time') || ln.includes('estimate') || ln.includes('worklog')) continue;
      if (ln.includes('incident')) continue;
      if (HIDDEN_FIELDS.includes(ln)) continue;
      html +=
        '<div class="section-title">' +
        esc(fName) +
        '</div><div class="description">' +
        val +
        '</div>';
    }
  }

  if (f.issuelinks && f.issuelinks.length) {
    html += '<div class="section-title">Linked Issues</div><div class="links-grid">';
    for (const l of f.issuelinks) {
      const isOut = !!l.outwardIssue;
      const t = isOut ? l.outwardIssue : l.inwardIssue;
      const rel = isOut ? l.type.outward : l.type.inward;
      html +=
        '<div class="link-card" onclick="openTicketByKey(\'' +
        esc(t.key) +
        '\')">' +
        '<div style="flex:1;min-width:0;">' +
        '<div class="link-type">' +
        esc(rel) +
        '</div>' +
        '<div class="link-key">' +
        esc(t.key) +
        '</div>' +
        '<div class="link-sum">' +
        esc(t.fields?.summary || '') +
        '</div></div>' +
        '<a href="' +
        esc(cfg.baseUrl) +
        '/browse/' +
        esc(t.key) +
        '" target="_blank" class="link-open-jira" onclick="event.stopPropagation()" title="Open in Jira">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
        '</a></div>';
    }
    html += '</div>';
  }

  const comments = f.comment?.comments || [];
  const rc = issue.renderedFields?.comment?.comments || [];
  if (comments.length) {
    html += '<div class="section-title">Comments (' + comments.length + ')</div><div>';
    for (let i = 0; i < comments.length; i++) {
      const c = comments[i];
      html +=
        '<div class="comment-item">' +
        '<div class="c-avatar">' +
        avBadge(c.author?.displayName, 'av-md') +
        '</div>' +
        '<div class="c-content">' +
        '<div class="c-header"><span class="c-author">' +
        esc(c.author?.displayName) +
        '</span><span class="c-date">' +
        relDate(c.created) +
        '</span></div>' +
        '<div class="c-body description">' +
        (rc[i] ? rc[i].body : '') +
        '</div></div></div>';
    }
    html += '</div>';
  }
  content.innerHTML = html;
  const notesTextEl = document.getElementById('notes-text');
  notesTextEl.value = state.notes[key] || '';
  bindAuthImages(content);
  bindCodeCopyButtons(content);
  bindJiraLinks(content);
  renderHierarchy(key, f.parent);
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

// Pattern for Jira user/profile links — these should not be intercepted
const JIRA_PROFILE_RE = /\/(jira\/people|jira\/user|profile|users?)\//i;
// Pattern for /browse/KEY-123 links
const JIRA_BROWSE_RE = /\/browse\/([A-Z][A-Z0-9_]+-\d+)/i;

function bindJiraLinks(container) {
  container.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';

    // Profile links — ensure they open in a new tab externally, never in app
    if (JIRA_PROFILE_RE.test(href)) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      return;
    }

    // Browse links
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
      // Regular click → open in app
      openFromHistory(linkedKey);
    });
  });
}

async function renderHierarchy(rootKey, directParent) {
  if (!directParent) return;
  const titleEl = document.getElementById('hierarchy-title');
  const chainEl = document.getElementById('hierarchy-chain');
  if (!titleEl || !chainEl) return;

  // Build chain by walking up through parents (using cache or fetching)
  const chain = []; // [{key, summary, type}] from root to top
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
    chain.unshift({ key: parentKey, summary: pf.summary || '—', type: pf.issuetype?.name || '—' });
    parentKey = pf.parent ? pf.parent.key : null;
  }

  if (!chain.length) return;

  // Re-check the chain container still exists (user may have navigated away)
  const titleEl2 = document.getElementById('hierarchy-title');
  const chainEl2 = document.getElementById('hierarchy-chain');
  if (!titleEl2 || !chainEl2) return;

  titleEl2.style.display = '';
  let html = '';
  for (let i = 0; i < chain.length; i++) {
    const item = chain[i];
    const indent = i * 16;
    html +=
      '<div style="padding-left:' +
      indent +
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

function toggleNotes() {
  document.getElementById('notes-pane').classList.toggle('open');
}
function saveNotes(val) {
  if (state.activeKey) {
    state.notes[state.activeKey] = val;
    saveState();
  }
}

// ── IMAGE AUTH ENGINE ─────────────────────────────────────────────────────────
async function bindAuthImages(container) {
  container.querySelectorAll('img[src]').forEach((img) => {
    let src = img.getAttribute('src');
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
