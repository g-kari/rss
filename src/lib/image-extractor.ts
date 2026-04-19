/**
 * 記事画像抽出ユーティリティ。
 *
 * - `bestSrcFromSrcset`: srcset 文字列から最高解像度エントリの URL を取り出す。
 * - `collectImageUrlsFromHtml`: HTML 文字列から正規表現ベースで画像 URL を抽出する（useMemo 等 DOM 不要な場面向け）。
 * - `collectImageUrls`: live DOM の Element から画像 URL を抽出する（useImageDownload 等 DOM 参照向け）。
 */

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

/**
 * HTML 文字列から画像 URL を重複なしで抽出する。
 * useMemo など DOM 操作が不要なコンテキスト向け。
 *
 * - src 属性を優先し、data: の場合は srcset からフォールバック
 * - data: URI / 非 proxy・非絶対 URL は除外
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
 */
export function collectImageUrls(container: Element, seen?: Set<string>): string[] {
  const s = seen ?? new Set<string>();
  const result: string[] = [];
  for (const img of container.querySelectorAll("img")) {
    let src = (img as HTMLImageElement).currentSrc || img.getAttribute("src") || "";
    if (!src || src.startsWith("data:")) {
      src = bestSrcFromSrcset(img.getAttribute("srcset") ?? "");
    }
    if (!isCollectableUrl(src, s)) continue;
    s.add(src);
    result.push(src);
  }
  return result;
}
