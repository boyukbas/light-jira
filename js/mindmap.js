'use strict';

// ── MIND MAP ──────────────────────────────────────────────────────────────────
const MM_DEFAULT_CODE = `sequenceDiagram
    participant User
    participant System
    User->>System: Request
    System-->>User: Response
    User-)System: Follow-up`;

// One worked example per Mermaid diagram type — shown via the dice button
const MM_EXAMPLES = [
  {
    name: 'Flowchart',
    code: `flowchart TD
    A([Start]) --> B{Ticket ready?}
    B -- Yes --> C[Assign developer]
    B -- No --> D[Add to backlog]
    C --> E[In Progress]
    E --> F{Review passed?}
    F -- Yes --> G([Done ✓])
    F -- No --> E`,
  },
  {
    name: 'Sequence Diagram',
    code: `sequenceDiagram
    actor User
    participant API
    participant DB
    User->>API: POST /login
    API->>DB: SELECT user WHERE email=?
    DB-->>API: user record
    API-->>User: 200 OK + JWT
    User->>API: GET /tickets
    API-->>User: ticket list`,
  },
  {
    name: 'Class Diagram',
    code: `classDiagram
    class Issue {
        +String key
        +String summary
        +String status
        +assign(user)
        +transition(status)
    }
    class Sprint {
        +String name
        +Date startDate
        +Date endDate
        +addIssue(issue)
    }
    class User {
        +String accountId
        +String displayName
    }
    Sprint "1" o-- "*" Issue : contains
    Issue "*" --> "1" User : assigned to`,
  },
  {
    name: 'State Diagram',
    code: `stateDiagram-v2
    [*] --> Backlog
    Backlog --> InProgress : Start work
    InProgress --> Review : Open PR
    Review --> InProgress : Changes requested
    Review --> Done : Approved
    InProgress --> Blocked : Dependency
    Blocked --> InProgress : Unblocked
    Done --> [*]`,
  },
  {
    name: 'ER Diagram',
    code: `erDiagram
    PROJECT ||--o{ ISSUE : contains
    ISSUE {
        string key PK
        string summary
        string status
        string priority
    }
    ISSUE }o--|| USER : "assigned to"
    ISSUE }o--o{ LABEL : "tagged with"
    USER {
        string accountId PK
        string displayName
    }`,
  },
  {
    name: 'Gantt Chart',
    code: `gantt
    title Sprint 42
    dateFormat YYYY-MM-DD
    section Backend
        Auth refactor    :a1, 2025-01-06, 3d
        Rate limiting    :a2, after a1, 2d
        DB migration     :crit, 2025-01-09, 1d
    section Frontend
        Login redesign   :b1, 2025-01-06, 2d
        Dashboard        :b2, after b1, 4d
    section QA
        Integration tests :after b2, 3d`,
  },
  {
    name: 'Pie Chart',
    code: `pie title Bug Distribution by Priority
    "Critical" : 8
    "High" : 23
    "Medium" : 41
    "Low" : 28`,
  },
  {
    name: 'Git Graph',
    code: `gitGraph
    commit id: "init"
    branch feature/auth
    checkout feature/auth
    commit id: "add JWT"
    commit id: "add refresh"
    checkout main
    branch hotfix/login
    commit id: "fix null check"
    checkout main
    merge hotfix/login
    merge feature/auth
    commit id: "v2.1 release"`,
  },
  {
    name: 'Mind Map',
    code: `mindmap
    root((Project Health))
        Velocity
            This sprint: 38pts
            Target: 40pts
        Risks
            Dependency on Auth team
            2 engineers on leave
        Wins
            Zero P1 bugs
            Deploy pipeline fixed`,
  },
  {
    name: 'Timeline',
    code: `timeline
    title Product Roadmap 2025
    section Q1
        January  : Auth v2 launch
                 : Mobile beta
        March    : Public API release
    section Q2
        April    : Enterprise tier
        June     : v3.0 launch`,
  },
  {
    name: 'User Journey',
    code: `journey
    title Filing a Bug Report
    section Discover
        Find the issue : 3 : User
        Search existing tickets : 4 : User
    section Report
        Click Create issue : 5 : User
        Fill summary and steps : 4 : User
        Attach screenshot : 3 : User, System
        Submit : 5 : User
    section Follow-up
        Receive confirmation : 4 : System
        Check ticket status : 3 : User`,
  },
  {
    name: 'Quadrant Chart',
    code: `quadrantChart
    title Feature Prioritisation
    x-axis Low Effort --> High Effort
    y-axis Low Impact --> High Impact
    quadrant-1 Plan later
    quadrant-2 Do first
    quadrant-3 Deprioritise
    quadrant-4 Quick wins
    Dark mode: [0.3, 0.6]
    Export CSV: [0.45, 0.85]
    SSO login: [0.7, 0.9]
    Changelog: [0.2, 0.3]
    Shortcuts: [0.35, 0.7]`,
  },
  {
    name: 'XY Chart',
    code: `xychart-beta
    title "Monthly Active Users"
    x-axis [Jan, Feb, Mar, Apr, May, Jun]
    y-axis "Users (k)" 0 --> 50
    bar [12, 18, 22, 28, 35, 42]
    line [12, 18, 22, 28, 35, 42]`,
  },
];

let mmRenderTimer = null;
let mmRenderSeq = 0;
let mmZoom = 1;
let mmPanX = 24;
let mmPanY = 24;

function applyMmTransform() {
  const el = document.getElementById('mm-preview');
  if (!el) return;
  el.style.transform = `translate(${mmPanX}px, ${mmPanY}px) scale(${mmZoom})`;
}

function resetMmView() {
  mmZoom = 1;
  mmPanX = 24;
  mmPanY = 24;
  applyMmTransform();
}

function initMmPanZoom() {
  const pane = document.querySelector('.mm-preview-pane');
  if (!pane) return;

  // Wheel → zoom toward cursor
  pane.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = pane.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.min(Math.max(mmZoom * factor, 0.1), 10);
      mmPanX = mouseX - (mouseX - mmPanX) * (newZoom / mmZoom);
      mmPanY = mouseY - (mouseY - mmPanY) * (newZoom / mmZoom);
      mmZoom = newZoom;
      applyMmTransform();
    },
    { passive: false }
  );

  // Drag → pan
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panStartX = 0;
  let panStartY = 0;

  pane.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = mmPanX;
    panStartY = mmPanY;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    mmPanX = panStartX + (e.clientX - dragStartX);
    mmPanY = panStartY + (e.clientY - dragStartY);
    applyMmTransform();
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
  });

  // Zoom buttons
  document.getElementById('mm-zoom-in-btn')?.addEventListener('click', () => {
    mmZoom = Math.min(mmZoom * 1.25, 10);
    applyMmTransform();
  });
  document.getElementById('mm-zoom-out-btn')?.addEventListener('click', () => {
    mmZoom = Math.max(mmZoom / 1.25, 0.1);
    applyMmTransform();
  });
  document.getElementById('mm-zoom-reset-btn')?.addEventListener('click', resetMmView);
}

function initMindMap() {
  if (typeof mermaid === 'undefined') return;
  mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
  initMmPanZoom();

  // Auto-seed a default diagram on first load
  if (!state.mindMaps.length) {
    state.mindMaps = [{ id: 'mm_default', name: 'Diagram 1', code: MM_DEFAULT_CODE }];
    state.activeMindMapId = state.mindMaps[0].id;
    saveState();
  }
}

function getActiveDiagram() {
  return state.mindMaps.find((m) => m.id === state.activeMindMapId) || state.mindMaps[0] || null;
}

function createDiagram() {
  const d = {
    id: 'mm_' + Date.now(),
    name: 'Diagram ' + (state.mindMaps.length + 1),
    code: MM_DEFAULT_CODE,
    groupId: state.activeMmGroupId,
  };
  state.mindMaps.push(d);
  state.activeMindMapId = d.id;
  saveState();
  updateViewMode();
}

function createMmGroup() {
  startInlineCreate(document.getElementById('mm-group-list'), 'Group name\u2026', (name) => {
    if (name) {
      if (!state.mmGroups) state.mmGroups = [];
      const g = { id: 'mmg_' + Date.now(), name };
      state.mmGroups.push(g);
      state.activeMmGroupId = g.id;
      saveState();
    }
    renderMindMapSidebar();
  });
}

function deleteMmGroup(id) {
  // Move diagrams in this group to "All" (groupId = null)
  for (const m of state.mindMaps) {
    if (m.groupId === id) m.groupId = null;
  }
  state.mmGroups = (state.mmGroups || []).filter((g) => g.id !== id);
  if (state.activeMmGroupId === id) state.activeMmGroupId = null;
  saveState();
  updateViewMode();
}

function loadRandomExample() {
  const diagram = getActiveDiagram();
  if (!diagram) return;
  const example = MM_EXAMPLES[Math.floor(Math.random() * MM_EXAMPLES.length)];
  diagram.code = example.code;
  diagram.name = example.name;
  saveState();
  // Mirror name into sidebar title immediately
  const sidebarTitle = document.querySelector(
    '.mm-diagram-item[data-id="' + diagram.id + '"] .mm-diagram-title'
  );
  if (sidebarTitle) sidebarTitle.textContent = example.name;
  renderMindMap();
}

function deleteDiagram(id) {
  if (!confirm('Delete this diagram?')) return;
  state.mindMaps = state.mindMaps.filter((m) => m.id !== id);
  if (state.activeMindMapId === id) {
    state.activeMindMapId = state.mindMaps.length ? state.mindMaps[0].id : null;
  }
  saveState();
  updateViewMode();
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
function renderMindMapSidebar() {
  // ── Groups section ────────────────────────────────────────────────────────
  const groupList = document.getElementById('mm-group-list');
  if (groupList) {
    const groups = state.mmGroups || [];
    const allCount = state.mindMaps.length;
    let gHtml =
      '<div class="group-item' +
      (state.activeMmGroupId === null ? ' active' : '') +
      '" data-group-id="">' +
      '<span class="g-name">All Diagrams</span>' +
      '<span class="count">' +
      allCount +
      '</span>' +
      '</div>';
    for (const g of groups) {
      const cnt = state.mindMaps.filter((m) => m.groupId === g.id).length;
      gHtml +=
        '<div class="group-item' +
        (state.activeMmGroupId === g.id ? ' active' : '') +
        '" data-group-id="' +
        esc(g.id) +
        '">' +
        '<span class="g-name">' +
        esc(g.name) +
        '</span>' +
        '<button class="mm-group-del g-action-btn" data-del-id="' +
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
        if (e.target.closest('.mm-group-del')) return;
        state.activeMmGroupId = el.dataset.groupId || null;
        saveState();
        renderMindMapSidebar();
      });
    });
    groupList.querySelectorAll('.mm-group-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteMmGroup(btn.dataset.delId);
      });
    });
  }
  const addGroupBtn = document.getElementById('add-mm-group-btn');
  if (addGroupBtn) addGroupBtn.onclick = createMmGroup;

  // ── Diagrams list (filtered by active group) ──────────────────────────────
  const list = document.getElementById('mm-diagram-list');
  if (!list) return;

  const diagrams =
    state.activeMmGroupId === null
      ? state.mindMaps
      : state.mindMaps.filter((m) => m.groupId === state.activeMmGroupId);

  let html = '';
  for (const d of diagrams) {
    const active = d.id === state.activeMindMapId ? ' active' : '';
    html +=
      '<div class="mm-diagram-item' +
      active +
      '" data-id="' +
      esc(d.id) +
      '">' +
      '<span class="mm-diagram-title">' +
      esc(d.name) +
      '</span>' +
      '<button class="mm-diagram-del" data-del-id="' +
      esc(d.id) +
      '" title="Delete diagram">' +
      TRASH_SVG +
      '</button>' +
      '</div>';
  }
  if (!diagrams.length) {
    html = '<div class="nc-empty-hint">No diagrams yet.<br>Click \u002B to create one.</div>';
  }
  list.innerHTML = html;

  list.querySelectorAll('.mm-diagram-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.mm-diagram-del')) return;
      state.activeMindMapId = el.dataset.id;
      saveState();
      list.querySelectorAll('.mm-diagram-item').forEach((i) => {
        i.classList.toggle('active', i.dataset.id === state.activeMindMapId);
      });
      resetMmView();
      renderMindMap();
    });
  });

  list.querySelectorAll('.mm-diagram-del').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDiagram(btn.dataset.delId);
    });
  });

  const addBtn = document.getElementById('mm-add-btn');
  if (addBtn) addBtn.onclick = createDiagram;
}

// ── EDITOR + PREVIEW ──────────────────────────────────────────────────────────
async function renderMindMap() {
  if (typeof mermaid === 'undefined') return;

  const diagram = getActiveDiagram();

  const ta = document.getElementById('mm-code');
  const previewEl = document.getElementById('mm-preview');

  if (!diagram) {
    if (ta) ta.value = '';
    if (previewEl)
      previewEl.innerHTML =
        '<div class="nc-empty-hint" style="padding:24px;">No diagram selected.</div>';
    return;
  }

  const nameInput = document.getElementById('mm-diagram-name');
  if (nameInput) {
    nameInput.value = diagram.name || '';
    nameInput.oninput = () => {
      diagram.name = nameInput.value;
      saveState();
      // Mirror into sidebar title live (same pattern as Notes nc-title-input)
      const sidebarTitle = document.querySelector(
        '.mm-diagram-item[data-id="' + diagram.id + '"] .mm-diagram-title'
      );
      if (sidebarTitle) sidebarTitle.textContent = diagram.name || 'Untitled';
    };
  }

  if (ta) {
    ta.value = diagram.code || '';
    ta.oninput = () => {
      diagram.code = ta.value;
      saveState();
      clearTimeout(mmRenderTimer);
      mmRenderTimer = setTimeout(doRender, 450);
    };
  }

  const copyBtn = document.getElementById('mm-copy-btn');
  if (copyBtn) {
    copyBtn.onclick = () =>
      navigator.clipboard.writeText(diagram.code || '').then(() => toast('Code copied!'));
  }

  const refreshBtn = document.getElementById('mm-refresh-btn');
  if (refreshBtn) {
    refreshBtn.onclick = () => doRender();
  }

  const diceBtn = document.getElementById('mm-dice-btn');
  if (diceBtn) {
    diceBtn.onclick = loadRandomExample;
  }

  doRender();

  async function doRender() {
    if (!previewEl) return;
    const code = (diagram.code || '').trim();
    if (!code) {
      previewEl.innerHTML = '';
      return;
    }
    try {
      const id = 'mm-svg-' + ++mmRenderSeq;
      const { svg } = await mermaid.render(id, code);
      previewEl.innerHTML = svg;
      applyMmTransform();
    } catch (err) {
      const errDiv = document.createElement('div');
      errDiv.className = 'mm-error';
      errDiv.textContent = err.message || 'Invalid diagram syntax';
      previewEl.innerHTML = '';
      previewEl.appendChild(errDiv);
      setTimeout(() => {
        if (errDiv.isConnected) previewEl.innerHTML = '';
      }, 4000);
    }
  }
}
