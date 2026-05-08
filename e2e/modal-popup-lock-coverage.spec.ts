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

  // Issue #606: 親で常時マウント＋内部 isOpen 判定のモーダルが usePopupLock() を引数なしで呼ぶと、
  // アプリ起動から常時ロックが立ち、リサイザー等の `hasOpenPopup` 連動 UI が永続的に無効になる。
  // 検査対象は components/ 以下の React コンポーネントのみ（lib/release-notes-data.ts などの
  // データファイルにはリリースノート本文として `usePopupLock()` の文字列が含まれることがあるため除外）。
  test("`if (!isOpen) return null` パターンと `usePopupLock()` 引数なしの組合せを禁止", async () => {
    const files = await listTsxFiles(join(SRC_DIR, "components"));
    const offenders: string[] = [];
    for (const file of files) {
      const content = await readFile(file, "utf-8");
      const earlyReturn = /if\s*\(!\s*(isOpen|open|show|visible|active)\s*\)\s*return\s+null/i.test(
        content,
      );
      if (!earlyReturn) continue;
      const arglessLock = /usePopupLock\(\s*\)/.test(content);
      if (arglessLock) offenders.push(file.replace(SRC_DIR + "/", ""));
    }
    expect(offenders, `early return + usePopupLock 引数なし: ${offenders.join(", ")}`).toEqual([]);
  });
});
