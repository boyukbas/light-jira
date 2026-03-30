'use strict';

// ── FILTER & JQL MODE ─────────────────────────────────────────────────────────
function applyFilterGroup(keys, groupName, queryKey) {
  const existing = state.groups.find((g) => g.isFilter && g.query === queryKey);
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
  insertGroupBeforeHistory({ id, name: groupName, keys, query: queryKey, isFilter: true });
  state.activeGroupId = id;
  state.activeKey = keys[0];
  saveState();
  updateViewMode();
  toast('Loaded ' + keys.length + ' tickets into "' + groupName + '"', 'success');
}

async function runFilterLoad(rawInput, customName = '') {
  const parsed = parseFilterInput(rawInput);

  if (parsed.type === 'planId') {
    // fetchPlanDetails is graceful (returns null on failure)
    const plan = await fetchPlanDetails(parsed.value);
    const groupName = customName || plan?.title || plan?.name || 'Plan #' + parsed.value;

    let issues = null;
    try {
      const results = await fetchPlanIssues(parsed.value);
      issues = results.issues || results.values || [];
    } catch {
      // Plans REST API unavailable (requires Jira Premium or specific API scope).
      // Fall back: some plan detail responses include a JQL we can search instead.
      const fallbackJql =
        plan?.issueListConfig?.query?.jql || plan?.jql || plan?.filter?.jql;
      if (fallbackJql) {
        try {
          const r = await fetchByJql(fallbackJql);
          issues = r.issues || [];
        } catch {
          issues = null;
        }
      }
    }

    if (!issues || !issues.length) {
      toast(
        'Could not load plan — the Plans REST API requires Jira Premium. Paste JQL here instead.',
        'error'
      );
      return;
    }
    const keys = issues.map((iss) => {
      if (issueCache[iss.key]?.fields?.description === undefined) issueCache[iss.key] = iss;
      return iss.key;
    });
    applyFilterGroup(keys, groupName, 'plan:' + parsed.value);
    return;
  }

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

  applyFilterGroup(keys, groupName, jql);
}
