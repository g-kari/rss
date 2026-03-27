/**
 * リリースノートの内容。Workers 環境では fs が使えないため、ビルド時にバンドルされる定数として保持する。
 * 新しいリリースを追加する際は RELEASE_NOTES.md と同時にここも更新すること。
 */
export const RELEASE_NOTES_MARKDOWN = `# リリースノート

## 2026-03-27 (164)

### 新機能
- **プッシュ通知テスト送信** — \`POST /api/push/test\` でサーバーから即時テスト通知を送信できるようになった。VAPID 未設定・サブスクリプションなしの場合は明示的なエラーメッセージを返す。UI では購読中のベルアイコンを右クリックするとテスト送信を実行できる

## 2026-03-27 (163)

### バグ修正
- **エンゲージメントバッファの重複送信を修正** — \`flushBuffer\` で \`Promise.all\` を使っていたため、一部リクエストが成功・一部が失敗した場合でもバッファ全体が保持され、次回フラッシュ時に成功済みエントリが重複送信される問題があった。\`Promise.allSettled\` に切り替え、失敗したエントリのみ保持するよう修正

## 2026-03-27 (162)

### リファクタリング
- \`articles\` 配列の線形検索を \`Map\` キャッシュに最適化 — \`handleToggleBookmark\` / \`handleToggleReadingList\` / \`handleToggleLike\` の \`articles.find()\` O(n) を \`articleMap.get()\` O(1) に変更

## 2026-03-27 (161)

### 新機能
- **NSFWモード長押し解除** — NSFWモード中に「RSS」ロゴを 600ms 長押しするとモードが解除されるようになった

### バグ修正
- **フィードメニューのタップ貫通を修正** — スマホでフィードのサブメニューを開いているとき、メニュー外タップが背景の要素に届いてしまう問題を修正。fixed backdrop で確実にイベントを遮断するよう変更した

## 2026-03-27 (160)

### リファクタリング
- **FeedItem アイコン重複解消** — NSFW・フィルターアイコンの SVG が \`actions\` 配列と JSX バッジの両方で重複定義されていたため、\`NsfwIcon\` / \`FilterIcon\` コンポーネントに抽出して一元化

## 2026-03-27 (159)

### 新機能
- **NSFWモード** — フィード単位で NSFW フラグを設定でき、NSFW モード時のみ記事が表示される。フィードの操作メニューから「NSFW設定」でトグル可能。「RSS」ロゴを2秒以内に5回連打するとお目々が開くアニメーションを経て NSFW モードへ移行し、ロゴが赤色に変わる

## 2026-03-27 (158)

### バグ修正
- **\`safeUrl\` が HTML エンティティをデコードした URL を返すよう修正** — XSS バイパス検証後に元の \`url\`（エンティティ未解決）を返していたため、\`&amp;\` 等を含むリンクが二重エンコードされる問題を修正
- **\`PATCH /api/feeds/:id\` のタイトル型チェックを改善** — \`title\` に文字列以外が渡された場合に「title must be a string」を返すよう修正
- **cron の publishedAt ソートで \`localeCompare\` を比較演算子に置き換え** — ISO 8601 文字列のロケール依存を排除

## 2026-03-27 (157)

### リファクタリング
- **\`useMemo\` イテレーション重複を削減** — \`useReadingHistory\` で \`historyIds\` / \`historyOrder\` を別々に map していた 2 つの \`useMemo\` を 1 つに統合。\`App.tsx\` の \`bookmarkCount\` / \`readingListCount\` / \`historyCount\` を個別 filter × 3 から 1 ループで計算する \`useMemo\` に統合

## 2026-03-27 (156)

### リファクタリング
- **日付降順ソート比較関数を \`article-utils\` に集約** — \`shared-feed.ts\`・\`useFeeds.ts\`・\`api/articles/route.ts\` の3箇所に重複していたインライン比較関数を \`compareByDateDesc\` として \`src/lib/article-utils.ts\` に抽出

## 2026-03-27 (155)

### バグ修正
- **テーマ切り替え後に画像スライダーコントロールが消える問題を修正** — \`injectSliderControls\` の useEffect deps が \`storedContent\` / \`article?.id\` のみで \`processedContent\` を見ていなかったため、テーマ切り替えなど DOM 再レンダリング後に prev/next ボタンとホイール操作が失われていた。\`processedContent\` を deps に加えて再注入を確実にした。あわせて \`.rss-slider-slide img\` の CSS に \`!important\` を追加し、\`.article-content img { width: auto !important }\` による幅上書きを解消

## 2026-03-27 (154)

### バグ修正
- **\`saveFilter\` の \`fetch\` を \`apiFetch\` に統一** — \`App.tsx\` と \`FeedSidebar.tsx\` のフィルター保存処理で生の \`fetch\` を使っていたため、認証チェック完了前にリクエストが飛ぶレースコンディションと 401 時の自動リトライが機能しなかった問題を修正

## 2026-03-27 (153)

### リファクタリング
- **\`recommendation.ts\` の \`Promise.allSettled\` 結果収集を \`fulfilledValues\` ヘルパーに集約** — \`generateWebSearchFeeds\`・\`generatePopularFeeds\`・\`generateLinkDiscoveryFeeds\` の3関数で重複していた「fulfilled かつ非 null の値を収集」パターンを \`fulfilledValues<T>()\` に抽出。\`generatePopularFeeds\` のコールバック内 mutation も return パターンに統一。合計 14 行削減

## 2026-03-27 (152)

### リファクタリング
- **記事フィルタリングを \`matchesKeywordFilter\` 直接呼び出しに簡素化** — \`GET /api/articles\` の全件取得パスで各記事を \`applyKeywordFilter([a], filter).length > 0\` とシングルトン配列にラップしていた処理を \`matchesKeywordFilter(a, filter)\` の直接呼び出しに変更。\`filterMap.size > 0\` の事前チェックも不要になり3行削減

## 2026-03-27 (151)

### 新機能
- **全文検索で author・categories も対象に** — 記事一覧の検索クエリが \`title\`・\`summary\` に加えて著者名（\`author\`）とカテゴリタグ（\`categories\`）もヒット対象になりました。複数ワードの AND 検索もフィールドをまたいで機能します。\`articleMatchesQuery()\` として \`article-utils.ts\` に純粋関数として切り出し、21 件のテストケースで検証

## 2026-03-27 (150)

### テスト
- **巨大フィードのエンティティ展開制限リグレッションテスト追加** — \`maxTotalExpansions\` / \`maxExpandedLength\` 緩和（98658e2）の回帰防止テストを \`e2e/xml-parser.spec.ts\` に追加。150件×700エンティティと200件×長い description で旧制限（100,000 / 500,000）を超えるケースを検証

## 2026-03-27 (149)

### 新機能
- **エンゲージメントスコアの単体テスト追加** — \`scoreFeedEngagement\` と \`topScoredFeeds\` の全挙動を検証する \`e2e/engagement-score.spec.ts\` を追加。アクション重み・時間減衰（半減期7日）・スコア集計・minScore フィルタリング・limit パラメータを 28 テストケースでカバー

## 2026-03-27 (148)

### 新機能
- **レコメンドにリンク発見（Link Discovery）を追加** — ブックマーク・いいね・全文取得済み記事の Cloudflare Cache キャッシュから HTML を読み、本文内リンクから RSS フィードを発見する。外部 fetch なしでキャッシュのみ参照し、他 2 ソースと並列実行してマージ

## 2026-03-27 (147)

### 新機能
- **レコメンドに人気フィードランキングを追加** — 他ユーザーが多く購読しているフィードを \`source: "popular"\` として提案するように。Brave Search と並列実行し、feedUrl で重複を排除してマージ

## 2026-03-27 (146)

### 改善
- **トピック抽出モデルを Gemma 3 12B に変更** — \`llama-3.1-8b\` から \`gemma-3-12b-it\` に切り替え。日本語・英語混在タイトルの解析精度が向上。フィード提案は引き続き Brave Search API が担当

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
- **時間減衰スコアリングエンジンを追加** — アクション種別の重み（いいね5.0〜後で読む2.0）と半減期7日の指数減衰でフィードごとの関心度スコアを算出する \`scoreFeedEngagement()\` を実装

## 2026-03-27 (141)

### バグ修正
- **巨大RSSフィードの購読エラーを修正** — Cloudflare changelogのような大量の HTML エンティティ（\`&amp;\` 等）を含むフィードで \`Entity expansion limit exceeded\` エラーが発生していた問題を修正。エンティティ展開制限を 10 万→100 万に緩和し、あわせてフィード XML のサイズ上限（10MB）と 1 フィードあたりの最大記事数（500 件）を追加

## 2026-03-27 (140)

### バグ修正
- **記事一覧ヘッダーのボタン角丸を統一** — レイアウト切替・ソート・全て既読のアイコンボタンが \`rounded\`（角丸四角）、未読・★・日付のテキストボタンが \`rounded-full\`（ピル形状）と混在していた。アイコンボタンを \`rounded-full\` に変更してヘッダー内全ボタンを統一

## 2026-03-27 (139)

### リファクタリング
- **死んだ \`migrate-ids\` エンドポイントを削除** — UUID→sha256 ID 移行完了済みにもかかわらず残留していた \`GET /api/migrate-ids\` を削除。フロントエンドからの参照はなく、不要な攻撃対象を排除

## 2026-03-27 (138)

### 新機能
- **コードブロックのシンタックスハイライト** — 記事本文内の \`<pre><code>\` ブロックに \`highlight.js\` によるシンタックスハイライトを適用。JavaScript・TypeScript・Python・Go・Rust・Shell・CSS・HTML・JSON など約 30 言語を自動検出。GitHub Light / GitHub Dark 準拠のトークン色でライト/ダークテーマに対応

## 2026-03-27 (137)

### バグ修正
- **記事一覧の無限スクロールが動作しない問題を修正** — 記事が非同期でロードされる場合、初回レンダー時に \`articles=[]\` → \`hasMore=false\` → sentinel div が DOM に存在しないため \`IntersectionObserver\` が未セットアップのまま放置されていた。\`hasMore\` を \`useEffect\` の依存配列に追加し、sentinel が初めてマウントされたタイミングで observer を確実にセットアップするよう修正

## 2026-03-27 (136)

### 新機能
- **セッション期限切れ時にバナーを表示** — アクセストークンとリフレッシュトークンが両方失効してセッションが切れた場合、ランディングページに「セッションが期限切れになりました」バナーを表示。突然ランディングページに飛ばされた際の原因が分かるように。\`useAuth\` に \`sessionExpired\` 状態を追加し、ログイン済み→未認証への遷移を検出

## 2026-03-27 (135)

### 新機能
- **URL から単一記事をブックマーク・後で読むに保存** — サイドバーの「ブックマーク」「後で読む」セクション下の「+ URL を保存」から任意の URL を登録し、ブックマーク（BK）または後で読む（後で）に直接追加できるように。タイトルと OGP 画像を自動取得して記事として保存。\`POST /api/articles/save\` エンドポイントと \`users/{userId}/saved.json\` ストレージを新設

## 2026-03-27 (134)

### セキュリティ
- **\`scrapeFeed\` で抽出した記事リンクの URL スキームを検証** — LLM 生成フィードのスクレイピング処理で、\`javascript:\` 等の危険スキームを持つ \`href\` が記事リンクとして保存され XSS の踏み台になりうる問題を修正。\`http(s)://\` 以外の URL を除外するよう \`scrapeFeed\` に検証を追加（RSS の xml-parser が使う \`safeUrl()\` と同水準）

## 2026-03-27 (133)

### リファクタリング
- **\`useFeeds\` のポーリングロジックを \`pollNow\` ヘルパーに抽出** — 5分間隔ポーリングとオンライン復帰時の即時フェッチで重複していたコードを \`pollNow\` 関数に一本化。併せて、復帰時フェッチで \`latestArticleIdRef\` を \`fetchAndSetArticles\` の完了後に読んでいたバグ（新着カウントが常に 0 になる）を修正

## 2026-03-27 (132)

### リファクタリング
- **\`saveJson\` ヘルパーを追加し、散在する \`storageSet(key, JSON.stringify(...))\` パターンを統一** — \`storage.ts\` に \`saveJson<T>(key, value)\` を追加し、\`useOgpCache\`・\`useSearchHistory\`・\`useReadingHistory\` の 3 フックで使用していた手動の JSON.stringify パターンを置き換え

## 2026-03-27 (131)

### 新機能
- **オフライン時のポーリングをスキップ・復帰時に即座に更新** — \`useFeeds\` に \`useOnlineStatus\` を組み込み、オフライン中は5分ポーリングをスキップして無駄なネットワークリクエストを抑制。オフライン → オンライン復帰時は即座に記事を再取得して新着件数を更新するよう改善

## 2026-03-27 (130)

### バグ修正
- **Qiita など CDN の長い OGP 画像 URL が取得できない問題を修正** — \`og:image\` の URL 長チェックに汎用 \`MAX_URL_LENGTH\`（2048文字）を使っていたため、imgix が生成する長い URL（Qiita の記事で ~2700文字）が弾かれていた。OGP 画像専用の上限 \`MAX_OGP_IMAGE_URL_LENGTH\`（8192文字）を追加して解消
- **Qiita 記事内の画像が表示されない問題を修正** — 記事 HTML の \`src\` 属性に \`&amp;\` が含まれる場合（imgix CDN など）、そのまま \`encodeURIComponent\` すると image-proxy 経由で \`amp;auto\` 等のパラメータ名になり imgix の署名検証（\`s=\`）が失敗していた。\`rewriteImageUrls\` で URL 抽出後に \`unescapeHtml\` を適用して \`&\` に変換してから \`encodeURIComponent\` するよう修正

## 2026-03-27 (129)

### リファクタリング
- **Push 設定の R2 キー生成を \`userPushKey()\` に集約** — \`users/\${userId}/push.json\` のキー文字列が \`push/subscribe\`・\`push/unsubscribe\`・\`push/status\` の各 Route Handler と \`cron/fetch.ts\` の計4箇所に散在していたため、\`r2.ts\` に \`userPushKey(userId)\` ヘルパーを追加して統一

## 2026-03-27 (128)

### リファクタリング
- **\`loadSet()\` を \`loadJson()\` で内部実装** — \`storage.ts\` の \`loadSet\` が独自に行っていた try-catch + JSON.parse パターンを \`loadJson<string[]>(key, [])\` を使って1行に簡略化し、\`loadJson\` との重複を排除

## 2026-03-27 (127)

### リファクタリング
- **\`localStorage\` JSON 読み込みを \`loadJson()\` ヘルパーに共通化** — \`useSearchHistory\` / \`useReadingHistory\` / \`useOgpCache\` で同一の try-catch + JSON.parse + fallback パターンが重複していたため、\`storage.ts\` に \`loadJson<T>(key, fallback)\` ヘルパーを追加して統一

## 2026-03-27 (126)

### リファクタリング
- **\`ai-route-helper\` の型統一とキャッシュ保存をバックグラウンド化** — \`cacheType\` パラメータの型を inline リテラル型 \`"summary" | "translation"\` から共通型 \`AiMode\` に統一。AI 結果の R2 キャッシュ保存を \`await\` から \`ctx.waitUntil()\` に変更し、クライアントへのレスポンスをブロックしないように改善

## 2026-03-27 (125)

### リファクタリング
- **\`auth/me\` の重複ロジックを \`verifyAndLoad()\` に共通化** — JWT 検証・ベータアクセス確認・R2 プロフィール取得の処理が 2 箇所に重複していたため、\`verifyAndLoad()\` ヘルパーに一本化。判定結果を判別共用型 (\`invalid\` / \`restricted\` / \`ok\`) で表現し、呼び出し側の意図を明確化

## 2026-03-27 (124)

### リファクタリング
- **Cloudflare Cache キーを \`buildCacheKey()\` に共通化** — \`ogp/route.ts\`・\`image-proxy/route.ts\` でインライン定義されていた \`sha256Hex(normalizeUrlForCache(url))\` パターンを \`r2.ts\` の \`buildCacheKey(origin, type, url)\` に一本化

## 2026-03-27 (123)

### セキュリティ
- **JWT \`exp\` クレーム未設定時のバイパスを修正** — \`verifyJwt\` で \`payload.exp\` が \`undefined\` の場合に \`undefined < number\` が \`false\` を返し、有効期限なしトークンが通過していた問題を修正。\`!payload.exp\` チェックを追加して明示的に拒否するように変更
- **JWKS キャッシュ TTL を 15 分に短縮** — 1 時間では公開鍵のローテーション・失効が遅延するリスクがあるため、15 分に変更

## 2026-03-27 (122)

### リファクタリング
- **\`article-utils.ts\` の重複を整理** — \`isLikelyJapanese\` と \`readingTime\` で重複していた HTML タグ除去処理（\`/<[^>]+>/g\`）を \`stripHtml\` ヘルパーに、CJK 文字パターンを \`CJK_PATTERN\` / \`CJK_WIDE_PATTERN\` 定数に共通化

## 2026-03-27 (121)

### 新機能
- **カードレイアウトに読了時間を表示** — \`ReadingTimeBadge\` に \`className\` prop を追加し、\`CardArticleItem\` のフッターに読了時間（約〇分）を表示。リスト・マガジンフィーチャーレイアウトとの表示統一

## 2026-03-27 (120)

### simplify
- **重複コードを整理（URL パース・エンティティデコード）** — \`content.ts\` の \`fixImageDimensions\` / \`fixExternalLinks\` で同一だった URL パースパターンを \`tryParseBase()\` ヘルパーに共通化。\`xml-parser.ts\` の \`safeUrl()\` で重複していたエンティティデコード処理を既存の \`unescapeHtml()\`（\`html.ts\`）に委譲して重複を除去

## 2026-03-27 (119)

### simplify
- **未使用の AI キャッシュ関数を削除** — \`ai-cache.ts\` の \`getAiCache\` / \`setAiCache\`（コンテンツハッシュ方式）はどこからも参照されておらず、実際は \`getAiCacheById\` / \`setAiCacheById\`（articleId 方式）のみが使われていたため削除
- **\`useFeedOperations\` の重複エラー処理を統合** — \`deleteFeed\` / \`renameFeed\` で \`if (!res.ok)\` 分岐と \`catch\` ブロックが同一のエラーメッセージをセットしていた重複を \`throw\` に統一

## 2026-03-27 (118)

### simplify
- **\`postProcess\` から \`transformXTweetEmbeds\` を除去** — サーバー側では \`theme='light'\` 固定で変換されていたため、ダークモードユーザーの全文取得記事でツイートが常にライトテーマで表示されていた。クライアント側の \`processContent()\` がすでにユーザーのテーマで正しく変換するため、サーバー側の呼び出しは不要。\`postProcess\` の \`theme\` パラメータも削除
- **CLAUDE.md パイプライン文書を修正** — \`fixExternalLinks\` がパイプラインに含まれているが未記載だったため追加。ツイート埋め込みのクライアント側変換の注記を追記

## 2026-03-27 (117)

### セキュリティ
- **IPv6互換アドレスでの CGNAT SSRF バイパスを修正** — \`isPrivateIPv4CompatibleIPv6()\` が CGNAT 範囲 (100.64.0.0/10, RFC 6598) をチェックしていなかった。\`[::6440:xxxx]\` 形式の IPv4互換 IPv6 アドレスで SSRF 保護を回避できた問題を修正

## 2026-03-27 (116)

### リファクタリング
- **\`useReadState\` のフラッシュロジックを整理** — \`beforeunload\` と \`visibilitychange\` の2つの effect を1つに統合し、\`serializeReadState()\` ヘルパーで \`saveReadState\` と \`sendBeacon\` のボディ構築の重複を除去。\`read-state/route.ts\` の POST ハンドラで \`extractIds()\` ヘルパーを抽出して3配列の検証・フィルタを一本化

## 2026-03-27 (115)

### リファクタリング
- **Set トグルヘルパー \`toggleSetItem\` を \`storage.ts\` に集約** — \`useReadState.ts\` のファイルローカル関数を \`storage.ts\` の共有エクスポートへ移動し、\`useUIState.ts\` の \`togglePinFeed\` でも再利用。\`useFilteredArticles.ts\` の grace period \`useEffect\` にクリーンアップ関数を追加してタイマーリークを修正

## 2026-03-27 (114)

### リファクタリング
- **\`ogp/route.ts\` と \`image-proxy/route.ts\` の \`new URL(request.url)\` 二重解析を除去** — 各 \`handleGet\` 関数内で \`request.url\` を2回パースしていた箇所を、\`reqUrl\` を先に作成して \`searchParams.get("url")\` を取得するよう統一

## 2026-03-27 (113)

### リファクタリング
- **\`useFeeds\` の \`/api/feeds\` フェッチロジックを \`fetchFeedsData\` に集約** — \`useEffect\` と \`refreshFeeds\` で重複していた \`fetch("/api/feeds")\` + okチェック + JSON パースのロジックを \`fetchFeedsData\` コールバックに抽出して再利用。\`replaceFeeds\` 内の \`.catch().finally()\` チェーンも \`async/await\` に統一

## 2026-03-27 (112)

### リファクタリング
- **文字列バリデーションの二重チェックを一本化** — \`feeds/route.ts\` と \`feeds/[id]/route.ts\` で型チェックと空チェックを別々に行っていた2段階バリデーションを三項演算子で1行に統合。\`read-state/route.ts\` では POST ハンドラ内で毎回定義されていた定数4つをモジュールスコープへ移動

## 2026-03-27 (111)

### リファクタリング
- **\`feeds/route.ts\` の冗長な URL バリデーションを除去** — \`discoverFeedUrl\` の内部実装が既に \`isValidFeedUrl\` で検証済みであるため、呼び出し元での重複チェックを削除してコードを簡略化

## 2026-03-27 (110)

### リファクタリング
- **\`fixImageDimensions\` の srcset 処理を \`transformSrcset\` ヘルパーで統一** — 既存の \`transformSrcset\` ヘルパーが存在するにもかかわらず同じ split/map/filter/join ロジックを重複実装していた箇所を削除し、ヘルパーを再利用するよう修正。約 11 行の重複コードを削減

## 2026-03-27 (109)

### ドキュメント整備
- **\`transformXTweetEmbeds\` の E2E テストを追加** — X (Twitter) ツイート埋め込み変換関数のテストが欠落していたため、\`content-extraction.spec.ts\` に11件の回帰テストを追加。twitter.com / x.com URL からの変換、ライト/ダークテーマ、\`dnt=true\` / \`loading=lazy\` 付与、複数ツイート処理、クラス不一致時のスキップ等を検証

## 2026-03-27 (108)

### リファクタリング
- **\`withBinarySession\` ヘルパーを追加して \`image-proxy\` の認証パターンを統一** — \`requireSession\` + \`applyRefreshedTokensToResponse\` の手動ボイラープレートを \`withBinarySession\` に集約。他の Route Handler が使う \`withSession\` と対称なパターンになり、認証フローの一貫性が向上

## 2026-03-27 (107)

### バグ修正
- **JWT 検証失敗時に \`tokens.user.id\` へフォールバックしていた問題を修正** — \`verifyJwt\` が null を返した場合に認証エラーを返すよう変更。不正なトークンで R2 キーが不整合になるリスクを排除
- **\`extractWithRegex\` のサイト固有セレクターで貪欲マッチ正規表現を非貪欲に修正** — Qiita / Zenn (\`znc\`) / Schema.org / Shopify 等のパターンで \`[\\s\\S]*\` を \`[\\s\\S]*?\` に変更。ネストや複数出現で過剰なコンテンツが取得される問題を解消
- **\`sanitizeHtml\` で \`<iframe>\` 自己閉じタグも信頼チェックを適用** — 自己閉じ形式の iframe を無条件除去していた問題を修正。ペアタグと同様に \`isTrustedIframeSrc()\` で検証して信頼済みドメインのみ許可

## 2026-03-27 (106)

### リファクタリング
- **\`isZennDevUrl\` ヘルパーを抽出して Zenn ドメイン判定を一元化** — \`transformZennMermaidEmbeds\` と \`extractWithRegex\` で重複していた Zenn ドメイン判定を共通関数に集約。あわせて \`extractWithRegex\` が \`pageUrl.includes("zenn.dev")\` の部分文字列マッチ（\`zenn.dev.evil.com\` でバイパス可能）を使用していた問題を URL パース方式に統一
- **\`isBetaAllowed\` を \`.some()\` に簡略化** — \`.map().includes()\` による中間配列生成を排除

## 2026-03-27 (105)

### バグ修正
- **\`scrapeFeed\` の無効 CSS セレクタで cron がクラッシュする問題を修正** — \`querySelectorAll\` が \`SyntaxError\` をスローした際に例外を再スローしていたため、cron ジョブ全体が停止する恐れがあった。空の \`items: []\` を返す graceful degradation に変更
- **\`extractWithRegex\` の貪欲マッチ正規表現を非貪欲に修正** — \`<article>\`・\`<main>\`・\`role="main"\` 等の汎用セレクターで \`[\\s\\S]*\` を \`[\\s\\S]*?\` に変更。複数の同名タグが存在するページで最後のタグまで誤ってマッチし、余計なコンテンツが混入する問題を解消

## 2026-03-26 (104)

### バグ修正
- **LLM 生成 CSS セレクタの無効時に意味のあるエラーを記録** — \`scrapeFeed\` で \`querySelectorAll\` が \`SyntaxError\` をスローする場合、「CSS セレクタが無効です」という日本語メッセージを持つエラーに変換してからスローするよう修正。また \`inferSelectors\` でセレクタを R2 に保存する前に構文検証を追加し、無効なセレクタが永続化されてクロンジョブが繰り返し失敗するのを防止

## 2026-03-26 (103)

### セキュリティ
- **CSP \`frame-src\` に \`platform.twitter.com\` を追加** — X (Twitter) ツイート埋め込み（#100）追加時に CSP が更新されておらず、ブラウザが iframe を CSP 違反でブロックしていた問題を修正

## 2026-03-26 (102)

### リファクタリング
- **\`applyCorePipeline\` / \`postProcess\` の \`reduce\` パターンを逐次代入に変換** — 配列 + \`reduce\` によるパイプラインを \`let\` 変数の逐次代入スタイルに変更。デバッガーでのステップ実行が容易になり、無名関数ラッパーの生成も不要になった。処理順序・動作は変わらない

## 2026-03-26 (101)

### セキュリティ
- **OPML インポートの XML entity 展開制限** — \`XMLParser\` にエンティティ展開上限（深度 1・総数 1000・entity 数 50）を設定し、Billion Laughs（XML 爆弾）攻撃を防止

## 2026-03-26 (100)

### 新機能
- **X (Twitter) ツイート埋め込み** — 記事本文に含まれる \`<blockquote class="twitter-tweet">\` を自動検出し、platform.twitter.com の iframe 埋め込みに変換。ライト/ダークテーマにも対応

## 2026-03-26 (99)

### 新機能
- **閲覧履歴** — 記事を開くたびに自動で記録し、サイドバーの「履歴」から最新 50 件を閲覧順で確認できるように。同一記事は重複除去して先頭に移動。localStorage に永続化

## 2026-03-26 (98)

### バグ修正
- **OGP フェッチの User-Agent をブラウザライクに変更** — \`/api/ogp\` で使用していた \`"Mozilla/5.0 (compatible; rss-reader/1.0)"\` を bot 検出を回避できる完全な Chrome UA に変更。Qiita など一部サイトが bot らしい UA に対して 403 を返すか OGP を含まない別ページを返していたため、OGP 画像が取得できない問題を修正

## 2026-03-26 (97)

### バグ修正
- **スクロール時に記事本文の \`<details>\` アコーディオンが閉じる問題を修正** — \`scrollProgress\` を \`useState\` から DOM \`ref\` に変更し、スクロールのたびに React 再レンダリングが発生しないように修正。再レンダリングにより \`dangerouslySetInnerHTML\` の \`innerHTML\` が再設定され、\`<details open>\` の展開状態がリセットされていた

## 2026-03-26 (96)

### バグ修正
- **\`normalizeUrlForCache\` のイテレーション中削除バグを修正** — \`searchParams.keys()\` を \`for...of\` でイテレーションしながら \`delete()\` を呼ぶと後続キーがスキップされる問題を \`Array.from()\` で修正。複数の UTM パラメータが混在する URL でキャッシュキーにトラッキングパラメータが残留していた

### ドキュメント整備
- **\`timeAgo\` / \`normalizeUrlForCache\` の単体テストを追加** — 相対時刻フォーマット全パス（たった今・〇分前・〇時間前・〇日前・M月D日）と URL 正規化（UTM・広告パラメータ除去・パラメータソート・フラグメント除去）を網羅するテストケースを追加

## 2026-03-26 (95)

### 新機能
- **オフライン対応** — ネットワーク切断時にオフラインバナーを表示し、Service Worker がキャッシュした記事・フィードデータを引き続き表示できるように。\`/api/articles\` と \`/api/feeds\` を stale-while-revalidate 戦略でキャッシュ（キャッシュがあれば即座に返しつつバックグラウンドで更新）。SW キャッシュバージョンを \`rss-v3\` に更新

## 2026-03-26 (94)

### バグ修正
- **OGP プレビューカード挿入時の DOM 切り離しチェック修正** — フェッチ完了時に \`anchor\` 要素自体が DOM から切り離されているケース（ユーザーが記事を素早く切り替えた場合など）を正しく検出するよう \`anchor.isConnected\` チェックを追加。以前は親コンテナ（\`el.isConnected\`）のみ確認していたため、切り離された \`anchor\` の親に挿入を試みる可能性があった

## 2026-03-26 (93)

### リファクタリング
- **\`FeedItem\` の \`onDelete\` / \`onTogglePin\` プロップから \`React.MouseEvent\` を除去** — UI懸念事項（\`stopPropagation\`）をデータフック（\`useFeedOperations\`）から取り除き、\`FeedItem\` 内部のアクションボタンで一元管理するように変更

## 2026-03-26 (92)

### 新機能
- **記事本文内リンクの OGP プレビューカード** — 記事本文に含まれる「段落の中で単独で並んでいるリンク」を自動検出し、リンクの直下にサイトタイトル・説明・サムネイル画像付きのプレビューカードを展開表示するように

## 2026-03-26 (91)

### リファクタリング
- **\`useArticleAi\` の trivial ラッパー関数を削除** — \`loadAiCache\` / \`saveAiCache\`（各 1 行のラッパー）を除去し \`aiLruCache\` を直接呼ぶように変更（8 行削減）
- **\`useUIState\` の \`loadLayout\` / \`loadFontSize\` を共通化** — 繰り返しの「ストレージ取得 → 有効値確認 → デフォルト返却」パターンを \`loadStoredEnum<T>\` ヘルパーに統合

## 2026-03-26 (90)

### 新機能
- **Slack シェアボタンでアプリを自動起動** — 記事タイトルと URL をクリップボードにコピーした後、\`slack://open\` でネイティブ Slack アプリを自動的に開くように変更。任意のチャンネルに貼り付けるだけでシェアできる

## 2026-03-26 (89)

### リファクタリング
- **\`/api/content\` と \`fetchArticleContent()\` の重複ロジックを共通化** — HTML デコード・メインコンテンツ抽出・AI Markdown フォールバック・Cloudflare Cache 保存の処理が両ファイルに重複していた。\`buildContentCacheKey()\` と \`extractAndCacheContent()\` を \`fetch-article-content.ts\` に切り出し、\`route.ts\` はこれらを呼び出すように変更。今後この領域でバグが発生しても修正箇所が一箇所で済むようになった

## 2026-03-26 (88)

### 新機能
- **タイトルと画像の間をマウスドラッグで記事ナビゲーション** — 記事タイトル直下の区切り線エリアを左ドラッグで次の記事、右ドラッグで前の記事へ移動できるように。ホバー時に前後の記事タイトルと矢印を表示

## 2026-03-26 (87)

### バグ修正
- **\`deleteFeed\` / \`renameFeed\` のネットワークエラーを catch** — フィード削除・タイトル変更時にネットワーク障害が発生した場合、例外が未処理のまま伝播していた問題を修正。\`try/catch\` を追加してエラーメッセージを表示するよう対処

## 2026-03-26 (86)

### 新機能
- **全文取得ボタンの隣に「元記事を開く」ボタンを追加** — 本文が短い記事で表示される全文取得エリアに、元記事を新規タブで開くリンクボタンを横並びで追加

## 2026-03-26 (85)

### リファクタリング
- **\`MAX_FEEDS_PER_USER\` 定数を \`shared-feed.ts\` に統合** — \`feeds/route.ts\` と \`feeds/import/route.ts\` で重複定義されていた \`MAX_FEEDS_PER_USER = 1000\` を \`src/lib/shared-feed.ts\` に移動し、両ファイルからインポートする形に統一

## 2026-03-26 (84)

### リファクタリング
- **\`useArticleAi\` のリセットロジック重複を解消** — \`resetAi\` と \`articleId\` 変更 \`useEffect\` に同一の 5 行リセットコードが重複していたため、\`resetAi\` を先に定義して \`useEffect\` から呼び出す形に整理
- **\`App.tsx\` の \`onFeedRenamed\` ラッパーを削除** — \`updateFeed\` をそのまま渡せる同一シグネチャで、ラッパー関数が不要だったため削除。\`Feed\` 型インポートも合わせて除去

## 2026-03-26 (83)

### バグ修正
- **\`useArticleAi\` のレースコンディションを修正** — 記事切り替え中に AI フェッチが完了すると、別の記事に古い AI 結果が表示される問題を修正。\`AbortController\` で記事変更時・\`resetAi\` 時に進行中リクエストをキャンセルし、\`AbortError\` を静かに無視するよう修正

## 2026-03-26 (82)

### リファクタリング
- **\`useKeyboardNav\` の \`]\` / \`[\` キーハンドラを統合** — フィード切り替え処理（\`buildFeedOrder\` + \`findIndex\` + \`onSelectFeed\` + \`showToast\`）が両ケースで重複していたため、\`delta\` 変数で方向を分岐する単一 \`case\` に統合
- **\`readBodyBytes\` / \`readBodyBytesPartial\` のチャンクマージを抽出** — \`src/lib/fetch.ts\` の 2 関数で同一の \`Uint8Array\` 結合コード（7 行）が重複していたため \`concatChunks\` ヘルパーに抽出

## 2026-03-26 (81)

### リファクタリング
- **\`fetchAndParseFeed\`・\`fetchAndScrapeWithSelectors\` の記事ビルド重複を除去** — \`readLatestArticles\` → \`existingById\` マップ構築 → \`buildArticle\` 並列実行の 4 行が両関数に重複していたため \`buildArticlesFromItems\` ヘルパーに抽出。あわせて誤配置の JSDoc を整理

## 2026-03-26 (80)

### リファクタリング
- **\`llm-feed-generator\` の \`any\` 型を専用インターフェースに置換** — linkedom の型定義が DOM 標準と完全互換でないため \`LDElement\` / \`LDDocument\` の最小インターフェースをファイル内に定義し、6 箇所の \`any\` キャストと \`eslint-disable\` コメントを除去

## 2026-03-26 (79)

### リファクタリング
- **\`buildPushPayload\` の条件分岐を簡略化** — 3 つの早期 \`return\` を条件式 2 本 + 単一 \`return\` に統合。\`count === 1\` の場合は常に \`singleFeed === true\` であることを利用して重複チェックを除去
- **\`mergeNewArticles\` の \`knownIds\` 判定と切り詰めを簡略化** — \`meta.knownIds && meta.knownIds.length > 0\` を \`meta.knownIds?.length\` に短縮し、\`slice\` による切り詰め条件を \`slice(-KNOWN_IDS_MAX)\` の単一呼び出しに統合
- **\`loadMoreFeedArticles\` の中間変数 \`currentPage\` を削除** — \`currentPage\` は \`nextPage\` の計算にのみ使用されていたため、\`(ref.get(feedId) ?? 1) + 1\` とインライン化

## 2026-03-26 (78)

### バグ修正
- **ポーリング中の同時フェッチ競合状態を修正** — \`useFeeds\` の 5 分ポーリングで前回フェッチが完了する前に次のフェッチが実行される競合状態を修正。\`isPollingRef\` フラグを追加し、重複リクエストや \`latestArticleIdRef\` の不整合を防ぐ

## 2026-03-26 (77)

### リファクタリング
- **フェッチタイムアウト定数を \`src/lib/fetch.ts\` に一元化** — \`10_000ms\` の外部フェッチタイムアウトが \`fetch-article-content.ts\`・\`image-proxy/route.ts\`・\`web-push.ts\` の 3 箇所に重複定義されていた問題を修正。\`DEFAULT_FETCH_TIMEOUT_MS\` を \`src/lib/fetch.ts\` にエクスポートし、各ファイルからインポートするよう変更

## 2026-03-26 (76)

### リファクタリング
- **ストリーム読み取りの重複コードを除去** — \`app/api/ogp/route.ts\` と \`app/api/image-proxy/route.ts\` に存在していた inline ストリーム読み取りループを、既存の \`readBodyBytesPartial()\` / \`readBodyBytes()\` ヘルパーに置き換え。合計 ~40 行のコード削減。\`readBodyBytes\` / \`readBodyBytesPartial\` の戻り型を \`Uint8Array<ArrayBuffer>\` に明示化
- **\`unescapeHtml\` の二重呼び出しを修正** — \`/api/ogp\` キャッシュヒット時に \`unescapeHtml(data.image)\` を 2 回呼んでいた箇所を 1 回に修正

## 2026-03-26 (75)

### バグ修正
- **\`/api/image-proxy\` キャッシュキー正規化漏れを修正** — 画像 URL に UTM パラメータ等のトラッキング情報が付いている場合、同一画像が別々にキャッシュされていた問題を修正。\`normalizeUrlForCache()\` をキャッシュキー生成に適用し、\`/api/content\` および \`/api/ogp\` と同じ正規化ロジックに統一
- **\`fetchArticleContent()\` キャッシュキー不整合を修正** — \`/api/content\` Route Handler は \`normalizeUrlForCache()\` を適用してキャッシュキーを生成していたが、\`fetchArticleContent()\` ヘルパーは生の URL をそのままハッシュしていた。この不整合により、両コードパスが同一記事を別々にキャッシュしてしまう問題を修正

## 2026-03-26 (74)

### セキュリティ
- **IPv6 リンクローカルアドレス判定の改善** — SSRF 対策の \`isPrivateHost()\` で \`fe80::/10\` 範囲の判定を \`startsWith\` の手動列挙 4 件からビット演算 \`(firstGroup & 0xffc0) === 0xfe80\` に変更。専用ヘルパー \`isIPv6LinkLocal()\` を追加し、境界値の正確さと保守性を向上

## 2026-03-26 (73)

### バグ修正
- **キャッシュキー URL 正規化** — \`utm_source\` / \`utm_medium\` 等のトラッキングパラメータが異なるだけの同一記事 URL が別々にキャッシュされていた問題を修正。\`normalizeUrlForCache()\` を \`src/lib/url.ts\` に追加し、\`/api/content\` と \`/api/ogp\` の両エンドポイントで使用。パラメータ順序の違いやフラグメント (\`#section\`) の有無も正規化する

## 2026-03-26 (72)

### リファクタリング
- \`readBodyBytesPartial\` ヘルパーを \`src/lib/fetch.ts\` に追加し、\`discoverFeedUrl\` 内の 20 行のインラインバイト読み込みループを 3 行に簡略化

## 2026-03-26 (71)

### 新機能
- **RSS のないサイトへの LLM フィード自動生成** — RSS が見つからないサイトを登録しようとした際、Workers AI (llama-3.1-8b) がページの \`<a>\` タグ構造（href / テキスト / クラス / 祖先 5 段）を解析して記事リンクの CSS セレクタを推論。以降の定期取得はそのセレクタで HTML をスクレイプして記事を更新する。\`src/lib/llm-feed-generator.ts\` を新規追加

## 2026-03-26 (70)

### バグ修正
- **YouTube 埋め込みエラー時のフォールバックリンク追加** — エラー 153 等で埋め込み動画が再生できない場合でも「YouTube で見る ↗」リンクを表示するよう改善。動画オーナーが埋め込みを制限している場合でも直接 YouTube で視聴できるようになった

## 2026-03-26 (69)

### バグ修正
- **YouTube Live URL の埋め込み対応** — \`youtube.com/live/VIDEO_ID\` 形式の URL が YouTube 動画として認識されず埋め込みが表示されなかった問題を修正。E2E テストに YouTube URL パターンと iframe レスポンシブラップの回帰テストを追加

## 2026-03-26 (68)

### パフォーマンス改善
- **OGP 負キャッシュ実装** — og:image が存在しないページへの繰り返しフェッチを防ぐため、空結果も 1 日間 Cloudflare Cache API にキャッシュするよう変更

## 2026-03-26 (67)

### リファクタリング
- \`postProcess\` / \`postProcessMarkdownContent\` の共通後処理ステップを内部ヘルパー \`applyCorePipeline\` に抽出し、コードの重複を解消

## 2026-03-26 (66)

### 新機能
- **複数キーワード AND 検索** — 検索バーでスペース区切りにより複数ワードを入力すると、全ワードを含む記事のみ表示（AND 検索）。各ワードは個別にハイライト表示される

## 2026-03-26 (65)

### 新機能
- **検索履歴** — 検索バーにフォーカスすると過去の検索クエリ（最大10件）がドロップダウン表示。Enter キーで現在のクエリを履歴に保存。クリックで再検索、× ボタンで個別削除。localStorage に永続化
- **シェア時にタイトルを含めてコピー** — Slack 用にコピー・タイトル + URL をコピーが \`タイトル\\nURL\` 形式で出力するよう変更

## 2026-03-26 (64)

### 新機能
- **シェアボタンにプラットフォーム選択を追加** — X・Slack・LINE・URL コピーを選べるドロップダウンに変更。モバイルでは「システムで共有」（Web Share API）も表示。Slack は URL をクリップボードにコピーしてペーストで共有

## 2026-03-26 (63)

### バグ修正
- **KaTeX race condition 修正** — 記事をすばやく切り替えた際に古い記事の数式レンダリングが新しい記事の DOM を書き換える問題を修正。\`cancelled\` フラグと \`el.isConnected\` チェックで防止
- **KaTeX 翻訳切り替え後に数式が消える問題を修正** — \`showTranslated\` を \`useEffect\` の依存配列に追加

### リファクタリング
- **\`FeedItem\` モバイルメニューの色判定を改善** — \`action.className?.includes('rose')\` という文字列パースを廃止し、\`Action\` インターフェースに \`variant?: 'danger'\` を追加して意味を明示
- **\`useUIState\` の toast タイマー cleanup を追加** — アンマウント時に \`clearTimeout\` が呼ばれなかった問題を修正

## 2026-03-26 (62)

### リファクタリング
- **\`useUIState\` hook を新設** — \`App.tsx\` に散在していたテーマ・フォントサイズ・レイアウト・ピン留め・トースト・モバイルペイン・PWA インストールプロンプト・ヘルプ表示の各 UI 状態管理を \`src/hooks/useUIState.ts\` に抽出。\`App.tsx\` を 523行 → 420行 に削減

## 2026-03-26 (61)

### 新機能
- **数式レンダリング対応** — 記事本文中の LaTeX 数式（\`$...$\` / \`$$...$$\` / \`\\(...\\)\` / \`\\[...\\]\`）を KaTeX で自動レンダリング。技術ブログの数式が文字列のまま表示される問題を解消

## 2026-03-26 (60)

### リファクタリング
- **\`useAuth\` の堅牢性向上** — 初回フェッチがネットワークエラーで失敗した場合に \`user\` が \`undefined\`（ローディング中）のまま固まる問題を修正。\`inFlight\` フラグで \`visibilitychange\` とタイマーの同時リクエスト多重発行も防止

## 2026-03-26 (59)

### バグ修正
- **バックグラウンド復帰後にログアウトされる問題を修正** — \`useAuth\` が \`/api/auth/me\` をマウント時の1回しか呼ばず、タブ非表示中に access_token が切れた後の複数 API 同時リフレッシュで refresh_token ローテーションが競合していた。\`visibilitychange\` 時と10分ごとに再チェックするよう変更し、トークンを一元管理で先回りリフレッシュするよう修正

### 新機能
- **モバイルでフィードの操作メニューを追加** — ホバーが効かないタッチデバイスで操作ボタンが表示されなかった問題を解消。各フィード項目の右端に ⋮ ボタン（\`lg:\` 未満のみ表示）を追加し、タップでピン留め・全既読・更新・削除メニューを開けるよう対応

## 2026-03-26 (58)

### リファクタリング
- **記事本文フォントを Lora (serif) から IBM Plex Sans JP (sans-serif) に統一** — デザイン参照元の katasu.me が sans-serif のみ使用しているため Lora を削除。\`next/font/google\` の Lora 読み込みも除去し、記事本文 \`.article-content\` を \`font-sans\` に変更

## 2026-03-26 (57)

### バグ修正
- **フォントが実際にロードされていなかった問題を修正** — \`globals.css\` で \`Reddit Sans\` / \`IBM Plex Sans JP\` / \`Lora\` を指定していたが \`layout.tsx\` に読み込みコードがなくシステムフォントにフォールバックしていた。\`next/font/google\` で正しくロードし CSS 変数経由で参照するよう修正

## 2026-03-26 (56)

### バグ修正
- **ダークモード時のテキストコントラストを改善** — \`text-default\` / \`text-soft\` / \`text-muted\` / \`text-faint\` が zinc-400〜700 と暗すぎて読みにくかった問題を修正。各トークンを 1 段階明るく (zinc-300/400/500/600) 設定し直し、記事本文のコントラスト比を ~4:1 から ~7:1 (WCAG AA 準拠) に改善

## 2026-03-26 (55)

### バグ修正
- **記事内の相対 URL リンクが RSS リーダー自身のドメインに解決される問題を修正** — \`fixExternalLinks\` が \`href\` の相対パスを絶対 URL に変換していなかったため、例えば \`<a href="/related">\` が \`https://rss.0g0.xyz/related\` に解決されていた。\`pageUrl\` を受け取って \`fixImageDimensions\` と同様に相対パスを絶対 URL に変換するよう修正

## 2026-03-26 (54)

### リファクタリング
- **\`useDebounce\` フックを作成し検索デバウンス処理を分離** — \`useFilteredArticles\` 内のインライン \`setTimeout\` / \`query\` state を汎用の \`useDebounce<T>(value, delay)\` フックに置き換え。他フックからも再利用可能に

## 2026-03-26 (53)

### バグ修正
- **OPMLインポートのステータスメッセージが表示されない問題を修正** — インポートの成功・失敗メッセージがフィード追加フォームの \`error\` ステートを共用していたため、フォームが閉じた状態では一切表示されなかった。\`importMessage\` ステートを分離し、サイドバーフッターに3秒間表示するよう変更。成功・エラーで文字色を区別

## 2026-03-26 (52)

### バグ修正
- **inside-games.jp ギャラリー画像の見切れを修正** — \`buildImageSlider\` が付与した \`width:100%;height:100%\` インラインスタイルを \`fixImageDimensions\` が除去して \`overflow:hidden\` でクリップされていた問題を修正。ギャラリースライダーを \`postProcess\` の後に組み立てて \`rewriteImageUrls\` のみ適用するよう変更

## 2026-03-26 (51)

### リファクタリング
- **\`FeedSidebar\` のフィード操作 API を \`useFeedOperations\` フックに分離** — \`addFeed\` / \`deleteFeed\` / \`renameFeed\` / \`handleImportFile\` と関連 state を専用フックに抽出し、\`FeedSidebar\` を 511行 → 434行に削減

## 2026-03-26 (50)

### リファクタリング
- **\`FeedSidebar\` の push/install Props をオブジェクト型に統合** — 7 個のフラット Props (\`canInstall\`, \`onInstall\`, \`pushSupported\`, \`pushSubscribed\`, \`pushLoading\`, \`pushError\`, \`onTogglePush\`) を \`install\` / \`push\` の 2 オブジェクトにまとめ、Props インターフェースを簡素化

## 2026-03-26 (49)

### バグ修正
- **定期バッチの「Redirect without Location header」エラーを修正** — \`fetchFollowSafeRedirects\` が \`304 Not Modified\` を 3xx リダイレクトとして誤処理していた。\`304\` はリダイレクトではないのでそのまま返すよう修正

## 2026-03-26 (48)

### リファクタリング
- **\`useFilteredArticles\` フィルターを単一パスに統合** — 記事リストに対して連続実行していた複数の \`.filter()\` を 1 回のパスに統合し、無駄な配列生成を削減

## 2026-03-26 (47)

### バグ修正
- **\`useFeeds\` の \`loadMoreFeedArticles\` 不要再生成を解消** — \`useCallback\` の依存配列に \`loadedFeedPages\`（Map state）を含めていたため、ページ追加のたびに関数参照が再生成されていた。\`useRef\` でミラーリングして依存配列から除外

## 2026-03-26 (46)

### リファクタリング
- **\`isTrustedIframeSrc\` ルールをデータ化** — 長大な boolean 式を \`TRUSTED_IFRAME_RULES\` 定数（ホスト名リスト＋パスプレフィックスの配列）に置き換え。ドメインの追加・削除が 1 行で完結するように

## 2026-03-26 (45)

### リファクタリング
- **\`shared-feed\` R2 ページネーションの重複解消** — \`listAllFeedHashes\` と \`buildFeedUserMap\` で重複していた R2 カーソルページネーションロジックを \`listPrefixedIds\` ヘルパーに抽出

## 2026-03-26 (44)

### 新機能
- **フィード別過去記事ページ読み込み** — 共有フィードモデルの p2.json / p3.json... ページを UI から参照できるように。特定フィードを選択して記事一覧の末尾まで来たとき、サーバー側に未取得ページが残っていれば「過去の記事を読み込む」ボタンが表示される。\`Feed\` 型に \`pageCount\` フィールドを追加し、\`assembleClientFeed\` で \`meta.pageCount\` を含めて返すよう変更。\`useFeeds\` に \`loadedFeedPages\` 状態と \`loadMoreFeedArticles\` 関数を追加

## 2026-03-26 (43)

### リファクタリング
- **\`useOgpCache\` キャッシュ保存の重複解消** — \`setOgpCache\` コールバック内で条件分岐ごとに重複していた \`storageSet\` 呼び出しを、結果を \`result\` 変数にまとめて 1 回の呼び出しに統一
- **\`useFilteredArticles\` ボリュームトグルのヘルパー抽出** — \`toggleUnreadOnly\` / \`toggleBookmarkOnly\` で重複していた boolean トグル + localStorage 保存パターンを \`boolToggleWithStorage\` ヘルパー関数として抽出。\`useMemo\` 内の \`selectedArticleId || gracePeriodId\` 判定を \`isActive\` ヘルパーに抽出して可読性向上

## 2026-03-26 (42)

### バグ修正
- **\`useArticleContent\` OGP フェッチのレースコンディション修正** — 記事切り替え時に前の記事の OGP フェッチが完了すると、古い OGP 画像 URL が新しい記事に適用される問題を修正。\`AbortController\` を使用して記事変更時にフェッチを中断するよう変更。全文フェッチ（\`fetchFullContent\`）も同様に中断処理を追加

## 2026-03-26 (41)

### リファクタリング
- **\`FeedItem\` コンポーネント抽出** — \`FeedSidebar.tsx\` にインラインで定義されていた \`FeedItem\` コンポーネント（約 120 行）と \`formatCount\` ユーティリティ関数を \`src/components/FeedItem.tsx\` に独立ファイルとして抽出。\`FeedSidebar.tsx\` の行数が 663 → 521 行に削減

## 2026-03-26 (40)

### リファクタリング
- **\`useReadState\` の ref 統一** — \`localReadRef\` / \`localBookmarkRef\` / \`localReadingListRef\` の 3 つに分散していた ref を \`stateRef: { read, bookmarks, readingList }\` の単一 ref オブジェクトに統合。\`mergeServerSet\` のシグネチャを \`ref\` 引数から \`onMerge\` コールバックに変更し、\`saveReadState\` も \`ReadStateSets\` 型 1 引数に整理

## 2026-03-26 (39)

### リファクタリング
- **\`KeyboardShortcutsModal\` コンポーネント抽出** — \`App.tsx\` にインラインで定義されていたキーボードショートカットヘルプモーダル（50行超の JSX）を \`src/components/KeyboardShortcutsModal.tsx\` に独立コンポーネントとして抽出。ショートカット定数を \`SHORTCUTS\` として分離し、\`ReleaseNotesModal\` と同じパターンに統一

## 2026-03-26 (38)

### セキュリティ
- **\`sanitizeHtml\` バックティック属性値対応** — \`<img src=\\\`x\\\`onerror=alert(1)>\` のようにバックティック区切りの属性値直後にインラインイベントハンドラが続くケースが除去されない問題を修正。ルックビハインドに \`\\\`\` を追加し、値パターンに \`\\\`[^\\\`]*\\\`\` を明示的に追加

## 2026-03-26 (37)

### リファクタリング
- **\`url.ts\` の URL バリデーション共通化** — \`isValidFeedUrl\` と \`isValidHttpsUrl\` で重複していた URL 長チェック・プロトコル検証・プライベート IP 検証ロジックを内部ヘルパー \`isValidUrl(url, allowHttp)\` に抽出し、2 関数はそれへの薄いラッパーに整理
- **\`FeedSidebar.tsx\` の未読バッジ重複解消** — フィードエラー有無で条件分岐していた 2 つの \`<span>\` を 1 つに統合。カウント表示の \`count > 99 ? '99+' : count\` パターンを \`formatCount()\` ヘルパーにまとめ、4 箇所の繰り返しを排除

## 2026-03-26 (36)

### リファクタリング
- **コンテンツ取得定数を一元化** — \`CONTENT_CACHE_TTL_SEC\` / \`FETCH_TIMEOUT_MS\` / \`MAX_CONTENT_BYTES\` が \`fetch-article-content.ts\` と \`content/route.ts\` の両方で同一値として重複していた問題を修正。\`fetch-article-content.ts\` のみで定義しエクスポート、\`route.ts\` でインポートするよう変更し、値の乖離によるキャッシュ不整合リスクを排除

## 2026-03-26 (35)

### リファクタリング
- **\`cron/fetch.ts\` の死コードを削除** — マイグレーション完了済みの \`migrateUserFeedsToSubscriptions\` 関数、未使用の後方互換エクスポート (\`fetchAllUsers\` エイリアス、\`computeFeedHash\` 等の再エクスポート) を削除。どこからもインポートされていなかったコードを整理

## 2026-03-25 (34)

### リファクタリング
- **cron フィード更新の R2 GET 削減** — \`fetchAndParseFeed\` が読んだ \`existingLatest\` を \`mergeNewArticles\` に渡すことで、フィード更新 1 回あたり \`readLatestArticles\` の二重 R2 GET を解消
- **Push 通知ループの \`readFeedMeta\` 再読み出しを削除** — \`fetchAndUpdateSharedFeed\` の戻り値を \`{ newArticles, meta }\` に変更し、\`fetchAllFeeds\` と \`fetchSingleFeed\` が同じ meta を再利用するよう変更。全フィード数分の余分な R2 GET を削減
- **\`resetFeedSuccessState\` ヘルパーを抽出** — \`applyFeedSuccess\` と \`applyFeedNotModified\` で重複していた 5 行のリセット処理を共通関数に集約し、\`applyFeedNotModified\` 自体を削除
- **\`assembleClientFeed\` の動的 import を静的 import に変換** — \`app/api/feeds/route.ts\` の \`await import('@/lib/shared-feed')\` を上部の静的 import に移動
- **\`GET /api/articles?feed={hash}\` の page=1 処理を最適化** — フィード指定かつページ未指定の場合に \`getUserLatestArticles\`（全購読フィード読み込み）を経由していた問題を修正。\`readLatestArticles\` で当該フィードのみ読むよう変更

## 2026-03-25 (33)

### セキュリティ
- **ページ指定記事取得の購読チェックを追加** — \`GET /api/articles?feed={hash}&page=N\` で購読していないフィードの記事が取得できた問題を修正。\`readUserSubscriptions\` で購読確認してから \`readArticlePage\` を呼ぶよう変更

### バグ修正
- **\`mergeNewArticles\` の重複チェック範囲を全 ID に拡大** — \`latest.json\` (最新100件) のみで重複チェックしていたため、100件超のフィードで古いページの記事が再挿入される問題を修正。\`SharedFeedMeta.knownIds\` に既知 ID を保持して全期間にわたる重複チェックを実現（上限 10,000件）
- **\`cascadeOverflow\` の再帰を \`while\` ループに変換** — 最大 499 回の再帰が Workers のスタックを圧迫する可能性を排除

### リファクタリング
- **\`getUserLatestArticles\` に 2,000 件の上限を追加** — 購読数 × 100件がメモリ上に無制限展開される問題を防止
- **\`fetch.ts\` の動的 \`import()\` を静的 import に統一** — \`readLatestArticles\` / \`assembleClientFeed\` の非対称な動的 import を解消
- **\`migrateUserFeedsToSubscriptions\` の不要な R2 二重読み込みを削除** — \`writeFeedMeta\` 直後の \`readFeedMeta\` 再実行を削除し、書き込み済み変数を再利用

## 2026-03-25 (32)

### バグ修正
- **\`readFeedMeta\` の JSON パースエラーハンドリングを追加** — \`meta.json\` が破損していた場合、\`obj.json()\` がスローしてフィード取得 cron 全体が停止する問題を修正。try-catch で包んで \`null\` を返すようにし、再作成を促すよう修正
- **マイグレーション時に \`customTitle\` が失われる問題を修正** — \`migrateUserFeedsToSubscriptions\` で旧 \`feeds.json\` の title が共有メタタイトルと異なる場合（ユーザーがカスタムタイトルを設定していた場合）、差分を \`customTitle\` として保持するよう修正

## 2026-03-25 (31)

### 新機能
- **フィード記事ストレージを共有化・永続化** — 記事を \`feeds/{feedHash}/articles/latest.json\` + \`feeds/{feedHash}/articles/p{N}.json\` に保存する共有ストレージへ刷新。従来はユーザーごとに \`articles.json\` (最大 500 件) に保存していたため、フィード更新時に古い記事が消失していた問題を解消。フィード URL が同一であれば複数ユーザー間でデータを共有し R2 容量を削減。記事保持上限を撤廃し全件を永続保持。購読情報は \`users/{userId}/subscriptions.json\` に分離。ID を UUID から sha256 ベースの決定論的 16 文字 hex に変更し、記事 ID がユーザー間・デバイス間で一致するよう統一

## 2026-03-25 (30)

### リファクタリング
- **日付範囲フィルターを localStorage に永続化** — \`useFilteredArticles\` の \`dateRange\` 設定がページ更新後にリセットされていた問題を修正。\`STORAGE_KEYS.DATE_RANGE\` キーに保存し、\`unreadOnly\` / \`bookmarkOnly\` / \`sortOrder\` と同様にセッションをまたいで設定が維持されるようにした

## 2026-03-25 (29)

### 新機能
- **タブ切り替え時の既読状態即時同期** — \`useReadState\` に \`visibilitychange\` イベントリスナーを追加。別タブを開くなどでページが非表示になった際、デバウンス中の既読・ブックマーク・後で読む状態をサーバーへ即時同期する。\`beforeunload\`（ページ閉じ時）だけでは補えなかったタブ切り替え時の状態ロストを防止

## 2026-03-25 (28)

### リファクタリング
- **\`fetchAndParseFeed\` ヘルパーを抽出** — \`fetchUserArticles\` と \`fetchSingleFeed\` で重複していた「フェッチ→パース→メタ更新→記事ビルド」ロジックを共通の \`fetchAndParseFeed\` 関数に集約。条件付きリクエスト（ETag/If-Modified-Since）は \`options.conditional\` フラグで制御

## 2026-03-25 (27)

### セキュリティ
- **OPML インポートの入力サニタイズを強化** — \`extractFeeds\` で取得した \`title\` をヌルバイト除去・500文字に切り詰め、\`siteUrl\`（\`htmlUrl\` 属性）を http/https スキームのみ許可するよう検証。\`javascript:\` など危険なスキームが保存されるのを防止

## 2026-03-25 (26)

### 新機能
- **ブックマークフィルタートグル** — 記事一覧ヘッダーに「★」ボタンを追加。押すと現在表示中のフィード内でブックマーク済み記事だけを絞り込んで表示できる（サイドバーの「ブックマーク」とは異なり、特定フィード内での絞り込みに対応）。キーボードショートカット \`B\`（Shift+b）でも切替可能。設定は localStorage に永続化

## 2026-03-25 (25)

### リファクタリング
- **\`useReadState\` のサーバーマージロジックを \`mergeServerSet\` ヘルパーに抽出** — ログイン後に \`/api/read-state\` から取得した既読・ブックマーク・後で読む状態を localStorage の Set にマージする処理が3回重複していた。共通の \`mergeServerSet\` 関数に抽出し、コードの重複を削減

## 2026-03-25 (24)

### ドキュメント整備
- **アーキテクチャ・コーディング規約ドキュメントを現状に同期** — \`coding-conventions.md\` の R2 ヘルパー API 名を旧名 (\`readR2Json\`/\`writeR2Json\`) から現在の実装 (\`r2Get\`/\`r2Put\`) に修正。\`architecture.md\` および \`CLAUDE.md\` のディレクトリ構造・API 一覧・R2 データ構造を実装済みの全ファイルに合わせて更新

## 2026-03-25 (23)

### 新機能
- **記事本文の外部リンクを新しいタブで開くように変更** — \`fixExternalLinks\` 関数を追加し、後処理パイプラインに組み込んだ。記事内の \`<a>\` タグに \`target="_blank"\` と \`rel="noopener noreferrer"\` を自動付与することで、記事を読みながらリンクを別タブで確認できるようになった。フラグメントのみのアンカーリンク (\`#section\`) はそのまま保持する

## 2026-03-25 (22)

### バグ修正
- **\`fetchArticleContent\` の TextDecoder に try-catch を追加** — 不正な charset 値が \`detectCharset\` から返された場合に \`TextDecoder\` が \`RangeError\` でクラッシュしていた問題を修正。\`/api/content\` と同様に UTF-8 フォールバックを実装
- **\`fetchArticleContent\` の \`cfCache.put\` にエラーハンドラを追加** — \`/api/content\` ルートには \`.catch()\` があったが \`fetchArticleContent\` ヘルパーにはなかった不一致を解消
- **\`/api/content\` のアップストリーム 4xx を正しいステータスコードで返すように修正** — 上流が 404 / 403 / 429 等を返した場合でも常に 502 を返していた問題を修正。4xx はそのまま転送し、5xx のみ 502 にマップするよう変更

## 2026-03-25 (21)

### セキュリティ
- **\`sanitizeHtml\` にフォーム要素の除去を追加** — RSS 記事内の \`<form>\` / \`<input>\` / \`<select>\` / \`<textarea>\` 要素がフィッシング攻撃（クレデンシャル詐取・偽 UI）に悪用できた問題に対処。\`<form>\` はタグ枠のみ除去して内部コンテンツを保持し、入力フィールド系要素は要素ごと除去する

## 2026-03-25 (20)

### リファクタリング
- **\`applyBasePostProcess\` を削除してパイプラインをフラット化** — \`postProcess\` と \`postProcessMarkdownContent\` それぞれが独立した steps 配列を持つ形に変更し、中間ヘルパーを通じたネストを解消して全処理ステップを一箇所で把握できるよう可読性を向上

## 2026-03-25 (19)

### バグ修正
- **\`waitUntil\` の \`cfCache.put\` にエラーハンドラを追加** — \`content\` / \`ogp\` / \`image-proxy\` ルートで Cloudflare Cache API への保存が失敗してもサイレントに無視されていた問題を修正。\`.catch()\` でエラーをログ出力するよう統一

## 2026-03-25 (18)

### リファクタリング
- **\`useReadState\` の toggle 関数を \`toggleSetItem\` ヘルパーに統合** — \`toggleRead\` / \`toggleBookmark\` / \`toggleReadingList\` で重複していた「Set の追加/削除 + localStorage 保存」ロジックをモジュールレベルの \`toggleSetItem\` ヘルパーに抽出し、3 箇所のコード重複を解消

## 2026-03-25 (17)

### リファクタリング
- **AI ルートの共通ロジックを \`runAiJob\` ヘルパーに抽出** — \`summarize\` と \`translate\` ルートで重複していた URL 検証・コンテンツ取得・キャッシュ確認・AI 実行・キャッシュ保存のロジックを \`src/lib/ai-route-helper.ts\` の \`runAiJob\` 関数に統合

## 2026-03-25 (16)

### リファクタリング
- **\`postProcess\` の共通ステップを \`applyBasePostProcess\` に切り出し** — \`postProcess\` と \`postProcessMarkdownContent\` が共有する \`fixImageDimensions\` / \`rewriteImageUrls\` / \`wrapTables\` / \`sanitizeHtml\` の 4 ステップを private ヘルパーにまとめて重複を解消

## 2026-03-25 (15)

### リファクタリング
- **\`ai-cache\` の重複 SHA-256 関数を統合** — \`ai-cache.ts\` 内に独自定義されていた \`hashText()\` を削除し、\`r2.ts\` の \`sha256Hex()\` を import して再利用するよう変更

## 2026-03-25 (14)

### ドキュメント整備
- **\`MAX_ARTICLES\` の記述を 2000 → 500 に修正** — \`articles.json\` の最大件数をコードから 2000 → 500 に削減した際、\`CLAUDE.md\`・\`README.md\`・\`.claude/rules/architecture.md\` の記述が更新されず不整合が生じていた。3 ファイルの記述を実装値（500）に合わせて修正

## 2026-03-25 (13)

### セキュリティ
- **プッシュ通知エンドポイント登録に SSRF 対策を適用** — \`POST /api/push/subscribe\` のエンドポイント URL 検証が HTTPS チェックのみで、プライベート IP レンジへのリクエストを許していた。\`isValidHttpsUrl\` を新設し、フィード URL と同様のプライベート IP・ループバック・リンクローカル拒否ロジックを適用

## 2026-03-25 (12)

### セキュリティ
- **cron の RSS フェッチにリダイレクト安全検証を適用** — \`fetchViaBinding\` が外部 URL に対して \`fetchWithTimeout\`（リダイレクトを素通り）を使っていたため、正規フィード URL からプライベート IP へのリダイレクトで SSRF が成立しえた。\`fetchFollowSafeRedirects\` に切り替え、各リダイレクト先を \`isValidFeedUrl\` で検証するよう修正

## 2026-03-25 (11)

### リファクタリング
- **\`parseJsonBody\` を Result 型に変更** — 戻り値を \`T | NextResponse\` から \`{ ok: true; data: T } | { ok: false; error: NextResponse }\` に変更し、\`instanceof NextResponse\` チェックを不要にした。全 7 つの Route Handler 呼び出し箇所を \`if (!parsed.ok) return parsed.error\` パターンに統一

## 2026-03-25 (10)

### バグ修正
- **手動リフレッシュ後に ETag/Last-Modified が保存されない問題を修正** — \`fetchSingleFeed\` が成功時にレスポンスの \`ETag\` / \`Last-Modified\` ヘッダーを feeds.json に書き戻していなかったため、次回 cron 実行時の条件付きリクエスト（304 Not Modified）が効かなかった問題を修正

## 2026-03-25 (9)

### リファクタリング
- **\`readBodyBytes\` ヘルパーを \`src/lib/fetch.ts\` に抽出** — \`app/api/content/route.ts\` と \`src/lib/fetch-article-content.ts\` で重複していた ReadableStream ボディ読み取りロジック（チャンク蓄積・サイズ超過チェック・\`Uint8Array\` 結合）を共通ヘルパーとして集約

## 2026-03-25 (8)

### バグ修正
- **\`Retry-After: 0\` テストの不整合を修正** — \`cb99f93\` で実装を「0 秒 = 即再試行可 (0ms)」に変更した際にテスト期待値が更新されず、E2E テストが失敗していた問題を修正

## 2026-03-25 (7)

### セキュリティ
- **SVG \`<use>\` href URL デコード検証** — フラグメント参照の判定前に \`decodeURIComponent()\` を適用し、\`%23icon\` のような URL エンコードされた同一ドキュメント参照が誤って除去されなくなった。不正なエンコード（単独 \`%\`）も try/catch で安全に処理
- **\`Retry-After: 0\` の正常処理** — \`parseRetryAfter()\` の判定を \`seconds > 0\` から \`seconds >= 0\` に修正し、0 秒（即座再試行）を正しく扱えるようにした

## 2026-03-25 (6)

### リファクタリング
- **\`timeAgo\` を \`article-utils.ts\` に移動** — \`ArticleList.tsx\` にインライン定義されていた \`timeAgo\` 関数をユーティリティモジュールへ移動。合わせて 1 分未満の記事に「0分前」と表示されていたバグを修正し「たった今」を返すよう改善。未来日時（時計ズレ等）も「たった今」として正しく処理

## 2026-03-25 (5)

### セキュリティ
- **XSS フィルター強化** — \`hasDangerousScheme()\` の制御文字除去を先頭のみから文字列全体に変更。スキーム名中に埋め込まれた制御文字（例: \`javascript\\x00:\`）によるバイパスを防止
- **charset フォールバック追加** — \`TextDecoder\` に非対応の charset が渡された場合の \`RangeError\` を捕捉し UTF-8 でフォールバック。非標準 charset を指定するページでの記事取得失敗を防止

## 2026-03-25 (4)

### セキュリティ
- **SVG 拒否強化** — image-proxy で \`image/svg+xml\` のみ拒否していたのを \`image/svg\`・\`application/svg+xml\` などの非標準形式も拒否するよう修正
- **iframe HTTP 禁止** — \`isTrustedIframeSrc\` で HTTP iframe を禁止し HTTPS のみ許可。中間者攻撃によるコンテンツ差し替えを防止

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
- \`OGP キャッシュロジック\` を \`useOgpCache\` フックに抽出
- \`toArray\` ヘルパーの重複を解消
- \`useReadState\` の重複 ref を削除
- ポーリング内の重複フェッチを \`fetchAndSetArticles\` に統合
- \`ArticleView\` のロジックをカスタムフックに抽出
- \`fetchWithTimeout\` を cron に統合
- 既読/ブックマーク/後で読む状態管理を \`useReadState\` フックに抽出

### バグ修正
- \`refreshFeeds\` の feeds 再取得で HTTP エラーを見落としていた問題を修正

### セキュリティ
- OPML 再帰深度制限と HEIC MIME タイプ誤りを修正
- OGP フェッチ時の SSRF リダイレクト修正
- フィードディスカバリーの SSRF リダイレクト修正
- JSON パースエラーハンドリング強化
- CGNAT アドレス範囲の SSRF 対策追加
- 入力値のバリデーション強化
- 画像プロキシの SVG XSS 対策
- ReDOS 脆弱な正規表現を修正
- SVG アニメーション注入対策
- URL 長さバリデーション追加
- イベントハンドラの引用符属性バイパス修正

### 機能追加
- **Error Boundary** — コンポーネントエラーを安全にキャッチ
- **HTTP 条件付きリクエスト（304）** — ETag / Last-Modified で帯域節約
- **JSON Feed サポート** — JSON Feed 1.0 / 1.1 を購読可能に
- **429 レートリミット対応** — 一時的なフェッチ停止で過負荷を防止
- **JSON Feed リンク自動検出** — ページから JSON Feed URL を発見
- **画像一括ダウンロード** — 記事内の画像をまとめて保存
- **ギャラリー表示** — inside-games.jp 等のサムネイルリストを自動スライダー化
`;
