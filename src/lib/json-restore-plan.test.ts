import { describe, expect, it } from "vitest";
import { makeArticle } from "../../e2e/helpers/article";
import { planArticleRestore, planNoteRestore } from "./json-restore-plan";
import { parseArticleStateJson, parseNotesJson } from "./export-json";
import { MAX_NOTE_LENGTH } from "./validation";

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
