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

// ── SYNTAX HIGHLIGHTING ───────────────────────────────────────────────────────

const CB_KEYWORDS = {
  javascript: new Set([
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'export',
    'extends',
    'finally',
    'for',
    'from',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'let',
    'new',
    'of',
    'return',
    'static',
    'super',
    'switch',
    'this',
    'throw',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield',
    'async',
    'await',
    'true',
    'false',
    'null',
    'undefined',
  ]),
  typescript: new Set([
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'finally',
    'for',
    'from',
    'function',
    'if',
    'implements',
    'import',
    'in',
    'instanceof',
    'interface',
    'let',
    'new',
    'of',
    'return',
    'static',
    'super',
    'switch',
    'this',
    'throw',
    'try',
    'type',
    'typeof',
    'var',
    'void',
    'while',
    'yield',
    'async',
    'await',
    'true',
    'false',
    'null',
    'undefined',
    'any',
    'unknown',
    'never',
    'string',
    'number',
    'boolean',
    'object',
    'symbol',
    'readonly',
    'abstract',
    'declare',
    'namespace',
    'module',
    'as',
    'satisfies',
  ]),
  python: new Set([
    'False',
    'None',
    'True',
    'and',
    'as',
    'assert',
    'async',
    'await',
    'break',
    'class',
    'continue',
    'def',
    'del',
    'elif',
    'else',
    'except',
    'finally',
    'for',
    'from',
    'global',
    'if',
    'import',
    'in',
    'is',
    'lambda',
    'nonlocal',
    'not',
    'or',
    'pass',
    'raise',
    'return',
    'try',
    'while',
    'with',
    'yield',
  ]),
  java: new Set([
    'abstract',
    'assert',
    'boolean',
    'break',
    'byte',
    'case',
    'catch',
    'char',
    'class',
    'const',
    'continue',
    'default',
    'do',
    'double',
    'else',
    'enum',
    'extends',
    'final',
    'finally',
    'float',
    'for',
    'if',
    'implements',
    'import',
    'instanceof',
    'int',
    'interface',
    'long',
    'native',
    'new',
    'package',
    'private',
    'protected',
    'public',
    'return',
    'short',
    'static',
    'super',
    'switch',
    'synchronized',
    'this',
    'throw',
    'throws',
    'transient',
    'try',
    'var',
    'void',
    'volatile',
    'while',
    'true',
    'false',
    'null',
  ]),
  go: new Set([
    'break',
    'case',
    'chan',
    'const',
    'continue',
    'default',
    'defer',
    'else',
    'fallthrough',
    'for',
    'func',
    'go',
    'goto',
    'if',
    'import',
    'interface',
    'map',
    'package',
    'range',
    'return',
    'select',
    'struct',
    'switch',
    'type',
    'var',
    'true',
    'false',
    'nil',
    'iota',
  ]),
  rust: new Set([
    'as',
    'break',
    'const',
    'continue',
    'crate',
    'else',
    'enum',
    'extern',
    'false',
    'fn',
    'for',
    'if',
    'impl',
    'in',
    'let',
    'loop',
    'match',
    'mod',
    'move',
    'mut',
    'pub',
    'ref',
    'return',
    'self',
    'Self',
    'static',
    'struct',
    'super',
    'trait',
    'true',
    'type',
    'unsafe',
    'use',
    'where',
    'while',
    'async',
    'await',
    'dyn',
  ]),
  cpp: new Set([
    'alignas',
    'alignof',
    'and',
    'and_eq',
    'asm',
    'auto',
    'bitand',
    'bitor',
    'bool',
    'break',
    'case',
    'catch',
    'char',
    'class',
    'compl',
    'const',
    'constexpr',
    'const_cast',
    'continue',
    'decltype',
    'default',
    'delete',
    'do',
    'double',
    'dynamic_cast',
    'else',
    'enum',
    'explicit',
    'export',
    'extern',
    'false',
    'float',
    'for',
    'friend',
    'goto',
    'if',
    'inline',
    'int',
    'long',
    'mutable',
    'namespace',
    'new',
    'noexcept',
    'not',
    'not_eq',
    'nullptr',
    'operator',
    'or',
    'or_eq',
    'private',
    'protected',
    'public',
    'register',
    'reinterpret_cast',
    'return',
    'short',
    'signed',
    'sizeof',
    'static',
    'static_assert',
    'static_cast',
    'struct',
    'switch',
    'template',
    'this',
    'thread_local',
    'throw',
    'true',
    'try',
    'typedef',
    'typeid',
    'typename',
    'union',
    'unsigned',
    'using',
    'virtual',
    'void',
    'volatile',
    'wchar_t',
    'while',
    'xor',
    'xor_eq',
  ]),
  csharp: new Set([
    'abstract',
    'as',
    'base',
    'bool',
    'break',
    'byte',
    'case',
    'catch',
    'char',
    'checked',
    'class',
    'const',
    'continue',
    'decimal',
    'default',
    'delegate',
    'do',
    'double',
    'else',
    'enum',
    'event',
    'explicit',
    'extern',
    'false',
    'finally',
    'fixed',
    'float',
    'for',
    'foreach',
    'goto',
    'if',
    'implicit',
    'in',
    'int',
    'interface',
    'internal',
    'is',
    'lock',
    'long',
    'namespace',
    'new',
    'null',
    'object',
    'operator',
    'out',
    'override',
    'params',
    'private',
    'protected',
    'public',
    'readonly',
    'ref',
    'return',
    'sbyte',
    'sealed',
    'short',
    'sizeof',
    'stackalloc',
    'static',
    'string',
    'struct',
    'switch',
    'this',
    'throw',
    'true',
    'try',
    'typeof',
    'uint',
    'ulong',
    'unchecked',
    'unsafe',
    'ushort',
    'using',
    'virtual',
    'void',
    'volatile',
    'while',
    'async',
    'await',
    'var',
    'dynamic',
  ]),
  sql: new Set([
    'SELECT',
    'FROM',
    'WHERE',
    'JOIN',
    'LEFT',
    'RIGHT',
    'INNER',
    'OUTER',
    'CROSS',
    'ON',
    'AS',
    'AND',
    'OR',
    'NOT',
    'IN',
    'EXISTS',
    'LIKE',
    'IS',
    'NULL',
    'INSERT',
    'INTO',
    'VALUES',
    'UPDATE',
    'SET',
    'DELETE',
    'CREATE',
    'TABLE',
    'DATABASE',
    'INDEX',
    'VIEW',
    'DROP',
    'ALTER',
    'ADD',
    'COLUMN',
    'PRIMARY',
    'KEY',
    'FOREIGN',
    'REFERENCES',
    'UNIQUE',
    'DEFAULT',
    'CONSTRAINT',
    'GROUP',
    'BY',
    'ORDER',
    'HAVING',
    'LIMIT',
    'OFFSET',
    'DISTINCT',
    'UNION',
    'ALL',
    'CASE',
    'WHEN',
    'THEN',
    'ELSE',
    'END',
    'BEGIN',
    'COMMIT',
    'ROLLBACK',
    'TRANSACTION',
    'TRUNCATE',
    'DESCRIBE',
    'EXPLAIN',
    'SHOW',
    'USE',
    'WITH',
    'RECURSIVE',
    'COUNT',
    'SUM',
    'AVG',
    'MAX',
    'MIN',
    'COALESCE',
    'NULLIF',
    'CAST',
    'CONVERT',
  ]),
  bash: new Set([
    'if',
    'then',
    'else',
    'elif',
    'fi',
    'for',
    'while',
    'do',
    'done',
    'case',
    'esac',
    'function',
    'in',
    'return',
    'exit',
    'echo',
    'export',
    'source',
    'local',
    'readonly',
    'declare',
    'true',
    'false',
    'test',
    'select',
    'until',
    'break',
    'continue',
  ]),
};

function cbEsc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cbHighlight(code, lang) {
  if (!lang || lang === 'text' || lang === 'plaintext' || lang === 'markdown' || lang === 'yaml') {
    return cbEsc(code);
  }
  if (lang === 'html') return cbHighlightHtml(code);
  if (lang === 'json') return cbHighlightJson(code);

  const kwSet = CB_KEYWORDS[lang];
  const isSQL = lang === 'sql';
  const lineCommentChar = [
    'javascript',
    'typescript',
    'java',
    'go',
    'rust',
    'cpp',
    'csharp',
  ].includes(lang)
    ? '//'
    : ['python', 'bash'].includes(lang)
      ? '#'
      : lang === 'sql'
        ? '--'
        : null;
  const hasBlockComment = [
    'javascript',
    'typescript',
    'java',
    'go',
    'rust',
    'cpp',
    'csharp',
    'css',
  ].includes(lang);

  let result = '';
  let i = 0;
  const s = code;
  const len = s.length;

  while (i < len) {
    // Block comment /* ... */
    if (hasBlockComment && s[i] === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      const stop = end === -1 ? len : end + 2;
      result += '<span class="hl-comment">' + cbEsc(s.slice(i, stop)) + '</span>';
      i = stop;
      continue;
    }
    // Line comment
    if (lineCommentChar && s.startsWith(lineCommentChar, i)) {
      const nl = s.indexOf('\n', i);
      const stop = nl === -1 ? len : nl;
      result += '<span class="hl-comment">' + cbEsc(s.slice(i, stop)) + '</span>';
      i = stop;
      continue;
    }
    // String literals
    if ((s[i] === '"' || s[i] === "'" || s[i] === '`') && lang !== 'sql') {
      const q = s[i];
      let j = i + 1;
      while (j < len) {
        if (s[j] === '\\') {
          j += 2;
          continue;
        }
        if (s[j] === q) {
          j++;
          break;
        }
        if (q !== '`' && s[j] === '\n') break;
        j++;
      }
      result += '<span class="hl-string">' + cbEsc(s.slice(i, j)) + '</span>';
      i = j;
      continue;
    }
    // SQL strings
    if (isSQL && (s[i] === "'" || s[i] === '"')) {
      const q = s[i];
      let j = i + 1;
      while (j < len && s[j] !== q) j++;
      if (j < len) j++;
      result += '<span class="hl-string">' + cbEsc(s.slice(i, j)) + '</span>';
      i = j;
      continue;
    }
    // Numbers
    if (/[0-9]/.test(s[i]) && (i === 0 || /[\s,;()\[\]{}+\-*/%=<>!&|^~\n]/.test(s[i - 1]))) {
      let j = i;
      while (j < len && /[0-9._xXa-fA-FbBoOeE]/.test(s[j])) j++;
      result += '<span class="hl-number">' + cbEsc(s.slice(i, j)) + '</span>';
      i = j;
      continue;
    }
    // Words (keywords or identifiers)
    if (/[a-zA-Z_$]/.test(s[i])) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_$]/.test(s[j])) j++;
      const word = s.slice(i, j);
      const lookup = isSQL ? word.toUpperCase() : word;
      if (kwSet && kwSet.has(lookup)) {
        result += '<span class="hl-keyword">' + cbEsc(word) + '</span>';
      } else {
        result += cbEsc(word);
      }
      i = j;
      continue;
    }
    result += cbEsc(s[i]);
    i++;
  }
  return result;
}

function cbHighlightJson(code) {
  return cbEsc(code)
    .replace(/(&quot;[^&]*?&quot;)\s*:/g, '<span class="hl-json-key">$1</span>:')
    .replace(/:\s*(&quot;[^&]*?&quot;)/g, ': <span class="hl-string">$1</span>')
    .replace(/:\s*(true|false|null)/g, ': <span class="hl-keyword">$1</span>')
    .replace(/:\s*(-?[0-9]+\.?[0-9]*)/g, ': <span class="hl-number">$1</span>');
}

function cbHighlightHtml(code) {
  return cbEsc(code)
    .replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="hl-keyword">$2</span>')
    .replace(/([\w-]+)=(&quot;[^&]*?&quot;)/g, '<span class="hl-json-key">$1</span>=$2')
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="hl-comment">$1</span>');
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
  // Groups pane
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

  // Snippet list
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
      // Update active class without full re-render
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
    '<div class="cb-code-wrap">' +
    '<pre class="cb-code-highlight" aria-hidden="true"><code id="cb-code-hl"></code></pre>' +
    '<textarea id="cb-code-textarea" class="cb-code-textarea" spellcheck="false"' +
    ' autocomplete="off" autocorrect="off" autocapitalize="off"></textarea>' +
    '</div>';

  const titleInput = document.getElementById('cb-title-input');
  const langSelect = document.getElementById('cb-lang-select');
  const textarea = document.getElementById('cb-code-textarea');
  const hlCode = document.getElementById('cb-code-hl');
  const copyBtn = document.getElementById('cb-copy-btn');
  const formatBtn = document.getElementById('cb-format-btn');

  // Set textarea value (avoids HTML-encoding issues with innerHTML)
  textarea.value = block.code;
  updateHighlight(textarea, hlCode, block.language);

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
    updateHighlight(textarea, hlCode, block.language);
    // Update language label in sidebar
    const el = document.querySelector('.cb-item[data-id="' + block.id + '"] .cb-item-lang');
    const langLabel = CB_LANGUAGES.find((l) => l.value === block.language)?.label || block.language;
    if (el) el.textContent = langLabel;
  });

  textarea.addEventListener('input', () => {
    block.code = textarea.value;
    block.updated = Date.now();
    saveState();
    updateHighlight(textarea, hlCode, block.language);
    syncScroll(textarea, hlCode.parentElement);
  });

  textarea.addEventListener('scroll', () => syncScroll(textarea, hlCode.parentElement));

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.slice(0, start) + '  ' + textarea.value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      textarea.dispatchEvent(new Event('input'));
    }
  });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(block.code || '').then(() => toast('Code copied!'));
  });

  formatBtn.addEventListener('click', () => {
    const formatted = cbFormat(block.code, block.language);
    if (formatted !== null) {
      textarea.value = formatted;
      block.code = formatted;
      block.updated = Date.now();
      saveState();
      updateHighlight(textarea, hlCode, block.language);
    }
  });
}

function updateHighlight(textarea, hlCode, lang) {
  hlCode.innerHTML = cbHighlight(textarea.value, lang) + '\n';
}

function syncScroll(textarea, pre) {
  pre.scrollTop = textarea.scrollTop;
  pre.scrollLeft = textarea.scrollLeft;
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
  // Generic: strip trailing whitespace per line and collapse 3+ blank lines to 2
  return code
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}
