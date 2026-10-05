// Native Worker-only entry: Next route modules import mcp-auth.ts without cloudflare:workers.
import OAuthProvider, {
  OAuthError,
  type OAuthProviderOptions,
} from "@cloudflare/workers-oauth-provider";
import {
  assertMcpConnection,
  canonicalMcpOrigin,
  isMcpEnabled,
  MCP_ACCESS_TOKEN_TTL,
  MCP_AUTHORIZE_PATH,
  MCP_PATH,
  MCP_REFRESH_TOKEN_TTL,
  MCP_SCOPE,
  MCP_TOKEN_PATH,
  McpConnectionError,
  validateMcpAuthProps,
} from "./mcp-auth";

export function mcpOAuthOptions(
  apiHandler: NonNullable<OAuthProviderOptions<CloudflareEnv>["apiHandler"]>,
  defaultHandler: OAuthProviderOptions<CloudflareEnv>["defaultHandler"],
  appBaseUrl: string,
): OAuthProviderOptions<CloudflareEnv> {
  const origin = canonicalMcpOrigin(appBaseUrl);
  return {
    apiRoute: `${origin}${MCP_PATH}`,
    apiHandler,
    defaultHandler,
    authorizeEndpoint: `${origin}${MCP_AUTHORIZE_PATH}`,
    tokenEndpoint: `${origin}${MCP_TOKEN_PATH}`,
    accessTokenTTL: MCP_ACCESS_TOKEN_TTL,
    refreshTokenTTL: MCP_REFRESH_TOKEN_TTL,
    refreshTokenIdleTTL: MCP_REFRESH_TOKEN_TTL,
    scopesSupported: [MCP_SCOPE],
    requiredScopes: [MCP_SCOPE],
    clientIdMetadataDocumentEnabled: true,
    allowTokenExchangeGrant: false,
    allowPrivateUseRedirectUris: false,
    cookiePrefix: "__Host-rss-mcp-",
    resourceMetadata: {
      resource: `${origin}${MCP_PATH}`,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
      resource_name: "RSS Reader read-only subscriptions and articles",
    },
    tokenExchangeCallback: async (options) => {
      if (
        !isMcpEnabled(options.env) ||
        (options.grantType !== "authorization_code" && options.grantType !== "refresh_token") ||
        options.resource !== `${origin}${MCP_PATH}` ||
        options.scope.length !== 1 ||
        options.scope[0] !== MCP_SCOPE ||
        options.requestedScope.length !== 1 ||
        options.requestedScope[0] !== MCP_SCOPE ||
        validateMcpAuthProps(options.props)?.userId !== options.userId
      )
        throw new OAuthError("invalid_grant", {
          description: "Read-only connection is not authorized",
        });
      try {
        await assertMcpConnection(options.env.RSS_DATA, options.props, options.env);
      } catch (error) {
        if (error instanceof McpConnectionError && error.code !== "MCP_STORAGE_INVALID")
          throw new OAuthError("invalid_grant", {
            description: "Read-only connection was disconnected or is unavailable to this account",
          });
        throw new OAuthError("temporarily_unavailable", {
          description: "Connection validation is temporarily unavailable",
          statusCode: 503,
          headers: { "Retry-After": "30" },
        });
      }
      return { accessTokenScope: [MCP_SCOPE] };
    },
  };
}
export function createMcpOAuthProvider(
  apiHandler: NonNullable<OAuthProviderOptions<CloudflareEnv>["apiHandler"]>,
  defaultHandler: OAuthProviderOptions<CloudflareEnv>["defaultHandler"],
  appBaseUrl: string,
): OAuthProvider<CloudflareEnv> {
  return new OAuthProvider(mcpOAuthOptions(apiHandler, defaultHandler, appBaseUrl));
}
