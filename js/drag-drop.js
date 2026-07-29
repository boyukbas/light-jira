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
  // entryKey handles both plain-string keys and history's {key, added} entries,
  // and reorderById re-inserts the actual element (not the string) so object keys
  // survive the move.
  if (reorderById(g.keys, draggedKey, targetKey, entryKey)) {
    saveState();
    renderMiddle();
  }
};

// ── Aux-tab item reorder (notes / mindmaps / snippets) ───────────────────────
// Each aux list is a single flat array (state.standAloneNotes / mindMaps /
// codeBlocks) shown through a group filter. Dragging one item onto another
// reorders the underlying array with the same displacement semantics as ticket
// cards; reorderById works on the full array, so items hidden by the active
// group filter keep their positions.
let draggedItemId = null;

window.handleItemDragStart = (e, id) => {
  draggedItemId = id;
  draggedKey = null;
  draggedGroupId = null;
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
};

window.handleItemDrop = (e, arr, targetId, rerender) => {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');
  const movedId = draggedItemId;
  draggedItemId = null;
  if (!movedId || movedId === targetId) return;
  if (reorderById(arr, movedId, targetId, (x) => x.id)) {
    saveState();
    rerender();
  }
};
