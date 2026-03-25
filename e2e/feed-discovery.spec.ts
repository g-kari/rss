import { test, expect } from '@playwright/test';
import { isValidFeedUrl } from '../src/lib/url';

/**
 * feed-discovery.ts の extractFeedLinkFromHtml ロジックの単体テスト。
 *
 * RSS 2.0 / Atom / JSON Feed の <link rel="alternate"> タグを
 * HTML から正しく発見できることを検証する。
 */

// extractFeedLinkFromHtml は private なので、同等のロジックをインライン再現して検証する
// 注意: 実装と同様に isValidFeedUrl による SSRF 対策チェックを含む
function extractFeedLinkFromHtml(html: string, baseUrl: string): string | null {
  const patternTypeFirst =
    /<link[^>]+type=["']application\/(?:(?:rss|atom)\+xml|feed\+json)["'][^>]+href=["']([^"']+)["'][^>]*\/?>/gi;
  const patternHrefFirst =
    /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/(?:(?:rss|atom)\+xml|feed\+json)["'][^>]*\/?>/gi;

  for (const pattern of [patternTypeFirst, patternHrefFirst]) {
    pattern.lastIndex = 0;
    const m = pattern.exec(html);
    if (m?.[1]) {
      try {
        const resolved = new URL(m[1], baseUrl).toString();
        // SSRF 対策: プライベートIPへのアクセスを拒否
        if (!isValidFeedUrl(resolved)) continue;
        return resolved;
      } catch {
        continue;
      }
    }
  }
  return null;
}

test.describe('feed-discovery — HTML <link> タグからのフィード URL 発見', () => {
  test('RSS 2.0: type-first パターンを検出する', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml">
    </head><body></body></html>`;
    const result = extractFeedLinkFromHtml(html, 'https://example.com/');
    expect(result).toBe('https://example.com/feed.xml');
  });

  test('Atom: type-first パターンを検出する', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/atom+xml" href="/atom.xml">
    </head><body></body></html>`;
    const result = extractFeedLinkFromHtml(html, 'https://example.com/blog/');
    expect(result).toBe('https://example.com/atom.xml');
  });

  test('JSON Feed: type-first パターンを検出する', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/feed+json" href="/feed.json">
    </head><body></body></html>`;
    const result = extractFeedLinkFromHtml(html, 'https://example.com/');
    expect(result).toBe('https://example.com/feed.json');
  });

  test('RSS 2.0: href-first パターンを検出する', () => {
    const html = `<html><head>
      <link href="/rss" rel="alternate" type="application/rss+xml">
    </head><body></body></html>`;
    const result = extractFeedLinkFromHtml(html, 'https://example.com/');
    expect(result).toBe('https://example.com/rss');
  });

  test('JSON Feed: href-first パターンを検出する', () => {
    const html = `<html><head>
      <link href="/feed.json" rel="alternate" type="application/feed+json" title="JSON Feed">
    </head><body></body></html>`;
    const result = extractFeedLinkFromHtml(html, 'https://example.com/');
    expect(result).toBe('https://example.com/feed.json');
  });

  test('絶対 URL の href はそのまま返す', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/feed+json" href="https://cdn.example.com/feed.json">
    </head><body></body></html>`;
    const result = extractFeedLinkFromHtml(html, 'https://example.com/');
    expect(result).toBe('https://cdn.example.com/feed.json');
  });

  test('CSS など無関係な <link> はマッチしない', () => {
    const html = `<html><head>
      <link rel="stylesheet" href="/style.css" type="text/css">
      <link rel="icon" href="/favicon.ico">
    </head><body></body></html>`;
    const result = extractFeedLinkFromHtml(html, 'https://example.com/');
    expect(result).toBeNull();
  });

  test('フィード <link> が見つからなければ null を返す', () => {
    const html = '<html><head><title>Test</title></head><body><p>Hello</p></body></html>';
    const result = extractFeedLinkFromHtml(html, 'https://example.com/');
    expect(result).toBeNull();
  });
});

test.describe('feed-discovery — SSRF 対策: プライベート IP への href を拒否', () => {
  test('ループバック 127.0.0.1 への RSS リンクを拒否する', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="http://127.0.0.1/feed.xml">
    </head></html>`;
    const result = extractFeedLinkFromHtml(html, 'https://example.com/');
    expect(result).toBeNull();
  });

  test('プライベート IP 192.168.x.x への RSS リンクを拒否する', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="http://192.168.1.1/feed">
    </head></html>`;
    const result = extractFeedLinkFromHtml(html, 'https://example.com/');
    expect(result).toBeNull();
  });

  test('プライベート IP 10.x.x.x への Atom リンクを拒否する', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/atom+xml" href="http://10.0.0.1/atom.xml">
    </head></html>`;
    const result = extractFeedLinkFromHtml(html, 'https://example.com/');
    expect(result).toBeNull();
  });

  test('localhost への JSON Feed リンクを拒否する', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/feed+json" href="http://localhost/feed.json">
    </head></html>`;
    const result = extractFeedLinkFromHtml(html, 'https://example.com/');
    expect(result).toBeNull();
  });

  test('プライベート IP の相対パスリンク（baseUrl がプライベート）を拒否する', () => {
    // baseUrl 自体が有効でも href の解決先がプライベートになる場合
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="/feed.xml">
    </head></html>`;
    // baseUrl がプライベート IP の場合、解決後の URL もプライベートになる
    const result = extractFeedLinkFromHtml(html, 'http://192.168.1.1/');
    expect(result).toBeNull();
  });

  test('公開 URL への RSS リンクは通常通り返す（SSRF 対策で正常ケースを壊さない）', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="https://cdn.example.com/rss.xml">
    </head></html>`;
    const result = extractFeedLinkFromHtml(html, 'https://example.com/');
    expect(result).toBe('https://cdn.example.com/rss.xml');
  });
});
