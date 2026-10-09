import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { escapeHtml } from "@/lib/html";
import {
  canonicalMcpOrigin,
  cleanupMcpGrants,
  disconnectMcpConnection,
  isMcpEnabled,
  readMcpConnection,
} from "@/lib/mcp-auth";
import { readMcpBrowserForm, secureMcpBrowserHeaders } from "@/lib/mcp-auth-ui";

function secured(response: NextResponse): NextResponse {
  secureMcpBrowserHeaders(response.headers);
  return response;
}
function page(
  userId: string,
  active: boolean,
  updatedAt: string | null,
  disconnected = false,
): NextResponse {
  const body = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RSS読み取り連携の設定</title></head><body style="font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem;line-height:1.6"><main><h1>RSS読み取り連携の設定</h1>${disconnected ? '<p role="status">このRSSアカウントの読み取り連携を解除しました。</p>' : ""}<dl><dt>RSSアカウント</dt><dd>${escapeHtml(userId)}</dd><dt>連携状態</dt><dd>${active ? "有効" : "無効"}</dd><dt>更新日時</dt><dd>${escapeHtml(updatedAt ?? "未接続")}</dd><dt>許可範囲</dt><dd>rss:read: 購読一覧と、現在購読中のフィードに保存されている記事</dd></dl><p>非公開・認証付きフィードや成人向けフィードを購読している場合、その保存済み記事本文も対象になります。個人メモ、既読・お気に入り履歴、保存クリップ、認証情報は共有しません。編集権限はありません。</p><p>アクセストークンは15分。30日間更新されない接続は失効します。更新されている接続は継続します。</p><p>RSS側の接続解除後は新しい読み取りとトークン更新を拒否します。処理中の読み取りは取り消せません。ChatGPT側だけの接続解除では即時のRSS側失効を保証しません。</p><form method="post" action="/api/mcp/settings"><input type="hidden" name="account" value="${escapeHtml(userId)}"><button type="submit">このRSSアカウントのすべての読み取り連携を解除</button></form><p>再接続には新しい読み取り許可が必要です。</p><p><a href="/">RSSに戻る</a></p></main></body></html>`;
  return new NextResponse(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
export async function GET(request: Request): Promise<NextResponse> {
  return secured(
    await withSession(request, async ({ session, env }) => {
      if (!isMcpEnabled(env) || !env.OAUTH_PROVIDER)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      const { state } = await readMcpConnection(env.RSS_DATA, session.userId);
      return page(session.userId, state?.active ?? false, state?.updatedAt ?? null);
    }),
  );
}
export async function POST(request: Request): Promise<NextResponse> {
  return secured(
    await withSession(request, async ({ session, env }) => {
      if (!isMcpEnabled(env) || !env.OAUTH_PROVIDER)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      const origin = canonicalMcpOrigin(env.APP_BASE_URL ?? process.env.APP_BASE_URL ?? "");
      if (new URL(request.url).origin !== origin || request.headers.get("origin") !== origin)
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      // The form contains only a bounded first-party account identity, never OAuth tokens.
      const form = await readMcpBrowserForm(request, 512);
      if (!form) return NextResponse.json({ error: "Invalid form" }, { status: 400 });
      if (
        form.getAll("account").length !== 1 ||
        [...form.keys()].some((key) => key !== "account") ||
        form.get("account") !== session.userId
      )
        return NextResponse.json(
          { error: "Account changed. Reload connection settings." },
          { status: 409 },
        );
      const state = await disconnectMcpConnection(env.RSS_DATA, session.userId);
      await cleanupMcpGrants(env.OAUTH_PROVIDER, session.userId, state.updatedAt);
      return page(session.userId, false, state.updatedAt, true);
    }),
  );
}
