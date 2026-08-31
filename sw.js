/* ============================================================
   4조 2교대 근무표 — Service Worker
   앱 셸 프리캐시 → 완전 오프라인 동작 (cache-first)
   갱신하려면 CACHE_VERSION 숫자를 올리세요.
   ============================================================ */

var CACHE_VERSION = 'v11';
var CACHE_NAME = 'shift-shell-' + CACHE_VERSION;
var FONT_CACHE = 'shift-fonts-' + CACHE_VERSION;

/* 상대경로만 사용 (GitHub Pages 서브경로 대응) */
var SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.json',
  './crew.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

var FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // 개별 실패(예: 아이콘 미배치)가 설치 전체를 막지 않도록 하나씩 처리
      return Promise.all(SHELL.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_NAME && k !== FONT_CACHE) return caches.delete(k);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  /* 구글 폰트: 런타임 cache-first (첫 로드 후 오프라인에서도 유지) */
  if (FONT_ORIGINS.indexOf(url.origin) !== -1) {
    event.respondWith(
      caches.open(FONT_CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
          }).catch(function () {
            return new Response('', { status: 504, statusText: 'offline' });
          });
        });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  /* 앱 셸: cache-first, 없으면 네트워크 후 캐시 저장 */
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        // 네비게이션 요청은 항상 앱 셸로 폴백 (오프라인 진입 보장)
        if (req.mode === 'navigate') {
          return caches.match('./index.html', { ignoreSearch: true }).then(function (idx) {
            return idx || caches.match('./', { ignoreSearch: true });
          });
        }
        return new Response('', { status: 504, statusText: 'offline' });
      });
    })
  );
});
