import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAiPreferences } from "./useAiPreferences";
import { aiPreferenceKey } from "../lib/ai-preferences";
import { DEFAULT_AI_MODEL } from "../lib/ai-models";
import { STORAGE_KEYS } from "../lib/storage";

describe("AI settings persistence", () => {
  beforeEach(() => localStorage.clear());

  it("未設定は Auto と既存のデフォルトモデルを維持する", () => {
    const { result } = renderHook(() => useAiPreferences("user-a"));
    expect(result.current.aiProvider).toBe("auto");
    expect(result.current.aiModel).toBe(DEFAULT_AI_MODEL);
  });

  it("旧モデル設定を維持し、実行先とモデルをアカウントごとに保存する", () => {
    localStorage.setItem(STORAGE_KEYS.AI_MODEL, "@cf/meta/llama-3.2-3b-instruct");
    const { result, rerender, unmount } = renderHook(({ userId }) => useAiPreferences(userId), {
      initialProps: { userId: "user-a" },
    });
    expect(result.current.aiModel).toBe("@cf/meta/llama-3.2-3b-instruct");
    act(() => {
      result.current.onChangeAiProvider("workers-ai");
      result.current.onChangeAiModel("@cf/google/gemma-3-27b-it");
    });
    rerender({ userId: "user-b" });
    expect(result.current.aiProvider).toBe("auto");
    expect(result.current.aiModel).toBe("@cf/meta/llama-3.2-3b-instruct");
    act(() => result.current.onChangeAiProvider("browser"));
    rerender({ userId: "user-a" });
    expect(result.current.aiProvider).toBe("workers-ai");
    expect(result.current.aiModel).toBe("@cf/google/gemma-3-27b-it");
    unmount();
    const restored = renderHook(() => useAiPreferences("user-a"));
    expect(restored.result.current.aiProvider).toBe("workers-ai");
    expect(restored.result.current.aiModel).toBe("@cf/google/gemma-3-27b-it");
  });

  it("別タブの選択変更を反映し、不正な保存値は安全な既定値に戻す", () => {
    const { result } = renderHook(() => useAiPreferences("user-a"));
    const key = aiPreferenceKey(STORAGE_KEYS.AI_PROVIDER, "user-a");
    act(() => {
      localStorage.setItem(key, "workers-ai");
      window.dispatchEvent(new StorageEvent("storage", { key }));
    });
    expect(result.current.aiProvider).toBe("workers-ai");
    act(() => {
      localStorage.setItem(key, "malformed");
      window.dispatchEvent(new StorageEvent("storage", { key }));
    });
    expect(result.current.aiProvider).toBe("auto");
  });
});

afterEach(cleanup);
