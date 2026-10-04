import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSaveUrlDialog } from "./useSaveUrlDialog";
import type { SaveArticleUrlResult } from "./useSaveArticleUrl";
afterEach(cleanup);
const failure = { ok: false, error: "Synthetic failure" } as const;
const success = { ok: true } as const;
function deferred() {
  let resolve!: (value: SaveArticleUrlResult) => void;
  const promise = new Promise<SaveArticleUrlResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function setup(save = vi.fn<Parameters<typeof useSaveUrlDialog>[0]>()) {
  const hook = renderHook(() => useSaveUrlDialog(save));
  act(() => {
    hook.result.current.open();
  });
  act(() => {
    hook.result.current.onUrlChange(" https://example.test/read ");
  });
  return { ...hook, save };
}
describe("URL保存モーダルの再試行とセッション", () => {
  it("失敗時は入力とモーダルを保持し、成功した再試行だけでclear/closeする", async () => {
    const save = vi
      .fn<Parameters<typeof useSaveUrlDialog>[0]>()
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(success);
    const { result } = setup(save);
    await act(async () => {
      await result.current.onSave("bookmark");
    });
    expect(result.current).toMatchObject({
      url: " https://example.test/read ",
      isOpen: true,
      error: failure.error,
      saving: false,
    });
    expect(save).toHaveBeenCalledWith("https://example.test/read", "bookmark");
    await act(async () => {
      await result.current.onSave("reading_list");
    });
    expect(result.current).toMatchObject({ url: "", isOpen: false, error: null, saving: false });
  });
  it("予期しないcallback例外も入力を保持する", async () => {
    const { result } = setup(
      vi
        .fn<Parameters<typeof useSaveUrlDialog>[0]>()
        .mockRejectedValue(new Error("Synthetic thrown failure")),
    );
    await act(async () => {
      await result.current.onSave("bookmark");
    });
    expect(result.current).toMatchObject({
      isOpen: true,
      error: "Synthetic thrown failure",
      saving: false,
    });
    expect(result.current.url.trim()).toBe("https://example.test/read");
  });
  it("二重クリックをrender前にも拒み、待機中のURL編集を拒む", async () => {
    const pending = deferred();
    const { result, save } = setup(
      vi.fn<Parameters<typeof useSaveUrlDialog>[0]>().mockReturnValue(pending.promise),
    );
    let first!: Promise<void>;
    act(() => {
      first = result.current.onSave("bookmark");
      void result.current.onSave("reading_list");
      result.current.onUrlChange("different");
    });
    expect(save).toHaveBeenCalledOnce();
    expect(result.current.url.trim()).toBe("https://example.test/read");
    await act(async () => {
      pending.resolve(success);
      await first;
    });
  });
  it.each([failure, success])(
    "cancel後に開いた新モーダルへ古い応答 %jを適用しない",
    async (response) => {
      const old = deferred();
      const current = deferred();
      const { result, save } = setup(
        vi
          .fn<Parameters<typeof useSaveUrlDialog>[0]>()
          .mockReturnValueOnce(old.promise)
          .mockReturnValueOnce(current.promise),
      );
      let first!: Promise<void>;
      let second!: Promise<void>;
      act(() => {
        first = result.current.onSave("bookmark");
      });
      act(() => {
        result.current.close();
        result.current.open();
      });
      act(() => {
        result.current.onUrlChange("https://example.test/new");
      });
      act(() => {
        second = result.current.onSave("reading_list");
      });
      await act(async () => {
        old.resolve(response);
        await first;
      });
      expect(result.current).toMatchObject({
        isOpen: true,
        url: "https://example.test/new",
        error: null,
        saving: true,
      });
      expect(save).toHaveBeenCalledTimes(2);
      await act(async () => {
        current.resolve(failure);
        await second;
      });
      expect(result.current).toMatchObject({
        isOpen: true,
        url: "https://example.test/new",
        error: failure.error,
        saving: false,
      });
      act(() => {
        result.current.onUrlChange("https://example.test/revised");
      });
      expect(result.current.error).toBeNull();
    },
  );
  it("空入力・閉じた状態では保存しない", async () => {
    const { result, save } = setup();
    act(() => {
      result.current.onUrlChange(" ");
    });
    await act(async () => {
      await result.current.onSave("bookmark");
    });
    act(() => {
      result.current.close();
    });
    await act(async () => {
      await result.current.onSave("bookmark");
    });
    expect(save).not.toHaveBeenCalled();
  });
});
