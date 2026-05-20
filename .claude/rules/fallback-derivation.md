---
paths: "src/**/*.ts,src/**/*.tsx,app/api/**/*.ts"
description: Fallback / 派生値の規範 — 同名 boolean 派生分離 / fallback 伝播の意図的制御 / sibling 純粋関数の fallback chain 統一 / 派生 boolean は fallback 前 origin から導出
---

# Fallback / 派生値の規範

`coding-conventions.md` から #733 案 A-1 Step 4 で分割した、**同一プロパティ名派生値の分離 / fallback 伝播の意図的制御 / sibling 純粋関数の fallback chain 統一 / 派生 boolean の origin 導出** に関する規範集。

主要テーマ:

- 派生 boolean / 派生 state は「どの判定に使うか」を 1 つに絞る (`hasContent` vs `hasFullContent`)
- `processedContent ?? article.summary ?? ""` 型の fallback は UI と判定ロジックで意味が変わる
- 同じデータに動作する sibling 純粋関数 (`isArticleRead` / `pruneOldReadIds` 等) は fallback chain を完全に揃える
- 派生 boolean は fallback 混入後の中間値ではなく fallback 前の origin から導出する

## 同一プロパティ名で意味の異なる派生値を使い分けない

UI 用と判定ロジック用で意味が違う「派生 boolean」は、**別名で分離する**。同名で意味だけ変えると、片方の意味で正しくても他方では誤判定になる。

```typescript
// アンチパターン: hasContent がサマリ含むかフル本文かで意味がブレる
const hasContent = !!(processedContent || article?.summary);
//   ↑ AI/TTS ボタン表示用には正しい
//   ↑ オートモードの「fetch 不要か」判定には誤り — サマリ fallback で fetch スキップ

// 修正パターン: 用途別に派生値を分ける
const hasContent = !!(processedContent || article?.summary); // UI 用
const hasFullContent = !!processedContent; // 全文取得 gate 用
```

**How to apply**: 派生 boolean / 派生 state を作るときは「どの判定に使うか」を 1 つに絞る。複数の判定で使うなら **判定別に派生値を分ける**。`hasContent` のような汎用名は曖昧なので、`hasFullContent` / `hasSummaryOnly` / `canRender` のように **意図が読み取れる名前** を付ける。

## fallback ロジックの伝播範囲を意識する

`processedContent ?? article.summary ?? ""` のような fallback は、UI 描画では合理的でも、**そのまま判定ロジックに伝播させると意味が変わる**。fallback 結果を渡す境界で「fallback 適用後の値か / 元の値か」を明確に区別する。

```typescript
// アンチパターン: buildTtsText の fallback 結果がそのまま speak gate に伝播
function buildTtsText(article, processedContent) {
  return preprocessTtsText(toPlainText(processedContent ?? article.summary ?? ""));
}
// ↑ ttsText は常にサマリ fallback 込みで非空になる → shouldStartAutoSpeak の hasText 条件が常に true に

// 修正パターン: 判定側で「フル本文有無」を別途渡してゲートする
shouldStartAutoSpeak({
  hasText: !!ttsText.trim(),
  canFetch,
  hasFullContent, // ← fallback 適用前の事実
});
```

**How to apply**: fallback を含む文字列・配列を判定関数に渡すときは、判定側で「fallback されたかどうか」を別 boolean で受け取る。`hasText` のような fallback 後の事実だけでなく、`hasOriginal` のような fallback 前の事実も渡せるよう設計する。

### 派生ケース: 同じデータに対して動作する sibling 純粋関数は fallback chain を完全に揃える

`isArticleRead(article, readIds, readBeforeTimestamp)` と `pruneOldReadIds(readIds, articles, readBeforeTimestamp)` のように、**同じデータ構造の同じフィールドを判定軸にする sibling 純粋関数** を複数持つとき、判定で使う **fallback chain (`A ?? B ?? C`) を完全に揃える** こと。片方が `publishedAt ?? createdAt` でも他方が `publishedAt` だけだと、両関数の挙動が乖離して **「片方は既読扱いするのに他方は削除しない」** のような連鎖バグが起きる。

```typescript
// アンチパターン: isArticleRead は publishedAt ?? createdAt fallback を使うのに
// pruneOldReadIds は publishedAt だけしか見ない → readId が永久蓄積
function isArticleRead(article, readIds, cutoff) {
  const ts = article.publishedAt ?? article.createdAt; // fallback
  return ts && ts < cutoff; // ← cutoff 以前は一括既読扱い
}
function pruneOldReadIds(readIds, articles, cutoff) {
  for (const a of articles) {
    if (!a.publishedAt) continue; // ← createdAt fallback なし!
    if (Date.parse(a.publishedAt) < cutoff && readIds.has(a.id)) {
      removeSet.add(a.id);
    }
  }
}
// → publishedAt: null + createdAt 古い記事の readId が永久に残る

// 修正パターン: 完全に同じ fallback chain
function pruneOldReadIds(readIds, articles, cutoff) {
  for (const a of articles) {
    const tsRaw = a.publishedAt ?? a.createdAt; // ← isArticleRead と完全一致
    if (!tsRaw) continue;
    if (Date.parse(tsRaw) < cutoff && readIds.has(a.id)) {
      removeSet.add(a.id);
    }
  }
}
```

**How to apply**: 同じデータに動作する sibling 関数を作るときは:

1. **「判定で使うフィールド + fallback chain」を 1 箇所に定義** — 例: `getArticleTimestamp(a) = a.publishedAt ?? a.createdAt`
2. 全ての sibling 関数 (`isArticleRead` / `pruneOldReadIds` / `filterExpiredArticles` 等) が **その共通関数を呼ぶ**
3. 共通関数化が難しいなら、**各関数の判定行に `// {他関数名} と fallback chain を揃える` のコメントを置く**
4. 新しい sibling 関数を追加するときは既存の fallback chain を確認してから書く
5. **TDD で「fallback 適用ケース」を網羅** (例: `publishedAt: null` + `createdAt 古い` → 削除されるか)

主な使用箇所: `isArticleRead` (`article-filter.ts`) ↔ `pruneOldReadIds` (`read-state-prune.ts`) — `publishedAt ?? createdAt` fallback chain を統一 (`feedHash: "__saved__"` の手動保存記事や RSS で publishedAt 抜けの記事の readId が永久蓄積するバグ修正)

### 派生ケース: 派生 boolean は fallback 混入後の値ではなく、fallback **前の origin** から導出する

派生 boolean を「正しい用途名」で分離した (例: `hasContent` → `hasFullContent`) としても、**その派生元が fallback 込みの値**だと依然として誤判定が起きる。

```typescript
// アンチパターン: hasFullContent は名前は正しいが、processedContent が fallback 込み
const rawContent = storedContent ?? article?.content ?? null;
//                              ↑ ここで fallback が混入
const processedContent = rawContent ? processContent(rawContent) : null;
const hasFullContent = !!processedContent;
//                     ↑ article.content (RSS 本文) があれば fetch 前でも true → speak 早期発火

// 修正パターン: fallback 前の origin (storedContent) から直接導出
const hasFullContent = !!storedContent || !canFetch;
//                     ↑ fetch 完了済 OR fetch 不要のときだけ true
```

**How to apply**: 派生 boolean を作るとき:

1. **派生元を辿る**: `derived = !!middleValue` と書きたくなったら、`middleValue` の定義を見て fallback (`A ?? B ?? C`) が含まれていないか確認
2. **fallback 込みなら origin から再構築**: 「fetch 済か」を判定したいなら `!!storedContent`、「fetch 不要か」を判定したいなら `!canFetch`。両方なら `!!storedContent || !canFetch`
3. **テストで検証**: 「fallback 元 (article.content) があるが fetch 前」のケースで boolean が false になるか、ユニットテストで明示
