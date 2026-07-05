// Service Worker：缓存全部资源，实现离线可用（PWA）
const CACHE = 'zhiji-v2';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/style.css',
  './js/speech.js', './js/store.js', './js/srs.js',
  './js/study.js', './js/review.js', './js/quickflip.js', './js/app.js',
  './data/cet6.js', './data/daily.js', './data/tech.js', './data/jp.js',
  './data/ja_audio.js',
  './icons/icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 缓存优先；命中就用缓存，未命中再联网并顺手缓存；彻底离线时兜底回首页
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((resp) => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
