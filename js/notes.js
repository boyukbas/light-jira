'use strict';

// ── NOTES CANVAS ──────────────────────────────────────────────────────────────
let ncMermaidTimers = {}; // blockId → timeout
let ncMermaidSeq = 0;

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
    const title = note.title || 'Untitled';
    const preview = notePreview(note);
    const dateStr = relDate(new Date(note.updated));
    html +=
      '<div class="nc-note-item' +
      active +
      '" data-id="' +
      esc(note.id) +
      '">' +
      '<div class="nc-note-title">' +
      esc(title) +
      '</div>' +
      '<div class="nc-note-preview">' +
      esc(preview || 'Empty canvas') +
      '</div>' +
      '<div class="nc-note-date">' +
      dateStr +
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

// ── CANVAS RENDERING ──────────────────────────────────────────────────────────
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

  // Render existing blocks
  for (const blk of note.blocks) {
    canvas.appendChild(buildBlock(blk, note));
  }

  // Click empty canvas → create text block
  canvas.addEventListener('click', (e) => {
    if (e.target !== canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left + canvas.scrollLeft);
    const y = Math.round(e.clientY - rect.top + canvas.scrollTop);
    addNoteBlock(note, 'text', x - 10, y - 10, '');
  });

  // Paste image onto canvas
  canvas.addEventListener('paste', (e) => handleCanvasPaste(e, note));

  // Drop image onto canvas
  canvas.addEventListener('dragover', (e) => e.preventDefault());
  canvas.addEventListener('drop', (e) => handleCanvasDrop(e, note, canvas));

  // Title input
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

  // Date display
  const dateEl = document.getElementById('nc-date');
  if (dateEl) {
    dateEl.textContent = new Date(note.updated).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  // Add diagram block button
  const addMermaid = document.getElementById('nc-add-mermaid-btn');
  if (addMermaid) {
    addMermaid.addEventListener('click', () => {
      const maxY = note.blocks.reduce((m, b) => Math.max(m, b.y + 200), 40);
      addNoteBlock(note, 'mermaid', 40, maxY, 'graph TD\n    A[Start] --> B[End]');
    });
  }
}

// ── BLOCK BUILDER ─────────────────────────────────────────────────────────────
function buildBlock(blk, note) {
  const el = document.createElement('div');
  el.className = 'cb';
  el.dataset.id = blk.id;
  el.dataset.type = blk.type;
  el.style.left = blk.x + 'px';
  el.style.top = blk.y + 'px';
  el.style.width = (blk.w || 400) + 'px';

  // Grip handle
  const handle = document.createElement('div');
  handle.className = 'cb-handle';
  handle.title = 'Drag to move';
  handle.innerHTML =
    '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">' +
    '<circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/>' +
    '<circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>' +
    '<circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/>' +
    '</svg>';
  el.appendChild(handle);

  // Body
  const body = document.createElement('div');
  body.className = 'cb-body';

  if (blk.type === 'text') {
    const text = document.createElement('div');
    text.className = 'cb-text';
    text.contentEditable = 'true';
    text.dataset.placeholder = 'Type something\u2026';
    text.innerHTML = blk.content || '';
    let saveTimer;
    text.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        blk.content = text.innerHTML;
        note.updated = Date.now();
        saveState();
        syncNotePreview(note);
      }, 300);
    });
    body.appendChild(text);
  } else if (blk.type === 'image') {
    const img = document.createElement('img');
    img.className = 'cb-img';
    img.src = screenshotStore[blk.content] || '';
    img.draggable = false;
    body.appendChild(img);
  } else if (blk.type === 'mermaid') {
    const wrap = document.createElement('div');
    wrap.className = 'cb-mermaid-wrap';

    const codeRow = document.createElement('div');
    codeRow.className = 'cb-mermaid-code-row';
    const ta = document.createElement('textarea');
    ta.className = 'cb-mermaid-code';
    ta.value = blk.content || '';
    ta.spellcheck = false;
    codeRow.appendChild(ta);
    wrap.appendChild(codeRow);

    const preview = document.createElement('div');
    preview.className = 'cb-mermaid-preview';
    wrap.appendChild(preview);

    renderMermaidInBlock(preview, blk.content || '');

    ta.addEventListener('input', () => {
      clearTimeout(ncMermaidTimers[blk.id]);
      ncMermaidTimers[blk.id] = setTimeout(() => {
        blk.content = ta.value;
        note.updated = Date.now();
        saveState();
        renderMermaidInBlock(preview, ta.value);
      }, 450);
    });

    body.appendChild(wrap);
  }

  el.appendChild(body);

  // Delete button
  const del = document.createElement('button');
  del.className = 'cb-del';
  del.title = 'Remove block';
  del.textContent = '\u2715';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    note.blocks = note.blocks.filter((b) => b.id !== blk.id);
    note.updated = Date.now();
    saveState();
    el.remove();
  });
  el.appendChild(del);

  setupBlockDrag(el, blk, note);
  return el;
}

async function renderMermaidInBlock(previewEl, code) {
  if (typeof mermaid === 'undefined' || !code.trim()) {
    previewEl.innerHTML = '';
    return;
  }
  try {
    const id = 'nc-mm-' + ++ncMermaidSeq;
    const { svg } = await mermaid.render(id, code.trim());
    previewEl.innerHTML = svg;
  } catch {
    previewEl.innerHTML =
      '<div class="mm-error" style="font-size:11px;padding:6px;">Invalid diagram syntax</div>';
  }
}

function setupBlockDrag(el, blk, note) {
  const handle = el.querySelector('.cb-handle');
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.pageX;
    const startY = e.pageY;
    const origX = blk.x;
    const origY = blk.y;
    el.classList.add('cb-dragging');

    const onMove = (me) => {
      const nx = Math.max(0, origX + me.pageX - startX);
      const ny = Math.max(0, origY + me.pageY - startY);
      el.style.left = nx + 'px';
      el.style.top = ny + 'px';
    };

    const onUp = (me) => {
      el.classList.remove('cb-dragging');
      blk.x = Math.max(0, origX + me.pageX - startX);
      blk.y = Math.max(0, origY + me.pageY - startY);
      note.updated = Date.now();
      saveState();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function addNoteBlock(note, type, x, y, content) {
  const blk = {
    id: 'blk_' + Date.now(),
    type,
    x: Math.max(0, x),
    y: Math.max(0, y),
    w: type === 'mermaid' ? 520 : 400,
    content: content || '',
  };
  note.blocks.push(blk);
  note.updated = Date.now();
  saveState();

  const canvas = document.getElementById('note-canvas');
  if (canvas) {
    const blockEl = buildBlock(blk, note);
    canvas.appendChild(blockEl);
    if (type === 'text') setTimeout(() => blockEl.querySelector('.cb-text')?.focus(), 0);
  }
}

function syncNotePreview(note) {
  const el = document.querySelector('.nc-note-item[data-id="' + note.id + '"] .nc-note-preview');
  if (el) el.textContent = notePreview(note) || 'Empty canvas';
}

// ── CLIPBOARD / DROP ──────────────────────────────────────────────────────────
function handleCanvasPaste(e, note) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;
      readImageFile(file, (imgId) => {
        const maxY = note.blocks.reduce((m, b) => Math.max(m, b.y + 200), 40);
        addNoteBlock(note, 'image', 40, maxY, imgId);
        toast('Image pasted', 'success');
      });
      return;
    }
  }
}

function handleCanvasDrop(e, note, canvas) {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left + canvas.scrollLeft;
  const y = e.clientY - rect.top + canvas.scrollTop;
  readImageFile(file, (imgId) => {
    addNoteBlock(note, 'image', x, y, imgId);
    toast('Image added', 'success');
  });
}

function readImageFile(file, cb) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const imgId = 'img_' + Date.now();
    screenshotStore[imgId] = ev.target.result;
    saveState();
    cb(imgId);
  };
  reader.readAsDataURL(file);
}
