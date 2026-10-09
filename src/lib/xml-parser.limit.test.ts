// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseFeed, type ParsedFeed } from "./xml-parser";
import { compareByPublishedAtDesc } from "./article-utils";
import { applyCorePipeline } from "./html-post-processor";
import { XMLParser } from "fast-xml-parser";

vi.mock("./html-post-processor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./html-post-processor")>();
  return { ...actual, applyCorePipeline: vi.fn(actual.applyCorePipeline) };
});

type Format = "rss" | "atom" | "rdf" | "json";
const formats: Format[] = ["rss", "atom", "rdf", "json"];
const escape = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const date = (index: number) => new Date(Date.UTC(2026, 0, 1) + index * 60000).toISOString();

function fixture(
  format: Format,
  count: number,
  dates?: Array<[string | null, string | null]>,
  nested = false,
): string {
  if (format === "json") {
    return JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Feed",
      home_page_url: "https://example.test/",
      authors: [{ name: "Feed author" }],
      language: "ja",
      items: Array.from({ length: count }, (_, index) => ({
        id: `guid-${index}`,
        title: `Title ${index}`,
        url: `https://example.test/${index}`,
        content_html: `<div><p>Content ${index}</p><p>More ${index}</p></div>`,
        summary: `Summary ${index}`,
        date_published: dates?.[index]?.[0] ?? (dates ? undefined : date(index)),
        date_modified: dates?.[index]?.[1] ?? undefined,
        authors: index % 2 ? [{ name: `Author ${index}` }] : undefined,
        tags: [`Category ${index}`],
        image: `https://example.test/${index}.png`,
        language: index % 2 ? "en" : undefined,
      })),
    });
  }
  const items = Array.from({ length: count }, (_, index) => {
    const pair = dates?.[index] ?? (dates ? [null, null] : [date(index), null]);
    const primary =
      pair[0] === null
        ? ""
        : `<${format === "rdf" ? "dc:date" : format === "atom" ? "published" : "pubDate"}>${escape(pair[0]!)}</${format === "rdf" ? "dc:date" : format === "atom" ? "published" : "pubDate"}>`;
    const secondary =
      pair[1] === null
        ? ""
        : `<${format === "rdf" ? "pubDate" : format === "atom" ? "updated" : "dc:date"}>${escape(pair[1]!)}</${format === "rdf" ? "pubDate" : format === "atom" ? "updated" : "dc:date"}>`;
    const content = `<div><p>Content ${index}</p><p>More ${index}</p></div>`;
    const body = nested ? content : `<![CDATA[${content}]]>`;
    const author =
      index % 2
        ? format === "atom"
          ? `<author><name>Author ${index}</name></author>`
          : `<dc:creator>Author ${index}</dc:creator>`
        : "";
    const extras = `${author}<media:thumbnail url="https://example.test/${index}.png"/><custom>${index}</custom>`;
    if (format === "atom")
      return `<entry><id>guid-${index}</id><title>Title ${index}</title><link href="https://example.test/${index}"/><summary type="html">${body}</summary><category term="Category ${index}"/>${primary}${secondary}${extras}</entry>`;
    return `<item rdf:about="https://example.test/${index}"><guid>guid-${index}</guid><title>Title ${index}</title><link>https://example.test/${index}</link><description>${body}</description><category>Category ${index}</category>${primary}${secondary}${extras}</item>`;
  }).join("");
  const ns =
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"';
  if (format === "atom")
    return `<feed xmlns="http://www.w3.org/2005/Atom" ${ns}><title>Feed</title><link href="https://example.test/"/><author><name>Feed author</name></author>${items}</feed>`;
  const channel =
    "<title>Feed</title><link>https://example.test/</link><dc:creator>Feed author</dc:creator>";
  return format === "rdf"
    ? `<rdf:RDF ${ns}><channel>${channel}</channel>${items}</rdf:RDF>`
    : `<rss ${ns}><channel>${channel}${items}</channel></rss>`;
}

function oracle(xml: string, maxItems: number): ParsedFeed {
  const result = parseFeed(xml);
  if (result.items.length > maxItems)
    result.items = result.items.sort(compareByPublishedAtDesc).slice(0, maxItems);
  return result;
}

beforeEach(() => vi.clearAllMocks());

describe("optional newest raw-item selection", () => {
  for (const format of formats) {
    it.each([0, 1, 999, 1000, 1001, 1200])(
      `${format}: preserves every field at %i items`,
      (count) => {
        const xml = fixture(format, count);
        const full = parseFeed(xml);
        expect(full.items).toHaveLength(count);
        expect(parseFeed(xml, { maxItems: 1000 })).toEqual(oracle(xml, 1000));
        if (count <= 1000 && count > 0) expect(full.items[0].guid).toBe("guid-0");
        if (count > 1000)
          expect(parseFeed(xml, { maxItems: 1000 }).items[0].guid).toBe(`guid-${count - 1}`);
      },
    );

    it(`${format}: preserves invalid/empty/date fallback and stable tie/null selection`, () => {
      const dates: Array<[string | null, string | null]> = [
        [null, date(9)],
        ["", date(8)],
        ["invalid", date(7)],
        [date(5), date(10)],
        [date(5), null],
        [null, null],
        ["invalid", null],
        ["2026-01-01T09:00:00+09:00", null],
      ];
      const xml = fixture(format, dates.length, dates);
      expect(parseFeed(xml, { maxItems: 4 })).toEqual(oracle(xml, 4));
      const full = parseFeed(xml);
      expect(full.items[2].publishedAt).toBe(format === "json" ? date(7) : null);
      expect(full.items[1].publishedAt).toBe(format === "atom" ? null : date(8));
      expect(full.items[7].publishedAt).toBe("2026-01-01T00:00:00.000Z");
      const equal = fixture(
        format,
        1001,
        Array.from({ length: 1001 }, () => [date(0), null]),
      );
      expect(parseFeed(equal, { maxItems: 1000 }).items.map((item) => item.guid)).toEqual(
        Array.from({ length: 1000 }, (_, i) => `guid-${i}`),
      );
      const missing = fixture(
        format,
        1001,
        Array.from({ length: 1001 }, () => [null, null]),
      );
      expect(parseFeed(missing, { maxItems: 1000 })).toEqual(oracle(missing, 1000));
    });

    it(`${format}: keeps lexical extended-year ordering and nested source correspondence`, () => {
      const dates: Array<[string | null, string | null]> = [
        ["+010000-01-01T00:00:00Z", null],
        ["2026-01-01T00:00:00Z", null],
        ["-000001-01-01T00:00:00Z", null],
        ["2026-01-01T00:00:00Z", null],
      ];
      const xml = fixture(format, dates.length, dates, true);
      const result = parseFeed(xml, { maxItems: 2 });
      expect(result).toEqual(oracle(xml, 2));
      expect(result.items.map((item) => item.guid)).toEqual(["guid-1", "guid-3"]);
      expect(result.items[0].content).toContain("Content 1");
      expect(result.items[1].content).toContain("Content 3");
      expect(parseFeed(xml, { maxItems: 0 }).items).toEqual([]);
      expect(parseFeed(xml, {}).items).toHaveLength(dates.length);
    });
  }

  it("normalizes only selected XML items while leaving unlimited default intact", () => {
    const xml = fixture("rss", 1200, undefined, true);
    parseFeed(xml, { maxItems: 1000 });
    expect(applyCorePipeline).toHaveBeenCalledTimes(1000);
    vi.mocked(applyCorePipeline).mockClear();
    parseFeed(xml);
    expect(applyCorePipeline).toHaveBeenCalledTimes(1200);
  });

  it("normalizes only selected standard JSON items", () => {
    parseFeed(fixture("json", 1200), { maxItems: 1000 });
    expect(applyCorePipeline).toHaveBeenCalledTimes(1000);
  });

  for (const format of ["rss", "atom", "rdf"] as const) {
    it.each([false, true])(
      `${format}: keeps strict-to-lenient fallback (deep wins: %s)`,
      (deepWins) => {
        const deep = "<div>".repeat(510) + "deep content 0" + "</div>".repeat(510);
        const dates: Array<[string | null, string | null]> = deepWins
          ? [
              [date(1), null],
              [date(0), null],
            ]
          : [
              [date(0), null],
              [date(1), null],
            ];
        const xml = fixture(format, 2, dates, true).replace(
          "<div><p>Content 0</p><p>More 0</p></div>",
          deep,
        );
        expect(() => new XMLParser({ maxNestedTags: 500 }).parse(xml)).toThrow(
          /Maximum nested tags exceeded/,
        );
        const full = parseFeed(xml);
        expect(full.items).toHaveLength(2);
        const selected = parseFeed(xml, { maxItems: 1 });
        expect(selected).toEqual(oracle(xml, 1));
        expect(selected.items[0].guid).toBe(deepWins ? "guid-0" : "guid-1");
        if (deepWins) expect(selected.items[0].content).toContain("deep content 0");
        expect(parseFeed(xml, { maxItems: 0 }).items).toEqual([]);
      },
    );
  }

  it.each([
    "content_html",
    "content_text",
    "summary",
    "url",
    "external_url",
    "image",
    "banner_image",
    "date_published",
    "authors",
    "attachments",
  ])("retains malformed excluded JSON %s failures/fallback", (field) => {
    const data = JSON.parse(fixture("json", 2));
    data.items[0][field] =
      field === "authors" || field === "attachments" ? [null] : { toString: "not callable" };
    const xml = JSON.stringify(data);
    let expected: ParsedFeed | undefined;
    let failure: unknown;
    try {
      expected = oracle(xml, 1);
    } catch (error) {
      failure = error;
    }
    if (failure) expect(() => parseFeed(xml, { maxItems: 1 })).toThrow((failure as Error).message);
    else expect(parseFeed(xml, { maxItems: 1 })).toEqual(expected);
  });

  it("retains malformed excluded XML coercion and inherited author failures", () => {
    for (const xml of [
      fixture("atom", 2).replace(
        `<published>${date(0)}</published>`,
        "<published><toString>bad</toString></published>",
      ),
      fixture("rss", 2).replace(
        "<dc:creator>Feed author</dc:creator>",
        "<dc:creator><toString>bad</toString></dc:creator>",
      ),
      fixture("rss", 2).replace("<custom>0</custom>", "<custom><toString>bad</toString></custom>"),
    ]) {
      let expected: ParsedFeed | undefined;
      let failure: unknown;
      try {
        expected = oracle(xml, 1);
      } catch (error) {
        failure = error;
      }
      if (failure)
        expect(() => parseFeed(xml, { maxItems: 1 })).toThrow((failure as Error).message);
      else expect(parseFeed(xml, { maxItems: 1 })).toEqual(expected);
    }
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "validates invalid maxItems %s outside format fallback",
    (maxItems) => {
      expect(() => parseFeed(fixture("json", 1), { maxItems })).toThrow(RangeError);
      expect(() => parseFeed(fixture("rss", 1), { maxItems })).toThrow(RangeError);
    },
  );
});
