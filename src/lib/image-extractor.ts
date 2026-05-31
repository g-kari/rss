/**
 * 記事画像抽出ユーティリティ。
 *
 * - `bestSrcFromSrcset`: srcset 文字列から最高解像度エントリの URL を取り出す。
 * - `collectImageUrlsFromHtml`: HTML 文字列から正規表現ベースで画像 URL を抽出する（useMemo 等 DOM 不要な場面向け）。
 * - `collectImageUrls`: live DOM の Element から画像 URL を抽出する（useImageDownload 等 DOM 参照向け）。
 *
 * いずれも HTML 属性 / 実寸 (naturalWidth 等) から「両辺とも `MIN_IMAGE_SIZE_PX` 未満」と判定できる
 * アイコン・スペーサーを除外する（例: 60x60 のサイトロゴ / SNSシェアアイコン等）。
 */

/** 画像一覧・DL対象の最小サイズ（短辺・長辺いずれかが到達していれば対象） */
export const MIN_IMAGE_SIZE_PX = 170;

/**
 * srcset 属性文字列の最後のエントリ（最高解像度）の URL を返す。
 * 例: "/api/image-proxy?url=...jpg 1x, /api/image-proxy?url=...jpg@2x 2x" → 後者の URL
 * srcset が空のときは空文字を返す。
 */
export function bestSrcFromSrcset(srcset: string): string {
  if (!srcset) return "";
  const last = srcset.split(",").at(-1)?.trim() ?? "";
  return last.split(/\s+/)[0] ?? "";
}

/** data: URI・非 http/proxy URL を除外して収集対象かどうかを判定する (重複判定は別途 normalizeImageUrlForDedup で実施) */
function isCollectableUrl(src: string): boolean {
  return (
    !!src &&
    !src.startsWith("data:") &&
    (src.startsWith("/api/image-proxy?") || src.startsWith("http"))
  );
}

/**
 * 画像 URL を「同一画像の異なる解像度」レベルで正規化する純粋関数 (#885)。
 *
 * 同一画像 (例: `image.jpg` / `image-300x200.jpg` / `image.webp`) が
 * 異なる URL として複数経路 (`<a href>` / `<picture source>` / `<img src>`) から
 * 抽出された場合に、normalize 後の stem が一致すれば同一画像扱いで dedup できるようにする。
 *
 * - 末尾の画像拡張子 (.jpg/.jpeg/.png/.gif/.webp/.avif/.svg) を strip
 * - 末尾の WordPress 風 size suffix (`-WIDTHxHEIGHT`、例 `-300x200`) を strip
 * - クエリ文字列・フラグメントは無視 (`url.pathname` のみ使用)
 * - image-proxy URL は内部 url パラメータをデコードして normalize
 * - 不正 URL / origin 不明は元の URL をそのまま返す (fallback)
 *
 * 例:
 *   `https://example.com/img-large.jpg`        → `https://example.com/img-large`
 *   `https://example.com/img-large-300x200.jpg` → `https://example.com/img-large`
 *   `https://example.com/img-large.webp`        → `https://example.com/img-large`
 *   `https://example.com/photo1.jpg`            → `https://example.com/photo1` (`photo2.jpg` とは別物)
 */
export function normalizeImageUrlForDedup(src: string): string {
  if (!src) return src;
  // image-proxy URL は内部 url を抽出して normalize
  let target = src;
  if (src.startsWith("/api/image-proxy?url=")) {
    try {
      target = decodeURIComponent(src.slice("/api/image-proxy?url=".length));
    } catch {
      return src;
    }
  }
  // 相対 URL や絶対 URL を URL constructor で parse (相対は base 不要なものは throw する)
  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return src;
  }
  const pathname = u.pathname;
  const lastSlash = pathname.lastIndexOf("/");
  if (lastSlash === -1) return src;
  const dir = pathname.slice(0, lastSlash + 1);
  const filename = pathname.slice(lastSlash + 1);
  if (!filename) return src;
  // 末尾の画像拡張子を strip
  const extMatch = /\.(jpe?g|png|gif|webp|avif|svg)$/i.exec(filename);
  const stem = extMatch ? filename.slice(0, -extMatch[0].length) : filename;
  // 末尾の `-WIDTHxHEIGHT` size suffix を strip (例: `-300x200`)
  const sizeSuffixMatch = /-\d+x\d+$/.exec(stem);
  const normalizedStem = sizeSuffixMatch ? stem.slice(0, -sizeSuffixMatch[0].length) : stem;
  return `${u.origin}${dir}${normalizedStem}`;
}

/**
 * #667: `<a href>` が画像 URL を直接指している場合に拾うための拡張子判定。
 * wallhaven 等の `<a href="full画像"><img src="thumb"></a>` 構造で、
 * `<img src>` がサムネサイズで除外されてもフル解像度を DL できるようにする。
 *
 * クエリ文字列・フラグメント (`?v=2`, `#anchor`) は無視して拡張子を見る。
 */
const IMAGE_HREF_EXTENSION_RE = /\.(jpe?g|png|gif|webp|avif|svg)(?:[?#].*)?$/i;

export function isImageHref(href: string): boolean {
  if (!href) return false;
  // image-proxy 経由は内部の url パラメータをデコードして判定
  const target = href.startsWith("/api/image-proxy?")
    ? decodeURIComponent(href.replace(/^\/api\/image-proxy\?url=/, ""))
    : href;
  return IMAGE_HREF_EXTENSION_RE.test(target);
}

/** "60" / "60px" など数値のみ受け付け、"100%" や "auto" は null を返す */
function parseSizeAttr(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d+(?:\.\d+)?)\s*(?:px)?$/i.exec(value.trim());
  return m ? Number(m[1]) : null;
}

const STYLE_WIDTH_RE = /\bwidth\s*:\s*(\d+(?:\.\d+)?)\s*px/i;
const STYLE_HEIGHT_RE = /\bheight\s*:\s*(\d+(?:\.\d+)?)\s*px/i;

/** style 文字列から `width: 60px` / `height: 60px` の数値を取り出す。px 以外は null */
function parseSizeFromStyle(
  style: string | null | undefined,
  prop: "width" | "height",
): number | null {
  if (!style) return null;
  const re = prop === "width" ? STYLE_WIDTH_RE : STYLE_HEIGHT_RE;
  const m = re.exec(style);
  return m ? Number(m[1]) : null;
}

/**
 * WordPress等のURLサフィックスからサムネイル画像を検出する。
 * `-30x30.jpg`, `-150x150.png`, `-100x100_crop.webp` 等のパターンにマッチし、
 * 両辺とも MIN_IMAGE_SIZE_PX 未満なら true。
 * image-proxy URL の場合は内部の url パラメータをデコードして判定する。
 */
const WP_THUMB_RE = /-(\d+)x(\d+)(?:_\w+)?\.(jpe?g|png|gif|webp|avif|svg)(?:\?.*)?$/i;

export function isTooSmallByUrl(src: string): boolean {
  const url = src.startsWith("/api/image-proxy?")
    ? decodeURIComponent(src.replace(/^\/api\/image-proxy\?url=/, ""))
    : src;
  const m = WP_THUMB_RE.exec(url);
  if (!m) return false;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w < MIN_IMAGE_SIZE_PX && h < MIN_IMAGE_SIZE_PX;
}

/**
 * HTML 属性（width / height / style）から「明示的に両辺とも閾値未満」と判定できる場合のみ true。
 * 片方しか明示されていない場合や属性がない場合は false（= 小さい画像と断定できない = 収集対象）。
 */
function isTooSmallByAttrs(
  widthAttr: string | null | undefined,
  heightAttr: string | null | undefined,
  styleAttr: string | null | undefined,
): boolean {
  const w = parseSizeAttr(widthAttr) ?? parseSizeFromStyle(styleAttr, "width");
  const h = parseSizeAttr(heightAttr) ?? parseSizeFromStyle(styleAttr, "height");
  if (w === null || h === null) return false;
  return w < MIN_IMAGE_SIZE_PX && h < MIN_IMAGE_SIZE_PX;
}

/**
 * HTML 文字列から画像 URL を重複なしで抽出する。
 * useMemo など DOM 操作が不要なコンテキスト向け。
 *
 * - `<a href="*.jpg/.png/...">` で画像を直接指すアンカー (#667: wallhaven 等の thumb→full 構造) を先に拾う
 * - 次に `<img>` を走査。src 属性を優先し、data: の場合は srcset からフォールバック
 * - data: URI / 非 proxy・非絶対 URL は除外
 * - width/height 属性（または style）から両辺とも `MIN_IMAGE_SIZE_PX` 未満と判定できる画像は除外
 */
export function collectImageUrlsFromHtml(html: unknown): string[] {
  // #812 派生防御: client side caller (useArticleViewContent / usePrefetchGalleryContents)
  // から processedContent 経由で渡される input は `string | null` 型保証だが、runtime で
  // 非 string が混入する経路 (cache 旧 schema / decode fallback / API edge case) があり、
  // 後続の RegExp.prototype.exec(html) + 内部 RegExpExecArray[1].startsWith("data:")
  // で本番 minified bundle TypeError (#812 同種症状) を発火させる。非 string 入力は
  // 空配列 fallback で safe (UX 影響: 画像 0 件描画 < ErrorBoundary 発火)。
  // `react-component-split.md § 派生「JSX 描画 helper unknown 受け defensive」` 規範。
  if (typeof html !== "string") return [];

  const seen = new Set<string>();
  const result: string[] = [];

  // #885: 重複判定は normalize 後 URL で行うことで「同一画像の異なる解像度 URL」
  // (例: `<a href="img.jpg"><picture><source srcset="img.webp"><img src="img-300x200.jpg">`)
  // の 3 重抽出を防ぐ。push 自体は元の URL を使うことで最初に見つけた解像度 (= a href 経由
  // のフル解像度) を優先採用する。
  function tryAdd(rawUrl: string): void {
    const key = normalizeImageUrlForDedup(rawUrl);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(rawUrl);
  }

  // #667: <a href="image-url"> を先に走査してフル解像度画像を拾う
  const aRe = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  let am: RegExpExecArray | null;
  while ((am = aRe.exec(html)) !== null) {
    const href = am[1];
    if (!isImageHref(href)) continue;
    if (!isCollectableUrl(href)) continue;
    tryAdd(href);
  }

  // #794: <picture><source srcset="..."> の高解像度 URL を抽出
  // (Next.js Image / WordPress responsive で本文画像が <picture> のみで配信される
  // ケースで `<img>` 単体走査だと拾えず「本文画像 1 枚のみ DL」現象を引き起こす)
  const sourceRe = /<source\b[^>]*\bsrcset=["']([^"']+)["'][^>]*>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = sourceRe.exec(html)) !== null) {
    const src = bestSrcFromSrcset(sm[1]);
    if (!isCollectableUrl(src)) continue;
    if (isTooSmallByUrl(src)) continue;
    tryAdd(src);
  }

  const imgRe = /<img\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const attrs = m[1];
    let src = /\bsrc=["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
    if (!src || src.startsWith("data:")) {
      const srcset = /\bsrcset=["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
      src = bestSrcFromSrcset(srcset);
    }
    // #897: raw HTML 走査では `<img src="data:..." data-src="real-url">` lazy load
    // pattern (kai-you.net 等) で srcset が無い場合に data-src を最終 fallback とする。
    // postProcess の fixLazyImages が走る前の raw HTML 経路 (gallery-prefetch /
    // useArticleViewContent 等) で本文画像を確実に拾うため。
    if (!src || src.startsWith("data:")) {
      src = /\bdata-src=["']([^"']+)["']/i.exec(attrs)?.[1] ?? src;
    }
    if (!isCollectableUrl(src)) continue;
    if (isTooSmallByUrl(src)) continue;
    const widthAttr = /\bwidth=["']([^"']+)["']/i.exec(attrs)?.[1];
    const heightAttr = /\bheight=["']([^"']+)["']/i.exec(attrs)?.[1];
    const styleAttr = /\bstyle=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (isTooSmallByAttrs(widthAttr, heightAttr, styleAttr)) continue;
    tryAdd(src);
  }
  return result;
}

/**
 * コンテナ内の全 img 要素から画像 URL を重複なしで抽出する。
 * live DOM（useImageDownload 等）向け。
 *
 * - `<a href="*.jpg/.png/...">` で画像を直接指すアンカー (#667: wallhaven 等の thumb→full 構造) を先に拾う
 * - live DOM では currentSrc（srcset 解決済み）を優先
 * - data: プレースホルダーは srcset からフォールバック
 * - data: URI / 非 proxy・非絶対 URL は除外
 * - naturalWidth/Height が取れる場合は両辺とも `MIN_IMAGE_SIZE_PX` 未満を除外
 * - 実寸が未解決（0）なら HTML 属性 / style から同条件で除外
 */
export function collectImageUrls(container: Element, seen?: Set<string>): string[] {
  const s = seen ?? new Set<string>();
  const result: string[] = [];

  // #885: 重複判定は normalize 後 URL で行う (collectImageUrlsFromHtml と同 pattern)
  function tryAdd(rawUrl: string): void {
    const key = normalizeImageUrlForDedup(rawUrl);
    if (s.has(key)) return;
    s.add(key);
    result.push(rawUrl);
  }

  // #667: <a href="image-url"> を先に走査してフル解像度画像を拾う
  for (const a of container.querySelectorAll("a[href]")) {
    const href = (a as HTMLAnchorElement).getAttribute("href") ?? "";
    if (!isImageHref(href)) continue;
    if (!isCollectableUrl(href)) continue;
    tryAdd(href);
  }

  // #794: <picture><source srcset="..."> の高解像度 URL を抽出
  // <audio>/<video> 内の <source> は通常 `src` 属性を使い srcset は持たないので干渉なし
  for (const source of container.querySelectorAll("source[srcset]")) {
    const src = bestSrcFromSrcset(source.getAttribute("srcset") ?? "");
    if (!isCollectableUrl(src)) continue;
    if (isTooSmallByUrl(src)) continue;
    tryAdd(src);
  }

  for (const img of container.querySelectorAll("img")) {
    const el = img as HTMLImageElement;
    let src = el.currentSrc || el.getAttribute("src") || "";
    if (!src || src.startsWith("data:")) {
      src = bestSrcFromSrcset(el.getAttribute("srcset") ?? "");
    }
    // #897: live DOM 経路でも raw HTML 経路と同じ fallback chain を維持する
    // (`collectImageUrlsFromHtml` と sibling 規範整合)。fixLazyImages 適用済 DOM
    // では data-src は既に src に統合済のため通常は no-op、未統合 DOM での safety net。
    if (!src || src.startsWith("data:")) {
      src = el.getAttribute("data-src") ?? src;
    }
    if (!isCollectableUrl(src)) continue;
    if (isTooSmallByUrl(src)) continue;
    const nw = el.naturalWidth;
    const nh = el.naturalHeight;
    if (nw > 0 && nh > 0) {
      if (nw < MIN_IMAGE_SIZE_PX && nh < MIN_IMAGE_SIZE_PX) continue;
    } else if (
      isTooSmallByAttrs(
        el.getAttribute("width"),
        el.getAttribute("height"),
        el.getAttribute("style"),
      )
    ) {
      continue;
    }
    tryAdd(src);
  }
  return result;
}
