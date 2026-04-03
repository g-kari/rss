# RSSリーダー - フィルター適用時の「過去記事を読み込む」自動化調査

## 1. 「過去記事を読み込む」の実装箇所

### LoadMoreButton コンポーネント (ArticleList.tsx)

- **位置**: `/src/components/ArticleList.tsx` 行 596-614
- **関数名**: `LoadMoreButton`
- **トリガー**: ボタンクリック → `onLoad()` コールバック実行
- **表示条件**: `!hasMore && feedHasMorePages && onLoadMoreFeedArticles` がすべて true
  - `hasMore`: `useFilteredArticles` フック内で計算 (`visible.length < filtered.length`)
  - `feedHasMorePages`: `App.tsx` 行 311-326 で useMemo 計算

### API呼び出し (useFeeds.ts)

- **loadMoreFeedArticles** (行 244-258)
  - 単一フィード選択時: `/api/articles?feed=${feedId}&page=${nextPage}`
  - state管理: `loadedFeedPages` Map で各フィードのロード済みページ追跡
- **loadMoreAllFeedsArticles** (行 262-305)
  - 全フィード表示時: 複数フィードの未ロードページを一括並列取得
  - 各フィード個別に `/api/articles?feed=${f.id}&page=${nextPage}` 呼び出し
  - `Promise.allSettled()` で一括処理、個別フェッチ失敗も継続

## 2. フィルター適用の実装箇所

### useFilteredArticles.ts フィルター検知トリガー一覧

#### フィルター toggle 関数群 (行 165-178)

各フィルター toggle は `makeFilterToggle()` で以下を実行:

1. localStorage 保存（STORAGE_KEYS で管理）
2. **`resetPage()` 呼び出し** → `setPage(1)` にリセット

| フィルター       | State              | 関数名                  | 行番号  |
| ---------------- | ------------------ | ----------------------- | ------- |
| 未読のみ         | `unreadOnly`       | `toggleUnreadOnly`      | 166-169 |
| ブックマークのみ | `bookmarkOnly`     | `toggleBookmarkOnly`    | 170     |
| 後で読むのみ     | `readingListOnly`  | `toggleReadingListOnly` | 171-174 |
| ソート順         | `sortOrder`        | `toggleSortOrder`       | 183-189 |
| 日付範囲         | `dateRange`        | `cycleDateRange`        | 193-199 |
| 読了時間範囲     | `readingTimeRange` | `cycleReadingTimeRange` | 201-207 |

#### フィルター state を含む useMemo依存配列 (行 250-312)

`filtered` の計算時に以下をトリガーに再計算:

```typescript
deps: [
  articles,
  feedId,
  feedFilterMap,
  readIds,
  bookmarkIds,
  readingListIds,
  likeIds,
  historyIds,
  historyOrder,
  unreadOnly,
  bookmarkOnly,
  readingListOnly, // フィルター toggles
  query,
  sortOrder,
  dateRange,
  activeIds,
  nsfwMode,
  nsfwFeedIds,
  normalizedGlobalFilter,
  readBeforeTimestamp,
  snoozedUntil,
  readingTimeRange,
];
```

### filterAndSortArticles() (article-filter.ts)

- **位置**: `/src/lib/article-filter.ts` 行 70-163
- **フィルター適用順**:
  1. スヌーズ中記事除外
  2. feedId による絞り込み
  3. NSFW フィード非表示
  4. フィード別キーワードフィルター
  5. グローバルキーワードフィルター
  6. 未読/ブックマーク/リーディングリスト フィルター
  7. 検索クエリ (title/summary/author AND検索)
  8. 日付範囲フィルター
  9. 読了時間範囲フィルター

## 3. 記事ロード・ページネーション機構

### 記事取得エントリーポイント (useFeeds.ts)

| 関数                         | 役割                       | 行番号  |
| ---------------------------- | -------------------------- | ------- |
| `fetchAndSetArticles()`      | 初期/全件再ロード          | 83-90   |
| `mergeArticles()`            | 新着マージ (keep existing) | 92-97   |
| `pollNow()`                  | 5分毎ポーリング            | 115-127 |
| `loadMoreFeedArticles()`     | 単一フィード過去ページ     | 244-258 |
| `loadMoreAllFeedsArticles()` | 全フィード過去ページ一括   | 262-305 |

### ページネーション状態管理 (useFeeds.ts)

- **loadedFeedPages**: `Map<feedId, loadedPageNumber>`
  - 初期: `new Map()`
  - `fetchAndSetArticles()` 呼び出し時: リセット (行 88-89) ← **重要: ここが古いページ番号をクリア**
  - 各 `loadMoreFeedArticles()` / `loadMoreAllFeedsArticles()` で更新

### ページネーション表示判定 (App.tsx 行 311-326)

```javascript
const feedHasMorePages = useMemo(() => {
  if (selectedFeedId?.startsWith("__")) return false; // 特殊フィード除外
  if (selectedFeedId) {
    const feed = feeds.find((f) => f.id === selectedFeedId);
    if (!feed?.pageCount) return false;
    const loadedPage = loadedFeedPages.get(selectedFeedId) ?? 1;
    return loadedPage <= feed.pageCount; // ロード済みページ < サーバー最大ページ
  }
  // 全フィード: いずれかのフィードで未ロードページあり = true
  return feeds.some((f) => {
    if (!f.pageCount) return false;
    const loadedPage = loadedFeedPages.get(f.id) ?? 1;
    return loadedPage <= f.pageCount;
  });
}, [selectedFeedId, feeds, loadedFeedPages]);
```

## 4. 「ボタン自動押下」の現在の仕組み

### IntersectionObserver による自動トリガー (useFilteredArticles.ts 行 241-249)

```typescript
useEffect(() => {
  if (!hasMore) return; // filtered内に未表示記事なし = 無限スクロール不要
  const el = sentinelRef.current;
  if (!el) return;
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) loadMore(); // page++ 実行
    },
    { rootMargin: "120px" },
  );
  observer.observe(el);
  return () => observer.disconnect();
}, [loadMore, hasMore]);
```

### サーバーロード完了後の自動 page 拡張 (useFilteredArticles.ts)

```typescript
const notifyArticlesAdded = useCallback(() => {
  setServerLoadCount((c) => c + 1);
}, []);

useEffect(() => {
  if (serverLoadCount === 0) return;
  setPage((prev) => Math.max(prev, Math.ceil(filtered.length / PAGE_SIZE) || 1));
}, [serverLoadCount]);
```

**流れ**:

1. LoadMoreButton クリック → `handleLoadMoreFeedArticles()` 実行 (App.tsx 333-340)
2. `loadMoreFeedArticles()` / `loadMoreAllFeedsArticles()` で新記事ロード
3. `notifyArticlesAdded()` 呼び出し → `serverLoadCount++`
4. useEffect 発火 → `filtered.length` を参照して `page` を拡張
5. 新記事が `visible` に含まれて表示

## 5. フィルター適用時の「自動化が必要な点」

### 現在の課題

- **フィルター適用時**: `setPage(1)` でリセット (useFilteredArticles.ts 188, 199 等)
- **その後**:
  - `hasMore === true` なら IntersectionObserver で自動 loadMore
  - しかし sentinel が画面内に見えないと発火しない（非表示フィルター結果が1ページ内に収まる場合など）
  - **→ ボタンを手動で押す必要**

### 自動化の実装アプローチ

オプション1: **フィルター変更 → 自動で過去ページロード**

- `useFilteredArticles` の依存配列に `feedHasMorePages` を追加
- `feedHasMorePages === true` かつ `filtered.length < 表示目標` なら `loadMore()` を自動実行
- リスク: 無限ループ、過度なAPI呼び出し

オプション2: **`page` リセット後、1ページ目が不足なら自動ロード**

- フィルター toggle 後、`filtered` が確定してから `filtered.length < PAGE_SIZE` ならロード
- より安全で効率的

オプション3: **フィルター変更を useFeeds.ts 経由で通知**

- `useFilteredArticles` の変更を `App.tsx` 経由で detect
- `feedHasMorePages && visible.length < PAGE_SIZE` なら `notifyArticlesAdded()` 自動呼び出し
