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
  // favicon.ts は canvas.toBlob() + URL.createObjectURL() で Blob URL を使用するため data: 不要。
  // blob: は createObjectURL で生成した URL の読み込みに必要（同一オリジン内のみ有効、XSS リスクなし）。
  "img-src 'self' blob:",
  FRAME_SRC,
  // ポッドキャスト等のメディアは HTTPS のみ
  "media-src https:",
  // Cloudflare Analytics 送信先 + Piper TTS engine の voice / wasm fetch 先 (#761)
  // - huggingface.co: API endpoint (model metadata 取得 → redirect で *.hf.co の CDN へ)
  // - *.hf.co: HuggingFace Xet/LFS CDN (例: cas-bridge.xethub.hf.co、cdn-lfs.hf.co)
  //   モデル本体 (.onnx / config.json) は huggingface.co から redirect でこの subdomain 経由配信される。
  //   subdomain ワイルドカードで将来の CDN ドメイン変更にも自動対応。
  // - cdn.jsdelivr.net / cdnjs.cloudflare.com: piper-plus が internal で参照する場合の保険
  "connect-src 'self' https://cloudflareinsights.com https://huggingface.co https://*.hf.co https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
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
  //
  // `'wasm-unsafe-eval'` は Chrome 95+ で WebAssembly.compile / instantiate / instantiateStreaming
  // を許可するための専用 source (#761 Piper TTS engine の onnxruntime-web + Rust phonemizer 用)。
  // `'unsafe-eval'` (任意 eval 許可) より遥かに狭い WASM 専用緩和なので XSS 攻撃面を最小化できる。
  return `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://static.cloudflareinsights.com; ${STATIC_CSP_SUFFIX}`;
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
