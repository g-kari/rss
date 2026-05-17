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
