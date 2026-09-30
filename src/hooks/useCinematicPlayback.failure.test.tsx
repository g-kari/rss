import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { devError } from "../lib/dev-log";
import { useCinematicPlayback } from "./useCinematicPlayback";

// A separate module boundary avoids replacing an already fulfilled dynamic-import cache.
vi.mock("animejs/timeline", () => {
  throw new Error("Chunk unavailable");
});
vi.mock("../lib/dev-log", () => ({ devError: vi.fn() }));
afterEach(cleanup);

it("keeps static content available when the lazy animation chunk fails to load", async () => {
  const imageRef = { current: document.createElement("div") };
  const { result } = renderHook(() => useCinematicPlayback(imageRef, true, true));
  expect(result.current.failed).toBe(false);
  act(() => result.current.toggle());
  await waitFor(() => expect(result.current.failed).toBe(true));
  expect(result.current.playing).toBe(false);
  expect(result.current.elapsed).toBe(0);
  expect(devError).toHaveBeenCalledWith("[cinematic] Animation unavailable", expect.any(Error));
  act(() => result.current.toggle());
  expect(result.current.playing).toBe(false);
});
