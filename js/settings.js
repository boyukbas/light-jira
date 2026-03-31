'use strict';

// ── SETTINGS MODAL ────────────────────────────────────────────────────────────

function openCfg() {
  document.getElementById('cfg-url').value = cfg.baseUrl;
  document.getElementById('cfg-email').value = cfg.email;
  document.getElementById('cfg-token').value = cfg.token;
  clearSettingsErrors();
  document.getElementById('settings-overlay').classList.remove('hidden');
  document.getElementById('cfg-email').focus();
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

function initSettings() {
  const settingsBtn = document.getElementById('settings-btn');

  settingsBtn.addEventListener('click', openCfg);

  const closeCfg = () => {
    document.getElementById('settings-overlay').classList.add('hidden');
    settingsBtn.focus();
  };
  document.getElementById('settings-close').addEventListener('click', closeCfg);
  document.getElementById('settings-cancel').addEventListener('click', closeCfg);
  document.getElementById('settings-overlay').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCfg();
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
    saveConfig();
    closeCfg();
    toast('Settings saved');
    if (getActiveGroup().keys.length) loadAllGroupTickets();
  });
}
