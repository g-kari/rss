import { test, expect } from "@playwright/test";
import { parseHTML } from "linkedom/worker";
import {
  collectTranslatableNodes,
  extractSampleText,
  translateAndApply,
} from "../src/lib/translate-html";

/**
 * Chrome Translator API を使わない純粋ロジック部分のユニットテスト。
 *
 * `translateHtmlInBrowser` 本体はブラウザの `window.Translator` に依存するため Node では走らないが、
 * テキスト抽出・書き戻しロジックはテスト可能。linkedom で DOM を構築して検証する。
 */

test.describe("extractSampleText", () => {
  test("タグを除去してテキストを連結する", () => {
    const html = "<p>Hello</p><p>World</p>";
    expect(extractSampleText(html, 100)).toBe("Hello World");
  });

  test("code / pre / style / script の内側は除外する", () => {
    const html = "<p>Visible</p><pre>code inside</pre><script>var x=1;</script>";
    const out = extractSampleText(html, 100);
    expect(out).toContain("Visible");
    expect(out).not.toContain("code inside");
    expect(out).not.toContain("var x=1");
  });

  test("maxLen で切り詰める", () => {
    const html = "<p>" + "a".repeat(1000) + "</p>";
    expect(extractSampleText(html, 50).length).toBe(50);
  });

  test("タグだけの HTML は空文字", () => {
    expect(extractSampleText("<div></div>", 100)).toBe("");
  });
});

test.describe("collectTranslatableNodes", () => {
  test("テキストノードを収集する", () => {
    const { document } = parseHTML("<div><p>Hello</p><p>World</p></div>");
    const root = document.querySelector("div")!;
    const texts: Array<{ node: Text; text: string }> = [];
    const attrs: Array<{ el: Element; attr: string; text: string }> = [];
    collectTranslatableNodes(root as unknown as Node, texts as never, attrs as never);
    expect(texts.map((t) => t.text)).toEqual(["Hello", "World"]);
  });

  test("code / pre / script / style は収集しない", () => {
    const { document } = parseHTML(
      "<div><p>Keep</p><pre>skip</pre><code>skip</code><script>skip</script><style>skip</style></div>",
    );
    const root = document.querySelector("div")!;
    const texts: Array<{ node: Text; text: string }> = [];
    const attrs: Array<{ el: Element; attr: string; text: string }> = [];
    collectTranslatableNodes(root as unknown as Node, texts as never, attrs as never);
    expect(texts.map((t) => t.text)).toEqual(["Keep"]);
  });

  test("空白のみのテキストノードは除外する", () => {
    const { document } = parseHTML("<div>  \n\t  <span>keep</span>  </div>");
    const root = document.querySelector("div")!;
    const texts: Array<{ node: Text; text: string }> = [];
    const attrs: Array<{ el: Element; attr: string; text: string }> = [];
    collectTranslatableNodes(root as unknown as Node, texts as never, attrs as never);
    expect(texts.map((t) => t.text.trim())).toEqual(["keep"]);
  });

  test("alt / title / aria-label / placeholder を収集する", () => {
    const { document } = parseHTML(
      '<div><img alt="photo" title="tooltip"><input placeholder="type here" aria-label="search"></div>',
    );
    const root = document.querySelector("div")!;
    const texts: Array<{ node: Text; text: string }> = [];
    const attrs: Array<{ el: Element; attr: string; text: string }> = [];
    collectTranslatableNodes(root as unknown as Node, texts as never, attrs as never);
    const attrMap = new Map(attrs.map((a) => [a.attr, a.text]));
    expect(attrMap.get("alt")).toBe("photo");
    expect(attrMap.get("title")).toBe("tooltip");
    expect(attrMap.get("placeholder")).toBe("type here");
    expect(attrMap.get("aria-label")).toBe("search");
  });

  test("ネストした要素を再帰的に処理する", () => {
    const { document } = parseHTML(
      "<div><article><p>outer <strong>inner</strong> tail</p></article></div>",
    );
    const root = document.querySelector("div")!;
    const texts: Array<{ node: Text; text: string }> = [];
    const attrs: Array<{ el: Element; attr: string; text: string }> = [];
    collectTranslatableNodes(root as unknown as Node, texts as never, attrs as never);
    expect(texts.map((t) => t.text)).toEqual(["outer ", "inner", " tail"]);
  });
});

test.describe("translateAndApply", () => {
  test("翻訳結果をテキストノードと属性に書き戻す", async () => {
    const { document } = parseHTML('<div><p>hello</p><img alt="cat"></div>');
    const root = document.querySelector("div")!;
    const texts: Array<{ node: Text; text: string }> = [];
    const attrs: Array<{ el: Element; attr: string; text: string }> = [];
    collectTranslatableNodes(root as unknown as Node, texts as never, attrs as never);

    const mockTranslator = {
      translate: (t: string): Promise<string> => Promise.resolve(t.toUpperCase()),
    };
    await translateAndApply(texts, attrs as never, mockTranslator);

    expect(root.innerHTML).toContain("HELLO");
    expect(root.querySelector("img")!.getAttribute("alt")).toBe("CAT");
    expect(root.querySelector("p")!.tagName.toLowerCase()).toBe("p");
  });

  test("一部の翻訳失敗は他ノードに影響させない", async () => {
    const { document } = parseHTML("<div><p>good</p><p>bad</p></div>");
    const root = document.querySelector("div")!;
    const texts: Array<{ node: Text; text: string }> = [];
    const attrs: Array<{ el: Element; attr: string; text: string }> = [];
    collectTranslatableNodes(root as unknown as Node, texts as never, attrs as never);

    const mockTranslator = {
      translate: (t: string): Promise<string> =>
        t === "bad" ? Promise.reject(new Error("fail")) : Promise.resolve(t.toUpperCase()),
    };
    await translateAndApply(texts, attrs as never, mockTranslator);

    expect(root.innerHTML).toContain("GOOD");
    expect(root.innerHTML).toContain("bad"); // 元のまま
  });

  test("空文字列は書き戻さない（元のテキストを保持）", async () => {
    const { document } = parseHTML("<div><p>keep</p></div>");
    const root = document.querySelector("div")!;
    const texts: Array<{ node: Text; text: string }> = [];
    const attrs: Array<{ el: Element; attr: string; text: string }> = [];
    collectTranslatableNodes(root as unknown as Node, texts as never, attrs as never);

    const mockTranslator = {
      translate: (): Promise<string> => Promise.resolve(""),
    };
    await translateAndApply(texts, attrs as never, mockTranslator);

    expect(root.innerHTML).toContain("keep");
  });
});
