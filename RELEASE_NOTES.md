# リリースノート

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
