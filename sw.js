const CACHE_NAME = 'light-jira-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './utils.js',
  './api.js',
  './app.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => {
    return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
  }));
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request).then(response => {
      return response || fetch(e.request);
    }).catch(() => caches.match('./index.html'))
  );
});
