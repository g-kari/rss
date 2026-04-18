/**
 * デモページ用の fetch インターセプト。
 * `/api/*` へのリクエストを横取りしてモックレスポンスを返す。
 * それ以外の URL は通常通り fetch する。
 */

const USER = {
  id: "demo-user",
  sub: "demo-user",
  email: "demo@example.com",
  name: "デモユーザー",
  picture: null,
};

const NOW = Date.now();
const ISO = (offsetMs: number) => new Date(NOW - offsetMs).toISOString();

const FEEDS = [
  {
    id: "aaaa1111aaaa1111",
    url: "https://zenn.dev/topics/react/feed",
    siteUrl: "https://zenn.dev",
    title: "Zenn - React",
    lastFetchedAt: ISO(10 * 60 * 1000),
    fetchError: null,
    category: "技術",
    priority: "high" as const,
    groupId: "group-tech",
  },
  {
    id: "bbbb2222bbbb2222",
    url: "https://blog.cloudflare.com/rss",
    siteUrl: "https://blog.cloudflare.com",
    title: "Cloudflare Blog",
    lastFetchedAt: ISO(15 * 60 * 1000),
    fetchError: null,
    category: "技術",
    groupId: "group-tech",
  },
  {
    id: "cccc3333cccc3333",
    url: "https://www.itmedia.co.jp/rss/2.0/news_bursts.xml",
    siteUrl: "https://www.itmedia.co.jp",
    title: "ITmedia ニュース速報",
    lastFetchedAt: ISO(5 * 60 * 1000),
    fetchError: null,
    category: "ニュース",
    groupId: "group-news",
  },
  {
    id: "dddd4444dddd4444",
    url: "https://gigazine.net/news/rss_2.0/",
    siteUrl: "https://gigazine.net",
    title: "GIGAZINE",
    lastFetchedAt: ISO(8 * 60 * 1000),
    fetchError: null,
    category: "ニュース",
    groupId: "group-news",
  },
  {
    id: "eeee5555eeee5555",
    url: "https://example.com/random",
    siteUrl: "https://example.com",
    title: "分類なしフィード（とても長いタイトルが入るときの見切れ確認用サンプル）",
    lastFetchedAt: ISO(20 * 60 * 1000),
    fetchError: null,
  },
];

const FEED_GROUPS = [
  {
    id: "group-tech",
    name: "テックブログ",
    order: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "group-news",
    name: "ニュース",
    order: 1,
    createdAt: "2026-01-02T00:00:00.000Z",
  },
];

const ARTICLES = [
  {
    id: "art-1",
    feedHash: "aaaa1111aaaa1111",
    title: "React 19 の新機能と移行ガイド",
    url: "https://example.com/1",
    summary: "React 19 で追加された useOptimistic / use() / Actions など。",
    content: "<p>React 19 で追加された新機能の解説記事です。</p>",
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    author: "rico",
    categories: ["React", "Frontend"],
  },
  {
    id: "art-2",
    feedHash: "aaaa1111aaaa1111",
    title: "Next.js 16 への移行で気をつけたこと",
    url: "https://example.com/2",
    summary: "Turbopack / App Router / proxy ファイル規約。",
    publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "art-3",
    feedHash: "bbbb2222bbbb2222",
    title: "Cloudflare Workers で Durable Objects を使いこなす",
    url: "https://example.com/3",
    summary: "強い一貫性が必要なユースケースでの採用例。",
    publishedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "art-4",
    feedHash: "cccc3333cccc3333",
    title: "今日のニュース速報: AI 市場の最新動向",
    url: "https://example.com/4",
    summary: "各社が大型モデルをリリース。",
    publishedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    id: "art-5",
    feedHash: "dddd4444dddd4444",
    title: "気になる新ガジェット 10 選",
    url: "https://example.com/5",
    summary: "",
    publishedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
  },
  {
    id: "art-6",
    feedHash: "eeee5555eeee5555",
    title: "サンプル記事（分類なしフィード）",
    url: "https://example.com/6",
    summary: "分類なしフィードからの記事例。",
    publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const READ_STATE = {
  readIds: ["art-3"],
  bookmarkIds: ["art-1", "art-4"],
  readingListIds: ["art-2"],
  likeIds: ["art-1"],
  snoozedUntil: {},
  notes: {},
  globalFilter: null,
  readBeforeTimestamp: null,
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function handle(url: URL, init: RequestInit | undefined): Response | null {
  const path = url.pathname;
  const method = init?.method?.toUpperCase() ?? "GET";

  if (path === "/api/auth/me") return json({ user: USER });
  if (path === "/api/feeds" && method === "GET") return json(FEEDS);
  if (path === "/api/articles" && method === "GET") return json(ARTICLES);
  if (path === "/api/read-state" && method === "GET") return json(READ_STATE);
  if (path === "/api/read-state" && method === "POST") return json({ ok: true });
  if (path === "/api/feed-groups" && method === "GET") return json(FEED_GROUPS);
  if (path === "/api/recommendations") return json([]);
  if (path === "/api/engagement") return json({});
  if (path === "/api/stats") return json({ daily: [], yearly: [], byFeed: [] });
  if (path === "/api/push/status") return json({ subscribed: false });
  if (path === "/api/push/vapid-key") return json({ key: null });
  if (path === "/api/release-notes") return json({ markdown: "# Demo" });
  if (path === "/api/health") return json({ ok: true });

  // 書き込み系はすべて成功扱い
  if (path.startsWith("/api/")) return json({ ok: true });

  return null;
}

// window.fetch の置き換えは HMR で複数回走ると二重ラップされるため、
// 元の native fetch を一度だけグローバルに保存してから常に新しいハンドラで上書きする。
const GLOBAL_KEY = "__demoFetchOriginal" as const;

type GlobalWithFetch = typeof globalThis & Record<typeof GLOBAL_KEY, typeof fetch | undefined>;

/**
 * `/demo` パス配下でのみ API モックを有効化する。
 * client-side navigation で他パスに移動した際は元のレスポンスを通すため、
 * インターセプター内で毎回 pathname を確認する。
 */
export function installDemoFetch() {
  const g = globalThis as GlobalWithFetch;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = window.fetch.bind(window);
  }
  const originalFetch = g[GLOBAL_KEY]!;

  window.fetch = async (input, init) => {
    try {
      const urlStr =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      const url = new URL(urlStr, window.location.origin);
      const isDemo = window.location.pathname.startsWith("/demo");
      if (isDemo && url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
        const res = handle(url, init);
        if (res) return res;
      }
    } catch {
      // URL パース失敗時はフォールスルー
    }
    return originalFetch(input as RequestInfo, init);
  };
}
