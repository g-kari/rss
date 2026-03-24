const CACHE_VERSION = 'rss-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-page`;

// インストール: 即座に有効化
self.addEventListener('install', () => {
  self.skipWaiting();
});

// 有効化: 旧バージョンのキャッシュを全て削除
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const { pathname } = new URL(e.request.url);

  // API: ネットワークのみ（記事・フィードは常に最新を取得）
  if (pathname.startsWith('/api/')) return;

  // Next.js 静的アセット (content-addressed): キャッシュ優先
  if (pathname.startsWith('/_next/static/') || pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.match(e.request).then(
        (cached) =>
          cached ??
          fetch(e.request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(e.request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  // HTML ナビゲーション: ネットワーク優先、失敗時キャッシュにフォールバック
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(e.request)
            .then((cached) => cached ?? caches.match('/'))
            .then(
              (cached) =>
                cached ??
                new Response(
                  '<html><body style="font-family:sans-serif;padding:2rem;background:#18181b;color:#e4e4e7"><h1>オフライン</h1><p>インターネット接続を確認してください。</p></body></html>',
                  { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                )
            )
        )
    );
    return;
  }

  // その他のリソース: ネットワーク優先、失敗時キャッシュ
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((cached) => cached ?? Response.error()))
  );
});
