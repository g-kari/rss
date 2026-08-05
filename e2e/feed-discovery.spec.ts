import { test, expect } from "@playwright/test";
import { extractFeedLinkFromHtml, isGenericJsonFeedResponse } from "../src/lib/feed-discovery";

/**
 * feed-discovery.ts の extractFeedLinkFromHtml ロジックの単体テスト。
 *
 * RSS 2.0 / Atom / JSON Feed の <link rel="alternate"> タグを
 * HTML から正しく発見できることを検証する。
 */

test.describe("feed-discovery — HTML <link> タグからのフィード URL 発見", () => {
  test("RSS 2.0: type-first パターンを検出する", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml">
    </head><body></body></html>`;
    const result = extractFeedLinkFromHtml(html, "https://example.com/");
    expect(result).toBe("https://example.com/feed.xml");
  });

  test("Atom: type-first パターンを検出する", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/atom+xml" href="/atom.xml">
    </head><body></body></html>`;
    const result = extractFeedLinkFromHtml(html, "https://example.com/blog/");
    expect(result).toBe("https://example.com/atom.xml");
  });

  test("JSON Feed: type-first パターンを検出する", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/feed+json" href="/feed.json">
    </head><body></body></html>`;
    const result = extractFeedLinkFromHtml(html, "https://example.com/");
    expect(result).toBe("https://example.com/feed.json");
  });

  test("RSS 2.0: href-first パターンを検出する", () => {
    const html = `<html><head>
      <link href="/rss" rel="alternate" type="application/rss+xml">
    </head><body></body></html>`;
    const result = extractFeedLinkFromHtml(html, "https://example.com/");
    expect(result).toBe("https://example.com/rss");
  });

  test("JSON Feed: href-first パターンを検出する", () => {
    const html = `<html><head>
      <link href="/feed.json" rel="alternate" type="application/feed+json" title="JSON Feed">
    </head><body></body></html>`;
    const result = extractFeedLinkFromHtml(html, "https://example.com/");
    expect(result).toBe("https://example.com/feed.json");
  });

  test("RSS: charset パラメータ付き type-first パターンを検出する", () => {
    const html = `<link type="application/rss+xml; charset=utf-8" href="/rss.xml" rel="alternate">`;
    expect(extractFeedLinkFromHtml(html, "https://example.com/")).toBe(
      "https://example.com/rss.xml",
    );
  });

  test("Atom: MIME パラメータ付き href-first パターンを検出する", () => {
    const html = `<link href="/atom.xml" rel="alternate" type="application/atom+xml; profile=full">`;
    expect(extractFeedLinkFromHtml(html, "https://example.com/")).toBe(
      "https://example.com/atom.xml",
    );
  });

  test("JSON Feed: charset パラメータ付き type を検出する", () => {
    const html = `<link rel="alternate" type="application/feed+json;charset=UTF-8" href="/feed.json">`;
    expect(extractFeedLinkFromHtml(html, "https://example.com/")).toBe(
      "https://example.com/feed.json",
    );
  });

  test("MIME 本体に余分な文字が付く type は検出しない", () => {
    const html = `<link type="application/rss+xmlfoo; charset=utf-8" href="/rss.xml" rel="alternate">`;
    expect(extractFeedLinkFromHtml(html, "https://example.com/")).toBeNull();
  });

  test("絶対 URL の href はそのまま返す", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/feed+json" href="https://cdn.example.com/feed.json">
    </head><body></body></html>`;
    const result = extractFeedLinkFromHtml(html, "https://example.com/");
    expect(result).toBe("https://cdn.example.com/feed.json");
  });

  test("CSS など無関係な <link> はマッチしない", () => {
    const html = `<html><head>
      <link rel="stylesheet" href="/style.css" type="text/css">
      <link rel="icon" href="/favicon.ico">
    </head><body></body></html>`;
    const result = extractFeedLinkFromHtml(html, "https://example.com/");
    expect(result).toBeNull();
  });

  test("フィード <link> が見つからなければ null を返す", () => {
    const html = "<html><head><title>Test</title></head><body><p>Hello</p></body></html>";
    const result = extractFeedLinkFromHtml(html, "https://example.com/");
    expect(result).toBeNull();
  });
});

test.describe("feed-discovery — SSRF 対策: プライベート IP への href を拒否", () => {
  test("ループバック 127.0.0.1 への RSS リンクを拒否する", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="http://127.0.0.1/feed.xml">
    </head></html>`;
    const result = extractFeedLinkFromHtml(html, "https://example.com/");
    expect(result).toBeNull();
  });

  test("プライベート IP 192.168.x.x への RSS リンクを拒否する", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="http://192.168.1.1/feed">
    </head></html>`;
    const result = extractFeedLinkFromHtml(html, "https://example.com/");
    expect(result).toBeNull();
  });

  test("プライベート IP 10.x.x.x への Atom リンクを拒否する", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/atom+xml" href="http://10.0.0.1/atom.xml">
    </head></html>`;
    const result = extractFeedLinkFromHtml(html, "https://example.com/");
    expect(result).toBeNull();
  });

  test("localhost への JSON Feed リンクを拒否する", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/feed+json" href="http://localhost/feed.json">
    </head></html>`;
    const result = extractFeedLinkFromHtml(html, "https://example.com/");
    expect(result).toBeNull();
  });

  test("プライベート IP の相対パスリンク（baseUrl がプライベート）を拒否する", () => {
    // baseUrl 自体が有効でも href の解決先がプライベートになる場合
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="/feed.xml">
    </head></html>`;
    // baseUrl がプライベート IP の場合、解決後の URL もプライベートになる
    const result = extractFeedLinkFromHtml(html, "http://192.168.1.1/");
    expect(result).toBeNull();
  });

  test("公開 URL への RSS リンクは通常通り返す（SSRF 対策で正常ケースを壊さない）", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="https://cdn.example.com/rss.xml">
    </head></html>`;
    const result = extractFeedLinkFromHtml(html, "https://example.com/");
    expect(result).toBe("https://cdn.example.com/rss.xml");
  });
});

test.describe("feed-discovery — application/json の JSON Feed 判定", () => {
  test("charset 付き application/json の JSON Feed を認識する", () => {
    const body = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Example Feed",
      items: [],
    });
    expect(isGenericJsonFeedResponse("application/json; charset=utf-8", body)).toBe(true);
  });

  test("通常の JSON API レスポンスは認識しない", () => {
    expect(isGenericJsonFeedResponse("application/json", '{"status":"ok","items":[]}')).toBe(false);
  });

  test("jsonfeed.org を偽装した別ホストの version は認識しない", () => {
    const body = JSON.stringify({
      version: "https://evil.example/?target=jsonfeed.org/version/1.1",
      items: [],
    });
    expect(isGenericJsonFeedResponse("application/json", body)).toBe(false);
  });

  test("壊れた JSON は認識しない", () => {
    const body = '{"version":"https://jsonfeed.org/version/1.1","items":[';
    expect(isGenericJsonFeedResponse("application/json", body)).toBe(false);
  });

  test("JSON Feed 本文でも application/json 以外は対象にしない", () => {
    const body = JSON.stringify({ version: "https://jsonfeed.org/version/1.1", items: [] });
    expect(isGenericJsonFeedResponse("text/plain", body)).toBe(false);
  });
});
