/* Vocab PWA service worker — offline-first */
const VERSION = 'v8';
const APP_CACHE = `vocab-app-${VERSION}`;
const RUNTIME_CACHE = `vocab-runtime-${VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

// Nhận lệnh SKIP_WAITING từ index.html để kích hoạt SW mới ngay lập tức
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Trả cache ngay (nhanh + offline), đồng thời tải bản mới ở nền để lần mở sau được cập nhật.
function staleWhileRevalidate(event, cacheName, cacheKey) {
  const request = event.request;
  return caches.open(cacheName).then((cache) =>
    cache.match(cacheKey || request, { ignoreSearch: !!cacheKey }).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(cacheKey || request, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return network.then((res) => res || Response.error());
    })
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Sheets & Apps Script (Sync) luôn đi thẳng ra mạng, không cache để lấy dữ liệu mới nhất
  if (url.hostname === 'docs.google.com' || url.hostname === 'script.google.com' || url.hostname.endsWith('googleusercontent.com')) return;

  // Font Google: cache lại sau lần tải đầu để dùng offline
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(event, RUNTIME_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Mở trang: ưu tiên mạng (Network-First) để luôn nhận bản index.html mới nhất, offline thì lấy cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) caches.open(APP_CACHE).then((c) => c.put('./index.html', res.clone()));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(staleWhileRevalidate(event, APP_CACHE));
});
