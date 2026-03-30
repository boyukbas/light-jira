'use strict';

function addLabel(key) {
  const allLabels = Object.keys(state.labelColors);
  const currentLabels = state.labels[key] || [];
  const suggestions = allLabels.filter((l) => !currentLabels.includes(l));
  showLabelPicker(key, suggestions);
}

function showLabelPicker(key, suggestions) {
  const existing = document.getElementById('label-picker');
  if (existing) existing.remove();

  let html =
    '<div id="label-picker" class="label-picker-overlay">' +
    '<div class="label-picker-box">' +
    '<div class="label-picker-header">Add Label<button class="modal-close" onclick="closeLabelPicker()">&times;</button></div>' +
    '<input type="text" id="label-picker-input" class="form-input" placeholder="Type a label name..." autocomplete="off" />';

  html += '<div class="label-picker-suggestions" id="label-picker-list">';
  for (const lbl of suggestions) {
    const c = state.labelColors[lbl] || '#6e7681';
    html +=
      '<div class="label-picker-item" data-label="' +
      esc(lbl) +
      '">' +
      '<span class="lbl-badge" style="background:' +
      c +
      ';' +
      (c === '#f0883e' || c === '#e3b341' ? 'color:#000;' : 'color:#fff;') +
      '">' +
      esc(lbl) +
      '</span></div>';
  }
  if (!suggestions.length) {
    html +=
      '<div style="padding:8px;color:var(--text-tertiary);font-size:12px;text-align:center;">No existing labels. Type to create one.</div>';
  }
  html += '</div></div></div>';

  document.body.insertAdjacentHTML('beforeend', html);

  const input = document.getElementById('label-picker-input');
  const listEl = document.getElementById('label-picker-list');

  input.focus();

  input.addEventListener('input', () => {
    const val = input.value.trim().toLowerCase();
    listEl.querySelectorAll('.label-picker-item').forEach((item) => {
      item.style.display = item.dataset.label.toLowerCase().includes(val) ? '' : 'none';
    });
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = input.value.trim();
      if (val) {
        applyLabel(key, val);
        closeLabelPicker();
      }
    }
    if (e.key === 'Escape') closeLabelPicker();
  });

  listEl.querySelectorAll('.label-picker-item').forEach((item) => {
    item.addEventListener('click', () => {
      applyLabel(key, item.dataset.label);
      closeLabelPicker();
    });
  });

  document.getElementById('label-picker').addEventListener('click', (e) => {
    if (e.target.id === 'label-picker') closeLabelPicker();
  });
}

function applyLabel(key, name) {
  const tn = name.trim();
  if (!tn) return;
  if (!state.labelColors[tn])
    state.labelColors[tn] = AV_COLORS[Object.keys(state.labelColors).length % AV_COLORS.length];
  if (!state.labels[key]) state.labels[key] = [];
  if (!state.labels[key].includes(tn)) {
    state.labels[key].push(tn);
    saveState();
    renderReading();
    toast('Label "' + tn + '" added');
  }
}

window.applyLabel = applyLabel;

window.closeLabelPicker = function () {
  const el = document.getElementById('label-picker');
  if (el) el.remove();
};

function removeLabel(key, lbl) {
  if (state.labels[key]) {
    state.labels[key] = state.labels[key].filter((x) => x !== lbl);
    saveState();
    renderReading();
  }
}

window.viewByLabel = function (label) {
  const ticketKeys = [];
  for (const [key, labels] of Object.entries(state.labels)) {
    if (labels.includes(label)) ticketKeys.push(key);
  }
  if (!ticketKeys.length) {
    toast('No tickets found with label "' + label + '"', 'error');
    return;
  }

  let groupId = 'lbl_' + label.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  let group = state.groups.find((g) => g.id === groupId);
  if (!group) {
    group = { id: groupId, name: '\uD83C\uDFF7\uFE0F ' + label, keys: [] };
    insertGroupBeforeHistory(group);
  }
  group.keys = ticketKeys;
  state.activeGroupId = groupId;
  state.activeKey = ticketKeys[0] || null;
  state.appMode = 'jira';
  saveState();
  updateViewMode();
  toast(ticketKeys.length + ' ticket(s) with label "' + label + '"');
};
