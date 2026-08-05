/**
 * HTML → Markdown 変換ユーティリティ
 *
 * linkedom/worker を使ってサーバー・テスト環境でも動作する。
 * ブラウザ環境では DOM API を直接利用する。
 *
 * 設計参考: Readeck (AGPL v3.0) — コード流用なし、設計のみ参考
 */

import { parseHTML } from "linkedom/worker";
import type { Article, Feed } from "@/types";
import { sanitizeObsidianFilename } from "@/lib/obsidian";

// ===== DOM 抽象化 =====

type DOMNode = {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: DOMNode[];
  getAttribute?: (name: string) => string | null;
};

/** ブラウザ DOM ノードを DOMNode に変換する（NodeList → 配列に正規化） */
function domToNode(node: ChildNode | Element): DOMNode {
  return {
    nodeType: node.nodeType,
    nodeName: node.nodeName,
    textContent: node.textContent,
    childNodes: Array.from(node.childNodes).map(domToNode),
    getAttribute: (node as Element).getAttribute?.bind(node as Element),
  };
}

/** HTML 文字列を DOM ノードに変換する */
function parseHtml(html: string): DOMNode {
  // ブラウザ環境
  if (typeof document !== "undefined") {
    const div = document.createElement("div");
    div.innerHTML = html;
    return domToNode(div);
  }

  // Node.js / テスト環境 (linkedom/worker)
  const { document: doc } = parseHTML(`<html><body><div id="__root__">${html}</div></body></html>`);
  // linkedom の Document 型は DOMNode[] を持つ body を型定義で公開しないため、unknown 経由でキャスト
  const body = (doc as unknown as { body: DOMNode }).body;
  // __root__ div を探す
  for (const child of body.childNodes) {
    if (child.nodeType === 1 && child.getAttribute?.("id") === "__root__") {
      return child;
    }
  }
  return body;
}

// ===== ノードウォーカー =====

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function nodeToMarkdown(node: DOMNode, depth = 0): string {
  if (node.nodeType === TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node.nodeType !== ELEMENT_NODE) return "";

  const tag = node.nodeName.toLowerCase();
  const children = () => node.childNodes.map((c) => nodeToMarkdown(c, depth)).join("");

  switch (tag) {
    // ルートラッパー
    case "div":
    case "article":
    case "section":
    case "main":
    case "span":
      return children();

    // 見出し
    case "h1":
      return `\n# ${children().trim()}\n`;
    case "h2":
      return `\n## ${children().trim()}\n`;
    case "h3":
      return `\n### ${children().trim()}\n`;
    case "h4":
      return `\n#### ${children().trim()}\n`;
    case "h5":
      return `\n##### ${children().trim()}\n`;
    case "h6":
      return `\n###### ${children().trim()}\n`;

    // 段落・ブロック
    case "p":
      return `\n${children().trim()}\n`;
    case "br":
      return "\n";
    case "hr":
      return "\n---\n";

    // 強調
    case "strong":
    case "b": {
      const inner = children().trim();
      return inner ? `**${inner}**` : "";
    }
    case "em":
    case "i": {
      const inner = children().trim();
      return inner ? `*${inner}*` : "";
    }
    case "del":
    case "s": {
      const inner = children().trim();
      return inner ? `~~${inner}~~` : "";
    }

    // リンク
    case "a": {
      const href = node.getAttribute?.("href") ?? "";
      const text = children().trim();
      if (!href) return text;
      return `[${text}](${href})`;
    }

    // 画像
    case "img": {
      const src = node.getAttribute?.("src") ?? "";
      const alt = node.getAttribute?.("alt") ?? "";
      return src ? `![${alt}](${src})` : "";
    }

    // コード
    case "code": {
      const text = node.textContent ?? "";
      // pre 配下かどうかは親で判断するので、ここでは inline 扱い
      return `\`${text}\``;
    }
    case "pre": {
      // pre > code を探す
      const codeNode = node.childNodes.find(
        (c) => c.nodeType === ELEMENT_NODE && c.nodeName.toLowerCase() === "code",
      );
      const lang =
        (codeNode as { getAttribute?: (n: string) => string | null } | undefined)
          ?.getAttribute?.("class")
          ?.match(/language-(\w+)/)?.[1] ?? "";
      const text = (codeNode?.textContent ?? node.textContent ?? "").trimEnd();
      return `\n\`\`\`${lang}\n${text}\n\`\`\`\n`;
    }

    // 引用
    case "blockquote": {
      const inner = nodeChildrenToMarkdown(node.childNodes, depth);
      return (
        "\n" +
        inner
          .trim()
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n") +
        "\n"
      );
    }

    // リスト
    case "ul": {
      const items = node.childNodes
        .filter((c) => c.nodeType === ELEMENT_NODE && c.nodeName.toLowerCase() === "li")
        .map(
          (li) =>
            `${"  ".repeat(depth)}- ${nodeChildrenToMarkdown(li.childNodes, depth + 1).trim()}`,
        )
        .join("\n");
      return `\n${items}\n`;
    }
    case "ol": {
      const items = node.childNodes
        .filter((c) => c.nodeType === ELEMENT_NODE && c.nodeName.toLowerCase() === "li")
        .map(
          (li, i) =>
            `${"  ".repeat(depth)}${i + 1}. ${nodeChildrenToMarkdown(li.childNodes, depth + 1).trim()}`,
        )
        .join("\n");
      return `\n${items}\n`;
    }
    case "li":
      return children();

    // テーブル（シンプル変換）
    case "table":
      return `\n${children()}\n`;
    case "thead":
    case "tbody":
    case "tfoot":
    case "tr":
      return `${children()}\n`;
    case "th":
    case "td":
      return `| ${children().trim()} `;

    // スクリプト・スタイルは除去
    case "script":
    case "style":
    case "noscript":
    case "head":
      return "";

    default:
      return children();
  }
}

function nodeChildrenToMarkdown(nodes: DOMNode[], depth: number): string {
  return nodes.map((c) => nodeToMarkdown(c, depth)).join("");
}

function nodeToPlainText(node: DOMNode): string {
  if (node.nodeType === TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== ELEMENT_NODE) return "";

  const tag = node.nodeName.toLowerCase();
  const children = () => node.childNodes.map(nodeToPlainText).join("");

  switch (tag) {
    case "script":
    case "style":
    case "noscript":
    case "head":
      return "";
    case "br":
      return "\n";
    case "li":
      return `\n• ${children().trim()}\n`;
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
    case "p":
    case "blockquote":
    case "pre":
    case "tr":
    case "div":
    case "article":
    case "section":
    case "main":
      return `\n${children()}\n`;
    case "img":
      return node.getAttribute?.("alt") ?? "";
    default:
      return children();
  }
}

// ===== 公開 API =====

/**
 * HTML 文字列を Markdown に変換する。
 *
 * @param html - 変換元 HTML
 * @returns Markdown 文字列（前後の空白を除去）
 */
export function htmlToMarkdown(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return "";

  const root = parseHtml(trimmed);
  const md = nodeToMarkdown(root);

  // 連続する空行を最大 2 行に正規化
  return md.replace(/\n{3,}/g, "\n\n").trim();
}

/** HTML を装飾なしの、改行を保ったプレーンテキストへ変換する。 */
function htmlToPlainText(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return "";

  return nodeToPlainText(parseHtml(trimmed))
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\r?\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** 記事タイトルを Markdown リンクラベルとして安全にエスケープする。 */
function escapeMarkdownLinkLabel(value: string): string {
  return value.replace(/[\\[\]]/g, "\\$&");
}

/** 記事を短い Markdown リンクへ変換する。 */
export function articleToMarkdownLink(article: Article): string {
  const title = escapeMarkdownLinkLabel(article.title || article.link);
  return `[${title}](${article.link})`;
}

/** ISO 8601 の公開日時から有効な YYYY-MM-DD だけを取り出す。 */
function extractPublishedDate(publishedAt: string | null | undefined): string | undefined {
  const date = publishedAt?.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/)?.[1];
  if (!date || Number.isNaN(Date.parse(date))) return undefined;
  return new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date ? date : undefined;
}

/** 記事を著者・フィード名・公開日付きの Markdown 引用形式へ変換する。 */
export function articleToMarkdownCitation(article: Article, feed?: Feed): string {
  const metadata = [
    article.author?.trim(),
    feed?.title.trim(),
    extractPublishedDate(article.publishedAt),
  ].filter((value): value is string => Boolean(value));
  const link = articleToMarkdownLink(article);

  return metadata.length > 0 ? `${link} — ${metadata.join(" · ")}` : link;
}

// ===== YAML frontmatter 生成 =====

/** YAML 文字列値を安全にクォートする（ダブルクォート含む場合はシングルクォートで囲む） */
function yamlValue(value: string): string {
  // frontmatter のスカラ値は単一行が妥当。生の改行 (RSS title の CDATA / 整形由来) を
  // クォート内にそのまま入れると flow scalar が複数行に跨り invalid YAML になるため空白化する。
  const singleLine = value.replace(/[\r\n]+/g, " ");
  if (
    singleLine.includes('"') ||
    singleLine.includes("\\") ||
    singleLine.includes(":") ||
    singleLine.includes("#")
  ) {
    // シングルクォートエスケープ: ' → ''
    return `'${singleLine.replace(/'/g, "''")}'`;
  }
  return `"${singleLine}"`;
}

/**
 * 記事の YAML frontmatter を生成する（Obsidian 互換）。
 *
 * @param article - 記事データ
 * @param feed - フィードデータ（フィード名の取得用）
 * @returns `---` で囲まれた YAML 文字列
 */
export function generateFrontmatter(article: Article, feed: Feed): string {
  const lines: string[] = ["---"];

  lines.push(`title: ${yamlValue(article.title)}`);
  lines.push(`url: ${yamlValue(article.link)}`);
  lines.push(`feed: ${yamlValue(feed.title)}`);

  if (article.author) {
    lines.push(`author: ${yamlValue(article.author)}`);
  }

  if (article.publishedAt) {
    // ISO → YYYY-MM-DD
    const date = article.publishedAt.slice(0, 10);
    lines.push(`published: ${date}`);
  }

  lines.push("---");
  return lines.join("\n");
}

/**
 * 記事 1 件分の完全な Markdown（frontmatter + 本文）を生成する。
 *
 * @param article - 記事データ
 * @param feed - フィードデータ
 * @param contentHtml - フェッチ済みの全文 HTML（なければ summary を使用）
 * @returns Markdown 文字列
 */
export function articleToMarkdown(article: Article, feed: Feed, contentHtml?: string): string {
  const frontmatter = generateFrontmatter(article, feed);
  const bodyHtml = contentHtml || article.summary || "";
  const body = bodyHtml ? htmlToMarkdown(bodyHtml) : "";

  return [frontmatter, "", body].filter(Boolean).join("\n");
}

/** 取得済み本文を優先し、記事本文を貼り付け向けプレーンテキストへ変換する。 */
export function articleBodyToPlainText(article: Article, contentHtml?: string): string {
  return htmlToPlainText(contentHtml || article.summary || "");
}

/** 記事のプレーンテキスト保存用コンテンツと安全なファイル名を生成する。 */
export function buildArticleTextFile(
  article: Article,
  contentHtml?: string,
): { content: string; filename: string } {
  const basename = sanitizeObsidianFilename(article.title) || "article";
  return {
    content: articleBodyToPlainText(article, contentHtml),
    filename: `${basename}.txt`,
  };
}

/** 記事の Markdown ダウンロード用コンテンツと安全なファイル名を生成する。 */
export function buildArticleMarkdownFile(
  article: Article,
  feed: Feed,
  contentHtml?: string,
): { content: string; filename: string } {
  const basename = sanitizeObsidianFilename(article.title) || "article";
  return {
    content: articleToMarkdown(article, feed, contentHtml),
    filename: `${basename}.md`,
  };
}
