# リリースノート

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
