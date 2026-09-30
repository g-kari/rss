// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseClipRequest, MAX_CLIP_HTML_BYTES, validateClipRequest } from "./clip";

function request(html: string, filename = "page.html", url = "https://example.com/article") {
  const form = new FormData();
  form.append("html", new Blob([html], { type: "text/html" }), filename);
  form.append("url", url);
  return new Request("https://reader.example/api/clip", { method: "POST", body: form });
}

describe("SingleFile request parsing", () => {
  it("accepts the real multipart File + URL contract", async () => {
    expect(await parseClipRequest(request("<article>saved</article>"))).toMatchObject({
      ok: true,
      html: "<article>saved</article>",
      url: "https://example.com/article",
    });
  });
  it("accepts 600 KiB HTML without the generic 512 KiB JSON limit", async () => {
    expect((await parseClipRequest(request("a".repeat(600 * 1024)))).ok).toBe(true);
  });
  it("keeps legacy JSON supported", async () => {
    const response = await parseClipRequest(
      new Request("https://reader.example/api/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: "<p>text</p>", url: " https://example.com/article " }),
      }),
    );
    expect(response).toMatchObject({ ok: true, url: "https://example.com/article" });
  });
  it.each(["page.zip", "page.zip.html", "page.u.zip.html"])(
    "rejects compressed %s explicitly",
    async (name) => {
      expect(await parseClipRequest(request("<html>compressed</html>", name))).toMatchObject({
        ok: false,
        status: 415,
      });
    },
  );
  it("rejects binary ZIP even with a renamed .html extension", async () => {
    expect(await parseClipRequest(request("PK\u0003\u0004archive"))).toMatchObject({
      ok: false,
      status: 415,
    });
  });
  it("rejects oversize streamed requests and multibyte HTML", async () => {
    expect(await parseClipRequest(request("a".repeat(MAX_CLIP_HTML_BYTES + 1)))).toMatchObject({
      ok: false,
      status: 413,
    });
    expect(
      validateClipRequest({
        html: "あ".repeat(Math.ceil(MAX_CLIP_HTML_BYTES / 3)),
        url: "https://example.com",
      }).ok,
    ).toBe(false);
  });
  it.each([null, [], 42, "text"])("rejects non-object JSON %s without throwing", async (input) => {
    expect(validateClipRequest(input).ok).toBe(false);
  });
  it("rejects missing and duplicate fields", async () => {
    const form = new FormData();
    form.append("html", "<p>x</p>");
    form.append("html", "<p>y</p>");
    form.append("url", "https://example.com");
    expect(
      await parseClipRequest(
        new Request("https://reader.example/api/clip", { method: "POST", body: form }),
      ),
    ).toMatchObject({ ok: false, status: 400 });
  });
  it.each([
    "http://localhost/a",
    "https://user:password@example.com/a",
    "file:///tmp/a",
    "javascript:alert(1)",
  ])("rejects unsafe URL %s", (url) => {
    expect(validateClipRequest({ html: "<p>test</p>", url }).ok).toBe(false);
  });
});
