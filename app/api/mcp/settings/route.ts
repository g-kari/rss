import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { escapeHtml } from "@/lib/html";
import {
  canonicalMcpOrigin,
  cleanupMcpGrants,
  disconnectMcpConnection,
  isMcpEnabled,
  readMcpConnection,
  MCP_SCOPE,
  MCP_ADD_SCOPE,
} from "@/lib/mcp-auth";
import {
  readMcpBrowserForm,
  secureMcpBrowserHeaders,
  renderMcpScopeDescriptions,
  renderMcpPage,
  renderMcpPermissionDetails,
} from "@/lib/mcp-auth-ui";

function secured(response: NextResponse): NextResponse {
  secureMcpBrowserHeaders(response.headers);
  return response;
}
function page(
  userId: string,
  active: boolean,
  updatedAt: string | null,
  disconnected = false,
  scopes: string[] = [MCP_SCOPE],
): NextResponse {
  const body = renderMcpPage(
    "RSS連携の設定",
    `${disconnected ? '<p role="status">このRSSアカウントの連携を解除しました。</p>' : ""}<div class="card"><dl><dt>RSSアカウント</dt><dd>${escapeHtml(userId)}</dd><dt>連携状態</dt><dd>${active ? "有効" : "無効"}</dd><dt>更新日時</dt><dd>${escapeHtml(updatedAt ?? "未接続")}</dd><dt>許可範囲</dt><dd>${renderMcpScopeDescriptions(scopes)}</dd></dl></div>${renderMcpPermissionDetails(scopes)}<form method="post" action="/api/mcp/settings"><input type="hidden" name="account" value="${escapeHtml(userId)}"><div class="actions"><button class="danger" type="submit">このRSSアカウントの${scopes.includes(MCP_ADD_SCOPE) ? "すべての連携" : "すべての読み取り連携"}を解除</button></div></form><div class="note"><p>再接続には新しい明示的な許可が必要です。</p><p>アクセストークンは15分。30日間更新されない接続は失効します。更新されている接続は継続します。</p><p>RSS側の接続解除後は新しい処理とトークン更新を拒否します。すでに開始した読み取りや購読追加は取り消せない場合があります。ChatGPT側だけの接続解除では即時のRSS側失効を保証しません。</p></div><nav><a href="/">RSSに戻る</a></nav>`,
  );
  return new NextResponse(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
export async function GET(request: Request): Promise<NextResponse> {
  return secured(
    await withSession(request, async ({ session, env }) => {
      if (!isMcpEnabled(env) || !env.OAUTH_PROVIDER)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      const { state } = await readMcpConnection(env.RSS_DATA, session.userId);
      return page(
        session.userId,
        state?.active ?? false,
        state?.updatedAt ?? null,
        false,
        state?.approvedScopes ?? [MCP_SCOPE],
      );
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
