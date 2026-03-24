import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

initOpenNextCloudflareForDev();

const securityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // スクリプト: self + インラインは Next.js hydration に必要
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // スタイル: self + インライン（Tailwind）
      "style-src 'self' 'unsafe-inline'",
      // 画像: 任意ドメイン（記事サムネイル）+ data URI
      "img-src * data: blob:",
      // iframe: YouTube・Spotify・Twitch・ニコニコ等の埋め込み許可
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://open.spotify.com https://player.vimeo.com https://w.soundcloud.com https://player.twitch.tv https://clips.twitch.tv https://embed.nicovideo.jp",
      // メディア: 任意（ポッドキャスト）
      "media-src *",
      // API / WebSocket: self のみ
      "connect-src 'self'",
      // フォント: self
      "font-src 'self'",
      // オブジェクト禁止
      "object-src 'none'",
      // ベース URI: self のみ
      "base-uri 'self'",
      // フォーム: self のみ
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
