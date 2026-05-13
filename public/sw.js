const CACHE_VERSION = "rss-v4";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-page`;
const API_CACHE = `${CACHE_VERSION}-api`;

const API_CACHE_TTL_MS = 5 * 60 * 1000; // 5分

// stale-while-revalidate でキャッシュする API パス（前方一致）
// NOTE: /api/auth/me はレートリミット（5秒クールダウン）があるため含めない。
// 認証エンドポイントは常にネットワーク優先で取得し、オフライン時のみキャッシュにフォールバックする。
const API_CACHE_PATHS = ["/api/articles", "/api/feeds"];

// ネットワーク優先でオフライン時のみキャッシュにフォールバックする API パス（前方一致）
// /api/auth/me: レートリミットとの衝突を避けるため stale-while-revalidate に含めない
const API_NETWORK_FIRST_PATHS = ["/api/auth/me"];

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

/** キャッシュされたレスポンスが TTL 内かを判定 */
function isCacheFresh(response) {
  const cached = response.headers.get("sw-cached-at");
  if (!cached) return false;
  return Date.now() - Number(cached) < API_CACHE_TTL_MS;
}

/** レスポンスに sw-cached-at タイムスタンプを付与してキャッシュ用に複製 */
function stampResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("sw-cached-at", String(Date.now()));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const { pathname } = new URL(e.request.url);

  // 記事・フィード API: stale-while-revalidate with TTL
  if (API_CACHE_PATHS.some((p) => pathname.startsWith(p))) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(API_CACHE);
        const cached = await cache.match(e.request);

        const networkPromise = fetch(e.request)
          .then((res) => {
            if (res.ok) cache.put(e.request, stampResponse(res.clone()));
            return res;
          })
          .catch(() => null);

        if (cached && isCacheFresh(cached)) {
          // TTL 内: キャッシュを即座に返しつつ、バックグラウンドでネットワーク更新
          e.waitUntil(networkPromise);
          return cached;
        }

        // TTL 切れまたはキャッシュなし: ネットワーク優先
        const res = await networkPromise;
        if (res) return res;

        // ネットワーク失敗時は古いキャッシュをフォールバックとして使用
        if (cached) return cached;

        // 完全オフライン + キャッシュなし: 空レスポンスを返す
        return new Response(JSON.stringify([]), {
          status: 503,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      })(),
    );
    return;
  }

  // 認証 API: ネットワーク優先、オフライン時のみキャッシュにフォールバック
  // stale-while-revalidate を使わないことでレートリミット（5秒クールダウン）との衝突を防ぐ
  if (API_NETWORK_FIRST_PATHS.some((p) => pathname.startsWith(p))) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(API_CACHE);
        try {
          const res = await fetch(e.request);
          if (res.ok) cache.put(e.request, stampResponse(res.clone()));
          return res;
        } catch {
          // オフライン時: キャッシュにフォールバック
          const cached = await cache.match(e.request);
          if (cached) return cached;
          return new Response(JSON.stringify({ user: null }), {
            status: 503,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        }
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
// メッセージング: クライアントからのキャッシュ無効化指示
// -------------------------------------------------------------------------

self.addEventListener("message", (e) => {
  if (e.data?.type === "INVALIDATE_API_CACHE") {
    e.waitUntil(
      caches.open(API_CACHE).then((cache) => {
        const paths = e.data.paths;
        if (!paths || !Array.isArray(paths)) {
          return cache.keys().then((reqs) => Promise.all(reqs.map((r) => cache.delete(r))));
        }
        return cache.keys().then((reqs) => {
          const toDelete = reqs.filter((r) => {
            const { pathname } = new URL(r.url);
            return paths.some((p) => pathname.startsWith(p));
          });
          return Promise.all(toDelete.map((r) => cache.delete(r)));
        });
      }),
    );
  }
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
      for (const client of windowClients) {
        try {
          if (new URL(client.url).origin === self.location.origin) {
            return client.focus();
          }
        } catch {
          // URL パース失敗は無視
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
