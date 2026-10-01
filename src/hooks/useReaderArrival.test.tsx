import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReaderArrival } from "./useReaderArrival";

const mocks = vi.hoisted(() => ({
  policy: { motionAllowed: true, pageVisible: true },
  animate: vi.fn(),
  load: vi.fn(),
  revert: vi.fn(),
}));
vi.mock("../contexts/VisualModeContext", () => ({ useVisualMode: () => mocks.policy }));
vi.mock("../lib/reader-motion", async (original) => ({
  ...(await original<typeof import("../lib/reader-motion")>()),
  loadReaderAnimation: mocks.load,
}));
vi.mock("../lib/dev-log", () => ({ devError: vi.fn() }));

let frames: Map<number, FrameRequestCallback>;
let frameId: number;
function Fixture({
  event = "feed-a",
  ids = ["a", "b"],
  renderedIds = ids,
  article = false,
}: {
  event?: string;
  ids?: string[];
  renderedIds?: string[];
  article?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useReaderArrival(ref, article ? "article" : "list", event, ids);
  return (
    <div ref={ref} data-testid="root">
      {article ? (
        <>
          <h1 data-reader-arrival="title">Title</h1>
          <div data-reader-arrival="meta">Meta</div>
          <div data-reader-arrival="body">
            <input defaultValue="kept" />
          </div>
        </>
      ) : (
        renderedIds.map((id) => (
          <div key={id} role="article" aria-labelledby={`article-title-${id}`}>
            {id}
          </div>
        ))
      )}
    </div>
  );
}
async function frame() {
  await act(async () => {
    // Callbacks scheduled by this tick belong to the next animation frame.
    const scheduled = new Map(frames);
    for (const [id, callback] of scheduled) {
      frames.delete(id);
      callback(0);
    }
    await Promise.resolve();
  });
}

beforeEach(() => {
  mocks.policy.motionAllowed = true;
  mocks.policy.pageVisible = true;
  mocks.animate.mockReset().mockImplementation(() => ({ revert: mocks.revert }));
  mocks.load.mockReset().mockResolvedValue({ animate: mocks.animate });
  mocks.revert.mockReset();
  frameId = 0;
  frames = new Map();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.set(++frameId, cb);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 300,
    bottom: 400,
    width: 300,
    height: 400,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useReaderArrival", () => {
  it("does not import animation or schedule work in instant mode", async () => {
    mocks.policy.motionAllowed = false;
    const { rerender } = render(<Fixture />);
    rerender(<Fixture event="feed-b" />);
    await frame();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });
  it("bounds arrivals to eight visible inner surfaces without animating placement", async () => {
    render(<Fixture ids={Array.from({ length: 200 }, (_, i) => String(i))} />);
    await frame();
    expect(mocks.animate).toHaveBeenCalledTimes(8);
    for (const [target] of mocks.animate.mock.calls)
      expect(target.getAttribute("role")).toBe("article");
    expect(mocks.animate.mock.calls.at(-1)?.[1].delay).toBe(175);
  });
  it("does not replay on polling, scroll remounts, or selection-only renders", async () => {
    const { rerender } = render(<Fixture />);
    await frame();
    rerender(<Fixture ids={["a", "b"]} />);
    await frame();
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.animate).toHaveBeenCalledTimes(2);
  });
  it("animates only appended IDs and ignores offscreen targets", async () => {
    const { rerender, container } = render(<Fixture />);
    await frame();
    mocks.animate.mockClear();
    rerender(<Fixture ids={["a", "b", "c", "d"]} />);
    container.querySelector('[aria-labelledby="article-title-d"]')!.getBoundingClientRect = () => ({
      top: 900,
      bottom: 1100,
      left: 0,
      right: 300,
      width: 300,
      height: 200,
      x: 0,
      y: 900,
      toJSON: () => ({}),
    });
    await frame();
    expect(mocks.animate).toHaveBeenCalledTimes(1);
    expect(mocks.animate.mock.calls[0][0].textContent).toBe("c");
  });
  it("cancels decoration on policy restriction and never replays on restoration", async () => {
    const { rerender } = render(<Fixture />);
    await frame();
    mocks.policy.motionAllowed = false;
    rerender(<Fixture />);
    expect(mocks.revert).toHaveBeenCalledTimes(2);
    mocks.policy.motionAllowed = true;
    rerender(<Fixture />);
    await frame();
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it("rejects a late import after newer navigation or unmount", async () => {
    let resolve!: (module: { animate: typeof mocks.animate }) => void;
    mocks.load.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { rerender, unmount } = render(<Fixture />);
    await frame();
    mocks.policy.motionAllowed = false;
    rerender(<Fixture event="feed-b" />);
    unmount();
    await act(async () => resolve({ animate: mocks.animate }));
    expect(mocks.animate).not.toHaveBeenCalled();
  });
  it("leaves stateful article content mounted and only decorates presentation targets", async () => {
    const { rerender, getByRole } = render(<Fixture article event="article-a" />);
    const input = getByRole("textbox") as HTMLInputElement;
    input.value = "edited";
    await frame();
    rerender(<Fixture article event="article-b" />);
    await frame();
    expect(getByRole("textbox")).toBe(input);
    expect(input.value).toBe("edited");
    expect(mocks.animate).toHaveBeenCalledTimes(6);
  });
  it("fails open if animation cannot load", async () => {
    mocks.load.mockRejectedValue(new Error("offline chunk"));
    const { getByRole } = render(<Fixture article />);
    await frame();
    expect(getByRole("textbox")).toHaveValue("kept");
    expect(mocks.animate).not.toHaveBeenCalled();
  });
  it("cancels on hiding and does not replay an already-consumed arrival on return", async () => {
    const { rerender } = render(<Fixture />);
    await frame();
    mocks.policy.pageVisible = false;
    rerender(<Fixture />);
    expect(mocks.revert).toHaveBeenCalledTimes(2);
    mocks.policy.pageVisible = true;
    rerender(<Fixture />);
    await frame();
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it("skips an import that arrives after the decoration latency budget", async () => {
    let resolve!: (module: { animate: typeof mocks.animate }) => void;
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    mocks.load.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<Fixture />);
    await frame();
    now.mockReturnValue(200);
    await act(async () => resolve({ animate: mocks.animate }));
    expect(mocks.animate).not.toHaveBeenCalled();
  });
  it("bounds geometry scans even when a large gallery has no early visible items", async () => {
    const { container } = render(
      <Fixture ids={Array.from({ length: 200 }, (_, i) => String(i))} />,
    );
    let measurements = 0;
    for (const element of container.querySelectorAll('[role="article"]')) {
      element.getBoundingClientRect = () => {
        measurements++;
        return {
          top: 900,
          bottom: 1100,
          left: 0,
          right: 300,
          width: 300,
          height: 200,
          x: 0,
          y: 900,
          toJSON: () => ({}),
        };
      };
    }
    await frame();
    expect(measurements).toBe(64);
    expect(mocks.animate).not.toHaveBeenCalled();
  });
  it("waits one bounded frame for the incoming IDs to reach committed list DOM", async () => {
    const { rerender } = render(<Fixture />);
    await frame();
    mocks.animate.mockClear();
    rerender(<Fixture event="feed-b" ids={["c", "d"]} renderedIds={["a", "b"]} />);
    await frame();
    expect(mocks.animate).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
    rerender(<Fixture event="feed-b" ids={["c", "d"]} />);
    await frame();
    expect(mocks.animate.mock.calls.map(([target]) => target.textContent)).toEqual(["c", "d"]);
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(frames.size).toBe(0);
  });
  it("retries zero geometry without exceeding the event's shared measurement budget", async () => {
    const { container } = render(<Fixture ids={["a"]} />);
    const element = container.querySelector('[role="article"]')!;
    const zero = vi.fn().mockReturnValue({ width: 0, height: 0 });
    element.getBoundingClientRect = zero;
    await frame();
    expect(mocks.animate).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
    element.getBoundingClientRect = () => ({
      top: 0,
      bottom: 100,
      left: 0,
      right: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    await frame();
    expect(mocks.animate).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(zero).toHaveBeenCalledTimes(1);
  });
  it("shares the 64-measurement cap even when every target has zero geometry", async () => {
    const { container } = render(
      <Fixture ids={Array.from({ length: 100 }, (_, i) => String(i))} />,
    );
    let measurements = 0;
    for (const element of container.querySelectorAll('[role="article"]'))
      element.getBoundingClientRect = () => {
        measurements++;
        return { width: 0, height: 0 } as DOMRect;
      };
    await frame();
    await frame();
    expect(measurements).toBe(64);
    expect(frames.size).toBe(0);
    expect(mocks.animate).not.toHaveBeenCalled();
  });
  it("stops after one readiness retry and never replays on a later DOM-only render", async () => {
    const { rerender } = render(<Fixture renderedIds={[]} />);
    await frame();
    await frame();
    expect(frames.size).toBe(0);
    rerender(<Fixture />);
    await frame();
    expect(mocks.animate).not.toHaveBeenCalled();
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it("cancels the readiness retry when motion turns off", async () => {
    const { rerender } = render(<Fixture renderedIds={[]} />);
    await frame();
    expect(frames.size).toBe(1);
    mocks.policy.motionAllowed = false;
    rerender(<Fixture />);
    await frame();
    expect(frames.size).toBe(0);
    expect(mocks.animate).not.toHaveBeenCalled();
  });
  it("keeps the original latency deadline during the readiness retry", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const { rerender } = render(<Fixture renderedIds={[]} />);
    await frame();
    now.mockReturnValue(200);
    rerender(<Fixture />);
    await frame();
    expect(mocks.animate).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });
});
