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
      case 'assign-me':
        el.addEventListener('click', () => assignToMe(elKey));
        break;
      case 'submit-comment':
        el.addEventListener('click', () => submitComment(el, elKey));
        break;
      case 'cancel-comment':
        el.addEventListener('click', () => {
          const ta = document.getElementById('comment-input');
          if (ta) ta.value = '';
        });
        break;
      case 'link-item-add':
        el.addEventListener('click', () => openLinkPicker(el, elKey));
        break;
      case 'open-linked-item':
        el.addEventListener('click', () => openLinkedItem(el.dataset.type, el.dataset.id));
        break;
      case 'unlink-item':
        el.addEventListener('click', () => {
          unlinkItemFromKey(el.dataset.type, el.dataset.id, elKey);
          if (state.activeKey === elKey) renderReading();
        });
        break;
    }
  });
}

// ── CROSS-LINKING (notes / diagrams / snippets ↔ tickets) ─────────────────────
// A ticket can be linked to any note, diagram, or snippet. The link lives on the
// item (as linkedKeys[]), so it's local-only and never touches Jira.
const LINK_TYPE_LABEL = { note: 'Note', mindmap: 'Diagram', snippet: 'Snippet' };

function _linkCollections() {
  return [
    { type: 'note', arr: state.standAloneNotes || [], titleOf: (x) => x.title },
    { type: 'mindmap', arr: state.mindMaps || [], titleOf: (x) => x.name },
    { type: 'snippet', arr: state.codeBlocks || [], titleOf: (x) => x.title },
  ];
}

function _findLinkItem(type, id) {
  const c = _linkCollections().find((c) => c.type === type);
  return c ? c.arr.find((x) => x.id === id) : null;
}

function allLinkableItems() {
  const out = [];
  for (const c of _linkCollections()) {
    for (const x of c.arr) {
      out.push({ type: c.type, id: x.id, title: (c.titleOf(x) || '').trim() || 'Untitled' });
    }
  }
  return out;
}

function linkedItemsForKey(key) {
  return allLinkableItems().filter((it) => {
    const obj = _findLinkItem(it.type, it.id);
    return obj && Array.isArray(obj.linkedKeys) && obj.linkedKeys.includes(key);
  });
}

function linkItemToKey(type, id, key) {
  const obj = _findLinkItem(type, id);
  if (!obj) return;
  if (!Array.isArray(obj.linkedKeys)) obj.linkedKeys = [];
  if (!obj.linkedKeys.includes(key)) obj.linkedKeys.push(key);
  saveState();
}

function unlinkItemFromKey(type, id, key) {
  const obj = _findLinkItem(type, id);
  if (!obj || !Array.isArray(obj.linkedKeys)) return;
  obj.linkedKeys = obj.linkedKeys.filter((k) => k !== key);
  saveState();
}

function openLinkedItem(type, id) {
  if (type === 'note') {
    state.activeNoteId = id;
    switchTab('notes');
  } else if (type === 'mindmap') {
    state.activeMindMapId = id;
    switchTab('mindmap');
  } else if (type === 'snippet') {
    state.activeCodeBlockId = id;
    switchTab('snippets');
  }
}

// Dropdown of every linkable item not already attached to this ticket. Mirrors
// the assignee/status dropdown: opens below the "+ Link" button, closes on an
// outside click.
function openLinkPicker(btn, key) {
  const container = btn.parentElement;
  if (!container || container.querySelector('.link-picker')) return;

  const picker = document.createElement('div');
  picker.className = 'link-picker';

  const onDoc = (e) => {
    if (!container.contains(e.target)) close();
  };
  const close = () => {
    picker.remove();
    document.removeEventListener('click', onDoc, true);
  };
  setTimeout(() => document.addEventListener('click', onDoc, true), 0);

  const alreadyLinked = new Set(linkedItemsForKey(key).map((it) => it.type + ':' + it.id));
  const available = allLinkableItems().filter((it) => !alreadyLinked.has(it.type + ':' + it.id));

  if (!available.length) {
    const empty = document.createElement('div');
    empty.className = 'link-picker-empty';
    empty.textContent = 'No notes, diagrams, or snippets to link';
    picker.appendChild(empty);
  } else {
    available.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'link-picker-option';
      row.textContent = (LINK_TYPE_LABEL[it.type] || it.type) + ' · ' + it.title;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        close();
        linkItemToKey(it.type, it.id, key);
        if (state.activeKey === key) renderReading();
      });
      picker.appendChild(row);
    });
  }
  container.appendChild(picker);
}

// Post the compose box's text as a comment, then re-fetch the issue so the
// server-rendered comment (ADF → HTML) appears. A blank box is a no-op.
async function submitComment(btn, key) {
  const ta = document.getElementById('comment-input');
  const text = (ta?.value || '').trim();
  if (!text) return;
  btn.disabled = true;
  try {
    await addComment(key, text);
    toast('Comment added', 'success');
    try {
      const data = await fetchIssue(key);
      issueCache[key] = data;
      saveState();
    } catch {
      /* the comment posted; a failed refresh just means it shows on next load */
    }
    if (state.activeKey === key) renderReading();
  } catch (e) {
    toast('Failed to add comment: ' + e.message, 'error');
    btn.disabled = false;
  }
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
        if (type === 'status') startStatusEdit(item, currentValueEl, issueKey);
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

// Status is edited differently from other meta fields: instead of an inline
// input it opens a dropdown of workflow transitions fetched on demand. Only the
// transitions legal from the current status come back, so every option is valid.
async function startStatusEdit(item, valueEl, issueKey) {
  // A second click while the dropdown is open would stack duplicates.
  if (item.querySelector('.status-transition-dropdown')) return;

  const dropdown = document.createElement('div');
  dropdown.className = 'status-transition-dropdown';
  const loading = document.createElement('div');
  loading.className = 'status-transition-option status-transition-loading';
  loading.textContent = 'Loading…';
  dropdown.appendChild(loading);
  item.appendChild(dropdown);

  // Close on any click outside the meta-item. Attached on the next tick so the
  // click that opened the dropdown doesn't immediately close it.
  const onDocClick = (e) => {
    if (!item.contains(e.target)) close();
  };
  const close = () => {
    dropdown.remove();
    document.removeEventListener('click', onDocClick, true);
  };
  setTimeout(() => document.addEventListener('click', onDocClick, true), 0);

  let transitions;
  try {
    transitions = await fetchTransitions(issueKey);
  } catch (e) {
    toast('Could not load transitions: ' + e.message, 'error');
    close();
    return;
  }
  // The user may have closed the dropdown or navigated away during the fetch.
  if (!item.contains(dropdown)) return;

  dropdown.innerHTML = '';
  if (!transitions.length) {
    const none = document.createElement('div');
    none.className = 'status-transition-option status-transition-loading';
    none.textContent = 'No transitions available';
    dropdown.appendChild(none);
    return;
  }

  transitions.forEach((t) => {
    const row = document.createElement('div');
    row.className = 'status-transition-option';
    row.textContent = t.name;
    row.addEventListener('click', async (e) => {
      // stopPropagation prevents the click from bubbling to the meta-item's own
      // handler, which would otherwise reopen the dropdown after close().
      e.stopPropagation();
      close();
      try {
        await doTransition(issueKey, t.id);
        const to = t.to || {};
        if (issueCache[issueKey]?.fields) {
          issueCache[issueKey].fields.status = {
            name: to.name || t.name,
            statusCategory: to.statusCategory,
          };
        }
        saveState();
        toast('Status → ' + (to.name || t.name), 'success');
        if (state.activeKey === issueKey) {
          renderMiddle();
          renderReading();
        }
      } catch (err) {
        toast('Failed to change status: ' + err.message, 'error');
      }
    });
    dropdown.appendChild(row);
  });
}

// Shared engine for all date meta-field editors (due date, tl-start, tl-eta).
// getCurrent() → 'YYYY-MM-DD' | ''; onCommit(val, current) → void | Promise<void>
function startDateFieldEdit(item, valueEl, openPicker, getCurrent, onCommit) {
  const current = getCurrent();
  const input = document.createElement('input');
  input.type = 'date';
  input.value = current;
  input.className = 'meta-edit-input';
  valueEl.replaceWith(input);
  input.focus();

  const commit = async () => {
    const val = input.value;
    await onCommit(val, current);
    input.replaceWith(makeMetaValue(formatDate(val), true));
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    }
    if (e.key === 'Escape') input.replaceWith(makeMetaValue(formatDate(current), true));
  });
  input.addEventListener('blur', commit);
}

function startDueDateEdit(item, valueEl, issueKey, openPicker) {
  startDateFieldEdit(
    item,
    valueEl,
    openPicker,
    () => issueCache[issueKey]?.fields?.duedate || '',
    async (val, current) => {
      if (val !== current) {
        try {
          await updateIssueFields(issueKey, { duedate: val || null });
          if (issueCache[issueKey]?.fields) issueCache[issueKey].fields.duedate = val || null;
          toast('Due date updated', 'success');
        } catch (e) {
          toast('Failed to save: ' + e.message, 'error');
        }
      }
    }
  );
}

function startTimelineEdit(type, item, valueEl, issueKey, openPicker) {
  const field = type === 'tl-start' ? 'start' : 'eta';
  startDateFieldEdit(
    item,
    valueEl,
    openPicker,
    () => state.timelines[issueKey]?.[field] || '',
    (val) => {
      if (!state.timelines[issueKey]) state.timelines[issueKey] = {};
      if (val) {
        state.timelines[issueKey][field] = val;
      } else {
        delete state.timelines[issueKey][field];
        if (!Object.keys(state.timelines[issueKey]).length) delete state.timelines[issueKey];
      }
      saveState();
    }
  );
}
