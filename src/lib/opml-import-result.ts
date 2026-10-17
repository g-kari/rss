import type { OpmlImportResult } from "../types";

/** Shared feedback for the sidebar and settings; skipped entries need not be duplicates. */
export function describeOpmlImportResult({
  added,
  skipped,
  failed = 0,
}: Pick<OpmlImportResult, "added" | "skipped" | "failed">): {
  text: string;
  isError: boolean;
} {
  if (![added, skipped, failed].every((count) => Number.isSafeInteger(count) && count >= 0)) {
    return { text: "インポート結果を確認できませんでした", isError: true };
  }
  if (failed > 0) {
    return {
      text: `${added}件追加、${skipped}件スキップ、${failed}件失敗しました`,
      isError: true,
    };
  }
  if (added > 0) {
    return {
      text:
        skipped > 0
          ? `${added}件インポートしました（${skipped}件スキップ）`
          : `${added}件インポートしました`,
      isError: false,
    };
  }
  if (skipped > 0) {
    return { text: `追加はありません（${skipped}件スキップ）`, isError: false };
  }
  return { text: "インポートできるフィードがありません", isError: true };
}
