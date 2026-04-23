import { sanitizeHtml, escapeHtml, unescapeHtml } from "./html";

/**
 * `pattern` が入力に対して変化を及ぼさなくなるまで `str.replace` を繰り返し適用する。
 *
 * 単純な `str.replace(/<script...>/, '')` は除去後に隣接文字列が再結合し、
 * 再び危険パターンを形成するバイパス（`<scr<script></script>ipt>` 等）を許してしまう。
 * 本ヘルパーは不動点反復で多段バイパスを潰しつつ、無限ループ保護として反復上限を設ける。
 */
export function replaceUntilStable(str: string, pattern: RegExp, replacement = ""): string {
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
export function tryParseBase(pageUrl: string): URL | null {
  if (!pageUrl) return null;
  try {
    return new URL(pageUrl);
  } catch {
    return null;
  }
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
  // EC / Shopify: ギャラリー要素を非表示 div に畳む（末尾 ImageGallery に収集させる）
  html = replaceBlocksByClass(
    html,
    ["ul", "div"],
    /class="[^"]*(?:product__media|media-gallery|product-gallery|thumbnail[s]?(?:-list|-wrapper)?|image-gallery|photo-gallery|product-images)[^"]*"/i,
    (inner) => {
      const imgs = [...inner.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
      return imgs.length > 0 ? `<div hidden>${imgs.join("")}</div>` : "";
    },
  );
  // 汎用: 画像のみで構成される <ul>（3件以上）を非表示 div に畳む（末尾 ImageGallery に収集させる）
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
    return imgs.length >= 3 ? `<div hidden>${imgs.join("")}</div>` : `${openTag}${inner}</ul>`;
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
    const relMatch = newAttrs.match(/\brel\s*=\s*(?:(["'])([^"']*)(\1)|([^\s"'>]+))/i);
    if (relMatch) {
      const existing = relMatch[2] ?? relMatch[4] ?? "";
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
 * WordPress等のサムネイル画像（-30x30.jpg 等）を本文から除去する。
 * フルサイズ版が同一記事内に存在する場合、またはサイズが MIN_IMAGE_SIZE_PX 未満の場合に除去。
 */
export function removeSmallThumbnailImages(html: string): string {
  const MIN_SIZE = 100;
  const thumbRe = /-(\d+)x(\d+)(?:_\w+)?\.(jpe?g|png|gif|webp|avif|svg)/i;
  return html.replace(/<img\b([^>]*)>/gi, (full, attrs: string) => {
    const srcMatch = /\bsrc=["']([^"']+)["']/i.exec(attrs);
    if (!srcMatch) return full;
    const src = srcMatch[1];
    const m = thumbRe.exec(src);
    if (!m) return full;
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (w < MIN_SIZE && h < MIN_SIZE) return "";
    return full;
  });
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
 *   5. removeSmallThumbnailImages: WordPress サムネイル (-NxN) の除去
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
  h = removeSmallThumbnailImages(h);
  return applyCorePipeline(h, pageUrl);
}

/**
 * Markdown → HTML 変換後の後処理パイプライン。
 * Zenn embed 等は変換時に消失するため、共通後処理（画像処理・テーブル・サニタイズ）のみ適用する。
 * sanitizeHtml は XSS 対策のため必ず最後に実行すること。
 */
export function postProcessMarkdownContent(html: string, pageUrl = ""): string {
  return applyCorePipeline(html, pageUrl);
}
