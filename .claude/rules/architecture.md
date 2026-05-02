# アーキテクチャ

## 全体像

```
ブラウザ
  └─ React SPA ('use client' コンポーネント)
       └─ Next.js App Router (app/)
            ├─ /api/auth/*        — 認証フロー (0g0 ID OAuth2)
            ├─ /api/feeds/*           — フィード CRUD + refresh (R2)
            ├─ /api/feed-groups/*     — フィードグループ CRUD (R2)
            ├─ /api/collections/*    — コレクション CRUD (R2)
            ├─ /api/articles          — 記事一覧・保存 (R2)
            ├─ /api/ai/*              — Workers AI (要約・翻訳)
            ├─ /api/content           — フルテキスト取得プロキシ
            ├─ /api/engagement        — エンゲージメント記録 (R2)
            ├─ /api/read-state        — 既読・ブックマーク・後で読む状態 (R2)
            ├─ /api/recommendations/* — フィード推薦 (Workers AI)
            ├─ /api/image-proxy       — 外部画像プロキシ
            ├─ /api/ogp               — OGP 画像 URL 取得
            ├─ /api/push/*            — Web Push 通知サブスクリプション管理
            ├─ /api/clip              — SingleFile 拡張からの HTML クリップ保存
            ├─ /api/release-notes     — リリースノート
            └─ /api/health            — ヘルスチェック

Cloudflare Workers (@opennextjs/cloudflare)
  ├─ .open-next/worker.js   → Next.js Route Handlers / SSR
  └─ .open-next/assets/     → 静的アセット (Cloudflare Assets)

Cloudflare Bindings
  ├─ RSS_DATA (R2)      — users/{userId}/* + feeds/{feedHash}/* (共有フィード)
  ├─ RATE_LIMIT (KV)    — レートリミット・クールダウン管理
  ├─ AI                 — Workers AI モデル
  ├─ IMAGES             — Cloudflare Images
  ├─ FINDME_RSS (Service) — findme-rss サービスバインディング
  └─ ASSETS (Assets)    — 静的アセット

Cron Trigger (wrangler.toml: */30 * * * *)
  └─ src/cron/fetch.ts → fetchAllUsers(env) — R2 から全ユーザーの RSS を取得・更新
```

## ディレクトリ構造

```
app/
  layout.tsx                 # ルートレイアウト (CSS import)
  page.tsx                   # エントリーポイント (force-dynamic + <App />)
  globals.css                # Tailwind v4 + CSS 変数テーマ
  api/
    auth/
      login/route.ts         # GET /api/auth/login — OAuth2 開始
      callback/route.ts      # GET /api/auth/callback — コード交換・cookie セット
      me/route.ts            # GET /api/auth/me — セッション確認・自動リフレッシュ
      logout/route.ts        # POST /api/auth/logout — トークン失効・cookie クリア
      dbsc/
        register/route.ts  # POST /api/auth/dbsc/register — DBSC 公開鍵登録スタブ (TODO: TPM 鍵バインド実装)
        challenge/route.ts # POST /api/auth/dbsc/challenge — DBSC チャレンジ発行・検証スタブ
    feeds/
      route.ts               # GET (一覧) / POST (追加) /api/feeds
      [id]/route.ts          # DELETE /api/feeds/:id
      [id]/refresh/route.ts  # POST /api/feeds/:id/refresh — 単体フィード手動更新
      [id]/reinfer/route.ts  # POST /api/feeds/:id/reinfer — LLM CSS セレクタ再推論
      refresh/route.ts       # POST /api/feeds/refresh — 全フィード手動更新
      import/route.ts        # POST /api/feeds/import — OPML インポート
      export/route.ts        # GET /api/feeds/export — OPML エクスポート
    feed-groups/
      route.ts               # GET (一覧) / POST (作成) /api/feed-groups
      [id]/route.ts          # PATCH (更新) / DELETE /api/feed-groups/:id
    collections/
      route.ts               # GET (一覧) / POST (作成) /api/collections
      [id]/route.ts          # PATCH (更新・記事追加削除) / DELETE /api/collections/:id
    articles/
      route.ts               # GET /api/articles
      save/route.ts          # POST /api/articles/save — 記事保存
    ai/
      summarize/route.ts     # POST /api/ai/summarize (Workers AI)
      translate/route.ts     # POST /api/ai/translate (Workers AI)
    content/route.ts         # GET /api/content?url=... (フルテキストプロキシ)
    engagement/route.ts      # GET / POST /api/engagement — エンゲージメント記録
    image-proxy/route.ts     # GET /api/image-proxy?url=... (外部画像プロキシ)
    ogp/route.ts             # GET /api/ogp?url=... (OGP 画像 URL 取得)
    read-state/route.ts      # GET / POST /api/read-state (既読・ブックマーク・後で読む)
    recommendations/
      route.ts               # GET /api/recommendations — フィード推薦一覧
      dismiss/route.ts       # POST /api/recommendations/dismiss — 推薦を非表示
      refresh/route.ts       # POST /api/recommendations/refresh — 推薦を更新
    release-notes/route.ts   # GET /api/release-notes
    stats/route.ts           # GET /api/stats — 読了統計 (日別・年間ヒートマップ・フィード別)
    push/
      vapid-key/route.ts     # GET /api/push/vapid-key
      status/route.ts        # GET /api/push/status
      subscribe/route.ts     # POST /api/push/subscribe
      unsubscribe/route.ts   # POST /api/push/unsubscribe
      test/route.ts          # POST /api/push/test — Push 通知テスト送信
    clip/route.ts            # POST /api/clip — SingleFile 拡張からの HTML 受け取り・本文抽出・キャッシュ保存
    health/route.ts          # GET /api/health

src/
  App.tsx                    # 3ペインレイアウト + 認証状態管理 ('use client')
  types.ts                   # Feed / Article / UserProfile / AuthSession 型
  cloudflare-env.d.ts        # CloudflareEnv 拡張 (RSS_DATA, RATE_LIMIT, AI, IMAGES, FINDME_RSS 等)
  components/
    feed-sidebar/            # サイドバー（index.tsx / FeedGroupsSection / FeedViewTabs / FooterIconButton / SpecialViewButton）
    FeedItem.tsx             # フィードアイテム（コンテキストメニュー付き）
    FeedDetailModal.tsx      # フィード詳細モーダル
    FeedFilterModal.tsx      # キーワードフィルター設定モーダル
    ArticleList.tsx          # 記事一覧 (5レイアウト対応・仮想スクロール)
    ArticleListHeader.tsx    # 記事一覧ヘッダー（レイアウト切替・フィルターピル・検索バー）
    ArticleItems.tsx         # 記事一覧アイテム（レイアウト別 memo コンポーネント）
    GalleryContextMenu.tsx   # ギャラリーレイアウト右クリックメニュー（画像保存・既読切替）
    LoadMoreButton.tsx       # 追加読み込みボタン（IntersectionObserver 自動トリガー）
    ArticleView.tsx          # 記事本文
    Modal.tsx                # 汎用モーダル基盤コンポーネント
    ToastContainer.tsx       # トースト通知コンテナ（右下スタック・3種別・自動消去・ポータル描画）
    RecommendationSection.tsx # フィード推薦セクション
    KeyboardShortcutsModal.tsx # キーボードショートカット一覧モーダル
    ReleaseNotesModal.tsx    # リリースノートモーダル
    SnoozeModal.tsx          # 記事スヌーズ設定モーダル（1時間後・明日の朝・来週など）
    ReadingStatsModal.tsx    # 読了統計モーダル（日別グラフ・年間ヒートマップ・週間目標）
    FeedQuickSwitchModal.tsx # フィードクイック切り替えモーダル（キーボードナビ対応）
    CollectionDropdown.tsx   # コレクション追加/削除ドロップダウン（CollectionModal 連携）
    CollectionModal.tsx      # コレクション作成・名前変更モーダル
    NSFWEyeAnimation.tsx     # NSFW コンテンツ表示アニメーション
    ServiceWorkerRegistration.tsx # Service Worker 登録コンポーネント
    ErrorBoundary.tsx        # エラー境界
    Spinner.tsx              # ローディングスピナー（ArticleView・ArticleList で共有）
    LayoutIcon.tsx           # レイアウト切り替えボタン用アイコン（compact / list / card / magazine / gallery）
    GalleryMasonry.tsx       # masonic ベースの Pinterest 型 masonry + 親スクロールコンテナ対応の仮想スクロール
    UserSettingsModal.tsx    # ユーザー設定モーダル（フォントサイズ・行間・コンテンツ幅・自動既読閾値・テーマ）
    SaveUrlModal.tsx         # 任意 URL を手動保存するモーダル（POST /api/articles/save 連携）
    FeedAddModal.tsx         # フィード追加ダイアログ（RSS 自動検出・LLM CSS セレクタ推論・Cookie 指定対応）
    article-view/            # ArticleView 補助コンポーネント群（ヘッダー・本文・AI パネル・メモ・モーダル・ナビゲーション・インラインナビ・フィルタメニュー・ギャラリー・共有・スヌーズ・タグエディタ等）
  hooks/
    useAccessibilitySettings.ts  # 行間・テキスト均等割り設定（useUIState から分割）
    useAuth.ts               # /api/auth/me fetch → user / betaRestricted
    useFeeds.ts              # /api/feeds + /api/articles fetch (5分ポーリング)
    useFeedOperations.ts     # フィード CRUD 操作
    useFeedGroups.ts         # /api/feed-groups CRUD + 楽観的更新（create / rename / collapse / mute / reorder / delete）
    useCollections.ts        # /api/collections CRUD + 楽観的更新（create / rename / delete / addArticle / removeArticle）
    useKeyboardNav.ts        # キーボードナビ (j/k/n/p/o/b/t/r/m/c/u/d/s/f/l/[/]/?)
    useThemePreference.ts    # テーマ（light/dark）+ DOM 同期（useUIState から分割）
    useUIState.ts            # UI 状態管理（サブフックを合成: useThemePreference / useLayoutSettings / useAutoReadSettings / useAccessibilitySettings）
    useArticleFilters.ts     # フィルター状態管理（bool/enum/検索/著者/カテゴリ）
    useArticleSorting.ts     # ソート順管理（SortOrder サイクリング）
    useArticlePagination.ts  # ページネーション（IntersectionObserver・visible/hasMore）
    useFilteredArticles.ts   # 記事フィルタリング・ソート・ページネーション（上記3フックを合成）
    useReadState.ts              # 既読・ブックマーク・後で読む・スヌーズ状態 (localStorage + R2 同期)
    useReadStatePersistence.ts   # localStorage 永続化（readIds・bookmarkIds 等の保存・復元）— サブフックを合成
    useReadStateActions.ts       # 既読・一括既読・全既読・スヌーズ・ノート・グローバルフィルター・TTL 操作
    useReadStateToggles.ts       # toggleRead / toggleBookmark / toggleReadingList / toggleLike 生成
    useReadStateSync.ts          # サーバー R2 との同期オーケストレーター（サブフックを合成）
    useReadStateSyncApply.ts     # サーバー応答のローカルステートへのマージ（applyServerState）
    useReadStateSyncFlush.ts     # サーバーへのフラッシュ・ライフサイクルイベント（beforeunload・visibilitychange・online）
    useReadStateTags.ts          # タグ管理（tagIds の追加・削除）
    useReadingHistory.ts     # 閲覧履歴管理
    useArticleContent.ts     # /api/content fetch + LRU キャッシュ
    useArticleAi.ts          # /api/ai/* fetch
    useSpeechSynthesis.ts    # 記事読み上げ（Web Speech API: speak / pause / resume / stop）
    useContentLinkPreviews.ts # 記事本文内リンクのプレビュー取得
    useEngagement.ts         # エンゲージメント記録 (/api/engagement)
    useRecommendations.ts    # フィード推薦 (/api/recommendations) fetch
    useOgpCache.ts           # /api/ogp fetch (OGP 画像キャッシュ)
    useImageDownload.ts      # 記事画像一括ダウンロード
    usePushNotifications.ts  # Web Push サブスクリプション管理
    useSearchHistory.ts      # 検索履歴管理 (localStorage)
    useOnlineStatus.ts       # オンライン/オフライン状態
    useMobilePane.ts         # モバイル向けペイン切り替え (sidebar/list/view)
    useNSFWMode.ts           # NSFW モード（連打で活性化）
    useStoredSetting.ts      # localStorage 永続化 enum 設定の共通ユーティリティ
    useSyncedRef.ts          # stale closure 回避用の最新値 ref ユーティリティ
    useColumnResize.ts       # カラム幅リサイズ操作と localStorage 永続化
    usePortalMenu.ts         # ポータルベースのドロップダウンメニュー位置管理
    useGracePeriod.ts        # 直前選択記事を 30 秒間フィルター対象外にする猶予期間管理
    useDebounce.ts           # デバウンスユーティリティ
    useAutoReadSettings.ts   # 自動既読閾値・自動翻訳設定（useUIState から分割）
    useAutoReset.ts          # 値セット後に自動リセット (duration 経過後に初期値へ戻す)
    useEventListener.ts      # DOM イベントリスナーライフサイクル管理 (window / document 対応)
    useInboxProgress.ts      # フィード別未読消化率を計算 (unread 数・readRatio、最大 10 件)
    useLayoutSettings.ts     # レイアウト・フォントサイズ・フォントファミリー・フィードビュー・ギャラリーカラム・コンテンツ幅設定（useUIState から分割）
    useLocalStorageHistory.ts # localStorage 配列の永続化 (先頭追加・重複排除・上限制御)
    useReadingStats.ts       # 読了統計取得 (/api/stats fetch → ReadingStats)
    useGalleryAutoRead.ts    # ギャラリーレイアウトでスクロール通過した記事を自動既読にする（IntersectionObserver + MutationObserver）
    useGallerySwipeNav.ts    # モバイルギャラリーの横スワイプでカード間スクロールナビゲーション
    useGestureNav.ts         # スワイプ・ホイール・ドラッグによる前後記事ナビゲーション（横スクロール子要素は除外）
    useReadingProgress.ts    # 記事読書進捗トラッキング（IntersectionObserver + localStorage 永続化・復元）
    useArticleHighlight.ts   # 記事本文テキストのハイライト管理（アノテーション保存・復元）
    useArticleNote.ts        # 記事ごとの個人メモ編集・自動保存（ReadState.notes と同期、最大 2000 文字）
    useArticleAiRatings.ts   # AI 要約・翻訳結果へのユーザー評価フィードバック管理
    useArticleViewState.ts   # ArticleView のフック・状態管理を集約（サブフックを合成）
    useArticleViewContent.ts # 記事コンテンツ処理（processedContent・galleryImages・embedInfo・派生状態）
    useArticleViewTts.ts     # 記事 TTS（読み上げライフサイクル・Shift+P ショートカット・トグル）
    useArticleViewShortcuts.ts # 記事ビューキーボードショートカット（v/a/z/space）+ 自動翻訳トリガー
    useArticleViewProgress.ts  # 読書進捗バー・自動既読・スクロールハンドラー
    useFullTextSearch.ts     # 記事全文検索（クエリパース・フィールド絞り込み・正規表現対応）
    usePrefetchGalleryContents.ts # ギャラリー表示時の本文・画像事前フェッチ
    useSliderGallery.ts      # スライダー型ギャラリー UI 状態管理（ページング・キーボードナビ）
    useSyntaxHighlight.ts    # 記事本文 <pre><code> のシンタックスハイライト適用
    useMathRender.ts         # 記事本文の数式（KaTeX）レンダリング
    usePopupLock.ts          # ブラウザポップアップの多重表示防止ロック（lib/popup-lock 連携）
    useMenuKeyboard.ts       # ポータルメニューのキーボードナビゲーション（Arrow Up/Down・ESC・フォーカストラップ）
    useDelayedGalleryItems.ts # 削除された items を 300ms 保持してフェードアウト遷移を可能にする（masonic 中間削除アニメーション用）
    useToast.ts              # トースト通知状態管理（success/error/info 3種別・最大3件スタック・自動消去）
  lib/
    auth.ts                  # JWT 検証 (JWKS)、トークン交換・リフレッシュ・失効
    server-auth.ts           # withSession() / requireSession() / applyRefreshedTokens()
    r2.ts                    # r2Get() / r2Put() / sha256Hex()
    xml-parser.ts            # fast-xml-parser ラッパー (RSS 2.0 + Atom)
    content.ts               # コンテンツ抽出・後処理パイプライン (Readability + postProcess)
    html-post-processor.ts   # HTML後処理パイプライン本体（postProcess・applyCorePipeline・fixExternalLinks・wrapTables）+ サブモジュール re-export
    html-noise-removal.ts    # HTMLノイズ除去（removeNoise・processNestedBlocks・removeDivsByClass・replaceBlocksByClass・replaceUntilStable）
    html-image-processors.ts # HTML画像処理（fixLazyImages・fixImageDimensions・rewriteImageUrls・removeSmallThumbnailImages・buildImageSlider・tryParseBase）
    html-embed-transforms.ts # HTML埋め込み変換（Zenn・X Tweet・SpeakerDeck・SlideShare の iframe/リンク変換）
    readability-extractor.ts # Readabilityラッパー（iframe退避・preClean・本文抽出）
    regex-extractor.ts       # 正規表現ベース抽出（stripPageChrome・サイト固有セレクター）
    html.ts                  # sanitizeHtml() / escapeHtml() / toPlainText()
    article-utils.ts         # readingTime() / timeAgo() / isLikelyJapanese()
    image-extractor.ts       # bestSrcFromSrcset() / collectImageUrlsFromHtml() / collectImageUrls()
    fetch.ts                 # RSS/HTML フェッチヘルパー (タイムアウト・リトライ)
    fetch-article-content.ts # /api/content 内のコンテンツ取得ロジック
    feed-discovery.ts        # フィード URL 自動検出
    ai-cache.ts              # AI 結果 R2 キャッシュ
    ai-route-helper.ts       # AI Route Handler 共通処理
    api-fetch.ts             # 認証付きクライアントサイド fetch ラッパー
    embed-utils.ts           # iframe embed 処理ユーティリティ
    engagement-score.ts      # エンゲージメントスコア計算ロジック
    article-filter.ts        # 記事フィルタリングロジック (feedId / 日付 / キーワード / クエリ)
    keyword-filter.ts        # キーワードフィルタリングマッチング（正規表現対応）
    llm-feed-generator.ts    # LLM で RSS のないサイトからフィード生成
    lru-cache.ts             # クライアントサイド LRU キャッシュ
    ogp.ts                   # OGP メタデータ取得ロジック
    opml.ts                  # OPML ビルド・パース純粋関数（buildOpml / extractFeeds）
    recommendation.ts        # フィード推薦ロジック
    shared-feed.ts           # 共有フィードの R2 ストレージヘルパー
    feed-groups.ts           # フィードグループ R2 読み書き（readFeedGroups / writeFeedGroups）
    collections.ts           # コレクション R2 読み書き（readCollections / writeCollections）
    storage.ts               # localStorage キー定数・安全なラッパー
    url.ts                   # URL バリデーションヘルパー
    validation.ts            # 各種入力バリデーションユーティリティ
    image-mime.ts            # 画像 MIME タイプ検証（ホワイトリスト方式・マジックバイト対応）
    image-error-placeholder.ts # 画像エラー時の SVG プレースホルダー生成
    favicon.ts               # ファビコン未読バッジ
    web-push.ts              # Web Push 送信ヘルパー
    export-markdown.ts       # ブックマーク・読書リスト記事を Markdown ファイルとしてダウンロード
    rate-limit.ts            # KV ベースのクールダウン・スライディングウィンドウ レートリミット (checkAndUpdateCooldown / checkSlidingWindow)
    serialize-async.ts       # 同一キー非同期操作の直列化ユーティリティ (serialized)
    obsidian.ts              # Obsidian URI スキーム連携（obsidian://new URI 生成・ファイル名サニタイズ）
    html-to-markdown.ts      # HTML → Markdown 変換（linkedom/DOM 対応）・YAML frontmatter 生成
    reading-progress.ts      # 読書進捗計算純粋関数（computeProgress / clampProgress / buildAnchorSelector）
    reader-settings.ts       # リーダー表示設定（フォントサイズ 6段階・行間 5段階・コンテンツ幅 3段階）
    article-ttl.ts           # 記事 TTL 管理（30日超過・非保護の期限切れ記事フィルタリング）
    clip.ts                  # SingleFile POST リクエストバリデーション（validateClipRequest）
    api-error.ts             # API エラー整形ヘルパー（ApiError 型 / apiError() 関数）
    cache-helper.ts          # Cloudflare Cache API 共通ヘルパー（buildCacheKey / cachePutAsync）
    csrf.ts                  # CSRF トークン発行・検証 + Origin ヘッダー検証（POST/PUT/DELETE 対応）
    rsshub.ts                # RSSHub インスタンス連携（自動 URL マッピング・アクセスキー付与・ルート解決）
    full-text-search.ts      # 記事全文検索クエリパーサー（フィールド検索・トークン化・正規表現対応）
    read-state-merge.ts      # 読み取り状態マージ純粋関数（local ∪ server / snoozed は遅い方優先 / notes はサーバー優先）
    feed-group-drop.ts       # フィードグループへのドラッグ&ドロップ時の競合解決ロジック
    image-proxy-url.ts       # 画像プロキシ URL ビルダー / プロキシ済み判定
    image-proxy-security.ts  # 画像プロキシリクエストの MIME / Content-Type / オリジン検証
    browser-translator.ts    # ブラウザネイティブ翻訳 API（Translator）の利用可否判定・言語検出
    translate-html.ts        # HTML DOM 内の翻訳対象テキスト抽出・翻訳適用
    popup-lock.ts            # 同時に開けるブラウザポップアップ数を制限するクライアントサイドロック
    dbsc.ts                  # Device Bound Session Credentials (DBSC) ユーティリティ — 機能検出・チャレンジ生成・ヘッダービルダー (スケルトン)
    serialize-error.ts       # Error オブジェクトの構造化シリアライズ（ログ・通知用）
    retry-after.ts           # HTTP Retry-After ヘッダー（delta-seconds / HTTP-date）をミリ秒に変換（クライアント・cron で共有）
    read-state-storage.ts    # ReadState の localStorage 永続化ユーティリティ + ペンディング状態スナップショット
    read-state-sync-api.ts   # ReadState のサーバー通信（fetchReadState・saveReadState）
    sw-cache.ts              # Service Worker キャッシュ管理
    type-guards.ts           # TypeScript 型ガード関数
  cron/
    fetch.ts                 # fetchArticles(userId, env) / fetchAllUsers(env)
```

## データフロー

### フィード追加

1. ユーザーが FeedSidebar に URL 入力
2. `POST /api/feeds` → RSS 探索 → 見つからない場合は LLM で CSS セレクタ推論
3. `computeFeedHash(url)` で feedHash を計算
4. `getOrCreateFeedMeta` で `feeds/{feedHash}/meta.json` を作成・取得（他ユーザー既登録の場合は既存を流用）
5. `users/{userId}/subscriptions.json` に `UserSubscription` を追加
6. バックグラウンド (`ctx.waitUntil`) で初回記事フェッチ → `feeds/{feedHash}/articles/latest.json` を更新
7. クライアントが再フェッチして表示を更新

### 記事取得 (cron)

1. Cloudflare Cron Trigger が 30 分毎に `scheduled` ハンドラーを起動
2. `buildFeedUserMap(env)` が全ユーザーの `subscriptions.json` を走査して `feedHash → userId[]` マップを構築
3. 各 feedHash に対して RSS を 1 度だけ fetch（共有フィード）
4. `fast-xml-parser` で RSS 2.0 / Atom をパース
5. `mergeNewArticles` で `guid` ベースの dedup → `feeds/{feedHash}/articles/latest.json` を更新（500件超えは `p{N}.json` にカスケード）
6. `feeds/{feedHash}/meta.json` の `lastFetchedAt` / `articleCount` を更新
7. 購読中の各ユーザーに Web Push 通知を送信

### フィードグループ操作

- `useFeedGroups(user)` がユーザーログイン時に `GET /api/feed-groups` で初期ロード → `order` 昇順で state に展開
- **作成** (`createGroup`): `POST /api/feed-groups` → `users/{userId}/feed-groups.json` に追記 → 新規グループを state に追加
- **更新** (`renameGroup` / `setCollapsed` / `setMuted` / `reorderGroup`): **楽観的更新** で state を先に反映 → `PATCH /api/feed-groups/:id` → 失敗時はロールバックまたは `/api/feed-groups` から再 fetch
- **削除** (`deleteGroup`): `DELETE /api/feed-groups/:id` → サーバー側でグループを除去した後、`users/{userId}/subscriptions.json` 内の該当 `groupId` 参照を自動クリア。R2 はトランザクション非対応のため後半の購読更新が失敗すると orphan な `groupId` が残り得るが、クライアントは未知の `groupId` を無害に無視する設計
- 制約: グループ上限 100 件 / 名前 50 文字 / ユーザー内で名前重複不可

### 読み取り状態

- **クライアント優先、サーバー同期**の二重管理
- `localStorage` に既読・ブックマーク・後で読む ID を JSON 配列で保存
- ログイン時に `/api/read-state` (GET) でサーバーデータをマージ（ローカル ∪ サーバー）
- 状態変更から 2秒後にデバウンスして `/api/read-state` (POST) でサーバーに保存
- ページ離脱時 (`beforeunload`) は `sendBeacon` で即時送信
- `useReadState` hook (`src/hooks/useReadState.ts`) が全ロジックを管理
- 未読カウントはクライアントサイドで計算

## Cloudflare バインディングへのアクセス

Route Handlers および cron 内で `getCloudflareContext()` を使う:

```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET() {
  const { env } = await getCloudflareContext({ async: true });
  // env.RSS_DATA: R2Bucket
  // env.AI: Ai
}
```

文字列の環境変数 (wrangler.toml `[vars]` / シークレット) は `process.env` で参照:

```typescript
const AUTH_BASE_URL = process.env.AUTH_BASE_URL!;
const CLIENT_ID = process.env.CLIENT_ID!;
```

## R2 データ構造

### 共有フィードデータ（ユーザー間共有）

```
feeds/{feedHash}/meta.json               # SharedFeedMeta（feedHash・url・title・siteUrl・lastFetchedAt・fetchError・consecutiveErrors・lastErrorAt・rateLimitedUntil・lastModified・etag・cacheControl・nextFetchEarliestAt・articleCount・pageCount・knownIds・cssSelectors・failedSelectors・oversizeAlert）
feeds/{feedHash}/articles/latest.json   # Article[]（最新 PAGE_SIZE=500 件、publishedAt 降順）
feeds/{feedHash}/articles/p{N}.json     # Article[]（過去ページ、N=2〜）
```

`feedHash` = `sha256(feedUrl).slice(0, 16)`（`computeFeedHash` で計算）。
フィード記事データはユーザー間で共有され、複数ユーザーが同じフィードを購読しても記事フェッチは 1 度だけ行われる。
詳細は `src/lib/shared-feed.ts` の `mergeNewArticles` / `cascadeOverflow` を参照。

### サーバーサイドセッション（認証）

```
sessions/{sessionId}.json              # ServerSessionData（userId・refreshToken・expiresAt）— ブラウザは session_id Cookie のみ保持
```

`sessionId` = `crypto.randomUUID()`。refresh_token はブラウザに渡さずサーバー側のみで管理（#189）。
期限切れセッション（expiresAt 超過）は次回アクセス時に自動削除される。

### ユーザー別データ

```
users/{userId}/subscriptions.json       # UserSubscription[]（feedHash・url・customTitle・subscribedAt・filter・nsfw・requestCookie・priority・category・groupId・mutedUntil・lastAccessedAt・view）
users/{userId}/feed-groups.json         # FeedGroup[]（グループ定義: id / name / order / collapsed / muted / createdAt）
users/{userId}/collections.json         # Collection[]（コレクション定義: id / name / articleIds / createdAt / order）
users/{userId}/profile.json             # UserProfile（id・sub・email・name・picture）
users/{userId}/read-state.json          # ReadState（readIds・bookmarkIds・readingListIds・likeIds・snoozedUntil・notes・tagIds・globalFilter・readBeforeTimestamp・ttlDays）
users/{userId}/engagement.json          # EngagementLog（entries: EngagementEntry[]、最大 5,000 件）
users/{userId}/recommendations.json     # RecommendationCache（recommendations・generatedAt・dismissedIds・topics）
users/{userId}/push.json                # PushConfig（subscriptions: PushSubscriptionRecord[]）
users/{userId}/saved.json               # 手動保存記事（/api/articles/save）
```

`userId` = JWT の `sub` クレームをそのまま使用（`server-auth.ts` で `userId: payload.sub` と設定）。
Route Handler では `session.userId` でアクセスする。

### クールダウン管理（KV）

`RATE_LIMIT` KV namespace にキーとして格納される。

```
{userId}:last-full-refresh              # 全フィード一括リフレッシュのクールダウン
{userId}:ai-cooldown                    # AI エンドポイントのスライディングウィンドウ レートリミット
{userId}:feed-refresh-{feedHash}        # 単体フィードリフレッシュのクールダウン
{userId}:feed-reinfer-{feedHash}        # LLM CSS セレクタ再推論のクールダウン
{userId}:recommendations-refresh        # 推薦リフレッシュのクールダウン
{userId}:recommendations-gen            # 推薦生成（GET）の同時実行防止クールダウン
{userId}:feed-add                       # フィード追加のクールダウン
{userId}:opml-import                    # OPML インポートのクールダウン
{userId}:image-proxy                    # 画像プロキシのスライディングウィンドウ レートリミット
```

### AI キャッシュ（永続）

```
ai-cache/summary/{sha256}               # AI 要約キャッシュ（永続）
ai-cache/translation/{sha256}           # AI 翻訳キャッシュ（永続）
```

## 認証フロー

```
ブラウザ → GET /api/auth/login
         → id.0g0.xyz/auth/login?redirect_to=...&state=...
         → Google 認証
         → GET /api/auth/callback?code=...&state=...
         → POST id.0g0.xyz/auth/exchange (Basic 認証)
         → access_token (15分) を HttpOnly cookie にセット
         → refresh_token を R2 sessions/{sessionId}.json に保存
         → session_id (30日) を HttpOnly cookie にセット（refresh_token はブラウザに渡さない）
         → /
```

## 環境変数・シークレット

### wrangler.toml vars (公開情報)

```toml
[vars]
AUTH_BASE_URL = "https://id.0g0.xyz"
APP_BASE_URL  = "https://rss.0g0.xyz"
BETA_ALLOWED_SUBS = "..."   # カンマ区切り sub リスト (空 = 制限なし)
VAPID_SUBJECT = "mailto:admin@0g0.xyz"  # Web Push 送信元メール
```

### Cloudflare Workers シークレット

```bash
npx wrangler secret put CLIENT_ID              # 0g0-id services テーブルに登録された BFF クライアント ID
npx wrangler secret put CLIENT_SECRET          # 対応するクライアントシークレット
npx wrangler secret put VAPID_PUBLIC_KEY       # Web Push VAPID 公開鍵
npx wrangler secret put VAPID_PRIVATE_KEY      # Web Push VAPID 秘密鍵
npx wrangler secret put CLOUDFLARE_API_TOKEN   # 全文取得フォールバック用 (オプション)
npx wrangler secret put BRAVE_SEARCH_API_KEY   # フィード推薦検索用 (オプション)
```

> **認証方式**: 0g0-id API との通信は `Authorization: Basic <CLIENT_ID:CLIENT_SECRET>` のみ。
> `X-Internal-Secret` / `X-BFF-Origin` ヘッダーは廃止済み（Phase 9 以降）。
> `CLIENT_ID` は 0g0-id の services テーブルへの事前登録が必須。
>
> **オプション環境変数 (wrangler.toml vars)**:
> `INTERNAL_SERVICE_USER_AGENT` — 0g0-id への fetch に使う User-Agent 文字列（未設定時は `rss-reader/1.0 (+https://rss.0g0.xyz)`）。
> Cloudflare WAF / Bot Fight Mode で Worker-to-Worker fetch が bot 判定されるのを防ぐために設定する。

## コンテンツ抽出戦略 (`src/lib/content.ts`)

`extractMainContent` は以下の 3 段階で本文を抽出する。

```
1. resolveScriptLoadedImages  — JS で動的セットされる画像 src を静的に解決（<script> 除去前に必須）
2. extractThumbListImgs       — ギャラリー UL を別途取得して末尾に hidden div として付与
3. extractWithReadability     — @mozilla/readability + linkedom で DOM パース → 本文抽出
   ├─ 成功 + 画像損失チェック:
   │    srcImgCount >= 8 かつ rcImgCount < srcImgCount * 20% の場合
   │    → extractWithRegex にフォールバック（PR TIMES 等の画像主体ページ対策）
   └─ 失敗 / 本文不十分: extractWithRegex へフォールバック
4. extractWithRegex           — stripPageChrome → サイト固有セレクター → EC セレクター → 汎用セレクター
5. postProcess                — ノイズ除去 → 画像処理 → リンク修正 → テーブルラップ → sanitizeHtml
```

### 画像損失チェックの閾値（20%）

Readability は本文テキストの精度を優先するため、画像主体のページで多数の `<img>` を脱落させることがある。
`srcImgCount >= 8 && rcImgCount * 5 < srcImgCount` の条件で regex フォールバックを試みる。
regex 結果が Readability 結果の 2 倍以上の画像を含む場合のみ regex を採用する。

### extractWithRegex のフォールバック順

1. サイト固有セレクター（Qiita `itemprop="articleBody"`, Zenn `class="znc"` など）
2. EC / 商品ページ（Schema.org `itemprop="description"`, Shopify 等）
3. 汎用セレクター（`<article>`, `class="article"` 等）
4. 最終フォールバック（`<main>` または `<body>`）

### postProcess パイプライン（適用順）

```
removeNoise → transformZennLinkEmbeds → transformZennMermaidEmbeds
→ fixLazyImages → fixImageDimensions(pageUrl) → rewriteImageUrls
→ fixExternalLinks → wrapTables → sanitizeHtml
```

> **重要**: `sanitizeHtml` は必ずパイプライン最後に実行。途中で実行すると後続処理が XSS を再注入する可能性がある。

---

## キーワードフィルタリング設計 (`src/lib/keyword-filter.ts`)

### CompiledKeywordFilter パターン

フィルター設定変更時に一度だけ正規表現をコンパイルし、記事ごとの再コンパイルを回避する。

```typescript
// フィルター設定変更時（useFilteredArticles の useMemo 内）
const filterMap = buildFilterMap(feeds, keywordFilters);

// 記事ごとの判定（コンパイル済みを再利用）
const match = matchesKeywordFilter(article, compiledFilter);
```

### ReDoS 対策 (`hasCatastrophicBacktracking`)

ユーザー入力の正規表現を `/pattern/` 形式で受け付けるが、壊滅的バックトラッキングを検出した場合は
`null`（マッチしない）扱いにしてサービス拒否を防ぐ。検出対象パターン:

- ネストした量指定子: `(a+)+` / `(a{2,})+`
- 量指定子付き交互化グループ: `(a|aa)+`
- 文字クラスが混在するネストグループ: `([a-z)]+)+`

---

## ビルド・デプロイ

```bash
npm run build    # next build
npm run deploy   # @opennextjs/cloudflare build && wrangler deploy
```

ビルド成果物:

- `.open-next/worker.js` → Workers スクリプト (wrangler.toml の main)
- `.open-next/assets/` → 静的アセット (Cloudflare Assets)
