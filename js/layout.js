'use strict';

function updateViewMode() {
  document.body.setAttribute('data-app-mode', state.appMode);

  // Update tab bar
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  const activeTab = document.getElementById('tab-' + state.appMode);
  if (activeTab) activeTab.classList.add('active');

  // Apply layout from state
  const sb = document.getElementById('sidebar');
  const mid = document.getElementById('middle');
  const nts = document.getElementById('notes-pane');

  if (sb) {
    sb.style.width = state.layout.sidebarWidth + 'px';
    sb.classList.toggle('collapsed', state.layout.sidebarCollapsed);
  }
  if (mid) {
    mid.style.width = state.layout.middleWidth + 'px';
    mid.classList.toggle('collapsed', state.layout.middleCollapsed);
  }
  if (nts) {
    nts.style.width = state.layout.notesWidth + 'px';
  }

  const ncGroupsPane = document.getElementById('nc-groups-pane');
  if (ncGroupsPane) ncGroupsPane.style.width = state.layout.ncGroupsPaneWidth + 'px';

  const ncSidebar = document.getElementById('nc-sidebar');
  if (ncSidebar) {
    ncSidebar.style.width = state.layout.notesSidebarWidth + 'px';
    ncSidebar.classList.toggle('collapsed', state.layout.ncSidebarCollapsed);
  }

  const mmGroupsPane = document.getElementById('mm-groups-pane');
  if (mmGroupsPane) mmGroupsPane.style.width = state.layout.mmGroupsPaneWidth + 'px';

  const mmSidebarPanel = document.getElementById('mm-sidebar-panel');
  const mmEditorPanel = document.getElementById('mm-editor-panel');
  if (mmSidebarPanel) {
    mmSidebarPanel.style.width = state.layout.mmSidebarWidth + 'px';
    mmSidebarPanel.classList.toggle('collapsed', state.layout.mmSidebarCollapsed);
  }
  if (mmEditorPanel) mmEditorPanel.style.width = state.layout.mmEditorWidth + 'px';

  const cbSidebar = document.getElementById('cb-sidebar');
  if (cbSidebar) {
    cbSidebar.style.width = state.layout.cbSidebarWidth + 'px';
    cbSidebar.classList.toggle('collapsed', state.layout.cbSidebarCollapsed);
  }
  const cbGroupsPane = document.getElementById('cb-groups-pane');
  if (cbGroupsPane) cbGroupsPane.style.width = state.layout.cbGroupsPaneWidth + 'px';

  if (state.appMode === 'snippets') {
    clearBulkSelection();
    renderCbSidebar();
    renderCbMain();
  } else if (state.appMode === 'notes') {
    clearBulkSelection();
    renderNotesSidebar();
    renderNoteCanvas();
  } else if (state.appMode === 'history') {
    clearBulkSelection();
    renderSidebar();
    renderHistoryTable();
  } else if (state.appMode === 'mindmap') {
    clearBulkSelection();
    renderMindMapSidebar();
    renderMindMap();
  } else if (state.appMode === 'labels') {
    clearBulkSelection();
    renderLabelsSidebar();
    renderLabelsMiddle();
    renderReading();
  } else if (state.appMode === 'timeline') {
    clearBulkSelection();
    renderTimeline();
  } else {
    // jira mode
    renderSidebar();
    renderMiddle();
    renderReading();
  }
}

window.toggleCollapse = function (id) {
  if (id === 'sidebar') state.layout.sidebarCollapsed = !state.layout.sidebarCollapsed;
  if (id === 'middle') state.layout.middleCollapsed = !state.layout.middleCollapsed;
  if (id === 'nc-sidebar') state.layout.ncSidebarCollapsed = !state.layout.ncSidebarCollapsed;
  if (id === 'mm-sidebar') state.layout.mmSidebarCollapsed = !state.layout.mmSidebarCollapsed;
  if (id === 'cb-sidebar') state.layout.cbSidebarCollapsed = !state.layout.cbSidebarCollapsed;
  saveState();
  updateViewMode();
};

function initResizing() {
  const body = document.getElementById('app-body');
  const setup = (handleId, targetId, prop, min, align) => {
    const handle = document.getElementById(handleId);
    const target = document.getElementById(targetId);
    if (!handle || !target) return;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      body.classList.add('resizing');
      handle.classList.add('active');
      const startX = e.pageX;
      const startW = target.offsetWidth;

      const onMouseMove = (moveE) => {
        let diff = moveE.pageX - startX;
        if (align === 'right') diff = -diff;
        let newW = startW + diff;
        if (newW < min) newW = min;
        target.style.width = newW + 'px';
        state.layout[prop] = newW;
      };

      const onMouseUp = () => {
        body.classList.remove('resizing');
        handle.classList.remove('active');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        saveState();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  };

  setup('resizer-sidebar', 'sidebar', 'sidebarWidth', 120, 'left');
  setup('resizer-middle', 'middle', 'middleWidth', 150, 'left');
  setup('resizer-notes', 'notes-pane', 'notesWidth', 200, 'right');
  setup('resizer-nc-groups', 'nc-groups-pane', 'ncGroupsPaneWidth', 100, 'left');
  setup('resizer-nc-sidebar', 'nc-sidebar', 'notesSidebarWidth', 140, 'left');
  setup('resizer-mm-groups', 'mm-groups-pane', 'mmGroupsPaneWidth', 100, 'left');
  setup('resizer-mm-sidebar', 'mm-sidebar-panel', 'mmSidebarWidth', 120, 'left');
  setup('resizer-mm-editor', 'mm-editor-panel', 'mmEditorWidth', 150, 'left');
  setup('resizer-cb-groups', 'cb-groups-pane', 'cbGroupsPaneWidth', 100, 'left');
  setup('resizer-cb-sidebar', 'cb-sidebar', 'cbSidebarWidth', 140, 'left');
}
