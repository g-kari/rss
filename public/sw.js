const CACHE = 'rss-v1';

// インストール: アプリシェルをキャッシュ
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['/', '/index.html'])).catch(() => {})
  );
  self.skipWaiting();
});

// 有効化: 古いキャッシュを削除
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// フェッチ: API はネットワーク優先、静的リソースはキャッシュ優先
self.addEventListener('fetch', (e) => {
  const { pathname } = new URL(e.request.url);
  if (pathname.startsWith('/api/')) {
    // API: ネットワークのみ
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      });
      return cached ?? network;
    })
  );
});
