'use strict';

// ── NOTES CANVAS — BLOCK SUBSYSTEM ───────────────────────────────────────────
// Handles block creation, drag-repositioning, Mermaid rendering, and
// clipboard/drop import. Called by renderNoteCanvas() in notes.js.

let ncMermaidTimers = {}; // blockId → debounce timeout
let ncMermaidSeq = 0;

// ── BLOCK BUILDER ─────────────────────────────────────────────────────────────
function buildBlock(blk, note) {
  const el = document.createElement('div');
  el.className = 'cb';
  el.dataset.id = blk.id;
  el.dataset.type = blk.type;
  el.style.left = blk.x + 'px';
  el.style.top = blk.y + 'px';
  el.style.width = (blk.w || 400) + 'px';

  // Grip handle for drag-repositioning
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
    text.addEventListener('blur', () => {
      const isEmpty = !text.textContent.trim() && !text.querySelector('img');
      if (isEmpty) {
        clearTimeout(saveTimer);
        note.blocks = note.blocks.filter((b) => b.id !== blk.id);
        note.updated = Date.now();
        saveState();
        el.remove();
      }
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

// ── MERMAID RENDERING ─────────────────────────────────────────────────────────
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
    const errDiv = document.createElement('div');
    errDiv.className = 'mm-error';
    errDiv.style.cssText = 'font-size:11px;padding:6px;';
    errDiv.textContent = 'Invalid diagram syntax';
    previewEl.innerHTML = '';
    previewEl.appendChild(errDiv);
    setTimeout(() => {
      if (errDiv.isConnected) previewEl.innerHTML = '';
    }, 4000);
  }
}

// ── BLOCK DRAG ────────────────────────────────────────────────────────────────
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

// ── BLOCK CREATION ────────────────────────────────────────────────────────────
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
