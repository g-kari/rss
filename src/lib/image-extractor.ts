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
export const MIN_IMAGE_SIZE_PX = 160;

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

/** data: URI・重複・非 http/proxy URL を除外して収集対象かどうかを判定する */
function isCollectableUrl(src: string, seen: Set<string>): boolean {
  return (
    !!src &&
    !seen.has(src) &&
    !src.startsWith("data:") &&
    (src.startsWith("/api/image-proxy?") || src.startsWith("http"))
  );
}

/** "60" / "60px" など数値のみ受け付け、"100%" や "auto" は null を返す */
function parseSizeAttr(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d+(?:\.\d+)?)\s*(?:px)?$/i.exec(value.trim());
  return m ? Number(m[1]) : null;
}

/** style 文字列から `width: 60px` / `height: 60px` の数値を取り出す。px 以外は null */
function parseSizeFromStyle(
  style: string | null | undefined,
  prop: "width" | "height",
): number | null {
  if (!style) return null;
  const re = new RegExp(`\\b${prop}\\s*:\\s*(\\d+(?:\\.\\d+)?)\\s*px`, "i");
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
 * - src 属性を優先し、data: の場合は srcset からフォールバック
 * - data: URI / 非 proxy・非絶対 URL は除外
 * - width/height 属性（または style）から両辺とも `MIN_IMAGE_SIZE_PX` 未満と判定できる画像は除外
 */
export function collectImageUrlsFromHtml(html: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const imgRe = /<img\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const attrs = m[1];
    let src = /\bsrc=["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
    if (!src || src.startsWith("data:")) {
      const srcset = /\bsrcset=["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
      src = bestSrcFromSrcset(srcset);
    }
    if (!isCollectableUrl(src, seen)) continue;
    if (isTooSmallByUrl(src)) continue;
    const widthAttr = /\bwidth=["']([^"']+)["']/i.exec(attrs)?.[1];
    const heightAttr = /\bheight=["']([^"']+)["']/i.exec(attrs)?.[1];
    const styleAttr = /\bstyle=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (isTooSmallByAttrs(widthAttr, heightAttr, styleAttr)) continue;
    seen.add(src);
    result.push(src);
  }
  return result;
}

/**
 * コンテナ内の全 img 要素から画像 URL を重複なしで抽出する。
 * live DOM（useImageDownload 等）向け。
 *
 * - live DOM では currentSrc（srcset 解決済み）を優先
 * - data: プレースホルダーは srcset からフォールバック
 * - data: URI / 非 proxy・非絶対 URL は除外
 * - naturalWidth/Height が取れる場合は両辺とも `MIN_IMAGE_SIZE_PX` 未満を除外
 * - 実寸が未解決（0）なら HTML 属性 / style から同条件で除外
 */
export function collectImageUrls(container: Element, seen?: Set<string>): string[] {
  const s = seen ?? new Set<string>();
  const result: string[] = [];
  for (const img of container.querySelectorAll("img")) {
    const el = img as HTMLImageElement;
    let src = el.currentSrc || el.getAttribute("src") || "";
    if (!src || src.startsWith("data:")) {
      src = bestSrcFromSrcset(el.getAttribute("srcset") ?? "");
    }
    if (!isCollectableUrl(src, s)) continue;
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
    s.add(src);
    result.push(src);
  }
  return result;
}
