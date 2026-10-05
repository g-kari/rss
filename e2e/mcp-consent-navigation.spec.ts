import { test, expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import {
  readMcpConsentForm,
  renderMcpConsent,
  secureMcpBrowserHeaders,
} from "../src/lib/mcp-auth-ui";

// Production consent HTML/CSP with completely intercepted, synthetic HTTP responses.
// This tests browser form-navigation policy, not OAuth/IdP, Next/OpenNext, or real grants.
const RSS_ORIGIN = "https://rss-mcp-ui.test";
const CLIENT_ORIGIN = "https://rss-mcp-client.test";
const IDP_ORIGIN = "https://rss-mcp-idp.test";
const AUTHORIZE_URL = `${RSS_ORIGIN}/api/mcp/authorize`;
const HANDLE = "a".repeat(43);
const COOKIE = "__Host-rss-mcp-ui-fixture=synthetic-browser-binding";

interface Diagnostics {
  requests: string[];
  unexpectedRequests: string[];
  consoleErrors: string[];
  formPosts: number;
  formOrigins: (string | null)[];
  externalReferers: (string | null)[];
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
): Promise<Diagnostics> {
  const diagnostics: Diagnostics = {
    requests: [],
    unexpectedRequests: [],
    consoleErrors: [],
    formPosts: 0,
    formOrigins: [],
    externalReferers: [],
  };
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    diagnostics.requests.push(`${method} ${request.url()}`);
    if (request.url() === AUTHORIZE_URL && method === "GET") {
      const body = renderMcpConsent(
        {
          clientId: "synthetic-ui-client",
          clientName: "Synthetic UI client",
          clientDomain: "rss-mcp-client.test",
          redirectUri: `${CLIENT_ORIGIN}/callback`,
          redirectHost: "rss-mcp-client.test",
          redirectIsLoopback: false,
          scope: ["rss:read"],
        },
        HANDLE,
        account,
      );
      return route.fulfill({
        status: 200,
        headers: {
          ...productionBrowserHeaders(),
          "Set-Cookie": `${COOKIE}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`,
        },
        body,
      });
    }
    if (request.url() === AUTHORIZE_URL && method === "POST") {
      diagnostics.formPosts++;
      const headers = await request.allHeaders();
      diagnostics.formOrigins.push(headers.origin ?? null);
      const form = await readMcpConsentForm(
        new Request(request.url(), {
          method,
          headers,
          body: request.postData() ?? "",
        }),
      );
      if (
        headers.origin !== RSS_ORIGIN ||
        !headers.cookie?.includes(COOKIE) ||
        form?.handle !== HANDLE ||
        !["approve", "deny", "login"].includes(form.decision)
      ) {
        return route.fulfill({ status: 400, body: "Invalid synthetic fixture form" });
      }
      const location =
        form.decision === "login"
          ? `${RSS_ORIGIN}/api/auth/login?mcp_resume=synthetic-flow`
          : form.decision === "deny"
            ? `${CLIENT_ORIGIN}/callback?error=access_denied`
            : `${CLIENT_ORIGIN}/callback?result=synthetic-approved`;
      return route.fulfill({
        status: 303,
        headers: { ...productionBrowserHeaders(), Location: location },
        body: "",
      });
    }
    if (
      url.origin === RSS_ORIGIN &&
      url.pathname === "/api/auth/login" &&
      url.searchParams.get("mcp_resume") === "synthetic-flow" &&
      method === "GET"
    ) {
      return route.fulfill({
        status: 307,
        headers: { Location: `${IDP_ORIGIN}/auth/login?state=synthetic-flow` },
        body: "",
      });
    }
    if (
      method === "GET" &&
      ((url.origin === CLIENT_ORIGIN && ["/callback", "/referrer-probe"].includes(url.pathname)) ||
        (url.origin === IDP_ORIGIN && url.pathname === "/auth/login"))
    ) {
      const headers = await request.allHeaders();
      diagnostics.externalReferers.push(headers.referer ?? null);
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><meta charset='utf-8'><h1>Synthetic destination</h1>",
      });
    }
    if (url.pathname === "/favicon.ico" && method === "GET") {
      return route.fulfill({ status: 204, body: "" });
    }
    diagnostics.unexpectedRequests.push(`${method} ${request.url()}`);
    return route.abort();
  });
  return diagnostics;
}

async function attachDiagnostics(page: Page, diagnostics: Diagnostics, testInfo: TestInfo) {
  await testInfo.attach("synthetic-consent-navigation", {
    body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
    contentType: "application/json",
  });
  await page.screenshot({ path: testInfo.outputPath("consent-navigation.png"), fullPage: true });
}

for (const scenario of [
  {
    title: "approved consent reaches the synthetic cross-origin client after same-origin POST",
    account: "synthetic-account-a",
    button: "このアカウントで読み取りを許可",
    destination: CLIENT_ORIGIN,
    parameter: "result",
    value: "synthetic-approved",
  },
  {
    title: "denied consent reaches the synthetic cross-origin client after same-origin POST",
    account: "synthetic-account-a",
    button: "許可しない",
    destination: CLIENT_ORIGIN,
    parameter: "error",
    value: "access_denied",
  },
  {
    title: "signed-out consent reaches the synthetic IdP through the same-origin login redirect",
    account: null,
    button: "この読み取り連携を確認して0g0 IDでログイン",
    destination: IDP_ORIGIN,
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
      await page.waitForURL((url) => url.origin === scenario.destination, { timeout: 5_000 });
      expect(new URL(page.url()).searchParams.get(scenario.parameter)).toBe(scenario.value);
      expect(diagnostics.formPosts).toBe(1);
      expect(diagnostics.formOrigins).toEqual([RSS_ORIGIN]);
      expect(diagnostics.externalReferers).toEqual([null]);
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
  const diagnostics: Diagnostics = {
    requests: [],
    unexpectedRequests: [],
    consoleErrors: [],
    formPosts: 0,
    formOrigins: [],
    externalReferers: [],
  };
  // The same native form fields/action as the production settings page, with
  // production MCP response headers. No settings handler, session or grant is run.
  const settingsUrl = `${RSS_ORIGIN}/api/mcp/settings`;
  await context.route("**/*", async (route) => {
    const request = route.request();
    diagnostics.requests.push(`${request.method()} ${request.url()}`);
    if (request.url() === settingsUrl && request.method() === "GET") {
      return route.fulfill({
        headers: productionBrowserHeaders(),
        body: '<!doctype html><html lang="ja"><meta charset="utf-8"><form method="post" action="/api/mcp/settings"><input type="hidden" name="account" value="synthetic-account-a"><button type="submit">このRSSアカウントのすべての読み取り連携を解除</button></form></html>',
      });
    }
    if (request.url() === settingsUrl && request.method() === "POST") {
      diagnostics.formPosts++;
      const headers = await request.allHeaders();
      diagnostics.formOrigins.push(headers.origin ?? null);
      const form = new URLSearchParams(request.postData() ?? "");
      const valid = headers.origin === RSS_ORIGIN && form.get("account") === "synthetic-account-a";
      return route.fulfill({
        status: valid ? 200 : 400,
        headers: productionBrowserHeaders(),
        body: valid ? '<p role="status">Synthetic disconnect form accepted</p>' : "Invalid form",
      });
    }
    if (new URL(request.url()).pathname === "/favicon.ico") {
      return route.fulfill({ status: 204, body: "" });
    }
    diagnostics.unexpectedRequests.push(`${request.method()} ${request.url()}`);
    return route.abort();
  });
  try {
    await page.goto(settingsUrl);
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
    // policy. No policy is changed and the destination is fully intercepted.
    await page.evaluate((target) => {
      const link = document.createElement("a");
      link.href = target;
      link.textContent = "Synthetic external referrer probe";
      document.body.appendChild(link);
    }, `${CLIENT_ORIGIN}/referrer-probe`);
    await page.getByRole("link", { name: "Synthetic external referrer probe" }).click();
    await page.waitForURL(`${CLIENT_ORIGIN}/referrer-probe`);
    expect(diagnostics.externalReferers).toEqual([null]);
    expect(diagnostics.unexpectedRequests).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  } finally {
    await attachDiagnostics(page, diagnostics, testInfo);
  }
});
