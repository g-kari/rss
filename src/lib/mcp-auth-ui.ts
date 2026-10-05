import type { ConsentDescription } from "@cloudflare/workers-oauth-provider";
import { escapeHtml } from "./html";
import { MCP_AUTHORIZE_PATH } from "./mcp-auth";

export function secureMcpBrowserHeaders(headers: Headers): void {
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
}

/** A new document breaks form-submission redirects without widening form-action. */
export function renderMcpNavigation(
  redirectTo: string,
  verifiedRedirectUri: string,
  label: "アプリへ戻る" | "ログインへ進む",
): string {
  const target = new URL(redirectTo);
  const verified = new URL(verifiedRedirectUri);
  const browserUrl = (url: URL) =>
    !url.username &&
    !url.password &&
    !url.hash &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" &&
        (url.hostname === "localhost" ||
          url.hostname === "[::1]" ||
          /^127(?:\.\d{1,3}){3}$/.test(url.hostname))));
  if (!browserUrl(target) || !browserUrl(verified)) throw new Error("Invalid MCP navigation");
  // Only OAuth response fields may differ from the provider-validated callback.
  // The first-party login URI is constructed by the server and supplied as both values.
  for (const key of ["code", "state", "iss", "error", "error_description", "error_uri"]) {
    target.searchParams.delete(key);
    verified.searchParams.delete(key);
  }
  if (target.href !== verified.href) throw new Error("MCP navigation target changed");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RSS読み取り連携の続き</title></head><body style="font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem;line-height:1.6"><main><h1>RSS読み取り連携の続き</h1><p>送信内容を受け付けました。下のリンクから続けてください。</p><p><a href="${escapeHtml(new URL(redirectTo).href)}" rel="noreferrer">${escapeHtml(label)}</a></p><p><a href="/">RSSに戻る</a></p></main></body></html>`;
}

export function renderMcpConsent(
  description: ConsentDescription,
  handle: string,
  userId: string | null,
): string {
  const text = (value: string) => escapeHtml(value.slice(0, 512));
  const account = userId
    ? `<p>接続するRSSアカウント: <strong>${text(userId)}</strong></p>`
    : "<p>ログイン後、RSSアカウントを確認してもう一度許可してください。</p>";
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RSS読み取り連携の確認</title></head><body style="font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem;line-height:1.6"><main><h1>RSS読み取り連携の確認</h1><p><strong>${text(description.clientName)}</strong> がRSSの読み取りを求めています。</p><dl><dt>クライアントのドメイン</dt><dd>${text(description.clientDomain ?? "未確認のクライアント名")}</dd><dt>認証後の戻り先ホスト</dt><dd>${text(description.redirectHost)}</dd><dt>許可する範囲</dt><dd>rss:read: 購読一覧と、現在購読中のフィードに保存されている記事</dd></dl>${description.redirectIsLoopback ? "<p>ローカルアプリへの接続です。この戻り先には別のローカルプロセスが待機している可能性があります。</p>" : ""}${account}<p>非公開・認証付きフィードや成人向けフィードを購読している場合、その保存済み記事本文も対象になります。個人メモ、既読・お気に入り履歴、保存クリップ、認証情報は共有しません。購読や記事は編集できません。</p><p>アクセストークンは15分。30日間更新されない接続は失効します。更新されている接続は継続します。</p><p>RSS側の接続解除後は新しい読み取りと更新を拒否します。処理中の読み取りは取り消せません。ChatGPT側だけの接続解除では即時のRSS側失効を保証しません。</p><form method="post" action="${MCP_AUTHORIZE_PATH}"><input type="hidden" name="handle" value="${text(handle)}"><button name="decision" value="${userId ? "approve" : "login"}" type="submit">${userId ? "このアカウントで読み取りを許可" : "この読み取り連携を確認して0g0 IDでログイン"}</button> <button name="decision" value="deny" type="submit">許可しない</button></form><p><a href="/api/mcp/settings">RSS側の連携設定・接続解除</a></p><p><a href="/">RSSに戻る</a></p></main></body></html>`;
}

/** Browser forms have strict byte budgets even when Content-Length is absent or forged. */
export async function readMcpBrowserForm(
  request: Request,
  maxBytes: number,
): Promise<URLSearchParams | null> {
  if (
    request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !==
    "application/x-www-form-urlencoded"
  )
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new URLSearchParams(new TextDecoder().decode(bytes));
}
export async function readMcpConsentForm(
  request: Request,
): Promise<{ handle: string; decision: string } | null> {
  const form = await readMcpBrowserForm(request, 4_096);
  if (
    !form ||
    form.getAll("handle").length !== 1 ||
    form.getAll("decision").length !== 1 ||
    [...form.keys()].some((key) => key !== "handle" && key !== "decision")
  )
    return null;
  return { handle: form.get("handle")!, decision: form.get("decision")! };
}
