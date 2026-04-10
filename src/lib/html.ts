/**
 * HTML サニタイズユーティリティ
 *
 * XSS・インジェクション対策のための正規表現ベースのサニタイズ関数。
 * RSS フィードの content と外部ページ取得の両方で共有する。
 */

/** HTML タグを除去してプレーンテキストを返す */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
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
    .replace(/&(Tab|NewLine|colon);/g, (_, e) =>
      e === "Tab" ? "\t" : e === "NewLine" ? "\n" : ":",
    )
    .replace(/[\u0000-\u0020\u007F]/g, "");
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
  return unescapeHtml(html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " "))
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
 * - position: fixed / sticky を除去: UI 全体を覆うフィッシングオーバーレイを防ぐ
 */
function sanitizeStyleAttr(style: string): string {
  return (
    style
      .replace(/\burl\s*\([^)]*\)/gi, "")
      // -webkit- プレフィックス付きは \b が `-` 前に効かないため \b なしで除去
      .replace(/-webkit-image-set\s*\([^)]*\)/gi, "")
      .replace(/\bimage-set\s*\([^)]*\)/gi, "")
      .replace(/\bposition\s*:\s*(fixed|sticky)\b[^;]*(;|$)/gi, "")
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

export function sanitizeHtml(html: string): string {
  return (
    html
      // 不可視 Unicode 文字を除去。
      // U+00AD (SOFT HYPHEN), U+200B–U+200D (ZERO WIDTH SPACE/NON-JOINER/JOINER),
      // U+2060 (WORD JOINER), U+FEFF (ZERO WIDTH NO-BREAK SPACE / BOM) などは
      // 表示上は見えないが、HTML 属性名の途中に挿入されると
      // 正規表現ベースのイベントハンドラ除去（on\w+ パターン）を
      // バイパスする攻撃ベクトルになりうる。
      // 例: `on​error=` (U+200B 挿入) → on\w+ にマッチせず XSS が残存する恐れ。
      // サニタイズの最初に除去することで後続の全パターンを保護する。
      .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
      // 閉じタグを持つブロック要素を除去。
      // [\s\S]*? (非貪欲) を使用することで、tempered greedy token パターン
      // [^<]*(?:(?!<\/tag>)<[^<]*)* による ReDoS（カタストロフィックバックトラッキング）を防ぐ。
      // <tag> 未閉じの場合は次の </ まで除去するため、開始タグが残ることもあるが
      // セキュリティ上は許容範囲（後続のイベントハンドラ除去が補完する）。
      // 閉じタグの \s* は HTML5 仕様に基づく: </script > や </style\n> など
      // タグ名直後に空白を置いた形式でもブラウザは有効な終了タグとして解釈するため、
      // \s* を追加してサニタイザーのバイパスを防ぐ。
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
      // <link> タグを除去（React 19 のリソースホイスティングによる無限ループ防止）
      .replace(/<link\b[^>]*\/?>/gi, "")
      // <base> タグを除去（相対 URL ハイジャック防止）
      .replace(/<base\b[^>]*\/?>/gi, "")
      // <noscript> を除去（JavaScript 無効環境でのレンダリング防止）
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, "")
      // <template> を除去（DOM ツリーに挿入可能な任意 HTML の封じ込め）
      .replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, "")
      // <object>, <embed> を除去
      .replace(/<object\b[^>]*>[\s\S]*?<\/object\s*>/gi, "")
      .replace(/<embed\b[^>]*\/?>/gi, "")
      // <form> 開始・終了タグを除去（フィッシング対策）
      // RSS 記事内のフォーム要素は外部サーバーへのデータ送信やクレデンシャル詐取に悪用できる。
      // 内部コンテンツ（テキスト・画像等）は保持し、タグ枠のみ除去する。
      .replace(/<\/?form\b[^>]*>/gi, "")
      // <input> / <select> / <textarea> を除去（フィッシング入力欄防止）
      // 入力フィールドはパスワード詐取や偽 UI による social engineering に悪用できる。
      .replace(/<input\b[^>]*\/?>/gi, "")
      .replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea\s*>/gi, "")
      .replace(/<select\b[^>]*>[\s\S]*?<\/select\s*>/gi, "")
      // SVG <foreignObject> を除去（任意の HTML を埋め込める危険な要素）
      .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi, "")
      .replace(/<foreignObject\b[^>]*\/>/gi, "")
      // SVG アニメーション要素を除去（attributeName 経由のイベントハンドラ注入防止）
      // <animate attributeName="href" to="javascript:alert(1)"> 等で href/イベントハンドラを
      // 動的に書き換えられるため、animate / animateTransform / animateMotion / set を除去する
      .replace(/<animate\b[^>]*\/?>/gi, "")
      .replace(/<animateTransform\b[^>]*\/?>/gi, "")
      .replace(/<animateMotion\b[^>]*>[\s\S]*?<\/animateMotion\s*>/gi, "")
      .replace(/<animateMotion\b[^>]*\/?>/gi, "")
      .replace(/<set\b[^>]*\/?>/gi, "")
      // SVG <use> の外部参照を除去（クロスオリジン SVG 読み込みによるプライバシー侵害防止）
      // href / xlink:href が # のみのフラグメント参照は同一ドキュメント内なので安全、それ以外を除去
      //
      // 処理順序:
      //   1. <use ...>...</use> ペア: 外部参照ならフォールバックコンテンツごと除去、フラグメント参照は保持
      //   2. 残余の <use ...> （自己閉じ・未閉じ開始タグ）: 同様に href を検査して除去/保持
      //
      // 注意: </use> の後続削除は行わない。
      // ステップ1が <use>...</use> ペアを一括処理するため、外部参照の </use> は既に除去済み。
      // 孤立した </use> はブラウザが無視するため、セキュリティリスクはない。
      .replace(/<use\b([^>]*)>([\s\S]*?)<\/use\s*>/gi, sanitizeUse)
      // 自己閉じタグ・未閉じ開始タグを処理（上記でマッチしなかった残余）
      .replace(/<use\b([^>]*)>/gi, sanitizeUse)
      // <iframe> は信頼済みドメイン以外を除去
      .replace(/<iframe\b([^>]*)>([\s\S]*?)<\/iframe\s*>/gi, sanitizeIframe)
      .replace(/<iframe\b([^>]*)\/>/gi, sanitizeIframe)
      // 閉じタグ・自己閉じのない <iframe> 開始タグを除去（未閉じ iframe のサニタイズ漏れ対策）
      // <use> と同様に、上記 2 パターンでマッチしなかった残余の <iframe...> を処理する。
      // RSS content:encoded では </iframe> が省略された形で記述されることがあり、
      // 放置するとブラウザが暗黙的に閉じてレンダリングし、フィッシング iframe に悪用されうる。
      .replace(/<iframe\b([^>]*)>/gi, sanitizeIframe)
      // 危険な <meta http-equiv> を除去。
      // - refresh: クライアントサイドリダイレクト防止
      // - set-cookie: レスポンスヘッダー偽装による cookie 注入防止
      // - Content-Security-Policy: 上位 CSP の上書き防止
      // - X-Frame-Options / Permissions-Policy: セキュリティポリシー上書き防止
      // - Link: 外部リソース事前読み込みによるプライバシー侵害防止
      // - X-UA-Compatible: IE 互換モード強制によるレンダリング挙動変更防止
      // - cache-control / pragma / expires: キャッシュ操作防止
      .replace(
        /<meta\b[^>]*http-equiv\s*=\s*["'](?:refresh|set-cookie|content-security-policy|x-frame-options|permissions-policy|link|x-ua-compatible|cache-control|pragma|expires)["'][^>]*\/?>/gi,
        "",
      )
      // <meta name="referrer"> を除去。
      // ページ内の referrer ポリシーを "unsafe-url" 等で上書きされると、
      // 記事リンクのクリック時にフル URL（認証トークン等）がリファラーとして漏洩する恐れがある。
      // モダンブラウザは body 内の meta[name=referrer] も適用するため除去する。
      .replace(/<meta\b[^>]*name\s*=\s*["']referrer["'][^>]*\/?>/gi, "")
      // インラインイベントハンドラを除去。
      // [\s/]+ : スペース・タブ・スラッシュ区切り（/ 区切りバイパス対策）
      // (?<=['"`]): 引用符・バックティック直後に on\w+ が来るケース（<img src="x"onerror=...> や <img src=`x`onerror=...>）のバイパス対策
      .replace(/(?:[\s/]+|(?<=['"`]))on\w+\s*=\s*(?:"[^"]*"|'[^']*'|`[^`]*`|[^\s>]*)/gi, "")
      // xlink:href（SVG）の javascript: / vbscript: / data: スキームを除去（完全な属性名を削除）
      // 汎用 href パターンより先に処理することで xlink: プレフィックスが残留しないようにする
      .replace(/xlink:href\s*=\s*["'](?:javascript|vbscript|data):[^"']*["']/gi, "")
      .replace(/xlink:href\s*=\s*(?:javascript|vbscript|data):[^\s>]*/gi, "")
      // javascript: / vbscript: / data: スキームを href/src/action/formaction から除去（クォートあり・なし両対応）
      .replace(
        /(?:href|src|action|formaction)\s*=\s*["'](?:javascript|vbscript|data):[^"']*["']/gi,
        "",
      )
      .replace(/(?:href|src|action|formaction)\s*=\s*(?:javascript|vbscript|data):[^\s>]*/gi, "")
      // xlink:href の HTML エンティティ・先頭空白バイパスを除去
      // 汎用 href パターンより先に処理することで xlink: プレフィックスが残留しないようにする
      // (["'])…\1 で開閉クォートが一致する場合のみマッチし、2 つめのキャプチャが属性値
      .replace(/xlink:href\s*=\s*(["'])([^"']*)\1/gi, (m, _q, val) =>
        hasDangerousScheme(val) ? "" : m,
      )
      // HTML エンティティや先頭空白でエンコードされた危険スキームを除去（hasDangerousScheme で検出）
      .replace(/(?:href|src|action|formaction)\s*=\s*(["'])([^"']*)\1/gi, (m, _q, val) =>
        hasDangerousScheme(val) ? "" : m,
      )
      // srcdoc 属性を除去（iframe フォールバック経由の HTML インジェクション防止）
      .replace(/\bsrcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")
      // ping 属性を除去（リンククリック時の意図しないリクエスト防止）
      .replace(/\bping\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")
      // HTML Popover API 属性を除去（JS 不要のトップレイヤー UI 注入防止）
      // <any-element popover> + <button popovertarget="id"> の組み合わせで JS なしに
      // ブラウザのトップレイヤーへ任意 HTML をオーバーレイ表示できる。
      // RSS 記事がリーダー UI を覆うフィッシング画面を作れてしまうため除去する。
      // popover はブール属性（値なし可）のため (?:=...)? で値あり・なし両対応する。
      .replace(/\bpopover(?:target(?:action)?)?\s*(?:=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?/gi, "")
      // <dialog> 開始・終了タグを除去（ドキュメントフロー内での position:absolute 配置防止）
      // <dialog open> はブラウザ UA スタイルシートの position:absolute で記事外コンテンツを
      // 覆う可能性がある。<form> と同様にタグ枠のみ除去してコンテンツは保持する。
      .replace(/<\/?dialog\b[^>]*>/gi, "")
      // <a target="_blank"> に rel="noopener noreferrer" を強制付与（タブナッピング防止）
      // RSS 記事内の外部リンクが window.opener を経由してリンク元ページを制御するリスクを防ぐ。
      // fixExternalLinks が適用済みのコンテンツには既に rel が設定されているため重複追加は発生しない。
      .replace(/<a\b([^>]*)>/gi, ensureAnchorNoopener)
      // inline style 属性をサニタイズ（CSS トラッキング・フィッシングオーバーレイ防止）
      // style 値は url('...') のように内部に逆クォートを含みうるため、クォート種別ごとに個別パターン
      .replace(/\bstyle\s*=\s*"([^"]*)"/gi, (_m, s) => `style="${sanitizeStyleAttr(s)}"`)
      .replace(/\bstyle\s*=\s*'([^']*)'/gi, (_m, s) => `style="${sanitizeStyleAttr(s)}"`)
      // クォートなし style 属性をサニタイズ（例: <div style=background:url(tracker)>）
      // [^"'\s>] で開始 → すでにクォート処理済みの属性は再マッチしない
      .replace(/\bstyle\s*=\s*([^"'\s>][^\s>]*)/gi, (_m, s) => `style="${sanitizeStyleAttr(s)}"`)
      .trim()
  );
}
