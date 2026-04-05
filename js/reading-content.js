'use strict';

// ── READING PANE — HTML BUILDERS ──────────────────────────────────────────────
// Pure HTML-string builders called by renderReading(). Each function takes
// issue data and returns an HTML fragment; no DOM access here.

// Fields we deliberately omit from the rendered custom-field list.
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

function buildGroupSelectHtml(key) {
  let html =
    '<select class="rs-group-select" data-action="move-ticket" data-key="' + esc(key) + '">';
  for (const g of state.groups) {
    html +=
      '<option value="' +
      esc(g.id) +
      '" ' +
      (g.id === state.activeGroupId ? 'selected' : '') +
      '>' +
      esc(g.name) +
      '</option>';
  }
  return html + '</select>';
}

function buildLabelsHtml(key) {
  const myLbls = state.labels[key] || [];
  let html = '<div style="margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap;">';
  for (const L of myLbls) {
    const c = state.labelColors[L] || '#6e7681';
    html +=
      '<span class="lbl-badge" style="background:' +
      c +
      ';' +
      (c === '#f0883e' || c === '#e3b341' ? 'color:#000;' : 'color:#fff;') +
      '">' +
      '<span data-action="view-label" data-label="' +
      esc(L) +
      '" style="cursor:pointer;" title="View all tickets with this label">' +
      esc(L) +
      '</span>' +
      ' <span class="x-btn" data-action="remove-label" data-key="' +
      esc(key) +
      '" data-label="' +
      esc(L) +
      '">\u2715</span></span>';
  }
  html +=
    '<button class="lbl-add" data-action="add-label" data-key="' +
    esc(key) +
    '">+ Label</button></div>';
  return html;
}

function buildMetaGridHtml(f) {
  const storyPoints = f.story_points ?? null;
  const items = [
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
      editable: 'assignee',
      v: f.assignee
        ? avBadge(f.assignee.displayName, 'av-rg') + ' ' + esc(f.assignee.displayName)
        : 'Unassigned',
    },
    {
      l: 'Reporter',
      v: f.reporter
        ? avBadge(f.reporter.displayName, 'av-rg') + ' ' + esc(f.reporter.displayName)
        : '\u2014',
    },
    { l: 'Type', v: f.issuetype?.name || '\u2014' },
    { l: 'Priority', v: f.priority?.name || '\u2014' },
    { l: 'Created', v: relDate(f.created) },
    { l: 'Updated', v: relDate(f.updated) },
  ];
  if (f.duedate) {
    items.splice(
      items.findIndex((i) => i.l === 'Created'),
      0,
      {
        l: 'Due',
        v: relDate(f.duedate),
      }
    );
  }
  if (f.fixVersions && f.fixVersions.length) {
    items.push({ l: 'Fix Version', v: esc(f.fixVersions.map((v) => v.name).join(', ')) });
  }
  if (f.components && f.components.length) {
    items.push({ l: 'Components', v: esc(f.components.map((c) => c.name).join(', ')) });
  }
  if (storyPoints !== null) {
    items.splice(1, 0, {
      l: 'Story Points',
      editable: 'story-points',
      v: String(storyPoints),
    });
  }
  let html = '<div class="meta-grid">';
  for (const m of items) {
    const edAttr = m.editable ? ' data-editable="' + m.editable + '"' : '';
    const editCls = m.editable ? ' meta-editable' : '';
    html +=
      '<div class="meta-item' +
      editCls +
      '"' +
      edAttr +
      '><div class="meta-label">' +
      m.l +
      '</div><div class="meta-value">' +
      m.v +
      '</div></div>';
  }
  return html + '</div>';
}

function buildContentHtml(issue) {
  if (!issue.renderedFields) return '';
  let html = '';
  if (issue.renderedFields.description) {
    // Strip Smart Link icons and Jira-injected decorators that clutter the view
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
  return html;
}

function buildLinkedIssuesHtml(f) {
  if (!f.issuelinks || !f.issuelinks.length) return '';
  let html = '<div class="section-title">Linked Issues</div><div class="links-grid">';
  for (const l of f.issuelinks) {
    const isOut = !!l.outwardIssue;
    const t = isOut ? l.outwardIssue : l.inwardIssue;
    const rel = isOut ? l.type.outward : l.type.inward;
    html +=
      '<div class="link-card" data-action="open-ticket" data-key="' +
      esc(t.key) +
      '">' +
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
      '" target="_blank" class="link-open-jira" title="Open in Jira">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>' +
      '<polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>' +
      '</svg></a></div>';
  }
  return html + '</div>';
}

function buildCommentsHtml(f, issue) {
  const comments = f.comment?.comments || [];
  const rc = issue.renderedFields?.comment?.comments || [];
  if (!comments.length) return '';
  let html = '<div class="section-title">Comments (' + comments.length + ')</div><div>';
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
  return html + '</div>';
}
