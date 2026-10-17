import { test, expect } from "@playwright/test";
import { describeOpmlImportResult } from "../src/lib/opml-import-result";

// Pure logic only: no page, browser, server, credentials, or real storage fixtures.
test.describe("OPML import result feedback", () => {
  for (const scenario of [
    {
      name: "success",
      counts: { added: 2, skipped: 0, failed: 0 },
      text: "2件インポートしました",
      isError: false,
    },
    {
      name: "ordinary skips are not proof of existing subscriptions",
      counts: { added: 0, skipped: 2, failed: 0 },
      text: "追加はありません（2件スキップ）",
      isError: false,
    },
    {
      name: "legacy response without failed",
      counts: { added: 0, skipped: 1 },
      text: "追加はありません（1件スキップ）",
      isError: false,
    },
    {
      name: "all metadata preparation failed",
      counts: { added: 0, skipped: 0, failed: 2 },
      text: "0件追加、0件スキップ、2件失敗しました",
      isError: true,
    },
    {
      name: "partial metadata preparation failed",
      counts: { added: 1, skipped: 2, failed: 1 },
      text: "1件追加、2件スキップ、1件失敗しました",
      isError: true,
    },
    {
      name: "success with skips",
      counts: { added: 1, skipped: 2, failed: 0 },
      text: "1件インポートしました（2件スキップ）",
      isError: false,
    },
  ]) {
    test(scenario.name, () => {
      expect(describeOpmlImportResult(scenario.counts)).toEqual({
        text: scenario.text,
        isError: scenario.isError,
      });
    });
  }
  test("empty and invalid result counts are not success", () => {
    for (const counts of [
      { added: 0, skipped: 0, failed: 0 },
      { added: -1, skipped: 1, failed: 0 },
      { added: 1, skipped: 0, failed: Number.NaN },
    ]) {
      expect(describeOpmlImportResult(counts).isError).toBe(true);
    }
  });
});
