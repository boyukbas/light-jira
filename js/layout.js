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

  if (state.appMode === 'notes') {
    renderNotesSidebar();
    renderNoteEditor();
  } else if (state.appMode === 'history') {
    renderSidebar();
    renderHistoryTable();
  } else {
    renderSidebar();
    renderMiddle();
    renderReading();
  }
}

window.toggleCollapse = function (id) {
  if (id === 'sidebar') state.layout.sidebarCollapsed = !state.layout.sidebarCollapsed;
  if (id === 'middle') state.layout.middleCollapsed = !state.layout.middleCollapsed;
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
}
