import { test, expect } from "@playwright/test";

/**
 * happy-dom + DOMPurify の互換性検証テスト
 *
 * RSS リーダーの sanitizeHtml() を DOMPurify ベースに移行する際の
 * 事前調査として、Node.js（Playwright テストランナー）上での動作を確認する。
 *
 * Cloudflare Workers での利用可能性も合わせて検証する。
 */

test.describe("happy-dom + DOMPurify: 基本的な XSS サニタイズ", () => {
  test("happy-dom + DOMPurify: XSSを含むHTMLをサニタイズできる", async () => {
    const { Window } = await import("happy-dom");
    const window = new Window();

    const createDOMPurify = (await import("dompurify")).default;
    const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

    const dirty = '<script>alert("XSS")</script><p>hello</p>';
    const clean = purify.sanitize(dirty);

    expect(clean).not.toContain("<script>");
    expect(clean).toContain("<p>hello</p>");

    await window.happyDOM.close();
  });

  test("happy-dom + DOMPurify: インラインイベントハンドラを除去できる", async () => {
    const { Window } = await import("happy-dom");
    const window = new Window();
    const createDOMPurify = (await import("dompurify")).default;
    const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

    const dirty = '<img src="x" onerror="alert(1)">';
    const clean = purify.sanitize(dirty);

    expect(clean).not.toContain("onerror");

    await window.happyDOM.close();
  });

  test("happy-dom + DOMPurify: 正常なHTMLは維持される", async () => {
    const { Window } = await import("happy-dom");
    const window = new Window();
    const createDOMPurify = (await import("dompurify")).default;
    const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

    const input = '<p class="text">Hello <strong>world</strong></p>';
    const clean = purify.sanitize(input);

    expect(clean).toContain("<p");
    expect(clean).toContain("<strong>");

    await window.happyDOM.close();
  });

  test("happy-dom + DOMPurify: javascript: スキームを除去できる", async () => {
    const { Window } = await import("happy-dom");
    const window = new Window();
    const createDOMPurify = (await import("dompurify")).default;
    const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

    const dirty = '<a href="javascript:alert(1)">リンク</a>';
    const clean = purify.sanitize(dirty);

    expect(clean).not.toContain("javascript:");
    expect(clean).toContain("リンク");

    await window.happyDOM.close();
  });

  test("happy-dom + DOMPurify: data: URI を除去できる", async () => {
    const { Window } = await import("happy-dom");
    const window = new Window();
    const createDOMPurify = (await import("dompurify")).default;
    const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

    const dirty = '<img src="data:text/html,<script>alert(1)</script>">';
    const clean = purify.sanitize(dirty);

    expect(clean).not.toContain("data:text/html");

    await window.happyDOM.close();
  });

  test("happy-dom + DOMPurify: vbscript: スキームを除去できる", async () => {
    const { Window } = await import("happy-dom");
    const window = new Window();
    const createDOMPurify = (await import("dompurify")).default;
    const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

    const dirty = '<a href="vbscript:MsgBox(1)">リンク</a>';
    const clean = purify.sanitize(dirty);

    expect(clean).not.toContain("vbscript:");

    await window.happyDOM.close();
  });
});

test.describe("happy-dom + DOMPurify: SVG と高度な攻撃ベクトル", () => {
  test("happy-dom + DOMPurify: SVG内のscriptを除去できる", async () => {
    const { Window } = await import("happy-dom");
    const window = new Window();
    const createDOMPurify = (await import("dompurify")).default;
    const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

    const dirty = "<svg><script>alert(1)</script></svg>";
    const clean = purify.sanitize(dirty);

    expect(clean).not.toContain("<script>");
    expect(clean).not.toContain("alert(1)");

    await window.happyDOM.close();
  });

  test("happy-dom + DOMPurify: MathML内のscriptを除去できる", async () => {
    const { Window } = await import("happy-dom");
    const window = new Window();
    const createDOMPurify = (await import("dompurify")).default;
    const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

    const dirty = "<math><mtext><script>alert(1)</script></mtext></math>";
    const clean = purify.sanitize(dirty);

    expect(clean).not.toContain("<script>");

    await window.happyDOM.close();
  });

  test("happy-dom + DOMPurify: onclick属性を除去できる", async () => {
    const { Window } = await import("happy-dom");
    const window = new Window();
    const createDOMPurify = (await import("dompurify")).default;
    const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

    const dirty = '<a onclick="evil()">リンク</a>';
    const clean = purify.sanitize(dirty);

    expect(clean).not.toContain("onclick");
    expect(clean).toContain("リンク");

    await window.happyDOM.close();
  });
});

test.describe("happy-dom + DOMPurify: Windows 互換性確認", () => {
  test("happy-dom の Window が DOMPurify に必要な API を提供する", async () => {
    const { Window } = await import("happy-dom");
    const window = new Window();

    // DOMPurify が必要とする主要なAPI群の確認
    expect(typeof window.document).toBe("object");
    expect(typeof window.document.createElement).toBe("function");
    expect(typeof window.document.createNodeIterator).toBe("function");
    expect(typeof window.document.createTreeWalker).toBe("function");
    expect(typeof window.DocumentFragment).toBe("function");

    await window.happyDOM.close();
  });

  test("happy-dom + DOMPurify: 同一インスタンスを再利用できる（Workers環境を想定）", async () => {
    const { Window } = await import("happy-dom");
    const window = new Window();
    const createDOMPurify = (await import("dompurify")).default;
    const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

    // 複数回のサニタイズで同一インスタンスを再利用
    const input1 = "<script>alert(1)</script><p>first</p>";
    const input2 = '<img onerror="hack()" src="x"><span>second</span>';
    const input3 = '<a href="javascript:void(0)">link</a>';

    const clean1 = purify.sanitize(input1);
    const clean2 = purify.sanitize(input2);
    const clean3 = purify.sanitize(input3);

    expect(clean1).toContain("<p>first</p>");
    expect(clean1).not.toContain("<script>");

    expect(clean2).toContain("<span>second</span>");
    expect(clean2).not.toContain("onerror");

    expect(clean3).toContain("link");
    expect(clean3).not.toContain("javascript:");

    await window.happyDOM.close();
  });
});

test.describe("happy-dom + DOMPurify: 現行 sanitizeHtml との機能比較", () => {
  test("trusted iframe (YouTube) がデフォルト設定で除去される（現行と挙動差異あり）", async () => {
    // 注意: DOMPurify はデフォルトで全 <iframe> を除去する。
    // 現行 sanitizeHtml はホワイトリスト方式でYouTube等の信頼済みiframeを許可する。
    // DOMPurify 移行時は ALLOWED_TAGS や ALLOWED_URI_REGEXP などの設定が必要。
    const { Window } = await import("happy-dom");
    const window = new Window();
    const createDOMPurify = (await import("dompurify")).default;
    const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

    const input = '<iframe src="https://www.youtube.com/embed/abc"></iframe>';
    const clean = purify.sanitize(input);

    // DOMPurify デフォルト: iframe は除去される
    // これを許可するには ADD_TAGS: ['iframe'] + ALLOWED_URI_REGEXP の設定が必要
    expect(clean).not.toContain("<iframe");
    // → 移行時に TRUSTED_IFRAME_RULES 相当の設定を DOMPurify に実装する必要あり
  });

  test("style属性はデフォルトで保持される", async () => {
    // DOMPurify はデフォルトで style 属性を許可する（現行 sanitizeHtml は url() 等を除去）
    // 移行時は FORCE_BODY や FORBID_ATTR: [] 設定の調整が必要
    const { Window } = await import("happy-dom");
    const window = new Window();
    const createDOMPurify = (await import("dompurify")).default;
    const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

    // DOMPurify はデフォルトで style 属性を許可
    // ただし url() による外部リソース読み込みは別途対応が必要
    const input = '<p style="color:red">テキスト</p>';
    const clean = purify.sanitize(input);

    expect(clean).toContain("style");
    expect(clean).toContain("テキスト");
  });
});
