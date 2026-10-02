import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ArticleThumbnail } from "./shared";
import { buildImageProxyUrl } from "../../lib/image-proxy-url";
afterEach(cleanup);
const bad = "https://example.com/bad.jpg";
const good = "https://example.com/good.jpg";
it("attempts the raw/proxy-equivalent candidate once and settles on the shared placeholder after failures", () => {
  const { container, rerender } = render(
    <ArticleThumbnail thumb={bad} fallbacks={[buildImageProxyUrl(bad), good]} className="image" />,
  );
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")).toHaveAttribute("src", buildImageProxyUrl(good));
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")).toBeNull();
  rerender(<ArticleThumbnail thumb={bad} fallbacks={[good]} className="image" />);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg")).not.toBeNull();
});
it("keeps a loaded fallback stable when late OGP metadata arrives", () => {
  const { container, rerender } = render(<ArticleThumbnail thumb={good} className="image" />);
  fireEvent.load(container.querySelector("img")!);
  rerender(<ArticleThumbnail thumb={bad} fallbacks={[good]} className="image" />);
  expect(container.querySelector("img")).toHaveAttribute("src", buildImageProxyUrl(good));
});
