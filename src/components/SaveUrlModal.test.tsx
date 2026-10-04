import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import SaveUrlModal from "./SaveUrlModal";
import { useSaveUrlDialog } from "../hooks/useSaveUrlDialog";
import { useKeyboardNav } from "../hooks/useKeyboardNav";
import { makeKeyboardNavFixture } from "../../e2e/helpers/keyboard-nav-fixture";
import type { SaveArticleUrlResult } from "../hooks/useSaveArticleUrl";
afterEach(cleanup);
function Fixture({ save }: { save: () => Promise<SaveArticleUrlResult> }) {
  useKeyboardNav(makeKeyboardNavFixture());
  const dialog = useSaveUrlDialog(save);
  return (
    <>
      <button onClick={dialog.open}>URL を保存</button>
      {dialog.isOpen && (
        <SaveUrlModal
          url={dialog.url}
          onUrlChange={dialog.onUrlChange}
          saving={dialog.saving}
          error={dialog.error}
          onSave={(mode) => void dialog.onSave(mode)}
          onClose={dialog.close}
        />
      )}
    </>
  );
}
describe("SaveUrlModalの待機中キーボード所有権", () => {
  it("disabledになった保存ボタンからdialog内へfocusを保ち、Escapeで閉じて古い応答を無視する", async () => {
    let complete!: (response: SaveArticleUrlResult) => void;
    const pending = new Promise<SaveArticleUrlResult>((resolve) => {
      complete = resolve;
    });
    render(<Fixture save={vi.fn(() => pending)} />);
    fireEvent.click(screen.getByRole("button", { name: "URL を保存" }));
    fireEvent.change(screen.getByRole("textbox", { name: "保存する URL" }), {
      target: { value: "https://example.test/read" },
    });
    const save = screen.getByRole("button", { name: "ブックマーク" });
    save.focus();
    fireEvent.click(save);
    expect(save).toBeDisabled();
    const busy = document.querySelector<HTMLElement>('[aria-busy="true"]')!;
    expect(busy).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape", code: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "URL を保存" }));
    const input = screen.getByRole("textbox", { name: "保存する URL" });
    fireEvent.change(input, { target: { value: "https://example.test/new" } });
    await act(async () => {
      complete({ ok: false, error: "Old failure" });
      await pending;
    });
    expect(input).toHaveValue("https://example.test/new");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
