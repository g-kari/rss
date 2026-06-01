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
import { isValidFeedUrl, isAbsoluteHttpUrl, tryParseBase } from "./url";
import { fetchFollowSafeRedirects } from "./fetch";
import type { SelectorConfig } from "../types";
import type { ParsedFeed, ParsedItem } from "./xml-parser";
import type { LDDocument, LDElement } from "./linkedom-types";
import { isParsedHtmlResult } from "./linkedom-types";
import { devError } from "./dev-log";

// workers-types 未掲載のためキャスト。CSS セレクタ推論には精度の高いモデルを使用する
const MODEL: AiModelId = "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as AiModelId;

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
    const parsed: unknown = parseHTML(html);
    if (!isParsedHtmlResult(parsed)) return [];
    doc = parsed.document;
  } catch {
    return [];
  }

  const origin = tryParseBase(baseUrl)?.origin ?? "";

  const nodes: LinkNode[] = [];
  const seen = new Set<string>();

  for (const el of doc.querySelectorAll("a[href]")) {
    const href: string = el.getAttribute("href") ?? "";
    // 危険スキームは小文字比較で網羅する。ブラウザはスキーム名を大文字小文字を問わず解釈するため、
    // `JaVaScRiPt:` 等のバイパスを防ぐ。javascript / data / vbscript / mailto / file を遮断する。
    const lowerHref = href.toLowerCase();
    if (
      !href ||
      lowerHref.startsWith("#") ||
      lowerHref.startsWith("javascript:") ||
      lowerHref.startsWith("data:") ||
      lowerHref.startsWith("vbscript:") ||
      lowerHref.startsWith("mailto:") ||
      lowerHref.startsWith("file:")
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
    if (tryParseBase(abs)?.origin !== origin) continue;
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
  excludeSelectors?: string[],
): Promise<SelectorConfig | null> {
  if (links.length < 3) return null;

  const excludeInstruction =
    excludeSelectors && excludeSelectors.length > 0
      ? ` The following selectors were tried before and did not work correctly — do NOT use any of them: ${JSON.stringify(excludeSelectors)}.`
      : "";

  const messages = [
    {
      role: "system",
      content:
        "You are a CSS selector expert. Given JSON link structures " +
        "(h=href, t=text, c=classes, p=ancestor chain as [tag,classes] pairs), " +
        "identify the CSS selector for article/post headline <a> links only " +
        `(exclude navigation, footer, sidebar).${excludeInstruction} ` +
        'Respond with ONLY one JSON line: {"articleLink":"<selector>"}',
    },
    {
      role: "user",
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
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(match[0]);
    } catch (err) {
      devError("[llm-feed-generator] inferSelectors response JSON parse failed", err);
      return null;
    }
    // AI レスポンスは信頼できないため、object であることをランタイム検証する
    if (parsedJson === null || typeof parsedJson !== "object" || Array.isArray(parsedJson)) {
      return null;
    }
    const parsed = parsedJson as Record<string, unknown>;
    if (typeof parsed.articleLink !== "string" || !parsed.articleLink) return null;

    // セレクタが構文的に有効かどうかを検証する（linkedom の querySelectorAll で試す）
    // 無効なセレクタが R2 に永続化されてクロンジョブが繰り返し失敗するのを防ぐ
    const testParsed: unknown = parseHTML("<html></html>");
    if (!isParsedHtmlResult(testParsed)) return null;
    try {
      testParsed.document.querySelectorAll(parsed.articleLink);
    } catch (err) {
      devError("[llm-feed-generator] LLM selector failed querySelectorAll validation", {
        selector: parsed.articleLink,
      });
      return null;
    }

    return {
      articleLink: parsed.articleLink,
      articleTitle: typeof parsed.articleTitle === "string" ? parsed.articleTitle : undefined,
      articleDate: typeof parsed.articleDate === "string" ? parsed.articleDate : undefined,
      model: MODEL,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    devError("[llm-feed-generator] inferSelectors failed", err);
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
  cookie?: string,
  excludeSelectors?: string[],
): Promise<{ selectors: SelectorConfig; siteTitle: string; siteUrl: string } | null> {
  const logUrl = url.replace(/[\r\n]/g, "").slice(0, 256);
  try {
    const headers: Record<string, string> = { "User-Agent": "rss-reader/1.0" };
    if (cookie) headers["Cookie"] = cookie;
    const res = await fetchFollowSafeRedirects(url, { headers }, FETCH_TIMEOUT_MS);
    if (!res.ok) return null;

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) return null;

    const html = await res.text();
    const links = extractLinkStructure(html, url);
    const selectors = await inferSelectors(links, url, ai, excludeSelectors);
    if (!selectors) return null;

    const siteTitle = extractPageTitle(html) || new URL(url).hostname;
    return { selectors, siteTitle, siteUrl: url };
  } catch (err) {
    // server-side external fetch + AI wrapper の silent fail を wrangler tail で観測可能化
    // (browser-platform.md § silent fallback 禁止 規範対象判定軸 / canonical: recommendation.ts)
    console.warn("[llm-feed-generator] inferFeedFromUrl failed:", logUrl, err);
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
    const parsed: unknown = parseHTML(html);
    if (!isParsedHtmlResult(parsed)) return { title: siteTitle, siteUrl, items: [] };
    doc = parsed.document;
  } catch {
    return { title: siteTitle, siteUrl, items: [] };
  }

  // 無効なセレクタが R2 に残存している場合に備えて SyntaxError をキャッチする
  let elements: LDElement[];
  try {
    elements = Array.from(doc.querySelectorAll(selectors.articleLink));
  } catch {
    return { title: siteTitle, siteUrl, items: [] };
  }
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
    // javascript: / data: 等の危険スキームを排除（XSS 防止）
    // xml-parser の safeUrl() と同じ基準で http(s) のみ許可する
    if (!isAbsoluteHttpUrl(link)) continue;
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
      categories: [],
      metadata: [],
    });
  }

  return { title: siteTitle, siteUrl, items };
}
