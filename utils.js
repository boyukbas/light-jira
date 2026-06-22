'use strict';

// ── UTILS ─────────────────────────────────────────────────────────────────────
function normalise(raw) {
  let t = raw.trim();
  // Handle full Jira URLs: https://site.atlassian.net/browse/PROJ-123
  try {
    if (t.startsWith('http')) {
      const url = new URL(t);
      const browsePath = url.pathname.match(/\/browse\/([A-Za-z][A-Za-z0-9]+-\d+)/);
      if (browsePath) return browsePath[1].toUpperCase();
    }
  } catch {
    /* not a valid URL, continue with normal parsing */
  }

  t = t.toUpperCase();
  if (/^[A-Z][A-Z0-9]+-\d+$/.test(t)) return t;
  const m = t.match(/^([A-Z][A-Z0-9]+)(\d+)$/);
  return m ? m[1] + '-' + m[2] : t;
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(html) {
  // Use DOMParser instead of a detached div+innerHTML — the parser builds an
  // inert document that never triggers resource loads or inline handlers, so
  // malicious markup in Jira-rendered HTML can't fire even during search
  // indexing in middle.js.
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  return doc.body ? doc.body.textContent : '';
}

// ── JIRA HTML SANITIZER ───────────────────────────────────────────────────────
// Centralised allowlist sanitizer for any HTML that originated in Jira
// (issue.renderedFields.description, rendered custom fields, rendered
// comment bodies). Jira renders user-authored content server-side and
// the markup reaches us as a string; without sanitization we'd be injecting
// arbitrary HTML into the DOM. Anything not on the allowlist is either
// dropped (script/style/etc.) or unwrapped (unknown tags keep their text).
const _SAFE_JIRA_TAGS = {
  a: ['href', 'title'],
  abbr: ['title'],
  b: [],
  blockquote: [],
  br: [],
  caption: [],
  code: ['class'],
  col: ['span'],
  colgroup: ['span'],
  dd: [],
  del: [],
  div: ['class'],
  dl: [],
  dt: [],
  em: [],
  figcaption: [],
  figure: ['class'],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
  hr: [],
  i: [],
  img: ['src', 'alt', 'title', 'width', 'height', 'data-attachment-name'],
  ins: [],
  kbd: [],
  li: [],
  mark: [],
  ol: ['start', 'type'],
  p: [],
  pre: ['class'],
  q: [],
  s: [],
  samp: [],
  small: [],
  span: ['class'],
  strong: [],
  sub: [],
  sup: [],
  table: ['class'],
  tbody: [],
  td: ['colspan', 'rowspan'],
  tfoot: [],
  th: ['colspan', 'rowspan', 'scope'],
  thead: [],
  tr: [],
  u: [],
  ul: [],
};

// Tags we drop outright — their content is markup, not user-visible prose,
// so unwrapping them would expose CSS/JS source as text.
const _STRIP_JIRA_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'noscript',
  'svg',
  'math',
]);

function _isSafeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  // Allow absolute http(s), protocol-relative, mailto, tel, hash anchors, and
  // same-origin absolute/relative paths.
  if (/^(https?:|mailto:|tel:)/i.test(s)) return true;
  if (s.startsWith('//') || s.startsWith('/') || s.startsWith('#') || s.startsWith('./') || s.startsWith('../')) {
    return true;
  }
  return false;
}

function _sanitizeJiraNode(node) {
  // Snapshot children — we may remove nodes during iteration.
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === 8) {
      // Comments — strip.
      child.remove();
      continue;
    }
    if (child.nodeType !== 1) continue; // keep text nodes as-is

    const tag = child.tagName.toLowerCase();

    if (_STRIP_JIRA_TAGS.has(tag)) {
      child.remove();
      continue;
    }

    if (!(tag in _SAFE_JIRA_TAGS)) {
      // Unknown tag — unwrap: keep children, drop the element.
      const parent = child.parentNode;
      while (child.firstChild) parent.insertBefore(child.firstChild, child);
      parent.removeChild(child);
      // Re-sanitize the parent since we spliced in new children.
      _sanitizeJiraNode(parent);
      continue;
    }

    const allowed = _SAFE_JIRA_TAGS[tag];
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      // Always-disallowed: event handlers and style (style enables CSS-based
      // attacks such as expression() on old IE and positioning tricks).
      if (name.startsWith('on') || name === 'style') {
        child.removeAttribute(attr.name);
        continue;
      }
      if (!allowed.includes(name)) {
        child.removeAttribute(attr.name);
        continue;
      }
      // URL attributes: validate schemes.
      if ((tag === 'a' && name === 'href') || (tag === 'img' && name === 'src')) {
        if (!_isSafeUrl(attr.value)) {
          child.removeAttribute(attr.name);
        }
      }
    }

    // Force safe link behaviour for anchors that survived.
    if (tag === 'a' && child.getAttribute('href')) {
      child.setAttribute('target', '_blank');
      child.setAttribute('rel', 'noopener noreferrer');
    }

    _sanitizeJiraNode(child);
  }
}

function sanitizeJiraHtml(html) {
  if (!html) return '';
  // DOMParser builds a detached document — no scripts execute, no resources fetched.
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  if (!doc || !doc.body) return '';
  _sanitizeJiraNode(doc.body);
  return doc.body.innerHTML;
}

function statusClass(cat) {
  if (!cat) return '';
  const c = cat.toLowerCase();
  if (c.includes('progress') || c.includes('review')) return 's-inprogress';
  if (
    c.includes('done') ||
    c.includes('complete') ||
    c.includes('closed') ||
    c.includes('resolved')
  )
    return 's-done';
  if (c.includes('block')) return 's-blocked';
  return '';
}

// Initialise Day.js relative-time plugin (script loaded before utils.js)
if (typeof dayjs !== 'undefined' && typeof dayjs_plugin_relativeTime !== 'undefined') {
  dayjs.extend(dayjs_plugin_relativeTime);
}

function relDate(iso) {
  if (typeof dayjs !== 'undefined') return dayjs(iso).fromNow();
  const d = new Date(iso),
    s = (Date.now() - d) / 1000;
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 604800) return Math.floor(s / 86400) + 'd ago';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Severity → on-screen lifetime. Errors stick around long enough to read and
// copy; warnings a bit less; successful/neutral toasts are brief.
const _TOAST_LIFETIME_MS = { error: 8000, warn: 5000, success: 3000, info: 3000 };
let _toastHideTimer = null;

/**
 * Show a non-blocking toast.
 * @param {string} msg  The message. Rendered as text (not HTML).
 * @param {'success'|'warn'|'error'|'info'} [type]  Severity. Controls lifetime
 *   and — for 'error' — adds a "Copy" button so the user can grab the message
 *   for a bug report even if it disappears before they finish reading it.
 */
function toast(msg, type) {
  const el = document.getElementById('toast');
  if (!el) return;
  const severity = type || 'info';

  // Re-announce to screen readers even when the visible text is unchanged:
  // clear aria-live then reassign after a tick.
  el.setAttribute('aria-live', severity === 'error' ? 'assertive' : 'polite');

  // Build DOM (not innerHTML — msg is untrusted).
  el.textContent = '';
  el.dataset.severity = severity;
  const textSpan = document.createElement('span');
  textSpan.className = 'toast-text';
  textSpan.textContent = msg;
  el.appendChild(textSpan);

  if (severity === 'error') {
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'toast-copy';
    copyBtn.textContent = 'Copy';
    copyBtn.setAttribute('aria-label', 'Copy error message');
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(msg);
        } else {
          // Fallback for contexts without the async clipboard API.
          const ta = document.createElement('textarea');
          ta.value = msg;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        copyBtn.textContent = 'Copied';
      } catch {
        copyBtn.textContent = 'Copy failed';
      }
    });
    el.appendChild(copyBtn);
  }

  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';

  clearTimeout(_toastHideTimer);
  _toastHideTimer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(50px)';
  }, _TOAST_LIFETIME_MS[severity] ?? _TOAST_LIFETIME_MS.info);
}

const AV_COLORS = [
  '#f85149',
  '#f0883e',
  '#e3b341',
  '#3fb950',
  '#58a6ff',
  '#a371f7',
  '#d29922',
  '#1f6feb',
];

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

function avBadge(name, cls) {
  const color = AV_COLORS[(name || '').length % AV_COLORS.length];
  return (
    '<div class="av-badge ' +
    cls +
    '" style="background:' +
    color +
    ';" title="' +
    esc(name) +
    '">' +
    esc(initials(name)) +
    '</div>'
  );
}

const TRASH_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
  '<polyline points="3 6 5 6 21 6"/>' +
  '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
  '<path d="M10 11v6"/><path d="M14 11v6"/>' +
  '<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>' +
  '</svg>';

// Format a date value for display. Uses Day.js if available, falls back to
// toLocaleDateString. fmt defaults to 'MMM D, YY' (e.g. "Apr 9, 25").
function formatDate(d, fmt) {
  if (!d) return '\u2014';
  if (typeof dayjs !== 'undefined') return dayjs(d).format(fmt || 'MMM D, YY');
  return new Date(d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });
}

// Generate a unique ID with a given prefix, e.g. generateId('note') → 'note_1712345678901'
function generateId(prefix) {
  return prefix + '_' + Date.now();
}

// Return items filtered to activeGroupId, or all items when activeGroupId is null.
function filterByGroup(items, activeGroupId) {
  return activeGroupId === null ? items : items.filter((x) => x.groupId === activeGroupId);
}

// Render a group filter section into `listId` and wire up click + delete handlers.
// config: { listId, groups, items, activeGroupId, allLabel, delClass,
//           onSelect(id), onDelete(id), addBtnId, onAdd }
function renderGroupSection(config) {
  const {
    listId,
    groups,
    items,
    activeGroupId,
    allLabel,
    delClass,
    onSelect,
    onDelete,
    addBtnId,
    onAdd,
  } = config;
  const groupList = document.getElementById(listId);
  if (!groupList) return;

  let gHtml =
    '<div class="group-item' +
    (activeGroupId === null ? ' active' : '') +
    '" data-group-id="">' +
    '<span class="g-name">' +
    allLabel +
    '</span>' +
    '<span class="count">' +
    items.length +
    '</span>' +
    '</div>';
  for (const g of groups) {
    const cnt = items.filter((x) => x.groupId === g.id).length;
    gHtml +=
      '<div class="group-item' +
      (activeGroupId === g.id ? ' active' : '') +
      '" data-group-id="' +
      esc(g.id) +
      '">' +
      '<span class="g-name">' +
      esc(g.name) +
      '</span>' +
      '<button class="' +
      delClass +
      ' g-action-btn" data-del-id="' +
      esc(g.id) +
      '" title="Delete group">' +
      TRASH_SVG +
      '</button>' +
      '<span class="count">' +
      cnt +
      '</span>' +
      '</div>';
  }
  groupList.innerHTML = gHtml;

  groupList.querySelectorAll('.group-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.' + delClass)) return;
      onSelect(el.dataset.groupId || null);
    });
  });
  groupList.querySelectorAll('.' + delClass).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete(btn.dataset.delId);
    });
  });

  const addBtn = document.getElementById(addBtnId);
  if (addBtn) addBtn.onclick = onAdd;
}

// ── MODAL FOCUS TRAP ──────────────────────────────────────────────────────────
// Keep focus inside a modal while it's open, restore focus to the trigger on
// close, and close on Escape. Callers pass the overlay element (visible wrapper)
// and an onClose callback. Returns a teardown function.
const _FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(overlay, onClose) {
  if (!overlay) return () => {};
  const previouslyFocused = document.activeElement;

  function focusables() {
    return Array.from(overlay.querySelectorAll(_FOCUSABLE_SELECTOR)).filter(
      (el) => el.offsetParent !== null
    );
  }

  function onKey(e) {
    if (overlay.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = focusables();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !overlay.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onClickBackdrop(e) {
    // Click on the overlay itself (not a child) → dismiss.
    if (e.target === overlay) onClose?.();
  }

  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('mousedown', onClickBackdrop);

  return () => {
    document.removeEventListener('keydown', onKey, true);
    overlay.removeEventListener('mousedown', onClickBackdrop);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
  };
}

function startInlineCreate(listEl, placeholder, onCommit) {
  if (!listEl || listEl.querySelector('.group-item-new')) return;
  const row = document.createElement('div');
  row.className = 'group-item group-item-new';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'g-name-input';
  input.placeholder = placeholder;
  row.appendChild(input);
  listEl.appendChild(row);
  input.focus();

  let done = false;
  function commit() {
    if (done) return;
    done = true;
    const name = input.value.trim();
    row.remove();
    onCommit(name);
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      done = true;
      row.remove();
    }
  });
  input.addEventListener('blur', commit);
}
