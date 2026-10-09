/** Actual local workerd + synthetic KV/R2 only. No account, production config, real tokens or publisher network. */
import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const wrangler = require.resolve("wrangler/package.json");
const { Miniflare } = await import(require.resolve("miniflare", { paths: [wrangler] }));
const temporary = await mkdtemp(join(tmpdir(), "rss-mcp-add-workerd-offline-"));
let runtime;
let assertions = 0;
const equal = (...args) => {
  assert.equal(...args);
  assertions++;
};
try {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED = "false";
  process.env.WRANGLER_SEND_METRICS = "false";
  const fixture = `
    import { getOAuthApi } from '@cloudflare/workers-oauth-provider';
    import { mcpOAuthOptions } from './src/lib/mcp-provider';
    import { approveMcpConnection, disconnectMcpConnection, MCP_SCOPE, MCP_ADD_SCOPE } from './src/lib/mcp-auth';
    import { routeMcpRequest } from './src/lib/mcp-boundary';
    const ORIGIN = 'https://rss.example';
    const USER = 'synthetic-owner';
    let networkCalls = 0;
    let subscribeEnabled = true;
    let maintenance = false;
    globalThis.fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input.url ?? input.href);
      if (url.origin !== 'https://publisher.com') throw new Error('Unexpected external fetch refused');
      networkCalls++;
      return new Response('<rss version="2.0"><channel><title>Public fixture</title><link>https://publisher.com/</link><description>Offline</description><item><title>Item</title><link>https://publisher.com/item</link></item></channel></rss>', {headers:{'Content-Type':'application/rss+xml'}});
    };
    const handler = { fetch: async () => new Response('not used') };
    export default { async fetch(request, bindings, ctx) {
      const env = {...bindings, APP_BASE_URL:ORIGIN, RSS_MCP_ENABLED:'true', RSS_MCP_SUBSCRIBE_ENABLED:subscribeEnabled ? 'true' : undefined, RSS_FEED_WRITES_PAUSED:maintenance ? 'true' : undefined};
      const url = new URL(request.url);
      if (url.pathname === '/__fixture/token') {
        const scope = url.searchParams.get('kind') === 'read' ? [MCP_SCOPE] : url.searchParams.get('kind') === 'add_only' ? [MCP_ADD_SCOPE] : [MCP_SCOPE, MCP_ADD_SCOPE];
        const helpers = getOAuthApi(mcpOAuthOptions(handler,handler,ORIGIN,true),env);
        const client = await helpers.createClient({clientName:'Offline fixture',redirectUris:['https://client.example/callback'],tokenEndpointAuthMethod:'none',grantTypes:['authorization_code','refresh_token'],responseTypes:['code']});
        const verifier = 'v'.repeat(64);
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
        const challenge = btoa(String.fromCharCode(...digest)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
        const authUrl = new URL('/api/mcp/authorize',ORIGIN);
        for (const [key,value] of Object.entries({client_id:client.clientId,redirect_uri:client.redirectUris[0],response_type:'code',scope:scope.join(' '),resource:ORIGIN+'/mcp',code_challenge:challenge,code_challenge_method:'S256',state:'offline-state'})) authUrl.searchParams.set(key,value);
        const auth = await helpers.parseAuthRequest(new Request(authUrl));
        const old = await env.RSS_DATA.get('users/'+USER+'/mcp-connection.json');
        const state = old ? await old.json() : null;
        const props = await approveMcpConnection(env.RSS_DATA,USER,state?.revision ?? null,scope);
        const completed = await helpers.completeAuthorization({request:auth,userId:USER,scope,props,metadata:{scope:scope.join(' ')},revokeExistingGrants:false});
        const code = new URL(completed.redirectTo).searchParams.get('code');
        return await routeMcpRequest(new Request(ORIGIN+'/api/mcp/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,client_id:client.clientId,redirect_uri:client.redirectUris[0],code_verifier:verifier,resource:ORIGIN+'/mcp'})}),env,ctx,handler);
      }
      if (url.pathname === '/__fixture/state') {
        const object = await env.RSS_DATA.get('users/'+USER+'/subscriptions.json');
        return Response.json({networkCalls,subscriptions:object ? await object.json() : []});
      }
      if (url.pathname === '/__fixture/maintenance') { maintenance = url.searchParams.get('value') === 'true'; return Response.json({ok:true}); }
      if (url.pathname === '/__fixture/gate') { subscribeEnabled = url.searchParams.get('value') === 'true'; return Response.json({ok:true}); }
      if (url.pathname === '/__fixture/revoke') { await disconnectMcpConnection(env.RSS_DATA,USER); return Response.json({ok:true}); }
      // Miniflare's local proxy replaces Host with its loopback listener. Reconstruct only the canonical synthetic envelope; production guard is unchanged and separately tested.
      if (url.origin !== ORIGIN) return new Response('unexpected fixture origin',{status:400});
      const fixtureHeaders = new Headers(request.headers); fixtureHeaders.set('Host', url.host);
      const fixtureRequest = new Request(request,{headers:fixtureHeaders});
      return await routeMcpRequest(fixtureRequest,env,ctx,handler) ?? new Response('fixture route not found',{status:404});
    }};
  `;
  const compiled = await build({
    stdin: {
      contents: fixture,
      resolveDir: process.cwd(),
      sourcefile: "offline-mcp-subscription.fixture.ts",
      loader: "ts",
    },
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2022",
    external: ["cloudflare:workers"],
    write: false,
  });
  runtime = new Miniflare({
    modules: true,
    script: compiled.outputFiles[0].text,
    compatibilityDate: "2026-07-01",
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    kvNamespaces: ["OAUTH_KV", "RATE_LIMIT"],
    r2Buckets: ["RSS_DATA"],
    kvPersist: join(temporary, "kv"),
    r2Persist: join(temporary, "r2"),
    cf: false,
  });
  const dispatch = (path, init) =>
    runtime.dispatchFetch(`https://rss.example${path}`, {
      ...init,
      headers: { Host: "rss.example", ...init?.headers },
    });
  const token = async (kind) => {
    const response = await dispatch(`/__fixture/token?kind=${kind}`);
    equal(response.status, 200, "synthetic token exchange must succeed");
    const result = await response.json();
    equal(typeof result.access_token, "string");
    return result.access_token;
  };
  const call = async (bearer, method, params) => {
    const response = await dispatch("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const text = await response.text();
    return {
      response,
      message: JSON.parse(
        text.startsWith("event:") ? text.split("data: ")[1].split("\n")[0] : text,
      ),
    };
  };
  const readToken = await token("read");
  const writeToken = await token("write");
  const addOnlyToken = await token("add_only");
  const deniedRead = await call(addOnlyToken, "tools/call", {
    name: "list_subscriptions",
    arguments: {},
  });
  equal(deniedRead.message.result.isError, true);
  const listed = await call(readToken, "tools/list", {});
  equal(listed.response.status, 200, JSON.stringify(listed.message));
  equal(listed.message.result.tools.length, 4);
  const denied = await call(readToken, "tools/call", {
    name: "add_subscription",
    arguments: { url: "https://publisher.com/feed.xml" },
  });
  equal(denied.message.result.isError, true);
  equal((await (await dispatch("/__fixture/state")).json()).networkCalls, 0);
  const unsafe = await call(writeToken, "tools/call", {
    name: "add_subscription",
    arguments: { url: "https://127.0.0.1/feed" },
  });
  equal(unsafe.message.result.structuredContent.status, "invalid_url");
  const added = await call(writeToken, "tools/call", {
    name: "add_subscription",
    arguments: { url: "https://publisher.com/feed.xml" },
  });
  equal(added.message.result.structuredContent.status, "added", JSON.stringify(added.message));
  const existing = await call(writeToken, "tools/call", {
    name: "add_subscription",
    arguments: { url: "https://publisher.com/feed.xml" },
  });
  equal(existing.message.result.structuredContent.status, "already_subscribed");
  const state = await (await dispatch("/__fixture/state")).json();
  equal(state.subscriptions.length, 1);
  equal(state.networkCalls, 1);
  const read = await call(readToken, "tools/call", { name: "list_subscriptions", arguments: {} });
  equal(read.message.result.structuredContent.subscriptions.length, 1);
  equal(JSON.stringify(read.message).includes("publicFeedAliases"), false);
  await dispatch("/__fixture/maintenance?value=true");
  const paused = await call(writeToken, "tools/call", {
    name: "add_subscription",
    arguments: { url: "https://publisher.com/another.xml" },
  });
  equal(paused.message.result.structuredContent.status, "maintenance_paused");
  await dispatch("/__fixture/maintenance?value=false");
  await dispatch("/__fixture/gate?value=false");
  const gated = await call(writeToken, "tools/call", {
    name: "add_subscription",
    arguments: { url: "https://publisher.com/another.xml" },
  });
  equal(gated.response.status, 403);
  await dispatch("/__fixture/gate?value=true");
  await dispatch("/__fixture/revoke");
  const revoked = await call(writeToken, "tools/list", {});
  equal(revoked.response.status, 401);
  const finalState = await (await dispatch("/__fixture/state")).json();
  equal(finalState.subscriptions.length, 1);
  equal(finalState.networkCalls, 1);
  console.log(
    JSON.stringify({
      result: "passed",
      assertions,
      runtime: "actual local workerd",
      externalNetworkRequests: 0,
      syntheticFeedFetches: 1,
      liveAccountChanges: 0,
    }),
  );
} finally {
  await runtime?.dispose();
  await rm(temporary, { recursive: true, force: true });
}
