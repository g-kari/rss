import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * nonce ベース CSP を実装するミドルウェア。
 *
 * リクエストごとにランダムな nonce を生成し、Content-Security-Policy ヘッダーに埋め込む。
 * Next.js は `script-src` の `'nonce-...'` を自動検出して、インライン script 要素に
 * `nonce` 属性を付与するため、`'unsafe-inline'` なしで CSP が機能する。
 *
 * ref: next/dist/server/app-render/get-script-nonce-from-header.js
 */

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // nonce でインラインスクリプトを許可。'unsafe-inline' を削除。
    // Cloudflare Web Analytics (beacon) は static.cloudflareinsights.com から外部読込。
    `script-src 'self' 'nonce-${nonce}' https://static.cloudflareinsights.com`,
    // スタイル: Tailwind のインライン style は 'unsafe-inline' が必要
    "style-src 'self' 'unsafe-inline'",
    // 画像: self のみ（外部画像は /api/image-proxy 経由）
    "img-src 'self'",
    // iframe: YouTube・Spotify・Twitch・ニコニコ・X (Twitter) 等の埋め込み
    [
      "frame-src",
      "https://www.youtube.com",
      "https://youtube.com",
      "https://www.youtube-nocookie.com",
      "https://youtube-nocookie.com",
      "https://open.spotify.com",
      "https://player.vimeo.com",
      "https://w.soundcloud.com",
      "https://player.twitch.tv",
      "https://clips.twitch.tv",
      "https://embed.nicovideo.jp",
      "https://embed.zenn.studio",
      "https://platform.twitter.com",
    ].join(" "),
    // メディア: HTTPS のみ（ポッドキャスト等）
    "media-src https:",
    // API / Cloudflare Analytics 送信先
    "connect-src 'self' https://cloudflareinsights.com",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function middleware(_request: NextRequest): NextResponse {
  // crypto.randomUUID() は Workers / Edge Runtime 両方で利用可能
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

// 静的アセット・API ルートには CSP ミドルウェアを適用しない
export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon|api/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
