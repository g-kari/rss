/**
 * Chrome Translator API を使った「HTML 構造を保持したまま」翻訳するロジック。
 *
 * Google 翻訳と同様に、`<p>` / `<a>` / `<strong>` などのタグはそのまま残し、
 * テキストノードと alt / title 属性のみを個別に翻訳する。
 * `<code>` / `<pre>` / `<script>` などコード・実行系タグは翻訳対象から除外する。
 *
 * Chrome Translator API が使えない環境では null を返す。呼び出し側は Workers AI (plain text)
 * フォールバックに回す。
 */

import {
  detectSourceLanguage,
  isTranslatorApiSupported,
  shouldUseBrowserTranslation,
} from "./browser-translator";

/** 翻訳対象から除外するタグ（コード・実行系・埋め込み） */
const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "CODE",
  "PRE",
  "KBD",
  "SAMP",
  "VAR",
  "IFRAME",
  "EMBED",
  "OBJECT",
  "NOSCRIPT",
  "TEXTAREA",
]);

/** alt / title / aria-label など「翻訳したい属性」 */
const TRANSLATABLE_ATTRS = ["alt", "title", "aria-label", "placeholder"] as const;

interface TextCollectItem {
  node: Text;
  text: string;
}

interface AttrCollectItem {
  el: Element;
  attr: (typeof TRANSLATABLE_ATTRS)[number];
  text: string;
}

/**
 * 翻訳対象テキストノード・属性を再帰収集する。
 * テストから直接呼べるよう export する。
 */
export function collectTranslatableNodes(
  root: Node,
  texts: TextCollectItem[],
  attrs: AttrCollectItem[],
): void {
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === 3 /* TEXT_NODE */) {
      const data = (child as Text).data;
      if (data.trim().length > 0) texts.push({ node: child as Text, text: data });
      continue;
    }
    if (child.nodeType !== 1 /* ELEMENT_NODE */) continue;
    const el = child as Element;
    if (SKIP_TAGS.has(el.tagName.toUpperCase())) continue;
    for (const attr of TRANSLATABLE_ATTRS) {
      const v = el.getAttribute(attr);
      if (v && v.trim().length > 0) attrs.push({ el, attr, text: v });
    }
    collectTranslatableNodes(el, texts, attrs);
  }
}

/**
 * HTML 文字列中のテキストコンテンツだけを連結して返す（言語検出用のサンプル取得）。
 * linkedom に依存せず正規表現でタグ除去するだけの簡易実装。
 */
export function extractSampleText(html: string, maxLen: number): string {
  const plain = html
    .replace(
      /<(?:script|style|pre|code|kbd|samp)[\s\S]*?<\/(?:script|style|pre|code|kbd|samp)>/gi,
      " ",
    )
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.slice(0, maxLen);
}

interface TranslatorLike {
  translate(text: string): Promise<string>;
}

/**
 * 収集したテキスト・属性を翻訳して書き戻す。
 * translator は translate(string) → Promise<string> を持つオブジェクト。
 * 1 ノードが失敗しても他ノードに影響させないため Promise.allSettled を使う。
 */
export async function translateAndApply(
  texts: TextCollectItem[],
  attrs: AttrCollectItem[],
  translator: TranslatorLike,
): Promise<void> {
  const jobs: Array<Promise<unknown>> = [];
  for (const item of texts) {
    jobs.push(
      translator
        .translate(item.text)
        .then((translated) => {
          if (typeof translated === "string" && translated.length > 0) {
            item.node.data = translated;
          }
        })
        .catch(() => {
          /* 個別失敗は無視（元のテキストが残る） */
        }),
    );
  }
  for (const item of attrs) {
    jobs.push(
      translator
        .translate(item.text)
        .then((translated) => {
          if (typeof translated === "string" && translated.length > 0) {
            item.el.setAttribute(item.attr, translated);
          }
        })
        .catch(() => {
          /* 個別失敗は無視 */
        }),
    );
  }
  await Promise.allSettled(jobs);
}

/**
 * HTML 構造を維持したまま Chrome Translator API で翻訳する。
 *
 * @returns 翻訳後の HTML 文字列。以下の場合は null を返し呼び出し側でフォールバックする:
 *   - Translator API 非対応環境
 *   - 原文言語がターゲット言語と同じ
 *   - `availability !== "available"`（モデル未ダウンロード等）
 *   - 例外発生時
 */
export async function translateHtmlInBrowser(
  html: string,
  targetLanguage: string = "ja",
): Promise<string | null> {
  if (!html || typeof window === "undefined") return null;
  if (!isTranslatorApiSupported() || !window.Translator) return null;

  const sample = extractSampleText(html, 500);
  if (!sample) return null;
  const sourceLanguage = await detectSourceLanguage(sample);
  if (sourceLanguage === targetLanguage) return null;

  try {
    const availability = await window.Translator.availability({ sourceLanguage, targetLanguage });
    if (!shouldUseBrowserTranslation(availability)) return null;

    const translator = await window.Translator.create({ sourceLanguage, targetLanguage });

    const doc = new DOMParser().parseFromString(`<div id="__t_root">${html}</div>`, "text/html");
    const root = doc.getElementById("__t_root");
    if (!root) return null;

    const texts: TextCollectItem[] = [];
    const attrs: AttrCollectItem[] = [];
    collectTranslatableNodes(root, texts, attrs);

    if (texts.length === 0 && attrs.length === 0) return null;

    await translateAndApply(texts, attrs, translator);

    return root.innerHTML;
  } catch {
    return null;
  }
}
