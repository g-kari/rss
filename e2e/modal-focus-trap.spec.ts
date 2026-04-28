import { test, expect, type Page } from "@playwright/test";

/**
 * Modal フォーカストラップの E2E テスト（Issue #243）。
 *
 * Modal.tsx の handleKeyDown に実装されたフォーカストラップロジックを
 * 最小限の HTML + JS で再現し、ブラウザ上で Tab / Shift+Tab / Escape の
 * 挙動を検証する。認証不要。
 *
 * 検証する 2 つのバグ修正:
 * 1. Tab（Shift なし）でダイアログ自体にフォーカスがある場合、最初の
 *    focusable 要素に移動しなかった問題
 * 2. Escape ハンドラが window レベルだったため、子コンポーネントの
 *    stopPropagation が効かなかった問題
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * ダイアログ HTML + Modal.tsx と同じフォーカストラップ JS を注入する。
 * ダイアログは tabindex="-1" で初期フォーカスを受け、3 つのボタンを持つ。
 * Escape で `data-closed="true"` を付与する（onClose の代替）。
 */
async function setupDialog(page: Page) {
  await page.setContent(`
    <div id="backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:49"></div>
    <div id="dialog" role="dialog" aria-modal="true" tabindex="-1"
         style="position:fixed;z-index:50;top:50%;left:50%;transform:translate(-50%,-50%);
                padding:24px;background:white;border-radius:8px;outline:none">
      <button id="btn-first">最初のボタン</button>
      <input id="input-middle" type="text" placeholder="中間のテキスト入力" />
      <button id="btn-last">最後のボタン</button>
    </div>
  `);

  // Modal.tsx の handleKeyDown と同等のロジックを注入
  await page.evaluate((selector: string) => {
    const dialog = document.getElementById("dialog")!;
    dialog.focus();

    dialog.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dialog.setAttribute("data-closed", "true");
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(selector));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || document.activeElement === dialog) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || document.activeElement === dialog) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }, FOCUSABLE_SELECTOR);
}

/**
 * `data-closed` が付与されていないことを確認するヘルパー。
 */
async function expectNotClosed(page: Page) {
  const closed = await page.locator("#dialog").getAttribute("data-closed");
  expect(closed).toBeNull();
}

// =====================================================================
// フォーカストラップ
// =====================================================================

test.describe("Modal フォーカストラップ", () => {
  test("ダイアログ自体にフォーカスがある状態で Tab を押すと最初の focusable 要素に移動する", async ({
    page,
  }) => {
    await setupDialog(page);
    // ダイアログ自体にフォーカスがあることを確認
    await expect(page.locator("#dialog")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.locator("#btn-first")).toBeFocused();
  });

  test("ダイアログ自体にフォーカスがある状態で Shift+Tab を押すと最後の focusable 要素に移動する", async ({
    page,
  }) => {
    await setupDialog(page);
    await expect(page.locator("#dialog")).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#btn-last")).toBeFocused();
  });

  test("最後の focusable 要素から Tab で最初の要素にラップする", async ({ page }) => {
    await setupDialog(page);
    // 最後のボタンにフォーカスを移す
    await page.locator("#btn-last").focus();
    await expect(page.locator("#btn-last")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.locator("#btn-first")).toBeFocused();
  });

  test("最初の focusable 要素から Shift+Tab で最後の要素にラップする", async ({ page }) => {
    await setupDialog(page);
    // 最初のボタンにフォーカスを移す
    await page.locator("#btn-first").focus();
    await expect(page.locator("#btn-first")).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#btn-last")).toBeFocused();
  });

  test("中間の要素では Tab / Shift+Tab はブラウザデフォルトの順に移動する", async ({ page }) => {
    await setupDialog(page);
    // 中間の input にフォーカス
    await page.locator("#input-middle").focus();
    await expect(page.locator("#input-middle")).toBeFocused();

    // Tab → 次の要素（最後のボタン）
    await page.keyboard.press("Tab");
    await expect(page.locator("#btn-last")).toBeFocused();

    // Shift+Tab → 戻って input
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#input-middle")).toBeFocused();
  });
});

// =====================================================================
// Escape ハンドリング
// =====================================================================

test.describe("Modal Escape ハンドリング", () => {
  test("ダイアログで Escape を押すとモーダルが閉じる", async ({ page }) => {
    await setupDialog(page);
    await expectNotClosed(page);

    await page.keyboard.press("Escape");
    const closed = await page.locator("#dialog").getAttribute("data-closed");
    expect(closed).toBe("true");
  });

  test("子要素の input で stopPropagation すると Escape でモーダルが閉じない", async ({ page }) => {
    await setupDialog(page);

    // 子 input に stopPropagation する keydown リスナーを追加
    // （検索入力のクリアなどを想定）
    await page.evaluate(() => {
      const input = document.getElementById("input-middle")!;
      input.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          // 実際のアプリでは検索クリア等の処理がここに入る
          input.setAttribute("data-escape-handled", "true");
        }
      });
    });

    // input にフォーカスして Escape を押す
    await page.locator("#input-middle").focus();
    await page.keyboard.press("Escape");

    // 子の Escape ハンドラが処理した
    const handled = await page.locator("#input-middle").getAttribute("data-escape-handled");
    expect(handled).toBe("true");

    // モーダルは閉じていない
    await expectNotClosed(page);
  });

  test("子が stopPropagation しない場合は Escape がダイアログまで伝播して閉じる", async ({
    page,
  }) => {
    await setupDialog(page);

    // input にフォーカスして Escape を押す（stopPropagation なし）
    await page.locator("#input-middle").focus();
    await page.keyboard.press("Escape");

    // モーダルが閉じる
    const closed = await page.locator("#dialog").getAttribute("data-closed");
    expect(closed).toBe("true");
  });
});

// =====================================================================
// エッジケース
// =====================================================================

test.describe("Modal フォーカストラップ — エッジケース", () => {
  test("focusable 要素が 0 個の場合、Tab でフォーカスが外に出ない", async ({ page }) => {
    // focusable 要素を持たないダイアログを用意
    await page.setContent(`
      <div id="dialog" role="dialog" aria-modal="true" tabindex="-1"
           style="position:fixed;z-index:50;padding:24px;background:white;outline:none">
        <p>テキストのみ</p>
      </div>
    `);

    await page.evaluate((selector: string) => {
      const dialog = document.getElementById("dialog")!;
      dialog.focus();
      dialog.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          dialog.setAttribute("data-closed", "true");
          return;
        }
        if (e.key !== "Tab") return;
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(selector));
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
      });
    }, FOCUSABLE_SELECTOR);

    await expect(page.locator("#dialog")).toBeFocused();
    await page.keyboard.press("Tab");
    // ダイアログ自体にフォーカスが留まる（preventDefault により外に出ない）
    await expect(page.locator("#dialog")).toBeFocused();
  });

  test("focusable 要素が 1 個の場合、Tab で同じ要素にラップする", async ({ page }) => {
    await page.setContent(`
      <div id="dialog" role="dialog" aria-modal="true" tabindex="-1"
           style="position:fixed;z-index:50;padding:24px;background:white;outline:none">
        <button id="only-btn">唯一のボタン</button>
      </div>
    `);

    await page.evaluate((selector: string) => {
      const dialog = document.getElementById("dialog")!;
      dialog.focus();
      dialog.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          dialog.setAttribute("data-closed", "true");
          return;
        }
        if (e.key !== "Tab") return;
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(selector));
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === dialog) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || document.activeElement === dialog) {
            e.preventDefault();
            first.focus();
          }
        }
      });
    }, FOCUSABLE_SELECTOR);

    // ダイアログから Tab → 唯一のボタン
    await page.keyboard.press("Tab");
    await expect(page.locator("#only-btn")).toBeFocused();

    // ボタンから Tab → first === last なので同じボタン
    await page.keyboard.press("Tab");
    await expect(page.locator("#only-btn")).toBeFocused();

    // Shift+Tab → 同じボタン
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#only-btn")).toBeFocused();
  });
});
