/**
 * 記事全文取得・コンテンツ抽出ユーティリティ
 *
 * app/api/content/route.ts の HTTP ハンドラから分離したコンテンツ処理ロジック。
 * - HTML からのメインコンテンツ抽出
 * - 後処理パイプライン（ノイズ除去・画像処理・テーブルラップ・XSS サニタイズ）
 * - 文字エンコーディング検出
 * - Cloudflare AI toMarkdown API フォールバック
 */
import { marked } from "marked";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom/worker";
import { sanitizeHtml, escapeHtml, unescapeHtml } from "./html";

/**
 * `pattern` が入力に対して変化を及ぼさなくなるまで `str.replace` を繰り返し適用する。
 *
 * 単純な `str.replace(/<script...>/, '')` は除去後に隣接文字列が再結合し、
 * 再び危険パターンを形成するバイパス（`<scr<script></script>ipt>` 等）を許してしまう。
 * 本ヘルパーは不動点反復で多段バイパスを潰しつつ、無限ループ保護として反復上限を設ける。
 */
function replaceUntilStable(str: string, pattern: RegExp, replacement = ""): string {
  const MAX_PASSES = 8;
  let prev: string;
  let curr = str;
  let pass = 0;
  do {
    prev = curr;
    curr = curr.replace(pattern, replacement);
    pass++;
  } while (curr !== prev && pass < MAX_PASSES);
  return curr;
}

/** pageUrl を URL オブジェクトにパースする。無効・空の場合は null を返す。 */
function tryParseBase(pageUrl: string): URL | null {
  if (!pageUrl) return null;
  try {
    return new URL(pageUrl);
  } catch {
    return null;
  }
}

/**
 * URL パスの末尾セグメントが「記事 slug らしい」かを判定する。
 * 記事 slug は通常「数字を含む」「ハイフン/アンダースコアを含む」「8 文字以上」のいずれかを満たす。
 * 連番記事 ID (/post/123) のようなカテゴリ + 連番パターンを除外するために使用する。
 */
function lastPathSegmentLooksLikeSlug(pathname: string): boolean {
  const segment = pathname.split("/").filter(Boolean).pop() ?? "";
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
 * 相対 URL を base に対して絶対 URL に解決する。
 * 既に絶対 URL (http/https) の場合・危険スキーム (data: / javascript: / vbscript: / mailto: / file:)
 * の場合・解決失敗の場合はそのまま返す。
 *
 * 危険スキームを `new URL()` に通すと
 * `new URL("vbscript:alert(1)", base)` が `vbscript:alert(1)` を正規 URL として返してしまい、
 * `<img src=...>` 属性に埋め込まれた場合に最終サニタイズに依存する構図になる。
 * 本関数では危険スキームの URL を原文のまま返し、後段の sanitizeHtml が除去できるようにする。
 */
function resolveRelativeUrl(url: string, base: URL): string {
  if (/^https?:\/\//i.test(url)) return url;
  const lower = url.toLowerCase();
  if (
    lower.startsWith("data:") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("file:")
  ) {
    return url;
  }
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

/**
 * img タグの後処理:
 * - 固定 width / height 属性を除去してレスポンシブ表示を保証
 * - 相対パスの src を pageUrl ベースで絶対 URL に変換（404 防止）
 * - loading="lazy" を自動挿入（ブラウザネイティブ遅延ロード）
 *
 * 注意: onerror ハンドラは sanitizeHtml で除去されるため付与しない。
 * 画像は /api/image-proxy 経由で配信され、失敗時は透明 GIF が返るため
 * broken image アイコンは発生しない。
 */
export function fixImageDimensions(html: string, pageUrl = ""): string {
  const base = tryParseBase(pageUrl);

  return html.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
    const wMatch = attrs.match(/\bwidth\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i);
    const hMatch = attrs.match(/\bheight\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i);
    const w = wMatch ? parseInt(wMatch[1] ?? wMatch[2] ?? wMatch[3] ?? "", 10) : NaN;
    const h = hMatch ? parseInt(hMatch[1] ?? hMatch[2] ?? hMatch[3] ?? "", 10) : NaN;
    // width/height 両方が意味のあるサイズの場合のみ属性を保持し、
    // ブラウザに aspect-ratio を推論させて layout shift とアスペクト比崩れを防ぐ。
    // 閾値 16px は favicon 最小サイズに合わせ、1x1 トラッキングピクセル等のダミーは削除する。
    const keepDimensions = Number.isFinite(w) && Number.isFinite(h) && w >= 16 && h >= 16;

    let a = attrs.replace(
      /\s+style\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
      (_s, dq: string, sq: string) => {
        const s2 = (dq ?? sq).replace(/\b(?:width|height)\s*:[^;]+;?/gi, "").trim();
        return s2 ? ` style="${s2}"` : "";
      },
    );

    if (!keepDimensions) {
      a = a
        .replace(/\s+width\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, "")
        .replace(/\s+height\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, "");
    }

    // 相対パスを絶対 URL に変換
    if (base) {
      a = a.replace(/\bsrc=["']([^"']+)["']/gi, (_sm, src: string) => {
        const resolved = resolveRelativeUrl(src, base);
        return resolved !== src ? `src="${resolved}"` : _sm;
      });
      // srcset 内の相対 URL も絶対 URL に変換
      a = a.replace(/\bsrcset=["']([^"']+)["']/gi, (_sm, srcset: string) => {
        return `srcset="${transformSrcset(srcset, (url) => resolveRelativeUrl(url, base))}"`;
      });
    }

    // loading="lazy" を追加（既存の loading 属性がなければ）
    if (!/\bloading\s*=/i.test(a)) a += ' loading="lazy"';

    return `<img${a}>`;
  });
}

/**
 * ネストを考慮してブロック要素を処理する汎用ヘルパー。
 * 非貪欲マッチ `[\s\S]*?` はネストした同名要素の最初の閉じタグで終了してしまうため、
 * このヘルパーは開閉タグのカウントで深度を追跡する。
 *
 * @param html 入力HTML文字列
 * @param tags 対象タグ名の配列（小文字）
 * @param filter null なら全要素を対象、関数なら開きタグ文字列が true の要素のみ処理
 * @param replacer (開きタグ文字列, 内側HTML) → 置換文字列。空文字列を返すと除去
 */
function processNestedBlocks(
  html: string,
  tags: string[],
  filter: ((openTag: string) => boolean) | null,
  replacer: (openTag: string, inner: string) => string,
): string {
  const htmlLower = html.toLowerCase();
  let result = "";
  let i = 0;

  while (i < html.length) {
    // 最も早い候補タグを探す
    let earliest = -1;
    let earliestTag = "";
    for (const tag of tags) {
      const idx = htmlLower.indexOf(`<${tag}`, i);
      if (idx !== -1 && (earliest === -1 || idx < earliest)) {
        earliest = idx;
        earliestTag = tag;
      }
    }
    if (earliest === -1) {
      result += html.slice(i);
      break;
    }

    const tagEnd = htmlLower.indexOf(">", earliest);
    if (tagEnd === -1) {
      result += html.slice(i);
      break;
    }

    const openTag = html.slice(earliest, tagEnd + 1);

    if (!filter || filter(openTag)) {
      // ネスト深度を追跡して対応する閉じタグを探す
      const closeTag = `</${earliestTag}>`;
      const openPrefix = `<${earliestTag}`;
      let depth = 1;
      let pos = tagEnd + 1;
      let found = false;

      while (pos < html.length) {
        const nextOpen = htmlLower.indexOf(openPrefix, pos);
        const nextClose = htmlLower.indexOf(closeTag, pos);

        if (nextClose === -1) {
          pos = html.length;
          break;
        }

        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          pos = nextOpen + openPrefix.length;
        } else {
          depth--;
          if (depth === 0) {
            result += html.slice(i, earliest);
            result += replacer(openTag, html.slice(tagEnd + 1, nextClose));
            i = nextClose + closeTag.length;
            found = true;
            break;
          }
          pos = nextClose + closeTag.length;
        }
      }

      if (!found) {
        result += html.slice(i, earliest);
        i = pos;
      }
    } else {
      result += html.slice(i, tagEnd + 1);
      i = tagEnd + 1;
    }
  }

  return result;
}

/** processNestedBlocks を使ってクラスパターンにマッチする div を除去する。 */
function removeDivsByClass(html: string, classPattern: RegExp): string {
  return processNestedBlocks(
    html,
    ["div"],
    (openTag) => classPattern.test(openTag),
    () => "",
  );
}

/** processNestedBlocks を使ってクラスパターンにマッチするブロック要素を変換する。 */
function replaceBlocksByClass(
  html: string,
  tags: string[],
  classPattern: RegExp,
  replacer: (inner: string) => string,
): string {
  return processNestedBlocks(
    html,
    tags,
    (openTag) => classPattern.test(openTag),
    (_openTag, inner) => replacer(inner),
  );
}

/**
 * table タグをレスポンシブスクロール可能なラッパーで包む。
 * ネストした table にも対応するため processNestedBlocks を使用する。
 */
export function wrapTables(html: string): string {
  return processNestedBlocks(
    html,
    ["table"],
    null,
    (openTag, inner) =>
      `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin:1.25em 0">${openTag}${inner}</table></div>`,
  );
}

/**
 * img タグ配列から CSS scroll-snap スライダー HTML を生成する。
 * removeNoise の EC ギャラリー変換と shopifyDesc の商品画像ギャラリーで共用。
 */
export function buildImageSlider(imgs: string[]): string {
  if (imgs.length === 0) return "";
  const slides = imgs
    .map(
      (img) =>
        // scroll-snap-stop:always — 高速スワイプ時に複数枚飛ばしを防止
        // class="rss-slider-slide" — CSS でサイズ管理（fixImageDimensions に除去されないよう inline style を使わない）
        `<div class="rss-slider-slide" style="flex:0 0 100%;scroll-snap-align:start;scroll-snap-stop:always">` +
        img +
        `</div>`,
    )
    .join("");
  return (
    // class="rss-image-slider" — ArticleView で PC 用ナビゲーションボタンを注入するために使用
    // overscroll-behavior-x:contain — 横スクロールが親要素に伝播するのを防止
    // -webkit-overflow-scrolling:touch を削除 — CSS scroll-snap との競合を防止
    `<div class="rss-image-slider" style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:0;` +
    `margin:0 0 1.25em;border-radius:8px;overscroll-behavior-x:contain;scrollbar-width:none">` +
    slides +
    `</div>`
  );
}

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
  let origin = "";
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    /* ignore */
  }
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

/**
 * サイト固有のノイズ要素を除去する。
 * Qiita / Zenn に見られる「いいね」「シェア」「関連記事」等のUIを取り除く。
 */
export function removeNoise(html: string): string {
  // Qiita: header/footer ツールバー、サイドバー
  html = removeDivsByClass(
    html,
    /class="[^"]*(?:LikesButton|StockButton|ShareButtons|SideBar|ArticleHeader|ArticleFooter|FollowButton)[^"]*"/i,
  );
  // Zenn: チャプター選択、関連記事
  html = removeDivsByClass(html, /class="[^"]*(?:ChapterList|RelatedArticles|TocItem)[^"]*"/i);
  // 汎用: "related", "recommend", "share", "sns" を含む div
  html = removeDivsByClass(html, /class="[^"]*(?:related|recommend|share|sns|toc-|side-)[^"]*"/i);
  // EC / Shopify: 商品画像ギャラリーを CSS scroll-snap スライダーに変換（クラス名あり）
  html = replaceBlocksByClass(
    html,
    ["ul", "div"],
    /class="[^"]*(?:product__media|media-gallery|product-gallery|thumbnail[s]?(?:-list|-wrapper)?|image-gallery|photo-gallery|product-images)[^"]*"/i,
    (inner) => {
      const imgs = [...inner.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
      return buildImageSlider(imgs);
    },
  );
  // 汎用: 画像のみで構成される <ul>（3件以上）をスライダーに変換
  // shop-pro.jp 等クラス属性なしのギャラリーに対応。
  // 各 <li> が <img> 1枚のみ（テキスト5文字以下）の場合のみ変換する。
  html = processNestedBlocks(html, ["ul"], null, (openTag, inner) => {
    const liItems = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
    if (liItems.length < 3) return `${openTag}${inner}</ul>`;
    const imgs: string[] = [];
    for (const [, liContent] of liItems) {
      const imgMatch = liContent.match(/<img\b[^>]*>/i);
      if (!imgMatch) return `${openTag}${inner}</ul>`;
      if (replaceUntilStable(liContent, /<[^>]+>/g).trim().length > 5)
        return `${openTag}${inner}</ul>`;
      imgs.push(imgMatch[0]);
    }
    return imgs.length >= 3 ? buildImageSlider(imgs) : `${openTag}${inner}</ul>`;
  });
  return html;
}

/**
 * Zenn embed の <span> から data-content 属性を URL デコードして取り出す共通ヘルパー。
 * デコード失敗時または属性が存在しない場合は null を返す。
 */
function extractZennEmbedContent(spanMatch: string): string | null {
  const dcMatch = spanMatch.match(/\bdata-content=["']([^"']+)["']/i);
  if (!dcMatch) return null;
  try {
    return decodeURIComponent(dcMatch[1]);
  } catch {
    return null;
  }
}

/**
 * embed.zenn.studio の card / tweet iframe を外部リンクに変換する。
 *
 * Zenn CMS が生成する embed は以下のいずれかの形式:
 * <span class="embed-block zenn-embedded zenn-embedded-card">
 * <span class="embed-block zenn-embedded zenn-embedded-tweet">
 *   <iframe src="https://embed.zenn.studio/{type}#zenn-embedded__xxx"
 *     data-content="https%3A%2F%2F..."
 *     ...></iframe>
 * </span>
 *
 * embed.zenn.studio の iframe は親ページの Zenn JS（postMessage）がないと
 * "Loading..." のまま表示されるため、data-content から元 URL を取り出してリンクに変換する。
 * zenn.dev / 非 zenn.dev を問わず全ドメインで適用する。
 */
export function transformZennLinkEmbeds(content: string): string {
  return content.replace(
    /<span\b[^>]*\bzenn-embedded-(?:card|tweet)\b[^>]*>[\s\S]*?<\/span>/gi,
    (spanMatch) => {
      const url = extractZennEmbedContent(spanMatch);
      if (url === null) return spanMatch;
      // javascript: / data: 等の危険スキームをブロック（XSS 防止）
      if (!/^https?:\/\//i.test(url)) return spanMatch;
      // URL に " < > & が含まれる場合にHTML属性から脱出されないようHTMLエスケープ
      const escaped = escapeHtml(url);
      return `<p><a href="${escaped}" target="_blank" rel="noopener noreferrer">${escaped}</a></p>`;
    },
  );
}

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
 * Zenn の mermaid embed iframe を mermaid ソースのコードブロックに変換する。
 * embed.zenn.studio/mermaid は親ページの Zenn スクリプト（postMessage）がないと
 * "Loading..." のまま表示されるため、data-content から直接ソースを取り出す。
 * zenn.dev のみ適用。他ドメイン（classmethod 等）では変換しない。
 */
export function transformZennMermaidEmbeds(content: string, pageUrl = ""): string {
  if (!isZennDevUrl(pageUrl)) return content;
  return content.replace(
    /<span\b[^>]*\bzenn-embedded-mermaid\b[^>]*>[\s\S]*?<\/span>/gi,
    (spanMatch) => {
      const source = extractZennEmbedContent(spanMatch);
      if (source === null) return spanMatch;
      const escaped = escapeHtml(source);
      return (
        `<pre style="background:var(--color-surface-subtle,#f3f3f1);` +
        `border:1px solid var(--color-border-default,#e7e5e4);` +
        `border-radius:6px;padding:1em;overflow-x:auto;white-space:pre">` +
        `<code class="language-mermaid">${escaped}</code></pre>`
      );
    },
  );
}

/**
 * JS 遅延ロード画像と Shopify サムネイルを高解像度に解決する。
 * - data-src が有効 URL（{width} プレースホルダー含む）→ 800px 幅に解決して src を上書き
 * - src の Shopify サイズサフィックス（_300x300 等）→ _800x に置換
 */
export function fixLazyImages(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
    let fixed = attrs;

    const dataSrcMatch = fixed.match(/\bdata-src=["']([^"']+)["']/i);
    if (dataSrcMatch) {
      const resolved = dataSrcMatch[1].replace(/\{width\}/g, "800");
      if (/\bsrc=["'][^"']*["']/i.test(fixed)) {
        fixed = fixed.replace(/\bsrc=["'][^"']*["']/i, `src="${resolved}"`);
      } else {
        // src 属性なしの遅延ロード画像: src を先頭に追加
        fixed = ` src="${resolved}"` + fixed;
      }
    }

    // data-srcset を srcset に昇格（遅延ロード対応）
    const dataSrcsetMatch = fixed.match(/\bdata-srcset=["']([^"']+)["']/i);
    if (dataSrcsetMatch) {
      if (/\bsrcset=["'][^"']*["']/i.test(fixed)) {
        fixed = fixed.replace(/\bsrcset=["'][^"']*["']/i, `srcset="${dataSrcsetMatch[1]}"`);
      } else {
        fixed += ` srcset="${dataSrcsetMatch[1]}"`;
      }
    }

    // Shopify: _NNNx / _NNNxNNN / _NNNx@Nx サフィックスを _800x に置換
    fixed = fixed.replace(
      /(src=["'][^"']*?)_\d+x\d*(?:@\d+x)?\.(jpg|jpeg|png|webp|gif)(["'])/gi,
      "$1_800x.$2$3",
    );

    return `<img${fixed}>`;
  });
}

/**
 * srcset 属性内の各 URL に変換関数を適用するヘルパー。
 * 形式: "url1 descriptor1, url2 descriptor2, ..."
 * URL が http(s) でない場合（data: など）は変換をスキップする。
 */
function transformSrcset(srcset: string, rewriteUrl: (url: string) => string): string {
  // HTML srcset 仕様 (https://html.spec.whatwg.org/#parse-a-srcset-attribute) に寄せたパース。
  // URL は whitespace までを境界とし、URL 末尾の `,` のみ候補区切りとして扱う。
  // これにより Cloudinary のように path 内に生の `,` を含む URL (c_limit,f_auto,... 等) でも壊れない。
  const isWs = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";
  const parts: string[] = [];
  let i = 0;
  const s = srcset;
  while (i < s.length) {
    while (i < s.length && (isWs(s[i]) || s[i] === ",")) i++;
    if (i >= s.length) break;
    const urlStart = i;
    while (i < s.length && !isWs(s[i])) i++;
    let url = s.slice(urlStart, i);
    let descriptor = "";
    // URL 末尾に付く `,` は候補区切り。複数付いていても取り除く。
    let trailingComma = false;
    while (url.endsWith(",")) {
      url = url.slice(0, -1);
      trailingComma = true;
    }
    if (!trailingComma) {
      while (i < s.length && isWs(s[i])) i++;
      const dStart = i;
      while (i < s.length && s[i] !== ",") i++;
      descriptor = s.slice(dStart, i).trim();
      if (i < s.length && s[i] === ",") i++;
    }
    if (!url) continue;
    const out = rewriteUrl(url);
    parts.push(descriptor ? `${out} ${descriptor}` : out);
  }
  return parts.join(", ");
}

/**
 * 記事本文内の外部画像 URL を /api/image-proxy 経由に書き換える。
 * fixImageDimensions で相対パスが絶対 URL に解決された後に適用する。
 * src と srcset の両方を対象とする。
 */
export function rewriteImageUrls(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
    let rewritten = attrs.replace(
      /\bsrc=["'](https?:\/\/[^"']+)["']/gi,
      (_sm, src: string) => `src="/api/image-proxy?url=${encodeURIComponent(unescapeHtml(src))}"`,
    );
    rewritten = rewritten.replace(/\bsrcset=["']([^"']+)["']/gi, (_sm, srcset: string) => {
      const proxied = transformSrcset(srcset, (url) => {
        if (!/^https?:\/\//i.test(url)) return url;
        return `/api/image-proxy?url=${encodeURIComponent(unescapeHtml(url))}`;
      });
      return `srcset="${proxied}"`;
    });
    return `<img${rewritten}>`;
  });
}

/**
 * <a> タグに target="_blank" と rel="noopener noreferrer" を付与し、
 * 相対 href を pageUrl ベースで絶対 URL に変換する。
 * 記事内リンクを新しいタブで開くことで読書を中断せずリンクを確認できる。
 * フラグメントのみのリンク (#anchor) は同一ページ内アンカーのためそのまま保持する。
 * 危険スキーム (javascript: / data: 等) は後続の sanitizeHtml で除去されるためここでは無視する。
 */
export function fixExternalLinks(html: string, pageUrl = ""): string {
  const base = tryParseBase(pageUrl);

  return html.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
    // href 属性の値を取得
    const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']*?)["']/i);
    const href = hrefMatch?.[1] ?? "";

    // href なし・フラグメントのみ (#anchor) はそのまま
    if (!href || href.startsWith("#")) return _match;

    let newAttrs = attrs;

    if (base && !/^https?:\/\//i.test(href) && !href.startsWith("data:")) {
      try {
        const absolute = new URL(href, base).href;
        newAttrs = newAttrs.replace(/\bhref\s*=\s*["'][^"']*["']/i, `href="${absolute}"`);
      } catch {
        /* 変換失敗時はそのまま */
      }
    }

    // target 属性を上書きして必ず新しいタブで開く
    if (/\btarget\s*=/i.test(newAttrs)) {
      newAttrs = newAttrs.replace(
        /\btarget\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi,
        'target="_blank"',
      );
    } else {
      newAttrs += ' target="_blank"';
    }

    // rel 属性に noopener noreferrer を付与（既存値があれば追記）
    // (["'])…\1 で quoted、[^\s"'>]+ で unquoted の両形式を 1 つのパターンで捕捉する。
    // クォートなし rel を放置すると rel 属性が 2 つ生成され、ブラウザは最初の値（noopener なし）を優先するため
    // noopener noreferrer が無効になるセキュリティリスクがある。
    const relMatch = newAttrs.match(/\brel\s*=\s*(?:(["'])([^"']*)\1|([^\s"'>]+))/i);
    if (relMatch) {
      const existing = relMatch[2] ?? relMatch[3] ?? "";
      const values = new Set(existing.split(/\s+/).filter(Boolean));
      values.add("noopener");
      values.add("noreferrer");
      newAttrs = newAttrs.replace(
        /\brel\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)/i,
        `rel="${[...values].join(" ")}"`,
      );
    } else {
      newAttrs += ' rel="noopener noreferrer"';
    }

    return `<a${newAttrs}>`;
  });
}

/**
 * `<blockquote class="twitter-tweet">` を X (Twitter) 埋め込み iframe に変換する。
 *
 * 多くのブログ・メディアサイトは Twitter のスクリプトと一緒に
 * <blockquote class="twitter-tweet"> を使ってツイートを埋め込む。
 * RSS リーダーは <script> を除去するため tweet が未展開のまま残ってしまう。
 * このため blockquote 末尾のパーマリンク URL からツイート ID を取り出し、
 * platform.twitter.com の iframe 埋め込みに置き換える。
 *
 * @param theme - ライト/ダークテーマ（'light' | 'dark'、省略時は 'light'）
 */
export function transformXTweetEmbeds(html: string, theme: "light" | "dark" = "light"): string {
  return html.replace(
    /<blockquote\b[^>]*\bclass\s*=\s*["'][^"']*\btwitter-tweet\b[^"']*["'][^>]*>([\s\S]*?)<\/blockquote>/gi,
    (_match, inner: string) => {
      // blockquote 内の最後のリンクがツイートのパーマリンク
      const links = [...inner.matchAll(/<a\b[^>]+href\s*=\s*["']([^"']+)["'][^>]*>/gi)];
      const tweetUrl = links.at(-1)?.[1] ?? "";
      const idMatch = tweetUrl.match(/(?:twitter|x)\.com\/[^/?#]+\/status\/(\d+)/);
      if (!idMatch) return _match; // パターン不一致なら元のブロッククォートを保持
      const tweetId = idMatch[1];
      return (
        `<div class="tweet-embed-wrapper">` +
        `<iframe` +
        ` src="https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&dnt=true&theme=${theme}"` +
        ` style="width:100%;border:0;border-radius:12px;height:300px"` +
        ` scrolling="no"` +
        ` loading="lazy"` +
        `></iframe>` +
        `</div>`
      );
    },
  );
}

/**
 * 共通後処理パイプライン（画像処理・リンク修正・テーブルラップ・XSS サニタイズ）。
 * postProcess / postProcessMarkdownContent の両方で使用する。
 *
 * 順序依存あり — 変更禁止:
 *   1. fixImageDimensions: 相対パスを pageUrl ベースで絶対 URL 化 + loading="lazy" 付与
 *   2. rewriteImageUrls:   絶対 URL 化済みの src を /api/image-proxy 経由に書き換え（1 の後が必須）
 *   3. fixExternalLinks:   <a> href も同様に絶対 URL 化 + target="_blank" rel 付与
 *   4. wrapTables:         <table> をレスポンシブラッパーで包む
 *   5. sanitizeHtml:       XSS 除去（必ず最後。これ以降に処理を追加しても無効化される）
 */
function applyCorePipeline(html: string, pageUrl = ""): string {
  let h = fixImageDimensions(html, pageUrl);
  h = rewriteImageUrls(h);
  h = fixExternalLinks(h, pageUrl);
  h = wrapTables(h);
  return sanitizeHtml(h);
}

/**
 * コンテンツ抽出後の後処理パイプライン。
 *
 * 前処理ステップ（この関数内）:
 *   1. removeNoise:              EC ギャラリー / Qiita・Zenn UI のノイズ除去（後段の正規表現をシンプル化）
 *   2. transformZennLinkEmbeds:  embed.zenn.studio の iframe を外部リンクに変換（sanitize 前に変換しないと blockquote が除去される）
 *                                通常は extractMainContent 側で Readability 実行前に変換済みのため no-op となる。
 *                                regex フォールバック経路や Markdown 経路の安全網として保持する（冪等）。
 *   3. transformZennMermaidEmbeds: zenn.dev の mermaid iframe を <pre><code> に変換（同上、冪等な安全網）
 *   4. fixLazyImages:            data-src → src 解決 / Shopify _NNNx → _800x 高解像度化
 *
 * 後処理は applyCorePipeline に委譲（fixImageDimensions → rewriteImageUrls → fixExternalLinks → wrapTables → sanitizeHtml）。
 *
 * X ツイート埋め込み（blockquote.twitter-tweet）はテーマ依存のため、
 * サーバー側ではなくクライアント側の processContent() (embed-utils.ts) で変換する。
 * blockquote は sanitizeHtml で除去されないため、キャッシュ後もクライアントで正しいテーマが適用される。
 */
export function postProcess(content: string, pageUrl = ""): string {
  let h = removeNoise(content);
  h = transformZennLinkEmbeds(h);
  h = transformZennMermaidEmbeds(h, pageUrl);
  h = fixLazyImages(h);
  return applyCorePipeline(h, pageUrl);
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
    const formData = new FormData();
    formData.append("files", new Blob([html], { type: "text/html" }), "page.html");
    formData.append("conversionOptions", JSON.stringify({ hostname }));

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/tomarkdown`,
      { method: "POST", headers: { Authorization: `Bearer ${apiToken}` }, body: formData },
    );
    if (!res.ok) return null;

    const json = (await res.json()) as {
      result: { data?: string; error?: string }[];
      success: boolean;
    };
    return json.success ? (json.result[0]?.data ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Markdown を HTML に変換する（marked 使用）。
 */
export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/**
 * Markdown → HTML 変換後の後処理パイプライン。
 * Zenn embed 等は変換時に消失するため、共通後処理（画像処理・テーブル・サニタイズ）のみ適用する。
 * sanitizeHtml は XSS 対策のため必ず最後に実行すること。
 */
export function postProcessMarkdownContent(html: string, pageUrl = ""): string {
  return applyCorePipeline(html, pageUrl);
}

/**
 * Readability 退避用プレースホルダークラス名。
 * Readability の classesToPreserve オプションで保持され、placeholder <p> タグを識別するのに使う。
 */
const EMBED_PLACEHOLDER_CLASS = "rss-reader-preserved-embed";

/**
 * iframe / video / audio タグを Readability 実行前に `<p>` プレースホルダーに退避する。
 *
 * Readability は独自の VIDEO_REGEXP (youtube/vimeo/dailymotion/twitch の一部等) に合致しない
 * iframe を本文外と判定して削除する。signing.jp の embed.nicovideo.jp や Spotify /
 * SoundCloud 埋込みは VIDEO_REGEXP に含まれず削除されてしまう。
 *
 * 対策として、信頼済み埋込みタグを文字列として退避し、Readability にはダミーの <p> を渡す。
 * 復元時に元のタグに戻す。<p> を使うのは Readability が本文候補として扱って残しやすいため。
 */
function preserveTrustedEmbeds(html: string): { html: string; embeds: string[] } {
  const embeds: string[] = [];
  const placeholder = (match: string): string => {
    const idx = embeds.push(match) - 1;
    // インデックスをテキスト内容に埋め込む（preClean の data-* 除去対策）。
    // ダミーテキストは Readability が本文候補として保持しやすいよう十分な長さを持たせる。
    return `<p class="${EMBED_PLACEHOLDER_CLASS}">RSSREADER_EMBED_PLACEHOLDER_${idx}_END preserved embed placeholder. preserved embed placeholder.</p>`;
  };
  let result = html;
  result = result.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, placeholder);
  result = result.replace(/<iframe\b[^>]*\/?>/gi, placeholder);
  result = result.replace(/<video\b[^>]*>[\s\S]*?<\/video\s*>/gi, placeholder);
  result = result.replace(/<video\b[^>]*\/?>/gi, placeholder);
  result = result.replace(/<audio\b[^>]*>[\s\S]*?<\/audio\s*>/gi, placeholder);
  result = result.replace(/<audio\b[^>]*\/?>/gi, placeholder);
  return { html: result, embeds };
}

/**
 * preserveTrustedEmbeds で埋めたプレースホルダー <p> を元の iframe/video/audio に復元する。
 *
 * Readability 出力はタグ名が大文字化される (`<P>`) ことがあるため case-insensitive で照合する。
 * インデックスはテキスト内容の `RSSREADER_EMBED_PLACEHOLDER_N_END` から抽出する。
 * インデックスが範囲外なら空文字に置換（fail-safe）。
 */
function restoreTrustedEmbeds(html: string, embeds: string[]): string {
  return html.replace(
    /<p\b[^>]*class=["'][^"']*rss-reader-preserved-embed[^"']*["'][^>]*>([\s\S]*?)<\/p\s*>/gi,
    (_match, inner: string) => {
      const idxMatch = inner.match(/RSSREADER_EMBED_PLACEHOLDER_(\d+)_END/);
      if (!idxMatch) return "";
      const idx = Number(idxMatch[1]);
      return embeds[idx] ?? "";
    },
  );
}

/**
 * Readability 実行前の前処理。DOM パース精度を上げるためノイズを除去する。
 * - <picture> を単純化して <img> のみ残す
 * - <noscript> 内の画像を救出（遅延ロード対策）
 * - 不要な属性を除去（data-content / data-src は保持）
 * - <style> / <script> を除去
 */
export function preClean(html: string): string {
  let h = html;
  h = h.replace(/<picture\b[^>]*>([\s\S]*?)<\/picture\b[^>]*>/gi, (_m, inner: string) => {
    const img = inner.match(/<img\b[^>]*>/i);
    return img ? img[0] : "";
  });
  h = h.replace(/<noscript\b[^>]*>([\s\S]*?)<\/noscript\b[^>]*>/gi, (_m, inner: string) =>
    /<img\b/i.test(inner) ? inner : "",
  );
  // 属性除去・<style>/<script> 除去は「除去後に残った文字列が再度同一パターンを形成する」
  // バイパスを防ぐため、不動点反復で適用する。閉じタグは HTML5 仕様どおり
  // `</tagname attr>` も受容するため `\b[^>]*>` でマッチさせる。
  h = replaceUntilStable(
    h,
    /\s+(?:data-(?!content\b|src\b)[a-z][a-z0-9-]*|aria-[a-z-]+|on[a-z]+)=["'][^"']*["']/gi,
  );
  h = replaceUntilStable(h, /<style\b[\s\S]*?<\/style\b[^>]*>/gi);
  h = replaceUntilStable(h, /<script\b[\s\S]*?<\/script\b[^>]*>/gi);
  return h;
}

/**
 * @mozilla/readability + linkedom/worker を使って記事本文を抽出する。
 * 失敗した場合は null を返す（fail-open 設計）。
 */
export function extractWithReadability(html: string, url: string): string | null {
  try {
    // Readability は独自の VIDEO_REGEXP に合致しない iframe（embed.nicovideo.jp 等）を
    // 本文外と判定して削除する。信頼済み iframe / video / audio をプレースホルダーに
    // 退避し、Readability 実行後に復元する。Issue #120 の回帰対策。
    const { html: preserved, embeds } = preserveTrustedEmbeds(html);
    const { document } = parseHTML(preClean(preserved));
    try {
      const base = document.createElement("base");
      (base as unknown as { href: string }).href = url;
      document.head.appendChild(base);
    } catch {
      /* ignore */
    }

    const article = new Readability(document as unknown as Document, {
      classesToPreserve: [EMBED_PLACEHOLDER_CLASS],
    }).parse();
    const content = article?.content ?? null;
    return content ? restoreTrustedEmbeds(content, embeds) : null;
  } catch {
    return null;
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
 * JavaScript の loadImage('elementId', 'jpgUrl', 'gifUrl') パターンで動的に設定される
 * 画像 URL を静的に解決する。
 * digitallover.moe 等が WordPress プラグインで埋め込む非標準遅延ロード画像に対応。
 * preClean で <script> が除去される前に元 HTML から URL を抽出して img[src] に差し込む。
 */
export function resolveScriptLoadedImages(html: string): string {
  const idToUrl = new Map<string, string>();
  for (const scriptMatch of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/gi)) {
    for (const callMatch of scriptMatch[1].matchAll(
      /loadImage\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/gi,
    )) {
      const [, elementId, jpgUrl] = callMatch;
      if (/^https?:\/\//i.test(jpgUrl)) idToUrl.set(elementId, jpgUrl);
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
    if (srcMatch && /^https?:\/\//i.test(srcMatch[1])) return _match;
    // src を上書き or 先頭に追加
    const newAttrs = /\bsrc\s*=/i.test(attrs)
      ? attrs.replace(/\bsrc\s*=\s*["'][^"']*["']/i, `src="${url}"`)
      : ` src="${url}"${attrs}`;
    return `<img${newAttrs}>`;
  });
}

function countImgs(html: string): number {
  return (html.match(/<img\b/gi) ?? []).length;
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
  // JS で動的に src を設定する loadImage('id', url, ...) パターンを静的解決する。
  // preClean で <script> が除去される前に行う必要がある。
  let preprocessed = resolveScriptLoadedImages(html);

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
        return { content: regexContent + buildGallery(), source: "regex" };
      }
    }
    return { content: postProcess(rc, pageUrl) + buildGallery(), source: "readability" };
  }
  const regexContent = extractWithRegex(preprocessed, pageUrl);
  return { content: regexContent + buildGallery(), source: "regex" };
}

/**
 * 正規表現ベースのフォールバック抽出。
 * サイト固有セレクター → EC 商品ページ → 汎用セレクターの順でフォールバックする。
 */
function extractWithRegex(html: string, pageUrl: string): string {
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

/**
 * nextUrl が currentUrl の記事ページネーション的変種かどうかを判定する。
 * シリーズ記事ナビ・CMS 一覧ページネーション等の誤検知を防ぐ。
 *
 * 判定ルール（いずれか一致で true）:
 * 1. 同一パス + page/p/pg/pn クエリパラメータのみ変化
 * 2. パス末尾が /page/N または /p/N 形式
 * 3. パス末尾が /N (bare numeric) かつ base 最終セグメントが slug らしい
 */
function isPaginatedVariant(currentUrl: string, nextUrl: string): boolean {
  let cur: URL, next: URL;
  try {
    cur = new URL(currentUrl);
    next = new URL(nextUrl);
  } catch {
    return false;
  }

  // 1. クエリパラメータのページ番号のみ変化: /article?page=1 → /article?page=2
  if (cur.pathname === next.pathname) {
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
  if (paginationSuffix.test(next.pathname)) {
    const nextBase = next.pathname.replace(paginationSuffix, "").replace(/\/$/, "") || "/";
    const curBase = cur.pathname.replace(paginationSuffix, "").replace(/\/$/, "") || "/";
    if (curBase === nextBase) return true;
  }

  // 3. パス末尾に /N のみ (bare numeric suffix) が付く: /interview/260417u → /interview/260417u/2
  //    連番記事 ID (/post/123 → /post/124) との誤検知を防ぐため、
  //    base の最終セグメントが「記事 slug らしい」ことを条件とする。
  //    cur / next の trailing slash は正規化して比較する (WordPress pretty permalink
  //    のような /.../ → /.../2/ パターンで base が不一致になるのを防ぐ)。
  const bareNumericSuffix = /\/\d+\/?$/;
  if (bareNumericSuffix.test(next.pathname)) {
    const nextBase = next.pathname.replace(bareNumericSuffix, "").replace(/\/$/, "") || "/";
    const curBase = cur.pathname.replace(bareNumericSuffix, "").replace(/\/$/, "") || "/";
    if (curBase === nextBase && nextBase !== "/" && lastPathSegmentLooksLikeSlug(nextBase)) {
      return true;
    }
  }

  return false;
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
