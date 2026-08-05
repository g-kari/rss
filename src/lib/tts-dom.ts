/**
 * TTS 読み上げハイライト用 DOM 加工純粋関数 (#672 Phase 2)。
 *
 * 処理済み記事 HTML を受け取り、テキストノードをセンテンス単位で
 * `<span data-tts-sentence-idx="N">` でラップして返す。
 *
 * - `<pre>` / `<code>` / `<script>` / `<style>` / `<noscript>` 内のテキストは対象外
 *   (コードブロック等は読み上げないため)
 * - 同一センテンスが複数のテキストノードに跨る場合 (例: `<p>foo. <a>link</a> bar.</p>`)、
 *   各ノードに同じ `data-tts-sentence-idx` を持つ span を出力
 * - センテンス分割は `splitIntoSentences` (#659 Phase 1) を流用
 */

import { parseHTML } from "linkedom/worker";
import { splitIntoSentences, type Sentence } from "./tts-sentences";

const SKIP_TAG_NAMES = new Set(["PRE", "CODE", "SCRIPT", "STYLE", "NOSCRIPT"]);

export interface WrapSentencesResult {
  /** sentence span ラップ済みの HTML */
  html: string;
  /** 元のプレーンテキスト基準で分割された Sentence 配列 (charIndex 計算に使用) */
  sentences: Sentence[];
}

interface TextNodeRef {
  node: { textContent: string | null; parentNode: unknown };
  start: number;
  end: number;
}

interface DomNode {
  nodeType: number;
  tagName?: string;
  textContent: string | null;
  parentNode: unknown;
  childNodes: DomNode[];
}

/**
 * 処理済み HTML をセンテンス span でラップする。
 *
 * - 入力 HTML が空 / 空白のみ → そのまま返却 (sentences=[])
 * - センテンスが見つからない (デリミタなし、全テキストが skip タグ内) → そのまま返却
 *
 * 戻り値の `html` は元の構造を保ったまま、テキストノードだけが span で置換されている。
 */
export function wrapSentencesInHtml(html: string): WrapSentencesResult {
  if (!html || !html.trim()) return { html, sentences: [] };

  const result = parseHTML(`<html><body><div id="__root__">${html}</div></body></html>`);
  const document = (result as { document: unknown }).document as {
    getElementById: (id: string) => DomNode | null;
    createElement: (tag: string) => DomNode & {
      setAttribute: (name: string, value: string) => void;
      appendChild: (child: unknown) => unknown;
    };
    createTextNode: (text: string) => DomNode;
    createDocumentFragment: () => DomNode & {
      appendChild: (child: unknown) => unknown;
    };
  };

  const root = document.getElementById("__root__");
  if (!root) return { html, sentences: [] };

  // 1. テキストノードを収集 (skip タグ配下は除外)
  const textNodes: TextNodeRef[] = [];
  let cursor = 0;
  function walk(node: DomNode): void {
    if (node.nodeType === 1 && node.tagName && SKIP_TAG_NAMES.has(node.tagName)) return;
    for (const child of Array.from(node.childNodes)) {
      const childNode = child as DomNode;
      if (childNode.nodeType === 3) {
        const text = childNode.textContent ?? "";
        textNodes.push({
          node: childNode as unknown as TextNodeRef["node"],
          start: cursor,
          end: cursor + text.length,
        });
        cursor += text.length;
      } else if (childNode.nodeType === 1) {
        walk(childNode);
      }
    }
  }
  walk(root);

  if (textNodes.length === 0) return { html, sentences: [] };

  // 2. センテンス分割
  let fullText = "";
  for (const textNode of textNodes) fullText += textNode.node.textContent ?? "";
  const sentences = splitIntoSentences(fullText);
  if (sentences.length === 0) return { html, sentences: [] };

  // 3. 各テキストノードを「sentence span ラップ済みの DocumentFragment」で置換
  // 末尾から逆順に処理して、操作中の DOM 順序に影響を与えない
  for (let i = textNodes.length - 1; i >= 0; i--) {
    const { node, start, end } = textNodes[i];
    const text = node.textContent ?? "";
    if (!text) continue;

    // このノードと交差するセンテンスを抽出
    const overlapping: Array<{ sentIdx: number; localStart: number; localEnd: number }> = [];
    for (let s = 0; s < sentences.length; s++) {
      const sent = sentences[s];
      if (sent.end <= start || sent.start >= end) continue;
      const localStart = Math.max(0, sent.start - start);
      const localEnd = Math.min(text.length, sent.end - start);
      if (localStart < localEnd) {
        overlapping.push({ sentIdx: s, localStart, localEnd });
      }
    }
    if (overlapping.length === 0) continue;

    // DocumentFragment 構築
    const fragment = document.createDocumentFragment();
    let pos = 0;
    for (const { sentIdx, localStart, localEnd } of overlapping) {
      // sentence 開始前の orphan テキスト (通常は空)
      if (pos < localStart) {
        fragment.appendChild(document.createTextNode(text.slice(pos, localStart)));
      }
      const span = document.createElement("span");
      span.setAttribute("data-tts-sentence-idx", String(sentIdx));
      span.appendChild(document.createTextNode(text.slice(localStart, localEnd)));
      fragment.appendChild(span);
      pos = localEnd;
    }
    // 末尾の余り
    if (pos < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(pos)));
    }

    const parent = (
      node as unknown as { parentNode: { replaceChild: (a: unknown, b: unknown) => void } | null }
    ).parentNode;
    if (parent) parent.replaceChild(fragment, node);
  }

  // 4. 修正済み HTML を取り出して返却
  const wrappedHtml = (root as unknown as { innerHTML: string }).innerHTML;
  return { html: wrappedHtml, sentences };
}
