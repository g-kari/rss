import { test, expect } from '@playwright/test';

/**
 * feed-discovery.ts の extractFeedLinkFromHtml ロジックの単体テスト。
 *
 * RSS 2.0 / Atom / JSON Feed の <link rel="alternate"> タグを
 * HTML から正しく発見できることを検証する。
 */

// extractFeedLinkFromHtml は private なので、同等のロジックをインライン再現して検証する
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
        return new URL(m[1], baseUrl).toString();
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
