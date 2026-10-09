import type { ConsentDescription } from "@cloudflare/workers-oauth-provider";
import { escapeHtml } from "./html";
import { MCP_AUTHORIZE_PATH, MCP_SCOPE, MCP_ADD_SCOPE } from "./mcp-auth";

/**
 * アプリ本体と同じ面・文字・アクセントの階層を持つ、依存なしの単独ページ用スタイル。
 * 値は `app/globals.css` の semantic token (surface-base / surface-elevated / text-* / accent /
 * border-default / error) をそのまま写したもので、CSP が `style-src 'unsafe-inline'` のみのため
 * このページ内に閉じて持つ。ライト/ダークは prefers-color-scheme に従う。
 */
const MCP_PAGE_STYLE =
  ":root{color-scheme:light dark;--bg:#fafaf9;--card:#fff;--strong:#292524;--default:#57534e;--muted:#78716c;--border:#e7e5e4;--accent:#0f766e;--accent-hover:#115e59;--on-accent:#fff;--danger:#e11d48;--subtle:#f5f5f4}" +
  "@media(prefers-color-scheme:dark){:root{--bg:#09090b;--card:#18181b;--strong:#e4e4e7;--default:#d4d4d8;--muted:#a1a1aa;--border:#27272a;--accent:#5eead4;--accent-hover:#99f6e4;--on-accent:#09090b;--danger:#fb7185;--subtle:#27272a}}" +
  "*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--default);font:14px/1.7 system-ui,-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif}" +
  "main{max-width:40rem;margin:0 auto;padding:1.5rem 1rem 3rem}" +
  "h1{margin:0 0 1rem;font-size:1.25rem;line-height:1.4;font-weight:600;color:var(--strong)}" +
  "p{margin:.5rem 0}strong{color:var(--strong)}" +
  "a{color:var(--accent);text-underline-offset:2px}a:hover{color:var(--accent-hover)}" +
  ".card{background:var(--card);border:1px solid var(--border);border-radius:.75rem;padding:1rem 1.25rem;margin:1rem 0}" +
  "dl{margin:0}dt{margin-top:.75rem;font-size:12px;color:var(--muted)}dt:first-child{margin-top:0}dd{margin:.125rem 0 0;color:var(--strong);overflow-wrap:anywhere}dd p{margin:.25rem 0}" +
  ".note{font-size:12px;color:var(--muted)}.note p{margin:.375rem 0}" +
  ".actions{display:flex;flex-wrap:wrap;gap:.5rem;margin:1.25rem 0 .5rem}" +
  "button{min-height:44px;padding:.5rem 1rem;border-radius:.5rem;border:1px solid var(--border);background:var(--card);color:var(--strong);font:inherit;font-weight:600;cursor:pointer}" +
  "button:hover{background:var(--subtle)}" +
  "button.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}button.primary:hover{background:var(--accent-hover);border-color:var(--accent-hover)}" +
  "button.danger{border-color:var(--danger);color:var(--danger)}" +
  ":focus-visible{outline:2px solid var(--strong);outline-offset:2px}" +
  "nav{display:flex;flex-wrap:wrap;gap:.25rem 1rem;margin-top:1rem;font-size:13px}nav a{display:inline-block;padding:.5rem 0}" +
  "@media(max-width:480px){.actions button{flex:1 1 100%}}";

/** MCP の単独 HTML ページ共通の外枠。title / bodyHtml は呼び出し側で escape 済みの HTML。 */
export function renderMcpPage(title: string, bodyHtml: string, headHtml = ""): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">${headHtml}<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${MCP_PAGE_STYLE}</style></head><body><main><h1>${title}</h1>${bodyHtml}</main></body></html>`;
}

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
  // Script is blocked by the CSP and a 303 to the client is blocked by form-action 'self',
  // so a zero-delay meta refresh in a new document carries the browser to the client.
  const href = escapeHtml(new URL(redirectTo).href);
  const autoRedirect =
    label === "アプリへ戻る" ? `<meta http-equiv="refresh" content="0;url=${href}">` : "";
  return renderMcpPage(
    "RSS読み取り連携の続き",
    `<div class="card"><p>送信内容を受け付けました。自動で移動しない場合は、下のリンクから続けてください。</p><p><a href="${href}" rel="noreferrer">${escapeHtml(label)}</a></p></div><nav><a href="/">RSSに戻る</a></nav>`,
    autoRedirect,
  );
}

export function renderMcpScopeDescriptions(scopes: readonly string[]): string {
  return [
    ...(scopes.includes(MCP_SCOPE)
      ? ["rss:read: 購読一覧と、現在購読中のフィードに保存されている記事"]
      : []),
    ...(scopes.includes(MCP_ADD_SCOPE)
      ? [
          "rss:subscriptions:add: 公開RSS・Atom・JSON Feedの新しい購読を追加。既存設定の変更・削除、非公開フィードや認証情報の入力は不可",
        ]
      : []),
  ]
    .map((text) => `<p>${escapeHtml(text)}</p>`)
    .join("");
}
export function renderMcpPermissionDetails(scopes: readonly string[]): string {
  return `${scopes.includes(MCP_SCOPE) ? "<p>非公開・認証付きフィードや成人向けフィードを購読している場合、その保存済み記事本文も読み取り対象になります。</p>" : ""}<p>個人メモ、既読・お気に入り履歴、保存クリップ、認証情報は共有しません。</p>${scopes.includes(MCP_ADD_SCOPE) ? "<p>追加権限を持つ接続は、このアカウントの購読一覧を変更し、新しい公開フィードを追加できます。既存購読の変更・削除や記事編集はできません。</p>" : "<p>購読や記事は編集できません。</p>"}`;
}

export function renderMcpConsent(
  description: ConsentDescription,
  handle: string,
  userId: string | null,
): string {
  const text = (value: string) => escapeHtml(value.slice(0, 512));
  const addsSubscriptions = description.scope.includes(MCP_ADD_SCOPE);
  const account = userId
    ? `<p>接続するRSSアカウント: <strong>${text(userId)}</strong></p>`
    : "<p>ログイン後、RSSアカウントを確認してもう一度許可してください。</p>";
  return renderMcpPage(
    "RSS読み取り連携の確認",
    `<p><strong>${text(description.clientName)}</strong> ${addsSubscriptions ? "がRSSの購読追加を含む連携を求めています。" : "がRSSの読み取りを求めています。"}</p><div class="card"><dl><dt>クライアントのドメイン</dt><dd>${text(description.clientDomain ?? "未確認のクライアント名")}</dd><dt>認証後の戻り先ホスト</dt><dd>${text(description.redirectHost)}</dd><dt>許可する範囲</dt><dd>${renderMcpScopeDescriptions(description.scope)}</dd></dl></div>${description.redirectIsLoopback ? "<p>ローカルアプリへの接続です。この戻り先には別のローカルプロセスが待機している可能性があります。</p>" : ""}${account}${renderMcpPermissionDetails(description.scope)}<form method="post" action="${MCP_AUTHORIZE_PATH}"><input type="hidden" name="handle" value="${text(handle)}"><div class="actions"><button class="primary" name="decision" value="${userId ? "approve" : "login"}" type="submit">${userId ? (addsSubscriptions ? "このアカウントで購読追加の連携を許可" : "このアカウントで読み取りを許可") : "この連携を確認して0g0 IDでログイン"}</button> <button name="decision" value="deny" type="submit">許可しない</button></div></form><div class="note"><p>アクセストークンは15分。30日間更新されない接続は失効します。更新されている接続は継続します。</p><p>RSS側の接続解除後は新しい処理とトークン更新を拒否します。すでに開始した読み取りや購読追加は取り消せない場合があります。ChatGPT側だけの接続解除では即時のRSS側失効を保証しません。</p></div><nav><a href="/api/mcp/settings">RSS側の連携設定・接続解除</a><a href="/">RSSに戻る</a></nav>`,
  );
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
