/**
 * LLM による CSS セレクタ推論を使って RSS のないサイトからフィードを生成するユーティリティ。
 *
 * フロー:
 * 1. ページ HTML をフェッチ
 * 2. <a> タグ構造（href / テキスト / クラス / 祖先 5 段）を抽出・圧縮
 * 3. Workers AI (llama-3.1-8b) にセレクタ推論を依頼（1 行 JSON で返す）
 * 4. 推論したセレクタで HTML をスクレイプし ParsedFeed を返す
 */

import { parseHTML } from "linkedom/worker";
import { isValidFeedUrl } from "./url";
import { fetchFollowSafeRedirects } from "./fetch";
import type { SelectorConfig } from "../types";
import type { ParsedFeed, ParsedItem } from "./xml-parser";

/**
 * linkedom の DOM 操作に使用する最小インターフェース。
 * linkedom の型定義は DOM 標準と完全には互換していないため、
 * 必要なプロパティ・メソッドのみを定義して `any` を排除する。
 */
interface LDElement {
  getAttribute(name: string): string | null;
  textContent: string | null;
  className: string;
  tagName: string;
  parentElement: LDElement | null;
  querySelector(selector: string): LDElement | null;
}

interface LDDocument {
  querySelectorAll(selector: string): Iterable<LDElement>;
}

// ai-route-helper.ts と同じモデル（workers-types 未掲載のためキャスト）
const MODEL = "@cf/meta/llama-3.1-8b-instruct" as "@cf/meta/llama-3.1-8b-instruct-fp8";

/** LLM に渡す圧縮リンク構造 */
interface LinkNode {
  /** href（絶対 URL） */
  h: string;
  /** リンクテキスト（最大 80 文字） */
  t: string;
  /** <a> 自身の className */
  c: string[];
  /** 祖先タグ情報（最大 5 段、[tag, classes[]] の配列） */
  p: Array<[string, string[]]>;
}

const MAX_LINKS = 40;
const MAX_TEXT = 80;
const ANCESTOR_DEPTH = 5;
const FETCH_TIMEOUT_MS = 8_000;

// ── リンク構造抽出 ────────────────────────────────────────────────────

/**
 * HTML から記事候補の <a> タグ構造を抽出する。
 * ナビ・フッター・外部リンクは除外し、最大 MAX_LINKS 件を返す。
 */
export function extractLinkStructure(html: string, baseUrl: string): LinkNode[] {
  let doc: LDDocument;
  try {
    ({ document: doc } = parseHTML(html) as { document: LDDocument });
  } catch {
    return [];
  }

  const origin = (() => {
    try {
      return new URL(baseUrl).origin;
    } catch {
      return "";
    }
  })();

  const nodes: LinkNode[] = [];
  const seen = new Set<string>();

  for (const el of doc.querySelectorAll("a[href]")) {
    const href: string = el.getAttribute("href") ?? "";
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("javascript:") ||
      href.startsWith("mailto:")
    )
      continue;

    let abs: string;
    try {
      abs = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }

    // SSRF ガード + 同一オリジン縛り（外部ドメインは除外）
    if (!isValidFeedUrl(abs)) continue;
    try {
      if (new URL(abs).origin !== origin) continue;
    } catch {
      continue;
    }
    if (seen.has(abs)) continue;
    seen.add(abs);

    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    if (text.length < 5) continue; // アイコン・ボタン類を除外

    const c: string[] = el.className.split(/\s+/).filter(Boolean);

    const p: Array<[string, string[]]> = [];
    let parent = el.parentElement;
    while (parent && parent.tagName !== "BODY" && p.length < ANCESTOR_DEPTH) {
      p.push([parent.tagName.toLowerCase(), parent.className.split(/\s+/).filter(Boolean)]);
      parent = parent.parentElement;
    }

    nodes.push({ h: abs, t: text, c, p });
    if (nodes.length >= MAX_LINKS) break;
  }
  return nodes;
}

// ── LLM セレクタ推論 ──────────────────────────────────────────────────

/**
 * Workers AI を使って記事リンクの CSS セレクタを推論する。
 * 3 文字未満のリンクリストは推論不可として null を返す。
 */
export async function inferSelectors(
  links: LinkNode[],
  siteUrl: string,
  ai: Ai,
): Promise<SelectorConfig | null> {
  if (links.length < 3) return null;

  const messages = [
    {
      role: "system" as const,
      content:
        "You are a CSS selector expert. Given JSON link structures " +
        "(h=href, t=text, c=classes, p=ancestor chain as [tag,classes] pairs), " +
        "identify the CSS selector for article/post headline <a> links only " +
        "(exclude navigation, footer, sidebar). " +
        'Respond with ONLY one JSON line: {"articleLink":"<selector>"}',
    },
    {
      role: "user" as const,
      content: `Site: ${siteUrl}\nLinks: ${JSON.stringify(links)}`,
    },
  ];

  try {
    const res = (await (ai as Ai).run(MODEL, { messages, max_tokens: 120 })) as {
      response?: string;
    };
    const raw = (res.response ?? "").trim();
    // JSON ブロックを抽出（```json ... ``` にも対応）
    const match = raw.match(/\{[^}]*"articleLink"\s*:\s*"[^"]+?"[^}]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (typeof parsed.articleLink !== "string" || !parsed.articleLink) return null;

    return {
      articleLink: parsed.articleLink,
      articleTitle: typeof parsed.articleTitle === "string" ? parsed.articleTitle : undefined,
      articleDate: typeof parsed.articleDate === "string" ? parsed.articleDate : undefined,
      model: MODEL,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ── メインエントリポイント ─────────────────────────────────────────────

function extractPageTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return (m?.[1] ?? "").replace(/\s+/g, " ").trim();
}

/**
 * URL をフェッチし LLM でセレクタを推論する。
 * RSS が見つからないページへのフォールバックとして使用する。
 *
 * @returns セレクタ設定とサイト情報（成功）、または null（推論失敗・エラー）
 */
export async function inferFeedFromUrl(
  url: string,
  ai: Ai,
): Promise<{ selectors: SelectorConfig; siteTitle: string; siteUrl: string } | null> {
  try {
    const res = await fetchFollowSafeRedirects(
      url,
      {
        headers: { "User-Agent": "rss-reader/1.0" },
      },
      FETCH_TIMEOUT_MS,
    );
    if (!res.ok) return null;

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) return null;

    const html = await res.text();
    const links = extractLinkStructure(html, url);
    const selectors = await inferSelectors(links, url, ai);
    if (!selectors) return null;

    const siteTitle = extractPageTitle(html) || new URL(url).hostname;
    return { selectors, siteTitle, siteUrl: url };
  } catch {
    return null;
  }
}

// ── CSS セレクタによる記事スクレイピング ──────────────────────────────

/**
 * CSS セレクタを使って HTML から記事一覧を抽出し、ParsedFeed 形式で返す。
 * cron フェッチから呼び出される。
 */
export function scrapeFeed(
  html: string,
  selectors: SelectorConfig,
  siteUrl: string,
  siteTitle: string,
): ParsedFeed {
  let doc: LDDocument;
  try {
    ({ document: doc } = parseHTML(html) as { document: LDDocument });
  } catch {
    return { title: siteTitle, siteUrl, items: [] };
  }

  const elements = Array.from(doc.querySelectorAll(selectors.articleLink));
  const items: ParsedItem[] = [];
  const seen = new Set<string>();

  for (const el of elements.slice(0, 100)) {
    // セレクタが <a> 以外を返した場合は内部の <a> を探す
    const anchor = el.tagName === "A" ? el : (el.querySelector("a") ?? null);
    if (!anchor) continue;

    const href = anchor.getAttribute("href") ?? "";
    if (!href || href.startsWith("#")) continue;

    let link: string;
    try {
      link = new URL(href, siteUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(link)) continue;
    seen.add(link);

    const title = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!title) continue;

    items.push({
      guid: link,
      title,
      link,
      summary: "",
      content: "",
      ogImage: "",
      author: "",
      publishedAt: null,
    });
  }

  return { title: siteTitle, siteUrl, items };
}
