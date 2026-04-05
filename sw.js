'use strict';

const CACHE_NAME = 'crisp-jira-v1';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/icon.svg',
  '/api.js',
  '/utils.js',
  '/lib/mermaid.min.js',
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
  '/js/drag-drop.js',
  '/js/filters.js',
  '/js/tickets.js',
  '/js/mindmap.js',
  '/js/settings.js',
  '/js/beam.js',
  '/js/init.js',
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
