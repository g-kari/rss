/**
 * HTML ノイズ除去モジュール
 *
 * サイト固有のノイズ要素（いいね・シェア・関連記事 UI 等）を除去する関数群。
 * html-post-processor.ts から分割。
 */

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
export function processNestedBlocks(
  html: string,
  tags: string[],
  filter: ((openTag: string) => boolean) | null,
  replacer: (openTag: string, inner: string) => string,
): string {
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagPattern = new RegExp(`<(\\/)?(?:${tags.map(escapeRe).join("|")})\\b[^>]*>`, "gi");

  // matchAll で全開閉タグを一括収集（インデックス付き）
  const matches = [...html.matchAll(tagPattern)];

  let result = "";
  let i = 0;
  let mi = 0;

  while (mi < matches.length) {
    const m = matches[mi];
    const isClose = !!m[1]; // m[1] は "/" の有無

    if (isClose) {
      mi++;
      continue;
    }

    // 開きタグ
    const earliest = m.index!;
    const openTag = m[0];
    const tagName = openTag.match(/<([a-z]+)/i)?.[1]?.toLowerCase() ?? "";

    if (filter && !filter(openTag)) {
      result += html.slice(i, earliest + openTag.length);
      i = earliest + openTag.length;
      mi++;
      continue;
    }

    // 対応する閉じタグをスタックベースで探す
    let depth = 1;
    let nmi = mi + 1;
    let found = false;

    while (nmi < matches.length && depth > 0) {
      const nm = matches[nmi];
      const nmName = nm[0].match(/<\/?([a-z]+)/i)?.[1]?.toLowerCase() ?? "";
      if (nmName === tagName) {
        if (nm[1]) depth--;
        else depth++;
        if (depth === 0) {
          const closeStart = nm.index!;
          const inner = html.slice(earliest + openTag.length, closeStart);
          result += html.slice(i, earliest);
          result += replacer(openTag, inner);
          i = closeStart + nm[0].length;
          mi = nmi + 1;
          found = true;
          break;
        }
      }
      nmi++;
    }

    if (!found) {
      // 対応する閉じタグが見つからない場合は開きタグを出力してスキップ
      result += html.slice(i, earliest + openTag.length);
      i = earliest + openTag.length;
      mi++;
    }
  }

  result += html.slice(i);
  return result;
}

/** processNestedBlocks を使ってクラスパターンにマッチする div を除去する。 */
export function removeDivsByClass(html: string, classPattern: RegExp): string {
  return processNestedBlocks(
    html,
    ["div"],
    (openTag) => classPattern.test(openTag),
    () => "",
  );
}

/** processNestedBlocks を使ってクラスパターンにマッチするブロック要素を変換する。 */
export function replaceBlocksByClass(
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
  // 孤立 SVG アイコン: <svg> の中身が <use href="#..."> のみのものは、
  // ページ本体から切り出された記事に <symbol> 定義が残らないため空のまま描画される。
  // SVG はデフォルトサイズ 300x150 (HTML5 仕様) で謎の空白領域を生むので除去する。
  html = removeOrphanedIconSvgs(html);
  return html;
}

/**
 * 「孤立した SVG アイコン参照」(`<svg><use href="#fragment" /></svg>`) を除去する。
 *
 * 多くの Web サイトは `<svg style="display:none">` 内に `<symbol id="i-twitter">` を
 * 定義し、本文中で `<svg><use href="#i-twitter">` で参照する SVG sprite パターンを使う。
 * Readability で本文を切り出すと sprite 定義は失われ、参照だけが残る。
 *
 * SVG 要素は HTML5 仕様でデフォルト表示サイズ 300x150 を持つため、未定義参照の
 * `<svg>` は **「謎の 300x150 空白」** として記事内に多数現れる症状を引き起こす。
 *
 * 判定: `<svg>` の内側が **空白 + `<use>` タグのみ** で構成されているなら icon 参照と
 * みなして除去。テキストや `<image>` `<rect>` `<path>` 等の実コンテンツがあれば保持。
 *
 * 親が `<a>` 等のリンクでもそのままタグだけ残す (テキスト含むリンクは別の処理で
 * 既に表示されているため、空 `<a>` だけ残っても影響は限定的)。
 */
export function removeOrphanedIconSvgs(html: string): string {
  // ネストした <svg> (内側 svg もまた孤立 icon) は外側 1 パスでは inner 文字列として残る
  // ため、不動点反復で除去する。MAX_PASSES = 4 で実用的な深さをカバー。
  const MAX_PASSES = 4;
  let prev: string;
  let curr = html;
  let pass = 0;
  do {
    prev = curr;
    curr = processNestedBlocks(curr, ["svg"], null, (openTag, inner) => {
      // <use> と空の <svg></svg> を取り除いた残りに意味のあるコンテンツがあるか確認。
      // 空 <svg> 除去はネストした孤立 icon の検出に必要 (inner に内側 <svg></svg> が残っている場合)。
      const stripped = inner
        .replace(/<use\b[^>]*\/?>(?:[\s\S]*?<\/use\s*>)?/gi, "")
        .replace(/<svg\b[^>]*>\s*<\/svg\s*>/gi, "")
        .trim();
      if (stripped === "") return ""; // <use> のみ (= 孤立 icon 参照) → 除去
      return `${openTag}${inner}</svg>`; // 実コンテンツあり → openTag (属性含む) 保持
    });
    pass++;
  } while (curr !== prev && pass < MAX_PASSES);
  return curr;
}
