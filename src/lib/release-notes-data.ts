export const RELEASE_NOTES_MARKDOWN = `
# リリースノート 〜ギャルが読み上げるよ〜

## 2026-04-28

### 激アツ新機能っ

- **ギャラリービュー: モバイルスクロールスナップ** — Issue #240。スマホでギャラリーを縦スクロールしたとき、指を離すと一番近いカードにピタッとスナップするようになったよ〜！CSS scroll-snap-type: y proximity で自然な吸着感、カードが中途半端に切れることがなくなったっ📱✨

- **ギャラリー「一覧から削除」メニュー** — Issue #239。ギャラリービューで右クリック/長押しメニューに「一覧から削除」が追加されたよ〜！未読記事をサクッと既読にして、未読フィルターONなら即消えるから快適✨📱🎀

- **オフライン状態インジケーター強化** — Issue #230。オフライン時のUXがめっちゃ良くなったよ〜！フィード追加・更新ボタンがオフライン中はグレーアウトされて誤操作防止、バナーに「同期待ち」表示で未送信の既読変更があるのがひと目でわかるようになったっ。オンラインに戻ったら自動で同期するから安心だよ〜📡✨

## 2026-04-25

### 激アツ新機能っ

- **ユーザーごとの記事保持期間（TTL）設定** — Issue #205。記事の保持期間をユーザー設定モーダルから自由に変更できるようになったよ〜！7日・14日・30日（デフォルト）・60日・90日・無制限から選べちゃう✨ サーバー側でちゃんとフィルタリングするから安心だよっ🔧🎀

- **フィード健全性ダッシュボード** — Issue #202。フィードのエラー状態がひと目でわかるようになったよ〜！サイドバーにエラー警告⚠️・レートリミット⏰・容量超過アイコンが表示されるようになって、フィード詳細モーダルにはヘルスステータスドット（正常🟢・注意🟡・停止🔴）と相対時刻表示を追加したの✨🎀

### バグ修正っ

- **ギャラリー自動既読でカードが消えちゃう問題を修正** — Issue #222。ギャラリーで自動既読になったカードが即座に消えてレイアウトがガタガタ崩れてた問題を直したよ〜！自動既読になった記事は「未読のみ」フィルター中でもそのまま表示し続けて、フィード切り替えやビュー変更でリセットする仕組みにしたの✨ masonryの再描画が激減してサクサクっ🚀🎀

- **ギャラリー自動既読が記事カテゴリでも動いちゃってた問題を修正** — Issue #224。表示カテゴリが「記事」のフィードでもギャラリー自動既読が有効になってたのを無効化したよ〜！自動既読は「画像」「動画」「SNS」カテゴリだけで動くようにっ✨📱🎀

### パフォーマンス改善っ

- **既読・ブックマーク等の操作が爆速に** — Issue #223。readIds が 5 万件に育つと markRead のたびに JSON.stringify がメインスレッド占拠して約 1 秒フリーズしちゃってたの〜💦 localStorage 書き込みを \`deferSaveSet\` で非同期バッチ化して、同じティック内の書き込みは 1 回にまとめるようにしたよっ！React state は即時更新のままだから体感ゼロ遅延✨⚡ サーバー側の \`mergeIdList\` もファストパス追加で高速化っ🚀

### リファクタリングっ

- **useUIState.ts を5つのサブフックに分割** — Issue #227。381行・15+ useState のモンスターフックだった \`useUIState.ts\` をスッキリ分割しちゃったよ〜！\`useThemePreference\`（テーマ管理）・\`useLayoutSettings\`（レイアウト・フォント設定）・\`useAutoReadSettings\`（自動既読・自動翻訳）・\`useAccessibilitySettings\`（行間・テキスト均等割り）・\`useStoredSetting\`（localStorage永続化ユーティリティ）の5つに分けて見通しバツグンっ✨🔧

## 2026-04-24 (8)

### パフォーマンス改善っ

- **R2 の N+1 読み取りを並行度制限で最適化** — Issue #201。フィード100件購読してると \`Promise.all\` で100並列 R2 GET しちゃってたの、\`pMap\` で同時10件ずつに制限したよ〜！\`getUserLatestArticles\`・\`getUserFeeds\`・\`buildFeedUserMap\`・OPML インポート・推薦リンク探索の5箇所をまとめて修正っ🚀⚡

## 2026-04-24 (7)

### 激アツ新機能っ

- **ギャラリービューでスクロール既読** — Issue #212。ギャラリーレイアウトで記事カードを上にスクロールして通り過ぎたら自動で既読にしちゃうよ〜！自動既読がオンのときだけ動くから安心っ✨IntersectionObserver で賢く検知してるの📱🎀

## 2026-04-24 (6)

### パフォーマンス改善っ

- **readIds 肥大化 & sendBeacon ペイロード上限超過を修正** — Issue #200。readIds が 10 万件超になるとサーバーの R2 データが肥大化しちゃう問題と、\`sendBeacon\` の 64KB 上限を超えてデータロストしちゃう問題をまとめて解決！サーバー側は \`mergeReadStateUpdate\` で readIds を 10 万件にトリム、クライアント側は sendBeacon 前に 60KB サイズチェックして超過時は localStorage にフォールバック保存、次回ログイン時に自動リカバリするようにしたよ〜✨ localStorage の readIds も 5 万件で自動トリムするっ🚀💾

## 2026-04-24 (5)

### バグ修正っ

- **全既読がカテゴリ単位で動くように修正** — Issue #213。グループ・コレクション・タグ・FeedView タブで表示中のときは、表示中の未読記事だけを既読にするようにしたよ〜！全部まとめて既読にされちゃう問題をサクッと解決💡📚

## 2026-04-24 (4)

### 激アツ新機能っ

- **シェアメニューに Discord 共有を追加** — Issue #217。記事の共有メニューに Discord ボタンが登場したよ〜！タイトルと URL をクリップボードにコピーして Discord アプリを自動で開いちゃう✨Slack 共有と同じ使い心地だからすぐ慣れるっ💜🎮

## 2026-04-24 (3)

### リファクタリングっ

- **CollectionDropdown を独立コンポーネントに分離** — Issue #204。\`ArticleView.tsx\` 内にベタ書きされてた \`CollectionDropdown\` を \`src/components/CollectionDropdown.tsx\` に抽出したよ〜！しかも \`window.prompt\` / \`window.alert\` を廃止して、ちゃんとした \`CollectionModal\` 連携に変更しちゃった✨他のコンポーネントからも再利用できるようになったっ🎀

## 2026-04-24 (2)

### リファクタリングっ

- **\`normalizeReadState\` ヘルパー関数を抽出して共通化** — Issue #199。\`app/api/read-state/route.ts\` の GET・POST ハンドラーに9フィールド×2箇所で重複してた \`ReadState\` デフォルト補完ロジックを \`normalizeReadState(stored: Partial<ReadState>): ReadState\` ヘルパーとして \`src/lib/read-state-merge.ts\` に抽出したよ〜！DRY 原則に従って将来的なフィールド追加時の修正漏れリスクもゼロになったっ✨🧹

### ドキュメント整備っ

- **\`architecture.md\` に useReadState サブフックを追記** — Issue #207。\`src/hooks/useReadState.ts\` が \`useReadStatePersistence\` / \`useReadStateSync\` / \`useReadStateTags\` の3つのサブフックに分割されてたのに \`.claude/rules/architecture.md\` には反映されてなかったから追記したよ〜！各サブフックの責務も明記したっ📝

## 2026-04-24

### パフォーマンス改善っ

- **スクロール先読みをリストの中間段階でトリガーするように改善** — Issue #214。記事一覧で一番下までスクロールしないと次のページが読み込まれなかった問題を修正したよ〜！\`rootMargin: "120px"\` → \`"600px"\` に変更して、スクロール途中（リストの約半分くらい）で次のページを先読みするようにしたっ。\`PAGE_SIZE\` も 30 件から 50 件に拡大して、ロード頻度を減らしたよ〜！さらに「過去の記事を読み込む」ボタンも IntersectionObserver で自動トリガーするようになって、クリックしなくてもサーバー側の追加記事が自動的に読み込まれるようになったっ✨🚀

### バグ修正っ

- **RSS コンテンツの相対パス画像（avif 等）が 404 になる問題を修正** — Issue #215。フィードの \`content:encoded\` に含まれる相対パス \`<img src="/images/photo.avif">\` が rss.0g0.xyz のパスとして解釈されて 404 になってたのを直したよ〜！\`xml-parser.ts\` の RSS 2.0 / Atom / RDF / JSON Feed すべてのパーサーで \`sanitizeHtml\` のかわりに \`applyCorePipeline(raw, link)\` を呼ぶようにして、記事の URL を baseUrl として相対パスを絶対 URL に解決してからプロキシ経由に書き換えるようになったっ。\`image-mime.ts\` も Sequence AVIF (\`avis\` brand) を \`image/avif\` として認識できるように修正したよっ！💡🖼️

### リファクタリングっ

- **\`articleMatchesQuery\` を廃止して \`matchesAdvancedQuery\` に統合** — Issue #210。\`src/lib/article-utils.ts\` の \`articleMatchesQuery\`（スペース区切り AND 検索のみ対応）は本番コードで既に使われておらず、\`src/lib/article-filter.ts\` が \`matchesAdvancedQuery\`（フィールド指定・OR・否定・フレーズ検索まで対応）に移行済みだったからデッドコードを削除したよ〜！テストも \`matchesAdvancedQuery\` を直接テストするよう書き直して、将来的な乖離リスクをゼロにしたっ✨🧹

### セキュリティ対策っ

- **DBSC sessionId に UUID 形式検証を追加** — Issue #196。\`challenge\` と \`register\` の両エンドポイントで、クライアント送信の \`sessionId\` に \`../\` や \`%2f\` を含む値を渡しても R2 キーが不正なパスにならないよう UUID フォーマット検証を追加したよ〜！\`/^[0-9a-f]{8}-...-[0-9a-f]{12}$/i\` にマッチしない場合は 400 を返すようになったっ🔒
- **DBSC チャレンジを R2 に永続化して登録フローで照合** — Issue #197。ログインコールバック時に \`users/{userId}/dbsc-pending-challenge.json\` としてチャレンジを TTL 5 分で R2 に保存し、\`/api/auth/dbsc/register\` でクライアントが送ってきたチャレンジと照合するようにしたよ〜！照合前に削除することでリプレイ攻撃も防止、スケルトン状態だった DBSC 登録フローが完全に機能するようになったっ🔐✨
- **/api/clip の HTML サイズ上限チェックを追加** — Issue #198。\`validateClipRequest\` に 5MB 上限チェックを追加したよ〜！文字数と \`TextEncoder\` による正確なバイト数の両方でチェックするので、日本語・絵文字を含む HTML でも正しく弾けるっ。巨大 HTML での DoS リスクをガードしたよっ🛡️

## 2026-04-23 (4)

### バグ修正っ

- **ギャラリービューの重複コンテンツ取得（429）を修正** — Issue #195。\`setMedia\` → 再レンダー → 新しい \`visible\` 参照 → effect 再実行 → 進行中 fetch が abort・再取得、というフィードバックループを断ち切ったよ〜！\`articles\` 配列の代わりに記事 ID の結合文字列 \`articlesKey\` を \`useEffect\` の依存にしたことで、記事内容が変わらない限り \`setMedia\` で再実行されなくなったっ。さらに同一記事の同時並行 fetch を防ぐ \`inflight\` Set も追加して二重取得を完全ガード！すぐ 429 になってた問題がようやく直ったよっ💡🚀

## 2026-04-23 (3)

### セキュリティ対策っ

- **DBSC (Device Bound Session Credentials) 本実装** — Issue #186。スケルトンから本格実装に完成させたよ〜！\`verifyDbscResponse\` で JWS compact serialization の P-256 ECDSA 署名検証を Web Crypto API で実装、\`importDbscPublicKey\` で JWK／PEM 両形式の公開鍵インポートに対応。register エンドポイントは公開鍵フォーマット検証＋R2 保存＋サーバーセッションへのバインドを実装、challenge エンドポイントはリプレイ攻撃防止付きのチャレンジ検証フローを実装したっ🔒🗝️

## 2026-04-23 (2)

### セキュリティ対策っ

- **DBSC (Device Bound Session Credentials) スケルトン実装** — Issue #186。セッションをデバイスの TPM (Trusted Platform Module) にバインドしてセッションハイジャック対策を強化するための土台を追加したよ〜！\`src/lib/dbsc.ts\` に機能検出・チャレンジ生成・ヘッダービルダーを、\`/api/auth/dbsc/register\` と \`/api/auth/dbsc/challenge\` に Route Handler スタブを実装。Chrome DBSC API が実験的段階のため、P-256 ECDSA 署名検証と R2 公開鍵保存は TODO として詳細な実装手順をコメントに記載したっ。ブラウザが対応し次第、フルに動かせる設計になってるよっ🔒🗝️

## 2026-04-23

### 改善っ

- **AI 要約をマークダウン構造化出力に変更** — Issue #194。プロンプトを「3〜5文の平文」から「ポイント箇条書き＋まとめ1文」のフォーマット指定に更新したよ〜！ UI 側もセクションヘッダー・箇条書き・まとめを視覚的に区別してレンダリングするようにしたので、平文ダラダラ表示がスッキリ読みやすくなったっ✨📋

### パフォーマンス改善っ

- **記事一覧のちらつき・重さを改善** — Issue #193。フィルター切り替えや既読更新のたびに起きてた余分な再レンダリングを4箇所修正したよ〜！\`collectionArticleIds\` を \`useMemo\` 化してレンダーごとの \`new Set\` 生成をなくしたし、\`handleToggleBookmark\` 等を \`useSyncedRef\` に切り替えてポーリング更新のたびにハンドラが再生成される問題も解消っ。サーバー同期後に既読 ID に変化がなければ状態更新をスキップする早期リターンも追加。フィルター切り替え時に「記事がありません」が一瞬ちらつく問題も \`wasJustCleared\` フラグで防止したよ〜✨⚡

### セキュリティ対策っ

- **refresh_token をサーバーサイドセッションに移行** — Issue #189。refresh_token をブラウザの Cookie に直接持たせるのをやめて、R2 の \`sessions/{sessionId}.json\` にサーバー側だけで保管するようにしたよ〜！ブラウザには不透明な \`session_id\` だけを渡す設計に変更。Cookie が万が一漏れても refresh_token そのものは手に入らないし、サーバー側でセッションを即時削除することで強制ログアウトも可能になったっ🔒✨

### リファクタリングっ

- **RateLimit ストレージを R2 → Workers KV に移行** — Issue #191。クールダウン・スライディングウィンドウのレートリミットデータを R2 オブジェクトストレージから Workers KV に移行したよ〜！KV は小さいキー・バリューの高速読み書きに最適で、\`expirationTtl\` でクールダウン期間後に自動削除されるから R2 の期限切れオブジェクトが残ることもなくなったっ。\`wrangler.toml\` に \`[[kv_namespaces]] binding = "RATE_LIMIT"\` を追加、デプロイ前に \`npx wrangler kv namespace create RATE_LIMIT\` でnamespace ID を取得・設定する必要があるよ💨✨

### バグ修正っ

- **スクロール経由の自動既読が機能しない問題を修正** — Issue #182。翻訳表示やサマリー表示など \`contentRef\` が attach されないケースで IntersectionObserver が記事要素を観察できず、設定した閾値（70%・80%・90%）まで読んでも自動既読にならなかったの。\`handleScroll\` にも同じ閾値チェックを追加して、スクロール位置ベースでもちゃんと自動既読できるようになったよ〜！📖✨

- **ギャラリービューの画像保存ファイル名を記事詳細と統一** — Issue #192。ギャラリーから「画像を保存」や「画像を一括保存」したとき、ファイル名が \`image-1\` みたいな汎用名称になってたのを \`記事タイトル-1.jpg\` 形式に変更したよ〜！記事詳細ビューの保存と完全に揃えたっ。\`buildSafeTitle\` ヘルパーを追加してサムネイル単体・一括ダウンロードどちらも対応済み🖼️✨

- **記事詳細で画像一覧が二重表示される問題を修正** — Issue #190。\`removeNoise()\` が EC ギャラリー（\`image-gallery\` / \`product-gallery\` 等のクラス）や画像のみの \`<ul>\` をインラインスライダー（\`rss-image-slider\`）に変換してたのが、末尾の \`ImageGallery\` コンポーネントとかぶって同じ画像が2回出てた問題を直したよ〜！スライダー変換をやめて \`<div hidden>\` でラップするように変更。\`collectImageUrlsFromHtml\` は hidden div の中の \`<img>\` も正規表現でスキャンするから、末尾ギャラリーには引き続き表示されるよっ。Shopify 製品ページの \`product-featured-media\` 画像も同様に修正🖼️✨

## 2026-04-22

### リファクタリングっ

- **\`content.ts\` を4ファイルに分割** — Issue #181。1272行の巨大ファイルを \`html-post-processor.ts\`・\`readability-extractor.ts\`・\`regex-extractor.ts\`・\`content.ts\`（オーケストレーション専用）に分割したよ〜！循環依存ゼロで責務がスッキリ分離されてメンテしやすくなったの🧹✨

### バグ修正っ

- \`cascadeOverflow()\` が MAX_PAGES を超過したとき \`SharedFeedMeta.oversizeAlert\` フラグを立てるようにしたよ〜。\`console.warn\` だけじゃ気づけなかった問題を修正！💡

### リファクタリングっ

- **\`LayoutIcon\` コンポーネントを分離** — Issue #184。\`ArticleList.tsx\` にインライン定義されてた 5 種類のレイアウトアイコン SVG を \`src/components/LayoutIcon.tsx\` として切り出したよ〜！40 行超の visual noise がスッキリして、再利用もできるようになったの🧹✨

### セキュリティ対策っ

- **Cookie ヘッダー検証の強化** — Issue #179。\`isValidCookieHeader()\` の最大長を 4096 → 2000 文字に削減して、RFC 6265 準拠の name=value ペア形式チェックも追加したよ〜！value 内の \`;\` や \`,\` を拒否することで Cookie jar poisoning リスクを低減したの🔒✨

- **\`hasDangerousScheme()\` の NBSP バイパス対策** — Issue #178。\`&#160;javascript:\` や \`&nbsp;javascript:\` みたいな NO-BREAK SPACE（U+00A0）を使った XSS バイパス手法を検出できなかったやつを修正したよ〜！\`&nbsp;\` / \`&NonBreakingSpace;\` 名前付き文字参照のデコードと U+00A0 の除去を追加して、よりしっかりガードできるようになったの🔒✨

### リファクタリングっ

- **FeedSidebar を feed-sidebar/ ディレクトリに分割** — Issue #170。1767 行の巨大コンポーネントを \`FeedGroupsSection\` / \`FeedViewTabs\` / \`SpecialViewButton\` / \`FooterIconButton\` + \`StatItem\` の 5 ファイルに切り出したよ〜！メインの \`index.tsx\` は 1125 行に削減されてメンテしやすくなっちゃう🧹✨

## 2026-04-21

### コードレビューっ

- **APIレスポンスの型安全性を改善** — Issue #173。\`res.json() as Feed\` とか \`as ReadState\` みたいな検証なしキャストを型ガード関数に置き換えたよ〜！\`src/lib/type-guards.ts\` に \`isReadState\` / \`isFeed\` / \`isArticle\` を追加して、不正なレスポンスが来てもサイレントにクラッシュしないようにしたの🛡️✨

## 2026-04-21

### セキュリティ対策っ

- **フィード追加・全文取得 API にサーバーサイドのレートリミットを追加** — Issue #171。\`/api/feeds\` POST に 30 秒クールダウン、\`/api/content\` GET にスライディングウィンドウ（60 秒間 30 回）を導入したよ〜！キャッシュヒット時はカウントしない設計なのでふだんの読書体験には影響ナシっ🔒✨

## 2026-04-21

### パフォーマンス改善っ

- **記事選択の高速化 & 一覧チラツキ解消** — Issue #175 #176。記事を選ぶたびに全アイテムが再描画されてた問題をガチ修正したよ〜！\`isSelected\` を props から Context に切り出して、選択変化は前後 2 件だけ更新されるようにしたの✨ さらに既読フィルタなどで記事が消えるとき compact/list/card/magazine レイアウトでも 250ms のフェードアウトが入るようになって滑らかになっちゃう🎉🚀

- **KaTeX CSS を動的ロードに変更** — Issue #169。数式がない記事でも毎回読み込まれてた KaTeX のスタイルシート（~28KB）を、数式レンダリング時にだけ遅延ロードするようにしたよ〜！初回表示がちょっと軽くなっちゃう🚀✨

### バグ修正っ

- **ログイン認証を Basic 認証に統一** — 0g0-id が共有 \`INTERNAL_SERVICE_SECRET\` を完全撤去（Phase 9）したので、RSS 側も \`X-Internal-Secret\` / \`X-BFF-Origin\` ヘッダーを削除して Basic 認証（\`CLIENT_ID\`/\`CLIENT_SECRET\`）のみで接続するようにしたよ〜🔑✨

### 激ア���新機能っ

- **記事コレクション** — Issue #130。テーマ別に記事をまとめられるコレクション機能を追加したよ〜！「読書記録」「調査メモ」みたいに自分だけの記事セットを作れちゃう✨ サイドバーからコレクション切り替え＆ArticleView から記事をワンタップ追加できるよっ📂🎀

## 2026-04-21

### バグ修正っ

- **ログインできない問題を修正** — Issue #168。0g0-id が共有シークレット（\`INTERNAL_SERVICE_SECRET\`）を撤去して BFF 個別シークレットのみに移行したのに RSS リーダー側が追従してなかった問題を修正！環境変数を \`INTERNAL_SERVICE_SECRET_RSS\` にリネームして個別シークレット対応したよ〜🔒✨

## 2026-04-21

### バグ修正っ

- **小さいサムネイル画像の除外** — Issue #165。WordPress の \`-30x30.jpg\` みたいな小サムネイル画像が記事本文やギャラリーに表示されちゃってた問題を修正！URL内のサイズサフィックスを検出して100px未満のサムネは自動除外するようにしたよ〜🖼️✨

## 2026-04-22

### 激アツ新機能っ

- **翻訳プロバイダ表示** — Issue #166。ユーザー設定の自動翻訳セクションに「何で翻訳されるか」を表示するようにしたよ！Chrome 翻訳が使えない場合はその理由も教えてくれる〜💡✨

### バグ修正っ

- **フォーカスモードのモバイル対応** — Issue #164。スマホでは単一ペイン表示だからフォーカスモード意味ないのに解除ボタンが出ちゃってた問題を修正！解除ボタンとトグルボタンをPC（lg以上）のみ表示にしたよ〜📱✨

- **記事画像がコンテナ幅いっぱいに広がるように修正** — Issue #163。画像のwidthがエリアに対して小さかった問題を修正！CSS \`width: 100%\` で画像をコンテナ幅に追従させて、inline \`max-width\` で元画像サイズ以上に引き伸ばされないようにしたよ〜📸✨

### 激アツ新機能っ

- **ギャラリー右クリックメニュー** — Issue #162。画像/動画表示カテゴリのギャラリーで記事を右クリック（モバイルは長押し）するとコンテキストメニューが出現！サムネ画像の単体DL・全画像一括DL・既読/未読切替・ブックマーク切替がその場でできちゃう〜✨

### バグ修正っ

- **cascadeOverflow 重複記事排除** — Issue #158。overflow と既存ページをマージする際に id ベースの重複排除が行われていなかった問題を修正。maxPages 超過時の末尾ページ追記でも同様に重複排除を適用。knownIds のトリム時に latest ページの ID を必ず残すよう改善し、長期停止フィード再開時の重複も防止。

### セキュリティ対策っ

- **AI エンドポイントのレート制限強化** — Issue #154。単純な 5 秒クールダウンからスライディングウィンドウ方式（60 秒間に最大 10 回）に変更。持続的な AI API 乱用を防止しつつバースト利用を許容。旧データフォーマットとの後方互換性も確保。

### バグ修正っ

- **カラムリサイズのリスナーリーク修正** — Issue #157。ドラッグ中にウィンドウがフォーカスを失うと mousemove/mouseup リスナーが残存する問題を修正。window blur イベントでクリーンアップを追加。

## 2026-04-21

### 激アツ新機能っ

- **自動翻訳機能** — Issue #133。ユーザー設定に「自動翻訳」トグルを追加。有効化すると、非日本語記事を選択した際に自動で翻訳を実行する。Chrome Translator API が利用可能な場合はブラウザ側で完結し、非対応環境では Workers AI にフォールバック。\`isLikelyJapanese\` で原文言語を簡易判定し、日本語記事はスキップ。

### バグ修正っ

- **ギャラリービュー列数フォーカスモード修正** — Issue #144。列数固定時にフォーカスモードで余白が出る問題を解消（maxWidth 制約を削除）。自動モード時のフォーカスモードは最大6列に制限。

- **スマホ Chrome でブラウザ翻訳が使われない問題を修正** — Issue #138。\`shouldUseBrowserTranslation\` が \`availability === "available"\` のみを許可していたため、モバイル Chrome で翻訳モデル未ダウンロード時（\`"downloadable"\`）にブラウザ翻訳が発動せず Workers AI フォールバックになっていた。\`"downloadable"\` も許可し、\`Translator.create()\` のモデル自動ダウンロードを活用するよう修正。\`detectSourceLanguage\` の \`LanguageDetector\` availability チェックも同様に統一。

### 激アツ新機能っ

- **翻訳プロバイダー表示** — Issue #136。翻訳タブ選択時に「Chrome 翻訳」または「Workers AI」のバッジを表示し、どのエンジンで翻訳されたかをユーザーが確認できるように。\`AiOperationResult\` に \`provider\` フィールドを追加し、LRU キャッシュにも永続化。

- **OGP / Twitter Card 対応** — Issue #146。\`layout.tsx\` に Open Graph (\`og:title\` / \`og:image\` / \`og:description\` / \`og:site_name\`) と Twitter Card (\`summary_large_image\`) メタタグを追加。\`og.svg\` から PNG を生成して \`public/og.png\` として配置。Twitter・Slack・Discord 等でリンク共有時にリッチプレビューが表示されるように。E2E テストも追加。

### コードめかし込み

- **リリースノートのページネーション対応** — Issue #151。リリースノートが 3600 行に肥大化しバンドルサイズ・API レスポンスに影響していた問題を解消。\`release-notes-data.ts\` を直近 2 週間分にトリム（3400 行→ 745 行）、API に \`limit\` / \`offset\` パラメータを追加しセクション単位でページネーション、モーダルに「もっと見る」ボタンを追加して段階的読み込みに対応。古いエントリは git history に保持。

### 激アツ新機能っ

- **ギャラリービューの列数指定機能** — Issue #144。ユーザー設定モーダルに「ギャラリー列数」セグメントを追加（自動 / 2〜8列）。「自動」は従来通り columnWidth=220px ベースで masonic が自動計算、列数指定時はコンテナ幅から columnWidth を逆算して正確に N 列表示。記事一覧フォーカスモード（listFocusMode）時は指定列数に合わせた maxWidth を設定し余白を抑制。設定は localStorage (\`rss-gallery-columns\`) に永続化。

- **キーボードショートカット一覧ボタン + 記事一覧フォーカスモード切替ボタンを追加** — Issue #148。\`?\` キーでしか開けなかった \`KeyboardShortcutsModal\` の UI 導線と、\`Shift+\\\`（= \`|\`）以外に有効化手段がなかった \`listFocusMode\`（記事一覧フォーカス）の UI 導線を同時に整備。\`FeedSidebar\` のフッター（ユーザー設定・テーマ切替ボタンの隣）に \`onOpenHelp\` で開くヘルプ系 \`FooterIconButton\`（\`?\` 付き丸アイコン）を追加し、\`App.tsx\` から \`setShowHelp(true)\` を配線。\`ArticleList\` ツールバーのレイアウト切替ボタン群の直後に \`listFocusMode\` トグルボタン（\`ArticleView\` の \`focusMode\` トグルと対称な 4 隅矢印アイコン、\`aria-pressed\` 付き）を配置し、\`onToggleListFocusMode\` prop 経由で \`useUIState\` の \`toggleListFocusMode\` を呼ぶ。\`LAYOUTS.map\` と同じ w-6/h-6 サイズで統一し、既存のピルボタン群と視覚的に馴染ませた。これで \`|\` / \`\\\` キーバインドを知らないユーザーもヘルプから全ショートカットを参照でき、\`listFocusMode\` を明示的に ON / OFF できる。

## 2026-04-20

### 激アツ新機能っ

- **記事へのユーザータグ付与とタグ別ビュー** — Issue #103。記事に任意の複数タグを付与し、サイドバーのタグセクションから任意タグの付いた記事だけを横断表示できるようにした。データは既存 \`ReadState.tagIds?: Record<string, string[]>\` に相乗り（新規 R2 キーなし）、\`users/{userId}/read-state.json\` に保存される。\`src/lib/validation.ts\` に \`parseTagIds\` / \`MAX_TAG_NAME_LENGTH=50\` / \`MAX_TAGS_PER_ARTICLE=20\` を追加し、制御文字除去・重複排除・DoS 対策 (\`MAX_TAGGED_ARTICLES\` サーバー上限 2,000 件 / マージ層ハードリミット 5,000 件) を実装。\`src/lib/read-state-merge.ts\` の \`mergeTags\` は「incoming はキー単位で既存を上書き、\`removedIds.tagIds\` に入ってるキーは除去」という純粋キー置換方式で他端末とのマージを処理する。クライアント側 (\`src/hooks/useReadState.ts\`) には \`addTag / removeTag / setArticleTags / clearArticleTags\` を新設、\`pendingTagChangedRef\` / \`pendingTagRemovedRef\` で差分のみ POST する既存パターンを踏襲。\`applyServerState\` はローカル未同期キーを保護しつつ削除予定キーを除外する安全マージに。フィルター側 (\`src/lib/article-filter.ts\`) は \`selectedTag / articleTags / taggedOnly\` を受け付ける \`buildTagPredicate\` を追加し、UI では \`src/components/FeedSidebar.tsx\` の特殊ビュー直後に記事数付きタグ一覧を、\`src/components/article-view/TagEditor.tsx\` で記事ビュー内タグバッジの追加・削除 UI を実装。\`App.tsx\` に \`selectedTag\` 状態と \`?tag=\` URL 同期を追加（\`?feed\` / \`?group\` と相互排他）。\`e2e/read-state-merge.spec.ts\` に 5 ケース、\`e2e/article-filter.spec.ts\` に 6 ケース、\`e2e/tag-validation.spec.ts\` に 12 ケース新規テストを追加。

- **画像/動画カテゴリ選択時にギャラリーレイアウトへ自動切替 + 可視全記事の先行取得** — カテゴリタブで \`pictures\` / \`videos\` を選ぶと \`App.tsx\` の \`onChangeActiveFeedView\` ラッパーが自動的に \`onChangeLayout("gallery")\` を発火し、常に全画像・全動画が展開表示されるようにした。ユーザーが後で手動で別レイアウト (list / card 等) を選んだ場合はその選択を尊重する（次のカテゴリ切替時に再度 gallery に戻す）。加えて \`usePrefetchGalleryContents\` の \`maxPrefetch\` のデフォルトを 10 件 → \`POSITIVE_INFINITY\` (内部ハードリミット 200 件) に拡張し、スクロールで \`visible\` 配列が追加されるたびに新しい記事も自動で先行取得される挙動に変更。既存のバースト抑制 (concurrency 2 / requestDelayMs 250ms / 429 検出で全停止) は維持するため、サーバー負荷の上限は変わらない。

- **ギャラリービューで本文を先行取得して全画像・動画を展開表示** — 画像カテゴリ (\`activeFeedView === 'pictures'\`) と動画カテゴリ (\`'videos'\`) を選択中、ギャラリーレイアウトの表示記事について \`/api/content\` をバックグラウンドで並列先行取得し、本文内の全画像・全動画埋込みをカードに展開表示できるようにした。従来は \`article.ogImage\` 1 枚しか出せなかったため、画像系フィード（Tumblr / Pixiv 等）の記事カードに 1 枚の代表画像しか現れず、動画系フィードでは動画コンテンツがサムネ頼みで視認性が悪かった。\`src/hooks/usePrefetchGalleryContents.ts\` を新設（\`enabled\` フラグでカテゴリ限定、\`concurrency=3\` で並列制限、\`maxPrefetch=20\` で先頭 20 件まで）し、既存 \`contentLruCache\` を活用してキャッシュ済み記事は即座に state 反映、未キャッシュのみ \`apiFetch\` で /api/content を叩く。取得した HTML を \`collectImageUrlsFromHtml\` と新設 \`collectIframeUrlsFromHtml\`（信頼済みサービスのみ通過するため広告 iframe を除外）に通して \`Map<articleId, { images, embeds }>\` を公開。\`src/components/ArticleItems.tsx\` の \`GalleryArticleItem\` に \`prefetchedImages?: string[]\` を追加し、設定時は縦スタックで全画像を表示。動画カテゴリでは新設 \`extractEmbedThumbnailUrl\` で YouTube iframe URL を \`i.ytimg.com/vi/{id}/mqdefault.jpg\` の静止画に変換し、画像と同じパイプで展開。\`ArticleList.tsx\` の Props に \`activeFeedView?: FeedView\` を追加し \`App.tsx\` から配線、\`galleryImagesForItem\` コールバックでカテゴリ別の画像リストを組み立てる。\`e2e/content-extraction.spec.ts\` に \`collectIframeUrlsFromHtml\` の 4 ケース（複数抽出 / 重複排除 / 信頼済み以外除外 / iframe なし）を追加。unmount 時は \`AbortController\` で進行中フェッチを中断してリークを防ぐ。

- **FeedView カテゴリタブのみでの記事一覧横断表示** — サイドバー上部タブ（記事 / 画像 / 動画 / SNS）を切り替えるだけで、そのカテゴリに属する全フィードの記事を一覧表示できるようにした。従来はカテゴリタブで表示されるフィードのみ絞り込まれていたが、個別フィードを選択しない限り全記事が表示されていたため、カテゴリ横断的な閲覧ができなかった。\`src/lib/article-filter.ts\` の \`ArticleFilterOptions\` に \`viewFeedIds?: Set<string>\` を追加し、\`buildFeedPredicate\` で \`feedId===null && groupFeedIds 未設定\` のときのみ \`viewFeedIds.has(a.feedHash)\` で絞り込む。優先順位は \`feedId > groupFeedIds > viewFeedIds\` の順。\`src/hooks/useFilteredArticles.ts\` に \`activeFeedView: FeedView\` オプションを追加し、\`feeds\` を元に \`viewFeedIds\` を \`useMemo\` で構築。"articles" タブは \`FeedSidebar.matchView\` と同じ仕様で未分類フィード (\`Feed.view\` 未設定) も含む。\`src/App.tsx\` の \`onChangeActiveFeedView\` ラッパーで、タブ切替時に \`selectedFeedId\` / \`selectedGroupId\` / \`selectedArticle\` を null に戻すことで、ユーザーがタブを切り替えるだけで即座にカテゴリ横断表示になる UX にした。\`e2e/article-filter.spec.ts\` に 6 ケース追加（単一/複数 feedHash 横断 / feedId 優先 / groupFeedIds 優先 / 空 Set で全除外 / undefined で従来挙動維持）。

- **全フィード横断のフルテキスト検索と高度フィルタリング** — Issue #102。検索ボックスに高度クエリ構文を追加：フィールド指定 (\`title:foo\` / \`author:bar\` / \`feed:baz\` / \`category:qux\` / \`content:hello\`)、フレーズ検索 (\`"hello world"\`)、否定 (\`-foo\`)、暗黙 AND・明示 OR (\`foo OR bar\`)、大文字小文字無視。構文を含まない単純クエリは従来通り title / summary / author / categories / content を横断する既存互換挙動。\`src/lib/full-text-search.ts\` に純粋関数 (\`parseSearchQuery\` / \`matchesAdvancedQuery\`) として実装し、\`src/lib/article-filter.ts\` の \`buildQueryPredicate\` から呼び出す。\`SearchContext.feedTitleByHash\` を \`useFilteredArticles\` 側で構築し \`feed:\` クエリを解決可能に。検索条件の保存機能 (\`useFullTextSearch\` フック) を新設、\`localStorage\` (\`rss-saved-searches\`) に最大 20 件まで保存し検索ドロップダウンの「保存済み」セクションから即時呼び出せる。検索バー右側に「保存」ボタンを追加 (2 文字以上の入力時のみ表示)。\`e2e/full-text-search.spec.ts\` に 42 ケース追加 (parseSearchQuery / matchesAdvancedQuery のフィールド・OR/AND/NOT・フレーズ・エッジケース・未閉鎖クォート fallback・OR の大小無視)。
- **フィードビュータブ + Pinterest 風ギャラリーレイアウト** — Issue #114。サイドバー上部に「記事 / 画像 / 動画 / SNS」の 4 タブを追加し、各フィードを任意のカテゴリに分類できるようにした。タブ切替で対応する view のフィードのみが表示される（未分類フィードは「記事」タブ所属扱い）。併せて \`gallery\` レイアウトを新設（CSS columns による masonry、サムネイル優先）。\`UserSubscription.view\` / \`Feed.view\` / \`FeedPatchPayload.view\` を追加し、\`PATCH /api/feeds/:id\` で \`view: "articles" | "pictures" | "videos" | "social" | null\` を受け付ける。\`FeedItem\` のコンテキストメニューに「表示カテゴリ」サブメニューを追加。localStorage キー \`rss-active-feed-view\` にタブ選択状態を永続化。UX は [Folo](https://github.com/RSSNext/Folo)（AGPL-3.0）を参考にしたがコードは流用せず MIT のままとした。

### 激アツ新機能っ

- **記事一覧フォーカスモードの新設 + 画像/動画カテゴリで自動有効化** — Issue #141。既存の \`focusMode\`（サイドバーと記事一覧を畳んで記事詳細を最大化）とは別に、**サイドバーと記事ビューを畳んで記事一覧を最大化**する \`listFocusMode\` を新設した。\`useUIState.ts\` に state / \`toggleListFocusMode\` / \`setListFocusMode\` を追加し、Escape キー押下で両フォーカスモードともに OFF、\`\\\` キー単体で従来の \`focusMode\`、\`Shift+\\\` (= \`|\`) で \`listFocusMode\` をトグル、相互排他で一方を有効にすると他方は OFF になる。\`App.tsx\` の \`gridTemplateColumns\` を \`focusMode ? "0px 0px 1fr" : listFocusMode ? "0px 1fr 0px" : "\${sidebarWidth}px \${listWidth}px 1fr"\` に拡張（\`focusMode\` 優先）、カラムリサイズハンドルは両フォーカス時に非表示。さらに \`onChangeActiveFeedView\` ラッパーで \`view === "pictures" || "videos"\` のときに \`setListFocusMode(true)\` を呼び（\`gallery\` 自動切替とセット）、それ以外のカテゴリでは \`setListFocusMode(false)\` に戻す。これで masonic による Pinterest 型 masonry ギャラリーが記事ペイン全幅で表示され、画像/動画カテゴリの閲覧体験が大きく向上した。

### バグ絶対キルした（パフォ / UX）

- **フォーカスモード解除ボタンを追加（戻り方の可視化）** — Issue #143。画像/動画カテゴリ切替で \`listFocusMode\` が自動 ON になるがサイドバー・記事ビュー列が幅 0 に潰れるため、\`\\\` / \`|\` / \`Esc\` のキー操作を知らないユーザーには戻り方が不明だった。\`useUIState.ts\` に \`exitFocusMode\`（\`setFocusMode(false) + setListFocusMode(false)\` を同時呼び出す純粋ヘルパー）を新設し、\`App.tsx\` で \`focusMode || listFocusMode\` 時のみ表示される \`fixed top-3 right-3 z-50\` のピル型ボタン（展開アイコン + 「フォーカス解除」ラベル）から呼び出す。\`bg-ink\` / \`rounded-full\` の既存主アクション系スタイルで統一し、\`aria-label="フォーカスモード解除"\` と \`title\` にショートカット \`(Esc)\` を明示してアクセシビリティを確保。\`exitFocusMode\` は記事詳細フォーカス・記事一覧フォーカスどちらからでも同一挙動で抜けられるため、挙動の対称性が保たれる。

- **ギャラリーの既読削除アニメーション（位置遷移 + フェードアウト）** — Issue #145。masonic は append-only 前提で \`usePositioner\` deps \`[items.length]\` のため、既読で items が中間削除されると positioner が再生成され**残りカードが飛ぶように再配置**されていた。2 段構えで対応: (1) \`GalleryMasonry.tsx\` の \`useMasonry\` に \`itemStyle={{ transition: "top 0.3s ease, left 0.3s ease" }}\` を追加し、positioner 再生成後の新 top/left に CSS transition で**滑らかに遷移**させる。(2) \`src/hooks/useDelayedGalleryItems.ts\` を新設し、既読などで visible から抜けた記事を 300ms 間 \`displayItems\` に保持・同時に \`deletingIds\` Set に id を入れる。\`ArticleList.tsx\` の \`GalleryItemCtx\` に \`deletingIds\` を追加、\`GalleryCardRenderer\` が対象要素を \`opacity: 0 / pointer-events: none\` に遷移させるラッパーで wrap。300ms 後に真の \`items\` と同期して positioner 再生成、残りカードが CSS transition で自然に収まる流れ。wrapper style は参照安定化のため module scope 定数（\`GALLERY_CARD_WRAPPER_STYLE_VISIBLE\` / \`GALLERY_CARD_WRAPPER_STYLE_DELETING\`）に切り出し。新規追加のみ（append-only）の場合は遅延なしで即同期する設計のため、無限スクロールや新着取り込みのパフォーマンスには影響しない。

- **画像/動画カテゴリの事前取得で 429 を抑制 + Retry-After をサーバー経由で伝達 + ギャラリーのちらつきを解消** — Issue #142。3 点まとめて対応：(1) \`usePrefetchGalleryContents\` の \`requestDelayMs\` デフォルトを 250ms → 750ms に引き上げバースト抑制を強化。(2) \`app/api/content/route.ts\` で上流 429 受信時に \`Retry-After\` ヘッダー（と JSON body の \`retryAfter\`）をクライアントに pass-through、クライアント側は \`res.headers.get("Retry-After")\` を \`src/lib/retry-after.ts\` の新規 \`parseRetryAfter\` (delta-seconds / HTTP-date 両対応・\`maxMs=10 分\` でクランプ) でミリ秒化し \`rateLimitUntilRef\` に期限を保存、次回 effect 起動時にも期限内なら即終了してクールダウンを維持する。cron/fetch の既存 \`parseRetryAfter\` も同ライブラリを共有利用にリファクタ。(3) \`ArticleList.tsx\` の gallery 分岐が \`render\` prop にインライン関数を渡しており masonic が毎回 render identity 変化で全セルを unmount/remount → カード全体がちらついていた問題を修正。\`GalleryCardRenderer\` を \`memo\` で module scope に固定、\`resolveItemProps\` / \`galleryImagesForItem\` は \`GalleryItemCtx\` Context で供給。\`itemKey\` も module scope 関数に切り出して identity を安定化。これで prefetch state 更新が発生しても masonic セルの再マウントは起きず、対象セルのみ reconcile される。

### バグ絶対キルした（UXリグレッション）

- **ギャラリービューを masonic で仮想スクロール対応 Pinterest 型 masonry にリニューアル** — Issue #139。#126 で CSS columns (masonry) → CSS Grid 行優先 (\`grid-cols-* auto-rows-max\`) に変更したが、カード高がバラバラなため各行の最大高に揃えられて大きな空白が発生し視覚的に「キモい」状態になっていた。さらに元の CSS columns は「左列→下→次列」配置で infinite scroll で新記事が左列下部に挿入される #126 の問題も抱えており、両立が難しかった。\`masonic\` (MIT, ~8KB gz) を導入し、\`usePositioner\` / \`useResizeObserver\` / \`useMasonry\` の低レベル API で \`src/components/GalleryMasonry.tsx\` を新設。親スクロールコンテナ (\`scrollContainerRef\` の \`overflow-y-auto\` 領域) に適合させるため \`useParentScroller\` (rAF スロットリング付き scrollTop 監視) と \`useContainerMetrics\` (ResizeObserver で width / height / offsetTop 追従) のカスタム hook を内包。\`ArticleList.tsx\` の gallery 分岐を \`<GalleryMasonry items={visible} scrollElement={scrollEl} columnWidth={220} columnGutter={12} overscanBy={6} render={...} />\` に置換し、\`scrollEl\` は \`useLayoutEffect\` で \`scrollContainerRef.current\` を state に反映して子に渡す。\`usePositioner\` の deps は \`[items.length]\` として、append-only の無限スクロール時に既存アイテムの位置を保つ。

### メモっといた

- **architecture.md に新規 hooks / lib / components / R2 プロパティを追記** — Issue #128。\`.claude/rules/architecture.md\` の「ディレクトリ構造」セクションが直近の実装差分に追従できていなかったため、エージェントチーム（Explore × 3 並列）で差分を抽出して以下を反映。components に \`UserSettingsModal.tsx\` / \`SaveUrlModal.tsx\` / \`FeedAddModal.tsx\` / \`article-view/\` サブディレクトリを追記。hooks に \`useArticleHighlight\` / \`useArticleNote\` / \`useArticleAiRatings\` / \`useFullTextSearch\` / \`usePrefetchGalleryContents\` / \`useSliderGallery\` / \`useSyntaxHighlight\` / \`useMathRender\` / \`usePopupLock\` を追記。lib に \`api-error\` / \`cache-helper\` / \`csrf\` / \`rsshub\` / \`full-text-search\` / \`read-state-merge\` / \`feed-group-drop\` / \`image-proxy-url\` / \`image-proxy-security\` / \`browser-translator\` / \`translate-html\` / \`popup-lock\` / \`serialize-error\` を追記。R2 データ構造セクションの \`UserSubscription\` 行に \`view\` / \`requestCookie\` / \`lastAccessedAt\` を、\`ReadState\` 行に \`tagIds\` を、\`SharedFeedMeta\` 行に \`lastModified\` / \`etag\` / \`cacheControl\` / \`nextFetchEarliestAt\` を追加。さらに \`.claude/rules/release-notes.md\` に「新規 endpoint / hooks / lib / components / R2 プロパティ追加時は architecture.md も同期必須」というルールを明文化した。

### バグ絶対キルした

- **cascadeOverflow の MAX_PAGES 超過時データ喪失を修正** — Issue #131。\`src/lib/shared-feed.ts\` の \`cascadeOverflow\` は \`currentPage > MAX_PAGES (=500)\` でループを抜けるが、\`currentOverflow\` に残った記事が書き込まれずに silent drop されていた（PAGE_SIZE × MAX_PAGES = 250,000 件を超える極めて稀なエッジケース）。あわせてループ内の \`break\` 経路で \`currentOverflow\` がクリアされない既存バグも発見（末尾ページ追記ロジックが誤発火する）。修正: (1) break 前に \`currentOverflow = []\` で明示クリア、(2) ループ脱出後に残 overflow があれば末尾ページ (p{maxPages}) に追記して PAGE_SIZE 超過を許容（データ喪失より整合性を優先）、(3) \`console.warn\` で破棄件数・feedHash・page size を出力して運用監視可能に。テスト容易化のため \`cascadeOverflow\` を export し \`options?: { maxPages?: number; pageSize?: number }\` を追加（本番は既存定数をデフォルト使用）。\`e2e/cascade-overflow.spec.ts\` に 4 ケース追加（通常カスケード / 次ページ送り / maxPages 超過時の追記 / pageSize 超過許容）。R2Bucket の最小モック (\`makeR2Mock\`) をテスト内に実装。

- **useArticleContent の OGP フェッチ結果を localStorage に保存 + HTTP ステータス検証を追加** — Issue #127。\`src/hooks/useArticleContent.ts\` の OGP 画像動的解決 \`useEffect\` は \`loadJson(STORAGE_KEYS.OGP_CACHE)\` から読み込みはしていたが、フェッチ成功時に localStorage へ保存していなかったため、\`useOgpCache\` のバッチ取得（\`FETCH_BATCH_SIZE=10\`）に乗らなかった記事を直接開いた場合に \`/api/ogp\` を毎回叩き、同じ記事を再度開いた際もキャッシュが効かなかった。成功時に \`saveJson\` で保存するようにし、併せて \`MAX_OGP_CACHE_SIZE=2000\` と同等の切り詰めロジックを適用。\`r.json()\` の前に \`r.ok\` チェックを追加し、HTTP 4xx/5xx レスポンスの JSON を誤って parse して \`image=undefined\` で setState する潜在バグも解消。\`useOgpCache.ts\` のパターンに合わせる形の統一で、localStorage 読み込み側 (L73-80) の既存ロジックは不変。

- **ギャラリービューの並び順を行優先へ変更** — Issue #126。CSS columns による masonry は「左列を上から下へ埋めてから次の列」という列優先配置のため、infinite scroll で新しい記事が追加されるたびに左列の下部に新しい記事が流れ込み、すでに閲覧済みのカードが押し出される不自然な挙動になっていた。\`src/components/ArticleList.tsx\` の gallery レイアウトを \`columns-*\` から \`grid grid-cols-* auto-rows-max\` に変更し、「左→右、上→下」の行優先配置にした。併せて \`src/components/ArticleItems.tsx\` の \`GalleryArticleItem\` から columns 用の \`mb-3 break-inside-avoid\` を除去（親の \`gap-3\` と重複するため）。masonry 感は失われるが、スクロール時に上部の記事が固定される予測可能な並びを優先した。

- **image-proxy URL の二重ラップを防止** — Issue #125。サムネイル / OGP 画像が何らかの経緯で既に \`/api/image-proxy?url=...\` 形式（相対 URL のプロキシ形式）で渡された場合に、\`encodeURIComponent\` で再ラップして \`/api/image-proxy?url=%2Fapi%2Fimage-proxy%3Furl%3D...\` のような二重ラップ URL が生成される問題を修正。新規ユーティリティ \`src/lib/image-proxy-url.ts\` の \`buildImageProxyUrl(url)\` が「既にプロキシ化済みならそのまま返す / 絶対 URL のみ \`/api/image-proxy?url=<encoded>\` に変換」という冪等な防御を担保する。\`src/components/ArticleItems.tsx\` (\`ArticleThumbnail\`)、\`src/components/ArticleView.tsx\` (OGP 画像表示)、\`src/components/FeedSidebar.tsx\` (ユーザーアイコン)、\`src/hooks/useImageDownload.ts\` (OGP 画像 DL)、\`src/hooks/useContentLinkPreviews.ts\` (OGP リンクプレビュー) の 5 箇所でインラインの \`\` \`/api/image-proxy?url=\${encodeURIComponent(x)}\` \`\` をすべて \`buildImageProxyUrl(x)\` に置換。\`e2e/image-proxy-url.spec.ts\` に 10 ケース（絶対 URL / http / クエリ文字列のエンコード / プロキシ URL のスキップ / 複数回適用の冪等性 / \`isProxiedImageUrl\` 判定）を追加。

- **ギャラリー先行取得のリクエスト過多 (429) を抑制** — \`usePrefetchGalleryContents\` がデフォルト 3 並列 × 20 件で短時間に大量の \`/api/content\` リクエストを発行し、リモートサイト側のレート制限で 429 応答が返っていた。\`concurrency\` を 3 → 2、\`maxPrefetch\` を 20 → 10 に引き下げ、各 fetch 完了後に \`requestDelayMs\` (既定 250ms) のディレイを挿入してバーストを抑制。1 件でも 429 レスポンスを受信したら \`rateLimited\` フラグを立てて以降の全 worker を即停止し、\`AbortController.abort()\` で進行中の fetch も中断。これにより連鎖的な 429 を防ぎ、再訪時にキャッシュから即時復元される挙動は維持する。ディレイ中に unmount した場合も \`signal.addEventListener("abort")\` で sleep を即時解放してリークを防ぐ。

- **記事本文取得時に動画埋込みが削除される問題を修正** — Issue #120。\`src/lib/content.ts\` の \`extractWithReadability\` が \`@mozilla/readability\` に HTML を渡す際、Readability の独自 \`VIDEO_REGEXP\` に合致しない iframe（\`embed.nicovideo.jp\` / \`open.spotify.com\` / \`w.soundcloud.com\` / \`clips.twitch.tv\` / \`embed.zenn.studio\` / \`platform.twitter.com\` など）を本文外と判定して削除してしまう挙動があった。\`<iframe>\` / \`<video>\` / \`<audio>\` タグを Readability 実行前に \`<p class="rss-reader-preserved-embed">\` プレースホルダーに退避し、実行後に元タグへ復元する \`preserveTrustedEmbeds\` / \`restoreTrustedEmbeds\` を新設。プレースホルダー \`<p>\` 内のテキストに \`RSSREADER_EMBED_PLACEHOLDER_N_END\` 形式でインデックスを埋め込み、\`preClean\` の \`data-*\` 属性除去の影響を受けない設計にした。\`Readability\` コンストラクタに \`classesToPreserve: [EMBED_PLACEHOLDER_CLASS]\` を渡してクラス属性が剥がれないよう保証。復元後の HTML は従来どおり \`sanitizeHtml\` の \`TRUSTED_IFRAME_RULES\` で最終フィルタされるためセキュリティ境界は維持される。\`e2e/content-extraction.spec.ts\` に 6 ケース追加（YouTube \`/embed/\` iframe 保持 / ニコニコ iframe 保持 / \`<video>\` / \`<video><source>\` / \`<audio>\` 保持 / 信頼できない iframe の除去）。

- **記事本文取得前に翻訳できない問題を修正** — Issue #119。\`src/components/ArticleView.tsx\` の翻訳ボタン・\`z\` キーハンドラーは \`doTranslate(link, id, storedContent ?? undefined)\` を呼んでいたため、本文未取得 (\`storedContent\` なし) の状態で翻訳を実行すると、\`useAiOperation.run\` 内で \`localInput\` が \`undefined\` となり Chrome Translator API によるクライアント翻訳（HTML 構造保持）が発動せず、サーバー側の \`runAiJob\` は RSS フィード由来の短い本文のみを翻訳対象にしてしまっていた。翻訳処理を \`handleTranslate\` useCallback に共通化し、\`storedContent\` が無い場合は先に \`fetchFullContent(onFetched)\` で全文を取得し、取得結果を \`onFetched\` コールバック経由で \`doTranslate\` に直接渡すよう変更。これによりキーボードショートカット・ボタンクリックのどちらからでも、本文未取得時は自動的にフェッチ → 翻訳の順で処理され、HTML 構造を保持したまま全文翻訳が得られる。
- **image-proxy の許容サイズを 10MB → 30MB に拡大** — Issue #118。高画質 JPEG / PNG（一眼カメラ由来の 10MB 超画像や高解像度 PNG）が \`/api/image-proxy\` で \`too_large\` プレースホルダーに差し替えられてしまう問題に対応。\`app/api/image-proxy/route.ts\` の \`MAX_IMAGE_BYTES\` を \`10 * 1024 * 1024\` から \`30 * 1024 * 1024\` に引き上げた。Cloudflare Workers のリクエストあたりメモリ制限（128MB）に十分余裕を持たせた値で、\`readBodyBytes\` がストリームを一括でバッファに載せる実装もそのまま問題なく動作する。併せて \`content-length\` ヘッダーが \`MAX_IMAGE_BYTES\` を超える場合はストリームを読まずに \`too_large\` を即返す事前チェックも追加した（悪意あるサーバーが上限ちょうどのサイズを並列配信してメモリを圧迫する試みを防ぐ）。マジックバイト検証・Cloudflare Cache API による 30 日キャッシュはそのまま維持される。

- **記事全文のページネーション連結が trailing slash 付き URL で効いていなかった問題を修正** — \`src/lib/content.ts\` の \`isPaginatedVariant\` パス 3（bare numeric suffix）で \`curBase\` / \`nextBase\` を比較する際、WordPress pretty permalink（\`/slug/\` → \`/slug/2/\`）の場合に cur 側の pathname 末尾の \`/\` が剥がれず、next 側（\`/2/\` 除去後はスラッシュなし）と不一致になっていた。両側とも \`/\\/$/\` で trailing slash を正規化してから比較するよう修正。これにより \`<div class="page-links">Pages: ...</div>\` 形式（wp_link_pages 出力）の記事でも \`appendPaginatedPages\` が次ページを検出・連結できるようになる。\`e2e/content-extraction.spec.ts\` に回帰テスト 2 件追加（WordPress pretty permalink の \`/slug/\` → \`/slug/2/\` 検出 / \`/slug/2/\` → \`/slug/3/\` 検出）。

### ガード固めたっ

- **RSSHub ACCESS_KEY のクライアント漏洩を修正** — 前コミットの実装では \`resolveRSSHubUrl\` が変換後 URL に \`?key=...\` を直接含めていたため、その URL が \`users/{userId}/subscriptions.json\` / \`feeds/{feedHash}/meta.json\` に保存され、さらに \`assembleClientFeed\` 経由で \`Feed.url\` としてクライアントにも返っていた。これは \`RSSHUB_ACCESS_KEY\` シークレットがフロントから参照可能になる重大なリーク。\`src/lib/rsshub.ts\` から key 引数を削除し、代わりに \`appendAccessKeyIfRsshub(url, instance?, accessKey?)\` を新設して fetch 層 (\`src/cron/fetch.ts\` の \`fetchAndParseFeed\` / \`fetchAndScrapeWithSelectors\`) でのみ動的に付与する設計に変更。保存される URL には key が一切含まれないため、R2 / クライアントへの漏洩が防止される。\`appendAccessKeyIfRsshub\` はインスタンス host が一致する URL にのみ付与し、既に \`key=\` を持つ URL には二重付与しない・不正な URL はそのまま返す等の安全弁を備える。\`e2e/rsshub.spec.ts\` を 33 → 38 ケースに拡張（インスタンス外不付与 / 二重付与防止 / 既存クエリ保持 / URL エンコード / 不正 URL 保護）。

### 激アツ新機能っ

- **RSSHub 連携のオプトアウト機能とセルフホスト ACCESS_KEY サポート** — Issue #109 の追補。RSSHub 変換が強制的に行われていたため、\`FeedAddModal\` に「RSSHub で自動変換（Twitter / YouTube / GitHub 等）」チェックボックスを追加（デフォルト ON）してユーザー側でオプトアウトできるようにした。さらに、セルフホスト RSSHub インスタンスで \`ACCESS_KEY\` による認証を使っているケースに対応するため、\`RSSHUB_ACCESS_KEY\` シークレットを設定すると変換後の URL 末尾に \`?key=...\`（URL エンコード済み）を自動付与する機能を追加。\`src/lib/rsshub.ts\` に \`getRSSHubAccessKey()\` を新設、\`resolveRSSHubUrl(url, instance?, accessKey?)\` の第 3 引数として access key を受け取れるよう拡張。API 側は \`body.useRsshub !== false\` のときだけ変換処理を実行する（未指定はデフォルト ON、後方互換）。\`useFeedOperations.addFeed\` のシグネチャに \`useRsshub?: boolean\` を追加。\`e2e/rsshub.spec.ts\` を 33 ケースに拡張（ACCESS_KEY 付与・空文字扱い・URL エンコード・\`getRSSHubAccessKey\` の環境変数読み取り）。
- **RSSHub 連携による主要サービスの自動 RSS 化** — Issue #109。RSS を提供していない Twitter / X、YouTube チャンネル・ユーザー・\`@handle\`、GitHub ユーザー / リリース / issue、Instagram、Reddit サブレディット、Bilibili、Zhihu、Pixiv、Weibo、Telegram チャネルの URL を Feed 追加時に自動で [RSSHub](https://docs.rsshub.app/) の対応エンドポイントに変換するようにした。\`src/lib/rsshub.ts\` に純粋関数 \`resolveRSSHubUrl(url, instance?)\` / \`getRSSHubInstance()\` を追加し、\`app/api/feeds/route.ts\` の POST ハンドラーで URL バリデーション直後に変換を試みる。変換後の URL は再度 \`isValidFeedUrl()\` で検証してから既存の 3 段階フォールバック探索（RSS link → 手動 CSS セレクタ → LLM 推論）に進む。GitHub の第 1 階層予約語（\`marketplace\` / \`topics\` / \`features\` / \`pricing\` / \`enterprise\` / \`orgs\` 等 34 語）はユーザー名として誤マッチしないようブラックリストで弾く。RSSHub インスタンス URL は \`RSSHUB_INSTANCE_URL\` 環境変数で上書き可能（未設定時は \`https://rsshub.app\`）。\`e2e/rsshub.spec.ts\` に 27 ケース（主要サービス変換 / 予約語ブラックリスト / 大文字小文字 / クエリパラメータ / サブパス / カスタムインスタンス）を追加。

### バグ絶対キルした

- **RSS フィード記事サムネイルの優先順位を修正** — Issue #117。\`src/lib/xml-parser.ts\` の \`extractImage\` が \`media:thumbnail\` を第 1 優先・\`media:content\` を第 2 優先としていたため、低解像度サムネイルが採用され本来の高解像度画像が使われない事象が起きていた。MRSS 仕様の意図（サムネは \`media:content\` の小型版を表す要素）および Issue #117 の要求に従い、優先順位を **\`media:content\`（\`medium="image"\` または \`type="image/*"\`）→ \`media:thumbnail\` → \`itunes:image\`（新規追加、Podcast 対応）→ \`enclosure\` → \`content/description\` 内 \`<img>\`** に変更。これにより XML から取得できる画像の取りこぼしも減り、\`useOgpCache\` による \`/api/ogp\` へのフォールバック問い合わせが更に減少する。\`e2e/xml-parser.spec.ts\` に 4 ケース（media:content 優先 / media:thumbnail フォールバック / itunes:image 採用 / media:content の medium 未指定時のフォールバック）を追加。

### コードめかし込み

- **\`ArticleFilterContext\` を新設し ArticleList / ArticleView / FeedSidebar への prop drilling を削減** — Issue #96。\`src/contexts/ArticleFilterContext.tsx\` を新規追加し、既存の \`ReaderSettingsContext\` と同じ雛形で \`useFilteredArticles\` の戻り値 (\`FilterState\`) + \`onSaveFilter\` を \`ArticleFilter\` としてひとまとめに提供するようにした。\`src/App.tsx\` の \`<ArticleFilterProvider value={{ ...filterState, onSaveFilter: saveFilter }}>\` で 3 ペイン全体を囲み、\`ArticleList\` の \`filter\` prop、\`ArticleView\` の \`globalFilter\` / \`onSaveGlobalFilter\` / \`query\` / \`onSetQuery\` / \`onSetAuthorFilter\` / \`onSaveFilter\` prop、\`FeedSidebar\` の \`onSaveFilter\` prop を削除して \`useArticleFilter()\` 呼び出しに置き換え。\`ArticleView\` は \`setAuthorFilter\` + \`showToast\` の副作用ラッパーをコンポーネント内ローカル関数として内蔵。dead code になった \`onSetAuthorFilter ?\` 三項演算子も整理した。挙動変更なし、\`e2e/article-filter.spec.ts\` (62 ケース) を含む既存テストは全てパス。

### バグ絶対キルした

- **定期的にログアウトされる問題を修正** — Issue #113。0g0-id (\`/auth/refresh\`) は並列リフレッシュ競合（30 秒以内の rotation 済みトークン再提示）時に HTTP 401 + \`{ error: { code: "TOKEN_ROTATED", message: "..." } }\` を返す仕様だが、\`src/lib/auth.ts\` の \`refreshTokens\` がすべての 4xx を \`invalid\` として扱っていたため Cookie が削除されログアウト扱いになっていた。複数タブ・タブ復帰時の同時リフレッシュで日常的に発生するため「定期ログアウト」として体感される。レスポンスボディの \`error.code\` を読み取って \`TOKEN_ROTATED\` のみ \`transient\` にして Cookie を保持するよう修正（\`TOKEN_REUSE\` は従来どおり \`invalid\`）。\`e2e/refresh-tokens.spec.ts\` に 4 ケース追加（TOKEN_ROTATED → transient / TOKEN_REUSE / INVALID_TOKEN / TOKEN_EXPIRED → invalid）。
- **srcset 内の URL path に \`,\` を含む画像が壊れる問題を修正** — Issue #111。\`src/lib/content.ts\` の \`transformSrcset\` が単純に \`.split(",")\` で候補を分割していたため、Cloudinary の \`c_limit,f_auto,...\` のように変換パラメータ部で生の \`,\` を path に含む URL が途中で切れ、\`/api/image-proxy?url=...\` に不正な値が渡って画像が取得できなくなる可能性があった。WHATWG HTML srcset 仕様 (https://html.spec.whatwg.org/#parse-a-srcset-attribute) に寄せたパースに変更し、URL は whitespace を境界とし、URL 末尾の \`,\` のみを候補区切りとして扱うよう修正。これにより Cloudinary / imgix など path 内にカンマや encoded 文字 (\`%2C\` / \`%3F\`) を含む URL でも src / srcset が壊れずに丸ごと proxy へ渡されるようになる。\`e2e/content-extraction.spec.ts\` に回帰テスト 2 件（encoded delimiter 保持 / srcset 内 URL path \`,\` 保護）を追加。

### 激アツ新機能っ

- **RSS 取得時の Cache-Control 対応で配信元サーバーへのアクセスを最適化** — Issue #116。\`src/lib/fetch.ts\` に \`parseCacheControl\` / \`computeNextFetchEarliestAt\` を追加し、\`src/types.ts\` の \`SharedFeedMeta\` に \`cacheControl\`（直近レスポンスの生ヘッダー）と \`nextFetchEarliestAt\`（次回フェッチ可能時刻 ISO 8601）を追加。\`src/cron/fetch.ts\` の \`fetchAndParseFeed\` が 200 / 304 いずれの応答でも Cache-Control を保存し、\`fetchAndUpdateSharedFeed\` の cron 経路では \`nextFetchEarliestAt > now\` のときフェッチをスキップする。\`s-maxage\` が \`max-age\` より優先され、\`no-cache\` / \`must-revalidate\` / \`no-store\` 時は従来どおり毎回サーバー検証する（スキップしない）。クランプ範囲は下限 1800 秒（cron 間隔に一致）〜上限 21600 秒（6 時間）で、過度に短い / 長い指示を緩和する。手動 refresh (\`forceRetry=true\`) はスキップ対象外。\`e2e/cache-control.spec.ts\` に 17 ケース（max-age / s-maxage / no-store / no-cache / must-revalidate / 壊れ値 / クランプ境界）を追加。

## 2026-04-19

### バグ絶対キルした

- **記事詳細のコンテンツ幅がペイン幅に連動しない問題を修正** — Issue #80。\`src/components/ArticleView.tsx\` の外側ラッパーが \`max-w-2xl\` (672px) にハードコードされていたため、カラムリサイズやフォーカスモードで記事詳細ペインを広げても本文・タイトル・メタ情報が 672px 以上に拡大できず、ユーザー設定の \`contentWidth\`（narrow/medium/wide/full）も事実上 narrow 以外は効果を発揮しなかった。ラッパーのクラスから \`max-w-2xl\` を外し、\`getContentWidthStyle(contentWidth)\` を \`style\` で適用（\`transition-[max-width]\` も追加してスムーズに変化）することで、\`full\` を選択するとペイン幅いっぱいに、\`wide\` (900px) / \`medium\` (720px) を選択するとそれぞれ指定幅まで本文を拡大できるようにした。併せて \`.article-content\` 各出力（translate HTML / translate plain / 本文 / summary）内に重複していた \`getContentWidthStyle\` 呼び出しを削除し、幅制御を外側ラッパー 1 箇所に一元化した。

### 激アツ新機能っ

- **フィード追加・URL 保存をモーダルダイアログ化** — Issue #115。\`src/components/FeedSidebar.tsx\` のサイドバー上でインライン展開されていたフィード追加フォーム（URL / Cookie / CSS セレクタ）と URL 記事保存フォーム（ブックマーク / 後で読む）を、汎用 \`Modal\` コンポーネント (\`src/components/Modal.tsx\`) を使ったポップアップダイアログに移行。新設した \`src/components/FeedAddModal.tsx\` / \`src/components/SaveUrlModal.tsx\` にフォーム JSX を切り出し、Esc キー / オーバーレイクリックで閉じる挙動を Modal 側に一元化。\`handleAddFeed\` の \`canRetryWithSelector\` フロー（API 失敗時に CSS セレクタ欄を自動展開）はモーダル表示のまま維持し、既存の state（\`newUrl\` / \`newCookie\` / \`newCssSelector\` / \`saveUrl\` / \`saveError\` 等）は親で保持する形で \`addFeed\` / \`handleSaveArticle\` の呼び出しロジックは一切変更せず、視覚的なレイアウトのみ差し替えた。
- **フィード一覧の各種メニューを右クリック（コンテキストメニュー）に移行** — Issue #110。\`src/components/FeedItem.tsx\` のサイドバー上にホバー時だけ現れていた多数のアイコンボタン群（詳細・スター・NSFW・フィルター・カテゴリ・グループ・ミュート・ピン・既読化・更新・再推論・削除）を常時表示の ⋮ ボタンひとつに集約し、さらにフィード項目全体に \`onContextMenu\` ハンドラを追加してマウス右クリックでカーソル位置にメニューをポップアップさせるようにした。\`menuPortalStyle\` 計算を「⋮ボタンの \`getBoundingClientRect\` ベース」から、右クリック由来のときはマウス座標 (\`e.clientX\` / \`e.clientY\`)、⋮ボタン由来のときは従来のボタン基準、という二系統に拡張し、どちらの場合も画面端ではみ出さないようクランプしている。編集中 (\`editing\` / \`categoryEditing\`) はコンテキストメニューを無効化してテキスト入力側のネイティブメニューを残す。ドラッグ&ドロップ (\`draggable\` / \`onDragStart\`) との競合を避けるため \`onContextMenu\` では \`e.preventDefault()\` + \`e.stopPropagation()\` のみで drag API に干渉しない設計。
- **60×60 などの小さい画像を画像一覧・一括ダウンロード対象から除外** — Issue #112。\`src/lib/image-extractor.ts\` に \`MIN_IMAGE_SIZE_PX = 100\` を定数追加し、\`collectImageUrlsFromHtml\` では img タグの \`width\` / \`height\` 属性（または \`style\` の \`px\` 指定）、\`collectImageUrls\`（DOM 版）では \`naturalWidth\` / \`naturalHeight\` を優先し未解決時は属性にフォールバックする形で、**両辺とも閾値未満**の画像（サイトロゴ / SNS シェアアイコン / スペーサー等）を抽出段階で除外するよう変更。片方しかサイズ情報がない（縦長・横長画像の可能性）ケースや \`%\` 指定・属性未指定ケースは誤判定を避けて従来通り収集対象に残す。既存の \`useImageDownload.fetchOne\` の \`createImageBitmap\` による 100px 未満除外は二重防護として維持。\`e2e/image-extractor.spec.ts\` に 16 ケース（srcset フォールバック / data URI 除外 / サイズ閾値境界 / 片辺のみ・style・% 指定・混在）を追加。

### バグ絶対キルした

- **access_token 期限切れ時に一瞬ログイン画面へ戻る問題を修正** — 追加依頼。\`src/hooks/useAuth.ts\` の \`checkAuth\` で「以前認証済み」かつ \`/api/auth/me\` が \`user: null\` を返した場合、即座に \`setUser(null)\` せず 800ms / 1600ms の指数バックオフで最大 2 回までリトライしてから判定するよう変更。サーバー側 refresh の transient 失敗や JWKS 一時障害・R2 読み取り遅延で偶発的に null が返っても、ユーザーがログイン画面にフラッシュ遷移しなくなる（リロードで復帰できていた挙動を自動化）。\`sessionRecoveryAttempts\` カウンタは成功時にリセット。既存の \`?login=1\` 直後リトライ (600ms 単発) とは別の経路。

### メモっといた

- **R2 バックアップ / ディザスタリカバリ手順を追加** — Issue #106。\`docs/backup-recovery.md\` を新規作成。\`rclone\` / \`aws s3\` CLI / \`wrangler\` CLI を使った R2 バケット全体および選択的バックアップ手法、ユーザー別・フィード別の復旧手順、推奨頻度 (users: 日次 30 日保持 / feeds: 週次 8 週間 / ai-cache: 月次 2 ヶ月 / 全体スナップショット: 月次 12 ヶ月)、DR リハーサル手順、監視観点を記載。実コード (\`src/lib/r2.ts\` / \`src/lib/shared-feed.ts\` / \`src/lib/feed-groups.ts\` / \`src/lib/recommendation.ts\` / \`src/lib/server-auth.ts\`) に基づきユーザー別・共有フィード・AI キャッシュの全 R2 キー（クールダウン系含む）を優先度付き表で整理し、\`read-state\` 復元時のクライアントキャッシュマージ戦略 (ローカル ∪ サーバー、スヌーズは遅い方、ノートはサーバー優先) および cron 停止推奨の運用注意点も補足。\`README.md\` のデータ構造 (R2) 節から新ドキュメントへリンクを追加した。
- **セットアップ手順の詳細化** — Issue #105。\`README.md\` のセットアップ節に以下を追記した:
  - **0g0 ID OAuth2 アプリ登録**: 登録先 URL (\`https://id.0g0.xyz\`)・Callback URL (\`{APP_BASE_URL}/api/auth/callback\`)・許可スコープ (\`openid profile email\`) を表形式で明記。
  - **VAPID 鍵生成**: \`node scripts/generate-vapid-keys.mjs\` の具体的実行コマンドと出力例、Node.js 18.17 以上の要件を記載。
  - **Cloudflare API トークン**: ダッシュボード URL (\`https://dash.cloudflare.com/profile/api-tokens\`)・必要権限 (Account / Workers AI / Read)・Account ID 取得場所を記載。\`CLOUDFLARE_ACCOUNT_ID\` を \`wrangler.toml\` または secret で設定する旨を追加。
  - セットアップ手順全体を 5 ステップから 8 ステップに再構成。

### バグ絶対キルした

- **RSS 1.0 (RDF) フィードで \`dc:date\` が \`pubDate\` より優先されない問題を修正** — Issue #99。\`src/lib/xml-parser.ts\` の RSS 1.0 \`publishedAt\` 解析が \`parseDate(str(item.pubDate) || null) ?? parseDate(item["dc:date"] ?? null)\` の順序になっており、pubDate に truthy な非日付文字列（\`"not-a-date"\` 等）が入っている場合に dc:date が無視される、あるいは fast-xml-parser が dc:date を \`{ "#text": ... }\` オブジェクト形式で返したときに \`str()\` を通さず parseDate に渡すことで NaN 扱いになり \`publishedAt: null\` になる可能性があった。RSS 1.0 では \`dc:date\`（ISO 8601）が主要な日付フィールドであるため \`parseDate(str(item["dc:date"]) || str(item.pubDate) || null)\` に変更し、dc:date を優先・pubDate をフォールバックとする順序に揃えた。\`e2e/xml-parser.spec.ts\` に 2 ケース追加（pubDate と dc:date が両方ある場合の dc:date 優先 / pubDate が無効でも dc:date が有効なら採用）。
- **\`GET /api/articles\` で \`readUserSubscriptions\` が二重呼び出しされる問題を修正** — Issue #98。\`app/api/articles/route.ts\` の default 分岐で \`Promise.all\` を使って \`readUserSubscriptions\` と \`getUserLatestArticles\` を並列化していたが、\`getUserLatestArticles\` が内部で再度 \`readUserSubscriptions\` を呼んでいたため \`subscriptions.json\` が R2 から 1 リクエストあたり 2 回読まれていた。\`src/lib/shared-feed.ts\` の \`getUserLatestArticles\` にオプショナルな \`subs?: UserSubscription[]\` 引数を追加し、呼び出し元が取得済みの subs を渡せるように変更。route.ts 側は subs を先に 1 度だけ \`await\` し、\`getUserLatestArticles(env.RSS_DATA, session.userId, subs)\` として渡すよう調整した（\`savedArticles\` / \`readState\` の 2 本は引き続き並列）。R2 読み取りが 1 リクエストあたり 1 回に減少し、レイテンシ増加は subscriptions.json が小さいため無視できる範囲。
- **\`mergeNewArticles\` が変更なしでも毎回 R2 PUT を発生させる問題を修正** — Issue #97。\`src/lib/shared-feed.ts\` の \`mergeNewArticles\` で、新規記事ゼロのブランチ（既存記事のメタ更新のみ想定）が既存記事に対して無条件に \`changed = true\` を立てており、フィールド値に差分がなくても 30 分毎の cron 実行ごとに R2 PUT が発生していた（全フィード分の無駄な書き込み課金）。純関数ヘルパ \`isArticleMutated(ex, incoming)\` を新設し、\`createdAt\` を除く全フィールド（配列は JSON.stringify で比較）に差分がある場合だけ \`existingMap\` を更新して \`changed\` を立てるように変更。\`e2e/shared-feed-merge.spec.ts\` に 11 ケース（title/summary/content 差分、createdAt 無視、categories 順序違い、metadata 差分、publishedAt null→値、ogImage/author 差分）を追加。
- **ログインフローの \`X-Internal-Secret\` 対応と Cloudflare WAF ブロック検知を追加** — Issue #94。0g0-id の issue #156 改善案1（BFF 個別シークレット対応）で \`serviceBindingMiddleware\` が \`INTERNAL_SERVICE_SECRET_USER\` / \`_ADMIN\` / 共有 \`INTERNAL_SERVICE_SECRET\` による \`X-Internal-Secret\` 認証を受け付けるようになったのに合わせて、\`src/lib/auth.ts\` の \`authApiHeaders()\` に \`INTERNAL_SERVICE_SECRET\` 環境変数のサポートを追加（設定時のみ \`X-Internal-Secret\` ヘッダーを付与し、未設定なら従来通り Basic 認証のみで通す）。加えて Cloudflare WAF / Bot Fight Mode による 403 HTML challenge ページ (\`Attention Required! | Cloudflare\`) を検出する \`isCloudflareBlock()\` を新設し、\`exchangeCode()\` ではブロック時に運用者向けヒント付きログを出力、\`refreshTokens()\` では 403 + Cloudflare HTML を \`invalid\` ではなく \`transient\` 扱いに変更してユーザーを意図せずログアウトさせないようにした。\`exchangeCode\` / \`refreshTokens\` のレスポンスログに \`cf-ray\` ヘッダーも出力しトラブルシューティングを容易化。\`e2e/auth-headers.spec.ts\` に 10 ケース（\`isCloudflareBlock\` 判定 5 ケース、\`X-Internal-Secret\` 送出制御 2 ケース、exchange/refresh での Cloudflare 応答処理 3 ケース）を追加。

### メモっといた

- **feed-groups API エンドポイントを README / architecture.md に追記** — Issue #104。実装済みの \`app/api/feed-groups/\` ルートがドキュメント化されていなかったため、\`README.md\` に「フィードグループ」セクション（\`GET/POST /api/feed-groups\` と \`PATCH/DELETE /api/feed-groups/:id\` の仕様表、レスポンス型 \`FeedGroup\`、POST 時の order 自動採番、グループ上限 100 件 / 名前 50 文字 / ユーザー内重複不可の制約、DELETE 時の orphan 許容設計）と API エラーレスポンス一覧にフィードグループのエラーコード表（\`INVALID_NAME\` / \`DUPLICATE_NAME\` / \`FEED_GROUP_LIMIT_EXCEEDED\` / \`FEED_GROUP_NOT_FOUND\` / \`INVALID_ORDER\` / \`INVALID_COLLAPSED\` / \`INVALID_MUTED\`）を追加。\`.claude/rules/architecture.md\` には全体像の API マップに \`/api/feed-groups/*\` を追記し、ディレクトリ構造に \`app/api/feed-groups/\` と \`src/lib/feed-groups.ts\` を記載、hooks 一覧に \`useFeedGroups.ts\` を追加、「フィードグループ操作」のデータフローサブセクションを新設、R2 データ構造に \`users/{userId}/feed-groups.json\` を追記した。
- **DBSC 導入調査レポートを追加** — Issue #77 の調査タスクとして \`docs/research/dbsc-investigation.md\` を新規作成。Chrome 146 (2026-04-09) で Windows 向け DBSC が本格有効化された最新状況、W3C Editor's Draft (2026-04-17) の仕様サマリー、現状の認証実装 (\`src/lib/server-auth.ts\` の \`setTokenCookies()\` / \`COOKIE_OPTS\` — HttpOnly+Secure+SameSite=Lax, access_token 900 秒 / refresh_token 30 日) との整合性、DBSC 適用時に必要な改修箇所（認証サーバー \`id.0g0.xyz\` 側が主実装、本リポジトリは passthrough のみ）、Firefox/Safari/Chrome macOS・Linux 未対応のカバレッジ不足を整理。結論として「現時点では待ちが妥当」とし、Chrome macOS/Linux が stable 到達するタイミング (推定 2026 年後半〜2027 年) での再評価を推奨。

### 激アツ新機能っ

- **フィードのドラッグ&ドロップでグループから外す操作を追加** — Issue #67 の残タスク「ドラッグ&ドロップでグループ移動」を完了。既存のグループへのドラッグ&ドロップ（追加／別グループへ移動）に加えて、グループ所属フィードをドラッグしたときだけ「グループから外す」ドロップゾーンが破線枠で現れるようにした。\`src/lib/feed-group-drop.ts\` を新規作成して \`resolveFeedGroupDrop(feedId, targetGroupId, feeds)\` 純関数を切り出し、feed 不在／同一グループ／同一 ungrouped の場合に no-op 判定を行う。\`FeedSidebar\` の \`handleDropFeedOnGroup\` を \`groupId: string | null\` 対応に変更し、\`FeedGroupsSection\` の \`onGroupDrop\` prop 型も \`string | null\` に拡張。\`e2e/feed-group-drop.spec.ts\` に 6 ケース（feed 不在 / 同一グループ / ungrouped→ungrouped / グループ間移動 / グループ→ungrouped / ungrouped→グループ）を追加。

### バグ絶対キルした

- **記事詳細の画像が中途半端なサイズ・アスペクト比崩れで表示される問題を修正** — Issue #86。\`src/lib/content.ts\` の \`fixImageDimensions\` が元 HTML の \`width\` / \`height\` 属性を無条件に削除しており、ブラウザが aspect-ratio を推論できずに画像読み込み中の layout shift やアスペクト比崩れ・中途半端な表示サイズが発生していた。width/height 両方が数値かつ両方 ≥ 16px (favicon 最小サイズ基準) の場合は属性を保持しブラウザに \`aspect-ratio: attr(width) / attr(height)\` 相当を自動適用させるよう変更（ダミー 1x1 プレースホルダや片方のみの属性は従来どおり削除）。style 内の固定 \`width:\` / \`height:\` は引き続き削除してコンテナからの溢れを防ぐ。併せて \`app/globals.css\` の \`.article-content img\` から \`width: auto !important\` を削除し \`height: auto !important\` を \`height: auto\` (非 important) に変更。これで HTML 属性の width/height が CSS で打ち消されず、ブラウザが aspect-ratio を推論できるようになる。コンテナ超過時は従来通り \`max-width: 100% !important\` で縮小し \`height: auto\` で高さも比例縮小する。\`e2e/content-extraction.spec.ts\` の \`fixImageDimensions\` describe に 4 ケース（意味のある属性保持・ダミー削除・片方のみ削除・style 内固定値削除）を追加。

### ガード固めたっ

- **CSRF 対策として Origin/Referer 検証を \`withSession\` に追加** — Issue #101。0g0 ID の HttpOnly JWT cookie は \`SameSite=Lax\` で保護されていたが、Lax は top-level navigation で cookie を送出するため \`<form method=POST>\` による CSRF を完全には防げなかった。\`src/lib/csrf.ts\` に純粋関数 \`isCsrfViolation(req, appBaseUrl)\` を新設し、\`src/lib/server-auth.ts\` の \`withSession\` / \`withBinarySession\` が POST/PUT/PATCH/DELETE リクエスト時に Origin または Referer の origin が \`APP_BASE_URL\` と一致することを検証するよう変更。不一致時は \`403 { code: "CSRF_ORIGIN_MISMATCH" }\` で拒否する。設計上の決定: (1) Origin ヘッダーがある場合は Origin のみで判定し Referer にフォールバックしない（\`Origin: null\` + 正規 Referer による bypass を防ぐ）、(2) \`APP_BASE_URL\` 未設定時は fail-closed で違反扱い（本番での silently disable を防ぐ）、(3) GET/HEAD/OPTIONS は safe method として検証対象外。\`withSession\` のシグネチャが \`(req, handler)\` に変更されたため、全 31 個の Route Handler (\`app/api/**/route.ts\`) の呼び出し箇所を更新し Request オブジェクトを第一引数で渡すよう修正。\`e2e/csrf-origin.spec.ts\` に 49 ケース（安全/更新系メソッド別の一致/不一致/欠落/null origin/bypass 試行・fail-closed 検証・scheme/port/subdomain 境界条件）を追加。\`e2e/api-health.spec.ts\` にも別オリジンからの POST が 403 で弾かれる統合テストを追加。テスト時の localhost:3000 向け APP_BASE_URL 上書きは \`playwright.config.ts\` の \`webServer.env\` で設定。
- **JWT 検証に \`aud\` / \`iss\` クレームチェックを追加** — Issue #100。\`src/lib/auth.ts\` の \`verifyJwt\` が従来は署名と \`exp\` のみ検証しており、\`aud\` (audience) / \`iss\` (issuer) クレームを確認していなかったため、同じ 0g0 ID の別オーディエンス／別イシュアー向けトークンを取得した攻撃者が \`rss.0g0.xyz\` で再利用できる可能性があった。ペイロード検証ステップに \`payload.iss === authBaseUrl\` の厳密一致チェックと、\`payload.aud\` が \`process.env.CLIENT_ID\` を含むこと（文字列/配列両対応）のチェックを追加。JWKS 取得より前に実行することで、不正トークンは早期に弾かれネットワークコストも削減できる。\`JWTPayload\` インターフェースに \`iss?: string\` / \`aud?: string | string[]\` を追加。\`e2e/jwt-aud-iss.spec.ts\` に 7 ケース（iss 欠落 / iss 不一致 / aud 欠落 / aud 不一致 文字列 / aud 配列に含まれない / CLIENT_ID 未設定 / exp 期限切れ回帰 / シェイプ不正）を追加。
- **vite-plus path traversal 脆弱性を修正** — Dependabot alert #28 (severity: high, \`vite-plus/binding\` の \`downloadPackageManager()\` が \`VP_HOME\` 外にファイルを書き出せる path traversal 脆弱性) を解消。\`package.json\` は既に \`^0.1.18\` に更新済みだったが \`package-lock.json\` の解決バージョンが 0.1.14 のままだったため、\`npm install\` で lock ファイルを更新し \`vite-plus\` / \`@voidzero-dev/vite-plus-core\` など関連パッケージをすべて 0.1.18 に揃えた。

### コードめかし込み

- **Cloudflare Cache API の重複パターンを \`src/lib/cache-helper.ts\` に集約** — Issue #95。\`app/api/content/route.ts\` / \`app/api/image-proxy/route.ts\` / \`app/api/ogp/route.ts\` の 3 ルートで手書きされていた \`caches.default.match(cacheKey)\` と \`new Response(JSON.stringify(...), { headers: ... })\` のパターンを共通ヘルパーに統一した。新規モジュール \`src/lib/cache-helper.ts\` に \`buildCacheKey\` / \`cachePutAsync\`（旧 \`src/lib/r2.ts\` から移設）/ \`matchCfCache\`（HIT → Response / MISS → null に正規化）/ \`buildJsonCacheResponse\`（Content-Type + Cache-Control を付与した JSON キャッシュエントリ Response 構築）を配置。\`r2.ts\` は R2 永続ストア専用に責務を絞り、Cache API 関連 export を削除した（\`.claude/rules/caching.md\` の方針どおり）。\`src/lib/fetch-article-content.ts\` と 3 ルートの import を \`@/lib/r2\` から \`@/lib/cache-helper\` に差し替え、\`saveContentToCache\` / ogp route の Response 構築も \`buildJsonCacheResponse\` 経由に置換。\`e2e/cache-helper.spec.ts\` に 6 ケース（\`buildCacheKey\` の \`/__cache/{type}/{hash}\` 形式 / type ごとの名前空間分離 / 決定論、\`buildJsonCacheResponse\` のヘッダー設定 / JSON シリアライズ / 可変 TTL）を追加。\`.claude/rules/caching.md\` のサンプルコードも新ヘルパー利用版に更新した。
- **画像抽出ロジックを専用モジュール \`src/lib/image-extractor.ts\` へ集約** — Issue #108。\`src/lib/article-utils.ts\` 内の \`bestSrcFromSrcset\` / \`isCollectableUrl\` / \`collectImageUrlsFromHtml\` / \`collectImageUrls\` は記事画像抽出に特化した責務で、主要呼び出し元は \`src/components/ArticleView.tsx\` と \`src/hooks/useImageDownload.ts\` の 2 箇所に限られていた。\`article-utils.ts\` の責務を日本語判定・読了時間・日付比較・UI サイクル定数などの記事メタ系に絞るため、画像抽出系 4 関数を新モジュール \`src/lib/image-extractor.ts\` に移設し、\`article-utils.ts\` からは export を削除。呼び出し元 2 ファイルは \`import { collectImageUrls(FromHtml) } from "../lib/image-extractor"\` に差し替え。動作ロジックは変更なし（純粋リファクタ）。

## 2026-04-18

### ガード固めたっ

- **code-scanning alert 残存 1 件を修正** — \`src/lib/content.ts\` の \`detectNextPageUrl\` 内 \`<a>\` タグ内テキスト抽出（\`m[2].replace(/<[^>]+>/g, "").trim()\`）が CodeQL の \`js/incomplete-multi-character-sanitization\` (severity: high) に残存していた不具合を修正（Issue #78 追従）。既存ヘルパ \`replaceUntilStable\` を用いて不動点反復に置き換え、\`<<a>a>\` のような再結合バイパス入力でもタグ片が正しく除去されるようにした。この \`text\` は数字リテラルとの \`===\` 比較にしか使われず直接の XSS 経路ではないが、ファイル内の他のタグ除去処理と同じパターンに揃えた。

- **code-scanning alerts を一括修正** — GitHub Advanced Security の CodeQL スキャンで検出された 19 件の警告を修正（Issue #78）。\`js/incomplete-multi-character-sanitization\` / \`js/bad-tag-filter\` / \`js/incomplete-url-scheme-check\` / \`js/incomplete-sanitization\` / \`js/incomplete-url-substring-sanitization\` / \`actions/missing-workflow-permissions\` を網羅的に対応した。\`src/lib/html.ts\` の \`sanitizeHtml\` を不動点反復（最大 8 パス）に変更し \`<scr<script></script>ipt>\` のようなネスト再出現バイパスを潰した。すべての閉じタグ正規表現を \`<\\/tag\\s*>\` から \`<\\/tag\\b[^>]*>\` に変更し HTML5 仕様どおり \`</script foo>\` や \`</script\\t\\n bar>\` のような属性付き閉じタグも受容するようにした。\`src/lib/content.ts\` に \`replaceUntilStable\` ヘルパを追加して \`preClean\` / \`stripPageChrome\` / \`isContentSufficient\` / 画像スライダー判定を不動点反復化し、\`resolveScriptLoadedImages\` の script end tag 正規表現も修正した。\`resolveRelativeUrl\` および \`detectNextPageUrl\` / \`llm-feed-generator.ts\` の URL スキームチェックに \`vbscript:\` / \`mailto:\` / \`file:\` / \`data:\` を追加した。\`xml-parser.ts\` の JSON Feed バージョン検出を \`version.includes("jsonfeed.org")\` から URL パース + hostname 完全一致に変更し \`https://evil.example/?x=jsonfeed.org\` 形式のなりすましを遮断した。\`useKeyboardNav.ts\` / \`ShareMenu.tsx\` の Markdown ラベルエスケープを \`[[\\]]\` から \`[\\\\[\\]]\` に変更し、バックスラッシュのエスケープ漏れによる二重エスケープ崩れを修正した。\`.github/workflows/ci.yml\` に \`permissions: contents: read\` を追加し GITHUB_TOKEN 権限を最小化した。\`e2e/sanitize-html.spec.ts\` に閉じタグ属性バイパスとネスト再出現バイパスの回帰テストを 5 ケース追加した。

### バグ絶対キルした

- **Color Me Shop (shop-pro.jp) 商品ページで画像一覧が生成されない問題を修正** — 商品画像が \`<form>\` 配下の \`<div class="p-product-img__main-item">\` に格納されており、Readability が \`<form>\` 内を本文外と判定してギャラリーが完全に除去される不具合を修正（Issue #82）。\`src/lib/content.ts\` の \`extractThumbListImgs\` に Color Me Shop の BEM クラス (\`p-product-img__main-item\`) パターンを追加し、Readability の結果末尾に hidden div として商品画像を付与するようにした。クライアント側の画像一覧（ImageGallery）が DOM からこれらの画像を拾える。\`e2e/content-extraction.spec.ts\` に shop-pro.jp 相当の HTML で画像 3 枚が hidden div に追加されることを検証する 2 ケースを追加。

- **ログイン時のトークン交換失敗を修正（Cloudflare WAF bot 検知によるブロック）** — \`id.0g0.xyz\` の Cloudflare WAF / Bot Fight Mode が Worker-to-Worker fetch を bot 扱いして 403 (Attention Required) を返し、\`/auth/exchange\` が成功しない不具合を修正。\`src/lib/auth.ts\` に \`authApiHeaders()\` ヘルパを追加し、\`exchangeCode\` / \`refreshTokens\` / \`revokeToken\` すべての fetch に \`User-Agent: rss-reader-bff/1.0 (+https://rss.0g0.xyz)\` と \`X-BFF-Origin: https://rss.0g0.xyz\` を付与して BFF として正しく識別されるようにした。以前は \`Content-Type\` と \`Authorization: Basic\` のみで無名の fetch に見えていた。

- **認証エラー時の診断情報を改善** — \`exchangeCode\` / \`/api/auth/callback\` で認証失敗時に \`console.error\` で詳細（HTTP ステータス・レスポンス本文先頭 500 byte・redirect_to）を出力。\`CLIENT_ID\` / \`CLIENT_SECRET\` が未設定の場合は専用メッセージでログする。エラー画面もトップページへの戻りリンクを含む構造化 HTML に変更。Cloudflare Workers 側の原因切り分け（secrets 未設定 / redirect_uri 不一致 / code 再利用 / 上流 5xx）を容易にする。

- **認証コールバックのエラーメッセージが文字化けする問題を修正** — \`/api/auth/callback\` が state 不一致・トークン交換失敗・トークン検証失敗時に返す HTML の \`Content-Type\` に charset が付いていなかったため、ブラウザが Shift_JIS 等で解釈して「認証エラー: トークン交換失敗」が「隱崎ｨｼ繧ｨ繝ｩ繝ｼ: 繝医�繧ｯ繝ｳ莠､謠帛､ｱ謨�」のように文字化けする不具合を修正。\`Content-Type\` を \`text/html; charset=utf-8\` に変更し、レスポンス本文冒頭に \`<!doctype html><meta charset="utf-8">\` を追加。

### 激アツ新機能っ

- **ユーザー設定モーダル** — サイドバーフッターにギアアイコンを追加し、フォントサイズ／フォント／行間／コンテンツ幅／両端揃え／自動既読（閾値 70-90%）を 1 画面で変更できるダイアログを追加（Issue #79）。変更はプレビュー領域にリアルタイム反映され \`localStorage\` に即時永続化される。\`src/components/UserSettingsModal.tsx\` を新規追加し、\`ReaderSettingsContext\` に \`lineHeight\` / \`contentWidth\` / \`textJustify\` / \`onChangeAutoReadThreshold\` を追加して ArticleView のローカル state を \`useUIState\` に集約。これに伴い記事詳細ヘッダー右側にあった表示設定の個別トグルボタン群（フォントサイズ A／フォントファミリー ゴ・明・等／行間／幅／均等／自動既読）を削除しツールバーをスッキリさせた — 設定変更はすべてユーザー設定モーダルに集約される。

### バグ絶対キルした

- **ページングされた記事の 2 ページ目以降を取得できない問題を修正** — \`rel="next"\` を持たず \`<a href=".../2">2</a>\` のような数字テキストリンクだけでページングするサイト (denfaminicogamer 等) で、2 ページ目以降の本文が全文取得に含まれない不具合を修正（Issue #87）。\`src/lib/content.ts\` の \`isPaginatedVariant\` に判定ルール 3 を追加し、bare numeric suffix (\`/slug\` → \`/slug/2\`) パターンを検出するようにした。\`/post/123\` → \`/post/124\` のような連番記事 ID や \`/2025/01\` → \`/2025/02\` のような日付アーカイブとの誤検知を防ぐため、base 最終セグメントが「記事 slug らしい」(数字含む or ハイフン/アンダースコア含む or 8 文字以上 かつ 純数字でない) 場合のみ許容する \`lastPathSegmentLooksLikeSlug\` ヘルパーを追加。\`detectNextPageUrl\` には \`rel="next"\` 不在時のフォールバックを追加し、URL から現在ページ番号を推定（新規 \`detectCurrentPageNumber\`）したうえで、テキストが「currentPage + 1」と完全一致する \`<a>\` タグの href を \`isPaginatedVariant\` で検証して採用する。\`e2e/content-extraction.spec.ts\` の \`detectNextPageUrl\` describe に denfaminicogamer 相当 / ページ 2→3 / 連番 ID 誤検知なし / 別記事除外 / 本文中数字リンク除外 / 日付アーカイブ誤検知なし の 6 ケースを追加。

### 激アツ新機能っ

- **コンテンツ幅に \`wide\` (900px) を追加** — 記事詳細の領域幅を広げても（フォーカスモード起動や 3 ペイン境界のリサイズ時）本文の \`maxWidth\` が \`narrow:640px\` / \`medium:720px\` / \`full:none\` の 3 段階しかなく、\`medium\` から \`full\` へ飛ぶと急激に全幅まで広がってしまい中間帯を選びづらい問題を解消（Issue #80）。\`src/lib/reader-settings.ts\` の \`ContentWidth\` に \`wide\` を追加し、サイクル順を \`narrow → medium → wide → full → narrow\` に拡張。ラベル表示（ArticleView の幅トグルボタン）も \`900\` に対応。\`e2e/reader-settings.spec.ts\` の \`CONTENT_WIDTH_CYCLE\` 長さアサートを 3 → 4 に更新。

### バグ絶対キルした

- **Zenn 記事の埋め込み URL が消える問題を修正** — Zenn 本文中の \`<span class="zenn-embedded zenn-embedded-card|tweet|mermaid">\` が Readability に「本文外」と判定されて span ごと削除され、\`postProcess\` 内の \`transformZennLinkEmbeds\` / \`transformZennMermaidEmbeds\` が走る前に消えてしまう不具合を修正（Issue #88）。\`src/lib/content.ts\` の \`extractMainContent\` で \`extractWithReadability\` 実行前に Zenn 埋め込み変換を適用し、Readability 通過時には iframe を含まない \`<p><a>\` / \`<pre><code>\` 形式になっているため、本文判定ロジックが要素を保持するようになった。\`postProcess\` 側の同変換は冪等なため regex フォールバック経路の安全網として残している。\`e2e/content-extraction.spec.ts\` に Readability 経由でも card / tweet / mermaid 埋め込みが本文に保持されることを検証する 3 ケースを追加。

- **x.com / twitter.com の OGP を vxtwitter.com 経由で取得** — Twitter / X は bot 向けに OGP メタタグを返さないため、記事に該当 URL を含めても OGP プレビューが空になる不具合を修正（Issue #89）。\`src/lib/ogp.ts\` に \`normalizeOgpFetchUrl(url)\` を追加し、\`x.com\` / \`www.x.com\` / \`mobile.x.com\` / \`twitter.com\` / \`www.twitter.com\` / \`mobile.twitter.com\` を OGP 互換プロキシ \`vxtwitter.com\` に差し替えてから fetch する（hostname 完全一致で判定するため \`x.com.evil.example\` のような偽装ホストは対象外）。\`fetchPageOgpMeta\` 経由の呼び出し（\`/api/ogp\` / \`/api/articles/save\`）すべてに適用。置換対象・不正入力・他ホスト素通りを検証する 12 ケースを \`e2e/ogp-url-normalize.spec.ts\` に追加。

- **コードハイライトが一瞬で外れる問題を修正** — \`<pre><code>\` に highlight.js で付与された \`.hljs\` class が、React の \`dangerouslySetInnerHTML\` 再代入や他の副作用 hook（\`useContentLinkPreviews\` 等）による DOM 書き換えで剥がれ、色付けが一瞬で消えてしまう不具合を修正（Issue #83）。\`src/components/ArticleView.tsx\` の \`processedContent\` を \`useMemo\` でメモ化し、\`rawContent / embedInfo / theme\` が変わらない限り同一文字列を返すようにして不要な innerHTML 再代入を抑止。さらに \`src/hooks/useSyntaxHighlight.ts\` に \`MutationObserver\` を追加し、コンテナ subtree 変更時は \`pre code:not(.hljs)\` を自動で再ハイライトするようにした。\`hljs.highlightElement\` 自身の mutation によるループを避けるため、適用時は observer を \`disconnect → applyMissing → observe\` でサンドイッチし、大量の DOM 変更時は \`queueMicrotask\` でバッチ化する。

- **幅調整バーのポップアップ対応漏れを追補** — Issue #81 の初版修正で拾えていなかった未ポートアル系のインラインモーダル（\`ArticleView\` の画像ダウンロード確認モーダル / \`ImageGallery\` の全画面ライトボックス / \`SelectionExcludePopup\`）にも \`usePopupLock\` を追加。さらに \`e2e/modal-popup-lock-coverage.spec.ts\` に静的検査テストを追加し、\`fixed inset-0 z-5*\` のフルスクリーンオーバーレイを持つコンポーネントは \`usePopupLock\` / \`usePortalMenu\` のいずれかを呼ぶことを CI で強制することで、今後のモーダル追加時の漏れを防ぐ（Issue #81 再発防止）。

- **幅調整バーがポップアップ表示中も操作できる問題を修正** — 記事一覧 / フィード一覧 / 記事詳細の 3 ペイン境界にある幅調整バーが、モーダル・ドロップダウン表示中も pointer イベントを受けてドラッグできてしまい、オーバーレイより手前に見えてしまう不具合を修正（Issue #81）。\`src/lib/popup-lock.ts\` にグローバルなポップアップ表示数カウンタを追加し、\`src/hooks/usePopupLock.ts\`（\`usePopupLock(active?)\` / \`useHasOpenPopup()\`）を経由して登録・購読できるようにした。\`Modal\`（\`FeedDetailModal\` / \`FeedFilterModal\` / \`KeyboardShortcutsModal\` / \`ReadingStatsModal\` / \`ReleaseNotesModal\` / \`SnoozeModal\` が共通利用）、\`FeedQuickSwitchModal\`、\`usePortalMenu\`（\`FilterMenu\` / \`GlobalFilterMenu\` / \`ShareMenu\` / \`SnoozeMenu\` など）、および \`FeedItem\` のコンテキスト／ミュート／グループ移動メニューが表示中はロックを立てる。\`App.tsx\` のリサイズハンドルは \`useHasOpenPopup()\` を監視し、\`z-[5]\`（従来 \`z-20\`）へ引き下げたうえで表示中は \`pointer-events-none\` + \`opacity-0\` + \`aria-hidden\` を付与して操作不可にする。\`e2e/popup-lock.spec.ts\` にカウンタ増減・冪等性・通知購読の 6 ケースを追加。

### 激アツ新機能っ

- **フィードグループ化 Step 6 — ドラッグ&ドロップでグループ移動** — \`FeedItem\` の最外 \`<div>\` に \`draggable\` + \`onDragStart\`（\`dataTransfer\` に \`application/x-rss-feed-id\` でフィードIDを格納）/ \`onDragEnd\` を実装。\`FeedSidebar\` 本体に \`draggedFeedId\` / \`dragOverGroupId\` ステートを持たせ、\`FeedGroupsSection\` のグループ行ラッパー \`<div>\` に \`onDragOver\`（\`preventDefault\` + \`dropEffect="move"\`）/ \`onDragLeave\`（\`relatedTarget\` の \`contains\` チェックで子要素へのバブルを無視）/ \`onDrop\`（\`feedId\` を取り出して既存 \`onSetGroupFeed(feed, group.id)\` にルーティング）を追加。ドロップ先は \`ring-2 ring-inset ring-text-muted\` でハイライト、ドラッグ中のフィード行は \`opacity-40\` で視覚化。同じグループに属するフィードのドロップは早期リターンで API 呼び出しをスキップ。新 API は追加せず既存 \`PATCH /api/feeds/:id\`（\`groupId\`）を流用。編集中（タイトル・カテゴリ）はドラッグを抑止。キーボード/タッチ操作は既存の \`FeedItem\` コンテキストメニュー「グループに移動」がフォールバックとして引き続き利用可能（Issue #67 Step 6）。

- **依存関係更新の自動化** — Dependabot 設定 (\`.github/dependabot.yml\`) にエコシステム別のグルーピング（typescript / cloudflare / nextjs / tailwind / testing / build / content-libs）と日本語コミットプレフィックスを追加し、毎週月曜 09:00 JST に集約された PR が起票されるようにした。CI ワークフロー (\`.github/workflows/ci.yml\`) で master push と PR 時に \`pnpm install --frozen-lockfile\` → \`pnpm run check\` → \`pnpm run typecheck\` を実行。Dependabot auto-merge ワークフロー (\`.github/workflows/dependabot-auto-merge.yml\`) は patch / minor を CI 通過後に自動 squash マージし、major はコメントのみで人手レビューを必須にする。GitHub Actions 自体も同 Dependabot 設定で更新対象に含める。

- **認証不要のデモページ \`/demo\` を追加** — 0g0 ID ログイン必須だったためデザイン／動作確認に毎回ログインが必要だった問題を解消。\`/demo\` にアクセスすると fetch インターセプターが \`/api/*\` をすべてモックレスポンス（固定のユーザー・フィード・記事・グループ・読み取り状態）に差し替えた状態で本物の \`App\` コンポーネントを描画する。デモ用に追加した実装ファイルは \`app/demo/page.tsx\` / \`app/demo/DemoApp.tsx\` / \`app/demo/mock.ts\` のみ — アプリ本体には一切の条件分岐を入れていないため、デモモードが本番描画ロジックに影響しない。\`window.fetch\` の置き換えは HMR / ページ再読み込みに耐えるよう \`globalThis.__demoFetchOriginal\` に native fetch を一度だけ保存、インターセプター内で \`window.location.pathname.startsWith("/demo")\` を毎回確認し、クライアントサイドナビゲーションで他パスに出た瞬間からは本物の API レスポンスを通す設計。\`.playwright-mcp/\` / \`demo-*.png\` を \`.gitignore\` に追加。

### バグ絶対キルした

- **サイドバーのヘッダー要素見切れを修正** — PC 表示時に「ブックマーク」「後で読む」「いいね」等の特殊ビュー行がラベル長 / スクロールバー出現時に見切れて機能として使えなくなる問題を修正。\`SpecialViewButton\` のラベル span に \`truncate min-w-0\`、カウント span に \`flex-shrink-0\` を付与し、\`justify-between\` と組み合わせても確実にカウントが末尾に残るようにした（\`gap-2\` も追加）。「すべて」行も同様の構成に揃え、ラベル側を優先して縮める挙動に統一。\`nav\` コンテナに \`overflow-x-hidden\` を追加し、子要素の意図せぬ横オーバーフローを抑止。

### 激アツ新機能っ

- **フィードグループ化 Step 5 — グループ選択 & 未読フィルタ統合** — サイドバーのグループ名をクリックすると、そのグループに所属するフィードの記事のみが記事一覧に表示される。既存の \`u\`（未読のみ）キーショートカットと組み合わせることで「現在選択中のグループの未読だけ」を表示できるようになる。\`src/lib/article-filter.ts\` の \`ArticleFilterOptions\` に \`groupFeedIds?: Set<string>\` を追加し、\`buildFeedPredicate\` を拡張（feedId が未指定でグループが選択されていれば \`feedHash ∈ groupFeedIds\` のみ残す）、\`buildMutedFeedPredicate\` はグループ選択時も適用をスキップ（ミュート済みグループを明示的に選択した場合は記事を表示する）。\`src/hooks/useFilteredArticles.ts\` は \`groupFeedIds\` を受け取り \`filterAndSortArticles\` に渡す — グループ切り替え時はページ・検索クエリ・著者／カテゴリフィルターをリセット。\`App.tsx\` は \`selectedGroupId\` state を追加（URL クエリ \`?group=<id>\` に同期）し、選択中グループの \`groupFeedIds\` を \`useMemo\` で事前計算。\`onSelectFeed\` / \`onSelectGroup\` は相互排他（片方を選ぶと他方はクリア）、記事リストの「すべて既読」はグループ選択中は \`markBulkRead(groupIds)\` にルーティング。\`FeedSidebar\` のグループ行は折りたたみ用チェブロンとグループ名ボタンを分離し、グループ名クリックで選択／再クリックで解除、\`aria-pressed\` 反映。削除済みグループが選択中の場合は自動で解除する（Issue #67 Step 5）。
- **フィードグループ化 Step 4 — グループ単位ミュート機能** — グループを「ミュート」することで、そのグループに所属するフィードの記事を「すべての記事」ビューから除外できるように拡張。\`src/types.ts\` の \`FeedGroup\` に \`muted?: boolean\` を追加し、\`PATCH /api/feed-groups/:id\` に \`muted\` バリデーションブロックを追加（既存の \`collapsed\` と同じ boolean チェックパターン）。クライアントは \`useFeedGroups\` に \`setMuted(id, muted)\` を追加 — \`setCollapsed\` と同一の楽観的更新＋失敗時ロールバックパターンで実装。\`App.tsx\` の \`mutedFeedIds\` useMemo を拡張し、既存の \`f.mutedUntil\` ベースのフィード単位ミュートに加えて \`muted\` グループに所属するフィードの ID も同 \`Set\` に追加（deps に \`feedGroups\` を追加して stale closure を防止）。\`FeedSidebar\` のグループ行アクションには hover 時に現れる「ミュート」ボタン（音量付きスピーカーアイコン）と、ミュート中は常時表示される「ミュート解除」ボタン（斜線付きスピーカーアイコン）を追加。ミュート中はグループ名を \`text-faint italic\` で視覚的に識別できるようにした。記事フィルタリング側のロジック変更は不要 — 既存 \`buildMutedFeedPredicate\` が \`mutedFeedIds\` をそのまま解釈するため、\`feedId === null\`（すべての記事ビュー）でのみ自動的にミュート対象が除外される挙動となる（個別フィード選択時は従来どおり表示される）。新 API は追加せず既存 \`PATCH /api/feed-groups/:id\` を流用（Issue #67 Step 4）。

- **フィードグループ化 Step 3 — グループ内一括既読化 & 並び替え UI** — 各グループ行の hover アクションに「グループ内一括既読化」（✓ アイコン）と「上へ / 下へ移動」（▲ / ▼ アイコン）を追加。一括既読化は \`App.tsx\` でグループ所属 feedId を \`Set\` に詰めて \`articles\` を 1 パスで集約し、既存 \`markBulkRead(ids)\` を 1 回だけ呼ぶ実装（per-feed の \`markAllRead\` ループによる O(N×M) スキャンを回避）。並び替えは \`useFeedGroups\` に \`reorderGroup(id, direction)\` を追加し、隣接グループと order を楽観的にスワップしたうえで既存 \`PATCH /api/feed-groups/:id\`（order）を 2 本順次送信。失敗時は \`/api/feed-groups\` を再 fetch して真の状態に戻す（片側のみ成功した不整合ケースに対応）。新 API は追加していない（読み取り側は既存 \`/api/read-state\` のデバウンス書き込み、並び替えは既存 PATCH を流用）。一括既読化ボタンは \`groupUnread > 0\` のときのみ、移動ボタンは先頭・末尾では非表示。アクション群は \`group-hover\` に加え \`group-focus-within\` でも表示してキーボードアクセスに対応（Issue #67 Step 3）。

- **フィードグループ化 Step 2 — サイドバー UI 統合** — Step 1 で導入したバックエンド API に対応するクライアント側の UI を実装。\`src/hooks/useFeedGroups.ts\` を新設しログイン後に \`GET /api/feed-groups\` を取得、\`POST / PATCH / DELETE\` を薄くラップして作成・名前変更・折りたたみ保存（楽観的更新＋失敗時ロールバック）・削除を提供。\`FeedSidebar\` にユーザーグループ専用セクションを追加 — セクションヘッダーに「+」ボタンで新規作成、各グループ行は折りたたみトグル（サーバー側 \`collapsed\` に永続化）・ホバー時に現れる名前変更／削除アイコンを持ち、折りたたみ時は未読数 or フィード数を右端に表示。フィード側は \`FeedItem\` のコンテキストメニューに「グループに移動」項目を追加し、ポータル表示のサブメニューで既存グループ一覧＋「グループなし」から選択可能（現在所属にはドット表示）。\`groupId\` が有効なグループを指すフィードはグループセクションに並び、それ以外は従来のカテゴリ／未分類レイアウトに流れる（orphan \`groupId\` は無害に無視）。E2E（\`e2e/api-health.spec.ts\`）に \`PATCH / DELETE /api/feed-groups/:id\` の未認証 401 ガードを追加（Issue #67 Step 2）。
- **フィードグループ化 Step 1 — データモデル & バックエンド API** — 複数フィードをユーザー定義のグループ（例: \`My Tech Blogs\` / \`News\`）にまとめるための基盤を導入。\`src/types.ts\` に \`FeedGroup\` 型（\`id\` / \`name\` / \`order\` / \`collapsed?\` / \`createdAt\`）を追加し、\`UserSubscription\` / \`Feed\` / \`FeedPatchPayload\` に \`groupId?: string\` を追加。R2 ストレージは \`users/{userId}/feed-groups.json\` を新設し、ヘルパー (\`src/lib/feed-groups.ts\`: \`readFeedGroups\` / \`writeFeedGroups\` / \`feedGroupsKey\` + 定数 \`MAX_FEED_GROUPS_PER_USER=100\` / \`FEED_GROUP_NAME_MAX_LENGTH=50\`) を追加。API エンドポイントは 4 本を新設 — \`GET /api/feed-groups\`（order 昇順で一覧）、\`POST /api/feed-groups\`（name 重複チェック・100件上限・\`crypto.randomUUID\` で ID 生成・201 返却）、\`PATCH /api/feed-groups/:id\`（name / order / collapsed を部分更新・重複チェック・order は整数のみ）、\`DELETE /api/feed-groups/:id\`（先にグループを削除してから所属購読の groupId をクリア → orphan 寄りの失敗モードに倒すことで復旧容易）。既存 \`PATCH /api/feeds/:id\` にも \`groupId\` 受付を追加（null でクリア、文字列なら実在グループ ID の存在チェック）。UI 統合は Step 2 で別途対応。E2E（\`e2e/api-health.spec.ts\`）に未認証時 401 ガードを追加（Issue #67 Step 1）。

### コードめかし込み

- **ArticleView コンポーネントの責務分離（Step 3: カスタム hook 分離）** — \`src/components/ArticleView.tsx\` 内に散在していた副作用ロジックを 6 つのカスタム hook に抽出し、本体を 1556 → 1368 行（-188 行）に縮小。追加した hook: \`useArticleNote\`（メモ編集ステート）/ \`useArticleAiRatings\`（AI 評価ボタン状態＋原文/翻訳タブ切替）/ \`useArticleHighlight\`（検索クエリ DOM ハイライトの注入・クリーンアップ）/ \`useSyntaxHighlight\`（highlight.js 遅延適用）/ \`useMathRender\`（KaTeX 遅延レンダリング）/ \`useSliderGallery\`（画像スライダーへの prev/next ボタン＋ホイール横スクロール注入）。各 hook は元実装と同じ deps ・依存関係を保ち、挙動変更なし（Issue #65 Step 3）。
- **ArticleView コンポーネントの責務分離（Step 2: Props の Context 集約）** — \`ArticleView\` が受け取っていた表示設定系 Props 11 個（\`fontSize\` / \`onChangeFontSize\` / \`fontFamily\` / \`onChangeFontFamily\` / \`theme\` / \`focusMode\` / \`onToggleFocusMode\` / \`autoReadEnabled\` / \`autoReadThreshold\` / \`onToggleAutoRead\` / \`onCycleAutoReadThreshold\`）を \`src/contexts/ReaderSettingsContext.tsx\` に集約。\`App.tsx\` で \`ReaderSettingsProvider\` を \`useMemo\` 値で供給し、\`ArticleView\` 内では \`useReaderSettings()\` で取得するよう変更。Props interface は 42 → 31 項目に縮小。\`App.tsx\` 側の \`<ArticleView ...>\` 呼び出しも 11 行削減。挙動変更なし（Issue #65 Step 2）。
- **ArticleView コンポーネントの責務分離（Step 1: ファイル分割）** — 2851 行に肥大化していた \`src/components/ArticleView.tsx\` から、内部定義されていたサブコンポーネント・hook・定数を \`src/components/article-view/\` 配下に切り出した。抽出したもの: \`EmptyArticleView\` / \`ShareMenu\` (+ \`SHARE_WINDOW_TARGETS\`) / \`ToggleIconButton\` / \`FetchFullContentArea\` / \`ArticleNavigation\` / \`FilterMenu\` / \`GlobalFilterMenu\` / \`ImageGallery\` / \`SnoozeMenu\` (+ \`SNOOZE_OPTIONS\`) / \`SelectionExcludePopup\` (+ \`useSelectionExclude\`, \`SelectionPopupState\`, \`MAX_SELECTION_LENGTH\`)、共通ユーティリティは \`constants.ts\` (\`MENU_ITEM_CLS\`) / \`icons.tsx\` (\`DownloadIcon\`, \`ExternalLinkIcon\`, \`ChevronSmall\`, \`XIcon\`) / \`filter-shared.tsx\` (\`buildExcludeOptions\`, \`useFilterMenuState\`, \`ExcludeOptionsSection\`, \`metaLabel\`)。本体は 2851 → 1577 行（-45%）に縮小し、個別テストや段階的 Props 削減が可能な土台に整えた。挙動変更なし（Issue #65 Step 1）。

### メモっといた

- **キーボードショートカット一覧ドキュメントを追加** — \`docs/keyboard-shortcuts.md\` を新規作成し、全ショートカット（約 40 キー）をカテゴリ別（記事ナビゲーション／記事操作／フィルター・表示切替／検索・フィード操作／モーダル・グローバル）に一覧化。発動条件、モーダル内専用キー、実装箇所リファレンスを整理。\`README.md\` の技術スタック直後に導線セクションを追加。Single source of truth は既存の \`src/config/shortcuts.ts\` で、\`KeyboardShortcutsModal\` と本ドキュメントが同一定義を参照する方針を明記（Issue #69）。

### バグ絶対キルした

- **上流認可サーバーの一時障害で意図せずログアウトされる問題を修正** — \`refreshTokens()\` が \`!res.ok\` を一律 \`null\` で返していたため、0g0 ID の 5xx 障害・ネットワーク断・タイムアウトでも \`/api/auth/me\` が refresh_token Cookie を削除してログアウト扱いになっていた。戻り値を判別可能 union \`RefreshResult = ok | invalid | transient\` に変更し、恒久失敗（4xx / invalid_grant）のみ Cookie 削除、一時失敗（5xx / ネットワークエラー / JSON パース失敗）は Cookie 保持で \`503\` を返すよう変更。\`useAuth\` の \`checkAuth\` も 503 を既存状態維持として扱い次回リフレッシュに委ねる。\`deduplicatedRefresh\` / \`getAuthSession\` も同 union に追従。ユニットテスト 12 件 (\`e2e/refresh-tokens.spec.ts\`) を追加。

### 激アツ新機能っ

- **AI 翻訳に「原文 / 翻訳」タブ切り替えを追加** — 従来は翻訳結果が本文の上に独立パネルで追加表示されていたが、Google 翻訳のように本文エリア内のタブで原文と翻訳を切り替えて読めるように変更。翻訳実行後は自動で「翻訳」タブに切り替わり、「原文」タブをクリックすれば元の記事本文に戻る。翻訳タブ時のみフィードバックボタン（👍 / 😐 / 👎）を表示。記事を切り替えた際はタブが「原文」にリセットされる。\`contentTab\` state と \`translateResult\` への自動切替 \`useEffect\` で実装。

### バグ絶対キルした

- **cron フィード取得エラーログで Error オブジェクトが \`{}\` になる問題を修正** — \`src/cron/fetch.ts\` の \`applyFeedError\` が \`console.error("Feed fetch failed", { error })\` で \`Error\` をそのまま渡していたが、Cloudflare Workers のログは内部で \`JSON.stringify\` するため \`name\` / \`message\` / \`stack\` が non-enumerable で空オブジェクト化し、原因特定が完全に不能だった。\`src/lib/serialize-error.ts\` に \`serializeError()\` ヘルパーを新設し、\`Error\` インスタンスを \`{ name, message, stack, cause }\` に明示展開してログ出力するよう変更。\`cause\` は再帰的に展開し、非 Error 値は \`{ value }\` でラップ。循環参照オブジェクトは文字列化フォールバック。ユニットテスト 11 件 (\`e2e/serialize-error.spec.ts\`) を追加。

### 激アツ新機能っ

- **AI 翻訳を HTML 構造保持方式に変更（Google 翻訳ライク）** — 従来の \`toPlainText\` でタグを剥がしてから翻訳する方式を廃止。\`src/lib/translate-html.ts\` を新設し、Chrome Translator API 対応ブラウザでは \`DOMParser\` で記事 HTML をパースしてテキストノード・\`alt\` / \`title\` / \`aria-label\` / \`placeholder\` 属性のみを個別に翻訳、\`<p>\` / \`<a>\` / \`<strong>\` / \`<img>\` 等のタグ構造・埋め込み・リンクをそのまま保持。\`<code>\` / \`<pre>\` / \`<script>\` / \`<style>\` / \`<kbd>\` / \`<samp>\` / \`<var>\` / \`<iframe>\` / \`<embed>\` / \`<object>\` / \`<noscript>\` / \`<textarea>\` はコード・実行系として翻訳対象から除外。個別ノードは \`Promise.allSettled\` で並列翻訳し、一部失敗しても他ノードに影響しない。\`useArticleAi\` の結果型を \`AiOperationResult {text, isHtml}\` に変更し、\`ArticleView\` では \`isHtml=true\` なら \`sanitizeHtml\` 後に \`article-content\` クラスで HTML レンダリング、\`false\`（Workers AI フォールバック）なら従来のプレーンテキスト表示。ユニットテスト 12 件 (\`e2e/translate-html.spec.ts\`) を追加。

### バグ絶対キルした

- **CSP \`img-src 'self'\` によるファビコン未読バッジ読込失敗を修正** — \`middleware.ts\` の CSP を \`img-src 'self' data:\` に緩和。\`src/lib/favicon.ts\` の \`updateFaviconBadge()\` が \`canvas.toDataURL("image/png")\` で生成する \`data:image/png;base64,...\` を \`<link rel="icon">\` に設定していたが、\`img-src 'self'\` のみではブラウザが favicon link の data: URI を拒否し、コンソールに CSP violation が大量発生。連動して React の Suspense 境界で未読カウント更新が失敗して Minified React error #419 が発生していた。\`data:\` 画像は \`<img>\` / \`<link rel=icon>\` でスクリプトを実行できないため、\`object-src 'none'\` と合わせて XSS リスクは限定的と判断。

### simplify

- **API リクエストボディの \`Record<string, unknown>\` を具体型へ置換 (issue #66)** — \`src/App.tsx\` の \`patchFeed\` / \`applyFeedPatch\` 引数を \`Record<string, unknown>\` から新設の \`FeedPatchPayload\` (src/types.ts) に置き換え。\`src/hooks/useReadState.ts\` の \`serializeReadState\` payload も新設 \`ReadStatePayload\` 型に変更。\`src/lib/xml-parser.ts\` の \`extractMetadata\` は \`FeedItem\` を直接受け取る形にし、\`item as unknown as Record<string, unknown>\` の三段キャストを 3 箇所削除。IDE 補完精度とリファクタ安全性が向上し、Feed PATCH 可能フィールド (nsfw / priority / category / mutedUntil / filter) とサーバー差分同期ペイロードが型レベルで可視化される。

### 激アツ新機能っ

- **翻訳機能を Chrome Translator API / Workers AI のハイブリッドに変更** — Chrome 138+ が備える組み込み \`Translator\` / \`LanguageDetector\` API を優先利用し、対応環境ではブラウザ側でオフライン翻訳を完結させるよう変更。Workers AI コスト・レイテンシを削減し、ネットワーク不通でも翻訳可能に。Safari / Firefox / 古い Chrome や \`availability !== "available"\` の場合は従来通り \`/api/ai/translate\` にフォールバック。\`src/lib/browser-translator.ts\` に API ラッパーと言語検出を切り出し、\`useArticleAi\` の \`doTranslate(url, articleId, plainText?)\` に \`plainText\` を渡せるよう拡張。\`ArticleView\` の翻訳ボタン・\`z\` キーショートカットは \`storedContent\` から \`toPlainText\` で抽出したテキストを渡す。ユニットテスト 5 件 (\`e2e/browser-translator.spec.ts\`) を追加。

## 2026-04-17

### ガード固めたっ

- **\`/api/image-proxy\` の同一オリジン検証と Content-Type 偽装検出を追加 (issue #64)** — \`middleware.ts\` で CSP を \`img-src 'self'\` に絞っている前提が image-proxy 側で担保できていなかった問題に対応。ハンドラ冒頭で \`Sec-Fetch-Site\` → \`Referer\` の優先順位で同一オリジン判定し、不一致は 403 で fail-closed。さらにマジックバイト由来の MIME と宣言 \`Content-Type\` が矛盾する場合は拒否し、\`image/png\` と偽装した別フォーマットによるキャッシュ汚染を遮断。純粋関数として \`src/lib/image-proxy-security.ts\` に切り出し、ユニットテスト 13 件 (\`e2e/image-proxy-security.spec.ts\`) を追加。

### バグ絶対キルした

- **\`POST /api/read-state\` の 413 エラーを解消** — 既読 ID が 20,000 件を超えるヘビーユーザーで \`Payload Too Large\` が発生し、既読・ブックマーク・後で読む・いいね状態の同期が全く成功しない不具合を修正。\`useReadState\` がフルセットを毎回送るのをやめ、前回同期以降の「追加差分 (\`pendingAddedRef\`)」と「削除差分 (\`pendingRemovedRef\`)」のみを POST するように変更。サーバー側マージロジック (\`mergeReadStateUpdate\`) は既に \`(existing ∪ update) \\ removedIds\` で動くため無変更。安全マージンとして \`MAX_READ_IDS\` を 20,000 → 100,000、他 ID 上限も 2,000 → 10,000 に引き上げ。\`applyServerState\` ではサーバーに無い local ID を \`pendingAdded\` に積み直すことでリロード後の未同期データを失わない。\`globalFilter\` は変更時のみ送信する \`dirty\` フラグ方式に変更し、他端末設定の意図しない上書きを防止。

### 激アツ新機能っ

- **通信エラー時のトースト通知** — これまで \`apiFetch\` の失敗が完全にサイレントだったため、ユーザーが同期失敗に気付けなかった問題に対応。\`src/lib/api-fetch.ts\` に \`onApiError\` リスナー機構を追加し、4xx/5xx/ネットワーク障害時にグローバル通知を発火。\`App.tsx\` が \`showToast\` を登録して人間可読なメッセージ（「送信データが大きすぎます」「サーバーエラー」「ネットワークエラー」等）を 2 秒トーストで表示。3 秒のレート制限で UI ノイズを抑制。認証リトライ（401）や通常フロー 404 は通知対象外。

### コードレビュー

- **\`useFilteredArticles\` の useEffect deps から \`filteredRef\` を除外 (issue #68)** — \`src/hooks/useFilteredArticles.ts:362-365\` の useEffect で \`useSyncedRef\` が返す安定 ref \`filteredRef\` が依存配列に含まれていた問題を修正。ref オブジェクト自体は不変で deps に含める意味がなく、将来 \`useSyncedRef\` の実装が変わった際に予期しない再発火を招くリスクがあった。\`eslint-disable-next-line react-hooks/exhaustive-deps\` を付け、deps は \`[serverLoadCount]\` のみに限定。他 hook (\`useReadState\` / \`useEventListener\` 等) の \`useSyncedRef\` 利用箇所も監査済みで、問題箇所は本件のみ。

### ガード固めたっ

- **\`vite-plus\` の path traversal 脆弱性対応 (issue #63, GHSA-33r3-4whc-44c2)** — \`vite-plus\` を \`^0.1.14\` → \`^0.1.18\` に更新。\`<= 0.1.16\` の \`downloadPackageManager()\` に \`VP_HOME\` 外へのファイル書き込みを許す path traversal (high severity) があり、Dependabot alert #28/#29 として通知されていた。dev 依存のため本番実行時には影響しないが、ビルド／\`pre-commit\` 実行時の悪用リスクを排除。

### バグ絶対キルした

- **端末間の既読・ブックマーク・後で読む・いいね状態のズレを解消 (issue #62)** — \`POST /api/read-state\` を単純上書きから 3-way 差分マージに変更。クライアントは削除 ID を \`removedIds\` として送信し、サーバー側で \`mergeReadStateUpdate()\` が \`(existing ∪ update) \\ removedIds\` を計算して保存する。POST レスポンスでマージ結果を返し、クライアントは即座に他端末の最新状態を取り込む。\`toggleRead\` も削除時の即時同期を有効化し、既読解除が他端末で復活するケースを防止。タブ復帰時の R2 再取得クールダウンは 60 秒→ 15 秒に短縮。新規純粋関数 \`src/lib/read-state-merge.ts\` と回帰テスト \`e2e/read-state-merge.spec.ts\`（10 ケース）を追加。

### 激アツ新機能っ

- **スクロール進捗に基づく自動既読マーク機能 (issue #59)** — 記事を閾値（70% / 80% / 90%）までスクロールすると自動的に既読マークする機能を追加。\`useReadingProgress\` の \`onProgressChange\` コールバックをフックして実装し、\`useReadState.markRead\` は冪等のため追加コストなし。設定は \`ArticleView\` のリーダー設定行にトグル＋右クリックで閾値サイクルのボタンを新設（デフォルト OFF / 80%）。\`STORAGE_KEYS.AUTO_READ_ENABLED\` と \`STORAGE_KEYS.AUTO_READ_THRESHOLD\` で localStorage に永続化。

### ガード固めたっ

- **プロンプトインジェクション対策を強化 (issue #55)** — \`src/lib/recommendation.ts\` の \`sanitizeForPrompt()\` に多層防御を追加。NFKC 正規化で全角文字によるバイパス（\`［／ＩＮＳＴ］\` 等）を防止し、LLM チャットテンプレートトークン（\`<|im_start|>\` / \`[INST]\` / \`<s>\` / \`<<SYS>>\` / \`[SYSTEM]\` 等）、プロンプト区切り記号の連続（\`---\` / \`###\` / バッククォートフェンス / \`"""\` 等）を中和する処理を追加。空白の正規化も強化し、不正な入力による LLM プロンプトの乗っ取りを防ぐ。34 ケースの回帰テスト (\`e2e/sanitize-for-prompt.spec.ts\`) を追加。

### メモっといた

- **API エラーコード一覧表を整備 (issue #61)** — \`README.md\` に「API エラーレスポンス」章を新設し、共通エラー（\`UNAUTHORIZED\` / \`INVALID_JSON\` / \`RATE_LIMITED\` / \`INTERNAL_ERROR\`）と各エンドポイント固有のステータス・\`code\` 一覧を明文化。\`canRetryWithSelector\` や \`Retry-After\` 等の付随フィールドも記載し、クライアント実装やデバッグ時にソースコードを読まずに参照できるようにした。

### コードめかし込み

- **API エラーレスポンス形式を統一 (issue #60)** — \`src/lib/api-error.ts\` に \`ApiError\` 型と \`apiError()\` ヘルパーを新設。\`app/api/**\` 配下の全 Route Handler と \`server-auth.ts\` / \`rate-limit.ts\` / \`ai-route-helper.ts\` の \`NextResponse.json({ error: "..." }, { status: N })\` を \`apiError(message, status, { code, hint, retryable })\` に置き換え。\`code\`（機械可読エラーコード）を全エラーに付与し、クライアント側の型安全なエラーハンドリングを可能にした。

## 2026-04-16

### コードめかし込み

- **\`buildArticlePredicate()\` を述語ビルダー関数に分割** — 12 条件が 1 関数に集中していた \`buildArticlePredicate()\` を \`buildFeedPredicate\` / \`buildSnoozePredicate\` / \`buildNsfwPredicate\` / \`buildMutedFeedPredicate\` / \`buildKeywordPredicate\` / \`buildStatePredicate\` / \`buildAuthorPredicate\` / \`buildCategoryPredicate\` / \`buildReadingTimePredicate\` / \`buildQueryPredicate\` / \`buildDatePredicate\` の 11 述語ビルダーに分割。\`Array.every()\` で合成し、不要な述語はビルド時に \`null\` を返してスキップ。(\`src/lib/article-filter.ts\`)

### バグ絶対キルした

- **\`compareByDateDesc\` の同日付ソートを安定化** — 同じ \`publishedAt\` を持つ記事のソート順が不定だった問題を修正。\`id\`（SHA-256 由来の決定論的ハッシュ）を 2 次ソートキーとして追加し、リフレッシュごとに記事リストの並び順が変わる挙動を解消。(\`src/lib/article-utils.ts\`)

---

## 2026-04-16 (XSS サニタイズ監査)

### 激アツ新機能っ

- **キーボードショートカット定義を一元管理** — \`src/config/shortcuts.ts\` を新設。\`SHORTCUTS\` 配列と \`SHORTCUT_MAP\` を集約し、\`KeyboardShortcutsModal\` が自動生成されるよう変更。フィルターボタンの \`title\` 属性も config 経由で参照。

### コードめかし込み

- **\`sanitizeHtml\` の replace チェーンを \`HTML_SANITIZE_RULES\` 配列ループに統合** — 147行のメソッドチェーンを \`Array<[RegExp, string | ReplaceFn]>\` 定数 + 7行のループに置き換え。パターン追加が1行で済み、保守性が向上。

- **ShareMenu の SNS シェアターゲットを設定配列化** — X・Bluesky・LINE・はてなブックマークの4ボタンを \`SHARE_WINDOW_TARGETS\` 配列に集約し、\`.map()\` でレンダリングするように変更。新しい SNS 追加時にコピペ不要になり、保守性が向上。

- **\`ArticleList\` のプロップ数を 49 → 18 に削減** — \`useFilteredArticles\` の戻り値を \`FilterState\` 型としてエクスポートし、フィルター関連の26プロップを \`filter: FilterState\` 1つに集約。\`App.tsx\` 側の渡し元もシンプルになり、保守性が大幅に向上。

### ガード固めたっ

- **XSS サニタイズ完全性の監査・テスト追加 (issue #51)** — \`processContent()\` と \`stripIframes()\` のすべての呼び出し経路を監査し、\`dangerouslySetInnerHTML\` が常にサニタイズ済みデータのみを受け取ることを確認。\`e2e/content-extraction.spec.ts\` に \`processContent\` / \`stripIframes\` の XSS 防止テストを 11 件追加。悪意ある RSS フィードに埋め込まれた \`<script>\`・イベントハンドラ・\`javascript:\`・\`data:\` URI が除去されることを回帰テストで保証。

- **\`sanitizeKeywords\` でサーバー側 ReDoS 検証を追加** — \`/api/read-state\` POST で受け取ったキーワードフィルターにおいて、クライアント側でのみ行っていた \`hasCatastrophicBacktracking\` チェックを \`sanitizeKeywords\` にも追加。API を直接叩いた悪意あるユーザーが ReDoS パターンを R2 に保存できる問題を修正。

### バグ絶対キルした

- **AI API エラーハンドリングを強化** — \`runAiJob()\` の catch ブロックで Workers AI のステータスコード別レスポンスを返すよう修正。429（rate_limited + retryAfter）・401（unauthorized）・503（service_unavailable）を個別ハンドリング。

- **\`useReadState\` の \`syncImmediately\` に存在した race condition を修正** — 削除操作後のページリロード時、\`syncImmediately\` が予約した \`setTimeout(0)\` のIDを \`syncTimerRef\` に保持していなかったため、\`beforeunload\` / \`visibilitychange hidden\` の \`flushIfPending\` がタイマーを検出できず \`sendBeacon\` が発火しないケースがあった。\`syncTimerRef.current\` にIDを保存し、\`isDirtyRef\` を \`true\` に保つよう修正。

- **link が null/undefined の記事で重複排除が機能しない問題を修正** — \`mergeUniqueArticles\` の link ベース第2パス重複排除で、link 欠落記事が常に通過していた。\`a.link || a.guid || a.id\` のフォールバックキーを使うよう修正し、古い RSS フォーマット等でも正しく重複排除されるようになった。

### パフォーマンス改善

- **\`buildFilterMap\` のフィルターコンパイルキャッシュ追加** — \`feeds\` 配列の参照が変わるたびに全フィードの正規表現が再生成されていた問題を改善。\`compiledCache\` パラメータを追加し、\`useFilteredArticles\` が \`useRef\` で保持したキャッシュを渡すことで、フィルター内容が変わっていないフィードの \`normalizeFilter\`（RegExp 再コンパイル）をスキップする。5分ポーリング等で \`feeds\` 参照が変わっても同一フィルターは再利用される。

- **タブ非表示時のポーリング間隔を延長** — \`document.visibilitychange\` イベントを検知し、タブ非表示時のポーリング間隔を 5分 → 15分に延長。Workers AI / R2 への不要なリクエストを削減。

- **markBulkRead の不要なサーバー同期を防止** — \`globalFilter\` 適用時、ポーリングで \`articles\` が更新されるたびに \`scheduleSyncToServer\` が呼ばれていた問題を修正。\`stateRef.current.read\` で既読済み ID を事前チェックし、新規既読がゼロの場合は \`setState\` と \`scheduleSyncToServer\` をスキップするよう改善。R2 への無駄な書き込みが削減される。

## 2026-04-15 (3)

### バグ絶対キルした

- **LRU キャッシュ flush の堅牢性向上** — \`LruCache#flush()\` に \`try/finally\` を追加し、\`storageSet\` / \`storageRemove\` で例外が発生しても \`pending\` が必ずクリアされるように修正。従来は例外発生時に古いエントリが \`pending\` に残留し、次の \`flush\` で重複書き込みが起こる可能性があった。

## 2026-04-15 (2)

### コードめかし込み

- \`isValidFeedHash\` を \`src/lib/validation.ts\` に共通化 — \`articles\` ルートのインライン正規表現を関数に置き換え、\`engagement\` ルートにも同バリデーションを適用（従来は長さチェックのみで形式未検証だった）

## 2026-04-15

### 激アツ新機能っ

- **クロスデバイス既読同期** — タブ・アプリに復帰したとき（\`visibilitychange\` visible）にサーバーから最新の既読状態を再取得し、他デバイスで既読にした記事をセッション内で即時反映。60 秒クールダウン付きで過剰なリクエストを防ぐ。
- **IntersectionObserver ベースの読書進捗復元** — スクロールピクセル保存から要素アンカー（\`.article-content > :nth-child(N)\`）方式に移行。画像遅延ロードで高さが変わっても正しい位置に復元されるようになった。\`useReadingProgress\` フックを \`ArticleView\` に統合し、\`saveScrollPos\`/\`loadScrollPos\` を削除。

### バグ絶対キルした

- **shop-pro.jp 商品画像スライダー** — クラス属性なしの \`<ul>\` で 3 枚以上の画像のみ（テキスト 5 文字以下）で構成されるリストを CSS scroll-snap スライダーに自動変換。商品詳細ページでサムネイルが横スクロールで閲覧できるようになった。

## 2026-04-14

### UI

- **全既読ボタンに 2 段階確認** — 1 クリック目で「全既読?」と赤表示し、3 秒以内の再クリックで実行。タイムアウト後は自動リセット。誤操作による全既読を防止。
- **記事詳細ヘッダーを常時 2 段構成に変更** — \`lg:flex-row\` を廃止し、タグが多くてもヘッダーが崩れない縦積みレイアウトに統一。フィルターバーのボタン（未読 / 後で読む / digest / 日付 / 読了時間 / グローバルフィルター）をテキストからアイコン表示に変更してスペースを節約。

### バグ絶対キルした

- **後で読む削除後に復活するバグ** — \`useReadState\` の \`useEffect\` dependency を \`user\` から \`user?.sub\` に変更。\`useAuth\` がトークンリフレッシュのたびに新しいオブジェクトを生成するため、5 秒デバウンス前にサーバーの古いデータが再マージされていた問題を解消。

## 2026-04-13

### 激アツ新機能っ

- **ダイジェストモード** — 全フィード表示時にフィードごとの表示件数を最新 3 件に制限するモード。購読フィードが多い場合でも情報過多にならず、各フィードの最新状況を一覧できる。ツールバーの \`digest\` ボタンまたは \`D\` キーで切替。\`localStorage\` に永続化され、フィード個別選択時は自動的に無効化される。
- **後で読む / ブックマーク / いいね を排他スイッチに変更** — 3 つのトグルを pill 型セグメントコントロールに統合。いずれか 1 つのみアクティブになり、アクティブなボタンを再押しで解除できる。後で読む: \`bg-ink\`・ブックマーク: \`bg-bookmark\`・いいね: \`bg-rose-400\` で色分け表示。

### バグ絶対キルした

- **トークンリフレッシュ重複・ログイン後 LP 表示の問題を修正** — callback リダイレクト先を \`/?login=1\` に変更してログイン直後を識別。\`useAuth\` の \`checkAuth\` でログイン直後かつ \`user=null\` の場合は 600ms 後にリトライ（スピナー維持）。ランディングページが一瞬表示される問題を解消。認証成功後に \`?login=1\` クエリを \`history.replaceState\` でクリア。

## 2026-04-12 (4)

### コードめかし込み

- **\`useReadingProgress\` の localStorage キーを一元管理** — ハードコードされていた \`"rss-reading-progress:"\` プレフィックスを \`STORAGE_KEYS.READING_PROGRESS_PREFIX\` に移動。手動 \`JSON.stringify\`/\`JSON.parse\` を \`saveJson\`/\`loadJson\` ヘルパーに置き換え。

## 2026-04-12 (3)

### 激アツ新機能っ

- **記事 TTL フィルタ (30日)** — \`/api/articles\` 返却時に 30 日以上経過した記事を除外（物理削除なし）。ブックマーク・後で読む・いいね・スヌーズ・メモが付いた記事は保護。
- **非アクティブフィードの cron スキップ (7日)** — 7 日以上アクセスのないフィードは 30 分 cron での自動フェッチをスキップし、コスト・帯域を削減。\`priority: "high"\` フィードは常にフェッチ継続。\`/api/feeds\` が \`lastAccessedAt\` を 1 時間スロットル付きで更新する。
- \`src/lib/article-ttl.ts\` を新規追加 — \`isArticleExpired\` / \`shouldProtectArticle\` / \`filterExpiredArticles\` の純粋関数（14 テスト）。

### バグ絶対キルした

- **Obsidian URI を \`<a>\` タグクリックで開く** — \`window.open\` を使用していたため真っ黒タブが開く問題を修正。非表示の \`<a href="obsidian://...">\` 要素を生成してクリックする方式に変更。
- **\`html-to-markdown.ts\`: \`NodeList.map\` ブラウザ非対応を修正** — \`domToNode\` 内で \`NodeList\` を \`Array.from()\` に変換してから \`map\` を呼ぶよう修正。Firefox / Safari で Markdown コピーが失敗する問題を解消。
- **Markdown コピー・Obsidian 保存ボタンのエラーハンドリング追加** — \`navigator.clipboard\` が未定義の場合はエラートーストを表示。\`articleToMarkdown\` / \`buildObsidianUri\` を try-catch で保護。Obsidian ボタンクリック時に「Obsidian を開いています…」トーストを表示。

## 2026-04-12 (2)

### 激アツ新機能っ

- **Obsidian 連携** — ShareMenu に「Markdown 全文コピー」「Obsidian に保存」ボタンを追加。\`obsidian://new\` URI で Vault 名・frontmatter・本文を渡して直接ノート作成できる。Vault 名は localStorage に保存。
- **HTML → Markdown 変換** (\`src/lib/html-to-markdown.ts\`) — h1-h6/a/img/ul/ol/strong/em/code/pre/blockquote/table を Markdown に変換。YAML frontmatter (title/url/feed/author/published) 付き。XSS (script/style) は除去。
- **Obsidian URI ライブラリ** (\`src/lib/obsidian.ts\`) — \`sanitizeObsidianFilename\` でファイル名不正文字を除去・置換。\`buildObsidianUri\` で URI を生成。
- **リーダー設定拡充** — ArticleView ツールバーに行間 (5段階: 1.5-2.3) / コンテンツ幅 (3段階: 640px/720px/全幅) / 両端揃えトグルを追加。設定は localStorage に永続化。
- **SingleFile 連携 API** (\`POST /api/clip\`) — SingleFile ブラウザ拡張から HTML + URL を受信し、本文抽出後に Cloudflare Cache API に保存。\`/api/content\` と同じキャッシュキー形式で共有。
- **TDD 基盤整備** — コーディング規約に TDD セクション追加。E2E テスト 82 件追加 (html-to-markdown/export-markdown/obsidian/reader-settings/reading-progress/clip)。

### コードめかし込み

- \`src/lib/reader-settings.ts\` を新規追加 — FontSizeExtended (6段階) / LineHeight / ContentWidth の定数・CSS スタイル生成・cycle 関数を集約。
- \`src/lib/reading-progress.ts\` を新規追加 — \`computeProgress\` / \`clampProgress\` / \`buildAnchorSelector\` の純粋関数。
- \`src/hooks/useReadingProgress.ts\` を新規追加 — IntersectionObserver で本文直下要素を追跡し進捗を localStorage に保存。

## 2026-04-12

### simplify

- \`FeedSidebar\` のMarkdown/メモエクスポートボタンの SVG ボイラープレートを \`FooterIconButton\` に統一（-32行）。\`FooterIconButton\` ��� \`onContextMenu\` prop を追���。
- \`ArticleView.tsx\` 内の手動 \`addEventListener\` / \`removeEventListener\` を \`useEventListener\` に統一。\`ImageGallery\` のライトボックスキーボード操作、\`ArticleView\` 本体のショートカットキー (v/a/z/Space)、Twitter iframe リサイズの 3 箇所を移行。ショートカットキーの \`useEffect\` は依存配列 14 個を \`useSyncedRef\` で解消し、リスナー再登録を回避。

### コードめかし込み

- \`useAutoReset\` の \`set\` 関数を \`useCallback\` で安定化。\`resetValue\` / \`duration\` を ref 経由で参照し deps を空にすることで、\`showToast\` 等の依存先がメモ化できない問題を解消。
- \`useMenuOpen\` に \`'use client'\` ディレクティブを追加（他フックとの一貫性）。
- \`useUIState\` の \`toast\` 手動タイマー管理（\`useState\` + \`useRef\` + \`useEffect\` + \`setTimeout\`）を \`useAutoReset<string | null>(null, 2000)\` に置き換え。
- \`useEventListener\` に \`capture?: boolean\` オプションを追加（キャプチャフェーズ登録に対応）。
- \`usePortalMenu\` / \`useOnlineStatus\` / \`useMobilePane\` / \`useKeyboardNav\` の生の \`addEventListener\` を \`useEventListener\` に統一。\`useKeyboardNav\` の \`handleKeyDown\` は \`useEffect\` 外に移動し \`eslint-disable\` コメントも不要に。
- \`useMenuOpen\` の \`useEffect\` + 生の \`document.addEventListener/removeEventListener\` を \`useEventListener\` フックに置き換え。\`open\` のチェックをハンドラー内部に移動し、常時リッスン + 早期リターン方式に統一。
- \`useMenuOpen\` の mousedown/touchstart ハンドラーを共通関数 \`handleOutside\` に抽出し重複を解消。
- \`ArticleList\` のカテゴリドロップダウン click-outside 処理を生の \`useEffect + document.addEventListener\` から \`useEventListener\` フックに移行。

## 2026-04-11 (18)

### コードめかし込み

- \`useUIState\` の \`fontSize\` / \`fontFamily\` / \`layout\` で繰り返されていた \`useState + useCallback + storageSet\` パターンを \`useStoredSetting<T>\` ヘルパーに集約し、ボイラープレートを削減。

## 2026-04-11 (17)

### 激アツ新機能っ

- **カテゴリ折りたたみ時の未読数表示** — サイドバーでカテゴリを折りたたんだとき、フィード数ではなくカテゴリ内の未読記事合計数を表示するよう変更。未読がある場合は \`text-text-muted\` で強調表示し、すべて既読の場合はフィード数を \`text-text-faint\` で表示。折りたたんだまま未読の有無を把握しやすくなった。

## 2026-04-11 (16)

### コードめかし込み

- \`useEventListener\` に非標準イベント用 \`string\` オーバーロードを追加し、\`useUIState\` の \`beforeinstallprompt\` ハンドラーを生の \`window.addEventListener\` から \`useEventListener\` に移行。\`keydown\` リスナーとの一貫性を確保。

## 2026-04-11 (15)

### ガード固めたっ

- **CSS変数フォールバック経由の position バイパスを修正** — \`sanitizeStyleAttr\` の \`position\` フィルターを \`fixed|sticky|absolute\` の明示値のみ除去する方式から \`position:\` プロパティ全体を除去する方式に変更。\`position: var(--x, fixed)\` のように CSS カスタムプロパティのフォールバック値に危険な位置指定を仕込むことで、フィッシングオーバーレイを作成できるバイパスを防ぐ。

## 2026-04-11 (14)

### コードめかし込み

- \`useUIState\` の keydown イベントリスナーを既存の \`useEventListener\` フックに統一。\`useEffect\` + 手動 \`addEventListener/removeEventListener\` のボイラープレートを削除。

## 2026-04-11 (13)

### ガード固めたっ

- **ETag / Last-Modified サニタイズ** — 外部 RSS サーバーから返される \`ETag\` および \`Last-Modified\` ヘッダー値を保存前に CRLF 除去・長さ制限を適用。悪意ある RSS サーバーによるヘッダーインジェクション / フィード DoS リスクを解消。

## 2026-04-11 (12)

### 激アツ新機能っ

- **メモのMarkdownエクスポート** — メモを書いた記事がある場合、サイドバーフッターに鉛筆アイコンが表示される。クリックするとメモ本文・記事タイトル・公開日をまとめた Markdown ファイルをダウンロードできる。Obsidian・Notion などのノートアプリへのエクスポートに活用できる。

## 2026-04-11 (11)

### 激アツ新機能っ

- **記事の印刷** — 共有メニューに「印刷」ボタンを追加。\`Ctrl+P\` またはメニューから記事のみをクリーンに印刷できる。サイドバー・記事一覧・アクションボタン・前後ナビゲーションは印刷時に自動で非表示になり、記事本文だけが出力される。

## 2026-04-11 (10)

### 激アツ新機能っ

- **フォーカスモード** — \`\\\` キーまたは記事ヘッダーのアイコンで記事ビューを全画面表示。サイドバーと記事一覧が 0.25 秒のアニメーションで非表示になり、記事本文だけに集中できる読書モード。\`Esc\` または再度 \`\\\` で解除。

## 2026-04-11 (9)

### バグ絶対キルした

- **\`rate-limit.ts\` TOCTOU 競合を修正** — \`inFlight\` Set で同一アイソレート内の並行リクエストをガードし、複数リクエストがクールダウンチェックを同時に通過する問題を解消。
- **\`server-auth.ts\` \`refreshTokens\` の reject を 401 に統一** — ネットワークエラー等で \`refreshTokens\` が reject した場合に \`.catch(() => null)\` で null に変換し、意図しない 500 ではなく 401 として処理するよう修正。

### ガード固めたっ

- **\`html.ts\` XSS サニタイザーのバックティック処理を強化** — インラインイベントハンドラ除去の正規表現に \`(?!["'\\\`])\` 否定先読みを追加し、非クォート値のキャッチオール分岐が引用符で始まる値に誤マッチしないよう修正。

## 2026-04-11 (8)

### バグ絶対キルした

- **\`useSpeechSynthesis\` の ghost callback race を修正** — \`speak()\` 内の \`utterance.onend\`/\`onerror\` に identity ガードを追加。レート変更時に旧 utterance がキャンセルされると非同期で \`onend\`/\`onerror\` が発火し、新 utterance の再生中に \`isPlaying=false\` へリセットされる競合を解消。

## 2026-04-11 (7)

### コードめかし込み

- **\`useSpeechSynthesis\` を既存ユーティリティで整理** — 生の \`localStorage\` アクセスを \`storageGet\`/\`storageSet\`+\`STORAGE_KEYS.TTS_RATE\` に統一。手動 \`useRef\`+sync を \`useSyncedRef\` に、手動インデックス計算を \`cycleValue\` に置き換え。再生中のレート変更を即時反映（\`currentTextRef\` でテキストを保持し \`cycleRate\` 時に \`speak\` を再起動）。\`ArticleView\` の冗長なテナリーを簡略化。

## 2026-04-11 (6)

### 激アツ新機能っ

- **読み上げ速度調整** — 記事ビューの TTS ボタン横に速度切り替えボタン（0.5x / 0.75x / 1x / 1.25x / 1.5x / 2x）を追加。クリックで循環切り替え。設定は localStorage に永続化される。

## 2026-04-11 (5)

### コードめかし込み

- **\`makeCycler\` ヘルパー抽出** — \`useFilteredArticles\` の \`toggleSortOrder\` / \`cycleDateRange\` / \`cycleReadingTimeRange\` が持つ「循環→保存→ページリセット→返却」パターンを \`makeCycler\` モジュールレベルヘルパーに抽出し、\`updateQuery\` とともに既存の \`useMemo\` ブロックへ統合（\`useCallback\` を 4 つ削減）。
- **\`FeedPageResult\` 型をモジュールレベルへ移動** — \`useFeeds\` の \`loadMoreAllFeedsArticles\` 内でインライン宣言されていた型を関数外に移動し、関数ボディをクリーンアップ。

## 2026-04-11 (4)

### コードめかし込み

- **\`useGestureNav\` のコメント整理と dispatch ロジック共通化** — 定数の WHAT コメントを削除（名前が自明）し \`TOUCH_X_Y_RATIO\` の WHY コメントを JSDoc に変換。mouse/touch で重複していた \`if (dx < 0) onSelectNext?.()\` パターンを \`dispatchSwipe\` ヘルパーに抽出。

## 2026-04-11 (3)

### コードめかし込み

- **\`shared-feed.ts\` のインライン定数をモジュールレベルに移動** — \`mergeNewArticles\` 内の \`KNOWN_IDS_MAX = 10_000\` と \`getUserLatestArticles\` 内の \`MAX_USER_ARTICLES = 10_000\` をモジュールレベルの \`export const\` に抽出。JSDoc コメントを付与し意図を明示。

## 2026-04-11 (2)

### ガード固めたっ

- **Next.js を 16.1.7 → 16.2.3 にアップデート** — DoS 脆弱性 (GHSA-q4gf-8mx6-v5v3) を修正。\`@opennextjs/cloudflare\` 1.19.0 で 16.2.3+ サポートが追加されたため固定制約を解除してアップデート。
- **\`@opennextjs/cloudflare\` を 1.17.1 → 1.19.0 にアップデート** — Next.js 16.2.x 互換性対応を取り込み。

## 2026-04-11

### コードめかし込み

- **\`useGestureNav\` のマジックナンバーを named constants に抽出** — \`60\` / \`150\` / \`400\` / \`0.5\` / \`1.5\` を \`SWIPE_THRESHOLD_PX\` / \`WHEEL_THRESHOLD_PX\` / \`WHEEL_RESET_MS\` / \`WHEEL_X_Y_RATIO\` / \`TOUCH_X_Y_RATIO\` に命名。\`60\` が mouse/touch の両方で使われていた重複を定数共有で解消。
- **\`useGestureNav\` のタイマーリークを修正** — アンマウント時に \`wheelDeltaRef\` の pending タイマーが残ったままになる問題を \`useEffect\` cleanup で修正。
- **\`useGestureNav\` の optional chaining 統一** — \`if (cb) cb()\` パターンを \`cb?.()\` に統一。what コメントを why（縦スクロール比率の根拠）に置き換え。

## 2026-04-10

### コードめかし込み

- **\`useGestureNav\` を \`src/hooks/useGestureNav.ts\` に抽出** — \`ArticleView.tsx\` のインライン定義だったジェスチャーナビゲーションフック（スワイプ・ホイール・マウスドラッグ）を独立したファイルに分離。\`ArticleView.tsx\` を約90行削減。
- **\`appendPaginatedPages\` の重複ロジックを削除** — ページネーション取得ループで \`extractContent\` を直接呼び出すよう変更。charset 検出・デコード・AI フォールバックの8行の重複コードを除去。

### ガード固めたっ

- **\`customTitle\` に制御文字除去を追加** — \`PATCH /api/feeds/:id\` の \`title\` フィールドが \`category\` と異なり \`stripControlChars\` を経由していなかった。一貫性を保ちストアード制御文字インジェクションを防ぐため修正。
- **\`sanitizeStyleAttr\` に \`position: absolute\` を追加ブロック** — \`fixed\` / \`sticky\` は既にブロック済みだったが \`absolute\` は未対応だった。高 \`z-index\` と組み合わせると記事ペイン内で他の UI 要素を覆うフィッシング UI を作れるため除去対象に追加。
- **\`sanitizeStyleAttr\` で \`position: -webkit-sticky\` を除去** — Safari で動作する \`-webkit-sticky\` がベンダープレフィックス形式のため既存の正規表現 \`(fixed|sticky|absolute)\` では捕捉されていなかった。\`(?:-webkit-)?\` を追加して補完。

### コードめかし込み

- **CSP \`frame-src\` を単一管理** — \`middleware.ts\` の frame-src 許可オリジンを \`html.ts\` の \`TRUSTED_IFRAME_RULES\` から導出するように変更。新しい埋め込みソース追加時の二重管理を解消。
- **CSP 静的ディレクティブをモジュールレベルに移動** — nonce 以外の CSP ディレクティブをモジュール初期化時に一度だけ構築するよう変更（毎リクエストのアロケート・join を排除）。
- **\`btoa(randomUUID())\` を \`randomUUID()\` に簡略化** — UUID 文字列は CSP nonce に使える印字可能 ASCII のため btoa エンコード不要。
- **\`role\` フィールドの不要な \`as const\` 削除** — Cloudflare Workers AI インターフェースの \`role\` は \`string\` 型のため \`"system" as const\` / \`"user" as const\` は不要なキャスト。
- **\`web-push.ts\` の冗長な 2 行を 1 行にマージ** — \`const body = encryptPayload(...); const encryptedBody = await body\` を \`const encryptedBody = await encryptPayload(...)\` に整理。

### ガード固めたっ

- **CSP nonce 伝播修正** — \`middleware.ts\` で \`NextResponse.next({ request: { headers } })\` パターンを使いリクエストヘッダーにも CSP を付与。Next.js レンダラーがリクエストヘッダーから nonce を読むため、修正前は nonce が伝播せずインラインスクリプトがブロックされる恐れがあった。
- **\`sanitizeForPrompt\` に Unicode 制御文字を追加除去** — ASCII 制御文字 (\`\\x00-\\x1F\`) のみだったフィルターに Unicode 双方向制御文字 (U+200B–200D, U+2028–2029, U+202A–202E, U+FEFF) を追加。U+2028/2029 は一部 LLM トークナイザーで改行扱いされロールインジェクションに悪用できた。
- **\`reason\` フィールドの外部入力に \`sanitizeForPrompt\` を適用** — \`link_discovery\` / \`web_search\` の推薦結果の \`reason\` フィールドに RSS 記事タイトル・AI 出力 topic をサニタイズせず埋め込んでいた。ストアード XSS の経路を遮断。

- **CSP nonce 実装 — \`'unsafe-inline'\` を \`script-src\` から削除** — \`middleware.ts\` を新規追加し、リクエストごとにランダムな nonce を生成。Next.js がインライン script 要素に nonce 属性を自動付与するため、\`'unsafe-inline'\` なしで CSP が機能するようになった。これにより XSS 攻撃でインラインスクリプトを注入されてもブラウザが実行をブロックする。
- **\`extractUserTopics\` のプロンプトインジェクション対策** — 外部 RSS フィードから取得したタイトル（フィード名・記事タイトル）を LLM プロンプトへ埋め込む前に \`sanitizeForPrompt\` で制御文字・改行を除去し 120 文字に切り詰め。また system/user メッセージを分離してインジェクション境界を明確化。悪意ある RSS フィードが \`"Ignore previous instructions..."\` のようなタイトルで AI の挙動を操作するリスクを緩和。

- **\`sendPush\` に SSRF 多層防御を追加** — Push 通知送信時、サブスクリプション登録時に \`isValidHttpsUrl\` で検証済みだが、R2 データが直接改ざんされた場合の SSRF 経路を防ぐため \`sendPush\` 関数内でも endpoint URL を再検証するよう追加。
- **\`inferSelectors\` のプロンプトインジェクション対策** — \`excludeSelectors\` をプロンプトに埋め込む際、\`"\${s}"\` のテンプレートリテラルでは CSS 属性セレクタ (\`[attr="value"]\`) に含まれる \`"\` でプロンプト構造が崩れる恐れがあった。\`JSON.stringify(excludeSelectors)\` に変更し、引用符を適切にエスケープして LLM への意図しないインジェクションを防止。

### メモっといた

- **R2 データ構造ドキュメントを共有フィード構造に更新** — \`README.md\` / \`CLAUDE.md\` / \`.claude/rules/architecture.md\` / \`.claude/rules/coding-conventions.md\` の R2 キー構造が旧構造（\`users/{userId}/feeds.json\`・\`users/{userId}/articles.json\`）のままだった箇所を現行の共有フィード構造（\`feeds/{feedHash}/meta.json\`・\`feeds/{feedHash}/articles/latest.json\`・\`users/{userId}/subscriptions.json\` 等）に全面更新。データフロー・クールダウンキー・ReadState フィールド（likeIds・notes）も追記。
- **README.md を現状に合わせて全面更新** — パッケージマネージャを \`npm\` → \`pnpm\` に修正、R2 バケットの不要な \`rss-reader-cache\` 削除、VAPID・BRAVE_SEARCH_API_KEY 等の新規シークレット追加、API エンドポイント一覧を現行の全エンドポイント（read-state / recommendations / push / stats / engagement / ogp / image-proxy / OPML 等）に拡充、読み取り状態の説明を「localStorage のみ」→「R2 との二重管理」に修正。

### コードめかし込み

- \`content.ts\`: \`extractMainContent\` 内で 3 回繰り返されていた \`(html.match(/<img\\b/gi) ?? []).length\` パターンを \`countImgs\` ヘルパーに抽出。
- \`app/api/stats/route.ts\`: \`GET\` ハンドラ内クロージャに定義されていた \`buildDayList\` をモジュールレベルに移動し、\`now\` を引数として受け取るよう変更。
- \`useSpeechSynthesis\`: \`supported\` チェックをモジュール定数 \`SPEECH_SUPPORTED\` に移動し、毎レンダー再評価を排除。\`speak\` / \`stop\` の \`useCallback\` deps から除去され参照が安定化。
- \`useSpeechSynthesis\`: 停止状態リセット（\`utteranceRef.current = null; setIsPlaying(false); setIsPaused(false)\`）の 3 重複を \`resetState\` ヘルパーに抽出。
- \`ArticleView\`: TTS キーボードハンドラを手動 \`addEventListener\` から \`useEventListener\` フックに置き換え。不要になった \`useSyncedRef\` 4 呼び出しを削除。
- \`ArticleView\`: TTS ボタンの \`title\` 属性の冗長条件（\`ttsPlaying ? "停止" : ttsPaused ? "停止" : ...\`）を \`(ttsPlaying || ttsPaused) ? "停止" : ...\` に簡略化。
- \`unescapeHtml\`: \`&amp;\` / \`&lt;\` / \`&gt;\` / \`&quot;\` / \`&#NNN;\` / \`&#xHHH;\` の 5 パス連続 \`.replace()\` を 1 パスの正規表現に統合し、文字列走査を削減。

## 2026-04-09

### コードめかし込み

- \`hasDangerousScheme\` の名前付き文字参照デコード（\`&Tab;\` / \`&NewLine;\` / \`&colon;\`）を個別 3 パスから 1 パスに統合し、文字列走査を削減。

### ガード固めたっ

- **\`hasDangerousScheme\` の HTML5 名前付き文字参照バイパスを修正** — \`&colon;\`（\`:\` に展開）を使った \`javascript&colon;alert()\` や、\`&Tab;\` / \`&NewLine;\`（ブラウザが URL パース時に先頭から除去）を使ったスキーム偽装が \`hasDangerousScheme\` の検出をすり抜け XSS になりうる問題を修正。これらの名前付き文字参照を \`unescapeHtml\` 呼び出し後に補完デコードするよう対処。数値形式（\`&#9;\` 等）は既存の \`unescapeHtml\` で処理済みだったが名前付き形式が未処理だった。

## 2026-04-09

### コードめかし込み

- \`src/lib/html.ts\` の \`unescapeHtml\` で重複していた数値文字参照のデコードロジック（\`&#NNN;\` と \`&#xHHH;\` の検証ブロック 4 行 × 2）を \`decodeCodePoint(code: number)\` ヘルパーに抽出。コード量を削減し、検証ロジックを一元管理。
- \`toPlainText\` の \`&amp;\` / \`&lt;\` / \`&gt;\` デコードを \`unescapeHtml\` 呼び出しに統合。重複実装を排除し、AI 入力に渡すテキストで \`&quot;\` や数値文字参照も正しくデコードされるよう改善。

## 2026-04-09

### ガード固めたっ

- **コンテンツプロキシのエラーレスポンスを汎用化** — \`/api/content\` がリモートサーバーの HTTP ステータスコード（403・404 等）をエラーボディにそのまま含めて返していた問題を修正。\`"Failed to load page"\` に統一し、外部サーバーのリソース存在有無がクライアントに漏洩するのを防止。
- **JWT \`sub\` クレームのフォーマット検証を追加** — \`sub\` は R2 キー（\`users/{sub}/...\`）に直接埋め込まれるため、英数字・ハイフン・アンダースコア・\`@\`・\`.\` のみ許可するホワイトリスト検証を \`sessionFromPayload\` に追加。パストラバーサル（\`/\` や \`..\` を含む不正な sub）によるデータ隔離の破壊を防止。

## 2026-04-09

### 激アツ新機能っ

- **記事の読み上げ機能（TTS）** — Web Speech API を使って記事を音声で読み上げられるようになりました。記事ビューのツールバーにスピーカーアイコンボタンを追加。クリックで読み上げ開始、再クリックで停止。キーボードショートカット \`P\`（大文字）でも操作できます。記事を切り替えると自動的に停止します。ブラウザが Web Speech API に対応していない場合はボタンは表示されません。

## 2026-04-09

### ガード固めたっ

- **\`/api/feeds/:id/reinfer\` にレートリミットを追加** — AI 呼び出し + 外部 URL フェッチを伴う重い操作にクールダウン（60 秒）を設けていなかった問題を修正。繰り返し呼び出しによる Workers AI コストの増大と外部サーバーへの過剰リクエストを防止。
- **\`failedSelectors\` を最大 10 件に制限** — LLM CSS セレクタ再推論で失敗履歴が無制限に蓄積し、R2 ストレージ肥大化と AI プロンプトのトークン増加が起きていた問題を修正。
- **HTML Popover API 属性を \`sanitizeHtml\` で除去** — \`<div popover="auto">\` + \`<button popovertarget="id">\` の組み合わせで JavaScript を一切使わずにブラウザのトップレイヤーへ任意 HTML をオーバーレイ表示できる問題を修正。悪意ある RSS 記事がリーダー UI を覆うフィッシング画面を表示できた。\`popover\` / \`popovertarget\` / \`popovertargetaction\` 属性を除去するよう追加。ブール属性（値なし）も対応。
- **\`<dialog>\` タグを \`sanitizeHtml\` で除去** — \`<dialog open>\` は UA スタイルシートの \`position: absolute\` で記事コンテンツ外を覆う可能性があるため、\`<form>\` と同様にタグ枠のみ除去してコンテンツを保持するよう修正 (\`src/lib/html.ts\`)

### バグ絶対キルした

- **reinfer 失敗時に \`failedSelectors\` が R2 に保存されない問題を修正** — \`inferFeedFromUrl\` が null を返した場合、\`writeFeedMeta\` が呼ばれないまま 422 を返していたため、失敗履歴の更新が破棄されていた。次回再推論時に同じセレクタを繰り返し試みる動作を防止するため、\`failedSelectors\` の保存を推論呼び出し前に移動。推論失敗時も旧 \`cssSelectors\` が R2 に残るため既存フィードは引き続き動作する。
- **ページネーション記事の2ページ目以降に AI フォールバックを適用** — \`appendPaginatedPages\` で2ページ目以降のコンテンツ抽出が \`extractMainContent\` のみで、1ページ目と異なり Cloudflare AI toMarkdown フォールバックが発動しない問題を修正。コンテンツが不十分な場合は1ページ目と同様に AI フォールバックを試みるよう統一。
- **\`feeds/import\` の型述語抜けを修正** — \`SharedFeedMeta | null\` の \`filter\` に型述語を追加し、TypeScript が \`null\` を見逃す可能性を排除。
- **\`useReadState\` の \`flushIfPending\` で \`isDirtyRef\` をリセット** — \`beforeunload\` / \`visibilitychange\` でタイマーをキャンセルした後も \`isDirtyRef.current\` が \`true\` のまま残る問題を修正。次のデバウンスサイクルでの二重送信を防止。
- **\`useReadingStats\` をグローバル \`fetch\` から \`apiFetch\` に置き換え** — 認証エラーハンドリングと \`getAuthReady()\` 待機を他フックと統一。

### 激アツ新機能っ

- **記事スクロール位置の自動保存・復元** — 記事を読んでいる途中で別の記事に切り替えて戻ったとき、前回のスクロール位置を自動的に復元する。スクロール位置は \`localStorage\` にデバウンス（500ms）保存し、最大 200 件を保持する。また、記事切り替え時にスクロール位置が前の記事のままになっていたバグを修正。

- **テキスト選択で引用コピー** — 記事本文でテキストを選択するとポップアップが表示され、「引用をコピー」ボタンで \`> 選択テキスト\\n\\n— [記事タイトル](URL)\` 形式の Markdown 引用をクリップボードにコピーできる。グローバルフィルターが設定済みの場合は除外キーワード追加ボタンも併せて表示する。
- **週間読書目標・進捗トラッキング** — 読書統計モーダルに「週間目標」セクションを追加。デフォルト 20 件の目標に対する今週の進捗をプログレスバーで表示し、目標数値をクリックしてインライン編集できる。達成時はチェックマークとアクセントカラーで視覚フィードバック。設定は \`localStorage\` に永続化。

### コードめかし込み

- **\`useFilteredArticles\` のトグル・サイクラーコールバックを \`useCallback\` に統一** — \`makeFilterToggle\` / \`makeCycler\` のモジュールレベルヘルパー関数と、それらを呼び出す \`useMemo\` ブロックを廃止。各コールバックを直接 \`useCallback\` で定義するよう変更し、\`Dispatch<SetStateAction<T>>\` の型インポートも削除。動作は変わらない。
- **\`buildArticlePredicate\` の \`!isActive\` チェックを単一ブロックに集約** — \`article-filter.ts\` のフィルター述語で \`&& !isActive(a.id)\` が各条件に重複していた問題を解消。アクティブ記事のガード処理を \`if (!isActive(a.id))\` ブロックにまとめ、コードの意図を明確化。動作は変わらない。
- **\`matchesFeedId\` を分離** — \`buildArticlePredicate\` 内の特殊フィード分岐（\`if/else if\` チェーン）を \`matchesFeedId\` 関数に切り出し、述語本体のフィード絞り込みを 1 行に凝縮。カテゴリフィルターの冗長な null チェックも \`?.\` でスリム化。

### ガード固めたっ

- **\`GET /api/recommendations\` に生成クールダウンを追加** — キャッシュ失効時に並行リクエストが複数の AI / Brave Search API 呼び出しを多重実行できた問題を修正。\`recommendationsGenCooldownKey\` を新設し、30 秒のクールダウンを適用。クールダウン中は期限切れキャッシュまたは空レスポンスを返す。\`POST /api/recommendations/refresh\` の 5 分クールダウンとは独立した別キーで管理するため、リフレッシュフローは影響を受けない。

### バグ絶対キルした

- **カテゴリフィルターが特定フィード選択時に全記事を消す問題を修正** — 特定フィードを選択中にカテゴリフィルターが有効だと、選択フィードのカテゴリとフィルターが一致しない場合に記事が全件非表示になるバグを修正。ミュートフィルターと同様に全フィード表示時のみ適用するよう変更。
- **後で読むボタンにトースト通知を追加** — \`ArticleView\` の「後で読む」ボタンクリック時にトースト通知が表示されず、アクションが反映されているか分かりにくかった問題を修正。キーボード \`t\` と同様のフィードバック（「後で読むに追加」/「後で読むから削除」）を表示するようにした。

### メモっといた

- **コンテンツ抽出戦略** — \`architecture.md\` に \`extractMainContent\` の 3 段階フォールバック・画像損失チェック（20% 閾値）・\`postProcess\` パイプライン順序を記載
- **キーワードフィルタリング設計** — \`architecture.md\` に \`CompiledKeywordFilter\` の設計意図と ReDoS 対策パターンを記載
- **stale closure 回避パターン** — \`coding-conventions.md\` に \`useSyncedRef\` の使い方と主な使用箇所を記載
- **読み取り状態マージ戦略** — \`coding-conventions.md\` にローカル優先マージ・スヌーズ期限の例外処理を記載
- **ノートマージ戦略（サーバー優先）** — \`coding-conventions.md\` の「読み取り状態マージ戦略」に notes の例外規則を追記。既読・ブックマーク等はローカル優先だが、notes は同一キーではサーバー優先（\`{ ...prev, ...serverNotes }\`）。別デバイスで編集した最新版をサーバーから受け取るのが正しい挙動のため。
- **hooks JSDoc** — \`usePushNotifications\` / \`useReadingStats\` / \`useRecommendations\` / \`useUIState\` にフック説明コメントを追加

## 2026-04-09

### ガード固めたっ

- **XSS修正: RSS本文の未サニタイズ経路を塞ぐ** — \`processContent()\` / \`stripIframes()\` にサニタイズを追加。フルテキスト取得できない場合に RSS フィード直値の \`article.content\` が \`dangerouslySetInnerHTML\` へ流れる経路で \`sanitizeHtml()\` が適用されていなかった問題を修正。悪意ある RSS フィードに埋め込まれた \`<script>\` やイベントハンドラが実行される恐れがあった。

### メモっといた

- **ディレクトリインデックス更新** — \`CLAUDE.md\` と \`.claude/rules/architecture.md\` に未記載だったファイルを追記。追加した hooks: \`useAutoReset\`, \`useEventListener\`, \`useInboxProgress\`, \`useLocalStorageHistory\`, \`useReadingStats\`。追加した lib: \`export-markdown\`, \`rate-limit\`。追加した API routes: \`POST /api/ai/translate\`, \`GET /api/stats\`。

## 2026-04-08

### 激アツ新機能っ

- **カテゴリフィルター** — 記事一覧のフィルターバーに「フォルダ」ドロップダウンを追加。フィードにカテゴリが設定されている場合、カテゴリ名の一覧から選択してそのカテゴリ配下のフィードの記事だけを表示できる。アクティブなカテゴリはチップ形式で表示され、クリックで解除。フィード切り替え時は自動リセット。

- **著者フィルター** — 記事ビューの著者名をクリックするとその著者の記事だけに絞り込めるようになりました。フィルターバーに著者バッジが表示され、クリックで解除できます。フィード切り替え時は自動的にリセット。絞り込み時はトースト通知を表示。

- **メモありフィルター** — 記事一覧のフィルターバーに「✎」ボタンを追加。クリックするとメモが付いている記事だけを表示する。activeIds（選択中・猶予期間中の記事）はフィルター対象外。フィルター状態は localStorage に永続化。

- **記事リストのメモインジケーター** — メモが付いている記事に小さなペンシルアイコン（amber）を表示。compact / list / card / magazine の全レイアウトに対応。

- **フィード別未読消化率** — 読書統計モーダルに「フィード別 未読消化率」セクションを追加。未読数が多いフィードから順に最大 10 件のプログレスバーを表示し、消化済みフィードは緑ドットでインジケート。

### コードめかし込み

- **\`filterAndSortArticles\` のフィルター述語を分離** — \`buildArticlePredicate\` 関数を抽出し、フィルター述語の構築とリストへの適用を分離。\`filterAndSortArticles\` 自体が短くなり、述語ロジックが単独でテスト可能になった。

- **キーワードフィルターの正規表現を事前コンパイル** — \`CompiledKeywordFilter\` 型を導入し、\`normalizeFilter\` で正規表現キーワードを一度だけコンパイルするよう変更。従来は \`matchesKeywordFilter\` が記事ごとに \`new RegExp\` を生成していたが、フィルター設定変更時に一度だけコンパイルして使い回すようになり、フィルタリングの hot path から \`hasCatastrophicBacktracking\` チェックも排除した。\`ArticleFilterOptions.feedFilterMap\` / \`globalFilter\` の型を \`CompiledKeywordFilter\` に更新。

- **\`useEventListener\` フック抽出** — \`window\` / \`document\` へのイベントリスナー登録・解除を抽象化する \`useEventListener\` フックを追加。\`useReadState\` の \`beforeunload\` / \`visibilitychange\` リスナーを置き換え、\`useEffect\` 内の手動 \`addEventListener\` / \`removeEventListener\` ペアと deps 配列管理を不要にした。

- **\`/api/stats\` の日付リスト生成を共通化** — \`last7Days\` / \`last365Days\` のコードを \`buildDayList(n)\` ヘルパーに統合。連続活動日数計算で両ブランチが同値だった無意味な三項演算子を削除。

- **\`PATCH /api/feeds/:id\` ハンドラを簡略化** — \`category\` / \`mutedUntil\` フィールドのネストされた \`else { if (...) }\` を \`else if\` チェーンにフラット化。冗長なインラインコメントを削除。130 行 → 120 行。

### 激アツ新機能っ

- **記事への個人メモ** — 記事ビューの鉛筆アイコンからメモを追加・編集できるようになりました。メモはフォーカスを外すと自動保存され、\`localStorage\` と R2 にクロスデバイス同期されます。最大 2000 文字、最大 1000 件まで保存可能。\`Escape\` キーで編集をキャンセルできます。

### バグ絶対キルした

- **\`snoozedUntil\` のクロスデバイスマージバグを修正** — \`useReadState\` のサーバー同期処理で、スヌーズ期限のマージが \`{ ...server, ...local }\` の形式だったため、ローカルの古い値がサーバー側の新しい値を上書きしていた問題を修正。同一キーではより遅い期限を採用するようにした。

### コードめかし込み

- **\`/api/stats\` の複数パス処理を 1 パスに統合** — エントリ集計ループが 6 回に分かれていたところを単一ループで完結するよう書き直し。文字列比較で週判定を行い Date オブジェクト生成も削減。

### 激アツ新機能っ

- **読書アクティビティ ヒートマップ** — 読書統計モーダルに過去 1 年分（365 日）のカレンダーヒートマップを追加。GitHub の草グラフ風にアクティビティの濃淡を表示。セルにホバーすると日付と件数のツールチップが表示されます。API も \`yearlyHeatmap\` フィールドを返すよう拡張しました。

- **読書統計モーダル** — サイドバーフッターのグラフアイコンから「読書統計」を開けるようになりました。直近 7 日の日別アクション数バーグラフ・今週の合計・累計・連続活動日数（streak）・よく読むフィード TOP5 を表示します。既存の \`engagement.json\` を集計するため追加データ収集なしで機能します。

- **カテゴリタグクリックで記事絞り込み** — 記事本文ビューのカテゴリバッジをクリックすると、そのカテゴリ名が記事一覧の検索クエリにセットされ、同カテゴリの記事を素早く絞り込めるようになりました。フィード固有のキーワードフィルター設定画面では従来通り「除外カテゴリ追加」として動作します。

### ガード固めたっ

- **AI キャッシュの \`articleId\` に文字種バリデーション追加** — \`ai-route-helper.ts\` で \`articleId\` を英数字・ハイフン・アンダースコア（1〜128文字）のみ許可するよう検証を追加。不正な値は \`null\` として扱い、R2 キーへのパストラバーサルを防止。

### バグ絶対キルした

- **\`useFilteredArticles\` の stale closure を修正** — \`serverLoadCount\` 変化時に \`filtered.length\` を参照する \`useEffect\` が古い値を参照する可能性があった問題を修正。\`useSyncedRef(filtered)\` に切り替えて \`eslint-disable\` コメントを除去。
`;
