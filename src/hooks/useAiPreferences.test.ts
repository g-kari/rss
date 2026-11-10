import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAiPreferences } from "./useAiPreferences";
import { aiPreferenceKey, loadAiPreferences, aiResultCacheKey } from "../lib/ai-preferences";
import { DEFAULT_AI_MODEL } from "../lib/ai-models";
import { STORAGE_KEYS } from "../lib/storage";

describe("AI settings persistence", () => {
  beforeEach(() => localStorage.clear());

  it("未設定は Auto と新しいデフォルトモデルを使う", () => {
    const { result } = renderHook(() => useAiPreferences("user-a"));
    expect(result.current.aiProvider).toBe("auto");
    expect(result.current.aiModel).toBe(DEFAULT_AI_MODEL);
  });

  it("旧モデル設定を維持し、実行先とモデルをアカウントごとに保存する", () => {
    localStorage.setItem(STORAGE_KEYS.AI_MODEL, "@cf/mistralai/mistral-small-3.1-24b-instruct");
    const { result, rerender, unmount } = renderHook(({ userId }) => useAiPreferences(userId), {
      initialProps: { userId: "user-a" },
    });
    expect(result.current.aiModel).toBe("@cf/mistralai/mistral-small-3.1-24b-instruct");
    act(() => {
      result.current.onChangeAiProvider("workers-ai");
      result.current.onChangeAiModel("@cf/qwen/qwen3.8-27b");
    });
    rerender({ userId: "user-b" });
    expect(result.current.aiProvider).toBe("auto");
    expect(result.current.aiModel).toBe("@cf/mistralai/mistral-small-3.1-24b-instruct");
    act(() => result.current.onChangeAiProvider("browser"));
    rerender({ userId: "user-a" });
    expect(result.current.aiProvider).toBe("workers-ai");
    expect(result.current.aiModel).toBe("@cf/qwen/qwen3.8-27b");
    unmount();
    const restored = renderHook(() => useAiPreferences("user-a"));
    expect(restored.result.current.aiProvider).toBe("workers-ai");
    expect(restored.result.current.aiModel).toBe("@cf/qwen/qwen3.8-27b");
  });

  it.each([
    "@cf/meta/llama-3.1-8b-instruct",
    "@cf/meta/llama-3.1-70b-instruct",
    "@cf/meta/llama-3.2-3b-instruct",
    "@cf/qwen/qwen3-30b-a3b-fp8",
    "@cf/google/gemma-3-27b-it",
    "@cf/qwen/qwen2.5-coder-1.5b-instruct",
  ])("廃止・利用不能な保存設定 %s を非破壊で読み替え、旧結果と分離する", (model) => {
    const key = aiPreferenceKey(STORAGE_KEYS.AI_MODEL, "user-a");
    localStorage.setItem(STORAGE_KEYS.AI_MODEL, model);
    localStorage.setItem(key, model);
    localStorage.setItem(aiPreferenceKey(STORAGE_KEYS.AI_PROVIDER, "user-a"), "workers-ai");
    const write = vi.spyOn(Storage.prototype, "setItem");
    const preferences = loadAiPreferences("user-a");
    expect(preferences).toEqual({
      model: DEFAULT_AI_MODEL,
      provider: "workers-ai",
      userId: "user-a",
    });
    expect(loadAiPreferences("user-b").model).toBe(DEFAULT_AI_MODEL);
    expect(aiResultCacheKey(preferences, "article", "https://example.com")).not.toContain(model);
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe(model);
    write.mockRestore();
  });

  it("有効な個別選択とブラウザー限定設定を廃止済み共通値より優先する", () => {
    localStorage.setItem(STORAGE_KEYS.AI_MODEL, "@cf/meta/llama-3.1-8b-instruct");
    localStorage.setItem(
      aiPreferenceKey(STORAGE_KEYS.AI_MODEL, "user-a"),
      "@cf/mistralai/mistral-small-3.1-24b-instruct",
    );
    localStorage.setItem(aiPreferenceKey(STORAGE_KEYS.AI_PROVIDER, "user-a"), "browser");
    const { result } = renderHook(() => useAiPreferences("user-a"));
    expect(result.current.aiProvider).toBe("browser");
    expect(result.current.aiModel).toBe("@cf/mistralai/mistral-small-3.1-24b-instruct");
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
