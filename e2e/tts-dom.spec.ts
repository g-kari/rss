import { test, expect } from "@playwright/test";
import { wrapSentencesInHtml } from "../src/lib/tts-dom";

/**
 * #672 Phase 2 — wrapSentencesInHtml 純粋関数テスト。
 *
 * 処理済み HTML を入力して、テキストノードがセンテンス単位の
 * `<span data-tts-sentence-idx="N">` でラップされた HTML を出力する関数の検証。
 */

test.describe("wrapSentencesInHtml — 基本ケース", () => {
  test("空文字はそのまま返す (sentences=[])", () => {
    const result = wrapSentencesInHtml("");
    expect(result.html).toBe("");
    expect(result.sentences).toEqual([]);
  });

  test("空白のみはそのまま返す", () => {
    const result = wrapSentencesInHtml("   ");
    expect(result.sentences).toEqual([]);
  });

  test("単一段落の単純なセンテンス分割", () => {
    const { html, sentences } = wrapSentencesInHtml("<p>こんにちは。世界。</p>");
    expect(sentences).toHaveLength(2);
    expect(html).toContain('data-tts-sentence-idx="0"');
    expect(html).toContain('data-tts-sentence-idx="1"');
    expect(html).toContain("こんにちは。");
    expect(html).toContain("世界。");
  });

  test("英語ピリオドでも分割", () => {
    const { html, sentences } = wrapSentencesInHtml("<p>Hello. World.</p>");
    expect(sentences).toHaveLength(2);
    expect(html).toContain('data-tts-sentence-idx="0"');
    expect(html).toContain('data-tts-sentence-idx="1"');
  });

  test("末尾デリミタなしでも 1 sentence", () => {
    const { html, sentences } = wrapSentencesInHtml("<p>未完文</p>");
    expect(sentences).toHaveLength(1);
    expect(html).toContain('data-tts-sentence-idx="0"');
  });
});

test.describe("wrapSentencesInHtml — skip タグ", () => {
  test("<pre> 配下のテキストはラップしない", () => {
    const { html, sentences } = wrapSentencesInHtml(
      "<p>本文。</p><pre>コード。</pre><p>続き。</p>",
    );
    // 本文 + 続き で 2 sentence (pre 内は除外)
    expect(sentences).toHaveLength(2);
    expect(html).toContain("<pre>コード。</pre>");
    // pre タグ内に span が入らないことを確認
    expect(html).not.toMatch(/<pre>[^<]*<span/);
  });

  test("<code> 配下のテキストはラップしない", () => {
    const { html, sentences } = wrapSentencesInHtml(
      "<p>説明。</p><code>let x = 1;</code><p>例。</p>",
    );
    expect(sentences).toHaveLength(2);
    expect(html).toContain("<code>let x = 1;</code>");
  });

  test("<script> / <style> も対象外", () => {
    const { sentences } = wrapSentencesInHtml(
      '<p>本文。</p><script>alert("x");</script><style>.a{color:red}</style>',
    );
    expect(sentences).toHaveLength(1);
  });
});

test.describe("wrapSentencesInHtml — タグ跨ぎ", () => {
  test("<a> リンクを含むセンテンスは a 内外両方の span に同 idx を付与", () => {
    const { html, sentences } = wrapSentencesInHtml(
      '<p>詳細は <a href="#">こちら</a> を参照。</p>',
    );
    expect(sentences).toHaveLength(1);
    // "詳細は " と "こちら" と " を参照。" は同じ sentence (idx=0) として 3 つの span にラップされる想定
    const matches = html.match(/data-tts-sentence-idx="0"/g);
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });

  test("複数段落でセンテンスが続く場合 (実際には改行で区切れる)", () => {
    // splitIntoSentences は段落を区別しない (テキストストリームとして処理する) ため、
    // 段落跨ぎでも 句点で区切られた単位がセンテンスになる
    const { sentences } = wrapSentencesInHtml("<p>段落1の文。</p><p>段落2の文。</p>");
    expect(sentences).toHaveLength(2);
  });

  test("インラインタグ (<strong>) を含むセンテンス", () => {
    const { html, sentences } = wrapSentencesInHtml("<p><strong>重要</strong>な話。</p>");
    expect(sentences).toHaveLength(1);
    expect(html).toContain('data-tts-sentence-idx="0"');
    expect(html).toContain("重要");
  });
});

test.describe("wrapSentencesInHtml — エッジケース", () => {
  test("センテンスが見つからない (デリミタなし)", () => {
    const { html, sentences } = wrapSentencesInHtml("<p>デリミタなし</p>");
    // 末尾デリミタなしでも 1 センテンスとして扱う
    expect(sentences).toHaveLength(1);
    expect(html).toContain('data-tts-sentence-idx="0"');
  });

  test("画像のみのコンテンツ (テキストノードなし) はラップ無し", () => {
    const { html, sentences } = wrapSentencesInHtml('<img src="a.jpg" alt="" />');
    expect(sentences).toEqual([]);
    expect(html).toContain("<img");
  });

  test("入れ子 (<blockquote><p>...</p></blockquote>) も処理する", () => {
    const { html, sentences } = wrapSentencesInHtml("<blockquote><p>引用文。</p></blockquote>");
    expect(sentences).toHaveLength(1);
    expect(html).toContain('data-tts-sentence-idx="0"');
    expect(html).toContain("<blockquote>");
  });

  test("sentences 配列の charIndex オフセットは元テキスト全体に対して計算されている", () => {
    // textContent を結合した文字列での start/end が一貫しているか
    const { sentences } = wrapSentencesInHtml("<p>第1。</p><p>第2。</p>");
    expect(sentences).toEqual([
      { text: "第1。", start: 0, end: 3 },
      { text: "第2。", start: 3, end: 6 },
    ]);
  });
});
