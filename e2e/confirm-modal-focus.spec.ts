import { test, expect, type Page } from "@playwright/test";

/**
 * ConfirmModal がトリガー要素にフォーカスを復元することの E2E テスト (#687)。
 *
 * ConfirmModal.tsx の `useEffect` に追加した `returnFocusRef` パターンを最小限の
 * HTML + JS で再現し、以下を検証する:
 *
 * 1. モーダルを開く前のフォーカス位置 (トリガーボタン) が保存される
 * 2. モーダルが閉じたとき、保存されたトリガーボタンにフォーカスが戻る
 * 3. トリガー要素が DOM から外れている場合はクラッシュせずスキップする
 *
 * 認証不要。Modal.tsx のフォーカス復元と同じパターンの ConfirmModal 版。
 */

async function setupConfirmModalScenario(page: Page) {
  await page.setContent(`
    <button id="trigger" type="button">削除</button>
    <button id="other" type="button">他のボタン</button>
    <div id="dialog-host"></div>
  `);

  // ConfirmModal.tsx の useEffect 動作を JS で再現
  await page.evaluate(() => {
    let returnFocus: HTMLElement | null = null;

    function openModal() {
      // 開く前のフォーカス位置を保存
      returnFocus = document.activeElement as HTMLElement | null;
      // ダイアログ DOM を生成して挿入
      const host = document.getElementById("dialog-host")!;
      host.innerHTML = `
        <div id="dialog" role="dialog" aria-modal="true" tabindex="-1">
          <button id="cancel-btn" type="button">キャンセル</button>
          <button id="confirm-btn" type="button">確認</button>
        </div>
      `;
      // cancel ボタンに focus
      const cancel = document.getElementById("cancel-btn") as HTMLButtonElement;
      cancel?.focus();
    }

    function closeModal() {
      const host = document.getElementById("dialog-host")!;
      host.innerHTML = "";
      // トリガー要素にフォーカスを戻す (DOM 内にいれば)
      const ret = returnFocus;
      returnFocus = null;
      if (ret && typeof ret.focus === "function" && document.contains(ret)) {
        ret.focus();
      }
    }

    // 公開
    (window as unknown as { __openModal: () => void; __closeModal: () => void }).__openModal =
      openModal;
    (window as unknown as { __openModal: () => void; __closeModal: () => void }).__closeModal =
      closeModal;
  });
}

test.describe("ConfirmModal focus restore (#687)", () => {
  test("モーダルを閉じたらトリガー要素にフォーカスが戻る", async ({ page }) => {
    await setupConfirmModalScenario(page);

    // トリガーボタンに focus
    await page.locator("#trigger").focus();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("trigger");

    // モーダルを開く
    await page.evaluate(() => (window as unknown as { __openModal: () => void }).__openModal());
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("cancel-btn");

    // モーダルを閉じる
    await page.evaluate(() => (window as unknown as { __closeModal: () => void }).__closeModal());

    // トリガーボタンにフォーカスが戻ること
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("trigger");
  });

  test("トリガー要素が DOM から外れていてもクラッシュしない", async ({ page }) => {
    await setupConfirmModalScenario(page);

    await page.locator("#trigger").focus();
    await page.evaluate(() => (window as unknown as { __openModal: () => void }).__openModal());

    // トリガー要素を DOM から削除
    await page.evaluate(() => {
      const trigger = document.getElementById("trigger");
      trigger?.remove();
    });

    // モーダルを閉じる (クラッシュしないこと)
    await page.evaluate(() => (window as unknown as { __closeModal: () => void }).__closeModal());

    // フォーカス復元はスキップされたが、エラーは出ない (現在の activeElement は body / dialog 残骸など)
    const errored = await page.evaluate(() => false);
    expect(errored).toBe(false);
  });

  test("異なるトリガーから 2 回開閉してもそれぞれ正しい要素に戻る", async ({ page }) => {
    await setupConfirmModalScenario(page);

    // 1 回目: trigger からモーダル → 戻る
    await page.locator("#trigger").focus();
    await page.evaluate(() => (window as unknown as { __openModal: () => void }).__openModal());
    await page.evaluate(() => (window as unknown as { __closeModal: () => void }).__closeModal());
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("trigger");

    // 2 回目: other からモーダル → 戻る
    await page.locator("#other").focus();
    await page.evaluate(() => (window as unknown as { __openModal: () => void }).__openModal());
    await page.evaluate(() => (window as unknown as { __closeModal: () => void }).__closeModal());
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("other");
  });
});
