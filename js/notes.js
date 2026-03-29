'use strict';

// ── RICH NOTES EDITOR HELPERS ─────────────────────────────────────────────────
function noteBodyToHtml(body) {
  if (!body) return '';
  // Already HTML — return as-is
  if (/<[a-z][\s\S]*>/i.test(body)) return body;
  // Plain text with optional ![screenshot](img_xxx) markers → convert to HTML
  return body
    .split('\n')
    .map((line) => {
      const m = line.match(/^!\[screenshot\]\((img_\d+)\)$/);
      if (m) return '<img data-img-id="' + m[1] + '" class="note-inline-img">';
      return '<p>' + (line ? esc(line) : '<br>') + '</p>';
    })
    .join('');
}

function serializeEditorBody(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('img[data-img-id]').forEach((img) => img.removeAttribute('src'));
  return clone.innerHTML;
}

function resolveImages(el) {
  el.querySelectorAll('img[data-img-id]').forEach((img) => {
    const id = img.getAttribute('data-img-id');
    if (screenshotStore[id]) img.src = screenshotStore[id];
  });
}

function insertImageAtCursor(file, editorEl) {
  const reader = new FileReader();
  reader.onload = () => {
    const imgId = 'img_' + Date.now();
    screenshotStore[imgId] = reader.result;
    editorEl.focus();
    const img = document.createElement('img');
    img.setAttribute('data-img-id', imgId);
    img.src = reader.result;
    img.className = 'note-inline-img';
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(img);
      range.setStartAfter(img);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editorEl.appendChild(img);
    }
    editorEl.dispatchEvent(new Event('input'));
    saveState();
    toast('Screenshot pasted', 'success');
  };
  reader.readAsDataURL(file);
}

function bindPasteHandler(editorEl) {
  editorEl.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        insertImageAtCursor(item.getAsFile(), editorEl);
        return;
      }
    }
  });
  editorEl.addEventListener('dragover', (e) => e.preventDefault());
  editorEl.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) {
      e.preventDefault();
      insertImageAtCursor(file, editorEl);
    }
  });
}

// ── NOTES MODE ────────────────────────────────────────────────────────────────
function switchTab(tab) {
  state.appMode = tab;
  saveState();
  updateViewMode();
}

function createNote() {
  const note = {
    id: 'note_' + Date.now(),
    title: '',
    body: '',
    created: Date.now(),
    updated: Date.now(),
  };
  state.standAloneNotes.unshift(note);
  state.activeNoteId = note.id;
  saveState();
  updateViewMode();
  const titleInput = document.getElementById('note-title-input');
  if (titleInput) titleInput.focus();
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

function getActiveNote() {
  return state.standAloneNotes.find((n) => n.id === state.activeNoteId) || null;
}

function renderNotesSidebar() {
  const list = document.getElementById('group-list');
  if (!list) return;

  let html = '';
  const notes = state.standAloneNotes;

  for (const note of notes) {
    const active = state.activeNoteId === note.id ? ' active' : '';
    const title = note.title || 'Untitled Note';
    const preview = stripHtml(note.body || '')
      .trim()
      .substring(0, 60);
    const dateStr = relDate(new Date(note.updated));

    html +=
      '<div class="note-item' +
      active +
      '" data-note-id="' +
      esc(note.id) +
      '">' +
      '<span class="note-item-title">' +
      esc(title) +
      '</span>' +
      '<span class="note-item-preview">' +
      esc(preview || 'Empty note') +
      '</span>' +
      '<span class="note-item-date">' +
      dateStr +
      '</span>' +
      '<button class="note-delete-btn" data-delete-id="' +
      esc(note.id) +
      '" title="Delete Note">\u2715</button>' +
      '</div>';
  }

  if (!notes.length) {
    html =
      '<div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:12px;">No notes yet.<br>Click + to create one.</div>';
  }

  list.innerHTML = html;

  list.querySelectorAll('.note-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('note-delete-btn')) return;
      state.activeNoteId = el.dataset.noteId;
      saveState();
      updateViewMode();
    });
  });

  list.querySelectorAll('.note-delete-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteNote(btn.dataset.deleteId);
    });
  });

  const sidebarHeader = document.querySelector('#sidebar .middle-header span:first-child');
  if (sidebarHeader) sidebarHeader.textContent = 'Notes';

  const addBtn = document.getElementById('add-group-btn');
  if (addBtn) {
    addBtn.onclick = createNote;
  }
}

function renderNoteEditor() {
  const pane = document.getElementById('notes-editor-pane');
  if (!pane) return;

  const note = getActiveNote();
  if (!note) {
    pane.innerHTML =
      '<div class="notes-empty-state">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="color:var(--text-tertiary);">' +
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
      '<polyline points="14 2 14 8 20 8"/></svg>' +
      '<h3>No note selected</h3>' +
      '<p>Select a note from the sidebar or create a new one.</p></div>';
    return;
  }

  // Restore the editor structure if it was replaced by empty state
  if (!document.getElementById('note-title-input')) {
    pane.innerHTML =
      '<div class="notes-editor-header">' +
      '<input type="text" class="note-title-input" id="note-title-input" placeholder="Untitled Note" />' +
      '<span class="note-date" id="note-date-display"></span></div>' +
      '<div class="note-toolbar" id="note-toolbar">' +
      '<button class="note-tool-btn" data-cmd="bold" title="Bold (Ctrl+B)" aria-label="Bold"><b>B</b></button>' +
      '<button class="note-tool-btn" data-cmd="italic" title="Italic (Ctrl+I)" aria-label="Italic"><i>I</i></button>' +
      '<div class="note-toolbar-sep"></div>' +
      '<button class="note-tool-btn" data-cmd="insertUnorderedList" title="Bullet List" aria-label="Bullet List">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>' +
      '</button>' +
      '<button class="note-tool-btn" data-cmd="insertOrderedList" title="Numbered List" aria-label="Numbered List">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 5h1v4" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 9h2" stroke="currentColor" stroke-width="1.5"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>' +
      '</button></div>' +
      '<div id="note-editor-body" class="note-editor-body" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Note body" data-placeholder="Start writing..."></div>';
  }

  const ti = document.getElementById('note-title-input');
  const body = document.getElementById('note-editor-body');
  const dd = document.getElementById('note-date-display');
  const toolbar = document.getElementById('note-toolbar');

  if (ti) {
    ti.value = note.title;
    ti.oninput = () => {
      note.title = ti.value;
      note.updated = Date.now();
      saveState();
      const sidebarItem = document.querySelector(
        '.note-item[data-note-id="' + note.id + '"] .note-item-title'
      );
      if (sidebarItem) sidebarItem.textContent = note.title || 'Untitled Note';
    };
  }

  if (body) {
    body.innerHTML = noteBodyToHtml(note.body);
    resolveImages(body);
    body.oninput = () => {
      note.body = serializeEditorBody(body);
      note.updated = Date.now();
      saveState();
      const sidebarItem = document.querySelector(
        '.note-item[data-note-id="' + note.id + '"] .note-item-preview'
      );
      if (sidebarItem)
        sidebarItem.textContent = stripHtml(note.body).trim().substring(0, 60) || 'Empty note';
    };
    bindPasteHandler(body);
  }

  if (toolbar) {
    toolbar.querySelectorAll('.note-tool-btn[data-cmd]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.execCommand(btn.dataset.cmd, false, null);
      });
    });
  }

  if (dd) {
    dd.textContent = new Date(note.updated).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
