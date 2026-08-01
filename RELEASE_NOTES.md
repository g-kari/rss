# リリースノート 〜ギャルが読み上げるよ〜

## 2026-08-01 (latest)

### バグ修正っ

- **Turbopack の workspace root 誤推論警告を解消したよ!🔧** — dokodemo-claude モノレポ配下に clone された環境で、親側の `pnpm-lock.yaml` を Turbopack が検出しちゃって「Next.js inferred your workspace root, but it may not be correct」警告が出てた問題を修正〜🛡️ `next.config.ts` の `turbopack.root` に `import.meta.dirname` を明示指定して、dev / CI / Cloudflare CI/CD のどこでも同じ root に固定されるようになりましたわ〜✨ モジュール解決がリポジトリ外に外れるリスクもゼロに〜🎀

### リファクタリングっ + 内部品質っ

- **機械的に安全な lint warning を 5 件一掃したよ!🧹** — `pnpm check` の warning 数を 10 → 5 に半減しちゃったの〜✨ 内訳は **未使用 type import 削除** (`app/api/stats/route.ts` の `EngagementEntry`)、**silent fallback 観測性向上** (`llm-feed-generator.ts` の catch (err) を `devError` 引数に渡す canonical pattern に統一)、**`new Array()` を `Array.from()` に置換** (`concurrency.ts` の `pMap` / `gallery-masonry-layout.ts` の `columnHeights` 初期化)、**dead spec 削除** (`e2e/sanitize-dompurify.spec.ts` — dompurify 調査完了で `package.json` 削除済) の 5 件〜🎀 残り 5 warnings は intentional な URL / HTML / RSS 制御文字正規化のみで、code comment で documented 済〜🛡️

- **client component 3 files の console.error を devError canonical に統一!🧹** — `LoadMoreButton.tsx` (2 sites) / `GalleryContextMenu.tsx` (1 site) / `article-view/ShareMenu.tsx` (1 site) の合計 4 箇所で **catch + toast.error + console.error** の sibling drift を **canonical `devError` pattern** に横展開したよ〜✨ production browser console のノイズ削減 + `browser-platform.md § silent fallback の禁止` 規範遵守〜🛡️ `ErrorBoundary.tsx` の `componentDidCatch` は React error boundary の production 診断ログとして意図的に console.error を残置、`src/lib/*.ts` (`auth.ts` / `server-auth.ts` 等) は Cloudflare Workers server-side で `wrangler tail` 取得のため console.\* が canonical で対象外〜🎀

- **意図的な no-control-regex に eslint-disable-next-line 注釈を追加して lint warnings を 5 → 0 にしたよ!✨** — URL サニタイズ (`html.ts` / `xml-parser.ts:260`) / XML 1.0 仕様準拠 (`xml-parser.ts:155`) / `stripControlChars` helper (`validation.ts`) / AI prompt injection 対策 (`recommendation.ts`) の 5 site 全て **既に code comment で intent documented 済** の意図的 use を、理由付き `eslint-disable-next-line` 注釈で明示〜🎀 `pnpm check` が 0 warnings + 0 errors 状態になって、将来の真の warning が noise に埋もれる構造リスクを予防いたしましたわ〜🛡️ `recommendation.ts` は oxfmt が method chain 内 line comment 対応のため `()` wrap にリフォーム (functional behavior 変化なし)〜🌸

- **serialize-error.ts の JSDoc 順序を整えたよ!📝** — `formatError` が後追いで追加された際に、`serializeError` 用の JSDoc (Cloudflare Workers log の JSON.stringify 挙動 / cause 再帰展開の説明) が `formatError` の直前に残ってしまう drift を修正〜🎀 各 JSDoc を対応する関数の直前に再配置、機能変化なし・コメントの物理配置変更のみですわ〜🌸

### ドキュメント整備っ

- **architecture.md の article-view/ 配下 3 ファイル drift を修正したよ!📝** — tree structure から漏れていた `SelectionExcludePopup.tsx` (テキスト選択 popup) / `icons.tsx` (SVG アイコン共通) / `constants.ts` (`MENU_ITEM_CLS` ドロップダウン共通スタイル) に explicit entry を追加〜🎀 いずれも summary line の 等 で暗黙カバーされていた state で、actual file 確認 + comparative sweep で判明した drift ですわ〜🌸

- **api-spec.md の index 表に api-security.md エントリを追加したよ!📝** — `api-security.md` (認証 + 所有権チェック二段 / shared cache TTL 短縮 / dev-e2e endpoint 二重ガード) が index 表未記載だった drift を修正〜🎀 endpoint 別仕様ではなく Route Handler 実装時に参照する **横断規範** として明示的にエントリ追加、これで 9 つの `api-*.md` ファイル全てが index から辿れる状態になりましたわ〜🌸

- **cloudflare-constraints.md に `turbopack.root` 明示指定規範を codify したよ!📝** — 2026-08-01 冒頭で修正した Turbopack workspace root 誤推論警告修正の canonical pattern を新セクションとして追加〜🎀 誤推論の実害 (モジュール解決基準の外れ / 環境依存 / warning noise) + アンチパターン/修正パターンのコード例 + How to apply (`import.meta.dirname` 明示指定手順) + 反例を網羅、将来 monorepo 配下 clone 環境で同種問題に遭遇した AI/開発者が即対応できる状態になりましたわ〜🌸

- **architecture.md テストカバレッジマップの stale entry を削除!🧹** — commit `caebbc56` で `e2e/sanitize-dompurify.spec.ts` を dead spec として削除した際に、カバレッジマップ側の同期更新が漏れていた 1 件 stale entry を削除〜🎀 4 サイクル連続 sweep clean 状態で発見した真の drift、コードカバレッジマップ整合性 sweep により actual 190 files = documented 190 の完全一致に復帰〜🌸

- **rule-maintenance.md § 5 に file/spec 削除時の docs 同期義務を retrospective-codify したよ!📝** — 前サイクル発見の drift (sanitize-dompurify.spec.ts の 5 サイクル遅延) を、追加時の義務と対称の **削除時義務** として明文化〜🎀 対象 (`src/lib/*.ts` / `src/hooks/*.ts` / `src/components/**/*.tsx` / `e2e/*.spec.ts` / `src/**/*.test.ts?`) + 同期対象 3 か所 (ASCII tree + カバレッジマップ + グループ/カテゴリ表) + `find + comm -23` comparative sweep の検出方法を記述、将来の drift 累積を構造的に予防いたしましたわ〜🌸

- **architecture.md の Issue 番号 trace tag 20 件を一掃したよ!🧹** — `rule-maintenance.md § 2「ルール本文に Issue 番号タグ (#XXX) を埋め込まない」` 規範に対して、ASCII tree entries に `、#NNNN）` / `、#N / #N）` 形式で残置していた trace tag 20 件を機械的 sed で削除〜🎀 前サイクル codify を retroactive verify する過程で発見した真の drift、コード参照 (ファイルパス / 関数名) は保持しつつ trace tag のみ除去して規範遵守状態に復帰〜🌸

- **architecture.md カテゴリ分類表の `useFeed*` 件数を 10 → 11 に修正したよ!📊** — commit `da968807` (2026-07-31) で `useFeedStructuralSignature.ts` を追加した際、hook カテゴリ分類表の件数更新が漏れていた drift を発見・修正〜🎀 前サイクル codify 済 `rule-maintenance.md § 5「file/spec 追加/削除時の docs 同期義務」` を retroactive verify する過程で、8 prefix 中 useFeed のみ actual count と乖離していると判明、他 7 prefix (useArticle 20 / useReadState 8 / useAuto 4 / useGallery 4 / useTts 3 / useEngagement 3 / useCollection 2) は全て drift なしで確認済〜🌸

- **architecture.md `src/lib/*.test.ts` 件数を 13 → 16 に修正したよ!📊** — 2026-07-30〜07-31 で `log-sanitize.test.ts` / `type-guards.test.ts` / `cache-helper.test.ts` の 3 件を追加した際、L874 の件数参照更新が漏れていた drift を修正〜🎀 前々サイクル codify を retroactive verify する過程で発見した本サイクル 2 件目の count drift、他 count 参照 (src/lib 143 / その他 hooks ~68 / src/hooks test 17) は全て canonical で確認済〜🌸

- **rule-maintenance.md § 5 に「前サイクル codify の retroactive verify」canonical pattern を追加したよ!📝** — 過去 4 サイクル連続で「codify → retroactive verify → 類似 drift 発見」chain が成立した実績 (削除同期 + trace tag 20 件 + useFeed* count + `src/lib/*.test.ts` count) を retrospective-codify〜🎀 各サイクル冒頭で直近 3 サイクル codify した規範を retroactive sweep する運用手順 + 該当 drift カテゴリ 4 種実例表 + 反例 (判断要素含む規範 / 1 箇所固有 pattern) + historical snapshot は growth していても pattern 維持なら更新見送り の判断軸を明文化〜🌸

### パフォーマンス改善っ

- **globalFilter 等価ガード追加 + tsCache 早期リターン後移動で 2 件の perf drift を解消!⚡** — auditor-perf agent (confidence 85% + 88%) が発見した既存 canonical pattern からの sibling drift を修正〜🎀 **1件目**: `useReadStateSyncApply.applyServerState` で `state.globalFilter` が JSON.parse 経由で毎同期 fresh object になるにも関わらず sibling 3 field (snoozedUntil / notes / tagIds) と違って equality guard がなかった件を、`article-filter-equality.ts` に `equalKeywordFilter` 追加 + `globalFilterRef.current` で guard するように修正〜💫 これにより `useFilteredArticles.normalizedGlobalFilter` useMemo 再 compile 起源の 500+ 記事 O(N) filter が 2 秒毎に走る perf コスト (20-80ms/sync) を解消〜🛡️ **2件目**: `useFilteredArticles.ts` の `tsCache = new Map(filtered.map(...))` 構築が `hasDupes` 早期リターン前にあり、単一フィード等の重複なしケース (common case) で 500 件の `Date.parse` (~1-2.5ms) が discarded されていた件を、hasDupes 早期リターン後に 1 行 reorder〜🎀 読書中 5-30 executions/min で ~5-75ms/分の waste を解消いたしましたわ〜🌸

- **article-list-body/index.ts barrel から `GalleryItemCtx` value dead re-export を削除 (type-only 化)!🧹** — auditor-simplify agent 7 回目派遣 (前 a11y 7th と同 `article-list-body/*` を simplify 観点で新規 audit、confidence 88%) が発見した dead export を修正〜🎀 `GalleryItemCtx` value re-export の consumer が **cross-file 0 件** (`GalleryBody.tsx:12` + `GalleryCardRenderer.tsx:8` は path `./gallery-context` 経由直接 import、`ArticleList.tsx:50-52` は type `GalleryItemContextValue` + `FlatItem` のみ barrel import) の状態を、`export { type GalleryItemContextValue }` に変更で type-only 化〜💫 「Context は intentionally scoped to this directory」JSDoc 意図 (外部 Providers 不許可 design) と barrel export の integrity 整合、`issue-handling.md § dead export 監査 派生サブケース「same-file internal caller 個別 grep verify」` canonical 適用で cross-file caller 0 + type 参照のみで value drop safe と確認〜🛡️ touch 1 file / 1 line 変更、機能変化ゼロ (import path 経由 value 使用継続、barrel type export は保持)、`rule-maintenance.md § 派生「同サイクル起票 案 B 現状維持系」条件 5 免除` canonical 完全該当ですわ〜🌸 Finding 2 (useArticleListItemProps に deletingIds/newIds 集約で 5 caller の 2 引数重複解消、touch 6 file で AI 自走 5 条件境界超過) は次サイクル自走着手候補として記録〜✨

- **CompactListBody date section header の role="separator" 誤用を role="heading" aria-level=3 に修正 (WCAG 1.3.1 + 4.1.2 準拠)!⌨️** — auditor-a11y agent 7 回目派遣 (未 audit `article-list-body/*` 8 sub-components 新規 target 化、confidence 87%) が発見した WAI-ARIA pattern mismatch を修正〜🎀 CompactListBody.tsx:45 の date group header (「今日」「昨日」等) が `role="separator" aria-label={item.label}` を使用していた drift、codebase の他 3 sites (`ColumnResizeHandles.tsx:76,93` / `ArticleDetailOverlay.tsx:133`) は全て **actual resize handle** (interactive splitter with `aria-valuenow` + `aria-orientation` + `tabIndex={0}`) 用途 canonical と乖離〜💫 WAI-ARIA `separator` role は divider (< hr > analogous) で section label でない、NVDA/JAWS が「separator, 今日」と misleading announce + heading rotor (H キー) で date section navigation 不可能な状態を、`role="heading" aria-level={3}` (aria-label は visible span text から derive で削除) に変更で解消〜🛡️ `role="feed"` (親 ArticleList.tsx:710) content model で logical navigation 復旧、WCAG 1.3.1 (Info and Relationships) + 4.1.2 (Name, Role, Value) 準拠、visual 変化ゼロ (semantic 変化のみ、AT announcement + heading rotor navigation 改善)〜✨ 他 7 sub-components (CardBody / MagazineBody / GalleryBody / VirtualRow / GalleryCardRenderer / gallery-context / types) は canonical 完全準拠 audit clean で確認いたしましたわ〜🌸

- **DATE_RANGE_LABELS 重複による pill tooltip UX bug を canonical 統一で解消!🧹** — auditor-simplify agent 6 回目派遣 (前 a11y 6th と同 `article-list-header/*` 8 sub-components を simplify 観点で新規 audit、confidence 92%) が発見した silent UX regression + drift を修正〜🎀 `DATE_RANGE_LABELS` が **2 file で重複定義** + `all` key のみ divergent (`article-utils.ts:178` canonical: `"全期間"` vs `constants.ts:11` drift: `"日付"`) の状態、FilterPills.tsx pill tooltip が **`"日付フィルター切替: 日付 (d)"`** (redundant/confusing) を表示していた actual UX bug を解消〜💫 canonical (`article-utils.ts`) は既に `shortcuts.ts` toast (`"日付フィルター: 全期間"`) で使用済、`READING_TIME_RANGE_LABELS` と同じ import pattern で FilterPills.tsx から参照統一〜🛡️ `constants.ts` から drift `DATE_RANGE_LABELS` 削除 + `DateRange` type import (他 export で未使用) も cleanup、canonical single source of truth 復帰で **tooltip が canonical `"日付フィルター切替: 全期間 (d)"`** に修正、`helper-drift.md § 同名 enum / type の重複は canonical alias 統合` の constants 拡張適用いたしましたわ〜🌸 Finding 2 (2 site 重複 FilterChipClearButton helper 化) は canonical 閾値 (3+ sites) 未達で `code-simplifier` skill 「premature abstraction 防止」canonical で見送り、将来 3 site 発生時対応候補として記録〜✨

- **CategoryFilter menu-trigger button の touch target 順序 + lg: clauses を SortButton canonical に統一!📝** — code-reviewer agent 7 回目派遣 (前サイクル `b9997835` a11y 修正の adversarial verification) が Minor observation として指摘した「2 canonicals disagree in codebase」を解消〜🎀 CategoryFilter.tsx:67 menu-trigger button の `max-md:min-h-[44px] max-md:min-w-[44px]` (h-first + no `lg:` clauses) を、SortButton.tsx:23 canonical (`max-md:min-w-[44px] max-md:min-h-[44px] lg:min-w-[24px] lg:min-h-[24px]` = w-first + `lg:` clauses) に完全 mirror 統一〜💫 前 commit `b9997835` で新規追加 5 button が SortButton canonical (w-first + `lg:`) 従った結果、既存 CategoryFilter menu-trigger (h-first + no `lg:`) と 2 canonical disagree 状態が発生していた drift を、機能変化ゼロ (visual + behavior 完全同一) + touch 1 file / 1 行変更で解消〜🛡️ 将来 sibling drift sweep で「canonical disagree」false positive 検出リスクを予防、article-list-header/ 全 button の canonical order を完全統一いたしましたわ〜🌸

- **article-list-header 5 button に touch target 44px 二重指定を統一 (WCAG 2.5.5 / 2.5.8 準拠)!⌨️** — auditor-a11y agent 6 回目派遣 (未 audit `article-list-header/*` 8 sub-components 新規 target 化、confidence 92% + 88%) が発見した 2 findings を修正〜🎀 **Finding 1**: FilterPills.tsx の 3 button (author clear L206 / globalFilter toggle L233 / reset all L258) + CategoryFilter.tsx の category clear button (L39) の計 **4 button** が `px-2 py-0.5` / `px-2 h-6` で mobile 24px 未達、canonical (`SortButton.tsx:23` / `CategoryFilter.tsx:67` menu-trigger branch) から drift〜💫 **Finding 2**: MarkAllReadButton.tsx の confirm branch (L36) が `h-6` で mobile min-size なし、同 file non-confirm branch (L37) は既に canonical 適用済 = 「destructive confirmation tap が smallest target」の UX 標準 inversion (「confirm-larger-than-trigger」pattern を破壊)〜💫 全 5 button に canonical `max-md:min-w-[44px] max-md:min-h-[44px] lg:min-w-[24px] lg:min-h-[24px]` append で WCAG 2.5.5 (Target Size) / 2.5.8 (Target Size Minimum) 準拠、mobile ユーザーの mis-taps + destructive action の tap 精度低下 (motor-impaired ユーザー特に影響) を構造的解消〜🛡️ 他 sub-components (index.tsx / LayoutSwitcher / FilterPillButton / SortButton / SearchBar) は canonical 完全準拠で audit clean 判定、touch 3 files で完結いたしましたわ〜🌸

- **FeedContextMenu の menuitemradio + section-header 7 site 重複を helper 集約!🧹** — auditor-simplify agent 5 回目派遣 (前 a11y 5th と同 target 10 files を **simplify 観点** で新規 audit、confidence 92%) が発見した canonical drift を修正〜🎀 FeedContextMenu.tsx で `menuitemradio` + dot-indicator button (15 line pattern) が 3 site (`ViewMenuPortal` / `DigestMenuPortal` / `GroupMenuPortal` の groups.map 内) + section-header wrapper (3 line pattern) が 4 site (`MuteMenuPortal` / `ViewMenuPortal` / `DigestMenuPortal` / `GroupMenuPortal`) の計 7 site 同形重複していた canonical drift を解消〜💫 `MenuSectionHeader.tsx` + `MenuRadioOption.tsx` の 2 co-located helper を新規追加 (`src/components/feed-item/` に `ContextMenuShell.tsx` の adjacent 配置)、7 site を helper 経由に置換で FeedContextMenu.tsx を net ~40 行削減〜🛡️ `react-component-split.md § 派生ケース「同形 JSX ラッパーが 3 回以上重複 → ポリモーフィック as props 付きラッパーコンポーネント化」` の canonical 適用、将来 radio menu 追加時の drift (`aria-checked` wiring / `!current` guard / `stopPropagation` / dot indicator class) を構造的予防〜✨ 「グループなし」button (X icon + `disabled` prop) は別 pattern で MenuRadioOption 対象外・独立維持 canonical、機能変化ゼロ (JSX helper extract、visual + behavior 完全同一) + 前 a11y 5th の aria-expanded 修正と組合せて **feed-item 系 corpus が simplify + a11y 両観点で clean 状態**に到達いたしましたわ〜🌸

- **FeedItemComponent の ⋮ button aria-expanded / aria-controls state lockstep 統一で WCAG 4.1.2 準拠!⌨️** — auditor-a11y agent 5 回目派遣 (未 audit 領域 `feed-sidebar/` + `feed-item/` sub-components 10 件を新規 target 化、confidence 85%) が発見した canonical drift を修正〜🎀 FeedItemComponent の ⋮ button で `aria-expanded={menuOpen}` (1 state のみ) と `aria-controls={menuOpen || muteOpen || viewOpen || digestOpen || groupOpen ? menuId : undefined}` (5 state OR) が乖離していた canonical drift を、`aria-expanded` を 5 state OR に統一で lockstep 化〜💫 canonical (`SidebarFooter.tsx:225-227` の 1 state lockstep pattern) と同 semantic 準拠、`#1194` の shared-trigger 設計意図 (「⋮ button は 5 portal (main / mute / view / digest / group) の共有 root trigger」) に整合〜🛡️ menuOpen が false で submenu (Mute / View / Digest / Group) が open のとき、AT が「collapsed」と announce しつつ portal 内 submenu が visibly open な状態 = WCAG 4.1.2 (Name, Role, Value) 違反 + assistive tech の state-change 通知漏れ (submenu open event miss) を構造的解消〜✨ 他 9 files (index / FeedGroupsSection / CategorySection / TagsSection / CollectionsSection / SidebarHeader / SidebarFooter / feed-item/index / FeedContextMenu) は canonical 完全準拠で audit clean 判定、touch 1 file / 1 行 で完結いたしましたわ〜🌸

- **SaveUrlModal で URL input を初期 focus に + ReleaseNotesModal の heading hierarchy 修正で 2 件 a11y drift 解消!⌨️** — auditor-a11y agent 4 回目派遣 (未 audit modal 群 6 件を新規 target 化、confidence 90% + 85%) が発見した 2 finding を修正〜🎀 **Finding 1** (SaveUrlModal): `autoFocus` が Modal.tsx の `useModalFocusTrap` default (first focusable = close ボタン) で silent override される問題を、Modal.tsx に `initialFocusRef?` prop 追加 (`useModalFocusTrap` は line 20 で既 support、type import + Props 定義 + forward の 3 箇所修正) + `urlInputRef` 作成で解消〜💫 WCAG 2.4.3 (Focus Order) 準拠 + キーボードユーザーが Modal open 直後に Tab なしで直接 URL 入力可能に、canonical (`ConfirmModal.tsx:45` の `cancelRef` + `initialFocusRef`) 統一〜🛡️ **Finding 2** (ReleaseNotesModal): dialog title `<h2>` 内で `parseMarkdown` が `# ` → `<h1>` を emit していた heading hierarchy 逆順問題を、全 heading tag を 1 段 shift down (`# ` → `<h3>` / `## ` → `<h4>` / `### ` → `<h5>`) で修正〜💫 className は視覚 style として保持 (visual 変化ゼロ、semantic tag のみ変化)、WCAG 1.3.1 (Info and Relationships) 準拠 + screen-reader rotor 見出しナビの正しい順序に〜🛡️ 他 4 modal (`SnoozeModal` / `KeyboardShortcutsModal` / `SessionExpiredModal` / `FeedFilterModal`) は全て Modal.tsx canonical wrap または独立で canonical 準拠済で audit clean 判定、agent の Modal.tsx canonical propagation 分析で corpus 全体の a11y 健全性を独立確認いたしましたわ〜🌸

- **architecture.md L454 に `equalKeywordFilter` 追加で export 列挙 drift を解消!📝** — docs-drift-detector agent 2 回目派遣 (confidence 95%、前 1st から 5 サイクル経過 + 直近多数の refactor 累積) が発見した唯一の drift を修正〜🎀 前サイクル perf 修正 (commit `71b6920a`) で `article-filter-equality.ts` に `equalKeywordFilter` を追加した際、architecture.md L454 の export 列挙 (5 exports 記載: `equalDigestLimitMap` / `equalStringMap` / `equalCompiledFilterMap` / `equalStringSet` / `equalViewFeedIds`) への同期更新が漏れていた drift を発見・修正〜💫 前サイクル codify `rule-maintenance.md § 5「新規 lib helper 追加時の docs 同期義務」` を retroactive verify する過程で count drift でなく **export 列挙 drift** として捕捉、他 axes (src/lib 144 / src/hooks 123 / useArticle* 20 / useReadState* 8 / useFeed* 11 / src/lib/_.test.ts 16 / src/hooks/_.test.ts+.tsx 17 / e2e/*.spec.ts 154 / coverage map .tsx entries 3) は全て clean と 4 axes verification で確認〜🛡️ 「codify → 次サイクル retroactive verify → 類似 drift 発見」chain の 6 サイクル連続実証、機能変化ゼロ・touch 1 file / 1 行修正で完結ですわ〜🌸

- **GalleryCardRenderer.tsx handleRetry の eslint-disable-next-line comment placement を canonical mirror に統一!📝** — code-reviewer agent 3 回目派遣 (adversarial verification、直近 2 サイクル修正 `f6b6c8d8` shared.tsx private 化 + `6138db55` handleRetry useCallback の refutation 試行) が「両 commit correct、cosmetic style drift のみ」と 0 findings 判定した R2e observation を反映〜🎀 新規 `handleRetry` (line 81-86) が `// eslint-disable-next-line` を callback body 内配置していた drift を、canonical `handleTouchStart` (line 48-65) と同じく **callback body 外 + deps array 前** に配置に統一〜💫 oxfmt が multi-line arrow に自動整形 (`useCallback(\n  () => {...},\n  // comment\n  [ctx],\n)`) してくれるので、canonical と完全 mirror な形に collapse〜🛡️ 機能変化ゼロ・cosmetic sibling consistency 向上のみ、将来 sweep で「comment placement drift」シグナルとして検出されるリスクを予防いたしましたわ〜🌸

- **GalleryCardRenderer.tsx の onRetry inline arrow を useCallback に統一して memo boundary の破綻を解消!⚡** — auditor-perf agent 3 回目派遣 (confidence 88%、前 a11y agent 3rd recommendation で示された未 audit 領域 `AppOverlays.tsx` + `GalleryCardRenderer.tsx` を perf 観点で audit) が発見した hot path 最適化を修正〜🎀 `<GalleryArticleItem memo>` に渡す `onRetry={() => ctx.galleryRetryArticle(article.id)}` inline arrow が毎 render で新 reference になり、j/k navigation / bulk marking で `GalleryItemCtx` identity 変化のたびに visible 30-60 card 全部の memo が破綻して full re-render が cascade する drift を解消〜💫 同 file 内の canonical `handleTouchStart` pattern (`articleRef.current` + `useCallback([ctx])` + `useSyncedRef` 経由) を mirror して `handleRetry` を追加、`onRetry={handleRetry}` に置換で identity 安定化〜🛡️ file docstring 明記の「memo でラップしておかないと virtualizer 側の再計算で全カードが再レンダーされてチカチカする」目的を守る canonical 適用、`AppOverlays.tsx` は memo child ゼロで audit clean と判明 (parent re-render で全 11 children が既に再描画される設計、memo 追加は別 scope)、touch 1 file / 9 line 追加ですわ〜🌸

- **getDateGroupLabel 境界事前計算 + loadProgress module cache で 2 件目の perf drift を解消!⚡** — auditor-perf agent (confidence 88% + 82%) 2 回目派遣 (component + orchestrator hook 対象) が発見した hot path 最適化を修正〜🎀 **1件目**: `ArticleList.tsx flatItems` useMemo で 記事ごとに `getDateGroupLabel` を呼び 4 boundary Date (today/yesterday/week/month start) を毎回生成していた件を、`computeDateGroupBoundaries()` で 1 回計算 + `classifyDateGroup(publishedAt, boundaries)` で Date.parse + integer 比較に置換〜💫 50-500 記事で ~250-2,500 Date allocations/rebuild と ~1-3ms main-thread waste + GC pressure を解消〜🛡️ **2件目**: `useReadingProgress.loadProgress` が `useArticleListItemProps.progressMap` の j/k spam + unreadOnly hot path で 300-500 記事 × sync localStorage read + JSON parse を rebuild 毎に走らせて 3-15ms/keystroke の block 発生していた件を、module-level `progressCache` Map で cache 化 (sole writer `saveProgress` で同期更新)〜🎀 累計 4 件の perf drift を 2 サイクルで解消いたしましたわ〜🌸

### a11y 改善っ

- **TagEditor 編集モード終了 + タグ削除時の focus 復元 (WCAG 2.4.3)!⌨️** — auditor-a11y agent (confidence 85%) が発見した focus loss を修正〜🎀 編集モード終了 (Enter / Escape / blur) 時に `<input>` unmount → `<button>` remount するが focus 復元されず document.body に落ちる件 + × ボタンクリックでタグ削除時に × 自体が unmount → 同様の focus loss を解消しちゃったの〜✨ `addButtonRef` (「+ タグ」ボタン) + `useEffect` で editing 遷移監視 + × onClick で unmount 前に focus 移動、canonical pattern (`react-patterns.md § usePortalMenu` / `SnoozeMenu.tsx`) と整合〜🛡️ キーボードユーザーが記事ヘッダー内で位置を失って Tab やり直しになる WCAG 2.4.3 (Focus Order) 違反が構造的に解消いたしましたわ〜🌸

- **FeedDetailModal Push トグルを canonical ToggleSwitch に統一 (WCAG 2.5.8)!⌨️** — auditor-a11y agent 2 回目派遣 (confidence 88%) が発見した inline switch drift を修正〜🎀 FeedDetailModal に h-5 w-9 (20×36 px) で inline 実装されていた `<button role="switch">` を、user-settings/shared.tsx の canonical `<ToggleSwitch>` (h-6 w-11 = 24×44 px) に置換 + `disabled` prop を canonical に追加 (pushLoading 一時無効化用)〜💫 20 px 高が WCAG 2.5.8 (Level AA, Target Size Minimum) の 24×24 px フロアを下回っていた違反を解消、settings 内の他 switch と統一されて低視力 / モバイルタッチユーザーに友好な 24×44 px タッチターゲットに〜🛡️ 既存 3 caller (AutoReadSection / AiNotificationTabPanel / ImageDlSection) への影響ゼロで sibling drift 解消完了ですわ〜🌸

- **readNormalizedReadState canonical helper で 6 sites の helper-drift を解消!🧹** — auditor-simplify agent 2 回目派遣 (confidence 92%) が発見した helper-drift を修正〜🎀 `articles/route.ts` (4 sites) + `read-state/route.ts` (2 sites) で `r2Get<Partial<ReadState>>(rssData, readStateKey(userId), {}).then(normalizeReadState)` を inline 実装していた重複を、`src/lib/read-state-merge.ts` に canonical `readNormalizedReadState(rssData, userId)` helper を追加して 6 sites 全て 1 行呼出しに置換〜💫 将来 per-request cache / schema versioning / migration を追加する場合の 6 sites 同期修正リスクを構造的解消、副次効果として 3 個の未使用 import (`normalizeReadState` / `readStateKey` / `r2Get` / `ReadState` type) が削除できましたわ〜🌸

- **user-settings/shared.tsx の module-internal 3 export を private 化 (dead export 解消)!🧹** — auditor-simplify agent 3 回目派遣 (confidence 92%、article-view sub-components とは異なる新規領域 `user-settings/*TabPanel.tsx` group を audit) が発見した dead export を修正〜🎀 `CONTENT_WIDTH_PREVIEW_PCT` / `PREVIEW_TEXT` / `SegmentOption<T>` の 3 export が shared.tsx 内 (`PreviewArea` / `SegmentGroup`) でのみ consume されており cross-file caller 0 件の状態を、`export` keyword 削除で module-private 化〜💫 「public 使用向けである」誤ったシグナルを消して、`PREVIEW_TEXT` (Japanese preview copy「吾輩は猫である」) を将来編集する際に「外部 consumer が居ないか」を毎回 grep 確認する認知負荷を解消〜🛡️ `issue-handling.md § dead export 監査 派生サブケース「same-file internal caller」判定` の canonical 適用 (`TTL_OPTIONS` は `ImageDlSection` から cross-file 使用済で export 維持、agent 判定通り 3 exports のみ)、touch 1 file / 3 line / consumer 変更ゼロですわ〜🌸

### ドキュメント整備っ

- **TagEditor useEffect の MAX 到達境界ケース注記追加!📝** — 前サイクル a11y 修正 (`ff9e13bc`) の code-reviewer verify で発見された minor observation を反映〜🎀 useEffect 経路 (MAX-1 個 → commit で MAX 到達 → addButton unmount) にも × onClick と対称の境界ケースがあることを JSDoc に明記して、boundary 条件が両経路で対称化されている旨を可視化いたしましたわ〜🌸

### セキュリティ対策っ

- **sharp を 0.34.5 → 0.35.3 に bump して libvips 継承脆弱性を解消したよ!🔒** — Dependabot alert #50 (high severity) 対応〜🛡️ libvips 由来の 4 CVE (`CVE-2026-33327` / `CVE-2026-33328` / `CVE-2026-35590` / `CVE-2026-35591`) を一掃しちゃったの〜✨ `pnpm.overrides` に `"sharp": ">=0.35.0"` を追加して transitive dep (next / wrangler+miniflare 経由) 全経路を 0.35.3 に統一〜🎀 sharp は dev-only 依存で production runtime (Cloudflare Workers) に bundle されず (本 repo は Cloudflare Images = `ImagesBinding` を使用)、実質的な exploit 経路はないけど security alert 解消 + transitive dep hygiene の観点で対応いたしましたわ〜🌸

## 2026-07-31

### 激アツ新機能っ

- **検索・エクスポートまわりが一気に強化されたよ!🔍📤** — `GET /api/articles` に `q=` **サーバーサイド全文検索**を追加 (#908)、全文検索に `tag:` フィールドも足したので「タグで絞って本文検索」ができるようになったよ〜🎀 エクスポートも大幅増強で、**ブックマーク/後で読むの JSON** (#1110)、**メモの JSON** (#1111)、**コレクションの Markdown/JSON** (#1112) が出せるようになりましたわ〜📦
- **記事の一括操作 (bulk action) がついに来たよ!⚡** — Shift+クリックで範囲選択して、**一括ブックマーク・スヌーズ・タグ付け・後で読む**がまとめてできるようになったの〜🎀 選択中は下部に `BulkActionToolbar` が出てくるよ〜✨ (#883 Phase A/B, #931)
- **テーマプリセット + Bookmark snapshot コレクション!🎨💾** — 「ダーク + serif + サイズ大 + 行間広め」みたいな設定の組み合わせを名前付きで保存・呼び出しできるようになったよ〜🌸 ブックマーク全件を snapshot としてコレクションに一括追加する導線も追加〜📚 (#877 #878)
- **並び替えの軸が増えたよ!📊** — コレクションの sort 軸 4 種 (#874 候補 1) と、記事の**読了時間順** sort (#874 候補 2) を追加〜⏱️

### UX 改善っ

- **記事本文に「先頭へ戻る」FAB を追加!⬆️** — 長い記事を読んでいるときに、進捗 30% 超 + TTS 非再生時だけそっと出てくる控えめな FAB だよ〜🎀 (#1149)
- **テキスト選択メニューに「選択語で検索」を追加!🔎** — 本文中の気になる単語を選択 → そのまま検索できるようになったの〜✨ (#1148)
- **記事コンテキストメニューからスヌーズできるように!😴** — 既存の SnoozeModal をそのまま活用してるので操作感も揃ってるよ〜 (#933)
- **記事一覧に読書進捗バーを表示!📖** — どこまで読んだかが一覧からひと目で分かるようになったよ〜🎀 (#932)
- **サイドバーに今日の読了数 / 週間目標のミニバッジ!🎯** — 毎日の読書量が可視化されてモチベ上がるやつ〜💪 (#937)
- **記事詳細に出典元フィード名を表示 + 印刷ボタン追加!🖨️** — どのフィードの記事か分かりやすくなって、印刷もワンクリック〜 (#918 #919)
- **メニューを「押したまま外にドラッグ → 離す」で誤って閉じなくなったよ!🖱️** — 記事本文やライトボックス画像をテキスト選択しようとしてドラッグすると意図せず閉じちゃう問題を解消〜🛡️ backdrop の判定を `onPointerDown` canonical に統一しましたわ〜 (#1259 #1199)
- **クリップボード操作のキャンセルで「失敗しました」が出なくなったよ!📋** — permission ダイアログを閉じただけなのにエラー扱いされていた偽陽性を、`AbortError` 判別で解消〜✨ (#1220 #1221 #1229 #1234 #1237)

### a11y 改善っ

- **タッチターゲット 44px 対応を全画面に横展開!📱** — WCAG 2.5.5 (モバイル 44px) + 2.5.8 (デスクトップ 24px) の二重指定を、サイドバー・記事ヘッダー・モーダル・トースト・コンテキストメニューの **アイコンボタン 35+ 箇所** に一括適用したよ〜🎀 スマホでの誤タップがぐっと減りますわ〜🌸 (#1142 #1159 #1160 #1161 #1215 #1226 #1235 #1236 #1253 #1255 #1266 #1267 #1270 #1272 #1285 #1288)
- **スクリーンリーダー対応を大幅強化!🔊** — 装飾 SVG への `aria-hidden` 一括付与、エラー表示への `role="alert"`、入力欄への accessible name (sr-only label / `aria-label`)、disclosure ボタンへの `aria-expanded` + `aria-controls` 3 点セット、排他選択メニューの `menuitemradio` + `aria-checked` などを横断的に整備〜🛡️ (#1206 #1209 #1213 #1219 #1239 #1240 #1243 #1247 #1250 #1251 #1256 #1262 #1263 #1264 #1273 #1284 #1293 #1294 #1295)
- **キーボード操作でメニューを閉じたときのフォーカス迷子を解消!⌨️** — menuitem クリック / Escape / 背景クリックの**全経路**でトリガーボタンにフォーカスが戻るようになったよ〜🎀 セグメントボタンの矢印キー操作でもフォーカスが追従するようになりましたわ〜 (WCAG 2.4.3 / 2.4.7、#1193 #1203 #1210 #1223 #1231 #1248 #1274)
- **landmark 構造を整理!🏛️** — `<main>` が 2 個あった問題や、`<aside role="navigation">` のような role 上書きを是正して、スクリーンリーダーの landmark 一覧が正確になったよ〜 (#1207 #1225)
- **ダークモードのコントラスト比を WCAG AA に修正!🌙** — `text-text-faint` が暗すぎて読みにくかったのを改善〜 (#926)

### バグ修正っ

- **記事が消える・重複する系のバグを一掃!🐛** — Atom の `<id>` 欠落 entry で記事が collapse する問題 (#1116)、RSS 2.0 の `dc:date` / `dc:creator` fallback 不足で日付・著者が消える問題 (#1117 #1118) を修正〜🛡️
- **同期まわりの競合を修正!🔄** — 既読状態の並行 flush で ID が重複混入する問題 (#1124)、エンゲージメント記録の lost-update (#1125)、メモ編集が flush 中に巻き戻る問題 (#1113)、メモ削除がサーバー同期で復活する問題 (#1084) を解消〜✨
- **記事を切り替えたときに前の記事の結果が残る問題を修正!📄** — AI 要約 / 全文取得の非同期処理に abort recheck を追加して、stale な結果やエラーが新しい記事に漏れないようにしたよ〜 (#1115 ほか)
- **Piper TTS の一時停止・再開が効くようになったよ!⏸️▶️** — (#1114)
- **OGP 画像まわりの改善!🖼️** — 一覧と詳細で画像が食い違う問題の再配線 (#1088) と、キャッシュ破棄を FIFO から true-LRU に修正〜
- **その他** — テキスト選択ポップアップの画面外はみ出し (#1089)、Obsidian エクスポートの YAML 改行破損 (#1126)、`Invalid Date` 表示 (#1122)、画像 `max-width` の破壊 (#1120)、ReDoS ガード強化 (#1119)、エラー通知の disabledFeeds 漏れ (#1123) など

### デザインシステム改善っ

- **raw Tailwind palette の semantic token 化が完走したよ!🎨✨** — 直書きされてた Tailwind の色をぜんぶ semantic token に切り出して、`coding-conventions.md` の「16 進数カラー禁止」規範を満たしたよ〜🎀 4 段階に分けて進めたの〜📦
  - **Phase 1**: トースト (`toast-success` / `toast-error` / `toast-undo`)
  - **Phase 2**: メモ indicator (`memo`) / いいね (`like`)
  - **Phase 3**: 破壊的アクション button (`action-danger` / `action-danger-hover`) / 入力エラー border (`border-error`)
  - **Phase 4**: スター付き (`feed-star`) / ミュート (`feed-mute`) / error hover (`error-hover`) / コレクション所属 indicator (`collection-indicator`)

  ぜんぶ **既存の色値をそのまま移設**してるから見た目は 1px も変わってないよ〜🛡️ これでテーマまわりを触るときに 1 箇所直せば全部に効くようになりましたわ〜🌸 (#1169)

### リファクタリングっ + 内部品質っ

- **canonical helper への集約を大規模に実施!🧹** — `isPlainObject` (14 site)、`sanitizeLogUrl` (6 site)、`RSS_USER_AGENT` (5 site)、X/Twitter ホスト定義 (3 箇所)、feeds signature の memo 化 (5 site) などの重複を canonical に統合〜📦
- **観測性 (observability) を強化!🔍** — 本番で原因不明だった silent fallback 20+ 箇所に `devError` / `console.error` を追加して、`wrangler tail` や DevTools から失敗理由を追えるようにしたよ〜🛡️
- **dead export を整理!✂️** — hook 戻り値型 32 件の `export` keyword を削除、spec 直参照のものは `@internal` JSDoc で意図を明示して監査の再検出を防止〜
- **ローカル開発環境の詰まりを解消!🔧** — `next dev` では `caches` global が未定義で Cache API 経由の Route Handler (`/api/feeds` `/api/articles` `/api/content` `/api/ogp`) がまるごと 500 を返していた既知問題を、`cache-helper.ts` 側のガードで根本解消〜🛡️ 未提供環境では cache bypass に倒れるようになったので、ローカルでも記事とフィードがふつうに読めるようになりましたわ〜✨ e2e で skip されていたキャッシュ経路の spec も実 pass に昇格〜🎀

## 2026-05-25

### リファクタリングっ + パフォーマンス改善っ

- **#822 #773 Phase 3 完了 — masonic dependency 完全削除で bundle size 削減!📦** — ギャラリービュー scroll 巻き戻り問題 (#773) を完全解決した自前 virtualizer (`GalleryMasonrySelf`) を default 経路に昇格〜🎀 `gallerySelfMasonryEnabled` テストモード設定 + `<GalleryMasonryMasonic>` (旧 masonic ベース) 経路 + `masonic` npm dependency をすべて削除しちゃったよ〜✨ 全ユーザーが自前 virtualizer 経路で動作するようになり、bundle から `masonic@^4.1.0` (約 30+ 関連 transitive 依存) が完全除去〜📊 `<GalleryMasonry>` は外部 caller との後方互換のため `GalleryMasonrySelf` を呼ぶ thin wrapper として残置〜🛡️ Phase 2c の検証期間で本番動作確認済、`gallerySelfMasonryEnabled` localStorage key も削除〜🌸 (テストモード segregation 4 段階規範の完了サイクル)

### a11y 改善っ

- **#835 SelectionExcludePopup の keyboard navigation + ARIA 改善!⌨️🎀** — テキスト選択時に出る「引用をコピー」「除外」popup に WCAG AA 準拠の keyboard 対応を追加しちゃったよ〜✨ `role="dialog"` + `aria-label="テキスト選択メニュー"` で SR ユーザーに popup 出現を通知、popup 出現時に先頭ボタンへ自動 focus (preventScroll で text selection 解除リスク軽減)、Escape で close + selection 維持、`focus-visible:ring-2 focus-visible:ring-ink` で keyboard focus 視覚化、元 element への return focus 復元〜🛡️ keyboard 専用ユーザーが popup の機能を完全に使えるようになりましたわ〜🌸

### UX 改善っ

- **#817 Phase 2 記事本文 flash 抑止 — OGP/link preview の遅延ロードを CSS で視覚的緩和!✨** — Phase 1 (`b0ac3219`) で element type 切替由来の re-mount を構造的に解決した続編〜🎀 Phase 2 では `app/globals.css` の `.article-content` に `will-change: contents` + `.ogp-link-preview-image` への 180ms フェードイン animation を追加しちゃったよ〜💫 後から DOM に挿入される OGP / link preview 画像の「ガクッと現れる」感が視覚的に緩和されますわ〜🌸

### デザインシステム改善っ

- **#837 FeedHealth/FeedDetail の status color を semantic token 化!🎨💖** — `app/globals.css` に 4 status token (`--color-status-error` / `--color-status-warning` / `--color-status-oversized` / `--color-status-ok`) を light + dark 両対応で新規定義したよ〜✨ `FeedHealthModal` / `FeedDetailModal` の raw Tailwind palette (`bg-rose-400` / `bg-amber-400` 等) を `bg-status-error` / `bg-status-warning` 等の semantic class に全置換〜🎀 WCAG AA コントラスト比 (light 4.5-4.7:1 on stone-50、dark 4.6-5.4:1 on zinc-950) も担保、テーマ切替で status 色が自動追従〜🛡️ (design-system.md 規範整合)

### 激アツ新機能っ (基盤実装)

- **#818 gallery masonry layout に aspectRatio 補正実装!📐✨** — `src/lib/gallery-masonry-layout.ts` の `computeColumnHeights` / `computeMasonryLayout` に **optional `columnWidth` parameter** を追加、`(columnWidth / item.width) * item.height` で column 幅に fit した height を計算する aspectRatio 補正アルゴリズムを実装しちゃったよ〜🎀 縦長・横長画像の混在時に column バランスが取れるようになる基盤、defensive (width 0/負値/NaN/Infinity 全網羅)、12 新規 TDD spec で動作固定〜🛡️ caller (`GalleryMasonrySelf`) で画像 natural width / height を items に渡す UI 統合経路は次 Phase で別 Issue 化予定〜🌸

## 2026-05-12

### 激アツ新機能っ

- **#761 Piper engine に メラちゃん voice (Kizuna Intelligence) を追加!💖** — Kizuna Intelligence の看板キャラクター **メラちゃん** の合成音声モデル (`kizuna-intelligence/piper-plus-mera-multilingual`) を選択肢に追加〜🎀 設定モーダル → 表示 → 読み上げ音声 → ボイスから「メラちゃん (Kizuna Intelligence)」を選んで使えるよ〜🎙️ piper-plus 完全互換 + 6 言語対応 (ja/en/zh/es/fr/pt) + Apache 2.0 ライセンスで商用利用も OK〜📜 つくよみちゃんと並んで 2 種類のかわいい voice が選べるようになりましたわ〜🌸 (HuggingFace モデル: <https://huggingface.co/kizuna-intelligence/piper-plus-mera-multilingual>)
- **#761 つくよみちゃん voice で日本語自然読み上げ実装!🎙️✨** — Piper TTS engine の library を `piper-plus@0.6.0` (8 言語 + OpenJTalk 内蔵 / MIT) に置き換えて、ついに **つくよみちゃん voice (CV.夢前黎)** で記事を日本語自然読み上げできるようになったよ〜🎀 配信戦略は voice / WASM で使い分け: **piper-plus Rust phonemizer WASM (60 MiB)** は Cloudflare R2 セルフホスト (`/api/wasm/[file]`) で Workers 25 MiB 上限を回避、**voice モデル (`ayousanz/piper-plus-tsukuyomi-chan`)** は piper-plus の standard path に従って **HuggingFace から直接 fetch** (CSP `connect-src huggingface.co` は #760 で許可済)〜📦 初回再生時にブラウザにキャッシュされて 2 回目以降は瞬時〜⚡ Next.js 16 Turbopack の static analyzer が library 内部の `await import(url)` を解決できない問題は **`pnpm patch` で `new Function` 経由に書き換え** (`patches/piper-plus.patch`) で minimum invasive 対処、`pnpm.patchedDependencies` を初採用したよ〜🛡️
- **#761 つくよみちゃんコーパスのクレジット表記対応!📜** — つくよみちゃんコーパス利用規約 (CC BY 4.0 + コーパス規約) の **「目立つ場所に十分な文字サイズで掲載」義務** と **「派生物 (出力音声) の二次利用制限のユーザー告知」義務** を満たすため、**設定 → 表示 → 読み上げ音声** に専用クレジット欄を追加〜🎀 公式 URL リンク (`https://tyc.rei-yumesaki.net/material/corpus/`) + 「出力音声の禁止用途」(批判・攻撃 / 政治的賛同呼びかけ / 成人向け非ゾーニング公開 / 他者二次素材としての再配布) も明示〜🛡️ README.md のライセンス節にも音声素材ライセンスを追記〜📚

### バグ修正っ

- **#761 piper-plus model URL 誤解釈の修正 (HF 直接配信に切替)!💡** — `PIPER_PLUS_VOICES` で渡していた相対 URL (`/api/piper-voice/tsukuyomi.onnx`) を piper-plus 内部が `huggingface.co/api/models/<value>` として解決を試みる誤動作で 404 になっていた問題を修正〜🎯 case A: 絶対 URL 変換ではなく、case B: piper-plus の standard design に従って **HuggingFace repo 名 (`ayousanz/piper-plus-tsukuyomi-chan`) を直接 model option に渡す** 方針に変更 → library 内部の resolver が `huggingface.co/<repo>/resolve/main/` から自動取得するように〜🛡️

### バグ修正っ (監査エージェント発見 2 件一括対応)

- **バグ修正 2 連続!💡** — バグ監査エージェント (confidence 82〜88%) が発見した 2 件を同サイクル一括修正〜🎯 (1) `purge-content-cache` API のカウンタ不整合: linkless 記事 (Atom 形式で `<link>` を持たない記事) を `total` カウントに含めるが `purged` / `failed` どちらにも増えず CLI 側で `total === purged + failed` 不変条件が崩れる問題を修正、`linkArticles` で事前 filter してから `total` 報告に変更〜🛡️ (2) `read-state-merge.ts` の `chooseLater` / `mergeSnoozed` で **ISO 8601 文字列の lexicographic 比較バグ**: `"2026-01-01T00:00:00.999Z"` > `"2026-01-01T00:00:01+00:00"` (後者は 0.001 秒後だが lexicographic で逆判定) で `readBeforeTimestamp` / `snoozedUntil` が誤った時刻を採用するリスク → `Date.parse` で絶対時刻基準比較に変更 (code-quality #1 で `read-state-prune.ts` に施した同 sibling 規範を完全適用)、不正 ISO 文字列の NaN guard も追加〜🛡️ TDD 6 ケース全 pass (既存 50 + 新規 6 = 58 件)〜📚

### パフォーマンス改善っ + UX 改善っ + ドキュメント整備っ (監査エージェント発見 6 件一括対応)

- **perf 3 連続修正!⚡** — 監査エージェント (perf 観点 confidence 82〜95%) が発見した 3 件を同サイクル一括修正〜🎯 (1) `useFilteredArticles` の `feedCategoryMap` / `feedTitleByHash` に **構造的等価ガード** (`equalStringMap`) を追加 → 5 分ポーリングで `feeds` reference が変わるたびに走っていた 500+ 記事の O(n) 再フィルタ (20-80ms ブロック × 12回/h) を内容変化時のみに削減、(2) `useArticleUnreadStats` の `lastPublishedByFeed` を **別 useMemo に分離** → `readIds` 変化 (j キー連打 / mark-all-read) で再計算しない設計に変更、(3) 同 hook で `today` を **midnight refresh する `useUtcDate` hook** に切り出し → tab 開きっぱなしで日付跨ぎ時の `readTodayCount` stale バグを修正〜📊 89 件全関連 spec pass〜🛡️
- **UX 1 件修正 + 1 件 prop 受け口準備!💡** — (1) `useFeedOperations` (deleteFeed / renameFeed / addFeed) のエラー通知が **サイドバーのローカル `setError` (3 秒後消去) のみで記事一覧ペインまで届かない** 問題を修正、`onError` callback 引数追加 → `feed-sidebar` で `toast.error` に接続して `ToastContainer` 経由で確実に届くように〜🛡️ (2) `ArticleListEmptyState` (フィード未登録時の空状態) に「フィードを追加」CTA ボタン追加 (prop 受け口のみ、配線は別 Issue 起票予定)〜🎀
- **ドキュメント整備っ** — `api-spec.md` の `PATCH /api/feeds/:id` の `FEED_NOT_FOUND` 説明を補足: 実装は「購読一覧にない」+「共有フィードメタが R2 に存在しない」の **2 経路** で 404 を返すが、文書は前者のみ記載 (docs drift 監査 confidence 82%)〜📚

### セキュリティ対策っ

- **#705 修正: JWT cross-service token replay 防御 (aud=authBaseUrl fallback 撤廃)!🔒** — `src/lib/auth.ts#verifyJwt` で旧実装は `acceptedAuds = [expectedAud, authBaseUrl]` だったため、**同 IdP (id.0g0.xyz) を使う別サービス (例: 別の rss-reader / 0g0-id 配下の他アプリ) の access_token を本サービスで受け入れてしまう** cross-service token replay リスクがあった問題を修正〜🎯 上流 0g0-id リポジトリ調査 (`workers/id/src/utils/token-pair.ts#issueTokenPair`) で **OAuth クライアント (rss-reader 等) のトークンは `aud = clientId` 固定で発行されている** ことを確認 → fallback 不要と判定〜📦 案 A 採用: `acceptedAuds = [expectedAud]` に縮退、TODO(#379) コメント削除、fallback warning ログも削除〜🛡️ TDD `e2e/jwt-aud-iss.spec.ts` に新規 2 spec 追加 (aud=AUTH_BASE_URL のみ / 配列に AUTH_BASE_URL 含む但し CLIENT_ID 不在 → 両方 reject)、全 10 ケース pass〜📚 (security 監査エージェント Confidence 85% 指摘、#379 closed の後継 #705 として最終決着)

### リファクタリングっ + simplify (監査エージェント発見 3 件一括修正)

- **simplify 3 連続修正!🎀** — リファクタ監査エージェントが confidence 85〜92% で発見した 3 件を同サイクル一括修正〜🎯 (1) `app/api/collections/[id]/route.ts` / `app/api/auth/dbsc/challenge/route.ts` / `app/api/auth/dbsc/register/route.ts` の 3 ファイルで重複していた UUID 正規表現 (`^[0-9a-f]{8}-[0-9a-f]{4}-...`) を既存 `isValidSessionId()` 共通ヘルパーに置換 (4 箇所同期修正のリスク解消)、(2) `useFeedGroups` / `useCollections` で重複していた `sortByOrder` 関数を `src/lib/sort-utils.ts` に集約 (新規 hook 追加時の 3 件目 drift 防止) + TDD 8 ケース全 pass (`e2e/sort-utils.spec.ts`)、(3) `src/lib/article-filter.ts#EMPTY_FEED_TITLE_MAP` sentinel に `Object.freeze` 追加 (`react-patterns.md` 規範準拠、`useFilteredArticles` consumer 多数で誤 mutate 防止)〜🛡️ 全件「規範パターン複製レベル + 1〜2 ファイル touch + 設計判断不要」なので Issue 起票せず同サイクル一括修正パターン採用〜📚

### セキュリティ対策っ

- **#706 修正: OGP cache poisoning 防御 (Twitter fallback 経路の TTL 短縮)!🔒** — `fetchTwitterFallbackImage` (X/Twitter 投稿で OGP 画像が無いとき tweet 内リンク先 OGP 画像をフォールバック取得する経路) は **攻撃者が tweet に任意 image を含む linked page を投稿すると、その image URL が 30 日間 shared cache に居座り、同じ tweet を見る全ユーザーに拡散する poisoning が成立** していた問題を修正〜🎯 案 A 採用: fallback 経路の TTL を **30 日 → 1 日に短縮** して影響範囲を限定 (攻撃者が tweet を継続維持しないと poisoning 持続不可)〜📦 純粋関数 `computeOgpCacheTtl({ hasContent, isFallback })` を `src/lib/ogp-cache-ttl.ts` に新設して TDD で全 4 分岐網羅 (通常成功 30 日 / fallback 経路 1 日 / 空応答 1 日 / fallback+空応答 1 日)〜🛡️ negative cache の既存 TTL (`OGP_NEGATIVE_CACHE_TTL_SEC = 24h`) と同一なので独立定数は不要、命名で意図を表現〜📚 (security 監査エージェント Confidence 88% 指摘)

### パフォーマンス改善っ

- **#702 修正: 全記事 unread 統計の二重 scan を解消!⚡** — 旧実装で `useTotalUnreadCount` (App.tsx) と `useSidebarFeeds` 内の useMemo が同じ `articles` 配列を独立 full scan していたため、`readIds` 変化のたびに全記事 (500+) を 2 回走査して主スレッドをブロックしていた問題を修正〜🎯 案 A 採用: 新規 hook `useArticleUnreadStats` で 1 回だけ scan + 200ms debounce → `UnreadStatsContext` Provider で `<FeedSidebar>` と `useDocumentTitleBadge` (App.tsx) の両方に配信〜📦 既存 `useTotalUnreadCount` を削除、`useSidebarFeeds` の articles/readIds/readBeforeTimestamp 引数を削除して context 経由に統合〜💎 `useArticleUnreadStats` は `unreadByFeed` (feedHash → 未読件数) / `totalUnread` / `lastPublishedByFeed` (feedHash → 最新 publishedAt) / `readTodayCount` を 1 ループで全部計算 → 旧 `useSidebarFeeds` の独自 useMemo より集計項目も増えてオールインワンに〜🛡️

### バグ修正っ

- **#721 修正: feed の description 文字数制限を 200 → 5000 に緩和!📝** — VRChat seller bot 等の長い `<description>` (アバター 30+ 件列挙等) が 200 文字で切られて「すべて表示されていない」ユーザー報告に対応〜🎯 `xml-parser.ts` の `MAX_SUMMARY_LENGTH` 定数を新設して RSS 2.0 / Atom / JSON Feed の 4 箇所すべてで一括適用、25 倍に緩和して大半の RSS で完全表示〜📦 完全撤廃でなく上限を残す理由: 悪意ある巨大 description (1MB+) による R2 storage / シリアライズコスト DoS の防御〜🛡️ TDD 3 ケース全 pass (1000 文字保持 / 8000 文字 truncate / Atom 1500 文字保持) `e2e/xml-parser.spec.ts`〜📚

### バグ修正っ + ドキュメント整備っ (Phase 1 真因切り分け)

- **#715 Phase 1 真因切り分け: digitallover.moe で `<video>` が表示されない真因 = CSS 欠落!🎬** — 当初 4 仮説 (Readability 削除 / noise removal / クライアント render / CORS) を検討、TDD spec で仮説 A (Readability text-density 判定) を pass で **却下**。残仮説を Read で詰めた結果、`app/globals.css` に **`.article-content video` の CSS rule が完全欠落** していたことが判明〜🎯 既存 `.article-content img { width: 100%; height: auto; ... }` は定義されていたが、`<video>` は未定義でブラウザ default の inline display 挙動により WordPress `<figure class="wp-block-video">` 内では描画されないケースが発生〜🛡️ defensive 対応として `.article-content video` + `.article-content audio` の rule を追加 (img と同じ pattern)、regression spec も `e2e/content-extraction.spec.ts` に追加 (#715 Phase 1)〜📚 video-proxy 新設は不要 (Phase 2 取りやめ)、ユーザー実機確認待ち〜⚙️

### simplify + パフォーマンス改善っ (監査エージェント発見 5 件一括修正)

- **simplify 3 連続修正!🎀** — (1) `engagement/route.ts` / `auth/me/route.ts` で `checkAndUpdateCooldown` 直 import を `applyCooldown` ラッパー経由に統一 (`server-auth.ts` で集約済の wrapper を 12 ルート全箇所で使う形に揃える)、(2) `r2.ts` の KV cooldown key を「legacy R2-style (`users/{userId}/xxx.json`)」と「current KV-style (`{userId}:xxx`)」に分類して JSDoc コメント追加 (新規キーは current 形式で書くガイドライン明示)、(3) `browser-translator.ts` の 2 つの silent catch に `devError` を追加 (`browser-platform.md` 規範違反解消、`browser-summarizer.ts` と同パターン)〜🛡️ 全件 1〜2 ファイル touch + 規範パターン複製レベル〜📚
- **perf 2 連続修正!⚡** — (1) `usePrefetchGalleryContents` で `buildArticlesKey(articles)` を `useMemo([articles])` でラップ → ギャラリー再 render ごとに走っていた O(n) filter+map+join (~7KB string + 中間 array) 割当を `articles` reference 変化時のみに削減 (perf F1)、(2) `useFilteredArticles` で `digestLimitMap` に構造的等価ガード `equalDigestLimitMap` を追加 → 5 分ポーリングで `feeds` reference 変化のたびに走っていた 500 件全文 O(n log n) 再 sort を、`digestLimit` 値が変わったときのみに削減 (`equalSnoozedUntil` #686 と同パターン)〜🎯 perf F3 (`useReaderSettingsValue` callback 安定性監査) は構造的リスクのため別 Issue 起票予定〜📊

### a11y 改善っ (監査エージェント発見 3 件一括修正)

- **a11y 3 連続修正: ARIA disclosure / menu button pattern を WCAG 4.1.2 / 2.1.1 準拠に!♿** — a11y 監査エージェントが発見した 3 件を同サイクルで連続修正〜🎯 (1) `FeedGroupsSection.tsx` のグループ折りたたみボタンに `aria-expanded` 追加 (WCAG 4.1.2 disclosure pattern)、(2) `SidebarFooter.tsx` の「⋯ その他のメニュー」ドロップダウンに `aria-haspopup="menu"` / `role="menu"` / `role="menuitem"` (全 11 件) / Escape キーハンドラ追加 (WCAG 2.1.1 + menu button pattern)、(3) `FeedAddModal.tsx` の Cookie / CSS セレクタ disclosure ボタンに `aria-expanded` 追加〜🛡️ 全件「規範パターン (CollectionDropdown / Modal.tsx) 複製レベル」+ 1〜2 ファイル touch なので Issue 起票せず同サイクル一括修正パターン採用 (issue-handling.md 派生ケース)〜📚

### UX 改善っ

- **#717 対応: BuiltInAI (Chrome Summarizer) の自動要約に詳細度を追加!📝** — `SUMMARIZER_OPTIONS.length` を `"medium"` → `"long"` に拡張、tldr 形式 (端的な要約) のまま情報量を最大化〜🎯 「もう少し内容が欲しい」というユーザー報告に対応、UX 互換性を保ちつつ詳細度のみ向上〜📦 TDD: `e2e/browser-summarizer.spec.ts` に「length は 'long' を採用」spec 追加 (22 ケース全 pass)〜🛡️

### バグ修正っ

- **#716 修正: オートモード中に TTS を手動停止すると勝手に次記事へ遷移するバグ解消!🛑** — 旧実装で `isAutoReadFinished` が `prevPlaying=true → currentPlaying=false` の遷移を「TTS 完了」と判定していたため、ユーザーが Shift+P 等で `speechSynthesis.cancel()` した瞬間も「完了」とみなして 500ms 後に次記事へ自動遷移していたのを修正〜🎯 判定軸を「自然完了カウンタ (`utterance.onend`) の増加」に変更: `useSpeechSynthesis` の `onend` でのみ `endedCount` を increment、`cancel()` 経由の手動停止は increment しない (大半のブラウザ仕様で保証) 〜🛡️ TtsAdapter 型に `endedCount: number` 追加、`useArticleViewTts` / `useArticleViewState` / `ArticleView` を経由して `AutoReadController` まで配線〜📦 TDD: `e2e/auto-read.spec.ts` 7 ケース全 pass (旧 `prevPlaying / currentPlaying` から `prevEndedCount / currentEndedCount` へ全面置換 + 手動停止 / 複数件まとめ完了の新規ケース追加) 〜📚
- **digitallover.moe で GIF が 404 になる問題を修正!🎬** — `loadImage('id', 'jpg', 'gif')` パターンで第 2 引数 (jpg) を一律採用していたが、jpg=404/gif=200 の実例 (`gyutto.com/data/item_img/.../283294_430.{jpg,gif}` 実測) があったため第 3 引数 (gif) を優先採用するロジックに修正〜🎯 後方互換: 第 3 引数なし or 非 https の場合は jpg にフォールバック〜🛡️ TDD 7 ケース全 pass (`e2e/script-loaded-images.spec.ts` 新設、デフォルトの jpg 採用 / gif 優先 / 相対 URL fallback / 既存 src 維持 / loadImage 不在 / 実例再現を網羅)〜📚

### セキュリティ対策っ + a11yっ

- **#698 修正: AI 要約・翻訳キャッシュの cross-user poisoning 脆弱性を解消!🔒** — `articleId` がユーザー入力をそのまま信用していたため、攻撃者が被害ユーザーの `articleId` (購読者なら誰でも知れる決定論的値) で偽 `url` を渡して全ユーザーに偽 AI 結果をばらまける状態だったのを修正〜🛡️ 案 A 採用: cache key を `ai-cache/{type}/id-{articleId}` → `ai-cache/{type}/url-{sha256(url)}` に変更、攻撃者は自身が制御する url の cache しか書けないため完全分離〜🎯 旧 cache は無効化されるが「既存は無視 OK」とユーザー判断あり〜📦 関連修正: `useArticleAi.ts` で server に `articleId` 送信を停止、`ai-route-helper.ts` から `articleId` バリデーションを削除、e2e の旧 regex spec を削除〜💎
- **#701 修正: `ArticleContextMenu` (記事右クリックメニュー) にキーボードナビ追加!♿** — WCAG 2.1.1 Keyboard Level A 違反だった右クリックメニューを修正〜🎯 `role="menu"` / `role="menuitem"` 付与 + 開時に最初の項目へ自動フォーカス + ArrowDown/Up/Home/End/Tab で項目間移動 + Escape で閉じる + Tab トラップ実装〜♿ 右クリック起点 (トリガーボタンなし) なので `useMenuKeyboard` hook の signature と合わず独自実装、focus 復元はなし (右クリック源は記事カードでトリガー特定不能)〜🛡️ 案 A 採用 (将来 Shift+F10 の案 B が必要なら別 Issue)〜📚

### ドキュメント整備っ (規範 codify)

- **規範 codify: `issue-handling.md` に「`closes #N` で自動クローズされた Issue へのコメント投稿手順」追加!📚** — #712 クローズ時に `gh issue close 712 --comment "..."` が "Already closed" エラーで `--comment` 未投稿になる事象に遭遇 → `merge commit` の `closes #712` で自動クローズ済だったため発生〜🎯 「Issue クローズ時のコメント」セクションに派生節として追加: 案 A (closes キーワード + 別 gh issue comment) / 案 B (commit に closes なし + gh issue close --comment 同時) の運用パターン明示〜🛡️ 規範化 → 即時自己実証パターン 7 度目 (`useSyncedRef` / `react-named-imports` / `sentinel-freeze` / 自走 5 条件 / DOM global 衝突対応 / default React import / closes 自動クローズに続く)〜💎

### リファクタリングっ (#712 完了 — 全プロジェクト React.X named import 化達成! 🎉)

- **`React.X` named import sweep 完了!🎉 全 51 ファイル / 11 サイクルで完遂!⚡ (#712 クローズ)** — 第 10 段階 (Modal/Overlay 系 5 ファイル) に続き、最後の 2 ファイル (`ArticleList.tsx` (1 ref) / `ArticleView.tsx` (1 ref)、計 2 references) で `React.X` を named import に書き換え〜🎯 これで全プロジェクト (`src/` + `app/`) の `React.X` qualified 形式は完全に named import に統一されました (`release-notes-data.ts` は auto-generated で対象外) 〜📦 11 サイクル × 平均 4.5 ファイル / cycle = 51 ファイル / **計 161 references** を機械的置換で完遂、typecheck + e2e 全 pass、衝突発生 2 ファイル (`useColumnResize.ts` / `ArticleDetailOverlay.tsx`) は規範通り `as ReactX` alias で解決〜🛡️ 案 B 段階的アプローチのおかげで 1 サイクル 5 ファイル制約を一度も破らず、PR レビューしやすい diff サイズで安全に完遂 (前サイクルまでで規範 codify 2 件: 「DOM global 衝突対応」+ 「default React import を named に変える」も `react-patterns.md` に書き出し済) 〜📚

### リファクタリングっ (#712 案 B 段階的 sweep 第 10 段階)

- **`React.X` named import sweep 第 10 段階! Modal/Overlay 系 5 ファイル!⚡ (#712 第 10 段階)** — 第 9 段階 (Modal/Overlay 軽量 5 ファイル) に続き、残 Modal/Overlay 5 ファイル (`ArticleDetailOverlay.tsx` (2 ref) / `FeedAddModal.tsx` (2 ref) / `FeedQuickSwitchModal.tsx` (2 ref) / `CollectionModal.tsx` (1 ref) / `feed-item/FeedContextMenu.tsx` (6 ref)、計 13 references) で `React.X` を named import に書き換え〜🎯 `KeyboardEvent` / `MouseEvent` / `FormEvent` / `ClipboardEvent` / `CSSProperties` / `RefObject` の type-only named import 〜📦 `ArticleDetailOverlay.tsx` のみ DOM `addEventListener("keydown"/"mousemove"/"mouseup")` 使用 → `KeyboardEvent as ReactKeyboardEvent` + `MouseEvent as ReactMouseEvent` の alias で衝突回避 (規範通り) 〜🛡️ 残 2 ファイル (ArticleList / ArticleView) のみ次サイクルで完了予定 (進捗 96%) 〜📚

### リファクタリングっ (#712 案 B 段階的 sweep 第 9 段階)

- **`React.X` named import sweep 第 9 段階! Modal/Overlay 軽量 5 ファイル!⚡ (#712 第 9 段階)** — 第 8 段階 (components 軽量 5 ファイル) に続き、Modal/Overlay 系の軽量 5 ファイル (`FocusModeOverlay.tsx` (1 ref) / `FeedDetailModal.tsx` (1 ref) / `FeedFilterModal.tsx` (1 ref) / `ReadingStatsModal.tsx` (1 ref) / `UserSettingsModal.tsx` (1 ref)、計 5 references) で `React.X` を named import に書き換え〜🎯 全ファイル 1 ref のみで影響最小、`React.KeyboardEvent` → `KeyboardEvent` / `React.ReactNode` → `ReactNode` の type-only named import 〜📦 全ファイル DOM `addEventListener` 未使用 → alias 不要〜🛡️ 残 6 ファイル後続サイクルで継続 sweep (進捗 88%) 〜📚

### ドキュメント整備っ + リファクタリングっ (#712 第 8 段階 + 規範 codify)

- **`React.X` named import sweep 第 8 段階! components 軽量 5 ファイル!⚡ (#712 第 8 段階)** — 第 7 段階 (hooks 完全消化) に続き、components 軽量 5 ファイル (`ImportExportTabPanel.tsx` (1 ref) / `feed-sidebar/index.tsx` (1 ref) / `article-items/shared.tsx` (3 ref) / `user-settings/shared.tsx` (2 ref) / `feed-item/FeedItemComponent.tsx` (3 ref)、計 10 references) で `React.X` を named import に書き換え〜🎯 `React.ChangeEvent` → `ChangeEvent` / `React.FormEvent` → `FormEvent` / `React.KeyboardEvent` → `KeyboardEvent` / `React.SyntheticEvent` → `SyntheticEvent` / `React.MouseEvent` → `MouseEvent` / `React.CSSProperties` → `CSSProperties` / `React.ReactNode` → `ReactNode` の type-only named import 〜📦 全ファイル DOM `addEventListener` 未使用 → alias 不要〜🛡️ 残 11 ファイル後続サイクルで継続 sweep (進捗 78%) 〜📚
- **規範 codify: `react-patterns.md` に「default `import React from 'react'` を named import に置き換える」派生ケース追加!📚 (前サイクル提案分の即時実証)** — 前サイクル末で発見した「default React import を named に変える」パターンを `react-patterns.md` の「DOM global 衝突対応」セクション末尾に派生ケースとして codify〜🎯 React 19 + Next.js 16 の JSX runtime auto では default `React` import 不要 → named import で value (`createElement` / `Fragment` / `forwardRef` 等) を取り出す方が tree-shaking 改善 + 一貫性向上〜💪 反例 (古い React 16 系 / Class component / type-only namespace import) も併記して誤適用回避〜🛡️ 規範化 → 即時自己実証パターン 6 度目 (`useSyncedRef` / `react-named-imports` / `sentinel-freeze` / 自走 5 条件 / DOM global 衝突対応に続く)〜💎

### リファクタリングっ (#712 案 B 段階的 sweep 第 7 段階 — hooks 完全消化)

- **`React.X` named import sweep 第 7 段階! 残 hooks 4 ファイル + `article-ui-helpers.ts`!⚡ (#712 第 7 段階)** — 第 6 段階 (useReadState 系 5 ファイル / 39 ref) に続き、残 hooks 4 ファイル + lib 1 ファイルを処理。これで hooks ディレクトリの React.X sweep が完全消化〜🎯 対象: `useArticleData.ts` (2 ref) / `useArticleViewProgress.ts` (4 ref) / `useFeedData.ts` (1 ref) / `useReadStateSyncApply.ts` (15 ref) / `lib/article-ui-helpers.ts` (2 ref)、計 24 references 〜📦 `Dispatch` / `SetStateAction` / `MutableRefObject` / `RefObject` / `UIEvent` の type-only named import + `article-ui-helpers.ts` は default `import React` を named `createElement` / `Fragment` import に変換 (default import 廃止パターン) 〜🛡️ 全ファイル DOM `addEventListener` 確認 → `useArticleData.ts` のみ `visibilitychange` 使用するが React event 型と被らないため alias 不要 〜💪 残 16 ファイル後続サイクルで継続 sweep (進捗 69%) 〜📚

### リファクタリングっ (#712 案 B 段階的 sweep 第 6 段階)

- **`React.X` named import sweep 第 6 段階! useReadState 系 hooks 5 ファイル!⚡ (#712 第 6 段階)** — 第 5 段階 (軽量 hooks 5 ファイル) に続き、useReadState 系 hooks 5 ファイル (`useReadStateSyncFlush.ts` (5 ref) / `useReadStatePersistence.ts` (6 ref) / `useReadStateSync.ts` (7 ref) / `useReadStateToggles.ts` (10 ref) / `useReadStateActions.ts` (11 ref)、計 39 references) で `React.X` を named import に書き換え〜🎯 全ファイル DOM `addEventListener` 未使用なので alias 不要、`Dispatch` / `SetStateAction` / `MutableRefObject` / `RefObject` の type-only named import 〜📦 useReadState 系は型共通 (Set state setters / refs) なので 5 ファイル一括 `replace_all` で機械的置換、39 references を 5 ファイル touch で完遂〜🛡️ 残 21 ファイル後続サイクルで継続 sweep (進捗 59%) 〜📚

### リファクタリングっ (#712 案 B 段階的 sweep 第 5 段階)

- **`React.X` named import sweep 第 5 段階! hooks 軽量 5 ファイル!⚡ (#712 第 5 段階)** — 第 4 段階 (article-items 5 ファイル) に続き、軽量 hooks 5 ファイル (`useReadingProgress.ts` (1 ref) / `useFocusMode.ts` (1 ref) / `useArticleViewShortcuts.ts` (1 ref) / `useFeedOperations.ts` (1 ref) / `useReadStateTags.ts` (4 ref)、計 8 references) で `React.X` を named import に書き換え〜🎯 `React.RefObject` → `RefObject` / `React.Dispatch<React.SetStateAction<T>>` → `Dispatch<SetStateAction<T>>` / `React.MutableRefObject` → `MutableRefObject` / `React.ChangeEvent` → `ChangeEvent` の type-only named import 〜📦 全ファイル DOM `addEventListener` 未使用なので alias 不要〜🛡️ 残 26 ファイル後続サイクルで継続 sweep (進捗 49% — 過半数到達!) 〜📚

### リファクタリングっ (#712 案 B 段階的 sweep 第 4 段階)

- **`React.X` named import sweep 第 4 段階! article-items 系 5 ファイル!⚡ (#712 第 4 段階)** — 第 3 段階 (Modal 系 5 ファイル) に続き、`article-items/` 系 5 ファイル (`CardItem.tsx` (2 ref) / `CompactItem.tsx` (2 ref) / `GalleryItem.tsx` (1 ref) / `ListItem.tsx` (2 ref) / `MagazineItem.tsx` (2 ref)、計 9 references) で `React.X` を named import に書き換え〜🎯 全ファイル DOM `addEventListener` 未使用なので alias 不要、素直な `KeyboardEvent` / `MouseEvent` named import で OK 〜📦 第 3 段階で codify した「DOM global 衝突対応」規範を grep でチェックして alias 判断 → 5 ファイル全て alias 不要 → 規範の負荷判定が機能している証拠 〜🛡️ 残 31 ファイル後続サイクルで継続 sweep (進捗 39%) 〜📚

### ドキュメント整備っ + リファクタリングっ (#712 第 3 段階 + 規範 codify)

- **`React.X` named import sweep 第 3 段階! Modal 系 5 ファイル + 衝突対応規範 codify!⚡ (#712 第 3 段階)** — 第 2 段階 (hooks 5 ファイル) に続き、Modal 系 5 ファイル (`SkeletonArticleList.tsx` (1 ref) / `SessionExpiredModal.tsx` (1 ref) / `Modal.tsx` (2 ref) / `ConfirmModal.tsx` (1 ref) / `article-list-header/SearchBar.tsx` (2 ref)、計 7 references) で `React.X` を named import に書き換え〜🎯 `React.JSX.Element` → `JSX.Element` / `React.KeyboardEvent` → `KeyboardEvent` / `React.ReactNode` → `ReactNode` / `React.FocusEvent` → `FocusEvent` の type-only named import 〜📦 `ConfirmModal.tsx` のみ DOM `addEventListener("keydown", ...)` を使うため `KeyboardEvent as ReactKeyboardEvent` の alias で衝突回避〜🛡️ 残 36 ファイル後続サイクルで継続 sweep 〜📚
- **規範 codify: `react-patterns.md` に「React event 型 named import 化時の DOM global 衝突対応」追加 + `issue-handling.md` の自走禁止リストに 3 項目追加!📚 (前サイクル提案分の即時実証)** — 前サイクル末で提案した 2 件のルールを書き出し: (1) `react-patterns.md` に DOM global 衝突 (`MouseEvent` / `KeyboardEvent` 等 11 種) + import alias 解決パターン + 検出 grep を新規セクション追加〜🎯 (2) `issue-handling.md` の「自走禁止」リストに「新規 npm pkg 追加」「新規 infra 採用 (wasm/IndexedDB/SW/Worker/WebGPU)」「データ schema/R2 layout 新規」を追加〜🛡️ さらに「ユーザー判断付き Issue + 段階処理 OK」でも追加判断仰ぐべき要素テーブル (ライブラリ選定 / モデル配信 / R2 key) を新セクション追加〜💎 同サイクルで本規範を `ConfirmModal.tsx` の alias 採用に即実証 (規範化 → 即時自己実証パターン 5 度目)〜💪
- **#674 (TTS wasm) ライブラリ選定の判断仰ぎコメント投稿!📝** — ユーザー判断 (案 C 抽象化 + 案 B モデル DL アップロード方式 + つくよみちゃん `piper-plus-tsukuyomi-chan`) は明確だが、Phase 1 着手前に Piper wasm のライブラリ選定 (`@mintplex-labs/piper-tts-web` (案 A 推奨) / 公式 wasm 直接 (案 B) / 別 wrapper (案 C)) + 配信モデル (DL 先 URL ハードコード or 設定可能) でユーザー判断を仰ぐコメントを投稿〜🎯 自走 5 条件はほぼ充足するが、新規 npm pkg + wasm infra 採用は不可逆な依存追加なので「ライブラリ選定」だけ判断仰ぐ〜🛡️ Phase 1a (skeleton 1 ファイル) 〜 Phase 1c (UI 配線 3-5 ファイル) の段階分割案も提示〜📚

### リファクタリングっ (#712 案 B 段階的 sweep 第 2 段階)

- **`React.X` named import sweep 第 2 段階! hooks 5 ファイル!⚡ (#712 第 2 段階)** — 第 1 段階 (5 ファイル) に続き、hooks ディレクトリの 5 ファイルで `React.X` を named import に書き換え〜🎯 対象: `useColumnResize.ts` (1 ref) / `useGestureNav.ts` (5 ref) / `useHeaderScrollVisibility.ts` (2 ref) / `useImageDownload.ts` (1 ref) / `useMenuKeyboard.ts` (2 ref) — 計 11 references 〜💪 `React.MouseEvent` → `MouseEvent` / `React.TouchEvent` → `TouchEvent` / `React.WheelEvent` → `WheelEvent` / `React.UIEvent` → `UIEvent` / `React.KeyboardEvent` → `KeyboardEvent` / `React.RefObject` → `RefObject` の type-only named import 〜📦 `useColumnResize.ts` は DOM `MouseEvent` global と衝突するため `MouseEvent as ReactMouseEvent` で alias 解決 (派生ケース learn) 〜🛡️ 残 41 ファイル後続サイクルで継続 sweep 〜📚

### リファクタリングっ (#712 案 B 段階的 sweep 第 1 段階)

- **`React.X` named import sweep を案 B 段階的アプローチで再開! 軽微 5 ファイル!⚡ (#712 第 1 段階)** — 残 51 ファイルの `React.X` named import 化を 1 サイクル一括 (案 A) ではなく **5 ファイル/サイクル の段階的 sweep (案 B)** に切り替えて再開〜🎯 自走 5 条件 (最小スコープ ≤ 5 / 最安全 / 推奨案明示済 / 復元可能 / 数サイクル経過) を完全充足する形に分割〜💪 第 1 段階対象: `app/layout.tsx` (1 ref) / `src/components/feed-item/types.ts` (1 ref) / `src/components/article-list-body/gallery-context.ts` (1 ref) / `src/components/article-list-body/GalleryCardRenderer.tsx` (1 ref) / `src/components/feed-sidebar/FooterIconButton.tsx` (1 ref) — いずれも参照 1 件のみで影響極小〜🛡️ `React.ReactNode` → `ReactNode` / `React.MouseEvent` → `MouseEvent` / `React.TouchEvent` → `TouchEvent` の type-only named import 〜📦 残 46 ファイルは後続サイクルで継続 sweep 〜📚

### ドキュメント整備っ + リファクタリングっ

- **「ユーザー判断仰ぎ Issue を AI 自走で採用する 5 条件」を `issue-handling.md` に codify + #708 を即座に自走採用!📚 (前サイクル承認分 + 即時実証)** — 前サイクルで提案した「最小 + 最安全 + 推奨案明示済 + 復元可能 + 数サイクル経過」の 5 条件 + 透明性担保 (commit + クローズコメント明記) を `issue-handling.md` 末尾に新規セクション追加〜🎯 同サイクルで `#708 buildImageSlider dead spec 削除` が全 5 条件を満たすことを判定 → 推奨案 A (spec ごと完全削除) を AI 自走で採用 → 実装 → クローズ〜💪 codify 済規範の即時自己実証パターン 4 度目 (`useSyncedRef` / `react-named-imports` / `sentinel-freeze` に続く)〜🛡️
- **`buildImageSlider` を spec 5 ケースごと完全削除!🗑️ (#708 推奨案 A 採用)** — `#321` (2026-05-03) で `content.ts` 側 caller が削除されてから 13 cycles 経過、production caller 0 + spec 5 ケースだけが残存していた dead 関数を完全削除〜🎯 `src/lib/html-image-processors.ts` から export 関数 (22 行) + `src/lib/html-post-processor.ts` から re-export + `e2e/html-post-processor.spec.ts` から spec 5 ケース (28 行) を削除〜📦 将来「画像スライダー UI を作る」場合は `useSliderGallery` (`src/hooks/useSliderGallery.ts`) で同等機能が既に実装済みなので新規実装不要〜🛡️ 復元したければ commit revert で元に戻せる〜💎

### リファクタリングっ

- **`Recommendation.source` dead field を完全削除!🗑️ (#710 推奨案 A 採用)** — `RecommendationSource` 型 + `Recommendation.source` フィールドが production caller 0 (UI 表示なし、フィルタリングなし) のまま `recommendation.ts` の 3 箇所で populate されているだけの dead field 状態だったのを完全削除〜🎯 R2 への意味のないデータ書き込み排除 + 型サーフェス縮小〜📦 既存 `users/{userId}/recommendations.json` キャッシュには `source` フィールドが残るが forward-compatible で型削除後は無視される〜🛡️ 将来「推薦ソース別フィルター」で復活させたければ git log + Issue #710 履歴から復元可能〜📚

### リファクタリングっ (規範統一)

- **`React.X` を named import 化! article-view ディレクトリ 9 ファイル sweep!⚡ (前サイクル保留分の続き)** — 過去サイクルで `import React from "react"` を 12 ファイル削除した際に「実使用中のため別検討」と保留した 4 ファイル + 周辺 5 ファイル、計 9 ファイルで `React.X` 形式を named import に書き換え〜🎯 `React.MouseEvent` → `MouseEvent` / `React.ReactNode` → `ReactNode` / `React.JSX.Element` → `JSX.Element` / `React.TouchEvent` → `TouchEvent` / `React.RefObject` → `RefObject` / `React.UIEvent` → `UIEvent` の type-only named import + `React.forwardRef` / `React.useImperativeHandle` / `React.createElement` / `React.Fragment` の value named import 〜💪 React 19 + Next.js 16 の JSX runtime auto に合わせた書き換えで挙動変化なし〜🛡️ 残 51 ファイルは別 Issue で全プロジェクト sweep を提案〜📚

### ドキュメント整備っ + リファクタリングっ

- **sentinel freeze 規範を `react-patterns.md` に codify + `EMPTY_SENTENCES` も sweep!📚 (規範統一サイクル)** — 前サイクルの `useFilteredArticles` sentinel freeze を `react-patterns.md` の「state 更新前に構造的等価性ガード」セクション末尾に **派生ケース** として codify〜🎯 「mutable 型 (Set/Map/Array/Object) は freeze 対象、ReadonlySet/Array で型守られているなら freeze 不要」のガイドラインも明示〜📚 同サイクルで残 sentinel `EMPTY_SENTENCES` (#703 TTS ハイライト抑制用) も freeze 化、`EMPTY_FEED_TITLE_MAP` は `ReadonlyMap` 型で型守られているため対象外と判定〜🛡️ 検出 grep `grep -rEn "^const EMPTY[A-Z_]*"` で全 6 sentinel を網羅、freeze 化対象 4 件 / 型守られ 2 件 / freeze 済 1 件で完全 sweep 達成〜💎

### リファクタリングっ (規範統一)

- **`useFilteredArticles` の sentinel オブジェクト 3 種を `Object.freeze` で汚染防止!🛡️ (機械検出 sweep)** — `EMPTY_SET` / `EMPTY_STR_ARRAY` / `EMPTY_FEED_ARRAY` の 3 sentinel が freeze されておらず、下流コンポーネントが誤って `.add()` / `.push()` した場合にプロセス全体で sentinel が汚染される潜在バグを修正〜🎯 既存の `useDelayedGalleryItems.ts` の `EMPTY_SET = Object.freeze(...)` パターンに統一〜📚 同名 sentinel が異なるファイルで「frozen / 非 frozen」で混在する drift を解消、`grep -rEn "^const EMPTY"` の機械検出で発見〜💎
- **lint warning actionable な 2 件を解消!🧹 (機械検出 sweep)** — 前サイクルで `useGalleryAutoScroll` を `useSyncedRef` 化したときに残っていた未使用 `useRef` import 1 件と、code-quality #1 (ISO8601 cutoff 修正) サイクルで TDD 試行過程に残った未使用変数 `slightlyNewer` 1 件を削除〜🎯 warnings 10 → 8 件に減〜🛡️ 残 8 件は全て `useSyncedRef` の deps 配列に関する規範通りの許容警告 (`coding-conventions.md` で明記済) なので意図的に残す〜📚
- **未使用 `import React from "react"` を 12 ファイルで一括削除!📦 (機械検出)** — React 19 + Next.js 16 では JSX runtime auto のため `import React` は型/value で参照する場合以外不要〜🎯 `grep -rn "^import React from"` で 16 ファイル検出 → うち 12 ファイルが `React.X` 参照 0 (完全 unused) → 一括 sed 削除〜🛡️ 残 4 ファイル (`InlineArticleNav` / `ArticleAiPanel` / `ToggleIconButton` / `shareTargets`) は `React.MouseEvent` / `React.ReactNode` / `React.createElement` で実際に使用中のため型 named import への書き換えは別検討〜📚 ドキュメント整備っセクションでも紹介する `code drift sweep` パターンの実例〜💎
- **`useSyncedRef` 規範違反を 4 hooks / 5 ref で連続置換!🎯 (機械検出 + 連続適用)** — 前サイクルの `useReadingProgress` と同じパターン (render 中 `Ref.current = X` 手動 assign) を `grep -rEnB1 "Ref\\.current\\s*="` で網羅検出して、4 ファイル 5 ref を一括 `useSyncedRef` に置換〜💪 対象は `AutoReadController.onTtsStopRef` / `usePrefetchGalleryContents.mediaRef + articlesRef` / `useAutoReset.resetRef + durationRef` / `useGalleryAutoScroll.onUserInterruptRef`〜🛡️ `coding-conventions.md` / `react-patterns.md` の `useSyncedRef` 規範違反を解消、新規開発者が「どっちが正しいパターン?」と迷う drift を排除〜📚 `useFilteredArticles.activeIdsRef` は意図的な perf 最適化 (コメント明記済み) のため対象外〜💎

### テスト整備っ

- **`compareByDateDesc` / `compareByPublishedAtDesc` の 2 関数仕様差分を 14 ケースで明文化!🧪 (テストカバレッジ監査 82% 信頼度)** — 名前と引数の型が似ている 2 つの sort comparator が **「null publishedAt の扱い」と「id stable sort 有無」で意図的に挙動が異なる** ことが暗黙だったのを TDD で固定〜🛡️ `compareByDateDesc` は `publishedAt ?? createdAt` (null は createdAt フォールバック) + 同日付なら id stable sort、`compareByPublishedAtDesc` は `publishedAt ?? ""` (null は末尾) + id 比較なし、を spec 化〜📚 cron / shared-feed.ts / useArticleData.ts の sort 経路で齟齬が起きないことを保証 + 将来「2 関数を統合しよう」のような誤ったリファクタを防止できる **defensive 改善** ね〜🎯 (実バグでなく仕様確定 + regression 防止)

### リファクタリングっ

- **html-post-processor.ts の dead re-export 3 件を整理したよ〜!📦 (リファクタ監査 85% 信頼度)** — `removeDivsByClass` / `replaceBlocksByClass` (`html-noise-removal.ts` 内部利用のみ) と `extractZennEmbedContent` (`html-embed-transforms.ts` 内部利用のみ) の **production caller 0 + spec 0** 状態だった 3 シンボルを `html-post-processor.ts` の re-export hub から削除〜🎯 「将来 re-export 経由で使われているはず」と誤解しないように内部利用専用とコメント明示〜🛡️ `buildImageSlider` は #321 で caller 削除されたが spec 5 ケース残存のため別 Issue で判断する暫定維持コメント付き〜📚
- **`useReadingProgress` を `useSyncedRef` 規範に統一!🎯 (リファクタ監査 82% 信頼度)** — `onProgressChangeRef.current = onProgressChange` を render 中に手動 assign する旧パターンを `useSyncedRef(onProgressChange)` に置換〜💪 `coding-conventions.md` の `useSyncedRef` 規範違反を解消、新規開発者が「どっちが正しいパターン?」と迷う drift を排除〜🛡️
- **architecture.md の docs drift 2 件解消っ!📚** — `src/lib/api-feed-guard.ts` (#691 で追加した `assertFeedSubscribed` helper) と `src/components/AppProviders.tsx` (#650 Step 1u で追加した Provider 集約コンポーネント) が architecture.md に未記載だった drift を、機械的検出 (find + grep + comm) で発見して 1 行ずつ追記〜🎯 サブエージェント rate limit 時の機械的タスク (drift 検出) パターンの定常運用ね〜💎

### バグ修正っ

- **ユーザー設定モーダルの上下ぴょこぴょこ jump を解消したよ〜!🎀 (#707)** — `Modal.tsx` が `top-1/2 -translate-y-1/2` (垂直中央配置) + `max-h-[90dvh]` のみで **固定高さなし** だったため、`UserSettingsModal` のタブ切替 (表示 / AI・通知 / フィード管理 / インポート・エクスポート) のたびに content の高さが変わって Modal 全体が中央配置のまま伸縮 → 視覚的に上下に「ぴょこぴょこ動く」体感バグだったのを修正!💪 `Modal` に optional `height?: string` prop を追加して、`UserSettingsModal` から `height="sm:h-[640px]"` を渡すことで固定高に〜📦 他の Modal caller (FeedFilterModal / SnoozeModal / ConfirmModal 等) はデフォルト `height=""` でこれまで通りの content 高優先挙動を維持〜🛡️
- **オートモード + 自動要約で要約を読み上げ中の TTS ハイライトを抑制!🎯 (#703)** — `autoMode + autoSummarize + aiResult` が揃って **要約テキストを TTS で読み上げ中** のとき、ハイライトは「**記事本文**」の sentence span に当たってて、読まれているテキストとハイライト位置が乖離してた問題を修正!💪 `useArticleViewState` で `isReadingSummary` 判定 → `ttsSentences` を空配列に置き換えて `useTtsHighlight` の `activeSentenceIndex = -1` 維持〜🛡️ 要約 UI 自体に sentence span を導入する大規模対応はせず、**ハイライト抑制** のみで「読んでるテキストと違うところがハイライトされる」違和感を解消〜📦

- **ISO 8601 cutoff の比較を Date.parse ベースに修正で `+00:00` 形式も正しく扱うよ〜!📅 (code-quality 監査 85%)** — `computeEffectiveReadBeforeCutoff` で `readBeforeTimestamp` と ttl 由来 cutoff を **lexicographic 比較** してて、ASCII で `+` (0x2B) < `.` (0x2E) のため **同じ時刻** を `+00:00` 形式と `.000Z` 形式で表現すると後者が常に「新しい」と誤判定する潜在バグを修正!💪 `Date.parse(a) > Date.parse(b)` のミリ秒比較に変更〜🛡️ TDD で同時刻 +00:00/Z 形式 + 異時刻パターン全網羅〜📚
- **`isValidBase64url` で構造的不正な `length % 4 === 1` を弾くガード追加!🔒 (code-quality 監査 82%)** — `"A="` `"A"` `"AAAAA"` のような **1 char remainder** が `decodedBytes=0` で silently 通過してしまうバグを修正!💎 base64 の group は 4 文字 = 3 byte 単位、1 char 端数は 0 byte も表現できないため構造的に不正〜🛡️ Web Push 鍵検証では range check で結果として弾かれてたが、将来 `minBytes=0` の caller が来たら通過するリスクあり〜📦 TDD 7 ケース追加 (% 4 == 1 全 3 ケース + 既存 OK ケース 4 種)〜🎯

### UX 改善っ

- **AI 要約/翻訳ボタンが失敗時にちゃんと教えてくれるようになったよ〜!⚠️ (UX 監査 88% 信頼度)** — ボタン押した後に rate-limit や `AI_ERROR` で失敗しても、ヘッダーボタンが grey に戻ってサイレント、ユーザーは下にスクロールして本文の error メッセージ見ないと気付かない (= 押し直して再 rate-limit) 状態だったのを修正!💪 `aiError` / `translateError` を Props で受けて、エラー時にボタン枠を `border-error text-error` で目立たせ + `title` tooltip にエラーメッセージを表示〜🎯
- **読み上げ速度に `Shift+R` キーボードショートカット追加 + 次値 hint!⌨️ (UX 監査 82% 信頼度)** — 元々 `1x` ラベルボタンを **クリックして cycle するしかなかった** 速度切替を、`Shift+R` で再生中もキーボードから変更できるように!💎 `KeyboardShortcutsModal` (?キー) にも掲載で discoverable〜🎀 `title` tooltip も「読み上げ速度: 1x → 次: 1.5x（クリック / Shift+R）」と次値を明示〜📚 `cycleRate()` の戻り値を `void → number` に変更して shortcut の toast 表示に使える設計〜🛡️
- **「全文を取得」成功時に toast.info で確認フィードバック!✨ (UX 監査 80% 信頼度)** — 元々 `<FetchFullContentArea>` ボタン押した後、Spinner が消えて UI が無音で消えるだけで、ユーザーがスクロール下部にいると本文更新に気付かない問題を修正!🎯 `useImageDownload` と同じ pattern で `toast.info("全文を取得しました")` 発火〜🔊

### リファクタリングっ (#650 段階分割継続)

- **App.tsx の Provider 入れ子 4 段を `<AppProviders>` に集約!📦 (#650 Step 1u)** — `ToastProvider` / `TtsAdapterProvider` / `ReaderSettingsProvider` / `ArticleFilterProvider` の 4 段ネストを 1 ファイル (`src/components/AppProviders.tsx`) に閉じ込めて、App.tsx の return JSX を浅く保ったよ〜🎯 Provider の **順序や追加・変更時の影響範囲を 1 ファイルに局所化** できる構造で、将来の Provider 追加 (例: i18n / Analytics) も AppProviders 1 ファイル変更で完結〜🛡️ App.tsx は Provider 直接 import を 4 個削除〜💎

### パフォーマンス改善っ

- **`readingTimeCache` を「読了時間フィルター無効時は生成しない」に最適化!⚡ (perf 監査 80% 信頼度)** — `useFilteredArticles` で `readingTimeCache` を articles ref 変化のたびに常に生成してたのを、`readingTimeRange === "all"` (デフォルト) のときは `undefined` で skip するように!📦 5 分ポーリングのたびに走る無駄な allocation を排除〜🛡️ deps 配列にも `readingTimeRange` を追加して、フィルター切替時に正しく再生成される〜🎯

### リファクタリングっ

- **API ルートの subscription guard を `assertFeedSubscribed` ヘルパーに集約!🛡️ (simplify 監査 88% 信頼度)** — `feeds/[id]/{,refresh,reinfer,purge-content-cache}` で完全に同じ「購読してない feedHash は 404」3 行を 4 routes で重複してた状態を、`src/lib/api-feed-guard.ts` の **discriminated union** ベース helper に集約!💪 `if (guard.err) return guard.err;` で TS narrowing が効いて `sub: UserSubscription` 取れる〜🎯 既存の `assertValidFeedHash` (hash 形式 validate) と隣接配置で security-critical な「認証 + 所有権チェック」二段が明示化〜🔒
- **API ルートの hash check 配置を `withSession` 外に統一したよ〜!⚡ (simplify 監査 80% 信頼度)** — `purge-content-cache` で feedHash 形式 validate を `withSession` 内で実行してて、不正な hash でも認証 round-trip を発生させる無駄があったのを、`route.ts` / `refresh.ts` と統一して **認証前 fast-fail** に変更!📦 後続実装も「hash check 外、subscription check 内」の規範レイヤリングに揃えれば OK〜🎀
- **AI 要約・翻訳の評価値 `["good", "neutral", "bad"]` を `AI_RATINGS` const + `AiRating` type で 1 ソース化!🎯 (simplify 監査 82% 信頼度)** — UI コンポーネント 2 箇所 + API 1 箇所 + hook 1 箇所の **計 4 箇所** で `["good", "neutral", "bad"] as const` を独立に重複してたのを、`src/types.ts` の `export const AI_RATINGS` + `export type AiRating = (typeof AI_RATINGS)[number]` に集約!💪 評価値追加・削除時の同期更新ミスを物理的に防止〜🛡️

### アクセシビリティっ

- **`UserSettingsModal` のタブで Arrow キーナビ追加!⌨️ (a11y 監査 95% 信頼度)** — タブリストの ARIA Authoring Practices §3.21 に準拠して、`ArrowLeft` / `ArrowRight` でタブ移動 (端でループ)、`Home` / `End` で先頭・末尾ジャンプができるように!💪 active タブのみ `tabIndex={0}`、他は `tabIndex={-1}` の roving tabindex pattern で、Tab キーで一気に panel body に飛べる〜🎯 WCAG 2.1.1 (Keyboard) 準拠〜🛡️
- **`CollectionDropdown` がキーボードからアクセス可能になったよ〜!⌨️ (a11y 監査 92% 信頼度)** — 元々マウス専用 (mousedown 外しのみ) で **キーボードからは完全に使えない** 状態だったのを、`ShareMenu` / `FilterMenu` の規範パターン (`usePortalMenu` + `useMenuKeyboard`) に揃えて修正!🎀 `aria-haspopup="menu"` / `aria-expanded` / `role="menu"` / `role="menuitem"` 追加で、Escape で閉じる + Tab cycle が効くように〜💎 `createPortal` + `position: fixed` で overflow:hidden な親の影響も受けない構造に!📦
- **`FeedQuickSwitchModal` (Cmd+K) で screen reader にカーソル位置を読み上げ!📢 (a11y 監査 88% 信頼度)** — Arrow Up/Down で項目を移動するクイック切替で、screen reader が「今どの項目がハイライトされているか」を一切読み上げない silent な状態だったのを修正!🔊 `<input>` に `role="combobox"` + `aria-autocomplete="list"` + `aria-activedescendant`、`<ul>` に `role="listbox"`、`<li>` 内 button に `role="option"` + `aria-selected` を追加〜🎯 ARIA combobox pattern (WAI-ARIA APG) 準拠〜🛡️

### バグ修正っ

- **記事詳細の画像 DL で wallhaven 等のフル解像度画像が DL されてなかった問題を修正したよ〜!📷 (#667)** — `<a href="フル画像.jpg"><img src="サムネ.jpg"></a>` 構造の記事で、`<img src>` がサムネ (170px 未満) で除外されて結果として OGP 画像しか DL されない状態に〜🥲 `collectImageUrls` / `collectImageUrlsFromHtml` に **anchor href 抽出ロジック** を追加して、`href` が画像拡張子 (jpg/jpeg/png/gif/webp/avif/svg) で終わる場合はその URL も収集対象に含めるよう修正!💪 内部の `<img>` が小さくて除外されても href のフル解像度画像は残る〜🎯 ギャラリー側 (#667 commit 7fa4eb2) と同じ問題が記事詳細側にもあったので両方解決!🛡️ TDD 全 9 ケース追加 (a href が画像 URL / 内部 img が小サイズ / 画像拡張子なし無視 / 拡張子大文字小文字 / クエリ文字列 / 重複排除 / data: 相対 URL 無視 / image-proxy URL)〜📦

### 激アツ新機能っ

- **ギャラリービューに自動スクロール機能追加!🎬 (#690 案 D ハイブリッド)** — ユーザー設定 → 表示タブ の「自動スクロール」で **5 段階の速度** (OFF / 遅 / 中 / 速 / スライドショー) を選べるように!🎀 連続スクロール (遅 30px/秒、中 60px/秒、速 120px/秒) は `requestAnimationFrame` ベースで滑らか〜⚡ スライドショーモードは 3 秒ごとに 1 viewport 分ジャンプ (Pinterest 風)〜🖼️ ホイール / タッチでの **手動スクロールで自動的に OFF** に戻るので「読みたい記事を見つけたら止まる」一時停止メカニズム内蔵!🛡️ 純粋関数 `computeContinuousScrollDelta` / `computeSlideshowJump` 等を `src/lib/gallery-autoscroll.ts` に切り出して TDD 全 22 ケース網羅 (5 速度 × 4 関数 + 境界値 / 不正値 / null fallback)〜📦 hook `useGalleryAutoScroll` で連続/スライドショー両モードの ライフサイクル管理 + 手動操作検出を集約〜📚

## 2026-05-09

### パフォーマンス改善っ

- **`useArticleViewContent` の `embedInfo` を useMemo で安定化したよ〜 (perf 監査 92% 信頼度)** — `extractEmbedInfo()` が **毎 render ごとに新オブジェクト reference** を返してて、`processedContent` useMemo の deps に直接入ってたから親 re-render の度に **HTML サニタイズパイプライン全体が再実行** されてた状態を発見!💥 TTS state 変化 (100ms 周期 + boundary event) や reader settings 変更で、長記事 (10-50KB HTML) の `processContent` / `wrapSentencesInHtml` / `collectImageUrlsFromHtml` が連鎖再計算 → 主スレッドブロック〜🥲 `useMemo([article?.link])` で安定化!🛡️
- **TTS 非対応ブラウザでは `wrapSentencesInHtml` を skip するようになったよ〜 (perf 監査 85% 信頼度)** — Web Speech API 非対応ブラウザ (一部 Firefox / Safari 古バージョン等) でも、`useArticleViewContent` が **毎記事 linkedom フル DOM parse + sentence span ラップ** を実行してた!📦 `SPEECH_SUPPORTED` モジュール定数で gate して非対応環境では完全 skip〜🛡️ `ArticleContentBody` は wrappedContent が null のとき processedContent に fallback する既存設計なので影響なし〜🎀

### バグ修正っ

- **`FeedQuickSwitchModal` に focus trap を追加したよ〜 (a11y 監査 88% 信頼度)** — 検索フィールドの「クリアボタン」から Tab を押すと **ダイアログ外へ抜けてしまう** WCAG 2.1.2 違反を発見!💥 Modal.tsx の canonical focus trap pattern (Tab 循環 + Shift+Tab 逆循環) をダイアログ container に追加〜🛡️
- **`EngagementSegmentButton` に `aria-pressed` を追加したよ〜 (a11y 監査 92% 信頼度)** — 「後で読む / ブックマーク / いいね」3 連トグルボタンが **トグル状態を screen reader に伝えていない** 状態だった!💧 同じ Header 内の `ToggleIconButton` / autoMode ボタンには既に `aria-pressed` があったので、sibling pattern drift パターン〜🎀 WCAG 4.1.2 Name, Role, Value 対応〜📚

### リファクタリングっ

- **`useStoredBoolToggle` 共通 hook を抽出したよ〜 (simplify 監査 88% 信頼度)** — `useAutoReadSettings` に **5 連の同型 `useState + setX(v=>!v) + storageSet` ブロック** が散在してた状態を解消!💡 `src/hooks/useStoredSetting.ts` に `useStoredBoolToggle(load, key, onValue?, offValue?)` を追加して、5 つの toggle (autoRead / autoTranslate / autoSummarize / autoAiBrowserOnly / deduplicateByLink) を **1 行宣言に集約** 〜📦 boolean 永続化エンコーディング ("1"/"0") を変更したいときも 1 箇所修正で済む形〜🛡️
- **`useLayoutSettings` の `imageDlFolder` を既存 `useStoredSetting` 抽象に統合したよ〜 (simplify 監査 90% 信頼度)** — `useStoredSetting<T extends string>` は元々 `string` も受け付ける設計なのに `imageDlFolder` / `imageDlFolderNsfw` だけ `useState + useCallback + storageSet` の 8 行 inline 実装で残ってた!📦 既存 enum 系設定と挙動・型を揃えて 1 行宣言に統一〜🎀
- **`assertValidFeedHash` 共通 helper を抽出したよ〜 (simplify 監査 82% 信頼度)** — `feedHash` パスパラメータ検証ガードが **5 つ以上の Route Handler に重複** してて、`purge-content-cache/route.ts` だけメッセージが `"Invalid feed hash"` で他 (`"Invalid feed"`) と乖離してた!💥 `src/lib/api-error.ts` に集約してメッセージも `"Invalid feed"` で統一〜🛡️ `feeds/[id]/route.ts` (DELETE / PATCH 両方)、`refresh / reinfer / purge-content-cache` 全て移行〜📚

### 激アツ新機能っ

- **「ブラウザ AI のみ使う」トグルで Workers AI への自動フォールバックを抑止できるようになったよ〜 (#700)** — ユーザー設定 → AI・通知タブ に **「ブラウザ AI のみ使う」トグル** を追加!🎀 ON にするとブラウザネイティブ AI (Chrome 翻訳・要約) が使えない記事では **自動翻訳・自動要約を完全 skip** して Workers AI へのフォールバックを発動させない〜🛡️ デフォルト OFF (既存挙動維持) なので影響範囲なし、ON にしたい人だけ恩恵を受けられる設計〜📦 手動の AI / 翻訳ボタンは影響を受けないからユーザーの明示的な選択は尊重される〜✨ 純粋関数 `shouldSkipAutoAi` を `src/lib/auto-ai-fallback.ts` に切り出して TDD 全 4 ケース網羅 (設定 OFF / ON × 利用可 / 不可 / 診断中)〜📚 `useBrowserAiAvailability` hook で mount 時に diagnoseSummarizer/Translator を 1 回だけ呼んで判定する設計〜🎯

- **TTS の音量をユーザー設定で調整できるようになったよ〜 (#699)** — ユーザー設定 → 表示タブ の **「読み上げ音声」セクションに音量スライダー** を追加!🎚️ 0% (ミュート) 〜 100% (最大) を 1% 刻みで調整できて、`localStorage` (`rss-tts-volume` キー) に永続化〜🎀 再生中に変更したら新音量で再生し直す挙動 (Web Speech API の `utterance.volume` は途中変更不可なので) 〜🛡️ 純粋関数 `clampTtsVolume` / `parseTtsVolume` を `src/lib/tts-volume.ts` に切り出して TDD 全 11 ケースで網羅 (NaN / Infinity / 範囲外 / 不正型 / 境界値 / 文字列 parse / 全部!)〜📦 `TtsAdapter` interface にも `volume` / `setVolume` を追加して将来の Piper wasm engine (#674) でも同様に音量制御可能な土台に〜✨

### バグ修正っ

- **モーダル系 3 つに focus trap を追加したよ〜 (a11y 監査 82-92% 信頼度)** — `SessionExpiredModal` / `FocusModeOverlay` / `ArticleDetailOverlay` の 3 つで **Tab キーがダイアログ外へ逃げる** WCAG 2.4.3 違反を発見!💥 `Modal.tsx` の canonical pattern (Tab 循環 + Shift+Tab 逆循環) をコピー反映〜🛡️ `ArticleDetailOverlay` には初期 focus + 復元の 3 点セットも追加 (Modal.tsx と同パターン)、`FocusModeOverlay` は既存の focus 復元はそのまま残して Tab トラップだけ追加〜🎀 `SessionExpiredModal` は単一 focusable element (ログインリンク) のみなので Tab / Shift+Tab を常にログインリンクへ戻す簡易版〜📦

### パフォーマンス改善っ

- **`useReadStateSyncApply` の notes / tagIds に構造的等価性ガードを追加したよ〜 (perf 監査 88% 信頼度)** — 2 秒毎に走るサーバー同期で `setNotesState(merged)` / `setTagIdsState(result)` が **内容変化なしでも毎回新 reference** を作って setState を呼んでた状態を発見!💥 `useFilteredArticles` の派生 useMemo (noteIds Set / タグ別ビュー等) が **2 秒毎に再計算** されて全記事フィルター pass の主スレッドブロックを発生させてたの〜🥲 #686 の `equalSnoozedUntil` パターンを踏襲して `equalNotes` / `equalTagIds` 純粋関数を `read-state-merge.ts` に追加 (TDD 全 19 ケース網羅) + setState 前の構造的等価性ガードを `useReadStateSyncApply.ts` に適用!🛡️ 内容変化なしの多数派ケースで setState を skip して reference を保持する形〜🎀

- **`useArticleViewContent` の `readingTime()` を useMemo で安定化したよ〜 (perf 監査 92% 信頼度)** — `readingTime()` は内部で `stripHtml` (8 regex passes) を呼ぶ重い計算なのに **bare で毎 render 実行** されてた状態を発見!💥 TTS state 変化 / reader settings 開閉 / scroll progress 発火など **親 re-render の度に長記事 (10-50KB HTML) を毎回 8 regex pass** で stripping してて主スレッドブロックの主因になってたの〜🥲 `useMemo([processedContent, article?.summary])` で安定化!🛡️ プロジェクトの「`createReadingTimeCache` を使う」ルール (#685) と整合させた形〜🎀

### リファクタリングっ

- **App.tsx Step 1u: `onFeedDeleted` を `selectFeedClearingArticle` 利用に簡素化 + useCallback 化 (#650 段階分割)** — App.tsx の `function onFeedDeleted` (7 行) が直接 `setSelectedFeedId(null)` + `setSelectedArticle(null)` を並べてた状態を解消!💡 Step 1n で導入済みの **アトミック解除操作 `selectFeedClearingArticle(null)`** を使う形にリファクタして、setter 並びの drift リスクを排除〜🛡️ あわせて `useCallback` 化で render-stability 向上 (consumer の `useFeedSidebarActions` の useMemo deps が安定化)〜🎀 行数自体は +2 (useCallback wrapper のオーバーヘッド) だけど、それと引き換えに **既存ヘルパーの再利用 + reference 安定化** を獲得!📦

- **App.tsx Step 1t: `useCollectionArticleIds` hook を抽出したよ〜 (#650 段階分割)** — App.tsx に残ってた最後のインライン `useMemo` (選択中コレクションに含まれる記事 ID の Set 導出、7 行) を `src/hooks/useCollectionArticleIds.ts` (28 行) に集約!📦 副次効果: App.tsx から `useMemo` のインポートが完全に削除できた〜🎀 残るは `useCallback` / `useState` の 2 つだけ!`react` からの import がほぼ純正の React 機能のみになって、App.tsx は **「composition オーケストレーター」としての性質が一層明確** に〜🛡️ App.tsx は 814 → 809 行 (-5 行)、累積で **1064 → 809 行 (-255 行 / 約 24% 削減)**!📚

- **App.tsx Step 1s: `AppOverlays` 集約コンポーネントを抽出したよ〜 (#650 段階分割)** — 3 ペイン手前の **グローバル UI 群 11 個** (`A11yHelpers` / `OfflineBanner` / `ToastContainer` / `ConfirmModal` / `AppModals` / `NSFWEyeAnimation` / `NewArticleBanner` / `FocusModeExitButton` / `FocusModeOverlay` / `ArticleDetailOverlay` / `ColumnResizeHandles`) を 53 行 JSX → `src/components/AppOverlays.tsx` (118 行) に集約!📦 App.tsx は 837 → 814 行 (-23 行)、**11 個のオーバーレイ系インポートを App.tsx から削除** 🎀 これで App.tsx の JSX 部分が「`<ThreePaneLayout>` → `<AppOverlays>` → `<AppSidebarPane>` → `<AppListPane>` → `<AppViewPane>`」の素直な 5 行 (内側) 構造に〜🛡️ 累積で App.tsx は **1064 → 814 行 (-250 行 / 約 23% 削減)**!📚

- **App.tsx Step 1r: `AppSidebarPane` 左ペインを抽出 → 3 ペイン対称構造完成!🎉 (#650 段階分割)** — 左ペイン (フィードサイドバー) の `<MobilePane><Skeleton><ErrorBoundary><FeedSidebarProvider><FeedSidebar 38 props/></FeedSidebarProvider></ErrorBoundary></MobilePane>` (54 行) を `src/components/AppSidebarPane.tsx` (56 行) に集約!📦 これで 3 ペイン (sidebar / list / view) すべてが `<App{Sidebar/List/View}Pane>` の対称構造に統一されたよ〜🎀 App.tsx は 844 → 837 行 (-7 行)、`FeedSidebar` / `FeedSidebarProvider` / `SkeletonSidebar` / `ErrorBoundary` / `MobilePane` の 5 インポートが削除できて App.tsx 上部もスッキリ〜📚 累積で App.tsx は **1064 → 837 行 (-227 行 / 約 21% 削減)**!🛡️
- **App.tsx Step 1q: `AppViewPane` 右ペインを抽出したよ〜 (#650 段階分割)** — 右ペイン (記事詳細) の `<MobilePane as="main"><ErrorBoundary><ArticleView ... /></ErrorBoundary></MobilePane>` (5 行) を `src/components/AppViewPane.tsx` (33 行) に集約!📦 Step 1p の `AppListPane` と完全対称の薄いラッパーで、JSX 構造の対称性を確保〜🎀 `articleViewProps: ComponentProps<typeof ArticleView>` 型継承で ArticleView の prop signature 変化に自動追従〜🛡️ `ArticleView` のインポートも App.tsx から削除〜📚 (App.tsx 行数は変化なし - 削除と新インポート行が相殺、symmetry のための extraction)
- **App.tsx Step 1p: `AppListPane` 中央ペインを抽出したよ〜 (#650 段階分割)** — 中央ペイン (記事一覧) の **MobilePane + Skeleton 分岐 + ErrorBoundary + ArticleList (29 props)** の 35 行 JSX を `src/components/AppListPane.tsx` (60 行) に集約!📦 `articleListProps: ComponentProps<typeof ArticleList>` 型継承で **ArticleList の prop signature が変化しても本コンポーネントの修正不要** にしたよ〜🎀 App.tsx は 854 → 844 行 (-10 行)、`ArticleList` / `SkeletonArticleList` のインポートも削除〜📚 中央ペイン特有の MobilePane 属性 (`id="main-content"` / `tabIndex={-1}` / `className="focus:outline-none"`) も AppListPane 内に閉じ込めて、a11y まわりの設定が散らないように〜🛡️
- **App.tsx Step 1o: `MobilePane` ラッパーコンポーネントを抽出したよ〜 (#650 段階分割)** — App.tsx 内で 3 ペイン (`sidebar` / `list` / `view`) それぞれに **6 行のラッパー** (`<div data-pane=... className="..." style={{transform}} aria-hidden inert>`) が重複してた状態を解消!📦 `src/components/MobilePane.tsx` (66 行) に集約して、`aria-hidden` / `inert` の同期 (PC 時は無効) + `transform` 計算 + `data-pane` 属性付与を 1 箇所に閉じ込めたよ〜🎀 中央ペインだけ `<main>` 要素を使う必要があるため `as` prop で要素タイプ切替に対応〜🛡️ App.tsx は 866 → 854 行 (-12 行)、`getMobilePaneTransform` のインポートも削除できて整理〜📚

- **App.tsx Step 1n: `useFeedSelection` に選択操作 helper 2 種を追加したよ〜 (#650 段階分割)** — App.tsx 内に **同じ意味のインライン lambda** が 2 箇所散在してた状態 (`onSelectFeed: (id) => {setSelectedFeedId(id); setSelectedArticle(null);}` と `setSelectedFeedIdNull: () => {setSelectedFeedId(null); setSelectedGroupId(null); setSelectedArticle(null);}`) を `selectFeedClearingArticle` / `clearFeedGroupArticleSelection` の useCallback として `useFeedSelection` 内部に移動!📦 「選択操作」の責務が同 hook に集約されてアトミック性が明示的に〜🎀 App.tsx は 871 → 866 行 (-5 行)、useCallback 化で render-stability 向上の副次効果も〜🛡️
- **App.tsx Step 1m: `useTotalUnreadCount` hook を抽出したよ〜 (#650 段階分割)** — 「全記事未読件数を 200ms デバウンス付きで計算」する 7 行のクラスタ (`useDebounce` x2 + `useMemo`) を `src/hooks/useTotalUnreadCount.ts` に集約!📦 App.tsx は 879 → 871 行 (-8 行)、`isArticleRead` / `useDebounce` のインポートも削除できてさらにスッキリ〜🎀 連続した既読操作 (j キー連打) で `articles.filter()` が毎フレーム走るのを抑制するという「未読カウント計算」の単一目的が明示的に〜🛡️
- **App.tsx Step 1l: `useReaderSettingsValue` hook を抽出したよ〜 (#650 段階分割)** — App.tsx 内に 86 行のインライン `useMemo<ReaderSettings>` (40 フィールド + 同じ deps を 2 回手書き) があったの〜🥲 新フィールド追加時に `useMemo` の戻り値と deps 配列の両方を同期更新する必要があり、ミスりやすかった!💧 `src/hooks/useReaderSettingsValue.ts` (104 行) に集約して、App.tsx は 922 → 879 行 (-43 行) に減量〜📦 `ReaderSettings` 型を入力 props にとって useMemo で安定化する単純構造で、後方互換 100%〜🛡️ Step 1a-1k と同じ「1 hook ずつ別 commit」運用!

### 激アツ新機能っ

- **オートモード時に要約結果を TTS で読み上げる機能を追加したよ〜 (#696)** — オートモード (auto-read) ON + 自動要約 (`autoSummarize`) ON のとき、本文の代わりに **AI 要約結果を読み上げ対象** にする派生機能を実装!🎀 `buildTtsText` に第 4 引数 `summaryText` を追加して優先順位の最上位に配置 (要約 > 翻訳 > 本文 > サマリ)〜📚 さらに `shouldStartAutoSpeak` に `autoSummarizePending` ガードを追加して、要約完了前に本文で speak が走らないように〜🛡️ TDD 9 ケース追加 (`buildTtsText` 5 ケース + `shouldStartAutoSpeak` 4 ケース)〜✨ 手動 TTS 起動 (記事詳細ヘッダーボタン / Shift+P) では従来通り本文を読み上げ — オートモード限定の挙動でユーザーの意図を尊重!

- **自動要約機能を追加したよ〜 (#695)** — 自動翻訳 (`autoTranslate`) と同じパターンで、`autoSummarize` ON 時に **記事本文取得完了後に自動で AI 要約** を実行!✨ 設定は ユーザー設定 → AI・通知タブ の「自動要約」トグル〜🎀 既存の「Chrome 要約 (Built-In AI) / Workers AI フォールバック」判定はそのまま再利用するから、Chrome 138+ 環境ならローカル AI で高速要約、未対応環境では Workers AI が自動でフォールバック〜⚡ 実装は `autoTranslate` と完全対称: localStorage `rss-auto-summarize` 永続化 + `useArticleViewShortcuts` の自動要約 effect (`autoSummarizeTriggered` ref で同記事の二重発火防止) + 設定 UI トグル〜📦 #696 (オートモード時に要約を読み上げる) はこの機能を前提とする派生機能で、別途追跡!

### UX 改善っ

- **AI 要約パネルに「Chrome 要約 / Workers AI」プロバイダーバッジを表示するようにしたよ〜 (#697)** — 翻訳パネルには既に `provider === "browser" ? "Chrome 翻訳" : "Workers AI"` バッジが出てたけど、要約パネルには出てなかったから対称的に追加!🎀 `useArticleAi.aiResultProvider` を expose して、`ArticleAiPanel` の「AI 要約」ラベル右隣に小さなバッジ表示〜📍 `useArticleViewState` → `ArticleView` → `ArticleAiPanel` の prop chain を 1 段ずつ通し、`AiOperationResult.provider` の jsdoc も「翻訳時のプロバイダー (要約では未設定)」→「翻訳・要約のプロバイダー」に修正 (古いコメントが実装と乖離してた)〜📚

### バグ修正っ

- **ブラウザ要約 API に `outputLanguage` / `expectedInputLanguages` を指定したよ〜 (#664)** — Chrome の Summarizer API を呼ぶたび `"No output language was specified in a Summarizer API request..."` 警告が DevTools に出てて、ユーザー報告でも見えてた状態を修正!💥 公式サポート言語 `[en, es, ja]` の中から日本語 RSS リーダーらしく **`outputLanguage: "ja"` 固定** + `expectedInputLanguages: ["ja", "en"]` をヒントとして指定〜🇯🇵 警告だけでなくモデル側の言語推定誤判定も解消されるはずだから、`"The model process crashed too many times"` 系の不安定さも改善が期待できる〜🛡️ TDD 3 ケース追加 (公式サポート言語 / ja 固定 / 英日混在ヒント)〜📚
- **`pruneOldReadIds` が `publishedAt: null` 記事の readId を永久蓄積するバグを修正したよ〜 (code-review 監査 Important Issue)** — `isArticleRead` (`article-filter.ts`) は `publishedAt ?? createdAt` のフォールバックで `readBeforeTimestamp` 以前を一括既読扱いするのに、`pruneOldReadIds` は `publishedAt` だけ見て `null` だと早期 continue してたの〜💥 これだと `feedHash: "__saved__"` の手動保存記事 (publishedAt が常に null) や RSS で publishedAt 抜けの記事の readId が **永久に R2 / localStorage に蓄積** される潜在バグ💧 #635 A1 (readIds 物理削除) の効果を半減させてた〜🥲 `tsRaw = article.publishedAt ?? article.createdAt` のフォールバックチェーンを揃えて `isArticleRead` と判定軸を完全一致させたよ〜🛡️ TDD 2 ケース追加 (publishedAt:null + createdAt 古い → 削除 / 境界値の整合)〜📚
- **`GET /api/articles?since=` の NaN 検証を追加したよ〜 (code-review 監査 Critical Issue)** — `parseInt("abc", 10)` が NaN を返すと `new Date(...).getTime() > NaN` が常に false になり「全フィードがスキップされて全記事が消える」silent failure 状態だったの〜🥲 通常のクライアントは `Date.now()` の整数を渡すので発生確率は低いけど、ブラウザ拡張・プロキシ・将来の実装ミスで NaN が混入したら無音でデータが消える深刻なバグ!💥 `^\d+$` で厳密検証して、不正値は **`INVALID_SINCE` (400)** で拒否する設計に修正〜🛡️ api-spec.md にもエラーコード追記!📚

### ドキュメント整備っ

- **docs drift 6 件を omnibus 修正したよ〜 (docs drift 監査)** — `architecture.md` のテストカバレッジマップに `share-targets.spec.ts` 追加、`article-view/` ブロックに `ArticleContentBody` / `EmptyArticleView` / `FetchFullContentArea` / `AddToCollectionMenu` の 4 ファイルを追記、`api-spec.md` に `DELETE /api/content` / `POST /api/test/seed` / `DELETE /api/test/seed` の 3 endpoint spec を追加!📚 すべて pure docs 修正で 1 commit に集約〜🎀

### セキュリティ対策っ

- **`POST /api/engagement` に購読チェックを追加したよ〜 (security 監査 Issue 2)** — エンゲージメント記録 API が認証だけ通せば任意の `feedHash` を受け付けてた状態を発見!💥 ユーザーが自分が購読していない `feedHash` を送信して `users/{userId}/engagement.json` の `topFeeds` 統計を任意に汚染できた状態 (cross-user 影響なしだが self-data + 推薦生成精度に影響)〜🥲 #691 と同パターンで `readUserSubscriptions` で購読チェックを追加して未購読 feedHash は 400 で拒否!🛡️

### リファクタリングっ

- **エンゲージメント 3 連トグルボタンを EngagementSegmentButton に集約したよ〜 (simplify 監査 Issue 2)** — `ArticleHeaderEngagement.tsx` の「後で読む / ブックマーク / いいね」3 button がほぼ同形 (`px-2.5 py-1.5 transition-colors` + active/inactive 色 + svg 14/12px) だったから、新規 `EngagementSegmentButton.tsx` (45 行) に共通テンプレートを抽出!🔧 デザイントークンの差 (`bg-ink` / `bg-bookmark` / `bg-rose-400`) は `activeClass` props で吸収、SVG icon は children 経由で注入する設計〜🎀 ArticleHeaderEngagement は 213 → 203 行 (-10 行) でロジックが見やすく〜📦 セグメント化ラッパー (`overflow-hidden` + `<div className="w-px ...">` 区切り) は親側に維持!

### ドキュメント整備っ

- **`coding-conventions.md` 段階的分割 Step 5 をやったよ〜 (#694 Step 5)** — ユーザー採用「案 A: browser-platform.md 新設」に従って **5 セクション + 2 派生ケース 計 248 行** を新ファイル `browser-platform.md` へ集約!🎀 抽出対象: 上流 API プロキシヘッダ補完 / silent fallback 禁止 (+ availability() 入力引数ログ派生) / ブラウザ最低バージョン定数 / 本番 localStorage gate デバッグ (+ AbortController/Ref 状態スナップショット派生) / 永続化 state TTL 防御チェック〜📚 各セクション位置に `→ browser-platform.md を参照` の redirect リンクを残して発見性維持!`coding-conventions.md` は 1312 → 1062 行 (Step 1〜5 累計で **1785 → 1062 / -723 行 / 40% 削減**)、`browser-platform.md` は 275 行〜📦 `rule-maintenance.md` の 800 行閾値超過から 1.3 倍まで縮小!

### リファクタリングっ

- **シェアターゲット起動ロジックを純粋関数に集約したよ〜 (simplify 監査 Issue 1)** — `ArticleHeaderShare.tsx` と `ShareMenu.tsx` に「`clipboardText` 有り → copy → open / 無し → 直接 open」の同じ条件分岐 + 5〜10 行のフローが両方に書かれてたから、`triggerShareTarget(target, link, title): Promise<{copied}>` を `shareTargets.ts` に新設して 2 consumer から呼び出す形に統合〜🎀 ShareMenu の `openShareWindow` dead code も削除!🧹 TDD 3 ケース (clipboard 成功 / 失敗 / clipboardText なし) で挙動保証〜🛡️

### バグ修正っ

- **オートモードで本文取得が即 abort されて読み上げ起動しないバグを修正したよ〜 (#678 真因確定)** — `useArticleContent` の `useEffect[articleId]` が **子 (AutoReadController) → 親 (useArticleContent)** の effect 発火順のせいで、AutoReadController が effect(1) で起動した新しい fetch を直後に abort してしまう深刻なバグを発見!💥 ユーザーログ提供で `articleId-effect-fired` が `hadController: true` で 2 回目発火している経路が確定〜🔍 **fetchAbortControllerRef に articleId を併記** して「自身と同じ articleId 用の controller は abort しない」(= 古い articleId 用のみ abort) 設計に変更!💡 これでオートモード遷移時に新 fetch が完走 → 全文取得 → 全文 TTS 読み上げが正常動作するよ〜🚀

### アクセシビリティ改善っ

- **モーダル類のフォーカス管理を 3 件改善したよ〜** — UX 監査で発見!🛡️ (1) `FocusModeOverlay`: フォーカスモード解除時に元のフォーカス位置へ戻すパターンを `ConfirmModal` (#687) と同じ設計で実装!キーボードユーザーが `\\` で起動 → `Esc` で抜けても元の記事リスト項目にフォーカスが戻るよ〜🎯 (2) `FeedQuickSwitchModal`: `?` キーで開いた時のトリガー要素 (記事リスト等) を returnFocusRef に退避して閉じる時に復元!💡 (3) `SessionExpiredModal`: マウント時にログインリンクへ自動フォーカスして、スクリーンリーダーユーザーがモーダル出現を即座に検知できるように〜🦮 全て WCAG 2.4.3 (Focus Order) 準拠!

### パフォーマンス改善っ

- **記事フィルタリングの検索クエリ AST パースを 1 度だけにしたよ〜** — `matchesAdvancedQuery` を記事ごとに呼ぶと内部で `parseSearchQuery` が 1000 件 × 1 回 = 1000 回実行されて、複合クエリ (OR / フレーズ / フィールド) ほど線形にコスト増加してたの〜🥲 `compileSearchQuery` を新設して **AST を 1 度だけパースして bind した evaluator** を返す設計に変更!💡 1000 件・複合クエリで AST パース 1000 回 → 1 回になり、検索キー入力ごとのフィルタリング体感ラグが大幅改善〜🚀 TDD 5 ケースで evaluator の整合性を保証!🛡️

### バグ修正っ

- **cron の `feed-last-fetched.json` が今回 fetch しなかったフィードの timestamp を消してた問題を修正したよ〜** — cron の最後に `r2Put` でファイル全量上書きしてたから、inactive / cooldown / エラースキップで今回 fetch されなかったフィードの過去 timestamp が消えて、次回 `/api/articles?since=` で対象フィードの `meta.json` 個別 GET (N+1 問題) が再発してたの〜🥲 `r2Get` で既存値を読んでマージしてから `r2Put` する設計に修正!💡 50+ フィード購読ユーザーで cron tick あたり R2 GET 1 回追加 (微小コスト) と引き換えに、`/api/articles` 呼出ごとの N+1 GET (10〜30 個 / 呼出) を完全排除〜🚀

- **サイドバー未読カウントが既読操作してもすぐ更新されない問題を修正したよ〜** — `useSidebarFeeds` の未読集計 useMemo の deps が `useSyncedRef` 経由になってて、ref のオブジェクト identity は永久に変わらないから既読操作してもメモが再計算されない深刻なバグを発見!💥 ユーザー視点では「記事を既読にしてもサイドバーの未読バッジが 5 分間 (cron ポーリング間隔) 古いままに見える」状態だったよ〜🥲 ref を撤去して `[articles, readIds, readBeforeTimestamp]` を直接 deps に入れる実装に戻したの〜🛡️ 50 フィード規模でも O(n) 単純ループで <2ms の計算なので perf 影響なし!🚀

### リファクタリングっ

- **App.tsx からアクセシビリティ補助を分離したよ〜 (#650 段階分割)** — skip-to-content link と aria-live announcement region (sr-only) を `A11yHelpers.tsx` に切り出し!🔧 App.tsx 925 → 916 行 (-9 行)、累計今サイクル -45 行〜🎀

- **App.tsx からフォーカスモード解除ボタンを分離したよ〜 (#650 段階分割)** — listFocusMode 時に右上 PC 限定で表示する解除ボタン (SVG パス含む 24 行) を `FocusModeExitButton.tsx` に切り出したよ〜🔧 listFocusMode=false なら null 返しで早期 return!📦 App.tsx 947 → 925 行 (-22 行)、累計 961 → 925 行 (-36 行)〜🎀

- **App.tsx からカラムリサイズハンドルを分離したよ〜 (#650 段階分割)** — 3 ペインの「サイドバー / リスト」境界のリサイズ用 `<div>` ペアが App.tsx に直書きで 22 行残ってたから、`ColumnResizeHandles.tsx` に切り出したよっ🔧 listFocusMode 時は null 返しで早期 return、共通の `baseClass` 文字列を関数内に集約して 2 つの handle で重複してた className を 1 箇所に〜🎀 App.tsx 961 → 947 行 (-14 行)、見通しがちょっと良くなった!📦

### バグ修正っ

- **Chrome 138+ なのに端末上の要約が使えない問題を修正したよ〜 (#664)** — `Summarizer.availability({ type: "tl;dr" })` でセミコロン入りの非標準値を渡してたから、Chrome の API が **常に `"unavailable"` を返して** 端末上の要約が永遠に使えない状態になってたの〜🥲 公式仕様 (https://developer.chrome.com/docs/ai/summarizer-api) では `type` の有効値は `"tldr"` (セミコロン無し) なので、`SUMMARIZER_OPTIONS` 定数に集約して **`"tldr"` に修正**!💡 これで Chrome 138+ + 22GB 空き + GPU 4GB VRAM (or CPU 16GB RAM 4 コア) を満たす環境では端末上の Summarizer API が正しく動作してコスト・レイテンシが大幅削減されるよ〜🚀 TDD で `SUMMARIZER_OPTIONS.type === "tldr"` をテスト追加して同じセミコロン罠を再発防止!🛡️

### ドキュメント整備っ

- **`coding-conventions.md` 段階的分割 Step 4 をやったよ〜 (#694 Step 4)** — Step 3 (React Context + 早期return + 子hidden) に続き、Step 4 では ResizeObserver (26行) / AbortController.abort() 伝播範囲 (47行) / useEffect 依存キー罠 slice() (32行) / モード OFF 時副作用停止 (22行) / ブラウザ API 遅延通知ペアパターン (34行) の **5 セクション計 161 行** を `react-patterns.md` へ集約！🎀 各セクション位置に redirect リンクを残して発見性維持〜📚 `coding-conventions.md` は 1299 → 1158 行 (Step 1+2+3+4 累計で **1785 → 1158 / -627 行 / 35% 削減**)、`react-patterns.md` は 525 → 686 行で React/ブラウザ API 関連 16 パターンを集約！残 Step 候補は silent fallback / ブラウザ最低バージョン定数 / 永続化 state TTL の **browser-platform クラスター**(別ファイルに分割するかも判断要)〜📦

- **`coding-conventions.md` 段階的分割 Step 3 をやったよ〜 (#694 Step 3)** — Step 2 (大規模コンポーネント分割) に続き、Step 3 では React Context (65行) / 早期 return TS narrowing (41行) / 子コンポーネント hidden fallback (61行) の **3 セクション計 167 行** を `react-patterns.md` へ集約！🎀 各セクション位置に redirect リンクを残して発見性維持〜📚 `coding-conventions.md` は 1451 → 1299 行 (Step 1+2+3 累計で **1785 → 1299 / -486 行 / 27% 削減**)、`react-patterns.md` は 358 → 525 行で React 関連 11 パターンを集約完了！

- **`coding-conventions.md` 段階的分割 Step 2 をやったよ〜 (#694 Step 2)** — Step 1 (state/ref 4 セクション) に続き、Step 2 では「大きいコンポーネントの機能別分割パターン」(本体 + 4 派生ケース) ~165 行を `react-patterns.md` へ抽出！🎀 派生ケース内訳: hook を 1 つずつ別 commit / Phase 1: 純粋関数+TDD / Phase 2: UI 統合 / Phase 0: 型抽象化のみ先行 / 機能別分割後の逆方向集約。`coding-conventions.md` は 1605 → 1451 行 (Step 1 と合算で 1785 → 1451 / -334 行)、`react-patterns.md` は 193 → 358 行〜📚 残 Step 候補は React Context / 早期 return TS narrowing / 子の hidden fallback など。

- **`.claude/rules/coding-conventions.md` (1785 行) の段階的分割 Step 1 をやったよ〜 (#694 Step 1)** — `rule-maintenance.md` の 800 行閾値を 2.2 倍超えてたから、テーマ別に分割する案 C (段階的分割) を着手〜🎀 Step 1 として React state/ref/useEffect クラスター 4 セクション (~189 行) を新ファイル `react-patterns.md` に抽出！🔧 抽出対象: 構造的等価性ガード / ref vs state / trigger counter / ref 論理リセットポイント (+ 実行済み ID ref 派生)。`coding-conventions.md` は 1605 行に縮小、抽出先への redirect リンクを残して発見性を維持〜📚 Step 2 以降で React Context / hook 設計 / 大規模コンポーネント分割等を順次抽出予定！

### リファクタリングっ

- **仮想スクロール item wrapper を VirtualRow に集約したよ〜 (#692)** — `CompactListBody` / `CardBody` / `MagazineBody` の 3 ファイルでほぼ同一の絶対配置 div ブロック (position: absolute / transform: translateY / 削除アニメ用 transition) が重複してたの〜🥲 `VirtualRow` ヘルパーコンポーネントを新設して 3 箇所を集約〜🔧 各ファイル ~10 行削減 (計 ~30 行)、CardBody の padding 等のレイアウト固有スタイルは `extraStyle` prop で受け取る設計〜🎀 virtualizer の挙動を変える際の同期修正コストが消滅！

### セキュリティ対策っ

- **cache-purge エンドポイントが他人のキャッシュを無効化できる権限不備を修正したよ〜 (#691)** — `POST /api/feeds/{feedHash}/purge-content-cache` が **認証だけ** チェックして購読チェックを欠いてた〜🥲 任意の認証済ユーザーが「他人が購読中のフィード feedHash」に対して purge を実行すると、shared Cloudflare Cache (最大 5,000 記事分) を無効化できて他ユーザーの読み込み体験を意図的に劣化させる cache busting DoS が成立してたの！💥 `readUserSubscriptions` で購読チェックを追加して、**未購読フィードは 404** で拒否するように修正〜🛡️ 同様に `DELETE /api/content?url=...` も shared cache (ユーザー横断) 削除を撤廃して、自分の clip cache (ユーザー別 key) のみ削除する仕様に変更！shared cache は TTL (7日) で自然失効に任せ、フィード単位の一括クリアは購読チェック付きの purge エンドポイント経由に統一〜🔒

### UX改善っ

- **記事本文取得が 429 (レート制限) のとき「取得できませんでした」だけだった問題を直したよ〜 (#688)** — `useArticleContent` が `res.ok` チェックを欠いてて、429 / 502 / 503 等の HTTP エラーを silent にスルーしてた〜🥲 ユーザーは「待つべきか / リトライすべきか / 永続的なエラーか」が判断できなかったの！💥 `src/lib/classify-http-error.ts` 純粋関数を新設して、HTTP ステータスを `rate_limit` / `server_error` / `client_error` / `network` / `unknown` に分類 + `formatHttpErrorMessage` で 429 のときは `Retry-After` ヘッダーを秒数表示に整形〜🚀 「レート制限中です。30秒後に再試行してください。」のような具体的なメッセージが出るように！TDD 30 ケース全分岐網羅 (15 ステータス分類 / 9 メッセージ整形 / 6 retryable 判定)。

### バグ修正っ

- **ConfirmModal を閉じたあとフォーカスがトリガー要素に戻らない問題を直したよ〜 (#687)** — `Modal.tsx` には `returnFocusRef` パターンがあるのに、`ConfirmModal.tsx` だけ抜けてた〜🥲 削除確認ダイアログを ESC やキャンセルで閉じた後、フォーカスが `document.body` に飛んじゃってキーボードユーザーは「次の Tab がどこに飛ぶか」分からなくなる状態だったの！💥 WCAG 2.4.3 (Focus Order) 違反！🛡️ 開く前の `document.activeElement` を ref に保存して、閉じる時に DOM 内に存在すれば `focus()` を戻すように修正〜🎀 スクリーンリーダーユーザーには特にクリティカル (フォーカス位置 = 読み上げ位置)。TDD 3 ケース (基本復元 / トリガー削除時の安全 / 連続開閉の独立性) 全 Green。

### パフォーマンスっ

- **snoozedUntil の reference 不安定で 2 秒毎に主スレッドブロックしてた問題を直したよ〜 (#686)** — `useReadStateSyncApply` がサーバーマージ後に `setSnoozedUntil(new Object)` を呼ぶせいで、内容が変わっていなくても reference が更新されてた〜🥲 これが `useFilteredArticles` の `structuralFiltered` useMemo の依存配列に入ってるから、**2 秒毎に全記事フィルター再実行 → 500 記事で 20-80ms の主スレッドブロックが常時発生** してたの！💥 `equalSnoozedUntil` 純粋関数を `read-state-merge.ts` に追加して、マージ結果が前回と構造的に等しければ setState を skip するように修正！🚀 reference 保持で useMemo の再計算を完全に止められたわ〜🎀 TDD 10 ケース (空 / 同一 reference / 同 key 同 value 別 reference / キー順序差異 / 片側欠落 / 値差異 / キー名差異 / 100 件全一致 / 100 件 1 件差異) で等価判定を網羅。
- **読了時間フィルターが激重だった問題を直したよ〜 (#685)** — `readingTime()` は内部で `stripHtml()` を呼んで正規表現を **8 回反復** する重い処理だったの〜🥲 これがフィルター呼出のたびに全記事 (500+ 件) で再計算されてて、`readingTimeRange` を切替えるたびに 150-400ms の主スレッドブロックが発生してた！💥 `createReadingTimeCache()` 純粋関数を新設して `useFilteredArticles` 内で `articles` reference 変化時のみリセットされる Map<articleId, mins> でメモ化〜🚀 同じ記事の読了時間は 1 回計算したら以降キャッシュヒット。TDD 7 ケース (キャッシュヒット / 別 id 別計算 / fallback / 100 件投入 / インスタンス独立性) で安全性を保証〜🎀

### UX改善っ

- **読み上げ音声 (voice) の選択を設定モーダルに移動したよ〜 (#675 Phase 1b)** — これまで記事ヘッダーの隅にあった voice 選択 dropdown は記事を開くたびに表示されてヘッダーが情報過多だったの〜🥲 設定モーダル → 表示タブ → 「読み上げ音声」セクションに引越しして、1 度設定すれば全記事に適用される自然な UX に〜🎀 同セクションには現在の TTS エンジン名 (Web Speech API) も表示。Phase 2 (#674 Piper wasm) でエンジン切替 UI もここに増える予定！記事ヘッダーは ▶︎ 再生 / 速度 / オートモード ボタンのみのスッキリ表示に〜✨

### リファクタリングっ

- **TTS adapter を `TtsAdapterContext` で全 consumer 共有化したよ〜 (#675 Phase 1b)** — `useSpeechSynthesis()` を App.tsx で 1 回だけ呼んで `<TtsAdapterProvider>` 配下に注入！🔧 記事ヘッダー TTS と設定モーダル voice 選択が同じ adapter インスタンスを共有するから、isPlaying / rate / voice が常に同期。Phase 2 で `usePiperTts()` に差し替えるとき、Provider value を切替えるだけで全 consumer が自動追従する設計〜🎀 useArticleViewTts は `useTtsAdapter()` を介して context から adapter を取得、voice 関連 props (`ttsVoices` / `ttsVoiceUri` / `setTtsVoiceUri`) は ArticleHeader 経路から完全削除。

- **TTS エンジン抽象化レイヤー `TtsAdapter` を導入したよ〜 (#675 Phase 1a)** — 既存の Web Speech API と将来の wasm 実装 (Piper / つくよみちゃん #674) を共通インターフェース経由で扱えるように準備〜🔧 `src/lib/tts-adapter.ts` に `TtsVoice` / `TtsEngineId` / `TtsAdapter` 型を定義。`useSpeechSynthesis` が `TtsAdapter` を返すように型付けして、内部で `SpeechSynthesisVoice` → `TtsVoice` に map することで Web Speech 固有 field (`localService` 等) を捨てる構造に〜🎀 consumer (`useArticleViewTts` / `ArticleHeader` / `ArticleHeaderAiTts`) も `TtsVoice[]` 型に揃えて engine 種別非依存に！TDD 7 ケース (voice 変換 / 既存純粋関数との互換 / 型契約) で抽象化境界を保証。

### 激アツ新機能っ

- **記事一覧を選択中の記事にアンカーするショートカット `.` を追加したよ〜** — Issue #684。`.` (ピリオド) キーで、現在選択中の記事を **記事一覧の中央** にスクロールしてアンカー！🎯 ロングスクロールで現在位置を見失った時に「今どこ？」を一発復帰〜📍 全レイアウト (compact / list / card / magazine / gallery) に対応、virtualizer の `align: "center"` と `block: "center"` で確実にセンタリング。通常の選択時 (記事を切り替えた時) は従来通り `align: "auto"` (見えていればスキップ)、手動アンカー時のみ強制センタリングの 2 段挙動。
- **オートモードがリロード後も自動再開するようになったよ〜** — Issue #679 案 A 採用。デプロイで Cloudflare CI/CD のリロードが入るたびオートモードが切れる問題に対応！⚡ `localStorage` に `{ enabled, savedAt }` を保存して、リロード時に **1 時間以内** なら自動的に ON で起動〜🎀 期限超過 / 時計戻り / 不正データ時は防御的に OFF。`shouldRestoreAutoMode` 純粋関数 + TDD 23 ケース全分岐網羅 (parse / shouldRestore / serialize / 期限定数 / round-trip / 境界値 / カスタム ttlMs)。
- **オートモードに診断ログを追加したよ〜 (#678 案 C)** — 「次の記事に遷移したけど読み上げが始まらない」原因究明のため、`localStorage.setItem('rss-debug-autoread', '1')` で 10 種の診断ログが Console に出るように！🔍 fetch トリガー / speak トリガー / fetch 開始/完了/失敗の各イベントをログ化して、ユーザー再現時の状態を可視化〜📊 デフォルト OFF なので一般ユーザーの DevTools は汚さない設計。

### バグ修正っ

- **画像主体ページで主要画像が本文取得時に取りこぼされる問題を直したよ〜** — Skebetter のような漫画ビューワで、記事本文のはずの 2 枚の画像が Readability に「推薦」セクションと混同されて取りこぼされる症状を発見〜🥲 サイト構造によっては Readability のテキスト密度ベース判定では本文を正しく特定できないの！💥 `extractJsonLdImages` / `appendMissingJsonLdImages` 純粋関数を新設して、`<script type="application/ld+json">` の Article 型 `image` 配列から **記事の主要画像** を抽出 → 抽出結果に含まれていない URL は `<div hidden>` で末尾補完するようにしたよ〜🛠️ クライアント側の ImageGallery がこれを拾って表示するから、Readability が落とした画像も復活！TDD 17 ケース全分岐網羅 (Article 各型 / image の string/array/ImageObject 形式 / @type 配列対応 / data: 除外 / 不正 JSON / 重複除去 / append 補完)。
- **記事本文の「謎の空白領域」問題を直したよ〜** — Twitter / Skebetter 系の SVG sprite を多用するサイトで、Readability 抽出後に `<svg><use href="#i-twitter">` のような **孤立 SVG icon 参照** が記事内に多数残ってたの〜🥲 SVG はデフォルト 300×150px で描画されるから、icon 1 個ごとに巨大な空白が生まれて「ガタつき」「謎の空白」状態に！💥 `removeOrphanedIconSvgs` 純粋関数を `html-noise-removal.ts` に追加して、`<use>` のみで構成された空 SVG は除去するように〜🛠️ ネストした SVG (`<svg><svg><use></svg></svg>`) にも対応する不動点反復で漏らさず除去！TDD 13 ケース全分岐網羅 (孤立 use / href 形式 / 複数 use / path 等の実コンテンツ保持 / 親 a 残し / 属性保持 / ネスト)。

### 激アツ新機能っ

- **ギャラリービュの列数設定に「1」を追加したよ〜** — Issue #681。`GALLERY_COLUMNS_CYCLE` に `"1"` を追加して、シングルカラム表示が選べるようになったよ〜🎀 縦に大きく一枚ずつ表示できるから、Pinterest 風じゃなくてフィード風に流したい時に便利〜📜 通常モードもフォーカスモードも両方対応！

### バグ修正っ

- **記事本文の小さい画像が画面いっぱいに引き伸ばされる問題を直したよ〜** — Issue #680。HTML の `<img>` に `width` / `height` 属性がないフィードだと、`fixImageDimensions` が inline `max-width` を付けられず、CSS `width: 100%` で 100x100 の小さい画像も画面幅いっぱいに引き伸ばされてたの〜🥲 `useArticleImageMaxWidth` hook を新設して、runtime で `naturalWidth` を読み取って `max-width: Npx` を補完するように修正！🔧 既存 inline `max-width` がある場合は上書きしないので `fixImageDimensions` の結果は安全に保たれるよ〜📐
- **ギャラリーで全画像が minPx 未満で hidden になると「タイトルだけ表示」になる問題を直したよ〜 (#671 後追い)** — ユーザー報告: 「修正してもらったはずだけど、まだ表示されないパターンがある」🥲 `FilterableGalleryImage` の `minPx` フィルタで全 prefetched 画像が hidden になると、`imageSource === "prefetched"` だから No Image プレースホルダ条件にも該当せず、空コンテナで「タイトルだけ」状態だったの〜！`onHide` コールバックで hidden カウント管理 → 全件 hidden + thumb あり → thumb 描画 / + thumb なし → No Image プレースホルダにフォールバック！🛡️
- **ギャラリー prefetch の 200 件キャップを撤廃したよ〜 (#673 続)** — 前回修正で「default 20 → 200」にしたけど、内部上限 (`Math.min(x, 200)`) も 200 のままで、scroll で visible が 200 件超に拡張されても 201 件目以降プリフェッチされない状態だったの〜🥲 内部上限を撤廃して `maxPrefetch=Infinity` をデフォルトに、`articles.length` (= visible 全件) を対象に修正！🚀 concurrency=2 + requestDelayMs=750ms が自然なレートリミッタとして働くから上限値による足切りは不要〜📜

### UX改善っ

- **TTS 読み上げハイライトをもっとはっきり + 画面中央スクロールにしたよ〜** — Issue #659 ユーザー要望対応。これまで `--color-surface-subtle` (stone-100/zinc-800) の控えめハイライトで「弱い」って指摘があったので、専用 `--color-tts-highlight` トークンを追加してマーカーペン風の **amber-200 (light) / amber-400/30 (dark)** に変更！🎨 高コントラストテキスト + 細い shadow でセンテンスが「光ってる」ように〜✨ さらにスクロールも `block: "nearest"` → 快適ゾーン判定で `block: "center"` に変更。要素中心が画面中央 30〜70% 内なら静止、外れたらセンタリング。「画像直後で要素が画面下部に来る」「画面下部基準で見づらい」問題を解消〜📜 `shouldScrollSentence` 純粋関数を `src/lib/tts-scroll.ts` に切り出して TDD 11 ケース全分岐網羅。

### 激アツ新機能っ

- **TTS スピードに 2.5x / 3x / 3.5x / 4x の選択肢を追加したよ〜** — Issue #676。これまで最大 2x 止まりだった読み上げ速度を **4x まで拡張** ！⚡ `TTS_RATES = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]` に追加して、`cycleRate` ボタンを連打すると 0.5x → 0.75x → 1x → 1.25x → 1.5x → 2x → 2.5x → 3x → 3.5x → 4x → 0.5x… でループ〜🎵 高速読み上げ派の倍速プレイヤー欲求にバッチリ対応〜🚀 既に保存されてる rate 値はそのまま継続。

### バグ修正っ

- **ギャラリービューの自動画像展開が 20 件で止まる問題を直したよ〜** — Issue #673。`usePrefetchGalleryContents` の `maxPrefetch` デフォルト値が **20** で内部上限 (200) と一致してなかったの〜🥲 `articlesKey` は visible 全件で構築されてたけど `targets = slice(0, 20)` で先頭 20 件に固定されてたから、scroll で visible が拡張されても 21 件目以降のプリフェッチが永遠に走らない状態だったよ。デフォルト値を 200 に引き上げて visible 全件を対象に修正〜🛠️ inflight dedup で二重 fetch も防止済み。

### 激アツ新機能っ

- **TTS 読み上げ中のセンテンスがハイライト + スクロール追従するようにしたよ〜 (#672 Phase 2)** — #659 Phase 1 の純粋関数基盤を実 UI に統合！🎀 `wrapSentencesInHtml` で記事本文の HTML を `<span data-tts-sentence-idx="N">` でラップ (linkedom 使用、`<pre>` `<code>` `<script>` `<style>` `<noscript>` は除外)、`useTtsHighlight` hook で boundary + 推定融合 (案 C) で `activeSentenceIndex` を 100ms interval で計算、ArticleContentBody の useEffect で該当 span に `.tts-active-sentence` クラス付与 + `scrollIntoView({block: "nearest", behavior: "smooth"})` で常時追従〜🌐 同センテンスが複数 span に跨る場合 (例: `<a>` リンク内外) は全部にハイライト適用。CSS は \`var(--color-surface-subtle)\` 背景で控えめに、200ms transition で滑らか〜🎵 TDD 15 ケース追加 (基本 / skip タグ / タグ跨ぎ / エッジケース全網羅)。
- **TTS 読み上げハイライトの基盤を作ったよ〜 (#659 Phase 1)** — 案 C (boundary イベント + 推定タイミング融合) の純粋関数基盤を `src/lib/tts-sentences.ts` に実装！🎀 `splitIntoSentences` (句点・ピリオド・感嘆/疑問符でセンテンス分割)、`findSentenceAtCharIndex` (charIndex → sentence index)、`estimateCharIndexByElapsed` (経過時間から推定)、`selectActiveCharIndex` (boundary が直近なら採用、古ければ推定値) の 4 関数を提供〜🌐 さらに `useSpeechSynthesis.speak()` に `onBoundary?: (charIndex: number) => void` callback を追加して、Web Speech API の `onboundary` イベント発火時に charIndex を購読可能に。TDD 29 ケース全分岐網羅 (8+6+8+7)。Phase 2 で本文 DOM のセンテンス span ラップ + ハイライト + scroll 追従を実装予定〜📦
- **読み上げ音声を選択できるようにしたよ〜** — Issue #654 (案 1: Web Speech API ベース・できる限り多種)。記事ヘッダーの TTS 速度ボタン (1.0x) の隣に音声セレクターを追加！🎀 `window.speechSynthesis.getVoices()` で OS / ブラウザが提供する全 voice を列挙して、言語別 (`<optgroup>`) に整理して選択可能に〜🌐 デフォルトは「自動」で記事言語に合わせて選び、明示選択した voice は `localStorage` に永続化。`selectTtsVoice` / `groupVoicesByLang` を `src/lib/tts-voice.ts` の純粋関数化、TDD 16 ケース追加 (preferredUri 一致 / 言語前方一致 / default フラグ / fallback / 空配列 / 大文字小文字差異 / グループ化全網羅)。`voiceschanged` イベントで遅延 voice 取得も対応〜🎵

### コードレビュー対応っ

- **#625 ShareMenu の abort 判定を `isAbortError` ヘルパーに統一したよ〜** — Issue #644 Step 2。`err instanceof DOMException && err.name === "AbortError"` というインライン重複チェックを `src/lib/fetch.ts#isAbortError` に統一して、abort 判定ロジックを単一ソースに！🎀 TDD で `e2e/abort-error.spec.ts` 9 ケース追加 (DOMException / Error / TypeError / null / undefined / plain object 全網羅) — Web Share API の cancel と fetch AbortController の abort を同じ関数で安全判別できるバッチリ保証〜🛡️

### 激アツ新機能っ

- **ギャラリービューで本文画像が一枚もない記事も OGP/サムネで表示するようにしたよ〜** — Issue #671。これまで本文画像 0 枚 + thumb=undefined の組み合わせは「No image」プレースホルダ固定でちょっと寂しかったの〜🥲 `selectGalleryImages` 純粋関数を新設して、画像ソースを `prefetched` / `thumb` / `none` の 3 分岐で厳密に決定するように！🎀 prefetch が空配列でも thumb (OGP/article.ogImage/YouTube サムネ) があれば fallback として描画、`source==="thumb"` 時は minPx フィルターをバイパスして必ず表示。`isFetchFailed` ブランチも維持して既存動作は完全互換〜📦 TDD 9 ケース追加 (全分岐網羅)。

### バグ修正っ

- **オートモードで次の記事に遷移後 TTS が止まる + 自動翻訳側を読み上げない問題を直したよ〜** — Issue #653 続編。`hasFullContent = !!processedContent` が緩すぎて、新記事に遷移した瞬間 `article.content` (RSS 本文) で `processedContent` が即非 null になって `hasFullContent=true` で speak が発火 → 直後 `useArticleViewTts` の `ttsStop()` が effect 順で呼ばれて即停止する状態だったの〜🙅‍♀️ 修正で `hasFullContent = !!storedContent || !canFetch` に厳格化（fetch 完了 or fetch 不要のときだけ true）！🛡️ 加えて `buildTtsText` を `src/lib/tts-text.ts` に純粋関数化して `translatedText` パラメータを追加、`autoTranslatePending` ブロッカーを `shouldStartAutoSpeak` に新設で「自動翻訳完了待ち → 翻訳側を読み上げ」の正しいフロー！🌐✨ TDD 11 ケース追加 (buildTtsText 7 + autoTranslatePending 3 + 後方互換 1)。
- **Chrome 組み込み要約 AI が最新 Chrome でも使えなかった問題を直したよ〜** — Issue #664。`browser-summarizer.ts` / `browser-translator.ts` の Chrome 最低バージョンが **131** のまま 2 周遅れになってて、131〜137 のユーザーが `flag-disabled` と誤診断されてたの〜😱 公式ドキュメント準拠で **138** に bump！🔧 さらに `Summarizer.create()` の **`navigator.userActivation` 必須要件**が欠落してて、ユーザー操作なしで呼ばれると黙って null フォールバックする状態だったので `requires-user-activation` reason を新設、user activation チェックを追加！🛡️ `monitor` コールバックで DL 進捗を `devError` ログ、エラー全握りつぶしも `devError` で原因が DevTools に出るように〜🔍 設定 UI のメッセージも 138 ベース + ハードウェア要件 (22GB / GPU 4GB VRAM か CPU 16GB RAM 4 コア) を明示。`parseChromeMajorVersion` を純粋関数化して TDD 5 ケース追加〜✨

### リファクタリングっ

- **ArticleList を `article-list-body/` ディレクトリに分割して #651 完了したよ〜** — Issue #651 Step 3 (最終)。Step 1 で関数化した renderXxxBody 群を本物のサブコンポーネント (`CompactListBody` / `CardBody` / `MagazineBody` / `GalleryBody` / `GalleryCardRenderer`) に昇格、`GalleryItemCtx` も `gallery-context.ts` に独立！📦✨ ArticleList.tsx は 814 → 521 行 (−293) のオーケストレーター構成に圧縮。Step 2 で抽出した `useArticleListItemProps` hook も併せて、責務が「フィルター/仮想化器の準備」「ボディ描画」「メニュー管理」にきれいに分離されたよ〜🎀
- **ArticleList から useArticleListItemProps hook を抽出したよ〜** — Issue #651 Step 2。`resolveItemProps` コールバックと関連 useSyncedRef 群（onSelect / onToggle\* / ogpCache）を独立 hook に切り出して、ArticleList のオーケストレーション責務を明確化！🪝 #634 (GalleryCardRenderer 再描画バグ) への注釈も hook 内に移植して、bookmarkIds / readIds / notes は state 直接参照のままキープ〜📋
- **ArticleList の残り 3 レイアウト (card / magazine / gallery) も関数化して #651 Step 1 完了したよ〜** — Issue #651 Step 1 続編。前回 compact/list を関数化してたので、残り 3 レイアウトも同パターンで `renderCardBody` / `renderMagazineBody` / `renderGalleryBody` として抽出！🔧✨ メイン return 内の 267 行 → 156 行に大幅スリム化。次は Step 2 (hook 抽出 / サブコンポーネント化) で本体さらに圧縮予定〜📦

### バグ修正っ

- **ギャラリー自動画像展開が一定処理で止まる問題を直したよ〜** — Issue #669。`articlesKey` が `articles.slice(0, maxPrefetch=20)` で先頭 20 件 ID だけのハッシュ固定されてて、ユーザーがスクロールして visible が拡張されてもキー不変 → effect 再実行されない → **21 件目以降が永遠にプリフェッチされない** 状態だったの〜😱 修正で `slice(0, limit)` を削除して全 visible 記事の ID をキーに、effect 再実行時の `controller.abort()` も削除して進行中 fetch を継続させ、`inflight` Set を `useRef` で永続化して二重起動防止！🛠️✨ `buildArticlesKey` を `src/lib/gallery-prefetch.ts` に純粋関数化、TDD 8 ケース追加で回帰防止もバッチリ〜📦
- **CI の typecheck が失敗してた問題を直したよ〜** — Issue #668。`src/lib/release-notes-data.ts` は `RELEASE_NOTES.md` から自動生成されるファイル (.gitignore 対象) で、`prebuild` フックでだけ生成されてたの〜🛠️ CI は `pnpm install` 直後に `pnpm run check` → `pnpm run typecheck` を実行するので、ファイル未生成で TS2307 エラー発生！😱 `pretypecheck` / `precheck` / `precheck:fix` を `package.json` に追加して、全実行パスで自動生成されるようにしたよ〜⚙️✨ スクリプト自体は MD 1 個読んで TS 1 個書くだけの軽量処理だから性能影響なし。
- **ギャラリーで本文画像が 1 枚だけの記事が DL できなかった問題を直したよ〜** — Issue #667。`GalleryContextMenu` の「画像を一括保存」ボタンが `images.length >= 2` の判定で隠れてて、wallhaven のような 1 枚画像記事だと OGP/サムネだけ DL される状態に〜😢 条件を `>= 1` に緩和して、1 枚なら「本文画像を保存」、複数なら従来どおり「画像を一括保存 (N 枚)」と動的ラベル！🖼️✨ 本文 fetch + 画像抽出パイプライン (`collectImageUrlsFromHtml`) は元々 1 枚でも正常動作してたので、UI 表示条件だけのフィックス。
- **ギャラリーで 1 件の 429 が混入すると他の記事の画像展開も全停止していた問題を直したよ〜** — Issue #665。`usePrefetchGalleryContents` の `onRateLimit` コールバックが `controller.abort()` を呼んで **進行中の全並列 worker を中断** してたの〜🙅‍♀️ おかげで残り未処理記事は処理されないまま終了、しかも abort された fetch は `failedIds` にも入らずリトライボタンすら出ない「空カードで停止」状態に〜😢 修正で `controller.abort()` を削除して、`rateLimited` フラグだけで worker の while 条件で自然停止するように！🛡️ 進行中の fetch は完走、再開は `rateLimitedUntil` リセット時の effect 再実行で処理。404 単独では従来から止まらない設計だったのを再確認〜✨

### 激アツ新機能っ

- **ギャラリービューのフォーカスモード時の列数を独立指定できるようにしたよ〜** — Issue #666。これまで通常時とフォーカスモード時で同じ `galleryColumns` 設定が共有されてて、`auto` のときだけフォーカスでハードコード 6 列固定になってたの〜🤔 新規 `galleryColumnsFocus` 設定を追加して「フォーカス時列数」UI で別途指定可能に！🖼️✨ デフォルトは `"通常と同じ"` (auto) なので既存ユーザーへの動作影響なし。`localStorage` に永続化、9 ファイルに add-only 変更で破壊的変更ゼロ〜📦

### バグ修正っ

- **ギャラリービュで列が偏ったときに次ページが読み込まれない問題を直したよ〜** — Issue #636 追加要件。masonic ギャラリーで列の高さがバラバラだと、最長列の底にある sentinel に届かないと無限スクロールが発火しなくて「画面に空きがあるのに次が来ない」状態になってたの〜🙅‍♀️ `shouldEagerLoad` 純粋関数を新設して、`scrollHeight <= clientHeight` を判定する `isContentShort` フラグも load トリガー条件に追加！📐✨ `ResizeObserver` でスクロールコンテナのサイズ変化も監視するから、masonic レイアウト確定後にも自動で再評価。`MAX_EAGER_LOADS=20` の暴走防止カウンタも維持。TDD 8 ケース追加〜📦
- **オートモードで概要だけ読み上げて先に進まない問題を直したよ〜** — Issue #663。これまで `hasContent` がサマリ fallback で true になっちゃってて、本文 fetch がトリガーされず TTS だけ即起動してたの〜😱 さらに effect (3) に二重発火防止の ref がなくて、TTS 完了 → 再 speak の無限ループも発生してたよ〜🔁 修正で `hasFullContent`（processedContent 厳格判定）を新設、`shouldStartAutoSpeak` に `canFetch` + `hasFullContent` ゲートを追加！🛡️ `speakTriggeredRef` で同記事の二重 speak も防止。これでフル本文取得 → 全文読み上げ → 次の記事の正常フローが復活〜📖✨ TDD 4 ケース追加で再現テストもバッチリ。

### パフォーマンス改善っ

- **既読 ID の自動 prune が「記事保持期間」設定に連動するようにしたよ〜** — Issue #635 設定可能化。これまで自動 prune (#635 A1) は手動の `readBeforeTimestamp` 設定時しか動かなかったけど、ユーザー設定の **「記事保持期間」(30/60/180 日)** からも cutoff を自動算出して既読 ID を物理削除するように！🗑️✨ `computeEffectiveReadBeforeCutoff` 純粋関数で「手動 cutoff」と「ttlDays cutoff」のうちより新しい (積極的に削除する) 方を採用。1 日 100 件読了の重ユーザーでも、180 日設定なら最大 18,000 件を自動でお掃除〜📉 既存の「記事保持期間」UI を変えずにそのまま閾値設定として機能。TDD 7 ケース追加。
- **画像プロキシのレートリミット (120 req/分) を撤廃したよ〜** — Issue #649 案 A。これまで画像プロキシに KV 経由のスライディングウィンドウ制限があったけど、Cache HIT の高速化メリットを実質ゼロにしてて画像表示体験を妨げてたの〜🐌 案 A (廃止) を採用！🚀 SSRF・同一オリジン・MIME 検証の防御層は据え置きで、`imageProxyRateLimitKey` / `IMAGE_PROXY_MAX_CALLS` / `IMAGE_PROXY_WINDOW_MS` を削除。Cache MISS 時の遅延もこれで KV 分が消えるよ〜⚡

### 環境堅牢化っ

- **e2e/test-seed-integration が wrangler 未認証時に自動 skip するようにしたよ〜** — `wrangler login` してない開発環境では R2 バインディングが取れず 5 件中 3 件が 500 エラーで pre-commit hook を阻害してたの〜😭 `test.beforeAll` で seed エンドポイントの可用性を確認、未認証時は 3 件 skip + 案内メッセージで `npx wrangler login` を表示！🛡️ これで wrangler 未ログイン環境でも他のテストが通るから、開発フローが快適に〜

- **ArticleList の compact/list レイアウト JSX を関数化したよ〜** — Issue #651 Step 1 最小スコープ。50 行の仮想スクロール JSX を `renderCompactListBody` ローカル関数として抽出して、メイン return が 1 行の関数呼び出しになったの〜🔧✨ クロージャで外部 scope の変数を参照してるから依存配列管理は React に委譲。残り 3 レイアウト (card / magazine / gallery) は次 PR で同様に関数化予定。

### パフォーマンス調査っ

- **image-proxy に遅延計測ログを追加したよ〜** — Issue #649。ユーザー仮説「KV で遅延してるなら rate_limit はやめる」を検証するために、`buildCacheKey` (SHA-256) / `matchCfCache` (Cache API) / `checkSlidingWindow` (KV) の各セクションを `Date.now()` 差分で計測！⏱️ ログ形式は `[image-proxy] HIT total=Xms buildKey=Yms cacheMatch=Zms` のような感じ〜📊 案 B (Cache HIT 時に rate-limit スキップ) は **既に実装済み** だったので、本番デプロイ後に `wrangler tail` で実測値を見てユーザーが判断してね〜🔍

### 激アツ新機能っ

- **記事一覧の全レイアウトで右クリックメニューが使えるようになったよ〜** — Issue #633 A3。これまでギャラリーレイアウトだけ右クリックメニューがあったけど、新規 `ArticleContextMenu` コンポーネントで compact / list / card / magazine の 4 レイアウトにも展開！🖱️✨ メニュー項目は「既読切替」「ブックマーク」「後で読む」「一覧から削除（未読のみ）」のシンプル 4 項目。ギャラリー用の `GalleryContextMenu` は画像保存機能込みなのでそのまま維持してる〜📋 これで A2 (ホバーボタン) + A3 (右クリック) + B1 (`t` キー) の 3 ルートで「後で読む」追加できるよ〜🎀

### UX改善っ

- **AI プロバイダの「使えない」メッセージを「サーバー側で〜します」中心に書き換えたよ〜** — Issue #658。これまで Chrome on-device AI (翻訳/要約) が使えない時、「ハードウェア要件（GPU・ストレージ・OS バージョン）を確認してください。詳細は chrome://on-device-internals」みたいな Chrome ネイティブのエラー文言をそのまま表示してて、ユーザーには意味不明だったの〜😢 「ご利用環境では端末上の要約が使えないため、サーバー側 (Workers AI) で要約します」のように、結果として要約・翻訳が機能することが伝わる表現に統一！💡 ハードウェア要件の文言は削除（一般ユーザーに無意味）、ダウンロード中だけは「完了するまではサーバー側で要約します」と補足を追加して安心感アップ〜📝

- **ギャラリービューでも DL 済み画像の重複保存を防ぐようにしたよ〜** — Issue #648。これまで記事詳細のギャラリー一括 DL では「すでに DL 済みかチェック」してたけど、`GalleryContextMenu` の「画像保存」「画像をすべて保存」では何もチェックしてなくて、誤って同じ画像を 2 度 DL するケースがあったの〜🙅‍♀️ `addUrlToHistory` 純粋関数で localStorage に DL 履歴を FIFO 5,000 件まで管理して、再 DL 時は確認モーダル表示！💾✨ 一括保存では最初に 1 度だけ確認して OK なら全件再 DL（個別連打回避）。TDD 8 ケース全 Green！

### バグ修正っ

- **オートモード停止ボタンが効かない問題を直したよ〜** — Issue #661。これまで「停止ボタン」（オートモード OFF）押してもモード自体は OFF になるけど、現在発話中の TTS は止まらないって意味のわからん挙動してたの〜！🙅‍♀️ AutoReadController で `enabled` が false に変化したら `ttsStop()` を呼ぶ useEffect を追加したから、オートモード OFF と同時に音声もピタッと止まるよ〜🔇✨
- **オートモード次記事へ無限ループする問題を直したよ〜** — Issue #660。記事切替時に `prevPlayingRef.current` が `true` のまま残るせいで、新記事で `ttsPlaying = false` になった瞬間「TTS 完了」と誤判定されて即次の記事へ遷移する連鎖が発生してたの〜😵‍💫 `articleId` 変化時に `prevPlayingRef.current` を `false` にリセットするように！🔁 これでもう記事を順番にちゃんと読み上げるよ〜📖
- **/api/content の上流 429 で Retry-After なしの場合にデフォルト 60 秒を補完するように〜** — Issue #662。wallhaven.cc など一部の上流サイトが `429 Too Many Requests` を返すけど Retry-After ヘッダを付けてこなくて、クライアントの retry-after.ts が遅延時間を判定できず即時リトライ → 再 429 の連鎖になってたの〜♻️🔥 上流の Retry-After がない場合はデフォルト 60 秒をヘッダ＆ボディの両方に補完するように修正！⏰ これでクライアントは安定して 60 秒待ってからリトライできるよ〜

### 激アツ新機能っ

- **記事一覧（card / magazine）にホバーで「後で読む」ボタンを追加したよ〜** — Issue #633。これまで「後で読む」は記事ビュー (ArticleView) を開かないと操作できなかったの〜！😣 今回 `ArticleActions` に時計アイコン型の「後で読む」ボタンを追加して、card / magazine レイアウトでホバーするとサクッと登録/解除できるようになったよ〜⏰✨ compact / list / gallery は情報密度が高いので未対応（A3 全レイアウト右クリックメニュー対応は別 PR で）。`t` キーでの登録は前から動いてたんだけど改めて確認、記事一覧フォーカス時もちゃんと動くよ〜🎀

### バグ修正っ

- **ギャラリー無限スクロールが途中で止まる症状を直したよ〜** — Issue #636 症状 1。masonic 仮想化で sentinel に到達しない結果 `hasMore` が永遠に true のままになって、過去記事が自動で読み込まれない問題があったの〜😭 `LoadMoreButton` を `feedHasMorePages` だけで表示するようにして、ボタン自身の IntersectionObserver で確実に発火させるように！🚀 `MAX_AUTO_LOAD` も 3→5 に緩和して、フィルター時にもう少し深く遡れるよ〜📚 `overscanBy` 6→12 で末端の描画余裕も確保したの〜
- **ギャラリー画像のレイアウトシフトを緩和したよ〜** — Issue #636 症状 2。`<img className="w-full h-auto">` だと画像読み込み完了まで高さ 0 で配置されてて、ロード後に高さ確定 → masonic が全カード位置再計算 → 画面ガタつきの原因になってたの😱 ロード前は `aspectRatio: "1 / 1"` で空間予約、ロード後は `naturalWidth / naturalHeight` から実比率に切り替えるように！🎨 完全な再計算ゼロは難しいけど、初回ロード時の大ジャンプは大幅に減るよ〜
- **read-state の readIds を自動 prune するように〜** — Issue #635 A1。ヘビーユーザー（1 日 100 件以上既読）で R2 の `read-state.json` が数万件規模に肥大化してた問題を、`pruneOldReadIds` 純粋関数で自動削除するよう改善！🧹 `readBeforeTimestamp` 以前の publishedAt を持つ記事は `isArticleRead` で一括既読扱いされるから、個別 ID を保持する必要がないの〜♻️ クライアントが取得済みの記事範囲では readIds の大半が削除可能で、想定では数 MB → 数百 KB に圧縮できるよ〜📉 TDD で 9 ケース全 Green！B1 (readIds 別ファイル分離) は別 PR で。
- **TTS 読み上げで URL をアルファベット 1 文字ずつ読み上げてた問題を直したよ〜** — Issue #655。これまで記事本文中の URL (`https://example.com/...`) を Web Speech API が「エイチティーティーピーエス、コロン...」って延々読み上げちゃって聴くに耐えなかったの〜！😱 `src/lib/tts-text.ts` に新規純粋関数 `preprocessTtsText` を追加して、URL を「リンク」っていう短い日本語トークンに置換してから speak() に渡すように！🎙️✨ 句読点や閉じ括弧は URL に巻き込まないから「リンク、ご覧ください」のように自然な読み上げになるよ〜📖 TDD で 12 ケース全部 Green！
- **Twitter / X 系フィードで video の poster をサムネにできるようになったよ〜** — Issue #645 続編。これまで X feed の description 内に `<video poster="...">` があってもサムネとしては拾われず、ユーザーアバターとか OGP に頼ってサムネがミスマッチしてたの。今回 `extractImage` の優先順位に video poster 抽出を追加して、`<img>` より優先採用するように！🎥✨ ただし `media:content` (image) があればそっちを優先するから、ちゃんと指定された画像があればそっちを使うよ〜📷 TDD で 3 ケース追加、合計 33 ケース全 Green！

### UX改善っ

- **スクロールバーが細すぎて掴めない問題を直したよ〜** — Issue #656。3px の極細スクロールバーは美学的には可愛いけど、実用ではマウス操作で掴むのほぼ不可能だったの...！👆 8px 幅 + border-radius 4px に拡大して、horizontal スクロールバーも `height: 8px` で見やすくしたよ〜✨ それでも控えめだから視覚的なミニマリズムは維持できてるの〜🎨

### 激アツ新機能っ

- **CLI から記事詳細キャッシュをクリアできるようになったよ〜** — `DELETE /api/content?url=...` (個別 URL) と `POST /api/feeds/:id/purge-content-cache` (フィード単位の全記事一括クリア) の 2 エンドポイントを追加！🛠️ ロジック修正後にキャッシュ TTL 7 日待たなくても、`curl -X POST -H "Cookie: access_token=xxx" "https://rss.0g0.xyz/api/feeds/92bd33f28976b959/purge-content-cache"` で即座にフィード全記事のキャッシュをクリアできるよ〜🚀✨ shared cache + clip cache 両方クリアして、削除件数が `{ purged, failed, total }` で返るからモニタリングもしやすい！

### バグ修正っ

- **記事詳細キャッシュキーを v2 にバンプして全 POP 一斉無効化したよ〜** — Cloudflare Cache API は **データセンター（POP）単位** のキャッシュで、`caches.default.delete()` を Worker から呼んでもリクエストが届いた POP のキャッシュしか消せないの...！🌍 ページネーション fix 後も古い POP キャッシュが残存してユーザーが古いコンテンツ見ちゃう問題を、`buildContentCacheKey` の名前空間を `content` → `content/v2` に切り替えることで解決！🔧 名前空間が変わったから世界中の全 POP が一斉に MISS 扱いになって新ロジックで再構築されるよ〜✨ 古い v1 キャッシュは TTL 7 日で自然消滅。今後ロジック修正時はバージョンサフィックスをバンプすれば同様にグローバル無効化できる仕組みっ🚀 TDD 2 ケース追加で v2 名前空間の存在と v1 との衝突回避を保証！
- **everia.club などの WordPress nextpage で 2 ページ目以降が取得されないバグを直したよ〜** — Issue #652 関連。原因は **percent-encoding の大文字小文字差異**！記事 URL は大文字 (`%E5%A1%A9...`) なのに HTML 内のページネーションリンクは小文字 (`%e5%a1%a9...`) で、`isPaginatedVariant` の pathname 比較が文字列一致で false 返してた...！🔧 `decodeURI` で正規化してから比較するように修正、`MAX_PAGINATION_PAGES` も 5→10 に増やして長い画像記事もカバーできるようにしたよ〜📚✨ TDD の 6 ケース全 pass！

### リファクタリングっ

- **`isSpeechSupported()` で 3 箇所重複してた Web Speech API 判定を統一したよ〜** — simplify。`App.tsx` の useMemo / `useSpeechSynthesis.ts` のモジュール定数 / `auto-read.ts` の純粋関数 で同じ `typeof window !== "undefined" && "speechSynthesis" in window` がコピペされてたから、`auto-read.ts#isSpeechSupported` に統一して全部 import 経由で参照するように！🔧 細かいけど本質変更ゼロでテスト 30 件 (xml-parser) 回帰なし。
- **ArticleHeader.tsx (648行) を機能別 4 サブコンポーネントに分割したよ〜** — Issue #647。AI / TTS / 画像 DL / シェア / ブックマーク / 後で読む / いいね / メモ / コレクション / フォーカスモード の 10 機能集約コンポーネントを、`ArticleHeaderMeta` (メタ情報) / `ArticleHeaderAiTts` (AI・TTS・画像 DL) / `ArticleHeaderShare` (シェア・フィルターメニュー) / `ArticleHeaderEngagement` (ブックマーク・後で読む・いいね・メモ・コレクション・フォーカスモード) の 4 つに分離して、ArticleHeader 本体は 250 行のオーケストレーターに！🔧 既存の import パスは維持してるから ArticleView 側の変更ゼロだよ〜✨ 機能ごとの差分が読みやすくなって、将来の機能追加もラクになったの〜📦 全 e2e テスト 2217 件回帰なし！

### セキュリティ対策っ

- **`fast-xml-builder` の脆弱性 2 件を修正したよ〜** — Dependabot alerts。`fast-xml-parser@5.7.2` の依存として入ってた `fast-xml-builder@1.1.5` に高/中の脆弱性 (CVE: 属性値での不要な引用符バイパス + コメント値正規表現バイパス) があったから、`pnpm.overrides` で `fast-xml-builder: ">=1.1.7"` を追加して `1.2.0` に強制更新！🔒 RSS パーサーの 30 件テスト全部 pass で動作確認済みだよ〜🛡️

### ドキュメント整備っ

- **tsconfig で `.next/dev/types/routes.d.ts` を明示的に除外してビルドエラー再発防止したよ〜** — Issue #646。`.next/dev/types/**/*.ts` include と `.next/dev` exclude の組み合わせで、Next.js が生成する `routes.d.ts` の JSDoc コードフェンス内 TSX サンプルを tsc が誤って構文エラー扱いしてた問題（`error TS1435: Unknown keyword or identifier`）を、Option B 個別ファイル除外で恒久対応！🔧 これで `rm -rf .next` の workaround なしに安定 typecheck できるようになったよ〜✨

### テスト基盤拡充っ

- **e2e テスト用 R2 シードエンドポイント `/api/test/seed` を追加したよ〜** — Issue #643。これまで認証バイパスはあったけど R2 にテストデータを投入する方法がなくて、UI 振る舞いの再現テストが書けなかったの...！今回からは `e2e/helpers/seed-r2.ts` の `seedFeed` / `seedReadState` / `clearTestData` ヘルパー経由でフィードや既読状態を一発投入できるようになったよ〜🧪✨ プロダクション環境では `getDevBypassUserId()` が null を返すから 404 で本番安全、`validateSeedRequest` 純粋関数 15 ケース + 統合 5 ケースで TDD カバー！これで #634/#624/#625/#623/#632 みたいな UI バグの後追い再現テストが書けるようになったよ〜🚀

### バグ修正っ

- **ギャラリービュー 429 発生後、クールダウン経過で自動リトライするように直したよ〜** — Issue #642。これまで `usePrefetchGalleryContents` が 429 を受け取ると ref に「いつまで停止」を記録するけど、ref は React 再レンダーをトリガーしないから、Retry-After 期限が過ぎても自動的に再開されなかったの。今回からは state ベースに変えて、setTimeout で期限後に自動リセット → useEffect 再実行 → プリフェッチ再開、という流れに改善！🚀 ギャラリーで他の画像取得も止まったまま放置されてた問題が解消するよ〜⏰
- **`<br>` タグで description が途切れて見えるバグを直したよ〜** — Issue #645 (一部対応)。これまで `<br>` タグが空文字列で除去されてた結果、`foo<br>bar` が `foobar` みたいに単語が直接連結しちゃう問題があったの。`<br>` / `<p>` を改行に変換する `stripHtmlWithBreaks` 関数を追加して、X や VRChat ボット系フィードの description プレビューが自然に複数行表示できるようになったよ〜📝✨ video link / OGP fallback の対応は #645 にコメント残してユーザー判断待ち！

### UX改善っ

- **PC でインラインナビ領域をクリックしても前後の記事に遷移できるようになったよ〜** — Issue #637。これまでスワイプ・ドラッグ専用だった記事ヘッダー上部の細い帯領域、PC ユーザーがマウスでクリックしても何も起こらなくて困ってたよね...？今回からは領域の中央より左をクリックで前の記事、右をクリックで次の記事に遷移できるようになったの〜🖱️✨ ドラッグでのスワイプ操作はそのまま使える（60px 以上動かしたらドラッグ判定）から、PC マウスもタッチパッドも快適！🚀 カーソルも `pointer` に変更してクリック可能なことが視覚的にも分かるようにしたよ〜

## 2026-05-08

### 激アツ新機能っ

- **オートモード爆誕！全文取得 → 読み上げ → 次の記事へ自動進行するよ〜** — Issue #622。記事ヘッダーの新トグルボタン（または `Shift+A` ショートカット）でオートモード ON にすると、その記事の全文を自動取得して TTS で読み上げ → 完了したら 0.5 秒待って次の記事へジャンプ → ループ！通勤中のハンズフリーリスニングが捗りすぎる〜🎧✨ TTS 完了で自動既読化されるから消化スピードもアップ、最後の記事まで来たら自動で停止して toast 通知、フェッチ失敗は 1 回リトライしてダメならスキップして次へ、手動 j/k で記事切替しても TTS だけリスタートして続行〜✨ 音声合成 API 非対応のブラウザではボタン押下時に「お使いのブラウザは音声合成に非対応です」の toast が出るよ〜🚀
- **記事一覧フォーカスモード時に記事詳細を右からスライドする overlay にしたよ〜** — Issue #630。これまで listFocusMode 中に記事を選ぶと focusMode に切り替わって全画面再描画が走ってたけど、今回からは右からスルッとスライドする overlay として記事詳細が出るように！ギャラリービューのレイアウトはそのまま維持されるから「画像を眺めながらサクッと記事を確認」が超快適に〜🚀 パネルの左端をドラッグすれば幅も自由に調整できて、設定は localStorage に保存されるよ。Escape / 背景クリック / 閉じるボタンで close できちゃう〜✨
- **各 feedView でフィルター状態を独立に保存するようにしたよ〜** — Issue #621。articles / pictures / videos / social の 4 つのカテゴリで「未読のみ」「ブックマークのみ」「期間絞り込み」「読了時間」「ダイジェスト」「ソート順」の状態を別々に localStorage に保存！pictures カテゴリで未読のみ ON にしても articles に戻ったら全部表示の状態が残ってる、っていう自然な切り替えができるようになったの〜✨ articles はサフィックスなしの既存キーをそのまま使うから移行不要、新カテゴリ（pictures/videos/social）には `:カテゴリ名` サフィックス付きキーで保存だよ🎀

### バグ修正っ

- **ギャラリービューでブックマークしてもアイコンが変わらないバグを直したよ〜** — Issue #634。`resolveItemProps` が `useSyncedRef` 経由で bookmarkIds/readIds/notes を参照してたから、Context 値の identity が変わらず memo された `GalleryCardRenderer` が再描画されなかったの！state を直接参照に切り替えて、ブックマーク・既読・メモの変更が即座にギャラリーカードに反映されるようにしたよ〜🎀

### ドキュメント整備っ

- **api-spec.md の `/api/articles` クエリ仕様を実装に同期したよ〜** — Issue #639。仕様書の `feedHash` / `since` (ISO 8601) を実装に合わせて `feed` / `since` (ミリ秒 Unix タイムスタンプ) に修正、page の有効範囲（1〜MAX_PAGES=5、`feed` 指定時のみ有効）を明記して、エラー一覧（INVALID_FEED / INVALID_PAGE）も追加したよ〜📚

### リファクタリングっ

- **`stripTagsFixedPoint` を `stripHtml` で置換して重複削除したよ〜** — Issue #640。`html.ts` の `stripTagsIter` と `export-markdown.ts` の `stripTagsFixedPoint` が同じ「HTML タグ不動点反復除去」のロジックだったから、`stripHtml`（内部で stripTagsIter + trim）に統一して -14/+2 行の純減にしたよ〜🔧

### バグ修正っ

- **ギャラリービューで画像展開失敗時に OGP/サムネが表示されるようにしたよ〜** — Issue #632。`isFetchFailed` 時は「取得失敗」プレースホルダだけになって、せっかく取得済みの OGP 画像やサムネ情報まで消えてた問題を修正！背景に半透明で OGP/サムネを表示しつつ、その上に「取得失敗」アイコンとリトライボタンを重ねる UI に変更したよ〜🖼️💡

### リファクタリングっ

- **useUIState を完全廃止したよ〜（Phase 2）** — Issue #629。App.tsx で 9 サブフック（`useThemePreference` / `useLayoutSettings` / `useAutoReadSettings` / `useAccessibilitySettings` / `useMobilePane` / `useNSFWMode` / `useFocusMode` / `usePWAInstall` / `usePinnedAndCategories`）を直接並列呼び出しする形に変更。中間合成層を取り除いて純減 222 行（useUIState.ts 239 行削除 + App.tsx +22）。`?` / Escape の keydown ハンドラは App.tsx に直接配置して、フォーカスモード Escape は useFocusMode 側で独立処理する責務分離が綺麗に通ったよ〜🔧✨
- **useUIState (334 行) を Phase 1 で 3 サブフックに分割したよ〜** — Issue #627。`useFocusMode`（フォーカスモード制御 + window.history 連携 + キーボード）/ `usePWAInstall`（PWA インストールプロンプト）/ `usePinnedAndCategories`（ピン留めフィード + カテゴリ折りたたみ）の 3 つに固有ロジックを切り出して、useUIState は薄い合成層（334 → 213 行）に！API 互換性を維持してるから App.tsx 側の変更ゼロだよ。Phase 2（useUIState 完全廃止）は別 Issue で対応予定っ🔧

### セキュリティ対策っ

- **DBSC の dbscSessionId を R2 から読み出し時にも UUID 検証するように堅牢化したよ〜** — Issue #628。register エンドポイント側では既に UUID 形式を検証してたんだけど、R2 から読み出した時も再検証する defense in depth パターンを追加！信頼境界を越える値はすべて再検証するっていう監査時の説明責任が綺麗に通るようになったよ〜🔒

### バグ修正っ

- **ShareMenu の Web Share API 失敗が無音になってた問題を直したよ〜** — Issue #625。`navigator.share()` の reject を `.catch(() => {})` で握り潰してたのを、`AbortError`（ユーザーキャンセル）以外は `toast.error("シェアに失敗しました")` で通知するように修正！シェアできてないのに気付けなかった問題が解消したよ〜🎀
- **LoadMoreButton のページネーション失敗が無音になってた問題を直したよ〜** — Issue #624。IntersectionObserver と click handler の両方で `onLoad()` の reject を catch せず無音 fail してたのを、catch して `toast.error("過去記事の取得に失敗しました")` を表示するように修正！バックエンド障害時にユーザーに気づいてもらえるよ〜💡

### パフォーマンス改善っ

- **FeedHealthModal の `now` を毎レンダー新規生成しないように修正したよ〜** — Issue #623。`useMemo(() => new Date(), [])` は React 仕様上メモが破棄される可能性があり、依存する `rateLimitedFeeds` が連鎖再計算されてた問題を、`useState(() => new Date())` でモーダル open 時に 1 度だけ確定させるように修正！100 フィード規模で毎フレーム配列フィルタが走らなくなったよ〜🚀

### 激アツ新機能っ

- **読了統計のフィード別ドリルダウン機能を追加したよ〜** — Issue #615。「読書統計」モーダルの「よく読むフィード」TOP5 をクリックすると、そのフィード単体に絞り込まれて今週カウント・年間ヒートマップ・直近 7 日グラフが再描画されるよっ！「いつ読んでるか」の時間帯・曜日傾向がフィード単位で見えるようになったから、自分の読書ルーティンを把握できちゃう〜📊✨ サーバー側変更ゼロでクライアントサイド集計のみで実現したよ。`aggregateStatsForFeed` 純粋関数を `stats-helpers.ts` に追加して 10 ケースのユニットテストも揃えたから安心だよ〜🎀
- **メモ付き記事を Readwise CSV でエクスポートできるようになったよ〜** — Issue #616。Readwise の標準フォーマット `Highlight, Title, Author, URL, Note, Date` で出力するから、ブックマーク済みでメモを書いた記事を Readwise や Reader にそのまま手動インポートできるよっ！Highlight 列はメモの 1 行目、Note 列はメモ全文、Author はフィードタイトル、Date は publishedAt（無ければ createdAt）の YYYY-MM-DD。サイドバー左下の「もっと見る」メニューに「メモを Readwise CSV で出力」ボタンを追加したよ〜📚✨

### テスト追加っ

- **dev 認証バイパス機能を追加して認証後画面の e2e カバレッジを拡充したよ〜** — Issue #607。`DEV_AUTH_BYPASS_USER_ID` 環境変数 と `NODE_ENV !== "production"` の AND 条件が揃った時だけ `/api/auth/me` が fakeProfile を返す仕組みを追加！production ビルドでは NODE_ENV inline により dead code 化されて含まれないから安心だよっ。`playwright.config.ts` の `webServer.env` に `e2e-test-user` をセットして、ThreePaneLayout に `data-popup-open` 属性を追加してリサイザー操作可否を e2e から判定できるようにしたよ〜🧪✨

### リファクタリングっ

- **`FeedItemComponent.tsx` の actions を `feedActions.tsx` に切り出したよ〜** — Issue #598。705 行のうち 337 行を占めてた actions 配列リテラルを純粋関数 `buildFeedActions()` に分離して、コンポーネント本体は 405 行までスリム化！`buildFeedActions` 単体で 37 ケースの単体テストも追加したから、各 action の順序・visible・onClick の振る舞いが変わってないことを保証できるよっ🔧✨
- **App.tsx を 1145 行 → 1039 行に削減したよ〜** — Issue #581。`articleViewProps` の 24-dep useMemo を `useArticleViewProps` hook に抽出、オフラインバナー・新着バナー・フォーカスモードオーバーレイを専用コンポーネントに分割してメンテしやすくなったよっ🔧✨
- **`isBetaAllowed` を `src/lib/beta-allowed.ts` に切り出したよ〜** — Issue #597。`next/*` 依存のない純粋関数として分離したから、Playwright の Node ランナーから直接 import してユニットテストできるようになったよっ🔧✨
- **dev 認証バイパスのロジックを `src/lib/dev-auth-bypass.ts` に DRY 化したよ〜** — Issue #609。`getAuthSession` と `/api/auth/me` で重複してた env 読み出し・正規表現・fakeProfile 生成を `getDevBypassUserId()` と `buildDevBypassProfile()` の 2 つの純粋関数に集約。`?` キーでヘルプモーダルを開いて `data-popup-open=true → false` を検証する e2e ケースも追加したから、#606 みたいな popup-lock バグが回帰した時に即検出できるよっ🔧✅
- **`stats/route.ts` のインライン重複を `stats-helpers.ts` に集約したよ〜** — Issue #599。`getMondayIso` と `computeCurrentStreak` がインライン実装と二重に書かれてたから、`stats-helpers.ts` の関数を直接呼ぶように統一したよっ。テストカバレッジも自動で route.ts 側に効くようになって、一石二鳥だよっ🔧✨

### UX 改善っ

- **要約モデル不可時のエラーメッセージを修正したよ〜** — Issue #610。「ストレージ空き容量を確認してください」だけだとミスリーディング（実際はGPU・OS バージョンなどでも `model-unavailable` reason になる）だったから、ハードウェア要件の確認項目を列挙して、`chrome://on-device-internals` の確認導線も追加したよ〜🔧🎀
- **フィード属性変更（NSFW/優先度/グループ等）の失敗が無言で消えちゃう問題を直したよ〜** — Issue #603。`useFeedPatch` の楽観的更新がサーバーで失敗するとロールバックはされてたけど toast 通知がなかったから、ユーザー視点では「操作したのに元に戻った」理由が分からなかったの！`onError` コールバックを追加して `toast.error("変更の保存に失敗しました")` で即通知するようにしたよっ🎀💡

### 機能変更っ

- **スヌーズ機能を UI からオミットしたよ〜** — Issue #619。記事ヘッダーの SnoozeMenu と `z` キーショートカットを削除。バックエンド（`snoozeArticle` / `snoozedUntil` ストレージ・マージロジック・既読フィルター）は丸ごと残してあるから、UI 復活が必要になったら `ArticleHeader.tsx` の `<SnoozeMenu>` レンダリングと `shortcuts.ts` の `z` 定義を戻すだけで OK だよ〜🔧

### テスト追加っ

- **`rate-limit.ts` の `checkSlidingWindow` を `rate-limit-logic.ts` に純粋関数として切り出してテストしたよ〜** — Issue #618。`next/*` 非依存にすることで Playwright の Node ランナーから直接 import してユニットテストできるようになったの！通過/拒否判定・window 境界・Retry-After 算出・maxCalls=0 や空配列のエッジケース等 10 ケースで網羅したよ。`failClosed` 等の KV 障害時挙動は呼び出し側 (`rate-limit.ts`) に残してて、ロジックだけ別ファイルに切り出した綺麗な分離だよっ✅✨
- **`dev-auth-bypass.ts` と `storage.ts` のユニットテストを追加したよ〜** — Issue #612。`getDevBypassUserId` の正規表現境界値（128 文字ぴったり / 129 文字超 / 許可外文字）と `buildDevBypassProfile` の戻り値構造、`toggleSetItem` の Set トグル動作（追加・削除・空 Set 起点・immutable）と deferred-save の冪等性・複数キー独立性を 18 ケースで網羅したよ〜。`rate-limit.ts` の `checkSlidingWindow` テストは `next/server` 依存問題で純粋関数化リファクタが必要なため #618 で別途対応するよ✅✨

### アクセシビリティ改善っ

- **NewArticleBanner の button 入れ子を解消したよ〜** — Issue #611。HTML 仕様違反（インタラクティブ要素の入れ子禁止）でスクリーンリーダーから閉じるボタンが文脈不明になってたから、外側を `role="status"` の div に変えて、スクロールトップ用と閉じる用ボタンを兄弟関係に並べたよ。Tab 順もちゃんと整ったっ🎀✨
- **ライトテーマの `text-faint` / `text-muted` コントラスト比を WCAG AA レベルに引き上げたよ〜** — Issue #611。stone-300（背景に対して 1.4:1）→ stone-400 にアップで、タイムスタンプ・フィード名等が弱視・高齢ユーザーにも読めるようになったよ。`text-muted` も stone-500 で AA バッチリだよっ🎀💡
- **undo トーストをスクリーンリーダーで読み上げ対象にしたよ〜** — Issue #611。`aria-live="polite"` のライブリージョン内ではフォーカス可能要素が読み上げられない仕様だったから、undo タイプ時は `aria-live="assertive"` + `aria-atomic="true"` に動的切替して、「元に戻す」操作の存在をちゃんと案内するようにしたよっ🎀✨

### セキュリティ対策っ

- **`/api/auth/me` のレートリミットキーで access_token の生値を SHA-256 ハッシュ化したよ〜** — Issue #613。session_id がない場合に JWT 全文（300〜800 文字）が KV キーに連結されて、Cloudflare KV の 512 バイト制限を超えると例外で 503 になる経路があったの！sha256Hex で 64 文字固定にして安全になったよ。JWT 利用記録が KV に永続化されちゃうプライバシー懸念も解消だよっ🔒💡
- **`inflightRefresh` の全クリア戦略を最古エントリ削除に変更したよ〜** — Issue #613。Map サイズが上限超過時に全クリアすると進行中の refresh Promise への参照が消えて deduplication が崩壊、使い捨てリフレッシュトークンの 2 回使用でセッション無効化される経路があったの！最古 1 件削除に変更して deduplication を保護したよっ🔒✨

### バグ修正っ

- **サイドバーフッターの「もっと見る」ドロップダウンが記事一覧の裏に隠れる問題を修正したよ〜** — Issue #617。#608 で SidebarFooter に追加した `overflow-x-auto` が新しい stacking context を作って、内部の `absolute z-50` ドロップダウンが親より上に出られなくなってたの！フッターの overflow は外して、stacking context の問題を解消したよ。`SidebarHeader` と `ArticleListHeader` の overflow-x-auto は維持（こっちにはドロップダウンないから OK）🔧💡
- **ペイン幅を狭くするとヘッダー/フッターが隠れちゃう問題を横スクロールで救済したよ〜** — Issue #608。`SidebarHeader` / `ArticleListHeader` 上段の 2 箇所の flex コンテナに `overflow-x-auto` と `[&>*]:shrink-0` を追加！リサイザーで幅を狭くしてもボタン群が潰れず、はみ出した分は横スクロールでアクセスできるようになったよ〜🔧✨
- **コンテンツ幅の境界線をドラッグで動かせなくなってた問題を修正したよ〜** — Issue #606。`ConfirmModal` が App.tsx で常時マウントされてるのに `usePopupLock()` を引数なしで呼んでたから、アプリ起動直後から popup-lock のカウンタが立ちっぱなしになって `hasOpenPopup` が常に true、リサイザーが `pointer-events-none` で操作不能になってたのが原因！`usePopupLock(isOpen)` に変えて isOpen 連動にしたよ。`if (!isOpen) return null` + `usePopupLock()` 引数なしの組み合わせを禁止する静的検査も追加して再発防止っ🔧💡
- **JWKS フェッチ失敗時にステールキャッシュを使うよう修正したよ〜** — キャッシュ期限切れのタイミングで JWKS サーバーが一時的に落ちてると `keyCache` だけクリアされて「トークン検証失敗」が全ユーザーに出ちゃってたの修正！フェッチ失敗時は古いキャッシュで継続して認証が全断しないようになったよっ🔧💡
- **`isBetaAllowed` 拒否時に sub の調査ログを出すようにしたよ〜** — Issue #597。Pairwise Sub ID を更新したのにベータ制限で弾かれる問題を切り分けやすくするため、`BETA_ALLOWED_SUBS` のリストに含まれない sub が来たら `subPrefix`（先頭16文字）と `subLength` を `console.warn` で出力するようにしたよ！sub 全体は出さないからログ流出しても安全だよっ🔧🔒

### セキュリティ対策っ

- **auth ルートで Cookie 名一覧をログ出力していた箇所を bool に変えたよ〜** — Issue #601。`/api/auth/login` と `/api/auth/callback` で `existingCookies: cookieNames` として全 Cookie 名をログに出してたんだけど、Cloudflare Workers ログ閲覧権限者に session_id / access_token の存在情報が筒抜けだったの！代わりに `hasSessionCookie` / `hasAccessToken` のフラグだけ残して、必要な情報量はそのままで漏洩リスクをカットしたよ〜🔒💡

### アクセシビリティ改善っ

- **Modal 閉じた時に元のフォーカス要素に戻すようにしたよ〜** — Issue #602。WCAG 2.4.3 (Focus Order) 違反の状態で、モーダルを閉じるとフォーカスが body に飛んでページ先頭に戻されちゃってたの修正！モーダル開くときの `document.activeElement` を `useRef` に退避して、クリーンアップで戻すようにしたよ。Modal をベースにする 10 件以上のモーダル全部に効くよっ🎀✨

### パフォーマンス改善っ

- **ArticleList で `feeds.find()` を `feedMap.get()` に置き換えたよ〜** — Issue #600。ギャラリービューで右クリック・ロングプレスするたびに 1000 フィード分の線形探索（O(n)）が走ってたのを `Map.get()` の O(1) にしたよ〜。`feedMap` を `Map<feedHash, Feed>` に拡張してフィード全体を引けるようにしたよっ⚡🚀

### ドキュメント整備っ

- **`RSSHUB_INSTANCE_URL` / `RSSHUB_ACCESS_KEY` / `CLOUDFLARE_ACCOUNT_ID` を architecture.md に追記したよ〜** — Issue #604。`src/lib/rsshub.ts` と `src/lib/content.ts` で参照してたのに「Cloudflare Workers シークレット」セクションに載ってなくて新規セットアップでハマるポイントだったの！`POST /api/feeds/refresh` と `POST /api/auth/dbsc/{register,challenge}` も api-spec.md に追記してエンドポイント仕様の網羅性を上げたよっ📚✨

### セキュリティ対策っ

- **OPML インポートに Content-Type バリデーションを追加したよ〜** — Issue #577。`text/xml`・`application/xml`・`text/plain` 以外の Content-Type で 415 を返すようにしたよっ。防御の層が増えてセキュリティバッチリ🔒✨
- **`isBetaAllowed` を fail-closed 設計に変更したよ〜** — Issue #576。`BETA_ALLOWED_SUBS=""` の誤デプロイで全ユーザー許可になるリスクを排除！空文字・未設定 = 全拒否になったよっ🔒🎀
- **未使用の `dompurify` を devDependencies から削除したよ〜** — Workers 非対応が判明済みだったのに残ってたパッケージを削除。`@types/dompurify`（deprecated）も一緒に除去したよっ🔒🎀
- **DBSC `/api/auth/dbsc/register` のチャレンジ照合を `timingSafeEqual` に統一したよ〜** — `challenge` ルートは既に対応済みだったのに `register` ルートだけ通常の文字列比較だったの修正。一貫性バッチリになったよっ🔒✨
- **`POST /api/recommendations/dismiss` に 2 秒クールダウンを追加したよ〜** — 他の POST エンドポイントと一致させて R2 読み書きの乱用を防いだよっ🔒💡
- **`GET /api/recommendations` から副作用（AI 生成・R2 書き込み・KV 書き込み）を除去したよ〜** — Issue #560。HTTP GET が R2/KV 書き込みと Workers AI 呼び出しを発動してたのを修正！GET はキャッシュ読み取りのみ、生成は `POST /refresh` に移動して HTTP セマンティクス準拠・CSRF 安全になったよっ🔒✨
- **`withJsonBody` に 512KB ペイロード上限チェックを追加したよ〜** — Issue #558。大きな JSON ボディで Worker OOM を誘発できてたのを `request.text()` でサイズ確認してから parse するよう修正したよっ🔒✨

### 激アツ新機能っ

- **ダイジェストビュー — 「今日読むべき記事」をエンゲージメントスコアで自動キュレーションしたよ〜** — Issue #499 MVP-A。サイドバーの「ダイジェスト」ボタンをクリックすると、過去の閲覧・いいね・ブックマーク行動をもとに高スコアなフィードの記事が上位表示されるよっ。AI不使用でサクサク動くよ〜✨📰
- **SingleFile 連携の設定 UI を追加したよ〜** — Issue #590。ユーザー設定の「インポート/エクスポート」タブに clip エンドポイント URL とコピーボタンが追加されたよ！SingleFile ブラウザ拡張から記事をサクッと保存できるようになったよっ✨🎀
- **`useRecommendations` に失敗時リトライ UI を追加したよ〜** — Issue #583。推薦読み込みに失敗してもサイレント失敗せず、エラーメッセージ＋「再試行」ボタンが表示されるようになったよっ💡🎀

### アクセシビリティ改善っ

- **`FeedContextMenu`・`ShareMenu`・`FeedItemComponent` にキーボードナビを追加したよ〜** — Issue #582。Arrow Up/Down でのフォーカス移動・ESC でのメニュー閉じが有効になり、`ShareMenu` に `role="menu"` / `role="menuitem"` も追加したよっ🎀✨。`FeedItemComponent` も `tabIndex` と Enter/Space キー選択に対応したよっ！

### テスト追加っ

- **`web-push.ts` の VAPID 署名・暗号化ロジックのテストを追加したよ〜** — Issue #585。`sendPush` / `sendPushToAll` の正常系・期限切れ endpoint・VAPID 未設定・SSRF 防御など 21 テストケースで網羅したよっ✅🔒

### パフォーマンス改善っ

- **`buildFeedUserMap` にユーザーインデックスを追加して cron の R2 LIST を削減したよ〜** — Issue #592。`meta/user-index.json` でユーザー ID 一覧を管理して、cron が毎回 R2 LIST + 全購読ファイル読み込みしてたのを廃止！インデックスが空の場合は既存フォールバックで後方互換もバッチリだよっ⚡🚀。KV キャッシュ TTL も 900秒 → 1800秒に延長してさらに効率アップしたよっ✨
- **`PATCH /api/feeds/:id` の R2 読み込みを並列化したよ〜** — Issue #578。`readUserSubscriptions` と `readFeedMeta` を `Promise.all` で同時取得するようにしたよ〜。`groupId` 指定時は `readFeedGroups` も一緒に並列取得してレイテンシ削減できたよっ⚡🚀
- **`totalUnread` の計算を 200ms デバウンスしたよ〜** — Issue #580。既読にするたびに毎回フルスキャンしてたのをデバウンスして、タブタイトルとファビコンバッジの更新が滑らかになったよっ⚡💡
- **`useFeedData`・`useFeedGroups`・`useCollections` に AbortController を追加したよ〜** — Issue #561。アンマウント後もフェッチが続いてネットワークリソースが無駄になってたのを修正したよっ⚡💡

### 激アツ新機能っ

- **`useCollections` にリトライ機能を追加したよ〜** — Issue #565。コレクション読み込み失敗時に再試行ボタンが表示されるようになったよっ✨🎀
- **AI 429 エラー時に Retry-After ヘッダーから待機時間を表示するようにしたよ〜** — Issue #564。「60秒後に再試行できます」って具体的に教えてくれるよっ💡✨
- **フィードの nsfw・priority 等の PATCH 操作に楽観的更新を追加したよ〜** — Issue #567。サーバー応答待ちなしで即座に UI に反映されるよっ🚀🎀
- **アクセスログにリクエストID・ユーザーIDを追加したよ〜** — Issue #595。`[access] GET /api/feeds userId=xxx requestId=a1b2c3d4` 形式でログに出るようになったから障害調査がサクッとできるよっ💡🔧
- **エラーレスポンスにインシデントIDを追加したよ〜** — Issue #594。5xx エラー発生時に `incident` フィールドがレスポンスに入るよ〜。ユーザーが報告してくれたIDでログ検索できるようになったよっ💡🎀

### リファクタリングっ

- **`listAllFeedHashes` dead code を削除したよ〜** — Issue #591。cron で使われなくなってた関数を `shared-feed.ts` から完全に除去してスッキリ🔧✨
- **`marked` を動的 import に変更してバンドルサイズを削減したよ〜** — Issue #579。`content.ts` の静的 import を `await import('marked')` に変更して Worker 起動時間が短縮されたよっ⚡💡
- **`article-utils.ts` から React import を除去して `article-ui-helpers.ts` に分離したよ〜** — Issue #569。サーバーサイドコードに React が混入しないスッキリ構成になったよっ🔧✨

### 簡素化っ

- **`devError` ヘルパーを作成して console.error ガードを統一したよ〜** — Issue #568。17 箇所に散在してた `if (process.env.NODE_ENV !== 'production') console.error(...)` を `devError()` 1 行にまとめたよっ🎀💡

### テスト追加っ

- **`ai-route-helper.ts` の型ガード・バリデーション関数のテストを追加したよ〜** — Issue #586。`isWorkersAiModelId` など純粋関数を 29 テストでカバーしたよっ✅🎀
- **`read-state-sync-api.ts` の型ガード・SaveResult 構造のテストを追加したよ〜** — Issue #587。`isReadState` など 24 テストを追加したよっ✅✨
- **`pMapSettled` / `pMap`（concurrency.ts）のテストを追加したよ〜** — Issue #573。17 テストケースで並行処理の動作をしっかり検証できるようになったよっ✅🎀
- **`browser-summarizer.ts` のテストを追加したよ〜** — Issue #575。`browser-translator.ts` と対称的なテスト体制になったよっ✅✨

### ドキュメント整備っ

- **`FeedAddModal` のエラーメッセージに `role="alert"` と `aria-describedby` を追加したよ〜** — Issue #584。スクリーンリーダーがエラー発生を自動アナウンスするようになったよっ🎀✨
- **api-spec.md に 14 エンドポイントの仕様を追記したよ〜** — Issue #588。認証フロー・フィード管理・コンテンツ取得系など合計 14 本のエンドポイント仕様が揃ったよっ📝✨
- **architecture.md のカバレッジマップとディレクトリ構造を補完したよ〜** — Issue #589。テスト spec 14 ファイル・lib/hooks/components の追記漏れを全部埋めたよっ📝🎀
- **api-spec.md に Push 通知エンドポイントの仕様を追記したよ〜** — Issue #572。vapid-key・status・subscribe・unsubscribe・test の 5 エンドポイントが仕様書に載ったよっ📝🎀
- **api-spec.md に Collections・FeedGroups・Feeds export/reinfer の仕様を追記したよ〜** — Issue #574。10 エンドポイント分の仕様をちゃんと書いたよっ📝✨

### セキュリティ対策っ

- **`/api/stats` にスライディングウィンドウ（60秒 30回）・`/api/auth/me` に 5 秒クールダウンを追加したよ〜** — Issue #558。レートリミットなしで DoS ベクターになってたのを修正したよっ🔒✨
- **DBSC ルートハンドラのエラーレスポンスを `apiError()` に統一したよ〜** — Issue #571。`code` フィールドが欠落してたのを直したよっ🔒🎀

### パフォーマンス改善っ

- **`useSliderGallery` のイベントリスナーに AbortController を追加してメモリリークを修正したよ〜** — Issue #561。記事切り替えのたびにリスナーが蓄積されてたのをちゃんとクリーンアップするようにしたよっ⚡✨
- **`useGlobalFilterAutoRead` の `readIdsRef` を deps から除去して不要な全記事再走査を防いだよ〜** — Issue #563。既読操作のたびに全記事スキャンしてたのを修正したよっ⚡💡

### アクセシビリティ改善っ

- **新着記事通知バナーの閉じるボタンを `role="img"` span から `<button>` 要素に修正したよ〜** — Issue #564。スクリーンリーダーがクリック可能なボタンとして認識できるようになったよっ♿🎀

### リファクタリングっ

- **`WorkersAiModelId` の型ガード関数を `ai-models.ts` に集約して 2 ファイルの重複と unsafe キャストを排除したよ〜** — Issue #570。`isWorkersAiModelId()` で型安全に検証できるようになったよっ🔧✨

- **`DELETE` / `PATCH /api/feeds/:id` に `isValidFeedHash` バリデーションを追加したよ〜** — Issue #539。`/refresh` や `/reinfer` と同じガードパターンに統一したよっ🔒✨
- **`PATCH` / `DELETE /api/collections/:id` に UUID フォーマット検証を追加したよ〜** — Issue #539。任意長文字列がそのまま処理を通過しちゃう問題を修正したよっ🔒🎀

### アクセシビリティ改善っ

- **`MarkAllReadButton` に `aria-label` を追加したよ〜** — Issue #545。アイコンのみのボタンが `title` 属性だけだったのを修正して、スクリーンリーダーがちゃんと読み上げられるようになったよっ♿✨
- **`ToggleIconButton` に `aria-pressed` を追加したよ〜** — Issue #550。isActive 状態をセマンティクスでも伝えられるようになったよっ♿💡
- **`FeedAddModal` の進行中テキストに `aria-live="polite"` を追加したよ〜** — Issue #549。RSS フィードを探索中のステータス変化がスクリーンリーダーに通知されるようになったよっ♿🎀

### リファクタリングっ

- **`FeedHealthModal` のローカル `timeAgoLabel` 関数を削除して `article-utils.ts` の `timeAgo` を再利用したよ〜** — Issue #551。DRY 違反を解消したよっ🔧
- **`useArticleViewTts` の Shift+P キーダウンハンドラを `handleTtsToggle()` 呼び出しに統一したよ〜** — Issue #552。同一ロジックの重複をなくしてコードをスッキリさせたよっ🔧✨

### ドキュメント整備っ

- **`architecture.md` のテストカバレッジマップに `e2e/cron-fetch.spec.ts` を追記したよ〜** — Issue #557。カバレッジ状況が正確に把握できるようになったよっ📝

### アクセシビリティ改善っ (追加)

- **`FeedQuickSwitchModal` に `role="dialog"` / `aria-modal` / `aria-label` を追加したよ〜** — Issue #544。createPortal 描画のモーダルがスクリーンリーダーにダイアログとして認識されるようになったよっ♿✨
- **`RecommendationSection` の購読/非表示ボタンに `aria-label` と `focus-visible:opacity-100` を追加したよ〜** — Issue #546。キーボード操作でもボタンが表示されて説明が読み上げられるようになったよっ♿🎀
- **`FeedContextMenu` の全ポータルメニューに `role="menu"` / `role="menuitem"` と Escape キー処理を追加したよ〜** — Issue #547。5つのメニューポータルが全てキーボードで閉じられるようになったよっ♿💡
- **`ConfirmModal` に Tab/Shift+Tab フォーカストラップを追加したよ〜** — Issue #548。Modal.tsx と同じパターンで実装してモーダル外へのフォーカス漏れを防いだよっ♿🔧

### パフォーマンス改善っ (追加)

- **`markBulkRead` の `new Set([...prev, ...newIds])` スプレッドを `for...of` ループに変更したよ〜** — Issue #543。50,000件規模の一括既読処理で中間配列生成コストを排除したよっ🚀✨
- **`useGlobalFilterAutoRead` の全記事 Set 再構築を差分追加に変更したよ〜** — Issue #542。5分ポーリングのたびに O(n) Set コピーが走ってた問題を新着 ID だけ追加する形に修正したよっ🚀🎀
- **`useSidebarFeeds` の `unreadByFeed` 計算を `useSyncedRef` 最適化したよ〜** — Issue #541。既読操作のたびに全記事走査が再実行されてた問題を、`readIds` と `readBeforeTimestamp` を ref 化して deps から除外することで解決したよっ🚀💡
- **`ArticleList` の `resolveItemProps` を `useSyncedRef` でラップして `CompactItem` の memo を有効化したよ〜** — Issue #540。インライン関数で memo スキップが機能しなかった問題を修正して仮想スクロールのパフォーマンスを改善したよっ🚀🔧

### リファクタリングっ (追加)

- **`ai-route-helper.ts` に `isAiError` 型ガードを追加して unsafe キャストを排除したよ〜** — Issue #553。`err as Record<string, unknown>` キャストを型安全な型ガード関数に置き換えたよっ🔧✨

### テストっ (追加)

- **`validation.ts` の未テスト関数 5 個にユニットテストを追加したよ〜** — Issue #554。`isValidIso8601` / `extractIds` / `parseNotes` / `parseSnoozedUntil` / `isValidBase64url` の 53 件テストを `e2e/validation-functions.spec.ts` として新規作成したよっ🧪✨
- **`retry-after.ts` の `parseRetryAfter` にユニットテストを追加したよ〜** — Issue #555。delta-seconds・HTTP-date・fallbackMs・maxMs オプションを全網羅した `e2e/retry-after.spec.ts` を新規作成したよっ🧪🎀
- **`embed-utils.ts` の `extractEmbedThumbnailUrl` にユニットテストを追加したよ〜** — Issue #556。YouTube / youtube-nocookie.com / Shorts / embed URL の全バリエーションをカバーした `e2e/embed-utils.spec.ts` を新規作成したよっ🧪💡

---

### アクセシビリティ改善っ

- **`ShareMenu` のトリガーボタンに `aria-expanded` / `aria-haspopup` を追加したよ〜** — Issue #525。スクリーンリーダーがポップアップの開閉状態を読み上げられるようになったよっ！同ディレクトリの SnoozeMenu / FilterMenu に合わせて実装したよ〜♿✨
- **`ArticleView` の `<main>` に `aria-label="記事本文"` を追加したよ〜** — Issue #526。landmark ナビゲーションでスクリーンリーダーが記事本文エリアに直接ジャンプできるようになったよっ！♿💡
- **`ArticleAiPanel` の AI 要約結果に `aria-live="polite"` を追加したよ〜** — Issue #527。要約が非同期で生成されたとき、スクリーンリーダーが自動でアナウンスしてくれるようになったよっ！♿🎀
- **新着バナーのネストした `<button>` 問題を修正したよ〜** — Issue #528。`<div role="button">` を `<button>` に変更して、内部の閉じるボタンを `<span>` に変更したよ！HTML 仕様違反が解消されて二重読み上げもなくなったよっ♿🔧
- **翻訳/原文タブに `role="tablist"` / `role="tab"` / `aria-selected` を追加したよ〜** — Issue #529。スクリーンリーダーがタブ UI として認識できるようになって、矢印キーで標準的なタブナビゲーションができるよっ！♿✨

### リファクタリングっ

- **`useArticleViewTts` の TTS テキスト構築ロジックを `buildTtsText` 関数に抽出したよ〜** — Issue #537。`handleTtsToggle` と Shift+P キーショートカットの2箇所に重複してたコードを1つにまとめたよっ🔧
- **`FeedDetailModal` / `AiNotificationTabPanel` の素の `fetch()` を `apiFetch` に統一したよ〜** — Issue #536。セッション期限切れ時の自動リフレッシュリトライと DBSC チャレンジ処理が `/api/push/config` にも適用されるようになったよっ✨🔒

### ドキュメント整備っ

- **`coding-conventions.md` の `FetchEnv` 型定義を実装に合わせて修正したよ〜** — Issue #538。`Pick<CloudflareEnv, 'RSS_DATA'>` と記載してたのを実際の `RSS_DATA | FINDME_RSS | RATE_LIMIT` に更新したよっ📝

### セキュリティ対策っ

- **`PUT /api/push/config` の disabledFeeds に feedHash 形式チェックと件数上限を追加したよ〜** — Issue #531。任意の文字列キーで R2 が肥大化するストレージ DoS を修正！`/^[0-9a-f]{16}$/` と `MAX_FEEDS_PER_USER` でガッチリガードしたよっ🔒
- **`POST /api/articles/save` に 5 秒クールダウンを追加したよ〜** — Issue #532。外部 OGP フェッチが無制限に叩かれる問題を修正！他のエンドポイントと同様に `applyCooldown` でレートリミット実装したよっ🚀
- **`useContentLinkPreviews` の `r.ok` チェック漏れを修正したよ〜** — Issue #535。API が4xx/5xx を返しても無言で失敗してた問題を `if (!r.ok) throw new Error(...)` で正しく処理するようにしたよっ✨

### パフォーマンス改善っ

- **`useFeedSidebarActions` の deps を `useSyncedRef` でスリム化したよ〜** — Issue #530。記事を読むたびにサイドバー全体が再レンダリングされてた問題を修正！`readIds`・`articles` 等を `useSyncedRef` でラップして deps から外したことで無駄な再描画がなくなったよっ✨🎀
- **`FeedSidebar` に `totalUnread` を prop 経由で渡して二重計算をなくしたよ〜** — Issue #533。App.tsx で計算済みの値をそのまま渡すだけで `useSidebarFeeds` による同じ全記事走査が不要に！✨🚀
- **`getUserLatestArticles` の無制限並行 R2 アクセスを `pMap` で制限したよ〜** — Issue #534。`Promise.all` で全フィードを一斉に R2 GET してた問題を `pMap(R2_CONCURRENCY=50)` に変更！Workers サブリクエスト上限リスクを解消したよっ🔒

### テストっ

- **cron/fetch.ts のコアRSSロジックにユニットテスト追加したよ〜** — Issue #520。`buildBatchedPushPayload`・`buildArticle`・`applyFeedSuccess`・`applyFeedRateLimit`・`applyFeedError` の 35 件テストが全部 PASS！R2 不要の純粋関数に `export` 付けてテスト可能にしたよっ✨🧪

### セキュリティ対策っ

- **happy-dom + DOMPurify の Cloudflare Workers 互換性を検証したよ〜** — Issue #514。Node.js 環境では 13 件全 PASS だけど happy-dom が `vm` モジュール依存で Workers 非対応と判明！現行 regex ベース `sanitizeHtml()` を継続利用する方針に決定したよっ🔍🔒

## 2026-05-07

### アクセシビリティ改善っ

- **サイドバーボタンのタップターゲットを 44×44px に拡大したよ〜** — Issue #519。WCAG 2.5.5 準拠！FooterIconButton・SpecialViewButton・FeedViewTabs・「すべて」ボタン・フッター各ボタン全部に `min-h-[44px] min-w-[44px]` を付けたよっ✨♿
- **キーボードフォーカスリングをサイドバー全ボタンに追加したよ〜** — Issue #519。`focus-visible:ring-2 focus-visible:ring-ink` でキーボードナビのときだけリングが出るよっ！マウス操作には出ないから見た目もスッキリ〜🎀

### バグ修正っ（UX改善）

- **フィード読み込みエラー時に再試行ボタンが出るようになったよ〜** — Issue #518。フィード一覧の取得に失敗したときサイドバーにエラーメッセージと「再試行」ボタンが表示されるよっ！`useFeedData` に `feedLoadError` と `retryFeedList` を追加して、ネットワーク障害からの回復がサクッとできるようになったよ〜💪✨

### セキュリティ対策っ

- **OAuth state 比較をタイミングセーフに変更したよ〜** — Issue #521。`===` での文字列比較はタイミングアタックに脆弱だったから、ループで XOR 比較するタイミングセーフな実装に差し替えたよっ！🔒
- **DBSC チャレンジ比較もタイミングセーフにしたよ〜** — Issue #521。`/api/auth/dbsc/challenge` のチャレンジ値照合も同様にタイミングセーフ比較に変更したよっ！🔒
- **JWT の aud フォールバックを削除したよ〜** — Issue #482。`aud` クレームが `authBaseUrl` でもパスしちゃうフォールバックが本番に残ってたの、完全に削除したよっ！`CLIENT_ID` との一致のみ許可するように厳格化したよ〜🛡️

### バグ修正っ

- **新着バナーのスクロールトップが動くようになったよ〜** — Issue #515。`role="listbox"` セレクタが `role="feed"` と不一致で新着バナークリック時に記事一覧がトップに移動しなかった問題を修正したよっ！💡
- **古いユーザーデータでも記事TTLが正しく動くよ〜** — Issue #516。`articles/route.ts` の ReadState 読み込みに `normalizeReadState` を適用して、古い R2 データで `ttlDays` 等が欠落していた場合のサイレント不整合を修正したよっ！🔧

### パフォーマンス改善っ

- **ギャラリーのチカチカが減ったよ〜** — Issue #517。OGP 画像が 1 件取得されるたびにギャラリー全カードが再レンダリングされていた問題を修正！`ogpCacheRef.current` を使うように変更して無駄な再描画をなくしたよっ✨🚀
- **Cron Push通知の R2 二重読み込みを削減したよ〜** — Issue #522。`sendPushBatched` と `sendPushError` を `sendPushAll` に統合して、同一ユーザーの `push.json` を1回だけ読むようにしたよっ！Cron 実行中の R2 操作コストが下がってコスパ最高〜✨🚀

### リファクタリングっ

- **`stripHtml` の重複実装を統合したよ〜** — Issue #523。`full-text-search.ts` にあった独自 `stripHtml` 関数を削除して `html.ts` の正規実装を import するように一本化したよっ🔧
- **`pMap` の再エクスポートをスッキリさせたよ〜** — Issue #523。`shared-feed.ts` からの `export { pMap }` を削除して、各呼び出し元が `concurrency.ts` から直接 import するように整理したよっ✨
- **`filter(Boolean)` を型安全な型ガードに置き換えたよ〜** — Issue #523。`as string[]` キャストを使わずに `filter((x): x is string => x != null)` で型安全に書き直したよっ💡

---

## 2026-05-07

### 激アツ新機能っ

- **フィードエラー通知** — Issue #501。フィードが 5 回連続で取得失敗したら Push 通知で教えてくれるよっ🔔 設定の「AI・通知」タブから ON/OFF も切り替えられるよ〜✨
- **Slack・Discord をシェア設定先に追加したよ〜** — Issue #511。記事ヘッダーのクイックシェアボタンにピン留めできるようになったよっ！タイトル＋URL がクリップボードにコピーされてアプリが自動で開くから、サクッとシェアできちゃう感じ最高〜✨🎀

### リファクタリングっ

- **UserSettingsModal（973行）をタブ別サブコンポーネントに分割したよ〜** — Issue #502。973行の巨大コンポーネントを `src/components/user-settings/` 配下の4タブパネル（DisplayTabPanel・AiNotificationTabPanel・FeedManagementTabPanel・ImportExportTabPanel）＋共有ユーティリティ（shared.tsx）に分割したよっ！メインファイルは 153行まで激減して、各タブの責務がスッキリ分かれたよ〜🔧✨

### アクセシビリティ改善っ

- **ダークテーマの薄いテキスト色を WCAG AA 準拠に修正したよ〜** — Issue #498。`text-muted` が zinc-500（#71717a）で zinc-900 背景に対してコントラスト比 3.57:1 しかなくて、`text-faint` にいたっては zinc-600（#52525b）でなんと 2.21:1 しかなかったよっ！WCAG AA 基準（通常テキスト 4.5:1、大テキスト 3:1）に全然届いてなかったから、`text-muted` を zinc-400（#a1a1aa、コントラスト比 ~5.75:1）に、`text-faint` を zinc-500（#71717a、コントラスト比 ~3.57:1）にアップデートしたよ〜🔍♿✨

### バグ修正っ

- **スマホでピンチズームしたら画面外に飛んでいくバグを修正したよ〜** — Issue #513。モバイルで translateX でオフスクリーンに押しやったペインが、ピンチズームやスワイプで到達できちゃってたよっ！`ThreePaneLayout` に `overflow-hidden` を追加して、ちゃんと見えないようにしたよ〜💪🎀

- **コンテンツ幅設定が記事ビューに反映されなくなってた問題を修正したよ〜** — Issue #510。スクロールコンテナ（`overflow-x: hidden`）の中で `mx-auto + max-width` だけだと幅が効かなかったから、コンテンツ div に `w-full` を追加して明示的にコンテナ幅を基準にするよう修正したよっ！「narrow」「medium」「wide」「full」の幅設定がちゃんと視覚的に反映されるよ〜🎀✨

### UX 改善っ

- **Chrome AI 利用不可時に具体的な理由と手順を表示するよ〜** — Issue #512。要約プロバイダが Workers AI にフォールバックしてる時、「Chrome の設定を確認してください」って曖昧なメッセージしか出てなかったのを改善したよっ！モデルダウンロード中・ストレージ不足・フラグ未設定など理由別に具体的なアクションを表示するようにしたよ〜🔍✨

### セキュリティ対策っ

- **HTML サニタイザーに XSS バイパステストを追加したよ〜** — Issue #487。制御文字を含む onerror 属性・SVG コンテキスト・HTML エンティティエンコードされた javascript: スキーム・data: URI・MathML コンテキストの未検証パターンをテストでカバーしたよっ！自製 regex サニタイザーがこれらのパターンを全てブロックできることを確認したよ〜🛡️✨
- **画像プロキシの Referer フォールバックを廃止したよ〜** — Issue #493。`Sec-Fetch-Site` ヘッダーがない場合（curl 等の非ブラウザ）は一律拒否するようにしたよっ！有効なセッション Cookie を持つ攻撃者が Referer を偽装してプロキシを悪用できちゃってた問題を修正したよ〜🔒✨
- **OAuth callback の認可コードに長さ・文字種バリデーションを追加したよ〜** — Issue #484。`code` パラメータが 512 文字超 or 英数字・ハイフン・アンダースコア以外の場合に 400 を返すようにしたよっ！外部リクエスト発生前にはじくから安心だよ〜🔒✨
- **DBSC チャレンジ・公開鍵フィールドに最大長バリデーションを追加したよ〜** — Issue #490。`publicKey` 4096 文字・`challenge` 256 文字・`attestation` 65536 文字・`response` 4096 文字の上限を設けて R2 への無制限書き込みを防止したよっ🔒💡

### パフォーマンス改善っ

- **Cron の `feed-last-fetched.json` 更新から不要な R2 GET を除去したよ〜** — Issue #483。毎 Cron 実行でユーザー数分の R2 GET が走ってたのを直接上書きに変更して Cron 実行を高速化したよっ🚀✨
- **`mergeNewArticles` の `existingLatest` を必須化して二重 R2 GET を排除したよ〜** — Issue #496。`existingLatest?: Article[] | null` → `existingLatest: Article[]` に変更してコンパイル時に二重 GET の可能性を排除したよっ🚀💡
- **`/api/articles` の R2 GET を全フィード真並列化したよ〜** — Issue #486。`getUserLatestArticles` を `pMap(concurrency=10)` から `Promise.all` に変更して、フィード数が多いユーザーの応答を高速化したよっ！CF Workers は最大 1000 サブリクエスト対応だから直列バッチ制限を排除できるよ〜🚀✨ `R2_CONCURRENCY` も 10 → 50 に引き上げて `readFeedMeta` バッチも速くなったよっ

### バグ修正っ

- **OGP 取得で 429 が多発してた問題を修正したよ〜** — Issue #509。バックエンドのレートリミットを 2 秒クールダウン → 60 秒スライディングウィンドウ（最大 30 リクエスト）に変更したよっ！フロントエンドも一度に最大 10 件までしか並列フェッチしないよう制限して、50 件同時リクエストが飛んでた問題も解消したよ〜🚀✨

- **デスクトップで記事詳細を開くと他のペインの操作が効かなくなる問題を修正したよ〜** — Issue #508。`inert` 属性がモバイルのシングルペインナビ専用なのにデスクトップでも適用されちゃってたのを `isDesktop` フラグで制御したよっ！`window.matchMedia('(min-width: 1024px)')` で判定して、デスクトップでは全ペインを常にインタラクティブにしたよ〜🖥️✨ `selectArticle` の `setMobilePane("view")` もデスクトップでは呼ばないよう修正したよっ💡

### UX 改善っ

- **モバイルで記事アイテムのアクションボタン（既読・ブックマーク）を常時表示にしたよ〜** — Issue #495。`@media(hover:none)` 環境（タッチデバイス）では `opacity-0` が解除されず隠れたままになってたのを `max-md:opacity-100 max-md:pointer-events-auto` で修正したよっ📱✨ CompactItem・ListItem・CardItem・MagazineItem・GalleryItem の 5 レイアウト全部対応したよ〜🎀

### A11y・UX 改善っ

- **ArticleNavigation の前後ボタンに `aria-label` を追加したよ〜** — Issue #485。前後の記事タイトルを `aria-label` に含めることでスクリーンリーダーが記事名まで読み上げられるようになったよっ✨
- **記事ビューの「戻る」ボタンのタッチターゲットを 44px に修正したよ〜** — Issue #488。WCAG 2.5.5 準拠っ！`ArticleHeader` の戻るボタンに `min-w-[44px] min-h-[44px]` を追加したよ〜📱
- **FeedAddModal の入力フィールドに `label` 要素を追加したよ〜** — Issue #491。URL・Cookie・CSS セレクタの 3 フィールドに `sr-only` ラベルを付けてスクリーンリーダー対応したよっ🎀

### パフォーマンス改善っ

- **`visibilitychange=hidden` 時の不要な read-state フラッシュを防止したよ〜** — Issue #492。変更がないのに毎回 `POST /api/read-state` が飛んでたのを `isDirtyRef` チェックで防いだよ〜🚀 タブ切り替えのたびに無駄なリクエストが消えたよっ💡

### リファクタリングっ

- **`processNestedBlocks` を正規表現単一パスに変更してO(n²)を解消したよ〜** — Issue #507。タグごとに `indexOf` を繰り返す O(n × tags) ループを `matchAll` で全タグを一括収集 → スタックベースの単一パスに書き換えたよ〜🚀 `htmlLower` の二重保持も不要になって、コードもすっきりシンプルになったよっ✨
- **`usePrefetchGalleryContents` の重複コンテンツ取得ロジックを `fetchAndCacheArticle` に抽出したよ〜** — Issue #500。`fetchOne`（バッチプリフェッチ）と `retryArticle`（手動リトライ）がほぼ同じ apiFetch → 429 判定 → 失敗記録 → キャッシュ書き込み → state 更新のフローを持ってたのを共通ヘルパーに集約したよっ🔧✨
- **`deduplicateByLink` の重複検出を 1 パスに最適化したよ〜** — Issue #489。`linkGroups` の構築ループで `hasDupes` フラグも同時に立てるようにして、重複なし時の早期リターンをより確実に。最終フィルターも `Set.has` で O(1) ルックアップなのを明示したよ〜🚀
- **`useArticleFilters` の `eslint-disable` コメントを全部消したよ〜** — Issue #504。`useCallback` の依存配列に `resetPageRef`・`dateRangeRef`・`readingTimeRangeRef`（いずれも `useSyncedRef` で常に安定）を明示的に追加することで、ESLint ルール違反なしに同等の効果を実現したよっ✨
- **`shared-feed.ts` のデバッグ用 `console.log` を除去したよ〜** — Issue #506。Cron の KV キャッシュヒット/ミスログが Workers ログのノイズになってたのをクリーンにしたよっ🧹

### ドキュメント整備っ

- **README.md に `DELETE /api/auth/dbsc/session` を追記したよ〜** — Issue #505。#475 でリリース済みのエンドポイントが API 一覧から漏れてたのを補完したよっ📚

### 激アツ新機能っ

- **ユーザー設定モーダルをタブ分割したよ〜** — Issue #479。1 スクロールで迷子になってたユーザー設定を「表示」「AI・通知」「フィード管理」「インポート・エクスポート」の 4 タブに整理したよっ✨ `role="tablist"` / `role="tabpanel"` / `aria-controls` でアクセシビリティもバッチリ対応したよ〜🎀
- **SegmentGroup の各ラジオボタンに `aria-label` を追加したよ〜** — Issue #479 合わせて修正っ。ラジオグループ内の各ボタンにラベルが付いてスクリーンリーダーで読み上げやすくなったよ〜💡
- **「画像DL先」ラベルを「画像保存フォルダー」に変更したよ〜** — Issue #479 合わせて修正っ。名前がちゃんとわかりやすくなったよっ✨

### A11y・UX 改善っ

- **モバイルタッチターゲットを 44px 以上に拡大したよ〜** — Issue #480。WCAG 2.1 SC 2.5.5 準拠っ！`FilterPillButton`・`LayoutSwitcher` の各ボタンと `Modal` の閉じるボタンに `min-h-[44px] min-w-[44px]` を追加したよっ✨ 小さいボタンにタップミスしてイライラしてたの解消されたよ〜📱
- **非表示モバイルペインに `inert` 属性を追加したよ〜** — Issue #480 合わせて修正っ。Tab キーで非表示ペインに潜り込んじゃう問題を解決したよっ🔒 サイドバー・記事一覧・記事ビューの非表示ペインが完全にフォーカス対象外になったよ〜💡

---

## 2026-05-07

### テスト強化っ

- **API エンドポイント統合テストを追加したよ〜** — Issue #464 #465。`e2e/feeds-crud.spec.ts`・`e2e/read-state-api.spec.ts`・`e2e/feed-groups-api.spec.ts`・`e2e/collections-api.spec.ts`・`e2e/push-api.spec.ts` を新設したよっ✨ フィード URL バリデーション・OPML ラウンドトリップ・read-state マージエッジケース・サイレント時間帯（深夜またぎ含む）まで合計 169 テストが全部グリーンだよ〜💚🎀

---

## 2026-05-07

### 激アツ新機能っ

- **Workers AI モデルに Gemma 3 と Qwen 2.5 Coder を追加したよ〜** — Issue #481。`@cf/google/gemma-3-27b-it`（多言語対応で日本語の要約がめちゃ得意っ✨）と `@cf/qwen/qwen2.5-coder-1.5b-instruct`（コード記事の要約に特化したモデルっ💻）をモデル選択に追加したよ〜！ユーザー設定のモデル選択から使えるよっ🎀
- **DBSC デバイス登録解除エンドポイントを追加したよ〜** — Issue #475。`DELETE /api/auth/dbsc/session` で DBSC バインド済みデバイスをサクッと登録解除できるようになったよっ✨ `dbsc-session.json` を R2 からまるごと削除するシンプル設計だよ〜🔒

- **`window.confirm` / `window.prompt` をカスタムモーダルに置き換えたよ〜** — Issue #468。ブラウザネイティブのダサいダイアログとはお別れっ✨ `ConfirmModal` + `useConfirm` hook を新設して、フィード削除・グループ削除・全既読・キーボードショートカット全部をオシャレなモーダルに統一したよ〜🎀 `window.prompt` も SearchBar のインラインフォームに置き換えたよっ💡
- **`App.tsx` の責務分離でコードがスッキリしたよ〜** — Issue #471。1200 行超えてたモンスターファイルを解体したよっ✨ `useMarkAllRead`（全既読ロジック）・`useFeedSidebarActions`（サイドバーコールバック群）・`ThreePaneLayout`（3ペイングリッド）を新設して、`App.tsx` がスッキリしたよ〜🚀

### ドキュメント整備っ

- **`api-spec.md` に未記載エンドポイントの仕様を追記したよ〜** — Issue #477。`GET/POST /api/engagement`・`GET /api/stats`・`GET/PUT /api/push/config`・`PATCH /api/feeds/:id`・`POST /api/feeds/:id/refresh`・`POST /api/recommendations/dismiss`・`POST /api/recommendations/refresh`・`PATCH /api/collections/:id` のリクエスト/レスポンス/エラーコードを全部書いたよっ✨ これで仕様書とコードがバッチリ一致したよ〜📚

### リファクタリングっ

- **OPML インポートの `succeededCandidates` をインデックス依存から解放したよ〜** — Issue #472。`pMap` + インデックスベースの危うい同期から `pMapSettled` を使った候補とメタのペア管理に変えたよっ✨ 失敗した候補だけを正確に除外できるようになって堅牢さが爆上がりしたよ〜💪

### 激アツ新機能っ

- **OPML インポート時にフォルダー構造をフィードグループに自動変換したよ〜** — Issue #474。`<outline title="Tech">` みたいなフォルダーが自動で FeedGroup になって、配下のフィードにも `groupId` がセットされるよっ✨ 既存の同名グループがあればそこに追加してくれるし、上限 100 件もちゃんと守るよ〜🎀

---

## 2026-05-08

### アクセシビリティ改善っ

- **FilterPillButton に `aria-label` と `aria-pressed` を追加したよ〜** — Issue #466。フィルターピルボタンがスクリーンリーダーに読み上げられるようになったよっ✨ ON/OFF 状態も `aria-pressed` で伝わるよ〜🎀
- **フィードアイテムに `aria-label` を追加したよ〜** — Issue #466。フィード一覧の各アイテムにフィード名が `aria-label` でセットされてスクリーンリーダー対応したよっ✨
- **記事一覧に `aria-setsize` / `aria-posinset` を追加したよ〜** — Issue #467。仮想スクロールの記事に位置情報が付いて「何件中何件目」がスクリーンリーダーに伝わるようになったよっ✨🎀

### セキュリティ対策っ

- **JWKS フェッチに 10 秒タイムアウトを追加したよ〜** — Issue #462。`getJwks()` が `id.0g0.xyz` の無応答で永遠にハングするリスクを解消したよっ✨ 既存の `fetchWithTimeout` を使って認証ハングを防いだよ〜🔒

### バグ修正っ

- **エラーコード `FEED_NOT_FOUND` を `NO_FEED_FOUND` に統一したよ〜** — Issue #473。`api-spec.md` の仕様と実際のコードが一致してなかった問題を修正したよっ✨💡

### パフォーマンス改善っ

- **サイドバーのカウント計算を O(n) → O(1) に最適化したよ〜** — Issue #469。ブックマーク・後で読む・いいね・履歴のカウントが全記事ループから `Set.size` に変わってめちゃ速くなったよっ✨ 件数も全 ID ベースでより正確になったよ〜🚀

### ドキュメント整備っ

- **wrangler.toml と README にオプション環境変数を追記したよ〜** — Issue #476。`RSSHUB_INSTANCE_URL`・`RSSHUB_ACCESS_KEY` の設定方法をコメントとして明記したよっ✨ セルフホスト RSSHub を使いたいユーザーが迷わなくなったよ〜📚

### リファクタリングっ

- **`wrangler.toml` の `compatibility_date` を `2026-05-01` に更新したよ〜** — Issue #478。半年以上古くなってたバージョンを最新にして、新しい Cloudflare Workers ランタイム改善を享受できるようにしたよっ✨🚀

---

## 2026-05-08

### 激アツ新機能っ

- **FeedAddModal に paste & go とクライアントサイド URL バリデーションを追加したよ〜** — Issue #459。URL を貼り付けるだけで自動送信されるようになったよっ✨ 入力中はリアルタイムで URL チェックして、正しい URL なら「追加」ボタンをハイライト、不正な URL なら赤くなるよ〜💡
- **サイドバーフッターに「⋯」ドロップダウンを追加したよ〜** — Issue #454。使用頻度の低いボタン（OPML・Markdown エクスポート・フィードヘルス・ログアウト等）をドロップダウンに格納してスッキリさせたよっ✨ Push 通知テストの `alert()` も Toast に変わったよ〜🎀

### アクセシビリティ改善っ

- **記事リストのコンテナを `role="feed"` に修正したよ〜** — Issue #458。`role="listbox"` から WAI-ARIA 的に正しい `role="feed"` に変更して、各記事アイテムも `role="article"` にしたよっ✨ スクリーンリーダーユーザーに正しいセマンティクスが伝わるようになったよ〜🎀
- **UserSettingsModal の設定グループに Arrow キーナビゲーションを追加したよ〜** — Issue #455。フォントサイズ・行間・コンテンツ幅などの選択グループが `role="radiogroup"` になって、⬅️⮕ キーで選択肢を移動できるようになったよっ✨ Tab でひとつずつ通過する必要がなくなったよ〜💡

### UX改善っ

- **記事アクション（ブックマーク・後で読む・いいね）を独立トグルに変更したよ〜** — Issue #456。いずれかを ON にすると他が自動 OFF になる排他ロジックを削除したよっ✨「ブックマーク済みかつ後で読む」みたいな状態が保持できるようになったよ〜💡
- **フォーカスモードボタンをモバイル画面でも表示するようにしたよ〜** — Issue #460。`hidden lg:block` を削除してスマホでもフォーカスモードが使えるようになったよっ✨
- **Push 通知サイレント時間帯設定をオートセーブに統一したよ〜** — Issue #452。時刻フィールドを変更すると 1 秒後に自動保存されるようになったよっ✨ 「保存」ボタンを押し忘れて設定が消える問題が解消されたよ〜🎀
- **サイドバーフッターのタップターゲットを拡大したよ〜** — Issue #454（続き）。Push 通知ボタンに `p-2` パディングを追加して 44px 相当のタップ領域を確保したよっ✨

### バグ修正っ

- **beforeunload 時の ReadState データ損失リスクを軽減したよ〜** — Issue #451。`visibilitychange → hidden` のタイミングで常に `flushToServer()` を呼び出すようにしたよっ✨ 60KB 超のペイロードで sendBeacon が失敗しても早期フラッシュでリスクを減らせるよ〜🔒

### セキュリティ対策っ

- **画像プロキシに `Sec-Fetch-Mode: navigate` チェックを追加したよ〜** — Issue #450。ブラウザのアドレスバー直打ち等のナビゲーションリクエストを拒否するようにしたよっ✨ Referer 偽造への制限もコメントで文書化したよ〜🔒

### リファクタリングっ

- **serialize-async.ts・rate-limit.ts の Edge Runtime 制約をコメントで明示したよ〜** — Issue #449。`pendingOps` Map がアイソレート内限定の最適化であることを明記して、`prev.then(fn, fn)` を `prev.catch(() => {}).then(fn)` に変更してエラーを明示的に無視するようにしたよっ✨ rate-limit.ts の KV エラーも try/catch で捕捉してログに記録するようにしたよ〜🔧

---

## 2026-05-07

### バグ修正っ

- **`r2Get` が R2 エラーをもみ消してたのを修正したよ〜** — Issue #470。権限障害・ネットワーク障害などの実エラーを握り潰して fallback の空データを返してたのを、ちゃんと呼び出し元に伝搬して 500 を返すように直したよっ💡 `read-state.json` や `subscriptions.json` が R2 障害でぜんぶ空になっちゃう事故を防いだよ〜✨
- **設定モーダルで select 要素にフォーカスしてると j/k キーが誤発火してたのを修正したよ〜** — Issue #457。`HTMLSelectElement` と `contenteditable` 要素にフォーカス中はキーボードショートカットをスキップするようにしたよっ🔧 タイムゾーン選択中に記事がスクロールしちゃう問題が解消されたよ〜✨

### セキュリティ対策っ

- **AI エンドポイントの KV レートリミットを fail-closed に変更したよ〜** — Issue #463。KV ストアが落ちたときにレートリミットが素通りしてた（fail-open）のを、AI エンドポイントは課金が発生するから KV 障害時も 429 を返す fail-closed 方式に変えたよっ🔒 `checkSlidingWindow` に `failClosed` オプションを追加して AI ルートに適用したよ〜✨

### アクセシビリティ改善っ

- **サイドバーの「すべて」ボタンを `div` から `button` 要素に変更したよ〜** — Issue #453。キーボードだけで操作するユーザーとスクリーンリーダーユーザーが「すべて」のフィードに切り替えられるようになったよっ✨ 他の `SpecialViewButton` と統一された実装になったよ〜🔧

### セキュリティ対策っ

- **OPML インポートにクライアントサイドのファイルサイズ制限（5MB）を追加したよ〜** — Issue #448。巨大な OPML ファイルをそのままサーバーに送りつけられちゃう問題を防いだよっ🔒 5MB を超えるファイルはエラートーストを出して早期リジェクトするようにしたよ〜✨

---

### パフォーマンス改善っ

- **articles API のポーリング（`?since=`）で meta.json を N 件読むのをやめたよ〜** — Issue #400 / #413。cron がフィード取得のたびに `users/{userId}/feed-last-fetched.json` を更新するようにして、`since` 指定リクエストはこの 1 ファイルを読むだけで済むようになったよっ🚀 フィードを 100 件購読してても R2 GET が 1 件で完結するようになったよ〜✨

---

## 2026-05-07

### 激アツ新機能っ

- **記事ヘッダーにクイックシェアボタンを追加したよ〜** — Issue #446。設定でシェア先（X・Bluesky・LINE・はてブ）を選んでおくと、記事ヘッダーにワンタップでシェアできるボタンが並ぶよっ✨ デフォルトは非表示なのでシェアしたい人だけ設定でオンにしてね〜💡

### バグ修正っ

- **スマホで X にシェアするときアプリ内ブラウザが開いちゃってた問題を修正したよ〜** — Issue #447。`x.com/intent/post` から `twitter.com/intent/tweet` に変えて、X アプリ内ブラウザを回避できるようにしたよっ📱 完全な回避には「システムで共有」もおすすめだよ〜✨

### リファクタリングっ

- **`useFilteredArticles` の Options インターフェース（26フィールド）を4グループに分割したよ〜** — Issue #406。`FeedSelectionOptions` / `ReadStateOptions` / `ContentFilterOptions` / `UiOptions` に分けて `extends` で合成するようにしたよっ🔧 `article-filter.ts` の `ArticleFilterOptions` も同様に4グループに分割済みだよ〜✨ 呼び出し元（App.tsx）は変更なしで後方互換を保持してるよ〜

- **ユーザー設定モーダルにフィード管理セクションを追加したよ〜** — Issue #420。「登録フィード: X / 1000 件」の現在数/上限数が確認できるようになったよっ✨ 上限の 80% 以上になると amber 色で警告表示されるよ〜⚠️ 「フィードの健全性を確認」ボタンからそのまま FeedHealthModal も開けるようになったよっ📊

### リファクタリングっ

- **`useReadStatePersistence` の raw dispatcher を外部から隠蔽したよ〜** — Issue #399。`ReadStatePersistenceResult` から生の `setReadIds` / `setBookmarkIds` 等 9 つの `React.Dispatch` を削除して、`getSetStateDispatchers()` / `getOtherStateDispatchers()` ファクトリメソッドに集約したよっ🔧 `useReadState` 以外から誤って内部 dispatcher を触れなくなって安全になったよ〜✨

---

## 2026-05-07

### UX改善っ (追加)

- **全文取得中のスピナーに「取得中...」テキストと時間超過警告を追加したよ〜** — Issue #412。スピナーだけで何も分からなかったのが、5秒超えると「(時間がかかっています...)」も出るようになったよっ✨ ユーザーが諦めずに待てるようになったよ〜💡
- **ギャラリーレイアウトでモバイル長押しコンテキストメニューに対応したよ〜** — Issue #416。右クリックだけだったのを 500ms 長押しでも開けるようになったよっ📱 ブックマーク・既読切替がモバイルからも使えるようになったよ〜✨
- **フィード追加中にタイマーベースの進捗メッセージを表示するようにしたよ〜** — Issue #435。「フィードを確認中...」→「RSS フィードを探索中...」→「AI でセレクタを推論中...」と段階的にメッセージが変わって、待ち時間がわかりやすくなったよっ✨

### パフォーマンス改善っ (追加)

- **`fetchMarkdownFromHtml` の送信 HTML を 500KB に上限設定したよ〜** — Issue #417。5MB の HTML をまるごと Cloudflare AI API に送ってたのを 500KB に切り詰めるようにしたよっ🚀 転送量を最大 90% 削減できるよ〜💡

### セキュリティ対策っ (追加)

- **DBSC 登録が既存のデバイスバインドを上書きできてたのを防いだよ〜** — Issue #433。`POST /api/auth/dbsc/register` で既存バインドがある場合は 409 Conflict を返すようにしたよっ🔒 access_token が漏洩しても DBSC バインドを攻撃者が上書きできなくなったよ〜✨

### パフォーマンス改善っ (追加)

- **shared-feed の knownIds 比較コストを削減したよ〜** — Issue #397。配列比較に長さチェックを追加して `JSON.stringify` を早期スキップ、`new Set()` の重複除去も不要な中間処理を削除したよっ🚀
- **cron の R2 LIST 操作を 2 回 → 1 回に削減したよ〜** — Issue #402。`listAllFeedHashes` を廃止して `feedUserMap.keys()` を直接利用するようにしたよっ💡

### UX改善っ (追加)

- **FeedDetailModal の Push 通知トグル失敗時にトーストを表示するようにしたよ〜** — Issue #398。API エラーや `res.ok=false` 時にユーザーにフィードバックが届くようになったよっ✨

### パフォーマンス改善っ

- **フィード追加時の無駄な外部 HTTP 取得をなくしたよ〜** — Issue #409。上限チェック（FEED_LIMIT）を外部 HTTP 取得より前に先行実施するようにしたよっ✨ 上限超えてたらすぐ 422 を返すから、最大 15 秒かかる `discoverFeedUrl` を無駄に呼ばなくて済むよ〜🚀
- **AI 要約・翻訳のレートリミットを緩和したよ〜** — Issue #445。60 秒間 10 回 → 20 回に増やしたよっ💡 複数記事を連続して要約＋翻訳しても詰まりにくくなったよ〜✨

### セキュリティ対策っ

- **CSP の img-src から `data:` を除去したよ〜** — Issue #430。favicon.ts を `canvas.toBlob()` + `URL.createObjectURL()` で Blob URL 方式に変更して、`data:` が不要になったよっ🔒 img-src は `blob:` のみに絞ってよりセキュアにしたよ〜✨
- **JWKS キャッシュとオリジン検証の制限事項をコメントに明記したよ〜** — Issue #436 #429。アイソレート間でキャッシュが共有されない点、Referer ヘッダーが偽造可能な点を明示したよっ📝 どちらも LOW リスクでレートリミットが補完してるよ〜💡

### UX改善っ

- **モバイルで記事ビューが表示領域外まで拡縮する問題を修正したよ〜** — Issue #444。記事ビューコンテナに `overflow-x-hidden` を追加したよっ✨ 右スワイプのジェスチャー優先順位も「前の記事に戻る」が「記事一覧に戻る」より優先されるように直したよ〜📱

### リファクタリングっ

- **useReadStateSyncFlush の visibilitychange コード重複を解消したよ〜** — Issue #401。非表示時のフラッシュロジックを `flushToServer()` 再利用に変更して 25 行削除したよっ🔧 おまけで `hasPendingChanges` の更新漏れバグも直ったよ〜✨
- **useKeyboardNav の buildContext を 55 行 → 12 行に削減したよ〜** — Issue #424。手動フィールドマッピングを `...opts` スプレッド + 派生フィールド 3 つだけに置き換えたよっ💡 新フィールド追加時の修正箇所が 2 箇所 → 1 箇所になったよ〜✨
- **useArticleFilters の `useMemo([])` を `useCallback` に統一したよ〜** — Issue #414。「安定した関数参照」の意図を正しく `useCallback` で表現するようにしたよっ🔧 使われなくなった `makeCycler` ヘルパーも削除したよ〜💡
- **useFilteredArticles の activeIdsRef に設計コメントを追記したよ〜** — Issue #408。2段階フィルタリングと galleryAutoReadIds 最適化の意図を明文化したよっ📝
- **useArticleData のエラーハンドラー Ref を1本に統合したよ〜** — Issue #434。`onErrorRef`（useSyncedRef）と `onErrRef`（useRef クロージャ）の2段重ねを `logErrorRef`（useSyncedRef）1本に整理したよっ🔧 二重間接参照がなくなってコードが読みやすくなったよ〜✨
- **useFilteredArticles の noteIds 計算から JSON roundtrip を削除したよ〜** — Issue #411。`JSON.stringify` → `JSON.parse` の無駄な変換を除去して、`Object.keys(notes)` から直接 Set を作るようにしたよっ💡 2つの useMemo が1つになってすっきりしたよ〜✨
- **useReadStateSyncApply の deps 配列から Ref を除去したよ〜** — Issue #427。useRef の安定参照は依存配列に含める必要がないのに混入してたので取り除いたよっ🔧 useCallback の再生成が抑えられてパフォーマンスも微改善したよ〜💡
- **useApplyServerState の setState コールバックを純粋関数化したよ〜** — Issue #442 #441。localStorage 書き込みや ref 書き換えを setState コールバック外に移動して React Strict Mode の二重実行に対応したよっ🔧 `computeMergedSet` 純粋関数を導入して Set マージロジックもすっきりしたよ〜✨
- **globals.css のシンタックスハイライト色を CSS 変数化したよ〜** — Issue #426。ハードコードの 16 進数を `--color-hljs-*` 変数に変換して、ライト/ダーク切り替えを変数定義だけで完結させたよっ💡 重複したダークテーマセレクタも削除されてスリムになったよ〜✨

- **フィード追加中にモーダルを閉じられないようにしたよ〜** — Issue #396。`adding=true` のときキャンセルボタンと✕ボタン・バックドロップクリック・Escape キーを全部無効化して操作ミスを防いだよっ✨
- **フィード追加モーダルのフォームを閉じると自動リセットするようにしたよ〜** — Issue #410。「+」ボタンでモーダルを閉じたときにも URL・Cookie・CSS セレクタが確実にリセットされて、再度開いたとき前回の入力が残らないようにしたよっ💡
- **一括既読の確認ダイアログ（`window.confirm`）を廃止したよ〜** — Issue #407。元々 `markAllReadWithUndo` には取り消しトーストがあるから二重確認は不要だったよっ✨ すっきり即実行されるようになったよ〜💡
- **ToastContainer のエラー/info アイコンに type 別の色を付けたよ〜** — Issue #405 🎨
- **特殊ビュー（ブックマーク・後で読む・いいね・履歴）では未読フィルターを自動無効化したよ〜** — Issue #443。これらのビューはそもそも既読記事を表示する目的だから、未読フィルターを掛けても意味なかったよっ💡 `effectiveUnreadOnly` で特殊ビュー中は自動でオフになるよ〜✨

### バグ修正っ

- **`syncImmediately` が clean 状態でも POST を送ってたバグを修正したよ〜** — Issue #404。`isDirtyRef` が false かつ pending timer がない場合は早期リターンするようにしたよっ💡
- **ArticleView のタイトルエリアから不要な min-h を削除して空記事での余白をなくしたよ〜** — Issue #403 ✨

### セキュリティ対策っ

- **認証ログから Referer ヘッダーを削除したよ〜** — Issue #422。`/api/auth/login` と `/api/auth/callback` のデバッグログに `referer` を含めてたせいで機密 URL が漏れる可能性があったから、ログから除去したよっ🔒
- **APP_BASE_URL の HTTPS チェックを厳格化したよ〜** — Issue #438。`localhost` を例外扱いにしてた HTTP 許容ロジックを削除して、本番環境での HTTP 誤設定リスクをゼロにしたよっ🔒

## 2026-05-06

### 激アツ新機能っ

- **フィード別ダイジェスト件数をカスタマイズできるようになったよ〜** — Issue #384。ダイジェストモード（`D` キー）は全フィード一律 3 件に制限してたけど、フィードごとにコンテキストメニューから「1件」「3件」「5件」「10件」「全件」を選べるようになったよっ✨ `UserSubscription.digestLimit` に保存されて `PATCH /api/feeds/:id` で更新されるよ〜🎀 `digestLimit: 0` を設定すると全件表示（フィルタなし）になって、`undefined` のままならデフォルトの 3 件が使われるよっ💡 E2E テスト 6 ケース（`e2e/article-filter-digest.spec.ts`）も追加したよ〜🚀

- **Push 通知のフィード別フィルタリング設定を追加したよ〜** — Issue #373。フィード詳細モーダルにトグルスイッチを追加して、特定フィードの通知だけ個別に OFF にできるようになったよっ✨ `PushConfig.disabledFeeds` に feedHash → false のマップを保存して、cron の `sendPushBatched` で通知送信前にフィルタリングするよ〜🔔 `GET /api/push/config` と `PUT /api/push/config` の新エンドポイントで設定を取得・保存できるよ〜🎀

- **Push 通知のサイレント時間帯設定を追加したよ〜** — Issue #389。ユーザー設定モーダルに開始・終了時刻とタイムゾーン選択を追加したよっ🎀 `PushConfig.silentStart` / `silentEnd` / `timezone` を R2 に保存して、cron 実行時にサイレント時間帯内なら通知をスキップするよ〜🌙 日またぎのサイレント時間帯（例: 22:00〜7:00）にも対応してるよっ💡 E2E テスト 17 ケース（`e2e/push-config.spec.ts`）も追加したよ〜✨

### セキュリティ対策っ

- **DBSC RFC 8941 対応 + トークンリフレッシュフローへの組み込みだよ〜** — Issue #346 / #376。`getAuthSession` が DBSC バインディング済みセッションを検出したときに `Sec-Session-Challenge` ヘッダー付き 401 を返すようにしたよっ🔒 `api-fetch.ts` もこのヘッダーを検出してページリロードで再試行するようになったよ〜✨ 非 DBSC セッションの認証フローは一切変更なしで既存ユーザーへの影響ゼロだよっ💡 E2E テスト 14 ケース（`generateDbscChallenge` / `buildSecureSessionRegistrationHeader` / `importDbscPublicKey` / `verifyDbscResponse`）も追加したよ〜🎀

### テスト強化っ（追加）

- **テストカバレッジマップを作成して不足テストを追加したよ〜** — Issue #381。`architecture.md` に全 60 E2E テストファイルの対応表を追記したよっ📝 `stats-helpers.ts` に純粋関数を抽出して `e2e/stats.spec.ts`（10 ケース）と `e2e/recommendation.spec.ts`（13 ケース）を新規追加したよ〜✨ 未対応の重要機能（DBSC・ストリーク計算・推薦生成）も一覧化したよっ💡

### ドキュメント整備っ

- **API エンドポイント仕様書を追加したよ〜** — Issue #387。`.claude/rules/api-spec.md` に高優先度エンドポイント（`POST /api/feeds`・`GET/POST /api/read-state`・`POST /api/ai/summarize`・`POST /api/ai/translate`・`GET /api/articles`・`POST /api/feeds/import`）のリクエスト/レスポンス/エラーコードを詳細に記載したよっ📝 各 Route Handler にも JSDoc コメントを追加して IDE から仕様を確認できるようになったよ〜✨

### テスト強化っ

- **`isValidCookieHeader` を `validation.ts` に移動して E2E テストを追加したよ〜** — Issue #375。Cookie バリデーション関数を `app/api/feeds/route.ts` の内部関数から `src/lib/validation.ts` の export 関数に移動したよっ🔧 CRLF インジェクション・長さ制限・制御文字・フォーマット違反など 19 ケースの E2E テストを `e2e/feeds-validation.spec.ts` に追加したよ〜✨

### 激アツ新機能っ

- **AI モデルをユーザー設定で切り替えられるようになったよ〜** — Issue #378。要約・翻訳で使う Workers AI モデルをユーザー設定から選べるようにしたよっ✨ Llama 3.1 8B（速くてお気軽）・3.2 3B（超高速軽量）・3.1 70B（高精度）の 3 種類から選べるよ〜🎀 設定は localStorage に保存されてページリロード後も維持されるよっ💡

### パフォーマンス改善っ

- **magazine レイアウトに仮想スクロールを追加したよ〜** — Issue #374。compact/list/card/gallery と同様に `@tanstack/react-virtual` の `useVirtualizer` を使って、先頭フィーチャー記事以降のコンパクトリストを仮想化したよっ⚡ 大量記事でも DOM ノード数を一定に保てるようになったよ〜✨

### UX改善っ

- **Chrome AI 診断メッセージを改善したよ〜** — Issue #393。Chrome バージョンが古い（131 未満）場合に「アップデートしてください」と案内するようにしたよっ💡 フラグ有効化後に Chrome の**再起動が必要**なことも明示して、Chrome 138 以上ではフラグ不要な旨も表示されるようになったよ〜✨

### リファクタリングっ

- **App.tsx から3つの専用フックを分離したよ〜** — Issue #371。`useGlobalFilterAutoRead`・`useAutoLoadMoreArticles`・`useEngagementToggles` を `src/hooks/` に切り出して App.tsx を約100行スリム化したよっ🔧
- **`applyCooldown` ヘルパーを `server-auth.ts` に追加して Route Handler 10ファイルのクールダウン重複コードをまとめたよ〜** — Issue #372。`feeds`, `feeds/[id]/refresh`, `feeds/[id]/reinfer`, `feeds/import`, `feeds/refresh`, `recommendations`, `recommendations/refresh`, `push/subscribe`, `push/unsubscribe`, `clip` の各 Route Handler から `checkAndUpdateCooldown` の直接 import を削除して、`server-auth` 経由の `applyCooldown` に統一したよっ🔧 import 元が一本化されてスッキリ〜✨
- **名前バリデーションを parseName ヘルパーに共通化したよ〜** — Issue #370。`feed-groups` と `collections` の 4 つの Route Handler に散らばってた同一バリデーションロジック（文字列型チェック・制御文字除去・空文字チェック・最大長チェック）を `src/lib/validation.ts` の `parseName()` に集約したよっ🔧 重複コードがスッキリしてメンテしやすくなったよ〜✨

### パフォーマンス改善っ

- **ReadingTimeBadge の readingTime() を useMemo でキャッシュしたよ〜** — Issue #377。レンダリングのたびに HTML パースが走ってたの、useMemo で content/summary が変わった時だけ再計算するようにしたよっ⚡ メモリも時間も節約できてハッピー〜✨
- **記事アイテムのキーボードハンドラーを useCallback でメモ化したよ〜** — Issue #382。CompactItem・ListItem・CardItem・MagazineItem・GalleryItem の handleKeyDown を useCallback に置き換えたよっ🔧 memo コンポーネントの Props 比較が毎回 false になってた問題が解消されて、不要な再レンダリングがなくなったよ〜💡
- **スヌーズ判定で `new Date()` を毎回呼ぶのをやめたよ〜** — Issue #388。`buildSnoozePredicate` が記事フィルタリングのたびに `new Date().toISOString()` を呼んでたのを、`filterByStructure` で一度だけ計算して引数で渡すように修正したよっ💡 `for...in` 早期終了で空判定コストも削減したよ〜✨

### セキュリティ対策っ

- **`inflightRefresh` Map に 30秒 TTL とサイズ上限(100件)を追加したよ〜** — Issue #386。Workers が長時間稼働した時に古いエントリが滞留しちゃう可能性があったのを修正したよっ🔒 `cleanupInflight()` で30秒超のエントリを自動削除 & 100件超えたら全クリアするようにして、リフレッシュトークンのメモリ滞留リスクを削減したよ〜✨
- **/api/ogp と /api/engagement にレートリミットを追加したよ〜** — Issue #383。OGP 取得はキャッシュ MISS 時のみ 2 秒クールダウンで外部フェッチの連打を防止したよっ🔒 エンゲージメント記録 (POST) は 1 秒クールダウンで書き込み操作の連打を防止したよ〜✨ キャッシュ HIT 時はレートリミットなしで高速レスポンスは維持してるよっ🎀
- **`sanitizeStyleAttr` の `url()` 正規表現をクォート対応パターンに改善したよ〜** — Issue #390。`[^)]*` だとクォートされた URL 内に `)` が含まれる場合（例: `url('image\)file.png')`）に早期終了しちゃって CSS インジェクションバイパスのリスクがあったよっ💡 quoted/unquoted を分けて処理するパターン（`'[^']*'|"[^"]*"|[^)'"]*`）に変更して、CSS インジェクションバイパスリスクを低減したよ〜🔒
- **/api/articles に Cache-Control ヘッダーを追加したよ〜** — Issue #380。ユーザー固有データなので `private, max-age=30, stale-while-revalidate=60` に設定したよっ🎀 ブラウザキャッシュが効いてネットワークリクエストが減るよ〜✨

### バグ修正っ

- **フィード追加クールダウンが 3 秒になってたタイポを修正したよ〜** — Issue #369。`app/api/feeds/route.ts` の `30 * 100`（3 秒）が `30 * 1000`（30 秒）の typo だったよっ💡 意図通りの 30 秒クールダウンになったよ〜✨

### UX改善っ

- **ローディング・エラー状態をスクリーンリーダーに通知するようにしたよ〜** — Issue #385。`ArticleListEmptyState` のローディング `div` に `aria-live="polite"` と `aria-busy="true"` を、エラー `div` に `role="alert"` と `aria-live="assertive"` を追加したよっ♿ WCAG 4.1.3 準拠になったよ〜✨
- **OGP サムネイル取得のバッチ制限を撤廃して、フィード切り替え後に全記事のサムネイルが一括取得されるようにしたよ〜** — Issue #391。`useOgpCache` の `FETCH_BATCH_SIZE = 10` 制限を削除して visible 全件を並列フェッチするように変更したよっ📸 あわせて `linksKey` を全リンクの join 文字列から記事 ID の join に変更して、O(n) 文字列計算も軽くなったよ〜✨

## 2026-05-06

### バグ修正っ

- **記事を選択しても一覧から消えなくなったよ〜** — Issue #368。`unreadOnly` フィルターが ON の状態で既読記事を選択すると、しばらく一覧から消えちゃってた問題を修正したよっ💡 `filtered` useMemo の依存配列に `selectedArticleId` と `gracePeriodId` を追加して、記事選択時に即座に再計算されるようにしたよ〜✨ galleryAutoRead による頻繁な再計算は引き続き ref で回避してるから、パフォーマンスも安心だよっ🎀

## 2026-05-06

### バグ修正っ

- **記事詳細のスクロール位置を記事ごとに独立させたよ〜** — Issue #365。記事Aを途中まで読んでから記事Bに切り替えると、Aのスクロール位置のまま開いちゃってた問題を修正したよっ💡 `useArticleViewState` で記事IDが変わった瞬間に `scrollTop = 0` でリセットするようにしたよ〜✨ `useReadingProgress` のアンカー復元（100ms後）とタイミング競合しないから安心してね🎀
- **ギャラリービューの自動既読記事がフィルター前に消えちゃう問題を修正！** — Issue #363。`useFilteredArticles` の `activeIdsRef` 更新が `useEffect` 内だったため stale closure になってたよ〜😅 レンダー時に直接 `ref.current = activeIds` を代入（useSyncedRef パターン）に変更して修正したよっ✨
- **ギャラリービューで記事選択時にスクロール位置が勝手に変わる問題を修正！** — Issue #364。`magazine`/`gallery` レイアウトで `scrollIntoView` がすでに可視の要素に対しても呼ばれてたよ〜💡 表示領域外の場合のみ `scrollIntoView` するように変更したよっ🎀
- **ギャラリービューで画像展開後に「続きを読む」が発火しない問題を修正！** — Issue #367。`LoadMoreButton` の `IntersectionObserver` が画像遅延ロードによるコンテナ高さ変化を検知できてなかったよ〜🔧 `ResizeObserver` でコンテナリサイズを監視して IntersectionObserver を再評価するようにしたよっ✨
- **Summarizer API の検出ロジックを Chrome 公式の方法に修正！** — Issue #366。`typeof window.Summarizer !== "undefined"` から Chrome 公式推奨の `'Summarizer' in self` に変更したよ〜💡 `globalThis.Summarizer` に変更して Service Worker 環境でも正しく動くよっ✨

### セキュリティ対策っ

- **DBSC ヘッダーを RFC 8941 Structured Field Values 形式に修正したよ〜** — Issue #346 (部分対応)。`buildSecureSessionRegistrationHeader` が JSON 文字列を返してたのを W3C DBSC 仕様準拠の `(ES256);path="...";challenge="..."` 形式に変更したよっ🔒 TPM 鍵バインディング・セッション管理の設計判断が必要な部分は Issue に追記したよ〜📝

## 2026-05-06

### リファクタリングっ

- **FeedSidebar の Props Drilling を FeedSidebarContext で解消** — Issue #359。40 本以上あった `on***` コールバックを `FeedSidebarContext` に移して、`FeedSidebar` の Props は表示データだけにスッキリしたよ〜🔧 `src/contexts/FeedSidebarContext.tsx` に `FeedSidebarActions` 型 + `FeedSidebarProvider` + `useFeedSidebarContext()` をセットで追加したよっ✨ `App.tsx` では `<FeedSidebarProvider value={...}>` でラップするだけで OK！子コンポーネントが深くなっても Context から直接取れるようになったよ〜🎀

## 2026-05-06

### UX改善っ

- **AI パネルのエラー表示・リトライ UI を充実させたよ〜** — Issue #358。要約・翻訳でエラーが出たとき、1行テキストだけだったのを改善したよっ✨ ネットワークエラー・レートリミット・モデルエラーの 3 種類をちゃんと判別して、それぞれ適切なメッセージを表示するようになったよ〜💡 レートリミット（429）のときは「しばらく待ってから再試行してください」って追加案内も出るよっ！あとリトライボタンも追加したから、エラーになっても諦めずに再試行できちゃう🚀 要約（`ArticleAiPanel`）も翻訳（`ArticleContentBody`）も両方対応したよ〜🎀

### 激アツ新機能っ

- **モバイルペイン切り替えにスライドアニメーション追加** — Issue #362。サイドバー → 記事一覧 → 記事詳細のペイン切り替えがヌルっとスライドアニメーションするようになったよ〜✨ `cubic-bezier(0.4, 0, 0.2, 1)` でなめらか 250ms！戻る方向と進む方向で左右逆にスライドするから直感的でおしゃれ〜🎀 `prefers-reduced-motion` 対応済みでアクセシビリティもバッチリ！デスクトップ（lg以上）には影響なしだよっ💡

### パフォーマンス改善っ

- **`/api/articles` の N+1 R2 リクエストを解消** — Issue #355。`since` パラメータ処理で全フィード分 `readFeedMeta()` を個別に呼んでた N+1 問題を修正したよ〜🚀 `getFeedsMeta()` バッチヘルパーを `shared-feed.ts` に追加して、並行度 10 制限付きで一括取得するようにしたよっ！フィード数が多いユーザーほどレイテンシ改善が実感できるよ✨

### ドキュメント整備っ

- **キーボードショートカット仕様を Single Source of Truth に集約** — Issue #360。`src/config/shortcuts.ts` に `ShortcutGroup` 型と `group` フィールドを追加して、全ショートカットをカテゴリ分類したよ〜📋 `KEYBOARD_SHORTCUTS` 定数をエクスポートしたから、`useKeyboardNav`（実装）と `KeyboardShortcutsModal`（UI表示）の乖離が起きにくくなったよっ✨ 新しいショートカット追加したら `SHORTCUT_DEFS` を 1 箇所更新するだけで OK だよ〜🎀

### セキュリティ対策っ

- **pnpm-lock.yaml の glob deprecated 警告を解消** — Issue #361。`@node-minify/core` が transitive 依存として持ってた古い `glob v9`（deprecated）を `pnpm.overrides` で `>=10` に上書きして、`glob 12.0.0` に統一したよ〜🔒 lockfile もアップデート済みだよっ✨

### リファクタリングっ

- **useFeeds.ts の責務分割** — Issue #356。437 行に肥大化してた `useFeeds.ts` を 3 ファイルに分割したよ〜🔧 `useFeedData`（フィード一覧 fetch・初回ロード）と `useArticleData`（記事取得・5分ポーリング・マージ・ページネーション）に責務を分けて、`useFeeds` は薄いオーケストレーターとして後方互換を維持したよっ✨ `App.tsx` 側の変更ゼロで既存インターフェースそのままだよ！

- **useArticleFilters の boolean フィルタートグルをジェネリック化** — Issue #357。6 つの個別 `useState` を `boolFilters` 1 つにまとめて、`BOOL_FILTER_STORAGE` マップと `toggle()` ファクトリで生成するようにしたよ〜🔧 外部 API は変わらないし型安全もバッチリ！新しいフィルターを追加するときはマップに 1 行追加するだけで済むようになったよっ✨

## 2026-05-06

### リファクタリングっ

- **AppModals コンポーネント抽出** — Issue #345。`App.tsx` から 5 つのモーダル（SessionExpiredModal / SnoozeModal / KeyboardShortcutsModal / UserSettingsModal / FeedQuickSwitchModal）を `AppModals.tsx` に分離したよ〜🔧 App.tsx がスッキリしてメンテしやすくなったよっ✨ スヌーズのロジックは `handleSnooze` として `useCallback` 化して App 側にスッキリ切り出したよ〜💡

## 2026-05-06

### 激アツ新機能っ

- **フィードヘルス監視モーダル** — Issue #352。サイドバーフッターのヘルスアイコンボタンから開けるモーダルを追加したよ〜✨ エラー・レートリミット中・オーバーサイズのフィードを一覧で確認できるよっ！連続エラー回数や最終エラー時刻・レートリミット解除予定もバッチリ表示されるから、壊れたフィードにすぐ気づけるね🎀
- **OPML インポート / エクスポート UI** — Issue #353。ユーザー設定モーダルにインポート・エクスポートボタンを追加したよ〜📥 他の RSS リーダーから移行するときも、逆に移行するときもボタン一発でできちゃう！インポート結果は「N件追加、M件スキップ」ってトーストで教えてくれるよっ✨

### UX改善っ

- **フィード切り替え時のスクロール位置保存** — Issue #350。フィードを切り替えてまた戻ってきたとき、スクロール位置がリセットされてたのを修正したよ〜💡 フィードごとに位置を記憶しておくから、読んでた場所に戻れるようになったよっ✨

### リファクタリングっ

- **大型コンポーネントの整理** — Issue #347。`FeedSidebar`（823→708行）・`FeedItemComponent`（776→638行）・`ArticleList`（760→646行）を分割したよ〜🔧 `TagsSection` / `CollectionsSection` / `FeedSearchBar` / `FeedTitleContent` / `ArticleListEmptyState` の 5 コンポーネントを新規抽出して、それぞれ独立ファイルにまとめたよっ✨

## 2026-05-08

### セキュリティ対策っ

- **クライアントサイドの `console.error` を本番環境で抑制** — Issue #349。`'use client'` フック（`useCollections` / `useFeedGroups` / `useFeeds` / `usePushNotifications`）の catch 節にある `console.error` を `process.env.NODE_ENV !== "production"` ガードで囲んだよ〜🔒 開発環境ではそのまま出るけど本番ブラウザのコンソールにエラー詳細が漏れなくなったよ！ユーザーへのフィードバックは既存の `onError` コールバックで継続してるから UX は変わらないよ〜✨ `ErrorBoundary` の `componentDidCatch` は React エラー境界の標準ログとして残してるよっ🎀

### リファクタリングっ

- **`useFeedDragDrop` フック抽出** — `FeedSidebar` に inline で書かれてた D&D 関連の state・ハンドラーを `src/hooks/useFeedDragDrop.ts` に分離したよ〜🔧 `draggedFeedId` / `dragOverGroupId` / `dragOverUngrouped` の 3 state と `handleDropFeedOnView` / `handleDropFeedOnGroup` / `draggedFeedInGroup` をまとめてフックにしたから、コンポーネントがすっきりしてテストもしやすくなったよっ✨

## 2026-05-07

### 激アツ新機能っ

- **サイドバーインライン検索バー** — Issue #328。フィード50件以上のヘビーユーザー待望の機能だよ〜✨ サイドバーのフィードリスト上部に常時表示の検索バーを追加したよ！フィード名・URL でリアルタイムフィルタリングができちゃって、Escape キーでクリア、入力中は ✕ ボタンでサッとリセットできるよ〜🔍 フィードが 0 件のときは検索バーを非表示にするスマート設計で、ヘッダーの検索トグルボタンも削除してシンプルにしたよっ🎀

### パフォーマンス改善っ

- **Cron `buildFeedUserMap` に KV キャッシュ追加** — Issue #320 item4。毎回全ユーザーの `subscriptions.json` を R2 から読んでたのを、`RATE_LIMIT` KV に `feedUserMap:v1` キーで 60 分キャッシュするようにしたよ〜⚡ ユーザー数が増えても R2 LIST + N 回 GET が激減してコスト爆下がり✨ フィード追加・削除時はキャッシュを即時無効化してるから整合性もばっちり🔒

## 2026-05-06

### パフォーマンス改善っ

- **ポーリング差分取得で爆速化** — Issue #317。5分ごとのポーリングで全フィードの記事をまるごと返してたのを、`?since={timestamp}` で差分のみ取得するように変えたよ〜⚡ フィードの `lastFetchedAt` と比較して変化のあるフィードだけ R2 から読むから R2 GET 回数もガクッと減って、返す JSON も新着分だけでネットワーク帯域もパースコストもスリムになっちゃう✨ クライアント側は `lastPollTimeRef` で最後のポーリング時刻を管理して、初回フェッチは全件・2回目以降は差分をマージするよ〜🚀

### バグ修正っ

- **iOS Safari スワイプバック衝突を修正** — Issue #325。モバイルで記事を見てるとき（`view` ペイン）に右スワイプするとペイン遷移（`view → list`）とジェスチャーナビ（前の記事へ）が同時に発火しちゃってたのを修正したよ〜💡 `useGestureNav` に `currentMobilePane` と `onGoBack` オプションを追加して、`view` ペインでの右スワイプはペイン遷移を最優先にしちゃった✨ `App.tsx` → `ArticleView` → `useArticleViewState` → `useGestureNav` の経路でちゃんと `mobilePane` が渡るようになったよ〜🎀

### リファクタリングっ

- **`ArticleListHeader` をサブコンポーネントに分割** — Issue #333。733 行の巨大コンポーネントを `article-list-header/` ディレクトリに分割したよ〜🔧 `LayoutSwitcher`・`FilterPills`・`FilterPillButton`・`CategoryFilter`・`SortButton`・`MarkAllReadButton`・`SearchBar` に切り出して、メインの `ArticleListHeader.tsx` は 3 行の再エクスポートになってスッキリ✨

### バグ修正っ

- **ギャラリービューで記事が入れ替わる問題を修正** — Issue #344。ダイジェストモード中にギャラリーでスクロールして自動既読が発生すると記事リストがバタバタ入れ替わっちゃってた問題を修正したよ〜💡 `activeIds` の変化で `filtered` が不要に再計算されてたのを `activeIdsRef` を使うことで抑制しちゃった✨

### リファクタリングっ

- **`useModalState` フック新設** — Issue #333。`snoozeTargetId` と `articleAnnouncement` を `useFeedSelection` から切り出して専用フックに分離したよ〜🔧 モーダル制御の責務が明確になってスッキリ✨
- **`useFeedSelection` をフィード選択専用に絞り込み** — Issue #333。URL パラメータ連動のフィード・グループ・タグ・記事・コレクション選択に責務を集中させたよ〜🔧
- **`useFeedFilters` フックを新規作成** — Issue #333。`App.tsx` に inline で書いてた `nsfwFeedIds` / `groupFeedIds` / `mutedFeedIds` の useMemo 3 本を `src/hooks/useFeedFilters.ts` に切り出したよ〜🔧 機能変更なしの純粋リファクタリングで `App.tsx` がスリムになっちゃった✨

### パフォーマンス改善っ

- **OGP 保存デバウンス短縮** — Issue #320。localStorage への OGP キャッシュ書き込みデバウンスを 2000ms→500ms に短縮したよ〜⚡

## 2026-05-04

### UX改善っ

- **全既読の確認ダイアログ** — Issue #325。50件以上の未読があるときに全既読ボタンを押すと「本当にいい？」って聞いてくれるようになったよ〜💡 うっかり既読事故を防止しちゃう✨
- **新着バナーのタッチターゲット拡大** — Issue #325。新着記事バナー全体がクリック可能になったよ〜📱 タップするとバナーが閉じてリストの先頭にスムーズスクロールしちゃう✨
- **ErrorBoundary の再試行改善** — Issue #325。エラーが2回続いたら「ページを再読み込み」ボタンに自動切替するようにしたよ〜💡 無限クラッシュループを防止しちゃう✨

### セキュリティ対策っ

- **認証コールバックのリダイレクト先検証** — Issue #338。`APP_BASE_URL` が有効な HTTPS URL かチェックするようにしたよ〜🔒 オープンリダイレクト攻撃を防いじゃう✨
- **GalleryContextMenu 正規表現修正** — CodeQL #22。Unicode範囲が重複してた問題を修正！ひらがな・カタカナ・漢字の範囲を正しく分離したよ〜🔒
- **rate-limit JSON.parse 堅牢化** — KVデータが壊れてたときに例外が出ないよう try-catch 追加〜💡
- **認証デバッグログ除去** — 本番環境に不要な `console.log` を除去したよ〜🧹
- **入力バリデーション・型安全性の改善** — Issue #340。`linkedom` の `parseHTML` 戻り値と AI セレクタ JSON のランタイム検証を `isParsedHtmlResult` で追加！想定外形状の値で property access するのを防いじゃう🔒 さらに `fetch-article-content.ts` に `clampContentBytes` を追加して、ページネーション結合後とキャッシュ復元後の出力を 5MB に強制クランプ✨

### パフォーマンス改善っ

- **mergeUniqueArticles の1パス最適化** — Issue #341。記事マージの重複排除を2パス→1パスに統合！中間配列の生成を排除してGCプレッシャーを軽減しちゃった〜🚀
- **ArticleActions の memo 化** — Issue #335。記事一覧のアクションボタンを `memo()` で包装して無駄な再描画を防止〜🚀
- **ポーリング effect の安定化** — Issue #335。`pollNow` を ref 経由にしてタイマー再生成を防止〜⚡
- **noteIds メモ化の最適化** — Issue #335。ノートのキー変更時のみ Set を再生成するようにしたよ〜🧠
- **OGP キャッシュの差分フェッチ** — Issue #320。スクロールのたびに同じリンクの OGP を何度もフェッチしちゃってた問題を修正！処理済みリンクを記録して新しいのだけ取りに行くようにしたよ〜🚀✨

### UX改善っ

- **フィードメニューのタッチターゲット拡大** — Issue #336。モバイルでフィードの⋮ボタンが小さかった問題を修正！44px のタッチターゲットを確保したよ〜📱
- **フィード削除時の確認ダイアログ** — Issue #336。うっかり削除を防止する確認ダイアログを追加しちゃった〜💡
- **タッチデバイスでの記事アクション表示改善** — Issue #336。ホバーイベントのないタッチデバイスで未読ドット・ノートアイコンが消えちゃう問題を修正！📱
- **キーボードナビのフォーカス表示** — Issue #336。記事アクションボタンに `focus-visible:ring` スタイルを追加してキーボード操作がわかりやすくなったよ〜⌨️✨

### リファクタリングっ

- **エラーフォーマットの統一** — Issue #342。`e instanceof Error ? e.message : String(e)` パターンが7箇所に散らばってたから `formatError()` ヘルパーにまとめたよ〜🧹 `src/lib/api-error.ts` に共通化して可読性アップ✨
- **cascadeOverflow の関数分割** — Issue #342。69行あった `cascadeOverflow` を `flushPageAndPrefetchNext`（PUT+GET 並列）と `appendOverflowToFinalPage`（末尾追記）に分割！責務が明確になって読みやすくなったよ〜🔧
- **feed-sidebar フィルタリングロジックの分離** — Issue #333。サイドバーのタグ集計・未読カウント・フィードグループ化・カテゴリ分類を `useSidebarFeeds` フックに抽出したよ〜🧹 feed-sidebar が 895行→810行にダイエット成功っ✨
- **Blob ダウンロードパターンの重複排除** — Issue #337。3箇所に散らばってたダウンロード処理を `downloadBlob()` ヘルパーにまとめたよ〜🔧
- **URL プロトコル検証の共通化** — Issue #337。`url.ts` に散らばってた HTTP/HTTPS チェックを `isValidHttpProtocol()` に統合しちゃった〜🧹
- **画像最小サイズ定数の��有化** — Issue #337。`IMAGE_MIN_DIMENSION` として共有定数にまとめたよ〜📐

### UX改善っ

- **レイアウト別スケルトンスクリーン** — Issue #331。記事一覧のスケルトンがcompact・list・card・magazine・galleryの5レイアウトそれぞれに最適化されちゃった〜✨ 選んでるレイアウトに合ったプレースホルダーが出るからCLSもなくて超スムーズだよっ📱💡

### パフォーマンス改善っ

- **モーダルの遅延ロード** — Issue #332。10個以上のモーダルコンポーネントを `next/dynamic` で遅延ロードするようにしたよ〜✨ 開くまで読み込まないから初期バンドルサイズがグッと軽くなっちゃった〜🚀
- **useMemo 依存配列の最適化** — `useFilteredArticles` の構造フィルターで `activeIds`（ギャラリー自動既読ID）の変動による不要な再計算を ref で回避するようにしたよ〜🚀 ギャラリースクロール時のパフォーマンスが改善されちゃう✨

### バグ修正っ

- **モバイルのアクションボタン表示** — タッチデバイスで既読・ブックマークボタンが `hover` 限定で隠れちゃってた問題を修正！`@media(hover:hover)` でホバー対応デバイスだけ隠す＆タッチデバイスは常に表示するようにしたよ〜📱✨

### リファクタリングっ

- **visibilitychange イベント統合** — `useReadStateSyncFlush` で2つに分かれてた visibilitychange リスナーを1つにまとめたよ〜🔧 同じイベントに2回登録してたのをスッキリ整理しちゃった！
- **並行制限ユーティリティ統一** — Issue #332。`src/cron/fetch.ts` の `allSettledWithConcurrency` と `src/lib/shared-feed.ts` の `pMap` がほぼ同じコードだったから、`src/lib/concurrency.ts` に `pMap`（Promise.all セマンティクス）と `pMapSettled`（Promise.allSettled セマンティクス）として統一したよ〜🔧✨

## 2026-05-03

### 激アツ新機能っ

- **Chrome Summarizer API 対応** — Issue #265 Phase 1。Chrome 138+ のブラウザ組み込み要約AIに対応しちゃった〜✨ 対応ブラウザならWorkers AIを使わずにブラウザ内で記事を要約するから超高速＆コストゼロだよっ！非対応ブラウザは今まで通りWorkers AIにフォールバックするから安心してね〜🧠 設定画面で翻訳・要約それぞれのプロバイダ状態が確認できるようになったよっ💡
- **全既読の Undo 機能** — Issue #301。「全て既読にする」操作（`m` キー）に5秒間の「元に戻す」トーストが付いたよ〜✨ 誤操作しちゃっても大丈夫！5秒以内に「元に戻す」を押せば既読状態が完全に復元されちゃう〜🔄 プログレスバーで残り時間もわかるからあわてなくてOKだよっ💡

### UX改善っ

- **スケルトンスクリーン** — Issue #323。初回ロード時にサイドバーと記事一覧がスケルトン表示になるようにしたよ〜✨ 今まで小さいパルスドットだけ表示されてCLSが発生しちゃってたけど、フィード一覧や記事リストの形をしたプレースホルダーが出るから画面がガタガタしなくなったよっ📱💡
- **セッション期限切れモーダル** — Issue #323。セッションが切れたとき突然ランディングページに飛ばされちゃってた問題を修正！モーダルオーバーレイで再ログインを促すから、読んでた記事やノートの内容がそのまま保持されるよ〜🔒✨
- **フィードグループ並べ替えの安定化** — Issue #325。グループの順序変更で2つの PATCH リクエストを送ってたせいで片方だけ失敗しちゃう問題を修正！専用の並べ替え API（`POST /api/feed-groups/reorder`）を追加して、1回のリクエストで全グループの順序をアトミックに更新するようにしたよ〜🔄✨
- **表示領域に空きがあるとき即座に次ページ読み込み** — Issue #313。ギャラリービューとかで記事が少なくて画面が埋まってないとき、最後までスクロールしなくても自動で次のページを読み込んじゃうようにしたよ〜✨ 大画面ユーザーさんも快適に使えるようになったよっ📱🚀
- **トースト通知をリニューアル** — Issue #305。画面下の一行トーストを右下スタック型に進化させちゃった〜✨ 成功（エメラルド）・エラー（ローズ）・お知らせの3種類にカラー分けして、最大3つまでスタック表示するよっ！エラーは8秒、それ以外は5秒で自動消去だから邪魔にならないの〜💡 ×ボタンで即消しもできちゃう！推薦セクションのフィード追加失敗も静かに握りつぶさず通知するようにしたよっ🎀

### リファクタリングっ

- **html-post-processor.ts を関心事ごとに分割** — Issue #307。747行あった巨大ファイルを `html-noise-removal.ts`（ノイズ除去）・`html-image-processors.ts`（画像処理）・`html-embed-transforms.ts`（埋め込み変換）の3ファイルに分割したよ〜🔧 パイプライン本体だけ元ファイルに残して、既存の import パスは re-export で壊さないようにしてあるよっ✨

### UX改善っ

- **記事アイテムのキーボードアクセシビリティ** — Issue #331。全5レイアウト（Compact/List/Card/Magazine/Gallery）で Enter キーと Space キーで記事が開けるようになったよ〜✨ スクリーンリーダー向けにエラーメッセージに `role="alert"` も追加したし、画像読み込み失敗時の表示もSVGプレースホルダーに改善しちゃった！♿💡

### セキュリティ対策っ

- **画像プロキシにレートリミット追加** — Issue #303。`/api/image-proxy` にスライディングウィンドウ方式のレートリミットを入れたよ〜🔒 60秒あたり120回までに制限して、悪用や過剰アクセスからサーバーを守っちゃう！キャッシュHIT時はカウントしないから普通に使ってる分には全然気にならないよっ✨
- **marked CVE-2026-41680 対応** — Issue #330。marked パッケージを 18.0.3 にアップデートして脆弱性を塞いだよ〜🔒
- **Push 通知エンドポイントにレートリミット追加** — Issue #330。subscribe/unsubscribe に5秒クールダウンを入れて連打攻撃を防止したよっ🛡️
- **ログからのスタックトレース漏洩防止** — Issue #330。6箇所の Route Handler で `console.error` に Error オブジェクトを丸ごと渡してたのをメッセージだけに絞ったよ〜🔐

## 2026-05-02

### 激アツ新機能っ

- **ギャラリー画像手動展開ボタン** — Issue #288。ギャラリービューで画像が展開されてない記事に「画像を展開」ボタンが出るようになったよ〜✨ サムネだけの記事にはホバーで展開ボタンが出るし、画像なしの記事にも展開ボタンがあるから手動で画像を引っ張ってこれちゃう！フェッチ中はスピナーがくるくる回るよっ🖼️🔄

### UX改善っ

- **フォーカスモードが全画面オーバーレイに進化** — Issue #290。フォーカスモード（`\`キー）が3ペインの上に被さる全画面オーバーレイ表示になったよ〜✨ 下からスライドインするアニメーションで登場して、×ボタンかEscキーで閉じれちゃう！記事に集中したいときの没入感がめっちゃアップしたよっ📖🎀
- **画像カテゴリ選択時のフォーカスモード強制移行を廃止** — Issue #289。画像・動画カテゴリに切り替えたときに勝手にフォーカスモードにならなくなったよ〜！自分のタイミングでフォーカスモード使いたいときだけ使えるようになっちゃった✨🎀
- **取得失敗時にOGP/サムネイル画像を表示** — Issue #291。記事の本文取得に失敗しても、OGP画像やサムネイルがあればそれを表示するようになったよ〜！右下に小さい「再取得」ボタンも出るから、気になったらリトライしてね💡📸

### バグ修正っ

- **X/Twitter の OGP 取得修正** — Issue #292。X（旧Twitter）のリンクでOGP画像が取得できなかったのを修正！vxtwitter.comプロキシにボットUser-Agentを使うようにしたよ〜🐦🔧

- **ドラッグ&ドロップでフィードの表示カテゴリ変更** — Issue #275。サイドバーのフィードを掴んで上のビュータブ（記事・画像・動画・SNS）にドロップするだけで、そのフィードの表示カテゴリが切り替わっちゃう〜✨ ドラッグ中はタブがハイライトされるから、どこにドロップするかわかりやすいよっ🎀🖱️
- **クロスフィード重複検出** — Issue #262。Zenn トレンドとかはてブとか、同じ記事が複数フィードに載ってても自動で 1 件にまとめちゃうよ〜✨ 重複してる記事には「+2 フィード」みたいなバッジが表示されて、ホバーしたらどのフィードに載ってるかわかっちゃう！設定から ON/OFF 切り替えもできるよっ🎀🔗
- **ギャラリー画像サイズ指定＆フィルター** — Issue #270。ギャラリービューのカードサイズをS/M/L/XLの4段階で選べるようになったよ〜✨ さらに最小画像サイズフィルターで、アイコンやバッジみたいな小さい画像を自動で非表示にできちゃう！ユーザー設定モーダルの「カードサイズ」と「最小画像サイズ」から変更してね🖼️🎀
- **最小画像サイズをスライダーで自由設定** — Issue #274。最小画像サイズフィルターが4段階ボタンからスライダーに進化〜✨ 0〜500pxまで10px刻みで細かく設定できるようになったよっ！今までの「なし/50px/100px/200px」だけじゃ物足りなかったコも、これでバッチリ好みのサイズに調整できちゃう🎚️🎀

### UX改善っ

- **ギャラリーフォーカスモードから記事詳細へ自動切替** — Issue #272。記事一覧フォーカスモード（`Shift+\`）でギャラリーの画像をクリックしたら、自動的に記事詳細フォーカスモードに切り替わるようになったよ〜✨ ギャラリーを全画面で眺めて、気になった記事をクリックしたらそのまま全画面で読めちゃう📖🎀 Esc で通常表示に戻れるよっ！

### アクセシビリティ改善っ

- **skip-to-content リンク＆aria-live 対応** — Issue #302。Tabキーを押すと「記事一覧へスキップ」リンクが表示されて、サイドバーを飛ばして記事一覧に直行できるようになったよ〜♿✨ さらにj/kキーで記事を切り替えたとき、スクリーンリーダーが記事タイトルを読み上げてくれるようになっちゃった！🎀
- **フィード削除に確認ダイアログ追加** — Issue #297。フィードの削除ボタンを押したとき、確認ダイアログが出るようになったよ〜！うっかり誤クリックでお気に入りフィードが消えちゃう事故をガードしちゃう🛡️✨

### セキュリティ対策っ

- **OPMLインポートにレートリミット追加** — Issue #294。OPMLインポートに60秒のクールダウンを入れたよ〜！重いXMLパース処理の連打を防いでサーバーを守っちゃう🔒✨

## 2026-05-01

### 激アツ新機能っ

- **ギャラリービュー リロードボタン** — Issue #271。pictures/videos カテゴリのギャラリーで、コンテンツ取得に失敗（403とか）しちゃった記事に「再取得」ボタンが出るようになったよ〜✨ ボタン押すだけで個別にリトライしてくれるから、一時的なエラーでも諦めなくて大丈夫っ🔄💡

### リファクタリングっ

- **ArticleView.tsx コンポーネント分割** — Issue #255。1315行あった巨大な `ArticleView.tsx` を `ArticleHeader`・`ArticleContentBody`・`ArticleAiPanel`・`ArticleNotePanel`・`ImageDownloadModal` の5つのサブコンポーネントに分割したよ〜！親コンポーネントは536行まで59%もスリムになっちゃった✨ コンテンツ系フック（シンタックスハイライト・数式レンダリング・リンクプレビューとか）は `ArticleContentBody` に移動して関心の分離もバッチリ🎀 Context の直接参照で prop drilling も減らしたよっ🔧

### ドキュメント整備っ

- **architecture.md R2 データ構造セクション同期** — Issue #260。`SharedFeedMeta` に `consecutiveErrors` / `lastErrorAt` / `rateLimitedUntil` / `articleCount` / `pageCount` / `knownIds` / `failedSelectors` / `oversizeAlert` を追記したよ〜！`UserSubscription` も `feedHash` / `customTitle` / `nsfw` / `priority` / `category` / `groupId` / `mutedUntil` とか全プロパティ網羅しちゃった📝✨ `UserProfile` / `RecommendationCache` / `PushConfig` / `EngagementLog` も最新の型定義に合わせて更新！もう「等」で誤魔化さないよっ🎀

### パフォーマンス改善っ

- **cascadeOverflow の R2 並列アクセス最適化** — Issue #254。フィード記事のページ分割処理で R2 の PUT(N) と GET(N+1) を `Promise.all` で並列実行するようにしたよ〜！N ページ分の処理で逐次 2N 回だった R2 操作が N+1 回に減って、cron ジョブや手動更新がサクサクになっちゃう⚡🚀

### UX改善っ

- **ローディング・空状態の表示改善** — Issue #258。サイドバーのフィード一覧が読み込み中のときスケルトンローダーが表示されるようになったよ〜✨ 記事一覧のローディング状態にもスピナーを追加！フィード未登録時は RSS アイコン付きの案内メッセージ、検索結果が 0 件のときは虫眼鏡アイコン付きの「見つかりませんでした」メッセージが出るようになったっ🔍💡 モバイルで記事未選択のときは「一覧に戻る」ボタンも付いて迷子にならないよ〜📱🎀

### 激アツ新機能っ

- **SlideShare スライド埋め込み対応** — Issue #263。記事本文中の SlideShare リンクが自動で iframe 埋め込みに変換されるようになったよ〜！`slideshare.net/slideshow/{slug}/{id}` 形式の URL を検出して、レスポンシブな 16:9 の埋め込みプレイヤーで表示しちゃう📊✨ フォールバックリンクも付くから安心だよっ🎀 ※ SpeakerDeck の `<script>` 埋め込みは既存の `transformSpeakerDeckScriptEmbeds` で対応済み！リンク URL からは player ID が取れないのでリンク→iframe 変換は対象外だよ〜🎤

## 2026-04-29

### パフォーマンス改善っ

- **ReleaseNotesModal のコードスプリット＆リリースノート単一ソース化** — Issue #259。`ReleaseNotesModal` を `React.lazy` で動的 import にしてクライアントバンドルからコードスプリットしたよ〜！モーダルを開かない限りコンポーネントコードを読み込まないから初回ロードが軽くなっちゃう✨ さらに `release-notes-data.ts` を `scripts/sync-release-notes.mjs` による自動生成に切り替えて、`RELEASE_NOTES.md` の単一ソース管理に統一。二重更新の手間がなくなったっ🚀📝

### UX改善っ

- **楽観的更新失敗時のトースト通知追加** — Issue #246。コレクションへの記事追加/削除やフィードグループの折りたたみ・ミュート・並び替えがサーバー同期に失敗したとき、今までは静かにロールバックしてたけど、ちゃんとトーストで「失敗したよ〜」って教えてくれるようになったっ💬✨

### 激アツ新機能っ

- **OPML エクスポート/インポートにフィードグループ対応** — Issue #248。OPMLエクスポートでフィードグループがフォルダ構造として出力されるようになったよ〜！インポート時もフォルダを自動でグループに変換するから、Feedly や Inoreader からの乗り換えでフォルダ構造がそのまま引き継げちゃう📂✨

- **SpeakerDeck スライド埋め込み対応** — Issue #252。ブログ記事に貼られた SpeakerDeck のスライドが自動で埋め込み表示されるようになったよ〜！`<script>` タグの embed コードも `<iframe>` に変換してレスポンシブ表示するから、RSSリーダー内でスライドがそのまま読めちゃう📊✨

### セキュリティ対策っ

- **JWT aud フォールバック廃止** — Issue #250。JWT の `aud` クレーム検証で `authBaseUrl` との一致で合格させてた deprecated フォールバックを削除！`CLIENT_ID` との厳密一致のみ許可するようにして、クロスサービストークン流用リスクをカットしたよ〜🔒

### テスト追加っ

- **認証・フィルターモジュールのテスト拡充** — Issue #250。`auth.ts`（JWT 検証・Cloudflare ブロック検出）と `keyword-filter.ts`（ReDoS 対策・キーワードマッチング）のテストを一気に追加！カバレッジがグッと上がったよ〜🧪✨

## 2026-04-28

### セキュリティ対策っ

- **clip キャッシュポイズニング修正** — Issue #241。`/api/clip` で保存したコンテンツキャッシュが全ユーザー共有になっちゃってて、他の人の記事キャッシュを上書きできちゃう問題を修正！キャッシュをユーザーごとに分離して、レートリミットも追加したよ〜🔒✨

### アクセシビリティ改善っ

- **モーダルのアクセシビリティ強化** — Issue #229。全モーダルに `role="dialog"` と `aria-modal` を追加して、フォーカストラップも実装したよ〜！Tabキーでモーダル内をぐるぐる循環するから、キーボード操作派も安心っ✨♿

- **ARIA ラベル一斉追加** — Issue #229。記事ツールバーのボタン（AI要約・翻訳・読み上げ・ブックマーク・いいね・共有・スヌーズ等）にぜ〜んぶ `aria-label` つけたよ〜！スクリーンリーダーでも何のボタンかバッチリわかるようになったっ🎀✨

- **セマンティック HTML ランドマーク** — Issue #229。記事一覧ペインに `aria-label="記事一覧"` を追加して、ページ構造がスクリーンリーダーにちゃんと伝わるようになったよ〜！💡

### 激アツ新機能っ

- **ギャラリービュー: モバイル横スワイプナビ** — Issue #240。スマホのギャラリービューで左右にスワイプすると前後のカードにスーッとスクロールするようになったよ〜！縦スナップだとスクロールと誤操作しちゃってたけど、横スワイプなら快適にカード間移動できちゃう📱✨

- **ギャラリー「一覧から削除」メニュー** — Issue #239。ギャラリービューで右クリック/長押しメニューに「一覧から削除」が追加されたよ〜！未読記事をサクッと既読にして、未読フィルターONなら即消えるから快適✨📱🎀

- **オフライン状態インジケーター強化** — Issue #230。オフライン時のUXがめっちゃ良くなったよ〜！フィード追加・更新ボタンがオフライン中はグレーアウトされて誤操作防止、バナーに「同期待ち」表示で未送信の既読変更があるのがひと目でわかるようになったっ。オンラインに戻ったら自動で同期するから安心だよ〜📡✨

### お掃除っ

- **Dead code 一掃** — Issue #247。使われてなかった `FontSizeExtended` 系の関数6個、`useMenuOpen` フック丸ごと、`dbsc.ts` の未使用インターフェース＆関数を削除したよ〜！約170行スッキリしてバンドルも軽くなっちゃう🧹✨

## 2026-04-25

### 激アツ新機能っ

- **ユーザーごとの記事保持期間（TTL）設定** — Issue #205。記事の保持期間をユーザー設定モーダルから自由に変更できるようになったよ〜！7日・14日・30日（デフォルト）・60日・90日・無制限から選べちゃう✨ サーバー側でちゃんとフィルタリングするから安心だよっ🔧🎀

- **フィード健全性ダッシュボード** — Issue #202。フィードのエラー状態がひと目でわかるようになったよ〜！サイドバーにエラー警告⚠️・レートリミット⏰・容量超過アイコンが表示されるようになって、フィード詳細モーダルにはヘルスステータスドット（正常🟢・注意🟡・停止🔴）と相対時刻表示を追加したの✨🎀

### バグ修正っ

- **ギャラリー自動既読でカードが消えちゃう問題を修正** — Issue #222。ギャラリーで自動既読になったカードが即座に消えてレイアウトがガタガタ崩れてた問題を直したよ〜！自動既読になった記事は「未読のみ」フィルター中でもそのまま表示し続けて、フィード切り替えやビュー変更でリセットする仕組みにしたの✨ masonryの再描画が激減してサクサクっ🚀🎀

- **ギャラリー自動既読が記事カテゴリでも動いちゃってた問題を修正** — Issue #224。表示カテゴリが「記事」のフィードでもギャラリー自動既読が有効になってたのを無効化したよ〜！自動既読は「画像」「動画」「SNS」カテゴリだけで動くようにっ✨📱🎀

### パフォーマンス改善っ

- **既読・ブックマーク等の操作が爆速に** — Issue #223。readIds が 5 万件に育つと markRead のたびに JSON.stringify がメインスレッド占拠して約 1 秒フリーズしちゃってたの〜💦 localStorage 書き込みを `deferSaveSet` で非同期バッチ化して、同じティック内の書き込みは 1 回にまとめるようにしたよっ！React state は即時更新のままだから体感ゼロ遅延✨⚡ サーバー側の `mergeIdList` もファストパス追加で高速化っ🚀

### リファクタリングっ

- **useUIState.ts を5つのサブフックに分割** — Issue #227。381行・15+ useState のモンスターフックだった `useUIState.ts` をスッキリ分割しちゃったよ〜！`useThemePreference`（テーマ管理）・`useLayoutSettings`（レイアウト・フォント設定）・`useAutoReadSettings`（自動既読・自動翻訳）・`useAccessibilitySettings`（行間・テキスト均等割り）・`useStoredSetting`（localStorage永続化ユーティリティ）の5つに分けて見通しバツグンっ✨🔧

## 2026-04-24 (8)

### パフォーマンス改善っ

- **R2 の N+1 読み取りを並行度制限で最適化** — Issue #201。フィード100件購読してると `Promise.all` で100並列 R2 GET しちゃってたの、`pMap` で同時10件ずつに制限したよ〜！`getUserLatestArticles`・`getUserFeeds`・`buildFeedUserMap`・OPML インポート・推薦リンク探索の5箇所をまとめて修正っ🚀⚡

## 2026-04-24 (7)

### 激アツ新機能っ

- **ギャラリービューでスクロール既読** — Issue #212。ギャラリーレイアウトで記事カードを上にスクロールして通り過ぎたら自動で既読にしちゃうよ〜！自動既読がオンのときだけ動くから安心っ✨IntersectionObserver で賢く検知してるの📱🎀

## 2026-04-24 (6)

### パフォーマンス改善っ

- **readIds 肥大化 & sendBeacon ペイロード上限超過を修正** — Issue #200。readIds が 10 万件超になるとサーバーの R2 データが肥大化しちゃう問題と、`sendBeacon` の 64KB 上限を超えてデータロストしちゃう問題をまとめて解決！サーバー側は `mergeReadStateUpdate` で readIds を 10 万件にトリム、クライアント側は sendBeacon 前に 60KB サイズチェックして超過時は localStorage にフォールバック保存、次回ログイン時に自動リカバリするようにしたよ〜✨ localStorage の readIds も 5 万件で自動トリムするっ🚀💾

## 2026-04-24 (5)

### バグ修正っ

- **全既読がカテゴリ単位で動くように修正** — Issue #213。グループ・コレクション・タグ・FeedView タブで表示中のときは、表示中の未読記事だけを既読にするようにしたよ〜！全部まとめて既読にされちゃう問題をサクッと解決💡📚

## 2026-04-24 (4)

### 激アツ新機能っ

- **シェアメニューに Discord 共有を追加** — Issue #217。記事の共有メニューに Discord ボタンが登場したよ〜！タイトルと URL をクリップボードにコピーして Discord アプリを自動で開いちゃう✨Slack 共有と同じ使い心地だからすぐ慣れるっ💜🎮

## 2026-04-24 (3)

### リファクタリングっ

- **CollectionDropdown を独立コンポーネントに分離** — Issue #204。`ArticleView.tsx` 内にベタ書きされてた `CollectionDropdown` を `src/components/CollectionDropdown.tsx` に抽出したよ〜！しかも `window.prompt` / `window.alert` を廃止して、ちゃんとした `CollectionModal` 連携に変更しちゃった✨他のコンポーネントからも再利用できるようになったっ🎀

## 2026-04-24 (2)

### リファクタリングっ

- **`normalizeReadState` ヘルパー関数を抽出して共通化** — Issue #199。`app/api/read-state/route.ts` の GET・POST ハンドラーに9フィールド×2箇所で重複してた `ReadState` デフォルト補完ロジックを `normalizeReadState(stored: Partial<ReadState>): ReadState` ヘルパーとして `src/lib/read-state-merge.ts` に抽出したよ〜！DRY 原則に従って将来的なフィールド追加時の修正漏れリスクもゼロになったっ✨🧹

### ドキュメント整備っ

- **`architecture.md` に useReadState サブフックを追記** — Issue #207。`src/hooks/useReadState.ts` が `useReadStatePersistence` / `useReadStateSync` / `useReadStateTags` の3つのサブフックに分割されてたのに `.claude/rules/architecture.md` には反映されてなかったから追記したよ〜！各サブフックの責務も明記したっ📝

## 2026-04-24

### パフォーマンス改善っ

- **スクロール先読みをリストの中間段階でトリガーするように改善** — Issue #214。記事一覧で一番下までスクロールしないと次のページが読み込まれなかった問題を修正したよ〜！`rootMargin: "120px"` → `"600px"` に変更して、スクロール途中（リストの約半分くらい）で次のページを先読みするようにしたっ。`PAGE_SIZE` も 30 件から 50 件に拡大して、ロード頻度を減らしたよ〜！さらに「過去の記事を読み込む」ボタンも IntersectionObserver で自動トリガーするようになって、クリックしなくてもサーバー側の追加記事が自動的に読み込まれるようになったっ✨🚀

### バグ修正っ

- **RSS コンテンツの相対パス画像（avif 等）が 404 になる問題を修正** — Issue #215。フィードの `content:encoded` に含まれる相対パス `<img src="/images/photo.avif">` が rss.0g0.xyz のパスとして解釈されて 404 になってたのを直したよ〜！`xml-parser.ts` の RSS 2.0 / Atom / RDF / JSON Feed すべてのパーサーで `sanitizeHtml` のかわりに `applyCorePipeline(raw, link)` を呼ぶようにして、記事の URL を baseUrl として相対パスを絶対 URL に解決してからプロキシ経由に書き換えるようになったっ。`image-mime.ts` も Sequence AVIF (`avis` brand) を `image/avif` として認識できるように修正したよっ！💡🖼️

### リファクタリングっ

- **`articleMatchesQuery` を廃止して `matchesAdvancedQuery` に統合** — Issue #210。`src/lib/article-utils.ts` の `articleMatchesQuery`（スペース区切り AND 検索のみ対応）は本番コードで既に使われておらず、`src/lib/article-filter.ts` が `matchesAdvancedQuery`（フィールド指定・OR・否定・フレーズ検索まで対応）に移行済みだったからデッドコードを削除したよ〜！テストも `matchesAdvancedQuery` を直接テストするよう書き直して、将来的な乖離リスクをゼロにしたっ✨🧹

### セキュリティ対策っ

- **DBSC sessionId に UUID 形式検証を追加** — Issue #196。`challenge` と `register` の両エンドポイントで、クライアント送信の `sessionId` に `../` や `%2f` を含む値を渡しても R2 キーが不正なパスにならないよう UUID フォーマット検証を追加したよ〜！`/^[0-9a-f]{8}-...-[0-9a-f]{12}$/i` にマッチしない場合は 400 を返すようになったっ🔒
- **DBSC チャレンジを R2 に永続化して登録フローで照合** — Issue #197。ログインコールバック時に `users/{userId}/dbsc-pending-challenge.json` としてチャレンジを TTL 5 分で R2 に保存し、`/api/auth/dbsc/register` でクライアントが送ってきたチャレンジと照合するようにしたよ〜！照合前に削除することでリプレイ攻撃も防止、スケルトン状態だった DBSC 登録フローが完全に機能するようになったっ🔐✨
- **/api/clip の HTML サイズ上限チェックを追加** — Issue #198。`validateClipRequest` に 5MB 上限チェックを追加したよ〜！文字数と `TextEncoder` による正確なバイト数の両方でチェックするので、日本語・絵文字を含む HTML でも正しく弾けるっ。巨大 HTML での DoS リスクをガードしたよっ🛡️

## 2026-04-23 (4)

### バグ修正っ

- **ギャラリービューの重複コンテンツ取得（429）を修正** — Issue #195。`setMedia` → 再レンダー → 新しい `visible` 参照 → effect 再実行 → 進行中 fetch が abort・再取得、というフィードバックループを断ち切ったよ〜！`articles` 配列の代わりに記事 ID の結合文字列 `articlesKey` を `useEffect` の依存にしたことで、記事内容が変わらない限り `setMedia` で再実行されなくなったっ。さらに同一記事の同時並行 fetch を防ぐ `inflight` Set も追加して二重取得を完全ガード！すぐ 429 になってた問題がようやく直ったよっ💡🚀

## 2026-04-23 (3)

### セキュリティ対策っ

- **DBSC (Device Bound Session Credentials) 本実装** — Issue #186。スケルトンから本格実装に完成させたよ〜！`verifyDbscResponse` で JWS compact serialization の P-256 ECDSA 署名検証を Web Crypto API で実装、`importDbscPublicKey` で JWK／PEM 両形式の公開鍵インポートに対応。register エンドポイントは公開鍵フォーマット検証＋R2 保存＋サーバーセッションへのバインドを実装、challenge エンドポイントはリプレイ攻撃防止付きのチャレンジ検証フローを実装したっ🔒🗝️

## 2026-04-23 (2)

### セキュリティ対策っ

- **DBSC (Device Bound Session Credentials) スケルトン実装** — Issue #186。セッションをデバイスの TPM (Trusted Platform Module) にバインドしてセッションハイジャック対策を強化するための土台を追加したよ〜！`src/lib/dbsc.ts` に機能検出・チャレンジ生成・ヘッダービルダーを、`/api/auth/dbsc/register` と `/api/auth/dbsc/challenge` に Route Handler スタブを実装。Chrome DBSC API が実験的段階のため、P-256 ECDSA 署名検証と R2 公開鍵保存は TODO として詳細な実装手順をコメントに記載したっ。ブラウザが対応し次第、フルに動かせる設計になってるよっ🔒🗝️

## 2026-04-23

### 改善っ

- **AI 要約をマークダウン構造化出力に変更** — Issue #194。プロンプトを「3〜5文の平文」から「ポイント箇条書き＋まとめ1文」のフォーマット指定に更新したよ〜！ UI 側もセクションヘッダー・箇条書き・まとめを視覚的に区別してレンダリングするようにしたので、平文ダラダラ表示がスッキリ読みやすくなったっ✨📋

### パフォーマンス改善っ

- **記事一覧のちらつき・重さを改善** — Issue #193。フィルター切り替えや既読更新のたびに起きてた余分な再レンダリングを4箇所修正したよ〜！`collectionArticleIds` を `useMemo` 化してレンダーごとの `new Set` 生成をなくしたし、`handleToggleBookmark` 等を `useSyncedRef` に切り替えてポーリング更新のたびにハンドラが再生成される問題も解消っ。サーバー同期後に既読 ID に変化がなければ状態更新をスキップする早期リターンも追加。フィルター切り替え時に「記事がありません」が一瞬ちらつく問題も `wasJustCleared` フラグで防止したよ〜✨⚡

### セキュリティ対策っ

- **refresh_token をサーバーサイドセッションに移行** — Issue #189。refresh_token をブラウザの Cookie に直接持たせるのをやめて、R2 の `sessions/{sessionId}.json` にサーバー側だけで保管するようにしたよ〜！ブラウザには不透明な `session_id` だけを渡す設計に変更。Cookie が万が一漏れても refresh_token そのものは手に入らないし、サーバー側でセッションを即時削除することで強制ログアウトも可能になったっ🔒✨

### リファクタリングっ

- **RateLimit ストレージを R2 → Workers KV に移行** — Issue #191。クールダウン・スライディングウィンドウのレートリミットデータを R2 オブジェクトストレージから Workers KV に移行したよ〜！KV は小さいキー・バリューの高速読み書きに最適で、`expirationTtl` でクールダウン期間後に自動削除されるから R2 の期限切れオブジェクトが残ることもなくなったっ。`wrangler.toml` に `[[kv_namespaces]] binding = "RATE_LIMIT"` を追加、デプロイ前に `npx wrangler kv namespace create RATE_LIMIT` でnamespace ID を取得・設定する必要があるよ💨✨

### バグ修正っ

- **スクロール経由の自動既読が機能しない問題を修正** — Issue #182。翻訳表示やサマリー表示など `contentRef` が attach されないケースで IntersectionObserver が記事要素を観察できず、設定した閾値（70%・80%・90%）まで読んでも自動既読にならなかったの。`handleScroll` にも同じ閾値チェックを追加して、スクロール位置ベースでもちゃんと自動既読できるようになったよ〜！📖✨

### バグ修正っ

- **ギャラリービューの画像保存ファイル名を記事詳細と統一** — Issue #192。ギャラリーから「画像を保存」や「画像を一括保存」したとき、ファイル名が `image-1` みたいな汎用名称になってたのを `記事タイトル-1.jpg` 形式に変更したよ〜！記事詳細ビューの保存と完全に揃えたっ。`buildSafeTitle` ヘルパーを追加してサムネイル単体・一括ダウンロードどちらも対応済み🖼️✨

- **記事詳細で画像一覧が二重表示される問題を修正** — Issue #190。`removeNoise()` が EC ギャラリー（`image-gallery` / `product-gallery` 等のクラス）や画像のみの `<ul>` をインラインスライダー（`rss-image-slider`）に変換してたのが、末尾の `ImageGallery` コンポーネントとかぶって同じ画像が2回出てた問題を直したよ〜！スライダー変換をやめて `<div hidden>` でラップするように変更。`collectImageUrlsFromHtml` は hidden div の中の `<img>` も正規表現でスキャンするから、末尾ギャラリーには引き続き表示されるよっ。Shopify 製品ページの `product-featured-media` 画像も同様に修正🖼️✨

## 2026-04-22

### リファクタリングっ

- **`content.ts` を4ファイルに分割** — Issue #181。1272行の巨大ファイルを `html-post-processor.ts`・`readability-extractor.ts`・`regex-extractor.ts`・`content.ts`（オーケストレーション専用）に分割したよ〜！循環依存ゼロで責務がスッキリ分離されてメンテしやすくなったの🧹✨

### バグ修正っ

- `cascadeOverflow()` が MAX_PAGES を超過したとき `SharedFeedMeta.oversizeAlert` フラグを立てるようにしたよ〜。`console.warn` だけじゃ気づけなかった問題を修正！💡

### リファクタリングっ

- **`LayoutIcon` コンポーネントを分離** — Issue #184。`ArticleList.tsx` にインライン定義されてた 5 種類のレイアウトアイコン SVG を `src/components/LayoutIcon.tsx` として切り出したよ〜！40 行超の visual noise がスッキリして、再利用もできるようになったの🧹✨

### セキュリティ対策っ

- **Cookie ヘッダー検証の強化** — Issue #179。`isValidCookieHeader()` の最大長を 4096 → 2000 文字に削減して、RFC 6265 準拠の name=value ペア形式チェックも追加したよ〜！value 内の `;` や `,` を拒否することで Cookie jar poisoning リスクを低減したの🔒✨

- **`hasDangerousScheme()` の NBSP バイパス対策** — Issue #178。`&#160;javascript:` や `&nbsp;javascript:` みたいな NO-BREAK SPACE（U+00A0）を使った XSS バイパス手法を検出できなかったやつを修正したよ〜！`&nbsp;` / `&NonBreakingSpace;` 名前付き文字参照のデコードと U+00A0 の除去を追加して、よりしっかりガードできるようになったの🔒✨

### リファクタリングっ

- **FeedSidebar を feed-sidebar/ ディレクトリに分割** — Issue #170。1767 行の巨大コンポーネントを `FeedGroupsSection` / `FeedViewTabs` / `SpecialViewButton` / `FooterIconButton` + `StatItem` の 5 ファイルに切り出したよ〜！メインの `index.tsx` は 1125 行に削減されてメンテしやすくなっちゃう🧹✨

## 2026-04-21

### コードレビューっ

- **APIレスポンスの型安全性を改善** — Issue #173。`res.json() as Feed` とか `as ReadState` みたいな検証なしキャストを型ガード関数に置き換えたよ〜！`src/lib/type-guards.ts` に `isReadState` / `isFeed` / `isArticle` を追加して、不正なレスポンスが来てもサイレントにクラッシュしないようにしたの🛡️✨

## 2026-04-21

### セキュリティ対策っ

- **フィード追加・全文取得 API にサーバーサイドのレートリミットを追加** — Issue #171。`/api/feeds` POST に 30 秒クールダウン、`/api/content` GET にスライディングウィンドウ（60 秒間 30 回）を導入したよ〜！キャッシュヒット時はカウントしない設計なのでふだんの読書体験には影響ナシっ🔒✨

## 2026-04-21

### パフォーマンス改善っ

- **記事選択の高速化 & 一覧チラツキ解消** — Issue #175 #176。記事を選ぶたびに全アイテムが再描画されてた問題をガチ修正したよ〜！`isSelected` を props から Context に切り出して、選択変化は前後 2 件だけ更新されるようにしたの✨ さらに既読フィルタなどで記事が消えるとき compact/list/card/magazine レイアウトでも 250ms のフェードアウトが入るようになって滑らかになっちゃう🎉🚀

- **KaTeX CSS を動的ロードに変更** — Issue #169。数式がない記事でも毎回読み込まれてた KaTeX のスタイルシート（~28KB）を、数式レンダリング時にだけ遅延ロードするようにしたよ〜！初回表示がちょっと軽くなっちゃう🚀✨

### バグ修正っ

- **ログイン認証を Basic 認証に統一** — 0g0-id が共有 `INTERNAL_SERVICE_SECRET` を完全撤去（Phase 9）したので、RSS 側も `X-Internal-Secret` / `X-BFF-Origin` ヘッダーを削除して Basic 認証（`CLIENT_ID`/`CLIENT_SECRET`）のみで接続するようにしたよ〜🔑✨

### 激アツ新機能っ

- **記事コレクション** — Issue #130。テーマ別に記事をまとめられるコレクション機能を追加したよ〜！「読書記録」「調査メモ」みたいに自分だけの記事セットを作れちゃう✨ サイドバーからコレクション切り替え＆ArticleView から記事をワンタップ追加できるよっ📂🎀

## 2026-04-21

### バグ修正っ

- **ログインできない問題を修正** — Issue #168。0g0-id が共有シークレット（`INTERNAL_SERVICE_SECRET`）を撤去して BFF 個別シークレットのみに移行したのに RSS リーダー側が追従してなかった問題を修正！環境変数を `INTERNAL_SERVICE_SECRET_RSS` にリネームして個別シークレット対応したよ〜🔒✨

## 2026-04-21

### バグ修正っ

- **小さいサムネイル画像の除外** — Issue #165。WordPress の `-30x30.jpg` みたいな小サムネイル画像が記事本文やギャラリーに表示されちゃってた問題を修正！URL内のサイズサフィックスを検出して100px未満のサムネは自動除外するようにしたよ〜🖼️✨

## 2026-04-22

### 激アツ新機能っ

- **翻訳プロバイダ表示** — Issue #166。ユーザー設定の自動翻訳セクションに「何で翻訳されるか」を表示するようにしたよ！Chrome 翻訳が使えない場合はその理由も教えてくれる〜💡✨

### バグ修正っ

- **フォーカスモードのモバイル対応** — Issue #164。スマホでは単一ペイン表示だからフォーカスモード意味ないのに解除ボタンが出ちゃってた問題を修正！解除ボタンとトグルボタンをPC（lg以上）のみ表示にしたよ〜📱✨

- **記事画像がコンテナ幅いっぱいに広がるように修正** — Issue #163。画像のwidthがエリアに対して小さかった問題を修正！CSS `width: 100%` で画像をコンテナ幅に追従させて、inline `max-width` で元画像サイズ以上に引き伸ばされないようにしたよ〜📸✨

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

- **自動翻訳機能** — Issue #133。ユーザー設定に「自動翻訳」トグルを追加。有効化すると、非日本語記事を選択した際に自動で翻訳を実行する。Chrome Translator API が利用可能な場合はブラウザ側で完結し、非対応環境では Workers AI にフォールバック。`isLikelyJapanese` で原文言語を簡易判定し、日本語記事はスキップ。

### バグ修正っ

- **ギャラリービュー列数フォーカスモード修正** — Issue #144。列数固定時にフォーカスモードで余白が出る問題を解消（maxWidth 制約を削除）。自動モード時のフォーカスモードは最大6列に制限。

- **スマホ Chrome でブラウザ翻訳が使われない問題を修正** — Issue #138。`shouldUseBrowserTranslation` が `availability === "available"` のみを許可していたため、モバイル Chrome で翻訳モデル未ダウンロード時（`"downloadable"`）にブラウザ翻訳が発動せず Workers AI フォールバックになっていた。`"downloadable"` も許可し、`Translator.create()` のモデル自動ダウンロードを活用するよう修正。`detectSourceLanguage` の `LanguageDetector` availability チェックも同様に統一。

### 激アツ新機能っ

- **翻訳プロバイダー表示** — Issue #136。翻訳タブ選択時に「Chrome 翻訳」または「Workers AI」のバッジを表示し、どのエンジンで翻訳されたかをユーザーが確認できるように。`AiOperationResult` に `provider` フィールドを追加し、LRU キャッシュにも永続化。

- **OGP / Twitter Card 対応** — Issue #146。`layout.tsx` に Open Graph (`og:title` / `og:image` / `og:description` / `og:site_name`) と Twitter Card (`summary_large_image`) メタタグを追加。`og.svg` から PNG を生成して `public/og.png` として配置。Twitter・Slack・Discord 等でリンク共有時にリッチプレビューが表示されるように。E2E テストも追加。

### コードめかし込み

- **リリースノートのページネーション対応** — Issue #151。リリースノートが 3600 行に肥大化しバンドルサイズ・API レスポンスに影響していた問題を解消。`release-notes-data.ts` を直近 2 週間分にトリム（3400 行→ 745 行）、API に `limit` / `offset` パラメータを追加しセクション単位でページネーション、モーダルに「もっと見る」ボタンを追加して段階的読み込みに対応。古いエントリは git history に保持。

### 激アツ新機能っ

- **ギャラリービューの列数指定機能** — Issue #144。ユーザー設定モーダルに「ギャラリー列数」セグメントを追加（自動 / 2〜8列）。「自動」は従来通り columnWidth=220px ベースで masonic が自動計算、列数指定時はコンテナ幅から columnWidth を逆算して正確に N 列表示。記事一覧フォーカスモード（listFocusMode）時は指定列数に合わせた maxWidth を設定し余白を抑制。設定は localStorage (`rss-gallery-columns`) に永続化。

- **キーボードショートカット一覧ボタン + 記事一覧フォーカスモード切替ボタンを追加** — Issue #148。`?` キーでしか開けなかった `KeyboardShortcutsModal` の UI 導線と、`Shift+\`（= `|`）以外に有効化手段がなかった `listFocusMode`（記事一覧フォーカス）の UI 導線を同時に整備。`FeedSidebar` のフッター（ユーザー設定・テーマ切替ボタンの隣）に `onOpenHelp` で開くヘルプ系 `FooterIconButton`（`?` 付き丸アイコン）を追加し、`App.tsx` から `setShowHelp(true)` を配線。`ArticleList` ツールバーのレイアウト切替ボタン群の直後に `listFocusMode` トグルボタン（`ArticleView` の `focusMode` トグルと対称な 4 隅矢印アイコン、`aria-pressed` 付き）を配置し、`onToggleListFocusMode` prop 経由で `useUIState` の `toggleListFocusMode` を呼ぶ。`LAYOUTS.map` と同じ w-6/h-6 サイズで統一し、既存のピルボタン群と視覚的に馴染ませた。これで `|` / `\` キーバインドを知らないユーザーもヘルプから全ショートカットを参照でき、`listFocusMode` を明示的に ON / OFF できる。

## 2026-04-20

### 激アツ新機能っ

- **記事へのユーザータグ付与とタグ別ビュー** — Issue #103。記事に任意の複数タグを付与し、サイドバーのタグセクションから任意タグの付いた記事だけを横断表示できるようにした。データは既存 `ReadState.tagIds?: Record<string, string[]>` に相乗り（新規 R2 キーなし）、`users/{userId}/read-state.json` に保存される。`src/lib/validation.ts` に `parseTagIds` / `MAX_TAG_NAME_LENGTH=50` / `MAX_TAGS_PER_ARTICLE=20` を追加し、制御文字除去・重複排除・DoS 対策 (`MAX_TAGGED_ARTICLES` サーバー上限 2,000 件 / マージ層ハードリミット 5,000 件) を実装。`src/lib/read-state-merge.ts` の `mergeTags` は「incoming はキー単位で既存を上書き、`removedIds.tagIds` に入ってるキーは除去」という純粋キー置換方式で他端末とのマージを処理する。クライアント側 (`src/hooks/useReadState.ts`) には `addTag / removeTag / setArticleTags / clearArticleTags` を新設、`pendingTagChangedRef` / `pendingTagRemovedRef` で差分のみ POST する既存パターンを踏襲。`applyServerState` はローカル未同期キーを保護しつつ削除予定キーを除外する安全マージに。フィルター側 (`src/lib/article-filter.ts`) は `selectedTag / articleTags / taggedOnly` を受け付ける `buildTagPredicate` を追加し、UI では `src/components/FeedSidebar.tsx` の特殊ビュー直後に記事数付きタグ一覧を、`src/components/article-view/TagEditor.tsx` で記事ビュー内タグバッジの追加・削除 UI を実装。`App.tsx` に `selectedTag` 状態と `?tag=` URL 同期を追加（`?feed` / `?group` と相互排他）。`e2e/read-state-merge.spec.ts` に 5 ケース、`e2e/article-filter.spec.ts` に 6 ケース、`e2e/tag-validation.spec.ts` に 12 ケース新規テストを追加。

- **画像/動画カテゴリ選択時にギャラリーレイアウトへ自動切替 + 可視全記事の先行取得** — カテゴリタブで `pictures` / `videos` を選ぶと `App.tsx` の `onChangeActiveFeedView` ラッパーが自動的に `onChangeLayout("gallery")` を発火し、常に全画像・全動画が展開表示されるようにした。ユーザーが後で手動で別レイアウト (list / card 等) を選んだ場合はその選択を尊重する（次のカテゴリ切替時に再度 gallery に戻す）。加えて `usePrefetchGalleryContents` の `maxPrefetch` のデフォルトを 10 件 → `POSITIVE_INFINITY` (内部ハードリミット 200 件) に拡張し、スクロールで `visible` 配列が追加されるたびに新しい記事も自動で先行取得される挙動に変更。既存のバースト抑制 (concurrency 2 / requestDelayMs 250ms / 429 検出で全停止) は維持するため、サーバー負荷の上限は変わらない。

- **ギャラリービューで本文を先行取得して全画像・動画を展開表示** — 画像カテゴリ (`activeFeedView === 'pictures'`) と動画カテゴリ (`'videos'`) を選択中、ギャラリーレイアウトの表示記事について `/api/content` をバックグラウンドで並列先行取得し、本文内の全画像・全動画埋込みをカードに展開表示できるようにした。従来は `article.ogImage` 1 枚しか出せなかったため、画像系フィード（Tumblr / Pixiv 等）の記事カードに 1 枚の代表画像しか現れず、動画系フィードでは動画コンテンツがサムネ頼みで視認性が悪かった。`src/hooks/usePrefetchGalleryContents.ts` を新設（`enabled` フラグでカテゴリ限定、`concurrency=3` で並列制限、`maxPrefetch=20` で先頭 20 件まで）し、既存 `contentLruCache` を活用してキャッシュ済み記事は即座に state 反映、未キャッシュのみ `apiFetch` で /api/content を叩く。取得した HTML を `collectImageUrlsFromHtml` と新設 `collectIframeUrlsFromHtml`（信頼済みサービスのみ通過するため広告 iframe を除外）に通して `Map<articleId, { images, embeds }>` を公開。`src/components/ArticleItems.tsx` の `GalleryArticleItem` に `prefetchedImages?: string[]` を追加し、設定時は縦スタックで全画像を表示。動画カテゴリでは新設 `extractEmbedThumbnailUrl` で YouTube iframe URL を `i.ytimg.com/vi/{id}/mqdefault.jpg` の静止画に変換し、画像と同じパイプで展開。`ArticleList.tsx` の Props に `activeFeedView?: FeedView` を追加し `App.tsx` から配線、`galleryImagesForItem` コールバックでカテゴリ別の画像リストを組み立てる。`e2e/content-extraction.spec.ts` に `collectIframeUrlsFromHtml` の 4 ケース（複数抽出 / 重複排除 / 信頼済み以外除外 / iframe なし）を追加。unmount 時は `AbortController` で進行中フェッチを中断してリークを防ぐ。

- **FeedView カテゴリタブのみでの記事一覧横断表示** — サイドバー上部タブ（記事 / 画像 / 動画 / SNS）を切り替えるだけで、そのカテゴリに属する全フィードの記事を一覧表示できるようにした。従来はカテゴリタブで表示されるフィードのみ絞り込まれていたが、個別フィードを選択しない限り全記事が表示されていたため、カテゴリ横断的な閲覧ができなかった。`src/lib/article-filter.ts` の `ArticleFilterOptions` に `viewFeedIds?: Set<string>` を追加し、`buildFeedPredicate` で `feedId===null && groupFeedIds 未設定` のときのみ `viewFeedIds.has(a.feedHash)` で絞り込む。優先順位は `feedId > groupFeedIds > viewFeedIds` の順。`src/hooks/useFilteredArticles.ts` に `activeFeedView: FeedView` オプションを追加し、`feeds` を元に `viewFeedIds` を `useMemo` で構築。"articles" タブは `FeedSidebar.matchView` と同じ仕様で未分類フィード (`Feed.view` 未設定) も含む。`src/App.tsx` の `onChangeActiveFeedView` ラッパーで、タブ切替時に `selectedFeedId` / `selectedGroupId` / `selectedArticle` を null に戻すことで、ユーザーがタブを切り替えるだけで即座にカテゴリ横断表示になる UX にした。`e2e/article-filter.spec.ts` に 6 ケース追加（単一/複数 feedHash 横断 / feedId 優先 / groupFeedIds 優先 / 空 Set で全除外 / undefined で従来挙動維持）。

- **全フィード横断のフルテキスト検索と高度フィルタリング** — Issue #102。検索ボックスに高度クエリ構文を追加：フィールド指定 (`title:foo` / `author:bar` / `feed:baz` / `category:qux` / `content:hello`)、フレーズ検索 (`"hello world"`)、否定 (`-foo`)、暗黙 AND・明示 OR (`foo OR bar`)、大文字小文字無視。構文を含まない単純クエリは従来通り title / summary / author / categories / content を横断する既存互換挙動。`src/lib/full-text-search.ts` に純粋関数 (`parseSearchQuery` / `matchesAdvancedQuery`) として実装し、`src/lib/article-filter.ts` の `buildQueryPredicate` から呼び出す。`SearchContext.feedTitleByHash` を `useFilteredArticles` 側で構築し `feed:` クエリを解決可能に。検索条件の保存機能 (`useFullTextSearch` フック) を新設、`localStorage` (`rss-saved-searches`) に最大 20 件まで保存し検索ドロップダウンの「保存済み」セクションから即時呼び出せる。検索バー右側に「保存」ボタンを追加 (2 文字以上の入力時のみ表示)。`e2e/full-text-search.spec.ts` に 42 ケース追加 (parseSearchQuery / matchesAdvancedQuery のフィールド・OR/AND/NOT・フレーズ・エッジケース・未閉鎖クォート fallback・OR の大小無視)。
- **フィードビュータブ + Pinterest 風ギャラリーレイアウト** — Issue #114。サイドバー上部に「記事 / 画像 / 動画 / SNS」の 4 タブを追加し、各フィードを任意のカテゴリに分類できるようにした。タブ切替で対応する view のフィードのみが表示される（未分類フィードは「記事」タブ所属扱い）。併せて `gallery` レイアウトを新設（CSS columns による masonry、サムネイル優先）。`UserSubscription.view` / `Feed.view` / `FeedPatchPayload.view` を追加し、`PATCH /api/feeds/:id` で `view: "articles" | "pictures" | "videos" | "social" | null` を受け付ける。`FeedItem` のコンテキストメニューに「表示カテゴリ」サブメニューを追加。localStorage キー `rss-active-feed-view` にタブ選択状態を永続化。UX は [Folo](https://github.com/RSSNext/Folo)（AGPL-3.0）を参考にしたがコードは流用せず MIT のままとした。

### 激アツ新機能っ

- **記事一覧フォーカスモードの新設 + 画像/動画カテゴリで自動有効化** — Issue #141。既存の `focusMode`（サイドバーと記事一覧を畳んで記事詳細を最大化）とは別に、**サイドバーと記事ビューを畳んで記事一覧を最大化**する `listFocusMode` を新設した。`useUIState.ts` に state / `toggleListFocusMode` / `setListFocusMode` を追加し、Escape キー押下で両フォーカスモードともに OFF、`\` キー単体で従来の `focusMode`、`Shift+\` (= `|`) で `listFocusMode` をトグル、相互排他で一方を有効にすると他方は OFF になる。`App.tsx` の `gridTemplateColumns` を `focusMode ? "0px 0px 1fr" : listFocusMode ? "0px 1fr 0px" : "${sidebarWidth}px ${listWidth}px 1fr"` に拡張（`focusMode` 優先）、カラムリサイズハンドルは両フォーカス時に非表示。さらに `onChangeActiveFeedView` ラッパーで `view === "pictures" || "videos"` のときに `setListFocusMode(true)` を呼び（`gallery` 自動切替とセット）、それ以外のカテゴリでは `setListFocusMode(false)` に戻す。これで masonic による Pinterest 型 masonry ギャラリーが記事ペイン全幅で表示され、画像/動画カテゴリの閲覧体験が大きく向上した。

### バグ絶対キルした（パフォ / UX）

- **フォーカスモード解除ボタンを追加（戻り方の可視化）** — Issue #143。画像/動画カテゴリ切替で `listFocusMode` が自動 ON になるがサイドバー・記事ビュー列が幅 0 に潰れるため、`\` / `|` / `Esc` のキー操作を知らないユーザーには戻り方が不明だった。`useUIState.ts` に `exitFocusMode`（`setFocusMode(false) + setListFocusMode(false)` を同時呼び出す純粋ヘルパー）を新設し、`App.tsx` で `focusMode || listFocusMode` 時のみ表示される `fixed top-3 right-3 z-50` のピル型ボタン（展開アイコン + 「フォーカス解除」ラベル）から呼び出す。`bg-ink` / `rounded-full` の既存主アクション系スタイルで統一し、`aria-label="フォーカスモード解除"` と `title` にショートカット `(Esc)` を明示してアクセシビリティを確保。`exitFocusMode` は記事詳細フォーカス・記事一覧フォーカスどちらからでも同一挙動で抜けられるため、挙動の対称性が保たれる。

- **ギャラリーの既読削除アニメーション（位置遷移 + フェードアウト）** — Issue #145。masonic は append-only 前提で `usePositioner` deps `[items.length]` のため、既読で items が中間削除されると positioner が再生成され**残りカードが飛ぶように再配置**されていた。2 段構えで対応: (1) `GalleryMasonry.tsx` の `useMasonry` に `itemStyle={{ transition: "top 0.3s ease, left 0.3s ease" }}` を追加し、positioner 再生成後の新 top/left に CSS transition で**滑らかに遷移**させる。(2) `src/hooks/useDelayedGalleryItems.ts` を新設し、既読などで visible から抜けた記事を 300ms 間 `displayItems` に保持・同時に `deletingIds` Set に id を入れる。`ArticleList.tsx` の `GalleryItemCtx` に `deletingIds` を追加、`GalleryCardRenderer` が対象要素を `opacity: 0 / pointer-events: none` に遷移させるラッパーで wrap。300ms 後に真の `items` と同期して positioner 再生成、残りカードが CSS transition で自然に収まる流れ。wrapper style は参照安定化のため module scope 定数（`GALLERY_CARD_WRAPPER_STYLE_VISIBLE` / `GALLERY_CARD_WRAPPER_STYLE_DELETING`）に切り出し。新規追加のみ（append-only）の場合は遅延なしで即同期する設計のため、無限スクロールや新着取り込みのパフォーマンスには影響しない。

- **画像/動画カテゴリの事前取得で 429 を抑制 + Retry-After をサーバー経由で伝達 + ギャラリーのちらつきを解消** — Issue #142。3 点まとめて対応：(1) `usePrefetchGalleryContents` の `requestDelayMs` デフォルトを 250ms → 750ms に引き上げバースト抑制を強化。(2) `app/api/content/route.ts` で上流 429 受信時に `Retry-After` ヘッダー（と JSON body の `retryAfter`）をクライアントに pass-through、クライアント側は `res.headers.get("Retry-After")` を `src/lib/retry-after.ts` の新規 `parseRetryAfter` (delta-seconds / HTTP-date 両対応・`maxMs=10 分` でクランプ) でミリ秒化し `rateLimitUntilRef` に期限を保存、次回 effect 起動時にも期限内なら即終了してクールダウンを維持する。cron/fetch の既存 `parseRetryAfter` も同ライブラリを共有利用にリファクタ。(3) `ArticleList.tsx` の gallery 分岐が `render` prop にインライン関数を渡しており masonic が毎回 render identity 変化で全セルを unmount/remount → カード全体がちらついていた問題を修正。`GalleryCardRenderer` を `memo` で module scope に固定、`resolveItemProps` / `galleryImagesForItem` は `GalleryItemCtx` Context で供給。`itemKey` も module scope 関数に切り出して identity を安定化。これで prefetch state 更新が発生しても masonic セルの再マウントは起きず、対象セルのみ reconcile される。

### バグ絶対キルした（UXリグレッション）

- **ギャラリービューを masonic で仮想スクロール対応 Pinterest 型 masonry にリニューアル** — Issue #139。#126 で CSS columns (masonry) → CSS Grid 行優先 (`grid-cols-* auto-rows-max`) に変更したが、カード高がバラバラなため各行の最大高に揃えられて大きな空白が発生し視覚的に「キモい」状態になっていた。さらに元の CSS columns は「左列→下→次列」配置で infinite scroll で新記事が左列下部に挿入される #126 の問題も抱えており、両立が難しかった。`masonic` (MIT, ~8KB gz) を導入し、`usePositioner` / `useResizeObserver` / `useMasonry` の低レベル API で `src/components/GalleryMasonry.tsx` を新設。親スクロールコンテナ (`scrollContainerRef` の `overflow-y-auto` 領域) に適合させるため `useParentScroller` (rAF スロットリング付き scrollTop 監視) と `useContainerMetrics` (ResizeObserver で width / height / offsetTop 追従) のカスタム hook を内包。`ArticleList.tsx` の gallery 分岐を `<GalleryMasonry items={visible} scrollElement={scrollEl} columnWidth={220} columnGutter={12} overscanBy={6} render={...} />` に置換し、`scrollEl` は `useLayoutEffect` で `scrollContainerRef.current` を state に反映して子に渡す。`usePositioner` の deps は `[items.length]` として、append-only の無限スクロール時に既存アイテムの位置を保つ。

### メモっといた

- **architecture.md に新規 hooks / lib / components / R2 プロパティを追記** — Issue #128。`.claude/rules/architecture.md` の「ディレクトリ構造」セクションが直近の実装差分に追従できていなかったため、エージェントチーム（Explore × 3 並列）で差分を抽出して以下を反映。components に `UserSettingsModal.tsx` / `SaveUrlModal.tsx` / `FeedAddModal.tsx` / `article-view/` サブディレクトリを追記。hooks に `useArticleHighlight` / `useArticleNote` / `useArticleAiRatings` / `useFullTextSearch` / `usePrefetchGalleryContents` / `useSliderGallery` / `useSyntaxHighlight` / `useMathRender` / `usePopupLock` を追記。lib に `api-error` / `cache-helper` / `csrf` / `rsshub` / `full-text-search` / `read-state-merge` / `feed-group-drop` / `image-proxy-url` / `image-proxy-security` / `browser-translator` / `translate-html` / `popup-lock` / `serialize-error` を追記。R2 データ構造セクションの `UserSubscription` 行に `view` / `requestCookie` / `lastAccessedAt` を、`ReadState` 行に `tagIds` を、`SharedFeedMeta` 行に `lastModified` / `etag` / `cacheControl` / `nextFetchEarliestAt` を追加。さらに `.claude/rules/release-notes.md` に「新規 endpoint / hooks / lib / components / R2 プロパティ追加時は architecture.md も同期必須」というルールを明文化した。

### バグ絶対キルした

- **cascadeOverflow の MAX_PAGES 超過時データ喪失を修正** — Issue #131。`src/lib/shared-feed.ts` の `cascadeOverflow` は `currentPage > MAX_PAGES (=500)` でループを抜けるが、`currentOverflow` に残った記事が書き込まれずに silent drop されていた（PAGE_SIZE × MAX_PAGES = 250,000 件を超える極めて稀なエッジケース）。あわせてループ内の `break` 経路で `currentOverflow` がクリアされない既存バグも発見（末尾ページ追記ロジックが誤発火する）。修正: (1) break 前に `currentOverflow = []` で明示クリア、(2) ループ脱出後に残 overflow があれば末尾ページ (p{maxPages}) に追記して PAGE_SIZE 超過を許容（データ喪失より整合性を優先）、(3) `console.warn` で破棄件数・feedHash・page size を出力して運用監視可能に。テスト容易化のため `cascadeOverflow` を export し `options?: { maxPages?: number; pageSize?: number }` を追加（本番は既存定数をデフォルト使用）。`e2e/cascade-overflow.spec.ts` に 4 ケース追加（通常カスケード / 次ページ送り / maxPages 超過時の追記 / pageSize 超過許容）。R2Bucket の最小モック (`makeR2Mock`) をテスト内に実装。

- **useArticleContent の OGP フェッチ結果を localStorage に保存 + HTTP ステータス検証を追加** — Issue #127。`src/hooks/useArticleContent.ts` の OGP 画像動的解決 `useEffect` は `loadJson(STORAGE_KEYS.OGP_CACHE)` から読み込みはしていたが、フェッチ成功時に localStorage へ保存していなかったため、`useOgpCache` のバッチ取得（`FETCH_BATCH_SIZE=10`）に乗らなかった記事を直接開いた場合に `/api/ogp` を毎回叩き、同じ記事を再度開いた際もキャッシュが効かなかった。成功時に `saveJson` で保存するようにし、併せて `MAX_OGP_CACHE_SIZE=2000` と同等の切り詰めロジックを適用。`r.json()` の前に `r.ok` チェックを追加し、HTTP 4xx/5xx レスポンスの JSON を誤って parse して `image=undefined` で setState する潜在バグも解消。`useOgpCache.ts` のパターンに合わせる形の統一で、localStorage 読み込み側 (L73-80) の既存ロジックは不変。

- **ギャラリービューの並び順を行優先へ変更** — Issue #126。CSS columns による masonry は「左列を上から下へ埋めてから次の列」という列優先配置のため、infinite scroll で新しい記事が追加されるたびに左列の下部に新しい記事が流れ込み、すでに閲覧済みのカードが押し出される不自然な挙動になっていた。`src/components/ArticleList.tsx` の gallery レイアウトを `columns-*` から `grid grid-cols-* auto-rows-max` に変更し、「左→右、上→下」の行優先配置にした。併せて `src/components/ArticleItems.tsx` の `GalleryArticleItem` から columns 用の `mb-3 break-inside-avoid` を除去（親の `gap-3` と重複するため）。masonry 感は失われるが、スクロール時に上部の記事が固定される予測可能な並びを優先した。

- **image-proxy URL の二重ラップを防止** — Issue #125。サムネイル / OGP 画像が何らかの経緯で既に `/api/image-proxy?url=...` 形式（相対 URL のプロキシ形式）で渡された場合に、`encodeURIComponent` で再ラップして `/api/image-proxy?url=%2Fapi%2Fimage-proxy%3Furl%3D...` のような二重ラップ URL が生成される問題を修正。新規ユーティリティ `src/lib/image-proxy-url.ts` の `buildImageProxyUrl(url)` が「既にプロキシ化済みならそのまま返す / 絶対 URL のみ `/api/image-proxy?url=<encoded>` に変換」という冪等な防御を担保する。`src/components/ArticleItems.tsx` (`ArticleThumbnail`)、`src/components/ArticleView.tsx` (OGP 画像表示)、`src/components/FeedSidebar.tsx` (ユーザーアイコン)、`src/hooks/useImageDownload.ts` (OGP 画像 DL)、`src/hooks/useContentLinkPreviews.ts` (OGP リンクプレビュー) の 5 箇所でインラインの `` `/api/image-proxy?url=${encodeURIComponent(x)}` `` をすべて `buildImageProxyUrl(x)` に置換。`e2e/image-proxy-url.spec.ts` に 10 ケース（絶対 URL / http / クエリ文字列のエンコード / プロキシ URL のスキップ / 複数回適用の冪等性 / `isProxiedImageUrl` 判定）を追加。

- **ギャラリー先行取得のリクエスト過多 (429) を抑制** — `usePrefetchGalleryContents` がデフォルト 3 並列 × 20 件で短時間に大量の `/api/content` リクエストを発行し、リモートサイト側のレート制限で 429 応答が返っていた。`concurrency` を 3 → 2、`maxPrefetch` を 20 → 10 に引き下げ、各 fetch 完了後に `requestDelayMs` (既定 250ms) のディレイを挿入してバーストを抑制。1 件でも 429 レスポンスを受信したら `rateLimited` フラグを立てて以降の全 worker を即停止し、`AbortController.abort()` で進行中の fetch も中断。これにより連鎖的な 429 を防ぎ、再訪時にキャッシュから即時復元される挙動は維持する。ディレイ中に unmount した場合も `signal.addEventListener("abort")` で sleep を即時解放してリークを防ぐ。

- **記事本文取得時に動画埋込みが削除される問題を修正** — Issue #120。`src/lib/content.ts` の `extractWithReadability` が `@mozilla/readability` に HTML を渡す際、Readability の独自 `VIDEO_REGEXP` に合致しない iframe（`embed.nicovideo.jp` / `open.spotify.com` / `w.soundcloud.com` / `clips.twitch.tv` / `embed.zenn.studio` / `platform.twitter.com` など）を本文外と判定して削除してしまう挙動があった。`<iframe>` / `<video>` / `<audio>` タグを Readability 実行前に `<p class="rss-reader-preserved-embed">` プレースホルダーに退避し、実行後に元タグへ復元する `preserveTrustedEmbeds` / `restoreTrustedEmbeds` を新設。プレースホルダー `<p>` 内のテキストに `RSSREADER_EMBED_PLACEHOLDER_N_END` 形式でインデックスを埋め込み、`preClean` の `data-*` 属性除去の影響を受けない設計にした。`Readability` コンストラクタに `classesToPreserve: [EMBED_PLACEHOLDER_CLASS]` を渡してクラス属性が剥がれないよう保証。復元後の HTML は従来どおり `sanitizeHtml` の `TRUSTED_IFRAME_RULES` で最終フィルタされるためセキュリティ境界は維持される。`e2e/content-extraction.spec.ts` に 6 ケース追加（YouTube `/embed/` iframe 保持 / ニコニコ iframe 保持 / `<video>` / `<video><source>` / `<audio>` 保持 / 信頼できない iframe の除去）。

- **記事本文取得前に翻訳できない問題を修正** — Issue #119。`src/components/ArticleView.tsx` の翻訳ボタン・`z` キーハンドラーは `doTranslate(link, id, storedContent ?? undefined)` を呼んでいたため、本文未取得 (`storedContent` なし) の状態で翻訳を実行すると、`useAiOperation.run` 内で `localInput` が `undefined` となり Chrome Translator API によるクライアント翻訳（HTML 構造保持）が発動せず、サーバー側の `runAiJob` は RSS フィード由来の短い本文のみを翻訳対象にしてしまっていた。翻訳処理を `handleTranslate` useCallback に共通化し、`storedContent` が無い場合は先に `fetchFullContent(onFetched)` で全文を取得し、取得結果を `onFetched` コールバック経由で `doTranslate` に直接渡すよう変更。これによりキーボードショートカット・ボタンクリックのどちらからでも、本文未取得時は自動的にフェッチ → 翻訳の順で処理され、HTML 構造を保持したまま全文翻訳が得られる。
- **image-proxy の許容サイズを 10MB → 30MB に拡大** — Issue #118。高画質 JPEG / PNG（一眼カメラ由来の 10MB 超画像や高解像度 PNG）が `/api/image-proxy` で `too_large` プレースホルダーに差し替えられてしまう問題に対応。`app/api/image-proxy/route.ts` の `MAX_IMAGE_BYTES` を `10 * 1024 * 1024` から `30 * 1024 * 1024` に引き上げた。Cloudflare Workers のリクエストあたりメモリ制限（128MB）に十分余裕を持たせた値で、`readBodyBytes` がストリームを一括でバッファに載せる実装もそのまま問題なく動作する。併せて `content-length` ヘッダーが `MAX_IMAGE_BYTES` を超える場合はストリームを読まずに `too_large` を即返す事前チェックも追加した（悪意あるサーバーが上限ちょうどのサイズを並列配信してメモリを圧迫する試みを防ぐ）。マジックバイト検証・Cloudflare Cache API による 30 日キャッシュはそのまま維持される。

- **記事全文のページネーション連結が trailing slash 付き URL で効いていなかった問題を修正** — `src/lib/content.ts` の `isPaginatedVariant` パス 3（bare numeric suffix）で `curBase` / `nextBase` を比較する際、WordPress pretty permalink（`/slug/` → `/slug/2/`）の場合に cur 側の pathname 末尾の `/` が剥がれず、next 側（`/2/` 除去後はスラッシュなし）と不一致になっていた。両側とも `/\/$/` で trailing slash を正規化してから比較するよう修正。これにより `<div class="page-links">Pages: ...</div>` 形式（wp_link_pages 出力）の記事でも `appendPaginatedPages` が次ページを検出・連結できるようになる。`e2e/content-extraction.spec.ts` に回帰テスト 2 件追加（WordPress pretty permalink の `/slug/` → `/slug/2/` 検出 / `/slug/2/` → `/slug/3/` 検出）。

### ガード固めたっ

- **RSSHub ACCESS_KEY のクライアント漏洩を修正** — 前コミットの実装では `resolveRSSHubUrl` が変換後 URL に `?key=...` を直接含めていたため、その URL が `users/{userId}/subscriptions.json` / `feeds/{feedHash}/meta.json` に保存され、さらに `assembleClientFeed` 経由で `Feed.url` としてクライアントにも返っていた。これは `RSSHUB_ACCESS_KEY` シークレットがフロントから参照可能になる重大なリーク。`src/lib/rsshub.ts` から key 引数を削除し、代わりに `appendAccessKeyIfRsshub(url, instance?, accessKey?)` を新設して fetch 層 (`src/cron/fetch.ts` の `fetchAndParseFeed` / `fetchAndScrapeWithSelectors`) でのみ動的に付与する設計に変更。保存される URL には key が一切含まれないため、R2 / クライアントへの漏洩が防止される。`appendAccessKeyIfRsshub` はインスタンス host が一致する URL にのみ付与し、既に `key=` を持つ URL には二重付与しない・不正な URL はそのまま返す等の安全弁を備える。`e2e/rsshub.spec.ts` を 33 → 38 ケースに拡張（インスタンス外不付与 / 二重付与防止 / 既存クエリ保持 / URL エンコード / 不正 URL 保護）。

### 激アツ新機能っ

- **RSSHub 連携のオプトアウト機能とセルフホスト ACCESS_KEY サポート** — Issue #109 の追補。RSSHub 変換が強制的に行われていたため、`FeedAddModal` に「RSSHub で自動変換（Twitter / YouTube / GitHub 等）」チェックボックスを追加（デフォルト ON）してユーザー側でオプトアウトできるようにした。さらに、セルフホスト RSSHub インスタンスで `ACCESS_KEY` による認証を使っているケースに対応するため、`RSSHUB_ACCESS_KEY` シークレットを設定すると変換後の URL 末尾に `?key=...`（URL エンコード済み）を自動付与する機能を追加。`src/lib/rsshub.ts` に `getRSSHubAccessKey()` を新設、`resolveRSSHubUrl(url, instance?, accessKey?)` の第 3 引数として access key を受け取れるよう拡張。API 側は `body.useRsshub !== false` のときだけ変換処理を実行する（未指定はデフォルト ON、後方互換）。`useFeedOperations.addFeed` のシグネチャに `useRsshub?: boolean` を追加。`e2e/rsshub.spec.ts` を 33 ケースに拡張（ACCESS_KEY 付与・空文字扱い・URL エンコード・`getRSSHubAccessKey` の環境変数読み取り）。
- **RSSHub 連携による主要サービスの自動 RSS 化** — Issue #109。RSS を提供していない Twitter / X、YouTube チャンネル・ユーザー・`@handle`、GitHub ユーザー / リリース / issue、Instagram、Reddit サブレディット、Bilibili、Zhihu、Pixiv、Weibo、Telegram チャネルの URL を Feed 追加時に自動で [RSSHub](https://docs.rsshub.app/) の対応エンドポイントに変換するようにした。`src/lib/rsshub.ts` に純粋関数 `resolveRSSHubUrl(url, instance?)` / `getRSSHubInstance()` を追加し、`app/api/feeds/route.ts` の POST ハンドラーで URL バリデーション直後に変換を試みる。変換後の URL は再度 `isValidFeedUrl()` で検証してから既存の 3 段階フォールバック探索（RSS link → 手動 CSS セレクタ → LLM 推論）に進む。GitHub の第 1 階層予約語（`marketplace` / `topics` / `features` / `pricing` / `enterprise` / `orgs` 等 34 語）はユーザー名として誤マッチしないようブラックリストで弾く。RSSHub インスタンス URL は `RSSHUB_INSTANCE_URL` 環境変数で上書き可能（未設定時は `https://rsshub.app`）。`e2e/rsshub.spec.ts` に 27 ケース（主要サービス変換 / 予約語ブラックリスト / 大文字小文字 / クエリパラメータ / サブパス / カスタムインスタンス）を追加。

### バグ絶対キルした

- **RSS フィード記事サムネイルの優先順位を修正** — Issue #117。`src/lib/xml-parser.ts` の `extractImage` が `media:thumbnail` を第 1 優先・`media:content` を第 2 優先としていたため、低解像度サムネイルが採用され本来の高解像度画像が使われない事象が起きていた。MRSS 仕様の意図（サムネは `media:content` の小型版を表す要素）および Issue #117 の要求に従い、優先順位を **`media:content`（`medium="image"` または `type="image/*"`）→ `media:thumbnail` → `itunes:image`（新規追加、Podcast 対応）→ `enclosure` → `content/description` 内 `<img>`** に変更。これにより XML から取得できる画像の取りこぼしも減り、`useOgpCache` による `/api/ogp` へのフォールバック問い合わせが更に減少する。`e2e/xml-parser.spec.ts` に 4 ケース（media:content 優先 / media:thumbnail フォールバック / itunes:image 採用 / media:content の medium 未指定時のフォールバック）を追加。

### コードめかし込み

- **`ArticleFilterContext` を新設し ArticleList / ArticleView / FeedSidebar への prop drilling を削減** — Issue #96。`src/contexts/ArticleFilterContext.tsx` を新規追加し、既存の `ReaderSettingsContext` と同じ雛形で `useFilteredArticles` の戻り値 (`FilterState`) + `onSaveFilter` を `ArticleFilter` としてひとまとめに提供するようにした。`src/App.tsx` の `<ArticleFilterProvider value={{ ...filterState, onSaveFilter: saveFilter }}>` で 3 ペイン全体を囲み、`ArticleList` の `filter` prop、`ArticleView` の `globalFilter` / `onSaveGlobalFilter` / `query` / `onSetQuery` / `onSetAuthorFilter` / `onSaveFilter` prop、`FeedSidebar` の `onSaveFilter` prop を削除して `useArticleFilter()` 呼び出しに置き換え。`ArticleView` は `setAuthorFilter` + `showToast` の副作用ラッパーをコンポーネント内ローカル関数として内蔵。dead code になった `onSetAuthorFilter ?` 三項演算子も整理した。挙動変更なし、`e2e/article-filter.spec.ts` (62 ケース) を含む既存テストは全てパス。

### バグ絶対キルした

- **定期的にログアウトされる問題を修正** — Issue #113。0g0-id (`/auth/refresh`) は並列リフレッシュ競合（30 秒以内の rotation 済みトークン再提示）時に HTTP 401 + `{ error: { code: "TOKEN_ROTATED", message: "..." } }` を返す仕様だが、`src/lib/auth.ts` の `refreshTokens` がすべての 4xx を `invalid` として扱っていたため Cookie が削除されログアウト扱いになっていた。複数タブ・タブ復帰時の同時リフレッシュで日常的に発生するため「定期ログアウト」として体感される。レスポンスボディの `error.code` を読み取って `TOKEN_ROTATED` のみ `transient` にして Cookie を保持するよう修正（`TOKEN_REUSE` は従来どおり `invalid`）。`e2e/refresh-tokens.spec.ts` に 4 ケース追加（TOKEN_ROTATED → transient / TOKEN_REUSE / INVALID_TOKEN / TOKEN_EXPIRED → invalid）。
- **srcset 内の URL path に `,` を含む画像が壊れる問題を修正** — Issue #111。`src/lib/content.ts` の `transformSrcset` が単純に `.split(",")` で候補を分割していたため、Cloudinary の `c_limit,f_auto,...` のように変換パラメータ部で生の `,` を path に含む URL が途中で切れ、`/api/image-proxy?url=...` に不正な値が渡って画像が取得できなくなる可能性があった。WHATWG HTML srcset 仕様 (https://html.spec.whatwg.org/#parse-a-srcset-attribute) に寄せたパースに変更し、URL は whitespace を境界とし、URL 末尾の `,` のみを候補区切りとして扱うよう修正。これにより Cloudinary / imgix など path 内にカンマや encoded 文字 (`%2C` / `%3F`) を含む URL でも src / srcset が壊れずに丸ごと proxy へ渡されるようになる。`e2e/content-extraction.spec.ts` に回帰テスト 2 件（encoded delimiter 保持 / srcset 内 URL path `,` 保護）を追加。

### 激アツ新機能っ

- **RSS 取得時の Cache-Control 対応で配信元サーバーへのアクセスを最適化** — Issue #116。`src/lib/fetch.ts` に `parseCacheControl` / `computeNextFetchEarliestAt` を追加し、`src/types.ts` の `SharedFeedMeta` に `cacheControl`（直近レスポンスの生ヘッダー）と `nextFetchEarliestAt`（次回フェッチ可能時刻 ISO 8601）を追加。`src/cron/fetch.ts` の `fetchAndParseFeed` が 200 / 304 いずれの応答でも Cache-Control を保存し、`fetchAndUpdateSharedFeed` の cron 経路では `nextFetchEarliestAt > now` のときフェッチをスキップする。`s-maxage` が `max-age` より優先され、`no-cache` / `must-revalidate` / `no-store` 時は従来どおり毎回サーバー検証する（スキップしない）。クランプ範囲は下限 1800 秒（cron 間隔に一致）〜上限 21600 秒（6 時間）で、過度に短い / 長い指示を緩和する。手動 refresh (`forceRetry=true`) はスキップ対象外。`e2e/cache-control.spec.ts` に 17 ケース（max-age / s-maxage / no-store / no-cache / must-revalidate / 壊れ値 / クランプ境界）を追加。

## 2026-04-19

### バグ絶対キルした

- **記事詳細のコンテンツ幅がペイン幅に連動しない問題を修正** — Issue #80。`src/components/ArticleView.tsx` の外側ラッパーが `max-w-2xl` (672px) にハードコードされていたため、カラムリサイズやフォーカスモードで記事詳細ペインを広げても本文・タイトル・メタ情報が 672px 以上に拡大できず、ユーザー設定の `contentWidth`（narrow/medium/wide/full）も事実上 narrow 以外は効果を発揮しなかった。ラッパーのクラスから `max-w-2xl` を外し、`getContentWidthStyle(contentWidth)` を `style` で適用（`transition-[max-width]` も追加してスムーズに変化）することで、`full` を選択するとペイン幅いっぱいに、`wide` (900px) / `medium` (720px) を選択するとそれぞれ指定幅まで本文を拡大できるようにした。併せて `.article-content` 各出力（translate HTML / translate plain / 本文 / summary）内に重複していた `getContentWidthStyle` 呼び出しを削除し、幅制御を外側ラッパー 1 箇所に一元化した。

### 激アツ新機能っ

- **フィード追加・URL 保存をモーダルダイアログ化** — Issue #115。`src/components/FeedSidebar.tsx` のサイドバー上でインライン展開されていたフィード追加フォーム（URL / Cookie / CSS セレクタ）と URL 記事保存フォーム（ブックマーク / 後で読む）を、汎用 `Modal` コンポーネント (`src/components/Modal.tsx`) を使ったポップアップダイアログに移行。新設した `src/components/FeedAddModal.tsx` / `src/components/SaveUrlModal.tsx` にフォーム JSX を切り出し、Esc キー / オーバーレイクリックで閉じる挙動を Modal 側に一元化。`handleAddFeed` の `canRetryWithSelector` フロー（API 失敗時に CSS セレクタ欄を自動展開）はモーダル表示のまま維持し、既存の state（`newUrl` / `newCookie` / `newCssSelector` / `saveUrl` / `saveError` 等）は親で保持する形で `addFeed` / `handleSaveArticle` の呼び出しロジックは一切変更せず、視覚的なレイアウトのみ差し替えた。
- **フィード一覧の各種メニューを右クリック（コンテキストメニュー）に移行** — Issue #110。`src/components/FeedItem.tsx` のサイドバー上にホバー時だけ現れていた多数のアイコンボタン群（詳細・スター・NSFW・フィルター・カテゴリ・グループ・ミュート・ピン・既読化・更新・再推論・削除）を常時表示の ⋮ ボタンひとつに集約し、さらにフィード項目全体に `onContextMenu` ハンドラを追加してマウス右クリックでカーソル位置にメニューをポップアップさせるようにした。`menuPortalStyle` 計算を「⋮ボタンの `getBoundingClientRect` ベース」から、右クリック由来のときはマウス座標 (`e.clientX` / `e.clientY`)、⋮ボタン由来のときは従来のボタン基準、という二系統に拡張し、どちらの場合も画面端ではみ出さないようクランプしている。編集中 (`editing` / `categoryEditing`) はコンテキストメニューを無効化してテキスト入力側のネイティブメニューを残す。ドラッグ&ドロップ (`draggable` / `onDragStart`) との競合を避けるため `onContextMenu` では `e.preventDefault()` + `e.stopPropagation()` のみで drag API に干渉しない設計。
- **60×60 などの小さい画像を画像一覧・一括ダウンロード対象から除外** — Issue #112。`src/lib/image-extractor.ts` に `MIN_IMAGE_SIZE_PX = 100` を定数追加し、`collectImageUrlsFromHtml` では img タグの `width` / `height` 属性（または `style` の `px` 指定）、`collectImageUrls`（DOM 版）では `naturalWidth` / `naturalHeight` を優先し未解決時は属性にフォールバックする形で、**両辺とも閾値未満**の画像（サイトロゴ / SNS シェアアイコン / スペーサー等）を抽出段階で除外するよう変更。片方しかサイズ情報がない（縦長・横長画像の可能性）ケースや `%` 指定・属性未指定ケースは誤判定を避けて従来通り収集対象に残す。既存の `useImageDownload.fetchOne` の `createImageBitmap` による 100px 未満除外は二重防護として維持。`e2e/image-extractor.spec.ts` に 16 ケース（srcset フォールバック / data URI 除外 / サイズ閾値境界 / 片辺のみ・style・% 指定・混在）を追加。

### バグ絶対キルした

- **access_token 期限切れ時に一瞬ログイン画面へ戻る問題を修正** — 追加依頼。`src/hooks/useAuth.ts` の `checkAuth` で「以前認証済み」かつ `/api/auth/me` が `user: null` を返した場合、即座に `setUser(null)` せず 800ms / 1600ms の指数バックオフで最大 2 回までリトライしてから判定するよう変更。サーバー側 refresh の transient 失敗や JWKS 一時障害・R2 読み取り遅延で偶発的に null が返っても、ユーザーがログイン画面にフラッシュ遷移しなくなる（リロードで復帰できていた挙動を自動化）。`sessionRecoveryAttempts` カウンタは成功時にリセット。既存の `?login=1` 直後リトライ (600ms 単発) とは別の経路。

### メモっといた

- **R2 バックアップ / ディザスタリカバリ手順を追加** — Issue #106。`docs/backup-recovery.md` を新規作成。`rclone` / `aws s3` CLI / `wrangler` CLI を使った R2 バケット全体および選択的バックアップ手法、ユーザー別・フィード別の復旧手順、推奨頻度 (users: 日次 30 日保持 / feeds: 週次 8 週間 / ai-cache: 月次 2 ヶ月 / 全体スナップショット: 月次 12 ヶ月)、DR リハーサル手順、監視観点を記載。実コード (`src/lib/r2.ts` / `src/lib/shared-feed.ts` / `src/lib/feed-groups.ts` / `src/lib/recommendation.ts` / `src/lib/server-auth.ts`) に基づきユーザー別・共有フィード・AI キャッシュの全 R2 キー（クールダウン系含む）を優先度付き表で整理し、`read-state` 復元時のクライアントキャッシュマージ戦略 (ローカル ∪ サーバー、スヌーズは遅い方、ノートはサーバー優先) および cron 停止推奨の運用注意点も補足。`README.md` のデータ構造 (R2) 節から新ドキュメントへリンクを追加した。
- **セットアップ手順の詳細化** — Issue #105。`README.md` のセットアップ節に以下を追記した:
  - **0g0 ID OAuth2 アプリ登録**: 登録先 URL (`https://id.0g0.xyz`)・Callback URL (`{APP_BASE_URL}/api/auth/callback`)・許可スコープ (`openid profile email`) を表形式で明記。
  - **VAPID 鍵生成**: `node scripts/generate-vapid-keys.mjs` の具体的実行コマンドと出力例、Node.js 18.17 以上の要件を記載。
  - **Cloudflare API トークン**: ダッシュボード URL (`https://dash.cloudflare.com/profile/api-tokens`)・必要権限 (Account / Workers AI / Read)・Account ID 取得場所を記載。`CLOUDFLARE_ACCOUNT_ID` を `wrangler.toml` または secret で設定する旨を追加。
  - セットアップ手順全体を 5 ステップから 8 ステップに再構成。

### バグ絶対キルした

- **RSS 1.0 (RDF) フィードで `dc:date` が `pubDate` より優先されない問題を修正** — Issue #99。`src/lib/xml-parser.ts` の RSS 1.0 `publishedAt` 解析が `parseDate(str(item.pubDate) || null) ?? parseDate(item["dc:date"] ?? null)` の順序になっており、pubDate に truthy な非日付文字列（`"not-a-date"` 等）が入っている場合に dc:date が無視される、あるいは fast-xml-parser が dc:date を `{ "#text": ... }` オブジェクト形式で返したときに `str()` を通さず parseDate に渡すことで NaN 扱いになり `publishedAt: null` になる可能性があった。RSS 1.0 では `dc:date`（ISO 8601）が主要な日付フィールドであるため `parseDate(str(item["dc:date"]) || str(item.pubDate) || null)` に変更し、dc:date を優先・pubDate をフォールバックとする順序に揃えた。`e2e/xml-parser.spec.ts` に 2 ケース追加（pubDate と dc:date が両方ある場合の dc:date 優先 / pubDate が無効でも dc:date が有効なら採用）。
- **`GET /api/articles` で `readUserSubscriptions` が二重呼び出しされる問題を修正** — Issue #98。`app/api/articles/route.ts` の default 分岐で `Promise.all` を使って `readUserSubscriptions` と `getUserLatestArticles` を並列化していたが、`getUserLatestArticles` が内部で再度 `readUserSubscriptions` を呼んでいたため `subscriptions.json` が R2 から 1 リクエストあたり 2 回読まれていた。`src/lib/shared-feed.ts` の `getUserLatestArticles` にオプショナルな `subs?: UserSubscription[]` 引数を追加し、呼び出し元が取得済みの subs を渡せるように変更。route.ts 側は subs を先に 1 度だけ `await` し、`getUserLatestArticles(env.RSS_DATA, session.userId, subs)` として渡すよう調整した（`savedArticles` / `readState` の 2 本は引き続き並列）。R2 読み取りが 1 リクエストあたり 1 回に減少し、レイテンシ増加は subscriptions.json が小さいため無視できる範囲。
- **`mergeNewArticles` が変更なしでも毎回 R2 PUT を発生させる問題を修正** — Issue #97。`src/lib/shared-feed.ts` の `mergeNewArticles` で、新規記事ゼロのブランチ（既存記事のメタ更新のみ想定）が既存記事に対して無条件に `changed = true` を立てており、フィールド値に差分がなくても 30 分毎の cron 実行ごとに R2 PUT が発生していた（全フィード分の無駄な書き込み課金）。純関数ヘルパ `isArticleMutated(ex, incoming)` を新設し、`createdAt` を除く全フィールド（配列は JSON.stringify で比較）に差分がある場合だけ `existingMap` を更新して `changed` を立てるように変更。`e2e/shared-feed-merge.spec.ts` に 11 ケース（title/summary/content 差分、createdAt 無視、categories 順序違い、metadata 差分、publishedAt null→値、ogImage/author 差分）を追加。
- **ログインフローの `X-Internal-Secret` 対応と Cloudflare WAF ブロック検知を追加** — Issue #94。0g0-id の issue #156 改善案1（BFF 個別シークレット対応）で `serviceBindingMiddleware` が `INTERNAL_SERVICE_SECRET_USER` / `_ADMIN` / 共有 `INTERNAL_SERVICE_SECRET` による `X-Internal-Secret` 認証を受け付けるようになったのに合わせて、`src/lib/auth.ts` の `authApiHeaders()` に `INTERNAL_SERVICE_SECRET` 環境変数のサポートを追加（設定時のみ `X-Internal-Secret` ヘッダーを付与し、未設定なら従来通り Basic 認証のみで通す）。加えて Cloudflare WAF / Bot Fight Mode による 403 HTML challenge ページ (`Attention Required! | Cloudflare`) を検出する `isCloudflareBlock()` を新設し、`exchangeCode()` ではブロック時に運用者向けヒント付きログを出力、`refreshTokens()` では 403 + Cloudflare HTML を `invalid` ではなく `transient` 扱いに変更してユーザーを意図せずログアウトさせないようにした。`exchangeCode` / `refreshTokens` のレスポンスログに `cf-ray` ヘッダーも出力しトラブルシューティングを容易化。`e2e/auth-headers.spec.ts` に 10 ケース（`isCloudflareBlock` 判定 5 ケース、`X-Internal-Secret` 送出制御 2 ケース、exchange/refresh での Cloudflare 応答処理 3 ケース）を追加。

### メモっといた

- **feed-groups API エンドポイントを README / architecture.md に追記** — Issue #104。実装済みの `app/api/feed-groups/` ルートがドキュメント化されていなかったため、`README.md` に「フィードグループ」セクション（`GET/POST /api/feed-groups` と `PATCH/DELETE /api/feed-groups/:id` の仕様表、レスポンス型 `FeedGroup`、POST 時の order 自動採番、グループ上限 100 件 / 名前 50 文字 / ユーザー内重複不可の制約、DELETE 時の orphan 許容設計）と API エラーレスポンス一覧にフィードグループのエラーコード表（`INVALID_NAME` / `DUPLICATE_NAME` / `FEED_GROUP_LIMIT_EXCEEDED` / `FEED_GROUP_NOT_FOUND` / `INVALID_ORDER` / `INVALID_COLLAPSED` / `INVALID_MUTED`）を追加。`.claude/rules/architecture.md` には全体像の API マップに `/api/feed-groups/*` を追記し、ディレクトリ構造に `app/api/feed-groups/` と `src/lib/feed-groups.ts` を記載、hooks 一覧に `useFeedGroups.ts` を追加、「フィードグループ操作」のデータフローサブセクションを新設、R2 データ構造に `users/{userId}/feed-groups.json` を追記した。
- **DBSC 導入調査レポートを追加** — Issue #77 の調査タスクとして `docs/research/dbsc-investigation.md` を新規作成。Chrome 146 (2026-04-09) で Windows 向け DBSC が本格有効化された最新状況、W3C Editor's Draft (2026-04-17) の仕様サマリー、現状の認証実装 (`src/lib/server-auth.ts` の `setTokenCookies()` / `COOKIE_OPTS` — HttpOnly+Secure+SameSite=Lax, access_token 900 秒 / refresh_token 30 日) との整合性、DBSC 適用時に必要な改修箇所（認証サーバー `id.0g0.xyz` 側が主実装、本リポジトリは passthrough のみ）、Firefox/Safari/Chrome macOS・Linux 未対応のカバレッジ不足を整理。結論として「現時点では待ちが妥当」とし、Chrome macOS/Linux が stable 到達するタイミング (推定 2026 年後半〜2027 年) での再評価を推奨。

### 激アツ新機能っ

- **フィードのドラッグ&ドロップでグループから外す操作を追加** — Issue #67 の残タスク「ドラッグ&ドロップでグループ移動」を完了。既存のグループへのドラッグ&ドロップ（追加／別グループへ移動）に加えて、グループ所属フィードをドラッグしたときだけ「グループから外す」ドロップゾーンが破線枠で現れるようにした。`src/lib/feed-group-drop.ts` を新規作成して `resolveFeedGroupDrop(feedId, targetGroupId, feeds)` 純関数を切り出し、feed 不在／同一グループ／同一 ungrouped の場合に no-op 判定を行う。`FeedSidebar` の `handleDropFeedOnGroup` を `groupId: string | null` 対応に変更し、`FeedGroupsSection` の `onGroupDrop` prop 型も `string | null` に拡張。`e2e/feed-group-drop.spec.ts` に 6 ケース（feed 不在 / 同一グループ / ungrouped→ungrouped / グループ間移動 / グループ→ungrouped / ungrouped→グループ）を追加。

### バグ絶対キルした

- **記事詳細の画像が中途半端なサイズ・アスペクト比崩れで表示される問題を修正** — Issue #86。`src/lib/content.ts` の `fixImageDimensions` が元 HTML の `width` / `height` 属性を無条件に削除しており、ブラウザが aspect-ratio を推論できずに画像読み込み中の layout shift やアスペクト比崩れ・中途半端な表示サイズが発生していた。width/height 両方が数値かつ両方 ≥ 16px (favicon 最小サイズ基準) の場合は属性を保持しブラウザに `aspect-ratio: attr(width) / attr(height)` 相当を自動適用させるよう変更（ダミー 1x1 プレースホルダや片方のみの属性は従来どおり削除）。style 内の固定 `width:` / `height:` は引き続き削除してコンテナからの溢れを防ぐ。併せて `app/globals.css` の `.article-content img` から `width: auto !important` を削除し `height: auto !important` を `height: auto` (非 important) に変更。これで HTML 属性の width/height が CSS で打ち消されず、ブラウザが aspect-ratio を推論できるようになる。コンテナ超過時は従来通り `max-width: 100% !important` で縮小し `height: auto` で高さも比例縮小する。`e2e/content-extraction.spec.ts` の `fixImageDimensions` describe に 4 ケース（意味のある属性保持・ダミー削除・片方のみ削除・style 内固定値削除）を追加。

### ガード固めたっ

- **CSRF 対策として Origin/Referer 検証を `withSession` に追加** — Issue #101。0g0 ID の HttpOnly JWT cookie は `SameSite=Lax` で保護されていたが、Lax は top-level navigation で cookie を送出するため `<form method=POST>` による CSRF を完全には防げなかった。`src/lib/csrf.ts` に純粋関数 `isCsrfViolation(req, appBaseUrl)` を新設し、`src/lib/server-auth.ts` の `withSession` / `withBinarySession` が POST/PUT/PATCH/DELETE リクエスト時に Origin または Referer の origin が `APP_BASE_URL` と一致することを検証するよう変更。不一致時は `403 { code: "CSRF_ORIGIN_MISMATCH" }` で拒否する。設計上の決定: (1) Origin ヘッダーがある場合は Origin のみで判定し Referer にフォールバックしない（`Origin: null` + 正規 Referer による bypass を防ぐ）、(2) `APP_BASE_URL` 未設定時は fail-closed で違反扱い（本番での silently disable を防ぐ）、(3) GET/HEAD/OPTIONS は safe method として検証対象外。`withSession` のシグネチャが `(req, handler)` に変更されたため、全 31 個の Route Handler (`app/api/**/route.ts`) の呼び出し箇所を更新し Request オブジェクトを第一引数で渡すよう修正。`e2e/csrf-origin.spec.ts` に 49 ケース（安全/更新系メソッド別の一致/不一致/欠落/null origin/bypass 試行・fail-closed 検証・scheme/port/subdomain 境界条件）を追加。`e2e/api-health.spec.ts` にも別オリジンからの POST が 403 で弾かれる統合テストを追加。テスト時の localhost:3000 向け APP_BASE_URL 上書きは `playwright.config.ts` の `webServer.env` で設定。
- **JWT 検証に `aud` / `iss` クレームチェックを追加** — Issue #100。`src/lib/auth.ts` の `verifyJwt` が従来は署名と `exp` のみ検証しており、`aud` (audience) / `iss` (issuer) クレームを確認していなかったため、同じ 0g0 ID の別オーディエンス／別イシュアー向けトークンを取得した攻撃者が `rss.0g0.xyz` で再利用できる可能性があった。ペイロード検証ステップに `payload.iss === authBaseUrl` の厳密一致チェックと、`payload.aud` が `process.env.CLIENT_ID` を含むこと（文字列/配列両対応）のチェックを追加。JWKS 取得より前に実行することで、不正トークンは早期に弾かれネットワークコストも削減できる。`JWTPayload` インターフェースに `iss?: string` / `aud?: string | string[]` を追加。`e2e/jwt-aud-iss.spec.ts` に 7 ケース（iss 欠落 / iss 不一致 / aud 欠落 / aud 不一致 文字列 / aud 配列に含まれない / CLIENT_ID 未設定 / exp 期限切れ回帰 / シェイプ不正）を追加。
- **vite-plus path traversal 脆弱性を修正** — Dependabot alert #28 (severity: high, `vite-plus/binding` の `downloadPackageManager()` が `VP_HOME` 外にファイルを書き出せる path traversal 脆弱性) を解消。`package.json` は既に `^0.1.18` に更新済みだったが `package-lock.json` の解決バージョンが 0.1.14 のままだったため、`npm install` で lock ファイルを更新し `vite-plus` / `@voidzero-dev/vite-plus-core` など関連パッケージをすべて 0.1.18 に揃えた。

### コードめかし込み

- **Cloudflare Cache API の重複パターンを `src/lib/cache-helper.ts` に集約** — Issue #95。`app/api/content/route.ts` / `app/api/image-proxy/route.ts` / `app/api/ogp/route.ts` の 3 ルートで手書きされていた `caches.default.match(cacheKey)` と `new Response(JSON.stringify(...), { headers: ... })` のパターンを共通ヘルパーに統一した。新規モジュール `src/lib/cache-helper.ts` に `buildCacheKey` / `cachePutAsync`（旧 `src/lib/r2.ts` から移設）/ `matchCfCache`（HIT → Response / MISS → null に正規化）/ `buildJsonCacheResponse`（Content-Type + Cache-Control を付与した JSON キャッシュエントリ Response 構築）を配置。`r2.ts` は R2 永続ストア専用に責務を絞り、Cache API 関連 export を削除した（`.claude/rules/caching.md` の方針どおり）。`src/lib/fetch-article-content.ts` と 3 ルートの import を `@/lib/r2` から `@/lib/cache-helper` に差し替え、`saveContentToCache` / ogp route の Response 構築も `buildJsonCacheResponse` 経由に置換。`e2e/cache-helper.spec.ts` に 6 ケース（`buildCacheKey` の `/__cache/{type}/{hash}` 形式 / type ごとの名前空間分離 / 決定論、`buildJsonCacheResponse` のヘッダー設定 / JSON シリアライズ / 可変 TTL）を追加。`.claude/rules/caching.md` のサンプルコードも新ヘルパー利用版に更新した。
- **画像抽出ロジックを専用モジュール `src/lib/image-extractor.ts` へ集約** — Issue #108。`src/lib/article-utils.ts` 内の `bestSrcFromSrcset` / `isCollectableUrl` / `collectImageUrlsFromHtml` / `collectImageUrls` は記事画像抽出に特化した責務で、主要呼び出し元は `src/components/ArticleView.tsx` と `src/hooks/useImageDownload.ts` の 2 箇所に限られていた。`article-utils.ts` の責務を日本語判定・読了時間・日付比較・UI サイクル定数などの記事メタ系に絞るため、画像抽出系 4 関数を新モジュール `src/lib/image-extractor.ts` に移設し、`article-utils.ts` からは export を削除。呼び出し元 2 ファイルは `import { collectImageUrls(FromHtml) } from "../lib/image-extractor"` に差し替え。動作ロジックは変更なし（純粋リファクタ）。

## 2026-04-18

### ガード固めたっ

- **code-scanning alert 残存 1 件を修正** — `src/lib/content.ts` の `detectNextPageUrl` 内 `<a>` タグ内テキスト抽出（`m[2].replace(/<[^>]+>/g, "").trim()`）が CodeQL の `js/incomplete-multi-character-sanitization` (severity: high) に残存していた不具合を修正（Issue #78 追従）。既存ヘルパ `replaceUntilStable` を用いて不動点反復に置き換え、`<<a>a>` のような再結合バイパス入力でもタグ片が正しく除去されるようにした。この `text` は数字リテラルとの `===` 比較にしか使われず直接の XSS 経路ではないが、ファイル内の他のタグ除去処理と同じパターンに揃えた。

- **code-scanning alerts を一括修正** — GitHub Advanced Security の CodeQL スキャンで検出された 19 件の警告を修正（Issue #78）。`js/incomplete-multi-character-sanitization` / `js/bad-tag-filter` / `js/incomplete-url-scheme-check` / `js/incomplete-sanitization` / `js/incomplete-url-substring-sanitization` / `actions/missing-workflow-permissions` を網羅的に対応した。`src/lib/html.ts` の `sanitizeHtml` を不動点反復（最大 8 パス）に変更し `<scr<script></script>ipt>` のようなネスト再出現バイパスを潰した。すべての閉じタグ正規表現を `<\/tag\s*>` から `<\/tag\b[^>]*>` に変更し HTML5 仕様どおり `</script foo>` や `</script\t\n bar>` のような属性付き閉じタグも受容するようにした。`src/lib/content.ts` に `replaceUntilStable` ヘルパを追加して `preClean` / `stripPageChrome` / `isContentSufficient` / 画像スライダー判定を不動点反復化し、`resolveScriptLoadedImages` の script end tag 正規表現も修正した。`resolveRelativeUrl` および `detectNextPageUrl` / `llm-feed-generator.ts` の URL スキームチェックに `vbscript:` / `mailto:` / `file:` / `data:` を追加した。`xml-parser.ts` の JSON Feed バージョン検出を `version.includes("jsonfeed.org")` から URL パース + hostname 完全一致に変更し `https://evil.example/?x=jsonfeed.org` 形式のなりすましを遮断した。`useKeyboardNav.ts` / `ShareMenu.tsx` の Markdown ラベルエスケープを `[[\]]` から `[\\[\]]` に変更し、バックスラッシュのエスケープ漏れによる二重エスケープ崩れを修正した。`.github/workflows/ci.yml` に `permissions: contents: read` を追加し GITHUB_TOKEN 権限を最小化した。`e2e/sanitize-html.spec.ts` に閉じタグ属性バイパスとネスト再出現バイパスの回帰テストを 5 ケース追加した。

### バグ絶対キルした

- **Color Me Shop (shop-pro.jp) 商品ページで画像一覧が生成されない問題を修正** — 商品画像が `<form>` 配下の `<div class="p-product-img__main-item">` に格納されており、Readability が `<form>` 内を本文外と判定してギャラリーが完全に除去される不具合を修正（Issue #82）。`src/lib/content.ts` の `extractThumbListImgs` に Color Me Shop の BEM クラス (`p-product-img__main-item`) パターンを追加し、Readability の結果末尾に hidden div として商品画像を付与するようにした。クライアント側の画像一覧（ImageGallery）が DOM からこれらの画像を拾える。`e2e/content-extraction.spec.ts` に shop-pro.jp 相当の HTML で画像 3 枚が hidden div に追加されることを検証する 2 ケースを追加。

- **ログイン時のトークン交換失敗を修正（Cloudflare WAF bot 検知によるブロック）** — `id.0g0.xyz` の Cloudflare WAF / Bot Fight Mode が Worker-to-Worker fetch を bot 扱いして 403 (Attention Required) を返し、`/auth/exchange` が成功しない不具合を修正。`src/lib/auth.ts` に `authApiHeaders()` ヘルパを追加し、`exchangeCode` / `refreshTokens` / `revokeToken` すべての fetch に `User-Agent: rss-reader-bff/1.0 (+https://rss.0g0.xyz)` と `X-BFF-Origin: https://rss.0g0.xyz` を付与して BFF として正しく識別されるようにした。以前は `Content-Type` と `Authorization: Basic` のみで無名の fetch に見えていた。

- **認証エラー時の診断情報を改善** — `exchangeCode` / `/api/auth/callback` で認証失敗時に `console.error` で詳細（HTTP ステータス・レスポンス本文先頭 500 byte・redirect_to）を出力。`CLIENT_ID` / `CLIENT_SECRET` が未設定の場合は専用メッセージでログする。エラー画面もトップページへの戻りリンクを含む構造化 HTML に変更。Cloudflare Workers 側の原因切り分け（secrets 未設定 / redirect_uri 不一致 / code 再利用 / 上流 5xx）を容易にする。

- **認証コールバックのエラーメッセージが文字化けする問題を修正** — `/api/auth/callback` が state 不一致・トークン交換失敗・トークン検証失敗時に返す HTML の `Content-Type` に charset が付いていなかったため、ブラウザが Shift_JIS 等で解釈して「認証エラー: トークン交換失敗」が「隱崎ｨｼ繧ｨ繝ｩ繝ｼ: 繝医�繧ｯ繝ｳ莠､謠帛､ｱ謨�」のように文字化けする不具合を修正。`Content-Type` を `text/html; charset=utf-8` に変更し、レスポンス本文冒頭に `<!doctype html><meta charset="utf-8">` を追加。

### 激アツ新機能っ

- **ユーザー設定モーダル** — サイドバーフッターにギアアイコンを追加し、フォントサイズ／フォント／行間／コンテンツ幅／両端揃え／自動既読（閾値 70-90%）を 1 画面で変更できるダイアログを追加（Issue #79）。変更はプレビュー領域にリアルタイム反映され `localStorage` に即時永続化される。`src/components/UserSettingsModal.tsx` を新規追加し、`ReaderSettingsContext` に `lineHeight` / `contentWidth` / `textJustify` / `onChangeAutoReadThreshold` を追加して ArticleView のローカル state を `useUIState` に集約。これに伴い記事詳細ヘッダー右側にあった表示設定の個別トグルボタン群（フォントサイズ A／フォントファミリー ゴ・明・等／行間／幅／均等／自動既読）を削除しツールバーをスッキリさせた — 設定変更はすべてユーザー設定モーダルに集約される。

### バグ絶対キルした

- **ページングされた記事の 2 ページ目以降を取得できない問題を修正** — `rel="next"` を持たず `<a href=".../2">2</a>` のような数字テキストリンクだけでページングするサイト (denfaminicogamer 等) で、2 ページ目以降の本文が全文取得に含まれない不具合を修正（Issue #87）。`src/lib/content.ts` の `isPaginatedVariant` に判定ルール 3 を追加し、bare numeric suffix (`/slug` → `/slug/2`) パターンを検出するようにした。`/post/123` → `/post/124` のような連番記事 ID や `/2025/01` → `/2025/02` のような日付アーカイブとの誤検知を防ぐため、base 最終セグメントが「記事 slug らしい」(数字含む or ハイフン/アンダースコア含む or 8 文字以上 かつ 純数字でない) 場合のみ許容する `lastPathSegmentLooksLikeSlug` ヘルパーを追加。`detectNextPageUrl` には `rel="next"` 不在時のフォールバックを追加し、URL から現在ページ番号を推定（新規 `detectCurrentPageNumber`）したうえで、テキストが「currentPage + 1」と完全一致する `<a>` タグの href を `isPaginatedVariant` で検証して採用する。`e2e/content-extraction.spec.ts` の `detectNextPageUrl` describe に denfaminicogamer 相当 / ページ 2→3 / 連番 ID 誤検知なし / 別記事除外 / 本文中数字リンク除外 / 日付アーカイブ誤検知なし の 6 ケースを追加。

### 激アツ新機能っ

- **コンテンツ幅に `wide` (900px) を追加** — 記事詳細の領域幅を広げても（フォーカスモード起動や 3 ペイン境界のリサイズ時）本文の `maxWidth` が `narrow:640px` / `medium:720px` / `full:none` の 3 段階しかなく、`medium` から `full` へ飛ぶと急激に全幅まで広がってしまい中間帯を選びづらい問題を解消（Issue #80）。`src/lib/reader-settings.ts` の `ContentWidth` に `wide` を追加し、サイクル順を `narrow → medium → wide → full → narrow` に拡張。ラベル表示（ArticleView の幅トグルボタン）も `900` に対応。`e2e/reader-settings.spec.ts` の `CONTENT_WIDTH_CYCLE` 長さアサートを 3 → 4 に更新。

### バグ絶対キルした

- **Zenn 記事の埋め込み URL が消える問題を修正** — Zenn 本文中の `<span class="zenn-embedded zenn-embedded-card|tweet|mermaid">` が Readability に「本文外」と判定されて span ごと削除され、`postProcess` 内の `transformZennLinkEmbeds` / `transformZennMermaidEmbeds` が走る前に消えてしまう不具合を修正（Issue #88）。`src/lib/content.ts` の `extractMainContent` で `extractWithReadability` 実行前に Zenn 埋め込み変換を適用し、Readability 通過時には iframe を含まない `<p><a>` / `<pre><code>` 形式になっているため、本文判定ロジックが要素を保持するようになった。`postProcess` 側の同変換は冪等なため regex フォールバック経路の安全網として残している。`e2e/content-extraction.spec.ts` に Readability 経由でも card / tweet / mermaid 埋め込みが本文に保持されることを検証する 3 ケースを追加。

- **x.com / twitter.com の OGP を vxtwitter.com 経由で取得** — Twitter / X は bot 向けに OGP メタタグを返さないため、記事に該当 URL を含めても OGP プレビューが空になる不具合を修正（Issue #89）。`src/lib/ogp.ts` に `normalizeOgpFetchUrl(url)` を追加し、`x.com` / `www.x.com` / `mobile.x.com` / `twitter.com` / `www.twitter.com` / `mobile.twitter.com` を OGP 互換プロキシ `vxtwitter.com` に差し替えてから fetch する（hostname 完全一致で判定するため `x.com.evil.example` のような偽装ホストは対象外）。`fetchPageOgpMeta` 経由の呼び出し（`/api/ogp` / `/api/articles/save`）すべてに適用。置換対象・不正入力・他ホスト素通りを検証する 12 ケースを `e2e/ogp-url-normalize.spec.ts` に追加。

- **コードハイライトが一瞬で外れる問題を修正** — `<pre><code>` に highlight.js で付与された `.hljs` class が、React の `dangerouslySetInnerHTML` 再代入や他の副作用 hook（`useContentLinkPreviews` 等）による DOM 書き換えで剥がれ、色付けが一瞬で消えてしまう不具合を修正（Issue #83）。`src/components/ArticleView.tsx` の `processedContent` を `useMemo` でメモ化し、`rawContent / embedInfo / theme` が変わらない限り同一文字列を返すようにして不要な innerHTML 再代入を抑止。さらに `src/hooks/useSyntaxHighlight.ts` に `MutationObserver` を追加し、コンテナ subtree 変更時は `pre code:not(.hljs)` を自動で再ハイライトするようにした。`hljs.highlightElement` 自身の mutation によるループを避けるため、適用時は observer を `disconnect → applyMissing → observe` でサンドイッチし、大量の DOM 変更時は `queueMicrotask` でバッチ化する。

- **幅調整バーのポップアップ対応漏れを追補** — Issue #81 の初版修正で拾えていなかった未ポートアル系のインラインモーダル（`ArticleView` の画像ダウンロード確認モーダル / `ImageGallery` の全画面ライトボックス / `SelectionExcludePopup`）にも `usePopupLock` を追加。さらに `e2e/modal-popup-lock-coverage.spec.ts` に静的検査テストを追加し、`fixed inset-0 z-5*` のフルスクリーンオーバーレイを持つコンポーネントは `usePopupLock` / `usePortalMenu` のいずれかを呼ぶことを CI で強制することで、今後のモーダル追加時の漏れを防ぐ（Issue #81 再発防止）。

- **幅調整バーがポップアップ表示中も操作できる問題を修正** — 記事一覧 / フィード一覧 / 記事詳細の 3 ペイン境界にある幅調整バーが、モーダル・ドロップダウン表示中も pointer イベントを受けてドラッグできてしまい、オーバーレイより手前に見えてしまう不具合を修正（Issue #81）。`src/lib/popup-lock.ts` にグローバルなポップアップ表示数カウンタを追加し、`src/hooks/usePopupLock.ts`（`usePopupLock(active?)` / `useHasOpenPopup()`）を経由して登録・購読できるようにした。`Modal`（`FeedDetailModal` / `FeedFilterModal` / `KeyboardShortcutsModal` / `ReadingStatsModal` / `ReleaseNotesModal` / `SnoozeModal` が共通利用）、`FeedQuickSwitchModal`、`usePortalMenu`（`FilterMenu` / `GlobalFilterMenu` / `ShareMenu` / `SnoozeMenu` など）、および `FeedItem` のコンテキスト／ミュート／グループ移動メニューが表示中はロックを立てる。`App.tsx` のリサイズハンドルは `useHasOpenPopup()` を監視し、`z-[5]`（従来 `z-20`）へ引き下げたうえで表示中は `pointer-events-none` + `opacity-0` + `aria-hidden` を付与して操作不可にする。`e2e/popup-lock.spec.ts` にカウンタ増減・冪等性・通知購読の 6 ケースを追加。

### 激アツ新機能っ

- **フィードグループ化 Step 6 — ドラッグ&ドロップでグループ移動** — `FeedItem` の最外 `<div>` に `draggable` + `onDragStart`（`dataTransfer` に `application/x-rss-feed-id` でフィードIDを格納）/ `onDragEnd` を実装。`FeedSidebar` 本体に `draggedFeedId` / `dragOverGroupId` ステートを持たせ、`FeedGroupsSection` のグループ行ラッパー `<div>` に `onDragOver`（`preventDefault` + `dropEffect="move"`）/ `onDragLeave`（`relatedTarget` の `contains` チェックで子要素へのバブルを無視）/ `onDrop`（`feedId` を取り出して既存 `onSetGroupFeed(feed, group.id)` にルーティング）を追加。ドロップ先は `ring-2 ring-inset ring-text-muted` でハイライト、ドラッグ中のフィード行は `opacity-40` で視覚化。同じグループに属するフィードのドロップは早期リターンで API 呼び出しをスキップ。新 API は追加せず既存 `PATCH /api/feeds/:id`（`groupId`）を流用。編集中（タイトル・カテゴリ）はドラッグを抑止。キーボード/タッチ操作は既存の `FeedItem` コンテキストメニュー「グループに移動」がフォールバックとして引き続き利用可能（Issue #67 Step 6）。

- **依存関係更新の自動化** — Dependabot 設定 (`.github/dependabot.yml`) にエコシステム別のグルーピング（typescript / cloudflare / nextjs / tailwind / testing / build / content-libs）と日本語コミットプレフィックスを追加し、毎週月曜 09:00 JST に集約された PR が起票されるようにした。CI ワークフロー (`.github/workflows/ci.yml`) で master push と PR 時に `pnpm install --frozen-lockfile` → `pnpm run check` → `pnpm run typecheck` を実行。Dependabot auto-merge ワークフロー (`.github/workflows/dependabot-auto-merge.yml`) は patch / minor を CI 通過後に自動 squash マージし、major はコメントのみで人手レビューを必須にする。GitHub Actions 自体も同 Dependabot 設定で更新対象に含める。

- **認証不要のデモページ `/demo` を追加** — 0g0 ID ログイン必須だったためデザイン／動作確認に毎回ログインが必要だった問題を解消。`/demo` にアクセスすると fetch インターセプターが `/api/*` をすべてモックレスポンス（固定のユーザー・フィード・記事・グループ・読み取り状態）に差し替えた状態で本物の `App` コンポーネントを描画する。デモ用に追加した実装ファイルは `app/demo/page.tsx` / `app/demo/DemoApp.tsx` / `app/demo/mock.ts` のみ — アプリ本体には一切の条件分岐を入れていないため、デモモードが本番描画ロジックに影響しない。`window.fetch` の置き換えは HMR / ページ再読み込みに耐えるよう `globalThis.__demoFetchOriginal` に native fetch を一度だけ保存、インターセプター内で `window.location.pathname.startsWith("/demo")` を毎回確認し、クライアントサイドナビゲーションで他パスに出た瞬間からは本物の API レスポンスを通す設計。`.playwright-mcp/` / `demo-*.png` を `.gitignore` に追加。

### バグ絶対キルした

- **サイドバーのヘッダー要素見切れを修正** — PC 表示時に「ブックマーク」「後で読む」「いいね」等の特殊ビュー行がラベル長 / スクロールバー出現時に見切れて機能として使えなくなる問題を修正。`SpecialViewButton` のラベル span に `truncate min-w-0`、カウント span に `flex-shrink-0` を付与し、`justify-between` と組み合わせても確実にカウントが末尾に残るようにした（`gap-2` も追加）。「すべて」行も同様の構成に揃え、ラベル側を優先して縮める挙動に統一。`nav` コンテナに `overflow-x-hidden` を追加し、子要素の意図せぬ横オーバーフローを抑止。

### 激アツ新機能っ

- **フィードグループ化 Step 5 — グループ選択 & 未読フィルタ統合** — サイドバーのグループ名をクリックすると、そのグループに所属するフィードの記事のみが記事一覧に表示される。既存の `u`（未読のみ）キーショートカットと組み合わせることで「現在選択中のグループの未読だけ」を表示できるようになる。`src/lib/article-filter.ts` の `ArticleFilterOptions` に `groupFeedIds?: Set<string>` を追加し、`buildFeedPredicate` を拡張（feedId が未指定でグループが選択されていれば `feedHash ∈ groupFeedIds` のみ残す）、`buildMutedFeedPredicate` はグループ選択時も適用をスキップ（ミュート済みグループを明示的に選択した場合は記事を表示する）。`src/hooks/useFilteredArticles.ts` は `groupFeedIds` を受け取り `filterAndSortArticles` に渡す — グループ切り替え時はページ・検索クエリ・著者／カテゴリフィルターをリセット。`App.tsx` は `selectedGroupId` state を追加（URL クエリ `?group=<id>` に同期）し、選択中グループの `groupFeedIds` を `useMemo` で事前計算。`onSelectFeed` / `onSelectGroup` は相互排他（片方を選ぶと他方はクリア）、記事リストの「すべて既読」はグループ選択中は `markBulkRead(groupIds)` にルーティング。`FeedSidebar` のグループ行は折りたたみ用チェブロンとグループ名ボタンを分離し、グループ名クリックで選択／再クリックで解除、`aria-pressed` 反映。削除済みグループが選択中の場合は自動で解除する（Issue #67 Step 5）。
- **フィードグループ化 Step 4 — グループ単位ミュート機能** — グループを「ミュート」することで、そのグループに所属するフィードの記事を「すべての記事」ビューから除外できるように拡張。`src/types.ts` の `FeedGroup` に `muted?: boolean` を追加し、`PATCH /api/feed-groups/:id` に `muted` バリデーションブロックを追加（既存の `collapsed` と同じ boolean チェックパターン）。クライアントは `useFeedGroups` に `setMuted(id, muted)` を追加 — `setCollapsed` と同一の楽観的更新＋失敗時ロールバックパターンで実装。`App.tsx` の `mutedFeedIds` useMemo を拡張し、既存の `f.mutedUntil` ベースのフィード単位ミュートに加えて `muted` グループに所属するフィードの ID も同 `Set` に追加（deps に `feedGroups` を追加して stale closure を防止）。`FeedSidebar` のグループ行アクションには hover 時に現れる「ミュート」ボタン（音量付きスピーカーアイコン）と、ミュート中は常時表示される「ミュート解除」ボタン（斜線付きスピーカーアイコン）を追加。ミュート中はグループ名を `text-faint italic` で視覚的に識別できるようにした。記事フィルタリング側のロジック変更は不要 — 既存 `buildMutedFeedPredicate` が `mutedFeedIds` をそのまま解釈するため、`feedId === null`（すべての記事ビュー）でのみ自動的にミュート対象が除外される挙動となる（個別フィード選択時は従来どおり表示される）。新 API は追加せず既存 `PATCH /api/feed-groups/:id` を流用（Issue #67 Step 4）。

- **フィードグループ化 Step 3 — グループ内一括既読化 & 並び替え UI** — 各グループ行の hover アクションに「グループ内一括既読化」（✓ アイコン）と「上へ / 下へ移動」（▲ / ▼ アイコン）を追加。一括既読化は `App.tsx` でグループ所属 feedId を `Set` に詰めて `articles` を 1 パスで集約し、既存 `markBulkRead(ids)` を 1 回だけ呼ぶ実装（per-feed の `markAllRead` ループによる O(N×M) スキャンを回避）。並び替えは `useFeedGroups` に `reorderGroup(id, direction)` を追加し、隣接グループと order を楽観的にスワップしたうえで既存 `PATCH /api/feed-groups/:id`（order）を 2 本順次送信。失敗時は `/api/feed-groups` を再 fetch して真の状態に戻す（片側のみ成功した不整合ケースに対応）。新 API は追加していない（読み取り側は既存 `/api/read-state` のデバウンス書き込み、並び替えは既存 PATCH を流用）。一括既読化ボタンは `groupUnread > 0` のときのみ、移動ボタンは先頭・末尾では非表示。アクション群は `group-hover` に加え `group-focus-within` でも表示してキーボードアクセスに対応（Issue #67 Step 3）。

- **フィードグループ化 Step 2 — サイドバー UI 統合** — Step 1 で導入したバックエンド API に対応するクライアント側の UI を実装。`src/hooks/useFeedGroups.ts` を新設しログイン後に `GET /api/feed-groups` を取得、`POST / PATCH / DELETE` を薄くラップして作成・名前変更・折りたたみ保存（楽観的更新＋失敗時ロールバック）・削除を提供。`FeedSidebar` にユーザーグループ専用セクションを追加 — セクションヘッダーに「+」ボタンで新規作成、各グループ行は折りたたみトグル（サーバー側 `collapsed` に永続化）・ホバー時に現れる名前変更／削除アイコンを持ち、折りたたみ時は未読数 or フィード数を右端に表示。フィード側は `FeedItem` のコンテキストメニューに「グループに移動」項目を追加し、ポータル表示のサブメニューで既存グループ一覧＋「グループなし」から選択可能（現在所属にはドット表示）。`groupId` が有効なグループを指すフィードはグループセクションに並び、それ以外は従来のカテゴリ／未分類レイアウトに流れる（orphan `groupId` は無害に無視）。E2E（`e2e/api-health.spec.ts`）に `PATCH / DELETE /api/feed-groups/:id` の未認証 401 ガードを追加（Issue #67 Step 2）。
- **フィードグループ化 Step 1 — データモデル & バックエンド API** — 複数フィードをユーザー定義のグループ（例: `My Tech Blogs` / `News`）にまとめるための基盤を導入。`src/types.ts` に `FeedGroup` 型（`id` / `name` / `order` / `collapsed?` / `createdAt`）を追加し、`UserSubscription` / `Feed` / `FeedPatchPayload` に `groupId?: string` を追加。R2 ストレージは `users/{userId}/feed-groups.json` を新設し、ヘルパー (`src/lib/feed-groups.ts`: `readFeedGroups` / `writeFeedGroups` / `feedGroupsKey` + 定数 `MAX_FEED_GROUPS_PER_USER=100` / `FEED_GROUP_NAME_MAX_LENGTH=50`) を追加。API エンドポイントは 4 本を新設 — `GET /api/feed-groups`（order 昇順で一覧）、`POST /api/feed-groups`（name 重複チェック・100件上限・`crypto.randomUUID` で ID 生成・201 返却）、`PATCH /api/feed-groups/:id`（name / order / collapsed を部分更新・重複チェック・order は整数のみ）、`DELETE /api/feed-groups/:id`（先にグループを削除してから所属購読の groupId をクリア → orphan 寄りの失敗モードに倒すことで復旧容易）。既存 `PATCH /api/feeds/:id` にも `groupId` 受付を追加（null でクリア、文字列なら実在グループ ID の存在チェック）。UI 統合は Step 2 で別途対応。E2E（`e2e/api-health.spec.ts`）に未認証時 401 ガードを追加（Issue #67 Step 1）。

### コードめかし込み

- **ArticleView コンポーネントの責務分離（Step 3: カスタム hook 分離）** — `src/components/ArticleView.tsx` 内に散在していた副作用ロジックを 6 つのカスタム hook に抽出し、本体を 1556 → 1368 行（-188 行）に縮小。追加した hook: `useArticleNote`（メモ編集ステート）/ `useArticleAiRatings`（AI 評価ボタン状態＋原文/翻訳タブ切替）/ `useArticleHighlight`（検索クエリ DOM ハイライトの注入・クリーンアップ）/ `useSyntaxHighlight`（highlight.js 遅延適用）/ `useMathRender`（KaTeX 遅延レンダリング）/ `useSliderGallery`（画像スライダーへの prev/next ボタン＋ホイール横スクロール注入）。各 hook は元実装と同じ deps ・依存関係を保ち、挙動変更なし（Issue #65 Step 3）。
- **ArticleView コンポーネントの責務分離（Step 2: Props の Context 集約）** — `ArticleView` が受け取っていた表示設定系 Props 11 個（`fontSize` / `onChangeFontSize` / `fontFamily` / `onChangeFontFamily` / `theme` / `focusMode` / `onToggleFocusMode` / `autoReadEnabled` / `autoReadThreshold` / `onToggleAutoRead` / `onCycleAutoReadThreshold`）を `src/contexts/ReaderSettingsContext.tsx` に集約。`App.tsx` で `ReaderSettingsProvider` を `useMemo` 値で供給し、`ArticleView` 内では `useReaderSettings()` で取得するよう変更。Props interface は 42 → 31 項目に縮小。`App.tsx` 側の `<ArticleView ...>` 呼び出しも 11 行削減。挙動変更なし（Issue #65 Step 2）。
- **ArticleView コンポーネントの責務分離（Step 1: ファイル分割）** — 2851 行に肥大化していた `src/components/ArticleView.tsx` から、内部定義されていたサブコンポーネント・hook・定数を `src/components/article-view/` 配下に切り出した。抽出したもの: `EmptyArticleView` / `ShareMenu` (+ `SHARE_WINDOW_TARGETS`) / `ToggleIconButton` / `FetchFullContentArea` / `ArticleNavigation` / `FilterMenu` / `GlobalFilterMenu` / `ImageGallery` / `SnoozeMenu` (+ `SNOOZE_OPTIONS`) / `SelectionExcludePopup` (+ `useSelectionExclude`, `SelectionPopupState`, `MAX_SELECTION_LENGTH`)、共通ユーティリティは `constants.ts` (`MENU_ITEM_CLS`) / `icons.tsx` (`DownloadIcon`, `ExternalLinkIcon`, `ChevronSmall`, `XIcon`) / `filter-shared.tsx` (`buildExcludeOptions`, `useFilterMenuState`, `ExcludeOptionsSection`, `metaLabel`)。本体は 2851 → 1577 行（-45%）に縮小し、個別テストや段階的 Props 削減が可能な土台に整えた。挙動変更なし（Issue #65 Step 1）。

### メモっといた

- **キーボードショートカット一覧ドキュメントを追加** — `docs/keyboard-shortcuts.md` を新規作成し、全ショートカット（約 40 キー）をカテゴリ別（記事ナビゲーション／記事操作／フィルター・表示切替／検索・フィード操作／モーダル・グローバル）に一覧化。発動条件、モーダル内専用キー、実装箇所リファレンスを整理。`README.md` の技術スタック直後に導線セクションを追加。Single source of truth は既存の `src/config/shortcuts.ts` で、`KeyboardShortcutsModal` と本ドキュメントが同一定義を参照する方針を明記（Issue #69）。

### バグ絶対キルした

- **上流認可サーバーの一時障害で意図せずログアウトされる問題を修正** — `refreshTokens()` が `!res.ok` を一律 `null` で返していたため、0g0 ID の 5xx 障害・ネットワーク断・タイムアウトでも `/api/auth/me` が refresh_token Cookie を削除してログアウト扱いになっていた。戻り値を判別可能 union `RefreshResult = ok | invalid | transient` に変更し、恒久失敗（4xx / invalid_grant）のみ Cookie 削除、一時失敗（5xx / ネットワークエラー / JSON パース失敗）は Cookie 保持で `503` を返すよう変更。`useAuth` の `checkAuth` も 503 を既存状態維持として扱い次回リフレッシュに委ねる。`deduplicatedRefresh` / `getAuthSession` も同 union に追従。ユニットテスト 12 件 (`e2e/refresh-tokens.spec.ts`) を追加。

### 激アツ新機能っ

- **AI 翻訳に「原文 / 翻訳」タブ切り替えを追加** — 従来は翻訳結果が本文の上に独立パネルで追加表示されていたが、Google 翻訳のように本文エリア内のタブで原文と翻訳を切り替えて読めるように変更。翻訳実行後は自動で「翻訳」タブに切り替わり、「原文」タブをクリックすれば元の記事本文に戻る。翻訳タブ時のみフィードバックボタン（👍 / 😐 / 👎）を表示。記事を切り替えた際はタブが「原文」にリセットされる。`contentTab` state と `translateResult` への自動切替 `useEffect` で実装。

### バグ絶対キルした

- **cron フィード取得エラーログで Error オブジェクトが `{}` になる問題を修正** — `src/cron/fetch.ts` の `applyFeedError` が `console.error("Feed fetch failed", { error })` で `Error` をそのまま渡していたが、Cloudflare Workers のログは内部で `JSON.stringify` するため `name` / `message` / `stack` が non-enumerable で空オブジェクト化し、原因特定が完全に不能だった。`src/lib/serialize-error.ts` に `serializeError()` ヘルパーを新設し、`Error` インスタンスを `{ name, message, stack, cause }` に明示展開してログ出力するよう変更。`cause` は再帰的に展開し、非 Error 値は `{ value }` でラップ。循環参照オブジェクトは文字列化フォールバック。ユニットテスト 11 件 (`e2e/serialize-error.spec.ts`) を追加。

### 激アツ新機能っ

- **AI 翻訳を HTML 構造保持方式に変更（Google 翻訳ライク）** — 従来の `toPlainText` でタグを剥がしてから翻訳する方式を廃止。`src/lib/translate-html.ts` を新設し、Chrome Translator API 対応ブラウザでは `DOMParser` で記事 HTML をパースしてテキストノード・`alt` / `title` / `aria-label` / `placeholder` 属性のみを個別に翻訳、`<p>` / `<a>` / `<strong>` / `<img>` 等のタグ構造・埋め込み・リンクをそのまま保持。`<code>` / `<pre>` / `<script>` / `<style>` / `<kbd>` / `<samp>` / `<var>` / `<iframe>` / `<embed>` / `<object>` / `<noscript>` / `<textarea>` はコード・実行系として翻訳対象から除外。個別ノードは `Promise.allSettled` で並列翻訳し、一部失敗しても他ノードに影響しない。`useArticleAi` の結果型を `AiOperationResult {text, isHtml}` に変更し、`ArticleView` では `isHtml=true` なら `sanitizeHtml` 後に `article-content` クラスで HTML レンダリング、`false`（Workers AI フォールバック）なら従来のプレーンテキスト表示。ユニットテスト 12 件 (`e2e/translate-html.spec.ts`) を追加。

### バグ絶対キルした

- **CSP `img-src 'self'` によるファビコン未読バッジ読込失敗を修正** — `middleware.ts` の CSP を `img-src 'self' data:` に緩和。`src/lib/favicon.ts` の `updateFaviconBadge()` が `canvas.toDataURL("image/png")` で生成する `data:image/png;base64,...` を `<link rel="icon">` に設定していたが、`img-src 'self'` のみではブラウザが favicon link の data: URI を拒否し、コンソールに CSP violation が大量発生。連動して React の Suspense 境界で未読カウント更新が失敗して Minified React error #419 が発生していた。`data:` 画像は `<img>` / `<link rel=icon>` でスクリプトを実行できないため、`object-src 'none'` と合わせて XSS リスクは限定的と判断。

### simplify

- **API リクエストボディの `Record<string, unknown>` を具体型へ置換 (issue #66)** — `src/App.tsx` の `patchFeed` / `applyFeedPatch` 引数を `Record<string, unknown>` から新設の `FeedPatchPayload` (src/types.ts) に置き換え。`src/hooks/useReadState.ts` の `serializeReadState` payload も新設 `ReadStatePayload` 型に変更。`src/lib/xml-parser.ts` の `extractMetadata` は `FeedItem` を直接受け取る形にし、`item as unknown as Record<string, unknown>` の三段キャストを 3 箇所削除。IDE 補完精度とリファクタ安全性が向上し、Feed PATCH 可能フィールド (nsfw / priority / category / mutedUntil / filter) とサーバー差分同期ペイロードが型レベルで可視化される。

### 激アツ新機能っ

- **翻訳機能を Chrome Translator API / Workers AI のハイブリッドに変更** — Chrome 138+ が備える組み込み `Translator` / `LanguageDetector` API を優先利用し、対応環境ではブラウザ側でオフライン翻訳を完結させるよう変更。Workers AI コスト・レイテンシを削減し、ネットワーク不通でも翻訳可能に。Safari / Firefox / 古い Chrome や `availability !== "available"` の場合は従来通り `/api/ai/translate` にフォールバック。`src/lib/browser-translator.ts` に API ラッパーと言語検出を切り出し、`useArticleAi` の `doTranslate(url, articleId, plainText?)` に `plainText` を渡せるよう拡張。`ArticleView` の翻訳ボタン・`z` キーショートカットは `storedContent` から `toPlainText` で抽出したテキストを渡す。ユニットテスト 5 件 (`e2e/browser-translator.spec.ts`) を追加。

## 2026-04-17

### ガード固めたっ

- **`/api/image-proxy` の同一オリジン検証と Content-Type 偽装検出を追加 (issue #64)** — `middleware.ts` で CSP を `img-src 'self'` に絞っている前提が image-proxy 側で担保できていなかった問題に対応。ハンドラ冒頭で `Sec-Fetch-Site` → `Referer` の優先順位で同一オリジン判定し、不一致は 403 で fail-closed。さらにマジックバイト由来の MIME と宣言 `Content-Type` が矛盾する場合は拒否し、`image/png` と偽装した別フォーマットによるキャッシュ汚染を遮断。純粋関数として `src/lib/image-proxy-security.ts` に切り出し、ユニットテスト 13 件 (`e2e/image-proxy-security.spec.ts`) を追加。

### バグ絶対キルした

- **`POST /api/read-state` の 413 エラーを解消** — 既読 ID が 20,000 件を超えるヘビーユーザーで `Payload Too Large` が発生し、既読・ブックマーク・後で読む・いいね状態の同期が全く成功しない不具合を修正。`useReadState` がフルセットを毎回送るのをやめ、前回同期以降の「追加差分 (`pendingAddedRef`)」と「削除差分 (`pendingRemovedRef`)」のみを POST するように変更。サーバー側マージロジック (`mergeReadStateUpdate`) は既に `(existing ∪ update) \ removedIds` で動くため無変更。安全マージンとして `MAX_READ_IDS` を 20,000 → 100,000、他 ID 上限も 2,000 → 10,000 に引き上げ。`applyServerState` ではサーバーに無い local ID を `pendingAdded` に積み直すことでリロード後の未同期データを失わない。`globalFilter` は変更時のみ送信する `dirty` フラグ方式に変更し、他端末設定の意図しない上書きを防止。

### 激アツ新機能っ

- **通信エラー時のトースト通知** — これまで `apiFetch` の失敗が完全にサイレントだったため、ユーザーが同期失敗に気付けなかった問題に対応。`src/lib/api-fetch.ts` に `onApiError` リスナー機構を追加し、4xx/5xx/ネットワーク障害時にグローバル通知を発火。`App.tsx` が `showToast` を登録して人間可読なメッセージ（「送信データが大きすぎます」「サーバーエラー」「ネットワークエラー」等）を 2 秒トーストで表示。3 秒のレート制限で UI ノイズを抑制。認証リトライ（401）や通常フロー 404 は通知対象外。

### コードレビュー

- **`useFilteredArticles` の useEffect deps から `filteredRef` を除外 (issue #68)** — `src/hooks/useFilteredArticles.ts:362-365` の useEffect で `useSyncedRef` が返す安定 ref `filteredRef` が依存配列に含まれていた問題を修正。ref オブジェクト自体は不変で deps に含める意味がなく、将来 `useSyncedRef` の実装が変わった際に予期しない再発火を招くリスクがあった。`eslint-disable-next-line react-hooks/exhaustive-deps` を付け、deps は `[serverLoadCount]` のみに限定。他 hook (`useReadState` / `useEventListener` 等) の `useSyncedRef` 利用箇所も監査済みで、問題箇所は本件のみ。

### ガード固めたっ

- **`vite-plus` の path traversal 脆弱性対応 (issue #63, GHSA-33r3-4whc-44c2)** — `vite-plus` を `^0.1.14` → `^0.1.18` に更新。`<= 0.1.16` の `downloadPackageManager()` に `VP_HOME` 外へのファイル書き込みを許す path traversal (high severity) があり、Dependabot alert #28/#29 として通知されていた。dev 依存のため本番実行時には影響しないが、ビルド／`pre-commit` 実行時の悪用リスクを排除。

### バグ絶対キルした

- **端末間の既読・ブックマーク・後で読む・いいね状態のズレを解消 (issue #62)** — `POST /api/read-state` を単純上書きから 3-way 差分マージに変更。クライアントは削除 ID を `removedIds` として送信し、サーバー側で `mergeReadStateUpdate()` が `(existing ∪ update) \ removedIds` を計算して保存する。POST レスポンスでマージ結果を返し、クライアントは即座に他端末の最新状態を取り込む。`toggleRead` も削除時の即時同期を有効化し、既読解除が他端末で復活するケースを防止。タブ復帰時の R2 再取得クールダウンは 60 秒→ 15 秒に短縮。新規純粋関数 `src/lib/read-state-merge.ts` と回帰テスト `e2e/read-state-merge.spec.ts`（10 ケース）を追加。

### 激アツ新機能っ

- **スクロール進捗に基づく自動既読マーク機能 (issue #59)** — 記事を閾値（70% / 80% / 90%）までスクロールすると自動的に既読マークする機能を追加。`useReadingProgress` の `onProgressChange` コールバックをフックして実装し、`useReadState.markRead` は冪等のため追加コストなし。設定は `ArticleView` のリーダー設定行にトグル＋右クリックで閾値サイクルのボタンを新設（デフォルト OFF / 80%）。`STORAGE_KEYS.AUTO_READ_ENABLED` と `STORAGE_KEYS.AUTO_READ_THRESHOLD` で localStorage に永続化。

### ガード固めたっ

- **プロンプトインジェクション対策を強化 (issue #55)** — `src/lib/recommendation.ts` の `sanitizeForPrompt()` に多層防御を追加。NFKC 正規化で全角文字によるバイパス（`［／ＩＮＳＴ］` 等）を防止し、LLM チャットテンプレートトークン（`<|im_start|>` / `[INST]` / `<s>` / `<<SYS>>` / `[SYSTEM]` 等）、プロンプト区切り記号の連続（`---` / `###` / バッククォートフェンス / `"""` 等）を中和する処理を追加。空白の正規化も強化し、不正な入力による LLM プロンプトの乗っ取りを防ぐ。34 ケースの回帰テスト (`e2e/sanitize-for-prompt.spec.ts`) を追加。

### メモっといた

- **API エラーコード一覧表を整備 (issue #61)** — `README.md` に「API エラーレスポンス」章を新設し、共通エラー（`UNAUTHORIZED` / `INVALID_JSON` / `RATE_LIMITED` / `INTERNAL_ERROR`）と各エンドポイント固有のステータス・`code` 一覧を明文化。`canRetryWithSelector` や `Retry-After` 等の付随フィールドも記載し、クライアント実装やデバッグ時にソースコードを読まずに参照できるようにした。

### コードめかし込み

- **API エラーレスポンス形式を統一 (issue #60)** — `src/lib/api-error.ts` に `ApiError` 型と `apiError()` ヘルパーを新設。`app/api/**` 配下の全 Route Handler と `server-auth.ts` / `rate-limit.ts` / `ai-route-helper.ts` の `NextResponse.json({ error: "..." }, { status: N })` を `apiError(message, status, { code, hint, retryable })` に置き換え。`code`（機械可読エラーコード）を全エラーに付与し、クライアント側の型安全なエラーハンドリングを可能にした。

## 2026-04-16

### コードめかし込み

- **`buildArticlePredicate()` を述語ビルダー関数に分割** — 12 条件が 1 関数に集中していた `buildArticlePredicate()` を `buildFeedPredicate` / `buildSnoozePredicate` / `buildNsfwPredicate` / `buildMutedFeedPredicate` / `buildKeywordPredicate` / `buildStatePredicate` / `buildAuthorPredicate` / `buildCategoryPredicate` / `buildReadingTimePredicate` / `buildQueryPredicate` / `buildDatePredicate` の 11 述語ビルダーに分割。`Array.every()` で合成し、不要な述語はビルド時に `null` を返してスキップ。(`src/lib/article-filter.ts`)

### バグ絶対キルした

- **`compareByDateDesc` の同日付ソートを安定化** — 同じ `publishedAt` を持つ記事のソート順が不定だった問題を修正。`id`（SHA-256 由来の決定論的ハッシュ）を 2 次ソートキーとして追加し、リフレッシュごとに記事リストの並び順が変わる挙動を解消。(`src/lib/article-utils.ts`)

---

## 2026-04-16 (XSS サニタイズ監査)

### 激アツ新機能っ

- **キーボードショートカット定義を一元管理** — `src/config/shortcuts.ts` を新設。`SHORTCUTS` 配列と `SHORTCUT_MAP` を集約し、`KeyboardShortcutsModal` が自動生成されるよう変更。フィルターボタンの `title` 属性も config 経由で参照。

### コードめかし込み

- **`sanitizeHtml` の replace チェーンを `HTML_SANITIZE_RULES` 配列ループに統合** — 147行のメソッドチェーンを `Array<[RegExp, string | ReplaceFn]>` 定数 + 7行のループに置き換え。パターン追加が1行で済み、保守性が向上。

- **ShareMenu の SNS シェアターゲットを設定配列化** — X・Bluesky・LINE・はてなブックマークの4ボタンを `SHARE_WINDOW_TARGETS` 配列に集約し、`.map()` でレンダリングするように変更。新しい SNS 追加時にコピペ不要になり、保守性が向上。

- **`ArticleList` のプロップ数を 49 → 18 に削減** — `useFilteredArticles` の戻り値を `FilterState` 型としてエクスポートし、フィルター関連の26プロップを `filter: FilterState` 1つに集約。`App.tsx` 側の渡し元もシンプルになり、保守性が大幅に向上。

### ガード固めたっ

- **XSS サニタイズ完全性の監査・テスト追加 (issue #51)** — `processContent()` と `stripIframes()` のすべての呼び出し経路を監査し、`dangerouslySetInnerHTML` が常にサニタイズ済みデータのみを受け取ることを確認。`e2e/content-extraction.spec.ts` に `processContent` / `stripIframes` の XSS 防止テストを 11 件追加。悪意ある RSS フィードに埋め込まれた `<script>`・イベントハンドラ・`javascript:`・`data:` URI が除去されることを回帰テストで保証。

- **`sanitizeKeywords` でサーバー側 ReDoS 検証を追加** — `/api/read-state` POST で受け取ったキーワードフィルターにおいて、クライアント側でのみ行っていた `hasCatastrophicBacktracking` チェックを `sanitizeKeywords` にも追加。API を直接叩いた悪意あるユーザーが ReDoS パターンを R2 に保存できる問題を修正。

### バグ絶対キルした

- **AI API エラーハンドリングを強化** — `runAiJob()` の catch ブロックで Workers AI のステータスコード別レスポンスを返すよう修正。429（rate_limited + retryAfter）・401（unauthorized）・503（service_unavailable）を個別ハンドリング。

- **`useReadState` の `syncImmediately` に存在した race condition を修正** — 削除操作後のページリロード時、`syncImmediately` が予約した `setTimeout(0)` のIDを `syncTimerRef` に保持していなかったため、`beforeunload` / `visibilitychange hidden` の `flushIfPending` がタイマーを検出できず `sendBeacon` が発火しないケースがあった。`syncTimerRef.current` にIDを保存し、`isDirtyRef` を `true` に保つよう修正。

- **link が null/undefined の記事で重複排除が機能しない問題を修正** — `mergeUniqueArticles` の link ベース第2パス重複排除で、link 欠落記事が常に通過していた。`a.link || a.guid || a.id` のフォールバックキーを使うよう修正し、古い RSS フォーマット等でも正しく重複排除されるようになった。

### パフォーマンス改善

- **`buildFilterMap` のフィルターコンパイルキャッシュ追加** — `feeds` 配列の参照が変わるたびに全フィードの正規表現が再生成されていた問題を改善。`compiledCache` パラメータを追加し、`useFilteredArticles` が `useRef` で保持したキャッシュを渡すことで、フィルター内容が変わっていないフィードの `normalizeFilter`（RegExp 再コンパイル）をスキップする。5分ポーリング等で `feeds` 参照が変わっても同一フィルターは再利用される。

- **タブ非表示時のポーリング間隔を延長** — `document.visibilitychange` イベントを検知し、タブ非表示時のポーリング間隔を 5分 → 15分に延長。Workers AI / R2 への不要なリクエストを削減。

- **markBulkRead の不要なサーバー同期を防止** — `globalFilter` 適用時、ポーリングで `articles` が更新されるたびに `scheduleSyncToServer` が呼ばれていた問題を修正。`stateRef.current.read` で既読済み ID を事前チェックし、新規既読がゼロの場合は `setState` と `scheduleSyncToServer` をスキップするよう改善。R2 への無駄な書き込みが削減される。

## 2026-04-15 (3)

### バグ絶対キルした

- **LRU キャッシュ flush の堅牢性向上** — `LruCache#flush()` に `try/finally` を追加し、`storageSet` / `storageRemove` で例外が発生しても `pending` が必ずクリアされるように修正。従来は例外発生時に古いエントリが `pending` に残留し、次の `flush` で重複書き込みが起こる可能性があった。

## 2026-04-15 (2)

### コードめかし込み

- `isValidFeedHash` を `src/lib/validation.ts` に共通化 — `articles` ルートのインライン正規表現を関数に置き換え、`engagement` ルートにも同バリデーションを適用（従来は長さチェックのみで形式未検証だった）

## 2026-04-15

### 激アツ新機能っ

- **クロスデバイス既読同期** — タブ・アプリに復帰したとき（`visibilitychange` visible）にサーバーから最新の既読状態を再取得し、他デバイスで既読にした記事をセッション内で即時反映。60 秒クールダウン付きで過剰なリクエストを防ぐ。
- **IntersectionObserver ベースの読書進捗復元** — スクロールピクセル保存から要素アンカー（`.article-content > :nth-child(N)`）方式に移行。画像遅延ロードで高さが変わっても正しい位置に復元されるようになった。`useReadingProgress` フックを `ArticleView` に統合し、`saveScrollPos`/`loadScrollPos` を削除。

### バグ絶対キルした

- **shop-pro.jp 商品画像スライダー** — クラス属性なしの `<ul>` で 3 枚以上の画像のみ（テキスト 5 文字以下）で構成されるリストを CSS scroll-snap スライダーに自動変換。商品詳細ページでサムネイルが横スクロールで閲覧できるようになった。

## 2026-04-14

### UI

- **全既読ボタンに 2 段階確認** — 1 クリック目で「全既読?」と赤表示し、3 秒以内の再クリックで実行。タイムアウト後は自動リセット。誤操作による全既読を防止。
- **記事詳細ヘッダーを常時 2 段構成に変更** — `lg:flex-row` を廃止し、タグが多くてもヘッダーが崩れない縦積みレイアウトに統一。フィルターバーのボタン（未読 / 後で読む / digest / 日付 / 読了時間 / グローバルフィルター）をテキストからアイコン表示に変更してスペースを節約。

### バグ絶対キルした

- **後で読む削除後に復活するバグ** — `useReadState` の `useEffect` dependency を `user` から `user?.sub` に変更。`useAuth` がトークンリフレッシュのたびに新しいオブジェクトを生成するため、5 秒デバウンス前にサーバーの古いデータが再マージされていた問題を解消。

## 2026-04-13

### 激アツ新機能っ

- **ダイジェストモード** — 全フィード表示時にフィードごとの表示件数を最新 3 件に制限するモード。購読フィードが多い場合でも情報過多にならず、各フィードの最新状況を一覧できる。ツールバーの `digest` ボタンまたは `D` キーで切替。`localStorage` に永続化され、フィード個別選択時は自動的に無効化される。
- **後で読む / ブックマーク / いいね を排他スイッチに変更** — 3 つのトグルを pill 型セグメントコントロールに統合。いずれか 1 つのみアクティブになり、アクティブなボタンを再押しで解除できる。後で読む: `bg-ink`・ブックマーク: `bg-bookmark`・いいね: `bg-rose-400` で色分け表示。

### バグ絶対キルした

- **トークンリフレッシュ重複・ログイン後 LP 表示の問題を修正** — callback リダイレクト先を `/?login=1` に変更してログイン直後を識別。`useAuth` の `checkAuth` でログイン直後かつ `user=null` の場合は 600ms 後にリトライ（スピナー維持）。ランディングページが一瞬表示される問題を解消。認証成功後に `?login=1` クエリを `history.replaceState` でクリア。

## 2026-04-12 (4)

### コードめかし込み

- **`useReadingProgress` の localStorage キーを一元管理** — ハードコードされていた `"rss-reading-progress:"` プレフィックスを `STORAGE_KEYS.READING_PROGRESS_PREFIX` に移動。手動 `JSON.stringify`/`JSON.parse` を `saveJson`/`loadJson` ヘルパーに置き換え。

## 2026-04-12 (3)

### 激アツ新機能っ

- **記事 TTL フィルタ (30日)** — `/api/articles` 返却時に 30 日以上経過した記事を除外（物理削除なし）。ブックマーク・後で読む・いいね・スヌーズ・メモが付いた記事は保護。
- **非アクティブフィードの cron スキップ (7日)** — 7 日以上アクセスのないフィードは 30 分 cron での自動フェッチをスキップし、コスト・帯域を削減。`priority: "high"` フィードは常にフェッチ継続。`/api/feeds` が `lastAccessedAt` を 1 時間スロットル付きで更新する。
- `src/lib/article-ttl.ts` を新規追加 — `isArticleExpired` / `shouldProtectArticle` / `filterExpiredArticles` の純粋関数（14 テスト）。

### バグ絶対キルした

- **Obsidian URI を `<a>` タグクリックで開く** — `window.open` を使用していたため真っ黒タブが開く問題を修正。非表示の `<a href="obsidian://...">` 要素を生成してクリックする方式に変更。
- **`html-to-markdown.ts`: `NodeList.map` ブラウザ非対応を修正** — `domToNode` 内で `NodeList` を `Array.from()` に変換してから `map` を呼ぶよう修正。Firefox / Safari で Markdown コピーが失敗する問題を解消。
- **Markdown コピー・Obsidian 保存ボタンのエラーハンドリング追加** — `navigator.clipboard` が未定義の場合はエラートーストを表示。`articleToMarkdown` / `buildObsidianUri` を try-catch で保護。Obsidian ボタンクリック時に「Obsidian を開いています…」トーストを表示。

## 2026-04-12 (2)

### 激アツ新機能っ

- **Obsidian 連携** — ShareMenu に「Markdown 全文コピー」「Obsidian に保存」ボタンを追加。`obsidian://new` URI で Vault 名・frontmatter・本文を渡して直接ノート作成できる。Vault 名は localStorage に保存。
- **HTML → Markdown 変換** (`src/lib/html-to-markdown.ts`) — h1-h6/a/img/ul/ol/strong/em/code/pre/blockquote/table を Markdown に変換。YAML frontmatter (title/url/feed/author/published) 付き。XSS (script/style) は除去。
- **Obsidian URI ライブラリ** (`src/lib/obsidian.ts`) — `sanitizeObsidianFilename` でファイル名不正文字を除去・置換。`buildObsidianUri` で URI を生成。
- **リーダー設定拡充** — ArticleView ツールバーに行間 (5段階: 1.5-2.3) / コンテンツ幅 (3段階: 640px/720px/全幅) / 両端揃えトグルを追加。設定は localStorage に永続化。
- **SingleFile 連携 API** (`POST /api/clip`) — SingleFile ブラウザ拡張から HTML + URL を受信し、本文抽出後に Cloudflare Cache API に保存。`/api/content` と同じキャッシュキー形式で共有。
- **TDD 基盤整備** — コーディング規約に TDD セクション追加。E2E テスト 82 件追加 (html-to-markdown/export-markdown/obsidian/reader-settings/reading-progress/clip)。

### コードめかし込み

- `src/lib/reader-settings.ts` を新規追加 — FontSizeExtended (6段階) / LineHeight / ContentWidth の定数・CSS スタイル生成・cycle 関数を集約。
- `src/lib/reading-progress.ts` を新規追加 — `computeProgress` / `clampProgress` / `buildAnchorSelector` の純粋関数。
- `src/hooks/useReadingProgress.ts` を新規追加 — IntersectionObserver で本文直下要素を追跡し進捗を localStorage に保存。

## 2026-04-12

### simplify

- `FeedSidebar` のMarkdown/メモエクスポートボタンの SVG ボイラープレートを `FooterIconButton` に統一（-32行）。`FooterIconButton` ��� `onContextMenu` prop を追���。
- `ArticleView.tsx` 内の手動 `addEventListener` / `removeEventListener` を `useEventListener` に統一。`ImageGallery` のライトボックスキーボード操作、`ArticleView` 本体のショートカットキー (v/a/z/Space)、Twitter iframe リサイズの 3 箇所を移行。ショートカットキーの `useEffect` は依存配列 14 個を `useSyncedRef` で解消し、リスナー再登録を回避。

### コードめかし込み

- `useAutoReset` の `set` 関数を `useCallback` で安定化。`resetValue` / `duration` を ref 経由で参照し deps を空にすることで、`showToast` 等の依存先がメモ化できない問題を解消。
- `useMenuOpen` に `'use client'` ディレクティブを追加（他フックとの一貫性）。
- `useUIState` の `toast` 手動タイマー管理（`useState` + `useRef` + `useEffect` + `setTimeout`）を `useAutoReset<string | null>(null, 2000)` に置き換え。
- `useEventListener` に `capture?: boolean` オプションを追加（キャプチャフェーズ登録に対応）。
- `usePortalMenu` / `useOnlineStatus` / `useMobilePane` / `useKeyboardNav` の生の `addEventListener` を `useEventListener` に統一。`useKeyboardNav` の `handleKeyDown` は `useEffect` 外に移動し `eslint-disable` コメントも不要に。
- `useMenuOpen` の `useEffect` + 生の `document.addEventListener/removeEventListener` を `useEventListener` フックに置き換え。`open` のチェックをハンドラー内部に移動し、常時リッスン + 早期リターン方式に統一。
- `useMenuOpen` の mousedown/touchstart ハンドラーを共通関数 `handleOutside` に抽出し重複を解消。
- `ArticleList` のカテゴリドロップダウン click-outside 処理を生の `useEffect + document.addEventListener` から `useEventListener` フックに移行。

## 2026-04-11 (18)

### コードめかし込み

- `useUIState` の `fontSize` / `fontFamily` / `layout` で繰り返されていた `useState + useCallback + storageSet` パターンを `useStoredSetting<T>` ヘルパーに集約し、ボイラープレートを削減。

## 2026-04-11 (17)

### 激アツ新機能っ

- **カテゴリ折りたたみ時の未読数表示** — サイドバーでカテゴリを折りたたんだとき、フィード数ではなくカテゴリ内の未読記事合計数を表示するよう変更。未読がある場合は `text-text-muted` で強調表示し、すべて既読の場合はフィード数を `text-text-faint` で表示。折りたたんだまま未読の有無を把握しやすくなった。

## 2026-04-11 (16)

### コードめかし込み

- `useEventListener` に非標準イベント用 `string` オーバーロードを追加し、`useUIState` の `beforeinstallprompt` ハンドラーを生の `window.addEventListener` から `useEventListener` に移行。`keydown` リスナーとの一貫性を確保。

## 2026-04-11 (15)

### ガード固めたっ

- **CSS変数フォールバック経由の position バイパスを修正** — `sanitizeStyleAttr` の `position` フィルターを `fixed|sticky|absolute` の明示値のみ除去する方式から `position:` プロパティ全体を除去する方式に変更。`position: var(--x, fixed)` のように CSS カスタムプロパティのフォールバック値に危険な位置指定を仕込むことで、フィッシングオーバーレイを作成できるバイパスを防ぐ。

## 2026-04-11 (14)

### コードめかし込み

- `useUIState` の keydown イベントリスナーを既存の `useEventListener` フックに統一。`useEffect` + 手動 `addEventListener/removeEventListener` のボイラープレートを削除。

## 2026-04-11 (13)

### ガード固めたっ

- **ETag / Last-Modified サニタイズ** — 外部 RSS サーバーから返される `ETag` および `Last-Modified` ヘッダー値を保存前に CRLF 除去・長さ制限を適用。悪意ある RSS サーバーによるヘッダーインジェクション / フィード DoS リスクを解消。

## 2026-04-11 (12)

### 激アツ新機能っ

- **メモのMarkdownエクスポート** — メモを書いた記事がある場合、サイドバーフッターに鉛筆アイコンが表示される。クリックするとメモ本文・記事タイトル・公開日をまとめた Markdown ファイルをダウンロードできる。Obsidian・Notion などのノートアプリへのエクスポートに活用できる。

## 2026-04-11 (11)

### 激アツ新機能っ

- **記事の印刷** — 共有メニューに「印刷」ボタンを追加。`Ctrl+P` またはメニューから記事のみをクリーンに印刷できる。サイドバー・記事一覧・アクションボタン・前後ナビゲーションは印刷時に自動で非表示になり、記事本文だけが出力される。

## 2026-04-11 (10)

### 激アツ新機能っ

- **フォーカスモード** — `\` キーまたは記事ヘッダーのアイコンで記事ビューを全画面表示。サイドバーと記事一覧が 0.25 秒のアニメーションで非表示になり、記事本文だけに集中できる読書モード。`Esc` または再度 `\` で解除。

## 2026-04-11 (9)

### バグ絶対キルした

- **`rate-limit.ts` TOCTOU 競合を修正** — `inFlight` Set で同一アイソレート内の並行リクエストをガードし、複数リクエストがクールダウンチェックを同時に通過する問題を解消。
- **`server-auth.ts` `refreshTokens` の reject を 401 に統一** — ネットワークエラー等で `refreshTokens` が reject した場合に `.catch(() => null)` で null に変換し、意図しない 500 ではなく 401 として処理するよう修正。

### ガード固めたっ

- **`html.ts` XSS サニタイザーのバックティック処理を強化** — インラインイベントハンドラ除去の正規表現に `(?!["'\`])` 否定先読みを追加し、非クォート値のキャッチオール分岐が引用符で始まる値に誤マッチしないよう修正。

## 2026-04-11 (8)

### バグ絶対キルした

- **`useSpeechSynthesis` の ghost callback race を修正** — `speak()` 内の `utterance.onend`/`onerror` に identity ガードを追加。レート変更時に旧 utterance がキャンセルされると非同期で `onend`/`onerror` が発火し、新 utterance の再生中に `isPlaying=false` へリセットされる競合を解消。

## 2026-04-11 (7)

### コードめかし込み

- **`useSpeechSynthesis` を既存ユーティリティで整理** — 生の `localStorage` アクセスを `storageGet`/`storageSet`+`STORAGE_KEYS.TTS_RATE` に統一。手動 `useRef`+sync を `useSyncedRef` に、手動インデックス計算を `cycleValue` に置き換え。再生中のレート変更を即時反映（`currentTextRef` でテキストを保持し `cycleRate` 時に `speak` を再起動）。`ArticleView` の冗長なテナリーを簡略化。

## 2026-04-11 (6)

### 激アツ新機能っ

- **読み上げ速度調整** — 記事ビューの TTS ボタン横に速度切り替えボタン（0.5x / 0.75x / 1x / 1.25x / 1.5x / 2x）を追加。クリックで循環切り替え。設定は localStorage に永続化される。

## 2026-04-11 (5)

### コードめかし込み

- **`makeCycler` ヘルパー抽出** — `useFilteredArticles` の `toggleSortOrder` / `cycleDateRange` / `cycleReadingTimeRange` が持つ「循環→保存→ページリセット→返却」パターンを `makeCycler` モジュールレベルヘルパーに抽出し、`updateQuery` とともに既存の `useMemo` ブロックへ統合（`useCallback` を 4 つ削減）。
- **`FeedPageResult` 型をモジュールレベルへ移動** — `useFeeds` の `loadMoreAllFeedsArticles` 内でインライン宣言されていた型を関数外に移動し、関数ボディをクリーンアップ。

## 2026-04-11 (4)

### コードめかし込み

- **`useGestureNav` のコメント整理と dispatch ロジック共通化** — 定数の WHAT コメントを削除（名前が自明）し `TOUCH_X_Y_RATIO` の WHY コメントを JSDoc に変換。mouse/touch で重複していた `if (dx < 0) onSelectNext?.()` パターンを `dispatchSwipe` ヘルパーに抽出。

## 2026-04-11 (3)

### コードめかし込み

- **`shared-feed.ts` のインライン定数をモジュールレベルに移動** — `mergeNewArticles` 内の `KNOWN_IDS_MAX = 10_000` と `getUserLatestArticles` 内の `MAX_USER_ARTICLES = 10_000` をモジュールレベルの `export const` に抽出。JSDoc コメントを付与し意図を明示。

## 2026-04-11 (2)

### ガード固めたっ

- **Next.js を 16.1.7 → 16.2.3 にアップデート** — DoS 脆弱性 (GHSA-q4gf-8mx6-v5v3) を修正。`@opennextjs/cloudflare` 1.19.0 で 16.2.3+ サポートが追加されたため固定制約を解除してアップデート。
- **`@opennextjs/cloudflare` を 1.17.1 → 1.19.0 にアップデート** — Next.js 16.2.x 互換性対応を取り込み。

## 2026-04-11

### コードめかし込み

- **`useGestureNav` のマジックナンバーを named constants に抽出** — `60` / `150` / `400` / `0.5` / `1.5` を `SWIPE_THRESHOLD_PX` / `WHEEL_THRESHOLD_PX` / `WHEEL_RESET_MS` / `WHEEL_X_Y_RATIO` / `TOUCH_X_Y_RATIO` に命名。`60` が mouse/touch の両方で使われていた重複を定数共有で解消。
- **`useGestureNav` のタイマーリークを修正** — アンマウント時に `wheelDeltaRef` の pending タイマーが残ったままになる問題を `useEffect` cleanup で修正。
- **`useGestureNav` の optional chaining 統一** — `if (cb) cb()` パターンを `cb?.()` に統一。what コメントを why（縦スクロール比率の根拠）に置き換え。

## 2026-04-10

### コードめかし込み

- **`useGestureNav` を `src/hooks/useGestureNav.ts` に抽出** — `ArticleView.tsx` のインライン定義だったジェスチャーナビゲーションフック（スワイプ・ホイール・マウスドラッグ）を独立したファイルに分離。`ArticleView.tsx` を約90行削減。
- **`appendPaginatedPages` の重複ロジックを削除** — ページネーション取得ループで `extractContent` を直接呼び出すよう変更。charset 検出・デコード・AI フォールバックの8行の重複コードを除去。

### ガード固めたっ

- **`customTitle` に制御文字除去を追加** — `PATCH /api/feeds/:id` の `title` フィールドが `category` と異なり `stripControlChars` を経由していなかった。一貫性を保ちストアード制御文字インジェクションを防ぐため修正。
- **`sanitizeStyleAttr` に `position: absolute` を追加ブロック** — `fixed` / `sticky` は既にブロック済みだったが `absolute` は未対応だった。高 `z-index` と組み合わせると記事ペイン内で他の UI 要素を覆うフィッシング UI を作れるため除去対象に追加。
- **`sanitizeStyleAttr` で `position: -webkit-sticky` を除去** — Safari で動作する `-webkit-sticky` がベンダープレフィックス形式のため既存の正規表現 `(fixed|sticky|absolute)` では捕捉されていなかった。`(?:-webkit-)?` を追加して補完。

### コードめかし込み

- **CSP `frame-src` を単一管理** — `middleware.ts` の frame-src 許可オリジンを `html.ts` の `TRUSTED_IFRAME_RULES` から導出するように変更。新しい埋め込みソース追加時の二重管理を解消。
- **CSP 静的ディレクティブをモジュールレベルに移動** — nonce 以外の CSP ディレクティブをモジュール初期化時に一度だけ構築するよう変更（毎リクエストのアロケート・join を排除）。
- **`btoa(randomUUID())` を `randomUUID()` に簡略化** — UUID 文字列は CSP nonce に使える印字可能 ASCII のため btoa エンコード不要。
- **`role` フィールドの不要な `as const` 削除** — Cloudflare Workers AI インターフェースの `role` は `string` 型のため `"system" as const` / `"user" as const` は不要なキャスト。
- **`web-push.ts` の冗長な 2 行を 1 行にマージ** — `const body = encryptPayload(...); const encryptedBody = await body` を `const encryptedBody = await encryptPayload(...)` に整理。

### ガード固めたっ

- **CSP nonce 伝播修正** — `middleware.ts` で `NextResponse.next({ request: { headers } })` パターンを使いリクエストヘッダーにも CSP を付与。Next.js レンダラーがリクエストヘッダーから nonce を読むため、修正前は nonce が伝播せずインラインスクリプトがブロックされる恐れがあった。
- **`sanitizeForPrompt` に Unicode 制御文字を追加除去** — ASCII 制御文字 (`\x00-\x1F`) のみだったフィルターに Unicode 双方向制御文字 (U+200B–200D, U+2028–2029, U+202A–202E, U+FEFF) を追加。U+2028/2029 は一部 LLM トークナイザーで改行扱いされロールインジェクションに悪用できた。
- **`reason` フィールドの外部入力に `sanitizeForPrompt` を適用** — `link_discovery` / `web_search` の推薦結果の `reason` フィールドに RSS 記事タイトル・AI 出力 topic をサニタイズせず埋め込んでいた。ストアード XSS の経路を遮断。

- **CSP nonce 実装 — `'unsafe-inline'` を `script-src` から削除** — `middleware.ts` を新規追加し、リクエストごとにランダムな nonce を生成。Next.js がインライン script 要素に nonce 属性を自動付与するため、`'unsafe-inline'` なしで CSP が機能するようになった。これにより XSS 攻撃でインラインスクリプトを注入されてもブラウザが実行をブロックする。
- **`extractUserTopics` のプロンプトインジェクション対策** — 外部 RSS フィードから取得したタイトル（フィード名・記事タイトル）を LLM プロンプトへ埋め込む前に `sanitizeForPrompt` で制御文字・改行を除去し 120 文字に切り詰め。また system/user メッセージを分離してインジェクション境界を明確化。悪意ある RSS フィードが `"Ignore previous instructions..."` のようなタイトルで AI の挙動を操作するリスクを緩和。

- **`sendPush` に SSRF 多層防御を追加** — Push 通知送信時、サブスクリプション登録時に `isValidHttpsUrl` で検証済みだが、R2 データが直接改ざんされた場合の SSRF 経路を防ぐため `sendPush` 関数内でも endpoint URL を再検証するよう追加。
- **`inferSelectors` のプロンプトインジェクション対策** — `excludeSelectors` をプロンプトに埋め込む際、`"${s}"` のテンプレートリテラルでは CSS 属性セレクタ (`[attr="value"]`) に含まれる `"` でプロンプト構造が崩れる恐れがあった。`JSON.stringify(excludeSelectors)` に変更し、引用符を適切にエスケープして LLM への意図しないインジェクションを防止。

### メモっといた

- **R2 データ構造ドキュメントを共有フィード構造に更新** — `README.md` / `CLAUDE.md` / `.claude/rules/architecture.md` / `.claude/rules/coding-conventions.md` の R2 キー構造が旧構造（`users/{userId}/feeds.json`・`users/{userId}/articles.json`）のままだった箇所を現行の共有フィード構造（`feeds/{feedHash}/meta.json`・`feeds/{feedHash}/articles/latest.json`・`users/{userId}/subscriptions.json` 等）に全面更新。データフロー・クールダウンキー・ReadState フィールド（likeIds・notes）も追記。
- **README.md を現状に合わせて全面更新** — パッケージマネージャを `npm` → `pnpm` に修正、R2 バケットの不要な `rss-reader-cache` 削除、VAPID・BRAVE_SEARCH_API_KEY 等の新規シークレット追加、API エンドポイント一覧を現行の全エンドポイント（read-state / recommendations / push / stats / engagement / ogp / image-proxy / OPML 等）に拡充、読み取り状態の説明を「localStorage のみ」→「R2 との二重管理」に修正。

### コードめかし込み

- `content.ts`: `extractMainContent` 内で 3 回繰り返されていた `(html.match(/<img\b/gi) ?? []).length` パターンを `countImgs` ヘルパーに抽出。
- `app/api/stats/route.ts`: `GET` ハンドラ内クロージャに定義されていた `buildDayList` をモジュールレベルに移動し、`now` を引数として受け取るよう変更。
- `useSpeechSynthesis`: `supported` チェックをモジュール定数 `SPEECH_SUPPORTED` に移動し、毎レンダー再評価を排除。`speak` / `stop` の `useCallback` deps から除去され参照が安定化。
- `useSpeechSynthesis`: 停止状態リセット（`utteranceRef.current = null; setIsPlaying(false); setIsPaused(false)`）の 3 重複を `resetState` ヘルパーに抽出。
- `ArticleView`: TTS キーボードハンドラを手動 `addEventListener` から `useEventListener` フックに置き換え。不要になった `useSyncedRef` 4 呼び出しを削除。
- `ArticleView`: TTS ボタンの `title` 属性の冗長条件（`ttsPlaying ? "停止" : ttsPaused ? "停止" : ...`）を `(ttsPlaying || ttsPaused) ? "停止" : ...` に簡略化。
- `unescapeHtml`: `&amp;` / `&lt;` / `&gt;` / `&quot;` / `&#NNN;` / `&#xHHH;` の 5 パス連続 `.replace()` を 1 パスの正規表現に統合し、文字列走査を削減。

## 2026-04-09

### コードめかし込み

- `hasDangerousScheme` の名前付き文字参照デコード（`&Tab;` / `&NewLine;` / `&colon;`）を個別 3 パスから 1 パスに統合し、文字列走査を削減。

### ガード固めたっ

- **`hasDangerousScheme` の HTML5 名前付き文字参照バイパスを修正** — `&colon;`（`:` に展開）を使った `javascript&colon;alert()` や、`&Tab;` / `&NewLine;`（ブラウザが URL パース時に先頭から除去）を使ったスキーム偽装が `hasDangerousScheme` の検出をすり抜け XSS になりうる問題を修正。これらの名前付き文字参照を `unescapeHtml` 呼び出し後に補完デコードするよう対処。数値形式（`&#9;` 等）は既存の `unescapeHtml` で処理済みだったが名前付き形式が未処理だった。

## 2026-04-09

### コードめかし込み

- `src/lib/html.ts` の `unescapeHtml` で重複していた数値文字参照のデコードロジック（`&#NNN;` と `&#xHHH;` の検証ブロック 4 行 × 2）を `decodeCodePoint(code: number)` ヘルパーに抽出。コード量を削減し、検証ロジックを一元管理。
- `toPlainText` の `&amp;` / `&lt;` / `&gt;` デコードを `unescapeHtml` 呼び出しに統合。重複実装を排除し、AI 入力に渡すテキストで `&quot;` や数値文字参照も正しくデコードされるよう改善。

## 2026-04-09

### ガード固めたっ

- **コンテンツプロキシのエラーレスポンスを汎用化** — `/api/content` がリモートサーバーの HTTP ステータスコード（403・404 等）をエラーボディにそのまま含めて返していた問題を修正。`"Failed to load page"` に統一し、外部サーバーのリソース存在有無がクライアントに漏洩するのを防止。
- **JWT `sub` クレームのフォーマット検証を追加** — `sub` は R2 キー（`users/{sub}/...`）に直接埋め込まれるため、英数字・ハイフン・アンダースコア・`@`・`.` のみ許可するホワイトリスト検証を `sessionFromPayload` に追加。パストラバーサル（`/` や `..` を含む不正な sub）によるデータ隔離の破壊を防止。

## 2026-04-09

### 激アツ新機能っ

- **記事の読み上げ機能（TTS）** — Web Speech API を使って記事を音声で読み上げられるようになりました。記事ビューのツールバーにスピーカーアイコンボタンを追加。クリックで読み上げ開始、再クリックで停止。キーボードショートカット `P`（大文字）でも操作できます。記事を切り替えると自動的に停止します。ブラウザが Web Speech API に対応していない場合はボタンは表示されません。

## 2026-04-09

### ガード固めたっ

- **`/api/feeds/:id/reinfer` にレートリミットを追加** — AI 呼び出し + 外部 URL フェッチを伴う重い操作にクールダウン（60 秒）を設けていなかった問題を修正。繰り返し呼び出しによる Workers AI コストの増大と外部サーバーへの過剰リクエストを防止。
- **`failedSelectors` を最大 10 件に制限** — LLM CSS セレクタ再推論で失敗履歴が無制限に蓄積し、R2 ストレージ肥大化と AI プロンプトのトークン増加が起きていた問題を修正。
- **HTML Popover API 属性を `sanitizeHtml` で除去** — `<div popover="auto">` + `<button popovertarget="id">` の組み合わせで JavaScript を一切使わずにブラウザのトップレイヤーへ任意 HTML をオーバーレイ表示できる問題を修正。悪意ある RSS 記事がリーダー UI を覆うフィッシング画面を表示できた。`popover` / `popovertarget` / `popovertargetaction` 属性を除去するよう追加。ブール属性（値なし）も対応。
- **`<dialog>` タグを `sanitizeHtml` で除去** — `<dialog open>` は UA スタイルシートの `position: absolute` で記事コンテンツ外を覆う可能性があるため、`<form>` と同様にタグ枠のみ除去してコンテンツを保持するよう修正 (`src/lib/html.ts`)

### バグ絶対キルした

- **reinfer 失敗時に `failedSelectors` が R2 に保存されない問題を修正** — `inferFeedFromUrl` が null を返した場合、`writeFeedMeta` が呼ばれないまま 422 を返していたため、失敗履歴の更新が破棄されていた。次回再推論時に同じセレクタを繰り返し試みる動作を防止するため、`failedSelectors` の保存を推論呼び出し前に移動。推論失敗時も旧 `cssSelectors` が R2 に残るため既存フィードは引き続き動作する。
- **ページネーション記事の2ページ目以降に AI フォールバックを適用** — `appendPaginatedPages` で2ページ目以降のコンテンツ抽出が `extractMainContent` のみで、1ページ目と異なり Cloudflare AI toMarkdown フォールバックが発動しない問題を修正。コンテンツが不十分な場合は1ページ目と同様に AI フォールバックを試みるよう統一。
- **`feeds/import` の型述語抜けを修正** — `SharedFeedMeta | null` の `filter` に型述語を追加し、TypeScript が `null` を見逃す可能性を排除。
- **`useReadState` の `flushIfPending` で `isDirtyRef` をリセット** — `beforeunload` / `visibilitychange` でタイマーをキャンセルした後も `isDirtyRef.current` が `true` のまま残る問題を修正。次のデバウンスサイクルでの二重送信を防止。
- **`useReadingStats` をグローバル `fetch` から `apiFetch` に置き換え** — 認証エラーハンドリングと `getAuthReady()` 待機を他フックと統一。

### 激アツ新機能っ

- **記事スクロール位置の自動保存・復元** — 記事を読んでいる途中で別の記事に切り替えて戻ったとき、前回のスクロール位置を自動的に復元する。スクロール位置は `localStorage` にデバウンス（500ms）保存し、最大 200 件を保持する。また、記事切り替え時にスクロール位置が前の記事のままになっていたバグを修正。

- **テキスト選択で引用コピー** — 記事本文でテキストを選択するとポップアップが表示され、「引用をコピー」ボタンで `> 選択テキスト\n\n— [記事タイトル](URL)` 形式の Markdown 引用をクリップボードにコピーできる。グローバルフィルターが設定済みの場合は除外キーワード追加ボタンも併せて表示する。
- **週間読書目標・進捗トラッキング** — 読書統計モーダルに「週間目標」セクションを追加。デフォルト 20 件の目標に対する今週の進捗をプログレスバーで表示し、目標数値をクリックしてインライン編集できる。達成時はチェックマークとアクセントカラーで視覚フィードバック。設定は `localStorage` に永続化。

### コードめかし込み

- **`useFilteredArticles` のトグル・サイクラーコールバックを `useCallback` に統一** — `makeFilterToggle` / `makeCycler` のモジュールレベルヘルパー関数と、それらを呼び出す `useMemo` ブロックを廃止。各コールバックを直接 `useCallback` で定義するよう変更し、`Dispatch<SetStateAction<T>>` の型インポートも削除。動作は変わらない。
- **`buildArticlePredicate` の `!isActive` チェックを単一ブロックに集約** — `article-filter.ts` のフィルター述語で `&& !isActive(a.id)` が各条件に重複していた問題を解消。アクティブ記事のガード処理を `if (!isActive(a.id))` ブロックにまとめ、コードの意図を明確化。動作は変わらない。
- **`matchesFeedId` を分離** — `buildArticlePredicate` 内の特殊フィード分岐（`if/else if` チェーン）を `matchesFeedId` 関数に切り出し、述語本体のフィード絞り込みを 1 行に凝縮。カテゴリフィルターの冗長な null チェックも `?.` でスリム化。

### ガード固めたっ

- **`GET /api/recommendations` に生成クールダウンを追加** — キャッシュ失効時に並行リクエストが複数の AI / Brave Search API 呼び出しを多重実行できた問題を修正。`recommendationsGenCooldownKey` を新設し、30 秒のクールダウンを適用。クールダウン中は期限切れキャッシュまたは空レスポンスを返す。`POST /api/recommendations/refresh` の 5 分クールダウンとは独立した別キーで管理するため、リフレッシュフローは影響を受けない。

### バグ絶対キルした

- **カテゴリフィルターが特定フィード選択時に全記事を消す問題を修正** — 特定フィードを選択中にカテゴリフィルターが有効だと、選択フィードのカテゴリとフィルターが一致しない場合に記事が全件非表示になるバグを修正。ミュートフィルターと同様に全フィード表示時のみ適用するよう変更。
- **後で読むボタンにトースト通知を追加** — `ArticleView` の「後で読む」ボタンクリック時にトースト通知が表示されず、アクションが反映されているか分かりにくかった問題を修正。キーボード `t` と同様のフィードバック（「後で読むに追加」/「後で読むから削除」）を表示するようにした。

### メモっといた

- **コンテンツ抽出戦略** — `architecture.md` に `extractMainContent` の 3 段階フォールバック・画像損失チェック（20% 閾値）・`postProcess` パイプライン順序を記載
- **キーワードフィルタリング設計** — `architecture.md` に `CompiledKeywordFilter` の設計意図と ReDoS 対策パターンを記載
- **stale closure 回避パターン** — `coding-conventions.md` に `useSyncedRef` の使い方と主な使用箇所を記載
- **読み取り状態マージ戦略** — `coding-conventions.md` にローカル優先マージ・スヌーズ期限の例外処理を記載
- **ノートマージ戦略（サーバー優先）** — `coding-conventions.md` の「読み取り状態マージ戦略」に notes の例外規則を追記。既読・ブックマーク等はローカル優先だが、notes は同一キーではサーバー優先（`{ ...prev, ...serverNotes }`）。別デバイスで編集した最新版をサーバーから受け取るのが正しい挙動のため。
- **hooks JSDoc** — `usePushNotifications` / `useReadingStats` / `useRecommendations` / `useUIState` にフック説明コメントを追加

## 2026-04-09

### ガード固めたっ

- **XSS修正: RSS本文の未サニタイズ経路を塞ぐ** — `processContent()` / `stripIframes()` にサニタイズを追加。フルテキスト取得できない場合に RSS フィード直値の `article.content` が `dangerouslySetInnerHTML` へ流れる経路で `sanitizeHtml()` が適用されていなかった問題を修正。悪意ある RSS フィードに埋め込まれた `<script>` やイベントハンドラが実行される恐れがあった。

### メモっといた

- **ディレクトリインデックス更新** — `CLAUDE.md` と `.claude/rules/architecture.md` に未記載だったファイルを追記。追加した hooks: `useAutoReset`, `useEventListener`, `useInboxProgress`, `useLocalStorageHistory`, `useReadingStats`。追加した lib: `export-markdown`, `rate-limit`。追加した API routes: `POST /api/ai/translate`, `GET /api/stats`。

## 2026-04-08

### 激アツ新機能っ

- **カテゴリフィルター** — 記事一覧のフィルターバーに「フォルダ」ドロップダウンを追加。フィードにカテゴリが設定されている場合、カテゴリ名の一覧から選択してそのカテゴリ配下のフィードの記事だけを表示できる。アクティブなカテゴリはチップ形式で表示され、クリックで解除。フィード切り替え時は自動リセット。

- **著者フィルター** — 記事ビューの著者名をクリックするとその著者の記事だけに絞り込めるようになりました。フィルターバーに著者バッジが表示され、クリックで解除できます。フィード切り替え時は自動的にリセット。絞り込み時はトースト通知を表示。

- **メモありフィルター** — 記事一覧のフィルターバーに「✎」ボタンを追加。クリックするとメモが付いている記事だけを表示する。activeIds（選択中・猶予期間中の記事）はフィルター対象外。フィルター状態は localStorage に永続化。

- **記事リストのメモインジケーター** — メモが付いている記事に小さなペンシルアイコン（amber）を表示。compact / list / card / magazine の全レイアウトに対応。

- **フィード別未読消化率** — 読書統計モーダルに「フィード別 未読消化率」セクションを追加。未読数が多いフィードから順に最大 10 件のプログレスバーを表示し、消化済みフィードは緑ドットでインジケート。

### コードめかし込み

- **`filterAndSortArticles` のフィルター述語を分離** — `buildArticlePredicate` 関数を抽出し、フィルター述語の構築とリストへの適用を分離。`filterAndSortArticles` 自体が短くなり、述語ロジックが単独でテスト可能になった。

- **キーワードフィルターの正規表現を事前コンパイル** — `CompiledKeywordFilter` 型を導入し、`normalizeFilter` で正規表現キーワードを一度だけコンパイルするよう変更。従来は `matchesKeywordFilter` が記事ごとに `new RegExp` を生成していたが、フィルター設定変更時に一度だけコンパイルして使い回すようになり、フィルタリングの hot path から `hasCatastrophicBacktracking` チェックも排除した。`ArticleFilterOptions.feedFilterMap` / `globalFilter` の型を `CompiledKeywordFilter` に更新。

- **`useEventListener` フック抽出** — `window` / `document` へのイベントリスナー登録・解除を抽象化する `useEventListener` フックを追加。`useReadState` の `beforeunload` / `visibilitychange` リスナーを置き換え、`useEffect` 内の手動 `addEventListener` / `removeEventListener` ペアと deps 配列管理を不要にした。

- **`/api/stats` の日付リスト生成を共通化** — `last7Days` / `last365Days` のコードを `buildDayList(n)` ヘルパーに統合。連続活動日数計算で両ブランチが同値だった無意味な三項演算子を削除。

- **`PATCH /api/feeds/:id` ハンドラを簡略化** — `category` / `mutedUntil` フィールドのネストされた `else { if (...) }` を `else if` チェーンにフラット化。冗長なインラインコメントを削除。130 行 → 120 行。

### 激アツ新機能っ

- **記事への個人メモ** — 記事ビューの鉛筆アイコンからメモを追加・編集できるようになりました。メモはフォーカスを外すと自動保存され、`localStorage` と R2 にクロスデバイス同期されます。最大 2000 文字、最大 1000 件まで保存可能。`Escape` キーで編集をキャンセルできます。

### バグ絶対キルした

- **`snoozedUntil` のクロスデバイスマージバグを修正** — `useReadState` のサーバー同期処理で、スヌーズ期限のマージが `{ ...server, ...local }` の形式だったため、ローカルの古い値がサーバー側の新しい値を上書きしていた問題を修正。同一キーではより遅い期限を採用するようにした。

### コードめかし込み

- **`/api/stats` の複数パス処理を 1 パスに統合** — エントリ集計ループが 6 回に分かれていたところを単一ループで完結するよう書き直し。文字列比較で週判定を行い Date オブジェクト生成も削減。

### 激アツ新機能っ

- **読書アクティビティ ヒートマップ** — 読書統計モーダルに過去 1 年分（365 日）のカレンダーヒートマップを追加。GitHub の草グラフ風にアクティビティの濃淡を表示。セルにホバーすると日付と件数のツールチップが表示されます。API も `yearlyHeatmap` フィールドを返すよう拡張しました。

- **読書統計モーダル** — サイドバーフッターのグラフアイコンから「読書統計」を開けるようになりました。直近 7 日の日別アクション数バーグラフ・今週の合計・累計・連続活動日数（streak）・よく読むフィード TOP5 を表示します。既存の `engagement.json` を集計するため追加データ収集なしで機能します。

- **カテゴリタグクリックで記事絞り込み** — 記事本文ビューのカテゴリバッジをクリックすると、そのカテゴリ名が記事一覧の検索クエリにセットされ、同カテゴリの記事を素早く絞り込めるようになりました。フィード固有のキーワードフィルター設定画面では従来通り「除外カテゴリ追加」として動作します。

### ガード固めたっ

- **AI キャッシュの `articleId` に文字種バリデーション追加** — `ai-route-helper.ts` で `articleId` を英数字・ハイフン・アンダースコア（1〜128文字）のみ許可するよう検証を追加。不正な値は `null` として扱い、R2 キーへのパストラバーサルを防止。

### バグ絶対キルした

- **`useFilteredArticles` の stale closure を修正** — `serverLoadCount` 変化時に `filtered.length` を参照する `useEffect` が古い値を参照する可能性があった問題を修正。`useSyncedRef(filtered)` に切り替えて `eslint-disable` コメントを除去。
