'use strict';

// ── TIMELINE TAB ──────────────────────────────────────────────────────────────
// Renders a Gantt-style view of tickets that have internal start / ETA dates.
// Dates live in state.timelines[key] = { start?, eta? } — never sent to Jira.

function renderTimeline() {
  const pane = document.getElementById('timeline-pane');
  if (!pane) return;

  // Gather all tickets that have at least one date set
  const rows = [];
  const allKeys = new Set();
  for (const g of state.groups) {
    if (g.id === 'history') continue;
    for (const entry of g.keys) {
      allKeys.add(entryKey(entry));
    }
  }

  for (const key of allKeys) {
    const tl = state.timelines[key];
    if (!tl || (!tl.start && !tl.eta)) continue;
    const issue = issueCache[key] || {};
    const summary = issue.fields?.summary || '';
    rows.push({ key, summary, start: tl.start || null, eta: tl.eta || null });
  }

  if (!rows.length) {
    pane.innerHTML =
      '<div class="tl-header"><span class="tl-title">Timeline</span></div>' +
      '<div class="tl-empty">No tickets have a Start or ETA date yet.<br>' +
      '<span style="font-size:11px;color:var(--text-tertiary)">Open a ticket and set Start / ETA in the detail panel.</span></div>';
    return;
  }

  // Compute date range for the chart axis
  const allDates = rows
    .flatMap((r) => [r.start, r.eta])
    .filter(Boolean)
    .map((d) => new Date(d).getTime());
  const minTs = Math.min(...allDates);
  const maxTs = Math.max(...allDates);
  // Pad by one day on each side so bars at the edges don't get clipped
  const DAY = 86400000;
  const rangeStart = minTs - DAY;
  const rangeEnd = maxTs + DAY;
  const rangeMs = rangeEnd - rangeStart || 1;

  const formatDate = (d) =>
    d
      ? new Date(d).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: '2-digit',
        })
      : '—';

  let html =
    '<div class="tl-header"><span class="tl-title">Timeline</span></div>' +
    '<table class="tl-table"><thead><tr>' +
    '<th>Ticket</th><th>Summary</th><th>Start</th><th>ETA</th><th class="tl-chart-th"></th>' +
    '</tr></thead><tbody>';

  for (const r of rows) {
    const startTs = r.start ? new Date(r.start).getTime() : null;
    const etaTs = r.eta ? new Date(r.eta).getTime() : null;

    let barHtml = '';
    if (startTs !== null && etaTs !== null) {
      const left = ((startTs - rangeStart) / rangeMs) * 100;
      const width = ((etaTs - startTs) / rangeMs) * 100;
      barHtml =
        '<div class="tl-bar" style="left:' +
        left.toFixed(2) +
        '%;width:' +
        Math.max(width, 0.5).toFixed(2) +
        '%;"></div>';
    } else if (etaTs !== null) {
      const pos = ((etaTs - rangeStart) / rangeMs) * 100;
      barHtml = '<div class="tl-milestone" style="left:' + pos.toFixed(2) + '%;"></div>';
    } else if (startTs !== null) {
      const left = ((startTs - rangeStart) / rangeMs) * 100;
      const width = 100 - left;
      barHtml =
        '<div class="tl-bar" style="left:' +
        left.toFixed(2) +
        '%;width:' +
        Math.max(width, 0.5).toFixed(2) +
        '%;opacity:0.35;"></div>';
    }

    html +=
      '<tr class="tl-row">' +
      '<td class="tl-key-cell"><a class="tl-key-link" href="' +
      esc(cfg.baseUrl) +
      '/browse/' +
      esc(r.key) +
      '" target="_blank" rel="noopener noreferrer">' +
      esc(r.key) +
      '</a></td>' +
      '<td class="tl-summary-cell" title="' +
      esc(r.summary) +
      '">' +
      esc(r.summary || '—') +
      '</td>' +
      '<td class="tl-date-cell">' +
      formatDate(r.start) +
      '</td>' +
      '<td class="tl-date-cell">' +
      formatDate(r.eta) +
      '</td>' +
      '<td class="tl-chart-cell"><div class="tl-bar-wrap">' +
      barHtml +
      '</div></td>' +
      '</tr>';
  }

  html += '</tbody></table>';
  pane.innerHTML = html;
}
