// ============================================================================
// service-worker.js — offline caching + update detection for Carfolio.
//
// CACHE_VERSION is stamped automatically on every push to main by
// .github/workflows/deploy.yml (it replaces __CACHE_VERSION__ with the
// short commit SHA before deploying). That's what makes the "update
// available" banner work reliably: every deploy produces a service worker
// with different bytes, so browsers always notice.
//
// Running locally without going through that workflow (e.g. `python3 -m
// http.server`)? The placeholder string stays literal, which is fine — it
// just means local testing won't trigger update-detection on its own. If
// you need to force it while testing locally, temporarily edit the line
// below to any different string and reload.
// ============================================================================

const CACHE_VERSION = '__CACHE_VERSION__';
const CACHE_NAME = `carfolio-v${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/store.js',
  './js/reminders.js',
  './js/gauge.js',
  './js/ics.js',
  './js/dialogs.js',
  './js/pwa.js',
  './js/banner.js',
  './js/install-prompt.js',
  './js/vehicle-lookup.js',
  './js/dateutil.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-64.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
    // Deliberately no skipWaiting() here — the new worker waits until the
    // user confirms the "update available" prompt (see js/pwa.js), so a
    // page mid-use never gets swapped out from under it unexpectedly.
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Lets the page tell a waiting worker to take over immediately once the
// user clicks "Refresh" in the update banner.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    // Cross-origin (e.g. Google Fonts) — let the browser handle it normally,
    // this app never depends on those loading for core functionality.
    return;
  }

  const isNavigation = request.mode === 'navigate';

  if (isNavigation) {
    // Network-first for the page itself, so a family member on wifi always
    // gets the latest shell if it's reachable; falls back to cache offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache-first for everything else (css/js/icons) — fast, and correct
  // because CACHE_VERSION changes whenever these files change.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
