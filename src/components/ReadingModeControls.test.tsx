import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VisualModeProvider } from "../contexts/VisualModeContext";
import { STORAGE_KEYS } from "../lib/storage";
import ReadingModeControls from "./ReadingModeControls";

afterEach(() => {
  cleanup();
  localStorage.clear();
});
it("shares an entry while keeping visual preference and sequential reading independent", () => {
  const enter = vi.fn();
  render(
    <VisualModeProvider>
      <ReadingModeControls onEnterImmersive={enter} ready />
    </VisualModeProvider>,
  );
  const details = document.querySelector("details")!;
  const summary = document.querySelector("summary")!;
  fireEvent.click(summary);
  expect(details.open).toBe(true);
  const visual = screen.getByRole("button", { name: "ビジュアル表示" });
  fireEvent.click(visual);
  expect(visual).toHaveAttribute("aria-pressed", "true");
  expect(localStorage.getItem(STORAGE_KEYS.VISUAL_MODE)).toBe("cinema");
  expect(enter).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "ドパガキモード" }));
  expect(enter).toHaveBeenCalledOnce();
  expect(details.open).toBe(false);
  expect(summary).toHaveFocus();
  expect(localStorage.getItem(STORAGE_KEYS.VISUAL_MODE)).toBe("cinema");
  fireEvent.click(summary);
  fireEvent.keyDown(visual, { key: "Escape" });
  expect(details.open).toBe(false);
  expect(summary).toHaveFocus();
});
