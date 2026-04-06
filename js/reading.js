'use strict';

// ── READING PANE — ORCHESTRATOR ───────────────────────────────────────────────
// Assembles the right-hand ticket detail pane from HTML builder functions
// (reading-content.js) and binds interactive behaviour (reading-bindings.js).

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
  // Partial cache entries (from JQL search) only have a few fields; description is
  // never included. A full fetchIssue (fields=*all) always has description present
  // (even if null). This check correctly catches both partial and missing entries.
  if (!issue || issue.fields?.description === undefined) {
    content.innerHTML =
      '<div class="loading-spinner"><div class="spinner"></div>Loading ' + esc(key) + '...</div>';
    fetchIssue(key)
      .then((data) => {
        issueCache[key] = data;
        saveState();
        // Only re-render if the user is still viewing this ticket — avoids stale
        // re-renders when the user navigates away before the fetch resolves.
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
  let html = '<div class="rs-header">';
  html += buildLabelsHtml(key);
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
    buildGroupSelectHtml(key) +
    '<button class="top-btn" data-action="toggle-notes"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg> Notes</button>' +
    '<button class="top-btn" data-action="refresh-reading"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.38-7.72"/></svg> Refresh</button>' +
    '</div></div>';
  html += buildMetaGridHtml(f, key);
  html +=
    '<div class="section-title" id="hierarchy-title" style="display:none;">Hierarchy</div>' +
    '<div id="hierarchy-chain" style="margin-bottom:12px;"></div>';
  html += buildContentHtml(issue);
  html += buildLinkedIssuesHtml(f);
  html += buildCommentsHtml(f, issue);

  content.innerHTML = html;
  document.getElementById('notes-text').value = state.notes[key] || '';
  bindReadingHandlers(content, key);
  bindAuthImages(content);
  bindCodeCopyButtons(content);
  bindJiraLinks(content);
  bindEditableMetaFields(content, key);
  renderHierarchy(key, f.parent);
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
