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

  if (!state.mindMapCode) {
    state.mindMapCode = MM_DEFAULT_CODE;
    saveState();
  }

  const textarea = document.getElementById('mm-code');
  if (textarea) {
    textarea.value = state.mindMapCode;
    textarea.addEventListener('input', () => {
      state.mindMapCode = textarea.value;
      saveState();
      clearTimeout(mmRenderTimer);
      mmRenderTimer = setTimeout(renderMindMap, 450);
    });
  }

  const copyBtn = document.getElementById('mm-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(state.mindMapCode || '').then(() => toast('Code copied!'));
    });
  }
}

async function renderMindMap() {
  if (typeof mermaid === 'undefined') return;
  const el = document.getElementById('mm-preview');
  if (!el) return;

  const code = (state.mindMapCode || MM_DEFAULT_CODE).trim();
  if (!code) {
    el.innerHTML = '';
    return;
  }

  try {
    const id = 'mm-svg-' + ++mmRenderSeq;
    const { svg } = await mermaid.render(id, code);
    el.innerHTML = svg;
  } catch (err) {
    el.innerHTML =
      '<div class="mm-error">' + esc(err.message || 'Invalid diagram syntax') + '</div>';
  }
}
