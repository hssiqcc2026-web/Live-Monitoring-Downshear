// ── HSSI Downshear Monitoring — Service Worker ──
const CACHE_NAME = 'hssi-ds-v2';

// File yang di-cache untuk offline support
const PRECACHE_URLS = [
  './',
  './index.html'
];

// Install: pre-cache shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // Abaikan error jika file tidak ada (development mode)
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: hapus cache lama
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first untuk data Google Sheets & Apps Script,
//        cache-first untuk asset statis
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Selalu ke network untuk: Google Sheets CSV, Apps Script, CDN scripts
  const networkOnly = [
    'docs.google.com',
    'script.google.com',
    'cdn.tailwindcss.com',
    'unpkg.com',
    'cdn.jsdelivr.net',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
  ];

  if (networkOnly.some(domain => url.includes(domain))) {
    // Network only — jangan cache data eksternal
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Cache-first untuk asset lokal
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        // Cache response yang valid
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback
      return caches.match('./index.html');
    })
  );
});
