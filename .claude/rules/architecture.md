---
description: ディレクトリ構造・データフロー・R2 schema・テストカバレッジマップなど横断的アーキテクチャ参照
paths: "src/**/*.ts,src/**/*.tsx,app/**/*.ts,app/**/*.tsx,src/cron/**/*.ts"
---

# アーキテクチャ

## 全体像

```
ブラウザ
  └─ React SPA ('use client' コンポーネント)
       └─ Next.js App Router (app/)
            ├─ /api/auth/*        — 認証フロー (0g0 ID OAuth2)
            ├─ /api/feeds/*           — フィード CRUD + refresh (R2)
            ├─ /api/feed-groups/*     — フィードグループ CRUD + 並べ替え (R2)
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
            ├─ /api/stats             — 読了統計 (日別・年間ヒートマップ・フィード別)
            ├─ /api/video-proxy       — 外部動画プロキシ
            ├─ /api/piper-voice/*     — Piper TTS voice モデル (.onnx) 配信 (R2)
            ├─ /api/wasm/*            — Piper TTS wasm ファイル配信 (R2、25 MiB 上限回避)
            └─ /api/health            — ヘルスチェック

Cloudflare Workers (@opennextjs/cloudflare)
  ├─ worker.ts              → Custom Worker entry point (wrangler.toml `main = "./worker.ts"`)
  │                             ├─ fetch: .open-next/worker.js (Next.js handler) を delegate
  │                             └─ scheduled: fetchAllFeeds + runCronPrefetch (Cron Trigger handler)
  ├─ .open-next/worker.js   → Next.js Route Handlers / SSR (ビルド時生成)
  └─ .open-next/assets/     → 静的アセット (Cloudflare Assets)

Cloudflare Bindings
  ├─ RSS_DATA (R2)              — users/{userId}/* + feeds/{feedHash}/* (共有フィード)
  ├─ NEXT_INC_CACHE_R2_BUCKET (R2) — Next.js Incremental Cache (opennextjs 管理)
  ├─ RATE_LIMIT (KV)            — レートリミット・クールダウン管理
  ├─ AI                         — Workers AI モデル
  ├─ IMAGES                     — Cloudflare Images binding (OpenNext 推奨設定 `6582e81f` で導入、実コード参照 0 件 / @opennextjs/cloudflare 内部利用の可能性あり、削除前要検証 / 次回 OpenNext メジャー更新時に削除可否を再評価)
  ├─ BROWSER (Browser Rendering) — Cloudflare Browser Rendering REST API (#768 で導入、booth.pm 等 Workers IP block サイトの OGP fallback fetch 用)
  ├─ WORKER_SELF_REFERENCE (Service) — 自身の Worker へのサービスバインディング (OpenNext 推奨設定 `6582e81f` で導入、実コード参照 0 件 / @opennextjs/cloudflare 内部 cache 等で利用の可能性あり、削除前要検証 / 次回 OpenNext メジャー更新時に削除可否を再評価)
  ├─ FINDME_RSS (Service)       — findme-rss サービスバインディング (cron/fetch.ts で findme-rss.0g0.xyz 経由 RSS 取得時に使用、bot 検出回避用)
  └─ ASSETS (Assets)            — 静的アセット (`.open-next/assets` 自動配信、実コード参照不要)

Cron Trigger (wrangler.toml: */30 * * * *)
  └─ worker.ts#scheduled() → src/cron/fetch.ts#fetchAllFeeds(env) — R2 の全フィードを buildFeedUserMap で集約して RSS 取得・更新
                          + src/lib/cron-prefetch.ts#runCronPrefetch(env, ctx) — top-N feed の content/OGP を waitUntil で事前 fetch
                            (内部で src/lib/engagement-aggregator.ts#aggregateGlobalTopFeeds を呼び出し、全ユーザーの engagement 履歴からグローバル人気度スコアで top-N feed を集約)
```

## ディレクトリ構造

```
app/
  layout.tsx                 # ルートレイアウト (CSS import)
  page.tsx                   # エントリーポイント (force-dynamic + <ClientApp />)
  ClientApp.tsx              # next/dynamic で App コンポーネントを ssr: false で読み込む薄い wrapper (SSR 不要のため localStorage 等のブラウザ API を含む全 hooks が動作可能)
  globals.css                # Tailwind v4 + CSS 変数テーマ
  demo/                      # 認証不要の DEMO ページ (/demo route、production deploy 含む)
    page.tsx                 # /demo route エントリーポイント (force-dynamic + <DemoApp />)
    DemoApp.tsx              # fetch interceptor 設定後に App を描画する demo wrapper
    mock.ts                  # /api/* fetch interceptor。mock user / feeds / articles を返してフル機能 demo を提供する
  api/
    auth/
      login/route.ts         # GET /api/auth/login — OAuth2 開始
      callback/route.ts      # GET /api/auth/callback — コード交換・cookie セット
      me/route.ts            # GET /api/auth/me — セッション確認・自動リフレッシュ
      logout/route.ts        # POST /api/auth/logout — トークン失効・cookie クリア
      dbsc/
        register/route.ts  # POST /api/auth/dbsc/register — DBSC 公開鍵登録 (P-256 公開鍵 import / challenge 検証 / R2 DbscSession 保存 / セッション binding)
        challenge/route.ts # POST /api/auth/dbsc/challenge — DBSC チャレンジ発行 + ES256 署名検証 (`verifyDbscResponse` 経由)
        session/route.ts   # DELETE /api/auth/dbsc/session — DBSC バインド済みデバイス登録解除
    feeds/
      route.ts               # GET (一覧) / POST (追加) /api/feeds
      [id]/route.ts          # DELETE / PATCH /api/feeds/:id
      [id]/refresh/route.ts  # POST /api/feeds/:id/refresh — 単体フィード手動更新
      [id]/reinfer/route.ts  # POST /api/feeds/:id/reinfer — LLM CSS セレクタ再推論
      [id]/purge-content-cache/route.ts # POST /api/feeds/:id/purge-content-cache — フィード全記事の content Cache 一括クリア（CLI 用、#691 で購読チェック必須化）
      refresh/route.ts       # POST /api/feeds/refresh — 全フィード手動更新
      import/route.ts        # POST /api/feeds/import — OPML インポート
      export/route.ts        # GET /api/feeds/export — OPML エクスポート
    feed-groups/
      route.ts               # GET (一覧) / POST (作成) /api/feed-groups
      [id]/route.ts          # PATCH (更新) / DELETE /api/feed-groups/:id
      reorder/route.ts       # POST /api/feed-groups/reorder — 並べ替え（全グループ ID の順序を一括更新）
    collections/
      route.ts               # GET (一覧) / POST (作成) /api/collections
      [id]/route.ts          # PATCH (更新・記事追加削除) / DELETE /api/collections/:id
    articles/
      route.ts               # GET /api/articles
      save/route.ts          # POST /api/articles/save — 記事保存
    ai/
      summarize/route.ts     # POST /api/ai/summarize (Workers AI)
      translate/route.ts     # POST /api/ai/translate (Workers AI)
    content/route.ts         # GET /api/content?url=... (フルテキストプロキシ) / DELETE /api/content?url=... (自分の clip Cache のみクリア、#691 で shared cache 削除を撤廃)
    engagement/route.ts      # GET / POST /api/engagement — エンゲージメント記録
    image-proxy/route.ts     # GET /api/image-proxy?url=... (外部画像プロキシ)
    video-proxy/route.ts     # GET /api/video-proxy?url=... (外部動画プロキシ、handleBinaryProxy 共通 handler 経由)
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
      config/route.ts        # GET / PUT /api/push/config — Push 通知設定（disabledFeeds / サイレント時間帯）
    clip/route.ts            # POST /api/clip — SingleFile 拡張からの HTML 受け取り・本文抽出・キャッシュ保存
    health/route.ts          # GET /api/health
    test/seed/route.ts       # POST/DELETE /api/test/seed — e2e テスト専用 R2 シード（NODE_ENV !== "production" + DEV_AUTH_BYPASS_USER_ID セット時のみ動作、本番では 404）
    piper-voice/[file]/route.ts # GET /api/piper-voice/[file] — Piper TTS engine 用 voice モデル (.onnx) と config (.onnx.json) を R2 から配信 (ALLOWED_FILES allowlist)
    wasm/[file]/route.ts     # GET /api/wasm/[file] — Piper TTS の onnxruntime-web peer-dep wasm + piper-plus phonemizer wasm を R2 から配信 (Cloudflare Workers 単一 asset 25 MiB 上限回避、ALLOWED_FILES allowlist)

src/
  App.tsx                    # 3ペインレイアウト + 認証状態管理 ('use client')
  types.ts                   # Feed / Article / UserProfile 型 ※ AuthSession は src/lib/server-auth.ts に定義
  cloudflare-env.d.ts        # CloudflareEnv 拡張 (RSS_DATA, RATE_LIMIT, AI, IMAGES, FINDME_RSS 等)
  config/
    shortcuts.ts             # キーボードショートカット Single Source of Truth（ShortcutDef / ShortcutGroup / SHORTCUT_DEFS / KEYBOARD_SHORTCUTS）— useKeyboardNav と KeyboardShortcutsModal の両方が参照
  contexts/
    ArticleFilterContext.tsx  # 記事フィルター状態の React Context（FilterState + onSaveFilter）
    FeedSidebarContext.tsx    # FeedSidebar 操作関数の React Context（on*** コールバック群を Props Drilling なしに提供）
    ReaderSettingsContext.tsx # リーダー表示設定の React Context（フォントサイズ・行間・テーマ等）
    SelectedArticleContext.ts # 選択中の記事 ID を提供する Context（ArticleItem の不要な re-render 回避）
    ToastContext.tsx          # トースト通知 API の React Context（useToast のグローバル提供）
    TtsAdapterContext.tsx     # TTS engine adapter の React Context（#675 Phase 1b — App.tsx で 1 回だけ生成し、記事ヘッダー TTS / 設定モーダル voice 選択で同一インスタンスを共有）
    UnreadStatsContext.tsx    # 全記事の未読統計 (`unreadByFeed` / `totalUnread` / `lastPublishedByFeed` / `readTodayCount`) の React Context（#702 — App.tsx で `useArticleUnreadStats` を 1 回呼んで `useDocumentTitleBadge` と `useSidebarFeeds` の二重 scan を解消）
    OgpCacheContext.tsx       # OGP cache store の React Context (#808 Phase 3a/3b、AppShell で useOgpCache を 1 度呼んで OgpCacheStore = { ogpCache, getEntry, cacheOgpEntry } を ArticleList + ArticleContentBody の sibling 階層で共有、Provider 外 fallback は null-object で安全)
    BulkSelectionContext.ts   # 記事バルク選択状態の React Context（選択中の記事 ID Set を BulkActionToolbar と ArticleList で共有）
  components/
    feed-sidebar/            # サイドバー（index.tsx / FeedGroupsSection / FeedViewTabs / FooterIconButton / SpecialViewButton / SidebarHeader / SidebarFooter / CategorySection / TagsSection / CollectionsSection / FeedSearchBar）
    feed-item/               # フィードアイテム（index.tsx / FeedItemComponent / FeedContextMenu / ContextMenuShell / FeedTitleContent / feedActions.tsx / types.ts）
    article-items/           # レイアウト別記事アイテム（index.tsx / shared.tsx / CompactItem / ListItem / CardItem / MagazineItem / GalleryItem）
    FeedDetailModal.tsx      # フィード詳細モーダル
    FeedFilterModal.tsx      # キーワードフィルター設定モーダル
    FeedHealthModal.tsx      # フィードヘルス監視モーダル（エラー・レートリミット・オーバーサイズのフィードを一覧表示）
    AppModals.tsx            # App レベルのモーダル群集約コンポーネント（SessionExpired / Snooze / KeyboardShortcuts / UserSettings / FeedQuickSwitch）
    ArticleList.tsx          # 記事一覧オーケストレーター (5レイアウト対応・仮想スクロール)
    article-list-body/       # レイアウト別ボディサブコンポーネント群（index.ts / CompactListBody / CardBody / MagazineBody / GalleryBody / GalleryCardRenderer / VirtualRow / gallery-context.ts / types.ts）
    ArticleListEmptyState.tsx # 記事一覧の空状態表示（ローディング・エラー・未登録・検索無結果・既読済みなど）
    ArticleListHeader.tsx    # 記事一覧ヘッダー（後方互換再エクスポート → article-list-header/）
    article-list-header/     # 記事一覧ヘッダーサブコンポーネント群（index.tsx オーケストレーター / LayoutSwitcher / FilterPills / FilterPillButton / CategoryFilter / SortButton / MarkAllReadButton / SearchBar / types.ts / constants.ts）
    ArticleItems.tsx         # 記事一覧アイテム（レイアウト別 memo コンポーネント）
    GalleryContextMenu.tsx   # ギャラリーレイアウト右クリックメニュー（画像保存・既読切替）
    ArticleContextMenu.tsx   # compact / list / card / magazine の汎用右クリックメニュー（既読・ブックマーク・後で読む・一覧から削除）
    LoadMoreButton.tsx       # 追加読み込みボタン（IntersectionObserver 自動トリガー）
    ArticleView.tsx          # 記事本文
    Modal.tsx                # 汎用モーダル基盤コンポーネント
    ConfirmModal.tsx         # 確認ダイアログモーダル（window.confirm 代替。useConfirm hook と組み合わせて使う）
    TextInputModal.tsx       # window.prompt / window.alert 代替入力モーダル（useTextInputModal と組み合わせて使う）
    Backdrop.tsx             # モーダル背景オーバーレイ（ConfirmModal / FeedQuickSwitchModal が利用）
    BulkActionToolbar.tsx    # 記事バルク選択時の操作ツールバー（ArticleList に常駐、BulkSelectionContext 連携・一括既読・ブックマーク・スヌーズ・タグ追加）
    ThreePaneLayout.tsx      # 3ペイン CSS Grid レイアウトコンテナ（sidebarWidth / listWidth / listFocusMode props）
    ToastContainer.tsx       # トースト通知コンテナ（右下スタック・3種別・自動消去・ポータル描画）
    RecommendationSection.tsx # フィード推薦セクション
    KeyboardShortcutsModal.tsx # キーボードショートカット一覧モーダル
    ReleaseNotesModal.tsx    # リリースノートモーダル
    SnoozeModal.tsx          # 記事スヌーズ設定モーダル（1時間後・明日の朝・来週など）
    ReadingStatsModal.tsx    # 読了統計モーダル orchestrator（reading-stats/ の sub-component を合成、505→260 行に分割）
    reading-stats/           # ReadingStatsModal サブコンポーネント群（StatBar / StatCard / HeatmapCalendar / WeeklyGoalSection）
    FeedQuickSwitchModal.tsx # フィードクイック切り替えモーダル（キーボードナビ対応）
    CollectionDropdown.tsx   # コレクション追加/削除ドロップダウン（CollectionModal 連携）
    CollectionModal.tsx      # コレクション作成・名前変更モーダル
    NSFWEyeAnimation.tsx     # NSFW コンテンツ表示アニメーション
    ArticleDetailOverlay.tsx # listFocusMode 時の記事詳細パネル（右からスライドイン・幅ドラッグリサイズ・createPortal）
    ColumnResizeHandles.tsx  # 3 ペインの「サイドバー / リスト」境界カラムリサイズハンドル（PC のみ、listFocusMode/popup 時無効）— App.tsx から分割
    MobilePane.tsx           # 3 ペイン (sidebar / list / view) 各ペインの mobile スライドラッパー（aria-hidden / inert / transform を集約、App.tsx Step 1o から分割）
    AppListPane.tsx          # 中央ペイン (記事一覧) の MobilePane + Skeleton + ErrorBoundary + ArticleList を集約（App.tsx Step 1p から分割、ArticleList の prop 変化に追従可能な ComponentProps 型継承）
    AppViewPane.tsx          # 右ペイン (記事詳細) の MobilePane (as="main") + ErrorBoundary + ArticleView を集約（App.tsx Step 1q から分割、AppListPane と対称な薄いラッパー）
    AppSidebarPane.tsx       # 左ペイン (フィードサイドバー) の MobilePane + Skeleton + ErrorBoundary + FeedSidebarProvider + FeedSidebar を集約（App.tsx Step 1r から分割、3 ペイン全てが対称構造に統一）
    AppOverlays.tsx          # 3 ペイン手前 (z-order overlay) のグローバル UI 群を集約（A11y / OfflineBanner / ToastContainer / ConfirmModal / AppModals / NSFW アニメ / 新着バナー / FocusMode 関連 / ColumnResize / ArticleDetailOverlay）。App.tsx Step 1s から分割
    AppProviders.tsx         # 4 段の React Context Provider (ToastProvider / TtsAdapterProvider / ReaderSettingsProvider / ArticleFilterProvider) を 1 つの集約コンポーネントに閉じ込め（App.tsx Step 1u から分割。Provider 順序や追加・変更時の影響範囲を 1 ファイルに局所化）
    FocusModeExitButton.tsx  # 記事一覧フォーカスモード解除ボタン（PC のみ右上に固定表示）— App.tsx から分割
    A11yHelpers.tsx          # アクセシビリティ補助 (skip-to-content link + aria-live announcement region)— App.tsx から分割
    SessionExpiredModal.tsx  # セッション期限切れ時の再ログインモーダルオーバーレイ
    ServiceWorkerRegistration.tsx # Service Worker 登録コンポーネント
    ErrorBoundary.tsx        # エラー境界
    Spinner.tsx              # ローディングスピナー（ArticleView・ArticleList で共有）
    SkeletonSidebar.tsx      # サイドバーのスケルトンスクリーン（初回ロード時 CLS 防止）
    SkeletonArticleList.tsx  # 記事一覧のスケルトンスクリーン（初回ロード時 CLS 防止）
    LayoutIcon.tsx           # レイアウト切り替えボタン用アイコン（compact / list / card / magazine / gallery）
    UserSettingsModal.tsx    # ユーザー設定モーダル（フォントサイズ・行間・コンテンツ幅・自動既読閾値・テーマ）
    SaveUrlModal.tsx         # 任意 URL を手動保存するモーダル（POST /api/articles/save 連携）
    article-view/AutoReadController.tsx  # オートモードの副作用コントローラ（fetch → speak → 次の記事への自動進行）
    AppShell.tsx             # 27 個の state hook と TTS/audio 管理を一元化し、3 ペイン UI 全体をオーケストレーションするルートコンポーネント
    FallbackImage.tsx        # 画像 proxy fallback 機能を `useImageProxyFallback` hook でラップした薄い `<img>` ラッパーコンポーネント
    GalleryMasonrySelf.tsx   # `useMasonryLayout` を使って自前 masonry virtualizer で絶対配置レイアウトを実現するギャラリー (#773 Phase 3 / #822 で default ON 化、`GalleryBody.tsx` が直接 import して使用)
    ImageLightbox.tsx        # ギャラリーの画像クリックで起動する拡大表示モーダル（focus trap・前後ナビゲーション・記事表示機能付き）
    PiperEngineHost.tsx      # piper-plus WASM TTS engine を `next/dynamic({ ssr: false })` で隔離し、render prop で child に expose する
    PiperErrorDetailToast.tsx # TTS engine エラーの詳細（code/message/model/voice）を浮き出し toast で表示、クリップボード保存機能付き
    PiperInitProgressToast.tsx # Piper WASM/model ダウンロード・初期化中の進捗を右下 toast で表示、完了時に自動消去
    FeedAddModal.tsx         # フィード追加ダイアログ（RSS 自動検出・LLM CSS セレクタ推論・Cookie 指定対応）
    BetaRestrictedPage.tsx   # ベータ制限ページ（未許可ユーザー向け表示）
    LandingPage.tsx          # 未ログイン時のランディングページ
    AppLandingState.tsx      # App.tsx の早期 return パス集約（auth ロード中 / ベータ制限 / 未ログイン）— 関数として呼び出して JSX | null を返す
    OfflineBanner.tsx        # オフライン時の固定バナー（同期待ちインジケーター付き）— App.tsx から分割
    NewArticleBanner.tsx     # 新着記事通知バナー（スクロールトップ・閉じるボタン付き）— App.tsx から分割
    FocusModeOverlay.tsx     # フォーカスモード全画面オーバーレイ（ArticleView ラッパー）— App.tsx から分割
    article-view/            # ArticleView 補助コンポーネント群（本文・AI パネル・メモ・モーダル・ナビゲーション・インラインナビ・フィルタメニュー・ギャラリー・共有・スヌーズ・タグエディタ・PortalMenuShell 等）
    article-view/ArticleHeader.tsx          # 記事ヘッダー（オーケストレーター、4 サブコンポーネント合成）
    article-view/ArticleHeaderMeta.tsx      # ヘッダーメタ情報（戻る/日付/著者/元記事/読了時間/カテゴリ/タグ）
    article-view/ArticleHeaderAiTts.tsx     # AI 要約・翻訳・画像 DL・TTS・オートモード ボタン群
    article-view/ArticleHeaderShare.tsx     # クイックシェア + ShareMenu/FilterMenu/GlobalFilterMenu
    article-view/ArticleHeaderEngagement.tsx # 後で読む/ブックマーク/いいね/メモ/コレクション/フォーカスモード
    article-view/EngagementSegmentButton.tsx # 後で読む/ブックマーク/いいね 3 連トグルボタン共通テンプレート（simplify 監査 Issue 2 で抽出）
    article-view/ArticleContentBody.tsx     # 記事本文描画ボディ（ArticleView から分割）
    article-view/EmptyArticleView.tsx       # 記事未選択時のプレースホルダ表示
    article-view/FetchFullContentArea.tsx   # 「全文取得」CTA 領域（ボタン・retry・進捗）
    user-settings/           # ユーザー設定モーダルのサブコンポーネント群（AiNotificationTabPanel / DisplayTabPanel orchestrator + FontSection / LayoutSection / GallerySection / AutoReadSection / ImageDlSection / FeedManagementTabPanel / ImportExportTabPanel / TtsVoiceSection / shared、#880 で DisplayTabPanel を機能別 5 Section に分割）
  hooks/
    useAccessibilitySettings.ts  # 行間・テキスト均等割り設定（useUIState から分割）
    useAuth.ts               # /api/auth/me fetch → user / betaRestricted
    useFeeds.ts              # useFeedData + useArticleData を合成するオーケストレーター（後方互換）
    useFeedData.ts           # フィード一覧 fetch・初回ロード・CRUD 補助（onFeedAdded・updateFeed 等）
    useArticleData.ts        # 記事取得・5分ポーリング・マージ・ページネーション・TTL 管理
    useFeedFilters.ts        # nsfwFeedIds / groupFeedIds / mutedFeedIds の useMemo を集約（App.tsx から分割）
    useFeedOperations.ts     # フィード CRUD 操作
    useFeedGroups.ts         # /api/feed-groups CRUD + 楽観的更新（create / rename / collapse / mute / reorder / delete）
    useFeedDragDrop.ts       # フィードの D&D 状態管理（draggedFeedId・dragOverGroupId・dragOverUngrouped）+ drop ハンドラー（onView / onGroup）
    useFeedPatch.ts          # フィード属性の PATCH 操作（nsfw・priority・category・groupId・mutedUntil・filter・view）を集約
    useFeedSelection.ts      # フィード・グループ・タグ・記事・コレクション選択状態管理 + URL クエリパラメータ同期
    useCollections.ts        # /api/collections CRUD + 楽観的更新（create / rename / delete / addArticle / removeArticle）
    useKeyboardNav.ts        # キーボードナビ (j/k/n/p/o/b/t/r/m/c/u/d/s/f/l/[/]/?)
    useThemePresets.ts       # テーマプリセット (theme/fontSize/fontFamily/lineHeight/contentWidth) を `theme-preset.ts` 経由で localStorage 保存・復元する hook（DisplayTabPanel のプリセット保存/適用 UI で利用）
    useThemePreference.ts    # テーマ（light/dark）+ DOM 同期（useUIState から分割）
    useFocusMode.ts          # フォーカスモード制御（focusMode / listFocusMode / window.history 連携 / \\ Shift+\\ Escape キー）— useUIState から分割
    useAutoReadMode.ts       # オートモード（自動全文取得 → 読み上げ → 次の記事へ）の状態管理
    usePWAInstall.ts         # PWA インストールプロンプト管理（beforeinstallprompt event）— useUIState から分割
    usePinnedAndCategories.ts # ピン留めフィード ID と折りたたみカテゴリ名の管理（localStorage 同期）— useUIState から分割
    useModalState.ts         # App レベルのモーダル状態集約（snoozeTargetId・articleAnnouncement）
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
    usePiperTts.ts           # 記事読み上げ（Piper wasm engine: piper-plus — synthesize → 自前 BufferSource 再生、TtsAdapter 実装、`enabled` option でリソース節約、#766 / #767）
    useTtsEngineSetting.ts   # TTS engine 切替設定（"web-speech" / "piper"）の localStorage 永続化 + storage event 別タブ同期
    useTtsControls.ts        # TTS engine 共通 rate / voiceUri / volume 制御 hook（useSpeechSynthesis / usePiperTts の重複コードを集約、setVoiceUriSilent variant で error handler 自動 reset の onChange skip 経路を提供、#674 Phase 2b）
    useBackgroundAudio.ts    # スマホでの TTS バックグラウンド継続用 hook（Web Audio 無音 oscillator + HTML `<audio>` element の 2 段構え、Android Chrome 通知欄表示対応、#745 Phase A + Phase D）
    useMediaSession.ts       # MediaSession API 配線 hook（記事タイトル + play/pause/stop アクションを iOS Safari ロック画面 / Android 通知センターに表示、TTS adapter に bind、#745 Phase C）
    useImageProxyFallback.ts # 画像 proxy URL → 原 URL の fallback chain hook（attempt 0: proxy → 1: 原 URL → 2: 諦め、`<FallbackImage>` で wrap して consumer 側は url prop だけ渡す設計、#788 Phase 1）
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
    useSidebarFeeds.ts       # サイドバーのフィード集計・フィルタ・グループ化（タグ集計・ピン留め・グループ・カテゴリ）— 未読数 / lastPublished は UnreadStatsContext から取得
    useArticleUnreadStats.ts # 全記事を 1 回 scan で `unreadByFeed` / `totalUnread` / `lastPublishedByFeed` / `readTodayCount` を計算 (200ms debounce) — App.tsx で 1 度だけ呼んで UnreadStatsProvider に注入
    useSyncedRef.ts          # stale closure 回避用の最新値 ref ユーティリティ
    useColumnResize.ts       # カラム幅リサイズ操作と localStorage 永続化
    usePortalMenu.ts         # ポータルベースのドロップダウンメニュー位置管理
    useGracePeriod.ts        # 直前選択記事を 30 秒間フィルター対象外にする猶予期間管理
    useDebounce.ts           # デバウンスユーティリティ
    useAutoReadSettings.ts   # 自動既読閾値・自動翻訳・自動要約・autoAiBrowserOnly (#700) 設定（useUIState から分割）
    useBrowserAiAvailability.ts # ブラウザネイティブ AI (Chrome Translator / Summarizer) の利用可否を mount 時に診断する hook（#700 auto-trigger 判定用）
    useGalleryAutoScroll.ts  # ギャラリー自動スクロール hook（連続/スライドショー両モード + 手動操作で OFF 復帰、#690）
    useAutoReset.ts          # 値セット後に自動リセット (duration 経過後に初期値へ戻す)
    useEventListener.ts      # DOM イベントリスナーライフサイクル管理 (window / document 対応)
    useInboxProgress.ts      # フィード別未読消化率を計算 (unread 数・readRatio、最大 10 件)
    useLayoutSettings.ts     # レイアウト・フォントサイズ・フォントファミリー・フィードビュー・ギャラリーカラム・コンテンツ幅設定（useUIState から分割）
    useLocalStorageHistory.ts # localStorage 配列の永続化 (先頭追加・重複排除・上限制御)
    useReadingStats.ts       # 読了統計取得 (/api/stats fetch → ReadingStats)
    useEngagementEntries.ts  # エンゲージメント生エントリ lazy fetch（フィード別ドリルダウン用）
    useGalleryAutoRead.ts    # ギャラリーレイアウトでスクロール通過した記事を自動既読にする（IntersectionObserver + MutationObserver）
    useGallerySwipeNav.ts    # モバイルギャラリーの横スワイプでカード間スクロールナビゲーション
    useGestureNav.ts         # スワイプ・ホイール・ドラッグ・PC クリックによる前後記事ナビゲーション（横スクロール子要素は除外）
    useReadingProgress.ts    # 記事読書進捗トラッキング（IntersectionObserver + localStorage 永続化・復元）
    useArticleHighlight.ts   # 記事本文テキストのハイライト管理（アノテーション保存・復元）
    useArticleNote.ts        # 記事ごとの個人メモ編集・自動保存（ReadState.notes と同期、最大 2000 文字）
    useArticleAiRatings.ts   # AI 要約・翻訳結果へのユーザー評価フィードバック管理
    useArticleViewState.ts   # ArticleView のフック・状態管理を集約（サブフックを合成）
    useArticleViewContent.ts # 記事コンテンツ処理（processedContent・galleryImages・embedInfo・派生状態）
    useArticleViewTts.ts     # 記事 TTS（読み上げライフサイクル・Shift+P ショートカット・トグル）
    useArticleViewShortcuts.ts # 記事ビューキーボードショートカット（v/a/z/space）+ 自動翻訳トリガー
    useArticleViewProgress.ts  # 読書進捗バー・自動既読・スクロールハンドラー
    useTtsHighlight.ts         # TTS 読み上げハイライト hook (#672 Phase 2 — boundary + 100ms interval 推定融合で activeSentenceIndex を計算)
    useFullTextSearch.ts     # 記事全文検索（クエリパース・フィールド絞り込み・正規表現対応）
    usePrefetchGalleryContents.ts # ギャラリー表示時の本文・画像事前フェッチ
    useSliderGallery.ts      # スライダー型ギャラリー UI 状態管理（ページング・キーボードナビ）
    useSyntaxHighlight.ts    # 記事本文 <pre><code> のシンタックスハイライト適用
    useMathRender.ts         # 記事本文の数式（KaTeX）レンダリング
    usePopupLock.ts          # ブラウザポップアップの多重表示防止ロック（lib/popup-lock 連携）
    useModalFocusTrap.ts     # Modal / Dialog 系コンポーネント共通の focus-trap hook（returnFocusRef 内蔵 + Escape close + Tab cycle + initialFocusRef option / isOpen option 対応、Modal.tsx と ConfirmModal.tsx の重複 60 行を集約、#790 Phase 1）
    useMenuKeyboard.ts       # ポータルメニューのキーボードナビゲーション（Arrow Up/Down・ESC・フォーカストラップ）
    useDelayedGalleryItems.ts # 削除された items を 300ms 保持してフェードアウト遷移を可能にする（masonic 時代から自前 virtualizer GalleryMasonrySelf でも継続利用、#822 で masonic 削除後も中間削除アニメーション用に残置）
    useHeaderScrollVisibility.ts # 下スクロールで header を隠し、上スクロール / 上端で表示する hook（scroll-direction.ts ラッパー、#677）
    useConfirm.ts            # window.confirm 代替 hook（Promise ベース確認モーダル。confirmModalProps を ConfirmModal に渡す）
    useTextInputModal.ts     # window.prompt / window.alert 代替 hook（Promise ベース入力モーダル、TextInputModal と組み合わせて使う、#881）
    useMarkAllRead.ts        # 全既読ロジック集約 hook（サブフィルター判定・50件確認・アンドゥ対応）
    useBulkArticleSelection.ts # 記事バルク選択状態管理 hook（BulkSelectionContext と BulkActionToolbar を橋渡し、Shift+click 範囲選択対応）
    useArticleViewProps.ts   # ArticleView に渡す props オブジェクトの useMemo 集約 hook（App.tsx から分割）
    useReaderSettingsValue.ts # ReaderSettingsProvider に渡す value オブジェクトを 1 箇所で構築する useMemo 集約 hook（App.tsx Step 1l から分割・40 フィールド集約）
    useCollectionArticleIds.ts # 選択中コレクションに含まれる記事 ID の Set を導出する hook（App.tsx Step 1t から分割）
    useArticleListItemProps.ts # ArticleList の各レイアウトが共通で使う ArticleItemProps を構築する hook
    useFeedSidebarActions.ts # FeedSidebarProvider value オブジェクト生成 hook（App.tsx から分割・useMemo 済み）
    useToast.ts              # トースト通知状態管理（success/error/info 3種別・最大3件スタック・自動消去）
    useGlobalFilterAutoRead.ts # globalFilter に引っかかった記事を自動既読にする（フィルター除外記事の未読カウント混入防止）
    useAutoLoadMoreArticles.ts # フィルター後の表示不足時にサーバーから過去記事を自動取得する（最大3回・無限ロード防止）
    useEngagementToggles.ts  # ブックマーク・後で読む・いいねのトグルハンドラー生成（トグルとエンゲージメント記録を統合）
    useHeaderShareTargets.ts # ArticleHeader / UserSettingsModal で使用するシェアターゲット設定フック
    useDigestFeedOrder.ts    # エンゲージメントスコアに基づくフィード表示順リスト（高スコア順 feedHash[]）を返す hook（ダイジェストビュー用）
    useArticleSelection.ts   # 記事選択ハンドラ + listFocusMode 時の overlay 開閉管理 hook（App.tsx から分割）
    useSaveArticleUrl.ts     # 任意 URL を /api/articles/save で保存して bookmark / readingList に登録するハンドラ hook（App.tsx から分割）
    useSnoozeHandler.ts      # スヌーズ実行ハンドラ + 表示用記事タイトル + 次記事自動遷移 hook（App.tsx から分割）
    useAppModalState.ts      # showHelp / showFeedSwitcher / showSettings の集約 + ?/Escape キーボードショートカット hook（App.tsx から分割）
    useDocumentTitleBadge.ts # 未読総数 → document.title + favicon バッジ更新の useEffect を切り出した hook（App.tsx から分割）
    useDesktopMediaQuery.ts  # `(min-width: 1024px)` matchMedia listener を SSR セーフに購読する hook（App.tsx から分割）
    useApiErrorToast.ts      # apiFetch 経由の通信エラーをトーストに 3 秒スロットルで通知する hook（App.tsx から分割）
    useOnlineRecoveryToast.ts # オフライン → オンライン復帰時のトースト通知 hook（前回 online 状態を ref で管理。App.tsx から分割）
    useGalleryAutoReadTracking.ts # ギャラリー自動既読 ID 追跡 hook（フィード/グループ/ビュー/レイアウト切替時に Set リセット。App.tsx から分割）
    useFeedPagination.ts     # サーバーフィードページネーション hook（feedHasMorePages 判定 + 単一/全フィード loadMore 分岐。App.tsx から分割）
    useArticleNavigation.ts  # filtered 内での currentIndex + prev/nextArticle 派生 hook（App.tsx から分割）
    useArticleImageMaxWidth.ts # 記事本文 `<img>` の HTML 属性 width/height が無いケースで naturalWidth から max-width を補完する hook（小さい画像の引き伸ばし防止）
    useMasonryLayout.ts      # ResizeObserver で item 高さ変化を監視し、`computeMasonryLayout` 再計算 + `computeScrollAnchorDelta` で scroll anchor 補正を自動実行する hook（rAF deferred で loop limit 警告回避）
    useAsyncFetch.ts         # 非同期 fetch 共通 hook（loading + error + AbortController + auto-fetch + transform ボイラープレートを集約、`useReadingStats` / `useEngagementEntries` / `useRecommendations` / `useFeedGroups` で使用）
  lib/
    auth.ts                  # JWT 検証 (JWKS)、トークン交換・リフレッシュ・失効
    server-auth.ts           # ServerSessionData / AuthSession インターフェース + withSession() / withJsonBody() / withBinarySession() / requireSession() / applyRefreshedTokens() / applyRefreshedTokensToResponse() / applyCooldown() / requireString() / assertSameOrigin() / parseJsonBody() / setAccessTokenCookies() / setSessionCookie() / createServerSession() / getServerSession() / updateServerSession() / deleteServerSession() / getAuthSession() / bindDbscToServerSession() / deduplicatedRefresh()
    beta-allowed.ts          # isBetaAllowed() — BETA_ALLOWED_SUBS チェック（next/* 非依存・拒否時に sub prefix を console.warn）
    r2.ts                    # r2Get() / r2Put() / sha256Hex()
    xml-parser.ts            # fast-xml-parser ラッパー (RSS 2.0 + Atom)
    content.ts               # コンテンツ抽出・後処理パイプライン (Readability + postProcess)
    html-post-processor.ts   # HTML後処理パイプライン本体（postProcess・applyCorePipeline・fixExternalLinks・wrapTables）+ サブモジュール re-export
    html-noise-removal.ts    # HTMLノイズ除去（removeNoise・processNestedBlocks・removeDivsByClass・replaceBlocksByClass・replaceUntilStable・removeOrphanedIconSvgs）
    json-ld-images.ts        # JSON-LD `Article` 型 image フィールドから記事主要画像 URL を抽出（extractJsonLdImages / appendMissingJsonLdImages）— 画像主体ページで Readability が主要画像を取りこぼした場合の補完源
    html-image-processors.ts # HTML画像処理（fixLazyImages・fixImageDimensions・rewriteImageUrls・removeSmallThumbnailImages・buildImageSlider・tryParseBase）
    html-video-processors.ts # HTML video / source 処理（rewriteVideoUrls — html-media-processors の thin wrapper、video-proxy 経由）
    html-media-processors.ts # HTML メディア (image / video) URL の proxy 統合書き換え純粋関数（rewriteMediaSrcAttrs、tags / proxyPath / srcset option 受取で image-proxy / video-proxy を統合）
    html-srcset.ts           # srcset 属性パース + URL 変換純粋関数（transformSrcset — Cloudinary など path 内 `,` 含む URL でも壊れない仕様）
    html-embed-transforms.ts # HTML埋め込み変換（Zenn・X Tweet・SpeakerDeck・SlideShare の iframe/リンク変換）
    readability-extractor.ts # Readabilityラッパー（iframe退避・preClean・本文抽出）
    regex-extractor.ts       # 正規表現ベース抽出（stripPageChrome・サイト固有セレクター）
    html.ts                  # sanitizeHtml() / escapeHtml() / toPlainText()
    article-utils.ts         # readingTime() / timeAgo() / isLikelyJapanese() / createReadingTimeCache (#685 メモ化)
    image-extractor.ts       # bestSrcFromSrcset() / collectImageUrlsFromHtml() / collectImageUrls()
    fetch.ts                 # RSS/HTML フェッチヘルパー (タイムアウト・リトライ)
    fetch-article-content.ts # /api/content 内のコンテンツ取得ロジック
    feed-discovery.ts        # フィード URL 自動検出
    ai-cache.ts              # AI 結果 R2 キャッシュ
    ai-route-helper.ts       # AI Route Handler 共通処理
    api-fetch.ts             # 認証付きクライアントサイド fetch ラッパー
    api-feed-guard.ts        # フィード API の subscription guard（assertFeedSubscribed — discriminated union 戻り値で `if (guard.err) return guard.err;` 後の `sub: UserSubscription` narrowing が効く、#691）
    embed-utils.ts           # iframe embed 処理ユーティリティ
    engagement-score.ts      # エンゲージメントスコア計算ロジック
    auto-ai-fallback.ts      # 自動翻訳・自動要約のブラウザ AI フォールバック判定純粋関数（shouldSkipAutoAi — #700 ブラウザ AI のみ使う設定）
    auto-read.ts             # オートモードの状態遷移判定純粋関数（isAutoReadFinished / shouldTriggerAutoFetch / shouldStartAutoSpeak）
    gallery-autoscroll.ts    # ギャラリー自動スクロール純粋関数（5 段階速度: off/slow/medium/fast/slideshow、computeContinuousScrollDelta / computeSlideshowJump / parseGalleryAutoScrollSpeed、#690）
    auto-read-debug.ts       # オートモード診断ログ用 localStorage gate ヘルパー（rss-debug-autoread キーで autoReadDebug を有効化、#678）
    bgaudio-debug.ts         # useBackgroundAudio 診断ログ用 localStorage gate ヘルパー（rss-debug-bgaudio キーで bgaudioDebug を有効化、#745 Phase C）
    piper-debug.ts           # usePiperTts (Piper wasm TTS engine) 診断ログ用 localStorage gate ヘルパー（rss-debug-piper キーで piperDebug を有効化、#1055）
    debug-helper.ts          # createDebugHelper factory（{ storageKey, expected, prefix } で evaluator + logger 関数ペアを生成、auto-read-debug.ts / bgaudio-debug.ts / piper-debug.ts の共通基盤）
    auto-read-persist.ts     # オートモード ON 状態を localStorage に保存・1 時間 TTL で復元する純粋関数（shouldRestore / parsePersisted、#679）
    scroll-direction.ts      # スクロール方向判定純粋関数（computeScrollDirection / computeHeaderVisibility、#677 ArticleHeader sticky toggle 用）
    inline-nav.ts            # インラインナビ領域クリック位置判定純粋関数（whichSideClicked）
    test-seed.ts             # /api/test/seed のリクエストボディ検証純粋関数（validateSeedRequest）
    article-filter.ts        # 記事フィルタリングロジック (feedId / 日付 / キーワード / クエリ)
    keyword-filter.ts        # キーワードフィルタリングマッチング（正規表現対応）
    linkedom-types.ts        # linkedom DOM 操作用の共有型定義（LDElement / LDDocument）
    llm-feed-generator.ts    # LLM で RSS のないサイトからフィード生成
    loadmore-cooldown.ts     # loadMore 連続発火を抑止する cooldown 判定純粋関数 (#773 案 A、shouldLoadMore / DEFAULT_LOADMORE_COOLDOWN_MS=1000ms)
    lru-cache.ts             # クライアントサイド LRU キャッシュ
    modal-focus.ts           # Modal / Dialog 系コンポーネントで共有する `FOCUSABLE_SELECTOR` 定数（Tab フォーカス可能要素 selector — Modal.tsx / ConfirmModal.tsx / FeedQuickSwitchModal.tsx の重複定義 drift を解消）
    menu-class.ts            # 全 dropdown / context menu 共通の container class 定数 `BASE_MENU_CLASS`（背景・枠・角丸・影・overflow — PortalMenuShell / ContextMenuShell / ArticleContextMenu / GalleryContextMenu の 4 箇所重複を集約）
    context-menu-position.ts # コンテキストメニュー / ポップアップの viewport-aware ポジショニング純粋関数（computeContextMenuPosition — ArticleContextMenu / GalleryContextMenu / FeedItemComponent menuAnchor 分岐の inline IIFE 重複を集約、refactor 監査 finding）
    selection-popup-position.ts # テキスト選択ポップアップ (SelectionExcludePopup) の viewport-aware ポジショニング純粋関数（computeSelectionPopupLayout — popup 実測サイズを受けて viewport 左右端 / 上端のはみ出しを補正、#1089）
    ogp.ts                   # OGP メタデータ取得ロジック
    ogp-cache-ttl.ts         # OGP cache TTL 算出純粋関数（computeOgpCacheTtl — Twitter fallback 経路の TTL を 1 日に短縮して poisoning 影響範囲を限定、#706）
    ogp-cache-schema.ts      # OGP cache schema 拡張 + lazy migration 純粋関数 (#808 Phase 1、v1 string → v2 object 変換 / title・description は次 fetch で追記する lazy migration / parseOgpCacheEntry / parseOgpCache / getOgpImage)
    ogp-cache-lru.ts         # OGP cache の true-LRU eviction 純粋関数（mergeWithLruEviction — 旧 FIFO eviction を LRU に修正、#1088 Finding 2）
    ai-summary-parse.ts      # AI summary text の line 分類純粋関数 (#811、parseSummaryLine / parseSummaryLines、heading / bullet / empty / paragraph、非 string 入力は safe fallback で TypeError 防御)
    binary-proxy-handler.ts  # image / video / 将来追加 binary 型のプロキシ共通 handler（handleBinaryProxy — auth ガード → URL 検証 → cache lookup → upstream fetch → mime 検証 → cachePutAsync を 1 箇所集約、image-proxy / video-proxy route から thin wrapper で呼ぶ、#757）
    proxy-error-headers.ts   # binary proxy (image / video / 将来 audio 等) のエラーレスポンスに optional Details field を `X-${prefix}-*` ヘッダーとして付与する共通 helper（`image-error-placeholder.ts` と `video-error-placeholder.ts` の重複 8 行を helper-drift 規範で集約、#856）
    bulk-selection.ts        # Shift+click による記事範囲選択の計算ユーティリティ
    booth-fallback.ts        # x.com / twitter.com 系フィードで summary 内の booth.pm URL を thumbnail fallback として抽出する純粋関数（extractBoothFallbackUrl — #750 Phase 1）
    opml.ts                  # OPML ビルド・パース純粋関数（buildOpml / extractFeeds）
    recommendation.ts        # フィード推薦ロジック
    shared-feed.ts           # 共有フィードの R2 ストレージヘルパー
    feed-groups.ts           # フィードグループ R2 読み書き（readFeedGroups / writeFeedGroups）
    collections.ts           # コレクション R2 読み書き（readCollections / writeCollections）
    concurrency.ts           # 並行度制限付き非同期マッピング（pMap / pMapSettled）
    download.ts              # Blob ダウンロードヘルパー（createObjectURL → <a> クリック → revoke）
    storage.ts               # localStorage キー定数・安全なラッパー
    url.ts                   # URL バリデーションヘルパー
    validation.ts            # 各種入力バリデーションユーティリティ
    image-constants.ts       # 画像処理の共有定数（IMAGE_MIN_DIMENSION）
    image-mime.ts            # 画像 MIME タイプ検証（ホワイトリスト方式・マジックバイト対応）
    image-error-placeholder.ts # 画像エラー時の SVG プレースホルダー生成（errorImageSvg — reason 細分化 + X-Image-Proxy-* ヘッダー二段観測性）
    video-mime.ts            # 動画 MIME タイプ検証（mp4 / webm / ogg / hls 等のホワイトリスト + マジックバイト）
    video-error-placeholder.ts # 動画エラー時のプレースホルダー応答（errorVideoResponse — body: null + X-Video-Proxy-Error ヘッダー、#751）
    mime-utils.ts            # MIME 共通ユーティリティ（parseFtypBrand — ISO BMFF ftyp box ブランド抽出）
    favicon.ts               # ファビコン未読バッジ
    web-push.ts              # Web Push 送信ヘルパー
    push-silent-hours.ts     # Push 通知サイレント時間帯判定（isInSilentHours / isValidTimeHHMM / isValidIanaTimezone）
    export-markdown.ts       # ブックマーク・読書リスト記事を Markdown ファイルとしてダウンロード
    export-readwise.ts       # メモ付き記事を Readwise CSV (Highlight/Title/Author/URL/Note/Date) としてダウンロード
    export-json.ts           # ブックマーク・読書リスト記事 (buildArticlesJson) + メモ (buildNotesJson) を構造化 JSON としてダウンロード — バックアップ/連携用
    export-shared.ts         # export-markdown / readwise / json 共通の field 抽出純粋関数（buildFeedTitleMap / clampSummaryText — helper-drift 解消）
    rate-limit.ts            # KV ベースのクールダウン・スライディングウィンドウ レートリミット (checkAndUpdateCooldown / checkSlidingWindow)
    rate-limit-logic.ts      # スライディングウィンドウ判定の純粋関数 (evaluateSlidingWindow) — next/* 非依存でユニットテスト可能
    serialize-async.ts       # 同一キー非同期操作の直列化ユーティリティ (serialized)
    sort-utils.ts            # `order: number` フィールドを持つ配列の安定ソート純粋関数（sortByOrder / computeNextOrder — useFeedGroups / useCollections の重複ロジックを集約 + sortCollectionsBy / COLLECTION_SORT_BY_CYCLE / COLLECTION_SORT_BY_LABELS — コレクション sort 軸切替 UI 用）
    feed-signature.ts        # feeds 構造 + articleTagIds 構造を 1 行にシリアライズする純粋関数（computeFeedStructuralSignature — id/title/category/groupId/nsfw/priority/view を encode + computeArticleTagIdsSignature — Record<articleId, tagId[]> を encode、useSidebarFeeds と useFeedSidebarActions の useMemo deps 置換で 5 分 polling / 2 秒 debounce 時の不要 re-render を抑制、#789）
    obsidian.ts              # Obsidian URI スキーム連携（obsidian://new URI 生成・ファイル名サニタイズ）
    html-to-markdown.ts      # HTML → Markdown 変換（linkedom/DOM 対応）・YAML frontmatter 生成
    reading-progress.ts      # 読書進捗計算純粋関数（computeProgress / clampProgress / buildAnchorSelector）
    reading-stats-level.ts   # ヒートマップ濃淡レベル算出純粋関数（countToLevel — count/max 比を 0-4 レベルに変換、ReadingStatsModal 分割で抽出）
    article-view-fab.ts      # 記事詳細本文「先頭へ戻る」FAB 表示判定純粋関数（shouldShowBackToTopFab — progress > 30 + TTS 非再生時のみ表示、#1149 案 C）
    reader-settings.ts       # リーダー表示設定（フォントサイズ 6段階・行間 5段階・コンテンツ幅 3段階）
    article-filter-equality.ts # `useFilteredArticles` の構造的等価判定純粋関数群（equalDigestLimitMap / equalStringMap / equalCompiledFilterMap / equalStringSet / equalViewFeedIds — `equalMap<V>` generic 経由 + Set 等価ガード）
    theme-preset.ts          # テーマプリセット永続化純粋関数（parseThemePresets / serializeThemePresets — `useThemePresets` から呼ぶ JSON 安全パース + 上限ガード）
    article-ttl.ts           # 記事 TTL 管理（30日超過・非保護の期限切れ記事フィルタリング）
    clip.ts                  # SingleFile POST リクエストバリデーション（validateClipRequest）
    api-error.ts             # API エラー整形ヘルパー（ApiError 型 / apiError() 関数）
    classify-http-error.ts   # クライアント側 HTTP エラー分類純粋関数（HttpErrorType / classifyHttpError / formatHttpErrorMessage / isRetryableHttpError）— #688
    cache-helper.ts          # Cloudflare Cache API 共通ヘルパー（buildCacheKey / cachePutAsync）
    csrf.ts                  # CSRF トークン発行・検証 + Origin ヘッダー検証（POST/PUT/DELETE 対応）
    rsshub.ts                # RSSHub インスタンス連携（自動 URL マッピング・アクセスキー付与・ルート解決）
    full-text-search.ts      # 記事全文検索クエリパーサー（フィールド検索・トークン化・正規表現対応）
    read-state-merge.ts      # 読み取り状態マージ純粋関数（local ∪ server / snoozed は遅い方優先 / notes はサーバー優先）
    feed-group-drop.ts       # フィードグループへのドラッグ&ドロップ時の競合解決ロジック
    image-proxy-url.ts       # 画像プロキシ URL ビルダー / プロキシ済み判定
    image-proxy-security.ts  # 画像プロキシリクエストの MIME / Content-Type / オリジン検証
    browser-ai-common.ts     # Summarizer / Translator 等 Chrome 組み込みブラウザ AI 共通ユーティリティ（BrowserAiAvailability 型・共通判定ロジックを集約、browser-summarizer.ts / browser-translator.ts から参照）
    browser-translator.ts    # ブラウザネイティブ翻訳 API（Translator）の利用可否判定・言語検出
    browser-summarizer.ts    # ブラウザネイティブ要約 API（Summarizer）の利用可否判定・要約実行
    translate-html.ts        # HTML DOM 内の翻訳対象テキスト抽出・翻訳適用
    tts-adapter.ts           # TTS engine 抽象化（TtsAdapter / TtsVoice / TtsEngineId 型 + speechSynthesisVoiceToTtsVoice 変換）— #675 Phase 1a で追加、#674 Piper wasm の差し替え基盤
    tts-text.ts              # TTS 読み上げ用テキスト前処理純粋関数（URL を「リンク」に置換）
    tts-volume.ts            # TTS 音量設定純粋関数（clampTtsVolume / parseTtsVolume — `[0.0, 1.0]` クランプ + localStorage 復元時の安全フォールバック、#699）
    tts-voice.ts             # TTS 音声選択純粋関数（selectTtsVoice / groupVoicesByLang — Web Speech API voice 列挙の優先順位・言語別グループ化）
    tts-sentences.ts         # TTS sentence tracking 純粋関数（splitIntoSentences / findSentenceAtCharIndex / estimateCharIndexByElapsed / selectActiveCharIndex — boundary + 推定の融合）
    tts-dom.ts               # TTS ハイライト用 HTML センテンス span ラップ純粋関数（wrapSentencesInHtml — linkedom 使用、`<pre>` `<code>` `<script>` `<style>` `<noscript>` 除外）
    tts-scroll.ts            # TTS ハイライトスクロール判定純粋関数（shouldScrollSentence — 中央 30〜70% 快適ゾーン外でセンタリングが必要かを返す / findScrollableAncestor）
    popup-lock.ts            # 同時に開けるブラウザポップアップ数を制限するクライアントサイドロック
    dbsc.ts                  # Device Bound Session Credentials (DBSC) ユーティリティ — 機能検出・チャレンジ生成・ヘッダービルダー (スケルトン)
    serialize-error.ts       # Error オブジェクトの構造化シリアライズ（ログ・通知用）
    retry-after.ts           # HTTP Retry-After ヘッダー（delta-seconds / HTTP-date）をミリ秒に変換（クライアント・cron で共有）
    read-state-storage.ts    # ReadState の localStorage 永続化ユーティリティ + ペンディング状態スナップショット
    read-state-prune.ts      # readBeforeTimestamp 以前の publishedAt を持つ既知記事の readId を物理削除する純粋関数 + ttlDays 連動の effective cutoff 算出
    gallery-prefetch.ts      # `usePrefetchGalleryContents` の `articlesKey` 生成純粋関数（visible 拡張で確実にキー変化させて effect 再実行をトリガー）
    gallery-display.ts       # `selectGalleryImages` 純粋関数（ギャラリー描画用の画像ソース選択: prefetched / thumb / none の 3 分岐）
    gallery-explode.ts       # `explodeArticlesIntoGalleryEntries` 純粋関数（画像/動画 view で 1 記事 N 画像を N カードに分解、`GalleryEntry` 型、Phase 0b）
    download-history.ts      # 画像 DL 履歴の URL FIFO 管理純粋関数（ギャラリー画像保存時の重複チェック）
    read-state-sync-api.ts   # ReadState のサーバー通信（fetchReadState・saveReadState）
    sw-cache.ts              # Service Worker キャッシュ管理
    type-guards.ts           # TypeScript 型ガード関数
    ai-models.ts             # Workers AI モデル定数・`isWorkersAiModelId` 型ガード
    article-ui-helpers.ts    # React 依存テキストハイライト関数（クライアント専用）
    dev-log.ts               # 開発環境専用 `devError` ラッパー
    dev-auth-bypass.ts       # dev / e2e 専用認証バイパス（getDevBypassUserId / buildDevBypassProfile — `DEV_AUTH_BYPASS_USER_ID` + `NODE_ENV !== "production"` 二重ガード）
    stats-helpers.ts         # 統計計算ヘルパー（`toDateStr` / `buildDayList`）
    unread-stats-merge.ts    # 未読統計 Map の structural equality 判定純粋関数（equalUnreadByFeed / equalLastPublishedByFeed — `useArticleUnreadStats` の Map 内容比較で reference を安定化、不要 re-render 抑制、#758）
    x-com-fallback.ts        # x.com / twitter.com の TTS / AI fallback 判定純粋関数（isTargetHost / isErrorContent / needsFallback — JS 無効エラー HTML を検出して別 source に切替、#718）
    cron-prefetch.ts         # 全ユーザーの engagement 集約で top-N feed を特定し、記事の本文・OGP を Cloudflare cron で事前 fetch するロジック
    engagement-aggregator.ts # 複数ユーザーの engagement 履歴を集約してグローバルフィード人気度スコアで top-N を返す純粋関数
    gallery-masonry-layout.ts # 画像ギャラリーの列レイアウト計算 (`computeMasonryLayout`) と scroll 巻き戻り補正 (`computeScrollAnchorDelta`) アルゴリズム
    piper-voices.ts          # piper-plus TTS engine で利用可能な voice 定義と配信方式 (R2 セルフホスト vs HuggingFace 直 fetch) のガイド
  cron/
    fetch.ts                 # fetchArticles(env, userId) / fetchAllFeeds(env)
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

`sessionId` = `crypto.randomUUID()`。refresh_token はブラウザに渡さずサーバー側のみで管理。
期限切れセッション（expiresAt 超過）は次回アクセス時に自動削除される。

### ユーザー別データ

```
users/{userId}/subscriptions.json       # UserSubscription[]（feedHash・url・customTitle・subscribedAt・filter・nsfw・requestCookie・priority・category・groupId・mutedUntil・lastAccessedAt・view・digestLimit）
users/{userId}/feed-groups.json         # FeedGroup[]（グループ定義: id / name / order / collapsed / muted / createdAt）
users/{userId}/collections.json         # Collection[]（コレクション定義: id / name / articleIds / createdAt / order）
users/{userId}/profile.json             # UserProfile（id・sub・email・name・picture）
users/{userId}/read-state.json          # ReadState（readIds・bookmarkIds・readingListIds・likeIds・snoozedUntil・notes・tagIds・globalFilter・readBeforeTimestamp・ttlDays）
users/{userId}/engagement.json          # EngagementLog（entries: EngagementEntry[]、最大 5,000 件）
users/{userId}/recommendations.json     # RecommendationCache（recommendations・generatedAt・dismissedIds・topics）
users/{userId}/push.json                # PushConfig（subscriptions: PushSubscriptionRecord[] / disabledFeeds: Record<feedHash, boolean> / silentStart / silentEnd / timezone）
users/{userId}/saved.json               # 手動保存記事（/api/articles/save）
users/{userId}/dbsc-session.json        # DbscSession（DBSC 登録済み公開鍵・検証日時）
users/{userId}/dbsc-challenge-{sessionId}.json  # DBSC チャレンジ（challenge・expiresAt、検証後削除）
users/{userId}/dbsc-pending-challenge.json      # DBSC 登録用ペンディングチャレンジ（登録完了後削除）
users/{userId}/feed-last-fetched.json           # { [feedHash]: lastFetchedAt } — cron が更新。/api/articles?since= の N+1 meta.json 読み込みを 1 R2 GET に削減するキャッシュ
```

`userId` = JWT の `sub` クレームをそのまま使用（`server-auth.ts` で `userId: payload.sub` と設定）。
Route Handler では `session.userId` でアクセスする。

### クールダウン管理（KV）

`RATE_LIMIT` KV namespace にキーとして格納される。本プロジェクトでは **2 形式が混在** している (`src/lib/r2.ts` 参照、#86 simplify F2 で文書化):

**legacy R2-style** (旧来の R2 path 形式を KV キーに流用、既存 live entries 改名不可):

```
users/{userId}/last-full-refresh.json           # 全フィード一括リフレッシュのクールダウン (refreshCooldownKey)
users/{userId}/ai-cooldown.json                 # AI エンドポイントのスライディングウィンドウ レートリミット (aiRateLimitKey)
users/{userId}/feed-refresh-{feedHash}.json     # 単体フィードリフレッシュのクールダウン (singleFeedRefreshCooldownKey)
users/{userId}/feed-reinfer-{feedHash}.json     # LLM CSS セレクタ再推論のクールダウン (reinferCooldownKey)
users/{userId}/recommendations-refresh.json     # 推薦リフレッシュのクールダウン (recommendationsCooldownKey)
users/{userId}/feed-add-cooldown.json           # フィード追加のクールダウン (feedAddCooldownKey)
users/{userId}/content-fetch-rate-limit.json    # /api/content fetch のスライディングウィンドウ (contentFetchRateLimitKey)
users/{userId}/clip-cooldown.json               # /api/clip クールダウン (clipCooldownKey)
users/{userId}/opml-import.json                 # OPML インポートのクールダウン (opmlImportCooldownKey)
```

**current KV-style** (`{userId}:xxx` のコロン区切り、新規 cooldown はこの形式で追加):

```
{userId}:push-subscribe                 # /api/push/subscribe のクールダウン (pushSubscribeCooldownKey)
{userId}:ogp-cooldown                   # /api/ogp のスライディングウィンドウ (ogpCooldownKey)
{userId}:engagement-cooldown            # /api/engagement のクールダウン (engagementCooldownKey)
{userId}:save-article-cooldown          # /api/articles/save のクールダウン (saveArticleCooldownKey)
```

**運用ルール** (`src/lib/r2.ts` comment より):

- 新規 KV クールダウンキーは必ず `{userId}:xxx` 形式 (current KV-style) で追加
- 既存 legacy 9 件 (R2-style) は live entries 改名で一時通過状態になるリスクあり、KV migration を別 Issue 化して一括統一
- `users/` プレフィックスは R2 path を連想させ KV dump で混乱の元 → 統一推奨

**burst 許容仕様**:

KV ベースのレートリミット (`checkSlidingWindow` / `checkAndUpdateCooldown` / `evaluateSlidingWindow`) は Cloudflare KV の **eventual consistency primitive** (atomic CAS / strict read-after-write 非対応) に依存しており、**~1-3 req 程度の burst が `maxCalls` を超過し得る** best-effort 仕様。

具体的なシナリオ:

1. concurrent な複数 request が KV `get` で stale な count 値を読む (replication 遅延)
2. 各 request が「未到達」判定で pass する
3. 全 request が KV `put` で count++ → 結果的に limit 超過 + 既に request 通過済

これは **意図的な設計選択** (KV 軽量設計方針の維持) であり、strict 制限が必要な場合は **D1 / Durable Object への migration** が要件となる (大規模変更、本プロジェクトでは未採用)。

**運用への影響**:

- 新規 KV cooldown / sliding window を追加するとき、`maxCalls` は **~1-3 req の burst 許容** を加味して設定する (例: 「実質上限 10 req/min を期待」なら `maxCalls = 7-9` で burst 込み 10 程度に収まる)
- セキュリティ critical な制限 (例: brute force 認証、課金境界) には **KV ベースの sliding window を採用しない** ことを検討 (atomic 制約を要求する場合は別 infra)
- 関連実装の JSDoc に同等仕様コメントを併記済 (`src/lib/rate-limit-logic.ts#evaluateSlidingWindow`)

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
VAPID_SUBJECT = "mailto:admin@0g0.xyz"  # Web Push 送信元メール
```

### Cloudflare Workers シークレット

```bash
npx wrangler secret put CLIENT_ID              # 0g0-id services テーブルに登録された BFF クライアント ID
npx wrangler secret put CLIENT_SECRET          # 対応するクライアントシークレット
npx wrangler secret put BETA_ALLOWED_SUBS      # ベータアクセス許可 sub のカンマ区切りリスト (空 = 制限なし、pairwise sub を public repo に晒さないため secret 管理)
npx wrangler secret put VAPID_PUBLIC_KEY       # Web Push VAPID 公開鍵
npx wrangler secret put VAPID_PRIVATE_KEY      # Web Push VAPID 秘密鍵
npx wrangler secret put CLOUDFLARE_API_TOKEN   # 全文取得フォールバック用 (オプション)
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID  # Cloudflare AI toMarkdown API 用アカウント ID（CLOUDFLARE_API_TOKEN と組み合わせて使用、オプション）
npx wrangler secret put BRAVE_SEARCH_API_KEY   # フィード推薦検索用 (オプション)
npx wrangler secret put RSSHUB_INSTANCE_URL    # セルフホスト RSSHub の URL（例: https://rsshub.example.com、オプション）
npx wrangler secret put RSSHUB_ACCESS_KEY      # RSSHub のアクセスキー（オプション）
```

> **認証方式**: 0g0-id API との通信は `Authorization: Basic <CLIENT_ID:CLIENT_SECRET>` のみ。
> `X-Internal-Secret` / `X-BFF-Origin` ヘッダーは廃止済み（Phase 9 以降）。
> `CLIENT_ID` は 0g0-id の services テーブルへの事前登録が必須。
>
> **オプション環境変数 (wrangler.toml vars)**:
> `INTERNAL_SERVICE_USER_AGENT` — 0g0-id への fetch に使う User-Agent 文字列（未設定時は `rss-reader/1.0 (+https://rss.0g0.xyz)`）。
> Cloudflare WAF / Bot Fight Mode で Worker-to-Worker fetch が bot 判定されるのを防ぐために設定する。
>
> **dev / e2e 専用環境変数**:
> `DEV_AUTH_BYPASS_USER_ID` — 開発・e2e テスト時のみ有効な認証バイパスを起動するユーザー ID（英数字 / `_` / `-` / `@` / `.` の 1〜128 文字）。
> `process.env.NODE_ENV !== "production"` の AND 条件で動作するため、production ビルドでは Next.js の NODE_ENV inline により dead code 化されて含まれない。
> `playwright.config.ts` の `webServer.env` で `e2e-test-user` が自動セットされ、`/api/auth/me` が fakeProfile を返して認証後画面の e2e カバレッジを取れるようにする。
> 通常の本番デプロイには **絶対に設定しないこと**。

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

## Hooks 層設計 (`src/hooks/`)

`src/hooks/` には 122 ファイル の React Hook が配置される。`AppShell.tsx` の状態管理を機能別に分割した結果として大規模化したが、責務境界を明確にするため以下の **カテゴリ分類 + 命名規則** に従う。

### カテゴリ分類

| Prefix             | 件数 | 責務                                                                                                   |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------------ |
| `useArticle*`      | 20   | 記事単体の表示・操作・状態 (内容取得・選択・ハイライト・進捗)                                          |
| `useReadState*` 系 | 8    | 既読・読書ステータス (Set 管理・TTL 計算・persistence)                                                 |
| `useFeed*`         | 10   | フィード一覧・操作 (CRUD・選択・グループ・並び順)                                                      |
| `useAuto*`         | 4    | 自動化機能 (autoLoadMore / autoRead / autoReadSettings / autoReset)                                    |
| `useGallery*`      | 4    | ギャラリー自動既読・自動スクロール・スワイプナビ (AutoRead / AutoReadTracking / AutoScroll / SwipeNav) |
| `useTts*`          | 3    | TTS engine 共通制御 (rate / voice / volume / highlight 同期)                                           |
| `useEngagement*`   | 3    | エンゲージメント計算 (スコア集計・ダイジェスト順序)                                                    |
| `useCollection*`   | 2    | 任意 URL コレクション (CRUD・記事 ID Set)                                                              |
| その他             | ~68  | App-shell サブフック (`useAppModal*` / `useFeedSidebar*` 等)                                           |

### 命名規則

- **`use<Subject><Action>`**: 動詞は subject の責務を表す (例: `useArticleSelection`, `useFeedOperations`)
- **`use<Subject><State>`**: 状態 hook は名詞単数 / 集約 hook は `*Props` / `*State` 接尾辞 (例: `useArticleViewProps`, `useAppModalState`)
- **`use<Engine><Capability>`**: 横断 capability は engine 名 + 機能 (例: `useTtsHighlight`, `useMediaSession`)
- **`use<Subject><Modifier>`**: option 化された亜種は modifier suffix (例: `useDelayedGalleryItems` / `useImageProxyFallback`)

### 設計原則

| 原則                                                    | 例                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **副作用は `useEffect` cleanup で必ず解放**             | `useBackgroundAudio` の oscillator stop / `useGalleryAutoScroll` の interval clear |
| **state 多数を return する hook は `useMemo` でラップ** | `useArticleViewProps` / `useReaderSettingsValue` (40+ field 集約)                  |
| **render 中の最新値同期は `useSyncedRef`**              | `react-state-ref.md § useSyncedRef 規範` 参照                                      |
| **silent fallback 禁止**: 失敗時は `devError` 添える    | `browser-platform.md § silent fallback の禁止` 参照                                |
| **canonical pattern 流用** で sibling drift を避ける    | `useMenuKeyboard` (menu / popup 共通) / `useModalFocusTrap` (Modal 共通)           |

### 巨大 hook 分割の判断軸

ファイル行数が 300 行を超える、または state 6+ + useEffect 4+ を 1 hook が持つ場合は分割を検討:

- **責務単位で抽出** (例: `useArticleViewState` → `useArticleViewProgress` / `useArticleViewTts` / `useArticleViewShortcuts`)
- **orchestrator + sub-hook** 構造 (例: `useFilteredArticles` = `useArticleFilters` + `useArticleSorting` + `useArticlePagination`)
- **詳細**: `react-component-split.md § 大きいコンポーネント / hook の機能別分割` 参照

### 詳細化の進捗

本章は概要レベルから段階的に拡充されている:

- **Phase 1 (完了)**: 本章「Hooks 層設計」section 自体 (カテゴリ分類 / 命名規則 / 設計原則)
- **Phase 2 (完了)**: `src/lib/` (133 files) 機能別グループ化の subsection (下記参照)
- **Phase 3 (完了)**: 主要 public export hook 20 件に JSDoc `@param` / `@returns` 注釈追加 (IDE hover 改善、残 hook は新規追加サイクルで漸進整備)

---

## src/lib/ 層設計 (`src/lib/`)

`src/lib/` には 141 ファイル の純粋関数 / ヘルパー / ラッパーが配置される。Workers + ブラウザ両環境で再利用される基盤レイヤーとして責務境界を明確にするため、以下の **機能別グループ + 採用すべき canonical pattern** に従う。

### グループ分類

| グループ                    | 主な責務                                                                              | 代表ファイル                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HTML 処理 pipeline**      | 本文抽出・ノイズ除去・画像/動画/embed 変換・sanitize                                  | `content.ts` / `html-post-processor.ts` / `html-noise-removal.ts` / `html-image-processors.ts` / `html-video-processors.ts` / `html.ts` / `readability-extractor.ts` / `regex-extractor.ts`                                                                                                                                                                                                                                                                                                                                                          |
| **画像 / 動画プロキシ**     | binary proxy 共通 handler + MIME 検証 + エラー応答 + 観測性ヘッダ                     | `binary-proxy-handler.ts` / `image-mime.ts` / `video-mime.ts` / `image-error-placeholder.ts` / `video-error-placeholder.ts` / `proxy-error-headers.ts` / `image-proxy-security.ts` / `image-proxy-url.ts`                                                                                                                                                                                                                                                                                                                                            |
| **認証 / セキュリティ**     | JWT 検証・session/refresh 管理・CSRF・DBSC・入力 validation・SSRF                     | `auth.ts` / `server-auth.ts` / `csrf.ts` / `dbsc.ts` / `validation.ts` / `url.ts` / `beta-allowed.ts` / `dev-auth-bypass.ts`                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **R2 / KV / Cache 操作**    | R2 read/write・SHA256・cache key・LRU・rate-limit                                     | `r2.ts` / `shared-feed.ts` / `cache-helper.ts` / `sw-cache.ts` / `lru-cache.ts` / `rate-limit.ts` / `rate-limit-logic.ts`                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **記事 / フィード処理**     | RSS パース・記事フィルタ・既読マージ・TTL・signature                                  | `xml-parser.ts` / `article-filter.ts` / `article-utils.ts` / `article-ttl.ts` / `read-state-merge.ts` / `read-state-prune.ts` / `feed-discovery.ts` / `feed-signature.ts` / `feed-groups.ts`                                                                                                                                                                                                                                                                                                                                                         |
| **AI / TTS**                | Workers AI / browser AI / TTS adapter / voice 選択 / sentence                         | `ai-cache.ts` / `ai-route-helper.ts` / `ai-models.ts` / `browser-summarizer.ts` / `browser-translator.ts` / `tts-adapter.ts` / `tts-text.ts` / `tts-voice.ts` / `tts-sentences.ts` / `tts-dom.ts`                                                                                                                                                                                                                                                                                                                                                    |
| **OGP / Embed / fallback**  | OGP 取得・cache schema・LRU eviction・embed 変換・x.com / booth.pm fallback           | `ogp.ts` / `ogp-cache-ttl.ts` / `ogp-cache-schema.ts` / `ogp-cache-lru.ts` / `embed-utils.ts` / `x-com-fallback.ts` / `booth-fallback.ts` / `favicon.ts`                                                                                                                                                                                                                                                                                                                                                                                             |
| **ギャラリー / レイアウト** | masonry 計算・autoscroll・loadmore cooldown・scroll direction                         | `gallery-display.ts` / `gallery-prefetch.ts` / `gallery-explode.ts` / `gallery-autoscroll.ts` / `gallery-masonry-layout.ts` / `loadmore-cooldown.ts` / `scroll-direction.ts`                                                                                                                                                                                                                                                                                                                                                                         |
| **自動モード / 自動既読**   | autoMode 状態遷移・persist・debug gate                                                | `auto-read.ts` / `auto-read-persist.ts` / `auto-read-debug.ts` / `auto-ai-fallback.ts` / `bgaudio-debug.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **エンゲージメント / 推薦** | engagement score・top-N 集約・recommendation・cron prefetch                           | `engagement-score.ts` / `engagement-aggregator.ts` / `recommendation.ts` / `cron-prefetch.ts` / `download-history.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **API / fetch ヘルパー**    | apiError 整形・authenticated fetch・HTTP エラー分類・retry                            | `api-error.ts` / `api-fetch.ts` / `api-feed-guard.ts` / `classify-http-error.ts` / `retry-after.ts` / `fetch.ts` / `fetch-article-content.ts`                                                                                                                                                                                                                                                                                                                                                                                                        |
| **エクスポート / 変換**     | Markdown / Readwise / JSON / OPML 変換・共通 field 抽出・Obsidian URI                 | `export-markdown.ts` / `export-readwise.ts` / `export-json.ts` / `export-shared.ts` / `html-to-markdown.ts` / `opml.ts` / `obsidian.ts` / `clip.ts`                                                                                                                                                                                                                                                                                                                                                                                                  |
| **プラットフォーム / 基盤** | storage / dev-log / serialize / concurrency / type guards / 位置計算 / empty sentinel | `storage.ts` / `dev-log.ts` / `serialize-error.ts` / `serialize-async.ts` / `concurrency.ts` / `type-guards.ts` / `modal-focus.ts` / `menu-class.ts` / `context-menu-position.ts` / `selection-popup-position.ts` / `popup-lock.ts` / `empty-sentinels.ts`                                                                                                                                                                                                                                                                                           |
| **その他**                  | Push silent hours / RSSHub / keyword filter / 全文検索 / stats                        | `web-push.ts` / `push-silent-hours.ts` / `rsshub.ts` / `keyword-filter.ts` / `full-text-search.ts` / `stats-helpers.ts` / `unread-stats-merge.ts` / `reading-progress.ts` / `reader-settings.ts` / `sort-utils.ts` / `test-seed.ts` / `inline-nav.ts` / `mime-utils.ts` / `image-constants.ts` / `image-extractor.ts` / `json-ld-images.ts` / `linkedom-types.ts` / `translate-html.ts` / `llm-feed-generator.ts` / `download.ts` / `piper-voices.ts` / `collections.ts` / `feed-group-drop.ts` / `read-state-storage.ts` / `read-state-sync-api.ts` |

### 命名規則

- **`<feature>-<aspect>.ts`**: 機能 + 観点で分割 (例: `ogp-cache-ttl.ts` / `ogp-cache-schema.ts` / `read-state-merge.ts` / `read-state-prune.ts`)
- **`<feature>-utils.ts`**: 汎用ユーティリティの集約 (例: `mime-utils.ts` / `sort-utils.ts` / `article-utils.ts` / `stats-helpers.ts`)
- **`<engine>-<capability>.ts`**: engine + 機能 (例: `tts-adapter.ts` / `tts-text.ts` / `piper-voices.ts` / `browser-summarizer.ts`)
- **`<feature>-fallback.ts`**: 特定サイト / 条件向け fallback (例: `x-com-fallback.ts` / `booth-fallback.ts` / `auto-ai-fallback.ts`)
- **`<feature>-debug.ts`**: localStorage gate 付き本番デバッグログ (例: `auto-read-debug.ts` / `bgaudio-debug.ts` / `piper-debug.ts`)
- **`.test.ts` vs `.spec.ts`**: vitest unit test は `.test.ts` (現状 `src/lib/*.test.ts` 例: `article-utils.test.ts` / `binary-proxy-handler.test.ts` 等 13 件、`src/hooks/*.test.ts` / `src/hooks/*.test.tsx` 例: `useArticleListItemProps.test.ts` / `usePiperTts.test.ts` 等 17 件、`src/hooks/__tests__/*.test.ts` / `src/components/*.test.tsx` 例: `FeedHealthModal.test.tsx`)、playwright e2e は `e2e/*.spec.ts`

### 設計原則

| 原則                                                                  | 例                                                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **純粋関数優先**: 副作用なし + 入出力 deterministic                   | `auto-read.ts#shouldStartAutoSpeak` / `gallery-display.ts#selectGalleryImages` / `tts-text.ts`         |
| **Workers + ブラウザ両環境互換**                                      | `next/*` import 禁止 (Route Handler 専用は `server-auth.ts` 等に集約)、`globalThis` 経由でブラウザ API |
| **silent fallback 禁止**: `try/catch → null` には `devError` を添える | `browser-platform.md § silent fallback の禁止` 参照                                                    |
| **helper drift 防止**: 新規追加前に既存 helper を grep                | `helper-drift.md § 新規 Route Handler / hook を書くときは既存 lib helpers を先に grep` 参照            |
| **type alias で重複定義を canonical 化**                              | `useArticleAi.ts` の `AiErrorType = HttpErrorType`、`classify-http-error.ts` 経由で統一                |
| **TDD 必須**: 新規純粋関数は `.spec.ts` or `.test.ts` で全分岐網羅    | `selectGalleryImages` 5 分岐 / `classifyHttpError` 30 ケース等                                         |

### 新規 lib 追加時の判断軸

1. **既存グループに該当するか確認** — 上記表で responsible group を特定
2. **既存 helper の流用検討** — `helper-drift.md` 規範に従い `validation.ts` / `r2.ts` / `api-error.ts` 等を grep
3. **ファイル名は `<feature>-<aspect>.ts` で命名** — 同 feature の関連ファイルが file system 上で隣接するように
4. **type alias で重複定義を避ける** — 既存 type と semantic が同じなら `export type X = CanonicalType;`
5. **テスト**: 純粋関数なら `.test.ts` (vitest) で追加、Cloudflare binding 依存なら `e2e/*.spec.ts` (playwright)
6. **architecture.md 更新**: 新規 lib 追加と同 commit で本セクション + ASCII tree (line 396 付近) + テストカバレッジマップに entry 追加

### 巨大 lib 分割の判断軸

ファイル行数が 500 行を超える、または 3 つ以上の異なる責務を 1 ファイルに持つ場合は分割を検討:

- **責務単位で抽出** (例: `html-post-processor.ts` → `html-noise-removal.ts` / `html-image-processors.ts` / `html-video-processors.ts` / `html-media-processors.ts` / `html-srcset.ts` / `html-embed-transforms.ts`)
- **pipeline orchestrator + step 関数** 構造 (例: `content.ts` がオーケストレーター、各 step が独立 lib)
- **`<feature>-<aspect>.ts` 命名で分割後の親子関係を可読化** (例: `ogp.ts` → `ogp-cache-ttl.ts` / `ogp-cache-schema.ts` で同 feature の aspect 別ファイル)

### 拡充候補 (将来サイクル)

本 subsection は機能別グループ化レベル。以下は将来の docs sweep 候補:

- group 別 cross-dependencies の図示
- Workers vs ブラウザ環境マトリクス (各 lib がどちらで動くか)
- 新規 import 時の推奨順序 (canonical helper 優先 / type alias 統一)

---

## テストカバレッジマップ

`e2e/*.spec.ts` 各ファイルと対象モジュールの対応表。

<!-- TEST_COVERAGE_MAP_AUTO_GEN START -->
<!--
  この section は将来 `scripts/generate-test-coverage-map.mjs` で自動生成する設計 (#731 Phase 2)。
  Phase 1 (本マーカー設置時点): スクリプト作成済だが未実行。下記既存テーブルが canonical。
  Phase 2 で各 spec の冒頭 JSDoc 1 行目に description を整備 → `pnpm run gen:coverage-map` で
  このマーカー間が自動上書きされる。
-->

| テストファイル                                  | 対象モジュール / 機能                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai-route-helper.spec.ts`                       | `src/lib/ai-models.ts` — `isWorkersAiModelId` 型ガード（ai-route-helper.ts は Cloudflare バインディング依存のため間接検証）                                                                                                                                                                                                                                |
| `api-health.spec.ts`                            | 認証不要エンドポイントの基本動作確認（`/api/health` の 200 レスポンス等）。他の認証済エンドポイントの 401 ガードは別 spec でカバー                                                                                                                                                                                                                         |
| `article-filter.spec.ts`                        | `src/lib/article-filter.ts` — 記事フィルタリングロジック                                                                                                                                                                                                                                                                                                   |
| `digest-skip-read.spec.ts`                      | `src/lib/article-filter.ts` — ダイジェスト時に既読は digestLimit カウントから除外                                                                                                                                                                                                                                                                          |
| `article-search.spec.ts`                        | `src/hooks/useFullTextSearch` 経由の全文検索                                                                                                                                                                                                                                                                                                               |
| `article-ttl.spec.ts`                           | `src/lib/article-ttl.ts` — TTL 管理純粋関数                                                                                                                                                                                                                                                                                                                |
| `auto-read.spec.ts`                             | `src/lib/auto-read.ts` — オートモード状態遷移判定純粋関数                                                                                                                                                                                                                                                                                                  |
| `auto-read-debug.spec.ts`                       | `src/lib/auto-read-debug.ts` — `evaluateAutoReadDebugEnabled` localStorage gate 純粋判定 (#678)                                                                                                                                                                                                                                                            |
| `bgaudio-debug.spec.ts`                         | `src/lib/bgaudio-debug.ts` — `evaluateBgAudioDebugEnabled` localStorage gate 純粋判定 (#745 Phase C 案 B、`auto-read-debug.ts` の `evaluateAutoReadDebugEnabled` と同 pattern: 厳密一致 "1" のみ true)                                                                                                                                                     |
| `piper-debug.spec.ts`                           | `src/lib/piper-debug.ts` — `evaluatePiperDebugEnabled` localStorage gate 純粋判定 (#1055、`bgaudio-debug.ts` / `auto-read-debug.ts` と同 pattern: 厳密一致 "1" のみ true)                                                                                                                                                                                  |
| `auto-read-persist.spec.ts`                     | `src/lib/auto-read-persist.ts` — `parsePersistedAutoReadState` / `serializeAutoReadState` / `shouldRestoreAutoMode` (1 時間 TTL 復元) (#679)                                                                                                                                                                                                               |
| `auto-ai-fallback.spec.ts`                      | `src/lib/auto-ai-fallback.ts` — `shouldSkipAutoAi` 純粋関数（#700 ブラウザ AI のみ使う設定の skip 判定 全 4 ケース）                                                                                                                                                                                                                                       |
| `gallery-autoscroll.spec.ts`                    | `src/lib/gallery-autoscroll.ts` — 5 段階速度 enum / 連続スクロール delta 計算 / スライドショー jump 計算 / 不正値 fallback 全 22 ケース (#690)                                                                                                                                                                                                             |
| `scroll-direction.spec.ts`                      | `src/lib/scroll-direction.ts` — `computeScrollDirection` / `computeHeaderVisibility` 純粋関数 (#677, ArticleHeader sticky toggle)                                                                                                                                                                                                                          |
| `inline-nav-click.spec.ts`                      | `src/lib/inline-nav.ts` — インラインナビ クリック位置判定純粋関数                                                                                                                                                                                                                                                                                          |
| `strip-html-with-breaks.spec.ts`                | `src/lib/html.ts#stripHtmlWithBreaks` — `<br>` / `<p>` を改行に変換する HTML strip                                                                                                                                                                                                                                                                         |
| `test-seed-validation.spec.ts`                  | `src/lib/test-seed.ts` — e2e seed リクエストボディ検証純粋関数                                                                                                                                                                                                                                                                                             |
| `test-seed-integration.spec.ts`                 | `app/api/test/seed/route.ts` — seed エンドポイント smoke test                                                                                                                                                                                                                                                                                              |
| `article-utils.spec.ts`                         | `src/lib/article-utils.ts` — readingTime / timeAgo / createReadingTimeCache (#685 メモ化キャッシュ 7 ケース) / compareByDateDesc / compareByPublishedAtDesc (2 関数の仕様差分明文化 14 ケース) / getArticleTimestamp (#1063 publishedAt ?? createdAt fallback chain 集約 3 ケース)                                                                         |
| `article-view-fab.spec.ts`                      | `src/lib/article-view-fab.ts` — `shouldShowBackToTopFab` (progress > 30 + !ttsPlaying + !ttsPaused、#1149 案 C 境界条件全網羅)                                                                                                                                                                                                                             |
| `shortcuts.spec.ts`                             | `src/config/shortcuts.ts` — `SHORTCUT_DEFS` 完全性 spec (unreadOnly / bookmarkOnly / readingListOnly / likeOnly / noteOnly / digestMode の sibling filter handler 網羅、#1147 で `noteOnly` の "N" entry 追加)                                                                                                                                             |
| `article-utils.test.ts`                         | `src/lib/article-utils.ts` — vitest smoke test (#682 Phase A: vitest + happy-dom + jest-dom matcher 動作保証、React component test 追加基盤として残置)                                                                                                                                                                                                     |
| `binary-proxy-handler.test.ts`                  | `src/lib/binary-proxy-handler.ts#handleBinaryProxy` — cache MIME 再検証 spec (#853 security 案 B、attacker controlled URL の cache poisoning 防御を TDD で検証)                                                                                                                                                                                            |
| `articles-save.spec.ts`                         | `app/api/articles/save/route.ts` — 記事手動保存 API                                                                                                                                                                                                                                                                                                        |
| `auth-headers.spec.ts`                          | 認証ヘッダー処理                                                                                                                                                                                                                                                                                                                                           |
| `auth-utils.spec.ts`                            | `src/lib/auth.ts` — JWT 検証・トークン交換 (`getJwtExp` の null/exp 数値以外/有効 JWT 全 4 ケース網羅)                                                                                                                                                                                                                                                     |
| `auth.spec.ts`                                  | `/api/auth/*` エンドポイント統合テスト                                                                                                                                                                                                                                                                                                                     |
| `beta-allowed.spec.ts`                          | `src/lib/beta-allowed.ts` — BETA_ALLOWED_SUBS チェック・拒否時の調査ログ                                                                                                                                                                                                                                                                                   |
| `dev-auth-bypass-unit.spec.ts`                  | `src/lib/dev-auth-bypass.ts` — getDevBypassUserId / buildDevBypassProfile の境界値                                                                                                                                                                                                                                                                         |
| `dev-auth-bypass.spec.ts`                       | `src/lib/dev-auth-bypass.ts` 統合テスト — `/api/auth/me` が fakeProfile を返すか e2e 検証 (`DEV_AUTH_BYPASS_USER_ID` セット時)                                                                                                                                                                                                                             |
| `storage.spec.ts`                               | `src/lib/storage.ts` — toggleSetItem の Set トグル動作・deferred-save の冪等性・Node 環境での安全性                                                                                                                                                                                                                                                        |
| `browser-summarizer.spec.ts`                    | `src/lib/browser-summarizer.ts` — ブラウザネイティブ要約 API                                                                                                                                                                                                                                                                                               |
| `browser-translator.spec.ts`                    | `src/lib/browser-translator.ts` — Chrome Translator API 検出                                                                                                                                                                                                                                                                                               |
| `cache-control.spec.ts`                         | `/api/articles` の Cache-Control ヘッダー                                                                                                                                                                                                                                                                                                                  |
| `articles-cache.spec.ts`                        | `/api/articles` の Cloudflare Cache API 統合 (since なし GET 経路の X-Cache ヘッダー検証、Issue #781、dev 環境は caches.default 未定義のため bypass 環境のみ動作)                                                                                                                                                                                          |
| `api-fetch-describe-status.spec.ts`             | `src/lib/api-fetch.ts#describeStatus` — HTTP status → ユーザー向けメッセージ分類純粋関数 (#804、401「再ログイン」と 403「アクセス権限がありません」のメッセージ分離を固定)                                                                                                                                                                                 |
| `cache-helper.spec.ts`                          | `src/lib/cache-helper.ts` — Cloudflare Cache API ヘルパー                                                                                                                                                                                                                                                                                                  |
| `cascade-overflow.spec.ts`                      | `src/lib/shared-feed.ts` — 500 件超えページカスケード                                                                                                                                                                                                                                                                                                      |
| `cron-fetch.spec.ts`                            | `src/cron/fetch.ts` — buildArticle / applyFeedSuccess / applyFeedRateLimit / applyFeedError / buildBatchedPushPayload                                                                                                                                                                                                                                      |
| `cron-prefetch.spec.ts`                         | `src/lib/cron-prefetch.ts#selectPrefetchTargets` — cron prefetch 対象 URL 構築純粋関数 (#803 Phase 2、link 空 / 重複除外 / maxArticlesPerFeed / topN / feed 優先度 × publishedAt 降順)                                                                                                                                                                     |
| `clip.spec.ts`                                  | `src/lib/clip.ts` — SingleFile POST バリデーション                                                                                                                                                                                                                                                                                                         |
| `collections-api.spec.ts`                       | `app/api/collections/**/route.ts` — コレクション CRUD API                                                                                                                                                                                                                                                                                                  |
| `concurrency.spec.ts`                           | `src/lib/concurrency.ts` — pMap 並行処理                                                                                                                                                                                                                                                                                                                   |
| `content-extraction.spec.ts`                    | `src/lib/content.ts` — 本文抽出 (Readability + regex)                                                                                                                                                                                                                                                                                                      |
| `cron-rate-limit.spec.ts`                       | `src/lib/rate-limit.ts` — スライディングウィンドウ制限                                                                                                                                                                                                                                                                                                     |
| `rate-limit-sliding-window.spec.ts`             | `src/lib/rate-limit-logic.ts` — `evaluateSlidingWindow` 通過/拒否判定・Retry-After 算出・境界値                                                                                                                                                                                                                                                            |
| `csp-img-src.spec.ts`                           | `middleware.ts` — CSP `img-src` ディレクティブの proxy 強制画像読み込み検証 (#923)                                                                                                                                                                                                                                                                         |
| `csrf-origin.spec.ts`                           | `src/lib/csrf.ts` — CSRF トークン・Origin 検証                                                                                                                                                                                                                                                                                                             |
| `dbsc.spec.ts`                                  | `src/lib/dbsc.ts` — チャレンジ生成・ヘッダー構築・署名検証                                                                                                                                                                                                                                                                                                 |
| `engagement-score.spec.ts`                      | `src/lib/engagement-score.ts` — エンゲージメントスコア計算                                                                                                                                                                                                                                                                                                 |
| `engagement-aggregator.spec.ts`                 | `src/lib/engagement-aggregator.ts#aggregateGlobalTopFeeds` — 全ユーザー engagement 集約で top-N feed 純粋関数 (#803 Phase 1、cron prefetch 基盤、now 引数化で時間減衰固定)                                                                                                                                                                                 |
| `everia-pagination.spec.ts`                     | `src/lib/content.ts#detectNextPageUrl` — everia.club WordPress `<!--nextpage-->` ページネーション検出                                                                                                                                                                                                                                                      |
| `embed-utils.spec.ts`                           | `src/lib/embed-utils.ts` — iframe embed 処理ユーティリティ                                                                                                                                                                                                                                                                                                 |
| `export-markdown.spec.ts`                       | `src/lib/export-markdown.ts` — Markdown エクスポート                                                                                                                                                                                                                                                                                                       |
| `export-readwise.spec.ts`                       | `src/lib/export-readwise.ts` — Readwise CSV エクスポート                                                                                                                                                                                                                                                                                                   |
| `export-shared.spec.ts`                         | `src/lib/export-shared.ts` — `buildFeedTitleMap` / `clampSummaryText` 共通 field 抽出純粋関数（export-markdown / readwise / json の重複集約、helper-drift 解消、7 ケース網羅）                                                                                                                                                                             |
| `export-json.spec.ts`                           | `src/lib/export-json.ts` — `buildArticlesJson` / `buildNotesJson` 純粋関数（mode 別 label / feedTitle 解決 / summary stripHtml+300字 clamp / note 本文+改行保持 / author・publishedAt null / exportedAt ISO、22 ケース網羅、#1110 / #1111）                                                                                                                |
| `feed-actions.spec.ts`                          | `src/components/feed-item/feedActions.tsx#buildFeedActions` — FeedItem actions 配列構築純粋関数                                                                                                                                                                                                                                                            |
| `feed-discovery.spec.ts`                        | `src/lib/feed-discovery.ts` — RSS 自動探索                                                                                                                                                                                                                                                                                                                 |
| `feed-group-drop.spec.ts`                       | `src/lib/feed-group-drop.ts` — D&D 競合解決ロジック                                                                                                                                                                                                                                                                                                        |
| `feedview-storage-key.spec.ts`                  | `src/lib/storage.ts#getFeedViewStorageKey` — articles/pictures/videos/social ビュー別 localStorage key 生成                                                                                                                                                                                                                                                |
| `feed-groups-api.spec.ts`                       | `app/api/feed-groups/**/route.ts` — フィードグループ CRUD API                                                                                                                                                                                                                                                                                              |
| `feeds-crud.spec.ts`                            | `app/api/feeds/**/route.ts` — フィード CRUD API                                                                                                                                                                                                                                                                                                            |
| `feeds-validation.spec.ts`                      | `src/lib/validation.ts#isValidCookieHeader` — Cookie バリデーション                                                                                                                                                                                                                                                                                        |
| `fetch-article-content-clamp.spec.ts`           | `src/lib/fetch-article-content.ts` — コンテンツクランプ                                                                                                                                                                                                                                                                                                    |
| `full-text-search.spec.ts`                      | `src/lib/full-text-search.ts` — クエリパーサー + `compileSearchQuery` evaluator 再利用                                                                                                                                                                                                                                                                     |
| `share-targets.spec.ts`                         | `src/components/article-view/shareTargets.ts` — `triggerShareTarget` clipboardText 有/無の DI テスト                                                                                                                                                                                                                                                       |
| `html-post-processor.spec.ts`                   | `src/lib/html-post-processor.ts` — HTML 後処理パイプライン                                                                                                                                                                                                                                                                                                 |
| `html-media-processors.test.ts`                 | `src/lib/html-media-processors.ts` — `rewriteMediaSrcAttrs` 統合 image / video URL proxy 書き換え + 冪等性 spec (#752 案 B)                                                                                                                                                                                                                                |
| `html-srcset.spec.ts`                           | `src/lib/html-srcset.ts#transformSrcset` — HTML srcset パース + URL 変換純粋関数 (#752 真因 fix、Cloudinary path 内カンマ含み URL でも壊れない仕様、12 ケース網羅)                                                                                                                                                                                         |
| `rewrite-video-urls.spec.ts`                    | `src/lib/html-video-processors.ts#rewriteVideoUrls` — `<video src>` / `<source src>` を /api/video-proxy 経由に書き換える純粋関数 (html-media-processors.ts への thin wrapper、#751)                                                                                                                                                                       |
| `orphaned-icon-svgs.spec.ts`                    | `src/lib/html-noise-removal.ts#removeOrphanedIconSvgs` — `<svg><use href="#fragment">` 孤立 icon 参照の除去                                                                                                                                                                                                                                                |
| `json-ld-images.spec.ts`                        | `src/lib/json-ld-images.ts` — `extractJsonLdImages` / `appendMissingJsonLdImages` 純粋関数（JSON-LD Article image 抽出と本文補完）                                                                                                                                                                                                                         |
| `html-to-markdown.spec.ts`                      | `src/lib/html-to-markdown.ts` — HTML → Markdown 変換                                                                                                                                                                                                                                                                                                       |
| `image-extractor.spec.ts`                       | `src/lib/image-extractor.ts` — 画像 URL 抽出                                                                                                                                                                                                                                                                                                               |
| `image-mime.spec.ts`                            | `src/lib/image-mime.ts` — 画像 MIME タイプ検証                                                                                                                                                                                                                                                                                                             |
| `video-mime.spec.ts`                            | `src/lib/video-mime.ts` — `ALLOWED_VIDEO_CONTENT_TYPES` Set + `detectVideoMimeType` 純粋関数（mp4 / webm / quicktime allowlist、mkv 等は拒否、video-proxy の MIME 検証で使用）                                                                                                                                                                             |
| `video-error-placeholder.test.ts`               | `src/lib/video-error-placeholder.ts#errorVideoResponse` — X-Video-Proxy-\* ヘッダー + status code 仕様 (#751、image-proxy の errorImageSvg pattern を mirror)                                                                                                                                                                                              |
| `mime-utils.test.ts`                            | `src/lib/mime-utils.ts#parseFtypBrand` — ISO BMFF ftyp box brand 抽出純粋関数 (image-mime.ts / video-mime.ts 共通化、cycle 66 simplify Issue 2)                                                                                                                                                                                                            |
| `image-proxy-security.spec.ts`                  | `src/lib/image-proxy-security.ts` — プロキシリクエスト検証                                                                                                                                                                                                                                                                                                 |
| `image-proxy-url.spec.ts`                       | `src/lib/image-proxy-url.ts` — プロキシ URL ビルダー                                                                                                                                                                                                                                                                                                       |
| `useImageProxyFallback.test.ts`                 | `src/hooks/useImageProxyFallback.ts` — proxy URL → 原 URL fallback chain hook (#788 Phase 1、attempt 0/1/2 遷移 + onError 中間 attempt skip / 諦め時のみ consumer 通知)                                                                                                                                                                                    |
| `json-feed.spec.ts`                             | JSON Feed パース                                                                                                                                                                                                                                                                                                                                           |
| `jwt-aud-iss.spec.ts`                           | JWT audience / issuer 検証                                                                                                                                                                                                                                                                                                                                 |
| `keyword-filter.spec.ts`                        | `src/lib/keyword-filter.ts` — キーワードフィルタリング                                                                                                                                                                                                                                                                                                     |
| `landing.spec.ts`                               | 未ログイン時ランディングページ表示                                                                                                                                                                                                                                                                                                                         |
| `linkedom-types.spec.ts`                        | `src/lib/linkedom-types.ts` — DOM 型ガード                                                                                                                                                                                                                                                                                                                 |
| `llm-feed-generator.spec.ts`                    | `src/lib/llm-feed-generator.ts` — LLM CSS セレクタ推論                                                                                                                                                                                                                                                                                                     |
| `lru-cache.spec.ts`                             | `src/lib/lru-cache.ts` — LRU キャッシュ                                                                                                                                                                                                                                                                                                                    |
| `bulk-selection.test.ts`                        | `src/lib/bulk-selection.ts` — `computeBulkSelectionRange` / `addRangeToSelection` / `resetSelectionToSingle` 純粋関数（Shift+click による記事範囲選択計算）                                                                                                                                                                                                |
| `url.test.ts`                                   | `src/lib/url.ts#isAbsoluteHttpUrl` — http(s) / 相対 URL / 非 http スキームの判別（vitest unit）                                                                                                                                                                                                                                                            |
| `lru-cache.test.ts`                             | `src/lib/lru-cache.ts#flush` — try/finally エラー耐性 (storageSet/storageRemove throw 時に finally で pending クリア / 次回 flush が二重書き込みしないこと) を vi.mock + queueMicrotask override で verify (#821、5 ケース網羅)                                                                                                                            |
| `modal-focus-trap.spec.ts`                      | モーダルのフォーカストラップ                                                                                                                                                                                                                                                                                                                               |
| `confirm-modal-focus.spec.ts`                   | ConfirmModal が閉じたときのトリガー要素へのフォーカス復元 (#687, WCAG 2.4.3)                                                                                                                                                                                                                                                                               |
| `context-menu-position.test.ts`                 | `src/lib/context-menu-position.ts#computeContextMenuPosition` — コンテキストメニュー / ポップアップの viewport-aware ポジショニング純粋関数（ArticleContextMenu / GalleryContextMenu / FeedItemComponent menuAnchor 分岐の inline IIFE 重複を集約、top / bottom アンカー切替 + 左右マージン 4px ガード、8 ケース網羅）                                     |
| `selection-popup-position.spec.ts`              | `src/lib/selection-popup-position.ts#computeSelectionPopupLayout` — テキスト選択ポップアップの viewport-aware ポジショニング純粋関数（popup 実測サイズを受けて左右端 / 上端のはみ出しを補正、#1089）                                                                                                                                                       |
| `modal-popup-lock-coverage.spec.ts`             | `src/lib/popup-lock.ts` — ポップアップ多重防止                                                                                                                                                                                                                                                                                                             |
| `obsidian.spec.ts`                              | `src/lib/obsidian.ts` — Obsidian URI 生成                                                                                                                                                                                                                                                                                                                  |
| `ogp-url-normalize.spec.ts`                     | `/api/ogp` URL 正規化                                                                                                                                                                                                                                                                                                                                      |
| `ogp-cache-ttl.spec.ts`                         | `src/lib/ogp-cache-ttl.ts` — `computeOgpCacheTtl` 純粋関数（Twitter fallback 経路 1 日 / 通常成功 30 日 / 空応答 1 日 / 全 4 分岐網羅、#706 cache poisoning 防御）                                                                                                                                                                                         |
| `ogp-cache-schema.spec.ts`                      | `src/lib/ogp-cache-schema.ts` — `parseOgpCacheEntry` / `parseOgpCache` / `getOgpImage` 純粋関数 (#808 Phase 1、v1 string → v2 object lazy migration / title・description は次 fetch で追記 / 不正値 safe fallback、20 ケース網羅)                                                                                                                          |
| `ogp-cache-lru.spec.ts`                         | `src/lib/ogp-cache-lru.ts#mergeWithLruEviction` — OGP cache の true-LRU eviction 純粋関数（旧 FIFO eviction を LRU に修正、touch した link が末尾移動して MAX 超過時に最も古い未 touch entry を削除、#1088 Finding 2）                                                                                                                                     |
| `ai-summary-parse.spec.ts`                      | `src/lib/ai-summary-parse.ts` — `parseSummaryLine` / `parseSummaryLines` 純粋関数 (#811、heading / bullet / empty / paragraph 分類 / 非 string 入力 safe fallback で TypeError 防御、21 ケース網羅)                                                                                                                                                        |
| `booth-fallback.test.ts`                        | `src/lib/booth-fallback.ts` — `extractBoothFallbackUrl` 純粋関数（x.com / twitter.com 系フィードで summary 内 booth.pm URL を thumbnail fallback として抽出、#750 Phase 1、全 12 ケース網羅）                                                                                                                                                              |
| `x-com-fallback.spec.ts`                        | `src/lib/x-com-fallback.ts` — `isXComHost` / `isJsDisabledContent` / `needsXComOgpFallback` 純粋関数（x.com / twitter.com 系で JS 無効エラー content を検出して TTS / AI fallback トリガー、#718）                                                                                                                                                         |
| `wasm-auth.spec.ts`                             | `app/api/wasm/[file]/route.ts` + `app/api/piper-voice/[file]/route.ts` — withBinarySession 認証ガード (未認証 401、認証済 + R2 ファイル存在で 200 + Cache-Control: public, max-age=31536000, immutable、#782 後追い)                                                                                                                                       |
| `opml-feed-groups.spec.ts`                      | `src/lib/opml.ts` — OPML パース・ビルド                                                                                                                                                                                                                                                                                                                    |
| `popup-lock.spec.ts`                            | `src/lib/popup-lock.ts` — ロックライフサイクル                                                                                                                                                                                                                                                                                                             |
| `push-batch.spec.ts`                            | `src/lib/web-push.ts` — Web Push バッチ送信                                                                                                                                                                                                                                                                                                                |
| `push-config.spec.ts`                           | `src/lib/push-silent-hours.ts` — サイレント時間帯判定・disabledFeeds フィルタリング                                                                                                                                                                                                                                                                        |
| `push-api.spec.ts`                              | `app/api/push/**/route.ts` — Push 通知 API                                                                                                                                                                                                                                                                                                                 |
| `article-filter-digest.spec.ts`                 | `src/lib/article-filter.ts` — digestLimit per-feed フィルタリング                                                                                                                                                                                                                                                                                          |
| `article-filter-equality.spec.ts`               | `src/lib/article-filter-equality.ts` — `equalDigestLimitMap` / `equalStringMap` / `equalCompiledFilterMap` / `equalStringSet` / `equalViewFeedIds` 構造的等価判定純粋関数 (旧 `useFilteredArticles.ts` inline 定義から canonical lib pattern に切り出し)                                                                                                   |
| `theme-preset.spec.ts`                          | `src/lib/theme-preset.ts` — `parseThemePresets` / `serializeThemePresets` 純粋関数 (Cloudflare バインディング非依存、`MAX_THEME_PRESETS` / `THEME_PRESET_NAME_MAX_LENGTH` 境界値網羅)                                                                                                                                                                      |
| `html-image-processors.test.ts`                 | `src/lib/html-image-processors.ts#dedupeAdjacentDuplicateImages` (#893) — lazy-load + noscript fallback で `<img data-src="X" src="data:..."><img src="X">` 並列の元 HTML が `fixLazyImages` 後に同一 src の `<img>` 2 個連続となる状況を集約する純粋関数の挙動を固定                                                                                      |
| `proxy-error-headers.test.ts`                   | `src/lib/proxy-error-headers.ts#applyProxyErrorDetailHeaders` (#856) — `image-error-placeholder.ts` / `video-error-placeholder.ts` の 8 行重複を集約した helper、`upstreamStatus` / `bodySize` は `!== undefined` (0 / 200 も付与)、`upstreamContentType` / `detectedMime` は truthy 判定 (空文字列除外)                                                   |
| `useFeedOperations.test.ts`                     | `src/hooks/useFeedOperations.ts` (#840) — `addFeed` / `deleteFeed` / `renameFeed` 3 action のエラー経路で `onError?: (msg: string) => void` callback による toast 配信 + 既存 `error` state 併存セット (3 秒テキスト表示互換維持) を spec で固定、`useCollections` の `onError` pattern と統一                                                             |
| `useCollections.test.ts`                        | `src/hooks/useCollections.ts#addArticlesToCollection` (#1087) — 楽観的更新の差分 rollback spec（並行操作の確定済み変更を巻き戻さない差分ロールバックを固定）                                                                                                                                                                                               |
| `useFeedGroups.test.ts`                         | `src/hooks/useFeedGroups.ts#reorderGroup` (#1087) — 楽観的更新の差分 rollback spec（reorder 失敗時に並行操作の確定変更を保持）                                                                                                                                                                                                                             |
| `useFeedPatch.test.ts`                          | `src/hooks/useFeedPatch.ts` (#1087) — field 単位マージ rollback spec（PATCH 失敗時に変更 field のみ巻き戻し並行 field 変更を保持）                                                                                                                                                                                                                         |
| `useReadStateActions.test.ts`                   | `src/hooks/useReadStateActions.ts` — 既読・一括既読・全既読・スヌーズ・ノート・グローバルフィルター・TTL action の挙動 spec                                                                                                                                                                                                                                |
| `useReadStateToggles.test.ts`                   | `src/hooks/useReadStateToggles.ts` — toggleRead / toggleBookmark / toggleReadingList / toggleLike 生成 hook の挙動 spec                                                                                                                                                                                                                                    |
| `computeMergedSet.test.ts`                      | `src/hooks/useReadStateSyncApply.ts#computeMergedSet` — サーバー応答マージの差分計算純粋関数 spec（変更なし時 null return ガード、`src/hooks/__tests__/` 配置）                                                                                                                                                                                            |
| `useReadStateSyncFlush.test.ts`                 | `src/hooks/useReadStateSyncFlush.ts` — flushToServer の in-flight ガード spec（#1124、await saveReadState 中の online / visibilitychange 経由 2 回目 flush を「完了後に 1 度再 flush 予約」に倒し、失敗パス restorePending の ID 重複混入 race を防ぐ、本 hook 初の lifecycle spec）                                                                       |
| `useEngagement.test.ts`                         | `src/hooks/useEngagement.ts#flushBuffer` — lost-update 防止 spec（#1125、await 中に recordEngagement が末尾追加した entry を stale snapshot write-back で消さないよう再 load して snapshot 超過分を保持、`#1124` と同 class）                                                                                                                              |
| `rate-limit-serialized.spec.ts`                 | `src/lib/serialize-async.ts` + レートリミット                                                                                                                                                                                                                                                                                                              |
| `read-state-api.spec.ts`                        | `app/api/read-state/route.ts` — 既読状態 API                                                                                                                                                                                                                                                                                                               |
| `read-state-merge.spec.ts`                      | `src/lib/read-state-merge.ts` — 状態マージ純粋関数 + `equalSnoozedUntil` 構造的等価判定 (#686)                                                                                                                                                                                                                                                             |
| `unread-stats-merge.spec.ts`                    | `src/lib/unread-stats-merge.ts#equalUnreadByFeed` / `equalLastPublishedByFeed` — 未読統計 Map structural equality 純粋関数 (#758、`useArticleUnreadStats` の Map state 安定化、`equalSnoozedUntil` と同 pattern)                                                                                                                                           |
| `read-state-sync-api.spec.ts`                   | `src/lib/type-guards.ts#isReadState` — read-state-sync-api.ts 依存の型ガード検証 (Issue #587)                                                                                                                                                                                                                                                              |
| `read-state-storage.spec.ts`                    | `src/lib/read-state-storage.ts` — localStorage 永続化                                                                                                                                                                                                                                                                                                      |
| `read-state-prune.spec.ts`                      | `src/lib/read-state-prune.ts` — readBeforeTimestamp 以前の readId 物理削除純粋関数 + `computeEffectiveReadBeforeCutoff`（ttlDays 連動）                                                                                                                                                                                                                    |
| `gallery-prefetch.spec.ts`                      | `src/lib/gallery-prefetch.ts` — `buildArticlesKey` 純粋関数（visible 拡張で確実にキー変化）                                                                                                                                                                                                                                                                |
| `gallery-display.spec.ts`                       | `src/lib/gallery-display.ts` — `selectGalleryImages` 純粋関数（prefetched / thumb / none の 3 分岐選択）                                                                                                                                                                                                                                                   |
| `gallery-masonry-layout.spec.ts`                | `src/lib/gallery-masonry-layout.ts` — `computeColumnHeights` / `assignItemToShortestColumn` / `computeMasonryLayout` / `computeScrollAnchorDelta` 純粋関数 (#773 Phase 0/1、自前 masonry virtualizer 基盤)                                                                                                                                                 |
| `loadmore-cooldown.spec.ts`                     | `src/lib/loadmore-cooldown.ts` — `shouldLoadMore` 純粋関数 (#773 案 A、loadMore 連続発火を 1000ms cooldown で抑止 / 大量画像展開時の scroll 一気末尾移動 + 無限ロード対策 / 時計戻り fail-open / Infinity cooldown 等 9 ケース網羅)                                                                                                                        |
| `gallery-explode.spec.ts`                       | `src/lib/gallery-explode.ts` — `explodeArticlesIntoGalleryEntries` 純粋関数（画像/動画 view で 1 記事 N 画像を N カードに分解、`GalleryEntry` 型、Phase 0b、全 10 ケース網羅）                                                                                                                                                                             |
| `abort-error.spec.ts`                           | `src/lib/fetch.ts#isAbortError` — DOMException AbortError / Error name="AbortError" / 非 abort error の判別 (#625 後追い)                                                                                                                                                                                                                                  |
| `tts-adapter.spec.ts`                           | `src/lib/tts-adapter.ts` — `speechSynthesisVoiceToTtsVoice` / `TtsAdapter` 型契約 / `TtsVoice` と既存 `selectTtsVoice` `groupVoicesByLang` の互換 (#675 Phase 1a)                                                                                                                                                                                          |
| `usePiperTts.test.ts`                           | `src/hooks/usePiperTts.ts` — Piper wasm engine の TtsAdapter 実装（dynamic import + Audio 制御 + boundary 擬似発火 + endedCount / errorCount monotonic counter + enabled=false で voices/speak skip、#674 Phase 2a-part2 + 2b、全 12 ケース網羅）                                                                                                          |
| `useTtsEngineSetting.test.ts`                   | `src/hooks/useTtsEngineSetting.ts` — TTS engine 切替設定 hook（localStorage 永続化 + storage event 別タブ同期 + 不正値 fallback + setEngine identity 安定、#674 Phase 2b、全 8 ケース網羅）                                                                                                                                                                |
| `useTtsControls.test.ts`                        | `src/hooks/useTtsControls.ts` — TTS engine 共通 rate / voiceUri / volume 制御 hook (#674 Phase 2b、`setVoiceUriSilent` variant で error handler 自動 reset の onChange skip 経路を提供)                                                                                                                                                                    |
| `useBackgroundAudio.test.ts`                    | `src/hooks/useBackgroundAudio.ts` — TTS バックグラウンド継続用 hook (#745 Phase A + D、HTML `<audio>` 無音 WAV loop + WebAudio oscillator の 2 段構え、MockAudio / MockAudioContext class で stub)                                                                                                                                                         |
| `useArticleContent.test.tsx`                    | `src/hooks/useArticleContent.ts` — list/detail サムネ divergence 解消 (#836) の core 動作 spec — OgpCacheContext 共有 cache hit 即反映 / cache miss + RSS ogImage なしで /api/ogp fetch + cacheOgpEntry 書き戻し / articleLink 空時の no-op                                                                                                                |
| `useArticleAi.test.ts`                          | `src/hooks/useArticleAi.ts#useAiOperation` — server-fetch path の sibling abort guard 対称化 spec（#1115、apiFetch → buildFetchErrorMessage → res.json の各 await→setState 境界で abort recheck、記事切替時の stale AI 結果 / loading clobber 防止）                                                                                                       |
| `useArticleListItemProps.test.ts`               | `src/hooks/useArticleListItemProps.ts` — bookmarkIds / readIds / notes / duplicateInfo 変更時に resolveItemProps identity 変化を hook level で検証 (#682 Phase B-1 / 元 #634、memo Consumer 再描画担保)                                                                                                                                                    |
| `useArticleFilters.test.ts`                     | `src/hooks/useArticleFilters.ts` — フィルター状態の初期値・toggle・updateQuery・cycleRange・reset 等 hook 全機能を vitest unit test で網羅 (#912 Phase A、`src/hooks/__tests__/useArticleFilters.test.ts` に配置)                                                                                                                                          |
| `FeedHealthModal.test.tsx`                      | `src/components/FeedHealthModal.tsx` — `useState(() => new Date())` mount 時 1 回固定挙動を `vi.setSystemTime + rerender` で間接検証 (#682 Phase B-2 / #623 回帰防止、`useMemo(() => new Date(), [])` 旧実装との挙動差を spec で固定)                                                                                                                      |
| `useAsyncFetch.test.tsx`                        | `src/hooks/useAsyncFetch.ts` — 非同期 fetch 共通 hook (loading + error + AbortController + auto-fetch + transform ボイラープレートを集約) の挙動 spec — auto-fetch 起動 / `refetch()` / AbortController による in-flight cancel / `transform` 適用、`useReadingStats` / `useEngagementEntries` / `useRecommendations` / `useFeedGroups` 共通基盤の回帰防止 |
| `tts-voice.spec.ts`                             | `src/lib/tts-voice.ts` — `selectTtsVoice` / `groupVoicesByLang` 純粋関数（voice 選択優先順位・言語別グループ化）                                                                                                                                                                                                                                           |
| `tts-sentences.spec.ts`                         | `src/lib/tts-sentences.ts` — `splitIntoSentences` / `findSentenceAtCharIndex` / `estimateCharIndexByElapsed` / `selectActiveCharIndex` (#659 Phase 1)                                                                                                                                                                                                      |
| `tts-dom.spec.ts`                               | `src/lib/tts-dom.ts` — `wrapSentencesInHtml` 純粋関数（HTML テキストノードをセンテンス span でラップ・skip タグ対応・タグ跨ぎ） (#672 Phase 2)                                                                                                                                                                                                             |
| `tts-scroll.spec.ts`                            | `src/lib/tts-scroll.ts` — `shouldScrollSentence` 純粋関数（快適ゾーン判定: 中央 30〜70%）                                                                                                                                                                                                                                                                  |
| `download-history.spec.ts`                      | `src/lib/download-history.ts` — 画像 DL 履歴の FIFO 管理純粋関数                                                                                                                                                                                                                                                                                           |
| `reader-settings.spec.ts`                       | `src/lib/reader-settings.ts` — リーダー設定バリデーション                                                                                                                                                                                                                                                                                                  |
| `reading-progress.spec.ts`                      | `src/lib/reading-progress.ts` — 読書進捗計算                                                                                                                                                                                                                                                                                                               |
| `reading-stats-level.test.ts`                   | `src/lib/reading-stats-level.ts` — `countToLevel` ヒートマップ濃淡レベル算出純粋関数（0除算ガード / ratio `<=` 境界 0.25/0.5/0.75 / count > max、12 ケース全分岐網羅、ReadingStatsModal 分割で抽出）                                                                                                                                                       |
| `recommendation.spec.ts`                        | `src/lib/recommendation.ts` — `sanitizeForPrompt` / `isCacheValid`                                                                                                                                                                                                                                                                                         |
| `refresh-tokens.spec.ts`                        | `src/lib/auth.ts` — リフレッシュトークンフロー                                                                                                                                                                                                                                                                                                             |
| `regex-extractor.spec.ts`                       | `src/lib/regex-extractor.ts` — 正規表現ベース本文抽出                                                                                                                                                                                                                                                                                                      |
| `regression-load-more-fail.spec.ts`             | LoadMoreButton silent fail 回帰テスト — `/api/articles?since=*` 500 fail 時の `toast.error("過去記事の取得に失敗しました")` 表示を担保 (#683 Phase 1)                                                                                                                                                                                                      |
| `regression-772-filter-scroll-loadmore.spec.ts` | filter ON/OFF/ON cycle 後にスクロールで loadMore が発火することを担保する回帰テスト (#772 Symptom 2、pageSize 小 + filtered 中規模 + filter toggle で visible.length 同値 stable な場合の IO refire 限界回避)                                                                                                                                              |
| `regression-ogp-fallback.spec.ts`               | OGP フォールバック (isFetchFailed ブランチ) 回帰テスト — gallery 画面で `/api/content` 500 fail 時、`<ArticleThumbnail thumb={thumb} className="opacity-50">` overlay と `<GalleryExpandButton>` リトライボタン描画を担保 (#683 Phase 2)                                                                                                                   |
| `retry-after.spec.ts`                           | `src/lib/retry-after.ts` — Retry-After ヘッダーパース                                                                                                                                                                                                                                                                                                      |
| `classify-http-error.spec.ts`                   | `src/lib/classify-http-error.ts` — `classifyHttpError` / `formatHttpErrorMessage` / `isRetryableHttpError` (#688, 30 ケース全分岐網羅)                                                                                                                                                                                                                     |
| `rsshub.spec.ts`                                | `src/lib/rsshub.ts` — RSSHub URL 変換                                                                                                                                                                                                                                                                                                                      |
| `sanitize-dompurify.spec.ts`                    | 調査コード（dompurify Workers 非対応調査、無効化済み）                                                                                                                                                                                                                                                                                                     |
| `sanitize-for-prompt.spec.ts`                   | `src/lib/recommendation.ts#sanitizeForPrompt`                                                                                                                                                                                                                                                                                                              |
| `sanitize-html.spec.ts`                         | `src/lib/html.ts#sanitizeHtml`                                                                                                                                                                                                                                                                                                                             |
| `script-loaded-images.spec.ts`                  | `src/lib/content.ts#resolveScriptLoadedImages` — WordPress プラグインの `loadImage(elementId, jpgUrl, gifUrl)` で gif (動的) を優先採用する純粋関数 (digitallover.moe 対応)                                                                                                                                                                                |
| `serialize-error.spec.ts`                       | `src/lib/serialize-error.ts` — エラーシリアライズ                                                                                                                                                                                                                                                                                                          |
| `sort-utils.spec.ts`                            | `src/lib/sort-utils.ts#sortByOrder` — order 昇順ソート純粋関数（mutate しない / 空配列 / stable sort / readonly 互換、全 8 ケース網羅）                                                                                                                                                                                                                    |
| `feed-signature.spec.ts`                        | `src/lib/feed-signature.ts#computeFeedStructuralSignature` / `computeArticleTagIdsSignature` — feeds 構造 + articleTagIds 構造シリアライズ純粋関数（全 field 変化検知 / 順序依存 / 非影響 field 不変 / optional field nullish coalescing、計 21 ケース網羅、#789 + perf cycle）                                                                            |
| `shared-feed-merge.spec.ts`                     | `src/lib/shared-feed.ts#mergeNewArticles`                                                                                                                                                                                                                                                                                                                  |
| `shared-feed.spec.ts`                           | `src/lib/shared-feed.ts` — フィードデータ R2 操作                                                                                                                                                                                                                                                                                                          |
| `speakerdeck-embed.spec.ts`                     | `src/lib/html-embed-transforms.ts` — SpeakerDeck 変換                                                                                                                                                                                                                                                                                                      |
| `stats.spec.ts`                                 | `src/lib/stats-helpers.ts` — `toDateStr` / `buildDayList`                                                                                                                                                                                                                                                                                                  |
| `stats-feed-drilldown.spec.ts`                  | `src/lib/stats-helpers.ts` — `aggregateStatsForFeed` フィード別集計純粋関数                                                                                                                                                                                                                                                                                |
| `tag-validation.spec.ts`                        | `src/lib/validation.ts#parseTagIds` — タグバリデーション                                                                                                                                                                                                                                                                                                   |
| `translate-html.spec.ts`                        | `src/lib/translate-html.ts` — HTML 内テキスト翻訳                                                                                                                                                                                                                                                                                                          |
| `tts-text.spec.ts`                              | `src/lib/tts-text.ts` — TTS 読み上げ用 URL 前処理純粋関数                                                                                                                                                                                                                                                                                                  |
| `tts-volume.spec.ts`                            | `src/lib/tts-volume.ts` — `clampTtsVolume` / `parseTtsVolume` 純粋関数（音量クランプ・localStorage 復元、#699 全 11 ケース）                                                                                                                                                                                                                               |
| `url-ssrf.spec.ts`                              | `src/lib/url.ts` — SSRF 対策 URL バリデーション                                                                                                                                                                                                                                                                                                            |
| `validation-functions.spec.ts`                  | `src/lib/validation.ts` — バリデーション純粋関数                                                                                                                                                                                                                                                                                                           |
| `server-session-type-guard.spec.ts`             | `src/lib/server-auth.ts` — `isServerSessionData` 型ガード境界値検証（null / 配列 / プリミティブ / optional dbscSessionId 全 10 ケース、#922 で追加）                                                                                                                                                                                                       |
| `session-id-validation.spec.ts`                 | `src/lib/validation.ts` — `isValidSessionId`（UUID 形式・パストラバーサル防止）                                                                                                                                                                                                                                                                            |
| `web-push.spec.ts`                              | `src/lib/web-push.ts#sendPush` / `sendPushToAll` — Web Push 送信ヘルパー (P-256 鍵ペア生成 + payload 暗号化検証)                                                                                                                                                                                                                                           |
| `xml-parser.spec.ts`                            | `src/lib/xml-parser.ts` — RSS / Atom パーサー                                                                                                                                                                                                                                                                                                              |

<!-- TEST_COVERAGE_MAP_AUTO_GEN END -->

### カバレッジ未対応の重要機能

| 機能                      | 対象ファイル                                             | 理由                                     |
| ------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| DBSC 登録・チャレンジ検証 | `src/lib/dbsc.ts` / `app/api/auth/dbsc/*/route.ts`       | 実装済み（TPM 署名はブラウザが自動処理） |
| 読了統計ストリーク計算    | `app/api/stats/route.ts` の GET ハンドラ                 | R2 依存のため統合テスト要                |
| フィード推薦生成          | `src/lib/recommendation.ts` の `generateRecommendations` | AI + R2 + 外部検索 API 依存              |

## ビルド・デプロイ

```bash
npm run build    # next build
npm run deploy   # @opennextjs/cloudflare build && wrangler deploy
```

ビルド成果物:

- `.open-next/worker.js` → Workers スクリプト (wrangler.toml の main)
- `.open-next/assets/` → 静的アセット (Cloudflare Assets)

## GitHub Workflows

`.github/workflows/` 配下に 2 つの workflow が存在する。**`deploy.yml` は存在しない**(本番デプロイは Cloudflare Workers の CI/CD が担う、上記「デプロイ」記載通り)。

- **`ci.yml`** — master push / PR で `pnpm run check` (oxlint + oxfmt + tsgo 型チェック) + `pnpm run typecheck` (`tsc --noEmit`) を実行。pre-commit hook と同等のチェックを CI 側で再実行する canonical 二重保証 (PR 段階で fail 検知)。Node 22 + pnpm + `actions/checkout@v6` + `actions/setup-node@v6` 構成。`permissions: contents: read` で最小権限。
- **`dependabot-auto-merge.yml`** — Dependabot 作成 PR の **patch / minor バージョンアップ** を CI 通過後に自動 auto-merge (`gh pr merge --auto --squash`)。**major バージョンアップ**は破壊的変更可能性のため手動レビュー必須 (gh pr comment で通知のみ)。`if: github.actor == 'dependabot[bot]'` で Dependabot PR のみ対象、`GITHUB_TOKEN` は自身が approve できない制約あり (PAT 必要なら別途 secrets 登録)。

## 静的アセット (`public/`)

`public/` 配下は Next.js conventional な静的 hosting directory。OpenNext build で `.open-next/assets/` に展開され Cloudflare Assets で配信。機能 critical な 3 file:

- **`sw.js`** — 手書き Service Worker (client-side `ServiceWorkerRegistration.tsx` で登録)。`CACHE_VERSION = "rss-v4"` で 3 cache (static / page / api) を管理、API_CACHE_TTL_MS 5 分。stale-while-revalidate で `/api/articles` / `/api/feeds` を cache、`/api/auth/me` はレートリミット (5 秒クールダウン) との衝突回避でネットワーク優先 + オフライン fallback のみ。
- **`manifest.json`** — PWA manifest (display: standalone / icons: 192/512/svg 各 any+maskable / background_color + theme_color: `#18181b`)。PWA install 機能の root 設定。
- **`_headers`** — Cloudflare Pages の HTTP header rule。`/_next/static/*` に `Cache-Control: public,max-age=31536000,immutable` (1 年 immutable cache) を付与、Next.js static chunks の long-term cache 戦略。

他: `favicon.png` / `apple-touch-icon.png` / `icon-192.png` / `icon-512.png` / `icon.svg` (アイコン群) + `og.png` / `og.svg` (OGP 画像) は Next.js convention で省略可能 detail。

## 運用スクリプト (`scripts/`)

`scripts/` 配下は `package.json` の `pre*` hook / `gen:*` / `upload:*` / `deploy` で呼ばれる Node.js script 群 (.mjs)。各 script の役割:

- **`sync-release-notes.mjs`** — `RELEASE_NOTES.md` → `src/lib/release-notes-data.ts` 自動生成。`predev` / `prebuild` / `pretypecheck` / `precheck` / `precheck:fix` の 5 hook で実行、`release-notes-data.ts` は `.gitignore` 対象 (auto-generated)。
- **`generate-test-coverage-map.mjs`** — e2e spec ファイルから `architecture.md` の `<!-- TEST_COVERAGE_MAP_AUTO_GEN START / END -->` マーカー間にテストカバレッジマップを差し込む。`gen:coverage-map` script、現状 Phase 1 (markers + script 配置済、データ整備は Phase 2 で運用切替予定、`rule-maintenance.md § 10 派生「自動化 infrastructure markers」` 参照)。
- **`remove-bundled-wasm.mjs`** — `build:cf` post-step。`.open-next/assets/_next/static/media/` 配下の wasm (`onnxruntime-web` の `ort-wasm-simd-threaded.jsep.wasm` 25 MiB 等) を削除して Cloudflare Workers asset 上限 (25 MiB / 件) 抵触を回避、wasm は R2 (`piper-wasm/<file>`) セルフホスト (#674 Phase 2c / closes #753)。
- **`add-scheduled-handler.mjs`** — `build:cf` post-step。OpenNext 生成の `wrangler.json` に `wrangler.toml` の追加設定をマージ (scheduled handler は `worker.ts` Custom Worker で定義済のため注入は不要、設定 merge のみ)。
- **`stamp-sw-version.mjs`** — `public/sw.js` の `CACHE_VERSION` をビルド日時ベースの文字列に置換、`deploy` script 冒頭で実行 (デプロイごとに旧キャッシュ自動削除)。
- **`generate-vapid-keys.mjs`** — VAPID 鍵ペア生成 (Web Push 用、`npm run secret put VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` に貼り付ける手動運用)。
- **`upload-piper-wasm.mjs`** — Piper TTS engine 用 `onnxruntime-web` 関連 wasm を Cloudflare R2 (`piper-wasm/<file>`) にアップロード (#674 Phase 2c / #753)。`upload:piper-wasm` script、手動運用 (CI/CD 非組込)。
- **`upload-piper-voices.mjs`** — Piper TTS engine 用 voice モデル (HuggingFace) を Cloudflare R2 にアップロード。`upload:piper-voices` script、手動運用 (CI/CD 非組込)。

## ルート設定ファイル

project root 配下の主要 entry point / config file:

- **`worker.ts`** — Custom Worker entry (wrangler.toml `main = "./worker.ts"`)。`fetch` ハンドラーは `.open-next/worker.js` (Next.js handler) を delegate、`scheduled` ハンドラーは `fetchAllFeeds` + `runCronPrefetch` を実行 (Cron Trigger 30 分ごと、上記「全体像」参照)。
- **`middleware.ts`** — Next.js middleware。**Content-Security-Policy header をリクエストごとに動的構築** (`nonce` ベース XSS 保護 + `TRUSTED_IFRAME_RULES` から `frame-src` 単一管理 + `connect-src` に HuggingFace / CDN / `cloudflareinsights.com` 等)。security critical な実装。
- **`next.config.ts`** — Next.js build config。`securityHeaders` (CSP 以外: X-Frame-Options / Permissions-Policy / HSTS 等) + `transpilePackages` (piper-plus / @piper-plus/g2p / onnxruntime-web 等の wasm engine ESM transpile) + `turbopack.resolveAlias` (browser bundle で `fs` / `path` を empty module 解決) + `initOpenNextCloudflareForDev({ remoteBindings: false })` (dev は local miniflare のみ、wrangler login 不要)。chained config 設計は `rule-maintenance.md § 5 派生「Next.js + OpenNext + Wrangler chained config 整合性 sweep」` 参照。
- **`open-next.config.ts`** — OpenNext (Cloudflare adapter) config。`defineCloudflareConfig({})` の minimal、Cron handler は OpenNext 未サポートのため `worker.ts` (Custom Worker) で直接定義する 2 段構成方針を architectural note として明記。
- **`AGENTS.md`** — `CLAUDE.md` へのシンボリックリンク (`ln -s CLAUDE.md AGENTS.md`)。OpenAI Codex など `AGENTS.md` を project instructions として読む AI ツールが Claude Code と同じ規範ファイルを参照できるようにする互換層。`CLAUDE.md` 本体は 1 箇所でメンテナンスし、`AGENTS.md` は symlink のままにする (二重管理防止)。

## AI ツール互換性

### AGENTS.md → CLAUDE.md シンボリックリンク (Codex 対応)

Claude Code は `CLAUDE.md` を読むが、OpenAI Codex など他の AI coding agent は `AGENTS.md` をプロジェクト指示ファイルとして読む。両ツールを同じ規範で動かすには **`AGENTS.md` を `CLAUDE.md` への symlink として作成** する。

```bash
# プロジェクトルートで実行
ln -s CLAUDE.md AGENTS.md
git add AGENTS.md
git commit -m "compat: AGENTS.md → CLAUDE.md symlink で Codex 対応"
```

**判断軸**:

| 状況                                                              | 対応                                         |
| ----------------------------------------------------------------- | -------------------------------------------- |
| `AGENTS.md` が存在しない + Codex 等の別 AI ツールを使う予定がある | symlink 作成                                 |
| `AGENTS.md` が独立ファイルで Claude Code と別の指示を持つ         | symlink 化しない (意図的な分離)              |
| `AGENTS.md` を symlink にした後、Claude Code 指示を変更したい     | `CLAUDE.md` を編集するだけで両方に反映される |

**How to apply**: 別 AI ツール (Codex 等) をプロジェクトに導入するとき、または Issue 対応で `AGENTS.md` の追加を要求されたとき:

1. `ls -la AGENTS.md 2>/dev/null` で既存確認
2. 存在しなければ `ln -s CLAUDE.md AGENTS.md`
3. `git add AGENTS.md && git commit` — symlink はバイナリ追加でなく参照として commit される
4. `CLAUDE.md` の内容を維持し続けるだけでよい (メンテナンス負荷ゼロ)
