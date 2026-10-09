import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useNativeControlSpace } from "./useNativeControlSpace";
function Fixture() {
  const ref = useRef<HTMLDivElement>(null);
  useNativeControlSpace(ref);
  return (
    <div ref={ref}>
      <button>保存</button>
      <details>
        <summary>読書補助</summary>
        <p>音声</p>
      </details>
      <p>本文</p>
    </div>
  );
}
afterEach(cleanup);
it("native buttons and summaries own Space without preventing their default activation", () => {
  const global = vi.fn();
  document.addEventListener("keydown", global);
  render(<Fixture />);
  for (const control of [screen.getByRole("button"), screen.getByText("読書補助")]) {
    const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    fireEvent(control, event);
    expect(event.defaultPrevented).toBe(false);
  }
  expect(global).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByText("本文"), { key: " " });
  expect(global).toHaveBeenCalledOnce();
  fireEvent.keyDown(screen.getByRole("button"), { key: "j" });
  expect(global).toHaveBeenCalledTimes(2);
  document.removeEventListener("keydown", global);
});
