import { test, expect } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * `fixed inset-0 z-5*` のフルスクリーンオーバーレイを持つコンポーネントはすべて
 * `usePopupLock` を呼んでいることを保証する静的検査（Issue #81 再発防止）。
 *
 * ロック未取得のモーダルがあると幅調整バーが表示中も操作できてしまう。
 * 新たにモーダルを追加する場合は `usePopupLock()`（常時）または
 * `usePopupLock(flag)`（条件付き）を呼ぶこと。
 *
 * 例外: `createPortal` でレンダリングしている上で `usePortalMenu` を使っている場合は
 * `usePortalMenu` 側で `usePopupLock(open)` 済みのため、直接呼ぶ必要はない。
 */

const SRC_DIR = join(process.cwd(), "src");
// 許可リスト: ロックを取らなくて良い特殊ケース
const ALLOWED_WITHOUT_LOCK = new Set([
  // NSFW アニメはフルスクリーン遷移エフェクト。表示中はどのみち全画面を覆うため
  // リサイズバーとの競合が発生しない。
  "components/NSFWEyeAnimation.tsx",
  // ImageDownloadModal は presentational。親 ArticleView.tsx で usePopupLock(confirmingDownload) 済み。
  "components/article-view/ImageDownloadModal.tsx",
  // 記事一覧のレイアウト基盤で popup ではないが fixed overlay になっている等の
  // 実質 popup でないケースは必要に応じてここに追加する。
]);

async function listTsxFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listTsxFiles(abs)));
    else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) out.push(abs);
  }
  return out;
}

test.describe("popup-lock カバレッジ — fixed inset-0 モーダル網羅", () => {
  test("fixed inset-0 z-5* を持つファイルは全て usePopupLock を呼んでいる", async () => {
    const files = await listTsxFiles(SRC_DIR);
    const offenders: string[] = [];
    // usePopupLock / usePortalMenu を呼ぶと間接的にロックが立つ
    const lockMarkers = ["usePopupLock", "usePortalMenu"];
    for (const file of files) {
      const content = await readFile(file, "utf-8");
      const hasOverlay = /fixed inset-0[^"'`]*z-\[?5\d?\]?/.test(content);
      if (!hasOverlay) continue;
      const hasLock = lockMarkers.some((m) => content.includes(m));
      const rel = file.replace(SRC_DIR + "/", "");
      if (ALLOWED_WITHOUT_LOCK.has(rel)) continue;
      if (!hasLock) offenders.push(rel);
    }
    expect(offenders, `ロック未取得のモーダル: ${offenders.join(", ")}`).toEqual([]);
  });
});
