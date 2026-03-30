'use strict';

// ── MIND MAP ──────────────────────────────────────────────────────────────────
const MM_DEFAULT_CODE = `journey
    title My Working Day
    section Go to work
      Make tea: 5: Me
      Go upstairs: 3: Me
      Do work: 1: Me, Cat
    section Go home
      Go downstairs: 5: Me
      Sit down: 5: Me`;

let mmRenderTimer = null;
let mmRenderSeq = 0;

function initMindMap() {
  if (typeof mermaid === 'undefined') return;
  mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });

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
    } catch (err) {
      previewEl.innerHTML =
        '<div class="mm-error">' + esc(err.message || 'Invalid diagram syntax') + '</div>';
    }
  }
}
