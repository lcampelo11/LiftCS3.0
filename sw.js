const CACHE_NAME = 'localshelf-pwa-v6';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key.indexOf('localshelf-pwa-') === 0 && key !== CACHE_NAME;
        }).map(function(oldKey) {
          return caches.delete(oldKey);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // Nunca interceptar chamadas de API (Supabase, Gemini, BrasilAPI, OpenStreetMap)
  if (url.hostname.indexOf('supabase.co') >= 0 || url.hostname.indexOf('googleapis.com') >= 0) {
    return;
  }

  // Navegacao / index.html: Network-First com fallback offline no cache
  if (req.mode === 'navigate' || (url.origin === self.location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')))) {
    event.respondWith(
      fetch(req).then(function(networkRes) {
        if (networkRes && networkRes.ok) {
          var clone = networkRes.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(req, clone); });
        }
        return networkRes;
      }).catch(function() {
        return caches.match(req).then(function(cached) {
          return cached || caches.match('./index.html') || caches.match('./');
        });
      })
    );
    return;
  }

  // Assets locais do mesmo dominio: Cache-First com atualizacao em segundo plano
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(function(cached) {
        var fetchPromise = fetch(req).then(function(networkRes) {
          if (networkRes && networkRes.ok) {
            var clone = networkRes.clone();
            caches.open(CACHE_NAME).then(function(cache) { cache.put(req, clone); });
          }
          return networkRes;
        }).catch(function() { return cached; });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Bibliotecas CDN (jsPDF, Chart.js, pdf.js, SheetJS, Supabase JS): Cache-First apos primeiro uso
  if (url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(req).then(function(cached) {
        if (cached) return cached;
        return fetch(req).then(function(networkRes) {
          if (networkRes && networkRes.ok) {
            var clone = networkRes.clone();
            caches.open(CACHE_NAME).then(function(cache) { cache.put(req, clone); });
          }
          return networkRes;
        });
      })
    );
  }
});
