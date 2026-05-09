import { test, expect } from "@playwright/test";
import { triggerShareTarget, type ShareTarget } from "../src/components/article-view/shareTargets";

/**
 * triggerShareTarget の純粋関数テスト (DI で navigator/window 不要)。
 *
 * `clipboardText` 有り (Slack / Discord) と無し (X / Bluesky / LINE / Hatena)
 * の両分岐を deps 注入で検証する。
 */

const FAKE_LINK = "https://example.com/article";
const FAKE_TITLE = "Test Article";

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
