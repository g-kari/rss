---
description: HTML 後処理 pipeline (冪等 transform / 属性欠落 runtime fallback / SVG sprite / JSON-LD 補完 / 画像 DOM 走査) の規範集
paths: "src/lib/html-*.ts,src/lib/content.ts,src/lib/image-*.ts,src/lib/json-ld-images.ts,src/lib/regex-extractor.ts,src/lib/readability-extractor.ts,src/hooks/useArticleImageMaxWidth.ts"
---

# HTML 後処理 pipeline 規範

`coding-conventions.md` から #733 Step 3 で分割した、HTML 後処理パイプライン (content.ts / html-post-processor.ts / html-\*-processors.ts / image-extractor.ts / json-ld-images.ts) と関連 React hook の規範集。

## HTML 後処理で属性に依存する装飾は「属性欠落」のフォールバックを runtime に置く

`fixImageDimensions` のように **HTML 属性 (`width` / `height` / `alt` 等) が前提** の後処理は、属性が無いフィードでは何もしない。CSS 側がその後処理結果に依存している場合 (例: `width: 100%` + per-image inline `max-width`)、属性欠落時に **CSS の意図しない挙動** (小さい画像も画面いっぱい引き伸ばし) が発生する。

```typescript
// アンチパターン: HTML 属性 width/height が無いと max-width が付かない
function fixImageDimensions(html: string): string {
  return html.replace(/<img\b([^>]*)>/g, (m, attrs) => {
    const w = parseWidthAttr(attrs);
    const h = parseHeightAttr(attrs);
    if (w >= 16 && h >= 16) {
      return `<img${attrs} style="max-width: ${w}px">`;
    }
    return m; // ← 属性欠落時は max-width 無し → CSS width: 100% で引き伸ばし
  });
}

// 修正パターン: runtime 補完 hook で naturalWidth から max-width を後付け
export function useArticleImageMaxWidth(contentRef, contentKey) {
  useEffect(() => {
    const imgs = contentRef.current?.querySelectorAll<HTMLImageElement>("img");
    imgs?.forEach((img) => {
      if (img.style.maxWidth) return; // 既存 inline は尊重
      const apply = () => {
        if (img.naturalWidth > 0 && !img.style.maxWidth) {
          img.style.maxWidth = `${img.naturalWidth}px`;
        }
      };
      if (img.complete) apply();
      else img.addEventListener("load", apply, { once: true });
    });
  }, [contentRef, contentKey]);
}
```

**How to apply**: HTML 後処理が「属性に依存した装飾」を出力する場合 (CSS 一律変更は副作用大、runtime で `naturalWidth` 補完が安全):

1. 属性が無い場合の挙動を最初に確認 (CSS が想定外の動きをしないか)
2. 必要なら **runtime hook** で属性の代替情報 (naturalWidth / naturalHeight / textContent) を読んで補完
3. 既存 inline スタイルがある場合は **上書きしない** ガードを必ず入れる
4. cleanup (`removeEventListener`) を忘れない

主な使用箇所: `useArticleImageMaxWidth` — `fixImageDimensions` で max-width が付かない画像を runtime で補完

## 冪等な HTML transform は複数 pipeline 経路で重複呼出して安全網にする

`postProcess` (Readability 経由) / `applyCorePipeline` (xml-parser RSS 経由) のように **同じ output 形態を最終的に作る複数の pipeline 経路** がある場合、ある transform を 1 経路でしか呼ばないと、もう片方の経路で「変換漏れ」が発生する。

`transformSpeakerDeckScriptEmbeds` / `transformSlideShareEmbedLinks` / `transformZennLinkEmbeds` のように **冪等な (= 同入力に同出力 / 二度実行しても結果が変わらない) transform** は、**両経路で呼んで重複実行する** のが安全網パターン。

```typescript
// アンチパターン: extractMainContent (Readability 前変換) でのみ呼ぶ
function extractMainContent(html, pageUrl) {
  let preprocessed = transformSpeakerDeckScriptEmbeds(html); // ← Readability 用に script を iframe 化
  // ... Readability 抽出
  return postProcess(content, pageUrl); // ← postProcess は transform を呼ばない
}
function postProcess(content, pageUrl) {
  return applyCorePipeline(content, pageUrl); // ← sanitize 前に transform 呼んでいない
}
// → xml-parser → applyCorePipeline 経路 (RSS content 直流入) で script が
//   sanitize で除去される → ユーザーは「全文取得しないと iframe 出ない」状態

// 修正パターン: applyCorePipeline (両経路共通最終 stage) でも transform を呼ぶ
function applyCorePipeline(html, pageUrl) {
  let h = fixImageDimensions(html, pageUrl);
  h = rewriteImageUrls(h);
  h = fixExternalLinks(h, pageUrl);
  h = transformSpeakerDeckScriptEmbeds(h); // ← 冪等。Readability 経由でも二度実行 OK
  h = transformSlideShareEmbedLinks(h);
  h = wrapTables(h);
  return sanitizeHtml(h);
}
// extractMainContent 側の Readability 前変換は **依然必須** (Readability が script を
// 除去するため preClean 前に iframe 化しないと data-id が消失)。両方で呼ぶことで
// RSS 直流入 / Readability 経由の双方をカバー。
```

### 冪等判定軸

transform が冪等か判定する `f(f(x)) === f(x)` テスト:

| transform                                      | 冪等?       | 理由                                                                          |
| ---------------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| `transformSpeakerDeckScriptEmbeds`             | ✅ Yes      | 既に iframe 化済の HTML には script が無く no-op                              |
| `transformSlideShareEmbedLinks`                | ✅ Yes      | 既に iframe 化済の HTML には対象 `<a>` が無く no-op                           |
| `transformZennLinkEmbeds`                      | ✅ Yes      | 既に外部リンク化済の HTML には対象 span が無く no-op                          |
| `sanitizeHtml`                                 | ✅ Yes      | 一度 sanitize 済の HTML を再 sanitize しても安全 (denylist 経路全 match なし) |
| `rewriteImageUrls` (`/api/image-proxy` 経由化) | ❌ No       | 既にプロキシ化済の URL を再度プロキシで包む → 二重 encoded で壊れる           |
| `fixExternalLinks` (rel/target 付与)           | ⚠️ ほぼ Yes | rel/target 既存属性は上書きしないガードあれば冪等                             |

`rewriteImageUrls` のような **非冪等な transform** は 1 経路でのみ呼ぶ。冪等な transform だけが「重複呼出 OK」。

**How to apply**: HTML transform 関数を pipeline に組み込むときに以下を判定 (冪等な transform を複数経路で呼ぶことで、新規 pipeline 経路追加時の「変換漏れ」を未然に防げる):

1. **transform は冪等か?** TDD で `f(f(x)) === f(x)` を 1 ケース追加して確認
2. **冪等 + 全経路で必要** なら → 共通最終 stage (`applyCorePipeline` 等) に組み込む
3. **冪等 + Readability 前など特定タイミング必須** なら → 専用経路でも呼びつつ、共通 stage でも呼ぶ (二度実行で no-op)
4. **非冪等** なら → 1 経路でのみ呼ぶ。pipeline のコメントで「ここで 1 度だけ実行」を明示
5. 既存 transform の冪等性をリファクタで損なわないよう、spec に冪等性テストを追加するか jsdoc に「冪等」を明記

主な使用箇所: `applyCorePipeline` で `transformSpeakerDeckScriptEmbeds` / `transformSlideShareEmbedLinks` を Zenn と同パターンで重複呼出 — xml-parser → applyCorePipeline 経路 (RSS 直流入) で全文取得を待たずスライドが表示される

## SVG sprite パターンの本文抽出: `<use href="#fragment">` 孤立参照は除去する

ページ本体に `<svg style="display:none"><symbol id="i-twitter">...</symbol></svg>` で SVG sprite を定義し、本文中に `<svg><use href="#i-twitter">` で参照する設計は普及しているが、**Readability で本文だけ切り出すと sprite 定義が失われ参照だけが残る**。

```html
<!-- 元ページ -->
<body>
  <div style="display:none">
    <svg><symbol id="i-twitter"><path d="..."/></symbol></svg>
  </div>
  <article>
    <a><svg><use href="#i-twitter"></svg></a>  ← Readability に拾われる
  </article>
</body>

<!-- Readability 抽出後 -->
<a><svg><use href="#i-twitter"></svg></a>  ← symbol 定義が無いので空
```

問題: SVG 要素は HTML5 仕様で **デフォルトサイズ 300×150px** を持つ。未定義参照の空 `<svg>` は icon 1 個ごとに 300×150 の **謎の空白領域** として描画され、記事内に 10〜15 個並ぶと「ガタつき」「謎の空白」状態になる。

修正パターン: 本文後処理で「`<use>` のみで構成された `<svg>`」を識別して除去する純粋関数を入れる。

```typescript
export function removeOrphanedIconSvgs(html: string): string {
  return processNestedBlocks(html, ["svg"], null, (openTag, inner) => {
    const stripped = inner
      .replace(/<use\b[^>]*\/?>(?:[\s\S]*?<\/use\s*>)?/gi, "")
      .replace(/<svg\b[^>]*>\s*<\/svg\s*>/gi, "") // ネストした空 svg も除去
      .trim();
    if (stripped === "") return ""; // 孤立 icon 参照 → 除去
    return `${openTag}${inner}</svg>`; // 実コンテンツあり → openTag (属性) 保持
  });
}
```

**How to apply**: HTML 後処理で `<use>` のみの `<svg>` を識別して除去する純粋関数 + TDD (孤立 use / href 形式 / 複数 use / 実コンテンツ保持 / 親 a 残し / 属性保持 / ネスト) を入れる。`removeNoise` パイプラインの末尾に追加するのが安全な配置。

主な使用箇所: `removeOrphanedIconSvgs` (`html-noise-removal.ts`) — Twitter 系 / Skebetter 等 SVG sprite ページの「謎の空白」防止

## 画像主体ページは JSON-LD `image` を抽出して Readability の取りこぼしを補完する

Readability は **テキスト密度ベース** で本文を判定するため、テキストが少ない画像主体ページでは `「推薦」「関連記事」` 等を本文と誤判定して **記事固有の主要画像を取りこぼす** ことがある。

```
症状例 (Skebetter author/manga 個別ページ):
- 元 HTML に <img> 130 個、うち主要漫画画像 2 枚を含む
- Readability 抽出結果: profile_images だけ 54 個 (推薦セクションを「本文」と誤判定)
- 主要画像 0 枚 → ユーザー報告「2 枚あるはずなのに取れない」
```

既存の「画像損失 fallback」(`srcImgCount >= 8 && rcImgCount * 5 < srcImgCount`) は、`rcImgCount` (= 推薦の profile_images 54 個) が膨らんで条件が成立せず機能しない。

修正パターン: **JSON-LD `<script type="application/ld+json">` の `Article` 型 `image` フィールド** を主要画像の信頼ソースとして使う純粋関数を追加し、抽出結果に不足する画像を `<div hidden>` で末尾補完する。

```typescript
// 1. JSON-LD から記事主要画像を抽出
export function extractJsonLdImages(html: string): string[] {
  // <script type="application/ld+json"> を全て JSON.parse
  // @type が Article / NewsArticle / BlogPosting 等の image を採用
  // image は string / array / ImageObject ({ url } / { contentUrl }) 形式に対応
}

// 2. 抽出結果に含まれない画像のみ <div hidden> で補完
export function appendMissingJsonLdImages(content: string, urls: string[]): string {
  const missing = urls.filter((u) => !content.includes(u));
  if (missing.length === 0) return content;
  return content + `<div hidden>${missing.map((u) => `<img src="${u}" />`).join("")}</div>`;
}

// 3. extractMainContent の全パスに適用
const jsonLdImages = extractJsonLdImages(preprocessed);
const augment = (c: string) => appendMissingJsonLdImages(c, jsonLdImages);
return { content: augment(extractedContent) + buildGallery(), source: "..." };
```

**How to apply**:

1. テキスト密度ベースの本文抽出ツール (Readability 等) を使うとき、画像主体ページの fallback として JSON-LD を採取する
2. `@type` は `Article` / `NewsArticle` / `BlogPosting` / `TechArticle` 等の **article 系の型** を全て認識
3. `image` フィールドは `string` / `array` / `ImageObject ({ url } / { contentUrl })` の **3 形式** に対応
4. 入れ子オブジェクト (`BreadcrumbList` 内の関連 image など) を再帰探索して取りこぼさない
5. http(s) URL のみ採用 (data: / 相対 / javascript: 除外)
6. **抽出結果に既に含まれていれば追加しない** (重複排除)
7. `<div hidden>` 形式で末尾追加 (ImageGallery 互換、本文表示への影響なし)

主な使用箇所: `extractJsonLdImages` / `appendMissingJsonLdImages` (`json-ld-images.ts`) — `extractMainContent` の 3 抽出パス全てに `augmentWithJsonLd` を適用

## 画像 DOM 走査では `<img>` 単体でなく `<a href>` のフル解像度画像も拾う

画像系サイト (wallhaven / WordPress 系の写真記事 / pixiv 等) では `<a href="フル解像度.jpg"><img src="サムネ.jpg"></a>` 構造が一般的。`<img>` 要素だけ走査するロジックは:

1. **サムネ URL を取得** (= `<img src>` のサイズフィルタで除外されることが多い)
2. **フル解像度 URL を取りこぼす** (= `<a href>` の中にある)

結果として「画像 DL ボタンを押しても OGP 画像 (= 1 枚) しか保存されない」体感に直結する。`<a href>` 走査を追加することで、サムネが除外されてもフル解像度を確実に拾える。

```typescript
// アンチパターン: <img> 単体走査 — wallhaven 等で thumb 除外 → OGP のみ DL
export function collectImageUrls(container: Element): string[] {
  const result: string[] = [];
  for (const img of container.querySelectorAll("img")) {
    const src = img.currentSrc || img.getAttribute("src") || "";
    if (img.naturalWidth < MIN_IMAGE_SIZE_PX) continue; // ← サムネは除外
    result.push(src);
  }
  return result;
}

// 修正パターン: <a href> を先に拾ってフル解像度を確保
export function collectImageUrls(container: Element): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  // 先に <a href="image-url"> を走査
  for (const a of container.querySelectorAll("a[href]")) {
    const href = (a as HTMLAnchorElement).getAttribute("href") ?? "";
    if (!isImageHref(href)) continue; // .jpg / .png / .webp / .avif / .gif / .svg
    if (seen.has(href)) continue;
    seen.add(href);
    result.push(href);
  }

  // 次に <img> を走査 (サムネが除外されてもフル解像度は確保済み)
  for (const img of container.querySelectorAll("img")) {
    /* 既存ロジック */
  }
  return result;
}
```

**How to apply**: 画像 DL / 画像コレクション系の DOM 走査ロジックを書くとき (画像系サイトはサムネがサイズフィルタで除外されてフル解像度が `<a href>` にしか存在しないことが多い):

1. **`<img>` 単体走査だけで十分か** を最初に検討
2. ターゲットサイトに以下のいずれかが該当するなら **`<a href>` 走査も追加**:
   - 画像系サイト (写真共有 / 壁紙 / pixiv 等)
   - WordPress 系 (写真記事は thumb→full の anchor 構造が一般的)
   - 「サムネクリックで拡大表示」UX を持つサイト
3. **拡張子判定ヘルパー** を切り出す: `isImageHref(href): boolean` で `.jpg/.jpeg/.png/.gif/.webp/.avif/.svg` + クエリ文字列・大文字小文字対応
4. **`/api/image-proxy?url=...` 経由の URL** も対応 (内部の `url` パラメータをデコードして拡張子判定)
5. **走査順序**: `<a href>` を先に拾って seen set に登録 → 次に `<img>` を走査。これで href と img src が同 URL のときも自動的に重複排除される
6. TDD 必須: 「a href が画像 / 内部 img が小サイズで除外でも href は残る / 拡張子なしは無視 / 大文字小文字 / クエリ文字列 / 重複排除 / data: 相対 URL は無視 / proxy URL」を網羅

**反例 (やらない方が良いケース)**:

- **記事本文系サイト** (Qiita / Zenn / 技術ブログ等) — `<a href="画像">` で画像にリンクすることは少なく、anchor href は記事内リンク。誤検知は少ないが過剰実装になる可能性あり (拡張子チェックで弾かれるので実害なし)
- **広告画像が a タグで囲まれている UI** — 通常は広告自体が削除済み (`removeNoise` パイプライン) なので残らない

主な使用箇所: `collectImageUrls` / `collectImageUrlsFromHtml` (`image-extractor.ts`) — wallhaven 等の thumb→full 構造で OGP のみ DL されるバグ修正
