'use strict';

// ── FILTER & JQL MODE ─────────────────────────────────────────────────────────
async function runFilterLoad(rawInput, customName = '') {
  const parsed = parseFilterInput(rawInput);
  let jql = '';
  let groupName = customName || 'Filter Results';

  if (parsed.type === 'filterId') {
    const filter = await fetchFilterById(parsed.value);
    jql = filter.jql;
    if (!customName) groupName = filter.name;
  } else {
    jql = parsed.value;
  }

  const results = await fetchByJql(jql);
  const issues = results.issues || [];
  if (!issues.length) {
    toast('No tickets found for this query', 'error');
    return;
  }

  const keys = issues.map((iss) => {
    if (issueCache[iss.key]?.fields?.description === undefined) issueCache[iss.key] = iss;
    return iss.key;
  });

  // Duplicate check: if a filter group with the same JQL already exists, reload it
  const existing = state.groups.find((g) => g.isFilter && g.query === jql);
  if (existing) {
    existing.keys = keys;
    state.activeGroupId = existing.id;
    state.activeKey = keys[0];
    saveState();
    updateViewMode();
    toast('Filter reloaded: ' + keys.length + ' tickets in "' + existing.name + '"', 'success');
    return;
  }

  const id = 'filter_' + Date.now();
  insertGroupBeforeHistory({ id, name: groupName, keys, query: jql, isFilter: true });
  state.activeGroupId = id;
  state.activeKey = keys[0];
  saveState();
  updateViewMode();
  toast('Loaded ' + keys.length + ' tickets into "' + groupName + '"', 'success');
}
