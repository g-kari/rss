import { test, expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import {
  readMcpConsentForm,
  renderMcpConsent,
  renderMcpNavigation,
  secureMcpBrowserHeaders,
} from "../src/lib/mcp-auth-ui";

// Production consent HTML/CSP on real loopback HTTP servers; every redirect hop stays local.
// This tests browser form-navigation policy, not OAuth/IdP, Next/OpenNext, or real grants.
let RSS_ORIGIN = "";
let CLIENT_ORIGIN = "";
let IDP_ORIGIN = "";
let AUTHORIZE_URL = "";
const HANDLE = "a".repeat(43);
const COOKIE = "__Host-rss-mcp-ui-fixture=synthetic-browser-binding";

interface Diagnostics {
  requests: string[];
  serverRequests: string[];
  unexpectedRequests: string[];
  consoleErrors: string[];
  formPosts: number;
  formOrigins: (string | null)[];
  externalReferers: (string | null)[];
  externalBindingCookie: boolean[];
  close(): Promise<void>;
}

function productionBrowserHeaders(): Record<string, string> {
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
  secureMcpBrowserHeaders(headers);
  return Object.fromEntries(headers);
}

async function serveConsentFixture(
  context: BrowserContext,
  page: Page,
  account: string | null,
  legacyRedirect = false,
): Promise<Diagnostics> {
  const servers: Server[] = [];
  const diagnostics: Diagnostics = {
    requests: [],
    serverRequests: [],
    unexpectedRequests: [],
    consoleErrors: [],
    formPosts: 0,
    formOrigins: [],
    externalReferers: [],
    externalBindingCookie: [],
    async close() {
      await Promise.all(
        servers.map(
          (server) =>
            new Promise<void>((resolve) => {
              server.closeAllConnections();
              server.close(() => resolve());
            }),
        ),
      );
    },
  };
  const send = (
    res: ServerResponse,
    status: number,
    headers: Record<string, string>,
    body = "",
  ) => {
    res.writeHead(status, headers);
    res.end(body);
  };
  const listen = async (server: Server) => {
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No local fixture port");
    return address.port;
  };
  const formRequest = async (req: IncomingMessage, url: string) => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const item of req) {
      const chunk = Buffer.from(item);
      size += chunk.byteLength;
      if (size > 4096) throw new Error("Synthetic form too large");
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers))
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    return new Request(url, { method: "POST", headers, body: Buffer.concat(chunks).toString() });
  };
  const destinationServer = (role: "client" | "idp") =>
    createServer((req, res) => {
      const url = new URL(req.url ?? "/", role === "client" ? CLIENT_ORIGIN : IDP_ORIGIN);
      diagnostics.serverRequests.push(`${req.method} ${url.href}`);
      if (url.pathname === "/favicon.ico") return send(res, 204, {});
      const valid =
        req.method === "GET" &&
        (role === "client"
          ? ["/callback", "/referrer-probe"].includes(url.pathname)
          : url.pathname === "/auth/login");
      if (!valid) return send(res, 404, {}, "Unknown synthetic destination");
      diagnostics.externalReferers.push(req.headers.referer ?? null);
      diagnostics.externalBindingCookie.push(req.headers.cookie?.includes(COOKIE) ?? false);
      return send(
        res,
        200,
        { "Content-Type": "text/html; charset=utf-8" },
        "<!doctype html><meta charset='utf-8'><h1>Synthetic destination</h1>",
      );
    });
  CLIENT_ORIGIN = `http://127.0.0.1:${await listen(destinationServer("client"))}`;
  IDP_ORIGIN = `http://127.0.0.1:${await listen(destinationServer("idp"))}`;
  const rss = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", RSS_ORIGIN);
    diagnostics.serverRequests.push(`${req.method} ${url.href}`);
    try {
      if (url.pathname === "/favicon.ico") return send(res, 204, {});
      if (url.pathname === "/api/mcp/authorize" && req.method === "GET") {
        const html = renderMcpConsent(
          {
            clientId: "synthetic-ui-client",
            clientName: "Synthetic UI client",
            clientDomain: "127.0.0.1",
            redirectUri: `${CLIENT_ORIGIN}/callback`,
            redirectHost: "127.0.0.1",
            redirectIsLoopback: true,
            scope: ["rss:read"],
          },
          HANDLE,
          account,
        );
        return send(
          res,
          200,
          {
            ...productionBrowserHeaders(),
            "Set-Cookie": `${COOKIE}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`,
          },
          html,
        );
      }
      if (url.pathname === "/api/mcp/authorize" && req.method === "POST") {
        diagnostics.formPosts++;
        diagnostics.formOrigins.push(req.headers.origin ?? null);
        const form = await readMcpConsentForm(await formRequest(req, url.href));
        if (
          req.headers.origin !== RSS_ORIGIN ||
          !req.headers.cookie?.includes(COOKIE) ||
          form?.handle !== HANDLE ||
          !["approve", "deny", "login"].includes(form.decision)
        )
          return send(res, 400, {}, "Invalid synthetic fixture form");
        const target =
          form.decision === "login"
            ? `${RSS_ORIGIN}/api/auth/login?mcp_resume=synthetic-flow`
            : form.decision === "deny"
              ? `${CLIENT_ORIGIN}/callback?error=access_denied`
              : `${CLIENT_ORIGIN}/callback?code=synthetic-approved`;
        if (legacyRedirect)
          return send(res, 303, { ...productionBrowserHeaders(), Location: target });
        const verified = form.decision === "login" ? target : `${CLIENT_ORIGIN}/callback`;
        return send(
          res,
          200,
          productionBrowserHeaders(),
          renderMcpNavigation(
            target,
            verified,
            form.decision === "login" ? "ログインへ進む" : "アプリへ戻る",
          ),
        );
      }
      if (url.pathname === "/api/auth/login" && req.method === "GET") {
        if (url.searchParams.get("mcp_resume") !== "synthetic-flow")
          return send(res, 400, {}, "Invalid resume");
        return send(res, 307, { Location: `${IDP_ORIGIN}/auth/login?state=synthetic-flow` });
      }
      if (url.pathname === "/api/mcp/settings" && req.method === "GET")
        return send(
          res,
          200,
          productionBrowserHeaders(),
          '<!doctype html><html lang="ja"><meta charset="utf-8"><form method="post" action="/api/mcp/settings"><input type="hidden" name="account" value="synthetic-account-a"><button type="submit">このRSSアカウントのすべての読み取り連携を解除</button></form></html>',
        );
      if (url.pathname === "/api/mcp/settings" && req.method === "POST") {
        diagnostics.formPosts++;
        diagnostics.formOrigins.push(req.headers.origin ?? null);
        const form = await formRequest(req, url.href);
        const value = new URLSearchParams(await form.text());
        const valid =
          req.headers.origin === RSS_ORIGIN && value.get("account") === "synthetic-account-a";
        return send(
          res,
          valid ? 200 : 400,
          productionBrowserHeaders(),
          valid ? '<p role="status">Synthetic disconnect form accepted</p>' : "Invalid form",
        );
      }
      return send(res, 404, {}, "Unknown synthetic RSS path");
    } catch {
      return send(res, 500, {}, "Synthetic fixture handler error");
    }
  });
  // Chromium's built-in localhost trust is used; no certificate, OS change,
  // ignoreHTTPSErrors, insecure-origin flag or browser-security bypass is used.
  // A different loopback host prevents RSS host-only Cookies reaching the client.
  RSS_ORIGIN = `http://localhost:${await listen(rss)}`;
  AUTHORIZE_URL = `${RSS_ORIGIN}/api/mcp/authorize`;
  const origins = new Set([RSS_ORIGIN, CLIENT_ORIGIN, IDP_ORIGIN]);
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  // Observe all requests, including redirect hops that context.route omits.
  // Every server-generated Location is one of the fixed loopback origins above.
  page.on("request", (request) => {
    diagnostics.requests.push(`${request.method()} ${request.url()}`);
    if (!origins.has(new URL(request.url()).origin))
      diagnostics.unexpectedRequests.push(`${request.method()} ${request.url()}`);
  });
  await context.route("**/*", (route) =>
    origins.has(new URL(route.request().url()).origin) ? route.continue() : route.abort(),
  );
  return diagnostics;
}

async function attachDiagnostics(page: Page, diagnostics: Diagnostics, testInfo: TestInfo) {
  try {
    await testInfo.attach("synthetic-consent-navigation", {
      body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
      contentType: "application/json",
    });
    await page.screenshot({ path: testInfo.outputPath("consent-navigation.png"), fullPage: true });
  } finally {
    await diagnostics.close();
  }
}

for (const scenario of [
  {
    title: "approved consent reaches the synthetic cross-origin client after same-origin POST",
    account: "synthetic-account-a",
    button: "このアカウントで読み取りを許可",
    destination: "client",
    parameter: "code",
    value: "synthetic-approved",
  },
  {
    title: "denied consent reaches the synthetic cross-origin client after same-origin POST",
    account: "synthetic-account-a",
    button: "許可しない",
    destination: "client",
    parameter: "error",
    value: "access_denied",
  },
  {
    title: "signed-out consent reaches the synthetic IdP through the same-origin login redirect",
    account: null,
    button: "この連携を確認して0g0 IDでログイン",
    destination: "idp",
    parameter: "state",
    value: "synthetic-flow",
  },
]) {
  test(`MCP production consent navigation: ${scenario.title}`, async ({
    context,
    page,
  }, testInfo) => {
    const diagnostics = await serveConsentFixture(context, page, scenario.account);
    try {
      const response = await page.goto(AUTHORIZE_URL);
      expect(response?.headers()["cache-control"]).toBe("no-store");
      expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
      await expect(page.getByRole("heading", { name: "RSS読み取り連携の確認" })).toBeVisible();
      await expect(page.getByText("Synthetic UI client", { exact: true })).toBeVisible();
      expect(await page.locator("script").count()).toBe(0);
      const binding = (await context.cookies(RSS_ORIGIN)).find(
        (cookie) => cookie.name === "__Host-rss-mcp-ui-fixture",
      );
      expect(binding).toMatchObject({ secure: true, httpOnly: true, path: "/", sameSite: "Lax" });
      await page.getByRole("button", { name: scenario.button, exact: true }).click();
      await expect(page.getByRole("heading", { name: "RSS読み取り連携の続き" })).toBeVisible();
      expect(diagnostics.externalReferers).toEqual([]);
      await page
        .getByRole("link", {
          name: scenario.account ? "アプリへ戻る" : "ログインへ進む",
          exact: true,
        })
        .click();
      const targetOrigin = scenario.destination === "client" ? CLIENT_ORIGIN : IDP_ORIGIN;
      await page.waitForURL((url) => url.origin === targetOrigin, { timeout: 5_000 });
      expect(new URL(page.url()).searchParams.get(scenario.parameter)).toBe(scenario.value);
      expect(diagnostics.formPosts).toBe(1);
      expect(diagnostics.formOrigins).toEqual([RSS_ORIGIN]);
      expect(diagnostics.externalReferers).toEqual([null]);
      expect(diagnostics.externalBindingCookie).toEqual([false]);
      expect(diagnostics.unexpectedRequests).toEqual([]);
      expect(diagnostics.consoleErrors).toEqual([]);
    } finally {
      await attachDiagnostics(page, diagnostics, testInfo);
    }
  });
}

test("MCP response policy preserves settings-style disconnect form Origin", async ({
  context,
  page,
}, testInfo) => {
  const diagnostics = await serveConsentFixture(context, page, "synthetic-account-a");
  try {
    await page.goto(`${RSS_ORIGIN}/api/mcp/settings`);
    await page
      .getByRole("button", { name: "このRSSアカウントのすべての読み取り連携を解除" })
      .click();
    await expect(page.getByRole("status")).toHaveText("Synthetic disconnect form accepted");
    expect(diagnostics.formOrigins).toEqual([RSS_ORIGIN]);
    expect(diagnostics.formPosts).toBe(1);
    expect(diagnostics.unexpectedRequests).toEqual([]);
  } finally {
    await attachDiagnostics(page, diagnostics, testInfo);
  }
});

test("MCP response policy does not send Referer on an external link navigation", async ({
  context,
  page,
}, testInfo) => {
  const diagnostics = await serveConsentFixture(context, page, "synthetic-account-a");
  try {
    await page.goto(AUTHORIZE_URL);
    // Add only a synthetic link to probe the real document's production referrer
    // policy. No policy is changed and the destination is a real loopback server.
    await page.evaluate((target) => {
      const link = document.createElement("a");
      link.href = target;
      link.textContent = "Synthetic external referrer probe";
      document.body.appendChild(link);
    }, `${CLIENT_ORIGIN}/referrer-probe`);
    await page.getByRole("link", { name: "Synthetic external referrer probe" }).click();
    await page.waitForURL(`${CLIENT_ORIGIN}/referrer-probe`);
    expect(diagnostics.externalReferers).toEqual([null]);
    expect(diagnostics.externalBindingCookie).toEqual([false]);
    expect(diagnostics.unexpectedRequests).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  } finally {
    await attachDiagnostics(page, diagnostics, testInfo);
  }
});

test("legacy same-origin form POST redirect is blocked by the unchanged form-action policy", async ({
  context,
  page,
}, testInfo) => {
  const diagnostics = await serveConsentFixture(context, page, "synthetic-account-a", true);
  try {
    await page.goto(AUTHORIZE_URL);
    await page.getByRole("button", { name: "このアカウントで読み取りを許可", exact: true }).click();
    await expect.poll(() => diagnostics.consoleErrors.join("\n")).toContain("form-action 'self'");
    expect(diagnostics.formPosts).toBe(1);
    expect(diagnostics.formOrigins).toEqual([RSS_ORIGIN]);
    expect(diagnostics.externalReferers).toEqual([]);
    expect(diagnostics.unexpectedRequests).toEqual([]);
    expect(new URL(page.url()).origin).toBe(RSS_ORIGIN);
  } finally {
    await attachDiagnostics(page, diagnostics, testInfo);
  }
});
