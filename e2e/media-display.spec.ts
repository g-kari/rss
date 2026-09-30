import { test, expect } from "@playwright/test";
import { sanitizeSvgImage, SVG_IMAGE_RESPONSE_HEADERS } from "../src/lib/svg-image";
import { processContent } from "../src/lib/embed-utils";

test("sanitized external SVG paints while active content cannot run or fetch", async ({
  page,
}, testInfo) => {
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180" onload="alert('unsafe')">
    <script>alert('unsafe')</script><image href="https://evil.example/track"/>
    <defs><linearGradient id="g"><stop offset="0" stop-color="navy"/><stop offset="1" stop-color="teal"/></linearGradient></defs>
    <rect width="320" height="180" rx="12" fill="url(#g)"/>
    <text x="160" y="95" text-anchor="middle" fill="white" font-size="30">SVG diagram</text></svg>`;
  const svg = sanitizeSvgImage(new TextEncoder().encode(source))!;
  const unexpected: string[] = [];
  page.on("dialog", (dialog) => {
    unexpected.push(dialog.message());
    void dialog.dismiss();
  });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url === "https://rss.example.test/fixture") {
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><img alt="SVG diagram" src="/logo.svg">',
      });
    }
    if (url === "https://rss.example.test/logo.svg") {
      return route.fulfill({
        body: Buffer.from(svg),
        headers: {
          "Content-Type": "image/svg+xml",
          "X-Content-Type-Options": "nosniff",
          ...SVG_IMAGE_RESPONSE_HEADERS,
        },
      });
    }
    unexpected.push(url);
    return route.abort();
  });
  await page.goto("https://rss.example.test/fixture");
  const image = page.getByRole("img", { name: "SVG diagram" });
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBe(320);
  expect(unexpected).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("sanitized-svg.png") });
});

test("the observed lazy YouTube markup loads a visible frame with the corrected URL", async ({
  page,
}) => {
  const html = processContent(
    '<iframe title="NAMED" width="840" height="473" data-src="https://www.youtube.com/embed/T-TuEmg8MIo?feature=oembed" src="data:image/gif;base64,AA==" style="display:none" referrerpolicy="no-referrer"></iframe>',
  );
  let loaded = "";
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url === "https://rss.example.test/fixture")
      return route.fulfill({ contentType: "text/html", body: `<!doctype html>${html}` });
    if (url.startsWith("https://www.youtube.com/embed/T-TuEmg8MIo?")) {
      loaded = url;
      return route.fulfill({ contentType: "text/html", body: "<p>Mock video player ready</p>" });
    }
    return route.abort();
  });
  await page.goto("https://rss.example.test/fixture");
  const iframe = page.locator("iframe");
  await expect(iframe).toBeVisible();
  await expect(page.frameLocator("iframe").getByText("Mock video player ready")).toBeVisible();
  expect(new URL(loaded).searchParams.get("origin")).toBe("https://rss.0g0.xyz");
  await expect(iframe).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  await expect(page.getByRole("link", { name: "YouTube で見る ↗" })).toBeVisible();
});
