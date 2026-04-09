'use strict';

// ── SNIPPETS — CODE BLOCKS TAB ────────────────────────────────────────────────

const CB_LANGUAGES = [
  { value: 'text', label: 'Plain Text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'cpp', label: 'C / C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
];

// hljs language alias map (highlight.js uses different names for some languages)
const CB_HLJS_ALIAS = {
  cpp: 'cpp',
  csharp: 'csharp',
  bash: 'bash',
  text: null,
};

function cbRender(code, lang) {
  if (!code) return '';
  if (lang === 'text' || !lang) return cbEsc(code);
  if (typeof hljs !== 'undefined') {
    try {
      const alias = CB_HLJS_ALIAS[lang] ?? lang;
      const result = hljs.highlight(code, { language: alias, ignoreIllegals: true });
      return result.value;
    } catch {
      return cbEsc(code);
    }
  }
  return cbEsc(code);
}

function cbEsc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cbFormat(code, lang) {
  if (lang === 'json') {
    try {
      return JSON.stringify(JSON.parse(code), null, 2);
    } catch {
      toast('Invalid JSON — cannot format', 'error');
      return null;
    }
  }
  return code
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

function getActiveCodeBlock() {
  return state.codeBlocks.find((b) => b.id === state.activeCodeBlockId) || null;
}

function createCodeBlock() {
  const block = {
    id: 'cb_' + Date.now(),
    title: '',
    code: '',
    language: state.lastCbLanguage || 'javascript',
    groupId: state.activeCbGroupId,
    created: Date.now(),
    updated: Date.now(),
  };
  state.codeBlocks.unshift(block);
  state.activeCodeBlockId = block.id;
  saveState();
  updateViewMode();
}

function deleteCodeBlock(id) {
  if (!confirm('Delete this snippet?')) return;
  state.codeBlocks = state.codeBlocks.filter((b) => b.id !== id);
  if (state.activeCodeBlockId === id) {
    state.activeCodeBlockId = state.codeBlocks.length ? state.codeBlocks[0].id : null;
  }
  saveState();
  updateViewMode();
}

function createCbGroup() {
  startInlineCreate(document.getElementById('cb-group-list'), 'Group name\u2026', (name) => {
    if (name) {
      if (!state.cbGroups) state.cbGroups = [];
      const g = { id: 'cbg_' + Date.now(), name };
      state.cbGroups.push(g);
      state.activeCbGroupId = g.id;
      saveState();
    }
    renderCbSidebar();
  });
}

function deleteCbGroup(id) {
  for (const b of state.codeBlocks) {
    if (b.groupId === id) b.groupId = null;
  }
  state.cbGroups = (state.cbGroups || []).filter((g) => g.id !== id);
  if (state.activeCbGroupId === id) state.activeCbGroupId = null;
  saveState();
  updateViewMode();
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────

function renderCbSidebar() {
  const groupList = document.getElementById('cb-group-list');
  if (groupList) {
    const groups = state.cbGroups || [];
    const allCount = state.codeBlocks.length;
    let gHtml =
      '<div class="group-item' +
      (state.activeCbGroupId === null ? ' active' : '') +
      '" data-group-id="">' +
      '<span class="g-name">All Snippets</span>' +
      '<span class="count">' +
      allCount +
      '</span>' +
      '</div>';
    for (const g of groups) {
      const cnt = state.codeBlocks.filter((b) => b.groupId === g.id).length;
      gHtml +=
        '<div class="group-item' +
        (state.activeCbGroupId === g.id ? ' active' : '') +
        '" data-group-id="' +
        esc(g.id) +
        '">' +
        '<span class="g-name">' +
        esc(g.name) +
        '</span>' +
        '<button class="cb-group-del g-action-btn" data-del-id="' +
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
        if (e.target.closest('.cb-group-del')) return;
        state.activeCbGroupId = el.dataset.groupId || null;
        saveState();
        renderCbSidebar();
        renderCbMain();
      });
    });
    groupList.querySelectorAll('.cb-group-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCbGroup(btn.dataset.delId);
      });
    });
  }
  const addGroupBtn = document.getElementById('add-cb-group-btn');
  if (addGroupBtn) addGroupBtn.onclick = createCbGroup;

  const list = document.getElementById('cb-snippet-list');
  if (!list) return;

  const blocks =
    state.activeCbGroupId === null
      ? state.codeBlocks
      : state.codeBlocks.filter((b) => b.groupId === state.activeCbGroupId);

  let html = '';
  for (const block of blocks) {
    const active = state.activeCodeBlockId === block.id ? ' active' : '';
    const langLabel = CB_LANGUAGES.find((l) => l.value === block.language)?.label || block.language;
    html +=
      '<div class="cb-item' +
      active +
      '" data-id="' +
      esc(block.id) +
      '">' +
      '<div class="cb-item-title">' +
      esc(block.title || 'Untitled') +
      '</div>' +
      '<div class="cb-item-lang">' +
      esc(langLabel) +
      '</div>' +
      '<button class="cb-item-del" data-del-id="' +
      esc(block.id) +
      '" title="Delete snippet">' +
      TRASH_SVG +
      '</button>' +
      '</div>';
  }
  if (!blocks.length) {
    html = '<div class="nc-empty-hint">No snippets yet.<br>Click \u002B to create one.</div>';
  }
  list.innerHTML = html;

  list.querySelectorAll('.cb-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.cb-item-del')) return;
      state.activeCodeBlockId = el.dataset.id;
      saveState();
      renderCbMain();
      list.querySelectorAll('.cb-item').forEach((x) => x.classList.remove('active'));
      el.classList.add('active');
    });
  });
  list.querySelectorAll('.cb-item-del').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCodeBlock(btn.dataset.delId);
    });
  });

  const addBtn = document.getElementById('add-cb-btn');
  if (addBtn) addBtn.onclick = createCodeBlock;
}

// ── MAIN EDITOR ───────────────────────────────────────────────────────────────

function renderCbMain() {
  const main = document.getElementById('cb-main');
  if (!main) return;

  const block = getActiveCodeBlock();
  if (!block) {
    main.innerHTML =
      '<div class="notes-empty-state">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="color:var(--text-tertiary)">' +
      '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>' +
      '</svg>' +
      '<h3>No snippet selected</h3>' +
      '<p>Select a snippet or click \u002B to create one.</p></div>';
    return;
  }

  const langOptions = CB_LANGUAGES.map(
    (l) =>
      '<option value="' +
      esc(l.value) +
      '"' +
      (l.value === block.language ? ' selected' : '') +
      '>' +
      esc(l.label) +
      '</option>'
  ).join('');

  main.innerHTML =
    '<div class="cb-editor-header">' +
    '<input type="text" id="cb-title-input" class="cb-title-input" placeholder="Snippet title\u2026" value="' +
    esc(block.title) +
    '" autocomplete="off">' +
    '<select id="cb-lang-select" class="cb-lang-select" title="Language">' +
    langOptions +
    '</select>' +
    '<button class="top-btn icon-only" id="cb-format-btn" title="Format code" aria-label="Format code">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
    '<line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/>' +
    '<line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/>' +
    '</svg></button>' +
    '<button class="top-btn icon-only" id="cb-copy-btn" title="Copy code" aria-label="Copy code">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
    '</svg></button>' +
    '</div>' +
    '<div id="cb-code-area" class="cb-code-area">' +
    '<pre id="cb-view" class="cb-view"><code id="cb-view-code"></code></pre>' +
    '<textarea id="cb-code-textarea" class="cb-code-textarea" style="display:none" spellcheck="false"' +
    ' autocomplete="off" autocorrect="off" autocapitalize="off"></textarea>' +
    '</div>';

  const titleInput = document.getElementById('cb-title-input');
  const langSelect = document.getElementById('cb-lang-select');
  const viewEl = document.getElementById('cb-view');
  const viewCode = document.getElementById('cb-view-code');
  const textarea = document.getElementById('cb-code-textarea');
  const copyBtn = document.getElementById('cb-copy-btn');
  const formatBtn = document.getElementById('cb-format-btn');

  // Populate view with highlighted code
  cbSetView(viewCode, block.code, block.language);

  // Click on view → enter edit mode
  viewEl.addEventListener('click', () => cbEnterEdit(viewEl, textarea, block));

  titleInput.addEventListener('input', () => {
    block.title = titleInput.value;
    block.updated = Date.now();
    saveState();
    const el = document.querySelector('.cb-item[data-id="' + block.id + '"] .cb-item-title');
    if (el) el.textContent = block.title || 'Untitled';
  });

  langSelect.addEventListener('change', () => {
    block.language = langSelect.value;
    state.lastCbLanguage = block.language;
    block.updated = Date.now();
    saveState();
    // Re-highlight in view mode
    cbSetView(viewCode, block.code, block.language);
    // Update language label in sidebar
    const el = document.querySelector('.cb-item[data-id="' + block.id + '"] .cb-item-lang');
    const langLabel = CB_LANGUAGES.find((l) => l.value === block.language)?.label || block.language;
    if (el) el.textContent = langLabel;
  });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(block.code || '').then(() => toast('Code copied!'));
  });

  formatBtn.addEventListener('click', () => {
    const formatted = cbFormat(block.code, block.language);
    if (formatted !== null) {
      block.code = formatted;
      block.updated = Date.now();
      saveState();
      textarea.value = formatted;
      cbSetView(viewCode, formatted, block.language);
    }
  });
}

function cbSetView(codeEl, code, lang) {
  codeEl.innerHTML = cbRender(code || '', lang);
}

function cbEnterEdit(viewEl, textarea, block) {
  viewEl.style.display = 'none';
  textarea.style.display = '';
  textarea.value = block.code;
  textarea.focus();

  const exitEdit = () => {
    block.code = textarea.value;
    block.updated = Date.now();
    saveState();
    const viewCode = document.getElementById('cb-view-code');
    if (viewCode) cbSetView(viewCode, block.code, block.language);
    textarea.style.display = 'none';
    viewEl.style.display = '';
  };

  textarea.addEventListener(
    'blur',
    () => {
      // Small delay so clicking header buttons doesn't trigger a premature exit
      setTimeout(() => {
        if (document.activeElement !== textarea) exitEdit();
      }, 120);
    },
    { once: true }
  );

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      textarea.blur();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.slice(0, s) + '  ' + textarea.value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = s + 2;
    }
  });
}
