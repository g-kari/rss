import { test, expect } from "@playwright/test";
import {
  SHARE_TARGETS,
  triggerShareTarget,
  type ShareTarget,
} from "../src/components/article-view/shareTargets";
import { isShareTargetId } from "../src/hooks/useHeaderShareTargets";

/**
 * triggerShareTarget の純粋関数テスト (DI で navigator/window 不要)。
 *
 * `clipboardText` 有り (Slack / Discord) と無し (X / Bluesky / LINE / Hatena)
 * の両分岐を deps 注入で検証する。
 */

const FAKE_LINK = "https://example.com/article";
const FAKE_TITLE = "Test Article";

test.describe("メール共有ターゲット", () => {
  test("件名と本文をエンコードした mailto URL を生成する", () => {
    const email = SHARE_TARGETS.find((target) => target.id === "email");

    expect(email).toBeDefined();
    expect(email!.buildUrl("https://example.com/article?a=1&b=2", "日本語 & TypeScript?")).toBe(
      "mailto:?subject=%E6%97%A5%E6%9C%AC%E8%AA%9E%20%26%20TypeScript%3F&body=%E6%97%A5%E6%9C%AC%E8%AA%9E%20%26%20TypeScript%3F%0Ahttps%3A%2F%2Fexample.com%2Farticle%3Fa%3D1%26b%3D2",
    );
  });

  test("保存済みクイック共有 ID として email を復元できる", () => {
    expect(isShareTargetId("email")).toBe(true);
    expect(isShareTargetId("unknown")).toBe(false);
  });
});

function buildTarget(overrides: Partial<ShareTarget>): ShareTarget {
  return {
    id: "x",
    label: "Test",
    buildUrl: (link, title) => `https://test.invalid/share?u=${link}&t=${title}`,
    icon: null,
    ...overrides,
  };
}

interface MockState {
  clipboardCalls: string[];
  openCalls: string[];
  clipboardShouldFail: boolean;
}

function setupDeps(state: MockState) {
  return {
    writeText: (text: string) => {
      state.clipboardCalls.push(text);
      return state.clipboardShouldFail
        ? Promise.reject(new Error("clipboard failed"))
        : Promise.resolve();
    },
    openWindow: (url: string) => {
      state.openCalls.push(url);
    },
  };
}

test.describe("triggerShareTarget — clipboardText 有り", () => {
  test("writeText 成功 → openWindow が呼ばれて copied=true", async () => {
    const state: MockState = { clipboardCalls: [], openCalls: [], clipboardShouldFail: false };
    const target = buildTarget({
      clipboardText: (link, title) => `${title}\n${link}`,
    });
    const result = await triggerShareTarget(target, FAKE_LINK, FAKE_TITLE, setupDeps(state));
    expect(state.clipboardCalls).toEqual([`${FAKE_TITLE}\n${FAKE_LINK}`]);
    expect(state.openCalls).toHaveLength(1);
    expect(state.openCalls[0]).toContain(FAKE_LINK);
    expect(result.copied).toBe(true);
  });

  test("writeText 失敗 → reject されて openWindow は呼ばれない", async () => {
    const state: MockState = { clipboardCalls: [], openCalls: [], clipboardShouldFail: true };
    const target = buildTarget({
      clipboardText: (link, title) => `${title}\n${link}`,
    });
    await expect(
      triggerShareTarget(target, FAKE_LINK, FAKE_TITLE, setupDeps(state)),
    ).rejects.toThrow();
    expect(state.openCalls).toHaveLength(0);
  });
});

test.describe("triggerShareTarget — clipboardText 無し", () => {
  test("直接 openWindow のみ呼ばれて copied=false", async () => {
    const state: MockState = { clipboardCalls: [], openCalls: [], clipboardShouldFail: false };
    const target = buildTarget({});
    const result = await triggerShareTarget(target, FAKE_LINK, FAKE_TITLE, setupDeps(state));
    expect(state.clipboardCalls).toEqual([]);
    expect(state.openCalls).toHaveLength(1);
    expect(state.openCalls[0]).toContain(FAKE_LINK);
    expect(result.copied).toBe(false);
  });
});
