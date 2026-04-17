import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { TRUSTED_IFRAME_RULES } from "./src/lib/html";

// frame-src 許可オリジンを html.ts の TRUSTED_IFRAME_RULES から導出（単一管理）
// 新しい埋め込みソースを追加する場合は TRUSTED_IFRAME_RULES のみ更新する
const FRAME_SRC = [
  "frame-src",
  ...TRUSTED_IFRAME_RULES.flatMap((r) => r.hosts.map((h) => `https://${h}`)),
].join(" ");

// nonce 以外のディレクティブは静的なのでモジュールレベルで一度だけ構築する
const STATIC_CSP_SUFFIX = [
  // Tailwind のインライン style は 'unsafe-inline' が必要
  "style-src 'self' 'unsafe-inline'",
  // 外部画像は /api/image-proxy 経由。
  // data: は favicon.ts が canvas.toDataURL() で動的生成する未読バッジ用 data:image/png を許可するため必要。
  // data: 画像は <img>/<link rel=icon> でスクリプト実行されないため、object-src 'none' と併せて XSS リスクは限定的。
  "img-src 'self' data:",
  FRAME_SRC,
  // ポッドキャスト等のメディアは HTTPS のみ
  "media-src https:",
  // Cloudflare Analytics 送信先
  "connect-src 'self' https://cloudflareinsights.com",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function buildCsp(nonce: string): string {
  // nonce でインラインスクリプトを許可。'unsafe-inline' は不要。
  // Cloudflare Web Analytics (beacon) は static.cloudflareinsights.com から外部読込。
  // Next.js は request ヘッダーの CSP から nonce を読んでインライン script に自動付与する
  // ref: next/dist/server/app-render/get-script-nonce-from-header.js
  return `default-src 'self'; script-src 'self' 'nonce-${nonce}' https://static.cloudflareinsights.com; ${STATIC_CSP_SUFFIX}`;
}

export function middleware(request: NextRequest): NextResponse {
  const nonce = crypto.randomUUID();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
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
