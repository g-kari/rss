// @vitest-environment node
import { describe, expect, it } from "vitest";
import { prepareClipImages, restoreClipImageUrls } from "./clip-images";
import { extractMainContent } from "./content";
import { sanitizeHtml } from "./html";
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHh8AAAAASUVORK5CYII=";
const text = "This is the saved article body. ".repeat(35);
describe("SingleFile private raster images", () => {
  it("preserves an embedded PNG through the real extraction and client sanitization pipeline", async () => {
    const result = await prepareClipImages(
      `<html><body><article><h1>Saved</h1><p>${text}</p><img src="data:image/png;base64,${PNG}" width="640" height="480" onerror="alert(1)"></article></body></html>`,
    );
    expect(result.images).toHaveLength(1);
    const content = restoreClipImageUrls(
      extractMainContent(result.html, "https://example.com").content,
      result.images,
    );
    expect(sanitizeHtml(content)).toContain(`/api/clip/images/${result.images[0].id}`);
    expect(content).not.toContain("data:image");
    expect(content).not.toContain("singlefile.invalid");
    expect(content).not.toContain("onerror");
  });
  it("deduplicates repeated embedded data and removes competing srcset", async () => {
    const { html, images } = await prepareClipImages(
      `<img src="data:image/png;base64,${PNG}" srcset="data:image/png;base64,${PNG} 2x"><img src="data:image/png;base64,${PNG}">`,
    );
    expect(images).toHaveLength(1);
    expect(html).not.toContain("srcset=");
  });
  it.each([
    "data:image/svg+xml;base64,PHN2Zy8+",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/png;base64,PHN2Zy8+",
    "data:image/jpeg;base64,not-valid",
  ])("rejects unsupported or spoofed embedded image %s", async (src) => {
    await expect(prepareClipImages(`<img src="${src}">`)).rejects.toThrow();
  });
  it("rejects excessive unique images before any storage writes", async () => {
    const html = Array.from(
      { length: 129 },
      (_, index) => `<img src="data:image/png;base64,${btoa(atob(PNG) + String(index))}">`,
    ).join("");
    await expect(prepareClipImages(html)).rejects.toThrow("128");
  });
  it("does not turn unrelated placeholder URLs into private asset references", async () => {
    const { images } = await prepareClipImages(`<img src="data:image/png;base64,${PNG}">`);
    const forged = '<img src="https://singlefile.invalid/' + "a".repeat(64) + '">';
    expect(restoreClipImageUrls(forged, images)).toBe(forged);
  });
});
