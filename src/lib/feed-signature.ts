import type { Feed } from "../types";

/**
 * feeds の構造的内容 (sidebar layout に影響する field) を 1 行にシリアライズする。
 * 5 分 polling で `feeds` reference が毎回新しくなるが、構造的内容変化なしなら
 * 旧 signature と一致して下流の useMemo を再計算 skip させる。
 *
 * 含めるフィールド: id / title / category / groupId / nsfw / priority / view
 * (uncategorizedFeeds / categoryGroups / groupedFeeds / pinnedFeeds 派生に影響する全 field)
 */
export function computeFeedStructuralSignature(feeds: Feed[]): string {
  const parts: string[] = [];
  for (const f of feeds) {
    parts.push(
      `${f.id}|${f.title ?? ""}|${f.category ?? ""}|${f.groupId ?? ""}|${f.nsfw ? 1 : 0}|${f.priority ?? ""}|${f.view ?? ""}`,
    );
  }
  return parts.join("\n");
}

/**
 * `Record<articleId, tagId[]>` 形式の articleTagIds を構造的にシリアライズする。
 * `useReadStateTags` の `setTagIdsState` が 2 秒 debounce flush ごとに新 reference を生成
 * するが、内容変化なしなら signature 一致で下流 useMemo (tagCounts / sortedTags) を skip。
 *
 * `computeFeedStructuralSignature` と同 canonical pattern で全 entry 走査するが、
 * 1 entry = `articleId|tag1,tag2,...` で `tagId[]` も含めて encode。entry 順序は
 * Object.keys() の挿入順に依存するが、`useReadStateTags` は同 id に対して同じ順序で
 * tagIds を維持する設計のため、 sort 不要 (内容変化があれば文字列差分が出る)。
 */
export function computeArticleTagIdsSignature(articleTagIds: Record<string, string[]>): string {
  const parts: string[] = [];
  for (const [articleId, tagIds] of Object.entries(articleTagIds)) {
    parts.push(`${articleId}|${tagIds.join(",")}`);
  }
  return parts.join("\n");
}
