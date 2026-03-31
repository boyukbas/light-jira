#!/usr/bin/env node
/**
 * check-classes.js
 * Finds CSS class names referenced in HTML/JS that are not defined in any CSS file.
 * Run: node check-classes.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

// Classes that are intentionally dynamic (computed at runtime, not literal strings).
// Add to this list if check-classes reports a false positive.
const KNOWN_DYNAMIC = new Set([
  // status classes — built by statusClass() in utils.js
  's-inprogress',
  's-done',
  's-blocked',
  // collapse-btn transform is triggered by JS toggling .collapsed on the parent
  'collapsed',
  // drag state set by JS
  'drag-over',
  // open/show toggled by JS
  'open',
  'show',
  'active',
  'hidden',
  // Jira-rendered content classes (come from Jira API HTML payload, not our code)
  'code',
  'mention',
  'panel',
  'expand',
]);

// ── File discovery ────────────────────────────────────────────────────────────

function findFiles(dir, ext, skip = ['node_modules', '.git', 'lib', 'store']) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !skip.includes(entry.name)) {
      results.push(...findFiles(path.join(dir, entry.name), ext, skip));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

// ── CSS: extract defined class names ─────────────────────────────────────────

function extractDefinedClasses(cssFiles) {
  const defined = new Set();
  for (const file of cssFiles) {
    const content = fs.readFileSync(file, 'utf8');
    // Match .classname in selectors (not inside strings or url())
    for (const m of content.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)) {
      defined.add(m[1]);
    }
  }
  return defined;
}

// ── HTML/JS: extract referenced class names ───────────────────────────────────

function extractReferencedClasses(files) {
  // Map of className -> [files where it's used]
  const refs = new Map();

  function record(cls, file) {
    if (!refs.has(cls)) refs.set(cls, []);
    refs.get(cls).push(path.relative(ROOT, file));
  }

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');

    // class="foo bar baz" — covers both HTML attributes and JS string literals
    for (const m of content.matchAll(/class=["'`]([^"'`]+)["'`]/g)) {
      for (const cls of m[1].trim().split(/\s+/)) {
        if (cls) record(cls, file);
      }
    }

    // classList.add / remove / toggle / contains ('foo', 'bar')
    for (const m of content.matchAll(/classList\.(?:add|remove|toggle|contains)\(([^)]+)\)/g)) {
      for (const sm of m[1].matchAll(/['"`]([a-zA-Z][a-zA-Z0-9_-]*)['"`]/g)) {
        record(sm[1], file);
      }
    }

    // className = 'foo bar'
    for (const m of content.matchAll(/className\s*=\s*["'`]([^"'`]+)["'`]/g)) {
      for (const cls of m[1].trim().split(/\s+/)) {
        if (cls) record(cls, file);
      }
    }
  }

  return refs;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const cssFiles = findFiles(ROOT, '.css');
const sourceFiles = [
  ...findFiles(ROOT, '.html'),
  ...findFiles(ROOT, '.js').filter(
    (f) => !f.includes('node_modules') && !f.includes('check-classes')
  ),
];

const defined = extractDefinedClasses(cssFiles);
const referenced = extractReferencedClasses(sourceFiles);

const missing = [];
for (const [cls, files] of referenced.entries()) {
  if (!defined.has(cls) && !KNOWN_DYNAMIC.has(cls)) {
    missing.push({ cls, files: [...new Set(files)] });
  }
}

if (missing.length === 0) {
  console.log('✓ All CSS classes are defined.');
  process.exit(0);
} else {
  console.error(`\n✖ ${missing.length} class(es) referenced but not defined in any CSS file:\n`);
  for (const { cls, files } of missing) {
    console.error(`  .${cls}`);
    for (const f of files) console.error(`    └─ ${f}`);
  }
  console.error(
    '\nFix: define the class in an appropriate CSS file, or add it to KNOWN_DYNAMIC in check-classes.js if it is set programmatically.\n'
  );
  process.exit(1);
}
