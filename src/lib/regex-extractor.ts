import { buildImageSlider, postProcess, replaceUntilStable } from "./html-post-processor";

/**
 * pageUrl が zenn.dev ドメインかどうかを URL パースで厳密に検証する。
 * includes() による部分文字列マッチは "zenn.dev.evil.com" でバイパスできるため、
 * hostname を正確に検証する。
 */
function isZennDevUrl(pageUrl: string): boolean {
  try {
    const h = new URL(pageUrl).hostname;
    return h === "zenn.dev" || h.endsWith(".zenn.dev");
  } catch {
    return false;
  }
}

/**
 * <head> / <nav> / <header> 等のページクローム要素を除去してコンテンツ部分のみ残す。
 */
export function stripPageChrome(html: string): string {
  const BLOCK_TAGS = ["head", "nav", "header", "footer", "aside", "form"] as const;
  let result = html;
  for (const tag of BLOCK_TAGS) {
    // 閉じタグは HTML5 仕様どおり `</tag attr>` も受容する。
    // さらに不動点反復でネスト再出現バイパス (`<na<nav></nav>v>`) を潰す。
    result = replaceUntilStable(
      result,
      new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\b[^>]*>`, "gi"),
    );
  }
  // HTML コメントも同様に不動点反復で除去（`<!--<!-- -->-->` バイパス対策）。
  return replaceUntilStable(result, /<!--[\s\S]*?-->/g);
}

/**
 * 正規表現ベースのフォールバック抽出。
 * サイト固有セレクター → EC 商品ページ → 汎用セレクターの順でフォールバックする。
 */
export function extractWithRegex(html: string, pageUrl: string): string {
  const cleaned = stripPageChrome(html);

  // --- サイト固有セレクター ---

  // Qiita: itemprop="articleBody" または class="it-MdContent"
  const qiitaBody = cleaned.match(/<(\w+)[^>]+itemprop=["']articleBody["'][^>]*>([\s\S]*?)<\/\1>/i);
  if (qiitaBody?.[2]) return postProcess(qiitaBody[2], pageUrl);

  const qiitaMd = cleaned.match(
    /<(\w+)[^>]+class=["'][^"']*it-MdContent[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i,
  );
  if (qiitaMd?.[2]) return postProcess(qiitaMd[2], pageUrl);

  // Zenn (zenn.dev): class="znc" を <article> より優先
  // 他ドメイン (classmethod 等 Zenn の記事システムを流用するサイト) では
  // <article> を先に試し、なければ znc にフォールバックする
  const zncMatch = cleaned.match(
    /<(\w+)[^>]+class=["'][^"']*\bznc\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i,
  );
  if (zncMatch?.[2] && isZennDevUrl(pageUrl)) return postProcess(zncMatch[2], pageUrl);

  // --- EC / 商品ページセレクター ---

  // Schema.org itemprop="description" (Shopify 等の EC サイト全般)
  const schemaDesc = cleaned.match(
    /<(\w+)[^>]+itemprop=["']description["'][^>]*>([\s\S]*?)<\/\1>/i,
  );
  if (schemaDesc?.[2]) return postProcess(schemaDesc[2], pageUrl);

  // Shopify: product__description / product-single__description / product-description 等
  // description は通常テキストのみなので、商品メイン画像を別途収集して先頭に付与する
  const shopifyDesc = cleaned.match(
    /<(\w+)[^>]+class=["'][^"']*product[^"']*description[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i,
  );
  if (shopifyDesc?.[2]) {
    const mainImgs = [...cleaned.matchAll(/<img\b[^>]*\bproduct-featured-media\b[^>]*>/gi)].map(
      (m) => m[0],
    );
    return postProcess(buildImageSlider(mainImgs) + shopifyDesc[2], pageUrl);
  }

  // --- 汎用セレクター ---

  const article = cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article?.[1]) return postProcess(article[1], pageUrl);

  // 非 zenn.dev で <article> なし、znc がある場合のフォールバック
  if (zncMatch?.[2]) return postProcess(zncMatch[2], pageUrl);

  const main = cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main?.[1]) return postProcess(main[1], pageUrl);

  const roleMain = cleaned.match(/<(\w+)[^>]+role=["']main["'][^>]*>([\s\S]*?)<\/\1>/i);
  if (roleMain?.[2]) return postProcess(roleMain[2], pageUrl);

  const classContent = cleaned.match(
    /<(\w+)[^>]+class=["'][^"']*(?:post|entry|article|content)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i,
  );
  if (classContent?.[2]) return postProcess(classContent[2], pageUrl);

  const body = cleaned.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  return postProcess(body?.[1] ?? cleaned, pageUrl);
}
