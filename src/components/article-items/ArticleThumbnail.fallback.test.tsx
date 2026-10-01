import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ArticleThumbnail } from "./shared";
afterEach(cleanup);
it("tries a finite candidate list and does not let a failed old image poison a newly resolved image", () => {
  const { container, rerender } = render(
    <ArticleThumbnail
      thumb="https://example.com/og.jpg"
      fallbacks={["https://example.com/body.jpg"]}
      className="thumb"
    />,
  );
  let image = container.querySelector("img")!;
  expect(image.src).toContain("og.jpg");
  fireEvent.error(image);
  image = container.querySelector("img")!;
  expect(image.src).toContain("body.jpg");
  fireEvent.error(image);
  expect(container.querySelector("img")).toBeNull();
  rerender(<ArticleThumbnail thumb="https://example.com/fresh.jpg" className="thumb" />);
  expect(container.querySelector("img")!.src).toContain("fresh.jpg");
});
