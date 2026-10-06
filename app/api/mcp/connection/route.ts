import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import {
  canonicalMcpOrigin,
  cleanupMcpGrants,
  disconnectMcpConnection,
  isMcpEnabled,
  MCP_ACCESS_TOKEN_TTL,
  MCP_REFRESH_TOKEN_TTL,
  MCP_SCOPE,
  readMcpConnection,
} from "@/lib/mcp-auth";
import { secureMcpBrowserHeaders } from "@/lib/mcp-auth-ui";

function secured(response: NextResponse): NextResponse {
  secureMcpBrowserHeaders(response.headers);
  return response;
}
export async function GET(request: Request): Promise<NextResponse> {
  return secured(
    await withSession(request, async ({ session, env }) => {
      if (!isMcpEnabled(env) || !env.OAUTH_PROVIDER)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      const { state } = await readMcpConnection(env.RSS_DATA, session.userId);
      return NextResponse.json({
        active: state?.active ?? false,
        scope: (state?.approvedScopes ?? [MCP_SCOPE]).join(" "),
        approvedScopes: state?.approvedScopes ?? [MCP_SCOPE],
        updatedAt: state?.updatedAt ?? null,
        accessTokenLifetimeSeconds: MCP_ACCESS_TOKEN_TTL,
        refreshIdleLifetimeSeconds: MCP_REFRESH_TOKEN_TTL,
        disconnectScope: "All MCP connections for this RSS account",
        limitation:
          "ChatGPT-side disconnect alone does not guarantee immediate RSS-side revocation; already-started reads or subscription additions cannot necessarily be cancelled.",
      });
    }),
  );
}
export async function DELETE(request: Request): Promise<NextResponse> {
  return secured(
    await withSession(request, async ({ session, env }) => {
      if (!isMcpEnabled(env) || !env.OAUTH_PROVIDER)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      const origin = canonicalMcpOrigin(env.APP_BASE_URL ?? process.env.APP_BASE_URL ?? "");
      if (request.headers.get("origin") !== origin)
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (request.headers.get("X-RSS-Account-Id") !== session.userId)
        return NextResponse.json(
          { error: "Account changed. Reload connection settings." },
          { status: 409 },
        );
      const state = await disconnectMcpConnection(env.RSS_DATA, session.userId);
      const cleanupComplete = await cleanupMcpGrants(
        env.OAUTH_PROVIDER,
        session.userId,
        state.updatedAt,
      );
      return NextResponse.json({ active: false, updatedAt: state.updatedAt, cleanupComplete });
    }),
  );
}
