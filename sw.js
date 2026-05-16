const CACHE_NAME = 'downshear-v2'; // ← naikkan versi saat update
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// Install: cache static assets
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting()) // ← langsung aktif tanpa reload
    );
});

// Activate: hapus cache lama  ← FIX BARU
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch: network first untuk Google Sheets, cache first untuk static
self.addEventListener('fetch', e => {
    const url = e.request.url;

    // Google Sheets & Apps Script → selalu network (data dinamis)
    if (url.includes('docs.google.com') || url.includes('script.google.com')) {
        e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
        return;
    }

    // Static assets → cache first, fallback network
    e.respondWith(
        caches.match(e.request).then(res => res || fetch(e.request))
    );
});
