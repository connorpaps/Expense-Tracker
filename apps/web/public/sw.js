/* global self, caches, URL, fetch */

const CACHE_NAME = 'expense-tracker-shell-v1';
const SHELL_ASSETS = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const staticDestination = ['script', 'style', 'image', 'font', 'worker'].includes(request.destination);
  const staticPath = url.pathname.startsWith('/assets/') || url.pathname === '/sw.js';
  const navigation = request.mode === 'navigate';
  if (request.method !== 'GET' || url.origin !== self.location.origin || (!staticDestination && !staticPath && !navigation)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && (staticDestination || staticPath || navigation)) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(navigation ? '/' : request, copy));
        }
        return response;
      })
      .catch(() => navigation ? caches.match('/') : caches.match(request)),
  );
});
