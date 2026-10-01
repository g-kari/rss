import { describe, expect, it } from "vitest";
import { makeArticle } from "../../e2e/helpers/article";
import { immersiveCaptions, immersiveVideoSource } from "./immersive-articles";

describe("immersive captions", () => {
  it("keeps each caption to at most two short sentences", () => {
    expect(
      immersiveCaptions(makeArticle({ title: "見出し", summary: "一文。二文。三文。四文。" })),
    ).toEqual(["見出し", "一文。二文。", "三文。四文。"]);
  });
  it("keeps whole sentences, decimal numbers and Unicode rather than cutting at 44 characters", () => {
    const title = "ニュースです。";
    const text = "大きな字幕。次の文です！" + "🎮あ".repeat(50);
    const captions = immersiveCaptions(makeArticle({ title, summary: `<p>${text}</p>` }));
    expect(captions[0]).toBe(title);
    expect(captions.join("")).toBe(title + text);
    expect(captions.every((caption) => !/[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/u.test(caption))).toBe(
      true,
    );
  });
  it("does not cut a Japanese sentence at a decimal or arbitrary character boundary", () => {
    const text =
      "日本コロムビアは1日、YouTubeチャンネル登録者数11.5万人を超えたクリエイターの新しい活動について発表しました。";
    expect(immersiveCaptions(makeArticle({ title: "見出し", summary: text }))).toEqual([
      "見出し",
      text,
    ]);
  });
  it("uses loaded body paragraphs instead of the short feed summary", () => {
    const content = "段落の本文です。".repeat(60);
    expect(
      immersiveCaptions(makeArticle({ title: "見出し", summary: "短い説明", content })).join(""),
    ).toBe("見出し" + content);
  });
});
describe("immersive native video", () => {
  it("uses existing native video, child sources and proxy values without double wrapping", () => {
    const url = "https://example.com/movie.mp4?a=1&b=2&c=3";
    const proxy = `/api/video-proxy?url=${encodeURIComponent(url)}`;
    for (const content of [
      `<video src="${url.replaceAll("&", "&amp;")}"></video>`,
      `<video><source src="${url}"></video>`,
      `<video src="${proxy}"></video>`,
    ]) {
      expect(immersiveVideoSource(makeArticle({ content }))).toBe(proxy);
    }
    expect(immersiveVideoSource(makeArticle({ link: url }))).toBe(proxy);
  });
  it.each([
    "javascript:alert(1)",
    "data:video/mp4,x",
    "https://127.0.0.1/v.mp4",
    "/api/feeds",
    "/api/video-proxy?url=http%3A%2F%2Flocalhost%2Fv.mp4",
  ])("rejects unsafe video source %s", (src) => {
    expect(
      immersiveVideoSource(makeArticle({ content: `<video src="${src}"></video>` })),
    ).toBeUndefined();
  });
  it("does not take audio/source tags, data-src or arbitrary iframes as videos", () => {
    for (const content of [
      '<source src="https://example.com/movie.mp4">',
      '<audio><source src="https://example.com/movie.mp4"></audio>',
      '<video data-src="https://example.com/movie.mp4"></video>',
      '<iframe src="https://evil.example/movie.mp4"></iframe>',
    ])
      expect(immersiveVideoSource(makeArticle({ content }))).toBeUndefined();
  });
});
