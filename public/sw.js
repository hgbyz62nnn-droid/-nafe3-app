// Service worker: caches the static app shell so the app still opens
// offline. Network-first (not cache-first) - the app ships updates
// constantly, so a visitor with a live connection must always get the
// current code; the cache is only a fallback for when the network fails.
// Bump CACHE on any app-shell change so old entries get swept in activate().
const CACHE = 'traino-v2';
const APP_SHELL = ['/', '/styles.css', '/app.js', '/features.js', '/i18n.js', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
