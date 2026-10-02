import { describe, expect, it, vi } from "vitest";
import { makeArticle } from "../../e2e/helpers/article";
import {
  MAX_RESTORE_SYNC_JSON_LENGTH,
  planArticleRestore,
  planNoteRestore,
  planRestoreSync,
} from "./json-restore-plan";
import { parseArticleStateJson, parseNotesJson } from "./export-json";
import { MAX_NOTE_LENGTH } from "./validation";
import { emptyPendingSets, serializeReadState } from "./read-state-storage";
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: vi.fn() }));
import { parseJsonBody } from "./server-auth";

const articles = [
  makeArticle({ id: "one", link: "https://example.test/one", title: "一番目" }),
  makeArticle({ id: "two", link: "https://example.test/two", title: "二番目" }),
];
const note = (url: string, value: string) => ({
  url,
  note: value,
  title: "exported",
  feedTitle: "source",
});

it("checks the entire prospective notes snapshot and minimum state delta serialization", () => {
  const notes = { old: "a".repeat(MAX_NOTE_LENGTH) };
  const update = [{ articleId: "one", note: "b".repeat(MAX_NOTE_LENGTH) }];
  const added = emptyPendingSets();
  added.bookmarks.add("one");
  const body = serializeReadState(
    added,
    emptyPendingSets(),
    null,
    null,
    {},
    { ...notes, one: update[0].note },
    { changedKeys: new Set(), removedKeys: new Set(), currentTags: {} },
    false,
    0,
  );
  expect(planRestoreSync(notes, update, "bookmark", ["one"])).toEqual({
    noteCount: 2,
    jsonLength: body.length,
  });
  expect(notes).toEqual({ old: "a".repeat(MAX_NOTE_LENGTH) });
});

it("matches the actual server parser at the exact JSON request-text limit and +1", async () => {
  for (const extra of [0, 1]) {
    const body = JSON.stringify("a".repeat(MAX_RESTORE_SYNC_JSON_LENGTH - 2 + extra));
    const result = await parseJsonBody(
      new Request("https://example.test/", { method: "POST", body }),
    );
    expect(result.ok).toBe(extra === 0);
    if (!result.ok) expect(result.error.status).toBe(413);
  }
});

it("includes the real sync envelope at the exact note snapshot boundary without other pending changes", async () => {
  const notes = Object.fromEntries(
    Array.from({ length: 259 }, (_, index) => [String(index).padStart(16, "0"), "a".repeat(2000)]),
  );
  const envelope = (value: Record<string, string>) =>
    serializeReadState(
      emptyPendingSets(),
      emptyPendingSets(),
      null,
      null,
      {},
      value,
      { changedKeys: new Set(), removedKeys: new Set(), currentTags: {} },
      false,
      0,
    );
  const baseLength = envelope({ ...notes, boundary: "" }).length;
  const remaining = MAX_RESTORE_SYNC_JSON_LENGTH - baseLength;
  expect(remaining).toBeGreaterThan(0);
  expect(remaining + 1).toBeLessThan(MAX_NOTE_LENGTH);
  for (const extra of [0, 1]) {
    const note = "b".repeat(remaining + extra);
    const projected = { ...notes, boundary: note };
    const plan = planRestoreSync(notes, [{ articleId: "boundary", note }]);
    expect(plan.jsonLength).toBe(MAX_RESTORE_SYNC_JSON_LENGTH + extra);
    const parsed = await parseJsonBody(
      new Request("https://example.test/", { method: "POST", body: envelope(projected) }),
    );
    expect(parsed.ok).toBe(extra === 0);
  }
});

describe("note restore plans", () => {
  it("excludes notes beyond the production setter limit without truncating them", () => {
    const entries = [
      note(articles[0].link, "a".repeat(MAX_NOTE_LENGTH)),
      note(articles[1].link, "b".repeat(MAX_NOTE_LENGTH + 1)),
    ];
    const plan = planNoteRestore(entries, articles, {}, true);
    expect(plan.updates.map((entry) => entry.articleId)).toEqual(["one"]);
    expect(plan).toHaveProperty("tooLongCount", 1);
  });
  it("classifies new/conflicting/identical/missing notes and keeps existing by default", () => {
    const third = makeArticle({ id: "three", link: "https://example.test/three" });
    const entries = [
      note(articles[0].link, "new"),
      note(articles[1].link, "replacement"),
      note(third.link, "same"),
      note("https://example.test/missing", "missing"),
    ];
    const notes = { two: "current", three: "same" };
    expect(planNoteRestore(entries, [...articles, third], notes, false)).toEqual({
      updates: [{ articleId: "one", title: "一番目", note: "new" }],
      newCount: 1,
      conflictCount: 1,
      identicalCount: 1,
      missingCount: 1,
      tooLongCount: 0,
    });
    expect(notes).toEqual({ two: "current", three: "same" });
  });

  it("replaces only differing matching notes when explicitly requested", () => {
    expect(
      planNoteRestore(
        [note(articles[0].link, "replacement"), note(articles[1].link, "same")],
        articles,
        { one: "current", two: "same" },
        true,
      ).updates,
    ).toEqual([{ articleId: "one", title: "一番目", note: "replacement" }]);
  });

  it("normalizes exported entries with the existing parser before planning", () => {
    const entries = parseNotesJson(
      JSON.stringify({
        notes: [
          { url: ` ${articles[0].link} `, note: " note " },
          { url: articles[0].link, note: "duplicate" },
          { url: articles[1].link, note: "" },
        ],
      }),
    );
    expect(planNoteRestore(entries, articles, { one: " " }, false).updates).toEqual([
      { articleId: "one", title: "一番目", note: "note" },
    ]);
  });

  it("uses current notes and loaded articles whenever the plan is recomputed", () => {
    const entries = [note(articles[0].link, "backup"), note(articles[1].link, "other")];
    expect(planNoteRestore(entries, articles.slice(0, 1), {}, false).missingCount).toBe(1);
    expect(
      planNoteRestore(entries, articles, { one: "edited" }, false).updates.map(
        (entry) => entry.articleId,
      ),
    ).toEqual(["two"]);
    expect(
      planNoteRestore(entries, articles, { one: "backup", two: "other" }, true).updates,
    ).toEqual([]);
  });
});

describe("add-only article restore plans", () => {
  it("counts existing and unloaded URLs without mutating or removing registered IDs", () => {
    const ids = new Set(["one", "unrelated"]);
    expect(
      planArticleRestore(
        [...articles.map((article) => article.link), "https://example.test/missing"],
        articles,
        ids,
      ),
    ).toEqual({
      additions: [{ articleId: "two", title: "二番目" }],
      alreadyPresentCount: 1,
      missingCount: 1,
    });
    expect([...ids]).toEqual(["one", "unrelated"]);
  });

  it("uses exact URL equality and avoids repeated toggles for duplicate URLs/IDs", () => {
    const aliases = [...articles, { ...articles[0], link: "https://example.test/alias" }];
    expect(
      planArticleRestore(
        [articles[0].link, articles[0].link, aliases[2].link, `${articles[1].link}/`],
        aliases,
        new Set(),
      ),
    ).toEqual({
      additions: [{ articleId: "one", title: "一番目" }],
      alreadyPresentCount: 1,
      missingCount: 1,
    });
  });

  it("supports both existing article-state backup labels through the parser", () => {
    for (const label of ["ブックマーク", "後で読む"]) {
      const parsed = parseArticleStateJson(
        JSON.stringify({ label, articles: [{ url: articles[0].link }, { url: articles[0].link }] }),
      )!;
      expect(planArticleRestore(parsed.urls, articles, new Set()).additions).toHaveLength(1);
    }
  });

  it("recomputes idempotently from changed membership and does not fetch missing articles", () => {
    const urls = articles.map((article) => article.link);
    const first = planArticleRestore(urls, articles.slice(0, 1), new Set());
    expect(first.additions).toHaveLength(1);
    expect(first.missingCount).toBe(1);
    expect(
      planArticleRestore(
        urls,
        articles,
        new Set(first.additions.map((entry) => entry.articleId)),
      ).additions.map((entry) => entry.articleId),
    ).toEqual(["two"]);
    expect(planArticleRestore(urls, articles, new Set(["one", "two"])).additions).toEqual([]);
  });
});
