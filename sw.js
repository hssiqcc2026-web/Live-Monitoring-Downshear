// HSSI Downshear Monitoring — Service Worker v4
const CACHE_NAME = 'hssi-ds-v4';

// ── Install ──
self.addEventListener('install', function(e) {
    console.log('[SW] Install v4');
    // Langsung aktif tanpa tunggu tab lama tutup
    self.skipWaiting();
});

// ── Activate ──
self.addEventListener('activate', function(e) {
    console.log('[SW] Activate v4');
    e.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(k) { return k !== CACHE_NAME; })
                    .map(function(k) { return caches.delete(k); })
            );
        }).then(function() {
            // Ambil alih semua tab yang sudah terbuka
            return self.clients.claim();
        })
    );
});

// ── Fetch — WAJIB ada agar Chrome menganggap SW valid untuk PWA ──
self.addEventListener('fetch', function(e) {
    var url = e.request.url;

    // Selalu network untuk data Google Sheets & CDN
    var skipCache = [
        'docs.google.com',
        'script.google.com',
        'cdn.tailwindcss.com',
        'unpkg.com',
        'cdn.jsdelivr.net',
        'fonts.googleapis.com',
        'fonts.gstatic.com'
    ];

    if (skipCache.some(function(d) { return url.indexOf(d) !== -1; })) {
        e.respondWith(
            fetch(e.request).catch(function() {
                return new Response('Network error', { status: 503 });
            })
        );
        return;
    }

    // Network-first untuk asset lokal (supaya update selalu fresh)
    e.respondWith(
        fetch(e.request).then(function(response) {
            // Clone & simpan ke cache
            if (response && response.status === 200) {
                var clone = response.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                    cache.put(e.request, clone);
                });
            }
            return response;
        }).catch(function() {
            // Offline fallback: ambil dari cache
            return caches.match(e.request).then(function(cached) {
                return cached || new Response('Offline', { status: 503 });
            });
        })
    );
});
