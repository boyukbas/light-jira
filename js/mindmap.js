'use strict';

// ── MIND MAP ──────────────────────────────────────────────────────────────────
const MM_DEFAULT_CODE = `sequenceDiagram
    participant User
    participant System
    User->>System: Request
    System-->>User: Response
    User-)System: Follow-up`;

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
  };
  state.mindMaps.push(d);
  state.activeMindMapId = d.id;
  saveState();
  updateViewMode();
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
  const list = document.getElementById('mm-diagram-list');
  if (!list) return;

  let html = '';
  for (const d of state.mindMaps) {
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
      '" title="Delete diagram">\u2715</button>' +
      '</div>';
  }
  if (!state.mindMaps.length) {
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
      previewEl.innerHTML =
        '<div class="mm-error">' + esc(err.message || 'Invalid diagram syntax') + '</div>';
    }
  }
}
