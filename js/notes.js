'use strict';

// ── NOTES — NOTE MANAGEMENT & VIEW ───────────────────────────────────────────
// Note CRUD, sidebar rendering, and canvas orchestration.
// Block-level construction lives in notes-canvas.js.

function switchTab(tab) {
  state.appMode = tab;
  saveState();
  updateViewMode();
}

function getActiveNote() {
  return state.standAloneNotes.find((n) => n.id === state.activeNoteId) || null;
}

function notePreview(note) {
  const tb = note.blocks && note.blocks.find((b) => b.type === 'text');
  return stripHtml(tb?.content || '')
    .trim()
    .substring(0, 60);
}

function createNote() {
  const note = {
    id: 'note_' + Date.now(),
    title: '',
    blocks: [],
    created: Date.now(),
    updated: Date.now(),
  };
  state.standAloneNotes.unshift(note);
  state.activeNoteId = note.id;
  saveState();
  updateViewMode();
}

function deleteNote(noteId) {
  if (!confirm('Delete this note?')) return;
  state.standAloneNotes = state.standAloneNotes.filter((n) => n.id !== noteId);
  if (state.activeNoteId === noteId) {
    state.activeNoteId = state.standAloneNotes.length ? state.standAloneNotes[0].id : null;
  }
  saveState();
  updateViewMode();
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
function renderNotesSidebar() {
  const list = document.getElementById('nc-notes-list');
  if (!list) return;

  const notes = state.standAloneNotes;
  let html = '';

  for (const note of notes) {
    const active = state.activeNoteId === note.id ? ' active' : '';
    html +=
      '<div class="nc-note-item' +
      active +
      '" data-id="' +
      esc(note.id) +
      '">' +
      '<div class="nc-note-title">' +
      esc(note.title || 'Untitled') +
      '</div>' +
      '<div class="nc-note-preview">' +
      esc(notePreview(note) || 'Empty canvas') +
      '</div>' +
      '<div class="nc-note-date">' +
      relDate(new Date(note.updated)) +
      '</div>' +
      '<button class="nc-note-del" data-del-id="' +
      esc(note.id) +
      '" title="Delete note">\u2715</button>' +
      '</div>';
  }

  if (!notes.length) {
    html = '<div class="nc-empty-hint">No notes yet.<br>Click \u002B to create one.</div>';
  }

  list.innerHTML = html;

  list.querySelectorAll('.nc-note-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.nc-note-del')) return;
      state.activeNoteId = el.dataset.id;
      saveState();
      updateViewMode();
    });
  });

  list.querySelectorAll('.nc-note-del').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteNote(btn.dataset.delId);
    });
  });

  const addBtn = document.getElementById('add-note-btn');
  if (addBtn) addBtn.onclick = createNote;
}

// ── CANVAS ORCHESTRATION ──────────────────────────────────────────────────────
function renderNoteCanvas() {
  const main = document.getElementById('nc-main');
  if (!main) return;

  const note = getActiveNote();
  if (!note) {
    main.innerHTML =
      '<div class="notes-empty-state">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="color:var(--text-tertiary)">' +
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
      '<polyline points="14 2 14 8 20 8"/></svg>' +
      '<h3>No canvas selected</h3>' +
      '<p>Select a note or click \u002B to create one.</p></div>';
    return;
  }

  main.innerHTML =
    '<div class="nc-canvas-header">' +
    '<input type="text" class="nc-title-input" id="nc-title-input" placeholder="Untitled Canvas" value="' +
    esc(note.title) +
    '">' +
    '<span class="nc-date" id="nc-date"></span>' +
    '<button class="top-btn" id="nc-add-mermaid-btn">' +
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<circle cx="12" cy="12" r="3"/>' +
    '<line x1="12" y1="3" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="21"/>' +
    '<line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/>' +
    '<line x1="5.6" y1="5.6" x2="9.2" y2="9.2"/><line x1="14.8" y1="14.8" x2="18.4" y2="18.4"/>' +
    '<line x1="18.4" y1="5.6" x2="14.8" y2="9.2"/><line x1="9.2" y1="14.8" x2="5.6" y2="18.4"/>' +
    '</svg> Diagram</button>' +
    '</div>' +
    '<div id="note-canvas" class="note-canvas" tabindex="0" data-note-id="' +
    esc(note.id) +
    '"></div>';

  const canvas = document.getElementById('note-canvas');

  for (const blk of note.blocks) {
    canvas.appendChild(buildBlock(blk, note));
  }

  canvas.addEventListener('click', (e) => {
    if (e.target !== canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left + canvas.scrollLeft);
    const y = Math.round(e.clientY - rect.top + canvas.scrollTop);
    addNoteBlock(note, 'text', x - 10, y - 10, '');
  });

  canvas.addEventListener('paste', (e) => handleCanvasPaste(e, note));
  canvas.addEventListener('dragover', (e) => e.preventDefault());
  canvas.addEventListener('drop', (e) => handleCanvasDrop(e, note, canvas));

  const ti = document.getElementById('nc-title-input');
  if (ti) {
    ti.oninput = () => {
      note.title = ti.value;
      note.updated = Date.now();
      saveState();
      const el = document.querySelector('.nc-note-item[data-id="' + note.id + '"] .nc-note-title');
      if (el) el.textContent = note.title || 'Untitled';
    };
  }

  const dateEl = document.getElementById('nc-date');
  if (dateEl) {
    dateEl.textContent = new Date(note.updated).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  const addMermaid = document.getElementById('nc-add-mermaid-btn');
  if (addMermaid) {
    addMermaid.addEventListener('click', () => {
      const maxY = note.blocks.reduce((m, b) => Math.max(m, b.y + 200), 40);
      addNoteBlock(note, 'mermaid', 40, maxY, 'graph TD\n    A[Start] --> B[End]');
    });
  }
}
