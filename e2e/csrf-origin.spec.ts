import { test, expect } from "@playwright/test";
import { isCsrfViolation } from "../src/lib/csrf";

/**
 * `isCsrfViolation` の CSRF 検証テスト (issue #101)。
 *
 * 更新系 (POST / PUT / PATCH / DELETE) リクエストで `Origin` または `Referer` の
 * origin が `APP_BASE_URL` と一致することを検証する。SameSite=Lax cookie を使って
 * いても top-level navigation では cookie が送出されるため、CSRF の完全な防御には
 * Origin / Referer 検証が必要になる。
 *
 * 設計原則:
 * - 安全メソッド (GET/HEAD/OPTIONS) は常に合格
 * - Origin ヘッダーがある場合はそちらのみで判定し、Referer にフォールバックしない
 *   （"null" やパース不能な Origin で Referer bypass を防ぐ）
 * - appBaseUrl 未設定時は fail-closed で拒否（本番での誤 disable 防止）
 */

const APP_BASE_URL = "https://rss.example.test";

function makeRequest(init: {
  method: string;
  origin?: string | null;
  referer?: string | null;
}): Request {
  const headers = new Headers();
  if (init.origin !== undefined && init.origin !== null) headers.set("origin", init.origin);
  if (init.referer !== undefined && init.referer !== null) headers.set("referer", init.referer);
  return new Request(APP_BASE_URL + "/api/feeds", { method: init.method, headers });
}

test.describe("isCsrfViolation — 安全メソッドは常に合格", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    test(`${method} は Origin / Referer が無くても false（素通し）`, () => {
      const req = makeRequest({ method });
      expect(isCsrfViolation(req, APP_BASE_URL)).toBe(false);
    });

    test(`${method} は Origin が異なっていても false（素通し）`, () => {
      const req = makeRequest({ method, origin: "https://evil.example" });
      expect(isCsrfViolation(req, APP_BASE_URL)).toBe(false);
    });

    test(`${method} は appBaseUrl 未設定でも false（素通し）`, () => {
      const req = makeRequest({ method });
      expect(isCsrfViolation(req, undefined)).toBe(false);
    });
  }
});

test.describe("isCsrfViolation — 更新系メソッドの検証", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    test(`${method} で Origin が一致 → false`, () => {
      const req = makeRequest({ method, origin: APP_BASE_URL });
      expect(isCsrfViolation(req, APP_BASE_URL)).toBe(false);
    });

    test(`${method} で Origin が別オリジン → true`, () => {
      const req = makeRequest({ method, origin: "https://evil.example" });
      expect(isCsrfViolation(req, APP_BASE_URL)).toBe(true);
    });

    test(`${method} で Origin 欠落 + Referer が一致 → false`, () => {
      const req = makeRequest({ method, referer: APP_BASE_URL + "/some/path" });
      expect(isCsrfViolation(req, APP_BASE_URL)).toBe(false);
    });

    test(`${method} で Origin 欠落 + Referer が別オリジン → true`, () => {
      const req = makeRequest({ method, referer: "https://evil.example/path" });
      expect(isCsrfViolation(req, APP_BASE_URL)).toBe(true);
    });

    test(`${method} で Origin / Referer 両方欠落 → true`, () => {
      const req = makeRequest({ method });
      expect(isCsrfViolation(req, APP_BASE_URL)).toBe(true);
    });

    test(`${method} で Origin が "null"（不透明オリジン）→ true（Referer にフォールバックしない）`, () => {
      // sandbox iframe / data: / mode: "no-cors" 等で Origin: null になる場合
      const req = makeRequest({ method, origin: "null" });
      expect(isCsrfViolation(req, APP_BASE_URL)).toBe(true);
    });

    test(`${method} で Origin="null" + 正規 Referer → true（bypass 防止）`, () => {
      // Origin があるときは Origin のみで判定。Referer にフォールバックさせない
      const req = makeRequest({ method, origin: "null", referer: APP_BASE_URL + "/x" });
      expect(isCsrfViolation(req, APP_BASE_URL)).toBe(true);
    });

    test(`${method} で Origin がパース不能 + 正規 Referer → true（bypass 防止）`, () => {
      const req = makeRequest({ method, origin: "not-a-url", referer: APP_BASE_URL + "/x" });
      expect(isCsrfViolation(req, APP_BASE_URL)).toBe(true);
    });
  }
});

test.describe("isCsrfViolation — fail-closed な設定不備検知", () => {
  test("appBaseUrl=undefined + 更新系 → true（本番の誤 disable 防止）", () => {
    const req = makeRequest({ method: "POST", origin: APP_BASE_URL });
    expect(isCsrfViolation(req, undefined)).toBe(true);
  });

  test("appBaseUrl=空文字 + 更新系 → true（本番の誤 disable 防止）", () => {
    const req = makeRequest({ method: "POST", origin: APP_BASE_URL });
    expect(isCsrfViolation(req, "")).toBe(true);
  });

  test("appBaseUrl がパース不能 + 更新系 → true", () => {
    const req = makeRequest({ method: "POST", origin: APP_BASE_URL });
    expect(isCsrfViolation(req, "not-a-url")).toBe(true);
  });
});

test.describe("isCsrfViolation — 小文字メソッドと境界条件", () => {
  test("メソッドが小文字 'post' でも検証が適用される", () => {
    const req = new Request(APP_BASE_URL + "/api/feeds", {
      method: "post",
      headers: { origin: "https://evil.example" },
    });
    expect(isCsrfViolation(req, APP_BASE_URL)).toBe(true);
  });

  test("appBaseUrl に末尾スラッシュ付きでも origin 単位で比較される", () => {
    const req = makeRequest({ method: "POST", origin: APP_BASE_URL });
    expect(isCsrfViolation(req, APP_BASE_URL + "/")).toBe(false);
  });

  test("ポート違いは不一致扱い", () => {
    const req = makeRequest({ method: "POST", origin: "https://rss.example.test:8080" });
    expect(isCsrfViolation(req, APP_BASE_URL)).toBe(true);
  });

  test("scheme 違い（http）は不一致扱い", () => {
    const req = makeRequest({ method: "POST", origin: "http://rss.example.test" });
    expect(isCsrfViolation(req, APP_BASE_URL)).toBe(true);
  });

  test("サブドメイン違いは不一致扱い", () => {
    const req = makeRequest({ method: "POST", origin: "https://evil.rss.example.test" });
    expect(isCsrfViolation(req, APP_BASE_URL)).toBe(true);
  });
});
