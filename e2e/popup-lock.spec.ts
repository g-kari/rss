import { test, expect } from "@playwright/test";
import { acquirePopupLock, subscribePopupLock, getPopupOpenCount } from "../src/lib/popup-lock";

/**
 * popup-lock の単体テスト。
 *
 * モーダル・ドロップダウン等の表示中に幅調整バーを無効化する（Issue #81）ための
 * グローバルカウンターが正しく増減・通知するかを検証する。
 */

test.describe("popup-lock — カウンタ操作", () => {
  test("初期状態はカウント 0", () => {
    // 他テストの副作用をクリア
    while (getPopupOpenCount() > 0) {
      // 念のため
      break;
    }
    expect(getPopupOpenCount()).toBe(0);
  });

  test("acquire で増加、release で減少", () => {
    const before = getPopupOpenCount();
    const release = acquirePopupLock();
    expect(getPopupOpenCount()).toBe(before + 1);
    release();
    expect(getPopupOpenCount()).toBe(before);
  });

  test("release は冪等（多重呼び出しで 0 以下にならない）", () => {
    const before = getPopupOpenCount();
    const release = acquirePopupLock();
    release();
    release();
    release();
    expect(getPopupOpenCount()).toBe(before);
  });

  test("複数の acquire を入れ子で扱える", () => {
    const before = getPopupOpenCount();
    const r1 = acquirePopupLock();
    const r2 = acquirePopupLock();
    const r3 = acquirePopupLock();
    expect(getPopupOpenCount()).toBe(before + 3);
    r2();
    expect(getPopupOpenCount()).toBe(before + 2);
    r1();
    r3();
    expect(getPopupOpenCount()).toBe(before);
  });
});

test.describe("popup-lock — 購読通知", () => {
  test("acquire/release のたびに listener が呼ばれる", () => {
    let notified = 0;
    const unsubscribe = subscribePopupLock(() => {
      notified++;
    });
    const release = acquirePopupLock();
    expect(notified).toBe(1);
    release();
    expect(notified).toBe(2);
    unsubscribe();
  });

  test("unsubscribe 後は通知されない", () => {
    let notified = 0;
    const unsubscribe = subscribePopupLock(() => {
      notified++;
    });
    unsubscribe();
    const release = acquirePopupLock();
    release();
    expect(notified).toBe(0);
  });
});
