'use strict';

// ── UTILS ─────────────────────────────────────────────────────────────────────
function normalise(raw) {
  let t = raw.trim();
  // Handle full Jira URLs: https://site.atlassian.net/browse/PROJ-123
  try {
    if (t.startsWith('http')) {
      const url = new URL(t);
      const browsePath = url.pathname.match(/\/browse\/([A-Za-z][A-Za-z0-9]+-\d+)/);
      if (browsePath) return browsePath[1].toUpperCase();
    }
  } catch { /* not a valid URL, continue with normal parsing */ }
  
  t = t.toUpperCase();
  if (/^\d+$/.test(t)) return cfg.defaultProject + '-' + t;
  if (/^[A-Z][A-Z0-9]+-\d+$/.test(t)) return t;
  const m = t.match(/^([A-Z][A-Z0-9]+)(\d+)$/);
  return m ? m[1] + '-' + m[2] : t;
}

function esc(s) { 
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); 
}

function stripHtml(html) { 
  const t = document.createElement('div'); 
  t.innerHTML = html; 
  return t.textContent; 
}

function statusClass(cat) {
  if (!cat) return ''; const c = cat.toLowerCase();
  if (c.includes('progress') || c.includes('review')) return 's-inprogress';
  if (c.includes('done') || c.includes('complete') || c.includes('closed') || c.includes('resolved')) return 's-done';
  if (c.includes('block')) return 's-blocked';
  return '';
}

function relDate(iso) {
  const d = new Date(iso), s = (Date.now() - d) / 1000;
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  if (s < 604800) return Math.floor(s/86400) + 'd ago';
  return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
}

function toast(msg, type) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; 
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(50px)';
  }, 3000);
}

const AV_COLORS = ['#f85149', '#f0883e', '#e3b341', '#3fb950', '#58a6ff', '#a371f7', '#d29922', '#1f6feb'];

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

function avBadge(name, cls) {
  const color = AV_COLORS[(name||'').length % AV_COLORS.length];
  return '<div class="av-badge ' + cls + '" style="background:' + color + ';" title="' + esc(name) + '">' + esc(initials(name)) + '</div>';
}
