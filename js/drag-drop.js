'use strict';

// ── DRAG AND DROP ─────────────────────────────────────────────────────────────
window.handleDragStart = (e, key) => {
  draggedKey = key;
  draggedGroupId = null;
};

window.handleGroupDragStart = (e, groupId) => {
  draggedGroupId = groupId;
  draggedKey = null;
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  e.stopPropagation();
};

window.handleDragOver = (e) => {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
};

window.handleDragLeave = (e) => {
  e.currentTarget.classList.remove('drag-over');
};

window.handleDropToGroup = (e, gId) => {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (draggedGroupId && draggedGroupId !== gId) {
    const fromIdx = state.groups.findIndex((g) => g.id === draggedGroupId);
    const toIdx = state.groups.findIndex((g) => g.id === gId);
    if (fromIdx !== -1 && toIdx !== -1) {
      const [moved] = state.groups.splice(fromIdx, 1);
      state.groups.splice(toIdx, 0, moved);
      saveState();
      renderSidebar();
    }
    draggedGroupId = null;
  } else if (draggedKey) {
    const oldG = state.groups.find((x) => x.keys.includes(draggedKey));
    if (oldG && oldG.id !== gId) window.moveTicket(draggedKey, gId);
  }
};

window.handleDropToItem = (e, targetKey) => {
  e.currentTarget.classList.remove('drag-over');
  e.preventDefault();
  e.stopPropagation();
  if (!draggedKey || draggedKey === targetKey) return;
  const g = getActiveGroup();
  const oldIdx = g.keys.indexOf(draggedKey),
    newIdx = g.keys.indexOf(targetKey);
  if (oldIdx !== -1 && newIdx !== -1) {
    g.keys.splice(oldIdx, 1);
    g.keys.splice(newIdx, 0, draggedKey);
    saveState();
    renderMiddle();
  }
};
