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
    // 不要な強力 API を明示的に無効化。RSS リーダーとして使用しない機能を列挙して攻撃面を削減する。
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "bluetooth=()",
      "display-capture=()",
      "accelerometer=()",
      "gyroscope=()",
      "magnetometer=()",
    ].join(", "),
  },
  {
    // Adobe Flash / PDF プラグインが本サイトのコンテンツをクロスドメインで読み取るのを禁止する。
    key: "X-Permitted-Cross-Domain-Policies",
    value: "none",
  },
  {
    // クロスオリジンのリクエストによるリソース読み取りを禁止する（Spectre 対策）。
    // same-origin: 同一オリジンのリクエストのみリソースへのアクセスを許可する。
    // 攻撃者サイトから no-cors モードで /api/* をフェッチしても Response body を取得できない。
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Content-Security-Policy は middleware.ts でリクエストごとに nonce 付きで設定する。
  // 'unsafe-inline' を nonce に置き換えて XSS 保護を強化するため、ここでは設定しない。
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
  // Piper wasm engine (#674 Phase 2b) — `@mintplex-labs/piper-tts-web` は内部で
  // `onnxruntime-web` を chunk import するため、Next.js Turbopack が dynamic chunk
  // 解決に失敗するケースがある。transpilePackages で明示的に Next.js transformer
  // を通すことで `dist/piper-XXXX.js` 等の sub-chunk が解決される。
  // ESM only / browser only library なので serverExternalPackages からは除外
  // (server-side では dynamic import 自体が実行されないので影響なし)。
  transpilePackages: ["@mintplex-labs/piper-tts-web", "onnxruntime-web"],
};

export default nextConfig;
