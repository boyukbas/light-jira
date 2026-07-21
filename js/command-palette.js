'use strict';

// ── COMMAND PALETTE (Ctrl/Cmd+K) ──────────────────────────────────────────────
// A single fuzzy launcher over navigation + quick actions. Reuses the Fuse.js
// already loaded for the popup quick-open. Commands are rebuilt on every open so
// the group list and recent tickets are always current.

let _cpCommands = [];
let _cpMatches = [];
let _cpActive = 0;
let _cpTrap = null;

function _cpBuildCommands() {
  const cmds = [];

  // Tabs
  const tabs = [
    ['jira', 'Jira'],
    ['labels', 'Labels'],
    ['timeline', 'Timeline'],
    ['history', 'History'],
    ['snippets', 'Snippets'],
    ['notes', 'Notes'],
    ['mindmap', 'Mindmap'],
  ];
  for (const [id, label] of tabs) {
    const hidden = state.tabVisibility && state.tabVisibility[id] === false;
    cmds.push({
      title: 'Go to ' + label + ' tab',
      hint: hidden ? 'Tab · hidden' : 'Tab',
      run: () => switchTab(id), // switchTab reveals a hidden tab
    });
  }

  // Lists (non-history groups)
  for (const g of state.groups) {
    if (g.id === 'history') continue;
    cmds.push({
      title: 'List: ' + g.name,
      hint: 'List',
      run: () => {
        state.activeGroupId = g.id;
        switchTab('jira');
      },
    });
  }

  // Recent tickets (from the History group), most-recent first
  const hist = state.groups.find((g) => g.id === 'history');
  if (hist) {
    for (const e of hist.keys.slice(0, 15)) {
      const k = entryKey(e);
      const sum = issueCache[k]?.fields?.summary || '';
      cmds.push({
        title: 'Open ' + k + (sum ? ' — ' + sum : ''),
        hint: 'Ticket',
        run: () => openFromHistory(k),
      });
    }
  }

  // Quick actions
  if (state.activeKey) {
    cmds.push({
      title: 'Assign ' + state.activeKey + ' to me',
      hint: 'Action',
      run: () => assignToMe(state.activeKey),
    });
  }
  cmds.push({
    title: 'Search / run JQL…',
    hint: 'Action',
    run: () => {
      const si = document.getElementById('search-input');
      if (si) {
        si.focus();
        si.select();
      }
    },
  });
  cmds.push({
    title: 'Toggle auto-refresh',
    hint: 'Action',
    run: () => document.getElementById('auto-refresh-btn')?.click(),
  });
  cmds.push({
    title: 'Open settings',
    hint: 'Action',
    run: () => document.getElementById('settings-btn')?.click(),
  });
  cmds.push({
    title: 'Keyboard shortcuts',
    hint: 'Action',
    run: () => {
      if (typeof window.toggleShortcutsOverlay === 'function') window.toggleShortcutsOverlay();
    },
  });

  return cmds;
}

function _cpRender() {
  const list = document.getElementById('command-palette-results');
  if (!list) return;
  list.innerHTML = '';
  if (!_cpMatches.length) {
    const empty = document.createElement('div');
    empty.className = 'cp-empty';
    empty.textContent = 'No matching commands';
    list.appendChild(empty);
    return;
  }
  _cpMatches.forEach((cmd, i) => {
    const row = document.createElement('div');
    row.className = 'cp-option' + (i === _cpActive ? ' active' : '');
    row.setAttribute('role', 'option');
    const title = document.createElement('span');
    title.className = 'cp-option-title';
    title.textContent = cmd.title;
    row.appendChild(title);
    if (cmd.hint) {
      const hint = document.createElement('span');
      hint.className = 'cp-option-hint';
      hint.textContent = cmd.hint;
      row.appendChild(hint);
    }
    row.addEventListener('click', () => _cpRun(i));
    list.appendChild(row);
  });
}

function _cpFilter(q) {
  const query = (q || '').trim();
  if (!query) {
    _cpMatches = _cpCommands.slice(0, 50);
  } else if (typeof Fuse !== 'undefined') {
    const fuse = new Fuse(_cpCommands, {
      keys: ['title', 'hint'],
      threshold: 0.4,
      ignoreLocation: true,
    });
    _cpMatches = fuse
      .search(query)
      .map((r) => r.item)
      .slice(0, 50);
  } else {
    const lc = query.toLowerCase();
    _cpMatches = _cpCommands.filter((c) => c.title.toLowerCase().includes(lc)).slice(0, 50);
  }
  _cpActive = 0;
  _cpRender();
}

function _cpRun(i) {
  const cmd = _cpMatches[i];
  closeCommandPalette();
  if (cmd && typeof cmd.run === 'function') cmd.run();
}

function openCommandPalette() {
  const overlay = document.getElementById('command-palette-overlay');
  const input = document.getElementById('command-palette-input');
  if (!overlay || !input) return;
  _cpCommands = _cpBuildCommands();
  overlay.classList.remove('hidden');
  input.value = '';
  _cpFilter('');
  input.focus();
  if (_cpTrap) _cpTrap();
  _cpTrap = trapFocus(overlay, closeCommandPalette);
}

function closeCommandPalette() {
  const overlay = document.getElementById('command-palette-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  if (_cpTrap) {
    _cpTrap();
    _cpTrap = null;
  }
}

// Wire the input's own key handling once. Scripts load at the end of <body>, so
// the elements already exist. Escape/Tab are handled by trapFocus.
(function _cpInit() {
  const input = document.getElementById('command-palette-input');
  if (!input) return;
  input.addEventListener('input', () => _cpFilter(input.value));
  input.addEventListener('keydown', (e) => {
    if (!_cpMatches.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _cpActive = (_cpActive + 1) % _cpMatches.length;
      _cpRender();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _cpActive = (_cpActive - 1 + _cpMatches.length) % _cpMatches.length;
      _cpRender();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      _cpRun(_cpActive);
    }
  });
})();

if (typeof window !== 'undefined') {
  // @ts-ignore — app-level API for init.js and the dev console.
  window.openCommandPalette = openCommandPalette;
  // @ts-ignore
  window.closeCommandPalette = closeCommandPalette;
}
