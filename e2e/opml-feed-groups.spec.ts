import { test, expect } from "@playwright/test";
import { XMLParser } from "fast-xml-parser";
import { buildOpml, extractFeeds, type OpmlOutline } from "../src/lib/opml";
import type { Feed, FeedGroup } from "../src/types";
import { makeFeed as makeBaseFeed } from "./helpers/feed";

const makeFeed = (overrides: Partial<Feed> & { id: string; url: string }): Feed =>
  makeBaseFeed({
    title: overrides.id,
    siteUrl: `https://${overrides.id}.example.com`,
    ...overrides,
  });

function makeGroup(overrides: Partial<FeedGroup> & { id: string; name: string }): FeedGroup {
  return {
    order: 0,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test.describe("buildOpml — フィードグループ階層", () => {
  test("グループ付きフィードがネストされた outline で出力される", () => {
    const feeds = [
      makeFeed({ id: "a", url: "https://a.com/feed", groupId: "g1" }),
      makeFeed({ id: "b", url: "https://b.com/feed", groupId: "g1" }),
      makeFeed({ id: "c", url: "https://c.com/feed" }),
    ];
    const groups = [makeGroup({ id: "g1", name: "Tech", order: 1 })];

    const opml = buildOpml(feeds, groups);

    expect(opml).toContain('<outline text="Tech" title="Tech">');
    expect(opml).toContain('xmlUrl="https://a.com/feed"');
    expect(opml).toContain('xmlUrl="https://b.com/feed"');
    expect(opml).toContain('xmlUrl="https://c.com/feed"');

    const techIdx = opml.indexOf('<outline text="Tech"');
    const closeIdx = opml.indexOf("</outline>", techIdx);
    const aIdx = opml.indexOf('xmlUrl="https://a.com/feed"');
    const bIdx = opml.indexOf('xmlUrl="https://b.com/feed"');
    const cIdx = opml.indexOf('xmlUrl="https://c.com/feed"');
    expect(aIdx).toBeGreaterThan(techIdx);
    expect(aIdx).toBeLessThan(closeIdx);
    expect(bIdx).toBeGreaterThan(techIdx);
    expect(bIdx).toBeLessThan(closeIdx);
    expect(cIdx).toBeGreaterThan(closeIdx);
  });

  test("空のグループは出力されない", () => {
    const feeds = [makeFeed({ id: "a", url: "https://a.com/feed" })];
    const groups = [makeGroup({ id: "g1", name: "Empty", order: 1 })];

    const opml = buildOpml(feeds, groups);
    expect(opml).not.toContain("Empty");
  });

  test("グループが order 順に出力される", () => {
    const feeds = [
      makeFeed({ id: "a", url: "https://a.com/feed", groupId: "g2" }),
      makeFeed({ id: "b", url: "https://b.com/feed", groupId: "g1" }),
    ];
    const groups = [
      makeGroup({ id: "g1", name: "Zeta", order: 1 }),
      makeGroup({ id: "g2", name: "Alpha", order: 2 }),
    ];

    const opml = buildOpml(feeds, groups);
    const zetaIdx = opml.indexOf("Zeta");
    const alphaIdx = opml.indexOf("Alpha");
    expect(zetaIdx).toBeLessThan(alphaIdx);
  });

  test("不明な groupId のフィードはトップレベルに配置される", () => {
    const feeds = [makeFeed({ id: "a", url: "https://a.com/feed", groupId: "unknown" })];
    const groups = [makeGroup({ id: "g1", name: "Tech", order: 1 })];

    const opml = buildOpml(feeds, groups);
    expect(opml).not.toContain("Tech");
    expect(opml).toContain('xmlUrl="https://a.com/feed"');
  });

  test("グループなしの場合はフラットな OPML が出力される", () => {
    const feeds = [
      makeFeed({ id: "a", url: "https://a.com/feed" }),
      makeFeed({ id: "b", url: "https://b.com/feed" }),
    ];
    const opml = buildOpml(feeds, []);
    expect(opml).toContain('xmlUrl="https://a.com/feed"');
    expect(opml).toContain('xmlUrl="https://b.com/feed"');
    expect(opml).not.toContain("</outline>\n    </outline>");
  });

  test("グループ名の特殊文字がエスケープされる", () => {
    const feeds = [makeFeed({ id: "a", url: "https://a.com/feed", groupId: "g1" })];
    const groups = [makeGroup({ id: "g1", name: 'Tech & "News"', order: 1 })];

    const opml = buildOpml(feeds, groups);
    expect(opml).toContain("&amp;");
    expect(opml).toContain("&quot;");
  });
});

test.describe("extractFeeds — フォルダ認識", () => {
  test("フォルダ outline の子フィードに folder が付与される", () => {
    const outline = {
      "@_text": "Tech",
      outline: [
        { "@_xmlUrl": "https://a.com/feed", "@_text": "Feed A" },
        { "@_xmlUrl": "https://b.com/feed", "@_text": "Feed B" },
      ],
    };
    const feeds = extractFeeds(outline);
    expect(feeds).toHaveLength(2);
    expect(feeds[0].folder).toBe("Tech");
    expect(feeds[1].folder).toBe("Tech");
  });

  test("xmlUrl ありの outline には folder が伝播しない（フォルダではない）", () => {
    const outline = {
      "@_xmlUrl": "https://parent.com/feed",
      "@_text": "Parent",
      outline: [{ "@_xmlUrl": "https://child.com/feed", "@_text": "Child" }],
    };
    const feeds = extractFeeds(outline);
    expect(feeds).toHaveLength(2);
    expect(feeds[0].folder).toBeUndefined();
    expect(feeds[1].folder).toBeUndefined();
  });

  test("ネストしたフォルダは直近の親フォルダ名を使用する", () => {
    const outline = {
      "@_text": "Top",
      outline: [
        {
          "@_text": "Sub",
          outline: [{ "@_xmlUrl": "https://a.com/feed", "@_text": "Feed A" }],
        },
      ],
    };
    const feeds = extractFeeds(outline);
    expect(feeds).toHaveLength(1);
    expect(feeds[0].folder).toBe("Sub");
  });

  test("フォルダ名なしの outline は folder を undefined にする", () => {
    const outline = {
      outline: [{ "@_xmlUrl": "https://a.com/feed", "@_text": "Feed A" }],
    };
    const feeds = extractFeeds(outline);
    expect(feeds).toHaveLength(1);
    expect(feeds[0].folder).toBeUndefined();
  });

  test("トップレベルのフィード（フォルダ外）は folder が undefined", () => {
    const outline = {
      "@_xmlUrl": "https://top.com/feed",
      "@_text": "Top Feed",
    };
    const feeds = extractFeeds(outline);
    expect(feeds).toHaveLength(1);
    expect(feeds[0].folder).toBeUndefined();
  });

  test("@_title が @_text より優先される", () => {
    const outline = {
      "@_text": "Text Name",
      "@_title": "Title Name",
      outline: [{ "@_xmlUrl": "https://a.com/feed", "@_text": "Feed A" }],
    };
    const feeds = extractFeeds(outline);
    expect(feeds[0].folder).toBe("Title Name");
  });

  test("深さ制限を超えたフォルダの子は無視される", () => {
    let current: Record<string, unknown> = {
      "@_xmlUrl": "https://deep.com/feed",
      "@_text": "Deep",
    };
    for (let i = 0; i < 12; i++) {
      current = { "@_text": `Level ${i}`, outline: [current] };
    }
    const feeds = extractFeeds(current as never);
    expect(feeds).toHaveLength(0);
  });
});

test.describe("OPML ラウンドトリップ", () => {
  test("エクスポートした OPML をインポートするとフォルダ構造が復元される", () => {
    const feeds = [
      makeFeed({ id: "a", url: "https://a.com/feed", title: "Feed A", groupId: "g1" }),
      makeFeed({ id: "b", url: "https://b.com/feed", title: "Feed B", groupId: "g2" }),
      makeFeed({ id: "c", url: "https://c.com/feed", title: "Feed C" }),
    ];
    const groups = [
      makeGroup({ id: "g1", name: "Tech", order: 1 }),
      makeGroup({ id: "g2", name: "News", order: 2 }),
    ];

    const opml = buildOpml(feeds, groups);

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      isArray: (name: string) => name === "outline",
    });
    const parsed = parser.parse(opml) as { opml: { body: { outline: OpmlOutline[] } } };
    const bodyOutlines = parsed.opml.body.outline;

    const allFeeds = bodyOutlines.flatMap((o) => extractFeeds(o));

    const feedA = allFeeds.find((f) => f.url === "https://a.com/feed");
    const feedB = allFeeds.find((f) => f.url === "https://b.com/feed");
    const feedC = allFeeds.find((f) => f.url === "https://c.com/feed");

    expect(feedA?.folder).toBe("Tech");
    expect(feedB?.folder).toBe("News");
    expect(feedC?.folder).toBeUndefined();
  });
});
