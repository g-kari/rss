/**
 * HTML 画像処理モジュール
 *
 * 遅延ロード画像の解決、画像サイズ処理、画像 URL の書き換え等の関数群。
 * html-post-processor.ts から分割。
 */
import { IMAGE_MIN_DIMENSION } from "./image-constants";
import { rewriteMediaSrcAttrs } from "./html-media-processors";
import { transformSrcset } from "./html-srcset";

/** pageUrl を URL オブジェクトにパースする。無効・空の場合は null を返す。 */
export function tryParseBase(pageUrl: string): URL | null {
  if (!pageUrl) return null;
  try {
    return new URL(pageUrl);
  } catch {
    return null;
  }
}

/**
 * srcset 属性内の各 URL に変換関数を適用するヘルパー。
 * 形式: "url1 descriptor1, url2 descriptor2, ..."
 * URL が http(s) でない場合（data: など）は変換をスキップする。
 */
// transformSrcset は src/lib/html-srcset.ts に分離 (#752)。本ファイル内では import 経由で利用。

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
      // `(?<![a-zA-Z-])src=` で `data-src=` の中の `src=` 部分への誤マッチを除外 (#895)。
      if (/(?<![a-zA-Z-])src=["'][^"']*["']/i.test(fixed)) {
        fixed = fixed.replace(/(?<![a-zA-Z-])src=["'][^"']*["']/i, `src="${resolved}"`);
      } else {
        // src 属性なしの遅延ロード画像: src を先頭に追加
        fixed = ` src="${resolved}"` + fixed;
      }
    }

    // data-srcset を srcset に昇格（遅延ロード対応）
    const dataSrcsetMatch = fixed.match(/\bdata-srcset=["']([^"']+)["']/i);
    if (dataSrcsetMatch) {
      // `(?<![a-zA-Z-])srcset=` で `data-srcset=` の中の `srcset=` 部分への誤マッチを除外 (#895)。
      if (/(?<![a-zA-Z-])srcset=["'][^"']*["']/i.test(fixed)) {
        fixed = fixed.replace(
          /(?<![a-zA-Z-])srcset=["'][^"']*["']/i,
          `srcset="${dataSrcsetMatch[1]}"`,
        );
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

    if (keepDimensions) {
      // 元画像サイズ以上に引き伸ばさないよう max-width を inline style に追加。
      // CSS width: 100% と組み合わせてコンテナ幅いっぱい or 元幅の小さい方に収まる (Issue #163)。
      const styleMatch = a.match(/\s+style\s*=\s*"([^"]*)"/i);
      if (styleMatch) {
        const existing = styleMatch[1];
        a = a.replace(
          styleMatch[0],
          ` style="${existing}${existing ? "; " : ""}max-width: ${w}px"`,
        );
      } else {
        a += ` style="max-width: ${w}px"`;
      }
    } else {
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
 * 記事本文内の外部画像 URL を /api/image-proxy 経由に書き換える (#752 で thin wrapper 化)。
 * fixImageDimensions で相対パスが絶対 URL に解決された後に適用する。
 * src と srcset の両方を対象とする。実体は `html-media-processors.ts#rewriteMediaSrcAttrs`。
 */
export function rewriteImageUrls(html: string): string {
  return rewriteMediaSrcAttrs(html, { tags: ["img"], proxyPath: "image-proxy", srcset: true });
}

/**
 * WordPress等のサムネイル画像（-30x30.jpg 等）を本文から除去する。
 * フルサイズ版が同一記事内に存在する場合、またはサイズが MIN_IMAGE_SIZE_PX 未満の場合に除去。
 */
export function removeSmallThumbnailImages(html: string): string {
  const thumbRe = /-(\d+)x(\d+)(?:_\w+)?\.(jpe?g|png|gif|webp|avif|svg)/i;
  return html.replace(/<img\b([^>]*)>/gi, (full, attrs: string) => {
    const srcMatch = /\bsrc=["']([^"']+)["']/i.exec(attrs);
    if (!srcMatch) return full;
    const src = srcMatch[1];
    const m = thumbRe.exec(src);
    if (!m) return full;
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (w < IMAGE_MIN_DIMENSION && h < IMAGE_MIN_DIMENSION) return "";
    return full;
  });
}
