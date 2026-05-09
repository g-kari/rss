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
            └─ /api/health            — ヘルスチェック

Cloudflare Workers (@opennextjs/cloudflare)
  ├─ .open-next/worker.js   → Next.js Route Handlers / SSR
  └─ .open-next/assets/     → 静的アセット (Cloudflare Assets)

Cloudflare Bindings
  ├─ RSS_DATA (R2)              — users/{userId}/* + feeds/{feedHash}/* (共有フィード)
  ├─ NEXT_INC_CACHE_R2_BUCKET (R2) — Next.js Incremental Cache (opennextjs 管理)
  ├─ RATE_LIMIT (KV)            — レートリミット・クールダウン管理
  ├─ AI                         — Workers AI モデル
  ├─ IMAGES                     — Cloudflare Images
  ├─ WORKER_SELF_REFERENCE (Service) — 自身の Worker へのサービスバインディング
  ├─ FINDME_RSS (Service)       — findme-rss サービスバインディング
  └─ ASSETS (Assets)            — 静的アセット

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
        session/route.ts   # DELETE /api/auth/dbsc/session — DBSC バインド済みデバイス登録解除
    feeds/
      route.ts               # GET (一覧) / POST (追加) /api/feeds
      [id]/route.ts          # DELETE /api/feeds/:id
      [id]/refresh/route.ts  # POST /api/feeds/:id/refresh — 単体フィード手動更新
      [id]/reinfer/route.ts  # POST /api/feeds/:id/reinfer — LLM CSS セレクタ再推論
      [id]/purge-content-cache/route.ts # POST /api/feeds/:id/purge-content-cache — フィード全記事の content Cache 一括クリア（CLI 用）
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
    content/route.ts         # GET /api/content?url=... (フルテキストプロキシ) / DELETE /api/content?url=... (個別 Cache クリア)
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
      config/route.ts        # GET / PUT /api/push/config — Push 通知設定（disabledFeeds / サイレント時間帯）
    clip/route.ts            # POST /api/clip — SingleFile 拡張からの HTML 受け取り・本文抽出・キャッシュ保存
    health/route.ts          # GET /api/health
    test/seed/route.ts       # POST/DELETE /api/test/seed — e2e テスト専用 R2 シード（NODE_ENV !== "production" + DEV_AUTH_BYPASS_USER_ID セット時のみ動作、本番では 404）

src/
  App.tsx                    # 3ペインレイアウト + 認証状態管理 ('use client')
  types.ts                   # Feed / Article / UserProfile / AuthSession 型
  cloudflare-env.d.ts        # CloudflareEnv 拡張 (RSS_DATA, RATE_LIMIT, AI, IMAGES, FINDME_RSS 等)
  config/
    shortcuts.ts             # キーボードショートカット Single Source of Truth（ShortcutDef / ShortcutGroup / SHORTCUT_DEFS / KEYBOARD_SHORTCUTS）— useKeyboardNav と KeyboardShortcutsModal の両方が参照
  contexts/
    ArticleFilterContext.tsx  # 記事フィルター状態の React Context（FilterState + onSaveFilter）
    FeedSidebarContext.tsx    # FeedSidebar 操作関数の React Context（on*** コールバック群を Props Drilling なしに提供）
    ReaderSettingsContext.tsx # リーダー表示設定の React Context（フォントサイズ・行間・テーマ等）
    SelectedArticleContext.ts # 選択中の記事 ID を提供する Context（ArticleItem の不要な re-render 回避）
    ToastContext.tsx          # トースト通知 API の React Context（useToast のグローバル提供）
  components/
    feed-sidebar/            # サイドバー（index.tsx / FeedGroupsSection / FeedViewTabs / FooterIconButton / SpecialViewButton / SidebarHeader / SidebarFooter / CategorySection / TagsSection / CollectionsSection / FeedSearchBar）
    feed-item/               # フィードアイテム（index.tsx / FeedItemComponent / FeedContextMenu / FeedTitleContent / feedActions.tsx / types.ts）
    article-items/           # レイアウト別記事アイテム（index.tsx / shared.tsx / CompactItem / ListItem / CardItem / MagazineItem / GalleryItem）
    FeedItem.tsx             # フィードアイテム（コンテキストメニュー付き）
    FeedDetailModal.tsx      # フィード詳細モーダル
    FeedFilterModal.tsx      # キーワードフィルター設定モーダル
    FeedHealthModal.tsx      # フィードヘルス監視モーダル（エラー・レートリミット・オーバーサイズのフィードを一覧表示）
    AppModals.tsx            # App レベルのモーダル群集約コンポーネント（SessionExpired / Snooze / KeyboardShortcuts / UserSettings / FeedQuickSwitch）
    ArticleList.tsx          # 記事一覧オーケストレーター (5レイアウト対応・仮想スクロール、#651 Step 3 で分割)
    article-list-body/       # レイアウト別ボディサブコンポーネント群（index.ts / CompactListBody / CardBody / MagazineBody / GalleryBody / GalleryCardRenderer / gallery-context.ts / types.ts）
    ArticleListEmptyState.tsx # 記事一覧の空状態表示（ローディング・エラー・未登録・検索無結果・既読済みなど）
    ArticleListHeader.tsx    # 記事一覧ヘッダー（後方互換再エクスポート → article-list-header/）
    article-list-header/     # 記事一覧ヘッダーサブコンポーネント群（index.tsx オーケストレーター / LayoutSwitcher / FilterPills / FilterPillButton / CategoryFilter / SortButton / MarkAllReadButton / SearchBar / types.ts / constants.ts）
    ArticleItems.tsx         # 記事一覧アイテム（レイアウト別 memo コンポーネント）
    GalleryContextMenu.tsx   # ギャラリーレイアウト右クリックメニュー（画像保存・既読切替）
    ArticleContextMenu.tsx   # compact / list / card / magazine の汎用右クリックメニュー（既読・ブックマーク・後で読む・一覧から削除、#633 A3）
    LoadMoreButton.tsx       # 追加読み込みボタン（IntersectionObserver 自動トリガー）
    ArticleView.tsx          # 記事本文
    Modal.tsx                # 汎用モーダル基盤コンポーネント
    ConfirmModal.tsx         # 確認ダイアログモーダル（window.confirm 代替。useConfirm hook と組み合わせて使う）
    ThreePaneLayout.tsx      # 3ペイン CSS Grid レイアウトコンテナ（sidebarWidth / listWidth / listFocusMode props）
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
    ArticleDetailOverlay.tsx # listFocusMode 時の記事詳細パネル（右からスライドイン・幅ドラッグリサイズ・createPortal）
    SessionExpiredModal.tsx  # セッション期限切れ時の再ログインモーダルオーバーレイ
    ServiceWorkerRegistration.tsx # Service Worker 登録コンポーネント
    ErrorBoundary.tsx        # エラー境界
    Spinner.tsx              # ローディングスピナー（ArticleView・ArticleList で共有）
    SkeletonSidebar.tsx      # サイドバーのスケルトンスクリーン（初回ロード時 CLS 防止）
    SkeletonArticleList.tsx  # 記事一覧のスケルトンスクリーン（初回ロード時 CLS 防止）
    LayoutIcon.tsx           # レイアウト切り替えボタン用アイコン（compact / list / card / magazine / gallery）
    GalleryMasonry.tsx       # masonic ベースの Pinterest 型 masonry + 親スクロールコンテナ対応の仮想スクロール
    UserSettingsModal.tsx    # ユーザー設定モーダル（フォントサイズ・行間・コンテンツ幅・自動既読閾値・テーマ）
    SaveUrlModal.tsx         # 任意 URL を手動保存するモーダル（POST /api/articles/save 連携）
    article-view/AutoReadController.tsx  # オートモードの副作用コントローラ（fetch → speak → 次の記事への自動進行）
    FeedAddModal.tsx         # フィード追加ダイアログ（RSS 自動検出・LLM CSS セレクタ推論・Cookie 指定対応）
    BetaRestrictedPage.tsx   # ベータ制限ページ（未許可ユーザー向け表示）
    LandingPage.tsx          # 未ログイン時のランディングページ
    OfflineBanner.tsx        # オフライン時の固定バナー（同期待ちインジケーター付き）— App.tsx から分割
    NewArticleBanner.tsx     # 新着記事通知バナー（スクロールトップ・閉じるボタン付き）— App.tsx から分割
    FocusModeOverlay.tsx     # フォーカスモード全画面オーバーレイ（ArticleView ラッパー）— App.tsx から分割
    article-view/            # ArticleView 補助コンポーネント群（本文・AI パネル・メモ・モーダル・ナビゲーション・インラインナビ・フィルタメニュー・ギャラリー・共有・スヌーズ・タグエディタ等）
    article-view/ArticleHeader.tsx          # 記事ヘッダー（オーケストレーター、4 サブコンポーネント合成）— #647 で分割
    article-view/ArticleHeaderMeta.tsx      # ヘッダーメタ情報（戻る/日付/著者/元記事/読了時間/カテゴリ/タグ）
    article-view/ArticleHeaderAiTts.tsx     # AI 要約・翻訳・画像 DL・TTS・オートモード ボタン群
    article-view/ArticleHeaderShare.tsx     # クイックシェア + ShareMenu/FilterMenu/GlobalFilterMenu
    article-view/ArticleHeaderEngagement.tsx # 後で読む/ブックマーク/いいね/メモ/コレクション/フォーカスモード
    user-settings/           # ユーザー設定モーダルのサブコンポーネント群（AiNotificationTabPanel / DisplayTabPanel / FeedManagementTabPanel / ImportExportTabPanel / shared）
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
    useSidebarFeeds.ts       # サイドバーのフィード集計・フィルタ・グループ化（タグ集計・未読数・ピン留め・グループ・カテゴリ）
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
    useFullTextSearch.ts     # 記事全文検索（クエリパース・フィールド絞り込み・正規表現対応）
    usePrefetchGalleryContents.ts # ギャラリー表示時の本文・画像事前フェッチ
    useSliderGallery.ts      # スライダー型ギャラリー UI 状態管理（ページング・キーボードナビ）
    useSyntaxHighlight.ts    # 記事本文 <pre><code> のシンタックスハイライト適用
    useMathRender.ts         # 記事本文の数式（KaTeX）レンダリング
    usePopupLock.ts          # ブラウザポップアップの多重表示防止ロック（lib/popup-lock 連携）
    useMenuKeyboard.ts       # ポータルメニューのキーボードナビゲーション（Arrow Up/Down・ESC・フォーカストラップ）
    useDelayedGalleryItems.ts # 削除された items を 300ms 保持してフェードアウト遷移を可能にする（masonic 中間削除アニメーション用）
    useConfirm.ts            # window.confirm 代替 hook（Promise ベース確認モーダル。confirmModalProps を ConfirmModal に渡す）
    useMarkAllRead.ts        # 全既読ロジック集約 hook（サブフィルター判定・50件確認・アンドゥ対応）
    useArticleViewProps.ts   # ArticleView に渡す props オブジェクトの useMemo 集約 hook（App.tsx から分割）
    useArticleListItemProps.ts # ArticleList の各レイアウトが共通で使う ArticleItemProps を構築する hook（#651 Step 2 で抽出）
    useFeedSidebarActions.ts # FeedSidebarProvider value オブジェクト生成 hook（App.tsx から分割・useMemo 済み）
    useToast.ts              # トースト通知状態管理（success/error/info 3種別・最大3件スタック・自動消去）
    useGlobalFilterAutoRead.ts # globalFilter に引っかかった記事を自動既読にする（フィルター除外記事の未読カウント混入防止）
    useAutoLoadMoreArticles.ts # フィルター後の表示不足時にサーバーから過去記事を自動取得する（最大3回・無限ロード防止）
    useEngagementToggles.ts  # ブックマーク・後で読む・いいねのトグルハンドラー生成（トグルとエンゲージメント記録を統合）
    useHeaderShareTargets.ts # ArticleHeader / UserSettingsModal で使用するシェアターゲット設定フック
    useDigestFeedOrder.ts    # エンゲージメントスコアに基づくフィード表示順リスト（高スコア順 feedHash[]）を返す hook（ダイジェストビュー用）
  lib/
    auth.ts                  # JWT 検証 (JWKS)、トークン交換・リフレッシュ・失効
    server-auth.ts           # withSession() / requireSession() / applyRefreshedTokens()
    beta-allowed.ts          # isBetaAllowed() — BETA_ALLOWED_SUBS チェック（next/* 非依存・拒否時に sub prefix を console.warn）
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
    auto-read.ts             # オートモードの状態遷移判定純粋関数（isAutoReadFinished / shouldTriggerAutoFetch / shouldStartAutoSpeak）
    inline-nav.ts            # インラインナビ領域クリック位置判定純粋関数（whichSideClicked）
    test-seed.ts             # /api/test/seed のリクエストボディ検証純粋関数（validateSeedRequest）
    article-filter.ts        # 記事フィルタリングロジック (feedId / 日付 / キーワード / クエリ)
    keyword-filter.ts        # キーワードフィルタリングマッチング（正規表現対応）
    linkedom-types.ts        # linkedom DOM 操作用の共有型定義（LDElement / LDDocument）
    llm-feed-generator.ts    # LLM で RSS のないサイトからフィード生成
    lru-cache.ts             # クライアントサイド LRU キャッシュ
    ogp.ts                   # OGP メタデータ取得ロジック
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
    image-error-placeholder.ts # 画像エラー時の SVG プレースホルダー生成
    favicon.ts               # ファビコン未読バッジ
    web-push.ts              # Web Push 送信ヘルパー
    push-silent-hours.ts     # Push 通知サイレント時間帯判定（isInSilentHours / isValidTimeHHMM / isValidIanaTimezone）
    export-markdown.ts       # ブックマーク・読書リスト記事を Markdown ファイルとしてダウンロード
    export-readwise.ts       # メモ付き記事を Readwise CSV (Highlight/Title/Author/URL/Note/Date) としてダウンロード
    rate-limit.ts            # KV ベースのクールダウン・スライディングウィンドウ レートリミット (checkAndUpdateCooldown / checkSlidingWindow)
    rate-limit-logic.ts      # スライディングウィンドウ判定の純粋関数 (evaluateSlidingWindow) — next/* 非依存でユニットテスト可能
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
    browser-summarizer.ts    # ブラウザネイティブ要約 API（Summarizer）の利用可否判定・要約実行
    translate-html.ts        # HTML DOM 内の翻訳対象テキスト抽出・翻訳適用
    tts-text.ts              # TTS 読み上げ用テキスト前処理純粋関数（URL を「リンク」に置換、#655）
    popup-lock.ts            # 同時に開けるブラウザポップアップ数を制限するクライアントサイドロック
    dbsc.ts                  # Device Bound Session Credentials (DBSC) ユーティリティ — 機能検出・チャレンジ生成・ヘッダービルダー (スケルトン)
    serialize-error.ts       # Error オブジェクトの構造化シリアライズ（ログ・通知用）
    retry-after.ts           # HTTP Retry-After ヘッダー（delta-seconds / HTTP-date）をミリ秒に変換（クライアント・cron で共有）
    read-state-storage.ts    # ReadState の localStorage 永続化ユーティリティ + ペンディング状態スナップショット
    read-state-prune.ts      # readBeforeTimestamp 以前の publishedAt を持つ既知記事の readId を物理削除する純粋関数（#635 A1）
    download-history.ts      # 画像 DL 履歴の URL FIFO 管理純粋関数（#648、ギャラリー画像保存時の重複チェック）
    read-state-sync-api.ts   # ReadState のサーバー通信（fetchReadState・saveReadState）
    sw-cache.ts              # Service Worker キャッシュ管理
    type-guards.ts           # TypeScript 型ガード関数
    ai-models.ts             # Workers AI モデル定数・`isWorkersAiModelId` 型ガード
    article-ui-helpers.ts    # React 依存テキストハイライト関数（クライアント専用）
    dev-log.ts               # 開発環境専用 `devError` ラッパー
    stats-helpers.ts         # 統計計算ヘルパー（`toDateStr` / `buildDayList`）
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

## テストカバレッジマップ

`e2e/*.spec.ts` 各ファイルと対象モジュールの対応表。

| テストファイル                        | 対象モジュール / 機能                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `api-health.spec.ts`                  | `/api/health` エンドポイント・認証ガード                                                                              |
| `article-filter.spec.ts`              | `src/lib/article-filter.ts` — 記事フィルタリングロジック                                                              |
| `digest-skip-read.spec.ts`            | `src/lib/article-filter.ts` — ダイジェスト時に既読は digestLimit カウントから除外（#620 Option A）                    |
| `article-search.spec.ts`              | `src/hooks/useFullTextSearch` 経由の全文検索                                                                          |
| `article-ttl.spec.ts`                 | `src/lib/article-ttl.ts` — TTL 管理純粋関数                                                                           |
| `auto-read.spec.ts`                   | `src/lib/auto-read.ts` — オートモード状態遷移判定純粋関数                                                             |
| `inline-nav-click.spec.ts`            | `src/lib/inline-nav.ts` — インラインナビ クリック位置判定純粋関数                                                     |
| `strip-html-with-breaks.spec.ts`      | `src/lib/html.ts#stripHtmlWithBreaks` — `<br>` / `<p>` を改行に変換する HTML strip                                    |
| `test-seed-validation.spec.ts`        | `src/lib/test-seed.ts` — e2e seed リクエストボディ検証純粋関数                                                        |
| `test-seed-integration.spec.ts`       | `app/api/test/seed/route.ts` — seed エンドポイント smoke test                                                         |
| `article-utils.spec.ts`               | `src/lib/article-utils.ts` — readingTime / timeAgo                                                                    |
| `articles-save.spec.ts`               | `app/api/articles/save/route.ts` — 記事手動保存 API                                                                   |
| `auth-headers.spec.ts`                | 認証ヘッダー処理                                                                                                      |
| `auth-utils-edge.spec.ts`             | JWT 検証エッジケース                                                                                                  |
| `auth-utils.spec.ts`                  | `src/lib/auth.ts` — JWT 検証・トークン交換                                                                            |
| `auth.spec.ts`                        | `/api/auth/*` エンドポイント統合テスト                                                                                |
| `beta-allowed.spec.ts`                | `src/lib/beta-allowed.ts` — BETA_ALLOWED_SUBS チェック・拒否時の調査ログ                                              |
| `dev-auth-bypass-unit.spec.ts`        | `src/lib/dev-auth-bypass.ts` — getDevBypassUserId / buildDevBypassProfile の境界値                                    |
| `storage.spec.ts`                     | `src/lib/storage.ts` — toggleSetItem の Set トグル動作・deferred-save の冪等性・Node 環境での安全性                   |
| `browser-summarizer.spec.ts`          | `src/lib/browser-summarizer.ts` — ブラウザネイティブ要約 API                                                          |
| `browser-translator.spec.ts`          | `src/lib/browser-translator.ts` — Chrome Translator API 検出                                                          |
| `cache-control.spec.ts`               | `/api/articles` の Cache-Control ヘッダー                                                                             |
| `cache-helper.spec.ts`                | `src/lib/cache-helper.ts` — Cloudflare Cache API ヘルパー                                                             |
| `cascade-overflow.spec.ts`            | `src/lib/shared-feed.ts` — 500 件超えページカスケード                                                                 |
| `cron-fetch.spec.ts`                  | `src/cron/fetch.ts` — buildArticle / applyFeedSuccess / applyFeedRateLimit / applyFeedError / buildBatchedPushPayload |
| `clip.spec.ts`                        | `src/lib/clip.ts` — SingleFile POST バリデーション                                                                    |
| `collections-api.spec.ts`             | `app/api/collections/**/route.ts` — コレクション CRUD API                                                             |
| `concurrency.spec.ts`                 | `src/lib/concurrency.ts` — pMap 並行処理                                                                              |
| `content-extraction.spec.ts`          | `src/lib/content.ts` — 本文抽出 (Readability + regex)                                                                 |
| `cron-rate-limit.spec.ts`             | `src/lib/rate-limit.ts` — スライディングウィンドウ制限                                                                |
| `rate-limit-sliding-window.spec.ts`   | `src/lib/rate-limit-logic.ts` — `evaluateSlidingWindow` 通過/拒否判定・Retry-After 算出・境界値                       |
| `csrf-origin.spec.ts`                 | `src/lib/csrf.ts` — CSRF トークン・Origin 検証                                                                        |
| `dbsc.spec.ts`                        | `src/lib/dbsc.ts` — チャレンジ生成・ヘッダー構築・署名検証                                                            |
| `engagement-score.spec.ts`            | `src/lib/engagement-score.ts` — エンゲージメントスコア計算                                                            |
| `embed-utils.spec.ts`                 | `src/lib/embed-utils.ts` — iframe embed 処理ユーティリティ                                                            |
| `export-markdown.spec.ts`             | `src/lib/export-markdown.ts` — Markdown エクスポート                                                                  |
| `export-readwise.spec.ts`             | `src/lib/export-readwise.ts` — Readwise CSV エクスポート                                                              |
| `feed-discovery.spec.ts`              | `src/lib/feed-discovery.ts` — RSS 自動探索                                                                            |
| `feed-group-drop.spec.ts`             | `src/lib/feed-group-drop.ts` — D&D 競合解決ロジック                                                                   |
| `feed-groups-api.spec.ts`             | `app/api/feed-groups/**/route.ts` — フィードグループ CRUD API                                                         |
| `feeds-crud.spec.ts`                  | `app/api/feeds/**/route.ts` — フィード CRUD API                                                                       |
| `feeds-validation.spec.ts`            | `src/lib/validation.ts#isValidCookieHeader` — Cookie バリデーション                                                   |
| `fetch-article-content-clamp.spec.ts` | `src/lib/fetch-article-content.ts` — コンテンツクランプ                                                               |
| `full-text-search.spec.ts`            | `src/lib/full-text-search.ts` — クエリパーサー                                                                        |
| `html-post-processor.spec.ts`         | `src/lib/html-post-processor.ts` — HTML 後処理パイプライン                                                            |
| `html-to-markdown.spec.ts`            | `src/lib/html-to-markdown.ts` — HTML → Markdown 変換                                                                  |
| `image-extractor.spec.ts`             | `src/lib/image-extractor.ts` — 画像 URL 抽出                                                                          |
| `image-mime.spec.ts`                  | `src/lib/image-mime.ts` — 画像 MIME タイプ検証                                                                        |
| `image-proxy-security.spec.ts`        | `src/lib/image-proxy-security.ts` — プロキシリクエスト検証                                                            |
| `image-proxy-url.spec.ts`             | `src/lib/image-proxy-url.ts` — プロキシ URL ビルダー                                                                  |
| `json-feed.spec.ts`                   | JSON Feed パース                                                                                                      |
| `jwt-aud-iss.spec.ts`                 | JWT audience / issuer 検証                                                                                            |
| `keyword-filter.spec.ts`              | `src/lib/keyword-filter.ts` — キーワードフィルタリング                                                                |
| `landing.spec.ts`                     | 未ログイン時ランディングページ表示                                                                                    |
| `linkedom-types.spec.ts`              | `src/lib/linkedom-types.ts` — DOM 型ガード                                                                            |
| `llm-feed-generator.spec.ts`          | `src/lib/llm-feed-generator.ts` — LLM CSS セレクタ推論                                                                |
| `lru-cache.spec.ts`                   | `src/lib/lru-cache.ts` — LRU キャッシュ                                                                               |
| `modal-focus-trap.spec.ts`            | モーダルのフォーカストラップ                                                                                          |
| `modal-popup-lock-coverage.spec.ts`   | `src/lib/popup-lock.ts` — ポップアップ多重防止                                                                        |
| `obsidian.spec.ts`                    | `src/lib/obsidian.ts` — Obsidian URI 生成                                                                             |
| `ogp-url-normalize.spec.ts`           | `/api/ogp` URL 正規化                                                                                                 |
| `opml-feed-groups.spec.ts`            | `src/lib/opml.ts` — OPML パース・ビルド                                                                               |
| `popup-lock.spec.ts`                  | `src/lib/popup-lock.ts` — ロックライフサイクル                                                                        |
| `push-batch.spec.ts`                  | `src/lib/web-push.ts` — Web Push バッチ送信                                                                           |
| `push-config.spec.ts`                 | `src/lib/push-silent-hours.ts` — サイレント時間帯判定・disabledFeeds フィルタリング                                   |
| `push-api.spec.ts`                    | `app/api/push/**/route.ts` — Push 通知 API                                                                            |
| `article-filter-digest.spec.ts`       | `src/lib/article-filter.ts` — digestLimit per-feed フィルタリング                                                     |
| `rate-limit-serialized.spec.ts`       | `src/lib/serialize-async.ts` + レートリミット                                                                         |
| `read-state-api.spec.ts`              | `app/api/read-state/route.ts` — 既読状態 API                                                                          |
| `read-state-merge.spec.ts`            | `src/lib/read-state-merge.ts` — 状態マージ純粋関数                                                                    |
| `read-state-storage.spec.ts`          | `src/lib/read-state-storage.ts` — localStorage 永続化                                                                 |
| `read-state-prune.spec.ts`            | `src/lib/read-state-prune.ts` — readBeforeTimestamp 以前の readId 物理削除純粋関数（#635 A1）                         |
| `download-history.spec.ts`            | `src/lib/download-history.ts` — 画像 DL 履歴の FIFO 管理純粋関数（#648）                                              |
| `reader-settings.spec.ts`             | `src/lib/reader-settings.ts` — リーダー設定バリデーション                                                             |
| `reading-progress.spec.ts`            | `src/lib/reading-progress.ts` — 読書進捗計算                                                                          |
| `recommendation.spec.ts`              | `src/lib/recommendation.ts` — `sanitizeForPrompt` / `isCacheValid`                                                    |
| `refresh-tokens.spec.ts`              | `src/lib/auth.ts` — リフレッシュトークンフロー                                                                        |
| `regex-extractor.spec.ts`             | `src/lib/regex-extractor.ts` — 正規表現ベース本文抽出                                                                 |
| `retry-after.spec.ts`                 | `src/lib/retry-after.ts` — Retry-After ヘッダーパース                                                                 |
| `rsshub.spec.ts`                      | `src/lib/rsshub.ts` — RSSHub URL 変換                                                                                 |
| `sanitize-dompurify.spec.ts`          | 調査コード（dompurify Workers 非対応調査、無効化済み）                                                                |
| `sanitize-for-prompt.spec.ts`         | `src/lib/recommendation.ts#sanitizeForPrompt`                                                                         |
| `sanitize-html.spec.ts`               | `src/lib/html.ts#sanitizeHtml`                                                                                        |
| `serialize-error.spec.ts`             | `src/lib/serialize-error.ts` — エラーシリアライズ                                                                     |
| `shared-feed-merge.spec.ts`           | `src/lib/shared-feed.ts#mergeNewArticles`                                                                             |
| `shared-feed.spec.ts`                 | `src/lib/shared-feed.ts` — フィードデータ R2 操作                                                                     |
| `speakerdeck-embed.spec.ts`           | `src/lib/html-embed-transforms.ts` — SpeakerDeck 変換                                                                 |
| `stats.spec.ts`                       | `src/lib/stats-helpers.ts` — `toDateStr` / `buildDayList`                                                             |
| `stats-feed-drilldown.spec.ts`        | `src/lib/stats-helpers.ts` — `aggregateStatsForFeed` フィード別集計純粋関数                                           |
| `tag-validation.spec.ts`              | `src/lib/validation.ts#parseTagIds` — タグバリデーション                                                              |
| `translate-html.spec.ts`              | `src/lib/translate-html.ts` — HTML 内テキスト翻訳                                                                     |
| `tts-text.spec.ts`                    | `src/lib/tts-text.ts` — TTS 読み上げ用 URL 前処理純粋関数（#655）                                                     |
| `url-ssrf.spec.ts`                    | `src/lib/url.ts` — SSRF 対策 URL バリデーション                                                                       |
| `validation-functions.spec.ts`        | `src/lib/validation.ts` — バリデーション純粋関数                                                                      |
| `session-id-validation.spec.ts`       | `src/lib/validation.ts` — `isValidSessionId`（UUID 形式・パストラバーサル防止）                                       |
| `xml-parser.spec.ts`                  | `src/lib/xml-parser.ts` — RSS / Atom パーサー                                                                         |

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
