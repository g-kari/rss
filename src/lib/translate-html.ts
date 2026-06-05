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

import { detectSourceLanguage, isTranslatorApiSupported } from "./browser-translator";
import { shouldUseBrowserAi } from "./browser-ai-common";
import { devError } from "./dev-log";

/**
 * Translator.create() のタイムアウト (ms)。
 *
 * `availability === "downloading"` 状態で create() がモデル DL 完了まで resolve しない罠を防ぐ。
 * 30s は実 DL 時間 (Edge 端末で ~10-15s) + 安全マージン。
 */
const TRANSLATOR_CREATE_TIMEOUT_MS = 30_000;

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
  // ブロック除去・タグ除去は不動点反復で行う。閉じタグは HTML5 仕様どおり
  // `</script attr>` も受容するため `\b[^>]*>` でマッチさせる。
  const BLOCK_TAGS =
    /<(?:script|style|pre|code|kbd|samp)\b[\s\S]*?<\/(?:script|style|pre|code|kbd|samp)\b[^>]*>/gi;
  const GENERIC_TAGS = /<[^>]+>/g;
  const MAX_PASSES = 8;
  let curr = html;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const prev = curr;
    curr = curr.replace(BLOCK_TAGS, " ");
    if (curr === prev) break;
  }
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const prev = curr;
    curr = curr.replace(GENERIC_TAGS, " ");
    if (curr === prev) break;
  }
  return curr.replace(/\s+/g, " ").trim().slice(0, maxLen);
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
        .catch((err) => {
          devError("[translate-html] node translation failed", err);
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
        .catch((err) => {
          devError("[translate-html] node translation failed (attr)", err);
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
 *   - `availability` が `"downloading"` / `"unavailable"`
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
    if (!shouldUseBrowserAi(availability)) {
      devError("[translate-html] availability not usable:", {
        availability,
        sourceLanguage,
        targetLanguage,
      });
      return null;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const translator = await Promise.race([
      window.Translator.create({ sourceLanguage, targetLanguage }).finally(() => {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () =>
            reject(new Error(`Translator.create timeout after ${TRANSLATOR_CREATE_TIMEOUT_MS}ms`)),
          TRANSLATOR_CREATE_TIMEOUT_MS,
        );
      }),
    ]);

    const doc = new DOMParser().parseFromString(`<div id="__t_root">${html}</div>`, "text/html");
    const root = doc.getElementById("__t_root");
    if (!root) return null;

    const texts: TextCollectItem[] = [];
    const attrs: AttrCollectItem[] = [];
    collectTranslatableNodes(root, texts, attrs);

    if (texts.length === 0 && attrs.length === 0) return null;

    await translateAndApply(texts, attrs, translator);

    return root.innerHTML;
  } catch (err) {
    devError("[translate-html] translateHtmlInBrowser failed", err);
    return null;
  }
}
