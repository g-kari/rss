## フォーカスモード・activeFeedView 実装調査結果

### A. フォーカスモード（Focus Mode）

**State 名**: `focusMode` (boolean)
**初期化**: `useState(false)` — localStorage 非永続化
**トグル API**: `toggleFocusMode()` → useCallback(() => setFocusMode((v) => !v), [])
**キーボードショートカット**: `\` キー（バックスラッシュ）

- useEventListener で document.keydown を監視（useUIState.ts:211-217）
- Escape キーで強制的に OFF になる
  **UI への反映**: App.tsx:1078-1081
- `gridTemplateColumns: focusMode ? "0px 0px 1fr" : "..."`
- フォーカスモード時はサイドバー・記事一覧列をずっと非表示（width 0）に設定
  **ボタン位置**: UserSettingsModal で toggle 可能（シンプルなトグルスイッチ）

### B. activeFeedView（フィードビュー）

**State 名**: `activeFeedView` (FeedView)
**型**: `"articles" | "pictures" | "videos" | "social"` （FEED_VIEW_CYCLE で定義）
**初期化**: useStoredSetting + loadActiveFeedView()
**localStorage キー**: `STORAGE_KEYS.ACTIVE_FEED_VIEW = "rss-active-feed-view"`
**永続化**: ✓ あり（useStoredSetting 経由で storageSet/storageGet）
**トグル API**: `onChangeActiveFeedView(v: FeedView)` → useCallback + storageSet
**呼び出し元**: FeedSidebar の カテゴリボタン（App.tsx:1061-1073）

### C. 統合ポイント（pictures/videos での UI 変化）

**箇所**: App.tsx:1071-1073（FeedSidebar の onChangeActiveFeedView ハンドラ内）

```typescript
if (view === "pictures" || view === "videos") {
  onChangeLayout("gallery");
}
```

**動作**: 画像・動画カテゴリに切り替わるたびに自動的にレイアウトを gallery に変更

- ユーザーが手動でレイアウト変更した場合は尊重（次のカテゴリ切替まで）

**自動フォーカスモード有効化の推奨位置**:

- **現状**: focusMode は完全にセッション単位（OFF で始まる）、自動有効化なし
- **推奨**: App.tsx:1071 の if ブロック内または useEffect で、pictures/videos 判定後に setFocusMode(true) を追加
  - または useUIState.ts 内で activeFeedView を監視する useEffect を新設
- **理由**: focusMode = localStorage 非永続化、タブ閉じで reset されるため、カテゴリ切替ごとに再有効化が必要

### D. 既存挙動との干渉確認

**カテゴリ切替との関係**:

- onChangeActiveFeedView() → setSelectedFeedId(null), setSelectedGroupId(null) で選択状態リセット
- フォーカスモード OFF 時は干渉なし
- フォーカスモード ON で別フィード選択中に pictures/videos 切替 → サイドバー非表示のため UI 上問題なし
- **ユーザーが手動 OFF**: `focusMode: false` のみ → collapsedCategories / 他フィルタに影響なし

### E. 実装上の考慮点

1. focusMode は localStorage 非永続化 → セッション単位（リロードで初期化）
2. activeFeedView 切替時は自動的にレイアウト→gallery、フィード/グループ/タグ選択クリア
3. Escape キーで focusMode 強制 OFF される（他モーダル close と同時）
4. toggleFocusMode() はイベントリスナと呼び出し元（UserSettingsModal）の 2 箇所から
