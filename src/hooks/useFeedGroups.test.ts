/**
 * useFeedGroups#reorderGroup の差分 rollback spec (#1087 Finding 3)。
 *
 * 旧実装は reorder の PATCH 失敗時に `setGroups(sortByOrder(snapshot))` で全 groups を
 * 丸ごと復元していたため、reorder in-flight 中に確定した別 group の collapse/mute/rename が
 * 巻き戻されて消失していた。swap した 2 group の order のみを元値に戻す差分復元で、window 中の
 * 他フィールド変更が保持されることを固定する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("../lib/api-fetch", () => ({
  apiFetch: vi.fn(),
  apiFetchJson: vi.fn(),
  tryParseErrorBody: vi.fn(async (res: Response) => res.json().catch(() => ({}))),
}));

import { apiFetch, apiFetchJson } from "../lib/api-fetch";
import type { FeedGroup, UserProfile } from "../types";
import { useFeedGroups } from "./useFeedGroups";

const mockApiFetch = vi.mocked(apiFetch);
const mockApiFetchJson = vi.mocked(apiFetchJson);

const user = { id: "u1", sub: "sub1" } as UserProfile;

function group(id: string, order: number, extra: Partial<FeedGroup> = {}): FeedGroup {
  return { id, name: id, order, collapsed: false, muted: false, createdAt: "", ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useFeedGroups#reorderGroup 差分 rollback (#1087)", () => {
  it("reorder 失敗時、in-flight 中に確定した別操作 (collapse) を rollback で巻き戻さない", async () => {
    // mount fetch: g1(order=0), g2(order=1)
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => [group("g1", 0), group("g2", 1)],
    } as Response);

    // apiFetchJson: reorder は deferred reject、それ以外 (setCollapsed) は即時 resolve
    let rejectReorder: ((e: unknown) => void) | null = null;
    mockApiFetchJson.mockImplementation((url: string) => {
      if (url.includes("/reorder")) {
        return new Promise((_resolve, reject) => {
          rejectReorder = reject;
        });
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(() => useFeedGroups(user));
    await waitFor(() => expect(result.current.groups.length).toBe(2));

    // reorder 開始 (楽観的 swap: g1.order=1, g2.order=0)。PATCH は pending。
    let reorderPromise: Promise<void>;
    act(() => {
      reorderPromise = result.current.reorderGroup("g1", "down");
    });
    expect(result.current.groups.find((g) => g.id === "g1")?.order).toBe(1);

    // window 中: 別操作で g2 を collapse 確定
    await act(async () => {
      await result.current.setCollapsed("g2", true);
    });
    expect(result.current.groups.find((g) => g.id === "g2")?.collapsed).toBe(true);

    // reorder PATCH 失敗 → rollback
    await act(async () => {
      rejectReorder?.(new Error("reorder failed"));
      await reorderPromise.catch(() => {});
    });

    const g1 = result.current.groups.find((g) => g.id === "g1");
    const g2 = result.current.groups.find((g) => g.id === "g2");
    // order は swap 前に復元
    expect(g1?.order).toBe(0);
    expect(g2?.order).toBe(1);
    // window 中の collapse 変更は保持される (旧実装では snapshot 丸ごと復元で false に戻っていた)
    expect(g2?.collapsed).toBe(true);
  });
});
