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

// ===== DOM 抽象化 =====

type DOMNode = {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: DOMNode[];
  getAttribute?: (name: string) => string | null;
};

/** HTML 文字列を DOM ノードに変換する */
function parseHtml(html: string): DOMNode {
  // ブラウザ環境
  if (typeof document !== "undefined") {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div as unknown as DOMNode;
  }

  // Node.js / テスト環境 (linkedom/worker)
  const { document: doc } = parseHTML(`<html><body><div id="__root__">${html}</div></body></html>`);
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

// ===== YAML frontmatter 生成 =====

/** YAML 文字列値を安全にクォートする（ダブルクォート含む場合はシングルクォートで囲む） */
function yamlValue(value: string): string {
  if (value.includes('"') || value.includes("\\") || value.includes(":") || value.includes("#")) {
    // シングルクォートエスケープ: ' → ''
    return `'${value.replace(/'/g, "''")}'`;
  }
  return `"${value}"`;
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
