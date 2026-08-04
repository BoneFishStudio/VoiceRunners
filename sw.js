/* ============================
   SW.JS — Service Worker Voice Runner (PWA)
   ============================
   Strategi: cache-first dengan update di background (stale-while-revalidate).

   PENTING:
   - Hanya menangani GET same-origin (asset statis: index.html, js/, css/,
     assets/, Music/). Request cross-origin (Firebase realtime, gstatic SDK,
     Google Fonts) TIDAK disentuh.
   - Mikrofon (navigator.mediaDevices.getUserMedia) BUKAN request fetch,
     jadi izin mic tidak pernah di-cache/di-mock oleh service worker ini.
   - Musik (Music/*.mp3) di-cache agar bisa dimuat offline/cepat, tapi tetap
     boleh gagal (ada generated music fallback di audio.js).
   */

const CACHE_NAME = 'voice-runner-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/audio.js',
  './js/multiplayer.js',
  './js/game.js',
  './manifest.json',
  './favicon.ico',
  './assets/icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/runner_sprite.png'
];

// Instal: cache asset inti, langsung aktifkan (skipWaiting)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] install cache partial:', err))
  );
});

// Aktifkan: buang cache versi lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch:
// - Asset MUTABLE (HTML, JS, CSS, JSON) → NETWORK-FIRST + fallback cache.
//   Ini PENTING: file JS/CSS tidak di-hash, jadi kalau cache-first, pemain
//   yang kembali bakal terus dapat versi lama (masalah "domain tidak update"
//   yang sudah diperbaiki di vercel.json akan balik lagi).
// - Asset STATIS (gambar, musik, favicon) → cache-first + update background.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Skip cross-origin (Firebase realtime, gstatic SDK, Google Fonts, dll)
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isMutable = path === '/' || path.endsWith('/') || /\.(html?|js|css|json)$/i.test(path);

  if (isMutable) {
    // Network-first: selalu coba ambil versi baru, offline → pakai cache
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => caches.match(req))
    );
  } else {
    // Cache-first untuk media statis
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((response) => {
            if (response && response.status === 200 && response.type === 'basic') {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});
