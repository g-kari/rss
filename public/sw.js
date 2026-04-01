const CACHE_VERSION = "rss-v3";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-page`;
const API_CACHE = `${CACHE_VERSION}-api`;

// stale-while-revalidate でキャッシュする API パス（前方一致）
const API_CACHE_PATHS = ["/api/articles", "/api/feeds"];

// インストール: 即座に有効化
self.addEventListener("install", () => {
  self.skipWaiting();
});

// 有効化: 旧バージョンのキャッシュを全て削除
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const { pathname } = new URL(e.request.url);

  // 記事・フィード API: stale-while-revalidate
  if (API_CACHE_PATHS.some((p) => pathname.startsWith(p))) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(API_CACHE);
        const cached = await cache.match(e.request);

        const networkPromise = fetch(e.request)
          .then((res) => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          })
          .catch(() => null);

        if (cached) {
          // キャッシュを即座に返しつつ、バックグラウンドでネットワーク更新
          e.waitUntil(networkPromise);
          return cached;
        }

        // キャッシュなし: ネットワークを待つ
        const res = await networkPromise;
        if (res) return res;

        // 完全オフライン + キャッシュなし: 空レスポンスを返す
        return new Response(JSON.stringify([]), {
          status: 503,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      })(),
    );
    return;
  }

  // その他の API: ネットワークのみ（認証・コンテンツ取得等は常に最新が必要）
  if (pathname.startsWith("/api/")) return;

  // Next.js 静的アセット (content-addressed): キャッシュ優先
  if (pathname.startsWith("/_next/static/") || pathname.startsWith("/icons/")) {
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
          }),
      ),
    );
    return;
  }

  // HTML ナビゲーション: ネットワーク優先、失敗時キャッシュにフォールバック
  if (e.request.mode === "navigate") {
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
            .then((cached) => cached ?? caches.match("/"))
            .then(
              (cached) =>
                cached ??
                new Response(
                  '<html><body style="font-family:sans-serif;padding:2rem;background:#18181b;color:#e4e4e7"><h1>オフライン</h1><p>インターネット接続を確認してください。</p></body></html>',
                  { headers: { "Content-Type": "text/html; charset=utf-8" } },
                ),
            ),
        ),
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
      .catch(() => caches.match(e.request).then((cached) => cached ?? Response.error())),
  );
});

// -------------------------------------------------------------------------
// Web Push 通知
// -------------------------------------------------------------------------

/** push イベント: サーバーからの通知を受け取り OS 通知を表示する */
self.addEventListener("push", (e) => {
  if (!e.data) return;

  let data = { title: "RSS Reader", body: "新着記事があります", url: "/" };
  try {
    data = { ...data, ...e.data.json() };
  } catch {
    // パース失敗時はデフォルト値を使用
  }

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // 同じタグで上書きすることで通知が積み重なることを防ぐ
      tag: "rss-new-articles",
      renotify: true,
      data: { url: data.url },
    }),
  );
});

/** notificationclick イベント: 通知クリックでアプリを開く */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const rawUrl = e.notification.data?.url ?? "/";

  // VAPID 鍵漏洩時の悪意あるプッシュ通知によるオープンリダイレクト防止。
  // 受信した url が同一オリジンであることを検証し、不正な URL はルートにフォールバックする。
  let url = "/";
  try {
    const parsed = new URL(rawUrl, self.location.origin);
    if (parsed.origin === self.location.origin) {
      url = parsed.href;
    }
  } catch {
    // パース失敗はデフォルト "/" を使用
  }

  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // 既存タブがあればフォーカス
      for (const client of windowClients) {
        try {
          if (new URL(client.url).origin === self.location.origin) {
            return client.focus();
          }
        } catch {
          // URL パース失敗は無視
        }
      }
      // なければ新規タブで開く
      return self.clients.openWindow(url);
    }),
  );
});
