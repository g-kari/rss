import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import SingleFileSettings from "./SingleFileSettings";
import { apiFetch } from "../../lib/api-fetch";
vi.mock("../../lib/api-fetch", () => ({
  apiFetch: vi.fn(),
  tryParseErrorBody: async (res: Response) => res.json(),
}));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
const request = vi.mocked(apiFetch);
const token = { id: "id", createdAt: "2026-09-30T00:00:00Z", expiresAt: "2026-10-30T00:00:00Z" };
beforeEach(() => request.mockReset());
afterEach(cleanup);
describe("SingleFile setup", () => {
  it("loads metadata without issuing a token and documents every SingleFile field", async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ token: null })));
    render(<SingleFileSettings userId="alice" active />);
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]?.method).toBeUndefined();
    expect(request.mock.calls[0][1]?.headers).toMatchObject({ "X-RSS-Account-Id": "alice" });
    expect(screen.getByText(/archive data field name/)).toHaveTextContent("html");
    expect(screen.getByText(/archive data field name/)).toHaveTextContent("url");
    expect(screen.getByText(/HTML全体で5MiB/)).toBeInTheDocument();
    expect(screen.getByLabelText("保存先 URL")).toHaveValue(`${window.location.origin}/api/clip`);
  });
  it("requires an explicit confirm click; cancellation never issues credentials", async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ token: null })));
    render(<SingleFileSettings userId="alice" active />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "保存専用トークンを発行" }));
    expect(request).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("issues once, displays the returned secret only locally, and revokes explicitly", async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ token: null })));
    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...token, token: "test-secret-only" }), { status: 201 }),
    );
    request.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    render(<SingleFileSettings userId="alice" active />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "保存専用トークンを発行" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "発行する" })));
    expect(request.mock.calls[1][1]?.method).toBe("POST");
    expect(screen.getByLabelText(/保存専用トークン（この表示/)).toHaveValue("test-secret-only");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "トークンを失効" })));
    expect(request.mock.calls[2][1]?.method).toBe("DELETE");
    expect(screen.queryByDisplayValue("test-secret-only")).toBeNull();
  });
  it("does not load or mutate when the tab is hidden", async () => {
    render(<SingleFileSettings userId="alice" active={false} />);
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "保存専用トークンを発行" })).toBeDisabled();
  });
  it("discards a late issued secret after an account switch", async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ token: null })));
    let resolve!: (value: Response) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    request.mockResolvedValueOnce(new Response(JSON.stringify({ token: null })));
    const view = render(<SingleFileSettings userId="alice" active />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "保存専用トークンを発行" }));
    fireEvent.click(screen.getByRole("button", { name: "発行する" }));
    view.rerender(<SingleFileSettings userId="bob" active />);
    await act(async () => {
      resolve(new Response(JSON.stringify({ ...token, token: "alice-secret" })));
    });
    expect(screen.queryByDisplayValue("alice-secret")).toBeNull();
    expect(request.mock.calls[2][1]?.headers).toMatchObject({ "X-RSS-Account-Id": "bob" });
  });
  it("disables mutations after a failed load rather than treating it as no token", async () => {
    request.mockResolvedValue(new Response("{}", { status: 503 }));
    render(<SingleFileSettings userId="alice" active />);
    await act(async () => {});
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存専用トークンを発行" })).toBeDisabled();
  });
});
