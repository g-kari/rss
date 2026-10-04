import { StrictMode, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FeedAddModal from "./FeedAddModal";
import { useFeedOperations } from "../hooks/useFeedOperations";

vi.mock("./VisualModeBar", () => ({ VisualModeSwitch: () => null }));
const changed = vi.fn();
const added = vi.fn();
const request = vi.fn<typeof fetch>();
const firstUrl = "https://example.test/feed.xml";
const nextUrl = "https://other.test/feed.xml";
const options = { cookie: "synthetic_cookie=1", cssSelector: "article a", useRsshub: false };

function Fixture({ initialUrl = "" }: { initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [open, setOpen] = useState(true);
  const operations = useFeedOperations({
    onFeedAdded: added,
    onFeedDeleted: vi.fn(),
    onFeedRenamed: vi.fn(),
    onFeedsImported: vi.fn(),
  });
  function close() {
    setOpen(false);
    setUrl("");
    operations.clearError();
  }
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <button onClick={() => setUrl(nextUrl)}>Replace externally</button>
      {open && (
        <FeedAddModal
          url={url}
          onUrlChange={(value) => {
            changed(value);
            setUrl(value);
          }}
          cookie={options.cookie}
          onCookieChange={vi.fn()}
          cssSelector={options.cssSelector}
          onCssSelectorChange={vi.fn()}
          cookieOpen
          onCookieOpenChange={vi.fn()}
          cssSelectorOpen
          onCssSelectorOpenChange={vi.fn()}
          useRsshub={options.useRsshub}
          onUseRsshubChange={vi.fn()}
          adding={operations.adding}
          error={operations.error || null}
          onSubmit={async (event) => {
            event.preventDefault();
            await operations.addFeed(
              url,
              close,
              options.cookie,
              options.cssSelector,
              options.useRsshub,
            );
          }}
          onClose={close}
        />
      )}
    </>
  );
}
function paste(value = firstUrl) {
  return fireEvent.paste(screen.getByLabelText("フィード URL"), {
    clipboardData: { getData: () => value },
  });
}
async function flushPaste() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
function body() {
  const [path, init] = request.mock.calls[0];
  expect(path).toBe("/api/feeds");
  expect(init?.method).toBe("POST");
  return JSON.parse(String(init?.body));
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("fetch", request);
  request.mockResolvedValue(
    new Response(JSON.stringify({ id: "synthetic-feed", url: firstUrl }), { status: 200 }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("FeedAddModal paste & go", () => {
  it("submits the committed pasted URL exactly once through the production operation hook", async () => {
    render(
      <StrictMode>
        <Fixture initialUrl={nextUrl} />
      </StrictMode>,
    );
    paste();
    await flushPaste();
    expect(request).toHaveBeenCalledTimes(1);
    expect(body()).toEqual({ url: firstUrl, ...options });
    expect(added).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it.each([
    "",
    "not a URL",
    "https://",
    "http://",
    "https://bad host.test",
    "ftp://example.test/feed",
    "/feed.xml",
  ])("does not auto-submit invalid or partial paste %j", async (value) => {
    render(<Fixture />);
    paste(value);
    await flushPaste();
    expect(request).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });
  it.each(["キャンセル", "閉じる", "Escape"])(
    "cancels queued paste before %s and does not contaminate reopening",
    async (close) => {
      render(<Fixture />);
      paste();
      if (close === "Escape")
        fireEvent.keyDown(screen.getByLabelText("フィード URL"), { key: "Escape" });
      else fireEvent.click(screen.getByRole("button", { name: close }));
      const before = changed.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: "Open" }));
      await flushPaste();
      expect(request).not.toHaveBeenCalled();
      expect(changed).toHaveBeenCalledTimes(before);
      expect(screen.getByLabelText("フィード URL")).toHaveValue("");
      fireEvent.change(screen.getByLabelText("フィード URL"), { target: { value: nextUrl } });
      fireEvent.click(screen.getByRole("button", { name: "追加" }));
      await flushPaste();
      expect(request).toHaveBeenCalledTimes(1);
      expect(body().url).toBe(nextUrl);
    },
  );
  it("does not call URL callbacks or submit after unmount", async () => {
    const mounted = render(<Fixture />);
    paste();
    mounted.unmount();
    const before = changed.mock.calls.length;
    await flushPaste();
    expect(changed).toHaveBeenCalledTimes(before);
    expect(request).not.toHaveBeenCalled();
  });
  it("cancels auto-submit when newer typing replaces the pasted URL", async () => {
    render(<Fixture />);
    paste();
    fireEvent.change(screen.getByLabelText("フィード URL"), { target: { value: nextUrl } });
    await flushPaste();
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByLabelText("フィード URL")).toHaveValue(nextUrl);
  });
  it("does not replay a pending paste after an external draft replacement", async () => {
    render(<Fixture />);
    paste();
    fireEvent.click(screen.getByRole("button", { name: "Replace externally" }));
    await flushPaste();
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByLabelText("フィード URL")).toHaveValue(nextUrl);
  });
  it("repeated paste before submission keeps only the latest URL", async () => {
    render(<Fixture />);
    paste();
    paste(nextUrl);
    paste(nextUrl);
    await flushPaste();
    expect(request).toHaveBeenCalledTimes(1);
    expect(body().url).toBe(nextUrl);
  });
  it("manual submit consumes queued paste without a duplicate request", async () => {
    render(<Fixture />);
    paste();
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    await flushPaste();
    expect(request).toHaveBeenCalledTimes(1);
    expect(body().url).toBe(firstUrl);
  });
  it("blocks paste, manual submit and close while an add request is in flight", async () => {
    let release!: (response: Response) => void;
    request.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    render(<Fixture />);
    paste();
    await flushPaste();
    expect(screen.getByLabelText("フィード URL")).toBeDisabled();
    paste(nextUrl);
    fireEvent.submit(screen.getByLabelText("フィード URL").closest("form")!);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    fireEvent.keyDown(screen.getByLabelText("フィード URL"), { key: "Escape" });
    await flushPaste();
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("フィード URL")).toHaveValue(firstUrl);
    await act(async () => {
      release(new Response(JSON.stringify({ id: "synthetic-feed" }), { status: 200 }));
    });
  });
  it("keeps the URL and options after error and permits a manual retry", async () => {
    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Synthetic add failed" }), { status: 503 }),
    );
    render(<Fixture />);
    paste();
    await flushPaste();
    expect(screen.getByText("Synthetic add failed")).toBeInTheDocument();
    expect(screen.getByLabelText("フィード URL")).toHaveValue(firstUrl);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(request).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    await flushPaste();
    expect(request).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({
      url: firstUrl,
      ...options,
    });
  });
  it("ordinary typing does not auto-submit and manual Add still submits", async () => {
    render(<Fixture />);
    fireEvent.change(screen.getByLabelText("フィード URL"), { target: { value: firstUrl } });
    await flushPaste();
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    await flushPaste();
    expect(request).toHaveBeenCalledTimes(1);
    expect(body()).toEqual({ url: firstUrl, ...options });
  });
  it("IME start cancels queued paste and composing Enter does not submit", async () => {
    render(<Fixture />);
    paste();
    const input = screen.getByLabelText("フィード URL");
    fireEvent.compositionStart(input);
    expect(fireEvent.keyDown(input, { key: "Enter", isComposing: true })).toBe(false);
    expect(fireEvent.keyDown(input, { key: "Enter", keyCode: 229 })).toBe(false);
    paste(nextUrl);
    await flushPaste();
    expect(request).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    await flushPaste();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
