'use strict';

// Bump CACHE_NAME on every release that changes any cached asset. The activate
// handler below wipes every cache whose name differs, so bumping here guarantees
// clients pick up fresh JS/CSS rather than serving a stale bundle from v1.
const CACHE_NAME = 'crisp-jira-v2';

// Keep this list in sync with the <script> and <link rel="stylesheet"> tags in
// index.html. Stale entries here manifest as the PWA loading a page whose HTML
// references a JS file the service worker never cached, then failing offline.
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/icon.svg',
  '/api.js',
  '/utils.js',
  '/lib/mermaid.min.js',
  '/lib/highlight.min.js',
  '/lib/dayjs.min.js',
  '/lib/dayjs-relativetime.js',
  '/lib/fuse.min.js',
  '/js/state.js',
  '/js/layout.js',
  '/js/sidebar.js',
  '/js/middle.js',
  '/js/history.js',
  '/js/reading-content.js',
  '/js/reading-bindings.js',
  '/js/reading.js',
  '/js/labels.js',
  '/js/labels-tab.js',
  '/js/notes-canvas.js',
  '/js/notes.js',
  '/js/code-blocks.js',
  '/js/drag-drop.js',
  '/js/filters.js',
  '/js/tickets.js',
  '/js/mindmap.js',
  '/js/timeline.js',
  '/js/settings.js',
  '/js/beam.js',
  '/js/init.js',
  '/js/sw-register.js',
  '/css/base.css',
  '/css/layout.css',
  '/css/sidebar.css',
  '/css/ticket-list.css',
  '/css/reading.css',
  '/css/jira-content.css',
  '/css/ui.css',
  '/css/tabs.css',
];

self.addEventListener('install', (event) => {
  // addAll is atomic: if any asset 404s the whole install fails, so a stale
  // CORE_ASSETS entry is caught at release time instead of leaving users with
  // a half-populated cache.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Let Jira API calls go straight to the network
  if (event.request.url.includes('atlassian.net')) return;
  // Let cross-origin requests (Google Fonts, CDN) pass through
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
