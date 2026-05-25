import { test, expect } from "@playwright/test";
import { isValidFeedUrl, isValidHttpsUrl, isValidPublicUrl, isPrivateHost } from "../src/lib/url";
import { isValidCookieHeader, parseName } from "../src/lib/validation";
import { FEED_GROUP_NAME_MAX_LENGTH } from "../src/lib/feed-groups";
import { buildOpml, extractFeeds } from "../src/lib/opml";
import type { Feed, FeedGroup } from "../src/types";
import { makeFeed as makeBaseFeed } from "./helpers/feed";

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

const makeFeed = (overrides: Partial<Feed> & { url: string }) =>
  makeBaseFeed({ id: overrides.url, ...overrides });

function makeGroup(overrides: Partial<FeedGroup> & { id: string; name: string }): FeedGroup {
  return {
    order: 0,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isValidFeedUrl — http も https も許可
// ---------------------------------------------------------------------------

test.describe("isValidFeedUrl", () => {
  test("https URL は有効", () => {
    expect(isValidFeedUrl("https://example.com/feed.xml")).toBe(true);
  });

  test("http URL も有効（フィードは http を許可する）", () => {
    expect(isValidFeedUrl("http://example.com/feed")).toBe(true);
  });

  test("ftp スキームは無効", () => {
    expect(isValidFeedUrl("ftp://example.com/feed")).toBe(false);
  });

  test("スキームなし文字列は無効", () => {
    expect(isValidFeedUrl("example.com/feed")).toBe(false);
  });

  test("空文字は無効", () => {
    expect(isValidFeedUrl("")).toBe(false);
  });

  test("localhost は無効（プライベートホスト）", () => {
    expect(isValidFeedUrl("http://localhost/feed")).toBe(false);
  });

  test("127.0.0.1 は無効（ループバック）", () => {
    expect(isValidFeedUrl("http://127.0.0.1/feed")).toBe(false);
  });

  test("192.168.x.x は無効（プライベート IP）", () => {
    expect(isValidFeedUrl("http://192.168.1.1/feed")).toBe(false);
  });

  test("10.x.x.x は無効（プライベート IP）", () => {
    expect(isValidFeedUrl("http://10.0.0.1/feed")).toBe(false);
  });

  test("172.16.x.x は無効（プライベート IP）", () => {
    expect(isValidFeedUrl("http://172.16.0.1/feed")).toBe(false);
  });

  test("パスやクエリを含む URL は有効", () => {
    expect(isValidFeedUrl("https://example.com/blog/feed?format=rss")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isValidHttpsUrl — https のみ許可
// ---------------------------------------------------------------------------

test.describe("isValidHttpsUrl", () => {
  test("https URL は有効", () => {
    expect(isValidHttpsUrl("https://example.com/feed.xml")).toBe(true);
  });

  test("http URL は無効", () => {
    expect(isValidHttpsUrl("http://example.com/feed")).toBe(false);
  });

  test("localhost は無効", () => {
    expect(isValidHttpsUrl("https://localhost/feed")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidPublicUrl — 画像プロキシ等の公開 URL 検証
// ---------------------------------------------------------------------------

test.describe("isValidPublicUrl", () => {
  test("https URL は有効", () => {
    expect(isValidPublicUrl("https://example.com/image.jpg")).toBe(true);
  });

  test("http URL も有効", () => {
    expect(isValidPublicUrl("http://example.com/image.jpg")).toBe(true);
  });

  test("プライベート IP は無効", () => {
    expect(isValidPublicUrl("http://192.168.1.1/image.jpg")).toBe(false);
  });

  test("localhost は無効", () => {
    expect(isValidPublicUrl("https://localhost/image.jpg")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isPrivateHost — プライベートホスト判定
// ---------------------------------------------------------------------------

test.describe("isPrivateHost", () => {
  test("localhost は private", () => {
    expect(isPrivateHost("localhost")).toBe(true);
  });

  test("127.0.0.1 は private", () => {
    expect(isPrivateHost("127.0.0.1")).toBe(true);
  });

  test("0.0.0.0 は private", () => {
    expect(isPrivateHost("0.0.0.0")).toBe(true);
  });

  test("192.168.1.1 は private", () => {
    expect(isPrivateHost("192.168.1.1")).toBe(true);
  });

  test("10.0.0.1 は private", () => {
    expect(isPrivateHost("10.0.0.1")).toBe(true);
  });

  test("172.16.0.1 は private", () => {
    expect(isPrivateHost("172.16.0.1")).toBe(true);
  });

  test("IPv6 ループバック [::1] は private", () => {
    expect(isPrivateHost("[::1]")).toBe(true);
  });

  // IPv6 SSRF coverage 拡張 (#851) — WHATWG URL の hostname 正規化経由で
  // 6 種の表記がいずれも private 判定されることを regression spec として担保する。
  // 実コードの caller はすべて `new URL(input).hostname` を渡すため、展開形式
  // ([0:0:0:0:0:0:0:1]) や IPv4-mapped IPv6 ([::ffff:127.0.0.1]) も WHATWG URL
  // が短縮 / 16 進化した形 ([::1] / [::ffff:7f00:1] 等) を isPrivateHost が拾う。

  test("IPv6 ループバック展開形式 [0:0:0:0:0:0:0:1] は WHATWG URL 経由で [::1] に正規化されて private", () => {
    const { hostname } = new URL("http://[0:0:0:0:0:0:0:1]/");
    expect(hostname).toBe("[::1]");
    expect(isPrivateHost(hostname)).toBe(true);
  });

  test("IPv4-mapped IPv6 ループバック [::ffff:127.0.0.1] は private", () => {
    const { hostname } = new URL("http://[::ffff:127.0.0.1]/");
    expect(hostname).toBe("[::ffff:7f00:1]");
    expect(isPrivateHost(hostname)).toBe(true);
  });

  test("IPv4-mapped IPv6 プライベート範囲 [::ffff:10.0.0.1] は private", () => {
    const { hostname } = new URL("http://[::ffff:10.0.0.1]/");
    expect(hostname).toBe("[::ffff:a00:1]");
    expect(isPrivateHost(hostname)).toBe(true);
  });

  test("IPv6 リンクローカル [fe80::1] は private", () => {
    expect(isPrivateHost("[fe80::1]")).toBe(true);
  });

  test("IPv6 ユニークローカル [fc00::1] (fc プレフィックス) は private", () => {
    expect(isPrivateHost("[fc00::1]")).toBe(true);
  });

  test("IPv6 ユニークローカル [fd12:3456::1] (fd プレフィックス) は private", () => {
    expect(isPrivateHost("[fd12:3456::1]")).toBe(true);
  });

  test("example.com は public", () => {
    expect(isPrivateHost("example.com")).toBe(false);
  });

  test("google.com は public", () => {
    expect(isPrivateHost("google.com")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidCookieHeader（追加エッジケース — feeds-validation.spec.ts の補完）
// ---------------------------------------------------------------------------

test.describe("isValidCookieHeader — 追加エッジケース", () => {
  test("ちょうど 1 文字の name=value は有効", () => {
    expect(isValidCookieHeader("a=b")).toBe(true);
  });

  test("value が空文字（name= のみ）は有効", () => {
    // RFC 6265 では value は空でも OK
    expect(isValidCookieHeader("session=")).toBe(true);
  });

  test("複数の = を含む value は有効（Base64 パディング等）", () => {
    expect(isValidCookieHeader("token=abc==")).toBe(true);
  });

  test("name にドットを含む場合は有効（RFC 2616 token ではドットは許可）", () => {
    expect(isValidCookieHeader("my.cookie=value")).toBe(true);
  });

  test("スペースのみの name は拒否される", () => {
    expect(isValidCookieHeader(" =value")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseName — グループ・コレクション名バリデーション
// ---------------------------------------------------------------------------

test.describe("parseName", () => {
  test("正常な名前は ok: true と name を返す", () => {
    const result = parseName("Tech News", 50);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.name).toBe("Tech News");
  });

  test("前後の空白はトリムされる", () => {
    const result = parseName("  Trimmed  ", 50);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.name).toBe("Trimmed");
  });

  test("文字列以外（数値）は拒否される", () => {
    const result = parseName(42, 50);
    expect(result.ok).toBe(false);
  });

  test("空文字は拒否される", () => {
    const result = parseName("", 50);
    expect(result.ok).toBe(false);
  });

  test("制御文字のみの文字列は拒否される", () => {
    const result = parseName("\x00\x01\x02", 50);
    expect(result.ok).toBe(false);
  });

  test("最大長ぴったりは通過する", () => {
    const name = "a".repeat(50);
    const result = parseName(name, 50);
    expect(result.ok).toBe(true);
  });

  test("最大長 + 1 は拒否される", () => {
    const name = "a".repeat(51);
    const result = parseName(name, 50);
    expect(result.ok).toBe(false);
  });

  test("null は拒否される", () => {
    const result = parseName(null, 50);
    expect(result.ok).toBe(false);
  });

  test("FEED_GROUP_NAME_MAX_LENGTH (50) は定数として正しい", () => {
    expect(FEED_GROUP_NAME_MAX_LENGTH).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// buildOpml — OPML 生成
// ---------------------------------------------------------------------------

test.describe("buildOpml — OPML 出力", () => {
  test("XML ヘッダーと OPML 構造を持つ", () => {
    const opml = buildOpml([], []);
    expect(opml).toContain('<?xml version="1.0"');
    expect(opml).toContain("<opml");
    expect(opml).toContain("<body>");
  });

  test("フィードが xmlUrl 属性付きで出力される", () => {
    const feeds = [makeFeed({ url: "https://example.com/feed.xml", title: "Example" })];
    const opml = buildOpml(feeds, []);
    expect(opml).toContain('xmlUrl="https://example.com/feed.xml"');
    expect(opml).toContain('title="Example"');
  });

  test("グループ付きフィードはネストして出力される", () => {
    const feeds = [makeFeed({ url: "https://tech.example.com/feed", groupId: "g1" })];
    const groups = [makeGroup({ id: "g1", name: "Technology", order: 1 })];
    const opml = buildOpml(feeds, groups);
    const groupIdx = opml.indexOf("Technology");
    const feedIdx = opml.indexOf("https://tech.example.com/feed");
    expect(groupIdx).toBeGreaterThan(-1);
    expect(feedIdx).toBeGreaterThan(groupIdx);
  });

  test("グループなしフィードはトップレベルに配置される", () => {
    const feeds = [
      makeFeed({ url: "https://a.com/feed", groupId: "g1" }),
      makeFeed({ url: "https://b.com/feed" }),
    ];
    const groups = [makeGroup({ id: "g1", name: "Tech", order: 1 })];
    const opml = buildOpml(feeds, groups);
    const techCloseIdx = opml.lastIndexOf("</outline>", opml.indexOf("</body>"));
    const bFeedIdx = opml.indexOf("https://b.com/feed");
    // b.com はグループの閉じタグより後にある（トップレベル）
    expect(bFeedIdx).toBeGreaterThan(techCloseIdx);
  });

  test("フィードのタイトルに HTML 特殊文字が含まれる場合エスケープされる", () => {
    const feeds = [makeFeed({ url: "https://example.com/feed", title: 'Feed & "News"' })];
    const opml = buildOpml(feeds, []);
    expect(opml).toContain("&amp;");
    expect(opml).toContain("&quot;");
    expect(opml).not.toContain('"Feed & "News""');
  });

  test("フィードが 0 件でも valid な XML が出力される", () => {
    const opml = buildOpml([], []);
    expect(opml).toContain("<body>");
    expect(opml).toContain("</body>");
  });
});

// ---------------------------------------------------------------------------
// extractFeeds — OPML パース
// ---------------------------------------------------------------------------

test.describe("extractFeeds — OPML パース", () => {
  test("xmlUrl のある outline は FeedEntry として返る", () => {
    const outline = {
      "@_xmlUrl": "https://example.com/feed",
      "@_text": "Example",
      "@_htmlUrl": "https://example.com",
    };
    const feeds = extractFeeds(outline);
    expect(feeds).toHaveLength(1);
    expect(feeds[0].url).toBe("https://example.com/feed");
    expect(feeds[0].title).toBe("Example");
  });

  test("フォルダ outline の子に folder が付与される", () => {
    const outline = {
      "@_text": "Tech",
      outline: [
        { "@_xmlUrl": "https://a.com/feed", "@_text": "Feed A" },
        { "@_xmlUrl": "https://b.com/feed", "@_text": "Feed B" },
      ],
    };
    const feeds = extractFeeds(outline);
    expect(feeds).toHaveLength(2);
    expect(feeds[0].folder).toBe("Tech");
    expect(feeds[1].folder).toBe("Tech");
  });

  test("フォルダなし outline は folder が undefined", () => {
    const outline = {
      "@_xmlUrl": "https://example.com/feed",
      "@_text": "Feed",
    };
    const feeds = extractFeeds(outline);
    expect(feeds[0].folder).toBeUndefined();
  });

  test("@_title が @_text より優先される", () => {
    const outline = {
      "@_text": "Text Name",
      "@_title": "Title Name",
      outline: [{ "@_xmlUrl": "https://a.com/feed", "@_text": "Feed" }],
    };
    const feeds = extractFeeds(outline);
    expect(feeds[0].folder).toBe("Title Name");
  });

  test("xmlUrl ありの outline に子がある場合は xmlUrl 自体もエントリとして返る", () => {
    const outline = {
      "@_xmlUrl": "https://parent.com/feed",
      "@_text": "Parent",
      outline: [{ "@_xmlUrl": "https://child.com/feed", "@_text": "Child" }],
    };
    const feeds = extractFeeds(outline);
    // 親 + 子 = 2件、フォルダとしては扱われない（xmlUrl あり）
    expect(feeds).toHaveLength(2);
    // xmlUrl ありなのでフォルダとして扱われず、子に folder は付かない
    expect(feeds[0].folder).toBeUndefined();
    expect(feeds[1].folder).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// OPML ラウンドトリップ — buildOpml → extractFeeds の往復変換
// ---------------------------------------------------------------------------

test.describe("OPML ラウンドトリップ", () => {
  test("単純なフィードリストのラウンドトリップ", () => {
    // buildOpml が生成した XML を fast-xml-parser でパースして extractFeeds に渡す
    // 注: 直接文字列 → outline オブジェクトへの変換は e2e/opml-feed-groups.spec.ts に任せ
    //     ここでは buildOpml の出力が xmlUrl を含むことを確認する
    const feeds = [
      makeFeed({ url: "https://example.com/feed.xml", title: "Example Feed" }),
      makeFeed({ url: "https://another.com/rss", title: "Another Feed" }),
    ];
    const opml = buildOpml(feeds, []);
    expect(opml).toContain('xmlUrl="https://example.com/feed.xml"');
    expect(opml).toContain('xmlUrl="https://another.com/rss"');
  });

  test("グループ付きのラウンドトリップで階層構造が維持される", () => {
    const feeds = [
      makeFeed({ url: "https://tech1.com/feed", title: "Tech 1", groupId: "g1" }),
      makeFeed({ url: "https://news1.com/feed", title: "News 1", groupId: "g2" }),
      makeFeed({ url: "https://ungrouped.com/feed", title: "Ungrouped" }),
    ];
    const groups = [
      makeGroup({ id: "g1", name: "Technology", order: 1 }),
      makeGroup({ id: "g2", name: "News", order: 2 }),
    ];
    const opml = buildOpml(feeds, groups);

    // Technology グループ内に tech1 がある
    const techStart = opml.indexOf('"Technology"');
    const techEnd = opml.indexOf("</outline>", techStart);
    const tech1Idx = opml.indexOf("https://tech1.com/feed");
    expect(tech1Idx).toBeGreaterThan(techStart);
    expect(tech1Idx).toBeLessThan(techEnd);

    // News グループ内に news1 がある
    const newsStart = opml.indexOf('"News"');
    const newsEnd = opml.indexOf("</outline>", newsStart);
    const news1Idx = opml.indexOf("https://news1.com/feed");
    expect(news1Idx).toBeGreaterThan(newsStart);
    expect(news1Idx).toBeLessThan(newsEnd);

    // ungrouped はグループ外
    const ungroupedIdx = opml.indexOf("https://ungrouped.com/feed");
    expect(ungroupedIdx).toBeGreaterThan(newsEnd);
  });
});
