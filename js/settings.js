'use strict';

// ── SETTINGS MODAL ────────────────────────────────────────────────────────────

// Active focus-trap teardown, if the modal is currently open.
let _settingsTrap = null;

function openCfg() {
  document.getElementById('cfg-url').value = cfg.baseUrl;
  document.getElementById('cfg-email').value = cfg.email;
  document.getElementById('cfg-token').value = cfg.token;
  document.getElementById('cfg-open-in-window').checked = state.openInWindow !== false;
  clearSettingsErrors();
  renderSnapshotList();
  const overlay = document.getElementById('settings-overlay');
  overlay.classList.remove('hidden');
  document.getElementById('cfg-email').focus();
  // Install a focus trap that also handles Escape and backdrop click. The old
  // implementation only caught Escape if the overlay itself had focus — easy to
  // miss when focus was on an input. This one listens at the document level.
  if (_settingsTrap) _settingsTrap();
  _settingsTrap = trapFocus(overlay, () => closeCfgInternal());
}

function closeCfgInternal() {
  document.getElementById('settings-overlay').classList.add('hidden');
  if (_settingsTrap) {
    _settingsTrap();
    _settingsTrap = null;
  }
}

function showSettingsError(inputId, message) {
  const input = document.getElementById(inputId);
  input.classList.add('input-error');
  let err = input.parentElement.querySelector('.field-error');
  if (!err) {
    err = document.createElement('div');
    err.className = 'field-error';
    input.parentElement.appendChild(err);
  }
  err.textContent = message;
  input.focus();
}

function clearSettingsErrors() {
  document
    .querySelectorAll('#settings-modal .input-error')
    .forEach((el) => el.classList.remove('input-error'));
  document.querySelectorAll('#settings-modal .field-error').forEach((el) => el.remove());
}

// Render the automatic-snapshot list (dates + Restore) inside the settings modal.
async function renderSnapshotList() {
  const container = document.getElementById('backup-snapshots');
  if (!container || typeof listSnapshots !== 'function') return;
  const dates = await listSnapshots();
  if (!dates.length) {
    container.innerHTML = '<div class="snapshot-empty">No automatic backups yet.</div>';
    return;
  }
  container.innerHTML = '';
  for (const d of dates) {
    const row = document.createElement('div');
    row.className = 'snapshot-row';
    const label = document.createElement('span');
    label.className = 'snapshot-date';
    label.textContent = d;
    const btn = document.createElement('button');
    btn.className = 'top-btn';
    btn.type = 'button';
    btn.textContent = 'Restore';
    btn.addEventListener('click', async () => {
      if (!confirm('Restore data from ' + d + '? Your current data will be overwritten.')) return;
      await restoreSnapshot(d);
      closeCfgInternal();
    });
    row.appendChild(label);
    row.appendChild(btn);
    container.appendChild(row);
  }
}

function initSettings() {
  const settingsBtn = document.getElementById('settings-btn');

  settingsBtn.addEventListener('click', openCfg);

  // closeCfg restores focus to the settings button via the trapFocus teardown.
  const closeCfg = () => closeCfgInternal();
  document.getElementById('settings-close').addEventListener('click', closeCfg);
  document.getElementById('settings-cancel').addEventListener('click', closeCfg);

  // ── Data: export / import ──────────────────────────────────────────────────
  document.getElementById('export-data-btn')?.addEventListener('click', () => exportData());
  const importInput = document.getElementById('import-file-input');
  document.getElementById('import-data-btn')?.addEventListener('click', () => importInput?.click());
  importInput?.addEventListener('change', () => {
    const file = importInput.files && importInput.files[0];
    if (file) importBackupFile(file, () => renderSnapshotList());
    importInput.value = ''; // allow re-importing the same file
  });

  document.getElementById('settings-save').addEventListener('click', () => {
    clearSettingsErrors();
    const rawUrl = document.getElementById('cfg-url').value.trim();

    if (rawUrl) {
      try {
        new URL(rawUrl);
      } catch {
        showSettingsError('cfg-url', 'Enter a valid URL (e.g. https://company.atlassian.net)');
        return;
      }
    }

    cfg.baseUrl = (rawUrl || DEFAULTS.baseUrl).replace(/\/$/, '');
    cfg.email = document.getElementById('cfg-email').value.trim();
    cfg.token = document.getElementById('cfg-token').value.trim();
    state.openInWindow = document.getElementById('cfg-open-in-window').checked;
    saveConfig();
    saveState();
    closeCfg();
    toast('Settings saved', 'success');
    if (getActiveGroup().keys.length) loadAllGroupTickets();
  });
}
