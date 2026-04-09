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

    // Inject a small "open in Jira" icon link right after the intercepted anchor
    const icon = document.createElement('a');
    icon.className = 'jira-link-icon';
    icon.href = href;
    icon.target = '_blank';
    icon.rel = 'noopener noreferrer';
    icon.title = 'Open ' + linkedKey + ' in Jira';
    icon.innerHTML =
      '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
    a.after(icon);
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
  const jiraIconSvg =
    '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
  for (let i = 0; i < chain.length; i++) {
    const item = chain[i];
    const browseUrl = esc(cfg.baseUrl) + '/browse/' + esc(item.key);
    html +=
      '<div style="padding-left:' +
      i * 16 +
      'px;margin-bottom:4px;display:flex;align-items:center;gap:6px;">' +
      '<a href="' +
      browseUrl +
      '" target="_blank" class="rs-parent-link">' +
      '<span style="font-size:11px;opacity:0.6;margin-right:4px;">' +
      esc(item.type) +
      '</span>' +
      esc(item.key) +
      ' \u2014 ' +
      esc(item.summary) +
      '</a>' +
      '<a href="' +
      browseUrl +
      '" target="_blank" rel="noopener noreferrer" class="jira-link-icon" title="Open ' +
      esc(item.key) +
      ' in Jira">' +
      jiraIconSvg +
      '</a>' +
      '</div>';
  }
  chainEl2.innerHTML = html;
}

// ── INLINE FIELD EDITING ──────────────────────────────────────────────────────

function bindEditableMetaFields(container, issueKey) {
  container.querySelectorAll('[data-editable]').forEach((item) => {
    const type = item.dataset.editable;
    const isDate = type === 'due-date' || type === 'tl-start' || type === 'tl-eta';

    if (isDate) {
      // Calendar button → open native date picker
      const calBtn = item.querySelector('.cal-btn');
      if (calBtn) {
        calBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (item.querySelector('input')) return;
          const valueEl = item.querySelector('.meta-value');
          if (!valueEl) return;
          if (type === 'due-date') startDueDateEdit(item, valueEl, issueKey, true);
          else startTimelineEdit(type, item, valueEl, issueKey, true);
        });
      }
      // Text area click → focus input without opening picker
      item.addEventListener('click', (e) => {
        if (e.target.closest('.cal-btn')) return;
        if (item.querySelector('input')) return;
        const valueEl = item.querySelector('.meta-value');
        if (!valueEl) return;
        if (type === 'due-date') startDueDateEdit(item, valueEl, issueKey, false);
        else startTimelineEdit(type, item, valueEl, issueKey, false);
      });
    } else {
      item.addEventListener('click', () => {
        if (item.querySelector('input')) return;
        const currentValueEl = item.querySelector('.meta-value');
        if (!currentValueEl) return;
        if (type === 'story-points') startStoryPointsEdit(item, currentValueEl, issueKey);
        if (type === 'assignee') startAssigneeEdit(item, currentValueEl, issueKey);
      });
    }
  });
}

// Build a fresh .meta-value div. For date fields, includes a calendar icon button.
function makeMetaValue(text, isDate = false) {
  const div = document.createElement('div');
  div.className = 'meta-value';
  if (isDate) {
    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    div.appendChild(textSpan);
    const btn = document.createElement('button');
    btn.className = 'cal-btn';
    btn.setAttribute('aria-label', 'Open date picker');
    btn.setAttribute('title', 'Open date picker');
    btn.innerHTML = CAL_SVG;
    div.appendChild(btn);
  } else {
    div.textContent = text;
    const hint = document.createElement('span');
    hint.className = 'edit-hint';
    hint.setAttribute('aria-hidden', 'true');
    div.appendChild(hint);
  }
  return div;
}

function startStoryPointsEdit(item, valueEl, issueKey) {
  const current = parseFloat(valueEl.textContent) || 0;
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.step = '1';
  input.value = current;
  input.className = 'meta-edit-input';
  valueEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = async () => {
    const val = parseFloat(input.value);
    if (!isNaN(val) && val !== current) {
      try {
        await updateIssueFields(issueKey, { story_points: val });
        // Update cache so re-render shows new value
        if (issueCache[issueKey]?.fields) issueCache[issueKey].fields.story_points = val;
        toast('Story points updated', 'success');
      } catch (e) {
        toast('Failed to save: ' + e.message, 'error');
      }
    }
    input.replaceWith(makeMetaValue(isNaN(val) ? current : val));
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') input.replaceWith(makeMetaValue(current));
  });
  input.addEventListener('blur', commit);
}

function startAssigneeEdit(item, valueEl, issueKey) {
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search user…';
  input.className = 'meta-edit-input';
  valueEl.replaceWith(input);
  input.focus();

  let debounceTimer = null;
  let dropdown = null;

  const removeDropdown = () => {
    if (dropdown) {
      dropdown.remove();
      dropdown = null;
    }
  };

  const showDropdown = (users) => {
    removeDropdown();
    if (!users.length) return;
    dropdown = document.createElement('div');
    dropdown.className = 'user-search-dropdown';
    users.forEach((u) => {
      const row = document.createElement('div');
      row.className = 'user-search-result';
      row.textContent = u.displayName;
      row.addEventListener('mousedown', async (e) => {
        e.preventDefault(); // prevent input blur before click registers
        removeDropdown();
        try {
          await updateIssueFields(issueKey, { assignee: { accountId: u.accountId } });
          if (issueCache[issueKey]?.fields)
            issueCache[issueKey].fields.assignee = {
              accountId: u.accountId,
              displayName: u.displayName,
            };
          toast('Assignee updated to ' + u.displayName, 'success');
        } catch (e2) {
          toast('Failed to save: ' + e2.message, 'error');
        }
        input.replaceWith(makeMetaValue(u.displayName));
      });
      dropdown.appendChild(row);
    });
    item.appendChild(dropdown);
  };

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (!q) {
      removeDropdown();
      return;
    }
    debounceTimer = setTimeout(async () => {
      try {
        const users = await searchUsers(q);
        showDropdown(users);
      } catch {
        /* ignore */
      }
    }, 300);
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      removeDropdown();
      if (!item.querySelector('.meta-value')) {
        input.replaceWith(
          makeMetaValue(issueCache[issueKey]?.fields?.assignee?.displayName || 'Unassigned')
        );
      }
    }, 150);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      removeDropdown();
      input.replaceWith(
        makeMetaValue(issueCache[issueKey]?.fields?.assignee?.displayName || 'Unassigned')
      );
    }
  });
}

function startDueDateEdit(item, valueEl, issueKey, openPicker) {
  const current = issueCache[issueKey]?.fields?.duedate || '';
  const input = document.createElement('input');
  input.type = 'date';
  input.value = current;
  input.className = 'meta-edit-input';
  valueEl.replaceWith(input);
  input.focus();
  if (openPicker)
    try {
      input.showPicker();
    } catch {}

  const formatDisplay = (d) =>
    d
      ? new Date(d).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: '2-digit',
        })
      : '\u2014';

  const commit = async () => {
    const val = input.value; // 'YYYY-MM-DD' or ''
    if (val !== current) {
      try {
        await updateIssueFields(issueKey, { duedate: val || null });
        if (issueCache[issueKey]?.fields) issueCache[issueKey].fields.duedate = val || null;
        toast('Due date updated', 'success');
      } catch (e) {
        toast('Failed to save: ' + e.message, 'error');
      }
    }
    input.replaceWith(makeMetaValue(formatDisplay(val), true));
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    }
    if (e.key === 'Escape') input.replaceWith(makeMetaValue(formatDisplay(current), true));
  });
  input.addEventListener('blur', commit);
}

function startTimelineEdit(type, item, valueEl, issueKey, openPicker) {
  const field = type === 'tl-start' ? 'start' : 'eta';
  const current = state.timelines[issueKey]?.[field] || '';
  const input = document.createElement('input');
  input.type = 'date';
  input.value = current;
  input.className = 'meta-edit-input';
  valueEl.replaceWith(input);
  input.focus();
  if (openPicker)
    try {
      input.showPicker();
    } catch {}

  const formatDisplay = (d) =>
    d
      ? new Date(d).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: '2-digit',
        })
      : '\u2014';

  const commit = () => {
    const val = input.value; // 'YYYY-MM-DD' or ''
    if (!state.timelines[issueKey]) state.timelines[issueKey] = {};
    if (val) {
      state.timelines[issueKey][field] = val;
    } else {
      delete state.timelines[issueKey][field];
      if (!Object.keys(state.timelines[issueKey]).length) delete state.timelines[issueKey];
    }
    saveState();
    input.replaceWith(makeMetaValue(formatDisplay(val), true));
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    }
    if (e.key === 'Escape') input.replaceWith(makeMetaValue(formatDisplay(current), true));
  });
  input.addEventListener('blur', commit);
}
