import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // レガシーな XSS フィルター（IE/旧 Safari）を明示的に無効化する。
    // Chrome v78 以降はこのヘッダーを完全削除済みで影響なし。
    // 一方、有効にするとフィルター自体が情報漏洩に悪用されるリスクがあるため 0 を設定する。
    // XSS 対策は Content-Security-Policy で行う。
    key: "X-XSS-Protection",
    value: "0",
  },
  {
    // クロスオリジンのウィンドウが opener 参照を通じて本ウィンドウを操作するのを防ぐ。
    // OAuth2 フローは popup ではなくリダイレクトを使用しているため safe。
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // スクリプト: self + インラインは Next.js hydration に必要
      // unsafe-eval は Next.js v13+ の本番ビルドでは不要。
      // eval()/new Function() を明示的に禁止することで XSS リスクを低減する。
      // static.cloudflareinsights.com: Cloudflare Web Analytics が自動注入する beacon スクリプト
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
      // スタイル: self + インライン（Tailwind）
      "style-src 'self' 'unsafe-inline'",
      // 画像: 任意ドメイン（記事サムネイル）+ data URI
      "img-src * data: blob:",
      // iframe: YouTube・Spotify・Twitch・ニコニコ・X (Twitter) 等の埋め込み許可
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://open.spotify.com https://player.vimeo.com https://w.soundcloud.com https://player.twitch.tv https://clips.twitch.tv https://embed.nicovideo.jp https://embed.zenn.studio https://platform.twitter.com",
      // メディア: 任意（ポッドキャスト）
      "media-src *",
      // API / WebSocket: self + Cloudflare Web Analytics のデータ送信先
      "connect-src 'self' https://cloudflareinsights.com",
      // フォント: self
      "font-src 'self'",
      // オブジェクト禁止
      "object-src 'none'",
      // ベース URI: self のみ
      "base-uri 'self'",
      // フォーム: self のみ
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
