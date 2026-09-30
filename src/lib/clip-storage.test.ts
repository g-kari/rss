// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { persistClip, readSavedClip } from "./clip-storage";
import { upsertSavedArticle } from "./saved-articles";
import { savedArticlesKey } from "./r2";

function bucket() {
  const data = new Map<string, { text: string; etag: string }>();
  let revision = 0;
  const api = {
    get: vi.fn(async (key: string) => {
      const item = data.get(key);
      return item ? { etag: item.etag, json: async () => JSON.parse(item.text) } : null;
    }),
    put: vi.fn(
      async (key: string, text: string, opts?: { onlyIf?: Headers | { etagMatches?: string } }) => {
        const current = data.get(key);
        const guard = opts?.onlyIf;
        if (
          guard instanceof Headers
            ? current !== undefined
            : guard?.etagMatches && guard.etagMatches !== current?.etag
        )
          return null;
        data.set(key, { text, etag: String(++revision) });
        return { etag: String(revision) };
      },
    ),
  };
  return { api: api as unknown as R2Bucket, data, put: api.put };
}
const HTML = `<html><head><title>My clipped article</title></head><body><article><h1>My clipped article</h1><p>${"Saved paragraph. ".repeat(40)}</p><script>alert(1)</script></article></body></html>`;
describe("private clipped article persistence", () => {
  it("persists the article in the existing saved list and keeps its body private outside the list", async () => {
    const { api, data } = bucket();
    const result = await persistClip(api, "alice", HTML, "https://example.com/article");
    expect(result.created).toBe(true);
    expect(result.article.title).toBe("My clipped article");
    expect(result.article.feedHash).toBe("__saved__");
    expect(JSON.parse(data.get(savedArticlesKey("alice"))!.text)[0].content).toBeUndefined();
    expect((await readSavedClip(api, "alice", "https://example.com/article"))?.content).toContain(
      "Saved paragraph",
    );
    expect(
      (await readSavedClip(api, "alice", "https://example.com/article"))?.content,
    ).not.toContain("<script");
    expect(await readSavedClip(api, "bob", "https://example.com/article")).toBeNull();
    expect([...data.keys()].every((key) => key.startsWith("users/alice/"))).toBe(true);
  });
  it("keeps the saved article id stable when the same URL is imported again", async () => {
    const { api, data } = bucket();
    const first = await persistClip(api, "alice", HTML, "https://example.com/article");
    const second = await persistClip(api, "alice", HTML, "https://example.com/article");
    expect(second.created).toBe(false);
    expect(second.article.id).toBe(first.article.id);
    expect(JSON.parse(data.get(savedArticlesKey("alice"))!.text)).toHaveLength(1);
  });
  it("retries a lost CAS using the latest saved list rather than overwriting another article", async () => {
    const { api, data, put } = bucket();
    const record = {
      id: "one",
      feedHash: "__saved__",
      guid: "u",
      title: "one",
      link: "https://example.com/1",
      summary: "",
      publishedAt: null,
      createdAt: "2026-01-01T00:00:00Z",
    };
    put.mockImplementationOnce(async () => {
      data.set(savedArticlesKey("alice"), {
        text: JSON.stringify([{ ...record, id: "winner" }]),
        etag: "winner",
      });
      return null;
    });
    await upsertSavedArticle(api, "alice", record);
    expect(
      JSON.parse(data.get(savedArticlesKey("alice"))!.text).map((a: { id: string }) => a.id),
    ).toEqual(["one", "winner"]);
  });
  it("does not report success if durable writes fail", async () => {
    const { api, put } = bucket();
    put.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(persistClip(api, "alice", HTML, "https://example.com/article")).rejects.toThrow();
  });
});
