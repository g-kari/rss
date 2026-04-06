# リリースノート

## 2026-04-06 (バグ修正)

### バグ修正

- **Markdown エクスポート: Firefox でダウンロードが動作しない問題を修正** — `<a>` 要素を DOM に追加してから `.click()` するよう変更し、Firefox でもダウンロードが開始されるように修正。また `URL.revokeObjectURL()` を `setTimeout(1000)` で遅延させ、Blob URL がダウンロード開始前に解放されないよう修正
- **Markdown エクスポート: 記事タイトル・フィード名の Markdown インジェクションを修正** — タイトルに `]` `)` 等の Markdown メタ文字が含まれる場合にリンク構文が破損する問題を `escapeMarkdown()` ヘルパーで修正

## 2026-04-06 (新機能)

### 新機能

- **ブックマーク / 後で読む記事を Markdown エクスポート** — サイドバーのフッターに Markdown エクスポートボタンを追加。左クリックでブックマーク記事、右クリックで後で読む記事をフィードごとにグループ化した `.md` ファイルとしてダウンロードできる。Obsidian・Logseq・Notion 等 PKM ツールへの貼り付けにも便利。

- **スヌーズ期間選択** — `z` キーで期間選択モーダルを表示。1時間後・3時間後・今夜・明日の朝・来週の5択から選べるようになった（従来は1日固定）。

- **フォントファミリー切り替え** — 記事本文のフォントをゴシック（デフォルト）/ 明朝 / 等幅の3種類で切り替えられるようになった。ArticleView のツールバーに「ゴ」「明」「等」ボタンを追加。`F` キーでサイクル切り替えも可能。設定は `localStorage` に保存され次回以降も維持される。

## 2026-04-06

### ドキュメント整備

- **`server-auth.ts` の JSDoc 位置ズレを修正** — `parseJsonBody` の JSDoc が `requireString` の手前に誤配置され、`parseJsonBody` 自体に JSDoc が付いていなかった問題を修正。`requireString` と `parseJsonBody` の定義順を入れ替えて各関数に正しく JSDoc が対応するよう修正
- **`recommendation.ts` の `generateRecommendations` に JSDoc を追加** — メインの推薦生成関数にフロー説明（トピック抽出 → 3ソース並列実行 → マージ・フィルタ → キャッシュ保存）を記述
- **`url.ts` の `TRACKING_PARAMS` の JSDoc を修正** — `normalizeUrlForCache` 向けの説明が `TRACKING_PARAMS` 定数に誤って付いていたのを修正し、定数の実際の用途を簡潔に記述

### セキュリティ

- **閉じタグ末尾空白による `sanitizeHtml` バイパスを修正** — HTML5 仕様では `</style >` や `</script\n>` のようにタグ名直後に空白を置いた終了タグも有効として扱われるが、サニタイザーの正規表現が `<\/tagname>` のみにマッチしていたため、`</style >` 等でブロック除去をバイパスできた。`<\/tagname\s*>` に変更し、`<script>` / `<style>` / `<noscript>` / `<template>` / `<object>` / `<textarea>` / `<select>` / `<foreignObject>` / `<animateMotion>` / `<use>` / `<iframe>` の全閉じタグパターンを修正
- **CSS `image-set()` によるトラッキングバイパスを修正** — `sanitizeStyleAttr` が `url()` を除去していたが、`image-set("https://tracker.example/" 1x)` のような bare string 記法は除去されていなかった。`image-set()` および `-webkit-image-set()` を新たに除去対象に追加

## 2026-04-05

### セキュリティ（追記）

- **ReDoS 検出: ネストされた量指定子グループの検出漏れを修正** — `hasCatastrophicBacktracking` で `((ab)+)+` のように内側グループに量指定子を持つ外側グループが検出されないバイパスを修正。最内グループを段階的に平坦化しながら各ステップで検査するよう変更
- **リダイレクトコードを安全なコードのみに制限** — `fetchFollowSafeRedirects` のリダイレクト追跡対象を `300-399` 全範囲から `301 / 302 / 303 / 307 / 308` のみに絞り込み。廃止済みの `305 Use Proxy` 等を除外

### セキュリティ（追記）

- **ReDoS 検出: 文字クラスバイパスを修正** — `hasCatastrophicBacktracking` で文字クラス `[...]` の内容を除去してから検査するよう変更。`([a-z)]+)+` のように文字クラス内に `)` を含むパターンで検出が打ち切られるバイパスを修正

### セキュリティ（追記）

- **ReDoS 検出強化** — `keyword-filter.ts` の `hasCatastrophicBacktracking` で交互化パターン `(a|aa)+` を新たに検出対象に追加。従来はネストした量指定子のみ検出していたが、V8 でも重複オーバーラップする交互化は指数的バックトラッキングを引き起こすため対処
- **キーワード上限を適正化** — `MAX_KEYWORDS_PER_ARRAY` を 99999 → 500 に変更。ReDoS との組み合わせで Workers CPU バジェットを消費するリスクを低減

### リファクタリング

- **レートリミットヘルパー** — `checkAndUpdateCooldown` を `src/lib/rate-limit.ts` に抽出。4 つのエンドポイントに重複していたクールダウンロジックを 1 箇所に集約

### セキュリティ（追記）

- **AI エンドポイント レートリミット** — `POST /api/ai/summarize` / `POST /api/ai/translate` のキャッシュミス時に per-user 5 秒クールダウンを追加。`articleId` キャッシュヒット時はスキップ
- **単体フィードリフレッシュ レートリミット** — `POST /api/feeds/[id]/refresh` に per-feed 30 秒クールダウンを追加。全体リフレッシュの 2 分制限のバイパスを防止
- **推薦リフレッシュ レートリミット** — `POST /api/recommendations/refresh` に 5 分クールダウンを追加。連続呼び出しによる Workers AI 課金の積み上げを防止
- **ログアウト時に `token_exp` Cookie を削除** — `POST /api/auth/logout` で `access_token` / `refresh_token` に加え `token_exp` Cookie も削除するよう修正
- **OPML インポートの制御文字除去** — `sanitizeTitle` で NUL バイト (`\u0000`) のみ除去していたのを全 C0 制御文字 (`\u0000-\u001F`) と DEL (`\u007F`) に拡張

### バグ修正

- **リンクプレビュー OGP フェッチ数制限** — `useContentLinkPreviews` で1記事あたり最大10件のスタンドアロンリンクのみプレビューを取得するよう制限。多数のリンクがある記事でのリクエスト爆発を防止
- **フィード削除・リネームエラーの自動消去** — `useFeedOperations` の `deleteFeed` / `renameFeed` で失敗時のエラーメッセージが3秒後に自動で消えるよう修正。以前は手動でフォームをクリアするまで残り続けていた

### セキュリティ

- **フィードリフレッシュ レートリミット** — `POST /api/feeds/refresh` に 2 分クールダウンを追加。連続呼び出し時は 429 + `Retry-After` ヘッダーを返す
- **OGP テキストの HTML タグ除去** — `fetchPageOgpMeta` の title / description に `stripHtml` を適用し、HTML エンティティデコード後に残留するタグを排除

### リファクタリング

- `feeds/[id]/route.ts` の PATCH ハンドラで `title` の型チェックと空文字チェックを 1 ステップに統合し、不要な optional chaining (`body?.title`) を除去。`priority` の if/else を 2 行に圧縮

## 2026-04-04

### リファクタリング

- `FeedItem` のキーボードハンドラー (`handleKeyDown` / `handleCategoryKeyDown`) を `makeInputKeyHandler` ヘルパーで統一。Enter/Escape の重複ロジックを除去し、不要な `useCallback` も削除

## 2026-04-04 (リファクタリング1)

### リファクタリング

- `image-mime.ts` に `mimeToExt()` と `MIME_TO_EXT` マッピングを一元化し、`useImageDownload.ts` の重複定義を削除

## 2026-04-04 (新機能2)

### 新機能

- **フィードの更新停滞インジケーター** — 直近30日間に新着記事がないフィードのタイトル横に時計アイコンを表示するようになった。フィードが長期間更新されていないことを視覚的に把握でき、不要なフィードの整理に役立つ。フェッチエラー中のフィードには表示しない

## 2026-04-04 (セキュリティ4)

### セキュリティ

- **ISO 8601 正規表現に末尾アンカーを追加** — `isValidIso8601` の正規表現に `$` を追加し、`2024-01-01T00:00:00<script>` のような末尾への任意文字列注入を防止。オプショナルな小数秒 (`.sss`) とタイムゾーン (`Z`/`±HH:MM`) も正規に許容
- **ReDoS 検出パターンを強化** — `hasCatastrophicBacktracking` で `{n,}` / `{n,m}` 形式の量指定子を `+` に正規化してから検査するよう変更。`(a{2,})+` など従来は検出できなかったネスト量指定子パターンにも対応

## 2026-04-04 (リファクタリング2)

### リファクタリング

- **`isValidIso8601` を `validation.ts` に一元化** — `parseSnoozedUntil` と `POST /api/read-state` の両箇所で重複していた ISO 8601 正規表現チェックを型ガード関数として共通化し、重複を除去

## 2026-04-04 (セキュリティ3)

### セキュリティ

- **エラーログからスタックトレースを除去** — `withSession` / `withBinarySession` のエラーハンドラで `err` オブジェクト全体ではなく `name` と `message` のみをログ出力するよう変更。スタックトレースへのシークレット漏洩リスクを排除
- **CSP `media-src` を `*` → `https:` に制限** — `http://` スキームおよび `data:` URI の外部メディアを遮断し、Mixed Content リスクを低減
- **`GET /api/articles` の `feedHash` 形式バリデーション追加** — `sha256` 先頭 16 桁（小文字 16 進数）のみ受け付けるよう制限し、不正な R2 キーアクセスを防止

## 2026-04-04 (セキュリティ2)

### セキュリティ

- **AI プロンプトインジェクション対策** — `summarize` / `translate` API でユーザー提供コンテンツを `<article>` / `<text>` タグで明示的に区切り、システム指示との境界を明確化
- **`Permissions-Policy` 強化** — `payment`, `usb`, `bluetooth`, `display-capture`, `accelerometer`, `gyroscope`, `magnetometer` を無効化し、使用しない強力な API の攻撃面を削減
- **`X-Permitted-Cross-Domain-Policies: none` 追加** — Adobe Flash/PDF プラグインによるクロスドメインコンテンツ読み取りを禁止

## 2026-04-04 (セキュリティ)

### セキュリティ

- **HTTPS→HTTP ダウングレードリダイレクトをブロック** — `fetchFollowSafeRedirects` でリダイレクト先が HTTP にダウングレードされる場合に例外をスロー。中間者攻撃リスクを低減
- **ReDoS パターンを事前検出** — `keyword-filter.ts` のユーザー定義正規表現でネスト量指定子（`(a+)+` など）を検出し、壊滅的バックトラッキングを防止
- **`javascript:`/`data:` スキームのチェックを大文字小文字を区別せず実施** — `detectNextPageUrl` のスキームフィルタを `toLowerCase()` 後に比較するよう変更

## 2026-04-04 (リファクタリング)

### リファクタリング

- **`getTokenExpiry` 重複削除** — `useAuth.ts` と `api-fetch.ts` に同一実装が存在していたため、`useAuth.ts` からエクスポートして `api-fetch.ts` の重複を削除
- **`ArticleList` ref パターン統一** — `useRef` + 手動同期 (`ref.current = value`) を既存の `useSyncedRef` フックに統一

### バグ修正

- **ArticleList: レイアウト変更時にスクロールされないバグを修正** — `prevSelectedIdRef` が `id` のみを追跡していたため、同じ記事を選択したままレイアウトを変更するとスクロールが発動しなかった。`id` と `layout` を合わせて追跡する `prevScrollStateRef` に変更

## 2026-04-04 (バグ修正3)

### バグ修正

- **リフレッシュトークン race condition を修正** — `/api/auth/me` が `refreshTokens()` を直接呼び出していたため、同一アイソレート内で `/api/auth/me` と他の Route Handler が同時に expired token を受け取ると独立してリフレッシュしてしまい one-time-use の refresh token が競合していた。`deduplicatedRefresh` を共有するよう変更し、同一アイソレート内では 1 回だけ実行される
- **クライアント側 race 軽減** — `apiFetch` で `token_exp` cookie をチェックし、期限切れ時はリクエスト送信前にプロアクティブにリフレッシュするよう変更。複数リクエストが同時に expired token でサーバーを叩く確率を低減
- **ログイン後 LP に戻る問題を修正** — `!user` 条件が `user === undefined`（認証チェック中）にも true になるため、ログイン直後に LP が表示されていた。`user === undefined` の場合はスピナーを表示し、LP は `user === null` の場合のみ表示するよう変更

## 2026-04-04 (バグ修正2)

### バグ修正

- **スクロールロード時に元の位置に戻るバグを修正** — 記事選択によって `readIds` が更新されると `visible` 配列の参照が変わり、`ArticleList` の `useEffect` が誤発火して `scrollToIndex` でスクロール位置がリセットされていた問題を修正。また `hasMore` 変化のたびに `IntersectionObserver` が disconnect/reconnect され、sentinel が可視状態のまま再登録されると `loadMore` が呼ばれないケースも修正した

## 2026-04-04 (バグ修正)

### バグ修正

- **PATCH /api/feeds/:id の書き込み順序を修正** — `writeUserSubscriptions` 後に `readFeedMeta` で 404 が返るケースでサーバーとクライアントの状態が乖離する問題を修正。meta の存在確認を書き込みより前に移動した
- **カテゴリ名に制御文字が保存されるのを防止** — `trim()` だけでは除去できない制御文字 (U+0000–U+001F, U+007F) を正規表現で除去するバリデーションを追加
- **カテゴリ並び順の安定化** — `localeCompare` に `sensitivity: "base"` を追加し、英字大文字/小文字混在時の並び順を一貫させた

## 2026-04-04 (テスト)

### テスト

- **article-filter テストカバレッジ拡充** — `readBeforeTimestamp`（一括既読タイムスタンプ）・`snoozedUntil`（スヌーズ）・`readingTimeRange`（読了時間フィルター）の3フィルターに対するテストが未実装だったため追加。合計18ケースを `e2e/article-filter.spec.ts` に追加し、境界値・`activeIds` バイパス・複合条件を網羅

## 2026-04-04 (新機能)

### 新機能

- **フィードカテゴリタグ** — フィードにユーザー定義のカテゴリ名を設定し、サイドバーでグループ表示できるようになった。フィードのホバーメニュー「カテゴリを設定」からインライン入力で編集・解除が可能。カテゴリ別にアルファベット/日本語順のセクションヘッダーで整理され、カテゴリなしのフィードはグループ下部に表示される

## 2026-04-04 (セキュリティ)

### セキュリティ

- **キーワードフィルターの正規表現長を制限** — ユーザー入力の `/pattern/` 形式正規表現キーワードに `MAX_REGEX_PATTERN_LENGTH = 50` の上限を追加し、カタストロフィックバックトラッキング (ReDoS) による Workers CPU 枯渇を防止。50文字超のパターンはプレーン文字列として `includes` 検索にフォールバックする

## 2026-04-04 (リファクタ)

### リファクタリング

- **`makeCycler` ヘルパーを追加して cycler コールバックを統一** — `toggleSortOrder` / `cycleDateRange` / `cycleReadingTimeRange` の3つが同じパターン（cycleValue + storageSet + setter + resetPage）を個別の `useCallback` で実装していた重複を解消。`makeFilterToggle` と同様の `makeCycler<T>` ヘルパーを追加し `useMemo` でまとめて生成。合わせて `toggleSortOrder` の戻り値を `void → SortOrder` に変更し、`useKeyboardNav` 内の冗長な `cycleValue(SORT_ORDER_CYCLE, sortOrder)` 再計算を削除

## 2026-04-04 (issues対応)

### バグ修正

- **自動ロード無限ループを修正** — 初回表示・未読フィルターで記事が枯渇するたびにサーバーから全ページを読み込み続けるバグを修正。初回ロード完了前はスキップし、連続自動ロードを最大3回に制限。フィード切り替え・フィルター変更時にカウントをリセット
- **記事重複表示を修正** — 同一URLの記事が複数フィードにシンジケートされた場合にクライアント側で重複して表示されるバグを修正。IDベース重複排除に加え、`link`ベースの第2パス重複排除を追加

### 新機能

- **記事上限を 5000 → 10000 件に拡張** — `getUserLatestArticles` の上限を `MAX_USER_ARTICLES = 10_000` に変更
- **仮想スクロール** — `@tanstack/react-virtual` を導入し、compact / list / card レイアウトで DOM 再利用によるスクロールを実現。10000件超でもDOMノード数を常に~30件に抑えてパフォーマンスを維持
- **オフライン時の記事閲覧** — Service Worker で `/api/auth/me` をキャッシュ（stale-while-revalidate）追加、`useAuth.ts` で `localStorage` に認証情報をキャッシュし、オフライン時にページリロードしてもログイン状態を維持して記事一覧を表示可能に

### 改善

- **OGP クライアントキャッシュ拡充** — `MAX_OGP_CACHE_SIZE` を 200 → 2000 件、`FETCH_BATCH_SIZE` を 5 → 10 に増加
- **read-state POST 頻度を削減** — デバウンスを 2秒 → 5秒 に延長、`isDirtyRef` で実際に状態が変化した場合のみ POST。既読済み記事の再選択では POST を発火しない

## 2026-04-04

### リファクタリング

- `loadStoredEnum` を `src/lib/storage.ts` に集約 — `useUIState.ts` に private 定義されていたユーティリティを共有エクスポートに移動し、`useFilteredArticles.ts` の `sortOrder` / `dateRange` / `readingTimeRange` 初期化で重複していたインラインロジックを排除

## 2026-04-03 (138)

### 新機能

- **読了時間フィルター** — 記事一覧のフィルターバーに「時間」ボタンを追加。クリックするたびに「〜5分」「〜15分」「15分〜」「全時間」をサイクルし、推定読了時間に基づいて記事を絞り込める。フィルター状態は localStorage に永続化される

## 2026-04-03 (137)

### セキュリティ

- **`/api/auth/me` の未認証デッドコードを削除** — `?beta=denied` クエリパラメータを受け取ると認証なしで `{ user: null, betaRestricted: true }` を返すコードパスを削除。フロントエンド (`useAuth.ts`) はページ URL の `?beta=denied` を直接検出して早期リターンするためこの API コードパスは実際には呼び出されないデッドコードであり、不必要な未認証エンドポイント動作を排除

## 2026-04-03 (136)

### リファクタリング

- **`FeedSidebar` の重複 `saveFilter` を削除** — `FeedSidebar.tsx` が独自に `PATCH /api/feeds/:id` を呼び出していた `saveFilter` 関数を削除し、`App.tsx` の `saveFilter` を `onSaveFilter` プロップ経由で受け取るよう変更。`apiFetch` インポートも不要になり削除。`useFeedOperations` の JSDoc から存在しない関数の記述も修正

## 2026-04-03 (135)

### バグ修正

- **X (Twitter) 埋め込みの見切れ問題を修正** — iframe 高さを固定 550px から 300px の初期値に変更し、`platform.twitter.com` からの `postMessage (twttr.resize)` を受信して動的にリサイズするよう修正 (`ArticleView.tsx`, `src/lib/content.ts`)

## 2026-04-03 (134)

### 新機能

- **記事一覧の日付グループヘッダー** — コンパクト表示・リスト表示で記事を「今日」「昨日」「今週」「今月」「それ以前」のセクションに自動分類して表示するようになった (`ArticleList.tsx`)

## 2026-04-03 (133)

### バグ修正

- `removeNoise` / `wrapTables` (`src/lib/content.ts`): 正規表現の非貪欲マッチがネストした同名要素で途中終了する問題を修正。`processNestedBlocks` ヘルパーで開閉タグのカウントによりネスト深度を正確に追跡するよう変更

## 2026-04-03 (132)

### セキュリティ

- `app/api/auth/callback/route.ts`: ベータ制限・ログイン成功後のリダイレクトで `request.url` をベースにしていたオープンリダイレクトのリスクを修正。`APP_BASE_URL` 環境変数を使うよう変更

### バグ修正

- `useArticleAi` (`src/hooks/useArticleAi.ts`): `useEffect` 依存配列から `ai.reset` / `translate.reset` を除去。`reset` は `useCallback([], [])` で安定参照のため `articleId` のみで十分

## 2026-04-03 (131)

### ドキュメント整備

- `apiFetch` / `apiFetchJson` (`src/lib/api-fetch.ts`) に JSDoc を追加（認証待機・401 リトライ動作を明記）
- `isPrivateHost` / `isValidUrl` / `isValidFeedUrl` / `normalizeUrlForCache` (`src/lib/url.ts`) に JSDoc を追加（SSRF 対策・トラッキングパラメータ除去を明記）
- `LruCache.get` / `LruCache.set` (`src/lib/lru-cache.ts`) に JSDoc を追加（LRU 更新・eviction・非同期フラッシュを明記）
- `ACTION_WEIGHTS` (`src/lib/engagement-score.ts`)、`OgpMeta` 各フィールド (`src/lib/ogp.ts`) に JSDoc を追加
- `useAuth` / `AuthState` (`src/hooks/useAuth.ts`) に JSDoc を追加（定期チェック・自動リフレッシュを明記）
- `useFeeds` / `FeedsState` (`src/hooks/useFeeds.ts`) に JSDoc を追加（ポーリング間隔・オンライン復帰同期を明記）
- `useArticleContent` / `ArticleContentState` (`src/hooks/useArticleContent.ts`) に JSDoc を追加（LRU キャッシュ・AbortController を明記）
- `useEngagement` / `BufferEntry` (`src/hooks/useEngagement.ts`) に JSDoc を追加（fire-and-forget・localStorage バッファを明記）
- `useMenuOpen` (`src/hooks/useMenuOpen.ts`) に JSDoc を追加（click-outside 処理・戻り値を明記）

## 2026-04-03 (130)

### リファクタリング

- `useArticleAi` (`src/hooks/useArticleAi.ts`) の重複ロジックをプライベートフック `useAiOperation` に共通化。`doRunAi` / `doTranslate` で完全に同一だった LRU キャッシュ確認・AbortController 管理・API フェッチ・エラーハンドリングを一元化し、155行 → 113行に削減

## 2026-04-03 (129)

### ドキュメント整備

- `matchesKeywordFilter` / `applyKeywordFilter` (`src/lib/keyword-filter.ts`) に JSDoc を追加（マッチ条件・正規化前提・引数を明記）
- `filterAndSortArticles` (`src/lib/article-filter.ts`) に JSDoc を追加（フィルター適用順・ソート仕様を明記）
- `fetchReadState` / `makeToggle` / `saveReadState` / `useReadState` (`src/hooks/useReadState.ts`) に JSDoc を追加（状態管理・サーバー同期・localStorage 戦略を明記）

## 2026-04-03 (128)

### リファクタリング

- `cachePutAsync()` ヘルパーを `src/lib/r2.ts` に追加し、`image-proxy` / `ogp` / `content` の3箇所で重複していた Cloudflare Cache API の fire-and-forget 書き込みパターンを一元化

## 2026-04-03 (127)

### 新機能

- **AI 翻訳機能** — 記事ヘッダーに「翻訳」ボタンを追加。Workers AI (Llama 3.1 8B) で記事本文を日本語に翻訳し、記事上部にパネル表示する。翻訳結果はクライアント LRU キャッシュ（30件）と R2 サーバーキャッシュ（`ai-cache/translation/`）に保存され、再翻訳のコストを抑える。キーボードショートカット `z` でもトグル操作可能。

## 2026-04-03 (126)

### 新機能

- **スヌーズ UI ボタン（期間選択付き）** — 記事ヘッダーのアクションボタン群にスヌーズボタンを追加。クリックすると 1時間後・3時間後・明日（1日後）・来週（1週間後）の4段階から選択できるドロップダウンが表示される。スヌーズ後は自動的に次の記事へ移動し、トースト通知で確認できる（キーボード `z` の1日固定スヌーズと併用可能）

## 2026-04-03 (125)

### バグ修正

- **モバイルレスポンシブ対応の包括的改善** — ドロップダウンメニューが `overflow-y:auto` でクリップされる問題を解消（portal + fixed 化）。記事ヘッダーのアクションボタン群がモバイル幅で画面外に溢れる問題を2行構成に変更して解消。タッチ操作でメニュー外タップによる閉じ処理が効かなかった問題を修正。カードレイアウトを小画面では1列表示に変更

## 2026-04-03 (124)

### リファクタリング

- **`image-proxy` ユーティリティを専用モジュールに分離** — マジックバイト検出ロジックを `src/lib/image-mime.ts`、エラープレースホルダー SVG 生成を `src/lib/image-error-placeholder.ts` に抽出。`route.ts` を 238 行から 95 行に縮小

## 2026-04-03 (123)

### リファクタリング

- **バリデーションユーティリティを `src/lib/validation.ts` に集約** — `MAX_ID_LENGTH = 128` 定数が3ファイルに重複していた問題を解消。`extractIds` / `parseSnoozedUntil` をルートファイルから共通ライブラリに移動

## 2026-04-03 (122)

### 新機能

- **記事スヌーズ機能** — 記事を1日間一時非表示にする機能を追加。キーボードショートカット `z` でスヌーズでき、次の記事へ自動移動する。スヌーズ状態は localStorage と R2 にクロスデバイス同期される

## 2026-04-03 (121)

### バグ修正

- **スター付きフィードのソート順修正** — スター（高優先度）を付けたフィードがサイドバーの未ピン留めセクション内で上位に表示されるよう修正。スター機能実装時にソート順への反映が漏れていた

## 2026-04-03 (120)

### リファクタリング

- **`replaceFeeds` を `appendFeeds` にリネーム** — OPML インポート後にフィードを追加する関数が「置き換え」を示唆する名前だったため、実装の意図をより正確に表す `appendFeeds` に統一

## 2026-04-03 (119)

### 新機能

- **フィード優先度（スター）機能** — フィードにスターを付けて高優先度としてマーク。フィードのコンテキストメニューから「スター付き / スター解除」を選択でき、スター付きフィードはタイトル横に琥珀色の★アイコンで表示される。設定はサーバーに同期されクロスデバイスで維持される

## 2026-04-03 (118)

### リファクタリング

- **`useGracePeriod` フックを抽出** — `useFilteredArticles` 内にインラインで記述されていた grace period ロジック（直前選択記事を 30 秒間フィルター対象外に保持する処理）を `src/hooks/useGracePeriod.ts` として独立したカスタムフックに分離。再利用性・可読性を向上

## 2026-04-03 (117)

### バグ修正

- **未読フィルター中の「過去記事を読み込み」で記事が表示されない問題を修正** — サーバーロード後に新しい記事が `filtered` の末尾（古い日付）に追加されると sentinel が下方に押し出され IntersectionObserver が発火せず visible に含まれないことがあった。`notifyArticlesAdded` を追加し、サーバーロード完了後に `page` を自動拡張して全 filtered 記事を即座に表示するよう修正

## 2026-04-03 (116)

### 新機能

- **readBeforeTimestamp — タイムスタンプ全既読** — 全フィードで「全既読」を押すと現在時刻を `readBeforeTimestamp` として保存。これ以降、その時刻以前に公開されたすべての記事（まだサーバーからロードしていない記事も含む）が既読扱いになる。セッションをまたいでも有効で、クロスデバイス同期も対応

## 2026-04-03 (115)

### バグ修正

- **「過去記事を読み込み」で読み込まれない問題を修正** — `fetchAndSetArticles` が記事を全件置き換えても `loadedFeedPages` をリセットしていなかったため、古いページ番号が残り次回ロード時にページが飛んで空データになっていた
- **「過去記事を読み込み」で重複が発生する問題を修正** — `loadMoreAllFeedsArticles` で各フィードの `finally` ブロックが `setLoadedFeedPages` より先にロックを解放していたため、同ページを二重フェッチする race condition があった

### 新機能

- **フィルター除外記事の自動既読** — グローバルキーワードフィルターに引っかかった記事（非表示）を自動的に既読扱いにする。未読カウントや未読フィルターへの混入を防止

## 2026-04-03 (114)

### バグ修正

- **既読にできない古い記事が未読フィルターに再出現する問題を修正** — `markAllRead` はメモリ上の記事しか既読化できないため、サーバー page 2 以降の未ロード記事が未読のまま残り、LoadMoreButton でロードすると未読フィルターに出現していた。`markAllRead` 実行時に `skipRemainingPages` で残りサーバーページをスキップし、LoadMoreButton を非表示にするよう修正

## 2026-04-03 (113)

### リファクタリング

- ローディングスピナーを `Spinner` コンポーネントに統合 — `ArticleView` のローカル `SpinIcon` と `ArticleList` のインライン SVG を共通コンポーネントに集約

## 2026-04-02 (112)

### リファクタリング

- `ChevronLeftSmall` / `ChevronRightSmall` を `ChevronSmall` に統合 — path データだけ異なる 2 コンポーネントを `direction` prop 付きの 1 コンポーネントにまとめ 7 行削減

## 2026-04-02 (111)

### リファクタリング

- `ArticleActions` にラッパー `div` を取り込み `stopPropagation` を一元化 — 4 コンポーネントで繰り返していたラッパーパターンを `className` prop に集約し 16 行削減

## 2026-04-02 (110)

### 新機能

- **Bluesky 共有** — 共有メニューに「Bluesky でシェア」ボタンを追加。`bsky.app/intent/compose` を利用してタイトルと URL を含む投稿ダイアログを開く

## 2026-04-02 (109)

### ドキュメント整備

- `design-system.md` の CSS ファイル参照を `src/index.css` → `app/globals.css` に修正（ファイルが存在しないパスを参照していた）
- `CLAUDE.md` / `architecture.md` に未記載のファイルを追記 — `ArticleItems.tsx`, `FeedDetailModal.tsx`, `Modal.tsx`, `useMobilePane.ts`, `useNSFWMode.ts`, `useSyncedRef.ts`, `useColumnResize.ts`, `article-filter.ts`, `ogp.ts`, `[id]/reinfer/route.ts`
- 存在しない `app/api/ai/translate/route.ts` の参照を削除

## 2026-04-02 (108)

### simplify

- `FeedSidebar` フッターのアイコンボタン群を `FooterIconButton` コンポーネントに統合 — インポート・リリースノート・エクスポート・インストール・テーマ切替・ログアウトの各ボタンが同一の `<button>/<svg>/<path>` 3層構造を繰り返していたため、`FooterIconButton` を抽出してボイラープレートを約120行削減

## 2026-04-02 (107)

### simplify

- `FeedSidebar` の `SpecialViewButton` 4連呼をデータ配列の `map` に統合 — HISTORY・BOOKMARKS・READING_LIST・LIKES の4つが同一パターンで繰り返されていたため、`[{ id, label, count }]` 配列と `.map()` に置き換えて28行を15行に削減

## 2026-04-02 (106)

### simplify

- `FeedSidebar` の `pinnedFeeds`/`unpinnedFeeds` レンダリングを `renderFeed` ヘルパーに統合 — `isPinned` と `animationIndex` のみ異なる同一の `FeedItem` プロップス群が2箇所に重複していたため、内部ヘルパー関数 `renderFeed(feed, isPinned, globalIdx)` に抽出し約25行を削減

## 2026-04-02 (105)

### simplify

- `FeedItem` の `retrying`/`reinfering` を `loadingAction` ユニオン型に統合 — retry と reinfer は同時に実行されないため、2 つの boolean ステートを `"retry" | "reinfer" | null` の単一ステートに集約。相互排他性を型で表現し、ステート変数・useCallback を各 1 つ削減

## 2026-04-02 (104)

### リファクタリング

- `useKeyboardNav` の `isSpecialFeed` チェックを簡潔化 — `as (typeof SPECIAL_FEED_IDS)[keyof typeof SPECIAL_FEED_IDS]` という難解な型アサーションを `Object.values<string>()` + `!== null` に変更し、3行を2行に整理

## 2026-04-02 (103)

### 新機能

- **キーワードフィルターに正規表現サポートを追加** — `/pattern/` 形式のキーワードを正規表現として評価するよう `matchesKeywordFilter` を拡張。`normalizeFilter` も正規表現キーワードは小文字化せずそのまま保持するよう変更。フィルター設定モーダルでは正規表現タグをモノスペースフォントで視覚的に区別し、使い方ヒントを追加。

## 2026-04-02 (102)

### simplify

- **`useFeeds` の `onErr` を `useCallback` から `useRef` に変換して deps から除外** — `onErr` は `onErrorRef`（ref）経由で最新コールバックを参照するため再生成不要なのに `useCallback(fn, [])` で定義されており、5つの依存配列に `onErr` が含まれていた。`useRef` に変更して `onErrRef.current(...)` パターンに統一することで、ref アクセスとして linter に認識され deps から完全に除外。

## 2026-04-02 (101)

### simplify

- **`useFeeds` ポーリング effect の `isOnline` deps 除外** — `setInterval` コールバック内で `isOnline` を直接参照していたため、オンライン/オフライン切り替えのたびにタイマーが再生成されていた。`useSyncedRef(isOnline)` で ref 化し、コールバック内では `isOnlineRef.current` を参照するよう変更。タイマーは `userId` 変化時のみ再生成されるようになり、不要な再セットアップを解消。

## 2026-04-02 (100)

### simplify

- **`useFeeds` の残る `onErr` 未使用箇所を統一** — `refreshFeeds`・`loadMoreFeedArticles`・`loadMoreAllFeedsArticles` の3関数が `console.error(…) + onErrorRef.current?.(…)` の2行パターンを直接記述していた。既存の `onErr(err, msg)` ヘルパーを使うよう統一し、各関数の依存配列にも `onErr` を追加。6行削減。

## 2026-04-02 (99)

### simplify

- **`useFeeds` の catch ブロックを `onErr` ヘルパーに統合** — `console.error(err)` + `onErrorRef.current?.(msg)` という同一の2行パターンが `useEffect` と `replaceFeeds` 内の計3箇所に重複していた。`onErr(err, msg)` ヘルパーを `useCallback` で定義して各 catch を1行に短縮し、6行削減。

## 2026-04-02 (98)

### リファクタリング

- **`ArticleList` のフィルターボタンを `FilterPillButton` に抽出** — 未読・ブックマーク・後で読む・日付の4つのフィルタートグルボタンが同一の className パターン（`text-[11px] tracking-[0.04em] px-2.5 py-0.5 rounded-full border ...`）を繰り返していた。`FilterPillButton` ヘルパーコンポーネントに統一し、`activeClass` prop でブックマーク固有の色変更にも対応。30行削減。

## 2026-04-02 (97)

### simplify

- **`buildExcludeOptions` を `useMemo` でメモ化** — `FilterMenu` / `GlobalFilterMenu` の両コンポーネントで `buildExcludeOptions(article)` を毎レンダー呼び出していた。`article` が変化しない限り結果は同一なので `useMemo` でキャッシュし、不要な配列生成を抑制。

## 2026-04-02 (96)

### simplify

- **`FeedFilterModal` の `handleSave`/`handleClear` を `doSave` に統合** — `setSaving(true/false)` + `onSave()` + `onClose()` という同一フローが `handleSave`・`handleClear` の2箇所に重複していた。共通の `doSave(filter)` ヘルパーに統合し、`hasFilter` の二重計算も解消。10行削減。

## 2026-04-02 (95)

### simplify

- **`FilterMenu` / `GlobalFilterMenu` の重複コードを共通化** — `XIcon` SVG と `excludeOptions` 生成ロジックが両コンポーネントで完全に重複していた。`XIcon` をモジュールレベル定数に、除外候補生成を `buildExcludeOptions(article)` 関数に抽出し、各コンポーネントから呼び出すよう変更。20行削減。

## 2026-04-02 (94)

### simplify

- **`globalFilter` の正規化を `useMemo` に移動** — `filterAndSortArticles` 内で記事・既読状態の変更のたびに `normalizeFilter(globalFilter)` が実行されていた問題を解消。`useFilteredArticles` の `useMemo([globalFilter])` で一度だけ正規化するよう変更し、`feedFilterMap` との設計を統一。

## 2026-04-02 (93)

### ドキュメント整備

- **`keyword-filter.ts` の JSDoc コメントを正しい位置に移動** — 前回の `parseKeywordFilter` 追加リファクタリングで `applyKeywordFilterMap` の JSDoc が関数から離れて孤立していた問題を修正。各関数の直上に対応する JSDoc を配置するよう整理。

## 2026-04-02 (92)

### simplify

- **`push/test` と `recommendations/refresh` ルートを簡潔化** — `push/test/route.ts` で `userPushKey(session.userId)` の二重呼び出しを `pushKey` 変数に集約。`recommendations/refresh/route.ts` でアーリーリターン分岐を廃止し、`if (cache)` ガードのみに統一してコードを削減。

## 2026-04-02 (91)

### リファクタリング

- **`parseKeywordFilter` を `keyword-filter.ts` に集約** — `app/api/read-state/route.ts` の `extractGlobalFilter` と `app/api/feeds/[id]/route.ts` のインラインフィルターパースをを共通関数 `parseKeywordFilter` に統一。重複していたパースロジックを1箇所に集約し、両ルートのコードを削減。

## 2026-04-01 (90)

### リファクタリング

- **`useFilteredArticles` の boolean フィルタートグルを `makeBoolFilterToggle` に集約** — `toggleUnreadOnly` / `toggleBookmarkOnly` / `toggleReadingListOnly` の3つの `useCallback` を `makeBoolFilterToggle` ヘルパー + 単一 `useMemo` に統一。`useReadState` の `makeToggle` パターンと一致させ、重複していた `setPage(1)` 呼び出しも `resetPage` に集約。

## 2026-04-01 (89)

### リファクタリング

- **`me/route.ts` のクッキー設定を `setTokenCookies` に集約** — トークンリフレッシュ後に独自実装していたクッキーセットロジックを削除し、`callback/route.ts` と同様に `setTokenCookies` を使用するよう統一。重複ロジック17行を2行に削減。

## 2026-04-01 (88)

### リファクタリング

- **`loadMoreAllFeedsArticles` の setState を一括更新に集約** — ループ内で複数回呼んでいた `setLoadedFeedPages` と `setArticles` を成功結果をまとめてから各1回の呼び出しに変更。型ガード `PromiseFulfilledResult<FeedPageResult>` で `succeeded` を絞り込み、`hasError` フラグの二重走査も解消。

## 2026-04-01 (87)

### リファクタリング

- **`useSyncedRef` フックを導入** — `useRef(x); ref.current = x;` のインラインパターンを `useSyncedRef(x)` に統一。stale closure 回避の意図を明示化し、`useFeeds` / `useNSFWMode` / `useReadState` / `useFilteredArticles` / `useOgpCache` の計8箇所に適用。

## 2026-04-01 (86)

### リファクタリング

- **`filterAndSortArticles` から `buildFilterMap` を分離** — `ArticleFilterOptions` の `feeds: Feed[]` を `feedFilterMap: Map<string, KeywordFilter>` に変更。`useFilteredArticles` で独立した `useMemo` として事前計算するようにし、未読切り替えやソート順変更などで `feeds` が変わらない場合のフィルターマップ再構築を削減。

## 2026-04-01 (85)

### バグ修正

- **`unescapeHtml` の数値エンティティ処理を修正** — `String.fromCharCode` が 0x10000 以上の値をビット切り捨てするため `&#65536;` が NUL 文字になり制御文字チェックをすり抜ける問題を修正。`String.fromCodePoint` に切り替えるとともに、サロゲートペア（0xD800–0xDFFF）と最大コードポイント超過（> 0x10FFFF）を明示的に除去するよう変更。

## 2026-04-01 (84)

### セキュリティ

- **Push 通知 unsubscribe エンドポイントの入力バリデーション強化** — `POST /api/push/unsubscribe` に `isValidHttpsUrl()` チェックを追加。subscribe エンドポイントと同様に不正な endpoint URL を 400 で拒否するよう統一。

## 2026-04-01 (83)

### リファクタリング

- **画像 URL フィルタロジックの重複を除去** — `article-utils.ts` の `collectImageUrlsFromHtml` と `collectImageUrls` で同じ 2 条件 `continue` が重複していた。共通ヘルパー `isCollectableUrl(src, seen)` に抽出し、各関数を 1 行に簡素化。
- **`loadMoreAllFeedsArticles` のミュータブル変数を宣言的パターンに変更** — `useFeeds.ts` で `let hasError = false` → `const hasError = results.some(...)` に変更し、ループ内の副作用代入を排除。

## 2026-04-01 (82)

### リファクタリング

- **`markRead` の不要な Set コピーを削減** — `useReadState.ts` で既読済み記事を再クリックした際、`new Set(prev)` による無駄なコピーが発生していた問題を修正。`prev.has(articleId)` で早期リターンし、DOM 再レンダーと localStorage 書き込みをスキップするよう改善。
- **`isValidCookieHeader` の冗長チェックを除去** — `app/api/feeds/route.ts` で `!/[\r\n]/.test(value)` を追加チェックしていたが、直前の `^[\x20-\x7E]*$` が制御文字（`\r\n` 含む）を既に除外するため冗長だった。コメントを追加してその意図を明確化。

## 2026-04-01 (81)

### リファクタリング

- **ギャラリー画像抽出を DOM 操作なし正規表現ベースに変更** — `ArticleView.tsx` の `useMemo` 内で `document.createElement` + `innerHTML` を使って画像 URL を抽出していた処理を、HTML 文字列から直接正規表現で抽出する `collectImageUrlsFromHtml` ヘルパー（`article-utils.ts`）に置き換えた。非 live DOM では `currentSrc` が常に空のため DOM 操作は不要だった。

## 2026-04-01 (80)

### バグ修正

- **自ドメインへのリンクにカードを表示しない** — `useContentLinkPreviews.ts` で `window.location.hostname` と `anchor.hostname` を比較し、自サイトへのリンクを OGP プレビューカードの対象外にした。

## 2026-04-01 (79)

### リファクタリング

- **`fetchOne` をモジュールレベルに移動** — `useImageDownload.ts` の `doDownload` コールバック内に埋め込まれていた `fetchOne` 関数をモジュールスコープに移動。クロージャ変数を参照していないためモジュール定義が適切であり、`doDownload` の可読性が向上した。

## 2026-04-01 (78)

### セキュリティ

- **XML パーサーの二重フォールバックを堅牢化** — `xml-parser.ts` の `parseFeed()` で寛容パース (`parserLenient`) も例外をスローした場合に `parsed` が未定義のまま後続処理に入りクラッシュする可能性を修正。両パース失敗時は明示的なエラーをスローするよう変更。

## 2026-04-01 (77)

### パフォーマンス改善

- **画像一括ダウンロードを並列フェッチに改善** — `useImageDownload.ts` の画像取得処理を逐次から `FETCH_BATCH_SIZE=4` 枚並列フェッチに変更。ダウンロードトリガーは引き続き逐次実行（ブラウザブロック防止）しつつ、遅延を 400ms → 300ms に短縮。20枚の場合で最大 ~6秒の短縮が見込まれる。

## 2026-04-01 (76)

### セキュリティ

- **プッシュ通知クリック時のオープンリダイレクト防止** — `sw.js` の `notificationclick` ハンドラで `self.clients.openWindow(url)` に渡す URL を同一オリジン検証するよう修正。VAPID 鍵漏洩時に悪意あるプッシュ通知で外部 URL へ誘導される攻撃を防止した。

## 2026-04-01 (75)

### リファクタリング

- Cookie 設定コードを `setTokenCookies` ヘルパーに集約 — `callback/route.ts` と `server-auth.ts` で重複していたトークン Cookie 設定ロジック（`access_token` / `refresh_token` / `token_exp`）を `setTokenCookies` としてエクスポートし、`callback/route.ts` から再利用するよう変更。

## 2026-04-01 (74)

### バグ修正

- **「もっと読む」ボタンが消えない問題を修正** — `loadMoreFeedArticles` / `loadMoreAllFeedsArticles` で空ページが返ったとき `loadedFeedPages` を更新せずに早期リターンしていたため、`feedHasMorePages` が `true` のまま残りボタンが消えなくなっていた。空ページでもページ番号を更新するよう修正し、繰り返しリクエストも防止した (`src/hooks/useFeeds.ts`)。

## 2026-04-01 (73)

### リファクタリング

- カラムリサイズロジックを `useColumnResize` フックに抽出 — `App.tsx` の `sidebarWidth` / `listWidth` 状態管理・ドラッグ処理・ストレージ保存を専用フックに分離。`COLUMN_CONFIGS` で設定を集約し、`resetWidth()` でダブルクリックリセットを一本化した。

## 2026-04-01 (72)

### リファクタリング

- `App.tsx` の `articleMap` 中間変数を削除 — `handleToggle*` 内でのみ使用されていた `Map` を `articles.find()` に置き換えた。

## 2026-04-01 (71)

### リファクタリング

- `App.tsx` のエンゲージメントトグルハンドラー3関数を `useMemo` + `makeHandler` ファクトリーに統合 — `handleToggleBookmark` / `handleToggleReadingList` / `handleToggleLike` が同一の「トグル → エンゲージメント記録」パターンを繰り返していた。

## 2026-04-01 (70)

### リファクタリング

- `App.tsx` の `historyIdsForReadState` 中間エイリアスを削除 — `useReadingHistory()` が返す `historyIds` を直接使えるため不要なリネームと再エイリアスだった。

## 2026-04-01 (69)

### リファクタリング

- `useKeyboardNav` の未使用オプション `dateRange` を削除 — `cycleDateRange()` が次の値を直接返すため不要なプロパティだった。

## 2026-04-01 (68)

### バグ修正

- **過去記事ページ読み込みの二重フェッチを防止** — `loadMoreFeedArticles` / `loadMoreAllFeedsArticles` で同一フィードに対して連続呼び出しが発生した場合、フェッチ中フラグ（`loadingFeedIdsRef`）で二重リクエストを防ぐよう修正した。

## 2026-03-31 (67)

### 新機能

- **テキスト選択で「除外する」ポップアップ** — 記事本文のテキストを選択すると「〇〇を除外」ボタンが選択範囲の上部にフローティング表示される。クリック/タップするとグローバルフィルターの除外キーワードに即時登録される。

## 2026-03-31 (66)

### 新機能

- **グローバルフィルターをデバイス間同期** — グローバルフィルターを `localStorage` だけでなく R2 にも保存するよう変更。ログイン時にサーバー値をロードするため、スマホ・PC など複数デバイスで同じフィルター設定を共有できる。変更後 2 秒でサーバーへ自動同期（`/api/read-state` に `globalFilter` フィールドを追加）。

## 2026-03-31 (65)

### UI改善

- **スマホ時アクションアイコンを拡大** — 記事詳細ツールバーのアイコン（後で読む・ブックマーク・いいね・共有・フィルター・グローバルフィルター・ダウンロード）をモバイルで 14px → 18px に拡大。タップ領域も `p-2 -m-2` で拡大し操作性を向上。ボタン間隔もモバイルで広げた（デスクトップは変更なし）。

## 2026-03-31 (64)

### 新機能

- **記事詳細からグローバルフィルターを操作** — 記事詳細のツールバーにグローバルフィルターメニューを追加。タイトル・著者・カテゴリ・メタデータをワンクリックで全フィード除外キーワードに登録できる。フィルター設定モーダルもここから開ける。
- **グローバルフィルターボタンを見つけやすく** — 記事一覧ツールバーのグローバルフィルターボタンに「グローバル」ラベルを追加し、視認性を向上。

## 2026-03-30 (63)

### バグ修正

- **`path-to-regexp` override を `^6.3.0` に修正して本番 500 エラーを解消** — `pnpm.overrides` で `path-to-regexp: ">=8.4.0"` を強制していたため、Next.js 16 が使う `/:path*` パターンが v8 の非互換変更（Named parameter required）でエラーになっていた問題を修正。`path-to-regexp@6.3.0` は ReDoS (CVE-2024-45296) がパッチ済みのため v8 への強制は不要 (`package.json`, `pnpm-lock.yaml`)

## 2026-03-30 (62)

### リファクタリング

- **`FETCH_OPTS` を `ARTICLE_FETCH_OPTS` としてエクスポートし重複を除去** — `fetch-article-content.ts` のプライベート定数 `FETCH_OPTS` を `ARTICLE_FETCH_OPTS` に改名してエクスポート。`content/route.ts` でインラインに定義していた同一ヘッダーオブジェクト（User-Agent・Accept）を削除し、エクスポートされた定数を使用するよう変更 (`src/lib/fetch-article-content.ts`, `app/api/content/route.ts`)

## 2026-03-30 (61)

### リファクタリング

- **`AiMode` 型を削除し `ai-cache` の `mode` パラメータを廃止** — `AiMode = "summary"` は単一メンバーのユニオン型で `mode` パラメータを渡す意味がなかったため、`types.ts` から型を削除。`ai-cache.ts` の `getAiCacheById`/`setAiCacheById` から `mode` パラメータを除去しキーを `ai-cache/summary/id-{articleId}` に直接ハードコード。`ai-route-helper.ts` の `runAiJob` から `cacheType: AiMode` パラメータを削除 (`src/types.ts`, `src/lib/ai-cache.ts`, `src/lib/ai-route-helper.ts`, `app/api/ai/summarize/route.ts`)

## 2026-03-30 (60)

### リファクタリング

- **`ReadState` 型を `types.ts` に統一** — `app/api/read-state/route.ts` のローカル `interface ReadState` と `src/hooks/useReadState.ts` の `type RemoteReadState` が同一の4フィールド型を二重定義していたため、`types.ts` に `export interface ReadState` として統合。両ファイルはインポートするだけに変更 (`src/types.ts`, `app/api/read-state/route.ts`, `src/hooks/useReadState.ts`)

## 2026-03-30 (59)

### リファクタリング

- **`SortOrder` を `types.ts` に移動し `SORT_ORDER_CYCLE`/`SORT_ORDER_LABELS` を追加** — `SortOrder` 型が `useFilteredArticles.ts` のみに定義されており `Layout`/`FontSize`/`DateRange` と不統一だったため `types.ts` に移動。`article-utils.ts` に `SORT_ORDER_CYCLE` と `SORT_ORDER_LABELS` を追加して他の列挙型と同じパターンに統一。`toggleSortOrder` 内の明示的三項演算子を `cycleValue` に、`useKeyboardNav` のインライン文字列を `SORT_ORDER_LABELS` に置き換え (`src/types.ts`, `src/lib/article-utils.ts`, `src/hooks/useFilteredArticles.ts`, `src/hooks/useKeyboardNav.ts`, `src/components/ArticleList.tsx`)

## 2026-03-30 (58)

### リファクタリング

- **`useFeeds` の `filterNewArticles` を `mergeUniqueArticles` に統合** — フィルターのみを担う `filterNewArticles` と呼び出し側の重複ソートロジックを、フィルター＋ソートを一括処理する `mergeUniqueArticles` に統合。`mergeArticles` と `loadMoreFeedArticles` の重複コードを各 1 行に削減。不要な `fetchFeedsData` ラッパーも除去 (`src/hooks/useFeeds.ts`)

## 2026-03-30 (57)

### リファクタリング

- **`recommendation.ts` の `discoverFeedUrl` + ID生成重複を共通ヘルパーに抽出** — `generateWebSearchFeeds` と `generateLinkDiscoveryFeeds` で同一の `discoverFeedUrl → sha256Hex → RecommendedFeed` パターンが重複していたため、`makeRecommendationId` と `discoverAndBuildFeed` の2ヘルパーに統合 (`src/lib/recommendation.ts`)

## 2026-03-30 (56)

### リファクタリング

- **`useReadState` の `RemoteReadState` 型エイリアス抽出** — `fetchReadState` の戻り値型と `res.json()` キャストで同一の4フィールド型が2回宣言されていたため、`RemoteReadState` 型エイリアスに抽出して重複を解消。型による保証から冗長な `?? []` フォールバックも削除 (`src/hooks/useReadState.ts`)

## 2026-03-30 (55)

### リファクタリング

- **`recommendation.ts` の engagement キーを `engagementKey()` ヘルパーに統一** — `generateRecommendations` 内でハードコードされていた `users/${userId}/engagement.json` を `r2.ts` の `engagementKey()` ヘルパーで置き換え、キー文字列の重複を排除 (`src/lib/recommendation.ts`)

## 2026-03-30 (54)

### リファクタリング

- **OGP キャッシュ読み込みの不要な中間変数を削除** — `isValidPublicUrl()` が内部でプロトコルチェックを行うため、`raw` 変数による `data.image` へのフォールバックロジックが不要だった。HTML エンティティのデコードはプロトコルプレフィックスを変えないため、`unescapeHtml()` でデコード済みの URL を `isValidPublicUrl` に直接渡すよう簡略化 (`app/api/ogp/route.ts`)

## 2026-03-30 (53)

### バグ修正

- **ページネーション記事のキャッシュ競合を修正** — `extractContent`（旧 `extractAndCacheContent`）と `appendPaginatedPages` がそれぞれ `ctx.waitUntil` で同一キャッシュキーへ書き込む競合状態が存在した。ページ1のキャッシュ書き込みが後から完了した場合、ページネーションで結合した全ページコンテンツが上書きされ、以降のキャッシュヒット時にページ1のみが返り続ける問題があった。キャッシュ保存ロジックを両関数から分離し、最終コンテンツ確定後に呼び出し元で1回だけ保存するよう修正 (`src/lib/fetch-article-content.ts`, `app/api/content/route.ts`)

## 2026-03-30 (52)

### リファクタリング

- **`resolveRelativeUrl` ヘルパーを抽出** — `fixImageDimensions` 内で `src` 属性と `srcset` 属性の相対 URL 解決ロジックが重複していたため、共通ヘルパー関数 `resolveRelativeUrl(url, base)` に切り出した。動作は変わらず、コードの重複を解消 (`src/lib/content.ts`)

## 2026-03-30 (51)

### 新機能

- **`normalizeUrlForCache` のトラッキングパラメータを拡充** — Yahoo! Japan Ads (`yclid`)、Twitter/X Ads (`twclid`)、Pinterest (`epik`)、LinkedIn (`li_fat_id`)、TikTok Ads (`ttclid`)、Drip (`__s`)、ConvertKit (`ck_subscriber_id`)、Klaviyo (`_kx`) を追加。これらのパラメータが URL に含まれていても同一コンテンツとして正しくキャッシュヒットするようになった (`src/lib/url.ts`)

## 2026-03-30 (50)

### バグ修正

- **画像フォールバック判定の `rcImgCount === 0` エッジケースを修正** — `extractMainContent` で Readability が画像を全削除した場合（`rcImgCount = 0`）、`regexImgCount >= rcImgCount * 2` が `0 >= 0` で常に true となり、regex 結果にも画像がなくても誤って regex フォールバックを採用していた。`Math.max(1, rcImgCount * 2)` に変更し、regex 側に最低 1 枚以上の画像があることを条件にした (`src/lib/content.ts`)

## 2026-03-30 (49)

### セキュリティ

- **`sanitizeHtml` に不可視 Unicode 文字の除去を追加** — U+200B (ZERO WIDTH SPACE) などの不可視 Unicode 文字が HTML 属性名に挿入された場合（例: `on​error=`）、イベントハンドラ除去の正規表現をバイパスできる可能性があった。サニタイズ処理の先頭でこれらを除去することで後続のすべてのパターンを保護 (`src/lib/html.ts`)

## 2026-03-30 (48)

### セキュリティ

- **リダイレクトループ検出を追加** — `fetchFollowSafeRedirects` で訪問済み URL を `Set` で追跡し、A→B→A のような循環リダイレクトを検出して即座にエラーをスローするよう修正。従来は最大リダイレクト数（5 回）に達するまでループが継続していた (`src/lib/fetch.ts`)

## 2026-03-30 (47)

### リファクタリング

- **`markAllRead` のフィード種別分岐をルックアップテーブルに統合** — BOOKMARKS / READING_LIST / LIKES / HISTORY の 4 分岐が同じフィルターパターンを繰り返していたため、`specialSets` オブジェクトにまとめて 3 方向の条件式に簡略化 (`src/hooks/useReadState.ts`)

## 2026-03-29 (46)

### リファクタリング

- **ソート・逆順操作の不要なスプレッドを削除** — `filterAndSortArticles` の履歴ソートと oldest 逆順で `[...list]` スプレッドを削除。`filter()` の戻り値は既に新しい配列のため、インプレース操作で十分 (`src/lib/article-filter.ts`)
- **`getUserLatestArticles` の中間変数を削減** — `all` / `sorted` の 2 変数を `sortByDate(pages.flat()).slice(0, 2000)` の 1 式に統合 (`src/lib/shared-feed.ts`)
- **`parseJsonBody` の型アノテーションに `nsfw` を追加** — PATCH ハンドラーで処理している `nsfw` フィールドが型パラメータから欠落していたため補完 (`app/api/feeds/[id]/route.ts`)

## 2026-03-29 (45)

### セキュリティ

- **`extractOgMeta` の正規表現インジェクション対策** — `property` パラメータを `new RegExp()` に渡す前に正規表現メタ文字をエスケープするよう修正。現在の呼び出し元はリテラル文字列のみだが、将来的に動的な値が渡された場合の ReDoS / インジェクションを防ぐ (`src/lib/html.ts`)

## 2026-03-29 (44)

### リファクタリング

- **`fixImageDimensions` の style 属性除去をクォート統合** — ダブル/シングルクォートで重複していた同一コールバックを交替パターン `(?:"([^"]*)"|'([^']*)')` に統合し 4 行削減 (`src/lib/content.ts`)

## 2026-03-29 (43)

### リファクタリング

- **`sanitizeHtml` の危険スキーム除去を4行→2行に統合** — `href/src/action/formaction` に対する `javascript:/vbscript:` パターンと `data:` パターンが同一構造だったため、スキーム部を `(?:javascript|vbscript|data)` に統合して重複を解消 (`src/lib/html.ts`)

## 2026-03-29 (42)

### バグ修正

- **画像一覧・ダウンロードが `srcset` 画像を見逃す問題を修正** — `src` が空・`data:` プレースホルダーで `srcset` に本物の URL がある画像が末尾ギャラリーとダウンロード対象から漏れていた。`bestSrcFromSrcset()`（srcset の最後のエントリ = 最高解像度）を追加し、ダウンロード時は `img.currentSrc` を優先するよう変更 (`src/components/ArticleView.tsx`, `src/hooks/useImageDownload.ts`)

## 2026-03-29 (41)

### リファクタリング

- **`sanitizeHtml` の iframe/use コールバックをヘルパー関数に集約** — `<iframe>`（3 箇所）と `<use>`（2 箇所）で重複していたインラインコールバックを `sanitizeIframe` / `sanitizeUse` ヘルパーに抽出。ロジックに変更なし (`src/lib/html.ts`)

## 2026-03-29 (40)

### リファクタリング

- **`fixExternalLinks` の `rel` 属性処理を1分岐に統合** — quoted (`rel="nofollow"`) と unquoted (`rel=nofollow`) で別々だった2分岐を、`(?:(["'])([^"']*)\1|([^\s"'>]+))` の1正規表現で統一。変数1つ・`if-else if`ブロック1つを削除し5行削減 (`src/lib/content.ts`)

## 2026-03-29 (39)

### リファクタリング

- **`urlBase64ToUint8Array` を `base64urlToBytes` に統合** — `usePushNotifications.ts` にあった重複実装を削除し、`auth.ts` の `base64urlToBytes` を import して再利用するよう変更

## 2026-03-29 (38)

### セキュリティ

- **画像プロキシの Content-Type 大文字小文字正規化** — `Content-Type` ヘッダーを `.toLowerCase()` で正規化してから許可リストと照合するよう修正。`Image/JPEG` 等のケース違いがある場合に誤拒否していた問題を解消 (`app/api/image-proxy/route.ts`)

## 2026-03-29 (37)

### リファクタリング

- **`isFeedContentType` の精度向上** — `ct.includes("xml")` が `image/svg+xml` 等の非フィード XML を誤検知していた問題を修正。`text/xml` / `application/xml` を明示的に列挙する形に変更 (`src/lib/feed-discovery.ts`)
- **`stripPageChrome` のループ化** — 6 つの `.replace()` チェーンを `for...of` ループに整理し、タグ名配列で管理する形に変更 (`src/lib/content.ts`)

## 2026-03-29 (36)

### リファクタリング

- **`generateLinkDiscoveryFeeds` の `exec()` ループを `matchAll()` に変更** — `let m; while ((m = hrefRe.exec(html)) !== null)` パターンを `for (const m of html.matchAll(...))` に置き換え。`hrefRe` 変数宣言と `let m` 宣言が不要になり、コードが簡潔になった (`src/lib/recommendation.ts`)

## 2026-03-29 (35)

### リファクタリング

- **`stripHtml` を `html.ts` に集約** — `article-utils.ts` と `xml-parser.ts` にそれぞれ private 実装として重複していた `stripHtml` ヘルパーを `src/lib/html.ts` のエクスポート関数として一本化し、両ファイルから import するよう変更。正規表現も `/<[^>]*>/g` に統一

## 2026-03-29 (34)

### 改善

- **画像プロキシのエラー表示をエラー原因別に出し分け** — 取得失敗の理由に応じて異なる SVG プレースホルダーを返すよう変更。404 → "Not Found"（壊れた画像アイコン）、タイムアウト・接続失敗 → "Network Error"（Wifi 斜め線アイコン）、10MB 超 → "Too Large"（↕ 矢印アイコン）、その他 → "Unavailable"（警告トライアングル）(`app/api/image-proxy/route.ts`)

## 2026-03-29 (33)

### 改善

- **画像プロキシのフォールバックを SVG プレースホルダーに変更** — 取得できなかった画像が透明 GIF（空白）ではなく、壊れた画像アイコンと "Image unavailable" テキストを含む SVG を返すよう変更。視覚的に 404 であることが判別できるようになった (`app/api/image-proxy/route.ts`)

## 2026-03-29 (32)

### 新機能

- **`timeAgo` に異年表示を追加** — 7日以上前で現在と異なる年の記事タイムスタンプを「M月D日」ではなく「YYYY年M月D日」形式で表示するよう改善。昨年以前の記事が「3月29日」と表示されて曖昧だった問題を解消 (`src/lib/article-utils.ts`)

### バグ修正

- **`readingTime` テストの誤った計算式を修正** — `e2e/article-utils.spec.ts` で漢字の読了時間テストが `Math.ceil(402/400)` (400字/分) を仮定していたが、実装は `cjkChars/500` (500字/分) を使っており常に失敗していた。正しい計算式 `Math.ceil(402/500)` に修正

## 2026-03-29 (31)

### バグ修正

- **クライアント側 401 リトライの重複リフレッシュを修正** — 複数のAPIリクエストが同時に 401 を受け取った場合、それぞれが個別に `/api/auth/me` を呼び出していた。`inflightAuthRecovery` Promise で in-flight 中の回復リクエストを集約し、1回の呼び出しにまとめるよう修正 (`src/lib/api-fetch.ts`)

## 2026-03-29 (30)

### バグ修正

- **`deduplicatedRefresh` のレースコンディションを修正** — `finally` ブロックで `inflightRefresh` Map のエントリを削除する際、自分の Promise かどうかを確認しない問題があった。完了後に別の Promise が登録された場合、その新しい Promise まで削除してしまい重複リフレッシュが発生する可能性があったため、`inflightRefresh.get(refreshToken) === p` のガード条件を追加

## 2026-03-29 (29)

### リファクタリング

- **OPMLインポート後の二重フェッチを解消** — `POST /api/feeds/import` のレスポンスに追加された `feeds` フィールドを含めることで、インポート完了後に `GET /api/feeds` を再度呼ぶ必要をなくした。クライアント側 `useFeedOperations` / `useFeeds` を合わせて修正

## 2026-03-29 (28)

### リファクタリング

- **`sanitizeKeywords` 関数を `keyword-filter.ts` に移動** — `feeds/[id]/route.ts` にインラインで定義されていたキーワードサニタイズ処理（文字列フィルタ・トリム・重複除去・件数上限）を `sanitizeKeywords` としてエクスポートし、定数 `MAX_KEYWORD_LENGTH` / `MAX_KEYWORDS_PER_ARRAY` も同ファイルに集約。ルートハンドラはその関数を呼び出すだけに簡素化

## 2026-03-29 (27)

### ドキュメント整備

- **`detectNextPageUrl` の単体テストを追加** — ページネーション URL 検出ロジック（`<link rel="next">` / `<a rel="next">`）が未テストだったため、`e2e/content-extraction.spec.ts` に 11 ケースを追加。属性順序逆転・相対 URL 解決・別オリジン/`javascript:`/フラグメント拒否・優先順位を網羅

## 2026-03-29 (26)

### バグ修正

- **`extractOgMeta` でシングルクォートを含む OGP 値が切り捨てられる問題を修正** — `content=["']([^"']+)["']` パターンはクォート種別を揃えないため、`content="It's great"` のようにダブルクォート属性内にシングルクォートがあると `It` だけがマッチしていた。`content=(["'])([^<>]*?)\1` バックリファレンスパターンに変更してクォート種別を一致させるよう修正

## 2026-03-29 (25)

### リファクタリング

- **`fetch-article-content.ts` の HTML フェッチ検証ロジックを `fetchHtmlBytes` に集約** — `fetchArticleContent` と `appendPaginatedPages` で重複していた「フェッチ→ok/body 確認→Content-Type チェック→バイト読み込み」の 6〜7 行を `fetchHtmlBytes` ヘルパーに抽出。また `fetchArticleContent` 内のハードコードされたヘッダーオブジェクトを既存の `FETCH_OPTS` 定数に統一

## 2026-03-29 (24)

### バグ修正

- **`readBodyBytesPartial` が `maxBytes` を超えたバイトを返す問題を修正** — ストリームの最後のチャンクが `maxBytes` を超過していた場合、超過分をスライスせずに全チャンクを push していたため、戻り値が `maxBytes` より大きくなる場合があった。チャンクを `maxBytes` 境界でスライスして正確なサイズを返すよう修正

## 2026-03-29 (23)

### バグ修正

- **OPML インポートで一部フィードの meta 作成失敗時に全件失敗する問題を修正** — `Promise.all` を `Promise.allSettled` に変更し、R2 書き込みエラーが発生したフィードがあっても残りのフィードを正常にインポートできるようにした

## 2026-03-29 (22)

### セキュリティ

- **OGP 取得後の image URL に SSRF バリデーションを追加** — `fetchPageOgpMeta` が返す外部サイト由来の image URL を `isValidPublicUrl` で検証するよう修正。悪意あるサイトが内部ネットワーク URL を og:image に設定することでブラウザ経由のアクセスを誘導できる問題を解消。キャッシュヒット時も同様に検証済み値のみ返す。

## 2026-03-29 (21)

### バグ修正

- **Qiita 等の長い OGP 画像 URL が表示されない問題を修正** — `isValidFeedUrl` の 2048 文字制限が imgix のコンポジット URL（mark64/blend64/txt64 パラメータ付き）を誤って弾いていた。`isValidPublicUrl`（SSRF チェックのみ、長さ制限なし）を追加し、`ogp.ts` と `image-proxy` で使用するよう変更

## 2026-03-29 (20)

### リファクタリング

- **`extractAndCacheContent` の `html` を戻り値に追加** — `fetchArticleContent` と `/api/content` の両方で `detectCharset` / `decodeBytesToString` を二重に呼び出していた冗長処理を排除。`content/route.ts` の不要なインポートも削除

## 2026-03-29 (19)

### リファクタリング

- **OPML インポートの R2 呼び出しを並列化** — フィードごとに逐次実行していた `getOrCreateFeedMeta` を `Promise.all` で並列実行に変更。大量フィードのインポート時に O(N) 逐次 RTT が ~2 RTT に短縮される

## 2026-03-29 (18)

### リファクタリング

- **`getOrCreateFeedMeta` ヘルパーを追加** — フィード追加・OPML インポートで重複していた「meta を読んで無ければ作成する」パターンを `shared-feed.ts` の共通関数に統合

## 2026-03-29 (17)

### リファクタリング

- **`useRecommendations` のローディング状態の重複を修正** — `refresh()` が内部で `fetchRecommendations()` を呼ぶことで `loading` と `refreshing` が同時に `true` になる問題を解消。フェッチロジックを `loadRecommendations()` ヘルパーに切り出し、各呼び出し元が自身のローディング状態のみを管理するよう整理

## 2026-03-29 (16)

### 新機能

- **キーボードショートカット `a` で AI 要約トグル** — 記事表示中に `a` を押すと AI 要約を実行、再度押すと非表示。ショートカットヘルプモーダルにも追記

## 2026-03-29 (15)

### 新機能

- **キーボードショートカット `g` / `G` を追加** — `g` で記事リスト先頭、`G` で末尾へジャンプ。ショートカットヘルプモーダルにも追記

## 2026-03-29 (14)

### リファクタリング

- **ArticleView ドロップダウン項目スタイルを定数に統合** — `ShareMenu` と `FilterMenu` で重複定義されていたドロップダウン項目スタイル文字列を `MENU_ITEM_CLS` モジュール定数に統合

## 2026-03-29 (13)

### ドキュメント整備

- **グローバルフィルターのテストを追加** — `filterAndSortArticles` の `globalFilter` オプションに対するテストケースが欠けていたため追加。exclude/include の基本動作・大文字小文字非依存・複数フィード横断適用・activeIds によるスキップ・フィード別フィルターとの AND 組み合わせをカバー（計 7 テスト追加）

## 2026-03-29 (12)

### リファクタリング

- **グローバルフィルターの品質改善** — `FeedFilterModal` の「クリア」ボタン表示を初期値ではなく現在の編集状態に基づくよう修正。グローバルフィルターのキーワードを `normalizeFilter` で小文字化（大文字混在のキーワードが正しくフィルタリングされない問題を修正）。`ArticleFilterOptions.globalFilter` を必須フィールドに変更して渡し忘れをコンパイル時に検出可能に

## 2026-03-29 (11)

### バグ修正

- **画像ライトボックス内スワイプの誤動作を修正** — 画像一覧のポップアップ内でスワイプすると次の記事に遷移してしまう問題を修正。ライトボックス内のスワイプは画像ナビゲーション（前/次の画像）に使用するよう変更

## 2026-03-29 (10)

### 新機能

- **グローバルキーワードフィルター** — すべてのフィードに横断適用するキーワードフィルターを追加。記事一覧ヘッダーのフィルターアイコン（≡）から設定可能。設定は localStorage に永続化

### UI 改善

- **モーダルのモバイルスクロール対応** — フィルターモーダル等のポップアップに `max-h-[90dvh]` + スクロールを追加し、スマホで要素が多くても全体を操作可能に
- **フィード一覧のアニメーション削除** — フィードアイテムの `animate-fade-up` を削除して即時表示に変更（大量フィード時の表示遅延を解消）

## 2026-03-29 (9)

### バグ修正

- **即時既読に戻し grace period を30秒に延長** — 60秒遅延タイマーを廃止し、記事クリック時に即座に既読マークする元の挙動に戻した。未読フィルター中の猶予期間（既読後もリストに残る時間）を 5秒 → 30秒に延長

## 2026-03-29 (8)

### 新機能

- **記事全文のページネーション自動追跡** — 全文取得時に `<link rel="next">` / `<a rel="next">` を検出し、最大 10 ページまで自動フェッチして 1 つの記事として連結表示

### バグ修正

- **60 秒既読タイマーが機能しない問題を修正** — `markRead` を `useEffect` の依存配列から外し ref 経由で呼び出すことで、再レンダーのたびにタイマーがリセットされていたバグを修正
- **画像一覧の重複表示を修正** — EC サイト等のスライダー (`rss-image-slider`) 内の画像が末尾ギャラリーにも重複表示されていた問題を修正。DOM パースでスライダー内画像を除外するよう変更

### 新機能

- **画像再ダウンロード確認ダイアログ** — 一度ダウンロード済みの記事の画像を再ダウンロードしようとした際に確認モーダルを表示。保存済み情報は localStorage でのみ管理

## 2026-03-29 (5)

### バグ修正

- **画像一覧をライトボックス表示に変更** — サムネイルクリックで新しいタブを開く実装だったため、ブラウザの戻るボタンを押すとサイトが閉じる問題があった。モーダル（ライトボックス）で拡大表示する方式に変更し、Esc・背景クリックで閉じる・←/→ キーで画像切り替え・番号カウンター表示に対応

## 2026-03-29 (4)

### バグ修正

- **OGP リンクカードが消えるバグを修正** — 記事を切り替えた直後、前の記事の `fetchedContent` が次の記事の最初のレンダーに漏れ込み `processedContent` が変化することで `useContentLinkPreviews` が再実行され OGP カードが消えていた問題を修正。`fetchedState` を `{ id, content }` でタグ付けし、`articleId` と一致しない場合は `null` 扱いにすることでリークを防止

### 新機能

- **既読を60秒後に遅延マーク** — 記事をクリックして即座に既読になっていた動作を変更し、60秒間表示し続けた後に既読マークするよう改善。記事を誤クリックしたり短時間ざっと見ただけの場合に未読を保持できる
- **全フィード対応の記事末尾画像一覧** — 2枚以上の画像を含む記事の末尾に「画像一覧」セクションを表示。横スクロールのサムネイル行で記事の全画像を一覧できるよう改善。特定フィード固有の処理ではなく全フィードで機能する

## 2026-03-29 (3)

### リファクタリング

- `useNSFWMode`: `activateNSFW` の `useCallback` 依存配列から `nsfwMode` を除去 — `nsfwModeRef` で最新値を参照することで、`nsfwMode` 変更時のコールバック再生成を防止
- `useReadingHistory`: `historyOrder` の導出を簡略化 — `history.map()` から直接配列を生成し `Set` を構築することで中間 Set の展開を省略

## 2026-03-29 (2)

### アクセシビリティ

- **アイコンのみのボタンに `aria-label` を追加** — `FeedSidebar` の検索・追加・更新・インポート・エクスポート・インストール・プッシュ通知・テーマ切替・ログアウトボタンにスクリーンリーダー向け `aria-label` を付与。`title` 属性のみでは一部のスクリーンリーダーで読まれないため、`aria-label` で確実にアクセス名を提供するよう改善
- **ナビゲーション項目に `aria-current="page"` を追加** — `FeedSidebar` の「全件」「ブックマーク」「後で読む」「いいね」ボタンで選択中の項目に `aria-current="page"` を付与。スクリーンリーダーが現在位置を正しく伝達できるよう改善
- **トグルボタンに `aria-pressed` を追加** — プッシュ通知ボタンと `ArticleList` のレイアウト切替ボタンに `aria-pressed` でオン/オフ状態を明示。`LAYOUT_LABELS` 定数を導入してレイアウト名の日本語化（コンパクト・リスト・カード・マガジン）を一元管理

## 2026-03-29

### バグ修正

- **未読フィルター中の grace period が早期キャンセルされる問題を修正** — `useFilteredArticles` で `selectedArticleId` が変わるたびに `useEffect` のクリーンアップが grace period タイマーをキャンセルしていた。A→B→C と記事を切り替えると A の猶予期間が C の選択時に失われる挙動を、アンマウント専用クリーンアップ `useEffect` を分離することで解消
- **`useFeedOperations` の import メッセージタイマーがアンマウント時にリークする問題を修正** — OPML インポート後の3秒タイマーがコンポーネントのアンマウント時にクリアされていなかった。専用の `useEffect` クリーンアップを追加
- **`useEngagement` の flush タイマーがアンマウント時にリークする問題を修正** — `sendBeacon` 失敗時の2秒フラッシュタイマーがアンマウント時にクリアされていなかった。専用の `useEffect` クリーンアップを追加

### リファクタリング

- **OGP メタデータ取得ロジックを `src/lib/ogp.ts` に共通化** — `app/api/ogp/route.ts` と `app/api/articles/save/route.ts` が個別に実装していた HTML フェッチ・部分読み取り・OGP 抽出処理を `fetchPageOgpMeta()` として一箇所に集約。あわせて `save/route.ts` が `new TextDecoder()` で UTF-8 固定デコードしていたバグを、`detectCharset()` を用いた正しい charset 検出に修正

### セキュリティ

- **CSP `frame-src` と `sanitizeHtml` の信頼済み iframe ドメインを同期** — `TRUSTED_IFRAME_RULES` では `youtube.com` / `youtube-nocookie.com`（www なし）を許可していたが、CSP の `frame-src` には `www.` 付きしか含まれていなかった。www なし URL のまま iframe が挿入されると sanitizer を通過しつつ CSP でブロックされる不整合を解消するため、`youtube.com` / `youtube-nocookie.com` を `frame-src` に追加
- **`fixExternalLinks` でクォートなし `rel` 属性を正しく処理** — `rel=nofollow`（クォートなし）が含まれるリンクで `rel` 属性が2つ生成されブラウザが最初の値（`noopener` なし）を優先する問題を修正。`window.opener` アクセスによるタブナビゲーション攻撃のリスクを解消。クォートなし `rel` を検出・正規化して `noopener noreferrer` をマージするよう修正し、E2E テストを追加

### 改善

- **FeedDetailModal のコピーボタンにフィードバックを追加** — URL やセレクタをコピーするボタンをクリックした際、アイコンが一時的にチェックマーク（✓）に切り替わり 1.5秒後に元に戻るよう改善。コピー完了を視覚的に確認できるようになった
- **読了時間推定を日英混在に対応** — `readingTime()` が日本語（CJK）と英語の文字数・語数を個別に算出して合算するよう改善。従来は 30% 閾値で日英を二択していたため混在記事で不正確だった。日本語読速も 400字/分 → 500字/分（黙読実測値）に更新

### リファクタリング

- `ArticleList.tsx` からレイアウト別アイテムコンポーネントを `ArticleItems.tsx` へ分離 — 996行だったファイルを529行に削減。`CompactArticleItem` / `ListArticleItem` / `CardArticleItem` / `MagazineFeaturedArticleItem` と共有ヘルパー（`ArticleActions`・`ReadingTimeBadge`・`ArticleThumbnail`・`resolveThumbnail`・`highlightText`）を新ファイルに移動し、各コンポーネントの見通しを向上
- `useKeyboardNav` のクリップボード・フィルタートースト重複を整理 — `clipboardWrite()` でクリップボード書き込み+トーストを集約、`filterToastMsg()` でフィルタートグル後の ON/OFF メッセージ生成を統一
- `useUIState` からモバイルペイン管理を `useMobilePane` へ、NSFW モード管理を `useNSFWMode` へ分離 — 4つの責務が混在していた213行のフックを単一責任の独立フックに分割し、各ロジックの独立テスト・再利用を可能にした
- デッドコードを削除 — sticky AI モード廃止後に残留していた `STORAGE_KEYS.AI_MODE` (`"rss-ai-mode"`) と、実際には `CloudflareEnv` で管理されており参照されていなかった `types.ts` の `Env` インターフェースを除去

### バグ修正

- **履歴ビューで「全て既読」が機能しない問題を修正** — `markAllRead` が `SPECIAL_FEED_IDS.HISTORY` を処理するケースがなく、履歴ビューで `m` キーや既読ボタンを押しても何も起きなかった。`useReadState` に `historyIds` を渡し、HISTORY ケースを明示的に処理するよう修正
- `useFeedOperations` のエラーメッセージを日本語に統一 — フィード追加失敗時の `"Failed to add feed"` / `"Network error"` が英語のままだったのを `"フィードの追加に失敗しました"` / `"ネットワークエラーが発生しました"` に修正

### リファクタリング

- `useFeeds` の `onError` コールバックを `useRef` で保持するよう変更 — `useCallback`/`useEffect` の依存配列から `onError` を除外し、コールバック参照変化による不要な再生成・エフェクト再実行を防ぐ
- `useUIState` の NSFW 連打検出を固定長バッファ方式に変更 — クリックごとに配列スプレッド＋`filter()` で新配列を生成していた実装を、`push/shift` でインプレース更新する循環バッファ方式に改善
- `FONT_SIZE_CYCLE` / `LAYOUT_CYCLE` を `article-utils.ts` に集約 — `useKeyboardNav`・`ArticleView`・`useUIState` に散在していたサイクル定数とラベルを `DATE_RANGE_CYCLE` と同じパターンで一元管理

## 2026-03-29 (245)

### バグ修正

- **過去記事の追加読み込み後に日付順が崩れる問題を修正** — `loadMoreFeedArticles` で取得したページ 2 以降の記事を既存リストに追加する際、`compareByDateDesc` によるソートが抜けていたため複数フィードが混在すると日付順が乱れていた。`mergeArticles` と同様にソートを適用するよう修正

## 2026-03-29 (244)

### 新機能

- **`C` キーショートカットで Markdown リンクをコピー** — キーボードナビゲーションに `C` (Shift+C) を追加。選択中の記事を `[タイトル](URL)` 形式の Markdown リンクとしてクリップボードにコピーできる。タイトル内の `[` `]` は自動エスケープ。`c` (小文字) の URL のみコピーと対称的なキー割り当て。ヘルプモーダルにも追記

## 2026-03-29 (243)

### セキュリティ

- **未閉じ `<iframe>` タグのサニタイズ漏れを修正** — `sanitizeHtml` で `</iframe>` も `/>` も持たない未閉じ形式の iframe が信頼済みドメイン検証をスキップして出力されうる問題を修正。`<use>` タグと同様に第3パターンを追加し、残余の `<iframe...>` 開始タグも `isTrustedIframeSrc` で検証するようにした

## 2026-03-29 (242)

### セキュリティ

- **iframe pathPrefix 境界チェックを強化** — `isTrustedIframeSrc` で `pathPrefix` が末尾スラッシュなし (`/embed` 等) の場合、プレフィックス直後の文字が `/`・`?`・`#`・終端でなければ部分一致として拒否するよう修正。これにより `clips.twitch.tv/embedmalicious` のような URL のバイパスを防止

## 2026-03-29 (241)

### セキュリティ

- **OPML ネスト深度制限を強化** — `MAX_OPML_DEPTH` を 50 から 10 に削減。実際の OPML ファイルは 2〜3 レベルが一般的であり、過剰な深度は悪意ある入力での再帰処理増大を招く可能性があった

## 2026-03-29 (240)

### セキュリティ

- **キーワードフィルター入力サイズ上限を追加** — 各キーワードを 100 文字に切り詰め、R2 ストレージの肥大化を防止
- **推薦 dismiss の入力バリデーション強化** — `dismissId` の長さ上限 (128 文字) と `dismissedIds` 件数上限 (1000 件/FIFO) を追加

## 2026-03-29 (239)

### セキュリティ

- **非クォート `style` 属性の未サニタイズを修正** — `style=background:url(tracker)` のようなクォートなし style 属性が `sanitizeHtml` をすり抜け、CSS ピクセルトラッキングに悪用されうる問題を修正。クォートなし style 値にも `sanitizeStyleAttr`（`url()` 除去・`position:fixed/sticky` 除去）を適用するようにした
- **`authError` の HTML エスケープを追加** — 認証コールバック画面のエラーメッセージに `escapeHtml` を適用し、将来的なユーザー制御値が混入した場合の XSS を防止

## 2026-03-29 (238)

### 新機能

- **`Space` / `Shift+Space` キーで記事スクロール** — 記事本文ビューで `Space` を押すと 80% 分下スクロール、`Shift+Space` で上スクロール。入力中（テキストエリア・検索ボックス）は無効化。ヘルプモーダルにも追記

## 2026-03-29 (237)

### 新機能

- **`T` キーショートカットでリーディングリストフィルター切替** — キーボードナビゲーションに `T` (Shift+T) を追加。現在のフィードをリーディングリスト登録済み記事のみに絞り込める。`B` (ブックマークフィルター) と対称的なキー割り当て。フィルターバーに「後で」ボタンを追加。ヘルプモーダルにも追記

## 2026-03-29 (236)

### 新機能

- **`R` キーショートカットでフィード更新** — キーボードナビゲーションに `R` (Shift+R) を追加。特定フィードを選択中はそのフィードを、全記事表示中は全フィードを手動更新できる。更新開始時にトーストで通知。ヘルプモーダルにも追記

## 2026-03-28 (235)

### リファクタリング

- `applyKeywordFilterMap` を `src/lib/keyword-filter.ts` に追加し、`app/api/articles/route.ts` のマップベースフィルタリングを一元化

## 2026-03-28 (234)

### 新機能

- **`L` キーショートカットでいいね切替** — キーボードナビゲーションに `L` (Shift+L) を追加。選択中の記事のいいね状態をトグルできる。`l` (小文字) はレイアウト切替、`L` (大文字) はいいね切替と対称的なキー割り当て。ヘルプモーダルにも追記

## 2026-03-28 (233)

### ドキュメント整備

- **`filterAndSortArticles` の単体テストを追加** — `src/lib/article-filter.ts` のフィルタリング・ソートロジック全体をカバーする `e2e/article-filter.spec.ts` を新規作成。フィード絞り込み（特殊フィード含む）・NSFW フィルター・キーワードフィルター・未読/ブックマークフィルター・検索クエリ・日付範囲・ソート順・activeIds（グレースピリオド）・複合フィルターの 39 ケースを網羅

## 2026-03-28 (232)

### バグ修正

- **日付フィルターキーボードショートカット (`d`) のトースト表示を修正** — `cycleDateRange` が `setDateRange` の関数型アップデーターに依存して返り値を計算していたため、React のバッチ処理により常に「全期間」と表示されていた不具合を修正。`dateRangeRef` 経由で最新値を参照するよう変更

## 2026-03-28 (231)

### リファクタリング

- **`useFeedOperations` のインポート後フィード取得を `apiFetchJson` に統一** — `handleImportFile` 内で `apiFetch` + 手動 `.json()` + `if (feedsRes.ok)` チェックをしていた箇所を `apiFetchJson<Feed[]>` 1行に簡略化
- **`FeedsState.replaceFeeds` の戻り値型を修正** — インターフェース定義が `void` なのに実装が `async` で `Promise<void>` を返す型不整合を `Promise<void>` に統一

## 2026-03-28 (230)

### リファクタリング

- **`/api/read-state` GET の古いデータ形式対応を強化** — `readingListIds` / `likeIds` が存在しない旧フォーマットの R2 データをサーバー側で正規化し、常に 4 フィールドを返すよう修正。`useReadState` の `mergeServerSet` 呼び出しも全フィールドで `?? []` フォールバックを統一

## 2026-03-28 (229)

### リファクタリング

- **`useArticleContent` の OGP フェッチで localStorage キャッシュを先読み** — 記事一覧で `useOgpCache` がすでに取得済みの OGP 画像を、記事詳細ビューでも再フェッチしていた問題を解消。`/api/ogp` への不要なリクエストを削減

## 2026-03-28 (228)

### リファクタリング

- **`OgpData` 型を `src/types.ts` に集約** — `useContentLinkPreviews` / `useOgpCache` / `useArticleContent` の 3 ファイルで個別定義・匿名型として散在していた OGP レスポンス型を `OgpData` インターフェースとして一元化

## 2026-03-28 (227)

### リファクタリング

- **`sessionFromPayload` ヘルパーを追加し `getAuthSession` の重複を解消** — `isBetaAllowed` チェックと `AuthSession` 構築パターンがアクセストークン検証・リフレッシュトークン検証の2箇所に重複していたため、プライベートヘルパー `sessionFromPayload` に集約

## 2026-03-28 (226)

### リファクタリング

- **`sampleN` を標準的な前向き Fisher-Yates に整理** — `src/lib/recommendation.ts` の `sampleN` 関数が末尾から進む逆向き実装だったのを、先頭から進む標準的な実装に変更。動作は等価だが可読性が向上。あわせて `generateWebSearchFeeds` のインデックスベースループを `entries()` を使った慣用的な形に整理

## 2026-03-28 (225)

### リファクタリング

- **`export/route.ts` の `escapeXmlAttr` を `escapeHtml` に統合** — `app/api/feeds/export/route.ts` にあったローカル関数 `escapeXmlAttr` が `src/lib/html.ts` の `escapeHtml` と全く同じ実装だったため、重複を削除して既存エクスポートを再利用

## 2026-03-28 (224)

### リファクタリング

- **`useFeeds` の `apiFetch` 手動チェックを `apiFetchJson` に統一** — `feedActionWithRefresh` と `loadMoreFeedArticles` で繰り返していた `apiFetch → if (!res.ok) return → .json() キャスト` パターンを `apiFetchJson<T>` に置き換え。非 ok レスポンス時にサイレント失敗していた箇所もエラートーストが表示されるよう改善

## 2026-03-28 (223)

### リファクタリング

- **`apiFetchJson<T>` ヘルパーを `api-fetch.ts` に追加** — `apiFetch` + `res.ok` チェック + `res.json()` の定型パターンを共通化。`useFeeds` / `useFeedOperations` の6箇所で適用しボイラープレートを削減

## 2026-03-28 (222)

### リファクタリング

- **`recommendation.ts` の R2 読み込みを並列化・シャッフル修正** — `extractUserTopics` で直列実行していた `readFeedMeta` / `readLatestArticles` を `Promise.all` で並列化、`generateLinkDiscoveryFeeds` でも `Promise.allSettled` で並列化。また `sort(() => Math.random() - 0.5)` の偏りがある疑似シャッフルを適切な Fisher-Yates アルゴリズムに置換

## 2026-03-28 (221)

### リファクタリング

- **`buildFilterMap` を `keyword-filter.ts` に共通化** — `article-filter.ts` のプライベート `buildFeedFilterMap` と `articles/route.ts` のインライン実装で重複していたキーワードフィルターマップ構築ロジックを、汎用ヘルパー `buildFilterMap<T>` として `keyword-filter.ts` に統合

## 2026-03-28 (220)

### セキュリティ

- **image-proxy の MIME タイプ検証をホワイトリスト方式に変更** — SVG を個別に拒否するブラックリスト方式から、許可する画像 MIME タイプ（JPEG・PNG・GIF・WebP・BMP・AVIF）のみを明示的に通すホワイトリスト方式に変更し、将来の XSS リスクのある形式を一括排除できるように強化

## 2026-03-28 (219)

### リファクタリング

- **`base64urlToBytes` を `auth.ts` からエクスポートして `web-push.ts` で共有** — `auth.ts` の `base64urlToBytes` と `web-push.ts` の `base64urlDecode` に重複していた同一実装を統合し、`web-push.ts` 側の実装を削除

## 2026-03-28 (218)

### リファクタリング

- **`extractOgMeta` を `html.ts` に共通化** — `ogp/route.ts` と `articles/save/route.ts` に重複していた同一実装を `src/lib/html.ts` にエクスポートし、両ファイルから共有するよう変更

## 2026-03-28 (217)

### リファクタリング

- **`extractIds` のサイズ検証順を修正** — フィルタ＆重複排除後にサイズ上限を検証するよう変更し、重複エントリを多く含む正常ペイロードで誤 413 を返すバグを修正
- **R2 キーヘルパーを `src/lib/r2.ts` に集約** — `readStateKey` / `engagementKey` を追加し、各 Route Handler のローカル `r2Key` ヘルパーを削除
- **`useReadingHistory` を簡略化** — 不要な JSDoc コメントを削除し、`historyIds` の二重アロケーション（`map` → `Set`）を解消

## 2026-03-28 (216)

### セキュリティ

- **`/api/read-state` POST で重複 ID を排除** — 悪意ある送信者が同一 ID を大量に含むペイロードを送り込んでも R2 に重複保存されてしまう問題を修正。`extractIds` 内で `Set` による重複排除を追加

## 2026-03-28 (215)

### バグ修正

- **`useContentLinkPreviews` の OGP フェッチを `apiFetch` に統一** — 記事本文内リンクのプレビューカード取得で生の `fetch` を使っていたため、認証チェック完了前にリクエストが飛ぶレースコンディションと 401 時の自動リトライが機能しなかった問題を修正

## 2026-03-28 (214)

### セキュリティ

- **`/api/engagement` に `articleId`/`feedHash` 長さ制限を追加** — 検証なしの文字列フィールドに `MAX_ID_LENGTH = 128` を設け、過大なペイロードによる R2 ストレージ肥大化を防止。`/api/read-state` の `MAX_ID_LENGTH` と統一したパターンを採用

## 2026-03-28 (213)

### リファクタリング

- **`isAbortError()` ヘルパーを追加し AbortError 判定を統合** — `useArticleContent`・`useArticleAi`・`/api/content`・`/api/image-proxy` の4箇所で重複していた `err instanceof Error && err.name === "AbortError"` チェックを `src/lib/fetch.ts` の `isAbortError()` に集約

## 2026-03-28 (212)

### リファクタリング

- **`decodeBytesToString()` ヘルパーを追加し TextDecoder 重複ロジックを統合** — `fetch-article-content.ts` と `app/api/ogp/route.ts` で重複していた TextDecoder チャーセットフォールバックパターンを `src/lib/content.ts` の `decodeBytesToString()` に集約

## 2026-03-28 (211)

### リファクタリング

- **`applyRefreshedTokens` 系の重複クッキー設定ロジックを統合** — `applyRefreshedTokens` と `applyRefreshedTokensToResponse` で重複していた `access_token` / `refresh_token` / `token_exp` の cookie セット処理を `setRefreshedTokenCookies()` ヘルパーに抽出

## 2026-03-28 (210)

### セキュリティ

- **`applyRefreshedTokensToResponse` のクッキー設定を安全化** — 手動文字列連結で `Set-Cookie` ヘッダーを構築していたコードを `NextResponse.cookies.set()` を用いた安全な実装に変更。クッキー値のシリアライズを Next.js に委ねることでインジェクションリスクを排除し、`applyRefreshedTokens`（`NextResponse` 用）と一貫したパターンに統一

## 2026-03-28 (209)

### リファクタリング

- **`useFeeds` の重複ロジックを統合** — `retryFeed` と `reinferFeed` の共通パターン（POST→フィード更新→記事再取得）を `feedActionWithRefresh` ヘルパーに抽出し、重複コードを削除

## 2026-03-28 (208)

### リファクタリング

- **`ArticleView` のコンポーネント分割** — 空状態 (`EmptyArticleView`)・全文取得エリア (`FetchFullContentArea`)・前後記事ナビ (`ArticleNavigation`)・トグルボタン (`ToggleIconButton`) を内部サブコンポーネントとして抽出し、メイン関数本体の見通しを改善

## 2026-03-28 (207)

### 新機能

- **全文取得ショートカットキー `v`** — 記事ビューで `v` を押すと全文取得 (`/api/content`) を実行。未取得かつフェッチ中でない場合のみ動作

## 2026-03-28 (206)

### バグ修正

- **壊れた RSS XML への耐性を強化** — `xml-parser.ts` に前処理を追加。BOM・XML 宣言前のゴミ（PHP エラー等）・XML 1.0 禁止制御文字を除去してからパースするように変更。また、CDATA 内の `]]>` や不正エンティティでパースが失敗した場合に `stopNodes` モードの寛容パーサーでフォールバックする仕組みを追加

## 2026-03-28 (205)

### リファクタリング

- **`KeyboardShortcutsModal` / `ReleaseNotesModal` を `Modal` に統一** — 両コンポーネントで重複していた Escape キーハンドラー・オーバーレイ・閉じるボタンを削除し、汎用 `Modal` コンポーネントを使用するよう変更

## 2026-03-28 (204)

### リファクタリング

- **`useArticleAi` を簡略化** — `AiMode` は `"summary"` のみで `mode` パラメータが冗長だったため削除。`doRunAi` のシグネチャを `(url, articleId?)` に変更、`aiResult` 型を `string | null` に、`aiLoading` 型を `boolean` に単純化。LRU キャッシュキーも `${articleId}:summary` → `articleId` に変更

## 2026-03-28 (203)

### バグ修正

- **JS 遅延ロード画像の解決** — `loadImage('id', 'jpgUrl', ...)` パターンのスクリプトを解析し、`src` が空の `<img id="...">` に URL を注入する `resolveScriptLoadedImages()` を追加。digitallover.moe 等の WordPress 非標準遅延ロードに対応
- **OGP 取得の文字化けを修正** — `/api/ogp` が UTF-8 固定デコードしていた問題を修正。`detectCharset()` で `Content-Type` ヘッダーおよび HTML `<meta charset>` から文字エンコーディングを検出するように変更（Shift-JIS / EUC-JP ページのリンクカードで文字化けしていた問題の解消）

## 2026-03-28 (202)

### バグ修正

- **おすすめ欄の偏り修正** — トピック抽出をエンゲージメント上位5件＋他フィードからランダム5件のサンプリングに変更し、特定ジャンル（アニメ等）への偏りを抑制。LLM プロンプトにも多様性指示を追加
- **スマホでの + / × ボタン不可視を修正** — `opacity-0 group-hover:opacity-100` をホバー対応デバイス限定の `@media(hover:hover)` に変更し、タッチデバイスでは常時表示に

## 2026-03-28 (201)

### 新機能

- **LLM セレクタ再推論機能を追加** — スクレイピングフィード（RSS 未対応サイト）で抽出結果が正しくない場合、コンテキストメニューから「セレクタを再推論」を実行して CSS セレクタを再生成できるように。`/api/feeds/:id/reinfer` エンドポイントを追加
- **CSS セレクタ推論モデルを強化** — `llama-3.1-8b-instruct` から `llama-3.3-70b-instruct-fp8-fast` にアップグレードし、推論精度を向上

## 2026-03-28 (200)

### 変更

- **翻訳機能を廃止** — AI 翻訳ボタン・翻訳/原文切り替えバー・`/api/ai/translate` エンドポイントを削除。AI 機能は要約のみに絞り込み
- **おすすめ欄を常時表示** — フィードが空でも「おすすめ」セクションを表示し、おすすめが未生成の場合は説明文を表示するように変更

## 2026-03-28 (199)

### リファクタリング

- **`filterNewArticles` ヘルパーを抽出** — `mergeArticles` と `loadMoreFeedArticles` で重複していた「既存IDセットを作って新着だけ抽出」ロジックをモジュールレベルの `filterNewArticles` 関数に集約

## 2026-03-28 (198)

### リファクタリング

- **`refreshFeeds` で記事・フィードを並列フェッチ** — 全フィード更新後に `/api/articles` と `/api/feeds` を順次取得していたところを `Promise.all` で並列化し、更新完了までのレイテンシを短縮

## 2026-03-28 (197)

### リファクタリング

- **`applyKeywordFilter` の `normalizeFilter` 重複呼び出しを修正** — `articles.filter` ループ内で記事ごとに `normalizeFilter` を実行していた問題を解消し、ループ外で1回だけ実行するよう修正。あわせて `useReadState.ts`・`article-filter.ts` の関数名・型名から自明な WHAT コメントを削除

## 2026-03-28 (196)

### リファクタリング

- **`useMenuOpen` フックに click-outside ロジックを抽出** — `ArticleView` の `ShareMenu`・`FilterMenu` 両コンポーネントで重複していた「`open` 状態 + `menuRef` + click-outside `useEffect`」を `useMenuOpen` フックに共通化

## 2026-03-28 (195)

### リファクタリング

- **`normalizeFilter` を `keyword-filter.ts` に抽出** — `applyKeywordFilter`・`buildFeedFilterMap`・`articles/route.ts` の3箇所でキーワードを小文字化するコードが重複していた問題を解消。`normalizeFilter` ヘルパーに共通化し、`articles/route.ts` の空フィルタースキップ漏れも修正

## 2026-03-28 (194)

### リファクタリング

- **`ArticleView` のジェスチャーナビを `useGestureNav` hook に抽出** — スワイプ・ホイール・マウスドラッグの3つの ref と6つのハンドラーをコンポーネント外の `useGestureNav` hook にまとめ、JSX 内の読書時間・FilterMenu の IIFE を事前計算変数に置き換えてコンポーネント本体を簡素化

## 2026-03-28 (193)

### リファクタリング

- **`App.tsx` の Feed PATCH 操作を `patchFeed` ヘルパーに集約** — `toggleNsfwFeed` と `saveFilter` が同じ PATCH パターン（`apiFetch` → チェック → JSON パース → `updateFeed`）を重複実装していた問題を修正。`patchFeed` useCallback に共通化し、inline `import("./types").Feed` 型注釈も top-level import に統一

## 2026-03-28 (192)

### リファクタリング

- **特殊フィードIDをマジックストリングから定数へ移行** — `__bookmarks__` / `__reading_list__` / `__likes__` / `__history__` を `SPECIAL_FEED_IDS` 定数 (`src/lib/storage.ts`) に集約。`article-filter.ts` / `useReadState.ts` / `FeedSidebar.tsx` / `ArticleList.tsx` の全参照箇所を定数に統一し、文字列変更時の追跡コストを排除
- **`RecommendationCache.generatedAt` の型を `string | null` に修正** — エラーフォールバック時の `null` 代入と型定義の乖離を解消。`EMPTY_RECOMMENDATIONS` 定数を導入してフォールバックオブジェクトに型安全性を付与

## 2026-03-28 (191)

### セキュリティ

- **API ルートのエラーハンドリング強化** — `withSession` / `withBinarySession` にトップレベル try-catch を追加し、ハンドラ内の未補足例外が Workers の未ハンドル rejection として漏洩するのを防止。`runAiJob` の `env.AI.run()` 呼び出しも try-catch で保護し、Workers AI 障害時に 502 を返すよう修正。`/api/recommendations` の `generateRecommendations` 失敗時は期限切れキャッシュへのフォールバックを実装

## 2026-03-28 (190)

### バグ修正

- **`useFilteredArticles` のデフォルト引数をモジュール定数に変更** — `likeIds`・`historyIds`・`nsfwFeedIds`・`historyOrder`・`feeds` のデフォルトに毎回新しいオブジェクトを生成していた問題を修正。モジュールレベルの `EMPTY_SET` / `EMPTY_STR_ARRAY` / `EMPTY_FEED_ARRAY` 定数に差し替え、`useMemo` 依存配列での不要な再計算を防止

## 2026-03-28 (189)

### リファクタリング

- **`FeedSidebar` の特殊ビューボタンを `SpecialViewButton` コンポーネントに統一** — 履歴・ブックマーク・後で読む・いいねの 4 ボタンが同一 JSX パターンを重複していた。ローカル `SpecialViewButton` コンポーネントに抽出し約 55 行削減。ブックマーク・後で読むを囲んでいた無用な `<div className="group relative">` も合わせて除去

## 2026-03-28 (188)

### 新機能

- **「いいね」した記事の一覧ビューをサイドバーに追加** — `likeIds` はすでに追跡されていたが専用ビューが存在しなかった。サイドバーに「いいね」エントリを追加し、`useFilteredArticles` に `__likes__` フィードIDサポートを実装。`markAllRead` にも `__likes__` ケースを追加

### バグ修正

- **`release-notes-data.ts` のエスケープなしバッククォートを修正** — テンプレートリテラル内の未エスケープバッククォートを `\`` に修正

## 2026-03-28 (187)

### リファクタリング

- **`FeedItem` のアクションハンドラから `e.stopPropagation()` を集約** — `actions` 配列の各 `onClick` で個別に呼んでいた `e.stopPropagation()` をレンダリング層（デスクトップ・モバイルの button `onClick`）に一元化。`Action.onClick` の型を `() => void` に簡略化し、各アクションの実装から不要なイベント引数を除去

## 2026-03-28 (186)

### リファクタリング

- **`content/route.ts` の `new URL(request.url)` 二重生成を解消** — `handleGet` 内で同一 URL から 2 つの URL オブジェクトを作成していた冗長コードを 1 回の生成に統合
- **`image-proxy/route.ts` の不要な変数エイリアスを削除** — `detectImageMimeType` の戻り値を受けた `const imageContentType = detected` エイリアスを廃止し、`const mimeType` として直接利用

## 2026-03-28 (185)

### バグ修正

- **全文取得中に記事を切り替えると「全文取得」ボタンが永久に disabled になる問題を修正** — `useArticleContent` の記事切り替え時リセット `useEffect` に `setFetching(false)` を追加。フェッチ中断後に `finally` ブロックが `setFetching` を呼ばない設計に起因していた

## 2026-03-28 (184)

### リファクタリング

- **`useReadState` の `toggle` 中間ヘルパーを削除** — 4つの `toggleX` からのみ呼ばれていた `toggle` `useCallback` を廃止し、各 `toggleX` が `toggleSetItem` + `scheduleSyncToServer` を直接呼ぶようフラット化。依存チェーンを1段削減

## 2026-03-28 (183)

### リファクタリング

- **`fetch.ts` の AbortController タイムアウトパターンを `withTimeout` に集約** — `fetchWithTimeout` と `fetchFollowSafeRedirects` で重複していた AbortController + clearTimeout ロジックを内部ヘルパー `withTimeout<T>` に抽出し重複を削除

## 2026-03-28 (182)

### リファクタリング

- **`useReadState` の ref 同期 `useEffect` を直接代入に変更** — `stateRef` / `articlesRef` を更新するだけの `useEffect` 2つを削除し、レンダー中の直接代入に置き換え。`useFeeds.ts` の `loadedFeedPagesRef` と同じパターンで副作用の遅延なく ref を最新状態に保てる

## 2026-03-28 (181)

### バグ修正

- **初回ログイン後に `token_exp` Cookie が未設定だった問題を修正** — `callback/route.ts` でアクセストークン発行後に `token_exp`（non-HttpOnly）Cookie をセットするよう修正。これまでトークンリフレッシュ時のみ設定されており、初回ログイン直後はクライアントが期限を読めない状態だった
- **`/api/articles` のページパラメーターバリデーションを追加** — `page` が `NaN`・負数・`MAX_PAGES` 超過の場合に 400 を返すよう修正。存在しない R2 キーへの無駄なアクセスを防ぐ

## 2026-03-28 (180)

### リファクタリング

- **`getJwtExp` を export して重複削除** — `server-auth.ts` の JWT exp デコード関数を `export` し、`me/route.ts` で同じ base64 デコードロジックを手書きしていた箇所を削除

## 2026-03-28 (179)

### セキュリティ

- **Cookie を共有メタから購読情報へ移動** — `requestCookie`（年齢確認ゲート等の突破用 Cookie）が `SharedFeedMeta`（全購読者が参照可能な共有ストレージ）に保存されていた問題を修正。`UserSubscription`（ユーザー個別データ）へ移動することで、他ユーザーへの Cookie 漏洩リスクを排除。cron / 手動リフレッシュ時は購読データから Cookie を取得してフェッチに渡すよう変更

## 2026-03-28 (178)

### リファクタリング

- **`compareByPublishedAtDesc` を `article-utils.ts` に抽出** — `cron/fetch.ts` のインラインソートを名前付き関数に置き換え。`compareByDateDesc` と重複していたロジックを `publishedAt` のみのオブジェクト向け比較関数として共通化
- **`matchesKeywordFilter` のキーワード lowercase を呼び出し元に移動** — 関数内で記事ごとに `lowerExclude`/`lowerInclude` を再計算していた処理を、`feedFilterMap`（`useFilteredArticles`）と `filterMap`（`/api/articles`）の構築時に一度だけ実行するよう変更。`applyKeywordFilter` も同様に正規化後の filter を渡すよう修正

## 2026-03-28 (177)

### リファクタリング

- **`matchesKeywordFilter` のキーワード事前小文字化** — `exclude` / `include` の各キーワードに対する `.toLowerCase()` をコールバック内の毎回呼び出しから関数冒頭での一括 `.map()` に移動。記事ごとのキーワード変換を回避し意図を明示する
- **`compareByDateDesc` の冗長 JSDoc 削除** — 関数名と型シグネチャで自明な説明を除去

## 2026-03-28 (176)

### リファクタリング

- **`compareByDateDesc` を文字列比較に簡略化** — `article-utils.ts` の日付降順ソート比較関数を `new Date().getTime()` による数値差分から ISO 8601 文字列の辞書順比較に統一（`ParsedItem` の同種変更と一致させる）
- **`matchesKeywordFilter` の条件分岐を簡略化** — 早期 return が 2 つある形から `every` / `some` による単一の return 式に変更。`exclude.every(...)` は空配列で `true` を返すため `length > 0` ガードが不要になる

## 2026-03-28 (175)

### リファクタリング

- **`ParsedItem` ソート比較関数を簡略化** — `cron/fetch.ts` の巨大フィード切り詰め処理で使っていた `publishedAt` 降順ソートの比較関数を、4 条件の if チェーンから `null ?? ""` でフォールバックする 3 行の文字列比較に統一。ISO 8601 文字列は辞書順と時系列順が一致するため、`Date` オブジェクト生成なしで正確に降順ソートできる

## 2026-03-28 (174)

### リファクタリング

- **`sanitizeHtml` / `fixExternalLinks` の HTML 属性マッチを統合** — `xlink:href`・`href|src|action|formaction` の危険スキーム検出と `fixExternalLinks` の `rel` 属性処理で、ダブルクォート用とシングルクォート用に分かれていた正規表現ペアを `(["'])…\1` 後方参照パターンで 1 つに統合。合計 5 行を削減。`style` 属性は値が `url('...')` のように逆クォートを含む可能性があるため従来通り個別パターンを維持（コメント追記）

## 2026-03-28 (173)

### リファクタリング

- **`readBodyBytes` / `readBodyBytesPartial` を `readBodyBytesCore` に統合** — `src/lib/fetch.ts` の 2 関数で重複していた ReadableStream 読み取りループ（reader 初期化・チャンク蓄積・finally ブロック）をプライベートな `readBodyBytesCore` に集約。公開 API のシグネチャは変更なし

## 2026-03-28 (172)

### リファクタリング

- **`basicAuthHeader` をワンライナーに簡略化** — OAuth2 クライアント認証情報は ASCII のみのため、`TextEncoder` + `String.fromCharCode` + `btoa` の迂回路を `btoa(\`${clientId}:${clientSecret}\`)` の直接呼び出しに置き換えた

## 2026-03-28 (171)

### リファクタリング

- **`getDateRangeStart` を `article-utils` に移動** — `useFilteredArticles` のプライベート関数だった `getDateRangeStart` を `src/lib/article-utils.ts` にエクスポートし、`DATE_RANGE_CYCLE` / `DATE_RANGE_LABELS` と同じモジュールに集約。あわせて `ArticleList` の `cycleDateRange` プロップ型を `() => void` から `() => DateRange` に修正

## 2026-03-28 (170)

### リファクタリング

- **`DATE_RANGE_CYCLE` / `DATE_RANGE_LABELS` を `article-utils` に一元化** — `useKeyboardNav` と `useFilteredArticles` に重複定義されていた日付範囲の定数を `src/lib/article-utils.ts` に移動して共有化。あわせて `cycleDateRange` が次の値を返すよう変更し、`d` キー処理を `f` / `l` と同一パターンに統一

## 2026-03-28 (169)

### リファクタリング

- **`cycleValue` を `article-utils` に移動して共有化** — `useKeyboardNav` にローカル定義されていた `cycleValue<T>` を `src/lib/article-utils.ts` に export し、`useFilteredArticles` の `cycleDateRange` でインライン展開していた同一ロジックを置き換えた

## 2026-03-28 (168)

### リファクタリング

- **`useKeyboardNav` に `cycleValue` / `navigateTo` ヘルパーを抽出** — `FONT_SIZE_CYCLE` / `LAYOUT_CYCLE` の「次の値を求める」インデックス計算を `cycleValue<T>` 関数に統一し、j/k/n/p キーで繰り返していた `setSelectedArticle + markRead` 呼び出しを `navigateTo` に集約

## 2026-03-27 (167)

### リファクタリング

- **LRU キャッシュの flush を `queueMicrotask` に変更** — `setTimeout(..., 0)` のマクロタスク遅延（最低 4ms）を排除し、localStorage への書き込みをより早いタイミングで実行。あわせて `flushTimer` の型を `boolean` に簡略化

## 2026-03-27 (166)

### 新機能

- **フィード追加時に Cookie を設定可能** — 年齢確認ゲート等を持つサイト（FANZA/DMM など）のスクレイピングに対応。フィード追加フォームの「▸ Cookie を設定（任意）」から `age_check_done=1` のような値を指定できる。指定した Cookie は以降のクロン取得にも使用される

## 2026-03-27 (165)

### セキュリティ

- **OGP画像URLのSSRFバリデーション強化** — `POST /api/articles/save` で OGP 画像 URL の検証を正規表現から `isValidFeedUrl()` に切り替え。プライベート IP・ループバック・リンクローカルへのアクセスを防止
- **アップストリーム情報漏洩を修正** — `GET /api/content` のエラーレスポンスからアップストリームサーバーの `statusText` を除去し、HTTP ステータスコードのみ返すよう変更

## 2026-03-27 (164)

### 新機能

- **プッシュ通知テスト送信** — `POST /api/push/test` でサーバーから即時テスト通知を送信できるようになった。VAPID 未設定・サブスクリプションなしの場合は明示的なエラーメッセージを返す。UI では購読中のベルアイコンを右クリックするとテスト送信を実行できる

## 2026-03-27 (163)

### バグ修正

- **エンゲージメントバッファの重複送信を修正** — `flushBuffer` で `Promise.all` を使っていたため、一部リクエストが成功・一部が失敗した場合でもバッファ全体が保持され、次回フラッシュ時に成功済みエントリが重複送信される問題があった。`Promise.allSettled` に切り替え、失敗したエントリのみ保持するよう修正

## 2026-03-27 (162)

### リファクタリング

- `articles` 配列の線形検索を `Map` キャッシュに最適化 — `handleToggleBookmark` / `handleToggleReadingList` / `handleToggleLike` の `articles.find()` O(n) を `articleMap.get()` O(1) に変更

## 2026-03-27 (161)

### 新機能

- **NSFWモード長押し解除** — NSFWモード中に「RSS」ロゴを 600ms 長押しするとモードが解除されるようになった

### バグ修正

- **フィードメニューのタップ貫通を修正** — スマホでフィードのサブメニューを開いているとき、メニュー外タップが背景の要素に届いてしまう問題を修正。fixed backdrop で確実にイベントを遮断するよう変更した

## 2026-03-27 (160)

### リファクタリング

- **FeedItem アイコン重複解消** — NSFW・フィルターアイコンの SVG が `actions` 配列と JSX バッジの両方で重複定義されていたため、`NsfwIcon` / `FilterIcon` コンポーネントに抽出して一元化

## 2026-03-27 (159)

### 新機能

- **NSFWモード** — フィード単位で NSFW フラグを設定でき、NSFW モード時のみ記事が表示される。フィードの操作メニューから「NSFW設定」でトグル可能。「RSS」ロゴを2秒以内に5回連打するとお目々が開くアニメーションを経て NSFW モードへ移行し、ロゴが赤色に変わる

## 2026-03-27 (158)

### バグ修正

- **`safeUrl` が HTML エンティティをデコードした URL を返すよう修正** — XSS バイパス検証後に元の `url`（エンティティ未解決）を返していたため、`&amp;` 等を含むリンクが二重エンコードされる問題を修正。`decoded` を返すことでエンティティを正規化した URL を格納する
- **`PATCH /api/feeds/:id` のタイトル型チェックを改善** — `title` に文字列以外が渡された場合に「title is required」ではなく「title must be a string」を返すよう修正
- **cron の publishedAt ソートで `localeCompare` を比較演算子に置き換え** — ISO 8601 文字列は辞書順と時系列順が一致するため `>` / `<` 演算子を使用し、ロケール依存を排除

## 2026-03-27 (157)

### リファクタリング

- **`useMemo` イテレーション重複を削減** — `useReadingHistory` で `historyIds` / `historyOrder` を別々に map していた 2 つの `useMemo` を 1 つに統合。`App.tsx` の `bookmarkCount` / `readingListCount` / `historyCount` を個別 filter × 3 から 1 ループで計算する `useMemo` に統合

## 2026-03-27 (156)

### リファクタリング

- **日付降順ソート比較関数を `article-utils` に集約** — `shared-feed.ts`・`useFeeds.ts`・`api/articles/route.ts` の3箇所に重複していたインライン比較関数を `compareByDateDesc` として `src/lib/article-utils.ts` に抽出

## 2026-03-27 (155)

### バグ修正

- **テーマ切り替え後に画像スライダーコントロールが消える問題を修正** — `injectSliderControls` の useEffect deps が `storedContent` / `article?.id` のみで `processedContent` を見ていなかったため、テーマ切り替えなど DOM 再レンダリング後に prev/next ボタンとホイール操作が失われていた。`processedContent` を deps に加えて再注入を確実にした。あわせて `.rss-slider-slide img` の CSS に `!important` を追加し、`.article-content img { width: auto !important }` による幅上書きを解消

## 2026-03-27 (154)

### バグ修正

- **`saveFilter` の `fetch` を `apiFetch` に統一** — `App.tsx` と `FeedSidebar.tsx` のフィルター保存処理で生の `fetch` を使っていたため、認証チェック完了前にリクエストが飛ぶレースコンディションと 401 時の自動リトライが機能しなかった問題を修正

## 2026-03-27 (153)

### リファクタリング

- **`recommendation.ts` の `Promise.allSettled` 結果収集を `fulfilledValues` ヘルパーに集約** — `generateWebSearchFeeds`・`generatePopularFeeds`・`generateLinkDiscoveryFeeds` の3関数で重複していた「fulfilled かつ非 null の値を収集」パターンを `fulfilledValues<T>()` に抽出。`generatePopularFeeds` のコールバック内 mutation も return パターンに統一。合計 14 行削減

## 2026-03-27 (152)

### リファクタリング

- **記事フィルタリングを `matchesKeywordFilter` 直接呼び出しに簡素化** — `GET /api/articles` の全件取得パスで各記事を `applyKeywordFilter([a], filter).length > 0` とシングルトン配列にラップしていた処理を `matchesKeywordFilter(a, filter)` の直接呼び出しに変更。`filterMap.size > 0` の事前チェックも不要になり3行削減

## 2026-03-27 (151)

### 新機能

- **全文検索で author・categories も対象に** — 記事一覧の検索クエリが `title`・`summary` に加えて著者名（`author`）とカテゴリタグ（`categories`）もヒット対象になりました。複数ワードの AND 検索もフィールドをまたいで機能します。`articleMatchesQuery()` として `article-utils.ts` に純粋関数として切り出し、21 件のテストケースで検証

## 2026-03-27 (150)

### テスト

- **巨大フィードのエンティティ展開制限リグレッションテスト追加** — `maxTotalExpansions` / `maxExpandedLength` 緩和（98658e2）の回帰防止テストを `e2e/xml-parser.spec.ts` に追加。150件×700エンティティと200件×長い description で旧制限（100,000 / 500,000）を超えるケースを検証

## 2026-03-27 (149)

### 新機能

- **エンゲージメントスコアの単体テスト追加** — `scoreFeedEngagement` と `topScoredFeeds` の全挙動を検証する `e2e/engagement-score.spec.ts` を追加。アクション重み・時間減衰（半減期7日）・スコア集計・minScore フィルタリング・limit パラメータを 28 テストケースでカバー

## 2026-03-27 (148)

### 新機能

- **レコメンドにリンク発見（Link Discovery）を追加** — ブックマーク・いいね・全文取得済み記事の Cloudflare Cache キャッシュから HTML を読み、本文内リンクから RSS フィードを発見する。外部 fetch なしでキャッシュのみ参照し、他 2 ソースと並列実行してマージ

## 2026-03-27 (147)

### 新機能

- **レコメンドに人気フィードランキングを追加** — 他ユーザーが多く購読しているフィードを `source: "popular"` として提案するように。Brave Search と並列実行し、feedUrl で重複を排除してマージ

## 2026-03-27 (146)

### 改善

- **トピック抽出モデルを Gemma 3 12B に変更** — `llama-3.1-8b` から `gemma-3-12b-it` に切り替え。日本語・英語混在タイトルの解析精度が向上。フィード提案は引き続き Brave Search API が担当

## 2026-03-27 (145)

### リファクタリング

- **レコメンドエンジンから AI 依存を除去** — Workers AI (Llama 3.1 8B) を削除し、トピック抽出をルールベース（記事タイトル・フィード名の頻出語集計）に置換。フィード提案は Brave Search API のみに簡素化。軽量・高速・確定的な処理になり、30 秒制限への余裕も増加

## 2026-03-27 (144)

### 新機能

- **フィードレコメンドに Brave Search API 統合** — トピックキーワードで実際のウェブ検索を行い、検索結果から RSS フィードを発見するように。AI の事前学習知識のみに頼らず最新のブログも提案できるように。API キー未設定時は従来の AI 提案のみで動作

## 2026-03-27 (143)

### 新機能

- **フィードレコメンド機能（Phase 1）** — エンゲージメントスコアから興味トピックを AI で抽出し、関連する RSS フィードを提案。サイドバーの「おすすめ」セクションから購読追加・非表示・更新が可能。24 時間キャッシュで負荷を抑制

## 2026-03-27 (142)

### 新機能

- **いいね機能を追加** — 記事にハートアイコンでいいねを付けられるようになりました。ブックマークの隣に配置
- **エンゲージメント記録基盤を追加** — 全文取得・元記事遷移・後で読む・ブックマーク・いいねの各アクションをタイムスタンプ付きで R2 に保存するようになりました（フィードレコメンド機能の基盤）
- **時間減衰スコアリングエンジンを追加** — アクション種別の重み（いいね5.0〜後で読む2.0）と半減期7日の指数減衰でフィードごとの関心度スコアを算出する `scoreFeedEngagement()` を実装

## 2026-03-27 (141)

### バグ修正

- **巨大RSSフィードの購読エラーを修正** — Cloudflare changelogのような大量の HTML エンティティ（`&amp;` 等）を含むフィードで `Entity expansion limit exceeded` エラーが発生していた問題を修正。エンティティ展開制限を 10 万→100 万に緩和し、あわせてフィード XML のサイズ上限（10MB）と 1 フィードあたりの最大記事数（500 件）を追加

## 2026-03-27 (140)

### バグ修正

- **記事一覧ヘッダーのボタン角丸を統一** — レイアウト切替・ソート・全て既読のアイコンボタンが `rounded`（角丸四角）、未読・★・日付のテキストボタンが `rounded-full`（ピル形状）と混在していた。アイコンボタンを `rounded-full` に変更してヘッダー内全ボタンを統一

## 2026-03-27 (139)

### リファクタリング

- **死んだ `migrate-ids` エンドポイントを削除** — UUID→sha256 ID 移行完了済みにもかかわらず残留していた `GET /api/migrate-ids` を削除。フロントエンドからの参照はなく、不要な攻撃対象を排除

## 2026-03-27 (138)

### 新機能

- **コードブロックのシンタックスハイライト** — 記事本文内の `<pre><code>` ブロックに `highlight.js` によるシンタックスハイライトを適用。JavaScript・TypeScript・Python・Go・Rust・Shell・CSS・HTML・JSON など約 30 言語を自動検出。GitHub Light / GitHub Dark 準拠のトークン色でライト/ダークテーマに対応

## 2026-03-27 (137)

### バグ修正

- **記事一覧の無限スクロールが動作しない問題を修正** — 記事が非同期でロードされる場合、初回レンダー時に `articles=[]` → `hasMore=false` → sentinel div が DOM に存在しないため `IntersectionObserver` が未セットアップのまま放置されていた。`hasMore` を `useEffect` の依存配列に追加し、sentinel が初めてマウントされたタイミングで observer を確実にセットアップするよう修正

## 2026-03-27 (136)

### 新機能

- **セッション期限切れ時にバナーを表示** — アクセストークンとリフレッシュトークンが両方失効してセッションが切れた場合、ランディングページに「セッションが期限切れになりました」バナーを表示。突然ランディングページに飛ばされた際の原因が分かるように。`useAuth` に `sessionExpired` 状態を追加し、ログイン済み→未認証への遷移を検出

## 2026-03-27 (135)

### 新機能

- **URL から単一記事をブックマーク・後で読むに保存** — サイドバーの「ブックマーク」「後で読む」セクション下の「+ URL を保存」から任意の URL を登録し、ブックマーク（BK）または後で読む（後で）に直接追加できるように。タイトルと OGP 画像を自動取得して記事として保存。`POST /api/articles/save` エンドポイントと `users/{userId}/saved.json` ストレージを新設

## 2026-03-27 (134)

### セキュリティ

- **`scrapeFeed` で抽出した記事リンクの URL スキームを検証** — LLM 生成フィードのスクレイピング処理で、`javascript:` 等の危険スキームを持つ `href` が記事リンクとして保存され XSS の踏み台になりうる問題を修正。`http(s)://` 以外の URL を除外するよう `scrapeFeed` に検証を追加（RSS の xml-parser が使う `safeUrl()` と同水準）

## 2026-03-27 (133)

### リファクタリング

- **`useFeeds` のポーリングロジックを `pollNow` ヘルパーに抽出** — 5分間隔ポーリングとオンライン復帰時の即時フェッチで重複していたコードを `pollNow` 関数に一本化。併せて、復帰時フェッチで `latestArticleIdRef` を `fetchAndSetArticles` の完了後に読んでいたバグ（新着カウントが常に 0 になる）を修正

## 2026-03-27 (132)

### リファクタリング

- **`saveJson` ヘルパーを追加し、散在する `storageSet(key, JSON.stringify(...))` パターンを統一** — `storage.ts` に `saveJson<T>(key, value)` を追加し、`useOgpCache`・`useSearchHistory`・`useReadingHistory` の 3 フックで使用していた手動の JSON.stringify パターンを置き換え

## 2026-03-27 (131)

### 新機能

- **オフライン時のポーリングをスキップ・復帰時に即座に更新** — `useFeeds` に `useOnlineStatus` を組み込み、オフライン中は5分ポーリングをスキップして無駄なネットワークリクエストを抑制。オフライン → オンライン復帰時は即座に記事を再取得して新着件数を更新するよう改善

## 2026-03-27 (130)

### バグ修正

- **Qiita など CDN の長い OGP 画像 URL が取得できない問題を修正** — `og:image` の URL 長チェックに汎用 `MAX_URL_LENGTH`（2048文字）を使っていたため、imgix が生成する長い URL（Qiita の記事で ~2700文字）が弾かれていた。OGP 画像専用の上限 `MAX_OGP_IMAGE_URL_LENGTH`（8192文字）を追加して解消
- **Qiita 記事内の画像が表示されない問題を修正** — 記事 HTML の `src` 属性に `&amp;` が含まれる場合（imgix CDN など）、そのまま `encodeURIComponent` すると image-proxy 経由で `amp;auto` 等のパラメータ名になり imgix の署名検証（`s=`）が失敗していた。`rewriteImageUrls` で URL 抽出後に `unescapeHtml` を適用して `&` に変換してから `encodeURIComponent` するよう修正

## 2026-03-27 (129)

### リファクタリング

- **Push 設定の R2 キー生成を `userPushKey()` に集約** — `users/${userId}/push.json` のキー文字列が `push/subscribe`・`push/unsubscribe`・`push/status` の各 Route Handler と `cron/fetch.ts` の計4箇所に散在していたため、`r2.ts` に `userPushKey(userId)` ヘルパーを追加して統一

## 2026-03-27 (128)

### リファクタリング

- **`loadSet()` を `loadJson()` で内部実装** — `storage.ts` の `loadSet` が独自に行っていた try-catch + JSON.parse パターンを `loadJson<string[]>(key, [])` を使って1行に簡略化し、`loadJson` との重複を排除

## 2026-03-27 (127)

### リファクタリング

- **`localStorage` JSON 読み込みを `loadJson()` ヘルパーに共通化** — `useSearchHistory` / `useReadingHistory` / `useOgpCache` で同一の try-catch + JSON.parse + fallback パターンが重複していたため、`storage.ts` に `loadJson<T>(key, fallback)` ヘルパーを追加して統一

## 2026-03-27 (126)

### リファクタリング

- **`ai-route-helper` の型統一とキャッシュ保存をバックグラウンド化** — `cacheType` パラメータの型を inline リテラル型 `"summary" | "translation"` から共通型 `AiMode` に統一。AI 結果の R2 キャッシュ保存を `await` から `ctx.waitUntil()` に変更し、クライアントへのレスポンスをブロックしないように改善

## 2026-03-27 (125)

### リファクタリング

- **`auth/me` の重複ロジックを `verifyAndLoad()` に共通化** — JWT 検証・ベータアクセス確認・R2 プロフィール取得の処理が 2 箇所に重複していたため、`verifyAndLoad()` ヘルパーに一本化。判定結果を判別共用型 (`invalid` / `restricted` / `ok`) で表現し、呼び出し側の意図を明確化

## 2026-03-27 (124)

### リファクタリング

- **Cloudflare Cache キーを `buildCacheKey()` に共通化** — `ogp/route.ts`・`image-proxy/route.ts` でインライン定義されていた `sha256Hex(normalizeUrlForCache(url))` パターンを `r2.ts` の `buildCacheKey(origin, type, url)` に一本化

## 2026-03-27 (123)

### セキュリティ

- **JWT `exp` クレーム未設定時のバイパスを修正** — `verifyJwt` で `payload.exp` が `undefined` の場合に `undefined < number` が `false` を返し、有効期限なしトークンが通過していた問題を修正。`!payload.exp` チェックを追加して明示的に拒否するように変更
- **JWKS キャッシュ TTL を 15 分に短縮** — 1 時間では公開鍵のローテーション・失効が遅延するリスクがあるため、15 分に変更

## 2026-03-27 (122)

### リファクタリング

- **`article-utils.ts` の重複を整理** — `isLikelyJapanese` と `readingTime` で重複していた HTML タグ除去処理（`/<[^>]+>/g`）を `stripHtml` ヘルパーに、CJK 文字パターンを `CJK_PATTERN` / `CJK_WIDE_PATTERN` 定数に共通化

## 2026-03-27 (121)

### 新機能

- **カードレイアウトに読了時間を表示** — `ReadingTimeBadge` に `className` prop を追加し、`CardArticleItem` のフッターに読了時間（約〇分）を表示。リスト・マガジンフィーチャーレイアウトとの表示統一

## 2026-03-27 (120)

### simplify

- **重複コードを整理（URL パース・エンティティデコード）** — `content.ts` の `fixImageDimensions` / `fixExternalLinks` で同一だった URL パースパターンを `tryParseBase()` ヘルパーに共通化。`xml-parser.ts` の `safeUrl()` で重複していたエンティティデコード処理を既存の `unescapeHtml()`（`html.ts`）に委譲して重複を除去

## 2026-03-27 (119)

### simplify

- **未使用の AI キャッシュ関数を削除** — `ai-cache.ts` の `getAiCache` / `setAiCache`（コンテンツハッシュ方式）はどこからも参照されておらず、実際は `getAiCacheById` / `setAiCacheById`（articleId 方式）のみが使われていたため削除
- **`useFeedOperations` の重複エラー処理を統合** — `deleteFeed` / `renameFeed` で `if (!res.ok)` 分岐と `catch` ブロックが同一のエラーメッセージをセットしていた重複を `throw` に統一

## 2026-03-27 (118)

### simplify

- **`postProcess` から `transformXTweetEmbeds` を除去** — サーバー側では `theme='light'` 固定で変換されていたため、ダークモードユーザーの全文取得記事でツイートが常にライトテーマで表示されていた。クライアント側の `processContent()` がすでにユーザーのテーマで正しく変換するため、サーバー側の呼び出しは不要。`postProcess` の `theme` パラメータも削除
- **CLAUDE.md パイプライン文書を修正** — `fixExternalLinks` がパイプラインに含まれているが未記載だったため追加。ツイート埋め込みのクライアント側変換の注記を追記

## 2026-03-27 (117)

### セキュリティ

- **IPv6互換アドレスでの CGNAT SSRF バイパスを修正** — `isPrivateIPv4CompatibleIPv6()` が CGNAT 範囲 (100.64.0.0/10, RFC 6598) をチェックしていなかった。`[::6440:xxxx]` 形式の IPv4互換 IPv6 アドレスで SSRF 保護を回避できた問題を修正

## 2026-03-27 (116)

### リファクタリング

- **`useReadState` のフラッシュロジックを整理** — `beforeunload` と `visibilitychange` の2つの effect を1つに統合し、`serializeReadState()` ヘルパーで `saveReadState` と `sendBeacon` のボディ構築の重複を除去。`read-state/route.ts` の POST ハンドラで `extractIds()` ヘルパーを抽出して3配列の検証・フィルタを一本化

## 2026-03-27 (115)

### リファクタリング

- **Set トグルヘルパー `toggleSetItem` を `storage.ts` に集約** — `useReadState.ts` のファイルローカル関数を `storage.ts` の共有エクスポートへ移動し、`useUIState.ts` の `togglePinFeed` でも再利用。`useFilteredArticles.ts` の grace period `useEffect` にクリーンアップ関数を追加してタイマーリークを修正

## 2026-03-27 (114)

### リファクタリング

- **`ogp/route.ts` と `image-proxy/route.ts` の `new URL(request.url)` 二重解析を除去** — 各 `handleGet` 関数内で `request.url` を2回パースしていた箇所を、`reqUrl` を先に作成して `searchParams.get("url")` を取得するよう統一

## 2026-03-27 (113)

### リファクタリング

- **`useFeeds` の `/api/feeds` フェッチロジックを `fetchFeedsData` に集約** — `useEffect` と `refreshFeeds` で重複していた `fetch("/api/feeds")` + okチェック + JSON パースのロジックを `fetchFeedsData` コールバックに抽出して再利用。`replaceFeeds` 内の `.catch().finally()` チェーンも `async/await` に統一

## 2026-03-27 (112)

### リファクタリング

- **文字列バリデーションの二重チェックを一本化** — `feeds/route.ts` と `feeds/[id]/route.ts` で型チェックと空チェックを別々に行っていた2段階バリデーションを三項演算子で1行に統合。`read-state/route.ts` では POST ハンドラ内で毎回定義されていた定数4つをモジュールスコープへ移動

## 2026-03-27 (111)

### リファクタリング

- **`feeds/route.ts` の冗長な URL バリデーションを除去** — `discoverFeedUrl` の内部実装が既に `isValidFeedUrl` で検証済みであるため、呼び出し元での重複チェックを削除してコードを簡略化

## 2026-03-27 (110)

### リファクタリング

- **`fixImageDimensions` の srcset 処理を `transformSrcset` ヘルパーで統一** — 既存の `transformSrcset` ヘルパーが存在するにもかかわらず同じ split/map/filter/join ロジックを重複実装していた箇所を削除し、ヘルパーを再利用するよう修正。約 11 行の重複コードを削減

## 2026-03-27 (109)

### ドキュメント整備

- **`transformXTweetEmbeds` の E2E テストを追加** — X (Twitter) ツイート埋め込み変換関数のテストが欠落していたため、`content-extraction.spec.ts` に11件の回帰テストを追加。twitter.com / x.com URL からの変換、ライト/ダークテーマ、`dnt=true` / `loading=lazy` 付与、複数ツイート処理、クラス不一致時のスキップ等を検証

## 2026-03-27 (108)

### リファクタリング

- **`withBinarySession` ヘルパーを追加して `image-proxy` の認証パターンを統一** — `requireSession` + `applyRefreshedTokensToResponse` の手動ボイラープレートを `withBinarySession` に集約。他の Route Handler が使う `withSession` と対称なパターンになり、認証フローの一貫性が向上

## 2026-03-27 (107)

### バグ修正

- **JWT 検証失敗時に `tokens.user.id` へフォールバックしていた問題を修正** — `verifyJwt` が null を返した場合に認証エラーを返すよう変更。不正なトークンで R2 キーが不整合になるリスクを排除
- **`extractWithRegex` のサイト固有セレクターで貪欲マッチ正規表現を非貪欲に修正** — Qiita / Zenn (`znc`) / Schema.org / Shopify 等のパターンで `[\s\S]*` を `[\s\S]*?` に変更。ネストや複数出現で過剰なコンテンツが取得される問題を解消
- **`sanitizeHtml` で `<iframe>` 自己閉じタグも信頼チェックを適用** — 自己閉じ形式の iframe を無条件除去していた問題を修正。ペアタグと同様に `isTrustedIframeSrc()` で検証して信頼済みドメインのみ許可

## 2026-03-27 (106)

### リファクタリング

- **`isZennDevUrl` ヘルパーを抽出して Zenn ドメイン判定を一元化** — `transformZennMermaidEmbeds` と `extractWithRegex` で重複していた Zenn ドメイン判定を共通関数に集約。あわせて `extractWithRegex` が `pageUrl.includes("zenn.dev")` の部分文字列マッチ（`zenn.dev.evil.com` でバイパス可能）を使用していた問題を URL パース方式に統一
- **`isBetaAllowed` を `.some()` に簡略化** — `.map().includes()` による中間配列生成を排除

## 2026-03-27 (105)

### バグ修正

- **`scrapeFeed` の無効 CSS セレクタで cron がクラッシュする問題を修正** — `querySelectorAll` が `SyntaxError` をスローした際に例外を再スローしていたため、cron ジョブ全体が停止する恐れがあった。空の `items: []` を返す graceful degradation に変更
- **`extractWithRegex` の貪欲マッチ正規表現を非貪欲に修正** — `<article>`・`<main>`・`role="main"` 等の汎用セレクターで `[\s\S]*` を `[\s\S]*?` に変更。複数の同名タグが存在するページで最後のタグまで誤ってマッチし、余計なコンテンツが混入する問題を解消

## 2026-03-26 (104)

### バグ修正

- **LLM 生成 CSS セレクタの無効時に意味のあるエラーを記録** — `scrapeFeed` で `querySelectorAll` が `SyntaxError` をスローする場合、「CSS セレクタが無効です」という日本語メッセージを持つエラーに変換してからスローするよう修正。また `inferSelectors` でセレクタを R2 に保存する前に構文検証を追加し、無効なセレクタが永続化されてクロンジョブが繰り返し失敗するのを防止

## 2026-03-26 (103)

### セキュリティ

- **CSP `frame-src` に `platform.twitter.com` を追加** — X (Twitter) ツイート埋め込み（#100）追加時に CSP が更新されておらず、ブラウザが iframe を CSP 違反でブロックしていた問題を修正

## 2026-03-26 (102)

### リファクタリング

- **`applyCorePipeline` / `postProcess` の `reduce` パターンを逐次代入に変換** — 配列 + `reduce` によるパイプラインを `let` 変数の逐次代入スタイルに変更。デバッガーでのステップ実行が容易になり、無名関数ラッパーの生成も不要になった。処理順序・動作は変わらない

## 2026-03-26 (101)

### セキュリティ

- **OPML インポートの XML entity 展開制限** — `XMLParser` にエンティティ展開上限（深度 1・総数 1000・entity 数 50）を設定し、Billion Laughs（XML 爆弾）攻撃を防止

## 2026-03-26 (100)

### 新機能

- **X (Twitter) ツイート埋め込み** — 記事本文に含まれる `<blockquote class="twitter-tweet">` を自動検出し、platform.twitter.com の iframe 埋め込みに変換。ライト/ダークテーマにも対応

## 2026-03-26 (99)

### 新機能

- **閲覧履歴** — 記事を開くたびに自動で記録し、サイドバーの「履歴」から最新 50 件を閲覧順で確認できるように。同一記事は重複除去して先頭に移動。localStorage に永続化

## 2026-03-26 (98)

### バグ修正

- **OGP フェッチの User-Agent をブラウザライクに変更** — `/api/ogp` で使用していた `"Mozilla/5.0 (compatible; rss-reader/1.0)"` を bot 検出を回避できる完全な Chrome UA に変更。Qiita など一部サイトが bot らしい UA に対して 403 を返すか OGP を含まない別ページを返していたため、OGP 画像が取得できない問題を修正

## 2026-03-26 (97)

### バグ修正

- **スクロール時に記事本文の `<details>` アコーディオンが閉じる問題を修正** — `scrollProgress` を `useState` から DOM `ref` に変更し、スクロールのたびに React 再レンダリングが発生しないように修正。再レンダリングにより `dangerouslySetInnerHTML` の `innerHTML` が再設定され、`<details open>` の展開状態がリセットされていた

## 2026-03-26 (96)

### バグ修正

- **`normalizeUrlForCache` のイテレーション中削除バグを修正** — `searchParams.keys()` を `for...of` でイテレーションしながら `delete()` を呼ぶと後続キーがスキップされる問題を `Array.from()` で修正。複数の UTM パラメータが混在するURLでキャッシュキーにトラッキングパラメータが残留していた

### ドキュメント整備

- **`timeAgo` / `normalizeUrlForCache` の単体テストを追加** — 相対時刻フォーマット全パス（たった今・〇分前・〇時間前・〇日前・M月D日）と URL 正規化（UTM・広告パラメータ除去・パラメータソート・フラグメント除去）を網羅するテストケースを追加

## 2026-03-26 (95)

### 新機能

- **オフライン対応** — ネットワーク切断時にオフラインバナーを表示し、Service Worker がキャッシュした記事・フィードデータを引き続き表示できるように。`/api/articles` と `/api/feeds` を stale-while-revalidate 戦略でキャッシュ（キャッシュがあれば即座に返しつつバックグラウンドで更新）。SW キャッシュバージョンを `rss-v3` に更新

## 2026-03-26 (94)

### バグ修正

- **OGP プレビューカード挿入時の DOM 切り離しチェック修正** — フェッチ完了時に `anchor` 要素自体が DOM から切り離されているケース（ユーザーが記事を素早く切り替えた場合など）を正しく検出するよう `anchor.isConnected` チェックを追加。以前は親コンテナ (`el.isConnected`) のみ確認していたため、切り離された `anchor` の親に挿入を試みる可能性があった

## 2026-03-26 (93)

### リファクタリング

- **`FeedItem` の `onDelete` / `onTogglePin` プロップから `React.MouseEvent` を除去** — UI懸念事項（`stopPropagation`）をデータフック（`useFeedOperations`）から取り除き、`FeedItem` 内部のアクションボタンで一元管理するように変更

## 2026-03-26 (92)

### 新機能

- **記事本文内リンクの OGP プレビューカード** — 記事本文に含まれる「段落の中で単独で並んでいるリンク」を自動検出し、リンクの直下にサイトタイトル・説明・サムネイル画像付きのプレビューカードを展開表示するように

## 2026-03-26 (91)

### リファクタリング

- **`useArticleAi` の trivial ラッパー関数を削除** — `loadAiCache` / `saveAiCache`（各 1 行のラッパー）を除去し `aiLruCache` を直接呼ぶように変更（8 行削減）
- **`useUIState` の `loadLayout` / `loadFontSize` を共通化** — 繰り返しの「ストレージ取得 → 有効値確認 → デフォルト返却」パターンを `loadStoredEnum<T>` ヘルパーに統合

## 2026-03-26 (90)

### 新機能

- **Slack シェアボタンでアプリを自動起動** — 記事タイトルと URL をクリップボードにコピーした後、`slack://open` でネイティブ Slack アプリを自動的に開くように変更。任意のチャンネルに貼り付けるだけでシェアできる

## 2026-03-26 (89)

### リファクタリング

- **`/api/content` と `fetchArticleContent()` の重複ロジックを共通化** — HTML デコード・メインコンテンツ抽出・AI Markdown フォールバック・Cloudflare Cache 保存の処理が両ファイルに重複していた。`buildContentCacheKey()` と `extractAndCacheContent()` を `fetch-article-content.ts` に切り出し、`route.ts` はこれらを呼び出すように変更。今後この領域でバグが発生しても修正箇所が一箇所で済むようになった

## 2026-03-26 (88)

### 新機能

- **タイトルと画像の間をマウスドラッグで記事ナビゲーション** — 記事タイトル直下の区切り線エリアを左ドラッグで次の記事、右ドラッグで前の記事へ移動できるように。ホバー時に前後の記事タイトルと矢印を表示

## 2026-03-26 (87)

### バグ修正

- **`deleteFeed` / `renameFeed` のネットワークエラーを catch** — フィード削除・タイトル変更時にネットワーク障害が発生した場合、例外が未処理のまま伝播していた問題を修正。`try/catch` を追加してエラーメッセージを表示するよう対処

## 2026-03-26 (86)

### 新機能

- **全文取得ボタンの隣に「元記事を開く」ボタンを追加** — 本文が短い記事で表示される全文取得エリアに、元記事を新規タブで開くリンクボタンを横並びで追加

## 2026-03-26 (85)

### リファクタリング

- **`MAX_FEEDS_PER_USER` 定数を `shared-feed.ts` に統合** — `feeds/route.ts` と `feeds/import/route.ts` で重複定義されていた `MAX_FEEDS_PER_USER = 1000` を `src/lib/shared-feed.ts` に移動し、両ファイルからインポートする形に統一

## 2026-03-26 (84)

### リファクタリング

- **`useArticleAi` のリセットロジック重複を解消** — `resetAi` と `articleId` 変更 `useEffect` に同一の 5 行リセットコードが重複していたため、`resetAi` を先に定義して `useEffect` から呼び出す形に整理
- **`App.tsx` の `onFeedRenamed` ラッパーを削除** — `updateFeed` をそのまま渡せる同一シグネチャで、ラッパー関数が不要だったため削除。`Feed` 型インポートも合わせて除去

## 2026-03-26 (83)

### バグ修正

- **`useArticleAi` のレースコンディションを修正** — 記事切り替え中に AI フェッチが完了すると、別の記事に古い AI 結果が表示される問題を修正。`AbortController` で記事変更時・`resetAi` 時に進行中リクエストをキャンセルし、`AbortError` を静かに無視するよう修正

## 2026-03-26 (82)

### リファクタリング

- **`useKeyboardNav` の `]` / `[` キーハンドラを統合** — フィード切り替え処理（`buildFeedOrder` + `findIndex` + `onSelectFeed` + `showToast`）が両ケースで重複していたため、`delta` 変数で方向を分岐する単一 `case` に統合
- **`readBodyBytes` / `readBodyBytesPartial` のチャンクマージを抽出** — `src/lib/fetch.ts` の 2 関数で同一の `Uint8Array` 結合コード（7 行）が重複していたため `concatChunks` ヘルパーに抽出

## 2026-03-26 (81)

### リファクタリング

- **`fetchAndParseFeed`・`fetchAndScrapeWithSelectors` の記事ビルド重複を除去** — `readLatestArticles` → `existingById` マップ構築 → `buildArticle` 並列実行の 4 行が両関数に重複していたため `buildArticlesFromItems` ヘルパーに抽出。あわせて誤配置の JSDoc を整理

## 2026-03-26 (80)

### リファクタリング

- **`llm-feed-generator` の `any` 型を専用インターフェースに置換** — linkedom の型定義が DOM 標準と完全互換でないため `LDElement` / `LDDocument` の最小インターフェースをファイル内に定義し、6 箇所の `any` キャストと `eslint-disable` コメントを除去

## 2026-03-26 (79)

### リファクタリング

- **`buildPushPayload` の条件分岐を簡略化** — 3 つの早期 `return` を条件式 2 本 + 単一 `return` に統合。`count === 1` の場合は常に `singleFeed === true` であることを利用して重複チェックを除去
- **`mergeNewArticles` の `knownIds` 判定と切り詰めを簡略化** — `meta.knownIds && meta.knownIds.length > 0` を `meta.knownIds?.length` に短縮し、`slice` による切り詰め条件を `slice(-KNOWN_IDS_MAX)` の単一呼び出しに統合
- **`loadMoreFeedArticles` の中間変数 `currentPage` を削除** — `currentPage` は `nextPage` の計算にのみ使用されていたため、`(ref.get(feedId) ?? 1) + 1` とインライン化

## 2026-03-26 (78)

### バグ修正

- **ポーリング中の同時フェッチ競合状態を修正** — `useFeeds` の 5 分ポーリングで前回フェッチが完了する前に次のフェッチが実行される競合状態を修正。`isPollingRef` フラグを追加し、重複リクエストや `latestArticleIdRef` の不整合を防ぐ

## 2026-03-26 (77)

### リファクタリング

- **フェッチタイムアウト定数を `src/lib/fetch.ts` に一元化** — `10_000ms` の外部フェッチタイムアウトが `fetch-article-content.ts`・`image-proxy/route.ts`・`web-push.ts` の 3 箇所に重複定義されていた問題を修正。`DEFAULT_FETCH_TIMEOUT_MS` を `src/lib/fetch.ts` にエクスポートし、各ファイルからインポートするよう変更

## 2026-03-26 (76)

### リファクタリング

- **ストリーム読み取りの重複コードを除去** — `app/api/ogp/route.ts` と `app/api/image-proxy/route.ts` に存在していた inline ストリーム読み取りループを、既存の `readBodyBytesPartial()` / `readBodyBytes()` ヘルパーに置き換え。合計 ~40 行のコード削減。`readBodyBytes` / `readBodyBytesPartial` の戻り型を `Uint8Array<ArrayBuffer>` に明示化
- **`unescapeHtml` の二重呼び出しを修正** — `/api/ogp` キャッシュヒット時に `unescapeHtml(data.image)` を 2 回呼んでいた箇所を 1 回に修正

## 2026-03-26 (75)

### バグ修正

- **`/api/image-proxy` キャッシュキー正規化漏れを修正** — 画像 URL に UTM パラメータ等のトラッキング情報が付いている場合、同一画像が別々にキャッシュされていた問題を修正。`normalizeUrlForCache()` をキャッシュキー生成に適用し、`/api/content` および `/api/ogp` と同じ正規化ロジックに統一
- **`fetchArticleContent()` キャッシュキー不整合を修正** — `/api/content` Route Handler は `normalizeUrlForCache()` を適用してキャッシュキーを生成していたが、`fetchArticleContent()` ヘルパーは生の URL をそのままハッシュしていた。この不整合により、両コードパスが同一記事を別々にキャッシュしてしまう問題を修正

## 2026-03-26 (74)

### セキュリティ

- **IPv6 リンクローカルアドレス判定の改善** — SSRF 対策の `isPrivateHost()` で `fe80::/10` 範囲の判定を `startsWith` の手動列挙 4 件からビット演算 `(firstGroup & 0xffc0) === 0xfe80` に変更。専用ヘルパー `isIPv6LinkLocal()` を追加し、境界値の正確さと保守性を向上

## 2026-03-26 (73)

### バグ修正

- **キャッシュキー URL 正規化** — `utm_source` / `utm_medium` 等のトラッキングパラメータが異なるだけの同一記事 URL が別々にキャッシュされていた問題を修正。`normalizeUrlForCache()` を `src/lib/url.ts` に追加し、`/api/content` と `/api/ogp` の両エンドポイントで使用。パラメータ順序の違いやフラグメント (`#section`) の有無も正規化する

## 2026-03-26 (72)

### リファクタリング

- `readBodyBytesPartial` ヘルパーを `src/lib/fetch.ts` に追加し、`discoverFeedUrl` 内の 20 行のインラインバイト読み込みループを 3 行に簡略化

## 2026-03-26 (71)

### 新機能

- **RSS のないサイトへの LLM フィード自動生成** — RSS が見つからないサイトを登録しようとした際、Workers AI (llama-3.1-8b) がページの `<a>` タグ構造（href / テキスト / クラス / 祖先 5 段）を解析して記事リンクの CSS セレクタを推論。以降の定期取得はそのセレクタで HTML をスクレイプして記事を更新する。`src/lib/llm-feed-generator.ts` を新規追加

## 2026-03-26 (70)

### バグ修正

- **YouTube 埋め込みエラー時のフォールバックリンク追加** — エラー 153 等で埋め込み動画が再生できない場合でも「YouTube で見る ↗」リンクを表示するよう改善。動画オーナーが埋め込みを制限している場合でも直接 YouTube で視聴できるようになった

## 2026-03-26 (69)

### バグ修正

- **YouTube Live URL の埋め込み対応** — `youtube.com/live/VIDEO_ID` 形式の URL が YouTube 動画として認識されず埋め込みが表示されなかった問題を修正。E2E テストに YouTube URL パターンと iframe レスポンシブラップの回帰テストを追加

## 2026-03-26 (68)

### パフォーマンス改善

- **OGP 負キャッシュ実装** — og:image が存在しないページへの繰り返しフェッチを防ぐため、空結果も 1 日間 Cloudflare Cache API にキャッシュするよう変更

## 2026-03-26 (67)

### リファクタリング

- `postProcess` / `postProcessMarkdownContent` の共通後処理ステップを内部ヘルパー `applyCorePipeline` に抽出し、コードの重複を解消

## 2026-03-26 (66)

### 新機能

- **複数キーワード AND 検索** — 検索バーでスペース区切りにより複数ワードを入力すると、全ワードを含む記事のみ表示（AND 検索）。各ワードは個別にハイライト表示される

## 2026-03-26 (65)

### 新機能

- **検索履歴** — 検索バーにフォーカスすると過去の検索クエリ（最大10件）がドロップダウン表示。Enter キーで現在のクエリを履歴に保存。クリックで再検索、× ボタンで個別削除。localStorage に永続化
- **シェア時にタイトルを含めてコピー** — Slack 用にコピー・タイトル + URL をコピーが `タイトル\nURL` 形式で出力するよう変更

## 2026-03-26 (64)

### 新機能

- **シェアボタンにプラットフォーム選択を追加** — X・Slack・LINE・URL コピーを選べるドロップダウンに変更。モバイルでは「システムで共有」（Web Share API）も表示。Slack は URL をクリップボードにコピーしてペーストで共有

## 2026-03-26 (63)

### バグ修正

- **KaTeX race condition 修正** — 記事をすばやく切り替えた際に古い記事の数式レンダリングが新しい記事の DOM を書き換える問題を修正。`cancelled` フラグと `el.isConnected` チェックで防止
- **KaTeX 翻訳切り替え後に数式が消える問題を修正** — `showTranslated` を `useEffect` の依存配列に追加

### リファクタリング

- **`FeedItem` モバイルメニューの色判定を改善** — `action.className?.includes('rose')` という文字列パースを廃止し、`Action` インターフェースに `variant?: 'danger'` を追加して意味を明示
- **`useUIState` の toast タイマー cleanup を追加** — アンマウント時に `clearTimeout` が呼ばれなかった問題を修正

## 2026-03-26 (62)

### リファクタリング

- **`useUIState` hook を新設** — `App.tsx` に散在していたテーマ・フォントサイズ・レイアウト・ピン留め・トースト・モバイルペイン・PWA インストールプロンプト・ヘルプ表示の各 UI 状態管理を `src/hooks/useUIState.ts` に抽出。`App.tsx` を 523行 → 420行 に削減

## 2026-03-26 (61)

### 新機能

- **数式レンダリング対応** — 記事本文中の LaTeX 数式（`$...$` / `$$...$$` / `\(...\)` / `\[...\]`）を KaTeX で自動レンダリング。技術ブログの数式が文字列のまま表示される問題を解消

## 2026-03-26 (60)

### リファクタリング

- **`useAuth` の堅牢性向上** — 初回フェッチがネットワークエラーで失敗した場合に `user` が `undefined`（ローディング中）のまま固まる問題を修正。`inFlight` フラグで `visibilitychange` とタイマーの同時リクエスト多重発行も防止

## 2026-03-26 (59)

### バグ修正

- **バックグラウンド復帰後にログアウトされる問題を修正** — `useAuth` が `/api/auth/me` をマウント時の1回しか呼ばず、タブ非表示中に access_token が切れた後の複数 API 同時リフレッシュで refresh_token ローテーションが競合していた。`visibilitychange` 時と10分ごとに再チェックするよう変更し、トークンを一元管理で先回りリフレッシュするよう修正

### 新機能

- **モバイルでフィードの操作メニューを追加** — ホバーが効かないタッチデバイスで操作ボタンが表示されなかった問題を解消。各フィード項目の右端に ⋮ ボタン（`lg:` 未満のみ表示）を追加し、タップでピン留め・全既読・更新・削除メニューを開けるよう対応

## 2026-03-26 (58)

### リファクタリング

- **記事本文フォントを Lora (serif) から IBM Plex Sans JP (sans-serif) に統一** — デザイン参照元の katasu.me が sans-serif のみ使用しているため Lora を削除。`next/font/google` の Lora 読み込みも除去し、記事本文 `.article-content` を `font-sans` に変更

## 2026-03-26 (57)

### バグ修正

- **フォントが実際にロードされていなかった問題を修正** — `globals.css` で `Reddit Sans` / `IBM Plex Sans JP` / `Lora` を指定していたが `layout.tsx` に読み込みコードがなくシステムフォントにフォールバックしていた。`next/font/google` で正しくロードし CSS 変数経由で参照するよう修正

## 2026-03-26 (56)

### バグ修正

- **ダークモード時のテキストコントラストを改善** — `text-default` / `text-soft` / `text-muted` / `text-faint` が zinc-400〜700 と暗すぎて読みにくかった問題を修正。各トークンを 1 段階明るく (zinc-300/400/500/600) 設定し直し、記事本文のコントラスト比を ~4:1 から ~7:1 (WCAG AA 準拠) に改善

## 2026-03-26 (55)

### バグ修正

- **記事内の相対 URL リンクが RSS リーダー自身のドメインに解決される問題を修正** — `fixExternalLinks` が `href` の相対パスを絶対 URL に変換していなかったため、例えば `<a href="/related">` が `https://rss.0g0.xyz/related` に解決されていた。`pageUrl` を受け取って `fixImageDimensions` と同様に相対パスを絶対 URL に変換するよう修正

## 2026-03-26 (54)

### リファクタリング

- **`useDebounce` フックを作成し検索デバウンス処理を分離** — `useFilteredArticles` 内のインライン `setTimeout` / `query` state を汎用の `useDebounce<T>(value, delay)` フックに置き換え。他フックからも再利用可能に

## 2026-03-26 (53)

### バグ修正

- **OPMLインポートのステータスメッセージが表示されない問題を修正** — インポートの成功・失敗メッセージがフィード追加フォームの `error` ステートを共用していたため、フォームが閉じた状態では一切表示されなかった。`importMessage` ステートを分離し、サイドバーフッターに3秒間表示するよう変更。成功・エラーで文字色を区別

## 2026-03-26 (52)

### バグ修正

- **inside-games.jp ギャラリー画像の見切れを修正** — `buildImageSlider` が付与した `width:100%;height:100%` インラインスタイルを `fixImageDimensions` が除去して `overflow:hidden` でクリップされていた問題を修正。ギャラリースライダーを `postProcess` の後に組み立てて `rewriteImageUrls` のみ適用するよう変更

## 2026-03-26 (51)

### リファクタリング

- **`FeedSidebar` のフィード操作 API を `useFeedOperations` フックに分離** — `addFeed` / `deleteFeed` / `renameFeed` / `handleImportFile` と関連 state を専用フックに抽出し、`FeedSidebar` を 511行 → 434行に削減

## 2026-03-26 (50)

### リファクタリング

- **`FeedSidebar` の push/install Props をオブジェクト型に統合** — 7 個のフラット Props (`canInstall`, `onInstall`, `pushSupported`, `pushSubscribed`, `pushLoading`, `pushError`, `onTogglePush`) を `install` / `push` の 2 オブジェクトにまとめ、Props インターフェースを簡素化

## 2026-03-26 (49)

### バグ修正

- **定期バッチの「Redirect without Location header」エラーを修正** — `fetchFollowSafeRedirects` が `304 Not Modified` を 3xx リダイレクトとして誤処理していた。`304` はリダイレクトではないのでそのまま返すよう修正

## 2026-03-26 (48)

### リファクタリング

- **`useFilteredArticles` フィルターを単一パスに統合** — 記事リストに対して連続実行していた複数の `.filter()` を 1 回のパスに統合し、無駄な配列生成を削減

## 2026-03-26 (47)

### バグ修正

- **`useFeeds` の `loadMoreFeedArticles` 不要再生成を解消** — `useCallback` の依存配列に `loadedFeedPages`（Map state）を含めていたため、ページ追加のたびに関数参照が再生成されていた。`useRef` でミラーリングして依存配列から除外

## 2026-03-26 (46)

### リファクタリング

- **`isTrustedIframeSrc` ルールをデータ化** — 長大な boolean 式を `TRUSTED_IFRAME_RULES` 定数（ホスト名リスト＋パスプレフィックスの配列）に置き換え。ドメインの追加・削除が 1 行で完結するように

## 2026-03-26 (45)

### リファクタリング

- **`shared-feed` R2 ページネーションの重複解消** — `listAllFeedHashes` と `buildFeedUserMap` で重複していた R2 カーソルページネーションロジックを `listPrefixedIds` ヘルパーに抽出

## 2026-03-26 (44)

### 新機能

- **フィード別過去記事ページ読み込み** — 共有フィードモデルの p2.json / p3.json... ページを UI から参照できるように。特定フィードを選択して記事一覧の末尾まで来たとき、サーバー側に未取得ページが残っていれば「過去の記事を読み込む」ボタンが表示される。`Feed` 型に `pageCount` フィールドを追加し、`assembleClientFeed` で `meta.pageCount` を含めて返すよう変更。`useFeeds` に `loadedFeedPages` 状態と `loadMoreFeedArticles` 関数を追加

## 2026-03-26 (43)

### リファクタリング

- **`useOgpCache` キャッシュ保存の重複解消** — `setOgpCache` コールバック内で条件分岐ごとに重複していた `storageSet` 呼び出しを、結果を `result` 変数にまとめて 1 回の呼び出しに統一
- **`useFilteredArticles` ボリュームトグルのヘルパー抽出** — `toggleUnreadOnly` / `toggleBookmarkOnly` で重複していた boolean トグル + localStorage 保存パターンを `boolToggleWithStorage` ヘルパー関数として抽出。`useMemo` 内の `selectedArticleId || gracePeriodId` 判定を `isActive` ヘルパーに抽出して可読性向上

## 2026-03-26 (42)

### バグ修正

- **`useArticleContent` OGP フェッチのレースコンディション修正** — 記事切り替え時に前の記事の OGP フェッチが完了すると、古い OGP 画像 URL が新しい記事に適用される問題を修正。`AbortController` を使用して記事変更時にフェッチを中断するよう変更。全文フェッチ（`fetchFullContent`）も同様に中断処理を追加

## 2026-03-26 (41)

### リファクタリング

- **`FeedItem` コンポーネント抽出** — `FeedSidebar.tsx` にインラインで定義されていた `FeedItem` コンポーネント（約 120 行）と `formatCount` ユーティリティ関数を `src/components/FeedItem.tsx` に独立ファイルとして抽出。`FeedSidebar.tsx` の行数が 663 → 521 行に削減

## 2026-03-26 (40)

### リファクタリング

- **`useReadState` の ref 統一** — `localReadRef` / `localBookmarkRef` / `localReadingListRef` の 3 つに分散していた ref を `stateRef: { read, bookmarks, readingList }` の単一 ref オブジェクトに統合。`mergeServerSet` のシグネチャを `ref` 引数から `onMerge` コールバックに変更し、`saveReadState` も `ReadStateSets` 型 1 引数に整理

## 2026-03-26 (39)

### リファクタリング

- **`KeyboardShortcutsModal` コンポーネント抽出** — `App.tsx` にインラインで定義されていたキーボードショートカットヘルプモーダル（50行超の JSX）を `src/components/KeyboardShortcutsModal.tsx` に独立コンポーネントとして抽出。ショートカット定数を `SHORTCUTS` として分離し、`ReleaseNotesModal` と同じパターンに統一

## 2026-03-26 (38)

### セキュリティ

- **`sanitizeHtml` バックティック属性値対応** — `<img src=\`x\`onerror=alert(1)>` のようにバックティック区切りの属性値直後にインラインイベントハンドラが続くケースが除去されない問題を修正。ルックビハインドに `` ` `を追加し、値パターンに` `[^`]\*` `` を明示的に追加

## 2026-03-26 (37)

### リファクタリング

- **`url.ts` の URL バリデーション共通化** — `isValidFeedUrl` と `isValidHttpsUrl` で重複していた URL 長チェック・プロトコル検証・プライベート IP 検証ロジックを内部ヘルパー `isValidUrl(url, allowHttp)` に抽出し、2 関数はそれへの薄いラッパーに整理
- **`FeedSidebar.tsx` の未読バッジ重複解消** — フィードエラー有無で条件分岐していた 2 つの `<span>` を 1 つに統合。カウント表示の `count > 99 ? '99+' : count` パターンを `formatCount()` ヘルパーにまとめ、4 箇所の繰り返しを排除

## 2026-03-26 (36)

### リファクタリング

- **コンテンツ取得定数を一元化** — `CONTENT_CACHE_TTL_SEC` / `FETCH_TIMEOUT_MS` / `MAX_CONTENT_BYTES` が `fetch-article-content.ts` と `content/route.ts` の両方で同一値として重複していた問題を修正。`fetch-article-content.ts` のみで定義しエクスポート、`route.ts` でインポートするよう変更し、値の乖離によるキャッシュ不整合リスクを排除

## 2026-03-26 (35)

### リファクタリング

- **`cron/fetch.ts` の死コードを削除** — マイグレーション完了済みの `migrateUserFeedsToSubscriptions` 関数、未使用の後方互換エクスポート (`fetchAllUsers` エイリアス、`computeFeedHash` 等の再エクスポート) を削除。どこからもインポートされていなかったコードを整理

## 2026-03-25 (34)

### リファクタリング

- **cron フィード更新の R2 GET 削減** — `fetchAndParseFeed` が読んだ `existingLatest` を `mergeNewArticles` に渡すことで、フィード更新 1 回あたり `readLatestArticles` の二重 R2 GET を解消
- **Push 通知ループの `readFeedMeta` 再読み出しを削除** — `fetchAndUpdateSharedFeed` の戻り値を `{ newArticles, meta }` に変更し、`fetchAllFeeds` と `fetchSingleFeed` が同じ meta を再利用するよう変更。全フィード数分の余分な R2 GET を削減
- **`resetFeedSuccessState` ヘルパーを抽出** — `applyFeedSuccess` と `applyFeedNotModified` で重複していた 5 行（lastFetchedAt/fetchError/consecutiveErrors/lastErrorAt/rateLimitedUntil のリセット）を共通関数に集約し、`applyFeedNotModified` 自体を削除
- **`assembleClientFeed` の動的 import を静的 import に変換** — `app/api/feeds/route.ts` の `await import('@/lib/shared-feed')` を上部の静的 import に移動
- **`GET /api/articles?feed={hash}` の page=1 処理を最適化** — フィード指定かつページ未指定の場合に `getUserLatestArticles`（全購読フィード読み込み）を経由していた問題を修正。`readLatestArticles` で当該フィードのみ読むよう変更

## 2026-03-25 (33)

### セキュリティ

- **ページ指定記事取得の購読チェックを追加** — `GET /api/articles?feed={hash}&page=N` で購読していないフィードの記事が取得できた問題を修正。`readUserSubscriptions` で購読確認してから `readArticlePage` を呼ぶよう変更

### バグ修正

- **`mergeNewArticles` の重複チェック範囲を全 ID に拡大** — `latest.json` (最新100件) のみで重複チェックしていたため、100件超のフィードで古いページの記事が再挿入される問題を修正。`SharedFeedMeta.knownIds` に既知 ID を保持して全期間にわたる重複チェックを実現（上限 10,000件）
- **`cascadeOverflow` の再帰を `while` ループに変換** — 最大 499 回の再帰が Workers のスタックを圧迫する可能性を排除

### リファクタリング

- **`getUserLatestArticles` に 2,000 件の上限を追加** — 購読数 × 100件がメモリ上に無制限展開される問題を防止
- **`fetch.ts` の動的 `import()` を静的 import に統一** — `readLatestArticles` / `assembleClientFeed` の非対称な動的 import を解消
- **`migrateUserFeedsToSubscriptions` の不要な R2 二重読み込みを削除** — `writeFeedMeta` 直後の `readFeedMeta` 再実行を削除し、書き込み済み変数を再利用

## 2026-03-25 (32)

### バグ修正

- **`readFeedMeta` の JSON パースエラーハンドリングを追加** — `meta.json` が破損していた場合、`obj.json()` がスローしてフィード取得 cron 全体が停止する問題を修正。try-catch で包んで `null` を返すようにし、再作成を促すよう修正
- **マイグレーション時に `customTitle` が失われる問題を修正** — `migrateUserFeedsToSubscriptions` で旧 `feeds.json` の title が共有メタタイトルと異なる場合（ユーザーがカスタムタイトルを設定していた場合）、差分を `customTitle` として保持するよう修正

## 2026-03-25 (31)

### 新機能

- **フィード記事ストレージを共有化・永続化** — 記事を `feeds/{feedHash}/articles/latest.json` + `feeds/{feedHash}/articles/p{N}.json` に保存する共有ストレージへ刷新。従来はユーザーごとに `articles.json` (最大 500 件) に保存していたため、フィード更新時に古い記事が消失していた問題を解消。フィード URL が同一であれば複数ユーザー間でデータを共有し R2 容量を削減。記事保持上限を撤廃し全件を永続保持。購読情報は `users/{userId}/subscriptions.json` に分離。ID を UUID から sha256 ベースの決定論的 16 文字 hex に変更し、記事 ID がユーザー間・デバイス間で一致するよう統一

## 2026-03-25 (30)

### リファクタリング

- **日付範囲フィルターを localStorage に永続化** — `useFilteredArticles` の `dateRange` 設定がページ更新後にリセットされていた問題を修正。`STORAGE_KEYS.DATE_RANGE` キーに保存し、`unreadOnly` / `bookmarkOnly` / `sortOrder` と同様にセッションをまたいで設定が維持されるようにした

## 2026-03-25 (29)

### 新機能

- **タブ切り替え時の既読状態即時同期** — `useReadState` に `visibilitychange` イベントリスナーを追加。別タブを開くなどでページが非表示になった際、デバウンス中の既読・ブックマーク・後で読む状態をサーバーへ即時同期する。`beforeunload`（ページ閉じ時）だけでは補えなかったタブ切り替え時の状態ロストを防止

## 2026-03-25 (28)

### リファクタリング

- **`fetchAndParseFeed` ヘルパーを抽出** — `fetchUserArticles` と `fetchSingleFeed` で重複していた「フェッチ→パース→メタ更新→記事ビルド」ロジックを共通の `fetchAndParseFeed` 関数に集約。条件付きリクエスト（ETag/If-Modified-Since）は `options.conditional` フラグで制御

## 2026-03-25 (27)

### セキュリティ

- **OPML インポートの入力サニタイズを強化** — `extractFeeds` で取得した `title` をヌルバイト除去・500文字に切り詰め、`siteUrl`（`htmlUrl` 属性）を http/https スキームのみ許可するよう検証。`javascript:` など危険なスキームが保存されるのを防止

## 2026-03-25 (26)

### 新機能

- **ブックマークフィルタートグル** — 記事一覧ヘッダーに「★」ボタンを追加。押すと現在表示中のフィード内でブックマーク済み記事だけを絞り込んで表示できる（サイドバーの「ブックマーク」とは異なり、特定フィード内での絞り込みに対応）。キーボードショートカット `B`（Shift+b）でも切替可能。設定は localStorage に永続化

## 2026-03-25 (25)

### リファクタリング

- **`useReadState` のサーバーマージロジックを `mergeServerSet` ヘルパーに抽出** — ログイン後に `/api/read-state` から取得した既読・ブックマーク・後で読む状態を localStorage の Set にマージする処理が3回重複していた。共通の `mergeServerSet` 関数に抽出し、コードの重複を削減

## 2026-03-25 (24)

### ドキュメント整備

- **アーキテクチャ・コーディング規約ドキュメントを現状に同期** — `coding-conventions.md` の R2 ヘルパー API 名を旧名 (`readR2Json`/`writeR2Json`) から現在の実装 (`r2Get`/`r2Put`) に修正。`architecture.md` および `CLAUDE.md` のディレクトリ構造・API 一覧・R2 データ構造を実装済みの全ファイルに合わせて更新

## 2026-03-25 (23)

### 新機能

- **記事本文の外部リンクを新しいタブで開くように変更** — `fixExternalLinks` 関数を追加し、後処理パイプラインに組み込んだ。記事内の `<a>` タグに `target="_blank"` と `rel="noopener noreferrer"` を自動付与することで、記事を読みながらリンクを別タブで確認できるようになった。フラグメントのみのアンカーリンク (`#section`) はそのまま保持する

## 2026-03-25 (22)

### バグ修正

- **`fetchArticleContent` の TextDecoder に try-catch を追加** — 不正な charset 値が `detectCharset` から返された場合に `TextDecoder` が `RangeError` でクラッシュしていた問題を修正。`/api/content` と同様に UTF-8 フォールバックを実装
- **`fetchArticleContent` の `cfCache.put` にエラーハンドラを追加** — `/api/content` ルートには `.catch()` があったが `fetchArticleContent` ヘルパーにはなかった不一致を解消
- **`/api/content` のアップストリーム 4xx を正しいステータスコードで返すように修正** — 上流が 404 / 403 / 429 等を返した場合でも常に 502 を返していた問題を修正。4xx はそのまま転送し、5xx のみ 502 にマップするよう変更

## 2026-03-25 (21)

### セキュリティ

- **`sanitizeHtml` にフォーム要素の除去を追加** — RSS 記事内の `<form>` / `<input>` / `<select>` / `<textarea>` 要素がフィッシング攻撃（クレデンシャル詐取・偽 UI）に悪用できた問題に対処。`<form>` はタグ枠のみ除去して内部コンテンツを保持し、入力フィールド系要素は要素ごと除去する

## 2026-03-25 (20)

### リファクタリング

- **`applyBasePostProcess` を削除してパイプラインをフラット化** — `postProcess` と `postProcessMarkdownContent` それぞれが独立した steps 配列を持つ形に変更し、中間ヘルパーを通じたネストを解消して全処理ステップを一箇所で把握できるよう可読性を向上

## 2026-03-25 (19)

### バグ修正

- **`waitUntil` の `cfCache.put` にエラーハンドラを追加** — `content` / `ogp` / `image-proxy` ルートで Cloudflare Cache API への保存が失敗してもサイレントに無視されていた問題を修正。`.catch()` でエラーをログ出力するよう統一

## 2026-03-25 (18)

### リファクタリング

- **`useReadState` の toggle 関数を `toggleSetItem` ヘルパーに統合** — `toggleRead` / `toggleBookmark` / `toggleReadingList` で重複していた「Set の追加/削除 + localStorage 保存」ロジックをモジュールレベルの `toggleSetItem` ヘルパーに抽出し、3 箇所のコード重複を解消

## 2026-03-25 (17)

### リファクタリング

- **AI ルートの共通ロジックを `runAiJob` ヘルパーに抽出** — `summarize` と `translate` ルートで重複していた URL 検証・コンテンツ取得・キャッシュ確認・AI 実行・キャッシュ保存のロジックを `src/lib/ai-route-helper.ts` の `runAiJob` 関数に統合

## 2026-03-25 (16)

### リファクタリング

- **`postProcess` の共通ステップを `applyBasePostProcess` に切り出し** — `postProcess` と `postProcessMarkdownContent` が共有する `fixImageDimensions` / `rewriteImageUrls` / `wrapTables` / `sanitizeHtml` の 4 ステップを private ヘルパーにまとめて重複を解消

## 2026-03-25 (15)

### リファクタリング

- **`ai-cache` の重複 SHA-256 関数を統合** — `ai-cache.ts` 内に独自定義されていた `hashText()` を削除し、`r2.ts` の `sha256Hex()` を import して再利用するよう変更

## 2026-03-25 (14)

### ドキュメント整備

- **`MAX_ARTICLES` の記述を 2000 → 500 に修正** — `articles.json` の最大件数をコードから 2000 → 500 に削減した際、`CLAUDE.md`・`README.md`・`.claude/rules/architecture.md` の記述が更新されず不整合が生じていた。3 ファイルの記述を実装値（500）に合わせて修正

## 2026-03-25 (13)

### セキュリティ

- **プッシュ通知エンドポイント登録に SSRF 対策を適用** — `POST /api/push/subscribe` のエンドポイント URL 検証が HTTPS チェックのみで、プライベート IP レンジへのリクエストを許していた。`isValidHttpsUrl` を新設し、フィード URL と同様のプライベート IP・ループバック・リンクローカル拒否ロジックを適用

## 2026-03-25 (12)

### セキュリティ

- **cron の RSS フェッチにリダイレクト安全検証を適用** — `fetchViaBinding` が外部 URL に対して `fetchWithTimeout`（リダイレクトを素通り）を使っていたため、正規フィード URL からプライベート IP へのリダイレクトで SSRF が成立しえた。`fetchFollowSafeRedirects` に切り替え、各リダイレクト先を `isValidFeedUrl` で検証するよう修正

## 2026-03-25 (11)

### リファクタリング

- **`parseJsonBody` を Result 型に変更** — 戻り値を `T | NextResponse` から `{ ok: true; data: T } | { ok: false; error: NextResponse }` に変更し、`instanceof NextResponse` チェックを不要にした。全 7 つの Route Handler 呼び出し箇所を `if (!parsed.ok) return parsed.error` パターンに統一

## 2026-03-25 (10)

### バグ修正

- **手動リフレッシュ後に ETag/Last-Modified が保存されない問題を修正** — `fetchSingleFeed` が成功時にレスポンスの `ETag` / `Last-Modified` ヘッダーを feeds.json に書き戻していなかったため、次回 cron 実行時の条件付きリクエスト（304 Not Modified）が効かなかった問題を修正

## 2026-03-25 (9)

### リファクタリング

- **`readBodyBytes` ヘルパーを `src/lib/fetch.ts` に抽出** — `app/api/content/route.ts` と `src/lib/fetch-article-content.ts` で重複していた ReadableStream ボディ読み取りロジック（チャンク蓄積・サイズ超過チェック・`Uint8Array` 結合）を共通ヘルパーとして集約

## 2026-03-25 (8)

### バグ修正

- **`Retry-After: 0` テストの不整合を修正** — `cb99f93` で実装を「0 秒 = 即再試行可 (0ms)」に変更した際にテスト期待値が更新されず、E2E テストが失敗していた問題を修正

## 2026-03-25 (7)

### セキュリティ

- **SVG `<use>` href URL デコード検証** — フラグメント参照の判定前に `decodeURIComponent()` を適用し、`%23icon` のような URL エンコードされた同一ドキュメント参照が誤って除去されなくなった。不正なエンコード（単独 `%`）も try/catch で安全に処理
- **`Retry-After: 0` の正常処理** — `parseRetryAfter()` の判定を `seconds > 0` から `seconds >= 0` に修正し、0 秒（即座再試行）を正しく扱えるようにした

## 2026-03-25 (6)

### リファクタリング

- **`timeAgo` を `article-utils.ts` に移動** — `ArticleList.tsx` にインライン定義されていた `timeAgo` 関数をユーティリティモジュールへ移動。合わせて 1 分未満の記事に「0分前」と表示されていたバグを修正し「たった今」を返すよう改善。未来日時（時計ズレ等）も「たった今」として正しく処理

## 2026-03-25 (5)

### セキュリティ

- **XSS フィルター強化** — `hasDangerousScheme()` の制御文字除去を先頭のみから文字列全体に変更。スキーム名中に埋め込まれた制御文字（例: `javascript\x00:`）によるバイパスを防止
- **charset フォールバック追加** — `TextDecoder` に非対応の charset が渡された場合の `RangeError` を捕捉し UTF-8 でフォールバック。非標準 charset を指定するページでの記事取得失敗を防止

## 2026-03-25 (4)

### セキュリティ

- **SVG 拒否強化** — image-proxy で `image/svg+xml` のみ拒否していたのを `image/svg`・`application/svg+xml` などの非標準形式も拒否するよう修正
- **iframe HTTP 禁止** — `isTrustedIframeSrc` で HTTP iframe を禁止し HTTPS のみ許可。中間者攻撃によるコンテンツ差し替えを防止

## 2026-03-25 (3)

### セキュリティ・改善

- **AI エンドポイントのサーバー側コンテンツ取得** — 要約・翻訳時にフロントエンドから HTML 本文を送信しなくなった。サーバーが URL を受け取り Cloudflare Cache 経由でコンテンツを取得する

## 2026-03-25 (2)

### 機能改善

- **sticky AI モード廃止** — 記事を切り替えても前の記事の要約/翻訳状態を引き継がなくなった
- **日本語以外の記事を自動翻訳** — 記事を開いた時に言語を判定し、非日本語なら自動で翻訳を実行
- **要約は全文コンテンツを優先** — 要約ボタン押下時に全文未取得なら先にフェッチしてから要約
- **翻訳を本文置き換え形式に変更** — 翻訳結果を別パネルではなく記事本文エリアに表示
- **翻訳/原文トグル** — 翻訳表示中に「翻訳」「原文」ボタンで切り替え可能

## 2026-03-25

### 新機能

- **リリースノート閲覧** — サイドバーからリリースノートを確認できるようになりましたわ
- **画像スライダー改善** — PC でも prev/next ボタンで操作可能に。モバイルで複数枚飛ばしされる問題を修正

### リファクタリング

- `OGP キャッシュロジック` を `useOgpCache` フックに抽出
- `toArray` ヘルパーの重複を解消
- `useReadState` の重複 ref を削除
- ポーリング内の重複フェッチを `fetchAndSetArticles` に統合
- `ArticleView` のロジックをカスタムフックに抽出
- `fetchWithTimeout` を cron に統合
- 既読/ブックマーク/後で読む状態管理を `useReadState` フックに抽出

### バグ修正

- `refreshFeeds` の feeds 再取得で HTTP エラーを見落としていた問題を修正

### セキュリティ

- OPML 再帰深度制限と HEIC MIME タイプ誤りを修正
- OGP フェッチ時の SSRF リダイレクト修正
- フィードディスカバリーの SSRF リダイレクト修正
- JSON パースエラーハンドリング強化
- CGNAT アドレス範囲の SSRF 対策追加
- 入力値のバリデーション強化
- `<use>` 要素の外部参照を適切に制限
- 入力型バリデーションの強化
- 画像プロキシの SVG XSS 対策
- ReDOS 脆弱な正規表現を修正
- SVG アニメーション注入対策
- URL 長さバリデーション追加
- `javascript:` スキームの entity エンコードバイパス修正
- イベントハンドラの引用符属性バイパス修正

### 機能追加

- **Error Boundary** — コンポーネントエラーを安全にキャッチ
- **HTTP 条件付きリクエスト（304）** — ETag / Last-Modified で帯域節約
- **JSON Feed サポート** — JSON Feed 1.0 / 1.1 を購読可能に
- **429 レートリミット対応** — 一時的なフェッチ停止で過負荷を防止
- **JSON Feed リンク自動検出** — ページから JSON Feed URL を発見
- **画像一括ダウンロード** — 記事内の画像をまとめて保存
- **ギャラリー表示** — inside-games.jp 等のサムネイルリストを自動スライダー化
