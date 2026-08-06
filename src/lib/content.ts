/**
 * 記事全文取得・コンテンツ抽出ユーティリティ
 *
 * app/api/content/route.ts の HTTP ハンドラから分離したコンテンツ処理ロジック。
 * - HTML からのメインコンテンツ抽出
 * - 後処理パイプライン（ノイズ除去・画像処理・テーブルラップ・XSS サニタイズ）
 * - 文字エンコーディング検出
 * - Cloudflare AI toMarkdown API フォールバック
 */
import {
  replaceUntilStable,
  rewriteImageUrls,
  transformZennLinkEmbeds,
  transformZennMermaidEmbeds,
  transformSpeakerDeckScriptEmbeds,
  transformSlideShareEmbedLinks,
  postProcess,
} from "./html-post-processor";
import { extractWithReadability } from "./readability-extractor";
import { extractWithRegex } from "./regex-extractor";
import { extractJsonLdImages, appendMissingJsonLdImages } from "./json-ld-images";
import { extractOgMeta, escapeHtml } from "./html";
import { isAbsoluteHttpUrl, tryParseBase } from "./url";
import { devError } from "./dev-log";

/**
 * inside-games.jp 等の thumb-list / capt-thumb-list ギャラリー UL を検出し、
 * フルサイズ (zoom) 画像の img タグ配列を返す。
 * Readability がギャラリー UL を本文外と判断して除外する場合に、
 * extractMainContent で別途呼び出して取得する。
 *
 * ギャラリーリンクの形式:
 *   <a href="/article/img/YYYY/MM/DD/ARTICLE_ID/IMAGE_ID.html">
 * フルサイズ URL の形式:
 *   https://[origin]/imgs/zoom/IMAGE_ID.jpg
 *
 * ギャラリーが存在しない場合は空配列を返す。
 */
function extractThumbListImgs(html: string, pageUrl: string): string[] {
  const origin = tryParseBase(pageUrl)?.origin ?? "";
  if (!origin) return [];

  const seen = new Set<string>();
  const imgs: string[] = [];

  const ulPattern = /<ul[^>]+class="[^"]*(?:capt-)?thumb-list[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi;
  for (const ulMatch of html.matchAll(ulPattern)) {
    // href="/article/img/.../IMAGE_ID.html" から数値 ID を取得
    for (const aMatch of ulMatch[1].matchAll(/href="[^"]*\/(\d+)\.html"/gi)) {
      const imgId = aMatch[1];
      if (seen.has(imgId)) continue;
      seen.add(imgId);
      imgs.push(`<img src="${origin}/imgs/zoom/${imgId}.jpg" loading="lazy">`);
    }
  }

  // Color Me Shop (shop-pro.jp) 商品ギャラリー: <div class="p-product-img__main-item"><img src="..."></div>
  // 商品ページは Readability が <form> 内のギャラリーを除外するため URL を直接抽出する。
  const productItemPattern =
    /<div[^>]+class="[^"]*\bp-product-img__main-item\b[^"]*"[^>]*>\s*<img[^>]+src="([^"]+)"[^>]*>\s*<\/div>/gi;
  for (const itemMatch of html.matchAll(productItemPattern)) {
    const src = itemMatch[1];
    if (seen.has(src)) continue;
    seen.add(src);
    imgs.push(`<img src="${src}" loading="lazy">`);
  }

  return imgs;
}

function countImgs(html: string): number {
  return (html.match(/<img\b/gi) ?? []).length;
}

/**
 * URL パスの末尾セグメントが「記事 slug らしい」かを判定する。
 * 記事 slug は通常「数字を含む」「ハイフン/アンダースコアを含む」「8 文字以上」のいずれかを満たす。
 * 連番記事 ID (/post/123) のようなカテゴリ + 連番パターンを除外するために使用する。
 */
function lastPathSegmentLooksLikeSlug(pathname: string): boolean {
  const segments = pathname.split("/");
  let segment = "";
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i]) {
      segment = segments[i];
      break;
    }
  }
  if (!segment) return false;
  // 純数字セグメント (/2025, /01 等) は日付アーカイブや連番 ID の可能性が高いため除外
  if (/^\d+$/.test(segment)) return false;
  return /\d/.test(segment) || /[-_]/.test(segment) || segment.length >= 8;
}

/**
 * URL から現在ページ番号を推定する。未検出なら 1 ページ目と見なす。
 */
function detectCurrentPageNumber(url: URL): number {
  for (const key of ["page", "p", "pg", "pn"]) {
    const v = url.searchParams.get(key);
    if (v && /^\d+$/.test(v)) return parseInt(v, 10);
  }
  const prefixMatch = url.pathname.match(/\/(?:page|p)\/(\d+)\/?$/i);
  if (prefixMatch) return parseInt(prefixMatch[1], 10);
  const bareMatch = url.pathname.match(/\/(\d+)\/?$/);
  if (bareMatch) {
    const before = url.pathname.replace(/\/\d+\/?$/, "");
    if (lastPathSegmentLooksLikeSlug(before)) {
      return parseInt(bareMatch[1], 10);
    }
  }
  return 1;
}

/**
 * URL pathname を percent-encoding の大文字小文字差異を吸収して正規化する。
 * decodeURI が失敗（不正シーケンス）した場合は原文を lowerCase 化してフォールバック。
 *
 * `everia.club` のように、ブラウザに表示される URL（大文字 %E5）と HTML 内ページ
 * ネーションリンク（小文字 %e5）でエンコード形式が異なるケースに対応する。
 */
function normalizePathnameForCompare(pathname: string): string {
  try {
    return decodeURI(pathname);
  } catch {
    return pathname.toLowerCase();
  }
}

/**
 * nextUrl が currentUrl の記事ページネーション的変種かどうかを判定する。
 * シリーズ記事ナビ・CMS 一覧ページネーション等の誤検知を防ぐ。
 *
 * 判定ルール（いずれか一致で true）:
 * 1. 同一パス + page/p/pg/pn クエリパラメータのみ変化
 * 2. パス末尾が /page/N または /p/N 形式
 * 3. パス末尾が /N (bare numeric) かつ base 最終セグメントが slug らしい
 *
 * pathname 比較は `normalizePathnameForCompare` で percent-encoding を正規化してから行う。
 */
function isPaginatedVariant(currentUrl: string, nextUrl: string): boolean {
  let cur: URL, next: URL;
  try {
    cur = new URL(currentUrl);
    next = new URL(nextUrl);
  } catch {
    return false;
  }

  const curPath = normalizePathnameForCompare(cur.pathname);
  const nextPath = normalizePathnameForCompare(next.pathname);

  // 1. クエリパラメータのページ番号のみ変化: /article?page=1 → /article?page=2
  if (curPath === nextPath) {
    for (const key of ["page", "p", "pg", "pn"]) {
      const nextVal = next.searchParams.get(key);
      if (nextVal !== null && /^\d+$/.test(nextVal)) {
        const curCopy = new URLSearchParams(cur.searchParams);
        const nextCopy = new URLSearchParams(next.searchParams);
        curCopy.delete(key);
        nextCopy.delete(key);
        if (curCopy.toString() === nextCopy.toString()) return true;
      }
    }
  }

  // 2. パス末尾に /page/N または /p/N が付く: /article/foo → /article/foo/page/2
  const paginationSuffix = /\/(page|p)\/\d+\/?$/i;
  if (paginationSuffix.test(nextPath)) {
    const nextBase = nextPath.replace(paginationSuffix, "").replace(/\/$/, "") || "/";
    const curBase = curPath.replace(paginationSuffix, "").replace(/\/$/, "") || "/";
    if (curBase === nextBase) return true;
  }

  // 3. パス末尾に /N のみ (bare numeric suffix) が付く: /interview/260417u → /interview/260417u/2
  //    連番記事 ID (/post/123 → /post/124) との誤検知を防ぐため、
  //    base の最終セグメントが「記事 slug らしい」ことを条件とする。
  //    cur / next の trailing slash は正規化して比較する (WordPress pretty permalink
  //    のような /.../ → /.../2/ パターンで base が不一致になるのを防ぐ)。
  const bareNumericSuffix = /\/\d+\/?$/;
  if (bareNumericSuffix.test(nextPath)) {
    const nextBase = nextPath.replace(bareNumericSuffix, "").replace(/\/$/, "") || "/";
    const curBase = curPath.replace(bareNumericSuffix, "").replace(/\/$/, "") || "/";
    if (curBase === nextBase && nextBase !== "/" && lastPathSegmentLooksLikeSlug(nextBase)) {
      return true;
    }
  }

  return false;
}

/**
 * HTTP レスポンスから文字エンコーディングを検出する。
 * 優先順位: Content-Type ヘッダー → HTML meta charset → UTF-8 フォールバック
 * Shift-JIS / EUC-JP など非 UTF-8 ページ（ITMedia 等）の文字化けを防ぐ。
 */
export function detectCharset(contentType: string, bodyBytes: Uint8Array): string {
  const ctMatch = contentType.match(/charset\s*=\s*([^\s;]+)/i);
  if (ctMatch?.[1]) return ctMatch[1];

  const preview = new TextDecoder("latin1").decode(bodyBytes.slice(0, 2048));

  const metaCharset = preview.match(/<meta\b[^>]+charset\s*=\s*["']?([^"'\s;>]+)/i)?.[1];
  if (metaCharset) return metaCharset;

  const metaHttp = preview.match(
    /<meta\b[^>]+content\s*=\s*["'][^"']*;\s*charset\s*=\s*([^"'\s;>]+)/i,
  )?.[1];
  if (metaHttp) return metaHttp;

  return "utf-8";
}

/**
 * バイト列を指定チャーセットで文字列に変換する。
 * チャーセットが TextDecoder 非対応の場合は UTF-8 でフォールバックする。
 */
export function decodeBytesToString(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

/**
 * 抽出された HTML コンテンツが十分かどうかを判定する。
 * タグを除去したテキスト量が minChars 未満の場合は不十分と判断する。
 */
export function isContentSufficient(html: string, minChars = 200): boolean {
  // タグ除去は不動点反復で行い、`<<script>>` のようなバイパス入力でも
  // テキスト量評価にタグ文字列が紛れ込まないようにする。
  const text = replaceUntilStable(html, /<[^>]+>/g)
    .replace(/\s+/g, " ")
    .trim();
  return text.length >= minChars;
}

/**
 * Cloudflare AI toMarkdown API に HTML を送信して Markdown を取得する。
 * CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN が未設定の場合は null を返す。
 */
export async function fetchMarkdownFromHtml(
  html: string,
  hostname: string,
): Promise<string | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) return null;

  try {
    const MAX_TOMARKDOWN_BYTES = 500_000; // 500KB
    const truncatedHtml =
      html.length > MAX_TOMARKDOWN_BYTES ? html.slice(0, MAX_TOMARKDOWN_BYTES) : html;
    const formData = new FormData();
    formData.append("files", new Blob([truncatedHtml], { type: "text/html" }), "page.html");
    formData.append("conversionOptions", JSON.stringify({ hostname }));

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/tomarkdown`,
      { method: "POST", headers: { Authorization: `Bearer ${apiToken}` }, body: formData },
    );
    if (!res.ok) {
      devError("[content] fetchMarkdownFromHtml upstream error", { status: res.status });
      return null;
    }

    const json = (await res.json()) as {
      result: { data?: string; error?: string }[];
      success: boolean;
    };
    return json.success ? (json.result[0]?.data ?? null) : null;
  } catch (err) {
    devError("[content] fetchMarkdownFromHtml failed", err);
    return null;
  }
}

/**
 * Markdown を HTML に変換する（marked 使用）。
 */
export async function markdownToHtml(md: string): Promise<string> {
  const { marked } = await import("marked");
  return marked.parse(md, { async: false }) as string;
}

/**
 * JavaScript の loadImage('elementId', 'jpgUrl', 'gifUrl') パターンで動的に設定される
 * 画像 URL を静的に解決する。
 * digitallover.moe 等が WordPress プラグインで埋め込む非標準遅延ロード画像に対応。
 * preClean で <script> が除去される前に元 HTML から URL を抽出して img[src] に差し込む。
 *
 * **gif 優先採用 ロジック**: `loadImage(id, jpg, gif)` で第 3 引数 (gif) があり、かつ
 * https:// URL なら gif を採用する。digitallover.moe では jpg は静止サムネ・gif が
 * 本物の動的画像で、jpg 側は 404 を返すケースがあるため (実測: jpg=404, gif=200)。
 * gif が無い / 不正なら jpg にフォールバック。
 */
/**
 * @internal テスト用 export — 本番の呼び出し元は extractMainContent のみ。
 * 本関数はテスト (e2e/script-loaded-images.spec.ts) の import のために export されている。
 */
export function resolveScriptLoadedImages(html: string): string {
  const idToUrl = new Map<string, string>();
  for (const scriptMatch of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/gi)) {
    for (const callMatch of scriptMatch[1].matchAll(
      /loadImage\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/gi,
    )) {
      const [, elementId, jpgUrl, gifUrl] = callMatch;
      const preferred =
        gifUrl && isAbsoluteHttpUrl(gifUrl) ? gifUrl : isAbsoluteHttpUrl(jpgUrl) ? jpgUrl : null;
      if (preferred) idToUrl.set(elementId, preferred);
    }
  }
  if (idToUrl.size === 0) return html;

  return html.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
    const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
    if (!idMatch) return _match;
    const url = idToUrl.get(idMatch[1]);
    if (!url) return _match;
    // 既に有効な src があれば変更しない
    const srcMatch = attrs.match(/\bsrc\s*=\s*["']([^"']*)["']/i);
    if (srcMatch && isAbsoluteHttpUrl(srcMatch[1])) return _match;
    // src を上書き or 先頭に追加
    const newAttrs = /\bsrc\s*=/i.test(attrs)
      ? attrs.replace(/\bsrc\s*=\s*["'][^"']*["']/i, `src="${url}"`)
      : ` src="${url}"${attrs}`;
    return `<img${newAttrs}>`;
  });
}

/**
 * HTML からメインコンテンツを抽出する。
 * Readability.js 優先、失敗時は正規表現ベースにフォールバックする。
 * - readability: @mozilla/readability + linkedom で高精度抽出
 * - regex: サイト固有セレクター → EC セレクター → 汎用セレクターのフォールバック
 */
export function extractMainContent(
  html: string,
  pageUrl: string,
): { content: string; source: "readability" | "regex" } {
  // SpeakerDeck は CSR サービスのため静的 HTML に <script class="speakerdeck-embed"> が
  // 存在しない。代わりに <meta property="og:video"> にプレイヤー URL が含まれる (#896)。
  // any transform の前に元 HTML から og:video を抽出する。
  const ogVideo = extractOgMeta(html, "video");
  const speakdeckPlayerUrl = /^https:\/\/speakerdeck\.com\/player\/[a-f0-9]+/i.test(ogVideo)
    ? ogVideo
    : null;
  const augmentWithSpeakerDeck = (content: string): string => {
    if (!speakdeckPlayerUrl) return content;
    // 既に speakerdeck player iframe が含まれていれば追加しない (冪等)
    if (/speakerdeck\.com\/player\//.test(content)) return content;
    return (
      `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:1.25em 0;border-radius:8px">` +
      `<iframe src="${escapeHtml(speakdeckPlayerUrl)}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" loading="lazy" allowfullscreen title="SpeakerDeck スライド"></iframe>` +
      `</div>\n` +
      content
    );
  };

  // JS で動的に src を設定する loadImage('id', url, ...) パターンを静的解決する。
  // preClean で <script> が除去される前に行う必要がある。
  let preprocessed = resolveScriptLoadedImages(html);

  // SpeakerDeck の <script class="speakerdeck-embed"> を <iframe> に変換する。
  // preClean で <script> が除去される前に行う必要がある。
  preprocessed = transformSpeakerDeckScriptEmbeds(preprocessed);

  // SlideShare のリンクを iframe 埋め込みに変換する。
  // Readability が <a> タグを本文外と判定して除去することがあるため、
  // Readability 実行前に変換しておく。
  preprocessed = transformSlideShareEmbedLinks(preprocessed);

  // Zenn embed (card / tweet / mermaid) は iframe を <p><a> や <pre><code> に変換しておく。
  // Readability は iframe を本文外と判定して span ごと削除することがあるため、
  // postProcess より前 — Readability 実行前 — に変換しないと埋め込み URL が消失する (Issue #88)。
  preprocessed = transformZennLinkEmbeds(preprocessed);
  preprocessed = transformZennMermaidEmbeds(preprocessed, pageUrl);

  // thumb-list / capt-thumb-list ギャラリーを別途取得する。
  // Readability はリスト形式のギャラリーを本文外と判断して除外することがあるため、
  // 元 HTML から独立して抽出し本文末尾に hidden div として付与する。
  // クライアント側の画像一覧（ImageGallery）が DOM からこれらの画像を拾う。
  const galleryImgs = extractThumbListImgs(preprocessed, pageUrl);
  const buildGallery = () =>
    galleryImgs.length > 0 ? rewriteImageUrls(`<div hidden>${galleryImgs.join("")}</div>`) : "";

  // JSON-LD `Article` 型の `image` フィールドを採取して、抽出結果に主要画像が含まれて
  // いない場合のフォールバック補完源とする。Readability が画像主体ページで「推薦」等を
  // 本文と誤判定して主要画像を取りこぼす症状の defensive backup。
  const jsonLdImages = extractJsonLdImages(preprocessed);
  const augmentWithJsonLd = (content: string) =>
    jsonLdImages.length > 0 ? appendMissingJsonLdImages(content, jsonLdImages) : content;

  const rc = extractWithReadability(preprocessed, pageUrl);
  if (rc && isContentSufficient(rc)) {
    // Readability が元ページの画像を大量に削除した場合は regex フォールバックを優先する。
    // 例: PR TIMES のように画像主体のプレスリリースでは Readability が本文画像をほぼ除去する。
    // 条件: 元 HTML に 8 枚以上の img があり、Readability の結果が 20% 未満の場合に regex を試す。
    const srcImgCount = countImgs(preprocessed);
    const rcImgCount = countImgs(rc);
    if (srcImgCount >= 8 && rcImgCount * 5 < srcImgCount) {
      const regexContent = extractWithRegex(preprocessed, pageUrl);
      const regexImgCount = countImgs(regexContent);
      // rcImgCount が 0 の場合 rcImgCount * 2 = 0 となり条件が常に true になるため
      // Math.max(1, ...) で「regex に最低 1 枚以上の img がある」ことを保証する
      if (regexImgCount >= Math.max(1, rcImgCount * 2)) {
        return {
          content: augmentWithSpeakerDeck(augmentWithJsonLd(regexContent)) + buildGallery(),
          source: "regex",
        };
      }
    }
    return {
      content: augmentWithSpeakerDeck(augmentWithJsonLd(postProcess(rc, pageUrl))) + buildGallery(),
      source: "readability",
    };
  }
  const regexContent = extractWithRegex(preprocessed, pageUrl);
  return {
    content: augmentWithSpeakerDeck(augmentWithJsonLd(regexContent)) + buildGallery(),
    source: "regex",
  };
}

/**
 * HTML から次ページ URL を検出する。
 * `<link rel="next">` および `<a rel="next">` の標準 HTML シグナルに対応。
 * 同一オリジンへの URL のみ返す（外部サイトへの誤誘導を防ぐ）。
 * URL パターンが記事ページネーション的でない場合は除外（誤検知対策）。
 */
export function detectNextPageUrl(html: string, currentUrl: string): string | null {
  const base = tryParseBase(currentUrl);
  if (!base) return null;

  function resolve(href: string): string | null {
    if (!href || href.startsWith("#")) return null;
    const lowerHref = href.toLowerCase();
    // javascript: / data: に加えて vbscript: も拒否する。旧 IE 系の vbscript: を経由した
    // XSS は現代ブラウザでは動作しないが、既知の危険スキーム網羅の観点から明示的に遮断する。
    if (
      lowerHref.startsWith("javascript:") ||
      lowerHref.startsWith("data:") ||
      lowerHref.startsWith("vbscript:")
    )
      return null;
    try {
      const resolved = new URL(href, base!).href;
      if (resolved === currentUrl) return null;
      if (new URL(resolved).origin !== base!.origin) return null;
      if (!isPaginatedVariant(currentUrl, resolved)) return null;
      return resolved;
    } catch {
      return null;
    }
  }

  // <link rel="next" href="..."> (最も信頼性が高い)
  const linkRelNext =
    html.match(/<link\b[^>]+\brel=["'][^"']*\bnext\b[^"']*["'][^>]+\bhref=["']([^"']+)["']/i) ??
    html.match(/<link\b[^>]+\bhref=["']([^"']+)["'][^>]+\brel=["'][^"']*\bnext\b[^"']*["']/i);
  if (linkRelNext?.[1]) return resolve(linkRelNext[1]);

  // <a rel="next" href="...">
  const aRelNext =
    html.match(/<a\b[^>]+\brel=["'][^"']*\bnext\b[^"']*["'][^>]+\bhref=["']([^"']+)["']/i) ??
    html.match(/<a\b[^>]+\bhref=["']([^"']+)["'][^>]+\brel=["'][^"']*\bnext\b[^"']*["']/i);
  if (aRelNext?.[1]) return resolve(aRelNext[1]);

  // フォールバック: rel="next" が無いページネーション (denfaminicogamer 等) 対応。
  // 現在ページ番号を URL から推定し、テキストが「currentPage + 1」の数字リンクを探す。
  // href が isPaginatedVariant を満たすもののみ採用し、誤検知を抑える。
  const currentPage = detectCurrentPageNumber(base);
  const expectedNext = `${currentPage + 1}`;
  const anchorPattern = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(anchorPattern)) {
    // 不動点反復で除去しないと `<<a>a>` のようなバイパス入力で
    // タグ片が再結合し、CodeQL の incomplete-multi-character-sanitization に引っかかる。
    const text = replaceUntilStable(m[2], /<[^>]+>/g).trim();
    if (text !== expectedNext) continue;
    const hrefMatch = m[1].match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const resolved = resolve(hrefMatch[1]);
    if (resolved) return resolved;
  }

  return null;
}
