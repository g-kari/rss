// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseFeed } from "./xml-parser";

describe("JSON Feed optional item title contract", () => {
  it.each([
    { name: "number", title: 42, expectedTitle: "" },
    { name: "zero", title: 0, expectedTitle: "" },
    { name: "boolean", title: true, expectedTitle: "" },
    { name: "false", title: false, expectedTitle: "" },
    { name: "object", title: { text: "Do not coerce" }, expectedTitle: "" },
    { name: "array", title: ["Do not coerce"], expectedTitle: "" },
    { name: "null", title: null, expectedTitle: "" },
    { name: "missing", title: undefined, expectedTitle: "" },
    { name: "empty string", title: "", expectedTitle: "" },
    { name: "plain string", title: "A valid title", expectedTitle: "A valid title" },
    {
      name: "Unicode and whitespace",
      title: "  新刊 📰 café é 𝄞\n続き  ",
      expectedTitle: "  新刊 📰 café é 𝄞\n続き  ",
    },
    { name: "markup string", title: "<b>A valid title</b>", expectedTitle: "<b>A valid title</b>" },
  ])(
    "produces a string title for $name without changing sibling fields",
    ({ title, expectedTitle }) => {
      const item = {
        id: "article-1",
        title,
        url: "https://example.com/1",
        content_text: "Article content",
        summary: "Article summary",
        date_published: "2026-10-06T08:00:00Z",
        authors: [{ name: "Publisher" }],
        tags: ["News"],
        language: "ja",
        image: "https://example.com/image.png",
      };
      const feed = { version: "https://jsonfeed.org/version/1.1", title: "Feed" };
      const parsed = parseFeed(JSON.stringify({ ...feed, items: [item] }));
      const baseline = parseFeed(
        JSON.stringify({ ...feed, items: [{ ...item, title: undefined }] }),
      );
      expect(typeof parsed.items[0].title).toBe("string");
      expect(parsed.items[0].title).toBe(expectedTitle);
      expect(parsed).toEqual({
        ...baseline,
        items: [{ ...baseline.items[0], title: expectedTitle }],
      });
    },
  );
});
