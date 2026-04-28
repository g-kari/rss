/**
 * HTML サニタイズユーティリティ
 *
 * XSS・インジェクション対策のための正規表現ベースのサニタイズ関数。
 * RSS フィードの content と外部ページ取得の両方で共有する。
 */

// タグ除去は除去後に残った文字列が再度タグ記号を形成するバイパスを防ぐため
// 不動点反復で行う。無限ループ防止に反復上限を設ける。
const TAG_STRIP_MAX_PASSES = 8;

function stripTagsIter(html: string, repl: string): string {
  let curr = html;
  for (let pass = 0; pass < TAG_STRIP_MAX_PASSES; pass++) {
    const prev = curr;
    curr = curr.replace(/<[^>]*>/g, repl);
    if (curr === prev) break;
  }
  return curr;
}

/** HTML タグを除去してプレーンテキストを返す */
export function stripHtml(html: string): string {
  return stripTagsIter(html, "").trim();
}

/** HTML 特殊文字をエスケープする（テキストを属性値・要素内容として安全に埋め込む） */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** HTML エンティティをデコードする（URL 中の &amp; → & など） */

function decodeCodePoint(code: number): string {
  if (code <= 31 || code === 127) return "";
  if (code >= 0xd800 && code <= 0xdfff) return "";
  if (code > 0x10ffff) return "";
  return String.fromCodePoint(code);
}

export function unescapeHtml(s: string): string {
  return s
    .replace(/&(?:amp|lt|gt|quot|#(\d+)|#x([0-9a-fA-F]+));/gi, (m, dec, hex) => {
      if (dec !== undefined) return decodeCodePoint(Number(dec));
      if (hex !== undefined) return decodeCodePoint(parseInt(hex, 16));
      switch (m.toLowerCase()) {
        case "&amp;":
          return "&";
        case "&lt;":
          return "<";
        case "&gt;":
          return ">";
        case "&quot;":
          return '"';
        default:
          return m;
      }
    })
    .replace(/[\u0080-\u009F\u00AD\u200B-\u200D\u2028\u2029\uFEFF]/g, "");
}

/**
 * URL 属性値が危険なスキームを含むかどうかを判定する。
 * HTML エンティティデコードと制御文字除去後に javascript: / vbscript: / data: を検出する。
 * ブラウザは属性値の HTML エンティティをデコードし空白・制御文字を無視するため、
 * 例: href="&#106;avascript:..." → &#106; = 'j' → javascript: に化けることがある。
 *
 * 制御文字は先頭だけでなく全体から除去する。
 * ブラウザが javascript\x00: のようにスキーム名中に埋め込まれた制御文字を無視する場合に
 * 先頭のみ除去では検出できないため、文字列全体から除去して判定する。
 */
function hasDangerousScheme(val: string): boolean {
  const decoded = unescapeHtml(val)
    // unescapeHtml は数値文字参照（&#9; &#xA; 等）を処理するが、
    // HTML5 の名前付き文字参照は以下の危険なものだけ補完する:
    //   &Tab;     → U+0009 (TAB)     ブラウザが URL パース時に先頭から除去
    //   &NewLine; → U+000A (LF)      同上
    //   &colon;   → U+003A (:)       "javascript&colon;alert()" で : をエンコードするバイパス
    //   &nbsp; / &NonBreakingSpace; → U+00A0 (&#160;) 以下の除去対象
    .replace(/&(Tab|NewLine|colon|nbsp|NonBreakingSpace);/gi, (_, e) => {
      const el = e.toLowerCase();
      if (el === "colon") return ":";
      return el === "tab" ? "\t" : el === "newline" ? "\n" : " ";
    })
    // U+0000-U+0020: ASCII 制御文字・空白, U+007F: DEL
    // U+00A0: NO-BREAK SPACE（&#160; / &nbsp; のデコード後残留対策）
    .replace(/[\u0000-\u0020\u007F\u00A0]/g, "");
  return /^(?:javascript|vbscript|data):/i.test(decoded);
}

/**
 * HTML 文字列から og:<property> メタタグの content 属性値を抽出する。
 * property 属性と content 属性の順序が前後するケースを両パターンでマッチする。
 *
 * property は正規表現エスケープ済みの文字列として扱う。
 * 将来的に動的な property 値が渡される場合に正規表現インジェクションを防ぐため。
 */
export function extractOgMeta(html: string, property: string): string {
  // 正規表現メタ文字をエスケープして ReDoS / インジェクションを防ぐ
  const prop = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // content=(["'])([^<>]*?)\1 でクォート種別を揃えてマッチする。
  // [^"']+パターンだと content="It's great" → "It" で切れるため。
  const m =
    html.match(
      new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=(["'])([^<>]*?)\\1`, "i"),
    ) ??
    html.match(
      new RegExp(`<meta[^>]+content=(["'])([^<>]*?)\\1[^>]+property=["']og:${prop}["']`, "i"),
    );
  return unescapeHtml(m?.[2] ?? "");
}

/** HTML タグを除去してプレーンテキストに変換する（AI 入力用） */
export function toPlainText(html: string): string {
  return unescapeHtml(stripTagsIter(html, " ").replace(/&nbsp;/gi, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * inline style 属性から危険な CSS プロパティを除去する。
 *
 * - url() 参照を除去: 外部リソース読み込みおよび CSS ベーストラッキング（閲覧行動の漏洩）を防ぐ
 *   例: background-image:url(https://tracker.example/pixel.gif) でピクセルトラッキングが可能
 * - image-set() / -webkit-image-set() を除去: bare string 記法 (url() なし) でも外部画像を読み込めるため
 *   例: background-image:image-set("https://tracker.example/pixel.gif" 1x) は url() を使わず外部リソースを取得できる
 * - position: fixed / sticky / absolute を除去: UI を覆うフィッシングオーバーレイを防ぐ
 *   absolute は fixed/sticky ほど広域ではないが、high z-index と組み合わせると
 *   記事ペイン内で他の UI 要素を覆うフィッシング UI を作れるため除去する。
 */
function sanitizeStyleAttr(style: string): string {
  return (
    style
      .replace(/\burl\s*\([^)]*\)/gi, "")
      // -webkit- プレフィックス付きは \b が `-` 前に効かないため \b なしで除去
      .replace(/-webkit-image-set\s*\([^)]*\)/gi, "")
      .replace(/\bimage-set\s*\([^)]*\)/gi, "")
      // position プロパティを除去（フィッシングオーバーレイ防止）
      // fixed/sticky/absolute を直接指定する場合だけでなく、
      // CSS 変数フォールバック経由のバイパスも防ぐため
      // `position: var(--x, fixed)` のような記述も含めて全値を除去する。
      // position: static/relative は無害だが、position: (...) を
      // すべて除去することで var() バイパスを確実に防げる。
      .replace(/\bposition\s*:[^;]*(;|$)/gi, "")
      // expression(): IE 独自の CSS 式評価。任意の JS 実行が可能なため除去。
      // モダンブラウザでは無効だが、古い環境へのフォールバック XSS 防止として除去する。
      // expression() の引数は括弧のネストを含みうるため、セミコロンまたは文字列末尾まで除去する。
      .replace(/\bexpression\s*\([^;]*(;|$)/gi, "")
      // -moz-binding: Firefox の XBL バインディング参照。外部 XUL/JS のロードに使われた（現在は廃止済み）。
      // behavior: IE の HTC 動作ファイル参照。外部スクリプトロードに使われた。
      // いずれも現代ブラウザでは動作しないが、念のため除去する。
      .replace(/-moz-binding\s*:[^;]*(;|$)/gi, "")
      .replace(/\bbehavior\s*:[^;]*(;|$)/gi, "")
  );
}

/**
 * iframe の src が信頼済みドメインかどうかを URL パースで厳密に検証する。
 *
 * 部分文字列マッチ (includes) を使うと
 * `https://evil.com/?x=youtube.com/embed` のような URL でバイパスできるため、
 * hostname と pathname をそれぞれ完全一致・プレフィックス一致で確認する。
 */

/** ホスト名完全一致 ＋ パスプレフィックス一致で判定するルール。pathPrefix 省略時はホスト名のみで許可。 */
export const TRUSTED_IFRAME_RULES: ReadonlyArray<{
  hosts: readonly string[];
  pathPrefix?: string;
}> = [
  { hosts: ["youtube.com", "www.youtube.com"], pathPrefix: "/embed/" },
  { hosts: ["youtube-nocookie.com", "www.youtube-nocookie.com"], pathPrefix: "/embed/" },
  { hosts: ["player.vimeo.com"] },
  { hosts: ["open.spotify.com"], pathPrefix: "/embed/" },
  { hosts: ["w.soundcloud.com"] },
  { hosts: ["player.twitch.tv"] },
  { hosts: ["clips.twitch.tv"], pathPrefix: "/embed" },
  { hosts: ["embed.nicovideo.jp"] },
  { hosts: ["embed.zenn.studio"] },
  { hosts: ["platform.twitter.com"], pathPrefix: "/embed/" },
  { hosts: ["speakerdeck.com"], pathPrefix: "/player/" },
];

function isTrustedIframeSrc(src: string): boolean {
  // プロトコル相対 URL を正規化
  const normalized = src.startsWith("//") ? "https:" + src : src;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return false;
  }
  // https のみ許可（http: / javascript: / data: などを排除）
  // 信頼済みドメインは全て HTTPS を提供しており、HTTP を許可する理由がない。
  // HTTP iframe は中間者攻撃でコンテンツを差し替えられるリスクがある。
  if (url.protocol !== "https:") return false;

  const h = url.hostname;
  const p = url.pathname;

  return TRUSTED_IFRAME_RULES.some(({ hosts, pathPrefix }) => {
    if (!hosts.includes(h)) return false;
    if (pathPrefix === undefined) return true;
    if (!p.startsWith(pathPrefix)) return false;
    // pathPrefix が '/' で終わる場合（例: "/embed/"）は startsWith だけで十分。
    // 終わらない場合（例: "/embed"）は次の文字が境界文字でなければ部分一致として拒否する。
    // 例: pathPrefix="/embed" のとき "/embedmalicious" は next="m" で拒否され、
    //     "/embed/clip1" は next="/" で許可、"/embed" 完全一致は next=undefined で許可。
    if (pathPrefix.endsWith("/")) return true;
    const next = p[pathPrefix.length];
    return next === undefined || next === "/" || next === "?" || next === "#";
  });
}

/**
 * SVG <use> 属性が同一ドキュメント内のフラグメント参照のみかどうかを判定する。
 *
 * href / xlink:href が "#id" 形式（# のみのフラグメント）なら安全（true を返す）。
 * 外部 URL・空 href・複数 # は安全でないため false を返す。
 *
 * URL エンコード（%23 → #）を解除してから判定する。
 * ブラウザは属性値を URL デコードして解釈するため、デコード後の値で検証しなければ
 * バイパスや誤除去が起きる。
 */
function isFragmentOnlyUse(attrs: string): boolean {
  const hrefMatch = attrs.match(/\b(?:xlink:)?href\s*=\s*["']([^"']*?)["']/i);
  const href = hrefMatch?.[1] ?? "";
  let decodedHref: string;
  try {
    decodedHref = decodeURIComponent(href);
  } catch {
    decodedHref = href;
  }
  return /^#[^#]*$/.test(decodedHref);
}

/** <use> タグを href 検査してフラグメント参照のみ保持する（sanitizeHtml 用コールバック） */
function sanitizeUse(m: string, attrs: string): string {
  return isFragmentOnlyUse(attrs) ? m : "";
}

/** <iframe> タグを src 検査して信頼済みドメインのみ保持する（sanitizeHtml 用コールバック） */
function sanitizeIframe(m: string, attrs: string): string {
  const src = attrs.match(/src\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
  return isTrustedIframeSrc(src) ? m : "";
}

/**
 * <a target="_blank"> に rel="noopener noreferrer" を強制付与する（sanitizeHtml 用コールバック）。
 *
 * target="_blank" のリンクは window.opener を通じてリンク元ページを操作できる。
 * これを悪用したタブナッピング攻撃（opener がリンク元ページを別 URL に遷移させる）を防ぐ。
 * モダンブラウザ（Chrome 88+、Firefox 79+）はデフォルトで noopener を付与するが、
 * 古いブラウザや一部環境では依然として opener が有効なため明示的に付与する。
 */
function ensureAnchorNoopener(m: string, attrs: string): string {
  // target="_blank" が含まれない場合はそのまま返す（クォートあり・なし両対応）
  if (!/\btarget\s*=\s*(?:["']_blank["']|_blank(?=[\s>/]|$))/i.test(attrs)) return m;

  // rel 属性がある場合: 既存値に noopener / noreferrer を追加
  if (/\brel\s*=/i.test(attrs)) {
    const newAttrs = attrs.replace(
      /\brel\s*=\s*(?:(["'])([^"']*)\1|([^\s"'>]*))/i,
      (
        _relMatch: string,
        _quote: string | undefined,
        quoted: string | undefined,
        unquoted: string | undefined,
      ) => {
        const existing = quoted ?? unquoted ?? "";
        const values = new Set(existing.split(/\s+/).filter(Boolean));
        values.add("noopener");
        values.add("noreferrer");
        return `rel="${[...values].join(" ")}"`;
      },
    );
    return `<a${newAttrs}>`;
  }

  // rel 属性がない場合: 新規追加
  return `<a${attrs} rel="noopener noreferrer">`;
}

/** sanitizeHtml のコールバック置換関数の型 */
type ReplaceFn = (substring: string, ...args: string[]) => string;

/**
 * sanitizeHtml 適用ルール（順序はセキュリティ上重要）
 *
 * 各エントリ: [正規表現, 置換値（'' = 除去 | コールバック = 条件付き変換）]
 * - 不可視 Unicode 文字の除去が最初に来ることで後続の on\w+ パターンを保護する
 * - xlink:href パターンは汎用 href より先に処理してプレフィックス残留を防ぐ
 * - [\s\S]*? (非貪欲) を使用することで ReDoS を防ぐ
 */
// HTML5 では終了タグ `</tagname attr>` の `>` までの属性/空白を無視して解釈するため、
// 終了タグの末尾は `\s*>` ではなく `\b[^>]*>` でマッチする必要がある。
// 例: `</script foo>` / `</script\t\n bar>` も有効な閉じタグとして扱われる。
const HTML_SANITIZE_RULES: Array<[RegExp, string | ReplaceFn]> = [
  // 不可視 Unicode 文字（後続パターンのバイパス防止のため最初に除去）
  [/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, ""],
  // コンテンツごと除去するブロック要素
  [/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ""],
  [/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, ""],
  [/<link\b[^>]*\/?>/gi, ""], // React 19 リソースホイスティング防止
  [/<base\b[^>]*\/?>/gi, ""], // 相対 URL ハイジャック防止
  [/<noscript\b[^>]*>[\s\S]*?<\/noscript\b[^>]*>/gi, ""],
  [/<template\b[^>]*>[\s\S]*?<\/template\b[^>]*>/gi, ""],
  [/<object\b[^>]*>[\s\S]*?<\/object\b[^>]*>/gi, ""],
  [/<embed\b[^>]*\/?>/gi, ""],
  // フォーム/入力要素（タグのみ除去・内容保持）
  [/<\/?form\b[^>]*>/gi, ""],
  [/<input\b[^>]*\/?>/gi, ""],
  [/<textarea\b[^>]*>[\s\S]*?<\/textarea\b[^>]*>/gi, ""],
  [/<select\b[^>]*>[\s\S]*?<\/select\b[^>]*>/gi, ""],
  // SVG 危険要素
  [/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\b[^>]*>/gi, ""],
  [/<foreignObject\b[^>]*\/>/gi, ""],
  [/<animate\b[^>]*\/?>/gi, ""],
  [/<animateTransform\b[^>]*\/?>/gi, ""],
  [/<animateMotion\b[^>]*>[\s\S]*?<\/animateMotion\b[^>]*>/gi, ""],
  [/<animateMotion\b[^>]*\/>/gi, ""],
  [/<set\b[^>]*\/?>/gi, ""],
  // SVG <use>（外部参照のみ除去・#フラグメント参照は保持）
  [/<use\b([^>]*)>([\s\S]*?)<\/use\b[^>]*>/gi, sanitizeUse as ReplaceFn],
  [/<use\b([^>]*)>/gi, sanitizeUse as ReplaceFn],
  // <iframe>（信頼済みドメイン以外を除去）
  [/<iframe\b([^>]*)>([\s\S]*?)<\/iframe\b[^>]*>/gi, sanitizeIframe as ReplaceFn],
  [/<iframe\b([^>]*)\/?>/gi, sanitizeIframe as ReplaceFn],
  [/<iframe\b([^>]*)>/gi, sanitizeIframe as ReplaceFn],
  // 危険な meta タグ
  [
    /<meta\b[^>]*http-equiv\s*=\s*["'](?:refresh|set-cookie|content-security-policy|x-frame-options|permissions-policy|link|x-ua-compatible|cache-control|pragma|expires)["'][^>]*\/?>/gi,
    "",
  ],
  [/<meta\b[^>]*name\s*=\s*["']referrer["'][^>]*\/?>/gi, ""],
  // インラインイベントハンドラ
  [/(?:[\s/]+|(?<=['"`]))on\w+\s*=\s*(?:"[^"]*"|'[^']*'|`[^`]*`|(?!["'`])[^\s>]*)/gi, ""],
  // xlink:href 危険スキーム（汎用 href より先に処理してプレフィックス残留を防ぐ）
  [/xlink:href\s*=\s*["'](?:javascript|vbscript|data):[^"']*["']/gi, ""],
  [/xlink:href\s*=\s*(?:javascript|vbscript|data):[^\s>]*/gi, ""],
  // href/src/action/formaction 危険スキーム
  [/(?:href|src|action|formaction)\s*=\s*["'](?:javascript|vbscript|data):[^"']*["']/gi, ""],
  [/(?:href|src|action|formaction)\s*=\s*(?:javascript|vbscript|data):[^\s>]*/gi, ""],
  // エンティティ/空白バイパスの危険スキーム（xlink:href が先）
  [/xlink:href\s*=\s*(["'])([^"']*)\1/gi, (m, _q, val) => (hasDangerousScheme(val) ? "" : m)],
  [
    /(?:href|src|action|formaction)\s*=\s*(["'])([^"']*)\1/gi,
    (m, _q, val) => (hasDangerousScheme(val) ? "" : m),
  ],
  // 危険な属性
  [/\bsrcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, ""],
  [/\bping\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, ""],
  [/\bpopover(?:target(?:action)?)?\s*(?:=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?/gi, ""],
  // <dialog>（タグのみ除去・内容保持）
  [/<\/?dialog\b[^>]*>/gi, ""],
  // <a target="_blank"> にタブナッピング対策
  [/<a\b([^>]*)>/gi, ensureAnchorNoopener as ReplaceFn],
  // style 属性サニタイズ（クォートあり・なし）
  [/\bstyle\s*=\s*"([^"]*)"/gi, (_m, s) => `style="${sanitizeStyleAttr(s)}"`],
  [/\bstyle\s*=\s*'([^']*)'/gi, (_m, s) => `style="${sanitizeStyleAttr(s)}"`],
  [/\bstyle\s*=\s*([^"'\s>][^\s>]*)/gi, (_m, s) => `style="${sanitizeStyleAttr(s)}"`],
];

function applyRule(s: string, pattern: RegExp, replacement: string | ReplaceFn): string {
  if (typeof replacement === "string") return s.replace(pattern, replacement);
  return s.replace(pattern, replacement as (m: string) => string);
}

// 多文字列の除去を 1 回だけ適用すると、除去後に隣接文字が再結合して
// 同じ危険パターンを再構成するバイパス（例: `<scr<script></script>ipt>`）が成立する。
// ルール全体を不動点（これ以上変化しない状態）まで繰り返し適用して多段バイパスを潰す。
// 無限ループ保護として最大反復回数を設ける。
const SANITIZE_MAX_PASSES = 8;

export function sanitizeHtml(html: string): string {
  let result = html;
  for (let pass = 0; pass < SANITIZE_MAX_PASSES; pass++) {
    const prev = result;
    for (const [pattern, replacement] of HTML_SANITIZE_RULES) {
      result = applyRule(result, pattern, replacement);
    }
    if (result === prev) break;
  }
  return result.trim();
}
